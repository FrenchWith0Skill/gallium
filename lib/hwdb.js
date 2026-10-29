'use strict';
const { t } = require('./i18n');
// Base de connaissances des composants + modèle d'estimation léger (sans IA générative, hors ligne).
//
// 1. Les noms donnés par Windows sont normalisés en une clé (« i5-12400f », « r7-7800x3d », « rtx 4060 laptop »…).
// 2. La clé est cherchée dans les tables ci-dessous (valeurs relatives estimées, pas des mesures).
// 3. Si le modèle est absent, il est estimé d'après ses voisins de la même famille, génération et gamme,
//    ajusté au nombre de threads réellement détecté. La source de chaque note est indiquée.

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Processeurs : « clé jeu multi threads ».
// jeu : performance en jeu relative (Ryzen 7 9800X3D = 100).
// multi : score Cinebench R23 multi-cœur approximatif, converti en note 0-100 (voir prodFromMulti).
// ---------------------------------------------------------------------------
const CPU_DATA = `
i7-2600k 20 3900 8|i7-2600 19 3700 8|i5-2500k 17 2900 4|i5-2400 15 2600 4|i3-2100 11 1600 4
i7-3770k 22 4300 8|i7-3770 21 4100 8|i5-3570k 19 3300 4|i5-3470 17 3000 4|i3-3220 12 1800 4
i7-4790k 27 5200 8|i7-4770k 25 4700 8|i7-4790 25 4800 8|i7-4770 24 4500 8|i5-4690k 23 3700 4|i5-4590 21 3400 4|i5-4460 19 3200 4|i5-4440 19 3100 4|i3-4160 14 2100 4|i3-4130 13 2000 4
i7-6700k 36 5800 8|i7-6700 34 5300 8|i5-6600k 32 4000 4|i5-6600 30 3800 4|i5-6500 28 3600 4|i5-6400 26 3300 4|i3-6100 22 2400 4
i7-7700k 40 6300 8|i7-7700 38 5900 8|i5-7600k 36 4400 4|i5-7600 34 4200 4|i5-7500 32 4000 4|i5-7400 30 3800 4|i3-7100 26 2600 4
i7-8700k 46 8200 12|i7-8700 44 7800 12|i5-8600k 42 6400 6|i5-8500 39 5900 6|i5-8400 38 5700 6|i3-8350k 34 3600 4|i3-8100 32 3300 4
i9-9900k 56 12500 16|i9-9900 53 11800 16|i7-9700k 50 9500 8|i7-9700 47 9000 8|i5-9600k 46 6800 6|i5-9600 44 6500 6|i5-9500 43 6200 6|i5-9400 42 6000 6|i3-9300 34 3900 4|i3-9100 32 3700 4
i9-10900k 60 14500 20|i9-10850k 59 14200 20|i9-10900 57 13800 20|i7-10700k 58 12800 16|i7-10700 54 12000 16|i5-10600k 54 9800 12|i5-10600 52 9400 12|i5-10500 50 9000 12|i5-10400 48 8500 12|i3-10320 40 5200 8|i3-10300 39 5000 8|i3-10100 38 4800 8|i3-10105 38 4900 8
i9-11900k 66 15500 16|i9-11900 62 14500 16|i7-11700k 62 15000 16|i7-11700 58 14000 16|i5-11600k 58 11000 12|i5-11600 56 10500 12|i5-11500 54 10000 12|i5-11400 52 9800 12
i9-12900ks 82 28500 24|i9-12900k 80 27500 24|i9-12900 74 24000 24|i7-12700k 76 22500 20|i7-12700 72 20000 20|i5-12600k 72 17500 16|i5-12600 66 12500 12|i5-12500 64 12000 12|i5-12400 62 12000 12|i3-12300 54 8500 8|i3-12100 50 8100 8
i9-13900ks 87 40000 32|i9-13900k 85 39000 32|i9-13900 78 33000 32|i7-13700k 82 30500 24|i7-13700 76 27000 24|i5-13600k 78 24000 20|i5-13600 72 21000 20|i5-13500 70 20500 20|i5-13400 66 16500 16|i3-13100 52 9000 8
i9-14900ks 89 40500 32|i9-14900k 87 39500 32|i9-14900 80 33500 32|i7-14700k 85 35000 28|i7-14700 78 31000 28|i5-14600k 80 24500 20|i5-14600 74 22000 20|i5-14500 72 21500 20|i5-14400 68 17000 16|i3-14100 54 9500 8
u9-285k 88 42000 24|u9-285 84 38000 24|u7-265k 84 36000 20|u7-265 80 33000 20|u5-245k 78 25000 14|u5-245 74 23000 14|u5-235 72 21000 14|u5-225 70 17000 10
i7-8550u 26 3500 8|i5-8250u 24 3200 8|i7-8565u 27 3700 8|i5-8265u 25 3400 8|i7-10510u 27 3800 8|i5-10210u 25 3500 8|i3-10110u 18 2000 4|i7-1065g7 28 4200 8|i5-1035g1 26 3900 8
i7-1185g7 37 5300 8|i7-1165g7 36 5200 8|i5-1135g7 33 4600 8|i3-1115g4 26 2700 4
i7-1255u 40 7500 12|i5-1235u 38 7000 12|i3-1215u 30 5000 8|i7-1260p 44 9500 16|i5-1240p 42 9000 16|i7-1355u 42 8000 12|i5-1335u 40 7500 12|i3-1315u 32 5300 8|i7-1360p 46 10000 16|i5-1340p 44 9500 16
i7-8750h 40 7000 12|i7-9750h 42 7500 12|i5-9300h 36 4800 8|i7-10750h 46 8500 12|i5-10300h 38 5200 8|i7-10870h 50 11000 16|i9-11980hk 60 13000 16|i7-11800h 56 12000 16|i5-11400h 50 9000 12
i9-12900h 66 17000 20|i7-12700h 62 15500 20|i7-12650h 60 14000 16|i5-12500h 58 13000 16|i5-12450h 52 10000 12
i9-13900h 68 18000 20|i7-13700h 64 17000 20|i7-13620h 62 15000 16|i5-13500h 60 14500 16|i5-13420h 54 10500 12
i9-13980hx 82 31000 32|i9-13900hx 80 29000 32|i7-13700hx 74 22000 24|i7-13650hx 72 20000 20|i5-13450hx 64 15000 16|i9-14900hx 84 32000 32|i7-14700hx 78 26000 28|i7-14650hx 74 22000 24
u9-185h 64 18000 22|u7-155h 60 16000 22|u5-125h 56 13000 18|u7-155u 46 9000 14|u5-125u 42 8000 14|u7-258v 58 10500 8|u5-226v 52 9000 8|u9-275hx 86 34000 24|u7-255hx 82 30000 20|u7-255h 66 19000 16
c7-150u 44 8500 12|c5-120u 42 8000 12
n100 18 2800 4|n200 18 2900 4|n95 17 2700 4|n6000 11 1700 4|n5105 10 1500 4|n5100 9 1300 4|n5000 8 1200 4|n4500 7 600 2|n4120 7 1100 4|n4020 6 500 2|n4000 5 450 2|j4125 9 1300 4|g7400 34 3800 4|g6400 26 2300 4|g5400 24 2100 4|g4560 22 1900 4|g6900 24 2000 2
e5-2680v4 28 12000 28|e5-2690v4 30 13000 28|e5-2670v3 24 9500 24|e5-2650v2 18 6500 16|e3-1230v3 24 4500 8|e3-1231v3 24 4600 8
fx-8350 18 4200 8|fx-8320 16 3900 8|fx-6300 14 2900 6|fx-4300 10 1700 4
r7-1800x 30 8200 16|r7-1700x 29 7900 16|r7-1700 28 7500 16|r5-1600x 28 6200 12|r5-1600 28 5900 12|r5-1500x 24 4000 8|r3-1200 20 2700 4
r7-2700x 40 9300 16|r7-2700 38 8700 16|r5-2600x 34 7200 12|r5-2600 32 6900 12|r5-2400g 26 3900 8|r3-2200g 22 2900 4
r9-3950x 56 18500 32|r9-3900x 54 16300 24|r7-3800x 50 12300 16|r7-3700x 48 12000 16|r5-3600x 47 9300 12|r5-3600 45 9000 12|r5-3500x 42 7500 6|r3-3300x 38 6200 8|r3-3100 36 5600 8|r5-3400g 30 5200 8|r3-3200g 26 3700 4
r7-4700g 52 12500 16|r5-4600g 50 9800 12|r5-4500 48 9500 12
r9-5950x 72 26000 32|r9-5900x 70 21500 24|r7-5800x3d 82 14500 16|r7-5700x3d 78 13500 16|r7-5800x 68 15500 16|r7-5700x 64 14500 16|r7-5700g 60 13500 16|r7-5700 58 13000 16|r5-5600x3d 76 11500 12|r5-5600x 62 11000 12|r5-5600 60 10800 12|r5-5600gt 56 10000 12|r5-5600g 56 9800 12|r5-5500 52 9500 12|r3-5300g 44 6800 8
r9-7950x3d 93 34500 32|r9-7950x 82 36500 32|r9-7900x3d 88 28000 24|r9-7900x 80 29000 24|r9-7900 78 26500 24|r7-7800x3d 92 18000 16|r7-7700x 78 19500 16|r7-7700 75 18500 16|r5-7600x 74 15000 12|r5-7600 70 14500 12|r5-7500f 68 14000 12|r5-7400f 64 13000 12
r7-8700g 70 16500 16|r7-8700f 70 16500 16|r5-8600g 66 13500 12|r5-8500g 52 11000 12|r5-8400f 62 12500 12
r9-9950x3d 98 40000 32|r9-9950x 82 42000 32|r9-9900x3d 96 30000 24|r9-9900x 80 31000 24|r7-9800x3d 100 23000 16|r7-9700x 80 20500 16|r5-9600x 76 16500 12|r5-9600 72 16000 12
r5-3500u 22 3000 8|r7-3700u 24 3200 8|r5-4500u 36 6500 6|r7-4700u 40 7500 8|r5-4600h 44 9000 12|r7-4800h 48 11000 16|r9-4900hs 50 11500 16
r5-5500u 40 7500 12|r5-5625u 41 7800 12|r7-5700u 42 9000 16|r7-5825u 44 9500 16|r5-5600h 50 9500 12|r7-5800h 54 12500 16|r9-5900hx 58 13500 16
r5-6600h 54 10500 12|r7-6800h 58 13500 16|r9-6900hx 60 14500 16|r5-7530u 42 8000 12|r7-7730u 46 9800 16|r5-7535hs 54 10500 12|r7-7735hs 58 13500 16
r5-7640hs 58 12000 12|r7-7840u 56 13000 16|r7-7840hs 62 16500 16|r9-7940hs 64 17000 16|r5-8645hs 58 12500 12|r7-8840hs 62 16000 16|r7-8845hs 62 17000 16|r9-7845hx 78 28000 24|r9-7945hx 84 34000 32
ai9-370 66 21000 24|ai9-365 64 19000 20|ai7-350 60 16000 16
athlon-3000g 18 1800 4|athlon-200ge 16 1700 4|athlon-3050u 8 900 2|athlon-3150u 9 1000 4|athlon-300u 10 1500 4
i7-5775c 28 5000 8|i5-5675c 25 3600 4|i5-4670k 22 3500 4|i5-4570 20 3300 4|i3-4170 14 2150 4|i7-4710hq 25 4300 8|i7-4720hq 25 4400 8|i7-4700hq 24 4200 8|i5-4210u 12 1700 4|i7-4510u 13 1800 4
i7-6700hq 29 4800 8|i5-6300hq 25 3400 4|i7-6500u 15 2100 4|i5-6200u 14 2000 4|i3-6006u 9 1300 4|i7-7700hq 31 5100 8|i5-7300hq 27 3700 4|i7-7500u 17 2300 4|i5-7200u 16 2100 4|i3-7100u 10 1400 4|i3-7020u 9 1300 4
i5-8300h 36 5000 8|i3-8130u 13 1900 4|i5-8350u 25 3300 8|i7-8650u 27 3700 8|i9-9900ks 58 13000 16|i3-9350k 36 4100 4
i9-10980hk 55 11500 16|i7-10875h 50 11200 16|i5-10500h 42 7200 12|i5-10200h 37 5000 8|i5-10310u 25 3500 8|i7-10610u 27 3800 8
i5-11320h 36 5000 8|i7-11370h 40 5500 8|i5-11260h 46 8000 12|i7-11600h 54 11000 12|i9-11900h 58 12500 16|i5-1145g7 33 4700 8|i3-1125g4 28 3900 8|i5-1155g7 34 4800 8|i7-1195g7 38 5400 8
i5-1230u 34 6000 12|i7-1250u 36 6500 12|i5-1245u 38 7000 12|i7-1265u 41 7600 12|i7-1280p 48 11500 20|i3-1220p 34 6500 12|i5-12600h 60 14000 16|i7-12800h 64 16500 20|i9-12900hx 74 21000 24|i7-12800hx 70 19500 24|i5-12490f 64 12500 12
i3-1305u 24 3500 6|i5-1334u 40 7400 12|i7-1365u 43 8200 12|i5-13500hx 70 21000 20|i7-13800h 66 17500 20|i7-13790f 77 27500 24|i5-13490f 67 17000 16|i5-14450hx 66 16000 16
c3-100u 34 6000 8|c5-210h 56 12500 12|c7-240h 62 16500 16|c9-270h 64 18000 20
u7-165h 61 16500 22|u7-165u 47 9300 14|u5-135h 57 13500 18|u5-135u 43 8200 14|u5-115u 38 6500 10|u9-288v 62 11500 8|u7-268v 60 11000 8|u7-256v 56 10000 8|u5-238v 54 9500 8|u5-228v 53 9200 8|u9-285h 70 22000 16|u5-225h 64 17000 14|u5-245hx 72 23000 14
e5-2697v2 20 8500 24|e5-2696v3 25 13000 36|e5-2699v3 26 13500 36|e5-2683v4 26 13000 32|e5-2640v4 22 9000 20|e5-2620v3 18 6000 12|e5-1650v3 22 6000 12|e3-1240v5 30 5300 8
n3350 3 350 2|n3060 2 300 2|n4100 6 900 4|n5095 9 1400 4|n6005 12 1800 4|n150 18 2800 4|n97 17 2700 4|j1900 3 500 4|j4105 8 1200 4|j5005 9 1300 4|g4400 18 1600 2|g4900 20 1700 2|g5905 20 1800 2|g6405 26 2350 4|g3260 12 1100 2
fx-9590 20 4600 8|fx-8370 18 4300 8|fx-8300 16 3900 8|fx-6350 15 3100 6
r5-1400 22 3600 8|r3-1300x 20 2800 4|r5-2500x 30 5000 8|r5-2500u 20 2500 8|r7-2700u 22 2800 8|r3-2200u 12 1500 4
r9-3900 52 15500 24|r9-3900xt 55 16600 24|r7-3800xt 51 12500 16|r5-3600xt 48 9500 12|r5-3500 40 6800 6|r7-3750h 26 3600 8|r5-3550h 24 3300 8|r5-3450u 21 2900 8|r3-3200u 12 1700 4
r7-4800u 46 10000 16|r5-4600u 40 7600 12|r3-4300u 26 3800 4|r7-4800hs 49 11200 16|r9-4900h 51 11800 16|r7-4750g 53 12600 16|r5-4650g 50 9900 12|r3-4300g 40 6400 8|r3-4100 38 6300 8
r9-5900xt 72 24000 32|r9-5900 68 20500 24|r7-5800xt 69 15800 16|r7-5800 66 15000 16|r5-5600xt 63 11300 12|r5-5500gt 54 9600 12
r7-5800u 45 9800 16|r5-5600u 41 7800 12|r5-5560u 38 7000 12|r3-5300u 28 5000 8|r3-5425u 30 5100 8|r5-5500h 48 9000 12|r7-5800hs 52 12000 16|r9-5900hs 56 13000 16|r9-5980hx 60 14000 16
r7-6800u 54 12000 16|r5-6600u 50 9500 12|r7-6800hs 57 13000 16|r9-6900hs 60 14000 16|r3-7320u 20 3600 8|r5-7520u 26 4800 8|r5-7535u 48 9500 12|r7-7735u 52 11500 16|r7-7735h 58 13500 16
r3-7440u 40 6200 8|r5-7540u 46 9200 12|r5-7640u 52 10500 12|r7-7840h 62 16500 16|r9-7940h 64 17000 16|r5-7645hx 68 15500 12|r7-7745hx 74 21000 16|r9-7945hx3d 88 34000 32
r5-8540u 48 9500 12|r7-8840u 56 13000 16|r9-8945hs 64 17500 16|ai5-340 50 12000 12|ai7-360 58 15000 16|r5-7600x3d 86 15500 12|r3-8300g 46 8500 8
`;

