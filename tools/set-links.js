// Renseigne tes liens dans tout le projet en une fois (README, bouton Sponsor de GitHub, application).
// Usage : node tools/set-links.js --github TON-PSEUDO/gallium --kofi TON-PSEUDO-KOFI --name "Ton nom"
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const args = {};
process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) args[a.slice(2)] = all[i + 1]; });

const repo = args.github;
const kofi = args.kofi;
const name = args.name;
if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('--github doit être de la forme pseudo/depot (ex. alex/gallium)');
if (kofi && !/^[\w-]+$/.test(kofi)) throw new Error('--kofi doit être ton nom d\'utilisateur Ko-fi (ex. alexdev)');
if (!repo && !kofi && !name) {
  console.log('Usage : node tools/set-links.js --github pseudo/gallium --kofi pseudo-kofi --name "Ton nom"');
  process.exit(1);
}

const replaceIn = (rel, pairs) => {
  const f = path.join(ROOT, rel);
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  for (const [a, b] of pairs) s = s.split(a).join(b);
  if (s !== before) { fs.writeFileSync(f, s); console.log('mis à jour :', rel); }
};

const pairs = [];
if (repo) pairs.push(['TON-PSEUDO/gallium', repo]);
if (kofi) pairs.push(['TON-PSEUDO-KOFI', kofi]);
if (name) pairs.push(['TON-NOM', name]);
replaceIn('README.md', pairs);
replaceIn('.github/FUNDING.yml', pairs);

const pkgFile = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.gallium = pkg.gallium || {};
if (kofi) pkg.gallium.supportUrl = `https://ko-fi.com/${kofi}`;
if (repo) {
  pkg.gallium.repoUrl = `https://github.com/${repo}`;
  pkg.repository = { type: 'git', url: `https://github.com/${repo}.git` };
  pkg.homepage = `https://github.com/${repo}`;
}
if (name) pkg.author = name;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log('mis à jour : package.json');
console.log('Reconstruis ensuite l\'application (npm run dist) pour que les boutons « Soutenir Gallium » et « Code source » apparaissent.');
