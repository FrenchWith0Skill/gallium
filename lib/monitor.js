'use strict';
// Moniteur temps réel : charge CPU / RAM / GPU, températures, réseau et processus les plus actifs.
const si = require('systeminformation');
const { nvidiaSmi } = require('./health');

let tick = 0;
let topProcs = [];
let busy = null;

async function sample(hasNvidia) {
  // Un seul échantillon à la fois : si l'interface redemande pendant une mesure, on renvoie la même.
  if (busy) return busy;
  busy = (async () => {
    const [load, mem, net, temp, smi] = await Promise.all([
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.networkStats().catch(() => null),
      si.cpuTemperature().catch(() => null),
      hasNvidia ? nvidiaSmi() : [],
    ]);
    // La liste des processus est coûteuse : une fois sur trois.
    if (tick++ % 3 === 0) {
      try {
        const p = await si.processes();
        const byName = new Map();
        for (const x of p.list || []) {
          if (!x.name || /^(system idle process|idle)$/i.test(x.name)) continue;
          const cur = byName.get(x.name) || { name: x.name, cpu: 0, memMb: 0, count: 0 };
          cur.cpu += x.cpu || 0;
          cur.memMb += (x.memRss || 0) / 1024;
          cur.count++;
          byName.set(x.name, cur);
        }
        topProcs = [...byName.values()].sort((a, b) => b.cpu - a.cpu || b.memMb - a.memMb).slice(0, 8)
          .map((x) => ({ ...x, cpu: Math.round(x.cpu * 10) / 10, memMb: Math.round(x.memMb) }));
      } catch { /* processus indisponibles */ }
    }
    const n = (net || [])[0];
    const g = smi[0] || null;
    return {
      t: Date.now(),
      cpu: load ? Math.round(load.currentLoad) : null,
      cores: load ? load.cpus.map((c) => Math.round(c.load)) : [],
      cpuTemp: temp && temp.main > 0 ? Math.round(temp.main) : null,
      ramPct: mem ? Math.round(((mem.total - mem.available) / mem.total) * 100) : null,
      ramUsedGb: mem ? Math.round(((mem.total - mem.available) / 1073741824) * 10) / 10 : null,
      ramTotalGb: mem ? Math.round((mem.total / 1073741824) * 10) / 10 : null,
      gpu: g && { name: g.name, util: g.util, temp: g.temp, fan: g.fan, power: g.power, memUsed: g.memUsed, memTotal: g.memTotal, clock: g.clock },
      net: n && n.rx_sec != null ? { iface: n.iface, downMbps: Math.round((n.rx_sec * 8) / 1e5) / 10, upMbps: Math.round((n.tx_sec * 8) / 1e5) / 10 } : null,
      procs: topProcs,
    };
  })();
  try { return await busy; } finally { busy = null; }
}

module.exports = { sample };
