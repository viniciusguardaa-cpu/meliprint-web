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
