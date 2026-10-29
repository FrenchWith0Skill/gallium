'use strict';
const { t } = require('./i18n');
// Calcul des scores par usage et estimation des FPS par jeu.
const { GAMES, RES, QUALITY, matchGpu, matchCpu } = require('./db');
const { lookupSsd } = require('./hwdb');

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const avg = (arr) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);

// Les scores GPU bruts (RTX 5090 = 100) sont écrasés pour les cartes milieu de gamme :
// la racine carrée donne une échelle d'affichage plus parlante (RTX 4060 ≈ 50, RX 9070 XT ≈ 73).
const dispGpu = (raw) => Math.round(100 * Math.sqrt(clamp(raw, 0, 100) / 100));

function interp(points, x) {
  if (x <= points[0][0]) return points[0][1] * (x / points[0][0]);
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

const ramScore = (gb) => Math.round(interp([[4, 15], [8, 40], [12, 58], [16, 72], [24, 82], [32, 92], [48, 96], [64, 100]], gb || 0));

function storageScore(type) {
  switch (type) {
    case 'NVMe': return 100;
    case 'SSD': return 72;
    case 'HDD': return 20;
    default: return 55;
  }
}

// Qualité de l'encodeur matériel (NVENC / AMF / QuickSync) pour le stream et le montage.
function encoderScore(name, vendor, integrated) {
  const n = String(name || '');
  if (vendor === 'nvidia') {
    if (/rtx/i.test(n)) return 100;
    if (/gtx\s*16/i.test(n)) return 90;
    return 75;
  }
  if (vendor === 'amd') {
    if (integrated) return 50;
    if (/rx\s*(9\d{3}|7\d{3})/i.test(n)) return 88;
    if (/rx\s*6\d{3}/i.test(n)) return 75;
    return 55;
  }
  if (vendor === 'intel') return /arc\s*[ab]\d/i.test(n) ? 90 : 70;
  return 40;
}

function detectVendor(s) {
  if (/nvidia|geforce/i.test(s)) return 'nvidia';
  if (/amd|radeon|ati\b/i.test(s)) return 'amd';
  if (/intel/i.test(s)) return 'intel';
  return 'inconnu';
}

function pickGpu(hw) {
  let best = null;
  for (const g of hw.gpus || []) {
    const name = g.name || '';
    const m = matchGpu(name, hw.cpu && hw.cpu.brand, !!(hw.system && hw.system.isLaptop), g.vram && g.vram > 4096 ? g.vram / 1024 : null);
    const vendor = detectVendor(name + ' ' + (g.vendor || ''));
    const integrated = m.raw < 12 && !/(rtx|gtx|rx\s*\d|arc\s*[ab]\d)/i.test(name);
    let vramGb = g.vram ? g.vram / 1024 : null;
    // WMI plafonne souvent la VRAM à 4 Go : on ignore la valeur si elle est visiblement fausse.
    if (vramGb && g.vram <= 4096 && m.raw >= 20) vramGb = null;
    const cand = { name, raw: m.raw, estimated: m.estimated, source: m.source, vendor, integrated, vramGb };
    if (!best || cand.raw > best.raw) best = cand;
  }
  if (!best) best = { name: t("Aucun GPU détecté"), raw: 1, estimated: true, vendor: 'inconnu', integrated: true, vramGb: null };
  best.disp = dispGpu(best.raw);
  return best;
}

function verdictOf(score) {
  if (score >= 85) return t("Excellent");
  if (score >= 70) return t("Très bon");
  if (score >= 55) return t("Correct");
  if (score >= 40) return t("Limité");
  return t("Très limité");
}

function makeUsage(id, label, parts) {
  const total = parts.reduce((s, p) => s + p.weight, 0);
  const score = Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / total);
  const weak = parts.filter((p) => p.weight >= 0.2).sort((a, b) => a.score - b.score)[0];
  return {
    id, label, score, verdict: verdictOf(score),
    limit: weak && weak.score < 70 ? weak.label : null,
    limitDetail: weak && weak.score < 70 ? weak.detail : null,
  };
}

