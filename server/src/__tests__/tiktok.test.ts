import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { tiktokProvider } from '../providers/tiktok.js';
import { externalId, orderEligible, safeDocumentUrl, searchOrders, signTikTok, shopFor, type TikTokOrder } from '../services/tiktok.js';
import type { AccountContext } from '../providers/types.js';

const ctx: AccountContext = { accountId: 7, provider: 'tiktok', externalUserId: '9000000000000000001', accessToken: 'seller-token', refreshToken: 'refresh-token' };
const shop = { id: ctx.externalUserId, name: 'Demo BR', cipher: 'cipher-owned', region: 'BR' };
const packageId = '9000000000000000101';
const order: TikTokOrder = { id: '9000000000000000201', create_time: 2000, status: 'AWAITING_COLLECTION', shipping_type: 'TIKTOK',
  fulfillment_type: 'FULFILLMENT_BY_SELLER', need_upload_invoice: 'INVOICE_UPLOADED', packages: [{ id: packageId }],
  line_items: [{ product_name: 'Item simulado', package_id: packageId }] };
const pkg = { package_id: packageId, orders: [{ id: order.id }], shipping_type: 'TIKTOK', package_status: 'PROCESSING', package_sub_status: 'RTS' };
const scopes = ['seller.authorization.info', 'seller.order.info', 'seller.fulfillment.basic'];
const token = () => ({ access_token: 'new-token', refresh_token: 'new-refresh', access_token_expire_in: Math.floor(Date.now() / 1000) + 604800, user_type: 0, granted_scopes: scopes });
const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, data }), { headers: { 'content-type': 'application/json' } });
let label: Buffer;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.stubEnv('TIKTOK_ENABLED', '1'); vi.stubEnv('TIKTOK_APP_KEY', 'test-key');
  vi.stubEnv('TIKTOK_APP_SECRET', 'test-secret'); vi.stubEnv('TIKTOK_SERVICE_ID', 'test-service');
  const pdf = await PDFDocument.create(); const page = pdf.addPage([297.64, 419.53]);
  page.drawText('TikTok SIMULADO 123456789'); label = Buffer.from(await pdf.save());
  fetchMock = vi.fn(async (input: URL, _init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    if (url.hostname === 'auth.tiktok-shops.com') return ok(token());
    if (url.hostname === 'p16-oec.byteoversea.com') return new Response(new Uint8Array(label));
    if (url.pathname === '/authorization/202309/shops') return ok({ shops: [shop] });
    if (url.pathname === '/order/202309/orders/search') return ok({ orders: [order], total_count: 1 });
    if (url.pathname === '/order/202309/orders') return ok({ orders: [order] });
    if (url.pathname.endsWith('/shipping_documents')) return ok({ doc_url: 'https://p16-oec.byteoversea.com/test-label.pdf' });
    if (url.pathname === `/fulfillment/202309/packages/${packageId}`) return ok(pkg);
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('TikTok public seller connection', () => {
  it('matches the official HMAC vector and excludes sign/access_token', () => {
    expect(signTikTok('/authorization/202309/shops', { app_key: '29a39d', timestamp: '1623812664', sign: 'ignored', access_token: 'ignored' }, 'e59af819cc'))
      .toBe('b596b73e0cc6de07ac26f036364178ab16b0a907af13d43f0a0cd2345f582dc8');
    expect(signTikTok('/test', { b: '2', a: '1' }, 's', '{"x":1}')).not.toBe(signTikTok('/test', { a: '1', b: '2' }, 's', '{ "x":1}'));
  });
  it('keeps rollout disabled by default and uses BR seller authorization with state', () => {
    vi.stubEnv('TIKTOK_ENABLED', '0'); expect(tiktokProvider.isConfigured()).toBe(false);
    expect(() => tiktokProvider.getAuthUrl('', 'state', '')).toThrow();
    vi.stubEnv('TIKTOK_ENABLED', '1');
    const url = new URL(tiktokProvider.getAuthUrl('', 'single-use-state', ''));
    expect(url.origin).toBe('https://services.tiktokshop.com');
    expect(url.searchParams.get('state')).toBe('single-use-state');
    expect(url.searchParams.get('service_id')).toBe('test-service');
    expect(tiktokProvider.oauthState).toBe('required');
    expect(tiktokProvider.getAuthorizationCode!({ code: 'null', error: 'auth_denied' })).toBeUndefined();
  });
  it('exchanges a single-use code, resolves the granted BR shop, and treats expiry as absolute', async () => {
    const result = await tiktokProvider.exchangeCode('single-use-code', '', '', { shop_id: 'attacker', shop_cipher: 'attacker' });
    expect(result.identity).toEqual({ externalUserId: shop.id, nickname: shop.name });
    expect(result.tokens.expiresAt).toBe(token().access_token_expire_in * 1000);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/v2/token/get');
    expect(url.searchParams.get('grant_type')).toBe('authorized_code');
    expect(url.searchParams.get('auth_code')).toBe('single-use-code');
  });
  it.each([
    { ...token(), user_type: 1 }, { ...token(), granted_scopes: ['seller.order.info'] }
  ])('rejects creator grants or missing scopes', async invalid => {
    fetchMock.mockResolvedValueOnce(ok(invalid));
    await expect(tiktokProvider.exchangeCode('code', '', '')).rejects.toThrow('unauthorized');
  });
  it('fails closed on ambiguous stores and revoked/foreign shop access', async () => {
    fetchMock.mockResolvedValueOnce(ok(token())).mockResolvedValueOnce(ok({ shops: [shop, { ...shop, id: '2' }] }));
    await expect(tiktokProvider.exchangeCode('code', '', '')).rejects.toThrow('exatamente uma');
    await expect(shopFor({ ...ctx, externalUserId: '2' })).rejects.toThrow('unauthorized');
  });
  it('refreshes an expired token without depending on another API call before persistence', async () => {
    expect((await tiktokProvider.refreshTokens(ctx)).refreshToken).toBe('new-refresh');
    const first = new URL(String(fetchMock.mock.calls[0][0]));
    expect(first.pathname).toBe('/api/v2/token/refresh');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not replay a single-use authorization code after upstream failure or expose secrets', async () => {
    fetchMock.mockRejectedValue(new Error('secret URL app_secret=test-secret'));
    await expect(tiktokProvider.exchangeCode('code', '', '')).rejects.toThrow('TikTok Shop: falha na API (-1).');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('TikTok package discovery and label safety', () => {
  it('returns an existing thermal PDF through the same provider contract, without shipping mutations', async () => {
    const rows = await tiktokProvider.listReadyShipments(ctx, { includePacking: true });
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ marketplace: 'tiktok', shipmentId: packageId, accountId: 7, canPrint: true });
    expect(await tiktokProvider.getLabelsPDF(ctx, [packageId])).toEqual(label);
    for (const [input, init] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      if (init?.method === 'POST') expect(url.pathname).toBe('/order/202309/orders/search');
      if (url.hostname === 'open-api.tiktokglobalshop.com') {
        expect(url.searchParams.get('sign')).toBeTruthy();
        if (url.pathname !== '/authorization/202309/shops') expect(url.searchParams.get('shop_cipher')).toBe(shop.cipher);
        expect(url.searchParams.has('access_token')).toBe(false);
      }
      if (url.hostname === 'p16-oec.byteoversea.com') expect(init?.headers).toBeUndefined();
      if (url.pathname.endsWith('/shipping_documents')) {
        expect(url.searchParams.get('document_format')).toBe('PDF'); expect(url.searchParams.get('document_size')).toBe('A6');
      }
    }
  });
  it('snapshots pending orders without fetching labels and strictly excludes old orders packaged later', async () => {
    expect(await tiktokProvider.listAutoPrintBaselineShipmentIds!(ctx)).toEqual([packageId]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/packages/'))).toBe(false);
    expect(await tiktokProvider.listAutoPrintableShipmentIds!(ctx, { createdAfter: order.create_time })).toEqual([]);
    expect(await tiktokProvider.listAutoPrintableShipmentIds!(ctx, { createdAfter: order.create_time - 1 })).toEqual([packageId]);
    await expect(tiktokProvider.listAutoPrintableShipmentIds!(ctx)).rejects.toThrow('activation cutoff');
  });
  it.each([
    { status: 'CANCELLED' }, { shipping_type: 'SELLER' }, { fulfillment_type: 'FULFILLMENT_BY_TIKTOK' },
    { need_upload_invoice: 'NEED_INVOICE' }, { need_upload_invoice: 'UNKNOWN' }, { need_upload_invoice: 'INVOICE_PROCESSING' }, { is_buyer_request_cancel: true }
  ])('excludes unready, non-platform or fiscal-blocked orders: %j', change => {
    expect(orderEligible({ ...order, ...change })).toBe(false);
  });
  it('excludes packages still being arranged or already collected', async () => {
    fetchMock.mockResolvedValueOnce(ok({ shops: [shop] })).mockResolvedValueOnce(ok({ orders: [order], total_count: 1 })).mockResolvedValueOnce(ok({ ...pkg, package_sub_status: 'RTSING' }));
    expect(await tiktokProvider.listPrintableShipmentIds(ctx)).toEqual([]);
  });
  it('rejects combined packages containing an old order even when discovered from a new order', async () => {
    fetchMock.mockResolvedValueOnce(ok({ shops: [shop] })).mockResolvedValueOnce(ok({ orders: [order], total_count: 1 }))
      .mockResolvedValueOnce(ok({ ...pkg, orders: [{ id: order.id }, { id: '3' }] }))
      .mockResolvedValueOnce(ok({ orders: [order, { ...order, id: '3', create_time: 999 }] }));
    expect(await tiktokProvider.listAutoPrintableShipmentIds!(ctx, { createdAfter: 1000 })).toEqual([]);
  });
  it('never accepts a partial baseline or repeated pagination cursor', async () => {
    fetchMock.mockResolvedValueOnce(ok({ orders: [order], total_count: 2 }));
    await expect(searchOrders('token', shop, {})).rejects.toThrow('incomplete');
    fetchMock.mockResolvedValueOnce(ok({ orders: [order], total_count: 2, next_page_token: 'repeat' }))
      .mockResolvedValueOnce(ok({ orders: [order], total_count: 2, next_page_token: 'repeat' }));
    await expect(searchOrders('token', shop, {})).rejects.toThrow('repeated pagination');
  });
  it('signs the exact search JSON and follows opaque cursors without altering the cutoff', async () => {
    fetchMock.mockResolvedValueOnce(ok({ orders: [order], total_count: 2, next_page_token: 'opaque+/=' }))
      .mockResolvedValueOnce(ok({ orders: [{ ...order, id: '2' }], total_count: 2 }));
    expect(await searchOrders('token', shop, { create_time_ge: 1001 })).toHaveLength(2);
    const [input, init] = fetchMock.mock.calls[1]; const url = new URL(String(input));
    expect(url.searchParams.get('page_token')).toBe('opaque+/=');
    const params = Object.fromEntries(url.searchParams);
    expect(params.sign).toBe(signTikTok(url.pathname, params, 'test-secret', init?.body as string));
    expect(fetchMock.mock.calls[0][1]?.body).toBe(init?.body);
  });
  it('bounds transient read retries and never retries a permission error', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(ok({ shops: [shop] }));
    const pending = shopFor(ctx); await vi.advanceTimersByTimeAsync(1000);
    expect((await pending).id).toBe(shop.id); expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockClear().mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(shopFor(ctx)).rejects.toThrow('(403)'); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each(['http://ibyteimg.com/a', 'https://127.0.0.1/a', 'https://ibyteimg.com.evil.test/a', 'https://user:pass@ibyteimg.com/a', 'https://ibyteimg.com:444/a'])('rejects unsafe document URLs: %s', url => {
    expect(() => safeDocumentUrl(url)).toThrow();
  });
  it('validates 64-bit IDs without numeric coercion', () => {
    expect(externalId(packageId)).toBe(packageId);
    expect(() => externalId(Number(packageId))).toThrow(); expect(() => externalId('../shops')).toThrow();
  });
  it('rejects partial manual batches instead of printing just the successful first package', async () => {
    await expect(tiktokProvider.getLabelsPDF(ctx, [packageId, '2'])).rejects.toThrow();
    await expect(tiktokProvider.getLabelsPDF(ctx, [packageId, packageId])).rejects.toThrow('repetidos');
  });
  it('revalidates the cutoff while downloading an automatic label, even if a package changed after discovery', async () => {
    await expect(tiktokProvider.getLabelsPDF(ctx, [packageId], { createdAfter: order.create_time })).rejects.toThrow('indisponível');
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/shipping_documents'))).toBe(false);
  });
  it('discovers every package of a split order and merges a manual batch without dropping a label', async () => {
    const secondId = '9000000000000000102';
    const split = { ...order, packages: [{ id: packageId }, { id: secondId }] };
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: URL, init?: RequestInit) => {
      if (url.pathname.endsWith('/orders/search')) return Promise.resolve(ok({ orders: [split], total_count: 1 }));
      if (url.pathname === '/order/202309/orders') return Promise.resolve(ok({ orders: [split] }));
      if (url.pathname.endsWith('/' + secondId)) return Promise.resolve(ok({ ...pkg, package_id: secondId }));
      return fallback(url, init);
    });
    expect(await tiktokProvider.listAutoPrintableShipmentIds!(ctx, { createdAfter: 1000 })).toEqual([packageId, secondId]);
    expect((await PDFDocument.load(await tiktokProvider.getLabelsPDF(ctx, [packageId, secondId]))).getPageCount()).toBe(2);
  });
  it.each(['html', 'A4', 'multiple', 'oversized'])('rejects unsafe document content: %s', async kind => {
    let response: () => Response;
    if (kind === 'html') response = () => new Response('<html>Error</html>');
    else if (kind === 'oversized') response = () => new Response('%PDF-', { headers: { 'content-length': '10485761' } });
    else {
      const pdf = await PDFDocument.create(); pdf.addPage(kind === 'A4' ? [595, 842] : [297, 420]);
      if (kind === 'multiple') pdf.addPage([297, 420]);
      const bytes = new Uint8Array(await pdf.save()); response = () => new Response(bytes);
    }
    const fallback = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: URL, init?: RequestInit) => url.hostname === 'p16-oec.byteoversea.com' ? Promise.resolve(response()) : fallback(url, init));
    await expect(tiktokProvider.getLabelsPDF(ctx, [packageId])).rejects.toThrow();
  });
});
