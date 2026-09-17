import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import {
  findOrCreateUser,
  getUserByMlId,
  getActiveSubscription,
  getEntitledSubscription,
  createSubscription,
  updateSubscriptionByPreapprovalId,
  getSubscriptionByPreapprovalId,
  isFreeAccessEmail,
  recordWebhookEvent,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  recordBillingEvent,
  hasUsedTrial,
  markTrialUsed,
  startCheckoutSession,
  completeCheckoutSession,
  failCheckoutSession,
  retryCheckoutSession
} from '../db.js';
import pool from '../db.js';
import { isValidWebhookSignature } from '../services/webhookSignature.js';
import { getPlan, getPriceForPlan, getAssignedVariantPrice, linkAssignmentToUser } from '../services/pricing.js';
import { trackEvent, markReferralSubscribed } from '../services/analytics.js';

const router = Router();

const TRIAL_DAYS = 7;
const TRIAL_PLAN_ID = 'pro';
const MP_API_URL = 'https://api.mercadopago.com';

function getMercadoPagoClient() {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('MP_ACCESS_TOKEN not configured');
  }
  return new MercadoPagoConfig({ accessToken });
}

// Get subscription status for current user
router.get('/status', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Check if user has free lifetime access
    const userEmail = req.session.userEmail?.toLowerCase();
    if (userEmail && await isFreeAccessEmail(userEmail)) {
      return res.json({
        hasSubscription: true,
        status: 'authorized',
        currentPeriodEnd: null,
        planId: 'pro',
        planName: 'LabelGo Pro - Vitalício',
        price: 0,
        isFreeAccess: true,
        autoPrint: true,
        canTrial: false
      });
    }

    const user = await getUserByMlId(req.session.userId);

    if (!user) {
      return res.json({ hasSubscription: false, status: null, canTrial: true });
    }

    const subscription = await getEntitledSubscription(user.id);
    const canTrial = !(await hasUsedTrial(user.id));

    if (!subscription) {
      // Any past subscription at all? Distinguish "never subscribed" from
      // "had a subscription that ended" for clearer UI states.
      return res.json({ hasSubscription: false, status: null, canTrial });
    }

    const plan = subscription.plan_id ? await getPlan(subscription.plan_id) : null;
    const planName = plan?.name || 'LabelGo Pro';

    const trialEndsAt = subscription.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
    const trialDaysRemaining = subscription.status === 'trialing' && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000))
      : null;

    res.json({
      hasSubscription: true,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      // For cancelled subs still inside the paid period, the access deadline
      // is the period end.
      accessUntil: subscription.status === 'cancelled' ? subscription.current_period_end : null,
      trialEndsAt: subscription.trial_ends_at,
      trialDaysRemaining,
      planId: subscription.plan_id,
      planName,
      price: Number(subscription.contracted_amount || subscription.price) || 0,
      autoPrint: plan?.auto_print ?? false,
      canTrial
    });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

