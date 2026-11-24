import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturePdf } from './labelFixture.js';
vi.mock('../db.js', () => ({
  default: { query: vi.fn() }, getAutoPrintConfig: vi.fn(), upsertAutoPrintConfig: vi.fn(),
  getAutoPrintConfigByAgentToken: vi.fn(), claimPrintJobs: vi.fn(), markPrintJobPrinted: vi.fn(),
  markPrintJobFailed: vi.fn(), retryFailedJob: vi.fn(), getPrintQueueStats: vi.fn(), updateAgentHeartbeat: vi.fn(),
  getUserById: vi.fn(), hasProAccess: vi.fn(), getJobsNeedingReview: vi.fn(), resolveJobReview: vi.fn(),
  createPairingCode: vi.fn(), getMarketplaceAccountsForUser: vi.fn(), setShopeeArrangeSettings: vi.fn(),
  markShopeeConversionFailed: vi.fn(), getAutoPrintEnabledConfigs: vi.fn(), updateAutoPrintLastPolled: vi.fn(),
  addPrintQueueJob: vi.fn(), addPdfPrintQueueJob: vi.fn(), getQueuedShipmentIds: vi.fn(),
  releaseStaleJobs: vi.fn(), markStaleAgentsOffline: vi.fn(), getUnprocessedMLNotifications: vi.fn(),
  getShopeeAutoPrintState: vi.fn(), initializeShopeeAutoPrint: vi.fn()
}));
vi.mock('../middleware/subscription.js', () => ({ requireActiveSubscription: vi.fn(), requirePlanFeature: () => vi.fn() }));
vi.mock('../services/analytics.js', () => ({ trackEvent: vi.fn() }));
vi.mock('../jobs/withJobLock.js', () => ({ withJobLock: async (_key: number, run: () => Promise<void>) => run() }));
vi.mock('../providers/index.js', () => ({ getProvider: vi.fn() }));
vi.mock('../services/accounts.js', () => ({ getFreshAccountContext: vi.fn() }));
vi.mock('../routes/notifications.js', () => ({ reprocessNotificationRow: vi.fn() }));
vi.mock('../services/shopeeArrange.js', () => ({ arrangeReadyShipments: vi.fn(), ensureDocumentsForArranged: vi.fn(), ensureDocumentsForProcessed: vi.fn() }));
import * as db from '../db.js';
import { getProvider } from '../providers/index.js';
import { getFreshAccountContext } from '../services/accounts.js';
import router from '../routes/autoPrint.js';
import { startAutoPrintPoller } from '../jobs/autoPrintPoller.js';

