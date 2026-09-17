import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  recordMLNotificationIfNew,
  markMLNotificationProcessed,
  markMLNotificationFailed,
  getAutoPrintEnabledConfigs,
  updateAutoPrintTokens,
  addPrintQueueJob,
  getUserByMlId
} from '../db.js';
import { getShipment, getShipmentLabelsZPL, refreshAccessToken } from '../services/mercadolivre.js';

const router = Router();

/**
 * Mercado Livre notifications webhook.
 * Configure in ML Developer Panel > My Applications > Notifications Callback URL.
 * Subscribe to topics: shipments, orders_v2.
 *
 * ML sends a POST with:
 * { _id: "<unique delivery id>", resource: "/shipments/123", topic: "shipments",
 *   user_id: 12345, sent: "...", attempts: 1, ... }
 *
 * Must respond 200 within 500ms to avoid topic deactivation.
 * Processing is fire-and-forget (async, non-blocking); failures stay
 * unprocessed in ml_notifications and are retried by the sweeper in
 * autoPrintPoller.
 */
router.post('/', async (req: Request, res: Response) => {
  // Always respond 200 immediately to satisfy ML's 500ms requirement.
  res.sendStatus(200);

  // Process asynchronously (fire-and-forget).
  processNotification(req.body).catch((err) => {
    console.error('[ml-notifications] Processing error:', err);
  });
});

/**
 * Per-delivery dedup key. ML gives every notification a unique `_id`; if it is
 * missing we fall back to a hash of topic+resource+sent timestamp so that
 * successive changes to the same shipment are still distinct deliveries, while
 * a redelivery of the SAME notification collapses to one.
 */
export function notificationDeliveryKey(body: any): string {
  if (body?._id) return String(body._id);
  const base = `${body?.topic}|${body?.resource}|${body?.sent || ''}|${body?.attempts || ''}`;
  return `hash_${crypto.createHash('sha256').update(base).digest('hex').slice(0, 32)}`;
}

async function processNotification(body: any) {
  const { topic, resource, user_id: mlUserId } = body || {};

  if (!topic || !resource) {
    console.warn('[ml-notifications] Missing topic or resource:', body);
    return;
  }

  const deliveryKey = notificationDeliveryKey(body);
  const notificationId = await recordMLNotificationIfNew(topic, resource, deliveryKey, mlUserId, body);
  if (notificationId === null) {
    // Same delivery already recorded — ML retried the same notification.
    return;
  }

  console.log(`[ml-notifications] Received: topic=${topic} resource=${resource} user_id=${mlUserId} delivery=${deliveryKey}`);

  try {
    if (topic === 'shipments') {
      await processShipmentNotification(resource, mlUserId);
    }
    // orders_v2 and other topics can be handled here in the future.

    await markMLNotificationProcessed(notificationId);
  } catch (error) {
    // Persisted failure — the sweeper will retry this notification.
    await markMLNotificationFailed(
      notificationId,
      error instanceof Error ? error.message : String(error)
    ).catch(() => {});
    throw error;
  }
}

/**
 * Reprocess a stored notification row (used by the retry sweeper).
 * Exported for autoPrintPoller.
 */
export async function reprocessNotificationRow(row: {
  id: number;
  topic: string;
  resource: string;
  user_id: number | null;
  payload: any;
}) {
  try {
    if (row.topic === 'shipments') {
      await processShipmentNotification(row.resource, row.user_id ?? undefined);
    }
    await markMLNotificationProcessed(row.id);
  } catch (error) {
    await markMLNotificationFailed(
      row.id,
      error instanceof Error ? error.message : String(error)
    ).catch(() => {});
  }
}

async function processShipmentNotification(resource: string, mlUserId?: number) {
  // Parse shipment ID from resource path: "/shipments/123456789"
  const match = resource.match(/\/shipments\/(\d+)/);
  if (!match) {
    console.warn(`[ml-notifications] Could not parse shipment ID from resource: ${resource}`);
    return;
  }
  const shipmentId = Number(match[1]);

  if (!mlUserId) {
    console.warn(`[ml-notifications] No user_id for shipment ${shipmentId}`);
    return;
  }

  // Find the user and their auto-print config.
  const user = await getUserByMlId(mlUserId);
  if (!user) {
    console.log(`[ml-notifications] User ${mlUserId} not found — skipping shipment ${shipmentId}`);
    return;
  }

  // Entitled configs only (getAutoPrintEnabledConfigs already filters by
  // active Pro subscription / free access) — lapsed accounts get no new jobs.
  const configs = await getAutoPrintEnabledConfigs();
  const config = configs.find((c: any) => c.user_id === user.id);
  if (!config) {
    console.log(`[ml-notifications] Auto-print not enabled/entitled for user ${user.id} — skipping`);
    return;
  }

  // Ensure fresh token.
  let accessToken: string = config.ml_access_token;
  const expiresAt = config.ml_token_expires_at ?? 0;
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    const clientId = process.env.ML_CLIENT_ID!;
    const clientSecret = process.env.ML_CLIENT_SECRET!;
    const tokens = await refreshAccessToken(config.ml_refresh_token, clientId, clientSecret);
    accessToken = tokens.access_token;
    await updateAutoPrintTokens(config.user_id, tokens.access_token, tokens.refresh_token, Date.now() + tokens.expires_in * 1000);
  }

  // Fetch the shipment to check its status. Errors propagate so the
  // notification stays unprocessed and is retried by the sweeper.
  const shipment = await getShipment(accessToken, shipmentId);
  if (shipment.status !== 'ready_to_ship' || shipment.substatus !== 'ready_to_print') {
    console.log(`[ml-notifications] Shipment ${shipmentId} not ready_to_print (status=${shipment.status} substatus=${shipment.substatus})`);
    return;
  }

  // Fetch ZPL for this single shipment and queue it.
  const zpl = await getShipmentLabelsZPL(accessToken, [shipmentId]);
  if (!zpl || !zpl.trim()) {
    console.log(`[ml-notifications] Empty ZPL for shipment ${shipmentId}`);
    return;
  }

  await addPrintQueueJob(config.user_id, shipmentId, zpl);
  console.log(`[ml-notifications] Queued shipment ${shipmentId} for user ${config.user_id} (event-driven)`);
}

export default router;
