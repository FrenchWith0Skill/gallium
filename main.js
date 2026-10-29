'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
// La langue est choisie AVANT de charger les autres modules : leurs libellés sont traduits au chargement.
const i18n = require('./lib/i18n');
// Langue par défaut : anglais (au premier lancement, ou si les réglages sont illisibles).
let startLang = 'en';
try { startLang = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')).lang || 'en'; } catch { /* premier lancement */ }
i18n.setLang(startLang);
const { t } = i18n;
const { getHardware } = require('./lib/hardware');
const { estimateAll } = require('./lib/scoring');
const { detectInstalledIds } = require('./lib/steam');
const { runAnalysis } = require('./lib/analysis');
const { runHealth, nvidiaSmi } = require('./lib/health');
const { listDrivers } = require('./lib/drivers');
const clients = require('./lib/clients');
const stress = require('./lib/stress');
const monitor = require('./lib/monitor');
const tweaks = require('./lib/tweaks');
const { buildReport } = require('./lib/report');
const catalog = require('./lib/catalog');
const hwdb = require('./lib/hwdb');
const crypto = require('crypto');
const { run, ps, psJson } = require('./lib/sys');

// Mémoire vive : le service réseau de Chromium (inutile ici, l'app ne charge rien d'Internet) tourne
// dans le processus principal au lieu d'un processus à part, la jeune génération de V8 est réduite et le
// ramasse-miettes peut être déclenché après les gros traitements. Les animations restent accélérées par le GPU.
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2');
app.commandLine.appendSwitch('js-flags', '--max-semi-space-size=2 --expose-gc');
require('v8').setFlagsFromString('--expose-gc');
const collectGarbage = (() => {
  let gc = null;
  try { gc = require('vm').runInNewContext('gc'); } catch { /* indisponible */ }
  return () => { if (gc) setTimeout(() => { try { gc(); } catch { /* ignoré */ } }, 500); };
})();

let win = null;
let analysisRunning = false;
let healthRunning = false;
let lastReport = null;

const dataFile = (name) => path.join(app.getPath('userData'), name);

// L'application s'est appelée « PC Optimizer » puis « Malachite » : on reprend une fois ses données (historique, analyses, sauvegardes
// des réglages) depuis l'ancien dossier, pour ne rien perdre avec le changement de nom.
function migrateOldData() {
  const appData = app.getPath('appData');
  const dest = app.getPath('userData');
  const files = ['history.json', 'last-analysis.json', 'last-health.json', 'last-stress.json', 'tweaks-backup.json', 'hw-cache.json'];
  for (const old of ['Malachite', 'malachite', 'PC Optimizer', 'pc-optimizer']) {
    const dir = path.join(appData, old);
    if (dir === dest || !fs.existsSync(dir)) continue;
    try { fs.mkdirSync(dest, { recursive: true }); } catch { /* existe déjà */ }
    for (const f of files) {
      const from = path.join(dir, f);
      const to = path.join(dest, f);
      try { if (fs.existsSync(from) && !fs.existsSync(to)) fs.copyFileSync(from, to); } catch { /* fichier facultatif */ }
    }
  }
}
function readJson(name, fallback = null) {
  try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch { return fallback; }
}
function writeJson(name, value) {
  try { fs.writeFileSync(dataFile(name), JSON.stringify(value)); } catch { /* sauvegarde facultative */ }
}

// Historique des analyses, diagnostics et tests : sert à comparer avant / après une intervention.
function pushHistory(entry) {
  const h = readJson('history.json', []);
  h.push(entry);
  writeJson('history.json', h.slice(-60));
}

const hasNvidia = (hw) => hw.gpus.some((g) => /nvidia|geforce/i.test(g.name));
const send = (e, channel, payload) => { if (!e.sender.isDestroyed()) e.sender.send(channel, payload); };

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640,
    backgroundColor: '#0b0f14', title: 'Gallium', autoHideMenuBar: true,
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Aucune navigation ni fenêtre externe depuis l'interface.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// Configuration : au démarrage, la dernière configuration connue s'affiche tout de suite pendant
// que la détection complète (~5 s) tourne en arrière-plan.
let hwRefresh = null;
function refreshHardware() {
  if (!hwRefresh) {
    hwRefresh = getHardware(true).then((hw) => { writeJson('hw-cache.json', hw); return hw; }).finally(() => { hwRefresh = null; });
  }
  return hwRefresh;
}
let hwLoaded = false;
ipcMain.handle('hw:get', async (_e, force) => {
  if (!force && !hwLoaded) {
    const cached = readJson('hw-cache.json');
    if (cached && cached.perf) { hwLoaded = true; refreshHardware(); return { ...cached, stale: true }; }
  }
  hwLoaded = true;
  return force ? refreshHardware() : getHardware(false);
});
// Configuration la plus récente, sans relancer une détection si une est déjà en cours.
const currentHw = () => hwRefresh || getHardware(false);
ipcMain.handle('hw:fresh', () => currentHw());

ipcMain.handle('games:list', async (_e, opts) => {
  const hw = await currentHw();
  const installed = await detectInstalledIds();
  return estimateAll(hw, opts || {}, installed);
});

ipcMain.handle('analysis:run', async (e, mode) => {
  if (analysisRunning) throw new Error(t("Une analyse est déjà en cours."));
  analysisRunning = true;
  try {
    const hw = await refreshHardware();
    const installed = await detectInstalledIds(true);
    const res = await runAnalysis(mode === 'full' ? 'full' : 'quick', hw, installed, (p) => send(e, 'analysis:progress', p));
    writeJson('last-analysis.json', res);
    pushHistory({ kind: 'analysis', mode: res.mode, at: res.finishedAt, score: res.score, counts: res.counts,
      benchmarks: res.benchmarks.map((b) => ({ id: b.id, label: b.label, value: b.value, unit: b.unit })) });
    collectGarbage();
    return res;
  } finally {
    analysisRunning = false;
  }
});

ipcMain.handle('analysis:last', () => readJson('last-analysis.json'));

ipcMain.handle('health:run', async (e) => {
  if (healthRunning) throw new Error(t("Un diagnostic est déjà en cours."));
  healthRunning = true;
  try {
    const hw = await refreshHardware();
    const res = await runHealth(hw, readJson('last-analysis.json'), (p) => send(e, 'health:progress', p));
    writeJson('last-health.json', res);
    pushHistory({ kind: 'health', at: res.finishedAt, counts: res.counts,
      components: res.components.map((c) => ({ id: c.id, label: c.label, status: c.status })) });
    collectGarbage();
    return res;
  } finally {
    healthRunning = false;
  }
});

ipcMain.handle('health:last', () => readJson('last-health.json'));

ipcMain.handle('stress:run', async (e, opts) => {
  const hw = await currentHw();
  const res = await stress.runStress(opts || {}, hasNvidia(hw), (p) => send(e, 'stress:progress', p));
  writeJson('last-stress.json', res);
  collectGarbage();
  pushHistory({ kind: 'stress', at: res.finishedAt, cpu: res.cpu, status: res.status, ratio: res.ratio, avgMops: res.avgMops, minutes: res.minutes,
    maxCpuTemp: res.maxCpuTemp, maxGpuTemp: res.maxGpuTemp, ramErrors: res.ram ? res.ram.errors : null });
  return res;
});
ipcMain.handle('stress:stop', () => { stress.stop(); return true; });

// Diagnostic de mémoire Windows : il ne peut tourner qu'au démarrage, avant Windows.
// On le programme pour le prochain redémarrage (comme le fait mdsched.exe), sans fenêtre à remplir.
ipcMain.handle('memtest:schedule', async () => {
  if (process.platform !== 'win32') return 'unsupported';
  if ((await run('bcdedit', ['/bootsequence', '{memdiag}'], 15000)) !== null) return 'scheduled';
  // Repli : ouvrir l'outil Windows pour que l'utilisateur choisisse lui-même.
  await shell.openPath(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'mdsched.exe'));
  return 'opened';
});
// État du test Windows : programmé au prochain démarrage ? Résultat du dernier test passé ?
ipcMain.handle('memtest:status', async () => {
  if (process.platform !== 'win32') return { scheduled: false, last: null };
  const [bcd, ev] = await Promise.all([
    run('bcdedit', ['/enum', '{bootmgr}'], 15000),
    psJson("Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-MemoryDiagnostics-Results'} -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object Id,@{n='T';e={$_.TimeCreated.ToString('o')}}", 20000),
  ]);
  const e = ev && ev[0];
  return {
    scheduled: !!bcd && /bootsequence\s+\{memdiag\}/i.test(bcd),
    // 1101 / 1201 : aucune erreur ; 1102 / 1202 : erreurs matérielles détectées.
    last: e && e.Id ? { at: e.T, ok: ![1102, 1202].includes(Number(e.Id)) } : null,
  };
});
ipcMain.handle('memtest:cancel', async () => (await run('bcdedit', ['/deletevalue', '{bootmgr}', 'bootsequence'], 15000)) !== null);
ipcMain.handle('memtest:restart', async () => (await run('shutdown', ['/r', '/t', '10', '/c', t("Gallium : redémarrage pour tester la mémoire vive.")], 15000)) !== null);
ipcMain.handle('stress:last', () => readJson('last-stress.json'));

