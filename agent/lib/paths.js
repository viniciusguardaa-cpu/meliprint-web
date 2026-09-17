/**
 * State directory resolution — where receipts and config.json live.
 * Per-platform conventions; override with LABELGO_STATE_DIR.
 */
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';

export function getStateDir() {
  if (process.env.LABELGO_STATE_DIR) return process.env.LABELGO_STATE_DIR;

  const home = homedir();
  switch (process.platform) {
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'LabelGoAgent');
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'LabelGoAgent');
    default:
      return join(process.env.XDG_DATA_HOME || join(home, '.local', 'share'), 'labelgo-agent');
  }
}

export function ensureStateDir() {
  const dir = getStateDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
