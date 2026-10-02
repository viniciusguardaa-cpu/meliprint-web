import crypto from 'crypto';

/**
 * Shopee Open Platform v2 client.
 *
 * Auth model: partner-level HMAC-SHA256 signing. Public calls sign
 * `partner_id + path + timestamp`; shop-level calls append
 * `access_token + shop_id`. The seller authorization link uses the current
 * `<auth host>/auth` format (partner_id, auth_type, redirect_uri,
 * response_type=code, state). Shopee echoes `state` back to the redirect
 * together with `code` + `shop_id`.
 *
 * SHOPEE_API_HOST overrides the API host (sandbox V2 or production);
 * SHOPEE_AUTH_HOST overrides the authorization page host.
 *
 * This client never arranges shipment (ship_order) on a seller's behalf:
 * labels are only generated for orders the seller already arranged.
 */

const DEFAULT_HOST = 'https://partner.shopeemobile.com';
const PROD_AUTH_HOST = 'https://open.shopee.com.br';
const SANDBOX_AUTH_HOST = 'https://open.sandbox.test-stable.shopee.com.br';

export function shopeeHost(): string {
  return (process.env.SHOPEE_API_HOST || DEFAULT_HOST).replace(/\/+$/, '');
}

function partnerId(): string {
  const v = process.env.SHOPEE_PARTNER_ID;
  if (!v) throw new Error('Missing environment variable: SHOPEE_PARTNER_ID');
  return v;
}

function partnerKey(): string {
  const v = process.env.SHOPEE_PARTNER_KEY;
  if (!v) throw new Error('Missing environment variable: SHOPEE_PARTNER_KEY');
  return v;
}

function hmac(base: string): string {
  return crypto.createHmac('sha256', partnerKey()).update(base).digest('hex');
}

function publicSign(path: string, timestamp: number): string {
  return hmac(`${partnerId()}${path}${timestamp}`);
}

function shopSign(path: string, timestamp: number, accessToken: string, shopId: string): string {
  return hmac(`${partnerId()}${path}${timestamp}${accessToken}${shopId}`);
}

/** Authorization page host (Brazil). Sandbox API hosts map to the sandbox page. */
export function shopeeAuthHost(): string {
  const override = process.env.SHOPEE_AUTH_HOST;
  if (override) return override.replace(/\/+$/, '');
  return /test-stable|sandbox/i.test(shopeeHost()) ? SANDBOX_AUTH_HOST : PROD_AUTH_HOST;
}

/**
 * Seller authorization link (new format, no signature required):
 * https://open.shopee.com/documents - Authorization and Authentication.
 */
export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    partner_id: partnerId(),
    auth_type: 'seller',
    redirect_uri: redirectUri,
    response_type: 'code',
    state
  });
  return `${shopeeAuthHost()}/auth?${params.toString()}`;
}

interface ShopeeResponse {
  request_id?: string;
  error?: string;
  message?: string;
  response?: any;
  [key: string]: any;
}

function assertOk(data: ShopeeResponse, path: string): void {
  if (data?.error) {
    throw new Error(`Shopee ${path} failed: ${data.error} ${data.message || ''}`.trim());
  }
}

/** Signed shop-level GET. */
async function apiGet(
  path: string,
  shop: { accessToken: string; shopId: string },
  params: Record<string, string>
): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    ...params,
    partner_id: partnerId(),
    timestamp: String(timestamp),
    access_token: shop.accessToken,
    shop_id: shop.shopId,
    sign: shopSign(path, timestamp, shop.accessToken, shop.shopId)
  });
  const res = await fetch(`${shopeeHost()}${path}?${qs.toString()}`);
  const data: ShopeeResponse = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopee ${path} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  assertOk(data, path);
  return data.response ?? data;
}

/** Signed shop-level POST (JSON body). Returns raw Response when binary=true. */
async function apiPost(
  path: string,
  shop: { accessToken: string; shopId: string },
  body: Record<string, unknown>,
  binary = false
): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    partner_id: partnerId(),
    timestamp: String(timestamp),
    access_token: shop.accessToken,
    shop_id: shop.shopId,
    sign: shopSign(path, timestamp, shop.accessToken, shop.shopId)
  });
  const res = await fetch(`${shopeeHost()}${path}?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (binary) {
    // Shipping documents come back as raw file bytes; errors come as JSON.
    const contentType = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || contentType.includes('json')) {
      const data = JSON.parse(buf.toString('utf8')) as ShopeeResponse;
      throw new Error(`Shopee ${path} failed: ${data.error || res.status} ${data.message || ''}`.trim());
    }
    return buf;
  }
  const data: ShopeeResponse = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopee ${path} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  assertOk(data, path);
  return data.response ?? data;
}

/** Public-level POST (token endpoints — no access_token/shop_id in the sign). */
async function publicPost(path: string, body: Record<string, unknown>): Promise<any> {
  const timestamp = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    partner_id: partnerId(),
    timestamp: String(timestamp),
    sign: publicSign(path, timestamp)
  });
  const res = await fetch(`${shopeeHost()}${path}?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data: ShopeeResponse = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopee ${path} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  assertOk(data, path);
  return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id?: number;
  merchant_id?: number;
}

