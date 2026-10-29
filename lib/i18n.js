'use strict';
// Traductions. Le texte source est le français écrit dans le code ; chaque langue a un fichier
// locales/<code>.json qui associe ce texte à sa traduction. Un texte absent reste en français.
// Les variables s'écrivent {0}, {1}… (ou {nom}) dans le texte source.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'locales');
let lang = 'fr';
let dict = {};

function setLang(code) {
  lang = /^[a-z]{2}(-[a-z]{2})?$/i.test(String(code || '')) ? String(code) : 'fr';
  dict = {};
  if (lang !== 'fr') {
    try { dict = JSON.parse(fs.readFileSync(path.join(DIR, `${lang}.json`), 'utf8')); } catch { dict = {}; }
  }
  return lang;
}

function format(s, params) {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m));
}

const t = (src, params) => format(dict[src] || src, params);

module.exports = { t, setLang, getLang: () => lang, getDict: () => dict, format };
