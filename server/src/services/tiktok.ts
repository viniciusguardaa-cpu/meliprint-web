import { createHmac } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { AccountContext, TokenSet } from '../providers/types.js';

// BR/local sellers, Open API v202309. Never use the TikTok creator OAuth API.
const API = 'https://open-api.tiktokglobalshop.com';
const AUTH = 'https://auth.tiktok-shops.com/api/v2/token/';
const MAX_BYTES = 10 * 1024 * 1024;
const SCOPES = ['seller.authorization.info', 'seller.order.info', 'seller.fulfillment.basic'];
const TRANSIENT_CODES = new Set([10006402, 36009003, 10002014, 10002015, 11034023, 11034037, 21023022]);

export function tiktokConfigured(): boolean {
  return process.env.TIKTOK_ENABLED === '1' && !!(process.env.TIKTOK_APP_KEY && process.env.TIKTOK_APP_SECRET && process.env.TIKTOK_SERVICE_ID);
}
function credentials() {
  if (!tiktokConfigured()) throw new Error('TikTok Shop ainda não está habilitado neste ambiente.');
  return { key: process.env.TIKTOK_APP_KEY!, secret: process.env.TIKTOK_APP_SECRET! };
}

/** Sign the SAME body bytes sent to TikTok. Official sign-your-api-request algorithm. */
export function signTikTok(path: string, params: Record<string, string>, secret: string, body = ''): string {
  const query = Object.keys(params).filter(k => k !== 'sign' && k !== 'access_token').sort()
    .map(k => k + params[k]).join('');
  return createHmac('sha256', secret).update(secret + path + query + body + secret).digest('hex');
}

export class TikTokError extends Error {
  constructor(public readonly code: number, public readonly retryable = false) {
    // No upstream message, response, URL or token in logs/errors.
    super(`${code === 401 || code === 403 ? 'unauthorized: ' : ''}TikTok Shop: falha na API (${code}).`);
  }
}

