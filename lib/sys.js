'use strict';
// Petits utilitaires pour interroger Windows (PowerShell, registre, commandes).
const { execFile } = require('child_process');

// Lance une commande. Renvoie la sortie texte, ou null en cas d'erreur / timeout.
function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? null : String(stdout));
    });
  });
}

function ps(script, timeout = 20000) {
  return run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' + script],
    timeout
  );
}

// Exécute un script PowerShell et renvoie toujours un tableau d'objets (ou null).
async function psJson(script, timeout) {
  const out = await ps(script + ' | ConvertTo-Json -Compress -Depth 3', timeout);
  if (!out || !out.trim()) return null;
  try {
    const j = JSON.parse(out);
    return Array.isArray(j) ? j : [j];
  } catch {
    return null;
  }
}

// Lit une valeur du registre. Renvoie un nombre (REG_DWORD), une chaîne (REG_SZ) ou null.
async function regGet(key, name) {
  const out = await run('reg', ['query', key, '/v', name], 8000);
  if (!out) return null;
  const m = out.match(/REG_\w+\s+(.+)\s*$/m);
  if (!m) return null;
  const v = m[1].trim();
  if (/^0x[0-9a-f]+$/i.test(v)) return parseInt(v, 16);
  return v;
}

// Écrit une valeur dans le registre (HKCU uniquement côté appelants). Renvoie true si la commande réussit.
async function regSet(key, name, type, value) {
  const out = await run('reg', ['add', key, '/v', name, '/t', type, '/d', String(value), '/f'], 8000);
  return out !== null;
}

async function regDelete(key, name) {
  const out = await run('reg', ['delete', key, '/v', name, '/f'], 8000);
  return out !== null;
}

module.exports = { run, ps, psJson, regGet, regSet, regDelete };
