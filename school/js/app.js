/* Sekolah Anton localhost prototype. No live WhatsApp, TikTok, Mayar, or Contabo. */
(function () {
  const SEED = window.ANTON_SEED;
  const KEY = 'anton-school-v1';
  const $ = (id) => document.getElementById(id);

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
      return Object.assign(defaultState(), JSON.parse(raw));
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
    kurOpen: false
  };

  function save() {
    const copy = { ...db, kolab: db.kolab };
    localStorage.setItem(KEY, JSON.stringify(copy));
  }

  function student() {
    return SEED.students.find((s) => s.id === ui.personaId) || SEED.students[0];
  }
  function billingOf(id) { return db.billing[id] || { status: 'belum' }; }
  function canLearn(id) { return billingOf(id).status !== 'belum'; }
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
      if (!canLearn(s.id)) return false;
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
    renderTabs();
  }

  function studentTabs() {
    return [
      { id: 'home', label: 'Home' },
      { id: 'belajar', label: 'Belajar' },
      { id: 'alat', label: 'Alat' },
      { id: 'diskusi', label: 'Diskusi' },
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
      dock.innerHTML = studentTabs().map((t) =>
        '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' +
        (t.id === ui.tab) + '">' + esc(t.label) + '</button>'
      ).join('');
    } else {
      dock.hidden = true;
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
      else if (tab === 'diskusi') main.innerHTML = viewDiskusi(false);
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
          (canLearn(s.id)
            ? '<button class="btn" data-act="open-lec" data-id="' + esc(last.id) + '">Buka materi</button>'
            : '<p class="muted">Belajar terkunci sampai Anton menandai pembayaran.</p>') +
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
            '<span class="muted"> · ' + esc(bill.plan || '') + (bill.note ? ' · ' + esc(bill.note) : '') + '</span></div>' +
        '</section>' +
      '</div>'
    );
  }

  function weekList(sid, weekId) {
    return '<ul class="list-check">' + lecturesInWeek(weekId).map((l) =>
      '<li><span>' + (isDone(sid, l.id) ? '✓ ' : '') + esc(l.title) + '</span>' +
      '<button class="btn-sm" data-act="open-lec" data-id="' + esc(l.id) + '">Buka</button></li>'
    ).join('') + '</ul>';
  }

  function viewLocked() {
    const s = student();
    return '<div class="locked">' +
      '<h2>Materi dikunci</h2>' +
      '<p class="muted">Anton belum menandai pembayaranmu (lunas, cicilan, atau beasiswa). LarisID tidak menahan uang — ini ledger kelas Anton. Tanya dia di WhatsApp, atau cek lynk.id kamu.</p>' +
      '<a class="wa" href="' + esc(waLink(SEED.staff[0].wa, 'Halo Anton, mau konfirmasi pembayaran Batch September.')) + '" target="_blank" rel="noopener">Chat Anton</a>' +
      '</div>';
  }

  function viewBelajar() {
    if (!canLearn(ui.personaId)) return viewLocked();
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
      body = '<iframe sandbox="allow-scripts allow-forms allow-same-origin" src="' + esc(lec.iframe) + '" title="' + esc(lec.title) + '"></iframe>';
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

  function viewAlat() {
    if (!canLearn(ui.personaId)) return viewLocked();
    const tools = lectures().filter((l) => l.type === 'tool');
    return '<h2 style="margin:0 0 12px">Alat Anton</h2>' +
      '<p class="muted" style="margin-top:0">Sama dengan materi di Belajar — dibuka di canvas yang sama, bukan aplikasi kedua.</p>' +
      '<div class="tool-grid">' + tools.map((l) =>
        '<button type="button" class="card tool-tile" data-act="open-lec" data-id="' + esc(l.id) + '">' +
          '<h3>' + esc(l.title) + '</h3>' +
          '<p class="muted">' + esc(l.job || 'Alat kelas') + '</p>' +
        '</button>'
      ).join('') + '</div>';
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
    if (!canLearn(ui.personaId) && !isStaff()) return viewLocked();
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
      '<p style="margin-top:8px"><strong>SKU:</strong> ' + esc(SEED.product.name) + ' · tawaran awal ' + SEED.product.suggestedCommission + '% (dari ekonomi produk, bukan biaya LarisID)</p>' +
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
        '<td>' + payChip(billingOf(s.id).status) + '</td>' +
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
      '<h3>Ledger</h3><p class="muted">' + esc(b.plan) + ' · ' + fmtRp(b.amount) + ' · ' + esc(b.source) +
      (b.note ? ' · ' + esc(b.note) : '') + '</p>' +
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
    const tools = lectures().filter((l) => l.type === 'tool');
    return '<div class="card"><h2>Perpustakaan alat</h2>' +
      '<p class="muted">Tile lynk.id, lecture Udemy. Iframe sandbox, tanpa eval di origin Laris.</p>' +
      '<div class="tool-grid">' + tools.map((l) =>
        '<div class="card"><h3>' + esc(l.title) + '</h3><p class="muted">' + esc(l.job || l.iframe || 'Kolab native') +
        '</p><p class="muted">Minggu: ' + esc((db.weeks.find((w) => w.id === l.weekId) || {}).title || '') + '</p></div>'
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
    return '<div class="card"><h2>Pembayaran</h2>' +
      '<p class="muted">Anton merchant (lynk.id / Mayar). LarisID tidak memegang uang. Status <strong>gratis</strong> = beasiswa, bukan diskon palsu.</p>' +
      '<table class="table"><thead><tr><th>Siswa</th><th>Status</th><th>Sumber</th><th>Nominal</th><th></th></tr></thead><tbody>' +
      SEED.students.map((s) => {
        const b = billingOf(s.id);
        return '<tr><td>' + esc(s.name) + '</td><td>' + payChip(b.status) + '</td><td>' + esc(b.source) + '</td><td>' + fmtRp(b.amount) + '</td>' +
          '<td><select data-act="bill-one" data-id="' + esc(s.id) + '">' +
          ['lunas', 'cicilan', 'belum', 'gratis'].map((st) =>
            '<option' + (b.status === st ? ' selected' : '') + ' value="' + st + '">' + st + '</option>').join('') +
          '</select></td></tr>';
      }).join('') + '</tbody></table></div>';
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
      db.billing[id].status = t.value;
      db.billing[id].updatedAt = new Date().toISOString();
      save();
      toast('Ledger ' + nameOf(id) + ' → ' + t.value);
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
      if (isStaff()) ui.mentorTab = id; else ui.tab = id;
      if (id === 'belajar' && isStaff()) { /* no-op */ }
      render();
    } else if (act === 'toggle-kur') {
      ui.kurOpen = !ui.kurOpen;
      render();
    } else if (act === 'open-lec') {
      ui.lectureId = btn.getAttribute('data-id');
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
