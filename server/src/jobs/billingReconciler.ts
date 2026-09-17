import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import pool, { updateSubscriptionByPreapprovalId, recordBillingEvent } from '../db.js';

const RECONCILE_INTERVAL_MS = 15 * 60_000; // 15 minutes
const TRIAL_CHECK_INTERVAL_MS = 60_000; // 1 minute
const PAGE_SIZE = 50;

function getMercadoPagoClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

/**
 * Reconcile subscription statuses with Mercado Pago.
 * Catches status changes that were missed by webhooks (e.g., paused, cancelled).
 * Also expires trials that have passed their trial_ends_at.
 *
 * Pagination: rows are ordered by last_reconciled_at (oldest/never first) and
 * each checked row gets a fresh timestamp — so every cycle makes progress and
 * eventually scans ALL subscriptions, not just the same first 50.
 */
export function startBillingReconciler() {
  console.log('💳 Billing reconciler started (15min interval)');

  const reconcile = async () => {
    try {
      // 1. Expire trials that have passed their end date
      await expireTrials();

      // 2. Expire cancelled/paused subs whose contracted period has ended
      await expireEndedPeriods();

      // 3. Reconcile MP subscription statuses
      const client = getMercadoPagoClient();
      if (!client) return;

      const result = await pool.query(
        `SELECT s."id", s."mp_preapproval_id", s."user_id", s."status",
                s."current_period_start", s."current_period_end"
         FROM "subscriptions" s
         WHERE s."status" IN ('authorized', 'active', 'pending', 'paused')
           AND s."mp_preapproval_id" IS NOT NULL
           AND s."mp_preapproval_id" NOT LIKE 'trial_%'
         ORDER BY s."last_reconciled_at" ASC NULLS FIRST
         LIMIT $1`,
        [PAGE_SIZE]
      );

      for (const row of result.rows) {
        try {
          const preapproval = new PreApproval(client);
          const details = await preapproval.get({ id: row.mp_preapproval_id });

          if (details.id && details.status) {
            let periodStart: Date | undefined;
            let periodEnd: Date | undefined;
            if (details.next_payment_date) {
              periodEnd = new Date(details.next_payment_date);
              periodStart = new Date(periodEnd);
              periodStart.setMonth(periodStart.getMonth() - 1);
            }

            const statusChanged = details.status !== row.status;
            const periodChanged =
              (periodEnd && (!row.current_period_end || new Date(row.current_period_end).getTime() !== periodEnd.getTime()));

            // Update the row whenever status OR the billed period moved —
            // renewals push next_payment_date forward without a status change.
            if (statusChanged || periodChanged) {
              await updateSubscriptionByPreapprovalId(details.id, details.status, periodStart, periodEnd);
              await recordBillingEvent(row.user_id, details.id,
                statusChanged ? 'reconciliation_status_update' : 'reconciliation_period_update',
                details.status, undefined, {
                  previous_status: row.status,
                  next_payment_date: details.next_payment_date,
                });
              console.log(`[billingReconciler] ${details.id}: ${row.status} → ${details.status}${periodChanged ? ' (period updated)' : ''}`);
            }
          }

          // Stamp the check regardless of outcome so the cursor advances.
          await pool.query(
            `UPDATE "subscriptions" SET "last_reconciled_at" = CURRENT_TIMESTAMP WHERE "id" = $1`,
            [row.id]
          );
        } catch (err) {
          // Skip individual failures (e.g., MP rate limit) but still advance
          // the cursor so one bad record can't block the whole scan.
          await pool.query(
            `UPDATE "subscriptions" SET "last_reconciled_at" = CURRENT_TIMESTAMP WHERE "id" = $1`,
            [row.id]
          );
          console.error(`[billingReconciler] Failed to reconcile ${row.mp_preapproval_id}:`, err);
        }
      }
    } catch (error) {
      console.error('[billingReconciler] Fatal error:', error);
    }
  };

  reconcile();
  setInterval(reconcile, RECONCILE_INTERVAL_MS);
  setInterval(expireTrials, TRIAL_CHECK_INTERVAL_MS);
}

async function expireTrials() {
  try {
    const result = await pool.query(
      `UPDATE "subscriptions" SET "status" = 'trial_expired', "updated_at" = CURRENT_TIMESTAMP
       WHERE "status" = 'trialing'
         AND "trial_ends_at" IS NOT NULL
         AND "trial_ends_at" < CURRENT_TIMESTAMP
       RETURNING "user_id", "mp_preapproval_id", "plan_id"`
    );

    for (const row of result.rows) {
      await recordBillingEvent(row.user_id, row.mp_preapproval_id, 'trial_expired', 'trial_expired', undefined, {
        plan_id: row.plan_id,
      });
      console.log(`[billingReconciler] Trial expired for user ${row.user_id}`);
    }
  } catch (error) {
    console.error('[billingReconciler] Failed to expire trials:', error);
  }
}

/**
 * Mark subscriptions whose contracted access period has fully ended.
 * 'cancelled' rows keep access until current_period_end; after that they are
 * 'expired' (no entitlement, preserved for audit).
 */
async function expireEndedPeriods() {
  try {
    const result = await pool.query(
      `UPDATE "subscriptions" SET "status" = 'expired', "updated_at" = CURRENT_TIMESTAMP
       WHERE "status" = 'cancelled'
         AND "current_period_end" IS NOT NULL
         AND "current_period_end" < CURRENT_TIMESTAMP
       RETURNING "user_id", "mp_preapproval_id"`
    );

    for (const row of result.rows) {
      await recordBillingEvent(row.user_id, row.mp_preapproval_id, 'subscription_expired', 'expired');
      console.log(`[billingReconciler] Access period ended for subscription ${row.mp_preapproval_id}`);
    }
  } catch (error) {
    console.error('[billingReconciler] Failed to expire ended periods:', error);
  }
}
