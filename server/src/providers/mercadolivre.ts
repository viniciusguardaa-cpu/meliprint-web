import {
  generateCodeChallenge,
  generateCodeVerifier,
  getAuthUrl as buildMlAuthUrl,
  exchangeCodeForToken,
  getUserInfo,
  refreshAccessToken,
  searchShipments,
  getOrders,
  getShipment,
  getShipmentLabelsZPL,
  getShipmentLabelsPDF,
  getInvoiceData,
  Order,
  Shipment
} from '../services/mercadolivre.js';
import type {
  AccountContext,
  ListShipmentsOptions,
  MarketplaceProvider,
  NormalizedShipment,
  ProviderAuthResult,
  TokenSet
} from './types.js';

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 50;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isWithinRange(date: Date, from?: string, to?: string): boolean {
  if (from) {
    const df = new Date(from);
    if (!Number.isNaN(df.getTime()) && date < df) return false;
  }
  if (to) {
    const dt = new Date(to);
    if (!Number.isNaN(dt.getTime()) && date > dt) return false;
  }
  return true;
}

async function processBatchWithDelay<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (item: T) => Promise<R | null>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0) await sleep(delayMs);
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    for (const r of batchResults) {
      if (r !== null) results.push(r);
    }
  }
  return results;
}

function mlEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function toNumericIds(externalIds: string[]): number[] {
  return externalIds.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
}

async function listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const accessToken = ctx.accessToken;
  const sellerId = Number(ctx.externalUserId);
  const { dateFrom, dateTo, includeSla, includePacking } = opts;

  // Step 1: Source of truth - all ready_to_ship shipments
  const searchIds = new Set<number>();
  try {
    const readyToShipIds = await searchShipments(accessToken, sellerId, 'ready_to_ship');
    for (const id of readyToShipIds) searchIds.add(id);
    console.log(`[shipments] search API: ready_to_ship total=${searchIds.size}`);
  } catch (error) {
    console.error('[shipments] search API failed:', error);
  }

  // Step 2: Always fetch orders to build shipping_id → order map.
  // As of Oct 2025, ML discontinued order_id/external_reference from shipment
  // responses, so we can no longer get the order_id from a shipment. Instead,
  // we fetch orders (which still contain shipping.id) and match by shipment ID.
  const ordersByShipmentId = new Map<number, Order>();
  try {
    const orders = await getOrders(accessToken, sellerId, dateFrom, dateTo);
    for (const order of orders) {
      if (order.shipping?.id) {
        ordersByShipmentId.set(order.shipping.id, order);
        // Also add to shipment IDs as fallback (helps if search returns empty)
        if (!searchIds.has(order.shipping.id)) {
          searchIds.add(order.shipping.id);
        }
      }
    }
    console.log(`[shipments] orders scan: ${orders.length} orders, ${ordersByShipmentId.size} mapped to shipments`);
  } catch (error) {
    console.error('[shipments] orders scan failed:', error);
  }

  const allShipmentIds = Array.from(searchIds);
  console.log(`[shipments] total unique IDs to resolve: ${allShipmentIds.length}`);

  // Step 3: Resolve shipments
  const failedShipmentIds: number[] = [];
  const shipments = await processBatchWithDelay(
    allShipmentIds,
    BATCH_SIZE,
    BATCH_DELAY_MS,
    async (shipmentId): Promise<Shipment | null> => {
      try {
        const shipment = await getShipment(accessToken, shipmentId);
        if (shipment.status !== 'ready_to_ship') return null;
        return shipment;
      } catch {
        try {
          await sleep(500);
          const shipment = await getShipment(accessToken, shipmentId);
          if (shipment.status !== 'ready_to_ship') return null;
          return shipment;
        } catch {
          failedShipmentIds.push(shipmentId);
          return null;
        }
      }
    }
  );

  if (failedShipmentIds.length > 0) {
    console.error(`[shipments] ${failedShipmentIds.length} shipments failed after retry: ${failedShipmentIds.join(',')}`);
  }

  // Step 4: Build rows using the shipping_id → order map (no order_id from shipment)
  let rows: NormalizedShipment[] = shipments.map((shipment) => {
    const order = ordersByShipmentId.get(shipment.id);
    const items = order
      ? order.order_items.map(item => `${item.quantity}x ${item.item.title}`).join(', ')
      : '';

    const row: NormalizedShipment = {
      accountId: ctx.accountId,
      marketplace: 'mercadolivre',
      shipmentId: String(shipment.id),
      orderId: order ? String(order.id) : undefined,
      buyerNickname: order?.buyer?.nickname || '-',
      items: items.length > 100 ? items.substring(0, 97) + '...' : items,
      status: shipment.status,
      substatus: shipment.substatus || '',
      canPrint: shipment.substatus !== 'invoice_pending',
      city: shipment.receiver_address?.city?.name,
      state: shipment.receiver_address?.state?.name
    };

    if (includeSla) {
      // ML lead_time.buffering = deadline for the seller to hand the package
      // to the carrier ("despachar até").
      const deadline = shipment.lead_time?.buffering?.date;
      if (deadline) row.dispatchDeadline = deadline;
    }

    if (includePacking && order) {
      row.orderItems = order.order_items.map((item) => ({
        title: item.item.title,
        quantity: item.quantity,
        sku: item.item.seller_sku || undefined
      }));
    }

    return row;
  });

  // Step 5: Optional date filter (based on order.date_created when available)
  if (dateFrom || dateTo) {
    rows = rows.filter((r) => {
      const order = ordersByShipmentId.get(Number(r.shipmentId));
      const created = (order as any)?.date_created as string | undefined;
      if (!created) return true;
      const d = new Date(created);
      if (Number.isNaN(d.getTime())) return true;
      return isWithinRange(d, dateFrom, dateTo);
    });
  }

  console.log(`[shipments] ready_to_ship rows=${rows.length} shipments_failed=${failedShipmentIds.length}`);
  return rows;
}

