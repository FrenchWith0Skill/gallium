'use strict';
// Vérifications de cohérence du moteur de scoring (sans Electron, sans Windows).
const assert = require('assert');
const { matchGpu, matchCpu, GAMES } = require('../lib/db');
const { evaluate, estimateAll } = require('../lib/scoring');

function fakeHw({ cpu, gpu, ramGb, sticks, disk }) {
  return {
    system: { isLaptop: false },
    cpu: { brand: cpu, cores: 16, physicalCores: 8, speedMax: 4.8 },
    gpus: [{ name: gpu, vram: null }],
    ram: { totalGb: ramGb, sticks: Array.from({ length: sticks }, () => ({ sizeGb: ramGb / sticks })) },
    disks: [{ type: disk, isSystem: true }],
    displays: [],
  };
}

const high = evaluate(fakeHw({ cpu: 'AMD Ryzen 7 7800X3D 8-Core Processor', gpu: 'AMD Radeon RX 9070 XT', ramGb: 32, sticks: 2, disk: 'NVMe' }));
const low = evaluate(fakeHw({ cpu: 'Intel Core i3-9100', gpu: 'Intel(R) UHD Graphics 630', ramGb: 8, sticks: 1, disk: 'HDD' }));
const mid = evaluate(fakeHw({ cpu: 'Intel Core i5-12400F', gpu: 'NVIDIA GeForce RTX 3060', ramGb: 16, sticks: 2, disk: 'SSD' }));

// Reconnaissance des composants
assert.strictEqual(matchCpu('AMD Ryzen 7 7800X3D 8-Core Processor').gaming, 92);
assert.strictEqual(matchCpu('Intel(R) Core(TM) i5-12400F').gaming, 62);
assert.strictEqual(matchCpu('Intel(R) Core(TM) i5-9400F').gaming, 42);
assert.strictEqual(matchCpu('Intel Core™ i7-9700').gaming, 47);
assert.ok(!matchCpu('Intel(R) Core(TM) i5-10600').estimated, 'Intel sans K : version K utilisée');
assert.strictEqual(matchCpu('AMD Ryzen 5 5600X 6-Core Processor').gaming, 62);
assert.strictEqual(matchCpu('AMD Ryzen 5 5600 6-Core Processor').gaming, 60);
assert.strictEqual(matchCpu('Intel(R) Core(TM) Ultra 7 265K').gaming, 84);
assert.ok(matchCpu('Processeur inconnu XYZ', { speed: 3, cores: 8 }).estimated);
assert.strictEqual(matchGpu('NVIDIA GeForce RTX 4070 SUPER').raw, 45);
assert.strictEqual(matchGpu('NVIDIA GeForce RTX 4070 Ti SUPER').raw, 54);
assert.strictEqual(matchGpu('NVIDIA GeForce GTX 1650').raw, 8.5);
assert.strictEqual(matchGpu('AMD Radeon RX 9070 XT').raw, 54);
assert.ok(matchGpu('NVIDIA GeForce RTX 4060 Laptop GPU').raw < matchGpu('NVIDIA GeForce RTX 4060').raw);
assert.ok(matchGpu('Carte inconnue').estimated);

// Base de composants : lecture des noms Windows et estimation des modèles absents
const { parseCpu, lookupCpu, lookupGpu } = require('../lib/hwdb');
assert.strictEqual(parseCpu('12th Gen Intel(R) Core(TM) i5-12400F').key, 'i5-12400f');
assert.strictEqual(parseCpu('AMD Ryzen 5 PRO 4650G with Radeon Graphics').key, 'r5-4650g');
assert.strictEqual(parseCpu('AMD FX(tm)-8350 Eight-Core Processor').key, 'fx-8350');
assert.strictEqual(parseCpu('Intel(R) Core(TM) Ultra 7 155H').key, 'u7-155h');
assert.strictEqual(parseCpu('Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz').key, 'e5-2680v4');
const est = lookupCpu('AMD Ryzen 5 5600T 6-Core Processor', { cores: 12 });
assert.ok(est.estimated && est.gaming > 52 && est.gaming < 66, 'Ryzen 5 5600T estimé près du 5600');
const mobile = lookupCpu('Intel(R) Core(TM) i3-7020U CPU @ 2.30GHz', { cores: 4 });
assert.ok(mobile.gaming < lookupCpu('Intel Core i3-7100', { cores: 4 }).gaming, 'portable U sous le bureau');
assert.ok(lookupCpu('Intel(R) Core(TM) i9-15900K', { cores: 32 }).gaming >= 85, 'génération future extrapolée');
assert.strictEqual(lookupGpu('NVIDIA GeForce GTX 860M').raw, 2.4);
assert.ok(lookupGpu('NVIDIA GeForce RTX 3060', null, true).raw < lookupGpu('NVIDIA GeForce RTX 3060').raw, 'RTX 3060 sur portable');
assert.ok(lookupGpu('AMD Radeon(TM) Graphics', 'AMD Ryzen 7 8700G w/ Radeon 780M Graphics').raw === 7, 'graphique intégré d’après le processeur');
assert.ok(lookupGpu('AMD Radeon RX 7750 XT').estimated, 'GPU absent estimé');

