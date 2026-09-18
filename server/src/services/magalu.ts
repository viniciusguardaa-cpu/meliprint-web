/**
 * Magalu Open API client (https://developers.magalu.com).
 *
 * OAuth2 Authorization Code via ID Magalu:
 *   consent:  https://id.magalu.com/login?client_id&redirect_uri&scope&response_type=code&choose_tenants=true
 *   token:    POST https://id.magalu.com/oauth/token (JSON body)
 *   refresh:  POST https://id.magalu.com/oauth/token (form-urlencoded)
 *
 * API calls go to api.magalu.com with Bearer + X-Tenant-Id. The tenant is
 * the seller organization picked during consent (choose_tenants=true) and
 * arrives inside the access_token JWT claims.
 */

const ID_BASE = 'https://id.magalu.com';
const API_BASE = process.env.MAGALU_API_BASE || 'https://api.magalu.com';

const SCOPES = [
  'open:order-order-seller:read',
  'open:order-delivery-seller:read',
  'open:order-logistics-seller:read',
  'open:order-logistics-seller:write'
];

function clientId(): string {
  const v = process.env.MAGALU_CLIENT_ID;
  if (!v) throw new Error('Missing environment variable: MAGALU_CLIENT_ID');
  return v;
}

function clientSecret(): string {
  const v = process.env.MAGALU_CLIENT_SECRET;
  if (!v) throw new Error('Missing environment variable: MAGALU_CLIENT_SECRET');
  return v;
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    choose_tenants: 'true',
    state
  });
  return `${ID_BASE}/login?${params.toString()}`;
}

export interface MagaluTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  created_at?: number;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<MagaluTokenResponse> {
  const res = await fetch(`${ID_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      code
    })
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Magalu token exchange failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

export async function refreshAccessToken(refreshToken: string): Promise<MagaluTokenResponse> {
  const res = await fetch(`${ID_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken
    })
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Magalu token refresh failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

/**
 * Tenant id (X-Tenant-Id) from the JWT access token claims. Falls back to
 * MAGALU_TENANT_ID for single-seller development setups.
 */
export function extractTenantId(accessToken: string): string | undefined {
  if (process.env.MAGALU_TENANT_ID) return process.env.MAGALU_TENANT_ID;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const queue: any[] = [payload];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== 'object') continue;
      for (const [k, v] of Object.entries(node)) {
        if (/tenant|seller_id|organization|org_id/i.test(k) && typeof v === 'string' && v) return v;
        if (v && typeof v === 'object') queue.push(v);
      }
    }
    return payload.sub ? String(payload.sub) : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function apiCall(
  accessToken: string,
  tenantId: string,
  method: string,
  path: string,
  params?: Record<string, string>,
  body?: unknown
): Promise<Response> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  return fetch(`${API_BASE}${path}${qs}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Tenant-Id': tenantId,
      'Accept': 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

async function apiJson(
  accessToken: string,
  tenantId: string,
  method: string,
  path: string,
  params?: Record<string, string>,
  body?: unknown
): Promise<any> {
  const res = await apiCall(accessToken, tenantId, method, path, params, body);
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Magalu ${path} failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`) as any;
    err.status = res.status;
    throw err;
  }
  return data;
}

export interface MagaluDelivery {
  id: string;
  code?: string;
  status?: string;
  purchased_at?: string;
  order?: { id?: string; code?: string; channel?: { alias?: string; id?: string } };
  seller?: { id?: string; name?: string };
  customer?: { name?: string };
  items?: Array<{ quantity?: number; name?: string; description?: string; sku?: string; external_sku?: string }>;
  shipping?: { address?: { city?: string; state?: string } };
  [key: string]: any;
}

/**
 * Deliveries awaiting dispatch. Statuses that mean "still needs a label" —
 * the API's exact vocabulary is validated against the sandbox; anything
 * already shipped/delivered/cancelled is excluded.
 */
const DONE_STATUSES = /ship|deliver|cancel|return|conclu|finaliz/i;

export async function listReadyDeliveries(
  accessToken: string,
  tenantId: string,
  maxItems = 200
): Promise<MagaluDelivery[]> {
  const out: MagaluDelivery[] = [];
  for (let offset = 0; offset < maxItems; offset += 50) {
    const data = await apiJson(accessToken, tenantId, 'GET', '/seller/v1/deliveries', {
      _offset: String(offset),
      _limit: '50'
    });
    const items: MagaluDelivery[] = data?.deliveries || data?.data || data?.results || [];
    out.push(...items);
    if (items.length < 50) break;
  }
  return out
    .slice(0, maxItems)
    .filter((d) => !d.status || !DONE_STATUSES.test(d.status));
}

/**
 * Generate the shipping label for a delivery. The endpoint is async-safe:
 * it returns either a document URL/base64 payload or the file itself.
 */
export async function getLabelPdf(
  accessToken: string,
  tenantId: string,
  deliveryId: string
): Promise<Buffer | null> {
  const tryBodies: Record<string, unknown>[] = [
    { deliveries: [{ id: deliveryId }] },
    { delivery_id: deliveryId }
  ];

  for (const body of tryBodies) {
    const res = await apiCall(accessToken, tenantId, 'POST', '/seller/v1/logistics/shipping-labels', undefined, body);
    const contentType = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());

    if (!res.ok) {
      if (res.status === 422 || res.status === 400) continue; // try next body shape
      console.warn(`[magalu] shipping-labels ${deliveryId}: HTTP ${res.status} ${buf.toString('utf8').slice(0, 200)}`);
      return null;
    }

    if (contentType.includes('json')) {
      try {
        const data = JSON.parse(buf.toString('utf8'));
        const url = data?.url || data?.data?.url || data?.label?.url || data?.document?.url;
        if (url) {
          const file = await fetch(url);
          if (file.ok) return Buffer.from(await file.arrayBuffer());
        }
        const b64 = data?.base64 || data?.data?.base64 || data?.label?.content;
        if (b64) return Buffer.from(b64, 'base64');
        console.warn(`[magalu] shipping-labels ${deliveryId}: unexpected JSON shape`);
        return null;
      } catch {
        return null;
      }
    }

    return buf.length > 0 ? buf : null;
  }

  return null;
}
