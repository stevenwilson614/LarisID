/* MasterMind with Anton GC. Students: /s/{slug}. Mentor: /obrolan.marketing/. */
(function () {
  const SEED = window.ANTON_SEED;
  const FIRST_LEC = 'v1';
  const TOOL_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-modals allow-popups';
  const PRESENT_QS = new URLSearchParams(location.search);
  const PRESENT = PRESENT_QS.get('present') === '1';
  const PRESENT_PANE = PRESENT_QS.get('pane') === 'mentor' ? 'mentor' : 'student';
  /** Anton Siswa view iframe: full student app, isolated storage, no writes. */
  const SISWA_READONLY = PRESENT && PRESENT_QS.get('readonly') === '1';
  const KEY = SISWA_READONLY ? 'anton-school-v3-siswa-preview' : 'anton-school-v3';
  const BUS = (!SISWA_READONLY && 'BroadcastChannel' in window) ? new BroadcastChannel('anton-school-v3') : null;
  const SYNC_MAX = 5 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  /* ── theme (dark default, light via topbar toggle) ─────────────────
     index.html applies the saved value before CSS paints; this keeps the
     button, <meta theme-color>, and storage in sync. Tool iframes share
     the origin and follow the same key through the `storage` event. */
  const THEME_KEY = 'anton-theme';
  const THEME_COLOR = { dark: '#18181b', light: '#ffffff' };
  function currentTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  function applyTheme(theme, persist) {
    const light = theme === 'light';
    if (light) document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[light ? 'light' : 'dark']);
    const btn = $('btn-theme');
    if (btn) {
      const label = light ? 'Mode gelap' : 'Mode terang';
      btn.setAttribute('aria-pressed', String(light));
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
    if (persist) {
      try {
        if (light) localStorage.setItem(THEME_KEY, 'light');
        else localStorage.removeItem(THEME_KEY);
      } catch (err) { /* private mode */ }
    }
  }
  const ALL_SKUS = () => (SEED.catalog || []).map((p) => p.id);
  const MENTOR_SKUS = () => (SEED.catalog || []).filter((p) => p.includedInMentoring !== false).map((p) => p.id);

  /* Students use /s/{slug}; mentor tools stay at /obrolan.marketing/. */
  const SLUG_RESERVED = {
    s: 1, school: 1, sekolah: 1, api: 1, admin: 1, www: 1, app: 1,
    harga: 1, tentang: 1, 'cara-kerja': 1, perbandingan: 1, fonts: 1,
    assets: 1, js: 1, css: 1, static: 1, invite: 1, join: 1
  };
  function normalizeSlug(s) {
    return String(s == null ? '' : s).trim().toLowerCase();
  }
  function isValidSlug(s) {
    const slug = normalizeSlug(s);
    if (!slug || slug.length > 64) return false;
    if (SLUG_RESERVED[slug]) return false;
    if (slug.indexOf('..') >= 0) return false;
    return /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(slug);
  }
  function cleanPath() {
    return location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
  }
  function onMentorPath() {
    const path = cleanPath();
    return path === '/obrolan.marketing' || path === '/school';
  }
  function onStudentVanityPath() {
    return /^\/s\/[^/]+$/i.test(cleanPath());
  }
  function pathSlug() {
    if (onMentorPath()) return 'obrolan.marketing';
    const m = cleanPath().match(/^\/s\/([^/]+)$/i);
    return m ? normalizeSlug(decodeURIComponent(m[1])) : '';
  }
  function qsSlug() {
    return normalizeSlug(PRESENT_QS.get('s') || PRESENT_QS.get('school') || '');
  }
  function schoolSlug() {
    return normalizeSlug((typeof db !== 'undefined' && db && db.schoolSlug) || SEED.school.slug);
  }
  function schoolInviteCode() {
    const fromDb = (typeof db !== 'undefined' && db && db.inviteCode) ? db.inviteCode : '';
    return String(fromDb || (SEED.cohort && SEED.cohort.invite) || '').trim();
  }
  /** Public student URL: /s/{slug}/ */
  function schoolPublicPath() {
    const slug = schoolSlug() || 'obrolan.marketing';
    return '/s/' + slug + '/';
  }
  function schoolMentorPath() {
    return '/obrolan.marketing/';
  }
  function apiBase() {
    return '/obrolan.marketing/api';
  }
  function isLocalHost() {
    const h = location.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';
  }
  function isPhoneUa() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  }
  /** Share URL: production host on localhost, this origin on the remote demo. */
  function schoolPublicUrl() {
    if (isLocalHost()) return 'https://larisid.com' + schoolPublicPath();
    return location.origin + schoolPublicPath();
  }
  function schoolLocalUrl() {
    return location.origin + schoolPublicPath();
  }
  function schoolJoinUrl() {
    const code = schoolInviteCode();
    return schoolPublicUrl() + (code ? ('?invite=' + encodeURIComponent(code)) : '');
  }
  function schoolJoinLocalUrl() {
    const code = schoolInviteCode();
    return schoolLocalUrl() + (code ? ('?invite=' + encodeURIComponent(code)) : '');
  }
  function schoolAdminUrl() {
    const path = schoolMentorPath() + 'admin';
    if (isLocalHost()) return 'https://larisid.com' + path;
    return location.origin + path;
  }
  function resolveVanitySlug() {
    const asked = pathSlug() || qsSlug();
    if (!asked) return true;
    const known = schoolSlug();
    if (asked === known) return true;
    const miss = $('slug-miss');
    if (miss) {
      miss.hidden = false;
      const askedEl = miss.querySelector('[data-asked]');
      const knownEl = miss.querySelector('[data-known]');
      const link = miss.querySelector('a');
      if (askedEl) askedEl.textContent = asked;
      if (knownEl) knownEl.textContent = known;
      if (link) link.href = schoolPublicPath();
    }
    const app = $('app');
    if (app) app.hidden = true;
    return false;
  }

  if (PRESENT_QS.get('invite')) {
    try { sessionStorage.setItem('anton-school-invite', String(PRESENT_QS.get('invite'))); } catch (err) { /* private */ }
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
          url: l.videoKey ? (l.url || '') : (l.url || seed.url),
          videoKey: l.videoKey || '',
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
    merged.weeks.forEach((w) => {
      if (w.coverBlob == null) w.coverBlob = false;
    });
    merged.lectures.forEach((l) => {
      if (!l.resources) l.resources = [];
      if (l.body == null) l.body = l.body || '';
      if (l.coverBlob == null) l.coverBlob = false;
      const seed = (SEED.lectures || []).find((x) => x.id === l.id);
      if (!seed) return;
      if (!l.coverUrl && seed.coverUrl) l.coverUrl = seed.coverUrl;
      if (l.id === 'v1') {
        if (seed.coverUrl) l.coverUrl = seed.coverUrl;
        if (seed.body) l.body = seed.body;
        if (seed.resources && seed.resources.length) l.resources = JSON.parse(JSON.stringify(seed.resources));
        if (seed.questions && seed.questions.length) l.questions = JSON.parse(JSON.stringify(seed.questions));
        if (seed.points && seed.points.length) l.points = JSON.parse(JSON.stringify(seed.points));
        if (seed.title) l.title = seed.title;
      }
    });
  }

  function migrateCrmStage(st) {
    return {
      aktif: 'mentee',
      perpanjangan: 'akan_keluar',
      grace: 'akan_keluar',
      nurture: 'sudah_keluar',
      lulus: 'mentee'
    }[st] || st;
  }

  const PIPE_STAGE_COLORS = ['#fb923c', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#f472b6', '#22d3ee', '#94a3b8', '#f87171', '#c4b5fd', '#4ade80'];
  const PIPE_EVENTS = [
    { id: 'form', label: 'Isi form' },
    { id: 'bayar', label: 'Bayar lunas' },
    { id: 'trial', label: 'Mulai trial / bayar nanti' },
    { id: 'nonton', label: 'Nonton video 1' },
    { id: 'trial_habis', label: 'Trial 24 jam habis' },
    { id: 'peringatan', label: 'Peringatan akan habis' },
    { id: 'akses_habis', label: 'Akses mentoring habis' },
    { id: 'tidak_tertarik', label: 'Tidak tertarik' },
    { id: 'mentor', label: 'Terima jadi mentor' },
    { id: 'lulus_tes', label: 'Lulus tes' }
  ];

  function defaultPipelineStages() {
    return JSON.parse(JSON.stringify(SEED.pipelineStages || []));
  }
  function defaultPipelineTransitions() {
    return JSON.parse(JSON.stringify(SEED.pipelineTransitions || []));
  }
  function normalizeStageColor(c, i) {
    const hex = String(c || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
    return PIPE_STAGE_COLORS[i % PIPE_STAGE_COLORS.length];
  }
  function hydratePipeline(merged) {
    const seedStages = defaultPipelineStages();
    const seedById = Object.fromEntries(seedStages.map((s) => [s.id, s]));
    let stages = Array.isArray(merged.pipelineStages) ? merged.pipelineStages : null;
    if (!stages || !stages.length) stages = seedStages;
    stages = stages.filter((s) => s && s.id).map((s, i) => {
      const seed = seedById[s.id] || {};
      const label = String(s.label != null ? s.label : seed.label || s.id).trim().slice(0, 40) || s.id;
      return {
        id: String(s.id),
        label: label,
        color: normalizeStageColor(s.color || seed.color, i)
      };
    });
    if (!stages.length) stages = seedStages;
    merged.pipelineStages = stages;
    const stageIds = new Set(stages.map((s) => s.id));
    let transitions = Array.isArray(merged.pipelineTransitions) ? merged.pipelineTransitions : null;
    if (!transitions) transitions = defaultPipelineTransitions();
    const eventIds = new Set(PIPE_EVENTS.map((e) => e.id));
    merged.pipelineTransitions = transitions.filter((t) => t && t.id && eventIds.has(t.when) && stageIds.has(t.to)).map((t) => ({
      id: String(t.id),
      when: String(t.when),
      to: String(t.to)
    }));
  }
  function pipelineStages() {
    if (!Array.isArray(db.pipelineStages) || !db.pipelineStages.length) {
      db.pipelineStages = defaultPipelineStages();
    }
    return db.pipelineStages;
  }
  function pipelineTransitions() {
    if (!Array.isArray(db.pipelineTransitions)) {
      db.pipelineTransitions = defaultPipelineTransitions();
    }
    return db.pipelineTransitions;
  }
  function stageColorOf(st, i) {
    if (st && st.color) return normalizeStageColor(st.color, i || 0);
    return PIPE_STAGE_COLORS[(i || 0) % PIPE_STAGE_COLORS.length];
  }
  function slugStageId(label) {
    const base = String(label || 'tahap').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 24) || 'tahap';
    const ids = new Set(pipelineStages().map((s) => s.id));
    let id = base;
    let n = 2;
    while (ids.has(id)) {
      id = base + '_' + n;
      n += 1;
    }
    return id;
  }
  function peopleInStage(stageId) {
    return people().filter((s) => crmOf(s.id).stage === stageId);
  }
  function transitionTarget(when, fallback) {
    const hit = pipelineTransitions().find((t) => t.when === when && t.to);
    const stages = pipelineStages();
    const want = (hit && hit.to) || fallback;
    if (want && stages.some((s) => s.id === want)) return want;
    if (fallback && stages.some((s) => s.id === fallback)) return fallback;
    return stages[0] && stages[0].id;
  }
  function applyTransition(personId, when, fallback, note) {
    const to = transitionTarget(when, fallback);
    if (!to) return;
    setStage(personId, to, note || ('Pindah ke ' + stageLabel(to)));
  }
  function pipeEventLabel(id) {
    const e = PIPE_EVENTS.find((x) => x.id === id);
    return (e && e.label) || id;
  }
  function movePeopleFromStage(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return 0;
    if (!pipelineStages().some((s) => s.id === toId)) return 0;
    let n = 0;
    peopleInStage(fromId).forEach((s) => {
      setStage(s.id, toId, 'Tahap dihapus · pindah ke ' + stageLabel(toId));
      n += 1;
    });
    return n;
  }
  function removePipelineStage(id, moveTo) {
    const stages = pipelineStages();
    if (stages.length <= 1) return { ok: false, reason: 'min' };
    if (!stages.some((s) => s.id === id)) return { ok: false, reason: 'missing' };
    const stuck = peopleInStage(id);
    if (stuck.length) {
      if (!moveTo || moveTo === id || !stages.some((s) => s.id === moveTo)) {
        return { ok: false, reason: 'move', count: stuck.length };
      }
      movePeopleFromStage(id, moveTo);
    }
    db.pipelineStages = stages.filter((s) => s.id !== id);
    db.pipelineTransitions = pipelineTransitions().filter((t) => t.to !== id);
    (db.actionPlans || []).forEach((p) => {
      (p.steps || []).forEach((st) => {
        if (st && st.to === id) st.to = moveTo || (db.pipelineStages[0] && db.pipelineStages[0].id) || '';
      });
    });
    if (ui.stageFilter === id) ui.stageFilter = '';
    return { ok: true, moved: stuck.length };
  }

  const DAFTAR_COL_DEFS = [
    { id: 'name', label: 'Nama', locked: true },
    { id: 'phone', label: 'Telepon' },
    { id: 'email', label: 'Email' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'city', label: 'Kota' },
    { id: 'stage', label: 'Stage' },
    { id: 'bayar', label: 'Bayar' },
    { id: 'nilai', label: 'Nilai' },
    { id: 'tags', label: 'Tags' },
    { id: 'toko', label: 'Toko' },
    { id: 'sumber', label: 'Sumber' },
    { id: 'progres', label: 'Progres' },
    { id: 'upline', label: 'Assigned' },
    { id: 'aktif', label: 'Aktif terakhir' }
  ];
  const DAFTAR_DEFAULT_COLS = ['name', 'phone', 'email', 'stage', 'bayar', 'nilai'];

  function defaultDaftarCols() {
    return DAFTAR_DEFAULT_COLS.slice();
  }
  function daftarCustomList(store) {
    const src = store || db;
    return Array.isArray(src.daftarCustom) ? src.daftarCustom.filter((c) => c && c.id && c.label) : [];
  }
  function daftarColDef(id, store) {
    const built = DAFTAR_COL_DEFS.find((c) => c.id === id);
    if (built) return built;
    const custom = daftarCustomList(store).find((c) => c.id === id);
    return custom ? { id: custom.id, label: custom.label, custom: true } : null;
  }
  function hydrateDaftarCols(merged) {
    merged.daftarCustom = Array.isArray(merged.daftarCustom)
      ? merged.daftarCustom.filter((c) => c && c.id && String(c.label || '').trim()).map((c) => ({
          id: String(c.id),
          label: String(c.label).trim().slice(0, 40)
        }))
      : [];
    const known = new Set(DAFTAR_COL_DEFS.map((c) => c.id).concat(merged.daftarCustom.map((c) => c.id)));
    let cols = Array.isArray(merged.daftarCols) ? merged.daftarCols.filter((id) => known.has(id)) : [];
    if (!cols.length || cols.indexOf('name') < 0) cols = defaultDaftarCols();
    if (cols[0] !== 'name') cols = ['name'].concat(cols.filter((id) => id !== 'name'));
    merged.daftarCols = cols;
  }
  function daftarCols() {
    hydrateDaftarCols(db);
    return db.daftarCols.slice();
  }
  function personCustomVal(sid, colId) {
    const p = (db.people && db.people[sid]) || {};
    const fields = p.fields || {};
    return fields[colId] != null ? String(fields[colId]) : '';
  }
  function setPersonCustomVal(sid, colId, val) {
    db.people = db.people || {};
    const cur = Object.assign({}, db.people[sid] || {});
    cur.fields = Object.assign({}, cur.fields || {});
    if (Array.isArray(val)) cur.fields[colId] = JSON.stringify(val);
    else cur.fields[colId] = String(val == null ? '' : val).trim();
    db.people[sid] = cur;
  }
  function parsePersonFieldValue(raw, type) {
    const s = String(raw == null ? '' : raw);
    if (type === 'multi') {
      if (!s) return [];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x));
      } catch (err) { /* plain list */ }
      return s.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return s;
  }
  function isObAccountField(field) {
    return !!(field && ['text', 'textarea', 'link', 'single', 'multi'].indexOf(field.type) >= 0);
  }
  function obFieldLabel(field, page) {
    const label = String((field && field.label) || '').trim();
    if (label) return label.slice(0, 40);
    const q = String((page && page.q) || '').trim();
    if (q) return q.slice(0, 40);
    return obTypeLabel((field && field.type) || 'text').slice(0, 40);
  }
  /** Ensure onboarding custom questions exist as account fields (daftarCustom + people.fields). */
  function ensureAccountFieldDef(field, page) {
    if (!isObAccountField(field)) return null;
    const id = String(field.id);
    const label = obFieldLabel(field, page) || id;
    hydrateDaftarCols(db);
    const list = daftarCustomList();
    const existing = list.find((c) => c.id === id);
    if (existing) {
      if (label && existing.label !== label) existing.label = label;
    } else {
      list.push({ id: id, label: label });
      db.daftarCustom = list;
    }
    return id;
  }
  function syncOnboardingAccountFields() {
    ensureOnboarding();
    wizFormPages().forEach((page) => {
      (page.fields || []).forEach((f) => ensureAccountFieldDef(f, page));
    });
  }
  function daftarCellHtml(colId, s) {
    const b = billingOf(s.id);
    const c = crmOf(s.id);
    const app = db.applications[s.id];
    const def = daftarColDef(colId);
    if (!def) return '<span class="muted">—</span>';
    if (def.custom) {
      return '<input class="inline-edit daftar-custom-in" data-act="daftar-custom-val" data-id="' + esc(s.id) +
        '" data-col="' + esc(colId) + '" value="' + esc(personCustomVal(s.id, colId)) + '" placeholder="—">';
    }
    if (colId === 'name') {
      const tags = (s.tags || []).slice(0, 2);
      return '<button type="button" class="linkish roster-name" data-act="open-student" data-id="' + esc(s.id) + '">' +
        avatarHtml(s, 'avatar sm') + '<span>' + esc(displayNameOf(s) || s.name) + waUnreadBadge(s.id) +
        '<div class="muted">' + esc(s.city || '—') +
        (tags.length ? ' · ' + tags.map((t) => esc(t)).join(', ') : '') +
        '</div></span></button>';
    }
    if (colId === 'phone') {
      return s.wa
        ? '<a class="fub-cell-link" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', dari MasterMind with Anton GC.')) +
          '">' + esc(fmtPhone(s.wa)) + '</a>'
        : '<span class="muted">—</span>';
    }
    if (colId === 'email') {
      return s.email
        ? '<a class="fub-cell-link" href="' + esc(mailLink(s.email, 'MasterMind with Anton GC', 'Halo ' + s.name)) + '">' +
          esc(s.email) + '</a>'
        : '<span class="muted">—</span>';
    }
    if (colId === 'tiktok') {
      const handle = tiktokHandle(s.tiktok);
      return handle
        ? '<a class="fub-cell-link" href="' + esc(tiktokUrl(handle)) + '" target="_blank" rel="noopener">@' + esc(handle) + '</a>'
        : '<span class="muted">—</span>';
    }
    if (colId === 'city') return esc(s.city || '—');
    if (colId === 'stage') return esc(stageLabel(c.stage));
    if (colId === 'bayar') {
      const ctl = canBill() ? billStatusSelect(s.id, b) : payChip(b.status, b.source);
      const confirm = confirmPaidBtn(s.id);
      return confirm ? ctl + ' ' + confirm : ctl;
    }
    if (colId === 'nilai') {
      return canBill()
        ? billAmountInput(s.id, b)
        : (b.amount ? '<span class="money">' + esc(fmtRp(b.amount)) + '</span>' : '<span class="muted">—</span>');
    }
    if (colId === 'tags') {
      const tags = s.tags || [];
      return tags.length
        ? tags.slice(0, 4).map((t) => '<span class="tag-chip">' + esc(t) + '</span>').join('')
        : '<span class="muted">—</span>';
    }
    if (colId === 'toko') {
      const name = s.shopName || (app && app.shopName) || '';
      return name ? esc(name) : '<span class="muted">—</span>';
    }
    if (colId === 'sumber') {
      return esc((app && app.heard) || b.source || '—');
    }
    if (colId === 'progres') {
      const p = kurProgress(s.id);
      return '<span title="' + p.n + '/' + p.total + '">' + p.pct + '%</span>';
    }
    if (colId === 'upline') return esc(s.mentorId ? nameOf(s.mentorId) : 'Anton');
    if (colId === 'aktif') return esc(relWhen(s.lastActive) || '—');
    return '<span class="muted">—</span>';
  }
  function daftarColsPanelHtml() {
    const cols = daftarCols();
    const custom = daftarCustomList();
    const on = new Set(cols);
    const item = (def, opts) => {
      opts = opts || {};
      const checked = on.has(def.id);
      const i = cols.indexOf(def.id);
      return '<div class="cols-dd-item' + (def.locked ? ' is-locked' : '') + (opts.custom ? ' is-custom' : '') + '">' +
        '<label class="cols-dd-check">' +
          '<input type="checkbox" data-act="daftar-col-toggle" data-id="' + esc(def.id) + '"' +
            (checked ? ' checked' : '') + (def.locked ? ' disabled' : '') + '>' +
          '<span>' + esc(def.label) +
            (def.locked ? ' <em class="muted">wajib</em>' : '') +
            (opts.custom ? ' <em class="muted">kustom</em>' : '') +
          '</span>' +
        '</label>' +
        (opts.custom || (checked && !def.locked)
          ? '<span class="cols-dd-actions">' +
              (checked && !def.locked
                ? '<button type="button" class="cols-dd-ico" data-act="daftar-col-up" data-id="' + esc(def.id) + '"' +
                    (i <= 1 ? ' disabled' : '') + ' title="Naik">↑</button>' +
                  '<button type="button" class="cols-dd-ico" data-act="daftar-col-down" data-id="' + esc(def.id) + '"' +
                    (i < 0 || i >= cols.length - 1 ? ' disabled' : '') + ' title="Turun">↓</button>'
                : '') +
              (opts.custom
                ? '<button type="button" class="cols-dd-ico" data-act="daftar-col-del" data-id="' + esc(def.id) + '" title="Hapus">×</button>'
                : '') +
            '</span>'
          : '') +
      '</div>';
    };
    const builtins = DAFTAR_COL_DEFS.map((def) => item(def)).join('');
    const customs = custom.map((def) => item(def, { custom: true })).join('');
    return '<div class="cols-dd" id="daftar-cols-dd" role="menu">' +
      '<div class="cols-dd-title">Tampilkan kolom</div>' +
      '<div class="cols-dd-scroll">' + builtins + (customs ? '<div class="cols-dd-sep"></div>' + customs : '') + '</div>' +
      '<form class="cols-dd-add" data-act="daftar-col-add">' +
        '<input name="label" required maxlength="40" placeholder="Kolom kustom baru…">' +
        '<button class="btn-sm" type="submit">+</button>' +
      '</form>' +
      '<button type="button" class="cols-dd-reset" data-act="daftar-cols-reset">Reset default</button>' +
    '</div>';
  }

  function hydrateFunnel(merged) {
    merged.schoolSlug = isValidSlug(merged.schoolSlug) ? normalizeSlug(merged.schoolSlug) : SEED.school.slug;
    merged.schoolProfile = Object.assign(defaultSchoolProfile(), merged.schoolProfile || {}, {
      socials: Object.assign(defaultSchoolProfile().socials, ((merged.schoolProfile || {}).socials || {}))
    });
    merged.accountSettings = Object.assign(defaultAccountSettings(), merged.accountSettings || {}, {
      notifications: Object.assign(defaultAccountSettings().notifications, ((merged.accountSettings || {}).notifications || {}))
    });
    merged.onboarding = normalizeOnboarding(merged.onboarding);
    merged.inviteCode = String(merged.inviteCode || (SEED.cohort && SEED.cohort.invite) || '').trim() || SEED.cohort.invite;
    merged.lynkProducts = Object.assign({
      month: { url: '', title: '', price: 0 },
      quarter: { url: '', title: '', price: 0 },
      half: { url: '', title: '', price: 0 }
    }, merged.lynkProducts || {});
    ['month', 'quarter', 'half'].forEach((term) => {
      const row = merged.lynkProducts[term] || {};
      merged.lynkProducts[term] = {
        url: String(row.url || '').trim(),
        title: String(row.title || '').trim(),
        price: Number(row.price) || 0
      };
    });
    merged.pricing = Object.assign({}, SEED.pricing, merged.pricing || {});
    merged.bank = Object.assign({}, SEED.bank, merged.bank || {});
    merged.dunning = Object.assign({}, SEED.dunning, merged.dunning || {});
    merged.actionPlans = mergeActionPlans(merged.actionPlans);
    hydratePipeline(merged);
    merged.crm = Object.assign({}, JSON.parse(JSON.stringify(SEED.crm || {})), merged.crm || {});
    Object.keys(merged.crm).forEach((id) => {
      const c = merged.crm[id];
      if (!c || !c.stage) return;
      if (c.stage === 'lulus' && c.acceptedMentorAt) c.stage = 'mentor';
      else c.stage = migrateCrmStage(c.stage);
    });
    (merged.actionPlans || []).forEach((p) => {
      (p.steps || []).forEach((st) => {
        if (st.to) st.to = migrateCrmStage(st.to);
      });
    });
    hydrateDaftarCols(merged);
    merged.applications = Object.assign({}, JSON.parse(JSON.stringify(SEED.applications || {})), merged.applications || {});
    merged.timeline = Object.assign({}, JSON.parse(JSON.stringify(SEED.timelineSeed || {})), merged.timeline || {});
    if (!Array.isArray(merged.payments) || !merged.payments.length) {
      merged.payments = JSON.parse(JSON.stringify(SEED.paymentsSeed || []));
    }
    merged.tasks = Array.isArray(merged.tasks) ? merged.tasks : JSON.parse(JSON.stringify(SEED.tasksSeed || []));
    const staffIds = (SEED.staff || []).map((s) => s.id);
    const defaultAssignee = (SEED.school && SEED.school.ownerId) || staffIds[0] || 'u-anton';
    merged.tasks.forEach((t) => {
      if (!t || typeof t !== 'object') return;
      if (!t.assignee || staffIds.indexOf(t.assignee) < 0) t.assignee = defaultAssignee;
    });
    merged.waQueue = Array.isArray(merged.waQueue) ? merged.waQueue : JSON.parse(JSON.stringify(SEED.waQueueSeed || []));
    merged.emailQueue = Array.isArray(merged.emailQueue) ? merged.emailQueue : JSON.parse(JSON.stringify(SEED.emailQueueSeed || []));
    if (!Array.isArray(merged.waThreads) || !merged.waThreads.length) {
      merged.waThreads = JSON.parse(JSON.stringify(SEED.waThreadsSeed || []));
    }
    if (!Array.isArray(merged.waMessages) || !merged.waMessages.length) {
      merged.waMessages = JSON.parse(JSON.stringify(SEED.waMessagesSeed || []));
    }
    merged.enrollments = Object.assign({}, JSON.parse(JSON.stringify(SEED.enrollmentsSeed || {})), merged.enrollments || {});
    merged.people = merged.people && typeof merged.people === 'object' ? merged.people : {};
    if (!Array.isArray(merged.posts)) merged.posts = JSON.parse(JSON.stringify(SEED.postsSeed || []));
    if (!Array.isArray(merged.comments)) merged.comments = JSON.parse(JSON.stringify(SEED.commentsSeed || []));
    if (!merged.batchNames || typeof merged.batchNames !== 'object' || Array.isArray(merged.batchNames)) {
      merged.batchNames = {};
    }
    if (!merged.chats || typeof merged.chats !== 'object' || Array.isArray(merged.chats)) {
      merged.chats = {};
    }
    merged.remittances = Array.isArray(merged.remittances) ? merged.remittances : JSON.parse(JSON.stringify(SEED.remittances || []));
    if (typeof merged.clockOffsetMs !== 'number') merged.clockOffsetMs = 0;
    Object.keys(SEED.billing || {}).forEach((id) => {
      if (!merged.billing[id]) {
        merged.billing[id] = JSON.parse(JSON.stringify(SEED.billing[id]));
        return;
      }
      const seed = SEED.billing[id];
      const b = merged.billing[id];
      if (seed && seed.status === 'trial' && seed.offerExpiresAt && b.status === 'trial') {
        const seedLeft = new Date(seed.offerExpiresAt).getTime() - Date.now();
        if (seedLeft > 0) {
          b.offerStartedAt = seed.offerStartedAt || b.offerStartedAt;
          b.offerExpiresAt = seed.offerExpiresAt;
        }
      }
    });
    Object.entries(SEED.progressSeed || {}).forEach(([sid, ids]) => {
      if (!merged.progress[sid]) {
        merged.progress[sid] = Object.fromEntries((ids || []).map((id) => [id, true]));
      }
    });
  }

  function rebaseDemoClocks(state) {
    const anchor = new Date('2026-09-18T12:00:00+07:00').getTime();
    const delta = Date.now() - anchor;
    const bump = (iso) => {
      if (!iso) return iso;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) ? new Date(t + delta).toISOString() : iso;
    };
    Object.keys(state.billing || {}).forEach((id) => {
      const b = state.billing[id];
      if (!b) return;
      ['offerStartedAt', 'offerExpiresAt', 'accessUntil', 'paidAt'].forEach((k) => {
        if (b[k]) b[k] = bump(b[k]);
      });
    });
    Object.keys(state.crm || {}).forEach((id) => {
      const c = state.crm[id];
      if (!c) return;
      ['watchedFirstAt', 'notInterestedAt', 'endedAt', 'examAt', 'acceptedMentorAt'].forEach((k) => {
        if (c[k]) c[k] = bump(c[k]);
      });
    });
    Object.keys(state.applications || {}).forEach((id) => {
      const a = state.applications[id];
      if (a && a.at) a.at = bump(a.at);
    });
    (state.payments || []).forEach((p) => {
      if (p && p.at) p.at = bump(p.at);
    });
    (state.waThreads || []).forEach((t) => {
      if (t && t.updatedAt) t.updatedAt = bump(t.updatedAt);
    });
    (state.waMessages || []).forEach((m) => {
      if (m && m.at) m.at = bump(m.at);
    });
    (state.posts || []).forEach((p) => {
      if (p && p.createdAt) p.createdAt = bump(p.createdAt);
    });
    (state.comments || []).forEach((c) => {
      if (c && c.createdAt) c.createdAt = bump(c.createdAt);
    });
    const kamuPaid = state.billing && state.billing['s-kamu'] && state.billing['s-kamu'].paidAt;
    const seedBatch = monthKey(kamuPaid);
    if (seedBatch) {
      (state.posts || []).forEach((p) => {
        if (p && String(p.id || '').indexOf('dk-') === 0) p.batchId = seedBatch;
      });
    }
  }

  function defaultSchoolProfile() {
    const seed = (SEED.school && SEED.school.profile) || {};
    const staff = (SEED.staff && SEED.staff[0]) || {};
    const nameParts = String(staff.name || 'Anton').trim().split(/\s+/);
    return {
      firstName: String(seed.firstName || nameParts[0] || 'Anton'),
      lastName: String(seed.lastName || nameParts.slice(1).join(' ') || ''),
      headline: String(seed.headline || seed.header || SEED.school.slogan || '').slice(0, 60),
      biography: String(seed.biography || seed.description || ''),
      photoMode: seed.photoMode === 'social' ? 'social' : 'upload',
      socialSource: seed.socialSource || 'tiktok',
      photoBlob: false,
      socials: Object.assign({
        website: '',
        facebook: '',
        instagram: '',
        linkedin: '',
        tiktok: '',
        x: '',
        youtube: ''
      }, seed.socials || {})
    };
  }
  function schoolProfile() {
    const base = defaultSchoolProfile();
    const cur = (typeof db !== 'undefined' && db && db.schoolProfile) ? db.schoolProfile : {};
    const headline = cur.headline != null ? cur.headline : (cur.header != null ? cur.header : base.headline);
    const biography = cur.biography != null ? cur.biography : (cur.description != null ? cur.description : base.biography);
    return {
      firstName: cur.firstName != null ? String(cur.firstName) : base.firstName,
      lastName: cur.lastName != null ? String(cur.lastName) : base.lastName,
      headline: String(headline || '').slice(0, 60),
      biography: String(biography || ''),
      photoMode: cur.photoMode === 'social' ? 'social' : 'upload',
      socialSource: cur.socialSource || base.socialSource,
      photoBlob: !!cur.photoBlob,
      socials: Object.assign({}, base.socials, cur.socials || {})
    };
  }
  function schoolDisplayName(p) {
    const prof = p || schoolProfile();
    const full = (String(prof.firstName || '').trim() + ' ' + String(prof.lastName || '').trim()).trim();
    return full || SEED.school.name;
  }
  function defaultAccountSettings() {
    const seed = (SEED.school && SEED.school.account) || {};
    return {
      email: String(seed.email || 'anton@obrolan.marketing'),
      twoFactor: !!seed.twoFactor,
      passwordSet: true,
      notifications: Object.assign({
        studentJoin: true,
        studentPay: true,
        lessonComplete: false,
        comment: true
      }, seed.notifications || {})
    };
  }
  function accountSettings() {
    const base = defaultAccountSettings();
    const cur = (typeof db !== 'undefined' && db && db.accountSettings) ? db.accountSettings : {};
    return {
      email: cur.email != null ? String(cur.email) : base.email,
      twoFactor: cur.twoFactor != null ? !!cur.twoFactor : base.twoFactor,
      passwordSet: cur.passwordSet != null ? !!cur.passwordSet : base.passwordSet,
      notifications: Object.assign({}, base.notifications, cur.notifications || {})
    };
  }
  function ensureAccountSettings() {
    if (!db.accountSettings || typeof db.accountSettings !== 'object') {
      db.accountSettings = defaultAccountSettings();
    } else {
      db.accountSettings = Object.assign(defaultAccountSettings(), db.accountSettings, {
        notifications: Object.assign(defaultAccountSettings().notifications, (db.accountSettings.notifications || {}))
      });
    }
    return db.accountSettings;
  }
  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
  }
  const OB_FIELD_TYPES = [
    { id: 'name', label: 'Nama depan & belakang' },
    { id: 'wa', label: 'WhatsApp' },
    { id: 'city', label: 'Kota' },
    { id: 'shop', label: 'Toko (sudah/belum + nama + tautan)' },
    { id: 'link', label: 'Tautan (toko / URL)' },
    { id: 'text', label: 'Teks singkat' },
    { id: 'textarea', label: 'Teks panjang' },
    { id: 'single', label: 'Pilihan tunggal' },
    { id: 'multi', label: 'Pilihan ganda' }
  ];
  function defaultOnboarding() {
    return {
      pages: [
        {
          id: 'ob-name',
          kicker: 'Kenalan',
          q: 'Siapa namamu?',
          sub: 'Nama depan dan belakang. Yang Anton panggil di grup.',
          fields: [{ id: 'f-name', type: 'name', required: true }]
        },
        {
          id: 'ob-wa',
          kicker: 'Kontak',
          q: 'Nomor WhatsApp-mu?',
          sub: 'Anton kirim & simpan chat mentoring dari nomor ini. Bukan riwayat WA lama.',
          fields: [{ id: 'f-wa', type: 'wa', required: true }]
        },
        {
          id: 'ob-shop',
          kicker: 'Toko',
          q: 'Sudah punya toko?',
          sub: 'Belum juga boleh. Jujur aja.',
          fields: [{ id: 'f-shop', type: 'shop', required: true }]
        },
        {
          id: 'ob-city',
          kicker: 'Tempat',
          q: 'Kota mana?',
          sub: 'Biar Anton tahu kamu dari mana.',
          fields: [{ id: 'f-city', type: 'city', required: true }]
        },
        {
          id: 'ob-heard',
          kicker: 'Cerita',
          q: 'Dari mana kenal Anton?',
          sub: 'Satu jawaban. Bukan syarat masuk.',
          fields: [{
            id: 'f-heard',
            type: 'single',
            label: 'Dari mana kenal Anton',
            required: true,
            allowOther: true,
            options: ['Grup WA Anton', 'Teman / murid Anton', 'TikTok', 'Instagram', 'Lainnya']
          }]
        }
      ]
    };
  }
  function normalizeObField(raw) {
    const f = raw && typeof raw === 'object' ? raw : {};
    const type = OB_FIELD_TYPES.some((t) => t.id === f.type) ? f.type : 'text';
    const out = {
      id: String(f.id || uid('f')),
      type: type,
      required: f.required !== false,
      label: String(f.label || '').slice(0, 80),
      placeholder: String(f.placeholder || '').slice(0, 80)
    };
    if (type === 'single' || type === 'multi') {
      const opts = Array.isArray(f.options) ? f.options : [];
      out.options = opts.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 12);
      if (!out.options.length) out.options = ['Opsi 1', 'Opsi 2'];
      out.allowOther = type === 'single' ? !!f.allowOther : false;
    }
    return out;
  }
  function normalizeObPage(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const fields = Array.isArray(p.fields) ? p.fields.map(normalizeObField) : [];
    return {
      id: String(p.id || uid('ob')),
      kicker: String(p.kicker || '').slice(0, 40),
      q: String(p.q || 'Pertanyaan').slice(0, 120),
      sub: String(p.sub || '').slice(0, 240),
      fields: fields.length ? fields : [normalizeObField({ type: 'text', required: true })]
    };
  }
  function normalizeOnboarding(raw) {
    const base = defaultOnboarding();
    const cur = raw && typeof raw === 'object' ? raw : {};
    const pages = Array.isArray(cur.pages) ? cur.pages.map(normalizeObPage) : [];
    return { pages: pages.length ? pages : base.pages.map(normalizeObPage) };
  }
  function ensureOnboarding() {
    db.onboarding = normalizeOnboarding(db.onboarding);
    return db.onboarding;
  }
  function obStoreId(field) {
    return String((field && field.id) || '');
  }
  function wizFormPages() { return ensureOnboarding().pages; }
  function wizPayIdx() { return wizFormPages().length; }
  function wizTotalSteps() { return wizPayIdx() + 1; }
  function isOnboardPreview() { return !!(ui.onboardPreview && ui.onboardPreview.open); }
  function schoolPhotoKey() { return 'photo-school'; }
  function ensureSchoolProfile() {
    if (!db.schoolProfile || typeof db.schoolProfile !== 'object') {
      db.schoolProfile = defaultSchoolProfile();
    } else {
      db.schoolProfile = Object.assign(defaultSchoolProfile(), db.schoolProfile, {
        socials: Object.assign(defaultSchoolProfile().socials, (db.schoolProfile.socials || {}))
      });
    }
    return db.schoolProfile;
  }

  function socialHandleClean(raw) {
    return String(raw || '').trim().replace(/^@/, '').replace(/\/+$/, '');
  }
  function socialHref(network, raw) {
    const v = String(raw || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    const h = socialHandleClean(v).replace(/^@/, '');
    if (!h) return '';
    if (network === 'tiktok') return 'https://www.tiktok.com/@' + h.replace(/^@/, '');
    if (network === 'instagram') return 'https://www.instagram.com/' + h;
    if (network === 'facebook') return 'https://www.facebook.com/' + h;
    if (network === 'linkedin') return 'https://www.linkedin.com/' + h.replace(/^(in\/)?/i, 'in/').replace(/^in\/in\//i, 'in/');
    if (network === 'youtube') {
      if (/^(UC|@)/.test(h) || /channel\//i.test(h)) return 'https://www.youtube.com/' + (h.indexOf('@') === 0 || h.indexOf('UC') === 0 ? h : ('@' + h));
      return 'https://www.youtube.com/@' + h;
    }
    if (network === 'x') return 'https://x.com/' + h;
    if (network === 'website') return 'https://' + h.replace(/^https?:\/\//i, '');
    return v;
  }
  function socialPrefixedInput(label, name, prefix, value, placeholder) {
    return '<label class="ps-field">' +
      '<span class="ps-label">' + esc(label) + '</span>' +
      '<div class="ps-prefixed">' +
        '<span class="ps-prefix">' + esc(prefix) + '</span>' +
        '<input name="' + esc(name) + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '" autocomplete="off" spellcheck="false">' +
      '</div></label>';
  }
  function fetchSocialAvatar(network, handle) {
    if (network === 'tiktok') return fetchTikTokAvatar(handle);
    const h = socialHandleClean(handle);
    if (!h) return Promise.resolve(null);
    const net = network === 'x' ? 'twitter' : network;
    const unav = 'https://unavatar.io/' + encodeURIComponent(net) + '/' + encodeURIComponent(h);
    return fetch(unav).then((r) => r.ok ? r.blob() : null).catch(() => null);
  }
  function refreshSchoolPhotoFromSocial(force) {
    ensureSchoolProfile();
    const p = schoolProfile();
    const src = p.socialSource || 'tiktok';
    const handle = (p.socials && p.socials[src]) || '';
    if (!handle) return Promise.resolve(false);
    if (p.photoBlob && p.photoMode === 'social' && !force) return Promise.resolve(true);
    return fetchSocialAvatar(src, handle).then((blob) => {
      if (!blob) return false;
      return blobPut(schoolPhotoKey(), blob).then(() => {
        db.schoolProfile.photoBlob = true;
        db.schoolProfile.photoMode = 'social';
        save();
        return true;
      });
    }).catch(() => false);
  }
  function schoolAvatarHtml(cls) {
    const p = schoolProfile();
    const c = cls || 'school-avatar';
    if (p.photoBlob) return '<img class="' + c + '" data-blob="' + esc(schoolPhotoKey()) + '" alt="">';
    return '<img class="' + c + '" src="' + esc(SEED.school.photo || SEED.school.logo) + '" alt="">';
  }
  function schoolSocialLinksHtml() {
    const s = schoolProfile().socials || {};
    const items = [
      { k: 'website', label: 'Website' },
      { k: 'facebook', label: 'Facebook' },
      { k: 'instagram', label: 'Instagram' },
      { k: 'linkedin', label: 'LinkedIn' },
      { k: 'tiktok', label: 'TikTok' },
      { k: 'x', label: 'X' },
      { k: 'youtube', label: 'YouTube' }
    ];
    const links = items.map((it) => {
      const href = socialHref(it.k, s[it.k]);
      if (!href) return '';
      const raw = String(s[it.k] || '');
      const text = it.k === 'website'
        ? (raw.replace(/^https?:\/\//i, '') || it.label)
        : (raw.indexOf('@') === 0 ? raw : ('@' + socialHandleClean(raw)));
      return '<a class="prof-social" href="' + esc(href) + '" target="_blank" rel="noopener">' +
        '<span class="prof-social-net">' + esc(it.label) + '</span>' +
        '<span>' + esc(text) + '</span></a>';
    }).filter(Boolean).join('');
    return links ? '<div class="prof-socials">' + links + '</div>' : '';
  }
  function viewSchoolPublic(opts) {
    const o = opts || {};
    const p = schoolProfile();
    const back = o.student
      ? '<button type="button" class="btn secondary" data-act="tab" data-id="home">← Back</button>'
      : '';
    return '<section class="card school-public">' +
      '<div class="school-public-head">' +
        schoolAvatarHtml('school-avatar lg') +
        '<div>' +
          '<p class="muted" style="margin:0 0 4px">Mentor</p>' +
          '<h1 class="school-public-name">' + esc(schoolDisplayName(p)) + '</h1>' +
          ((p.headline || '').trim()
            ? '<p class="school-public-header">' + esc(String(p.headline).trim()) + '</p>'
            : '') +
          '<p class="muted">' + esc(SEED.school.name) + ' · larisid.com' + esc(schoolPublicPath()) + '</p>' +
        '</div>' +
      '</div>' +
      (p.biography
        ? '<div class="school-public-desc">' + mdish(p.biography) + '</div>'
        : '<p class="muted">No biography yet.</p>') +
      schoolSocialLinksHtml() +
      (back ? '<div class="row" style="margin-top:14px">' + back + '</div>' : '') +
    '</section>';
  }
  function profileActionsBar(opts) {
    const o = opts || {};
    const mode = ui.profilePreview === 'desktop' ? 'desktop' : (ui.profilePreview === 'phone' ? 'phone' : '');
    const saveBtn = o.photo
      ? '<button class="btn ps-save" type="button" data-act="profile-pane" data-id="info">Done</button>'
      : '<button class="btn ps-save" type="submit" form="school-profile-form">Save</button>';
    return '<div class="ps-actions">' +
      saveBtn +
      '<div class="ps-student-view">' +
        '<span class="muted">Student view</span>' +
        '<div class="prof-preview-toggle" role="group" aria-label="Student view">' +
          '<button type="button" class="btn-sm' + (mode === 'phone' ? ' is-on' : '') +
            '" data-act="profile-preview" data-mode="phone">Phone</button>' +
          '<button type="button" class="btn-sm' + (mode === 'desktop' ? ' is-on' : '') +
            '" data-act="profile-preview" data-mode="desktop">Desktop</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="btn-sm" data-act="tab" data-id="siswa">Close</button>' +
    '</div>';
  }
  function viewProfilInfoForm(p) {
    const s = p.socials || {};
    const hlLeft = Math.max(0, 60 - String(p.headline || '').length);
    return '<form class="ps-form" id="school-profile-form" data-act="save-school-profile">' +
      '<div class="ps-columns">' +
        '<div class="ps-col">' +
          '<label class="ps-field"><span class="ps-label">First Name</span>' +
            '<input name="firstName" required maxlength="40" value="' + esc(p.firstName || '') + '" autocomplete="given-name"></label>' +
          '<label class="ps-field"><span class="ps-label">Last Name</span>' +
            '<input name="lastName" maxlength="40" value="' + esc(p.lastName || '') + '" autocomplete="family-name"></label>' +
          '<label class="ps-field"><span class="ps-label">Headline</span>' +
            '<div class="ps-headline">' +
              '<input name="headline" maxlength="60" value="' + esc(p.headline || '') +
                '" placeholder="Instructor at MasterMind" data-act="headline-count">' +
              '<span class="ps-count" id="headline-count">' + hlLeft + '</span>' +
            '</div></label>' +
          '<label class="ps-field"><span class="ps-label">Biography</span>' +
            '<div class="ps-bio">' +
              '<div class="ps-bio-tools" role="toolbar" aria-label="Biography formatting">' +
                '<button type="button" class="ps-tool" data-act="bio-wrap" data-wrap="**" title="Bold"><strong>B</strong></button>' +
                '<button type="button" class="ps-tool" data-act="bio-wrap" data-wrap="*" title="Italic"><em>I</em></button>' +
              '</div>' +
              '<textarea name="biography" id="profile-biography" rows="8" maxlength="2000" placeholder="Tell students who you are…">' +
                esc(p.biography || '') + '</textarea>' +
            '</div>' +
            '<span class="ps-hint">Help learners know you — credibility, empathy, passion, and personality. Aim for at least 50 words. Links and coupon codes are not permitted.</span>' +
          '</label>' +
        '</div>' +
        '<div class="ps-col">' +
          '<label class="ps-field"><span class="ps-label">Website</span>' +
            '<input name="website" value="' + esc(s.website || '') + '" placeholder="Website (http(s)://…)" autocomplete="url"></label>' +
          socialPrefixedInput('Facebook', 'facebook', 'facebook.com/', s.facebook, 'Username') +
          socialPrefixedInput('Instagram', 'instagram', 'instagram.com/', s.instagram, 'Username') +
          socialPrefixedInput('LinkedIn', 'linkedin', 'linkedin.com/', s.linkedin, 'Public Profile URL') +
          socialPrefixedInput('TikTok', 'tiktok', 'tiktok.com/', s.tiktok, '@Username') +
          socialPrefixedInput('X', 'x', 'x.com/', s.x, 'Username') +
          socialPrefixedInput('YouTube', 'youtube', 'youtube.com/', s.youtube, 'Username') +
        '</div>' +
      '</div>' +
      profileActionsBar() +
    '</form>';
  }
  function viewProfilPhotoPane(p) {
    const syncNet = p.socialSource === 'instagram' ? 'Instagram'
      : (p.socialSource === 'youtube' ? 'YouTube' : 'TikTok');
    return '<div class="ps-photo-pane">' +
      '<div class="ps-photo-card">' +
        schoolAvatarHtml('school-avatar xxl') +
        '<div class="ps-photo-actions">' +
          '<label class="btn secondary">Upload image<input type="file" hidden data-act="school-photo-file" accept="image/*"></label>' +
          '<div class="ps-sync-row">' +
            '<button type="button" class="btn" data-act="profile-sync-photo">Sync with ' + esc(syncNet) + '</button>' +
            '<select class="ps-sync-select" data-act="profile-social-source" aria-label="Social for photo sync">' +
              '<option value="tiktok"' + (p.socialSource === 'tiktok' || !p.socialSource ? ' selected' : '') + '>TikTok</option>' +
              '<option value="instagram"' + (p.socialSource === 'instagram' ? ' selected' : '') + '>Instagram</option>' +
              '<option value="youtube"' + (p.socialSource === 'youtube' ? ' selected' : '') + '>YouTube</option>' +
            '</select>' +
          '</div>' +
          '<p class="muted ps-hint">Uses the handle saved on the Profile tab. Sync may fail if the network blocks avatar fetch.</p>' +
        '</div>' +
      '</div>' +
      profileActionsBar({ photo: true }) +
    '</div>';
  }
  function viewProfilEdit() {
    ensureSchoolProfile();
    const p = schoolProfile();
    const pane = ui.profilePane === 'photo' ? 'photo' : 'info';
    ui.profilePane = pane;
    return '<section class="ps-page">' +
      '<div class="ps-page-head">' +
        '<h1>Profile &amp; settings</h1>' +
      '</div>' +
      '<nav class="ps-tabs" role="tablist">' +
        '<button type="button" role="tab" data-act="profile-pane" data-id="info" aria-selected="' +
          (pane === 'info') + '">Profile</button>' +
        '<button type="button" role="tab" data-act="profile-pane" data-id="photo" aria-selected="' +
          (pane === 'photo') + '">Profile picture</button>' +
      '</nav>' +
      '<div class="ps-body">' +
        (pane === 'photo' ? viewProfilPhotoPane(p) : viewProfilInfoForm(p)) +
      '</div>' +
    '</section>';
  }
  function viewAccountSecurity(a) {
    return '<form class="ps-form as-form" id="account-security-form" data-act="save-account-security">' +
      '<div class="as-section">' +
        '<h2>Email</h2>' +
        '<p class="muted">Login email for this school. Prototype stores it locally only.</p>' +
        '<label class="ps-field"><span class="ps-label">Email address</span>' +
          '<input name="email" type="email" required value="' + esc(a.email || '') + '" autocomplete="email"></label>' +
      '</div>' +
      '<div class="as-section">' +
        '<h2>Password</h2>' +
        '<p class="muted">' + (a.passwordSet ? 'Password is set. Enter current + new to change.' : 'No password yet — set one below.') + '</p>' +
        '<label class="ps-field"><span class="ps-label">Current password</span>' +
          '<input name="currentPassword" type="password" autocomplete="current-password" placeholder="••••••••"></label>' +
        '<label class="ps-field"><span class="ps-label">New password</span>' +
          '<input name="newPassword" type="password" autocomplete="new-password" minlength="8" placeholder="Min. 8 characters"></label>' +
        '<label class="ps-field"><span class="ps-label">Confirm new password</span>' +
          '<input name="confirmPassword" type="password" autocomplete="new-password" placeholder="Repeat new password"></label>' +
      '</div>' +
      '<div class="as-section">' +
        '<h2>Two-factor authentication</h2>' +
        '<p class="muted">Mock toggle for the prototype — no real authenticator app yet.</p>' +
        '<label class="as-toggle">' +
          '<input type="checkbox" name="twoFactor"' + (a.twoFactor ? ' checked' : '') + '>' +
          '<span>Require a second step when signing in</span>' +
        '</label>' +
      '</div>' +
      '<div class="ps-actions">' +
        '<button class="btn ps-save" type="submit">Save</button>' +
        '<button type="button" class="btn-sm" data-act="tab" data-id="siswa">Close</button>' +
      '</div>' +
    '</form>';
  }
  function viewAccountNotifications(a) {
    const n = a.notifications || {};
    const rows = [
      { k: 'studentJoin', label: 'Students join', hint: 'Someone completes the join form or accepts an invite.' },
      { k: 'studentPay', label: 'Students pay', hint: 'Transfer marked paid, Mayar webhook, or autopay renews.' },
      { k: 'lessonComplete', label: 'Students complete a lesson', hint: 'They mark a video or materi selesai.' },
      { k: 'comment', label: 'Students make a comment', hint: 'New diskusi post or reply in class.' }
    ];
    return '<form class="ps-form as-form" id="account-notify-form" data-act="save-account-notifications">' +
      '<div class="as-section">' +
        '<h2>Email notifications</h2>' +
        '<p class="muted">Choose what lands in your inbox. Prototype only — nothing is sent yet.</p>' +
        '<div class="as-notify-list">' +
          rows.map((r) =>
            '<label class="as-notify-row">' +
              '<input type="checkbox" name="' + esc(r.k) + '"' + (n[r.k] ? ' checked' : '') + '>' +
              '<span><strong>' + esc(r.label) + '</strong><em class="muted">' + esc(r.hint) + '</em></span>' +
            '</label>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div class="ps-actions">' +
        '<button class="btn ps-save" type="submit">Save</button>' +
        '<button type="button" class="btn-sm" data-act="tab" data-id="siswa">Close</button>' +
      '</div>' +
    '</form>';
  }
  function obTypeLabel(type) {
    const hit = OB_FIELD_TYPES.find((t) => t.id === type);
    return hit ? hit.label : type;
  }
  function viewObFieldEditor(pageId, field, fi) {
    const typeOpts = OB_FIELD_TYPES.map((t) =>
      '<option value="' + esc(t.id) + '"' + (field.type === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>'
    ).join('');
    const needsMeta = field.type === 'text' || field.type === 'textarea' || field.type === 'link' ||
      field.type === 'single' || field.type === 'multi';
    const needsOpts = field.type === 'single' || field.type === 'multi';
    return '<div class="ob-ed-field" data-page="' + esc(pageId) + '" data-field="' + esc(field.id) + '">' +
      '<div class="ob-ed-field-top">' +
        '<select data-act="ob-field-type" data-page="' + esc(pageId) + '" data-field="' + esc(field.id) + '">' +
          typeOpts + '</select>' +
        '<label class="ob-ed-req"><input type="checkbox" data-act="ob-field-req" data-page="' +
          esc(pageId) + '" data-field="' + esc(field.id) + '"' + (field.required ? ' checked' : '') + '> Wajib</label>' +
        '<button type="button" class="btn-sm" data-act="ob-field-up" data-page="' + esc(pageId) +
          '" data-field="' + esc(field.id) + '"' + (fi === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="btn-sm" data-act="ob-field-down" data-page="' + esc(pageId) +
          '" data-field="' + esc(field.id) + '">↓</button>' +
        '<button type="button" class="btn-sm danger" data-act="ob-field-del" data-page="' +
          esc(pageId) + '" data-field="' + esc(field.id) + '">Hapus</button>' +
      '</div>' +
      (needsMeta
        ? '<div class="ob-ed-grid">' +
            '<label>Label di akun siswa<input data-ob-ed="label" data-page="' + esc(pageId) + '" data-field="' +
              esc(field.id) + '" value="' + esc(field.label || '') + '" placeholder="Mis. Tautan toko"></label>' +
            '<label>Placeholder<input data-ob-ed="placeholder" data-page="' + esc(pageId) + '" data-field="' +
              esc(field.id) + '" value="' + esc(field.placeholder || '') + '" placeholder="Contoh…"></label>' +
          '</div>'
        : '') +
      (needsOpts
        ? '<label class="ob-ed-opts">Opsi (satu per baris)' +
            '<textarea data-ob-ed="options" data-page="' + esc(pageId) + '" data-field="' +
              esc(field.id) + '" rows="3">' + esc((field.options || []).join('\n')) + '</textarea></label>' +
          (field.type === 'single'
            ? '<label class="ob-ed-req"><input type="checkbox" data-act="ob-field-other" data-page="' +
              esc(pageId) + '" data-field="' + esc(field.id) + '"' + (field.allowOther ? ' checked' : '') +
              '> Izinkan “Lainnya”</label>'
            : '')
        : '') +
      '<p class="muted ob-ed-typehint">' + esc(obTypeLabel(field.type)) + '</p>' +
    '</div>';
  }
  function viewObPageEditor(page, index, total) {
    return '<li class="ob-ed-page" data-page="' + esc(page.id) + '">' +
      '<div class="ob-ed-page-h">' +
        '<strong>Halaman ' + (index + 1) + '</strong>' +
        '<div class="ob-ed-page-acts">' +
          '<button type="button" class="btn-sm" data-act="ob-page-up" data-page="' + esc(page.id) + '"' +
            (index === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button type="button" class="btn-sm" data-act="ob-page-down" data-page="' + esc(page.id) + '"' +
            (index >= total - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button type="button" class="btn-sm danger" data-act="ob-page-del" data-page="' +
            esc(page.id) + '"' + (total <= 1 ? ' disabled' : '') + '>Hapus halaman</button>' +
        '</div>' +
      '</div>' +
      '<div class="ob-ed-grid">' +
        '<label>Kicker<input data-ob-ed="kicker" data-page="' + esc(page.id) + '" value="' +
          esc(page.kicker || '') + '" maxlength="40" placeholder="Kenalan"></label>' +
        '<label class="ob-ed-span2">Pertanyaan<input data-ob-ed="q" data-page="' + esc(page.id) +
          '" value="' + esc(page.q || '') + '" maxlength="120" placeholder="Siapa namamu?"></label>' +
        '<label class="ob-ed-span2">Subteks<textarea data-ob-ed="sub" data-page="' + esc(page.id) +
          '" rows="2" maxlength="240">' + esc(page.sub || '') + '</textarea></label>' +
      '</div>' +
      '<div class="ob-ed-fields">' +
        (page.fields || []).map((f, fi) => viewObFieldEditor(page.id, f, fi)).join('') +
      '</div>' +
      '<div class="ob-ed-add-field">' +
        '<select data-ob-new-type data-page="' + esc(page.id) + '">' +
          OB_FIELD_TYPES.map((t) => '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>').join('') +
        '</select>' +
        '<button type="button" class="btn-sm" data-act="ob-field-add" data-page="' + esc(page.id) +
          '">+ Tambah pertanyaan</button>' +
      '</div>' +
    '</li>';
  }
  function captureOnboardingEditor() {
    const root = document.querySelector('.as-onboard-editor');
    if (!root) return;
    const ob = ensureOnboarding();
    root.querySelectorAll('[data-ob-ed]').forEach((el) => {
      const pageId = el.getAttribute('data-page');
      const fieldId = el.getAttribute('data-field');
      const kind = el.getAttribute('data-ob-ed');
      const page = ob.pages.find((p) => p.id === pageId);
      if (!page) return;
      if (!fieldId) {
        if (kind === 'kicker') page.kicker = String(el.value || '').slice(0, 40);
        if (kind === 'q') page.q = String(el.value || '').slice(0, 120) || 'Pertanyaan';
        if (kind === 'sub') page.sub = String(el.value || '').slice(0, 240);
        return;
      }
      const field = (page.fields || []).find((f) => f.id === fieldId);
      if (!field) return;
      if (kind === 'label') field.label = String(el.value || '').slice(0, 80);
      if (kind === 'placeholder') field.placeholder = String(el.value || '').slice(0, 80);
      if (kind === 'options') {
        field.options = String(el.value || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
        if (!field.options.length) field.options = ['Opsi 1', 'Opsi 2'];
      }
    });
    db.onboarding = normalizeOnboarding(ob);
    syncOnboardingAccountFields();
  }
  function viewAccountOnboarding() {
    const ob = ensureOnboarding();
    syncOnboardingAccountFields();
    const pages = ob.pages;
    return '<div class="ps-form as-form as-onboard as-onboard-editor">' +
      '<div class="as-section">' +
        '<div class="ob-ed-head">' +
          '<div>' +
            '<h2>Join / onboarding</h2>' +
            '<p class="muted">Atur halaman &amp; pertanyaan join. Jawaban masuk ke akun siswa — field baru dibuat otomatis kalau belum ada.</p>' +
          '</div>' +
          '<div class="ob-ed-head-acts">' +
            '<button type="button" class="btn-sm" data-act="ob-preview">Preview sebagai siswa</button>' +
            '<button type="button" class="btn-sm" data-act="ob-reset">Reset default</button>' +
          '</div>' +
        '</div>' +
        '<ol class="ob-ed-pages">' +
          pages.map((p, i) => viewObPageEditor(p, i, pages.length)).join('') +
        '</ol>' +
        '<button type="button" class="btn secondary ob-ed-add-page" data-act="ob-page-add">+ Tambah halaman</button>' +
      '</div>' +
      '<div class="ps-actions">' +
        '<button type="button" class="btn ps-save" data-act="ob-save">Simpan</button>' +
        '<button type="button" class="btn-sm" data-act="tab" data-id="siswa">Close</button>' +
      '</div>' +
    '</div>';
  }
  function paintOnboardPreview() {
    const host = $('onboard-preview');
    if (!host) return;
    if (!isOnboardPreview()) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const pages = wizFormPages();
    const prev = ui.onboardPreview;
    let body;
    if (prev.done || prev.step >= pages.length) {
      body = '<section class="ob-flow">' +
        '<div class="ob-body">' +
          '<p class="ob-kicker">Preview</p>' +
          '<h1 class="ob-q">Selesai</h1>' +
          '<p class="ob-sub">Tidak ada data tersimpan. Siswa sungguhan baru mengirim saat join.</p>' +
        '</div>' +
        '<div class="ob-foot">' +
          '<button type="button" class="btn ob-cta" data-act="ob-preview-restart">Ulangi dari awal</button>' +
          '<button type="button" class="btn secondary ob-cta" data-act="ob-preview-close">Tutup</button>' +
        '</div></section>';
    } else {
      body = viewWizForm(Math.max(0, Number(prev.step) || 0));
    }
    host.hidden = false;
    host.innerHTML =
      '<div class="prof-preview-scrim" data-act="ob-preview-close"></div>' +
      '<div class="prof-preview-panel ob-preview-panel" role="dialog" aria-label="Onboarding preview">' +
        '<div class="prof-preview-bar">' +
          '<strong>Preview onboarding</strong>' +
          '<span class="muted prof-preview-hint">Seperti siswa · tidak menyimpan</span>' +
          '<button type="button" class="btn-sm" data-act="ob-preview-close">Close</button>' +
        '</div>' +
        '<div class="prof-preview-stage">' +
          '<div class="prof-preview-frame is-phone is-siswa-app ob-preview-flow">' + body + '</div>' +
        '</div>' +
      '</div>';
  }
  function viewAccountSettings() {
    ensureAccountSettings();
    const a = accountSettings();
    const pane = ui.accountPane === 'notifications'
      ? 'notifications'
      : (ui.accountPane === 'onboarding' ? 'onboarding' : 'security');
    ui.accountPane = pane;
    const body = pane === 'notifications'
      ? viewAccountNotifications(a)
      : (pane === 'onboarding' ? viewAccountOnboarding() : viewAccountSecurity(a));
    return '<section class="ps-page">' +
      '<div class="ps-page-head">' +
        '<h1>Account settings</h1>' +
      '</div>' +
      '<nav class="ps-tabs" role="tablist">' +
        '<button type="button" role="tab" data-act="account-pane" data-id="security" aria-selected="' +
          (pane === 'security') + '">Account security</button>' +
        '<button type="button" role="tab" data-act="account-pane" data-id="notifications" aria-selected="' +
          (pane === 'notifications') + '">Notifications</button>' +
        '<button type="button" role="tab" data-act="account-pane" data-id="onboarding" aria-selected="' +
          (pane === 'onboarding') + '">Onboarding</button>' +
      '</nav>' +
      '<div class="ps-body">' + body + '</div>' +
    '</section>';
  }
  function siswaPreviewSrc() {
    const u = new URL(location.origin + schoolPublicPath());
    u.searchParams.set('present', '1');
    u.searchParams.set('pane', 'student');
    u.searchParams.set('readonly', '1');
    return u.pathname + u.search;
  }
  function paintProfilePreview() {
    const host = $('profile-preview');
    if (!host) return;
    if (!ui.profilePreview) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const mode = ui.profilePreview === 'desktop' ? 'desktop' : 'phone';
    const frame = host.querySelector('.prof-preview-frame');
    const iframe = host.querySelector('iframe.siswa-preview-frame');
    if (frame && iframe && !host.hidden) {
      frame.classList.toggle('is-phone', mode === 'phone');
      frame.classList.toggle('is-desktop', mode === 'desktop');
      host.querySelectorAll('.prof-preview-toggle .btn-sm').forEach((b) => {
        b.classList.toggle('is-on', b.getAttribute('data-mode') === mode);
      });
      document.querySelectorAll('.ps-actions .prof-preview-toggle .btn-sm').forEach((b) => {
        b.classList.toggle('is-on', b.getAttribute('data-mode') === mode);
      });
      return;
    }
    host.hidden = false;
    host.innerHTML =
      '<div class="prof-preview-scrim" data-act="profile-preview-close"></div>' +
      '<div class="prof-preview-panel" role="dialog" aria-label="Siswa view">' +
        '<div class="prof-preview-bar">' +
          '<strong>Siswa view</strong>' +
          '<span class="muted prof-preview-hint">Navigasi penuh · read-only (tanpa komentar / kirim)</span>' +
          '<div class="prof-preview-toggle" role="group" aria-label="Device">' +
            '<button type="button" class="btn-sm' + (mode === 'phone' ? ' is-on' : '') +
              '" data-act="profile-preview" data-mode="phone">Phone</button>' +
            '<button type="button" class="btn-sm' + (mode === 'desktop' ? ' is-on' : '') +
              '" data-act="profile-preview" data-mode="desktop">Desktop</button>' +
          '</div>' +
          '<button type="button" class="btn-sm" data-act="profile-preview-close">Close</button>' +
        '</div>' +
        '<div class="prof-preview-stage">' +
          '<div class="prof-preview-frame is-' + mode + ' is-siswa-app">' +
            '<iframe class="siswa-preview-frame" title="Tampilan siswa" src="' + esc(siswaPreviewSrc()) + '"></iframe>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.querySelectorAll('.ps-actions .prof-preview-toggle .btn-sm').forEach((b) => {
      b.classList.toggle('is-on', b.getAttribute('data-mode') === mode);
    });
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
    const state = {
      lectures: cloneLectures(),
      catalog: SEED.catalog.map((p) => ({ ...p, outline: (p.outline || []).slice() })),
      weeks: SEED.weeks.map((w) => ({ ...w })),
      sessions: SEED.sessions.map((s) => ({ ...s })),
      billing: JSON.parse(JSON.stringify(SEED.billing)),
      crm: JSON.parse(JSON.stringify(SEED.crm || {})),
      applications: JSON.parse(JSON.stringify(SEED.applications || {})),
      remittances: JSON.parse(JSON.stringify(SEED.remittances || [])),
      payments: JSON.parse(JSON.stringify(SEED.paymentsSeed || [])),
      tasks: JSON.parse(JSON.stringify(SEED.tasksSeed || [])),
      timeline: JSON.parse(JSON.stringify(SEED.timelineSeed || {})),
      waQueue: JSON.parse(JSON.stringify(SEED.waQueueSeed || [])),
      emailQueue: JSON.parse(JSON.stringify(SEED.emailQueueSeed || [])),
      waThreads: JSON.parse(JSON.stringify(SEED.waThreadsSeed || [])),
      waMessages: JSON.parse(JSON.stringify(SEED.waMessagesSeed || [])),
      enrollments: JSON.parse(JSON.stringify(SEED.enrollmentsSeed || {})),
      people: {},
      schoolSlug: SEED.school.slug,
      inviteCode: SEED.cohort.invite,
      pricing: JSON.parse(JSON.stringify(SEED.pricing)),
      bank: JSON.parse(JSON.stringify(SEED.bank)),
      dunning: JSON.parse(JSON.stringify(SEED.dunning)),
      actionPlans: JSON.parse(JSON.stringify(SEED.actionPlans)),
      pipelineStages: JSON.parse(JSON.stringify(SEED.pipelineStages)),
      pipelineTransitions: JSON.parse(JSON.stringify(SEED.pipelineTransitions || [])),
      clockOffsetMs: 0,
      threads: SEED.threads.map((t) => ({ ...t })),
      replies: SEED.replies.map((r) => ({ ...r })),
      posts: JSON.parse(JSON.stringify(SEED.postsSeed || [])),
      comments: JSON.parse(JSON.stringify(SEED.commentsSeed || [])),
      batchNames: {},
      chats: {},
      attendance: JSON.parse(JSON.stringify(SEED.attendance)),
      notes: JSON.parse(JSON.stringify(SEED.notes)),
      announcements: SEED.announcements.map((a) => ({ ...a })),
      progress,
      lastLecture: last,
      kolab: {},
      sectionStyle: 'minggu',
      daftarCols: defaultDaftarCols(),
      daftarCustom: [],
      liveStudents: [],
      ownerContact: { wa: '', email: '' },
      lynkProducts: { month: { url: '', title: '', price: 0 }, quarter: { url: '', title: '', price: 0 }, half: { url: '', title: '', price: 0 } },
      schoolProfile: defaultSchoolProfile(),
      accountSettings: defaultAccountSettings(),
      onboarding: defaultOnboarding()
    };
    rebaseDemoClocks(state);
    return state;
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
      hydrateFunnel(merged);
      return merged;
    } catch {
      return defaultState();
    }
  }

  let db = load();
  if (!resolveVanitySlug()) return;
  const ui = {
    role: PRESENT && PRESENT_PANE === 'mentor' ? 'owner' : 'student',
    tab: 'home',
    mentorTab: 'dash',
    personaId: 's-kamu',
    lectureId: db.lastLecture['s-kamu'] || (SEED.lectures[0] && SEED.lectures[0].id),
    pane: 'tanya',
    drawerId: null,
    personId: null,
    siswaView: 'pipa',
    hubBack: 'pipa',
    stageFilter: '',
    dashRange: '30',
    dashFrom: '',
    dashTo: '',
    dashCustomOpen: false,
    dashFocus: '',
    queueKind: 'wa',
    taskPerson: '',
    taskAssignee: '',
    taskComposer: '',
    calYM: '',
    calDay: '',
    addItemWeek: '',
    addSecOpen: false,
    editSecId: null,
    editPlanId: null,
    kolabSel: new Set(),
    filterSiswa: '',
    kurOpen: false,
    skuId: null,
    skuPreview: false,
    skuFrom: 'alat',
    editLecId: null,
    kurEdit: false,
    composeMode: 'note',
    personMidTab: 'timeline',
    brandMenuOpen: false,
    profilePane: 'info',
    accountPane: 'security',
    profilePreview: null,
    onboardPreview: null,
    socialPick: null,
    shopPick: null,
    waDraft: '',
    waSending: false,
    waLive: null,
    daftarColsOpen: false,
    daftarSelected: new Set(),
    daftarTagFilter: '',
    daftarPayFilter: '',
    daftarJoinedFrom: '',
    daftarJoinedTo: '',
    daftarBulk: '',
    pipaSettingsOpen: false,
    pipaDeleteId: null,
    pustakaAddOpen: false,
    cariSiswa: '',
    cariOpen: false,
    tagPickerId: null,
    tagQuery: '',
    secFold: null,
    wizard: null,
    wizStep: null,
    wizDraft: null,
    wizTools: false,
    payTerm: 'month',
    examAnswers: {},
    payPrompt: false,
    crmFilter: '',
    present: PRESENT,
    presentPane: PRESENT_PANE,
    presentApplying: false,
    presentReady: false,
    mayar: null,
    admin: false,
    visitorId: '',
    visitorLive: false,
    adminSummary: null,
    lastTrackedLec: '',
    diskusiSub: 'batch',
    diskusiBatch: '',
    diskusiShowList: false,
    diskusiOpened: false,
    diskusiScroll: '',
    chatPeopleOpen: false,
    chatPeopleQ: '',
    chatPeopleFocus: false,
    pollOn: false,
    pollQuestion: '',
    pollOptions: ['', ''],
    pollFocus: '',
    postImages: [],
    postFiles: [],
    postBody: '',
    postUploading: false,
    lightbox: '',
    replyTo: null,
    commentDrafts: {},
    commentFocus: '',
    unreadJump: ''
  };
  if (PRESENT) document.documentElement.classList.add('present-pane');
  if (SISWA_READONLY) document.documentElement.classList.add('siswa-readonly');

  function isSiswaReadonly() { return !!SISWA_READONLY || !!ui.siswaReadonly; }

  function save() {
    const copy = { ...db, kolab: db.kolab };
    localStorage.setItem(KEY, JSON.stringify(copy));
    if (ui.presentApplying || ui.reloading) return;
    if (BUS) BUS.postMessage({ type: 'db' });
    if (ui.present && ui.presentReady && parent !== window) {
      parent.postMessage({ source: 'anton-school', type: 'live' }, location.origin);
    }
    schedulePush();
  }

  let syncRev = 0;
  let syncTimer = null;
  let syncPoll = null;
  let syncInFlight = false;
  let syncReady = false;
  let syncStatus = '';
  const pendingDiskusi = { posts: new Map(), comments: new Map(), chats: new Map() };
  function rememberDiskusiPost(post) { pendingDiskusi.posts.set(post.id, post); }
  function rememberDiskusiComment(row) { pendingDiskusi.comments.set(row.id, row); }
  function rememberDiskusiChat(id) {
    ensureDiskusi();
    pendingDiskusi.chats.set(id, {
      chat: db.chats[id] ? JSON.parse(JSON.stringify(db.chats[id])) : null,
      hasName: Object.prototype.hasOwnProperty.call(db.batchNames, id),
      name: db.batchNames[id] || ''
    });
  }
  function clearPendingDiskusi() {
    pendingDiskusi.posts.clear();
    pendingDiskusi.comments.clear();
    pendingDiskusi.chats.clear();
  }
  function reapplyPendingDiskusi() {
    ensureDiskusi();
    let added = false;
    pendingDiskusi.posts.forEach((post) => {
      const existing = db.posts.find((p) => p && p.id === post.id);
      if (!existing) {
        db.posts.push(post);
        added = true;
        return;
      }
      existing.poll = post.poll || null;
      existing.pinned = !!post.pinned;
      existing.body = post.body;
      existing.images = post.images || [];
      existing.files = post.files || [];
      added = true;
    });
    pendingDiskusi.comments.forEach((row) => {
      const existing = db.comments.find((c) => c && c.id === row.id);
      if (!existing) {
        db.comments.push(row);
        added = true;
        return;
      }
      existing.body = row.body;
      existing.likes = Array.isArray(row.likes) ? row.likes.slice() : (existing.likes || []);
      existing.replyTo = row.replyTo || '';
      added = true;
    });
    pendingDiskusi.chats.forEach((snap, id) => {
      if (snap.chat) db.chats[id] = snap.chat;
      if (snap.hasName && snap.name) db.batchNames[id] = snap.name;
      else if (!snap.hasName) delete db.batchNames[id];
      added = true;
    });
    if (!added) return false;
    save();
    render();
    return true;
  }

  function syncEnabled() {
    if (ui.present) return false;
    if (isLocalHost()) return PRESENT_QS.get('sync') === '1';
    return true;
  }
  function syncInvite() {
    try {
      return schoolInviteCode() || sessionStorage.getItem('anton-school-invite') || '';
    } catch (err) {
      return schoolInviteCode() || '';
    }
  }
  function syncUrl() {
    const slug = encodeURIComponent(schoolSlug());
    const k = encodeURIComponent(syncInvite());
    return apiBase() + '/state/' + slug + '?k=' + k;
  }
  function schedulePush() {
    if (!syncEnabled() || !syncReady) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushState, 800);
  }
  // Two browsers can save at once. The older rev gets 409 and reloads the server
  // copy, so the losing edit disappears. Known limitation; sync is last-write-wins.
  async function pushState(force, opts) {
    if (!syncEnabled()) return false;
    if (syncInFlight && !force) return false;
    const payload = {
      rev: (syncRev || 0) + 1,
      updatedAt: new Date().toISOString(),
      state: db
    };
    if (opts && opts.reset) payload.reset = true;
    let body;
    try { body = JSON.stringify(payload); } catch (err) { return false; }
    if (body.length > SYNC_MAX) {
      syncStatus = 'terlalu besar';
      toast('State terlalu besar untuk sync');
      return false;
    }
    syncInFlight = true;
    let ok = false;
    try {
      const res = await fetch(syncUrl(), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: body,
        cache: 'no-store'
      });
      if (res.status === 409) {
        syncStatus = 'revisi lama';
        syncInFlight = false;
        await pullState();
        reapplyPendingDiskusi();
        return false;
      }
      if (res.status === 403 && payload.reset) {
        syncStatus = 'reset ditolak';
        toast('Reset kelas hanya untuk admin.');
        return false;
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        syncRev = Number(data.rev) || payload.rev;
        syncStatus = 'ok · rev ' + syncRev;
        clearPendingDiskusi();
        ok = true;
      } else {
        syncStatus = 'gagal ' + res.status;
      }
    } catch (err) {
      syncStatus = 'offline';
    } finally {
      syncInFlight = false;
    }
    return ok;
  }
  async function pullState() {
    if (!syncEnabled() || syncInFlight) return;
    try {
      const res = await fetch(syncUrl(), { cache: 'no-store' });
      if (res.status === 404) return;
      if (!res.ok) {
        syncStatus = 'gagal ' + res.status;
        return;
      }
      const data = await res.json();
      if (!data || !data.state) return;
      const rev = Number(data.rev) || 0;
      if (rev <= syncRev) return;
      syncRev = rev;
      syncStatus = 'ok · rev ' + syncRev;
      localStorage.setItem(KEY, JSON.stringify(data.state));
      reloadDb();
    } catch (err) {
      syncStatus = 'offline';
    }
  }
  async function bootSync() {
    if (!syncEnabled()) return;
    await pullState();
    syncReady = true;
    if (syncPoll) clearInterval(syncPoll);
    syncPoll = setInterval(pullState, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pullState();
    });
  }

  function mergeActionPlans(have) {
    const list = Array.isArray(have) && have.length ? have : [];
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    (SEED.actionPlans || []).forEach((seed) => {
      if (!byId[seed.id]) list.push(JSON.parse(JSON.stringify(seed)));
      else {
        if (!byId[seed.id].trigger) byId[seed.id].trigger = seed.trigger;
        if (byId[seed.id].archived == null) byId[seed.id].archived = false;
      }
    });
    return list.length ? list : JSON.parse(JSON.stringify(SEED.actionPlans || []));
  }
  function people() {
    db.people = db.people || {};
    db.liveStudents = db.liveStudents || [];
    const seed = SEED.students.map((s) => Object.assign({}, s, db.people[s.id] || {}));
    const extra = db.liveStudents
      .filter((s) => s && s.id && !SEED.students.some((x) => x.id === s.id))
      .map((s) => Object.assign({}, s, db.people[s.id] || {}));
    return seed.concat(extra);
  }
  function patchPerson(id, fields) {
    db.people = db.people || {};
    db.people[id] = Object.assign({}, db.people[id] || {}, fields);
  }
  function student() {
    const found = people().find((s) => s.id === ui.personaId);
    if (found) return found;
    if (ui.visitorLive) return { id: ui.personaId, name: 'Tamu', wa: '', email: '', city: '' };
    return people()[0];
  }
  function billingOf(id) {
    if (!db.billing[id]) {
      db.billing[id] = { status: 'belum', plan: '', products: [], amount: 0, source: 'manual' };
    }
    const b = db.billing[id];
    if (!Array.isArray(b.products)) b.products = [];
    return b;
  }
  function crmOf(id) {
    if (!db.crm[id]) db.crm[id] = { stage: 'wa_baru' };
    return db.crm[id];
  }
  function nowMs() { return Date.now() + (db.clockOffsetMs || 0); }
  function nowDate() { return new Date(nowMs()); }
  function isoNow() { return nowDate().toISOString(); }
  function addMs(iso, ms) { return new Date(new Date(iso).getTime() + ms).toISOString(); }
  function hoursLeft(iso) {
    if (!iso) return null;
    return (new Date(iso).getTime() - nowMs()) / 36e5;
  }
  function fmtRemain(iso) {
    const h = hoursLeft(iso);
    if (h == null) return '—';
    if (h <= 0) return 'habis';
    if (h < 1) return Math.max(1, Math.round(h * 60)) + ' mnt';
    if (h < 48) return h.toFixed(1).replace(/\.0$/, '') + ' jam';
    return Math.round(h / 24) + ' hari';
  }
  function bundled(p) { return !p || p.includedInMentoring !== false; }
  function firstLectureId() {
    const l = lectures()[0];
    return (l && l.id) || FIRST_LEC;
  }
  function termActive(id) {
    const b = billingOf(id);
    if (b.status === 'gratis') return true;
    if (!b.accessUntil) return b.status === 'lunas' || b.status === 'cicilan';
    return nowMs() < new Date(b.accessUntil).getTime() + graceMs();
  }
  function graceMs() {
    return (Number(db.dunning.graceDays) || 1) * 86400000;
  }
  function warningMs() {
    return (Number(db.dunning.warningDays) || 5) * 86400000;
  }
  function inGrace(id) {
    const b = billingOf(id);
    if (!b.accessUntil || b.status === 'gratis') return false;
    const end = new Date(b.accessUntil).getTime();
    const t = nowMs();
    return t >= end && t < end + graceMs();
  }
  function isPending(id) {
    return billingOf(id).status === 'pending';
  }
  function canMentoring(id) {
    const b = billingOf(id);
    if (b.status === 'gratis') return true;
    if (b.status === 'pending' || b.status === 'belum' || b.status === 'trial') return false;
    if (b.plan !== 'mentoring' && b.status !== 'gratis') return false;
    if (inGrace(id)) return true;
    if (b.accessUntil && nowMs() >= new Date(b.accessUntil).getTime() + graceMs()) return false;
    return b.status === 'lunas' || b.status === 'cicilan';
  }
  function canPreview(id) {
    if (canMentoring(id)) return false;
    const b = billingOf(id);
    if (b.status === 'trial' || b.plan === 'preview') return true;
    const c = crmOf(id);
    if (c.stage === 'trial' || c.stage === 'nonton' || c.stage === 'sudah_keluar') return true;
    // Form sudah masuk — boleh lihat video 1 meski belum klik "Bayar nanti"
    if (db.applications[id] && (c.stage === 'form' || b.offerStartedAt)) return true;
    return false;
  }
  function canOpenLecture(id, lid) {
    if (lid === 'kolab') return canMentoring(id);
    if (canMentoring(id)) {
      const list = lectures();
      const idx = list.findIndex((l) => l.id === lid);
      if (idx < 0) return false;
      for (let i = 0; i < idx; i += 1) {
        if (!isDone(id, list[i].id)) return false;
      }
      return true;
    }
    if (canPreview(id) && lid === firstLectureId()) return true;
    return false;
  }
  /** Paid mentees may read ahead; trial still paywalls later videos. */
  function canViewLecture(id, lid) {
    if (isStaff()) return true;
    if (lid === 'kolab') return canMentoring(id);
    if (canMentoring(id)) return !!lectureById(lid);
    return canOpenLecture(id, lid);
  }
  function isSeqLocked(id, lid) {
    return canMentoring(id) && !canOpenLecture(id, lid) && lid !== 'kolab';
  }
  function isPaywalled(id, lid) {
    return !canMentoring(id) && !canOpenLecture(id, lid) && lid !== 'kolab';
  }
  function canSku(id, skuId) {
    const p = productById(skuId);
    if (canMentoring(id) && bundled(p)) return true;
    return billingOf(id).products.indexOf(skuId) !== -1;
  }
  function canLearn(id) { return canMentoring(id) || canPreview(id); }
  function needsWizard(id) {
    const c = crmOf(id);
    return !db.applications[id] && (c.stage === 'wa_baru' || c.stage === 'form');
  }
  function wizardStep(id) {
    if (!db.applications[id]) return 'form';
    return 'pay';
  }
  function catalog() { return db.catalog || SEED.catalog; }
  function productById(id) { return catalog().find((p) => p.id === id); }
  function isStaff() { return ui.role === 'owner' || ui.role === 'asisten'; }
  function canBill() { return ui.role === 'owner'; }

  const BATCH_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function monthKey(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return '';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit'
      }).format(d);
      return String(parts).slice(0, 7);
    } catch (err) {
      return '';
    }
  }
  function ensureDiskusi() {
    if (!Array.isArray(db.posts)) db.posts = [];
    if (!Array.isArray(db.comments)) db.comments = [];
    if (!db.batchNames || typeof db.batchNames !== 'object' || Array.isArray(db.batchNames)) db.batchNames = {};
    if (!db.chats || typeof db.chats !== 'object' || Array.isArray(db.chats)) db.chats = {};
  }
  function batchOf(sid) {
    if (!sid) return '';
    const person = people().find((s) => s.id === sid);
    if (person && /^\d{4}-\d{2}$/.test(String(person.batchId || ''))) return person.batchId;
    const paid = monthKey(billingOf(sid).paidAt);
    if (paid) return paid;
    const app = db.applications && db.applications[sid];
    return monthKey(app && app.at) || '';
  }
  function autoBatchOf(sid) {
    const paid = monthKey(billingOf(sid).paidAt);
    if (paid) return paid;
    const app = db.applications && db.applications[sid];
    return monthKey(app && app.at) || '';
  }
  function isMonthChat(id) { return /^\d{4}-\d{2}$/.test(String(id || '')); }
  function batchLabel(id) {
    if (!id) return 'Tanpa chat';
    ensureDiskusi();
    if (db.batchNames[id]) return db.batchNames[id];
    const m = /^(\d{4})-(\d{2})$/.exec(id);
    if (!m) return 'Chat baru';
    const name = BATCH_MONTHS[Number(m[2]) - 1] || m[2];
    return 'Batch ' + name + ' ' + m[1];
  }
  function batchList() {
    ensureDiskusi();
    const counts = {};
    function add(id, member) {
      if (!isMonthChat(id)) return;
      if (counts[id] == null) counts[id] = 0;
      if (member) counts[id] += 1;
    }
    people().forEach((s) => {
      if (!s || !canMentoring(s.id)) return;
      add(batchOf(s.id), true);
    });
    db.posts.forEach((p) => add(p && p.batchId, false));
    add(monthKey(isoNow()), false);
    return Object.keys(counts).sort((a, b) => b.localeCompare(a)).map((id) => ({
      id: id,
      label: batchLabel(id),
      count: counts[id]
    }));
  }
  function ensureChat(id) {
    ensureDiskusi();
    if (!db.chats[id]) db.chats[id] = { added: [], removed: [], createdAt: isoNow() };
    const rec = db.chats[id];
    if (!Array.isArray(rec.added)) rec.added = [];
    if (!Array.isArray(rec.removed)) rec.removed = [];
    return rec;
  }
  function chatMembers(id) {
    if (!id) return [];
    ensureDiskusi();
    const rec = db.chats[id] || { added: [], removed: [] };
    const removed = new Set(rec.removed || []);
    const ids = new Set();
    if (isMonthChat(id)) {
      people().forEach((s) => {
        if (s && canMentoring(s.id) && batchOf(s.id) === id && !removed.has(s.id)) ids.add(s.id);
      });
    }
    (rec.added || []).forEach((sid) => {
      if (sid && !removed.has(sid) && people().some((s) => s.id === sid)) ids.add(sid);
    });
    return Array.from(ids);
  }
  function memberOfChat(sid, id) {
    return !!sid && chatMembers(id).indexOf(sid) !== -1;
  }
  function allChatIds() {
    ensureDiskusi();
    const ids = new Set();
    batchList().forEach((b) => ids.add(b.id));
    Object.keys(db.chats).forEach((id) => ids.add(id));
    db.posts.forEach((p) => { if (p && p.batchId) ids.add(p.batchId); });
    return Array.from(ids);
  }
  function latestActivity(id) {
    let best = null;
    const inChat = new Set();
    (db.posts || []).forEach((p) => {
      if (!p || p.batchId !== id) return;
      inChat.add(p.id);
      if (!best || new Date(p.createdAt) > new Date(best.at)) best = { at: p.createdAt, kind: 'post', post: p, comment: null };
    });
    (db.comments || []).forEach((c) => {
      if (!c || !inChat.has(c.postId)) return;
      if (!best || new Date(c.createdAt) > new Date(best.at)) best = { at: c.createdAt, kind: 'comment', post: null, comment: c };
    });
    return best;
  }
  function chatActivity(id) {
    const last = latestActivity(id);
    const created = db.chats[id] && db.chats[id].createdAt;
    const times = [last && last.at, created].filter(Boolean).map((t) => new Date(t).getTime()).filter((n) => isFinite(n));
    return times.length ? Math.max.apply(null, times) : 0;
  }
  function chatPreviewText(act) {
    if (!act) return 'Belum ada catatan';
    if (act.kind === 'comment' && act.comment) {
      const body = String(act.comment.body || '').replace(/\s+/g, ' ').trim();
      const who = nameOf(act.comment.authorId);
      return ((who ? who + ': ' : '') + (body || 'Balasan')).slice(0, 80);
    }
    const post = act.post;
    if (post && post.poll && post.poll.question) return 'Poll · ' + post.poll.question;
    const body = String((post && post.body) || '').replace(/\s+/g, ' ').trim();
    if (body) return body.slice(0, 80);
    if (post && post.images && post.images.length) return 'Foto';
    if (post && post.files && post.files.length) return (post.files[0] && post.files[0].name) || 'File';
    return 'Catatan';
  }
  const DISKUSI_READ_KEY = 'anton-diskusi-read';
  function diskusiReadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(DISKUSI_READ_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (err) { return {}; }
  }
  function readCursor(chatId) {
    const mine = diskusiReadStore()[actorId()];
    if (!mine || typeof mine !== 'object') return '';
    return mine[chatId] || '';
  }
  function setReadCursor(chatId, at) {
    if (!chatId || !at) return false;
    const store = diskusiReadStore();
    const who = actorId();
    const mine = store[who] && typeof store[who] === 'object' ? store[who] : {};
    const prev = mine[chatId] || '';
    if (prev && new Date(prev).getTime() >= new Date(at).getTime()) return false;
    mine[chatId] = at;
    store[who] = mine;
    localStorage.setItem(DISKUSI_READ_KEY, JSON.stringify(store));
    return true;
  }
  function isUnreadAt(chatId, at, authorId) {
    if (!at || !authorId || authorId === actorId()) return false;
    const cursor = readCursor(chatId);
    if (!cursor) return true;
    const t = new Date(at).getTime();
    const c = new Date(cursor).getTime();
    return isFinite(t) && isFinite(c) && t > c;
  }
  function chatEvents(chatId) {
    const items = [];
    const postIds = new Set();
    (db.posts || []).forEach((p) => {
      if (!p || p.batchId !== chatId) return;
      postIds.add(p.id);
      items.push({ kind: 'post', id: p.id, at: p.createdAt, authorId: p.authorId, elId: 'dkp-' + p.id });
    });
    (db.comments || []).forEach((c) => {
      if (!c || !postIds.has(c.postId)) return;
      items.push({ kind: 'comment', id: c.id, at: c.createdAt, authorId: c.authorId, elId: 'dkc-' + c.id });
    });
    items.sort((a, b) => new Date(a.at) - new Date(b.at));
    return items;
  }
  function unreadEntries(chatId) {
    return chatEvents(chatId).filter((it) => isUnreadAt(chatId, it.at, it.authorId));
  }
  function unreadCount(chatId) {
    return unreadEntries(chatId).length;
  }
  function firstUnreadElId(chatId) {
    const first = unreadEntries(chatId)[0];
    return first ? first.elId : '';
  }
  function chatMeta(id) {
    const act = latestActivity(id);
    return {
      id: id,
      label: batchLabel(id),
      count: chatMembers(id).length,
      preview: chatPreviewText(act),
      when: act ? relWhen(act.at) : '',
      unread: unreadCount(id)
    };
  }
  function chatList() {
    return allChatIds().map(chatMeta).sort((a, b) => chatActivity(b.id) - chatActivity(a.id) || String(b.id).localeCompare(String(a.id)));
  }
  function chatsFor(sid) {
    if (!sid) return [];
    return chatList().filter((c) => memberOfChat(sid, c.id));
  }
  function diskusiVisible(sid) {
    if (canMentoring(sid)) return true;
    return chatsFor(sid).length > 0;
  }
  function visibleChats() {
    return isStaff() ? chatList() : chatsFor(ui.personaId);
  }
  function unreadTotal() {
    return visibleChats().reduce((sum, c) => sum + (c.unread || 0), 0);
  }
  function unreadJumpHtml() {
    const n = unreadTotal();
    if (!n) return '';
    return '<button type="button" class="dk-jump" data-act="unread-next" aria-label="Ke belum dibaca berikutnya">' +
      '<span class="dk-chevron" data-dir="down" aria-hidden="true"></span>' +
      '<span class="dk-jump-n">' + (n > 99 ? '99+' : n) + '</span></button>';
  }
  function scrollFeedTo(el) {
    const feed = el && el.closest && el.closest('.dk-feed');
    if (!feed || !el) return;
    const fr = feed.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    ui.diskusiScrollSilentUntil = Date.now() + 200;
    feed.scrollTop += er.top - fr.top - (feed.clientHeight / 2) + (er.height / 2);
  }
  function nextUnreadJump() {
    const current = ui.diskusiSub === 'tanya' ? '' : activeDiskusiBatch();
    const feed = document.querySelector('.dk-feed');
    if (current && feed && feed.clientHeight > 40) {
      const box = feed.getBoundingClientRect();
      const here = unreadEntries(current);
      const below = here.find((it) => {
        const el = document.getElementById(it.elId);
        return !el || el.getBoundingClientRect().top > box.bottom - 12;
      });
      if (below) return { chatId: current, item: below, dir: 'down' };
      const above = here.slice().reverse().find((it) => {
        const el = document.getElementById(it.elId);
        return el && el.getBoundingClientRect().bottom < box.top + 12;
      });
      if (above) return { chatId: current, item: above, dir: 'up' };
    }
    const list = visibleChats();
    const start = Math.max(0, list.findIndex((c) => c.id === current));
    for (let step = 1; step <= list.length; step += 1) {
      const c = list[(start + step) % list.length];
      if (!c || c.id === current) continue;
      const pending = unreadEntries(c.id);
      if (pending.length) return { chatId: c.id, item: pending[0], dir: 'down' };
    }
    return null;
  }
  function acknowledgeUnread() {
    const feed = document.querySelector('.dk-feed');
    if (!feed || feed.clientHeight < 40 || ui.diskusiSub === 'tanya') return false;
    const batch = activeDiskusiBatch();
    if (!batch) return false;
    const box = feed.getBoundingClientRect();
    const items = unreadEntries(batch);
    let cursor = '';
    for (let i = 0; i < items.length; i += 1) {
      const el = document.getElementById(items[i].elId);
      if (!el) break;
      if (el.getBoundingClientRect().top > box.bottom - 16) break;
      cursor = items[i].at;
    }
    if (!cursor) return false;
    return setReadCursor(batch, cursor);
  }
  function paintUnreadChrome() {
    document.querySelectorAll('.dk-row[data-act="diskusi-batch"]').forEach((row) => {
      const n = unreadCount(row.getAttribute('data-id') || '');
      row.classList.toggle('is-unread', n > 0);
      const meta = row.querySelector('.dk-row-meta');
      if (!meta) return;
      let badge = meta.querySelector('.dk-badge');
      if (n > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'dk-badge';
          meta.appendChild(badge);
        }
        badge.textContent = n > 99 ? '99+' : String(n);
      } else if (badge) badge.remove();
    });
    const total = unreadTotal();
    document.querySelectorAll('[data-act="unread-next"]').forEach((btn) => {
      btn.hidden = !total;
      const num = btn.querySelector('.dk-jump-n');
      if (num && total) num.textContent = total > 99 ? '99+' : String(total);
      const chev = btn.querySelector('.dk-chevron');
      const jump = total ? nextUnreadJump() : null;
      if (chev && jump) chev.setAttribute('data-dir', jump.dir || 'down');
    });
  }
  function canPostIn(sid, batchId) {
    if (isSiswaReadonly()) return false;
    if (!batchId) return false;
    if (isStaff()) return true;
    return memberOfChat(sid, batchId);
  }
  function addChatMember(chatId, sid) {
    if (!chatId || !sid || !people().some((s) => s.id === sid)) return;
    const rec = ensureChat(chatId);
    rec.removed = rec.removed.filter((x) => x !== sid);
    const auto = isMonthChat(chatId) && canMentoring(sid) && batchOf(sid) === chatId;
    if (!auto && rec.added.indexOf(sid) < 0) rec.added.push(sid);
  }
  function removeChatMember(chatId, sid) {
    if (!chatId || !sid) return;
    const rec = ensureChat(chatId);
    rec.added = rec.added.filter((x) => x !== sid);
    const auto = isMonthChat(chatId) && canMentoring(sid) && batchOf(sid) === chatId;
    if (auto && rec.removed.indexOf(sid) < 0) rec.removed.push(sid);
  }
  function createChat() {
    if (!isStaff()) return;
    ensureDiskusi();
    const id = 'c-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
    db.chats[id] = { added: [], removed: [], createdAt: isoNow() };
    db.batchNames[id] = 'Batch baru';
    rememberDiskusiChat(id);
    ui.diskusiBatch = id;
    ui.diskusiSub = 'batch';
    ui.diskusiShowList = false;
    ui.diskusiOpened = true;
    ui.chatPeopleOpen = true;
    ui.chatPeopleQ = '';
    ui.diskusiScroll = 'bottom';
    save();
    render();
  }
  function actorId() {
    if (isStaff()) return ui.role === 'asisten' ? 'u-lia' : ((SEED.school && SEED.school.ownerId) || 'u-anton');
    return ui.personaId;
  }
  function actorOf(id) {
    const person = people().find((s) => s.id === id);
    if (person) return person;
    const staff = (SEED.staff || []).find((s) => s.id === id);
    if (staff) return staff;
    return { id: id, name: nameOf(id) };
  }
  function actorAvatar(id, cls) {
    const s = actorOf(id);
    const c = cls || 'avatar';
    if (s && s.photo && !s.photoUrl && !s.photoBlob) {
      return '<img class="' + c + '" src="' + esc(s.photo) + '" alt="">';
    }
    return avatarHtml(s, c);
  }
  function activeDiskusiBatch() {
    const list = visibleChats();
    if (ui.diskusiBatch && list.some((b) => b.id === ui.diskusiBatch)) return ui.diskusiBatch;
    return (list[0] || {}).id || '';
  }

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
    if (val && lid === firstLectureId() && !canMentoring(sid)) {
      const c = crmOf(sid);
      if (!c.watchedFirstAt) {
        c.watchedFirstAt = isoNow();
        pushTimeline(sid, 'video', 'Selesai video 1.');
        ui.payPrompt = true;
      }
    }
    save();
    trackEvent(val ? 'lesson_done' : 'lesson_open', {
      lessonId: lid,
      progress: kurProgress(sid).pct,
      stage: crmOf(sid).stage
    });
  }
  function watchHintHtml(lec, done) {
    const watchFirst = lec && lec.type === 'video' && lec.id === firstLectureId();
    const seq = lec && isSeqLocked(ui.personaId, lec.id);
    const dot = '<span class="lec-watch-dot" aria-hidden="true"></span>';
    if (watchFirst) {
      if (done) {
        return '<div class="lec-watch is-done" data-watch-status="done">' + dot +
          '<span>Selesai ✓</span></div>';
      }
      return '<div class="lec-watch" data-watch-status="pending">' + dot +
        '<span>Tonton minimal 85% untuk menandai video selesai</span>' +
        '<span class="lec-watch-i" title="Selesai otomatis setelah nonton ≥85%">i</span></div>';
    }
    if (!lec) return '';
    if (seq) {
      return '<div class="lec-watch is-seq" title="Selesaikan materi sebelumnya dulu">' + dot +
        '<span>Selesaikan materi sebelumnya dulu</span></div>';
    }
    return '<button type="button" class="lec-watch' + (done ? ' is-done' : '') +
      '" data-act="toggle-done" data-id="' + esc(lec.id) + '">' + dot +
      '<span>' + (done ? 'Selesai ✓' : 'Tandai selesai') + '</span></button>';
  }
  function completeByWatch(lecId) {
    if (lecId !== firstLectureId()) return false;
    if (isDone(ui.personaId, lecId)) return false;
    markDone(ui.personaId, lecId, true);
    const slot = document.querySelector('[data-watch-status]');
    if (slot) {
      slot.outerHTML = watchHintHtml(lectureById(lecId) || { id: lecId, type: 'video' }, true);
    }
    refreshProgressPath();
    toast('Video 1 selesai — nonton ≥85%.');
    return true;
  }
  function bindWatchProgress() {
    const WATCH_PCT = 0.85;
    $('main').querySelectorAll('video[data-watch-lec]').forEach((vid) => {
      if (vid._watchBound) return;
      vid._watchBound = true;
      const lecId = vid.getAttribute('data-watch-lec');
      const onTick = () => {
        if (!vid.duration || !isFinite(vid.duration)) return;
        if (vid.currentTime / vid.duration >= WATCH_PCT) {
          if (completeByWatch(lecId)) vid.removeEventListener('timeupdate', onTick);
        }
      };
      vid.addEventListener('timeupdate', onTick);
    });
  }
  let _ytApiPromise = null;
  function loadYtApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (_ytApiPromise) return _ytApiPromise;
    _ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prev === 'function') prev();
        resolve();
      };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'yt-iframe-api';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
      if (window.YT && window.YT.Player) resolve();
    });
    return _ytApiPromise;
  }
  function mountYtWatchPlayer(hostId, videoId, lecId) {
    const WATCH_PCT = 0.85;
    loadYtApi().then(() => {
      if (!document.getElementById(hostId)) return;
      let poll = null;
      const stop = () => { if (poll) { clearInterval(poll); poll = null; } };
      const player = new window.YT.Player(hostId, {
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: location.origin
        },
        events: {
          onStateChange: (ev) => {
            if (ev.data === window.YT.PlayerState.PLAYING) {
              stop();
              poll = setInterval(() => {
                try {
                  const t = player.getCurrentTime();
                  const d = player.getDuration();
                  if (d > 0 && t / d >= WATCH_PCT) {
                    stop();
                    completeByWatch(lecId);
                  }
                } catch (err) { /* player gone */ }
              }, 800);
            } else if (ev.data === window.YT.PlayerState.PAUSED ||
              ev.data === window.YT.PlayerState.ENDED) {
              if (ev.data === window.YT.PlayerState.ENDED) completeByWatch(lecId);
              stop();
            }
          }
        }
      });
    }).catch(() => { /* offline / blocked */ });
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
  function currentProgressId(sid) {
    sid = sid || ui.personaId;
    if (sid === ui.personaId && ui.lectureId && ui.lectureId !== 'kolab' && lectureById(ui.lectureId)) {
      return ui.lectureId;
    }
    return db.lastLecture[sid] || firstLectureId();
  }
  function progressBarHtml(sid) {
    return resumePathHtml(sid, currentProgressId(sid));
  }
  function refreshProgressPath() {
    document.querySelectorAll('[data-progress-path]').forEach((el) => {
      const sid = el.getAttribute('data-sid') || ui.personaId;
      el.outerHTML = resumePathHtml(sid, currentProgressId(sid));
    });
  }
  function nextKurMilestone(n, total) {
    if (!total) return null;
    if (n >= total) return { done: true, need: 0, pct: 100 };
    const marks = [25, 50, 75, 100];
    const pct = (n / total) * 100;
    const next = marks.find((m) => pct < m - 0.01) || 100;
    const targetN = Math.ceil((next / 100) * total);
    return { done: false, need: Math.max(1, targetN - n), pct: next };
  }
  function svgIcon(name) {
    if (name === 'play') {
      return '<svg class="rj-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.2 3.4v9.2L13 8z" fill="currentColor"/></svg>';
    }
    if (name === 'book') {
      return '<svg class="rj-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    }
    if (name === 'check') {
      return '<svg class="rj-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.4 6.2 4.8 8.6 9.6 3.4" fill="none" stroke="#052e16" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    if (name === 'target') {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    }
    if (name === 'doc') {
      return '<svg class="lec-acc-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z" stroke="currentColor" stroke-width="1.7"/><path d="M14 3.5V9h5.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    }
    if (name === 'list') {
      return '<svg class="lec-acc-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 7h12M8 12h12M8 17h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4.2" cy="7" r="1" fill="currentColor"/><circle cx="4.2" cy="12" r="1" fill="currentColor"/><circle cx="4.2" cy="17" r="1" fill="currentColor"/></svg>';
    }
    if (name === 'help') {
      return '<svg class="lec-acc-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.1.8-1.1 1.6V14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1" fill="currentColor"/></svg>';
    }
    if (name === 'chat') {
      return '<svg class="lec-acc-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V8A1.5 1.5 0 0 1 5 6.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    }
    return '';
  }
  function dockIcon(id) {
    const common = ' class="dock-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"';
    if (id === 'home') {
      return '<svg' + common + '><path d="M4.5 11.2 12 4.8l7.5 6.4V20a1 1 0 0 1-1 1h-4.2v-6.2h-4.6V21H5.5a1 1 0 0 1-1-1v-8.8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    }
    if (id === 'belajar') {
      return '<svg' + common + '><path d="M3.5 10.2 12 6l8.5 4.2L12 14.4 3.5 10.2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 12.2v4.2c2.2 1.6 7.8 1.6 10 0v-4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M20.5 10.5v5.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    }
    if (id === 'alat') {
      return '<svg' + common + '><path d="M14.2 5.2a4.2 4.2 0 0 0-5.7 5.7L4 15.4l4.6 4.6 4.5-4.5a4.2 4.2 0 0 0 5.7-5.7l-2.8 2.8-1.8-1.8 2.8-2.8z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    }
    if (id === 'pustaka') {
      return '<svg' + common + '><path d="M6.5 4H18v16H7.2A2.2 2.2 0 0 1 5 17.8V6.2A2.2 2.2 0 0 1 7.2 4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8h6M9 12h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    }
    if (id === 'diskusi') {
      return '<svg' + common + '><path d="M5 6.2h14A1.3 1.3 0 0 1 20.3 7.5v8.2A1.3 1.3 0 0 1 19 17H9.2L5 20.2V6.2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    }
    if (id === 'progres') {
      return '<svg' + common + '><path d="M5 19V11M10.5 19V6M16 19v-8M21 19H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }
    return '';
  }
  function resumePathHtml(sid, currentId) {
    const list = lectures();
    const p = kurProgress(sid);
    if (!list.length) return '';
    let curIdx = list.findIndex((l) => l.id === currentId);
    if (curIdx < 0) {
      curIdx = list.findIndex((l) => !isDone(sid, l.id));
      if (curIdx < 0) curIdx = list.length - 1;
    }
    const fill = list.length <= 1 ? 1 : curIdx / (list.length - 1);
    const remain = Math.max(0, p.total - p.n);
    const here = Math.round(fill * 100);
    const nodes = list.map((l, i) => {
      const done = isDone(sid, l.id);
      const now = i === curIdx;
      const locked = !canOpenLecture(sid, l.id) && !isStaff();
      let cls = 'path-node';
      if (now) cls += ' is-now';
      else if (done) cls += ' is-done';
      else if (locked) cls += ' is-locked';
      else cls += ' is-todo';
      const label = (i + 1) + '. ' + l.title + (done ? ' · selesai' : now ? ' · sedang di sini' :
        (locked && canMentoring(sid) ? ' · lihat dulu' : locked ? ' · terkunci' : ''));
      return '<button type="button" class="' + cls + '" data-act="open-lec" data-id="' + esc(l.id) + '"' +
        (now ? ' aria-current="step"' : '') +
        ' title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
        (done && !now ? svgIcon('check') : '') +
        '</button>';
    }).join('');
    return '<div class="rj-board" data-progress-path data-sid="' + esc(sid) + '" role="group" aria-label="Progress kurikulum, ' + p.n + ' dari ' + p.total + ' selesai">' +
      '<div class="rj-board-head"><span>Progress kamu</span><span class="rj-pct">' + p.pct + '% selesai</span></div>' +
      '<div class="path-rail" style="--fill:' + fill.toFixed(4) + '">' +
        '<span class="path-rail-bg" aria-hidden="true"></span>' +
        '<span class="path-rail-fill" aria-hidden="true"></span>' +
        nodes +
      '</div>' +
      '<div class="path-foot" style="--here:' + here + '">' +
        '<div class="path-here"><strong>' + p.n + ' / ' + p.total + ' materi selesai</strong>' +
        '<span>Kamu sedang di sini</span></div>' +
        '<p class="path-remain">' + (remain ? (remain + ' materi lagi sampai selesai') : 'Semua materi selesai') + '</p>' +
      '</div>' +
      resumeMileHtml(sid, p) +
      '</div>';
  }
  function resumeMileHtml(sid, p) {
    const mile = nextKurMilestone(p.n, p.total);
    if (!mile) return '';
    if (mile.done) {
      const c = crmOf(sid);
      const goTes = !c.examScore;
      return '<button type="button" class="rj-mile" data-act="' + (goTes ? 'tab' : 'lihat-kur') + '" data-id="' + (goTes ? 'tes' : '') + '">' +
        '<span class="rj-mile-ico" aria-hidden="true">' + svgIcon('target') + '</span>' +
        '<span class="rj-mile-copy"><em>Kurikulum selesai</em>' +
        '<strong>' + (goTes ? 'Ambil tes akhir untuk sertifikat' : 'Semua materi sudah ditandai selesai') + '</strong></span>' +
        '<span class="rj-mile-go" aria-hidden="true">›</span></button>';
    }
    return '<button type="button" class="rj-mile" data-act="lihat-kur">' +
      '<span class="rj-mile-ico" aria-hidden="true">' + svgIcon('target') + '</span>' +
      '<span class="rj-mile-copy"><em>Milestone berikutnya</em>' +
      '<strong>Selesaikan ' + mile.need + ' materi lagi untuk mencapai ' + mile.pct + '%</strong></span>' +
      '<span class="rj-mile-go" aria-hidden="true">›</span></button>';
  }
  function resumeJourneyHtml(sid, last, preview) {
    const p = kurProgress(sid);
    return '<section class="card resume-journey">' +
      '<div class="rj-hero">' +
        '<p class="rj-kicker">' + (preview ? 'Coba video 1' : 'Lanjutkan belajar') + '</p>' +
        '<h2>' + esc(last.title) + '</h2>' +
        '<p class="rj-meta">' + esc(typeLabel(last.type)) + ' · ' + p.n + '/' + p.total + ' video' +
        (preview ? ' · video lain terkunci sampai lunas' : '') + '</p>' +
      '</div>' +
      resumePathHtml(sid, last.id) +
      '<div class="rj-acts">' +
        '<button type="button" class="btn" data-act="open-lec" data-id="' + esc(last.id) + '">' +
          svgIcon('play') + ' Buka materi</button>' +
        '<button type="button" class="btn secondary" data-act="lihat-kur">' +
          svgIcon('book') + ' Lihat kurikulum</button>' +
      '</div></section>';
  }
  function currentWeekId(sid) {
    for (let i = 0; i < db.weeks.length; i += 1) {
      if (progressPct(sid, db.weeks[i].id) < 100) return db.weeks[i].id;
    }
    return db.weeks.length ? db.weeks[db.weeks.length - 1].id : '';
  }

  function nextSession() {
    const now = nowMs();
    return db.sessions.find((s) => new Date(s.startsAt).getTime() >= now) || db.sessions[db.sessions.length - 1];
  }
  function belumSiap(session) {
    const need = session.required || [];
    return people().filter((s) => {
      if (!canMentoring(s.id)) return false;
      return need.some((lid) => !isDone(s.id, lid));
    });
  }

  function waLink(phone, text) {
    const n = normalizeWa(phone);
    if (!n) return '';
    const encoded = text ? encodeURIComponent(text) : '';
    if (isPhoneUa()) return 'https://wa.me/' + n + (encoded ? ('?text=' + encoded) : '');
    return 'whatsapp://send?phone=' + n + (encoded ? ('&text=' + encoded) : '');
  }
  function ownerContact() {
    if (!db.ownerContact) db.ownerContact = { wa: '', email: '' };
    return db.ownerContact;
  }
  function ownerWa() {
    return normalizeWa(ownerContact().wa || (SEED.staff[0] && SEED.staff[0].wa) || '');
  }
  function ownerEmail() {
    return String(ownerContact().email || '').trim();
  }
  function openApp(href) {
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function visitorId() {
    try {
      let id = localStorage.getItem('anton-visitor') || '';
      if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('v' + Date.now().toString(36));
        localStorage.setItem('anton-visitor', id);
      }
      return id;
    } catch (err) {
      return 'v-anon';
    }
  }
  function trackEvent(type, extra) {
    if (ui.present || ui.admin) return;
    const person = (typeof people === 'function') ? (people().find((s) => s.id === ui.personaId) || {}) : {};
    const demo = !ui.visitorLive || String(ui.personaId || '').indexOf('s-') === 0;
    const body = Object.assign({
      type: type,
      visitorId: ui.visitorId || visitorId(),
      path: location.pathname + location.search,
      referrer: document.referrer || '',
      personaId: ui.personaId || '',
      name: person.name && person.name !== 'Tamu' ? person.name : '',
      wa: person.wa || '',
      email: person.email || '',
      stage: (db.crm && db.crm[ui.personaId] && db.crm[ui.personaId].stage) || '',
      progress: (typeof kurProgress === 'function' && ui.personaId) ? kurProgress(ui.personaId).pct : null,
      staff: !!ui.admin,
      demo: demo && !ui.visitorLive
    }, extra || {});
    fetch(apiBase() + '/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).catch(() => {});
  }
  function postIssue(fields) {
    const person = people().find((s) => s.id === ui.personaId) || {};
    fetch(apiBase() + '/issues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({
        visitorId: ui.visitorId || visitorId(),
        name: person.name && person.name !== 'Tamu' ? person.name : '',
        wa: person.wa || '',
        kind: 'report'
      }, fields || {}))
    }).catch(() => {});
  }
  function normalizeWa(raw) {
    let d = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('0') === 0) d = '62' + d.slice(1);
    if (d.indexOf('8') === 0 && d.length >= 9) d = '62' + d;
    if (d.indexOf('620') === 0) d = '62' + d.slice(3);
    return d;
  }
  function ensureWaStore() {
    if (!Array.isArray(db.waThreads)) db.waThreads = JSON.parse(JSON.stringify(SEED.waThreadsSeed || []));
    if (!Array.isArray(db.waMessages)) db.waMessages = JSON.parse(JSON.stringify(SEED.waMessagesSeed || []));
  }
  function waApiEnabled() {
    // This host has no Fonnte bridge. Keep chat inside the CRM instead of polling /wa.
    return false;
  }
  function waApiUrl(path, extra) {
    const q = new URLSearchParams();
    const k = syncInvite();
    if (k) q.set('k', k);
    q.set('slug', schoolSlug());
    Object.keys(extra || {}).forEach((key) => {
      if (extra[key] != null && extra[key] !== '') q.set(key, extra[key]);
    });
    return apiBase() + '/wa/' + path + '?' + q.toString();
  }
  function waThreadOf(personId, phone) {
    ensureWaStore();
    const p = normalizeWa(phone);
    return (db.waThreads || []).find((t) =>
      (personId && t.personId === personId) || (p && t.phone === p)
    ) || null;
  }
  function waMessagesOf(thread) {
    ensureWaStore();
    if (!thread) return [];
    return (db.waMessages || []).filter((m) => m.threadId === thread.id)
      .slice()
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }
  function waUnreadFor(personId) {
    const t = waThreadOf(personId, (people().find((s) => s.id === personId) || {}).wa);
    return t ? (Number(t.unread) || 0) : 0;
  }
  function waUnreadTotal() {
    ensureWaStore();
    return (db.waThreads || []).reduce((n, t) => n + (Number(t.unread) || 0), 0);
  }
  function waUnreadBadge(personId) {
    const n = waUnreadFor(personId);
    return n
      ? ' <span class="chip warn wa-badge" data-wa-badge="' + esc(personId) + '">' + n + '</span>'
      : '<span class="wa-badge-slot" data-wa-badge="' + esc(personId) + '" hidden></span>';
  }
  function upsertLocalThread(rec) {
    if (!rec) return null;
    ensureWaStore();
    const phone = normalizeWa(rec.phone);
    let cur = db.waThreads.find((t) => t.id === rec.id || (phone && t.phone === phone) ||
      (rec.personId && t.personId === rec.personId));
    if (!cur) {
      cur = {
        id: rec.id || ('th-' + Date.now().toString(36)),
        personId: rec.personId || null,
        phone: phone,
        updatedAt: rec.updatedAt || isoNow(),
        unread: Number(rec.unread) || 0
      };
      db.waThreads.unshift(cur);
      return cur;
    }
    if (rec.id && rec.id !== cur.id) {
      const oldId = cur.id;
      cur.id = rec.id;
      db.waMessages.forEach((m) => {
        if (m.threadId === oldId) m.threadId = rec.id;
      });
    }
    if (rec.personId) cur.personId = rec.personId;
    if (phone) cur.phone = phone;
    if (rec.updatedAt) cur.updatedAt = rec.updatedAt;
    if (rec.unread != null) cur.unread = Number(rec.unread) || 0;
    return cur;
  }
  function upsertLocalMessage(msg) {
    if (!msg || !msg.id) return false;
    ensureWaStore();
    const hit = db.waMessages.find((m) =>
      m.id === msg.id || (msg.providerId && m.providerId && m.providerId === msg.providerId));
    if (hit) {
      if (msg.status) hit.status = msg.status;
      return false;
    }
    db.waMessages.push({
      id: msg.id,
      threadId: msg.threadId,
      direction: msg.direction,
      body: msg.body,
      at: msg.at || isoNow(),
      status: msg.status || (msg.direction === 'in' ? 'received' : 'sent'),
      providerId: msg.providerId || null
    });
    return true;
  }
  function applyRemoteThread(data, personId) {
    if (!data) return { addedIn: 0 };
    if (data.thread) {
      if (personId && !data.thread.personId) data.thread.personId = personId;
      upsertLocalThread(data.thread);
    }
    let addedIn = 0;
    (data.messages || []).forEach((m) => {
      if (upsertLocalMessage(m) && m.direction === 'in') addedIn += 1;
    });
    return { addedIn: addedIn };
  }
  function markWaRead(personId) {
    const s = people().find((x) => x.id === personId) || {};
    const t = waThreadOf(personId, s.wa);
    if (!t || !t.unread) return;
    t.unread = 0;
    save();
    if (waApiEnabled() && ui.waLive) {
      fetch(waApiUrl('thread'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'read', personId: personId, phone: s.wa || t.phone })
      }).catch(() => {});
    }
  }
  function waStatusLine() {
    if (!waApiEnabled()) {
      return 'Demo lokal: kirim tersimpan di CRM, tidak lewat Fonnte. Device live hanya di remote demo.';
    }
    if (!ui.waLive) return 'Menyambung ke inbox WA…';
    if (ui.waLive.deviceReady) return 'Fonnte siap. Kirim dari sini masuk HP siswa; balasan muncul di thread.';
    return 'Perangkat Fonnte belum siap. Kirim tetap tercatat di CRM; Buka WA sebagai cadangan.';
  }
  async function refreshWaStatus() {
    if (!waApiEnabled()) {
      ui.waLive = { live: false, deviceReady: false };
      return ui.waLive;
    }
    try {
      const res = await fetch(waApiUrl('status'), { cache: 'no-store' });
      ui.waLive = res.ok ? await res.json() : { live: false, deviceReady: false };
    } catch (err) {
      ui.waLive = { live: false, deviceReady: false };
    }
    return ui.waLive;
  }
  async function pullWaThread(personId, opts) {
    const s = people().find((x) => x.id === personId) || {};
    if (!waApiEnabled()) return;
    try {
      const res = await fetch(waApiUrl('thread', { personId: personId, phone: s.wa || '' }), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const before = (db.waMessages || []).length;
      const got = applyRemoteThread(data, personId);
      if ((db.waMessages || []).length !== before || got.addedIn) {
        if (got.addedIn && !(opts && opts.silentTimeline) && personId) {
          pushTimeline(personId, 'wa', 'Balasan WA masuk');
        }
        save();
        if (!(opts && opts.noPaint)) paintWaChrome();
      }
    } catch (err) { /* offline */ }
  }
  async function pullWaInbox(opts) {
    if (!waApiEnabled()) return;
    try {
      const res = await fetch(waApiUrl('inbox'), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      let changed = false;
      (data.threads || []).forEach((t) => {
        const prev = waThreadOf(t.personId, t.phone);
        const next = upsertLocalThread(t);
        if (!prev || prev.unread !== next.unread || prev.updatedAt !== next.updatedAt) changed = true;
      });
      if (changed) {
        save();
        if (!(opts && opts.noPaint)) paintWaChrome();
      }
    } catch (err) { /* offline */ }
  }
  function waBubblesHtml(personId) {
    const s = people().find((x) => x.id === personId) || {};
    const thread = waThreadOf(personId, s.wa);
    const msgs = waMessagesOf(thread);
    if (!msgs.length) {
      return '<p class="muted wa-empty">Belum ada chat setelah perangkat tersambung. Riwayat WA lama tidak ikut.</p>';
    }
    return msgs.map((m) =>
      '<div class="wa-bubble is-' + (m.direction === 'out' ? 'out' : 'in') + '">' +
        '<div class="wa-bubble-body">' + esc(m.body).replace(/\n/g, '<br>') + '</div>' +
        '<div class="wa-bubble-meta">' + esc(relWhen(m.at)) +
          (m.direction === 'out' ? ' · ' + esc(m.status === 'local' ? 'lokal' : (m.status || 'terkirim')) : '') +
        '</div></div>'
    ).join('');
  }
  function waComposerHtml(id, s) {
    if (!s.wa) return '<p class="muted">Belum ada nomor WA. Isi di kolom kiri dulu.</p>';
    const draft = ui.waDraft || '';
    const href = waLink(s.wa, draft || ('Halo ' + s.name + ', dari MasterMind with Anton GC.'));
    const deviceSend = (ui.waLive && ui.waLive.deviceReady)
      ? '<button class="btn secondary" type="submit"' + (ui.waSending ? ' disabled' : '') + '>' +
          (ui.waSending ? 'Mengirim…' : 'Kirim dari perangkat') + '</button>'
      : '';
    return '<p class="muted wa-status">Membuka aplikasi WhatsApp.</p>' +
      '<div class="wa-thread" id="wa-thread" data-id="' + esc(id) + '">' + waBubblesHtml(id) + '</div>' +
      '<form class="compose wa-compose" data-act="wa-send" data-id="' + esc(id) + '">' +
        '<textarea name="body" rows="3" placeholder="Tulis pesan, lalu buka WhatsApp…">' + esc(draft) + '</textarea>' +
        '<div class="wa-compose-row">' +
          '<a class="btn" data-wa-open href="' + esc(href) + '">Buka WhatsApp</a>' +
          deviceSend +
        '</div></form>';
  }
  function waInboxRows() {
    ensureWaStore();
    const rows = (db.waThreads || []).filter((t) => (Number(t.unread) || 0) > 0 || !t.personId)
      .slice()
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return rows;
  }
  function waInboxHtml() {
    const rows = waInboxRows();
    if (!rows.length) return '';
    const peopleById = Object.fromEntries(people().map((s) => [s.id, s]));
    const items = rows.map((t) => {
      const s = t.personId ? peopleById[t.personId] : null;
      const last = waMessagesOf(t).slice(-1)[0];
      const name = s ? s.name : ('Nomor belum dipasang · ' + fmtPhone(t.phone));
      const attach = !t.personId
        ? '<form class="wa-attach" data-act="wa-attach" data-phone="' + esc(t.phone) + '">' +
            '<select name="personId" required>' +
              '<option value="">Pasang ke siswa…</option>' +
              people().map((p) => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('') +
            '</select><button class="btn-sm" type="submit">Pasang</button></form>'
        : '<button type="button" class="btn-sm" data-act="wa-crm-send" data-id="' + esc(t.personId) + '">Buka chat</button>';
      return '<div class="wa-inbox-row">' +
        (s ? avatarHtml(s, 'avatar sm') : '<span class="avatar sm avatar-fallback">?</span>') +
        '<div class="task-main">' +
          (t.personId
            ? '<button type="button" class="linkish task-who" data-act="open-student" data-id="' + esc(t.personId) + '">' + esc(name) + '</button>'
            : '<strong>' + esc(name) + '</strong>') +
          '<div class="muted">' + esc(last ? last.body : 'Thread kosong') + '</div>' +
        '</div>' +
        '<div class="task-meta">' +
          ((t.unread) ? '<span class="chip warn">' + esc(String(t.unread)) + ' baru</span>' : '') +
          attach +
        '</div></div>';
    }).join('');
    return '<section class="task-group wa-inbox" id="wa-inbox">' +
      '<h3>Pesan · ' + rows.length + '</h3>' +
      '<p class="muted">Balasan masuk yang belum dibaca, plus nomor yang belum ketemu di roster.</p>' +
      '<div class="task-list">' + items + '</div></section>';
  }
  function paintWaChrome() {
    const thread = document.getElementById('wa-thread');
    if (thread && ui.personId) {
      const html = waBubblesHtml(ui.personId);
      const stick = (thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 48;
      if (thread.innerHTML !== html) {
        thread.innerHTML = html;
        if (stick) thread.scrollTop = thread.scrollHeight;
      }
    }
    const inbox = document.getElementById('wa-inbox');
    if (inbox) {
      const wrap = document.createElement('div');
      wrap.innerHTML = waInboxHtml() || '<div id="wa-inbox" hidden></div>';
      const next = wrap.firstElementChild;
      if (next) inbox.replaceWith(next);
    }
    const total = waUnreadTotal();
    document.querySelectorAll('[data-wa-badge]').forEach((el) => {
      const n = waUnreadFor(el.getAttribute('data-wa-badge'));
      if (el.classList.contains('wa-badge-slot')) {
        el.hidden = !n;
        el.textContent = n ? String(n) : '';
        el.className = n ? 'chip warn wa-badge' : 'wa-badge-slot';
      } else {
        el.textContent = n ? String(n) : '';
        el.hidden = !n;
      }
    });
    const tab = document.querySelector('#tabs [data-act="tab"][data-id="tugas"]');
    if (tab) tab.textContent = total ? ('Tugas · ' + total) : 'Tugas';
  }
  function scrollWaThread() {
    const el = document.getElementById('wa-thread');
    if (el) el.scrollTop = el.scrollHeight;
  }
  async function sendWaFromCrm(personId, body) {
    const text = String(body || '').trim();
    const s = people().find((x) => x.id === personId);
    if (!s || !s.wa) {
      toast('Isi nomor WhatsApp dulu.');
      return false;
    }
    if (!text) return false;
    ensureWaStore();
    let thread = waThreadOf(personId, s.wa);
    if (!thread) {
      thread = upsertLocalThread({
        id: 'th-' + personId,
        personId: personId,
        phone: normalizeWa(s.wa),
        updatedAt: isoNow(),
        unread: 0
      });
    }
    const localMsg = {
      id: 'wm-' + Date.now().toString(36),
      threadId: thread.id,
      direction: 'out',
      body: text,
      at: isoNow(),
      status: 'local',
      providerId: null
    };
    upsertLocalMessage(localMsg);
    thread.updatedAt = localMsg.at;
    ui.waDraft = '';
    ui.waSending = true;
    save();
    paintWaChrome();
    scrollWaThread();

    let liveOk = false;
    if (waApiEnabled()) {
      await refreshWaStatus();
      if (ui.waLive && ui.waLive.deviceReady) {
        try {
          const res = await fetch(waApiUrl('send'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ personId: personId, phone: s.wa, body: text })
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.message) {
            localMsg.status = 'sent';
            localMsg.providerId = data.message.providerId || localMsg.providerId;
            if (data.message.id) localMsg.id = data.message.id;
            if (data.thread) upsertLocalThread(Object.assign({}, data.thread, { personId: personId }));
            liveOk = true;
          } else if (data.error === 'device_not_ready') {
            toast('Perangkat Fonnte belum siap. Pesan tercatat di CRM.');
          } else {
            toast('Fonnte gagal. Pesan tercatat di CRM. Coba Buka WA.');
          }
        } catch (err) {
          toast('Tidak tersambung. Pesan tercatat di CRM.');
        }
      } else {
        toast('Perangkat Fonnte belum siap. Pesan tercatat di CRM.');
      }
    } else {
      toast('Demo lokal: pesan masuk thread CRM, tidak terkirim ke HP.');
    }
    pushTimeline(personId, 'wa', (liveOk ? 'WA terkirim: ' : 'WA tercatat: ') + text.slice(0, 80));
    ui.waSending = false;
    save();
    paintWaChrome();
    return liveOk;
  }
  let waPoll = null;
  function ensureWaPoll() {
    if (waPoll) return;
    waPoll = setInterval(() => {
      if (!isStaff() || document.visibilityState === 'hidden') return;
      pullWaInbox({ noPaint: false });
      if (ui.mentorTab === 'orang' && ui.composeMode === 'wa' && ui.personId) {
        pullWaThread(ui.personId, { silentTimeline: false });
      }
    }, 4000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isStaff()) {
        pullWaInbox();
        if (ui.mentorTab === 'orang' && ui.composeMode === 'wa' && ui.personId) pullWaThread(ui.personId);
      }
    });
  }

  function pushTimeline(id, kind, body, extra) {
    db.timeline[id] = db.timeline[id] || [];
    const row = { at: isoNow(), kind: kind, body: body };
    if (extra && typeof extra === 'object') Object.assign(row, extra);
    db.timeline[id].unshift(row);
  }
  function staffMembers() {
    return (SEED.staff || []).slice();
  }
  function defaultAssigneeId() {
    return (SEED.school && SEED.school.ownerId) || (staffMembers()[0] && staffMembers()[0].id) || 'u-anton';
  }
  function assigneeIdOf(t) {
    const id = t && t.assignee;
    if (id && staffMembers().some((s) => s.id === id)) return id;
    return defaultAssigneeId();
  }
  function assigneeOptionsHtml(cur) {
    const selected = cur || defaultAssigneeId();
    return staffMembers().map((s) =>
      '<option value="' + esc(s.id) + '"' + (s.id === selected ? ' selected' : '') + '>' +
      esc(s.name) + (s.role === 'owner' ? ' · mentor' : (s.role === 'asisten' ? ' · asisten' : '')) +
      '</option>').join('');
  }
  function addTask(personId, title, body, dueAt, kind, assignee) {
    const row = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      personId: personId,
      assignee: assigneeIdOf({ assignee: assignee || defaultAssigneeId() }),
      title: title,
      body: body || '',
      dueAt: dueAt || isoNow(),
      done: false,
      kind: kind || 'wa'
    };
    db.tasks.unshift(row);
    return row;
  }
  function taskKindLabel(k) {
    return { wa: 'WhatsApp', email: 'Email', call: 'Telepon', reminder: 'Pengingat', task: 'Pengingat' }[k] || 'Pengingat';
  }
  function taskKindOptions(cur) {
    return ['wa', 'email', 'call', 'reminder'].map((k) =>
      '<option value="' + k + '"' + ((cur || 'wa') === k ? ' selected' : '') + '>' + esc(taskKindLabel(k)) + '</option>').join('');
  }
  function splitLocal(iso) {
    const d = iso ? new Date(iso) : nowDate();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: 'numeric', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    const mo = String(g('month')).padStart(2, '0');
    const da = String(g('day')).padStart(2, '0');
    const hh = String(g('hour') || '09').padStart(2, '0');
    const mi = String(g('minute') || '00').padStart(2, '0');
    return { date: g('year') + '-' + mo + '-' + da, time: hh + ':' + mi };
  }
  function joinLocal(date, time) {
    const t = String(time || '09:00');
    return new Date(String(date || splitLocal().date) + 'T' + (t.length >= 5 ? t.slice(0, 5) : '09:00') + ':00+07:00').toISOString();
  }
  function fmtClock(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
  }
  function ymdOf(iso) { return splitLocal(iso).date; }
  function taskComposerHtml(personId) {
    const due = splitLocal();
    const pid = personId || '';
    return '<form class="compose task-create" data-act="add-task">' +
      (pid
        ? '<input type="hidden" name="personId" value="' + esc(pid) + '">'
        : '<label class="muted">Orang</label><select name="personId">' +
          people().map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select>') +
      '<label class="muted">Nama tugas</label>' +
      '<input name="title" required placeholder="Follow up, cek transfer…">' +
      '<div class="row2">' +
        '<div><label class="muted">Jenis</label><select name="kind">' + taskKindOptions('wa') + '</select></div>' +
        '<div><label class="muted">Ditugaskan ke</label><select name="assignee">' + assigneeOptionsHtml(defaultAssigneeId()) + '</select></div></div>' +
      '<div class="row2">' +
        '<div><label class="muted">Tanggal</label><input name="date" type="date" required value="' + esc(due.date) + '"></div>' +
        '<div><label class="muted">Jam</label><input name="time" type="time" required value="' + esc(due.time) + '"></div>' +
      '</div>' +
      '<textarea name="body" rows="2" placeholder="Teks WA / email / catatan"></textarea>' +
      '<button class="btn" type="submit">Buat tugas</button></form>';
  }
  function queueWa(toId, title, body, scheduledAt) {
    const exists = (db.waQueue || []).some((w) => w.toId === toId && w.title === title && w.status !== 'cancelled');
    if (exists) return;
    db.waQueue.unshift({
      id: 'wa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      toId: toId,
      title: title,
      body: fillTpl(body, toId),
      scheduledAt: scheduledAt || isoNow(),
      status: 'queued'
    });
  }
  function queueEmail(toId, title, subject, body, scheduledAt) {
    db.emailQueue = db.emailQueue || [];
    const exists = db.emailQueue.some((w) => w.toId === toId && w.title === title && w.status !== 'cancelled');
    if (exists) return;
    db.emailQueue.unshift({
      id: 'em-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      toId: toId,
      title: title,
      subject: fillTpl(subject || title, toId),
      body: fillTpl(body, toId),
      scheduledAt: scheduledAt || isoNow(),
      status: 'queued'
    });
  }
  function mailLink(email, subject, body) {
    return 'mailto:' + encodeURIComponent(email || '') +
      '?subject=' + encodeURIComponent(subject || '') +
      '&body=' + encodeURIComponent(body || '');
  }
  function fillTpl(text, id) {
    const s = people().find((x) => x.id === id) || { name: id };
    const b = billingOf(id);
    const bank = db.bank || {};
    const term = termLabel(b.term);
    return String(text || '')
      .replace(/\{name\}/g, s.name)
      .replace(/\{until\}/g, b.accessUntil ? fmtWhen(b.accessUntil) : '—')
      .replace(/\{amount\}/g, fmtRp(b.amount))
      .replace(/\{term\}/g, term)
      .replace(/\{bank\}/g, bank.bank || '—')
      .replace(/\{rekening\}/g, bank.number || '—')
      .replace(/\{anama\}/g, bank.name || 'Anton');
  }
  function termLabel(term) {
    return {
      month: '1 bulan',
      quarter: '3 bulan',
      half: '6 bulan',
      autopay: 'autopay',
      year: 'tahun'
    }[term] || '—';
  }
  const HEARD_OPTS = ['Grup WA Anton', 'Teman / murid Anton', 'TikTok', 'Instagram', 'Lainnya'];
  function splitPersonName(full) {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
  function displayNameOf(s) {
    if (!s) return '';
    const fn = String(s.firstName || '').trim();
    const ln = String(s.lastName || '').trim();
    if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
    return String(s.name || '').trim();
  }
  function personNameParts(s) {
    const fn = String((s && s.firstName) || '').trim();
    const ln = String((s && s.lastName) || '').trim();
    if (fn || ln) return { firstName: fn, lastName: ln };
    return splitPersonName(s && s.name);
  }
  function joinPersonName(firstName, lastName) {
    return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ');
  }
  function isOnboardScreen() {
    // Hanya langkah isi form yang full-screen. Setelah form, dock Belajar/Diskusi harus kelihatan
    // (halaman bayar tetap bisa dibuka lewat tab daftar / CTA).
    return !isStaff() && needsWizard(ui.personaId);
  }
  function resetWizForPersona() {
    ui.wizDraft = null;
    ui.wizTools = false;
    ui.wizFocusedStep = null;
    ui.wizStep = db.applications[ui.personaId] ? wizPayIdx() : 0;
  }
  function wizIdx() {
    if (isOnboardPreview()) return Math.max(0, Number(ui.onboardPreview.step) || 0);
    if (typeof ui.wizStep === 'number') return ui.wizStep;
    return db.applications[ui.personaId] ? wizPayIdx() : 0;
  }
  function wizDraft() {
    if (isOnboardPreview()) {
      return Object.assign({
        sid: 'preview',
        firstName: '', lastName: '', name: '', wa: '',
        shopPick: '', shopName: '', shopUrl: '', city: '',
        answers: {}, picks: {}, others: {}
      }, ui.onboardPreview.draft || {});
    }
    const sid = ui.personaId;
    const s = student();
    const app = db.applications[sid] || {};
    const prev = (ui.wizDraft && ui.wizDraft.sid === sid) ? ui.wizDraft : {};
    const nameSeed = (s.name || '').indexOf('Tamu') >= 0 ? '' : (s.name || '');
    const parts = personNameParts({
      firstName: app.firstName || s.firstName,
      lastName: app.lastName || s.lastName,
      name: app.name || nameSeed
    });
    let shopPick = prev.shopPick;
    if (shopPick == null) {
      if (app.hasShop === true) shopPick = 'ya';
      else if (app.at) shopPick = 'tidak';
      else shopPick = '';
    }
    const personFields = ((db.people && db.people[sid]) || {}).fields || {};
    const answers = Object.assign({}, personFields, app.answers || {}, prev.answers || {});
    const picks = Object.assign({}, prev.picks || {});
    const others = Object.assign({}, prev.others || {});
    wizFormPages().forEach((page) => {
      (page.fields || []).forEach((f) => {
        const id = obStoreId(f);
        if (!id) return;
        const stored = personFields[id] != null ? personFields[id]
          : (app.answers && app.answers[id] != null ? app.answers[id]
            : (f.id === 'f-heard' ? app.heard : null));
        if (stored == null || stored === '') return;
        if (f.type === 'single' && picks[id] == null) {
          const val = String(stored);
          if ((f.options || []).indexOf(val) >= 0) picks[id] = val;
          else if (f.allowOther) {
            picks[id] = 'Lainnya';
            others[id] = val;
          } else picks[id] = val;
        } else if (f.type === 'multi' && picks[id] == null) {
          picks[id] = parsePersonFieldValue(stored, 'multi');
        } else if (answers[id] == null) {
          answers[id] = String(stored);
        }
      });
    });
    if (app.heard && picks['f-heard'] == null && answers['f-heard'] == null) {
      const heardOpts = (HEARD_OPTS || []);
      if (heardOpts.indexOf(app.heard) >= 0) picks['f-heard'] = app.heard;
      else {
        picks['f-heard'] = 'Lainnya';
        others['f-heard'] = app.heard;
      }
    }
    return {
      sid: sid,
      firstName: prev.firstName != null ? prev.firstName : parts.firstName,
      lastName: prev.lastName != null ? prev.lastName : parts.lastName,
      name: prev.name != null ? prev.name : joinPersonName(
        prev.firstName != null ? prev.firstName : parts.firstName,
        prev.lastName != null ? prev.lastName : parts.lastName
      ) || app.name || nameSeed,
      wa: prev.wa != null ? prev.wa : (app.wa || s.wa || ''),
      shopPick: shopPick,
      shopName: prev.shopName != null ? prev.shopName : (app.shopName || s.shopName || ''),
      shopUrl: prev.shopUrl != null ? prev.shopUrl : (app.shopUrl || s.shopUrl || ''),
      city: prev.city != null ? prev.city : (app.city || (s.city === '—' ? '' : (s.city || ''))),
      answers: answers,
      picks: picks,
      others: others
    };
  }
  function wizMerge(patch) {
    if (isOnboardPreview()) {
      const cur = wizDraft();
      const next = Object.assign({}, cur, patch);
      if (patch.answers) next.answers = Object.assign({}, cur.answers || {}, patch.answers);
      if (patch.picks) next.picks = Object.assign({}, cur.picks || {}, patch.picks);
      if (patch.others) next.others = Object.assign({}, cur.others || {}, patch.others);
      ui.onboardPreview.draft = next;
      return;
    }
    const cur = wizDraft();
    const next = Object.assign({}, cur, patch, { sid: ui.personaId });
    if (patch.answers) next.answers = Object.assign({}, cur.answers || {}, patch.answers);
    if (patch.picks) next.picks = Object.assign({}, cur.picks || {}, patch.picks);
    if (patch.others) next.others = Object.assign({}, cur.others || {}, patch.others);
    ui.wizDraft = next;
  }
  function captureWizFields() {
    const root = document.querySelector('.ob-flow') || document.querySelector('.ob-preview-flow .ob-flow');
    if (!root) return;
    const d = { answers: {}, others: {} };
    const firstName = root.querySelector('[name=firstName]');
    const lastName = root.querySelector('[name=lastName]');
    const name = root.querySelector('[name=name]');
    const wa = root.querySelector('[name=wa]');
    const city = root.querySelector('[name=city]');
    const shopName = root.querySelector('[name=shopName]');
    const shopUrl = root.querySelector('[name=shopUrl]');
    if (firstName) d.firstName = String(firstName.value || '').trim();
    if (lastName) d.lastName = String(lastName.value || '').trim();
    if (firstName || lastName) {
      d.name = joinPersonName(
        d.firstName != null ? d.firstName : wizDraft().firstName,
        d.lastName != null ? d.lastName : wizDraft().lastName
      );
    } else if (name) {
      d.name = String(name.value || '').trim();
      const parts = splitPersonName(d.name);
      d.firstName = parts.firstName;
      d.lastName = parts.lastName;
    }
    if (wa) d.wa = String(wa.value || '').trim();
    if (city) d.city = String(city.value || '').trim();
    if (shopName) d.shopName = String(shopName.value || '').trim();
    if (shopUrl) d.shopUrl = String(shopUrl.value || '').trim();
    root.querySelectorAll('[data-ob-ans]').forEach((el) => {
      const key = el.getAttribute('data-ob-ans');
      if (!key) return;
      d.answers[key] = String(el.value || '').trim();
    });
    root.querySelectorAll('[data-ob-other]').forEach((el) => {
      const key = el.getAttribute('data-ob-other');
      if (!key) return;
      d.others[key] = String(el.value || '').trim();
    });
    wizMerge(d);
  }
  function answerForField(d, field) {
    const key = obStoreId(field);
    if (field.type === 'single') {
      const pick = (d.picks && d.picks[key]) || '';
      if (field.allowOther && pick === 'Lainnya') return String((d.others && d.others[key]) || '').trim();
      return String(pick || '').trim();
    }
    if (field.type === 'multi') {
      const arr = (d.picks && d.picks[key]) || [];
      return Array.isArray(arr) ? arr.slice() : [];
    }
    return String((d.answers && d.answers[key]) || '').trim();
  }
  function validateWizStep() {
    const pages = wizFormPages();
    const page = pages[wizIdx()];
    if (!page) return true;
    const d = wizDraft();
    for (let i = 0; i < page.fields.length; i += 1) {
      const f = page.fields[i];
      if (!f.required) continue;
      if (f.type === 'name' && !String(d.firstName || '').trim()) {
        toast('Isi nama depan dulu.');
        return false;
      }
      if (f.type === 'wa' && !d.wa) {
        toast('Isi nomor WhatsApp dulu.');
        return false;
      }
      if (f.type === 'city' && !d.city) {
        toast('Isi kota dulu.');
        return false;
      }
      if (f.type === 'shop') {
        if (d.shopPick !== 'ya' && d.shopPick !== 'tidak') {
          toast('Pilih sudah atau belum.');
          return false;
        }
        if (d.shopPick === 'ya' && (!d.shopName || !d.shopUrl)) {
          toast('Nama toko dan tautan wajib kalau sudah punya toko.');
          return false;
        }
      }
      if (f.type === 'text' || f.type === 'textarea' || f.type === 'link') {
        if (!answerForField(d, f)) {
          toast('Isi ' + (f.label || 'kolom ini') + ' dulu.');
          return false;
        }
      }
      if (f.type === 'single') {
        const key = obStoreId(f);
        const pick = (d.picks && d.picks[key]) || '';
        if (!pick) {
          toast('Pilih satu opsi dulu.');
          return false;
        }
        if (f.allowOther && pick === 'Lainnya' && !String((d.others && d.others[key]) || '').trim()) {
          toast('Isi jawaban Lainnya.');
          return false;
        }
      }
      if (f.type === 'multi') {
        const arr = answerForField(d, f);
        if (!arr.length) {
          toast('Pilih minimal satu opsi.');
          return false;
        }
      }
    }
    return true;
  }
  function collectCustomAnswers(d) {
    const out = Object.assign({}, d.answers || {});
    wizFormPages().forEach((page) => {
      (page.fields || []).forEach((f) => {
        if (!isObAccountField(f)) return;
        const key = obStoreId(f);
        out[key] = answerForField(d, f);
      });
    });
    return out;
  }
  function commitWizApplication() {
    if (isOnboardPreview()) return false;
    const d = wizDraft();
    const sid = ui.personaId;
    const s = student();
    const pages = wizFormPages();
    const hasName = pages.some((p) => (p.fields || []).some((f) => f.type === 'name'));
    const hasWa = pages.some((p) => (p.fields || []).some((f) => f.type === 'wa'));
    const hasCity = pages.some((p) => (p.fields || []).some((f) => f.type === 'city'));
    const hasShop = pages.some((p) => (p.fields || []).some((f) => f.type === 'shop'));
    const firstName = String(d.firstName || '').trim();
    const lastName = String(d.lastName || '').trim();
    const fullName = joinPersonName(firstName, lastName) || String(d.name || '').trim();
    if (hasName && !firstName) {
      toast('Isi nama depan dulu.');
      return false;
    }
    if (hasWa && !d.wa) {
      toast('Isi nomor WhatsApp dulu.');
      return false;
    }
    if (hasCity && !d.city) {
      toast('Isi kota dulu.');
      return false;
    }
    let shopYes = d.shopPick === 'ya';
    if (hasShop) {
      if (d.shopPick !== 'ya' && d.shopPick !== 'tidak') {
        toast('Pilih sudah atau belum punya toko.');
        return false;
      }
      if (shopYes && (!d.shopName || !d.shopUrl)) {
        toast('Nama toko dan tautan wajib kalau sudah punya toko.');
        return false;
      }
    } else {
      shopYes = !!(d.shopName || d.shopUrl);
    }
    syncOnboardingAccountFields();
    const answers = collectCustomAnswers(d);
    let heard = '';
    pages.forEach((page) => {
      (page.fields || []).forEach((f) => {
        if (f.id === 'f-heard' || (f.type === 'single' && /kenal anton/i.test(obFieldLabel(f, page)))) {
          heard = String(answerForField(d, f) || heard);
        }
      });
    });
    if (!heard && answers['f-heard']) heard = String(answers['f-heard']);
    db.applications[sid] = {
      name: fullName || (s.name || ''),
      firstName: firstName,
      lastName: lastName,
      wa: d.wa || s.wa || '',
      city: d.city || '',
      hasShop: shopYes,
      shopName: shopYes ? (d.shopName || '') : '',
      shopUrl: shopYes ? (d.shopUrl || '') : '',
      heard: heard,
      answers: answers,
      at: isoNow()
    };
    const waDigits = normalizeWa(d.wa) || normalizeWa(s.wa);
    db.liveStudents = db.liveStudents || [];
    if (String(sid).indexOf('live-') === 0 && !db.liveStudents.some((x) => x.id === sid)) {
      db.liveStudents.push({
        id: sid,
        name: fullName || 'Siswa',
        firstName: firstName,
        lastName: lastName,
        wa: waDigits,
        email: '',
        city: d.city || ''
      });
    }
    patchPerson(sid, {
      name: fullName || s.name,
      firstName: firstName,
      lastName: lastName,
      wa: waDigits,
      city: d.city || '',
      shopName: shopYes ? (d.shopName || '') : '',
      shopUrl: shopYes ? (d.shopUrl || '') : ''
    });
    pages.forEach((page) => {
      (page.fields || []).forEach((f) => {
        if (!isObAccountField(f)) return;
        ensureAccountFieldDef(f, page);
        const val = answerForField(d, f);
        setPersonCustomVal(sid, obStoreId(f), val);
      });
    });
    const b = billingOf(sid);
    if (!b.offerStartedAt) {
      b.offerStartedAt = isoNow();
      b.offerExpiresAt = addMs(isoNow(), 24 * 36e5);
    }
    applyTransition(sid, 'form', 'form', 'Form masuk. Jam diskon 24 jam dimulai.');
    startTrial(sid);
    save();
    trackEvent('join', { name: fullName, wa: String(d.wa || ''), stage: 'form', progress: kurProgress(sid).pct });
    return true;
  }
  function ensureApplication() {
    if (db.applications[ui.personaId]) return true;
    captureWizFields();
    return commitWizApplication();
  }
  function advanceWiz() {
    captureWizFields();
    if (!validateWizStep()) return;
    const pages = wizFormPages();
    const last = wizIdx() >= pages.length - 1;
    if (isOnboardPreview()) {
      if (last) {
        toast('Preview selesai — tidak ada data tersimpan.');
        ui.onboardPreview = { open: true, step: pages.length, draft: ui.onboardPreview.draft || {}, done: true };
      } else {
        ui.onboardPreview.step = wizIdx() + 1;
        ui.onboardPreview.done = false;
      }
      paintOnboardPreview();
      return;
    }
    if (last) {
      if (!commitWizApplication()) return;
      ui.wizStep = wizPayIdx();
      ui.wizFocusedStep = null;
      ui.tab = 'daftar';
      toast('Form masuk. Diskon 24 jam jalan — boleh langsung ke Belajar.');
    } else {
      ui.wizStep = wizIdx() + 1;
      ui.wizFocusedStep = null;
    }
    render();
  }
  function backWiz() {
    captureWizFields();
    const i = wizIdx();
    if (i <= 0) return;
    if (isOnboardPreview()) {
      ui.onboardPreview.step = i - 1;
      ui.onboardPreview.done = false;
      paintOnboardPreview();
      return;
    }
    ui.wizStep = i - 1;
    ui.wizFocusedStep = null;
    render();
  }
  function enrollmentsOf(id) {
    db.enrollments = db.enrollments || {};
    const raw = db.enrollments[id] || [];
    return raw.map((x) => (typeof x === 'string' ? { planId: x } : x));
  }
  function isEnrolled(id, planId) {
    return enrollmentsOf(id).some((x) => x.planId === planId);
  }
  function enrollPerson(id, planId, fire) {
    const list = enrollmentsOf(id);
    if (list.some((x) => x.planId === planId)) {
      if (fire) {
        db.enrollments[id] = list.map((x) => x.planId === planId ? Object.assign({}, x, { at: x.at || isoNow() }) : x);
      }
      return;
    }
    db.enrollments[id] = list.concat([{ planId: planId, at: fire ? isoNow() : null }]);
  }
  function unenrollPerson(id, planId) {
    db.enrollments[id] = enrollmentsOf(id).filter((x) => x.planId !== planId);
  }
  function triggerLabel(id) {
    return {
      bayar: 'Bayar lunas',
      form: 'Isi form',
      trial: 'Trial 12 jam',
      perpanjangan: 'Perpanjangan',
      manual: 'Manual',
      nurture: 'Nurture',
      tidak_tertarik: 'Tidak tertarik'
    }[id] || id;
  }
  function skipGenericPlan(id) {
    return id === 'trial' || id === 'renewal' || id === 'nurture' || id === 'extended';
  }
  function triggerStartMs(s, plan, en) {
    const b = billingOf(s.id);
    const app = db.applications[s.id];
    const t = plan.trigger;
    if (t === 'bayar') return b.paidAt ? new Date(b.paidAt).getTime() : null;
    if (t === 'form') return app && app.at ? new Date(app.at).getTime() : null;
    if (t === 'trial') return b.offerStartedAt ? new Date(b.offerStartedAt).getTime() : null;
    if (t === 'perpanjangan') {
      if (!b.accessUntil) return null;
      return new Date(b.accessUntil).getTime() - warningMs();
    }
    if (t === 'manual') return en && en.at ? new Date(en.at).getTime() : null;
    if (t === 'nurture' && (crmOf(s.id).stage === 'nurture' || crmOf(s.id).stage === 'sudah_keluar')) return en && en.at ? new Date(en.at).getTime() : nowMs();
    if (t === 'tidak_tertarik' && crmOf(s.id).stage === 'tidak_tertarik') return en && en.at ? new Date(en.at).getTime() : nowMs();
    return en && en.at ? new Date(en.at).getTime() : null;
  }
  function runPlanStep(s, st) {
    if (st.kind === 'email') queueEmail(s.id, st.title, st.subject || st.title, st.body, isoNow());
    else if (st.kind === 'wa') queueWa(s.id, st.title, st.body, isoNow());
    else if (st.kind === 'task') addTask(s.id, fillTpl(st.title || 'Tugas', s.id), fillTpl(st.body || '', s.id), isoNow(), 'task');
    else if (st.kind === 'stage' && st.to) setStage(s.id, st.to, 'Otomasi: ' + (st.title || stageLabel(st.to)));
  }
  function runEnrolledPlans() {
    people().forEach((s) => {
      enrollmentsOf(s.id).forEach((en) => {
        const plan = planById(en.planId);
        if (!plan || plan.archived || skipGenericPlan(plan.id)) return;
        if (!en.at) return;
        const start = triggerStartMs(s, plan, en);
        if (!start) return;
        let acc = start;
        const c = crmOf(s.id);
        c.fired = c.fired || {};
        (plan.steps || []).forEach((st) => {
          acc += (Number(st.waitHours) || 0) * 36e5;
          const key = plan.id + ':' + st.id;
          if (c.fired[key]) return;
          if (nowMs() >= acc) {
            runPlanStep(s, st);
            c.fired[key] = isoNow();
            pushTimeline(s.id, st.kind || 'auto', 'Otomasi ' + plan.name + ': ' + (st.title || st.kind));
          }
        });
      });
    });
  }
  function planById(id) {
    return (db.actionPlans || []).find((p) => p.id === id);
  }
  function setStage(id, stage, note) {
    const c = crmOf(id);
    if (c.stage === stage) return;
    c.stage = stage;
    if (stage === 'sudah_keluar' || stage === 'tidak_tertarik') {
      c.endedAt = c.endedAt || isoNow();
      if (stage === 'tidak_tertarik' && !c.notInterestedAt) c.notInterestedAt = c.endedAt;
    }
    pushTimeline(id, 'stage', note || ('Pindah ke ' + stageLabel(stage)), { to: stage });
  }
  function paymentsList() {
    if (!Array.isArray(db.payments)) db.payments = [];
    return db.payments;
  }
  function recordPayment(row) {
    const amount = Math.max(0, Number(row.amount) || 0);
    const entry = {
      id: row.id || ('pay-' + String(nowMs()) + '-' + Math.floor(Math.random() * 1e4)),
      personId: row.personId,
      at: row.at || isoNow(),
      kind: row.kind || 'mentoring',
      amount: amount,
      source: row.source || 'manual',
      term: row.term || '',
      products: Array.isArray(row.products) ? row.products.slice() : undefined
    };
    paymentsList().unshift(entry);
    return entry;
  }
  function isRenewalPay(id) {
    const c = crmOf(id);
    const b = billingOf(id);
    if (b.paidAt && (b.plan === 'mentoring' || b.status === 'lunas' || b.status === 'cicilan' || b.status === 'gratis')) return true;
    return c.stage === 'mentee' || c.stage === 'akan_keluar' || c.stage === 'sudah_keluar' || c.stage === 'perpanjangan' || c.stage === 'grace';
  }
  function stageLabel(id) {
    const s = pipelineStages().find((x) => x.id === id);
    return (s && s.label) || id;
  }
  function monthlyPrice() { return Number(db.pricing.monthlyIdr) || 500000; }
  function toolDiscountPct() { return Number(db.pricing.toolDiscountPct) || 50; }
  function toolMemberPrice(p) {
    const list = Number(p && p.price) || 0;
    return Math.round(list * (1 - toolDiscountPct() / 100));
  }
  function termMonths(term) {
    return { month: 1, autopay: 1, quarter: 3, half: 6, year: 12 }[term] || 1;
  }
  function termDiscountPct(term) {
    const p = db.pricing || {};
    if (term === 'quarter') return Number(p.quarterDiscountPct) || 15;
    if (term === 'half') return Number(p.halfDiscountPct) || 25;
    if (term === 'year') return Number(p.annualDiscountPct) || 15;
    if (term === 'autopay') return Number(p.autopayDiscountPct) || 10;
    return 0;
  }
  function listPriceForTerm(term) { return monthlyPrice() * termMonths(term); }
  function priceForTerm(term, welcome) {
    const disc = termDiscountPct(term);
    let n = Math.round(listPriceForTerm(term) * (1 - disc / 100));
    if (welcome && (term === 'month' || term === 'autopay')) {
      n = Math.round(n * (1 - (Number(db.pricing.welcomeDiscountPct) || 0) / 100));
    }
    return n;
  }
  function welcomeOpen(id) {
    const b = billingOf(id);
    return !!(b.offerExpiresAt && hoursLeft(b.offerExpiresAt) > 0);
  }
  function grantMentoring(id, term, source, amount) {
    const b = billingOf(id);
    const renew = isRenewalPay(id);
    const start = nowDate();
    const until = new Date(start.getTime());
    until.setMonth(until.getMonth() + termMonths(term));
    b.status = 'lunas';
    b.plan = 'mentoring';
    b.products = Array.isArray(b.products) ? b.products : [];
    b.term = term;
    b.source = source;
    b.amount = amount;
    b.paidAt = isoNow();
    b.accessUntil = until.toISOString();
    b.note = source === 'mayar'
      ? ('Mayar · ' + termLabel(term))
      : (term === 'autopay' ? 'Kartu autopay (mock)' : ('Transfer · ' + termLabel(term)));
    delete b.pendingTerm;
    delete b.pendingAmount;
    delete b.pendingAt;
    delete b.offerExpiresAt;
    const c = crmOf(id);
    delete c.endedAt;
    applyTransition(id, 'bayar', 'mentee', (renew ? 'Perpanjang mentoring · ' : 'Lunas mentoring · ') + term);
    pushTimeline(id, 'pay', (renew ? 'Perpanjang ' : 'Bayar ') + fmtRp(amount) + ' · ' + (source || 'transfer'));
    recordPayment({
      personId: id,
      kind: renew ? 'renewal' : 'mentoring',
      amount: amount,
      source: source || 'transfer',
      term: term
    });
    enrollPerson(id, renew ? 'renewal' : 'onboarding', true);
  }
  function markPendingTransfer(id, term, amount) {
    const b = billingOf(id);
    b.status = 'pending';
    b.pendingTerm = term;
    b.pendingAmount = amount;
    b.pendingAt = isoNow();
    b.amount = amount;
    b.term = term;
    b.source = 'transfer';
    b.note = 'Menunggu konfirmasi Anton · ' + termLabel(term);
    if (!b.plan || b.plan === '') b.plan = 'preview';
    pushTimeline(id, 'pay', 'Klaim transfer ' + fmtRp(amount) + ' · menunggu konfirmasi');
    addTask(id, 'Cek transfer ' + nameOf(id), 'Jumlah ' + fmtRp(amount) + ' ke ' + db.bank.bank + ' ' + db.bank.number, isoNow(), 'reminder');
  }
  function lynkProduct(term) {
    const all = db.lynkProducts || {};
    const row = all[term] || {};
    return {
      url: String(row.url || '').trim(),
      title: String(row.title || '').trim(),
      price: Number(row.price) || 0
    };
  }
  function lynkCheckoutUrl(term) {
    const url = lynkProduct(term).url;
    return /^https:\/\//i.test(url) ? url : '';
  }
  function lynkWebhookUrl() {
    return 'https://larisid.com/obrolan.marketing/api/webhooks/lynk';
  }
  function openLynk(url) {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function markPendingLynk(id, term, amount, url) {
    const b = billingOf(id);
    const who = people().find((s) => s.id === id) || {};
    b.status = 'pending';
    b.pendingTerm = term;
    b.pendingAmount = amount;
    b.pendingAt = isoNow();
    b.amount = amount;
    b.term = term;
    b.source = 'lynk';
    b.lynkUrl = url;
    b.payerWa = who.wa || b.payerWa || '';
    b.note = 'Menunggu Lynk · ' + termLabel(term);
    if (!b.plan) b.plan = 'preview';
    pushTimeline(id, 'pay', 'Bayar Lynk ' + fmtRp(amount) + ' · menunggu konfirmasi');
  }
  function markPendingMayar(id, term, amount, inv) {
    const b = billingOf(id);
    b.status = 'pending';
    b.source = 'mayar';
    b.pendingTerm = term;
    b.pendingAmount = amount;
    b.pendingAt = isoNow();
    b.amount = amount;
    b.term = term;
    b.mayarLink = (inv && inv.link) || '';
    b.mayarTx = (inv && (inv.transactionId || inv.invoiceId)) || '';
    b.note = 'Menunggu pembayaran Mayar · ' + termLabel(term);
    if (!b.plan) b.plan = 'preview';
    pushTimeline(id, 'pay', 'Invoice Mayar ' + fmtRp(amount) + ' · menunggu');
  }
  function mayarReady() {
    return !!(ui.mayar && ui.mayar.configured);
  }
  async function refreshMayarStatus() {
    ui.mayar = { configured: false, mode: 'unset' };
    return ui.mayar;
  }
  async function requestMayarInvoice(opts) {
    const k = syncInvite();
    const res = await fetch(apiBase() + '/pay/invoice?k=' + encodeURIComponent(k) +
      '&slug=' + encodeURIComponent(schoolSlug()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ slug: schoolSlug() }, opts || {})),
      cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data };
  }
  function closeTransferTasks(id, taskId) {
    db.tasks.forEach((t) => {
      if (t.done) return;
      if (taskId && t.id === taskId) t.done = true;
      else if (!taskId && t.personId === id && /cek transfer/i.test(t.title || '')) t.done = true;
    });
  }
  function confirmPaid(id, taskId) {
    const b = billingOf(id);
    const term = b.pendingTerm || b.term || 'month';
    const amount = b.pendingAmount || b.amount || priceForTerm(term, welcomeOpen(id));
    grantMentoring(id, term, 'transfer', amount);
    closeTransferTasks(id, taskId);
  }
  function confirmPaidBtn(id) {
    if (!canBill() || !isPending(id)) return '';
    const src = billingOf(id).source;
    const label = src === 'mayar' ? 'Konfirmasi manual' : 'Konfirmasi lunas';
    return '<button type="button" class="btn-sm" data-act="confirm-paid" data-id="' + esc(id) + '">' + label + '</button>';
  }
  function startTrial(id) {
    const b = billingOf(id);
    const start = b.offerStartedAt || isoNow();
    b.status = 'trial';
    b.plan = 'preview';
    b.offerStartedAt = start;
    b.offerExpiresAt = b.offerExpiresAt || addMs(start, 24 * 36e5);
    b.note = 'Bayar nanti · 24 jam';
    applyTransition(id, 'trial', 'trial', 'Bayar nanti. Diskon 24 jam dari jam form.');
    pushTimeline(id, 'offer', 'Trial: video 1 + lembar kerja. Jam diskon sampai ' + fmtWhen(b.offerExpiresAt));
  }
  function runAutomations() {
    const before = JSON.stringify({
      crm: db.crm,
      billing: db.billing,
      tasks: db.tasks,
      waQueue: db.waQueue,
      emailQueue: db.emailQueue,
      timeline: db.timeline
    });
    people().forEach((s) => {
      const b = billingOf(s.id);
      const c = crmOf(s.id);
      if ((c.stage === 'trial' || c.stage === 'nonton') && b.offerExpiresAt && b.status !== 'pending') {
        const left = hoursLeft(b.offerExpiresAt);
        if (left != null && left <= 12 && left > 0 && !c.wa12Sent) {
          const plan = planById('trial');
          const step = plan && plan.steps.find((x) => x.id === 't12');
          queueWa(s.id, (step && step.title) || '12 jam sisa diskon', (step && step.body) || '', isoNow());
          c.wa12Sent = true;
          pushTimeline(s.id, 'wa', 'Antrian WA: 12 jam sisa harga perkenalan.');
        }
        if (left != null && left <= 0 && c.stage !== 'sudah_keluar' && c.stage !== 'tidak_tertarik' && c.stage !== 'mentee') {
          applyTransition(s.id, 'trial_habis', 'sudah_keluar', '24 jam habis, belum bayar → sudah keluar.');
          c.expiredToNurture = true;
        }
      }
      if (c.watchedFirstAt && (c.stage === 'trial' || c.stage === 'nonton') && !c.antonWatchTask) {
        const plan = planById('trial');
        const step = plan && plan.steps.find((x) => x.id === 'twatch');
        addTask(s.id, (step && step.title) || 'Anton WA: sudah nonton, belum bayar', fillTpl((step && step.body) || '', s.id), isoNow());
        c.antonWatchTask = true;
        applyTransition(s.id, 'nonton', 'nonton', 'Nonton video 1, belum bayar.');
      }
      if (b.plan === 'mentoring' && b.accessUntil && b.status !== 'gratis' && c.stage !== 'tidak_tertarik' && c.stage !== 'mentor') {
        const end = new Date(b.accessUntil).getTime();
        const t = nowMs();
        const warnStart = end - warningMs();
        if (t >= warnStart && t < end && !c.warn5Sent) {
          const plan = planById('renewal');
          const step = plan && plan.steps.find((x) => x.id === 'r5');
          queueWa(s.id, (step && step.title) || '5 hari sebelum habis', fillTpl((step && step.body) || '', s.id), isoNow());
          c.warn5Sent = true;
          applyTransition(s.id, 'peringatan', 'akan_keluar', 'Peringatan 5 hari.');
        }
        if (t >= end && t < end + graceMs()) {
          if (!c.antonRenewTask) {
            const plan = planById('renewal');
            const step = plan && plan.steps.find((x) => x.id === 'ranton');
            addTask(s.id, (step && step.title) || 'Anton WA perpanjangan', fillTpl((step && step.body) || '', s.id), isoNow());
            c.antonRenewTask = true;
          }
          if (t >= end + graceMs() - 86400000 && !c.grace1Sent) {
            const plan = planById('renewal');
            const step = plan && plan.steps.find((x) => x.id === 'rgrace');
            queueWa(s.id, (step && step.title) || 'Grace 1 hari', fillTpl((step && step.body) || '', s.id), isoNow());
            c.grace1Sent = true;
          }
          applyTransition(s.id, 'peringatan', 'akan_keluar', 'Masa tenggang.');
        }
        if (t >= end + graceMs() && (c.stage === 'akan_keluar' || c.stage === 'mentee' || c.stage === 'perpanjangan' || c.stage === 'grace' || c.stage === 'aktif')) {
          b.status = 'trial';
          b.plan = 'preview';
          applyTransition(s.id, 'akses_habis', 'sudah_keluar', 'Akses habis. Kembali ke preview video 1.');
        }
      }
      if ((c.stage === 'sudah_keluar' || c.stage === 'nurture') && !c.nurtureQueued) {
        const plan = planById('nurture');
        const step = plan && plan.steps[0];
        if (step) {
          queueWa(s.id, step.title, step.body, addMs(isoNow(), (step.waitHours || 168) * 36e5));
          c.nurtureQueued = true;
        }
      }
      if (c.stage === 'tidak_tertarik' && !c.extendedQueued) {
        const plan = planById('extended');
        const step = plan && plan.steps[0];
        if (step) {
          queueWa(s.id, step.title, step.body, addMs(isoNow(), (step.waitHours || 720) * 36e5));
          c.extendedQueued = true;
        }
      }
    });
    runEnrolledPlans();
    const after = JSON.stringify({
      crm: db.crm,
      billing: db.billing,
      tasks: db.tasks,
      waQueue: db.waQueue,
      emailQueue: db.emailQueue,
      timeline: db.timeline
    });
    if (before !== after) save();
  }

  function parseEmbed(url) {
    if (!url) return null;
    const u = String(url);
    const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    if (yt) {
      return {
        kind: 'youtube',
        videoId: yt[1],
        embed: 'https://www.youtube-nocookie.com/embed/' + yt[1] +
          '?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&playsinline=1&origin=' +
          encodeURIComponent(location.origin || ''),
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
    if (lec.videoKey) return lec.videoName ? ('Kelas · ' + lec.videoName) : 'Video di kelas';
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
    if (!ui.secFold) {
      ui.secFold = new Set();
      (db.weeks || []).forEach((w, i) => { if (i > 0) ui.secFold.add(w.id); });
      ui.secKnown = new Set((db.weeks || []).map((w) => w.id));
      return;
    }
    ui.secKnown = ui.secKnown || new Set();
    (db.weeks || []).forEach((w) => {
      if (!ui.secKnown.has(w.id)) {
        ui.secFold.add(w.id);
        ui.secKnown.add(w.id);
      }
    });
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

  const MAX_VID_LOCAL = 80 * 1024 * 1024;
  const MAX_VID_CLASS = 5 * 1024 * 1024 * 1024;
  const MAX_IMG = 5 * 1024 * 1024;
  const MAX_FILE = 20 * 1024 * 1024;

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
  function moveWeekTo(id, toIndex) {
    const i = db.weeks.findIndex((w) => w.id === id);
    if (i < 0) return;
    const [row] = db.weeks.splice(i, 1);
    db.weeks.splice(Math.max(0, Math.min(toIndex, db.weeks.length)), 0, row);
  }
  function moveLecTo(id, weekId, toIndex) {
    const from = db.lectures.findIndex((x) => x.id === id);
    if (from < 0) return;
    const [row] = db.lectures.splice(from, 1);
    row.weekId = weekId;
    const same = db.lectures.map((x, i) => ({ x, i })).filter((o) => o.x.weekId === weekId);
    let insertAt;
    if (!same.length) insertAt = db.lectures.length;
    else if (toIndex >= same.length) insertAt = same[same.length - 1].i + 1;
    else insertAt = same[Math.max(0, toIndex)].i;
    db.lectures.splice(insertAt, 0, row);
  }

  function mediaFileUrl(key) {
    const q = new URLSearchParams();
    q.set('key', key);
    q.set('k', syncInvite());
    q.set('slug', schoolSlug());
    return apiBase() + '/media/file?' + q.toString();
  }
  function deleteRemoteVideo(key) {
    if (!key || !syncEnabled()) return;
    fetch(apiBase() + '/media?k=' + encodeURIComponent(syncInvite()), {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: key })
    }).catch(() => {});
  }
  function uploadClassVideo(file, lecId, onProgress, kind) {
    const partSize = 8 * 1024 * 1024;
    const mediaKind = kind === 'image' || kind === 'file' ? kind : 'video';
    return fetch(apiBase() + '/media/init?k=' + encodeURIComponent(syncInvite()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        type: file.type || (mediaKind === 'image' ? 'image/jpeg' : 'video/mp4'),
        size: file.size,
        lecId: lecId,
        slug: schoolSlug(),
        kind: mediaKind
      })
    }).then((res) => {
      if (!res.ok) throw new Error('init');
      return res.json();
    }).then(async (init) => {
      const parts = Math.max(1, Math.ceil(file.size / partSize));
      for (let i = 0; i < parts; i += 1) {
        const chunk = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
        const res = await fetch(apiBase() + '/media/part?k=' + encodeURIComponent(syncInvite()) +
          '&uploadId=' + encodeURIComponent(init.uploadId) + '&partNumber=' + (i + 1), {
          method: 'PUT',
          body: chunk
        });
        if (!res.ok) throw new Error('part');
        if (onProgress) onProgress(Math.round(((i + 1) / parts) * 100));
      }
      const done = await fetch(apiBase() + '/media/complete?k=' + encodeURIComponent(syncInvite()) +
        '&uploadId=' + encodeURIComponent(init.uploadId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      if (!done.ok) throw new Error('complete');
      return done.json();
    });
  }
  function ingestVideoFile(file, opts) {
    opts = opts || {};
    if (!file) return;
    if (file.type && file.type.indexOf('video') !== 0 && !/\.(mp4|webm|mov|m4v)$/i.test(file.name || '')) {
      toast('Pilih file video (MP4 / WebM).');
      return;
    }
    const cap = syncEnabled() ? MAX_VID_CLASS : MAX_VID_LOCAL;
    if (file.size > cap) {
      toast(syncEnabled()
        ? 'Maks 5 GB. Untuk video lebih besar, tempel tautan YouTube atau Drive.'
        : 'Maks 80 MB di browser ini. Unggah ke YouTube/Drive lalu tempel tautan.');
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
        videoBlob: false,
        videoKey: '',
        videoName: file.name,
        requiredBefore: false,
        points: [],
        questions: [],
        resources: []
      });
      ui.editLecId = id;
    }
    const lec = lectureById(id);
    if (syncEnabled()) {
      toast('Mengunggah video…');
      const oldKey = lec && lec.videoKey;
      uploadClassVideo(file, id, (pct) => {
        const span = document.querySelector('[data-act="vid-drop"][data-id="' + id + '"] span');
        if (span) span.textContent = 'Mengunggah ' + pct + '%';
      }).then((info) => {
        if (oldKey && oldKey !== info.key) deleteRemoteVideo(oldKey);
        if (lec) {
          lec.videoKey = info.key;
          lec.videoName = info.name || file.name;
          lec.videoMime = info.mime || file.type || 'video/mp4';
          lec.videoBlob = false;
          lec.url = '';
          lec.type = 'video';
        }
        save();
        toast('Video tersimpan di kelas. Siswa bisa putar.');
        render();
      }).catch(() => {
        trackEvent('upload_fail', { lessonId: id, message: file.name });
        postIssue({
          kind: 'upload',
          lessonId: id,
          lessonTitle: (lec && lec.title) || file.name,
          body: 'Gagal unggah video ' + file.name
        });
        toast('Gagal unggah video.');
      });
      return;
    }
    blobPut(id, file).then(() => {
      if (lec) {
        lec.videoBlob = true;
        lec.videoName = file.name;
        lec.type = 'video';
        lec.videoKey = '';
      }
      save();
      toast('Video tersimpan di browser ini.');
      render();
    }).catch(() => toast('Gagal simpan video di browser.'));
  }
  function ingestCoverFile(file, kind, id) {
    if (!file) return;
    if (file.type && file.type.indexOf('image') !== 0) {
      toast('Cover harus gambar.');
      return;
    }
    if (file.size > MAX_IMG) {
      toast('Cover maks 5 MB.');
      return;
    }
    const applyCover = (patch) => {
      if (kind === 'week') {
        const w = db.weeks.find((x) => x.id === id);
        if (w) Object.assign(w, patch);
      } else {
        const l = lectureById(id);
        if (l) Object.assign(l, patch);
      }
    };
    if (syncEnabled()) {
      toast('Mengunggah cover…');
      uploadClassVideo(file, coverKey(kind, id), null, 'image').then((info) => {
        applyCover({ coverUrl: mediaFileUrl(info.key), coverKey: info.key, coverBlob: false });
        save();
        toast('Cover tersimpan di kelas.');
        render();
      }).catch(() => toast('Gagal unggah cover.'));
      return;
    }
    blobPut(coverKey(kind, id), file).then(() => {
      applyCover({ coverBlob: true });
      save();
      toast('Cover tersimpan di browser ini.');
      render();
    }).catch(() => toast('Gagal simpan cover.'));
  }
  function ingestResourceFile(file, lecId) {
    if (!file) return;
    if (file.size > MAX_FILE) {
      toast('File maks 20 MB.');
      return;
    }
    const l = lectureById(lecId);
    if (!l) return;
    l.resources = l.resources || [];
    const blobId = fileKey(lecId, Date.now());
    if (syncEnabled()) {
      toast('Mengunggah file…');
      uploadClassVideo(file, blobId, null, 'file').then((info) => {
        l.resources.push({ name: file.name, url: mediaFileUrl(info.key), blob: false, fileKey: info.key });
        save();
        toast('File tersimpan di kelas.');
        render();
      }).catch(() => toast('Gagal unggah file.'));
      return;
    }
    blobPut(blobId, file).then(() => {
      l.resources.push({ name: file.name, url: '', blob: true, blobId: blobId });
      save();
      toast('File tersimpan di browser ini.');
      render();
    }).catch(() => toast('Gagal simpan file.'));
  }

  function payChip(st, source) {
    let label = {
      lunas: 'Lunas', cicilan: 'Cicilan', belum: 'Belum bayar', gratis: 'Beasiswa',
      trial: 'Trial', pending: 'Cek transfer'
    }[st] || st;
    if (st === 'pending' && source === 'mayar') label = 'Menunggu Mayar';
    const cls = st === 'trial' ? 'warn' : st;
    return '<span class="chip ' + esc(cls) + '">' + esc(label) + '</span>';
  }
  function billStatusSelect(id, b) {
    return '<select data-act="bill-one" data-id="' + esc(id) + '">' +
      ['lunas', 'cicilan', 'belum', 'gratis', 'trial', 'pending'].map((st) =>
        '<option' + (b.status === st ? ' selected' : '') + ' value="' + st + '">' + st + '</option>').join('') +
      '</select>';
  }
  function billAmountInput(id, b) {
    return '<input class="inline-edit money-in" data-act="bill-amount" data-id="' + esc(id) + '" type="number" min="0" step="1000" value="' + (Number(b.amount) || 0) + '">';
  }
  function personEntitlementsHtml(id) {
    if (!canBill()) return '';
    const b = billingOf(id);
    const mentorOn = canMentoring(id);
    return '<div class="fub-field"><dt>Mentoring</dt><dd>' +
      '<label class="muted"><input type="checkbox" data-act="ent-mentor" data-id="' + esc(id) + '"' +
        (mentorOn ? ' checked' : '') + (b.status === 'gratis' ? ' disabled' : '') + '> Live class + alat lynk</label></dd></div>' +
      '<div class="fub-field"><dt>SKU</dt><dd class="sku-checks">' +
        catalog().map((p) =>
          '<label><input type="checkbox" data-act="ent-sku" data-id="' + esc(id) + '" data-sku="' + esc(p.id) + '"' +
            (canSku(id, p.id) ? ' checked' : '') + ((mentorOn && bundled(p)) ? ' disabled' : '') + '> ' +
            esc(p.title) + '</label>'
        ).join('') +
      '</dd></div>';
  }

  function typeLabel(t) {
    return { video: 'Video', text: 'Bacaan', document: 'File', tool: 'Alat' }[t] || t;
  }
  function initialsOf(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase() || '?';
  }
  function tiktokHandle(raw) {
    let h = String(raw || '').trim();
    if (!h) return '';
    h = h.replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').replace(/^@/, '');
    return h.split(/[/?#]/)[0];
  }
  function tiktokUrl(handle) {
    const h = tiktokHandle(handle);
    return h ? ('https://www.tiktok.com/@' + h) : '';
  }
  const SOCIAL_PLATFORMS = [
    { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
    { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
    { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
    { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
    { id: 'x', label: 'X', hosts: ['x.com', 'twitter.com'] }
  ];
  const SHOP_PLATFORMS = [
    { id: 'tiktok_shop', label: 'TikTok Shop', hosts: ['tiktok.com', 'shop.tiktok.com'] },
    { id: 'shopee', label: 'Shopee', hosts: ['shopee.co.id', 'shopee.com'] },
    { id: 'tokopedia', label: 'Tokopedia', hosts: ['tokopedia.com'] },
    { id: 'lazada', label: 'Lazada', hosts: ['lazada.co.id', 'lazada.com'] },
    { id: 'blibli', label: 'Blibli', hosts: ['blibli.com'] },
    { id: 'other', label: 'Lainnya', hosts: null }
  ];
  function linkId() {
    return 'lnk-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
  }
  function platLabel(list, id) {
    const p = list.find((x) => x.id === id);
    return (p && p.label) || id || '—';
  }
  function icoSvg(path, opts) {
    const size = (opts && opts.size) || 16;
    const fill = (opts && opts.fill) || 'currentColor';
    const cls = (opts && opts.cls) || 'fub-plat-ico';
    return '<svg class="' + cls + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + fill + '" aria-hidden="true">' + path + '</svg>';
  }
  function platIcon(platform, size) {
    const s = size || 16;
    const map = {
      instagram: icoSvg('<path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5.2A4.8 4.8 0 1 0 16.8 12 4.8 4.8 0 0 0 12 7.2zm0 7.7A2.9 2.9 0 1 1 14.9 12 2.9 2.9 0 0 1 12 14.9zM17.7 6a1.1 1.1 0 1 0 1.1 1.1A1.1 1.1 0 0 0 17.7 6z"/>', { size: s, cls: 'fub-plat-ico is-ig' }),
      tiktok: icoSvg('<path d="M14.5 3h2.2a5.4 5.4 0 0 0 3.3 3.1v2.3a7.5 7.5 0 0 1-3.3-1v6.4a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v2.5a3.3 3.3 0 1 0 2.4 3.2V3z"/>', { size: s, cls: 'fub-plat-ico is-tt' }),
      youtube: icoSvg('<path d="M23 12.2s0-3.4-.4-5a2.9 2.9 0 0 0-2-2C18.7 4.7 12 4.7 12 4.7s-6.7 0-8.6.5a2.9 2.9 0 0 0-2 2c-.4 1.6-.4 5-.4 5s0 3.4.4 5a2.9 2.9 0 0 0 2 2c1.9.5 8.6.5 8.6.5s6.7 0 8.6-.5a2.9 2.9 0 0 0 2-2c.4-1.6.4-5 .4-5zM9.8 15.5V8.9l6.3 3.3z"/>', { size: s, cls: 'fub-plat-ico is-yt' }),
      facebook: icoSvg('<path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H7v3h3v7h3v-7h3.1l.9-3H13v-2c0-.6.4-1 1-1z"/>', { size: s, cls: 'fub-plat-ico is-fb' }),
      x: icoSvg('<path d="M4 4h4.2l4.1 5.6L16.8 4H20l-6.1 7.2L20.5 20h-4.2l-4.5-6.1L7.2 20H4l6.5-7.6z"/>', { size: s, cls: 'fub-plat-ico is-x' }),
      tiktok_shop: icoSvg('<path d="M14.5 3h2.2a5.4 5.4 0 0 0 3.3 3.1v2.3a7.5 7.5 0 0 1-3.3-1v6.4a5.8 5.8 0 1 1-5.8-5.8c.3 0 .6 0 .9.1v2.5a3.3 3.3 0 1 0 2.4 3.2V3z"/>', { size: s, cls: 'fub-plat-ico is-tt' }),
      shopee: icoSvg('<path d="M6 8h12l1 13H5L6 8zm2.2-3.2A3.8 3.8 0 0 1 12 3a3.8 3.8 0 0 1 3.8 1.8L14.5 6A2 2 0 0 0 12 4.8 2 2 0 0 0 9.5 6z"/>', { size: s, cls: 'fub-plat-ico is-shopee' }),
      tokopedia: icoSvg('<path d="M12 2 3 7v10l9 5 9-5V7zm0 3.2 5.5 3-5.5 3-5.5-3z"/>', { size: s, cls: 'fub-plat-ico is-tokped' }),
      lazada: icoSvg('<path d="M4 5h16v3.2H8.5L19 19h-3.8L5.5 8.8V19H4z"/>', { size: s, cls: 'fub-plat-ico is-lazada' }),
      blibli: icoSvg('<path d="M5 5h6.5a4.5 4.5 0 0 1 0 9H8v5H5zm3 3v3h3.3a1.5 1.5 0 0 0 0-3zM14 10h5v3h-2.2L19 19h-3.3l-2.1-6H14z"/>', { size: s, cls: 'fub-plat-ico is-blibli' }),
      other: icoSvg('<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-2h2zm0-4h-2V7h2z"/>', { size: s, cls: 'fub-plat-ico is-other' })
    };
    return map[platform] || map.other;
  }
  function waIconSvg(size) {
    return icoSvg('<path d="M17.5 14.4c-.3-.1-1.8-.9-2-.9s-.5-.1-.7.2-.8 1-.9 1.1-.3.2-.6.1a8 8 0 0 1-2.4-1.5 8.9 8.9 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.5.3-.5c.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2-.5-.5-.7-.5h-.6a1.5 1.5 0 0 0-1.1.5 4.5 4.5 0 0 0-1.4 3.3 7.8 7.8 0 0 0 1.7 4.1 17.8 17.8 0 0 0 6.8 6c.9.4 1.7.6 2.3.8a4 4 0 0 0 1.9.1 3.4 3.4 0 0 0 2.2-1.6 2.8 2.8 0 0 0 .2-1.6c-.1-.1-.3-.2-.6-.3zM12 21.8h0a9.9 9.9 0 0 1-5-.1l-.4-.2-3.7 1 1-3.6-.2-.4A9.9 9.9 0 1 1 12 21.8z"/>', { size: size || 16, cls: 'fub-plat-ico is-wa', fill: 'currentColor' });
  }
  function emailIconSvg(size) {
    return icoSvg('<path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2.3 9 5.7 9-5.7V7L12 12.7 3 7z"/>', { size: size || 16, cls: 'fub-plat-ico is-email', fill: 'currentColor' });
  }
  function payKindLabel(kind) {
    return { mentoring: 'Mentoring', renewal: 'Perpanjang', sku: 'SKU' }[kind] || (kind || 'Bayar');
  }
  function personContributions(id) {
    ensureDiskusi();
    const posts = (db.posts || []).filter((p) => p && p.authorId === id).map((p) => ({
      kind: 'post',
      id: p.id,
      at: p.createdAt,
      body: p.body || '',
      batchId: p.batchId || ''
    }));
    const comments = (db.comments || []).filter((c) => c && c.authorId === id).map((c) => {
      const post = (db.posts || []).find((p) => p && p.id === c.postId);
      return {
        kind: 'comment',
        id: c.id,
        at: c.createdAt,
        body: c.body || '',
        batchId: (post && post.batchId) || '',
        postId: c.postId
      };
    });
    return posts.concat(comments).sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }
  function personPayments(id) {
    return paymentsList()
      .filter((p) => p && p.personId === id)
      .slice()
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  }
  function hostMatches(hosts, url) {
    if (!hosts) return true;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      return hosts.some((h) => host === h || host.endsWith('.' + h));
    } catch (_) {
      return false;
    }
  }
  function parseSocialLink(platform, raw) {
    const value = String(raw || '').trim();
    if (!value || !platform) return null;
    const spec = SOCIAL_PLATFORMS.find((p) => p.id === platform);
    if (!spec) return null;
    let url = value;
    const bare = value.replace(/^@/, '').replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(value)) {
      if (platform === 'instagram') url = 'https://instagram.com/' + bare;
      else if (platform === 'tiktok') url = 'https://www.tiktok.com/@' + bare.replace(/^@/, '');
      else if (platform === 'youtube') url = 'https://www.youtube.com/@' + bare.replace(/^@/, '');
      else if (platform === 'facebook') url = 'https://www.facebook.com/' + bare;
      else if (platform === 'x') url = 'https://x.com/' + bare.replace(/^@/, '');
      else return null;
    }
    if (!hostMatches(spec.hosts, url)) return null;
    let handle = bare;
    try {
      const u = new URL(url);
      handle = decodeURIComponent(u.pathname.replace(/^\/+/, '').replace(/^@/, '')).split('/')[0] || bare;
    } catch (_) {}
    if (platform === 'tiktok') handle = tiktokHandle(handle || value);
    return { platform: platform, url: url, handle: String(handle || platform).slice(0, 80) };
  }
  function parseShopLink(platform, raw) {
    const value = String(raw || '').trim();
    if (!value || !platform) return null;
    const spec = SHOP_PLATFORMS.find((p) => p.id === platform);
    if (!spec) return null;
    let url = value;
    if (!/^https?:\/\//i.test(value)) {
      const bare = value.replace(/^@/, '').replace(/^\/+/, '');
      if (platform === 'tiktok_shop') url = 'https://www.tiktok.com/@' + bare.replace(/^@/, '');
      else if (platform === 'shopee') url = 'https://shopee.co.id/' + bare;
      else if (platform === 'tokopedia') url = 'https://www.tokopedia.com/' + bare;
      else if (platform === 'lazada') url = 'https://www.lazada.co.id/shop/' + bare;
      else if (platform === 'blibli') url = 'https://www.blibli.com/merchant/' + bare;
      else url = 'https://' + bare;
    }
    if (spec.hosts && !hostMatches(spec.hosts, url)) return null;
    let handle = value;
    try {
      const u = new URL(url);
      handle = decodeURIComponent(u.pathname.replace(/^\/+/, '').replace(/^@/, '').replace(/^shop\//, '').replace(/^merchant\//, '')).split('/')[0] || platLabel(SHOP_PLATFORMS, platform);
    } catch (_) {}
    return { platform: platform, url: url, handle: String(handle || platform).slice(0, 80) };
  }
  function personSocialLinks(s) {
    if (Array.isArray(s.socialLinks)) return s.socialLinks.slice();
    const out = [];
    if (s.tiktok) {
      const h = tiktokHandle(s.tiktok);
      if (h) out.push({ id: 'mig-tt', platform: 'tiktok', handle: h, url: tiktokUrl(h) });
    }
    return out;
  }
  function personShopLinks(s, app) {
    if (Array.isArray(s.shopLinks)) return s.shopLinks.slice();
    const out = [];
    const url = s.shopUrl || (app && app.shopUrl) || '';
    const name = s.shopName || (app && app.shopName) || '';
    if (url) {
      let platform = 'other';
      const low = String(url).toLowerCase();
      if (/tiktok\.com|shop\.tiktok/.test(low)) platform = 'tiktok_shop';
      else if (/shopee\./.test(low)) platform = 'shopee';
      else if (/tokopedia\./.test(low)) platform = 'tokopedia';
      else if (/lazada\./.test(low)) platform = 'lazada';
      else if (/blibli\./.test(low)) platform = 'blibli';
      const parsed = parseShopLink(platform, url) || { platform: platform, url: url, handle: name || platform };
      if (name && parsed.handle === platform) parsed.handle = name;
      else if (name) parsed.handle = name;
      out.push(Object.assign({ id: 'mig-shop' }, parsed));
    }
    return out;
  }
  function saveSocialLinks(id, links) {
    const clean = (links || []).filter((x) => x && x.platform && x.url);
    const tt = clean.find((x) => x.platform === 'tiktok');
    patchPerson(id, {
      socialLinks: clean,
      tiktok: tt ? tiktokHandle(tt.handle || tt.url) : ''
    });
  }
  function saveShopLinks(id, links) {
    const clean = (links || []).filter((x) => x && x.platform && x.url);
    const first = clean[0];
    const cur = people().find((x) => x.id === id) || {};
    patchPerson(id, {
      shopLinks: clean,
      shopUrl: first ? first.url : '',
      shopName: cur.shopName || (first && first.handle) || ''
    });
  }
  function personLinksHtml(id, s, app) {
    const socials = personSocialLinks(s);
    const shops = personShopLinks(s, app);
    const socialPick = ui.socialPick;
    const shopPick = ui.shopPick;
    const socialList = socials.length
      ? socials.map((row) =>
          '<div class="fub-link">' +
            '<a class="fub-link-ico" href="' + esc(row.url) + '" target="_blank" rel="noopener" title="' +
              esc(platLabel(SOCIAL_PLATFORMS, row.platform) + (row.handle ? ' · ' + row.handle : '')) + '" aria-label="' +
              esc(platLabel(SOCIAL_PLATFORMS, row.platform)) + '">' + platIcon(row.platform, 18) + '</a>' +
            '<a class="fub-link-a" href="' + esc(row.url) + '" target="_blank" rel="noopener">' + esc(row.handle || row.url) + '</a>' +
            '<button type="button" class="btn-sm fub-link-del" data-act="del-social" data-id="' + esc(id) + '" data-lid="' + esc(row.id || '') + '" data-plat="' + esc(row.platform) + '" title="Hapus">×</button>' +
          '</div>'
        ).join('')
      : '<p class="muted fub-link-empty">Belum ada. Pilih platform di bawah.</p>';
    const shopList = shops.length
      ? shops.map((row) =>
          '<div class="fub-link">' +
            '<a class="fub-link-ico" href="' + esc(row.url) + '" target="_blank" rel="noopener" title="' +
              esc(platLabel(SHOP_PLATFORMS, row.platform) + (row.handle ? ' · ' + row.handle : '')) + '" aria-label="' +
              esc(platLabel(SHOP_PLATFORMS, row.platform)) + '">' + platIcon(row.platform, 18) + '</a>' +
            '<a class="fub-link-a" href="' + esc(row.url) + '" target="_blank" rel="noopener">' + esc(row.handle || row.url) + '</a>' +
            '<button type="button" class="btn-sm fub-link-del" data-act="del-shop" data-id="' + esc(id) + '" data-lid="' + esc(row.id || '') + '" data-plat="' + esc(row.platform) + '" title="Hapus">×</button>' +
          '</div>'
        ).join('')
      : '<p class="muted fub-link-empty">Belum ada. Pilih marketplace di bawah.</p>';
    const socialEditor =
      '<div class="fub-plat-pick" role="group" aria-label="Pilih sosial">' +
        SOCIAL_PLATFORMS.map((p) =>
          '<button type="button" class="btn-sm fub-plat fub-plat-ico-btn' + (socialPick === p.id ? ' is-on' : '') +
            '" data-act="pick-social" data-id="' + p.id + '" title="' + esc(p.label) + '" aria-label="' + esc(p.label) + '"' +
            (socials.some((x) => x.platform === p.id) ? ' disabled' : '') + '>' + platIcon(p.id, 16) + '</button>'
        ).join('') +
      '</div>' +
      (socialPick
        ? '<div class="fub-addrow">' +
            '<input class="inline-edit" data-act="social-input" data-id="' + esc(id) + '" maxlength="200" placeholder="@nama atau tautan ' + esc(platLabel(SOCIAL_PLATFORMS, socialPick)) + '">' +
            '<button type="button" class="btn-sm" data-act="add-social" data-id="' + esc(id) + '">Tambah</button>' +
          '</div>'
        : '');
    const shopEditor =
      '<div class="fub-plat-pick" role="group" aria-label="Pilih toko">' +
        SHOP_PLATFORMS.map((p) =>
          '<button type="button" class="btn-sm fub-plat fub-plat-ico-btn' + (shopPick === p.id ? ' is-on' : '') +
            '" data-act="pick-shop" data-id="' + p.id + '" title="' + esc(p.label) + '" aria-label="' + esc(p.label) + '">' +
            platIcon(p.id, 16) + '</button>'
        ).join('') +
      '</div>' +
      (shopPick
        ? '<div class="fub-addrow">' +
            '<input class="inline-edit" data-act="shop-input" data-id="' + esc(id) + '" maxlength="300" placeholder="' +
              esc(shopPick === 'tiktok_shop' ? '@toko atau https://tiktok.com/@…'
                : shopPick === 'shopee' ? 'https://shopee.co.id/namatoko'
                : shopPick === 'tokopedia' ? 'https://www.tokopedia.com/namatoko'
                : shopPick === 'other' ? 'https://…'
                : ('Tautan ' + platLabel(SHOP_PLATFORMS, shopPick))) + '">' +
            '<button type="button" class="btn-sm" data-act="add-shop" data-id="' + esc(id) + '">Tambah</button>' +
          '</div>'
        : '');
    return '<div class="fub-section">' +
        '<div class="fub-section-h">Sosial</div>' +
        '<div class="fub-linklist">' + socialList + '</div>' +
        socialEditor +
      '</div>' +
      '<div class="fub-section">' +
        '<div class="fub-section-h">Toko</div>' +
        '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="shopName" value="' +
          esc(s.shopName || (app && app.shopName) || '') + '" placeholder="Nama toko (opsional)">' +
        '<div class="fub-linklist">' + shopList + '</div>' +
        shopEditor +
      '</div>';
  }
  function personGroupsHtml(id) {
    const batchId = batchOf(id);
    if (!batchId) {
      return '<div class="fub-section">' +
        '<div class="fub-section-h">Grup diskusi</div>' +
        '<p class="muted fub-link-empty">Belum masuk grup diskusi.</p>' +
      '</div>';
    }
    return '<div class="fub-section">' +
      '<div class="fub-section-h">Grup diskusi</div>' +
      '<div class="fub-group-chip">' +
        '<span class="fub-group-name">' + esc(batchLabel(batchId)) + '</span>' +
        '<span class="muted">' + esc(batchId) + '</span>' +
      '</div>' +
      personBatchField(id) +
    '</div>';
  }
  function personOnboardFieldsHtml(id) {
    syncOnboardingAccountFields();
    const defs = [];
    const seen = new Set();
    wizFormPages().forEach((page) => {
      (page.fields || []).forEach((f) => {
        if (!isObAccountField(f)) return;
        const fid = obStoreId(f);
        if (!fid || seen.has(fid)) return;
        seen.add(fid);
        defs.push({ id: fid, label: obFieldLabel(f, page), type: f.type });
      });
    });
    const person = (db.people && db.people[id]) || {};
    const fields = person.fields || {};
    Object.keys(fields).forEach((fid) => {
      if (seen.has(fid)) return;
      seen.add(fid);
      const custom = daftarCustomList().find((c) => c.id === fid);
      if (!custom) {
        db.daftarCustom = daftarCustomList().concat([{ id: fid, label: String(fid).slice(0, 40) }]);
      }
      defs.push({
        id: fid,
        label: (custom && custom.label) || String(fid).slice(0, 40),
        type: 'text'
      });
    });
    if (!defs.length) {
      return '<div class="fub-section">' +
        '<div class="fub-section-h">Join / onboarding</div>' +
        '<p class="muted fub-link-empty">Belum ada field join. Tambah di Account → Onboarding.</p>' +
      '</div>';
    }
    return '<div class="fub-section">' +
      '<div class="fub-section-h">Join / onboarding</div>' +
      defs.map((def) => {
        const raw = personCustomVal(id, def.id);
        const shown = def.type === 'multi'
          ? parsePersonFieldValue(raw, 'multi').join(', ')
          : raw;
        return '<label class="fub-ob-field">' +
          '<span class="muted">' + esc(def.label) + '</span>' +
          '<input class="inline-edit" data-act="daftar-custom-val" data-id="' + esc(id) +
            '" data-col="' + esc(def.id) + '" value="' + esc(shown) + '" placeholder="—">' +
        '</label>';
      }).join('') +
    '</div>';
  }
  function photoKey(id) { return 'photo-' + id; }
  function coverKey(kind, id) { return 'cover-' + kind + '-' + id; }
  function fileKey(lecId, n) { return 'file-' + lecId + '-' + n; }
  function avatarHtml(s, cls) {
    const c = cls || 'avatar';
    if (s && s.photoUrl) return '<img class="' + c + '" src="' + esc(s.photoUrl) + '" alt="">';
    if (s && s.photoBlob) return '<img class="' + c + '" data-blob="' + esc(photoKey(s.id)) + '" alt="">';
    return '<span class="' + c + ' avatar-fallback" aria-hidden="true">' + esc(initialsOf(displayNameOf(s) || (s && s.name))) + '</span>';
  }
  function fmtPhone(wa) {
    const d = String(wa || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('62') === 0) {
      return '+62 ' + d.slice(2, 5) + (d.length > 5 ? '-' + d.slice(5, 9) : '') + (d.length > 9 ? '-' + d.slice(9) : '');
    }
    return d;
  }
  function relWhen(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!isFinite(t)) return String(iso);
    const ms = nowMs() - t;
    if (ms < 45000) return 'baru saja';
    if (ms < 3600000) return Math.max(1, Math.floor(ms / 60000)) + ' menit lalu';
    if (ms < 86400000) return Math.max(1, Math.floor(ms / 3600000)) + ' jam lalu';
    if (ms < 172800000) return 'kemarin';
    return fmtWhen(iso);
  }
  function stageHue(i) {
    return PIPE_STAGE_COLORS[i % PIPE_STAGE_COLORS.length];
  }
  function stepKindLabel(k) {
    return { email: 'Email', wa: 'WhatsApp', task: 'Tugas', stage: 'Pindah stage' }[k] || k;
  }
  function staffPerson() {
    return people().find((x) => x.id === 'u-anton') || { id: 'u-anton', name: 'Anton' };
  }
  function personFeed(id) {
    const items = [];
    (db.notes[id] || []).forEach((n) => items.push({ at: n.at, kind: 'note', who: 'Anton', body: n.body }));
    (db.timeline[id] || []).forEach((n) => items.push({ at: n.at, kind: n.kind || 'event', who: 'Sistem', body: n.body }));
    (db.emailQueue || []).filter((x) => x.toId === id).forEach((x) =>
      items.push({ at: x.scheduledAt, kind: 'email', who: 'Otomasi', body: (x.status || '') + ' · ' + (x.subject || x.title) }));
    (db.waQueue || []).filter((x) => x.toId === id).forEach((x) =>
      items.push({ at: x.scheduledAt, kind: 'wa', who: 'Otomasi', body: (x.status || '') + ' · ' + x.title }));
    db.tasks.filter((x) => x.personId === id).forEach((x) =>
      items.push({ at: x.dueAt, kind: 'task', who: 'Tugas', body: (x.done ? 'selesai' : 'terbuka') + ' · ' + x.title }));
    items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    return items;
  }
  function matchPerson(s, q) {
    if (!q) return true;
    const handle = tiktokHandle(s.tiktok);
    const tags = ((s.tags || []).join(' ')).toLowerCase();
    const full = (displayNameOf(s) || s.name || '').toLowerCase();
    return full.indexOf(q) >= 0 ||
      String(s.firstName || '').toLowerCase().indexOf(q) >= 0 ||
      String(s.lastName || '').toLowerCase().indexOf(q) >= 0 ||
      (s.wa || '').indexOf(q) >= 0 ||
      (s.email || '').toLowerCase().indexOf(q) >= 0 || (s.city || '').toLowerCase().indexOf(q) >= 0 ||
      handle.toLowerCase().indexOf(q) >= 0 || billingOf(s.id).status.indexOf(q) >= 0 ||
      stageLabel(crmOf(s.id).stage).toLowerCase().indexOf(q) >= 0 ||
      tags.indexOf(q) >= 0;
  }
  function personJoinedAt(id) {
    const app = db.applications[id];
    if (app && app.at) return app.at;
    const b = billingOf(id);
    if (b.paidAt) return b.paidAt;
    const c = crmOf(id);
    if (c.watchedFirstAt) return c.watchedFirstAt;
    const s = people().find((x) => x.id === id);
    return (s && s.lastActive) || null;
  }
  function daftarPayOptions() {
    return [
      { id: '', label: 'Semua bayar' },
      { id: 'lunas', label: 'Lunas' },
      { id: 'cicilan', label: 'Cicilan' },
      { id: 'belum', label: 'Belum bayar' },
      { id: 'trial', label: 'Trial' },
      { id: 'pending', label: 'Cek transfer' },
      { id: 'gratis', label: 'Beasiswa' },
      { id: 'paid', label: 'Sudah bayar*' },
      { id: 'unpaid', label: 'Belum lunas*' }
    ];
  }
  function matchDaftarPay(status, filter) {
    if (!filter) return true;
    if (filter === 'paid') return status === 'lunas' || status === 'cicilan' || status === 'gratis';
    if (filter === 'unpaid') return status === 'belum' || status === 'trial' || status === 'pending';
    return status === filter;
  }
  function matchDaftarJoined(id, fromYmd, toYmd) {
    if (!fromYmd && !toYmd) return true;
    const at = personJoinedAt(id);
    if (!at) return false;
    const ymd = ymdOf(at);
    if (!ymd) return false;
    if (fromYmd && ymd < fromYmd) return false;
    if (toYmd && ymd > toYmd) return false;
    return true;
  }
  function daftarHasExtraFilters() {
    return !!(ui.daftarTagFilter || ui.daftarPayFilter || ui.daftarJoinedFrom || ui.daftarJoinedTo);
  }
  function daftarFilteredPeople(q) {
    const stage = ui.stageFilter || '';
    const tag = normalizeTag(ui.daftarTagFilter).toLowerCase();
    const pay = ui.daftarPayFilter || '';
    const from = ui.daftarJoinedFrom || '';
    const to = ui.daftarJoinedTo || '';
    return people().filter((s) => {
      if (stage && crmOf(s.id).stage !== stage) return false;
      if (tag) {
        const tags = (s.tags || []).map((t) => String(t).toLowerCase());
        if (tags.indexOf(tag) < 0) return false;
      }
      if (!matchDaftarPay(billingOf(s.id).status, pay)) return false;
      if (!matchDaftarJoined(s.id, from, to)) return false;
      return matchPerson(s, q);
    });
  }
  function daftarSelectedVisible(rows) {
    if (!(ui.daftarSelected instanceof Set)) ui.daftarSelected = new Set();
    const visible = new Set((rows || []).map((s) => s.id));
    return Array.from(ui.daftarSelected).filter((id) => visible.has(id));
  }
  function clearDaftarSelection() {
    ui.daftarSelected = new Set();
    ui.daftarBulk = '';
  }
  function daftarFiltersHtml() {
    const tags = allKnownTags();
    const tagCur = ui.daftarTagFilter || '';
    const payCur = ui.daftarPayFilter || '';
    const tagOpts = '<option value="">Semua tag</option>' +
      tags.map((t) => '<option value="' + esc(t) + '"' + (tagCur === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
    const payOpts = daftarPayOptions().map((o) =>
      '<option value="' + esc(o.id) + '"' + (payCur === o.id ? ' selected' : '') + '>' + esc(o.label) + '</option>'
    ).join('');
    return '<div class="daftar-filters">' +
      '<label class="daftar-filter">' +
        '<span class="muted">Tag</span>' +
        '<select data-act="daftar-tag-filter">' + tagOpts + '</select>' +
      '</label>' +
      '<label class="daftar-filter">' +
        '<span class="muted">Bayar</span>' +
        '<select data-act="daftar-pay-filter">' + payOpts + '</select>' +
      '</label>' +
      '<label class="daftar-filter">' +
        '<span class="muted">Gabung dari</span>' +
        '<input type="date" data-act="daftar-joined-from" value="' + esc(ui.daftarJoinedFrom || '') + '">' +
      '</label>' +
      '<label class="daftar-filter">' +
        '<span class="muted">sampai</span>' +
        '<input type="date" data-act="daftar-joined-to" value="' + esc(ui.daftarJoinedTo || '') + '">' +
      '</label>' +
      (daftarHasExtraFilters()
        ? '<button type="button" class="btn-sm" data-act="daftar-filters-clear">Reset filter</button>'
        : '') +
    '</div>';
  }
  function daftarBulkPanelHtml(ids) {
    const mode = ui.daftarBulk || '';
    if (!mode || !ids.length) return '';
    const n = ids.length;
    if (mode === 'tag') {
      const known = allKnownTags();
      const opts = known.map((t) =>
        '<button type="button" class="tag-picker-opt" data-act="daftar-bulk-tag-pick" data-tag="' + esc(t) + '">' +
          '<span class="tag-chip">' + esc(t) + '</span><span class="muted">pakai</span></button>'
      ).join('');
      return '<div class="daftar-bulk-panel" id="daftar-bulk-panel">' +
        '<div class="daftar-bulk-head"><strong>Tambah tag ke ' + n + ' orang</strong>' +
          '<button type="button" class="cols-dd-ico" data-act="daftar-bulk-close" title="Tutup">×</button></div>' +
        '<form class="daftar-bulk-form" data-act="daftar-bulk-tag">' +
          '<input name="tag" required maxlength="40" placeholder="Nama tag…" list="daftar-bulk-tag-list" autocomplete="off">' +
          '<datalist id="daftar-bulk-tag-list">' + known.map((t) => '<option value="' + esc(t) + '"></option>').join('') + '</datalist>' +
          '<button class="btn-sm" type="submit">Tambah</button>' +
        '</form>' +
        (opts ? '<div class="tag-picker-list daftar-bulk-tags">' + opts + '</div>' : '') +
      '</div>';
    }
    if (mode === 'stage') {
      const stages = pipelineStages();
      return '<div class="daftar-bulk-panel" id="daftar-bulk-panel">' +
        '<div class="daftar-bulk-head"><strong>Ubah stage ' + n + ' orang</strong>' +
          '<button type="button" class="cols-dd-ico" data-act="daftar-bulk-close" title="Tutup">×</button></div>' +
        '<form class="daftar-bulk-form" data-act="daftar-bulk-stage">' +
          '<select name="stage" required>' +
            '<option value="">Pilih stage…</option>' +
            stages.map((st) => '<option value="' + esc(st.id) + '">' + esc(st.label) + '</option>').join('') +
          '</select>' +
          '<button class="btn" type="submit">Pindahkan</button>' +
        '</form></div>';
    }
    if (mode === 'note') {
      return '<div class="daftar-bulk-panel" id="daftar-bulk-panel">' +
        '<div class="daftar-bulk-head"><strong>Catatan ke ' + n + ' orang</strong>' +
          '<button type="button" class="cols-dd-ico" data-act="daftar-bulk-close" title="Tutup">×</button></div>' +
        '<form class="compose daftar-bulk-form" data-act="daftar-bulk-note">' +
          '<textarea name="body" required rows="3" placeholder="Catatan yang sama untuk semua yang dipilih…"></textarea>' +
          '<button class="btn" type="submit">Simpan catatan</button>' +
        '</form></div>';
    }
    if (mode === 'email') {
      const withMail = ids.filter((id) => {
        const s = people().find((x) => x.id === id);
        return s && s.email;
      });
      const missing = n - withMail.length;
      return '<div class="daftar-bulk-panel" id="daftar-bulk-panel">' +
        '<div class="daftar-bulk-head"><strong>Email ' + withMail.length + ' orang</strong>' +
          '<button type="button" class="cols-dd-ico" data-act="daftar-bulk-close" title="Tutup">×</button></div>' +
        (missing ? '<p class="muted" style="margin:0 0 8px">' + missing + ' tanpa email — dilewati.</p>' : '') +
        (withMail.length
          ? '<form class="compose daftar-bulk-form" data-act="daftar-bulk-email">' +
              '<input name="subject" required placeholder="Subjek" value="MasterMind with Anton GC">' +
              '<textarea name="body" required rows="4" placeholder="Halo {name}, …"></textarea>' +
              '<p class="muted" style="margin:0">Pakai {name}. Antrian email + buka mailto BCC.</p>' +
              '<div class="row" style="gap:8px;flex-wrap:wrap">' +
                '<button class="btn" type="submit">Antrikan &amp; buka email</button>' +
              '</div></form>'
          : '<p class="muted">Tidak ada email di pilihan ini.</p>') +
        '</div>';
    }
    if (mode === 'update') {
      return '<div class="daftar-bulk-panel" id="daftar-bulk-panel">' +
        '<div class="daftar-bulk-head"><strong>Kirim update ke ' + n + ' orang</strong>' +
          '<button type="button" class="cols-dd-ico" data-act="daftar-bulk-close" title="Tutup">×</button></div>' +
        '<form class="compose daftar-bulk-form" data-act="daftar-bulk-update">' +
          '<input name="title" required placeholder="Judul singkat" value="Update kelas">' +
          '<textarea name="body" required rows="4" placeholder="Halo {name}, …"></textarea>' +
          '<div class="daftar-bulk-checks">' +
            '<label><input type="checkbox" name="viaWa" checked> Antrikan WA</label>' +
            '<label><input type="checkbox" name="viaEmail" checked> Antrikan email</label>' +
          '</div>' +
          '<p class="muted" style="margin:0">Pakai {name}, {amount}, {until}. Masuk antrean Tugas / otomasi.</p>' +
          '<button class="btn" type="submit">Kirim ke antrean</button>' +
        '</form></div>';
    }
    return '';
  }
  function daftarBulkBarHtml(ids) {
    const n = ids.length;
    if (!n) return '';
    const mode = ui.daftarBulk || '';
    const btn = (id, label) =>
      '<button type="button" class="btn-sm' + (mode === id ? ' is-on' : '') +
        '" data-act="daftar-bulk" data-id="' + esc(id) + '">' + label + '</button>';
    return '<div class="daftar-bulk-bar">' +
      '<div class="daftar-bulk-bar-main">' +
        '<strong>' + n + ' dipilih</strong>' +
        '<div class="daftar-bulk-acts">' +
          btn('tag', 'Tambah tag') +
          btn('email', 'Email') +
          btn('note', 'Catatan') +
          btn('stage', 'Ubah stage') +
          btn('update', 'Kirim update') +
          '<button type="button" class="btn-sm" data-act="daftar-sel-clear">Batal</button>' +
        '</div>' +
      '</div>' +
      daftarBulkPanelHtml(ids) +
    '</div>';
  }
  function paintCariDrop() {
    const drop = $('cari-siswa-drop');
    if (!drop) return;
    const q = String(ui.cariSiswa || '').trim().toLowerCase();
    if (!isStaff() || !ui.cariOpen || !q) {
      drop.hidden = true;
      drop.innerHTML = '';
      return;
    }
    const hits = people().filter((s) => matchPerson(s, q)).slice(0, 8);
    drop.hidden = false;
    drop.innerHTML = hits.length
      ? hits.map((s) =>
          '<button type="button" class="cari-hit" data-act="open-student" data-id="' + esc(s.id) + '">' +
            avatarHtml(s, 'avatar sm') +
            '<span><strong>' + esc(s.name) + '</strong>' +
              '<span class="muted">' + esc(stageLabel(crmOf(s.id).stage)) + ' · ' + esc(billingOf(s.id).status) + '</span>' +
            '</span></button>'
        ).join('')
      : '<p class="cari-empty muted">Tidak ketemu “‘ + esc(ui.cariSiswa) + ’”</p>';
  }
  function feedKindMeta(kind) {
    const k = String(kind || 'note').toLowerCase();
    if (k === 'wa' || k === 'whatsapp' || k === 'text') return { cls: 'is-wa', label: 'WA' };
    if (k === 'email' || k === 'mail') return { cls: 'is-email', label: 'Email' };
    if (k === 'call' || k === 'telepon') return { cls: 'is-call', label: 'Telepon' };
    if (k === 'task' || k === 'tugas') return { cls: 'is-task', label: 'Tugas' };
    if (k === 'event' || k === 'stage') return { cls: 'is-event', label: 'Event' };
    return { cls: 'is-note', label: 'Catatan' };
  }
  function lecDotStrip(sid) {
    const list = lectures();
    return '<span class="lec-dots" title="' + kurProgress(sid).n + '/' + list.length + ' materi">' +
      list.map((l) => {
        const done = isDone(sid, l.id);
        const locked = !canOpenLecture(sid, l.id);
        return '<i class="' + (done ? 'done' : locked ? 'locked' : 'rest') + '"></i>';
      }).join('') + '</span>';
  }
  function mdish(text) {
    const inner = esc(text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    return '<p>' + inner + '</p>';
  }
  function coverHtml(kind, id, cls) {
    const rec = kind === 'week' ? (db.weeks.find((w) => w.id === id) || {}) : (lectureById(id) || {});
    if (rec.coverUrl) return '<img class="' + (cls || 'cover-thumb') + '" src="' + esc(rec.coverUrl) + '" alt="">';
    if (rec.coverBlob) return '<img class="' + (cls || 'cover-thumb') + '" data-blob="' + esc(coverKey(kind, id)) + '" alt="">';
    return '';
  }
  function fetchTikTokAvatar(handle) {
    const h = tiktokHandle(handle);
    if (!h) return Promise.resolve(null);
    const oembed = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent('https://www.tiktok.com/@' + h);
    const unav = 'https://unavatar.io/tiktok/' + encodeURIComponent(h);
    return fetch(oembed).then((r) => r.ok ? r.json() : null).then((j) => {
      if (j && j.thumbnail_url) return fetch(j.thumbnail_url).then((r) => r.ok ? r.blob() : null);
      return null;
    }).catch(() => null).then((blob) => {
      if (blob) return blob;
      return fetch(unav).then((r) => r.ok ? r.blob() : null).catch(() => null);
    });
  }
  function refreshPersonPhoto(id, force) {
    const s = people().find((x) => x.id === id);
    if (!s || !s.tiktok) return Promise.resolve(false);
    if (s.photoUrl && !force) return Promise.resolve(true);
    if (!syncEnabled() && s.photoBlob && !force) return Promise.resolve(true);
    return fetchTikTokAvatar(s.tiktok).then((blob) => {
      if (!blob) {
        patchPerson(id, { photoFailed: true });
        save();
        return false;
      }
      if (syncEnabled()) {
        const file = new File([blob], 'tiktok.jpg', { type: blob.type || 'image/jpeg' });
        if (file.size > MAX_IMG) {
          patchPerson(id, { photoFailed: true });
          save();
          return false;
        }
        return uploadClassVideo(file, photoKey(id), null, 'image').then((info) => {
          if (s.photoKey && s.photoKey !== info.key) deleteRemoteVideo(s.photoKey);
          patchPerson(id, {
            photoUrl: mediaFileUrl(info.key),
            photoKey: info.key,
            photoBlob: false,
            photoFailed: false
          });
          save();
          return true;
        });
      }
      return blobPut(photoKey(id), blob).then(() => {
        patchPerson(id, { photoBlob: true, photoFailed: false });
        save();
        return true;
      });
    }).catch(() => {
      patchPerson(id, { photoFailed: true });
      save();
      return false;
    });
  }
  function reorderPipelineStage(fromId, toId, before) {
    const stages = pipelineStages();
    const from = stages.findIndex((s) => s.id === fromId);
    let to = stages.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0 || from === to) return false;
    const [row] = stages.splice(from, 1);
    if (from < to) to -= 1;
    const insertAt = before ? to : to + 1;
    stages.splice(insertAt, 0, row);
    db.pipelineStages = stages;
    return true;
  }
  function bindPipaStageDnD() {
    const list = document.querySelector('.pipa-stage-list');
    if (!list) return;
    const clearMarks = () => {
      list.querySelectorAll('.pipa-stage-row.is-drop, .pipa-stage-row.is-drop-before, .pipa-stage-row.is-drop-after')
        .forEach((r) => r.classList.remove('is-drop', 'is-drop-before', 'is-drop-after'));
    };
    list.querySelectorAll('.pipa-stage-row[data-drag="pipa-stage"]').forEach((el) => {
      el.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('input, button, label.pipa-stage-swatch, a, select, textarea')) {
          ev.preventDefault();
          return;
        }
        const id = el.getAttribute('data-sid');
        ev.dataTransfer.setData('text/plain', 'pipa-stage:' + id);
        ev.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-drag');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('is-drag');
        clearMarks();
      });
      el.addEventListener('dragover', (ev) => {
        const types = Array.prototype.slice.call(ev.dataTransfer.types || []);
        if (types.indexOf('text/plain') < 0) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        const rect = el.getBoundingClientRect();
        const before = (ev.clientY - rect.top) < rect.height / 2;
        clearMarks();
        el.classList.add('is-drop', before ? 'is-drop-before' : 'is-drop-after');
      });
      el.addEventListener('dragleave', (ev) => {
        if (ev.relatedTarget && el.contains(ev.relatedTarget)) return;
        el.classList.remove('is-drop', 'is-drop-before', 'is-drop-after');
      });
      el.addEventListener('drop', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const raw = ev.dataTransfer.getData('text/plain') || '';
        if (raw.indexOf('pipa-stage:') !== 0) return;
        const fromId = raw.slice('pipa-stage:'.length);
        const toId = el.getAttribute('data-sid');
        const rect = el.getBoundingClientRect();
        const before = (ev.clientY - rect.top) < rect.height / 2;
        clearMarks();
        if (!reorderPipelineStage(fromId, toId, before)) return;
        save();
        render();
      });
    });
  }
  function bindKanbanDnD() {
    const root = $('main');
    if (!root) return;
    root.querySelectorAll('.kanban-card[draggable="true"]').forEach((el) => {
      el.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', el.getAttribute('data-id'));
        ev.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-drag');
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('is-drag');
        ui.skipOpen = el.getAttribute('data-id');
        setTimeout(() => { if (ui.skipOpen === el.getAttribute('data-id')) ui.skipOpen = null; }, 250);
      });
    });
    root.querySelectorAll('.kanban-col[data-stage]').forEach((col) => {
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('is-drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('is-drop'));
      col.addEventListener('drop', (ev) => {
        ev.preventDefault();
        col.classList.remove('is-drop');
        const id = ev.dataTransfer.getData('text/plain');
        const stage = col.getAttribute('data-stage');
        if (!id || !stage) return;
        setStage(id, stage, 'Geser kartu ke ' + stageLabel(stage));
        save();
        render();
      });
    });
  }
  function bindKurDnD() {
    const root = $('main');
    if (!root || ui.role === 'asisten') return;
    root.querySelectorAll('[data-drag="sec"], [data-drag="lec"]').forEach((el) => {
      el.addEventListener('dragstart', (ev) => {
        const kind = el.getAttribute('data-drag');
        const id = el.getAttribute('data-id');
        ev.dataTransfer.setData('text/plain', kind + ':' + id);
        ev.dataTransfer.effectAllowed = 'move';
        el.classList.add('is-drag');
      });
      el.addEventListener('dragend', () => el.classList.remove('is-drag'));
    });
    const mark = (el, on) => { if (el) el.classList.toggle('is-drop', on); };
    root.querySelectorAll('.ud-sec, .kur-sec').forEach((sec) => {
      sec.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        mark(sec, true);
      });
      sec.addEventListener('dragleave', () => mark(sec, false));
      sec.addEventListener('drop', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        mark(sec, false);
        const raw = ev.dataTransfer.getData('text/plain') || '';
        const weekId = sec.getAttribute('data-sec');
        const lecEl = ev.target.closest('[data-lec-drop]');
        if (raw.indexOf('sec:') === 0) {
          const id = raw.slice(4);
          const to = db.weeks.findIndex((w) => w.id === weekId);
          if (id && to >= 0 && id !== weekId) {
            moveWeekTo(id, to);
            save();
            render();
          }
          return;
        }
        if (raw.indexOf('lec:') === 0) {
          const id = raw.slice(4);
          let idx = lecturesInWeek(weekId).length;
          if (lecEl) {
            const lid = lecEl.getAttribute('data-lec-drop');
            idx = lecturesInWeek(weekId).findIndex((x) => x.id === lid);
            if (idx < 0) idx = lecturesInWeek(weekId).length;
          }
          moveLecTo(id, weekId, idx);
          save();
          render();
        }
      });
    });
  }
  function openPerson(id) {
    closeDrawer();
    ui.personId = id;
    ui.hubBack = ui.siswaView || 'pipa';
    ui.mentorTab = 'orang';
    ui.personMidTab = 'timeline';
    ui.tagPickerId = null;
    ui.tagQuery = '';
    render();
    const s = people().find((x) => x.id === id);
    if (s && s.tiktok && !s.photoUrl && (syncEnabled() || !s.photoBlob)) {
      refreshPersonPhoto(id, false).then((ok) => { if (ok) render(); });
    }
  }
  function closePerson() {
    ui.personId = null;
    ui.mentorTab = 'siswa';
    ui.siswaView = ui.hubBack || ui.siswaView || 'pipa';
    ui.tagPickerId = null;
    ui.tagQuery = '';
    render();
  }
  function allKnownTags() {
    const seen = new Map();
    people().forEach((s) => {
      (s.tags || []).forEach((t) => {
        const raw = String(t || '').trim();
        if (!raw) return;
        const key = raw.toLowerCase();
        if (!seen.has(key)) seen.set(key, raw);
      });
    });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'id'));
  }
  function normalizeTag(t) {
    return String(t || '').trim().replace(/\s+/g, ' ');
  }
  function resolveTagLabel(tag) {
    const raw = normalizeTag(tag);
    if (!raw) return '';
    const known = allKnownTags().find((t) => t.toLowerCase() === raw.toLowerCase());
    return known || raw;
  }
  function applyPersonTag(id, tag) {
    const raw = resolveTagLabel(tag);
    if (!raw) return false;
    const s = people().find((x) => x.id === id);
    const tags = ((s && s.tags) || []).filter(Boolean).slice();
    if (tags.some((t) => t.toLowerCase() === raw.toLowerCase())) return false;
    tags.push(raw);
    patchPerson(id, { tags });
    return true;
  }
  function addPersonTag(id, tag) {
    if (!applyPersonTag(id, tag)) return false;
    save();
    return true;
  }
  function removePersonTag(id, tag) {
    const key = normalizeTag(tag).toLowerCase();
    const s = people().find((x) => x.id === id);
    const tags = ((s && s.tags) || []).filter((t) => String(t).toLowerCase() !== key);
    patchPerson(id, { tags });
    save();
  }
  function tagPickerListHtml(id) {
    const s = people().find((x) => x.id === id);
    const owned = new Set(((s && s.tags) || []).map((t) => String(t).toLowerCase()));
    const q = normalizeTag(ui.tagQuery);
    const qLower = q.toLowerCase();
    const suggestions = allKnownTags().filter((t) => {
      if (owned.has(t.toLowerCase())) return false;
      if (!qLower) return true;
      return t.toLowerCase().indexOf(qLower) >= 0;
    });
    const exactKnown = allKnownTags().some((t) => t.toLowerCase() === qLower);
    const canCreate = !!q && !owned.has(qLower) && !exactKnown;
    const opts = suggestions.map((t) =>
      '<button type="button" class="tag-picker-opt" data-act="tag-add" data-id="' + esc(id) + '" data-tag="' + esc(t) + '">' +
        '<span class="tag-chip">' + esc(t) + '</span><span class="muted">pakai</span></button>'
    ).join('');
    const create = canCreate
      ? '<button type="button" class="tag-picker-opt is-create" data-act="tag-add" data-id="' + esc(id) + '" data-tag="' + esc(q) + '">' +
          '<span class="tag-chip tag-chip-new">+ ' + esc(q) + '</span><span class="muted">tag baru</span></button>'
      : '';
    const empty = !opts && !create
      ? '<p class="muted tag-picker-empty">' +
          (q ? 'Tidak ada tag yang cocok.' : 'Belum ada tag lain. Ketik nama lalu Enter.') +
        '</p>'
      : '';
    return opts + create + empty;
  }
  function personTagsHtml(id) {
    const s = people().find((x) => x.id === id);
    const tags = ((s && s.tags) || []).filter(Boolean);
    const open = ui.tagPickerId === id;
    return '<dd class="fub-tags" id="fub-tags">' +
      tags.map((t) =>
        '<span class="tag-chip has-x">' + esc(t) +
          '<button type="button" class="tag-x" data-act="tag-remove" data-id="' + esc(id) +
            '" data-tag="' + esc(t) + '" aria-label="Hapus tag ' + esc(t) + '">×</button></span>'
      ).join('') +
      '<button type="button" class="tag-add-btn' + (open ? ' is-open' : '') +
        '" data-act="tag-toggle" data-id="' + esc(id) + '" aria-expanded="' + open +
        '" title="Tambah tag" aria-label="Tambah tag">+</button>' +
      (open
        ? '<div class="tag-picker" id="tag-picker">' +
            '<input class="tag-picker-in" data-act="tag-query" data-id="' + esc(id) +
              '" value="' + esc(ui.tagQuery || '') + '" placeholder="Cari tag atau buat baru…" autocomplete="off">' +
            '<div class="tag-picker-list" id="tag-picker-list">' + tagPickerListHtml(id) + '</div>' +
          '</div>'
        : '') +
    '</dd>';
  }
  function paintTagPickerList() {
    const list = document.getElementById('tag-picker-list');
    if (!list || !ui.tagPickerId) return;
    list.innerHTML = tagPickerListHtml(ui.tagPickerId);
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
    runAutomations();
    if (ui.present) ui.role = ui.presentPane === 'mentor' ? 'owner' : 'student';
    if (onStudentVanityPath()) {
      ui.role = 'student';
      ui.admin = false;
    }
    const mode = isStaff() ? 'mentor' : 'student';
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.plan = isStaff()
      ? 'mentor'
      : (canMentoring(ui.personaId) ? 'mentoring' : (canPreview(ui.personaId) ? 'trial' : (billingOf(ui.personaId).products.length ? 'sku' : 'none')));
    $('app').classList.toggle('is-mentor', isStaff());
    $('app').classList.toggle('is-student', !isStaff());
    $('app').classList.toggle('is-onboard', isOnboardScreen());
    $('app').classList.toggle('is-belajar', !isStaff() && ui.tab === 'belajar');
    $('app').classList.toggle('is-diskusi', isStaff() ? ui.mentorTab === 'diskusi' : ui.tab === 'diskusi');
    $('school-name').textContent = SEED.school.name;
    const logo = $('school-logo');
    if (logo) {
      logo.alt = SEED.school.name;
      const pLogo = schoolProfile();
      if (pLogo.photoBlob) {
        logo.setAttribute('data-blob', schoolPhotoKey());
        blobGet(schoolPhotoKey()).then((file) => {
          if (!file || !logo.isConnected) return;
          logo.src = URL.createObjectURL(file);
        });
      } else {
        logo.removeAttribute('data-blob');
        logo.src = SEED.school.photo || SEED.school.logo;
      }
    }
    const badge = document.querySelector('.off-badge');
    if (badge) {
      badge.textContent = ui.present ? 'Offline · demo' : schoolPublicPath().replace(/\/$/, '');
      badge.title = schoolPublicUrl();
    }
    const handleEl = $('school-handle');
    if (handleEl) {
      handleEl.textContent = schoolSlug();
      handleEl.href = schoolLocalUrl();
      handleEl.title = schoolPublicUrl();
    }
    $('role-switch').innerHTML =
      '<option value="student">Siswa</option>' +
      '<option value="owner">Mentor (Anton)</option>' +
      '<option value="asisten">Asisten (Lia)</option>';
    ui.chromeSync = true;
    $('role-switch').value = ui.role;
    const pers = $('persona-switch');
    const wantOpts = people().map((s) => {
      const seed = SEED.students.find((x) => x.id === s.id);
      const label = (s.id === 's-tamu' && seed)
        ? seed.name
        : (s.name + (s.kind === 'mentor' ? ' · mentor' : ''));
      return { id: s.id, label: label };
    });
    const curOpts = Array.from(pers.options).map((o) => o.value + '\0' + o.textContent).join('|');
    const nextOpts = wantOpts.map((o) => o.id + '\0' + o.label).join('|');
    if (curOpts !== nextOpts) {
      pers.innerHTML = wantOpts.map((o) =>
        '<option value="' + esc(o.id) + '">' + esc(o.label) + '</option>').join('');
    }
    pers.value = ui.personaId;
    pers.hidden = true;
    $('role-switch').hidden = true;
    ui.chromeSync = false;
    const searchWrap = $('topbar-search');
    if (searchWrap) {
      searchWrap.hidden = !isStaff();
      const inp = $('cari-siswa');
      if (inp && document.activeElement !== inp) inp.value = ui.cariSiswa || '';
      paintCariDrop();
    }
    const outBtn = $('btn-admin-out');
    if (outBtn) outBtn.hidden = !(ui.admin && syncEnabled());
    const menuProfil = $('btn-menu-profil');
    const menuAccount = $('btn-menu-account');
    const menuSiswa = $('btn-menu-siswa-view');
    if (menuProfil) {
      menuProfil.hidden = false;
      const label = canBill() ? 'Profile' : 'View profile';
      const textNode = Array.from(menuProfil.childNodes).find((n) => n.nodeType === 3 && String(n.textContent || '').trim());
      if (textNode) textNode.textContent = ' ' + label;
      else {
        const span = menuProfil.querySelector('.brand-menu-label');
        if (span) span.textContent = label;
      }
    }
    if (menuAccount) menuAccount.hidden = !canBill() || isSiswaReadonly();
    if (menuSiswa) menuSiswa.hidden = !canBill() || isSiswaReadonly();
    const brandBtn = $('brand-btn');
    if (brandBtn) {
      brandBtn.disabled = isSiswaReadonly();
      brandBtn.setAttribute('aria-label', isSiswaReadonly() ? 'Siswa view' : 'Profile menu');
      brandBtn.title = isSiswaReadonly() ? 'Siswa view (read-only)' : 'Profile menu';
    }
    const headerEl = $('school-header');
    if (headerEl) {
      const prof = schoolProfile();
      const show = !!(prof.headline || '').trim();
      headerEl.hidden = !show;
      headerEl.textContent = show ? String(prof.headline).trim() : '';
    }
    if (!isStaff()) {
      const allowed = studentTabs().map((t) => t.id).concat(['sku', 'alat', 'daftar', 'tes', 'sertifikat', 'diskusi', 'profil']);
      if (needsWizard(ui.personaId) && ui.tab !== 'daftar') ui.tab = 'daftar';
      if (allowed.indexOf(ui.tab) === -1) ui.tab = 'home';
    }
    renderTabs();
  }

  function studentTabs() {
    if (diskusiVisible(ui.personaId)) {
      const base = canMentoring(ui.personaId) || canPreview(ui.personaId)
        ? [
          { id: 'home', label: 'Home' },
          { id: 'belajar', label: 'Belajar' },
          { id: 'alat', label: 'Alat' },
          { id: 'progres', label: 'Progres' }
        ]
        : [
          { id: 'home', label: 'Home' },
          { id: 'alat', label: 'Alat' },
          { id: 'progres', label: 'Progres' }
        ];
      base.push({ id: 'diskusi', label: 'Diskusi' });
      return base;
    }
    if (canPreview(ui.personaId)) {
      return [
        { id: 'home', label: 'Home' },
        { id: 'belajar', label: 'Belajar' },
        { id: 'alat', label: 'Alat' },
        { id: 'progres', label: 'Progres' }
      ];
    }
    return [
      { id: 'home', label: 'Home' },
      { id: 'alat', label: 'Alat' },
      { id: 'progres', label: 'Progres' }
    ];
  }
  function mentorTabs() {
    const t = [
      { id: 'dash', label: 'Dashboard' },
      { id: 'siswa', label: 'Students' },
      { id: 'kurikulum', label: 'Kurikulum' },
      { id: 'otomasi', label: 'Otomasi' },
      { id: 'pustaka', label: 'Perpustakaan' },
      { id: 'jadwal', label: 'Jadwal' },
      { id: 'diskusi', label: 'Diskusi' }
    ];
    if (canBill()) t.push({ id: 'harga', label: 'Pengaturan bayar' });
    return t;
  }

  function renderTabs() {
    const items = isStaff() ? mentorTabs() : studentTabs();
    const cur = isStaff() ? (ui.mentorTab === 'orang' ? 'siswa' : ui.mentorTab) : ui.tab;
    $('tabs').innerHTML = items.map((t) =>
      '<button type="button" role="tab" data-act="tab" data-id="' + t.id + '" aria-selected="' +
      (t.id === cur) + '">' + esc(t.label) + '</button>'
    ).join('');
    const dock = $('dock');
    if (!isStaff()) {
      const tabs = studentTabs();
      if (isOnboardScreen()) {
        dock.hidden = true;
        dock.className = 'dock';
        dock.innerHTML = '';
      } else {
        dock.hidden = false;
        dock.className = 'dock cols-' + tabs.length;
        dock.innerHTML = tabs.map((t) =>
          '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' +
          (t.id === ui.tab || (ui.tab === 'sku' && t.id === 'alat')) + '">' +
          dockIcon(t.id) + '<span>' + esc(t.label) + '</span></button>'
        ).join('');
      }
    } else {
      dock.hidden = true;
      dock.className = 'dock';
    }
  }

  let diskusiAckLock = false;
  function captureDiskusiScroll() {
    if (ui.diskusiScroll === 'jump' || ui.diskusiScroll === 'unread' || ui.diskusiScrollHold) return;
    const feed = document.querySelector('.dk-feed');
    if (!feed) {
      const onDiskusi = (isStaff() && ui.mentorTab === 'diskusi') || (!isStaff() && ui.tab === 'diskusi');
      const batch = onDiskusi && ui.diskusiSub !== 'tanya' ? activeDiskusiBatch() : '';
      ui.diskusiScroll = batch && unreadCount(batch) ? 'unread' : (ui.diskusiScroll || 'bottom');
      return;
    }
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    ui.diskusiScroll = (ui.diskusiScroll === 'bottom' || nearBottom) ? 'bottom' : String(feed.scrollTop);
  }
  function afterDiskusiRender() {
    const feed = document.querySelector('.dk-feed');
    const scrollMode = ui.diskusiScroll;
    if (feed && scrollMode === 'jump' && ui.unreadJump) {
      ui.diskusiPinUnread = false;
      scrollFeedTo(document.getElementById(ui.unreadJump));
    } else if (feed && scrollMode === 'unread') {
      const el = feed.querySelector('.dk-unread-line') || feed.querySelector('[data-unread="1"]');
      ui.diskusiPinUnread = true;
      if (el) scrollFeedTo(el);
      else feed.scrollTop = feed.scrollHeight;
      const restick = () => {
        if (!ui.diskusiPinUnread) return;
        const target = document.querySelector('.dk-unread-line') || document.querySelector('[data-unread="1"]');
        if (target) scrollFeedTo(target);
      };
      feed.querySelectorAll('img').forEach((img) => {
        if (!img.complete) img.addEventListener('load', restick, { once: true });
      });
      setTimeout(restick, 80);
    } else if (feed && scrollMode) {
      feed.scrollTop = scrollMode === 'bottom' ? feed.scrollHeight : Number(scrollMode) || 0;
    }
    ui.diskusiScroll = '';
    ui.unreadJump = '';
    if (ui.chatPeopleFocus) {
      const q = document.querySelector('[data-act="chat-people-q"]');
      if (q) {
        q.focus();
        const n = q.value.length;
        try { q.setSelectionRange(n, n); } catch (err) { /* search input */ }
      }
      ui.chatPeopleFocus = false;
    }
    if (ui.pollFocus) {
      const el = document.querySelector(ui.pollFocus);
      if (el) {
        el.focus();
        const n = el.value.length;
        try { el.setSelectionRange(n, n); } catch (err) { /* poll field */ }
      }
      ui.pollFocus = '';
    }
    if (ui.commentFocus) {
      const form = document.querySelector('.dk-comment-form[data-id="' + String(ui.commentFocus).replace(/"/g, '') + '"] input[name="body"]');
      if (form) {
        form.focus();
        const n = form.value.length;
        try { form.setSelectionRange(n, n); } catch (err) { /* comment field */ }
      }
      ui.commentFocus = '';
    }
    if (feed && !feed._unreadBound) {
      feed._unreadBound = true;
      feed.addEventListener('scroll', () => {
        if (ui._unreadScrollTimer) clearTimeout(ui._unreadScrollTimer);
        ui._unreadScrollTimer = setTimeout(() => {
          if (Date.now() < (ui.diskusiScrollSilentUntil || 0) || diskusiAckLock || !acknowledgeUnread()) return;
          diskusiAckLock = true;
          ui.diskusiScrollHold = true;
          ui.diskusiScroll = String(feed.scrollTop);
          render();
          ui.diskusiScrollHold = false;
          diskusiAckLock = false;
        }, 120);
      }, { passive: true });
    }
  }

  function render() {
    captureDiskusiScroll();
    fillChrome();
    const main = $('main');
    if (isStaff()) {
      const tab = normalizeMentorTab(ui.mentorTab);
      ui.mentorTab = tab;
      if (tab === 'dash') main.innerHTML = viewDashboard();
      else if (tab === 'siswa') main.innerHTML = viewSiswaHub();
      else if (tab === 'orang') main.innerHTML = viewPerson(ui.personId);
      else if (tab === 'tugas') main.innerHTML = viewTugas();
      else if (tab === 'otomasi') main.innerHTML = viewOtomasi();
      else if (tab === 'kurikulum') main.innerHTML = viewKurikulum();
      else if (tab === 'pustaka') main.innerHTML = viewPustaka();
      else if (tab === 'jadwal') main.innerHTML = viewJadwal(true);
      else if (tab === 'diskusi') main.innerHTML = viewDiskusi(true);
      else if (tab === 'harga' && canBill()) main.innerHTML = viewHarga();
      else if (tab === 'profil' && canBill()) main.innerHTML = viewProfilEdit();
      else if (tab === 'account' && canBill()) main.innerHTML = viewAccountSettings();
      else if (tab === 'admin' && ui.admin) main.innerHTML = viewAdmin();
      else main.innerHTML = viewSiswaHub();
    } else {
      if (needsWizard(ui.personaId) || ui.tab === 'daftar') {
        main.innerHTML = viewWizard();
      } else {
        const tab = ui.tab;
        if (tab === 'home') main.innerHTML = viewHome();
        else if (tab === 'belajar') main.innerHTML = viewBelajar();
        else if (tab === 'alat') main.innerHTML = viewAlat();
        else if (tab === 'sku') main.innerHTML = viewSkuPage();
        else if (tab === 'progres') main.innerHTML = viewProgres();
        else if (tab === 'diskusi') main.innerHTML = diskusiVisible(ui.personaId) ? viewDiskusiFeed(false) : viewLockedDiskusi();
        else if (tab === 'kolab') main.innerHTML = viewKolab();
        else if (tab === 'tes') main.innerHTML = viewExam();
        else if (tab === 'sertifikat') main.innerHTML = viewSertifikat(ui.personaId);
        else if (tab === 'profil') main.innerHTML = viewSchoolPublic({ student: true });
        else main.innerHTML = viewHome();
      }
    }
    paintProfilePreview();
    paintOnboardPreview();
    bindLazy();
    bindBlobMedia();
    mountLightbox();
    bindKanbanDnD();
    bindPipaStageDnD();
    bindKurDnD();
    bindNativeTools();
    focusWiz();
    placeWaFab();
    tickRemainers();
    ensureRemainTimer();
    paintDaftarSelAll();
    if (isStaff() && ui.mentorTab === 'orang' && ui.composeMode === 'wa') {
      requestAnimationFrame(scrollWaThread);
    }
    afterDiskusiRender();
  }
  function paintDaftarSelAll() {
    const el = document.querySelector('[data-act="daftar-sel-all"]');
    if (!el) return;
    el.indeterminate = el.getAttribute('data-indeterminate') === '1';
  }

  function bindNativeTools() {
    const root = document.getElementById('calc-tool');
    if (!root) return;
    const EXAMPLE_SET = {
      'calc-sku': 'Jepit rambut satin isi 6',
      'calc-modal': 60000, 'calc-margin': 20,
      'calc-fee-admin': 8, 'calc-fee-ongkir': 4, 'calc-fee-cashback': 1.5, 'calc-fee-voucher': 2,
      'calc-fee-aff': 6, 'calc-fee-ads': 10, 'calc-fee-pajak': 0.5
    };
    const EXAMPLE_TOKO = {
      'calc-prod': 52000, 'calc-pack': 8000, 'calc-jual': 84507,
      'calc-t-fee': 6, 'calc-t-ongkir': 1.5, 'calc-t-cash': 2, 'calc-t-voucher': 10,
      'calc-t-ads': 10, 'calc-t-aff': 0, 'calc-t-host': 0, 'calc-t-kreator': 0,
      'calc-t-admin': 0, 'calc-t-gaji': 0, 'calc-t-lain': 0, 'calc-t-pajak': 0.5
    };
    const num = (id) => {
      const el = $(id);
      if (!el || el.value === '' || el.value == null) return null;
      return +el.value;
    };
    const n0 = (id) => num(id) || 0;
    const pct = (n) => (n == null || !isFinite(n)) ? '—' : ((Math.round(n * 10) / 10).toLocaleString('id-ID') + '%');
    const line = (label, a, b) => '<div class="line"><span>' + label + '</span><strong>' + a +
      (b ? ' <span class="muted">' + b + '</span>' : '') + '</strong></div>';
    const cards = (items) => items.map((c, i) =>
      '<div class="calc-price' + (i === 0 ? ' main' : '') + '"><span>' + c.label + '</span><strong>' + c.value + '</strong></div>'
    ).join('');
    function fill(map) {
      Object.keys(map).forEach((k) => { const el = $(k); if (el) el.value = map[k]; });
    }
    function setData() {
      const modal = num('calc-modal');
      const margin = num('calc-margin');
      if (modal == null || margin == null || margin >= 100) return { ok: false };
      const net = modal / (1 - margin / 100);
      const fees = [
        ['Admin TikTok', n0('calc-fee-admin')],
        ['Bebas ongkir', n0('calc-fee-ongkir')],
        ['Cashback bonus', n0('calc-fee-cashback')],
        ['Voucher extra', n0('calc-fee-voucher')],
        ['Komisi affiliate', n0('calc-fee-aff')],
        ['Biaya ads', n0('calc-fee-ads')],
        ['Pajak UMKM', n0('calc-fee-pajak')]
      ];
      const totalPct = fees.reduce((s, f) => s + f[1], 0);
      const denom = 1 - totalPct / 100;
      const promo = denom > 0 ? net / denom : null;
      return {
        ok: true, modal, margin, net, fees, totalPct,
        promo, coret: promo != null ? promo / 0.9 : null, awal: promo != null ? promo * 2 : null
      };
    }
    function tokoData() {
      const prod = num('calc-prod');
      const pack = n0('calc-pack');
      const jual = num('calc-jual');
      if (prod == null || jual == null || jual <= 0) return { ok: false };
      const modalBarang = prod + pack;
      const hpp = modalBarang / jual * 100;
      const pctFees = n0('calc-t-fee') + n0('calc-t-ongkir') + n0('calc-t-cash') + n0('calc-t-voucher') +
        n0('calc-t-ads') + n0('calc-t-aff') + n0('calc-t-pajak');
      const feeRp = jual * pctFees / 100;
      const tetap = n0('calc-t-host') + n0('calc-t-kreator') + n0('calc-t-admin') + n0('calc-t-gaji') + n0('calc-t-lain');
      const totCost = modalBarang + feeRp + tetap;
      const marginRp = jual - totCost;
      return {
        ok: true, prod, pack, jual, modalBarang, hpp, pctFees, feeRp, tetap, totCost, marginRp,
        marginPct: marginRp / jual * 100
      };
    }
    function renderSet() {
      const d = setData();
      if (!d.ok) {
        $('calc-net-line').textContent = 'Isi modal & sisa, atau Pakai contoh.';
        $('calc-prices-set').innerHTML = '';
        $('calc-fee-sum').textContent = '—';
        $('calc-out-set').innerHTML = '<div class="calc-empty">Dua kotak kuning di atas dulu. Potongan TikTok bisa diubah di bawah.</div>';
        return d;
      }
      $('calc-net-line').innerHTML = 'Supaya sisa ' + pct(d.margin) + ' dari modal ' + fmtRp(d.modal) +
        ', yang harus masuk kas = <strong>' + fmtRp(d.net) + '</strong>';
      $('calc-fee-sum').textContent = pct(d.totalPct);
      $('calc-prices-set').innerHTML = cards([
        { label: 'Harga promo', value: fmtRp(d.promo) },
        { label: 'Harga coret', value: fmtRp(d.coret) },
        { label: 'Harga awal', value: fmtRp(d.awal) }
      ]);
      $('calc-out-set').innerHTML =
        d.fees.map((f) => line(f[0], pct(f[1]), d.promo != null ? fmtRp(d.promo * f[1] / 100) : '')).join('') +
        '<div class="line hl"><span>Total potongan</span><strong>' + pct(d.totalPct) + '</strong></div>' +
        '<p class="muted" style="margin:10px 0 0">Coret = promo / 0,9. Awal = 2 × promo. Perkiraan.</p>';
      return d;
    }
    function renderToko() {
      const d = tokoData();
      if (!d.ok) {
        $('calc-prices-toko').innerHTML = '';
        $('calc-toko-sum').textContent = '—';
        $('calc-out-toko').innerHTML = '<div class="calc-empty">Isi produksi + harga jual, atau Pakai contoh.</div>';
        return d;
      }
      $('calc-toko-sum').textContent = fmtRp(d.totCost);
      $('calc-prices-toko').innerHTML = cards([
        { label: 'Sisa / unit', value: fmtRp(d.marginRp) },
        { label: 'Margin', value: pct(d.marginPct) },
        { label: 'Tot cost', value: fmtRp(d.totCost) }
      ]);
      $('calc-out-toko').innerHTML =
        line('Total modal barang', fmtRp(d.modalBarang), fmtRp(d.prod) + ' + packing') +
        line('HPP', pct(d.hpp), fmtRp(d.modalBarang) + ' / harga jual') +
        line('Potongan % toko', pct(d.pctFees), fmtRp(d.feeRp)) +
        line('Biaya tetap', fmtRp(d.tetap), '') +
        '<p class="muted" style="margin:10px 0 0">Perkiraan unit economics. Bukan laporan pajak UMKM.</p>';
      return d;
    }
    function run() { renderSet(); renderToko(); }
    function printHtml() {
      const sku = (($('calc-sku') && $('calc-sku').value) || 'SKU').replace(/</g, '');
      const s = setData();
      const t = tokoData();
      const when = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
      let body = '<h1 style="margin:0 0 4px">Kalkulator harga TikTok Shop</h1>' +
        '<p style="margin:0 0 16px;color:#555;font-size:13px">Obrolan Marketing · ' + sku + ' · ' + when + '</p>';
      body += '<h2 style="font-size:15px">Harga jual</h2>';
      if (s.ok) {
        body += '<p>Modal ' + fmtRp(s.modal) + ' · sisa ' + pct(s.margin) + ' · net ke kas ' + fmtRp(s.net) + '</p>' +
          '<p><strong>Promo ' + fmtRp(s.promo) + '</strong> · coret ' + fmtRp(s.coret) + ' · awal ' + fmtRp(s.awal) + '</p>' +
          '<p>Total potongan ' + pct(s.totalPct) + '</p>';
      } else body += '<p>Belum diisi.</p>';
      body += '<h2 style="font-size:15px;margin-top:18px">Toko / HPP</h2>';
      if (t.ok) {
        body += '<p>Harga jual ' + fmtRp(t.jual) + ' · tot cost ' + fmtRp(t.totCost) + '</p>' +
          '<p><strong>Sisa ' + fmtRp(t.marginRp) + ' (' + pct(t.marginPct) + ')</strong> · HPP ' + pct(t.hpp) + '</p>';
      } else body += '<p>Belum diisi.</p>';
      body += '<p style="margin-top:24px;color:#555;font-size:12px">Perkiraan. Bukan laporan pajak.</p>';
      return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + sku + ' — harga</title>' +
        '<style>body{font-family:system-ui,sans-serif;color:#111;padding:18px;max-width:640px}</style></head><body>' +
        body + '</body></html>';
    }
    root.__calc = {
      run,
      contoh() { fill(EXAMPLE_SET); fill(EXAMPLE_TOKO); run(); },
      kosong() {
        root.querySelectorAll('input').forEach((i) => { i.value = ''; });
        if ($('calc-sku')) $('calc-sku').value = '';
        run();
      },
      pdf() {
        try {
          const w = window.open('', 'harga-pdf');
          if (w) {
            w.document.open();
            w.document.write(printHtml());
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); }, 250);
            return;
          }
        } catch (err) { /* popup blocked */ }
        window.print();
      },
      tab(pane) {
        const setOn = pane === 'set';
        root.querySelectorAll('.calc-tabs button').forEach((b) => {
          b.classList.toggle('on', b.getAttribute('data-pane') === pane);
        });
        $('calc-pane-set').hidden = !setOn;
        $('calc-pane-toko').hidden = setOn;
      }
    };
    root.querySelectorAll('input').forEach((i) => i.addEventListener('input', run));
    fill(EXAMPLE_SET);
    fill(EXAMPLE_TOKO);
    run();
  }

  function focusWiz() {
    if (isStaff() || !isOnboardScreen()) return;
    const step = wizIdx();
    if (ui.wizFocusedStep === step) return;
    const el = document.querySelector('.ob-input[data-focus="1"]');
    if (!el) {
      ui.wizFocusedStep = step;
      return;
    }
    ui.wizFocusedStep = step;
    requestAnimationFrame(() => {
      if (ui.wizFocusedStep !== step) return;
      el.focus({ preventScroll: true });
      if (typeof el.setSelectionRange === 'function') {
        const n = (el.value || '').length;
        try { el.setSelectionRange(n, n); } catch (err) { /* type=tel */ }
      }
    });
  }

  function normalizeMentorTab(tab) {
    if (tab === 'crm') {
      ui.siswaView = ui.siswaView || 'pipa';
      return 'siswa';
    }
    if (tab === 'progres') {
      ui.siswaView = 'progres';
      return 'siswa';
    }
    if (tab === 'orang' && !ui.personId) return 'siswa';
    if (tab === 'waq') return 'tugas';
    if (tab === 'jaringan') return 'siswa';
    if (tab === 'bayar') {
      ui.siswaView = 'daftar';
      return 'siswa';
    }
    return tab || 'siswa';
  }

  function bindLazy() {
    $('main').querySelectorAll('[data-embed]').forEach((el) => {
      el.addEventListener('click', () => {
        const watchLec = el.getAttribute('data-watch-lec');
        const videoId = el.getAttribute('data-yt-id');
        if (watchLec && videoId) {
          const hostId = 'yt-watch-' + watchLec + '-' + Date.now();
          el.outerHTML = '<div class="yt-watch-host" id="' + hostId + '"></div>';
          mountYtWatchPlayer(hostId, videoId, watchLec);
          return;
        }
        const src = el.getAttribute('data-embed');
        if (!src) return;
        el.outerHTML = '<iframe src="' + esc(src) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Video materi"></iframe>';
      });
    });
  }

  function bindBlobMedia() {
    $('main').querySelectorAll('video[data-blob], img[data-blob]').forEach((el) => {
      const id = el.getAttribute('data-blob');
      blobGet(id).then((file) => {
        if (!file || !el.isConnected) return;
        el.src = URL.createObjectURL(file);
      });
    });
    $('main').querySelectorAll('a[data-blob-href]').forEach((el) => {
      const id = el.getAttribute('data-blob-href');
      blobGet(id).then((file) => {
        if (!file || !el.isConnected) return;
        el.href = URL.createObjectURL(file);
        if (file.name) el.setAttribute('download', file.name);
      });
    });
    bindWatchProgress();
  }

  /* ── student views ───────────────────────────────────────────────── */
  function pendingBanner(sid) {
    const b = billingOf(sid);
    if (b.source === 'mayar') {
      return '<section class="card trial-cta pending-cta">' +
        '<p class="trial-kicker">Menunggu pembayaran Mayar</p>' +
        '<h3>' + fmtRp(b.pendingAmount || b.amount || 0) + ' · ' + esc(termLabel(b.pendingTerm || b.term)) + '</h3>' +
        '<p class="muted">Akses mentoring kebuka otomatis setelah pembayaran masuk. Video 1 tetap kebuka.</p>' +
        (b.mayarLink
          ? '<div class="row" style="margin-top:10px"><a class="btn" href="' + esc(b.mayarLink) + '" target="_blank" rel="noopener">Buka halaman bayar</a></div>'
          : '') +
        '</section>';
    }
    return '<section class="card trial-cta pending-cta">' +
      '<p class="trial-kicker">Menunggu konfirmasi Anton</p>' +
      '<h3>Transfer ' + fmtRp(b.pendingAmount || b.amount || 0) + ' sudah dicatat</h3>' +
      '<p class="muted">Akses mentoring kebuka setelah Anton konfirmasi di CRM. Video 1 tetap kebuka.</p>' +
      '</section>';
  }
  function offerBanner(sid) {
    if (isPending(sid)) return pendingBanner(sid);
    const b = billingOf(sid);
    const exp = b.offerExpiresAt;
    const open = welcomeOpen(sid);
    const left = exp ? fmtRemain(exp) : '—';
    return '<section class="card trial-cta">' +
      '<p class="trial-kicker">Mentoring belum aktif</p>' +
      '<h3>Buka semua 12 video + live + alat −' + toolDiscountPct() + '%</h3>' +
      (open
        ? '<p class="trial-count">Diskon 24 jam · sisa <strong data-remain="' + esc(exp) + '">' + esc(left) + '</strong></p>' +
          '<p class="muted">Jam nyata dari form. Bukan sisa kursi.</p>'
        : '<p class="muted">Jendela diskon 24 jam sudah habis. Harga program tetap jujur di halaman bayar.</p>') +
      '<p class="trial-prices">1 bln ' + fmtRp(priceForTerm('month', open)) +
      ' · 3 bln ' + fmtRp(priceForTerm('quarter', false)) +
      ' · 6 bln ' + fmtRp(priceForTerm('half', false)) + '</p>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button>' +
        '<button class="btn secondary" data-act="tab" data-id="belajar">Lanjut video 1</button>' +
      '</div></section>';
  }
  function waAntonFab() {
    if (isStaff()) return '';
    if (isOnboardScreen()) return '';
    if (canMentoring(ui.personaId)) return '';
    const s = student();
    const text = 'Halo Anton, saya ' + (s.name || 'siswa') + ' dari MasterMind with Anton GC.';
    return '<a class="wa-fab" href="' + esc(waLink(ownerWa(), text)) + '" aria-label="WhatsApp Anton">' +
      '<span class="wa-fab-ico" aria-hidden="true">' + waFabIcon() + '</span>' +
      '<span>WA Anton</span></a>';
  }
  function placeWaFab() {
    let host = document.getElementById('wa-fab-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'wa-fab-host';
      ($('app') || document.body).appendChild(host);
    }
    host.innerHTML = waAntonFab();
  }
  function tickRemainers() {
    document.querySelectorAll('[data-remain]').forEach((el) => {
      el.textContent = fmtRemain(el.getAttribute('data-remain'));
    });
  }
  function ensureRemainTimer() {
    if (window.__antonRemainTimer) return;
    window.__antonRemainTimer = setInterval(tickRemainers, 15000);
  }
  function waFabIcon() {
    return '<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M16.01 3C9.39 3 4 8.3 4 14.8c0 2.1.56 4.1 1.62 5.88L4 29l8.53-2.2A12.3 12.3 0 0 0 16 26.6c6.62 0 12-5.3 12-11.8C28 8.3 22.63 3 16.01 3zm6.9 16.7c-.29.8-1.67 1.47-2.34 1.56-.6.08-1.36.12-2.2-.13-.5-.16-1.15-.34-1.98-.67-3.48-1.5-5.74-4.98-5.91-5.21-.17-.24-1.4-1.86-1.4-3.55 0-1.69.89-2.52 1.2-2.86.32-.34.7-.43.93-.43h.68c.22 0 .5-.05.78.6.29.68.99 2.4 1.08 2.58.09.17.14.38.03.6-.12.24-.18.38-.35.59-.17.2-.36.45-.51.6-.17.17-.35.36-.15.7.2.34.9 1.48 1.93 2.4 1.33 1.18 2.45 1.55 2.8 1.72.34.17.54.14.74-.09.2-.22.84-.98 1.07-1.31.22-.34.45-.28.76-.17.31.12 1.97.93 2.3 1.1.34.17.56.26.64.4.09.14.09.82-.2 1.62z"/></svg>';
  }
  function dualCta(p, extraClass) {
    const sid = ui.personaId;
    const owned = canSku(sid, p.id);
    if (owned) {
      return '<button class="btn" data-act="open-sku" data-from="' + (extraClass || 'alat') + '" data-id="' + esc(p.id) + '">Buka</button>';
    }
    if (canMentoring(sid) && bundled(p)) {
      return '<button class="btn" data-act="claim-tool" data-from="' + (extraClass || 'alat') + '" data-id="' + esc(p.id) + '">Ambil −' + toolDiscountPct() + '%</button>' +
        '<a class="btn secondary" href="' + esc(p.lynk || SEED.school.lynk) + '" target="_blank" rel="noopener">Harga satuan</a>';
    }
    const mentorLine = bundled(p)
      ? '<button class="btn secondary" data-act="tab" data-id="daftar">Ikut mentoring, −' + toolDiscountPct() + '% alat</button>'
      : '<span class="muted">Tidak termasuk mentoring. Harga satuan.</span>';
    return '<a class="btn" href="' + esc(p.lynk || SEED.school.lynk) + '" target="_blank" rel="noopener">Beli satuan</a>' + mentorLine +
      '<button class="btn secondary" data-act="contoh-sku" data-from="' + (extraClass || 'alat') + '" data-id="' + esc(p.id) + '">Lihat contoh</button>';
  }
  function obChrome(step, opts) {
    const o = opts || {};
    const total = o.total != null ? o.total : wizTotalSteps();
    const back = step > 0
      ? '<button type="button" class="ob-back" data-act="wiz-back" aria-label="Kembali">‹</button>'
      : '<span class="ob-back is-ghost" aria-hidden="true"></span>';
    let segs = '';
    for (let i = 0; i < total; i += 1) {
      segs += '<i' + (i <= step ? ' class="is-on"' : '') + '></i>';
    }
    return '<header class="ob-top">' + back +
      '<div class="ob-segs" role="progressbar" aria-valuemin="1" aria-valuemax="' + total +
      '" aria-valuenow="' + (step + 1) + '" aria-label="Langkah ' + (step + 1) + ' dari ' + total + '">' +
      segs + '</div></header>';
  }
  function obWrap(step, inner, foot, pay, opts) {
    return '<section class="ob-flow' + (pay ? ' is-pay' : '') + '">' + obChrome(step, opts) +
      '<div class="ob-body">' + inner + '</div>' +
      '<div class="ob-foot' + (pay ? ' is-end' : '') + '">' + foot + '</div></section>';
  }
  function viewWizard() {
    const step = wizIdx();
    const payAt = wizPayIdx();
    const wantPay = step >= payAt || (wizardStep(ui.personaId) === 'pay' && ui.wizStep == null);
    if (wantPay) {
      if (!db.applications[ui.personaId]) {
        const lastForm = Math.max(0, payAt - 1);
        ui.wizStep = Math.min(typeof ui.wizStep === 'number' ? ui.wizStep : lastForm, lastForm);
        if (ui.wizStep >= payAt) ui.wizStep = lastForm;
        ui.wizFocusedStep = null;
        return viewWizForm(ui.wizStep);
      }
      return viewPayPage(ui.personaId);
    }
    return viewWizForm(step);
  }
  function renderObField(field, d, focusOnce) {
    const key = obStoreId(field);
    const label = field.label
      ? '<label class="ob-field-label">' + esc(field.label) + (field.required ? '' : ' <em class="muted">(opsional)</em>') + '</label>'
      : '';
    if (field.type === 'name') {
      return label + '<div class="ob-name-row">' +
        '<input class="ob-input"' + (focusOnce ? ' data-focus="1"' : '') +
          ' name="firstName" maxlength="40" autocomplete="given-name" value="' +
          esc(d.firstName || '') + '" placeholder="Nama depan">' +
        '<input class="ob-input" name="lastName" maxlength="40" autocomplete="family-name" value="' +
          esc(d.lastName || '') + '" placeholder="Nama belakang">' +
        '</div>';
    }
    if (field.type === 'wa') {
      return label + '<input class="ob-input"' + (focusOnce ? ' data-focus="1"' : '') +
        ' name="wa" type="tel" inputmode="numeric" autocomplete="tel" value="' +
        esc(d.wa || '') + '" placeholder="' + esc(field.placeholder || '08… atau 628…') + '">';
    }
    if (field.type === 'city') {
      return label + '<input class="ob-input"' + (focusOnce ? ' data-focus="1"' : '') +
        ' name="city" maxlength="60" autocomplete="address-level2" value="' +
        esc(d.city || '') + '" placeholder="' + esc(field.placeholder || 'Kota') + '">';
    }
    if (field.type === 'shop') {
      return label + '<div class="ob-pills" role="group" aria-label="Sudah punya toko">' +
        '<button type="button" class="ob-pill' + (d.shopPick === 'tidak' ? ' is-on' : '') +
          '" data-act="wiz-shop" data-id="tidak">Belum, masih mau mulai</button>' +
        '<button type="button" class="ob-pill' + (d.shopPick === 'ya' ? ' is-on' : '') +
          '" data-act="wiz-shop" data-id="ya">Sudah punya toko</button>' +
        '</div>' +
        (d.shopPick === 'ya'
          ? '<div class="ob-extra">' +
            '<input class="ob-input"' + (focusOnce ? ' data-focus="1"' : '') +
              ' name="shopName" maxlength="80" value="' + esc(d.shopName || '') + '" placeholder="Nama toko">' +
            '<input class="ob-input" name="shopUrl" inputmode="url" autocomplete="url" value="' +
              esc(d.shopUrl || '') + '" placeholder="https://…">' +
            '</div>'
          : '');
    }
    if (field.type === 'link') {
      return label + '<input class="ob-input"' + (focusOnce ? ' data-focus="1"' : '') +
        ' data-ob-ans="' + esc(key) + '" inputmode="url" autocomplete="url" value="' +
        esc((d.answers && d.answers[key]) || '') + '" placeholder="' + esc(field.placeholder || 'https://…') + '">';
    }
    if (field.type === 'textarea') {
      return label + '<textarea class="ob-input ob-textarea"' + (focusOnce ? ' data-focus="1"' : '') +
        ' data-ob-ans="' + esc(key) + '" rows="3" maxlength="500" placeholder="' +
        esc(field.placeholder || '') + '">' + esc((d.answers && d.answers[key]) || '') + '</textarea>';
    }
    if (field.type === 'single') {
      const opts = (field.options || []).slice();
      if (field.allowOther && opts.indexOf('Lainnya') < 0) opts.push('Lainnya');
      const pick = (d.picks && d.picks[key]) || '';
      return label + '<div class="ob-pills" role="group">' +
        opts.map((opt) =>
          '<button type="button" class="ob-pill' + (pick === opt ? ' is-on' : '') +
          '" data-act="ob-single" data-key="' + esc(key) + '" data-id="' + esc(opt) + '">' + esc(opt) + '</button>'
        ).join('') + '</div>' +
        (field.allowOther && pick === 'Lainnya'
          ? '<input class="ob-input ob-extra"' + (focusOnce ? ' data-focus="1"' : '') +
            ' data-ob-other="' + esc(key) + '" maxlength="120" value="' +
            esc((d.others && d.others[key]) || '') + '" placeholder="Lainnya, singkat saja">'
          : '');
    }
    if (field.type === 'multi') {
      const picked = Array.isArray(d.picks && d.picks[key]) ? d.picks[key] : [];
      return label + '<div class="ob-pills" role="group">' +
        (field.options || []).map((opt) =>
          '<button type="button" class="ob-pill' + (picked.indexOf(opt) >= 0 ? ' is-on' : '') +
          '" data-act="ob-multi" data-key="' + esc(key) + '" data-id="' + esc(opt) + '">' + esc(opt) + '</button>'
        ).join('') + '</div>';
    }
    // text default
    return label + '<input class="ob-input"' + (focusOnce ? ' data-focus="1"' : '') +
      ' data-ob-ans="' + esc(key) + '" maxlength="120" value="' +
      esc((d.answers && d.answers[key]) || '') + '" placeholder="' + esc(field.placeholder || '') + '">';
  }
  function viewWizForm(step) {
    const pages = wizFormPages();
    const spec = pages[step] || pages[0];
    const d = wizDraft();
    const last = step >= pages.length - 1;
    const preview = isOnboardPreview();
    let focused = false;
    const fields = (spec.fields || []).map((f) => {
      const html = renderObField(f, d, !focused);
      focused = true;
      return '<div class="ob-field">' + html + '</div>';
    }).join('');
    const cta = preview
      ? (last ? 'Selesai preview' : 'Lanjut')
      : (last ? 'Lihat paket' : 'Lanjut');
    return obWrap(step,
      '<p class="ob-kicker">' + esc(spec.kicker || '') + '</p>' +
      '<h1 class="ob-q">' + esc(spec.q || '') + '</h1>' +
      (spec.sub ? '<p class="ob-sub">' + esc(spec.sub) + '</p>' : '') +
      '<form id="ob-form" data-act="wiz-next">' + fields + '</form>',
      '<button class="btn ob-cta" type="button" data-act="wiz-next">' + cta + '</button>',
      false,
      { total: preview ? pages.length : wizTotalSteps() }
    );
  }
  function viewPayPage(sid) {
    const b = billingOf(sid);
    if (b.status === 'pending') {
      if (b.source === 'lynk') {
        const again = b.lynkUrl || lynkCheckoutUrl(b.pendingTerm || b.term);
        return obWrap(wizPayIdx(),
          '<p class="ob-kicker">Lynk</p>' +
          '<h1 class="ob-q">Menunggu konfirmasi Lynk</h1>' +
          '<p class="ob-sub">Checkout ' + fmtRp(b.pendingAmount || b.amount || 0) +
          ' (' + esc(termLabel(b.pendingTerm || b.term)) +
          '). Anton yang menerima uangnya. Kurikulum kebuka setelah Lynk mengonfirmasi. Video 1 tetap kebuka.</p>',
          (again ? '<a class="btn ob-cta" href="' + esc(again) + '" target="_blank" rel="noopener">Buka halaman Lynk</a>' : '') +
          '<button class="btn secondary ob-cta" data-act="tab" data-id="home">Kembali ke Home</button>',
          true);
      }
      if (b.source === 'mayar') {
        return obWrap(wizPayIdx(),
          '<p class="ob-kicker">Mayar</p>' +
          '<h1 class="ob-q">Menunggu pembayaran</h1>' +
          '<p class="ob-sub">Invoice ' + fmtRp(b.pendingAmount || b.amount || 0) +
          ' (' + esc(termLabel(b.pendingTerm || b.term)) +
          '). Akses mentoring kebuka otomatis setelah pembayaran masuk. Video 1 tetap kebuka.</p>',
          (b.mayarLink
            ? '<a class="btn ob-cta" href="' + esc(b.mayarLink) + '" target="_blank" rel="noopener">Buka halaman bayar</a>'
            : '') +
          '<button class="btn secondary ob-cta" data-act="tab" data-id="home">Kembali ke Home</button>',
          true);
      }
      return obWrap(wizPayIdx(),
        '<p class="ob-kicker">Transfer</p>' +
        '<h1 class="ob-q">Menunggu konfirmasi Anton</h1>' +
        '<p class="ob-sub">Kamu sudah klaim transfer ' + fmtRp(b.pendingAmount || b.amount || 0) +
        ' (' + esc(termLabel(b.pendingTerm || b.term)) +
        '). Anton cek rekening, lalu akses mentoring kebuka. Video 1 tetap kebuka.</p>',
        '<button class="btn ob-cta" data-act="tab" data-id="home">Kembali ke Home</button>',
        true);
    }
    const welcome = welcomeOpen(sid) || !b.offerExpiresAt;
    const exp = b.offerExpiresAt || addMs(isoNow(), 24 * 36e5);
    const inWin = hoursLeft(exp) > 0;
    const term = ui.payTerm || 'month';
    const price = priceForTerm(term, welcome && inWin);
    const list = listPriceForTerm(term);
    const tools = catalog().filter((p) => bundled(p));
    const toolPct = toolDiscountPct();
    const include = '<ul class="ob-checks">' +
      '<li>Kurikulum 12 video + lembar kerja</li>' +
      '<li>Live class, diskusi, Kolab</li>' +
      '<li>Undangan grup WA dari Anton</li>' +
      '<li><strong>−' + toolPct + '% semua alat</strong> di Perpustakaan</li>' +
      '<li class="is-mute">Laris Affiliate tetap harga satuan</li></ul>' +
      '<button type="button" class="ob-link" data-act="wiz-tools">' +
      (ui.wizTools ? 'Sembunyikan harga alat' : 'Lihat harga alat −' + toolPct + '%') + '</button>' +
      (ui.wizTools
        ? '<div class="include-tools">' + tools.map((p) =>
          '<div class="include-tool"><span>' + esc(p.title) + '</span>' +
          '<span><span class="price-coret">' + fmtRp(p.price) + '</span> <strong>' + fmtRp(toolMemberPrice(p)) + '</strong></span></div>'
        ).join('') + '</div>'
        : '');
    const inner = '<p class="ob-kicker">Paket</p>' +
      '<h1 class="ob-q">Yang kamu dapat</h1>' +
      '<p class="ob-sub">Anton yang menerima pembayaran. LarisID tidak menahan uang. Kurikulum kebuka setelah Lynk mengonfirmasi, atau setelah Anton menandai transfer manual.</p>' +
      include +
      '<p class="ob-note">' + (inWin
        ? 'Harga perkenalan 24 jam untuk 1 bulan &amp; autopay · sisa <strong>' + esc(fmtRemain(exp)) + '</strong>. 3 &amp; 6 bulan sudah diskon program, tidak ditumpuk.'
        : 'Jendela 24 jam sudah habis. Harga program di bawah.') + '</p>' +
      '<div class="pay-terms ob-terms">' +
        termCard('month', term, inWin && welcome) +
        termCard('quarter', term, false) +
        termCard('half', term, false) +
        termCard('autopay', term, inWin && welcome) +
      '</div>' +
      '<div class="ob-bank">' +
        (lynkCheckoutUrl(term)
          ? '<div class="ob-tf">' +
              '<p class="ob-tf-kicker">Bayar di Lynk</p>' +
              '<p class="muted">Halaman checkout Anton. Kurikulum kebuka setelah Lynk mengirim konfirmasi.</p>' +
              '<p class="muted">Jumlah di kelas: <strong>' + fmtRp(price) + '</strong>' +
              (price < list ? ' <span class="price-coret">' + fmtRp(list) + '</span>' : '') +
              ' · ' + esc(termLabel(term)) +
              (lynkProduct(term).title ? ' · ' + esc(lynkProduct(term).title) : '') + '</p>' +
            '</div>'
          : '<div class="ob-tf">' +
              '<p class="ob-tf-kicker">Transfer manual</p>' +
              '<p><strong>' + esc(db.bank.bank) + '</strong> ' + esc(db.bank.number) + '<br>a.n. ' + esc(db.bank.name) + '</p>' +
              '<p class="muted">Tautan Lynk untuk paket ini belum diisi. Jumlah sekarang: <strong>' + fmtRp(price) + '</strong> · ' + esc(termLabel(term)) + '</p>' +
            '</div>') +
        (lynkCheckoutUrl(term)
          ? '<details class="ob-manual"><summary>Sudah transfer ke rekening Anton</summary>' +
              '<p><strong>' + esc(db.bank.bank) + '</strong> ' + esc(db.bank.number) + '<br>a.n. ' + esc(db.bank.name) + '</p>' +
              '<p class="muted">Anton menandai lunas di CRM kalau webhook Lynk tidak cocok.</p></details>'
          : '') +
      '</div>';
    const foot =
      (lynkCheckoutUrl(term)
        ? '<button class="btn ob-cta" data-act="pay-lynk" data-term="' + esc(term) + '">Bayar di Lynk</button>' +
          '<button type="button" class="btn secondary ob-cta" data-act="pay-manual" data-term="' + esc(term) + '">Saya sudah transfer</button>'
        : '<button class="btn ob-cta" data-act="pay-now" data-term="' + esc(term) + '">' +
          (term === 'autopay' ? 'Bayar kartu (mock)' : 'Saya sudah transfer / scan') + '</button>') +
      '<button type="button" class="btn secondary ob-cta" data-act="pay-later">Bayar nanti, lihat dulu</button>' +
      '<p class="ob-look-hint">Form sudah masuk — tab <strong>Belajar</strong> &amp; <strong>Diskusi</strong> di bawah. Video 1 kebuka; sisanya blur sampai lunas.</p>' +
      '<button type="button" class="ob-text" data-act="not-interested">Tidak tertarik</button>';
    return obWrap(wizPayIdx(), inner, foot, true);
  }
  function qrisPlaceholderSvg() {
    const cells = [];
    const n = 11;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const finder = (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4);
        const mid = x > 3 && x < n - 4 && y > 3 && y < n - 4 && ((x + y * 3) % 2 === 0);
        if (finder || mid || ((x * 7 + y * 13) % 5 === 0 && x > 2 && y > 2)) {
          cells.push('<rect x="' + (x * 8 + 8) + '" y="' + (y * 8 + 8) + '" width="7" height="7" fill="#18181b"/>');
        }
      }
    }
    return '<svg class="ob-qris-svg" viewBox="0 0 104 104" width="148" height="148" aria-hidden="true">' +
      '<rect width="104" height="104" fill="#fff" rx="8"/>' +
      cells.join('') +
      '<rect x="8" y="8" width="24" height="24" fill="none" stroke="#18181b" stroke-width="4"/>' +
      '<rect x="72" y="8" width="24" height="24" fill="none" stroke="#18181b" stroke-width="4"/>' +
      '<rect x="8" y="72" width="24" height="24" fill="none" stroke="#18181b" stroke-width="4"/>' +
      '</svg>';
  }
  function termCard(id, cur, welcome) {
    const list = listPriceForTerm(id);
    const now = priceForTerm(id, welcome);
    const months = termMonths(id);
    const disc = termDiscountPct(id);
    const titles = {
      month: '1 bulan · transfer',
      quarter: '3 bulan',
      half: '6 bulan',
      autopay: 'Autopay kartu / bulan'
    };
    const per = months > 1 ? Math.round(now / months) : now;
    return '<button type="button" class="ob-term' + (cur === id ? ' is-on' : '') + '" data-act="pick-term" data-id="' + id + '">' +
      '<span class="ob-term-title">' + esc(titles[id] || id) + '</span>' +
      (disc ? '<span class="muted">−' + disc + '% dari ' + months + ' × bulanan</span>' : '<span class="muted">Harga list bulanan</span>') +
      (now < list
        ? '<span class="sku-price"><span class="price-coret">' + fmtRp(list) + '</span> <strong>' + fmtRp(now) + '</strong></span>'
        : '<span class="sku-price"><strong>' + fmtRp(now) + '</strong></span>') +
      (months > 1 ? '<span class="muted">Setara ' + fmtRp(per) + ' / bulan</span>' : '') +
      '</button>';
  }
  function viewHome() {
    const s = student();
    if (!canMentoring(s.id) && !canPreview(s.id)) return viewHomeAlacarte();
    const lastId = canPreview(s.id) && !canMentoring(s.id)
      ? firstLectureId()
      : (db.lastLecture[s.id] || firstLectureId());
    const last = lectureById(lastId) || lectures()[0];
    const ses = nextSession();
    const bill = billingOf(s.id);
    const ann = db.announcements[0];
    const preview = canPreview(s.id) && !canMentoring(s.id);
    return (
      (preview ? offerBanner(s.id) : '') +
      '<div class="grid-2">' +
        resumeJourneyHtml(s.id, last, preview) +
        '<section class="card">' +
          '<h2>Sesi berikutnya</h2>' +
          (preview
            ? '<p class="muted">Live class terkunci sampai mentoring lunas. Jadwal tetap kelihatan.</p>'
            : '') +
          '<p><strong>' + esc(ses.title) + '</strong></p>' +
          '<p class="muted">' + fmtWhen(ses.startsAt) + ' · ' + esc(ses.location) + '</p>' +
          '<p class="muted">' + esc(ses.notes || '') + '</p>' +
          '<div class="row" style="margin-top:10px">' +
            (preview
              ? '<button class="btn" data-act="tab" data-id="daftar">Buka dengan mentoring</button>'
              : '<a class="btn" href="' + esc(ses.meetUrl) + '" target="_blank" rel="noopener">Buka Meet</a>') +
            '<a class="wa" href="' + esc(waLink(ownerWa(), 'Halo Anton, saya dari Batch September.')) + '">Chat Anton di WA</a>' +
          '</div>' +
          calSyncButtons(ses) +
          (!preview
            ? '<div class="row" style="margin-top:8px">' +
                '<button type="button" class="btn-sm" data-act="cal-ics-all">Unduh semua sesi (.ics)</button>' +
              '</div>'
            : '') +
          '<p class="muted" style="margin-top:10px">Grup WA kelas: undangan hanya lewat Anton.</p>' +
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
          '<div style="margin-top:12px">' + payChip(bill.status, bill.source) +
            '<span class="muted"> · ' + esc(bill.plan || crmOf(s.id).stage) +
            (bill.accessUntil ? ' · sampai ' + fmtWhen(bill.accessUntil) : '') +
            (bill.note ? ' · ' + esc(bill.note) : '') + '</span></div>' +
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
        '<p class="muted">Live class + alat lynk di Pustaka. Laris Affiliate tetap satuan. Anton merchant — LarisID tidak menahan uang.</p>' +
        '<div class="row" style="margin-top:10px">' +
          '<a class="wa" href="' + esc(waLink(ownerWa(), 'Halo Anton, mau ikut mentoring. Saya sudah cek lynk.id/obrolan.marketing')) + '">Chat Anton di WA</a>' +
          '<a class="btn secondary" href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">Buka lynk.id</a>' +
        '</div>' +
        '<p class="muted" style="margin-top:10px">' + payChip(b.status, b.source) +
          (b.note ? ' · ' + esc(b.note) : ' · belum mentoring') + '</p>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn" data-act="tab" data-id="daftar">Isi form mentoring</button>' +
        '</div>' +
      '</section>';
  }

  function weekList(sid, weekId) {
    return '<ul class="list-check">' + lecturesInWeek(weekId).map((l) => {
      const paywall = isPaywalled(sid, l.id) && !isStaff();
      const seq = isSeqLocked(sid, l.id) && !isStaff();
      const locked = paywall || seq;
      const done = !locked && isDone(sid, l.id);
      return '<li class="' + (locked ? 'is-locked' : '') + (done ? ' is-done' : '') +
        (seq ? ' is-seq' : '') + '"><span>' +
        (done ? '<span class="tick-ok" aria-hidden="true">✓</span> ' : '<span class="tick-off" aria-hidden="true"></span> ') +
        '<span class="' + (paywall ? 'list-blur' : '') + '">' + esc(l.title) + '</span>' +
        (paywall ? ' <span class="chip">Terkunci</span>' : (seq ? ' <span class="chip">Urutan</span>' : '')) + '</span>' +
        '<button class="btn-sm" data-act="open-lec" data-id="' + esc(l.id) + '">' +
        (paywall ? 'Lihat' : 'Buka') + '</button></li>';
    }).join('') + '</ul>';
  }

  function viewLocked() {
    return '<div class="locked">' +
      '<h2>Live class terkunci</h2>' +
      '<p class="muted">Belajar, Diskusi, dan Kolab hanya untuk yang ikut mentoring. Produk lynk tetap bisa dibeli satuan di Pustaka. Anton merchant — LarisID tidak menahan uang.</p>' +
      '<div class="row" style="justify-content:center">' +
        '<button class="btn" data-act="tab" data-id="daftar">Ikut mentoring</button>' +
        '<a class="wa" href="' + esc(waLink(ownerWa(), 'Halo Anton, mau konfirmasi mentoring / produk lynk.')) + '">Chat Anton</a>' +
        '<a class="btn secondary" href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">lynk.id</a>' +
      '</div></div>';
  }
  function viewLockedDiskusi() {
    return '<div class="locked">' +
      '<h2>Diskusi untuk yang lunas</h2>' +
      '<p class="muted">Trial hanya video 1. Tanya di materi itu tetap ada. Forum kelas dan live class setelah bayar.</p>' +
      '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button></div>';
  }

  function lectureNeighbors(id) {
    const list = lectures();
    const i = list.findIndex((l) => l.id === id);
    const idx = i < 0 ? 0 : i;
    return {
      i: idx,
      n: idx + 1,
      total: list.length,
      prev: idx > 0 ? list[idx - 1] : null,
      next: idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null
    };
  }
  function weekTitleOf(lec) {
    const w = db.weeks.find((x) => x.id === lec.weekId);
    return w ? w.title : '';
  }
  function lecAccHtml(icon, title, sub, inner) {
    if (!inner) return '';
    return '<details class="lec-acc">' +
      '<summary>' +
        svgIcon(icon) +
        '<span class="lec-acc-copy"><strong>' + esc(title) + '</strong>' +
        (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="lec-acc-chevron" aria-hidden="true">▾</span>' +
      '</summary>' +
      '<div class="lec-acc-body">' + inner + '</div></details>';
  }
  function hostedVideoHtml(lec, watchFirst, cls) {
    return '<video class="' + cls + '" controls playsinline preload="metadata" src="' + esc(mediaFileUrl(lec.videoKey)) + '"' +
      (watchFirst ? ' data-watch-lec="' + esc(lec.id) + '"' : '') + '></video>';
  }
  function lessonVideoHtml(lec) {
    const cover = coverHtml('lec', lec.id, 'lec-poster');
    const watchFirst = lec.type === 'video' && lec.id === firstLectureId();
    if (lec.videoKey) {
      return (cover || '') + hostedVideoHtml(lec, watchFirst, 'lec-video');
    }
    if (lec.videoBlob) {
      return (cover || '') + '<video class="lec-video" controls playsinline preload="metadata" data-blob="' +
        esc(lec.id) + '"' + (watchFirst ? ' data-watch-lec="' + esc(lec.id) + '"' : '') + '></video>';
    }
    const e = parseEmbed(lec.url);
    if (e && e.embed) {
      return '<div class="lazy-embed' + (cover ? ' has-cover' : '') + '" data-embed="' + esc(e.embed) + '"' +
        (watchFirst && e.videoId ? ' data-watch-lec="' + esc(lec.id) + '" data-yt-id="' + esc(e.videoId) + '"' : '') + '>' +
        (cover || '') +
        '<div class="play-orb" aria-hidden="true">' + svgIcon('play') + '</div>' +
      '</div>';
    }
    if (lec.url) {
      return '<div class="article">' + (cover || '') + '<p>Video ini tidak bisa diputar di dalam kelas (TikTok / tautan lain).</p>' +
        '<a class="btn" href="' + esc(lec.url) + '" target="_blank" rel="noopener">Buka video</a></div>';
    }
    return '<div class="article">' + (cover || '') + '<p class="muted">Belum ada video. Mentor tempel tautan atau unggah di Kurikulum.</p></div>';
  }
  function lessonReadHtml(lec) {
    const body = (lec.body || '').trim();
    if (!body) return '';
    const long = body.length > 160 || body.indexOf('\n\n') >= 0;
    return '<div class="lec-read' + (long ? '' : ' is-open') + '">' +
      '<div class="lec-read-text">' + mdish(body) + '</div>' +
      (long
        ? '<button type="button" class="lec-more" data-act="lec-more">Baca selengkapnya <span aria-hidden="true">▾</span></button>'
        : '') +
      '</div>';
  }
  function lessonAskHtml(lec) {
    const threads = db.threads.filter((t) => t.lectureId === lec.id);
    return threadList(threads) +
      '<form class="compose" data-act="ask" data-lec="' + esc(lec.id) + '">' +
        '<input name="title" required maxlength="140" placeholder="Judul pertanyaan">' +
        '<textarea name="body" required rows="3" placeholder="Konteks singkat. Jangan sebar supplier atau margin."></textarea>' +
        '<button class="btn" type="submit">Kirim</button>' +
      '</form>';
  }
  function lessonQuizHtml(lec) {
    const qs = lec.questions || [];
    if (!qs.length) return '';
    return qs.map((q, i) =>
      '<div class="quiz-q"><p><strong>' + (i + 1) + '.</strong> ' + esc(q.q) + '</p>' +
      (q.hint
        ? '<details><summary>Catatan</summary><p class="muted">' + esc(q.hint) + '</p></details>'
        : '') +
      '</div>'
    ).join('') +
    '<p class="muted">Untuk dipikirkan — bukan ujian, tidak perlu kirim jawaban.</p>';
  }
  function renderLessonPlayer(lec, opts) {
    opts = opts || {};
    const sid = ui.personaId;
    const p = kurProgress(sid);
    const nb = lectureNeighbors(lec.id);
    const week = weekTitleOf(lec);
    const docs = lec.resources || [];
    const points = lec.points || [];
    const questions = lec.questions || [];
    const threads = db.threads.filter((t) => t.lectureId === lec.id);
    const docSub = docs.map((d) => d.name || 'File').join(', ');
    const tanyaSub = threads.length
      ? (threads.length + ' pertanyaan')
      : 'Belum ada pertanyaan. WhatsApp tetap untuk chat cepat.';
    const canNext = !!(nb.next && (isStaff() || canOpenLecture(sid, nb.next.id)));
    const paywalled = !!opts.paywalled;
    const seqLocked = !!opts.seqLocked;
    const top = opts.phone
      ? '<div class="lesson-top">' +
          '<button type="button" class="lesson-back" data-act="tab" data-id="home" aria-label="Kembali">←</button>' +
          '<strong class="lesson-tab">Belajar</strong>' +
          '<button type="button" class="lesson-count" data-act="toggle-kur" aria-label="Kurikulum">' +
            nb.n + ' / ' + nb.total + '</button>' +
          '<button type="button" class="lesson-chev"' + (nb.prev ? ' data-act="open-lec" data-id="' + esc(nb.prev.id) + '"' : ' disabled') +
            ' aria-label="Materi sebelumnya">‹</button>' +
          '<button type="button" class="lesson-chev"' + (canNext ? ' data-act="open-lec" data-id="' + esc(nb.next.id) + '"' : ' disabled') +
            ' aria-label="Materi berikutnya">›</button>' +
        '</div>'
      : '';
    const head =
      '<header class="lesson-head">' +
        (week ? '<p class="lesson-kicker">' + esc(week) + '</p>' : '') +
        '<h1>' + esc(lec.title) + '</h1>' +
        '<p class="lesson-meta">Materi ' + nb.n + ' dari ' + nb.total + ' · ' + p.pct + '% selesai</p>' +
        '<div class="lesson-bar" aria-hidden="true"><span style="width:' + p.pct + '%"></span></div>' +
      '</header>';
    const seqBanner = seqLocked
      ? '<div class="seq-lock-banner" role="status">' +
          '<strong>Bisa dibaca</strong> — tandai selesai &amp; lanjut setelah materi sebelumnya selesai.' +
          '<button type="button" class="btn-sm" data-act="open-lec" data-id="' +
            esc((nb.prev && nb.prev.id) || firstLectureId()) + '">Ke materi sebelumnya</button>' +
        '</div>'
      : '';
    let stage = '';
    if (paywalled) {
      stage = '<div class="locked-blur-card">' +
        '<div class="locked-blur-bg" aria-hidden="true">' +
          (coverHtml('lec', lec.id, 'lec-poster') || '<div class="lec-poster lec-poster-empty"></div>') +
          '<div class="locked-blur-fake">' +
            '<div class="fake-line"></div><div class="fake-line short"></div>' +
            '<div class="fake-line"></div><div class="fake-chip"></div>' +
          '</div>' +
        '</div>' +
        '<div class="locked-blur-fg">' +
          '<p class="trial-kicker">Materi terkunci</p>' +
          '<h2>' + esc(lec.title) + '</h2>' +
          '<p class="muted">Kurikulum lengkap di bawah — yang blur terkunci sampai mentoring lunas.</p>' +
          '<button class="btn" data-act="open-lec" data-id="' + esc(firstLectureId()) + '">Ke video selamat datang</button>' +
          '<button class="btn secondary" data-act="tab" data-id="daftar">Bayar mentoring</button>' +
        '</div></div>';
    } else if (lec.tool === 'kolab') {
      stage = viewKolab();
    } else if (lec.type === 'video') {
      stage = '<div class="lesson-stage">' + lessonVideoHtml(lec) + '</div>' +
        watchHintHtml(lec, isDone(sid, lec.id)) +
        lessonReadHtml(lec);
    } else {
      stage = renderCanvas(lec);
    }
    const folds = paywalled || lec.tool === 'kolab' ? '' :
      lecAccHtml('doc', 'Dokumen', docSub, docs.length ? resourceListHtml(lec) : '') +
      lecAccHtml('list', 'Poin penting', points.length ? (points.length + ' poin') : '',
        points.length ? '<ul class="key-points">' + points.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') +
      lecAccHtml('help', 'Cek pemahaman', questions.length ? (questions.length + ' prompt') : '',
        lessonQuizHtml(lec)) +
      lecAccHtml('chat', 'Tanya di materi ini', tanyaSub, lessonAskHtml(lec));
    const nav = (paywalled || lec.tool === 'kolab') ? '' :
      '<div class="lec-nav">' +
        '<button type="button" class="btn lec-prev"' +
          (nb.prev ? ' data-act="open-lec" data-id="' + esc(nb.prev.id) + '"' : ' disabled') +
          '>← Materi sebelumnya</button>' +
        '<button type="button" class="btn lec-next"' +
          (canNext ? ' data-act="open-lec" data-id="' + esc(nb.next.id) + '"' : ' disabled') +
          (canNext ? '' : ' title="Selesaikan materi ini dulu"') +
          '>Materi berikutnya →</button>' +
      '</div>';
    const report = '<form class="compose" data-act="report-issue" data-id="' + esc(lec.id) + '" style="margin-top:12px">' +
      '<label class="muted">Ada masalah di materi ini?</label>' +
      '<textarea name="body" required rows="2" placeholder="Apa yang tidak jalan?"></textarea>' +
      '<button class="btn secondary" type="submit">Kirim laporan</button></form>';
    return '<div class="lesson">' + top + head + seqBanner + stage + folds + nav + report + (opts.after || '') + '</div>';
  }

  function viewBelajar() {
    if (!canMentoring(ui.personaId) && !canPreview(ui.personaId)) return viewLocked();
    const preview = canPreview(ui.personaId) && !canMentoring(ui.personaId);
    let lec = lectureById(ui.lectureId) || lectures()[0];
    if (!isStaff() && lec && lec.id !== 'kolab' && !canViewLecture(ui.personaId, lec.id)) {
      const open = lectures().filter((l) => canViewLecture(ui.personaId, l.id));
      lec = open.find((l) => !isDone(ui.personaId, l.id) && canOpenLecture(ui.personaId, l.id))
        || open.find((l) => canOpenLecture(ui.personaId, l.id))
        || open[open.length - 1] || lectures()[0];
    }
    ui.lectureId = lec.id;
    if (lec && ui.lastTrackedLec !== lec.id && !isStaff()) {
      ui.lastTrackedLec = lec.id;
      trackEvent('lesson_open', {
        lessonId: lec.id,
        lessonTitle: lec.title,
        progress: kurProgress(ui.personaId).pct,
        stage: crmOf(ui.personaId).stage
      });
    }
    const paywalled = isPaywalled(ui.personaId, lec.id) && !isStaff();
    const seqLocked = isSeqLocked(ui.personaId, lec.id) && !isStaff();
    const payStrip = preview ? offerBanner(ui.personaId) : '';
    const kurInline = preview ? trialKurikulumBlock() : '';
    const after = (preview && !paywalled && lec.tool !== 'kolab' ? payAfterFirst(lec) : '') + kurInline;
    const player = (preview ? payStrip : '') + renderLessonPlayer(lec, {
      phone: !isStaff(),
      paywalled: paywalled,
      seqLocked: seqLocked,
      after: after
    });
    return '<div class="player-layout">' +
      '<div>' + player + '</div>' +
      '<aside class="kurikulum-pane' + (ui.kurOpen ? ' is-open' : '') + '">' +
        renderKurikulumSidebar() + '</aside>' +
      '</div>';
  }
  function trialKurikulumBlock() {
    const p = kurProgress(ui.personaId);
    const openN = lectures().filter((l) => canOpenLecture(ui.personaId, l.id)).length;
    return '<section class="card kurikulum-inline" id="kurikulum-trial">' +
      '<p class="trial-kicker">Kurikulum lengkap</p>' +
      '<h3>' + p.total + ' materi · ' + openN + ' kebuka di trial</h3>' +
      '<p class="muted">Yang blur = terkunci sampai mentoring lunas. Ketuk untuk lihat teaser.</p>' +
      '<div class="kurikulum-inline-list">' + renderKurikulumSidebar() + '</div></section>';
  }

  function progresKurikulumBlock(sid) {
    const unpaid = !canMentoring(sid);
    const openN = lectures().filter((l) => canOpenLecture(sid, l.id)).length;
    const total = lectures().length;
    return '<section class="card kurikulum-inline progres-kur" id="kurikulum-progres">' +
      '<p class="trial-kicker">Kurikulum</p>' +
      (unpaid
        ? '<p class="muted">Modul terkunci tetap kelihatan (blur) dan belum selesai. Mentoring membuka semuanya.</p>'
        : '<p class="muted">Bisa dibaca semua. Tandai selesai berurutan supaya materi berikutnya kebuka.</p>') +
      progressBarHtml(sid) +
      '<p class="progres-open muted">' + (unpaid
        ? (openN + ' materi kebuka sekarang · ' + (total - openN) + ' masih terkunci')
        : (openN + ' / ' + total + ' siap ditandai selesai · sisanya bisa dibaca dulu')) + '</p>' +
      '<div class="kurikulum-inline-list">' + renderKurikulumSidebar(sid, { skipProgress: true }) + '</div></section>';
  }
  function payAfterFirst(lec) {
    if (lec.id !== firstLectureId()) return '';
    if (canMentoring(ui.personaId)) return '';
    if (isPending(ui.personaId)) return pendingBanner(ui.personaId);
    const b = billingOf(ui.personaId);
    const open = welcomeOpen(ui.personaId);
    return '<section class="card trial-cta lec-after">' +
      '<h3>Lanjut mentoring?</h3>' +
      '<p class="muted">Video 1 + checklist kebuka. 11 video lain, live, diskusi, dan alat −' + toolDiscountPct() + '% setelah lunas.</p>' +
      (open
        ? '<p class="trial-count">Diskon 24 jam · sisa <strong data-remain="' + esc(b.offerExpiresAt) + '">' + esc(fmtRemain(b.offerExpiresAt)) + '</strong></p>'
        : '') +
      '<div class="row">' +
        '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button>' +
        '<button class="btn secondary" data-act="scroll-kur">Lihat kurikulum terkunci</button>' +
        '<button class="btn secondary" data-act="not-interested">Tidak tertarik</button>' +
      '</div></section>';
  }

  function renderCanvas(lec) {
    let body = '';
    const cover = coverHtml('lec', lec.id, 'lec-poster');
    const watchFirst = lec.type === 'video' && lec.id === firstLectureId();
    if (lec.type === 'video') {
      if (lec.videoKey) {
        body = (cover || '') + hostedVideoHtml(lec, watchFirst, 'lec-video');
      } else if (lec.videoBlob) {
        body = (cover || '') + '<video class="lec-video" controls playsinline preload="metadata" data-blob="' +
          esc(lec.id) + '"' + (watchFirst ? ' data-watch-lec="' + esc(lec.id) + '"' : '') + '></video>';
      } else {
        const e = parseEmbed(lec.url);
        if (e && e.embed) {
          body = '<div class="lazy-embed" data-embed="' + esc(e.embed) + '"' +
            (watchFirst && e.videoId ? ' data-watch-lec="' + esc(lec.id) + '" data-yt-id="' + esc(e.videoId) + '"' : '') + '>' +
            (cover || '') +
            '<div class="play-orb">▶</div>' +
            '<div class="lazy-note">Ketuk untuk memuat · ' + (e.kind === 'drive' ? 'Google Drive' : 'hemat data') +
            (watchFirst ? ' · selesai otomatis ≥85%' : '') + '</div></div>';
        } else if (lec.url) {
          body = '<div class="article">' + (cover || '') + '<p>Video ini tidak bisa diputar di dalam kelas (TikTok / tautan lain).</p>' +
            '<a class="btn" href="' + esc(lec.url) + '" target="_blank" rel="noopener">Buka video</a>' +
            '<p class="muted" style="margin-top:10px">YouTube atau file MP4 tampil di sini. TikTok biasanya harus dibuka di aplikasinya.</p></div>';
        } else {
          body = '<div class="article">' + (cover || '') + '<p class="muted">Belum ada video. Mentor tempel tautan atau unggah di Kurikulum.</p></div>';
        }
      }
      if (lec.body) body += '<div class="article lec-read">' + mdish(lec.body) + '</div>';
    } else if (lec.type === 'tool') {
      const sku = lec.skuId ? productById(lec.skuId) : null;
      if (sku && (sku.id === 'calc' || sku.id === 'ai-creative' || sku.id === 'ai-data')) {
        body = nativeToolHtml(sku, !!(sku.example));
      } else {
        let src = lec.iframe || (sku && sku.iframe) || '';
        if (sku && sku.example && src) src += (src.indexOf('?') >= 0 ? '&' : '?') + 'contoh=1';
        body = src
          ? '<iframe class="tool-frame" sandbox="' + TOOL_SANDBOX + '" src="' + esc(src) + '" title="' + esc(lec.title) + '"></iframe>'
          : '<div class="article"><p class="muted">Alat belum siap.</p></div>';
      }
    } else if (lec.type === 'document') {
      body = '<div class="article">' + (cover || '') + '<h3>' + esc(lec.title) + '</h3>' +
        ((lec.resources || []).length ? resourceListHtml(lec) : '<p>File kelas: <a href="' + esc(lec.url || '#') + '" target="_blank" rel="noopener">' + esc(lec.title) + '</a></p>') +
        '</div>';
    } else {
      body = '<div class="article">' + (cover || '') + '<h3>' + esc(lec.title) + '</h3>' + mdish(lec.body || '') + '</div>';
    }
    const done = isDone(ui.personaId, lec.id);
    let doneCtrl = '';
    if (watchFirst) {
      doneCtrl = done
        ? '<span class="btn done-ok" data-watch-status="done">Selesai ✓</span>'
        : '<span class="watch-hint" data-watch-status="pending">Selesai otomatis setelah nonton ≥85%</span>';
    } else {
      doneCtrl = '<button class="btn' + (done ? ' done-ok' : '') + '" data-act="toggle-done" data-id="' + esc(lec.id) + '">' +
        (done ? 'Selesai ✓' : 'Tandai selesai') + '</button>';
    }
    return '<div class="card" style="padding:0;overflow:hidden">' +
      '<div class="canvas">' + body + '</div>' +
      '<div class="canvas-bar">' +
        '<div><strong>' + esc(lec.title) + '</strong><div class="muted">' + esc(typeLabel(lec.type)) +
        (lec.requiredBefore ? ' · wajib sebelum kelas' : '') + '</div></div>' +
        doneCtrl +
      '</div></div>';
  }

  function resourceListHtml(lec) {
    const docs = lec.resources || [];
    if (!docs.length) return '';
    return '<ul class="res-list">' + docs.map((doc) => {
      if (doc.blob && doc.blobId) {
        return '<li><a class="doc-link" data-blob-href="' + esc(doc.blobId) + '" download>' + esc(doc.name || 'File') + '</a></li>';
      }
      const dummy = /handout\.html/.test(doc.url || '');
      return '<li><a class="doc-link" href="' + esc(doc.url || '#') + '" target="_blank" rel="noopener">' + esc(doc.name || 'Lembar kerja') + '</a>' +
        (dummy ? '<span class="muted"> · contoh</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  function renderLecAfter(lec) {
    let html = '';
    if ((lec.resources || []).length) {
      html += '<div class="card lec-after"><h3>Dokumen</h3>' + resourceListHtml(lec) + '</div>';
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
            ? '<details><summary>Catatan</summary><p class="muted">' + esc(q.hint) + '</p></details>'
            : '') +
          '</div>'
        ).join('') +
        '<p class="muted">Untuk dipikirkan — bukan ujian, tidak perlu kirim jawaban. Video 1 selesai otomatis setelah nonton ≥85%.</p></div>';
    }
    return html;
  }

  function renderKurikulumSidebar(sid, opts) {
    sid = sid || ui.personaId;
    opts = opts || {};
    const preview = !!opts.preview;
    const currentId = preview ? (ui.kurPreviewLec || '') : ui.lectureId;
    let n = 0;
    const head = opts.skipProgress ? '' : progressBarHtml(sid);
    return head + db.weeks.map((w) => {
      const items = lecturesInWeek(w.id).map((l) => {
        n += 1;
        const cur = l.id === currentId;
        const paywall = preview ? !canOpenLecture(sid, l.id) : isPaywalled(sid, l.id);
        const seq = !preview && !isStaff() && isSeqLocked(sid, l.id);
        const locked = paywall || seq;
        const thumb = coverHtml('lec', l.id, 'cover-mini');
        const act = preview ? 'kur-prev-lec' : 'open-lec';
        return '<button type="button" class="lec' + (cur ? ' current' : '') + (locked ? ' locked' : '') +
          (seq ? ' is-seq' : '') + '" data-act="' +
          act + '" data-id="' + esc(l.id) + '">' +
          '<span class="lec-face' + (paywall ? ' is-blur' : '') + '">' +
            (thumb || '<span class="mark' + (isDone(sid, l.id) ? ' done' : '') + '" aria-hidden="true">' +
            (isDone(sid, l.id) ? '✓' : '') + '</span>') +
            '<span><div class="t">' + n + '. ' + esc(l.title) + '</div>' +
            '<div class="m">' + esc(typeLabel(l.type)) +
            (l.requiredBefore ? ' · wajib' : '') + '</div></span>' +
          '</span>' +
          (paywall ? '<span class="lec-lock">Terkunci</span>' :
            (seq ? '<span class="lec-lock is-seq">Urutan</span>' : '')) +
          '</button>';
      }).join('');
      return '<div class="week-label">' + coverHtml('week', w.id, 'cover-mini') + esc(w.title) + ' · ' + progressPct(sid, w.id) + '%</div>' + items;
    }).join('');
  }

  function renderPanes(lec) {
    const threads = db.threads.filter((t) => t.lectureId === lec.id);
    const tanya = '<div class="subtabs">' +
      '<button type="button" data-act="pane" data-id="tanya" aria-selected="' + (ui.pane === 'tanya') + '">Tanya</button>' +
      '<button type="button" data-act="pane" data-id="sumber" aria-selected="' + (ui.pane === 'sumber') + '">Sumber</button>' +
      '</div>';
    if (ui.pane === 'sumber') {
      const res = (lec.resources || []).length
        ? resourceListHtml(lec)
        : '<p class="muted">Tidak ada file di materi ini.</p>';
      return tanya + '<div class="card"><h3>Sumber</h3>' + res + '</div>';
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
    const found = people().find((s) => s.id === id) || SEED.staff.find((s) => s.id === id);
    return displayNameOf(found) || (found && found.name) || id;
  }
  /** Anton + anyone in the Mentor pipeline column (for Assigned). */
  function assignableMentors(forId) {
    const seen = new Set();
    const list = [];
    function add(id, name) {
      if (!id || seen.has(id) || id === forId) return;
      seen.add(id);
      list.push({ id, name: name || nameOf(id) || id });
    }
    add('u-anton', 'Anton');
    people().forEach((s) => {
      if (s.kind === 'mentor' || crmOf(s.id).stage === 'mentor') add(s.id, s.name);
    });
    const cur = people().find((x) => x.id === forId);
    const mid = (cur && cur.mentorId) || 'u-anton';
    if (!seen.has(mid)) add(mid, nameOf(mid));
    return list;
  }

  function skuPriceHtml(p) {
    const list = Number(p.price) || 0;
    if (canMentoring(ui.personaId) && bundled(p) && !canSku(ui.personaId, p.id)) {
      return '<span class="price-coret">' + fmtRp(list) + '</span> <strong>' + fmtRp(toolMemberPrice(p)) + '</strong>' +
        '<span class="muted"> · mentoring −' + toolDiscountPct() + '%</span>';
    }
    if (p.coret) return '<span class="price-coret">' + fmtRp(p.coret) + '</span> <strong>' + fmtRp(list) + '</strong>';
    return '<strong>' + fmtRp(list) + '</strong>';
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
          '<div><strong>MasterMind with Anton GC</strong><span>by Coach Anton GC</span></div>' +
        '</div>' +
        '<p class="muted" style="margin:6px 0 0">Kelas: <a href="' + esc(schoolLocalUrl()) + '">' + esc(schoolPublicUrl().replace(/^https?:\/\//, '')) + '</a> · etalase: lynk.id/' + esc(schoolSlug()) + '</p>' +
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
      '<p class="muted" style="margin:0 0 12px">Beli satuan, atau mentoring = alat lynk + live class. <strong>Laris Affiliate tidak termasuk</strong> harga mentoring. Checkout satuan tetap lynk — bukan LarisID.</p>';
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
    return '<div class="card tool-tile sku' + (owned ? ' is-owned' : '') + '">' +
      skuCoverHtml(p) +
      '<div class="sku-body">' +
      '<div class="own-row">' + ownCheckHtml(owned, p.title) +
      '<span class="own-label">' + (owned ? 'Sudah punya' : 'Belum punya') + '</span>' +
      (!bundled(p) ? ' <span class="chip warn">Bukan mentoring</span>' : '') +
      (p.example && !owned ? ' <span class="chip warn">Contoh</span>' : '') +
      '</div>' +
      '<h3>' + esc(p.title) + '</h3>' +
      '<p class="muted">' + esc(p.job) + '</p>' +
      '<p class="sku-price">' + skuPriceHtml(p) + '</p>' +
      '<div class="row" style="margin-top:10px">' + dualCta(p, 'pustaka') + '</div></div></div>';
  }

  function viewSkuPage() {
    const p = productById(ui.skuId);
    if (!p) return viewStudentPustaka();
    const owned = canSku(ui.personaId, p.id);
    const preview = !!ui.skuPreview && !owned;
    if (!owned && !preview) return viewStudentPustaka();
    let body = '';
    let extra = '';
    if (p.kind === 'tool') {
      body = nativeToolHtml(p, preview);
    } else {
      const e = parseEmbed(p.url);
      body = '<div class="card" style="padding:0;overflow:hidden;margin-top:10px"><div class="canvas">' +
        '<div class="lazy-embed' + (p.cover ? ' has-cover' : '') + '"' +
        (p.cover ? ' style="background-image:url(\'' + esc(p.cover) + '\')"' : '') +
        ' data-embed="' + esc(e ? e.embed : '') + '">' +
        '<div class="play-orb">▶</div>' +
        '<div class="lazy-note">Ketuk untuk memuat · hemat data</div></div></div></div>';
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
    const bar = '<div class="sku-tool-bar">' +
      '<div><strong>' + esc(alatName(p)) + '</strong>' +
      '<div class="muted">' + (owned ? 'Punya kamu' : 'Contoh sampai Anton isi file') +
      (p.id === 'calc' ? ' · Unduh PDF di dalam kalkulator' : '') + '</div></div>' +
      (owned
        ? '<a class="btn secondary" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Halaman lynk</a>'
        : '<a class="btn" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">Beli di lynk.id</a>') +
      '</div>';
    return '<button type="button" class="kur-toggle" data-act="tab" data-id="' + esc(ui.skuFrom || 'alat') + '">← ' +
      (ui.skuFrom === 'home' ? 'Home' : 'Alat') + '</button>' +
      exampleBanner(p, preview) +
      body + bar + extra;
  }

  function nativeToolHtml(p, preview) {
    if (p.id === 'calc') return calcToolHtml(preview);
    if (p.id === 'ai-creative') return creativeToolHtml(preview);
    if (p.id === 'ai-data') return analisaToolHtml(preview);
    if (p.iframe) {
      return '<div class="card tool-native" style="margin-top:10px">' +
        '<h1>' + esc(alatName(p)) + '</h1>' +
        '<p class="lead">' + esc(p.job || '') + '</p>' +
        '<a class="btn" href="' + esc(iframeSrc(p, preview) || p.lynk) + '" target="_blank" rel="noopener">Buka alat</a></div>';
    }
    return '<div class="card tool-native" style="margin-top:10px"><p class="muted">Alat belum siap di prototype.</p></div>';
  }

  function calcToolHtml(preview) {
    const empty = preview && false;
    return '<div class="tool-native" id="calc-tool" data-preview="' + (preview ? '1' : '0') + '">' +
      '<h1>Kalkulator harga TikTok Shop</h1>' +
      '<p class="lead">Isi yang kuning. Sisanya dihitung. Perkiraan — bukan laporan pajak.</p>' +
      '<label>Nama SKU <span class="hint">kamu isi</span></label>' +
      '<input class="kuning" id="calc-sku" type="text" value="Jepit rambut satin isi 6" autocomplete="off">' +
      '<div class="btns">' +
        '<button type="button" class="btn" data-act="calc-contoh">Pakai contoh</button>' +
        '<button type="button" class="btn secondary" data-act="calc-kosong">Kosongkan</button>' +
        '<button type="button" class="btn secondary" data-act="calc-pdf">Unduh PDF</button>' +
      '</div>' +
      '<div class="calc-tabs">' +
        '<button type="button" class="on" data-act="calc-tab" data-pane="set">1. Cari harga jual</button>' +
        '<button type="button" data-act="calc-tab" data-pane="toko">2. Cek toko / HPP</button>' +
      '</div>' +
      '<section id="calc-pane-set">' +
        '<p class="muted" style="margin:0 0 8px">Mulai dari modal. Pilih sisa yang kamu mau, lalu lihat tiga harga etalase.</p>' +
        '<div class="calc-row2">' +
          '<div><label>Modal barang (Rp) <span class="hint">kamu isi</span></label>' +
            '<input class="kuning" id="calc-modal" type="number" min="0" inputmode="decimal" placeholder="contoh 60000"></div>' +
          '<div><label>Sisa yang mau (%) <span class="hint">kamu isi</span></label>' +
            '<input class="kuning" id="calc-margin" type="number" min="0" max="99" step="0.1" inputmode="decimal" placeholder="contoh 20"></div>' +
        '</div>' +
        '<p class="calc-net" id="calc-net-line">Isi modal &amp; sisa, atau Pakai contoh.</p>' +
        '<div class="calc-prices" id="calc-prices-set"></div>' +
        '<details class="calc-fees">' +
          '<summary>Ubah potongan TikTok · total <span id="calc-fee-sum">—</span></summary>' +
          '<p class="muted">Default dari spreadsheet Anton. Ubah kalau toko kamu beda.</p>' +
          '<div class="calc-row2">' +
            '<div><label>Admin TikTok (%)</label><input class="kuning" id="calc-fee-admin" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
            '<div><label>Bebas ongkir (%)</label><input class="kuning" id="calc-fee-ongkir" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Cashback bonus (%)</label><input class="kuning" id="calc-fee-cashback" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
            '<div><label>Voucher extra (%)</label><input class="kuning" id="calc-fee-voucher" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Komisi affiliate (%)</label><input class="kuning" id="calc-fee-aff" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
            '<div><label>Biaya ads (%)</label><input class="kuning" id="calc-fee-ads" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div><label>Pajak UMKM (%)</label><input class="kuning" id="calc-fee-pajak" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
        '</details>' +
        '<div class="calc-out" id="calc-out-set"></div>' +
      '</section>' +
      '<section id="calc-pane-toko" hidden>' +
        '<p class="muted" style="margin:0 0 8px">Sudah punya harga jual? Cek apakah toko masih sisa setelah fee, ads, dan biaya tetap.</p>' +
        '<div class="calc-row2">' +
          '<div><label>Modal produksi (Rp) <span class="hint">kamu isi</span></label>' +
            '<input class="kuning" id="calc-prod" type="number" min="0" inputmode="decimal" placeholder="—"></div>' +
          '<div><label>Packaging (Rp) <span class="hint">kamu isi</span></label>' +
            '<input class="kuning" id="calc-pack" type="number" min="0" inputmode="decimal" placeholder="—"></div>' +
        '</div>' +
        '<label>Harga jual (Rp) <span class="hint">kamu isi</span></label>' +
        '<input class="kuning" id="calc-jual" type="number" min="0" inputmode="decimal" placeholder="—">' +
        '<div class="calc-prices" id="calc-prices-toko"></div>' +
        '<details class="calc-fees">' +
          '<summary>Ubah biaya toko · tot cost <span id="calc-toko-sum">—</span></summary>' +
          '<div class="calc-row2">' +
            '<div><label>Fee TikTok (%)</label><input class="kuning" id="calc-t-fee" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
            '<div><label>Bebas ongkir (%)</label><input class="kuning" id="calc-t-ongkir" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Cashback (%)</label><input class="kuning" id="calc-t-cash" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
            '<div><label>Voucher extra (%)</label><input class="kuning" id="calc-t-voucher" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Biaya ads (%)</label><input class="kuning" id="calc-t-ads" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
            '<div><label>Komisi aff (%)</label><input class="kuning" id="calc-t-aff" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Host (Rp)</label><input class="kuning" id="calc-t-host" type="number" min="0" inputmode="decimal"></div>' +
            '<div><label>Kreator (Rp)</label><input class="kuning" id="calc-t-kreator" type="number" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Packing / admin (Rp)</label><input class="kuning" id="calc-t-admin" type="number" min="0" inputmode="decimal"></div>' +
            '<div><label>Gaji owner (Rp)</label><input class="kuning" id="calc-t-gaji" type="number" min="0" inputmode="decimal"></div>' +
          '</div>' +
          '<div class="calc-row2">' +
            '<div><label>Lain-lain (Rp)</label><input class="kuning" id="calc-t-lain" type="number" min="0" inputmode="decimal"></div>' +
            '<div><label>Pajak UMKM (%)</label><input class="kuning" id="calc-t-pajak" type="number" step="0.1" min="0" inputmode="decimal"></div>' +
          '</div>' +
        '</details>' +
        '<div class="calc-out" id="calc-out-toko"></div>' +
      '</section>' +
      (empty ? '' : '') +
    '</div>';
  }

  function creativeToolHtml() {
    return '<div class="tool-native" id="creative-tool">' +
      '<h1>AI Seller Creative Assistant</h1>' +
      '<p class="lead">Contoh pack prompt untuk SKU jepit rambut satin. Bukan generate gambar live.</p>' +
      '<button type="button" class="btn" data-act="tool-reveal" data-target="creative-body">Lihat contoh</button>' +
      '<div id="creative-body" hidden>' +
        '<h3 style="margin:16px 0 8px;font-size:.82rem">Prompt etalase</h3>' +
        '<div class="tool-example-card"><strong>Foto 1 — hero</strong>Close-up jepit rambut satin isi 6 di tangan, cahaya jendela, background kamar rapi, teks “isi 6 · tidak cubit kulit”.</div>' +
        '<div class="tool-example-card"><strong>Foto 2 — pakai</strong>Rambut terikat setengah, jepit terlihat dari samping, warna nude. Jangan stock China.</div>' +
        '<div class="tool-example-card"><strong>Foto 3 — isi paket</strong>Enam jepit di atas kain, label ukuran, bukan pile kacau.</div>' +
        '<h3 style="margin:16px 0 8px;font-size:.82rem">Prompt video 15 detik</h3>' +
        '<div class="tool-example-card">0–3s ambil dari tas. 3–8s pasang di rambut. 8–12s goyang kepala. 12–15s harga + “isi 6”.</div>' +
        '<div class="tool-example-card">Hook: “Jepit Rp8rb yang cubit kulit vs yang ini.” Jangan sebut kompetitor merek.</div>' +
        '<div class="tool-example-card">Live hook: “Sisa 40 pcs, yang kemarin habis 9 menit.” Hanya kalau stok memang sisa.</div>' +
      '</div></div>';
  }

  function analisaToolHtml() {
    return '<div class="tool-native" id="analisa-tool">' +
      '<h1>Asisten AI Analisa Data</h1>' +
      '<p class="lead">Contoh bacaan atas CSV Kalodata dummy. Bukan API Kalodata.</p>' +
      '<button type="button" class="btn" data-act="tool-reveal" data-target="analisa-body">Lihat contoh</button>' +
      '<div id="analisa-body" hidden>' +
        '<div class="tool-example-card"><strong>Yang dilihat dari export</strong>' +
          '<ol class="muted" style="margin:8px 0 0;padding-left:18px;font-size:.8rem;line-height:1.5">' +
            '<li>GMV 30 hari besar belum berarti komisi aman — cek typical_commission_pct.</li>' +
            '<li>Niche hair-video lebih cocok SKU jepit daripada fashion-live.</li>' +
            '<li>Creator comedy (skor rendah) jangan diantrikan dulu.</li>' +
            '<li>Yang sudah connected tidak makan kuota unconnected.</li>' +
            '<li>Jangan scrape Kalodata. Pakai CSV yang kamu unduh sendiri.</li>' +
          '</ol></div>' +
      '</div></div>';
  }

  function alatName(p) {
    return { calc: 'Kalkulator harga', 'ai-creative': 'AI Creative', 'ai-data': 'AI Analisa', 'laris-aff': 'Laris Affiliate' }[p.id] || p.title;
  }

  function ownCheckHtml(owned, label) {
    return '<span class="own-check' + (owned ? ' is-on' : '') + '" title="' +
      esc(owned ? 'Sudah punya' : 'Belum punya') + '" aria-label="' +
      esc(label || (owned ? 'Sudah punya' : 'Belum punya')) + '">' +
      (owned
        ? '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="#16a34a"/><path d="M5.5 10.2l2.8 2.8 6-6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="1.5" y="1.5" width="17" height="17" rx="4" fill="none" stroke="#71717a" stroke-width="1.6"/></svg>') +
      '</span>';
  }

  function alatHomeStrip(sid) {
    const tools = toolsCatalog();
    const tiles = tools.map((p) => {
      const owned = canSku(sid, p.id);
      return '<button type="button" class="alat-chip' + (owned ? ' is-owned' : ' locked') + '" data-act="' +
        (owned ? 'open-sku' : 'contoh-sku') + '" data-from="alat" data-id="' + esc(p.id) + '">' +
        ownCheckHtml(owned, alatName(p)) +
        '<span><strong>' + esc(alatName(p)) + '</strong>' +
        '<em>' + (owned ? 'Sudah punya · Buka' : 'Belum punya · Contoh') + '</em></span></button>';
    }).join('');
    const kolab = canMentoring(sid)
      ? '<button type="button" class="alat-chip is-owned" data-act="open-kolab">' +
        ownCheckHtml(true, 'Kolab') +
        '<span><strong>Kolab</strong><em>Sudah punya · Cari kreator</em></span></button>'
      : '';
    return '<section class="card" style="margin-top:14px">' +
      '<div class="row" style="justify-content:space-between">' +
        '<h2 style="margin:0">Alat</h2>' +
        '<button type="button" class="btn-sm" data-act="tab" data-id="alat">Lihat semua</button></div>' +
      '<p class="muted">Centang = sudah punya. Kosong = belum. Mentoring: alat −' + toolDiscountPct() + '%.</p>' +
      '<div class="alat-pick">' + tiles + kolab + '</div></section>';
  }

  function alatBadgeHtml(p, owned) {
    if (owned) {
      return '<span class="alat-badge is-ok">' +
        '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.2 6.2 4.8 8.7 9.8 3.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        'Tersedia</span>';
    }
    if (!bundled(p)) {
      return '<span class="alat-badge is-extra">Alat tambahan</span>';
    }
    return '<span class="alat-badge is-lock">Mentoring</span>';
  }
  function alatCardHtml(p, sid) {
    const owned = canSku(sid, p.id);
    const extra = !bundled(p);
    const thumb = p.cover
      ? '<img class="alat-card-cover" src="' + esc(p.cover) + '" alt="">'
      : '<span class="alat-card-cover is-empty" aria-hidden="true"></span>';
    let act = '';
    if (owned) {
      act = '<button type="button" class="btn-sm alat-open" data-act="open-sku" data-from="alat" data-id="' + esc(p.id) + '">Buka →</button>';
    } else if (extra) {
      act = '<div class="alat-buy">' +
        '<span class="alat-price">' + fmtRp(p.price) + ' / satuan</span>' +
        '<a class="btn alat-buy-btn" href="' + esc(p.lynk || SEED.school.lynk) + '" target="_blank" rel="noopener">Beli alat</a>' +
        '<button type="button" class="alat-contoh" data-act="contoh-sku" data-from="alat" data-id="' + esc(p.id) + '">Lihat contoh</button>' +
        '</div>';
    } else if (canMentoring(sid)) {
      act = '<button type="button" class="btn-sm alat-open" data-act="claim-tool" data-from="alat" data-id="' + esc(p.id) + '">Ambil →</button>';
    } else {
      act = '<div class="alat-buy">' +
        '<button type="button" class="btn-sm alat-open" data-act="tab" data-id="daftar">Ikut mentoring</button>' +
        '<button type="button" class="alat-contoh" data-act="contoh-sku" data-from="alat" data-id="' + esc(p.id) + '">Lihat contoh</button>' +
        '</div>';
    }
    return '<article class="alat-card' + (owned ? ' is-owned' : '') + (extra ? ' is-extra' : '') + '">' +
      thumb +
      '<div class="alat-card-body">' +
        '<div class="alat-card-title">' +
          '<h3>' + esc(alatName(p)) + '</h3>' +
          alatBadgeHtml(p, owned) +
        '</div>' +
        '<p class="alat-card-job">' + esc(p.job) + '</p>' +
      '</div>' +
      '<div class="alat-card-act">' + act + '</div></article>';
  }
  function viewAlat() {
    const sid = ui.personaId;
    const tools = toolsCatalog();
    const mentorTools = tools.filter((p) => bundled(p));
    const extraTools = tools.filter((p) => !bundled(p));
    const ownedN = mentorTools.filter((p) => canSku(sid, p.id)).length;
    const waText = 'Halo Anton, mau tanya alat mana yang cocok buat toko saya.';
    return '<div class="alat-page">' +
      '<header class="alat-head">' +
        '<h1>Alat</h1>' +
        '<p class="muted">Tools praktis untuk bantu kamu jualan di TikTok Shop.</p>' +
        '<div class="alat-stats">' +
          '<span class="alat-stat is-ok">' +
            '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="#16a34a"/><path d="M3.4 6.2 5.2 8 8.6 4.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>' +
            ownedN + ' alat tersedia</span>' +
          (extraTools.length
            ? '<span class="alat-stat">' +
              '<span class="alat-stat-dot" aria-hidden="true"></span>' +
              extraTools.length + ' alat tambahan</span>'
            : '') +
        '</div>' +
      '</header>' +
      '<section class="alat-sec">' +
        '<h2>Alat yang termasuk mentoring</h2>' +
        '<p class="muted">' + (canMentoring(sid)
          ? 'Sudah bisa kamu akses sekarang.'
          : 'Buka dengan mentoring. Bisa lihat contoh dulu.') + '</p>' +
        '<div class="alat-cards">' + mentorTools.map((p) => alatCardHtml(p, sid)).join('') + '</div>' +
      '</section>' +
      (extraTools.length
        ? '<section class="alat-sec">' +
            '<h2>Alat tambahan</h2>' +
            '<p class="muted">Tersedia terpisah. Bisa dibeli kapan saja.</p>' +
            '<div class="alat-cards">' + extraTools.map((p) => alatCardHtml(p, sid)).join('') + '</div>' +
          '</section>'
        : '') +
      (canMentoring(sid)
        ? '<button type="button" class="alat-card alat-kolab" data-act="open-kolab">' +
            '<span class="alat-card-cover is-empty" aria-hidden="true"></span>' +
            '<div class="alat-card-body">' +
              '<div class="alat-card-title"><h3>Kolab</h3>' +
                '<span class="alat-badge is-ok">Tersedia</span></div>' +
              '<p class="alat-card-job">Cari kreator dari CSV Kalodata. Bukan produk lynk — khusus mentoring.</p>' +
            '</div>' +
            '<div class="alat-card-act"><span class="btn-sm alat-open">Buka →</span></div>' +
          '</button>'
        : '') +
      '<a class="alat-help" href="' + esc(waLink(ownerWa(), waText)) + '">' +
        '<span class="alat-help-ico" aria-hidden="true">?</span>' +
        '<span>Masih bingung alat mana yang cocok? Tanya Anton di WhatsApp.</span>' +
        '<span class="alat-help-go" aria-hidden="true">›</span></a>' +
      '</div>';
  }

  function viewDiskusiTanya(staff) {
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

  function viewDiskusi(staff) {
    return viewDiskusiApp(true);
  }

  function shrinkImage(file) {
    const maxEdge = 1600;
    const toFile = (source, sw, sh) => new Promise((resolve) => {
      let w = sw;
      let h = sh;
      if (!w || !h) { resolve(file); return; }
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(source, 0, 0, w, h);
      if (source.close) source.close();
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        const base = String(file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
        resolve(new File([blob], base + '.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.85);
    });
    if (window.createImageBitmap) {
      const opts = { imageOrientation: 'from-image' };
      return createImageBitmap(file, opts).then((bmp) => toFile(bmp, bmp.width, bmp.height)).catch(() => {
        return createImageBitmap(file).then((bmp) => toFile(bmp, bmp.width, bmp.height)).catch(() => null);
      });
    }
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        toFile(img, img.naturalWidth || img.width, img.naturalHeight || img.height).then(resolve);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function capturePostBody() {
    const ta = document.querySelector('.dk-compose textarea[name="body"]');
    if (ta) ui.postBody = ta.value;
  }

  async function addPostImages(files) {
    capturePostBody();
    ui.postImages = ui.postImages || [];
    const room = 4 - ui.postImages.length;
    if (room <= 0) {
      toast('Maks 4 foto.');
      return;
    }
    const take = Array.from(files || []).slice(0, room);
    if ((files || []).length > room) toast('Maks 4 foto.');
    for (let i = 0; i < take.length; i += 1) {
      const file = take[i];
      if (file.type && file.type.indexOf('image/') !== 0) {
        toast('Lampiran harus gambar.');
        continue;
      }
      const shrunk = await shrinkImage(file);
      if (!shrunk) {
        toast('Gambar tidak bisa dibaca.');
        continue;
      }
      if (shrunk.size > MAX_IMG) {
        toast('Foto masih di atas 5 MB.');
        continue;
      }
      ui.postImages.push({
        id: 'pi-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36),
        file: shrunk,
        preview: URL.createObjectURL(shrunk)
      });
    }
    render();
  }

  function dropPostMedia(post) {
    (post.images || []).concat(post.files || []).forEach((img) => {
      if (img && img.key) deleteRemoteVideo(img.key);
      if (img && img.blob && img.blobKey) blobDel(img.blobKey);
    });
  }

  async function addPostFiles(files) {
    capturePostBody();
    ui.postFiles = ui.postFiles || [];
    const room = 4 - ui.postFiles.length;
    if (room <= 0) {
      toast('Maks 4 file.');
      return;
    }
    const take = Array.from(files || []).slice(0, room);
    if ((files || []).length > room) toast('Maks 4 file.');
    for (let i = 0; i < take.length; i += 1) {
      const file = take[i];
      if (!file || !file.size) continue;
      if (file.size > MAX_FILE) {
        toast('File maks 20 MB.');
        continue;
      }
      ui.postFiles.push({
        id: 'pf-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36),
        file: file,
        name: file.name || 'file',
        size: file.size
      });
    }
    render();
  }

  async function submitDiskusiPost(body, batchId) {
    ensureDiskusi();
    const text = String(body || '').trim();
    const images = (ui.postImages || []).slice();
    const files = (ui.postFiles || []).slice();
    const poll = pollPayload();
    if (ui.pollOn && !poll) {
      toast('Poll butuh pertanyaan dan minimal 2 opsi.');
      return;
    }
    if (!canPostIn(actorId(), batchId)) {
      toast('Kamu hanya bisa posting di chat yang kamu ikuti.');
      return;
    }
    if (!text && !images.length && !files.length && !poll) {
      toast('Tulis catatan, lampirkan foto atau file, atau buat poll.');
      return;
    }
    if (ui.postUploading) return;
    ui.postBody = text;
    ui.postUploading = true;
    render();
    const postId = 'dk-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    try {
      const stored = [];
      for (let i = 0; i < images.length; i += 1) {
        const file = images[i].file;
        if (syncEnabled()) {
          const info = await uploadClassVideo(file, 'post-' + postId, null, 'image');
          stored.push({
            key: info.key,
            url: mediaFileUrl(info.key),
            name: info.name || file.name,
            blob: false
          });
        } else {
          const blobKey = 'post-' + postId + '-' + i;
          await blobPut(blobKey, file);
          stored.push({ key: '', url: '', name: file.name, blob: true, blobKey: blobKey });
        }
      }
      const storedFiles = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i].file;
        if (syncEnabled()) {
          const info = await uploadClassVideo(file, 'post-file-' + postId, null, 'file');
          storedFiles.push({
            key: info.key,
            url: mediaFileUrl(info.key),
            name: info.name || file.name,
            size: file.size,
            blob: false
          });
        } else {
          const blobKey = 'post-file-' + postId + '-' + i;
          await blobPut(blobKey, file);
          storedFiles.push({ key: '', url: '', name: file.name, size: file.size, blob: true, blobKey: blobKey });
        }
      }
      const post = {
        id: postId,
        batchId: batchId,
        authorId: actorId(),
        body: text,
        images: stored,
        files: storedFiles,
        poll: poll,
        pinned: false,
        createdAt: isoNow()
      };
      db.posts.push(post);
      rememberDiskusiPost(post);
      images.forEach((img) => { if (img.preview) URL.revokeObjectURL(img.preview); });
      ui.postImages = [];
      ui.postFiles = [];
      ui.postBody = '';
      ui.pollOn = false;
      ui.pollQuestion = '';
      ui.pollOptions = ['', ''];
      ui.postUploading = false;
      ui.diskusiScroll = 'bottom';
      save();
      render();
    } catch (err) {
      ui.postUploading = false;
      toast('Gagal unggah lampiran.');
      render();
    }
  }

  function fileExt(name) {
    const m = String(name || '').match(/\.([a-z0-9]{1,5})$/i);
    return m ? m[1].toUpperCase() : 'FILE';
  }
  function postDraftHtml() {
    const imgs = ui.postImages || [];
    const files = ui.postFiles || [];
    if (!imgs.length && !files.length) return '';
    return '<div class="dk-draft">' + imgs.map((img) =>
      '<span class="dk-draft-item">' +
        '<img src="' + esc(img.preview) + '" alt="">' +
        '<button type="button" data-act="post-img-remove" data-id="' + esc(img.id) + '" aria-label="Hapus foto">×</button>' +
      '</span>'
    ).join('') + files.map((file) =>
      '<span class="dk-draft-file">' +
        '<span class="dk-file-ext">' + esc(fileExt(file.name)) + '</span>' +
        '<span class="dk-file-name">' + esc(file.name || 'File') + '</span>' +
        '<button type="button" data-act="post-file-remove" data-id="' + esc(file.id) + '" aria-label="Hapus file">×</button>' +
      '</span>'
    ).join('') + '</div>';
  }

  function readPollDraft() {
    const q = document.querySelector('.dk-compose [data-act="poll-q"]');
    const opts = Array.from(document.querySelectorAll('.dk-compose [data-act="poll-opt"]'));
    if (q) ui.pollQuestion = q.value;
    if (opts.length) ui.pollOptions = opts.map((el) => el.value);
  }
  function pollPayload() {
    readPollDraft();
    if (!ui.pollOn) return null;
    const question = String(ui.pollQuestion || '').trim().slice(0, 200);
    const options = (ui.pollOptions || []).map((s) => String(s || '').trim().slice(0, 80)).filter(Boolean).slice(0, 6);
    if (!question || options.length < 2) return null;
    return {
      question: question,
      options: options.map((text, i) => ({ id: 'o' + i + '-' + Date.now().toString(36), text: text })),
      votes: {}
    };
  }
  function pollEditHtml() {
    if (!ui.pollOn) return '';
    const opts = (ui.pollOptions && ui.pollOptions.length >= 2) ? ui.pollOptions : ['', ''];
    ui.pollOptions = opts;
    return '<div class="dk-poll-edit">' +
      '<input data-act="poll-q" maxlength="200" placeholder="Pertanyaan poll" value="' + esc(ui.pollQuestion || '') + '">' +
      opts.map((text, i) =>
        '<div class="dk-poll-opt">' +
          '<input data-act="poll-opt" data-i="' + i + '" maxlength="80" placeholder="Opsi ' + (i + 1) + '" value="' + esc(text || '') + '">' +
          (opts.length > 2
            ? '<button type="button" data-act="poll-opt-remove" data-i="' + i + '" aria-label="Hapus opsi">×</button>'
            : '') +
        '</div>'
      ).join('') +
      '<div class="dk-poll-edit-row">' +
        (opts.length < 6 ? '<button type="button" class="btn-sm" data-act="poll-add-opt">Tambah opsi</button>' : '') +
        '<button type="button" class="btn-sm" data-act="poll-cancel">Batal</button>' +
      '</div></div>';
  }
  function composerHtml(batchId) {
    if (isSiswaReadonly()) {
      return '<p class="muted dk-compose-locked">Siswa view · hanya lihat (tidak bisa kirim).</p>';
    }
    const uploading = !!ui.postUploading;
    return '<form class="dk-compose" data-act="post-new" data-batch="' + esc(batchId) + '">' +
      postDraftHtml() +
      pollEditHtml() +
      '<div class="dk-bar">' +
        '<label class="dk-tool" title="Foto">Foto' +
          '<input type="file" accept="image/*" multiple hidden data-act="post-files"' + (uploading ? ' disabled' : '') + '>' +
        '</label>' +
        '<label class="dk-tool" title="File">File' +
          '<input type="file" multiple hidden data-act="post-attach"' + (uploading ? ' disabled' : '') + '>' +
        '</label>' +
        '<button type="button" class="dk-tool' + (ui.pollOn ? ' is-on' : '') + '" data-act="poll-toggle"' + (uploading ? ' disabled' : '') + '>Poll</button>' +
        '<textarea name="body" rows="1" maxlength="4000" placeholder="Tulis catatan"' +
          (uploading ? ' disabled' : '') + '>' + esc(ui.postBody || '') + '</textarea>' +
        '<button class="dk-send" type="submit"' + (uploading ? ' disabled' : '') + '>' +
          (uploading ? '…' : 'Kirim') + '</button>' +
      '</div></form>';
  }
  function pollHtml(post) {
    const poll = post && post.poll;
    if (!poll || !Array.isArray(poll.options) || !poll.options.length) return '';
    const votes = poll.votes || {};
    const mine = votes[actorId()] || '';
    const counts = {};
    let total = 0;
    Object.keys(votes).forEach((uid) => {
      const oid = votes[uid];
      if (!oid) return;
      counts[oid] = (counts[oid] || 0) + 1;
      total += 1;
    });
    const can = canPostIn(actorId(), post.batchId);
    return '<div class="dk-poll"><strong>' + esc(poll.question || '') + '</strong>' +
      poll.options.map((opt) => {
        const n = counts[opt.id] || 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return '<button type="button" class="dk-opt' + (mine === opt.id ? ' is-mine' : '') + '" data-act="poll-vote" data-post="' + esc(post.id) + '" data-id="' + esc(opt.id) + '"' + (can ? '' : ' disabled') + '>' +
          '<span class="dk-opt-bar" style="width:' + pct + '%"></span>' +
          '<span class="dk-opt-label">' + esc(opt.text || '') + '</span>' +
          '<span class="dk-opt-n">' + n + '</span></button>';
      }).join('') +
      '<p class="muted">' + total + ' suara</p></div>';
  }

  function postImagesHtml(images) {
    const list = (images || []).filter((img) => img && (img.url || (img.blob && img.blobKey))).slice(0, 4);
    if (!list.length) return '';
    return '<div class="dk-imgs is-' + list.length + '">' + list.map((img) => {
      const inner = img.url
        ? '<img src="' + esc(img.url) + '" alt="' + esc(img.name || '') + '">'
        : '<img data-blob="' + esc(img.blobKey) + '" alt="' + esc(img.name || '') + '">';
      return '<button type="button" class="dk-imgbtn" data-act="post-img">' + inner + '</button>';
    }).join('') + '</div>';
  }

  function postFilesHtml(files) {
    const list = (files || []).filter((file) => file && (file.url || (file.blob && file.blobKey)));
    if (!list.length) return '';
    return '<div class="dk-files">' + list.map((file) => {
      const label = '<span class="dk-file-ext">' + esc(fileExt(file.name)) + '</span>' +
        '<span class="dk-file-name">' + esc(file.name || 'File') + '</span>';
      if (file.url) {
        return '<a class="dk-file" href="' + esc(file.url) + '" target="_blank" rel="noopener" download>' + label + '</a>';
      }
      return '<a class="dk-file" data-blob-href="' + esc(file.blobKey) + '" download="' + esc(file.name || 'file') + '">' + label + '</a>';
    }).join('') + '</div>';
  }

  function commentLikes(row) {
    return Array.isArray(row && row.likes) ? row.likes.filter(Boolean) : [];
  }
  function mentionHtml(body) {
    let html = esc(body || '');
    const names = people().concat(SEED.staff || []).map((p) => p && (displayNameOf(p) || p.name)).filter(Boolean);
    names.sort((a, b) => b.length - a.length);
    names.forEach((name) => {
      const safe = esc('@' + name);
      if (html.indexOf(safe) === -1) return;
      html = html.split(safe).join('<span class="dk-at">' + safe + '</span>');
    });
    return html;
  }
  function replyQuoteHtml(row) {
    if (!row || !row.replyTo) return '';
    const target = (db.comments || []).find((c) => c && c.id === row.replyTo);
    if (!target) return '';
    const snippet = String(target.body || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return '<div class="dk-reply">' +
      '<button type="button" class="dk-quote" data-act="comment-jump" data-id="' + esc(target.id) + '">' +
        '<strong>@' + esc(nameOf(target.authorId)) + '</strong>' +
        '<span>' + esc(snippet || 'Komentar') + '</span>' +
      '</button></div>';
  }
  function commentHtml(row, staff, chatId) {
    const mine = row.authorId === actorId();
    const canDel = staff || mine;
    const likes = commentLikes(row);
    const liked = likes.indexOf(actorId()) !== -1;
    const unread = isUnreadAt(chatId, row.createdAt, row.authorId);
    const canWrite = canPostIn(actorId(), chatId);
    return '<div class="dk-threadlet">' +
      replyQuoteHtml(row) +
      '<div class="dk-comment' + (row.replyTo ? ' is-reply' : '') + '" id="dkc-' + esc(row.id) + '"' +
        (unread ? ' data-unread="1" data-unread-at="' + esc(row.createdAt) + '"' : '') + '>' +
        (row.replyTo ? '<span class="dk-reply-arrow" aria-hidden="true"></span>' : '') +
        actorAvatar(row.authorId, 'avatar sm') +
        '<div class="dk-comment-body">' +
          '<strong>' + esc(nameOf(row.authorId)) + '</strong>' +
          '<span class="muted"> · ' + esc(relWhen(row.createdAt)) + '</span>' +
          '<p>' + mentionHtml(row.body) + '</p>' +
          '<div class="dk-comment-acts">' +
            (canWrite
              ? '<button type="button" class="dk-like' + (liked ? ' is-on' : '') + '" data-act="comment-like" data-id="' + esc(row.id) + '" aria-pressed="' + (liked ? 'true' : 'false') + '">' +
                  (liked ? '♥' : '♡') + (likes.length ? '<span>' + likes.length + '</span>' : '') + '</button>' +
                '<button type="button" class="dk-reply-btn" data-act="comment-reply" data-id="' + esc(row.id) + '" data-post="' + esc(row.postId) + '">Balas</button>'
              : '') +
          '</div>' +
        '</div>' +
        (canDel
          ? '<button type="button" class="btn-sm" data-act="comment-del" data-id="' + esc(row.id) + '">Hapus</button>'
          : '') +
      '</div></div>';
  }

  function postsInBatch(batchId) {
    return (db.posts || []).filter((p) => p && p.batchId === batchId).slice().sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
  }

  function commentFormHtml(post) {
    const reply = ui.replyTo && ui.replyTo.postId === post.id ? ui.replyTo : null;
    const target = reply && (db.comments || []).find((c) => c && c.id === reply.commentId && c.postId === post.id);
    const draft = (ui.commentDrafts && ui.commentDrafts[post.id]) || '';
    const snippet = target ? String(target.body || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const bar = target
      ? '<div class="dk-replying">' +
          '<span class="dk-reply-arrow" aria-hidden="true"></span>' +
          '<span class="dk-replying-copy"><strong>@' + esc(nameOf(target.authorId)) + '</strong> ' + esc(snippet || 'Komentar') + '</span>' +
          '<button type="button" data-act="comment-reply-clear" aria-label="Batal balas">×</button></div>'
      : '';
    if (isSiswaReadonly()) return '';
    return '<form class="dk-comment-form" data-act="post-comment" data-id="' + esc(post.id) + '" data-reply="' + esc(target ? target.id : '') + '">' +
      bar +
      '<div class="dk-comment-row">' +
        '<input name="body" required maxlength="2000" placeholder="' + (target ? 'Balas @' + esc(nameOf(target.authorId)) : 'Komentar') + '" value="' + esc(draft) + '">' +
        '<button class="btn" type="submit">Kirim</button>' +
      '</div></form>';
  }
  function postCardHtml(post, staff) {
    const mine = post.authorId === actorId();
    const comments = (db.comments || []).filter((c) => c && c.postId === post.id).slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const canDel = !!staff || mine;
    const canWrite = canPostIn(actorId(), post.batchId);
    const firstUnread = firstUnreadElId(post.batchId);
    const postUnread = isUnreadAt(post.batchId, post.createdAt, post.authorId);
    return (firstUnread === 'dkp-' + post.id ? '<div class="dk-unread-line">Belum dibaca</div>' : '') +
      '<article class="dk-post' + (post.pinned ? ' is-pinned' : '') + '" id="dkp-' + esc(post.id) + '"' +
        (postUnread ? ' data-unread="1" data-unread-at="' + esc(post.createdAt) + '"' : '') + '>' +
      '<header class="dk-post-h">' +
        actorAvatar(post.authorId, 'avatar') +
        '<div><strong>' + esc(nameOf(post.authorId)) + '</strong>' +
          '<div class="muted">' + esc(relWhen(post.createdAt)) + (post.pinned ? ' · Disematkan' : '') + '</div></div>' +
        '<div class="dk-post-acts">' +
          (staff
            ? '<button type="button" class="btn-sm" data-act="post-pin" data-id="' + esc(post.id) + '">' +
                (post.pinned ? 'Lepas' : 'Sematkan') + '</button>'
            : '') +
          (canDel
            ? '<button type="button" class="btn-sm" data-act="post-del" data-id="' + esc(post.id) + '">Hapus</button>'
            : '') +
        '</div>' +
      '</header>' +
      (post.body ? '<div class="dk-body">' + mdish(post.body) + '</div>' : '') +
      postImagesHtml(post.images) +
      postFilesHtml(post.files) +
      pollHtml(post) +
      '<div class="dk-comments">' +
        comments.map((c) =>
          (firstUnread === 'dkc-' + c.id ? '<div class="dk-unread-line">Belum dibaca</div>' : '') +
          commentHtml(c, staff, post.batchId)
        ).join('') +
        (canWrite ? commentFormHtml(post) : '') +
      '</div></article>';
  }

  function chatPeopleHtml(chatId, staff) {
    if (!ui.chatPeopleOpen || !chatId) return '';
    const q = String(ui.chatPeopleQ || '').trim().toLowerCase();
    const members = chatMembers(chatId).map((sid) => people().find((s) => s.id === sid)).filter(Boolean);
    const shownMembers = members.filter((s) => !q || String(s.name || '').toLowerCase().indexOf(q) !== -1);
    const candidates = staff
      ? people().filter((s) => s && members.every((m) => m.id !== s.id) && (!q || String(s.name || '').toLowerCase().indexOf(q) !== -1))
      : [];
    return '<aside class="dk-people">' +
      '<header><strong>Orang</strong>' +
        '<button type="button" class="btn-sm" data-act="chat-people-close">Tutup</button></header>' +
      '<input data-act="chat-people-q" placeholder="' + (staff ? 'Cari siswa untuk ditambah' : 'Cari orang') + '" value="' + esc(ui.chatPeopleQ || '') + '">' +
      '<p class="muted dk-people-note">Siswa bulan bayar masuk otomatis. Tambahan tetap di chat ini.</p>' +
      '<div class="dk-people-list">' +
        (shownMembers.length ? shownMembers.map((s) =>
          '<div class="dk-mem">' + actorAvatar(s.id, 'avatar sm') +
            '<span>' + esc(s.name || '') + '</span>' +
            (staff ? '<button type="button" class="btn-sm" data-act="chat-member-remove" data-chat="' + esc(chatId) + '" data-id="' + esc(s.id) + '">Keluarkan</button>' : '') +
          '</div>'
        ).join('') : '<p class="muted">Belum ada yang cocok.</p>') +
      '</div>' +
      (staff
        ? '<p class="dk-people-add">Tambah</p><div class="dk-people-list">' +
          (candidates.length ? candidates.map((s) =>
            '<div class="dk-mem">' + actorAvatar(s.id, 'avatar sm') +
              '<span>' + esc(s.name || '') + '</span>' +
              '<button type="button" class="btn-sm" data-act="chat-member-add" data-chat="' + esc(chatId) + '" data-id="' + esc(s.id) + '">Tambah</button>' +
            '</div>'
          ).join('') : '<p class="muted">Semua siswa yang cocok sudah di chat ini.</p>') +
          '</div>'
        : '') +
      '</aside>';
  }
  function viewDiskusiApp(staff) {
    ensureDiskusi();
    const tanya = !!staff && ui.diskusiSub === 'tanya';
    const list = visibleChats();
    const batchId = tanya ? '' : activeDiskusiBatch();
    const showList = staff ? !!ui.diskusiShowList : (!ui.diskusiOpened || !!ui.diskusiShowList);
    const rows = list.map((c) => {
      const unread = c.unread || 0;
      return '<button type="button" class="dk-row' + (unread ? ' is-unread' : '') + '" data-act="diskusi-batch" data-id="' + esc(c.id) + '" aria-selected="' + (!tanya && c.id === batchId) + '">' +
        '<span class="dk-mark" aria-hidden="true">' + esc(initialsOf(c.label)) + '</span>' +
        '<span class="dk-row-copy"><strong>' + esc(c.label) + '</strong>' +
          '<em>' + esc(c.preview) + '</em></span>' +
        '<span class="dk-row-meta">' + (c.when ? '<time>' + esc(c.when) + '</time>' : '') +
          '<span class="dk-members">' + c.count + '</span>' +
          (unread ? '<span class="dk-badge">' + (unread > 99 ? '99+' : unread) + '</span>' : '') +
        '</span>' +
      '</button>';
    }).join('');
    const tanyaRow = staff
      ? '<button type="button" class="dk-row dk-row-tanya" data-act="diskusi-sub" data-id="tanya" aria-selected="' + tanya + '">' +
          '<span class="dk-mark" aria-hidden="true">?</span>' +
          '<span class="dk-row-copy"><strong>Tanya materi</strong><em>Pertanyaan dan pengumuman</em></span>' +
        '</button>'
      : '';
    const listHtml = '<aside class="dk-list"><div class="dk-list-h"><strong>Chat</strong><span class="dk-list-tools">' +
      unreadJumpHtml() +
      (staff ? '<button type="button" class="btn-sm" data-act="chat-new">Chat baru</button>' : '') +
      '</span></div><div class="dk-list-scroll">' +
      (rows || '<p class="muted dk-list-empty">Belum ada chat.</p>') +
      tanyaRow +
      '</div></aside>';
    let thread = '';
    if (tanya) {
      thread = '<section class="dk-thread"><header class="dk-thread-h">' +
        '<button type="button" class="dk-back" data-act="diskusi-back" aria-label="Daftar chat">‹</button>' +
        '<h2>Tanya materi</h2></header>' +
        '<div class="dk-feed">' + viewDiskusiTanya(true) + '</div></section>';
    } else if (!batchId) {
      thread = '<section class="dk-thread"><header class="dk-thread-h"><h2>Diskusi</h2></header>' +
        '<div class="dk-feed"><p class="muted">Pilih chat di samping. Kalau belum ada, Anton yang menambahkan kamu.</p></div></section>';
    } else {
      const info = list.find((c) => c.id === batchId);
      const count = info ? info.count : chatMembers(batchId).length;
      const can = canPostIn(actorId(), batchId);
      const posts = postsInBatch(batchId);
      const title = staff
        ? '<input class="dk-title" data-act="chat-rename" data-id="' + esc(batchId) + '" maxlength="60" value="' + esc(batchLabel(batchId)) + '" aria-label="Nama chat">'
        : '<h2>' + esc(batchLabel(batchId)) + '</h2>';
      thread = '<section class="dk-thread"><header class="dk-thread-h">' +
        '<button type="button" class="dk-back" data-act="diskusi-back" aria-label="Daftar chat">‹</button>' +
        title +
        unreadJumpHtml() +
        '<button type="button" class="dk-count" data-act="chat-people">' + count + ' orang</button>' +
        (staff ? '<button type="button" class="btn-sm" data-act="chat-people">Tambah orang</button>' : '') +
        '</header>' +
        '<div class="dk-feed">' +
          (posts.length
            ? posts.map((p) => postCardHtml(p, !!staff)).join('')
            : '<p class="muted dk-empty-note">Belum ada catatan. Tulis di bawah, tempel foto, lampirkan file, atau buat poll.</p>') +
        '</div>' +
        (can ? composerHtml(batchId) : '<p class="muted dk-compose-locked">Kamu belum masuk chat ini.</p>') +
        chatPeopleHtml(batchId, !!staff) +
        '</section>';
    }
    return '<div class="dk-shell' + (showList ? ' is-list' : ' is-thread') + '">' + listHtml + thread + '</div>';
  }
  function viewDiskusiFeed(staff) {
    return viewDiskusiApp(!!staff);
  }

  function mountLightbox() {
    let el = document.getElementById('dk-lightbox');
    if (!ui.lightbox) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'dk-lightbox';
      el.className = 'dk-lightbox';
      el.setAttribute('data-act', 'lightbox-close');
      document.body.appendChild(el);
    }
    const img = el.querySelector('img');
    if (!img || img.getAttribute('src') !== ui.lightbox) {
      el.innerHTML = '<img src="' + esc(ui.lightbox) + '" alt="">';
    }
  }

  function viewProgres() {
    const sid = ui.personaId;
    const bill = billingOf(sid);
    const unpaid = !canMentoring(sid);
    const preview = canPreview(sid) && unpaid;

    if (unpaid) {
      const owned = catalog().filter((x) => canSku(sid, x.id));
      return '<div class="progres-unpaid">' +
        (preview || db.applications[sid] ? offerBanner(sid) : '') +
        progresKurikulumBlock(sid) +
        '<section class="card">' +
          '<h2>Status kamu</h2>' +
          '<p class="muted" style="margin-top:0">' +
            (isDone(sid, firstLectureId())
              ? 'Video 1 selesai. Modul lain masih blur sampai lunas.'
              : 'Belum selesai video 1 — nonton ≥85% di tab Belajar.') +
          '</p>' +
          '<p>Bayar: ' + payChip(bill.status, bill.source) +
            ' <span class="muted">' + esc(bill.note || bill.plan || crmOf(sid).stage) + '</span></p>' +
          (owned.length
            ? '<p class="muted" style="margin-top:8px">Alat punya: ' +
              owned.map((x) => esc(alatName(x))).join(', ') + '</p>'
            : '') +
          '<div class="row" style="margin-top:14px">' +
            '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button>' +
            '<button class="btn secondary" data-act="tab" data-id="belajar">' +
              (isDone(sid, firstLectureId()) ? 'Buka Belajar' : 'Lanjut video 1') +
            '</button>' +
          '</div>' +
        '</section></div>';
    }

    const hadir = hadirPct(sid);
    const p = kurProgress(sid);
    const kolabOpened = !!(db.kolab[sid] && db.kolab[sid].jobs && db.kolab[sid].jobs.length);
    const c = crmOf(sid);
    const doneAll = p.n >= p.total && p.total > 0;
    return '<div class="grid-2">' +
      progresKurikulumBlock(sid) +
      '<section class="card">' +
        '<h2>Status</h2>' +
        '<p>Kurikulum: <strong>' + p.n + ' / ' + p.total + '</strong> · ' + p.pct + '%</p>' +
        '<p>Hadir: <strong>' + hadir + '%</strong></p>' +
        '<p>Bayar: ' + payChip(bill.status, bill.source) + ' <span class="muted">' + esc(bill.note || bill.plan || '') +
        (bill.accessUntil ? ' · sampai ' + fmtWhen(bill.accessUntil) : '') + '</span></p>' +
        '<h3 style="margin-top:16px">Lencana (kejadian nyata)</h3>' +
        '<p class="muted">' +
          (isDone(sid, firstLectureId()) ? '✓ Masuk kelas (video 1 ≥85%). ' : 'Belum mulai video 1. ') +
          (kolabOpened ? '✓ Antri Kolab. ' : '') +
          (hadir >= 50 ? '✓ Hadir ≥ setengah sesi.' : 'Hadir masih di bawah setengah sesi.') +
        '</p>' +
        (doneAll && !c.examScore
          ? '<h3 style="margin-top:16px">Tes akhir</h3><p class="muted">Satu duduk. Lulus = sertifikat.</p>' +
            '<button class="btn" data-act="tab" data-id="tes">Mulai tes</button>'
          : '') +
        (c.examScore != null
          ? '<p style="margin-top:12px">Tes: <strong>' + c.examScore + ' / ' + (SEED.exam.questions.length) + '</strong>' +
            (c.eligibleMentor ? ' · lulus, layak jadi mentor' : ' · belum lulus') + '</p>' +
            (c.certSerial ? '<button class="btn secondary" data-act="tab" data-id="sertifikat">Lihat sertifikat</button>' : '')
          : '') +
        (c.eligibleMentor && c.stage !== 'mentor'
          ? '<div class="card" style="margin-top:12px"><h3>Jadi mentor</h3>' +
            '<p class="muted">Pakai kurikulum dan nama Anton. Kamu tarik bayaran muridmu sendiri. Anton menerima <strong>' +
            (db.pricing.overridePct || 20) + '% licensing</strong>. Satu tingkat, bukan piramida.</p>' +
            '<button class="btn" data-act="accept-mentor">Saya paham, terima peran mentor</button></div>'
          : '') +
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
    const sid = isStaff() ? (ui.personId || ui.personaId) : ui.personaId;
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
      '<div>' + payChip(billingOf(sid).status, billingOf(sid).source) + ' <span class="muted">' + esc(nameOf(sid)) + '</span></div></div>' +
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

  function viewExam() {
    const sid = ui.personaId;
    const p = kurProgress(sid);
    if (p.n < p.total) {
      return '<div class="locked"><h2>Tes setelah 12 video</h2><p class="muted">Selesaikan kurikulum dulu. Skor tidak dikarang.</p></div>';
    }
    const qs = SEED.exam.questions;
    return '<section class="card"><h2>Tes akhir program</h2>' +
      '<p class="muted">Lulus ' + SEED.exam.passMark + ' dari ' + qs.length + '. Jawaban contoh dari materi Anton, bukan AI certainty.</p>' +
      '<form data-act="exam">' +
      qs.map((q, i) =>
        '<fieldset class="quiz-q"><p><strong>' + (i + 1) + '.</strong> ' + esc(q.q) + '</p>' +
        q.choices.map((ch, j) =>
          '<label class="muted" style="display:block;margin:6px 0"><input type="radio" name="q' + i + '" value="' + j + '"' +
          (String(ui.examAnswers[i]) === String(j) ? ' checked' : '') + '> ' + esc(ch) + '</label>'
        ).join('') + '</fieldset>'
      ).join('') +
      '<button class="btn" type="submit">Kirim jawaban</button></form></section>';
  }
  function viewSertifikat(id) {
    const s = people().find((x) => x.id === id) || student();
    const c = crmOf(id);
    if (!c.certSerial) return '<p class="muted">Belum ada sertifikat.</p>';
    return '<section class="card cert-sheet">' +
      '<p class="muted">Sertifikat kelas · serial ' + esc(c.certSerial) + '</p>' +
      '<h2>MasterMind with Anton GC</h2>' +
      '<p>Menerangkan bahwa</p>' +
      '<h3>' + esc(s.name) + '</h3>' +
      '<p>menyelesaikan kurikulum mentoring dan lulus tes akhir (' + esc(c.examScore) + '/' + SEED.exam.questions.length + ').</p>' +
      '<p class="muted">Diterbitkan ' + fmtWhen(c.examAt) + '. Pengakuan prestasi nyata — bukan kelangkaan palsu.</p>' +
      (c.eligibleMentor ? '<p>Status: layak diajukan jadi mentor (licensing 20% disampaikan sebelum terima).</p>' : '') +
      '<button class="btn secondary" data-act="print-cert">Cetak / PDF</button></section>';
  }

  /* ── mentor views ────────────────────────────────────────────────── */
  function dashBounds() {
    const today = splitLocal().date;
    const endIso = joinLocal(today, '23:59');
    const endMs = new Date(endIso).getTime() + 999;
    const range = ui.dashRange || '30';
    if (range === 'custom') {
      let from = ui.dashFrom || today;
      let to = ui.dashTo || today;
      if (from > to) { const x = from; from = to; to = x; }
      return {
        fromMs: new Date(joinLocal(from, '00:00')).getTime(),
        toMs: new Date(joinLocal(to, '23:59')).getTime() + 999,
        fromYmd: from,
        toYmd: to,
        label: from + ' → ' + to
      };
    }
    if (range === 'ytd') {
      const y = today.slice(0, 4);
      const from = y + '-01-01';
      return {
        fromMs: new Date(joinLocal(from, '00:00')).getTime(),
        toMs: endMs,
        fromYmd: from,
        toYmd: today,
        label: 'YTD ' + y
      };
    }
    const days = Number(range) || 30;
    const endDay = new Date(joinLocal(today, '12:00'));
    const startDay = new Date(endDay.getTime());
    startDay.setDate(startDay.getDate() - (days - 1));
    const fromYmd = splitLocal(startDay.toISOString()).date;
    return {
      fromMs: new Date(joinLocal(fromYmd, '00:00')).getTime(),
      toMs: endMs,
      fromYmd: fromYmd,
      toYmd: today,
      label: days + ' hari'
    };
  }
  function inDashRange(iso, bounds) {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= bounds.fromMs && t <= bounds.toMs;
  }
  function dashPersonRow(id, at, detail, amount) {
    return {
      id: id,
      at: at || '',
      detail: detail || '',
      amount: Math.max(0, Number(amount) || 0)
    };
  }
  function dashSortRows(rows) {
    return rows.slice().sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
  }
  function dashStats(bounds) {
    const joined = [];
    Object.keys(db.applications || {}).forEach((id) => {
      const a = db.applications[id];
      if (a && inDashRange(a.at, bounds)) {
        joined.push(dashPersonRow(id, a.at, 'Isi form aplikasi'));
      }
    });
    const paidMap = {};
    const continuedMap = {};
    const mentorMap = {};
    const skuMap = {};
    const totalMap = {};
    let mentorMoney = 0;
    let skuMoney = 0;
    paymentsList().forEach((p) => {
      if (!p || !inDashRange(p.at, bounds)) return;
      const amt = Math.max(0, Number(p.amount) || 0);
      const pid = p.personId;
      if (p.kind === 'sku') {
        skuMoney += amt;
        if (!skuMap[pid]) skuMap[pid] = dashPersonRow(pid, p.at, 'Beli produk', 0);
        skuMap[pid].amount += amt;
        if (p.at > skuMap[pid].at) skuMap[pid].at = p.at;
        if (!totalMap[pid]) totalMap[pid] = dashPersonRow(pid, p.at, 'Pembayaran', 0);
        totalMap[pid].amount += amt;
        if (p.at > totalMap[pid].at) totalMap[pid].at = p.at;
        return;
      }
      mentorMoney += amt;
      const label = p.kind === 'renewal' ? 'Perpanjang mentoring' : 'Bayar mentoring';
      if (p.kind === 'renewal') {
        if (!continuedMap[pid]) continuedMap[pid] = dashPersonRow(pid, p.at, label, 0);
        continuedMap[pid].amount += amt;
        if (p.at > continuedMap[pid].at) continuedMap[pid].at = p.at;
      } else {
        if (!paidMap[pid]) paidMap[pid] = dashPersonRow(pid, p.at, label, 0);
        paidMap[pid].amount += amt;
        if (p.at > paidMap[pid].at) paidMap[pid].at = p.at;
      }
      if (!mentorMap[pid]) mentorMap[pid] = dashPersonRow(pid, p.at, label, 0);
      mentorMap[pid].amount += amt;
      if (p.at > mentorMap[pid].at) {
        mentorMap[pid].at = p.at;
        mentorMap[pid].detail = label;
      }
      if (!totalMap[pid]) totalMap[pid] = dashPersonRow(pid, p.at, 'Pembayaran', 0);
      totalMap[pid].amount += amt;
      if (p.at > totalMap[pid].at) totalMap[pid].at = p.at;
    });
    const ended = [];
    people().forEach((s) => {
      const c = crmOf(s.id);
      if (c.stage !== 'sudah_keluar' && c.stage !== 'tidak_tertarik') return;
      const at = c.endedAt || c.notInterestedAt;
      if (!inDashRange(at, bounds)) return;
      ended.push(dashPersonRow(s.id, at, stageLabel(c.stage)));
    });
    const lists = {
      joined: dashSortRows(joined),
      paid: dashSortRows(Object.values(paidMap)),
      continued: dashSortRows(Object.values(continuedMap)),
      ended: dashSortRows(ended),
      mentor: dashSortRows(Object.values(mentorMap)),
      sku: dashSortRows(Object.values(skuMap)),
      total: dashSortRows(Object.values(totalMap))
    };
    return {
      joined: lists.joined.length,
      paid: lists.paid.length,
      continued: lists.continued.length,
      ended: lists.ended.length,
      mentorMoney: mentorMoney,
      skuMoney: skuMoney,
      totalMoney: mentorMoney + skuMoney,
      lists: lists
    };
  }
  function fmtDashDay(ymd) {
    if (!ymd) return '—';
    try {
      return new Date(ymd + 'T12:00:00+07:00').toLocaleDateString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta'
      });
    } catch (e) { return ymd; }
  }
  function dashMonthKey(iso) {
    const ymd = ymdOf(iso);
    return ymd ? ymd.slice(0, 7) : '';
  }
  function dashMonthSeries(bounds) {
    const endYmd = bounds.toYmd || splitLocal().date;
    const endParts = endYmd.split('-').map(Number);
    let y = endParts[0];
    let m = endParts[1];
    const startYmd = bounds.fromYmd || endYmd;
    const startKey = startYmd.slice(0, 7);
    const keys = [];
    for (let i = 0; i < 18; i++) {
      const key = y + '-' + String(m).padStart(2, '0');
      keys.unshift(key);
      if (key <= startKey && keys.length >= 6) break;
      if (keys.length >= 12) break;
      m -= 1;
      if (m < 1) { m = 12; y -= 1; }
    }
    if (keys.length < 6) {
      while (keys.length < 6) {
        m -= 1;
        if (m < 1) { m = 12; y -= 1; }
        keys.unshift(y + '-' + String(m).padStart(2, '0'));
      }
    }
    const by = {};
    keys.forEach((k) => { by[k] = { key: k, mentor: 0, sku: 0, total: 0 }; });
    paymentsList().forEach((p) => {
      if (!p || !p.at) return;
      const key = dashMonthKey(p.at);
      if (!by[key]) return;
      const amt = Math.max(0, Number(p.amount) || 0);
      if (p.kind === 'sku') by[key].sku += amt;
      else by[key].mentor += amt;
      by[key].total += amt;
    });
    return keys.map((k) => {
      const row = by[k];
      const label = new Date(k + '-01T12:00:00+07:00').toLocaleDateString('id-ID', {
        month: 'short', year: '2-digit', timeZone: 'Asia/Jakarta'
      });
      return Object.assign({ label: label }, row);
    });
  }
  function dashIncomeChartSvg(series) {
    const W = 640;
    const H = 220;
    const padL = 52;
    const padR = 16;
    const padT = 18;
    const padB = 36;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxV = Math.max(1, ...series.map((s) => s.total));
    const n = Math.max(1, series.length - 1);
    const xAt = (i) => padL + (series.length === 1 ? innerW / 2 : (i / n) * innerW);
    const yAt = (v) => padT + innerH - (v / maxV) * innerH;
    const line = (key, cls) => {
      const pts = series.map((s, i) => xAt(i).toFixed(1) + ',' + yAt(s[key]).toFixed(1)).join(' ');
      return '<polyline class="' + cls + '" fill="none" points="' + pts + '"></polyline>' +
        series.map((s, i) =>
          '<circle class="' + cls + '-dot" cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(s[key]).toFixed(1) +
          '" r="3.5"><title>' + esc(s.label) + ': ' + esc(fmtRp(s[key])) + '</title></circle>'
        ).join('');
    };
    const axisLabel = (v) => {
      if (!v) return '0';
      if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'jt';
      if (v >= 1e3) return Math.round(v / 1e3) + 'rb';
      return String(Math.round(v));
    };
    const grid = [0, 0.5, 1].map((t) => {
      const y = yAt(maxV * t);
      return '<line class="dash-chart-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y.toFixed(1) +
        '" y2="' + y.toFixed(1) + '"></line>' +
        '<text class="dash-chart-axis" x="' + (padL - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' +
        esc(axisLabel(maxV * t)) + '</text>';
    }).join('');
    const labels = series.map((s, i) =>
      '<text class="dash-chart-axis" x="' + xAt(i).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle">' +
      esc(s.label) + '</text>'
    ).join('');
    return '<svg class="dash-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafik uang masuk per bulan">' +
      grid + line('mentor', 'dash-line-mentor') + line('sku', 'dash-line-sku') + line('total', 'dash-line-total') + labels +
    '</svg>';
  }
  function dashFocusMeta(id) {
    return {
      joined: { title: 'Gabung form', empty: 'Belum ada yang isi form di rentang ini.' },
      paid: { title: 'Bayar mentoring', empty: 'Belum ada pembayaran mentoring pertama.' },
      continued: { title: 'Lanjut / perpanjang', empty: 'Belum ada yang perpanjang di rentang ini.' },
      ended: { title: 'Berakhir', empty: 'Tidak ada yang keluar di rentang ini.' },
      mentor: { title: 'Uang mentoring', empty: 'Belum ada uang mentoring.' },
      sku: { title: 'Uang produk', empty: 'Belum ada pembelian produk.' },
      total: { title: 'Semua pembayaran', empty: 'Belum ada uang masuk.' }
    }[id] || { title: 'Detail', empty: 'Kosong.' };
  }
  function dashListHtml(focus, lists) {
    if (!focus || !lists[focus]) return '';
    const meta = dashFocusMeta(focus);
    const rows = lists[focus] || [];
    const showMoney = focus === 'mentor' || focus === 'sku' || focus === 'total' || focus === 'paid' || focus === 'continued';
    return '<section class="dash-list" aria-live="polite">' +
      '<div class="dash-list-head">' +
        '<h3>' + esc(meta.title) + ' · ' + rows.length + '</h3>' +
        '<button type="button" class="dash-list-close" data-act="dash-focus" data-id="">Tutup</button>' +
      '</div>' +
      (rows.length
        ? '<ul class="dash-list-ul">' + rows.map((r) => {
            const s = people().find((p) => p.id === r.id) || { id: r.id, name: nameOf(r.id) };
            return '<li>' +
              '<button type="button" class="dash-list-row" data-act="open-student" data-id="' + esc(r.id) + '">' +
                avatarHtml(s, 'avatar sm') +
                '<span class="dash-list-main">' +
                  '<strong>' + esc(s.name || r.id) + '</strong>' +
                  '<span class="dash-list-meta">' + esc(r.detail || stageLabel(crmOf(r.id).stage)) +
                    (r.at ? ' · ' + esc(fmtWhen(r.at)) : '') + '</span>' +
                '</span>' +
                (showMoney && r.amount
                  ? '<span class="dash-list-amt">' + esc(fmtRp(r.amount)) + '</span>'
                  : '') +
              '</button>' +
            '</li>';
          }).join('') + '</ul>'
        : '<p class="dash-list-empty">' + esc(meta.empty) + '</p>') +
    '</section>';
  }
  function viewDashboard() {
    const bounds = dashBounds();
    const st = dashStats(bounds);
    const series = dashMonthSeries(bounds);
    const ranges = [
      { id: '7', label: '7' },
      { id: '14', label: '14' },
      { id: '30', label: '30' },
      { id: '60', label: '60' },
      { id: '90', label: '90' },
      { id: 'ytd', label: 'YTD' },
      { id: 'custom', label: 'Custom' }
    ];
    const cur = ui.dashRange || '30';
    const focus = ui.dashFocus || '';
    const today = splitLocal().date;
    const fromVal = ui.dashFrom || bounds.fromYmd || today;
    const toVal = ui.dashTo || bounds.toYmd || today;
    const card = (id, label, value, sub) =>
      '<button type="button" class="dash-card' + (focus === id ? ' is-on' : '') +
        '" data-act="dash-focus" data-id="' + esc(id) + '" aria-pressed="' + (focus === id) + '">' +
        '<div class="dash-card-label">' + esc(label) + '</div>' +
        '<div class="dash-card-value">' + value + '</div>' +
        (sub ? '<div class="dash-card-sub">' + esc(sub) + '</div>' : '') +
      '</button>';
    return '<div class="dash-page">' +
      '<div class="hub-head">' +
        '<div><h2 style="margin:0">Dashboard</h2>' +
          '<p class="dash-sub">' + esc(fmtDashDay(bounds.fromYmd)) + ' – ' + esc(fmtDashDay(bounds.toYmd)) +
          ' · WIB · klik kartu untuk daftar siswa</p></div>' +
      '</div>' +
      '<div class="dash-range" role="group" aria-label="Rentang waktu">' +
        ranges.map((r) =>
          '<button type="button" class="dash-range-btn" data-act="dash-range" data-id="' + r.id +
            '" aria-selected="' + (cur === r.id) + '">' + esc(r.label) + '</button>'
        ).join('') +
      '</div>' +
      (cur === 'custom'
        ? '<div class="dash-custom">' +
            '<label>Dari <input type="date" data-act="dash-from" value="' + esc(fromVal) + '"></label>' +
            '<label>Sampai <input type="date" data-act="dash-to" value="' + esc(toVal) + '"></label>' +
            '<button type="button" class="btn-sm dash-apply" data-act="dash-apply">Terapkan</button>' +
          '</div>'
        : '') +
      '<div class="dash-grid">' +
        card('joined', 'Gabung form', String(st.joined), 'Isi aplikasi di rentang ini') +
        card('paid', 'Bayar', String(st.paid), 'Bayar mentoring pertama') +
        card('continued', 'Lanjut', String(st.continued), 'Perpanjang / renewal') +
        card('ended', 'Berakhir', String(st.ended), 'Sudah keluar / tidak tertarik') +
      '</div>' +
      '<div class="dash-money">' +
        '<h3>Uang masuk</h3>' +
        '<div class="dash-grid dash-grid-money">' +
          card('mentor', 'Mentoring', esc(fmtRp(st.mentorMoney)), 'Termasuk perpanjang') +
          card('sku', 'Produk', esc(fmtRp(st.skuMoney)), 'Pembelian SKU / lynk') +
          card('total', 'Total', esc(fmtRp(st.totalMoney)), 'Mentoring + produk') +
        '</div>' +
      '</div>' +
      dashListHtml(focus, st.lists) +
      '<section class="dash-chart">' +
        '<div class="dash-chart-head">' +
          '<h3>Pendapatan per bulan</h3>' +
          '<div class="dash-legend">' +
            '<span class="dash-leg dash-leg-total">Total</span>' +
            '<span class="dash-leg dash-leg-mentor">Mentoring</span>' +
            '<span class="dash-leg dash-leg-sku">Produk</span>' +
          '</div>' +
        '</div>' +
        dashIncomeChartSvg(series) +
      '</section>' +
      '<p class="dash-footnote">Angka dari ledger pembayaran &amp; form. Beasiswa (Rp0) tidak menambah uang masuk. Anton merchant — LarisID tidak menahan uang.</p>' +
    '</div>';
  }
  function hubSeg() {
    const cam = ui.siswaView || 'pipa';
    const items = [
      { id: 'daftar', label: 'Daftar' },
      { id: 'pipa', label: 'Pipa' },
      { id: 'progres', label: 'Progres' }
    ];
    return '<div class="hub-seg" role="tablist">' + items.map((t) =>
      '<button type="button" data-act="siswa-view" data-id="' + t.id + '" aria-selected="' + (cam === t.id) + '">' + t.label + '</button>'
    ).join('') + '</div>';
  }
  function pipaSettingsPanelHtml() {
    const stages = pipelineStages();
    const transitions = pipelineTransitions();
    const delId = ui.pipaDeleteId;
    const delStage = delId && stages.find((s) => s.id === delId);
    const delCount = delId ? peopleInStage(delId).length : 0;
    const stageOpts = (cur, skip) => stages.filter((s) => s.id !== skip).map((s) =>
      '<option value="' + esc(s.id) + '"' + (cur === s.id ? ' selected' : '') + '>' + esc(s.label) + '</option>'
    ).join('');
    const eventOpts = (cur) => PIPE_EVENTS.map((e) =>
      '<option value="' + esc(e.id) + '"' + (cur === e.id ? ' selected' : '') + '>' + esc(e.label) + '</option>'
    ).join('');
    const stageRows = stages.map((st, i) =>
      '<div class="pipa-stage-row" draggable="true" data-sid="' + esc(st.id) + '" data-drag="pipa-stage">' +
        '<span class="pipa-stage-grip" title="Geser untuk urutkan" aria-hidden="true">⋮⋮</span>' +
        '<label class="pipa-stage-swatch" title="Warna">' +
          '<span class="pipa-stage-swatch-face" style="background:' + esc(stageColorOf(st, i)) + '"></span>' +
          '<input type="color" class="pipa-color" data-act="pipa-stage-color" data-id="' + esc(st.id) + '" value="' + esc(stageColorOf(st, i)) + '" aria-label="Warna ' + esc(st.label) + '">' +
        '</label>' +
        '<input class="pipa-stage-name" data-act="pipa-stage-label" data-id="' + esc(st.id) + '" value="' + esc(st.label) + '" maxlength="40" aria-label="Nama tahap" draggable="false">' +
        '<span class="pipa-stage-count muted" title="Jumlah orang">' + peopleInStage(st.id).length + '</span>' +
        '<button type="button" class="cols-dd-ico" data-act="pipa-stage-del" data-id="' + esc(st.id) + '"' + (stages.length <= 1 ? ' disabled' : '') + ' title="Hapus">×</button>' +
      '</div>'
    ).join('');
    const trRows = transitions.length
      ? transitions.map((tr) =>
          '<div class="pipa-tr-row">' +
            '<span class="muted">Saat</span>' +
            '<select data-act="pipa-tr-when" data-id="' + esc(tr.id) + '">' + eventOpts(tr.when) + '</select>' +
            '<span class="muted">→</span>' +
            '<select data-act="pipa-tr-to" data-id="' + esc(tr.id) + '">' + stageOpts(tr.to) + '</select>' +
            '<button type="button" class="cols-dd-ico" data-act="pipa-tr-del" data-id="' + esc(tr.id) + '" title="Hapus">×</button>' +
          '</div>'
        ).join('')
      : '<p class="muted" style="margin:0">Belum ada. Tambah aturan di bawah.</p>';
    const delPrompt = delStage
      ? '<div class="pipa-del-prompt">' +
          '<strong>' + delCount + ' orang di “' + esc(delStage.label) + '”</strong>' +
          '<p class="muted" style="margin:4px 0 8px">Harus pindah ke tahap lain sebelum dihapus.</p>' +
          '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">' +
            '<select data-act="pipa-move-to" id="pipa-move-to">' + stageOpts('', delId) + '</select>' +
            '<button type="button" class="btn-sm" data-act="pipa-stage-del-confirm" data-id="' + esc(delId) + '">Pindahkan &amp; hapus</button>' +
            '<button type="button" class="btn-sm" data-act="pipa-stage-del-cancel">Batal</button>' +
          '</div>' +
        '</div>'
      : '';
    return '<div class="pipa-settings" id="pipa-settings-panel">' +
      '<div class="pipa-settings-head">' +
        '<div><strong>Atur pipa</strong><p class="muted" style="margin:2px 0 0">Tahap, warna, urutan, dan pindah otomatis.</p></div>' +
        '<button type="button" class="cols-dd-ico" data-act="pipa-settings-close" title="Tutup" aria-label="Tutup">×</button>' +
      '</div>' +
      delPrompt +
      '<div class="pipa-settings-sec">' +
        '<div class="cols-dd-title">Tahap</div>' +
        '<p class="muted" style="margin:0 0 8px;font-size:.74rem">Geser baris untuk urutkan. Klik warna / nama untuk ubah.</p>' +
        '<div class="pipa-stage-list">' + stageRows + '</div>' +
        '<form class="cols-dd-add" data-act="pipa-stage-add">' +
          '<input name="label" required maxlength="40" placeholder="Nama tahap baru…">' +
          '<button class="btn-sm" type="submit">+</button>' +
        '</form>' +
      '</div>' +
      '<div class="pipa-settings-sec">' +
        '<div class="cols-dd-title">Transisi</div>' +
        '<p class="muted" style="margin:0 0 8px;font-size:.74rem">Kalau terjadi X, orang pindah ke tahap Y.</p>' +
        '<div class="pipa-tr-list">' + trRows + '</div>' +
        '<button type="button" class="btn-sm" data-act="pipa-tr-add" style="margin-top:8px">+ Transisi</button>' +
      '</div>' +
      '<button type="button" class="cols-dd-reset" data-act="pipa-settings-reset">Reset ke default</button>' +
    '</div>';
  }
  function viewSiswaHub() {
    const cam = ui.siswaView || 'pipa';
    const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
    const pipaGear = cam === 'pipa'
      ? '<div class="cols-dd-wrap' + (ui.pipaSettingsOpen ? ' is-open' : '') + '" id="pipa-settings-wrap">' +
          '<button type="button" class="cols-dd-btn' + (ui.pipaSettingsOpen ? ' is-on' : '') +
            '" data-act="pipa-settings-toggle" aria-expanded="' + !!ui.pipaSettingsOpen + '" aria-haspopup="dialog" title="Atur pipa">' +
            '<span class="cols-dd-btn-ico" aria-hidden="true">' +
              '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6.5 1.5h3l.4 1.6a4.5 4.5 0 0 1 1.2.7l1.6-.5 1.5 2.6-1.2 1.1c.1.4.1.8 0 1.2l1.2 1.1-1.5 2.6-1.6-.5a4.5 4.5 0 0 1-1.2.7L9.5 14.5h-3l-.4-1.6a4.5 4.5 0 0 1-1.2-.7l-1.6.5L1.8 10l1.2-1.1a4.6 4.6 0 0 1 0-1.2L1.8 6.6l1.5-2.6 1.6.5a4.5 4.5 0 0 1 1.2-.7L6.5 1.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.3"/></svg>' +
            '</span>' +
            'Atur' +
          '</button>' +
          (ui.pipaSettingsOpen ? pipaSettingsPanelHtml() : '') +
        '</div>'
      : '';
    const head = '<div class="hub-head">' +
      '<div><h2 style="margin:0">Siswa · ' + esc(SEED.cohort.name) + '</h2>' +
        '<p class="muted">Klik nama = profil. Geser kartu di Pipa.</p></div>' +
      '<div class="hub-head-acts">' +
        pipaGear +
        '<input placeholder="Cari orang…" value="' + esc(q) + '" data-act="filter-siswa" style="max-width:260px;padding:8px 12px;border:1px solid var(--line);border-radius:10px">' +
      '</div></div>' + hubSeg();
    if (cam === 'daftar') return head + viewSiswaDaftar(q);
    if (cam === 'progres') return head + viewMentorProgres();
    return head + viewCrm(q);
  }
  function stageTabsHtml(q) {
    const stages = pipelineStages();
    const savedStage = ui.stageFilter || '';
    ui.stageFilter = '';
    const all = daftarFilteredPeople(q);
    ui.stageFilter = savedStage;
    const cur = savedStage;
    const chip = (id, label, n) =>
      '<button type="button" data-act="stage-filter" data-id="' + esc(id) + '" aria-selected="' + (cur === id) + '">' +
        esc(label) + (n ? ' (' + n + ')' : '') + '</button>';
    return '<div class="stage-tabs">' +
      chip('', 'Semua', all.length) +
      stages.map((st) => chip(st.id, st.label, all.filter((s) => crmOf(s.id).stage === st.id).length)).join('') +
      '</div>';
  }
  function viewSiswaDaftar(q) {
    const cols = daftarCols();
    const rows = daftarFilteredPeople(q);
    if (!(ui.daftarSelected instanceof Set)) ui.daftarSelected = new Set();
    const selectedIds = daftarSelectedVisible(rows);
    const allSelected = rows.length > 0 && selectedIds.length === rows.length;
    const someSelected = selectedIds.length > 0 && !allSelected;
    const colSpan = cols.length + 1;
    return stageTabsHtml(q) +
      daftarFiltersHtml() +
      daftarBulkBarHtml(selectedIds) +
      '<div class="fub-list">' +
      '<div class="fub-toolbar">' +
        '<span class="muted">Menampilkan ' + rows.length + ' orang' +
          (selectedIds.length ? ' · ' + selectedIds.length + ' dipilih' : '') +
          (daftarHasExtraFilters() ? ' · filter aktif' : '') +
        '</span>' +
        '<div class="fub-toolbar-acts">' +
          '<div class="cols-dd-wrap' + (ui.daftarColsOpen ? ' is-open' : '') + '" id="daftar-cols-wrap">' +
            '<button type="button" class="cols-dd-btn' + (ui.daftarColsOpen ? ' is-on' : '') +
              '" data-act="daftar-cols-toggle" aria-expanded="' + !!ui.daftarColsOpen + '" aria-haspopup="menu">' +
              '<span class="cols-dd-btn-ico" aria-hidden="true">' +
                '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4h9M2 8h12M2 12h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="13" cy="4" r="1.4" fill="currentColor"/><circle cx="7" cy="8" r="1.4" fill="currentColor"/><circle cx="11" cy="12" r="1.4" fill="currentColor"/></svg>' +
              '</span>' +
              'Kolom' +
              '<span class="cols-dd-chev" aria-hidden="true">▾</span>' +
            '</button>' +
            (ui.daftarColsOpen ? daftarColsPanelHtml() : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<table class="table roster"><thead><tr>' +
        '<th class="roster-check-th">' +
          '<input type="checkbox" data-act="daftar-sel-all" aria-label="Pilih semua"' +
            (allSelected ? ' checked' : '') +
            (someSelected ? ' data-indeterminate="1"' : '') +
            (rows.length ? '' : ' disabled') + '>' +
        '</th>' +
        cols.map((id) => {
          const def = daftarColDef(id);
          return '<th>' + esc((def && def.label) || id) + '</th>';
        }).join('') +
      '</tr></thead><tbody>' +
      (rows.length ? rows.map((s) => {
        const on = ui.daftarSelected.has(s.id);
        return '<tr class="roster-row' + (on ? ' is-selected' : '') + '" data-act="open-student" data-id="' + esc(s.id) + '">' +
          '<td class="roster-check-td" data-act="daftar-sel-cell" data-id="' + esc(s.id) + '">' +
            '<input type="checkbox" data-act="daftar-sel" data-id="' + esc(s.id) + '"' +
              (on ? ' checked' : '') + ' aria-label="Pilih ' + esc(s.name) + '">' +
          '</td>' +
          cols.map((id) => '<td>' + daftarCellHtml(id, s) + '</td>').join('') +
        '</tr>';
      }).join('') : '<tr><td colspan="' + colSpan + '" class="muted">Tidak ada orang di filter ini.</td></tr>') +
      '</tbody></table></div>';
  }
  function viewCrm(q) {
    q = (q != null ? q : ui.crmFilter || '').toLowerCase();
    const stages = pipelineStages();
    const cols = stages.map((st, i) => {
      const rows = people().filter((s) => {
        const stage = crmOf(s.id).stage || 'wa_baru';
        if (stage !== st.id) return false;
        return matchPerson(s, q);
      });
      const sum = rows.reduce((n, s) => n + (Number(billingOf(s.id).amount) || 0), 0);
      const color = stageColorOf(st, i);
      return '<div class="kanban-col" data-stage="' + esc(st.id) + '" style="border-top-color:' + color + '">' +
        '<div class="kanban-col-head"><h3><span class="pipa-dot" style="background:' + color + '" aria-hidden="true"></span>' + esc(st.label) + '</h3>' +
          '<div class="muted">' + rows.length + ' orang · ' + (sum ? fmtRp(sum) : 'Rp0') + '</div></div>' +
        (rows.length ? rows.map((s) => {
          const b = billingOf(s.id);
          return '<button type="button" class="kanban-card" draggable="true" data-act="open-student" data-id="' + esc(s.id) + '">' +
            '<div class="roster-name">' + avatarHtml(s, 'avatar sm') + '<strong>' + esc(s.name) + '</strong>' + waUnreadBadge(s.id) + '</div>' +
            '<div class="muted">' + esc(s.city) + (s.mentorId && s.mentorId !== 'u-anton' ? ' · ' + esc(nameOf(s.mentorId)) : '') + '</div>' +
            (b.amount ? '<div class="money">' + esc(fmtRp(b.amount)) + '</div>' : '') +
            '<div>' + payChip(b.status, b.source) + ' <span class="muted">' + esc(fmtRemain(
              (b.status === 'lunas' || b.status === 'cicilan' || b.status === 'gratis')
                ? b.accessUntil
                : (b.offerExpiresAt || b.accessUntil)
            )) + '</span></div>' +
            '</button>';
        }).join('') : '<p class="muted">Kosong, tarik kartu ke sini</p>') +
        '</div>';
    }).join('');
    const openTasks = db.tasks.filter((t) => !t.done).length;
    return '<p class="muted">Geser kartu antar kolom. Klik tetap buka profil. Tugas terbuka: ' + openTasks + '</p>' +
      '<div class="kanban">' + cols + '</div>';
  }
  function queuedItems() {
    const wa = (db.waQueue || []).filter((w) => w.status === 'queued').map((w) => ({
      id: w.id, personId: w.toId, title: w.title, body: w.body, dueAt: w.scheduledAt,
      done: false, kind: 'wa', queue: 'wa'
    }));
    const em = (db.emailQueue || []).filter((w) => w.status === 'queued').map((w) => ({
      id: w.id, personId: w.toId, title: w.subject || w.title, body: w.body, dueAt: w.scheduledAt,
      done: false, kind: 'email', queue: 'email'
    }));
    return wa.concat(em);
  }
  function taskGroups() {
    const today = splitLocal().date;
    const t0 = new Date(today + 'T00:00:00+07:00').getTime();
    const t1 = t0 + 86400000;
    const t2 = t0 + 2 * 86400000;
    const weekEnd = t0 + 7 * 86400000;
    const pid = ui.taskPerson || '';
    const aid = ui.taskAssignee || '';
    const list = db.tasks.concat(queuedItems()).filter((t) => {
      if (pid && t.personId !== pid) return false;
      if (aid && !t.queue && assigneeIdOf(t) !== aid) return false;
      return true;
    });
    const overdue = [];
    const hari = [];
    const besok = [];
    const minggu = [];
    const later = [];
    const done = [];
    list.forEach((t) => {
      if (t.done) { done.push(t); return; }
      const ms = new Date(t.dueAt).getTime();
      if (ms < t0) overdue.push(t);
      else if (ms < t1) hari.push(t);
      else if (ms < t2) besok.push(t);
      else if (ms < weekEnd) minggu.push(t);
      else later.push(t);
    });
    const sortDue = (a, b) => new Date(a.dueAt) - new Date(b.dueAt);
    [overdue, hari, besok, minggu, later, done].forEach((a) => a.sort(sortDue));
    return { overdue: overdue, hari: hari, besok: besok, minggu: minggu, later: later, done: done };
  }
  function taskRow(t) {
    const s = people().find((x) => x.id === t.personId) || {};
    const kind = t.kind === 'task' ? 'reminder' : (t.kind || 'wa');
    let action = '';
    if (t.queue === 'wa') {
      action = '<button type="button" class="btn-sm" data-act="wa-crm-send" data-id="' + esc(t.personId) + '" data-qid="' + esc(t.id) + '">Kirim dari CRM</button>' +
        '<a class="btn-sm" href="' + esc(waLink(s.wa, t.body)) + '">Buka WA</a>' +
        '<button class="btn-sm" data-act="wa-sent" data-id="' + esc(t.id) + '">Tandai dikirim</button>';
    } else if (t.queue === 'email') {
      action = '<a class="btn-sm" href="' + esc(mailLink(s.email, t.title, t.body)) + '">Buka Email</a>' +
        '<button class="btn-sm" data-act="em-sent" data-id="' + esc(t.id) + '">Tandai dikirim</button>';
    } else if (!t.done) {
      if (kind === 'wa') {
        action += '<button type="button" class="btn-sm" data-act="wa-crm-send" data-id="' + esc(t.personId) + '" data-tid="' + esc(t.id) + '">Kirim dari CRM</button>';
        action += '<a class="btn-sm" href="' + esc(waLink(s.wa, t.body)) + '">Buka WA</a>';
      }
      if (kind === 'email') action += '<a class="btn-sm" href="' + esc(mailLink(s.email, t.title, t.body)) + '">Email</a>';
      if (kind === 'call' && s.wa) action += '<a class="btn-sm" href="tel:+' + esc(String(s.wa).replace(/\D/g, '')) + '">Telepon</a>';
      if (canBill() && isPending(t.personId) && /cek transfer/i.test(t.title || '')) {
        action += '<button class="btn-sm" data-act="confirm-paid" data-id="' + esc(t.personId) + '" data-task="' + esc(t.id) + '">Konfirmasi lunas</button>';
      }
      action += '<button class="btn-sm" data-act="task-done" data-id="' + esc(t.id) + '">Selesai</button>';
    }
    return '<div class="task-row' + (t.done ? ' is-done' : '') + '">' +
      (t.done
        ? '<span class="tick-ok">✓</span>'
        : '<button type="button" class="task-check" data-act="' + (t.queue ? (t.queue === 'email' ? 'em-sent' : 'wa-sent') : 'task-done') + '" data-id="' + esc(t.id) + '" aria-label="Selesai"></button>') +
      avatarHtml(s, 'avatar sm') +
      '<div class="task-main">' +
        '<button type="button" class="linkish task-who" data-act="open-student" data-id="' + esc(t.personId) + '">' + esc(nameOf(t.personId)) + '</button>' +
        '<div class="task-title"><span class="task-kind kind-' + esc(kind) + '">' + esc(taskKindLabel(kind)) + '</span> ' + esc(t.title) +
          (t.queue ? ' <span class="chip warn">Antrian</span>' : '') + '</div>' +
        (t.body ? '<div class="muted">' + esc(t.body) + '</div>' : '') +
        (t.queue ? '' : '<label class="muted task-assignee">Untuk <select data-act="task-assign" data-id="' + esc(t.id) + '">' +
          assigneeOptionsHtml(assigneeIdOf(t)) + '</select></label>') +
      '</div>' +
      '<div class="task-meta"><span class="muted">' + esc(fmtClock(t.dueAt)) + '</span>' +
        '<span class="row">' + action + '</span></div></div>';
  }
  function viewTugas() {
    const g = taskGroups();
    const block = (title, rows) =>
      '<section class="task-group"><h3>' + title + ' · ' + rows.length + '</h3>' +
      (rows.length ? '<div class="task-list">' + rows.map(taskRow).join('') + '</div>' : '<p class="muted">Kosong.</p>') +
      '</section>';
    const open = ui.taskComposer === 'new';
    return '<div class="task-board">' +
      '<div class="task-toolbar">' +
        '<div><h2 style="margin:0">Tugas</h2><p class="muted" style="margin:4px 0 0">Hari ini, besok, minggu ini. Klik nama untuk profil. WA dan email membuka aplikasi. Default ditugaskan ke Anton.</p></div>' +
        '<button type="button" class="btn" data-act="task-compose" data-id="new">' + (open ? 'Tutup' : '+ Tugas') + '</button>' +
      '</div>' +
      (open ? '<div class="card" style="margin-bottom:14px"><h3>Buat tugas</h3>' + taskComposerHtml('') + '</div>' : '') +
      waInboxHtml() +
      '<div class="row" style="margin-bottom:12px;gap:12px;flex-wrap:wrap">' +
        '<label class="muted">Filter orang <select data-act="task-person">' +
          '<option value="">Semua</option>' +
          people().map((s) => '<option value="' + esc(s.id) + '"' + (ui.taskPerson === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
        '</select></label>' +
        '<label class="muted">Ditugaskan ke <select data-act="task-assignee-filter">' +
          '<option value="">Semua</option>' +
          staffMembers().map((s) => '<option value="' + esc(s.id) + '"' + (ui.taskAssignee === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
        '</select></label></div>' +
      block('Terlambat', g.overdue) +
      block('Hari ini', g.hari) +
      block('Besok', g.besok) +
      block('Minggu ini', g.minggu) +
      block('Nanti', g.later) +
      block('Selesai', g.done) +
      '</div>';
  }
  function stepKindOptions(cur) {
    return ['email', 'wa', 'task', 'stage'].map((k) =>
      '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(stepKindLabel(k)) + '</option>').join('');
  }
  function triggerOptions(cur) {
    return ['bayar', 'form', 'trial', 'perpanjangan', 'manual', 'nurture', 'tidak_tertarik'].map((t) =>
      '<option value="' + t + '"' + (cur === t ? ' selected' : '') + '>' + esc(triggerLabel(t)) + '</option>').join('');
  }
  function autoStepEditor(p, st) {
    return '<span class="auto-kicker">' + esc(stepKindLabel(st.kind)) + '</span>' +
      '<select data-act="plan-kind" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '">' + stepKindOptions(st.kind) + '</select>' +
      (st.kind === 'stage'
        ? '<label class="muted">Pindah ke</label><select data-act="plan-to" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '">' +
          pipelineStages().map((sg) => '<option value="' + esc(sg.id) + '"' + (st.to === sg.id ? ' selected' : '') + '>' + esc(sg.label) + '</option>').join('') + '</select>'
        : '') +
      '<label class="muted">Judul</label>' +
      '<input data-act="plan-title" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '" value="' + esc(st.title || '') + '">' +
      (st.kind === 'email' ? '<label class="muted">Subjek</label><input data-act="plan-subject" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '" value="' + esc(st.subject || '') + '">' : '') +
      '<label class="muted">Isi</label>' +
      '<textarea data-act="plan-body" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '" rows="2">' + esc(st.body || '') + '</textarea>' +
      '<button type="button" class="btn-sm" data-act="plan-del-step" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '">Hapus langkah</button>';
  }
  function autoMapHtml(p) {
    let html = '<div class="auto-map">' +
      '<div class="auto-node trigger">' +
        '<span class="auto-kicker">Pemicu</span>' +
        '<input data-act="plan-name" data-pid="' + esc(p.id) + '" value="' + esc(p.name) + '">' +
        '<select data-act="plan-trigger" data-pid="' + esc(p.id) + '" style="margin-top:8px">' + triggerOptions(p.trigger) + '</select>' +
        '<p class="muted" style="margin:8px 0 0">Mulai saat event ini terjadi pada orang itu.</p>' +
      '</div>';
    (p.steps || []).forEach((st) => {
      html += '<div class="auto-pipe"></div>' +
        '<div class="auto-node is-wait">' +
          '<span class="auto-kicker">Tunggu</span>' +
          '<div class="row" style="justify-content:center">' +
            '<input data-act="plan-wait" data-pid="' + esc(p.id) + '" data-sid="' + esc(st.id) + '" type="number" min="0" value="' + esc(st.waitHours || 0) + '" style="width:72px;text-align:center">' +
            '<span class="muted">jam</span></div>' +
        '</div>' +
        '<div class="auto-pipe"></div>' +
        '<div class="auto-node ' + esc(st.kind || 'task') + '">' + autoStepEditor(p, st) + '</div>';
    });
    html += '<div class="auto-pipe"></div>' +
      '<div class="auto-node done"><span class="auto-kicker">Selesai</span>' +
        '<p class="muted" style="margin:0">Tidak auto-kirim. Anton tandai di Antrian. Boleh berulang per orang.</p></div>' +
      '<div class="row" style="margin-top:14px;justify-content:center">' +
        '<button type="button" class="btn" data-act="plan-add-step" data-id="' + esc(p.id) + '">+ Langkah</button>' +
      '</div></div>';
    return html;
  }
  function viewOtomasi() {
    const d = db.dunning;
    const plans = db.actionPlans || [];
    const showArchived = !!ui.showArchivedPlans;
    const visible = plans.filter((p) => showArchived || !p.archived);
    if (!ui.editPlanId || !visible.some((p) => p.id === ui.editPlanId)) {
      const pref = visible.find((p) => p.id === 'onboarding');
      ui.editPlanId = (pref || visible[0] || {}).id || null;
    }
    const open = planById(ui.editPlanId);
    return '<div class="auto-page">' +
      '<aside class="auto-rail">' +
        '<h2>Otomasi</h2>' +
        '<p class="muted">Peta visual. Tidak auto-kirim.</p>' +
        '<div class="row" style="margin:8px 0">' +
          '<button type="button" class="btn" data-act="plan-new">+ Rencana</button>' +
          '<button type="button" class="btn-sm" data-act="plan-show-arch">' + (showArchived ? 'Sembunyikan arsip' : 'Arsip') + '</button>' +
        '</div>' +
        visible.map((p) =>
          '<button type="button" class="auto-plan' + (p.id === ui.editPlanId ? ' is-on' : '') + '" data-act="plan-edit" data-id="' + esc(p.id) + '">' +
            '<strong>' + esc(p.name) + (p.archived ? ' · arsip' : '') + '</strong>' +
            '<span class="muted">' + esc(triggerLabel(p.trigger)) + ' · ' + ((p.steps || []).length) + ' langkah</span>' +
          '</button>'
        ).join('') +
        '<form class="compose" data-act="save-dunning" style="margin-top:18px">' +
          '<strong>Perpanjangan</strong>' +
          '<label class="muted">Hari peringatan</label>' +
          '<input name="warningDays" type="number" min="1" value="' + esc(d.warningDays) + '">' +
          '<label class="muted">Hari grace</label>' +
          '<input name="graceDays" type="number" min="0" value="' + esc(d.graceDays) + '">' +
          '<button class="btn" type="submit">Simpan jeda</button></form>' +
      '</aside>' +
      '<div class="auto-canvas">' +
        (open
          ? '<div class="row" style="justify-content:center;margin-bottom:12px">' +
              '<button type="button" class="btn-sm" data-act="plan-dup" data-id="' + esc(open.id) + '">Salin</button>' +
              (open.archived
                ? '<button type="button" class="btn-sm" data-act="plan-unarch" data-id="' + esc(open.id) + '">Kembalikan</button>'
                : '<button type="button" class="btn-sm" data-act="plan-arch" data-id="' + esc(open.id) + '">Arsip</button>') +
            '</div>' + autoMapHtml(open)
          : '<p class="muted" style="text-align:center">Buat rencana dulu.</p>') +
      '</div></div>';
  }
  function viewJaringan() {
    const mentors = people().filter((s) => s.kind === 'mentor' || crmOf(s.id).stage === 'mentor');
    const antonKids = people().filter((s) => (s.mentorId || 'u-anton') === 'u-anton' && s.kind !== 'mentor');
    const override = (db.pricing.overridePct || 20) / 100;
    let html = '<section class="card"><h2>Jaringan Anton</h2>' +
      '<p class="muted">Dua lapis. Bukan MLM tak terbatas. 20% = licensing kurikulum/merek, disampaikan sebelum seseorang terima peran mentor. Anton tidak menahan uang murid downline.</p>' +
      '<h3>Murid langsung Anton · ' + antonKids.length + '</h3>' +
      '<table class="table"><thead><tr><th>Nama</th><th>Stage</th><th>Bayar</th></tr></thead><tbody>' +
      antonKids.map((s) => '<tr><td><button class="btn-sm" data-act="open-student" data-id="' + esc(s.id) + '">' + esc(s.name) + '</button></td>' +
        '<td>' + esc(stageLabel(crmOf(s.id).stage)) + '</td><td>' + payChip(billingOf(s.id).status, billingOf(s.id).source) + '</td></tr>').join('') +
      '</tbody></table></section>';
    html += '<section class="card" style="margin-top:12px"><h3>Mentor yang Anton bimbing</h3>';
    mentors.forEach((m) => {
      const kids = people().filter((s) => s.mentorId === m.id);
      const earned = kids.reduce((n, s) => n + (Number(billingOf(s.id).amount) || 0), 0);
      const due = Math.round(earned * override);
      const rem = db.remittances.filter((r) => r.mentorId === m.id);
      html += '<article class="thread"><h4>' + esc(m.name) + '</h4>' +
        '<p class="muted">' + kids.length + ' murid · omset tercatat ' + fmtRp(earned) +
        ' · 20% ' + fmtRp(due) + '</p>' +
        (kids.length ? '<ul>' + kids.map((s) => '<li>' + esc(s.name) + ' · ' + fmtRp(billingOf(s.id).amount) + ' · ' + esc(billingOf(s.id).note || billingOf(s.id).plan) + '</li>').join('') + '</ul>' : '<p class="muted">Belum ada murid.</p>') +
        rem.map((r) =>
          '<p>Setoran ' + esc(r.period) + ': harus ' + fmtRp(r.expected) + ' · masuk ' + fmtRp(r.received) +
          ' <button class="btn-sm" data-act="remit" data-id="' + esc(r.id) + '">Tandai masuk</button></p>'
        ).join('') +
        '</article>';
    });
    html += '</section>';
    return html;
  }
  function viewAdmin() {
    const s = ui.adminSummary;
    if (!s) {
      return '<section class="card"><h2>Admin</h2><p class="muted">Memuat kedatangan, masalah, dan analitik…</p></section>';
    }
    if (s.error) {
      return '<section class="card"><h2>Admin</h2><p class="muted">Ringkasan tidak terbaca. Cek kunci admin.</p></section>';
    }
    const today = s.today || {};
    const week = s.week || {};
    const arrivals = s.arrivals || [];
    const issues = s.issues || [];
    const users = s.users || [];
    const diskusi = s.diskusi || [];
    const fmtRow = (ev) => '<tr><td>' + esc(relWhen(ev.at)) + '</td><td>' + esc(ev.type === 'join' ? 'Form' : 'Kunjungan') +
      '</td><td>' + esc(ev.name || 'belum isi form') + '</td><td>' + esc(ev.wa || '—') +
      '</td><td class="muted">' + esc(ev.path || '') + '</td></tr>';
    return '<section class="card"><h2>Analitik</h2>' +
      '<p class="muted">Pengunjung nyata. Demo Farah, Irma, dan roster contoh tidak dihitung. Reset kelas tidak menghapus log ini.</p>' +
      '<div class="fub-stats">' +
        '<div><strong>' + esc(String(today.visitors || 0)) + '</strong><span class="muted">Pengunjung hari ini</span></div>' +
        '<div><strong>' + esc(String(today.joins || 0)) + '</strong><span class="muted">Form hari ini</span></div>' +
        '<div><strong>' + esc(String(today.lessonOpens || 0)) + '</strong><span class="muted">Materi dibuka hari ini</span></div>' +
        '<div><strong>' + esc(String(week.visitors || 0)) + '</strong><span class="muted">Pengunjung 7 hari</span></div>' +
        '<div><strong>' + esc(String(week.joins || 0)) + '</strong><span class="muted">Form 7 hari</span></div>' +
        '<div><strong>' + esc(String(week.lessonOpens || 0)) + '</strong><span class="muted">Materi 7 hari</span></div>' +
      '</div></section>' +
      '<section class="card" style="margin-top:12px"><h2>Pengguna</h2>' +
      (users.length
        ? '<table class="table"><thead><tr><th>Nama</th><th>WA</th><th>Pertama</th><th>Terakhir</th><th>Materi</th><th>Progres</th><th>Stage</th><th>Masalah</th></tr></thead><tbody>' +
          users.map((u) => '<tr><td>' + esc(u.name || 'belum isi form') + '</td><td>' + esc(u.wa || '—') +
            '</td><td>' + esc(relWhen(u.first)) + '</td><td>' + esc(relWhen(u.last)) +
            '</td><td>' + esc(String(u.lessons || 0)) + '</td><td>' + esc(u.progress == null ? '—' : (u.progress + '%')) +
            '</td><td>' + esc(u.stage || '—') + '</td><td>' + esc(String(u.openIssues || 0)) + '</td></tr>').join('') +
          '</tbody></table>'
        : '<p class="muted">Belum ada pengunjung nyata.</p>') +
      '</section>' +
      '<section class="card" style="margin-top:12px"><h2>Datang</h2>' +
      (arrivals.length
        ? '<table class="table"><thead><tr><th>Waktu</th><th>Jenis</th><th>Nama</th><th>WA</th><th>Path</th></tr></thead><tbody>' +
          arrivals.slice(0, 40).map(fmtRow).join('') + '</tbody></table>'
        : '<p class="muted">Belum ada kunjungan.</p>') +
      '</section>' +
      '<section class="card" style="margin-top:12px"><h2>Lynk belum cocok</h2>' +
      '<p class="muted">Pembayaran yang tanda-tangannya sah, tapi nomor atau judulnya tidak membuka mentoring. Kalkulator dan rekaman masuk sini.</p>' +
      ((s.lynkUnmatched || []).length
        ? (s.lynkUnmatched || []).map((row) => '<article class="thread"><strong>' + esc((row.titles && row.titles[0]) || 'Tanpa judul') + '</strong>' +
            '<p>' + esc(row.name || 'Tanpa nama') + (row.phone ? ' · ' + esc(row.phone) : '') +
            ' · ' + esc(row.amount ? ('Rp' + Number(row.amount).toLocaleString('id-ID')) : '') + '</p>' +
            '<p class="muted">' + esc(({
              not_mentoring: 'Bukan paket mentoring',
              no_phone: 'Nomor tidak ketemu',
              ambiguous_phone: 'Nomor cocok ke lebih dari satu siswa',
              ambiguous_title: 'Judul cocok ke lebih dari satu paket',
              no_state: 'Kelas belum tersimpan'
            })[row.reason] || row.reason || '') + ' · ' + esc(row.refId || '') + ' · ' + esc(relWhen(row.at)) + '</p></article>').join('')
        : '<p class="muted">Tidak ada pembayaran yang tertahan.</p>') +
      '</section>' +
      '<section class="card" style="margin-top:12px"><h2>Masalah</h2>' +
      (issues.length
        ? issues.map((item) => '<article class="thread"><strong>' + esc(item.lessonTitle || item.kind || 'Laporan') + '</strong>' +
            '<p>' + esc(item.body || '') + '</p><p class="muted">' + esc(item.name || 'Tanpa nama') +
            (item.wa ? ' · ' + esc(item.wa) : '') + ' · ' + esc(relWhen(item.at)) + '</p>' +
            '<button type="button" class="btn-sm" data-act="issue-done" data-id="' + esc(item.id) + '">Selesai</button></article>').join('')
        : '<p class="muted">Tidak ada masalah terbuka.</p>') +
      (diskusi.length
        ? '<h3>Diskusi belum dijawab</h3><ul>' + diskusi.map((t) =>
            '<li><strong>' + esc(t.title || 'Pertanyaan') + '</strong> · ' + esc(t.body || '') + '</li>').join('') + '</ul>'
        : '<p class="muted" style="margin-top:8px">Tidak ada diskusi yang menunggu jawaban.</p>') +
      '</section>';
  }
  function viewHarga() {
    const p = db.pricing;
    const b = db.bank;
    const slug = schoolSlug();
    const pub = schoolPublicUrl();
    const join = schoolJoinUrl();
    const local = schoolLocalUrl();
    return '<section class="card school-url-card">' +
      '<h2>Alamat sekolah</h2>' +
      '<p class="muted">Kelas siswa ada di <strong>larisid.com' + esc(schoolPublicPath()) + '</strong>. Mentor di /obrolan.marketing/. Checkout tetap di lynk.</p>' +
      '<form class="compose" data-act="save-school-url">' +
        '<label class="muted">Kode undangan batch</label>' +
        '<input name="invite" value="' + esc(schoolInviteCode()) + '" maxlength="40" autocomplete="off" spellcheck="false">' +
        '<label class="muted">Nomor WA Anton</label>' +
        '<input name="ownerWa" value="' + esc(ownerContact().wa || ownerWa()) + '" placeholder="628…" inputmode="tel">' +
        '<label class="muted">Email Anton</label>' +
        '<input name="ownerEmail" type="email" value="' + esc(ownerContact().email || '') + '" placeholder="anton@…">' +
        '<button class="btn" type="submit">Simpan kontak</button>' +
      '</form>' +
      '<dl class="url-share">' +
        '<div><dt>Rumah siswa</dt><dd><code>' + esc(pub) + '</code>' +
          '<button type="button" class="btn-sm" data-act="copy-url" data-url="' + esc(pub) + '">Salin</button></dd></div>' +
        '<div><dt>Gabung + kode</dt><dd><code>' + esc(join) + '</code>' +
          '<button type="button" class="btn-sm" data-act="copy-url" data-url="' + esc(join) + '">Salin</button></dd></div>' +
        '<div><dt>Admin</dt><dd><code>' + esc(schoolAdminUrl()) + '</code>' +
          '<button type="button" class="btn-sm" data-act="copy-url" data-url="' + esc(schoolAdminUrl()) + '">Salin</button></dd></div>' +
        '<div><dt>Lokal (demo)</dt><dd><code>' + esc(local) + '</code>' +
          '<button type="button" class="btn-sm" data-act="copy-url" data-url="' + esc(schoolJoinLocalUrl()) + '">Salin + invite</button></dd></div>' +
      '</dl>' +
      '<p class="muted">Lynk etalase: <a href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">' + esc(SEED.school.lynk) + '</a> — bukan URL kelas.</p>' +
      '</section>' +
      '<div class="grid-2"><section class="card"><h2>Harga mentoring (placeholder)</h2>' +
      '<form class="compose" data-act="save-pricing">' +
        '<label class="muted">Bulanan (IDR)</label><input name="monthlyIdr" type="number" value="' + esc(p.monthlyIdr) + '">' +
        '<label class="muted">Diskon 3 bulan %</label><input name="quarterDiscountPct" type="number" value="' + esc(p.quarterDiscountPct || 15) + '">' +
        '<label class="muted">Diskon 6 bulan %</label><input name="halfDiscountPct" type="number" value="' + esc(p.halfDiscountPct || 25) + '">' +
        '<label class="muted">Diskon kartu autopay %</label><input name="autopayDiscountPct" type="number" value="' + esc(p.autopayDiscountPct) + '">' +
        '<label class="muted">Diskon 24 jam % (1 bulan &amp; autopay)</label><input name="welcomeDiscountPct" type="number" value="' + esc(p.welcomeDiscountPct) + '">' +
        '<label class="muted">Diskon alat mentoring %</label><input name="toolDiscountPct" type="number" value="' + esc(p.toolDiscountPct || 50) + '">' +
        '<label class="muted">Licensing mentor %</label><input name="overridePct" type="number" value="' + esc(p.overridePct) + '">' +
        '<button class="btn" type="submit">Simpan harga</button></form>' +
      '<p class="muted">1 bulan ' + fmtRp(priceForTerm('month', false)) +
      ' · 3 bulan ' + fmtRp(priceForTerm('quarter', false)) +
      ' · 6 bulan ' + fmtRp(priceForTerm('half', false)) +
      ' · autopay ' + fmtRp(priceForTerm('autopay', false)) +
      ' · alat −' + toolDiscountPct() + '%</p>' +
      '</section><section class="card"><h2>Rekening transfer</h2>' +
      '<form class="compose" data-act="save-bank">' +
        '<label class="muted">Bank</label><input name="bank" value="' + esc(b.bank) + '">' +
        '<label class="muted">Nomor</label><input name="number" value="' + esc(b.number) + '">' +
        '<label class="muted">Atas nama</label><input name="name" value="' + esc(b.name) + '">' +
        '<button class="btn" type="submit">Simpan rekening</button></form>' +
      '<p class="muted">Siswa menyalin ini kalau transfer manual. Anton menandai lunas di baris siswa / profil.</p>' +
      '</section></div>' + lynkSettingsHtml();
  }
  function lynkField(term, label) {
    const row = lynkProduct(term);
    return '<h3>' + esc(label) + '</h3>' +
      '<label class="muted">URL checkout</label>' +
      '<input name="' + term + 'Url" value="' + esc(row.url) + '" placeholder="https://lynk.id/…" inputmode="url">' +
      '<label class="muted">Judul di Lynk</label>' +
      '<input name="' + term + 'Title" value="' + esc(row.title) + '" placeholder="Sama persis dengan judul produk">' +
      '<label class="muted">Harga IDR</label>' +
      '<input name="' + term + 'Price" type="number" value="' + esc(row.price || '') + '" placeholder="400000">';
  }
  function lynkSettingsHtml() {
    const hook = lynkWebhookUrl();
    return '<section class="card" style="margin-top:12px"><h2>Lynk mentoring</h2>' +
      '<p class="muted">Satu URL webhook per akun Lynk. Merchant Key ada di server, bukan di form ini. Judul yang tidak sama dengan paket di bawah tidak membuka 12 video.</p>' +
      '<p><code>' + esc(hook) + '</code> ' +
        '<button type="button" class="btn-sm" data-act="copy-url" data-url="' + esc(hook) + '">Salin webhook</button></p>' +
      '<form class="compose" data-act="save-lynk">' +
        lynkField('month', '1 bulan') +
        lynkField('quarter', '3 bulan') +
        lynkField('half', '6 bulan') +
        '<button class="btn" type="submit">Simpan paket Lynk</button>' +
      '</form></section>';
  }
  function personBatchField(id) {
    const person = people().find((s) => s.id === id) || {};
    const current = /^\d{4}-\d{2}$/.test(String(person.batchId || '')) ? person.batchId : '';
    const list = batchList();
    if (current && !list.some((b) => b.id === current)) {
      list.push({ id: current, label: batchLabel(current), count: 0 });
    }
    const auto = autoBatchOf(id);
    const nowId = batchOf(id);
    return '<div class="fub-field"><dt>Batch</dt><dd>' +
      '<select data-act="person-batch" data-id="' + esc(id) + '">' +
        '<option value=""' + (current ? '' : ' selected') + '>Otomatis (bulan bayar)</option>' +
        list.map((b) => '<option value="' + esc(b.id) + '"' + (b.id === current ? ' selected' : '') + '>' +
          esc(b.label) + '</option>').join('') +
      '</select>' +
      '<div class="muted" style="margin-top:6px">Sekarang: ' +
        esc(nowId ? batchLabel(nowId) : 'belum ada batch') +
        (auto ? ' · otomatis ' + esc(batchLabel(auto)) : ' · belum ada bulan bayar') +
      '</div></dd></div>';
  }

  function viewPerson(id) {
    const s = people().find((x) => x.id === id);
    if (!s) return '<p class="muted">Orang tidak ditemukan.</p><button class="btn" data-act="close-person">Kembali</button>';
    const b = billingOf(id);
    const c = crmOf(id);
    const app = db.applications[id];
    const stages = pipelineStages();
    const plans = (db.actionPlans || []).filter((x) => !x.archived);
    const tsk = db.tasks.filter((x) => x.personId === id).slice().sort((a, b) => Number(a.done) - Number(b.done) || new Date(a.dueAt) - new Date(b.dueAt));
    const openTasks = tsk.filter((t) => !t.done).length;
    const prog = kurProgress(id);
    const mode = ui.composeMode || 'note';
    const midTab = ui.personMidTab === 'contrib' || ui.personMidTab === 'pay' ? ui.personMidTab : 'timeline';
    const feed = personFeed(id);
    const contribs = personContributions(id);
    const pays = personPayments(id);
    const nameParts = personNameParts(s);
    const fullName = displayNameOf(s) || s.name || '';
    const left =
      '<aside class="fub-left">' +
        '<div class="fub-iden">' +
          avatarHtml(s, 'avatar lg') +
          '<div class="fub-iden-copy">' +
            '<div class="fub-name-row">' +
              '<input class="inline-edit name-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="firstName" value="' +
                esc(nameParts.firstName) + '" placeholder="Nama depan" autocomplete="given-name">' +
              '<input class="inline-edit name-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="lastName" value="' +
                esc(nameParts.lastName) + '" placeholder="Nama belakang" autocomplete="family-name">' +
            '</div>' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="city" value="' + esc(s.city || '') + '" placeholder="Kota">' +
            '<label class="btn-sm fub-photo-btn">Unggah foto<input type="file" hidden data-act="photo-file" data-id="' + esc(id) + '" accept="image/*"></label>' +
          '</div>' +
        '</div>' +
        '<div class="fub-contact">' +
          '<div class="fub-contact-row">' +
            '<span class="fub-ico is-wa" aria-hidden="true">' + waIconSvg(16) + '</span>' +
            '<input class="inline-edit ghost-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="wa" value="' + esc(s.wa || '') + '" placeholder="62812…" title="Klik untuk edit WA">' +
            (s.wa
              ? '<a class="fub-cell-link fub-ico-link" href="' + esc(waLink(s.wa, 'Halo ' + fullName + ', dari MasterMind with Anton GC.')) +
                '" title="Buka WhatsApp" aria-label="Buka WhatsApp">' + waIconSvg(16) + '</a>'
              : '') +
          '</div>' +
          '<div class="fub-contact-row">' +
            '<span class="fub-ico is-email" aria-hidden="true">' + emailIconSvg(16) + '</span>' +
            '<input class="inline-edit ghost-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="email" type="email" value="' + esc(s.email || '') + '" placeholder="email" title="Klik untuk edit email">' +
            (s.email
              ? '<a class="fub-cell-link fub-ico-link" href="' + esc(mailLink(s.email, 'MasterMind with Anton GC', 'Halo ' + fullName)) +
                '" title="Buka Email" aria-label="Buka Email">' + emailIconSvg(16) + '</a>'
              : '') +
          '</div>' +
        '</div>' +
        personLinksHtml(id, s, app) +
        personGroupsHtml(id) +
        personOnboardFieldsHtml(id) +
        '<dl class="fub-meta">' +
          '<div class="fub-field"><dt>Stage</dt><dd><select data-act="crm-stage" data-id="' + esc(id) + '">' +
            stages.map((st) => '<option value="' + esc(st.id) + '"' + (c.stage === st.id ? ' selected' : '') + '>' + esc(st.label) + '</option>').join('') +
          '</select></dd></div>' +
          '<div class="fub-field"><dt>Assigned</dt><dd><select data-act="assign-mentor" data-id="' + esc(id) + '" aria-label="Assigned">' +
            assignableMentors(id).map((m) =>
              '<option value="' + esc(m.id) + '"' + (((s.mentorId || 'u-anton') === m.id) ? ' selected' : '') + '>' + esc(m.name) + '</option>'
            ).join('') +
          '</select></dd></div>' +
          '<div class="fub-field"><dt>Tags</dt>' + personTagsHtml(id) + '</div>' +
          '<div class="fub-field"><dt>Sumber</dt><dd>' + esc((app && app.heard) || b.source || '—') +
            (app ? '<div class="muted">' + (app.hasShop ? 'Sudah punya toko' : 'Belum punya toko') + '</div>' : '') +
          '</dd></div>' +
          '<div class="fub-field"><dt>Bayar</dt><dd>' +
            (canBill() ? billStatusSelect(id, b) : payChip(b.status, b.source)) +
            (confirmPaidBtn(id) ? '<div style="margin-top:6px">' + confirmPaidBtn(id) + '</div>' : '') +
            '<div class="muted" style="margin-top:6px">' + esc(termLabel(b.pendingTerm || b.term)) + '</div>' +
            (canBill() ? '<div style="margin-top:6px">' + billAmountInput(id, b) + '</div>' : '<div class="money">' + esc(fmtRp(b.amount || 0)) + '</div>') +
          '</dd></div>' +
          personEntitlementsHtml(id) +
        '</dl>' +
      '</aside>';

    let composerBody = '';
    if (mode === 'task' || ui.taskComposer === id) {
      composerBody = taskComposerHtml(id);
    } else if (mode === 'email') {
      composerBody = s.email
        ? '<p class="muted">Buka email di aplikasi kamu, lalu catat ringkasannya di bawah jika perlu.</p>' +
          '<a class="btn" href="' + esc(mailLink(s.email, 'MasterMind with Anton GC', 'Halo ' + fullName)) + '">Buka Email</a>' +
          '<form class="compose" data-act="note" data-id="' + esc(id) + '" style="margin-top:10px">' +
            '<textarea name="body" required rows="3" placeholder="Catatan setelah email…"></textarea>' +
            '<button class="btn" type="submit">Simpan catatan</button></form>'
        : '<p class="muted">Belum ada email. Isi di kolom kiri dulu.</p>';
    } else if (mode === 'wa') {
      composerBody = waComposerHtml(id, s);
    } else if (mode === 'call') {
      composerBody = '<form class="compose" data-act="log-call" data-id="' + esc(id) + '">' +
        '<textarea name="body" required rows="3" placeholder="Ringkas panggilan…"></textarea>' +
        '<button class="btn" type="submit">Catat panggilan</button></form>';
    } else {
      composerBody = '<form class="compose" data-act="note" data-id="' + esc(id) + '" style="margin:0">' +
        '<textarea name="body" required rows="3" placeholder="Tambah catatan…"></textarea>' +
        '<button class="btn" type="submit">Simpan catatan</button></form>';
    }

    let midBody = '';
    if (midTab === 'contrib') {
      midBody = contribs.length
        ? '<div class="fub-feed">' + contribs.map((n) =>
            '<article class="fub-item">' +
              '<span class="fub-tl-ico ' + (n.kind === 'post' ? 'is-event' : 'is-note') + '" aria-hidden="true">' +
                (n.kind === 'post' ? 'P' : 'K') + '</span>' +
              '<div>' +
                '<div class="fub-item-head"><strong>' + (n.kind === 'post' ? 'Postingan' : 'Komentar') +
                  (n.batchId ? ' · ' + esc(batchLabel(n.batchId)) : '') + '</strong>' +
                  '<span class="muted">' + esc(relWhen(n.at)) + '</span></div>' +
                '<div class="fub-item-body">' + esc(n.body) + '</div>' +
              '</div></article>'
          ).join('') + '</div>'
        : '<p class="muted">Belum ada postingan atau komentar di Diskusi.</p>';
    } else if (midTab === 'pay') {
      midBody = pays.length
        ? '<div class="fub-feed fub-pay-feed">' + pays.map((p) =>
            '<article class="fub-item">' +
              '<span class="fub-tl-ico is-task" aria-hidden="true">Rp</span>' +
              '<div>' +
                '<div class="fub-item-head"><strong>' + esc(payKindLabel(p.kind)) +
                  ' · ' + esc(fmtRp(p.amount || 0)) + '</strong>' +
                  '<span class="muted">' + esc(relWhen(p.at)) + '</span></div>' +
                '<div class="fub-item-body">' +
                  esc([p.source, p.term ? termLabel(p.term) : '', Array.isArray(p.products) && p.products.length ? p.products.join(', ') : '']
                    .filter(Boolean).join(' · ') || '—') +
                '</div>' +
              '</div></article>'
          ).join('') + '</div>'
        : '<p class="muted">Belum ada aktivitas pembayaran.</p>';
    } else {
      midBody = feed.length
        ? '<div class="fub-feed">' + feed.map((n) => {
            const meta = feedKindMeta(n.kind);
            return '<article class="fub-item">' +
              '<span class="fub-tl-ico ' + meta.cls + '" aria-hidden="true">' + esc(meta.label.charAt(0)) + '</span>' +
              '<div>' +
                '<div class="fub-item-head"><strong>' + esc(n.who) + ' · ' + esc(meta.label) + '</strong>' +
                  '<span class="muted">' + esc(relWhen(n.at)) + '</span></div>' +
                '<div class="fub-item-body">' + esc(n.body) + '</div>' +
              '</div></article>';
          }).join('') + '</div>'
        : '<p class="muted">Belum ada catatan atau event.</p>';
    }

    const center =
      '<main class="fub-center">' +
        '<div class="fub-composer">' +
          '<div class="fub-acts" role="tablist">' +
            '<button type="button" class="btn-sm' + (mode === 'note' ? ' is-on' : '') + '" data-act="compose-mode" data-id="note">Catatan</button>' +
            '<button type="button" class="btn-sm' + (mode === 'email' ? ' is-on' : '') + '" data-act="compose-mode" data-id="email">Email</button>' +
            '<button type="button" class="btn-sm' + (mode === 'wa' ? ' is-on' : '') + '" data-act="compose-mode" data-id="wa">WA' +
              (waUnreadFor(id) ? ' · ' + waUnreadFor(id) : '') + '</button>' +
            '<button type="button" class="btn-sm' + (mode === 'call' ? ' is-on' : '') + '" data-act="compose-mode" data-id="call">Panggilan</button>' +
            '<button type="button" class="btn-sm' + (mode === 'task' ? ' is-on' : '') + '" data-act="compose-mode" data-id="task">Tugas</button>' +
          '</div>' +
          composerBody +
        '</div>' +
        '<div class="fub-mid-tabs" role="tablist">' +
          '<button type="button" class="btn-sm' + (midTab === 'timeline' ? ' is-on' : '') + '" data-act="person-mid" data-id="timeline">Linimasa</button>' +
          '<button type="button" class="btn-sm' + (midTab === 'contrib' ? ' is-on' : '') + '" data-act="person-mid" data-id="contrib">Kontribusi' +
            (contribs.length ? ' · ' + contribs.length : '') + '</button>' +
          '<button type="button" class="btn-sm' + (midTab === 'pay' ? ' is-on' : '') + '" data-act="person-mid" data-id="pay">Pembayaran' +
            (pays.length ? ' · ' + pays.length : '') + '</button>' +
        '</div>' +
        midBody +
      '</main>';

    const right =
      '<aside class="fub-right">' +
        '<section class="fub-widget">' +
          '<h3>Tugas <button type="button" class="btn-sm" data-act="compose-mode" data-id="task">+</button></h3>' +
          (tsk.length
            ? tsk.slice(0, 8).map((t) =>
                '<div class="fub-task">' +
                  (t.done
                    ? '<span class="tick-ok">✓</span>'
                    : '<button type="button" class="task-check" data-act="task-done" data-id="' + esc(t.id) + '" aria-label="Selesai"></button>') +
                  '<div><strong>' + esc(t.title) + '</strong>' +
                    '<div class="muted">' + esc(taskKindLabel(t.kind)) + ' · ' + esc(relWhen(t.dueAt)) + '</div>' +
                    (!t.done && canBill() && isPending(id) && /cek transfer/i.test(t.title || '')
                      ? '<div style="margin-top:6px"><button type="button" class="btn-sm" data-act="confirm-paid" data-id="' + esc(id) + '" data-task="' + esc(t.id) + '">Konfirmasi lunas</button></div>'
                      : '') +
                  '</div></div>'
              ).join('')
            : '<p class="muted">Tidak ada tugas.</p>') +
        '</section>' +
        '<section class="fub-widget">' +
          '<h3>Rencana aksi</h3>' +
          (plans.length
            ? plans.map((pl) => {
                const on = isEnrolled(id, pl.id);
                return '<label class="fub-plan"><input type="checkbox" data-act="enroll-plan" data-id="' + esc(id) + '" data-pid="' + esc(pl.id) + '"' +
                  (on ? ' checked' : '') + '>' +
                  '<span>' + esc(pl.name) +
                    (on ? ' <span class="chip running">Jalan</span>' : ' <span class="chip idle">Off</span>') +
                    '<div class="muted">' + esc(triggerLabel(pl.trigger)) + '</div></span></label>';
              }).join('')
            : '<p class="muted">Belum ada rencana.</p>') +
        '</section>' +
        '<section class="fub-widget">' +
          '<h3>Aktivitas kelas</h3>' +
          '<div class="fub-stats">' +
            '<div><strong>' + prog.n + '</strong><span class="muted">Materi selesai</span></div>' +
            '<div><strong>' + prog.pct + '%</strong><span class="muted">Progres</span></div>' +
            '<div><strong>' + openTasks + '</strong><span class="muted">Tugas open</span></div>' +
          '</div>' +
          '<div style="margin-top:12px">' + progressBarHtml(id) + '</div>' +
        '</section>' +
      '</aside>';

    return '<div class="fub-page">' +
      '<div class="fub-page-bar">' +
        '<button class="btn secondary" data-act="close-person">← Orang</button>' +
        '<strong>' + esc(fullName) + '</strong>' +
        payChip(b.status, b.source) +
        confirmPaidBtn(id) +
        '<span class="chip">' + esc(stageLabel(c.stage)) + '</span>' +
      '</div>' +
      '<div class="fub-3">' + left + center + right + '</div></div>';
  }

  function viewMentorProgres() {
    return '<div class="card"><h2>Progres</h2>' +
      '<p class="muted">Persen materi yang ditandai selesai. Bukan skor buatan.</p>' +
      '<div class="prog-list">' +
      people().map((s) => {
        const p = kurProgress(s.id);
        return '<button type="button" class="prog-row" data-act="open-student" data-id="' + esc(s.id) + '">' +
          avatarHtml(s, 'avatar sm') +
          '<span class="prog-name">' + esc(s.name) +
            '<div class="muted">' + p.n + '/' + p.total + ' materi</div></span>' +
          '<div class="prog-bar-wrap"><div class="bar kur-bar"><span style="width:' + p.pct + '%"></span></div></div>' +
          '<strong class="prog-pct">' + p.pct + '%</strong></button>';
      }).join('') +
      '</div></div>';
  }

  function lecHasContent(l) {
    if (!l) return false;
    if (l.type === 'text') return !!(l.body && String(l.body).trim());
    if (l.type === 'document') return !!(l.resources && l.resources.length);
    return !!(l.url || l.videoBlob || l.videoKey);
  }
  function lecTypeIcon(l) {
    if (l.type === 'text') return 'Aa';
    if (l.type === 'document') return '≡';
    return '▶';
  }

  function viewKurikulum() {
    if (!ui.kurEdit) return viewKurikulumStudent();
    return viewKurikulumEditor();
  }

  function viewKurikulumStudent() {
    const lec = lectureById(ui.lectureId) || lectures()[0];
    if (!lec) {
      return '<div class="card"><h2>Kurikulum</h2><p class="muted">Belum ada materi.</p>' +
        (ui.role === 'asisten' ? '' : '<button type="button" class="btn" data-act="kur-edit-on">Edit kurikulum</button>') +
        '</div>';
    }
    ui.lectureId = lec.id;
    const canEdit = ui.role !== 'asisten';
    const bar = '<div class="kur-mode-bar">' +
      '<div><strong>Tampilan siswa</strong>' +
        '<p class="muted" style="margin:2px 0 0">Begini materi terlihat di Belajar. ' +
        (canEdit ? 'Klik Edit kalau mau ubah konten.' : 'Asisten hanya lihat.') + '</p></div>' +
      '<div class="row">' +
        (canEdit
          ? '<button type="button" class="btn secondary" data-act="kur-edit-lec" data-id="' + esc(lec.id) + '">Edit materi ini</button>' +
            '<button type="button" class="btn" data-act="kur-edit-on">Edit kurikulum</button>'
          : '') +
      '</div></div>';
    return '<div class="kur-student-wrap">' + bar +
      '<div class="player-layout">' +
        '<div>' + renderLessonPlayer(lec, { phone: false, paywalled: false, seqLocked: false }) + '</div>' +
        '<aside class="kurikulum-pane is-open">' + renderKurikulumSidebar() + '</aside>' +
      '</div></div>';
  }

  function viewKurikulumEditor() {
    const readonly = ui.role === 'asisten';
    const nVid = lectures().filter((l) => l.type === 'video').length;
    const nTxt = lectures().filter((l) => l.type === 'text').length;
    const nFile = lectures().filter((l) => l.type === 'document').length;
    ensureSecFold();
    const toolbar = '<div class="ud-head">' +
      '<div><h2 style="margin:0">Edit kurikulum</h2>' +
        '<p class="muted" style="margin:6px 0 0">Susun bagian, lalu tambah lecture. Geser untuk urutan. ' +
        nVid + ' video · ' + nTxt + ' bacaan · ' + nFile + ' file.</p></div>' +
      '<button type="button" class="btn secondary" data-act="kur-edit-off">← Lihat seperti siswa</button>' +
      '</div>';
    const sections = db.weeks.map((w, wi) => {
      const items = lecturesInWeek(w.id);
      const open = isSecOpen(w.id);
      const editing = ui.editSecId === w.id;
      const list = items.map((l, li) => lecEditorCard(l, readonly, li + 1)).join('');
      const addOpen = ui.addItemWeek === w.id;
      return '<section class="ud-sec' + (open ? '' : ' is-collapsed') + '" data-sec="' + esc(w.id) + '">' +
        '<div class="ud-sec-head">' +
          (readonly ? '' : '<span class="drag-handle" draggable="true" data-drag="sec" data-id="' + esc(w.id) + '" title="Geser bagian">⋮⋮</span>') +
          '<button type="button" class="ud-caret" data-act="sec-fold" data-id="' + esc(w.id) + '"' +
            ' aria-expanded="' + open + '">' + (open ? '▾' : '▸') + '</button>' +
          '<span class="ud-kicker">Bagian ' + (wi + 1) + ':</span>' +
          (editing && !readonly
            ? '<input class="ud-title-in" data-act="sec-title" data-id="' + esc(w.id) + '" value="' + esc(w.title) + '" aria-label="Nama bagian">'
            : '<strong class="ud-sec-title">' + esc(w.title) + '</strong>') +
          '<span class="muted ud-count">' + items.length + ' lecture</span>' +
          (readonly ? '' : '<div class="ud-actions">' +
            (editing ? '<input type="date" data-act="sec-due" data-id="' + esc(w.id) + '" value="' + esc(w.due || '') + '" title="Jatuh tempo">' : '') +
            '<button type="button" class="btn-sm" data-act="edit-sec" data-id="' + esc(w.id) + '">' + (editing ? 'Selesai' : 'Edit') + '</button>' +
            '<button type="button" class="btn-sm" data-act="del-sec" data-id="' + esc(w.id) + '">Hapus</button>' +
          '</div>') +
        '</div>' +
        '<div class="ud-sec-body">' +
          (list || '<p class="muted ud-empty">Belum ada lecture. Tambah item kurikulum di bawah.</p>') +
          (readonly ? '' : (addOpen
            ? addLecForm(w.id)
            : '<button type="button" class="ud-add" data-act="add-item" data-id="' + esc(w.id) + '">+ Item kurikulum</button>')) +
        '</div>' +
      '</section>';
    }).join('');
    const newSec = readonly ? '' : (ui.addSecOpen
      ? '<form class="ud-new-sec" data-act="add-sec-form">' +
          '<strong>Bagian baru</strong>' +
          '<input name="title" required maxlength="140" placeholder="Masukkan judul">' +
          '<label class="muted">Jatuh tempo (opsional) <input name="due" type="date"></label>' +
          '<div class="row">' +
            '<button class="btn" type="submit">Tambah bagian</button>' +
            '<button type="button" class="btn secondary" data-act="cancel-sec">Batal</button>' +
          '</div></form>'
      : '<button type="button" class="ud-add ud-add-sec" data-act="new-sec">+ Bagian</button>');
    return '<div class="ud-page">' + toolbar + sections + newSec + '</div>';
  }

  function addLecForm(weekId) {
    return '<form class="ud-new-item" data-act="add-lec" data-week="' + esc(weekId) + '">' +
      '<div class="ud-kinds" role="group" aria-label="Jenis item">' +
        '<label><input type="radio" name="kind" value="video" checked> Lecture</label>' +
        '<label><input type="radio" name="kind" value="text"> Bacaan</label>' +
        '<label><input type="radio" name="kind" value="file"> File</label>' +
      '</div>' +
      '<label class="muted">Lecture baru</label>' +
      '<div class="row">' +
        '<input name="title" required maxlength="140" placeholder="Masukkan judul" style="flex:1">' +
        '<button class="btn" type="submit">Tambah lecture</button>' +
        '<button type="button" class="btn secondary" data-act="cancel-item">Batal</button>' +
      '</div></form>';
  }

  function lecEditorPreviewHtml(l) {
    const cover = coverHtml('lec', l.id, 'ud-preview-cover');
    const coverBlock = '<div class="ud-preview-block">' +
      '<span class="muted">Preview cover</span>' +
      (cover || '<div class="ud-preview-cover is-empty">Belum ada cover</div>') +
      '</div>';
    if (l.type !== 'video') return '<div class="ud-media-preview">' + coverBlock + '</div>';
    let vid = '';
    if (l.videoKey) {
      vid = '<video class="ud-preview-vid" controls playsinline preload="metadata" src="' + esc(mediaFileUrl(l.videoKey)) + '"></video>';
    } else if (l.videoBlob) {
      vid = '<video class="ud-preview-vid" controls playsinline preload="metadata" data-blob="' + esc(l.id) + '"></video>';
    } else {
      const e = parseEmbed(l.url);
      if (e && e.kind === 'youtube' && e.videoId) {
        vid = '<div class="ud-preview-embed"><iframe src="https://www.youtube-nocookie.com/embed/' +
          esc(e.videoId) + '?rel=0&modestbranding=1" title="Preview video" allowfullscreen loading="lazy"></iframe></div>';
      } else if (e && e.embed) {
        const src = String(e.embed).replace(/autoplay=1&?/g, '');
        vid = '<div class="ud-preview-embed"><iframe src="' + esc(src) +
          '" title="Preview video" allowfullscreen loading="lazy"></iframe></div>';
      } else if (l.url) {
        vid = '<p class="muted">Preview inline tidak tersedia. <a href="' + esc(l.url) +
          '" target="_blank" rel="noopener">Buka tautan</a></p>';
      } else {
        vid = '<p class="muted">Belum ada video untuk dipreview.</p>';
      }
    }
    return '<div class="ud-media-preview">' + coverBlock +
      '<div class="ud-preview-block"><span class="muted">Preview video</span>' + vid + '</div></div>';
  }

  function lecEditorCard(l, readonly, n) {
    const open = ui.editLecId === l.id;
    const has = lecHasContent(l);
    const kindNote = l.type === 'video' ? videoKindLabel(l) : (l.type === 'text' ? 'Bacaan' : ((l.resources || []).length + ' file'));
    const head = '<div class="ud-item-head">' +
      (readonly ? '' : '<span class="drag-handle" draggable="true" data-drag="lec" data-id="' + esc(l.id) + '" title="Geser materi">⋮⋮</span>') +
      '<span class="ud-icon" aria-hidden="true">' + lecTypeIcon(l) + '</span>' +
      '<span class="ud-item-copy"><strong>' + (n ? n + '. ' : '') + esc(l.title) + '</strong>' +
        '<div class="muted">' + esc(kindNote) + (l.requiredBefore ? ' · wajib' : '') + '</div></span>' +
      '<div class="ud-actions">' +
        (readonly ? '' : ((open)
          ? '<button type="button" class="btn-sm" data-act="edit-lec" data-id="' + esc(l.id) + '">Tutup</button>'
          : '<button type="button" class="btn-sm' + (has ? '' : ' ud-content-btn') + '" data-act="edit-lec" data-id="' + esc(l.id) + '">' +
            (has ? 'Edit' : '+ Konten') + '</button>')) +
        (readonly ? '' : '<button type="button" class="btn-sm" data-act="del-lec" data-id="' + esc(l.id) + '">Hapus</button>') +
      '</div></div>';
    if (!open) return '<article class="ud-item" data-lec-drop="' + esc(l.id) + '">' + head + '</article>';
    const qs = (l.questions || []).concat([{ q: '', hint: '' }]);
    const qHtml = qs.map((q, i) =>
      '<div class="q-row">' +
        '<input data-act="q-field" data-id="' + esc(l.id) + '" data-i="' + i + '" data-k="q" value="' + esc(q.q || '') +
          '" placeholder="Prompt / pertanyaan (boleh retoris)">' +
        '<input data-act="q-field" data-id="' + esc(l.id) + '" data-i="' + i + '" data-k="hint" value="' + esc(q.hint || '') +
          '" placeholder="Catatan opsional (bukan kunci jawaban)">' +
      '</div>'
    ).join('');
    const resHtml = (l.resources || []).map((r, i) =>
      '<div class="row" style="margin-top:6px">' +
        '<input data-act="res-name" data-id="' + esc(l.id) + '" data-i="' + i + '" value="' + esc(r.name || '') + '" placeholder="Nama file">' +
        (r.blob
          ? '<span class="muted">' + esc(r.name || 'file') + '</span>'
          : '<input data-act="res-url" data-id="' + esc(l.id) + '" data-i="' + i + '" value="' + esc(r.url || '') + '" placeholder="Tautan">') +
        '<button type="button" class="btn-sm" data-act="res-del" data-id="' + esc(l.id) + '" data-i="' + i + '">Hapus</button>' +
      '</div>'
    ).join('');
    const descLabel = l.type === 'text' ? 'Bacaan' : (l.type === 'video' ? 'Deskripsi video' : 'Deskripsi');
    const descPh = l.type === 'text'
      ? 'Teks bacaan. **tebal** boleh.'
      : 'Tulis deskripsi singkat tentang materi ini. **tebal** boleh.';
    const body = readonly
      ? '<p class="muted">Asisten hanya lihat. Anton yang unggah.</p>'
      : '<div class="lec-edit-body">' +
          '<label>Judul</label>' +
          '<input data-act="lec-field" data-id="' + esc(l.id) + '" data-k="title" value="' + esc(l.title) + '">' +
          '<label>Pindah ke bagian</label>' +
          '<select data-act="lec-week" data-id="' + esc(l.id) + '">' +
            db.weeks.map((w) => '<option value="' + esc(w.id) + '"' + (w.id === l.weekId ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('') +
          '</select>' +
          '<label class="muted"><input type="checkbox" data-act="lec-req" data-id="' + esc(l.id) + '"' +
            (l.requiredBefore ? ' checked' : '') + '> Wajib sebelum live class</label>' +
          '<h4>Cover</h4>' +
          '<label class="vid-drop"><input type="file" data-act="cover-file" data-kind="lec" data-id="' + esc(l.id) + '" accept="image/*" hidden><span>Unggah cover (maks 5 MB)</span></label>' +
          (l.type === 'document'
            ? '<p class="muted">Unggah file atau tautan di bagian File di bawah.</p>'
            : l.type === 'text'
            ? ''
            : '<h4>Video</h4>' +
              '<p class="muted">YouTube paling lancar. Drive juga bisa. Atau unggah MP4 (maks 5 GB, tersimpan di kelas).</p>' +
              '<input data-act="lec-field" data-id="' + esc(l.id) + '" data-k="url" value="' + esc(l.url || '') + '" placeholder="https://youtube.com/…">' +
              '<label class="vid-drop" data-act="vid-drop" data-id="' + esc(l.id) + '">' +
                '<input type="file" data-act="vid-file" data-id="' + esc(l.id) + '" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden>' +
                '<span>' + (l.videoKey || l.videoBlob ? ('Ganti file · sekarang: ' + esc(l.videoName || 'video')) : 'Drop / pilih file MP4') + '</span>' +
              '</label>' +
              (l.videoKey || l.videoBlob ? '<button type="button" class="btn-sm" data-act="clear-vid" data-id="' + esc(l.id) + '">Hapus file, pakai tautan</button>' : '')) +
          lecEditorPreviewHtml(l) +
          '<h4>' + descLabel + '</h4>' +
          '<textarea data-act="lec-body" data-id="' + esc(l.id) + '" rows="6" placeholder="' + esc(descPh) + '">' +
            esc(l.body || '') + '</textarea>' +
          '<h4>File / lembar kerja</h4>' +
          resHtml +
          '<div class="row" style="margin-top:8px">' +
            '<input data-act="res-new-url" data-id="' + esc(l.id) + '" placeholder="Tautan file baru">' +
            '<button type="button" class="btn-sm" data-act="res-add-url" data-id="' + esc(l.id) + '">+ Tautan</button>' +
            '<label class="btn-sm">+ Unggah file<input type="file" hidden data-act="res-file" data-id="' + esc(l.id) + '"></label>' +
          '</div>' +
          '<h4>Poin penting</h4>' +
          '<textarea data-act="lec-points" data-id="' + esc(l.id) + '" rows="4" placeholder="Satu poin per baris">' +
            esc((l.points || []).join('\n')) + '</textarea>' +
          '<h4>Cek pemahaman</h4>' +
          '<p class="muted">Prompt atau pertanyaan retoris. Murid tidak mengirim jawaban — hanya dipikirkan.</p>' +
          qHtml +
        '</div>';
    return '<article class="ud-item is-open" data-lec-drop="' + esc(l.id) + '">' + head + body + '</article>';
  }

  function viewPustaka() {
    const canAdd = canBill();
    const addOpen = canAdd && ui.pustakaAddOpen;
    return catalogHero() +
      '<div class="card" style="margin-top:12px">' +
      '<div class="pustaka-head">' +
        '<div><h2 style="margin:0">Perpustakaan</h2>' +
          '<p class="muted" style="margin:6px 0 0">Produk lynk Anton. Toggle Contoh → File Anton setelah dia isi.</p></div>' +
        (canAdd
          ? '<button type="button" class="btn' + (addOpen ? ' secondary' : '') + '" data-act="pustaka-add-toggle">' +
              (addOpen ? 'Tutup' : '+ Tambah') + '</button>'
          : '') +
      '</div>' +
      (addOpen
        ? '<form class="compose add-sku" data-act="add-sku">' +
            '<strong>Tambah produk</strong>' +
            '<div class="row2">' +
              '<div><label class="muted">Judul</label><input name="title" required placeholder="Nama alat / rekaman"></div>' +
              '<div><label class="muted">Grup</label><select name="group"><option value="alat">Alat</option><option value="rekaman">Rekaman</option></select></div>' +
            '</div>' +
            '<label class="muted">Untuk apa</label>' +
            '<input name="job" placeholder="Satu kalimat">' +
            '<div class="row2">' +
              '<div><label class="muted">Harga</label><input name="price" type="number" min="0" value="99000"></div>' +
              '<div><label class="muted">Coret</label><input name="coret" type="number" min="0" value="129000"></div>' +
            '</div>' +
            '<label class="muted">Tautan lynk</label>' +
            '<input name="lynk" placeholder="https://lynk.id/…">' +
            '<label class="muted">Cover URL (opsional)</label>' +
            '<input name="cover" placeholder="./assets/… atau https://">' +
            '<div class="row">' +
              '<label class="muted"><input type="checkbox" name="example" checked> Contoh dulu</label>' +
              '<label class="muted"><input type="checkbox" name="mentor" checked> Termasuk mentoring</label>' +
              '<button class="btn" type="submit">Tambah ke perpustakaan</button>' +
              '<button type="button" class="btn secondary" data-act="pustaka-add-toggle">Batal</button>' +
            '</div></form>'
        : '') +
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
            (p.lynk ? '<a class="btn-sm" href="' + esc(p.lynk) + '" target="_blank" rel="noopener">lynk</a>' : '') +
            (canBill() && String(p.id).indexOf('sku-') === 0
              ? '<button class="btn-sm" data-act="del-sku" data-id="' + esc(p.id) + '">Hapus</button>'
              : '') +
          '</div></div></div>'
      ).join('') + '</div></div>';
  }

  function calEvents() {
    const ev = [];
    (db.sessions || []).forEach((s) => ev.push({
      kind: 'meet', at: s.startsAt, title: s.title, id: s.id, loc: s.location, url: s.meetUrl,
      notes: s.notes || ''
    }));
    (db.weeks || []).forEach((w) => {
      if (w.due) ev.push({ kind: 'kur', at: joinLocal(w.due, '09:00'), title: w.title, id: w.id });
    });
    (db.tasks || []).filter((t) => !t.done).forEach((t) => ev.push({
      kind: 'task', at: t.dueAt, title: t.title, id: t.id, personId: t.personId
    }));
    queuedItems().forEach((t) => ev.push({
      kind: 'task', at: t.dueAt, title: t.title, id: t.id, personId: t.personId
    }));
    return ev;
  }

  function icsEscape(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function icsUtcStamp(d) {
    const x = d instanceof Date ? d : new Date(d);
    if (!isFinite(x.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return x.getUTCFullYear() + p(x.getUTCMonth() + 1) + p(x.getUTCDate()) + 'T' +
      p(x.getUTCHours()) + p(x.getUTCMinutes()) + p(x.getUTCSeconds()) + 'Z';
  }
  function sessionDurationMins(s) {
    return Math.max(30, +(s && s.mins) || 90);
  }
  function sessionIcsEvent(s) {
    const start = new Date(s.startsAt);
    const end = new Date(start.getTime() + sessionDurationMins(s) * 60e3);
    const desc = [s.notes, s.meetUrl ? ('Meet: ' + s.meetUrl) : ''].filter(Boolean).join('\n');
    return [
      'BEGIN:VEVENT',
      'UID:' + String(s.id || 'ses') + '@' + schoolSlug(),
      'DTSTAMP:' + icsUtcStamp(new Date()),
      'DTSTART:' + icsUtcStamp(start),
      'DTEND:' + icsUtcStamp(end),
      'SUMMARY:' + icsEscape(s.title || 'Sesi kelas'),
      'DESCRIPTION:' + icsEscape(desc),
      'LOCATION:' + icsEscape(s.location || 'Online'),
      (s.meetUrl ? ('URL:' + String(s.meetUrl).replace(/\s/g, '')) : ''),
      'END:VEVENT'
    ].filter(Boolean).join('\r\n');
  }
  function buildSessionsIcs(list) {
    const body = (list || db.sessions || []).map(sessionIcsEvent).join('\r\n');
    return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MasterMind with Anton GC//' +
      icsEscape(SEED.cohort.name || 'Batch') + '//ID\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:' +
      icsEscape((SEED.school.name || 'Anton') + ' · ' + (SEED.cohort.name || 'Jadwal')) +
      '\r\n' + body + '\r\nEND:VCALENDAR\r\n';
  }
  function downloadIcs(filename, icsText) {
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'jadwal-anton.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function googleCalUrl(s) {
    const start = new Date(s.startsAt);
    const end = new Date(start.getTime() + sessionDurationMins(s) * 60e3);
    const dates = icsUtcStamp(start) + '/' + icsUtcStamp(end);
    const q = new URLSearchParams({
      action: 'TEMPLATE',
      text: s.title || 'Sesi kelas',
      dates: dates,
      details: [s.notes || '', s.meetUrl || ''].filter(Boolean).join('\n'),
      location: s.location || 'Online'
    });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  function calSyncButtons(s, compact) {
    if (!s || !s.startsAt) return '';
    const icsBtn = '<button type="button" class="btn-sm" data-act="cal-ics-one" data-id="' + esc(s.id) +
      '" title="Unduh .ics — buka di Apple Calendar atau impor di Google">Apple / .ics</button>';
    const gBtn = '<a class="btn-sm" href="' + esc(googleCalUrl(s)) +
      '" target="_blank" rel="noopener">Google Calendar</a>';
    if (compact) {
      return '<div class="row cal-sync">' + gBtn + icsBtn + '</div>';
    }
    return '<div class="row cal-sync" style="margin-top:8px">' + gBtn + icsBtn + '</div>';
  }

  function viewJadwal(staff) {
    const today = splitLocal().date;
    const ym = ui.calYM || today.slice(0, 7);
    const [yy, mm] = ym.split('-').map(Number);
    const dim = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const pad = (new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay() + 6) % 7;
    const events = calEvents();
    const byDay = {};
    events.forEach((ev) => {
      const d = ymdOf(ev.at);
      (byDay[d] = byDay[d] || []).push(ev);
    });
    const selected = ui.calDay || today;
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push('<div class="cal-cell is-pad"></div>');
    for (let d = 1; d <= dim; d++) {
      const key = yy + '-' + String(mm).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const list = byDay[key] || [];
      cells.push(
        '<button type="button" class="cal-cell' + (key === today ? ' is-today' : '') + (key === selected ? ' is-on' : '') +
          '" data-act="cal-day" data-id="' + esc(key) + '">' +
          '<span class="cal-n">' + d + '</span>' +
          list.slice(0, 3).map((ev) =>
            '<span class="cal-dot kind-' + esc(ev.kind) + '">' + esc(ev.title) + '</span>'
          ).join('') +
          (list.length > 3 ? '<span class="muted">+' + (list.length - 3) + '</span>' : '') +
        '</button>'
      );
    }
    const dayEv = (byDay[selected] || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
    const kindLabel = { meet: 'Meet / Zoom', kur: 'Kurikulum', task: 'Tugas' };
    const detail = '<div class="cal-day">' +
      '<h3>' + esc(selected) + '</h3>' +
      (dayEv.length
        ? dayEv.map((ev) => {
            if (ev.kind === 'meet') {
              const ses = (db.sessions || []).find((s) => s.id === ev.id) || ev;
              return '<article class="thread"><h4>' + esc(kindLabel.meet) + ' · ' + esc(ev.title) + '</h4>' +
                '<p class="muted">' + fmtWhen(ev.at) + (ev.loc ? ' · ' + esc(ev.loc) : '') + '</p>' +
                (staff && canBill()
                  ? '<form class="compose" data-act="meet" data-id="' + esc(ev.id) + '"><input name="meetUrl" value="' + esc(ev.url || '') + '" placeholder="https://meet.google.com/..."><button class="btn" type="submit">Simpan tautan Meet</button></form>'
                  : (ev.url ? '<a class="btn" href="' + esc(ev.url) + '" target="_blank" rel="noopener">Buka Meet</a>' : '')) +
                calSyncButtons(ses) +
                '</article>';
            }
            if (ev.kind === 'kur') {
              return '<article class="thread"><h4>Kurikulum · ' + esc(ev.title) + '</h4>' +
                '<p class="muted">Jatuh tempo bagian</p>' +
                '<button type="button" class="btn-sm" data-act="tab" data-id="kurikulum">Buka kurikulum</button></article>';
            }
            return '<article class="thread"><h4>Tugas · ' + esc(ev.title) + '</h4>' +
              '<p class="muted">' + fmtClock(ev.at) + ' · <button type="button" class="linkish" data-act="open-student" data-id="' + esc(ev.personId) + '">' + esc(nameOf(ev.personId)) + '</button></p></article>';
          }).join('')
        : '<p class="muted">Tidak ada kurikulum, Meet, atau tugas di hari ini.</p>') +
      '</div>';
    const prevM = mm === 1 ? (yy - 1) + '-12' : yy + '-' + String(mm - 1).padStart(2, '0');
    const nextM = mm === 12 ? (yy + 1) + '-01' : yy + '-' + String(mm + 1).padStart(2, '0');
    const monthLabel = new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const nSes = (db.sessions || []).length;
    return '<div class="card"><h2>Jadwal</h2>' +
      '<p class="muted">Kalender kelas: Meet live, jatuh tempo kurikulum, tugas. Sinkron lewat Google Calendar atau file .ics (Apple Calendar).</p>' +
      '<div class="cal-sync-bar">' +
        '<button type="button" class="btn" data-act="cal-ics-all">Unduh semua sesi (.ics)</button>' +
        '<span class="muted">' + nSes + ' live session · buka di Apple Calendar, atau Google Calendar → Settings → Import</span>' +
      '</div>' +
      '<div class="cal-nav">' +
        '<button type="button" class="btn-sm" data-act="cal-ym" data-id="' + esc(prevM) + '">←</button>' +
        '<strong>' + esc(monthLabel) + '</strong>' +
        '<button type="button" class="btn-sm" data-act="cal-ym" data-id="' + esc(nextM) + '">→</button>' +
        '<button type="button" class="btn-sm" data-act="cal-ym" data-id="' + esc(today.slice(0, 7)) + '">Hari ini</button>' +
      '</div>' +
      '<div class="cal-week">' + ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => '<span>' + d + '</span>').join('') + '</div>' +
      '<div class="cal-grid">' + cells.join('') + '</div>' +
      detail +
      '<a class="wa" href="' + esc(SEED.school.waGroup) + '" target="_blank" rel="noopener">WA grup</a></div>';
  }

  function openDrawer(id) { openPerson(id); }
  function closeDrawer() {
    ui.drawerId = null;
    const d = $('drawer');
    const s = $('drawer-scrim');
    if (d) { d.hidden = true; d.innerHTML = ''; }
    if (s) s.hidden = true;
  }

  function resolvePresentVal(v) {
    if (v === 'now') return isoNow();
    if (v === '+24h') return addMs(isoNow(), 24 * 36e5);
    return v;
  }
  function applyWorld(patch) {
    if (!patch) return;
    Object.keys(patch).forEach((key) => {
      if (key === 'clockOffsetMs') {
        db.clockOffsetMs = patch.clockOffsetMs;
        return;
      }
      const val = patch[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        db[key] = db[key] || {};
        Object.keys(val).forEach((id) => {
          const row = val[id];
          if (row && typeof row === 'object' && !Array.isArray(row)) {
            const next = {};
            Object.keys(row).forEach((k) => { next[k] = resolvePresentVal(row[k]); });
            db[key][id] = Object.assign({}, db[key][id] || {}, next);
          } else {
            db[key][id] = row;
          }
        });
      } else {
        db[key] = val;
      }
    });
  }
  function applyCamera(cam) {
    cam = cam || {};
    closeDrawer();
    ui.payPrompt = !!cam.payPrompt;
    ui.kurOpen = !!cam.kurOpen;
    ui.examAnswers = cam.examAnswers || {};
    ui.payTerm = cam.payTerm || 'month';
    ui.skuId = cam.skuId || null;
    ui.skuPreview = false;
    ui.skuFrom = 'alat';
    if (ui.presentPane === 'mentor') {
      ui.role = 'owner';
      ui.personId = cam.personId || cam.drawerId || null;
      if (cam.hub) ui.siswaView = cam.hub;
      if (cam.tab === 'crm') {
        ui.siswaView = cam.hub || 'pipa';
        ui.mentorTab = ui.personId ? 'orang' : 'siswa';
      } else if (cam.tab === 'progres') {
        ui.siswaView = 'progres';
        ui.mentorTab = 'siswa';
      } else {
        ui.mentorTab = cam.tab || 'siswa';
      }
      if (cam.tab === 'tugas' || cam.tab === 'waq') {
        if (ui.personId) ui.taskPerson = ui.personId;
      }
    } else {
      ui.role = 'student';
      ui.personaId = cam.personaId || ui.personaId;
      ui.tab = cam.tab || 'home';
      ui.lectureId = cam.lectureId || db.lastLecture[ui.personaId] || firstLectureId();
    }
  }
  function applyPresent(scene) {
    if (!scene) return;
    ui.presentApplying = true;
    db = defaultState();
    applyWorld(scene.world);
    save();
    applyCamera(ui.presentPane === 'mentor' ? scene.mentor : scene.student);
    resetWizForPersona();
    render();
    clearTimeout(applyPresent._ready);
    applyPresent._ready = setTimeout(() => {
      ui.presentApplying = false;
      ui.presentReady = true;
    }, 250);
  }
  function reloadDb() {
    if (ui.presentApplying || ui.reloading) return;
    ui.reloading = true;
    db = load();
    try {
      render();
    } finally {
      ui.reloading = false;
    }
  }
  window.__antonSchool = { applyPresent: applyPresent, reloadDb: reloadDb };

  /* ── events ──────────────────────────────────────────────────────── */
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'role-switch') {
      if (ui.present || ui.chromeSync || onStudentVanityPath()) return;
      ui.role = t.value;
      ui.tab = 'home';
      ui.mentorTab = 'dash';
      closeDrawer();
      if (!isStaff()) {
        ui.tab = needsWizard(ui.personaId) ? 'daftar' : 'home';
        resetWizForPersona();
      } else {
        refreshWaStatus().then(() => pullWaInbox());
        ensureWaPoll();
      }
      render();
      return;
    }
    if (t.id === 'persona-switch') {
      if (ui.present || ui.chromeSync) return;
      ui.personaId = t.value;
      ui.lectureId = db.lastLecture[ui.personaId] || firstLectureId();
      ui.kolabSel = new Set();
      ui.skuId = null;
      ui.skuPreview = false;
      ui.payPrompt = false;
      ui.examAnswers = {};
      ui.tab = needsWizard(ui.personaId) ? 'daftar' : 'home';
      resetWizForPersona();
      render();
      return;
    }
    if (t.matches('[data-act="has-shop"]')) {
      const box = document.getElementById('shop-fields');
      const ya = t.value === 'ya';
      if (box) {
        box.hidden = !ya;
        box.querySelectorAll('input').forEach((inp) => { inp.required = ya; });
      }
      return;
    }
    if (t.matches('[data-act="heard-from"]')) {
      const box = document.getElementById('heard-other');
      const other = t.value === 'Lainnya';
      if (box) {
        box.hidden = !other;
        const inp = box.querySelector('input');
        if (inp) inp.required = other;
      }
      return;
    }
    if (t.matches('[data-act="filter-crm"]')) {
      ui.crmFilter = t.value;
      render();
      const el = document.querySelector('[data-act="filter-crm"]');
      if (el) {
        el.focus();
        const n = el.value.length;
        el.setSelectionRange(n, n);
      }
      return;
    }
    if (t.matches('[data-act="crm-stage"]')) {
      setStage(t.getAttribute('data-id'), t.value, 'Anton pindah stage.');
      save();
      render();
      return;
    }
    if (t.matches('[data-act="assign-mentor"]')) {
      const id = t.getAttribute('data-id');
      const mentorId = t.value || 'u-anton';
      patchPerson(id, { mentorId });
      save();
      render();
      return;
    }
    if (t.matches('[data-act="person-batch"]')) {
      const id = t.getAttribute('data-id');
      const val = String(t.value || '');
      db.people = db.people || {};
      db.people[id] = Object.assign({}, db.people[id] || {});
      if (val && /^\d{4}-\d{2}$/.test(val)) db.people[id].batchId = val;
      else delete db.people[id].batchId;
      save();
      render();
      return;
    }
    if (t.matches('[data-act="chat-rename"]')) {
      if (!isStaff()) return;
      const id = t.getAttribute('data-id') || '';
      if (!isMonthChat(id) && id.indexOf('c-') !== 0) return;
      ensureDiskusi();
      const name = String(t.value || '').trim().slice(0, 60);
      if (name) db.batchNames[id] = name;
      else delete db.batchNames[id];
      rememberDiskusiChat(id);
      save();
      render();
      return;
    }
    if (t.matches('[data-act="post-files"]')) {
      const files = Array.from(t.files || []);
      t.value = '';
      addPostImages(files);
      return;
    }
    if (t.matches('[data-act="post-attach"]')) {
      const files = Array.from(t.files || []);
      t.value = '';
      addPostFiles(files);
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
    if (t.matches('[data-act="daftar-tag-filter"]')) {
      ui.daftarTagFilter = t.value || '';
      ui.daftarBulk = '';
      render();
      return;
    }
    if (t.matches('[data-act="daftar-pay-filter"]')) {
      ui.daftarPayFilter = t.value || '';
      ui.daftarBulk = '';
      render();
      return;
    }
    if (t.matches('[data-act="daftar-joined-from"]')) {
      ui.daftarJoinedFrom = t.value || '';
      ui.daftarBulk = '';
      render();
      return;
    }
    if (t.matches('[data-act="daftar-joined-to"]')) {
      ui.daftarJoinedTo = t.value || '';
      ui.daftarBulk = '';
      render();
      return;
    }
    if (t.matches('[data-act="daftar-sel"]')) {
      if (!(ui.daftarSelected instanceof Set)) ui.daftarSelected = new Set();
      const id = t.getAttribute('data-id');
      if (!id) return;
      if (t.checked) ui.daftarSelected.add(id);
      else ui.daftarSelected.delete(id);
      if (!ui.daftarSelected.size) ui.daftarBulk = '';
      render();
      return;
    }
    if (t.matches('[data-act="daftar-sel-all"]')) {
      if (!(ui.daftarSelected instanceof Set)) ui.daftarSelected = new Set();
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const rows = daftarFilteredPeople(q);
      if (t.checked) rows.forEach((s) => ui.daftarSelected.add(s.id));
      else rows.forEach((s) => ui.daftarSelected.delete(s.id));
      if (!ui.daftarSelected.size) ui.daftarBulk = '';
      render();
      return;
    }
    if (t.matches('[data-act="dash-from"]')) {
      ui.dashFrom = t.value;
      ui.dashRange = 'custom';
      render();
      return;
    }
    if (t.matches('[data-act="dash-to"]')) {
      ui.dashTo = t.value;
      ui.dashRange = 'custom';
      render();
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
      if (t.value === 'lunas') {
        const needsGrant = b.plan !== 'mentoring' || !b.accessUntil || b.status === 'pending';
        if (needsGrant) {
          const term = b.pendingTerm || b.term || 'month';
          const amount = b.pendingAmount || b.amount || priceForTerm(term, false);
          grantMentoring(id, term, b.source === 'mayar' ? 'mayar' : 'transfer', amount);
        } else {
          b.status = 'lunas';
          b.updatedAt = isoNow();
        }
        closeTransferTasks(id);
      } else {
        b.status = t.value;
        b.updatedAt = isoNow();
        if (t.value === 'gratis') {
          b.plan = 'mentoring';
          b.products = MENTOR_SKUS().slice();
        }
        if (t.value === 'belum') {
          b.plan = '';
          b.products = [];
          delete b.pendingTerm;
          delete b.pendingAmount;
          delete b.pendingAt;
        }
        if (t.value === 'pending') {
          b.pendingTerm = b.pendingTerm || b.term || 'month';
          b.pendingAmount = b.pendingAmount || b.amount || 0;
          b.pendingAt = b.pendingAt || isoNow();
          if (b.plan === 'mentoring') b.plan = 'preview';
          if (b.source !== 'mayar') b.note = 'Menunggu konfirmasi Anton';
        }
      }
      save();
      toast('Ledger ' + nameOf(id) + ' → ' + t.value);
      render();
      return;
    }
    if (t.matches('[data-act="ent-mentor"]')) {
      const id = t.getAttribute('data-id');
      const b = billingOf(id);
      if (t.checked) {
        b.plan = 'mentoring';
        b.products = MENTOR_SKUS().slice();
        if (b.status === 'belum') b.status = 'lunas';
      } else {
        b.plan = b.products.length ? 'sku' : '';
        if (!b.products.length) b.status = 'belum';
      }
      save();
      toast((t.checked ? 'Mentoring on · ' : 'Mentoring off · ') + nameOf(id));
      render();
      return;
    }
    if (t.matches('[data-act="ent-sku"]')) {
      const id = t.getAttribute('data-id');
      const sku = t.getAttribute('data-sku');
      const b = billingOf(id);
      if (b.plan === 'mentoring' || b.status === 'gratis') {
        const p = productById(sku);
        if (bundled(p)) return;
      }
      const set = new Set(b.products);
      const adding = t.checked && !set.has(sku);
      if (t.checked) set.add(sku); else set.delete(sku);
      b.products = [...set];
      if (b.plan !== 'mentoring' && b.status !== 'gratis') {
        b.plan = b.products.length ? 'sku' : '';
        if (!b.products.length) b.status = 'belum';
        else if (b.status === 'belum') b.status = 'lunas';
      }
      if (adding && b.plan === 'sku') {
        const p = productById(sku);
        const price = p ? (Number(p.price) || 0) : 0;
        if (price > 0) {
          b.amount = (Number(b.amount) || 0) + price;
          b.paidAt = b.paidAt || isoNow();
          recordPayment({
            personId: id,
            kind: 'sku',
            amount: price,
            source: b.source || 'manual',
            products: [sku]
          });
        }
      }
      save();
      render();
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
      if (k === 'url' && t.value) {
        if (l.videoKey) deleteRemoteVideo(l.videoKey);
        l.videoBlob = false;
        l.videoKey = '';
      }
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
    if (t.matches('[data-act="doc-name"]') || t.matches('[data-act="doc-url"]') || t.matches('[data-act="res-name"]') || t.matches('[data-act="res-url"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (!l) return;
      l.resources = l.resources && l.resources.length ? l.resources : [{ name: '', url: '' }];
      const i = t.hasAttribute('data-i') ? +t.getAttribute('data-i') : 0;
      while (l.resources.length <= i) l.resources.push({ name: '', url: '' });
      if (t.matches('[data-act="doc-name"]') || t.matches('[data-act="res-name"]')) l.resources[i].name = t.value;
      else l.resources[i].url = t.value;
      save();
      return;
    }
    if (t.matches('[data-act="lec-body"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (l) { l.body = t.value; save(); }
      return;
    }
    if (t.matches('[data-act="cover-file"]')) {
      const file = t.files && t.files[0];
      if (file) ingestCoverFile(file, t.getAttribute('data-kind'), t.getAttribute('data-id'));
      return;
    }
    if (t.matches('[data-act="res-file"]')) {
      const file = t.files && t.files[0];
      if (file) ingestResourceFile(file, t.getAttribute('data-id'));
      return;
    }
    if (t.matches('[data-act="school-photo-file"]')) {
      if (!canBill()) return;
      const file = t.files && t.files[0];
      if (!file) return;
      if (file.size > MAX_IMG) { toast('Foto maks 5 MB.'); return; }
      ensureSchoolProfile();
      blobPut(schoolPhotoKey(), file).then(() => {
        db.schoolProfile.photoBlob = true;
        db.schoolProfile.photoMode = 'upload';
        save();
        toast('Foto profil diunggah.');
        render();
      });
      return;
    }
    if (t.matches('[data-act="profile-social-source"]')) {
      if (!canBill()) return;
      ensureSchoolProfile();
      db.schoolProfile.socialSource = (t.value === 'instagram' || t.value === 'youtube') ? t.value : 'tiktok';
      save();
      render();
      return;
    }
    if (t.matches('[data-act="headline-count"]')) {
      const el = $('headline-count');
      if (el) el.textContent = String(Math.max(0, 60 - String(t.value || '').length));
      return;
    }
    if (t.matches('[data-act="photo-file"]')) {
      const file = t.files && t.files[0];
      const id = t.getAttribute('data-id');
      if (!file || !id) return;
      if (file.size > MAX_IMG) { toast('Foto maks 5 MB.'); return; }
      const finishLocal = () => blobPut(photoKey(id), file).then(() => {
        patchPerson(id, { photoBlob: true, photoFailed: false });
        save();
        toast('Foto diunggah di browser ini.');
        render();
      });
      if (syncEnabled()) {
        toast('Mengunggah foto…');
        uploadClassVideo(file, photoKey(id), null, 'image').then((info) => {
          const prev = people().find((x) => x.id === id);
          if (prev && prev.photoKey && prev.photoKey !== info.key) deleteRemoteVideo(prev.photoKey);
          patchPerson(id, {
            photoUrl: mediaFileUrl(info.key),
            photoKey: info.key,
            photoBlob: false,
            photoFailed: false
          });
          save();
          toast('Foto tersimpan di kelas.');
          render();
        }).catch(() => toast('Gagal unggah foto.'));
        return;
      }
      finishLocal();
      return;
    }
    if (t.matches('[data-act="task-person"]')) {
      ui.taskPerson = t.value;
      render();
      return;
    }
    if (t.matches('[data-act="task-assignee-filter"]')) {
      ui.taskAssignee = t.value;
      render();
      return;
    }
    if (t.matches('[data-act="task-assign"]')) {
      const row = db.tasks.find((x) => x.id === t.getAttribute('data-id'));
      if (row) {
        row.assignee = assigneeIdOf({ assignee: t.value });
        save();
        toast('Ditugaskan ke ' + nameOf(row.assignee));
      }
      render();
      return;
    }
    if (t.matches('[data-act="person-field"]')) {
      const id = t.getAttribute('data-id');
      const k = t.getAttribute('data-k');
      let val = t.value;
      if (k === 'wa') val = String(val).replace(/\D/g, '');
      if (k === 'tiktok') val = tiktokHandle(val);
      if (k === 'email' || k === 'firstName' || k === 'lastName' || k === 'name') val = String(val).trim();
      const fields = {};
      fields[k] = val;
      if (k === 'firstName' || k === 'lastName') {
        const cur = people().find((x) => x.id === id) || {};
        const parts = personNameParts(Object.assign({}, cur, fields));
        fields.firstName = parts.firstName;
        fields.lastName = parts.lastName;
        fields.name = joinPersonName(parts.firstName, parts.lastName);
      } else if (k === 'name') {
        const parts = splitPersonName(val);
        fields.firstName = parts.firstName;
        fields.lastName = parts.lastName;
      }
      patchPerson(id, fields);
      save();
      if (k === 'wa' || k === 'email') render();
      if (k === 'tiktok') {
        refreshPersonPhoto(id, true).then((ok) => {
          toast(ok ? (syncEnabled() ? 'Foto TikTok tersimpan di kelas.' : 'Foto TikTok tersimpan.') : 'Foto gagal. Inisial + unggah.');
          render();
        });
      }
      return;
    }
    if (t.matches('[data-act="bill-amount"]')) {
      const b = billingOf(t.getAttribute('data-id'));
      b.amount = Math.max(0, +t.value || 0);
      b.updatedAt = new Date().toISOString();
      save();
      return;
    }
    if (t.matches('[data-act="sec-due"]')) {
      const w = db.weeks.find((x) => x.id === t.getAttribute('data-id'));
      if (w) { w.due = t.value; save(); }
      return;
    }
    if (t.matches('[data-act="kur-preview-person"]')) {
      ui.kurPreviewId = t.value;
      ui.kurPreviewLec = '';
      render();
      return;
    }
    if (t.matches('[data-act="enroll-plan"]')) {
      const id = t.getAttribute('data-id');
      const pid = t.getAttribute('data-pid');
      if (t.checked) enrollPerson(id, pid, true);
      else unenrollPerson(id, pid);
      save();
      runAutomations();
      render();
      return;
    }
    if (t.matches('[data-act="plan-trigger"]')) {
      const plan = planById(t.getAttribute('data-pid'));
      if (plan) { plan.trigger = t.value; save(); }
      return;
    }
    if (t.matches('[data-act="plan-kind"]')) {
      const plan = planById(t.getAttribute('data-pid'));
      const st = plan && plan.steps.find((x) => x.id === t.getAttribute('data-sid'));
      if (st) { st.kind = t.value; save(); render(); }
      return;
    }
    if (t.matches('[data-act="plan-to"]')) {
      const plan = planById(t.getAttribute('data-pid'));
      const st = plan && plan.steps.find((x) => x.id === t.getAttribute('data-sid'));
      if (st) { st.to = t.value; save(); }
      return;
    }
    if (t.matches('[data-act="pipa-stage-color"]')) {
      const st = pipelineStages().find((s) => s.id === t.getAttribute('data-id'));
      if (st) {
        st.color = normalizeStageColor(t.value, 0);
        save();
        render();
      }
      return;
    }
    if (t.matches('[data-act="pipa-stage-label"]')) {
      const st = pipelineStages().find((s) => s.id === t.getAttribute('data-id'));
      if (st) {
        const label = String(t.value || '').trim().slice(0, 40) || st.id;
        st.label = label;
        t.value = label;
        save();
      }
      return;
    }
    if (t.matches('[data-act="pipa-tr-when"]') || t.matches('[data-act="pipa-tr-to"]')) {
      const tr = pipelineTransitions().find((x) => x.id === t.getAttribute('data-id'));
      if (!tr) return;
      if (t.matches('[data-act="pipa-tr-when"]')) tr.when = t.value;
      else tr.to = t.value;
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

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-act="ob-field-type"]')) {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      const page = ob.pages.find((p) => p.id === t.getAttribute('data-page'));
      const field = page && page.fields.find((f) => f.id === t.getAttribute('data-field'));
      if (!field) return;
      field.type = t.value || 'text';
      db.onboarding = normalizeOnboarding(ob);
      syncOnboardingAccountFields();
      save();
      render();
      return;
    }
    if (t.matches('[data-act="ob-field-req"], [data-act="ob-field-other"]')) {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      const page = ob.pages.find((p) => p.id === t.getAttribute('data-page'));
      const field = page && page.fields.find((f) => f.id === t.getAttribute('data-field'));
      if (!field) return;
      if (t.getAttribute('data-act') === 'ob-field-req') field.required = !!t.checked;
      else field.allowOther = !!t.checked;
      db.onboarding = normalizeOnboarding(ob);
      syncOnboardingAccountFields();
      save();
      render();
      return;
    }
    if (t.matches('[data-act="daftar-col-toggle"]')) {
      const id = t.getAttribute('data-id');
      if (!id || id === 'name') return;
      const cols = daftarCols();
      const i = cols.indexOf(id);
      if (t.checked) {
        if (i < 0) cols.push(id);
      } else if (i >= 0) {
        cols.splice(i, 1);
      }
      db.daftarCols = cols[0] === 'name' ? cols : ['name'].concat(cols.filter((x) => x !== 'name'));
      save();
      render();
      return;
    }
    if (t.matches('[data-act="lec-field"][data-k="url"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (!l) return;
      l.url = t.value;
      if (t.value) {
        if (l.videoKey) deleteRemoteVideo(l.videoKey);
        l.videoBlob = false;
        l.videoKey = '';
      }
      save();
      render();
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('.dk-compose textarea[name="body"]')) {
      ui.postBody = t.value;
      return;
    }
    if (t.matches('.dk-comment-form input[name="body"]')) {
      const form = t.closest('form');
      const id = form && form.getAttribute('data-id');
      if (id) {
        ui.commentDrafts = ui.commentDrafts || {};
        ui.commentDrafts[id] = t.value;
      }
      return;
    }
    if (t.matches('[data-act="poll-q"]')) {
      ui.pollQuestion = t.value;
      return;
    }
    if (t.matches('[data-act="poll-opt"]')) {
      const i = Number(t.getAttribute('data-i'));
      ui.pollOptions = (ui.pollOptions || ['', '']).slice();
      if (isFinite(i) && i >= 0) ui.pollOptions[i] = t.value;
      return;
    }
    if (t.matches('[data-act="chat-people-q"]')) {
      ui.chatPeopleQ = t.value;
      ui.chatPeopleFocus = true;
      render();
      return;
    }
    if (t.matches('.wa-compose textarea[name="body"]')) {
      ui.waDraft = t.value;
      const open = t.closest('form') && t.closest('form').querySelector('[data-wa-open]');
      const person = people().find((s) => s.id === (t.closest('form') && t.closest('form').getAttribute('data-id')));
      if (open && person) open.href = waLink(person.wa, t.value || ('Halo ' + person.name + ', dari MasterMind with Anton GC.'));
      return;
    }
    if (t.matches('[data-act="cari-siswa"]')) {
      ui.cariSiswa = t.value;
      ui.cariOpen = true;
      paintCariDrop();
      return;
    }
    if (t.matches('[data-act="tag-query"]')) {
      ui.tagQuery = t.value;
      paintTagPickerList();
      return;
    }
    if (t.matches('[data-act="daftar-custom-val"]')) {
      const sid = t.getAttribute('data-id');
      const col = t.getAttribute('data-col');
      if (col && !daftarColDef(col)) {
        db.daftarCustom = daftarCustomList().concat([{
          id: col,
          label: String(col).replace(/^f-/, '').replace(/[-_]/g, ' ').slice(0, 40) || col
        }]);
      }
      setPersonCustomVal(sid, col, t.value);
      save();
      return;
    }
    if (t.matches('[data-act="filter-siswa"]') || t.matches('[data-act="filter-crm"]')) {
      ui.filterSiswa = t.value;
      ui.crmFilter = t.value;
      render();
      const el = document.querySelector('[data-act="filter-siswa"], [data-act="filter-crm"]');
      if (el) {
        el.focus();
        const n = el.value.length;
        el.setSelectionRange(n, n);
      }
      return;
    }
    if (t.matches('[data-act="plan-wait"]') || t.matches('[data-act="plan-title"]') || t.matches('[data-act="plan-body"]') || t.matches('[data-act="plan-subject"]') || t.matches('[data-act="plan-name"]')) {
      const plan = planById(t.getAttribute('data-pid'));
      if (!plan) return;
      if (t.matches('[data-act="plan-name"]')) { plan.name = t.value; save(); return; }
      const st = plan.steps.find((x) => x.id === t.getAttribute('data-sid'));
      if (!st) return;
      if (t.matches('[data-act="plan-wait"]')) st.waitHours = +t.value || 0;
      else if (t.matches('[data-act="plan-title"]')) st.title = t.value;
      else if (t.matches('[data-act="plan-subject"]')) st.subject = t.value;
      else st.body = t.value;
      save();
      return;
    }
    if (t.matches('[data-act="lec-body"]')) {
      const l = lectureById(t.getAttribute('data-id'));
      if (l) { l.body = t.value; save(); }
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

  document.addEventListener('focusin', (e) => {
    if (e.target.matches('[data-act="cari-siswa"]')) {
      ui.cariOpen = true;
      paintCariDrop();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.lightbox) {
      ui.lightbox = '';
      render();
      return;
    }
    if (e.key === 'Escape' && ui.chatPeopleOpen) {
      ui.chatPeopleOpen = false;
      ui.chatPeopleQ = '';
      render();
      return;
    }
    if (e.key === 'Escape' && ui.replyTo) {
      ui.replyTo = null;
      render();
      return;
    }
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-act="chat-rename"]')) {
      e.preventDefault();
      e.target.blur();
      return;
    }
    if (e.key === 'Enter' && e.target.closest && e.target.closest('.dk-compose')) {
      if (e.target.matches('textarea[name="body"]')) {
        if (e.shiftKey) return;
        e.preventDefault();
        const form = e.target.closest('form');
        if (form && form.requestSubmit) form.requestSubmit();
      } else if (e.target.matches('input')) {
        e.preventDefault();
      }
      return;
    }
    if (e.key !== 'Enter') return;
    if (e.target.matches('[data-act="social-input"]')) {
      e.preventDefault();
      const btn = e.target.parentElement && e.target.parentElement.querySelector('[data-act="add-social"]');
      if (btn) btn.click();
      return;
    }
    if (e.target.matches('[data-act="shop-input"]')) {
      e.preventDefault();
      const btn = e.target.parentElement && e.target.parentElement.querySelector('[data-act="add-shop"]');
      if (btn) btn.click();
      return;
    }
    if (!e.target.matches('[data-act="tag-query"]')) return;
    e.preventDefault();
    const id = e.target.getAttribute('data-id') || ui.tagPickerId;
    const q = normalizeTag(e.target.value || ui.tagQuery);
    if (!id || !q) return;
    if (addPersonTag(id, q)) {
      ui.tagQuery = '';
      render();
      requestAnimationFrame(() => {
        const inp = document.querySelector('[data-act="tag-query"]');
        if (inp) inp.focus();
      });
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#topbar-search')) {
      if (ui.cariOpen) {
        ui.cariOpen = false;
        paintCariDrop();
      }
    }
    if (ui.tagPickerId && !e.target.closest('#fub-tags')) {
      ui.tagPickerId = null;
      ui.tagQuery = '';
      render();
    }
    if (ui.daftarColsOpen && !e.target.closest('#daftar-cols-wrap')) {
      ui.daftarColsOpen = false;
      const wrap = document.getElementById('daftar-cols-wrap');
      if (wrap) {
        wrap.classList.remove('is-open');
        const dd = document.getElementById('daftar-cols-dd');
        if (dd) dd.remove();
        const btn = wrap.querySelector('[data-act="daftar-cols-toggle"]');
        if (btn) {
          btn.classList.remove('is-on');
          btn.setAttribute('aria-expanded', 'false');
        }
      } else {
        render();
      }
    }
    if (ui.pipaSettingsOpen && !e.target.closest('#pipa-settings-wrap')) {
      ui.pipaSettingsOpen = false;
      ui.pipaDeleteId = null;
      render();
    }
  }, true);

  const SISWA_RO_BLOCK = new Set([
    'post-new', 'post-comment', 'post-files', 'post-attach', 'post-img-remove',
    'poll-toggle', 'poll-cancel', 'poll-add-opt', 'poll-opt-remove', 'poll-vote',
    'comment-reply', 'comment-reply-clear', 'comment-like', 'post-like', 'post-pin', 'post-del',
    'wiz-next', 'wiz-shop', 'wiz-heard', 'wiz-tools', 'ob-single', 'ob-multi', 'apply',
    'mark-done', 'toggle-done', 'exam', 'exam-submit',
    'pay-term', 'pay-buy', 'pay-prompt', 'pay-lynk', 'pay-manual', 'pay-now', 'pay-later',
    'ask', 'reply', 'report-issue', 'chat-member-add', 'chat-member-remove', 'chat-new',
    'has-shop', 'heard-from'
  ]);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (isSiswaReadonly() && SISWA_RO_BLOCK.has(act)) {
      e.preventDefault();
      toast('Siswa view · hanya lihat.');
      return;
    }
    if (act === 'vid-drop' || act === 'vid-file' || act === 'add-lec' || act === 'sec-title' ||
        act === 'lec-field' || act === 'lec-points' || act === 'q-field' || act === 'doc-name' || act === 'doc-url' ||
        act === 'cover-file' || act === 'res-file' || act === 'photo-file' || act === 'lec-body' || act === 'res-name' || act === 'res-url' ||
        act === 'person-field' || act === 'bill-amount' || act === 'sec-due' || act === 'kur-preview-person' ||
        act === 'has-shop' || act === 'heard-from' || act === 'apply' || act === 'cari-siswa' ||
        act === 'daftar-custom-val' || act === 'tag-query' || act === 'crm-stage' || act === 'assign-mentor' ||
        act === 'social-input' || act === 'shop-input' || act === 'daftar-sel' || act === 'daftar-sel-all' ||
        act === 'daftar-tag-filter' || act === 'daftar-pay-filter' ||
        act === 'daftar-joined-from' || act === 'daftar-joined-to' ||
        act === 'post-files' || act === 'post-attach' || act === 'person-batch' ||
        act === 'post-new' || act === 'post-comment' || act === 'batch-rename' ||
        act === 'school-photo-file' || act === 'profile-social-source' || act === 'headline-count' ||
        act === 'chat-rename' || act === 'chat-people-q' || act === 'poll-q' || act === 'poll-opt') {
      return;
    }
    if (act === 'diskusi-sub') {
      ui.diskusiSub = btn.getAttribute('data-id') === 'tanya' ? 'tanya' : 'batch';
      ui.diskusiShowList = false;
      ui.diskusiOpened = true;
      ui.chatPeopleOpen = false;
      render();
      return;
    }
    if (act === 'diskusi-back') {
      ui.diskusiShowList = true;
      ui.chatPeopleOpen = false;
      render();
      return;
    }
    if (act === 'diskusi-batch') {
      const id = btn.getAttribute('data-id') || '';
      ui.diskusiBatch = id;
      ui.diskusiSub = 'batch';
      ui.diskusiShowList = false;
      ui.diskusiOpened = true;
      ui.chatPeopleOpen = false;
      ui.replyTo = null;
      ui.diskusiScroll = unreadCount(id) ? 'unread' : 'bottom';
      render();
      return;
    }
    if (act === 'unread-next') {
      const changed = acknowledgeUnread();
      const jump = nextUnreadJump();
      if (!jump) {
        if (changed) render();
        else paintUnreadChrome();
        return;
      }
      ui.replyTo = null;
      if (jump.chatId !== activeDiskusiBatch() || ui.diskusiSub === 'tanya') {
        ui.diskusiBatch = jump.chatId;
        ui.diskusiSub = 'batch';
        ui.diskusiShowList = false;
        ui.diskusiOpened = true;
        ui.chatPeopleOpen = false;
      }
      ui.unreadJump = jump.item.elId;
      ui.diskusiScroll = 'jump';
      render();
      return;
    }
    if (act === 'chat-new') {
      createChat();
      return;
    }
    if (act === 'chat-people') {
      ui.chatPeopleOpen = true;
      render();
      return;
    }
    if (act === 'chat-people-close') {
      ui.chatPeopleOpen = false;
      ui.chatPeopleQ = '';
      render();
      return;
    }
    if (act === 'chat-member-add' || act === 'chat-member-remove') {
      if (!isStaff()) return;
      const chatId = btn.getAttribute('data-chat') || '';
      const sid = btn.getAttribute('data-id') || '';
      if (act === 'chat-member-add') addChatMember(chatId, sid);
      else removeChatMember(chatId, sid);
      rememberDiskusiChat(chatId);
      save();
      render();
      return;
    }
    if (act === 'poll-toggle') {
      readPollDraft();
      ui.pollOn = !ui.pollOn;
      if (ui.pollOn && (!ui.pollOptions || ui.pollOptions.length < 2)) ui.pollOptions = ['', ''];
      render();
      return;
    }
    if (act === 'poll-cancel') {
      ui.pollOn = false;
      ui.pollQuestion = '';
      ui.pollOptions = ['', ''];
      render();
      return;
    }
    if (act === 'poll-add-opt') {
      readPollDraft();
      ui.pollOptions = ui.pollOptions && ui.pollOptions.length ? ui.pollOptions.slice() : ['', ''];
      if (ui.pollOptions.length >= 6) return;
      ui.pollOptions.push('');
      ui.pollFocus = '[data-act="poll-opt"][data-i="' + (ui.pollOptions.length - 1) + '"]';
      render();
      return;
    }
    if (act === 'poll-opt-remove') {
      readPollDraft();
      const i = Number(btn.getAttribute('data-i'));
      if (!ui.pollOptions || ui.pollOptions.length <= 2 || !isFinite(i)) return;
      ui.pollOptions = ui.pollOptions.slice();
      ui.pollOptions.splice(i, 1);
      render();
      return;
    }
    if (act === 'poll-vote') {
      ensureDiskusi();
      const post = db.posts.find((p) => p && p.id === btn.getAttribute('data-post'));
      const optId = btn.getAttribute('data-id') || '';
      if (!post || !post.poll || !optId || !canPostIn(actorId(), post.batchId)) return;
      if (!post.poll.options.some((o) => o && o.id === optId)) return;
      post.poll.votes = post.poll.votes || {};
      if (post.poll.votes[actorId()] === optId) delete post.poll.votes[actorId()];
      else post.poll.votes[actorId()] = optId;
      rememberDiskusiPost(post);
      save();
      render();
      return;
    }
    if (act === 'post-img-remove') {
      capturePostBody();
      const id = btn.getAttribute('data-id');
      const img = (ui.postImages || []).find((x) => x.id === id);
      if (img && img.preview) URL.revokeObjectURL(img.preview);
      ui.postImages = (ui.postImages || []).filter((x) => x.id !== id);
      render();
      return;
    }
    if (act === 'post-file-remove') {
      capturePostBody();
      const id = btn.getAttribute('data-id');
      ui.postFiles = (ui.postFiles || []).filter((x) => x.id !== id);
      render();
      return;
    }
    if (act === 'post-img') {
      const img = btn.querySelector('img');
      const src = img && (img.currentSrc || img.src);
      if (!src || src === location.href) return;
      ui.lightbox = src;
      render();
      return;
    }
    if (act === 'lightbox-close') {
      ui.lightbox = '';
      render();
      return;
    }
    if (act === 'post-pin') {
      if (!isStaff()) return;
      ensureDiskusi();
      const post = db.posts.find((p) => p && p.id === btn.getAttribute('data-id'));
      if (!post) return;
      post.pinned = !post.pinned;
      rememberDiskusiPost(post);
      save();
      render();
      return;
    }
    if (act === 'post-del') {
      ensureDiskusi();
      const post = db.posts.find((p) => p && p.id === btn.getAttribute('data-id'));
      if (!post) return;
      if (!isStaff() && post.authorId !== actorId()) return;
      if (!confirm('Hapus catatan ini?')) return;
      dropPostMedia(post);
      pendingDiskusi.posts.delete(post.id);
      db.posts = db.posts.filter((p) => p && p.id !== post.id);
      db.comments = db.comments.filter((c) => c && c.postId !== post.id);
      save();
      render();
      return;
    }
    if (act === 'comment-del') {
      ensureDiskusi();
      const row = db.comments.find((c) => c && c.id === btn.getAttribute('data-id'));
      if (!row) return;
      if (!isStaff() && row.authorId !== actorId()) return;
      pendingDiskusi.comments.delete(row.id);
      db.comments = db.comments.filter((c) => c && c.id !== row.id);
      if (ui.replyTo && ui.replyTo.commentId === row.id) ui.replyTo = null;
      save();
      render();
      return;
    }
    if (act === 'comment-like') {
      ensureDiskusi();
      const row = db.comments.find((c) => c && c.id === btn.getAttribute('data-id'));
      const post = row && db.posts.find((p) => p && p.id === row.postId);
      if (!row || !post || !canPostIn(actorId(), post.batchId)) return;
      const mine = actorId();
      const likes = commentLikes(row).filter((id) => id !== mine);
      if (commentLikes(row).indexOf(mine) === -1) likes.push(mine);
      row.likes = likes;
      rememberDiskusiComment(row);
      save();
      render();
      return;
    }
    if (act === 'comment-reply') {
      ensureDiskusi();
      const commentId = btn.getAttribute('data-id') || '';
      const postId = btn.getAttribute('data-post') || '';
      const row = db.comments.find((c) => c && c.id === commentId && c.postId === postId);
      const post = row && db.posts.find((p) => p && p.id === postId);
      if (!row || !post || !canPostIn(actorId(), post.batchId)) return;
      ui.replyTo = { postId: postId, commentId: commentId };
      const prefix = '@' + nameOf(row.authorId) + ' ';
      ui.commentDrafts = ui.commentDrafts || {};
      const cur = ui.commentDrafts[postId] || '';
      if (cur.indexOf('@') !== 0) ui.commentDrafts[postId] = prefix + cur;
      ui.commentFocus = postId;
      render();
      return;
    }
    if (act === 'comment-reply-clear') {
      ui.replyTo = null;
      render();
      return;
    }
    if (act === 'comment-jump') {
      const el = document.getElementById('dkc-' + (btn.getAttribute('data-id') || ''));
      if (!el) return;
      scrollFeedTo(el);
      el.classList.add('is-flash');
      setTimeout(() => el.classList.remove('is-flash'), 1200);
      return;
    }
    if (act === 'pick-social') {
      ui.socialPick = btn.getAttribute('data-id') || null;
      render();
      return;
    }
    if (act === 'pick-shop') {
      ui.shopPick = btn.getAttribute('data-id') || null;
      render();
      return;
    }
    if (act === 'add-social') {
      const id = btn.getAttribute('data-id');
      const plat = ui.socialPick;
      const inp = btn.parentElement && btn.parentElement.querySelector('[data-act="social-input"]');
      const parsed = parseSocialLink(plat, inp && inp.value);
      if (!parsed) {
        toast('Isi @nama atau tautan yang cocok dengan ' + platLabel(SOCIAL_PLATFORMS, plat) + '.');
        return;
      }
      const s = people().find((x) => x.id === id) || {};
      const links = personSocialLinks(s).filter((x) => x.platform !== plat);
      links.push(Object.assign({ id: linkId() }, parsed));
      saveSocialLinks(id, links);
      ui.socialPick = null;
      save();
      toast(platLabel(SOCIAL_PLATFORMS, plat) + ' ditambah.');
      if (plat === 'tiktok') {
        refreshPersonPhoto(id, true).then((ok) => {
          if (ok) toast(syncEnabled() ? 'Foto TikTok tersimpan di kelas.' : 'Foto TikTok tersimpan.');
          render();
        });
      } else {
        render();
      }
      return;
    }
    if (act === 'add-shop') {
      const id = btn.getAttribute('data-id');
      const plat = ui.shopPick;
      const inp = btn.parentElement && btn.parentElement.querySelector('[data-act="shop-input"]');
      const parsed = parseShopLink(plat, inp && inp.value);
      if (!parsed) {
        toast('Isi tautan toko yang cocok dengan ' + platLabel(SHOP_PLATFORMS, plat) + '.');
        return;
      }
      const s = people().find((x) => x.id === id) || {};
      const links = personShopLinks(s, db.applications[id]);
      links.push(Object.assign({ id: linkId() }, parsed));
      saveShopLinks(id, links);
      ui.shopPick = null;
      save();
      toast(platLabel(SHOP_PLATFORMS, plat) + ' ditambah.');
      render();
      return;
    }
    if (act === 'del-social') {
      const id = btn.getAttribute('data-id');
      const lid = btn.getAttribute('data-lid');
      const plat = btn.getAttribute('data-plat');
      const s = people().find((x) => x.id === id) || {};
      const links = personSocialLinks(s).filter((x) => (lid ? x.id !== lid : x.platform !== plat));
      saveSocialLinks(id, links);
      save();
      toast('Tautan sosial dihapus.');
      render();
      return;
    }
    if (act === 'del-shop') {
      const id = btn.getAttribute('data-id');
      const lid = btn.getAttribute('data-lid');
      const plat = btn.getAttribute('data-plat');
      const s = people().find((x) => x.id === id) || {};
      let links = personShopLinks(s, db.applications[id]);
      if (lid) links = links.filter((x) => x.id !== lid);
      else links = links.filter((x) => x.platform !== plat);
      saveShopLinks(id, links);
      save();
      toast('Tautan toko dihapus.');
      render();
      return;
    }
    if (act === 'tag-toggle') {
      const id = btn.getAttribute('data-id');
      if (ui.tagPickerId === id) {
        ui.tagPickerId = null;
        ui.tagQuery = '';
      } else {
        ui.tagPickerId = id;
        ui.tagQuery = '';
      }
      render();
      if (ui.tagPickerId) {
        requestAnimationFrame(() => {
          const inp = document.querySelector('[data-act="tag-query"]');
          if (inp) inp.focus();
        });
      }
      return;
    }
    if (act === 'tag-add') {
      const id = btn.getAttribute('data-id');
      const tag = btn.getAttribute('data-tag');
      if (addPersonTag(id, tag)) {
        ui.tagQuery = '';
        render();
        requestAnimationFrame(() => {
          const inp = document.querySelector('[data-act="tag-query"]');
          if (inp) inp.focus();
        });
      }
      return;
    }
    if (act === 'tag-remove') {
      removePersonTag(btn.getAttribute('data-id'), btn.getAttribute('data-tag'));
      render();
      return;
    }
    if (act === 'wiz-next') {
      if (btn.matches('form')) return;
      advanceWiz();
    } else if (act === 'copy-url') {
      const url = btn.getAttribute('data-url') || '';
      if (!url) return;
      const done = () => toast('Tautan disalin');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => {
          window.prompt('Salin tautan:', url);
        });
      } else {
        window.prompt('Salin tautan:', url);
      }
    } else if (act === 'wiz-back') {
      backWiz();
    } else if (act === 'wiz-shop') {
      captureWizFields();
      wizMerge({ shopPick: btn.getAttribute('data-id') });
      if (isOnboardPreview()) paintOnboardPreview();
      else render();
    } else if (act === 'ob-single' || act === 'wiz-heard') {
      captureWizFields();
      const key = btn.getAttribute('data-key') || 'heard';
      const id = btn.getAttribute('data-id') || '';
      const picks = Object.assign({}, wizDraft().picks || {});
      picks[key] = id;
      wizMerge({ picks: picks });
      if (isOnboardPreview()) paintOnboardPreview();
      else render();
    } else if (act === 'ob-multi') {
      captureWizFields();
      const key = btn.getAttribute('data-key') || '';
      const id = btn.getAttribute('data-id') || '';
      if (!key || !id) return;
      const picks = Object.assign({}, wizDraft().picks || {});
      const cur = Array.isArray(picks[key]) ? picks[key].slice() : [];
      const ix = cur.indexOf(id);
      if (ix >= 0) cur.splice(ix, 1);
      else cur.push(id);
      picks[key] = cur;
      wizMerge({ picks: picks });
      if (isOnboardPreview()) paintOnboardPreview();
      else render();
    } else if (act === 'wiz-tools') {
      ui.wizTools = !ui.wizTools;
      render();
    } else if (act === 'ob-preview') {
      if (!canBill()) return;
      captureOnboardingEditor();
      save();
      ui.onboardPreview = { open: true, step: 0, draft: {}, done: false };
      paintOnboardPreview();
    } else if (act === 'ob-preview-close') {
      ui.onboardPreview = null;
      paintOnboardPreview();
    } else if (act === 'ob-preview-restart') {
      ui.onboardPreview = { open: true, step: 0, draft: {}, done: false };
      paintOnboardPreview();
    } else if (act === 'ob-save') {
      if (!canBill()) return;
      captureOnboardingEditor();
      syncOnboardingAccountFields();
      save();
      toast('Onboarding disimpan. Field akun siswa ikut diperbarui.');
      render();
    } else if (act === 'ob-reset') {
      if (!canBill()) return;
      if (!window.confirm('Kembalikan halaman onboarding ke default?')) return;
      db.onboarding = defaultOnboarding();
      syncOnboardingAccountFields();
      save();
      toast('Onboarding di-reset.');
      render();
    } else if (act === 'ob-page-add') {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      ob.pages.push(normalizeObPage({
        kicker: 'Baru',
        q: 'Pertanyaan baru?',
        sub: '',
        fields: [{ type: 'text', required: true, label: 'Jawaban' }]
      }));
      db.onboarding = normalizeOnboarding(ob);
      syncOnboardingAccountFields();
      save();
      render();
    } else if (act === 'ob-page-del') {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      if (ob.pages.length <= 1) {
        toast('Minimal satu halaman.');
        return;
      }
      const id = btn.getAttribute('data-page');
      ob.pages = ob.pages.filter((p) => p.id !== id);
      db.onboarding = normalizeOnboarding(ob);
      save();
      render();
    } else if (act === 'ob-page-up' || act === 'ob-page-down') {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      const id = btn.getAttribute('data-page');
      const i = ob.pages.findIndex((p) => p.id === id);
      if (i < 0) return;
      const j = act === 'ob-page-up' ? i - 1 : i + 1;
      if (j < 0 || j >= ob.pages.length) return;
      const tmp = ob.pages[i];
      ob.pages[i] = ob.pages[j];
      ob.pages[j] = tmp;
      db.onboarding = normalizeOnboarding(ob);
      save();
      render();
    } else if (act === 'ob-field-add') {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      const pageId = btn.getAttribute('data-page');
      const page = ob.pages.find((p) => p.id === pageId);
      if (!page) return;
      const sel = document.querySelector('[data-ob-new-type][data-page="' + pageId + '"]');
      const type = (sel && sel.value) || 'text';
      page.fields.push(normalizeObField({
        type: type,
        required: true,
        label: type === 'text' || type === 'textarea' || type === 'link' || type === 'single' || type === 'multi'
          ? 'Pertanyaan'
          : '',
        options: (type === 'single' || type === 'multi') ? ['Opsi 1', 'Opsi 2'] : undefined,
        allowOther: type === 'single'
      }));
      db.onboarding = normalizeOnboarding(ob);
      syncOnboardingAccountFields();
      save();
      render();
    } else if (act === 'ob-field-del') {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      const page = ob.pages.find((p) => p.id === btn.getAttribute('data-page'));
      if (!page || (page.fields || []).length <= 1) {
        toast('Minimal satu pertanyaan per halaman.');
        return;
      }
      const fid = btn.getAttribute('data-field');
      page.fields = page.fields.filter((f) => f.id !== fid);
      db.onboarding = normalizeOnboarding(ob);
      save();
      render();
    } else if (act === 'ob-field-up' || act === 'ob-field-down') {
      if (!canBill()) return;
      captureOnboardingEditor();
      const ob = ensureOnboarding();
      const page = ob.pages.find((p) => p.id === btn.getAttribute('data-page'));
      if (!page) return;
      const fid = btn.getAttribute('data-field');
      const i = page.fields.findIndex((f) => f.id === fid);
      if (i < 0) return;
      const j = act === 'ob-field-up' ? i - 1 : i + 1;
      if (j < 0 || j >= page.fields.length) return;
      const tmp = page.fields[i];
      page.fields[i] = page.fields[j];
      page.fields[j] = tmp;
      db.onboarding = normalizeOnboarding(ob);
      save();
      render();
    } else if (act === 'issue-done') {
      if (!ui.admin) return;
      const id = btn.getAttribute('data-id');
      fetch(apiBase() + '/issues/resolve' + (adminKey() ? ('?key=' + encodeURIComponent(adminKey())) : ''), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id })
      }).then(() => refreshAdmin()).catch(() => toast('Gagal menutup laporan'));
    } else if (act === 'tab') {
      const id = btn.getAttribute('data-id');
      ui.profilePreview = null;
      if (ui.onboardPreview) ui.onboardPreview = null;
      if (isStaff()) {
        ui.mentorTab = id;
        if (id !== 'orang') ui.personId = null;
        if (id === 'kurikulum') ui.kurEdit = false;
        if (id === 'pustaka') ui.pustakaAddOpen = false;
        if (id === 'harga') refreshMayarStatus().then(() => { if (ui.mentorTab === 'harga') render(); });
        if (id === 'admin') {
          ui.adminSummary = null;
          render();
          refreshAdmin();
          return;
        }
      } else {
        ui.tab = id;
        if (id === 'alat') { ui.skuId = null; ui.skuPreview = false; }
        if (id === 'belajar' && canPreview(ui.personaId) && !canMentoring(ui.personaId)) {
          ui.lectureId = firstLectureId();
        }
      }
      render();
    } else if (act === 'kur-edit-on') {
      ui.kurEdit = true;
      ui.mentorTab = 'kurikulum';
      render();
    } else if (act === 'kur-edit-off') {
      ui.kurEdit = false;
      ui.editLecId = null;
      render();
    } else if (act === 'kur-edit-lec') {
      const id = btn.getAttribute('data-id');
      const lec = lectureById(id);
      ui.kurEdit = true;
      ui.editLecId = id;
      if (lec) setSecOpen(lec.weekId, true);
      ui.mentorTab = 'kurikulum';
      render();
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-lec-drop="' + id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (act === 'open-profil') {
      setBrandMenu(false);
      ui.profilePreview = null;
      ui.profilePane = 'info';
      if (canBill()) {
        ui.mentorTab = 'profil';
        ui.personId = null;
      } else if (isStaff()) {
        toast('Hanya Anton yang mengubah Profile. Buka sebagai Siswa untuk lihat halaman publik.');
        return;
      } else {
        if (needsWizard(ui.personaId)) {
          toast('Selesaikan form dulu.');
          return;
        }
        ui.tab = 'profil';
      }
      render();
    } else if (act === 'open-account') {
      setBrandMenu(false);
      ui.profilePreview = null;
      if (!canBill()) {
        toast('Account settings hanya untuk Anton.');
        return;
      }
      ui.mentorTab = 'account';
      ui.accountPane = 'security';
      ui.personId = null;
      render();
    } else if (act === 'open-siswa-view') {
      setBrandMenu(false);
      if (!canBill()) {
        toast('Siswa view hanya untuk Anton.');
        return;
      }
      ui.profilePreview = ui.profilePreview === 'desktop' ? 'desktop' : 'phone';
      paintProfilePreview();
    } else if (act === 'profile-pane') {
      if (!canBill()) return;
      ui.profilePane = btn.getAttribute('data-id') === 'photo' ? 'photo' : 'info';
      ui.mentorTab = 'profil';
      render();
    } else if (act === 'account-pane') {
      if (!canBill()) return;
      const pane = btn.getAttribute('data-id');
      ui.accountPane = pane === 'notifications'
        ? 'notifications'
        : (pane === 'onboarding' ? 'onboarding' : 'security');
      ui.mentorTab = 'account';
      render();
    } else if (act === 'bio-wrap') {
      const ta = $('profile-biography');
      if (!ta) return;
      const wrap = btn.getAttribute('data-wrap') || '**';
      const start = ta.selectionStart || 0;
      const end = ta.selectionEnd || 0;
      const val = ta.value || '';
      const selected = val.slice(start, end) || 'text';
      const next = val.slice(0, start) + wrap + selected + wrap + val.slice(end);
      ta.value = next;
      ta.focus();
      const caret = start + wrap.length + selected.length + wrap.length;
      ta.setSelectionRange(caret, caret);
    } else if (act === 'profile-preview') {
      if (!canBill()) return;
      ui.profilePreview = btn.getAttribute('data-mode') === 'desktop' ? 'desktop' : 'phone';
      paintProfilePreview();
    } else if (act === 'profile-preview-close') {
      ui.profilePreview = null;
      paintProfilePreview();
    } else if (act === 'profile-sync-photo') {
      if (!canBill()) return;
      ensureSchoolProfile();
      db.schoolProfile.photoMode = 'social';
      save();
      refreshSchoolPhotoFromSocial(true).then((ok) => {
        toast(ok ? 'Photo synced from social.' : 'Could not fetch photo. Check the handle on Profile.');
        render();
      });
    } else if (act === 'person-mid') {
      const tab = btn.getAttribute('data-id');
      ui.personMidTab = tab === 'contrib' || tab === 'pay' ? tab : 'timeline';
      render();
    } else if (act === 'compose-mode') {
      ui.composeMode = btn.getAttribute('data-id') || 'note';
      ui.taskComposer = ui.composeMode === 'task' ? (ui.personId || '') : '';
      const person = people().find((s) => s.id === ui.personId);
      const greet = displayNameOf(person) || (person && person.name) || '';
      if (ui.composeMode === 'wa' && person && person.wa) {
        openApp(waLink(person.wa, ui.waDraft || ('Halo ' + greet + ', dari MasterMind with Anton GC.')));
        markWaRead(ui.personId);
        pullWaThread(ui.personId, { silentTimeline: true, noPaint: true });
      }
      if (ui.composeMode === 'email' && person && person.email) {
        openApp(mailLink(person.email, 'MasterMind with Anton GC', 'Halo ' + greet));
      }
      render();
      if (ui.composeMode === 'wa') requestAnimationFrame(scrollWaThread);
    } else if (act === 'open-sku') {
      const id = btn.getAttribute('data-id');
      if (!canSku(ui.personaId, id) && !isStaff()) return;
      ui.skuId = id;
      ui.skuPreview = false;
      ui.skuFrom = btn.getAttribute('data-from') || 'alat';
      ui.tab = 'sku';
      render();
    } else if (act === 'contoh-sku') {
      ui.skuId = btn.getAttribute('data-id');
      ui.skuPreview = true;
      ui.skuFrom = btn.getAttribute('data-from') || 'alat';
      ui.tab = 'sku';
      render();
    } else if (act === 'calc-contoh') {
      const c = document.getElementById('calc-tool');
      if (c && c.__calc) c.__calc.contoh();
    } else if (act === 'calc-kosong') {
      const c = document.getElementById('calc-tool');
      if (c && c.__calc) c.__calc.kosong();
    } else if (act === 'calc-pdf') {
      const c = document.getElementById('calc-tool');
      if (c && c.__calc) c.__calc.pdf();
    } else if (act === 'calc-tab') {
      const c = document.getElementById('calc-tool');
      if (c && c.__calc) c.__calc.tab(btn.getAttribute('data-pane') || 'set');
    } else if (act === 'tool-reveal') {
      const id = btn.getAttribute('data-target');
      const el = id ? document.getElementById(id) : null;
      if (el) {
        el.hidden = false;
        btn.hidden = true;
      }
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
    } else if (act === 'lec-more') {
      const box = btn.closest('.lec-read');
      if (!box) return;
      const open = box.classList.toggle('is-open');
      btn.innerHTML = open
        ? 'Tutup <span aria-hidden="true">▴</span>'
        : 'Baca selengkapnya <span aria-hidden="true">▾</span>';
    } else if (act === 'lihat-kur') {
      ui.tab = 'belajar';
      ui.kurOpen = true;
      ui.lectureId = db.lastLecture[ui.personaId] || firstLectureId();
      render();
    } else if (act === 'scroll-kur') {
      ui.tab = 'belajar';
      if (canPreview(ui.personaId) && !canMentoring(ui.personaId)) {
        ui.lectureId = firstLectureId();
      }
      render();
      requestAnimationFrame(() => {
        const el = document.getElementById('kurikulum-trial');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (act === 'open-kolab') {
      if (!canMentoring(ui.personaId) && !isStaff()) {
        toast('Live class hanya mentoring.');
        ui.tab = 'alat';
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
      if (isStaff() && ui.mentorTab === 'kurikulum') {
        ui.lectureId = id;
        ui.kurEdit = false;
        render();
        return;
      }
      if (!canViewLecture(ui.personaId, id) && !isStaff()) {
        if (lec && lec.skuId && canSku(ui.personaId, lec.skuId)) {
          ui.skuId = lec.skuId;
          ui.skuPreview = false;
          ui.tab = 'sku';
          render();
          return;
        }
        ui.lectureId = id;
        ui.tab = 'belajar';
        ui.kurOpen = true;
        render();
        return;
      }
      ui.lectureId = id;
      ui.tab = 'belajar';
      ui.kurOpen = false;
      if (canOpenLecture(ui.personaId, id) || isStaff()) {
        db.lastLecture[ui.personaId] = ui.lectureId;
        save();
      }
      render();
    } else if (act === 'toggle-done') {
      const id = btn.getAttribute('data-id');
      if (!canOpenLecture(ui.personaId, id) && !isStaff()) {
        toast('Selesaikan materi sebelumnya dulu.');
        return;
      }
      markDone(ui.personaId, id, !isDone(ui.personaId, id));
      render();
    } else if (act === 'pane') {
      ui.pane = btn.getAttribute('data-id');
      render();
    } else if (act === 'open-student') {
      if (e.target.closest('a, select, input, textarea, label, .btn-sm, .cols-dd, .cols-dd-btn')) return;
      const id = btn.getAttribute('data-id');
      if (ui.skipOpen === id) return;
      ui.cariOpen = false;
      ui.cariSiswa = '';
      openPerson(id);
    } else if (act === 'task-compose') {
      const id = btn.getAttribute('data-id') || 'new';
      if (id === 'new') {
        ui.taskComposer = ui.taskComposer === 'new' ? '' : 'new';
      } else {
        ui.composeMode = 'task';
        ui.taskComposer = id;
      }
      render();
    } else if (act === 'cal-day') {
      ui.calDay = btn.getAttribute('data-id');
      render();
    } else if (act === 'cal-ym') {
      ui.calYM = btn.getAttribute('data-id');
      render();
    } else if (act === 'cal-ics-all') {
      const list = db.sessions || [];
      if (!list.length) {
        toast('Belum ada sesi live di jadwal.');
        return;
      }
      downloadIcs('jadwal-' + schoolSlug() + '.ics', buildSessionsIcs(list));
      toast('File .ics diunduh — buka di Apple Calendar, atau impor di Google Calendar.');
    } else if (act === 'cal-ics-one') {
      const id = btn.getAttribute('data-id');
      const ses = (db.sessions || []).find((s) => s.id === id);
      if (!ses) {
        toast('Sesi tidak ditemukan.');
        return;
      }
      downloadIcs((ses.id || 'sesi') + '.ics', buildSessionsIcs([ses]));
      toast('File .ics diunduh — Apple Calendar / Google Import.');
    } else if (act === 'kur-prev-lec') {
      ui.kurPreviewLec = btn.getAttribute('data-id');
      render();
    } else if (act === 'del-sku') {
      const id = btn.getAttribute('data-id');
      if (!canBill() || String(id).indexOf('sku-') !== 0) return;
      db.catalog = catalog().filter((p) => p.id !== id);
      save();
      toast('SKU dihapus dari perpustakaan lokal');
      render();
    } else if (act === 'pustaka-add-toggle') {
      ui.pustakaAddOpen = !ui.pustakaAddOpen;
      render();
    } else if (act === 'close-drawer' || act === 'close-person') {
      closePerson();
    } else if (act === 'siswa-view') {
      ui.siswaView = btn.getAttribute('data-id');
      ui.hubBack = ui.siswaView;
      ui.mentorTab = 'siswa';
      if (ui.siswaView !== 'pipa') {
        ui.pipaSettingsOpen = false;
        ui.pipaDeleteId = null;
      }
      if (ui.siswaView !== 'daftar') {
        ui.daftarBulk = '';
        ui.daftarColsOpen = false;
      }
      render();
    } else if (act === 'daftar-sel-cell') {
      e.preventDefault();
      e.stopPropagation();
      if (!(ui.daftarSelected instanceof Set)) ui.daftarSelected = new Set();
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (ui.daftarSelected.has(id)) ui.daftarSelected.delete(id);
      else ui.daftarSelected.add(id);
      if (!ui.daftarSelected.size) ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-sel-clear') {
      clearDaftarSelection();
      render();
    } else if (act === 'daftar-filters-clear') {
      ui.daftarTagFilter = '';
      ui.daftarPayFilter = '';
      ui.daftarJoinedFrom = '';
      ui.daftarJoinedTo = '';
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-bulk') {
      const id = btn.getAttribute('data-id') || '';
      ui.daftarBulk = ui.daftarBulk === id ? '' : id;
      render();
      if (ui.daftarBulk) {
        requestAnimationFrame(() => {
          const panel = document.getElementById('daftar-bulk-panel');
          const focusEl = panel && panel.querySelector('input, textarea, select');
          if (focusEl) focusEl.focus();
        });
      }
    } else if (act === 'daftar-bulk-close') {
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-bulk-tag-pick') {
      const tag = btn.getAttribute('data-tag') || '';
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const ids = daftarSelectedVisible(daftarFilteredPeople(q));
      let n = 0;
      ids.forEach((id) => { if (applyPersonTag(id, tag)) n += 1; });
      if (n) {
        save();
        toast('Tag “‘ + resolveTagLabel(tag) + ’” ditambah ke ' + n + ' orang.');
      } else {
        toast('Semua sudah punya tag itu.');
      }
      ui.daftarBulk = '';
      render();
    } else if (act === 'dash-range') {
      const id = btn.getAttribute('data-id') || '30';
      ui.dashRange = id;
      if (id !== 'custom') {
        ui.dashCustomOpen = false;
      } else {
        const b = dashBounds();
        if (!ui.dashFrom) ui.dashFrom = b.fromYmd;
        if (!ui.dashTo) ui.dashTo = b.toYmd;
        ui.dashCustomOpen = true;
      }
      render();
    } else if (act === 'dash-focus') {
      const id = btn.getAttribute('data-id') || '';
      ui.dashFocus = ui.dashFocus === id ? '' : id;
      render();
      if (ui.dashFocus) {
        requestAnimationFrame(() => {
          const el = document.querySelector('.dash-list');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    } else if (act === 'dash-apply') {
      ui.dashRange = 'custom';
      const fromEl = document.querySelector('[data-act="dash-from"]');
      const toEl = document.querySelector('[data-act="dash-to"]');
      if (fromEl) ui.dashFrom = fromEl.value || ui.dashFrom;
      if (toEl) ui.dashTo = toEl.value || ui.dashTo;
      render();
    } else if (act === 'stage-filter') {
      ui.stageFilter = btn.getAttribute('data-id') || '';
      ui.siswaView = 'daftar';
      ui.hubBack = 'daftar';
      ui.mentorTab = 'siswa';
      render();
    } else if (act === 'pipa-settings-toggle') {
      ui.pipaSettingsOpen = !ui.pipaSettingsOpen;
      if (!ui.pipaSettingsOpen) ui.pipaDeleteId = null;
      ui.daftarColsOpen = false;
      render();
    } else if (act === 'pipa-settings-close') {
      ui.pipaSettingsOpen = false;
      ui.pipaDeleteId = null;
      render();
    } else if (act === 'pipa-settings-reset') {
      db.pipelineStages = defaultPipelineStages();
      db.pipelineTransitions = defaultPipelineTransitions();
      ui.pipaDeleteId = null;
      save();
      toast('Pipa dikembalikan ke default.');
      render();
    } else if (act === 'pipa-stage-del') {
      const id = btn.getAttribute('data-id');
      const stages = pipelineStages();
      if (stages.length <= 1) {
        toast('Minimal satu tahap.');
        return;
      }
      const n = peopleInStage(id).length;
      if (n > 0) {
        ui.pipaDeleteId = id;
        ui.pipaSettingsOpen = true;
        render();
        return;
      }
      const res = removePipelineStage(id);
      if (!res.ok) {
        toast(res.reason === 'min' ? 'Minimal satu tahap.' : 'Tidak bisa hapus.');
        return;
      }
      save();
      toast('Tahap dihapus.');
      render();
    } else if (act === 'pipa-stage-del-cancel') {
      ui.pipaDeleteId = null;
      render();
    } else if (act === 'pipa-stage-del-confirm') {
      const id = btn.getAttribute('data-id') || ui.pipaDeleteId;
      const sel = document.getElementById('pipa-move-to');
      const moveTo = (sel && sel.value) || '';
      if (!id) return;
      if (!moveTo) {
        toast('Pilih tahap tujuan.');
        return;
      }
      const res = removePipelineStage(id, moveTo);
      if (!res.ok) {
        toast(res.reason === 'move' ? 'Pilih tahap lain untuk orang di situ.' : (res.reason === 'min' ? 'Minimal satu tahap.' : 'Tidak bisa hapus.'));
        return;
      }
      ui.pipaDeleteId = null;
      save();
      toast((res.moved ? res.moved + ' orang dipindah. ' : '') + 'Tahap dihapus.');
      render();
    } else if (act === 'pipa-tr-add') {
      const stages = pipelineStages();
      if (!stages.length) return;
      const used = new Set(pipelineTransitions().map((t) => t.when));
      const next = PIPE_EVENTS.find((e) => !used.has(e.id)) || PIPE_EVENTS[0];
      pipelineTransitions().push({
        id: 'tr-' + Date.now(),
        when: next.id,
        to: stages[0].id
      });
      ui.pipaSettingsOpen = true;
      save();
      render();
    } else if (act === 'pipa-tr-del') {
      const id = btn.getAttribute('data-id');
      db.pipelineTransitions = pipelineTransitions().filter((t) => t.id !== id);
      save();
      render();
    } else if (act === 'daftar-cols-toggle') {
      ui.daftarColsOpen = !ui.daftarColsOpen;
      ui.pipaSettingsOpen = false;
      render();
    } else if (act === 'daftar-cols-close') {
      ui.daftarColsOpen = false;
      render();
    } else if (act === 'daftar-cols-reset') {
      db.daftarCols = defaultDaftarCols();
      save();
      toast('Kolom dikembalikan ke default.');
      render();
    } else if (act === 'daftar-col-up' || act === 'daftar-col-down') {
      const id = btn.getAttribute('data-id');
      const cols = daftarCols();
      const i = cols.indexOf(id);
      if (i < 1) return;
      const j = act === 'daftar-col-up' ? i - 1 : i + 1;
      if (j < 1 || j >= cols.length) return;
      const tmp = cols[i];
      cols[i] = cols[j];
      cols[j] = tmp;
      db.daftarCols = cols;
      save();
      render();
    } else if (act === 'daftar-col-del') {
      const id = btn.getAttribute('data-id');
      db.daftarCustom = daftarCustomList().filter((c) => c.id !== id);
      db.daftarCols = daftarCols().filter((x) => x !== id);
      Object.keys(db.people || {}).forEach((sid) => {
        if (db.people[sid] && db.people[sid].fields) {
          delete db.people[sid].fields[id];
        }
      });
      save();
      toast('Kolom kustom dihapus.');
      render();
    } else if (act === 'queue-kind') {
      ui.queueKind = btn.getAttribute('data-id');
      render();
    } else if (act === 'plan-new') {
      const id = 'plan-' + Date.now();
      db.actionPlans.push({
        id: id,
        name: 'Rencana baru',
        trigger: 'manual',
        archived: false,
        steps: [{ id: 'st-' + Date.now(), waitHours: 0, kind: 'wa', title: '', body: '' }]
      });
      ui.editPlanId = id;
      save();
      render();
    } else if (act === 'plan-edit') {
      ui.editPlanId = btn.getAttribute('data-id');
      render();
    } else if (act === 'plan-dup') {
      const p = planById(btn.getAttribute('data-id'));
      if (!p) return;
      const n = JSON.parse(JSON.stringify(p));
      n.id = 'plan-' + Date.now();
      n.name = p.name + ' (salinan)';
      n.archived = false;
      n.steps = (n.steps || []).map((st, i) => Object.assign({}, st, { id: n.id + '-s' + i }));
      db.actionPlans.push(n);
      ui.editPlanId = n.id;
      save();
      render();
    } else if (act === 'plan-arch') {
      const p = planById(btn.getAttribute('data-id'));
      if (p) { p.archived = true; save(); render(); }
    } else if (act === 'plan-unarch') {
      const p = planById(btn.getAttribute('data-id'));
      if (p) { p.archived = false; save(); render(); }
    } else if (act === 'plan-show-arch') {
      ui.showArchivedPlans = !ui.showArchivedPlans;
      render();
    } else if (act === 'plan-add-step') {
      const p = planById(btn.getAttribute('data-id'));
      if (!p) return;
      p.steps = p.steps || [];
      p.steps.push({ id: 'st-' + Date.now(), waitHours: 0, kind: 'wa', title: '', body: '' });
      save();
      render();
    } else if (act === 'plan-del-step') {
      const p = planById(btn.getAttribute('data-pid'));
      if (!p) return;
      p.steps = (p.steps || []).filter((x) => x.id !== btn.getAttribute('data-sid'));
      save();
      render();
    } else if (act === 'res-add-url') {
      const l = lectureById(btn.getAttribute('data-id'));
      if (!l) return;
      const inp = document.querySelector('[data-act="res-new-url"][data-id="' + l.id + '"]');
      const url = inp ? String(inp.value || '').trim() : '';
      if (!url) { toast('Tempel tautan dulu.'); return; }
      l.resources = l.resources || [];
      l.resources.push({ name: url.split('/').pop() || 'File', url: url });
      save();
      render();
    } else if (act === 'res-del') {
      const l = lectureById(btn.getAttribute('data-id'));
      if (!l) return;
      const i = +btn.getAttribute('data-i');
      const row = (l.resources || [])[i];
      if (row && row.blobId) blobDel(row.blobId);
      l.resources.splice(i, 1);
      save();
      render();
    } else if (act === 'em-sent') {
      const w = (db.emailQueue || []).find((x) => x.id === btn.getAttribute('data-id'));
      if (w) {
        w.status = 'sent';
        pushTimeline(w.toId, 'email', 'Anton menandai email terkirim: ' + (w.subject || w.title));
      }
      save();
      render();
    } else if (act === 'del-lec') {
      const id = btn.getAttribute('data-id');
      const l = lectureById(id);
      blobDel(id);
      if (l && l.videoKey) deleteRemoteVideo(l.videoKey);
      blobDel(coverKey('lec', id));
      (l && l.resources || []).forEach((r) => { if (r.blobId) blobDel(r.blobId); });
      db.lectures = db.lectures.filter((x) => x.id !== id);
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
    } else if (act === 'edit-sec') {
      const id = btn.getAttribute('data-id');
      ui.editSecId = ui.editSecId === id ? null : id;
      render();
    } else if (act === 'add-item') {
      ui.addItemWeek = btn.getAttribute('data-id');
      setSecOpen(ui.addItemWeek, true);
      render();
    } else if (act === 'cancel-item') {
      ui.addItemWeek = '';
      render();
    } else if (act === 'new-sec') {
      ui.addSecOpen = true;
      render();
    } else if (act === 'cancel-sec') {
      ui.addSecOpen = false;
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
      if (l) {
        if (l.videoKey) deleteRemoteVideo(l.videoKey);
        l.videoBlob = false;
        l.videoKey = '';
        l.videoName = '';
      }
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
    } else if (act === 'pick-term') {
      ui.payTerm = btn.getAttribute('data-id');
      render();
    } else if (act === 'claim-tool') {
      const pid = btn.getAttribute('data-id');
      const p = productById(pid);
      if (!canMentoring(ui.personaId) || !bundled(p)) {
        toast('Harga mentoring −' + toolDiscountPct() + '% setelah lunas.');
        return;
      }
      const b = billingOf(ui.personaId);
      if (b.products.indexOf(pid) < 0) b.products.push(pid);
      save();
      toast(p.title + ' kebuka di harga mentoring (−' + toolDiscountPct() + '%). Prototype, bukan tagihan lynk.');
      render();
    } else if (act === 'pay-later') {
      if (!ensureApplication()) {
        toast('Isi form dulu.');
        ui.wizStep = 0;
        ui.wizFocusedStep = null;
        ui.tab = 'daftar';
        render();
        return;
      }
      startTrial(ui.personaId);
      save();
      ui.lectureId = firstLectureId();
      ui.tab = 'belajar';
      toast('Trial: video 1 kebuka. Diskon 24 jam dari jam form.');
      render();
    } else if (act === 'pay-lynk') {
      if (!ensureApplication()) {
        toast('Isi form dulu.');
        ui.wizStep = 0;
        ui.wizFocusedStep = null;
        ui.tab = 'daftar';
        render();
        return;
      }
      const term = btn.getAttribute('data-term') || ui.payTerm || 'month';
      const url = lynkCheckoutUrl(term);
      if (!url) {
        toast('Tautan Lynk untuk paket ini belum diisi.');
        return;
      }
      if (!normalizeWa(student().wa)) {
        toast('Nomor WA di form belum ada.');
        return;
      }
      const welcome = welcomeOpen(ui.personaId) || hoursLeft(billingOf(ui.personaId).offerExpiresAt) > 0;
      markPendingLynk(ui.personaId, term, priceForTerm(term, welcome), url);
      save();
      openLynk(url);
      toast('Halaman Lynk terbuka. Kelas kebuka setelah pembayaran terkonfirmasi.');
      render();
    } else if (act === 'pay-manual' || act === 'pay-now') {
      if (!ensureApplication()) {
        toast('Isi form dulu.');
        ui.wizStep = 0;
        ui.wizFocusedStep = null;
        ui.tab = 'daftar';
        render();
        return;
      }
      const term = btn.getAttribute('data-term') || ui.payTerm || 'month';
      const welcome = welcomeOpen(ui.personaId) || hoursLeft(billingOf(ui.personaId).offerExpiresAt) > 0;
      const amount = priceForTerm(term, welcome);
      if (act === 'pay-now' && term === 'autopay' && !mayarReady()) {
        grantMentoring(ui.personaId, term, 'mock', amount);
        toast('Autopay mock · akses kebuka');
      } else if (act === 'pay-now' && mayarReady()) {
        toast('Pakai Bayar sekarang.');
        return;
      } else {
        markPendingTransfer(ui.personaId, term, amount);
        toast('Tercatat. Akses kebuka setelah Anton konfirmasi.');
      }
      save();
      ui.tab = 'home';
      render();
    } else if (act === 'pay-mayar' || act === 'mayar-test') {
      const test = act === 'mayar-test';
      if (test && !canBill()) return;
      if (!test && !ensureApplication()) {
        toast('Isi form dulu.');
        ui.wizStep = 0;
        ui.wizFocusedStep = null;
        ui.tab = 'daftar';
        render();
        return;
      }
      const term = btn.getAttribute('data-term') || ui.payTerm || 'month';
      const welcome = !test && (welcomeOpen(ui.personaId) || hoursLeft(billingOf(ui.personaId).offerExpiresAt) > 0);
      const amount = test ? 10000 : priceForTerm(term, welcome);
      const who = test ? null : student();
      btn.disabled = true;
      requestMayarInvoice({
        test: test,
        personId: test ? 'mayar-test' : ui.personaId,
        term: test ? 'month' : term,
        amount: amount,
        name: test ? 'Tes Mayar' : (who && who.name),
        email: test ? 'tes.mayar@obrolan.marketing' : (who && who.email),
        mobile: test ? '080000000000' : (who && who.wa)
      }).then((res) => {
        const data = res.data || {};
        if (!res.ok || !data.link) {
          const msg = data.message || data.error || 'Mayar gagal';
          toast(msg === 'not_configured' ? 'Mayar belum dikonfigurasi.' : String(msg));
          render();
          return;
        }
        if (test) {
          window.open(data.link, '_blank', 'noopener');
          toast('Invoice tes terbuka. Tidak mengubah akses kelas.');
          refreshMayarStatus().then(() => { if (ui.mentorTab === 'harga') render(); });
          return;
        }
        markPendingMayar(ui.personaId, term, amount, data);
        save();
        window.open(data.link, '_blank', 'noopener');
        toast('Halaman Mayar terbuka. Akses kebuka setelah pembayaran masuk.');
        ui.tab = 'home';
        render();
      }).catch(() => {
        toast('Mayar tidak terjangkau.');
        render();
      });
    } else if (act === 'confirm-paid') {
      const id = btn.getAttribute('data-id');
      if (!id || !canBill()) return;
      confirmPaid(id, btn.getAttribute('data-task') || '');
      save();
      toast('Lunas · akses mentoring kebuka');
      render();
    } else if (act === 'not-interested') {
      applyTransition(ui.personaId, 'tidak_tertarik', 'tidak_tertarik', 'Siswa bilang tidak tertarik.');
      const b = billingOf(ui.personaId);
      if (b.status === 'trial') {
        b.status = 'belum';
        b.plan = '';
      }
      save();
      ui.tab = 'home';
      toast('Pindah ke follow-up jarang.');
      render();
    } else if (act === 'task-done') {
      const row = db.tasks.find((x) => x.id === btn.getAttribute('data-id'));
      if (row) {
        row.done = true;
        pushTimeline(row.personId, 'task', 'Tugas selesai: ' + row.title);
      }
      save();
      render();
    } else if (act === 'task-from') {
      const id = btn.getAttribute('data-id');
      ui.taskComposer = id;
      openPerson(id);
    } else if (act === 'wa-crm-send') {
      const id = btn.getAttribute('data-id');
      const qid = btn.getAttribute('data-qid');
      const tid = btn.getAttribute('data-tid');
      const q = (db.waQueue || []).find((x) => x.id === qid);
      const task = db.tasks.find((x) => x.id === tid);
      ui.waDraft = (q && q.body) || (task && task.body) || ui.waDraft || '';
      ui.composeMode = 'wa';
      if (id) markWaRead(id);
      if (id) openPerson(id);
      else render();
      if (id) pullWaThread(id, { silentTimeline: true });
      requestAnimationFrame(scrollWaThread);
    } else if (act === 'wa-sent') {
      const w = db.waQueue.find((x) => x.id === btn.getAttribute('data-id'));
      if (w) {
        w.status = 'sent';
        pushTimeline(w.toId, 'wa', 'Anton menandai WA terkirim: ' + w.title);
      }
      save();
      render();
    } else if (act === 'remit') {
      const r = db.remittances.find((x) => x.id === btn.getAttribute('data-id'));
      if (r) r.received = r.expected;
      save();
      toast('Setoran 20% ditandai masuk');
      render();
    } else if (act === 'accept-mentor') {
      const c = crmOf(ui.personaId);
      if (!c.eligibleMentor) return;
      c.acceptedMentorAt = isoNow();
      c.acceptedOverride = true;
      const s = student();
      s.kind = 'mentor';
      patchPerson(ui.personaId, { kind: 'mentor' });
      applyTransition(ui.personaId, 'mentor', 'mentor', 'Terima peran mentor + 20% licensing.');
      save();
      toast('Peran mentor aktif. Murid baru menempel ke kamu.');
      render();
    } else if (act === 'print-cert') {
      window.print();
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.matches('[data-act]')) return;
    e.preventDefault();
    const act = form.getAttribute('data-act');
    if (isSiswaReadonly() && SISWA_RO_BLOCK.has(act)) {
      toast('Siswa view · hanya lihat.');
      return;
    }
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
    } else if (act === 'report-issue') {
      const lec = lectureById(form.getAttribute('data-id'));
      const body = String(fd.get('body') || '').trim();
      if (!body) return;
      postIssue({
        kind: 'lesson',
        body: body,
        lessonId: lec ? lec.id : '',
        lessonTitle: lec ? lec.title : ''
      });
      toast('Laporan terkirim');
      form.reset();
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
    } else if (act === 'post-new') {
      submitDiskusiPost(String(fd.get('body') || ''), form.getAttribute('data-batch') || '');
    } else if (act === 'post-comment') {
      ensureDiskusi();
      const postId = form.getAttribute('data-id');
      const post = db.posts.find((p) => p && p.id === postId);
      const text = String(fd.get('body') || '').trim();
      if (!post || !text || !canPostIn(actorId(), post.batchId)) return;
      const replyId = form.getAttribute('data-reply') || '';
      const replyOk = replyId && (db.comments || []).some((c) => c && c.id === replyId && c.postId === postId);
      const row = {
        id: 'dkc-' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36),
        postId: postId,
        authorId: actorId(),
        body: text,
        likes: [],
        replyTo: replyOk ? replyId : '',
        createdAt: isoNow()
      };
      db.comments.push(row);
      rememberDiskusiComment(row);
      if (ui.commentDrafts) delete ui.commentDrafts[postId];
      if (ui.replyTo && ui.replyTo.postId === postId) ui.replyTo = null;
      ui.diskusiScroll = 'bottom';
      save();
      render();
    } else if (act === 'batch-rename') {
      if (!isStaff()) return;
      ensureDiskusi();
      const id = form.getAttribute('data-id') || '';
      if (!isMonthChat(id) && id.indexOf('c-') !== 0) return;
      const name = String(fd.get('name') || '').trim().slice(0, 60);
      if (name) db.batchNames[id] = name;
      else delete db.batchNames[id];
      rememberDiskusiChat(id);
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
    } else if (act === 'wa-send') {
      const id = form.getAttribute('data-id');
      const text = String(fd.get('body') || '').trim();
      if (!id || !text) return;
      sendWaFromCrm(id, text).then(() => {
        render();
        requestAnimationFrame(scrollWaThread);
      });
    } else if (act === 'wa-attach') {
      const phone = form.getAttribute('data-phone') || '';
      const personId = String(fd.get('personId') || '');
      if (!phone || !personId) return;
      const thread = upsertLocalThread({ phone: phone, personId: personId, updatedAt: isoNow() });
      const s = people().find((x) => x.id === personId);
      if (s && s.wa && normalizeWa(s.wa) !== normalizeWa(phone)) {
        patchPerson(personId, { wa: normalizeWa(phone) });
      }
      if (thread) thread.personId = personId;
      save();
      if (waApiEnabled()) {
        fetch(waApiUrl('thread'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'attach', personId: personId, phone: phone })
        }).catch(() => {});
      }
      toast('Nomor dipasang ke ' + nameOf(personId));
      ui.composeMode = 'wa';
      openPerson(personId);
    } else if (act === 'note') {
      const id = form.getAttribute('data-id');
      db.notes[id] = db.notes[id] || [];
      db.notes[id].push({ at: isoNow(), body: String(fd.get('body')) });
      save();
      render();
    } else if (act === 'daftar-bulk-tag') {
      const tag = String(fd.get('tag') || '').trim();
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const ids = daftarSelectedVisible(daftarFilteredPeople(q));
      if (!tag || !ids.length) return;
      let n = 0;
      ids.forEach((id) => { if (applyPersonTag(id, tag)) n += 1; });
      if (n) {
        save();
        toast('Tag “‘ + resolveTagLabel(tag) + ’” ditambah ke ' + n + ' orang.');
      } else {
        toast('Semua sudah punya tag itu.');
      }
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-bulk-stage') {
      const stage = String(fd.get('stage') || '');
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const ids = daftarSelectedVisible(daftarFilteredPeople(q));
      if (!stage || !ids.length) return;
      if (!pipelineStages().some((s) => s.id === stage)) {
        toast('Stage tidak ditemukan.');
        return;
      }
      let n = 0;
      ids.forEach((id) => {
        if (crmOf(id).stage === stage) return;
        setStage(id, stage, 'Bulk: pindah ke ' + stageLabel(stage));
        n += 1;
      });
      save();
      toast(n ? (n + ' orang pindah ke ' + stageLabel(stage) + '.') : 'Semua sudah di stage itu.');
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-bulk-note') {
      const body = String(fd.get('body') || '').trim();
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const ids = daftarSelectedVisible(daftarFilteredPeople(q));
      if (!body || !ids.length) return;
      ids.forEach((id) => {
        db.notes[id] = db.notes[id] || [];
        db.notes[id].push({ at: isoNow(), body: body });
      });
      save();
      toast('Catatan ditambah ke ' + ids.length + ' orang.');
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-bulk-email') {
      const subject = String(fd.get('subject') || '').trim();
      const body = String(fd.get('body') || '').trim();
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const ids = daftarSelectedVisible(daftarFilteredPeople(q));
      if (!subject || !body || !ids.length) return;
      const withMail = [];
      ids.forEach((id) => {
        const s = people().find((x) => x.id === id);
        if (!s || !s.email) return;
        withMail.push(s);
        queueEmail(id, 'Bulk: ' + subject, subject, body, isoNow());
        pushTimeline(id, 'email', 'Email bulk diantrikan: ' + subject);
      });
      if (!withMail.length) {
        toast('Tidak ada email di pilihan ini.');
        return;
      }
      save();
      const first = withMail[0];
      const bcc = withMail.slice(1).map((s) => s.email).join(',');
      let href = mailLink(first.email, fillTpl(subject, first.id), fillTpl(body, first.id));
      if (bcc) href += '&bcc=' + encodeURIComponent(bcc);
      window.location.href = href;
      toast(withMail.length + ' email diantrikan.');
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-bulk-update') {
      const title = String(fd.get('title') || '').trim();
      const body = String(fd.get('body') || '').trim();
      const viaWa = !!fd.get('viaWa');
      const viaEmail = !!fd.get('viaEmail');
      const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
      const ids = daftarSelectedVisible(daftarFilteredPeople(q));
      if (!title || !body || !ids.length) return;
      if (!viaWa && !viaEmail) {
        toast('Centang WA dan/atau email.');
        return;
      }
      let waN = 0;
      let emN = 0;
      ids.forEach((id) => {
        const s = people().find((x) => x.id === id) || {};
        if (viaWa && s.wa) {
          queueWa(id, title, body, isoNow());
          waN += 1;
        }
        if (viaEmail && s.email) {
          queueEmail(id, title, title, body, isoNow());
          emN += 1;
        }
        pushTimeline(id, 'event', 'Update bulk: ' + title);
      });
      save();
      toast('Update diantrikan · WA ' + waN + ' · email ' + emN + '.');
      ui.daftarBulk = '';
      render();
    } else if (act === 'daftar-col-add') {
      const label = String(fd.get('label') || '').trim().slice(0, 40);
      if (!label) return;
      const id = 'cf-' + Date.now().toString(36);
      db.daftarCustom = daftarCustomList().concat([{ id: id, label: label }]);
      const cols = daftarCols();
      if (cols.indexOf(id) < 0) cols.push(id);
      db.daftarCols = cols;
      ui.daftarColsOpen = true;
      save();
      toast('Kolom “' + label + '” ditambah.');
      render();
    } else if (act === 'pipa-stage-add') {
      const label = String(fd.get('label') || '').trim().slice(0, 40);
      if (!label) return;
      const stages = pipelineStages();
      const id = slugStageId(label);
      stages.push({
        id: id,
        label: label,
        color: normalizeStageColor('', stages.length)
      });
      db.pipelineStages = stages;
      ui.pipaSettingsOpen = true;
      ui.pipaDeleteId = null;
      save();
      toast('Tahap “' + label + '” ditambah.');
      render();
    } else if (act === 'log-call') {
      const id = form.getAttribute('data-id');
      db.notes[id] = db.notes[id] || [];
      db.notes[id].push({ at: isoNow(), body: 'Panggilan: ' + String(fd.get('body')) });
      pushTimeline(id, 'call', 'Anton mencatat panggilan dengan ' + nameOf(id));
      save();
      toast('Panggilan dicatat.');
      render();
    } else if (act === 'save-person') {
      const id = form.getAttribute('data-id');
      const email = String(fd.get('email') || '').trim();
      const tiktok = tiktokHandle(fd.get('tiktok'));
      const wa = String(fd.get('wa') || '').replace(/\D/g, '');
      patchPerson(id, { email: email, tiktok: tiktok, wa: wa || undefined });
      save();
      toast('Kontak disimpan. Mengambil foto TikTok…');
      refreshPersonPhoto(id, true).then((ok) => {
        toast(ok ? 'Foto TikTok tersimpan.' : 'Foto gagal. Inisial + unggah.');
        render();
      });
    } else if (act === 'add-sec-form') {
      const title = String(fd.get('title') || '').trim();
      if (!title) return;
      ensureSecFold();
      const id = 's-' + Date.now();
      db.weeks.push({ id: id, title: title, due: String(fd.get('due') || '') });
      db.weeks.forEach((w) => { if (w.id !== id) ui.secFold.add(w.id); });
      ui.secFold.delete(id);
      ui.secKnown = ui.secKnown || new Set();
      ui.secKnown.add(id);
      ui.addSecOpen = false;
      save();
      toast('Bagian ditambah.');
      render();
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-sec="' + id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } else if (act === 'add-lec') {
      const weekId = form.getAttribute('data-week');
      const title = String(fd.get('title') || '').trim();
      const url = String(fd.get('url') || '').trim();
      const kind = String(fd.get('kind') || 'video');
      const file = form.querySelector('[name="videoFile"]') && form.querySelector('[name="videoFile"]').files[0];
      if (!title) return;
      const id = 'v-' + Date.now();
      const type = kind === 'text' ? 'text' : (kind === 'file' ? 'document' : 'video');
      db.lectures.push({
        id: id,
        weekId: weekId,
        type: type,
        title: title,
        mins: type === 'text' ? 5 : 8,
        url: url,
        body: '',
        videoBlob: false,
        videoName: '',
        requiredBefore: !!(form.querySelector('[name=req]') && form.querySelector('[name=req]').checked),
        points: [],
        questions: [],
        resources: type === 'document' && url ? [{ name: title, url: url }] : []
      });
      ui.editLecId = null;
      ui.addItemWeek = '';
      setSecOpen(weekId, true);
      save();
      if (kind === 'video' && file) {
        ingestVideoFile(file, { lecId: id });
      } else {
        toast('Lecture ditambah. Klik + Konten untuk unggah.');
        render();
      }
    } else if (act === 'meet') {
      const ses = db.sessions.find((s) => s.id === form.getAttribute('data-id'));
      if (ses) ses.meetUrl = String(fd.get('meetUrl'));
      save();
      toast('Tautan Meet disimpan');
      render();
    } else if (act === 'apply' || act === 'wiz-next') {
      advanceWiz();
    } else if (act === 'add-task') {
      const due = joinLocal(fd.get('date'), fd.get('time'));
      addTask(
        String(fd.get('personId')),
        String(fd.get('title')),
        String(fd.get('body') || ''),
        due,
        String(fd.get('kind') || 'wa'),
        String(fd.get('assignee') || defaultAssigneeId())
      );
      ui.taskComposer = '';
      save();
      toast('Tugas ditambah');
      render();
    } else if (act === 'add-sku') {
      if (!canBill()) return;
      const title = String(fd.get('title') || '').trim();
      if (!title) return;
      db.catalog = catalog();
      db.catalog.push({
        id: 'sku-' + Date.now(),
        group: String(fd.get('group') || 'alat'),
        kind: String(fd.get('group')) === 'rekaman' ? 'video' : 'tool',
        title: title,
        job: String(fd.get('job') || '').trim(),
        price: +fd.get('price') || 0,
        coret: +fd.get('coret') || 0,
        lynk: String(fd.get('lynk') || '').trim(),
        cover: String(fd.get('cover') || '').trim(),
        example: !!fd.get('example'),
        includedInMentoring: !!fd.get('mentor')
      });
      save();
      toast('Produk masuk perpustakaan (lokal)');
      ui.pustakaAddOpen = false;
      render();
    } else if (act === 'save-dunning') {
      db.dunning.warningDays = Math.max(1, +fd.get('warningDays') || 5);
      db.dunning.graceDays = Math.max(0, +fd.get('graceDays') || 1);
      save();
      toast('Jeda perpanjangan disimpan');
      render();
    } else if (act === 'save-pricing') {
      db.pricing.monthlyIdr = +fd.get('monthlyIdr') || db.pricing.monthlyIdr;
      db.pricing.quarterDiscountPct = +fd.get('quarterDiscountPct') || 0;
      db.pricing.halfDiscountPct = +fd.get('halfDiscountPct') || 0;
      db.pricing.autopayDiscountPct = +fd.get('autopayDiscountPct') || 0;
      db.pricing.welcomeDiscountPct = +fd.get('welcomeDiscountPct') || 0;
      db.pricing.toolDiscountPct = Math.min(90, Math.max(0, +fd.get('toolDiscountPct') || 50));
      db.pricing.overridePct = +fd.get('overridePct') || 20;
      save();
      toast('Harga placeholder disimpan');
      render();
    } else if (act === 'save-bank') {
      db.bank.bank = String(fd.get('bank') || db.bank.bank);
      db.bank.number = String(fd.get('number') || db.bank.number);
      db.bank.name = String(fd.get('name') || db.bank.name);
      save();
      toast('Rekening disimpan');
      render();
    } else if (act === 'save-school-url') {
      if (!canBill()) return;
      const nextInvite = String(fd.get('invite') || '').trim().toUpperCase().replace(/\s+/g, '-');
      db.schoolSlug = 'obrolan.marketing';
      db.inviteCode = nextInvite || SEED.cohort.invite;
      db.ownerContact = {
        wa: normalizeWa(fd.get('ownerWa') || ''),
        email: String(fd.get('ownerEmail') || '').trim()
      };
      save();
      toast('Kontak dan undangan disimpan');
      render();
    } else if (act === 'save-lynk') {
      if (!canBill()) return;
      db.lynkProducts = db.lynkProducts || {};
      ['month', 'quarter', 'half'].forEach((term) => {
        db.lynkProducts[term] = {
          url: String(fd.get(term + 'Url') || '').trim(),
          title: String(fd.get(term + 'Title') || '').trim(),
          price: Math.max(0, Number(fd.get(term + 'Price')) || 0)
        };
      });
      save();
      toast('Paket Lynk disimpan');
      render();
    } else if (act === 'save-school-profile') {
      if (!canBill()) return;
      ensureSchoolProfile();
      const next = db.schoolProfile;
      next.firstName = String(fd.get('firstName') || '').trim().slice(0, 40);
      next.lastName = String(fd.get('lastName') || '').trim().slice(0, 40);
      next.headline = String(fd.get('headline') || '').trim().slice(0, 60);
      next.biography = String(fd.get('biography') || '').trim().slice(0, 2000);
      next.socials = Object.assign({}, next.socials, {
        website: String(fd.get('website') || '').trim(),
        facebook: socialHandleClean(fd.get('facebook')),
        instagram: socialHandleClean(fd.get('instagram')),
        linkedin: socialHandleClean(String(fd.get('linkedin') || '').replace(/^in\//i, '')),
        tiktok: tiktokHandle(fd.get('tiktok')),
        x: socialHandleClean(fd.get('x')),
        youtube: socialHandleClean(fd.get('youtube'))
      });
      save();
      toast('Profile saved');
      if (next.photoMode === 'social') {
        refreshSchoolPhotoFromSocial(true).then(() => render());
      } else {
        render();
      }
    } else if (act === 'save-account-security') {
      if (!canBill()) return;
      ensureAccountSettings();
      const email = String(fd.get('email') || '').trim();
      if (!email || email.indexOf('@') < 1) {
        toast('Enter a valid email.');
        return;
      }
      const curPw = String(fd.get('currentPassword') || '');
      const newPw = String(fd.get('newPassword') || '');
      const conf = String(fd.get('confirmPassword') || '');
      if (newPw || conf || curPw) {
        if (newPw.length < 8) {
          toast('New password must be at least 8 characters.');
          return;
        }
        if (newPw !== conf) {
          toast('New password and confirmation do not match.');
          return;
        }
        if (db.accountSettings.passwordSet && !curPw) {
          toast('Enter your current password to change it.');
          return;
        }
        db.accountSettings.passwordSet = true;
      }
      db.accountSettings.email = email;
      db.accountSettings.twoFactor = !!fd.get('twoFactor');
      save();
      toast(db.accountSettings.twoFactor ? 'Security saved · 2FA on (mock)' : 'Security saved');
      render();
    } else if (act === 'save-account-notifications') {
      if (!canBill()) return;
      ensureAccountSettings();
      db.accountSettings.notifications = {
        studentJoin: !!fd.get('studentJoin'),
        studentPay: !!fd.get('studentPay'),
        lessonComplete: !!fd.get('lessonComplete'),
        comment: !!fd.get('comment')
      };
      save();
      toast('Notification preferences saved');
      render();
} else if (act === 'exam') {
      const qs = SEED.exam.questions;
      let score = 0;
      qs.forEach((q, i) => {
        const v = fd.get('q' + i);
        if (v != null && +v === q.answer) score += 1;
      });
      const c = crmOf(ui.personaId);
      c.examScore = score;
      c.examAt = isoNow();
      c.eligibleMentor = score >= SEED.exam.passMark;
      if (c.eligibleMentor) {
        c.certSerial = c.certSerial || ('ANT-' + ui.personaId.replace(/\W/g, '').toUpperCase().slice(0, 8) + '-' + String(nowMs()).slice(-4));
        applyTransition(ui.personaId, 'lulus_tes', 'mentee', 'Lulus tes ' + score + '/' + qs.length);
      }
      pushTimeline(ui.personaId, 'exam', 'Tes akhir ' + score + '/' + qs.length);
      save();
      ui.tab = c.eligibleMentor ? 'sertifikat' : 'progres';
      toast(c.eligibleMentor ? 'Lulus. Sertifikat terbit.' : 'Belum lulus. Ulangi setelah baca materi.');
      render();
    }
  });

  applyTheme(currentTheme(), false);
  $('btn-theme').addEventListener('click', () => {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light', true);
  });

  function setBrandMenu(open) {
    const btn = $('brand-btn');
    const menu = $('brand-menu');
    if (!btn || !menu) return;
    const show = !!open && !btn.disabled;
    menu.hidden = !show;
    btn.setAttribute('aria-expanded', String(show));
  }
  $('brand-btn').addEventListener('click', () => {
    setBrandMenu($('brand-menu').hidden);
  });
  document.addEventListener('click', (e) => {
    const menu = $('brand-menu');
    if (!menu || menu.hidden) return;
    if (e.target.closest && e.target.closest('#brand-menu, #brand-btn')) return;
    setBrandMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const menu = $('brand-menu');
    if (menu && !menu.hidden) setBrandMenu(false);
    if (ui.profilePreview) {
      ui.profilePreview = null;
      paintProfilePreview();
    }
    if (isOnboardPreview()) {
      ui.onboardPreview = null;
      paintOnboardPreview();
    }
  });

  const adminOut = $('btn-admin-out');
  if (adminOut) adminOut.addEventListener('click', () => {
    setBrandMenu(false);
    if (!confirm('Keluar dari admin di browser ini? Tab ini jadi pengunjung.')) return;
    try { sessionStorage.removeItem('anton-admin'); } catch (err) { /* private mode */ }
    fetch(apiBase() + '/admin/logout', { method: 'POST', cache: 'no-store' }).finally(() => {
      location.href = location.pathname;
    });
  });
  $('drawer-scrim').addEventListener('click', closeDrawer);

  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) {
      applyTheme(e.newValue === 'light' ? 'light' : 'dark', false);
      return;
    }
    if (e.key !== KEY || ui.presentApplying) return;
    reloadDb();
  });
  if (BUS) {
    BUS.onmessage = (e) => {
      if (!e.data || e.data.type !== 'db' || ui.presentApplying) return;
      reloadDb();
    };
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (!e.data || e.data.source !== 'anton-present') return;
    if (e.data.cmd === 'scene') applyPresent(e.data.scene);
    if (e.data.cmd === 'reload-db') reloadDb();
  });
  if (ui.present) {
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (parent === window) return;
      e.preventDefault();
      parent.postMessage({ source: 'anton-school', type: 'key', key: e.key }, location.origin);
    });
  }

  function readEnvInset(side) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
      (side === 'top'
        ? 'padding-top:env(safe-area-inset-top,0px)'
        : 'padding-bottom:env(safe-area-inset-bottom,0px)');
    document.body.appendChild(el);
    const v = parseFloat(getComputedStyle(el)[side === 'top' ? 'paddingTop' : 'paddingBottom']) || 0;
    el.remove();
    return v;
  }
  function syncViewportShell() {
    if (!document.body) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const h = Math.round((vv && vv.height) || window.innerHeight || 0);
    const top = Math.round((vv && vv.offsetTop) || 0);
    if (h > 0) root.style.setProperty('--app-height', h + 'px');
    root.style.setProperty('--app-top', top + 'px');
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    const envBottom = readEnvInset('bottom');
    const envTop = readEnvInset('top');
    /* Safari's bottom toolbar is not always in safe-area; seat the dock above it. */
    const browserPad = standalone ? 0 : Math.max(0, Math.min(56, window.innerHeight - h));
    const bottom = Math.max(envBottom, browserPad, standalone ? 0 : 12);
    root.style.setProperty('--safe-bottom', bottom + 'px');
    root.style.setProperty('--safe-top', envTop + 'px');
  }
  function lockAppGestures() {
    const stop = (e) => { e.preventDefault(); };
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('gestureend', stop, { passive: false });
    let edge = 0;
    let sx = 0;
    let sy = 0;
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      sx = t.clientX;
      sy = t.clientY;
      const w = window.innerWidth;
      edge = sx < 24 ? -1 : (sx > w - 24 ? 1 : 0);
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      if (!edge || !e.touches[0]) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) <= Math.abs(dy) + 6) return;
      if ((edge < 0 && dx > 0) || (edge > 0 && dx < 0)) e.preventDefault();
    }, { passive: false });
  }
  lockAppGestures();
  syncViewportShell();
  window.addEventListener('resize', syncViewportShell);
  window.addEventListener('orientationchange', () => setTimeout(syncViewportShell, 120));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncViewportShell);
    window.visualViewport.addEventListener('scroll', syncViewportShell);
  }

  function adminKey() {
    try { return sessionStorage.getItem('anton-admin') || ''; } catch (err) { return ''; }
  }
  function captureAdminKey() {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('admin') || '';
    if (!fromUrl) return;
    try { sessionStorage.setItem('anton-admin', fromUrl); } catch (err) { /* private mode */ }
    params.delete('admin');
    const qs = params.toString();
    history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }
  function livePersonaId(vid) {
    const compact = String(vid || '').replace(/[^a-zA-Z0-9]/g, '');
    return 'live-' + (compact || 'anon').slice(0, 16);
  }
  function ensureLiveVisitor() {
    if (ui.admin || ui.present || !syncEnabled()) return;
    const vid = ui.visitorId || visitorId();
    ui.visitorId = vid;
    ui.visitorLive = true;
    ui.role = 'student';
    ui.personaId = livePersonaId(vid);
    const lec = db.lastLecture && db.lastLecture[ui.personaId];
    if (lec) ui.lectureId = lec;
  }
  function markOwner() {
    ui.admin = true;
    ui.role = 'owner';
    ui.visitorLive = false;
  }
  async function claimAdmin() {
    captureAdminKey();
    if (!syncEnabled()) return false;
    const key = adminKey();
    try {
      if (key) {
        const res = await fetch(apiBase() + '/admin/check?key=' + encodeURIComponent(key), { cache: 'no-store' });
        if (res.ok) {
          markOwner();
          return true;
        }
        try { sessionStorage.removeItem('anton-admin'); } catch (err) { /* ignore */ }
      }
      const res = await fetch(apiBase() + '/admin/check', { cache: 'no-store' });
      if (!res.ok) return false;
      markOwner();
      return true;
    } catch (err) {
      return false;
    }
  }
  async function refreshAdmin() {
    if (!ui.admin) return;
    try {
      const key = adminKey();
      const res = await fetch(apiBase() + '/admin/summary' + (key ? ('?key=' + encodeURIComponent(key)) : ''), { cache: 'no-store' });
      ui.adminSummary = res.ok ? await res.json() : { error: true };
    } catch (err) {
      ui.adminSummary = { error: true };
    }
    if (ui.mentorTab === 'admin') render();
  }
  function markPageView() {
    if (ui.admin || ui.present || !syncEnabled()) return;
    try {
      if (sessionStorage.getItem('anton-page-view')) return;
      sessionStorage.setItem('anton-page-view', '1');
    } catch (err) { /* still send */ }
    trackEvent('page_view');
  }
  async function bootHosted() {
    ui.visitorId = visitorId();
    /* /s/{slug} is always the student app — never claim mentor from the admin cookie. */
    const forceStudent = onStudentVanityPath() || (PRESENT && PRESENT_PANE === 'student');
    const admin = forceStudent ? false : await claimAdmin();
    await bootSync();
    if (!admin) ensureLiveVisitor();
    if (forceStudent) {
      ui.admin = false;
      ui.role = 'student';
      ui.visitorLive = true;
    }
    render();
    if (admin) refreshAdmin();
    else markPageView();
    refreshMayarStatus().then(() => {
      if (!mayarReady()) return;
      if (isStaff() && ui.mentorTab === 'harga') render();
      else if (!isStaff() && (ui.tab === 'daftar' || ui.tab === 'home')) render();
    });
    if (isStaff()) {
      refreshWaStatus().then(() => {
        pullWaInbox();
        paintWaChrome();
      });
      ensureWaPoll();
    }
  }
  window.addEventListener('error', (e) => {
    if (ui.admin || ui.present) return;
    postIssue({
      kind: 'error',
      lessonId: ui.lectureId || '',
      body: String((e && e.message) || 'script error').slice(0, 500)
    });
  });
  bootHosted();
})();