// Ordre logique des scores
const g = (p) => p.usages.find((u) => u.id === 'gaming').score;
assert.ok(g(high) > g(mid) && g(mid) > g(low), `scores jeu: ${g(high)} > ${g(mid)} > ${g(low)}`);
for (const id of ['video', 'stream', 'creation']) {
  const s = (p) => p.usages.find((u) => u.id === id).score;
  assert.ok(s(high) > s(low), `usage ${id}`);
}

// Estimations de FPS : monotones avec la résolution et la qualité
const hwHigh = { ...fakeHw({ cpu: 'AMD Ryzen 7 7800X3D', gpu: 'AMD Radeon RX 9070 XT', ramGb: 32, sticks: 2, disk: 'NVMe' }) };
hwHigh.perf = high;
const hwLow = { ...fakeHw({ cpu: 'Intel Core i3-9100', gpu: 'Intel(R) UHD Graphics 630', ramGb: 8, sticks: 1, disk: 'HDD' }) };
hwLow.perf = low;
const fps = (hw, id, res, quality) => estimateAll(hw, { res, quality }, []).games.find((x) => x.id === id).est.fps;

assert.ok(fps(hwHigh, 'cyberpunk', '1080', 'high') > fps(hwHigh, 'cyberpunk', '1440', 'high'));
assert.ok(fps(hwHigh, 'cyberpunk', '1440', 'high') > fps(hwHigh, 'cyberpunk', '2160', 'high'));
assert.ok(fps(hwHigh, 'cyberpunk', '1080', 'low') > fps(hwHigh, 'cyberpunk', '1080', 'ultra'));
assert.ok(fps(hwHigh, 'cyberpunk', '1080', 'high') > fps(hwLow, 'cyberpunk', '1080', 'high'));
assert.ok(fps(hwHigh, 'eldenring', '1080', 'low') <= 60, 'Elden Ring plafonné à 60');
assert.ok(fps(hwLow, 'valorant', '1080', 'low') > 60, 'Valorant jouable sur un PC modeste');
assert.ok(fps(hwLow, 'cyberpunk', '1080', 'high') < 30, 'Cyberpunk injouable sur iGPU');
assert.ok(fps(hwHigh, 'cs2', '1080', 'high') > 200);
assert.strictEqual(GAMES.length, new Set(GAMES.map((x) => x.id)).size, 'identifiants de jeux uniques');

// Diagnostic : décodage des écrans bleus
const { bugcheckInfo } = require('../lib/health');
assert.strictEqual(bugcheckInfo('0x0000001a (0x0000000000041792, 0x0)').name, 'MEMORY_MANAGEMENT');
assert.strictEqual(bugcheckInfo('0x00000124 (0x0, 0x1)').code, '0x00000124');
assert.ok(/RAM|matériel/.test(bugcheckInfo('0x124').suspect));
assert.strictEqual(bugcheckInfo('pas un code'), null);

