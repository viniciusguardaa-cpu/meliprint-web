import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkPrintEligibility, getLabelPdf } from '../services/shopee.js';
const shop = { accessToken: 'test', shopId: '123' };
const json = (response: unknown) => new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
beforeEach(() => { process.env.SHOPEE_PARTNER_ID = '1'; process.env.SHOPEE_PARTNER_KEY = 'test'; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('blocks the whole order if one package fails, results are missing, or details are unknown', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ response: { result_list: [
    { order_sn: 'A', package_number: 'P1', suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' },
    { order_sn: 'A', package_number: 'P2', fail_error: 'logistics.package_can_not_print', fail_message: 'not yet ready' },
    { order_sn: 'B', suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }
  ] } })));
  const checks = await checkPrintEligibility(shop, [
    { order_sn: 'A', package_list: [{ package_number: 'P1' }, { package_number: 'P2' }] },
    { order_sn: 'B' }, { order_sn: 'C' }
  ]);
  expect(checks.get('A')?.canRequest).toBe(false);
  expect(checks.get('B')?.canRequest).toBe(true);
  expect(checks.get('C')?.canRequest).toBe(false);
  expect(checks.get('unknown')).toBeUndefined();
});
it('fails closed on transport errors instead of claiming ready', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
  const checks = await checkPrintEligibility(shop, [{ order_sn: 'A' }]);
  expect(checks.get('A')?.canRequest).toBe(false);
});
it('batches every package with no more than 50 targets per request', async () => {
  const fetchMock = vi.fn(async (_url, init) => {
    const targets = JSON.parse(init.body).order_list;
    expect(targets.length).toBeLessThanOrEqual(50);
    return json({ response: { result_list: targets.map((t: any) => ({ ...t, suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' })) } });
  });
  vi.stubGlobal('fetch', fetchMock);
  expect((await checkPrintEligibility(shop, Array.from({ length: 51 }, (_, i) => ({ order_sn: String(i) })))).size).toBe(51);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('retries a transient create failure and returns the downloaded PDF, without shipping anything', async () => {
  vi.useFakeTimers();
  let creates = 0;
  const fetchMock = vi.fn(async (input: unknown) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('get_shipping_document_parameter')) return json({ response: { result_list: [{ order_sn: 'A', suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }] } });
    if (path.endsWith('get_tracking_number')) return json({ response: {} });
    if (path.endsWith('create_shipping_document')) return json({ response: { result_list: [++creates < 2
      ? { order_sn: 'A', fail_error: 'logistics.package_can_not_print', fail_message: 'The document is not yet ready' }
      : { order_sn: 'A' }] } });
    if (path.endsWith('get_shipping_document_result')) return json({ response: { result_list: [{ order_sn: 'A', status: 'READY' }] } });
    if (path.endsWith('download_shipping_document')) return new Response('%PDF-1.4', { headers: { 'content-type': 'application/pdf' } });
    throw new Error('unexpected ' + path);
  });
  vi.stubGlobal('fetch', fetchMock);
  const pending = getLabelPdf(shop, 'A');
  await vi.runAllTimersAsync();
  expect((await pending)?.toString()).toBe('%PDF-1.4');
  expect(creates).toBe(2);
  expect(fetchMock.mock.calls.some(c => /ship_order/.test(String(c[0])))).toBe(false);
});
it('does not retry permanent create failure', async () => {
  const fetchMock = vi.fn(async (input: unknown) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('get_shipping_document_parameter')) return json({ response: { result_list: [{ order_sn: 'A', suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }] } });
    if (path.endsWith('get_tracking_number')) return json({ response: {} });
    return json({ response: { result_list: [{ order_sn: 'A', fail_error: 'logistics.order_status_error', fail_message: 'Invalid status' }] } });
  });
  vi.stubGlobal('fetch', fetchMock);
  await expect(getLabelPdf(shop, 'A')).rejects.toThrow('logistics.order_status_error');
  expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('create_shipping_document'))).toHaveLength(1);
});
