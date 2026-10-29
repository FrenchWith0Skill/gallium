(() => {
  'use strict';
  const api = window.api;
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');
  const sidefoot = document.getElementById('sidefoot');

  // Traduction : le texte source est le français ; DICT vient de locales/<langue>.json.
  let DICT = (api.i18nInitial && api.i18nInitial.dict) || {};
  if (api.i18nInitial) { document.documentElement.lang = api.i18nInitial.lang; document.documentElement.dir = api.i18nInitial.lang === 'ar' ? 'rtl' : 'ltr'; }
  const t = (src, params) => {
    const out = DICT[src] || src;
    return params ? out.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m)) : out;
  };
  async function applyLanguage() {
    try {
      const r = await api.i18n();
      DICT = r.dict || {};
      document.documentElement.lang = r.lang;
      document.documentElement.dir = r.lang === 'ar' ? 'rtl' : 'ltr';
    } catch { DICT = {}; }
  }

  const state = {
    settings: { mode: 'pro', remember: true, lang: 'en' },
    page: 'home', hw: null, last: null, result: null, error: null,
    opts: { res: '1080', quality: 'high', filter: 'all', q: '' },
    games: null, expanded: null, running: false, progress: null,
    health: null, healthRunning: false, healthProgress: null, healthError: null,
    stress: null, stressLive: null, stressOpts: { minutes: 3, ram: true },
    gpuStress: null, gpuLive: null, gpuOpts: { minutes: 3 },
    drivers: null, driversLoading: false, driversFilter: { show: 'issues', q: '' },
    clients: null, clientOpen: null, compare: [],
    mon: null, monTimer: null, history: [],
    reportForm: { client: '', ref: '', notes: '', include: {} },
    catalog: { tab: 'cpu', sub: 'all', q: '', sort: 'score', dir: -1, res: '1080', quality: 'high', open: null, data: null, pairCpu: null, pairGpu: null, animate: true, token: 0 },
  };

  // ------------------------------------------------------------------ outils
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  }
  function icon(d) {
    const s = svgEl('svg', { viewBox: '0 0 24 24' });
    s.append(svgEl('path', { d }));
    return s;
  }
  const ICONS = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    games: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.5 7A3 3 0 0 0 4.2 19a3 3 0 0 0 2.3-1.1L8 16h8l1.5 1.9A3 3 0 0 0 19.8 19a3 3 0 0 0 2.9-3.8l-1.5-7A4 4 0 0 0 17.3 5z',
    analysis: 'M22 12h-4l-3 9L9 3l-3 9H2',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    health: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8zM3.5 12h4l2-3 3 6 2-3h6',
    tweaks: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    monitor: 'M3 3v18h18M7 15l4-5 4 3 5-7',
    report: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  };
  const PAGES = [
    { id: 'home', label: t("Accueil") },
    { id: 'health', label: t("Diagnostic") },
    { id: 'analysis', label: t("Analyse") },
    { id: 'tweaks', label: t("Optimiser") },
    { id: 'monitor', label: t("Moniteur") },
    { id: 'games', label: t("Jeux") },
    { id: 'report', label: t("Rapport") },
    { id: 'settings', label: t("Paramètres") },
  ];

  const scoreColor = (s) => (s >= 80 ? 'var(--good)' : s >= 60 ? 'var(--ok)' : s >= 40 ? 'var(--mid)' : s >= 20 ? 'var(--low)' : 'var(--bad)');
  const clean = (s) => String(s || '').replace(/\((R|TM)\)|™|®/gi, '').replace(/\s+CPU\b.*$/i, '').replace(/\s+\d+-Core Processor/i, '').replace(/\s+/g, ' ').trim();
  const fmtSize = (gb) => (gb >= 1000 ? t("{0} To", [(gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 1)]) : t("{0} Go", [gb]));
  const fmtDate = (iso) => new Date(iso).toLocaleString(document.documentElement.lang || 'fr', { dateStyle: 'medium', timeStyle: 'short' });

  // Dernière valeur affichée par chaque jauge / barre (clé stable) : quand l'écran est reconstruit,
  // elle repart de cette valeur au lieu de 0. Une animation ne se rejoue donc que si la valeur change,
  // et seulement de l'ancienne valeur vers la nouvelle. La mémoire dure le temps de la session.
  const shown = new Map();
  function startValue(key, target, monotonic) {
    if (!key || !shown.has(key)) return 0;
    const prev = shown.get(key);
    return monotonic ? Math.min(prev, target) : prev;
  }
  function remember(key, value, monotonic) {
    if (!key) return value;
    const v = monotonic && shown.has(key) ? Math.max(shown.get(key), value) : value;
    shown.set(key, v);
    return v;
  }
  // Une barre de chargement repart de zéro au début d'une nouvelle opération.
  const resetShown = (key) => shown.delete(key);

  function gauge(score, size = 104, stroke = 9, key = null) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const svg = svgEl('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` });
    svg.append(svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, class: 'gauge-track' }));
    svg.lastChild.style.stroke = 'var(--track)';
    if (score != null) {
      const from = startValue(key, score);
      const arc = svgEl('circle', {
        cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round',
        transform: `rotate(-90 ${size / 2} ${size / 2})`, class: 'gauge-ring',
        'stroke-dasharray': `${(c * from) / 100} ${c}`,
      });
      arc.style.stroke = scoreColor(score);
      svg.append(arc);
      remember(key, score);
      if (from !== score) requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dasharray', `${(c * score) / 100} ${c}`)));
    }
    const tx = svgEl('text', { x: size / 2, y: size / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'gauge-num' });
    tx.textContent = score == null ? '–' : String(score);
    svg.append(tx);
    return svg;
  }

  // key : identifiant stable de la barre ; monotonic : barre de chargement (ne recule jamais).
  function bar(pct, color, key = null, monotonic = false) {
    const target = Math.max(2, Math.min(100, pct));
    const from = Math.max(2, startValue(key, target, monotonic));
    const to = Math.max(2, Math.min(100, remember(key, target, monotonic)));
    const i = h('i');
    i.style.width = `${from}%`;
    i.style.background = color;
    if (from !== to) requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = `${to}%`; }));
    return h('div', { class: 'bar' + (monotonic ? ' loading' : '') }, i);
  }
  // Mise à jour directe d'une barre de chargement déjà affichée (sans jamais reculer).
  function setBar(el, key, pct) {
    if (!el) return;
    el.style.width = `${Math.max(2, Math.min(100, remember(key, pct, true)))}%`;
  }

  const mount = (...nodes) => { view.replaceChildren(...nodes); view.scrollTop = 0; };
  const loading = (text) => mount(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), h('div', null, text)));

  // ------------------------------------------------------------------ navigation
  function renderNav() {
    nav.replaceChildren(...PAGES.filter((p) => pageAllowed(p.id)).map((p) => h('button', {
      class: (state.page === p.id || (p.id === 'home' && state.page === 'catalog') ? 'active' : '') + (p.id === 'settings' ? ' nav-settings' : ''), onclick: () => go(p.id),
    }, icon(ICONS[p.id]), t(p.label))));
  }
  function renderFoot() {
    const support = state.appInfo && state.appInfo.supportUrl
      ? h('button', { class: 'support-link', onclick: () => api.openSupport() }, '♥ ', t("Soutenir Gallium")) : null;
    if (state.last) {
      sidefoot.replaceChildren(support || '', h('div', null, t("Dernière analyse")), h('div', { style: { color: scoreColor(state.last.score), fontWeight: '650' } }, `${state.last.score}/100 · ${fmtDate(state.last.finishedAt)}`));
    } else {
      sidefoot.replaceChildren(support || '', h('div', null, t("Aucune analyse pour le moment.")));
    }
  }
  // Libère la mémoire de la page quittée, une fois l'animation de la nouvelle page passée.
  let gcTimer = null;
  const releaseMemory = () => {
    clearTimeout(gcTimer);
    gcTimer = setTimeout(() => { if (typeof window.gc === 'function') window.gc(); }, 1500);
  };

  function go(page) {
    if (!pageAllowed(page)) page = 'home';
    state.page = page;
    // Configuration pas encore chargée : on retient la page demandée, elle s'ouvrira à la fin du chargement.
    if (!state.hw && page !== 'settings') { renderNav(); return; }
    clearTimeout(state.monTimer);
    releaseMemory();
    renderNav();
    if (page === 'home') renderHome();
    else if (page === 'games') renderGames();
    else if (page === 'health') renderHealth();
    else if (page === 'tweaks') renderTweaks();
    else if (page === 'monitor') renderMonitor();
    else if (page === 'report') renderReport();
    else if (page === 'catalog') renderCatalog();
    else if (page === 'settings') renderSettings();
    else renderAnalysis();
  }

  // ------------------------------------------------------------------ accueil
  function usageCard(label, score, verdict, limit, onClick) {
    return h('div', { class: 'card usage' + (onClick ? ' clickable' : ''), onclick: onClick },
      gauge(score, 104, 9, 'usage-' + label),
      h('div', { class: 'name' }, label),
      h('div', { class: 'verdict', style: { color: score == null ? 'var(--muted)' : scoreColor(score) } }, verdict),
      h('div', { class: 'limit' }, limit));
  }

  // Carte d'un composant ; sc = son score (perf.components) affiché en petite jauge.
  function part(label, main, sc, ...lines) {
    return h('div', { class: 'card part' },
      h('div', { class: 'part-head' },
        h('div', null, h('div', { class: 'label' }, label), h('div', { class: 'main' }, main)),
        sc ? h('div', { class: 'part-score', title: `${sc.verdict} · ${sc.detail}` }, gauge(sc.score, 58, 6, 'part-' + sc.id)) : null),
      lines.flat().filter(Boolean).map((l) => (l instanceof Node ? l : h('div', { class: 'line' }, l))),
      sc ? h('div', { class: 'part-verdict' }, h('b', { style: { color: scoreColor(sc.score) } }, sc.verdict), ` · ${sc.detail}`) : null);
  }

  function renderHome() {
    const hw = state.hw;
    const p = hw.perf;
    const cards = p.usages.map((u) => usageCard(u.label, u.score, u.verdict,
      u.limit ? t("Point faible : {0}{1}", [u.limit, u.limitDetail ? ' (' + clean(u.limitDetail) + ')' : '']) : t("Aucun point faible majeur"),
      u.id === 'gaming' ? () => go('games') : null));
    if (state.health) {
      const r = state.health;
      const bad = r.components.filter((c) => c.status === 'bad').map((c) => c.label);
      cards.unshift(usageCard(t("Santé du PC"), healthScore(r),
        r.counts.bad ? t("{0} défaillant{1}", [r.counts.bad, r.counts.bad > 1 ? 's' : '']) : r.counts.warn ? t("{0} à surveiller", [r.counts.warn]) : t("Tout est sain"),
        bad.length ? bad.join(', ') : r.counts.warn ? t("Voir le détail") : t("Aucun composant en défaut"), () => go('health')));
    } else {
      cards.unshift(usageCard(t("Santé du PC"), null, t("Non vérifiée"), t("Lance un diagnostic pour le savoir"), () => go('health')));
    }
    if (state.last) {
      const n = state.last.counts.bad + state.last.counts.warn;
      cards.push(usageCard('Windows', state.last.score, state.last.grade,
        n ? t("{0} point{1} à corriger", [n, n > 1 ? 's' : '']) : t("Rien à corriger"), () => go('analysis')));
    } else {
      cards.push(usageCard('Windows', null, t("Non analysé"), t("Lance une analyse pour le savoir"), () => go('analysis')));
    }

    const cpu = hw.cpu;
    // Les scores arrivent avec la détection ; une configuration en cache d'une ancienne version peut ne pas en avoir.
    const comps = p.components || [];
    const sc = (kind, ref) => comps.find((c) => c.kind === kind && (ref === undefined || c.ref === ref)) || null;
    const parts = [
      part(t("Processeur"), clean(cpu.brand), sc('cpu'),
        `${cpu.physicalCores ? cpu.physicalCores + t(" cœurs / ") : ''}${cpu.cores} threads`,
        cpu.speedMax || cpu.speed ? t("Jusqu'à {0} GHz", [(cpu.speedMax || cpu.speed).toFixed(1)]) : null),
      ...hw.gpus.map((g) => part(g.name === p.gpu.name ? t("Carte graphique") : t("Graphique secondaire"), clean(g.name), sc('gpu', g.name),
        g.vram ? t("{0} Go de VRAM", [(g.vram / 1024).toFixed(g.vram % 1024 === 0 ? 0 : 1)]) : null,
        g.driverVersion ? t("Pilote {0}{1}", [g.driverVersion, g.driverDate ? ' (' + g.driverDate + ')' : '']) : null)),
      part(t("Mémoire"), t("{0} Go{1}{2}", [hw.ram.totalGb, hw.ram.type ? ' ' + hw.ram.type : '', hw.ram.speed ? ' · ' + hw.ram.speed + t(" MHz") : '']), sc('ram'),
        hw.ram.sticks.length ? t("{0} barrette{1} : {2}", [hw.ram.sticks.length, hw.ram.sticks.length > 1 ? 's' : '', hw.ram.sticks.map((s) => s.sizeGb + t(" Go")).join(' + ')]) : null,
        hw.ram.sticks.length === 1 && !hw.system.isLaptop ? t("Simple canal") : hw.ram.sticks.length >= 2 ? t("Double canal probable") : null,
        hw.ram.usedPct != null ? t("{0} % utilisée en ce moment", [hw.ram.usedPct]) : null),
      ...hw.disks.map((d) => part(d.isSystem ? t("Disque système") : t("Disque"), clean(d.name), sc('disk', d.number ?? d.name),
        `${d.type === '?' ? t("Type inconnu") : d.type} · ${fmtSize(d.sizeGb)}${d.interface ? ' · ' + d.interface : ''}`)),
      part(hw.system.isLaptop ? t("Ordinateur portable") : t("Carte mère / machine"),
        [hw.board.manufacturer, hw.board.model].filter(Boolean).join(' ') || [hw.system.manufacturer, hw.system.model].filter(Boolean).join(' ') || t("Inconnue"), sc('board'),
        hw.board.model && hw.system.model && hw.system.model !== hw.board.model ? `${hw.system.manufacturer} ${hw.system.model}`.trim() : null),
      part(t("Système"), `${clean(hw.os.distro)} ${hw.os.release || ''}`.trim(), sc('os'),
        hw.os.build ? t("Build {0} · {1}", [hw.os.build, hw.os.arch]) : null,
        t("Allumé depuis {0}", [hw.os.uptimeH < 48 ? Math.round(hw.os.uptimeH) + t(" h") : Math.round(hw.os.uptimeH / 24) + t(" jours")])),
      ...hw.displays.map((d, i) => part(d.main && hw.displays.length > 1 ? t("Écran principal") : t("Écran"), d.model || t("Écran"), sc('display', i),
        `${d.resX}×${d.resY}${d.hz ? t(" à ") + d.hz + t(" Hz") : ''}${d.maxHz && d.maxHz > d.hz ? t(" (jusqu'à {0} Hz)", [d.maxHz]) : ''}`)),
    ];

    mount(
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, hw.system.model && hw.system.manufacturer ? t("Ton PC") : (hw.os.hostname || t("Ton PC"))), h('p', { class: 'sub' }, t("Voici la composition de ta machine et ce qu'elle vaut selon l'usage."))),
        h('div', { class: 'actions' },
          has('catalog') ? h('button', { class: 'btn', onclick: () => go('catalog') }, t("Base de composants")) : null,
          h('button', { class: 'btn', onclick: () => { go('analysis'); startAnalysis('quick'); } }, t("Analyse rapide")),
          h('button', { class: 'btn primary', onclick: () => { go('health'); startHealth(); } }, t("Diagnostiquer mon PC")))),
      h('section', null, h('h2', null, t("Scores par usage")), h('div', { class: 'grid usages' }, cards)),
      h('section', null, h('h2', null, t("Composition")), h('div', { class: 'grid parts' }, parts)),
      h('p', { class: 'note' }, t("Les scores sont calculés à partir de bases de performances intégrées : ce sont des estimations, pas des benchmarks.")));
  }

  // ------------------------------------------------------------------ jeux
  async function renderGames() {
    const o = state.opts;
    const listBox = h('div', { class: 'games' });
    const seg = (key, items) => h('div', { class: 'seg' }, items.map(([val, label]) => h('button', {
      class: o[key] === val ? 'active' : '',
      onclick: async (e) => {
        o[key] = val;
        [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget));
        if (key === 'res' || key === 'quality') await loadGames(listBox); else fillGames(listBox);
      },
    }, label)));

    const search = h('input', { class: 'search', type: 'search', placeholder: t("Rechercher un jeu…"), value: o.q });
    search.addEventListener('input', () => { o.q = search.value; fillGames(listBox); });

    mount(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t("Jeux")), h('p', { class: 'sub' }, t("FPS estimés pour ta configuration, selon la résolution et la qualité choisies.")))),
      h('div', { class: 'toolbar' },
        h('div', { class: 'group' }, t("Résolution"), seg('res', [['1080', '1080p'], ['1440', '1440p'], ['2160', '4K']])),
        h('div', { class: 'group' }, t("Qualité"), seg('quality', [['low', t("Bas")], ['medium', t("Moyen")], ['high', t("Élevé")], ['ultra', t("Ultra")]])),
        h('div', { class: 'group' }, seg('filter', [['all', t("Tous")], ['installed', t("Installés")], ['esport', t("Compétitifs")], ['aaa', t("Solo / AAA")]])),
        search),
      h('p', { class: 'note' }, t("Estimations indicatives basées sur le niveau de ton processeur et de ta carte graphique : les FPS réels varient selon la scène, les pilotes et les mods. Les jeux Steam, Epic (Fortnite) et quelques dossiers connus sont détectés comme « installés ».")),
      listBox);
    await loadGames(listBox);
  }

  async function loadGames(listBox) {
    listBox.replaceChildren(h('div', { class: 'empty' }, t("Calcul en cours…")));
    try {
      const data = await api.listGames({ res: state.opts.res, quality: state.opts.quality });
      state.games = data.games;
      fillGames(listBox);
    } catch (e) {
      listBox.replaceChildren(h('div', { class: 'error-box' }, t("Impossible de calculer les FPS : {0}", [e.message])));
    }
  }

  const LIMIT_LABEL = { GPU: t("Carte graphique"), CPU: t("Processeur"), RAM: t("Mémoire"), VRAM: 'VRAM', Moteur: t("Moteur du jeu") };

  function reqRow(label, have, need, unit, gameId) {
    if (have == null) return null;
    const ratio = Math.min(1, have / need);
    const ok = have >= need;
    return h('div', { class: 'req' }, h('span', null, label), bar(ratio * 100, ok ? 'var(--good)' : ratio > 0.6 ? 'var(--mid)' : 'var(--bad)', `req-${gameId}-${label}`),
      h('span', { class: 'v' }, `${have} / ${need}${unit}`));
  }

  function gameCard(g) {
    const e = g.est;
    const open = state.expanded === g.id;
    const row = h('button', { class: 'game-row', onclick: () => { state.expanded = open ? null : g.id; fillGames(document.querySelector('.games')); } },
      h('div', { class: 'score-chip', style: { color: scoreColor(e.score), borderColor: scoreColor(e.score) } }, e.score),
      h('div', { class: 'g-name' }, g.name,
        h('span', { class: 'pill' }, g.kind === 'esport' ? t("Compétitif") : t("Solo / AAA")),
        g.installed ? h('span', { class: 'pill good' }, t("Installé")) : null),
      h('div', { class: 'col-bar' }, bar(e.score, scoreColor(e.score), 'game-' + g.id)),
      h('div', { class: 'fps', style: { color: scoreColor(e.score) } }, `${e.fps}`, h('small', null, g.cap <= e.fps ? t("FPS (max)") : 'FPS')),
      h('div', { class: 'col-limit' }, h('span', { class: 'pill' + (e.limit === 'Moteur' ? '' : ' info') }, LIMIT_LABEL[e.limit] || e.limit)),
      h('div', { style: { fontWeight: '600', fontSize: '13px', color: scoreColor(e.score) } }, e.verdict));
    const wrap = h('div', { class: 'game' }, row);
    if (open) {
      const resLabel = { '1080': '1080p', '1440': '1440p', '2160': '4K' }[state.opts.res];
      wrap.append(h('div', { class: 'game-detail' },
        h('div', null,
          h('h4', null, t("Ton PC vs requis pour ~60 FPS (1080p Élevé)")),
          reqRow('GPU', e.have.gpu, e.need.gpu, '', g.id),
          reqRow('CPU', e.have.cpu, e.need.cpu, '', g.id),
          reqRow('RAM', e.have.ram, e.need.ram, t(" Go"), g.id),
          e.have.vram ? reqRow('VRAM', Math.round(e.have.vram * 10) / 10, e.need.vram, t(" Go"), g.id) : null),
        h('div', null,
          h('h4', null, t("Préréglage conseillé en {0}", [resLabel])),
          h('p', null, e.reaches60 ? t("{0} : ≥ 60 FPS attendus.", [e.presetLabel]) : t("Même en Bas, ce jeu reste sous 60 FPS en cette résolution.")),
          h('h4', null, t("Conseils")),
          h('ul', { class: 'tips' }, g.advice.map((tx) => h('li', null, tx))))));
    }
    return wrap;
  }

  function fillGames(listBox) {
    if (!listBox || !state.games) return;
    const o = state.opts;
    const q = o.q.trim().toLowerCase();
    let list = state.games.filter((g) => {
      if (o.filter === 'installed' && !g.installed) return false;
      if ((o.filter === 'esport' || o.filter === 'aaa') && g.kind !== o.filter) return false;
      return !q || g.name.toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => Number(b.installed) - Number(a.installed));
    if (!list.length) {
      listBox.replaceChildren(h('div', { class: 'empty' }, o.filter === 'installed' ? t("Aucun jeu de la liste détecté sur ce PC (Steam, Epic Fortnite, Riot, Minecraft).") : t("Aucun jeu ne correspond.")));
      return;
    }
    listBox.replaceChildren(...list.map(gameCard));
  }

  // ------------------------------------------------------------------ analyse
  const SEV = {
    bad: { title: t("Problèmes à corriger"), pill: 'bad', label: t("Problème") },
    warn: { title: t("À améliorer"), pill: 'warn', label: t("À améliorer") },
    info: { title: t("Suggestions"), pill: 'info', label: t("Suggestion") },
  };

  function findingCard(f) {
    const box = h('div', { class: `finding ${f.severity}` },
      h('div', { class: 't' }, f.title, h('span', { class: 'pill' }, t(f.category))),
      h('div', { class: 'd' }, f.detail));
    if (f.fix) {
      const fixBtn = f.tweak && f.severity !== 'ok' ? h('button', { class: 'btn primary small', onclick: async (e) => {
        const b = e.currentTarget;
        if (f.tweak === 'temp' && !confirm(t("Supprimer les fichiers temporaires inutilisés depuis 2 jours ? Cette action ne peut pas être annulée."))) return;
        b.disabled = true;
        try { toast(await api.applyTweak(f.tweak)); b.replaceWith(h('span', { class: 'pill good' }, t("Corrigé"))); } catch (err) { b.disabled = false; toast(errText(err), 'bad'); }
      } }, t("Corriger")) : null;
      box.append(h('div', { class: 'fix' }, h('span', null, h('b', null, t("À faire : ")), f.fix),
        h('div', { class: 'actions' }, fixBtn,
          f.link ? h('button', { class: 'btn small', onclick: () => api.openSettings(f.link) }, t("Ouvrir le réglage")) : null)));
    }
    return box;
  }

  function resultView(r) {
    const nodes = [];
    nodes.push(h('div', { class: 'card result-head' },
      gauge(r.score, 124, 11, 'analysis-score'),
      h('div', { class: 'meta' },
        h('h3', { style: { fontSize: '20px', color: scoreColor(r.score) } }, r.grade),
        h('p', { class: 'sub' }, t("Analyse {0} · {1} · {2} s", [r.mode === 'full' ? t("complète") : 'rapide', fmtDate(r.finishedAt), Math.round(r.durationMs / 1000)])),
        h('div', { class: 'counts' },
          r.counts.bad ? h('span', { class: 'pill bad' }, t("{0} problème{1}", [r.counts.bad, r.counts.bad > 1 ? 's' : ''])) : null,
          r.counts.warn ? h('span', { class: 'pill warn' }, t("{0} à améliorer", [r.counts.warn])) : null,
          r.counts.info ? h('span', { class: 'pill info' }, r.counts.info > 1 ? t("{0} suggestions", [r.counts.info]) : t("{0} suggestion", [r.counts.info])) : null,
          h('span', { class: 'pill good' }, `${r.counts.ok} OK`)))));
    if (r.platform !== 'win32') {
      nodes.push(h('p', { class: 'note' }, t("Ce système n'est pas Windows : les vérifications spécifiques à Windows ont été ignorées.")));
    }
    const prev = (state.history || []).filter((x) => x.kind === 'analysis' && x.mode === r.mode && x.at < r.finishedAt).pop();
    if (prev) {
      const parts = [t("score {0} → {1} ({2})", [prev.score, r.score, delta(r.score, prev.score)])];
      for (const b of r.benchmarks || []) {
        const pb = (prev.benchmarks || []).find((x) => x.id === b.id);
        if (pb && pb.value && b.id !== 'temp') parts.push(`${b.label.replace(/\s*\(.*\)$/, '')} ${delta(b.value, pb.value, '%rel')}`);
      }
      nodes.push(h('div', { class: 'card hint' }, h('span', null, h('b', null, t("Avant / après (par rapport au {0}) : ", [fmtDate(prev.at)])), parts.join(' · '))));
    }
    for (const sev of ['bad', 'warn', 'info']) {
      const items = r.findings.filter((f) => f.severity === sev);
      if (items.length) nodes.push(h('section', null, h('h2', null, `${SEV[sev].title} (${items.length})`), items.map(findingCard)));
    }
    if (!r.counts.bad && !r.counts.warn && !r.counts.info) {
      nodes.push(h('div', { class: 'card empty' }, t("Rien à signaler : ta configuration est bien optimisée.")));
    }
    const oks = r.findings.filter((f) => f.severity === 'ok');
    if (oks.length) {
      nodes.push(h('details', { class: 'oks' }, h('summary', null, t("Tout est bon ({0})", [oks.length])), oks.map(findingCard)));
    }
    if (r.benchmarks && r.benchmarks.length) {
      nodes.push(h('section', null, h('h2', null, t("Mesures")),
        h('div', { class: 'grid bench' }, r.benchmarks.map((b) => h('div', { class: 'card' },
          h('div', { class: 'v' }, String(b.value), h('small', null, b.unit)),
          h('div', { class: 'l' }, b.label),
          b.note ? h('div', { class: 'l', style: { marginTop: '6px' } }, b.note) : null)))));
    }
    const gr = r.gameReport;
    if (gr && gr.items && gr.items.length) {
      nodes.push(h('section', null, h('h2', null, t("Réglages conseillés par jeu")),
        h('p', { class: 'note' }, gr.fromInstalled ? t("Pour les jeux détectés sur ton PC, à la résolution de ton écran. Les moins fluides sont en premier.") : t("Aucun jeu détecté : voici quelques jeux populaires à la résolution de ton écran.")),
        gr.items.map((g) => h('details', { class: 'finding ' + (g.reaches60 ? 'ok' : 'warn') },
          h('summary', { style: { cursor: 'pointer', fontWeight: '650' } }, t("{0} · {1} {2} · ≈ {3} FPS ", [g.name, g.resLabel, g.presetLabel, g.fps]),
            h('span', { class: 'pill info' }, LIMIT_LABEL[g.limit] || g.limit)),
          h('ul', { class: 'tips', style: { marginTop: '10px' } }, g.advice.map((tx) => h('li', null, tx)))))));
    }
    return nodes;
  }

  function renderAnalysis() {
    const disabled = state.running;
    const modeBtn = (mode, title, desc, warn) => h('button', { class: 'mode', disabled, onclick: () => startAnalysis(mode) },
      h('div', { class: 't' }, title), h('div', { class: 'd' }, desc), warn ? h('div', { class: 'w' }, warn) : null);

    const blocks = [
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t("Analyse")), h('p', { class: 'sub' }, t("Vérifie les réglages de Windows, l'état du matériel et ce qu'il faudrait changer.")))),
      h('div', { class: 'modes' },
        modeBtn('quick', t("Analyse rapide"), t("Réglages Windows, plan d'alimentation, mode Jeu, démarrage, disque, mémoire, pilotes, réseau et conseils pour le streaming. Aucun test de charge."), t("Environ 15 secondes")),
        modeBtn('full', t("Analyse complète"), t("Tout le contrôle rapide, plus des tests de performance (processeur sous charge, disque, mémoire), les fichiers temporaires et des conseils de réglages par jeu."), t("Environ 1 minute · le processeur sera à 100 % pendant ~15 s"))),
    ];
    if (state.running) {
      const p = state.progress || { pct: 0, label: t("Démarrage…") };
      blocks.push(h('div', { class: 'progress card' },
        h('div', { class: 'top' }, h('span', { id: 'pg-label' }, p.label), h('span', { id: 'pg-pct' }, `${p.pct} %`)),
        (() => { const b = bar(p.pct, 'var(--accent)', 'pg', true); b.firstChild.id = 'pg-bar'; return b; })()));
    }
    if (state.error) blocks.push(h('div', { class: 'error-box', style: { marginTop: '18px' } }, state.error));
    const r = state.result || state.last;
    if (r && !state.running) blocks.push(h('div', { style: { marginTop: '26px' } }, resultView(r)));
    mount(...blocks);
  }

  function updateProgress(p) {
    const l = document.getElementById('pg-label');
    const pc = document.getElementById('pg-pct');
    const b = document.getElementById('pg-bar');
    if (l) l.textContent = p.label;
    if (pc) pc.textContent = `${p.pct} %`;
    setBar(b, 'pg', p.pct);
  }

  async function startAnalysis(mode) {
    if (state.running) return;
    state.running = true;
    state.error = null;
    state.progress = { pct: 0, label: t("Démarrage…") };
    resetShown('pg');
    if (state.page !== 'analysis') go('analysis'); else renderAnalysis();
    const off = api.onProgress((p) => { state.progress = p; updateProgress(p); });
    try {
      const res = await api.runAnalysis(mode);
      state.history = await api.history();
      state.result = res;
      state.last = res;
    } catch (e) {
      state.error = t("L'analyse a échoué : {0}", [String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')]);
    } finally {
      off();
      state.running = false;
      renderFoot();
      if (state.page === 'analysis') renderAnalysis();
    }
  }

  // ------------------------------------------------------------------ outils communs (nouvelles pages)
  const STATUS = {
    ok: { label: 'OK', color: 'var(--good)', pill: 'good' },
    info: { label: t("À noter"), color: 'var(--info)', pill: 'info' },
    warn: { label: t("À surveiller"), color: 'var(--mid)', pill: 'warn' },
    bad: { label: t("Défaillant"), color: 'var(--bad)', pill: 'bad' },
    unknown: { label: t("Non vérifié"), color: 'var(--muted)', pill: '' },
  };
  const statusPill = (s) => h('span', { class: 'pill ' + (STATUS[s] || STATUS.unknown).pill }, (STATUS[s] || STATUS.unknown).label);
  const errText = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  function toast(text, kind = 'good') {
    const tx = h('div', { class: `toast ${kind}` }, text);
    document.body.append(tx);
    setTimeout(() => tx.classList.add('show'), 10);
    setTimeout(() => { tx.classList.remove('show'); setTimeout(() => tx.remove(), 300); }, 3200);
  }

  // Petite courbe (SVG) : valeurs entre 0 et max.
  function spark(values, max, color, w = 260, hgt = 54) {
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: 'none', class: 'spark' });
    const v = values.filter((x) => x != null);
    if (v.length < 2) return svg;
    const m = max || Math.max(...v, 1);
    const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${hgt - 2 - (Math.min(x, m) / m) * (hgt - 4)}`);
    const area = svgEl('polygon', { points: `0,${hgt} ${pts.join(' ')} ${w},${hgt}` });
    area.style.fill = color; area.style.opacity = '0.12';
    const line = svgEl('polyline', { points: pts.join(' '), fill: 'none', 'stroke-width': '2', 'vector-effect': 'non-scaling-stroke' });
    line.style.stroke = color;
    svg.append(area, line);
    return svg;
  }

  function progressCard(p, ids) {
    const b = bar(p.pct, 'var(--accent)', ids, true);
    b.firstChild.id = ids + '-bar';
    return h('div', { class: 'progress card' },
      h('div', { class: 'top' }, h('span', { id: ids + '-label' }, p.label), h('span', { id: ids + '-pct' }, `${p.pct} %`)), b);
  }
  function updateProgressCard(ids, p) {
    const l = document.getElementById(ids + '-label');
    const pc = document.getElementById(ids + '-pct');
    const b = document.getElementById(ids + '-bar');
    if (l) l.textContent = p.label;
    if (pc) pc.textContent = `${p.pct} %`;
    setBar(b, ids, p.pct);
  }

  // Un composant défaillant plafonne le score à 50, un point à surveiller à 85.
  const healthScore = (r) => Math.max(0, Math.min(r.counts.bad ? 50 : r.counts.warn ? 85 : 100, 100 - r.counts.bad * 25 - r.counts.warn * 8));

  // ------------------------------------------------------------------ diagnostic
  function componentCard(c) {
    const status = c.id === 'ram' ? memStatusOf(c) : c.status;
    const st = STATUS[status] || STATUS.unknown;
    const advice = c.advice.filter((a) => !/en tant qu.administrateur/.test(a));
    return h('div', { class: 'card comp', style: { borderTopColor: st.color } },
      h('div', { class: 'comp-head' },
        h('div', null, h('div', { class: 'label' }, c.label), h('div', { class: 'main' }, clean(c.name))),
        statusPill(status)),
      h('div', { class: 'checks' }, c.checks.map((k) => h('div', { class: 'check' },
        h('i', { class: 'dot', style: { background: (STATUS[k.status] || STATUS.unknown).color } }),
        h('div', { class: 'ck' }, h('div', { class: 'cl' }, k.label), k.note && k.status !== 'ok' ? h('div', { class: 'cn' }, k.note) : null),
        h('div', { class: 'cv' }, k.value)))),
      // (les anciens diagnostics enregistrés contenaient un conseil de relance en administrateur, devenu inutile)
      advice.length ? h('ul', { class: 'tips advice' }, advice.map((a) => h('li', null, a))) : null,
      c.id === 'ram' ? memActions() : null);
  }

  // Résultats des deux tests de la mémoire : test rapide (dans l'app) et test Windows complet (au démarrage).
  function quickRamResult() {
    const r = state.stress;
    return r && r.ram && r.ram.passes > 0 ? r : null;
  }
  function memStatusOf(c) {
    const q = quickRamResult();
    const w = state.memStatus && state.memStatus.last;
    let st = c.status;
    if ((q && q.ram.errors > 0) || (w && !w.ok)) st = 'bad';
    return st;
  }
  let memStatusLoading = null;
  function loadMemStatus() {
    if (!memStatusLoading) {
      memStatusLoading = api.memTestStatus()
        .then((r) => { state.memStatus = r; }, () => { state.memStatus = { scheduled: false, last: null }; })
        .finally(() => { memStatusLoading = null; refreshMemActions(); });
    }
    return memStatusLoading;
  }
  const refreshMemActions = () => {
    const box = document.getElementById('mem-actions');
    if (box) box.replaceWith(memActions());
  };

  const MEM_QUICK = { minutes: 3, ram: true, cpu: false };
  async function runQuickRamTest() {
    const run = startStress(MEM_QUICK);
    setTimeout(() => document.getElementById('stress')?.scrollIntoView({ behavior: 'smooth' }), 80);
    await run;
    refreshMemActions();
    const r = quickRamResult();
    if (r && !r.aborted) toast(r.ram.errors ? t("{0} erreur(s) mémoire détectée(s).", [r.ram.errors]) : t("Mémoire vérifiée : aucune erreur."), r.ram.errors ? 'bad' : 'good');
  }

  // Tests de la mémoire : immédiat dans l'application et/ou test Windows complet au prochain redémarrage.
  function memActions() {
    if (!state.memStatus) loadMemStatus();
    const ms = state.memStatus || {};
    const q = quickRamResult();
    const w = ms.last;
    const row = (label, status, value, note) => h('div', { class: 'check' },
      h('i', { class: 'dot', style: { background: (STATUS[status] || STATUS.unknown).color } }),
      h('div', { class: 'ck' }, h('div', { class: 'cl' }, label), note ? h('div', { class: 'cn' }, note) : null),
      h('div', { class: 'cv' }, value));
    const withQuick = h('input', { type: 'checkbox' });
    withQuick.checked = state.memWithQuick !== false;
    withQuick.addEventListener('change', () => { state.memWithQuick = withQuick.checked; });
    const busy = !!state.stressLive;

    const schedule = async (btn) => {
      btn.disabled = true;
      if (withQuick.checked) {
        toast(t("Test rapide en cours ; le test Windows sera programmé juste après."));
        await runQuickRamTest();
        const r = quickRamResult();
        if (!r || r.aborted) { toast(t("Test rapide interrompu : le test Windows n'a pas été programmé."), 'warn'); refreshMemActions(); return; }
      }
      const res = await api.scheduleMemTest();
      if (res === 'scheduled') toast(t("Test Windows programmé : il se lancera au prochain redémarrage."));
      else if (res === 'opened') toast(t("La fenêtre « Diagnostic de mémoire Windows » est ouverte : choisis quand lancer le test."), 'warn');
      else toast(t("Non disponible sur ce système."), 'bad');
      await loadMemStatus();
    };

    return h('div', { class: 'mem-actions', id: 'mem-actions' },
      h('div', { class: 'checks mem-results' },
        busy && state.stressLive && !state.stressLive.cpu
          ? row(t("Test rapide"), 'unknown', t("en cours…"))
          : q ? row(t("Test rapide"), q.ram.errors ? 'bad' : 'ok', q.ram.errors ? `${q.ram.errors} erreur(s)` : t("aucune erreur"),
            t("{0} Go vérifiés, {1} passe(s) · {2}", [Math.round(q.ram.mb / 102.4) / 10, q.ram.passes, fmtDate(q.finishedAt)]))
            : row(t("Test rapide"), 'unknown', t("pas encore fait")),
        ms.scheduled
          ? row(t("Test Windows complet"), 'info', t("programmé"), t("Il se lancera au prochain redémarrage (~15 min), puis Windows redémarre normalement."))
          : w ? row(t("Test Windows complet"), w.ok ? 'ok' : 'bad', w.ok ? t("aucune erreur") : t("erreurs détectées"), t("Dernier test : {0}", [fmtDate(w.at)]))
            : row(t("Test Windows complet"), 'unknown', state.memStatus ? t("jamais lancé") : '…')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small primary', disabled: busy, onclick: () => runQuickRamTest() }, t("Tester la RAM maintenant")),
        ms.scheduled
          ? [
            h('button', { class: 'btn small', onclick: async () => {
              if (!confirm(t("Redémarrer le PC dans 10 secondes pour lancer le test de la mémoire ?\n\nEnregistre ton travail avant : le test dure environ 15 minutes, puis Windows redémarre normalement."))) return;
              if (await api.restartForMemTest()) toast(t("Redémarrage dans 10 secondes…")); else toast(t("Windows a refusé le redémarrage."), 'bad');
            } }, t("Redémarrer maintenant")),
            h('button', { class: 'btn small', onclick: async () => {
              if (await api.cancelMemTest()) { toast(t("Test Windows annulé.")); await loadMemStatus(); } else toast(t("Impossible d'annuler."), 'bad');
            } }, t("Annuler le test Windows"))]
          : h('button', { class: 'btn small', disabled: busy, onclick: (e) => schedule(e.currentTarget) }, t("Test Windows complet au redémarrage"))),
      ms.scheduled ? null : h('label', { class: 'check-label' }, withQuick, t("Faire aussi le test rapide avant le test Windows")),
      h('div', { class: 'cn' }, t("Test rapide : vérifie la mémoire libre en arrière-plan (~3 min), tu peux continuer à utiliser le PC. Test Windows : contrôle toute la RAM, mais ne peut tourner qu'au démarrage, avant Windows.")));
  }

  function healthView(r) {
    const nodes = [];
    const order = { bad: 0, warn: 1, info: 2, unknown: 3, ok: 4 };
    const comps = [...r.components].sort((a, b) => order[a.status] - order[b.status]);
    const s = healthScore(r);
    nodes.push(h('div', { class: 'card result-head' },
      gauge(s, 124, 11, 'health-score'),
      h('div', { class: 'meta' },
        h('h3', { style: { fontSize: '20px', color: r.counts.bad ? 'var(--bad)' : r.counts.warn ? 'var(--mid)' : 'var(--good)' } },
          r.counts.bad ? t("{0} composant{1} défaillant{2}", [r.counts.bad, r.counts.bad > 1 ? 's' : '', r.counts.bad > 1 ? 's' : '']) : r.counts.warn ? t("{0} point{1} à surveiller", [r.counts.warn, r.counts.warn > 1 ? 's' : '']) : t("Tous les composants sont sains")),
        h('p', { class: 'sub' }, t("Diagnostic du {0} · {1} s", [fmtDate(r.finishedAt), Math.round(r.durationMs / 1000)])),
        h('div', { class: 'counts' },
          r.counts.bad ? h('span', { class: 'pill bad' }, t("{0} défaillant{1}", [r.counts.bad, r.counts.bad > 1 ? 's' : ''])) : null,
          r.counts.warn ? h('span', { class: 'pill warn' }, t("{0} à surveiller", [r.counts.warn])) : null,
          h('span', { class: 'pill good' }, `${r.counts.ok} OK`)))));
    if (r.platform !== 'win32') nodes.push(h('p', { class: 'note' }, t("Ce système n'est pas Windows : la plupart des contrôles de santé ne sont pas disponibles.")));
    nodes.push(h('div', { class: 'grid comps' }, comps.map(componentCard)));
    return nodes;
  }

  function renderHealth(keepScroll) {
    const blocks = [
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, t("Diagnostic")), h('p', { class: 'sub' }, t("L'état de chaque composant : ce qui va bien, ce qui est à surveiller et ce qui est défaillant."))),
        h('button', { class: 'btn primary', disabled: state.healthRunning, onclick: startHealth }, state.health ? t("Relancer le diagnostic") : t("Lancer le diagnostic"))),
      h('p', { class: 'note' }, t("Environ 30 secondes. Lit les journaux de Windows (arrêts brutaux, écrans bleus, erreurs matérielles et disque), le Gestionnaire de périphériques, les capteurs disponibles, et teste la connexion réseau. Rien n'est modifié.")),
    ];
    if (state.healthRunning) blocks.push(progressCard(state.healthProgress || { pct: 0, label: t("Démarrage…") }, 'hp'));
    if (state.healthError) blocks.push(h('div', { class: 'error-box', style: { marginTop: '18px' } }, state.healthError));
    if (state.health && !state.healthRunning) blocks.push(h('div', { style: { marginTop: '18px' } }, healthView(state.health)));
    else if (!state.health && !state.healthRunning) blocks.push(h('div', { class: 'card empty' }, t("Aucun diagnostic pour le moment.")));
    if (has('tests')) blocks.push(stressSection(), gpuSection());
    if (has('drivers')) blocks.push(driversSection());
    const top = view.scrollTop;
    mount(...blocks);
    if (keepScroll) view.scrollTop = top;
  }

  async function startHealth() {
    if (state.healthRunning) return;
    state.healthRunning = true;
    state.healthError = null;
    state.healthProgress = { pct: 0, label: t("Démarrage…") };
    resetShown('hp');
    if (state.page !== 'health') go('health'); else renderHealth();
    const off = api.onHealthProgress((p) => { state.healthProgress = p; updateProgressCard('hp', p); });
    try {
      state.health = await api.runHealth();
      state.memStatus = null;
    } catch (e) {
      state.healthError = t("Le diagnostic a échoué : {0}", [errText(e)]);
    } finally {
      off();
      state.healthRunning = false;
      if (state.page === 'health') renderHealth();
    }
  }

  // ------------------------------------------------------------------ test de stabilité
  function stressSection() {
    const o = state.stressOpts;
    const running = !!state.stressLive;
    const seg = h('div', { class: 'seg' }, [1, 3, 5, 10].map((m) => h('button', {
      class: o.minutes === m ? 'active' : '', disabled: running,
      onclick: (e) => { o.minutes = m; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); },
    }, `${m} min`)));
    const ram = h('input', { type: 'checkbox', disabled: running, onchange: (e) => { o.ram = e.target.checked; } });
    ram.checked = o.ram;
    const box = h('section', { id: 'stress', style: { marginTop: '34px' } },
      h('h2', null, t("Test de stabilité")),
      h('p', { class: 'note' }, t("Fait tourner le processeur à 100 % sur tous ses cœurs et vérifie une partie de la mémoire. Un PC sain garde la même performance du début à la fin, sans planter. Utile après un nettoyage, un changement de pâte thermique ou de barrette, ou pour vérifier un PC d'occasion.")),
      h('div', { class: 'toolbar' },
        h('div', { class: 'group' }, t("Durée"), seg),
        h('label', { class: 'group check-label' }, ram, t("Vérifier aussi la RAM")),
        running ? h('button', { class: 'btn', onclick: () => api.stopStress() }, t("Arrêter le test"))
          : h('button', { class: 'btn primary', disabled: !!state.gpuLive, title: state.gpuLive ? t("Attends la fin du test de la carte graphique.") : null, onclick: () => startStress() }, t("Démarrer le test"))),
      h('div', { id: 'stress-body' }, stressBody()));
    return box;
  }

  function stressBody() {
    const live = state.stressLive;
    if (live) {
      const p = live.p || { elapsed: 0, total: live.total };
      if (!live.cpu) {
        const pctM = Math.round((100 * p.elapsed) / (p.total || 1));
        return h('div', { class: 'card' },
          h('div', { class: 'progress', style: { marginTop: 0 } },
            h('div', { class: 'top' }, h('span', null, t("Test de la mémoire en cours… {0} min {1} s / {2} min", [Math.floor(p.elapsed / 60), String(p.elapsed % 60).padStart(2, '0'), Math.round(p.total / 60)])), h('span', null, `${pctM} %`)),
            bar(pctM, 'var(--accent)', 'stress', true)),
          h('div', { class: 'stress-kpis', style: { marginTop: '14px' } },
            kpi(t("Mémoire testée"), p.ram ? Math.round(p.ram.mb / 102.4) / 10 : '–', t("Go")),
            kpi(t("Passes complètes"), p.ram ? p.ram.pass : 0, ''),
            kpi(t("Erreurs"), p.ram ? p.ram.errors : 0, '')),
          h('p', { class: 'note' }, t("Le test tourne en arrière-plan : tu peux continuer à utiliser le PC.")));
      }
      const pct = Math.round((100 * p.elapsed) / (p.total || 1));
      return h('div', { class: 'card' },
        h('div', { class: 'progress', style: { marginTop: 0 } },
          h('div', { class: 'top' }, h('span', null, t("Test en cours… {0} min {1} s / {2} min", [Math.floor(p.elapsed / 60), String(p.elapsed % 60).padStart(2, '0'), Math.round(p.total / 60)])), h('span', null, `${pct} %`)),
          bar(pct, 'var(--accent)', 'stress', true)),
        h('div', { class: 'stress-live' },
          h('div', null, h('div', { class: 'label' }, t("Performance du processeur (par seconde)")), spark(live.series, null, 'var(--accent)', 600, 90)),
          h('div', { class: 'stress-kpis' },
            kpi(t("Performance"), p.mops != null ? `${p.mops}` : '–', 'Mop/s'),
            kpi(t("Temp. CPU"), p.cpuTemp != null ? p.cpuTemp : '–', '°C'),
            kpi(t("Temp. GPU"), p.gpuTemp != null ? p.gpuTemp : '–', '°C'),
            p.ram ? kpi(t("RAM vérifiée"), `${p.ram.pass} passe${p.ram.pass > 1 ? 's' : ''}`, p.ram.errors ? `${p.ram.errors} erreur(s)` : t("0 erreur")) : null)),
        h('p', { class: 'note' }, t("Évite d'utiliser le PC pendant le test pour ne pas fausser la mesure.")));
    }
    const r = state.stress;
    if (!r) return null;
    if (r.cpu === false) {
      const ok = r.ram && r.ram.errors === 0 && r.ram.passes > 0;
      return h('div', { class: `finding ${r.ram && r.ram.errors ? 'bad' : ok ? 'ok' : 'info'}` },
        h('div', { class: 't' }, r.ram && r.ram.errors ? t("Erreurs mémoire détectées") : ok ? t("Mémoire vérifiée sans erreur") : t("Test de la mémoire interrompu"),
          h('span', { class: 'pill' }, t("{0} min · {1}", [r.minutes, fmtDate(r.finishedAt)]))),
        r.ram ? h('div', { class: 'd' }, t("{0} Go vérifiés, {1} passe(s) complète(s), {2} erreur(s).", [Math.round(r.ram.mb / 102.4) / 10, r.ram.passes, r.ram.errors])) : null,
        r.issues.length ? h('ul', { class: 'tips advice' }, r.issues.map((i) => h('li', null, i))) : null,
        h('div', { class: 'd', style: { marginTop: '6px' } }, t("Seule la mémoire libre est testée. Pour contrôler toute la RAM, programme le test Windows complet depuis la carte « Mémoire vive ».")));
    }
    const prev = (state.history || []).filter((x) => x.kind === 'stress' && x.cpu !== false && x.at < r.finishedAt).pop();
    return h('div', { class: `finding ${r.status === 'unknown' ? 'info' : r.status}` },
      h('div', { class: 't' }, r.status === 'ok' ? t("Stable sous charge") : r.status === 'warn' ? t("Stable, mais à surveiller") : r.status === 'bad' ? t("Problème détecté sous charge") : t("Test interrompu"),
        h('span', { class: 'pill' }, t("{0} min · {1}", [r.minutes, fmtDate(r.finishedAt)]))),
      h('div', { class: 'stress-live' },
        h('div', null, spark(r.series, null, (STATUS[r.status] || STATUS.info).color, 600, 70)),
        h('div', { class: 'stress-kpis' },
          r.ratio != null ? kpi(t("Perf. maintenue"), r.ratio, '%') : null,
          kpi(t("Moyenne"), r.avgMops, 'Mop/s'),
          r.maxCpuTemp ? kpi(t("CPU max"), r.maxCpuTemp, '°C') : null,
          r.maxGpuTemp ? kpi(t("GPU max"), r.maxGpuTemp, '°C') : null,
          r.ram ? kpi(t("Erreurs RAM"), r.ram.errors, t("{0} Mo × {1}", [r.ram.mb, r.ram.passes])) : null)),
      r.issues.length ? h('ul', { class: 'tips advice' }, r.issues.map((i) => h('li', null, i))) : h('div', { class: 'd' }, t("Aucune baisse de performance ni erreur mémoire pendant le test.")),
      prev && prev.avgMops ? h('div', { class: 'd', style: { marginTop: '8px' } },
        t("Comparé au test du {0} : {1} de performance moyenne{2}.", [fmtDate(prev.at), delta(r.avgMops, prev.avgMops, '%rel'), prev.ratio != null && r.ratio != null ? t(", stabilité {0} % → {1} %", [prev.ratio, r.ratio]) : ''])) : null);
  }

  const kpi = (label, value, unit) => h('div', { class: 'kpi' }, h('div', { class: 'v' }, String(value), h('small', null, unit)), h('div', { class: 'l' }, label));

  function delta(now, before, mode) {
    if (before == null || now == null) return '';
    const d = mode === '%rel' ? Math.round(((now - before) / (before || 1)) * 100) : Math.round((now - before) * 10) / 10;
    return `${d > 0 ? '+' : ''}${d}${mode === '%rel' ? ' %' : ''}`;
  }

  async function startStress(opts) {
    if (state.stressLive || state.gpuLive) return;
    const o = opts && opts.minutes ? opts : { minutes: state.stressOpts.minutes, ram: state.stressOpts.ram, cpu: true };
    state.stressLive = { series: [], p: null, cpu: o.cpu !== false, total: o.minutes * 60 };
    resetShown('stress');
    if (state.page === 'health') renderHealth(true);
    const off = api.onStressProgress((p) => {
      const live = state.stressLive;
      if (!live) return;
      if (p.sec >= 0 && p.mops != null) live.series[p.sec] = p.mops;
      live.p = p;
      const body = document.getElementById('stress-body');
      if (body) body.replaceChildren(stressBody());
    });
    try {
      state.stress = await api.runStress(o);
      state.history = await api.history();
    } catch (e) {
      toast(t("Le test a échoué : {0}", [errText(e)]), 'bad');
    } finally {
      off();
      state.stressLive = null;
      if (state.page === 'health') renderHealth(true);
    }
  }

  // ------------------------------------------------------------------ test de la carte graphique
  // Un shader volontairement lourd est dessiné plusieurs fois par image dans un canevas WebGL 1280×720.
  // Les premières secondes, le nombre de passes est ajusté pour viser ~30 images/s (GPU occupé à 100 %),
  // puis il reste fixe : une carte qui chauffe ou dont le pilote flanche perd des images au fil du test.
  const GPU_FRAG = `precision highp float;
uniform float t; uniform vec2 res;
void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - res) / res.y;
  vec3 c = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    float fi = float(i);
    p = abs(p) / dot(p, p) - vec2(0.9 + 0.1 * sin(t * 0.3 + fi * 0.05), 0.6);
    c += vec3(0.25, 0.85, 0.6) * exp(-6.0 * length(p)) + 0.002 * vec3(sin(fi + t), cos(fi * 1.3), sin(fi * 0.7 - t));
  }
  gl_FragColor = vec4(c * 0.35, 0.08);
}`;
  const GPU_CALIB_S = 6;

  function startGpuStress() {
    if (state.gpuLive || state.stressLive) return;
    const canvas = h('canvas', { width: 1280, height: 720, class: 'gpu-canvas' });
    const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) { toast(t("WebGL n'est pas disponible : impossible de tester la carte graphique."), 'bad'); return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, GPU_FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const uT = gl.getUniformLocation(prog, 't');
    gl.uniform2f(gl.getUniformLocation(prog, 'res'), 1280, 720);
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';

    const minutes = state.gpuOpts.minutes;
    const live = state.gpuLive = {
      canvas, renderer, minutes, total: minutes * 60, elapsed: 0, passes: 1, series: [], temps: [], fps: null, temp: null, power: null,
      lost: false, aborted: false, frames: 0, secStart: performance.now(), t0: performance.now(), paused: 0,
    };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); live.lost = true; finish(); });
    resetShown('gpu');

    let raf = 0;
    let tempTimer = 0;
    const pollTemp = async () => {
      try {
        const s = await api.gpuSample();
        if (s && s.temp != null) { live.temp = s.temp; live.power = s.power; }
      } catch { /* capteur indisponible */ }
      if (state.gpuLive === live) tempTimer = setTimeout(pollTemp, 2000);
    };
    pollTemp();

    const frame = (now) => {
      if (state.gpuLive !== live) return;
      for (let i = 0; i < live.passes; i++) { gl.uniform1f(uT, (now / 1000) + i * 0.01); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      live.frames++;
      const span = now - live.secStart;
      if (span >= 1000) {
        const fps = (live.frames * 1000) / span;
        live.frames = 0; live.secStart = now;
        // Fenêtre réduite : le navigateur cesse de dessiner, ces secondes ne comptent pas.
        if (document.hidden) { live.paused++; raf = requestAnimationFrame(frame); return; }
        live.elapsed++;
        live.fps = Math.round(fps * 10) / 10;
        if (live.elapsed <= GPU_CALIB_S) {
          if (fps > 34) live.passes = Math.min(4000, Math.ceil(live.passes * Math.min(8, fps / 30)));
          else if (fps < 24 && live.passes > 1) live.passes = Math.max(1, Math.floor(live.passes * fps / 30));
        } else {
          live.series.push(live.fps);
          live.temps.push(live.temp);
        }
        const body = document.getElementById('gpu-body');
        if (body) body.replaceChildren(gpuBody());
        if (live.elapsed >= live.total) { finish(); return; }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    async function finish() {
      if (state.gpuLive !== live) return;
      cancelAnimationFrame(raf);
      clearTimeout(tempTimer);
      state.gpuLive = null;
      const res = gpuVerdict(live);
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* déjà perdu */ }
      live.canvas = null;
      try { state.gpuStress = await api.saveGpuStress(res); state.history = await api.history(); } catch { state.gpuStress = { ...res, finishedAt: new Date().toISOString() }; }
      if (state.page === 'health') renderHealth(true);
      if (!res.aborted) toast(res.status === 'bad' ? t("Problème détecté sur la carte graphique.") : t("Test de la carte graphique terminé."), res.status === 'bad' ? 'bad' : 'good');
    }
    live.stop = () => { live.aborted = true; finish(); };
    if (state.page === 'health') renderHealth(true);
  }

  function gpuVerdict(live) {
    const s = live.series;
    const n = s.length;
    const meanOf = (a) => a.reduce((x, v) => x + v, 0) / (a.length || 1);
    const w = Math.max(3, Math.floor(n * 0.15));
    const head = meanOf(s.slice(0, w));
    const tail = meanOf(s.slice(Math.max(w, n - w)));
    const ratio = head > 0 && n >= 2 * w + 2 ? Math.min(105, Math.round((tail / head) * 100)) : null;
    const temps = live.temps.filter((x) => x != null);
    const maxTemp = temps.length ? Math.max(...temps) : null;
    const issues = [];
    let status = 'ok';
    if (live.lost) { status = 'bad'; issues.push(t("Le pilote graphique a cessé de répondre pendant le test (contexte WebGL perdu) : pilote instable, overclock, surchauffe ou alimentation insuffisante.")); }
    if (ratio != null && ratio < 80) { status = 'bad'; issues.push(t("La carte graphique perd {0} % d'images par seconde au fil du test : surchauffe ou limite de puissance.", [100 - ratio])); }
    else if (ratio != null && ratio < 90) { if (status === 'ok') status = 'warn'; issues.push(t("Baisse de {0} % sous charge prolongée : refroidissement un peu juste.", [100 - ratio])); }
    if (maxTemp != null && maxTemp >= 90) { status = 'bad'; issues.push(t("Carte graphique à {0} °C : trop chaud (ventilateurs, poussière, pâte thermique).", [maxTemp])); }
    else if (maxTemp != null && maxTemp >= 83) { if (status === 'ok') status = 'warn'; issues.push(t("Carte graphique à {0} °C : chaud, vérifie la ventilation du boîtier.", [maxTemp])); }
    if (live.paused > 5) issues.push(t("La fenêtre a été réduite pendant une partie du test : ces secondes ne sont pas comptées."));
    if ((live.aborted || n < 10) && status === 'ok') status = 'info';
    return {
      aborted: live.aborted, lost: live.lost, minutes: Math.round((live.elapsed / 60) * 10) / 10, renderer: live.renderer, load: live.passes,
      avgFps: Math.round(meanOf(s) * 10) / 10, ratio, maxTemp, maxPower: live.power, series: s, temps: live.temps, status, issues,
    };
  }

  function gpuSection() {
    const o = state.gpuOpts;
    const live = state.gpuLive;
    const blocked = !!state.stressLive;
    const seg = h('div', { class: 'seg' }, [1, 3, 5, 10].map((m) => h('button', {
      class: o.minutes === m ? 'active' : '', disabled: !!live,
      onclick: (e) => { o.minutes = m; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); },
    }, `${m} min`)));
    return h('section', { id: 'gpu-stress', style: { marginTop: '34px' } },
      h('h2', null, t("Test de la carte graphique")),
      h('p', { class: 'note' }, t("Fait tourner la carte graphique à 100 % avec une scène 3D lourde et suit les images par seconde et la température (cartes NVIDIA). Une carte saine garde le même rythme du début à la fin, sans écran noir ni plantage du pilote.")),
      h('div', { class: 'toolbar' },
        h('div', { class: 'group' }, t("Durée"), seg),
        live ? h('button', { class: 'btn', onclick: () => live.stop() }, t("Arrêter le test"))
          : h('button', { class: 'btn primary', disabled: blocked, title: blocked ? t("Attends la fin du test de stabilité.") : null, onclick: () => startGpuStress() }, t("Démarrer le test"))),
      h('div', { id: 'gpu-body' }, gpuBody()));
  }

  function gpuBody() {
    const live = state.gpuLive;
    if (live) {
      const pct = Math.round((100 * live.elapsed) / (live.total || 1));
      const calib = live.elapsed < GPU_CALIB_S;
      return h('div', { class: 'card' },
        h('div', { class: 'progress', style: { marginTop: 0 } },
          h('div', { class: 'top' }, h('span', null, calib ? t("Réglage de la charge…") : t("Test en cours… {0} min {1} s / {2} min", [Math.floor(live.elapsed / 60), String(live.elapsed % 60).padStart(2, '0'), live.minutes])), h('span', null, `${pct} %`)),
          bar(pct, 'var(--accent)', 'gpu', true)),
        h('div', { class: 'stress-live gpu-live' },
          live.canvas,
          h('div', null,
            h('div', { class: 'label' }, t("Images par seconde")), spark(live.series, null, 'var(--accent)', 600, 70),
            h('div', { class: 'label', style: { marginTop: '8px' } }, t("Température GPU")), spark(live.temps, 100, 'var(--mid)', 600, 50))),
        h('div', { class: 'stress-kpis' },
          kpi('Images/s', live.fps != null ? live.fps : '–', ''),
          kpi(t("Temp. GPU"), live.temp != null ? live.temp : '–', '°C'),
          live.power != null ? kpi(t("Puissance"), Math.round(live.power), 'W') : null,
          kpi(t("Charge"), live.passes, 'passes/image')),
        h('p', { class: 'note' }, t("Garde la fenêtre de Gallium ouverte (non réduite) pendant le test.")));
    }
    const r = state.gpuStress;
    if (!r) return null;
    const prev = (state.history || []).filter((x) => x.kind === 'gpustress' && x.at < r.finishedAt).pop();
    return h('div', { class: `finding ${r.status === 'unknown' ? 'info' : r.status}` },
      h('div', { class: 't' }, r.lost ? t("Le pilote graphique a planté") : r.status === 'ok' ? t("Carte graphique stable sous charge") : r.status === 'warn' ? t("Stable, mais à surveiller") : r.status === 'bad' ? t("Problème détecté sous charge") : t("Test interrompu"),
        h('span', { class: 'pill' }, t("{0} min · {1}", [r.minutes, fmtDate(r.finishedAt)]))),
      h('div', { class: 'stress-live' },
        h('div', null, spark(r.series, null, (STATUS[r.status] || STATUS.info).color, 600, 70)),
        h('div', { class: 'stress-kpis' },
          r.ratio != null ? kpi(t("Perf. maintenue"), r.ratio, '%') : null,
          kpi(t("Moyenne"), r.avgFps, 'images/s'),
          r.maxTemp != null ? kpi(t("GPU max"), r.maxTemp, '°C') : null,
          kpi(t("Charge"), r.load, 'passes/image'))),
      r.issues.length ? h('ul', { class: 'tips advice' }, r.issues.map((i) => h('li', null, i))) : h('div', { class: 'd' }, t("Aucune baisse d'images par seconde ni plantage du pilote pendant le test.")),
      r.renderer ? h('div', { class: 'd', style: { marginTop: '6px' } }, t("Carte testée : {0}", [clean(r.renderer.replace(/^ANGLE \(|\)$/g, ''))])) : null,
      prev && prev.avgFps && prev.at !== r.finishedAt ? h('div', { class: 'd', style: { marginTop: '6px' } }, t("Test précédent ({0}) : {1} images/s{2}. La charge est recalibrée à chaque test : compare surtout la stabilité.", [fmtDate(prev.at), prev.avgFps, prev.ratio != null ? t(", {0} % maintenu", [prev.ratio]) : ''])) : null);
  }

  // ------------------------------------------------------------------ pilotes
  function driversSection() {
    const d = state.drivers;
    const f = state.driversFilter;
    const body = h('div', { id: 'drivers-body' });
    const fill = () => body.replaceChildren(...[driversBody()].filter(Boolean));
    const search = h('input', { class: 'search', type: 'search', placeholder: t("Rechercher un pilote, un éditeur…"), value: f.q });
    search.addEventListener('input', () => { f.q = search.value; fill(); });
    const seg = h('div', { class: 'seg' }, [['issues', t("À vérifier")], ['third', t("Tiers")], ['all', t("Tous")]].map(([k, l]) => h('button', {
      class: f.show === k ? 'active' : '',
      onclick: (e) => { f.show = k; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); fill(); },
    }, l)));
    fill();
    return h('section', { id: 'drivers', style: { marginTop: '34px' } },
      h('h2', null, t("Pilotes")),
      h('p', { class: 'note' }, t("Tous les pilotes installés avec leur version, leur date et leur éditeur. Signale les pilotes non signés (risque de plantage ou logiciel douteux) et les pilotes tiers de plus de 5 ans.")),
      h('div', { class: 'toolbar' },
        d ? seg : null, d ? search : null,
        h('button', { class: 'btn' + (d ? '' : ' primary'), disabled: state.driversLoading, onclick: loadDrivers }, state.driversLoading ? t("Lecture…") : d ? t("Actualiser") : t("Lister les pilotes"))),
      body);
  }

  async function loadDrivers() {
    state.driversLoading = true;
    const sec = document.getElementById('drivers');
    if (sec) sec.replaceWith(driversSection());
    try { state.drivers = await api.listDrivers(); } catch (e) { toast(t("Lecture des pilotes impossible : {0}", [errText(e)]), 'bad'); }
    state.driversLoading = false;
    const sec2 = document.getElementById('drivers');
    if (sec2) sec2.replaceWith(driversSection());
  }

  function driversBody() {
    const d = state.drivers;
    if (!d) return null;
    const f = state.driversFilter;
    const c = d.counts;
    const q = f.q.trim().toLowerCase();
    const list = d.drivers.filter((x) => (f.show === 'all' || (f.show === 'issues' ? x.status !== 'ok' : x.provider && !/^microsoft/i.test(x.provider)))
      && (!q || [x.name, x.provider, x.version, x.cls, x.inf].some((v) => String(v || '').toLowerCase().includes(q))));
    return h('div', null,
      h('div', { class: 'counts', style: { margin: t("4px 0 10px") } },
        h('span', { class: 'pill ' + (c.unsigned ? 'bad' : 'good') }, c.unsigned ? t("{0} non signé{1}", [c.unsigned, c.unsigned > 1 ? 's' : '']) : t("Tous signés")),
        c.old ? h('span', { class: 'pill warn' }, t("{0} très ancien{1}", [c.old, c.old > 1 ? 's' : ''])) : null,
        h('span', { class: 'pill' }, t("{0} pilotes · {1} tiers", [c.total, c.thirdParty])),
        h('span', { class: 'muted', style: { fontSize: '12.5px' } }, t("Lu le {0}", [fmtDate(d.finishedAt)]))),
      list.length ? h('div', { class: 'card procs drivers' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, t("Périphérique")), h('th', null, t("Éditeur")), h('th', null, t("Version")), h('th', null, t("Date")), h('th', null, t("État")))),
        h('tbody', null, list.slice(0, 300).map((x) => h('tr', null,
          h('td', null, x.name, h('div', { class: 'muted', style: { fontSize: '12px' } }, [x.cls, x.inf].filter(Boolean).join(' · '))),
          h('td', null, x.provider || '–'), h('td', null, x.version || '–'),
          h('td', null, x.date && x.date >= '2000' ? new Date(x.date).toLocaleDateString(document.documentElement.lang || 'fr') : '–'),
          h('td', null, x.status === 'ok' ? h('span', { class: 'pill good' }, 'OK') : h('span', { class: 'pill ' + x.status }, x.issues.join(', '))))))))
        : h('div', { class: 'card empty' }, f.show === 'issues' && !q ? t("Aucun pilote non signé ni très ancien.") : t("Aucun pilote ne correspond.")));
  }

  // ------------------------------------------------------------------ optimiser
  async function renderTweaks() {
    const list = h('div', { class: 'tweaks' }, h('div', { class: 'empty' }, t("Lecture des réglages…")));
    // Point de restauration : créé automatiquement avant la première optimisation (un par 24 h).
    const restoreText = h('span', null, t("Un point de restauration Windows est créé automatiquement avant la première optimisation : en cas de souci, tu peux revenir en arrière depuis « Créer un point de restauration » › Restauration du système."));
    const restore = h('div', { class: 'card hint', style: { marginBottom: '14px' } }, restoreText);
    api.restoreInfo().then((r) => {
      if (r && r.at) restoreText.append(t(" Dernier point : {0}{1}.", [fmtDate(r.at), r.d ? ` (« ${r.d} »)` : '']));
    }).catch(() => {});
    mount(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t("Optimiser")),
        h('p', { class: 'sub' }, t("Corrections en un clic. Elles ne touchent qu'aux réglages de ton compte Windows et peuvent être annulées.")))),
      restore,
      list,
      h('section', { style: { marginTop: '30px' } }, h('h2', null, t("Raccourcis vers les réglages Windows")),
        h('div', { class: 'shortcuts' }, [
          [t("Applications au démarrage"), 'ms-settings:startupapps'], [t("Stockage et nettoyage"), 'ms-settings:storagesense'],
          [t("Windows Update"), 'ms-settings:windowsupdate'], [t("Fréquence de l'écran"), 'ms-settings:display-advanced'],
          [t("Graphiques (GPU par application)"), 'ms-settings:display-advancedgraphics'], [t("Mode Jeu"), 'ms-settings:gaming-gamemode'],
          [t("Alimentation"), 'ms-settings:powersleep'], [t("Applications installées"), 'ms-settings:appsfeatures'],
          [t("Sécurité Windows"), 'ms-settings:windowsdefender'], [t("Souris"), 'ms-settings:mousetouchpad'],
        ].map(([l, uri]) => h('button', { class: 'btn small', onclick: () => api.openSettings(uri) }, l)))));
    await fillTweaks(list);
  }

  async function fillTweaks(list) {
    let items;
    try { items = await api.listTweaks(); } catch (e) { list.replaceChildren(h('div', { class: 'error-box' }, errText(e))); return; }
    if (items.some((tx) => tx.pending)) {
      api.scanTemp().then(() => { if (state.page === 'tweaks' && list.isConnected) fillTweaks(list); }).catch(() => {});
    }
    if (!items.length) { list.replaceChildren(h('div', { class: 'card empty' }, t("Les optimisations automatiques ne sont disponibles que sous Windows."))); return; }
    list.replaceChildren(...items.map((tx) => {
      const act = async (fn, btn) => {
        btn.disabled = true;
        if (fn === api.applyTweak) { btn.textContent = t("Point de restauration…"); }
        try { const msg = await fn(tx.id); toast(msg, /Attention/.test(msg) ? 'warn' : 'good'); } catch (e) { toast(errText(e), 'bad'); }
        await fillTweaks(list);
      };
      const apply = h('button', { class: 'btn primary small', onclick: (e) => {
        if (tx.irreversible && !confirm(t("{0} ?\n\n{1}\n\nCette action ne peut pas être annulée.", [tx.label, tx.desc]))) return;
        act(api.applyTweak, e.currentTarget);
      } }, tx.irreversible ? t("Nettoyer") : t("Appliquer"));
      return h('div', { class: 'card tweak' },
        h('div', null,
          h('div', { class: 't' }, tx.label, tx.applied ? h('span', { class: 'pill good' }, t("Déjà en place")) : tx.applied === false ? h('span', { class: 'pill warn' }, t("Recommandé")) : null),
          h('div', { class: 'd' }, tx.desc),
          tx.current ? h('div', { class: 'cur' }, t("Actuellement : {0}", [tx.current])) : null),
        h('div', { class: 'actions' },
          tx.pending ? null : !tx.applied || tx.irreversible ? apply : null,
          tx.canUndo ? h('button', { class: 'btn small', onclick: (e) => act(api.undoTweak, e.currentTarget) }, t("Annuler")) : null));
    }));
  }

  // ------------------------------------------------------------------ moniteur
  const MON_MAX = 60;
  function renderMonitor() {
    state.mon = { series: { cpu: [], ram: [], gpu: [], gtemp: [], down: [], up: [] }, last: null };
    const body = h('div', { id: 'mon' }, h('div', { class: 'empty' }, t("Première mesure…")));
    mount(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t("Moniteur")),
        h('p', { class: 'sub' }, t("Utilisation en direct : laisse cette page ouverte sur un second écran pendant un jeu, un stream ou un rendu pour voir ce qui sature.")))),
      body);
    const loop = async () => {
      if (state.page !== 'monitor') return;
      // Fenêtre réduite ou cachée : pas de mesures inutiles.
      if (document.hidden) { state.monTimer = setTimeout(loop, 1500); return; }
      try {
        const s = await api.monitorSample();
        if (state.page !== 'monitor') return;
        const sr = state.mon.series;
        const push = (k, v) => { sr[k].push(v); if (sr[k].length > MON_MAX) sr[k].shift(); };
        push('cpu', s.cpu); push('ram', s.ramPct);
        push('gpu', s.gpu ? s.gpu.util : null); push('gtemp', s.gpu ? s.gpu.temp : null);
        push('down', s.net ? s.net.downMbps : null); push('up', s.net ? s.net.upMbps : null);
        state.mon.last = s;
        body.replaceChildren(monitorView(s));
      } catch { /* mesure manquée */ }
      state.monTimer = setTimeout(loop, 1500);
    };
    loop();
  }

  function monTile(label, value, unit, series, max, color, sub) {
    return h('div', { class: 'card mon-tile' },
      h('div', { class: 'label' }, label),
      h('div', { class: 'v', style: { color } }, value == null ? '–' : String(value), h('small', null, unit)),
      spark(series, max, color),
      sub ? h('div', { class: 'l' }, sub) : null);
  }
  const loadColor = (v) => (v == null ? 'var(--muted)' : v >= 90 ? 'var(--bad)' : v >= 75 ? 'var(--mid)' : 'var(--good)');
  const tempColor = (v) => (v == null ? 'var(--muted)' : v >= 85 ? 'var(--bad)' : v >= 75 ? 'var(--mid)' : 'var(--good)');

  function monitorView(s) {
    const sr = state.mon.series;
    const tiles = [
      monTile(t("Processeur"), s.cpu, '%', sr.cpu, 100, loadColor(s.cpu), s.cpuTemp != null ? `${s.cpuTemp} °C` : `${s.cores.length} threads`),
      monTile(t("Mémoire"), s.ramPct, '%', sr.ram, 100, loadColor(s.ramPct), s.ramUsedGb != null ? t("{0} / {1} Go", [s.ramUsedGb, s.ramTotalGb]) : null),
    ];
    if (s.gpu) {
      tiles.push(monTile(t("Carte graphique"), s.gpu.util, '%', sr.gpu, 100, loadColor(s.gpu.util),
        `${s.gpu.memUsed != null ? t("VRAM {0} / {1} Go", [Math.round(s.gpu.memUsed / 102.4) / 10, Math.round(s.gpu.memTotal / 1024)]) : ''}${s.gpu.power != null ? ` · ${Math.round(s.gpu.power)} W` : ''}`));
      tiles.push(monTile(t("Température GPU"), s.gpu.temp, '°C', sr.gtemp, 100, tempColor(s.gpu.temp), s.gpu.fan != null ? t("Ventilateur {0} %", [s.gpu.fan]) : null));
    }
    tiles.push(monTile(t("Réseau (réception)"), s.net ? s.net.downMbps : null, 'Mb/s', sr.down, null, 'var(--info)', s.net ? t("Envoi {0} Mb/s · {1}", [s.net.upMbps, s.net.iface]) : null));

    const cores = h('div', { class: 'cores' }, s.cores.map((c) => h('div', { class: 'core', title: `${c} %` }, h('i', { style: { height: `${Math.max(3, c)}%`, background: loadColor(c) } }))));
    const notes = [];
    if (!s.gpu) notes.push(t("L'utilisation de la carte graphique en direct n'est disponible que pour les cartes NVIDIA. Pour les autres, utilise le Gestionnaire des tâches (onglet Performance)."));
    if (s.cpuTemp == null) notes.push(t("Windows ne fournit pas la température du processeur sans outil dédié (HWiNFO, Core Temp)."));
    const hint = [];
    if (s.cpu >= 90 && s.gpu && s.gpu.util < 70) hint.push(t("Le processeur sature alors que la carte graphique a de la marge : en jeu, c'est le CPU qui limite les FPS."));
    if (s.gpu && s.gpu.util >= 95 && s.cpu < 70) hint.push(t("La carte graphique est à fond : c'est normal en jeu. Pour plus de FPS, baisse la résolution ou active DLSS / FSR."));
    if (s.ramPct >= 90) hint.push(t("La mémoire est presque pleine : Windows va utiliser le disque et tout ralentir. Ferme des applications."));
    if (s.gpu && s.gpu.temp >= 85) hint.push(t("La carte graphique chauffe beaucoup : vérifie la ventilation du boîtier et la poussière."));

    return h('div', null,
      h('div', { class: 'grid mon' }, tiles),
      hint.length ? h('div', { class: 'card hint', style: { marginTop: '14px' } }, h('span', null, hint.join(' '))) : null,
      h('section', { style: { marginTop: '22px' } }, h('h2', null, t("Charge par thread")), cores),
      h('section', null, h('h2', null, t("Applications les plus actives")),
        h('div', { class: 'card procs' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, t("Application")), h('th', null, t("Processeur")), h('th', null, t("Mémoire")))),
          h('tbody', null, s.procs.map((p) => h('tr', null, h('td', null, p.name + (p.count > 1 ? ` (${p.count})` : '')),
            h('td', null, `${p.cpu} %`), h('td', null, p.memMb >= 1024 ? t("{0} Go", [(p.memMb / 1024).toFixed(1)]) : t("{0} Mo", [p.memMb])))))))),
      notes.length ? h('p', { class: 'note' }, notes.join(' ')) : null);
  }

  // ------------------------------------------------------------------ rapport
  async function renderReport() {
    const f = state.reportForm;
    const input = (key, placeholder, list) => {
      const el = h('input', { class: 'search', type: 'text', placeholder, value: f[key] || '', list });
      el.addEventListener('input', () => { f[key] = el.value; });
      return el;
    };
    const notes = h('textarea', { class: 'search', rows: 4, placeholder: t("Ex. : symptômes signalés, interventions réalisées (nettoyage, pâte thermique, SSD remplacé…), recommandations.") });
    notes.value = f.notes || '';
    notes.addEventListener('input', () => { f.notes = notes.value; });
    const [lastH, lastS] = [state.health, state.stress];
    const inc = (key, label, item, when) => {
      const cb = h('input', { type: 'checkbox', disabled: !item });
      cb.checked = !!item && f.include[key] !== false;
      cb.addEventListener('change', () => { f.include[key] = cb.checked; });
      return h('label', { class: 'check-label' }, cb, label, h('span', { class: 'muted' }, item ? ` (${fmtDate(when)})` : t(" (pas encore fait)")));
    };
    const result = h('div', { id: 'report-result' });
    const save = async (format, btn) => {
      btn.disabled = true;
      try {
        const file = await api.saveReport({ format, client: f.client, ref: f.ref, notes: f.notes, include: f.include });
        if (file) {
          result.replaceChildren(h('div', { class: 'card hint' }, h('span', null, t("Rapport enregistré : {0}{1}", [file, f.client || f.ref ? t(" · ajouté à la fiche client") : ''])), h('button', { class: 'btn small', onclick: () => api.openReport() }, t("Ouvrir"))));
          state.clientOpen = null;
          await fillClients(clientsBox, true);
        }
      } catch (e) {
        result.replaceChildren(h('div', { class: 'error-box' }, t("Impossible d'enregistrer le rapport : {0}", [errText(e)])));
      } finally {
        btn.disabled = false;
      }
    };
    const hist = h('div', null, h('div', { class: 'empty' }, t("Chargement…")));
    const clientsBox = h('div', null, h('div', { class: 'empty' }, t("Chargement…")));
    const names = h('datalist', { id: 'client-names' });
    mount(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t("Rapport")),
        h('p', { class: 'sub' }, t("Un document à garder, à joindre à une demande d'aide, à remettre à un client ou à comparer après une intervention.")))),
      h('div', { class: 'report-grid' },
        h('div', { class: 'card form' },
          has('clients') ? h('label', null, t("Nom (facultatif)"), input('client', t("Ex. : Camille D."), 'client-names'), names) : null,
          has('clients') ? h('label', null, t("Référence (facultatif)"), input('ref', t("Ex. : n° de ticket, de facture"))) : null,
          h('label', null, t("Notes (facultatif)"), notes)),
        h('div', { class: 'card form' },
          h('div', { class: 'label' }, t("Contenu")),
          h('div', { class: 'muted', style: { fontSize: '13px' } }, t("La configuration complète est toujours incluse.")),
          inc('health', t("Diagnostic de santé"), lastH, lastH && lastH.finishedAt),
          inc('analysis', t("Analyse de Windows"), state.last, state.last && state.last.finishedAt),
          has('tests') ? inc('stress', t("Test de stabilité"), lastS, lastS && lastS.finishedAt) : null,
          has('tests') ? inc('gpuStress', t("Test de la carte graphique"), state.gpuStress, state.gpuStress && state.gpuStress.finishedAt) : null,
          has('drivers') ? inc('drivers', t("Pilotes à vérifier"), state.drivers, state.drivers && state.drivers.finishedAt) : null,
          !lastH ? h('button', { class: 'btn small', onclick: () => { go('health'); startHealth(); } }, t("Lancer le diagnostic d'abord")) : null,
          h('div', { class: 'actions', style: { marginTop: 'auto' } },
            h('button', { class: 'btn primary', onclick: (e) => save('pdf', e.currentTarget) }, t("Enregistrer en PDF")),
            h('button', { class: 'btn', onclick: (e) => save('html', e.currentTarget) }, t("Enregistrer en HTML"))))),
      result,
      !has('clients') ? null : h('section', { style: { marginTop: '30px' } }, h('h2', null, t("Fiches clients")),
        h('p', { class: 'note' }, t("Chaque rapport enregistré avec un nom ou une référence est rangé dans la fiche du client, avec tous ses PC. Ouvre un ancien rapport ou coches-en deux pour les comparer (avant / après une intervention, ou deux PC).")),
        clientsBox),
      h('section', { style: { marginTop: '30px' } }, h('h2', null, t("Historique")), hist));
    await fillClients(clientsBox);
    names.replaceChildren(...(state.clients || []).filter((c) => !c.key.startsWith('ref:') && c.key !== 'sans-nom').map((c) => h('option', { value: c.name })));
    state.history = await api.history();
    const items = [...state.history].reverse().slice(0, 30);
    if (!items.length) { hist.replaceChildren(h('div', { class: 'card empty' }, t("Aucune analyse ni diagnostic enregistré."))); return; }
    hist.replaceChildren(h('div', { class: 'card procs' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, t("Date")), h('th', null, t("Type")), h('th', null, t("Résultat")))),
      h('tbody', null, items.map((x) => h('tr', null, h('td', null, fmtDate(x.at)),
        h('td', null, x.kind === 'analysis' ? t("Analyse {0}", [x.mode === 'full' ? t("complète") : 'rapide']) : x.kind === 'health' ? t("Diagnostic") : x.kind === 'gpustress' ? t("Test de la carte graphique") : t("Test de stabilité")),
        h('td', null, x.kind === 'analysis' ? t("{0}/100 · {1} point(s) à corriger", [x.score, x.counts.bad + x.counts.warn])
          : x.kind === 'health' ? t("{0} défaillant(s), {1} à surveiller", [x.counts.bad, x.counts.warn])
            : x.kind === 'gpustress' ? t("{0} · {1} min · {2} images/s{3}", [(STATUS[x.status] || STATUS.info).label, x.minutes, x.avgFps, x.ratio != null ? t(" · {0} % maintenu", [x.ratio]) : ''])
            : t("{0} · {1} min{2}{3}", [(STATUS[x.status] || STATUS.info).label, x.minutes, x.ratio != null ? t(" · {0} % maintenu", [x.ratio]) : '', x.ramErrors ? t(" · {0} erreur(s) RAM", [x.ramErrors]) : '']))))))));
  }

  // ------------------------------------------------------------------ fiches clients
  async function fillClients(box, reload) {
    if (!state.clients || reload) {
      try { state.clients = await api.listClients(); } catch { state.clients = []; }
    }
    const list = state.clients;
    if (!list.length) { box.replaceChildren(h('div', { class: 'card empty' }, t("Aucune fiche pour le moment : indique un nom ou une référence, puis enregistre un rapport."))); return; }
    const refill = () => fillClients(box);
    const healthText = (s) => (s.health ? (s.health.counts.bad ? t("{0} défaillant(s)", [s.health.counts.bad]) : s.health.counts.warn ? t("{0} à surveiller", [s.health.counts.warn]) : t("Sain")) : '–');
    const rows = list.map((c) => {
      const open = state.clientOpen === c.key;
      const head = h('tr', { class: 'clickable', onclick: () => { state.clientOpen = open ? null : c.key; state.compare = []; refill(); } },
        h('td', null, h('b', null, c.name)), h('td', null, `${c.pcs} PC`), h('td', null, `${c.reports.length} rapport${c.reports.length > 1 ? 's' : ''}`),
        h('td', null, c.updatedAt ? fmtDate(c.updatedAt) : '–'), h('td', { class: 'muted' }, open ? '▲' : '▼'));
      if (!open) return [head];
      const detail = h('tr', { class: 'client-detail' }, h('td', { colspan: 5 },
        h('table', null,
          h('thead', null, h('tr', null, h('th', null, ''), h('th', null, t("Date")), h('th', null, 'PC'), h('th', null, t("Réf.")), h('th', null, t("Santé")), h('th', null, t("Optimisation")), h('th', null, ''))),
          h('tbody', null, c.reports.map((r) => {
            const cb = h('input', { type: 'checkbox' });
            cb.checked = state.compare.includes(r.id);
            cb.addEventListener('change', () => {
              state.compare = cb.checked ? [...state.compare.filter((x) => x !== r.id), r.id].slice(-2) : state.compare.filter((x) => x !== r.id);
              refill();
            });
            return h('tr', null,
              h('td', null, cb), h('td', null, fmtDate(r.at)),
              h('td', null, r.summary.hostname || '–', h('div', { class: 'muted', style: { fontSize: '12px' } }, r.summary.machine || '')),
              h('td', null, r.ref || '–'), h('td', null, healthText(r.summary)),
              h('td', null, r.summary.analysis ? `${r.summary.analysis.score}/100` : '–'),
              h('td', { style: { whiteSpace: 'nowrap', textAlign: 'right' } },
                h('button', { class: 'btn small', onclick: async () => { if (!(await api.openClientReport(r.id))) toast(t("Copie du rapport introuvable."), 'bad'); } }, t("Ouvrir")),
                h('button', { class: 'btn small', title: t("Retirer de la fiche"), onclick: async () => {
                  if (!confirm(t("Retirer le rapport du {0} de la fiche « {1} » ?\n\nLe fichier exporté n'est pas touché.", [fmtDate(r.at), c.name]))) return;
                  await api.deleteClientReport(r.id);
                  state.compare = state.compare.filter((x) => x !== r.id);
                  await fillClients(box, true);
                } }, '✕')));
          }))),
        state.compare.length === 2 ? compareView(c.reports.filter((r) => state.compare.includes(r.id))) : h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '8px' } }, t("Coche deux rapports pour les comparer."))));
      return [head, detail];
    });
    box.replaceChildren(h('div', { class: 'card procs clients' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, t("Client")), h('th', null, 'PC'), h('th', null, t("Rapports")), h('th', null, t("Dernier passage")), h('th', null, ''))),
      h('tbody', null, rows.flat()))));
  }

  // Comparaison de deux rapports : le plus ancien à gauche. better : +1 si une valeur plus haute est meilleure.
  function compareView(pair) {
    const [a, b] = [...pair].sort((x, y) => String(x.at).localeCompare(String(y.at))).map((r) => r.summary);
    const [ra, rb] = [...pair].sort((x, y) => String(x.at).localeCompare(String(y.at)));
    const rows = [];
    const row = (label, va, vb, better, unit = '') => {
      if (va == null && vb == null) return;
      let cls = '';
      if (better && typeof va === 'number' && typeof vb === 'number' && va !== vb) cls = (vb - va) * better > 0 ? 'up' : 'down';
      rows.push(h('tr', null, h('td', null, label), h('td', null, va == null ? '–' : `${va}${unit}`), h('td', { class: cls }, vb == null ? '–' : `${vb}${unit}`)));
    };
    row('PC', a.hostname, b.hostname);
    row(t("Machine"), a.machine, b.machine);
    row(t("Processeur"), clean(a.cpu), clean(b.cpu));
    row(t("Carte graphique"), clean(a.gpu), clean(b.gpu));
    row(t("Mémoire"), a.ramGb, b.ramGb, 1, t(" Go"));
    for (const u of a.usages) row(t("Score {0}", [u.label]), u.score, (b.usages.find((x) => x.id === u.id) || {}).score, 1, '/100');
    row(t("Composants défaillants"), a.health && a.health.counts.bad, b.health && b.health.counts.bad, -1);
    row(t("Points à surveiller"), a.health && a.health.counts.warn, b.health && b.health.counts.warn, -1);
    row(t("Écrans bleus (fichiers .dmp)"), a.health && a.health.bsods, b.health && b.health.bsods, -1);
    row(t("Optimisation de Windows"), a.analysis && a.analysis.score, b.analysis && b.analysis.score, 1, '/100');
    row(t("Écriture disque"), a.analysis && a.analysis.diskWrite, b.analysis && b.analysis.diskWrite, 1, t(" Mo/s"));
    row(t("Lecture disque"), a.analysis && a.analysis.diskRead, b.analysis && b.analysis.diskRead, 1, t(" Mo/s"));
    row(t("CPU : performance maintenue"), a.stress && a.stress.ratio, b.stress && b.stress.ratio, 1, ' %');
    row(t("CPU : température max."), a.stress && a.stress.maxCpuTemp, b.stress && b.stress.maxCpuTemp, -1, t(" °C"));
    row(t("Erreurs RAM"), a.stress && a.stress.ramErrors, b.stress && b.stress.ramErrors, -1);
    row(t("GPU : performance maintenue"), a.gpuStress && a.gpuStress.ratio, b.gpuStress && b.gpuStress.ratio, 1, ' %');
    row(t("GPU : température max."), a.gpuStress && a.gpuStress.maxTemp, b.gpuStress && b.gpuStress.maxTemp, -1, t(" °C"));
    return h('div', { class: 'compare' },
      h('table', null,
        h('thead', null, h('tr', null, h('th', null, t("Comparaison")), h('th', null, fmtDate(ra.at)), h('th', null, fmtDate(rb.at)))),
        h('tbody', null, rows)),
      a.hostname !== b.hostname || a.serial !== b.serial ? h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } }, t("Ces deux rapports concernent des PC différents.")) : null);
  }

  // ------------------------------------------------------------------ base de composants
  // Icône « recherche introuvable » : loupe barrée d'une croix.
  function notFoundIcon() {
    const s = svgEl('svg', { viewBox: '0 0 64 64', class: 'nf-icon' });
    s.append(svgEl('circle', { cx: 27, cy: 27, r: 17 }), svgEl('path', { d: 'M40 40l14 14' }), svgEl('path', { d: 'M21 21l12 12M33 21L21 33', class: 'x' }));
    return s;
  }

  const CAT_SUBS = {
    cpu: [['all', t("Tous")], ['desktop', t("Bureau")], ['laptop', t("Portables")]],
    gpu: [['all', t("Toutes")], ['desktop', t("Bureau")], ['laptop', t("Portables")], ['igpu', t("Intégrées")], ['pro', t("Pro")]],
  };

  async function renderCatalog() {
    const c = state.catalog;
    const body = h('div', { id: 'cat-body' }, h('div', { class: 'empty' }, t("Chargement de la base…")));
    const search = h('input', { class: 'cat-search', type: 'search', placeholder: t("Rechercher un processeur ou une carte graphique… (ex. RTX 4060, Ryzen 5 5600, i5-12400F, carte graphique 8 Go)"), value: c.q });
    let tx = null;
    search.addEventListener('input', () => { c.q = search.value; c.open = null; clearTimeout(tx); tx = setTimeout(fillCatalog, 140); });
    const seg = (key, items, onChange) => h('div', { class: 'seg' }, items.map(([val, label]) => h('button', {
      class: c[key] === val ? 'active' : '',
      onclick: (e) => { c[key] = val; [...e.currentTarget.parentNode.children].forEach((b) => b.classList.toggle('active', b === e.currentTarget)); onChange(); },
    }, label)));
    const reload = async () => { c.data = null; await loadCatalog(); };
    state.catalogReload = reload;
    mount(
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, t("Base de composants")),
          h('p', { class: 'sub' }, t("Tous les processeurs et cartes graphiques connus de Gallium, avec leur score, leurs FPS estimés et une description."))),
        h('button', { class: 'btn', onclick: () => go('home') }, t("← Accueil"))),
      h('div', { class: 'cat-search-wrap' }, icon('M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.3-4.3'), search),
      h('div', { class: 'toolbar' },
        h('div', { id: 'cat-tabs' }),
        h('div', { id: 'cat-subs' }),
        h('div', { id: 'cat-pair', class: 'group' }),
        h('div', { class: 'group' }, t("Résolution"), seg('res', [['1080', '1080p'], ['1440', '1440p'], ['2160', '4K']], reload)),
        h('div', { class: 'group' }, t("Qualité"), seg('quality', [['low', t("Bas")], ['medium', t("Moyen")], ['high', t("Élevé")], ['ultra', t("Ultra")]], reload))),
      h('p', { class: 'note', id: 'cat-note' }),
      body);
    search.focus();
    await loadCatalog();
  }

  async function loadCatalog() {
    const c = state.catalog;
    try {
      if (!c.data) c.data = await api.catalog({ res: c.res, quality: c.quality, pairCpu: c.pairCpu, pairGpu: c.pairGpu });
      fillCatalog();
    } catch (e) {
      const b = document.getElementById('cat-body');
      if (b) b.replaceChildren(h('div', { class: 'error-box' }, t("Impossible de charger la base : {0}", [errText(e)])));
    }
  }

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // Tous les mots recherchés doivent apparaître dans le nom (« 4060 ti », « ryzen 7 5800 »…).
  function matches(item, q) {
    if (!q) return true;
    const name = ' ' + norm(item.name) + ' ' + norm(item.key) + ' ';
    const compact = name.replace(/ /g, '');
    return norm(q).split(' ').every((w) => name.includes(w) || compact.includes(w));
  }

  function fillCatalog() {
    const c = state.catalog;
    const d = c.data;
    const body = document.getElementById('cat-body');
    if (!d || !body) return;
    const lists = {
      cpu: d.cpus.filter((x) => matches(x, c.q)),
      gpu: d.gpus.filter((x) => matches(x, c.q)),
    };
    // Si la recherche ne trouve rien dans l'onglet courant mais trouve dans l'autre, on bascule.
    if (c.q && !lists[c.tab].length && lists[c.tab === 'cpu' ? 'gpu' : 'cpu'].length) c.tab = c.tab === 'cpu' ? 'gpu' : 'cpu';
    if (!CAT_SUBS[c.tab].some(([v]) => v === c.sub)) c.sub = 'all';

    const tabs = document.getElementById('cat-tabs');
    tabs.replaceChildren(h('div', { class: 'seg' }, [['cpu', t("Processeurs")], ['gpu', t("Cartes graphiques")]].map(([v, l]) => h('button', {
      class: c.tab === v ? 'active' : '', onclick: () => { c.tab = v; c.sub = 'all'; c.open = null; fillCatalog(); },
    }, `${l} (${lists[v].length})`))));
    const subs = document.getElementById('cat-subs');
    subs.replaceChildren(h('div', { class: 'seg' }, CAT_SUBS[c.tab].map(([v, l]) => h('button', {
      class: c.sub === v ? 'active' : '', onclick: () => { c.sub = v; c.open = null; fillCatalog(); },
    }, l))));
    // Composant associé (facultatif) : la carte graphique pour les processeurs, et inversement.
    const pairBox = document.getElementById('cat-pair');
    const isCpuTab = c.tab === 'cpu';
    const pairKey = isCpuTab ? c.pairGpu : c.pairCpu;
    const others = isCpuTab ? d.gpus : d.cpus;
    const mineKey = isCpuTab ? (d.mine && d.mine.gpus[0]) : (d.mine && d.mine.cpu);
    const mineItem = mineKey && (others.find((x) => x.key === mineKey) || others.find((x) => x.key === mineKey.replace(/f$/, '')));
    const sel = h('select', { class: 'pair-select' },
      h('option', { value: '' }, t("Référence : {0}", [isCpuTab ? d.refGpu : d.refCpu])),
      mineItem ? h('option', { value: mineItem.key }, `${isCpuTab ? t("Ta carte") : t("Ton processeur")} : ${mineItem.name}`) : null,
      h('optgroup', { label: isCpuTab ? t("Toutes les cartes graphiques") : t("Tous les processeurs") },
        [...others].sort((a, b) => b.score - a.score).map((x) => h('option', { value: x.key }, `${x.name} (${x.score})`))));
    sel.value = pairKey || '';
    sel.addEventListener('change', () => {
      if (isCpuTab) c.pairGpu = sel.value || null; else c.pairCpu = sel.value || null;
      c.open = null;
      state.catalogReload();
    });
    pairBox.replaceChildren(isCpuTab ? t("Avec la carte graphique") : t("Avec le processeur"), sel);

    const note = document.getElementById('cat-note');
    note.textContent = isCpuTab
      ? (d.pairGpu ? t("FPS estimés en {0} avec la {1} choisie : la carte graphique peut limiter certains jeux.", [d.resLabel, d.gpuPartner])
        : t("FPS estimés en {0} avec une {1}, pour que ce soit le processeur qui limite.", [d.resLabel, d.refGpu]))
        + t(" Le FPS moyen est la moyenne géométrique sur {0} jeux. Clique sur une ligne pour le détail par jeu.", [d.games.length])
      : (d.pairCpu ? t("FPS estimés en {0} avec le {1} choisi : le processeur peut limiter certains jeux.", [d.resLabel, d.cpuPartner])
        : t("FPS estimés en {0} avec un {1}, pour que ce soit la carte graphique qui limite.", [d.resLabel, d.refCpu]))
        + t(" Le FPS moyen est la moyenne géométrique sur {0} jeux. Clique sur une ligne pour le détail par jeu.", [d.games.length]);

    let list = lists[c.tab].filter((x) => c.sub === 'all' || x.sub === c.sub);
    const dir = c.dir;
    list = [...list].sort((a, b) => (c.sort === 'name' ? a.name.localeCompare(b.name) * -dir : (a[c.sort] - b[c.sort]) * dir));

    if (!lists.cpu.length && !lists.gpu.length) {
      body.replaceChildren(h('div', { class: 'empty' }, t("Recherche d'une estimation…")));
      const q = c.q;
      api.estimateComponent(q, { res: c.res, quality: c.quality, pairCpu: c.pairCpu, pairGpu: c.pairGpu }).then((r) => {
        if (state.catalog.q !== q || state.page !== 'catalog') return;
        body.replaceChildren(r && !r.needVram ? estimateCard(r, d) : notFound(r));
      }).catch(() => body.replaceChildren(notFound(null)));
      return;
    }
    if (!list.length) { body.replaceChildren(notFound(null)); return; }

    const sortHead = (key, label, cls) => h('button', {
      class: 'th ' + (cls || '') + (c.sort === key ? ' sorted' : ''),
      onclick: () => { if (c.sort === key) c.dir = -c.dir; else { c.sort = key; c.dir = key === 'name' ? -1 : -1; } fillCatalog(); },
    }, label, c.sort === key ? (c.dir < 0 ? ' ↓' : ' ↑') : '');
    // Les lignes sont ajoutées par petits paquets (l'interface ne se fige pas) ; au premier chargement,
    // elles apparaissent en fondu de haut en bas.
    const table = h('div', { class: 'cat-table' },
      h('div', { class: 'cat-row cat-head' },
        sortHead('name', t("Composant"), 'c-name'), sortHead('score', t("Score"), 'c-score'), sortHead('fpsAvg', t("FPS moyen"), 'c-fps'), h('div', { class: 'th c-desc' }, t("Description"))));
    body.replaceChildren(table);
    const token = ++c.token;
    const animate = c.animate;
    c.animate = false;
    let i = 0;
    const step = () => {
      if (token !== c.token || !table.isConnected) return;
      const end = Math.min(list.length, i + (i === 0 ? 18 : 24));
      const frag = document.createDocumentFragment();
      for (; i < end; i++) {
        const el = catalogRow(list[i], d);
        if (animate) { el.classList.add('appear'); el.style.animationDelay = `${(i % 24) * 18}ms`; }
        frag.append(el);
      }
      table.append(frag);
      // Image suivante si la fenêtre est visible ; sinon on continue quand même (requestAnimationFrame est suspendu).
      if (i < list.length) { if (document.hidden) setTimeout(step, 0); else requestAnimationFrame(step); }
    };
    step();
  }

  function isMine(x, d) {
    if (!d.mine) return false;
    if (x.cat === 'cpu') return !!d.mine.cpu && (d.mine.cpu === x.key || d.mine.cpu.replace(/f$/, '') === x.key);
    return d.mine.gpus.includes(x.key);
  }

  const LIMIT_SHORT = { CPU: ['CPU', t("Limité par le processeur")], GPU: ['GPU', t("Limité par la carte graphique")], VRAM: ['VRAM', t("Mémoire vidéo insuffisante")], RAM: ['RAM', t("Mémoire vive insuffisante")], Moteur: ['max', t("Plafond du moteur du jeu")] };
  function fpsGrid(x, d) {
    return h('div', { class: 'fps-grid' }, d.games.map((g) => {
      const f = x.fps[g.id];
      const lim = x.limit && x.limit[g.id];
      // On signale seulement ce qui ne vient pas du composant affiché (goulot d'étranglement).
      const show = lim && ((x.cat === 'cpu' && lim !== 'CPU') || (x.cat === 'gpu' && lim !== 'GPU'));
      return h('div', { class: 'fps-cell' }, h('span', null, g.name),
        h('span', { class: 'fps-v' }, show ? h('i', { class: 'lim', title: LIMIT_SHORT[lim][1] }, LIMIT_SHORT[lim][0]) : null,
          h('b', { style: { color: scoreColor(Math.min(100, (f / 144) * 100)) } }, `${f} FPS`)));
    }));
  }

  // Résumé du goulot d'étranglement avec le composant associé.
  function bottleneck(x, d) {
    if (!x.limit) return null;
    const lims = Object.values(x.limit);
    const partnerLimits = lims.filter((l) => (x.cat === 'cpu' ? l === 'GPU' || l === 'VRAM' : l === 'CPU')).length;
    const partner = x.cat === 'cpu' ? d.gpuPartner : d.cpuPartner;
    if (!partnerLimits) return h('p', { class: 'bn ok' }, t("Avec {0} : {1} donne toute sa mesure dans les {2} jeux.", [partner, x.cat === 'cpu' ? t("ce processeur") : t("cette carte"), lims.length]));
    return h('p', { class: 'bn' }, t("Avec {0} : {1} limite dans {2} jeu{3} sur {4} (repérés ci-dessous).", [partner, x.cat === 'cpu' ? t("la carte graphique") : t("le processeur"), partnerLimits, partnerLimits > 1 ? 'x' : '', lims.length]));
  }

  function toggleRow(x, d) {
    const c = state.catalog;
    const prev = c.open;
    c.open = prev === x.key ? null : x.key;
    for (const key of [prev, x.key]) {
      if (!key) continue;
      const el = document.querySelector(`.cat-table [data-key="${CSS.escape(c.tab + ':' + key)}"]`);
      const item = (c.tab === 'cpu' ? d.cpus : d.gpus).find((y) => y.key === key);
      if (el && item) el.replaceWith(catalogRow(item, d));
    }
  }

  function catalogRow(x, d) {
    const c = state.catalog;
    const open = c.open === x.key;
    const mine = isMine(x, d);
    const row = h('button', { class: 'cat-row' + (open ? ' open' : '') + (mine ? ' mine' : ''), onclick: () => toggleRow(x, d) },
      h('div', { class: 'c-name' }, h('span', { class: 'n' }, x.name), mine ? h('span', { class: 'pill good' }, t("Ton PC")) : null,
        x.cat === 'gpu' && x.vram ? h('span', { class: 'pill' }, t("{0} Go", [x.vram])) : null, x.cat === 'cpu' && x.threads ? h('span', { class: 'pill' }, `${x.threads} threads`) : null),
      h('div', { class: 'c-score' }, h('b', { style: { color: scoreColor(x.score) } }, x.score), bar(x.score, scoreColor(x.score), 'cat-' + x.cat + x.key)),
      h('div', { class: 'c-fps' }, h('b', null, x.fpsAvg), h('small', null, t(" FPS"))),
      h('div', { class: 'c-desc' }, x.desc));
    const dk = c.tab + ':' + x.key;
    if (!open) { row.dataset.key = dk; return row; }
    return h('div', { class: 'cat-item', 'data-key': dk }, row, h('div', { class: 'cat-detail' },
      x.cat === 'cpu' ? h('p', null, t("Jeu {0}/100 · multi-cœur {1}/100 · {2}.", [x.gaming, x.prod, x.verdict])) : h('p', null, t("Performance relative {0} (RTX 5090 = 100) · {1}.", [x.raw, x.verdict])),
      bottleneck(x, d),
      h('h4', null, t("FPS par jeu ({0}, qualité {1})", [d.resLabel, { low: t("Basse"), medium: t("Moyenne"), high: t("Élevée"), ultra: t("Ultra") }[state.catalog.quality]])),
      fpsGrid(x, d)));
  }

  function estimateCard(r, d) {
    return h('div', { class: 'card estimate' },
      h('div', { class: 'est-head' },
        h('div', null, h('span', { class: 'pill warn' }, r.estimated ? t("Absent de la base · estimation") : t("Reconnu dans la base")),
          h('h3', null, r.name), h('p', { class: 'sub' }, `${!r.estimated ? t("Valeur de la base") : r.source[0].toUpperCase() + r.source.slice(1)}.`)),
        h('div', { class: 'est-score' }, gauge(r.score, 84, 8, 'est-' + r.name), h('div', { class: 'l' }, r.verdict))),
      h('div', { class: 'est-kpis' },
        kpi(t("FPS moyen"), r.fpsAvg, 'FPS'),
        r.cat === 'cpu' ? kpi(t("Jeu"), r.gaming, '/100') : kpi('VRAM', r.vram || '?', t("Go")),
        r.cat === 'cpu' ? kpi('Multi-cœur', r.prod, '/100') : kpi(t("Performance"), r.raw, '(5090 = 100)')),
      h('p', { class: 'd' }, r.desc),
      h('h4', null, t("FPS par jeu ({0})", [d.resLabel])),
      fpsGrid(r, d),
      h('p', { class: 'note' }, t("Estimation à partir des composants les plus proches connus de Gallium") + (r.cat === 'gpu' ? t(" ou de la VRAM indiquée") : '') + t(" : à prendre comme un ordre de grandeur.")));
  }

  function notFound(r) {
    return h('div', { class: 'not-found' }, notFoundIcon(),
      h('h3', null, t("Recherche introuvable")),
      h('p', null, r && r.needVram
        ? t("Carte graphique inconnue : ajoute sa quantité de VRAM à la recherche (ex. « RTX 9999 12 Go ») pour obtenir une estimation.")
        : t("Aucun composant ne correspond. Essaie un nom de modèle (« RTX 4060 », « Ryzen 5 5600 », « i5-12400F ») ou décris une carte graphique par sa VRAM (« carte graphique 8 Go »).")));
  }

  // ------------------------------------------------------------------ modes et paramètres
  // Trois modes : l'essentiel (bouton « Passer »), particulier et professionnel.
  const MODE_FEATURES = {
    base: [],
    perso: ['monitor', 'games', 'catalog', 'tests'],
    pro: ['monitor', 'games', 'catalog', 'tests', 'drivers', 'clients'],
  };
  const has = (feature) => (MODE_FEATURES[(state.settings && state.settings.mode) || 'pro'] || MODE_FEATURES.pro).includes(feature);
  const PAGE_FEATURE = { monitor: 'monitor', games: 'games', catalog: 'catalog' };
  const pageAllowed = (id) => !PAGE_FEATURE[id] || has(PAGE_FEATURE[id]);

  // Ce que chaque mode contient, pour l'écran de choix (ligne : [libellé, particulier, professionnel]).
  const MODE_ROWS = [
    [t("Diagnostic de santé des composants"), true, true],
    [t("Analyse et optimisation de Windows"), true, true],
    [t("Rapport PDF / HTML"), true, true],
    [t("Moniteur en temps réel"), true, true],
    [t("Jeux et base de composants"), true, true],
    [t("Tests de stabilité processeur, mémoire et carte graphique"), true, true],
    [t("Liste détaillée des pilotes"), false, true],
    [t("Fiches clients et historique multi-PC"), false, true],
    [t("Rapport avec client, référence et n° de série"), false, true],
  ];
  const MODE_INFO = {
    perso: { title: t("Particulier"), sub: t("Joueur, streamer, créateur ou simple curieux : comprendre et améliorer ton propre PC."), icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    pro: { title: t("Professionnel"), sub: t("Réparateur, technicien, atelier : diagnostiquer les PC de tes clients et leur remettre un rapport."), icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' },
    base: { title: t("Essentiel"), sub: t("Diagnostic, analyse, optimisation et rapport, sans les outils avancés.") },
  };

  function modeCard(id, onPick) {
    const info = MODE_INFO[id];
    const col = id === 'perso' ? 1 : 2;
    return h('button', { class: 'mode-card', onclick: () => onPick(id) },
      h('div', { class: 'mode-icon' }, icon(info.icon)),
      h('div', { class: 'mode-title' }, info.title),
      h('div', { class: 'mode-sub' }, info.sub),
      h('ul', { class: 'mode-list' }, MODE_ROWS.map((r) => h('li', { class: r[col] ? 'yes' : 'no' },
        h('span', { class: 'mk' }, r[col] ? '✓' : '—'), r[0]))),
      h('div', { class: 'mode-go' }, t("Choisir « {0} »", [info.title])));
  }

  // Écran d'accueil : choix du mode (au premier lancement, ou à chaque lancement si on ne s'en souvient pas).
  // Choix de la langue dès le premier écran : Gallium redémarre dans la langue choisie (l'écran de choix revient).
  function welcomeLang() {
    const sel = h('select', { class: 'pair-select' }, LANGS.filter(([code]) => !state.langsAvailable || state.langsAvailable.includes(code))
      .map(([code, name]) => h('option', { value: code }, name)));
    sel.value = (state.settings && state.settings.lang) || 'en';
    sel.addEventListener('change', async () => {
      await api.setSettings({ lang: sel.value });
      api.relaunch();
    });
    return h('label', { class: 'welcome-lang' }, icon('M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20'), sel);
  }

  function showWelcome() {
    return new Promise((resolve) => {
      const remember = h('input', { type: 'checkbox' });
      remember.checked = true;
      const done = async (mode) => {
        state.settings = await api.setSettings({ mode, remember: remember.checked, chosen: true });
        overlay.classList.add('leaving');
        setTimeout(() => { overlay.remove(); resolve(); }, 260);
      };
      const overlay = h('div', { class: 'welcome' },
        h('div', { class: 'welcome-inner' },
          welcomeLang(),
          h('div', { class: 'welcome-brand' }, h('img', { src: 'logo.svg', alt: '' }), h('span', null, 'Gallium')),
          h('h1', null, t("Comment veux-tu utiliser Gallium ?")),
          h('p', { class: 'sub' }, t("Choisis ce qui te correspond : l'application n'affichera que les outils utiles. Tu pourras changer à tout moment dans les Paramètres.")),
          h('div', { class: 'mode-cards' }, modeCard('perso', done), modeCard('pro', done)),
          h('div', { class: 'welcome-foot' },
            h('label', { class: 'check-label' }, remember, t("Se souvenir de mon choix")),
            h('button', { class: 'btn ghost', onclick: () => done('base') }, t("Passer · seulement l'essentiel")))));
      document.body.append(overlay);
    });
  }

  const LANGS = [
    ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'],
    ['nl', 'Nederlands'], ['pl', 'Polski'], ['ro', 'Română'], ['sv', 'Svenska'], ['tr', 'Türkçe'], ['ru', 'Русский'],
    ['uk', 'Українська'], ['ar', 'العربية'], ['hi', 'हिन्दी'], ['id', 'Bahasa Indonesia'], ['vi', 'Tiếng Việt'],
    ['zh', '简体中文'], ['ja', '日本語'], ['ko', '한국어'],
  ];

  // À propos : version, confidentialité, logiciels libres utilisés, licence.
  function aboutSection() {
    const licBox = h('pre', { class: 'licence' });
    const det = h('details', { class: 'oks' }, h('summary', null, t("Afficher la licence")), licBox);
    det.addEventListener('toggle', async () => { if (det.open && !licBox.textContent) licBox.textContent = await api.licence(); });
    return h('section', null, h('h2', null, t("À propos")),
      h('div', { class: 'card about' },
        h('div', { class: 'about-head' }, h('img', { src: 'logo.svg', alt: '' }),
          h('div', null, h('b', null, 'Gallium'), h('div', { class: 'muted' }, t("Version {0}", [(state.appInfo && state.appInfo.version) || '?'])))),
        h('p', null, h('b', null, t("Confidentialité"), ' : '), t("Gallium fonctionne entièrement sur ton PC : aucune donnée n'est envoyée. Seuls un ping vers ta box et vers 1.1.1.1 (Cloudflare) servent à mesurer la latence du réseau.")),
        h('p', null, h('b', null, t("Licence"), ' : '), t("Gallium est un logiciel libre sous licence GPL-3.0 : tu peux l'utiliser, l'étudier, le modifier et le redistribuer librement.")),
        h('p', { class: 'muted' }, t("Logiciels libres utilisés : Electron, Chromium et systeminformation, sous leurs propres licences (fournies avec l'application).")),
        state.appInfo && state.appInfo.repoUrl ? h('div', null, h('button', { class: 'btn small', onclick: () => api.openRepo() }, t("Code source sur GitHub"))) : null,
        det));
  }

  function renderSettings() {
    const s = state.settings;
    const modeBtn = (id) => h('button', {
      class: 'mode-pick' + (s.mode === id ? ' active' : ''),
      onclick: async () => {
        state.settings = await api.setSettings({ mode: id });
        renderNav();
        renderSettings();
        toast(t("Mode « {0} » activé.", [MODE_INFO[id].title]));
      },
    }, h('b', null, MODE_INFO[id].title), h('span', null, MODE_INFO[id].sub));
    const ask = h('input', { type: 'checkbox' });
    ask.checked = !s.remember;
    ask.addEventListener('change', async () => { state.settings = await api.setSettings({ remember: !ask.checked }); });
    const lang = h('select', { class: 'pair-select' }, LANGS.filter(([code]) => !state.langsAvailable || state.langsAvailable.includes(code)).map(([code, name]) => h('option', { value: code }, name)));
    lang.value = s.lang || 'fr';
    lang.addEventListener('change', async () => {
      state.settings = await api.setSettings({ lang: lang.value });
      // Tous les textes (interface et moteur) changent au redémarrage ; on ne redemande pas le mode.
      try { sessionStorage.setItem('skipWelcome', '1'); } catch { /* indisponible */ }
      toast(t('Gallium redémarre pour appliquer la langue…'));
      setTimeout(() => api.relaunch(), 700);
    });
    mount(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, t("Paramètres")), h('p', { class: 'sub' }, t("Choisis le mode d'utilisation et la langue de Gallium.")))),
      h('section', null, h('h2', null, t("Mode d'utilisation")),
        h('div', { class: 'mode-picks' }, modeBtn('perso'), modeBtn('pro'), modeBtn('base')),
        h('label', { class: 'check-label', style: { marginTop: '14px' } }, ask, t("Me demander le mode à chaque démarrage"))),
      state.appInfo && state.appInfo.supportUrl ? h('section', null, h('h2', null, t("Soutenir Gallium")),
        h('div', { class: 'card support-card' },
          h('p', null, t("Gallium est gratuit et open source. S'il t'est utile, tu peux soutenir son développement avec un don.")),
          h('button', { class: 'btn primary', onclick: () => api.openSupport() }, '♥ ', t("Soutenir Gallium")))) : null,
      h('section', null, h('h2', null, t("Langue")),
        h('div', { class: 'group' }, lang),
        h('p', { class: 'note' }, t("Gallium redémarre pour appliquer la langue. Les analyses et diagnostics déjà enregistrés restent dans leur langue d'origine jusqu'à ce que tu les relances."))),
      aboutSection());
  }

  // ------------------------------------------------------------------ démarrage
  async function boot() {
    try { state.settings = await api.getSettings(); } catch { /* réglages par défaut */ }
    try { state.langsAvailable = await api.languages(); } catch { state.langsAvailable = null; }
    try { state.appInfo = await api.appInfo(); } catch { state.appInfo = null; }
    await applyLanguage();
    // Choix du mode au premier lancement, ou à chaque lancement si l'utilisateur ne veut pas qu'on s'en souvienne.
    let skip = false;
    try { skip = sessionStorage.getItem('skipWelcome') === '1'; sessionStorage.removeItem('skipWelcome'); } catch { /* indisponible */ }
    if (!skip && (!state.settings.chosen || !state.settings.remember)) await showWelcome();
    renderNav();
    loading(t('Analyse de ta configuration…'));
    try {
      [state.hw, state.last, state.health, state.stress, state.history, state.gpuStress, state.drivers] = await Promise.all([
        api.getHardware(false), api.lastAnalysis(), api.lastHealth(), api.lastStress(), api.history(), api.lastGpuStress(), api.lastDrivers(),
      ]);
      // Configuration issue du cache : on affiche tout de suite, puis on remplace par la détection à jour.
      if (state.hw.stale) {
        api.freshHardware().then((hw) => {
          if (!hw) return;
          state.hw = hw;
          if (state.page === 'home') renderHome();
        }).catch(() => {});
      }
      const d = (state.hw.displays || []).find((x) => x.main) || state.hw.displays[0];
      if (d) state.opts.res = d.resY >= 2000 ? '2160' : d.resY >= 1300 ? '1440' : '1080';
      renderFoot();
      go(state.page || 'home');
    } catch (e) {
      mount(h('div', { class: 'error-box' }, t("Impossible de lire la configuration : {0}", [e.message])));
    }
  }
  boot();
})();
