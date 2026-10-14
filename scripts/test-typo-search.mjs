#!/usr/bin/env node
/**
 * Unit checks for typo-tolerant search helpers (mirrors js/gpt-app.js).
 * Run: node scripts/test-typo-search.mjs
 */
function _rbNormStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^\w\s]/g, ' ');
}
function _rbLevenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j] + 1, prev + 1, row[j - 1] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}
function _rbMaxEdits(len) {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}
function _rbTokenMatch(token, hay) {
  if (!token) return true;
  if (hay.includes(token)) return true;
  const words = hay.split(/\s+/).filter(w => w.length >= 3);
  const maxEd = _rbMaxEdits(token.length);
  return words.some(w => {
    if (w.includes(token)) return true;
    if (maxEd > 0 && w.length >= 4) {
      const cap = Math.min(maxEd, _rbMaxEdits(w.length));
      if (Math.abs(w.length - token.length) > cap) return false;
      if (_rbLevenshtein(token, w) <= cap) return true;
    }
    return false;
  });
}
function _rbWordFuzzy(token, hay) {
  const tn = _rbNormStr(token);
  if (!tn || tn.length < 4) return false;
  const maxEd = _rbMaxEdits(tn.length);
  if (maxEd <= 0) return false;
  const words = _rbNormStr(hay).split(/\s+/).filter(w => w.length >= 3);
  return words.some(w => {
    if (w === tn) return true;
    if (Math.abs(w.length - tn.length) > maxEd) return false;
    if (w.length < 4) return false;
    return _rbLevenshtein(tn, w) <= Math.min(maxEd, _rbMaxEdits(w.length));
  });
}

const SEARCH_SYNONYMS = {
  elektrik: ['electric', 'listrik', 'elektrik'],
  electric: ['elektrik', 'listrik'],
  chopper: ['choper', 'food chopper', 'pencacah'],
  choper: ['chopper', 'food chopper', 'pencacah'],
};

function _rbTokenAlts(token) {
  const t = _rbNormStr(token);
  if (!t) return [];
  const out = new Set([t]);
  (SEARCH_SYNONYMS[t] || []).forEach(s => {
    String(s).toLowerCase().split(/[\s/-]+/).forEach(w => {
      const n = _rbNormStr(w);
      if (n.length >= 3) out.add(n);
    });
  });
  return [...out];
}

function fuzzyAgainstPool(raw, pool) {
  const qTokens = _rbNormStr(raw).split(/\s+/).filter(Boolean);
  const altSets = qTokens.map(_rbTokenAlts);
  const tokenHits = (alts, hay, original) => {
    if (_rbTokenMatch(original, hay)) return true;
    return alts.some(t => t !== original && (hay.includes(t) || hay.split(/\s+/).includes(t)));
  };
  return pool.filter(kw => {
    const hay = _rbNormStr(kw);
    return altSets.every((alts, i) => tokenHits(alts, hay, qTokens[i]));
  });
}

const cases = [];
function check(name, cond) {
  cases.push({ name, ok: !!cond });
}

check('choper↔chopper lev1', _rbLevenshtein('choper', 'chopper') === 1);
check('elektrik↔electric lev2', _rbLevenshtein('elektrik', 'electric') === 2);
check('word fuzzy choper', _rbWordFuzzy('choper', 'chopper electric'));
check('word fuzzy elektrik', _rbWordFuzzy('elektrik', 'chopper electric'));
check('tas does not fuzzy-match kertas', !_rbWordFuzzy('tas', 'kertas'));
check('AND choper elektrik → chopper electric',
  fuzzyAgainstPool('choper elektrik', ['chopper electric', 'sikat gigi elektrik', 'blender']).includes('chopper electric'));
check('AND rejects unrelated elektrik',
  !fuzzyAgainstPool('choper elektrik', ['sikat gigi elektrik']).includes('sikat gigi elektrik'));
check('galang→gelang still 1-edit', _rbWordFuzzy('galang', 'gelang manik'));
check('choper synonym does not pull copper',
  !fuzzyAgainstPool('choper', ['serum copper peptide', 'blender bumbu chopper']).includes('serum copper peptide'));
check('choper rarest hits blender bumbu chopper',
  fuzzyAgainstPool('choper', ['serum copper peptide', 'blender bumbu chopper']).includes('blender bumbu chopper'));