// Écrans bleus : lecture d'un minidump du noyau (en-tête PAGEDU64 + bloc de triage) fabriqué ici
const { parseMinidump } = require('../lib/health');
function fakeDump({ code, params, drivers, stack, exceptionAddr }) {
  const b = Buffer.alloc(0x6000);
  b.write('PAGEDU64', 0, 'latin1');
  b.writeUInt32LE(code, 0x38);
  params.forEach((p, i) => b.writeBigUInt64LE(p, 0x40 + i * 8));
  b.writeBigUInt64LE(exceptionAddr || 0n, 0xf00 + 0x10);
  b.writeUInt32LE(4, 0xf98); // dump de triage
  b.writeBigUInt64LE(BigInt(Date.UTC(2026, 9, 20, 14, 30)) * 10000n + 116444736000000000n, 0xfa8);
  const T = 0x2000, list = 0x2100, pool = 0x3000, stk = 0x5000;
  b.writeUInt32LE(stk, T + 0x28); b.writeUInt32LE(stack.length * 8, T + 0x2c);
  b.writeUInt32LE(list, T + 0x30); b.writeUInt32LE(drivers.length, T + 0x34);
  let s = pool;
  drivers.forEach((d, i) => {
    const e = list + i * 0x90;
    b.writeUInt32LE(s, e);
    b.writeBigUInt64LE(d.base, e + 8 + 0x30);
    b.writeUInt32LE(d.size, e + 8 + 0x40);
    b.writeUInt32LE(d.name.length, s); b.write(d.name, s + 4, 'utf16le'); s += 4 + d.name.length * 2 + 2;
  });
  stack.forEach((a, i) => b.writeBigUInt64LE(a, stk + i * 8));
  return b;
}
const mods = [
  { name: 'ntoskrnl.exe', base: 0xfffff80000000000n, size: 0x1000000 },
  { name: 'hal.dll', base: 0xfffff80001000000n, size: 0x100000 },
  { name: 'nvlddmkm.sys', base: 0xfffff80010000000n, size: 0x4000000 },
  { name: 'Netwtw10.sys', base: 0xfffff80020000000n, size: 0x400000 },
];
const d1 = parseMinidump(fakeDump({ code: 0x116, params: [0n, 0xfffff80010123456n, 0n, 0n], drivers: mods, stack: [0x1234n, 0xfffff80000001000n] }));
assert.strictEqual(d1.code, '0x00000116');
assert.strictEqual(d1.name, 'VIDEO_TDR_FAILURE');
assert.strictEqual(d1.driver, 'nvlddmkm.sys', 'pilote trouvé dans les paramètres du code d’arrêt');
assert.ok(/NVIDIA/.test(d1.driverHint));
assert.strictEqual(d1.at, '2026-10-20T14:30:00.000Z');
assert.strictEqual(d1.drivers, 4);
const d2 = parseMinidump(fakeDump({ code: 0xd1, params: [0n, 2n, 0n, 0n], drivers: mods, stack: [0xfffff80000002000n, 0x42n, 0xfffff80020000100n] }));
assert.strictEqual(d2.driver, 'Netwtw10.sys', 'pilote trouvé dans la pile, noyau ignoré');
const d3 = parseMinidump(fakeDump({ code: 0x1a, params: [0x41792n, 0n, 0n, 0n], drivers: mods, stack: [0xfffff80000003000n] }));
assert.strictEqual(d3.driver, 'ntoskrnl.exe', 'seul le noyau en cause');
assert.strictEqual(parseMinidump(Buffer.from('MDMP pas un dump noyau'.padEnd(5000, ' '))), null);

// Pilotes : non signés, très anciens, dates fictives de Windows et d'Intel ignorées
const { classify } = require('../lib/drivers');
const drv = classify([
  { N: 'Carte Wi-Fi', V: '1.0', D: '2015-03-01', P: 'Realtek', S: true },
  { N: 'Pilote douteux', V: '0.1', D: '2024-01-01', P: 'Inconnu', S: false },
  { N: 'Clavier HID', V: '10.0', D: '2006-06-21', P: 'Microsoft', S: true },
  { N: 'Chipset Intel', V: '10.1', D: '1968-07-18', P: 'INTEL', S: true },
], Date.UTC(2026, 9, 27));
assert.deepStrictEqual(drv.drivers.map((d) => d.status), ['bad', 'warn', 'ok', 'ok']);
assert.deepStrictEqual([drv.counts.unsigned, drv.counts.old, drv.counts.thirdParty], [1, 1, 3]);

// Fiches clients : regroupement par nom (sans accents ni casse), plusieurs PC
const clients = require('../lib/clients');
const cdb = { clients: [] };
const sum = (host) => clients.summarize({ hw: { ...hwHigh, os: { hostname: host }, system: {}, cpu: { brand: 'CPU' }, gpus: [{ name: 'GPU' }], ram: { totalGb: 16 } },
  analysis: { finishedAt: 'x', mode: 'full', score: 70, benchmarks: [{ id: 'disk-read', value: 500 }] } });
