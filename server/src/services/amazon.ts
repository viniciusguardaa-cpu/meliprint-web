import crypto from 'crypto';
import { gunzipSync } from 'zlib';

/**
 * Amazon Selling Partner API client.
 *
 * - LWA OAuth: sellercentral consent → callback carries `spapi_oauth_code`
 *   + `selling_partner_id` + `state`. Tokens come from api.amazon.com.
 * - SP-API calls are AWS SigV4-signed (execute-api, us-east-1; the BR
 *   marketplace A2Q3Y263D00KWC lives in the NA region endpoint).
 * - Labels via Merchant Fulfillment: eligibleShippingServices →
 *   createShipment → base64+gzip label (PDF/PNG/ZPL203 depending on
 *   carrier). Requires the Direct-to-Consumer Shipping (Restricted) role
 *   and a configured ship-from address + default package size.
 */

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SPAPI_BASE = process.env.AMAZON_SPAPI_ENDPOINT || 'https://sellingpartnerapi-na.amazon.com';
const SPAPI_REGION = process.env.AMAZON_SPAPI_REGION || 'us-east-1';
const MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID || 'A2Q3Y263D00KWC'; // amazon.com.br

function lwaClientId(): string {
  const v = process.env.AMAZON_LWA_CLIENT_ID;
  if (!v) throw new Error('Missing environment variable: AMAZON_LWA_CLIENT_ID');
  return v;
}

function lwaClientSecret(): string {
  const v = process.env.AMAZON_LWA_CLIENT_SECRET;
  if (!v) throw new Error('Missing environment variable: AMAZON_LWA_CLIENT_SECRET');
  return v;
}

function appId(): string {
  const v = process.env.AMAZON_APP_ID;
  if (!v) throw new Error('Missing environment variable: AMAZON_APP_ID');
  return v;
}

function awsCreds(): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
  const accessKeyId = process.env.AMAZON_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.AMAZON_AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Missing environment variables: AMAZON_AWS_ACCESS_KEY_ID / AMAZON_AWS_SECRET_ACCESS_KEY');
  }
  return { accessKeyId, secretAccessKey, sessionToken: process.env.AMAZON_AWS_SESSION_TOKEN };
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    application_id: appId(),
    state,
    // Draft (unpublished) apps require version=beta; harmless for live ones.
    version: 'beta'
  });
  const sellerCentral = process.env.AMAZON_SELLER_CENTRAL || 'https://sellercentral.amazon.com.br';
  return `${sellerCentral}/apps/authorize/consent?${params.toString()}`;
}

export interface LwaTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

async function lwaRequest(body: Record<string, string>): Promise<LwaTokenResponse> {
  const res = await fetch(LWA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`LWA token request failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

export function exchangeCodeForToken(code: string, redirectUri: string): Promise<LwaTokenResponse> {
  return lwaRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: lwaClientId(),
    client_secret: lwaClientSecret()
  });
}

export function refreshAccessToken(refreshToken: string): Promise<LwaTokenResponse> {
  return lwaRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: lwaClientId(),
    client_secret: lwaClientSecret()
  });
}

// ---------------------------------------------------------------------------
// SigV4 signing
// ---------------------------------------------------------------------------

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function uriEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

async function spapi(
  lwaAccessToken: string,
  method: string,
  path: string,
  query: Record<string, string> = {},
  body?: Record<string, unknown>
): Promise<any> {
  const creds = awsCreds();
  const host = new URL(SPAPI_BASE).host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payload = body ? JSON.stringify(body) : '';
  const payloadHash = sha256Hex(payload);

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&');

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host,
    'x-amz-access-token': lwaAccessToken,
    'x-amz-date': amzDate
  };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((k) => `${k}:${headers[k].trim()}\n`).join('');
  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders.join(';'),
    payloadHash
  ].join('\n');

  const scope = `${dateStamp}/${SPAPI_REGION}/execute-api/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, SPAPI_REGION);
  const kService = hmac(kRegion, 'execute-api');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const res = await fetch(`${SPAPI_BASE}${path}${canonicalQuery ? '?' + canonicalQuery : ''}`, {
    method,
    headers: {
      ...headers,
      'Authorization': `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')}, Signature=${signature}`
    },
    ...(body ? { body: payload } : {})
  });

  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.message || JSON.stringify(data).slice(0, 300);
    throw new Error(`SP-API ${method} ${path} failed (${res.status}): ${msg}`);
  }
  return data?.payload ?? data;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export interface SpApiOrder {
  AmazonOrderId: string;
  OrderStatus?: string;
  PurchaseDate?: string;
  LatestShipDate?: string;
  FulfillmentChannel?: string;
  BuyerInfo?: { BuyerName?: string };
  ShippingAddress?: { City?: string; StateOrRegion?: string };
  OrderTotal?: { Amount?: string; CurrencyCode?: string };
}

export interface SpApiOrderItem {
  OrderItemId: string;
  Title?: string;
  QuantityOrdered?: number;
  SellerSKU?: string;
}

