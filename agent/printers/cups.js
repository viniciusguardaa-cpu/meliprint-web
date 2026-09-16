/**
 * CUPS printer adapter — macOS and Linux.
 * Uses `lp` for raw ZPL printing and `lpstat` for printer discovery.
 */
import { execFileSync } from 'child_process';

export const cupsAdapter = {
  name: 'CUPS',

  async printZpl(printerName, zpl) {
    const result = execFileSync('lp', [
      '-d', printerName,
      '-o', 'raw',
      '-o', 'media=4x6',
      '-'
    ], {
      input: zpl,
      encoding: 'utf8',
      timeout: 30000,
    });
    return result.trim();
  },

  async listPrinters() {
    try {
      const output = execFileSync('lpstat', ['-e'], { encoding: 'utf8', timeout: 5000 });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  },
};
