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
 * ship_order is only exposed through arrangeShipment() and is called solely by
 * services/shopeeArrange.ts, which runs only for accounts that explicitly
 * opted in to automatic shipment arrangement. Label generation itself never
 * arranges shipment.
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

class ShopeeApiError extends Error {
  constructor(readonly data: ShopeeResponse, path: string) {
    super(`Shopee ${path} failed: ${data.error} ${data.message || ''}`.trim());
  }
}

function assertOk(data: ShopeeResponse, path: string): void {
  if (data?.error) {
    throw new ShopeeApiError(data, path);
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
 * Candidate orders (not a guarantee of print readiness): READY_TO_SHIP (get_shipment_list)
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
  order_status?: string;
  invoice_data?: { status?: string; number?: string; access_key?: string; issue_date?: number; pending_reason?: string } | null;
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

const ORDER_DETAIL_FIELDS = 'buyer_username,item_list,recipient_address,package_list,invoice_data';

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

/** Keep per-package diagnostics even when Shopee rejects the whole batch. */
async function documentPost(
  path: string,
  shop: { accessToken: string; shopId: string },
  body: Record<string, unknown>
): Promise<any> {
  try {
    return await apiPost(path, shop, body);
  } catch (error) {
    if (error instanceof ShopeeApiError &&
        error.data.error === 'common.batch_api_all_failed' &&
        error.data.response?.result_list?.some((r: DocResult) => r.fail_error)) {
      return error.data.response;
    }
    throw error;
  }
}

function labelFailure(orderSn: string, packageNumber: string | undefined, entry?: DocResult): Error {
  const code = entry?.fail_error || entry?.status || 'document_unavailable';
  const detail = entry?.fail_message || 'A Shopee não informou o motivo.';
  const retryHint = code === 'logistics.package_can_not_print' && /not yet ready/i.test(detail)
    ? ' A etiqueta ainda não está pronta na Shopee. Aguarde alguns minutos e tente novamente.'
    : '';
  return new Error(`Etiqueta Shopee indisponível: ${orderSn}/${packageNumber || 'pedido'}. ${code}: ${detail}${retryHint}`);
}

export interface PrintEligibility {
  canRequest: boolean;
  reason?: string;
}

/** Read-only eligibility, NOT proof that create/download will succeed.
 * Check every package; missing results and transport errors fail closed.
 */
export async function checkPrintEligibility(
  shop: { accessToken: string; shopId: string },
  orders: ShopeeOrderDetail[]
): Promise<Map<string, PrintEligibility>> {
  const checks = new Map<string, PrintEligibility>();
  const targets: Array<{ order_sn: string; package_number?: string }> = orders.flatMap(order => {
    checks.set(order.order_sn, { canRequest: true });
    return order.package_list?.length
      ? order.package_list.map(p => ({ order_sn: order.order_sn, package_number: p.package_number }))
      : [{ order_sn: order.order_sn }];
  });
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    let results: DocResult[] = [];
    try {
      const response = await documentPost('/api/v2/logistics/get_shipping_document_parameter', shop, { order_list: batch });
      results = response?.result_list || [];
    } catch (error) {
      console.warn('[shopee] document eligibility unavailable:', error);
    }
    for (const target of batch) {
      const result = results.find(r => r.order_sn === target.order_sn &&
        (target.package_number ? r.package_number === target.package_number : !r.package_number));
      if (!result || result.fail_error || !(result.suggest_shipping_document_type || result.selectable_shipping_document_type?.length)) {
        checks.set(target.order_sn, {
          canRequest: false,
          reason: result?.fail_error
            ? `${result.fail_error}: ${result.fail_message || 'Documento indisponível na Shopee.'}`
            : 'Não foi possível confirmar a disponibilidade na Shopee. Atualize para verificar novamente.'
        });
      }
    }
  }
  return checks;
}

/**
 * Document type for this order, as reported by Shopee
 * (get_shipping_document_parameter). Uses the type Shopee suggests; null when
 * the order is not printable yet (e.g. not arranged by the seller).
 */
export async function getDocumentType(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<string | null> {
  const entry: Record<string, string> = { order_sn: orderSn };
  if (packageNumber) entry.package_number = packageNumber;
  const resp = await documentPost('/api/v2/logistics/get_shipping_document_parameter', shop, {
    order_list: [entry]
  });
  const r: DocResult | undefined = resp?.result_list?.[0];
  if (!r || r.fail_error) {
    throw labelFailure(orderSn, packageNumber, r);
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
 * Never calls ship_order. Failures preserve Shopee's per-package diagnostic;
 * absence of a document does not prove that shipment has not been arranged.
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

  for (let attempt = 0; attempt < 3; attempt++) {
    const createResp = await documentPost('/api/v2/logistics/create_shipping_document', shop, {
      order_list: [docEntry]
    });
    const created: DocResult | undefined = createResp?.result_list?.[0];
    if (created && !created.fail_error) break;
    const transient = created?.fail_error === 'logistics.package_can_not_print' &&
      /not yet ready/i.test(created.fail_message || '');
    if (!transient || attempt === 2) throw labelFailure(orderSn, packageNumber, created);
    await sleep(4000);
  }

  // Poll document result until READY (or give up after ~12s).
  let ready = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    // A transport blip while polling retries on the next attempt; Shopee's
    // per-package failure still surfaces through documentPost.
    const result = await documentPost('/api/v2/logistics/get_shipping_document_result', shop, {
      order_list: [docEntry]
    }).catch(() => null);
    const entry: DocResult | undefined = result?.result_list?.[0];
    if (entry?.status === 'READY') {
      ready = true;
      break;
    }
    if (entry?.status === 'FAILED' || entry?.fail_error) {
      throw labelFailure(orderSn, packageNumber, entry);
    }
    await sleep(2000);
  }
  if (!ready) {
    throw new Error(`Etiqueta Shopee ainda não está pronta: ${orderSn}/${packageNumber || 'pedido'}. Aguarde alguns minutos e tente novamente.`);
  }

  // shipping_document_type is a top-level field on download.
  const pdf = await apiPost('/api/v2/logistics/download_shipping_document', shop, {
    shipping_document_type: documentType,
    order_list: [
      packageNumber
        ? { order_sn: orderSn, package_number: packageNumber }
        : { order_sn: orderSn }
    ]
  }, true);

  return pdf && pdf.length > 0 ? pdf : null;
}

// ---------------------------------------------------------------------------
// Shipment arrangement (opt-in; see services/shopeeArrange.ts)
// ---------------------------------------------------------------------------

export interface ShippingParameter {
  info_needed?: { pickup?: string[]; dropoff?: string[]; non_integrated?: string[] };
  pickup?: {
    address_list?: Array<{
      address_id: number;
      address_flag?: string[];
      time_slot_list?: Array<{ pickup_time_id: string; date?: number; flags?: string[] }> | null;
    }>;
  } | null;
  dropoff?: { branch_list?: Array<{ branch_id: number }> } | null;
}

/** Read-only: how this package can be arranged (v2.logistics.get_shipping_parameter). */
export function getShippingParameter(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<ShippingParameter> {
  const params: Record<string, string> = { order_sn: orderSn };
  if (packageNumber) params.package_number = packageNumber;
  return apiGet('/api/v2/logistics/get_shipping_parameter', shop, params);
}

/** WRITES to Shopee: arranges pickup/dropoff (v2.logistics.ship_order). */
export async function arrangeShipment(
  shop: { accessToken: string; shopId: string },
  body: Record<string, unknown>
): Promise<void> {
  await apiPost('/api/v2/logistics/ship_order', shop, body);
}

/** True only for Shopee's positive NF status with a full key (same rule as label readiness). */
export function hasValidInvoice(order: ShopeeOrderDetail): boolean {
  const invoice = order.invoice_data;
  return !!invoice && invoice.status === 'valid' && !!invoice.number?.trim() &&
    /^\d{44}$/.test(invoice.access_key || '') && !!invoice.issue_date;
}

const createRequested = new Map<string, number>();
const CREATE_RETRY_MS = 10 * 60_000;

/**
 * Ask Shopee to generate the label document (create_shipping_document), at most
 * once per package per 10 min. Shopee answers "should print first" for
 * get_shipping_document_result until this was requested. Used only for orders
 * LabelGo itself arranged (see shopeeArrange), never for old orders.
 */
export async function requestDocumentCreation(
  shop: { accessToken: string; shopId: string },
  orderSn: string,
  packageNumber?: string
): Promise<void> {
  const key = `${shop.shopId}:${orderSn}:${packageNumber || ''}`;
  const last = createRequested.get(key);
  if (last && Date.now() - last < CREATE_RETRY_MS) return;
  if (createRequested.size > 2000) createRequested.clear();
  createRequested.set(key, Date.now());
  try {
    const type = await getDocumentType(shop, orderSn, packageNumber);
    if (!type) return;
    const target: Record<string, string> = packageNumber ? { order_sn: orderSn, package_number: packageNumber } : { order_sn: orderSn };
    // Shopee validates tracking_number; without it BR orders fail with tracking_number_invalid.
    const trackingNumber = await getTrackingNumber(shop, orderSn, packageNumber);
    if (!trackingNumber) {
      console.log(`[shopee] create_shipping_document ${orderSn}: tracking number not available yet, will retry`);
      createRequested.delete(key);
      return;
    }
    const resp = await documentPost('/api/v2/logistics/create_shipping_document', shop, {
      order_list: [{ ...target, shipping_document_type: type, tracking_number: trackingNumber }]
    });
    const r: DocResult | undefined = resp?.result_list?.[0];
    if (r?.fail_error) console.warn(`[shopee] create_shipping_document ${orderSn}: ${r.fail_error} ${r.fail_message || ''}`);
    else console.log(`[shopee] create_shipping_document requested for ${orderSn}`);
  } catch (error) {
    console.warn(`[shopee] create_shipping_document failed for ${orderSn}:`, error instanceof Error ? error.message : error);
  }
}

/** Strict ready list: never creates a document task, uploads NF or arranges shipment.
 * NF is confirmed only by Shopee's positive invoice_data status, not by absence
 * from a pending list or a READY_TO_SHIP order status. All packages must have an
 * existing READY document and a parseable PDF, otherwise the whole order is out.
 */
export async function getReadyLabelPdfs(
  shop: { accessToken: string; shopId: string },
  orders: ShopeeOrderDetail[]
): Promise<Map<string, Buffer[]>> {
  const ready = new Map<string, Buffer[]>();
  const { PDFDocument } = await import('pdf-lib');
  for (const order of orders) {
    const invoice = order.invoice_data;
    if (invoice?.status !== 'valid' || !invoice.number?.trim() ||
        !/^\d{44}$/.test(invoice.access_key || '') || !invoice.issue_date) continue;
    if (order.order_status !== 'PROCESSED') continue;
    const packages: Array<string | undefined> = order.package_list?.length
      ? order.package_list.map(p => p.package_number) : [undefined];
    if (order.package_list?.some(p => !p.package_number)) continue;
    const pdfs: Buffer[] = [];
    try {
      for (const packageNumber of packages) {
        const type = await getDocumentType(shop, order.order_sn, packageNumber);
        if (!type) throw new Error('Documento sem tipo confirmado');
        const target = packageNumber ? { order_sn: order.order_sn, package_number: packageNumber }
          : { order_sn: order.order_sn };
        const result = await documentPost('/api/v2/logistics/get_shipping_document_result', shop, {
          order_list: [{ ...target, shipping_document_type: type }]
        });
        const entry: DocResult | undefined = result?.result_list?.find((r: DocResult) =>
          r.order_sn === order.order_sn && (packageNumber ? r.package_number === packageNumber : !r.package_number));
        if (entry?.status !== 'READY' || entry.fail_error) throw new Error('Documento ainda não está READY');
        const pdf = await apiPost('/api/v2/logistics/download_shipping_document', shop, {
          shipping_document_type: type, order_list: [target]
        }, true);
        if (!pdf || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Documento não é PDF');
        const parsed = await PDFDocument.load(pdf);
        if (parsed.getPageCount() === 0) throw new Error('PDF sem páginas');
        pdfs.push(pdf);
      }
      ready.set(order.order_sn, pdfs);
    } catch (error) {
      // No PDF cache: recheck current NF and document state on every listing/print.
      console.warn(`[shopee] readiness not confirmed for ${order.order_sn}:`, error instanceof Error ? error.message : 'unknown');
    }
  }
  return ready;
}
