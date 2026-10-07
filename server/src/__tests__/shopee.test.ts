import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildAuthUrl,
  getOrderDetail,
  getLabelPdf,
  getPrintableOrderSns
} from '../services/shopee.js';

const shop = { accessToken: 'tok', shopId: '123' };

function jsonRes(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('shopee client', () => {
  beforeEach(() => {
    process.env.SHOPEE_PARTNER_ID = '1000';
    process.env.SHOPEE_PARTNER_KEY = 'test-key';
    delete process.env.SHOPEE_API_HOST;
    delete process.env.SHOPEE_AUTH_HOST;
  });
  afterEach(() => vi.restoreAllMocks());

  it('builds the new authorization URL with state', () => {
    const url = new URL(buildAuthUrl('https://labelgo.com.br/cb', 'st4te'));
    expect(url.origin + url.pathname).toBe('https://open.shopee.com.br/auth');
    expect(url.searchParams.get('partner_id')).toBe('1000');
    expect(url.searchParams.get('auth_type')).toBe('seller');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://labelgo.com.br/cb');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  it('uses the sandbox authorization page for a sandbox API host', () => {
    process.env.SHOPEE_API_HOST = 'https://openplatform.sandbox.test-stable.shopee.sg';
    expect(buildAuthUrl('https://x/cb', 's')).toContain('https://open.sandbox.test-stable.shopee.com.br/auth?');
  });

  it('calls get_order_detail with GET and query params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes({ response: { order_list: [{ order_sn: 'A' }] } }));
    const out = await getOrderDetail(shop, ['A', 'B']);
    expect(out).toEqual([{ order_sn: 'A' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(init?.method ?? 'GET').toBe('GET');
    expect(url).toContain('/api/v2/order/get_order_detail?');
    expect(url).toContain('order_sn_list=A%2CB');
  });

  it('merges READY_TO_SHIP and PROCESSED orders without duplicates', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('get_shipment_list')) {
        return jsonRes({ response: { order_list: [{ order_sn: 'A' }, { order_sn: 'A', package_number: 'p2' }], more: false } });
      }
      if (url.includes('get_order_list')) {
        expect(url).toContain('order_status=PROCESSED');
        return jsonRes({ response: { order_list: [{ order_sn: 'B' }, { order_sn: 'A' }], more: false } });
      }
      throw new Error('unexpected ' + url);
    });
    expect(await getPrintableOrderSns(shop)).toEqual(['A', 'B']);
  });

  it('never calls ship_order / get_shipping_parameter and uses the suggested document type', async () => {
    const calls: Array<{ url: string; body?: any }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, body });
      if (url.includes('get_shipping_document_parameter')) {
        return jsonRes({ response: { result_list: [{ order_sn: 'A', suggest_shipping_document_type: 'NORMAL_AIR_WAYBILL' }] } });
      }
      if (url.includes('get_tracking_number')) return jsonRes({ response: { tracking_number: 'TRK1' } });
      if (url.includes('create_shipping_document')) return jsonRes({ response: { result_list: [{ order_sn: 'A' }] } });
      if (url.includes('get_shipping_document_result')) return jsonRes({ response: { result_list: [{ order_sn: 'A', status: 'READY' }] } });
      if (url.includes('download_shipping_document')) {
        return new Response(Buffer.from('%PDF-1.4'), { status: 200, headers: { 'content-type': 'application/pdf' } });
      }
      throw new Error('unexpected ' + url);
    });
    const pdf = await getLabelPdf(shop, 'A', 'PKG1');
    expect(pdf?.toString()).toBe('%PDF-1.4');
    expect(calls.some((c) => /ship_order|get_shipping_parameter/.test(c.url))).toBe(false);
    const create = calls.find((c) => c.url.includes('create_shipping_document'))!;
    expect(create.body.order_list[0]).toMatchObject({
      order_sn: 'A', package_number: 'PKG1', tracking_number: 'TRK1', shipping_document_type: 'NORMAL_AIR_WAYBILL'
    });
    const dl = calls.find((c) => c.url.includes('download_shipping_document'))!;
    expect(dl.body.shipping_document_type).toBe('NORMAL_AIR_WAYBILL');
  });

  it('reports unavailable documents without shipping anything', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonRes({ response: { result_list: [{ order_sn: 'A', fail_error: 'logistics.order_status_error' }] } })
    );
    await expect(getLabelPdf(shop, 'A')).rejects.toThrow('logistics.order_status_error');
    expect(fetchMock.mock.calls.every(([u]) => !/ship_order/.test(String(u)))).toBe(true);
  });
});
