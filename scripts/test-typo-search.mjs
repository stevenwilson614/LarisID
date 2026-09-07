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
    if (w.includes(token) || token.includes(w)) return true;
    if (maxEd > 0 && w.length >= 4) {
      const cap = Math.min(maxEd, _rbMaxEdits(w.length));
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

const failed = cases.filter(c => !c.ok);
for (const c of cases) {
  console.log(`${c.ok ? 'ok' : 'FAIL'}: ${c.name}`);
}
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\n${cases.length} passed`);
