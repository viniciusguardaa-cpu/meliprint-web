import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../db.js', () => ({ getAutoPrintEnabledConfigs: vi.fn(), getMarketplaceAccountsForUser: vi.fn(), updateAutoPrintLastPolled: vi.fn(), addPrintQueueJob: vi.fn(), addPdfPrintQueueJob: vi.fn(), getQueuedShipmentIds: vi.fn(), getShopeeAutoPrintState: vi.fn(), initializeShopeeAutoPrint: vi.fn(), releaseStaleJobs: vi.fn(), markStaleAgentsOffline: vi.fn(), getUnprocessedMLNotifications: vi.fn() }));
vi.mock('../jobs/withJobLock.js', () => ({ withJobLock: vi.fn(async (_key, run) => run()) }));
vi.mock('../providers/index.js', () => ({ getProvider: vi.fn() }));
vi.mock('../services/accounts.js', () => ({ getFreshAccountContext: vi.fn() }));
vi.mock('../routes/notifications.js', () => ({ reprocessNotificationRow: vi.fn() }));
vi.mock('../services/shopeeArrange.js', () => ({ arrangeReadyShipments: vi.fn(), ensureDocumentsForArranged: vi.fn(), ensureDocumentsForProcessed: vi.fn() }));
import * as db from '../db.js';
import { getProvider } from '../providers/index.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { arrangeReadyShipments, ensureDocumentsForProcessed } from '../services/shopeeArrange.js';
import { withJobLock } from '../jobs/withJobLock.js';
import { startAutoPrintPoller } from '../jobs/autoPrintPoller.js';
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.resetAllMocks(); });
it('separates Shopee 60s and ML 1min locks; arrange-only never auto-prints', async () => {
  vi.useFakeTimers();
  vi.mocked(db.getAutoPrintEnabledConfigs).mockImplementation(async include => include ? [{ user_id: 1, enabled: false }] : [{ user_id: 1, enabled: true }]);
  vi.mocked(db.getUnprocessedMLNotifications).mockResolvedValue([]);
  vi.mocked(db.getMarketplaceAccountsForUser).mockResolvedValue([{ id: 1, provider: 'shopee', status: 'active', auto_arrange_shipment: true, arrange_method: 'dropoff' }, { id: 2, provider: 'mercadolivre', status: 'active' }] as any);
  const ml = vi.fn(async () => []); const shopee = vi.fn(async () => []);
  vi.mocked(getProvider).mockImplementation(id => id === 'shopee' ? { listAutoPrintableShipmentIds: shopee } as any : { getLabelsZPL: vi.fn(), listPrintableShipmentIds: ml } as any);
  vi.mocked(getFreshAccountContext).mockResolvedValue({ accessToken: 'test', externalUserId: 's' } as any);
  vi.mocked(db.getQueuedShipmentIds).mockResolvedValue(new Set());
  vi.mocked(arrangeReadyShipments).mockResolvedValue({ arranged: 0, failed: 0, skipped: 0 });
  startAutoPrintPoller(); await vi.advanceTimersByTimeAsync(0);
  expect(ml).toHaveBeenCalledTimes(1); expect(arrangeReadyShipments).toHaveBeenCalledTimes(1); expect(shopee).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(ml).toHaveBeenCalledTimes(2); expect(arrangeReadyShipments).toHaveBeenCalledTimes(2);
  expect(new Set(vi.mocked(withJobLock).mock.calls.map(c => c[0])).size).toBe(2);
  await vi.advanceTimersByTimeAsync(240_000); expect(ml).toHaveBeenCalledTimes(6);
});
it('calls the one-shot processed-docs hook for Shopee accounts even with auto_arrange off, never for ML', async () => {
  vi.useFakeTimers();
  vi.mocked(withJobLock).mockImplementation(async (_key: any, run: any) => run());
  vi.mocked(db.getAutoPrintEnabledConfigs).mockImplementation(async include => include ? [{ user_id: 1, enabled: false }] : [{ user_id: 1, enabled: true }]);
  vi.mocked(db.getUnprocessedMLNotifications).mockResolvedValue([]);
  vi.mocked(db.getMarketplaceAccountsForUser).mockResolvedValue([{ id: 27, provider: 'shopee', status: 'active', auto_arrange_shipment: false }, { id: 2, provider: 'mercadolivre', status: 'active' }] as any);
  vi.mocked(getProvider).mockImplementation(id => id === 'shopee' ? { listAutoPrintableShipmentIds: vi.fn(async () => []) } as any : { getLabelsZPL: vi.fn(), listPrintableShipmentIds: vi.fn(async () => []) } as any);
  vi.mocked(getFreshAccountContext).mockResolvedValue({ accessToken: 'test', externalUserId: 's' } as any);
  vi.mocked(db.getQueuedShipmentIds).mockResolvedValue(new Set());
  startAutoPrintPoller(); await vi.advanceTimersByTimeAsync(0);
  expect(arrangeReadyShipments).not.toHaveBeenCalled();
  expect(ensureDocumentsForProcessed).toHaveBeenCalledTimes(1);
  expect(vi.mocked(ensureDocumentsForProcessed).mock.calls[0][0]).toBe(27);
});

