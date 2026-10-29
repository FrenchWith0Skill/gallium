'use strict';
const { t } = require('./i18n');
// Analyses « rapide » et « complète » : réglages Windows, matériel, mesures de performance.
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const si = require('systeminformation');
const { run, ps, psJson, regGet } = require('./sys');
const { pingStats } = require('./health');
const { walk } = require('./tweaks');
const { GAMES } = require('./db');
const { estimateGame, adviceFor, resFromDisplay } = require('./scoring');
const { RES } = require('./db');

const isWin = process.platform === 'win32';
const PENALTY = { bad: 12, warn: 6, info: 2, ok: 0 };
const GUID = {
  ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
  high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a',
};

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------
const WORKER_SRC = `
const { parentPort, workerData } = require('worker_threads');
const durationMs = workerData.durationMs;
const start = Date.now();
const buckets = new Array(Math.ceil(durationMs / 1000) + 1).fill(0);
let x = 123456789, acc = 0;
for (;;) {
  for (let i = 0; i < 200000; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; acc += Math.sqrt((x >>> 0) % 1000 + 1); }
  const el = Date.now() - start;
  if (el >= durationMs) break;
  buckets[Math.floor(el / 1000)] += 200000;
}
parentPort.postMessage({ buckets, acc });
`;

function runWorkers(count, durationMs) {
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(new Promise((resolve, reject) => {
      const w = new Worker(WORKER_SRC, { eval: true, workerData: { durationMs } });
      w.once('message', (m) => resolve(m.buckets));
      w.once('error', reject);
    }));
  }
  return Promise.all(jobs).then((all) => {
    const len = Math.max(...all.map((b) => b.length));
    const sum = new Array(len).fill(0);
    for (const b of all) b.forEach((v, i) => { sum[i] += v; });
    return sum;
  });
}

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

async function cpuBench(emit) {
  emit(t("Test du processeur (1 cœur)…"));
  const single = await runWorkers(1, 3000);
  const singleMops = mean(single.slice(0, 3)) / 1e6;

  const threads = os.cpus().length;
  emit(t("Test du processeur ({0} threads, ~10 s)…", [threads]));
  const tempBefore = await si.cpuTemperature().catch(() => null);
  const multi = await runWorkers(threads, 10000);
  const tempAfter = await si.cpuTemperature().catch(() => null);
  const first = mean(multi.slice(1, 4));
  const last = mean(multi.slice(7, 10));
  return {
    singleMops: Math.round(singleMops * 10) / 10,
    multiMops: Math.round((mean(multi.slice(0, 10)) / 1e6) * 10) / 10,
    ratio: first > 0 ? last / first : 1,
    threads,
    tempBefore: tempBefore && tempBefore.main > 0 ? Math.round(tempBefore.main) : null,
    tempAfter: tempAfter && tempAfter.main > 0 ? Math.round(tempAfter.main) : null,
  };
}

// Relecture séquentielle sans le cache de Windows (FILE_FLAG_NO_BUFFERING, blocs de 8 Mo alignés) :
// sans cela, le fichier tout juste écrit serait relu depuis la RAM. Ouvrir le fichier sans cache vide aussi
// ce qu'il en reste dans le cache.
const PS_READ = (file) => `
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
public static class GalliumRead {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern SafeFileHandle CreateFileW(string n, uint a, uint s, IntPtr sa, uint c, uint f, IntPtr t);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadFile(SafeFileHandle h, IntPtr b, int n, out int r, IntPtr o);
  [DllImport("kernel32.dll")] static extern IntPtr VirtualAlloc(IntPtr a, UIntPtr s, uint t, uint p);
  [DllImport("kernel32.dll")] static extern bool VirtualFree(IntPtr a, UIntPtr s, uint t);
  public static double Run(string path) {
    SafeFileHandle h = CreateFileW(path, 0x80000000, 1, IntPtr.Zero, 3, 0x20000000 | 0x08000000, IntPtr.Zero);
    if (h.IsInvalid) return -1;
    int size = 8 * 1024 * 1024; IntPtr buf = VirtualAlloc(IntPtr.Zero, (UIntPtr)size, 0x3000, 4);
    long total = 0; int r; var sw = System.Diagnostics.Stopwatch.StartNew();
    while (ReadFile(h, buf, size, out r, IntPtr.Zero) && r > 0) total += r;
    sw.Stop(); VirtualFree(buf, UIntPtr.Zero, 0x8000); h.Dispose();
    return total < size ? -1 : total / 1048576.0 / sw.Elapsed.TotalSeconds;
  }
}
'@
[Math]::Round([GalliumRead]::Run('${file.replace(/'/g, "''")}'))`;

