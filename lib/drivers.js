'use strict';
const { t } = require('./i18n');
// Liste des pilotes installés (Win32_PnPSignedDriver) : version, date, éditeur, signature.
// Signale les pilotes non signés et les pilotes tiers très anciens.
const { psJson } = require('./sys');

const isWin = process.platform === 'win32';
const OLD_YEARS = 5;

const PS_DRIVERS = `
$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_PnPSignedDriver | Where-Object DeviceName | ForEach-Object {
  [pscustomobject]@{ N=$_.DeviceName; V=$_.DriverVersion; D=$(if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}); P=$_.DriverProviderName;
    M=$_.Manufacturer; C=$_.DeviceClass; S=$_.IsSigned; G=$_.Signer; I=$_.InfName }
}`;

// Les pilotes intégrés à Windows portent souvent la date fictive du 21/06/2006, et les fichiers INF du chipset
// Intel celle du 18/07/1968 (pour ne jamais passer devant un vrai pilote) : ils ne sont pas « anciens ».
const isMicrosoft = (p) => /^microsoft/i.test(p || '');

function classify(list, now = Date.now()) {
  const drivers = list.map((d) => {
    const provider = d.P || d.M || null;
    const years = d.D && d.D >= '2000' ? (now - new Date(d.D).getTime()) / (365.25 * 86400000) : null;
    const issues = [];
    let status = 'ok';
    if (d.S === false) { status = 'bad'; issues.push(t("non signé")); }
    if (years != null && years > OLD_YEARS && !isMicrosoft(provider)) { if (status === 'ok') status = 'warn'; issues.push(t("date de {0} ans", [Math.floor(years)])); }
    return {
      name: d.N, version: d.V || null, date: d.D || null, provider, cls: d.C || null, signed: d.S !== false,
      signer: d.G || null, inf: d.I || null, status, issues,
    };
  });
  const order = { bad: 0, warn: 1, ok: 2 };
  drivers.sort((a, b) => order[a.status] - order[b.status] || String(a.name).localeCompare(String(b.name), 'fr'));
  return {
    finishedAt: new Date(now).toISOString(), drivers,
    counts: {
      total: drivers.length,
      unsigned: drivers.filter((d) => !d.signed).length,
      old: drivers.filter((d) => d.issues.some((i) => /ans$/.test(i))).length,
      thirdParty: drivers.filter((d) => d.provider && !isMicrosoft(d.provider)).length,
    },
  };
}

async function listDrivers() {
  if (!isWin) return classify([]);
  const raw = await psJson(PS_DRIVERS, 60000);
  if (!raw) throw new Error(t("Windows n'a pas renvoyé la liste des pilotes."));
  return classify(raw);
}

module.exports = { listDrivers, classify };
