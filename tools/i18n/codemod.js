// Enveloppe les textes affichés dans t('…') pour la traduction.
// Usage : node codemod.js [--dry] fichier...   (écrit les fichiers, et extrait les clés dans keys.json)
const ts = require(require('path').join(__dirname, '..', '..', 'node_modules', 'typescript'));
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY = args[0] === '--dry';
const FILES = args.filter((a) => a !== '--dry');

const FRENCH = /[a-zà-ÿ]/i;
// Propriétés dont la valeur est un identifiant technique, jamais affiché tel quel.
const SKIP_KEYS = new Set(['class', 'className', 'id', 'type', 'd', 'viewBox', 'rel', 'href', 'src', 'key', 'kind', 'cat', 'severity',
  'line', 'family', 'vendor', 'mode', 'status', 'link', 'tweak', 'limit', 'value', 'name', 'category', 'icon', 'transform', 'fill', 'stroke',
  'text-anchor', 'dominant-baseline', 'preserveAspectRatio', 'vector-effect', 'stroke-linecap', 'stroke-linejoin', 'stroke-width',
  'stroke-dasharray', 'data-key', 'format', 'contentType', 'match', 'appId', 'pageSize', 'marginType', 'channel', 'res', 'quality', 'segment',
  'suffix', 'unit_', 'cpu', 'gpu', 'list', 'epic', 'health', 'title_', 'accept', 'role', 'lang', 'dir', 'autocomplete', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r']);
// Fonctions dont les arguments texte sont techniques (sélecteurs, canaux IPC, commandes, expressions…).
const SKIP_CALLS = new Set(['require', 'ps', 'psJson', 'run', 'regGet', 'regSet', 'regDelete', 'handle', 'invoke', 'on', 'once', 'send', 'sendSync',
  'removeListener', 'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'getElementById', 'createElement',
  'createElementNS', 'setAttribute', 'getAttribute', 'removeAttribute', 'match', 'matchAll', 'test', 'replace', 'split', 'startsWith', 'endsWith',
  'includes', 'indexOf', 'padStart', 'padEnd', 'RegExp', 'appendSwitch', 'setPath', 'getPath', 'svgEl', 'execFile', 'join', 'readJson', 'writeJson',
  'dataFile', 'openPath', 'icon', 'parse', 'toLocaleString', 'toLocaleDateString', 'get', 'has', 'set', 'delete', 'escape', 'setItem', 'getItem',
  'removeItem', 'resolve', 'basename', 'extname', 'existsSync', 'readFileSync', 'writeFileSync', 'mkdirSync', 'statSync', 'readdirSync', 't',
  'localeCompare', 'normalize', 'spawn', 'Worker', 'openExternal', 'setFlagsFromString', 'runInNewContext',
  'fsp', 'stat', 'open', 'unlink', 'readdir', 'copyFileSync', 'rmSync', 'loadURL', 'loadFile', 'shot', 'dispatchEvent', 'Event', 'h']);
// Variables dont le contenu est technique (scripts PowerShell, tables de données, tracés SVG, noms de langues…).
const SKIP_VARS = /^(PS_\w+|\w+_DATA|\w+_SRC|ICONS|LANGS|BUGCHECK|NVME_MODEL|SSD_MODELS|GUID|KEY|SMBIOS_RAM|VIRTUAL|RAM_SRC|CPU_SRC|WORKER_SRC|GUID_RE|DEFAULT_SETTINGS)$/;
const SKIP_EXACT = new Set(['Moteur', 'GPU', 'CPU', 'RAM', 'VRAM', 'NVMe', 'SSD', 'HDD', 'Windows', 'Streaming', 'Gallium', 'Healthy', 'Malachite', 'PC Optimizer', 'use strict']);

function looksHuman(s) {
  if (!FRENCH.test(s)) return false;
  if (SKIP_EXACT.has(s.trim())) return false;
  if (/^M[\d.\s-]/.test(s)) return false; // tracé SVG
  if (/^[A-Z]:\\/.test(s)) return false; // chemin Windows
  if (/^(radeon|vega|uhd|hd|arc|rtx|gtx|gt|rx|iris|mx|quadro|nvidia t)( [a-z0-9]+)+$/.test(s) || /^(radeon|arc) d/.test(s)) return false; // clés de cartes graphiques
  if (/^intel amd/.test(s)) return false;
  if (/\$[A-Za-z_({]|Get-\w|Select-Object|ConvertTo-Json|-ErrorAction/.test(s)) return false; // PowerShell
  if (/var\(--|[{};]\s*$|^\s*[.#][\w-]|:\s*\d+px|^\w+-\w+-?\w*$/.test(s)) return false; // CSS / sélecteurs / identifiants
  if (/^(ms-settings|data:|https?:|file:)/.test(s) || /^[\w./\\-]+\.(js|json|svg|png|html|pdf|dmp|exe|sys|inf|bin)$/i.test(s)) return false;
  if (/<\/?[a-z][\s\S]*>/i.test(s)) return false; // HTML (rapport) : traité à la main
  if (/^[a-z0-9_:-]+$/.test(s)) return false; // identifiants en minuscules
  return /\s/.test(s) || /[à-ÿÀ-Ý…«»’]/.test(s) || /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(s);
}

function calleeName(call) {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isNewExpression && ts.isNewExpression(call) && ts.isIdentifier(e)) return e.text;
  return '';
}

const CLASS_KEYS = new Set(['class', 'className', 'key', 'id', 'd', 'data-key']);
function skipByContext(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isExpressionStatement(p)) return true; // directive « use strict »
  // Valeur (même composée : 'a' + (x ? ' b' : '')) d'une propriété technique comme class.
  for (let n = p, child = node; n && !ts.isFunctionLike(n) && !ts.isSourceFile(n); child = n, n = n.parent) {
    if (ts.isPropertyAssignment(n) && n.initializer === child && CLASS_KEYS.has(String(n.name && (n.name.text || n.name.escapedText)))) return true;
    if (ts.isCallExpression(n) && ['bar', 'gauge'].includes(calleeName(n)) && n.arguments.indexOf(child) >= 2) return true;
    if (ts.isCallExpression(n) && ['remember', 'startValue', 'resetShown', 'setBar', 'shown'].includes(calleeName(n))) return true;
    if (ts.isStatement(n) || ts.isVariableDeclaration(n)) break;
  }
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isPropertyAssignment(p) && p.initializer === node) {
    const k = String(p.name && (p.name.text || (p.name.escapedText)));
    // « name » : noms propres (jeux, composants) sauf s'il s'agit d'une phrase en français.
    if (k === 'name' && /[à-ÿ]/i.test(node.text || '')) return false;
    if (SKIP_KEYS.has(k)) return true;
  }
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
  if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments && p.arguments.includes(node)) {
    const name = calleeName(p);
    // classList.add/remove/toggle/contains : noms de classes CSS.
    if (['add', 'remove', 'toggle', 'contains'].includes(name) && ts.isPropertyAccessExpression(p.expression) && /classList$/.test(p.expression.expression.getText())) return true;
    if (SKIP_CALLS.has(name)) {
      // h(tag, attrs, ...enfants) : seul le nom de balise est technique.
      if (name === 'h') return p.arguments.indexOf(node) === 0;
      return true;
    }
    // analysis.js : add(gravité, catégorie, …) — la catégorie reste un identifiant (traduite à l'affichage).
    if (name === 'add' && p.arguments.indexOf(node) <= 1 && /analysis\.js$/.test(currentFile)) return true;
  }
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  return false;
}

function insideSkipVar(node) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && SKIP_VARS.test(n.name.text)) return true;
    if (ts.isPropertyAssignment(n) && n.name && SKIP_VARS.test(String(n.name.text || ''))) return true;
    // Objet avec une propriété technique imbriquée (ex. style: { … }) : on garde le contexte normal.
  }
  return false;
}