// Conversion du score multi-cœur (Cinebench R23) en note 0-100 : échelle douce, 37 000 points = 100.
const prodFromMulti = (r23) => Math.round(clamp(100 * Math.pow(Math.max(0, r23) / 37000, 0.8)));

const CPUS = new Map();
for (const item of CPU_DATA.split(/[|\n]/).map((x) => x.trim()).filter(Boolean)) {
  const [key, g, m, tx] = item.split(/\s+/);
  CPUS.set(key, { gaming: Number(g), prod: prodFromMulti(Number(m)), threads: Number(tx) });
}

// Lecture du nom du processeur → caractéristiques + clé de recherche.
function parseCpu(brand) {
  const b = String(brand || '').toLowerCase().replace(/\((r|tm)\)|™|®/g, ' ').replace(/\s+/g, ' ');
  let m;
  if ((m = b.match(/\bi([3579])[- ]?(\d{4,5})([a-z]{0,2}\d?)\b/))) {
    const num = m[2];
    const gen = num.length === 5 ? Number(num.slice(0, 2)) : Number(num[0]);
    return { vendor: 'intel', family: 'core', tier: Number(m[1]), num: Number(num), gen, suffix: m[3], key: `i${m[1]}-${num}${m[3]}` };
  }
  if ((m = b.match(/\bultra ([3579]) (\d{3})([a-z]{0,2})\b/))) {
    return { vendor: 'intel', family: 'ultra', tier: Number(m[1]), num: Number(m[2]), gen: Number(m[2][0]), suffix: m[3], key: `u${m[1]}-${m[2]}${m[3]}` };
  }
  if ((m = b.match(/\bcore ([3579]) (\d{3})([a-z]{0,2})\b/))) {
    return { vendor: 'intel', family: 'core-n', tier: Number(m[1]), num: Number(m[2]), gen: Number(m[2][0]), suffix: m[3], key: `c${m[1]}-${m[2]}${m[3]}` };
  }
  if ((m = b.match(/\bxeon.*?\b(e[35])-(\d{4}[a-z]?) ?(v\d)?/))) {
    return { vendor: 'intel', family: 'xeon', tier: 0, num: Number(m[2].replace(/\D/g, '')), gen: m[3] ? Number(m[3].slice(1)) : 1, suffix: '', key: `${m[1]}-${m[2]}${m[3] || ''}` };
  }
  if ((m = b.match(/\b([njg])(\d{2,4})\b/)) && /intel|pentium|celeron/.test(b)) {
    return { vendor: 'intel', family: 'entry-' + m[1], tier: 1, num: Number(m[2]), gen: 0, suffix: '', key: `${m[1]}${m[2]}` };
  }
  if ((m = b.match(/\bryzen ai ([579])(?: pro)? (?:hx )?(\d{3})\b/))) {
    return { vendor: 'amd', family: 'ryzen-ai', tier: Number(m[1]), num: Number(m[2]), gen: 1, suffix: 'hx', key: `ai${m[1]}-${m[2]}` };
  }
  if ((m = b.match(/\bryzen ([3579])(?: pro)? (\d{4})([a-z0-9]{0,4})\b/))) {
    return { vendor: 'amd', family: 'ryzen', tier: Number(m[1]), num: Number(m[2]), gen: Number(m[2][0]), suffix: m[3], key: `r${m[1]}-${m[2]}${m[3]}` };
  }
  if ((m = b.match(/\bfx\s*-?\s*(\d{4})\b/))) return { vendor: 'amd', family: 'fx', tier: 0, num: Number(m[1]), gen: 0, suffix: '', key: `fx-${m[1]}` };
  if ((m = b.match(/\bathlon(?: silver| gold)? (\d{3,4})([a-z]{0,2})\b/))) return { vendor: 'amd', family: 'athlon', tier: 1, num: Number(m[1]), gen: 0, suffix: m[2], key: `athlon-${m[1]}${m[2]}` };
  return null;
}