export const mercadolivreProvider: MarketplaceProvider = {
  id: 'mercadolivre',
  displayName: 'Mercado Livre',
  labelFormats: ['zpl', 'pdf'],
  oauthState: 'required',

  isConfigured(): boolean {
    return !!(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET);
  },

  getAuthUrl(redirectUri: string, state: string, codeChallenge: string): string {
    return buildMlAuthUrl(mlEnv('ML_CLIENT_ID'), redirectUri, codeChallenge, state);
  },

  async exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<ProviderAuthResult> {
    const tokens = await exchangeCodeForToken(
      code,
      mlEnv('ML_CLIENT_ID'),
      mlEnv('ML_CLIENT_SECRET'),
      redirectUri,
      codeVerifier
    );
    const userInfo = await getUserInfo(tokens.access_token);
    return {
      identity: {
        externalUserId: String(userInfo.id),
        nickname: userInfo.nickname,
        email: userInfo.email
      },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000
      }
    };
  },

  async refreshTokens(account: AccountContext): Promise<TokenSet> {
    if (!account.refreshToken) {
      throw new Error('Mercado Livre account has no refresh token');
    }
    const tokens = await refreshAccessToken(
      account.refreshToken,
      mlEnv('ML_CLIENT_ID'),
      mlEnv('ML_CLIENT_SECRET')
    );
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000
    };
  },

  listReadyShipments,

  async listPrintableShipmentIds(ctx: AccountContext): Promise<string[]> {
    const ids = await searchShipments(ctx.accessToken, Number(ctx.externalUserId), 'ready_to_ship', 'ready_to_print');
    return ids.map(String);
  },

  async getLabelsZPL(ctx: AccountContext, externalIds: string[]): Promise<string> {
    return getShipmentLabelsZPL(ctx.accessToken, toNumericIds(externalIds));
  },

  async getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer> {
    return getShipmentLabelsPDF(ctx.accessToken, toNumericIds(externalIds));
  },

  async getInvoice(ctx: AccountContext, externalId: string): Promise<any> {
    return getInvoiceData(ctx.accessToken, Number(externalId));
  }
};

// Re-exported for the auth route (PKCE helpers are provider-agnostic in
// practice, but live in the ML service for historical reasons).
export { generateCodeVerifier, generateCodeChallenge };