async function setupEnabledShopee() {
  vi.useFakeTimers();
  vi.mocked(withJobLock).mockImplementation(async (_key, run) => run());
  vi.mocked(db.getAutoPrintEnabledConfigs).mockImplementation(async include => include ? [{ user_id: 1, enabled: true, shopee_generation: 'epoch' }] : []);
  vi.mocked(db.getUnprocessedMLNotifications).mockResolvedValue([]);
  vi.mocked(db.getMarketplaceAccountsForUser).mockResolvedValue([{ id: 27, provider: 'shopee', status: 'active' }] as any);
  vi.mocked(db.getQueuedShipmentIds).mockResolvedValue(new Set(['QUEUED']));
  vi.mocked(getFreshAccountContext).mockResolvedValue({ accountId: 27, accessToken: 'test', externalUserId: 'shop' } as any);
  const baseline = vi.fn(async () => ['OLD', 'OLD_PENDING_DOCUMENT']);
  const discover = vi.fn(async () => ['OLD', 'OLD_PENDING_DOCUMENT', 'QUEUED', 'NEW', 'NEW']);
  const pdf = vi.fn(async () => Buffer.from('%PDF-test'));
  vi.mocked(getProvider).mockReturnValue({ listAutoPrintBaselineShipmentIds: baseline, listAutoPrintableShipmentIds: discover, getLabelsPDF: pdf } as any);
  vi.mocked(db.addPdfPrintQueueJob).mockResolvedValue({ id: 1 });
  return { baseline, discover, pdf };
}
it('first sweep snapshots all existing orders without requesting PDFs or enqueuing backlog', async () => {
  const { baseline, discover, pdf } = await setupEnabledShopee();
  vi.mocked(db.getShopeeAutoPrintState).mockResolvedValue(null);
  startAutoPrintPoller(); await vi.advanceTimersByTimeAsync(0);
  expect(baseline).toHaveBeenCalledOnce();
  expect(db.initializeShopeeAutoPrint).toHaveBeenCalledWith(1, { accountId: 27, generation: 'epoch' }, ['OLD', 'OLD_PENDING_DOCUMENT']);
  expect(discover).not.toHaveBeenCalled(); expect(pdf).not.toHaveBeenCalled();
  expect(db.addPdfPrintQueueJob).not.toHaveBeenCalled();
});
it('subsequent sweeps enqueue only new orders, once, scoped to the correct shop and activation', async () => {
  const { baseline, pdf } = await setupEnabledShopee();
  vi.mocked(db.getShopeeAutoPrintState).mockResolvedValue({ excluded_ids: ['OLD', 'OLD_PENDING_DOCUMENT'], created_after: 1000 });
  startAutoPrintPoller(); await vi.advanceTimersByTimeAsync(200);
  expect(baseline).not.toHaveBeenCalled(); expect(pdf).toHaveBeenCalledTimes(1);
  expect(db.getQueuedShipmentIds).toHaveBeenCalledWith(1, 'shopee', 27);
  expect(db.addPdfPrintQueueJob).toHaveBeenCalledWith(1, 'NEW', Buffer.from('%PDF-test'), 'shopee', { accountId: 27, generation: 'epoch' });
});
it('failed/partial baseline does not initialize or enqueue; retries discovery next cycle', async () => {
  const { baseline } = await setupEnabledShopee();
  vi.mocked(db.getShopeeAutoPrintState).mockResolvedValue(null);
  baseline.mockRejectedValueOnce(new Error('incomplete'));
  startAutoPrintPoller(); await vi.advanceTimersByTimeAsync(0);
  expect(db.initializeShopeeAutoPrint).not.toHaveBeenCalled(); expect(db.addPdfPrintQueueJob).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(db.initializeShopeeAutoPrint).toHaveBeenCalledOnce(); expect(db.addPdfPrintQueueJob).not.toHaveBeenCalled();
});
it('does not enqueue invalid PDF content', async () => {
  const { pdf } = await setupEnabledShopee();
  vi.mocked(db.getShopeeAutoPrintState).mockResolvedValue({ excluded_ids: ['OLD', 'OLD_PENDING_DOCUMENT'], created_after: 1000 });
  pdf.mockResolvedValue(Buffer.from('error html'));
  startAutoPrintPoller(); await vi.advanceTimersByTimeAsync(200);
  expect(db.addPdfPrintQueueJob).not.toHaveBeenCalled();
});
