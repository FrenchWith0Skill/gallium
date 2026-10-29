'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel) => (cb) => {
  const handler = (_e, p) => cb(p);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  getHardware: (force) => ipcRenderer.invoke('hw:get', force),
  freshHardware: () => ipcRenderer.invoke('hw:fresh'),
  listGames: (opts) => ipcRenderer.invoke('games:list', opts),
  runAnalysis: (mode) => ipcRenderer.invoke('analysis:run', mode),
  lastAnalysis: () => ipcRenderer.invoke('analysis:last'),
  onProgress: listen('analysis:progress'),
  runHealth: () => ipcRenderer.invoke('health:run'),
  lastHealth: () => ipcRenderer.invoke('health:last'),
  onHealthProgress: listen('health:progress'),
  runStress: (opts) => ipcRenderer.invoke('stress:run', opts),
  stopStress: () => ipcRenderer.invoke('stress:stop'),
  scheduleMemTest: () => ipcRenderer.invoke('memtest:schedule'),
  cancelMemTest: () => ipcRenderer.invoke('memtest:cancel'),
  memTestStatus: () => ipcRenderer.invoke('memtest:status'),
  restartForMemTest: () => ipcRenderer.invoke('memtest:restart'),
  lastStress: () => ipcRenderer.invoke('stress:last'),
  onStressProgress: listen('stress:progress'),
  listDrivers: () => ipcRenderer.invoke('drivers:list'),
  lastDrivers: () => ipcRenderer.invoke('drivers:last'),
  gpuSample: () => ipcRenderer.invoke('gpu:sample'),
  saveGpuStress: (r) => ipcRenderer.invoke('gpustress:save', r),
  lastGpuStress: () => ipcRenderer.invoke('gpustress:last'),
  restoreInfo: () => ipcRenderer.invoke('tweaks:restoreInfo'),
  listClients: () => ipcRenderer.invoke('clients:list'),
  openClientReport: (id) => ipcRenderer.invoke('clients:open', id),
  deleteClientReport: (id) => ipcRenderer.invoke('clients:delete', id),
  monitorSample: () => ipcRenderer.invoke('monitor:sample'),
  listTweaks: () => ipcRenderer.invoke('tweaks:list'),
  scanTemp: () => ipcRenderer.invoke('tweaks:scanTemp'),
  applyTweak: (id) => ipcRenderer.invoke('tweaks:apply', id),
  undoTweak: (id) => ipcRenderer.invoke('tweaks:undo', id),
  history: () => ipcRenderer.invoke('history:get'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  i18n: () => ipcRenderer.invoke('i18n:get'),
  languages: () => ipcRenderer.invoke('i18n:langs'),
  i18nInitial: ipcRenderer.sendSync('i18n:sync'),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  catalog: (opts) => ipcRenderer.invoke('catalog:list', opts),
  estimateComponent: (q, opts) => ipcRenderer.invoke('catalog:estimate', q, opts),
  saveReport: (opts) => ipcRenderer.invoke('report:save', opts),
  openReport: () => ipcRenderer.invoke('report:open'),
  openSettings: (uri) => ipcRenderer.invoke('open:settings', uri),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openSupport: () => ipcRenderer.invoke('open:support'),
  openRepo: () => ipcRenderer.invoke('open:repo'),
  licence: () => ipcRenderer.invoke('app:licence'),
});
