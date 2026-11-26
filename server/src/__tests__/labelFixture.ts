import { PDFDict, PDFDocument, PDFName, rgb, StandardFonts } from 'pdf-lib';

export const FONT_GRID = 'DESTINATARIOabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚáéíóúãõç';

// Deliberately unembedded, nonstandard font: the shipping PDF can name a font
// that does not exist on the server. Every character must survive rasterization.
export async function missingFontPdf(fontName = 'Roboto-Regular') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([288, 432]);
    if (p === 1) page.drawRectangle({ x: 0, y: 0, width: 288, height: 432, color: rgb(0, 0, 0) });
    [...FONT_GRID].forEach((character, i) => page.drawText(character, {
      x: 12 + (i % 16) * 16, y: 390 - Math.floor(i / 16) * 30, size: 12, font,
      color: p === 1 ? rgb(1, 1, 1) : rgb(0, 0, 0)
    }));
  }
  await doc.flush();
  doc.context.lookup(font.ref, PDFDict).set(PDFName.of('BaseFont'), PDFName.of(fontName));
  return Buffer.from(await doc.save());
}

export async function fixturePdf(pages = 1, landscape = false) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 0; n < pages; n++) {
    const page = doc.addPage(landscape ? [432, 288] : [288, 432]);
    page.drawText('Shopee TEST - no real shipment', { x: 15, y: 250, size: 10, font });
    // Barcode-like pattern with explicit edges and white quiet zones.
    for (let x = 20; x < 180; x += 4) page.drawRectangle({ x, y: 50, width: 2, height: 70, color: rgb(0, 0, 0) });
  }
  return Buffer.from(await doc.save());
}

