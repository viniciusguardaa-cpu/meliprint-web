import crypto from 'crypto';

/**
 * Shopee Open Platform v2 client.
 *
 * Auth model: partner-level HMAC-SHA256 signing. Public calls sign
 * `partner_id + path + timestamp`; shop-level calls append
 * `access_token + shop_id`. The seller-facing OAuth flow does NOT support
 * a `state` param — the callback carries `code` + `shop_id`.
 *
 * Brazil apps may use the regional host (openplatform.shopee.com.br);
 * SHOPEE_API_HOST overrides the global default.
 */

const DEFAULT_HOST = 'https://partner.shopeemobile.com';
const AUTH_PATH = '/api/v2/shop/auth_partner';

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

export function buildAuthUrl(redirectUri: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = new URLSearchParams({
    partner_id: partnerId(),
    redirect: redirectUri,
    timestamp: String(timestamp),
    sign: publicSign(AUTH_PATH, timestamp),
    auth_type: 'seller'
  });
  return `${shopeeHost()}${AUTH_PATH}?${params.toString()}`;
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
  package_list?: Array<{ package_number: string }>;
}

const ORDER_DETAIL_FIELDS = 'buyer_username,item_list,recipient_address,package_list';

/** Batch order detail — Shopee accepts up to 50 order_sns per call. */
export async function getOrderDetail(
  shop: { accessToken: string; shopId: string },
  orderSns: string[]
): Promise<ShopeeOrderDetail[]> {
  const out: ShopeeOrderDetail[] = [];
  for (let i = 0; i < orderSns.length; i += 50) {
    const resp = await apiPost('/api/v2/order/get_order_detail', shop, {
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

/**
 * Ensure the order's shipment is arranged with the carrier. Shopee only
 * generates an AWB after ship_order; we pick the first available option
 * (dropoff branch or pickup slot) when arrangement is still pending.
 */
async function arrangeShipmentIfNeeded(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<void> {
  const param = await apiPost('/api/v2/logistics/get_shipping_parameter', shop, {
    order_sn: orderSn
  }).catch((err) => {
    console.warn(`[shopee] get_shipping_parameter ${orderSn}: ${err.message}`);
    return null;
  });
  if (!param) return;

  const infoNeeded = param.info_needed || {};
  const body: Record<string, unknown> = { order_sn: orderSn };
  if (packageNumber) body.package_number = packageNumber;

  if (infoNeeded.pickup && param.pickup?.address_list?.length) {
    const pickup: Record<string, unknown> = { address_id: param.pickup.address_list[0].address_id };
    const slot = param.pickup.time_slot_list?.[0];
    if (slot?.pickup_time_id) pickup.pickup_time_id = slot.pickup_time_id;
    body.pickup = pickup;
  } else if (infoNeeded.dropoff && param.dropoff?.branch_list?.length) {
    body.dropoff = { branch_id: param.dropoff.branch_list[0].branch_id };
  } else {
    // Nothing to fill — either already arranged or handled by Shopee.
    return;
  }

  const res = await apiPost('/api/v2/logistics/ship_order', shop, body).catch((err) => {
    // ship_order fails when already arranged — that's fine.
    console.warn(`[shopee] ship_order ${orderSn}: ${err.message}`);
    return null;
  });
  if (res) {
    console.log(`[shopee] ship_order arranged for ${orderSn}`);
  }
}

interface DocResult {
  order_sn: string;
  status?: string;
  fail_error?: string;
}

/**
 * Generate + download the thermal airwaybill PDF for one order.
 * Flow: create_shipping_document → poll get_shipping_document_result →
 * download_shipping_document. The order's shipment is auto-arranged when
 * the document creation reports it missing.
 */
export async function getLabelPdf(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<Buffer | null> {
  const docEntry: Record<string, string> = {
    order_sn: orderSn,
    shipping_document_type: 'THERMAL_AIR_WAYBILL'
  };
  if (packageNumber) docEntry.package_number = packageNumber;

  const createDoc = () =>
    apiPost('/api/v2/logistics/create_shipping_document', shop, { order_list: [docEntry] })
      .catch((err) => {
        console.warn(`[shopee] create_shipping_document ${orderSn}: ${err.message}`);
        return null;
      });

  let createResp = await createDoc();
  const firstResult: DocResult | undefined = createResp?.result_list?.[0];
  if (firstResult?.fail_error && /arrange|ship/i.test(firstResult.fail_error)) {
    await arrangeShipmentIfNeeded(shop, orderSn, packageNumber);
    createResp = await createDoc();
  }

  // Poll document result until READY (or give up after ~12s).
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await apiPost('/api/v2/logistics/get_shipping_document_result', shop, {
      order_list: [docEntry]
    }).catch(() => null);
    const entry: DocResult | undefined = result?.result_list?.[0];
    if (entry?.status === 'READY') break;
    if (entry?.status === 'FAILED' || entry?.fail_error) {
      if (attempt === 0 && /arrange|ship/i.test(entry.fail_error || '')) {
        await arrangeShipmentIfNeeded(shop, orderSn, packageNumber);
        continue;
      }
      console.warn(`[shopee] shipping doc ${orderSn} failed: ${entry.fail_error || entry.status}`);
      return null;
    }
    await sleep(2000);
  }

  const pdf = await apiPost('/api/v2/logistics/download_shipping_document', shop, {
    order_list: [docEntry]
  }, true).catch((err) => {
    console.warn(`[shopee] download_shipping_document ${orderSn}: ${err.message}`);
    return null;
  });

  return pdf && pdf.length > 0 ? pdf : null;
}
