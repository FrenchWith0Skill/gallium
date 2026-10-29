'use strict';
const { t } = require('./i18n');
// Bases de données embarquées : GPU, CPU, jeux.
// Les valeurs sont des ESTIMATIONS de performance relative, pas des mesures.

// ---------------------------------------------------------------------------
// Processeurs et cartes graphiques : base de connaissances + modèle d'estimation (lib/hwdb.js).
// ---------------------------------------------------------------------------
const { lookupCpu, lookupGpu } = require('./hwdb');

// Carte graphique → { raw (RTX 5090 = 100), estimated, source }. cpuBrand sert pour les graphiques intégrés génériques.
const matchGpu = (name, cpuBrand, isLaptop, vramGb) => lookupGpu(name, cpuBrand, isLaptop, vramGb);

// Processeur → { gaming, prod (0-100), estimated, source }. cpu.cores (threads) affine l'estimation.
const matchCpu = (brand, cpu = {}) => lookupCpu(brand, cpu);

// ---------------------------------------------------------------------------
// Résolutions / niveaux de qualité (multiplicateurs de FPS côté GPU et VRAM).
// ---------------------------------------------------------------------------
const RES = {
  '1080': { label: '1080p', fps: 1, vram: 1 },
  '1440': { label: '1440p', fps: 0.65, vram: 1.25 },
  '2160': { label: '4K', fps: 0.36, vram: 1.7 },
};
const QUALITY = {
  low: { label: t("Bas"), fps: 1.7, vram: 0.6 },
  medium: { label: t("Moyen"), fps: 1.3, vram: 0.8 },
  high: { label: t("Élevé"), fps: 1, vram: 1 },
  ultra: { label: t("Ultra"), fps: 0.75, vram: 1.25 },
};