// Gamme d'usage déduite du suffixe : bureau, portable basse conso, portable performance…
function segmentOf(p) {
  const s = p.suffix || '';
  if (p.family === 'ryzen-ai') return 'h';
  if (/^(hx)$/.test(s)) return 'hx';
  if (/^(h|hk|hs|hq|mq)$/.test(s)) return 'h';
  if (/^p$/.test(s)) return 'p';
  if (/^(u|y|v|g\d)$/.test(s) || (p.family === 'core-n' && /u/.test(s))) return 'u';
  return 'desktop';
}
const SEGMENT_FACTOR = { desktop: [1, 1], hx: [0.92, 0.95], h: [0.85, 0.8], p: [0.78, 0.7], u: [0.72, 0.5] };

function cpuEntries() {
  const list = [];
  for (const [key, v] of CPUS) {
    const p = parseCpu(key.replace(/^i(\d)/, 'intel i$1').replace(/^r(\d)-/, 'ryzen $1 ').replace(/^u(\d)-/, 'ultra $1 ').replace(/^c(\d)-/, 'core $1 ')
      .replace(/^ai(\d)-/, 'ryzen ai $1 ').replace(/^fx-/, 'fx-').replace(/^athlon-/, 'athlon ').replace(/^([njg]\d)/, 'intel $1').replace(/^(e[35])-(\d{4})(v\d)?$/, 'xeon $1-$2 $3'));
    if (p) list.push({ ...p, ...v, key });
  }
  return list;
}
let CPU_ENTRIES = null;

