/**
 * Bling ERP API v3 client (https://developer.bling.com.br).
 *
 * Standard OAuth2 authorization code flow. `enable-jwt: 1` makes Bling
 * return self-contained JWTs (opaque tokens are being discontinued).
 * Identity comes from /empresas/me/dados-basicos (the empresa the token
 * was authorized for). Shipping labels live under /logisticas/objetos —
 * each "objeto" is a shipment and exposes an /etiqueta endpoint.
 */

const BLING_WEB = 'https://www.bling.com.br';
const BLING_API = 'https://api.bling.com.br';

function clientId(): string {
  const v = process.env.BLING_CLIENT_ID;
  if (!v) throw new Error('Missing environment variable: BLING_CLIENT_ID');
  return v;
}

function clientSecret(): string {
  const v = process.env.BLING_CLIENT_SECRET;
  if (!v) throw new Error('Missing environment variable: BLING_CLIENT_SECRET');
  return v;
}

function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri,
    state
  });
  return `${BLING_WEB}/Api/v3/oauth/authorize?${params.toString()}`;
}

export interface BlingTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<BlingTokenResponse> {
  const res = await fetch(`${BLING_WEB}/Api/v3/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'enable-jwt': '1'
    },
    body: new URLSearchParams(body)
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Bling token request failed (${res.status}): ${data?.error?.message || JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

export function exchangeCodeForToken(code: string, redirectUri: string): Promise<BlingTokenResponse> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

export function refreshAccessToken(refreshToken: string): Promise<BlingTokenResponse> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function apiGet(accessToken: string, path: string, params?: Record<string, string>): Promise<any> {
  const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
  const res = await fetch(`${BLING_API}/Api/v3${path}${qs}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'enable-jwt': '1'
    }
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
    const err = new Error(`Bling ${path} failed (${res.status}): ${msg}`) as any;
    err.status = res.status;
    throw err;
  }
  return data;
}

export interface BlingEmpresa {
  id: number | string;
  nome?: string;
  razaoSocial?: string;
  email?: string;
}

/** Empresa the token was authorized for — used as the connected identity. */
export async function getEmpresa(accessToken: string): Promise<BlingEmpresa> {
  const data = await apiGet(accessToken, '/empresas/me/dados-basicos');
  return data?.data ?? data;
}

export interface BlingLogisticObject {
  id: number | string;
  descricao?: string;
  dataCriacao?: string;
  situacao?: { id?: number | string; nome?: string };
  servico?: { id?: number | string; nome?: string; codigo?: string };
  rastreamento?: { codigo?: string };
  pedido?: { id?: number | string };
  notaFiscal?: { id?: number | string };
  remessa?: { id?: number | string };
  [key: string]: any;
}

/** Objetos logísticos (shipments) — paginated. */
export async function listLogisticObjects(
  accessToken: string,
  maxItems = 200
): Promise<BlingLogisticObject[]> {
  const out: BlingLogisticObject[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await apiGet(accessToken, '/logisticas/objetos', {
      pagina: String(page),
      limite: '100'
    });
    const items: BlingLogisticObject[] = data?.data || [];
    out.push(...items);
    if (items.length < 100 || out.length >= maxItems) break;
  }
  return out.slice(0, maxItems);
}

export interface BlingPedido {
  id: number | string;
  numero?: string;
  contato?: { id?: number | string; nome?: string };
  itens?: Array<{ quantidade?: number; descricao?: string; codigo?: string }>;
  transporte?: { etiqueta?: any };
  situacao?: { id?: number | string; nome?: string; valor?: number };
  [key: string]: any;
}

export async function getPedido(accessToken: string, pedidoId: string): Promise<BlingPedido | null> {
  try {
    const data = await apiGet(accessToken, `/pedidos/vendas/${pedidoId}`);
    return data?.data ?? null;
  } catch (err) {
    console.warn(`[bling] pedido ${pedidoId}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Shipping label for a logistic object. Bling returns either a JSON payload
 * ({data:{url}} or base64) or the raw file — handle both.
 */
export async function getLabelPdf(accessToken: string, objetoId: string): Promise<Buffer | null> {
  const res = await fetch(`${BLING_API}/Api/v3/logisticas/objetos/${objetoId}/etiqueta`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json, application/pdf, */*',
      'enable-jwt': '1'
    }
  });

  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());

  if (!res.ok) {
    console.warn(`[bling] etiqueta ${objetoId}: HTTP ${res.status} ${buf.toString('utf8').slice(0, 200)}`);
    return null;
  }

  if (contentType.includes('json')) {
    try {
      const data = JSON.parse(buf.toString('utf8'));
      const url = data?.data?.url || data?.data?.etiqueta?.url;
      if (url) {
        const file = await fetch(url);
        if (file.ok) return Buffer.from(await file.arrayBuffer());
      }
      const b64 = data?.data?.base64 || data?.data?.conteudo;
      if (b64) return Buffer.from(b64, 'base64');
      console.warn(`[bling] etiqueta ${objetoId}: unexpected JSON shape`);
      return null;
    } catch {
      return null;
    }
  }

  return buf.length > 0 ? buf : null;
}
