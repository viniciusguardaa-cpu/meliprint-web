import {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getShopInfo,
  getShipmentList,
  getProcessedOrders,
  getPrintableOrderSns,
  getOrderDetail,
  getLabelPdf,
  checkPrintEligibility,
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
 * - The seller authorization link carries `state`, which Shopee echoes back
 *   to the callback (oauthState: 'required'), same CSRF check as other
 *   providers.
 * - shipmentId is the order_sn (the id sellers recognize).
 * - Labels are PDF-only; the document type is whatever Shopee allows for the
 *   order. Automatic printing uses the updated PDF-capable local agent.
 * - LabelGo never arranges shipment (pickup/dropoff/time slot) for the
 *   seller: it lists READY_TO_SHIP and already arranged (PROCESSED) orders,
 *   and prints labels only for what the seller arranged in Shopee.
 */

function shopOf(ctx: AccountContext) {
  return { accessToken: ctx.accessToken, shopId: ctx.externalUserId };
}

async function listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const shop = shopOf(ctx);
  const orderSns = await getPrintableOrderSns(shop);
  if (orderSns.length === 0) return [];
  const entries = orderSns.map((order_sn) => ({ order_sn }));
  const details = await getOrderDetail(shop, orderSns).catch((err) => {
    console.error('[shopee] get_order_detail failed:', err);
    return [] as ShopeeOrderDetail[];
  });
  const eligibility = await checkPrintEligibility(shop, details);
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
      substatus: eligibility.get(entry.order_sn)?.canRequest ? 'label_requestable' : 'document_pending',
      canPrint: eligibility.get(entry.order_sn)?.canRequest === true,
      printReason: eligibility.get(entry.order_sn)?.reason || (!order ? 'Não foi possível consultar os pacotes na Shopee. Atualize para tentar novamente.' : undefined),
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
  oauthState: 'required',

  isConfigured(): boolean {
    return !!(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY);
  },

  getAuthUrl(redirectUri: string, state: string): string {
    // Shopee supports `state` but not PKCE; the code challenge is unused.
    return buildAuthUrl(redirectUri, state);
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
    const shop = shopOf(ctx);
    const ids = await getPrintableOrderSns(shop);
    const checks = await checkPrintEligibility(shop, await getOrderDetail(shop, ids));
    return ids.filter(id => checks.get(id)?.canRequest === true);
  },

  async listAutoPrintableShipmentIds(ctx: AccountContext): Promise<string[]> {
    // Never auto-arrange shipping or request labels for unarranged orders.
    const shop = shopOf(ctx);
    const ids = [...new Set((await getProcessedOrders(shop)).map(o => o.order_sn))];
    const checks = await checkPrintEligibility(shop, await getOrderDetail(shop, ids));
    return ids.filter(id => checks.get(id)?.canRequest === true);
  },

  async getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer> {
    const shop = shopOf(ctx);

    // An order can be split into several packages; each has its own label.
    const details = await getOrderDetail(shop, externalIds);
    const packagesBySn = new Map(
      details.map((d) => [d.order_sn, (d.package_list || []).map((p) => p.package_number)] as const)
    );

    const pdfs: Buffer[] = [];
    for (const orderSn of externalIds) {
      if (!packagesBySn.has(orderSn)) throw new Error(`Shopee não retornou os pacotes de ${orderSn}`);
      const packages = packagesBySn.get(orderSn)!;
      const targets: Array<string | undefined> = packages.length > 0 ? packages : [undefined];
      for (const packageNumber of targets) {
        const pdf = await getLabelPdf(shop, orderSn, packageNumber);
        // A partial multi-package document must not be marked printed.
        if (!pdf) throw new Error(`Etiqueta Shopee indisponível: ${orderSn}/${packageNumber || 'pedido'}. A Shopee não disponibilizou o documento. Tente novamente em alguns minutos.`);
        pdfs.push(pdf);
      }
    }

    if (pdfs.length === 0) {
      throw new Error('Nenhuma etiqueta Shopee disponível.');
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
