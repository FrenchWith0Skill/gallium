// Contrôle toutes les langues : textes manquants ou en trop, variables {n} perdues ou inventées,
// textes laissés identiques au français. Usage : node tools/i18n/check.js
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', '..', 'locales');
const keys = JSON.parse(fs.readFileSync(path.join(DIR, '_source.json'), 'utf8'));
let failed = false;
for (const file of fs.readdirSync(DIR).filter((f) => /^[a-z]{2}\.json$/.test(f))) {
  const code = file.slice(0, 2);
  const d = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const missing = keys.filter((k) => !(k in d) || typeof d[k] !== 'string' || !d[k].length);
  const extra = Object.keys(d).filter((k) => !keys.includes(k));
  const badVars = [];
  let same = 0;
  for (const k of keys) {
    const v = d[k] || '';
    for (const p of v.match(/\{\d+\}/g) || []) if (!k.includes(p)) badVars.push(`${p} inventée : ${k}`);
    for (const p of k.match(/\{\d+\}/g) || []) {
      // Variable de pluriel seule (« composant{1} ») : peut disparaître.
      const pluralOnly = new RegExp(`[a-zà-ÿ]\\{${p.slice(1, -1)}\\}`, 'i').test(k);
      if (!v.includes(p) && !pluralOnly) badVars.push(`${p} perdue : ${k}`);
    }
    if (v === k && /[a-zé]{4,} [a-zé]{4,}/.test(k)) same++;
  }
  const ok = !missing.length && !extra.length && !badVars.length;
  if (!ok) failed = true;
  console.log(`${code}  ${Object.keys(d).length} textes · manquants ${missing.length} · en trop ${extra.length} · variables KO ${badVars.length} · identiques au français ${same}${ok ? '' : '  ← À CORRIGER'}`);
  for (const b of badVars.slice(0, 5)) console.log('     ' + b);
}
process.exit(failed ? 1 : 0);
