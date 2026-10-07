import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLabelPdf } from '../services/shopee.js';

const SHOP = { accessToken: 'token', shopId: '377053425' };
const ORDER = '260930CN5G6DMP';
const PKG = 'OFG244435051153248';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return new Response(JSON.stringify(body), {
    status: ok ? status : (status >= 400 ? status : 500),
    headers: { 'Content-Type': 'application/json' }
  });
}

function pdfResponse(bytes: Uint8Array) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' }
  });
}

function calledPath(call: unknown[]): string {
  return new URL(String(call[0])).pathname;
}

describe('getLabelPdf error reporting', () => {
  beforeEach(() => {
    process.env.SHOPEE_PARTNER_ID = '2047119';
    process.env.SHOPEE_PARTNER_KEY = 'test-key';
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('surfaces Shopee\'s per-package failure hidden behind common.batch_api_all_failed', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const path = calledPath([input]);
      if (path.endsWith('get_shipping_document_parameter')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER, suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }] } });
      }
      if (path.endsWith('get_tracking_number')) {
        return jsonResponse({ response: { tracking_number: 'BR123' } });
      }
      if (path.endsWith('create_shipping_document')) {
        return jsonResponse({
          error: 'common.batch_api_all_failed',
          message: 'batch api all failed',
          response: {
            result_list: [{
              order_sn: ORDER,
              package_number: PKG,
              fail_error: 'logistics.package_can_not_print',
              fail_message: 'The package can not print now. Detail: The document is not yet ready for printing. Please try again later.'
            }]
          }
        });
      }
      throw new Error(`unexpected call ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers();
    const pending = expect(getLabelPdf(SHOP, ORDER, PKG)).rejects.toThrow(
      /logistics\.package_can_not_print.*not yet ready.*Aguarde alguns minutos/s
    );
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock.mock.calls.filter(c => calledPath(c).endsWith('create_shipping_document'))).toHaveLength(3);
  });

  it('still returns the PDF on the happy path', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);
    const fetchMock = vi.fn(async (input: unknown) => {
      const path = calledPath([input]);
      if (path.endsWith('get_shipping_document_parameter')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER, suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }] } });
      }
      if (path.endsWith('get_tracking_number')) return jsonResponse({ response: {} });
      if (path.endsWith('create_shipping_document')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER }] } });
      }
      if (path.endsWith('get_shipping_document_result')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER, status: 'READY' }] } });
      }
      if (path.endsWith('download_shipping_document')) return pdfResponse(pdfBytes);
      throw new Error(`unexpected call ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pdf = await getLabelPdf(SHOP, ORDER, PKG);
    expect(pdf).not.toBeNull();
    expect(Buffer.from(pdf!).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('keeps swallowing whole-call transport failures only where it always did (tracking number)', async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const path = calledPath([input]);
      if (path.endsWith('get_shipping_document_parameter')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER, suggest_shipping_document_type: 'THERMAL_AIR_WAYBILL' }] } });
      }
      if (path.endsWith('get_tracking_number')) throw new Error('socket hangup');
      if (path.endsWith('create_shipping_document')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER }] } });
      }
      if (path.endsWith('get_shipping_document_result')) {
        return jsonResponse({ response: { result_list: [{ order_sn: ORDER, status: 'READY' }] } });
      }
      if (path.endsWith('download_shipping_document')) return pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
      throw new Error(`unexpected call ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getLabelPdf(SHOP, ORDER, PKG)).resolves.not.toBeNull();
  });
});