// Pilotes installés (à la demande : ~1 s).
ipcMain.handle('drivers:list', async () => {
  const res = await listDrivers();
  writeJson('last-drivers.json', res);
  return res;
});
ipcMain.handle('drivers:last', () => readJson('last-drivers.json'));

// Test de la carte graphique : la charge WebGL tourne dans la page, le processus principal fournit
// la température (NVIDIA) et enregistre le résultat.
ipcMain.handle('gpu:sample', async () => {
  if (!hasNvidia(await currentHw())) return null;
  const g = (await nvidiaSmi(8000))[0];
  return g ? { temp: g.temp, util: g.util, power: g.power, clock: g.clock, fan: g.fan } : null;
});
ipcMain.handle('gpustress:save', (_e, r) => {
  if (!r || typeof r !== 'object') return false;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const res = {
    finishedAt: new Date().toISOString(), aborted: !!r.aborted, lost: !!r.lost, minutes: num(r.minutes), renderer: String(r.renderer || '').slice(0, 200),
    load: num(r.load), avgFps: num(r.avgFps), ratio: num(r.ratio), maxTemp: num(r.maxTemp), maxPower: num(r.maxPower),
    series: Array.isArray(r.series) ? r.series.slice(0, 2000).map(num) : [], temps: Array.isArray(r.temps) ? r.temps.slice(0, 2000).map(num) : [],
    status: ['ok', 'warn', 'bad', 'info'].includes(r.status) ? r.status : 'info',
    issues: Array.isArray(r.issues) ? r.issues.slice(0, 10).map((x) => String(x).slice(0, 300)) : [],
  };
  writeJson('last-gpu-stress.json', res);
  pushHistory({ kind: 'gpustress', at: res.finishedAt, status: res.status, ratio: res.ratio, avgFps: res.avgFps, minutes: res.minutes, maxGpuTemp: res.maxTemp });
  return res;
});
ipcMain.handle('gpustress:last', () => readJson('last-gpu-stress.json'));

