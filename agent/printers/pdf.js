import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// One private temporary directory per job, removed on success and failure.
export async function withPdfFile(bytes, print) {
  const dir = await mkdtemp(join(tmpdir(), 'labelgo-pdf-'));
  try {
    const file = join(dir, 'label.pdf');
    await writeFile(file, bytes, { mode: 0o600 });
    return await print(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
