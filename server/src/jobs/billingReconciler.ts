import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import pool, { getSubscriptionByPreapprovalId, updateSubscriptionByPreapprovalId, recordBillingEvent } from '../db.js';

const RECONCILE_INTERVAL_MS = 15 * 60_000; // 15 minutes
const TRIAL_CHECK_INTERVAL_MS = 60_000; // 1 minute

function getMercadoPagoClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  return new MercadoPagoConfig({ accessToken });
}

/**
 * Reconcile subscription statuses with Mercado Pago.
 * Catches status changes that were missed by webhooks (e.g., paused, cancelled).
 * Also expires trials that have passed their trial_ends_at.
 */
export function startBillingReconciler() {
  console.log('💳 Billing reconciler started (15min interval)');

  const reconcile = async () => {
    try {
      // 1. Expire trials that have passed their end date
      await expireTrials();

      // 2. Reconcile MP subscription statuses
      const client = getMercadoPagoClient();
      if (!client) return;

      const result = await pool.query(
        `SELECT s."mp_preapproval_id", s."user_id", s."status"
         FROM "subscriptions" s
         WHERE s."status" IN ('authorized', 'active', 'pending', 'paused')
           AND s."mp_preapproval_id" IS NOT NULL
           AND s."mp_preapproval_id" NOT LIKE 'trial_%'
         ORDER BY s."updated_at" ASC
         LIMIT 50`
      );

      for (const row of result.rows) {
        try {
          const preapproval = new PreApproval(client);
          const details = await preapproval.get({ id: row.mp_preapproval_id });

          if (details.id && details.status && details.status !== row.status) {
            let periodStart: Date | undefined;
            let periodEnd: Date | undefined;
            if (details.next_payment_date) {
              periodEnd = new Date(details.next_payment_date);
              periodStart = new Date(periodEnd);
              periodStart.setMonth(periodStart.getMonth() - 1);
            }

            await updateSubscriptionByPreapprovalId(details.id, details.status, periodStart, periodEnd);
            await recordBillingEvent(row.user_id, details.id, 'reconciliation_status_update', details.status, undefined, {
              previous_status: row.status,
            });
            console.log(`[billingReconciler] ${details.id}: ${row.status} → ${details.status}`);
          }
        } catch (err) {
          // Skip individual failures (e.g., MP rate limit)
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
