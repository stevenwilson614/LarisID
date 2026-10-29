/* LMS session. Storage key must not match sb-*-auth-token: the seller app
   deletes those keys on boot. This login is not the LarisID seller session. */
(function () {
  var SUPA_URL = 'https://api.larisid.com';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
  var INVITE_KEY = 'lms_invite_v1';
  var NAME_KEY = 'lms_name_v1';
  var INTENT_KEY = 'lms_intent_v1';

  function read(key) {
    try { return sessionStorage.getItem(key) || ''; } catch (err) { return ''; }
  }
  function write(key, value) {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch (err) { /* private mode */ }
  }

  (function captureInvite() {
    var invite = '';
    try { invite = new URLSearchParams(location.search).get('invite') || ''; } catch (err) { invite = ''; }
    invite = invite.trim();
    if (!invite) return;
    write(INVITE_KEY, invite);
    write(INTENT_KEY, 'student');
    try { history.replaceState({}, '', location.pathname); } catch (err) { /* ignore */ }
  })();

  var sb = null;
  if (window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'lms_auth_v1',
        flowType: 'pkce'
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
    if (/sending confirmation email/i.test(msg)) return 'Email konfirmasi tidak terkirim. Coba lagi, atau daftar dengan Google.';
    if (/already registered|already been registered/i.test(msg)) return 'Email ini sudah terdaftar. Masuk saja.';
    if (/invalid login|invalid credentials/i.test(msg)) return 'Email atau password salah.';
    if (/password/i.test(msg) && /least|short|weak/i.test(msg)) return 'Password terlalu pendek.';
    if (/email/i.test(msg) && /confirm|verify/i.test(msg)) return 'Cek email untuk mengaktifkan akun, lalu masuk di halaman ini.';
    return 'Tidak berhasil. Coba lagi.';
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
    redirectTo: function () { return location.origin + '/lms/'; },
    errorText: errorText
  };
})();
