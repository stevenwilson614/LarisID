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
    });
  }

  function hydrateFunnel(merged) {
    merged.pricing = Object.assign({}, SEED.pricing, merged.pricing || {});
    merged.bank = Object.assign({}, SEED.bank, merged.bank || {});
    merged.dunning = Object.assign({}, SEED.dunning, merged.dunning || {});
    merged.actionPlans = mergeActionPlans(merged.actionPlans);
    merged.pipelineStages = (merged.pipelineStages && merged.pipelineStages.length)
      ? merged.pipelineStages
      : JSON.parse(JSON.stringify(SEED.pipelineStages || []));
    merged.crm = Object.assign({}, JSON.parse(JSON.stringify(SEED.crm || {})), merged.crm || {});
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
      if (!merged.billing[id]) merged.billing[id] = JSON.parse(JSON.stringify(SEED.billing[id]));
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
    if (ui.presentApplying) return;
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
    return SEED.students.map((s) => {
      if (db.people[s.id]) Object.assign(s, db.people[s.id]);
      return s;
    });
  }
  function patchPerson(id, fields) {
    db.people = db.people || {};
    db.people[id] = Object.assign({}, db.people[id] || {}, fields);
    const s = SEED.students.find((x) => x.id === id);
    if (s) Object.assign(s, db.people[id]);
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
    return c.stage === 'trial' || c.stage === 'nonton' || c.stage === 'nurture';
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
    return { month: 'bulan', autopay: 'autopay', year: 'tahun' }[term] || '—';
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
    if (t === 'nurture' && crmOf(s.id).stage === 'nurture') return en && en.at ? new Date(en.at).getTime() : nowMs();
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
  function priceForTerm(term, welcome) {
    const m = monthlyPrice();
    let n = m;
    if (term === 'year') n = Math.round(m * 12 * (1 - (Number(db.pricing.annualDiscountPct) || 0) / 100));
    else if (term === 'autopay') n = Math.round(m * (1 - (Number(db.pricing.autopayDiscountPct) || 0) / 100));
    if (welcome) n = Math.round(n * (1 - (Number(db.pricing.welcomeDiscountPct) || 0) / 100));
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
    if (term === 'year') until.setFullYear(until.getFullYear() + 1);
    else until.setMonth(until.getMonth() + 1);
    b.status = 'lunas';
    b.plan = 'mentoring';
    b.products = MENTOR_SKUS().slice();
    b.term = term;
    b.source = source;
    b.amount = amount;
    b.paidAt = isoNow();
    b.accessUntil = until.toISOString();
    b.note = term === 'year' ? 'Tahunan' : (term === 'autopay' ? 'Kartu autopay (mock)' : 'Bulanan transfer');
    setStage(id, 'aktif', 'Lunas mentoring · ' + term);
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
        if (left != null && left <= 0 && c.stage !== 'nurture' && c.stage !== 'tidak_tertarik' && c.stage !== 'aktif') {
          setStage(s.id, 'nurture', '24 jam habis, belum bayar → nurture.');
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
      if (b.plan === 'mentoring' && b.accessUntil && b.status !== 'gratis' && c.stage !== 'tidak_tertarik' && c.stage !== 'lulus' && c.stage !== 'mentor') {
        const end = new Date(b.accessUntil).getTime();
        const t = nowMs();
        const warnStart = end - warningMs();
        if (t >= warnStart && t < end && !c.warn5Sent) {
          const plan = planById('renewal');
          const step = plan && plan.steps.find((x) => x.id === 'r5');
          queueWa(s.id, (step && step.title) || '5 hari sebelum habis', fillTpl((step && step.body) || '', s.id), isoNow());
          c.warn5Sent = true;
          setStage(s.id, 'perpanjangan', 'Peringatan 5 hari.');
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
          setStage(s.id, 'grace', 'Masa tenggang.');
        }
        if (t >= end + graceMs() && (c.stage === 'grace' || c.stage === 'perpanjangan' || c.stage === 'aktif')) {
          b.status = 'trial';
          b.plan = 'preview';
          setStage(s.id, 'nurture', 'Grace habis. Kembali ke preview video 1.');
        }
      }
      if (c.stage === 'nurture' && !c.nurtureQueued) {
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
    save();
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
    $('role-switch').value = ui.role;
    const pers = $('persona-switch');
    pers.innerHTML = people().map((s) =>
      '<option value="' + esc(s.id) + '">' + esc(s.name) + (s.kind === 'mentor' ? ' · mentor' : '') + '</option>').join('');
    pers.value = ui.personaId;
    pers.hidden = isStaff();
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
          '<span class="muted">WA ' + (db.waQueue.filter((w) => w.status === 'queued').length) +
          ' · email ' + ((db.emailQueue || []).filter((w) => w.status === 'queued').length) +
          ' · tugas ' + db.tasks.filter((t) => !t.done).length + '</span>';
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
      { id: 'waq', label: 'Antrian' },
      { id: 'otomasi', label: 'Otomasi' },
      { id: 'jaringan', label: 'Jaringan' },
      { id: 'kurikulum', label: 'Kurikulum' },
      { id: 'pustaka', label: 'Perpustakaan' },
      { id: 'jadwal', label: 'Jadwal' },
      { id: 'diskusi', label: 'Diskusi' }
    ];
    if (canBill()) {
      t.push({ id: 'bayar', label: 'Pembayaran' });
      t.push({ id: 'harga', label: 'Pengaturan bayar' });
    }
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
      const tab = normalizeMentorTab(ui.mentorTab);
      ui.mentorTab = tab;
      if (tab === 'siswa') main.innerHTML = viewSiswaHub();
      else if (tab === 'orang') main.innerHTML = viewPerson(ui.personId);
      else if (tab === 'tugas') main.innerHTML = viewTugas();
      else if (tab === 'waq') main.innerHTML = viewAntrian();
      else if (tab === 'otomasi') main.innerHTML = viewOtomasi();
      else if (tab === 'jaringan') main.innerHTML = viewJaringan();
      else if (tab === 'kurikulum') main.innerHTML = viewKurikulum();
      else if (tab === 'pustaka') main.innerHTML = viewPustaka();
      else if (tab === 'jadwal') main.innerHTML = viewJadwal(true);
      else if (tab === 'diskusi') main.innerHTML = viewDiskusi(true);
      else if (tab === 'bayar' && canBill()) main.innerHTML = viewBayar();
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
    if (!welcomeOpen(sid)) return '';
    return '<section class="card resume" style="margin-bottom:12px">' +
      '<p class="muted">Harga perkenalan · sisa <strong>' + esc(fmtRemain(b.offerExpiresAt)) + '</strong> (jam nyata dari form, bukan sisa kursi)</p>' +
      '<p>Bulanan transfer ' + fmtRp(priceForTerm('month', true)) +
      ' · tahunan ' + fmtRp(priceForTerm('year', true)) +
      ' · kartu autopay ' + fmtRp(priceForTerm('autopay', true)) + '</p>' +
      '<div class="row" style="margin-top:10px">' +
        '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button>' +
        '<button class="btn secondary" data-act="not-interested">Tidak tertarik</button>' +
      '</div></section>';
  }
  function dualCta(p, extraClass) {
    const sid = ui.personaId;
    const owned = canSku(sid, p.id);
    if (owned) {
      return '<button class="btn" data-act="open-sku" data-from="' + (extraClass || 'pustaka') + '" data-id="' + esc(p.id) + '">Buka</button>';
    }
    const mentorLine = bundled(p)
      ? '<button class="btn secondary" data-act="tab" data-id="daftar">Ikut mentoring, termasuk</button>'
      : '<span class="muted">Tidak termasuk mentoring.</span>';
    return '<a class="btn" href="' + esc(p.lynk || SEED.school.lynk) + '" target="_blank" rel="noopener">Beli satuan</a>' + mentorLine +
      '<button class="btn secondary" data-act="contoh-sku" data-from="' + (extraClass || 'pustaka') + '" data-id="' + esc(p.id) + '">Lihat contoh</button>';
  }
  function viewWizard() {
    const sid = ui.personaId;
    const s = student();
    const step = wizardStep(sid);
    const app = db.applications[sid] || {};
    if (step === 'pay') return viewPayPage(sid);
    return '<section class="card">' +
      '<p class="muted">Dari grup WA · langkah 1 dari 2</p>' +
      '<h2>Siapa kamu</h2>' +
      '<p class="muted">Anton baca ini sebelum kelas. Bukan tes. Tidak ada “sisa 3 kursi”.</p>' +
      '<form class="compose" data-act="apply">' +
        '<label class="muted">Nama</label>' +
        '<input name="name" required maxlength="80" value="' + esc(app.name || (s.name.indexOf('Tamu') === 0 ? '' : s.name)) + '">' +
        '<label class="muted">WhatsApp</label>' +
        '<input name="wa" required value="' + esc(app.wa || s.wa || '') + '" placeholder="08…">' +
        '<label class="muted">Pengalaman jualan</label>' +
        '<textarea name="experience" required rows="3" placeholder="Toko, platform, omset kira-kira, sudah berapa lama.">' + esc(app.experience || '') + '</textarea>' +
        '<label class="muted">Kenapa mau di-mentor</label>' +
        '<textarea name="why" required rows="3" placeholder="Yang mau kamu pecahkan bulan ini.">' + esc(app.why || '') + '</textarea>' +
        '<button class="btn" type="submit">Lanjut ke pembayaran</button>' +
      '</form></section>';
  }
  function viewPayPage(sid) {
    const welcome = welcomeOpen(sid) || !billingOf(sid).offerExpiresAt;
    const b = billingOf(sid);
    const exp = b.offerExpiresAt || addMs(isoNow(), 24 * 36e5);
    const term = ui.payTerm || 'month';
    const price = priceForTerm(term, welcome && hoursLeft(exp) > 0);
    const list = priceForTerm(term, false);
    return '<section class="card">' +
      '<p class="muted">Langkah 2 · Anton merchant. LarisID tidak menahan uang.</p>' +
      '<h2>Bayar mentoring</h2>' +
      (hoursLeft(exp) > 0
        ? '<p>Diskon 24 jam (dari jam form). Sisa <strong>' + esc(fmtRemain(exp)) + '</strong>.</p>'
        : '<p class="muted">Jendela 24 jam sudah habis. Harga list di bawah. Tidak ada kelangkaan palsu.</p>') +
      '<div class="pay-terms">' +
        termCard('month', 'Transfer tiap bulan', monthlyPrice(), priceForTerm('month', hoursLeft(exp) > 0), term) +
        termCard('year', 'Transfer tahunan (−' + (db.pricing.annualDiscountPct || 15) + '%)', monthlyPrice() * 12, priceForTerm('year', hoursLeft(exp) > 0), term) +
        termCard('autopay', 'Kartu autopay (−' + (db.pricing.autopayDiscountPct || 10) + '%)', monthlyPrice(), priceForTerm('autopay', hoursLeft(exp) > 0), term) +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
        '<h3>Transfer ke rekening Anton</h3>' +
        '<p><strong>' + esc(db.bank.bank) + '</strong> ' + esc(db.bank.number) + '<br>' +
        'a.n. ' + esc(db.bank.name) + '</p>' +
        '<p class="muted">Jumlah sekarang: <strong>' + fmtRp(price) + '</strong>' +
        (price < list ? ' <span class="price-coret">' + fmtRp(list) + '</span>' : '') + '</p>' +
        '<p class="muted">Kartu autopay = mock Mayar. Prototype tidak menagih sungguhan.</p>' +
        '<div class="row" style="margin-top:10px">' +
          '<button class="btn" data-act="pay-now" data-term="' + esc(term) + '">' +
          (term === 'autopay' ? 'Bayar kartu (mock)' : 'Saya sudah transfer') + '</button>' +
          '<button class="btn secondary" data-act="pay-later">Bayar nanti</button>' +
          '<button class="btn secondary" data-act="not-interested">Tidak tertarik</button>' +
        '</div>' +
      '</div>' +
      '<p class="muted" style="margin-top:12px">Bayar nanti: Home kelihatan utuh, hanya video 1 + lembar kerja yang kebuka. Laris Affiliate tidak termasuk mentoring.</p>' +
      '</section>';
  }
  function termCard(id, label, coret, now, cur) {
    return '<button type="button" class="card tool-tile' + (cur === id ? ' current-term' : '') + '" data-act="pick-term" data-id="' + id + '">' +
      '<h3>' + esc(label) + '</h3>' +
      (now < coret ? '<p class="sku-price"><span class="price-coret">' + fmtRp(coret) + '</span> <strong>' + fmtRp(now) + '</strong></p>'
        : '<p class="sku-price"><strong>' + fmtRp(now) + '</strong></p>') +
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
      return '<li><span>' + (isDone(sid, l.id) ? '<span class="tick-ok" aria-hidden="true">✓</span> ' : '<span class="tick-off" aria-hidden="true"></span> ') +
      esc(l.title) + (locked ? ' <span class="chip">Terkunci</span>' : '') + '</span>' +
      (locked
        ? '<button class="btn-sm" data-act="tab" data-id="daftar">Lanjut mentoring</button>'
        : '<button class="btn-sm" data-act="open-lec" data-id="' + esc(l.id) + '">Buka</button>') + '</li>';
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
    const lec = lectureById(ui.lectureId) || lectures()[0];
    ui.lectureId = lec.id;
    if (!canOpenLecture(ui.personaId, lec.id) && !isStaff()) {
      return '<div class="player-layout"><div>' +
        progressBarHtml(ui.personaId) +
        '<div class="locked"><h2>Materi terkunci</h2>' +
        '<p class="muted">Trial = video 1 + lembar kerja. Sisanya setelah mentoring lunas.</p>' +
        '<button class="btn" data-act="tab" data-id="daftar">Bayar mentoring</button></div></div>' +
        '<aside class="kurikulum-pane' + (ui.kurOpen ? ' is-open' : '') + '">' + renderKurikulumSidebar() + '</aside></div>';
    }
    const inner = lec.tool === 'kolab'
      ? viewKolab()
      : renderCanvas(lec) + renderLecAfter(lec) + payAfterFirst(lec) + renderPanes(lec);
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
  function payAfterFirst(lec) {
    if (lec.id !== firstLectureId()) return '';
    if (canMentoring(ui.personaId)) return '';
    if (!isDone(ui.personaId, lec.id) && !ui.payPrompt) return '';
    return '<section class="card resume lec-after"><h3>Lanjut mentoring?</h3>' +
      '<p class="muted">Video 1 selesai. Tools satuan di Pustaka, atau mentoring supaya kelas + alat lynk kebuka (bukan Laris Affiliate).</p>' +
      '<div class="row">' +
        '<button class="btn" data-act="tab" data-id="daftar">Bayar sekarang</button>' +
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

  function renderKurikulumSidebar() {
    let n = 0;
    return progressBarHtml(ui.personaId) + db.weeks.map((w) => {
      const items = lecturesInWeek(w.id).map((l) => {
        n += 1;
        const cur = l.id === ui.lectureId;
        const locked = !isStaff() && !canOpenLecture(ui.personaId, l.id);
        const thumb = coverHtml('lec', l.id, 'cover-mini');
        return '<button type="button" class="lec' + (cur ? ' current' : '') + (locked ? ' locked' : '') + '" data-act="' +
          (locked ? 'tab' : 'open-lec') + '" data-id="' + (locked ? 'daftar' : esc(l.id)) + '">' +
          (thumb || '<span class="mark' + (isDone(ui.personaId, l.id) ? ' done' : '') + '" aria-hidden="true">' +
          (isDone(ui.personaId, l.id) ? '✓' : (locked ? '×' : '')) + '</span>') +
          '<span><div class="t">' + n + '. ' + esc(l.title) + (locked ? ' · terkunci' : '') + '</div>' +
          '<div class="m">' + esc(typeLabel(l.type)) + ' · ' + esc(l.mins) + ' mnt' + (l.requiredBefore ? ' · wajib' : '') + '</div></span></button>';
      }).join('');
      return '<div class="week-label">' + coverHtml('week', w.id, 'cover-mini') + esc(w.title) + ' · ' + progressPct(ui.personaId, w.id) + '%</div>' + items;
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
      '<p class="muted">Kalkulator, AI, Kolab. Yang terkunci: beli satuan atau ikut mentoring (Laris Affiliate selalu terpisah).</p>' +
      '<div class="alat-pick">' + tiles + kolab + '</div></section>';
  }

  function viewAlat() {
    const sid = ui.personaId;
    const tools = toolsCatalog();
    let html = '<h2 style="margin:0 0 4px">Alat</h2>' +
      '<p class="muted" style="margin:0 0 14px">Mentoring membuka alat lynk + Kolab. Laris Affiliate selalu satuan. Satuan = yang sudah dibeli di lynk.id.</p>' +
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
        '<span class="muted">Kolom: nama · WA · email · stage</span></div>' +
      '<table class="table roster"><thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Stage</th><th>Nilai</th></tr></thead><tbody>' +
      (rows.length ? rows.map((s) => {
        const b = billingOf(s.id);
        const c = crmOf(s.id);
        const tags = (s.tags || []).slice(0, 3);
        return '<tr class="roster-row">' +
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
          '<td' + (b.amount ? ' class="money"' : '') + '>' + (b.amount ? esc(fmtRp(b.amount)) : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">Tidak ada orang di filter ini.</td></tr>') +
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
  function taskGroups() {
    const start = new Date(nowMs());
    start.setHours(0, 0, 0, 0);
    const today0 = start.getTime();
    const tomorrow0 = today0 + 86400000;
    const pid = ui.taskPerson || '';
    const list = db.tasks.filter((t) => !pid || t.personId === pid);
    const hari = [];
    const later = [];
    const done = [];
    list.forEach((t) => {
      if (t.done) done.push(t);
      else if (new Date(t.dueAt).getTime() < tomorrow0) hari.push(t);
      else later.push(t);
    });
    const sortDue = (a, b) => new Date(a.dueAt) - new Date(b.dueAt);
    hari.sort(sortDue); later.sort(sortDue); done.sort(sortDue);
    return { hari: hari, later: later, done: done };
  }
  function taskRow(t) {
    const s = people().find((x) => x.id === t.personId) || {};
    return '<li><span>' + (t.done ? '<span class="tick-ok">✓</span> ' : '') +
      '<strong>' + esc(t.title) + '</strong>' +
      ' · <button type="button" class="linkish" data-act="open-student" data-id="' + esc(t.personId) + '">' + esc(nameOf(t.personId)) + '</button>' +
      '<div class="muted">' + fmtWhen(t.dueAt) + ' · ' + esc(t.body || '') + '</div></span>' +
      '<span class="row">' +
        (t.kind === 'wa' ? '<a class="btn-sm" href="' + esc(waLink(s.wa, t.body)) + '" target="_blank" rel="noopener">Buka WA</a>' : '') +
        (!t.done ? '<button class="btn-sm" data-act="task-done" data-id="' + esc(t.id) + '">Selesai</button>' : '') +
      '</span></li>';
  }
  function viewTugas() {
    const g = taskGroups();
    const block = (title, rows) =>
      '<h3>' + title + ' · ' + rows.length + '</h3>' +
      (rows.length ? '<ul class="list-check">' + rows.map(taskRow).join('') + '</ul>' : '<p class="muted">Kosong.</p>');
    return '<div class="card"><h2>Tugas Anton / Lia</h2>' +
      '<p class="muted">Hari ini, mendatang, selesai. Buka nama untuk profil.</p>' +
      '<div class="row" style="margin-bottom:8px">' +
        '<label class="muted">Filter orang <select data-act="task-person">' +
          '<option value="">Semua</option>' +
          people().map((s) => '<option value="' + esc(s.id) + '"' + (ui.taskPerson === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') +
        '</select></label></div>' +
      '<form class="compose" data-act="add-task">' +
        '<select name="personId">' + people().map((s) => '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>').join('') + '</select>' +
        '<input name="title" required placeholder="Judul tugas">' +
        '<textarea name="body" rows="2" placeholder="Teks WA / catatan"></textarea>' +
        '<button class="btn" type="submit">Tambah tugas</button></form>' +
      block('Hari ini', g.hari) +
      block('Mendatang', g.later) +
      block('Selesai', g.done) +
      '</div>';
  }
  function queueRowWa(w) {
    const s = people().find((x) => x.id === w.toId) || {};
    return '<tr><td>' + fmtWhen(w.scheduledAt) + '</td><td><button type="button" class="linkish" data-act="open-student" data-id="' + esc(w.toId) + '">' + esc(nameOf(w.toId)) + '</button></td><td>' + esc(w.title) +
      '<div class="muted">' + esc(w.body) + '</div></td><td>' + esc(w.status) + '</td><td>' +
      (w.status === 'queued' ? '<a class="btn-sm" href="' + esc(waLink(s.wa, w.body)) + '" target="_blank" rel="noopener">Buka WA</a>' +
        '<button class="btn-sm" data-act="wa-sent" data-id="' + esc(w.id) + '">Tandai dikirim</button>' : '') +
      '</td></tr>';
  }
  function queueRowEmail(w) {
    const s = people().find((x) => x.id === w.toId) || {};
    return '<tr><td>' + fmtWhen(w.scheduledAt) + '</td><td><button type="button" class="linkish" data-act="open-student" data-id="' + esc(w.toId) + '">' + esc(nameOf(w.toId)) + '</button></td><td>' + esc(w.subject || w.title) +
      '<div class="muted">' + esc(w.body) + '</div></td><td>' + esc(w.status) + '</td><td>' +
      (w.status === 'queued' ? '<a class="btn-sm" href="' + esc(mailLink(s.email, w.subject || w.title, w.body)) + '">mailto</a>' +
        '<button class="btn-sm" data-act="em-sent" data-id="' + esc(w.id) + '">Tandai dikirim</button>' : '') +
      '</td></tr>';
  }
  function viewAntrian() {
    const kind = ui.queueKind === 'email' ? 'email' : 'wa';
    const seg = '<div class="hub-seg" role="tablist">' +
      '<button type="button" data-act="queue-kind" data-id="wa" aria-selected="' + (kind === 'wa') + '">WhatsApp</button>' +
      '<button type="button" data-act="queue-kind" data-id="email" aria-selected="' + (kind === 'email') + '">Email</button>' +
      '</div>';
    if (kind === 'email') {
      const rows = (db.emailQueue || []).slice().sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
      return '<div class="card"><h2>Antrian email (tidak terkirim)</h2>' + seg +
        '<p class="muted">Prototype memakai mailto: + Tandai dikirim. Tidak ada SMTP.</p>' +
        (rows.length ? '<table class="table"><thead><tr><th>Jadwal</th><th>Ke</th><th>Subjek</th><th>Status</th><th></th></tr></thead><tbody>' +
          rows.map(queueRowEmail).join('') + '</tbody></table>' : '<p class="muted">Antrian email kosong.</p>') +
        '</div>';
    }
    const rows = (db.waQueue || []).slice().sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return '<div class="card"><h2>Antrian WA (tidak terkirim)</h2>' + seg +
      '<p class="muted">Prototype hanya tautan wa.me. Tidak memanggil send-cohort-whatsapp.</p>' +
      (rows.length ? '<table class="table"><thead><tr><th>Jadwal</th><th>Ke</th><th>Judul</th><th>Status</th><th></th></tr></thead><tbody>' +
        rows.map(queueRowWa).join('') + '</tbody></table>' : '<p class="muted">Antrian kosong. Majukan jam simulasi untuk menembak 12 jam / 5 hari.</p>') +
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
        '<label class="muted">Diskon tahunan %</label><input name="annualDiscountPct" type="number" value="' + esc(p.annualDiscountPct) + '">' +
        '<label class="muted">Diskon kartu autopay %</label><input name="autopayDiscountPct" type="number" value="' + esc(p.autopayDiscountPct) + '">' +
        '<label class="muted">Diskon 24 jam %</label><input name="welcomeDiscountPct" type="number" value="' + esc(p.welcomeDiscountPct) + '">' +
        '<label class="muted">Licensing mentor %</label><input name="overridePct" type="number" value="' + esc(p.overridePct) + '">' +
        '<button class="btn" type="submit">Simpan harga</button></form>' +
      '<p class="muted">List bulanan ' + fmtRp(monthlyPrice()) + ' · tahunan ' + fmtRp(priceForTerm('year', false)) +
      ' · autopay ' + fmtRp(priceForTerm('autopay', false)) + ' · 24 jam ' + fmtRp(priceForTerm('month', true)) + '</p>' +
      '</section><section class="card"><h2>Rekening transfer</h2>' +
      '<form class="compose" data-act="save-bank">' +
        '<label class="muted">Bank</label><input name="bank" value="' + esc(b.bank) + '">' +
        '<label class="muted">Nomor</label><input name="number" value="' + esc(b.number) + '">' +
        '<label class="muted">Atas nama</label><input name="name" value="' + esc(b.name) + '">' +
        '<button class="btn" type="submit">Simpan rekening</button></form>' +
      '<p class="muted">Siswa menyalin ini di halaman bayar. Anton menandai lunas di CRM / Pembayaran.</p>' +
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
          '<div><h2>' + esc(s.name) + '</h2>' +
            '<p class="muted" style="margin:4px 0 0">' + esc(s.city || '—') + '</p>' +
            '<label class="btn-sm" style="margin-top:8px">Unggah foto<input type="file" hidden data-act="photo-file" data-id="' + esc(id) + '" accept="image/*"></label>' +
          '</div></div>' +
        photoNote +
        '<dl>' +
          '<div class="fub-field"><dt>Telepon</dt><dd>' + (s.wa
            ? '<a class="fub-cell-link" href="' + esc(waLink(s.wa, 'Halo ' + s.name + ', dari Sekolah Anton.')) + '" target="_blank" rel="noopener">' + esc(fmtPhone(s.wa)) + '</a>'
            : '<span class="muted">Tambah WA</span>') + '</dd></div>' +
          '<div class="fub-field"><dt>Email</dt><dd>' + (s.email
            ? '<a class="fub-cell-link" href="' + esc(mailLink(s.email, 'Sekolah Anton', 'Halo ' + s.name)) + '">' + esc(s.email) + '</a>'
            : '<span class="muted">—</span>') + '</dd></div>' +
          '<div class="fub-field"><dt>TikTok</dt><dd>' + (handle
            ? '<a class="fub-cell-link" href="' + esc(tiktokUrl(handle)) + '" target="_blank" rel="noopener">@' + esc(handle) + '</a>'
            : '<span class="muted">—</span>') + '</dd></div>' +
          '<div class="fub-field"><dt>Stage</dt><dd><select data-act="crm-stage" data-id="' + esc(id) + '">' +
            stages.map((st) => '<option value="' + esc(st.id) + '"' + (c.stage === st.id ? ' selected' : '') + '>' + esc(st.label) + '</option>').join('') +
          '</select></dd></div>' +
          '<div class="fub-field"><dt>Sumber</dt><dd>' + esc(b.source || app && 'Form' || '—') +
            (app ? '<div class="muted">' + esc(app.experience || '') + '</div>' : '') + '</dd></div>' +
          '<div class="fub-field"><dt>Upline</dt><dd>' + esc(s.mentorId ? nameOf(s.mentorId) : 'Anton') + '</dd></div>' +
          '<div class="fub-field"><dt>Nilai</dt><dd class="money">' + esc(fmtRp(b.amount || 0)) +
            '<div class="muted">' + payChip(b.status) + ' · ' + esc(termLabel(b.term)) + '</div>' +
            (canBill() ? '<select data-act="bill-one" data-id="' + esc(id) + '" style="margin-top:6px">' +
              ['lunas', 'cicilan', 'belum', 'gratis', 'trial'].map((st) =>
                '<option' + (b.status === st ? ' selected' : '') + ' value="' + st + '">' + st + '</option>').join('') +
            '</select>' : '') +
          '</dd></div>' +
          '<div class="fub-field"><dt>Tag</dt><dd>' + ((s.tags || []).map((t) => '<span class="tag-chip">' + esc(t) + '</span>').join('') || '—') + '</dd></div>' +
        '</dl>' +
        '<form class="compose" data-act="save-person" data-id="' + esc(id) + '" style="margin-top:12px">' +
          '<label class="muted">Email</label><input name="email" type="email" value="' + esc(s.email || '') + '">' +
          '<label class="muted">Handle TikTok</label><input name="tiktok" value="' + esc(s.tiktok || '') + '" placeholder="ayu.jepit">' +
          '<label class="muted">WA</label><input name="wa" value="' + esc(s.wa || '') + '">' +
          '<button class="btn" type="submit">Simpan kontak</button>' +
        '</form>' +
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
            '<button type="button" class="btn-sm" data-act="task-from" data-id="' + esc(id) + '">Tugas</button>' +
          '</div>' +
          '<form class="compose" data-act="note" data-id="' + esc(id) + '" style="margin:0">' +
            '<textarea name="body" required rows="3" placeholder="Tambah catatan…"></textarea>' +
            '<button class="btn" type="submit">Simpan catatan</button>' +
          '</form>' +
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
        '<h3>Tugas <button type="button" class="btn-sm" data-act="task-from" data-id="' + esc(id) + '">+</button></h3>' +
        (tsk.length
          ? tsk.map((t) =>
              '<div class="fub-task">' +
                (t.done
                  ? '<span class="tick-ok">✓</span>'
                  : '<button type="button" class="btn-sm" data-act="task-done" data-id="' + esc(t.id) + '">Selesai</button>') +
                '<div><strong>' + esc(t.title) + '</strong>' +
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
    const ses = nextSession();
    const behind = belumSiap(ses);
    const head = '<th class="name">Siswa</th>' + db.weeks.map((w) => '<th>' + esc(w.id) + '</th>').join('') + '<th>Materi</th>';
    const body = people().map((s) => {
      const cells = db.weeks.map((w) => {
        const pct = progressPct(s.id, w.id);
        const cls = pct >= 75 ? 'p3' : pct >= 40 ? 'p2' : pct > 0 ? 'p1' : 'p0';
        return '<td class="' + cls + '">' + pct + '</td>';
      }).join('');
      return '<tr><td class="name"><button type="button" class="linkish" data-act="open-student" data-id="' + esc(s.id) + '">' + esc(s.name) + '</button></td>' +
        cells + '<td>' + lecDotStrip(s.id) + '</td></tr>';
    }).join('');
    return '<div class="grid-2">' +
      '<section class="card heat"><h2>Heatmap minggu × siswa</h2>' +
        '<table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
        '<p class="muted">Angka = % materi minggu itu yang ditandai selesai. Titik = 12 materi (selesai / terkunci / sisa). Bukan skor buatan.</p>' +
      '</section>' +
      '<section class="card"><h2>Belum siap kelas</h2>' +
        '<p class="muted">Wajib sebelum ' + esc(ses.title) + ': ' + (ses.required || []).map((lid) => esc((lectureById(lid) || {}).title || lid)).join(', ') + '</p>' +
        (behind.length
          ? behind.map((s) => '<div class="row" style="justify-content:space-between;margin:8px 0">' +
              '<button type="button" class="linkish" data-act="open-student" data-id="' + esc(s.id) + '">' + esc(s.name) + '</button>' +
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
    const nTxt = lectures().filter((l) => l.type === 'text').length;
    ensureSecFold();
    const toolbar = '<div class="kur-toolbar">' +
      '<div><h2 style="margin:0">Kurikulum</h2>' +
        '<p class="muted" style="margin:6px 0 0">' + nVid + ' video · ' + nTxt + ' bacaan · label bagian: ' + word.toLowerCase() +
        '. Cover &amp; file tinggal di browser ini.</p></div>' +
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
          coverHtml('week', w.id, 'cover-thumb') +
          '<button type="button" class="sec-caret" data-act="sec-fold" data-id="' + esc(w.id) + '"' +
            ' aria-expanded="' + open + '" aria-label="' + (open ? 'Tutup' : 'Buka') + ' bagian">' +
            '<i></i></button>' +
          (readonly
            ? '<h3 style="margin:0;flex:1">' + esc(w.title) + '</h3>'
            : '<input class="sec-title" data-act="sec-title" data-id="' + esc(w.id) + '" value="' + esc(w.title) + '" aria-label="Nama bagian">') +
          '<span class="muted sec-count">' + items.length + ' item</span>' +
          (readonly ? '' : '<div class="row sec-actions">' +
            '<label class="btn-sm">Cover<input type="file" hidden data-act="cover-file" data-kind="week" data-id="' + esc(w.id) + '" accept="image/*"></label>' +
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
      '<strong>Tambah item</strong>' +
      '<select name="kind">' +
        '<option value="video">Video</option>' +
        '<option value="file">File</option>' +
        '<option value="text">Teks / bacaan</option>' +
      '</select>' +
      '<input name="title" required maxlength="140" placeholder="Judul">' +
      '<label class="muted">Tautan YouTube / Drive / TikTok (video) atau URL file</label>' +
      '<input name="url" placeholder="https://…">' +
      '<p class="muted" style="margin:0">Video: MP4 maks 80 MB di browser ini. File lain maks 20 MB. Cover maks 5 MB.</p>' +
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
    const kindNote = l.type === 'video' ? videoKindLabel(l) : (l.type === 'text' ? 'Bacaan' : ((l.resources || []).length + ' file'));
    const head = '<div class="lec-edit-head">' +
      coverHtml('lec', l.id, 'cover-thumb') +
      '<div><strong>' + esc(l.title) + '</strong>' +
        '<div class="muted">' + esc(typeLabel(l.type)) + ' · ' + esc(kindNote) + (l.requiredBefore ? ' · wajib' : '') +
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
        const roll = people().map((st) => {
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
      '<p class="muted">Anton merchant (lynk.id / Mayar). Mentoring = live class + alat lynk (bukan Laris Affiliate). Satuan = checkbox produk. Status <strong>gratis</strong> = beasiswa.</p>' +
      '<div style="overflow:auto">' +
      '<table class="table"><thead><tr><th>Siswa</th><th>Status</th><th>Mentoring</th>' +
      skus.map((p) => '<th>' + esc(p.id) + '</th>').join('') +
      '<th>Nominal</th></tr></thead><tbody>' +
      SEED.students.map((s) => {
        const b = billingOf(s.id);
        const mentorOn = canMentoring(s.id);
        return '<tr><td>' + esc(s.name) + '<div class="muted">' + esc(b.note || b.plan || '') + '</div></td>' +
          '<td>' + payChip(b.status) + '<select data-act="bill-one" data-id="' + esc(s.id) + '" style="margin-top:6px">' +
          ['lunas', 'cicilan', 'belum', 'gratis', 'trial'].map((st) =>
            '<option' + (b.status === st ? ' selected' : '') + ' value="' + st + '">' + st + '</option>').join('') +
          '</select></td>' +
          '<td><input type="checkbox" data-act="ent-mentor" data-id="' + esc(s.id) + '"' +
          (mentorOn ? ' checked' : '') + (b.status === 'gratis' ? ' disabled' : '') + '></td>' +
          skus.map((p) =>
            '<td><input type="checkbox" data-act="ent-sku" data-id="' + esc(s.id) + '" data-sku="' + esc(p.id) + '"' +
            (canSku(s.id, p.id) ? ' checked' : '') + ((mentorOn && bundled(p)) ? ' disabled' : '') + '></td>'
          ).join('') +
          '<td>' + fmtRp(b.amount) + '<div class="muted">' + esc(b.source) + '</div></td></tr>';
      }).join('') + '</tbody></table></div></div>';
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
      if (cam.tab === 'tugas' && ui.personId) ui.taskPerson = ui.personId;
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
    render();
    clearTimeout(applyPresent._ready);
    applyPresent._ready = setTimeout(() => {
      ui.presentApplying = false;
      ui.presentReady = true;
    }, 250);
  }
  function reloadDb() {
    if (ui.presentApplying) return;
    db = load();
    render();
  }
  window.__antonSchool = { applyPresent: applyPresent, reloadDb: reloadDb };

  /* ── events ──────────────────────────────────────────────────────── */
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'role-switch') {
      if (ui.present) return;
      ui.role = t.value;
      ui.tab = 'home';
      ui.mentorTab = 'siswa';
      closeDrawer();
      render();
      return;
    }
    if (t.id === 'persona-switch') {
      if (ui.present) return;
      ui.personaId = t.value;
      ui.lectureId = db.lastLecture[ui.personaId] || firstLectureId();
      ui.kolabSel = new Set();
      ui.skuId = null;
      ui.skuPreview = false;
      ui.payPrompt = false;
      ui.examAnswers = {};
      ui.tab = needsWizard(ui.personaId) ? 'daftar' : 'home';
      render();
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
        act === 'cover-file' || act === 'res-file' || act === 'photo-file' || act === 'lec-body' || act === 'res-name' || act === 'res-url') {
      return;
    }
    if (act === 'tab') {
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
        toast('Video ini kebuka setelah mentoring lunas.');
        ui.tab = 'daftar';
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
      if (e.target.closest('a')) return;
      const id = btn.getAttribute('data-id');
      if (ui.skipOpen === id) return;
      openPerson(id);
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
    } else if (act === 'pay-later') {
      if (!db.applications[ui.personaId]) {
        toast('Isi form dulu.');
        return;
      }
      startTrial(ui.personaId);
      save();
      ui.tab = 'home';
      toast('Trial: video 1 kebuka. Diskon 24 jam dari jam form.');
      render();
    } else if (act === 'pay-now') {
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
      addTask(id, 'Follow-up ' + nameOf(id), '', isoNow());
      save();
      toast('Tugas ditambah');
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
    } else if (act === 'add-lec') {
      const weekId = form.getAttribute('data-week');
      const title = String(fd.get('title') || '').trim();
      const url = String(fd.get('url') || '').trim();
      const kind = String(fd.get('kind') || 'video');
      const file = form.querySelector('[name="videoFile"]') && form.querySelector('[name="videoFile"]').files[0];
      if (!title) return;
      if (kind === 'video' && !url && !file) {
        toast('Tempel tautan atau unggah file video.');
        return;
      }
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
      ui.editLecId = id;
      setSecOpen(weekId, true);
      save();
      if (kind === 'video' && file) {
        ingestVideoFile(file, { lecId: id });
      } else {
        toast(type === 'text' ? 'Bacaan ditambah. Isi teks di Ubah.' : (type === 'document' ? 'File ditambah.' : 'Video ditambah.'));
        render();
      }
    } else if (act === 'meet') {
      const ses = db.sessions.find((s) => s.id === form.getAttribute('data-id'));
      if (ses) ses.meetUrl = String(fd.get('meetUrl'));
      save();
      toast('Tautan Meet disimpan');
      render();
    } else if (act === 'apply') {
      const sid = ui.personaId;
      const s = student();
      const name = String(fd.get('name') || '').trim();
      const wa = String(fd.get('wa') || '').trim();
      db.applications[sid] = {
        name: name,
        wa: wa,
        experience: String(fd.get('experience') || '').trim(),
        why: String(fd.get('why') || '').trim(),
        at: isoNow()
      };
      s.name = name || s.name;
      s.wa = wa.replace(/\D/g, '') || s.wa;
      patchPerson(sid, { name: s.name, wa: s.wa });
      const b = billingOf(sid);
      if (!b.offerStartedAt) {
        b.offerStartedAt = isoNow();
        b.offerExpiresAt = addMs(isoNow(), 24 * 36e5);
      }
      setStage(sid, 'form', 'Form masuk. Jam diskon 24 jam dimulai.');
      save();
      ui.tab = 'daftar';
      toast('Form tersimpan. Lanjut pilih bayar.');
      render();
    } else if (act === 'add-task') {
      addTask(String(fd.get('personId')), String(fd.get('title')), String(fd.get('body') || ''), isoNow());
      save();
      toast('Tugas ditambah');
      render();
    } else if (act === 'save-dunning') {
      db.dunning.warningDays = Math.max(1, +fd.get('warningDays') || 5);
      db.dunning.graceDays = Math.max(0, +fd.get('graceDays') || 1);
      save();
      toast('Jeda perpanjangan disimpan');
      render();
    } else if (act === 'save-pricing') {
      db.pricing.monthlyIdr = +fd.get('monthlyIdr') || db.pricing.monthlyIdr;
      db.pricing.annualDiscountPct = +fd.get('annualDiscountPct') || 0;
      db.pricing.autopayDiscountPct = +fd.get('autopayDiscountPct') || 0;
      db.pricing.welcomeDiscountPct = +fd.get('welcomeDiscountPct') || 0;
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
        setStage(ui.personaId, 'lulus', 'Lulus tes ' + score + '/' + qs.length);
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
