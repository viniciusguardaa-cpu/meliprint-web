import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../db.js', () => ({ claimArrangeAttempt: vi.fn(), finishArrangeAttempt: vi.fn(), getRecentlyArrangedPackages: vi.fn(), getArrangeAttempts: vi.fn() }));
vi.mock('../services/shopee.js', () => ({ getShipmentList: vi.fn(), getOrderDetail: vi.fn(), getShippingParameter: vi.fn(), requestDocumentCreation: vi.fn(), arrangeShipment: vi.fn(), hasValidInvoice: (o: any) => o.invoice_data?.status === 'valid' }));
import { getShipmentList, getOrderDetail, getShippingParameter, arrangeShipment } from '../services/shopee.js';
import { getArrangeAttempts, claimArrangeAttempt } from '../db.js';
import { arrangeReadyShipments } from '../services/shopeeArrange.js';
const shop = { accessToken: 'test', shopId: 's' };
const order = { order_sn: 'A', order_status: 'READY_TO_SHIP', invoice_data: { status: 'valid' }, package_list: [{ package_number: 'P1' }, { package_number: 'P2' }] };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(getShipmentList).mockResolvedValue([{ order_sn: 'A', package_number: 'P1' }]); vi.mocked(getArrangeAttempts).mockResolvedValue([]); });
afterEach(() => vi.useRealTimers());
it('skips durable attempts before order-detail and parameter calls', async () => {
  vi.mocked(getArrangeAttempts).mockResolvedValue([{ order_sn: 'A', package_number: 'P1' }]);
  expect((await arrangeReadyShipments(1, shop, 'dropoff')).skipped).toBe(1);
  expect(getOrderDetail).not.toHaveBeenCalled(); expect(getShippingParameter).not.toHaveBeenCalled(); expect(arrangeShipment).not.toHaveBeenCalled();
});
it('skips known packages of split orders but permits untouched packages', async () => {
  vi.useFakeTimers();
  vi.mocked(getShipmentList).mockResolvedValue([{ order_sn: 'A', package_number: 'P1' }, { order_sn: 'A', package_number: 'P2' }]);
  vi.mocked(getArrangeAttempts).mockResolvedValue([{ order_sn: 'A', package_number: 'P1' }]);
  vi.mocked(getOrderDetail).mockResolvedValue([order as any]);
  vi.mocked(getShippingParameter).mockResolvedValue({ info_needed: { dropoff: [] } });
  vi.mocked(claimArrangeAttempt).mockResolvedValue(true);
  const pending = arrangeReadyShipments(2, shop, 'dropoff'); await vi.runAllTimersAsync();
  expect((await pending).arranged).toBe(1);
  expect(getShippingParameter).toHaveBeenCalledTimes(1);
  expect(arrangeShipment).toHaveBeenCalledWith(shop, { order_sn: 'A', package_number: 'P2', dropoff: {} });
});
it('caches ineligible orders for only 60s, scoped to account and method', async () => {
  vi.useFakeTimers(); vi.mocked(getOrderDetail).mockResolvedValue([{ ...order, invoice_data: null } as any]);
  await arrangeReadyShipments(3, shop, 'dropoff'); await arrangeReadyShipments(3, shop, 'dropoff');
  expect(getOrderDetail).toHaveBeenCalledTimes(1);
  await arrangeReadyShipments(4, shop, 'dropoff'); await arrangeReadyShipments(3, shop, 'pickup');
  expect(getOrderDetail).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60_001); await arrangeReadyShipments(3, shop, 'dropoff');
  expect(getOrderDetail).toHaveBeenCalledTimes(4);
});
it('respects a failed atomic claim without calling ship_order', async () => {
  vi.mocked(getOrderDetail).mockResolvedValue([order as any]); vi.mocked(getShippingParameter).mockResolvedValue({ info_needed: { dropoff: [] } });
  vi.mocked(claimArrangeAttempt).mockResolvedValue(false);
  expect((await arrangeReadyShipments(5, shop, 'dropoff')).arranged).toBe(0); expect(arrangeShipment).not.toHaveBeenCalled();
});
