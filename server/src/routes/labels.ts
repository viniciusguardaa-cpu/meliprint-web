import { Router, Request, Response } from 'express';
import { getProvider } from '../providers/index.js';
import type { AccountContext } from '../providers/types.js';
import { getFreshAccountContext } from '../services/accounts.js';
import { requireActiveSubscription } from '../middleware/subscription.js';
import { getPlan } from '../services/pricing.js';
import {
  getShipmentLabelsPDF,
  getShipmentChecklistItems,
  getInvoiceData
} from '../services/mercadolivre.js';
import { renderChecklistPdf, mergePackage, downloadInvoicePdf, type PackagePart } from '../services/printPackage.js';
import {
  getMarketplaceAccountById,
  getMarketplaceAccountForUser,
  recordPrintEvents
} from '../db.js';

const router = Router();
router.use(requireActiveSubscription);

/**
 * Resolve which connected account a label request targets.
 * Priority: explicit accountId → explicit provider → default 'mercadolivre'
 * (backwards compatible with clients that only know ML).
 * Returns null (after writing the error response) on failure.
 */
async function resolveAccountContext(req: Request, res: Response): Promise<AccountContext | null> {
  const userId = req.session.userId!;
  const rawAccountId = (req.body?.accountId ?? req.query.account_id) as string | number | undefined;
  const providerId = ((req.body?.provider ?? req.query.provider) as string | undefined) || 'mercadolivre';

  let account: any = null;
  if (rawAccountId !== undefined && rawAccountId !== null && rawAccountId !== '') {
    const id = Number(rawAccountId);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: 'Invalid accountId' });
      return null;
    }
    account = await getMarketplaceAccountById(id);
    if (!account || account.user_id !== userId) {
      res.status(404).json({ error: 'Marketplace account not found' });
      return null;
    }
    if (account.status === 'reauth_required') {
      res.status(401).json({ error: 'account_token_expired', message: 'Reconecte sua conta do marketplace.' });
      return null;
    }
    if (account.status !== 'active') {
      res.status(404).json({ error: 'Marketplace account not found' });
      return null;
    }
  } else {
    account = await getMarketplaceAccountForUser(userId, providerId);
    if (!account) {
      res.status(400).json({
        error: 'account_not_connected',
        message: `Nenhuma conta ${providerId} conectada. Conecte sua conta primeiro.`
      });
      return null;
    }
  }

  const ctx = await getFreshAccountContext(account);
  if (!ctx) {
    res.status(401).json({ error: 'account_token_expired', message: 'Reconecte sua conta do marketplace.' });
    return null;
  }
  return ctx;
}

function parseShipmentIds(raw: any): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter((s) => s.length > 0);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }
  return [];
}

