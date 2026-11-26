import { Worker } from 'node:worker_threads';

// The native font registry is process-wide, even in separate JS workers.
// Avoid removing a font while another label is drawing with that font's data.
// Work stays outside the HTTP thread; bound waiting below the claim timeout.
let renderTail: Promise<unknown> = Promise.resolve();
let waiting = 0;

/** Rasterize away from the HTTP event loop. No shell or external service; the
 * original PDF stays in the queue for agents that support driver printing. */
export function pdfToZpl(pdf: Buffer, dpi: 203 | 300 = 203): Promise<string> {
  if (pdf.length > 10 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    return Promise.reject(new Error('Invalid or oversized label PDF'));
  }
  if (waiting >= 8) return Promise.reject(new Error('Label renderer busy; retry later'));
  waiting++;
  const result = renderTail.then(() => renderOne(pdf, dpi)).finally(() => { waiting--; });
  renderTail = result.catch(() => undefined);
  return result;
}

function renderOne(pdf: Buffer, dpi: 203 | 300): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/pdfToZpl.mjs', import.meta.url), {
      workerData: { pdf: new Uint8Array(pdf), dpi },
      resourceLimits: { maxOldGenerationSizeMb: 128 }
    });
    const timer = setTimeout(async () => {
      received = true;
      await worker.terminate();
      reject(new Error('Label PDF rendering timed out'));
    }, 10_000);
    let received = false;
    worker.once('message', async (result) => {
      received = true;
      clearTimeout(timer);
      await worker.terminate();
      if (result.error) reject(new Error(result.error));
      else resolve(result.zpl);
    });
    worker.once('error', async (err) => {
      received = true;
      clearTimeout(timer);
      await worker.terminate();
      reject(err);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (!received) reject(new Error(`Label renderer exited (${code})`));
    });
  });
}