// Create checkout for subscription (paid or trial)
router.post('/checkout', async (req: Request, res: Response) => {
  if (!req.session.userId || !req.session.userNickname) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const planId = (req.body?.planId as string) || 'pro';
    const startTrial = req.body?.trial === true;
    const visitorKey = (req.body?.visitorKey as string) || '';

    // Look up plan and price from DB (no hardcoded prices)
    const plan = await getPlan(planId);
    if (!plan || !plan.is_active) {
      return res.status(400).json({ error: 'Plano inválido ou indisponível' });
    }

    // Price consistency: charge the variant the visitor was assigned in the
    // catalog (pricing experiments), falling back to the standard price.
    const price = visitorKey
      ? (await getAssignedVariantPrice(planId, visitorKey)) ?? await getPriceForPlan(planId, 'monthly')
      : await getPriceForPlan(planId, 'monthly');
    if (!price) {
      return res.status(400).json({ error: 'Preço não encontrado para este plano' });
    }

    // Create or get user in our database
    const user = await findOrCreateUser(
      req.session.userId,
      req.session.userNickname
    );

    // Attach the visitor's pricing assignment (if any) to their account.
    if (visitorKey) {
      await linkAssignmentToUser(visitorKey, user.id).catch(() => {});
    }

    // Trial: one per account, ever — including after cancel or expiration.
    if (startTrial && planId === TRIAL_PLAN_ID) {
      if (await hasUsedTrial(user.id)) {
        return res.status(400).json({ error: 'trial_already_used', message: 'O período de teste já foi utilizado nesta conta.' });
      }
      if (await getActiveSubscription(user.id)) {
        return res.status(400).json({ error: 'Você já possui uma assinatura ativa' });
      }

      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

      // The idempotency key makes concurrent/repeated trial requests safe:
      // the second insert hits the unique index on subscriptions.idempotency_key.
      let trialSub;
      try {
        trialSub = await createSubscription(user.id, `trial_${user.id}_${Date.now()}`, undefined, {
          planId,
          priceId: price.id,
          contractedAmount: price.amount,
          contractedCurrency: price.currency,
          trialEndsAt,
          idempotencyKey: `trial_u${user.id}`,
        });
      } catch (err: any) {
        if (err.code === '23505') {
          return res.status(400).json({ error: 'trial_already_used', message: 'O período de teste já foi utilizado nesta conta.' });
        }
        throw err;
      }

      await updateSubscriptionByPreapprovalId(trialSub.mp_preapproval_id, 'trialing', new Date(), trialEndsAt);
      await markTrialUsed(user.id);

      await recordBillingEvent(user.id, trialSub.mp_preapproval_id, 'trial_started', 'trialing', undefined, {
        plan_id: planId,
        trial_ends_at: trialEndsAt.toISOString(),
      });
      await trackEvent({ event_name: 'trial_started', user_id: user.id, visitor_key: visitorKey || undefined, properties: { plan_id: planId } });

      return res.json({
        trial: true,
        trialEndsAt: trialEndsAt.toISOString(),
        planId,
        planName: plan.name,
        price: price.amount
      });
    }

    // Paid checkout. Blocked only by an already-active billing subscription;
    // a trialing user may convert to paid at any point.
    const existingSubscription = await getActiveSubscription(user.id);
    if (existingSubscription && existingSubscription.status !== 'trialing') {
      return res.status(400).json({
        error: 'Você já possui uma assinatura ativa',
        subscription: existingSubscription
      });
    }

    // Persistent idempotency: the checkout_sessions row is written BEFORE
    // calling Mercado Pago. Concurrent requests hit the unique constraint;
    // a completed session replays its checkout URL; a failed one retries.
    const clientKey = (req.body?.idempotencyKey as string | undefined)?.slice(0, 200);
    const idempotencyKey = clientKey || `${planId}:${new Date().toISOString().slice(0, 10)}`;

    const started = await startCheckoutSession(user.id, idempotencyKey, planId, price.id, price.amount, price.currency);
    let session = started.session!;

    if (!started.created) {
      if (session.status === 'completed' && session.checkout_url) {
        return res.json({
          checkoutUrl: session.checkout_url,
          preapprovalId: session.preapproval_id,
          planId,
          planName: plan.name,
          price: price.amount,
          replayed: true
        });
      }
      if (session.status === 'processing') {
        return res.status(409).json({ error: 'checkout_in_progress', message: 'Checkout em andamento. Aguarde e tente novamente.' });
      }
      // status === 'failed' → reopen and retry with the same key
      await retryCheckoutSession(session.id);
    }

    const backUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Record checkout_started event
    await recordBillingEvent(user.id, null, 'checkout_started', undefined, price.amount, {
      plan_id: planId,
      price_id: price.id,
      checkout_key: idempotencyKey,
      experiment_variant_id: (price as any).experiment_variant_id,
    });
    await trackEvent({ event_name: 'checkout_started', user_id: user.id, visitor_key: visitorKey || undefined, properties: { plan_id: planId, amount: price.amount } });

    // NOTE: Mercado Pago's PreApproval API does not accept a per-request
    // notification_url (unlike Payments/Preferences). For subscriptions,
    // the webhook URL must be configured once in the Mercado Pago
    // Developer Panel: App > Webhooks > "Assinaturas" (preapproval) topic,
    // pointing to `${FRONTEND_URL}/api/subscription/webhook`.
    try {
      const response = await preapproval_create(
        getMercadoPagoClient(),
        plan.name + ' - Mensal',
        price.amount,
        price.currency,
        `${backUrl}/subscription/callback`,
        req.body.email || req.session.userEmail || undefined,
        `user_${user.id}_${session.id}`
      );

      if (!response.id || !response.init_point) {
        throw new Error('Invalid response from Mercado Pago');
      }

      // Save subscription reference with plan + contracted price.
      // idempotencyKey is user-scoped+unique so a replayed checkout never
      // duplicates the subscription row.
      await createSubscription(user.id, response.id, undefined, {
        planId,
        priceId: price.id,
        contractedAmount: price.amount,
        contractedCurrency: price.currency,
        idempotencyKey: `chk_u${user.id}_${idempotencyKey}`,
      });

      await completeCheckoutSession(session.id, response.id, response.init_point);

      return res.json({
        checkoutUrl: response.init_point,
        preapprovalId: response.id,
        planId,
        planName: plan.name,
        price: price.amount
      });
    } catch (err) {
      await failCheckoutSession(session.id, err instanceof Error ? err.message : String(err));
      throw err;
    }
  } catch (error) {
    console.error('Error creating checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

// Helper: create preapproval via MP SDK (extracted for testability)
async function preapproval_create(
  client: MercadoPagoConfig,
  reason: string,
  amount: number,
  currency: string,
  backUrl: string,
  payerEmail: string | undefined,
  externalReference: string
) {
  const preapproval = new PreApproval(client);
  return preapproval.create({
    body: {
      reason,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: currency
      },
      back_url: backUrl,
      payer_email: payerEmail || undefined,
      external_reference: externalReference
    }
  });
}

/** GET /authorized_payments/{id} — SDK has no class for it; call REST directly. */
async function getAuthorizedPayment(authorizedPaymentId: string | number) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN not configured');
  const resp = await fetch(`${MP_API_URL}/authorized_payments/${authorizedPaymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!resp.ok) {
    throw new Error(`authorized_payment ${authorizedPaymentId} fetch failed: ${resp.status}`);
  }
  return resp.json() as Promise<{
    id: number;
    preapproval_id: string;
    status: string;
    transaction_amount?: number;
    payment?: { id?: number; status?: string };
  }>;
}

/** Sync our subscription row from the MP preapproval resource. */
async function syncSubscriptionFromPreapproval(preapprovalId: string) {
  const client = getMercadoPagoClient();
  const preapproval = new PreApproval(client);
  const details = await preapproval.get({ id: preapprovalId });
  if (!details.id) return null;

  const status = details.status || 'pending';
  let periodStart: Date | undefined;
  let periodEnd: Date | undefined;

  if (details.next_payment_date) {
    periodEnd = new Date(details.next_payment_date);
    periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
  }

  const updated = await updateSubscriptionByPreapprovalId(details.id, status, periodStart, periodEnd);
  const sub = updated ?? await getSubscriptionByPreapprovalId(details.id);

  await recordBillingEvent(
    sub?.user_id ?? null,
    details.id,
    'webhook_status_update',
    status,
    undefined,
    { next_payment_date: details.next_payment_date }
  );

  if (status === 'authorized' && sub?.user_id) {
    await recordBillingEvent(sub.user_id, details.id, 'subscription_activated', status, undefined, {
      plan_id: sub.plan_id,
    });
    await trackEvent({ event_name: 'subscription_activated', user_id: sub.user_id, properties: { plan_id: sub.plan_id } });
    await markReferralSubscribed(sub.user_id).catch(() => {});
    // Trial → paid conversion: close the still-running trial so the user is
    // billed from now on (remaining trial days are forfeited).
    const trialing = await pool.query(
      `SELECT * FROM "subscriptions" WHERE "user_id" = $1 AND "status" = 'trialing' LIMIT 1`,
      [sub.user_id]
    );
    if (trialing.rows[0]) {
      await updateSubscriptionByPreapprovalId(trialing.rows[0].mp_preapproval_id, 'converted');
      await recordBillingEvent(sub.user_id, trialing.rows[0].mp_preapproval_id, 'trial_converted', 'converted', undefined, {
        plan_id: trialing.rows[0].plan_id,
        converted_to: details.id,
      });
    }
  }

  if (status === 'cancelled' && sub?.user_id) {
    await recordBillingEvent(sub.user_id, details.id, 'subscription_cancelled', status, undefined, {
      plan_id: sub.plan_id,
    });
    await trackEvent({ event_name: 'subscription_cancelled', user_id: sub.user_id, properties: { plan_id: sub.plan_id } });
  }

  return sub;
}

/**
 * Webhook to receive payment notifications from Mercado Pago.
 * Current event types (per MP docs): subscription_preapproval,
 * subscription_preapproval_plan, subscription_authorized_payment, payment.
 * We also accept the legacy 'preapproval' type.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    if (!isValidWebhookSignature(req)) {
      console.error('Webhook rejected: invalid signature');
      return res.sendStatus(401);
    }

    const { type, data } = req.body || {};

    // Dedup per NOTIFICATION (MP assigns each delivery a unique body.id).
    // Different events about the same subscription are all processed;
    // retried deliveries of the same notification are skipped — unless the
    // previous processing failed, in which case we retry instead of losing
    // the event.
    const notificationId = req.body?.id;
    const eventKey = notificationId
      ? `mp_notif_${notificationId}`
      : `mp_hash_${crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex').slice(0, 32)}`;

    const record = await recordWebhookEvent('mercado_pago', eventKey, req.body);
    if (record === 'duplicate') {
      return res.sendStatus(200);
    }

    try {
      if ((type === 'subscription_preapproval' || type === 'preapproval') && data?.id) {
        await syncSubscriptionFromPreapproval(String(data.id));
      } else if (type === 'subscription_authorized_payment' && data?.id) {
        const payment = await getAuthorizedPayment(data.id);
        if (payment.preapproval_id) {
          // Refresh period/status from the preapproval, then record the
          // payment outcome (processed = renewal paid, etc.)
          await syncSubscriptionFromPreapproval(payment.preapproval_id);
          const sub = await getSubscriptionByPreapprovalId(payment.preapproval_id);
          await recordBillingEvent(
            sub?.user_id ?? null,
            payment.preapproval_id,
            payment.status === 'processed' ? 'payment_received' : 'payment_status',
            payment.status,
            payment.transaction_amount,
            { authorized_payment_id: data.id, payment_status: payment.payment?.status }
          );
        }
      } else if (type === 'payment' && data?.id) {
        // Audit trail only — subscription renewals arrive via
        // subscription_authorized_payment; standalone payments are logged.
        await recordBillingEvent(null, null, 'webhook_payment', undefined, undefined, {
          payment_id: data.id,
        });
      } else {
        console.log('Webhook received (unhandled type):', { type, data });
      }

      await markWebhookEventProcessed('mercado_pago', eventKey);
    } catch (processingError) {
      // Keep the event marked failed so a retried delivery reprocesses
      // instead of being deduplicated away. Return 503 so Mercado Pago
      // actually retries — it only redelivers on non-2xx responses.
      await markWebhookEventFailed(
        'mercado_pago',
        eventKey,
        processingError instanceof Error ? processingError.message : String(processingError)
      );
      console.error('Webhook processing failed (MP will redeliver):', processingError);
      return res.sendStatus(503);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(200); // Always return 200 to avoid retries
  }
});

// Cancel subscription
router.post('/cancel', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await getUserByMlId(req.session.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const subscription = await getActiveSubscription(user.id);
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // If it's a trial, just cancel in DB (no MP call needed)
    if (subscription.status === 'trialing' || subscription.mp_preapproval_id?.startsWith('trial_')) {
      await updateSubscriptionByPreapprovalId(subscription.mp_preapproval_id, 'cancelled');
      await recordBillingEvent(user.id, subscription.mp_preapproval_id, 'subscription_cancelled', 'cancelled', undefined, {
        plan_id: subscription.plan_id,
      });
      return res.json({ success: true, message: 'Trial cancelado com sucesso' });
    }

    const client = getMercadoPagoClient();
    const preapproval = new PreApproval(client);

    // Cancel in Mercado Pago
    await preapproval.update({
      id: subscription.mp_preapproval_id,
      body: { status: 'cancelled' }
    });

    // Update in our database. current_period_end stays as-is: access is kept
    // until the end of the contracted period (enforced by entitlement checks).
    await updateSubscriptionByPreapprovalId(
      subscription.mp_preapproval_id,
      'cancelled'
    );

    await recordBillingEvent(user.id, subscription.mp_preapproval_id, 'subscription_cancelled', 'cancelled', undefined, {
      plan_id: subscription.plan_id,
    });
    await trackEvent({ event_name: 'subscription_cancelled', user_id: user.id, properties: { plan_id: subscription.plan_id } });

    res.json({ success: true, message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
