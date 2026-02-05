import crypto from 'crypto';

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
  // Buscar pedidos com envio ready_to_ship (prontos para despachar)
  const params = new URLSearchParams({
    seller: sellerId.toString(),
    'shipping.status': 'ready_to_ship',
    sort: 'date_desc',
    limit: '50'
  });

  const response = await fetch(`${ML_API_URL}/orders/search?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get orders');
  }

  const data = await response.json();
  return data.results || [];
}

export async function getShipment(accessToken: string, shipmentId: number): Promise<Shipment> {
  const response = await fetch(`${ML_API_URL}/shipments/${shipmentId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
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

  return response.text();
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
