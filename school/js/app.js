/* Sekolah Anton localhost prototype. No live WhatsApp, TikTok, Mayar, or Contabo. */
(function () {
  const SEED = window.ANTON_SEED;
  const KEY = 'anton-school-v3';
  const FIRST_LEC = 'v1';
  const TOOL_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-modals allow-popups';
  const PRESENT_QS = new URLSearchParams(location.search);
  const PRESENT = PRESENT_QS.get('present') === '1';
  const PRESENT_PANE = PRESENT_QS.get('pane') === 'mentor' ? 'mentor' : 'student';
  const BUS = ('BroadcastChannel' in window) ? new BroadcastChannel('anton-school-v3') : null;
  const $ = (id) => document.getElementById(id);
  const ALL_SKUS = () => (SEED.catalog || []).map((p) => p.id);
  const MENTOR_SKUS = () => (SEED.catalog || []).filter((p) => p.includedInMentoring !== false).map((p) => p.id);

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

  function hydrateFunnel(merged) {
    merged.pricing = Object.assign({}, SEED.pricing, merged.pricing || {});
    merged.bank = Object.assign({}, SEED.bank, merged.bank || {});
    merged.dunning = Object.assign({}, SEED.dunning, merged.dunning || {});
    merged.actionPlans = mergeActionPlans(merged.actionPlans);
    merged.pipelineStages = JSON.parse(JSON.stringify(SEED.pipelineStages || []));
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
    merged.applications = Object.assign({}, JSON.parse(JSON.stringify(SEED.applications || {})), merged.applications || {});
    merged.timeline = Object.assign({}, JSON.parse(JSON.stringify(SEED.timelineSeed || {})), merged.timeline || {});
    merged.tasks = Array.isArray(merged.tasks) ? merged.tasks : JSON.parse(JSON.stringify(SEED.tasksSeed || []));
    merged.waQueue = Array.isArray(merged.waQueue) ? merged.waQueue : JSON.parse(JSON.stringify(SEED.waQueueSeed || []));
    merged.emailQueue = Array.isArray(merged.emailQueue) ? merged.emailQueue : JSON.parse(JSON.stringify(SEED.emailQueueSeed || []));
    merged.enrollments = Object.assign({}, JSON.parse(JSON.stringify(SEED.enrollmentsSeed || {})), merged.enrollments || {});
    merged.people = merged.people && typeof merged.people === 'object' ? merged.people : {};
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
      crm: JSON.parse(JSON.stringify(SEED.crm || {})),
      applications: JSON.parse(JSON.stringify(SEED.applications || {})),
      remittances: JSON.parse(JSON.stringify(SEED.remittances || [])),
      tasks: JSON.parse(JSON.stringify(SEED.tasksSeed || [])),
      timeline: JSON.parse(JSON.stringify(SEED.timelineSeed || {})),
      waQueue: JSON.parse(JSON.stringify(SEED.waQueueSeed || [])),
      emailQueue: JSON.parse(JSON.stringify(SEED.emailQueueSeed || [])),
      enrollments: JSON.parse(JSON.stringify(SEED.enrollmentsSeed || {})),
      people: {},
      pricing: JSON.parse(JSON.stringify(SEED.pricing)),
      bank: JSON.parse(JSON.stringify(SEED.bank)),
      dunning: JSON.parse(JSON.stringify(SEED.dunning)),
      actionPlans: JSON.parse(JSON.stringify(SEED.actionPlans)),
      pipelineStages: JSON.parse(JSON.stringify(SEED.pipelineStages)),
      clockOffsetMs: 0,
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
      hydrateFunnel(merged);
      return merged;
    } catch {
      return defaultState();
    }
  }

  let db = load();
  const ui = {
    role: PRESENT && PRESENT_PANE === 'mentor' ? 'owner' : 'student',
    tab: 'home',
    mentorTab: 'siswa',
    personaId: 's-kamu',
    lectureId: db.lastLecture['s-kamu'] || (SEED.lectures[0] && SEED.lectures[0].id),
    pane: 'tanya',
    drawerId: null,
    personId: null,
    siswaView: 'pipa',
    hubBack: 'pipa',
    stageFilter: '',
    queueKind: 'wa',
    taskPerson: '',
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
    skuFrom: 'pustaka',
    editLecId: null,
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
    presentReady: false
  };
  if (PRESENT) document.documentElement.classList.add('present-pane');

  function save() {
    const copy = { ...db, kolab: db.kolab };
    localStorage.setItem(KEY, JSON.stringify(copy));
    if (ui.presentApplying || ui.reloading) return;
    if (BUS) BUS.postMessage({ type: 'db' });
    if (ui.present && ui.presentReady && parent !== window) {
      parent.postMessage({ source: 'anton-school', type: 'live' }, location.origin);
    }
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
    return SEED.students.map((s) => Object.assign({}, s, db.people[s.id] || {}));
  }
  function patchPerson(id, fields) {
    db.people = db.people || {};
    db.people[id] = Object.assign({}, db.people[id] || {}, fields);
  }
  function student() {
    return people().find((s) => s.id === ui.personaId) || people()[0];
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
  function canMentoring(id) {
    const b = billingOf(id);
    if (b.status === 'gratis') return true;
    if (b.plan !== 'mentoring' && b.status !== 'gratis') return false;
    if (b.status === 'belum' || b.status === 'trial') return false;
    if (inGrace(id)) return true;
    if (b.accessUntil && nowMs() >= new Date(b.accessUntil).getTime() + graceMs()) return false;
    return b.status === 'lunas' || b.status === 'cicilan';
  }
  function canPreview(id) {
    if (canMentoring(id)) return false;
    const b = billingOf(id);
    if (b.status === 'trial' || b.plan === 'preview') return true;
    const c = crmOf(id);
    return c.stage === 'trial' || c.stage === 'nonton' || c.stage === 'sudah_keluar';
  }
  function canOpenLecture(id, lid) {
    if (canMentoring(id)) return true;
    if (canPreview(id) && lid === firstLectureId()) return true;
    return false;
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
      '<span>' + p.n + ' / ' + p.total + ' materi · ' + p.pct + '%</span></div>' +
      '<div class="bar kur-bar"><span style="width:' + p.pct + '%"></span></div></div>';
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
    const n = String(phone || '').replace(/\D/g, '');
    return 'https://wa.me/' + n + (text ? ('?text=' + encodeURIComponent(text)) : '');
  }

  function pushTimeline(id, kind, body) {
    db.timeline[id] = db.timeline[id] || [];
    db.timeline[id].unshift({ at: isoNow(), kind: kind, body: body });
  }
  function addTask(personId, title, body, dueAt, kind) {
    const row = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      personId: personId,
      assignee: 'u-anton',
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
        '<div></div></div>' +
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
  const WIZ_FORM = [
    { id: 'name', kicker: 'Kenalan', q: 'Siapa namamu?', sub: 'Nama yang Anton panggil di grup. Bukan tes.' },
    { id: 'wa', kicker: 'Kontak', q: 'Nomor WhatsApp-mu?', sub: 'Anton chat ke sini. Prototype tidak kirim otomatis.' },
    { id: 'shop', kicker: 'Toko', q: 'Sudah punya toko?', sub: 'Belum juga boleh. Jujur aja.' },
    { id: 'city', kicker: 'Tempat', q: 'Kota mana?', sub: 'Biar Anton tahu kamu dari mana.' },
    { id: 'heard', kicker: 'Cerita', q: 'Dari mana kenal Anton?', sub: 'Satu jawaban. Bukan syarat masuk.' }
  ];
  const WIZ_PAY = WIZ_FORM.length;
  const WIZ_TOTAL = WIZ_PAY + 1;

  function isOnboardScreen() {
    return !isStaff() && (needsWizard(ui.personaId) || ui.tab === 'daftar');
  }
  function resetWizForPersona() {
    ui.wizDraft = null;
    ui.wizTools = false;
    ui.wizFocusedStep = null;
    ui.wizStep = db.applications[ui.personaId] ? WIZ_PAY : 0;
  }
  function wizIdx() {
    if (typeof ui.wizStep === 'number') return ui.wizStep;
    return db.applications[ui.personaId] ? WIZ_PAY : 0;
  }
  function wizDraft() {
    const sid = ui.personaId;
    const s = student();
    const app = db.applications[sid] || {};
    const prev = (ui.wizDraft && ui.wizDraft.sid === sid) ? ui.wizDraft : {};
    const heardRaw = prev.heardPick != null || prev.heardOther != null
      ? ''
      : (app.heard || '');
    const known = HEARD_OPTS.indexOf(heardRaw) >= 0;
    const heardPick = prev.heardPick != null
      ? prev.heardPick
      : (known ? heardRaw : (heardRaw ? 'Lainnya' : ''));
    const heardOther = prev.heardOther != null
      ? prev.heardOther
      : (known ? '' : heardRaw);
    const nameSeed = (s.name || '').indexOf('Tamu') >= 0 ? '' : (s.name || '');
    let shopPick = prev.shopPick;
    if (shopPick == null) {
      if (app.hasShop === true) shopPick = 'ya';
      else if (app.at) shopPick = 'tidak';
      else shopPick = '';
    }
    return {
      sid: sid,
      name: prev.name != null ? prev.name : (app.name || nameSeed),
      wa: prev.wa != null ? prev.wa : (app.wa || s.wa || ''),
      shopPick: shopPick,
      shopName: prev.shopName != null ? prev.shopName : (app.shopName || s.shopName || ''),
      shopUrl: prev.shopUrl != null ? prev.shopUrl : (app.shopUrl || s.shopUrl || ''),
      city: prev.city != null ? prev.city : (app.city || (s.city === '—' ? '' : (s.city || ''))),
      heardPick: heardPick,
      heardOther: heardOther
    };
  }
  function wizMerge(patch) {
    ui.wizDraft = Object.assign({}, wizDraft(), patch, { sid: ui.personaId });
  }
  function captureWizFields() {
    const root = document.querySelector('.ob-flow');
    if (!root) return;
    const d = {};
    const name = root.querySelector('[name=name]');
    const wa = root.querySelector('[name=wa]');
    const city = root.querySelector('[name=city]');
    const shopName = root.querySelector('[name=shopName]');
    const shopUrl = root.querySelector('[name=shopUrl]');
    const heardOther = root.querySelector('[name=heardOther]');
    if (name) d.name = String(name.value || '').trim();
    if (wa) d.wa = String(wa.value || '').trim();
    if (city) d.city = String(city.value || '').trim();
    if (shopName) d.shopName = String(shopName.value || '').trim();
    if (shopUrl) d.shopUrl = String(shopUrl.value || '').trim();
    if (heardOther) d.heardOther = String(heardOther.value || '').trim();
    if (Object.keys(d).length) wizMerge(d);
  }
  function wizHeardValue(d) {
    if (d.heardPick === 'Lainnya') return String(d.heardOther || '').trim();
    return String(d.heardPick || '').trim();
  }
  function validateWizStep() {
    const spec = WIZ_FORM[wizIdx()];
    if (!spec) return true;
    const d = wizDraft();
    if (spec.id === 'name' && !d.name) {
      toast('Isi nama dulu.');
      return false;
    }
    if (spec.id === 'wa' && !d.wa) {
      toast('Isi nomor WhatsApp dulu.');
      return false;
    }
    if (spec.id === 'shop') {
      if (d.shopPick !== 'ya' && d.shopPick !== 'tidak') {
        toast('Pilih sudah atau belum.');
        return false;
      }
      if (d.shopPick === 'ya' && (!d.shopName || !d.shopUrl)) {
        toast('Nama toko dan tautan wajib kalau sudah punya toko.');
        return false;
      }
    }
    if (spec.id === 'city' && !d.city) {
      toast('Isi kota dulu.');
      return false;
    }
    if (spec.id === 'heard') {
      if (!d.heardPick) {
        toast('Pilih dari mana kamu kenal Anton.');
        return false;
      }
      if (d.heardPick === 'Lainnya' && !String(d.heardOther || '').trim()) {
        toast('Cerita singkat dari mana, ya.');
        return false;
      }
    }
    return true;
  }
  function commitWizApplication() {
    const d = wizDraft();
    const sid = ui.personaId;
    const s = student();
    const hasShop = d.shopPick === 'ya';
    const heard = wizHeardValue(d);
    if (!d.name || !d.wa || !d.city || !heard) {
      toast('Isi nama, WA, kota, dan dari mana tahu Anton.');
      return false;
    }
    if (hasShop && (!d.shopName || !d.shopUrl)) {
      toast('Nama toko dan tautan wajib kalau sudah punya toko.');
      return false;
    }
    db.applications[sid] = {
      name: d.name,
      wa: d.wa,
      city: d.city,
      hasShop: hasShop,
      shopName: hasShop ? d.shopName : '',
      shopUrl: hasShop ? d.shopUrl : '',
      heard: heard,
      at: isoNow()
    };
    patchPerson(sid, {
      name: d.name,
      wa: String(d.wa).replace(/\D/g, '') || s.wa,
      city: d.city,
      shopName: hasShop ? d.shopName : '',
      shopUrl: hasShop ? d.shopUrl : ''
    });
    const b = billingOf(sid);
    if (!b.offerStartedAt) {
      b.offerStartedAt = isoNow();
      b.offerExpiresAt = addMs(isoNow(), 24 * 36e5);
    }
    setStage(sid, 'form', 'Form masuk. Jam diskon 24 jam dimulai.');
    save();
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
    if (wizIdx() >= WIZ_FORM.length - 1) {
      if (!commitWizApplication()) return;
      ui.wizStep = WIZ_PAY;
      ui.wizFocusedStep = null;
      ui.tab = 'daftar';
      toast('Tersimpan. Lanjut pilih bayar, atau lihat dulu.');
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
    pushTimeline(id, 'stage', note || ('Pindah ke ' + stageLabel(stage)));
  }
  function stageLabel(id) {
    const s = (db.pipelineStages || SEED.pipelineStages).find((x) => x.id === id);
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
    b.note = term === 'autopay' ? 'Kartu autopay (mock)' : ('Transfer · ' + termLabel(term));
    setStage(id, 'mentee', 'Lunas mentoring · ' + term);
    pushTimeline(id, 'pay', 'Bayar ' + fmtRp(amount) + ' · ' + (source || 'transfer'));
    enrollPerson(id, 'onboarding', true);
  }
  function startTrial(id) {
    const b = billingOf(id);
    const start = b.offerStartedAt || isoNow();
    b.status = 'trial';
    b.plan = 'preview';
    b.offerStartedAt = start;
    b.offerExpiresAt = b.offerExpiresAt || addMs(start, 24 * 36e5);
    b.note = 'Bayar nanti · 24 jam';
    setStage(id, 'trial', 'Bayar nanti. Diskon 24 jam dari jam form.');
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
      if ((c.stage === 'trial' || c.stage === 'nonton') && b.offerExpiresAt) {
        const left = hoursLeft(b.offerExpiresAt);
        if (left != null && left <= 12 && left > 0 && !c.wa12Sent) {
          const plan = planById('trial');
          const step = plan && plan.steps.find((x) => x.id === 't12');
          queueWa(s.id, (step && step.title) || '12 jam sisa diskon', (step && step.body) || '', isoNow());
          c.wa12Sent = true;
          pushTimeline(s.id, 'wa', 'Antrian WA: 12 jam sisa harga perkenalan.');
        }
        if (left != null && left <= 0 && c.stage !== 'sudah_keluar' && c.stage !== 'tidak_tertarik' && c.stage !== 'mentee') {
          setStage(s.id, 'sudah_keluar', '24 jam habis, belum bayar → sudah keluar.');
          c.expiredToNurture = true;
        }
      }
      if (c.watchedFirstAt && (c.stage === 'trial' || c.stage === 'nonton') && !c.antonWatchTask) {
        const plan = planById('trial');
        const step = plan && plan.steps.find((x) => x.id === 'twatch');
        addTask(s.id, (step && step.title) || 'Anton WA: sudah nonton, belum bayar', fillTpl((step && step.body) || '', s.id), isoNow());
        c.antonWatchTask = true;
        setStage(s.id, 'nonton', 'Nonton video 1, belum bayar.');
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
          setStage(s.id, 'akan_keluar', 'Peringatan 5 hari.');
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
          setStage(s.id, 'akan_keluar', 'Masa tenggang.');
        }
        if (t >= end + graceMs() && (c.stage === 'akan_keluar' || c.stage === 'mentee' || c.stage === 'perpanjangan' || c.stage === 'grace' || c.stage === 'aktif')) {
          b.status = 'trial';
          b.plan = 'preview';
          setStage(s.id, 'sudah_keluar', 'Akses habis. Kembali ke preview video 1.');
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

  const MAX_VID = 80 * 1024 * 1024;
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
    blobPut(coverKey(kind, id), file).then(() => {
      if (kind === 'week') {
        const w = db.weeks.find((x) => x.id === id);
        if (w) w.coverBlob = true;
      } else {
        const l = lectureById(id);
        if (l) l.coverBlob = true;
      }
      save();
      toast('Cover tersimpan di browser ini.');
      render();
    }).catch(() => toast('Gagal simpan cover.'));
  }
  function ingestResourceFile(file, lecId) {
    if (!file) return;
    if (file.size > MAX_FILE) {
      toast('File maks 20 MB di prototype.');
      return;
    }
    const l = lectureById(lecId);
    if (!l) return;
    l.resources = l.resources || [];
    const n = l.resources.length;
    const blobId = fileKey(lecId, Date.now());
    blobPut(blobId, file).then(() => {
      l.resources.push({ name: file.name, url: '', blob: true, blobId: blobId });
      save();
      toast('File tersimpan di browser ini.');
      render();
    }).catch(() => toast('Gagal simpan file.'));
  }

  function payChip(st) {
    const label = {
      lunas: 'Lunas', cicilan: 'Cicilan', belum: 'Belum bayar', gratis: 'Beasiswa',
      trial: 'Trial', pending: 'Cek transfer'
    }[st] || st;
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
  function photoKey(id) { return 'photo-' + id; }
  function coverKey(kind, id) { return 'cover-' + kind + '-' + id; }
  function fileKey(lecId, n) { return 'file-' + lecId + '-' + n; }
  function avatarHtml(s, cls) {
    const c = cls || 'avatar';
    if (s && s.photoBlob) return '<img class="' + c + '" data-blob="' + esc(photoKey(s.id)) + '" alt="">';
    if (s && s.photoUrl) return '<img class="' + c + '" src="' + esc(s.photoUrl) + '" alt="">';
    return '<span class="' + c + ' avatar-fallback" aria-hidden="true">' + esc(initialsOf(s && s.name)) + '</span>';
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
    return ['#fb923c', '#60a5fa', '#fbbf24', '#34d399', '#a78bfa', '#f472b6', '#22d3ee', '#94a3b8', '#f87171', '#c4b5fd', '#4ade80'][i % 11];
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
    return s.name.toLowerCase().indexOf(q) >= 0 || (s.wa || '').indexOf(q) >= 0 ||
      (s.email || '').toLowerCase().indexOf(q) >= 0 || (s.city || '').toLowerCase().indexOf(q) >= 0 ||
      handle.toLowerCase().indexOf(q) >= 0 || billingOf(s.id).status.indexOf(q) >= 0 ||
      stageLabel(crmOf(s.id).stage).toLowerCase().indexOf(q) >= 0;
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
    if (rec.coverBlob) return '<img class="' + (cls || 'cover-thumb') + '" data-blob="' + esc(coverKey(kind, id)) + '" alt="">';
    if (rec.coverUrl) return '<img class="' + (cls || 'cover-thumb') + '" src="' + esc(rec.coverUrl) + '" alt="">';
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
    if (s.photoBlob && !force) return Promise.resolve(true);
    return fetchTikTokAvatar(s.tiktok).then((blob) => {
      if (!blob) {
        patchPerson(id, { photoFailed: true });
        save();
        return false;
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
    render();
    const s = people().find((x) => x.id === id);
    if (s && s.tiktok && !s.photoBlob) {
      refreshPersonPhoto(id, false).then((ok) => { if (ok) render(); });
    }
  }
  function closePerson() {
    ui.personId = null;
    ui.mentorTab = 'siswa';
    ui.siswaView = ui.hubBack || ui.siswaView || 'pipa';
    render();
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
    const mode = isStaff() ? 'mentor' : 'student';
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.plan = isStaff()
      ? 'mentor'
      : (canMentoring(ui.personaId) ? 'mentoring' : (canPreview(ui.personaId) ? 'trial' : (billingOf(ui.personaId).products.length ? 'sku' : 'none')));
    $('app').classList.toggle('is-mentor', isStaff());
    $('app').classList.toggle('is-student', !isStaff());
    $('app').classList.toggle('is-onboard', isOnboardScreen());
    $('school-name').textContent = SEED.school.name;
    const logo = $('school-logo');
    if (logo) {
      logo.src = SEED.school.photo || SEED.school.logo;
      logo.alt = SEED.school.name;
    }
    const badge = document.querySelector('.off-badge');
    if (badge) badge.textContent = ui.present ? 'Offline · demo' : 'Offline · jangan deploy';
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
    pers.hidden = isStaff();
    ui.chromeSync = false;
    const clock = $('clock-bar');
    if (clock) {
      clock.hidden = !isStaff();
      if (isStaff()) {
        clock.innerHTML =
          '<span class="muted">Simulasi jam: <strong>' + esc(fmtWhen(isoNow())) + '</strong></span>' +
          '<button type="button" class="ghost" data-act="clock" data-ms="3600000">+1 jam</button>' +
          '<button type="button" class="ghost" data-act="clock" data-ms="43200000">+12 jam</button>' +
          '<button type="button" class="ghost" data-act="clock" data-ms="86400000">+1 hari</button>' +
          '<button type="button" class="ghost" data-act="clock-reset">Reset jam</button>' +
          '<span class="muted">Tugas ' + db.tasks.filter((t) => !t.done).length +
          ' · antrian ' + ((db.waQueue.filter((w) => w.status === 'queued').length) + ((db.emailQueue || []).filter((w) => w.status === 'queued').length)) + '</span>';
      }
    }
    if (!isStaff()) {
      const allowed = studentTabs().map((t) => t.id).concat(['sku', 'alat', 'daftar', 'tes', 'sertifikat']);
      if (needsWizard(ui.personaId) && ui.tab !== 'daftar') ui.tab = 'daftar';
      if (allowed.indexOf(ui.tab) === -1) ui.tab = 'home';
    }
    renderTabs();
  }

  function studentTabs() {
    if (canMentoring(ui.personaId) || canPreview(ui.personaId)) {
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
      { id: 'tugas', label: 'Tugas' },
      { id: 'otomasi', label: 'Otomasi' },
      { id: 'jaringan', label: 'Jaringan' },
      { id: 'kurikulum', label: 'Kurikulum' },
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
      const sku = ui.tab === 'sku' ? productById(ui.skuId) : null;
      const skuTab = ui.skuFrom || (sku && sku.group === 'alat' ? 'alat' : 'pustaka');
      if (isOnboardScreen()) {
        dock.hidden = true;
        dock.className = 'dock';
        dock.innerHTML = '';
      } else {
        dock.hidden = false;
        dock.className = 'dock cols-' + tabs.length;
        dock.innerHTML = tabs.map((t) =>
          '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' +
          (t.id === ui.tab || (ui.tab === 'sku' && t.id === skuTab)) + '">' + esc(t.label) + '</button>'
        ).join('');
      }
    } else {
      dock.hidden = true;
      dock.className = 'dock';
    }
  }

  function render() {
    fillChrome();
    const main = $('main');
    if (isStaff()) {
      const tab = normalizeMentorTab(ui.mentorTab);
      ui.mentorTab = tab;
      if (tab === 'siswa') main.innerHTML = viewSiswaHub();
      else if (tab === 'orang') main.innerHTML = viewPerson(ui.personId);
      else if (tab === 'tugas') main.innerHTML = viewTugas();
      else if (tab === 'otomasi') main.innerHTML = viewOtomasi();
      else if (tab === 'jaringan') main.innerHTML = viewJaringan();
      else if (tab === 'kurikulum') main.innerHTML = viewKurikulum();
      else if (tab === 'pustaka') main.innerHTML = viewPustaka();
      else if (tab === 'jadwal') main.innerHTML = viewJadwal(true);
      else if (tab === 'diskusi') main.innerHTML = viewDiskusi(true);
      else if (tab === 'harga' && canBill()) main.innerHTML = viewHarga();
      else main.innerHTML = viewSiswaHub();
    } else {
      if (needsWizard(ui.personaId) || ui.tab === 'daftar') {
        main.innerHTML = viewWizard();
      } else {
        const tab = ui.tab;
        if (tab === 'home') main.innerHTML = viewHome();
        else if (tab === 'belajar') main.innerHTML = viewBelajar();
        else if (tab === 'alat') main.innerHTML = viewAlat();
        else if (tab === 'pustaka') main.innerHTML = viewStudentPustaka();
        else if (tab === 'sku') main.innerHTML = viewSkuPage();
        else if (tab === 'diskusi') main.innerHTML = canMentoring(ui.personaId) ? viewDiskusi(false) : viewLockedDiskusi();
        else if (tab === 'progres') main.innerHTML = viewProgres();
        else if (tab === 'kolab') main.innerHTML = viewKolab();
        else if (tab === 'tes') main.innerHTML = viewExam();
        else if (tab === 'sertifikat') main.innerHTML = viewSertifikat(ui.personaId);
        else main.innerHTML = viewHome();
      }
    }
    bindLazy();
    bindBlobMedia();
    bindKanbanDnD();
    bindKurDnD();
    focusWiz();
    placeWaFab();
    tickRemainers();
    ensureRemainTimer();
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
    if (tab === 'bayar') {
      ui.siswaView = 'daftar';
      return 'siswa';
    }
    return tab || 'siswa';
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
  }

  /* ── student views ───────────────────────────────────────────────── */
  function offerBanner(sid) {
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
    const anton = SEED.staff.find((s) => s.id === 'u-anton') || { wa: '628111000001' };
    const s = student();
    const text = 'Halo Anton, saya ' + (s.name || 'siswa') + ' dari Sekolah Anton.';
    return '<a class="wa-fab" href="' + esc(waLink(anton.wa, text)) + '" target="_blank" rel="noopener" aria-label="WhatsApp Anton">' +
      '<span class="wa-fab-ico" aria-hidden="true">' + waFabIcon() + '</span>' +
      '<span>WA Anton</span></a>';
  }
  function placeWaFab() {
    let host = document.getElementById('wa-fab-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'wa-fab-host';
      document.body.appendChild(host);
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
      return '<button class="btn" data-act="open-sku" data-from="' + (extraClass || 'pustaka') + '" data-id="' + esc(p.id) + '">Buka</button>';
    }
    if (canMentoring(sid) && bundled(p)) {
      return '<button class="btn" data-act="claim-tool" data-from="' + (extraClass || 'pustaka') + '" data-id="' + esc(p.id) + '">Ambil −' + toolDiscountPct() + '%</button>' +
        '<a class="btn secondary" href="' + esc(p.lynk || SEED.school.lynk) + '" target="_blank" rel="noopener">Harga satuan</a>';
    }
    const mentorLine = bundled(p)
      ? '<button class="btn secondary" data-act="tab" data-id="daftar">Ikut mentoring, −' + toolDiscountPct() + '% alat</button>'
      : '<span class="muted">Tidak termasuk mentoring. Harga satuan.</span>';
    return '<a class="btn" href="' + esc(p.lynk || SEED.school.lynk) + '" target="_blank" rel="noopener">Beli satuan</a>' + mentorLine +
      '<button class="btn secondary" data-act="contoh-sku" data-from="' + (extraClass || 'pustaka') + '" data-id="' + esc(p.id) + '">Lihat contoh</button>';
  }
  function obChrome(step) {
    const back = step > 0
      ? '<button type="button" class="ob-back" data-act="wiz-back" aria-label="Kembali">‹</button>'
      : '<span class="ob-back is-ghost" aria-hidden="true"></span>';
    let segs = '';
    for (let i = 0; i < WIZ_TOTAL; i += 1) {
      segs += '<i' + (i <= step ? ' class="is-on"' : '') + '></i>';
    }
    return '<header class="ob-top">' + back +
      '<div class="ob-segs" role="progressbar" aria-valuemin="1" aria-valuemax="' + WIZ_TOTAL +
      '" aria-valuenow="' + (step + 1) + '" aria-label="Langkah ' + (step + 1) + ' dari ' + WIZ_TOTAL + '">' +
      segs + '</div></header>';
  }
  function obWrap(step, inner, foot, pay) {
    return '<section class="ob-flow' + (pay ? ' is-pay' : '') + '">' + obChrome(step) +
      '<div class="ob-body">' + inner + '</div>' +
      '<div class="ob-foot' + (pay ? ' is-end' : '') + '">' + foot + '</div></section>';
  }
  function viewWizard() {
    const step = wizIdx();
    const wantPay = step >= WIZ_PAY || (wizardStep(ui.personaId) === 'pay' && ui.wizStep == null);
    if (wantPay) {
      if (!db.applications[ui.personaId]) {
        ui.wizStep = Math.min(typeof ui.wizStep === 'number' ? ui.wizStep : WIZ_FORM.length - 1, WIZ_FORM.length - 1);
        if (ui.wizStep >= WIZ_PAY) ui.wizStep = WIZ_FORM.length - 1;
        ui.wizFocusedStep = null;
        return viewWizForm(ui.wizStep);
      }
      return viewPayPage(ui.personaId);
    }
    return viewWizForm(step);
  }
  function viewWizForm(step) {
    const spec = WIZ_FORM[step] || WIZ_FORM[0];
    const d = wizDraft();
    const last = step >= WIZ_FORM.length - 1;
    let fields = '';
    if (spec.id === 'name') {
      fields = '<input class="ob-input" data-focus="1" name="name" maxlength="80" autocomplete="name" value="' +
        esc(d.name) + '" placeholder="Nama kamu">';
    } else if (spec.id === 'wa') {
      fields = '<input class="ob-input" data-focus="1" name="wa" type="tel" inputmode="numeric" autocomplete="tel" value="' +
        esc(d.wa) + '" placeholder="08… atau 628…">';
    } else if (spec.id === 'shop') {
      fields = '<div class="ob-pills" role="group" aria-label="Sudah punya toko">' +
        '<button type="button" class="ob-pill' + (d.shopPick === 'tidak' ? ' is-on' : '') + '" data-act="wiz-shop" data-id="tidak">Belum, masih mau mulai</button>' +
        '<button type="button" class="ob-pill' + (d.shopPick === 'ya' ? ' is-on' : '') + '" data-act="wiz-shop" data-id="ya">Sudah punya toko</button>' +
        '</div>' +
        (d.shopPick === 'ya'
          ? '<div class="ob-extra">' +
            '<input class="ob-input" data-focus="1" name="shopName" maxlength="80" value="' + esc(d.shopName) + '" placeholder="Nama toko">' +
            '<input class="ob-input" name="shopUrl" inputmode="url" autocomplete="url" value="' + esc(d.shopUrl) + '" placeholder="https://…">' +
            '</div>'
          : '');
    } else if (spec.id === 'city') {
      fields = '<input class="ob-input" data-focus="1" name="city" maxlength="60" autocomplete="address-level2" value="' +
        esc(d.city) + '" placeholder="Kota">';
    } else {
      fields = '<div class="ob-pills" role="group" aria-label="Dari mana kenal Anton">' +
        HEARD_OPTS.map((opt) =>
          '<button type="button" class="ob-pill' + (d.heardPick === opt ? ' is-on' : '') +
          '" data-act="wiz-heard" data-id="' + esc(opt) + '">' + esc(opt) + '</button>'
        ).join('') + '</div>' +
        (d.heardPick === 'Lainnya'
          ? '<input class="ob-input ob-extra" data-focus="1" name="heardOther" maxlength="120" value="' +
            esc(d.heardOther) + '" placeholder="Dari mana, singkat saja">'
          : '');
    }
    return obWrap(step,
      '<p class="ob-kicker">' + esc(spec.kicker) + '</p>' +
      '<h1 class="ob-q">' + esc(spec.q) + '</h1>' +
      '<p class="ob-sub">' + spec.sub + '</p>' +
      '<form id="ob-form" data-act="wiz-next">' + fields + '</form>',
      '<button class="btn ob-cta" type="button" data-act="wiz-next">' + (last ? 'Lihat paket' : 'Lanjut') + '</button>'
    );
  }
  function viewPayPage(sid) {
    const welcome = welcomeOpen(sid) || !billingOf(sid).offerExpiresAt;
    const b = billingOf(sid);
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
      '<p class="ob-sub">Bayar ke rekening Anton. LarisID tidak menahan uang. Tidak ada sisa kursi.</p>' +
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
        '<div class="ob-pay-ways">' +
          '<div class="ob-qris" aria-label="Contoh QRIS">' +
            qrisPlaceholderSvg() +
            '<span class="ob-qris-badge">QRIS · contoh</span>' +
            '<span class="ob-qris-nm">' + esc(db.bank.name) + '</span>' +
            '<span class="muted">Placeholder — bukan kode bayar sungguhan</span>' +
          '</div>' +
          '<div class="ob-tf">' +
            '<p class="ob-tf-kicker">Atau transfer bank</p>' +
            '<p><strong>' + esc(db.bank.bank) + '</strong> ' + esc(db.bank.number) + '<br>a.n. ' + esc(db.bank.name) + '</p>' +
            '<p class="muted">Jumlah sekarang: <strong>' + fmtRp(price) + '</strong>' +
            (price < list ? ' <span class="price-coret">' + fmtRp(list) + '</span>' : '') +
            ' · ' + esc(termLabel(term)) + '</p>' +
            '<p class="muted">Kartu autopay = mock Mayar. Prototype tidak menagih sungguhan.</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    const foot =
      '<button class="btn ob-cta" data-act="pay-now" data-term="' + esc(term) + '">' +
      (term === 'autopay' ? 'Bayar kartu (mock)' : 'Saya sudah transfer / scan') + '</button>' +
      '<button type="button" class="btn secondary ob-cta" data-act="pay-later">Bayar nanti, lihat dulu</button>' +
      '<p class="ob-look-hint">Home kelihatan utuh. Hanya video 1 + lembar kerja yang kebuka.</p>' +
      '<button type="button" class="ob-text" data-act="not-interested">Tidak tertarik</button>';
    return obWrap(WIZ_PAY, inner, foot, true);
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
        '<section class="card resume">' +
          '<p class="muted">' + (preview ? 'Coba video 1' : 'Lanjutkan') + '</p>' +
          '<h2>' + esc(last.title) + '</h2>' +
          '<p class="muted">' + esc(typeLabel(last.type)) + ' · ' + kurProgress(s.id).n + '/' + kurProgress(s.id).total + ' video' +
          (preview ? ' · video lain terkunci sampai lunas' : '') + '</p>' +
          progressBarHtml(s.id) +
          '<button class="btn" data-act="open-lec" data-id="' + esc(last.id) + '">Buka materi</button>' +
        '</section>' +
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
          '<a class="wa" href="' + esc(waLink(SEED.staff[0].wa, 'Halo Anton, mau ikut mentoring. Saya sudah cek lynk.id/obrolan.marketing')) + '" target="_blank" rel="noopener">Chat Anton di WA</a>' +
          '<a class="btn secondary" href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">Buka lynk.id</a>' +
        '</div>' +
        '<p class="muted" style="margin-top:10px">' + payChip(b.status) +
          (b.note ? ' · ' + esc(b.note) : ' · belum mentoring') + '</p>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn" data-act="tab" data-id="daftar">Isi form mentoring</button>' +
        '</div>' +
      '</section>';
  }

  function weekList(sid, weekId) {
    return '<ul class="list-check">' + lecturesInWeek(weekId).map((l) => {
      const locked = !canOpenLecture(sid, l.id) && !isStaff();
      return '<li class="' + (locked ? 'is-locked' : '') + '"><span>' +
        (isDone(sid, l.id) ? '<span class="tick-ok" aria-hidden="true">✓</span> ' : '<span class="tick-off" aria-hidden="true"></span> ') +
        '<span class="' + (locked ? 'list-blur' : '') + '">' + esc(l.title) + '</span>' +
        (locked ? ' <span class="chip">Terkunci</span>' : '') + '</span>' +
        '<button class="btn-sm" data-act="open-lec" data-id="' + esc(l.id) + '">' +
        (locked ? 'Lihat' : 'Buka') + '</button></li>';
    }).join('') + '</ul>';
  }

  function viewLocked() {
    return '<div class="locked">' +
      '<h2>Live class terkunci</h2>' +
      '<p class="muted">Belajar, Diskusi, dan Kolab hanya untuk yang ikut mentoring. Produk lynk tetap bisa dibeli satuan di Pustaka. Anton merchant — LarisID tidak menahan uang.</p>' +
      '<div class="row" style="justify-content:center">' +
        '<button class="btn" data-act="tab" data-id="daftar">Ikut mentoring</button>' +
        '<a class="wa" href="' + esc(waLink(SEED.staff[0].wa, 'Halo Anton, mau konfirmasi mentoring / produk lynk.')) + '" target="_blank" rel="noopener">Chat Anton</a>' +
        '<a class="btn secondary" href="' + esc(SEED.school.lynk) + '" target="_blank" rel="noopener">lynk.id</a>' +
      '</div></div>';
  }
  function viewLockedDiskusi() {
    return '<div class="locked">' +
      '<h2>Diskusi untuk yang lunas</h2>' +
      '<p class="muted">Trial hanya video 1. Tanya di materi itu tetap ada. Forum kelas dan live class setelah bayar.</p>' +
      '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button></div>';
  }

  function viewBelajar() {
    if (!canMentoring(ui.personaId) && !canPreview(ui.personaId)) return viewLocked();
    const preview = canPreview(ui.personaId) && !canMentoring(ui.personaId);
    const lec = lectureById(ui.lectureId) || lectures()[0];
    ui.lectureId = lec.id;
    const lockedNow = !canOpenLecture(ui.personaId, lec.id) && !isStaff();
    const payStrip = preview ? offerBanner(ui.personaId) : '';
    if (lockedNow) {
      return '<div class="player-layout">' +
        '<div>' + payStrip + progressBarHtml(ui.personaId) +
        '<button type="button" class="kur-toggle" data-act="toggle-kur">' +
        (ui.kurOpen ? 'Tutup kurikulum' : 'Kurikulum · lihat semua') + '</button>' +
        '<div class="locked-blur-card">' +
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
            '<p class="muted">Kurikulum kelihatan semua. Video 1 + checklist gratis di trial. Sisanya setelah mentoring lunas.</p>' +
            '<button class="btn" data-act="open-lec" data-id="' + esc(firstLectureId()) + '">Ke video selamat datang</button>' +
            '<button class="btn secondary" data-act="tab" data-id="daftar">Bayar mentoring</button>' +
          '</div></div></div>' +
        '<aside class="kurikulum-pane' + (ui.kurOpen ? ' is-open' : '') + '">' + renderKurikulumSidebar() + '</aside></div>';
    }
    const inner = lec.tool === 'kolab'
      ? viewKolab()
      : renderCanvas(lec) + renderLecAfter(lec) + payAfterFirst(lec) + renderPanes(lec);
    return '<div class="player-layout">' +
      '<div>' +
        payStrip +
        progressBarHtml(ui.personaId) +
        '<button type="button" class="kur-toggle" data-act="toggle-kur">' +
        (ui.kurOpen ? 'Tutup kurikulum' : 'Kurikulum · ' + kurProgress(ui.personaId).pct + '%') + '</button>' +
        inner + '</div>' +
      '<aside class="kurikulum-pane' + (ui.kurOpen ? ' is-open' : '') + '">' +
        renderKurikulumSidebar() + '</aside>' +
      '</div>';
  }
  function payAfterFirst(lec) {
    if (lec.id !== firstLectureId()) return '';
    if (canMentoring(ui.personaId)) return '';
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
        '<button class="btn secondary" data-act="not-interested">Tidak tertarik</button>' +
      '</div></section>';
  }

  function renderCanvas(lec) {
    let body = '';
    const cover = coverHtml('lec', lec.id, 'lec-poster');
    if (lec.type === 'video') {
      if (lec.videoBlob) {
        body = (cover || '') + '<video class="lec-video" controls playsinline preload="metadata" data-blob="' + esc(lec.id) + '"></video>';
      } else {
        const e = parseEmbed(lec.url);
        if (e && e.embed) {
          body = '<div class="lazy-embed" data-embed="' + esc(e.embed) + '">' +
            (cover || '') +
            '<div class="play-orb">▶</div>' +
            '<div class="lazy-note">Ketuk untuk memuat · ' + (e.kind === 'drive' ? 'Google Drive' : 'hemat data') + '</div></div>';
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
      let src = lec.iframe || '';
      const sku = lec.skuId ? productById(lec.skuId) : null;
      if (sku && sku.example && src) src += (src.indexOf('?') >= 0 ? '&' : '?') + 'contoh=1';
      body = '<iframe class="tool-frame" sandbox="' + TOOL_SANDBOX + '" src="' + esc(src) + '" title="' + esc(lec.title) + '"></iframe>';
    } else if (lec.type === 'document') {
      body = '<div class="article">' + (cover || '') + '<h3>' + esc(lec.title) + '</h3>' +
        ((lec.resources || []).length ? resourceListHtml(lec) : '<p>File kelas: <a href="' + esc(lec.url || '#') + '" target="_blank" rel="noopener">' + esc(lec.title) + '</a></p>') +
        '<p class="muted">Prototype. Produksi nanti: bucket cohort-docs.</p></div>';
    } else {
      body = '<div class="article">' + (cover || '') + '<h3>' + esc(lec.title) + '</h3>' + mdish(lec.body || '') + '</div>';
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
            ? '<details><summary>Arah jawaban (contoh)</summary><p class="muted">' + esc(q.hint) + '</p></details>'
            : '') +
          '</div>'
        ).join('') +
        '<p class="muted">Bukan ujian — tidak ada skor. Tandai selesai setelah nonton dan baca.</p></div>';
    }
    return html;
  }

  function renderKurikulumSidebar(sid, opts) {
    sid = sid || ui.personaId;
    opts = opts || {};
    const preview = !!opts.preview;
    const currentId = preview ? (ui.kurPreviewLec || '') : ui.lectureId;
    let n = 0;
    return progressBarHtml(sid) + db.weeks.map((w) => {
      const items = lecturesInWeek(w.id).map((l) => {
        n += 1;
        const cur = l.id === currentId;
        const locked = preview ? !canOpenLecture(sid, l.id) : (!isStaff() && !canOpenLecture(sid, l.id));
        const thumb = coverHtml('lec', l.id, 'cover-mini');
        const act = preview ? 'kur-prev-lec' : 'open-lec';
        return '<button type="button" class="lec' + (cur ? ' current' : '') + (locked ? ' locked' : '') + '" data-act="' +
          act + '" data-id="' + esc(l.id) + '">' +
          '<span class="lec-face' + (locked ? ' is-blur' : '') + '">' +
            (thumb || '<span class="mark' + (isDone(sid, l.id) ? ' done' : '') + '" aria-hidden="true">' +
            (isDone(sid, l.id) ? '✓' : '') + '</span>') +
            '<span><div class="t">' + n + '. ' + esc(l.title) + '</div>' +
            '<div class="m">' + esc(typeLabel(l.type)) + ' · ' + esc(l.mins) + ' mnt' +
            (l.requiredBefore ? ' · wajib' : '') + '</div></span>' +
          '</span>' +
          (locked ? '<span class="lec-lock">Terkunci</span>' : '') +
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
    return (people().find((s) => s.id === id) || SEED.staff.find((s) => s.id === id) || { name: id }).name;
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
    return '<div class="card tool-tile sku">' +
      skuCoverHtml(p) +
      '<div class="sku-body">' +
      (owned ? '<span class="chip lunas">Punya</span>' : '<span class="chip">Satuan</span>') +
      (!bundled(p) ? ' <span class="chip warn">Bukan mentoring</span>' : '') +
      (p.example ? ' <span class="chip warn">Contoh</span>' : '') +
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
    return { calc: 'Kalkulator harga', 'ai-creative': 'AI Creative', 'ai-data': 'AI Analisa', 'laris-aff': 'Laris Affiliate' }[p.id] || p.title;
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
      '<p class="muted">Kalkulator, AI, Kolab. Mentoring: alat −' + toolDiscountPct() + '%. Laris Affiliate selalu terpisah.</p>' +
      '<div class="alat-pick">' + tiles + kolab + '</div></section>';
  }

  function viewAlat() {
    const sid = ui.personaId;
    const tools = toolsCatalog();
    let html = '<h2 style="margin:0 0 4px">Alat</h2>' +
      '<p class="muted" style="margin:0 0 14px">Mentoring: alat −' + toolDiscountPct() + '% dari harga satuan. Laris Affiliate selalu satuan.</p>' +
      '<div class="alat-list">';
    html += tools.map((p) => {
      const owned = canSku(sid, p.id);
      return '<div class="card alat-row">' +
        '<div class="sku-body">' +
        (owned ? '<span class="chip lunas">Bisa dipakai</span>' : '<span class="chip">Terkunci</span>') +
        (p.example ? ' <span class="chip warn">Contoh</span>' : '') +
        '<h3>' + esc(alatName(p)) + '</h3>' +
        (!bundled(p) ? '<p class="muted">Tidak termasuk mentoring.</p>' : '') +
        '<p class="muted">' + esc(p.job) + '</p></div>' +
        '<div class="alat-row-act">' + dualCta(p, 'alat') + '</div></div>';
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
        '<p class="muted">Mentoring membuka live class + alat lynk. Laris Affiliate tetap satuan.</p></section>';
    }
    const hadir = hadirPct(sid);
    const p = kurProgress(sid);
    const kolabOpened = !!(db.kolab[sid] && db.kolab[sid].jobs && db.kolab[sid].jobs.length);
    const c = crmOf(sid);
    const doneAll = p.n >= p.total && p.total > 0;
    return '<div class="grid-2">' +
      '<section class="card"><h2>Checklist</h2>' +
        progressBarHtml(sid) +
        db.weeks.map((w) => '<h3>' + esc(w.title) + ' · ' + progressPct(sid, w.id) + '%</h3>' + weekList(sid, w.id)).join('') +
      '</section>' +
      '<section class="card">' +
        '<h2>Status</h2>' +
        '<p>Kurikulum: <strong>' + p.n + ' / ' + p.total + '</strong> · ' + p.pct + '%</p>' +
        '<p>Hadir: <strong>' + hadir + '%</strong></p>' +
        '<p>Bayar: ' + payChip(bill.status) + ' <span class="muted">' + esc(bill.note || bill.plan || '') +
        (bill.accessUntil ? ' · sampai ' + fmtWhen(bill.accessUntil) : '') + '</span></p>' +
        '<h3 style="margin-top:16px">Lencana (kejadian nyata)</h3>' +
        '<p class="muted">' +
          (isDone(sid, firstLectureId()) ? '✓ Masuk kelas. ' : 'Belum mulai. ') +
          (kolabOpened ? '✓ Antri Kolab. ' : '') +
          (hadir >= 50 ? '✓ Hadir ≥ setengah sesi.' : 'Hadir masih di bawah setengah sesi.') +
        '</p>' +
        (doneAll && !c.examScore
          ? '<h3 style="margin-top:16px">Tes akhir</h3><p class="muted">Satu duduk. Lulus = sertifikat. Bukan mesin kuis Canvas.</p>' +
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
            (db.pricing.overridePct || 20) + '% licensing</strong> dari pendapatan mentoring + alat + Laris Affiliate yang kamu jual. Satu tingkat, bukan piramida rekrut. Tidak ada bonus karena mengajak orang.</p>' +
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
      '<h2>Sekolah Anton</h2>' +
      '<p>Menerangkan bahwa</p>' +
      '<h3>' + esc(s.name) + '</h3>' +
      '<p>menyelesaikan kurikulum mentoring dan lulus tes akhir (' + esc(c.examScore) + '/' + SEED.exam.questions.length + ').</p>' +
      '<p class="muted">Diterbitkan ' + fmtWhen(c.examAt) + '. Pengakuan prestasi nyata — bukan kelangkaan palsu.</p>' +
      (c.eligibleMentor ? '<p>Status: layak diajukan jadi mentor (licensing 20% disampaikan sebelum terima).</p>' : '') +
      '<button class="btn secondary" data-act="print-cert">Cetak / PDF</button></section>';
  }

  /* ── mentor views ────────────────────────────────────────────────── */
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
  function viewSiswaHub() {
    const cam = ui.siswaView || 'pipa';
    const q = (ui.filterSiswa || ui.crmFilter || '').toLowerCase();
    const head = '<div class="hub-head">' +
      '<div><h2 style="margin:0">Siswa · ' + esc(SEED.cohort.name) + '</h2>' +
        '<p class="muted">Klik nama = profil. Geser kartu di Pipa.</p></div>' +
      '<input placeholder="Cari orang…" value="' + esc(q) + '" data-act="filter-siswa" style="max-width:260px;padding:8px 12px;border:1px solid var(--line);border-radius:10px">' +
      '</div>' + hubSeg();
    if (cam === 'daftar') return head + viewSiswaDaftar(q);
    if (cam === 'progres') return head + viewMentorProgres();
    return head + viewCrm(q);
  }
  function stageTabsHtml(q) {
    const stages = db.pipelineStages || SEED.pipelineStages;
    const all = people().filter((s) => matchPerson(s, q));
    const cur = ui.stageFilter || '';
    const chip = (id, label, n) =>
      '<button type="button" data-act="stage-filter" data-id="' + esc(id) + '" aria-selected="' + (cur === id) + '">' +
        esc(label) + (n ? ' (' + n + ')' : '') + '</button>';
    return '<div class="stage-tabs">' +
      chip('', 'Semua', all.length) +
      stages.map((st) => chip(st.id, st.label, all.filter((s) => crmOf(s.id).stage === st.id).length)).join('') +
      '</div>';
  }
  function viewSiswaDaftar(q) {
    const stage = ui.stageFilter || '';
    const rows = people().filter((s) => {
      if (stage && crmOf(s.id).stage !== stage) return false;
      return matchPerson(s, q);
    });
    return stageTabsHtml(q) +
      '<div class="fub-list">' +
      '<div class="fub-toolbar"><span class="muted">Menampilkan ' + rows.length + ' orang</span>' +
        '<span class="muted">Klik baris untuk profil · bayar di kolom</span></div>' +
      '<table class="table roster"><thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Stage</th><th>Bayar</th><th>Nilai</th></tr></thead><tbody>' +
      (rows.length ? rows.map((s) => {
        const b = billingOf(s.id);
        const c = crmOf(s.id);
        const tags = (s.tags || []).slice(0, 3);
        return '<tr class="roster-row" data-act="open-student" data-id="' + esc(s.id) + '">' +
          '<td><button type="button" class="linkish roster-name" data-act="open-student" data-id="' + esc(s.id) + '">' +
            avatarHtml(s, 'avatar sm') + '<span>' + esc(s.name) +
            '<div class="muted">' + esc(s.city || '—') +
            (tags.length ? ' · ' + tags.map((t) => esc(t)).join(', ') : '') + '</div></span></button></td>' +
          '<td>' + (s.wa
            ? '<a class="fub-cell-link" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', dari Sekolah Anton.')) + '" target="_blank" rel="noopener">' + esc(fmtPhone(s.wa)) + '</a>'
            : '<span class="muted">—</span>') + '</td>' +
          '<td>' + (s.email
            ? '<a class="fub-cell-link" href="' + esc(mailLink(s.email, 'Sekolah Anton', 'Halo ' + s.name)) + '">' + esc(s.email) + '</a>'
            : '<span class="muted">—</span>') + '</td>' +
          '<td>' + esc(stageLabel(c.stage)) + '</td>' +
          '<td>' + (canBill() ? billStatusSelect(s.id, b) : payChip(b.status)) + '</td>' +
          '<td class="money">' + (canBill()
            ? billAmountInput(s.id, b)
            : (b.amount ? esc(fmtRp(b.amount)) : '—')) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">Tidak ada orang di filter ini.</td></tr>') +
      '</tbody></table></div>';
  }
  function viewCrm(q) {
    q = (q != null ? q : ui.crmFilter || '').toLowerCase();
    const stages = db.pipelineStages || SEED.pipelineStages;
    const cols = stages.map((st, i) => {
      const rows = people().filter((s) => {
        const stage = crmOf(s.id).stage || 'wa_baru';
        if (stage !== st.id) return false;
        return matchPerson(s, q);
      });
      const sum = rows.reduce((n, s) => n + (Number(billingOf(s.id).amount) || 0), 0);
      return '<div class="kanban-col" data-stage="' + esc(st.id) + '" style="border-top-color:' + stageHue(i) + '">' +
        '<div class="kanban-col-head"><h3>' + esc(st.label) + '</h3>' +
          '<div class="muted">' + rows.length + ' orang · ' + (sum ? fmtRp(sum) : 'Rp0') + '</div></div>' +
        (rows.length ? rows.map((s) => {
          const b = billingOf(s.id);
          return '<button type="button" class="kanban-card" draggable="true" data-act="open-student" data-id="' + esc(s.id) + '">' +
            '<div class="roster-name">' + avatarHtml(s, 'avatar sm') + '<strong>' + esc(s.name) + '</strong></div>' +
            '<div class="muted">' + esc(s.city) + (s.mentorId && s.mentorId !== 'u-anton' ? ' · ' + esc(nameOf(s.mentorId)) : '') + '</div>' +
            (b.amount ? '<div class="money">' + esc(fmtRp(b.amount)) + '</div>' : '') +
            '<div>' + payChip(b.status) + ' <span class="muted">' + esc(fmtRemain(b.offerExpiresAt || b.accessUntil)) + '</span></div>' +
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
    const list = db.tasks.concat(queuedItems()).filter((t) => !pid || t.personId === pid);
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
      action = '<a class="btn-sm" href="' + esc(waLink(s.wa, t.body)) + '" target="_blank" rel="noopener">Buka WA</a>' +
        '<button class="btn-sm" data-act="wa-sent" data-id="' + esc(t.id) + '">Tandai dikirim</button>';
    } else if (t.queue === 'email') {
      action = '<a class="btn-sm" href="' + esc(mailLink(s.email, t.title, t.body)) + '">mailto</a>' +
        '<button class="btn-sm" data-act="em-sent" data-id="' + esc(t.id) + '">Tandai dikirim</button>';
    } else if (!t.done) {
      if (kind === 'wa') action += '<a class="btn-sm" href="' + esc(waLink(s.wa, t.body)) + '" target="_blank" rel="noopener">Buka WA</a>';
      if (kind === 'email') action += '<a class="btn-sm" href="' + esc(mailLink(s.email, t.title, t.body)) + '">Email</a>';
      if (kind === 'call' && s.wa) action += '<a class="btn-sm" href="tel:+' + esc(String(s.wa).replace(/\D/g, '')) + '">Telepon</a>';
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
        '<div><h2 style="margin:0">Tugas</h2><p class="muted" style="margin:4px 0 0">Hari ini, besok, minggu ini. Klik nama untuk profil. Antrian WA/email ikut di sini.</p></div>' +
        '<button type="button" class="btn" data-act="task-compose" data-id="new">' + (open ? 'Tutup' : '+ Tugas') + '</button>' +
      '</div>' +
      (open ? '<div class="card" style="margin-bottom:14px"><h3>Buat tugas</h3>' + taskComposerHtml('') + '</div>' : '') +
      '<div class="row" style="margin-bottom:12px">' +
        '<label class="muted">Filter orang <select data-act="task-person">' +
          '<option value="">Semua</option>' +
          people().map((s) => '<option value="' + esc(s.id) + '"' + (ui.taskPerson === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
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
          (db.pipelineStages || []).map((sg) => '<option value="' + esc(sg.id) + '"' + (st.to === sg.id ? ' selected' : '') + '>' + esc(sg.label) + '</option>').join('') + '</select>'
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
        '<td>' + esc(stageLabel(crmOf(s.id).stage)) + '</td><td>' + payChip(billingOf(s.id).status) + '</td></tr>').join('') +
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
  function viewHarga() {
    const p = db.pricing;
    const b = db.bank;
    return '<div class="grid-2"><section class="card"><h2>Harga mentoring (placeholder)</h2>' +
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
      '<p class="muted">Siswa menyalin ini di halaman bayar. Anton menandai lunas di baris siswa / profil.</p>' +
      '</section></div>';
  }
  function viewPerson(id) {
    const s = people().find((x) => x.id === id);
    if (!s) return '<p class="muted">Orang tidak ditemukan.</p><button class="btn" data-act="close-person">Kembali</button>';
    const b = billingOf(id);
    const c = crmOf(id);
    const app = db.applications[id];
    const stages = db.pipelineStages || SEED.pipelineStages;
    const p = kurProgress(id);
    const handle = tiktokHandle(s.tiktok);
    const plans = (db.actionPlans || []).filter((x) => !x.archived);
    const tsk = db.tasks.filter((x) => x.personId === id).slice().sort((a, b) => Number(a.done) - Number(b.done) || new Date(a.dueAt) - new Date(b.dueAt));
    const photoNote = s.photoBlob ? '' : (s.photoFailed
      ? '<p class="muted">Foto TikTok gagal (CORS/blok). Inisial dipakai.</p>'
      : (handle ? '<p class="muted">oEmbed → unavatar.io. Tidak scrape tiktok.com.</p>' : ''));
    const lecList = lectures().map((l) => {
      const done = isDone(id, l.id);
      const locked = !canOpenLecture(id, l.id);
      return '<li>' + (done ? '✓ ' : (locked ? '× ' : '· ')) + esc(l.title) +
        (locked ? ' <span class="chip">Terkunci</span>' : '') + '</li>';
    }).join('');
    const feed = personFeed(id);
    const anton = staffPerson();
    const left =
      '<aside class="fub-left">' +
        '<div class="fub-iden">' + avatarHtml(s, 'avatar lg') +
          '<div><input class="inline-edit name-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="name" value="' + esc(s.name) + '">' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="city" value="' + esc(s.city || '') + '" placeholder="Kota">' +
            '<label class="btn-sm" style="margin-top:8px">Unggah foto<input type="file" hidden data-act="photo-file" data-id="' + esc(id) + '" accept="image/*"></label>' +
          '</div></div>' +
        photoNote +
        '<dl>' +
          '<div class="fub-field"><dt>Telepon</dt><dd>' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="wa" value="' + esc(s.wa || '') + '" placeholder="62812…">' +
            (s.wa ? '<a class="fub-cell-link" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', dari Sekolah Anton.')) + '" target="_blank" rel="noopener">Buka WA</a>' : '') +
          '</dd></div>' +
          '<div class="fub-field"><dt>Email</dt><dd>' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="email" type="email" value="' + esc(s.email || '') + '" placeholder="email">' +
            (s.email ? '<a class="fub-cell-link" href="' + esc(mailLink(s.email, 'Sekolah Anton', 'Halo ' + s.name)) + '">mailto</a>' : '') +
          '</dd></div>' +
          '<div class="fub-field"><dt>TikTok</dt><dd>' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="tiktok" value="' + esc(s.tiktok || '') + '" placeholder="handle">' +
            (handle ? '<a class="fub-cell-link" href="' + esc(tiktokUrl(handle)) + '" target="_blank" rel="noopener">@' + esc(handle) + '</a>' : '') +
          '</dd></div>' +
          '<div class="fub-field"><dt>Stage</dt><dd><select data-act="crm-stage" data-id="' + esc(id) + '">' +
            stages.map((st) => '<option value="' + esc(st.id) + '"' + (c.stage === st.id ? ' selected' : '') + '>' + esc(st.label) + '</option>').join('') +
          '</select></dd></div>' +
          '<div class="fub-field"><dt>Toko</dt><dd>' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="shopName" value="' + esc(s.shopName || (app && app.shopName) || '') + '" placeholder="Nama toko">' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="shopUrl" value="' + esc(s.shopUrl || (app && app.shopUrl) || '') + '" placeholder="https://…">' +
          '</dd></div>' +
          '<div class="fub-field"><dt>Sumber</dt><dd>' + esc((app && app.heard) || b.source || '—') +
            (app && app.hasShop ? '<div class="muted">Sudah punya toko</div>' : (app ? '<div class="muted">Belum punya toko</div>' : '')) +
          '</dd></div>' +
          '<div class="fub-field"><dt>Upline</dt><dd>' + esc(s.mentorId ? nameOf(s.mentorId) : 'Anton') + '</dd></div>' +
          '<div class="fub-field"><dt>Bayar</dt><dd>' +
            (canBill() ? billStatusSelect(id, b) : payChip(b.status)) +
            '<div class="muted" style="margin-top:6px">' + esc(termLabel(b.term)) + '</div>' +
            (canBill() ? '<div style="margin-top:6px">' + billAmountInput(id, b) + '</div>' : '<div class="money">' + esc(fmtRp(b.amount || 0)) + '</div>') +
          '</dd></div>' +
          personEntitlementsHtml(id) +
          '<div class="fub-field"><dt>Tag</dt><dd>' +
            '<input class="inline-edit" data-act="person-field" data-id="' + esc(id) + '" data-k="tags" value="' + esc((s.tags || []).join(', ')) + '" placeholder="tag, tag">' +
          '</dd></div>' +
        '</dl>' +
        '<div style="margin-top:16px">' + progressBarHtml(id) +
          '<p class="muted">' + p.n + '/' + p.total + ' materi · ' + p.pct + '%</p>' +
          lecDotStrip(id) +
          '<details style="margin-top:8px"><summary class="muted">Checklist materi</summary><ul class="lec-check">' + lecList + '</ul></details>' +
        '</div>' +
      '</aside>';
    const center =
      '<main class="fub-center">' +
        '<div class="fub-composer">' +
          '<div class="fub-acts">' +
            '<span class="btn-sm">Catatan</span>' +
            (s.email ? '<a class="btn-sm" href="' + esc(mailLink(s.email, 'Sekolah Anton', 'Halo ' + s.name)) + '">Email</a>' : '<span class="btn-sm" style="opacity:.45">Email</span>') +
            '<a class="btn-sm" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', dari Sekolah Anton.')) + '" target="_blank" rel="noopener">WA</a>' +
            '<button type="button" class="btn-sm" data-act="task-compose" data-id="' + esc(id) + '">Tugas</button>' +
          '</div>' +
          (ui.taskComposer === id
            ? taskComposerHtml(id)
            : '<form class="compose" data-act="note" data-id="' + esc(id) + '" style="margin:0">' +
                '<textarea name="body" required rows="3" placeholder="Tambah catatan…"></textarea>' +
                '<button class="btn" type="submit">Simpan catatan</button>' +
              '</form>') +
        '</div>' +
        '<div class="fub-tl-label">Linimasa</div>' +
        (feed.length
          ? '<div class="fub-feed">' + feed.map((n) =>
              '<article class="fub-item">' + avatarHtml(n.who === 'Anton' ? anton : s, 'avatar bubble') +
                '<div><strong>' + esc(n.who) + ' · ' + esc(n.kind) + '</strong>' +
                  '<div class="muted">' + esc(relWhen(n.at)) + '</div>' +
                  '<p style="margin:6px 0 0;font-size:.82rem">' + esc(n.body) + '</p></div></article>'
            ).join('') + '</div>'
          : '<p class="muted">Belum ada catatan atau event.</p>') +
      '</main>';
    const right =
      '<aside class="fub-right fub-side">' +
        '<h3>Tugas <button type="button" class="btn-sm" data-act="task-compose" data-id="' + esc(id) + '">+</button></h3>' +
        (tsk.length
          ? tsk.map((t) =>
              '<div class="fub-task">' +
                (t.done
                  ? '<span class="tick-ok">✓</span>'
                  : '<button type="button" class="btn-sm" data-act="task-done" data-id="' + esc(t.id) + '">Selesai</button>') +
                '<div><strong>' + esc(taskKindLabel(t.kind)) + ' · ' + esc(t.title) + '</strong>' +
                  '<div class="muted">' + esc(relWhen(t.dueAt)) + (t.body ? ' · ' + esc(t.body) : '') + '</div></div></div>'
            ).join('')
          : '<p class="muted">Tidak ada tugas.</p>') +
        '<h3 style="margin-top:22px">Rencana aksi</h3>' +
        '<p class="muted">Centang = ikut. Tidak auto-kirim.</p>' +
        plans.map((pl) => {
          const on = isEnrolled(id, pl.id);
          return '<label class="fub-plan"><input type="checkbox" data-act="enroll-plan" data-id="' + esc(id) + '" data-pid="' + esc(pl.id) + '"' +
            (on ? ' checked' : '') + '>' +
            '<span>' + esc(pl.name) +
              (on ? ' <span class="chip running">Jalan</span>' : ' <span class="chip idle">Off</span>') +
              '<div class="muted">' + esc(triggerLabel(pl.trigger)) + '</div></span></label>';
        }).join('') +
      '</aside>';
    return '<div class="fub-page">' +
      '<div class="fub-page-bar">' +
        '<button class="btn secondary" data-act="close-person">← Orang</button>' +
        '<strong>' + esc(s.name) + '</strong>' +
        payChip(b.status) +
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
    return !!(l.url || l.videoBlob);
  }
  function lecTypeIcon(l) {
    if (l.type === 'text') return 'Aa';
    if (l.type === 'document') return '≡';
    return '▶';
  }

  function viewKurikulum() {
    const readonly = ui.role === 'asisten';
    const nVid = lectures().filter((l) => l.type === 'video').length;
    const nTxt = lectures().filter((l) => l.type === 'text').length;
    const nFile = lectures().filter((l) => l.type === 'document').length;
    ensureSecFold();
    const toolbar = '<div class="ud-head">' +
      '<div><h2 style="margin:0">Kurikulum</h2>' +
        '<p class="muted" style="margin:6px 0 0">Susun bagian, lalu tambah lecture. Geser untuk urutan. ' +
        nVid + ' video · ' + nTxt + ' bacaan · ' + nFile + ' file.</p></div></div>';
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

  function lecEditorCard(l, readonly, n) {
    const open = ui.editLecId === l.id;
    const has = lecHasContent(l);
    const kindNote = l.type === 'video' ? videoKindLabel(l) : (l.type === 'text' ? 'Bacaan' : ((l.resources || []).length + ' file'));
    const mins = l.mins ? (l.mins + ' mnt') : '';
    const head = '<div class="ud-item-head">' +
      (readonly ? '' : '<span class="drag-handle" draggable="true" data-drag="lec" data-id="' + esc(l.id) + '" title="Geser materi">⋮⋮</span>') +
      '<span class="ud-icon" aria-hidden="true">' + lecTypeIcon(l) + '</span>' +
      '<span class="ud-item-copy"><strong>' + (n ? n + '. ' : '') + esc(l.title) + '</strong>' +
        '<div class="muted">' + esc(kindNote) + (l.requiredBefore ? ' · wajib' : '') + '</div></span>' +
      (mins ? '<span class="muted ud-mins">' + esc(mins) + '</span>' : '') +
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
        '<input data-act="q-field" data-id="' + esc(l.id) + '" data-i="' + i + '" data-k="q" value="' + esc(q.q || '') + '" placeholder="Pertanyaan ' + (i + 1) + '">' +
        '<input data-act="q-field" data-id="' + esc(l.id) + '" data-i="' + i + '" data-k="hint" value="' + esc(q.hint || '') + '" placeholder="Arah jawaban (opsional)">' +
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
          '<h4>Cover</h4>' +
          '<label class="vid-drop"><input type="file" data-act="cover-file" data-kind="lec" data-id="' + esc(l.id) + '" accept="image/*" hidden><span>Unggah cover (maks 5 MB)</span></label>' +
          (l.type === 'text'
            ? '<h4>Bacaan</h4><textarea data-act="lec-body" data-id="' + esc(l.id) + '" rows="8" placeholder="Teks. **tebal** boleh.">' + esc(l.body || '') + '</textarea>'
            : l.type === 'document'
            ? '<p class="muted">Unggah file atau tautan di bagian File di bawah.</p>'
            : '<h4>Video</h4>' +
              '<p class="muted">YouTube paling lancar. Drive juga bisa. Atau unggah MP4.</p>' +
              '<input data-act="lec-field" data-id="' + esc(l.id) + '" data-k="url" value="' + esc(l.url || '') + '" placeholder="https://youtube.com/…">' +
              '<label class="vid-drop" data-act="vid-drop" data-id="' + esc(l.id) + '">' +
                '<input type="file" data-act="vid-file" data-id="' + esc(l.id) + '" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v" hidden>' +
                '<span>' + (l.videoBlob ? ('Ganti file · sekarang: ' + esc(l.videoName || 'video')) : 'Drop / pilih file MP4') + '</span>' +
              '</label>' +
              (l.videoBlob ? '<button type="button" class="btn-sm" data-act="clear-vid" data-id="' + esc(l.id) + '">Hapus file, pakai tautan</button>' : '')) +
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
          qHtml +
        '</div>';
    return '<article class="ud-item is-open" data-lec-drop="' + esc(l.id) + '">' + head + body + '</article>';
  }

  function viewPustaka() {
    return catalogHero() +
      '<div class="card" style="margin-top:12px"><h2>Perpustakaan</h2>' +
      '<p class="muted">Produk lynk Anton. Toggle Contoh → File Anton setelah dia isi. Tambah SKU baru di bawah — tidak mengubah checkout lynk.id.</p>' +
      (canBill()
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
      kind: 'meet', at: s.startsAt, title: s.title, id: s.id, loc: s.location, url: s.meetUrl
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
              return '<article class="thread"><h4>' + esc(kindLabel.meet) + ' · ' + esc(ev.title) + '</h4>' +
                '<p class="muted">' + fmtWhen(ev.at) + (ev.loc ? ' · ' + esc(ev.loc) : '') + '</p>' +
                (staff && canBill()
                  ? '<form class="compose" data-act="meet" data-id="' + esc(ev.id) + '"><input name="meetUrl" value="' + esc(ev.url || '') + '" placeholder="https://meet.google.com/..."><button class="btn" type="submit">Simpan tautan Meet</button></form>'
                  : (ev.url ? '<a class="btn" href="' + esc(ev.url) + '" target="_blank" rel="noopener">Buka Meet</a>' : '')) +
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
    return '<div class="card"><h2>Jadwal</h2>' +
      '<p class="muted">Kalender: kurikulum (jatuh tempo bagian), Meet/Zoom, tugas. ICS token prototype: ' +
      esc(SEED.cohort.calendarToken) + '.</p>' +
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
      if (ui.present || ui.chromeSync) return;
      ui.role = t.value;
      ui.tab = 'home';
      ui.mentorTab = 'siswa';
      closeDrawer();
      if (!isStaff()) {
        ui.tab = needsWizard(ui.personaId) ? 'daftar' : 'home';
        resetWizForPersona();
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
        b.products = MENTOR_SKUS().slice();
      }
      if (t.value === 'belum') {
        b.plan = '';
        b.products = [];
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
      if (t.checked) set.add(sku); else set.delete(sku);
      b.products = [...set];
      b.plan = b.products.length ? 'sku' : '';
      if (!b.products.length) b.status = 'belum';
      else if (b.status === 'belum') b.status = 'lunas';
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
    if (t.matches('[data-act="photo-file"]')) {
      const file = t.files && t.files[0];
      const id = t.getAttribute('data-id');
      if (!file || !id) return;
      if (file.size > MAX_IMG) { toast('Foto maks 5 MB.'); return; }
      blobPut(photoKey(id), file).then(() => {
        patchPerson(id, { photoBlob: true, photoFailed: false });
        save();
        toast('Foto diunggah di browser ini.');
        render();
      });
      return;
    }
    if (t.matches('[data-act="task-person"]')) {
      ui.taskPerson = t.value;
      render();
      return;
    }
    if (t.matches('[data-act="person-field"]')) {
      const id = t.getAttribute('data-id');
      const k = t.getAttribute('data-k');
      let val = t.value;
      if (k === 'wa') val = String(val).replace(/\D/g, '');
      if (k === 'tiktok') val = tiktokHandle(val);
      if (k === 'email') val = String(val).trim();
      if (k === 'tags') {
        patchPerson(id, { tags: String(val).split(',').map((s) => s.trim()).filter(Boolean) });
      } else {
        const fields = {};
        fields[k] = val;
        patchPerson(id, fields);
      }
      save();
      if (k === 'tiktok') {
        refreshPersonPhoto(id, true).then((ok) => {
          toast(ok ? 'Foto TikTok tersimpan.' : 'Foto gagal. Inisial + unggah.');
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

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'vid-drop' || act === 'vid-file' || act === 'add-lec' || act === 'sec-title' ||
        act === 'lec-field' || act === 'lec-points' || act === 'q-field' || act === 'doc-name' || act === 'doc-url' ||
        act === 'cover-file' || act === 'res-file' || act === 'photo-file' || act === 'lec-body' || act === 'res-name' || act === 'res-url' ||
        act === 'person-field' || act === 'bill-amount' || act === 'sec-due' || act === 'kur-preview-person' ||
        act === 'has-shop' || act === 'heard-from' || act === 'apply') {
      return;
    }
    if (act === 'wiz-next') {
      if (btn.matches('form')) return;
      advanceWiz();
    } else if (act === 'wiz-back') {
      backWiz();
    } else if (act === 'wiz-shop') {
      captureWizFields();
      wizMerge({ shopPick: btn.getAttribute('data-id') });
      render();
    } else if (act === 'wiz-heard') {
      captureWizFields();
      wizMerge({ heardPick: btn.getAttribute('data-id') });
      render();
    } else if (act === 'wiz-tools') {
      ui.wizTools = !ui.wizTools;
      render();
    } else if (act === 'tab') {
      const id = btn.getAttribute('data-id');
      if (isStaff()) {
        ui.mentorTab = id;
        if (id !== 'orang') ui.personId = null;
      } else {
        ui.tab = id;
        if (id === 'pustaka' || id === 'alat') { ui.skuId = null; ui.skuPreview = false; }
        if (id === 'belajar' && canPreview(ui.personaId) && !canMentoring(ui.personaId)) {
          ui.lectureId = firstLectureId();
        }
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
      if (!canOpenLecture(ui.personaId, id) && !isStaff()) {
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
      if (e.target.closest('a, select, input, textarea, label, .btn-sm')) return;
      const id = btn.getAttribute('data-id');
      if (ui.skipOpen === id) return;
      openPerson(id);
    } else if (act === 'task-compose') {
      const id = btn.getAttribute('data-id') || 'new';
      ui.taskComposer = ui.taskComposer === id ? '' : id;
      render();
    } else if (act === 'cal-day') {
      ui.calDay = btn.getAttribute('data-id');
      render();
    } else if (act === 'cal-ym') {
      ui.calYM = btn.getAttribute('data-id');
      render();
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
    } else if (act === 'close-drawer' || act === 'close-person') {
      closePerson();
    } else if (act === 'siswa-view') {
      ui.siswaView = btn.getAttribute('data-id');
      ui.hubBack = ui.siswaView;
      ui.mentorTab = 'siswa';
      render();
    } else if (act === 'stage-filter') {
      ui.stageFilter = btn.getAttribute('data-id') || '';
      ui.siswaView = 'daftar';
      ui.hubBack = 'daftar';
      ui.mentorTab = 'siswa';
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
    } else if (act === 'clock') {
      db.clockOffsetMs = (db.clockOffsetMs || 0) + (+btn.getAttribute('data-ms') || 0);
      save();
      toast('Jam majukan');
      render();
    } else if (act === 'clock-reset') {
      db.clockOffsetMs = 0;
      save();
      toast('Jam kembali ke sekarang');
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
      ui.tab = 'home';
      toast('Trial: video 1 kebuka. Boleh lihat dulu, diskon 24 jam dari jam form.');
      render();
    } else if (act === 'pay-now') {
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
      const source = term === 'autopay' ? 'mayar' : 'transfer';
      grantMentoring(ui.personaId, term, source, amount);
      addTask(ui.personaId, 'Cek transfer ' + nameOf(ui.personaId), 'Jumlah ' + fmtRp(amount) + ' ke ' + db.bank.bank + ' ' + db.bank.number, isoNow());
      save();
      ui.tab = 'home';
      toast(term === 'autopay' ? 'Autopay mock · akses kebuka' : 'Tercatat transfer · Anton cek rekening');
      render();
    } else if (act === 'not-interested') {
      setStage(ui.personaId, 'tidak_tertarik', 'Siswa bilang tidak tertarik.');
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
      setStage(ui.personaId, 'mentor', 'Terima peran mentor + 20% licensing.');
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
      db.notes[id].push({ at: isoNow(), body: String(fd.get('body')) });
      save();
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
      addTask(String(fd.get('personId')), String(fd.get('title')), String(fd.get('body') || ''), due, String(fd.get('kind') || 'wa'));
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
        setStage(ui.personaId, 'mentee', 'Lulus tes ' + score + '/' + qs.length);
      }
      pushTimeline(ui.personaId, 'exam', 'Tes akhir ' + score + '/' + qs.length);
      save();
      ui.tab = c.eligibleMentor ? 'sertifikat' : 'progres';
      toast(c.eligibleMentor ? 'Lulus. Sertifikat terbit.' : 'Belum lulus. Ulangi setelah baca materi.');
      render();
    }
  });

  $('btn-reset').addEventListener('click', () => {
    if (ui.present) return;
    if (!confirm('Hapus data lokal prototype ini?')) return;
    localStorage.removeItem(KEY);
    blobClearAll();
    db = defaultState();
    ui.kolabSel = new Set();
    ui.editLecId = null;
    ui.secFold = null;
    ui.skuFrom = 'pustaka';
    resetWizForPersona();
    closeDrawer();
    render();
  });
  $('drawer-scrim').addEventListener('click', closeDrawer);

  window.addEventListener('storage', (e) => {
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

  render();
})();
