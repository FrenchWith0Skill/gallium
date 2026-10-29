// Assemble une langue à partir de blocs ordonnés (tableaux JSON alignés sur locales/_source.json) et la vérifie.
// Usage : node merge.js <code> <bloc1.json> <bloc2.json> ...
const fs = require('fs');
const path = require('path');
const [code, ...chunks] = process.argv.slice(2);
const keys = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', '..', 'locales', '_source.json'), 'utf8'));
const values = chunks.flatMap((c) => JSON.parse(fs.readFileSync(c, 'utf8')));
if (values.length !== keys.length) {
  console.error(`ERREUR : ${values.length} traductions pour ${keys.length} textes`);
  process.exit(1);
}
const ph = (s) => [...new Set((s.match(/\{\d+\}/g) || []))].sort().join(',');
const problems = [];
const out = {};
keys.forEach((k, i) => {
  const v = values[i];
  if (typeof v !== 'string' || !v.length) { problems.push(`#${i} vide`); return; }
  const missing = (k.match(/\{\d+\}/g) || []).filter((p) => !v.includes(p));
  const extra = (v.match(/\{\d+\}/g) || []).filter((p) => !k.includes(p));
  if (extra.length) problems.push(`#${i} variable inconnue ${extra} : ${JSON.stringify(k)}`);
  // Une variable peut disparaître seulement si elle ne sert qu'au pluriel (texte source « mot{n} »).
  for (const p of missing) {
    const pluralOnly = new RegExp(`[a-zà-ÿ]\\${p.slice(0, -1)}\\}`, 'i').test(k);
    if (!pluralOnly) problems.push(`#${i} variable perdue ${p} : ${JSON.stringify(k)} → ${JSON.stringify(v)}`);
  }
  out[k] = v;
});
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
fs.writeFileSync(path.join(__dirname, '..', '..', 'locales', `${code}.json`), JSON.stringify(out, null, 1) + '\n');
console.log(`${code} : ${keys.length} textes, contrôles OK`);
