'use strict';
const { t } = require('./i18n');
// Test de stabilité : processeur à 100 % sur tous les threads pendant plusieurs minutes,
// avec en option une vérification de la RAM (écriture puis relecture de motifs).
const os = require('os');
const si = require('systeminformation');
const { Worker } = require('worker_threads');
const { nvidiaSmi } = require('./health');

const CPU_SRC = `
const { parentPort, workerData } = require('worker_threads');
const start = Date.now();
let x = 2463534242 ^ workerData.seed, acc = 0, ops = 0, sec = 0;
for (;;) {
  for (let i = 0; i < 100000; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; acc += Math.sqrt((x >>> 0) % 1000 + 1); }
  ops += 100000;
  const el = Date.now() - start;
  const s = Math.floor(el / 1000);
  if (s > sec) { parentPort.postMessage({ type: 'ops', sec, ops }); ops = 0; sec = s; }
  if (el >= workerData.durationMs) break;
}
parentPort.postMessage({ type: 'done', acc });
`;

// Remplit la mémoire avec une suite pseudo-aléatoire, puis la relit : toute différence est une erreur de RAM.
const RAM_SRC = `
const { parentPort, workerData } = require('worker_threads');
const start = Date.now();
const CHUNK = 128 * 1024 * 1024;
const views = [];
for (let i = 0; i < Math.floor(workerData.ramMB / 128); i++) {
  try { const b = new ArrayBuffer(CHUNK); views.push(new Uint32Array(b)); } catch { break; }
}
let pass = 0, errors = 0;
while (Date.now() - start < workerData.durationMs && views.length) {
  const seed = (Math.imul(pass + 1, 2654435761) ^ (pass & 1 ? 0xffffffff : 0)) >>> 0;
  for (let k = 0; k < views.length; k++) {
    const v = views[k]; let r = (seed ^ k) >>> 0;
    for (let j = 0; j < v.length; j++) { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; v[j] = r; }
  }
  for (let k = 0; k < views.length; k++) {
    const v = views[k]; let r = (seed ^ k) >>> 0;
    for (let j = 0; j < v.length; j++) { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; if (v[j] !== r) errors++; }
    if (Date.now() - start >= workerData.durationMs) break;
  }
  pass++;
  parentPort.postMessage({ type: 'ram', pass, errors, mb: views.length * 128 });
}
parentPort.postMessage({ type: 'done', mb: views.length * 128 });
`;

let current = null;

function stop() {
  if (current) current.abort();
}

