/* LarisRise cohort UI on the current SPA. Member-only; public users never see it. */
(function (global) {
  'use strict';

  let sb = null;
  let me = null;
  let esc = function (s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  let toast = function () {};
  let isAdmin = function () { return false; };
  let openProfile = function () {};
  // Injected by gpt-app's mountLarisCohort. The AI machinery lives there; this
  // module only owns the tab, the form and the follow-up offer.
  let runRencana = null;
  let trackKeyword = null;

  const VERIFIED_BADGES = {
    first_listing: 1, first_sale_verified: 1, first_review: 1,
    lima_produk: 1, sepuluh_terjual: 1, dua_toko: 1,
  };

  const RISE_COHORT = 'batch-1';
  const RISE_STATUS = [
    { key: 'diterima',         label: 'Diterima', cls: 'ok' },
    { key: 'baru',             label: 'Baru', cls: 'info' },
    { key: 'mungkin',          label: 'Mungkin', cls: 'warn' },
    { key: 'batch_berikutnya', label: 'Batch berikutnya', cls: 'mute' },
    { key: 'ditolak',          label: 'Ditolak', cls: 'mute' },
  ];

  const state = {
    studentCohortId: null,
    mentorCohort: null,
    cohortMap: {},
    memberNames: {},
    studentTab: 'ringkasan',
    mentorTab: 'overview',
    rankBoard: 'produk',
    ready: false,
    riseApps: [],
    riseFilter: 'all',
    riseOpenId: null,
    // Set by "Lihat sebagai siswa": the cohort a mentor/admin is previewing.
    // While it is set the student view renders for that cohort and the mentor
    // wrap is hidden, so the preview is the student's screen, not a superset.
    previewCid: null,
    // Mentor shell: the student half of the view is not rendered at all, rather
    // than rendered and hidden — a mentor has no Toko Saya, and four queries for
    // a wrap nobody can see is just latency.
    mentorOnly: false,
  };

  function supabase() { return sb && sb(); }
  function user() { return me && me(); }

  function $(id) { return document.getElementById(id); }

  /** The cohort the student view is currently rendering. */
  function studentCid() {
    return state.previewCid || state.studentCohortId;
  }

  /** True where a mentor gets mentor-shaped output. Preview drops it on purpose:
   *  the rankings board shows mentors everyone and students only the top 10 plus
   *  themselves, so leaving this true would show the wrong board in the preview. */
  function canMentor() {
    return !state.previewCid && !!(state.mentorCohort || isAdmin());
  }

  async function rpc(name, args) {
    const client = supabase();
    if (!client) throw new Error('no supabase');
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function initMembership() {
    const client = supabase();
    const u = user();
    const btn = $('btn-cohort');
    state.studentCohortId = null;
    state.mentorCohort = null;
    state.cohortMap = {};
    if (!client || !u) {
      if (btn) btn.style.display = 'none';
      return false;
    }
    const { data: mem } = await client
      .from('cohort_members')
      .select('cohort_id,role,status')
      .eq('user_id', u.id)
      .eq('status', 'active');
    const ids = [...new Set((mem || []).map(m => m.cohort_id).filter(Boolean))];
    let led = [];
    if (isAdmin()) {
      const r = await client.from('cohorts').select('*').order('created_at', { ascending: false });
      led = r.data || [];
    } else {
      const r = await client.from('cohorts').select('*').eq('mentor_user_id', u.id);
      led = r.data || [];
    }
    (led || []).forEach(c => { state.cohortMap[c.id] = c; });
    if (ids.length) {
      const { data: rows } = await client.from('cohorts').select('*').in('id', ids);
      (rows || []).forEach(c => { state.cohortMap[c.id] = c; });
    }
    const stu = (mem || []).find(m => m.role === 'student');
    state.studentCohortId = stu ? stu.cohort_id : null;
    state.mentorCohort = (led && led[0]) || null;
    const show = !!(state.studentCohortId || state.mentorCohort || isAdmin());
    if (btn) btn.style.display = show ? '' : 'none';
    return show;
  }

  async function loadNames(cohortId) {
    state.memberNames = {};
    if (!cohortId) return;
    try {
      const data = await rpc('cohort_member_names', { p_cohort: cohortId });
      (data || []).forEach(r => { if (r.user_id) state.memberNames[r.user_id] = r.display_name; });
    } catch (_) {}
  }

  function who(uid, fallback) {
    const u = user();
    if (u && uid === u.id) return 'Kamu';
    return state.memberNames[uid] || fallback || 'Anggota';
  }

  async function join() {
    const inp = $('cohort-invite-input');
    const st = $('cohort-join-status');
    const code = (inp && inp.value || '').trim();
    if (!code) { if (st) st.textContent = 'Masukkan kode undangan kohort.'; return; }
    if (st) st.textContent = 'Menggabung…';
    try {
      await rpc('join_cohort', { p_invite: code });
      if (st) st.textContent = 'Berhasil gabung.';
      await initMembership();
      await render();
    } catch (e) {
      if (st) st.textContent = (e && e.message) || 'Gagal gabung.';
    }
  }

  /* ── Rencana Jualan ──────────────────────────────────────────────────────
   *
   * Bound once, lazily, the first time the tab is opened -- render() runs on
   * every tab switch and every roster refresh, so binding there would stack a
   * fresh click handler on the button each time and fire one run per stacked
   * listener.
   */
  let rencanaBound = false;
  let rencanaBusy = false;
  let rencanaPasar = '';

  function mountRencana() {
    if (rencanaBound) return;
    rencanaBound = true;
    const go = $('rjl-go');
    const track = $('rjl-track');
    if (go) go.addEventListener('click', function () { void runRencanaFlow(); });
    if (track) track.addEventListener('click', function () { void trackRencanaPasar(); });
    // Enter anywhere in the form submits, the way a one-field form should.
    ['rjl-produk', 'rjl-kota', 'rjl-modal'].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); void runRencanaFlow(); }
      });
    });
  }

  /** "Rp 15.000" / "15,000" / "15rb" -> 15000. Returns 0 when unreadable. */
  function parseModal(raw) {
    let t = String(raw == null ? '' : raw).toLowerCase().trim();
    if (!t) return 0;
    const rb = /(\d+(?:[.,]\d+)?)\s*(rb|ribu|k)\b/.exec(t);
    if (rb) return Math.round(parseFloat(rb[1].replace(',', '.')) * 1000);
    const jt = /(\d+(?:[.,]\d+)?)\s*(jt|juta)\b/.exec(t);
    if (jt) return Math.round(parseFloat(jt[1].replace(',', '.')) * 1e6);
    const digits = t.replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  async function runRencanaFlow() {
    if (rencanaBusy) return;
    const status = $('rjl-status');
    const thread = $('cohort-rencana-thread');
    const after = $('cohort-rencana-after');
    const produk = (($('rjl-produk') || {}).value || '').trim();
    if (!produk) {
      if (status) status.textContent = 'Sebut dulu produk yang mau kamu jual.';
      return;
    }
    if (typeof runRencana !== 'function') {
      if (status) status.textContent = 'Fitur ini belum siap di halaman ini. Muat ulang halaman.';
      return;
    }
    rencanaBusy = true;
    rencanaPasar = '';
    const go = $('rjl-go');
    if (go) go.disabled = true;
    if (status) status.textContent = 'Membaca data pasar…';
    if (after) after.style.display = 'none';
    // A second run replaces the first rather than stacking under it: two plans
    // for two different products in one scroll is how a student loses the thread.
    if (thread) { thread.innerHTML = ''; thread.style.display = ''; }

    try {
      const res = await runRencana({
        produk: produk,
        kota: (($('rjl-kota') || {}).value || '').trim(),
        modal: parseModal(($('rjl-modal') || {}).value),
      }, { root: thread });
      if (status) status.textContent = '';
      // res is null when the AI gate declined (logged out, or _useAi refused).
      // The bubble already said so, so this must not overwrite it with success.
      if (res && res.pasar) {
        rencanaPasar = res.pasar;
        const copy = $('rjl-after-copy');
        if (copy) {
          copy.textContent = 'Simpan "' + rencanaPasar + '" di pantauan supaya kamu '
            + 'dikabari saat harga, jumlah penjual, atau penjualan di pasar ini bergerak. '
            + 'Kami akan mulai memeriksa pasar ini setiap hari.';
        }
        if (after) after.style.display = '';
        const ts = $('rjl-track-status');
        if (ts) ts.textContent = '';
        const tb = $('rjl-track');
        if (tb) tb.disabled = false;
      }
    } catch (e) {
      if (status) status.textContent = (e && e.message) || 'Gagal menyusun rencana.';
    } finally {
      rencanaBusy = false;
      if (go) go.disabled = false;
    }
  }

  async function trackRencanaPasar() {
    const ts = $('rjl-track-status');
    if (!rencanaPasar) { if (ts) ts.textContent = 'Belum ada pasar untuk dipantau.'; return; }
    if (typeof trackKeyword !== 'function') {
      if (ts) ts.textContent = 'Buka halaman Pantauan untuk menambahkannya.';
      return;
    }
    const btn = $('rjl-track');
    if (btn) btn.disabled = true;
    if (ts) ts.textContent = 'Menyimpan…';
    try {
      // add_tracked_keyword reports refusals as { ok:false, error } instead of
      // throwing, so a refused add must not be reported back as success.
      const d = await trackKeyword(rencanaPasar, '');
      if (d && d.ok === false) {
        if (ts) ts.textContent = ({
          limit_reached: 'Daftar pantauan sudah penuh. Buka Pantauan untuk mengatur.',
          already_tracked: '"' + rencanaPasar + '" sudah kamu pantau.',
          keyword_too_short: 'Keyword ini terlalu pendek untuk dipantau.',
        })[d.error] || 'Tidak bisa menambah pantauan sekarang.';
        if (btn) btn.disabled = false;
        return;
      }
      if (ts) ts.textContent = 'Tersimpan. Pasar ini masuk antrean scrape harian.';
    } catch (e) {
      if (ts) ts.textContent = (e && e.message) || 'Gagal menyimpan.';
      if (btn) btn.disabled = false;
    }
  }

  function switchStudentTab(tab) {
    state.studentTab = tab;
    document.querySelectorAll('#cohort-student-subtabs .cohort-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.cstab === tab);
    });
    ['ringkasan', 'rencana', 'feed', 'rankings', 'chat', 'jadwal'].forEach(t => {
      const el = $('cohort-student-panel-' + t);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    const cid = studentCid();
    if (tab === 'rencana') mountRencana();
    if (tab === 'feed' && cid) void renderFeed(cid);
    if (tab === 'rankings' && cid) void renderRankings(cid);
    if (tab === 'jadwal' && cid) void renderJadwal(cid, false);
    if (tab === 'ringkasan' && cid) void renderTokoSaya(cid);
  }

  function switchMentorTab(tab) {
    state.mentorTab = tab;
    document.querySelectorAll('#cohort-mentor-subtabs .cohort-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.cmtab === tab);
    });
    // In the mentor shell the sidebar IS the tab row, so it carries the state.
    const navId = { overview: 'btn-mentor-dash', students: 'btn-mentor-siswa', jadwal: 'btn-mentor-jadwal' };
    Object.keys(navId).forEach(t => {
      const b = $(navId[t]);
      if (b) b.classList.toggle('active', t === tab);
    });
    ['overview', 'students', 'jadwal'].forEach(t => {
      const el = $('cohort-mentor-panel-' + t);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    const c = state.mentorCohort;
    if (tab === 'students') void renderRiseStudents();
    if (!c) return;
    if (tab === 'overview') { void renderMentorDash(c.id); void renderWins(c.id); }
    if (tab === 'students') void renderRoster(c.id);
    if (tab === 'jadwal') void renderJadwal(c.id, true);
  }

  function riseStatusMeta(key) {
    return RISE_STATUS.find(s => s.key === key) || { key: key, label: key || '—', cls: 'mute' };
  }

  function fmtWa(wa) {
    const d = String(wa || '');
    return d.indexOf('62') === 0 ? '+' + d : d;
  }

  function waHref(wa) {
    return 'https://wa.me/' + String(wa || '').replace(/[^0-9]/g, '');
  }

  function riseInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    return parts.map(p => (p.charAt(0) || '').toUpperCase()).join('') || '?';
  }

  async function renderRiseStudents() {
    const host = $('cohort-rise-list');
    const countEl = $('cohort-rise-count');
    const filters = $('cohort-rise-filters');
    if (!host) return;
    host.innerHTML = '<p class="cohort-muted">Memuat pendaftar LaRISE…</p>';
    try {
      const rows = await rpc('rise_applications_list', { p_cohort: RISE_COHORT }) || [];
      state.riseApps = Array.isArray(rows) ? rows : [];
    } catch (e) {
      state.riseApps = [];
      host.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal memuat pendaftar LaRISE.')}</p>`;
      if (countEl) countEl.textContent = '';
      return;
    }
    const n = state.riseApps.length;
    if (countEl) {
      countEl.textContent = n
        ? n + ' pendaftar · Batch 1'
        : 'Belum ada yang daftar';
    }
    if (filters) {
      const chips = [{ key: 'all', label: 'Semua' }].concat(RISE_STATUS.map(s => ({ key: s.key, label: s.label })));
      filters.innerHTML = chips.map(s => {
        const k = s.key === 'all' ? n : state.riseApps.filter(r => r.status === s.key).length;
        const on = state.riseFilter === s.key ? ' active' : '';
        return `<button type="button" class="cohort-subtab${on}" data-rise-filter="${esc(s.key)}">${esc(s.label)} <span class="cohort-chip-n">${k}</span></button>`;
      }).join('');
      filters.querySelectorAll('[data-rise-filter]').forEach(b => {
        b.addEventListener('click', () => {
          state.riseFilter = b.getAttribute('data-rise-filter') || 'all';
          paintRiseStudents();
          filters.querySelectorAll('.cohort-subtab').forEach(x => {
            x.classList.toggle('active', x.getAttribute('data-rise-filter') === state.riseFilter);
          });
        });
      });
    }
    paintRiseStudents();
    if (state.riseOpenId) openRiseStudent(state.riseOpenId);
  }

  function paintRiseStudents() {
    const host = $('cohort-rise-list');
    if (!host) return;
    const filter = state.riseFilter || 'all';
    const rows = state.riseApps.filter(r => filter === 'all' || r.status === filter);
    if (!state.riseApps.length) {
      host.innerHTML = '<p class="cohort-empty">Belum ada yang mengisi formulir LaRISE. Pendaftar dari <a href="/rise/daftar/" target="_blank" rel="noopener">larisid.com/rise/daftar</a> muncul di sini.</p>';
      return;
    }
    if (!rows.length) {
      host.innerHTML = '<p class="cohort-empty">Tidak ada pendaftar di status ini.</p>';
      return;
    }
    host.innerHTML = rows.map(r => {
      const st = riseStatusMeta(r.status);
      const meta = [r.kota, r.kampus, r.jam_per_minggu ? r.jam_per_minggu + ' jam/mgg' : '']
        .filter(Boolean).join(' · ');
      return `<button type="button" class="cohort-siswa-row" data-rise-open="${esc(r.id)}">
        <span class="cohort-siswa-av" aria-hidden="true">${esc(riseInitials(r.nama))}</span>
        <span class="cohort-siswa-body">
          <strong>${esc(r.nama)}</strong>
          <span class="cohort-muted">${esc(meta || '—')}</span>
        </span>
        <span class="cohort-pill ${st.cls}">${esc(st.label)}</span>
      </button>`;
    }).join('');
    host.querySelectorAll('[data-rise-open]').forEach(b => {
      b.addEventListener('click', () => openRiseStudent(b.getAttribute('data-rise-open')));
    });
  }

  function riseQa(label, value) {
    const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
    const shown = empty ? 'Tidak diisi' : (Array.isArray(value) ? value.join(', ') : String(value));
    return `<div class="cohort-siswa-qa"><dt>${esc(label)}</dt><dd${empty ? ' class="is-empty"' : ''}>${esc(shown)}</dd></div>`;
  }

  function openRiseStudent(id) {
    const ov = $('mentor-siswa-overlay');
    const nameEl = $('mentor-siswa-name');
    const subEl = $('mentor-siswa-sub');
    const body = $('mentor-siswa-body');
    if (!ov || !body) return;
    const r = state.riseApps.find(x => x.id === id);
    if (!r) return;
    state.riseOpenId = id;
    const st = riseStatusMeta(r.status);
    if (nameEl) nameEl.textContent = r.nama || 'Pendaftar';
    if (subEl) {
      const wa = r.whatsapp
        ? `<a href="${esc(waHref(r.whatsapp))}" target="_blank" rel="noopener">${esc(fmtWa(r.whatsapp))}</a>`
        : '';
      const em = r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '';
      subEl.innerHTML = [wa, em].filter(Boolean).join(' · ')
        + ` <span class="cohort-pill ${st.cls}">${esc(st.label)}</span>`;
    }
    const onboarded = r.user_id
      ? `<button type="button" class="cohort-btn secondary sm" data-rise-profile="${esc(r.user_id)}">Profil LarisID</button>`
      : '<p class="cohort-muted">Belum punya akun LarisID — baru isi formulir program.</p>';
    body.innerHTML =
      `<div class="cohort-siswa-grid">
        ${riseQa('Kota', r.kota)}
        ${riseQa('Kampus', r.kampus)}
        ${riseQa('Jurusan', r.jurusan)}
        ${riseQa('Semester', r.semester)}
        ${riseQa('Perangkat', r.perangkat)}
        ${riseQa('Jam per minggu', r.jam_per_minggu)}
      </div>
      ${riseQa('Pengalaman jualan', r.pengalaman_jualan)}
      ${riseQa('Ide produk', r.ide_produk)}
      ${riseQa('Hari tersedia', r.hari_tersedia)}
      ${riseQa('Kenapa ingin ikut LaRISE', r.alasan)}
      ${riseQa('Target 3 bulan', r.target_3bulan)}
      <div class="cohort-siswa-acts">
        ${r.whatsapp ? `<a class="cohort-btn" href="${esc(waHref(r.whatsapp))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${onboarded}
      </div>`;
    body.querySelectorAll('[data-rise-profile]').forEach(b => {
      b.addEventListener('click', () => openProfile(b.getAttribute('data-rise-profile')));
    });
    ov.classList.add('open');
    ov.setAttribute('aria-hidden', 'false');
  }

  function closeRiseStudent() {
    const ov = $('mentor-siswa-overlay');
    state.riseOpenId = null;
    if (!ov) return;
    ov.classList.remove('open');
    ov.setAttribute('aria-hidden', 'true');
  }

  /* The dashboard's "general" numbers. Derived from cohort_roster_health, the
   * same call the Siswa table makes, so this adds no new query shape and cannot
   * disagree with the roster it summarises. */
  async function renderMentorDash(cid) {
    const root = $('cohort-mentor-stats');
    if (!root) return;
    try {
      const rows = await rpc('cohort_roster_health', { p_cohort: cid }) || [];
      const siswa = rows.length;
      const withShop = rows.filter(r => (r.toko || 0) > 0).length;
      const pending = rows.reduce((n, r) => n + (r.pending || 0), 0);
      const needHelp = rows.filter(r => r.help_rank && r.help_rank < 99).length;
      root.innerHTML = `<div class="cohort-stat-row">
        <div class="cohort-stat"><b>${siswa}</b><span>Siswa</span></div>
        <div class="cohort-stat"><b>${withShop}</b><span>Sudah ada toko</span></div>
        <div class="cohort-stat"><b>${pending}</b><span>Menunggu verifikasi</span></div>
        <div class="cohort-stat"><b>${needHelp}</b><span>Perlu bantuan</span></div>
      </div>`;
    } catch (e) {
      root.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal memuat ringkasan.')}</p>`;
    }
  }

  function boardStatusLabel(st) {
    if (st === 'included') return 'terverifikasi';
    if (st === 'excluded') return 'dikecualikan';
    if (st === 'needs_review') return 'perlu review';
    return 'menunggu verifikasi';
  }

  function fmtDay(d) {
    if (!d) return '';
    return String(d).slice(0, 10);
  }

  async function renderTokoSaya(cid) {
    const root = $('cohort-toko-saya');
    if (!root) return;
    root.innerHTML = '<p class="cohort-muted">Memuat toko…</p>';
    try {
      const stats = await rpc('cohort_my_shop_stats', { p_cohort: cid }) || {};
      const shops = stats.shops || [];
      const sensor = stats.sensor || 'dark';
      const snapDays = Number(stats.snapshot_days || 0);
      const lastCrawl = fmtDay(stats.last_snapshot_at || stats.sensor_day);
      const sensorLbl = sensor === 'ok' ? 'Crawl terakhir oke' : sensor === 'degraded' ? 'Crawl sebagian' : 'Belum ada data toko hari ini';
      const sensorTone = sensor === 'ok' ? 'ok' : 'warn';

      let shopHtml;
      if (!shops.length) {
        shopHtml = '<p class="cohort-muted">Belum ada toko tertaut. Tempel URL toko Shopee di bawah — angka terukur mulai setelah crawl harian.</p>';
      } else {
        shopHtml = shops.map(s => {
          const shown = s.handle || s.url || '';
          const href = s.url ? ` href="${esc(s.url)}" target="_blank" rel="noopener"` : '';
          return `<div class="cohort-shop-row">
            <span>${esc(s.platform)} · ${s.url ? `<a${href}>${esc(shown)}</a>` : esc(shown)} · ${esc(boardStatusLabel(s.board_status))}</span>
            <button type="button" class="cohort-btn secondary sm cohort-shop-del" data-id="${esc(s.id)}">Hapus</button>
          </div>`;
        }).join('');
      }

      let noteHtml = '';
      if (!shops.length) {
        noteHtml = '<p class="cohort-note warn">Minggu 1: tautkan satu toko Shopee. Platform lain boleh, tapi yang diukur crawl-nya baru Shopee.</p>';
      } else if (!(stats.shopee > 0)) {
        noteHtml = '<p class="cohort-note warn">Toko tertaut belum Shopee — crawl katalog baru jalan untuk Shopee. Tambah tautan shopee.co.id.</p>';
      } else if (snapDays === 0) {
        noteHtml = '<p class="cohort-note">Toko terhubung — angka terukur mulai setelah crawl harian (biasanya besok pagi).</p>';
      } else if (snapDays === 1) {
        noteHtml = '<p class="cohort-note">Toko terhubung — angka terukur mulai besok. Crawl pertama adalah baseline (belum ada perubahan terjual/ulasan).</p>';
      } else if (!(stats.terjual > 0) && !(stats.ulasan > 0)) {
        noteHtml = '<p class="cohort-note">Belum ada perubahan terjual/ulasan sejak pengukuran terakhir — normal untuk toko baru.</p>';
      }

      const dupes = stats.possible_dupes || [];
      let dupeHtml = '';
      if (dupes.length >= 2) {
        dupeHtml = `<div class="cohort-dupes">
          <div class="cohort-muted" style="margin-bottom:6px;">Punya duplikat? Produk yang sama di dua toko dihitung <strong>1 produk, 2 toko</strong>.</div>
          ${dupes.map(d => `<label class="cohort-dupe-row"><input type="checkbox" class="cohort-dupe-chk" value="${esc(d.id)}"> ${esc(d.platform)} — ${esc(d.title || '')}</label>`).join('')}
          <button type="button" class="cohort-btn secondary" style="margin-top:8px;" id="cohort-group-btn">Gabungkan sebagai 1 produk</button>
        </div>`;
      }

      root.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <h3 style="margin:0;">Toko Saya</h3>
          <span class="cohort-terukur">terukur</span>
        </div>
        <p class="cohort-sensor ${sensorTone}">${esc(sensorLbl)}${lastCrawl ? ' · ' + esc(lastCrawl) : ''}</p>
        <div class="cohort-stat-row">
          <div class="cohort-stat"><b>${stats.toko || 0}</b><span>Toko</span></div>
          <div class="cohort-stat"><b>${stats.produk || 0}</b><span>Produk</span></div>
          <div class="cohort-stat"><b>${stats.terjual || 0}</b><span>Terjual</span></div>
          <div class="cohort-stat"><b>${stats.ulasan || 0}</b><span>Ulasan</span></div>
        </div>
        <p class="cohort-muted" style="margin:0 0 8px;">Listing aktif: ${stats.listings || 0} (salinan lintas platform). Minggu ini: kemajuan dari toko, bukan estimasi.</p>
        ${shopHtml}
        ${noteHtml}
        <div class="cohort-shop-add">
          <input type="url" id="cohort-shop-url" class="cohort-input" maxlength="400" placeholder="https://shopee.co.id/namatoko" enterkeyhint="done">
          <button type="button" class="cohort-btn" id="cohort-shop-add">Tautkan</button>
        </div>
        <p id="cohort-shop-status" class="cohort-muted" style="margin:6px 0 0;"></p>
        ${dupeHtml}`;
      const gbtn = $('cohort-group-btn');
      if (gbtn) gbtn.addEventListener('click', () => void groupChecked(cid));
      const addBtn = $('cohort-shop-add');
      if (addBtn) addBtn.addEventListener('click', () => void linkShop(cid));
      const urlInp = $('cohort-shop-url');
      if (urlInp) urlInp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); void linkShop(cid); }
      });
      root.querySelectorAll('.cohort-shop-del').forEach(b => {
        b.addEventListener('click', () => void unlinkShop(cid, b.getAttribute('data-id')));
      });
    } catch (e) {
      root.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal memuat toko.')}</p>`;
    }
  }

  async function linkShop(cid) {
    const inp = $('cohort-shop-url');
    const st = $('cohort-shop-status');
    const url = (inp && inp.value || '').trim();
    if (!url) { if (st) st.textContent = 'Tempel tautan toko Shopee dulu.'; return; }
    if (st) st.textContent = 'Menyimpan…';
    try {
      await rpc('ssis_link_shop', { p_url: url });
      if (inp) inp.value = '';
      toast('Toko tertaut.');
      await renderTokoSaya(cid);
    } catch (e) {
      if (st) st.textContent = e.message || 'Gagal menautkan.';
    }
  }

  async function unlinkShop(cid, id) {
    if (!id) return;
    try {
      await rpc('ssis_unlink_shop', { p_id: id });
      toast('Toko dihapus.');
      await renderTokoSaya(cid);
    } catch (e) {
      toast(e.message || 'Gagal menghapus.');
    }
  }

  async function groupChecked(cid) {
    const ids = [...document.querySelectorAll('.cohort-dupe-chk:checked')].map(c => c.value);
    if (ids.length < 2) { toast('Pilih minimal dua listing.'); return; }
    try {
      await rpc('ssis_group_listings', { p_listing_ids: ids });
      toast('Digabung jadi 1 produk.');
      await renderTokoSaya(cid);
      if (state.studentTab === 'rankings') await renderRankings(cid);
    } catch (e) {
      toast(e.message || 'Gagal menggabung.');
    }
  }

  async function renderMilestones(cid) {
    const ul = $('cohort-milestone-list');
    if (!ul) return;
    const client = supabase();
    const u = user();
    if (!cid || !client || !u) { ul.innerHTML = '<li class="cohort-muted">—</li>'; return; }
    const { data: ms } = await client.from('milestones').select('id,title,sort_order').eq('cohort_id', cid).order('sort_order');
    const { data: done } = await client.from('user_milestone_progress').select('milestone_id').eq('user_id', u.id);
    const doneSet = new Set((done || []).map(d => d.milestone_id));
    if (!(ms || []).length) { ul.innerHTML = '<li class="cohort-muted">Belum ada milestone.</li>'; return; }
    ul.innerHTML = ms.map(m => `<li><span>${esc(m.title)}</span>${
      doneSet.has(m.id) ? '<span class="cohort-pill ok">Selesai</span>' : ''
    }</li>`).join('');
  }

  async function renderAnnouncements(cid) {
    const ul = $('cohort-announce-list');
    if (!ul) return;
    const client = supabase();
    if (!cid || !client) { ul.innerHTML = '<li class="cohort-muted">—</li>'; return; }
    const { data } = await client.from('cohort_announcements').select('title,body,created_at').eq('cohort_id', cid).order('created_at', { ascending: false }).limit(12);
    if (!(data || []).length) { ul.innerHTML = '<li class="cohort-muted">Belum ada pengumuman.</li>'; return; }
    ul.innerHTML = data.map(a => `<li style="display:block;"><div style="font-weight:700;">${esc(a.title)}</div><div class="cohort-muted">${esc((a.body || '').slice(0, 160))}</div></li>`).join('');
  }

  async function renderFeed(cid) {
    const root = $('cohort-feed-list');
    if (!root) return;
    const client = supabase();
    if (!cid || !client) { root.innerHTML = '<p class="cohort-muted">—</p>'; return; }
    const { data: posts } = await client.from('community_posts')
      .select('id,body,created_at,author_id,kind')
      .eq('cohort_id', cid).is('hidden_at', null)
      .order('created_at', { ascending: false }).limit(40);
    if (!(posts || []).length) { root.innerHTML = '<p class="cohort-muted">Belum ada aktivitas di feed.</p>'; return; }
    const kindLbl = { general: 'Umum', win: 'Menang', question: 'Pertanyaan', product_share: 'Produk', milestone_share: 'Milestone' };
    root.innerHTML = posts.map(p => {
      const u = user();
      const mine = u && p.author_id === u.id;
      const name = mine ? 'Kamu' : who(p.author_id, 'Anggota');
      return `<div class="cohort-feed-card">
        <div class="cohort-feed-kind">${esc(kindLbl[p.kind] || p.kind || 'Umum')}</div>
        <div class="cohort-feed-body">${esc(p.body)}</div>
        <div class="cohort-feed-meta">${esc(name)} · ${esc((p.created_at || '').slice(0, 16).replace('T', ' '))}</div>
      </div>`;
    }).join('');
  }

  async function submitPost() {
    const cid = studentCid() || (state.mentorCohort && state.mentorCohort.id);
    const bodyEl = $('cohort-post-body');
    const kindEl = $('cohort-post-kind');
    const body = (bodyEl && bodyEl.value || '').trim();
    if (!cid || !body) return;
    const client = supabase();
    const u = user();
    try {
      const { error } = await client.from('community_posts').insert({
        cohort_id: cid, author_id: u.id, body, kind: (kindEl && kindEl.value) || 'general',
      });
      if (error) throw error;
      if (bodyEl) bodyEl.value = '';
      await renderFeed(cid);
    } catch (e) {
      toast(e.message || 'Gagal kirim.');
    }
  }

  async function renderRankings(cid) {
    const host = $('cohort-rankings-board');
    const sum = $('cohort-rankings-summary');
    if (!host) return;
    document.querySelectorAll('#cohort-rank-chips .cohort-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.board === state.rankBoard);
    });
    host.innerHTML = '<p class="cohort-muted">Memuat…</p>';
    const labels = {
      aktivitas: 'Poin = aktivitas 30 hari. Bukan penjualan.',
      produk: 'Produk berbeda. Salinan Shopee+Tokopedia = 1. Terukur.',
      terjual: 'Unit terjual selama program (delta harian positif). Terukur.',
      ulasan: 'Ulasan baru selama program. Terukur.',
      konsistensi: 'Minggu dengan update listing. Terukur.',
    };
    if (sum) sum.textContent = labels[state.rankBoard] || '';
    try {
      const u = user();
      const mentor = canMentor();
      let rows = [];
      if (state.rankBoard === 'aktivitas') {
        try { rows = (await rpc('cohort_rankings_board', { p_cohort: cid, p_days: 30 })) || []; }
        catch (_) { rows = (await rpc('cohort_leaderboard', { p_cohort: cid, p_days: 30 })) || []; }
        rows = rows.map(r => ({ ...r, value: r.points, delta_week: 0 }));
      } else {
        rows = (await rpc('cohort_shop_leaderboard', { p_cohort: cid, p_board: state.rankBoard })) || [];
      }
      if (!rows.length) {
        host.innerHTML = '<p class="cohort-muted">Belum ada data papan ini. Tautkan toko dulu, lalu mentor verifikasi.</p>';
        return;
      }
      const mine = rows.find(r => u && r.user_id === u.id);
      const shown = mentor ? rows : rows.filter(r => r.rank <= 10 || (u && r.user_id === u.id));
      const fmt = r => {
        const isMe = u && r.user_id === u.id;
        const name = isMe ? 'Kamu' : (r.display_name || who(r.user_id, '#' + r.rank));
        const delta = r.delta_week ? ` · +${r.delta_week} minggu ini` : '';
        const click = isMe ? '' : ` data-uid="${esc(r.user_id)}"`;
        return `<div class="cohort-rank-row${isMe ? ' is-me' : ''}"${click}><span>#${r.rank} ${esc(name)}</span><span style="font-weight:800;">${r.value}${delta}</span></div>`;
      };
      let html = shown.map(fmt).join('');
      if (!mentor && mine && Number(mine.rank) > 10) {
        html += fmt(mine);
      }
      host.innerHTML = html;
      host.querySelectorAll('[data-uid]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => openProfile(el.getAttribute('data-uid')));
      });
    } catch (e) {
      host.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal memuat rankings.')}</p>`;
    }
  }

  async function renderJadwal(cid, asMentor) {
    const root = asMentor ? $('cohort-mentor-jadwal') : $('cohort-student-jadwal');
    if (!root) return;
    const client = supabase();
    const { data: sessions } = await client.from('cohort_sessions')
      .select('id,session_date,start_time,end_time,title,notes,meet_url,location')
      .eq('cohort_id', cid)
      .order('session_date', { ascending: true });
    if (!(sessions || []).length) {
      root.innerHTML = '<p class="cohort-muted">Belum ada sesi di kalender.</p>';
      return;
    }
    const api = 'https://api.larisid.com/functions/v1/cohort-calendar-ics';
    const cal = `<p class="cohort-muted" style="margin-bottom:10px;"><a href="webcal://${api.replace(/^https?:\/\//, '')}?cohort=${encodeURIComponent(cid)}">Tambah ke Google Calendar</a></p>`;
    root.innerHTML = cal + sessions.map(s => {
      const meet = s.meet_url ? `<a href="${esc(s.meet_url)}" target="_blank" rel="noopener">Buka Zoom</a>` : '';
      const roll = asMentor
        ? `<button type="button" class="cohort-btn secondary" data-sid="${esc(s.id)}" data-act="roll">Hadir</button>`
        : '';
      return `<div class="cohort-card" style="margin-bottom:10px;">
        <div style="font-weight:800;">${esc(s.title || '')} · ${esc(s.session_date || '')} ${s.start_time ? esc(String(s.start_time).slice(0, 5)) : ''}</div>
        <div class="cohort-muted">${esc(s.notes || s.location || '')}</div>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">${meet}${roll}</div>
        <div id="cohort-roll-${esc(s.id)}"></div>
      </div>`;
    }).join('');
    if (asMentor) {
      root.querySelectorAll('[data-act="roll"]').forEach(btn => {
        btn.addEventListener('click', () => void openRoll(btn.getAttribute('data-sid')));
      });
      const remind = $('cohort-wa-remind');
      if (remind) remind.onclick = () => void sendWa('reminder', cid);
    }
  }

  /* Mentors schedule from here. Straight insert, not an RPC: the cs_insert policy
   * already gates on can_manage_cohort(cohort_id), so a non-mentor is refused by
   * the database rather than by a check in this file. */
  async function addSession() {
    const c = state.mentorCohort;
    const st = $('cses-status');
    const title = ($('cses-title') && $('cses-title').value || '').trim();
    const date = ($('cses-date') && $('cses-date').value || '').trim();
    const time = ($('cses-time') && $('cses-time').value || '').trim();
    const url = ($('cses-url') && $('cses-url').value || '').trim();
    if (!c) { if (st) st.textContent = 'Belum ada kohort.'; return; }
    if (!title || !date) { if (st) st.textContent = 'Isi judul dan tanggal dulu.'; return; }
    if (st) st.textContent = 'Menyimpan…';
    try {
      const { error } = await supabase().from('cohort_sessions').insert({
        cohort_id: c.id,
        title,
        session_date: date,
        start_time: time || null,
        meet_url: url || null,
      });
      if (error) throw error;
      ['cses-title', 'cses-date', 'cses-time', 'cses-url'].forEach(id => {
        const el = $(id); if (el) el.value = '';
      });
      if (st) st.textContent = 'Sesi ditambahkan.';
      toast('Sesi ditambahkan.');
      await renderJadwal(c.id, true);
    } catch (e) {
      if (st) st.textContent = (e && e.message) || 'Gagal menambah sesi.';
    }
  }

  async function openRoll(sessionId) {
    const box = $('cohort-roll-' + sessionId);
    if (!box) return;
    box.innerHTML = '<p class="cohort-muted">Memuat absensi…</p>';
    try {
      const rows = await rpc('session_list_attendance', { p_session: sessionId }) || [];
      box.innerHTML = `<table class="cohort-table"><thead><tr><th>Nama</th><th>Status</th></tr></thead><tbody>${
        rows.map(r => `<tr>
          <td>${esc(r.display_name)}</td>
          <td class="cohort-attend">
            ${['hadir', 'izin', 'absen'].map(st =>
              `<button type="button" class="${r.status === st ? 'on-' + st : ''}" data-uid="${esc(r.user_id)}" data-st="${st}">${st[0].toUpperCase() + st.slice(1)}</button>`
            ).join('')}
          </td>
        </tr>`).join('')
      }</tbody></table>`;
      box.querySelectorAll('[data-st]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await rpc('session_set_attendance', {
              p_session: sessionId,
              p_user: btn.getAttribute('data-uid'),
              p_status: btn.getAttribute('data-st'),
            });
            await openRoll(sessionId);
          } catch (e) { toast(e.message || 'Gagal menandai.'); }
        });
      });
    } catch (e) {
      box.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal.')}</p>`;
    }
  }

  async function renderRoster(cid) {
    const help = $('cohort-perlu-bantuan');
    const table = $('cohort-roster-table');
    if (table) table.innerHTML = '<p class="cohort-muted">Memuat…</p>';
    try {
      const rows = await rpc('cohort_roster_health', { p_cohort: cid }) || [];
      const need = rows.filter(r => r.help_rank && r.help_rank < 99);
      if (help) {
        help.style.display = need.length ? '' : 'none';
        if (need.length) {
          help.innerHTML = `<h3>Perlu bantuan</h3>${need.map(r =>
            `<div class="cohort-help-row"><strong>${esc(r.display_name)}</strong> — ${esc(r.help_reason || '')}
              <button type="button" class="cohort-btn secondary sm" data-open="${esc(r.user_id)}">Profil</button>
            </div>`).join('')}`;
          help.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openProfile(b.getAttribute('data-open'))));
        }
      }
      if (!table) return;
      table.innerHTML = `<div style="overflow:auto;"><table class="cohort-table">
        <thead><tr><th>Nama</th><th>Toko</th><th>Produk</th><th>Crawl</th><th>Hadir</th><th>Flag</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td style="font-weight:600;cursor:pointer;" data-open="${esc(r.user_id)}">${esc(r.display_name)}</td>
          <td>${r.toko || 0}${r.pending ? ` <span class="cohort-pill warn">${r.pending} pending</span>` : ''}</td>
          <td>${r.produk || 0}</td>
          <td>${esc(r.sensor || '—')}${r.last_crawl_day ? `<div class="cohort-muted">${esc(fmtDay(r.last_crawl_day))}</div>` : ''}</td>
          <td>${r.hadir || 0} / absen ${r.absen || 0}</td>
          <td>${r.flag ? `<span class="cohort-pill warn">${esc(r.flag)}</span>` : '—'}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="cohort-btn secondary sm" data-inc="${esc(r.user_id)}">Verifikasi</button>
            <button type="button" class="cohort-btn secondary sm" data-exc="${esc(r.user_id)}">Kecualikan</button>
          </td>
        </tr>`).join('')}</tbody></table></div>`;
      table.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openProfile(b.getAttribute('data-open'))));
      table.querySelectorAll('[data-inc]').forEach(b => b.addEventListener('click', () => void setStudentShops(b.getAttribute('data-inc'), 'included')));
      table.querySelectorAll('[data-exc]').forEach(b => b.addEventListener('click', () => void setStudentShops(b.getAttribute('data-exc'), 'excluded')));
    } catch (e) {
      if (table) table.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal memuat roster.')}</p>`;
    }
  }

  async function setStudentShops(studentId, status) {
    const client = supabase();
    const { data: shops } = await client.from('student_account')
      .select('id').eq('student_id', studentId).eq('kind', 'shop').eq('active', true);
    try {
      for (const s of (shops || [])) {
        await rpc('ssis_set_shop_board_status', { p_id: s.id, p_status: status });
      }
      toast(status === 'included' ? 'Toko terverifikasi (masuk papan).' : 'Toko dikecualikan dari papan.');
      if (state.mentorCohort) await renderRoster(state.mentorCohort.id);
    } catch (e) {
      toast(e.message || 'Gagal mengubah status toko.');
    }
  }

  async function renderWins(cid) {
    const root = $('cohort-wins-digest');
    if (!root) return;
    try {
      const rows = await rpc('cohort_wins_digest', { p_cohort: cid, p_days: 14 }) || [];
      if (!rows.length) { root.innerHTML = '<p class="cohort-muted">Belum ada lencana terverifikasi minggu ini.</p>'; return; }
      root.innerHTML = rows.map(r => `<div class="cohort-win-row">
        <div><strong>${esc(r.display_name)}</strong> · ${esc(r.title)}
          <div class="cohort-muted">${esc((r.awarded_at || '').slice(0, 10))}</div></div>
        <button type="button" class="cohort-btn secondary" data-cel="${esc(r.user_id)}" data-key="${esc(r.key)}">Rayakan di feed</button>
      </div>`).join('');
      root.querySelectorAll('[data-cel]').forEach(b => {
        b.addEventListener('click', async () => {
          try {
            await rpc('cohort_celebrate_win', {
              p_cohort: cid, p_user: b.getAttribute('data-cel'), p_key: b.getAttribute('data-key'),
            });
            toast('Diposting ke feed kohort.');
          } catch (e) { toast(e.message || 'Gagal merayakan.'); }
        });
      });
    } catch (e) {
      root.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal.')}</p>`;
    }
  }

  async function postAnnouncement() {
    const c = state.mentorCohort;
    const title = ($('cohort-ann-title') && $('cohort-ann-title').value || '').trim();
    const body = ($('cohort-ann-body') && $('cohort-ann-body').value || '').trim();
    const wa = $('cohort-ann-wa') && $('cohort-ann-wa').checked;
    const st = $('cohort-ann-status');
    if (!c || !title || !body) { if (st) st.textContent = 'Isi judul dan isi.'; return; }
    const client = supabase();
    const u = user();
    try {
      const { error } = await client.from('cohort_announcements').insert({
        cohort_id: c.id, author_id: u.id, title, body,
      });
      if (error) throw error;
      if ($('cohort-ann-title')) $('cohort-ann-title').value = '';
      if ($('cohort-ann-body')) $('cohort-ann-body').value = '';
      if (st) st.textContent = 'Tersimpan.';
      if (wa) await sendWa('announcement', c.id, title + '\n\n' + body);
      if (state.studentCohortId) await renderAnnouncements(state.studentCohortId);
    } catch (e) {
      if (st) st.textContent = e.message || 'Gagal.';
    }
  }

  async function sendWa(kind, cohortId, text) {
    const client = supabase();
    const token = (function () {
      try {
        const raw = localStorage.getItem('laris_auth_v1');
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && parsed.access_token;
      } catch (_) { return null; }
    })();
    try {
      const { data, error } = await client.functions.invoke('send-cohort-whatsapp', {
        body: { cohort_id: cohortId, kind, text: text || '' },
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (error) throw error;
      const n = data && data.sent;
      toast(n != null ? `WhatsApp terkirim ke ${n} siswa.` : 'WhatsApp dikirim.');
    } catch (e) {
      toast((e && e.message) || 'Gagal kirim WhatsApp.');
    }
  }

  async function renderOps() {
    const root = $('adm-rise-ops');
    if (!root || !isAdmin()) return;
    try {
      const o = await rpc('ssis_ops_overview') || {};
      const cov = o.crawl_coverage || {};
      const covLine = cov.linked_shopee
        ? `Crawl hari ini: ${cov.ok_today || 0}/${cov.linked_shopee} toko Shopee (${cov.pct != null ? cov.pct + '%' : '—'}).`
        : 'Belum ada toko Shopee tertaut.';
      root.innerHTML = `<div class="cohort-stat-row">
        <div class="cohort-stat"><b>${o.active_shops || 0}</b><span>Toko aktif</span></div>
        <div class="cohort-stat"><b>${o.pending_shops || 0}</b><span>Menunggu verifikasi</span></div>
        <div class="cohort-stat"><b>${o.needs_review || 0}</b><span>Perlu review</span></div>
        <div class="cohort-stat"><b>${o.failed_raw || 0}</b><span>Parse gagal</span></div>
      </div>
      <p class="cohort-muted">${esc(covLine)}</p>
      <p class="cohort-muted">Sensor 2 hari: ${esc(JSON.stringify(o.sensor || []))}</p>`;
    } catch (e) {
      root.innerHTML = `<p class="cohort-muted">${esc(e.message || 'Gagal memuat ops.')}</p>`;
    }
  }

  /* ── "Lihat sebagai siswa" ────────────────────────────────────────────────
   *
   * A mentor/admin opens the student screen for a chosen cohort. Nothing is
   * impersonated: every RPC behind the student view is keyed on auth.uid(), so
   * Toko Saya and Milestone show the VIEWER's own rows. What the preview
   * faithfully reproduces is the shape of the screen — which cards exist, which
   * copy renders at zero shops, and the student-shaped rankings board — which is
   * the part that is otherwise impossible to check from an admin account.
   * The bar says so out loud rather than letting the numbers be misread.
   */
  function previewCohorts() {
    return Object.keys(state.cohortMap)
      .map(id => state.cohortMap[id])
      .filter(Boolean)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  function renderPreviewPicker() {
    const card = $('cohort-preview-card');
    const sel = $('cohort-preview-select');
    if (!card || !sel) return;
    const list = previewCohorts();
    card.style.display = list.length ? '' : 'none';
    const keep = sel.value;
    sel.innerHTML = list.map(c =>
      `<option value="${esc(c.id)}">${esc(c.name || 'Kohort')}</option>`).join('');
    if (keep && list.some(c => c.id === keep)) sel.value = keep;
    else if (state.studentCohortId && list.some(c => c.id === state.studentCohortId)) {
      sel.value = state.studentCohortId;
    }
  }

  function renderPreviewBar() {
    const bar = $('cohort-preview-bar');
    const txt = $('cohort-preview-bar-text');
    if (!bar) return;
    if (!state.previewCid) { bar.style.display = 'none'; return; }
    const c = state.cohortMap[state.previewCid];
    bar.style.display = '';
    if (txt) {
      txt.innerHTML = `<strong>Pratinjau siswa · ${esc(c && c.name || 'Kohort')}</strong>`
        + '<span class="cohort-muted" style="display:block;">Panel mentor disembunyikan. '
        + 'Angka di Toko Saya dan Milestone tetap milik akunmu sendiri — menautkan '
        + 'URL toko di sini menautkannya ke akunmu, bukan ke siswa mana pun.</span>';
    }
  }

  async function enterPreview() {
    const sel = $('cohort-preview-select');
    const cid = sel && sel.value;
    if (!cid) { toast('Pilih kohort dulu.'); return; }
    state.previewCid = cid;
    state.studentTab = 'ringkasan';
    await render();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
  }

  async function exitPreview() {
    if (!state.previewCid) return;
    state.previewCid = null;
    state.studentTab = 'ringkasan';
    await render();
  }

  async function render() {
    const stu = $('cohort-student-wrap');
    const men = $('cohort-mentor-wrap');
    const joinCard = $('cohort-join-card');
    const info = $('cohort-student-info');
    const sub = $('cohort-student-subtabs');
    const wa = $('cohort-wa-link');
    const preview = !!state.previewCid;
    const cid = studentCid();
    const c = cid && state.cohortMap[cid];

    renderPreviewBar();
    if (state.mentorOnly) {
      if (stu) stu.style.display = 'none';
      if (sub) sub.style.display = 'none';
      if (men) men.style.display = '';
      // The sidebar rail replaces the subtab row in this shell.
      const msub = $('cohort-mentor-subtabs');
      if (msub) msub.style.display = 'none';
      const sum = $('cohort-mentor-summary');
      if (sum && state.mentorCohort) {
        sum.innerHTML = `<strong>${esc(state.mentorCohort.name || 'Kohort')}</strong>`;
      }
      // The student-preview card is an admin affordance and a trap here: it calls
      // previewAs, which clears mentorOnly and would leave the mentor rail standing
      // over a student screen. Exit to the admin view to use it.
      const pcard = $('cohort-preview-card');
      if (pcard) pcard.style.display = 'none';
      switchMentorTab(state.mentorTab === 'report' ? 'overview' : state.mentorTab);
      return;
    }
    const msub = $('cohort-mentor-subtabs');
    if (msub) msub.style.display = '';
    if (stu) stu.style.display = '';
    // Preview hides the mentor wrap entirely — a student never sees it, so
    // leaving it on screen would make the preview a lie.
    if (men) men.style.display = (!preview && (state.mentorCohort || isAdmin())) ? '' : 'none';
    if (sub) sub.style.display = cid ? 'flex' : 'none';
    if (joinCard) joinCard.style.display = cid ? 'none' : '';

    if (!cid) {
      if (info) info.textContent = 'Kamu belum di kohort. Pakai kode undangan, atau minta mentor.';
    } else {
      if (info) info.innerHTML = `<strong>${esc(c && c.name || 'Kohort')}</strong><div class="cohort-muted">Aktif · feed dan papan hanya terlihat anggota</div>`;
      if (wa && c && c.whatsapp_invite_url) {
        wa.href = c.whatsapp_invite_url; wa.style.display = '';
      } else if (wa) wa.style.display = 'none';
      await loadNames(cid);
      await renderTokoSaya(cid);
      await renderMilestones(cid);
      await renderAnnouncements(cid);
      await renderFeed(cid);
    }

    const chatA = $('cohort-chat-wa');
    const miss = $('cohort-chat-wa-missing');
    const url = c && c.whatsapp_invite_url;
    if (chatA) {
      if (url) { chatA.href = url; chatA.style.display = ''; } else chatA.style.display = 'none';
    }
    if (miss) miss.style.display = cid && !url ? '' : 'none';

    if (state.mentorCohort && !preview) {
      const sum = $('cohort-mentor-summary');
      if (sum) sum.innerHTML = `<strong>${esc(state.mentorCohort.name || 'Kohort')}</strong>`;
      await renderRoster(state.mentorCohort.id);
    }
    if (!preview) renderPreviewPicker();
    switchStudentTab(state.studentTab);
    if (!preview && (state.mentorCohort || isAdmin())) switchMentorTab(state.mentorTab);
  }

  function bind() {
    if (state.ready) return;
    state.ready = true;
    $('cohort-join-btn')?.addEventListener('click', () => void join());
    document.querySelectorAll('#cohort-student-subtabs .cohort-subtab').forEach(b => {
      b.addEventListener('click', () => switchStudentTab(b.dataset.cstab));
    });
    document.querySelectorAll('#cohort-mentor-subtabs .cohort-subtab').forEach(b => {
      b.addEventListener('click', () => switchMentorTab(b.dataset.cmtab));
    });
    document.querySelectorAll('#cohort-rank-chips .cohort-subtab').forEach(b => {
      b.addEventListener('click', () => {
        state.rankBoard = b.dataset.board;
        const cid = studentCid() || (state.mentorCohort && state.mentorCohort.id);
        if (cid) void renderRankings(cid);
      });
    });
    $('cohort-preview-go')?.addEventListener('click', () => void enterPreview());
    $('cohort-preview-exit')?.addEventListener('click', () => void exitPreview());
    $('cses-add')?.addEventListener('click', () => void addSession());
    $('cohort-post-send')?.addEventListener('click', () => void submitPost());
    $('cohort-ann-send')?.addEventListener('click', () => void postAnnouncement());
    $('mentor-siswa-close')?.addEventListener('click', closeRiseStudent);
    $('mentor-siswa-overlay')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'mentor-siswa-overlay') closeRiseStudent();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.riseOpenId) closeRiseStudent();
    });
  }

  async function open() {
    bind();
    await initMembership();
    // A stale preview from a previous visit would hide the mentor panel with no
    // obvious cause, so every fresh open lands on the real view.
    state.previewCid = null;
    state.mentorOnly = false;
    await render();
  }

  global.LarisCohort = {
    initMembership,
    open,
    renderOps,
    hasAccess: function () { return !!(state.studentCohortId || state.mentorCohort || isAdmin()); },
    /** The cohort this account is genuinely a student in, or null. Student mode
     *  prefers it: a real membership needs no preview, so the screen is the
     *  student's own rows rather than a stand-in. */
    myStudentCohort: function () {
      const c = state.studentCohortId && state.cohortMap[state.studentCohortId];
      if (!c) return null;
      return { id: c.id, name: c.name || 'Kohort' };
    },
    /** The cohort this account genuinely leads, or null. Read AFTER the admin
     *  mask is up: unmasked, initMembership fills mentorCohort with the first of
     *  ALL cohorts, which says nothing about who actually mentors it. */
    myMentorCohort: function () {
      const c = state.mentorCohort;
      if (!c) return null;
      return { id: c.id, name: c.name || 'Kohort' };
    },
    /** Stand in as the mentor of a cohort this account does not actually lead —
     *  the fallback for an admin who mentors nothing, so "Mode mentor" shows a
     *  real roster instead of an empty panel. Expects open() to have just run,
     *  so it does not re-query membership. */
    mentorAs: async function (cid, row) {
      bind();
      if (!Object.keys(state.cohortMap).length) await initMembership();
      if (cid && row && !state.cohortMap[cid]) state.cohortMap[cid] = row;
      const c = cid && state.cohortMap[cid];
      if (!c) return false;
      state.previewCid = null;
      state.mentorCohort = c;
      state.mentorTab = 'overview';
      state.mentorOnly = true;
      await render();
      return true;
    },
    /** Sidebar rail entry point for the mentor shell. */
    mentorTab: function (tab) { bind(); switchMentorTab(tab); },
    /** Cohorts this account may preview, for the Admin dashboard picker. */
    listCohorts: async function () {
      if (!Object.keys(state.cohortMap).length) await initMembership();
      return previewCohorts().map(c => ({ id: c.id, name: c.name || 'Kohort' }));
    },
    /** Open the cohort view straight into the student preview. Same path as
     *  open(), except previewCid survives — open() deliberately clears it.
     *  `row` seeds cohortMap for a cohort initMembership cannot see: student
     *  mode masks isAdmin(), which is what drops the all-cohorts query, so the
     *  caller resolves the cohort first and hands it over or the bar would read
     *  "Kohort" with no name. */
    previewAs: async function (cid, row) {
      bind();
      state.mentorOnly = false;
      await initMembership();
      if (cid && row && !state.cohortMap[cid]) state.cohortMap[cid] = row;
      state.previewCid = cid || null;
      state.studentTab = 'ringkasan';
      await render();
      return !!state.previewCid;
    },
    mount: function (opts) {
      opts = opts || {};
      sb = opts.getSupabase;
      me = opts.getUser;
      if (opts.esc) esc = opts.esc;
      if (opts.toast) toast = opts.toast;
      if (opts.isAdmin) isAdmin = opts.isAdmin;
      if (opts.openProfile) openProfile = opts.openProfile;
      if (opts.runRencana) runRencana = opts.runRencana;
      if (opts.trackKeyword) trackKeyword = opts.trackKeyword;
    },
  };
})(window);
