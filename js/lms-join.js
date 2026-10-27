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
  let factorId = '';
  let challengeId = '';
  let wizStep = 0;
  const draft = {
    firstName: '', lastName: '', businessName: '', headline: '', biography: '',
    socials: { website: '', instagram: '', tiktok: '', youtube: '', facebook: '', linkedin: '', x: '' },
    photo: '', mentorBand: '', slug: ''
  };

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

  function setEmailMode(mode) {
    emailMode = mode === 'login' ? 'login' : 'signup';
    $('email-form').hidden = emailMode !== 'login';
    $('email-submit').textContent = emailMode === 'signup' ? 'Daftar dengan Email' : 'Masuk dengan Email';
    $('email-mode').textContent = emailMode === 'signup' ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
    $('name-label').hidden = emailMode !== 'signup';
    $('full-name').hidden = emailMode !== 'signup';
  }
  function openAuth(mode) {
    show('view-auth');
    err('auth-err', '');
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
  $('sms-resend').addEventListener('click', sendSms);
  $('sms-verify').addEventListener('click', verifySms);
  $('email-open').addEventListener('click', () => { $('email-form').hidden = false; });
  $('email-mode').addEventListener('click', () => {
    setEmailMode(emailMode === 'signup' ? 'login' : 'signup');
    $('email-form').hidden = false;
  });
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
      $('sms-hint').textContent = 'Kode dikirim lewat SMS ke ' + (data.phone || phone) + '.';
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

  function paintWizard() {
    const steps = [
      { kicker: 'Langkah 1', title: 'Siapa kamu?', sub: 'Nama depan dan belakang.' },
      { kicker: 'Langkah 2', title: 'Nama kelas', sub: 'Nama bisnis atau nama coaching.' },
      { kicker: 'Langkah 3', title: 'Header dan bio', sub: 'Kalimat pendek di atas, cerita di bawah.' },
      { kicker: 'Langkah 4', title: 'Sosial dan foto', sub: 'Boleh dikosongkan. Foto tampil di kelas.' },
      { kicker: 'Langkah 5', title: 'Berapa murid yang kamu dampingi?', sub: 'Pilih rentang, bukan angka pasti.' },
      { kicker: 'Langkah 6', title: 'Tautan kelas', sub: 'Ini yang akan kamu bagikan. Bisa diubah sekarang.' }
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
      form.innerHTML = '<label for="head">Header</label><input id="head" maxlength="60" value="' + esc(draft.headline) + '">' +
        '<label for="bio">Bio</label><textarea id="bio" maxlength="800">' + esc(draft.biography) + '</textarea>';
    } else if (wizStep === 3) {
      const nets = [['website', 'Website'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['x', 'X']];
      form.innerHTML = nets.map((pair) =>
        '<label for="soc-' + pair[0] + '">' + pair[1] + '</label><input id="soc-' + pair[0] + '" value="' + esc(draft.socials[pair[0]] || '') + '">'
      ).join('') + '<label for="photo">Foto profil</label><input id="photo" type="file" accept="image/png,image/jpeg,image/webp">';
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
      form.innerHTML = '<p class="link-preview"><span>larisid.com/</span><span id="slug-show">' + esc(draft.slug || '…') + '</span></p>' +
        '<label for="slug">Ubah tautan</label><input id="slug" value="' + esc(draft.slug) + '" autocapitalize="off" spellcheck="false">' +
        '<p class="hint" id="slug-hint"></p>';
      $('slug').addEventListener('input', () => {
        draft.slug = slugify($('slug').value);
        $('slug-show').textContent = draft.slug || '…';
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
  function checkSlug() {
    clearTimeout(slugTimer);
    const slug = slugify(($('slug') && $('slug').value) || draft.slug);
    const hint = $('slug-hint');
    if (!hint) return;
    if (!slug) { hint.textContent = 'Pakai huruf dan angka, minimal 3.'; return; }
    slugTimer = setTimeout(async () => {
      const res = await fetch(API + '/slug/' + encodeURIComponent(slug));
      const data = await res.json().catch(() => ({}));
      if (!$('slug-hint')) return;
      if (data.status === 'free') $('slug-hint').textContent = 'Tautan ini masih kosong.';
      else if (data.status === 'taken') $('slug-hint').textContent = 'Tautan ini sudah dipakai.';
      else $('slug-hint').textContent = 'Tautan ini tidak bisa dipakai.';
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
      if (file) {
        if (file.size > 1400000) { err('wiz-err', 'Foto maksimal sekitar 1,4 MB.'); return; }
        draft.photo = await readFile(file);
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
