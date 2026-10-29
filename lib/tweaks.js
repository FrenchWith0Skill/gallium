'use strict';
const { t } = require('./i18n');
// Optimisations appliquées en un clic. Chacune ne touche qu'aux réglages de l'utilisateur courant
// (registre HKCU, plan d'alimentation) et garde l'ancienne valeur pour pouvoir l'annuler.
const os = require('os');
const fsp = require('fs/promises');
const path = require('path');
const { run, ps, psJson, regGet, regSet, regDelete } = require('./sys');

const isWin = process.platform === 'win32';
const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const GUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const KEY = {
  gamebar: 'HKCU\\Software\\Microsoft\\GameBar',
  gamedvr: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR',
  mouse: 'HKCU\\Control Panel\\Mouse',
};

async function activeScheme() {
  const out = await run('powercfg', ['/getactivescheme']);
  const m = out && out.match(GUID_RE);
  const name = out && out.match(/\(([^)]+)\)\s*$/m);
  return m ? { guid: m[1].toLowerCase(), name: name ? name[1] : null } : null;
}

// Applique les seuils / la vitesse de la souris immédiatement (et dans le registre) via SystemParametersInfo.
function setMouse(t1, t2, speed) {
  return ps(`Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool SystemParametersInfo(int a, int b, int[] c, int d);';
[W.U]::SystemParametersInfo(4, 0, [int[]]@(${Number(t1)}, ${Number(t2)}, ${Number(speed)}), 3)`);
}

// Parcours asynchrone d'un dossier : ne bloque jamais le processus principal (l'interface reste fluide).
// onFile(chemin, stats) est appelé pour chaque fichier ; arrêt à l'échéance ou au-delà de maxFiles.
async function walk(root, { deadline, maxDepth = 8, maxFiles = 100000 }, onFile) {
  let queue = [[root, 0]];
  let count = 0;
  while (queue.length && Date.now() < deadline && count < maxFiles) {
    const batch = queue.splice(0, 16);
    await Promise.all(batch.map(async ([dir, depth]) => {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      const files = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (depth < maxDepth) queue.push([full, depth + 1]); } else if (e.isFile()) files.push(full);
      }
      for (let k = 0; k < files.length && Date.now() < deadline; k += 256) {
        await Promise.all(files.slice(k, k + 256).map(async (f) => {
          try { onFile(f, await fsp.stat(f)); count++; } catch { /* verrouillé */ }
        }));
      }
    }));
  }
}

// Fichiers temporaires de l'utilisateur non modifiés depuis 2 jours.
async function tempFiles(deadlineMs = 6000) {
  const limit = Date.now() - 2 * 86400000;
  const files = [];
  let bytes = 0;
  await walk(os.tmpdir(), { deadline: Date.now() + deadlineMs }, (f, st) => {
    if (st.mtimeMs < limit) { files.push(f); bytes += st.size; }
  });
  return { files, bytes };
}

// Le calcul de la taille est mis en cache 2 minutes : la page Optimiser s'affiche immédiatement.
let tempCache = null;
async function scanTemp() {
  const tx = await tempFiles(8000);
  tempCache = { at: Date.now(), bytes: tx.bytes };
  return tempCache;
}

const fmtGb = (b) => (b >= 1073741824 ? t("{0} Go", [(b / 1073741824).toFixed(1)]) : t("{0} Mo", [Math.round(b / 1048576)]));