ipcMain.handle('monitor:sample', async () => monitor.sample(hasNvidia(await currentHw())));

ipcMain.handle('tweaks:list', () => tweaks.listTweaks(readJson('tweaks-backup.json', {})));
ipcMain.handle('tweaks:scanTemp', () => tweaks.scanTemp());
ipcMain.handle('tweaks:restoreInfo', () => tweaks.restoreInfo());
ipcMain.handle('tweaks:apply', async (_e, id) => {
  const bk = readJson('tweaks-backup.json', {});
  const msg = await tweaks.applyTweak(String(id), bk);
  writeJson('tweaks-backup.json', bk);
  return msg;
});
ipcMain.handle('tweaks:undo', async (_e, id) => {
  const bk = readJson('tweaks-backup.json', {});
  const msg = await tweaks.undoTweak(String(id), bk);
  writeJson('tweaks-backup.json', bk);
  return msg;
});

// Base de composants consultable (catalogue) et estimation d'un composant absent.
ipcMain.handle('catalog:list', async (_e, opts) => {
  const hw = await currentHw();
  const pc = hwdb.parseCpu(hw.cpu && hw.cpu.brand);
  const mine = { cpu: pc ? pc.key : null, gpus: (hw.gpus || []).map((g) => { const p = hwdb.parseGpu(g.name); return p ? p.key : null; }).filter(Boolean) };
  return { ...catalog.buildCatalog(opts || {}), mine };
});
ipcMain.handle('catalog:estimate', (_e, q, opts) => catalog.estimateQuery(String(q || '').slice(0, 120), opts || {}));

