/* LARIS RISE — reviewer board (/rise/admin/).
 *
 * Batch 1 is 40 applicants for 20 seats, reviewed by one person. That size is
 * the design constraint: everything loads at once, filtering is client-side,
 * and there is no pagination, search, or export.
 *
 * Auth: Google via supabase-js, with its own storageKey. That is not
 * cosmetic — js/gpt-app.js deletes every `sb-*-auth-token` localStorage key on
 * boot (it hand-rolls sessions against the self-hosted GoTrue), so a reviewer
 * who visited larisid.com would otherwise be silently signed out here.
 *
 * Every gate below is chrome. The real enforcement is rise_is_reviewer() inside
 * each security-definer RPC; a non-reviewer gets zero rows or `forbidden`. */
(function () {
  'use strict';

  var SUPA_URL = 'https://api.larisid.com';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
  var COHORT = 'batch-1';
  var KUOTA = 20;

  var STATUS = [
    { key: 'baru',             label: 'Baru' },
    { key: 'mungkin',          label: 'Mungkin' },
    { key: 'diterima',         label: 'Diterima' },
    { key: 'batch_berikutnya', label: 'Batch berikutnya' },
    { key: 'ditolak',          label: 'Ditolak' }
  ];

  var HARI_LABEL = {
    perangkat: 'Perangkat',
    pengalaman_jualan: 'Pengalaman jualan',
    jam_per_minggu: 'Jam per minggu'
  };

  var sb = null;
  var rows = [];
  var openId = null;
  var pendingNotify = null;
  var view = 'papan';

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function byId(id) {
    for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return rows[i];
    return null;
  }
  function statusLabel(key) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].key === key) return STATUS[i].label;
    return key;
  }
  function stars(n) {
    n = Number(n) || 0;
    return n ? new Array(n + 1).join('★') + new Array(6 - n).join('☆') : '';
  }
  function waLink(wa) {
    return 'https://wa.me/' + String(wa || '').replace(/[^0-9]/g, '');
  }
  function fmtWa(wa) {
    var d = String(wa || '');
    return d.indexOf('62') === 0 ? '+' + d : d;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('rza-toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ── Auth ──────────────────────────────────────────────────────────────── */

  function showGate(heading, body, showSignIn, showSignOut) {
    $('rza-app').hidden = true;
    $('rza-gate').hidden = false;
    $('rza-gate-h').textContent = heading;
    $('rza-gate-p').textContent = body;
    $('rza-signin').hidden = !showSignIn;
    $('rza-signout-gate').hidden = !showSignOut;
  }

  function signIn() {
    sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/rise/admin/' }
    });
  }

  function signOut() {
    sb.auth.signOut().then(function () { window.location.reload(); });
  }

  function boot() {
    if (!window.supabase || !window.supabase.createClient) {
      showGate('Koneksi gagal', 'Gagal memuat Supabase. Muat ulang halaman ini.', false, false);
      return;
    }
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'rise_admin_auth'   // see header note about gpt-app.js
      }
    });

    $('rza-signin').addEventListener('click', signIn);
    $('rza-signout').addEventListener('click', signOut);
    $('rza-signout-gate').addEventListener('click', signOut);

    sb.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (!session) {
        showGate('REVIEW PENDAFTAR',
          'Masuk dengan akun Google kamu untuk melihat pendaftar LaRise.', true, false);
        return;
      }
      var email = (session.user && session.user.email) || '';
      sb.rpc('rise_is_reviewer').then(function (r) {
        if (r.error || r.data !== true) {
          showGate('Akses ditolak',
            'Akun ' + email + ' belum terdaftar sebagai reviewer LaRise. Hubungi Steven untuk diberi akses.',
            false, true);
          return;
        }
        $('rza-gate').hidden = true;
        $('rza-app').hidden = false;
        $('rza-email').textContent = email;
        bindUi();
        load();
      });
    });
  }

  /* ── Data ──────────────────────────────────────────────────────────────── */

  function load() {
    $('rza-board').innerHTML = '<p class="rza-empty">Memuat…</p>';
    sb.rpc('rise_applications_list', { p_cohort: COHORT }).then(function (res) {
      if (res.error) {
        $('rza-board').innerHTML = '<p class="rza-empty">Gagal memuat pendaftar.</p>';
        return;
      }
      rows = res.data || [];
      render();
    });
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  function cardHtml(r) {
    var meta = [r.kota, r.jam_per_minggu ? r.jam_per_minggu + ' jam/mgg' : ''].filter(Boolean).join(' · ');
    var opts = STATUS.map(function (s) {
      return '<option value="' + s.key + '"' + (s.key === r.status ? ' selected' : '') + '>' +
        esc(s.label) + '</option>';
    }).join('');
    return '<article class="rza-card" data-open="' + esc(r.id) + '">' +
      '<div class="rza-card-n">' + esc(r.nama) + '</div>' +
      '<div class="rza-card-m">' + esc(meta || '—') + '</div>' +
      '<div class="rza-card-f">' +
        (r.skor ? '<span class="rza-stars">' + stars(r.skor) + '</span>' : '') +
        (r.catatan_internal ? '<span class="rza-hasnote">catatan</span>' : '') +
        (r.notified_at ? '<span class="rza-hasnote">sudah dikabari</span>' : '') +
      '</div>' +
      '<select class="rza-sel" data-status="' + esc(r.id) + '" aria-label="Ubah status ' + esc(r.nama) + '">' +
        opts +
      '</select>' +
    '</article>';
  }

  function renderBoard() {
    var host = $('rza-board');
    if (!rows.length) {
      host.innerHTML = '<p class="rza-empty">Belum ada pendaftar.</p>';
      return;
    }
    host.innerHTML = STATUS.map(function (s) {
      var mine = rows.filter(function (r) { return r.status === s.key; });
      // Only the accepted column shows a target — it is the one Afryan is
      // filling toward, and seeing "18 / 20" is the whole point of the board.
      var count = s.key === 'diterima'
        ? '<span class="rza-col-n' + (mine.length >= KUOTA ? ' is-full' : '') + '">' +
            mine.length + ' / ' + KUOTA + '</span>'
        : '<span class="rza-col-n">' + mine.length + '</span>';
      return '<div class="rza-col rza-col--' + s.key + '">' +
        '<div class="rza-col-h"><span>' + esc(s.label) + '</span>' + count + '</div>' +
        (mine.length ? mine.map(cardHtml).join('') : '<p class="rza-empty">Kosong</p>') +
      '</div>';
    }).join('');
  }

  function renderList() {
    var body = $('rza-listbody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="rza-empty">Belum ada pendaftar.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function (r) {
      return '<tr data-open="' + esc(r.id) + '">' +
        '<td class="rza-nm">' + esc(r.nama) + '</td>' +
        '<td><span class="rza-wa">' +
          '<a href="' + esc(waLink(r.whatsapp)) + '" target="_blank" rel="noopener">' +
            esc(fmtWa(r.whatsapp)) + '</a>' +
          '<button class="rza-copy" type="button" data-copy="' + esc(r.whatsapp) + '">salin</button>' +
        '</span></td>' +
        '<td>' + esc(r.kota || '—') + '</td>' +
        '<td>' + esc(r.jam_per_minggu || '—') + '</td>' +
        '<td class="rza-stars">' + (r.skor ? stars(r.skor) : '—') + '</td>' +
        '<td><span class="rza-pill rza-pill--' + esc(r.status) + '">' +
          esc(statusLabel(r.status)) + '</span></td>' +
      '</tr>';
    }).join('');
  }

  function render() {
    $('rza-board').hidden = view !== 'papan';
    $('rza-listview').hidden = view !== 'daftar';
    if (view === 'papan') renderBoard(); else renderList();
    if (openId) renderDrawer(byId(openId));
  }

  /* ── Drawer ────────────────────────────────────────────────────────────── */

  function qa(label, value) {
    var empty = !value && value !== 0;
    return '<div class="rza-qa"><dt>' + esc(label) + '</dt>' +
      '<dd' + (empty ? ' class="is-empty"' : '') + '>' +
      esc(empty ? 'Tidak diisi' : value) + '</dd></div>';
  }

  function gate(label, ok) {
    return '<li><b class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓' : '✕') + '</b>' +
      '<span>' + esc(label) + '</span></li>';
  }

  function renderDrawer(r) {
    if (!r) return;
    $('rza-dr-name').textContent = r.nama;
    $('rza-dr-sub').innerHTML =
      '<a href="' + esc(waLink(r.whatsapp)) + '" target="_blank" rel="noopener">' +
      esc(fmtWa(r.whatsapp)) + '</a> · ' + esc(r.email);

    var starBtns = '';
    for (var i = 1; i <= 5; i++) {
      starBtns += '<button class="rza-star' + (Number(r.skor) >= i ? ' is-on' : '') +
        '" type="button" data-skor="' + i + '" aria-label="Beri ' + i + ' bintang">★</button>';
    }

    $('rza-dr-body').innerHTML =
      '<div class="rza-grid2">' +
        qa('Kota', r.kota) +
        qa('Kampus', r.kampus) +
        qa('Jurusan', r.jurusan) +
        qa('Semester', r.semester) +
      '</div>' +
      '<div class="rza-grid2">' +
        qa(HARI_LABEL.perangkat, r.perangkat) +
        qa(HARI_LABEL.jam_per_minggu, r.jam_per_minggu) +
      '</div>' +
      qa(HARI_LABEL.pengalaman_jualan, r.pengalaman_jualan) +
      qa('Ide produk', r.ide_produk) +
      qa('Hari tersedia', (r.hari_tersedia || []).join(', ')) +

      '<div class="rza-dr-sect">' +
        qa('Kenapa ingin ikut LaRise?', r.alasan) +
        qa('Target 3 bulan setelah program', r.target_3bulan) +
      '</div>' +

      '<div class="rza-dr-sect">' +
        '<dt style="font-size:.74rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:9px">Komitmen</dt>' +
        '<ul class="rza-gates">' +
          gate('Bisa ikut 8 sesi Rabu 16:00–18:00 WITA (2 Sep – 28 Okt 2026)', r.gate_komitmen) +
          gate('Bisa hadir sesi pembukaan 2 September', r.gate_pembukaan) +
          gate('Paham hanya 20 yang dipilih', r.gate_paham_seleksi) +
        '</ul>' +
      '</div>' +

      '<div class="rza-dr-sect">' +
        '<dt style="font-size:.74rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:9px">Penilaian kamu</dt>' +
        '<div class="rza-stars-in">' + starBtns + '</div>' +
        '<label for="rza-note" style="display:block;font-size:.74rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:7px">Catatan pribadi</label>' +
        '<textarea class="rzf-textarea" id="rza-note" placeholder="Hanya kamu yang melihat ini.">' +
          esc(r.catatan_internal || '') + '</textarea>' +
        '<p class="rza-saved" id="rza-saved">Tersimpan</p>' +
      '</div>' +

      '<div class="rza-dr-sect" style="padding-bottom:20px">' +
        '<label for="rza-dr-status" style="display:block;font-size:.74rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute);margin-bottom:7px">Status</label>' +
        '<select class="rza-sel" id="rza-dr-status" data-status="' + esc(r.id) + '" style="min-height:50px;font-size:.95rem">' +
          STATUS.map(function (s) {
            return '<option value="' + s.key + '"' + (s.key === r.status ? ' selected' : '') + '>' +
              esc(s.label) + '</option>';
          }).join('') +
        '</select>' +
        (r.notified_at
          ? '<p class="rza-warn" style="margin-top:12px">Sudah dikabari pada ' +
              esc(new Date(r.notified_at).toLocaleString('id-ID')) + '.</p>'
          : '') +
      '</div>';
  }

  function openDrawer(id) {
    var r = byId(id);
    if (!r) return;
    openId = id;
    renderDrawer(r);
    $('rza-drawer').hidden = false;
    $('rza-scrim').hidden = false;
    requestAnimationFrame(function () {
      $('rza-drawer').classList.add('is-on');
      $('rza-scrim').classList.add('is-on');
    });
  }

  function closeDrawer() {
    openId = null;
    $('rza-drawer').classList.remove('is-on');
    $('rza-scrim').classList.remove('is-on');
    setTimeout(function () {
      $('rza-drawer').hidden = true;
      $('rza-scrim').hidden = true;
    }, 260);
  }

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  function setStatus(id, status) {
    var r = byId(id);
    if (!r) return;
    var prev = r.status;
    r.status = status;             // optimistic; rolled back on error
    render();

    sb.rpc('rise_set_status', { p_id: id, p_status: status }).then(function (res) {
      if (res.error) {
        r.status = prev;
        render();
        toast('Gagal mengubah status.');
        return;
      }
      if (status === 'diterima') askNotify(r);
      else toast(r.nama + ' → ' + statusLabel(status));
    });
  }

  function saveNote(id, note, skor) {
    var r = byId(id);
    if (!r) return;
    r.catatan_internal = note;
    r.skor = skor;
    sb.rpc('rise_set_note', { p_id: id, p_note: note, p_skor: skor }).then(function (res) {
      if (res.error) { toast('Gagal menyimpan catatan.'); return; }
      var s = $('rza-saved');
      if (s) {
        s.classList.add('is-on');
        setTimeout(function () { s.classList.remove('is-on'); }, 1600);
      }
      if (view === 'papan') renderBoard(); else renderList();
    });
  }

  /* ── Notify ────────────────────────────────────────────────────────────── */

  function askNotify(r) {
    pendingNotify = r.id;
    $('rza-modal-p').textContent =
      r.nama + ' akan menerima email dan WhatsApp bahwa mereka diterima di LaRise Batch 1.';
    var warn = $('rza-modal-warn');
    if (r.notified_at) {
      warn.textContent = 'Kandidat ini sudah pernah dikabari pada ' +
        new Date(r.notified_at).toLocaleString('id-ID') + '. Mengirim lagi akan mengirim pesan kedua.';
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }
    $('rza-modal-yes').textContent = 'Ya, kirim sekarang';
    $('rza-modal-yes').disabled = false;
    $('rza-modal').classList.add('is-on');
  }

  function closeModal() {
    pendingNotify = null;
    $('rza-modal').classList.remove('is-on');
  }

  function sendNotify() {
    var id = pendingNotify;
    var r = byId(id);
    if (!r) { closeModal(); return; }
    var yes = $('rza-modal-yes');
    yes.disabled = true;
    yes.textContent = 'Mengirim…';

    sb.functions.invoke('rise-notify-accepted', { body: { id: id } }).then(function (res) {
      if (res.error || !res.data || res.data.ok !== true) {
        toast('Gagal mengirim notifikasi.');
        yes.disabled = false;
        yes.textContent = 'Ya, kirim sekarang';
        return;
      }
      r.notified_at = new Date().toISOString();
      closeModal();
      render();
      toast('Notifikasi terkirim ke ' + r.nama + '.');
    }).catch(function () {
      toast('Gagal mengirim notifikasi.');
      yes.disabled = false;
      yes.textContent = 'Ya, kirim sekarang';
    });
  }

  /* ── Events (delegated, one binding) ───────────────────────────────────── */

  function bindUi() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('.rza-tab');
      if (tab) {
        view = tab.getAttribute('data-view');
        var tabs = document.querySelectorAll('.rza-tab');
        for (var i = 0; i < tabs.length; i++) {
          var on = tabs[i] === tab;
          tabs[i].classList.toggle('is-active', on);
          tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
        }
        render();
        return;
      }

      var copy = e.target.closest('[data-copy]');
      if (copy) {
        e.stopPropagation();
        navigator.clipboard.writeText(copy.getAttribute('data-copy')).then(function () {
          toast('Nomor disalin.');
        });
        return;
      }

      var star = e.target.closest('[data-skor]');
      if (star) {
        var note = $('rza-note');
        saveNote(openId, note ? note.value : '', Number(star.getAttribute('data-skor')));
        renderDrawer(byId(openId));
        return;
      }

      if (e.target.closest('#rza-dr-close') || e.target.closest('#rza-scrim')) {
        closeDrawer();
        return;
      }
      if (e.target.closest('#rza-modal-no')) { closeModal(); return; }
      if (e.target.closest('#rza-modal-yes')) { sendNotify(); return; }

      // A status <select> sits inside the card; clicking it must not also open
      // the drawer.
      if (e.target.closest('[data-status]')) return;

      var opener = e.target.closest('[data-open]');
      if (opener) openDrawer(opener.getAttribute('data-open'));
    });

    document.addEventListener('change', function (e) {
      var sel = e.target.closest('[data-status]');
      if (sel) setStatus(sel.getAttribute('data-status'), sel.value);
    });

    // Autosave the note on blur rather than per keystroke — one write per edit.
    document.addEventListener('focusout', function (e) {
      if (e.target && e.target.id === 'rza-note' && openId) {
        var r = byId(openId);
        if (r && e.target.value !== (r.catatan_internal || '')) {
          saveNote(openId, e.target.value, r.skor);
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('rza-modal').classList.contains('is-on')) closeModal();
      else if (openId) closeDrawer();
    });
  }

  boot();
})();
