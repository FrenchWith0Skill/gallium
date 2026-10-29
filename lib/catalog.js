'use strict';
const { t } = require('./i18n');
// Catalogue consultable de la base de composants : nom lisible, score, FPS par jeu et description.
// Un processeur est évalué avec une carte graphique très puissante (RTX 4090) pour que ce soit lui qui limite,
// et une carte graphique avec un processeur très puissant (Ryzen 7 9800X3D).
const { GAMES, RES } = require('./db');
const { estimateGame, dispGpu, verdictOf } = require('./scoring');
const hwdb = require('./hwdb');

const REF_GPU = { raw: 76, vramGb: 24, label: t("NVIDIA GeForce RTX 4090") };
const REF_CPU = { gaming: 100, label: t("AMD Ryzen 7 9800X3D") };

const cap = (s) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const upSuffix = (s) => String(s || '').toUpperCase();

// ---------------------------------------------------------------------------
// Noms lisibles
// ---------------------------------------------------------------------------
function cpuName(key) {
  let m;
  if ((m = key.match(/^i([3579])-(\d+)([a-z0-9]*)$/))) return t("Intel Core i{0}-{1}{2}", [m[1], m[2], upSuffix(m[3])]);
  if ((m = key.match(/^u([3579])-(\d+)([a-z]*)$/))) return t("Intel Core Ultra {0} {1}{2}", [m[1], m[2], upSuffix(m[3])]);
  if ((m = key.match(/^c([357])-(\d+)([a-z]*)$/))) return t("Intel Core {0} {1}{2}", [m[1], m[2], upSuffix(m[3])]);
  if ((m = key.match(/^r([3579])-(\d+)([a-z0-9]*)$/))) return t("AMD Ryzen {0} {1}{2}", [m[1], m[2], upSuffix(m[3])]);
  if ((m = key.match(/^ai([579])-(\d+)$/))) return t("AMD Ryzen AI {0} HX {1}", [m[1], m[2]]);
  if ((m = key.match(/^fx-(\d+)$/))) return t("AMD FX-{0}", [m[1]]);
  if ((m = key.match(/^athlon-(\d+)([a-z]*)$/))) return t("AMD Athlon {0}{1}", [m[1], upSuffix(m[2])]);
  if ((m = key.match(/^(e[35])-(\d+)(v\d)?$/))) return t("Intel Xeon {0}-{1}{2}", [upSuffix(m[1]), m[2], m[3] ? ' ' + m[3] : '']);
  if ((m = key.match(/^([gn])(\d+)$/))) return m[1] === 'g' ? t("Intel Pentium G{0}", [m[2]]) : t("Intel {0}", [m[2] < 1000 ? 'N' + m[2] : t("Celeron / Pentium N") + m[2]]);
  if ((m = key.match(/^j(\d+)$/))) return t("Intel Celeron J{0}", [m[1]]);
  return key;
}

