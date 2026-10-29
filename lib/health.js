'use strict';
const { t } = require('./i18n');
// Diagnostic de santé : état de chaque composant (OK / à surveiller / défaillant) à partir des
// journaux Windows, du Gestionnaire de périphériques, des capteurs disponibles et de quelques mesures.
const si = require('systeminformation');
const { run, psJson, regGet } = require('./sys');

const isWin = process.platform === 'win32';
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const RANK = { unknown: 0, ok: 1, info: 2, warn: 3, bad: 4 };
const worst = (...s) => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');

// Codes d'écran bleu les plus courants et le composant généralement en cause.
const BUGCHECK = {
  0x0a: ['IRQL_NOT_LESS_OR_EQUAL', 'un pilote ou la RAM'],
  0x19: ['BAD_POOL_HEADER', 'un pilote ou la RAM'],
  0x1a: ['MEMORY_MANAGEMENT', 'la RAM (barrette défaillante ou XMP instable)'],
  0x1e: ['KMODE_EXCEPTION_NOT_HANDLED', 'un pilote'],
  0x3b: ['SYSTEM_SERVICE_EXCEPTION', 'un pilote ou un fichier système'],
  0x50: ['PAGE_FAULT_IN_NONPAGED_AREA', 'la RAM ou un pilote'],
  0x7a: ['KERNEL_DATA_INPAGE_ERROR', 'le disque (secteurs illisibles, câble)'],
  0x7e: ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 'un pilote'],
  0x9f: ['DRIVER_POWER_STATE_FAILURE', 'un pilote lors de la mise en veille'],
  0xc2: ['BAD_POOL_CALLER', 'un pilote'],
  0xd1: ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'un pilote (souvent réseau ou Wi-Fi)'],
  0xef: ['CRITICAL_PROCESS_DIED', 'des fichiers système ou le disque'],
  0xf4: ['CRITICAL_OBJECT_TERMINATION', 'le disque système'],
  0x101: ['CLOCK_WATCHDOG_TIMEOUT', 'le processeur (overclock, undervolt, alimentation)'],
  0x109: ['CRITICAL_STRUCTURE_CORRUPTION', 'la RAM ou un pilote'],
  0x116: ['VIDEO_TDR_FAILURE', 'la carte graphique ou son pilote'],
  0x117: ['VIDEO_TDR_TIMEOUT_DETECTED', 'la carte graphique ou son pilote'],
  0x124: ['WHEA_UNCORRECTABLE_ERROR', 'le matériel (CPU, RAM, overclock ou alimentation)'],
  0x133: ['DPC_WATCHDOG_VIOLATION', 'un pilote de stockage ou le firmware du SSD'],
  0x139: ['KERNEL_SECURITY_CHECK_FAILURE', 'un pilote ou la RAM'],
  0x154: ['UNEXPECTED_STORE_EXCEPTION', 'le disque système'],
};

// Codes du Gestionnaire de périphériques.
const PNP_CODE = {
  1: t("mal configuré"), 3: t("pilote corrompu ou mémoire insuffisante"), 10: t("ne peut pas démarrer"),
  12: t("ressources insuffisantes"), 14: t("redémarrage nécessaire"), 18: t("pilote à réinstaller"), 19: t("registre corrompu"),
  21: t("en cours de suppression"), 22: t("désactivé"), 24: t("absent ou mal installé"), 28: t("aucun pilote installé"),
  31: t("pilote non chargé"), 32: t("service du pilote désactivé"), 37: t("échec d'initialisation du pilote"),
  39: t("pilote manquant ou corrompu"), 41: t("pilote chargé mais matériel introuvable"), 43: t("a signalé un problème (arrêté par Windows)"),
  48: t("pilote bloqué (incompatible)"), 52: t("signature du pilote non vérifiée"),
};

function bugcheckInfo(raw) {
  const m = String(raw || '').match(/0x([0-9a-f]+)/i);
  if (!m) return null;
  const code = parseInt(m[1], 16);
  const known = BUGCHECK[code];
  return { code: '0x' + code.toString(16).toUpperCase().padStart(8, '0'), name: known ? known[0] : null, suspect: known ? known[1] : null };
}

// ---------------------------------------------------------------------------
// Fichiers d'écran bleu (C:\Windows\Minidump\*.dmp)
// ---------------------------------------------------------------------------
// Pilote fautif connu → composant concerné (le reste est affiché tel quel).
const DRIVER_HINT = [
  [/^nvlddmkm|^nvhda|^nvvad/i, t("pilote NVIDIA")], [/^amdkmdag|^atikmdag|^atikmpag|^amdwddmg/i, t("pilote AMD Radeon")],
  [/^igdkmd|^igfx/i, t("pilote graphique Intel")], [/^dxgkrnl|^dxgmms|^watchdog/i, t("sous-système graphique de Windows (souvent le pilote GPU)")],
  [/^stornvme|^storport|^storahci|^iastor|^nvme|^disk\.sys|^classpnp|^ntfs/i, t("stockage (SSD / disque ou son pilote)")],
  [/^netwtw|^netwbw|^athw|^rtwlan|^rtkvhd|^rt640|^e1[dr]|^ndis|^tcpip|^netio|^bcmwl/i, t("carte réseau / Wi-Fi")],
  [/^usb|^ucx01000|^hidclass/i, t("pilote USB")], [/^wdfilter|^mpfilter|^aswsp|^avgsp|^bdselfpr|^klif/i, 'antivirus'],
  [/^ntoskrnl|^hal\.dll|^ntkrnl/i, t("noyau Windows (souvent la RAM, l'overclock ou un pilote qui corrompt la mémoire)")],
];
const driverHint = (name) => { const m = DRIVER_HINT.find(([re]) => re.test(name || '')); return m ? m[1] : null; };
const CORE_MODULES = /^(ntoskrnl\.exe|ntkrnlmp\.exe|ntkrnlpa\.exe|ntkrpamp\.exe|hal\.dll|hal\w*\.dll)$/i;

