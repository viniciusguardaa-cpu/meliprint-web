import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { withPdfFile } from '../printers/pdf.js';
it('cleans the private PDF file after success and failure', async () => {
  for (const fails of [false, true]) {
    let path;
    const run = withPdfFile(Buffer.from('%PDF-test'), async file => {
      path = file;
      assert.equal((await readFile(file)).toString(), '%PDF-test');
      if (fails) throw new Error('driver unavailable');
      return 'accepted';
    });
    if (fails) await assert.rejects(run, /driver unavailable/);
    else assert.equal(await run, 'accepted');
    await assert.rejects(access(path));
  }
});