function evaluate(hw) {
  const gpu = pickGpu(hw);
  const cpuM = matchCpu(hw.cpu && hw.cpu.brand, hw.cpu);
  const cpu = { ...cpuM, name: hw.cpu && hw.cpu.brand };
  const sticks = (hw.ram && hw.ram.sticks) || [];
  const ramGb = (hw.ram && hw.ram.totalGb) || 0;
  const singleChannel = !hw.system?.isLaptop && sticks.length === 1;
  const ram = { gb: ramGb, score: ramScore(ramGb), singleChannel };
  const sysDisk = (hw.disks || []).find((d) => d.isSystem) || (hw.disks || [])[0];
  const storage = { type: sysDisk ? sysDisk.type : '?', score: storageScore(sysDisk && sysDisk.type) };
  const enc = encoderScore(gpu.name, gpu.vendor, gpu.integrated);

  const gpuPart = { label: t("Carte graphique"), score: gpu.disp, detail: gpu.name };
  const cpuGPart = { label: t("Processeur (jeu)"), score: singleChannel ? cpu.gaming * 0.93 : cpu.gaming, detail: cpu.name };
  const cpuPPart = { label: t("Processeur (multi-cœur)"), score: cpu.prod, detail: cpu.name };
  const ramPart = { label: t("Mémoire vive"), score: ram.score, detail: t("{0} Go", [ramGb]) };
  const stoPart = { label: t("Stockage"), score: storage.score, detail: t("Windows sur {0}", [storage.type === '?' ? t("disque inconnu") : storage.type]) };
  const encPart = { label: t("Encodeur vidéo"), score: enc, detail: gpu.name };

  const usages = [
    makeUsage('gaming', t("Jeu"), [
      { ...gpuPart, weight: 0.55 }, { ...cpuGPart, weight: 0.28 }, { ...ramPart, weight: 0.10 }, { ...stoPart, weight: 0.07 },
    ]),
    makeUsage('video', t("Montage vidéo"), [
      { ...cpuPPart, weight: 0.38 }, { ...ramPart, weight: 0.25 }, { ...gpuPart, weight: 0.17 }, { ...stoPart, weight: 0.15 }, { ...encPart, weight: 0.05 },
    ]),
    makeUsage('stream', 'Streaming', [
      { ...encPart, weight: 0.30 }, { ...cpuPPart, weight: 0.25 }, { ...gpuPart, weight: 0.20 }, { ...cpuGPart, weight: 0.15 }, { ...ramPart, weight: 0.10 },
    ]),
    makeUsage('creation', t("3D / Création / Dev"), [
      { ...cpuPPart, weight: 0.35 }, { ...ramPart, weight: 0.30 }, { ...gpuPart, weight: 0.15 }, { ...stoPart, weight: 0.20 },
    ]),
  ];

  const perf = { gpu, cpu, ram, storage, usages };
  perf.components = componentScores(hw, perf);
  return perf;
}

// ---------------------------------------------------------------------------
// Score de chaque composant (0-100) : ce qu'il vaut aujourd'hui, pas son état de santé.
// ---------------------------------------------------------------------------
const r0 = (v) => Math.round(clamp(v));

// Débit de la mémoire selon sa génération et sa fréquence.
function ramSpeedScore(type, mhz) {
  const tx = String(type || '').toUpperCase();
  if (!mhz) return tx.includes('DDR5') ? 85 : tx.includes('DDR4') ? 60 : tx.includes('DDR3') ? 30 : 50;
  if (tx.includes('DDR5')) return interp([[4000, 70], [4800, 80], [5600, 88], [6000, 94], [6400, 98], [7200, 100]], mhz);
  if (tx.includes('DDR3')) return interp([[1066, 15], [1333, 22], [1600, 30], [2133, 38]], mhz);
  return interp([[2133, 45], [2400, 52], [2666, 60], [3000, 68], [3200, 75], [3600, 82], [4000, 86]], mhz);
}

