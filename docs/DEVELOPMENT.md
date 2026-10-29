# Gallium — technical documentation

Gallium is an Electron desktop app that **analyzes, diagnoses and optimizes any Windows 10 / 11 PC**: which components
are healthy or failing, whether Windows is well configured, live monitoring, in-game performance estimates and reports.

## Running from source

Requirements: [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start          # run the app
npm test           # scoring engine, blue-screen decoding, report escaping, catalog (no Electron needed)
npm run dist       # build dist/Gallium-Setup-x.y.z.exe and dist/Gallium-Portable-x.y.z.exe
```

The app always runs **as administrator** (Windows asks for permission at launch; the installer manifest requires it).
This is needed to read SMART data, the Windows event logs and to apply optimizations. For automated tests only,
`PCOPT_SKIP_ADMIN=1` skips the elevation check.

On some machines, electron-builder fails to move its cache between drives; set `ELECTRON_BUILDER_CACHE` to a folder on
the same drive as `%TEMP%` before `npm run dist`.

## Features

- **Home**: PC composition and scores (PC health, Gaming, Video editing, Streaming, 3D / Creation / Dev, Windows),
  plus a 0–100 score for every component (CPU, GPUs, memory, each drive, each display, motherboard, system).
- **Diagnostic** (~30 s): *OK / Watch / Failing* verdict for each component:
  - **Power and stability**: unexpected shutdowns, decoded blue screens (stop code + likely component), minidump analysis
    (`C:\Windows\Minidump\*.dmp`: stop code, parameters and **faulting driver**), Windows reliability index, crashing apps;
  - **Processor**: WHEA hardware errors, idle load and responsible processes, temperature when available;
  - **Graphics card**: driver crashes, temperature / fan / VRAM (NVIDIA), driver age;
  - **Memory**: Windows Memory Diagnostic result, mismatched modules, XMP/EXPO. Two tests: a background check of free
    memory (~3 min, no restart) and/or the full Windows test (mdsched) scheduled for the next restart;
  - **Drives**: Windows health status, I/O errors and bad sectors in the logs, file system, SMART wear / temperature / hours;
  - **Battery** (laptops), **devices** in error in Device Manager, **drivers** (unsigned or very old, on demand);
  - **Network**: Ethernet / Wi-Fi, link speed, latency, jitter and loss to the router and to the Internet;
  - **Security and maintenance**: antivirus, Secure Boot, activation, last update, pending restart, BIOS age.
- **Stability test** (1–10 min): CPU at 100% on all threads with a live chart, partial RAM pattern check, temperatures.
- **Graphics card test** (1–10 min): heavy WebGL scene, frames per second, GPU temperature and power (NVIDIA).
- **Analysis**, quick (~15 s) or full (~1 min): Windows settings, storage, memory, drivers, network, OBS tips, performance
  measurements (CPU, disk write and read, memory) and per-game settings. A **Fix** button applies available fixes; each
  analysis is compared with the previous one (before / after).
- **Optimize**: one-click **reversible** tweaks (High performance plan, Game Mode, Xbox background recording, mouse
  acceleration) and temporary file cleanup. A Windows **restore point** is created before the first optimization.
- **Monitor**: live CPU (per thread), RAM, GPU, GPU temperature, network and most active applications.
- **Games**: about thirty games with estimated FPS by resolution and quality; installed games are detected.
- **Component database** (Home button): every CPU and GPU in the database with score, average FPS, per-game FPS and a
  description; optional CPU/GPU pairing with bottleneck details; search with estimates for unknown models (including from
  VRAM, e.g. "RTX 9999 12 GB").
- **Report**: PDF or HTML document (optional name, reference and notes, serial number, diagnostic, blue screens, analysis,
  CPU and GPU tests, drivers), client records and history.

## Modes, settings and languages

On first launch, Gallium asks how it will be used:

| | Personal | Professional | Essential ("Skip") |
|---|:-:|:-:|:-:|
| Diagnostic, analysis, optimization, report | ✓ | ✓ | ✓ |
| Monitor, games, component database, stability tests (CPU, RAM, GPU) | ✓ | ✓ | — |
| Driver list, multi-PC client records, report with client / reference / serial number | — | ✓ | — |

"Remember my choice" skips the question afterwards. **Settings** lets you change mode and language at any time
(Gallium restarts to apply the language, including to texts produced by the diagnostic and analysis).

**Default language: English.** The first screen and Settings offer 20 languages.

**Translations**: the source text is the French written in the code and passed to `t('…')`; each language is a
`locales/<code>.json` file (French source → translation). Only languages with a file are listed. Tools in `tools/i18n/`:

- `extract.js`: lists every text to translate into `locales/_source.json` (run it after adding text);
- `check.js`: checks every language (missing or extra texts, lost or invented `{0}` placeholders);
- `merge.js <code> chunk…`: assembles a language from chunks aligned with `_source.json`, with the same checks;
- `codemod.js` / `html-pass.js`: were used to wrap the existing texts in `t()` automatically;
- `update-opensource-strings.js`: one-off update of the support / license texts.

To add text in the code, write it in French inside `t('…')` (placeholders: `t('{0} Go libres', [n])`), run
`extract.js`, then translate the new entries in each `locales/<code>.json`.

## What the app changes

Analyses and diagnostics change nothing. Only actions you trigger (**Optimize** page or **Fix** buttons) change a
setting, and only settings of your Windows account (HKCU registry, power plan): the previous value is kept and **Undo**
restores it. A Windows restore point is created before the first optimization (system protection is enabled on the
system drive if needed). Temporary file cleanup asks for confirmation and cannot be undone. The diagnostic pings the
router and 1.1.1.1 (Cloudflare) to measure latency. No other network traffic, no telemetry.

## Notes

- Scores and FPS are **estimates** from built-in tables, not real benchmarks.
- Windows does not expose the CPU temperature without a dedicated driver; live GPU temperature / load is only available
  for NVIDIA cards (through `nvidia-smi`, installed with the driver).
- The built-in RAM test checks part of the free memory; use MemTest86 or `mdsched.exe` for a full test.
- Hardware detection works whatever the Windows display language.

## Component scores

Scores come from `lib/hwdb.js`, a small offline knowledge base:

- about 470 Intel / AMD processors (desktop and laptop, 2011 → 2025) and 300 graphics cards (desktop, laptop,
  integrated, professional), plus the PCIe generation of common SSDs;
- a name parser that understands Windows naming ("12th Gen Intel(R) Core(TM) i5-12400F", "RTX 4060 Laptop GPU",
  "AMD Radeon(TM) Graphics" mapped to the right integrated GPU…);
- an estimation model for unknown models: weighted average of neighbors of the same family, generation and tier,
  adjusted to the detected thread count; the score then states its source.

To add a component: one line in `CPU_DATA` (`key gaming cinebench_r23_multi threads`) or `GPU_DATA` (`key=perf`), and
the VRAM in `GPU_VRAM_DATA`.

## Memory footprint

Gallium is tuned to stay light on small PCs: Chromium's network service runs in the main process (one process fewer),
memory of closed pages is released and the monitor pauses while the window is minimized — about 360 MB in total
instead of 480 MB, animations included.

## Links (support button and source code)

`package.json` → `"gallium": { "supportUrl": "…", "repoUrl": "…" }`. Only Ko-fi, Buy Me a Coffee, Liberapay,
PayPal.me and GitHub Sponsors URLs are accepted for the support button, and only `https://github.com/owner/repo` for the
source code link. `node tools/set-links.js --github owner/repo --kofi name --name "Author"` fills them in everywhere.

## Name and logo

**Gallium** is a metal that forms geometric crystals and is used to make electronic components (semiconductors, LEDs).
The logo (`build/logos/gallium.svg`) is a cluster of green crystals whose faces carry a printed-circuit texture.
`build/logos/` also holds a dark-background variant and earlier drafts. To change the logo: copy the SVG to
`renderer/logo.svg` and regenerate `build/icon.png` (512 px) and `renderer/icon.png` (256 px).

Data from older installs named "PC Optimizer" or "Malachite" (history, analyses) is migrated automatically on first launch.

## Project structure

```
main.js / preload.js     Electron main process + secure bridge
lib/hardware.js          hardware detection
lib/scoring.js           usage scores, component scores, FPS estimates
lib/hwdb.js              component database + estimation model
lib/catalog.js           browsable database: names, scores, per-game FPS, descriptions
lib/analysis.js          quick and full analyses
lib/health.js            component health diagnostic + minidump reader
lib/stress.js            stability test (CPU + RAM)
lib/monitor.js           live measurements
lib/tweaks.js            reversible optimizations + restore point
lib/drivers.js           driver list and checks
lib/clients.js           client records (report history, comparison summary)
lib/report.js            HTML / PDF report
lib/steam.js             installed game detection
lib/db.js                games, resolutions, CPU / GPU score access
lib/i18n.js              translations (t, language selection)
locales/                 one file per language
renderer/                user interface (HTML, CSS, JS)
test/selftest.js         automated checks (npm test)
tools/                   translation tools, set-links.js
docs/                    documentation and images
build/                   icon and logo sources for the installer
```
