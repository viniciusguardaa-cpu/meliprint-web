import { describe, it, expect, vi } from 'vitest';
vi.mock('../services/shopee.js', () => ({
  buildAuthUrl: vi.fn(), exchangeCodeForToken: vi.fn(), refreshAccessToken: vi.fn(), getShopInfo: vi.fn(),
  getShipmentList: vi.fn(), getPrintableOrderSns: vi.fn(), getProcessedOrders: vi.fn(),
  checkPrintEligibility: vi.fn(), getOrderDetail: vi.fn(), getLabelPdf: vi.fn()
}));
import { shopeeProvider } from '../providers/shopee.js';
import { getProcessedOrders, getOrderDetail, getLabelPdf, getPrintableOrderSns, checkPrintEligibility } from '../services/shopee.js';
const ctx = { accountId: 1, provider: 'shopee', externalUserId: '123', accessToken: 'test' };
describe('Shopee automatic labels', () => {
  it('only discovers seller-arranged PROCESSED orders', async () => {
    vi.mocked(getProcessedOrders).mockResolvedValue([{ order_sn: 'A' }, { order_sn: 'A' }]);
    vi.mocked(getOrderDetail).mockResolvedValue([{ order_sn: 'A' }]);
    vi.mocked(checkPrintEligibility).mockResolvedValue(new Map([['A', { canRequest: true }]]));
    expect(await shopeeProvider.listAutoPrintableShipmentIds!(ctx)).toEqual(['A']);
    expect(getPrintableOrderSns).not.toHaveBeenCalled();
  });
  it('fails the complete job if any package is unavailable', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue([{ order_sn: 'A', package_list: [{ package_number: 'P1' }, { package_number: 'P2' }] }] as any);
    vi.mocked(getLabelPdf).mockResolvedValueOnce(Buffer.from('%PDF-1.4')).mockResolvedValueOnce(null);
    await expect(shopeeProvider.getLabelsPDF(ctx, ['A'])).rejects.toThrow('P2');
  });
  it('does not fall back to order-level printing when package detail fails', async () => {
    vi.mocked(getOrderDetail).mockRejectedValueOnce(new Error('timeout'));
    await expect(shopeeProvider.getLabelsPDF(ctx, ['A'])).rejects.toThrow('timeout');
  });
});