ipcMain.handle('clients:list', () => clients.listClients(readJson('clients.json', { clients: [] })));
const reportCopy = (id) => (/^[a-z0-9]{6,24}$/.test(String(id)) ? path.join(dataFile('reports'), id + '.html') : null);
// Rouvre la copie gardée par l'application (le fichier exporté a pu être déplacé ou envoyé).
ipcMain.handle('clients:open', (_e, id) => {
  const f = reportCopy(id);
  if (f && fs.existsSync(f)) { shell.openPath(f); return true; }
  return false;
});
ipcMain.handle('clients:delete', (_e, id) => {
  const f = reportCopy(id);
  if (!f) return false;
  const db = readJson('clients.json', { clients: [] });
  for (const c of db.clients) c.reports = c.reports.filter((r) => r.id !== id);
  db.clients = db.clients.filter((c) => c.reports.length);
  writeJson('clients.json', db);
  try { fs.unlinkSync(f); } catch { /* déjà supprimé */ }
  return true;
});

// Réglages : mode d'utilisation (essentiel / particulier / professionnel), mémorisation du choix, langue.
const DEFAULT_SETTINGS = { mode: 'pro', remember: false, chosen: false, lang: 'en' };
const getSettings = () => ({ ...DEFAULT_SETTINGS, ...(readJson('settings.json', {}) || {}) });
ipcMain.handle('settings:get', () => getSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const p = patch || {};
  const s = getSettings();
  if (['base', 'perso', 'pro'].includes(p.mode)) s.mode = p.mode;
  if (typeof p.remember === 'boolean') s.remember = p.remember;
  if (typeof p.chosen === 'boolean') s.chosen = p.chosen;
  if (typeof p.lang === 'string' && /^[a-z]{2}$/.test(p.lang)) s.lang = i18n.setLang(p.lang);
  writeJson('settings.json', s);
  return s;
});
ipcMain.handle('i18n:get', () => ({ lang: i18n.getLang(), dict: i18n.getDict() }));
// Langues réellement traduites (un fichier locales/<code>.json), plus le français d'origine.
ipcMain.handle('i18n:langs', () => { try { return ['fr', ...fs.readdirSync(path.join(__dirname, 'locales')).filter((f) => /^[a-z]{2}.json$/.test(f)).map((f) => f.slice(0, 2))]; } catch { return ['fr']; } });
// Version synchrone : l'interface a besoin des traductions avant d'exécuter son script.
ipcMain.on('i18n:sync', (e) => { e.returnValue = { lang: i18n.getLang(), dict: i18n.getDict() }; });
// Changement de langue : on relance Gallium pour que tous les textes (y compris ceux du moteur) changent.
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); return true; });

ipcMain.handle('history:get', () => readJson('history.json', []));

// Rapport : HTML autonome, ou PDF rendu dans une fenêtre cachée sans script.
ipcMain.handle('report:save', async (_e, opts) => {
  const o = opts || {};
  const format = o.format === 'pdf' ? 'pdf' : 'html';
  const hw = await currentHw();
  const meta = { client: String(o.client || '').slice(0, 200), ref: String(o.ref || '').slice(0, 100), notes: String(o.notes || '').slice(0, 5000) };
  const data = {
    hw,
    analysis: o.include?.analysis === false ? null : readJson('last-analysis.json'),
    health: o.include?.health === false ? null : readJson('last-health.json'),
    stress: o.include?.stress === false ? null : readJson('last-stress.json'),
    gpuStress: o.include?.gpuStress === false ? null : readJson('last-gpu-stress.json'),
    drivers: o.include?.drivers === false ? null : readJson('last-drivers.json'),
  };
  const html = buildReport({ ...data, meta });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = t("Rapport-PC-{0}-{1}", [(meta.client || hw.os.hostname || 'PC').replace(/[^\w\-]+/g, '_'), stamp]);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: t("Enregistrer le rapport"), defaultPath: path.join(app.getPath('documents'), `${base}.${format}`),
    filters: format === 'pdf' ? [{ name: 'PDF', extensions: ['pdf'] }] : [{ name: 'Page web', extensions: ['html'] }],
  });
  if (canceled || !filePath) return null;
  if (format === 'pdf') {
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
    try {
      await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const buf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
      fs.writeFileSync(filePath, buf);
    } finally {
      pdfWin.destroy();
      collectGarbage();
    }
  } else {
    fs.writeFileSync(filePath, html, 'utf8');
  }
  lastReport = filePath;
  // Fiche client : une copie du rapport (HTML) est gardée avec son résumé, pour le rouvrir ou le comparer plus tard.
  const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
  try {
    fs.mkdirSync(dataFile('reports'), { recursive: true });
    fs.writeFileSync(path.join(dataFile('reports'), id + '.html'), html, 'utf8');
    const db = readJson('clients.json', { clients: [] });
    clients.addReport(db, meta, { id, at: new Date().toISOString(), ref: meta.ref || null, notes: meta.notes ? meta.notes.slice(0, 300) : null,
      file: filePath, format, summary: clients.summarize(data) });
    writeJson('clients.json', db);
  } catch { /* l'historique client est facultatif */ }
  return filePath;
});