const GEN_LABEL = (p) => (p.family === 'core' ? t("Core i{0} de {1}e génération", [p.tier, p.gen]) : p.family === 'ryzen' ? t("Ryzen {0} série {1}000", [p.tier, p.gen])
  : p.family === 'ultra' ? t("Core Ultra {0} série {1}00", [p.tier, p.gen]) : p.family === 'xeon' ? t("Xeon v{0}", [p.gen])
  : /^entry/.test(p.family) ? t("Pentium / Celeron proches") : p.family === 'athlon' ? t("Athlon proches") : t("processeurs proches"));

// Modèle d'estimation : moyenne pondérée des voisins (même famille, génération, gamme), ajustée aux threads.
function estimateCpu(p, threads) {
  if (!CPU_ENTRIES) CPU_ENTRIES = cpuEntries();
  const seg = segmentOf(p);
  const same = (e) => e.vendor === p.vendor && e.family === p.family;
  let pool = CPU_ENTRIES.filter((e) => same(e) && e.gen === p.gen && segmentOf(e) === seg);
  let factor = [1, 1];
  if (!pool.length) {
    // Pas de voisin dans la même gamme : version bureau de la même génération, corrigée selon la gamme.
    pool = CPU_ENTRIES.filter((e) => same(e) && e.gen === p.gen && segmentOf(e) === 'desktop');
    if (pool.length) { const f = SEGMENT_FACTOR[seg]; const d = SEGMENT_FACTOR[segmentOf(pool[0])]; factor = [f[0] / d[0], f[1] / d[1]]; }
  }
  if (!pool.length) {
    // Génération inconnue (plus récente) : génération connue la plus proche, +8 % par génération d'écart.
    const fam = CPU_ENTRIES.filter((e) => same(e) && segmentOf(e) === seg);
    if (fam.length) {
      const nearest = fam.reduce((a, e) => (Math.abs(e.gen - p.gen) < Math.abs(a.gen - p.gen) ? e : a));
      pool = fam.filter((e) => e.gen === nearest.gen);
      const k = Math.pow(1.08, clamp(p.gen - nearest.gen, -4, 3));
      factor = [k, k];
    }
  }
  if (!pool.length) return null;
  // Plus le modèle est proche (même gamme i5/i7, numéro proche), plus il pèse.
  let wsum = 0, g = 0, pr = 0;
  for (const e of pool) {
    const w = 1 / (1 + 3 * Math.abs(e.tier - p.tier) + Math.abs(e.num - p.num) / (p.num > 999 ? 400 : 40));
    const tScale = threads && e.threads ? Math.pow(threads / e.threads, 0.85) : 1;
    g += w * e.gaming * (threads && e.threads ? Math.pow(threads / e.threads, 0.12) : 1);
    pr += w * e.prod * tScale;
    wsum += w;
  }
  return {
    gaming: Math.round(clamp((g / wsum) * factor[0], 5, 100)), prod: Math.round(clamp((pr / wsum) * factor[1], 3, 100)),
    estimated: true, source: t("estimé d'après les {0}", [GEN_LABEL(p)]),
  };
}

function lookupCpu(brand, cpu = {}) {
  const threads = cpu.cores || null;
  const p = parseCpu(brand);
  if (p) {
    const variants = [p.key, p.key.replace(/f$/, ''), p.key.replace(/kf$/, 'k'), p.key.replace(/(x3d|xt|gt|ge|pro)$/, '')];
    for (const k of variants) {
      const v = CPUS.get(k);
      if (v) return { gaming: v.gaming, prod: v.prod, estimated: false, source: k === p.key ? 'base' : t("base (variante)") };
    }
    // Intel sans « K » absent de la table : même puce que la version K, fréquences un peu plus basses.
    if (p.vendor === 'intel' && p.family === 'core' && segmentOf(p) === 'desktop') {
      const k = CPUS.get(`i${p.tier}-${p.num}k`);
      if (k) return { gaming: Math.round(k.gaming * 0.94), prod: Math.round(k.prod * 0.92), estimated: false, source: t("base (d'après la version K)") };
    }
    const est = estimateCpu(p, threads);
    if (est) return est;
  }
  // Dernier recours : nombre de threads et fréquence.
  const ghz = cpu.speedMax || cpu.speed || 3;
  const tx = threads || 4;
  return {
    gaming: Math.round(clamp(10 * ghz + 2.2 * (cpu.physicalCores || tx / 2), 10, 70)),
    prod: Math.round(clamp(prodFromMulti(tx * 900 * (ghz / 3.4)), 5, 100)),
    estimated: true, source: t("estimé d'après le nombre de cœurs"),
  };
}

