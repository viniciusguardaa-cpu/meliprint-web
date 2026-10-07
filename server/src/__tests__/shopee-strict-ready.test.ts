import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getReadyLabelPdfs, getOrderDetail, ShopeeOrderDetail } from '../services/shopee.js';
const shop = { accessToken: 'test', shopId: '123' };
const invoice = { status: 'valid', number: '1', access_key: '1'.repeat(44), issue_date: 1700000000 };
const order = (extra = {}): ShopeeOrderDetail => ({ order_sn: 'A', order_status: 'PROCESSED', invoice_data: invoice, ...extra });
const json = (response: unknown) => new Response(JSON.stringify({ response }));
beforeEach(() => { process.env.SHOPEE_PARTNER_ID = '1'; process.env.SHOPEE_PARTNER_KEY = 'test'; });
afterEach(() => vi.unstubAllGlobals());
async function mockApi(status = 'READY', invalidPdf = false, failSecond = false) {
  const doc = await PDFDocument.create(); doc.addPage([283, 425]); const pdf = await doc.save();
  const fetchMock = vi.fn(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const target = JSON.parse(init?.body || '{}').order_list?.[0];
    if (path.endsWith('get_shipping_document_parameter')) return json({ result_list: [{ ...target, suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }] });
    if (path.endsWith('get_shipping_document_result')) return json({ result_list: [{ ...target, status: failSecond && target.package_number === 'P2' ? 'PROCESSING' : status }] });
    if (path.endsWith('download_shipping_document')) return new Response(invalidPdf ? '%PDF-not-a-valid-document' : Buffer.from(pdf));
    throw new Error('Unexpected write/call ' + path);
  });
  vi.stubGlobal('fetch', fetchMock); return fetchMock;
}
it('requests the documented invoice_data optional field', async () => {
  const f = vi.fn(async (_input: unknown) => json({ order_list: [] })); vi.stubGlobal('fetch', f);
  await getOrderDetail(shop, ['A']);
  expect(new URL(String(f.mock.calls[0][0])).searchParams.get('response_optional_fields')).toContain('invoice_data');
});
it('excludes absent, pending, unknown or incomplete fiscal data, and unarranged orders without document calls', async () => {
  const f = await mockApi();
  for (const data of [null, {}, { ...invoice, status: 'pending' }, { ...invoice, status: 'future' }, { ...invoice, access_key: '' }, { ...invoice, issue_date: 0 }]) {
    expect((await getReadyLabelPdfs(shop, [order({ invoice_data: data })])).size).toBe(0);
  }
  expect((await getReadyLabelPdfs(shop, [order({ order_status: 'READY_TO_SHIP' })])).size).toBe(0);
  expect(f).not.toHaveBeenCalled();
});
it('only returns existing READY documents with a parseable PDF, never creates tasks or ships', async () => {
  const f = await mockApi();
  expect((await getReadyLabelPdfs(shop, [order()])).has('A')).toBe(true);
  expect(f.mock.calls.some(([url]) => /create_shipping_document|ship_order|upload_invoice/.test(String(url)))).toBe(false);
});
it('excludes PROCESSING/FAILED/unknown documents and malformed PDFs', async () => {
  for (const status of ['PROCESSING', 'FAILED', 'UNKNOWN']) {
    await mockApi(status); expect((await getReadyLabelPdfs(shop, [order()])).size).toBe(0);
  }
  await mockApi('READY', true); expect((await getReadyLabelPdfs(shop, [order()])).size).toBe(0);
});
it('fails the whole order when one package is not ready', async () => {
  await mockApi('READY', false, true);
  expect((await getReadyLabelPdfs(shop, [order({ package_list: [{ package_number: 'P1' }, { package_number: 'P2' }] })])).size).toBe(0);
});
it('fails closed on transport errors', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
  expect((await getReadyLabelPdfs(shop, [order()])).size).toBe(0);
});
