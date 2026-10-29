'use strict';
const { t, getLang } = require('./i18n');
// Rapport autonome (HTML imprimable, aussi exporté en PDF) : configuration, santé des composants,
// optimisation de Windows et mesures. Aucun script : le fichier peut être envoyé tel quel.

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s) => String(s || '').replace(/\((R|TM)\)|™|®/gi, '').replace(/\s+/g, ' ').trim();
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(getLang(), { dateStyle: 'long', timeStyle: 'short' }) : '');
const STATUS = {
  ok: ['OK', '#18794e'], info: [t("À noter"), '#1f6feb'], warn: [t("À surveiller"), '#b7791f'],
  bad: [t("Défaillant"), '#c62828'], unknown: [t("Non vérifié"), '#6b7280'],
};
const SEV = { bad: [t("Problème"), '#c62828'], warn: [t("À améliorer"), '#b7791f'], info: [t("Suggestion"), '#1f6feb'], ok: ['OK', '#18794e'] };
const badge = (map, k) => `<span class="b" style="color:${(map[k] || map.unknown || map.ok)[1]};border-color:${(map[k] || map.unknown || map.ok)[1]}">${esc((map[k] || map.unknown || map.ok)[0])}</span>`;

function buildReport({ hw, analysis, health, stress, gpuStress, drivers, meta = {} }) {
  const p = hw.perf;
  const rows = [
    [t("Machine"), [hw.system.manufacturer, hw.system.model].filter(Boolean).join(' ') || '–'],
    [t("Carte mère"), [hw.board.manufacturer, hw.board.model].filter(Boolean).join(' ') || '–'],
    [t("Processeur"), t("{0} ({1}{2} threads)", [clean(hw.cpu.brand), hw.cpu.physicalCores ? hw.cpu.physicalCores + t(" cœurs / ") : '', hw.cpu.cores])],
    ...hw.gpus.map((g) => [t("Carte graphique"), `${clean(g.name)}${g.driverVersion ? t(" · pilote {0}{1}", [g.driverVersion, g.driverDate ? ' (' + g.driverDate + ')' : '']) : ''}`]),
    [t("Mémoire"), t("{0} Go{1}{2}{3}", [hw.ram.totalGb, hw.ram.type ? ' ' + hw.ram.type : '', hw.ram.speed ? t(" à ") + hw.ram.speed + t(" MHz") : '', hw.ram.sticks.length ? ' · ' + hw.ram.sticks.map((s) => s.sizeGb + t(" Go")).join(' + ') : ''])],
    ...hw.disks.map((d) => [t("Disque"), t("{0} · {1} · {2} Go{3}", [clean(d.name), d.type, d.sizeGb, d.isSystem ? t(" (système)") : ''])]),
    [t("Écran(s)"), hw.displays.map((d) => `${d.resX}×${d.resY}${d.hz ? t(" à ") + d.hz + t(" Hz") : ''}`).join(', ') || '–'],
    [t("Système"), t("{0} {1} · build {2} · {3}", [hw.os.distro, hw.os.release || '', hw.os.build, hw.os.arch])],
    [t("Nom du PC"), hw.os.hostname],
  ];
  if (health && health.identity) {
    const id = health.identity;
    if (id.biosVersion) rows.push(['BIOS', `${id.biosVersion}${id.biosDate ? ' (' + id.biosDate + ')' : ''}`]);
    if (id.biosSerial && !/default|to be filled|^0+$/i.test(id.biosSerial)) rows.push([t("N° de série"), id.biosSerial]);
  }

  const parts = [];
  parts.push(`<header><div><h1>${t("Rapport de diagnostic PC")}</h1><p class="m">${t("Généré le")} ${esc(fmtDate(new Date().toISOString()))} ${t("par Gallium")}</p></div>
    ${meta.client || meta.ref ? `<div class="client">${meta.client ? `<div><b>${esc(meta.client)}</b></div>` : ''}${meta.ref ? `<div>${t("Réf.")} ${esc(meta.ref)}</div>` : ''}</div>` : ''}</header>`);

  // Synthèse
  const summary = [];
  if (health) summary.push(`<div class="kpi"><div class="v" style="color:${health.counts.bad ? STATUS.bad[1] : health.counts.warn ? STATUS.warn[1] : STATUS.ok[1]}">${health.counts.bad ? health.counts.bad + t(" défaillant") + (health.counts.bad > 1 ? 's' : '') : health.counts.warn ? health.counts.warn + t(" à surveiller") : t("Tout est sain")}</div><div class="l">${t("Santé des composants")}</div></div>`);
  if (analysis) summary.push(`<div class="kpi"><div class="v">${analysis.score}/100</div><div class="l">${t("Optimisation de Windows ·")} ${esc(analysis.grade)}</div></div>`);
  for (const u of p.usages) summary.push(`<div class="kpi"><div class="v">${u.score}/100</div><div class="l">${esc(u.label)} · ${esc(u.verdict)}</div></div>`);
  parts.push(`<section><h2>${t("Synthèse")}</h2><div class="kpis">${summary.join('')}</div></section>`);

  if (meta.notes) parts.push(`<section><h2>${t("Notes")}</h2><div class="notes">${esc(meta.notes).replace(/\n/g, '<br>')}</div></section>`);

  parts.push(`<section><h2>${t("Configuration")}</h2><table class="cfg">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table></section>`);
  // Score de chaque composant
  const comps = p.components || [];
  if (comps.length) {
    const nameOf = (c) => c.kind === 'cpu' ? clean(hw.cpu.brand) : c.kind === 'gpu' ? clean(c.ref) : c.kind === 'ram' ? t("{0} Go {1}", [hw.ram.totalGb, hw.ram.type || ''])
      : c.kind === 'disk' ? clean((hw.disks.find((d) => (d.number ?? d.name) === c.ref) || {}).name) : c.kind === 'display' ? ((hw.displays[c.ref] || {}).model || t("Écran"))
        : c.kind === 'board' ? [hw.board.manufacturer, hw.board.model].filter(Boolean).join(' ') || [hw.system.manufacturer, hw.system.model].filter(Boolean).join(' ') : `${hw.os.distro}`;
    const color = (s) => (s >= 70 ? STATUS.ok[1] : s >= 40 ? STATUS.warn[1] : STATUS.bad[1]);
    parts.push(`<section><h2>${t("Score des composants")}</h2><table>${comps.map((c) => `<tr><td style="width:150px;color:#6b7280;font-weight:600">${esc(c.label)}</td><td>${esc(nameOf(c))}<div class="m">${esc(c.detail)}</div></td>`
      + `<td class="val"><b style="color:${color(c.score)}">${c.score}/100</b><div class="m">${esc(c.verdict)}</div></td></tr>`).join('')}</table></section>`);
  }

  if (health) {
    parts.push(`<section><h2>${t("Santé des composants")} <small>${esc(fmtDate(health.finishedAt))}</small></h2>${health.components.map((c) => `
      <div class="comp"><div class="ch">${badge(STATUS, c.status)}<b>${esc(c.label)}</b><span class="m">${esc(clean(c.name))}</span></div>
      <table>${c.checks.map((k) => `<tr><td class="st">${badge(STATUS, k.status)}</td><td>${esc(k.label)}</td><td class="val">${esc(k.value)}</td></tr>${k.note && k.status !== 'ok' ? `<tr class="nt"><td></td><td colspan="2">${esc(k.note)}</td></tr>` : ''}`).join('')}</table>
      ${c.advice.length ? `<ul>${c.advice.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</section>`);
  }

  if (stress) {
    parts.push(`<section><h2>${t("Test de stabilité")} <small>${esc(fmtDate(stress.finishedAt))}</small></h2>
      <div class="comp"><div class="ch">${badge(STATUS, stress.status)}<b>${esc(stress.minutes)} ${t("min à pleine charge")}</b><span class="m">${stress.threads} ${t("threads")}${stress.aborted ? t(" · interrompu") : ''}</span></div>
      <table>
        ${stress.ratio != null ? `<tr><td>${t("Performance maintenue (fin / début)")}</td><td class="val">${stress.ratio} %</td></tr>` : ''}
        ${stress.maxCpuTemp ? `<tr><td>${t("Température CPU max.")}</td><td class="val">${stress.maxCpuTemp} °C</td></tr>` : ''}
        ${stress.maxGpuTemp ? `<tr><td>${t("Température GPU max.")}</td><td class="val">${stress.maxGpuTemp} °C</td></tr>` : ''}
        ${stress.ram ? `<tr><td>${t("Mémoire vérifiée")}</td><td class="val">${stress.ram.mb} ${t("Mo ·")} ${stress.ram.passes} ${t("passe(s) ·")} ${stress.ram.errors} ${t("erreur(s)")}</td></tr>` : ''}
      </table>${stress.issues.length ? `<ul>${stress.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div></section>`);
  }

  if (health && health.minidumps && health.minidumps.some((d) => d.code)) {
    parts.push(`<section><h2>${t("Écrans bleus enregistrés")} <small>C:\\Windows\\Minidump</small></h2><table>
      <tr><th>${t("Date")}</th><th>${t("Code d'arrêt")}</th><th>${t("Pilote en cause")}</th></tr>
      ${health.minidumps.filter((d) => d.code).map((d) => `<tr><td>${esc(fmtDate(d.at))}</td><td>${esc(d.code)}${d.name ? ' ' + esc(d.name) : ''}</td><td>${esc(d.driver || '–')}${d.driverHint ? `<div class="m">${esc(d.driverHint)}</div>` : ''}</td></tr>`).join('')}
    </table></section>`);
  }

  if (gpuStress) {
    parts.push(`<section><h2>${t("Test de la carte graphique")} <small>${esc(fmtDate(gpuStress.finishedAt))}</small></h2>
      <div class="comp"><div class="ch">${badge(STATUS, gpuStress.status)}<b>${esc(gpuStress.minutes)} ${t("min à pleine charge")}</b><span class="m">${esc(clean(String(gpuStress.renderer || '').replace(/^ANGLE \(|\)$/g, '')))}${gpuStress.aborted ? t(" · interrompu") : ''}</span></div>
      <table>
        <tr><td>${t("Images par seconde (moyenne)")}</td><td class="val">${esc(gpuStress.avgFps)}</td></tr>
        ${gpuStress.ratio != null ? `<tr><td>${t("Performance maintenue (fin / début)")}</td><td class="val">${gpuStress.ratio} %</td></tr>` : ''}
        ${gpuStress.maxTemp != null ? `<tr><td>${t("Température GPU max.")}</td><td class="val">${gpuStress.maxTemp} °C</td></tr>` : ''}
      </table>${gpuStress.issues.length ? `<ul>${gpuStress.issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</div></section>`);
  }

  if (drivers) {
    const bad = drivers.drivers.filter((d) => d.status !== 'ok');
    parts.push(`<section><h2>${t("Pilotes")} <small>${drivers.counts.total} ${t("installés ·")} ${drivers.counts.unsigned} ${t("non signé(s) ·")} ${drivers.counts.old} ${t("très ancien(s)")}</small></h2>
      ${bad.length ? `<table><tr><th>${t("Périphérique")}</th><th>${t("Éditeur")}</th><th>${t("Version")}</th><th>${t("Date")}</th><th>${t("À vérifier")}</th></tr>${bad.slice(0, 60).map((d) => `<tr><td>${esc(clean(d.name))}</td><td>${esc(d.provider || '–')}</td><td>${esc(d.version || '–')}</td><td>${esc(d.date || '–')}</td><td>${badge(STATUS, d.status)}${esc(d.issues.join(', '))}</td></tr>`).join('')}</table>` : '<p>' + t("Tous les pilotes sont signés et aucun pilote tiers n'est très ancien.") + '</p>'}
    </section>`);
  }

  if (analysis) {
    const items = analysis.findings.filter((f) => f.severity !== 'ok');
    parts.push(`<section><h2>${t("Optimisation de Windows")} <small>${t("analyse")} ${analysis.mode === 'full' ? t("complète") : 'rapide'} · ${esc(fmtDate(analysis.finishedAt))}</small></h2>
      ${items.length ? items.map((f) => `<div class="f">${badge(SEV, f.severity)}<b>${esc(f.title)}</b><div class="d">${esc(f.detail)}</div>${f.fix ? `<div class="fx">${t("À faire :")} ${esc(f.fix)}</div>` : ''}</div>`).join('') : '<p>' + t("Rien à corriger.") + '</p>'}
      ${analysis.benchmarks && analysis.benchmarks.length ? `<h3>${t("Mesures")}</h3><table>${analysis.benchmarks.map((b) => `<tr><td>${esc(b.label)}</td><td class="val">${esc(b.value)} ${esc(b.unit)}</td></tr>`).join('')}</table>` : ''}
    </section>`);
  }

  parts.push('<p class="foot">' + t("Les scores d'usage sont des estimations à partir de bases de performances intégrées. Les états de santé proviennent des journaux de Windows, du Gestionnaire de périphériques et des capteurs disponibles sur ce PC.") + '</p>');

  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${esc(t("Rapport PC"))} – ${esc(hw.os.hostname)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
  body { font: 13px/1.5 "Segoe UI", system-ui, sans-serif; color: #1f2937; margin: 0; padding: 32px 40px; max-width: 960px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 22px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  h2 small, .m { color: #6b7280; font-weight: 400; font-size: 12px; } h3 { font-size: 13px; margin: 14px 0 6px; }
  .client { text-align: right; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; } .kpi .v { font-size: 17px; font-weight: 700; } .kpi .l { color: #6b7280; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; } td, th { padding: 4px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
  .cfg th { width: 150px; color: #6b7280; font-weight: 600; } .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .st { width: 92px; } .nt td { color: #6b7280; font-size: 12px; border-bottom: 0; padding-top: 0; }
  .comp, .f { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .ch { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; } .ch .m { margin-left: auto; }
  .b { display: inline-block; border: 1px solid; border-radius: 99px; padding: 0 8px; font-size: 11px; font-weight: 700; margin-right: 6px; white-space: nowrap; }
  .f .d { margin-top: 3px; } .f .fx { margin-top: 4px; color: #374151; background: #f9fafb; padding: 4px 8px; border-radius: 6px; }
  ul { margin: 6px 0 0; padding-left: 18px; } .notes { white-space: normal; border-left: 3px solid #111827; padding: 4px 12px; }
  .foot { color: #6b7280; font-size: 11px; margin-top: 28px; }
  @media print { body { padding: 0; } }
</style></head><body>${parts.join('\n')}</body></html>`;
}

module.exports = { buildReport };