// ---------------------------------------------------------------------------
// Cartes graphiques : « clé performance » (RTX 5090 = 100, rastérisation).
// ---------------------------------------------------------------------------
const GPU_DATA = `
rtx 5090=100|rtx 5080=66|rtx 5070 ti=60|rtx 5070=48|rtx 5060 ti=36|rtx 5060=30|rtx 5050=21
rtx 4090=76|rtx 4080 super=62|rtx 4080=60|rtx 4070 ti super=54|rtx 4070 ti=47|rtx 4070 super=45|rtx 4070=38|rtx 4060 ti=31|rtx 4060=25|rtx 4050=19
rtx 3090 ti=45|rtx 3090=41|rtx 3080 ti=39|rtx 3080=37|rtx 3070 ti=31|rtx 3070=28|rtx 3060 ti=27|rtx 3060=20|rtx 3050=13
rtx 2080 ti=31|rtx 2080 super=27|rtx 2080=25|rtx 2070 super=24|rtx 2070=21|rtx 2060 super=19|rtx 2060=16|titan rtx=32
gtx 1650 ti=7|rtx 2050=9|gtx 1660 ti=13|gtx 1660 super=13|gtx 1660=11.5|gtx 1650 super=10.5|gtx 1650=8.5|gtx 1630=6
gtx 1080 ti=24|gtx 1080=19|gtx 1070 ti=17|gtx 1070=15|gtx 1060=10|gtx 1050 ti=7|gtx 1050=5.5|gt 1030=2.5|gt 1010=1.5|titan xp=26
gtx 980 ti=15|gtx 980=11|gtx 970=9|gtx 960=6.5|gtx 950=5|gtx 750 ti=3.6|gtx 750=3|gtx 780 ti=9|gtx 780=8|gtx 770=6.5|gtx 760=5|gt 730=1.2|gt 710=0.6
gtx 680=6|gtx 670=5.4|gtx 660 ti=4.8|gtx 660=4.2|gtx 650 ti=3|gt 640=1.5
rtx 5090 laptop=56|rtx 5080 laptop=48|rtx 5070 ti laptop=36|rtx 5070 laptop=28|rtx 5060 laptop=24
rtx 4090 laptop=50|rtx 4080 laptop=42|rtx 4070 laptop=25|rtx 4060 laptop=21|rtx 4050 laptop=17
rtx 3080 ti laptop=30|rtx 3080 laptop=26|rtx 3070 ti laptop=24|rtx 3070 laptop=22|rtx 3060 laptop=17|rtx 3050 ti laptop=11|rtx 3050 laptop=10
gtx 1080 laptop=15|gtx 1070 laptop=12|gtx 1060 laptop=8|gtx 980 laptop=7|gtx 970 laptop=5.5|gtx 965 laptop=3.6|gtx 960 laptop=3.2|gtx 950 laptop=2.6|gtx 860 laptop=2.4|gtx 850 laptop=2|rtx 2050 laptop=9|rtx 2080 laptop=18|rtx 2070 laptop=15|rtx 2060 laptop=13|gtx 1660 ti laptop=10.5|gtx 1650 ti laptop=7|gtx 1650 laptop=6.5|gtx 1050 ti laptop=5|gtx 1050 laptop=4|mx550=2.4|mx450=2.2|mx350=1.6|mx250=1.3|mx150=1.2|mx130=0.9
rx 9070 xt=54|rx 9070 gre=44|rx 9070=46|rx 9060 xt=34|rx 9060=28
rx 7900 xtx=58|rx 7900 xt=50|rx 7900 gre=42|rx 7800 xt=40|rx 7700 xt=34|rx 7700=30|rx 7600 xt=25|rx 7600=22
rx 6950 xt=43|rx 6900 xt=40|rx 6800 xt=37|rx 6800=33|rx 6750 xt=29|rx 6750 gre=27|rx 6700 xt=26|rx 6700=23|rx 6650 xt=21|rx 6600 xt=20|rx 6600=17.5|rx 6500 xt=8|rx 6400=5.5
rx 5700 xt=20|rx 5700=18|rx 5600 xt=16|rx 5600=15|rx 5500 xt=11|radeon vii=20|vega 64=14|vega 56=12.5
rx 590=10|rx 580=9|rx 570=7.5|rx 480=8.5|rx 470=7|rx 560=5|rx 550=3.5|rx 460=4.5
r9 fury x=12|r9 fury=11|r9 nano=10.5|r9 390x=9|r9 390=8.5|r9 290x=8|r9 290=7.5|r9 380x=6.5|r9 380=6|r9 280x=6.5|r7 370=4.5|r7 260x=3.5
rx 7900m=40|rx 7600m xt=21|rx 7600s=17|rx 6850m xt=32|rx 6800m=30|rx 6700m=24|rx 6600m=18|rx 6500m=7|rx 5600m=13|rx 5500m=10
arc b580=27|arc b570=24|arc a770=23|arc a750=20|arc a580=17|arc a380=7|arc a310=4|arc a770m=17|arc a730m=14|arc a370m=5.5
radeon 890m=9.5|radeon 880m=8.5|radeon 780m=7|radeon 760m=6|radeon 740m=3.5|radeon 680m=5|radeon 660m=3.8|radeon 610m=1.4
vega 11=4.2|vega 10=4|vega 8=3.6|vega 7=3.2|vega 6=2.6|vega 3=1.5|radeon graphics=3
arc 140v=9|arc 130v=8|arc graphics=7.5|iris xe=4|iris plus=3|iris pro=2.5
uhd 770=2.8|uhd 750=2.5|uhd 730=2.3|uhd 710=1.6|uhd 630=2|uhd 620=1.6|uhd 610=1.2|uhd 605=0.8|uhd 600=0.6|uhd graphics=2
gt 740=1.4|gt 630=0.9|gt 610=0.4|gtx 745=2.2|gtx 690=7|mx570=2.6|mx330=1.5|mx230=1.1|mx110=0.7|rtx 2080 super laptop=20|rtx 2070 super laptop=17
rtx a6000=42|rtx a5000=34|rtx a4500=30|rtx a4000=25|rtx a2000=13|rtx 6000 ada=70|rtx 5000 ada=55|rtx 4500 ada=42|rtx 4000 ada=30|rtx 2000 ada=17
quadro rtx 8000=33|quadro rtx 6000=33|quadro rtx 5000=24|quadro rtx 4000=19|quadro p6000=22|quadro p5000=17|quadro p4000=12|quadro p2200=8|quadro p2000=7|quadro p1000=4|quadro p620=2.3|quadro t2000=7|quadro t1000=5.5|nvidia t1000=5.5|nvidia t600=3.5|nvidia t400=2.2|quadro k2200=2.5
rx 7650 gre=26|rx 6300=3.5|rx 5300=9|rx 640=1.4|rx 560x=4.6|rx 550x=3.2|rx 580x=8.5|rx 570x=7|r7 250=1.6|r7 240=1.1|r9 270x=4.8|r9 270=4.4|r9 285=5.5|rx 7600m=17|rx 6650m=19|rx 6550m=9
radeon pro w7900=55|radeon pro w7800=45|radeon pro w7700=34|radeon pro w7600=22|radeon pro w6800=33|radeon pro w6600=17|radeon pro w5700=18|arc a550m=11|arc a530m=10
radeon 8060s=22|radeon 8050s=18|radeon 860m=5.5|radeon 840m=4
hd 630=1.8|hd 620=1.5|hd 615=1.2|hd 610=1.1|hd 530=1.7|hd 520=1.3|hd 515=1|hd 4600=1.1|hd 4400=0.9|hd 4000=0.7|hd 2500=0.4|hd graphics=1.2
`;
const GPUS = new Map();
for (const item of GPU_DATA.split(/[|\n]/).map((x) => x.trim()).filter(Boolean)) {
  const [k, v] = item.split('=');
  GPUS.set(k.trim(), Number(v));
}