// Écriture séquentielle asynchrone (l'interface reste réactive pendant la mesure), puis relecture du même fichier.
async function diskBench(sizeMB = 512) {
  const dir = os.tmpdir();
  const file = path.join(dir, `gallium-${process.pid}-${Date.now()}.bin`);
  const chunk = crypto.randomBytes(8 * 1024 * 1024);
  const n = sizeMB / 8;
  let fh;
  try {
    fh = await fsp.open(file, 'w');
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) await fh.write(chunk);
    await fh.sync();
    const sec = Number(process.hrtime.bigint() - t0) / 1e9;
    await fh.close();
    fh = null;
    let readMBs = null;
    if (isWin) {
      const out = await ps(PS_READ(file), 60000);
      const v = out ? Number(out.trim().split(/\r?\n/).pop()) : NaN;
      if (Number.isFinite(v) && v > 0) readMBs = v;
    }
    return { writeMBs: Math.round(sizeMB / sec), readMBs, drive: path.parse(dir).root || dir };
  } catch {
    return null;
  } finally {
    try { if (fh) await fh.close(); } catch { /* déjà fermé */ }
    try { await fsp.unlink(file); } catch { /* fichier absent */ }
  }
}

function ramBench() {
  try {
    const size = 128 * 1024 * 1024;
    const a = Buffer.alloc(size, 7);
    const b = Buffer.allocUnsafe(size);
    b.set(a); // chauffe les pages mémoire
    const iters = 8;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) b.set(a);
    const sec = Number(process.hrtime.bigint() - t0) / 1e9;
    return { gbs: Math.round(((size * iters) / 1073741824 / sec) * 10) / 10 };
  } catch {
    return null;
  }
}

// Taille d'un dossier, avec limite de temps et de profondeur (parcours asynchrone).
async function dirSize(root, deadline) {
  let total = 0;
  await walk(root, { deadline, maxDepth: 6, maxFiles: 80000 }, (_f, st) => { total += st.size; });
  return total;
}

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------
// Encodeur matériel disponible pour OBS selon la carte graphique.
function encoderInfo(gpu, allGpus) {
  const n = gpu.name || '';
  if (gpu.vendor === 'nvidia' && /rtx\s*[45]0\d\d/i.test(n)) return { level: 'ok', name: t("NVENC (8e/9e génération, AV1)"), strong: true };
  if (gpu.vendor === 'nvidia' && /rtx/i.test(n)) return { level: 'ok', name: 'NVENC (Turing / Ampere)', strong: true };
  if (gpu.vendor === 'nvidia' && /gtx\s*16(60|50\s*super)/i.test(n)) return { level: 'ok', name: 'NVENC (Turing)', strong: true };
  if (gpu.vendor === 'nvidia') return { level: 'info', name: t("NVENC (ancienne génération)"), strong: false, note: t("Qualité correcte mais inférieure aux RTX à débit égal : monte le débit ou baisse la résolution du stream.") };
  if (gpu.vendor === 'amd' && /rx\s*(9\d|7\d)\d\d/i.test(n)) return { level: 'ok', name: 'AMD AMF (AV1)', strong: true };
  if (gpu.vendor === 'amd' && !gpu.integrated) return { level: 'info', name: t("AMD AMF (ancienne génération)"), strong: false, note: t("En H.264, la qualité AMF reste moyenne : privilégie 720p60 ou 900p60 sur Twitch.") };
  if (gpu.vendor === 'intel' && !gpu.integrated) return { level: 'ok', name: 'Intel Quick Sync (Arc, AV1)', strong: true };
  if ((allGpus || []).some((g) => /intel/i.test(g.name))) return { level: 'info', name: t("Intel Quick Sync (graphique intégré)"), strong: false, note: t("Utilisable pour décharger le processeur, qualité moyenne.") };
  return { level: 'bad', name: null, strong: false };
}

