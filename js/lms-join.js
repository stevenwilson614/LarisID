/* Coach door: LarisID account, optional authenticator, then a school link. */
(function () {
  const SUPA_URL = 'https://api.larisid.com';
  const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
  const AUTH_KEY = 'lms-auth-v1';
  const API = '/obrolan.marketing/api';
  const BANDS = ['1-10', '11-20', '21-30', '31-50', '51-100', '100+'];
  const BAND_LABEL = {
    '1-10': '1–10',
    '11-20': '11–20',
    '21-30': '21–30',
    '31-50': '31–50',
    '51-100': '51–100',
    '100+': '100+'
  };

  const $ = (id) => document.getElementById(id);
  let session = null;
  let emailMode = 'signup';
  let emailOpen = false;
  let factorId = '';
  let challengeId = '';
  let wizStep = 0;
  const draft = {
    firstName: '', lastName: '', businessName: '', headline: '', biography: '',
    socials: { website: '', instagram: '', tiktok: '', youtube: '', facebook: '', linkedin: '', x: '' },
    photo: '', photoFromTiktok: false, mentorBand: '', slug: ''
  };
  let tiktokPhotoTimer = 0;
  let tiktokPhotoToken = 0;

  function show(id) {
    const land = id === 'view-land';
    const landing = $('view-land');
    const wrap = $('auth-wrap');
    if (landing) landing.hidden = !land;
    if (wrap) wrap.hidden = land;
    ['view-auth', 'view-2fa', 'view-wiz'].forEach((key) => {
      const el = $(key);
      if (el) el.hidden = key !== id;
    });
    if (!land) window.scrollTo(0, 0);
  }
  function err(id, msg) {
    const el = $(id);
    if (el) el.textContent = msg || '';
  }
  function saveSession(next) {
    session = next;
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(next)); } catch (e) { /* private */ }
  }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; }
  }
  function authHeaders(token) {
    return {
      apikey: SUPA_ANON,
      Authorization: 'Bearer ' + (token || (session && session.access_token) || ''),
      'Content-Type': 'application/json'
    };
  }
  function jwtPayload(token) {
    try {
      const part = String(token || '').split('.')[1] || '';
      const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch (e) { return {}; }
  }
  async function refreshSession() {
    if (!session || !session.refresh_token) return false;
    const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: authHeaders(SUPA_ANON),
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) return false;
    saveSession(data);
    return true;
  }

  async function ownedSlug() {
    const res = await fetch(API + '/owners/me', { headers: { authorization: 'Bearer ' + session.access_token } });
    if (res.status === 401 && await refreshSession()) {
      const again = await fetch(API + '/owners/me', { headers: { authorization: 'Bearer ' + session.access_token } });
      if (!again.ok) return '';
      const body = await again.json().catch(() => ({}));
      return body.slug || '';
    }
    if (!res.ok) return '';
    const body = await res.json().catch(() => ({}));
    return body.slug || '';
  }

  async function listFactors() {
    const res = await fetch(SUPA_URL + '/auth/v1/factors', { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    const totp = (data && data.totp) || (data && data.all) || [];
    return Array.isArray(totp) ? totp : [];
  }

  async function routeAfterAuth() {
    const factors = await listFactors();
    const verified = factors.filter((f) => f && f.status === 'verified' && f.factor_type === 'totp');
    const aal = jwtPayload(session.access_token).aal;
    if (verified.length && aal !== 'aal2') {
      factorId = verified[0].id;
      show('view-2fa');
      $('twofa-offer').hidden = true;
      $('twofa-enroll').hidden = true;
      $('twofa-challenge').hidden = false;
      err('twofa-err', '');
      return;
    }
    const slug = await ownedSlug();
    if (slug) {
      location.assign('/' + slug + '/');
      return;
    }
    if (!verified.length) {
      show('view-2fa');
      $('twofa-offer').hidden = false;
      $('twofa-enroll').hidden = true;
      $('twofa-challenge').hidden = true;
      err('twofa-err', '');
      return;
    }
    openWizard();
  }

  function hashSession() {
    const hash = location.hash || '';
    if (hash.indexOf('access_token') < 0) return false;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    if (params.get('type') === 'recovery') return false;
    const access = params.get('access_token');
    if (!access) return false;
    saveSession({
      access_token: access,
      refresh_token: params.get('refresh_token') || '',
      expires_in: Number(params.get('expires_in') || 3600),
      token_type: 'bearer'
    });
    history.replaceState({}, '', location.pathname + location.search);
    return true;
  }

  function setEmailOpen(open) {
    emailOpen = !!open;
    const form = $('email-form');
    const toggle = $('email-open');
    if (form) form.hidden = !emailOpen;
    if (toggle) {
      toggle.classList.toggle('is-open', emailOpen);
      toggle.setAttribute('aria-expanded', emailOpen ? 'true' : 'false');
    }
  }
  function setEmailMode(mode) {
    emailMode = mode === 'login' ? 'login' : 'signup';
    const signup = emailMode === 'signup';
    const panel = $('view-auth');
    if (panel) panel.classList.toggle('is-signup', signup);
    const mascot = $('auth-mascot');
    if (mascot) {
      if (signup && !mascot.src && mascot.dataset.src) mascot.src = mascot.dataset.src;
    }
    const title = $('auth-title');
    if (title) title.textContent = signup ? 'Buat akun untuk buat kelas' : 'Masuk untuk buat kelas';
    const sub = $('auth-subtitle');
    if (sub) {
      sub.textContent = signup
        ? 'Gratis. Paling gampang daftar pakai nomor HP (SMS OTP).'
        : 'Masuk dengan akun LarisID yang sudah ada.';
    }
    const waHero = $('auth-wa-hero-title');
    if (waHero) waHero.textContent = signup ? 'Daftar dengan SMS' : 'Masuk dengan SMS';
    const googleLabel = $('auth-google-label');
    if (googleLabel) googleLabel.textContent = signup ? 'Daftar dengan Google' : 'Masuk dengan Google';
    const emailLabel = $('auth-email-label');
    if (emailLabel) emailLabel.textContent = signup ? 'Daftar dengan Email' : 'Masuk dengan Email';
    const submit = $('email-submit');
    if (submit) submit.textContent = signup ? 'Daftar dengan Email' : 'Masuk';
    const toggleText = $('auth-toggle-text');
    if (toggleText) {
      toggleText.innerHTML = signup
        ? 'Sudah punya akun? <a id="email-mode" role="button" tabindex="0">Masuk</a>'
        : 'Belum punya akun? <a id="email-mode" role="button" tabindex="0">Daftar</a>';
      bindEmailModeToggle();
    }
    const nameLabel = $('name-label');
    const fullName = $('full-name');
    if (nameLabel) nameLabel.hidden = !signup;
    if (fullName) fullName.hidden = !signup;
    setEmailOpen(false);
  }
  function bindEmailModeToggle() {
    const link = $('email-mode');
    if (!link || link.dataset.bound) return;
    link.dataset.bound = '1';
    link.addEventListener('click', () => {
      setEmailMode(emailMode === 'signup' ? 'login' : 'signup');
    });
  }
  function openAuth(mode) {
    show('view-auth');
    err('auth-err', '');
    const panel = $('view-auth');
    if (panel) panel.classList.remove('is-otp');
    $('sms-phone').hidden = false;
    $('sms-code').hidden = true;
    if (mode === 'login') setEmailMode('login');
    else setEmailMode('signup');
  }
  function begin(mode) {
    session = loadSession();
    if (session && session.access_token) routeAfterAuth().catch(() => openAuth(mode));
    else openAuth(mode);
  }

  document.querySelectorAll('[data-start]').forEach((btn) => {
    btn.addEventListener('click', () => begin('signup'));
  });
  document.querySelectorAll('[data-login]').forEach((btn) => {
    btn.addEventListener('click', () => begin('login'));
  });
  const back = $('auth-back');
  if (back) back.addEventListener('click', () => show('view-land'));

  $('google-btn').addEventListener('click', () => {
    const back = location.origin + '/lms/';
    const url = SUPA_URL + '/auth/v1/authorize?provider=google&redirect_to=' +
      encodeURIComponent(back) + '&apikey=' + encodeURIComponent(SUPA_ANON);
    location.assign(url);
  });

  $('sms-send').addEventListener('click', sendSms);
  $('sms-resend').addEventListener('click', (e) => { e.preventDefault(); sendSms(); });
  $('sms-verify').addEventListener('click', verifySms);
  $('email-open').addEventListener('click', () => {
    setEmailOpen(!emailOpen);
    if (emailOpen) $('email')?.focus();
  });
  bindEmailModeToggle();
  $('email-form').addEventListener('submit', (e) => { e.preventDefault(); submitEmail(); });

  async function sendSms() {
    err('auth-err', '');
    const phone = $('phone').value.trim();
    if (!phone) { err('auth-err', 'Masukkan nomor HP.'); return; }
    $('sms-send').disabled = true;
    try {
      const res = await fetch(SUPA_URL + '/functions/v1/send-whatsapp-otp', {
        method: 'POST',
        headers: authHeaders(SUPA_ANON),
        body: JSON.stringify({ phone: phone })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        err('auth-err', data.error || data.message || 'SMS tidak terkirim.');
        return;
      }
      $('sms-phone').hidden = true;
      $('sms-code').hidden = false;
      const panel = $('view-auth');
      if (panel) panel.classList.add('is-otp');
      $('sms-hint').textContent = 'Kode OTP sudah dikirim via SMS ke ' + (data.phone || phone) + '. Masukkan 6 digit di bawah.';
      setTimeout(() => $('otp')?.focus(), 80);
    } catch (e) {
      err('auth-err', 'Tidak terhubung. Coba lagi.');
    } finally {
      $('sms-send').disabled = false;
    }
  }

  async function verifySms() {
    err('auth-err', '');
    const otp = $('otp').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(otp)) { err('auth-err', 'Masukkan 6 digit kode.'); return; }
    $('sms-verify').disabled = true;
    try {
      const res = await fetch(SUPA_URL + '/functions/v1/verify-whatsapp-otp', {
        method: 'POST',
        headers: authHeaders(SUPA_ANON),
        body: JSON.stringify({ phone: $('phone').value.trim(), otp: otp })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session || !data.session.access_token) {
        err('auth-err', (data && (data.error || data.message)) || 'Kode tidak cocok.');
        return;
      }
      saveSession(data.session);
      await routeAfterAuth();
    } catch (e) {
      err('auth-err', 'Tidak terhubung. Coba lagi.');
    } finally {
      $('sms-verify').disabled = false;
    }
  }

  async function submitEmail() {
    err('auth-err', '');
    const email = $('email').value.trim();
    const password = $('password').value;
    const name = $('full-name').value.trim();
    if (!email || password.length < 6) { err('auth-err', 'Email dan password (min. 6) wajib.'); return; }
    $('email-submit').disabled = true;
    try {
      let data;
      if (emailMode === 'signup') {
        const res = await fetch(SUPA_URL + '/functions/v1/email-signup', {
          method: 'POST',
          headers: authHeaders(SUPA_ANON),
          body: JSON.stringify({ email: email, password: password, full_name: name })
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) {
          err('auth-err', data.error || data.msg || 'Daftar gagal.');
          return;
        }
      } else {
        const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: authHeaders(SUPA_ANON),
          body: JSON.stringify({ email: email, password: password })
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok || !data.access_token) {
          err('auth-err', data.msg || data.error_description || data.error || 'Masuk gagal.');
          return;
        }
      }
      saveSession(data);
      await routeAfterAuth();
    } catch (e) {
      err('auth-err', 'Tidak terhubung. Coba lagi.');
    } finally {
      $('email-submit').disabled = false;
    }
  }

  $('twofa-skip').addEventListener('click', () => openWizard());
  $('twofa-yes').addEventListener('click', enrollFactor);
  $('twofa-confirm').addEventListener('click', () => confirmFactor($('twofa-code').value, false));
  $('twofa-challenge-go').addEventListener('click', () => confirmFactor($('twofa-challenge-code').value, true));

  async function enrollFactor() {
    err('twofa-err', '');
    const res = await fetch(SUPA_URL + '/auth/v1/factors', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ factor_type: 'totp', friendly_name: 'LarisID' })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
      err('twofa-err', (data.msg || data.error || 'Autentikator belum bisa dipasang.') + '');
      return;
    }
    factorId = data.id;
    const totp = data.totp || {};
    $('twofa-secret').textContent = totp.secret || '';
    if (totp.qr_code) {
      $('twofa-qr').hidden = false;
      $('twofa-qr').src = totp.qr_code;
    }
    $('twofa-offer').hidden = true;
    $('twofa-enroll').hidden = false;
  }

  async function confirmFactor(code, challenging) {
    err('twofa-err', '');
    const otp = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(otp)) { err('twofa-err', 'Masukkan 6 digit dari autentikator.'); return; }
    const challenge = await fetch(SUPA_URL + '/auth/v1/factors/' + encodeURIComponent(factorId) + '/challenge', {
      method: 'POST',
      headers: authHeaders(),
      body: '{}'
    });
    const ch = await challenge.json().catch(() => ({}));
    if (!challenge.ok || !ch.id) {
      err('twofa-err', 'Tantangan gagal. Coba lagi.');
      return;
    }
    challengeId = ch.id;
    const verify = await fetch(SUPA_URL + '/auth/v1/factors/' + encodeURIComponent(factorId) + '/verify', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ challenge_id: challengeId, code: otp })
    });
    const data = await verify.json().catch(() => ({}));
    if (!verify.ok || !data.access_token) {
      err('twofa-err', 'Kode tidak cocok.');
      return;
    }
    saveSession(data);
    if (challenging) await routeAfterAuth();
    else openWizard();
  }

  function openWizard() {
    wizStep = 0;
    show('view-wiz');
    paintWizard();
  }

  function slugify(name) {
    const s = String(name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return s.length >= 3 ? s : '';
  }

  function socIcon(key) {
    const icons = {
      website: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>',
      instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
      tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 3c.4 2.3 1.8 4 4 4.5v2.3c-1.5-.1-2.8-.6-4-1.4v6.3a5.7 5.7 0 11-5.7-5.7c.3 0 .6 0 .9.1v2.5a3.2 3.2 0 103.2 3.2V3h1.6z"/></svg>',
      youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.2s0-3.2-.4-4.7c-.2-.8-.8-1.4-1.6-1.6C18.5 5.5 12 5.5 12 5.5s-6.5 0-8 .4c-.8.2-1.4.8-1.6 1.6C2 9 2 12.2 2 12.2s0 3.2.4 4.7c.2.8.8 1.4 1.6 1.6 1.5.4 8 .4 8 .4s6.5 0 8-.4c.8-.2 1.4-.8 1.6-1.6.4-1.5.4-4.7.4-4.7zM10 15.2V9.2l5.2 3-5.2 3z"/></svg>',
      facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h2.6l.4-3H13v-2c0-.6.4-1 1-1z"/></svg>',
      linkedin: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 9.5H3.7V20h2.8V9.5zM5.1 4a1.7 1.7 0 100 3.4A1.7 1.7 0 005.1 4zM20.3 20h-2.8v-5.6c0-1.5-.6-2.5-2-2.5-1 0-1.5.7-1.8 1.3-.1.2-.1.5-.1.8V20H10.8s0-8.6 0-9.5h2.8v1.5c.5-.8 1.5-1.9 3.6-1.9 2.6 0 4.5 1.7 4.5 5.3V20z"/></svg>',
      x: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3l-6.6 7.5L22 21h-6.2l-4.3-5.6L6.3 21H3.3l7-8L2 3h6.4l3.9 5.2L17.5 3zm-1.1 16.2h1.7L7.7 4.7H5.9l10.5 14.5z"/></svg>'
    };
    return icons[key] || icons.website;
  }

  function tiktokHandle(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = s.match(/(?:tiktok\.com\/@|@)?([A-Za-z0-9._]{2,24})\/?$/);
    return m ? m[1].replace(/^@/, '') : s.replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 24);
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }

  function fetchTikTokAvatar(handle) {
    const h = tiktokHandle(handle);
    if (!h) return Promise.resolve(null);
    const oembed = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent('https://www.tiktok.com/@' + h);
    const unav = 'https://unavatar.io/tiktok/' + encodeURIComponent(h) + '?fallback=false';
    return fetch(oembed).then((r) => r.ok ? r.json() : null).then((j) => {
      if (j && j.thumbnail_url) return fetch(j.thumbnail_url).then((r) => r.ok ? r.blob() : null);
      return null;
    }).catch(() => null).then((blob) => {
      if (blob) return blob;
      return fetch(unav).then((r) => r.ok ? r.blob() : null).catch(() => null);
    });
  }

  function paintPhotoPreview() {
    const wrap = $('photo-preview');
    if (!wrap) return;
    if (draft.photo) {
      wrap.innerHTML =
        '<img src="' + esc(draft.photo) + '" alt="Foto profil">' +
        '<div class="photo-preview-meta">' +
          '<strong>' + (draft.photoFromTiktok ? 'Dari TikTok' : 'Foto diunggah') + '</strong>' +
          '<span>' + (draft.photoFromTiktok ? 'Tidak suka? Ganti dengan foto lain.' : 'Bisa diganti kapan saja.') + '</span>' +
        '</div>';
      wrap.hidden = false;
    } else {
      wrap.innerHTML = '';
      wrap.hidden = true;
    }
  }

  function scheduleTikTokPhoto(force) {
    clearTimeout(tiktokPhotoTimer);
    const input = $('soc-tiktok');
    const handle = tiktokHandle(input ? input.value : draft.socials.tiktok);
    const status = $('photo-status');
    if (!handle) {
      if (status) status.textContent = 'Isi handle TikTok untuk tarik foto otomatis.';
      return;
    }
    if (draft.photo && !draft.photoFromTiktok && !force) {
      if (status) status.textContent = 'Foto manual dipakai. Klik “Tarik dari TikTok” kalau mau ganti.';
      return;
    }
    if (status) status.textContent = 'Mengambil foto dari TikTok…';
    tiktokPhotoTimer = setTimeout(() => {
      const token = ++tiktokPhotoToken;
      fetchTikTokAvatar(handle).then((blob) => {
        if (token !== tiktokPhotoToken) return;
        if (!blob) {
          if (status) status.textContent = 'Foto TikTok tidak ketemu. Unggah manual saja.';
          return;
        }
        if (blob.size > 1400000) {
          if (status) status.textContent = 'Foto TikTok terlalu besar. Unggah manual saja.';
          return;
        }
        return blobToDataUrl(blob).then((url) => {
          if (token !== tiktokPhotoToken || !url) return;
          draft.photo = url;
          draft.photoFromTiktok = true;
          paintPhotoPreview();
          if (status) status.textContent = 'Foto diambil dari @' + handle + '. Boleh diganti.';
        });
      }).catch(() => {
        if (token !== tiktokPhotoToken) return;
        if (status) status.textContent = 'Gagal tarik foto. Unggah manual saja.';
      });
    }, force ? 80 : 550);
  }

  function paintWizard() {
    const steps = [
      { kicker: 'Langkah 1', title: 'Siapa kamu?', sub: 'Nama depan dan belakang.' },
      { kicker: 'Langkah 2', title: 'Nama kelas', sub: 'Nama bisnis atau nama coaching.' },
      { kicker: 'Langkah 3', title: 'Header dan bio', sub: 'Teks yang siswa lihat di halaman kelasmu.' },
      { kicker: 'Langkah 4', title: 'Sosial dan foto', sub: 'Isi yang relevan. Foto bisa ditarik dari TikTok.' },
      { kicker: 'Langkah 5', title: 'Berapa murid yang kamu dampingi?', sub: 'Pilih rentang, bukan angka pasti.' },
      { kicker: 'Langkah 6', title: 'Tautan kelas', sub: 'Buat tautan unik untuk kelas Anda. Bisa diubah nanti.' }
    ];
    const step = steps[wizStep];
    $('wiz-kicker').textContent = step.kicker;
    $('wiz-title').textContent = step.title;
    $('wiz-sub').textContent = step.sub;
    $('wiz-back').hidden = wizStep === 0;
    $('wiz-next').textContent = wizStep === steps.length - 1 ? 'Buat kelas' : 'Lanjut';
    err('wiz-err', '');
    const form = $('wiz-form');
    if (wizStep === 0) {
      form.innerHTML = '<label for="first">Nama depan</label><input id="first" value="' + esc(draft.firstName) + '" autocomplete="given-name">' +
        '<label for="last">Nama belakang</label><input id="last" value="' + esc(draft.lastName) + '" autocomplete="family-name">';
    } else if (wizStep === 1) {
      form.innerHTML = '<label for="biz">Nama bisnis atau coaching</label><input id="biz" value="' + esc(draft.businessName) + '">';
    } else if (wizStep === 2) {
      form.innerHTML =
        '<label for="head">Header</label>' +
        '<p class="field-hint">Satu kalimat singkat di bawah namamu — biasanya janji kelas atau posisi, contoh: “Mentor Shopee Ads untuk seller pemula.”</p>' +
        '<input id="head" maxlength="60" value="' + esc(draft.headline) + '" placeholder="Contoh: Mentor TikTok Shop untuk toko baru">' +
        '<label for="bio">Bio</label>' +
        '<p class="field-hint">Paragraf pendek tentang siapa kamu, apa yang diajarkan, dan untuk siapa kelas ini. Biasanya 2–4 kalimat.</p>' +
        '<textarea id="bio" maxlength="800" placeholder="Ceritakan pengalamanmu dan hasil yang biasanya didapat siswa…">' + esc(draft.biography) + '</textarea>';
    } else if (wizStep === 3) {
      const nets = [
        ['website', 'Website', 'https://…'],
        ['instagram', 'Instagram', '@username'],
        ['tiktok', 'TikTok', '@username'],
        ['youtube', 'YouTube', '@channel atau URL'],
        ['facebook', 'Facebook', 'username atau URL'],
        ['linkedin', 'LinkedIn', 'username atau URL'],
        ['x', 'X', '@username']
      ];
      form.innerHTML =
        nets.map((pair) =>
          '<label for="soc-' + pair[0] + '">' + pair[1] + '</label>' +
          '<div class="soc-row">' +
            '<span class="soc-ico" aria-hidden="true">' + socIcon(pair[0]) + '</span>' +
            '<input id="soc-' + pair[0] + '" value="' + esc(draft.socials[pair[0]] || '') + '" placeholder="' + esc(pair[2]) + '" autocomplete="off" spellcheck="false">' +
          '</div>'
        ).join('') +
        '<div class="photo-block">' +
          '<label>Foto profil</label>' +
          '<p class="field-hint">Isi handle TikTok di atas — kami tarik fotonya otomatis. Kalau tidak cocok, ganti manual.</p>' +
          '<div class="photo-preview" id="photo-preview" hidden></div>' +
          '<p class="hint" id="photo-status"></p>' +
          '<div class="photo-actions">' +
            '<button type="button" class="btn btn-white" id="photo-tiktok">Tarik dari TikTok</button>' +
            '<label class="btn btn-white photo-file-btn" for="photo">Ganti foto</label>' +
            '<input id="photo" type="file" accept="image/png,image/jpeg,image/webp" hidden>' +
          '</div>' +
        '</div>';
      paintPhotoPreview();
      const tt = $('soc-tiktok');
      if (tt) {
        tt.addEventListener('input', () => {
          draft.socials.tiktok = tt.value.trim();
          scheduleTikTokPhoto(false);
        });
        if (draft.socials.tiktok && !draft.photo) scheduleTikTokPhoto(true);
        else if (draft.socials.tiktok && draft.photoFromTiktok) {
          const st = $('photo-status');
          if (st) st.textContent = 'Foto diambil dari TikTok. Boleh diganti.';
        } else if (!draft.socials.tiktok) {
          const st = $('photo-status');
          if (st) st.textContent = 'Isi handle TikTok untuk tarik foto otomatis.';
        }
      }
      const pullBtn = $('photo-tiktok');
      if (pullBtn) {
        pullBtn.addEventListener('click', () => {
          readStep();
          scheduleTikTokPhoto(true);
        });
      }
      const file = $('photo');
      if (file) {
        file.addEventListener('change', async () => {
          const picked = file.files && file.files[0];
          if (!picked) return;
          if (picked.size > 1400000) { err('wiz-err', 'Foto maksimal sekitar 1,4 MB.'); return; }
          draft.photo = await readFile(picked);
          draft.photoFromTiktok = false;
          paintPhotoPreview();
          const st = $('photo-status');
          if (st) st.textContent = 'Foto diganti manual.';
        });
      }
    } else if (wizStep === 4) {
      form.innerHTML = '<div class="bands">' + BANDS.map((id) =>
        '<button type="button" class="btn btn-white" data-band="' + id + '" aria-pressed="' + (draft.mentorBand === id) + '">' + BAND_LABEL[id] + '</button>'
      ).join('') + '</div>';
      form.querySelectorAll('[data-band]').forEach((btn) => {
        btn.addEventListener('click', () => {
          draft.mentorBand = btn.getAttribute('data-band');
          paintWizard();
        });
      });
    } else {
      if (!draft.slug) draft.slug = slugify(draft.businessName);
      form.innerHTML =
        '<div class="slug-field">' +
          '<span class="slug-prefix" aria-hidden="true">larisid.com/</span>' +
          '<input id="slug" value="' + esc(draft.slug) + '" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="Tautan kelas">' +
        '</div>' +
        '<p class="slug-hint" id="slug-hint"></p>';
      $('slug').addEventListener('input', () => {
        const raw = $('slug').value;
        const next = slugify(raw);
        if (raw !== next) $('slug').value = next;
        draft.slug = next;
        checkSlug();
      });
      checkSlug();
    }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function readStep() {
    if (wizStep === 0) {
      draft.firstName = ($('first') && $('first').value || '').trim();
      draft.lastName = ($('last') && $('last').value || '').trim();
      if (!draft.firstName || !draft.lastName) return 'Isi nama depan dan belakang.';
    } else if (wizStep === 1) {
      draft.businessName = ($('biz') && $('biz').value || '').trim();
      if (!draft.businessName) return 'Isi nama bisnis atau coaching.';
      if (!draft.slug) draft.slug = slugify(draft.businessName);
    } else if (wizStep === 2) {
      draft.headline = ($('head') && $('head').value || '').trim().slice(0, 60);
      draft.biography = ($('bio') && $('bio').value || '').trim().slice(0, 800);
      if (!draft.headline) return 'Isi header.';
    } else if (wizStep === 3) {
      ['website', 'instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'x'].forEach((key) => {
        const el = $('soc-' + key);
        draft.socials[key] = el ? el.value.trim() : '';
      });
    } else if (wizStep === 4) {
      if (!draft.mentorBand) return 'Pilih rentang murid.';
    } else if (wizStep === 5) {
      draft.slug = slugify(($('slug') && $('slug').value) || draft.slug);
      if (!draft.slug) return 'Tautan belum valid.';
    }
    return '';
  }

  let slugTimer = 0;
  function setSlugHint(state, text) {
    const hint = $('slug-hint');
    if (!hint) return;
    hint.className = 'slug-hint' + (state ? ' is-' + state : '');
    if (state === 'ok') {
      hint.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg><span>' + esc(text) + '</span>';
    } else {
      hint.textContent = text;
    }
  }
  function checkSlug() {
    clearTimeout(slugTimer);
    const slug = slugify(($('slug') && $('slug').value) || draft.slug);
    if (!slug) { setSlugHint('bad', 'Pakai huruf dan angka, minimal 3.'); return; }
    setSlugHint('', 'Memeriksa…');
    slugTimer = setTimeout(async () => {
      const res = await fetch(API + '/slug/' + encodeURIComponent(slug));
      const data = await res.json().catch(() => ({}));
      if (!$('slug-hint')) return;
      if (data.status === 'free') setSlugHint('ok', 'Tautan tersedia');
      else if (data.status === 'taken') setSlugHint('bad', 'Tautan ini sudah dipakai.');
      else setSlugHint('bad', 'Tautan ini tidak bisa dipakai.');
    }, 250);
  }

  $('wiz-back').addEventListener('click', () => {
    readStep();
    if (wizStep > 0) wizStep -= 1;
    paintWizard();
  });
  $('wiz-next').addEventListener('click', async () => {
    const problem = readStep();
    if (problem) { err('wiz-err', problem); return; }
    if (wizStep === 3) {
      const file = $('photo') && $('photo').files && $('photo').files[0];
      if (file && !draft.photoFromTiktok) {
        if (file.size > 1400000) { err('wiz-err', 'Foto maksimal sekitar 1,4 MB.'); return; }
        draft.photo = await readFile(file);
        draft.photoFromTiktok = false;
      }
    }
    if (wizStep < 5) {
      wizStep += 1;
      paintWizard();
      return;
    }
    const statusRes = await fetch(API + '/slug/' + encodeURIComponent(draft.slug));
    const status = await statusRes.json().catch(() => ({}));
    if (status.status !== 'free') { err('wiz-err', 'Tautan tidak bisa dipakai. Ubah dulu.'); return; }
    $('wiz-next').disabled = true;
    try {
      const res = await fetch(API + '/schools', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({
          firstName: draft.firstName,
          lastName: draft.lastName,
          businessName: draft.businessName,
          headline: draft.headline,
          biography: draft.biography,
          socials: draft.socials,
          mentorBand: draft.mentorBand,
          slug: draft.slug,
          photo: draft.photo
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) {
        err('wiz-err', data.error === 'taken' ? 'Tautan baru saja terpakai.' : 'Kelas belum tersimpan. Coba lagi.');
        $('wiz-next').disabled = false;
        return;
      }
      location.assign('/' + data.slug + '/');
    } catch (e) {
      err('wiz-err', 'Tidak terhubung. Coba lagi.');
      $('wiz-next').disabled = false;
    }
  });

  function readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  function selectShot(id) {
    document.querySelectorAll('[data-shot]').forEach((btn) => {
      const on = btn.getAttribute('data-shot') === id;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-panel]').forEach((panel) => {
      const on = panel.getAttribute('data-panel') === id;
      panel.hidden = !on;
      const stage = panel.querySelector('.stage');
      if (!stage) return;
      stage.classList.remove('is-play');
      if (on) {
        void stage.offsetWidth;
        stage.classList.add('is-play');
      }
    });
  }
  document.querySelectorAll('[data-shot]').forEach((btn) => {
    btn.addEventListener('click', () => selectShot(btn.getAttribute('data-shot')));
  });

  if (hashSession()) {
    routeAfterAuth().catch(() => openAuth());
  }
})();
