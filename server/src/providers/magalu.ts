import {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  extractTenantId,
  listReadyDeliveries,
  getLabelPdf
} from '../services/magalu.js';
import type {
  AccountContext,
  ListShipmentsOptions,
  MarketplaceProvider,
  NormalizedShipment,
  ProviderAuthResult,
  TokenSet
} from './types.js';

/**
 * Magalu marketplace — Magalu Entregas labels via
 * POST /seller/v1/logistics/shipping-labels (PDF). externalUserId holds the
 * tenant id extracted from the access token JWT, since every API call needs
 * it as X-Tenant-Id.
 */

async function listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const deliveries = await listReadyDeliveries(ctx.accessToken, ctx.externalUserId);

  const { dateFrom, dateTo } = opts;
  const rows: NormalizedShipment[] = [];

  for (const d of deliveries) {
    if (dateFrom || dateTo) {
      const created = d.purchased_at ? new Date(d.purchased_at) : null;
      if (created && !Number.isNaN(created.getTime())) {
        if (dateFrom && created < new Date(dateFrom)) continue;
        if (dateTo && created > new Date(dateTo)) continue;
      }
    }

    const items = (d.items || [])
      .map((it) => `${it.quantity ?? 1}x ${it.name || it.description || 'Item'}`)
      .join(', ');

    const row: NormalizedShipment = {
      accountId: ctx.accountId,
      marketplace: 'magalu',
      shipmentId: String(d.id),
      orderId: d.order?.id ? String(d.order.id) : undefined,
      buyerNickname: d.customer?.name || '-',
      items: items.length > 100 ? items.substring(0, 97) + '...' : items,
      status: 'ready_to_ship',
      substatus: 'ready_to_print',
      canPrint: true,
      city: d.shipping?.address?.city,
      state: d.shipping?.address?.state
    };

    if (opts.includePacking && d.items) {
      row.orderItems = d.items.map((it) => ({
        title: it.name || it.description || 'Item',
        quantity: it.quantity ?? 1,
        sku: it.sku || it.external_sku || undefined
      }));
    }

    rows.push(row);
  }

  return rows;
}

export const magaluProvider: MarketplaceProvider = {
  id: 'magalu',
  displayName: 'Magalu',
  labelFormats: ['pdf'],
  oauthState: 'required',

  isConfigured(): boolean {
    return !!(process.env.MAGALU_CLIENT_ID && process.env.MAGALU_CLIENT_SECRET);
  },

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(redirectUri, state);
  },

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderAuthResult> {
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const tenantId = extractTenantId(tokens.access_token);
    if (!tenantId) {
      throw new Error('Magalu access token has no tenant claim — cannot identify the seller organization');
    }

    return {
      identity: {
        externalUserId: tenantId,
        nickname: undefined
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
      throw new Error('Magalu account has no refresh token');
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
    const deliveries = await listReadyDeliveries(ctx.accessToken, ctx.externalUserId);
    return deliveries.map((d) => String(d.id));
  },

  async getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer> {
    const pdfs: Buffer[] = [];
    for (const id of externalIds) {
      const pdf = await getLabelPdf(ctx.accessToken, ctx.externalUserId, id);
      if (pdf) pdfs.push(pdf);
    }

    if (pdfs.length === 0) {
      throw new Error('Nenhuma etiqueta Magalu disponível para as entregas selecionadas');
    }
    if (pdfs.length === 1) return pdfs[0];

    const { PDFDocument } = await import('pdf-lib');
    const merged = await PDFDocument.create();
    for (const buf of pdfs) {
      try {
        const doc = await PDFDocument.load(buf);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        for (const page of pages) merged.addPage(page);
      } catch {
        console.warn('[magalu] etiqueta não-PDF ignorada na mesclagem');
      }
    }
    return Buffer.from(await merged.save());
  }
};
