import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  getShipmentList: vi.fn(), getProcessedOrders: vi.fn(), getOrderDetail: vi.fn(), getShippingParameter: vi.fn(),
  requestDocumentCreation: vi.fn(), arrangeShipment: vi.fn(), diagnoseDocument: vi.fn(),
  claimArrangeAttempt: vi.fn(), finishArrangeAttempt: vi.fn(), getRecentlyArrangedPackages: vi.fn(), getArrangeAttempts: vi.fn(),
  getArrangeAttemptDetail: vi.fn(), getRecentlyArrangedPackagesAll: vi.fn(), markPackageNotPrintable: vi.fn()
}));
vi.mock('../services/shopee.js', () => ({ ...m, hasValidInvoice: () => true }));
vi.mock('../db.js', () => m);
import { ensureDocumentsForArranged } from '../services/shopeeArrange.js';
const shop = { accessToken: 't', shopId: 's' };
beforeEach(() => vi.clearAllMocks());
it('package_can_not_print is marked terminal once; other outcomes are not marked; never ship_order', async () => {
  m.getRecentlyArrangedPackages.mockResolvedValue([
    { order_sn: 'A', package_number: 'PA' }, { order_sn: 'B', package_number: 'PB' }, { order_sn: 'C', package_number: 'PC' }]);
  m.requestDocumentCreation.mockImplementation(async (_s: any, sn: string) =>
    sn === 'A' ? 'package_not_printable' : sn === 'B' ? 'create_error_response' : 'already_ready');
  await ensureDocumentsForArranged(27, shop, {} as any);
  expect(m.markPackageNotPrintable).toHaveBeenCalledTimes(1);
  expect(m.markPackageNotPrintable).toHaveBeenCalledWith(27, 'A', 'PA');
  expect(m.arrangeShipment).not.toHaveBeenCalled();
}, 20000);