check('olive does not token-match oli', !_rbTokenMatch('olive', 'oli motor matic'));
check('wine does not token-match win', !_rbTokenMatch('wine', 'win something'));
check('choper still token-matches chopper', _rbTokenMatch('choper', 'chopper electric'));

// Sense gates — keep in sync with js/gpt-app.js (SEARCH_STOPWORDS + rowFailsSense).
const SEARCH_STOPWORDS = new Set(['and', 'or', 'dan', 'atau', 'the', 'a', 'an']);
const SENSE_MODIFIER_WORDS = new Set([
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'grey', 'gray', 'brown', 'purple', 'orange', 'navy', 'beige', 'gold', 'silver', 'maroon',
  'hitam', 'putih', 'merah', 'biru', 'hijau', 'kuning', 'abu', 'coklat', 'cokelat', 'ungu', 'emas', 'perak',
  'small', 'medium', 'large', 'size', 'ukuran', 'xl', 'xxl', 'xs',
]);
const SENSE_FASHION_QUERY_WORDS = new Set([
  'celana', 'dress', 'dresses', 'gaun', 'baju', 'pakaian', 'kaos', 'hijab', 'jaket', 'kemeja', 'rok', 'blouse',
  'sepatu', 'sandal', 'tas', 'fashion', 'pants', 'trousers', 'jogger', 'sweatpants',
]);
const SENSE_ATTR_PREFIXES = ['warna', 'motif', 'corak', 'pattern'];
const SENSE_DRINK_GEAR_RE = /\b(anggur|minuman|gelas|botol|bottle|glass|opener|corkscrew|stopper|decanter|dekant)\b/;
const SENSE_GARMENT_RE = /\b(celana|pants|trousers|jogger|sweatpants|kemeja|dress|gaun|hijab|blouse|rok|atasan)\b/;
function _searchTerms(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !SEARCH_STOPWORDS.has(w));
}
function queryIsBareWine(query) {
  const terms = _searchTerms(query);
  if (!terms.some(t => t === 'wine' || t === 'anggur')) return false;
  if (terms.some(t => SENSE_FASHION_QUERY_WORDS.has(t))) return false;
  return true;
}
function queryIsCookingOil(query) {
  const s = String(query || '').toLowerCase();
  return /\bolive\s+oil\b|\bcooking\s+oil\b|\bminyak\s+zaitun\b|\bminyak\s+olive\b/.test(s);
}
function planExtraRejected(query, extra) {
  const t = String(extra || '').toLowerCase().trim();
  if (!t) return false;
  if (queryIsCookingOil(query) && /\boli\b/.test(t) && !/\b(minyak|zaitun|olive)\b/.test(t)) return true;
  if (queryIsBareWine(query)) {
    if (/\b(warna|motif|corak)\s+wine\b/.test(t)) return true;
    if (SENSE_GARMENT_RE.test(t) && !SENSE_DRINK_GEAR_RE.test(t)) return true;
  }
  return false;
}
function _stripAttrValues(hay, terms) {
  let s = String(hay || '').toLowerCase();
  for (const t of terms) {
    const safe = String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const p of SENSE_ATTR_PREFIXES) s = s.replace(new RegExp(`\\b${p}\\s+${safe}\\b`, 'g'), ' ');
  }
  return s;
}
function isAttributeOnlyHit(query, hay) {
  const raw = String(query || '').toLowerCase();
  if (SENSE_ATTR_PREFIXES.some(p => new RegExp(`\\b${p}\\b`).test(raw))) return false;
  const terms = _searchTerms(raw);
  if (!terms.length) return false;
  if (terms.some(t => SENSE_FASHION_QUERY_WORDS.has(t))) return false;
  const text = String(hay || '').toLowerCase();
  if (terms.some(t => _stripAttrValues(text, terms).includes(t))) return false;
  return terms.some(t => text.includes(t));
}
function rowIsMotorOil(row) {
  const cat = `${row.category_canonical || ''} ${row.category || ''}`.toLowerCase();
  if (/motor\s*&\s*mobil|otomotif/.test(cat)) return true;
  const hay = `${row.product_name || ''} ${row.keyword || ''}`.toLowerCase();
  return /\boli\b/.test(hay) && !/\b(minyak|zaitun|olive)\b/.test(hay);
}
function rowFailsSense(query, row) {
  if (!row) return false;
  const hay = `${row.product_name || ''} ${row.keyword || ''}`.toLowerCase();
  if (isAttributeOnlyHit(query, hay)) return true;
  if (queryIsBareWine(query)) {
    const cat = `${row.category_canonical || ''} ${row.category || ''}`.toLowerCase();
    const fashionCat = /fashion|sepatu,\s*tas/.test(cat);
    const drink = SENSE_DRINK_GEAR_RE.test(hay);
    if ((fashionCat || SENSE_GARMENT_RE.test(hay)) && !drink) return true;
  }
  if (queryIsCookingOil(query) && rowIsMotorOil(row)) return true;
  return false;
}
function _clauseIsProductIntent(clause) {
  return _searchTerms(clause).some(t => !SENSE_MODIFIER_WORDS.has(t));
}
function _splitSearchIntents(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const parts = raw.split(/\s*(?:,|&|\bdan\b|\batau\b|\band\b|\bor\b)\s*/i)
    .map(s => s.trim())
    .filter(s => s.length >= 2)
    .filter(s => _searchTerms(s).length >= 1)
    .slice(0, 4);
  if (parts.length < 2) return [raw];
  if (!parts.every(_clauseIsProductIntent)) return [raw];
  return parts;
}