const TWEAKS = [
  {
    id: 'power', label: t("Plan d'alimentation « Performances élevées »"),
    desc: t("Empêche Windows de brider la fréquence du processeur. Consomme un peu plus d'électricité (à éviter sur batterie)."),
    async state() {
      const a = await activeScheme();
      if (!a) return null;
      return { applied: a.guid === HIGH || a.guid === ULTIMATE || /performances élevées|high performance|performances optimales|ultimate/i.test(a.name || ''), current: a.name || a.guid };
    },
    async apply(bk) {
      const a = await activeScheme();
      if (a) bk.power = a.guid;
      let ok = (await run('powercfg', ['/setactive', HIGH])) !== null;
      if (!ok) {
        // Sur certains PC (veille moderne), le plan est masqué : on en crée une copie.
        const out = await run('powercfg', ['-duplicatescheme', HIGH]);
        const m = out && out.match(GUID_RE);
        ok = !!m && (await run('powercfg', ['/setactive', m[1]])) !== null;
      }
      if (!ok) throw new Error(t("Windows a refusé de changer de plan d'alimentation sur ce PC."));
    },
    async undo(bk) {
      if (!bk.power || (await run('powercfg', ['/setactive', bk.power])) === null) throw new Error(t("Impossible de restaurer l'ancien plan."));
    },
  },
  {
    id: 'gamemode', label: t("Activer le mode Jeu"),
    desc: t("Windows donne la priorité au jeu au premier plan et repousse les mises à jour pendant que tu joues."),
    async state() {
      const v = await regGet(KEY.gamebar, 'AutoGameModeEnabled');
      return { applied: v !== 0, current: v === 0 ? t("désactivé") : t("activé") };
    },
    async apply(bk) {
      bk.gamemode = { v: await regGet(KEY.gamebar, 'AutoGameModeEnabled') };
      if (!(await regSet(KEY.gamebar, 'AutoGameModeEnabled', 'REG_DWORD', 1))) throw new Error(t("Écriture refusée."));
    },
    async undo(bk) {
      const v = bk.gamemode && bk.gamemode.v;
      if (v == null) await regDelete(KEY.gamebar, 'AutoGameModeEnabled');
      else await regSet(KEY.gamebar, 'AutoGameModeEnabled', 'REG_DWORD', v);
    },
  },
  {
    id: 'gamedvr', label: t("Couper l'enregistrement Xbox en arrière-plan"),
    desc: t("La Game Bar n'enregistre plus les 30 dernières secondes en continu : moins de charge GPU et disque. Les captures manuelles restent possibles."),
    async state() {
      const v = await regGet(KEY.gamedvr, 'HistoricalCaptureEnabled');
      return { applied: v !== 1, current: v === 1 ? t("enregistrement continu actif") : t("désactivé") };
    },
    async apply(bk) {
      bk.gamedvr = { v: await regGet(KEY.gamedvr, 'HistoricalCaptureEnabled') };
      if (!(await regSet(KEY.gamedvr, 'HistoricalCaptureEnabled', 'REG_DWORD', 0))) throw new Error(t("Écriture refusée."));
    },
    async undo(bk) {
      const v = bk.gamedvr && bk.gamedvr.v;
      if (v == null) await regDelete(KEY.gamedvr, 'HistoricalCaptureEnabled');
      else await regSet(KEY.gamedvr, 'HistoricalCaptureEnabled', 'REG_DWORD', v);
    },
  },
  {
    id: 'mouse', label: t("Désactiver l'accélération de la souris"),
    desc: t("Décoche « Améliorer la précision du pointeur » : le curseur parcourt toujours la même distance pour un même mouvement, indispensable pour viser."),
    async state() {
      const v = await regGet(KEY.mouse, 'MouseSpeed');
      return { applied: String(v) === '0', current: String(v) === '0' ? t("désactivée") : t("activée") };
    },
    async apply(bk) {
      const [s, t1, t2] = await Promise.all(['MouseSpeed', 'MouseThreshold1', 'MouseThreshold2'].map((n) => regGet(KEY.mouse, n)));
      bk.mouse = { s: Number(s ?? 1), t1: Number(t1 ?? 6), t2: Number(t2 ?? 10) };
      if ((await setMouse(0, 0, 0)) === null) throw new Error(t("Windows a refusé le changement."));
    },
    async undo(bk) {
      const m = bk.mouse || { s: 1, t1: 6, t2: 10 };
      await setMouse(m.t1, m.t2, m.s);
    },
  },
  {
    id: 'temp', label: t("Supprimer les fichiers temporaires"), irreversible: true,
    desc: t("Supprime les fichiers du dossier temporaire de ton compte qui n'ont pas servi depuis 2 jours. Les fichiers en cours d'utilisation sont ignorés."),
    async state() {
      if (!tempCache || Date.now() - tempCache.at > 120000) return { applied: null, current: t("calcul de la taille…"), pending: true };
      return { applied: tempCache.bytes < 200 * 1048576, current: t("{0} récupérables", [fmtGb(tempCache.bytes)]) };
    },
    async apply() {
      const tx = await tempFiles(15000);
      let freed = 0;
      for (let k = 0; k < tx.files.length; k += 128) {
        await Promise.all(tx.files.slice(k, k + 128).map(async (f) => {
          try { const st = await fsp.stat(f); await fsp.unlink(f); freed += st.size; } catch { /* utilisé ou protégé */ }
        }));
      }
      tempCache = null;
      return t("{0} libérés.", [fmtGb(freed)]);
    },
  },
];

