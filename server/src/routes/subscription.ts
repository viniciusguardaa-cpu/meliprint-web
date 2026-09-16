import { Router, Request, Response } from 'express';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import {
  findOrCreateUser,
  getUserByMlId,
  getActiveSubscription,
  createSubscription,
  updateSubscriptionByPreapprovalId,
  getSubscriptionByPreapprovalId,
  isFreeAccessEmail,
  recordWebhookEventIfNew,
  recordBillingEvent
} from '../db.js';
import { isValidWebhookSignature } from '../services/webhookSignature.js';
import { getPlan, getPriceForPlan, planHasAutoPrint } from '../services/pricing.js';

const router = Router();

const TRIAL_DAYS = 7;
const TRIAL_PLAN_ID = 'pro';

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
        planName: 'Printly Pro - Vitalício',
        price: 0,
        isFreeAccess: true,
        autoPrint: true
      });
    }

    const user = await getUserByMlId(req.session.userId);
    
    if (!user) {
      return res.json({ hasSubscription: false, status: null });
    }

    const subscription = await getActiveSubscription(user.id);
    
    if (!subscription) {
      return res.json({ hasSubscription: false, status: null });
    }

    // Check if trial has expired
    if (subscription.status === 'trialing' && subscription.trial_ends_at) {
      if (new Date(subscription.trial_ends_at) < new Date()) {
        return res.json({
          hasSubscription: false,
          status: 'trial_expired',
          planId: subscription.plan_id,
          planName: 'Trial expirado',
          price: Number(subscription.contracted_amount) || 0
        });
      }
    }

    // Get plan info from DB
    const plan = subscription.plan_id ? await getPlan(subscription.plan_id) : null;
    const planName = plan?.name || 'Printly Pro';

    res.json({
      hasSubscription: true,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      trialEndsAt: subscription.trial_ends_at,
      planId: subscription.plan_id,
      planName,
      price: Number(subscription.contracted_amount || subscription.price) || 0,
      autoPrint: plan?.auto_print ?? false
    });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

