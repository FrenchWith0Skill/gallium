// Extrait tous les textes à traduire (premier argument des appels t("…")) + les textes traduits à l'affichage.
const ts = require(require('path').join(__dirname, '..', '..', 'node_modules', 'typescript'));
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..', '..');
const files = ['main.js', 'renderer/app.js', ...fs.readdirSync(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.js')).map((f) => 'lib/' + f)];
const keys = new Map();
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 't' && n.arguments[0]
      && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) {
      const k = n.arguments[0].text;
      if (!keys.has(k)) keys.set(k, rel);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
// Textes traduits seulement à l'affichage : causes probables des écrans bleus, catégories de l'analyse.
const health = fs.readFileSync(path.join(ROOT, 'lib/health.js'), 'utf8');
const bug = health.slice(health.indexOf('const BUGCHECK'), health.indexOf('};', health.indexOf('const BUGCHECK')));
for (const m of bug.matchAll(/\[\s*'[A-Z0-9_]+',\s*'((?:[^'\\]|\\.)+)'\s*\]/g)) keys.set(m[1].replace(/\\'/g, "'"), 'lib/health.js (BUGCHECK)');
for (const c of ['Windows', 'Stockage', 'Matériel', 'Performance', 'Pilotes', 'Réseau', 'Streaming', 'Sécurité', 'Jeu']) if (!keys.has(c)) keys.set(c, 'catégorie');
const list = [...keys.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
fs.writeFileSync(path.join(ROOT, 'locales', '_source.json'), JSON.stringify(list, null, 1) + '\n');
console.log(list.length, 'textes →', 'locales/_source.json');
if (process.argv[2] === '--pseudo') {
  const pseudo = {};
  for (const k of list) pseudo[k] = '⟦' + k + '⟧';
  fs.writeFileSync(path.join(ROOT, 'locales', 'qa.json'), JSON.stringify(pseudo));
  console.log('pseudo-langue écrite : locales/qa.json');
}