// Run real Express endpoint handlers without opening a socket. Only the
// external boundaries (DB, Shopee HTTP and printer spooler) are mocked.
async function request(path: string, body: any = {}, params: any = {}, method = 'post') {
  const route = (router as any).stack.find((layer: any) => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { headers: { authorization: 'Bearer mock-token' }, body, params, query: {} };
  let response: any;
  const res = { status: vi.fn().mockReturnThis(), json: (data: any) => { response = data; } };
  await new Promise<void>(resolve => route.stack[0].handle(req, res, resolve));
  await route.stack[1].handle(req, res);
  return response;
}
let stateDir: string;
beforeEach(() => { stateDir = mkdtempSync(join(tmpdir(), 'labelgo-flow-')); });
afterEach(() => { vi.restoreAllMocks(); rmSync(stateDir, { recursive: true, force: true }); });

describe('Shopee discovery → existing queue protocol → original local agent → confirmation', () => {
  it.each([false, true])('prints once with PDF capability=%s, recovers a lost acknowledgment without reprinting', async supportsPdf => {
    vi.clearAllMocks();
    // Prevent scheduled future sweeps; allow the immediate poller cycle.
    vi.spyOn(globalThis, 'setInterval').mockReturnValue({} as any);
    const config = { user_id: 42, enabled: true, shopee_generation: 'epoch', label_dpi: 203 };
    const queue: any[] = [];
    vi.mocked(db.getAutoPrintEnabledConfigs).mockResolvedValue([config]);
    vi.mocked(db.getUnprocessedMLNotifications).mockResolvedValue([]);
    vi.mocked(db.getMarketplaceAccountsForUser).mockResolvedValue([{ id: 7, user_id: 42, provider: 'shopee', status: 'active' }] as any);
    vi.mocked(db.getShopeeAutoPrintState).mockResolvedValue({ excluded_ids: ['OLD'], created_after: 1000 });
    vi.mocked(db.getQueuedShipmentIds).mockResolvedValue(new Set());
    vi.mocked(getFreshAccountContext).mockResolvedValue({ accountId: 7, provider: 'shopee', externalUserId: 'shop', accessToken: 'mock' });
    const pdf = await fixturePdf();
    vi.mocked(getProvider).mockReturnValue({ listAutoPrintableShipmentIds: async () => ['OLD', 'NEW'], getLabelsPDF: async () => pdf } as any);
    vi.mocked(db.addPdfPrintQueueJob).mockImplementation(async (userId, shipmentId, bytes, provider, scope) => {
      const job = { id: 123, user_id: userId, account_id: scope.accountId, provider, shipment_id: shipmentId,
        zpl: bytes.toString('base64'), content_type: 'pdf', status: 'pending' };
      queue.push(job); return job;
    });
    vi.mocked(db.getAutoPrintConfigByAgentToken).mockResolvedValue(config);
    vi.mocked(db.hasProAccess).mockResolvedValue(true);
    vi.mocked(db.claimPrintJobs).mockImplementation(async userId => {
      const jobs = queue.filter(job => job.user_id === userId && job.status === 'pending');
      jobs.forEach(job => { job.status = 'processing'; });
      return jobs;
    });
    vi.mocked(db.markPrintJobPrinted).mockImplementation(async (userId, id) => {
      const job = queue.find(job => job.user_id === userId && job.id === id);
      if (!job) return false;
      job.status = 'printed'; return true;
    });
    vi.mocked(db.getPrintQueueStats).mockResolvedValue({ printed: 1 });
    startAutoPrintPoller();
    await vi.waitFor(() => expect(db.addPdfPrintQueueJob).toHaveBeenCalledOnce());
    expect(queue[0].shipment_id).toBe('NEW');
    // Exercise both POST capability negotiation and legacy GET /queue.
    const response = supportsPdf
      ? await request('/queue/claim', { agentId: 'installed', contentTypes: ['zpl', 'pdf'] })
      : await request('/queue', {}, {}, 'get');
    const job = response.jobs[0];
    expect(job.content_type).toBe(supportsPdf ? 'pdf' : 'zpl');
    expect(job.zpl.startsWith(supportsPdf ? 'JVBER' : '^XA')).toBe(true);
    expect(queue[0].content_type).toBe('pdf'); // stored original is never replaced

    let loseResponse = true;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toBe('https://mock.invalid/api/auto-print/queue/123/printed');
      await request('/queue/:id/printed', JSON.parse(String(init?.body)), { id: '123' });
      if (loseResponse) { loseResponse = false; throw new Error('network lost after server commit'); }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    // Import the agent unchanged; adapter calls are mocked, so no OS printer API can run.
    const agentUrl = new URL('../../../agent/lib/jobs.js', import.meta.url).href;
    const { processJob, flushPendingConfirmations } = await import(/* @vite-ignore */ agentUrl);
    const adapter = { printZpl: vi.fn(async () => 'accepted'), printPdf: vi.fn(async () => 'accepted') };
    const deps = { adapter, printerName: 'CLIENT_CONFIGURED_PRINTER', serverUrl: 'https://mock.invalid', agentToken: 'mock-token', stateDir, log: vi.fn(), error: vi.fn() };
    expect((await processJob(job, deps)).status).toBe('confirmation_pending');
    await flushPendingConfirmations(deps);
    expect((await processJob(job, deps)).status).toBe('already_confirmed');
    expect(adapter.printZpl.mock.calls.length + adapter.printPdf.mock.calls.length).toBe(1);
    expect((supportsPdf ? adapter.printPdf : adapter.printZpl)).toHaveBeenCalledWith('CLIENT_CONFIGURED_PRINTER', expect.anything());
    expect(queue[0].status).toBe('printed');
    expect(db.markPrintJobPrinted).toHaveBeenCalledTimes(2);
    expect(db.markPrintJobFailed).not.toHaveBeenCalled();
    expect((await request('/queue/claim', { agentId: 'second' })).jobs).toEqual([]);
  });
});