export function exchangeCodeForToken(code: string, shopId: string): Promise<ShopeeTokenResponse> {
  return publicPost('/api/v2/auth/token/get', {
    code,
    partner_id: Number(partnerId()),
    shop_id: Number(shopId)
  });
}

export function refreshAccessToken(refreshToken: string, shopId: string): Promise<ShopeeTokenResponse> {
  return publicPost('/api/v2/auth/access_token/get', {
    refresh_token: refreshToken,
    partner_id: Number(partnerId()),
    shop_id: Number(shopId)
  });
}

export async function getShopInfo(shop: { accessToken: string; shopId: string }): Promise<any> {
  return apiGet('/api/v2/shop/get_shop_info', shop, {});
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface ShopeeShipmentListEntry {
  order_sn: string;
  package_number?: string;
}

/**
 * Orders the seller already arranged (status PROCESSED). get_shipment_list
 * only returns orders still waiting to be arranged, so printable orders that
 * were arranged in Shopee come from get_order_list. Window is capped by
 * Shopee at 15 days.
 */
export async function getProcessedOrders(
  shop: { accessToken: string; shopId: string },
  maxOrders = 500
): Promise<ShopeeShipmentListEntry[]> {
  const out: ShopeeShipmentListEntry[] = [];
  const now = Math.floor(Date.now() / 1000);
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const resp = await apiGet('/api/v2/order/get_order_list', shop, {
      time_range_field: 'update_time',
      time_from: String(now - 14 * 24 * 3600),
      time_to: String(now),
      page_size: '100',
      order_status: 'PROCESSED',
      cursor
    });
    const list: ShopeeShipmentListEntry[] = resp?.order_list || [];
    out.push(...list);
    if (!resp?.more || out.length >= maxOrders) break;
    cursor = resp.next_cursor || '';
    if (!cursor) break;
  }
  return out.slice(0, maxOrders);
}

/**
 * Orders that can have a label printed: READY_TO_SHIP (get_shipment_list)
 * plus already-arranged PROCESSED orders, deduplicated by order_sn.
 */
export async function getPrintableOrderSns(
  shop: { accessToken: string; shopId: string },
  maxOrders = 500
): Promise<string[]> {
  const [ready, processed] = await Promise.all([
    getShipmentList(shop, maxOrders),
    getProcessedOrders(shop, maxOrders).catch((err) => {
      console.warn(`[shopee] get_order_list PROCESSED failed: ${err.message}`);
      return [] as ShopeeShipmentListEntry[];
    })
  ]);
  const seen = new Set<string>();
  for (const e of [...ready, ...processed]) seen.add(e.order_sn);
  return Array.from(seen).slice(0, maxOrders);
}

/** READY_TO_SHIP orders (v2.order.get_shipment_list), all pages. */
export async function getShipmentList(
  shop: { accessToken: string; shopId: string },
  maxOrders = 500
): Promise<ShopeeShipmentListEntry[]> {
  const out: ShopeeShipmentListEntry[] = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const resp = await apiGet('/api/v2/order/get_shipment_list', shop, {
      page_size: '100',
      cursor
    });
    const list: ShopeeShipmentListEntry[] = resp?.order_list || [];
    out.push(...list);
    if (!resp?.more || out.length >= maxOrders) break;
    cursor = resp.next_cursor || '';
    if (!cursor) break;
  }
  return out.slice(0, maxOrders);
}

export interface ShopeeOrderDetail {
  order_sn: string;
  status?: string;
  buyer_username?: string;
  ship_by_date?: number;
  recipient_address?: {
    name?: string;
    town?: string;
    city?: string;
    state?: string;
    region?: string;
  };
  item_list?: Array<{
    item_name?: string;
    model_name?: string;
    model_sku?: string;
    item_sku?: string;
    model_quantity_purchased?: number;
  }>;
  package_list?: Array<{ package_number: string; shipping_carrier?: string }>;
}

const ORDER_DETAIL_FIELDS = 'buyer_username,item_list,recipient_address,package_list';

