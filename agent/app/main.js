/**
 * LabelGo Agent — Electron main process.
 *
 * Wraps the existing agent core (lib/, printers/) in a desktop app:
 *   - onboarding window (pairing code + printer pick) when unpaired
 *   - operational dashboard window when running
 *   - frameless tray popover anchored to the tray icon
 *   - Windows autostart via login item settings
 *
 * All printing logic stays in lib/jobs.js + printers/* — this file only owns
 * windows, IPC and the poll/heartbeat scheduling.
 */
import { app, BrowserWindow, Tray, ipcMain, shell, Menu, nativeImage } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

import { getPrinterAdapter } from '../printers/index.js';
import { loadConfig, saveConfig } from '../lib/config.js';
import { getStateDir, ensureStateDir } from '../lib/paths.js';
import { claimJobs, sendHeartbeat, pairWithCode } from '../lib/api.js';
import { processJob, flushPendingConfirmations } from '../lib/jobs.js';
import { listPendingReceipts } from '../lib/store.js';
import { readdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const adapter = getPrinterAdapter();
const TEST_ZPL = '^XA^FO50,50^A0N,50,50^FDLabelGo Test^FS^FO50,120^A0N,30,30^FDLabel OK^FS^XZ';

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

const state = {
  paired: false,
  paused: false,
  online: false,
  lastHeartbeatAt: null,
  pendingConfirmations: 0,
  printedToday: 0,
  printers: [],
  printerName: null,
  serverUrl: 'https://labelgo.com.br',
  lastError: null, // { kind: 'offline'|'auth'|'subscription'|'other', message }
  nextRetryAt: null,
  log: [], // [{ at, icon: 'info'|'ok'|'error', text }]
};

let mainWindow = null;
let popoverWindow = null;
let tray = null;
let pollTimer = null;
let heartbeatTimer = null;
let countdownTimer = null;
let isQuitting = false;

function pushLog(icon, text) {
  const entry = {
    at: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
    icon,
    text,
  };
  state.log.unshift(entry);
  if (state.log.length > 60) state.log.length = 60;
  broadcast('state', publicState());
}

function publicState() {
  return { ...state };
}

function broadcast(channel, payload) {
  for (const win of [mainWindow, popoverWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function setError(kind, message) {
  state.lastError = kind ? { kind, message } : null;
}

function countPrintedToday() {
  try {
    const dir = join(getStateDir(), 'receipts');
    const today = new Date().toISOString().slice(0, 10);
    let count = 0;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const r = JSON.parse(readFileSync(join(dir, name), 'utf8'));
        if (r.sentToPrinterAt && r.sentToPrinterAt.slice(0, 10) === today) count++;
      } catch { /* ignore torn files */ }
    }
    return count;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

function deps() {
  const config = loadConfig();
  return {
    adapter,
    printerName: config.printerName,
    serverUrl: config.serverUrl,
    agentToken: config.agentToken,
    stateDir: getStateDir(),
    log: (msg) => pushLog('info', stripEmoji(msg)),
    error: (msg) => pushLog('error', stripEmoji(msg)),
  };
}

function stripEmoji(msg) {
  return String(msg).replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

async function poll() {
  const config = loadConfig();
  state.nextRetryAt = new Date(Date.now() + config.pollInterval).toISOString();

  try {
    const pending = listPendingReceipts(getStateDir()).length;
    if (pending > 0) {
      await flushPendingConfirmations(deps());
    }
    state.pendingConfirmations = listPendingReceipts(getStateDir()).length;

    if (!state.paused) {
      const jobs = await claimJobs(config.serverUrl, config.agentToken, loadConfig().agentId || agentId(), 5);
      for (const job of jobs) {
        pushLog('info', `Etiqueta #LG-${job.shipment_id ?? job.id} reclamada`);
        await processJob(job, deps());
      }
      setError(null);
    }
    state.online = true;
    state.printedToday = countPrintedToday();
    state.pendingConfirmations = listPendingReceipts(getStateDir()).length;
  } catch (err) {
    classifyError(err);
  }
  broadcast('state', publicState());
}

let cachedAgentId = null;
function agentId() {
  if (!cachedAgentId) {
    const config = loadConfig();
    cachedAgentId = config.agentId || `agent-${Math.random().toString(16).slice(2, 10)}`;
  }
  return cachedAgentId;
}

function classifyError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  let logText = msg;
  if (err && err.code === 'subscription_required') {
    setError('subscription', 'Assinatura inativa');
    logText = 'Assinatura inativa — jobs suspensos';
  } else if (err && err.status === 401) {
    setError('auth', 'Sessão expirada (401).');
    logText = 'Sessão expirada (401) — re-parear o agente';
  } else if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|socket|timed out/i.test(msg)) {
    setError('offline', 'Sem conexão');
    state.online = false;
    logText = 'Sem conexão com o servidor';
  } else {
    setError('other', msg.slice(0, 200));
  }
  const last = state.log[0];
  if (!last || last.text !== logText) pushLog('error', logText);
}

async function heartbeat() {
  const config = loadConfig();
  if (!config.agentToken) return;
  try {
    await sendHeartbeat(config.serverUrl, config.agentToken, agentId());
    state.online = true;
    state.lastHeartbeatAt = new Date().toISOString();
  } catch (err) {
    classifyError(err);
  }
  broadcast('state', publicState());
}

function startLoop() {
  const config = loadConfig();
  stopLoop();
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 30_000);
  poll();
  pollTimer = setInterval(poll, config.pollInterval || 5000);
  countdownTimer = setInterval(() => {
    broadcast('tick', { now: Date.now() });
  }, 1000);
}

function stopLoop() {
  for (const t of [pollTimer, heartbeatTimer, countdownTimer]) {
    if (t) clearInterval(t);
  }
  pollTimer = heartbeatTimer = countdownTimer = null;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const config = loadConfig();
  const paired = Boolean(config.agentToken && config.printerName);
  mainWindow = new BrowserWindow({
    width: paired ? 860 : 430,
    height: paired ? 700 : 700,
    resizable: false,
    frame: false,
    show: false,
    backgroundColor: '#FFFDF8',
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenu(null);
  mainWindow.loadFile(join(__dirname, 'renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Dev smoke mode: capture the window to a PNG and exit.
  if (process.env.LABELGO_SMOKE) {
    mainWindow.webContents.once('did-finish-load', async () => {
      await new Promise(r => setTimeout(r, 1200));
      const img = await mainWindow.webContents.capturePage();
      const { writeFileSync } = await import('node:fs');
      writeFileSync(process.env.LABELGO_SMOKE, img.toPNG());
      setTimeout(() => app.quit(), 300);
    });
  }
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createPopoverWindow() {
  popoverWindow = new BrowserWindow({
    width: 320,
    height: 330,
    resizable: false,
    frame: false,
    transparent: true,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  popoverWindow.loadFile(join(__dirname, 'renderer/popover.html'));
  popoverWindow.on('blur', () => popoverWindow.hide());
  popoverWindow.on('closed', () => { popoverWindow = null; });
}

function togglePopover() {
  if (!popoverWindow) createPopoverWindow();
  if (popoverWindow.isVisible()) {
    popoverWindow.hide();
    return;
  }
  const bounds = tray.getBounds();
  const winBounds = popoverWindow.getBounds();
  popoverWindow.setPosition(
    Math.round(bounds.x + bounds.width / 2 - winBounds.width / 2),
    Math.round(bounds.y - winBounds.height - 8),
    false,
  );
  popoverWindow.show();
}

function createTray() {
  const icon = nativeImage.createFromPath(join(__dirname, 'assets/tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('LabelGo Agent');
  tray.on('click', togglePopover);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir painel', click: createMainWindow },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } },
  ]));
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('get-state', () => publicState());
ipcMain.handle('get-config', () => {
  const config = loadConfig();
  return { serverUrl: config.serverUrl, printerName: config.printerName };
});

ipcMain.handle('list-printers', async () => {
  try {
    state.printers = await adapter.listPrinters();
  } catch {
    state.printers = [];
  }
  broadcast('state', publicState());
  return state.printers;
});

ipcMain.handle('pair', async (_e, { code, printerName, autostart, serverUrl }) => {
  const url = (serverUrl || 'https://labelgo.com.br').replace(/\/$/, '');
  const paired = await pairWithCode(url, String(code || '').trim());
  const finalPrinter = printerName || paired.printerName;
  saveConfig({
    serverUrl: url,
    agentToken: paired.agentToken,
    printerName: finalPrinter,
    agentId: paired.agentId,
  });
  cachedAgentId = paired.agentId;
  applyAutostart(autostart !== false);
  state.paired = true;
  state.printerName = finalPrinter;
  pushLog('ok', 'Agente pareado com sucesso');
  startLoop();
  resizeMainWindow(860, 700);
  broadcast('state', publicState());
  return { ok: true };
});

ipcMain.handle('test-print', async () => {
  const config = loadConfig();
  if (!config.printerName) throw new Error('Nenhuma impressora configurada');
  await adapter.printZpl(config.printerName, TEST_ZPL);
  pushLog('ok', `Etiqueta de teste enviada · ${config.printerName}`);
  return { ok: true };
});

ipcMain.handle('set-printer', (_e, printerName) => {
  saveConfig({ printerName });
  state.printerName = printerName;
  broadcast('state', publicState());
  return { ok: true };
});

ipcMain.handle('set-paused', (_e, paused) => {
  state.paused = Boolean(paused);
  pushLog('info', state.paused ? 'Agente pausado' : 'Agente retomado');
  broadcast('state', publicState());
  return { ok: true };
});

ipcMain.handle('unpair', () => {
  stopLoop();
  saveConfig({ agentToken: undefined, printerName: undefined });
  state.paired = false;
  state.online = false;
  setError(null);
  resizeMainWindow(430, 700);
  broadcast('state', publicState());
  return { ok: true };
});

ipcMain.handle('open-state-dir', () => {
  shell.openPath(getStateDir());
  return { ok: true };
});

ipcMain.handle('open-panel', () => {
  createMainWindow();
  popoverWindow?.hide();
  return { ok: true };
});

ipcMain.handle('open-subscription', () => {
  const config = loadConfig();
  shell.openExternal(`${config.serverUrl}/auto-print`);
  return { ok: true };
});

ipcMain.handle('retry-now', async () => {
  await poll();
  return { ok: true };
});

ipcMain.handle('set-server-url', (_e, url) => {
  saveConfig({ serverUrl: String(url || '').trim().replace(/\/$/, '') });
  return { ok: true };
});

ipcMain.handle('set-autostart', (_e, enabled) => {
  applyAutostart(Boolean(enabled));
  return { ok: true };
});

ipcMain.handle('get-autostart', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('win-close', () => mainWindow?.hide());
ipcMain.on('app-quit', () => { isQuitting = true; app.quit(); });

function resizeMainWindow(w, h) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSize(w, h, true);
    mainWindow.center();
  }
}

function applyAutostart(enabled) {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    ensureStateDir();
    const config = loadConfig();
    state.paired = Boolean(config.agentToken && config.printerName);
    state.printerName = config.printerName;
    state.serverUrl = config.serverUrl;
    cachedAgentId = config.agentId;
    state.pendingConfirmations = listPendingReceipts().length;
    state.printedToday = countPrintedToday();

    createTray();
    createPopoverWindow();
    createMainWindow();

    if (state.paired) startLoop();

    if (config.agentToken && !config.printerName) {
      setError('no_printer', 'Nenhuma impressora configurada');
      broadcast('state', publicState());
    }
  });

  app.on('window-all-closed', () => {
    // Keep running in tray — daemon behavior.
    if (isQuitting) app.quit();
  });

  app.on('before-quit', () => { isQuitting = true; });
}
