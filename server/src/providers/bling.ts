import {
  buildAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getEmpresa,
  listLogisticObjects,
  getPedido,
  getLabelPdf,
  BlingLogisticObject
} from '../services/bling.js';
import type {
  AccountContext,
  ListShipmentsOptions,
  MarketplaceProvider,
  NormalizedShipment,
  ProviderAuthResult,
  TokenSet
} from './types.js';

/**
 * Bling ERP — one connected account can carry orders from every marketplace
 * the seller integrated there (ML, Shopee, Amazon...). Each "objeto
 * logístico" maps to a NormalizedShipment; labels come from the objeto's
 * /etiqueta endpoint (PDF — provider skipped by the ZPL-only auto-print
 * poller).
 */

/** Situations that mean "this shipment already went out / can't be printed". */
const DONE_SITUATIONS = /postad|entregue|cancelad|devolvid/i;

function isPrintableObject(obj: BlingLogisticObject): boolean {
  const situacao = obj.situacao?.nome || '';
  // When situacao is absent we can't tell — keep the objeto and let the
  // etiqueta call decide (it 4xxs for non-printable objects).
  if (!situacao) return true;
  return !DONE_SITUATIONS.test(situacao);
}

async function listReadyShipments(ctx: AccountContext, opts: ListShipmentsOptions): Promise<NormalizedShipment[]> {
  const objetos = (await listLogisticObjects(ctx.accessToken)).filter(isPrintableObject);
  if (objetos.length === 0) return [];

  const { dateFrom, dateTo } = opts;
  const withinRange = (obj: BlingLogisticObject) => {
    if (!obj.dataCriacao) return true;
    const d = new Date(obj.dataCriacao);
    if (Number.isNaN(d.getTime())) return true;
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo)) return false;
    return true;
  };

  const rows: NormalizedShipment[] = [];
  const pedidoCache = new Map<string, any>();

  for (const obj of objetos.filter(withinRange)) {
    const pedidoId = obj.pedido?.id ? String(obj.pedido.id) : undefined;
    let pedido: any = null;
    if (pedidoId) {
      if (!pedidoCache.has(pedidoId)) {
        pedidoCache.set(pedidoId, await getPedido(ctx.accessToken, pedidoId));
      }
      pedido = pedidoCache.get(pedidoId);
    }

    const items = (pedido?.itens || [])
      .map((it: any) => `${it.quantidade ?? 1}x ${it.descricao || 'Item'}`)
      .join(', ');

    const row: NormalizedShipment = {
      accountId: ctx.accountId,
      marketplace: 'bling',
      shipmentId: String(obj.id),
      orderId: pedidoId,
      buyerNickname: pedido?.contato?.nome || '-',
      items: items.length > 100 ? items.substring(0, 97) + '...' : items,
      status: 'ready_to_ship',
      substatus: 'ready_to_print',
      canPrint: true
    };

    if (opts.includePacking && pedido?.itens) {
      row.orderItems = pedido.itens.map((it: any) => ({
        title: it.descricao || 'Item',
        quantity: it.quantidade ?? 1,
        sku: it.codigo || undefined
      }));
    }

    rows.push(row);
  }

  return rows;
}

export const blingProvider: MarketplaceProvider = {
  id: 'bling',
  displayName: 'Bling (ERP)',
  labelFormats: ['pdf'],
  oauthState: 'required',

  isConfigured(): boolean {
    return !!(process.env.BLING_CLIENT_ID && process.env.BLING_CLIENT_SECRET);
  },

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(redirectUri, state);
  },

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderAuthResult> {
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const empresa = await getEmpresa(tokens.access_token).catch(() => null);

    return {
      identity: {
        externalUserId: empresa?.id != null ? String(empresa.id) : `bling_${tokens.refresh_token.slice(0, 16)}`,
        nickname: empresa?.nome || empresa?.razaoSocial,
        email: empresa?.email
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
      throw new Error('Bling account has no refresh token');
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
    const objetos = (await listLogisticObjects(ctx.accessToken)).filter(isPrintableObject);
    return objetos.map((o) => String(o.id));
  },

  async getLabelsPDF(ctx: AccountContext, externalIds: string[]): Promise<Buffer> {
    const pdfs: Buffer[] = [];
    for (const id of externalIds) {
      const pdf = await getLabelPdf(ctx.accessToken, id);
      if (pdf) pdfs.push(pdf);
    }

    if (pdfs.length === 0) {
      throw new Error('Nenhuma etiqueta Bling disponível para os objetos selecionados');
    }
    if (pdfs.length === 1) return pdfs[0];

    const { PDFDocument } = await import('pdf-lib');
    const merged = await PDFDocument.create();
    for (const buf of pdfs) {
      // Non-PDF payloads (e.g. ZPL text) can't merge — pdf-lib throws; skip
      // those rather than fail the whole batch.
      try {
        const doc = await PDFDocument.load(buf);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        for (const page of pages) merged.addPage(page);
      } catch {
        console.warn('[bling] etiqueta não-PDF ignorada na mesclagem');
      }
    }
    return Buffer.from(await merged.save());
  }
};