async function readBytes(response: Response): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('TikTok response too large');
  if (!response.body) throw new Error('TikTok empty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error('TikTok response too large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function envelope<T>(url: URL, init: RequestInit, retry = true): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      let response: Response;
      try { response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
      catch { throw new TikTokError(-1, true); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new TikTokError(response.status, response.status === 429 || response.status >= 500);
      }
      let result: { code: number; data?: T };
      try { result = JSON.parse((await readBytes(response)).toString()); }
      catch { throw new TikTokError(-2); }
      if (result.code !== 0) throw new TikTokError(Number.isSafeInteger(result.code) ? result.code : -2, TRANSIENT_CODES.has(result.code));
      if (!result.data || typeof result.data !== 'object') throw new TikTokError(-2);
      return result.data;
    } catch (error) {
      if (!retry || !(error instanceof TikTokError) || !error.retryable || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
}

async function request<T>(token: string, path: string, params: Record<string, string> = {}, body?: object): Promise<T> {
  const { key, secret } = credentials();
  const serialized = body === undefined ? '' : JSON.stringify(body);
  const query = { ...params, app_key: key, timestamp: String(Math.floor(Date.now() / 1000)) };
  const url = new URL(path, API);
  url.search = new URLSearchParams({ ...query, sign: signTikTok(path, query, secret, serialized) }).toString();
  return envelope<T>(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-tts-access-token': token },
    ...(body === undefined ? {} : { body: serialized })
  });
}

export interface TikTokShop { id: string; name: string; region: string; cipher: string }
export interface TikTokOrder {
  id: string; create_time: number; status: string; shipping_type: string; fulfillment_type: string;
  need_upload_invoice: string; is_buyer_request_cancel?: boolean;
  packages?: Array<{ id: string }>;
  line_items?: Array<{ product_name?: string; seller_sku?: string; package_id?: string }>;
  recipient_address?: { name?: string };
  rts_sla_time?: number;
}
export interface TikTokPackage {
  package_id: string; orders: Array<{ id: string }>; package_status: string;
  package_sub_status: string; shipping_type: string;
}

export function externalId(id: unknown): string {
  if (typeof id !== 'string' || !/^[1-9]\d{0,39}$/.test(id)) throw new Error('Invalid TikTok ID');
  return id; // Never coerce 64-bit IDs through Number.
}

export async function authorizedShops(token: string): Promise<TikTokShop[]> {
  const data = await request<{ shops: TikTokShop[] }>(token, '/authorization/202309/shops');
  if (!Array.isArray(data.shops)) throw new Error('TikTok missing authorized shops');
  return data.shops.filter(s => s.region === 'BR').map(s => {
    externalId(s.id);
    if (!s.cipher || typeof s.cipher !== 'string') throw new Error('TikTok missing shop cipher');
    return s;
  });
}

/** Resolve cipher from the token's current grants, never from callback/client data. */
export async function shopFor(ctx: AccountContext): Promise<TikTokShop> {
  const shop = (await authorizedShops(ctx.accessToken)).find(s => s.id === ctx.externalUserId);
  if (!shop) throw new Error('unauthorized: TikTok shop authorization revoked');
  return shop;
}

interface TokenResponse {
  access_token: string; refresh_token: string; access_token_expire_in: number;
  user_type: number; granted_scopes: string[];
}
async function tokenRequest(action: 'get' | 'refresh', params: Record<string, string>): Promise<TokenSet> {
  const { key, secret } = credentials();
  const url = new URL(action, AUTH);
  url.search = new URLSearchParams({ app_key: key, app_secret: secret, ...params }).toString();
  // An authorization code is single-use; refresh may rotate credentials too.
  const data = await envelope<TokenResponse>(url, { method: 'GET' }, false);
  if (data.user_type !== 0 || !Array.isArray(data.granted_scopes) || !SCOPES.every(s => data.granted_scopes.includes(s))) {
    throw new Error('unauthorized: TikTok requer autorização de vendedor com as três permissões de integração.');
  }
  if (typeof data.access_token !== 'string' || !data.access_token || typeof data.refresh_token !== 'string' || !data.refresh_token ||
      !Number.isSafeInteger(data.access_token_expire_in) || data.access_token_expire_in <= Date.now() / 1000) throw new Error('Invalid TikTok token response');
  // Unlike Shopee, expire_in is an absolute Unix timestamp, NOT a duration.
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.access_token_expire_in * 1000 };
}
export const exchangeTikTokCode = (code: string) => tokenRequest('get', { auth_code: code, grant_type: 'authorized_code' });
export const refreshTikTokToken = (token: string) => tokenRequest('refresh', { refresh_token: token, grant_type: 'refresh_token' });

export async function searchOrders(token: string, shop: TikTokShop, filter: Record<string, unknown>): Promise<TikTokOrder[]> {
  const orders = new Map<string, TikTokOrder>();
  const seen = new Set<string>(); let cursor = '';
  // Fixed upper bound avoids a moving pagination window. No partial snapshot.
  const now = Math.floor(Date.now() / 1000);
  const body = { ...filter, create_time_lt: typeof filter.create_time_lt === 'number' ? Math.min(filter.create_time_lt, now) : now };
  for (let page = 0; page < 100; page++) {
    const data = await request<{ orders: TikTokOrder[]; next_page_token?: string; total_count?: number }>(token,
      '/order/202309/orders/search', { shop_cipher: shop.cipher, page_size: '100', sort_field: 'create_time', sort_order: 'ASC', ...(cursor ? { page_token: cursor } : {}) }, body);
    if (!Array.isArray(data.orders)) throw new Error('TikTok incomplete order list');
    if (!Number.isSafeInteger(data.total_count) || data.total_count! < 0) throw new Error('TikTok missing pagination total');
    for (const order of data.orders) { externalId(order.id); orders.set(order.id, order); }
    if (!data.next_page_token) {
      if (data.total_count !== undefined && orders.size < data.total_count) throw new Error('TikTok incomplete order pagination');
      return [...orders.values()];
    }
    if (typeof data.next_page_token !== 'string' || seen.has(data.next_page_token)) throw new Error('TikTok repeated pagination cursor');
    seen.add(data.next_page_token); cursor = data.next_page_token;
  }
  throw new Error('TikTok pagination safety limit reached');
}