const pants = { keyword: 'celana jogger', category_canonical: 'Fashion', product_name: 'Celana Jogger Warna Wine' };
const glass = { keyword: 'gelas wine', category_canonical: 'Dapur', product_name: 'Gelas Wine Crystal' };
const anggur = { keyword: 'anggur merah', category_canonical: 'Makanan & Minuman', product_name: 'Anggur Merah Botol' };
const oli = { keyword: 'oli motor matic', category_canonical: 'Motor & Mobil', product_name: 'Oli MPX2 800 ml' };
const zaitun = { keyword: 'minyak zaitun', category_canonical: 'Makanan & Minuman', product_name: 'Minyak Zaitun Extra Virgin' };
const hair = { keyword: 'hair oil', category_canonical: 'Kecantikan & Perawatan', product_name: 'Hair Oil Argan' };
const tumbler = { keyword: 'tumbler', category_canonical: 'Dapur', product_name: 'Tumbler 500ml' };

check('wine drops celana warna wine', rowFailsSense('wine', pants));
check('wine keeps gelas wine', !rowFailsSense('wine', glass));
check('wine keeps anggur', !rowFailsSense('wine', anggur));
check('celana wine keeps the garment', !rowFailsSense('celana wine', pants));
check('olive oil drops oli motor', rowFailsSense('olive oil', oli));
check('olive oil keeps minyak zaitun', !rowFailsSense('olive oil', zaitun));
check('hair oil keeps hair oil', !rowFailsSense('hair oil', hair));
check('hair oil does not use the cooking-oil gate', !queryIsCookingOil('hair oil'));
check('tumbler is not dropped', !rowFailsSense('tumbler', tumbler));
check('oli extra rejected for olive oil', planExtraRejected('olive oil', 'oli motor'));
check('minyak zaitun extra kept', !planExtraRejected('olive oil', 'minyak zaitun'));
check('wine and olive oil splits', _splitSearchIntents('wine and olive oil').length === 2);
check('black and white dress stays one query', _splitSearchIntents('black and white dress').length === 1);
check('comma intents still split', _splitSearchIntents('kemeja denim, jeans pria').length === 2);

import fs from 'fs';
const appSrc = fs.readFileSync(new URL('../js/gpt-app.js', import.meta.url), 'utf8');
check('dresses synonym still includes gaun', /dresses:\s*\[[^\]]*'gaun'/.test(appSrc));
check('wine synonym includes anggur', /wine:\s*\[[^\]]*'anggur'/.test(appSrc));
check('olive oil phrase includes minyak zaitun', /'olive oil':\s*\[[^\]]*'minyak zaitun'/.test(appSrc));

const failed = cases.filter(c => !c.ok);
for (const c of cases) {
  console.log(`${c.ok ? 'ok' : 'FAIL'}: ${c.name}`);
}
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\n${cases.length} passed`);
