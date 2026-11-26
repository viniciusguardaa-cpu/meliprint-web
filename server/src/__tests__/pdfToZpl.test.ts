import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { fixturePdf, FONT_GRID, missingFontPdf } from './labelFixture.js';
import { inflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { pdfToZpl } from '../services/pdfToZpl.js';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';

async function wrappedLabels(a4: boolean, extraContent = false) {
  const source = await PDFDocument.load(await readFile(new URL('./shopee-cid-fonts.pdf', import.meta.url)));
  const doc = await PDFDocument.create();
  for (const original of source.getPages()) {
    const label = await doc.embedPage(original);
    const page = doc.addPage(a4 ? [595, 842] : [288, 432]);
    page.drawPage(label, { x: a4 ? 0.19 : 0, y: a4 ? 410 : 0 });
    if (a4) {
      const formName = page.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict).keys()[0].toString();
      page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream(`q 1.00 0.00 0.00 1.00 0.19 410 cm ${formName} Do Q${extraContent ? '\n0 0 20 20 re f' : ''}`)));
    }
  }
  return Buffer.from(await doc.save());
}

describe('backend PDF to RAW ZPL compatibility (real renderer)', () => {
  beforeAll(() => vi.stubEnv('DISABLE_SYSTEM_FONTS_LOAD', '1'));
  afterAll(() => vi.unstubAllEnvs());
  it.each([203, 300] as const)('preserves all pixels with nested Form XObject clips at %i DPI', async dpi => {
    const direct = await readFile(new URL('./shopee-cid-fonts.pdf', import.meta.url));
    const reference = await pdfToZpl(direct, dpi);
    // Previously only the top-left strip survived when clips were intersected
    // in the wrong coordinate system by @napi-rs/canvas 0.1.90.
    expect(await pdfToZpl(await wrappedLabels(false), dpi)).toBe(reference);
    // A4's blank margins must not shrink the thermal label to one quadrant.
    expect(await pdfToZpl(await wrappedLabels(true), dpi)).toBe(reference);
  });
  it('refuses unfamiliar A4 layouts instead of dropping extra content', async () => {
    await expect(pdfToZpl(await wrappedLabels(true, true))).rejects.toThrow('Unsupported A4 label layout');
  });
  it.each([203, 300] as const)('preserves CID/TrueType text under nested transforms and clipping at %i DPI', async dpi => {
    const fixture = await readFile(new URL('./shopee-cid-fonts.pdf', import.meta.url));
    const { lines } = JSON.parse(await readFile(new URL('./shopee-cid-fonts.json', import.meta.url), 'utf8'));
    const zpl = await pdfToZpl(fixture, dpi);
    const rasters = [...zpl.matchAll(/\^GFA,(\d+),(\d+),(\d+),:Z64:([A-Za-z0-9+/=]+):/g)];
    expect(rasters).toHaveLength(2);
    for (const [page, match] of rasters.entries()) {
      const raster = inflateSync(Buffer.from(match[4], 'base64'));
      const stride = Number(match[3]);
      for (const line of lines) [...line.text].forEach((character, i) => {
        let ink = 0;
        for (let py = Math.floor((432 - line.y - 16) * dpi / 72); py < Math.ceil((432 - line.y + 4) * dpi / 72); py++) {
          for (let px = Math.floor((line.x + i * 16) * dpi / 72); px < Math.floor((line.x + i * 16 + 14) * dpi / 72); px++) {
            const black = !!(raster[py * stride + (px >> 3)] & (0x80 >> (px & 7)));
            if (black === (page === 0)) ink++;
          }
        }
        expect(ink, `CID glyph ${character}, ${line.font}, page ${page}, ${dpi} DPI`).toBeGreaterThan(3);
      });
    }
  });
  it('isolates embedded font faces across simultaneous label conversions', async () => {
    const cid = await readFile(new URL('./shopee-cid-fonts.pdf', import.meta.url));
    const standard = await fixturePdf();
    const expectedCid = await pdfToZpl(cid);
    const expectedStandard = await pdfToZpl(standard);
    const concurrent = await Promise.all([pdfToZpl(cid), pdfToZpl(standard), pdfToZpl(cid)]);
    expect(concurrent).toEqual([expectedCid, expectedStandard, expectedCid]);
  });
  it.each([203, 300] as const)('preserves repeated letters, digits and accents on white/black backgrounds at %i DPI', async dpi => {
    const zpl = await pdfToZpl(await missingFontPdf(), dpi);
    const rasters = [...zpl.matchAll(/\^GFA,(\d+),(\d+),(\d+),:Z64:([A-Za-z0-9+/=]+):/g)];
    const reference = [...(await pdfToZpl(await missingFontPdf('Helvetica'), dpi))
      .matchAll(/\^GFA,(\d+),(\d+),(\d+),:Z64:([A-Za-z0-9+/=]+):/g)];
    expect(rasters).toHaveLength(2);
    for (const [page, match] of rasters.entries()) {
      const raster = inflateSync(Buffer.from(match[4], 'base64'));
      const expectedRaster = inflateSync(Buffer.from(reference[page][4], 'base64'));
      const stride = Number(match[3]);
      [...FONT_GRID].forEach((character, i) => {
        const x = 12 + (i % 16) * 16;
        const y = 390 - Math.floor(i / 16) * 30;
        let ink = 0;
        let matchingInk = 0;
        for (let py = Math.floor((432 - y - 16) * dpi / 72); py < Math.ceil((432 - y + 4) * dpi / 72); py++) {
          for (let px = Math.floor(x * dpi / 72); px < Math.floor((x + 14) * dpi / 72); px++) {
            const black = !!(raster[py * stride + (px >> 3)] & (0x80 >> (px & 7)));
            if (black === (page === 0)) {
              ink++;
              // Allow one dot of native-vs-outline hinting, but reject boxes.
              let matches = false;
              for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const ex = px + dx;
                const expectedBlack = !!(expectedRaster[(py + dy) * stride + (ex >> 3)] & (0x80 >> (ex & 7)));
                if (expectedBlack === (page === 0)) matches = true;
              }
              if (matches) matchingInk++;
            }
          }
        }
        expect(ink, `missing glyph ${character} on page at ${dpi} DPI`).toBeGreaterThan(3);
        expect(matchingInk / ink, `wrong glyph ${character} at ${dpi} DPI`).toBeGreaterThan(0.9);
      });
    }
  });
  it.each([203, 300] as const)('renders a parseable monochrome 4x6 label at %i DPI', async dpi => {
    const zpl = await pdfToZpl(await fixturePdf(), dpi);
    expect(zpl).toContain(`^XA^PW${4 * dpi}^LL${6 * dpi}`);
    const match = zpl.match(/\^GFA,(\d+),(\d+),(\d+),:Z64:([A-Za-z0-9+/=]+):([0-9A-F]{4})/)!;
    expect(match).toBeTruthy();
    const raster = inflateSync(Buffer.from(match[4], 'base64'));
    expect(raster.length).toBe(Math.ceil(4 * dpi / 8) * 6 * dpi);
    expect(Number(match[1])).toBe(raster.length);
    expect(Number(match[3])).toBe(Math.ceil(4 * dpi / 8));
    expect(raster.some(byte => byte !== 0)).toBe(true);
    // Text sits above the barcode; catch missing/failing standard-font loading.
    const textRows = raster.subarray(Math.ceil(160 * dpi / 72) * Number(match[3]), Math.ceil(185 * dpi / 72) * Number(match[3]));
    expect(textRows.some(byte => byte !== 0)).toBe(true);
    expect(raster.some(byte => byte === 0)).toBe(true);
    expect(zpl.endsWith('^FS^PQ1^XZ')).toBe(true);
    expect(zpl.length).toBeLessThan(24000);
  });
  it('includes every package page, rotates landscape and preserves one copy', async () => {
    const zpl = await pdfToZpl(await fixturePdf(2, true));
    expect(zpl.match(/\^XA/g)).toHaveLength(2);
    expect(zpl.match(/\^PQ1/g)).toHaveLength(2);
  });
  it('rejects malformed, oversized and excessively long documents before delivery', async () => {
    await expect(pdfToZpl(Buffer.from('invalid'))).rejects.toThrow('Invalid');
    await expect(pdfToZpl(Buffer.from('%PDF-broken'))).rejects.toThrow();
    await expect(pdfToZpl(Buffer.alloc(11 * 1024 * 1024))).rejects.toThrow('oversized');
    await expect(pdfToZpl(await fixturePdf(11))).rejects.toThrow('page count');
  });
});