// ---------------------------------------------------------------------------
// Jeux. gpu60 = score GPU brut requis pour ~60 FPS en 1080p Élevé ; cpu60 = score CPU jeu requis ;
// cap = plafond de FPS du moteur ; ram/vram en Go.
// appId : identifiant Steam ; match : fragment de nom pour retrouver le jeu ;
// paths : dossiers à tester pour les jeux hors Steam (variables %XXX% acceptées).
// ---------------------------------------------------------------------------
const GAMES = [
  { id: 'valorant', name: 'Valorant', kind: 'esport', popular: true, gpu60: 1.0, cpu60: 14, cap: 600, ram: 8, vram: 2,
    match: 'valorant', paths: ['C:\\Riot Games\\VALORANT'],
    tips: [t("Active « Rendu multithread » dans les options graphiques."), t("Plafonne les FPS un peu au-dessus de la fréquence de ton écran pour limiter chaleur et bruit.")] },
  { id: 'cs2', name: 'Counter-Strike 2', kind: 'esport', popular: true, appId: 730, gpu60: 4, cpu60: 12, cap: 600, ram: 8, vram: 3,
    match: 'counter-strike',
    tips: [t("Les ombres et la qualité des modèles/textures sont les réglages les plus coûteux."), t("Désactive la synchronisation verticale et fixe un plafond de FPS stable.")] },
  { id: 'lol', name: 'League of Legends', kind: 'esport', gpu60: 0.7, cpu60: 10, cap: 500, ram: 4, vram: 1,
    match: 'league of legends', paths: ['C:\\Riot Games\\League of Legends'],
    tips: [t("Le jeu est léger : un PC modeste suffit pour des FPS très élevés.")] },
  { id: 'dota2', name: 'Dota 2', kind: 'esport', appId: 570, gpu60: 2.5, cpu60: 14, cap: 400, ram: 4, vram: 2,
    match: 'dota 2', tips: [t("Utilise l'API Vulkan si tu as des saccades avec DirectX.")] },
  { id: 'fortnite', name: 'Fortnite', kind: 'esport', popular: true, gpu60: 8, cpu60: 25, cap: 360, ram: 16, vram: 4,
    match: 'fortnite', epic: 'Fortnite',
    tips: [t("Le mode Performances est idéal si tu es limité par le processeur."), t("Nanite et Lumen sont très gourmands : passe-les en Moyen ou désactive-les sous 60 FPS.")] },
  { id: 'apex', name: 'Apex Legends', kind: 'esport', appId: 1172470, gpu60: 9, cpu60: 28, cap: 300, ram: 8, vram: 3,
    match: 'apex legends', tips: [t("Baisse la qualité des ombres et la distance des modèles pour gagner le plus de FPS.")] },
  { id: 'ow2', name: 'Overwatch 2', kind: 'esport', appId: 2357570, gpu60: 6, cpu60: 18, cap: 600, ram: 8, vram: 3,
    match: 'overwatch', tips: [t("Active « Réduire la mise en mémoire tampon » pour une latence plus faible.")] },
  { id: 'rivals', name: 'Marvel Rivals', kind: 'esport', appId: 2767030, gpu60: 14, cpu60: 30, cap: 300, ram: 16, vram: 4,
    match: 'marvel rivals', tips: [t("Les effets visuels et les ombres pèsent lourd en combat : baisse-les en priorité.")] },
  { id: 'rocketleague', name: 'Rocket League', kind: 'esport', appId: 252950, gpu60: 3, cpu60: 15, cap: 300, ram: 8, vram: 2,
    match: 'rocket league', tips: [t("Désactive le flou de mouvement et réduis les effets pour des FPS plus stables.")] },
  { id: 'r6', name: 'Rainbow Six Siege', kind: 'esport', appId: 359550, gpu60: 5, cpu60: 20, cap: 500, ram: 8, vram: 3,
    match: 'rainbow six', tips: [t("Utilise l'API Vulkan si ton GPU la gère bien.")] },
  { id: 'warzone', name: 'Call of Duty: Warzone', kind: 'esport', popular: true, appId: 1938090, gpu60: 20, cpu60: 40, cap: 240, ram: 16, vram: 6,
    match: 'call of duty', tips: [t("Réduis la qualité des textures « à la demande » et des ombres."), t("Active la mise en cache des shaders au premier lancement.")] },
  { id: 'bf6', name: 'Battlefield 6', kind: 'esport', appId: 2807960, gpu60: 22, cpu60: 42, cap: 240, ram: 16, vram: 6,
    match: 'battlefield 6', tips: [t("Les destructions et la densité d'effets sollicitent beaucoup le CPU en grosse partie.")] },
  { id: 'pubg', name: 'PUBG: Battlegrounds', kind: 'esport', appId: 578080, gpu60: 11, cpu60: 38, cap: 300, ram: 16, vram: 4,
    match: 'pubg', tips: [t("Baisse la distance d'affichage et le feuillage : très efficaces pour les FPS.")] },
  { id: 'gta5', name: 'Grand Theft Auto V', kind: 'aaa', popular: true, appId: 271590, gpu60: 6, cpu60: 24, cap: 180, ram: 8, vram: 3,
    match: 'grand theft auto v', tips: [t("Baisse l'échelle de distance et la densité de population si le CPU limite.")] },
  { id: 'minecraft', name: 'Minecraft (Java, sans shaders)', kind: 'aaa', popular: true, gpu60: 2, cpu60: 22, cap: 400, ram: 8, vram: 2,
    match: 'minecraft', paths: ['%APPDATA%\\.minecraft'],
    tips: [t("Alloue 4 à 6 Go de RAM au jeu et installe Sodium/Iris pour de bien meilleurs FPS."), t("Les shaders changent complètement la donne : compte 3 à 5 fois moins de FPS.")] },
  { id: 'witcher3', name: 'The Witcher 3 (Next-Gen)', kind: 'aaa', appId: 292030, gpu60: 15, cpu60: 32, cap: 200, ram: 12, vram: 4,
    match: 'witcher 3', tips: [t("Désactive le ray tracing si ton GPU n'est pas de la série RTX 30 ou plus récente.")] },
  { id: 'cyberpunk', name: 'Cyberpunk 2077', kind: 'aaa', popular: true, appId: 1091500, gpu60: 20, cpu60: 38, cap: 200, ram: 12, vram: 6,
    match: 'cyberpunk',
    tips: [t("Désactive le ray tracing sous une RTX 4070 / RX 9070."), t("Baisse la densité de foule et la qualité des réflexions de l'espace écran.")] },
  { id: 'rdr2', name: 'Red Dead Redemption 2', kind: 'aaa', appId: 1174180, gpu60: 21, cpu60: 35, cap: 200, ram: 12, vram: 6,
    match: 'red dead redemption 2', tips: [t("Baisse les ombres volumétriques, l'eau et la qualité des textures de terrain.")] },
  { id: 'bg3', name: 'Baldur\'s Gate 3', kind: 'aaa', appId: 1086940, gpu60: 13, cpu60: 38, cap: 200, ram: 8, vram: 4,
    match: 'baldur', tips: [t("L'acte 3 (Baldur's Gate) est très gourmand en processeur.")] },
  { id: 'eldenring', name: 'Elden Ring', kind: 'aaa', popular: true, appId: 1245620, gpu60: 12, cpu60: 28, cap: 60, ram: 12, vram: 4,
    match: 'elden ring', tips: [t("Le jeu est plafonné à 60 FPS : inutile de viser plus."), t("Désactive le ray tracing, peu optimisé.")] },
  { id: 'hogwarts', name: 'Hogwarts Legacy', kind: 'aaa', appId: 990080, gpu60: 24, cpu60: 42, cap: 200, ram: 16, vram: 8,
    match: 'hogwarts legacy', tips: [t("Les ombres et le ray tracing sont les plus coûteux. Les saccades dans le château viennent souvent du CPU.")] },
  { id: 'starfield', name: 'Starfield', kind: 'aaa', appId: 1716740, gpu60: 28, cpu60: 50, cap: 200, ram: 16, vram: 8,
    match: 'starfield', tips: [t("Très gourmand en CPU dans les grandes villes : baisse l'échelle de rendu avant le reste.")] },
  { id: 'wukong', name: 'Black Myth: Wukong', kind: 'aaa', appId: 2358720, gpu60: 30, cpu60: 40, cap: 200, ram: 16, vram: 8,
    match: 'wukong', tips: [t("Passe en 1080p avec upscaling : le jeu est très lourd en natif.")] },
  { id: 'helldivers2', name: 'Helldivers 2', kind: 'aaa', appId: 553850, gpu60: 18, cpu60: 40, cap: 200, ram: 16, vram: 6,
    match: 'helldivers', tips: [t("Baisse les ombres et la qualité des effets lors des grosses batailles.")] },
  { id: 'palworld', name: 'Palworld', kind: 'aaa', appId: 1623730, gpu60: 12, cpu60: 40, cap: 200, ram: 16, vram: 4,
    match: 'palworld', tips: [t("Les grandes bases avec beaucoup de Pals pèsent surtout sur le CPU et la RAM.")] },
  { id: 'mhwilds', name: 'Monster Hunter Wilds', kind: 'aaa', appId: 2246340, gpu60: 34, cpu60: 52, cap: 200, ram: 16, vram: 8,
    match: 'monster hunter wilds', tips: [t("Très exigeant : utilise l'upscaling et baisse la qualité des textures si la VRAM sature.")] },
  { id: 'fh5', name: 'Forza Horizon 5', kind: 'aaa', appId: 1551360, gpu60: 13, cpu60: 30, cap: 200, ram: 16, vram: 6,
    match: 'forza horizon 5', tips: [t("Vérifie que les textures tiennent dans ta VRAM : sinon, passe-les en Moyen.")] },
  { id: 'acshadows', name: 'Assassin\'s Creed Shadows', kind: 'aaa', appId: 3159330, gpu60: 30, cpu60: 45, cap: 200, ram: 16, vram: 8,
    match: 'assassin\'s creed shadows', tips: [t("Le ray tracing est très lourd : garde-le désactivé sauf avec un GPU haut de gamme.")] },
  { id: 'alanwake2', name: 'Alan Wake 2', kind: 'aaa', gpu60: 32, cpu60: 38, cap: 200, ram: 16, vram: 8,
    match: 'alan wake', epic: 'Alan Wake', tips: [t("Utilise l'upscaling : le jeu est très exigeant pour le GPU.")] },
  { id: 'kcd2', name: 'Kingdom Come: Deliverance II', kind: 'aaa', appId: 1771300, gpu60: 22, cpu60: 38, cap: 200, ram: 16, vram: 6,
    match: 'kingdom come', tips: [t("La végétation et la distance de vue sont les plus coûteuses en ville comme en forêt.")] },
  { id: 'doomtda', name: 'DOOM: The Dark Ages', kind: 'aaa', appId: 3017860, gpu60: 26, cpu60: 38, cap: 200, ram: 16, vram: 8,
    match: 'doom: the dark ages', tips: [t("Exige un GPU compatible ray tracing : vérifie que ton pilote est à jour.")] },
];

module.exports = { GAMES, RES, QUALITY, matchGpu, matchCpu };