function displayScore(d) {
  const px = (d.resX || 0) * (d.resY || 0);
  const res = interp([[1280 * 720, 30], [1600 * 900, 45], [1920 * 1080, 60], [2560 * 1080, 68], [2560 * 1440, 80], [3440 * 1440, 86], [3840 * 2160, 95], [5120 * 2880, 100]], px || 1);
  const hzMax = Math.max(d.hz || 0, d.maxHz || 0) || 60;
  const hz = interp([[30, 15], [60, 45], [75, 55], [100, 68], [120, 78], [144, 86], [165, 90], [240, 98], [360, 100]], hzMax);
  return { score: r0(res * 0.5 + hz * 0.5), hzMax, res, hz };
}

function componentScores(hw, perf) {
  const out = [];
  const add = (id, kind, label, score, detail, ref = null) => out.push({ id, kind, label, score: r0(score), verdict: verdictOf(r0(score)), detail, ref });

  // Processeur : moyenne jeu / multi-cœur
  const cpu = perf.cpu;
  add('cpu', 'cpu', t("Processeur"), (cpu.gaming + cpu.prod) / 2, t("Jeu {0}/100 · multi-cœur {1}/100{2}", [Math.round(cpu.gaming), Math.round(cpu.prod), cpu.estimated ? ' · ' + cpu.source : '']));

  // Cartes graphiques (chacune, y compris la secondaire)
  for (const g of hw.gpus || []) {
    const m = matchGpu(g.name, hw.cpu && hw.cpu.brand, !!(hw.system && hw.system.isLaptop), g.vram && g.vram > 4096 ? g.vram / 1024 : null);
    add('gpu-' + g.name, 'gpu', t("Carte graphique"), dispGpu(m.raw), t("Performance en jeu (RTX 5090 = 100){0}", [m.estimated ? ' · ' + m.source : '']), g.name);
  }

  // Mémoire : quantité (65 %) et débit (35 %), pénalité en simple canal
  const ram = hw.ram || {};
  const speed = ramSpeedScore(ram.type, ram.speed);
  let ramS = ramScore(ram.totalGb) * 0.65 + speed * 0.35;
  if (perf.ram.singleChannel) ramS *= 0.85;
  add('ram', 'ram', t("Mémoire"), ramS, t("Quantité {0}/100 · débit {1}/100{2}", [ramScore(ram.totalGb), Math.round(speed), perf.ram.singleChannel ? t(" · simple canal (−15 %)") : '']));

  // Chaque disque : technologie, capacité et état
  for (const d of hw.disks || []) {
    // Génération PCIe reconnue d'après le modèle (NVMe 3.0 / 4.0 / 5.0), sinon note selon la technologie.
    const ssd = d.type === 'NVMe' || d.type === 'SSD' ? lookupSsd(d.name) : null;
    let s = ssd && d.type === 'NVMe' ? ssd.score : { NVMe: 90, SSD: 70, HDD: 25 }[d.type] ?? 50;
    if (d.sizeGb && d.sizeGb < 240) s -= 12; else if (d.sizeGb >= 2000) s += 8; else if (d.sizeGb >= 900) s += 5;
    const bad = d.health && !/healthy/i.test(d.health);
    if (bad) s = Math.min(s, 20);
    add('disk-' + (d.number ?? d.name), 'disk', d.isSystem ? t("Disque système") : t("Disque"), s,
      bad ? t("État signalé : {0}", [d.health]) : (ssd && d.type === 'NVMe' ? t("Très rapide ({0})", [ssd.label]) : { NVMe: t("Très rapide (NVMe)"), SSD: t("Rapide (SSD SATA)"), HDD: t("Lent (disque dur mécanique)") }[d.type] || t("Type inconnu"))
        + (d.sizeGb && d.sizeGb < 240 ? t(" · petite capacité") : ''), d.number ?? d.name);
  }

  // Chaque écran : définition et fréquence maximale
  (hw.displays || []).forEach((d, i) => {
    const { score, res, hz } = displayScore(d);
    const under = d.maxHz && d.hz && d.maxHz >= d.hz + 5;
    add('display-' + i, 'display', t("Écran"), score,
      t("Définition {0}/100 · fluidité {1}/100{2}", [Math.round(res), Math.round(hz), under ? t(" · réglé sous son maximum") : '']), i);
  });

  // Carte mère / plateforme : génération de mémoire et de stockage qu'elle accepte
  const tx = String(ram.type || '').toUpperCase();
  let board = tx.includes('DDR5') ? 88 : tx.includes('DDR4') ? 62 : tx.includes('DDR3') ? 30 : 55;
  if ((hw.disks || []).some((d) => d.type === 'NVMe')) board += 8;
  add('board', 'board', hw.system && hw.system.isLaptop ? t("Ordinateur portable") : t("Carte mère"), board,
    t("Plateforme {0}{1} · estimé d'après la génération du matériel", [tx || t("mémoire inconnue"), (hw.disks || []).some((d) => d.type === 'NVMe') ? t(" + NVMe") : '']));

  // Système : version de Windows
  const os = hw.os || {};
  const b = Number(os.build) || 0;
  const osS = os.isWin11 ? (b >= 26100 ? 95 : b >= 22631 ? 80 : 65) : os.isWin10 ? 35 : 60;
  add('os', 'os', t("Système"), osS, os.isWin11 ? (b >= 26100 ? t("Windows 11 à jour") : t("Windows 11, version ancienne")) : os.isWin10 ? t("Windows 10 : plus de mises à jour de sécurité") : t("Système"));
  return out;
}

