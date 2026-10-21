import { describe, it, expect, vi, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderChecklistPdf, mergePackage, downloadInvoicePdf, toLatin1 } from '../services/printPackage.js';

async function blankPdf(w: number, h: number, pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([w, h]).drawText('x', { x: 10, y: 10 });
  return doc.save();
}
async function pageCount(bytes: Uint8Array | Buffer) {
  return (await PDFDocument.load(bytes)).getPageCount();
}

afterEach(() => vi.unstubAllGlobals());

describe('renderChecklistPdf', () => {
  it('renders one 10x15 page for a short list', async () => {
    const pdf = await renderChecklistPdf({
      shipmentId: '123', orderIds: ['999'],
      items: [{ title: 'Fita adesiva', quantity: 2, sku: 'FITA-01' }]
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(283);
    expect(Math.round(height)).toBe(425);
  });

  it('adds pages when the list is long and survives non-Latin text', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      title: `Produto ${i} com um título bem longo para quebrar linha ✓ 日本語 ${'x'.repeat(60)}`,
      quantity: i + 1,
      sku: `SKU-${i}`
    }));
    const pdf = await renderChecklistPdf({ shipmentId: '1', items });
    expect(await pageCount(pdf)).toBeGreaterThan(1);
  });

  it('replaces characters the standard font cannot encode', () => {
    expect(toLatin1('Café ✓')).toBe('Café ?');
  });
});

describe('mergePackage', () => {
  it('orders label -> checklist -> invoice per shipment and scales the A4 invoice to 10x15', async () => {
    const label = await blankPdf(283, 425);
    const checklist = await blankPdf(283, 425);
    const invoice = await blankPdf(595, 842, 2);
    const merged = await mergePackage([
      { label, checklist, invoice },
      { label }
    ]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(1 + 1 + 2 + 1);
    for (const page of doc.getPages()) {
      expect(Math.round(page.getSize().width)).toBe(283);
    }
  });
});

describe('downloadInvoicePdf', () => {
  it('returns bytes only for a real PDF', async () => {
    const pdf = await blankPdf(595, 842);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(pdf as unknown as BodyInit, { status: 200 })));
    expect(await downloadInvoicePdf('https://example.com/nf.pdf')).not.toBeNull();
  });

  it('returns null for HTML, error status, network failure and non-https', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200 })));
    expect(await downloadInvoicePdf('https://example.com/nf')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })));
    expect(await downloadInvoicePdf('https://example.com/nf')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom'); }));
    expect(await downloadInvoicePdf('https://example.com/nf')).toBeNull();
    expect(await downloadInvoicePdf('http://example.com/nf')).toBeNull();
  });

  it('only sends the access token to Mercado Livre hosts', async () => {
    const pdf = await blankPdf(595, 842);
    const fetchMock = vi.fn(async () => new Response(pdf as unknown as BodyInit, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await downloadInvoicePdf('https://evil.example.com/nf.pdf', 'TOKEN');
    await downloadInvoicePdf('https://api.mercadolibre.com/nf.pdf', 'TOKEN');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect((calls[0][1].headers as any).Authorization).toBeUndefined();
    expect((calls[1][1].headers as any).Authorization).toBe('Bearer TOKEN');
  });
});
