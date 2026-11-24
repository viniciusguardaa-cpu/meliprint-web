import { it, expect, vi, afterEach } from 'vitest';
import { getProcessedOrders, getShipmentList } from '../services/shopee.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
const shop = { shopId: '1', accessToken: 'mock' };
function mockPages(pages: unknown[]) {
  vi.stubEnv('SHOPEE_PARTNER_ID', '123'); vi.stubEnv('SHOPEE_PARTNER_KEY', 'test');
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ response: pages.shift() }), { status: 200 }));
}
it('consumes every page for the safe activation snapshot', async () => {
  const fetch = mockPages([{ order_list: [{ order_sn: 'A' }], more: true, next_cursor: 'next' }, { order_list: [{ order_sn: 'B' }], more: false }]);
  expect(await getProcessedOrders(shop, 2000, true)).toEqual([{ order_sn: 'A' }, { order_sn: 'B' }]);
  expect(String(fetch.mock.calls[1][0])).toContain('cursor=next');
});
it.each([getProcessedOrders, getShipmentList])('fails closed for a missing cursor or capped listing', async list => {
  mockPages([{ order_list: [{ order_sn: 'A' }], more: true }]);
  await expect(list(shop, 1, true)).rejects.toThrow('baseline');
});
it.each([{ more: false }, { order_list: [], more: 'false' }, { order_list: [{ wrong_id: 'A' }], more: false }])('rejects malformed snapshot data', async response => {
  mockPages([response]);
  await expect(getShipmentList(shop, 2000, true)).rejects.toThrow('Incomplete');
});
