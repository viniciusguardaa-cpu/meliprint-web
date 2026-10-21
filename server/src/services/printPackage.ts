import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';

// 100 x 150 mm in PDF points, same size as the thermal label.
const PAGE_W = 283.46;
const PAGE_H = 425.2;
const MARGIN = 14;

export interface ChecklistItem {
  title: string;
  quantity: number;
  sku?: string;
}

export interface PackagePart {
  label: Uint8Array;
  checklist?: Uint8Array;
  invoice?: Uint8Array;
}

/** Standard PDF fonts only cover Latin-1; replace anything else so drawText never throws. */
export function toLatin1(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toLatin1(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single very long token: hard-split it.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

/** One or more 10x15 pages listing what must be in the box. */
export async function renderChecklistPdf(opts: {
  shipmentId: string;
  orderIds?: string[];
  items: ChecklistItem[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_W - MARGIN * 2;
  const totalUnits = opts.items.reduce((sum, i) => sum + (i.quantity || 0), 0);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const header = (continued: boolean) => {
    page.drawText(continued ? 'CONFERENCIA (continua)' : 'CONFERENCIA DO PEDIDO', {
      x: MARGIN, y: y - 12, size: 12, font: bold
    });
    y -= 20;
    const ref = `Envio ${toLatin1(opts.shipmentId)}` +
      (opts.orderIds && opts.orderIds.length ? `  |  Pedido ${toLatin1(opts.orderIds.join(', '))}` : '');
    page.drawText(ref, { x: MARGIN, y: y - 8, size: 8, font });
    y -= 14;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: rgb(0, 0, 0) });
    y -= 8;
  };
  header(false);

  for (const item of opts.items) {
    const titleLines = wrap(item.title || 'Item', font, 9, maxWidth - 40);
    const sku = item.sku ? `SKU: ${toLatin1(item.sku)}` : '';
    const blockHeight = titleLines.length * 11 + (sku ? 11 : 0) + 8;
    if (y - blockHeight < MARGIN + 20) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      header(true);
    }
    // Checkbox + quantity, then title and SKU.
    page.drawRectangle({ x: MARGIN, y: y - 11, width: 9, height: 9, borderWidth: 1, borderColor: rgb(0, 0, 0) });
    page.drawText(`${item.quantity}x`, { x: MARGIN + 15, y: y - 10, size: 11, font: bold });
    let ty = y;
    for (const l of titleLines) {
      page.drawText(l, { x: MARGIN + 40, y: ty - 9, size: 9, font });
      ty -= 11;
    }
    if (sku) {
      page.drawText(sku, { x: MARGIN + 40, y: ty - 9, size: 8, font: bold });
      ty -= 11;
    }
    y = Math.min(ty, y - 14) - 6;
  }

  page.drawText(`Total: ${totalUnits} unidade${totalUnits === 1 ? "" : "s"} em ${opts.items.length} ${opts.items.length === 1 ? "item" : "itens"}`, {
    x: MARGIN, y: Math.max(y - 12, MARGIN), size: 9, font: bold
  });
  return doc.save();
}

/** Merges per-shipment parts in order: label -> checklist -> invoice. */
export async function mergePackage(parts: PackagePart[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    for (const bytes of [part.label, part.checklist]) {
      if (!bytes) continue;
      const src = await PDFDocument.load(bytes);
      for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
    }
    if (part.invoice) {
      // The DANFE is A4: scale each page to fit inside a 10x15 page so a
      // single paper size goes to the thermal printer.
      let embedded: Awaited<ReturnType<typeof out.embedPages>> = [];
      try {
        const src = await PDFDocument.load(part.invoice);
        embedded = await out.embedPages(src.getPages());
      } catch {
        // Unreadable invoice: keep the label and checklist.
      }
      for (const ep of embedded) {
        const scale = Math.min(PAGE_W / ep.width, PAGE_H / ep.height);
        const page = out.addPage([PAGE_W, PAGE_H]);
        page.drawPage(ep, {
          x: (PAGE_W - ep.width * scale) / 2,
          y: PAGE_H - ep.height * scale,
          width: ep.width * scale,
          height: ep.height * scale
        });
      }
    }
  }
  return Buffer.from(await out.save());
}

/**
 * Tries to download the DANFE PDF on the server. Returns null when the link
 * needs a browser session, is not a PDF, or times out; callers keep the
 * "Abrir NFs" fallback in that case.
 */
export async function downloadInvoicePdf(url: string, accessToken?: string): Promise<Uint8Array | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const headers: Record<string, string> = {};
    // Only send the seller token to Mercado Libre hosts.
    if (accessToken && /(^|\.)mercadoli(bre|vre)\.com(\.[a-z]+)?$/i.test(parsed.hostname)) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    return head === '%PDF-' ? bytes : null;
  } catch {
    return null;
  }
}