router.post('/zpl', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const shipmentIds = parseShipmentIds(req.body?.shipmentIds);
  if (shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  try {
    const ctx = await resolveAccountContext(req, res);
    if (!ctx) return;

    const provider = getProvider(ctx.provider)!;
    if (!provider.getLabelsZPL) {
      return res.status(400).json({
        error: 'labels_not_supported',
        message: `${provider.displayName} não oferece etiquetas em ZPL — use a impressão em PDF pelo navegador.`
      });
    }
    const zpl = await provider.getLabelsZPL(ctx, shipmentIds);

    res.setHeader('Content-Type', 'application/x-zpl');
    res.setHeader('Content-Disposition', `attachment; filename="labels-${Date.now()}.zpl"`);
    res.send(zpl);
  } catch (error) {
    console.error('Failed to get labels:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});


function truthy(v: any): boolean {
  return v === true || v === '1' || v === 'true' || v === 1;
}

/**
 * Optional extras for Mercado Livre: per shipment, label -> conferência page
 * (items/SKU/qty) -> DANFE. Anything that can't be built is skipped and
 * reported in `notes`; the label itself is never dropped.
 */
async function buildPdfWithExtras(
  ctx: AccountContext,
  planId: string | undefined,
  shipmentIds: string[],
  wantPacking: boolean,
  wantInvoice: boolean
): Promise<{ pdf: Buffer; notes: string[] } | null> {
  const notes: string[] = [];
  if (!wantPacking && !wantInvoice) return null;
  if (ctx.provider !== 'mercadolivre') {
    notes.push('Conferência e NF junto da etiqueta só estão disponíveis para Mercado Livre.');
    return { pdf: await getProvider(ctx.provider)!.getLabelsPDF(ctx, shipmentIds), notes };
  }
  const plan = planId ? await getPlan(planId) : null;
  if (plan?.packing_check !== true) {
    notes.push('Conferência e NF junto da etiqueta não estão incluídas no seu plano.');
    return { pdf: await getProvider(ctx.provider)!.getLabelsPDF(ctx, shipmentIds), notes };
  }

  const MAX_EXTRAS = 50;
  if (shipmentIds.length > MAX_EXTRAS) {
    notes.push(`Conferência e NF só são montadas para até ${MAX_EXTRAS} envios por vez.`);
    return { pdf: await getProvider(ctx.provider)!.getLabelsPDF(ctx, shipmentIds), notes };
  }

  const parts: PackagePart[] = [];
  let invoiceSkipped = 0;
  let checklistSkipped = 0;
  for (const id of shipmentIds) {
    const numericId = Number(id);
    const label = await getShipmentLabelsPDF(ctx.accessToken, [numericId]);
    const part: PackagePart = { label };
    if (wantPacking) {
      try {
        const { orderIds, items } = await getShipmentChecklistItems(ctx.accessToken, numericId);
        if (items.length > 0) {
          part.checklist = await renderChecklistPdf({ shipmentId: id, orderIds, items });
        } else {
          checklistSkipped++;
        }
      } catch (err) {
        console.error(`[labels/pdf] checklist failed for ${id}:`, err);
        checklistSkipped++;
      }
    }
    if (wantInvoice) {
      try {
        const data = await getInvoiceData(ctx.accessToken, numericId);
        const url = data?.fiscal_document?.pdf_url as string | undefined;
        const bytes = url ? await downloadInvoicePdf(url, ctx.accessToken) : null;
        if (bytes) part.invoice = bytes;
        else invoiceSkipped++;
      } catch (err) {
        console.error(`[labels/pdf] invoice failed for ${id}:`, err);
        invoiceSkipped++;
      }
    }
    parts.push(part);
  }
  if (checklistSkipped > 0) notes.push(`Conferência não gerada em ${checklistSkipped} envio(s).`);
  if (invoiceSkipped > 0) notes.push(`NF não incluída em ${invoiceSkipped} envio(s): use "Abrir NFs".`);
  return { pdf: await mergePackage(parts), notes };
}

function sendPdf(res: Response, pdf: Buffer, notes: string[]) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="labels.pdf"');
  res.setHeader('Cache-Control', 'no-store');
  if (notes.length > 0) res.setHeader('X-Print-Notes', encodeURIComponent(notes.join(' | ')));
  res.send(pdf);
}

router.get('/pdf', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const raw = (req.query.shipment_ids || req.query.shipmentIds || '') as string;
  const shipmentIds = parseShipmentIds(raw);
  if (shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipment_ids must be a non-empty comma separated list' });
  }

  try {
    const ctx = await resolveAccountContext(req, res);
    if (!ctx) return;

    const provider = getProvider(ctx.provider)!;
    console.log(`[labels/pdf GET] ${ctx.provider} account=${ctx.accountId}: ${shipmentIds.length} shipments`);
    const extras = await buildPdfWithExtras(
      ctx, (req as any).planId, shipmentIds,
      truthy(req.query.include_packing), truthy(req.query.include_invoice)
    );
    const pdf = extras ? extras.pdf : await provider.getLabelsPDF(ctx, shipmentIds);
    console.log(`[labels/pdf GET] PDF generated successfully, size: ${pdf.length} bytes`);
    sendPdf(res, pdf, extras?.notes ?? []);
  } catch (error) {
    console.error('[labels/pdf GET] Failed to get labels pdf:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Failed to generate labels', details: errorMessage });
  }
});

router.post('/pdf', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const shipmentIds = parseShipmentIds(req.body?.shipmentIds);
  if (shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  try {
    const ctx = await resolveAccountContext(req, res);
    if (!ctx) return;

    const provider = getProvider(ctx.provider)!;
    const extras = await buildPdfWithExtras(
      ctx, (req as any).planId, shipmentIds,
      truthy(req.body?.includePacking), truthy(req.body?.includeInvoice)
    );
    const pdf = extras ? extras.pdf : await provider.getLabelsPDF(ctx, shipmentIds);
    sendPdf(res, pdf, extras?.notes ?? []);
  } catch (error) {
    console.error('Failed to get labels pdf:', error);
    res.status(500).json({ error: 'Failed to generate labels' });
  }
});

// Record that the user printed a batch of labels via the browser.
// Feeds the Pro print-history tab. Best-effort: logging failure must not
// block printing.
router.post('/print-log', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { shipmentIds } = req.body;
  if (!Array.isArray(shipmentIds) || shipmentIds.length === 0 || shipmentIds.length > 200) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array (max 200)' });
  }
  const ids = parseShipmentIds(shipmentIds);

  try {
    // Provider comes from the account when accountId is given — the client
    // can't mislabel history by claiming another provider.
    let providerId = (req.body?.provider as string | undefined) || 'mercadolivre';
    const rawAccountId = req.body?.accountId;
    if (rawAccountId !== undefined && rawAccountId !== null && rawAccountId !== '') {
      const account = await getMarketplaceAccountById(Number(rawAccountId));
      if (account && account.user_id === req.session.userId) {
        providerId = account.provider;
      }
    }
    await recordPrintEvents(req.session.userId, ids, 'browser', providerId);
    res.json({ ok: true, recorded: ids.length });
  } catch (error) {
    console.error('Failed to record print events:', error);
    res.status(500).json({ error: 'Failed to record print events' });
  }
});

router.post('/invoices', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const shipmentIds = parseShipmentIds(req.body?.shipmentIds);
  if (shipmentIds.length === 0) {
    return res.status(400).json({ error: 'shipmentIds must be a non-empty array' });
  }

  try {
    const ctx = await resolveAccountContext(req, res);
    if (!ctx) return;

    const provider = getProvider(ctx.provider)!;
    if (!provider.getInvoice) {
      return res.status(400).json({ error: 'invoices_not_supported', message: 'Este marketplace não expõe dados fiscais.' });
    }

    const invoices = await Promise.all(
      shipmentIds.map(async (id) => ({
        shipmentId: id,
        invoice: await provider.getInvoice!(ctx, id)
      }))
    );
    res.json({ invoices });
  } catch (error) {
    console.error('Failed to get invoices:', error);
    res.status(500).json({ error: 'Failed to get invoices' });
  }
});

export default router;
