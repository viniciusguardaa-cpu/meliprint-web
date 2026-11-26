import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { fixturePdf, FONT_GRID, missingFontPdf } from './labelFixture.js';
import { inflateSync } from 'node:zlib';
import { pdfToZpl } from '../services/pdfToZpl.js';

describe('backend PDF to RAW ZPL compatibility (real renderer)', () => {
  beforeAll(() => vi.stubEnv('DISABLE_SYSTEM_FONTS_LOAD', '1'));
  afterAll(() => vi.unstubAllEnvs());
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
        let intersection = 0;
        let union = 0;
        for (let py = Math.floor((432 - y - 16) * dpi / 72); py < Math.ceil((432 - y + 4) * dpi / 72); py++) {
          for (let px = Math.floor(x * dpi / 72); px < Math.floor((x + 14) * dpi / 72); px++) {
            const black = !!(raster[py * stride + (px >> 3)] & (0x80 >> (px & 7)));
            const expectedBlack = !!(expectedRaster[py * stride + (px >> 3)] & (0x80 >> (px & 7)));
            if (black === (page === 0)) ink++;
            if (black === (page === 0) || expectedBlack === (page === 0)) union++;
            if (black === (page === 0) && expectedBlack === (page === 0)) intersection++;
          }
        }
        expect(ink, `missing glyph ${character} on page at ${dpi} DPI`).toBeGreaterThan(3);
        expect(intersection / union, `wrong glyph ${character} at ${dpi} DPI`).toBeGreaterThan(0.65);
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
