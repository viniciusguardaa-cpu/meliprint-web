import { Worker } from 'node:worker_threads';

/** Rasterize away from the HTTP event loop. No shell or external service; the
 * original PDF stays in the queue for agents that support driver printing. */
export function pdfToZpl(pdf: Buffer, dpi: 203 | 300 = 203): Promise<string> {
  if (pdf.length > 10 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') {
    return Promise.reject(new Error('Invalid or oversized label PDF'));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/pdfToZpl.mjs', import.meta.url), {
      workerData: { pdf: new Uint8Array(pdf), dpi },
      resourceLimits: { maxOldGenerationSizeMb: 128 }
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Label PDF rendering timed out'));
    }, 10_000);
    let received = false;
    worker.once('message', (result) => {
      received = true;
      clearTimeout(timer);
      if (result.error) reject(new Error(result.error));
      else resolve(result.zpl);
      void worker.terminate();
    });
    worker.once('error', (err) => { clearTimeout(timer); reject(err); });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (!received) reject(new Error(`Label renderer exited (${code})`));
    });
  });
}
