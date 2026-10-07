import { afterEach, expect, it, vi } from 'vitest';
import { loadLabelPdf } from './labelPdf';
afterEach(() => vi.unstubAllGlobals());
it('surfaces server details instead of pretending the PDF is loaded', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ details: 'logistics.package_can_not_print: not yet ready' }), { status: 500 })));
  await expect(loadLabelPdf('/api/labels/pdf')).rejects.toThrow('logistics.package_can_not_print: not yet ready');
});
it('rejects JSON with HTTP 200 and accepts actual PDF bytes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('%PDF-1.4')));
  await expect(loadLabelPdf('/api/labels/pdf')).rejects.toThrow('PDF válida');
  expect((await loadLabelPdf('/api/labels/pdf')).type).toBe('application/pdf');
});