/** Batch order detail — Shopee accepts up to 50 order_sns per call. */
export async function getOrderDetail(
  shop: { accessToken: string; shopId: string },
  orderSns: string[]
): Promise<ShopeeOrderDetail[]> {
  const out: ShopeeOrderDetail[] = [];
  for (let i = 0; i < orderSns.length; i += 50) {
    // get_order_detail is a GET: parameters go in the query string.
    const resp = await apiGet('/api/v2/order/get_order_detail', shop, {
      order_sn_list: orderSns.slice(i, i + 50).join(','),
      response_optional_fields: ORDER_DETAIL_FIELDS
    });
    out.push(...(resp?.order_list || []));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shipping documents (labels)
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface DocResult {
  order_sn: string;
  package_number?: string;
  status?: string;
  fail_error?: string;
  fail_message?: string;
  suggest_shipping_document_type?: string;
  selectable_shipping_document_type?: string[];
}

/**
 * Document type for this order, as reported by Shopee
 * (get_shipping_document_parameter). Uses the type Shopee suggests; null when
 * the order is not printable yet (e.g. not arranged by the seller).
 */
async function getDocumentType(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<string | null> {
  const entry: Record<string, string> = { order_sn: orderSn };
  if (packageNumber) entry.package_number = packageNumber;
  const resp = await apiPost('/api/v2/logistics/get_shipping_document_parameter', shop, {
    order_list: [entry]
  }).catch((err) => {
    console.warn(`[shopee] get_shipping_document_parameter ${orderSn}: ${err.message}`);
    return null;
  });
  const r: DocResult | undefined = resp?.result_list?.[0];
  if (!r || r.fail_error) {
    if (r?.fail_error) console.warn(`[shopee] document parameter ${orderSn}: ${r.fail_error} ${r.fail_message || ''}`);
    return null;
  }
  return r.suggest_shipping_document_type || r.selectable_shipping_document_type?.[0] || null;
}

async function getTrackingNumber(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<string | undefined> {
  const params: Record<string, string> = { order_sn: orderSn };
  if (packageNumber) params.package_number = packageNumber;
  const resp = await apiGet('/api/v2/logistics/get_tracking_number', shop, params).catch(() => null);
  return resp?.tracking_number || undefined;
}

/**
 * Generate + download the shipping document PDF for one package.
 * Flow: get_shipping_document_parameter (document type Shopee allows) →
 * create_shipping_document → poll get_shipping_document_result →
 * download_shipping_document.
 *
 * Read-only with respect to fulfilment: it never calls ship_order. If the
 * seller has not arranged the shipment in Shopee yet, the document cannot be
 * created and this returns null.
 */
export async function getLabelPdf(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<Buffer | null> {
  const documentType = await getDocumentType(shop, orderSn, packageNumber);
  if (!documentType) return null;

  const trackingNumber = await getTrackingNumber(shop, orderSn, packageNumber);
  const docEntry: Record<string, string> = {
    order_sn: orderSn,
    shipping_document_type: documentType
  };
  if (packageNumber) docEntry.package_number = packageNumber;
  if (trackingNumber) docEntry.tracking_number = trackingNumber;

  const createResp = await apiPost('/api/v2/logistics/create_shipping_document', shop, {
    order_list: [docEntry]
  }).catch((err) => {
    console.warn(`[shopee] create_shipping_document ${orderSn}: ${err.message}`);
    return null;
  });
  const created: DocResult | undefined = createResp?.result_list?.[0];
  if (!createResp || created?.fail_error) {
    if (created?.fail_error) {
      console.warn(`[shopee] create_shipping_document ${orderSn}: ${created.fail_error} ${created.fail_message || ''}`);
    }
    return null;
  }

  // Poll document result until READY (or give up after ~12s).
  let ready = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await apiPost('/api/v2/logistics/get_shipping_document_result', shop, {
      order_list: [docEntry]
    }).catch(() => null);
    const entry: DocResult | undefined = result?.result_list?.[0];
    if (entry?.status === 'READY') {
      ready = true;
      break;
    }
    if (entry?.status === 'FAILED' || entry?.fail_error) {
      console.warn(`[shopee] shipping doc ${orderSn} failed: ${entry.fail_error || entry.status}`);
      return null;
    }
    await sleep(2000);
  }
  if (!ready) {
    console.warn(`[shopee] shipping doc ${orderSn} not ready in time`);
    return null;
  }

  // shipping_document_type is a top-level field on download.
  const pdf = await apiPost('/api/v2/logistics/download_shipping_document', shop, {
    shipping_document_type: documentType,
    order_list: [
      packageNumber
        ? { order_sn: orderSn, package_number: packageNumber }
        : { order_sn: orderSn }
    ]
  }, true).catch((err) => {
    console.warn(`[shopee] download_shipping_document ${orderSn}: ${err.message}`);
    return null;
  });

  return pdf && pdf.length > 0 ? pdf : null;
}
