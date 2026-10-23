import { beforeEach, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ search: vi.fn(), orders: vi.fn(), shipment: vi.fn() }));
vi.mock('../services/mercadolivre.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/mercadolivre.js')>(),
  searchShipments: api.search, getOrders: api.orders, getShipment: api.shipment,
}));
import { mercadolivreProvider } from '../providers/mercadolivre.js';
import { ShipmentListError } from '../providers/types.js';

const context = { accountId: 1, provider: 'mercadolivre', externalUserId: '100', accessToken: 'test' };
beforeEach(() => {
  vi.resetAllMocks();
  api.search.mockResolvedValue([]); api.orders.mockResolvedValue([]);
});
it('rejects failed discovery instead of claiming the seller has no orders', async () => {
  api.search.mockRejectedValue(new Error('unavailable')); api.orders.mockRejectedValue(new Error('unavailable'));
  await expect(mercadolivreProvider.listReadyShipments(context, {})).rejects.toThrow('discovery unavailable');
});
it('allows the orders fallback when shipment search is unavailable', async () => {
  api.search.mockRejectedValue(new Error('unavailable'));
  api.orders.mockResolvedValue([{ id: 2, shipping: { id: 1 }, order_items: [], buyer: {} }]);
  api.shipment.mockResolvedValue({ id: 1, status: 'ready_to_ship', substatus: 'ready_to_print' });
  expect(await mercadolivreProvider.listReadyShipments(context, {})).toHaveLength(1);
});
it('marks rows incomplete if order details could not be fetched', async () => {
  api.search.mockResolvedValue([1]); api.orders.mockRejectedValue(new Error('unavailable'));
  api.shipment.mockResolvedValue({ id: 1, status: 'ready_to_ship', substatus: 'ready_to_print' });
  try {
    await mercadolivreProvider.listReadyShipments(context, {});
    throw new Error('Expected incomplete results');
  } catch (error) {
    expect(error).toBeInstanceOf(ShipmentListError);
    expect((error as ShipmentListError).shipments).toHaveLength(1);
  }
});
