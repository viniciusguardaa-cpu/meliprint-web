/**
 * Agent configuration — resolution order:
 *   1. Environment variables (LABELGO_* / legacy PRINTLY_* / MELIPRINT_*)
 *   2. <stateDir>/config.json (written by `agent.js --setup`)
 *   3. <agentDir>/.env (developer installs)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getStateDir, ensureStateDir } from './paths.js';

const AGENT_DIR = fileURLToPath(new URL('..', import.meta.url));

function loadEnvFile() {
  try {
    const content = readFileSync(join(AGENT_DIR, '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env not found — fine, config.json or env vars may exist
  }
}

function loadConfigFile(stateDir = getStateDir()) {
  const file = join(stateDir, 'config.json');
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(patch, stateDir = getStateDir()) {
  ensureStateDir();
  const current = loadConfigFile(stateDir);
  const next = { ...current, ...patch };
  writeFileSync(join(stateDir, 'config.json'), JSON.stringify(next, null, 2));
  return next;
}

export function loadConfig(stateDir = getStateDir()) {
  loadEnvFile();
  const fileConfig = loadConfigFile(stateDir);

  const pick = (envNames, key, fallback) => {
    for (const name of envNames) {
      if (process.env[name]) return process.env[name];
    }
    return fileConfig[key] || fallback;
  };

  return {
    serverUrl: String(pick(['LABELGO_SERVER_URL', 'PRINTLY_SERVER_URL', 'MELIPRINT_SERVER_URL'], 'serverUrl', 'http://localhost:3001')).replace(/\/$/, ''),
    agentToken: pick(['LABELGO_AGENT_TOKEN', 'PRINTLY_AGENT_TOKEN', 'MELIPRINT_AGENT_TOKEN'], 'agentToken', undefined),
    printerName: pick(['LABELGO_PRINTER_NAME', 'PRINTLY_PRINTER_NAME', 'MELIPRINT_PRINTER_NAME'], 'printerName', undefined),
    pollInterval: Number(pick(['LABELGO_POLL_INTERVAL', 'PRINTLY_POLL_INTERVAL', 'MELIPRINT_POLL_INTERVAL'], 'pollInterval', 5000)),
    agentId: fileConfig.agentId, // stable id persisted by --setup; generated per-boot otherwise
  };
}
