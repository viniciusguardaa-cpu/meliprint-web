import crypto from 'crypto';
import { Request } from 'express';

/**
 * Validates the Mercado Pago webhook signature (HMAC-SHA256).
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * Production is fail-closed: a missing/invalid signature is rejected.
 * Development may allow an explicit bypass via MP_WEBHOOK_ALLOW_UNSIGNED=1.
 */
export function isValidWebhookSignature(req: Request): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      console.error('MP_WEBHOOK_SECRET not configured in production — webhook rejected (fail-closed)');
      return false;
    }
    if (process.env.MP_WEBHOOK_ALLOW_UNSIGNED !== '1') {
      console.error('MP_WEBHOOK_SECRET not configured and MP_WEBHOOK_ALLOW_UNSIGNED!=1 — webhook rejected');
      return false;
    }
    console.warn('⚠️  MP_WEBHOOK_SECRET not configured — webhook signature bypassed (dev only, MP_WEBHOOK_ALLOW_UNSIGNED=1)');
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
    if (expected.length !== v1.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}

/** Compute the expected signature for a given payload (used in tests). */
export function computeWebhookSignature(secret: string, dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex');
}
