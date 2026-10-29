// Rapport : enveloppe le texte situé entre les balises HTML des modèles (`<b>Texte</b>`) dans ${t("…")}.
const ts = require(require('path').join(__dirname, '..', '..', 'node_modules', 'typescript'));
const fs = require('fs');
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const FR = /[A-Za-zÀ-ÿ]{2,}/;
const keys = new Set();

// Texte entre « > » (ou début de segment) et « < » (ou fin de segment), hors CSS.
function wrapRuns(raw, inTemplate) {
  return raw.replace(/(^|>)([^<>`]*?)(?=<|$)/g, (m, open, text) => {
    if (!FR.test(text) || /[{};]|\$\{|^\s*[\w-]+\s*:/.test(text) || /^\s*[–·:\-/]?\s*$/.test(text)) return m;
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    const core = text.slice(lead.length, text.length - trail.length);
    if (!core || !FR.test(core)) return m;
    // Le texte brut d'un modèle peut contenir des échappements : on garde la forme lisible.
    const cooked = core.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    keys.add(cooked);
    const call = `t(${JSON.stringify(cooked)})`;
    return open + lead + (inTemplate ? '${' + call + '}' : "' + " + call + " + '") + trail;
  });
}

const edits = [];
const visit = (node) => {
  const insideStyle = (txt) => /<style|<meta|<!doctype/i.test(txt);
  if ((ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /<[a-z/]/i.test(node.getText(sf)) && !insideStyle(node.getText(sf))) {
    const parts = ts.isTemplateExpression(node) ? [node.head, ...node.templateSpans.map((s) => s.literal)] : [node];
    for (const part of parts) {
      const start = part.getStart(sf);
      const full = src.slice(start, part.end);
      // Contenu brut du segment, sans les délimiteurs ` ${ }.
      const lead = full.match(/^(`|\})/)[0].length;
      const tail = (full.match(/(`|\$\{)$/) || [''])[0].length;
      const raw = full.slice(lead, full.length - tail);
      const out = wrapRuns(raw, true);
      if (out !== raw) edits.push([start + lead, start + lead + raw.length, out]);
    }
  } else if (ts.isStringLiteral(node) && /<[a-z/]/i.test(node.text) && !insideStyle(node.text)) {
    const start = node.getStart(sf);
    const q = src[start];
    const raw = src.slice(start + 1, node.end - 1);
    const out = q === "'" ? wrapRuns(raw, false) : raw;
    if (out !== raw) edits.push([start + 1, node.end - 1, out]);
  }
  ts.forEachChild(node, visit);
};
visit(sf);
edits.sort((a, b) => b[0] - a[0]);
let out = src;
for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
fs.writeFileSync(file, out);
console.log(edits.length, 'segments modifiés,', keys.size, 'textes :');
console.log([...keys].map((k) => '  ' + JSON.stringify(k)).join('\n'));
