import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import {
  findOrCreateUser,
  getUserByMlId,
  getActiveSubscription,
  createSubscription,
  updateSubscriptionByPreapprovalId,
  getSubscriptionByPreapprovalId,
  isFreeAccessEmail
} from '../db.js';

const router = Router();

const PLAN_PRICE = 29.90;
const PLAN_NAME = 'Printly Pro - Mensal';

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
        planName: 'Printly Pro - Vitalício',
        price: 0,
        isFreeAccess: true
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

    res.json({
      hasSubscription: true,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      planName: PLAN_NAME,
      price: PLAN_PRICE
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
    const client = getMercadoPagoClient();
    const preapproval = new PreApproval(client);

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

    const backUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // NOTE: Mercado Pago's PreApproval API does not accept a per-request
    // notification_url (unlike Payments/Preferences). For subscriptions,
    // the webhook URL must be configured once in the Mercado Pago
    // Developer Panel: App > Webhooks > "Assinaturas" (preapproval) topic,
    // pointing to `${FRONTEND_URL}/api/subscription/webhook`.
    const response = await preapproval.create({
      body: {
        reason: PLAN_NAME,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PLAN_PRICE,
          currency_id: 'BRL'
        },
        back_url: `${backUrl}/subscription/callback`,
        payer_email: req.body.email || undefined,
        external_reference: `user_${user.id}_${Date.now()}`
      }
    });

    if (!response.id || !response.init_point) {
      throw new Error('Invalid response from Mercado Pago');
    }

    // Save subscription reference in our database
    await createSubscription(user.id, response.id);

    res.json({
      checkoutUrl: response.init_point,
      preapprovalId: response.id
    });
  } catch (error) {
    console.error('Error creating checkout:', error);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

// Validates the Mercado Pago webhook signature.
// Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks#validacao-da-origem-da-notificacao
// Returns true when the signature is valid OR when MP_WEBHOOK_SECRET is not configured
// (fails open with a warning, since MP does not sign requests unless a secret is set up
// in the Developer Panel). Once MP_WEBHOOK_SECRET is set, invalid signatures are rejected.
function isValidWebhookSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️  MP_WEBHOOK_SECRET not configured - webhook signature is not being verified');
    return true;
  }

  const signatureHeader = req.header('x-signature');
  const requestId = req.header('x-request-id');
  const dataId = (req.query['data.id'] as string) || req.body?.data?.id;

  if (!signatureHeader || !requestId || !dataId) {
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const [key, value] = p.split('=');
      return [key?.trim(), value?.trim()];
    })
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
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

    res.json({ success: true, message: 'Assinatura cancelada com sucesso' });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

export default router;
