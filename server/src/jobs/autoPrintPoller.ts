import {
  getAutoPrintEnabledConfigs,
  updateAutoPrintLastPolled,
  addPrintQueueJob,
  releaseStaleJobs,
  markStaleAgentsOffline,
  getUnprocessedMLNotifications,
  getMarketplaceAccountsForUser
} from '../db.js';
import { getProvider } from '../providers/index.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { reprocessNotificationRow } from '../routes/notifications.js';

const POLL_INTERVAL_MS = 5 * 60_000; // 5 minutes — reconciliation fallback.
// Real-time printing is driven by ML notifications (POST /api/notifications).
// This poller catches anything missed by notifications.
const BATCH_SIZE = 20;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll one user's connected accounts. Each marketplace account is polled
 * through its provider — new providers are picked up automatically once the
 * user connects an account.
 */
async function pollUser(config: any) {
  const accounts = await getMarketplaceAccountsForUser(config.user_id);
  if (accounts.length === 0) {
    console.warn(`[autoPrintPoller] No marketplace accounts for user ${config.user_id}, skipping`);
    return;
  }

  for (const account of accounts) {
    const provider = getProvider(account.provider);
    if (!provider) {
      console.error(`[autoPrintPoller] Unknown provider: ${account.provider}`);
      continue;
    }

    // The agent only prints raw ZPL — PDF-only providers are browser-print
    // for now. Skip them instead of failing the whole poll.
    if (!provider.getLabelsZPL) {
      continue;
    }

    const ctx = await getFreshAccountContext(account);
    if (!ctx) {
      console.error(`[autoPrintPoller] Could not get token for account ${account.id} (${account.provider})`);
      continue;
    }

    try {
      const shipmentIds = await provider.listPrintableShipmentIds(ctx);
      console.log(`[autoPrintPoller] User ${config.user_id} ${account.provider}#${account.id}: ${shipmentIds.length} ready_to_print shipments`);

      if (shipmentIds.length === 0) continue;

      // Fetch the label per shipment so each print job contains exactly ONE
      // label — batch fetches return a single blob for all shipments.
      let queued = 0;
      for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
        const batch = shipmentIds.slice(i, i + BATCH_SIZE);
        for (const shipmentId of batch) {
          try {
            const zpl = await provider.getLabelsZPL(ctx, [shipmentId]);
            if (!zpl || !zpl.trim()) continue;
            await addPrintQueueJob(config.user_id, shipmentId, zpl, account.provider);
            queued++;
            // Small delay to respect provider rate limits between calls.
            await sleep(150);
          } catch (error) {
            console.error(`[autoPrintPoller] Failed to get label for ${account.provider} shipment ${shipmentId}:`, error);
          }
        }
        if (i + BATCH_SIZE < shipmentIds.length) {
          await sleep(300);
        }
      }
      if (queued > 0) {
        console.log(`[autoPrintPoller] User ${config.user_id}: queued ${queued} shipments (one label per job)`);
      }
    } catch (error) {
      console.error(`[autoPrintPoller] Poll failed for user ${config.user_id} account ${account.id}:`, error);
    }
  }

  await updateAutoPrintLastPolled(config.user_id);
}

export function startAutoPrintPoller() {
  console.log('🔄 Auto-print poller started (5min interval — reconciliation fallback for ML notifications)');

  const run = async () => {
    try {
      // Jobs stuck in 'processing' become 'needs_review' (uncertain outcome —
      // never auto-reprinted), and agents with stale heartbeats go offline.
      await releaseStaleJobs();
      await markStaleAgentsOffline();

      // Retry ML notifications whose processing failed (token refresh hiccup,
      // transient ML error). Persisted retries complement ML's own redelivery.
      try {
        const unprocessed = await getUnprocessedMLNotifications();
        if (unprocessed.length > 0) {
          console.log(`[autoPrintPoller] Retrying ${unprocessed.length} unprocessed ML notification(s)`);
          for (const row of unprocessed) {
            await reprocessNotificationRow(row);
          }
        }
      } catch (err) {
        console.error('[autoPrintPoller] Notification sweeper failed:', err);
      }

      const configs = await getAutoPrintEnabledConfigs();
      if (configs.length === 0) return;

      console.log(`[autoPrintPoller] Polling ${configs.length} user(s) with auto-print enabled`);
      // Poll users sequentially to avoid hammering provider APIs
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
