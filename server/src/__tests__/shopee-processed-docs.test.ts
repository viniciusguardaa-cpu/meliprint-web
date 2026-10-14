import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  getProcessedOrders: vi.fn(), getOrderDetail: vi.fn(), requestDocumentCreation: vi.fn(),
  getShipmentList: vi.fn(), getShippingParameter: vi.fn(), arrangeShipment: vi.fn(),
  claimArrangeAttempt: vi.fn(), finishArrangeAttempt: vi.fn(), getRecentlyArrangedPackages: vi.fn(), getArrangeAttempts: vi.fn()
}));
vi.mock('../services/shopee.js', () => ({ ...m, hasValidInvoice: (o: any) => o.invoice_data?.status === 'valid' }));
vi.mock('../db.js', () => ({ claimArrangeAttempt: m.claimArrangeAttempt, finishArrangeAttempt: m.finishArrangeAttempt, getRecentlyArrangedPackages: m.getRecentlyArrangedPackages, getArrangeAttempts: m.getArrangeAttempts }));
import { ensureDocumentsForProcessed, processedDocsEnabled } from '../services/shopeeArrange.js';
const shop = { accessToken: 't', shopId: 's' };
const on = { SHOPEE_PROCESSED_DOCS_ACCOUNT_IDS: '27', SHOPEE_PROCESSED_DOCS_ORDER_SNS: 'A' } as any;
const o = (sn: string, extra: any = {}) => ({ order_sn: sn, order_status: 'PROCESSED', invoice_data: { status: 'valid' }, package_list: [{ package_number: sn + 'P' }], ...extra });
beforeEach(() => {
  vi.clearAllMocks();
  m.claimArrangeAttempt.mockResolvedValue(true);
  m.getProcessedOrders.mockResolvedValue([{ order_sn: 'A' }, { order_sn: 'B' }]);
  m.getOrderDetail.mockImplementation(async (_s: any, sns: string[]) => sns.map(sn => o(sn)));
});
it('is off unless BOTH the account id and an order_sn are allowlisted; other accounts never enter', async () => {
  expect(processedDocsEnabled(27, {})).toBe(false);
  expect(processedDocsEnabled(27, { SHOPEE_PROCESSED_DOCS_ACCOUNT_IDS: '27' } as any)).toBe(false);
  expect(processedDocsEnabled(27, { SHOPEE_PROCESSED_DOCS_ORDER_SNS: 'A' } as any)).toBe(false);
  expect(processedDocsEnabled(28, on)).toBe(false);
  expect(await ensureDocumentsForProcessed(28, shop, on)).toBe(0);
  expect(await ensureDocumentsForProcessed(27, shop, {} as any)).toBe(0);
  expect(m.getProcessedOrders).not.toHaveBeenCalled();
  expect(m.requestDocumentCreation).not.toHaveBeenCalled();
});
it('requests exactly the allowlisted order (not B), claims before create, never ship_order', async () => {
  const order: string[] = [];
  m.claimArrangeAttempt.mockImplementation(async () => { order.push('claim'); return true; });
  m.requestDocumentCreation.mockImplementation(async () => { order.push('create'); });
  expect(await ensureDocumentsForProcessed(27, shop, on)).toBe(1);
  expect(m.getOrderDetail).toHaveBeenCalledWith(shop, ['A']);
  expect(m.requestDocumentCreation.mock.calls.map(c => c.slice(1))).toEqual([['A', 'AP']]);
  expect(m.claimArrangeAttempt).toHaveBeenCalledWith(27, 'A', 'AP', 'doc-once');
  expect(order).toEqual(['claim', 'create']);
  expect(m.arrangeShipment).not.toHaveBeenCalled();
});
it('is one-shot: once claimed (also after restart) later sweeps never request again, even if the create failed', async () => {
  expect(await ensureDocumentsForProcessed(27, shop, on)).toBe(1);
  m.claimArrangeAttempt.mockResolvedValue(false); // durable row survives restart
  expect(await ensureDocumentsForProcessed(27, shop, on)).toBe(0);
  expect(await ensureDocumentsForProcessed(27, shop, on)).toBe(0);
  expect(m.requestDocumentCreation).toHaveBeenCalledTimes(1);
  expect(m.finishArrangeAttempt).not.toHaveBeenCalled(); // stays 'claimed': never feeds the 48h arranged retry path
});
it('skips allowlisted orders that are not PROCESSED, lack valid NF or have a package without number', async () => {
  for (const extra of [{ order_status: 'READY_TO_SHIP' }, { invoice_data: null }, { package_list: [{}] }]) {
    m.getOrderDetail.mockResolvedValue([o('A', extra)]);
    expect(await ensureDocumentsForProcessed(27, shop, on)).toBe(0);
  }
  expect(m.claimArrangeAttempt).not.toHaveBeenCalled();
  expect(m.requestDocumentCreation).not.toHaveBeenCalled();
});
