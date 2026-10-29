'use strict';
// Détection des jeux installés (Steam, Epic, dossiers connus) pour les jeux de la base.
const fs = require('fs');
const path = require('path');
const { GAMES } = require('./db');
const { regGet } = require('./sys');

const isWin = process.platform === 'win32';
let cached = null;
let cachedAt = 0;

function expand(p) {
  return p.replace(/%([^%]+)%/g, (_, k) => process.env[k] || '');
}

async function steamLibraries() {
  const libs = new Set();
  let steamPath = await regGet('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (typeof steamPath !== 'string' || !steamPath) steamPath = 'C:\\Program Files (x86)\\Steam';
  steamPath = path.normalize(steamPath);
  libs.add(steamPath);
  try {
    const vdf = fs.readFileSync(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  } catch { /* pas de fichier : on reste sur le dossier principal */ }
  return [...libs];
}

async function steamApps() {
  const apps = [];
  for (const lib of await steamLibraries()) {
    const dir = path.join(lib, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      const m = f.match(/^appmanifest_(\d+)\.acf$/);
      if (!m) continue;
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        const name = (txt.match(/"name"\s+"([^"]+)"/) || [])[1] || '';
        apps.push({ appId: Number(m[1]), name: name.toLowerCase() });
      } catch { /* manifeste illisible : on ignore */ }
    }
  }
  return apps;
}

function epicApps() {
  try {
    const file = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (j.InstallationList || []).map((x) => String(x.AppName || '').toLowerCase());
  } catch {
    return [];
  }
}

// Renvoie la liste des identifiants de jeux (de la base) détectés comme installés.
async function detectInstalledIds(force = false) {
  if (cached && !force && Date.now() - cachedAt < 60000) return cached;
  const ids = [];
  if (isWin) {
    const steam = await steamApps();
    const epic = epicApps();
    for (const g of GAMES) {
      let found = false;
      if (g.appId && steam.some((a) => a.appId === g.appId)) found = true;
      if (!found && g.match && steam.some((a) => a.name.includes(g.match))) found = true;
      if (!found && g.epic && epic.some((n) => n.includes(g.epic.toLowerCase()))) found = true;
      if (!found && g.paths && g.paths.some((p) => { try { return fs.existsSync(expand(p)); } catch { return false; } })) found = true;
      if (found) ids.push(g.id);
    }
  }
  cached = ids;
  cachedAt = Date.now();
  return ids;
}

module.exports = { detectInstalledIds };
