/**
 * Preload — exposes a narrow, explicit API to the renderer.
 * CommonJS so the sandboxed renderer can load it.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('labelgo', {
  // queries
  getState: () => ipcRenderer.invoke('get-state'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  listPrinters: () => ipcRenderer.invoke('list-printers'),

  // actions
  pair: (payload) => ipcRenderer.invoke('pair', payload),
  testPrint: () => ipcRenderer.invoke('test-print'),
  setPrinter: (printerName) => ipcRenderer.invoke('set-printer', printerName),
  setPaused: (paused) => ipcRenderer.invoke('set-paused', paused),
  unpair: () => ipcRenderer.invoke('unpair'),
  openStateDir: () => ipcRenderer.invoke('open-state-dir'),
  openPanel: () => ipcRenderer.invoke('open-panel'),
  openSubscription: () => ipcRenderer.invoke('open-subscription'),
  retryNow: () => ipcRenderer.invoke('retry-now'),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),

  // events
  onState: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  onTick: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('tick', listener);
    return () => ipcRenderer.removeListener('tick', listener);
  },

  // window controls (frameless windows)
  minimize: () => ipcRenderer.send('win-minimize'),
  toggleMaximize: () => ipcRenderer.send('win-maximize'),
  closeWindow: () => ipcRenderer.send('win-close'),
  quitApp: () => ipcRenderer.send('app-quit'),
});
