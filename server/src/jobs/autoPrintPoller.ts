import {
  getAutoPrintEnabledConfigs,
  updateAutoPrintLastPolled,
  addPrintQueueJob,
  addPdfPrintQueueJob,
  getQueuedShipmentIds,
  getShopeeAutoPrintState,
  initializeShopeeAutoPrint,
  getMarketplaceAutoPrintState,
  initializeMarketplaceAutoPrint,
  reserveTikTokLabelAttempt,
  releaseStaleJobs,
  markStaleAgentsOffline,
  getUnprocessedMLNotifications,
  getMarketplaceAccountsForUser
} from '../db.js';
import { getProvider } from '../providers/index.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { reprocessNotificationRow } from '../routes/notifications.js';
import { arrangeReadyShipments, ensureDocumentsForArranged, ensureDocumentsForProcessed } from '../services/shopeeArrange.js';
import { withJobLock } from './withJobLock.js';

const POLL_INTERVAL_MS = 1 * 60_000; // 1 minute — reconciliation fallback.
// Real-time printing is driven by ML notifications (POST /api/notifications).
// This poller catches anything missed by notifications.
const BATCH_SIZE = 20;
const AUTO_PRINT_LOCK = 491001;
const SHOPEE_PRINT_LOCK = 491004;
const TIKTOK_PRINT_LOCK = 491006;
const SHOPEE_POLL_INTERVAL_MS = 60_000;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll one user's connected accounts. Each marketplace account is polled
 * through its provider — new providers are picked up automatically once the
 * user connects an account.
 */