function parseGpu(name) {
  const n = String(name || '').toLowerCase().replace(/\((r|tm)\)|™|®/g, ' ').replace(/\s+/g, ' ');
  const laptop = /laptop|mobile|max-?q|notebook/.test(n);
  let m;
  // Cartes professionnelles (avant les GeForce : « RTX 4000 Ada » n'est pas une RTX 40).
  if ((m = n.match(/\brtx a(\d{4})\b/))) return { line: 'pro', key: `rtx a${m[1]}` };
  if ((m = n.match(/\brtx (\d{4}) ada\b/))) return { line: 'pro', key: `rtx ${m[1]} ada` };
  if ((m = n.match(/\bquadro (rtx )?([pktm]?\d{3,4})\b/))) return { line: 'pro', key: `quadro ${m[1] || ''}${m[2]}` };
  if ((m = n.match(/\bnvidia t(400|600|1000)\b/))) return { line: 'pro', key: `nvidia t${m[1]}` };
  if ((m = n.match(/\bradeon pro (w\d{4})\b/))) return { line: 'pro', key: `radeon pro ${m[1]}` };
  if ((m = n.match(/\b(rtx|gtx|gt) ?(\d{3,4})(m)?( ?ti super| ?ti| ?super)?\b/))) {
    const num = m[2];
    const gen = num.length === 4 ? Number(num.slice(0, 2)) : Number(num[0]);
    const variant = (m[4] || '').replace(/\s+/g, ' ').trim();
    const lap = laptop || !!m[3];
    return { line: m[1] === 'gt' ? 'gtx' : m[1], num: Number(num), gen, variant, laptop: lap, key: `${m[1]} ${num}${variant ? ' ' + variant : ''}${lap ? ' laptop' : ''}` };
  }
  if ((m = n.match(/\btitan (rtx|xp|x)\b/))) return { line: 'titan', num: 0, gen: 0, variant: '', laptop, key: `titan ${m[1]}` };
  if ((m = n.match(/\bmx ?(\d{3})\b/))) return { line: 'mx', num: Number(m[1]), gen: Number(m[1][0]), variant: '', laptop: false, key: `mx${m[1]}` };
  if ((m = n.match(/\brx ?(\d{3})x\b/))) return { line: 'rx', num: Number(m[1]), gen: Number(m[1][0]) / 10, variant: '', laptop: true, key: `rx ${m[1]}x` };
  if ((m = n.match(/\brx ?(\d{3,4})(m|s)?( ?xtx| ?xt| ?gre)?( ?xtx| ?xt)?\b/))) {
    const num = m[1];
    const variant = ((m[3] || m[4] || '')).trim();
    return { line: 'rx', num: Number(num), gen: num.length === 4 ? Number(num[0]) : Number(num[0]) / 10, variant, laptop: !!m[2] || laptop, key: `rx ${num}${m[2] || ''}${variant ? ' ' + variant : ''}` };
  }
  if ((m = n.match(/\br9 (fury x|fury|nano)\b/))) return { line: 'r9', num: 0, gen: 0, variant: '', laptop: false, key: `r9 ${m[1]}` };
  if ((m = n.match(/\br([79]) ?(\d{3})(x)?\b/))) return { line: 'r' + m[1], num: Number(m[2]), gen: Number(m[2][0]), variant: m[3] || '', laptop: false, key: `r${m[1]} ${m[2]}${m[3] || ''}` };
  if (/radeon vii/.test(n)) return { line: 'rx', num: 0, gen: 0, variant: '', laptop: false, key: 'radeon vii' };
  if ((m = n.match(/\bradeon (\d{3,4})(m|s)\b/))) return { line: 'igpu', key: `radeon ${m[1]}${m[2]}` };
  if ((m = n.match(/\bvega ?(\d{1,2})\b/))) return { line: Number(m[1]) >= 56 ? 'rx' : 'igpu', key: `vega ${m[1]}` };
  if ((m = n.match(/\barc ([ab]\d{3}m?)\b/))) return { line: 'arc', num: Number(m[1].slice(1, 4)), gen: m[1][0] === 'b' ? 2 : 1, variant: '', laptop: /m$/.test(m[1]), key: `arc ${m[1]}` };
  if ((m = n.match(/\barc (1[34]0v)\b/))) return { line: 'igpu', key: `arc ${m[1]}` };
  if (/\barc graphics\b/.test(n)) return { line: 'igpu', key: 'arc graphics' };
  if (/iris xe/.test(n)) return { line: 'igpu', key: 'iris xe' };
  if ((m = n.match(/iris (plus|pro)/))) return { line: 'igpu', key: `iris ${m[1]}` };
  if ((m = n.match(/\buhd (?:graphics )?(\d{3})\b/))) return { line: 'igpu', key: `uhd ${m[1]}` };
  if (/uhd graphics/.test(n)) return { line: 'igpu', key: 'uhd graphics' };
  if (!/radeon/.test(n) && (m = n.match(/\bhd (?:graphics )?(\d{3,4})\b/))) return { line: 'igpu', key: `hd ${m[1]}` };
  if (/hd graphics/.test(n)) return { line: 'igpu', key: 'hd graphics' };
  if (/radeon.*graphics|amd radeon$/.test(n)) return { line: 'igpu', key: 'radeon graphics' };
  if (/intel.*graphics/.test(n)) return { line: 'igpu', key: 'uhd graphics' };
  return null;
}