export async function packageDetail(token: string, shop: TikTokShop, id: string): Promise<TikTokPackage> {
  const data = await request<TikTokPackage>(token, `/fulfillment/202309/packages/${externalId(id)}`, { shop_cipher: shop.cipher });
  if (data.package_id !== id || !Array.isArray(data.orders) || !data.orders.length) throw new Error('TikTok incomplete package');
  data.orders.forEach(o => externalId(o.id));
  return data;
}
export async function orderDetails(token: string, shop: TikTokShop, ids: string[]): Promise<TikTokOrder[]> {
  const unique = [...new Set(ids.map(externalId))]; const orders: TikTokOrder[] = [];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const data = await request<{ orders: TikTokOrder[] }>(token, '/order/202309/orders', { shop_cipher: shop.cipher, ids: batch.join(',') });
    if (!Array.isArray(data.orders) || data.orders.length !== batch.length || new Set(data.orders.map(o => o.id)).size !== batch.length || data.orders.some(o => !batch.includes(o.id))) throw new Error('TikTok incomplete order details');
    orders.push(...data.orders);
  }
  return orders;
}

export function orderEligible(order: TikTokOrder, createdAfter?: number): boolean {
  return ['AWAITING_SHIPMENT', 'AWAITING_COLLECTION', 'PARTIALLY_SHIPPING'].includes(order.status) &&
    order.shipping_type === 'TIKTOK' && order.fulfillment_type === 'FULFILLMENT_BY_SELLER' &&
    ['NO_NEED', 'INVOICE_UPLOADED'].includes(order.need_upload_invoice) && order.is_buyer_request_cancel !== true &&
    (createdAfter === undefined || (Number.isSafeInteger(order.create_time) && order.create_time > createdAfter));
}

export async function printablePackage(ctx: AccountContext, shop: TikTokShop, id: string, createdAfter?: number): Promise<TikTokOrder[] | null> {
  const pkg = await packageDetail(ctx.accessToken, shop, id);
  if (pkg.shipping_type !== 'TIKTOK' || pkg.package_status !== 'PROCESSING' || pkg.package_sub_status !== 'RTS') return null;
  const orders = await orderDetails(ctx.accessToken, shop, pkg.orders.map(o => o.id));
  // Combined packages must pass for EVERY order, including the activation cutoff.
  if (!orders.every(o => orderEligible(o, createdAfter) && o.packages?.some(p => p.id === id))) return null;
  return orders;
}

export function safeDocumentUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid TikTok document URL'); }
  // Official ByteDance document/image CDNs only. No redirects, credentials or
  // tokens forwarded. Extend only after checking a real vendor-issued hostname.
  const domains = ['bytedance.net', 'byteoversea.com', 'ibyteimg.com', 'tiktokcdn.com'];
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !domains.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) throw new Error('Untrusted TikTok document host');
  return url;
}

export async function packagePDF(ctx: AccountContext, shop: TikTokShop, id: string, createdAfter?: number): Promise<Buffer> {
  if (!(await printablePackage(ctx, shop, id, createdAfter))) throw new Error('Etiqueta TikTok ainda indisponível ou envio sem NF validada.');
  const data = await request<{ doc_url: string }>(ctx.accessToken, `/fulfillment/202309/packages/${externalId(id)}/shipping_documents`, {
    shop_cipher: shop.cipher, document_type: 'SHIPPING_LABEL', document_format: 'PDF', document_size: 'A6'
  });
  const url = safeDocumentUrl(data.doc_url);
  let response: Response;
  try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
  catch { throw new TikTokError(-3, true); }
  if (!response.ok) { await response.body?.cancel(); throw new TikTokError(response.status, response.status === 429 || response.status >= 500); }
  const bytes = await readBytes(response);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid TikTok PDF');
  const pdf = await PDFDocument.load(bytes);
  if (pdf.getPageCount() !== 1) throw new Error('TikTok package must contain exactly one shipping label');
  const { width, height } = pdf.getPage(0).getSize();
  if (Math.min(width, height) < 250 || Math.min(width, height) > 330 || Math.max(width, height) < 380 || Math.max(width, height) > 460) throw new Error('TikTok shipping label is not A6/thermal size');
  return bytes;
}
