import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getPrintableOrderSns, getReadyLabelPdfs } from '../services/shopee.js';
import { shopeeProvider } from '../providers/shopee.js';

const shop = { accessToken: 'test', shopId: 'failure-visibility' };
const order = { order_sn: 'A', order_status: 'PROCESSED', invoice_data: {
  status: 'valid', number: '1', access_key: '1'.repeat(44), issue_date: 1,
} };
const json = (response: unknown, status = 200) => new Response(JSON.stringify({ response }), { status });
beforeEach(() => { vi.stubEnv('SHOPEE_PARTNER_ID', '1'); vi.stubEnv('SHOPEE_PARTNER_KEY', 'test'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('propagates processed-order discovery failures rather than silently dropping them', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => String(input).includes('get_order_list')
    ? json({}, 503) : json({ order_list: [] })));
  await expect(getPrintableOrderSns(shop)).rejects.toThrow('HTTP 503');
});

it('propagates order-detail failures to the account warning', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    if (String(input).includes('get_order_detail')) return json({}, 503);
    return json({ order_list: String(input).includes('get_shipment_list') ? [{ order_sn: 'A' }] : [] });
  }));
  await expect(shopeeProvider.listReadyShipments({ accountId: 1, provider: 'shopee', externalUserId: shop.shopId, accessToken: shop.accessToken }, {})).rejects.toThrow('HTTP 503');
});

it('reports transport failures while keeping unconfirmed labels unprintable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable'); }));
  const failed = vi.fn();
  expect((await getReadyLabelPdfs(shop, [order], failed)).size).toBe(0);
  expect(failed).toHaveBeenCalledOnce();
});

it('treats a confirmed processing document as pending, without claiming a transport failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => String(input).includes('get_shipping_document_parameter')
    ? json({ result_list: [{ order_sn: 'A', suggest_shipping_document_type: 'NORMAL_AIR_WAYBILL' }] })
    : json({ result_list: [{ order_sn: 'A', status: 'PROCESSING' }] })));
  const failed = vi.fn();
  expect((await getReadyLabelPdfs(shop, [order], failed)).size).toBe(0);
  expect(failed).not.toHaveBeenCalled();
});
