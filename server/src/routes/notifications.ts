import { Router, Request, Response } from 'express';
import {
  recordMLNotificationIfNew,
  markMLNotificationProcessed,
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
 * { resource: "/shipments/123", topic: "shipments", user_id: 12345, ... }
 *
 * Must respond 200 within 500ms to avoid topic deactivation.
 * Processing is fire-and-forget (async, non-blocking).
 */
router.post('/', async (req: Request, res: Response) => {
  // Always respond 200 immediately to satisfy ML's 500ms requirement.
  res.sendStatus(200);

  // Process asynchronously (fire-and-forget).
  processNotification(req.body).catch((err) => {
    console.error('[ml-notifications] Processing error:', err);
  });
});

async function processNotification(body: any) {
  const { topic, resource, user_id: mlUserId } = body || {};

  if (!topic || !resource) {
    console.warn('[ml-notifications] Missing topic or resource:', body);
    return;
  }

  console.log(`[ml-notifications] Received: topic=${topic} resource=${resource} user_id=${mlUserId}`);

  // Dedup: skip if we already received this exact notification.
  const isNew = await recordMLNotificationIfNew(topic, resource, mlUserId, body);
  if (!isNew) {
    console.log(`[ml-notifications] Duplicate ${topic}:${resource} — skipping`);
    return;
  }

  if (topic === 'shipments') {
    await processShipmentNotification(resource, mlUserId);
  }
  // orders_v2 and other topics can be handled here in the future.

  await markMLNotificationProcessed(topic, resource);
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

  // Get all enabled auto-print configs and find the one for this user.
  const configs = await getAutoPrintEnabledConfigs();
  const config = configs.find((c: any) => c.user_id === user.id);
  if (!config) {
    console.log(`[ml-notifications] Auto-print not enabled for user ${user.id} — skipping`);
    return;
  }

  // Ensure fresh token.
  let accessToken: string = config.ml_access_token;
  const expiresAt = config.ml_token_expires_at ?? 0;
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      const clientId = process.env.ML_CLIENT_ID!;
      const clientSecret = process.env.ML_CLIENT_SECRET!;
      const tokens = await refreshAccessToken(config.ml_refresh_token, clientId, clientSecret);
      accessToken = tokens.access_token;
      await updateAutoPrintTokens(config.user_id, tokens.access_token, tokens.refresh_token, Date.now() + tokens.expires_in * 1000);
    } catch (error) {
      console.error(`[ml-notifications] Token refresh failed for user ${config.user_id}:`, error);
      return;
    }
  }

  // Fetch the shipment to check its status.
  try {
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
  } catch (error) {
    console.error(`[ml-notifications] Failed to process shipment ${shipmentId}:`, error);
  }
}

export default router;
