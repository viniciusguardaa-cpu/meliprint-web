import { describe, it, expect, vi } from 'vitest';
vi.mock('../services/shopee.js', () => ({
  buildAuthUrl: vi.fn(), exchangeCodeForToken: vi.fn(), refreshAccessToken: vi.fn(), getShopInfo: vi.fn(),
  getShipmentList: vi.fn(), getPrintableOrderSns: vi.fn(), getProcessedOrders: vi.fn(),
  invalidateReadyLabelPdfs: vi.fn(), getReadyLabelPdfs: vi.fn(), getOrderDetail: vi.fn()
}));
import { shopeeProvider } from '../providers/shopee.js';
import { getProcessedOrders, getOrderDetail, getReadyLabelPdfs, getPrintableOrderSns } from '../services/shopee.js';
const ctx = { accountId: 1, provider: 'shopee', externalUserId: '123', accessToken: 'test' };
describe('Shopee automatic labels', () => {
  it('only discovers seller-arranged PROCESSED orders', async () => {
    vi.mocked(getProcessedOrders).mockResolvedValue([{ order_sn: 'A' }, { order_sn: 'A' }]);
    vi.mocked(getOrderDetail).mockResolvedValue([{ order_sn: 'A' }]);
    vi.mocked(getReadyLabelPdfs).mockResolvedValue(new Map([['A', [Buffer.from('%PDF-test')]]]));
    expect(await shopeeProvider.listAutoPrintableShipmentIds!(ctx)).toEqual(['A']);
    expect(getPrintableOrderSns).not.toHaveBeenCalled();
  });
  it('fails the complete job if any package is unavailable', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue([{ order_sn: 'A', package_list: [{ package_number: 'P1' }, { package_number: 'P2' }] }] as any);
    vi.mocked(getReadyLabelPdfs).mockResolvedValueOnce(new Map());
    await expect(shopeeProvider.getLabelsPDF(ctx, ['A'])).rejects.toThrow('todos os pacotes');
  });
  it('does not fall back to order-level printing when package detail fails', async () => {
    vi.mocked(getOrderDetail).mockRejectedValueOnce(new Error('timeout'));
    await expect(shopeeProvider.getLabelsPDF(ctx, ['A'])).rejects.toThrow('timeout');
  });
});

it('snapshots pending and processed orders with strict pagination before readiness checks', async () => {
  const { getShipmentList } = await import('../services/shopee.js');
  vi.mocked(getShipmentList).mockResolvedValue([{ order_sn: 'WAITING_DOCUMENT' }]);
  vi.mocked(getProcessedOrders).mockResolvedValue([{ order_sn: 'OLD' }, { order_sn: 'OLD' }]);
  expect(await shopeeProvider.listAutoPrintBaselineShipmentIds!(ctx)).toEqual(['WAITING_DOCUMENT', 'OLD']);
  expect(getShipmentList).toHaveBeenCalledWith({ accessToken: 'test', shopId: '123' }, 2000, true);
  expect(getProcessedOrders).toHaveBeenLastCalledWith({ accessToken: 'test', shopId: '123' }, 2000, true);
});
it('excludes old/missing creation timestamps even if an old order newly appears in discovery', async () => {
  vi.mocked(getProcessedOrders).mockResolvedValue([{ order_sn: 'OLD_OUTSIDE_SNAPSHOT' }, { order_sn: 'MISSING_TIME' }, { order_sn: 'NEW' }]);
  vi.mocked(getOrderDetail).mockResolvedValue([{ order_sn: 'OLD_OUTSIDE_SNAPSHOT', create_time: 100 }, { order_sn: 'MISSING_TIME' }, { order_sn: 'NEW', create_time: 1001 }]);
  vi.mocked(getReadyLabelPdfs).mockImplementation(async (_shop, orders) => new Map(orders.map(order => [order.order_sn, [Buffer.from('%PDF-test')]])));
  expect(await shopeeProvider.listAutoPrintableShipmentIds!(ctx, { createdAfter: 1000 })).toEqual(['NEW']);
});
