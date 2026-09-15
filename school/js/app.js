/* Sekolah Anton localhost prototype. No live WhatsApp, TikTok, Mayar, or Contabo. */
(function () {
  const SEED = window.ANTON_SEED;
  const KEY = 'anton-school-v2';
  const TOOL_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-modals allow-popups';
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

  function cloneLectures() {
    return SEED.lectures.map((l) => ({
      ...l,
      points: (l.points || []).slice(),
      questions: (l.questions || []).map((q) => ({ ...q })),
      resources: (l.resources || []).map((r) => ({ ...r }))
    }));
  }

  function hydrateCurriculum(merged) {
    const seedIds = (SEED.lectures || []).map((l) => l.id).join('|');
    const have = (merged.lectures || []).map((l) => l.id).join('|');
    const legacy = !merged.lectures || !merged.lectures.length ||
      merged.lectures.every((l) => /^l[0-9]+$/.test(l.id));
    if (legacy) {
      merged.lectures = cloneLectures();
      merged.weeks = SEED.weeks.map((w) => ({ ...w }));
      merged.sessions = SEED.sessions.map((s) => ({
        ...s,
        required: (s.required || []).slice()
      }));
      merged.progress = {};
      Object.entries(SEED.progressSeed).forEach(([sid, ids]) => {
        merged.progress[sid] = Object.fromEntries(ids.map((id) => [id, true]));
      });
      merged.lastLecture = merged.lastLecture || {};
      Object.keys(merged.progress).forEach((sid) => {
        const ids = Object.keys(merged.progress[sid]);
        merged.lastLecture[sid] = ids[ids.length - 1] || (SEED.lectures[0] && SEED.lectures[0].id);
      });
      merged.threads = SEED.threads.map((t) => ({ ...t }));
    } else if (have === seedIds) {
      const byId = Object.fromEntries(SEED.lectures.map((l) => [l.id, l]));
      merged.lectures = merged.lectures.map((l) => {
        const seed = byId[l.id];
        if (!seed) return l;
        return {
          ...seed,
          ...l,
          url: l.url || seed.url,
          videoBlob: !!l.videoBlob,
          videoName: l.videoName || '',
          points: (l.points && l.points.length) ? l.points : (seed.points || []).slice(),
          questions: (l.questions && l.questions.length) ? l.questions : (seed.questions || []).map((q) => ({ ...q })),
          resources: (l.resources && l.resources.length) ? l.resources : (seed.resources || []).map((r) => ({ ...r }))
        };
      });
    } else {
      merged.lectures.forEach((l) => {
        if (!l.points) l.points = [];
        if (!l.questions) l.questions = [];
        if (!l.resources) l.resources = [];
      });
    }
    if (!merged.sectionStyle) merged.sectionStyle = 'minggu';
    if (!merged.weeks || !merged.weeks.length) {
      merged.weeks = SEED.weeks.map((w) => ({ ...w }));
    }
  }

  function defaultState() {
    const progress = {};
    Object.entries(SEED.progressSeed).forEach(([sid, ids]) => {
      progress[sid] = Object.fromEntries(ids.map((id) => [id, true]));
    });
    const last = {};
    Object.keys(progress).forEach((sid) => {
      const ids = Object.keys(progress[sid]);
      last[sid] = ids[ids.length - 1] || (SEED.lectures[0] && SEED.lectures[0].id);
    });
    return {
      lectures: cloneLectures(),
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
      kolab: {},
      sectionStyle: 'minggu'
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const merged = Object.assign(defaultState(), JSON.parse(raw));
      if (!merged.catalog || !merged.catalog.length) {
        merged.catalog = SEED.catalog.map((p) => ({ ...p, outline: (p.outline || []).slice() }));
      } else {
        const byId = Object.fromEntries((SEED.catalog || []).map((p) => [p.id, p]));
        merged.catalog = merged.catalog.map((p) => {
          const seed = byId[p.id];
          if (!seed) return p;
          return {
            ...seed,
            ...p,
            cover: seed.cover || p.cover,
            sheet: seed.sheet || p.sheet,
            lynk: seed.lynk || p.lynk,
            iframe: seed.iframe || p.iframe,
            outline: (p.outline && p.outline.length) ? p.outline : (seed.outline || []).slice()
          };
        });
        (SEED.catalog || []).forEach((p) => {
          if (!merged.catalog.some((x) => x.id === p.id)) {
            merged.catalog.push({ ...p, outline: (p.outline || []).slice() });
          }
        });
      }
      hydrateCurriculum(merged);
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
    lectureId: db.lastLecture['s-kamu'] || (SEED.lectures[0] && SEED.lectures[0].id),
    pane: 'tanya',
    drawerId: null,
    kolabSel: new Set(),
    filterSiswa: '',
    kurOpen: false,
    skuId: null,
    skuPreview: false,
    skuFrom: 'pustaka',
    editLecId: null,
    secFold: null
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
  function lectureById(id) {
    if (id === 'kolab') {
      return { id: 'kolab', type: 'tool', tool: 'kolab', title: 'Kolab — cari kreator', mins: 20 };
    }
    return lectures().find((l) => l.id === id);
  }
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
  function kurProgress(sid) {
    const list = lectures();
    const n = list.filter((l) => isDone(sid, l.id)).length;
    return { n: n, total: list.length, pct: list.length ? Math.round((n / list.length) * 100) : 0 };
  }
  function progressBarHtml(sid) {
    const p = kurProgress(sid);
    return '<div class="kur-progress">' +
      '<div class="kur-progress-top"><strong>Kurikulum</strong>' +
      '<span>' + p.n + ' / ' + p.total + ' video · ' + p.pct + '%</span></div>' +
      '<div class="bar kur-bar"><span style="width:' + p.pct + '%"></span></div></div>';
  }
  function currentWeekId(sid) {
    for (let i = 0; i < db.weeks.length; i += 1) {
      if (progressPct(sid, db.weeks[i].id) < 100) return db.weeks[i].id;
    }
    return db.weeks.length ? db.weeks[db.weeks.length - 1].id : '';
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
        kind: 'youtube',
        embed: 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1&rel=0&modestbranding=1',
        thumb: 'https://i.ytimg.com/vi/' + yt[1] + '/hqdefault.jpg'
      };
    }
    const drive = u.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (drive) {
      return { kind: 'drive', embed: 'https://drive.google.com/file/d/' + drive[1] + '/preview' };
    }
    return null;
  }

  function videoKindLabel(lec) {
    if (lec.videoBlob) return lec.videoName ? ('File · ' + lec.videoName) : 'File di browser ini';
    const e = parseEmbed(lec.url);
    if (e && e.kind === 'youtube') return 'YouTube';
    if (e && e.kind === 'drive') return 'Google Drive';
    if (lec.url && /tiktok\.com/i.test(lec.url)) return 'TikTok (buka tab)';
    if (lec.url) return 'Tautan';
    return 'Belum ada video';
  }

  const BLOB_DB = 'anton-school-blobs-v1';
  function blobDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(BLOB_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('files'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function blobPut(id, file) {
    return blobDb().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, id);
      tx.oncomplete = () => { d.close(); resolve(); };
      tx.onerror = () => { d.close(); reject(tx.error); };
    }));
  }
  function blobGet(id) {
    return blobDb().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readonly');
      const q = tx.objectStore('files').get(id);
      q.onsuccess = () => { d.close(); resolve(q.result || null); };
      q.onerror = () => { d.close(); reject(q.error); };
    }));
  }
  function blobDel(id) {
    return blobDb().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = () => { d.close(); resolve(); };
      tx.onerror = () => { d.close(); reject(tx.error); };
    })).catch(() => {});
  }
  function blobClearAll() {
    return blobDb().then((d) => new Promise((resolve) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').clear();
      tx.oncomplete = () => { d.close(); resolve(); };
      tx.onerror = () => { d.close(); resolve(); };
    })).catch(() => {});
  }

  function sectionStyle() { return db.sectionStyle === 'modul' ? 'modul' : 'minggu'; }
  function sectionWord() { return sectionStyle() === 'modul' ? 'Modul' : 'Minggu'; }
  function toolsCatalog() { return catalog().filter((p) => p.group === 'alat'); }
  function ensureSecFold() {
    if (ui.secFold) return;
    ui.secFold = new Set();
    (db.weeks || []).forEach((w, i) => { if (i > 0) ui.secFold.add(w.id); });
  }
  function isSecOpen(id) {
    ensureSecFold();
    return !ui.secFold.has(id);
  }
  function setSecOpen(id, open) {
    ensureSecFold();
    if (open) ui.secFold.delete(id);
    else ui.secFold.add(id);
  }
  function retitleDefaultSections() {
    const word = sectionWord();
    db.weeks.forEach((w, i) => {
      const t = String(w.title || '').trim();
      if (/^(Minggu|Modul)\b/i.test(t)) {
        w.title = t.replace(/^(Minggu|Modul)/i, word);
      } else if (!t) {
        w.title = word + ' ' + (i + 1);
      }
    });
  }

  const MAX_VID = 80 * 1024 * 1024;

  function moveLecInSection(id, dir) {
    const l = lectureById(id);
    if (!l) return;
    const marked = lectures().map((x, i) => ({ x, i })).filter((o) => o.x.weekId === l.weekId);
    const pos = marked.findIndex((o) => o.x.id === id);
    const other = marked[pos + dir];
    if (pos < 0 || !other) return;
    const a = marked[pos].i;
    const b = other.i;
    const tmp = db.lectures[a];
    db.lectures[a] = db.lectures[b];
    db.lectures[b] = tmp;
  }

  function ingestVideoFile(file, opts) {
    opts = opts || {};
    if (!file) return;
    if (file.type && file.type.indexOf('video') !== 0 && !/\.(mp4|webm|mov|m4v)$/i.test(file.name || '')) {
      toast('Pilih file video (MP4 / WebM).');
      return;
    }
    if (file.size > MAX_VID) {
      toast('Maks 80 MB di prototype. Unggah ke YouTube/Drive lalu tempel tautan.');
      return;
    }
    let id = opts.lecId;
    if (!id) {
      if (!opts.weekId) return;
      id = 'v-' + Date.now();
      const fromName = (file.name || 'Video').replace(/\.[^.]+$/, '');
      db.lectures.push({
        id,
        weekId: opts.weekId,
        type: 'video',
        title: (opts.title || fromName).trim() || fromName,
        mins: 8,
        url: '',
        videoBlob: true,
        videoName: file.name,
        requiredBefore: false,
        points: [],
        questions: [],
        resources: []
      });
      ui.editLecId = id;
    }
    const lec = lectureById(id);
    blobPut(id, file).then(() => {
      if (lec) {
        lec.videoBlob = true;
        lec.videoName = file.name;
        lec.type = 'video';
      }
      save();
      toast('Video tersimpan di browser ini (bukan ke lynk / server).');
      render();
    }).catch(() => toast('Gagal simpan video di browser.'));
  }

  function payChip(st) {
    const label = { lunas: 'Lunas', cicilan: 'Cicilan', belum: 'Belum bayar', gratis: 'Beasiswa' }[st] || st;
    return '<span class="chip ' + esc(st) + '">' + esc(label) + '</span>';
  }

  function typeLabel(t) {
    return { video: 'Video', text: 'Bacaan', document: 'File', tool: 'Alat' }[t] || t;
  }

  /* ── Kolab (per-student) ─────────────────────────────────────────── */
  function cloneKalodata() {
    return (SEED.kalodataCreators || []).map((c) => Object.assign({ status: 'new' }, c));
  }

  function kolabOf(sid) {
    if (!db.kolab[sid]) {
      db.kolab[sid] = {
        creators: cloneKalodata(),
        used: SEED.kolabQuota.used,
        jobs: [],
        source: 'kalodata-sample'
      };
    } else if (!db.kolab[sid].creators.length && db.kolab[sid].source !== 'import') {
      db.kolab[sid].creators = cloneKalodata();
      db.kolab[sid].source = 'kalodata-sample';
    }
    return db.kolab[sid];
  }

  function shopTiktok() {
    return SEED.shopTiktok || { handle: 'bule_barat', display: '@bule_barat', url: 'https://www.tiktok.com/@bule_barat', name: 'Steven' };
  }

  function kolabMsg(c) {
    const shop = shopTiktok();
    const handle = (c && c.handle) || '{handle}';
    const niche = (c && c.niche) || '{niche}';
    return 'Halo ' + handle + ',\n\nAku ' + shop.name + ' dari TikTok ' + shop.display +
      '. Lagi jual ' + SEED.product.name + ' dan cari kreator niche ' + niche +
      ' buat collab affiliate.\n\nKomisi yang aku tawar ' + SEED.product.suggestedCommission +
      '%. Boleh aku kirim undangan dari Affiliate Center?\n\n— ' + shop.display;
  }

  function kolabReply(c) {
    const shop = shopTiktok();
    return 'Halo ' + shop.display + ', boleh. Kirim undangan Affiliate Center aja ya, aku cek dulu.';
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
    const logo = $('school-logo');
    if (logo) {
      logo.src = SEED.school.photo || SEED.school.logo;
      logo.alt = SEED.school.name;
    }
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
      const allowed = studentTabs().map((t) => t.id).concat(['sku', 'alat']);
      if (allowed.indexOf(ui.tab) === -1) ui.tab = 'home';
    }
    renderTabs();
  }

  function studentTabs() {
    if (canMentoring(ui.personaId)) {
      return [
        { id: 'home', label: 'Home' },
        { id: 'belajar', label: 'Belajar' },
        { id: 'alat', label: 'Alat' },
        { id: 'pustaka', label: 'Pustaka' },
        { id: 'diskusi', label: 'Diskusi' },
        { id: 'progres', label: 'Progres' }
      ];
    }
    return [
      { id: 'home', label: 'Home' },
      { id: 'alat', label: 'Alat' },
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
      const tabs = studentTabs();
      const sku = ui.tab === 'sku' ? productById(ui.skuId) : null;
      const skuTab = ui.skuFrom || (sku && sku.group === 'alat' ? 'alat' : 'pustaka');
      dock.hidden = false;
      dock.className = 'dock cols-' + tabs.length;
      dock.innerHTML = tabs.map((t) =>
        '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' +
        (t.id === ui.tab || (ui.tab === 'sku' && t.id === skuTab)) + '">' + esc(t.label) + '</button>'
      ).join('');
    } else {
      dock.hidden = true;
      dock.className = 'dock';
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
      else if (tab === 'alat') main.innerHTML = viewAlat();
      else if (tab === 'pustaka') main.innerHTML = viewStudentPustaka();
      else if (tab === 'sku') main.innerHTML = viewSkuPage();
      else if (tab === 'diskusi') main.innerHTML = canMentoring(ui.personaId) ? viewDiskusi(false) : viewLocked();
      else if (tab === 'progres') main.innerHTML = viewProgres();
      else if (tab === 'kolab') main.innerHTML = viewKolab();
    }
    bindLazy();
    bindBlobVideos();
  }

  function bindLazy() {
    $('main').querySelectorAll('[data-embed]').forEach((el) => {
      el.addEventListener('click', () => {
        const src = el.getAttribute('data-embed');
        if (!src) return;
        el.outerHTML = '<iframe src="' + esc(src) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video materi"></iframe>';
      });
    });
  }

  function bindBlobVideos() {
    $('main').querySelectorAll('video[data-blob]').forEach((el) => {
      const id = el.getAttribute('data-blob');
      blobGet(id).then((file) => {
        if (!file || !el.isConnected) return;
        el.src = URL.createObjectURL(file);
      });
    });
  }

  /* ── student views ───────────────────────────────────────────────── */
  function viewHome() {
    if (!canMentoring(ui.personaId)) return viewHomeAlacarte();
    const s = student();
    const lastId = db.lastLecture[s.id] || (SEED.lectures[0] && SEED.lectures[0].id);
    const last = lectureById(lastId) || lectures()[0];
    const ses = nextSession();
    const bill = billingOf(s.id);
    const ann = db.announcements[0];
    return (
      '<div class="grid-2">' +
        '<section class="card resume">' +
          '<p class="muted">Lanjutkan</p>' +
          '<h2>' + esc(last.title) + '</h2>' +
          '<p class="muted">' + esc(typeLabel(last.type)) + ' · ' + kurProgress(s.id).n + '/' + kurProgress(s.id).total + ' video</p>' +
          progressBarHtml(s.id) +
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
          weekList(s.id, currentWeekId(s.id)) +
        '</section>' +
        '<section class="card">' +
          '<h2>Pengumuman</h2>' +
          (ann ? '<p><strong>' + esc(ann.title) + '</strong></p><p class="muted">' + esc(ann.body) + '</p>' : '<p class="muted">Tidak ada.</p>') +
          '<div style="margin-top:12px">' + payChip(bill.status) +
            '<span class="muted"> · mentoring' + (bill.note ? ' · ' + esc(bill.note) : '') + '</span></div>' +
        '</section>' +
      '</div>' +
      alatHomeStrip(s.id)
    );
  }

  function viewHomeAlacarte() {
    const s = student();
    const b = billingOf(s.id);
    const owned = catalog().filter((p) => canSku(s.id, p.id));
    const ownedHtml = owned.length
      ? owned.map((p) =>
          '<section class="card resume home-sku">' +
            skuCoverHtml(p, 'home-sku-cover') +
            '<div class="sku-body">' +
              '<p class="muted">Pustaka kamu</p>' +
              '<h2>' + esc(p.title) + '</h2>' +
              '<p class="muted">' + esc(p.job) + '</p>' +
              '<button class="btn" data-act="open-sku" data-from="alat" data-id="' + esc(p.id) + '">Buka</button>' +
            '</div>' +
          '</section>'
        ).join('')
      : '<section class="card"><h2>Belum ada produk</h2><p class="muted">Beli satu alat di lynk.id, atau ikut mentoring supaya semua kebuka.</p></section>';
    return catalogHero() + ownedHtml + alatHomeStrip(s.id) +
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
      '<li><span>' + (isDone(sid, l.id) ? '<span class="tick-ok" aria-hidden="true">✓</span> ' : '<span class="tick-off" aria-hidden="true"></span> ') +
      esc(l.title) + '</span>' +
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
      : renderCanvas(lec) + renderLecAfter(lec) + renderPanes(lec);
    return '<div class="player-layout">' +
      '<div>' +
        progressBarHtml(ui.personaId) +
        '<button type="button" class="kur-toggle" data-act="toggle-kur">' +
        (ui.kurOpen ? 'Tutup kurikulum' : 'Kurikulum · ' + kurProgress(ui.personaId).pct + '%') + '</button>' +
        inner + '</div>' +
      '<aside class="kurikulum-pane' + (ui.kurOpen ? ' is-open' : '') + '">' +
        renderKurikulumSidebar() + '</aside>' +
      '</div>';
  }

  function renderCanvas(lec) {
    let body = '';
    if (lec.type === 'video') {
      if (lec.videoBlob) {
        body = '<video class="lec-video" controls playsinline preload="metadata" data-blob="' + esc(lec.id) + '"></video>';
      } else {
        const e = parseEmbed(lec.url);
        if (e && e.embed) {
          body = '<div class="lazy-embed" data-embed="' + esc(e.embed) + '">' +
            '<div class="play-orb">▶</div>' +
            '<div class="lazy-note">Ketuk untuk memuat · ' + (e.kind === 'drive' ? 'Google Drive' : 'hemat data') + '</div></div>';
        } else if (lec.url) {
          body = '<div class="article"><p>Video ini tidak bisa diputar di dalam kelas (TikTok / tautan lain).</p>' +
            '<a class="btn" href="' + esc(lec.url) + '" target="_blank" rel="noopener">Buka video</a>' +
            '<p class="muted" style="margin-top:10px">YouTube atau file MP4 tampil di sini. TikTok biasanya harus dibuka di aplikasinya.</p></div>';
        } else {
          body = '<div class="article"><p class="muted">Belum ada video. Mentor tempel tautan atau unggah di Kurikulum.</p></div>';
        }
      }
    } else if (lec.type === 'tool') {
      let src = lec.iframe || '';
      const sku = lec.skuId ? productById(lec.skuId) : null;
      if (sku && sku.example && src) src += (src.indexOf('?') >= 0 ? '&' : '?') + 'contoh=1';
      body = '<iframe class="tool-frame" sandbox="' + TOOL_SANDBOX + '" src="' + esc(src) + '" title="' + esc(lec.title) + '"></iframe>';
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
        '<button class="btn' + (done ? ' done-ok' : '') + '" data-act="toggle-done" data-id="' + esc(lec.id) + '">' +
        (done ? 'Selesai ✓' : 'Tandai selesai') + '</button>' +
      '</div></div>';
  }

  function renderLecAfter(lec) {
    const doc = (lec.resources || [])[0];
    let html = '';
    if (doc) {
      const dummy = /handout\.html/.test(doc.url || '');
      html += '<div class="card lec-after"><h3>Dokumen</h3>' +
        '<a class="doc-link" href="' + esc(doc.url) + '" target="_blank" rel="noopener">' + esc(doc.name || 'Lembar kerja') + '</a>' +
        (dummy ? '<p class="muted" style="margin:8px 0 0">Contoh lembar kerja. Bukan file Anton.</p>' : '') +
        '</div>';
    }
    if (lec.points && lec.points.length) {
      html += '<div class="card lec-after"><h3>Poin penting</h3><ul class="key-points">' +
        lec.points.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
    }
    if (lec.questions && lec.questions.length) {
      html += '<div class="card lec-after"><h3>Cek pemahaman</h3>' +
        lec.questions.map((q, i) =>
          '<div class="quiz-q"><p><strong>' + (i + 1) + '.</strong> ' + esc(q.q) + '</p>' +
          (q.hint
            ? '<details><summary>Arah jawaban (contoh)</summary><p class="muted">' + esc(q.hint) + '</p></details>'
            : '') +
          '</div>'
        ).join('') +
        '<p class="muted">Bukan ujian — tidak ada skor. Tandai selesai setelah nonton dan baca.</p></div>';
    }
    return html;
  }

  function renderKurikulumSidebar() {
    let n = 0;
    return progressBarHtml(ui.personaId) + db.weeks.map((w) => {
      const items = lecturesInWeek(w.id).map((l) => {
        n += 1;
        const cur = l.id === ui.lectureId;
        return '<button type="button" class="lec' + (cur ? ' current' : '') + '" data-act="open-lec" data-id="' + esc(l.id) + '">' +
          '<span class="mark' + (isDone(ui.personaId, l.id) ? ' done' : '') + '" aria-hidden="true">' +
          (isDone(ui.personaId, l.id) ? '✓' : '') + '</span>' +
          '<span><div class="t">' + n + '. ' + esc(l.title) + '</div>' +
          '<div class="m">' + esc(l.mins) + ' mnt' + (l.requiredBefore ? ' · wajib' : '') + '</div></span></button>';
      }).join('');
      return '<div class="week-label">' + esc(w.title) + ' · ' + progressPct(ui.personaId, w.id) + '%</div>' + items;
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

  function skuCoverHtml(p, cls) {
    if (!p || !p.cover) return '';
    return '<img class="' + (cls || 'sku-cover') + '" src="' + esc(p.cover) + '" alt="' + esc(p.title) + '">';
  }

  function catalogHero() {
    const sch = SEED.school;
    return '<section class="catalog-hero">' +
      '<img class="catalog-photo" src="' + esc(sch.photo) + '" alt="Coach Anton">' +
      '<div>' +
        '<div class="catalog-brand">' +
          '<img class="catalog-mark" src="' + esc(sch.logo) + '" alt="">' +
          '<div><strong>Obrolan Marketing</strong><span>by Coach Anton GC</span></div>' +
        '</div>' +
        '<p class="muted" style="margin:6px 0 0">@obrolan.marketing · cover &amp; foto dari etalase lynk (salinan lokal).</p>' +
        '<a class="btn secondary" href="' + esc(sch.lynk) + '" target="_blank" rel="noopener" style="margin-top:8px">Etalase lynk.id</a>' +
      '</div></section>';
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
    let html = catalogHero() +
      '<h2 style="margin:12px 0 4px">Pustaka Anton</h2>' +
      '<p class="muted" style="margin:0 0 12px">Beli satuan di lynk.id, atau mentoring = semua ini + live class. Checkout tetap di lynk — bukan LarisID.</p>';
    groups.forEach((g) => {
      const items = catalog().filter((p) => p.group === g.id);
      html += '<h3 class="week-label">' + g.label + '</h3><div class="tool-grid">';
      html += items.map((p) => skuTile(p, sid)).join('');
      html += '</div>';
    });
    if (canMentoring(sid)) {
      html += '<h3 class="week-label">Khusus kelas</h3><div class="tool-grid">' +
        '<button type="button" class="card tool-tile" data-act="open-kolab">' +
          '<h3>Kolab — cari kreator</h3>' +
          '<p class="muted">Bukan produk lynk. Hanya mentoring.</p>' +
        '</button></div>';
    }
    return html;
  }

  function skuTile(p, sid) {
    const owned = canSku(sid, p.id);
    const actions = owned
      ? '<button class="btn" data-act="open-sku" data-from="pustaka" data-id="' + esc(p.id) + '">Buka</button>'
      : '<a class="btn" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Beli di lynk.id</a>' +
        '<button class="btn secondary" data-act="contoh-sku" data-from="pustaka" data-id="' + esc(p.id) + '">Lihat contoh</button>';
    return '<div class="card tool-tile sku">' +
      skuCoverHtml(p) +
      '<div class="sku-body">' +
      (owned ? '<span class="chip lunas">Punya</span>' : '<span class="chip">Satuan</span>') +
      (p.example ? ' <span class="chip warn">Contoh</span>' : '') +
      '<h3>' + esc(p.title) + '</h3>' +
      '<p class="muted">' + esc(p.job) + '</p>' +
      '<p class="sku-price">' + skuPriceHtml(p) + '</p>' +
      '<div class="row" style="margin-top:10px">' + actions + '</div></div></div>';
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
      canvas = '<iframe class="tool-frame" sandbox="' + TOOL_SANDBOX + '" src="' +
        esc(iframeSrc(p, preview)) + '" title="' + esc(p.title) + '"></iframe>';
    } else {
      const e = parseEmbed(p.url);
      canvas = '<div class="lazy-embed' + (p.cover ? ' has-cover' : '') + '"' +
        (p.cover ? ' style="background-image:url(\'' + esc(p.cover) + '\')"' : '') +
        ' data-embed="' + esc(e ? e.embed : '') + '">' +
        '<div class="play-orb">▶</div>' +
        '<div class="lazy-note">Ketuk untuk memuat · hemat data</div></div>';
      if (p.outline && p.outline.length) {
        extra = '<div class="card" style="margin-top:10px"><h3>Isi rekaman</h3><ul class="muted">' +
          p.outline.map((x) => '<li>' + esc(x) + '</li>').join('') +
          '</ul></div>';
      }
    }
    if (p.kind !== 'tool' && p.sheet) {
      extra += '<div class="card" style="margin-top:10px"><h3>Spreadsheet Anton</h3>' +
        '<p class="muted">Tangkapan layar rumus Set harga. Pakai tombol contoh di kalkulator.</p>' +
        '<img class="sheet-shot" src="' + esc(p.sheet) + '" alt="Spreadsheet kalkulator TikTok"></div>';
    }
    return '<button type="button" class="kur-toggle" data-act="tab" data-id="' + esc(ui.skuFrom || 'pustaka') + '">← ' +
      (ui.skuFrom === 'alat' ? 'Alat' : 'Pustaka') + '</button>' +
      exampleBanner(p, preview) +
      '<div class="card" style="padding:0;overflow:hidden;margin-top:10px">' +
        '<div class="canvas">' + canvas + '</div>' +
        '<div class="canvas-bar">' +
          '<div><strong>' + esc(alatName(p)) + '</strong>' +
          '<div class="muted">' + (owned ? 'Punya kamu' : 'Contoh sampai Anton isi file') +
          (p.id === 'calc' ? ' · Unduh PDF di dalam kalkulator' : '') + '</div></div>' +
          (owned
            ? '<a class="btn secondary" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Halaman lynk</a>'
            : '<a class="btn" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Beli di lynk.id</a>') +
        '</div></div>' + extra;
  }

  function alatName(p) {
    return { calc: 'Kalkulator harga', 'ai-creative': 'AI Creative', 'ai-data': 'AI Analisa' }[p.id] || p.title;
  }

  function alatHomeStrip(sid) {
    const tools = toolsCatalog();
    const tiles = tools.map((p) => {
      const owned = canSku(sid, p.id);
      return '<button type="button" class="alat-chip' + (owned ? '' : ' locked') + '" data-act="' +
        (owned ? 'open-sku' : 'contoh-sku') + '" data-from="alat" data-id="' + esc(p.id) + '">' +
        '<span><strong>' + esc(alatName(p)) + '</strong>' +
        '<em>' + (owned ? 'Buka' : 'Contoh') + '</em></span></button>';
    }).join('');
    const kolab = canMentoring(sid)
      ? '<button type="button" class="alat-chip" data-act="open-kolab"><span><strong>Kolab</strong><em>Cari kreator</em></span></button>'
      : '';
    return '<section class="card" style="margin-top:14px">' +
      '<div class="row" style="justify-content:space-between">' +
        '<h2 style="margin:0">Alat</h2>' +
        '<button type="button" class="btn-sm" data-act="tab" data-id="alat">Lihat semua</button></div>' +
      '<p class="muted">Kalkulator, AI, Kolab. Yang terkunci tetap bisa dilihat contohnya.</p>' +
      '<div class="alat-pick">' + tiles + kolab + '</div></section>';
  }

  function viewAlat() {
    const sid = ui.personaId;
    const tools = toolsCatalog();
    let html = '<h2 style="margin:0 0 4px">Alat</h2>' +
      '<p class="muted" style="margin:0 0 14px">Pilih yang mau dipakai. Mentoring = semua kebuka. Satuan = yang sudah dibeli di lynk.id.</p>' +
      '<div class="alat-list">';
    html += tools.map((p) => {
      const owned = canSku(sid, p.id);
      return '<div class="card alat-row">' +
        '<div class="sku-body">' +
        (owned ? '<span class="chip lunas">Bisa dipakai</span>' : '<span class="chip">Terkunci</span>') +
        (p.example ? ' <span class="chip warn">Contoh</span>' : '') +
        '<h3>' + esc(alatName(p)) + '</h3>' +
        '<p class="muted">' + esc(p.job) + '</p></div>' +
        '<div class="alat-row-act">' +
          (owned
            ? '<button class="btn" data-act="open-sku" data-from="alat" data-id="' + esc(p.id) + '">Buka</button>'
            : '<a class="btn" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Beli di lynk.id</a>' +
              '<button class="btn secondary" data-act="contoh-sku" data-from="alat" data-id="' + esc(p.id) + '">Lihat contoh</button>') +
        '</div></div>';
    }).join('');
    html += '</div>';
    if (canMentoring(sid)) {
      html += '<h3 class="week-label">Khusus kelas</h3>' +
        '<button type="button" class="card alat-row" data-act="open-kolab" style="width:100%;text-align:left">' +
          '<div class="sku-body" style="padding:0"><h3>Kolab — cari kreator</h3>' +
          '<p class="muted">Contoh Kalodata + DM dari ' + esc(shopTiktok().display) + '. Bukan produk lynk.</p></div>' +
        '</button>';
    }
    html += '<p class="muted" style="margin-top:16px">Rekaman webinar ada di Pustaka. Checkout tetap lynk.id.</p>';
    return html;
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
              '<li><span class="row">' + (p.cover ? '<img class="thumb" src="' + esc(p.cover) + '" alt="">' : '') +
              esc(p.title) + (p.example ? ' · contoh' : '') + '</span>' +
              '<button class="btn-sm" data-act="open-sku" data-id="' + esc(p.id) + '">Buka</button></li>'
            ).join('') + '</ul>'
          : '<p class="muted">Belum ada SKU. Beli di lynk.id atau lihat contoh di Pustaka.</p>') +
        '<p style="margin-top:12px">Bayar: ' + payChip(bill.status) +
          ' <span class="muted">' + esc(bill.note || 'satuan') + '</span></p>' +
        '<p class="muted">Mentoring membuka live class + semua produk.</p></section>';
    }
    const hadir = hadirPct(sid);
    const p = kurProgress(sid);
    const kolabOpened = !!(db.kolab[sid] && db.kolab[sid].jobs && db.kolab[sid].jobs.length);
    return '<div class="grid-2">' +
      '<section class="card"><h2>Checklist</h2>' +
        progressBarHtml(sid) +
        db.weeks.map((w) => '<h3>' + esc(w.title) + ' · ' + progressPct(sid, w.id) + '%</h3>' + weekList(sid, w.id)).join('') +
      '</section>' +
      '<section class="card">' +
        '<h2>Status</h2>' +
        '<p>Kurikulum: <strong>' + p.n + ' / ' + p.total + '</strong> · ' + p.pct + '%</p>' +
        '<p>Hadir: <strong>' + hadir + '%</strong></p>' +
        '<p>Bayar: ' + payChip(bill.status) + ' <span class="muted">' + esc(bill.note || bill.plan || '') + '</span></p>' +
        '<h3 style="margin-top:16px">Lencana (kejadian nyata)</h3>' +
        '<p class="muted">' +
          (isDone(sid, 'v1') ? '✓ Masuk kelas. ' : 'Belum mulai. ') +
          (kolabOpened ? '✓ Antri Kolab. ' : '') +
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
    const shop = shopTiktok();
    const left = Math.max(0, q.weekly - k.used);
    const ranked = k.creators.map((c) => rankCreator(c, SEED.product))
      .sort((a, b) => b.score - a.score);
    const selected = ranked.filter((c) => ui.kolabSel.has(c.handle));
    const thisSend = Math.min(selected.length, q.batch, left);
    const preview = selected[0] || ranked.find((c) => !c.skip);
    const sampleNote = k.source === 'import' ? 'CSV kamu.' : 'Contoh export Kalodata (bukan scrape).';
    return '<section class="card">' +
      '<h2>Kolab · kuota toko, bukan blast</h2>' +
      '<p class="muted">Pengirim contoh: <a href="' + esc(shop.url) + '" target="_blank" rel="noopener">' + esc(shop.display) + '</a> · akun TikTok ' +
      esc(shop.name) + '. ' + sampleNote + ' Antrian menghormati cap TikTok: 50 / kirim, 1.000 / hari, kuota mingguan untuk yang belum connected. Prototype <strong>tidak</strong> mengirim ke TikTok — bukan Kaloboost.</p>' +
      '<div class="quota"><div><div class="bar"><span style="width:' + Math.min(100, (k.used / q.weekly) * 100) + '%"></span></div>' +
      '<p class="muted">Kuota unconnected minggu ini: ' + k.used + ' / ' + q.weekly + ' terpakai · sisa ' + left +
      ' · cap harian ' + q.dailyCap + ' · batch ' + q.batch + '</p></div>' +
      '<div>' + payChip(billingOf(sid).status) + ' <span class="muted">' + esc(nameOf(sid)) + '</span></div></div>' +
      '<p style="margin-top:8px"><strong>SKU:</strong> ' + esc(SEED.product.name) +
      ' · modal contoh ' + fmtRp(SEED.product.modal) +
      ' · tawaran awal ' + SEED.product.suggestedCommission + '% (dari ekonomi produk, bukan biaya LarisID)</p>' +
      '<div class="row" style="margin-top:10px">' +
        '<label class="btn secondary">Import CSV Kalodata<input type="file" accept=".csv" data-act="csv" hidden></label>' +
        '<button class="btn secondary" data-act="csv-demo">Muat ulang sampel Kalodata</button>' +
        '<button class="btn" data-act="fake-send" ' + (thisSend ? '' : 'disabled') + '>Antrikan ' + thisSend + ' DM dari ' + esc(shop.display) + '</button>' +
      '</div></section>' +
      '<div class="grid-2" style="margin-top:14px">' +
        '<section class="card" style="overflow:auto"><h3>Kreator (skor cocok)</h3>' +
        (ranked.length ? kolabTable(ranked) : '<p class="muted">Import CSV dulu. Jangan scrape Kalodata.</p>') +
        '</section>' +
        '<section class="card"><h3>DM dari ' + esc(shop.display) + '</h3>' +
          '<p class="muted">Kirim ini = ' + thisSend + ' dari kuota unconnected. Bubble di bawah adalah contoh pesan, tidak masuk inbox TikTok sungguhan.</p>' +
          (preview ? kolabBubble('out', shop.display, 'ke ' + preview.handle, kolabMsg(preview)) : '') +
          '<h3 style="margin-top:16px">Antrian</h3>' +
          kolabJobs(k) +
        '</section></div>';
  }

  function kolabTable(rows) {
    return '<table class="table"><thead><tr><th></th><th>Handle</th><th>GMV 30h</th><th>Followers</th><th>Niche</th><th>% usul</th><th>Skor</th></tr></thead><tbody>' +
      rows.map((c) => '<tr>' +
        '<td><input type="checkbox" data-act="ksel" data-handle="' + esc(c.handle) + '"' +
        (ui.kolabSel.has(c.handle) ? ' checked' : '') + (c.skip ? ' disabled' : '') + '></td>' +
        '<td>' + esc(c.handle) + (c.skip ? ' <span class="chip belum">skip</span>' : '') + '</td>' +
        '<td>' + fmtRp(c.gmv_30d) + '</td>' +
        '<td>' + (c.followers ? Number(c.followers).toLocaleString('id-ID') : '—') + '</td>' +
        '<td>' + esc(c.niche) + ' · ' + esc(c.content) + '</td>' +
        '<td>' + esc(c.suggested) + '%</td>' +
        '<td>' + Math.round(c.score) + '</td></tr>'
      ).join('') + '</tbody></table>';
  }

  function kolabBubble(dir, from, sub, body) {
    return '<div class="tt-bubble ' + dir + '">' +
      '<div class="tt-meta">' + esc(from) + (sub ? ' · ' + esc(sub) : '') + '</div>' +
      '<div class="tt-body">' + esc(body).replace(/\n/g, '<br>') + '</div></div>';
  }

  function kolabJobs(k) {
    if (!k.jobs.length) return '<p class="muted">Belum ada kiriman. Centang kreator di kiri, lalu antrikan.</p>';
    return '<div class="tt-thread">' + k.jobs.map((j) => {
      const inbound = j.dir === 'in';
      const from = j.from || (inbound ? j.handle : shopTiktok().display);
      const sub = (j.status || '') + (inbound ? '' : ' · ke ' + j.handle);
      return kolabBubble(inbound ? 'in' : 'out', from, sub, j.body || (inbound ? kolabReply({ handle: j.handle }) : kolabMsg({ handle: j.handle, niche: SEED.product.niche })));
    }).join('') + '</div>';
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
    const word = sectionWord();
    const nVid = lectures().filter((l) => l.type === 'video').length;
    ensureSecFold();
    const toolbar = '<div class="kur-toolbar">' +
      '<div><h2 style="margin:0">Kurikulum</h2>' +
        '<p class="muted" style="margin:6px 0 0">' + nVid + ' video · label bagian: ' + word.toLowerCase() +
        '. Panah untuk tutup modul. Checkout Instagram tetap lynk.id.</p></div>' +
      (readonly ? '' :
        '<div class="row kur-toolbar-actions">' +
          '<button type="button" class="btn-sm' + (sectionStyle() === 'minggu' ? ' on' : '') + '" data-act="sec-style" data-id="minggu">Pakai minggu</button>' +
          '<button type="button" class="btn-sm' + (sectionStyle() === 'modul' ? ' on' : '') + '" data-act="sec-style" data-id="modul">Pakai modul</button>' +
          '<button type="button" class="btn" data-act="add-sec">+ Bagian</button>' +
        '</div>') +
      '</div>';
    const sections = db.weeks.map((w, wi) => {
      const items = lecturesInWeek(w.id);
      const open = isSecOpen(w.id);
      const list = items.map((l, li) => lecEditorCard(l, readonly, wi, li, items.length)).join('') ||
        '<p class="muted">Belum ada video di bagian ini.</p>';
      return '<section class="card kur-sec' + (open ? '' : ' is-collapsed') + '" data-sec="' + esc(w.id) + '">' +
        '<div class="sec-head">' +
          '<button type="button" class="sec-caret" data-act="sec-fold" data-id="' + esc(w.id) + '"' +
            ' aria-expanded="' + open + '" aria-label="' + (open ? 'Tutup' : 'Buka') + ' bagian">' +
            '<i></i></button>' +
          (readonly
            ? '<h3 style="margin:0;flex:1">' + esc(w.title) + '</h3>'
            : '<input class="sec-title" data-act="sec-title" data-id="' + esc(w.id) + '" value="' + esc(w.title) + '" aria-label="Nama bagian">') +
          '<span class="muted sec-count">' + items.length + ' video</span>' +
          (readonly ? '' : '<div class="row sec-actions">' +
            '<button type="button" class="btn-sm" data-act="sec-up" data-id="' + esc(w.id) + '"' + (wi === 0 ? ' disabled' : '') + '>Naik</button>' +
            '<button type="button" class="btn-sm" data-act="sec-down" data-id="' + esc(w.id) + '"' + (wi === db.weeks.length - 1 ? ' disabled' : '') + '>Turun</button>' +
            '<button type="button" class="btn-sm" data-act="del-sec" data-id="' + esc(w.id) + '">Hapus</button>' +
          '</div>') +
        '</div>' +
        '<div class="sec-body">' +
          list +
          (readonly ? '' : addLecForm(w.id)) +
        '</div>' +
      '</section>';
    }).join('');
    return toolbar + sections;
  }

  function addLecForm(weekId) {
    return '<form class="add-lec" data-act="add-lec" data-week="' + esc(weekId) + '">' +
      '<strong>Tambah video</strong>' +
      '<input name="title" required maxlength="140" placeholder="Judul, contoh: Cara set harga promo">' +
      '<label class="muted">Tempel tautan YouTube, Google Drive, atau TikTok</label>' +
      '<input name="url" placeholder="https://www.youtube.com/watch?v=…">' +
      '<p class="muted" style="margin:0">Lebih mudah: tempel tautan. File MP4/WebM (maks 80 MB) hanya tinggal di browser ini — produksi nanti ke Drive/YouTube.</p>' +
      '<label class="vid-drop" data-act="vid-drop" data-week="' + esc(weekId) + '">' +
        '<input type="file" name="videoFile" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden>' +
        '<span>Drop video ke sini, atau ketuk untuk pilih file</span>' +
      '</label>' +
      '<div class="row">' +
        '<label class="muted"><input type="checkbox" name="req"> Wajib sebelum live class</label>' +
        '<button class="btn" type="submit">Tambah ke bagian ini</button>' +
      '</div></form>';
  }

  function lecEditorCard(l, readonly, wi, li, len) {
    const open = ui.editLecId === l.id;
    const head = '<div class="lec-edit-head">' +
      '<div><strong>' + esc(l.title) + '</strong>' +
        '<div class="muted">' + esc(videoKindLabel(l)) + (l.requiredBefore ? ' · wajib' : '') +
        ' · ' + esc(l.mins || 0) + ' mnt</div></div>' +
      '<div class="row">' +
        (readonly ? '' : '<button type="button" class="btn-sm" data-act="lec-up" data-id="' + esc(l.id) + '"' + (li === 0 ? ' disabled' : '') + '>Naik</button>' +
          '<button type="button" class="btn-sm" data-act="lec-down" data-id="' + esc(l.id) + '"' + (li === len - 1 ? ' disabled' : '') + '>Turun</button>') +
        '<button type="button" class="btn-sm" data-act="edit-lec" data-id="' + esc(l.id) + '">' +
          (open ? 'Tutup' : 'Ubah') + '</button>' +
        (readonly ? '' : '<button type="button" class="btn-sm" data-act="del-lec" data-id="' + esc(l.id) + '">Hapus</button>') +
      '</div></div>';
    if (!open) return '<article class="lec-edit">' + head + '</article>';
    const qs = (l.questions || []).concat([{ q: '', hint: '' }]);
    const qHtml = qs.map((q, i) =>
      '<div class="q-row">' +
        '<input data-act="q-field" data-id="' + esc(l.id) + '" data-i="' + i + '" data-k="q" value="' + esc(q.q || '') + '" placeholder="Pertanyaan ' + (i + 1) + '">' +
        '<input data-act="q-field" data-id="' + esc(l.id) + '" data-i="' + i + '" data-k="hint" value="' + esc(q.hint || '') + '" placeholder="Arah jawaban (opsional)">' +
      '</div>'
    ).join('');
    const doc = (l.resources && l.resources[0]) || { name: '', url: '' };
    const body = readonly
      ? '<p class="muted">Asisten hanya lihat. Anton yang unggah.</p>'
      : '<div class="lec-edit-body">' +
          '<label>Judul</label>' +
          '<input data-act="lec-field" data-id="' + esc(l.id) + '" data-k="title" value="' + esc(l.title) + '">' +
          '<div class="row2">' +
            '<div><label>Durasi (menit)</label>' +
              '<input data-act="lec-field" data-id="' + esc(l.id) + '" data-k="mins" type="number" min="1" value="' + esc(l.mins || 5) + '"></div>' +
            '<div><label>Pindah ke bagian</label>' +
              '<select data-act="lec-week" data-id="' + esc(l.id) + '">' +
                db.weeks.map((w) => '<option value="' + esc(w.id) + '"' + (w.id === l.weekId ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('') +
              '</select></div>' +
          '</div>' +
          '<label class="muted"><input type="checkbox" data-act="lec-req" data-id="' + esc(l.id) + '"' +
            (l.requiredBefore ? ' checked' : '') + '> Wajib sebelum live class</label>' +
          '<h4>Video</h4>' +
          '<p class="muted">YouTube paling lancar di dalam kelas. Drive juga bisa. Atau unggah MP4 di bawah.</p>' +
          '<input data-act="lec-field" data-id="' + esc(l.id) + '" data-k="url" value="' + esc(l.url || '') + '" placeholder="https://youtube.com/…">' +
          '<label class="vid-drop" data-act="vid-drop" data-id="' + esc(l.id) + '">' +
            '<input type="file" data-act="vid-file" data-id="' + esc(l.id) + '" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden>' +
            '<span>' + (l.videoBlob ? ('Ganti file · sekarang: ' + esc(l.videoName || 'video')) : 'Drop / pilih file MP4') + '</span>' +
          '</label>' +
          (l.videoBlob ? '<button type="button" class="btn-sm" data-act="clear-vid" data-id="' + esc(l.id) + '">Hapus file, pakai tautan</button>' : '') +
          '<h4>Lembar kerja</h4>' +
          '<input data-act="doc-name" data-id="' + esc(l.id) + '" value="' + esc(doc.name || '') + '" placeholder="Nama file, contoh: Worksheet harga.pdf">' +
          '<input data-act="doc-url" data-id="' + esc(l.id) + '" value="' + esc(doc.url || '') + '" placeholder="Tautan Drive / PDF">' +
          '<h4>Poin penting</h4>' +
          '<textarea data-act="lec-points" data-id="' + esc(l.id) + '" rows="4" placeholder="Satu poin per baris">' +
            esc((l.points || []).join('\n')) + '</textarea>' +
          '<h4>Cek pemahaman</h4>' +
          qHtml +
        '</div>';
    return '<article class="lec-edit is-open">' + head + body + '</article>';
  }

  function viewPustaka() {
    return catalogHero() +
      '<div class="card" style="margin-top:12px"><h2>Perpustakaan</h2>' +
      '<p class="muted">Produk lynk Anton. Toggle Contoh → File Anton setelah dia isi. Tidak mengubah checkout lynk.id.</p>' +
      '<div class="tool-grid">' + catalog().map((p) =>
        '<div class="card tool-tile sku">' +
          skuCoverHtml(p) +
          '<div class="sku-body">' +
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
          '</div></div></div>'
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
    if (t.matches('[data-act="sec-title"]')) {
      const w = db.weeks.find((x) => x.id === t.getAttribute('data-id'));
      if (w) { w.title = t.value; save(); }
      return;
    }
    if (t.matches('[data-act="lec-field"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (!l) return;
      const k = t.getAttribute('data-k');
      if (k === 'mins') l.mins = Math.max(1, +t.value || 5);
      else l[k] = t.value;
      if (k === 'url' && t.value) { l.videoBlob = false; }
      save();
      return;
    }
    if (t.matches('[data-act="lec-req"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (l) { l.requiredBefore = t.checked; save(); }
      return;
    }
    if (t.matches('[data-act="lec-week"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (l) { l.weekId = t.value; save(); render(); }
      return;
    }
    if (t.matches('[data-act="lec-points"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (l) {
        l.points = String(t.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
        save();
      }
      return;
    }
    if (t.matches('[data-act="doc-name"]') || t.matches('[data-act="doc-url"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (!l) return;
      l.resources = l.resources && l.resources.length ? l.resources : [{ name: '', url: '' }];
      if (t.matches('[data-act="doc-name"]')) l.resources[0].name = t.value;
      else l.resources[0].url = t.value;
      save();
      return;
    }
    if (t.matches('[data-act="q-field"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (!l) return;
      const i = +t.getAttribute('data-i');
      const k = t.getAttribute('data-k');
      l.questions = l.questions || [];
      while (l.questions.length <= i) l.questions.push({ q: '', hint: '' });
      l.questions[i][k] = t.value;
      l.questions = l.questions.filter((q) => q.q || q.hint);
      save();
      return;
    }
    if (t.matches('[data-act="vid-file"]')) {
      const file = t.files && t.files[0];
      if (file) ingestVideoFile(file, { lecId: t.getAttribute('data-id') });
      return;
    }
    if (t.matches('[name="videoFile"]')) {
      const span = t.closest('.vid-drop') && t.closest('.vid-drop').querySelector('span');
      if (span && t.files && t.files[0]) span.textContent = 'Siap diunggah · ' + t.files[0].name;
      return;
    }
    if (t.matches('[data-act="csv"]')) {
      const file = t.files && t.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const k = kolabOf(ui.personaId);
        k.creators = parseCsv(String(reader.result));
        k.source = 'import';
        save();
        toast('CSV masuk · ' + k.creators.length + ' kreator (milik ' + nameOf(ui.personaId) + ')');
        render();
      };
      reader.readAsText(file);
    }
  });

  document.addEventListener('dragover', (e) => {
    const z = e.target.closest('[data-act="vid-drop"]');
    if (!z) return;
    e.preventDefault();
    z.classList.add('is-over');
  });
  document.addEventListener('dragleave', (e) => {
    const z = e.target.closest('[data-act="vid-drop"]');
    if (z) z.classList.remove('is-over');
  });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest('[data-act="vid-drop"]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('is-over');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const form = z.closest('form');
    const titleInp = form && form.querySelector('[name="title"]');
    const title = titleInp ? String(titleInp.value || '').trim() : '';
    ingestVideoFile(file, { lecId: z.getAttribute('data-id'), weekId: z.getAttribute('data-week'), title: title });
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
      return;
    }
    if (t.matches('[data-act="lec-points"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (l) {
        l.points = String(t.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
        save();
      }
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'vid-drop' || act === 'vid-file' || act === 'add-lec' || act === 'sec-title' ||
        act === 'lec-field' || act === 'lec-points' || act === 'q-field' || act === 'doc-name' || act === 'doc-url') {
      return;
    }
    if (act === 'tab') {
      const id = btn.getAttribute('data-id');
      if (isStaff()) ui.mentorTab = id;
      else {
        ui.tab = id;
        if (id === 'pustaka' || id === 'alat') { ui.skuId = null; ui.skuPreview = false; }
      }
      render();
    } else if (act === 'open-sku') {
      const id = btn.getAttribute('data-id');
      if (!canSku(ui.personaId, id) && !isStaff()) return;
      ui.skuId = id;
      ui.skuPreview = false;
      ui.skuFrom = btn.getAttribute('data-from') || (ui.tab === 'alat' ? 'alat' : 'pustaka');
      ui.tab = 'sku';
      render();
    } else if (act === 'contoh-sku') {
      ui.skuId = btn.getAttribute('data-id');
      ui.skuPreview = true;
      ui.skuFrom = btn.getAttribute('data-from') || (ui.tab === 'alat' ? 'alat' : 'pustaka');
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
    } else if (act === 'open-kolab') {
      if (!canMentoring(ui.personaId) && !isStaff()) {
        toast('Live class hanya mentoring.');
        ui.tab = 'pustaka';
        render();
        return;
      }
      ui.lectureId = 'kolab';
      ui.tab = 'belajar';
      ui.kurOpen = false;
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
      const id = btn.getAttribute('data-id');
      db.lectures = db.lectures.filter((l) => l.id !== id);
      blobDel(id);
      if (ui.editLecId === id) ui.editLecId = null;
      save();
      render();
    } else if (act === 'edit-lec') {
      const id = btn.getAttribute('data-id');
      ui.editLecId = ui.editLecId === id ? null : id;
      const lec = lectureById(id);
      if (lec && ui.editLecId) setSecOpen(lec.weekId, true);
      render();
    } else if (act === 'sec-style') {
      db.sectionStyle = btn.getAttribute('data-id') === 'modul' ? 'modul' : 'minggu';
      retitleDefaultSections();
      save();
      render();
    } else if (act === 'add-sec') {
      e.preventDefault();
      ensureSecFold();
      const id = 's-' + Date.now();
      const n = db.weeks.length + 1;
      db.weeks.push({ id: id, title: sectionWord() + ' ' + n, due: '' });
      db.weeks.forEach((w) => { if (w.id !== id) ui.secFold.add(w.id); });
      ui.secFold.delete(id);
      save();
      render();
      toast(sectionWord() + ' ' + n + ' ditambah. Gulir ke bagian yang terbuka.');
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-sec="' + id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (act === 'sec-fold') {
      const id = btn.getAttribute('data-id');
      setSecOpen(id, !isSecOpen(id));
      render();
    } else if (act === 'del-sec') {
      const id = btn.getAttribute('data-id');
      if (lecturesInWeek(id).length) {
        toast('Pindahkan atau hapus video di bagian ini dulu.');
        return;
      }
      if (db.weeks.length < 2) {
        toast('Minimal satu bagian.');
        return;
      }
      db.weeks = db.weeks.filter((w) => w.id !== id);
      if (ui.secFold) ui.secFold.delete(id);
      save();
      render();
    } else if (act === 'sec-up' || act === 'sec-down') {
      const id = btn.getAttribute('data-id');
      const i = db.weeks.findIndex((w) => w.id === id);
      const j = act === 'sec-up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= db.weeks.length) return;
      const tmp = db.weeks[i]; db.weeks[i] = db.weeks[j]; db.weeks[j] = tmp;
      save();
      render();
    } else if (act === 'lec-up' || act === 'lec-down') {
      moveLecInSection(btn.getAttribute('data-id'), act === 'lec-up' ? -1 : 1);
      save();
      render();
    } else if (act === 'clear-vid') {
      const id = btn.getAttribute('data-id');
      const l = lectureById(id);
      if (l) { l.videoBlob = false; l.videoName = ''; }
      blobDel(id);
      save();
      toast('File dihapus. Tempel tautan kalau perlu.');
      render();
    } else if (act === 'csv-demo') {
      const k = kolabOf(ui.personaId);
      k.creators = cloneKalodata();
      k.source = 'kalodata-sample';
      save();
      toast('Sampel Kalodata · pengirim ' + shopTiktok().display);
      render();
    } else if (act === 'fake-send') {
      const k = kolabOf(ui.personaId);
      const q = SEED.kolabQuota;
      const shop = shopTiktok();
      const left = Math.max(0, q.weekly - k.used);
      const chosen = [...ui.kolabSel].slice(0, Math.min(q.batch, left));
      chosen.forEach((handle, i) => {
        k.used += 1;
        const row = k.creators.find((c) => c.handle === handle);
        k.jobs.push({
          handle: handle,
          status: 'sent',
          dir: 'out',
          from: shop.display,
          body: kolabMsg(row || { handle: handle, niche: SEED.product.niche }),
          at: new Date().toISOString()
        });
        if (row) row.status = 'sent';
        setTimeout(() => {
          if (i % 4 === 3) {
            k.jobs.push({
              handle: handle,
              status: 'failed',
              dir: 'out',
              from: shop.display,
              body: 'Gagal antri (prototype). Tidak terkirim ke TikTok.',
              at: new Date().toISOString()
            });
          } else if (i % 3 === 0) {
            k.jobs.push({
              handle: handle,
              status: 'replied',
              dir: 'in',
              from: handle,
              body: kolabReply(row || { handle: handle }),
              at: new Date().toISOString()
            });
            if (row) row.status = 'connected';
          }
          save();
          render();
        }, 600 + i * 200);
      });
      ui.kolabSel = new Set();
      save();
      toast('Antrian palsu dari ' + shop.display + ': ' + chosen.length + ' DM. Tidak masuk TikTok.');
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
      const weekId = form.getAttribute('data-week');
      const title = String(fd.get('title') || '').trim();
      const url = String(fd.get('url') || '').trim();
      const file = form.querySelector('[name="videoFile"]') && form.querySelector('[name="videoFile"]').files[0];
      if (!title) return;
      if (!url && !file) {
        toast('Tempel tautan atau unggah file video.');
        return;
      }
      const id = 'v-' + Date.now();
      db.lectures.push({
        id,
        weekId,
        type: 'video',
        title,
        mins: 8,
        url,
        videoBlob: false,
        videoName: '',
        requiredBefore: !!(form.querySelector('[name=req]') && form.querySelector('[name=req]').checked),
        points: [],
        questions: [],
        resources: []
      });
      ui.editLecId = id;
      save();
      if (file) {
        ingestVideoFile(file, { lecId: id });
      } else {
        save();
        toast('Video ditambah. Lengkapi poin & lembar kerja di Ubah.');
        render();
      }
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
    blobClearAll();
    db = defaultState();
    ui.kolabSel = new Set();
    ui.editLecId = null;
    ui.secFold = null;
    ui.skuFrom = 'pustaka';
    closeDrawer();
    render();
  });
  $('drawer-scrim').addEventListener('click', closeDrawer);

  render();
})();