// Create checkout for subscription
router.post('/checkout', async (req: Request, res: Response) => {
  if (!req.session.userId || !req.session.userNickname) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const planId = (req.body?.planId as string) || 'pro';
    const startTrial = req.body?.trial === true;

    // Look up plan and price from DB (no hardcoded prices)
    const plan = await getPlan(planId);
    if (!plan || !plan.is_active) {
      return res.status(400).json({ error: 'Plano inválido ou indisponível' });
    }

    const price = await getPriceForPlan(planId, 'monthly');
    if (!price) {
      return res.status(400).json({ error: 'Preço não encontrado para este plano' });
    }

    // Create or get user in our database
    const user = await findOrCreateUser(
      req.session.userId,
      req.session.userNickname
    );

    // Check if user already has active subscription
    const existingSubscription = await getActiveSubscription(user.id);
    if (existingSubscription) {
      return res.status(400).json({ 
        error: 'Você já possui uma assinatura ativa',
        subscription: existingSubscription
      });
    }

    // Idempotency: check if a checkout was already started with the same key
    const idempotencyKey = req.body?.idempotencyKey as string | undefined;
    if (idempotencyKey) {
      const existing = await getSubscriptionByPreapprovalId(idempotencyKey);
      if (existing) {
        // Already created — return the existing checkout URL if available
        // (In practice MP returns a new init_point each time, but we prevent
        // duplicate subscription rows.)
        return res.status(409).json({ error: 'Checkout já iniciado', preapprovalId: idempotencyKey });
      }
    }

    const backUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Record checkout_started event
    await recordBillingEvent(user.id, null, 'checkout_started', undefined, price.amount, {
      plan_id: planId,
      price_id: price.id,
    });

    if (startTrial && planId === TRIAL_PLAN_ID) {
      // Create a trial subscription (no MP checkout needed, no card required).
      // The trial grants full Pro access for TRIAL_DAYS days.
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

      const trialPreapprovalId = `trial_${user.id}_${Date.now()}`;
      const subscription = await createSubscription(user.id, trialPreapprovalId, undefined, {
        planId,
        priceId: price.id,
        contractedAmount: price.amount,
        contractedCurrency: price.currency,
        trialEndsAt,
        idempotencyKey: idempotencyKey || trialPreapprovalId,
      });

      // Update status to trialing
      await updateSubscriptionByPreapprovalId(trialPreapprovalId, 'trialing', new Date(), trialEndsAt);

      await recordBillingEvent(user.id, trialPreapprovalId, 'trial_started', 'trialing', undefined, {
        plan_id: planId,
        trial_ends_at: trialEndsAt.toISOString(),
      });

      return res.json({
        trial: true,
        trialEndsAt: trialEndsAt.toISOString(),
        planId,
        planName: plan.name,
        price: price.amount
      });
    }

    // NOTE: Mercado Pago's PreApproval API does not accept a per-request
    // notification_url (unlike Payments/Preferences). For subscriptions,
    // the webhook URL must be configured once in the Mercado Pago
    // Developer Panel: App > Webhooks > "Assinaturas" (preapproval) topic,
    // pointing to `${FRONTEND_URL}/api/subscription/webhook`.
    const response = await preapproval_create(
      getMercadoPagoClient(),
      plan.name + ' - Mensal',
      price.amount,
      price.currency,
      `${backUrl}/subscription/callback`,
      req.body.email || undefined,
      `user_${user.id}_${Date.now()}`
    );

    if (!response.id || !response.init_point) {
      throw new Error('Invalid response from Mercado Pago');
    }

    // Save subscription reference in our database with plan + contracted price
    await createSubscription(user.id, response.id, undefined, {
      planId,
      priceId: price.id,
      contractedAmount: price.amount,
      contractedCurrency: price.currency,
      idempotencyKey: idempotencyKey || response.id,
    });

    res.json({
      checkoutUrl: response.init_point,
      preapprovalId: response.id,
      planId,
      planName: plan.name,
      price: price.amount
    });
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

// Webhook to receive payment notifications from Mercado Pago
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    if (!isValidWebhookSignature(req)) {
      console.error('Webhook rejected: invalid signature');
      return res.sendStatus(401);
    }

    const { type, data } = req.body;

    console.log('Webhook received:', { type, data });

    if (type === 'preapproval' && data?.id) {
      // Idempotency: dedup by provider + event key (preapproval id + type).
      // If we already processed this exact event, skip silently.
      const eventKey = `preapproval:${data.id}`;
      const isNew = await recordWebhookEventIfNew('mercado_pago', eventKey, req.body);
      if (!isNew) {
        console.log(`Webhook event ${eventKey} already processed — skipping (idempotent)`);
        return res.sendStatus(200);
      }

      const client = getMercadoPagoClient();
      const preapproval = new PreApproval(client);

      // Get preapproval details from Mercado Pago
      const details = await preapproval.get({ id: data.id });

      if (details.id) {
        // Map Mercado Pago status to our status
        const status = details.status || 'pending';
        
        let periodStart: Date | undefined;
        let periodEnd: Date | undefined;

        if (details.next_payment_date) {
          periodEnd = new Date(details.next_payment_date);
          periodStart = new Date(periodEnd);
          periodStart.setMonth(periodStart.getMonth() - 1);
        }

        await updateSubscriptionByPreapprovalId(
          details.id,
          status,
          periodStart,
          periodEnd
        );

        // Audit trail
        const sub = await getSubscriptionByPreapprovalId(details.id);
        await recordBillingEvent(
          sub?.user_id ?? null,
          details.id,
          'webhook_status_update',
          status,
          undefined,
          { next_payment_date: details.next_payment_date }
        );

        // Record subscription_activated event when status becomes authorized
        if (status === 'authorized' && sub?.user_id) {
          await recordBillingEvent(sub.user_id, details.id, 'subscription_activated', status, undefined, {
            plan_id: sub.plan_id,
          });
        }

        // Record subscription_cancelled event
        if (status === 'cancelled' && sub?.user_id) {
          await recordBillingEvent(sub.user_id, details.id, 'subscription_cancelled', status, undefined, {
            plan_id: sub.plan_id,
          });
        }

        console.log(`Subscription ${details.id} updated to status: ${status}`);
      }
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

    // Update in our database
    await updateSubscriptionByPreapprovalId(
      subscription.mp_preapproval_id,
      'cancelled'
    );

    await recordBillingEvent(user.id, subscription.mp_preapproval_id, 'subscription_cancelled', 'cancelled', undefined, {
      plan_id: subscription.plan_id,
    });

    res.json({ success: true, message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
