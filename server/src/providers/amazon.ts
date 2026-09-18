import {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  listUnshippedOrders,
  getOrderItems,
  purchaseLabel,
  SpApiOrder,
  SpApiOrderItem
} from '../services/amazon.js';
import type {
  AccountContext,
  ListShipmentsOptions,
  MarketplaceProvider,
  NormalizedShipment,
  ProviderAuthResult,
  TokenSet
} from './types.js';

/**
 * Amazon SP-API.
 *
 * - The callback returns `spapi_oauth_code` (not `code`) plus
 *   `selling_partner_id` — getAuthorizationCode handles that.
 * - externalUserId = selling_partner_id.
 * - Labels via Merchant Fulfillment purchase the shipment (Buy Shipping
 *   equivalent). Requires the Direct-to-Consumer Shipping role and
 *   AMAZON_SHIP_FROM_* env config. ZPL-capable when the carrier offers it.
 */

async function listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const orders = await listUnshippedOrders(ctx.accessToken, opts.dateFrom, opts.dateTo);

  const rows: NormalizedShipment[] = [];
  for (const order of orders) {
    // Skip FBA — Amazon ships those itself.
    if (order.FulfillmentChannel && order.FulfillmentChannel !== 'MFN') continue;

    let items: SpApiOrderItem[] = [];
    try {
      items = await getOrderItems(ctx.accessToken, order.AmazonOrderId);
    } catch (err) {
      console.warn(`[amazon] orderItems ${order.AmazonOrderId}: ${(err as Error).message}`);
    }

    const itemSummary = items
      .map((it) => `${it.QuantityOrdered ?? 1}x ${it.Title || 'Item'}`)
      .join(', ');

    const row: NormalizedShipment = {
      accountId: ctx.accountId,
      marketplace: 'amazon',
      shipmentId: order.AmazonOrderId,
      orderId: order.AmazonOrderId,
      buyerNickname: order.BuyerInfo?.BuyerName || '-',
      items: itemSummary.length > 100 ? itemSummary.substring(0, 97) + '...' : itemSummary,
      status: 'ready_to_ship',
      substatus: 'ready_to_print',
      canPrint: true,
      city: order.ShippingAddress?.City,
      state: order.ShippingAddress?.StateOrRegion
    };

    if (opts.includeSla && order.LatestShipDate) {
      row.dispatchDeadline = order.LatestShipDate;
    }

    if (opts.includePacking) {
      row.orderItems = items.map((it) => ({
        title: it.Title || 'Item',
        quantity: it.QuantityOrdered ?? 1,
        sku: it.SellerSKU || undefined
      }));
    }

    rows.push(row);
  }

  return rows;
}

async function labelForOrder(ctx: AccountContext, orderId: string, format: 'ZPL203' | 'PDF') {
  const items = await getOrderItems(ctx.accessToken, orderId);
  if (items.length === 0) throw new Error(`Pedido Amazon ${orderId} sem itens`);
  return purchaseLabel(ctx.accessToken, orderId, items, format);
}

export const amazonProvider: MarketplaceProvider = {
  id: 'amazon',
  displayName: 'Amazon',
  labelFormats: ['zpl', 'pdf'],
  oauthState: 'required',

  isConfigured(): boolean {
    return !!(
      process.env.AMAZON_APP_ID &&
      process.env.AMAZON_LWA_CLIENT_ID &&
      process.env.AMAZON_LWA_CLIENT_SECRET &&
      process.env.AMAZON_AWS_ACCESS_KEY_ID &&
      (process.env.AMAZON_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)
    );
  },

  getAuthorizationCode(query: Record<string, unknown>): string | undefined {
    const code = query.spapi_oauth_code ?? query.code;
    return typeof code === 'string' ? code : undefined;
  },

  getAuthUrl(_redirectUri: string, state: string): string {
    return buildAuthUrl(state);
  },

  async exchangeCode(
    code: string,
    redirectUri: string,
    _codeVerifier: string,
    callbackQuery?: Record<string, unknown>
  ): Promise<ProviderAuthResult> {
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const sellingPartnerId = String(callbackQuery?.selling_partner_id ?? '');
    if (!sellingPartnerId) {
      throw new Error('Amazon callback missing selling_partner_id');
    }

    return {
      identity: { externalUserId: sellingPartnerId },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000
      }
    };
  },

  async refreshTokens(account: AccountContext): Promise<TokenSet> {
    if (!account.refreshToken) {
      throw new Error('Amazon account has no refresh token');
    }
    const tokens = await refreshAccessToken(account.refreshToken);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? account.refreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000
    };
  },

  listReadyShipments,

  async listPrintableShipmentIds(ctx: AccountContext): Promise<string[]> {
    const orders = await listUnshippedOrders(ctx.accessToken);
    return orders
      .filter((o: SpApiOrder) => !o.FulfillmentChannel || o.FulfillmentChannel === 'MFN')
      .map((o) => o.AmazonOrderId);
  },

  async getLabelsZPL(ctx: AccountContext, externalIds: string[]): Promise<string> {
    const parts: string[] = [];
    for (const orderId of externalIds) {
      const { bytes, format } = await labelForOrder(ctx, orderId, 'ZPL203');
      if (/zpl/i.test(format)) {
        parts.push(bytes.toString('utf8').trim());
      } else {
        console.warn(`[amazon] label for ${orderId} came back as ${format} (not ZPL)`);
      }
    }
    return parts.join('\n\n');
  },

  async getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer> {
    const pdfs: Buffer[] = [];
    for (const orderId of externalIds) {
      const { bytes, format } = await labelForOrder(ctx, orderId, 'PDF');
      if (/pdf/i.test(format)) {
        pdfs.push(bytes);
      } else {
        console.warn(`[amazon] label for ${orderId} came back as ${format} (not PDF)`);
      }
    }

    if (pdfs.length === 0) {
      throw new Error('Nenhuma etiqueta Amazon em PDF para os pedidos selecionados');
    }
    if (pdfs.length === 1) return pdfs[0];

    const { PDFDocument } = await import('pdf-lib');
    const merged = await PDFDocument.create();
    for (const buf of pdfs) {
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
  }
};