// Graphique AMD générique (« AMD Radeon(TM) Graphics ») : le vrai modèle dépend du processeur.
function igpuFromCpu(cpuBrand) {
  const p = parseCpu(cpuBrand);
  if (!p) return null;
  if (p.vendor === 'amd') {
    if (p.family === 'ryzen-ai') return p.tier >= 9 ? 'radeon 890m' : 'radeon 880m';
    const n = p.num;
    if (/^g/.test(p.suffix) || segmentOf(p) !== 'desktop') {
      if (n >= 8700 || (n >= 7840 && n < 7900) || (n >= 8840 && n < 8900)) return 'radeon 780m';
      if (n >= 8600 || (n >= 7640 && n < 7700) || (n >= 8640 && n < 8700)) return 'radeon 760m';
      if (n >= 8500) return 'radeon 740m';
      if (n >= 6800 && n < 7000) return 'radeon 680m';
      if (n >= 6600 && n < 6800) return 'radeon 660m';
      if (n >= 4000) return p.tier >= 7 ? 'vega 8' : p.tier >= 5 ? 'vega 7' : 'vega 6';
      return p.tier >= 5 ? 'vega 11' : 'vega 8';
    }
    if (n >= 7000) return 'radeon 610m';
  }
  if (p.vendor === 'intel' && p.family === 'ultra' && p.gen === 2 && /v/.test(p.suffix)) return 'arc 140v';
  if (p.vendor === 'intel' && p.family === 'core' && segmentOf(p) === 'desktop' && p.gen >= 12) return p.tier >= 5 ? 'uhd 770' : 'uhd 730';
  return null;
}

const VARIANT_FACTOR = { 'ti super': 1.25, ti: 1.15, super: 1.1, xt: 1.12, xtx: 1.25, gre: 0.95 };

// Modèle d'estimation GPU : interpolation entre les modèles connus de la même gamme et génération.
function estimateGpu(p) {
  if (!p || !p.line || p.line === 'igpu' || !p.num) return null;
  const pool = [];
  for (const [key, raw] of GPUS) {
    const q = parseGpu(key);
    if (q && q.line === p.line && q.gen === p.gen && q.num && !q.variant && q.laptop === p.laptop) pool.push({ num: q.num, raw });
  }
  if (!pool.length) return null;
  pool.sort((a, b) => a.num - b.num);
  let raw;
  const lo = [...pool].reverse().find((x) => x.num <= p.num);
  const hi = pool.find((x) => x.num >= p.num);
  if (lo && hi && hi.num !== lo.num) raw = lo.raw + ((hi.raw - lo.raw) * (p.num - lo.num)) / (hi.num - lo.num);
  else raw = (lo || hi).raw * Math.pow(1.012, p.num - (lo || hi).num);
  raw *= VARIANT_FACTOR[p.variant] || 1;
  const genLabel = p.line === 'rx' ? t("Radeon RX {0}000", [p.gen]) : `${p.line.toUpperCase()} ${p.gen}${p.num >= 1000 ? '' : '00'}`;
  return { raw: Math.round(raw * 10) / 10, estimated: true, source: t("estimé d'après les {0}{1}", [genLabel, p.laptop ? t(" portables") : '']) };
}

// isLaptop : sur un portable, Windows écrit souvent « RTX 3060 » sans « Laptop » ; on prend la version portable.
// Mémoire vidéo (Go) des cartes dédiées : affichée dans la base et utilisée pour la limite de VRAM des jeux.
const GPU_VRAM_DATA = `
rtx 5090:32|rtx 5080:16|rtx 5070 ti:16|rtx 5070:12|rtx 5060 ti:16|rtx 5060:8|rtx 5050:8
rtx 4090:24|rtx 4080 super:16|rtx 4080:16|rtx 4070 ti super:16|rtx 4070 ti:12|rtx 4070 super:12|rtx 4070:12|rtx 4060 ti:8|rtx 4060:8|rtx 4050:6
rtx 3090 ti:24|rtx 3090:24|rtx 3080 ti:12|rtx 3080:10|rtx 3070 ti:8|rtx 3070:8|rtx 3060 ti:8|rtx 3060:12|rtx 3050:8
rtx 2080 ti:11|rtx 2080 super:8|rtx 2080:8|rtx 2070 super:8|rtx 2070:8|rtx 2060 super:8|rtx 2060:6|titan rtx:24|rtx 2050:4
gtx 1660 ti:6|gtx 1660 super:6|gtx 1660:6|gtx 1650 super:4|gtx 1650 ti:4|gtx 1650:4|gtx 1630:4
gtx 1080 ti:11|gtx 1080:8|gtx 1070 ti:8|gtx 1070:8|gtx 1060:6|gtx 1050 ti:4|gtx 1050:2|gt 1030:2|gt 1010:2|titan xp:12
gtx 980 ti:6|gtx 980:4|gtx 970:4|gtx 960:2|gtx 950:2|gtx 750 ti:2|gtx 750:1|gtx 780 ti:3|gtx 780:3|gtx 770:2|gtx 760:2|gt 730:2|gt 710:2
gtx 680:2|gtx 670:2|gtx 660 ti:2|gtx 660:2|gtx 650 ti:1|gt 640:2
rtx 5090 laptop:24|rtx 5080 laptop:16|rtx 5070 ti laptop:12|rtx 5070 laptop:8|rtx 5060 laptop:8
rtx 4090 laptop:16|rtx 4080 laptop:12|rtx 4070 laptop:8|rtx 4060 laptop:8|rtx 4050 laptop:6
rtx 3080 ti laptop:16|rtx 3080 laptop:8|rtx 3070 ti laptop:8|rtx 3070 laptop:8|rtx 3060 laptop:6|rtx 3050 ti laptop:4|rtx 3050 laptop:4
rtx 2080 laptop:8|rtx 2070 laptop:8|rtx 2060 laptop:6|rtx 2050 laptop:4|gtx 1660 ti laptop:6|gtx 1650 ti laptop:4|gtx 1650 laptop:4|gtx 1050 ti laptop:4|gtx 1050 laptop:2
gtx 1080 laptop:8|gtx 1070 laptop:8|gtx 1060 laptop:6|gtx 980 laptop:4|gtx 970 laptop:3|gtx 965 laptop:2|gtx 960 laptop:2|gtx 950 laptop:2|gtx 860 laptop:2|gtx 850 laptop:2
mx550:2|mx450:2|mx350:2|mx250:2|mx150:2|mx130:2
rx 9070 xt:16|rx 9070 gre:12|rx 9070:16|rx 9060 xt:16|rx 9060:8
rx 7900 xtx:24|rx 7900 xt:20|rx 7900 gre:16|rx 7800 xt:16|rx 7700 xt:12|rx 7700:16|rx 7600 xt:16|rx 7600:8
rx 6950 xt:16|rx 6900 xt:16|rx 6800 xt:16|rx 6800:16|rx 6750 xt:12|rx 6750 gre:10|rx 6700 xt:12|rx 6700:10|rx 6650 xt:8|rx 6600 xt:8|rx 6600:8|rx 6500 xt:4|rx 6400:4
rx 5700 xt:8|rx 5700:8|rx 5600 xt:6|rx 5600:6|rx 5500 xt:8|radeon vii:16|vega 64:8|vega 56:8
rx 590:8|rx 580:8|rx 570:4|rx 480:8|rx 470:4|rx 560:4|rx 550:2|rx 460:4
r9 fury x:4|r9 fury:4|r9 nano:4|r9 390x:8|r9 390:8|r9 290x:4|r9 290:4|r9 380x:4|r9 380:4|r9 280x:3|r7 370:2|r7 260x:2
rx 7900m:16|rx 7600m xt:8|rx 7600s:8|rx 6850m xt:12|rx 6800m:12|rx 6700m:10|rx 6600m:8|rx 6500m:4|rx 5600m:6|rx 5500m:4
gt 740:2|gt 630:2|gt 610:1|gtx 745:4|gtx 690:4|mx570:2|mx330:2|mx230:2|mx110:2|rtx 2080 super laptop:8|rtx 2070 super laptop:8
rtx a6000:48|rtx a5000:24|rtx a4500:20|rtx a4000:16|rtx a2000:6|rtx 6000 ada:48|rtx 5000 ada:32|rtx 4500 ada:24|rtx 4000 ada:20|rtx 2000 ada:16
quadro rtx 8000:48|quadro rtx 6000:24|quadro rtx 5000:16|quadro rtx 4000:8|quadro p6000:24|quadro p5000:16|quadro p4000:8|quadro p2200:5|quadro p2000:5|quadro p1000:4|quadro p620:2|quadro t2000:4|quadro t1000:4|nvidia t1000:4|nvidia t600:4|nvidia t400:2|quadro k2200:4
rx 7650 gre:8|rx 6300:2|rx 5300:3|rx 640:2|rx 560x:4|rx 550x:2|rx 580x:8|rx 570x:4|r7 250:2|r7 240:2|r9 270x:2|r9 270:2|r9 285:2|rx 7600m:8|rx 6650m:8|rx 6550m:4
radeon pro w7900:48|radeon pro w7800:32|radeon pro w7700:16|radeon pro w7600:8|radeon pro w6800:32|radeon pro w6600:8|radeon pro w5700:8|arc a550m:8|arc a530m:8
arc b580:12|arc b570:10|arc a770:16|arc a750:8|arc a580:8|arc a380:6|arc a310:4|arc a770m:16|arc a730m:12|arc a370m:4
`;
const GPU_VRAM = new Map();
for (const item of GPU_VRAM_DATA.split(/[|\n]/).map((x) => x.trim()).filter(Boolean)) {
  const [k, v] = item.split(':');
  GPU_VRAM.set(k.trim(), Number(v));
}

