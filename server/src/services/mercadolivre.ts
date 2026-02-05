import crypto from 'crypto';
import JSZip from 'jszip';
import { gunzipSync } from 'zlib';

const ML_API_URL = 'https://api.mercadolibre.com';
const ML_AUTH_URL = 'https://auth.mercadolivre.com.br';

let shipmentsSearchUnsupported = false;

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
}

export interface UserInfo {
  id: number;
  nickname: string;
  email: string;
}

export interface Shipment {
  id: number;
  status: string;
  substatus: string;
  order_id: number;
  lead_time?: {
    buffering?: {
      date?: string;
    };
  };
  receiver_address?: {
    city?: { name: string };
    state?: { name: string };
  };
}

export interface Order {
  id: number;
  shipping: {
    id: number;
  };
  buyer: {
    nickname: string;
  };
  order_items: Array<{
    item: {
      title: string;
    };
    quantity: number;
  }>;
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function getAuthUrl(clientId: string, redirectUri: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${ML_AUTH_URL}/authorization?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const response = await fetch(`${ML_API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return response.json();
}

export async function searchShipments(
  accessToken: string,
  sellerId: number,
  status: string,
  substatus: string
): Promise<number[]> {
  if (shipmentsSearchUnsupported) {
    return [];
  }

  const params = new URLSearchParams({
    seller: sellerId.toString(),
    status,
    substatus,
    limit: '50'
  });

  const response = await fetch(`${ML_API_URL}/shipments/search?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-format-new': 'true'
    }
  });

  if (response.status === 404) {
    shipmentsSearchUnsupported = true;
    return [];
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to search shipments: ${error}`);
  }

  const data = await response.json();
  const results = data.results || [];

  if (!Array.isArray(results)) return [];

  if (results.length === 0) return [];

  if (typeof results[0] === 'number') {
    return results as number[];
  }

  if (typeof results[0] === 'object' && results[0] && 'id' in results[0]) {
    return results.map((r: any) => r.id).filter((id: any) => typeof id === 'number');
  }

  return [];
}

export async function getOrder(accessToken: string, orderId: number): Promise<Order> {
  const response = await fetch(`${ML_API_URL}/orders/${orderId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get order ${orderId}: ${error}`);
  }

  return response.json();
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const response = await fetch(`${ML_API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return response.json();
}

export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(`${ML_API_URL}/users/me`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

export async function getOrders(accessToken: string, sellerId: number): Promise<Order[]> {
  const limit = 50;
  const maxPages = 4;
  const results: Order[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const params = new URLSearchParams({
      seller: sellerId.toString(),
      'order.status': 'paid',
      sort: 'date_desc',
      limit: String(limit),
      offset: String(offset)
    });

    const response = await fetch(`${ML_API_URL}/orders/search?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get orders: ${error}`);
    }

    const data = await response.json();
    const pageResults: Order[] = data.results || [];
    results.push(...pageResults);

    if (pageResults.length < limit) {
      break;
    }
  }

  return results;
}

export async function getShipment(accessToken: string, shipmentId: number): Promise<Shipment> {
  const response = await fetch(`${ML_API_URL}/shipments/${shipmentId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-format-new': 'true'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to get shipment ${shipmentId}`);
  }

  return response.json();
}

export async function getShipmentLabelsZPL(accessToken: string, shipmentIds: number[]): Promise<string> {
  const ids = shipmentIds.slice(0, 50).join(',');
  const response = await fetch(
    `${ML_API_URL}/shipment_labels?shipment_ids=${ids}&response_type=zpl2`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get labels: ${error}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
    const preferred =
      fileNames.find((n) => n.toLowerCase().endsWith('.zpl')) ||
      fileNames.find((n) => n.toLowerCase().endsWith('.txt')) ||
      fileNames[0];

    if (!preferred) {
      throw new Error('Failed to extract ZPL: empty ZIP from Mercado Livre');
    }

    const f = zip.file(preferred);
    if (!f) {
      throw new Error(`Failed to extract ZPL: missing file ${preferred} inside ZIP`);
    }

    return (await f.async('string')).trim();
  }

  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const unzipped = gunzipSync(bytes);
    return unzipped.toString('utf8').trim();
  }

  return bytes.toString('utf8').trim();
}

export async function getShipmentLabelsPDF(accessToken: string, shipmentIds: number[]): Promise<Buffer> {
  console.log('[PDF] Fetching ZPL for shipments:', shipmentIds);
  const zpl = await getShipmentLabelsZPL(accessToken, shipmentIds);
  console.log('[PDF] ZPL length:', zpl.length, 'first 200 chars:', zpl.substring(0, 200));

  const resp = await fetch('https://api.labelary.com/v1/printers/8dpmm/labels/4x6/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/pdf',
      'X-Linter': 'On'
    },
    body: zpl
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[PDF] Labelary error (multi-label):', resp.status, errText);
    throw new Error(`Labelary conversion failed: status=${resp.status}`);
  }

  const total = resp.headers.get('x-total-count');
  const warnings = resp.headers.get('x-warnings');
  if (total) console.log('[PDF] Labelary X-Total-Count:', total);
  if (warnings) console.log('[PDF] Labelary X-Warnings:', warnings);

  const pdfBytes = await resp.arrayBuffer();
  console.log('[PDF] Labelary PDF bytes:', pdfBytes.byteLength);
  return Buffer.from(pdfBytes);
}

export async function getInvoiceData(accessToken: string, shipmentId: number): Promise<any> {
  const response = await fetch(
    `${ML_API_URL}/shipments/${shipmentId}/fiscal_documents`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}
