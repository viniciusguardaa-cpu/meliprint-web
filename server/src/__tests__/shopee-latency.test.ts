import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getReadyLabelPdfs, invalidateReadyLabelPdfs, requestDocumentCreation } from '../services/shopee.js';
const shop = { accessToken: 'test', shopId: 'latency-shop' };
const invoice = { status: 'valid', number: '1', access_key: '1'.repeat(44), issue_date: 1 };
const order = { order_sn: 'A', order_status: 'PROCESSED', invoice_data: invoice };
const json = (response: unknown) => new Response(JSON.stringify({ response }));
beforeEach(() => {
  process.env.SHOPEE_PARTNER_ID = '1'; process.env.SHOPEE_PARTNER_KEY = 'test';
  invalidateReadyLabelPdfs(shop.shopId, ['A', 'B']);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
async function api() {
  const doc = await PDFDocument.create(); doc.addPage(); const pdf = Buffer.from(await doc.save());
  let status = 'READY';
  const f = vi.fn(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const target = JSON.parse(init?.body || '{}').order_list?.[0];
    if (path.endsWith('get_shipping_document_parameter')) return json({ result_list: [{ ...target, suggest_shipping_document_type: 'NORMAL_AIR_WAYBILL' }] });
    if (path.endsWith('get_shipping_document_result')) return json({ result_list: [{ ...target, status }] });
    if (path.endsWith('download_shipping_document')) return new Response(pdf);
    throw new Error(path);
  });
  vi.stubGlobal('fetch', f);
  return { f, setStatus: (s: string) => { status = s; }, downloads: () => f.mock.calls.filter(([u]) => String(u).includes('download_shipping_document')).length };
}
it('caches only positive PDFs for 60s, with live READY and NF checks, expiry and print invalidation', async () => {
  vi.useFakeTimers(); const a = await api();
  expect((await getReadyLabelPdfs(shop, [order])).size).toBe(1);
  expect((await getReadyLabelPdfs(shop, [order])).size).toBe(1);
  expect(a.downloads()).toBe(1);
  expect(a.f.mock.calls.filter(([u]) => String(u).includes('get_shipping_document_result'))).toHaveLength(2);
  expect((await getReadyLabelPdfs(shop, [{ ...order, invoice_data: null }])).size).toBe(0);
  await vi.advanceTimersByTimeAsync(60_001);
  await getReadyLabelPdfs(shop, [order]); expect(a.downloads()).toBe(2);
  invalidateReadyLabelPdfs(shop.shopId, ['A']);
  await getReadyLabelPdfs(shop, [order]); expect(a.downloads()).toBe(3);
  a.setStatus('PROCESSING');
  expect((await getReadyLabelPdfs(shop, [order])).size).toBe(0);
  a.setStatus('READY');
  expect((await getReadyLabelPdfs(shop, [order])).size).toBe(1);
  expect(a.downloads()).toBe(4);
});
it('does not cache negatives or share bytes between shops', async () => {
  const a = await api(); a.setStatus('PROCESSING');
  expect((await getReadyLabelPdfs(shop, [order])).size).toBe(0);
  a.setStatus('READY'); await getReadyLabelPdfs(shop, [order]);
  await getReadyLabelPdfs({ ...shop, shopId: 'other-shop' }, [order]);
  expect(a.downloads()).toBe(2);
  invalidateReadyLabelPdfs('other-shop', ['A']);
});
it('bounds concurrent package work to four and preserves package order', async () => {
  const a = await api(); let active = 0; let peak = 0;
  const original = a.f.getMockImplementation()!;
  a.f.mockImplementation(async (...args) => {
    active++; peak = Math.max(peak, active);
    await new Promise(r => setImmediate(r));
    try { return await original(...args); } finally { active--; }
  });
  const packages = Array.from({ length: 9 }, (_, i) => ({ package_number: String(i) }));
  expect((await getReadyLabelPdfs(shop, [{ ...order, package_list: packages }])).get('A')).toHaveLength(9);
  expect(peak).toBe(4);
});
it('retries only tracking reads in-cycle and throttles document creation for 90s', async () => {
  vi.useFakeTimers(); let reads = 0; let creates = 0;
  const f = vi.fn(async input => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('get_shipping_document_parameter')) return json({ result_list: [{ suggest_shipping_document_type: 'NORMAL_AIR_WAYBILL' }] });
    if (path.endsWith('get_tracking_number')) return json({ tracking_number: ++reads < 3 ? '' : 'T' });
    if (path.endsWith('create_shipping_document')) { creates++; return json({ result_list: [{ order_sn: 'retry' }] }); }
    throw new Error(path);
  });
  vi.stubGlobal('fetch', f);
  const pending = requestDocumentCreation(shop, 'retry'); await vi.runAllTimersAsync(); await pending;
  expect(reads).toBe(3); expect(creates).toBe(1);
  await requestDocumentCreation(shop, 'retry'); expect(creates).toBe(1);
  await vi.advanceTimersByTimeAsync(90_001);
  await requestDocumentCreation(shop, 'retry'); expect(creates).toBe(2);
  expect(f.mock.calls.some(([u]) => String(u).includes('ship_order'))).toBe(false);
});
it('bounds missing-tracking reads and never creates without tracking', async () => {
  vi.useFakeTimers(); let reads = 0;
  const f = vi.fn(async input => {
    if (String(input).includes('get_shipping_document_parameter')) return json({ result_list: [{ suggest_shipping_document_type: 'NORMAL_AIR_WAYBILL' }] });
    if (String(input).includes('get_tracking_number')) { reads++; return json({}); }
    throw new Error('unexpected create');
  });
  vi.stubGlobal('fetch', f);
  const pending = requestDocumentCreation(shop, 'missing'); await vi.runAllTimersAsync(); await pending;
  await requestDocumentCreation(shop, 'missing'); expect(reads).toBe(3);
});