async function runAnalysis(mode, hw, installedIds, onProgress) {
  const full = mode === 'full';
  const t0 = Date.now();
  const F = [];
  const benchmarks = [];
  const add = (severity, category, title, detail, fix, extra = {}) =>
    F.push({ severity, category, title, detail, fix: fix || null, ...extra });
  const TOTAL = full ? 17 : 12;
  // Les constats « Streaming » sont des conseils : ils ne comptent pas dans le score d'optimisation.
  let done = 0;
  const emit = (label) => { if (onProgress) onProgress({ pct: Math.min(99, Math.round((100 * done) / TOTAL)), label }); };
  const step = (label) => { emit(label); done++; };
  const perf = hw.perf;
  const isLaptop = hw.system.isLaptop;

  // 1. Plan d'alimentation
  step(t("Plan d'alimentation…"));
  if (isWin) {
    const out = await run('powercfg', ['/getactivescheme']);
    const g = out && (out.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) || [])[1];
    const guid = g && g.toLowerCase();
    if (guid === GUID.ultimate || guid === GUID.high) {
      add('ok', 'Windows', t("Plan d'alimentation performant"), t("Windows laisse le processeur monter en fréquence sans le brider."));
    } else if (guid === GUID.saver) {
      add('warn', 'Windows', t("Mode économie d'énergie actif"),
        t("Ce plan bride le processeur et fait chuter les FPS."),
        isLaptop ? t("Branche le secteur et choisis « Performances élevées » ou « Équilibré » pour jouer.") : t("Choisis « Performances élevées » ou « Équilibré » dans les options d'alimentation."),
        { link: 'ms-settings:powersleep', tweak: 'power' });
    } else if (guid === GUID.balanced) {
      add('info', 'Windows', t("Plan « Équilibré » actif"),
        t("Convient à la plupart des usages, mais « Performances élevées » réduit les micro-variations de fréquence en jeu."),
        t("Options d'alimentation → Paramètres d'alimentation supplémentaires → Performances élevées."), { link: 'ms-settings:powersleep', tweak: 'power' });
    } else if (guid) {
      add('info', 'Windows', t("Plan d'alimentation personnalisé"), t("Un plan constructeur ou personnalisé est actif : vérifie qu'il ne bride pas le processeur."), null, { link: 'ms-settings:powersleep' });
    }
  }

  // 2. Mode Jeu, enregistrement en arrière-plan, souris
  step(t("Mode Jeu et captures Xbox…"));
  if (isWin) {
    const gm = await regGet('HKCU\\Software\\Microsoft\\GameBar', 'AutoGameModeEnabled');
    if (gm === 0) {
      add('warn', 'Windows', t("Mode Jeu désactivé"), t("Le mode Jeu donne la priorité au jeu et limite les tâches de fond."),
        t("Paramètres → Jeux → Mode Jeu → Activé."), { link: 'ms-settings:gaming-gamemode', tweak: 'gamemode' });
    } else {
      add('ok', 'Windows', t("Mode Jeu actif"), t("Windows priorise les ressources pour ton jeu."));
    }
    const hist = await regGet('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'HistoricalCaptureEnabled');
    if (hist === 1) {
      add('info', 'Windows', t("Enregistrement en arrière-plan activé"),
        t("La Xbox Game Bar enregistre en continu et consomme du GPU, du disque et un peu de FPS."),
        t("Paramètres → Jeux → Captures → désactive « Enregistrer en arrière-plan pendant que je joue »."), { link: 'ms-settings:gaming-gamedvr', tweak: 'gamedvr' });
    }
    const ms = await regGet('HKCU\\Control Panel\\Mouse', 'MouseSpeed');
    if (ms !== null && String(ms) !== '0') {
      add('info', 'Windows', t("Accélération de la souris activée"),
        t("L'option « Améliorer la précision du pointeur » rend la visée moins régulière dans les FPS."),
        t("Paramètres → Bluetooth et appareils → Souris → Paramètres de souris supplémentaires → Options du pointeur → décoche l'option."),
        { link: 'ms-settings:mousetouchpad', tweak: 'mouse' });
    }
  }

  // 3. Planification GPU
  step(t("Planification GPU…"));
  if (isWin && !perf.gpu.integrated) {
    const hags = await regGet('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode');
    if (hags === 2) {
      add('ok', 'Windows', t("Planification GPU accélérée activée"), t("Réduit la latence et décharge le processeur."));
    } else if (hags === 1) {
      add('info', 'Windows', t("Planification GPU accélérée désactivée"),
        t("Active-la sur les cartes récentes (GTX 16 / RTX / RX 5000 et plus) pour réduire la latence, surtout avec la génération d'images."),
        t("Paramètres → Système → Affichage → Graphiques → Paramètres par défaut → « Planification GPU accélérée par le matériel ». Redémarrage requis."),
        { link: 'ms-settings:display-advancedgraphics' });
    }
  }

  // 4. Démarrage
  step(t("Programmes au démarrage…"));
  if (isWin) {
    const startup = await psJson('Get-CimInstance Win32_StartupCommand | Select-Object Name,Location');
    if (startup) {
      const names = [...new Set(startup.map((s) => s.Name).filter(Boolean))];
      const list = names.slice(0, 10).join(', ') + (names.length > 10 ? '…' : '');
      if (names.length >= 20) {
        add('warn', 'Windows', t("{0} entrées de démarrage détectées", [names.length]),
          t("{0}. Certaines peuvent déjà être désactivées dans le Gestionnaire des tâches.", [list]),
          t("Gestionnaire des tâches → Applications de démarrage : désactive ce dont tu n'as pas besoin au lancement."), { link: 'ms-settings:startupapps' });
      } else if (names.length >= 10) {
        add('info', 'Windows', t("{0} entrées de démarrage détectées", [names.length]),
          t("{0}. Certaines peuvent déjà être désactivées dans le Gestionnaire des tâches.", [list]),
          t("Désactive les applications inutiles au démarrage pour accélérer le boot et libérer de la RAM."), { link: 'ms-settings:startupapps' });
      } else {
        add('ok', 'Windows', t("Peu de programmes au démarrage"), t("{0} entrée(s) : le démarrage reste léger.", [names.length]));
      }
    }
  }

  // 5. Stockage
  step(t("Espace disque et santé des disques…"));
  const sysVol = hw.volumes.find((v) => /^c:/i.test(v.mount)) || hw.volumes.find((v) => v.mount === '/') || hw.volumes[0];
  if (sysVol) {
    const freePct = 100 - sysVol.usedPct;
    if (freePct < 10) {
      add('bad', 'Stockage', t("Disque système presque plein ({0} Go libres)", [sysVol.freeGb]),
        t("Sous 10 % d'espace libre, Windows ralentit et les mises à jour échouent."), t("Libère de la place : désinstalle des jeux, vide les fichiers temporaires."), { link: 'ms-settings:storagesense', tweak: 'temp' });
    } else if (freePct < 20) {
      add('warn', 'Stockage', t("Disque système rempli à {0} %", [sysVol.usedPct]),
        t("Il reste {0} Go. Garde au moins 20 % libre pour de bonnes performances (surtout sur SSD).", [sysVol.freeGb]), t("Déplace des jeux vers un autre disque ou nettoie les fichiers inutiles."), { link: 'ms-settings:storagesense', tweak: 'temp' });
    } else {
      add('ok', 'Stockage', t("Espace disque suffisant"), t("{0} Go libres sur le disque système.", [sysVol.freeGb]));
    }
  }
  const sysDisk = hw.disks.find((d) => d.isSystem);
  if (sysDisk && sysDisk.type === 'HDD') {
    add('bad', 'Stockage', t("Windows est installé sur un disque dur"),
      t("Un disque dur mécanique est 5 à 20 fois plus lent qu'un SSD : démarrage, chargement des jeux et réactivité en pâtissent."),
      t("Passe à un SSD NVMe ou SATA : c'est souvent l'amélioration la plus visible pour le coût."));
  } else if (sysDisk && sysDisk.type !== '?') {
    add('ok', 'Stockage', t("Windows sur {0}", [sysDisk.type]), sysDisk.name);
  }
  for (const d of hw.disks) {
    if (d.health && !/healthy/i.test(d.health)) {
      add('bad', 'Stockage', t("Disque en mauvais état : {0}", [d.name]), t("État signalé : {0}.", [d.health]), t("Sauvegarde tes données immédiatement et envisage de remplacer ce disque."));
    }
  }

  // 6. Mémoire
  step(t("Mémoire vive…"));
  const ramGb = hw.ram.totalGb;
  if (ramGb && ramGb < 8) {
    add('bad', 'Matériel', t("Seulement {0} Go de RAM", [ramGb]), t("Les jeux récents et Windows lui-même seront à l'étroit."), t("Passe à 16 Go minimum (32 Go pour le montage ou la création)."));
  } else if (ramGb && ramGb < 16) {
    add('warn', 'Matériel', t("{0} Go de RAM : juste pour les jeux récents", [ramGb]), t("16 Go sont devenus le minimum confortable ; le montage vidéo en demande 32."), t("Ajoute de la mémoire pour atteindre 16 à 32 Go."));
  } else if (ramGb) {
    add('ok', 'Matériel', t("{0} Go de RAM", [ramGb]), ramGb >= 32 ? t("Confortable pour le jeu, le montage et la création.") : t("Suffisant pour le jeu ; 32 Go aideraient pour le montage et la 3D."));
  }
  if (hw.ram.usedPct !== null && hw.ram.usedPct > 85) {
    add('warn', 'Performance', t("Mémoire utilisée à {0} % en ce moment", [hw.ram.usedPct]), t("Le PC n'a presque plus de marge : le jeu risque de swapper sur le disque."), t("Ferme les applications lourdes (navigateur, launchers) avant de jouer."));
  } else if (hw.ram.usedPct !== null && hw.ram.usedPct > 75) {
    add('info', 'Performance', t("Mémoire utilisée à {0} % en ce moment", [hw.ram.usedPct]), t("Il reste peu de marge pour lancer un jeu en plus."), t("Ferme ce dont tu n'as pas besoin avant de jouer."));
  }
  if (hw.ram.sticks.length === 1 && !isLaptop && hw.ram.sticks[0].sizeGb >= 4) {
    add('warn', 'Matériel', t("Une seule barrette de RAM (simple canal)"),
      t("En simple canal, la bande passante mémoire est divisée par deux : environ 5 à 15 % de FPS en moins, davantage avec un APU."),
      t("Ajoute une barrette identique ({0} Go) dans le bon emplacement pour passer en double canal.", [hw.ram.sticks[0].sizeGb]));
  }
  const slow = hw.ram.sticks.find((s) => s.speed && s.configured && s.configured < s.speed * 0.88);
  if (slow) {
    add('warn', 'Matériel', t("RAM à {0} MHz au lieu de {1} MHz", [slow.configured, slow.speed]),
      t("Ta mémoire fonctionne sous sa vitesse nominale : le profil XMP / EXPO / DOCP n'est probablement pas activé."),
      t("Entre dans le BIOS et active XMP (Intel), EXPO (AMD DDR5) ou DOCP (AMD DDR4)."));
  }

  // 7. Pilote graphique, écran
  step(t("Pilote graphique et écran…"));
  const gpuMain = hw.gpus.find((g) => g.name === perf.gpu.name) || hw.gpus[0];
  if (gpuMain && gpuMain.driverDate) {
    const months = (Date.now() - new Date(gpuMain.driverDate).getTime()) / (30.44 * 86400000);
    if (months > 12) {
      add('warn', 'Pilotes', t("Pilote graphique vieux de {0} mois", [Math.round(months)]), t("Version {0} ({1}). Les jeux récents sortent avec des correctifs de performance dans les nouveaux pilotes.", [gpuMain.driverVersion || '?', gpuMain.driverDate]),
        t("Télécharge le dernier pilote sur le site NVIDIA, AMD ou Intel (ou via GeForce Experience / AMD Software)."));
    } else if (months > 6) {
      add('info', 'Pilotes', t("Pilote graphique daté de {0} mois", [Math.round(months)]), t("Version {0} ({1}).", [gpuMain.driverVersion || '?', gpuMain.driverDate]), t("Une mise à jour peut apporter des gains sur les derniers jeux."));
    } else {
      add('ok', 'Pilotes', t("Pilote graphique récent"), t("Version {0} ({1}).", [gpuMain.driverVersion || '?', gpuMain.driverDate]));
    }
  }
  // Écran réglé sous sa fréquence maximale (câble HDMI ancien, réglage Windows oublié…).
  for (const d of hw.displays) {
    if (d.hz && d.maxHz && d.maxHz >= d.hz + 5) {
      add('warn', 'Matériel', t("{0} réglé à {1} Hz au lieu de {2} Hz", [d.model, d.hz, d.maxHz]),
        t("Cet écran peut afficher {0} images par seconde en {1}×{2}, mais Windows l'utilise à {3} Hz : l'image est moins fluide.", [d.maxHz, d.resX, d.resY, d.hz]),
        t("Paramètres → Système → Affichage → sélectionne cet écran → Affichage avancé → choisis la fréquence la plus élevée."), { link: 'ms-settings:display-advanced' });
    }
  }
  const disp = hw.displays.find((d) => d.main) || hw.displays[0];
  if (disp && disp.hz && !(disp.maxHz && disp.maxHz >= disp.hz + 5)) {
    if (disp.hz <= 62 && perf.gpu.raw >= 25 && !(disp.maxHz && disp.maxHz <= disp.hz + 2)) {
      add('info', 'Matériel', t("Écran limité à {0} Hz", [disp.hz]),
        t("Ton GPU peut produire bien plus d'images que ton écran n'en affiche. Vérifie que la fréquence maximale de l'écran est bien sélectionnée."),
        t("Paramètres → Système → Affichage → Affichage avancé → choisis la fréquence d'actualisation la plus élevée."), { link: 'ms-settings:display-advanced' });
    } else if (disp.hz >= 100) {
      add('ok', 'Matériel', t("Écran {0}×{1} à {2} Hz", [disp.resX, disp.resY, disp.hz]), t("Fréquence d'actualisation élevée active."));
    }
  }

  // 8. Système
  step(t("Version de Windows et uptime…"));
  if (hw.os.isWin10) {
    add('warn', 'Windows', t("Windows 10 n'est plus supporté"), t("Le support gratuit de Windows 10 a pris fin en octobre 2025 : plus de correctifs de sécurité ni d'optimisations de jeu récentes."),
      t("Passe à Windows 11 si ton PC est compatible."), { link: 'ms-settings:windowsupdate' });
  } else if (hw.os.isWin11 && Number(hw.os.build) < 26100) {
    add('info', 'Windows', t("Version de Windows 11 ancienne"), t("Build {0}. Les versions anciennes ne reçoivent plus de mises à jour.", [hw.os.build]), t("Lance Windows Update pour passer à la dernière version."), { link: 'ms-settings:windowsupdate' });
  } else if (hw.os.isWin11) {
    add('ok', 'Windows', t("Windows 11 à jour"), t("Build {0}.", [hw.os.build]));
  }
  if (hw.os.uptimeH > 14 * 24) {
    add('info', 'Windows', t("PC allumé depuis {0} jours", [Math.round(hw.os.uptimeH / 24)]), t("Un redémarrage libère la mémoire et applique les mises à jour en attente."), t("Redémarre ton PC (un vrai redémarrage, pas une mise en veille)."));
  }

  // 9. Équilibre matériel + applications gourmandes
  step(t("Équilibre du matériel et applications ouvertes…"));
  const gap = perf.cpu.gaming - perf.gpu.disp;
  if (!perf.gpu.integrated && gap > 28) {
    add('warn', 'Matériel', t("La carte graphique est le maillon faible"),
      t("Ton processeur ({0}/100) est nettement plus fort que ta carte graphique ({1}/100).", [perf.cpu.gaming, perf.gpu.disp]),
      t("Une carte graphique plus puissante est l'amélioration qui aura le plus d'effet en jeu."));
  } else if (gap < -25) {
    add('warn', 'Matériel', t("Le processeur risque de brider la carte graphique"),
      t("Ta carte graphique ({0}/100) est nettement au-dessus de ton processeur ({1}/100).", [perf.gpu.disp, perf.cpu.gaming]),
      t("Dans les jeux compétitifs ou en 1080p, un processeur plus récent débloquerait des FPS."));
  } else if (!perf.gpu.integrated) {
    add('ok', 'Matériel', t("Processeur et carte graphique équilibrés"), t("CPU {0}/100, GPU {1}/100 : pas de gros goulot d'étranglement attendu.", [perf.cpu.gaming, perf.gpu.disp]));
  } else {
    add('warn', 'Matériel', t("Pas de carte graphique dédiée"), t("Seul un graphique intégré a été détecté ({0}). Les jeux récents resteront très limités.", [perf.gpu.name]),
      t("Une carte graphique dédiée (même d'entrée de gamme récente) multiplierait les FPS par 3 à 6."));
  }
  try {
    const procs = await si.processes();
    const byName = new Map();
    for (const p of procs.list || []) {
      if (!p.name || /^(system|idle|registry|memory compression|system idle process)$/i.test(p.name)) continue;
      byName.set(p.name, (byName.get(p.name) || 0) + (p.memRss || 0) / 1024);
    }
    const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).filter(([, mb]) => mb >= 800);
    if (top.length) {
      add('info', 'Performance', t("Applications gourmandes en mémoire"),
        top.map(([n, mb]) => t("{0} ({1} Go)", [n, (mb / 1024).toFixed(1)])).join(', ') + '.',
        t("Ferme-les avant de jouer ou de monter si tu n'en as pas besoin."));
    }
  } catch { /* processus indisponibles */ }

  // 10. Connexion réseau (jeu en ligne et stream)
  {
    step(t("Connexion réseau…"));
    if (isWin) {
      const net = await psJson("$a=Get-NetAdapter -Physical | Where-Object Status -eq 'Up'; $g=Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1; " +
        '[pscustomobject]@{ adapters=@($a | Select-Object InterfaceDescription,LinkSpeed,NdisPhysicalMedium,ifIndex); gw=$(if($g){$g.NextHop}); idx=$(if($g){$g.ifIndex}) }');
      const n = net && net[0];
      const adapters = n ? [].concat(n.adapters || []) : [];
      const main = adapters.find((a) => a.ifIndex === n.idx) || adapters[0];
      if (main) {
        const wifi = Number(main.NdisPhysicalMedium) === 9 || /wi-?fi|wireless|802\.11/i.test(main.InterfaceDescription || '');
        if (wifi) {
          add('info', 'Réseau', t("Connexion en Wi-Fi"),
            t("Le Wi-Fi ajoute de la latence variable et des micro-coupures : en jeu, ça se traduit par du lag ; en stream, par des images perdues."),
            t("Branche le PC en Ethernet (ou en CPL de bonne qualité si la box est loin)."));
        } else {
          add('ok', 'Réseau', t("Connexion filaire ({0})", [main.LinkSpeed || '?']), main.InterfaceDescription || '');
        }
      }
      const p = n && n.gw ? await pingStats(n.gw, 6) : null;
      if (p && p.avg != null && (p.lossPct > 0 || p.jitter > 8 || p.avg > 15)) {
        add('warn', 'Réseau', t("Connexion locale instable"), t("Vers la box : {0} ms en moyenne, gigue {1} ms, {2} % de pertes. Une connexion locale saine est sous 5 ms sans perte.", [p.avg, p.jitter, p.lossPct]),
          t("Rapproche-toi de la box, change de canal Wi-Fi ou passe en Ethernet. Le Diagnostic donne le détail."));
      }
    }
  }

  // 11. Streaming
  {
    step(t("Configuration pour le streaming…"));
    const enc = encoderInfo(perf.gpu, hw.gpus);
    if (enc.name) {
      add(enc.level, 'Streaming', t("Encodeur matériel : {0}", [enc.name]), enc.note || t("La carte graphique encode le stream elle-même : le processeur reste libre pour le jeu."),
        enc.level === 'ok' ? null : t("Dans OBS : Paramètres → Sortie → Encodeur vidéo → choisis l'encodeur matériel."));
    } else {
      add('info', 'Streaming', t("Aucun encodeur matériel"), t("Sans NVENC, AMF ou Quick Sync, OBS doit encoder avec le processeur (x264), ce qui fait chuter les FPS en jeu."),
        t("Une carte graphique NVIDIA RTX ou AMD RX 7000/9000 récente encode le stream sans impact notable."));
    }
    const threads = hw.cpu.cores || 0;
    if (threads && threads < 8) {
      add('info', 'Streaming', t("Processeur à {0} threads", [threads]), t("Jeu + OBS + navigateur + chat : le processeur sature vite, surtout dans les jeux compétitifs."), t("Utilise l'encodeur matériel et ferme les applications inutiles pendant le stream."));
    }
    if (ramGb >= 16 && ramGb < 32) {
      add('info', 'Streaming', t("{0} Go de RAM", [ramGb]), t("Suffisant, mais 32 Go évitent les ralentissements avec plusieurs onglets, Discord et des scènes OBS chargées."));
    }
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const obs = [path.join(pf, 'obs-studio', 'bin', '64bit', 'obs64.exe'), path.join(pf, 'Streamlabs OBS', 'Streamlabs OBS.exe')]
      .find((f) => { try { return fs.existsSync(f); } catch { return false; } });
    if (obs) add('ok', 'Streaming', /streamlabs/i.test(obs) ? t("Streamlabs détecté") : t("OBS Studio détecté"), obs);
    // Réglages de sortie conseillés pour Twitch (débit plafonné à 6 000 kb/s).
    const strong = enc.strong && perf.gpu.disp >= 45;
    const preset = strong ? [t("1080p à 60 i/s"), t("6 000 kb/s"), t("qualité « Qualité » (P5)")]
      : enc.strong || perf.gpu.disp >= 35 ? [t("900p (1600×900) à 60 i/s"), t("6 000 kb/s"), t("qualité équilibrée")] : [t("720p à 60 i/s"), t("4 500 kb/s"), t("préréglage rapide")];
    add('info', 'Streaming', t("Réglages OBS conseillés pour ce PC"),
      t("Sortie {0}, {1}, {2} en {3}. YouTube accepte des débits plus élevés et l'AV1.", [preset[0], preset[1], enc.name || t("x264 « veryfast »"), preset[2]]),
      t("Vérifie que ton débit montant dépasse 1,5 × le débit choisi (speedtest) et lance l'assistant de configuration automatique d'OBS."));
  }

  // ------------------- Analyse complète : mesures -------------------
  let throttled = false;
  if (full) {
    step(t("Test du processeur (≈ 15 s)…"));
    const cpuB = await cpuBench((l) => emit(l));
    benchmarks.push({ id: 'cpu-single', label: t("CPU mono-cœur"), value: cpuB.singleMops, unit: 'Mop/s', note: t("Indicatif : sert à comparer avant/après une modification (BIOS, refroidissement…).") });
    benchmarks.push({ id: 'cpu-multi', label: t("CPU multi-cœur ({0} threads)", [cpuB.threads]), value: cpuB.multiMops, unit: 'Mop/s', note: null });
    const drop = Math.round((1 - cpuB.ratio) * 100);
    benchmarks.push({ id: 'cpu-sustain', label: t("Stabilité sous charge"), value: Math.max(0, Math.min(100, Math.round(cpuB.ratio * 100))), unit: '%', note: t("Performance à la fin du test par rapport au début.") });
    if (cpuB.tempAfter) benchmarks.push({ id: 'cpu-temp', label: t("Température CPU après charge"), value: cpuB.tempAfter, unit: '°C', note: null });
    if (cpuB.ratio < 0.7) {
      throttled = true;
      add('bad', 'Performance', t("Le processeur perd {0} % de performance sous charge", [drop]),
        t("C'est le signe d'une surchauffe (throttling) ou d'une limite de puissance trop basse."),
        t("Nettoie la poussière, vérifie le ventirad et la pâte thermique, et contrôle les limites de puissance dans le BIOS."));
    } else if (cpuB.ratio < 0.85) {
      throttled = true;
      add('warn', 'Performance', t("Le processeur perd {0} % de performance sous charge", [drop]),
        t("Une petite baisse est normale, mais celle-ci suggère un refroidissement ou une alimentation limitants (fréquent sur portable)."),
        t("Vérifie la température, la poussière et le mode d'alimentation. Ferme les autres applications et relance le test pour confirmer."));
    } else {
      add('ok', 'Performance', t("Performance stable sous charge"), t("Le processeur garde {0} % de ses performances après 10 s à fond.", [Math.min(100, Math.round(cpuB.ratio * 100))]));
    }
    if (cpuB.tempAfter && cpuB.tempAfter >= 90) {
      add('warn', 'Performance', t("Processeur à {0} °C sous charge", [cpuB.tempAfter]), t("C'est très chaud : il risque de réduire sa fréquence."), t("Améliore le refroidissement et le flux d'air du boîtier."));
    }
    step(t("Test du disque…"));
    const dB = await diskBench(512);
    if (dB) {
      benchmarks.push({ id: 'disk-write', label: t("Écriture disque ({0})", [dB.drive]), value: dB.writeMBs, unit: 'Mo/s', note: t("Écriture séquentielle de 512 Mo, vidage forcé sur le disque.") });
      if (dB.readMBs) benchmarks.push({ id: 'disk-read', label: t("Lecture disque ({0})", [dB.drive]), value: dB.readMBs, unit: 'Mo/s', note: t("Lecture séquentielle de 512 Mo par blocs de 8 Mo, sans le cache de Windows.") });
      const tx = sysDisk ? sysDisk.type : '?';
      const r = dB.readMBs;
      if (r && tx === 'NVMe' && r < 800) {
        add('warn', 'Stockage', t("Lecture NVMe lente ({0} Mo/s)", [r]), t("Un NVMe devrait dépasser 1 500 Mo/s en lecture séquentielle."), t("Vérifie que le SSD est sur un port M.2 PCIe x4 (pas partagé ou en x2), son pilote et sa température (SSD qui ralentit en chauffant)."));
      } else if (r && tx === 'SSD' && r < 300) {
        add('warn', 'Stockage', t("Lecture SSD lente ({0} Mo/s)", [r]), t("Un SSD SATA devrait approcher 500 Mo/s en lecture."), t("Vérifie le câble et le port SATA (SATA 3, 6 Gb/s) et le mode AHCI dans le BIOS."));
      } else if (r && tx === 'HDD' && r < 60) {
        add('warn', 'Stockage', t("Disque dur lent en lecture ({0} Mo/s)", [r]), t("Un disque dur récent lit plus de 100 Mo/s en séquentiel : celui-ci est peut-être en train de faiblir."), t("Vérifie son état SMART dans le Diagnostic et sauvegarde tes données."));
      } else if (r) {
        add('ok', 'Stockage', t("Vitesse de lecture correcte ({0} Mo/s)", [r]), t("Lecture séquentielle sans cache."));
      }
      if (tx === 'NVMe' && dB.writeMBs < 400) {
        add('warn', 'Stockage', t("Disque NVMe lent ({0} Mo/s)", [dB.writeMBs]), t("Un NVMe devrait dépasser 1 000 Mo/s en écriture séquentielle."), t("Vérifie le pilote NVMe, le port M.2 utilisé (PCIe x4) et l'espace libre du disque."));
      } else if (tx === 'SSD' && dB.writeMBs < 250) {
        add('warn', 'Stockage', t("SSD lent ({0} Mo/s)", [dB.writeMBs]), t("Un SSD SATA devrait approcher 400 Mo/s."), t("Vérifie le câble/port SATA, le mode AHCI dans le BIOS et l'espace libre."));
      } else {
        add('ok', 'Stockage', t("Vitesse d'écriture correcte ({0} Mo/s)", [dB.writeMBs]), t("Mesure sur le dossier temporaire du système."));
      }
    }
    step(t("Test de la mémoire…"));
    const rB = ramBench();
    if (rB) {
      benchmarks.push({ id: 'ram-bw', label: t("Débit mémoire (copie)"), value: rB.gbs, unit: 'Go/s', note: t("Mesure sur un seul thread : indicative.") });
      if (rB.gbs < 4) {
        add('warn', 'Matériel', t("Débit mémoire faible ({0} Go/s)", [rB.gbs]), t("Une valeur aussi basse indique souvent une RAM en simple canal ou sous-cadencée."), t("Vérifie le double canal et active XMP/EXPO dans le BIOS."));
      }
    }

    step(t("Fichiers temporaires…"));
    const deadline = Date.now() + 6000;
    const sizes = await Promise.all([dirSize(os.tmpdir(), deadline), isWin ? dirSize(path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp'), deadline) : 0]);
    const tempBytes = sizes[0] + sizes[1];
    const tempGb = tempBytes / 1073741824;
    benchmarks.push({ id: 'temp', label: t("Fichiers temporaires"), value: Math.round(tempGb * 10) / 10, unit: t("Go"), note: null });
    if (tempGb > 5) {
      add('warn', 'Stockage', t("{0} Go de fichiers temporaires", [tempGb.toFixed(1)]), t("Ils occupent de la place pour rien."), t("Paramètres → Système → Stockage → Fichiers temporaires, ou active l'Assistant de stockage."), { link: 'ms-settings:storagesense', tweak: 'temp' });
    } else if (tempGb > 1) {
      add('info', 'Stockage', t("{0} Go de fichiers temporaires", [tempGb.toFixed(1)]), t("Tu peux les supprimer sans risque."), t("Paramètres → Système → Stockage → Fichiers temporaires."), { link: 'ms-settings:storagesense', tweak: 'temp' });
    }
  }

  // Conseils par jeu (analyse complète)
  let gameReport = [];
  if (full) {
    step(t("Réglages recommandés par jeu…"));
    const res = resFromDisplay(hw);
    const installed = new Set(installedIds || []);
    let list = GAMES.filter((g) => installed.has(g.id));
    let fromInstalled = true;
    if (!list.length) { list = GAMES.filter((g) => g.popular); fromInstalled = false; }
    gameReport = list.map((g) => {
      const est = estimateGame(g, perf, { res, quality: 'high' });
      return {
        id: g.id, name: g.name, installed: installed.has(g.id), res, resLabel: RES[res].label,
        preset: est.preset, presetLabel: est.presetLabel, reaches60: est.reaches60,
        fps: est.fps, limit: est.limit, advice: adviceFor(g, est, perf),
      };
    }).sort((a, b) => a.fps - b.fps);
    gameReport.fromInstalled = fromInstalled;
  }

  // Score
  step(t("Calcul du score…"));
  const penalty = F.filter((f) => f.category !== 'Streaming').reduce((s, f) => s + (PENALTY[f.severity] || 0), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const counts = { bad: 0, warn: 0, info: 0, ok: 0 };
  F.forEach((f) => { counts[f.severity]++; });
  const grade = score >= 90 ? t("Très bien optimisé") : score >= 75 ? t("Bien optimisé") : score >= 55 ? t("Moyennement optimisé") : t("À optimiser");
  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  F.sort((a, b) => order[a.severity] - order[b.severity]);

  if (onProgress) onProgress({ pct: 100, label: t("Terminé") });
  return {
    mode: full ? 'full' : 'quick', finishedAt: new Date().toISOString(), durationMs: Date.now() - t0,
    platform: process.platform, score, grade, counts, findings: F, benchmarks,
    gameReport: { fromInstalled: !!gameReport.fromInstalled, items: [...gameReport] },
    throttled,
  };
}

module.exports = { runAnalysis };
