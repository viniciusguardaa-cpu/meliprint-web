/**
 * Printer adapter factory — selects the right adapter based on OS.
 */
import { cupsAdapter } from './cups.js';
import { windowsAdapter } from './windows.js';

export function getPrinterAdapter() {
  const platform = process.platform;
  if (platform === 'win32') {
    return windowsAdapter;
  }
  // macOS (darwin) and Linux use CUPS
  return cupsAdapter;
}

export { cupsAdapter, windowsAdapter };