// ---------------------------------------------------------------------------
// Estimation de FPS
// ---------------------------------------------------------------------------
function fpsToScore(fps) {
  if (fps <= 15) return 0;
  return clamp(Math.round((100 * Math.log(fps / 15)) / Math.log(144 / 15)));
}

function fpsVerdict(fps) {
  if (fps >= 144) return t("Excellent");
  if (fps >= 90) return t("Très fluide");
  if (fps >= 60) return t("Fluide");
  if (fps >= 40) return t("Jouable");
  if (fps >= 25) return t("Difficile");
  return t("Injouable");
}

function rawEstimate(game, perf, resKey, qualKey) {
  const r = RES[resKey] || RES['1080'];
  const q = QUALITY[qualKey] || QUALITY.high;
  const gpuFps = 60 * Math.pow(Math.max(perf.gpu.raw, 0.1) / game.gpu60, 0.85) * r.fps * q.fps;
  const cpuFps = 60 * Math.pow(Math.max(perf.cpu.gaming, 1) / game.cpu60, 0.8) * (perf.ram.singleChannel ? 0.93 : 1);
  let fps = Math.min(gpuFps, cpuFps, game.cap);
  let limit = fps === game.cap ? 'Moteur' : gpuFps <= cpuFps ? 'GPU' : 'CPU';
  if (perf.ram.gb && perf.ram.gb < game.ram) { fps *= 0.55; limit = 'RAM'; }
  if (!perf.gpu.integrated && perf.gpu.vramGb && perf.gpu.vramGb < game.vram * r.vram * q.vram) { fps *= 0.7; limit = 'VRAM'; }
  fps = Math.max(1, Math.round(fps));
  return { fps, limit, gpuFps: Math.round(gpuFps), cpuFps: Math.round(cpuFps) };
}

