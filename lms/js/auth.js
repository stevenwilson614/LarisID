/* LMS session. Storage key must not match sb-*-auth-token: the seller app
   deletes those keys on boot. This login is not the LarisID seller session. */
(function () {
  /* www and apex do not share localStorage, so a PKCE verifier saved on www
     cannot be exchanged on larisid.com. Stay on the apex host. */
  if (location.hostname === 'www.larisid.com') {
    location.replace('https://larisid.com' + location.pathname + location.search + location.hash);
    return;
  }
  try {
    var early = new URLSearchParams(location.search);
    var earlyHash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    if (
      early.get('code') || early.get('error') || early.get('error_description') ||
      earlyHash.get('access_token') || earlyHash.get('error') || earlyHash.get('error_description')
    ) {
      document.documentElement.setAttribute('data-lms-oauth', '1');
      var landEarly = document.getElementById('view-land');
      var wrapEarly = document.getElementById('auth-wrap');
      var authEarly = document.getElementById('view-auth');
      var errEarly = document.getElementById('auth-err');
      if (landEarly) landEarly.hidden = true;
      if (wrapEarly) wrapEarly.hidden = false;
      if (authEarly) authEarly.hidden = false;
      if (errEarly && !errEarly.textContent) errEarly.textContent = 'Sedang masuk…';
    }
  } catch (err) { /* ignore */ }

  var SUPA_URL = 'https://api.larisid.com';
  /* Must match the seller app / Contabo Kong anon key. A typo here makes
     /auth/v1/user return Kong 401 after Google succeeds, so LMS never stores
     the session (looks like “Login Google terputus”). */
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
  var INVITE_KEY = 'lms_invite_v1';
  var NAME_KEY = 'lms_name_v1';
  var INTENT_KEY = 'lms_intent_v1';
  var SLUG_KEY = 'lms_slug_v1';
  var RESERVED = { card: 1, js: 1, css: 1, api: 1, static: 1, assets: 1, index: 1, login: 1, auth: 1 };

  function store() {
    try { return window.localStorage; } catch (err) { return null; }
  }
  function read(key) {
    try {
      var s = store();
      return (s && s.getItem(key)) || '';
    } catch (err) { return ''; }
  }
  function write(key, value) {
    try {
      var s = store();
      if (!s) return;
      if (value) s.setItem(key, value);
      else s.removeItem(key);
    } catch (err) { /* private mode */ }
  }

  function pathSlug() {
    try {
      var parts = String(location.pathname || '').split('/').filter(Boolean);
      if (parts[0] !== 'lms' || !parts[1]) return '';
      var slug = String(parts[1]).toLowerCase().trim();
      if (!/^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/.test(slug)) return '';
      if (RESERVED[slug]) return '';
      return slug;
    } catch (err) { return ''; }
  }

  (function captureInvite() {
    var invite = '';
    try { invite = new URLSearchParams(location.search).get('invite') || ''; } catch (err) { invite = ''; }
    invite = invite.trim();
    var slug = pathSlug();
    if (slug) {
      write(SLUG_KEY, slug);
      write(INTENT_KEY, 'student');
    }
    if (!invite) return;
    write(INVITE_KEY, invite);
    write(INTENT_KEY, 'student');
    try {
      var clean = location.pathname || '/lms/';
      history.replaceState({}, '', clean);
    } catch (err) { /* ignore */ }
  })();

  var sb = null;
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: 'lms_auth_v1',
        /* Implicit: Google returns tokens in the URL hash. PKCE needed a
           code-verifier in localStorage that was missing after redirect, so
           mentors saw “Login Google terputus” after a good Google callback. */
        flowType: 'implicit'
      }
    });
  }

  function errorText(err) {
    var msg = String((err && (err.message || err.error_description || err.msg)) || '');
    if (msg.indexOf('lms_exists') >= 0) return 'Akun ini sudah punya kelas. Satu akun hanya bisa menjadi mentor atau siswa.';
    if (msg.indexOf('lms_invite') >= 0) return 'Undangan tidak berlaku. Minta tautan baru dari mentor.';
    if (msg.indexOf('lms_forbidden') >= 0 || msg.indexOf('lms_locked') >= 0) return 'Kamu tidak punya akses untuk itu.';
    if (msg.indexOf('lms_name') >= 0) return 'Isi nama.';
    if (msg.indexOf('lms_title') >= 0) return 'Isi judul.';
    if (msg.indexOf('lms_one_file') >= 0) return 'Pelajaran ini sudah punya satu berkas. Hapus berkas itu dulu.';
    if (msg.indexOf('lms_mime') >= 0) return 'Jenis berkas ini tidak diterima. Pakai PDF, gambar, teks, dokumen, atau MP4.';
    if (msg.indexOf('lms_size') >= 0) return 'Berkas terlalu besar. Batasnya 50 MB.';
    if (msg.indexOf('lms_path') >= 0 || msg.indexOf('lms_lesson') >= 0 || msg.indexOf('lms_module') >= 0) return 'Berkas tidak bisa disimpan.';
    if (msg.indexOf('lms_auth') >= 0) return 'Masuk dulu.';
    if (msg.indexOf('lms_session') >= 0 || msg.indexOf('lms_when') >= 0) return 'Jadwal tidak bisa disimpan. Cek judul, tanggal, dan jam.';
    if (/code verifier|flow state|pkce/i.test(msg)) return 'Login Google terputus. Coba masuk lagi dari halaman ini.';
    if (/redirect/i.test(msg)) return 'Login Google tidak kembali ke halaman ini. Coba lagi.';
    if (/sending confirmation email/i.test(msg)) return 'Email konfirmasi tidak terkirim. Coba lagi, atau daftar dengan Google.';
    if (/already registered|already been registered/i.test(msg)) return 'Email ini sudah terdaftar. Masuk saja.';
    if (/invalid login|invalid credentials/i.test(msg)) return 'Email atau password salah.';
    if (/password/i.test(msg) && /least|short|weak/i.test(msg)) return 'Password terlalu pendek.';
    if (/email/i.test(msg) && /confirm|verify/i.test(msg)) return 'Cek email untuk mengaktifkan akun, lalu masuk di halaman ini.';
    return 'Tidak berhasil. Coba lagi.';
  }

  function schoolPath(slug) {
    var s = String(slug || pathSlug() || '').trim();
    if (!s) return '/lms/';
    return '/lms/' + encodeURIComponent(s) + '/';
  }

  /* Mentor login on /lms/ must not follow a leftover school slug.
     Student return keeps /lms/{slug}/ when the path or an invite has one. */
  function redirectPath() {
    if (pathSlug() || read(INVITE_KEY)) {
      var slug = pathSlug() || read(SLUG_KEY) || '';
      if (slug) return '/lms/' + encodeURIComponent(slug) + '/';
    }
    return '/lms/';
  }
  function siteOrigin() {
    var host = String(location.hostname || '');
    if (host === 'localhost' || host === '127.0.0.1') return location.origin;
    return 'https://larisid.com';
  }

  window.Lms = {
    sb: sb,
    storageKey: 'lms_auth_v1',
    invite: function () { return read(INVITE_KEY); },
    clearInvite: function () { write(INVITE_KEY, ''); },
    intent: function () { return read(INTENT_KEY) === 'student' ? 'student' : 'mentor'; },
    setIntent: function (intent) { write(INTENT_KEY, intent === 'student' ? 'student' : 'mentor'); },
    pendingName: function () { return read(NAME_KEY); },
    setPendingName: function (name) { write(NAME_KEY, String(name || '').trim()); },
    pathSlug: pathSlug,
    schoolSlug: function () { return pathSlug() || read(SLUG_KEY) || ''; },
    setSchoolSlug: function (slug) {
      var s = String(slug || '').toLowerCase().trim();
      write(SLUG_KEY, s);
    },
    schoolPath: schoolPath,
    redirectTo: function () { return siteOrigin() + redirectPath(); },
    /* Share URL hits the OG card so WhatsApp/iMessage see mentor title + photo. */
    inviteShareUrl: function (token) {
      return 'https://larisid.com/lms/card/?invite=' + encodeURIComponent(token || '');
    },
    schoolUrl: function (slug) {
      return 'https://larisid.com' + schoolPath(slug);
    },
    errorText: errorText
  };
})();
