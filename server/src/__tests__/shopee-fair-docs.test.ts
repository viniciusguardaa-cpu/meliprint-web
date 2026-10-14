import { beforeEach, expect, it, vi } from 'vitest';
type Row = { order_sn: string; package_number: string; status: string; updated_at: Date };
const store = vi.hoisted(() => ({ rows: [] as any[] }));
const m = vi.hoisted(() => ({
  getShipmentList: vi.fn(), getProcessedOrders: vi.fn(), getOrderDetail: vi.fn(), getShippingParameter: vi.fn(),
  requestDocumentCreation: vi.fn(), arrangeShipment: vi.fn(), diagnoseDocument: vi.fn(),
  claimArrangeAttempt: vi.fn(), finishArrangeAttempt: vi.fn(), getRecentlyArrangedPackages: vi.fn(), getArrangeAttempts: vi.fn(),
  getArrangeAttemptDetail: vi.fn(),
  getRecentlyArrangedPackagesAll: vi.fn(async () => store.rows.filter(r => r.status === 'requested')),
  // faithful fake of the atomic UPDATE ... WHERE status='requested' (single-threaded JS = atomic like SQL row lock)
  claimDocAttempt: vi.fn(async (_a: number, sn: string, pkg: string) => {
    const r = store.rows.find(x => x.order_sn === sn && x.package_number === pkg && x.status === 'requested');
    if (!r) return false; r.status = 'doc_claimed'; return true;
  }),
  setDocState: vi.fn(async (_a: number, sn: string, pkg: string, status: string) => {
    const r = store.rows.find(x => x.order_sn === sn && x.package_number === pkg); if (r) r.status = status;
  })
}));
vi.mock('../services/shopee.js', () => ({ ...m, hasValidInvoice: () => true }));
vi.mock('../db.js', () => m);
import { ensureDocumentsForArranged, fairDocsTargets } from '../services/shopeeArrange.js';
const shop = { accessToken: 't', shopId: 's' };
const env = (orders: string) => ({ SHOPEE_FAIR_DOCS_ACCOUNT_IDS: '27', SHOPEE_FAIR_DOCS_ORDER_SNS: orders } as any);
const mk = (sn: string, status = 'requested'): Row => ({ order_sn: sn, package_number: 'P' + sn, status, updated_at: new Date() });
const detail = (status: string) => async (_s: any, sns: string[]) => sns.map(sn => ({ order_sn: sn, order_status: status }));
beforeEach(() => { vi.clearAllMocks(); store.rows = Array.from({ length: 60 }, (_, i) => mk('OLD' + i)); store.rows.push(mk('NEW1')); m.getOrderDetail.mockImplementation(detail('PROCESSED')); });

it('legacy path untouched without the env', async () => {
  m.getRecentlyArrangedPackages.mockResolvedValue(store.rows.slice(0, 30)); m.requestDocumentCreation.mockResolvedValue('already_ready');
  await ensureDocumentsForArranged(27, shop, {} as any);
  expect(m.getRecentlyArrangedPackagesAll).not.toHaveBeenCalled(); expect(m.requestDocumentCreation).toHaveBeenCalledTimes(20);
}, 20000);
it('account enabled but no exact order allowlisted => no calls at all; other accounts keep legacy; max 3 orders', async () => {
  await ensureDocumentsForArranged(27, shop, { SHOPEE_FAIR_DOCS_ACCOUNT_IDS: '27' } as any);
  expect(m.requestDocumentCreation).not.toHaveBeenCalled(); expect(m.getOrderDetail).not.toHaveBeenCalled();
  expect(fairDocsTargets(28, env('A'))).toEqual([]); expect(fairDocsTargets(27, env('A,B,C,D,E'))).toEqual(['A', 'B', 'C']);
});
it('only the allowlisted order is touched, 60 old rows never; create exactly once', async () => {
  m.requestDocumentCreation.mockResolvedValue('create_sent_ok');
  await ensureDocumentsForArranged(27, shop, env('NEW1'));
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(1); expect(m.requestDocumentCreation.mock.calls[0][1]).toBe('NEW1');
  expect(m.getOrderDetail.mock.calls[0][1]).toEqual(['NEW1']);
  expect(store.rows.find(r => r.order_sn === 'NEW1')!.status).toBe('doc_requested');
  expect(store.rows.filter(r => r.status === 'requested').length).toBe(60);
  for (let i = 0; i < 5; i++) await ensureDocumentsForArranged(27, shop, env('NEW1')); // later cycles / "restart" (state is in the store)
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(1);
});
it('SHIPPED (or unknown) is a terminal skip: no create, never revisited', async () => {
  m.getOrderDetail.mockImplementation(detail('SHIPPED'));
  for (let i = 0; i < 3; i++) await ensureDocumentsForArranged(27, shop, env('NEW1'));
  expect(m.requestDocumentCreation).not.toHaveBeenCalled(); expect(m.claimDocAttempt).not.toHaveBeenCalled();
  expect(store.rows.find(r => r.order_sn === 'NEW1')!.status).toBe('doc_skipped');
  expect(m.getOrderDetail).toHaveBeenCalledTimes(1);
});
it('error response and uncertain exception are terminal (no automatic retry)', async () => {
  m.requestDocumentCreation.mockResolvedValue('create_error_response');
  for (let i = 0; i < 3; i++) await ensureDocumentsForArranged(27, shop, env('NEW1'));
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(1); expect(store.rows.find(r => r.order_sn === 'NEW1')!.status).toBe('doc_failed');
  vi.clearAllMocks(); store.rows.find(r => r.order_sn === 'NEW1')!.status = 'requested';
  m.getOrderDetail.mockImplementation(detail('PROCESSED')); m.requestDocumentCreation.mockResolvedValue('create_failed');
  for (let i = 0; i < 3; i++) await ensureDocumentsForArranged(27, shop, env('NEW1'));
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(1); expect(store.rows.find(r => r.order_sn === 'NEW1')!.status).toBe('doc_claimed');
});
it('create NOT sent (no tracking yet) releases the claim so it can be tried later; READY is recorded', async () => {
  m.requestDocumentCreation.mockResolvedValueOnce('no_tracking').mockResolvedValueOnce('already_ready');
  await ensureDocumentsForArranged(27, shop, env('NEW1'));
  expect(store.rows.find(r => r.order_sn === 'NEW1')!.status).toBe('requested');
  await ensureDocumentsForArranged(27, shop, env('NEW1'));
  expect(store.rows.find(r => r.order_sn === 'NEW1')!.status).toBe('doc_ready');
  expect(m.arrangeShipment).not.toHaveBeenCalled();
});
it('concurrent cycles: only one wins the durable claim', async () => {
  let n = 0; m.requestDocumentCreation.mockImplementation(async () => { n++; await new Promise(r => setTimeout(r, 5)); return 'create_sent_ok'; });
  await Promise.all([ensureDocumentsForArranged(27, shop, env('NEW1')), ensureDocumentsForArranged(27, shop, env('NEW1'))]);
  expect(n).toBe(1);
});