function estimateGame(game, perf, opts) {
  const resKey = opts.res || '1080';
  const qualKey = opts.quality || 'high';
  const e = rawEstimate(game, perf, resKey, qualKey);
  // Préréglage conseillé : le plus élevé qui tient 60 FPS à la résolution choisie.
  let preset = 'low';
  let reaches60 = false;
  for (const q of ['ultra', 'high', 'medium', 'low']) {
    if (rawEstimate(game, perf, resKey, q).fps >= 60) { preset = q; reaches60 = true; break; }
  }
  return {
    fps: e.fps, limit: e.limit, gpuFps: e.gpuFps, cpuFps: e.cpuFps,
    score: fpsToScore(e.fps), verdict: fpsVerdict(e.fps),
    preset, presetLabel: QUALITY[preset].label, reaches60,
    need: { gpu: dispGpu(game.gpu60), cpu: game.cpu60, ram: game.ram, vram: game.vram },
    have: { gpu: perf.gpu.disp, cpu: perf.cpu.gaming, ram: perf.ram.gb, vram: perf.gpu.vramGb },
  };
}

function upscalerTip(perf) {
  if (perf.gpu.vendor === 'nvidia' && /rtx/i.test(perf.gpu.name)) return t("Active le DLSS en mode Qualité : +30 à 50 % de FPS pour une perte visuelle minime.");
  if (perf.gpu.vendor === 'nvidia') return t("Active le FSR en mode Qualité (compatible avec les GTX) pour gagner en FPS.");
  if (perf.gpu.vendor === 'amd') return t("Active le FSR en mode Qualité pour gagner 30 à 50 % de FPS.");
  if (perf.gpu.vendor === 'intel') return t("Active le XeSS (ou le FSR) en mode Qualité pour gagner en FPS.");
  return t("Active un upscaler (DLSS / FSR / XeSS) s'il est proposé dans le jeu.");
}

function adviceFor(game, est, perf) {
  const a = [];
  switch (est.limit) {
    case 'GPU':
      a.push(t("Baisse les ombres, les réflexions et le ray tracing en premier : ce sont les réglages qui coûtent le plus au GPU."));
      if (game.kind === 'aaa') a.push(upscalerTip(perf));
      break;
    case 'CPU':
      a.push(t("Réduis la distance d'affichage, la densité de foule/objets et les options de simulation."));
      a.push(t("Ferme le navigateur et les applications en arrière-plan pendant que tu joues."));
      if (perf.cpu.gaming < 60) a.push(t("Un processeur plus récent (idéalement avec beaucoup de cache, comme les Ryzen X3D) serait la meilleure amélioration."));
      break;
    case 'RAM':
      a.push(t("Ce jeu demande {0} Go de RAM : ferme les autres applications ou passe à plus de mémoire.", [game.ram]));
      break;
    case 'VRAM':
      a.push(t("La mémoire vidéo est saturée : baisse la qualité des textures d'un cran."));
      break;
    case 'Moteur':
      a.push(t("Le jeu plafonne autour de {0} FPS : inutile de chercher plus.", [game.cap]));
      break;
    default:
  }
  if (!est.reaches60) a.push(t("Même en Bas, ce jeu reste sous 60 FPS : essaie une résolution plus basse ou un upscaler."));
  return a.concat(game.tips || []).slice(0, 5);
}

function resFromDisplay(hw) {
  const d = (hw.displays || []).find((x) => x.main) || (hw.displays || [])[0];
  const h = d ? d.resY : 1080;
  if (h >= 2000) return '2160';
  if (h >= 1300) return '1440';
  return '1080';
}

function estimateAll(hw, opts, installedIds) {
  const perf = hw.perf || evaluate(hw);
  const installed = new Set(installedIds || []);
  const games = GAMES.map((g) => {
    const est = estimateGame(g, perf, opts);
    return {
      id: g.id, name: g.name, kind: g.kind, popular: !!g.popular, cap: g.cap,
      installed: installed.has(g.id),
      est,
      advice: adviceFor(g, est, perf),
    };
  });
  return { opts, games };
}

module.exports = {
  evaluate, estimateAll, estimateGame, adviceFor, resFromDisplay,
  dispGpu, ramScore, storageScore, encoderScore, fpsToScore, fpsVerdict, verdictOf, avg, componentScores, displayScore,
};
