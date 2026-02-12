import crypto from 'crypto';
import JSZip from 'jszip';
import { gunzipSync } from 'zlib';

const ML_API_URL = 'https://api.mercadolibre.com';
const ML_AUTH_URL = 'https://auth.mercadolivre.com.br';


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
  const limit = 50;
  const maxPages = 20;
  const allIds: number[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const params = new URLSearchParams({
      seller: sellerId.toString(),
      status,
      substatus,
      limit: String(limit),
      offset: String(offset)
    });

    const response = await fetch(`${ML_API_URL}/shipments/search?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-format-new': 'true'
      }
    });

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to search shipments: ${error}`);
    }

    const data = await response.json();
    const results = data.results || [];

    if (!Array.isArray(results) || results.length === 0) break;

    if (typeof results[0] === 'number') {
      allIds.push(...(results as number[]));
    } else if (typeof results[0] === 'object' && results[0] && 'id' in results[0]) {
      allIds.push(...results.map((r: any) => r.id).filter((id: any) => typeof id === 'number'));
    } else {
      break;
    }

    if (results.length < limit) break;
  }

  return allIds;
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

export async function getOrders(
  accessToken: string,
  sellerId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<Order[]> {
  const limit = 50;
  const maxPages = 20;
  const allResults: Order[] = [];
  const seenIds = new Set<number>();

  const orderStatuses = ['paid', 'payment_in_process'];

  for (const orderStatus of orderStatuses) {
    for (let page = 0; page < maxPages; page++) {
      const offset = page * limit;
      const params = new URLSearchParams({
        seller: sellerId.toString(),
        'order.status': orderStatus,
        sort: 'date_desc',
        limit: String(limit),
        offset: String(offset)
      });

      if (dateFrom) params.set('order.date_created.from', dateFrom);
      if (dateTo) params.set('order.date_created.to', dateTo);

      const response = await fetch(`${ML_API_URL}/orders/search?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[orders] Failed for status=${orderStatus} page=${page}: ${error}`);
        break;
      }

      const data = await response.json();
      const pageResults: Order[] = data.results || [];

      for (const order of pageResults) {
        if (!seenIds.has(order.id)) {
          seenIds.add(order.id);
          allResults.push(order);
        }
      }

      if (pageResults.length < limit) break;
    }
  }

  return allResults;
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
  const ids = shipmentIds.join(',');
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

async function convertZplToPdf(zpl: string): Promise<Buffer> {
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
    console.error('[PDF] Labelary error:', resp.status, errText);
    throw new Error(`Labelary conversion failed: status=${resp.status}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

export async function getShipmentLabelsPDF(accessToken: string, shipmentIds: number[]): Promise<Buffer> {
  const BATCH_SIZE = 5;
  const batches: number[][] = [];
  for (let i = 0; i < shipmentIds.length; i += BATCH_SIZE) {
    batches.push(shipmentIds.slice(i, i + BATCH_SIZE));
  }

  console.log(`[PDF] Processing ${shipmentIds.length} shipments in ${batches.length} batches`);

  const pdfBuffers: Buffer[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`[PDF] Batch ${i + 1}/${batches.length}: shipments ${batch.join(',')}`);
    const zpl = await getShipmentLabelsZPL(accessToken, batch);
    const pdf = await convertZplToPdf(zpl);
    pdfBuffers.push(pdf);
  }

  if (pdfBuffers.length === 1) {
    return pdfBuffers[0];
  }

  // Merge all PDFs using pdf-lib
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (const buf of pdfBuffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const mergedBytes = await merged.save();
  console.log(`[PDF] Merged PDF: ${mergedBytes.byteLength} bytes, ${merged.getPageCount()} pages`);
  return Buffer.from(mergedBytes);
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