function gpuName(key) {
  const laptop = / laptop$/.test(key);
  const k = key.replace(/ laptop$/, '');
  let n;
  let m;
  if ((m = k.match(/^rtx (a\d{4})$/))) n = t("NVIDIA RTX {0}", [m[1].toUpperCase()]);
  else if ((m = k.match(/^rtx (\d{4}) ada$/))) n = t("NVIDIA RTX {0} Ada", [m[1]]);
  else if ((m = k.match(/^quadro (.+)$/))) n = t("NVIDIA Quadro {0}", [m[1].toUpperCase()]);
  else if ((m = k.match(/^nvidia (t\d+)$/))) n = `NVIDIA ${m[1].toUpperCase()}`;
  else if ((m = k.match(/^radeon pro (.+)$/))) n = t("AMD Radeon Pro {0}", [m[1].toUpperCase()]);
  else if ((m = k.match(/^(rtx|gtx|gt) (.+)$/))) n = t("NVIDIA GeForce {0} {1}", [m[1].toUpperCase(), cap(m[2]).replace(/\bTi\b/g, 'Ti').replace(/\bSuper\b/g, 'SUPER')]);
  else if ((m = k.match(/^titan (.+)$/))) n = t("NVIDIA Titan {0}", [m[1].toUpperCase()]);
  else if ((m = k.match(/^mx(\d+)$/))) n = t("NVIDIA GeForce MX{0}", [m[1]]);
  else if ((m = k.match(/^rx (.+)$/))) n = t("AMD Radeon RX {0}", [m[1].toUpperCase()]);
  else if ((m = k.match(/^(r[79]) (.+)$/))) n = t("AMD Radeon {0} {1}", [m[1].toUpperCase(), m[2].toUpperCase()]);
  else if (k === 'radeon vii') n = t("AMD Radeon VII");
  else if ((m = k.match(/^vega (\d+)$/))) n = Number(m[1]) >= 56 ? t("AMD Radeon RX Vega {0}", [m[1]]) : t("AMD Radeon Vega {0} (intégré)", [m[1]]);
  else if ((m = k.match(/^radeon (\d+[ms])$/))) n = t("AMD Radeon {0} (intégré)", [m[1].toUpperCase()]);
  else if (k === 'radeon graphics') n = t("AMD Radeon Graphics (intégré)");
  else if ((m = k.match(/^arc ([ab]\d+m?)$/))) n = t("Intel Arc {0}", [m[1].toUpperCase()]);
  else if ((m = k.match(/^arc (1[34]0v)$/))) n = t("Intel Arc {0} (intégré)", [m[1].toUpperCase()]);
  else if (k === 'arc graphics') n = t("Intel Arc Graphics (intégré)");
  else if ((m = k.match(/^iris (.+)$/))) n = t("Intel Iris {0} (intégré)", [cap(m[1])]);
  else if ((m = k.match(/^uhd (\d+)$/))) n = t("Intel UHD Graphics {0}", [m[1]]);
  else if (k === 'uhd graphics') n = t("Intel UHD Graphics");
  else if ((m = k.match(/^hd (\d+)$/))) n = t("Intel HD Graphics {0}", [m[1]]);
  else if (k === 'hd graphics') n = t("Intel HD Graphics");
  else n = k;
  return laptop ? `${n} (portable)` : n;
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------
const INTEL_YEAR = { 2: 2011, 3: 2012, 4: 2013, 6: 2015, 7: 2017, 8: 2017, 9: 2018, 10: 2020, 11: 2021, 12: 2021, 13: 2022, 14: 2023 };
const AMD_YEAR = { 1: 2017, 2: 2018, 3: 2019, 4: 2020, 5: 2020, 6: 2022, 7: 2022, 8: 2024, 9: 2024 };
const SEG_LABEL = { desktop: t("PC de bureau"), hx: t("portable très performant"), h: t("portable performant"), p: t("portable polyvalent"), u: t("portable basse consommation") };

// Paliers des cartes graphiques (échelle d'affichage : RTX 4060 ≈ 50).
function gpuTier(score) {
  if (score >= 80) return t("Très haut de gamme");
  if (score >= 62) return t("Haut de gamme");
  if (score >= 45) return t("Milieu de gamme");
  if (score >= 25) return t("Entrée de gamme");
  return t("Usage léger");
}

function tierLabel(score) {
  if (score >= 85) return t("Très haut de gamme");
  if (score >= 70) return t("Haut de gamme");
  if (score >= 50) return t("Milieu de gamme");
  if (score >= 30) return t("Entrée de gamme");
  return t("Bureautique / usage léger");
}

function cpuDescription(e) {
  const parts = [];
  let year = null;
  if (e.family === 'core') year = INTEL_YEAR[e.gen];
  else if (e.family === 'ultra') year = e.gen === 1 ? 2023 : 2024;
  else if (e.family === 'ryzen') year = AMD_YEAR[e.gen];
  else if (e.family === 'ryzen-ai') year = 2024;
  const seg = hwdb.segmentOf(e);
  parts.push(t("{0} pour {1}{2}, {3} threads.", [tierLabel((e.gaming + e.prod) / 2), SEG_LABEL[seg] || 'PC', year ? ` (${year})` : '', e.threads]));
  if (e.gaming - e.prod >= 20) parts.push(t("Très bon en jeu, plus juste pour le rendu, le montage et le multitâche lourd."));
  else if (e.prod - e.gaming >= 8) parts.push(t("Taillé pour le multitâche : montage, rendu 3D, compilation, stream en x264."));
  else if (e.gaming >= 70) parts.push(t("Équilibré, à l'aise en jeu comme en création."));
  else if (e.gaming >= 45) parts.push(t("Suffisant pour la plupart des jeux, limité dans les titres très gourmands en CPU."));
  else if (e.gaming >= 25) parts.push(t("Convient au jeu léger et compétitif ; bride les cartes graphiques récentes."));
  else parts.push(t("Bureautique, web et vidéo ; les jeux récents seront difficiles."));
  if (/x3d/.test(e.suffix || '')) parts.push(t("Cache 3D V-Cache : un atout majeur en jeu."));
  return parts.join(' ');
}

function gpuDescription(key, raw, vram, fpsAvg, kind) {
  const d = dispGpu(raw);
  const parts = [`${gpuTier(d)}${kind === 'igpu' ? t(" (graphique intégré au processeur)") : kind === 'laptop' ? t(" pour portable") : kind === 'pro' ? t(", carte professionnelle (pilotes certifiés CAO / 3D, calcul)") : ''}${vram ? t(", {0} Go de VRAM", [vram]) : ''}.`];
  if (fpsAvg >= 144) parts.push(t("Vise la 1440p voire la 4K, ou le très haut taux de rafraîchissement en 1080p."));
  else if (fpsAvg >= 90) parts.push(t("À l'aise en 1440p, très fluide en 1080p."));
  else if (fpsAvg >= 60) parts.push(t("Idéale pour la 1080p en qualité élevée."));
  else if (fpsAvg >= 40) parts.push(t("1080p en qualité moyenne pour les jeux récents."));
  else if (fpsAvg >= 20) parts.push(t("Jeux compétitifs et anciens en 1080p basse qualité."));
  else parts.push(t("Affichage, vidéo et jeux très légers."));
  if (/^rtx/.test(key)) parts.push(t("DLSS et ray tracing disponibles."));
  else if (/^rx [6-9]\d{3}/.test(key)) parts.push(t("FSR et ray tracing disponibles."));
  else if (/^arc [ab]/.test(key)) parts.push(t("XeSS et ray tracing disponibles."));
  if (vram && vram <= 4 && kind !== 'igpu' && d >= 25) parts.push(t("VRAM juste pour les jeux récents."));
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// FPS
// ---------------------------------------------------------------------------
const geoMean = (arr) => Math.round(Math.exp(arr.reduce((s, v) => s + Math.log(Math.max(1, v)), 0) / (arr.length || 1)));

function fpsFor(gpuRaw, vramGb, integrated, cpuGaming, opts) {
  const perf = {
    gpu: { raw: gpuRaw, disp: dispGpu(gpuRaw), vramGb: vramGb || null, integrated: !!integrated },
    cpu: { gaming: cpuGaming },
    ram: { gb: 32, singleChannel: false },
  };
  const fps = {};
  const limit = {};
  for (const g of GAMES) { const e = estimateGame(g, perf, opts); fps[g.id] = e.fps; limit[g.id] = e.limit; }
  return { fps, limit, fpsAvg: geoMean(Object.values(fps)) };
}

// Composant associé pour calculer les FPS : celui choisi par l'utilisateur, sinon la référence très puissante.
function partnerCpu(key) {
  if (!key) return { gaming: REF_CPU.gaming, label: REF_CPU.label, key: null };
  const v = hwdb.CPUS.get(key) || hwdb.CPUS.get(String(key).replace(/f$/, ''));
  if (v) return { gaming: v.gaming, label: cpuName(hwdb.CPUS.has(key) ? key : String(key).replace(/f$/, '')), key };
  const r = hwdb.lookupCpu(cpuName(key));
  return { gaming: r.gaming, label: cpuName(key), key };
}
function partnerGpu(key) {
  if (!key) return { raw: REF_GPU.raw, vram: REF_GPU.vramGb, integrated: false, label: REF_GPU.label, key: null };
  const p = hwdb.parseGpu(key) || {};
  const raw = hwdb.GPUS.has(key) ? hwdb.GPUS.get(key) : hwdb.lookupGpu(key).raw;
  return { raw, vram: hwdb.GPU_VRAM.get(key) || null, integrated: p.line === 'igpu', label: gpuName(key), key };
}

// ---------------------------------------------------------------------------
// Catalogue complet (mis en cache par résolution / qualité / composant associé)
// ---------------------------------------------------------------------------
const cache = new Map();

function buildCatalog(opts = {}) {
  const o = { res: RES[opts.res] ? opts.res : '1080', quality: opts.quality || 'high' };
  const pc = partnerCpu(opts.pairCpu);
  const pg = partnerGpu(opts.pairGpu);
  const ck = `${o.res}-${o.quality}-${pc.key}-${pg.key}`;
  if (cache.has(ck)) return cache.get(ck);
  if (cache.size > 12) cache.clear();

  const cpus = hwdb.getCpuEntries().map((e) => {
    const score = Math.round((e.gaming + e.prod) / 2);
    const { fps, limit, fpsAvg } = fpsFor(pg.raw, pg.vram, pg.integrated, e.gaming, o);
    const seg = hwdb.segmentOf(e);
    return {
      key: e.key, name: cpuName(e.key), cat: 'cpu', sub: seg === 'desktop' ? 'desktop' : 'laptop',
      score, verdict: verdictOf(score), gaming: e.gaming, prod: e.prod, threads: e.threads,
      fps, limit, fpsAvg, desc: cpuDescription(e),
    };
  });

  const gpus = [];
  for (const [key, raw] of hwdb.GPUS) {
    const p = hwdb.parseGpu(key) || {};
    const kind = p.line === 'igpu' ? 'igpu' : p.line === 'pro' ? 'pro' : p.laptop ? 'laptop' : 'desktop';
    const vram = hwdb.GPU_VRAM.get(key) || null;
    const { fps, limit, fpsAvg } = fpsFor(raw, vram, kind === 'igpu', pc.gaming, o);
    const score = dispGpu(raw);
    gpus.push({
      key, name: gpuName(key), cat: 'gpu', sub: kind, score, verdict: verdictOf(score), raw, vram,
      fps, limit, fpsAvg, desc: gpuDescription(key, raw, vram, fpsAvg, kind),
    });
  }
  cpus.sort((a, b) => b.score - a.score);
  gpus.sort((a, b) => b.score - a.score);
  const res = {
    opts: o, resLabel: RES[o.res].label,
    games: GAMES.map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
    refGpu: REF_GPU.label, refCpu: REF_CPU.label, pairCpu: pc.key ? pc.label : null, pairGpu: pg.key ? pg.label : null,
    cpuPartner: pc.label, gpuPartner: pg.label, cpus, gpus,
  };
  cache.set(ck, res);
  return res;
}

// ---------------------------------------------------------------------------
// Composant absent de la base : estimation à partir du texte recherché
// (« RTX 4065 », « Ryzen 5 7545U », « carte graphique 12 Go », « i5-13420H 12 threads »…).
// ---------------------------------------------------------------------------
function estimateQuery(query, opts = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return null;
  const o = { res: RES[opts.res] ? opts.res : '1080', quality: opts.quality || 'high' };
  const pcp = partnerCpu(opts.pairCpu);
  const pgp = partnerGpu(opts.pairGpu);
  const vramM = q.match(/(\d+(?:[.,]\d+)?)\s*(go|gb|gio)\b/i);
  const vram = vramM ? Number(vramM[1].replace(',', '.')) : null;
  const threadsM = q.match(/(\d+)\s*(threads?|thread|t\b)/i);
  const coresM = q.match(/(\d+)\s*(c[œo]eurs?|cores?)/i);
  const threads = threadsM ? Number(threadsM[1]) : coresM ? Number(coresM[1]) * 2 : null;

  // Processeur reconnu par son nom
  const pc = hwdb.parseCpu(/intel|amd|ryzen|core|pentium|celeron|xeon|athlon|fx/i.test(q) ? q : `intel amd ${q}`);
  if (pc) {
    const r = hwdb.lookupCpu(q.match(/intel|amd/i) ? q : (/^r\d|ryzen/i.test(q) ? `AMD ${q}` : t("Intel {0}", [q])), { cores: threads });
    const score = Math.round((r.gaming + r.prod) / 2);
    const { fps, limit, fpsAvg } = fpsFor(pgp.raw, pgp.vram, pgp.integrated, r.gaming, o);
    return {
      cat: 'cpu', name: cpuName(pc.key), key: pc.key, estimated: r.estimated, source: r.source,
      score, verdict: verdictOf(score), gaming: r.gaming, prod: r.prod, threads, fps, limit, fpsAvg,
      desc: cpuDescription({ ...pc, gaming: r.gaming, prod: r.prod, threads: threads || '?' }).replace(', ? threads', ''),
    };
  }

  // Carte graphique reconnue par son nom, ou décrite par sa VRAM
  const pg = hwdb.parseGpu(q);
  const gpuWords = /gpu|carte|graphique|geforce|radeon|rtx|gtx|\brx\b|arc|vram/i.test(q);
  if (pg || (vram && gpuWords)) {
    const laptop = /portable|laptop|mobile/i.test(q);
    const r = hwdb.lookupGpu(q, null, laptop, vram);
    if (!pg && !vram) return null;
    if (pg && r.unknown && !vram) {
      // Nom de carte reconnu mais impossible à situer : on demande la VRAM.
      return { cat: 'gpu', name: q, needVram: true };
    }
    const kind = pg && pg.line === 'igpu' ? 'igpu' : laptop || (pg && pg.laptop) ? 'laptop' : 'desktop';
    const v = vram || (pg && hwdb.GPU_VRAM.get(pg.key)) || null;
    const { fps, limit, fpsAvg } = fpsFor(r.raw, v, kind === 'igpu', pcp.gaming, o);
    const score = dispGpu(r.raw);
    return {
      cat: 'gpu', name: pg ? gpuName(pg.key) : t("Carte graphique {0} Go", [v]), key: pg ? pg.key : null, estimated: r.estimated, source: r.source,
      score, verdict: verdictOf(score), raw: r.raw, vram: v, fps, limit, fpsAvg, desc: gpuDescription(pg ? pg.key : '', r.raw, v, fpsAvg, kind),
    };
  }
  return null;
}

module.exports = { buildCatalog, estimateQuery, cpuName, gpuName };