export async function pollAutoPrintUser(config: any, mode: 'default' | 'shopee' | 'tiktok' = 'default') {
  const accounts = await getMarketplaceAccountsForUser(config.user_id);
  if (accounts.length === 0) {
    console.warn(`[autoPrintPoller] No marketplace accounts for user ${config.user_id}, skipping`);
    return;
  }

  for (const account of accounts) {
    if (mode === 'tiktok' ? account.provider !== 'tiktok' :
        mode === 'shopee' ? account.provider !== 'shopee' : ['shopee', 'tiktok'].includes(account.provider)) continue;
    // Reconnect-needed accounts can't refresh — skip quietly (UI shows the
    // reconnect banner; no point hammering the provider every cycle).
    if (['shopee', 'tiktok'].includes(account.provider) ? account.status !== 'active' : account.status === 'reauth_required') {
      console.warn(`[autoPrintPoller] Account ${account.id} (${account.provider}) is not available for printing — skipping`);
      continue;
    }
    const provider = getProvider(account.provider);
    if (!provider) {
      console.error(`[autoPrintPoller] Unknown provider: ${account.provider}`);
      continue;
    }
    if (account.provider === 'tiktok' && !provider.isConfigured()) continue;

    // PDF auto-print is opt-in per provider; Shopee only discovers orders
    // already arranged by the seller. Other PDF providers remain unchanged.
    const pdfAutoPrint = !provider.getLabelsZPL && !!provider.listAutoPrintableShipmentIds;
    if (!provider.getLabelsZPL && !pdfAutoPrint) {
      continue;
    }

    const ctx = await getFreshAccountContext(account);
    if (!ctx) {
      console.error(`[autoPrintPoller] Could not get access credentials for account ${account.id} (${account.provider})`);
      continue;
    }

    // Opt-in only (default off): organize pending Shopee shipments that already
    // have a valid NF, so their labels can be generated and printed below.
    if (account.provider === 'shopee' && account.auto_arrange_shipment === true) {
      try {
        const method = account.arrange_method === 'dropoff' ? 'dropoff' : 'pickup';
        const r = await arrangeReadyShipments(account.id, { accessToken: ctx.accessToken, shopId: ctx.externalUserId }, method);
        await ensureDocumentsForArranged(account.id, { accessToken: ctx.accessToken, shopId: ctx.externalUserId });
        if (r.arranged || r.failed) console.log(`[autoPrintPoller] shopee#${account.id} arrange: ${r.arranged} arranged, ${r.failed} failed, ${r.skipped} skipped`);
      } catch (error) {
        console.error(`[autoPrintPoller] Shopee arrange failed for account ${account.id}:`, error);
      }
    }

    // Separate, env-gated one-shot (account id + exact order_sn allowlist); does not depend on
    // auto_arrange_shipment because it never arranges shipment, it only requests one label document.
    if (account.provider === 'shopee') {
      try {
        await ensureDocumentsForProcessed(account.id, { accessToken: ctx.accessToken, shopId: ctx.externalUserId });
      } catch (error) {
        console.error(`[autoPrintPoller] Shopee processed-docs failed for account ${account.id}:`, error);
      }
    }

    if (!config.enabled) continue; // Arrange-only opt-in does not enable printing.

    try {
      const scope = ['shopee', 'tiktok'].includes(account.provider)
        ? { accountId: account.id, generation: config.shopee_generation } : undefined;
      let excluded = new Set<string>();
      let createdAfter: number | undefined;
      if (scope) {
        const state = account.provider === 'tiktok'
          ? await getMarketplaceAutoPrintState(config.user_id, scope, 'tiktok')
          : await getShopeeAutoPrintState(config.user_id, scope);
        if (!state) {
          if (!provider.listAutoPrintBaselineShipmentIds) throw new Error('Missing safe auto-print baseline capability');
          const baseline = await provider.listAutoPrintBaselineShipmentIds(ctx);
          if (account.provider === 'tiktok') await initializeMarketplaceAutoPrint(config.user_id, scope, baseline, 'tiktok');
          else await initializeShopeeAutoPrint(config.user_id, scope, baseline);
          console.log(`[autoPrintPoller] ${account.provider} account ${account.id}: activation snapshot saved; ${baseline.length} existing shipments excluded`);
          continue;
        }
        excluded = new Set(state.excluded_ids);
        createdAfter = state.created_after;
      }
      const known = await getQueuedShipmentIds(config.user_id, account.provider, scope?.accountId);
      const discovered = pdfAutoPrint
        ? await provider.listAutoPrintableShipmentIds!(ctx, createdAfter === undefined ? undefined : { createdAfter })
        : await provider.listPrintableShipmentIds(ctx);
      const shipmentIds = [...new Set(discovered)].filter(id => !known.has(id) && !excluded.has(id));
      console.log(`[autoPrintPoller] User ${config.user_id} ${account.provider}#${account.id}: ${shipmentIds.length} ready_to_print shipments`);

      if (shipmentIds.length === 0) continue;

      // Fetch the label per shipment so each print job contains exactly ONE
      // label — batch fetches return a single blob for all shipments.
      let queued = 0;
      for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
        const batch = shipmentIds.slice(i, i + BATCH_SIZE);
        for (const shipmentId of batch) {
          try {
            if (account.provider === 'tiktok' && !await reserveTikTokLabelAttempt(config.user_id, scope!, shipmentId)) continue;
            let job;
            if (pdfAutoPrint) {
              const pdf = account.provider === 'tiktok'
                ? await provider.getLabelsPDF(ctx, [shipmentId], { createdAfter: createdAfter! })
                : await provider.getLabelsPDF(ctx, [shipmentId]);
              if (!pdf.length || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF label');
              job = await addPdfPrintQueueJob(config.user_id, shipmentId, pdf, account.provider, scope!);
            } else {
              const zpl = await provider.getLabelsZPL!(ctx, [shipmentId]);
              if (!zpl || !zpl.trim()) continue;
              job = await addPrintQueueJob(config.user_id, shipmentId, zpl, account.provider);
            }
            if (job) queued++;
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
  console.log('🔄 Auto-print poller started (ML 60s reconciliation, independent Shopee/TikTok 60s discovery)');

  const run = async () => {
    try {
      await withJobLock(AUTO_PRINT_LOCK, async () => {
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
        await pollAutoPrintUser(config);
      }
      });
    } catch (error) {
      console.error('[autoPrintPoller] Fatal error:', error);
    }
  };

  const runShopee = async () => {
    try {
      await withJobLock(SHOPEE_PRINT_LOCK, async () => {
        const configs = await getAutoPrintEnabledConfigs(true);
        for (const config of configs) await pollAutoPrintUser(config, 'shopee');
      });
    } catch (error) {
      console.error('[autoPrintPoller] Shopee sweep failed:', error);
    }
  };
  runShopee();
  setInterval(runShopee, SHOPEE_POLL_INTERVAL_MS);

  const runTikTok = async () => {
    if (process.env.TIKTOK_ENABLED !== '1') return;
    try {
      await withJobLock(TIKTOK_PRINT_LOCK, async () => {
        for (const config of await getAutoPrintEnabledConfigs()) await pollAutoPrintUser(config, 'tiktok');
      });
    } catch (error) { console.error('[autoPrintPoller] TikTok sweep failed:', error); }
  };
  runTikTok();
  setInterval(runTikTok, POLL_INTERVAL_MS);

  // Run immediately, then on interval
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