// Lit un « small memory dump » du noyau (en-tête PAGEDU64 + bloc de triage) : code d'arrêt, paramètres,
// et pilote fautif, déduit comme le fait BlueScreenView : la première adresse (adresse fautive, paramètres
// du code d'arrêt, puis pile d'appels) qui tombe dans un pilote autre que le noyau.
function parseMinidump(buf) {
  if (!buf || buf.length < 0x1000) return null;
  const sig = buf.toString('latin1', 0, 8);
  const is64 = sig === 'PAGEDU64';
  if (!is64 && sig !== 'PAGEDUMP') return null;
  const u64 = (o) => (o + 8 <= buf.length ? buf.readBigUInt64LE(o) : 0n);
  const u32 = (o) => (o + 4 <= buf.length ? buf.readUInt32LE(o) : 0);
  const code = u32(is64 ? 0x38 : 0x28);
  const params = is64 ? [0x40, 0x48, 0x50, 0x58].map(u64) : [0x2c, 0x30, 0x34, 0x38].map((o) => BigInt(u32(o)));
  let at = null;
  if (is64) {
    const ft = u64(0xfa8);
    const ms = Number(ft / 10000n) - 11644473600000;
    if (ms > Date.UTC(2005, 0) && ms < Date.now() + 86400000 * 365) at = new Date(ms).toISOString();
  }
  const out = { code: '0x' + code.toString(16).toUpperCase().padStart(8, '0'), params: params.map((p) => '0x' + p.toString(16).toUpperCase()), at, driver: null, drivers: 0 };
  const known = BUGCHECK[code];
  out.name = known ? known[0] : null;
  out.suspect = known ? known[1] : null;

  // Bloc de triage (dump de type 4 uniquement), juste après l'en-tête de 2 pages.
  if (!is64 || u32(0xf98) !== 4 || buf.length < 0x2000 + 0x60) return out;
  const T = 0x2000;
  const stackOff = u32(T + 0x28), stackSize = u32(T + 0x2c);
  const listOff = u32(T + 0x30), count = u32(T + 0x34);
  if (!listOff || !count || count > 2000 || listOff >= buf.length) return out;
  const readName = (off) => {
    if (!off || off + 4 > buf.length) return null;
    const len = u32(off);
    if (!len || len > 260 || off + 4 + len * 2 > buf.length) return null;
    const s = buf.toString('utf16le', off + 4, off + 4 + len * 2);
    return /^[\w.\-~ ]+\.(sys|exe|dll)$/i.test(s) ? s : null;
  };
  // DUMP_DRIVER_ENTRY64 : décalage du nom (4 octets + 4 de bourrage) puis KLDR_DATA_TABLE_ENTRY64 (DllBase à +0x30, SizeOfImage à +0x40).
  // La taille d'une entrée est vérifiée sur les noms lus, au cas où une version de Windows la changerait.
  let mods = [];
  for (const size of [0x90, 0x88, 0xa0, 0x98]) {
    const list = [];
    for (let i = 0; i < count; i++) {
      const e = listOff + i * size;
      const name = readName(u32(e));
      if (!name) break;
      list.push({ name, base: u64(e + 8 + 0x30), size: BigInt(u32(e + 8 + 0x40)) });
    }
    if (list.length === count) { mods = list; break; }
    if (list.length > mods.length) mods = list;
  }
  out.drivers = mods.length;
  const owner = (addr) => mods.find((m) => m.size && addr >= m.base && addr < m.base + m.size);
  const candidates = [u64(0xf00 + 0x10), ...params];
  if (stackOff && stackSize && stackOff + stackSize <= buf.length) {
    for (let o = stackOff; o + 8 <= stackOff + Math.min(stackSize, 0x4000); o += 8) candidates.push(u64(o));
  }
  let core = null;
  for (const a of candidates) {
    if (a < 0xffff800000000000n) continue; // adresses du noyau uniquement
    const m = owner(a);
    if (!m) continue;
    if (CORE_MODULES.test(m.name)) { core = core || m.name; continue; }
    out.driver = m.name;
    break;
  }
  if (!out.driver) out.driver = core;
  out.driverHint = driverHint(out.driver);
  return out;
}

// Les fichiers les plus récents du dossier Minidump (lisible uniquement en administrateur).
async function readMinidumps(max = 10) {
  if (!isWin) return { files: [], readable: false };
  const fsp = require('fs/promises');
  const path = require('path');
  const dir = path.join(process.env.SystemRoot || 'C:\\Windows', 'Minidump');
  let names;
  try { names = (await fsp.readdir(dir)).filter((n) => /\.dmp$/i.test(n)); } catch (e) { return { files: [], readable: e.code === 'ENOENT' }; }
  const stats = await Promise.all(names.map(async (n) => { try { return { n, st: await fsp.stat(path.join(dir, n)) }; } catch { return null; } }));
  const recent = stats.filter(Boolean).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs).slice(0, max);
  const files = [];
  for (const { n, st } of recent) {
    let info = null;
    try { if (st.size <= 64 * 1048576) info = parseMinidump(await fsp.readFile(path.join(dir, n))); } catch { /* verrouillé */ }
    files.push({ file: n, at: (info && info.at) || st.mtime.toISOString(), sizeKb: Math.round(st.size / 1024), ...(info || { code: null }) });
  }
  return { files, readable: true, total: names.length };
}