// Ouvre uniquement le dernier rapport enregistré par l'application.
ipcMain.handle('report:open', () => {
  if (lastReport && fs.existsSync(lastReport)) { shell.openPath(lastReport); return true; }
  return false;
});

// Liens définis dans package.json (« gallium ») : page de dons et dépôt du code source.
// Seuls des sites connus et en https sont acceptés.
const DONATION_SITES = /^https:\/\/(www\.)?(ko-fi\.com|buymeacoffee\.com|liberapay\.com|paypal\.me|github\.com\/sponsors)\/[\w\-./]*$/i;
const GALLIUM_LINKS = require('./package.json').gallium || {};
const SUPPORT_URL = DONATION_SITES.test(String(GALLIUM_LINKS.supportUrl || '')) ? GALLIUM_LINKS.supportUrl : null;
const REPO_URL = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/i.test(String(GALLIUM_LINKS.repoUrl || '')) ? GALLIUM_LINKS.repoUrl : null;
ipcMain.handle('app:info', () => ({ version: require('./package.json').version, supportUrl: SUPPORT_URL, repoUrl: REPO_URL }));
ipcMain.handle('open:repo', () => { if (REPO_URL) shell.openExternal(REPO_URL); return !!REPO_URL; });
ipcMain.handle('open:support', () => { if (SUPPORT_URL) shell.openExternal(SUPPORT_URL); return !!SUPPORT_URL; });
ipcMain.handle('app:licence', () => { try { return fs.readFileSync(path.join(__dirname, 'LICENSE.txt'), 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; } });

// Seules les pages de Paramètres Windows peuvent être ouvertes (liste blanche stricte).
ipcMain.handle('open:settings', (_e, uri) => {
  if (typeof uri === 'string' && /^ms-settings:[a-z0-9\-:]+$/i.test(uri)) {
    shell.openExternal(uri);
    return true;
  }
  return false;
});

// L'application a besoin des droits administrateur (SMART des disques, journaux système, optimisations).
// « fltmc » échoue sans élévation : c'est un test rapide et fiable.
const isElevated = async () => (await run('fltmc', [], 5000)) !== null;

async function ensureAdmin() {
  if (process.platform !== 'win32' || (await isElevated())) return true;
  if (process.env.PCOPT_SKIP_ADMIN === '1') return true; // tests automatisés uniquement
  if (!process.argv.includes('--elevated')) {
    const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    const args = [...(app.isPackaged ? [] : [`"${app.getAppPath()}"`]), '--elevated'].join(' ');
    // Version portable : relancer le .exe d'origine, pas la copie temporaire que le lanceur supprime à la fermeture.
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const out = await ps(`Start-Process -FilePath ${q(exe)} -ArgumentList ${q(args)} -Verb RunAs; 'ok'`, 120000);
    if (out && out.includes('ok')) return false;
  }
  dialog.showErrorBox(t("Droits administrateur requis"),
    t("Gallium doit être ouvert en administrateur pour lire l'état des disques et les journaux de Windows, et pour appliquer les optimisations.\n\n")
    + t("Relance l'application et clique sur « Oui » quand Windows demande l'autorisation."));
  return false;
}

app.whenReady().then(async () => {
  if (!(await ensureAdmin())) { app.quit(); return; }
  migrateOldData();
  i18n.setLang(getSettings().lang);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { stress.stop(); if (process.platform !== 'darwin') app.quit(); });
