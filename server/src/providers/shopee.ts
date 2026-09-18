import {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getShopInfo,
  getShipmentList,
  getOrderDetail,
  getLabelPdf,
  ShopeeOrderDetail
} from '../services/shopee.js';
import type {
  AccountContext,
  ListShipmentsOptions,
  MarketplaceProvider,
  NormalizedShipment,
  ProviderAuthResult,
  TokenSet
} from './types.js';

/**
 * Shopee Open Platform v2.
 *
 * Caveats:
 * - The seller OAuth redirect has no `state` param (oauthState:
 *   'unsupported') — CSRF protection comes from the session-bound pending
 *   attempt in routes/auth.ts.
 * - shipmentId is the order_sn (the id sellers recognize).
 * - Labels are PDF-only (THERMAL_AIR_WAYBILL) — no ZPL, so this provider is
 *   skipped by the auto-print poller.
 */

function shopOf(ctx: AccountContext) {
  return { accessToken: ctx.accessToken, shopId: ctx.externalUserId };
}

async function listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const shop = shopOf(ctx);
  const entries = await getShipmentList(shop);
  if (entries.length === 0) return [];

  const orderSns = entries.map((e) => e.order_sn);
  const details = await getOrderDetail(shop, orderSns).catch((err) => {
    console.error('[shopee] get_order_detail failed:', err);
    return [] as ShopeeOrderDetail[];
  });
  const bySn = new Map(details.map((d) => [d.order_sn, d]));

  const rows: NormalizedShipment[] = [];
  for (const entry of entries) {
    const order = bySn.get(entry.order_sn);

    const items = (order?.item_list || [])
      .map((it) => `${it.model_quantity_purchased ?? 1}x ${it.item_name || 'Item'}`)
      .join(', ');

    const row: NormalizedShipment = {
      accountId: ctx.accountId,
      marketplace: 'shopee',
      shipmentId: entry.order_sn,
      orderId: entry.order_sn,
      buyerNickname: order?.buyer_username || '-',
      items: items.length > 100 ? items.substring(0, 97) + '...' : items,
      status: 'ready_to_ship',
      substatus: 'ready_to_print',
      canPrint: true,
      city: order?.recipient_address?.city,
      state: order?.recipient_address?.state
    };

    if (opts.includeSla && order?.ship_by_date) {
      row.dispatchDeadline = new Date(order.ship_by_date * 1000).toISOString();
    }

    if (opts.includePacking && order?.item_list) {
      row.orderItems = order.item_list.map((it) => ({
        title: it.item_name || 'Item',
        quantity: it.model_quantity_purchased ?? 1,
        sku: it.model_sku || it.item_sku || undefined
      }));
    }

    rows.push(row);
  }

  return rows;
}

export const shopeeProvider: MarketplaceProvider = {
  id: 'shopee',
  displayName: 'Shopee',
  labelFormats: ['pdf'],
  oauthState: 'unsupported',

  isConfigured(): boolean {
    return !!(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY);
  },

  getAuthUrl(redirectUri: string): string {
    // Shopee auth_partner signs (partner_id + path + timestamp) and has no
    // state/PKCE params — both are unused here by design.
    return buildAuthUrl(redirectUri);
  },

  async exchangeCode(
    code: string,
    _redirectUri: string,
    _codeVerifier: string,
    callbackQuery?: Record<string, unknown>
  ): Promise<ProviderAuthResult> {
    const shopId = String(callbackQuery?.shop_id ?? '');
    if (!shopId) throw new Error('Shopee callback missing shop_id');

    const tokens = await exchangeCodeForToken(code, shopId);
    const shop = { accessToken: tokens.access_token, shopId: String(tokens.shop_id ?? shopId) };
    const info = await getShopInfo(shop).catch(() => null);

    return {
      identity: {
        externalUserId: shop.shopId,
        nickname: info?.shop_name
      },
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expire_in * 1000
      }
    };
  },

  async refreshTokens(account: AccountContext): Promise<TokenSet> {
    if (!account.refreshToken) {
      throw new Error('Shopee account has no refresh token');
    }
    const tokens = await refreshAccessToken(account.refreshToken, account.externalUserId);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? account.refreshToken,
      expiresAt: Date.now() + tokens.expire_in * 1000
    };
  },

  listReadyShipments,

  async listPrintableShipmentIds(ctx: AccountContext): Promise<string[]> {
    const entries = await getShipmentList(shopOf(ctx));
    return entries.map((e) => e.order_sn);
  },

  async getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer> {
    const shop = shopOf(ctx);

    // package_number is needed when the order already has packages.
    const details = await getOrderDetail(shop, externalIds).catch(() => [] as ShopeeOrderDetail[]);
    const packageBySn = new Map(
      details.map((d) => [d.order_sn, d.package_list?.[0]?.package_number] as const)
    );

    const pdfs: Buffer[] = [];
    for (const orderSn of externalIds) {
      const pdf = await getLabelPdf(shop, orderSn, packageBySn.get(orderSn));
      if (pdf) pdfs.push(pdf);
    }

    if (pdfs.length === 0) {
      throw new Error('Nenhuma etiqueta Shopee disponível (envio não organizado ou status não imprimível)');
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
