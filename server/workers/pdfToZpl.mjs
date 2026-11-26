import { parentPort, workerData, threadId } from 'node:worker_threads';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createCanvas, DOMMatrix, Path2D, ImageData, GlobalFonts } from '@napi-rs/canvas';

// PDF.js' Node renderer needs these canvas primitives. Keep them worker-local.
Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
const require = createRequire(import.meta.url);

// PDFs may reference nonstandard fonts without embedding their glyph paths.
// Bundle an explicit native fallback for those fonts only. Keep PDF.js' original
// vector rendering for embedded/standard fonts, symbols and barcode fonts.
function canvasFonts(root) {
  const keys = [];
  const family = `LabelGoLabelFallback_${threadId}`;
  for (const style of ['Regular', 'Bold', 'Italic', 'BoldItalic']) {
    const key = GlobalFonts.registerFromPath(join(root, 'standard_fonts', `LiberationSans-${style}.ttf`), family);
    if (!key) throw new Error('Cannot load bundled label fallback font');
    keys.push(key);
  }
  return {
    family,
    dispose() { GlobalFonts.removeBatch(keys); }
  };
}

function crc16(text) {
  let crc = 0;
  for (const byte of Buffer.from(text, 'ascii')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

async function render() {
  const { pdf, dpi } = workerData;
  if (dpi !== 203 && dpi !== 300) throw new Error('Unsupported label DPI');
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = dirname(require.resolve('pdfjs-dist/package.json'));
  const fonts = canvasFonts(root);
  const task = getDocument({
    data: pdf, isEvalSupported: false, useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
    cMapUrl: join(root, 'cmaps') + '/', cMapPacked: true
  });
  let doc;
  try {
    doc = await task.promise;
    if (!doc.numPages || doc.numPages > 10) throw new Error('Invalid label page count');
    const width = 4 * dpi;
    const height = 6 * dpi;
    const stride = Math.ceil(width / 8);
    const output = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // PDF.js exposes missing fonts as named system fallbacks. Point only
      // those fonts at our bundled family, so a host's partial/different font
      // cannot override it. Embedded fonts keep their own native face/mapping.
      // This adapter is covered against the pinned PDF.js version's operators.
      const operators = await page.getOperatorList();
      for (let i = 0; i < operators.fnArray.length; i++) {
        if (operators.fnArray[i] !== OPS.setFont) continue;
        const font = page.commonObjs.get(operators.argsArray[i][0]);
        if (font.missingFile && !font.isType3Font) {
          font.loadedName = fonts.family;
          font.disableFontFace = false;
        }
      }
      let viewport = page.getViewport({ scale: 1 });
      if (viewport.width > viewport.height) viewport = page.getViewport({ scale: 1, rotation: (page.rotate + 90) % 360 });
      const scale = Math.min(width / viewport.width, height / viewport.height);
      viewport = page.getViewport({ scale, rotation: viewport.rotation });
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport, background: 'rgb(255,255,255)',
        transform: [1, 0, 0, 1, Math.floor((width - viewport.width) / 2), Math.floor((height - viewport.height) / 2)] }).promise;
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const bitmap = Buffer.alloc(stride * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          // Fixed monochrome threshold preserves barcode edges (no dithering).
          if (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114 < 128000) {
            bitmap[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
          }
        }
      }
      const data = deflateSync(bitmap).toString('base64');
      output.push(`^XA^PW${width}^LL${height}^LH0,0^FO0,0^GFA,${bitmap.length},${bitmap.length},${stride},:Z64:${data}:${crc16(data)}^FS^PQ1^XZ`);
      page.cleanup();
      // Existing Windows agents carry RAW data in an environment variable.
      // Reject before printing, rather than silently truncate a large label.
      if (output.join('\n').length > 24000) throw new Error('Label exceeds legacy agent RAW payload limit; use a PDF-capable agent');
    }
    return output.join('\n');
  } finally {
    try { await task.destroy(); } finally { fonts.dispose(); }
  }
}

try { parentPort.postMessage({ zpl: await render() }); }
catch (err) { parentPort.postMessage({ error: err instanceof Error ? err.message : String(err) }); }
