import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../db.js', () => ({
  getMarketplaceAccountsForUser: vi.fn(), updateAutoPrintLastPolled: vi.fn(), addPrintQueueJob: vi.fn(), addPdfPrintQueueJob: vi.fn(),
  getQueuedShipmentIds: vi.fn(), getShopeeAutoPrintState: vi.fn(), initializeShopeeAutoPrint: vi.fn(),
  getMarketplaceAutoPrintState: vi.fn(), initializeMarketplaceAutoPrint: vi.fn(), reserveTikTokLabelAttempt: vi.fn()
}));
vi.mock('../providers/index.js', () => ({ getProvider: vi.fn() }));
vi.mock('../services/accounts.js', () => ({ getFreshAccountContext: vi.fn() }));
vi.mock('../routes/notifications.js', () => ({ reprocessNotificationRow: vi.fn() }));
vi.mock('../services/shopeeArrange.js', () => ({ arrangeReadyShipments: vi.fn(), ensureDocumentsForArranged: vi.fn(), ensureDocumentsForProcessed: vi.fn() }));
import * as db from '../db.js';
import { getProvider } from '../providers/index.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { pollAutoPrintUser } from '../jobs/autoPrintPoller.js';

const config = { user_id: 1, enabled: true, shopee_generation: 'epoch' };
const scope = { accountId: 27, generation: 'epoch' };
const baseline = vi.fn(); const discover = vi.fn(); const pdf = vi.fn(); const configured = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  vi.mocked(db.getMarketplaceAccountsForUser).mockResolvedValue([{ id: 27, provider: 'tiktok', status: 'active' }] as any);
  vi.mocked(getFreshAccountContext).mockResolvedValue({ accountId: 27, provider: 'tiktok', accessToken: 'test', externalUserId: '1' } as any);
  vi.mocked(getProvider).mockReturnValue({ isConfigured: configured, listAutoPrintBaselineShipmentIds: baseline, listAutoPrintableShipmentIds: discover, getLabelsPDF: pdf } as any);
  configured.mockReturnValue(true); baseline.mockResolvedValue(['OLD', 'WAITING']);
  discover.mockResolvedValue(['OLD', 'WAITING', 'QUEUED', 'NEW', 'NEW']); pdf.mockResolvedValue(Buffer.from('%PDF-mock'));
  vi.mocked(db.getMarketplaceAutoPrintState).mockResolvedValue({ excluded_ids: ['OLD', 'WAITING'], created_after: 1000 });
  vi.mocked(db.getQueuedShipmentIds).mockResolvedValue(new Set(['QUEUED']));
  vi.mocked(db.reserveTikTokLabelAttempt).mockResolvedValue(true);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function poll(c = config) { const pending = pollAutoPrintUser(c, 'tiktok'); await vi.advanceTimersByTimeAsync(500); await pending; }
it('initializes a complete baseline without fetching any existing label', async () => {
  vi.mocked(db.getMarketplaceAutoPrintState).mockResolvedValue(null);
  await poll();
  expect(db.initializeMarketplaceAutoPrint).toHaveBeenCalledWith(1, scope, ['OLD', 'WAITING'], 'tiktok');
  expect(pdf).not.toHaveBeenCalled(); expect(discover).not.toHaveBeenCalled();
});
it('fails closed if initial pagination fails', async () => {
  vi.mocked(db.getMarketplaceAutoPrintState).mockResolvedValue(null); baseline.mockRejectedValue(new Error('partial'));
  await poll();
  expect(db.initializeMarketplaceAutoPrint).not.toHaveBeenCalled(); expect(db.addPdfPrintQueueJob).not.toHaveBeenCalled();
});
it('queues one new package in the correct account/generation and rechecks the creation cutoff', async () => {
  await poll();
  expect(discover).toHaveBeenCalledWith(expect.anything(), { createdAfter: 1000 });
  expect(db.reserveTikTokLabelAttempt).toHaveBeenCalledOnce();
  expect(db.reserveTikTokLabelAttempt).toHaveBeenCalledWith(1, scope, 'NEW');
  expect(pdf).toHaveBeenCalledOnce();
  expect(pdf).toHaveBeenCalledWith(expect.anything(), ['NEW'], { createdAfter: 1000 });
  expect(db.addPdfPrintQueueJob).toHaveBeenCalledWith(1, 'NEW', Buffer.from('%PDF-mock'), 'tiktok', scope);
  expect(db.addPrintQueueJob).not.toHaveBeenCalled();
});
it('does not fetch a document after the durable attempt budget or backoff is exhausted', async () => {
  vi.mocked(db.reserveTikTokLabelAttempt).mockResolvedValue(false); await poll();
  expect(pdf).not.toHaveBeenCalled(); expect(db.addPdfPrintQueueJob).not.toHaveBeenCalled();
});
it('honors the rollout flag, account status and existing auto-print preference', async () => {
  configured.mockReturnValue(false); await poll(); expect(getFreshAccountContext).not.toHaveBeenCalled();
  configured.mockReturnValue(true); await poll({ ...config, enabled: false }); expect(discover).not.toHaveBeenCalled();
  vi.mocked(db.getMarketplaceAccountsForUser).mockResolvedValue([{ id: 27, provider: 'tiktok', status: 'reauth_required' }] as any);
  await poll(); expect(discover).not.toHaveBeenCalled();
});
