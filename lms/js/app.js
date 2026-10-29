/* Mentor class and student reader for /lms/. */
(function () {
  if (location.hostname === 'www.larisid.com') return;
  var $ = function (id) { return document.getElementById(id); };
  function oauthSnap() {
    var search = new URLSearchParams(location.search || '');
    var hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    return {
      code: search.get('code') || hash.get('code') || '',
      error: search.get('error_description') || hash.get('error_description') || search.get('error') || hash.get('error') || ''
    };
  }
  var oauth = oauthSnap();
  var oauthSettled = !(oauth.code || oauth.error);
  var routing = Promise.resolve();
  var busy = false;
  var mentorView = 'edit';
  var siswaTab = 'kurikulum';
  var lastPack = null;
  var lastMe = null;
  var lastSessions = [];
  var lastLink = null;
  var jadwalEdit = '';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function show(which) {
    var land = $('view-land');
    var authWrap = $('auth-wrap');
    var auth = $('view-auth');
    var register = $('view-register');
    var app = $('view-app');
    if (land) land.hidden = which !== 'land';
    if (authWrap) authWrap.hidden = which !== 'auth' && which !== 'register';
    if (auth) auth.hidden = which !== 'auth';
    if (register) register.hidden = which !== 'register';
    if (app) app.hidden = which !== 'app';
    window.scrollTo(0, 0);
  }
  function isStudentGate() {
    return !!(window.Lms.invite() || window.Lms.pathSlug());
  }
  function clearMentorSlug() {
    if (!window.Lms.pathSlug() && !window.Lms.invite()) window.Lms.setSchoolSlug('');
  }
  function stripOAuthQuery() {
    try {
      var q = new URLSearchParams(location.search || '');
      ['code', 'state', 'error', 'error_description', 'error_code'].forEach(function (key) { q.delete(key); });
      var next = location.pathname + (q.toString() ? '?' + q.toString() : '');
      history.replaceState({}, '', next);
    } catch (err) { /* ignore */ }
    document.documentElement.removeAttribute('data-lms-oauth');
  }
  function setAuthMode(mode) {
    var signup = mode !== 'login';
    var student = isStudentGate();
    var title = $('auth-title');
    var sub = $('auth-subtitle');
    var submit = $('email-submit');
    var google = $('auth-google-label');
    var toggle = $('auth-toggle-text');
    var nameLabel = $('name-label');
    var name = $('full-name');
    var back = $('auth-back');
    if (back) back.hidden = !!student;
    if (title) {
      title.textContent = student
        ? (signup ? 'Buat akun siswa' : 'Masuk ke kelas')
        : (signup ? 'Buat akun mentor' : 'Masuk sebagai mentor');
    }
    if (sub) {
      sub.textContent = student
        ? (window.Lms.invite()
          ? 'Undangan ini membuka kurikulum mentor yang mengundang kamu.'
          : 'Masuk untuk lanjut ke kelas mentor kamu.')
        : 'Akun khusus untuk mengajar di halaman ini.';
    }
    if (submit) submit.textContent = signup ? 'Daftar dengan email' : 'Masuk';
    if (google) google.textContent = signup ? 'Daftar dengan Google' : 'Masuk dengan Google';
    if (nameLabel) nameLabel.hidden = !signup;
    if (name) name.hidden = !signup;
    var password = $('password');
    if (password) password.autocomplete = signup ? 'new-password' : 'current-password';
    if (toggle) {
      toggle.innerHTML = signup
        ? 'Sudah punya akun? <a id="email-mode" role="button" tabindex="0">Masuk</a>'
        : 'Belum punya akun? <a id="email-mode" role="button" tabindex="0">Daftar</a>';
      bindModeToggle();
    }
    window.Lms.setIntent(student ? 'student' : 'mentor');
  }
  function bindModeToggle() {
    var link = $('email-mode');
    if (!link || link.dataset.bound) return;
    link.dataset.bound = '1';
    link.addEventListener('click', function () {
      var signup = ($('email-submit') || {}).textContent !== 'Masuk';
      setAuthMode(signup ? 'login' : 'signup');
    });
  }
  function authError(msg) {
    var el = $('auth-err');
    if (el) el.textContent = msg || '';
  }
  function registerError(msg) {
    var el = $('register-err');
    if (el) el.textContent = msg || '';
  }
  function appError(msg) {
    var el = $('app-err');
    if (el) el.textContent = msg || '';
  }

  var DEFAULT_ICON = '/images/brand/appicon-bird.png';
  function brandTitle(org) {
    var name = String(org || '').trim() || 'Kelas';
    return 'LMS (' + name + ')';
  }
  function setMeta(property, content, isName) {
    if (!content) return;
    var sel = isName
      ? 'meta[name="' + property + '"]'
      : 'meta[property="' + property + '"]';
    var el = document.head.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      if (isName) el.setAttribute('name', property);
      else el.setAttribute('property', property);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }
  function setIcon(href) {
    var links = document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]');
    if (!links.length) {
      var icon = document.createElement('link');
      icon.rel = 'icon';
      icon.href = href;
      document.head.appendChild(icon);
      var apple = document.createElement('link');
      apple.rel = 'apple-touch-icon';
      apple.href = href;
      document.head.appendChild(apple);
      return;
    }
    Array.prototype.forEach.call(links, function (link) {
      link.setAttribute('href', href);
    });
  }
  function applyBrand(brand) {
    var org = brand && (brand.org_name || brand.display_name);
    var title = (brand && brand.brand_title) || brandTitle(org);
    var avatar = (brand && brand.avatar_url) || DEFAULT_ICON;
    if (brand && brand.org_slug) window.Lms.setSchoolSlug(brand.org_slug);
    document.title = title;
    setMeta('og:title', title);
    setMeta('og:site_name', 'LMS');
    setMeta('og:image', avatar);
    setMeta('twitter:title', title, true);
    setMeta('twitter:image', avatar, true);
    setMeta('apple-mobile-web-app-title', title, true);
    setIcon(avatar);
    var authBrand = $('auth-brand');
    if (authBrand && org) authBrand.textContent = title;
  }
  function ensureSchoolPath(slug) {
    var s = String(slug || '').trim();
    if (!s) return;
    var want = window.Lms.schoolPath(s);
    if (location.pathname === want || location.pathname === want.replace(/\/$/, '')) return;
    try { history.replaceState({}, '', want); } catch (err) { /* ignore */ }
  }
  function paintSchoolBrand() {
    if (!window.LmsApi) return;
    var token = window.Lms.invite();
    if (token && window.LmsApi.inviteBrand) {
      window.LmsApi.inviteBrand(token).then(function (brand) {
        if (!brand) return;
        applyBrand(brand);
        if (brand.org_slug) ensureSchoolPath(brand.org_slug);
      }).catch(function () { /* keep default */ });
      return;
    }
    var slug = window.Lms.pathSlug();
    if (!slug || !window.LmsApi.orgBrand) return;
    window.LmsApi.orgBrand(slug).then(function (brand) {
      if (brand) applyBrand(brand);
      else authError('Kelas ini tidak ditemukan. Cek tautan dari mentor.');
    }).catch(function () { /* keep default */ });
  }

  function lessonsOf(pack, moduleId) {
    return (pack.lessons || []).filter(function (row) { return row.module_id === moduleId; })
      .sort(function (a, b) { return (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at)); });
  }
  function fileOf(pack, lessonId) {
    return (pack.files || []).filter(function (row) { return row.lesson_id === lessonId; })[0] || null;
  }

  function publishedPack(pack) {
    var lessons = (pack.lessons || []).filter(function (row) { return !!row.published; });
    var ids = {};
    lessons.forEach(function (row) { ids[row.module_id] = 1; });
    return {
      modules: (pack.modules || []).filter(function (mod) { return ids[mod.id]; }),
      lessons: lessons,
      files: (pack.files || []).filter(function (file) {
        return lessons.some(function (lesson) { return lesson.id === file.lesson_id; });
      })
    };
  }
  function studentHtml(pack, opts) {
    opts = opts || {};
    var mods = (pack.modules || []).slice().sort(function (a, b) {
      return (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at));
    });
    if (!mods.length) {
      return '<p class="muted">' +
        (opts.empty || 'Mentor belum menayangkan pelajaran.') +
        '</p>';
    }
    return mods.map(function (mod) {
      var lessons = lessonsOf(pack, mod.id);
      if (!lessons.length) return '';
      var body = lessons.map(function (lesson) {
        var file = fileOf(pack, lesson.id);
        var fileBtn = file
          ? '<button type="button" class="btn btn-white" data-act="open-file" data-id="' + esc(file.id) + '">Buka berkas</button>'
          : '';
        return '<article class="lesson">' +
          '<h3>' + esc(lesson.title) + '</h3>' +
          (lesson.body ? '<p class="lesson-body">' + esc(lesson.body) + '</p>' : '') +
          fileBtn +
          '</article>';
      }).join('');
      return '<section class="card"><h2>' + esc(mod.title) + '</h2>' + body + '</section>';
    }).join('');
  }
  function siswaTabHtml(tab, pack) {
    if (tab === 'alat') {
      return '<div class="siswa-empty">' +
        '<strong>Alat</strong>' +
        '<p>Nanti di sini siswa membuka alat kelas (kalkulator, template, tautan kerja).</p>' +
        '</div>';
    }
    if (tab === 'progres') {
      var n = (pack.lessons || []).length;
      return '<div class="siswa-empty">' +
        '<strong>Progres</strong>' +
        '<p>' + (n ? (n + ' pelajaran tayang. Progress per siswa menyusul.') : 'Belum ada pelajaran tayang.') + '</p>' +
        '</div>';
    }
    return studentHtml(pack, {
      empty: 'Belum ada pelajaran yang ditayangkan. Centang “Tayang ke siswa” di editor.'
    }) || '<p class="muted">Belum ada pelajaran yang ditayangkan.</p>';
  }
  function paintSiswaPreview(me, pack) {
    var pub = publishedPack(pack || { modules: [], lessons: [], files: [] });
    var org = (me && (me.org_name || me.display_name)) || 'Kelas';
    var avatar = (me && me.avatar_url) || DEFAULT_ICON;
    var orgEl = $('siswa-preview-org');
    var avEl = $('siswa-preview-avatar');
    var body = $('siswa-preview-body');
    var tabs = $('siswa-preview-tabs');
    if (orgEl) orgEl.textContent = org;
    if (avEl) avEl.src = avatar;
    if (tabs) {
      Array.prototype.forEach.call(tabs.querySelectorAll('[data-siswa-tab]'), function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-siswa-tab') === siswaTab);
      });
    }
    if (body) {
      body.innerHTML = siswaTabHtml(siswaTab, pub);
      bindReader(body, pub);
    }
  }
  function jakartaParts(iso) {
    var d = iso ? new Date(iso) : new Date();
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(d);
    function get(type) {
      var hit = parts.filter(function (part) { return part.type === type; })[0];
      return hit ? hit.value : '';
    }
    return {
      date: get('year') + '-' + get('month') + '-' + get('day'),
      time: get('hour') + ':' + get('minute')
    };
  }
  function jakartaISO(date, time) {
    return new Date(String(date) + 'T' + String(time || '00:00') + ':00+07:00').toISOString();
  }
  function fmtWhen(iso) {
    try {
      return new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso)) + ' WIB';
    } catch (err) { return ''; }
  }
  function icsEscape(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\n|\r/g, '\\n');
  }
  function icsStamp(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function googleCalUrl(session) {
    var start = new Date(session.starts_at).getTime();
    var end = start + (Number(session.mins) || 60) * 60000;
    var q = new URLSearchParams();
    q.set('action', 'TEMPLATE');
    q.set('text', session.title || 'Sesi kelas');
    q.set('dates', icsStamp(start) + '/' + icsStamp(end));
    var details = [session.notes || '', session.meet_url || ''].filter(Boolean).join('\n');
    if (details) q.set('details', details);
    if (session.location) q.set('location', session.location);
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  function oneIcs(session) {
    var start = new Date(session.starts_at).getTime();
    var end = start + (Number(session.mins) || 60) * 60000;
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LarisID//LMS Calendar//ID',
      'BEGIN:VEVENT',
      'UID:' + session.id + '@larisid-lms',
      'DTSTAMP:' + icsStamp(Date.now()),
      'DTSTART:' + icsStamp(start),
      'DTEND:' + icsStamp(end),
      'SUMMARY:' + icsEscape(session.title || 'Sesi kelas')
    ];
    var desc = [session.notes || '', session.meet_url ? 'Meet: ' + session.meet_url : ''].filter(Boolean).join('\n\n');
    if (desc) lines.push('DESCRIPTION:' + icsEscape(desc));
    if (session.location) lines.push('LOCATION:' + icsEscape(session.location));
    if (session.meet_url) lines.push('URL:' + icsEscape(session.meet_url));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }
  function downloadText(name, text) {
    var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function sessionById(id) {
    return (lastSessions || []).filter(function (row) { return row.id === id; })[0] || null;
  }
  function syncBarHtml() {
    if (!lastLink || !lastLink.https) {
      return '<p class="muted">Tautan kalender belum siap. Muat ulang halaman ini.</p>';
    }
    return '<div class="cal-sync">' +
      '<p class="muted">Tempel tautan ini sekali. Google Calendar: Kalender lain → Dari URL. Apple Calendar: File → Langganan Kalender Baru. Di iPhone, buka tautan Apple.</p>' +
      '<label>Tautan langganan</label>' +
      '<div class="row">' +
        '<input class="cal-url" readonly value="' + esc(lastLink.https) + '">' +
        '<button type="button" class="btn btn-white" data-act="cal-copy">Salin</button>' +
        '<a class="btn btn-white" href="' + esc(lastLink.webcal || lastLink.https) + '">Apple Calendar</a>' +
        '<button type="button" class="btn btn-white" data-act="cal-ics-all">Unduh semua .ics</button>' +
      '</div>' +
      '<p class="muted">Hanya untuk kamu dan siswa kelas ini. Kalender ikut berubah saat jadwal diubah.</p>' +
    '</div>';
  }
  function sessionRowHtml(session, editable) {
    var meet = session.meet_url
      ? '<a class="btn btn-white" href="' + esc(session.meet_url) + '" target="_blank" rel="noopener">Meet</a>'
      : '';
    var edits = editable
      ? '<button type="button" class="btn btn-white" data-act="cal-edit" data-id="' + esc(session.id) + '">Edit</button>' +
        '<button type="button" class="btn btn-white" data-act="cal-del" data-id="' + esc(session.id) + '">Hapus</button>'
      : '';
    return '<article class="lesson cal-row">' +
      '<h3>' + esc(session.title) + '</h3>' +
      '<p class="muted">' + esc(fmtWhen(session.starts_at)) + ' · ' + esc(String(session.mins || 60)) + ' menit' +
        (session.location ? ' · ' + esc(session.location) : '') + '</p>' +
      (session.notes ? '<p class="lesson-body">' + esc(session.notes) + '</p>' : '') +
      '<div class="row">' +
        '<a class="btn btn-white" href="' + esc(googleCalUrl(session)) + '" target="_blank" rel="noopener">Google Calendar</a>' +
        '<button type="button" class="btn btn-white" data-act="cal-ics" data-id="' + esc(session.id) + '">Apple / .ics</button>' +
        meet + edits +
      '</div></article>';
  }
  function jadwalFormHtml() {
    var current = jadwalEdit ? sessionById(jadwalEdit) : null;
    var when = current ? jakartaParts(current.starts_at) : jakartaParts(new Date().toISOString());
    if (!current) when.time = '19:30';
    var mins = current ? Number(current.mins) || 60 : 60;
    var choices = [30, 45, 60, 90, 120];
    if (choices.indexOf(mins) < 0) choices.push(mins);
    return '<form id="jadwal-form" class="card">' +
      '<h2>' + (current ? 'Edit acara' : 'Acara baru') + '</h2>' +
      '<input type="hidden" name="id" value="' + esc(current ? current.id : '') + '">' +
      '<label>Judul<input name="title" required maxlength="120" value="' + esc(current ? current.title : '') + '"></label>' +
      '<div class="row2">' +
        '<label>Tanggal<input name="date" type="date" required value="' + esc(when.date) + '"></label>' +
        '<label>Jam (WIB)<input name="time" type="time" required value="' + esc(when.time) + '"></label>' +
      '</div>' +
      '<label>Durasi<select name="mins">' +
        choices.map(function (n) {
          return '<option value="' + n + '"' + (n === mins ? ' selected' : '') + '>' + n + ' menit</option>';
        }).join('') +
      '</select></label>' +
      '<label>Tautan Meet / Zoom<input name="meet" placeholder="https://meet.google.com/…" value="' + esc(current ? current.meet_url : '') + '"></label>' +
      '<label>Lokasi<input name="location" maxlength="160" value="' + esc(current ? current.location : '') + '" placeholder="Online"></label>' +
      '<label>Catatan<textarea name="notes" maxlength="2000">' + esc(current ? current.notes : '') + '</textarea></label>' +
      '<div class="row">' +
        '<button type="submit" class="btn btn-red">' + (current ? 'Simpan acara' : 'Tambah acara') + '</button>' +
        (current ? '<button type="button" class="btn btn-white" data-act="cal-edit-cancel">Batal</button>' : '') +
      '</div></form>';
  }
  function scheduleHtml(editable) {
    var list = (lastSessions || []).slice().sort(function (a, b) {
      return String(a.starts_at).localeCompare(String(b.starts_at));
    });
    var rows = list.map(function (session) { return sessionRowHtml(session, editable); }).join('');
    return '<section class="card cal-card"><h2>Jadwal</h2>' + syncBarHtml() +
      (rows || '<p class="muted">Belum ada sesi.</p>') +
      '</section>' +
      (editable ? jadwalFormHtml() : '');
  }
  function hideJadwal() {
    if ($('jadwal')) $('jadwal').hidden = true;
  }
  function setMentorView(mode) {
    mentorView = mode === 'siswa' ? 'siswa' : mode === 'jadwal' ? 'jadwal' : 'edit';
    var toggle = $('mentor-view-toggle');
    if (toggle) {
      Array.prototype.forEach.call(toggle.querySelectorAll('[data-mentor-view]'), function (btn) {
        btn.classList.toggle('is-on', btn.getAttribute('data-mentor-view') === mentorView);
      });
    }
    if (!lastMe || lastMe.role !== 'mentor') return;
    if (mentorView === 'siswa') {
      $('kurikulum').hidden = true;
      hideJadwal();
      $('reader').hidden = false;
      $('reader').innerHTML =
        '<p class="siswa-full-hint">Ini layar siswa — hanya pelajaran yang sudah ditayangkan.</p>' +
        scheduleHtml(false) +
        siswaTabHtml('kurikulum', publishedPack(lastPack || { modules: [], lessons: [], files: [] }));
      bindReader($('reader'), publishedPack(lastPack || { modules: [], lessons: [], files: [] }));
    } else if (mentorView === 'jadwal') {
      $('kurikulum').hidden = true;
      $('reader').hidden = true;
      if ($('jadwal')) {
        $('jadwal').hidden = false;
        $('jadwal').innerHTML = scheduleHtml(true);
      }
    } else {
      $('kurikulum').hidden = false;
      $('reader').hidden = true;
      hideJadwal();
      $('kurikulum').innerHTML = mentorHtml(lastPack || { modules: [], lessons: [], files: [] });
      bindMentor($('kurikulum'), lastPack || { modules: [], lessons: [], files: [] });
    }
  }

  function mentorHtml(pack) {
    var mods = (pack.modules || []).slice().sort(function (a, b) {
      return (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at));
    });
    var list = mods.map(function (mod) {
      var lessons = lessonsOf(pack, mod.id).map(function (lesson) {
        var file = fileOf(pack, lesson.id);
        var fileRow = file
          ? '<p class="file-row"><span>' + esc(file.name) + '</span> ' +
            '<button type="button" class="btn btn-white" data-act="open-file" data-id="' + esc(file.id) + '">Buka</button> ' +
            '<button type="button" class="btn btn-white" data-act="delete-file" data-id="' + esc(file.id) + '">Hapus berkas</button></p>'
          : '<label class="btn btn-white file-btn">Tambah berkas<input type="file" data-file="' + esc(lesson.id) + '"></label>';
        return '<article class="lesson" data-lesson="' + esc(lesson.id) + '">' +
          '<label>Judul<input data-field="title" value="' + esc(lesson.title) + '" maxlength="120"></label>' +
          '<label>Isi<textarea data-field="body" maxlength="8000">' + esc(lesson.body || '') + '</textarea></label>' +
          '<label class="check"><input data-field="published" type="checkbox"' + (lesson.published ? ' checked' : '') + '> Tayang ke siswa</label>' +
          fileRow +
          '<div class="row">' +
            '<button type="button" class="btn btn-red" data-act="save-lesson" data-id="' + esc(lesson.id) + '">Simpan</button>' +
            '<button type="button" class="btn btn-white" data-act="delete-lesson" data-id="' + esc(lesson.id) + '">Hapus</button>' +
          '</div></article>';
      }).join('');
      return '<section class="card" data-module="' + esc(mod.id) + '">' +
        '<div class="card-head"><h2>' + esc(mod.title) + '</h2>' +
        '<button type="button" class="btn btn-white" data-act="delete-module" data-id="' + esc(mod.id) + '">Hapus modul</button></div>' +
        lessons +
        '<form class="lesson-add" data-add-lesson="' + esc(mod.id) + '">' +
          '<h3>Pelajaran baru</h3>' +
          '<label>Judul<input name="title" required maxlength="120"></label>' +
          '<label>Isi<textarea name="body" maxlength="8000"></textarea></label>' +
          '<label class="check"><input name="published" type="checkbox"> Tayang ke siswa</label>' +
          '<button type="submit" class="btn btn-red">Tambah pelajaran</button>' +
        '</form></section>';
    }).join('');
    return (list || '<p class="muted">Belum ada modul.</p>') +
      '<form id="mod-form" class="card">' +
        '<h2>Modul baru</h2>' +
        '<label>Judul<input name="title" required maxlength="120"></label>' +
        '<button type="submit" class="btn btn-red">Tambah modul</button>' +
      '</form>';
  }

  function render(me, pack, people, sessions, link) {
    var mentor = me.role === 'mentor';
    lastMe = me;
    lastPack = pack;
    lastSessions = sessions || [];
    lastLink = link || null;
    applyBrand(me);
    if (me.org_slug) ensureSchoolPath(me.org_slug);
    $('app-kicker').textContent = mentor ? 'Mentor' : 'Siswa';
    $('app-name').textContent = mentor
      ? (me.org_name || me.display_name)
      : (me.org_name || me.mentor_name);
    $('app-sub').textContent = mentor
      ? 'Siswa yang kamu undang hanya melihat pelajaran yang ditayangkan.'
      : 'Kurikulum ' + (me.mentor_name || 'mentor') + '. Kelas mentor lain tidak terbuka.';
    $('mentor-col').hidden = !mentor;
    $('view-app').classList.toggle('is-student', !mentor);
    var toggle = $('mentor-view-toggle');
    if (toggle) toggle.hidden = !mentor;
    if (mentor) {
      var names = (people || []).map(function (row) { return '<li>' + esc(row.display_name) + '</li>'; }).join('');
      $('student-list').innerHTML = names || '<li class="muted">Belum ada siswa.</li>';
      var orgInput = $('brand-org');
      var slugInput = $('brand-slug');
      var schoolUrl = $('school-url');
      var preview = $('brand-avatar-preview');
      if (orgInput) orgInput.value = me.org_name || me.display_name || '';
      if (slugInput) slugInput.value = me.org_slug || '';
      if (schoolUrl) schoolUrl.value = window.Lms.schoolUrl(me.org_slug || '');
      if (preview) {
        if (me.avatar_url) {
          preview.src = me.avatar_url;
          preview.dataset.url = me.avatar_url;
        } else {
          preview.src = DEFAULT_ICON;
          delete preview.dataset.url;
        }
        preview.hidden = false;
      }
      paintSiswaPreview(me, pack);
      setMentorView(mentorView);
    } else {
      if (toggle) toggle.hidden = true;
      $('kurikulum').hidden = true;
      hideJadwal();
      $('reader').hidden = false;
      $('reader').innerHTML = scheduleHtml(false) + studentHtml(pack);
      bindReader($('reader'), pack);
    }
  }

  function bindReader(root, pack) {
    root.onclick = function (event) {
      var btn = event.target.closest('[data-act="open-file"]');
      if (!btn) return;
      var file = (pack.files || []).filter(function (row) { return row.id === btn.getAttribute('data-id'); })[0];
      if (!file) return;
      window.LmsApi.openMaterial(file).catch(function (err) { appError(window.Lms.errorText(err)); });
    };
  }

  function pendingInvite(session) {
    var stored = window.Lms.invite();
    if (stored) return stored;
    var meta = session && session.user && session.user.user_metadata;
    return (meta && meta.lms_invite) || '';
  }

  function bindMentor(root, pack) {
    root.onsubmit = function (event) {
      var lessonForm = event.target.closest('[data-add-lesson]');
      if (lessonForm) {
        event.preventDefault();
        var data = new FormData(lessonForm);
        var moduleId = lessonForm.getAttribute('data-add-lesson');
        var count = lessonsOf(pack, moduleId).length;
        run(function () {
          return window.LmsApi.addLesson(moduleId, String(data.get('title') || ''), String(data.get('body') || ''), !!data.get('published'), count);
        });
        return;
      }
      if (event.target.id === 'mod-form') {
        event.preventDefault();
        var title = new FormData(event.target).get('title');
        run(function () {
          return window.LmsApi.addModule(String(title || ''), (pack.modules || []).length);
        });
      }
    };
    root.onclick = function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var id = btn.getAttribute('data-id');
      if (act === 'save-lesson') {
        var card = btn.closest('[data-lesson]');
        run(function () {
          return window.LmsApi.saveLesson(
            id,
            card.querySelector('[data-field="title"]').value,
            card.querySelector('[data-field="body"]').value,
            card.querySelector('[data-field="published"]').checked
          );
        });
      } else if (act === 'delete-lesson') {
        if (!confirm('Hapus pelajaran ini?')) return;
        run(function () { return window.LmsApi.deleteLesson(id); });
      } else if (act === 'delete-module') {
        if (!confirm('Hapus modul ini beserta pelajarannya?')) return;
        run(function () { return window.LmsApi.deleteModule(id); });
      } else if (act === 'delete-file') {
        if (!confirm('Hapus berkas ini?')) return;
        run(function () { return window.LmsApi.deleteMaterial(id); });
      } else if (act === 'open-file') {
        var file = (pack.files || []).filter(function (row) { return row.id === id; })[0];
        if (!file) return;
        window.LmsApi.openMaterial(file).catch(function (err) { appError(window.Lms.errorText(err)); });
      }
    };
    root.onchange = function (event) {
      var input = event.target.closest('[data-file]');
      if (!input || !input.files || !input.files[0]) return;
      var lessonId = input.getAttribute('data-file');
      var file = input.files[0];
      run(function () { return window.LmsApi.uploadMaterial(lessonId, file); });
    };
  }

  async function loadApp(me) {
    appError('');
    var pack = await window.LmsApi.curriculum();
    var people = me.role === 'mentor' ? await window.LmsApi.students() : [];
    var sessions = [];
    var link = null;
    try {
      var both = await Promise.all([
        window.LmsApi.listSessions(),
        window.LmsApi.calendarLink()
      ]);
      sessions = both[0] || [];
      link = both[1];
    } catch (err) {
      appError(window.Lms.errorText(err));
    }
    render(me, pack, people, sessions, link);
    show('app');
  }

  async function routeNow(session) {
    if (!session) {
      if (!oauthSettled) {
        show('auth');
        setAuthMode('login');
        authError(oauth.error ? window.Lms.errorText({ message: oauth.error }) : 'Sedang masuk…');
        return;
      }
      if (isStudentGate()) {
        show('auth');
        setAuthMode(window.Lms.invite() ? 'signup' : 'login');
      } else {
        show('land');
      }
      return;
    }
    var me = await window.LmsApi.me();
    var freshInvite = window.Lms.invite();
    var invite = freshInvite || pendingInvite(session);
    if (me) {
      window.Lms.clearInvite();
      if (session.user && session.user.user_metadata && session.user.user_metadata.lms_invite) {
        window.Lms.sb.auth.updateUser({ data: { lms_invite: null } }).catch(function () {});
      }
      await loadApp(me);
      if (freshInvite && me.role === 'mentor') appError('Akun ini sudah mentor. Undangannya tidak dipakai.');
      if (freshInvite && me.role === 'student') appError('Kamu sudah masuk di kelas mentor kamu. Undangannya tidak dipakai.');
      return;
    }
    if (invite) {
      try {
        me = await window.LmsApi.acceptInvite(invite, window.Lms.pendingName());
        window.Lms.clearInvite();
        window.Lms.sb.auth.updateUser({ data: { lms_invite: null } }).catch(function () {});
        await loadApp(me);
      } catch (err) {
        var text = window.Lms.errorText(err);
        if (String(err && err.message || '').indexOf('lms_exists') >= 0) {
          me = await window.LmsApi.me();
          if (me) {
            window.Lms.clearInvite();
            await loadApp(me);
            return;
          }
        }
        show('auth');
        setAuthMode('login');
        authError(text);
      }
      return;
    }
    if (window.Lms.pathSlug()) {
      show('auth');
      setAuthMode('login');
      authError('Akun ini belum gabung kelas. Minta tautan undangan baru dari mentor.');
      return;
    }
    show('register');
    var pending = window.Lms.pendingName();
    if (pending && $('mentor-name') && !$('mentor-name').value) $('mentor-name').value = pending;
  }

  function route(session) {
    routing = routing.then(function () { return routeNow(session); }).catch(function (err) {
      authError(window.Lms.errorText(err));
      show('auth');
    });
  }

  function run(work) {
    if (busy) return;
    busy = true;
    appError('');
    work().then(function () {
      return window.Lms.sb.auth.getSession();
    }).then(function (res) {
      busy = false;
      return routeNow(res.data.session);
    }).catch(function (err) {
      busy = false;
      appError(window.Lms.errorText(err));
    });
  }

  function selectShot(id) {
    if (!id) return;
    document.querySelectorAll('[data-shot]').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.getAttribute('data-shot') === id ? 'true' : 'false');
    });
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      var on = panel.getAttribute('data-panel') === id;
      panel.hidden = !on;
      var stage = panel.querySelector('.stage');
      if (!stage) return;
      stage.classList.remove('is-play');
      if (on) {
        void stage.offsetWidth;
        stage.classList.add('is-play');
      }
    });
  }

  function boot() {
    if (!window.Lms || !window.Lms.sb) {
      show('auth');
      authError('Gagal memuat koneksi. Muat ulang halaman ini.');
      return;
    }
    setAuthMode(window.Lms.invite() ? 'signup' : (window.Lms.pathSlug() ? 'login' : 'signup'));
    document.querySelectorAll('[data-shot]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectShot(btn.getAttribute('data-shot'));
      });
    });
    document.querySelectorAll('[data-start]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearMentorSlug();
        window.Lms.setIntent('mentor');
        setAuthMode('signup');
        show('auth');
      });
    });
    document.querySelectorAll('[data-login]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearMentorSlug();
        window.Lms.setIntent(isStudentGate() ? 'student' : 'mentor');
        setAuthMode('login');
        show('auth');
      });
    });
    $('auth-back').addEventListener('click', function () {
      authError('');
      show(isStudentGate() ? 'auth' : 'land');
    });
    $('google-btn').addEventListener('click', function () {
      var name = $('full-name') && !$('full-name').hidden ? $('full-name').value : '';
      window.Lms.setPendingName(name);
      clearMentorSlug();
      window.Lms.setIntent(isStudentGate() ? 'student' : 'mentor');
      authError('Sedang masuk…');
      window.Lms.sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.Lms.redirectTo() }
      }).then(function (res) {
        if (res.error) authError(window.Lms.errorText(res.error));
      });
    });
    $('email-form').addEventListener('submit', function (event) {
      event.preventDefault();
      authError('');
      var signup = ($('email-submit') || {}).textContent !== 'Masuk';
      var email = $('email').value.trim();
      var password = $('password').value;
      var name = $('full-name').value.trim();
      if (signup && !name) {
        authError('Isi nama.');
        return;
      }
      window.Lms.setPendingName(name);
      var call = signup
        ? window.Lms.sb.auth.signUp({
          email: email,
          password: password,
          options: {
            emailRedirectTo: window.Lms.redirectTo(),
            data: {
              full_name: name,
              lms_invite: window.Lms.invite() || null,
              lms_slug: window.Lms.pathSlug() || null
            }
          }
        })
        : window.Lms.sb.auth.signInWithPassword({ email: email, password: password });
      call.then(function (res) {
        if (res.error) {
          authError(window.Lms.errorText(res.error));
          return;
        }
        if (signup && !(res.data && res.data.session)) {
          authError('Cek email untuk mengaktifkan akun, lalu masuk di halaman ini.');
          return;
        }
        route(res.data.session);
      });
    });
    $('register-form').addEventListener('submit', function (event) {
      event.preventDefault();
      registerError('');
      var name = $('mentor-name').value.trim();
      var org = ($('mentor-org') && $('mentor-org').value.trim()) || name;
      window.LmsApi.registerMentor(name, org).then(function (me) {
        window.Lms.setPendingName('');
        return loadApp(me);
      }).catch(function (err) {
        registerError(window.Lms.errorText(err));
      });
    });
    $('register-out').addEventListener('click', signOut);
    $('app-out').addEventListener('click', signOut);
    if ($('brand-form')) {
      $('brand-form').addEventListener('submit', function (event) {
        event.preventDefault();
        var org = ($('brand-org') && $('brand-org').value.trim()) || '';
        var slug = ($('brand-slug') && $('brand-slug').value.trim()) || '';
        run(function () {
          return window.LmsApi.updateBrand(org, null, slug || null).then(function (me) {
            applyBrand(me);
            if (me && me.org_slug) {
              ensureSchoolPath(me.org_slug);
              if ($('brand-slug')) $('brand-slug').value = me.org_slug;
              if ($('school-url')) $('school-url').value = window.Lms.schoolUrl(me.org_slug);
            }
          });
        });
      });
    }
    if ($('school-url-copy')) {
      $('school-url-copy').addEventListener('click', function () {
        var url = $('school-url') && $('school-url').value;
        if (!url) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            $('school-url-copy').textContent = 'Tersalin';
            setTimeout(function () { $('school-url-copy').textContent = 'Salin'; }, 1600);
          }).catch(function () {
            $('school-url').focus();
            $('school-url').select();
          });
        } else {
          $('school-url').focus();
          $('school-url').select();
        }
      });
    }
    if ($('siswa-preview-tabs')) {
      $('siswa-preview-tabs').addEventListener('click', function (event) {
        var btn = event.target.closest('[data-siswa-tab]');
        if (!btn) return;
        siswaTab = btn.getAttribute('data-siswa-tab') || 'kurikulum';
        paintSiswaPreview(lastMe, lastPack || { modules: [], lessons: [], files: [] });
      });
    }
    if ($('siswa-preview-open')) {
      $('siswa-preview-open').addEventListener('click', function () {
        siswaTab = 'kurikulum';
        setMentorView('siswa');
        window.scrollTo(0, 0);
      });
    }
    if ($('mentor-view-toggle')) {
      $('mentor-view-toggle').addEventListener('click', function (event) {
        var btn = event.target.closest('[data-mentor-view]');
        if (!btn) return;
        setMentorView(btn.getAttribute('data-mentor-view'));
      });
    }
    if ($('brand-avatar-file')) {
      $('brand-avatar-file').addEventListener('change', function () {
        var file = $('brand-avatar-file').files && $('brand-avatar-file').files[0];
        if (!file) return;
        appError('');
        window.LmsApi.uploadAvatar(file).then(function (shot) {
          var url = shot && (shot.url || shot);
          var display = shot && (shot.display || url);
          var preview = $('brand-avatar-preview');
          if (preview) {
            preview.src = display;
            preview.dataset.url = url;
            preview.hidden = false;
          }
          var org = ($('brand-org') && $('brand-org').value.trim()) || '';
          var slug = ($('brand-slug') && $('brand-slug').value.trim()) || '';
          return window.LmsApi.updateBrand(org, url, slug || null).then(function (me) {
            applyBrand(me);
          });
        }).catch(function (err) {
          appError(window.Lms.errorText(err));
        });
      });
    }
    $('invite-btn').addEventListener('click', function () {
      appError('');
      window.LmsApi.createInvite().then(function (row) {
        var url = window.Lms.inviteShareUrl(row.token);
        $('invite-url').value = url;
        $('invite-box').hidden = false;
      }).catch(function (err) {
        appError(window.Lms.errorText(err));
      });
    });
    $('invite-copy').addEventListener('click', function () {
      var url = $('invite-url').value;
      if (!url) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          $('invite-copy').textContent = 'Tersalin';
        }).catch(function () {
          $('invite-url').focus();
          $('invite-url').select();
        });
      } else {
        $('invite-url').focus();
        $('invite-url').select();
      }
    });

    if ($('view-app')) {
      $('view-app').addEventListener('click', function (event) {
        var btn = event.target.closest('[data-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-act');
        if (act === 'cal-copy') {
          var box = btn.closest('.cal-sync');
          var input = box && box.querySelector('.cal-url');
          var url = input ? input.value : '';
          if (!url) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              btn.textContent = 'Tersalin';
              setTimeout(function () { btn.textContent = 'Salin'; }, 1600);
            }).catch(function () {
              input.focus();
              input.select();
            });
          } else {
            input.focus();
            input.select();
          }
          return;
        }
        if (act === 'cal-ics') {
          var one = sessionById(btn.getAttribute('data-id'));
          if (!one) return;
          downloadText(String(one.title || 'sesi').replace(/[^\w.-]+/g, '-').slice(0, 40) + '.ics', oneIcs(one));
          return;
        }
        if (act === 'cal-ics-all') {
          if (!lastLink || !lastLink.https) return;
          fetch(lastLink.https).then(function (res) {
            if (!res.ok) throw new Error('lms_session');
            return res.text();
          }).then(function (text) {
            downloadText('jadwal-lms.ics', text);
          }).catch(function (err) {
            appError(window.Lms.errorText(err));
          });
          return;
        }
        if (act === 'cal-edit') {
          jadwalEdit = btn.getAttribute('data-id') || '';
          setMentorView('jadwal');
          return;
        }
        if (act === 'cal-edit-cancel') {
          jadwalEdit = '';
          setMentorView('jadwal');
          return;
        }
        if (act === 'cal-del') {
          var id = btn.getAttribute('data-id');
          if (!id || !confirm('Hapus acara ini dari jadwal?')) return;
          if (jadwalEdit === id) jadwalEdit = '';
          run(function () { return window.LmsApi.deleteSession(id); });
        }
      });
      $('view-app').addEventListener('submit', function (event) {
        var form = event.target;
        if (!form || form.id !== 'jadwal-form') return;
        event.preventDefault();
        appError('');
        var data = new FormData(form);
        var title = String(data.get('title') || '').trim();
        var date = String(data.get('date') || '');
        var time = String(data.get('time') || '');
        if (!title || !date || !time) {
          appError('Isi judul, tanggal, dan jam.');
          return;
        }
        var id = String(data.get('id') || '') || null;
        jadwalEdit = '';
        run(function () {
          return window.LmsApi.upsertSession({
            id: id,
            title: title,
            starts_at: jakartaISO(date, time),
            mins: Number(data.get('mins')) || 60,
            meet_url: String(data.get('meet') || '').trim(),
            location: String(data.get('location') || '').trim(),
            notes: String(data.get('notes') || '').trim()
          });
        });
      });
    }

    paintSchoolBrand();
    if (oauth.code || oauth.error) {
      show('auth');
      setAuthMode('login');
      authError(oauth.error ? window.Lms.errorText({ message: oauth.error }) : 'Sedang masuk…');
    } else if (isStudentGate()) {
      show('auth');
      setAuthMode(window.Lms.invite() ? 'signup' : 'login');
    }
    function finishOAuth(session, errMsg) {
      oauthSettled = true;
      if (oauth.code || oauth.error) stripOAuthQuery();
      if (errMsg) {
        show('auth');
        setAuthMode('login');
        authError(errMsg);
        return;
      }
      route(session);
    }
    window.Lms.sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (session) return finishOAuth(session);
      if (oauth.error) return finishOAuth(null, window.Lms.errorText({ message: oauth.error }));
      if (!oauth.code) {
        oauthSettled = true;
        var authOpen = $('view-auth') && !$('view-auth').hidden;
        var registerOpen = $('view-register') && !$('view-register').hidden;
        if (!authOpen && !registerOpen) route(null);
        return;
      }
      return window.Lms.sb.auth.exchangeCodeForSession(oauth.code).then(function (ex) {
        var next = ex.data && ex.data.session;
        if (next) return finishOAuth(next);
        return window.Lms.sb.auth.getSession().then(function (again) {
          var recovered = again.data && again.data.session;
          if (recovered) return finishOAuth(recovered);
          finishOAuth(null, window.Lms.errorText(ex.error || { message: 'pkce' }));
        });
      });
    }).catch(function (err) {
      finishOAuth(null, window.Lms.errorText(err));
    });
    window.Lms.sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        if (event === 'SIGNED_IN') oauthSettled = true;
        route(session);
      }
    });
  }

  function signOut() {
    appError('');
    authError('');
    window.Lms.sb.auth.signOut().then(function () {
      show(isStudentGate() ? 'auth' : 'land');
      if (isStudentGate()) setAuthMode('login');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
