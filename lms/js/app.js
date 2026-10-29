/* Mentor class and student reader for /lms/. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var routing = Promise.resolve();
  var busy = false;

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
    return !!(window.Lms.invite() || window.Lms.schoolSlug());
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
    var slug = window.Lms.schoolSlug();
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

  function studentHtml(pack) {
    var mods = (pack.modules || []).slice().sort(function (a, b) {
      return (a.sort_order - b.sort_order) || String(a.created_at).localeCompare(String(b.created_at));
    });
    if (!mods.length) return '<p class="muted">Mentor belum menayangkan pelajaran.</p>';
    return mods.map(function (mod) {
      var lessons = lessonsOf(pack, mod.id);
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

  function render(me, pack, people) {
    var mentor = me.role === 'mentor';
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
    $('kurikulum').hidden = !mentor;
    $('reader').hidden = mentor;
    $('view-app').classList.toggle('is-student', !mentor);
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
      $('kurikulum').innerHTML = mentorHtml(pack);
      bindMentor($('kurikulum'), pack);
    } else {
      $('reader').innerHTML = studentHtml(pack);
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
    render(me, pack, people);
    show('app');
  }

  async function routeNow(session) {
    if (!session) {
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
    if (window.Lms.schoolSlug()) {
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

  function boot() {
    if (!window.Lms || !window.Lms.sb) {
      show('auth');
      authError('Gagal memuat koneksi. Muat ulang halaman ini.');
      return;
    }
    setAuthMode(window.Lms.invite() ? 'signup' : (window.Lms.schoolSlug() ? 'login' : 'signup'));
    document.querySelectorAll('[data-start]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.Lms.setIntent('mentor');
        setAuthMode('signup');
        show('auth');
      });
    });
    document.querySelectorAll('[data-login]').forEach(function (btn) {
      btn.addEventListener('click', function () {
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
      window.Lms.setIntent(isStudentGate() ? 'student' : 'mentor');
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
              lms_slug: window.Lms.schoolSlug() || null
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

    paintSchoolBrand();
    if (isStudentGate()) {
      show('auth');
      setAuthMode(window.Lms.invite() ? 'signup' : 'login');
    }
    window.Lms.sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') route(session);
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