async function listTweaks(bk) {
  if (!isWin) return [];
  return Promise.all(TWEAKS.map(async (tx) => {
    let st = null;
    try { st = await tx.state(); } catch { /* état illisible */ }
    return {
      id: tx.id, label: tx.label, desc: tx.desc, irreversible: !!tx.irreversible,
      applied: st ? st.applied : null, current: st ? st.current : null, pending: !!(st && st.pending),
      canUndo: !tx.irreversible && bk[tx.id] !== undefined,
    };
  }));
}

// Point de restauration Windows créé avant la première optimisation de la session. Windows n'en accepte
// qu'un par 24 h (par défaut) : un point récent, créé par Gallium ou non, suffit.
const PS_RESTORE = `
$ErrorActionPreference='Stop'
$drive="$env:SystemDrive\\"
$last=Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1
$lastAt=$(if($last){[Management.ManagementDateTimeConverter]::ToDateTime($last.CreationTime)})
if($lastAt -and ((Get-Date)-$lastAt).TotalHours -lt 24){ [pscustomobject]@{ r='recent'; at=$lastAt.ToString('o'); d=$last.Description }; return }
$enabled=$false
try { Checkpoint-Computer -Description 'Gallium : avant optimisation' -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue }
catch { Enable-ComputerRestore -Drive $drive; $enabled=$true; Checkpoint-Computer -Description 'Gallium : avant optimisation' -RestorePointType MODIFY_SETTINGS -WarningAction SilentlyContinue }
$n=Get-ComputerRestorePoint | Sort-Object SequenceNumber | Select-Object -Last 1
$nAt=$(if($n){[Management.ManagementDateTimeConverter]::ToDateTime($n.CreationTime)})
if($nAt -and ((Get-Date)-$nAt).TotalMinutes -lt 10){ [pscustomobject]@{ r='created'; at=$nAt.ToString('o'); enabled=$enabled } } else { [pscustomobject]@{ r='failed' } }`;

let restoreDone = null;
async function ensureRestorePoint() {
  if (!isWin) return { r: 'unsupported' };
  if (restoreDone && Date.now() - restoreDone.t < 24 * 3600000) return restoreDone.res;
  // Bloc de script : « return » et if/else doivent pouvoir être suivis du « | ConvertTo-Json » de psJson.
  const out = await psJson(`& {${PS_RESTORE}\n}`, 240000);
  const res = (out && out[0]) || { r: 'failed' };
  if (res.r !== 'failed') restoreDone = { t: Date.now(), res };
  return res;
}

async function restoreInfo() {
  if (!isWin) return null;
  const out = await psJson("Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object SequenceNumber | Select-Object -Last 1 @{n='at';e={[Management.ManagementDateTimeConverter]::ToDateTime($_.CreationTime).ToString('o')}},@{n='d';e={$_.Description}}", 30000);
  return out && out[0] && out[0].at ? out[0] : null;
}

async function applyTweak(id, bk) {
  const tx = TWEAKS.find((x) => x.id === id);
  if (!tx || !isWin) throw new Error(t("Optimisation inconnue."));
  const rp = await ensureRestorePoint();
  const msg = (await tx.apply(bk)) || t("Appliqué.");
  if (rp.r === 'created') return t("Point de restauration créé{0}. {1}", [rp.enabled ? t(" (protection du système activée sur le disque système)") : '', msg]);
  if (rp.r === 'failed') return t("{0} Attention : Windows n'a pas pu créer de point de restauration.", [msg]);
  return msg;
}

async function undoTweak(id, bk) {
  const tx = TWEAKS.find((x) => x.id === id);
  if (!tx || !tx.undo || bk[id] === undefined) throw new Error(t("Rien à annuler."));
  await tx.undo(bk);
  delete bk[id];
  return t("Réglage d'origine restauré.");
}

module.exports = { listTweaks, applyTweak, undoTweak, scanTemp, walk, ensureRestorePoint, restoreInfo };
