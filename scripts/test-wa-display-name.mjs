#!/usr/bin/env node
/**
 * Phone-as-name / WA identity helpers (mirrors js/gpt-app.js).
 * Run: node scripts/test-wa-display-name.mjs
 */

function looksLikePhoneName(s) {
  const raw = String(s || '').trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 15) return false;
  if (!/^(62|0?8)/.test(digits)) return false;
  return /^[0-9]+$/.test(raw.replace(/[\s+()-]/g, ''));
}

function isRealPersonName(s) {
  const raw = String(s || '').trim();
  if (raw.length < 2 || raw.length > 80) return false;
  if (looksLikePhoneName(raw)) return false;
  if (/@/.test(raw)) return false;
  return /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(raw);
}

function waFromEmail(email) {
  const m = String(email || '').match(/^(\+?62\d{8,13})@wa\.larisid\.com$/i);
  return m ? m[1] : '';
}

function displayName(u) {
  const raw = String(u?.display_name || '').trim();
  if (isRealPersonName(raw)) return raw;
  if (waFromEmail(u?.email) || looksLikePhoneName(raw)) return 'Pengguna WA';
  return raw || u?.email || 'Pengguna';
}

let failed = 0;
function ok(name, cond) {
  if (cond) console.log(`ok  ${name}`);
  else { failed++; console.error(`FAIL ${name}`); }
}

ok('phone digits are not a name', looksLikePhoneName('6282256315108'));
ok('+62 formatted phone is not a name', looksLikePhoneName('+6282256315108'));
ok('Siti is a name', isRealPersonName('Siti'));
ok('Budi Santoso is a name', isRealPersonName('Budi Santoso'));
ok('phone rejected as name', !isRealPersonName('6282256315108'));
ok('email rejected as name', !isRealPersonName('6282256315108@wa.larisid.com'));
ok('short A rejected', !isRealPersonName('A'));
ok('wa email yields number', waFromEmail('6282256315108@wa.larisid.com') === '6282256315108');
ok('gmail has no wa', waFromEmail('siti@gmail.com') === '');
ok('admin fallback for phone display_name', displayName({
  display_name: '6282256315108',
  email: '6282256315108@wa.larisid.com',
}) === 'Pengguna WA');
ok('real name kept', displayName({
  display_name: 'Siti Rahma',
  email: '6282256315108@wa.larisid.com',
}) === 'Siti Rahma');
ok('gmail without name keeps email', displayName({
  display_name: '',
  email: 'siti@gmail.com',
  wa_number: '+6282256315108',
}) === 'siti@gmail.com');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('all ok');
