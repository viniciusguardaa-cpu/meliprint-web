import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** Shopee also supplies a thermal page wrapped in an otherwise blank A4 page.
 * Unwrap only that exact structure; never crop by ink (barcodes need quiet
 * zones), discard other page content, or guess at an unfamiliar A4 layout. */
export async function thermalLabelPages(bytes) {
  const doc = await PDFDocument.load(bytes);
  if (!doc.getPageCount() || doc.getPageCount() > 10) throw new Error('Invalid label page count');
  let changed = false;
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const a4 = Math.abs(Math.min(width, height) - 595) < 2 && Math.abs(Math.max(width, height) - 842) < 2;
    if (!a4) continue;
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
    if (!streams.every(stream => stream instanceof PDFRawStream)) throw new Error('Unsupported A4 label layout');
    const commands = streams.map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString('ascii')).join('\n');
    // A translation and a single Form XObject, with no other marks on A4.
    const match = commands.match(/^\s*q\s+1(?:\.0+)?\s+0(?:\.0+)?\s+0(?:\.0+)?\s+1(?:\.0+)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+cm\s+\/([A-Za-z0-9_-]+)\s+Do\s+Q\s*$/);
    const resources = page.node.Resources();
    const objects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    const form = match && objects?.lookup(PDFName.of(match[3]));
    if (!(form instanceof PDFRawStream) || form.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form') throw new Error('Unsupported A4 label layout');
    const box = form.dict.lookupMaybe(PDFName.of('BBox'), PDFArray)?.asArray().map(n => n.asNumber());
    const matrix = form.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray)?.asArray().map(n => n.asNumber()) ?? [1, 0, 0, 1, 0, 0];
    const formResources = form.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || matrix.length !== 6 || matrix.some((n, i) => n !== [1, 0, 0, 1, 0, 0][i]) || !formResources) throw new Error('Unsupported A4 label layout');
    const w = box[2] - box[0], h = box[3] - box[1];
    const tx = Number(match[1]), ty = Number(match[2]);
    if (Math.min(w, h) < 250 || Math.min(w, h) > 320 || Math.max(w, h) < 380 || Math.max(w, h) > 460 ||
        box[0] + tx < -1 || box[1] + ty < -1 || box[2] + tx > width + 1 || box[3] + ty > height + 1 || page.node.Annots()?.size()) {
      throw new Error('Unsupported A4 label layout');
    }
    page.node.set(PDFName.of('Contents'), doc.context.register(form));
    page.node.set(PDFName.of('Resources'), formResources);
    page.setMediaBox(box[0], box[1], w, h);
    page.setCropBox(box[0], box[1], w, h);
    changed = true;
  }
  return changed ? new Uint8Array(await doc.save()) : bytes;
}