export async function listUnshippedOrders(lwaToken: string, dateFrom?: string, dateTo?: string): Promise<SpApiOrder[]> {
  const query: Record<string, string> = {
    MarketplaceIds: MARKETPLACE_ID,
    OrderStatuses: 'Unshipped,PartiallyShipped'
  };
  if (dateFrom) query.CreatedAfter = new Date(dateFrom).toISOString();
  else query.CreatedAfter = new Date(Date.now() - 30 * 86400000).toISOString();
  if (dateTo) query.CreatedBefore = new Date(dateTo).toISOString();

  const orders: SpApiOrder[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = nextToken ? { NextToken: nextToken } : query;
    const payload = await spapi(lwaToken, 'GET', '/orders/v0/orders', q);
    orders.push(...(payload?.Orders || []));
    nextToken = payload?.NextToken;
    if (!nextToken) break;
  }
  return orders;
}

export async function getOrderItems(lwaToken: string, orderId: string): Promise<SpApiOrderItem[]> {
  const payload = await spapi(lwaToken, 'GET', `/orders/v0/orders/${orderId}/orderItems`);
  return payload?.OrderItems || [];
}

// ---------------------------------------------------------------------------
// Merchant Fulfillment labels
// ---------------------------------------------------------------------------

function shipFromAddress(): Record<string, string> {
  const name = process.env.AMAZON_SHIP_FROM_NAME;
  const line = process.env.AMAZON_SHIP_FROM_ADDRESS;
  const city = process.env.AMAZON_SHIP_FROM_CITY;
  const state = process.env.AMAZON_SHIP_FROM_STATE;
  const postal = process.env.AMAZON_SHIP_FROM_POSTAL_CODE;
  if (!name || !line || !city || !state || !postal) {
    throw new Error(
      'Amazon labels need a ship-from address: set AMAZON_SHIP_FROM_NAME/ADDRESS/CITY/STATE/POSTAL_CODE'
    );
  }
  return {
    Name: name,
    AddressLine1: line,
    AddressLine2: process.env.AMAZON_SHIP_FROM_ADDRESS2 || '',
    City: city,
    StateOrProvinceCode: state,
    PostalCode: postal,
    CountryCode: 'BR',
    Email: process.env.AMAZON_SHIP_FROM_EMAIL || '',
    Phone: process.env.AMAZON_SHIP_FROM_PHONE || ''
  };
}

function packageDefaults() {
  return {
    PackageDimensions: {
      Length: Number(process.env.AMAZON_PKG_LENGTH_CM || 20),
      Width: Number(process.env.AMAZON_PKG_WIDTH_CM || 15),
      Height: Number(process.env.AMAZON_PKG_HEIGHT_CM || 10),
      Unit: 'centimeters'
    },
    Weight: { Value: Number(process.env.AMAZON_PKG_WEIGHT_KG || 0.3), Unit: 'kilograms' }
  };
}

/**
 * Buy shipping for an order and return the raw label bytes + its format.
 * ZPL-capable carriers return `application/zpl` — others PDF/PNG.
 */
export async function purchaseLabel(
  lwaToken: string,
  orderId: string,
  items: SpApiOrderItem[],
  labelFormat: 'ZPL203' | 'PDF'
): Promise<{ bytes: Buffer; format: string }> {
  const shipmentRequestDetails = {
    AmazonOrderId: orderId,
    ItemList: items.map((it) => ({ OrderItemId: it.OrderItemId, Quantity: it.QuantityOrdered ?? 1 })),
    ShipFromAddress: shipFromAddress(),
    ...packageDefaults(),
    ShippingServiceOptions: {
      DeliveryExperience: 'DeliveryConfirmationWithoutSignature',
      CarrierWillPickUp: false,
      LabelFormat: labelFormat
    }
  };

  const eligible = await spapi(lwaToken, 'POST', '/mfn/v0/eligibleShipments', {}, {
    ShipmentRequestDetails: shipmentRequestDetails
  });
  const offers: any[] = eligible?.ShippingServiceList || [];
  if (offers.length === 0) {
    throw new Error(`Nenhum serviço de envio elegível para o pedido ${orderId}`);
  }

  const cheapest = offers.reduce((a, b) =>
    Number(a?.Rate?.Amount ?? Infinity) <= Number(b?.Rate?.Amount ?? Infinity) ? a : b
  );

  const shipment = await spapi(lwaToken, 'POST', '/mfn/v0/shipments', {}, {
    ShipmentRequestDetails: shipmentRequestDetails,
    ShippingServiceId: cheapest.ShippingServiceId,
    ShippingServiceOfferId: cheapest.ShippingServiceOfferId,
    LabelFormatOption: { IncludePackingSlipWithLabel: false }
  });

  const label = shipment?.Label;
  const encoded = label?.FileContents?.Contents;
  if (!encoded) throw new Error(`Etiqueta vazia para o pedido ${orderId}`);

  // MFN returns label data as base64-encoded gzip.
  const bytes = gunzipSync(Buffer.from(encoded, 'base64'));
  const format = label?.LabelFormat || label?.FileContents?.FileType || 'application/pdf';
  return { bytes, format };
}
