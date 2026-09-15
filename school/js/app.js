/* Sekolah Anton localhost prototype. No live WhatsApp, TikTok, Mayar, or Contabo. */
(function () {
  const SEED = window.ANTON_SEED;
  const KEY = 'anton-school-v2';
  const $ = (id) => document.getElementById(id);
  const ALL_SKUS = () => (SEED.catalog || []).map((p) => p.id);

  if (/larisid\.com$/i.test(location.hostname) || location.hostname.endsWith('.pages.dev')) {
    $('prod-block').hidden = false;
    $('app').hidden = true;
    return;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtRp(n) { return 'Rp' + Math.round(n || 0).toLocaleString('id-ID'); }
  function fmtWhen(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  }
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function defaultState() {
    const progress = {};
    Object.entries(SEED.progressSeed).forEach(([sid, ids]) => {
      progress[sid] = Object.fromEntries(ids.map((id) => [id, true]));
    });
    const last = {};
    Object.keys(progress).forEach((sid) => {
      const ids = Object.keys(progress[sid]);
      last[sid] = ids[ids.length - 1] || 'l1';
    });
    return {
      lectures: SEED.lectures.map((l) => ({ ...l })),
      catalog: SEED.catalog.map((p) => ({ ...p, outline: (p.outline || []).slice() })),
      weeks: SEED.weeks.map((w) => ({ ...w })),
      sessions: SEED.sessions.map((s) => ({ ...s })),
      billing: JSON.parse(JSON.stringify(SEED.billing)),
      threads: SEED.threads.map((t) => ({ ...t })),
      replies: SEED.replies.map((r) => ({ ...r })),
      attendance: JSON.parse(JSON.stringify(SEED.attendance)),
      notes: JSON.parse(JSON.stringify(SEED.notes)),
      announcements: SEED.announcements.map((a) => ({ ...a })),
      progress,
      lastLecture: last,
      kolab: {}
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const merged = Object.assign(defaultState(), JSON.parse(raw));
      if (!merged.catalog || !merged.catalog.length) {
        merged.catalog = SEED.catalog.map((p) => ({ ...p, outline: (p.outline || []).slice() }));
      }
      return merged;
    } catch {
      return defaultState();
    }
  }

  let db = load();
  const ui = {
    role: 'student',
    tab: 'home',
    mentorTab: 'siswa',
    personaId: 's-kamu',
    lectureId: db.lastLecture['s-kamu'] || 'l1',
    pane: 'tanya',
    drawerId: null,
    kolabSel: new Set(),
    filterSiswa: '',
    kurOpen: false,
    skuId: null,
    skuPreview: false
  };

  function save() {
    const copy = { ...db, kolab: db.kolab };
    localStorage.setItem(KEY, JSON.stringify(copy));
  }

  function student() {
    return SEED.students.find((s) => s.id === ui.personaId) || SEED.students[0];
  }
  function billingOf(id) {
    if (!db.billing[id]) {
      db.billing[id] = { status: 'belum', plan: '', products: [], amount: 0, source: 'manual' };
    }
    const b = db.billing[id];
    if (!Array.isArray(b.products)) b.products = [];
    return b;
  }
  function canMentoring(id) {
    const b = billingOf(id);
    if (b.status === 'gratis') return true;
    if (b.status === 'belum') return false;
    return b.plan === 'mentoring';
  }
  function canSku(id, skuId) {
    if (canMentoring(id)) return true;
    return billingOf(id).products.indexOf(skuId) !== -1;
  }
  function canLearn(id) { return canMentoring(id); }
  function catalog() { return db.catalog || SEED.catalog; }
  function productById(id) { return catalog().find((p) => p.id === id); }
  function isStaff() { return ui.role === 'owner' || ui.role === 'asisten'; }
  function canBill() { return ui.role === 'owner'; }

  function lectures() { return db.lectures; }
  function lectureById(id) { return lectures().find((l) => l.id === id); }
  function lecturesInWeek(wid) { return lectures().filter((l) => l.weekId === wid); }

  function doneSet(sid) { return db.progress[sid] || (db.progress[sid] = {}); }
  function isDone(sid, lid) { return !!doneSet(sid)[lid]; }
  function markDone(sid, lid, val) {
    doneSet(sid)[lid] = val;
    db.lastLecture[sid] = lid;
    save();
  }
  function progressPct(sid, weekId) {
    const list = weekId ? lecturesInWeek(weekId) : lectures();
    if (!list.length) return 0;
    const n = list.filter((l) => isDone(sid, l.id)).length;
    return Math.round((n / list.length) * 100);
  }

  function nextSession() {
    const now = Date.now();
    return db.sessions.find((s) => new Date(s.startsAt).getTime() >= now) || db.sessions[db.sessions.length - 1];
  }
  function belumSiap(session) {
    const need = session.required || [];
    return SEED.students.filter((s) => {
      if (!canMentoring(s.id)) return false;
      return need.some((lid) => !isDone(s.id, lid));
    });
  }

  function waLink(phone, text) {
    const n = String(phone || '').replace(/\D/g, '');
    return 'https://wa.me/' + n + (text ? ('?text=' + encodeURIComponent(text)) : '');
  }

  function parseEmbed(url) {
    if (!url) return null;
    const u = String(url);
    const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    if (yt) {
      return {
        embed: 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1&rel=0&modestbranding=1',
        thumb: 'https://i.ytimg.com/vi/' + yt[1] + '/hqdefault.jpg'
      };
    }
    return null;
  }

  function payChip(st) {
    const label = { lunas: 'Lunas', cicilan: 'Cicilan', belum: 'Belum bayar', gratis: 'Beasiswa' }[st] || st;
    return '<span class="chip ' + esc(st) + '">' + esc(label) + '</span>';
  }

  function typeLabel(t) {
    return { video: 'Video', text: 'Bacaan', document: 'File', tool: 'Alat' }[t] || t;
  }

  /* ── Kolab (per-student) ─────────────────────────────────────────── */
  function kolabOf(sid) {
    if (!db.kolab[sid]) {
      db.kolab[sid] = {
        creators: [],
        used: SEED.kolabQuota.used,
        jobs: []
      };
    }
    return db.kolab[sid];
  }

  function rankCreator(c, product) {
    const niche = (c.niche || '').toLowerCase();
    const want = (product.niche || '').toLowerCase();
    let score = Math.log10((+c.gmv_30d || 1) + 1) * 10;
    if (niche === want) score += 40;
    else if (niche === 'fashion' && want === 'hair') score += 12;
    if ((c.content || '') === 'live') score += 6;
    if (niche === 'comedy') score -= 30;
    const gmv = +c.gmv_30d || 0;
    if (gmv < 15000000) score -= 8;
    const comm = +c.typical_commission_pct || product.suggestedCommission;
    const keep = product.price - product.cogs - product.price * comm / 100 - product.price * 0.06;
    if (keep < 0) score -= 20;
    return { ...c, score, suggested: Math.min(comm, product.suggestedCommission + 4), skip: score < 8 || keep < 0 };
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cols = line.split(',');
      const o = {};
      head.forEach((h, i) => { o[h] = (cols[i] || '').trim(); });
      return {
        handle: o.handle || o.Handle,
        gmv_30d: +(o.gmv_30d || o.GMV || 0),
        followers: +(o.followers || 0),
        niche: o.niche || '',
        content: o.content || 'video',
        email: o.email || '',
        typical_commission_pct: +(o.typical_commission_pct || 18),
        live_gmv_30d: +(o.live_gmv_30d || 0),
        status: 'new'
      };
    });
  }

  /* ── chrome ──────────────────────────────────────────────────────── */
  function fillChrome() {
    const mode = isStaff() ? 'mentor' : 'student';
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.plan = isStaff()
      ? 'mentor'
      : (canMentoring(ui.personaId) ? 'mentoring' : (billingOf(ui.personaId).products.length ? 'sku' : 'none'));
    $('app').classList.toggle('is-mentor', isStaff());
    $('app').classList.toggle('is-student', !isStaff());
    $('school-name').textContent = SEED.school.name;
    $('role-switch').innerHTML =
      '<option value="student">Siswa</option>' +
      '<option value="owner">Mentor (Anton)</option>' +
      '<option value="asisten">Asisten (Lia)</option>';
    $('role-switch').value = ui.role;
    const pers = $('persona-switch');
    pers.innerHTML = SEED.students.map((s) =>
      '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('');
    pers.value = ui.personaId;
    pers.hidden = isStaff();
    if (!isStaff()) {
      const allowed = studentTabs().map((t) => t.id).concat(['sku']);
      if (allowed.indexOf(ui.tab) === -1) ui.tab = 'home';
    }
    renderTabs();
  }

  function studentTabs() {
    if (canMentoring(ui.personaId)) {
      return [
        { id: 'home', label: 'Home' },
        { id: 'belajar', label: 'Belajar' },
        { id: 'pustaka', label: 'Pustaka' },
        { id: 'diskusi', label: 'Diskusi' },
        { id: 'progres', label: 'Progres' }
      ];
    }
    return [
      { id: 'home', label: 'Home' },
      { id: 'pustaka', label: 'Pustaka' },
      { id: 'progres', label: 'Progres' }
    ];
  }
  function mentorTabs() {
    const t = [
      { id: 'siswa', label: 'Siswa' },
      { id: 'progres', label: 'Progres' },
      { id: 'kurikulum', label: 'Kurikulum' },
      { id: 'pustaka', label: 'Perpustakaan' },
      { id: 'jadwal', label: 'Jadwal' },
      { id: 'diskusi', label: 'Diskusi' }
    ];
    if (canBill()) t.push({ id: 'bayar', label: 'Pembayaran' });
    return t;
  }

  function renderTabs() {
    const items = isStaff() ? mentorTabs() : studentTabs();
    const cur = isStaff() ? ui.mentorTab : ui.tab;
    $('tabs').innerHTML = items.map((t) =>
      '<button type="button" role="tab" data-act="tab" data-id="' + t.id + '" aria-selected="' +
      (t.id === cur) + '">' + esc(t.label) + '</button>'
    ).join('');
    const dock = $('dock');
    if (!isStaff()) {
      dock.hidden = false;
      dock.classList.toggle('cols-3', !canMentoring(ui.personaId));
      dock.innerHTML = studentTabs().map((t) =>
        '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' +
        (t.id === ui.tab || (ui.tab === 'sku' && t.id === 'pustaka')) + '">' + esc(t.label) + '</button>'
      ).join('');
    } else {
      dock.hidden = true;
      dock.classList.remove('cols-3');
    }
  }

  function render() {
    fillChrome();
    const main = $('main');
    if (isStaff()) {
      const tab = ui.mentorTab;
      if (tab === 'siswa') main.innerHTML = viewSiswa();
      else if (tab === 'progres') main.innerHTML = viewMentorProgres();
      else if (tab === 'kurikulum') main.innerHTML = viewKurikulum();
      else if (tab === 'pustaka') main.innerHTML = viewPustaka();
      else if (tab === 'jadwal') main.innerHTML = viewJadwal(true);
      else if (tab === 'diskusi') main.innerHTML = viewDiskusi(true);
      else if (tab === 'bayar' && canBill()) main.innerHTML = viewBayar();
      else main.innerHTML = viewSiswa();
    } else {
      const tab = ui.tab;
      if (tab === 'home') main.innerHTML = viewHome();
      else if (tab === 'belajar') main.innerHTML = viewBelajar();
      else if (tab === 'pustaka') main.innerHTML = viewStudentPustaka();
      else if (tab === 'sku') main.innerHTML = viewSkuPage();
      else if (tab === 'diskusi') main.innerHTML = canMentoring(ui.personaId) ? viewDiskusi(false) : viewLocked();
      else if (tab === 'progres') main.innerHTML = viewProgres();
      else if (tab === 'kolab') main.innerHTML = viewKolab();
    }
    bindLazy();
  }

  function bindLazy() {
    $('main').querySelectorAll('[data-embed]').forEach((el) => {
      el.addEventListener('click', () => {
        const src = el.getAttribute('data-embed');
        el.outerHTML = '<iframe src="' + esc(src) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video materi"></iframe>';
      });
    });
  }

  /* ── student views ───────────────────────────────────────────────── */
  function viewHome() {
    if (!canMentoring(ui.personaId)) return viewHomeAlacarte();
    const s = student();
    const lastId = db.lastLecture[s.id] || 'l1';
    const last = lectureById(lastId) || lectures()[0];
    const ses = nextSession();
    const bill = billingOf(s.id);
    const pct = progressPct(s.id);
    const ann = db.announcements[0];
    return (
      '<div class="grid-2">' +
        '<section class="card resume">' +
          '<p class="muted">Lanjutkan</p>' +
          '<h2>' + esc(last.title) + '</h2>' +
          '<p class="muted">' + esc(typeLabel(last.type)) + ' · ' + pct + '% materi selesai</p>' +
          '<button class="btn" data-act="open-lec" data-id="' + esc(last.id) + '">Buka materi</button>' +
        '</section>' +
        '<section class="card">' +
          '<h2>Sesi berikutnya</h2>' +
          '<p><strong>' + esc(ses.title) + '</strong></p>' +
          '<p class="muted">' + fmtWhen(ses.startsAt) + ' · ' + esc(ses.location) + '</p>' +
          '<p class="muted">' + esc(ses.notes || '') + '</p>' +
          '<div class="row" style="margin-top:10px">' +
            '<a class="btn" href="' + esc(ses.meetUrl) + '" target="_blank" rel="noopener">Buka Meet</a>' +
            '<a class="wa" href="' + esc(waLink(SEED.staff[0].wa, 'Halo Anton, saya dari Batch September.')) + '" target="_blank" rel="noopener">Chat Anton di WA</a>' +
          '</div>' +
          '<p class="muted" style="margin-top:10px">Grup WA kelas: undangan hanya lewat Anton. Prototype tidak mengirim WA sungguhan.</p>' +
        '</section>' +
      '</div>' +
      '<div class="grid-2" style="margin-top:14px">' +
        '<section class="card">' +
          '<h2>Minggu ini</h2>' +
          weekList(s.id, 'w3') +
        '</section>' +
        '<section class="card">' +
          '<h2>Pengumuman</h2>' +
          (ann ? '<p><strong>' + esc(ann.title) + '</strong></p><p class="muted">' + esc(ann.body) + '</p>' : '<p class="muted">Tidak ada.</p>') +
          '<div style="margin-top:12px">' + payChip(bill.status) +
            '<span class="muted"> · mentoring' + (bill.note ? ' · ' + esc(bill.note) : '') + '</span></div>' +
        '</section>' +
      '</div>'
    );
  }

  function viewHomeAlacarte() {
    const s = student();
    const b = billingOf(s.id);
    const owned = catalog().filter((p) => canSku(s.id, p.id));
    const ownedHtml = owned.length
      ? owned.map((p) =>
          '<section class="card resume" style="margin-bottom:10px">' +
            '<p class="muted">Pustaka kamu</p>' +
            '<h2>' + esc(p.title) + '</h2>' +
            '<p class="muted">' + esc(p.job) + '</p>' +
            '<button class="btn" data-act="open-sku" data-id="' + esc(p.id) + '">Buka</button>' +
          '</section>'
        ).join('')
      : '<section class="card"><h2>Belum ada produk</h2><p class="muted">Beli satu alat di lynk.id, atau ikut mentoring supaya semua kebuka.</p></section>';
    return ownedHtml +
      '<section class="card" style="margin-top:10px">' +
        '<h2>Ikut mentoring Anton</h2>' +
        '<p class="muted">Live class + semua produk di Pustaka. Anton merchant di lynk.id — LarisID tidak menahan uang.</p>' +
        '<div class="row" style="margin-top:10px">' +
          '<a class="wa" href="' + esc(waLink(SEED.staff[0].wa, 'Halo Anton, mau ikut mentoring. Saya sudah cek lynk.id/obrolan.marketing')) + '" target="_blank" rel="noopener">Chat Anton di WA</a>' +
          '<a class="btn secondary" href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">Buka lynk.id</a>' +
        '</div>' +
        '<p class="muted" style="margin-top:10px">' + payChip(b.status) +
          (b.note ? ' · ' + esc(b.note) : ' · belum mentoring') + '</p>' +
      '</section>';
  }

  function weekList(sid, weekId) {
    return '<ul class="list-check">' + lecturesInWeek(weekId).map((l) =>
      '<li><span>' + (isDone(sid, l.id) ? '✓ ' : '') + esc(l.title) + '</span>' +
      '<button class="btn-sm" data-act="open-lec" data-id="' + esc(l.id) + '">Buka</button></li>'
    ).join('') + '</ul>';
  }

  function viewLocked() {
    return '<div class="locked">' +
      '<h2>Live class terkunci</h2>' +
      '<p class="muted">Belajar, Diskusi, dan Kolab hanya untuk yang ikut mentoring. Produk lynk tetap bisa dibeli satuan di Pustaka. Anton merchant — LarisID tidak menahan uang.</p>' +
      '<div class="row" style="justify-content:center">' +
        '<a class="wa" href="' + esc(waLink(SEED.staff[0].wa, 'Halo Anton, mau konfirmasi mentoring / produk lynk.')) + '" target="_blank" rel="noopener">Chat Anton</a>' +
        '<a class="btn secondary" href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">lynk.id</a>' +
      '</div></div>';
  }

  function viewBelajar() {
    if (!canMentoring(ui.personaId)) return viewLocked();
    const lec = lectureById(ui.lectureId) || lectures()[0];
    ui.lectureId = lec.id;
    const inner = lec.tool === 'kolab'
      ? viewKolab()
      : renderCanvas(lec) + renderPanes(lec);
    return '<div class="player-layout">' +
      '<div>' +
        '<button type="button" class="kur-toggle" data-act="toggle-kur">' +
        (ui.kurOpen ? 'Tutup kurikulum' : 'Kurikulum') + '</button>' +
        inner + '</div>' +
      '<aside class="kurikulum-pane' + (ui.kurOpen ? ' is-open' : '') + '">' +
        renderKurikulumSidebar() + '</aside>' +
      '</div>';
  }

  function renderCanvas(lec) {
    let body = '';
    if (lec.type === 'video') {
      const e = parseEmbed(lec.url);
      body = '<div class="lazy-embed" data-embed="' + esc(e ? e.embed : '') + '">' +
        '<div class="play-orb">▶</div>' +
        '<div class="lazy-note">Ketuk untuk memuat · hemat data</div></div>';
    } else if (lec.type === 'tool') {
      let src = lec.iframe || '';
      const sku = lec.skuId ? productById(lec.skuId) : null;
      if (sku && sku.example && src) src += (src.indexOf('?') >= 0 ? '&' : '?') + 'contoh=1';
      body = '<iframe class="tool-frame" sandbox="allow-scripts allow-forms allow-same-origin" src="' + esc(src) + '" title="' + esc(lec.title) + '"></iframe>';
    } else if (lec.type === 'document') {
      body = '<div class="article"><p>File kelas: <a href="' + esc(lec.url) + '" target="_blank" rel="noopener">' + esc(lec.title) + '</a></p><p class="muted">Prototype memakai tautan dummy. Produksi nanti: bucket cohort-docs.</p></div>';
    } else {
      body = '<div class="article"><h3>' + esc(lec.title) + '</h3><p>' + esc(lec.body || '') + '</p></div>';
    }
    const done = isDone(ui.personaId, lec.id);
    return '<div class="card" style="padding:0;overflow:hidden">' +
      '<div class="canvas">' + body + '</div>' +
      '<div class="canvas-bar">' +
        '<div><strong>' + esc(lec.title) + '</strong><div class="muted">' + esc(typeLabel(lec.type)) +
        (lec.requiredBefore ? ' · wajib sebelum kelas' : '') + '</div></div>' +
        '<button class="btn' + (done ? ' secondary' : '') + '" data-act="toggle-done" data-id="' + esc(lec.id) + '">' +
        (done ? 'Selesai ✓' : 'Tandai selesai') + '</button>' +
      '</div></div>';
  }

  function renderKurikulumSidebar() {
    return db.weeks.map((w) => {
      const items = lecturesInWeek(w.id).map((l) => {
        const cur = l.id === ui.lectureId;
        return '<button type="button" class="lec' + (cur ? ' current' : '') + '" data-act="open-lec" data-id="' + esc(l.id) + '">' +
          '<span class="mark' + (isDone(ui.personaId, l.id) ? ' done' : '') + '"></span>' +
          '<span><div class="t">' + esc(l.title) + '</div>' +
          '<div class="m">' + esc(typeLabel(l.type)) + ' · ' + esc(l.mins) + ' mnt</div></span></button>';
      }).join('');
      return '<div class="week-label">' + esc(w.title) + '</div>' + items;
    }).join('');
  }

  function renderPanes(lec) {
    const threads = db.threads.filter((t) => t.lectureId === lec.id);
    const tanya = '<div class="subtabs">' +
      '<button type="button" data-act="pane" data-id="tanya" aria-selected="' + (ui.pane === 'tanya') + '">Tanya</button>' +
      '<button type="button" data-act="pane" data-id="sumber" aria-selected="' + (ui.pane === 'sumber') + '">Sumber</button>' +
      '</div>';
    if (ui.pane === 'sumber') {
      const res = (lec.resources || []).map((r) =>
        '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.name) + '</a></li>'
      ).join('') || '<li class="muted">Tidak ada file di materi ini.</li>';
      return tanya + '<div class="card"><h3>Sumber</h3><ul>' + res + '</ul></div>';
    }
    return tanya + '<div class="card"><h3>Tanya di materi ini</h3>' +
      threadList(threads) +
      '<form class="compose" data-act="ask" data-lec="' + esc(lec.id) + '">' +
        '<input name="title" required maxlength="140" placeholder="Judul pertanyaan">' +
        '<textarea name="body" required rows="3" placeholder="Konteks singkat. Jangan sebar supplier atau margin."></textarea>' +
        '<button class="btn" type="submit">Kirim</button>' +
      '</form></div>';
  }

  function threadList(threads) {
    const sorted = threads.slice().sort((a, b) => Number(a.answered) - Number(b.answered) || new Date(b.createdAt) - new Date(a.createdAt));
    if (!sorted.length) return '<p class="muted">Belum ada pertanyaan. WhatsApp tetap untuk chat cepat.</p>';
    return sorted.map((t) => {
      const author = nameOf(t.authorId);
      const reps = db.replies.filter((r) => r.threadId === t.id);
      return '<article class="thread">' +
        '<h4>' + esc(t.title) + ' ' + (t.answered ? '<span class="chip">Dijawab</span>' : '<span class="chip warn">Belum dijawab</span>') + '</h4>' +
        '<p class="muted">' + esc(author) + ' · ' + fmtWhen(t.createdAt) + '</p>' +
        '<p>' + esc(t.body) + '</p>' +
        reps.map((r) => '<p class="muted"><strong>' + esc(nameOf(r.authorId)) + ':</strong> ' + esc(r.body) + '</p>').join('') +
        (isStaff() && !t.answered
          ? '<form class="compose" data-act="reply" data-tid="' + esc(t.id) + '"><textarea name="body" required rows="2" placeholder="Jawaban Anton / Lia"></textarea><button class="btn" type="submit">Jawab</button></form>'
          : '') +
        '</article>';
    }).join('');
  }

  function nameOf(id) {
    return (SEED.students.find((s) => s.id === id) || SEED.staff.find((s) => s.id === id) || { name: id }).name;
  }

  function skuPriceHtml(p) {
    return '<span class="price-coret">' + fmtRp(p.coret) + '</span> <strong>' + fmtRp(p.price) + '</strong>';
  }

  function exampleBanner(p, preview) {
    if (!preview && !p.example) return '';
    return '<p class="example-banner">Contoh · bukan file Anton. Ganti lewat Perpustakaan.</p>';
  }

  function iframeSrc(p, preview) {
    if (!p.iframe) return '';
    const q = (preview || p.example) ? 'contoh=1' : '';
    if (!q) return p.iframe;
    return p.iframe + (p.iframe.indexOf('?') >= 0 ? '&' : '?') + q;
  }

  function viewStudentPustaka() {
    const sid = ui.personaId;
    const groups = [
      { id: 'alat', label: 'Alat' },
      { id: 'rekaman', label: 'Rekaman' }
    ];
    let html = '<h2 style="margin:0 0 4px">Pustaka Anton</h2>' +
      '<p class="muted" style="margin:0 0 12px">Beli satuan di lynk.id, atau mentoring = semua ini + live class. Checkout tetap di lynk — bukan LarisID.</p>';
    groups.forEach((g) => {
      const items = catalog().filter((p) => p.group === g.id);
      html += '<h3 class="week-label">' + g.label + '</h3><div class="tool-grid">';
      html += items.map((p) => skuTile(p, sid)).join('');
      html += '</div>';
    });
    if (canMentoring(sid)) {
      html += '<h3 class="week-label">Khusus kelas</h3><div class="tool-grid">' +
        '<button type="button" class="card tool-tile" data-act="open-lec" data-id="l8">' +
          '<h3>Kolab — cari kreator</h3>' +
          '<p class="muted">Bukan produk lynk. Hanya mentoring.</p>' +
        '</button></div>';
    }
    return html;
  }

  function skuTile(p, sid) {
    const owned = canSku(sid, p.id);
    const actions = owned
      ? '<button class="btn" data-act="open-sku" data-id="' + esc(p.id) + '">Buka</button>'
      : '<a class="btn" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Beli di lynk.id</a>' +
        '<button class="btn secondary" data-act="contoh-sku" data-id="' + esc(p.id) + '">Lihat contoh</button>';
    return '<div class="card tool-tile sku">' +
      (owned ? '<span class="chip lunas">Punya</span>' : '<span class="chip">Satuan</span>') +
      (p.example ? ' <span class="chip warn">Contoh</span>' : '') +
      '<h3>' + esc(p.title) + '</h3>' +
      '<p class="muted">' + esc(p.job) + '</p>' +
      '<p class="sku-price">' + skuPriceHtml(p) + '</p>' +
      '<div class="row" style="margin-top:10px">' + actions + '</div></div>';
  }

  function viewSkuPage() {
    const p = productById(ui.skuId);
    if (!p) return viewStudentPustaka();
    const owned = canSku(ui.personaId, p.id);
    const preview = !!ui.skuPreview && !owned;
    if (!owned && !preview) return viewStudentPustaka();
    let canvas = '';
    let extra = '';
    if (p.kind === 'tool') {
      canvas = '<iframe class="tool-frame" sandbox="allow-scripts allow-forms allow-same-origin" src="' +
        esc(iframeSrc(p, preview)) + '" title="' + esc(p.title) + '"></iframe>';
    } else {
      const e = parseEmbed(p.url);
      canvas = '<div class="lazy-embed" data-embed="' + esc(e ? e.embed : '') + '">' +
        '<div class="play-orb">▶</div>' +
        '<div class="lazy-note">Ketuk untuk memuat · hemat data</div></div>';
      if (p.outline && p.outline.length) {
        extra = '<div class="card" style="margin-top:10px"><h3>Isi rekaman</h3><ul class="muted">' +
          p.outline.map((x) => '<li>' + esc(x) + '</li>').join('') +
          '</ul></div>';
      }
    }
    return '<button type="button" class="kur-toggle" data-act="tab" data-id="pustaka">← Pustaka</button>' +
      exampleBanner(p, preview) +
      '<div class="card" style="padding:0;overflow:hidden;margin-top:10px">' +
        '<div class="canvas">' + canvas + '</div>' +
        '<div class="canvas-bar">' +
          '<div><strong>' + esc(p.title) + '</strong>' +
          '<div class="muted">' + (owned ? 'Punya kamu' : 'Contoh sampai Anton isi file') + '</div></div>' +
          (owned
            ? '<a class="btn secondary" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Halaman lynk</a>'
            : '<a class="btn" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Beli di lynk.id</a>') +
        '</div></div>' + extra;
  }

  function viewAlat() {
    return viewStudentPustaka();
  }

  function viewDiskusi(staff) {
    const open = db.threads.filter((t) => !t.answered);
    const ses = nextSession();
    return '<div class="grid-2">' +
      '<section class="card"><h2>Belum dijawab</h2>' +
        (open.length ? threadList(open) : '<p class="muted">Semua sudah dijawab.</p>') +
      '</section>' +
      '<section class="card"><h2>Pengumuman & sesi</h2>' +
        db.announcements.map((a) => '<p><strong>' + esc(a.title) + '</strong><br><span class="muted">' + esc(a.body) + '</span></p>').join('') +
        '<hr style="border:0;border-top:1px solid var(--line)">' +
        '<p><strong>' + esc(ses.title) + '</strong></p>' +
        '<p class="muted">' + fmtWhen(ses.startsAt) + '</p>' +
        '<a class="wa" href="' + esc(SEED.school.waGroup) + '" target="_blank" rel="noopener">Grup WA kelas</a>' +
        (staff ? '<form class="compose" data-act="announce" style="margin-top:12px"><input name="title" required placeholder="Judul pengumuman"><textarea name="body" required rows="2"></textarea><button class="btn" type="submit">Kirim pengumuman</button></form>' : '') +
      '</section></div>';
  }

  function viewProgres() {
    const sid = ui.personaId;
    const bill = billingOf(sid);
    if (!canMentoring(sid)) {
      const owned = catalog().filter((p) => canSku(sid, p.id));
      return '<section class="card"><h2>Pustaka kamu</h2>' +
        (owned.length
          ? '<ul class="list-check">' + owned.map((p) =>
              '<li><span>' + esc(p.title) + (p.example ? ' · contoh' : '') + '</span>' +
              '<button class="btn-sm" data-act="open-sku" data-id="' + esc(p.id) + '">Buka</button></li>'
            ).join('') + '</ul>'
          : '<p class="muted">Belum ada SKU. Beli di lynk.id atau lihat contoh di Pustaka.</p>') +
        '<p style="margin-top:12px">Bayar: ' + payChip(bill.status) +
          ' <span class="muted">' + esc(bill.note || 'satuan') + '</span></p>' +
        '<p class="muted">Mentoring membuka live class + semua produk.</p></section>';
    }
    const hadir = hadirPct(sid);
    return '<div class="grid-2">' +
      '<section class="card"><h2>Checklist</h2>' +
        db.weeks.map((w) => '<h3>' + esc(w.title) + ' · ' + progressPct(sid, w.id) + '%</h3>' + weekList(sid, w.id)).join('') +
      '</section>' +
      '<section class="card">' +
        '<h2>Status</h2>' +
        '<p>Materi: <strong>' + progressPct(sid) + '%</strong></p>' +
        '<p>Hadir: <strong>' + hadir + '%</strong></p>' +
        '<p>Bayar: ' + payChip(bill.status) + ' <span class="muted">' + esc(bill.note || bill.plan || '') + '</span></p>' +
        '<h3 style="margin-top:16px">Lencana (kejadian nyata)</h3>' +
        '<p class="muted">' +
          (isDone(sid, 'l1') ? '✓ Masuk kelas. ' : 'Belum mulai. ') +
          (isDone(sid, 'l8') ? '✓ Buka Kolab. ' : '') +
          (hadir >= 50 ? '✓ Hadir ≥ setengah sesi.' : 'Hadir masih di bawah setengah sesi.') +
        '</p>' +
      '</section></div>';
  }

  function hadirPct(sid) {
    const keys = Object.keys(db.attendance);
    if (!keys.length) return 0;
    let n = 0;
    keys.forEach((ses) => { if (db.attendance[ses][sid] === 'hadir') n += 1; });
    return Math.round((n / keys.length) * 100);
  }

  /* ── Kolab ───────────────────────────────────────────────────────── */
  function viewKolab() {
    if (!canMentoring(ui.personaId) && !isStaff()) return viewLocked();
    const sid = isStaff() ? (ui.drawerId || ui.personaId) : ui.personaId;
    const k = kolabOf(sid);
    const q = SEED.kolabQuota;
    const left = Math.max(0, q.weekly - k.used);
    const ranked = k.creators.map((c) => rankCreator(c, SEED.product))
      .sort((a, b) => b.score - a.score);
    const selected = ranked.filter((c) => ui.kolabSel.has(c.handle));
    const thisSend = Math.min(selected.length, q.batch, left);
    return '<section class="card">' +
      '<h2>Kolab · kuota toko, bukan blast</h2>' +
      '<p class="muted">Kalodata (CSV kamu) = siapa &amp; komisi. Antrian ini menghormati cap TikTok: 50 kreator / kirim, 1.000 undangan / hari, kuota mingguan untuk yang <em>belum connected</em>. Prototype tidak mengirim ke TikTok.</p>' +
      '<div class="quota"><div><div class="bar"><span style="width:' + Math.min(100, (k.used / q.weekly) * 100) + '%"></span></div>' +
      '<p class="muted">Kuota unconnected minggu ini: ' + k.used + ' / ' + q.weekly + ' terpakai · sisa ' + left +
      ' · cap harian ' + q.dailyCap + ' · batch ' + q.batch + '</p></div>' +
      '<div>' + payChip(billingOf(sid).status) + ' <span class="muted">' + esc(nameOf(sid)) + '</span></div></div>' +
      '<p style="margin-top:8px"><strong>SKU:</strong> ' + esc(SEED.product.name) +
      ' · modal contoh ' + fmtRp(SEED.product.modal) +
      ' · tawaran awal ' + SEED.product.suggestedCommission + '% (dari ekonomi produk, bukan biaya LarisID)</p>' +
      '<div class="row" style="margin-top:10px">' +
        '<label class="btn secondary">Import CSV Kalodata<input type="file" accept=".csv" data-act="csv" hidden></label>' +
        '<button class="btn secondary" data-act="csv-demo">Pakai CSV dummy</button>' +
        '<button class="btn" data-act="fake-send" ' + (thisSend ? '' : 'disabled') + '>Antrikan ' + thisSend + ' undangan (palsu)</button>' +
      '</div></section>' +
      '<div class="grid-2" style="margin-top:14px">' +
        '<section class="card" style="overflow:auto"><h3>Kreator (skor cocok)</h3>' +
        (ranked.length ? kolabTable(ranked) : '<p class="muted">Import CSV dulu. Jangan scrape Kalodata.</p>') +
        '</section>' +
        '<section class="card"><h3>Antrian &amp; template</h3>' +
          '<p class="muted">Kirim ini = ' + thisSend + ' dari kuota unconnected. Yang sudah connected tidak makan kuota (belum ada di dummy sampai mereka “membalas”).</p>' +
          '<textarea readonly rows="5">Halo {handle}, aku seller ' + esc(SEED.product.name) +
          '. Komisi target collab ' + SEED.product.suggestedCommission +
          '%. Kamu cocok karena niche {niche}. Boleh aku kirim undangan Affiliate Center?</textarea>' +
          kolabJobs(k) +
        '</section></div>';
  }

  function kolabTable(rows) {
    return '<table class="table"><thead><tr><th></th><th>Handle</th><th>GMV 30h</th><th>Niche</th><th>% usul</th><th>Skor</th></tr></thead><tbody>' +
      rows.map((c) => '<tr>' +
        '<td><input type="checkbox" data-act="ksel" data-handle="' + esc(c.handle) + '"' +
        (ui.kolabSel.has(c.handle) ? ' checked' : '') + (c.skip ? ' disabled' : '') + '></td>' +
        '<td>' + esc(c.handle) + (c.skip ? ' <span class="chip belum">skip</span>' : '') + '</td>' +
        '<td>' + fmtRp(c.gmv_30d) + '</td>' +
        '<td>' + esc(c.niche) + ' · ' + esc(c.content) + '</td>' +
        '<td>' + esc(c.suggested) + '%</td>' +
        '<td>' + Math.round(c.score) + '</td></tr>'
      ).join('') + '</tbody></table>';
  }

  function kolabJobs(k) {
    if (!k.jobs.length) return '<p class="muted">Belum ada kiriman palsu.</p>';
    return '<ul class="list-check">' + k.jobs.slice().reverse().map((j) =>
      '<li><span>' + esc(j.handle) + ' · ' + esc(j.status) + '</span><span class="muted">' + fmtWhen(j.at) + '</span></li>'
    ).join('') + '</ul>';
  }

  /* ── mentor views ────────────────────────────────────────────────── */
  function viewSiswa() {
    const q = (ui.filterSiswa || '').toLowerCase();
    const rows = SEED.students.filter((s) =>
      !q || s.name.toLowerCase().includes(q) || billingOf(s.id).status.includes(q)
    );
    return '<div class="card">' +
      '<div class="row" style="justify-content:space-between">' +
        '<h2>Siswa · ' + esc(SEED.cohort.name) + '</h2>' +
        '<input placeholder="Cari nama / status bayar" value="' + esc(ui.filterSiswa) + '" data-act="filter-siswa" style="max-width:240px;padding:8px 12px;border:1px solid var(--line);border-radius:10px">' +
      '</div>' +
      '<p class="muted">Bukan daftar pelamar LaRISE. Roster sekolah Anton saja.</p>' +
      '<table class="table"><thead><tr><th>Nama</th><th>Progres</th><th>Hadir</th><th>Bayar</th><th>Aktif</th><th></th></tr></thead><tbody>' +
      rows.map((s) => '<tr>' +
        '<td>' + esc(s.name) + '<div class="muted">' + esc(s.city) + '</div></td>' +
        '<td>' + progressPct(s.id) + '%</td>' +
        '<td>' + hadirPct(s.id) + '%</td>' +
        '<td>' + payChip(billingOf(s.id).status) +
          '<div class="muted">' + (canMentoring(s.id) ? 'mentoring' : (billingOf(s.id).products.join(', ') || '—')) + '</div></td>' +
        '<td class="muted">' + fmtWhen(s.lastActive) + '</td>' +
        '<td><button type="button" class="btn-sm" data-act="open-student" data-id="' + esc(s.id) + '">Buka</button></td></tr>'
      ).join('') + '</tbody></table></div>';
  }

  function viewStudentDrawer(id) {
    const s = SEED.students.find((x) => x.id === id);
    if (!s) return '';
    const b = billingOf(id);
    const notes = db.notes[id] || [];
    return '<button class="btn secondary" data-act="close-drawer">Tutup</button>' +
      '<h2>' + esc(s.name) + '</h2>' +
      '<p class="muted">' + esc(s.city) + ' · ' + (s.tags || []).map(esc).join(', ') + '</p>' +
      '<p>' + payChip(b.status) + '</p>' +
      '<a class="wa" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', dari Sekolah Anton.')) + '" target="_blank" rel="noopener">Chat WA</a>' +
      '<h3>Checklist</h3>' +
      db.weeks.map((w) => '<p class="muted">' + esc(w.title) + ' · ' + progressPct(id, w.id) + '%</p>').join('') +
      '<h3>Hadir</h3>' +
      db.sessions.map((ses) => {
        const st = (db.attendance[ses.id] || {})[id] || '—';
        return '<p>' + esc(ses.title) + ': <strong>' + esc(st) + '</strong></p>';
      }).join('') +
      '<h3>Ledger</h3><p class="muted">' + esc(b.plan || '—') + ' · ' + fmtRp(b.amount) + ' · ' + esc(b.source) +
      (b.note ? ' · ' + esc(b.note) : '') + '</p>' +
      '<p class="muted">Produk: ' + (canMentoring(id) ? 'mentoring (semua)' : (b.products.length ? b.products.map((pid) => (productById(pid) || {}).title || pid).join(', ') : '—')) + '</p>' +
      (canBill() ? '<label class="muted">Ubah status</label><select data-act="bill-one" data-id="' + esc(id) + '">' +
        ['lunas', 'cicilan', 'belum', 'gratis'].map((st) =>
          '<option' + (b.status === st ? ' selected' : '') + ' value="' + st + '">' + st + '</option>').join('') +
        '</select>' : '<p class="muted">Asisten tidak melihat ubah pembayaran.</p>') +
      '<h3>Catatan mentor</h3>' +
      notes.map((n) => '<p class="muted">' + esc(n.at) + ' — ' + esc(n.body) + '</p>').join('') +
      '<form class="compose" data-act="note" data-id="' + esc(id) + '"><textarea name="body" required rows="2" placeholder="Catatan internal"></textarea><button class="btn" type="submit">Simpan</button></form>' +
      '<p class="muted">Kolab siswa ini terpisah (UU PDP). Buka alat sebagai siswa itu lewat menu Siswa di header saat mode siswa.</p>';
  }

  function viewMentorProgres() {
    const ses = nextSession();
    const behind = belumSiap(ses);
    const head = '<th class="name">Siswa</th>' + db.weeks.map((w) => '<th>' + esc(w.id) + '</th>').join('');
    const body = SEED.students.map((s) => {
      const cells = db.weeks.map((w) => {
        const p = progressPct(s.id, w.id);
        const cls = p >= 75 ? 'p3' : p >= 40 ? 'p2' : p > 0 ? 'p1' : 'p0';
        return '<td class="' + cls + '">' + p + '</td>';
      }).join('');
      return '<tr><td class="name">' + esc(s.name) + '</td>' + cells + '</tr>';
    }).join('');
    return '<div class="grid-2">' +
      '<section class="card heat"><h2>Heatmap minggu × siswa</h2>' +
        '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
        '<p class="muted">Angka = % materi minggu itu yang ditandai selesai. Bukan skor buatan.</p>' +
      '</section>' +
      '<section class="card"><h2>Belum siap kelas</h2>' +
        '<p class="muted">Wajib sebelum ' + esc(ses.title) + ': ' + (ses.required || []).map((id) => esc((lectureById(id) || {}).title || id)).join(', ') + '</p>' +
        (behind.length
          ? behind.map((s) => '<div class="row" style="justify-content:space-between;margin:8px 0">' +
              '<span>' + esc(s.name) + '</span>' +
              '<a class="btn-sm" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', materi wajib sebelum sesi belum selesai ya.')) + '" target="_blank" rel="noopener">WA pengingat</a></div>'
            ).join('')
          : '<p>Semua yang lunas sudah siap.</p>') +
        '<p class="muted">Tautan WA terbuka di perangkatmu. Prototype tidak menembak send-cohort-whatsapp.</p>' +
      '</section></div>';
  }

  function viewKurikulum() {
    const readonly = ui.role === 'asisten';
    return '<div class="card"><h2>Kurikulum</h2>' +
      '<p class="muted">Port dari retired laris-app.js. Tipe: video, bacaan, file, alat (iframe sandbox).</p>' +
      db.weeks.map((w) => {
        const items = lecturesInWeek(w.id).map((l) =>
          '<li><span>' + esc(typeLabel(l.type)) + ' · ' + esc(l.title) +
          (l.requiredBefore ? ' · wajib' : '') + '</span>' +
          (readonly ? '' : '<button class="btn-sm" data-act="del-lec" data-id="' + esc(l.id) + '">Hapus</button>') +
          '</li>'
        ).join('');
        return '<h3>' + esc(w.title) + '</h3><ul class="list-check">' + items + '</ul>' +
          (readonly ? '' : '<form class="inline-form" data-act="add-lec" data-week="' + esc(w.id) + '">' +
            '<input name="title" required placeholder="Judul materi">' +
            '<select name="type"><option value="video">Video</option><option value="text">Bacaan</option><option value="document">File</option><option value="tool">Alat</option></select>' +
            '<input name="url" placeholder="URL video / file / iframe alat">' +
            '<label class="muted"><input type="checkbox" name="req"> Wajib sebelum kelas</label>' +
            '<button class="btn" type="submit">Tambah</button></form>');
      }).join('') +
      '</div>';
  }

  function viewPustaka() {
    return '<div class="card"><h2>Perpustakaan</h2>' +
      '<p class="muted">Produk lynk Anton. Toggle Contoh → File Anton setelah dia isi. Tidak mengubah checkout lynk.id.</p>' +
      '<div class="tool-grid">' + catalog().map((p) =>
        '<div class="card tool-tile sku">' +
          '<span class="chip">' + esc(p.group) + '</span>' +
          (p.example ? ' <span class="chip warn">Contoh</span>' : ' <span class="chip lunas">File Anton</span>') +
          '<h3>' + esc(p.title) + '</h3>' +
          '<p class="muted">' + esc(p.job) + '</p>' +
          '<p class="sku-price">' + skuPriceHtml(p) + '</p>' +
          '<div class="row" style="margin-top:10px">' +
            (canBill()
              ? '<button class="btn-sm" data-act="toggle-example" data-id="' + esc(p.id) + '">' +
                (p.example ? 'Tandai file Anton sudah masuk' : 'Kembalikan ke contoh') + '</button>'
              : '') +
            '<a class="btn-sm" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">lynk</a>' +
          '</div></div>'
      ).join('') + '</div></div>';
  }

  function viewJadwal(staff) {
    return '<div class="card"><h2>Jadwal &amp; hadir</h2>' +
      '<p class="muted">Meet URL per sesi — tidak ada Zoom ID Rise yang di-hardcode. ICS token ada di prototype: ' +
      esc(SEED.cohort.calendarToken) + ' (produksi live masih belum mengirim token ini).</p>' +
      db.sessions.map((s) => {
        const roll = SEED.students.map((st) => {
          const v = (db.attendance[s.id] || {})[st.id] || '';
          return staff
            ? '<label class="muted">' + esc(st.name) + ' <select data-act="hadir" data-sid="' + esc(s.id) + '" data-uid="' + esc(st.id) + '">' +
              ['', 'hadir', 'izin', 'absen'].map((x) => '<option' + (v === x ? ' selected' : '') + '>' + (x || '—') + '</option>').join('') +
              '</select></label>'
            : '';
        }).join('');
        return '<article class="thread"><h4>' + esc(s.title) + '</h4>' +
          '<p class="muted">' + fmtWhen(s.startsAt) + ' · ' + esc(s.location) + '</p>' +
          (staff && canBill()
            ? '<form class="compose" data-act="meet" data-id="' + esc(s.id) + '"><input name="meetUrl" value="' + esc(s.meetUrl) + '" placeholder="https://meet.google.com/..."><button class="btn" type="submit">Simpan tautan Meet</button></form>'
            : '<a class="btn" href="' + esc(s.meetUrl) + '" target="_blank" rel="noopener">Buka Meet</a>') +
          '<a class="wa" href="' + esc(SEED.school.waGroup) + '" target="_blank" rel="noopener">WA grup</a>' +
          (staff ? '<div class="form-grid" style="margin-top:10px">' + roll + '</div>' : '') +
          '</article>';
      }).join('') + '</div>';
  }

  function viewBayar() {
    const skus = catalog();
    return '<div class="card"><h2>Pembayaran</h2>' +
      '<p class="muted">Anton merchant (lynk.id / Mayar). Mentoring = semua SKU + live class. Satuan = checkbox produk. Status <strong>gratis</strong> = beasiswa.</p>' +
      '<div style="overflow:auto">' +
      '<table class="table"><thead><tr><th>Siswa</th><th>Status</th><th>Mentoring</th>' +
      skus.map((p) => '<th>' + esc(p.id) + '</th>').join('') +
      '<th>Nominal</th></tr></thead><tbody>' +
      SEED.students.map((s) => {
        const b = billingOf(s.id);
        const mentorOn = canMentoring(s.id);
        return '<tr><td>' + esc(s.name) + '<div class="muted">' + esc(b.note || b.plan || '') + '</div></td>' +
          '<td>' + payChip(b.status) + '<select data-act="bill-one" data-id="' + esc(s.id) + '" style="margin-top:6px">' +
          ['lunas', 'cicilan', 'belum', 'gratis'].map((st) =>
            '<option' + (b.status === st ? ' selected' : '') + ' value="' + st + '">' + st + '</option>').join('') +
          '</select></td>' +
          '<td><input type="checkbox" data-act="ent-mentor" data-id="' + esc(s.id) + '"' +
          (mentorOn ? ' checked' : '') + (b.status === 'gratis' ? ' disabled' : '') + '></td>' +
          skus.map((p) =>
            '<td><input type="checkbox" data-act="ent-sku" data-id="' + esc(s.id) + '" data-sku="' + esc(p.id) + '"' +
            (canSku(s.id, p.id) ? ' checked' : '') + (mentorOn ? ' disabled' : '') + '></td>'
          ).join('') +
          '<td>' + fmtRp(b.amount) + '<div class="muted">' + esc(b.source) + '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }

  function openDrawer(id) {
    ui.drawerId = id;
    $('drawer').hidden = false;
    $('drawer-scrim').hidden = false;
    $('drawer').innerHTML = viewStudentDrawer(id);
  }
  function closeDrawer() {
    ui.drawerId = null;
    $('drawer').hidden = true;
    $('drawer').innerHTML = '';
    $('drawer-scrim').hidden = true;
  }

  /* ── events ──────────────────────────────────────────────────────── */
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'role-switch') {
      ui.role = t.value;
      ui.tab = 'home';
      ui.mentorTab = 'siswa';
      closeDrawer();
      render();
      return;
    }
    if (t.id === 'persona-switch') {
      ui.personaId = t.value;
      ui.lectureId = db.lastLecture[ui.personaId] || 'l1';
      ui.kolabSel = new Set();
      ui.skuId = null;
      ui.skuPreview = false;
      ui.tab = 'home';
      render();
      return;
    }
    if (t.matches('[data-act="filter-siswa"]')) {
      ui.filterSiswa = t.value;
      render();
      const el = document.querySelector('[data-act="filter-siswa"]');
      if (el) {
        el.focus();
        const n = el.value.length;
        el.setSelectionRange(n, n);
      }
      return;
    }
    if (t.matches('[data-act="ksel"]')) {
      const h = t.getAttribute('data-handle');
      if (t.checked) ui.kolabSel.add(h); else ui.kolabSel.delete(h);
      render();
      return;
    }
    if (t.matches('[data-act="bill-one"]')) {
      const id = t.getAttribute('data-id');
      const b = billingOf(id);
      b.status = t.value;
      b.updatedAt = new Date().toISOString();
      if (t.value === 'gratis') {
        b.plan = 'mentoring';
        b.products = ALL_SKUS();
      }
      if (t.value === 'belum') {
        b.plan = '';
        b.products = [];
      }
      save();
      toast('Ledger ' + nameOf(id) + ' → ' + t.value);
      render();
      if (ui.drawerId) openDrawer(ui.drawerId);
      return;
    }
    if (t.matches('[data-act="ent-mentor"]')) {
      const id = t.getAttribute('data-id');
      const b = billingOf(id);
      if (t.checked) {
        b.plan = 'mentoring';
        b.products = ALL_SKUS();
        if (b.status === 'belum') b.status = 'lunas';
      } else {
        b.plan = b.products.length ? 'sku' : '';
        if (!b.products.length) b.status = 'belum';
      }
      save();
      toast((t.checked ? 'Mentoring on · ' : 'Mentoring off · ') + nameOf(id));
      render();
      if (ui.drawerId) openDrawer(ui.drawerId);
      return;
    }
    if (t.matches('[data-act="ent-sku"]')) {
      const id = t.getAttribute('data-id');
      const sku = t.getAttribute('data-sku');
      const b = billingOf(id);
      if (b.plan === 'mentoring' || b.status === 'gratis') return;
      const set = new Set(b.products);
      if (t.checked) set.add(sku); else set.delete(sku);
      b.products = [...set];
      b.plan = b.products.length ? 'sku' : '';
      if (!b.products.length) b.status = 'belum';
      else if (b.status === 'belum') b.status = 'lunas';
      save();
      render();
      if (ui.drawerId) openDrawer(ui.drawerId);
      return;
    }
    if (t.matches('[data-act="hadir"]')) {
      const sid = t.getAttribute('data-sid');
      const uid = t.getAttribute('data-uid');
      db.attendance[sid] = db.attendance[sid] || {};
      db.attendance[sid][uid] = t.value === '—' ? '' : t.value;
      save();
      return;
    }
    if (t.matches('[data-act="csv"]')) {
      const file = t.files && t.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        kolabOf(ui.personaId).creators = parseCsv(String(reader.result));
        save();
        toast('CSV masuk · ' + kolabOf(ui.personaId).creators.length + ' kreator (milik ' + nameOf(ui.personaId) + ')');
        render();
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-act="filter-siswa"]')) {
      ui.filterSiswa = t.value;
      render();
      const el = document.querySelector('[data-act="filter-siswa"]');
      if (el) {
        el.focus();
        const n = el.value.length;
        el.setSelectionRange(n, n);
      }
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'tab') {
      const id = btn.getAttribute('data-id');
      if (isStaff()) ui.mentorTab = id;
      else {
        ui.tab = id;
        if (id === 'pustaka') { ui.skuId = null; ui.skuPreview = false; }
      }
      render();
    } else if (act === 'open-sku') {
      const id = btn.getAttribute('data-id');
      if (!canSku(ui.personaId, id) && !isStaff()) return;
      ui.skuId = id;
      ui.skuPreview = false;
      ui.tab = 'sku';
      render();
    } else if (act === 'contoh-sku') {
      ui.skuId = btn.getAttribute('data-id');
      ui.skuPreview = true;
      ui.tab = 'sku';
      render();
    } else if (act === 'toggle-example') {
      const p = productById(btn.getAttribute('data-id'));
      if (p && canBill()) {
        p.example = !p.example;
        save();
        toast(p.example ? 'Kembali ke contoh' : 'Ditandai file Anton');
        render();
      }
    } else if (act === 'toggle-kur') {
      ui.kurOpen = !ui.kurOpen;
      render();
    } else if (act === 'open-lec') {
      const id = btn.getAttribute('data-id');
      const lec = lectureById(id);
      if (!canMentoring(ui.personaId) && !isStaff()) {
        if (lec && lec.skuId && canSku(ui.personaId, lec.skuId)) {
          ui.skuId = lec.skuId;
          ui.skuPreview = false;
          ui.tab = 'sku';
          render();
          return;
        }
        toast('Live class hanya mentoring.');
        ui.tab = 'pustaka';
        render();
        return;
      }
      ui.lectureId = id;
      db.lastLecture[ui.personaId] = ui.lectureId;
      save();
      ui.tab = 'belajar';
      ui.kurOpen = false;
      render();
    } else if (act === 'toggle-done') {
      const id = btn.getAttribute('data-id');
      markDone(ui.personaId, id, !isDone(ui.personaId, id));
      render();
    } else if (act === 'pane') {
      ui.pane = btn.getAttribute('data-id');
      render();
    } else if (act === 'open-student') {
      openDrawer(btn.getAttribute('data-id'));
    } else if (act === 'close-drawer') {
      closeDrawer();
    } else if (act === 'del-lec') {
      db.lectures = db.lectures.filter((l) => l.id !== btn.getAttribute('data-id'));
      save();
      render();
    } else if (act === 'csv-demo') {
      fetch('./data/kalodata-creators.csv').then((r) => r.text()).then((txt) => {
        kolabOf(ui.personaId).creators = parseCsv(txt);
        save();
        toast('Dummy Kalodata untuk ' + nameOf(ui.personaId));
        render();
      });
    } else if (act === 'fake-send') {
      const k = kolabOf(ui.personaId);
      const q = SEED.kolabQuota;
      const left = Math.max(0, q.weekly - k.used);
      const chosen = [...ui.kolabSel].slice(0, Math.min(q.batch, left));
      chosen.forEach((handle, i) => {
        k.used += 1;
        k.jobs.push({ handle, status: 'sent', at: new Date().toISOString() });
        const row = k.creators.find((c) => c.handle === handle);
        if (row) row.status = 'sent';
        setTimeout(() => {
          if (i % 4 === 3) {
            k.jobs.push({ handle, status: 'failed', at: new Date().toISOString() });
          } else if (i % 3 === 0) {
            k.jobs.push({ handle, status: 'replied', at: new Date().toISOString() });
            if (row) row.status = 'connected';
          }
          save();
          render();
        }, 600 + i * 200);
      });
      ui.kolabSel = new Set();
      save();
      toast('Antrian palsu: ' + chosen.length + ' undangan. Kuota toko berkurang.');
      render();
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.matches('[data-act]')) return;
    e.preventDefault();
    const act = form.getAttribute('data-act');
    const fd = new FormData(form);
    if (act === 'ask') {
      db.threads.push({
        id: 't-' + Date.now(),
        lectureId: form.getAttribute('data-lec'),
        authorId: ui.personaId,
        title: String(fd.get('title')),
        body: String(fd.get('body')),
        answered: false,
        createdAt: new Date().toISOString()
      });
      save();
      render();
    } else if (act === 'reply') {
      const tid = form.getAttribute('data-tid');
      db.replies.push({
        id: 'r-' + Date.now(),
        threadId: tid,
        authorId: ui.role === 'asisten' ? 'u-lia' : 'u-anton',
        body: String(fd.get('body')),
        isStaff: true,
        createdAt: new Date().toISOString()
      });
      const th = db.threads.find((t) => t.id === tid);
      if (th) th.answered = true;
      save();
      render();
    } else if (act === 'announce') {
      db.announcements.unshift({
        id: 'an-' + Date.now(),
        title: String(fd.get('title')),
        body: String(fd.get('body')),
        at: new Date().toISOString()
      });
      save();
      render();
    } else if (act === 'note') {
      const id = form.getAttribute('data-id');
      db.notes[id] = db.notes[id] || [];
      db.notes[id].push({ at: new Date().toISOString().slice(0, 10), body: String(fd.get('body')) });
      save();
      openDrawer(id);
    } else if (act === 'add-lec') {
      const type = String(fd.get('type'));
      const url = String(fd.get('url') || '');
      db.lectures.push({
        id: 'l-' + Date.now(),
        weekId: form.getAttribute('data-week'),
        type,
        title: String(fd.get('title')),
        mins: 5,
        url,
        iframe: type === 'tool' ? url : '',
        requiredBefore: form.querySelector('[name=req]').checked,
        body: type === 'text' ? url : '',
        resources: [],
        job: type === 'tool' ? 'Alat baru' : ''
      });
      save();
      render();
    } else if (act === 'meet') {
      const ses = db.sessions.find((s) => s.id === form.getAttribute('data-id'));
      if (ses) ses.meetUrl = String(fd.get('meetUrl'));
      save();
      toast('Tautan Meet disimpan');
      render();
    }
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('Hapus data lokal prototype ini?')) return;
    localStorage.removeItem(KEY);
    db = defaultState();
    ui.kolabSel = new Set();
    closeDrawer();
    render();
  });
  $('drawer-scrim').addEventListener('click', closeDrawer);

  render();
})();
