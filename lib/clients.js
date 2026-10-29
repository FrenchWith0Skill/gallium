'use strict';
const { t } = require('./i18n');
// Fiches clients : chaque rapport enregistré est rangé sous le nom du client (ou la référence), avec un
// résumé chiffré pour comparer deux passages (avant / après intervention, ou deux PC du même client).

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const clientKey = (meta) => norm(meta.client) || (meta.ref ? 'ref:' + norm(meta.ref) : 'sans-nom');
const bench = (analysis, id) => { const b = analysis && (analysis.benchmarks || []).find((x) => x.id === id); return b ? b.value : null; };

// Résumé d'un rapport : uniquement des valeurs simples, pour l'historique et la comparaison.
function summarize({ hw, analysis, health, stress, gpuStress }) {
  const comps = (hw.perf && hw.perf.components) || [];
  return {
    hostname: hw.os.hostname || null,
    machine: [hw.system.manufacturer, hw.system.model].filter(Boolean).join(' ') || null,
    cpu: hw.cpu.brand || null,
    gpu: (hw.gpus[0] && hw.gpus[0].name) || null,
    ramGb: hw.ram.totalGb || null,
    serial: (health && health.identity && health.identity.biosSerial) || null,
    usages: (hw.perf && hw.perf.usages || []).map((u) => ({ id: u.id, label: u.label, score: u.score })),
    components: comps.map((c) => ({ id: c.id, label: c.label, score: c.score })),
    health: health ? { at: health.finishedAt, counts: health.counts, bad: health.components.filter((c) => c.status === 'bad').map((c) => c.label),
      warn: health.components.filter((c) => c.status === 'warn').map((c) => c.label), bsods: (health.minidumps || []).length } : null,
    analysis: analysis ? { at: analysis.finishedAt, mode: analysis.mode, score: analysis.score,
      diskWrite: bench(analysis, 'disk-write'), diskRead: bench(analysis, 'disk-read'), cpuSustain: bench(analysis, 'cpu-sustain') } : null,
    stress: stress ? { at: stress.finishedAt, cpu: stress.cpu !== false, status: stress.status, ratio: stress.ratio, avgMops: stress.avgMops,
      maxCpuTemp: stress.maxCpuTemp, ramErrors: stress.ram ? stress.ram.errors : null } : null,
    gpuStress: gpuStress ? { at: gpuStress.finishedAt, status: gpuStress.status, ratio: gpuStress.ratio, avgFps: gpuStress.avgFps, maxTemp: gpuStress.maxTemp } : null,
  };
}

// Ajoute un rapport à la fiche du client (créée au besoin). Renvoie l'entrée ajoutée.
function addReport(db, meta, entry) {
  const key = clientKey(meta);
  let c = db.clients.find((x) => x.key === key);
  if (!c) { c = { key, name: meta.client || (meta.ref ? t("Réf. {0}", [meta.ref]) : t("Sans nom")), reports: [] }; db.clients.push(c); }
  if (meta.client) c.name = meta.client;
  c.reports.push(entry);
  c.updatedAt = entry.at;
  if (c.reports.length > 200) c.reports.splice(0, c.reports.length - 200);
  return entry;
}

// Vue pour l'interface : clients du plus récent au plus ancien, avec le nombre de PC distincts.
function listClients(db) {
  return db.clients.map((c) => ({
    key: c.key, name: c.name, updatedAt: c.updatedAt,
    pcs: new Set(c.reports.map((r) => r.summary.serial || r.summary.hostname)).size,
    reports: [...c.reports].reverse(),
  })).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

module.exports = { summarize, addReport, listClients, clientKey };