clients.addReport(cdb, { client: 'Société Dupont' }, { id: 'a1', at: '2026-01-01T10:00:00Z', summary: sum('PC-1') });
clients.addReport(cdb, { client: 'societe dupont ' }, { id: 'a2', at: '2026-02-01T10:00:00Z', summary: sum('PC-2') });
clients.addReport(cdb, { ref: 'T-42' }, { id: 'b1', at: '2026-01-15T10:00:00Z', summary: sum('PC-9') });
const cl = clients.listClients(cdb);
assert.strictEqual(cl.length, 2);
assert.strictEqual(cl[0].pcs, 2);
assert.strictEqual(cl[0].reports[0].id, 'a2', 'rapport le plus récent en premier');
assert.strictEqual(cl[0].reports[0].summary.analysis.diskRead, 500);
assert.strictEqual(cl[1].name, 'Réf. T-42');

// Rapport : le contenu saisi est échappé et aucun script n'est inclus
const { buildReport } = require('../lib/report');
const hwR = {
  ...hwHigh, board: {}, displays: [], disks: [],
  os: { distro: 'Windows 11', release: '', build: '26100', arch: 'x64', hostname: 'PC-TEST' },
  cpu: { brand: 'AMD Ryzen 7 7800X3D', cores: 16, physicalCores: 8 },
  ram: { totalGb: 32, sticks: [], type: 'DDR5', speed: 6000 },
};
const html = buildReport({ hw: hwR, meta: { client: '<script>alert(1)</script>', notes: 'a & b' } });
assert.ok(!html.includes('<script>') && html.includes('&lt;script&gt;') && html.includes('a &amp; b'), 'rapport échappé');
const html2 = buildReport({ hw: hwR, meta: {}, drivers: drv,
  gpuStress: { finishedAt: '2026-10-27T10:00:00Z', status: 'warn', minutes: 3, renderer: 'ANGLE (NVIDIA <b>)', avgFps: 31, ratio: 88, maxTemp: 84, issues: ['chaud'] },
  health: { finishedAt: '2026-10-27T10:00:00Z', counts: { bad: 0, warn: 0, ok: 0 }, components: [], minidumps: [{ at: '2026-10-20T14:30:00Z', code: '0x00000116', name: 'VIDEO_TDR_FAILURE', driver: 'nvlddmkm.sys' }] } });
assert.ok(html2.includes('Test de la carte graphique') && html2.includes('nvlddmkm.sys') && html2.includes('Pilote douteux') && !html2.includes('<b>)'), 'rapport : GPU, écrans bleus, pilotes');

// Base de composants consultable
const { buildCatalog, estimateQuery } = require('../lib/catalog');
const cat = buildCatalog({});
assert.ok(cat.cpus.length > 250 && cat.gpus.length > 200, 'catalogue complet');
assert.ok(cat.gpus.every((g) => Object.keys(g.fps).length === GAMES.length && g.fpsAvg > 0), 'FPS pour chaque jeu');
assert.ok(cat.gpus[0].score >= cat.gpus[cat.gpus.length - 1].score, 'tri par score');
assert.strictEqual(estimateQuery('fromage'), null, 'recherche introuvable');
assert.ok(/VRAM/.test(estimateQuery('carte graphique 8 Go').source), 'estimation par la VRAM');
assert.ok(estimateQuery('RTX 9999').needVram, 'VRAM demandée pour une carte inconnue');
assert.ok(estimateQuery('Ryzen 5 7545U').estimated, 'processeur absent estimé');

console.log('Scores (jeu) : haut de gamme', g(high), '| milieu', g(mid), '| entrée', g(low));
for (const [label, hw] of [['Haut de gamme', hwHigh], ['Entrée de gamme', hwLow]]) {
  const rows = ['valorant', 'cs2', 'fortnite', 'cyberpunk', 'wukong', 'minecraft'].map((id) => `${id}=${fps(hw, id, '1080', 'high')}`);
  console.log(`${label} (1080p Élevé) :`, rows.join(', '));
}
console.log('OK : toutes les vérifications passent.');
