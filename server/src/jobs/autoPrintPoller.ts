import { getAutoPrintEnabledConfigs, updateAutoPrintTokens, updateAutoPrintLastPolled, addPrintQueueJob } from '../db.js';
import { searchShipments, getShipment, getShipmentLabelsZPL, refreshAccessToken } from '../services/mercadolivre.js';

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const BATCH_SIZE = 20;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureFreshToken(config: any): Promise<string | null> {
  let accessToken: string = config.ml_access_token;
  const expiresAt = config.ml_token_expires_at ?? 0;

  // Refresh if token expires in the next 5 minutes
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      const clientId = process.env.ML_CLIENT_ID!;
      const clientSecret = process.env.ML_CLIENT_SECRET!;
      const tokens = await refreshAccessToken(config.ml_refresh_token, clientId, clientSecret);
      accessToken = tokens.access_token;
      await updateAutoPrintTokens(config.user_id, tokens.access_token, tokens.refresh_token, Date.now() + tokens.expires_in * 1000);
      console.log(`[autoPrintPoller] Refreshed token for user ${config.user_id}`);
    } catch (error) {
      console.error(`[autoPrintPoller] Token refresh failed for user ${config.user_id}:`, error);
      return null;
    }
  }

  return accessToken;
}

async function pollUser(config: any) {
  const accessToken = await ensureFreshToken(config);
  if (!accessToken) return;

  const sellerId = config.ml_seller_id;
  if (!sellerId) {
    console.warn(`[autoPrintPoller] No seller_id for user ${config.user_id}, skipping`);
    return;
  }

  try {
    // Search for ready_to_ship shipments with ready_to_print substatus
    const shipmentIds = await searchShipments(accessToken, sellerId, 'ready_to_ship', 'ready_to_print');
    console.log(`[autoPrintPoller] User ${config.user_id}: found ${shipmentIds.length} ready_to_print shipments`);

    if (shipmentIds.length === 0) {
      await updateAutoPrintLastPolled(config.user_id);
      return;
    }

    // Fetch ZPL in batches and add to queue
    for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
      const batch = shipmentIds.slice(i, i + BATCH_SIZE);

      // Verify each shipment is still ready_to_print (status can change between search and fetch)
      const validShipments: number[] = [];
      for (const id of batch) {
        try {
          const shipment = await getShipment(accessToken, id);
          if (shipment.status === 'ready_to_ship' && shipment.substatus === 'ready_to_print') {
            validShipments.push(id);
          }
        } catch {
          // skip invalid shipments
        }
      }

      if (validShipments.length === 0) continue;

      try {
        const zpl = await getShipmentLabelsZPL(accessToken, validShipments);
        if (!zpl.trim()) continue;

        // ZPL from ML can contain multiple labels separated by form feed or newlines.
        // We store the whole batch as one job — the agent sends it all to the printer at once.
        for (const shipmentId of validShipments) {
          await addPrintQueueJob(config.user_id, shipmentId, zpl);
        }
        console.log(`[autoPrintPoller] User ${config.user_id}: queued ${validShipments.length} shipments`);
      } catch (error) {
        console.error(`[autoPrintPoller] Failed to get ZPL for user ${config.user_id} batch:`, error);
      }

      if (i + BATCH_SIZE < shipmentIds.length) {
        await sleep(300);
      }
    }

    await updateAutoPrintLastPolled(config.user_id);
  } catch (error) {
    console.error(`[autoPrintPoller] Poll failed for user ${config.user_id}:`, error);
  }
}

export function startAutoPrintPoller() {
  console.log('🔄 Auto-print poller started (60s interval)');

  const run = async () => {
    try {
      const configs = await getAutoPrintEnabledConfigs();
      if (configs.length === 0) return;

      console.log(`[autoPrintPoller] Polling ${configs.length} user(s) with auto-print enabled`);
      // Poll users sequentially to avoid hammering the ML API
      for (const config of configs) {
        await pollUser(config);
      }
    } catch (error) {
      console.error('[autoPrintPoller] Fatal error:', error);
    }
  };

  // Run immediately, then on interval
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
