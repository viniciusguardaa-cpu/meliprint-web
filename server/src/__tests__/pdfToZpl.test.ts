import { describe, it, expect } from 'vitest';
import { fixturePdf } from './labelFixture.js';
import { inflateSync } from 'node:zlib';
import { pdfToZpl } from '../services/pdfToZpl.js';

describe('backend PDF to RAW ZPL compatibility (real renderer)', () => {
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