// ---------------------------------------------------------------------------
// Collecte
// ---------------------------------------------------------------------------
const PS_EVENTS = `
$ErrorActionPreference='SilentlyContinue'
$since=(Get-Date).AddDays(-30)
$sel=@{n='P';e={$_.ProviderName}},@{n='I';e={$_.Id}},@{n='T';e={$_.TimeCreated.ToString('o')}},@{n='A';e={if($_.Properties.Count){[string]$_.Properties[0].Value}}}
$ev=@()
$ev+=Get-WinEvent -FilterHashtable @{LogName='System';StartTime=$since;Id=41,6008,1001,4101,7,51,153,55,129} -MaxEvents 400 | Select-Object $sel
$ev+=Get-WinEvent -FilterHashtable @{LogName='System';StartTime=$since;ProviderName='Microsoft-Windows-WHEA-Logger','nvlddmkm'} -MaxEvents 200 | Select-Object $sel
$crash=Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=$since;ProviderName='Application Error';Id=1000} -MaxEvents 300 | ForEach-Object {[string]$_.Properties[0].Value} | Group-Object | Sort-Object Count -Descending | Select-Object -First 5 Name,Count
$md=Get-WinEvent -FilterHashtable @{LogName='System';ProviderName='Microsoft-Windows-MemoryDiagnostics-Results'} -MaxEvents 1 | Select-Object Id,@{n='T';e={$_.TimeCreated.ToString('o')}}
$st=Get-CimInstance Win32_ReliabilityStabilityMetrics | Sort-Object TimeGenerated -Descending | Select-Object -First 1 -ExpandProperty SystemStabilityIndex
[pscustomobject]@{ events=@($ev); crashes=@($crash); memdiag=$md; stability=$st }`;

const PS_SYSTEM = `
$ErrorActionPreference='SilentlyContinue'
$pnp=Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode<>0' | Select-Object Name,PNPClass,ConfigManagerErrorCode
$av=Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct | Select-Object displayName,productState
# Filtrer sur l'ApplicationID de Windows : ~0,5 s au lieu de ~15 s pour la requête générale.
$lic=Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1 -ExpandProperty LicenseStatus
$hf=Get-HotFix | Where-Object InstalledOn | Sort-Object InstalledOn -Descending | Select-Object -First 1
$bios=Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion,Manufacturer,SerialNumber,@{n='Date';e={if($_.ReleaseDate){$_.ReleaseDate.ToString('yyyy-MM-dd')}}}
$bb=Get-CimInstance Win32_BaseBoard | Select-Object -First 1 -ExpandProperty SerialNumber
$rb=(Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending')
$adm=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
[pscustomobject]@{ pnp=@($pnp); av=@($av); license=$lic; lastUpdate=$(if($hf){$hf.InstalledOn.ToString('yyyy-MM-dd')}); lastKb=$(if($hf){$hf.HotFixID}); bios=$bios; boardSerial=$bb; rebootPending=$rb; admin=$adm }`;

const PS_DISKS = `
$ErrorActionPreference='SilentlyContinue'
Get-PhysicalDisk | ForEach-Object {
  $r=$_ | Get-StorageReliabilityCounter
  [pscustomobject]@{ Id=$_.DeviceId; Name=$_.FriendlyName; Health=$_.HealthStatus; Op=($_.OperationalStatus -join ', ');
    Temp=$r.Temperature; TempMax=$r.TemperatureMax; Wear=$r.Wear; Hours=$r.PowerOnHours;
    ReadErr=$r.ReadErrorsUncorrected; WriteErr=$r.WriteErrorsUncorrected; Smart=[bool]$r }
}`;

const PS_NET = `
$ErrorActionPreference='SilentlyContinue'
$a=Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | Sort-Object ifIndex | Select-Object Name,InterfaceDescription,LinkSpeed,NdisPhysicalMedium,ifIndex
$gw=Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
[pscustomobject]@{ adapters=@($a); gateway=$(if($gw){$gw.NextHop}); gwIndex=$(if($gw){$gw.ifIndex}) }`;

async function pingStats(host, count = 10) {
  if (!host || !/^[0-9a-f.:]+$/i.test(host)) return null;
  const out = await run('ping', ['-n', String(count), '-w', '1000', host], (count + 5) * 1000);
  if (!out) return null;
  // « time=12ms », « temps=12 ms », « Zeit<1ms »… : indépendant de la langue de Windows.
  const times = out.split(/\r?\n/).filter((l) => /TTL=/i.test(l))
    .map((l) => l.match(/[=<]\s*(\d+)\s*ms/i)).filter(Boolean).map((m) => Number(m[1]));
  const lossPct = Math.round(((count - times.length) / count) * 100);
  if (!times.length) return { host, avg: null, jitter: null, lossPct };
  const avg = times.reduce((s, v) => s + v, 0) / times.length;
  let jitter = 0;
  for (let i = 1; i < times.length; i++) jitter += Math.abs(times[i] - times[i - 1]);
  jitter = times.length > 1 ? jitter / (times.length - 1) : 0;
  return { host, avg: Math.round(avg), max: Math.max(...times), jitter: Math.round(jitter * 10) / 10, lossPct };
}

async function nvidiaSmi(timeout = 6000) {
  const out = await run('nvidia-smi', ['--query-gpu=name,temperature.gpu,fan.speed,power.draw,utilization.gpu,memory.used,memory.total,clocks.gr,clocks.max.gr',
    '--format=csv,noheader,nounits'], timeout);
  if (!out) return [];
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  return out.trim().split(/\r?\n/).filter(Boolean).map((l) => {
    const [name, temp, fan, power, util, memUsed, memTotal, clock, clockMax] = l.split(',').map((s) => s.trim());
    return { name, temp: num(temp), fan: num(fan), power: num(power), util: num(util), memUsed: num(memUsed), memTotal: num(memTotal), clock: num(clock), clockMax: num(clockMax) };
  });
}