// Estimation d'après la seule quantité de VRAM (carte inconnue) : la VRAM suit la gamme de la carte.
function gpuFromVram(vramGb, p = {}) {
  if (!vramGb || vramGb <= 0) return null;
  const pts = [[1, 1.5], [2, 3], [3, 5], [4, 7], [6, 12], [8, 20], [10, 27], [12, 32], [16, 42], [20, 50], [24, 60], [32, 80], [48, 95]];
  let raw = pts[0][1];
  for (let i = 0; i < pts.length; i++) {
    if (vramGb <= pts[i][0]) { const [x0, y0] = pts[Math.max(0, i - 1)]; const [x1, y1] = pts[i]; raw = x1 === x0 ? y1 : y0 + ((y1 - y0) * (vramGb - x0)) / (x1 - x0); break; }
    raw = pts[i][1];
  }
  if (p.laptop) raw *= 0.7;
  if (p.line === 'mx' || /^gt /.test(p.key || '')) raw *= 0.4;
  return { raw: Math.round(raw * 10) / 10, estimated: true, source: t("estimé d'après sa VRAM ({0} Go)", [Math.round(vramGb * 10) / 10]) };
}

// vramGb : VRAM connue (détectée ou saisie), utilisée si le modèle est inconnu.
function lookupGpu(name, cpuBrand, isLaptop = false, vramGb = null) {
  let p = parseGpu(name);
  if (p && isLaptop && !p.laptop && ['rtx', 'gtx'].includes(p.line) && GPUS.has(p.key + t(" laptop"))) {
    p = { ...p, laptop: true, key: p.key + ' laptop' };
  } else if (p && isLaptop && !p.laptop && ['rtx', 'gtx', 'rx'].includes(p.line) && p.num) {
    p = { ...p, laptop: true, key: p.line === 'rx' ? p.key.replace(/^(rx \d+)/, '$1m') : p.key + ' laptop' };
  }
  if (p && p.key === 'radeon graphics' && cpuBrand) {
    const real = igpuFromCpu(cpuBrand);
    if (real) p = { line: 'igpu', key: real };
  }
  if (p && p.key === 'uhd graphics' && cpuBrand) {
    const real = igpuFromCpu(cpuBrand);
    if (real && GPUS.has(real)) p = { line: 'igpu', key: real };
  }
  if (p) {
    if (GPUS.has(p.key)) return { raw: GPUS.get(p.key), estimated: false, source: 'base' };
    // Version portable absente : version de bureau × 0,7.
    if (p.laptop) {
      const desk = p.key.replace(/ laptop$/, '').replace(/^(rx \d{4})(m|s)/, '$1');
      if (GPUS.has(desk)) return { raw: Math.round(GPUS.get(desk) * 0.7 * 10) / 10, estimated: false, source: t("base (version portable)") };
    }
    const est = estimateGpu(p);
    if (est) return est;
  }
  const byVram = gpuFromVram(vramGb, p || {});
  if (byVram) return byVram;
  return { raw: 5, estimated: true, unknown: true, source: t("modèle inconnu") };
}

// ---------------------------------------------------------------------------
// SSD : génération PCIe d'après le modèle (quand Windows dit seulement « SSD » / « NVMe »).
// ---------------------------------------------------------------------------
const SSD_MODELS = [
  [/t70[05]|990 evo plus|sn8100|e2[67]|crucial t500|kingston fury renegade g5/i, 100, 'NVMe PCIe 5.0'],
  [/sn850|990 pro|980 pro|990 evo|kc3000|fury renegade|firecuda 530|sn770|sn580|p5 plus|p3 plus|mp600|nm790|pm9a1|mzvl2|sn810|sn740|nv3|t500/i, 95, 'NVMe PCIe 4.0'],
  [/nv2|nv1|p3\b|p2\b|a2000|sn5[0-7]0|sn520|sn530|970|960|sx8200|sx6000|mp510|pm981|pm991|mzvlb|bc[57]11|intel 660p|665p/i, 86, 'NVMe PCIe 3.0'],
];
function lookupSsd(name) {
  for (const [re, score, label] of SSD_MODELS) if (re.test(String(name || ''))) return { score, label };
  return null;
}

const getCpuEntries = () => { if (!CPU_ENTRIES) CPU_ENTRIES = cpuEntries(); return CPU_ENTRIES; };

module.exports = {
  lookupCpu, lookupGpu, lookupSsd, parseCpu, parseGpu, igpuFromCpu, gpuFromVram, segmentOf, getCpuEntries,
  CPUS, GPUS, GPU_VRAM, prodFromMulti,
};
