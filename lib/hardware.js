'use strict';
const { t } = require('./i18n');
// Détection de la configuration (CPU, GPU, RAM, disques, écran, système).
const os = require('os');
const si = require('systeminformation');
const { ps, psJson } = require('./sys');
const { evaluate } = require('./scoring');

const isWin = process.platform === 'win32';
const safe = (p) => Promise.resolve(p).catch(() => null);
const VIRTUAL = /microsoft basic|remote display|virtual|parsec|vmware|hyper-v|indirect display|citrix|meta virtual/i;
const SMBIOS_RAM = { 24: 'DDR3', 26: 'DDR4', 27: 'LPDDR', 28: 'LPDDR2', 29: 'LPDDR3', 30: 'LPDDR4', 34: 'DDR5', 35: 'LPDDR5' };

// Fréquence réelle et maximale de chaque écran (EnumDisplaySettings) : la source par défaut
// applique la fréquence de l'écran principal à tous les écrans.
const PS_DISPLAYS = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class PcoDisp {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DD { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Name; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Str; public int Flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Id; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string Key; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct DM { [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Dev; public short SV, DV, Size, Extra; public int Fields, X, Y, Orient, Fixed; public short Color, Duplex, YRes, TT, Collate; [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string Form; public short LogPixels; public int Bits, W, H, DFlags, Freq; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplayDevices(string dev, int i, ref DD dd, int f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DM dm);
  public static object[] List() {
    var r = new System.Collections.ArrayList();
    for (int i = 0; ; i++) {
      var d = new DD(); d.cb = Marshal.SizeOf(d);
      if (!EnumDisplayDevices(null, i, ref d, 0)) break;
      if ((d.Flags & 1) == 0) continue;
      var m = new DM(); m.Size = (short)Marshal.SizeOf(m);
      if (!EnumDisplaySettings(d.Name, -1, ref m)) continue;
      int max = 0; var a = new DM(); a.Size = (short)Marshal.SizeOf(a);
      for (int k = 0; EnumDisplaySettings(d.Name, k, ref a); k++) if (a.W == m.W && a.H == m.H && a.Freq > max) max = a.Freq;
      r.Add(new { Name = d.Name, W = m.W, H = m.H, Hz = m.Freq, MaxHz = max, Primary = (d.Flags & 4) != 0 });
    }
    return r.ToArray();
  }
}
'@
[PcoDisp]::List()`;

const NVME_MODEL = /nvme|\bsn\s?[5-8]\d0\b|\b9[789]0\s?(evo|pro)\b|\bpm9[a-z0-9]{2}\b|\bmz-?v[l5-9]|\bsx[68]\d{3}\b|\bmp[56]00\b|firecuda\s?5[234]0|\bkc3000\b|\bsnv[1-3]|\bsa2000\b|wd_?black\s?sn|\bpc\s?(sn|pm)\d/i;

let cache = null;

const toGb = (bytes) => (bytes ? Math.round((bytes / 1073741824) * 10) / 10 : 0);

async function getHardware(force = false) {
  if (cache && !force) return cache;

  const [cpu, gfx, mem, memLayout, diskLayout, osInfo, sys, board, fsSize, battery] = await Promise.all([
    safe(si.cpu()), safe(si.graphics()), safe(si.mem()), safe(si.memLayout()), safe(si.diskLayout()),
    safe(si.osInfo()), safe(si.system()), safe(si.baseboard()), safe(si.fsSize()), safe(si.battery()),
  ]);

  // Compléments précis sous Windows (date des pilotes, vitesse RAM réelle, type de disque).
  let wGpu = null, wRam = null, wDisk = null, sysDiskNo = null, wMon = null, wHz = null;
  if (isWin) {
    [wGpu, wRam, wDisk, sysDiskNo, wMon, wHz] = await Promise.all([
      psJson("Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,@{n='DriverDate';e={if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}}},AdapterRAM"),
      psJson('Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,Speed,ConfiguredClockSpeed,SMBIOSMemoryType,Manufacturer,PartNumber'),
      psJson('Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,MediaType,BusType,HealthStatus,Size'),
      ps('(Get-Partition -DriveLetter C | Get-Disk).Number'),
      // Nom complet des écrans, lu dans leur EDID (la source par défaut le tronque souvent).
      psJson("Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue | " +
        "Select-Object @{n='Name';e={-join [char[]]($_.UserFriendlyName | Where-Object {$_})}},@{n='Maker';e={-join [char[]]($_.ManufacturerName | Where-Object {$_})}}"),
      psJson(PS_DISPLAYS),
    ]);
  }

  // --- GPU
  const gpus = [];
  for (const c of (gfx && gfx.controllers) || []) {
    const name = c.model || c.name || '';
    if (!name || VIRTUAL.test(name)) continue;
    const w = (wGpu || []).find((x) => x.Name && (x.Name === name || x.Name.includes(name) || name.includes(x.Name)));
    gpus.push({
      name, vendor: c.vendor || '', vram: c.vram || (w && w.AdapterRAM ? Math.round(w.AdapterRAM / 1048576) : null),
      driverVersion: c.driverVersion || (w && w.DriverVersion) || null,
      driverDate: (w && w.DriverDate) || null,
    });
  }

  // --- Écrans
  // Association avec les noms Windows : même fabricant d'abord, puis dans l'ordre pour les écrans restants.
  const monNames = (wMon || []).filter((m) => m && m.Name).map((m) => ({ name: String(m.Name).trim(), maker: String(m.Maker || '').trim(), used: false }));
  const fullName = (d) => {
    const v = String(d.vendor || '').trim().toUpperCase();
    let m = monNames.find((x) => !x.used && v && x.maker.toUpperCase() === v)
      || monNames.find((x) => !x.used && v && x.maker.toUpperCase().startsWith(v.slice(0, 1)) && x.name.toUpperCase().includes(String(d.model || '').trim().slice(0, 1).toUpperCase()));
    if (!m) m = monNames.find((x) => !x.used);
    if (!m) return null;
    m.used = true;
    return m.name;
  };
  const displays = ((gfx && gfx.displays) || []).map((d) => {
    const w = (wHz || []).find((x) => x && x.Name && String(x.Name).toLowerCase() === String(d.deviceName || '').toLowerCase());
    return {
      model: fullName(d) || d.model || d.deviceName || t("Écran"),
      resX: (w && w.W) || d.currentResX || d.resolutionX || 0,
      resY: (w && w.H) || d.currentResY || d.resolutionY || 0,
      hz: (w && w.Hz) || Math.round(d.currentRefreshRate || d.refreshRate || 0),
      maxHz: (w && w.MaxHz) || null,
      main: w ? !!w.Primary : !!d.main,
    };
  });

  // --- RAM
  let sticks = [];
  if (wRam && wRam.length) {
    sticks = wRam.map((r) => ({
      sizeGb: Math.round((r.Capacity || 0) / 1073741824),
      type: SMBIOS_RAM[r.SMBIOSMemoryType] || null,
      speed: r.Speed || null, configured: r.ConfiguredClockSpeed || null,
      manufacturer: (r.Manufacturer || '').trim(), part: (r.PartNumber || '').trim(),
    }));
  } else if (memLayout && memLayout.length) {
    sticks = memLayout.filter((m) => m.size).map((m) => ({
      sizeGb: Math.round(m.size / 1073741824), type: m.type || null,
      speed: m.clockSpeed || null, configured: m.clockSpeed || null,
      manufacturer: (m.manufacturer || '').trim(), part: (m.partNum || '').trim(),
    }));
  }
  const totalFromSticks = sticks.reduce((s, x) => s + x.sizeGb, 0);
  const totalGb = totalFromSticks || Math.round(toGb(mem && mem.total));
  const usedPct = mem && mem.total ? Math.round(((mem.total - (mem.available ?? mem.free ?? 0)) / mem.total) * 100) : null;
  const ram = {
    totalGb, usedPct, sticks,
    type: (sticks.find((s) => s.type) || {}).type || null,
    speed: Math.max(0, ...sticks.map((s) => s.configured || s.speed || 0)) || null,
  };

  // --- Disques
  let disks = [];
  if (wDisk && wDisk.length) {
    const sysNo = sysDiskNo ? parseInt(String(sysDiskNo).trim(), 10) : null;
    disks = wDisk.map((d) => {
      const bus = String(d.BusType || '');
      const media = String(d.MediaType || '');
      let type = '?';
      if (/nvme/i.test(bus)) type = 'NVMe';
      // Derrière un contrôleur RAID (Intel RST…), Windows ne dit pas « NVMe » : on reconnaît les modèles courants.
      else if (/ssd/i.test(media) && NVME_MODEL.test(d.FriendlyName || '')) type = 'NVMe';
      else if (/ssd/i.test(media)) type = 'SSD';
      else if (/hdd/i.test(media)) type = 'HDD';
      return {
        name: d.FriendlyName || t("Disque"), type, interface: bus || null,
        sizeGb: Math.round((d.Size || 0) / 1e9), health: d.HealthStatus || null,
        removable: /usb/i.test(bus), isSystem: sysNo !== null && Number(d.DeviceId) === sysNo, number: Number(d.DeviceId),
      };
    });
  } else if (diskLayout && diskLayout.length) {
    disks = diskLayout.map((d) => {
      let type = '?';
      if (/nvme/i.test(d.interfaceType || '') || /nvme/i.test(d.type || '')) type = 'NVMe';
      else if (/ssd/i.test(d.type || '')) type = 'SSD';
      else if (/hd/i.test(d.type || '')) type = 'HDD';
      return {
        name: d.name || t("Disque"), type, interface: d.interfaceType || null,
        sizeGb: Math.round((d.size || 0) / 1e9), health: d.smartStatus && d.smartStatus !== 'unknown' ? (d.smartStatus === 'Ok' ? 'Healthy' : d.smartStatus) : null,
        removable: /usb/i.test(d.interfaceType || ''), isSystem: false,
      };
    });
  }
  if (disks.length && !disks.some((d) => d.isSystem)) {
    const first = disks.find((d) => !d.removable) || disks[0];
    first.isSystem = true;
  }

  const volumes = (fsSize || []).map((v) => ({
    mount: v.mount || v.fs, sizeGb: Math.round((v.size || 0) / 1e9), usedPct: Math.round(v.use || 0),
    freeGb: Math.round(((v.size || 0) - (v.used || 0)) / 1e9),
  }));

  // --- Système
  const build = osInfo ? String(osInfo.build || '') : '';
  const osObj = {
    distro: osInfo ? osInfo.distro : os.type(), release: osInfo ? osInfo.release : os.release(),
    build, arch: osInfo ? osInfo.arch : os.arch(), hostname: osInfo ? osInfo.hostname : os.hostname(),
    isWin11: isWin && Number(build) >= 22000, isWin10: isWin && Number(build) > 0 && Number(build) < 22000,
    uptimeH: Math.round((os.uptime() / 3600) * 10) / 10,
  };

  const hw = {
    collectedAt: new Date().toISOString(), platform: process.platform,
    system: {
      manufacturer: (sys && sys.manufacturer) || '', model: (sys && sys.model) || '',
      isLaptop: !!(battery && battery.hasBattery),
    },
    board: { manufacturer: (board && board.manufacturer) || '', model: (board && board.model) || '' },
    cpu: {
      brand: (cpu && ((cpu.manufacturer ? cpu.manufacturer + ' ' : '') + cpu.brand)) || os.cpus()[0]?.model || t("Processeur inconnu"),
      cores: (cpu && cpu.cores) || os.cpus().length,
      physicalCores: (cpu && cpu.physicalCores) || null,
      speed: (cpu && cpu.speed) || null, speedMax: (cpu && cpu.speedMax) || null,
    },
    gpus, displays, ram, disks, volumes, os: osObj,
  };
  hw.perf = evaluate(hw);
  cache = hw;
  return hw;
}

module.exports = { getHardware };
