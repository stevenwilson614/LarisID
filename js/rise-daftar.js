/* LARIS RISE — application form (/rise/daftar/).
 *
 * Plain IIFE, no framework, matching js/rise.js. Submits through the
 * rise_submit_application() RPC rather than a table insert: the applications
 * table has RLS on with no policies, so that function is the only surface an
 * anonymous visitor can reach.
 *
 * Validation runs twice on purpose — here for a friendly inline message, and
 * again in Postgres because the client is not a trust boundary. */
(function () {
  'use strict';

  var SUPA_URL = 'https://api.larisid.com';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
  var COHORT = 'batch-1';

  var form = document.getElementById('rzf-form');
  var done = document.getElementById('rzf-done');
  var btn = document.getElementById('rzf-submit');
  var formErr = document.getElementById('rzf-formerr');
  if (!form) return;

  /* ── Mobile nav sheet (same behaviour as rise.js initNav) ───────────────── */
  (function initNav() {
    var navbtn = document.getElementById('rz-navbtn');
    var sheet = document.getElementById('rz-sheet');
    if (!navbtn || !sheet) return;
    function setOpen(open) {
      sheet.hidden = !open;
      navbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      navbtn.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    }
    navbtn.addEventListener('click', function () {
      setOpen(sheet.hidden);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sheet.hidden) setOpen(false);
    });
  })();

  /* ── Field helpers ─────────────────────────────────────────────────────── */

  function fieldEl(name) {
    return form.querySelector('[data-field="' + name + '"]');
  }
  function setBad(name, on) {
    var el = fieldEl(name);
    if (el) el.classList.toggle('is-bad', !!on);
  }
  function clearAll() {
    var bad = form.querySelectorAll('.rzf-field.is-bad');
    for (var i = 0; i < bad.length; i++) bad[i].classList.remove('is-bad');
    formErr.classList.remove('is-on');
    formErr.textContent = '';
  }
  function val(name) {
    var el = form.elements[name];
    return el && typeof el.value === 'string' ? el.value.trim() : '';
  }
  function radio(name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  /* Indonesian numbers arrive as 08…, 8…, +628… or 628…. Postgres normalises
   * for real; this only decides whether the field looks plausible. */
  function waDigits(raw) {
    var d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.indexOf('0') === 0) d = '62' + d.slice(1);
    else if (d.indexOf('62') !== 0 && d.indexOf('8') === 0) d = '62' + d;
    return d;
  }

  /* ── Validation ────────────────────────────────────────────────────────── */

  function validate() {
    clearAll();
    var bad = [];

    if (!val('nama')) bad.push('nama');

    var wa = waDigits(val('whatsapp'));
    if (wa.length < 10 || wa.length > 15) bad.push('whatsapp');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val('email'))) bad.push('email');

    if (!radio('perangkat')) bad.push('perangkat');
    if (!radio('pengalaman_jualan')) bad.push('pengalaman_jualan');
    if (!val('alasan')) bad.push('alasan');
    if (!val('target_3bulan')) bad.push('target_3bulan');
    if (!radio('gate_komitmen')) bad.push('gate_komitmen');
    if (!radio('gate_pembukaan')) bad.push('gate_pembukaan');
    if (!radio('gate_paham_seleksi')) bad.push('gate_paham_seleksi');

    for (var i = 0; i < bad.length; i++) setBad(bad[i], true);

    if (bad.length) {
      formErr.textContent = 'Ada ' + bad.length + ' pertanyaan yang belum lengkap. Cek bagian yang ditandai merah.';
      formErr.classList.add('is-on');
      var first = fieldEl(bad[0]);
      if (first) {
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var focusable = first.querySelector('input, textarea, select');
        if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 320);
      }
    }
    return bad.length === 0;
  }

  /* Clear a field's error as soon as the visitor fixes it — leaving red marks
   * on answered questions makes the form feel broken. */
  form.addEventListener('input', function (e) {
    var f = e.target.closest('.rzf-field');
    if (f) f.classList.remove('is-bad');
  });
  form.addEventListener('change', function (e) {
    var f = e.target.closest('.rzf-field');
    if (f) f.classList.remove('is-bad');
  });

  /* ── Submit ────────────────────────────────────────────────────────────── */

  var sending = false;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    if (!validate()) return;

    if (!window.supabase || !window.supabase.createClient) {
      formErr.textContent = 'Koneksi belum siap. Coba muat ulang halaman ini.';
      formErr.classList.add('is-on');
      return;
    }

    sending = true;
    btn.disabled = true;
    btn.textContent = 'Mengirim…';

    var payload = {
      cohort: COHORT,
      nama: val('nama'),
      whatsapp: val('whatsapp'),
      email: val('email'),
      kampus: val('kampus'),
      jurusan: val('jurusan'),
      semester: val('semester'),
      kota: val('kota'),
      perangkat: radio('perangkat'),
      pengalaman_jualan: radio('pengalaman_jualan'),
      ide_produk: val('ide_produk'),
      hari_tersedia: [],
      jam_per_minggu: '',
      alasan: val('alasan'),
      target_3bulan: val('target_3bulan'),
      gate_komitmen: radio('gate_komitmen') === 'true',
      gate_pembukaan: radio('gate_pembukaan') === 'true',
      gate_paham_seleksi: radio('gate_paham_seleksi') === 'true'
    };

    var sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: false, detectSessionInUrl: false }
    });

    sb.rpc('rise_submit_application', { payload: payload }).then(function (res) {
      if (res.error || !res.data || res.data.ok !== true) {
        throw new Error((res.data && res.data.error) || (res.error && res.error.message) || 'Gagal mengirim.');
      }
      if (window.gtag) {
        try { gtag('event', 'rise_apply_submit', { cohort: COHORT }); } catch (_) {}
      }
      form.hidden = true;
      done.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (err) {
      sending = false;
      btn.disabled = false;
      btn.textContent = 'Kirim pendaftaran';
      formErr.textContent = (err && err.message)
        ? err.message
        : 'Gagal mengirim. Cek koneksi internet kamu lalu coba lagi.';
      formErr.classList.add('is-on');
      formErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
})();
