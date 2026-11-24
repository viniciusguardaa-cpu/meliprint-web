import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

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