let currentFile = '';
const keys = new Map();

function transform(file) {
  currentFile = file;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let count = 0;

  const emit = (node) => {
    const start = node.getStart(sf);
    let text = src.slice(start, node.end);
    // Cible ?
    if (process.env.DEBUG && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[à-ÿ]/i.test(node.text) && node.text.includes(' ')
      && !(looksHuman(node.text) && !skipByContext(node) && !insideSkipVar(node))) {
      console.log('  ignoré', JSON.stringify(node.text.slice(0, 70)), '| humain', looksHuman(node.text), '| contexte', skipByContext(node), '| var', insideSkipVar(node), '| parent', ts.SyntaxKind[node.parent.kind]);
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && looksHuman(node.text) && !skipByContext(node) && !insideSkipVar(node)) {
      count++;
      keys.set(node.text, (keys.get(node.text) || 0) + 1);
      return `t(${JSON.stringify(node.text)})`;
    }
    if (ts.isTemplateExpression(node) && !skipByContext(node) && !insideSkipVar(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
      const fixed = parts.join(' ');
      if (looksHuman(fixed.replace(/\s+/g, ' ').trim()) && fixed.replace(/[\s\d%·,.:;()\-→/+×|°'"!?…]/g, '').length >= 2) {
        let key = node.head.text;
        node.templateSpans.forEach((s, i) => { key += `{${i}}` + s.literal.text; });
        if (!/\{\d+\}\s*$/.test(key) || key.replace(/\{\d+\}/g, '').trim().length > 0) {
          count++;
          keys.set(key, (keys.get(key) || 0) + 1);
          const exprs = node.templateSpans.map((s) => emit(s.expression));
          return `t(${JSON.stringify(key)}, [${exprs.join(', ')}])`;
        }
      }
    }
    // Sinon : on recopie le texte en remplaçant les enfants transformés.
    const children = [];
    ts.forEachChild(node, (c) => { children.push(c); });
    for (let i = children.length - 1; i >= 0; i--) {
      const c = children[i];
      const cs = c.getStart(sf) - start;
      const ce = c.end - start;
      const out = emit(c);
      if (out !== src.slice(c.getStart(sf), c.end)) text = text.slice(0, cs) + out + text.slice(ce);
    }
    return text;
  };

  let out = src.slice(0, sf.getStart(sf)) + emit(sf) + src.slice(sf.end);
  // Les modules du moteur importent t().
  if (count && /[\\/]lib[\\/]/.test(file) && !/require\('\.\/i18n'\)/.test(out)) {
    out = out.replace(/^'use strict';\n/, "'use strict';\nconst { t } = require('./i18n');\n");
  }
  if (!DRY) fs.writeFileSync(file, out);
  console.log(path.basename(file).padEnd(14), count, 'textes enveloppés');
}

for (const f of FILES) transform(f);
fs.writeFileSync(path.join(__dirname, 'keys.json'), JSON.stringify([...keys.keys()].sort(), null, 1));
console.log('clés distinctes :', keys.size);