async function runStress({ minutes = 3, ram = true, cpu = true } = {}, hasNvidia, onProgress) {
  if (!cpu) ram = true;
  if (current) throw new Error(t("Un test de stabilité est déjà en cours."));
  const durationMs = Math.max(0.25, Math.min(30, Number(minutes) || 3)) * 60000;
  const threads = os.cpus().length;
  const secs = Math.ceil(durationMs / 1000);
  const ops = new Array(secs + 1).fill(0);
  const temps = [];
  const ramState = { pass: 0, errors: 0, mb: 0 };
  const ramWorkers = [];
  const workers = [];
  const t0 = Date.now();
  let aborted = false;

  // RAM testée : avec le processeur, un quart de la mémoire libre (4 Go max) ; en test mémoire seul,
  // 60 % de la mémoire libre (12 Go max) répartis sur plusieurs threads pour aller plus vite.
  const mem = await si.mem().catch(() => null);
  const share = cpu ? 0.25 : 0.6;
  const ramMB = ram && mem ? Math.min(cpu ? 4096 : 12288, Math.floor((mem.available / 1048576) * share / 128) * 128) : 0;
  const ramThreads = cpu ? 1 : Math.max(1, Math.min(4, Math.floor(threads / 2), Math.floor(ramMB / 128)));

  // Les threads de test passent en priorité basse : l'interface reste fluide, la mesure n'est pas faussée
  // puisque rien d'autre ne réclame le processeur.
  let prevPriority = null;
  try { prevPriority = os.getPriority(); os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* non autorisé */ }

  const finished = new Promise((resolve) => {
    let left = 0;
    const done = () => { if (--left <= 0) resolve(); };
    const spawn = (src, data) => {
      left++;
      const w = new Worker(src, { eval: true, workerData: { durationMs, ...data } });
      w.on('message', (m) => {
        if (m.type === 'ops' && m.sec <= secs) ops[m.sec] += m.ops;
        else if (m.type === 'ram') {
          ramWorkers[data.ramIndex] = m;
          // Passes complètes = celles terminées par tous les threads mémoire.
          const list = ramWorkers.filter(Boolean);
          ramState.pass = list.length === ramThreads ? Math.min(...list.map((x) => x.pass)) : 0;
          ramState.errors = list.reduce((s2, x) => s2 + x.errors, 0);
          ramState.mb = list.reduce((s2, x) => s2 + x.mb, 0);
        }
        else if (m.type === 'done') done();
      });
      w.on('error', done);
      w.on('exit', () => { if (aborted) done(); });
      workers.push(w);
    };
    if (cpu) for (let i = 0; i < threads; i++) spawn(CPU_SRC, { seed: i * 7919 });
    if (ramMB >= 256) {
      // Blocs de 128 Mo répartis entre les threads (ex. 11 blocs → 3 + 3 + 3 + 2).
      const chunks = Math.floor(ramMB / 128);
      for (let i = 0; i < ramThreads; i++) {
        const n = Math.floor(chunks / ramThreads) + (i < chunks % ramThreads ? 1 : 0);
        if (n > 0) spawn(RAM_SRC, { ramMB: n * 128, ramIndex: i });
      }
    }
  });

  current = { abort: () => { aborted = true; workers.forEach((w) => w.terminate()); } };

  // Relevés de température toutes les 3 s, chaque capteur indépendamment (une lecture lente n'en bloque pas une autre).
  const latest = { cpu: null, gpu: null };
  const pending = { cpu: false, gpu: false };
  const read = (key, fn) => {
    if (pending[key]) return;
    pending[key] = true;
    fn().then((v) => { if (v != null) latest[key] = v; }).catch(() => {}).finally(() => { pending[key] = false; });
  };
  let lastTemp = 0;
  const timer = setInterval(() => {
    const el = Date.now() - t0;
    const sec = Math.floor(el / 1000) - 2; // dernière seconde complète reçue de tous les threads
    if (Date.now() - lastTemp >= 3000) {
      lastTemp = Date.now();
      if (latest.cpu != null || latest.gpu != null) temps.push({ sec: Math.floor(el / 1000), cpu: latest.cpu, gpu: latest.gpu });
      // Les processus enfants héritent de la priorité : on lance les lectures en priorité normale.
      const lowered = prevPriority !== null;
      try { if (lowered) os.setPriority(prevPriority); } catch { /* ignoré */ }
      read('cpu', () => si.cpuTemperature().then((tx) => (tx && tx.main > 0 ? Math.round(tx.main) : null)));
      if (hasNvidia) read('gpu', () => nvidiaSmi(15000).then((g) => (g[0] ? g[0].temp : null)));
      try { if (lowered) os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* ignoré */ }
    }
    if (onProgress) {
      onProgress({
        pct: Math.min(99, Math.round((100 * el) / durationMs)), elapsed: Math.floor(el / 1000), total: secs,
        sec, mops: sec >= 0 ? Math.round(ops[sec] / 1e5) / 10 : null, cpuTemp: latest.cpu, gpuTemp: latest.gpu,
        ram: ramMB ? { ...ramState } : null,
      });
    }
  }, 1000);

  try {
    await finished;
  } finally {
    clearInterval(timer);
    current = null;
    try { if (prevPriority !== null) os.setPriority(prevPriority); } catch { /* ignoré */ }
  }

  const elapsed = Math.floor((Date.now() - t0) / 1000);
  const series = ops.slice(0, Math.max(1, Math.min(secs, elapsed))).map((v) => Math.round(v / 1e5) / 10);
  // On compare le début (après 2 s de chauffe) à la fin du test.
  const n = series.length;
  const w = Math.max(2, Math.floor(n * 0.15));
  const meanOf = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const head = meanOf(series.slice(2, 2 + w));
  const tail = meanOf(series.slice(Math.max(2 + w, n - w), n));
  const ratio = head > 0 && n > 2 * w + 2 ? Math.min(1.05, tail / head) : null;
  const sustained = series.slice(2);
  const minV = sustained.length ? Math.min(...sustained) : 0;
  const maxGpu = Math.max(0, ...temps.map((tx) => tx.gpu || 0)) || null;
  const maxCpu = Math.max(0, ...temps.map((tx) => tx.cpu || 0)) || null;

  const issues = [];
  let status = 'ok';
  if (ramState.errors > 0) { status = 'bad'; issues.push(t("{0} erreur(s) mémoire détectée(s) : une barrette est défaillante ou le profil XMP/EXPO est instable.", [ramState.errors])); }
  if (ratio != null && ratio < 0.8) { status = 'bad'; issues.push(t("Le processeur perd {0} % de performance au fil du test : surchauffe ou limite de puissance.", [Math.round((1 - ratio) * 100)])); }
  else if (ratio != null && ratio < 0.9) { if (status === 'ok') status = 'warn'; issues.push(t("Baisse de {0} % sous charge prolongée : refroidissement un peu juste.", [Math.round((1 - ratio) * 100)])); }
  if (maxCpu && maxCpu >= 95) { status = 'bad'; issues.push(t("Processeur à {0} °C : trop chaud.", [maxCpu])); }
  if (head > 0 && minV < head * 0.5) { if (status === 'ok') status = 'warn'; issues.push(t("Chutes ponctuelles de performance : vérifie qu'aucune application lourde ne tournait pendant le test.")); }
  if (aborted && status === 'ok') status = 'info';

  return {
    finishedAt: new Date().toISOString(), aborted, cpu, minutes: Math.round((elapsed / 60) * 10) / 10, threads,
    series, temps, ratio: ratio == null ? null : Math.round(ratio * 100), avgMops: Math.round(meanOf(sustained) * 10) / 10,
    maxCpuTemp: maxCpu, maxGpuTemp: maxGpu,
    ram: ramMB >= 256 ? { mb: ramState.mb || ramMB, passes: ramState.pass, errors: ramState.errors } : null,
    status, issues,
  };
}

module.exports = { runStress, stop };
