import { PDFDocument } from 'pdf-lib';
import type { AccountContext, ListShipmentsOptions, MarketplaceProvider, NormalizedShipment } from './types.js';
import { authorizedShops, exchangeTikTokCode, refreshTikTokToken, tiktokConfigured, shopFor,
  searchOrders, printablePackage, packagePDF, externalId } from '../services/tiktok.js';

async function discover(ctx: AccountContext, createdAfter?: number, opts?: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const shop = await shopFor(ctx);
  const from = opts?.dateFrom ? Math.floor(Date.parse(opts.dateFrom) / 1000) : undefined;
  const to = opts?.dateTo ? Math.floor(Date.parse(opts.dateTo) / 1000) + 1 : undefined;
  if ((from !== undefined && !Number.isSafeInteger(from)) || (to !== undefined && !Number.isSafeInteger(to))) throw new Error('Invalid TikTok date filter');
  const orders = await searchOrders(ctx.accessToken, shop, {
    shipping_type: 'TIKTOK', ...(createdAfter === undefined && from === undefined ? {} : { create_time_ge: Math.max(createdAfter === undefined ? 0 : createdAfter + 1, from ?? 0) }),
    ...(to === undefined ? {} : { create_time_lt: to })
  });
  const ids = new Set(orders.filter(o => ['AWAITING_SHIPMENT', 'AWAITING_COLLECTION', 'PARTIALLY_SHIPPING'].includes(o.status))
    .flatMap(o => (o.packages ?? []).map(p => externalId(p.id))));
  const rows: NormalizedShipment[] = [];
  for (const id of ids) {
    const related = await printablePackage(ctx, shop, id, createdAfter);
    if (!related) continue;
    const items = related.flatMap(o => (o.line_items ?? []).filter(i => !i.package_id || i.package_id === id));
    rows.push({ accountId: ctx.accountId, marketplace: 'tiktok', shipmentId: id, orderId: related.map(o => o.id).join(', '),
      buyerNickname: related[0].recipient_address?.name || '-', items: items.map(i => i.product_name || 'Item').join(', ').slice(0, 100),
      status: 'ready_to_ship', substatus: 'ready_to_print', canPrint: true,
      orderItems: items.map(i => ({ title: i.product_name || 'Item', quantity: 1, sku: i.seller_sku })),
      dispatchDeadline: related[0].rts_sla_time ? new Date(related[0].rts_sla_time * 1000).toISOString() : undefined });
  }
  return rows;
}

export const tiktokProvider: MarketplaceProvider = {
  id: 'tiktok', displayName: 'TikTok Shop', labelFormats: ['pdf'], oauthState: 'required',
  isConfigured: tiktokConfigured,
  getAuthorizationCode(query) {
    return !query.error && typeof query.code === 'string' && query.code !== 'null' && query.code ? query.code : undefined;
  },
  getAuthUrl(_redirectUri, state) {
    if (!tiktokConfigured()) throw new Error('TikTok Shop não configurado');
    const url = new URL('https://services.tiktokshop.com/open/authorize');
    url.search = new URLSearchParams({ service_id: process.env.TIKTOK_SERVICE_ID!, state }).toString();
    return url.toString();
  },
  async exchangeCode(code) {
    const tokens = await exchangeTikTokCode(code);
    const shops = await authorizedShops(tokens.accessToken);
    // No silent first-shop selection, no callback-supplied shop IDs/ciphers.
    if (shops.length !== 1) throw new Error('Autorize exatamente uma loja brasileira do TikTok Shop por conexão.');
    return { identity: { externalUserId: shops[0].id, nickname: shops[0].name }, tokens };
  },
  async refreshTokens(ctx) {
    if (!ctx.refreshToken) throw new Error('TikTok account has no refresh token');
    // Persist rotation immediately via the account service. A subsequent API
    // outage must not discard the newly issued refresh token. Every data/label
    // operation resolves the exact owned shop again through shopFor().
    return refreshTikTokToken(ctx.refreshToken);
  },
  async listReadyShipments(ctx, opts) {
    const rows = await discover(ctx, undefined, opts);
    return rows.map(row => ({ ...row, ...(opts.includeSla ? {} : { dispatchDeadline: undefined }), ...(opts.includePacking ? {} : { orderItems: undefined }) }));
  },
  async listPrintableShipmentIds(ctx) { return (await discover(ctx)).map(r => r.shipmentId); },
  async listAutoPrintBaselineShipmentIds(ctx) {
    const shop = await shopFor(ctx);
    // Include every state and every package. Old orders not packaged yet are
    // additionally protected by order create_time on EVERY later discovery.
    const orders = await searchOrders(ctx.accessToken, shop, {});
    return [...new Set(orders.flatMap(o => (o.packages ?? []).map(p => externalId(p.id))))];
  },
  async listAutoPrintableShipmentIds(ctx, opts) {
    if (!opts || !Number.isSafeInteger(opts.createdAfter)) throw new Error('TikTok automatic printing requires activation cutoff');
    return (await discover(ctx, opts.createdAfter)).map(r => r.shipmentId);
  },
  async getLabelsPDF(ctx, ids, options) {
    if (!ids.length || ids.length > 100) throw new Error('Selecione de 1 a 100 pacotes TikTok.');
    if (new Set(ids).size !== ids.length) throw new Error('Pacotes TikTok repetidos.');
    const shop = await shopFor(ctx);
    const pdfs: Buffer[] = [];
    for (const id of ids) pdfs.push(await packagePDF(ctx, shop, externalId(id), options?.createdAfter));
    if (pdfs.length === 1) return pdfs[0];
    const merged = await PDFDocument.create();
    for (const bytes of pdfs) {
      const source = await PDFDocument.load(bytes);
      for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
    }
    return Buffer.from(await merged.save());
  }
};