// Charge du processeur au repos, mesurée sur ~1,5 s.
async function idleLoad() {
  try {
    await si.currentLoad();
    await new Promise((r) => setTimeout(r, 1500));
    const l = await si.currentLoad();
    const procs = await si.processes();
    const top = (procs.list || []).filter((p) => p.cpu > 3 && !/^(system idle process|idle)$/i.test(p.name))
      .sort((a, b) => b.cpu - a.cpu).slice(0, 4).map((p) => ({ name: p.name, cpu: Math.round(p.cpu) }));
    return { load: Math.round(l.currentLoad), top };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------
async function runHealth(hw, last, onProgress) {
  const t0 = Date.now();
  const emit = (pct, label) => onProgress && onProgress({ pct, label });
  emit(3, t("Mesure de la charge au repos…"));

  // La charge au repos est mesurée avant de lancer les requêtes PowerShell, qui chargent elles-mêmes le CPU.
  const idle = await idleLoad();
  emit(10, t("Lecture des journaux Windows, des capteurs et test réseau…"));
  const [evR, sysR, diskR, netR, smi, temp, battery, pingNet, dumps] = await Promise.all([
    isWin ? psJson(PS_EVENTS, 60000) : null,
    isWin ? psJson(PS_SYSTEM, 60000) : null,
    isWin ? psJson(PS_DISKS, 30000) : null,
    isWin ? psJson(PS_NET, 20000) : null,
    isWin && hw.gpus.some((g) => /nvidia|geforce/i.test(g.name)) ? nvidiaSmi() : [],
    si.cpuTemperature().catch(() => null),
    si.battery().catch(() => null),
    isWin ? pingStats('1.1.1.1', 10) : null,
    readMinidumps(10).catch(() => ({ files: [], readable: false })),
  ]);
  emit(60, t("Test de la connexion locale…"));
  const ev = (evR && evR[0]) || {};
  const sys = (sysR && sysR[0]) || {};
  const net = (netR && netR[0]) || {};
  const sb = isWin ? await regGet('HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State', 'UEFISecureBootEnabled') : null;
  const pingGw = await pingStats(net.gateway, 10);
  emit(90, t("Synthèse…"));

  const events = arr(ev.events).map((e) => ({ p: String(e.P || ''), id: Number(e.I), t: e.T, a: e.A }));
  const evOf = (provRe, ids) => events.filter((e) => provRe.test(e.p) && (!ids || ids.includes(e.id)));
  const pnp = arr(sys.pnp).filter((d) => d && d.ConfigManagerErrorCode !== 45);
  const pnpOf = (re) => pnp.filter((d) => re.test(String(d.PNPClass || '')));
  const components = [];
  const comp = (id, label, name, checks, advice = []) => {
    const status = checks.length ? worst(...checks.map((c) => c.status)) : 'unknown';
    components.push({ id, label, name, status, checks, advice: advice.filter(Boolean) });
  };
  const chk = (label, value, status, note) => ({ label, value: value == null ? '–' : String(value), status, note: note || null });

  // ---- Alimentation et stabilité
  const kp41 = evOf(/Kernel-Power/i, [41]);
  const unexpected = evOf(/^EventLog$/i, [6008]);
  const bsods = evOf(/WER-SystemErrorReporting|BugCheck/i, [1001]).map((e) => ({ ...e, bc: bugcheckInfo(e.a) })).filter((e) => e.bc);
  const hardResets = kp41.filter((e) => !Number(e.a));
  const stab = ev.stability != null ? Math.round(Number(ev.stability) * 10) / 10 : null;
  {
    const checks = [];
    const n = Math.max(kp41.length, unexpected.length);
    checks.push(chk(t("Arrêts brutaux (30 jours)"), n, n >= 5 ? 'bad' : n >= 1 ? 'warn' : 'ok',
      n ? t("{0} sans écran bleu : coupure de courant, bouton maintenu, surchauffe ou alimentation qui décroche.", [hardResets.length || n]) : t("Aucun arrêt anormal.")));
    checks.push(chk(t("Écrans bleus (30 jours)"), bsods.length, bsods.length >= 3 ? 'bad' : bsods.length ? 'warn' : 'ok',
      bsods.length ? [...new Map(bsods.map((b) => [b.bc.code, b.bc])).values()].slice(0, 3)
        .map((b) => `${b.code}${b.name ? ' ' + b.name : ''}${b.suspect ? ' → ' + t(b.suspect) : ''}`).join(' ; ') : null));
    if (stab != null) checks.push(chk(t("Indice de fiabilité Windows"), `${stab}/10`, stab < 3 ? 'bad' : stab < 6 ? 'warn' : 'ok', t("Calculé par Windows d'après les plantages et erreurs récents.")));
    // Fichiers d'écran bleu : code d'arrêt et pilote fautif de chaque plantage enregistré.
    const dmp = dumps.files.filter((d) => d.code);
    if (dmp.length) {
      const recent = dmp.filter((d) => Date.now() - new Date(d.at).getTime() < 30 * 86400000).length;
      checks.push(chk(t("Fichiers d'écran bleu (Minidump)"), `${dumps.total} fichier${dumps.total > 1 ? 's' : ''}`, recent >= 3 ? 'bad' : recent ? 'warn' : 'info',
        dmp.slice(0, 4).map((d) => `${String(d.at).slice(0, 10)} : ${d.code}${d.name ? ' ' + d.name : ''}${d.driver ? ' · ' + d.driver : ''}`).join(' ; ')
        + (recent ? '' : t(" (aucun ces 30 derniers jours)"))));
    } else if (isWin && !dumps.readable) {
      checks.push(chk(t("Fichiers d'écran bleu (Minidump)"), 'illisibles', 'unknown', t("Le dossier C:\\Windows\\Minidump n'est lisible qu'en administrateur.")));
    }
    const crashes = arr(ev.crashes).filter((c) => c && c.Name);
    if (crashes.length) {
      const total = crashes.reduce((s, c) => s + Number(c.Count || 0), 0);
      checks.push(chk(t("Plantages d'applications (30 jours)"), total, total >= 20 ? 'warn' : 'info',
        crashes.map((c) => `${c.Name} (${c.Count})`).join(', ')));
    }
    const advice = [];
    if (hardResets.length) advice.push(t("Arrêts sans écran bleu : vérifie le branchement secteur, la multiprise, la température (poussière, ventilateurs) et l'alimentation si ça arrive en jeu."));
    if (bsods.some((b) => /RAM/.test(b.bc.suspect || ''))) advice.push(t("Écrans bleus liés à la mémoire : désactive XMP/EXPO pour tester, puis lance « Diagnostic de mémoire Windows » (mdsched.exe)."));
    if (bsods.some((b) => /disque/.test(b.bc.suspect || ''))) advice.push(t("Écrans bleus liés au disque : sauvegarde tes données et vérifie l'état SMART du disque (CrystalDiskInfo)."));
    if (bsods.some((b) => /graphique/.test(b.bc.suspect || ''))) advice.push(t("Écrans bleus liés au GPU : réinstalle le pilote proprement (DDU) et vérifie les câbles d'alimentation PCIe."));
    const culprits = new Map();
    for (const d of dmp) if (d.driver && !CORE_MODULES.test(d.driver)) culprits.set(d.driver, (culprits.get(d.driver) || 0) + 1);
    for (const [name, n] of [...culprits].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
      const hint = driverHint(name);
      advice.push(t("{0} est en cause dans {1} écran{2} bleu{3}{4} : mets à jour ou réinstalle ce pilote depuis le site du fabricant, ou désinstalle le logiciel qui l'a installé.", [name, n, n > 1 ? 's' : '', n > 1 ? 's' : '', hint ? ` (${hint})` : '']));
    }
    if (!culprits.size && dmp.some((d) => d.driver)) advice.push(t("Les écrans bleus pointent vers le noyau Windows : c'est souvent la RAM ou un overclock. Teste la mémoire ci-dessous et remets le BIOS par défaut."));
    if (!dmp.length && bsods.some((b) => /pilote/.test(b.bc.suspect || ''))) advice.push(t("Écrans bleus liés à un pilote, mais aucun fichier .dmp à analyser : vérifie que Windows enregistre les « petits fichiers de vidage mémoire » (Paramètres système avancés › Démarrage et récupération)."));
    comp('stability', t("Alimentation et stabilité"), stab != null ? t("Fiabilité {0}/10", [stab]) : t("Système"), checks, advice);
  }

  // ---- Processeur
  {
    const p = hw.perf;
    const whea = evOf(/WHEA/i);
    const wheaFatal = whea.filter((e) => [1, 18, 20, 46].includes(e.id));
    const checks = [];
    checks.push(chk(t("Erreurs matérielles (WHEA)"), whea.length, wheaFatal.length ? 'bad' : whea.length >= 5 ? 'warn' : whea.length ? 'info' : 'ok',
      whea.length ? t("Erreurs signalées par le processeur, la mémoire ou le bus PCIe : souvent un overclock / undervolt instable, une RAM ou une alimentation fragile.") : null));
    if (idle) {
      checks.push(chk(t("Charge au repos"), `${idle.load} %`, idle.load >= 50 ? 'warn' : idle.load >= 25 ? 'info' : 'ok',
        idle.top.length ? t("Processus actifs : ") + idle.top.map((x) => `${x.name} (${x.cpu} %)`).join(', ') : null));
    }
    const tc = temp && temp.main > 0 ? Math.round(temp.main) : null;
    if (tc) checks.push(chk(t("Température actuelle"), `${tc} °C`, tc >= 90 ? 'bad' : tc >= 75 ? 'warn' : 'ok'));
    else checks.push(chk(t("Température"), t("non lisible"), 'unknown', t("Windows ne donne pas la température du processeur sans outil dédié (HWiNFO, Core Temp).")));
    if (last && last.mode === 'full') {
      const sus = (last.benchmarks || []).find((b) => b.id === 'cpu-sustain');
      if (sus) checks.push(chk(t("Stabilité sous charge (dernière analyse complète)"), `${sus.value} %`, sus.value < 70 ? 'bad' : sus.value < 85 ? 'warn' : 'ok'));
    }
    const advice = [];
    if (whea.length) advice.push(t("Remets le BIOS aux réglages par défaut (sans overclock, sans undervolt) et vois si les erreurs WHEA disparaissent."));
    if (idle && idle.load >= 25) advice.push(t("Le processeur travaille alors que rien ne tourne : vérifie les processus listés (mise à jour, indexation, logiciel indésirable)."));
    comp('cpu', t("Processeur"), p.cpu.name, checks, advice);
  }

  // ---- Carte graphique
  {
    const gpuName = hw.perf.gpu.name;
    const g = hw.gpus.find((x) => x.name === gpuName) || hw.gpus[0];
    const tdr = evOf(/^Display$/i, [4101]);
    const nv = evOf(/nvlddmkm/i);
    const devErr = pnpOf(/^Display$/i);
    const checks = [];
    checks.push(chk(t("Plantages du pilote graphique (30 jours)"), tdr.length + nv.length, tdr.length + nv.length >= 5 ? 'bad' : tdr.length + nv.length ? 'warn' : 'ok',
      tdr.length + nv.length ? t("« Le pilote d'affichage a cessé de répondre » : pilote instable, overclock GPU, surchauffe ou alimentation insuffisante.") : null));
    if (devErr.length) checks.push(chk(t("Gestionnaire de périphériques"), devErr.map((d) => d.Name).join(', '), 'bad', PNP_CODE[devErr[0].ConfigManagerErrorCode] || null));
    const s = smi[0];
    if (s) {
      if (s.temp != null) checks.push(chk(t("Température actuelle"), `${s.temp} °C`, s.temp >= 85 ? 'bad' : s.temp >= 72 && (s.util || 0) < 30 ? 'warn' : 'ok',
        s.util != null ? t("Charge {0} %{1}{2}", [s.util, s.fan != null ? t(", ventilateur {0} %", [s.fan]) : '', s.power != null ? `, ${s.power} W` : '']) : null));
      if (s.memTotal) checks.push(chk(t("Mémoire vidéo utilisée"), t("{0} / {1} Go", [Math.round(s.memUsed / 1024 * 10) / 10, Math.round(s.memTotal / 1024)]), s.memUsed / s.memTotal > 0.9 ? 'warn' : 'ok'));
    }
    if (g && g.driverDate) {
      const months = Math.round((Date.now() - new Date(g.driverDate).getTime()) / (30.44 * 86400000));
      checks.push(chk(t("Âge du pilote"), t("{0} mois", [months]), months > 12 ? 'warn' : 'ok', t("Version {0}", [g.driverVersion || '?'])));
    }
    const advice = [];
    if (tdr.length + nv.length) advice.push(t("Désinstalle le pilote avec DDU en mode sans échec puis installe la dernière version ; retire tout overclock GPU ; vérifie les connecteurs PCIe."));
    comp('gpu', t("Carte graphique"), gpuName, checks, advice);
  }

  // ---- Mémoire
  {
    const checks = [];
    const md = ev.memdiag;
    if (md && md.Id) {
      const bad = [1102, 1202].includes(Number(md.Id));
      checks.push(chk(t("Diagnostic mémoire Windows"), bad ? t("erreurs détectées") : t("aucune erreur"), bad ? 'bad' : 'ok', t("Dernier test : {0}", [String(md.T || '').slice(0, 10)])));
    } else {
      checks.push(chk(t("Diagnostic mémoire Windows"), t("jamais lancé"), 'unknown', t("Teste la RAM ci-dessous, sans redémarrer ou au prochain redémarrage (test Windows complet, ~15 min).")));
    }
    const ramBsod = bsods.filter((b) => /RAM/.test(b.bc.suspect || '')).length;
    if (ramBsod) checks.push(chk(t("Écrans bleus liés à la RAM"), ramBsod, 'warn'));
    if (hw.ram.usedPct != null) checks.push(chk(t("Utilisation actuelle"), `${hw.ram.usedPct} %`, hw.ram.usedPct > 90 ? 'warn' : 'ok'));
    const slow = hw.ram.sticks.find((s) => s.speed && s.configured && s.configured < s.speed * 0.88);
    checks.push(chk(t("Fréquence"), hw.ram.speed ? `${hw.ram.speed} MHz` : null, slow ? 'info' : 'ok', slow ? t("Barrettes prévues pour {0} MHz : XMP/EXPO désactivé.", [slow.speed]) : null));
    if (hw.ram.sticks.length) {
      const sizes = new Set(hw.ram.sticks.map((s) => s.sizeGb));
      const parts = new Set(hw.ram.sticks.map((s) => s.part).filter(Boolean));
      checks.push(chk(t("Barrettes"), hw.ram.sticks.map((s) => t("{0} Go", [s.sizeGb])).join(' + '),
        hw.ram.sticks.length === 1 && !hw.system.isLaptop ? 'info' : sizes.size > 1 || parts.size > 1 ? 'info' : 'ok',
        hw.ram.sticks.length === 1 && !hw.system.isLaptop ? t("Simple canal.") : sizes.size > 1 || parts.size > 1 ? t("Barrettes différentes : peut empêcher XMP ou provoquer des instabilités.") : null));
    }
    comp('ram', t("Mémoire vive"), t("{0} Go{1}", [hw.ram.totalGb, hw.ram.type ? ' ' + hw.ram.type : '']), checks,
      [checks.some((c) => c.status === 'bad' || c.status === 'warn') && t("Teste chaque barrette seule (mdsched.exe ou MemTest86) pour trouver celle qui est défaillante.")]);
  }

  // ---- Disques
  const diskInfo = arr(diskR);
  for (const d of hw.disks) {
    const info = diskInfo.find((x) => Number(x.Id) === d.number) || diskInfo.find((x) => x.Name === d.name) || {};
    const checks = [];
    const health = info.Health || d.health;
    const healthLabel = /^healthy$/i.test(health) ? t("Sain") : /^warning$/i.test(health) ? t("Avertissement") : /^unhealthy$/i.test(health) ? t("Défaillant") : health;
    if (health) checks.push(chk(t("État signalé par Windows"), healthLabel, /healthy/i.test(health) ? 'ok' : /warning/i.test(health) ? 'warn' : 'bad', info.Op && !/^ok$/i.test(info.Op) ? info.Op : null));
    if (info.Smart) {
      if (info.Wear != null) checks.push(chk(t("Usure (SSD)"), `${info.Wear} %`, info.Wear >= 90 ? 'bad' : info.Wear >= 70 ? 'warn' : 'ok'));
      if (info.Temp) checks.push(chk(t("Température"), `${info.Temp} °C`, info.Temp >= 70 ? 'bad' : info.Temp >= 55 ? 'warn' : 'ok'));
      if (info.Hours != null) checks.push(chk(t("Heures de fonctionnement"), `${info.Hours} h`, d.type === 'HDD' && info.Hours > 40000 ? 'info' : 'ok', t("≈ {0} an(s) allumé", [Math.round(info.Hours / 24 / 365 * 10) / 10])));
      const errs = Number(info.ReadErr || 0) + Number(info.WriteErr || 0);
      if (info.ReadErr != null || info.WriteErr != null) checks.push(chk(t("Erreurs de lecture / écriture non corrigées"), errs, errs ? 'bad' : 'ok'));
    }
    const dEv = evOf(/^disk$/i, [7, 51, 153]).filter((e) => { const m = String(e.a || '').match(/Harddisk(\d+)/i); return m && Number(m[1]) === d.number; });
    checks.push(chk(t("Erreurs d'E/S dans les journaux (30 jours)"), dEv.length, dEv.some((e) => e.id === 7) ? 'bad' : dEv.length >= 3 ? 'warn' : dEv.length ? 'info' : 'ok',
      dEv.some((e) => e.id === 7) ? t("Secteurs défectueux détectés par Windows.") : dEv.length ? t("Délais ou erreurs de transfert : câble SATA, port, alimentation ou disque fatigué.") : null));
    if (d.isSystem) {
      const ntfs = evOf(/ntfs/i, [55]).length;
      if (ntfs) checks.push(chk(t("Système de fichiers"), `${ntfs} alerte(s)`, 'warn', t("Corruption du système de fichiers signalée : lance « chkdsk C: /scan ».")));
    }
    const advice = [];
    if (checks.some((c) => c.status === 'bad')) advice.push(t("Sauvegarde immédiatement les données de ce disque et prévois son remplacement."));
    comp('disk-' + (d.number ?? d.name), d.isSystem ? t("Disque système") : t("Disque"), t("{0} · {1}{2} Go", [d.name, d.type === '?' ? '' : d.type + ' · ', d.sizeGb]), checks, advice);
  }

  // ---- Batterie
  if (battery && battery.hasBattery) {
    const checks = [];
    if (battery.designedCapacity > 0 && battery.maxCapacity > 0) {
      const wear = Math.max(0, Math.round((1 - battery.maxCapacity / battery.designedCapacity) * 100));
      checks.push(chk(t("Usure"), `${wear} %`, wear >= 40 ? 'bad' : wear >= 20 ? 'warn' : 'ok', t("Capacité {0} / {1} {2} d'origine", [battery.maxCapacity, battery.designedCapacity, battery.capacityUnit || ''])));
    }
    if (battery.cycleCount) checks.push(chk(t("Cycles de charge"), battery.cycleCount, battery.cycleCount > 800 ? 'warn' : 'ok'));
    checks.push(chk(t("Charge"), `${battery.percent} %`, 'ok', battery.acConnected ? t("Sur secteur") : t("Sur batterie")));
    comp('battery', t("Batterie"), [battery.manufacturer, battery.model].filter(Boolean).join(' ') || t("Batterie"), checks,
      [checks[0] && checks[0].status !== 'ok' && t("Une batterie usée à plus de 40 % mérite d'être remplacée. Rapport détaillé : powercfg /batteryreport.")]);
  }

  // ---- Périphériques
  {
    const others = pnp.filter((d) => !/^Display$/i.test(String(d.PNPClass || '')));
    const disabled = others.filter((d) => d.ConfigManagerErrorCode === 22);
    const broken = others.filter((d) => d.ConfigManagerErrorCode !== 22);
    const checks = broken.slice(0, 8).map((d) => chk(d.Name || t("Périphérique inconnu"), PNP_CODE[d.ConfigManagerErrorCode] || `code ${d.ConfigManagerErrorCode}`,
      [28, 24, 1, 18].includes(d.ConfigManagerErrorCode) ? 'warn' : 'bad', d.PNPClass ? t("Classe : {0}", [d.PNPClass]) : null));
    if (disabled.length) checks.push(chk(t("Périphériques désactivés"), disabled.length, 'info', disabled.slice(0, 4).map((d) => d.Name).join(', ')));
    if (!checks.length && isWin && sysR) checks.push(chk(t("Gestionnaire de périphériques"), t("aucune erreur"), 'ok'));
    comp('devices', t("Périphériques et pilotes"), broken.length ? t("{0} en erreur", [broken.length]) : t("Gestionnaire de périphériques"), checks,
      [broken.some((d) => d.ConfigManagerErrorCode === 28) && t("Installe les pilotes manquants depuis le site du fabricant de la carte mère / du PC (chipset, réseau, audio).")]);
  }

  // ---- Réseau
  if (isWin && netR) {
    const adapters = arr(net.adapters);
    const main = adapters.find((a) => a.ifIndex === net.gwIndex) || adapters[0];
    const wifi = main && (Number(main.NdisPhysicalMedium) === 9 || /wi-?fi|wireless|802\.11/i.test(main.InterfaceDescription || ''));
    const checks = [];
    if (main) checks.push(chk(t("Connexion"), `${wifi ? 'Wi-Fi' : t("Ethernet")} · ${main.LinkSpeed || '?'}`, wifi ? 'info' : 'ok',
      wifi ? t("Pour jouer ou streamer, un câble Ethernet donne une latence plus stable que le Wi-Fi.") : main.InterfaceDescription));
    else checks.push(chk(t("Connexion"), t("aucune carte réseau active"), 'warn'));
    if (main && !wifi && /^100\s*Mbps/i.test(main.LinkSpeed || '')) checks[0] = chk(t("Connexion"), t("Ethernet · {0}", [main.LinkSpeed]), 'warn', t("Lien limité à 100 Mb/s : câble abîmé ou de catégorie trop basse (Cat 5e minimum)."));
    if (wifi) {
      const out = await run('netsh', ['wlan', 'show', 'interfaces'], 5000);
      const sig = out && out.match(/^\s*(?:Signal|Se[ñn]al|Segnale|Sinal|Sygna[łl])\s*:\s*(\d+)\s*%/im);
      if (sig) checks.push(chk(t("Signal Wi-Fi"), `${sig[1]} %`, Number(sig[1]) < 50 ? 'warn' : 'ok'));
    }
    const pingCheck = (label, p, limits) => p && checks.push(p.avg == null
      ? chk(label, t("aucune réponse"), 'unknown', t("Certains routeurs et réseaux d'entreprise bloquent le ping : ce n'est pas forcément une panne."))
      : chk(label, t("{0} ms · gigue {1} ms · pertes {2} %", [p.avg, p.jitter, p.lossPct]),
        p.lossPct >= 10 ? 'bad' : p.lossPct > 0 || p.avg > limits[1] || p.jitter > limits[2] ? 'warn' : p.avg > limits[0] ? 'info' : 'ok'));
    pingCheck(t("Latence vers la box / le routeur"), pingGw, [5, 15, 10]);
    pingCheck(t("Latence vers Internet (1.1.1.1)"), pingNet, [40, 80, 15]);
    const advice = [];
    if (pingGw && pingGw.avg != null && (pingGw.lossPct > 0 || pingGw.jitter > 10)) advice.push(t("Les pertes ou la gigue apparaissent déjà vers la box : c'est la connexion locale (Wi-Fi, câble, CPL) qui est en cause, pas le fournisseur."));
    else if (pingNet && pingNet.avg != null && (pingNet.lossPct > 0 || pingNet.avg > 80)) advice.push(t("La connexion locale est bonne mais Internet est lent ou instable : contacte ton fournisseur d'accès ou redémarre la box."));
    comp('network', t("Réseau"), main ? main.InterfaceDescription : t("Réseau"), checks, advice);
  }

  // ---- Sécurité et maintenance
  if (isWin && sysR) {
    const checks = [];
    const avs = arr(sys.av).filter((a) => a && a.displayName);
    const active = avs.filter((a) => ((Number(a.productState) >> 12) & 0xf) === 1);
    checks.push(chk(t("Antivirus"), active.length ? active.map((a) => a.displayName).join(', ') : avs.length ? t("désactivé") : 'aucun', active.length ? 'ok' : 'bad'));
    if (sb != null) checks.push(chk(t("Démarrage sécurisé (Secure Boot)"), sb === 1 ? t("activé") : t("désactivé"), sb === 1 ? 'ok' : 'info', sb === 1 ? null : t("Requis par certains anti-triche (Valorant, Battlefield 6) et par Windows 11.")));
    if (sys.license != null) checks.push(chk(t("Activation de Windows"), Number(sys.license) === 1 ? t("activé") : t("non activé"), Number(sys.license) === 1 ? 'ok' : 'warn'));
    if (sys.lastUpdate) {
      const days = Math.round((Date.now() - new Date(sys.lastUpdate).getTime()) / 86400000);
      checks.push(chk(t("Dernière mise à jour Windows"), t("il y a {0} jours", [days]), days > 90 ? 'bad' : days > 45 ? 'warn' : 'ok', `${sys.lastKb || ''} (${sys.lastUpdate})`));
    }
    checks.push(chk(t("Redémarrage en attente"), sys.rebootPending ? t("oui") : t("non"), sys.rebootPending ? 'info' : 'ok', sys.rebootPending ? t("Des mises à jour attendent un redémarrage.") : null));
    if (sys.bios && sys.bios.Date) {
      const years = Math.round((Date.now() - new Date(sys.bios.Date).getTime()) / (365.25 * 86400000) * 10) / 10;
      checks.push(chk('BIOS', `${sys.bios.SMBIOSBIOSVersion || '?'} (${sys.bios.Date})`, years > 4 ? 'info' : 'ok', years > 4 ? t("Vieux de {0} ans : une mise à jour corrige souvent des problèmes de stabilité ou de compatibilité RAM.", [years]) : null));
    }
    comp('security', t("Sécurité et maintenance"), `${hw.os.distro || 'Windows'}`.replace(/^Microsoft\s+/i, ''), checks);
  }

  const counts = { bad: 0, warn: 0, ok: 0 };
  for (const c of components) {
    if (c.status === 'bad') counts.bad++;
    else if (c.status === 'warn') counts.warn++;
    else counts.ok++;
  }
  emit(100, t("Terminé"));
  return {
    finishedAt: new Date().toISOString(), durationMs: Date.now() - t0, platform: process.platform,
    admin: !!sys.admin, components, counts,
    minidumps: dumps.files,
    identity: {
      biosSerial: sys.bios ? sys.bios.SerialNumber : null, boardSerial: sys.boardSerial || null,
      biosVersion: sys.bios ? sys.bios.SMBIOSBIOSVersion : null, biosDate: sys.bios ? sys.bios.Date : null,
    },
  };
}

module.exports = { runHealth, bugcheckInfo, pingStats, nvidiaSmi, parseMinidump, readMinidumps };
