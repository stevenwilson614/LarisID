/* LarisRise cohort UI on the current SPA. Member-only; public users never see it. */
(function (global) {
  'use strict';

  let sb = null;
  let me = null;
  let esc = function (s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  let toast = function () {};
  let isAdmin = function () { return false; };
  let openProfile = function () {};

  const VERIFIED_BADGES = {
    first_listing: 1, first_sale_verified: 1, first_review: 1,
    lima_produk: 1, sepuluh_terjual: 1, dua_toko: 1,
  };

  const state = {
    studentCohortId: null,
    mentorCohort: null,
    cohortMap: {},
    memberNames: {},
    studentTab: 'ringkasan',
    mentorTab: 'overview',
    rankBoard: 'produk',
    ready: false,
  };

  function supabase() { return sb && sb(); }
  function user() { return me && me(); }

  function $(id) { return document.getElementById(id); }

  function canMentor() {
    return !!(state.mentorCohort || isAdmin());
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

  function switchStudentTab(tab) {
    state.studentTab = tab;
    document.querySelectorAll('#cohort-student-subtabs .cohort-subtab').forEach(b => {
      b.classList.toggle('active', b.dataset.cstab === tab);
    });
    ['ringkasan', 'feed', 'rankings', 'chat', 'jadwal'].forEach(t => {
      const el = $('cohort-student-panel-' + t);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    const cid = state.studentCohortId;
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
    ['overview', 'students', 'report', 'jadwal'].forEach(t => {
      const el = $('cohort-mentor-panel-' + t);
      if (el) el.style.display = t === tab ? '' : 'none';
    });
    const c = state.mentorCohort;
    if (!c) return;
    if (tab === 'students') void renderRoster(c.id);
    if (tab === 'report') void renderWins(c.id);
    if (tab === 'jadwal') void renderJadwal(c.id, true);
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
      const sensorTone = sensor === 'ok' ? '#1A7A46' : '#B45309';

      let shopHtml;
      if (!shops.length) {
        shopHtml = '<p class="cohort-muted">Belum ada toko tertaut. Tempel URL toko Shopee di bawah — angka terukur mulai setelah crawl harian.</p>';
      } else {
        shopHtml = shops.map(s => {
          const shown = s.handle || s.url || '';
          const href = s.url ? ` href="${esc(s.url)}" target="_blank" rel="noopener"` : '';
          return `<div class="cohort-shop-row">
            <span>${esc(s.platform)} · ${s.url ? `<a${href}>${esc(shown)}</a>` : esc(shown)} · ${esc(boardStatusLabel(s.board_status))}</span>
            <button type="button" class="cohort-btn secondary cohort-shop-del" data-id="${esc(s.id)}" style="padding:4px 8px;">Hapus</button>
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
        dupeHtml = `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #E5E7EB;">
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
        <p class="cohort-muted" style="color:${sensorTone};margin:6px 0 0;">${esc(sensorLbl)}${lastCrawl ? ' · ' + esc(lastCrawl) : ''}</p>
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
    ul.innerHTML = ms.map(m => `<li><span>${esc(m.title)}</span><span style="font-weight:700;color:${doneSet.has(m.id) ? '#059669' : '#9CA3AF'}">${doneSet.has(m.id) ? 'Selesai ✓' : ''}</span></li>`).join('');
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
    const cid = state.studentCohortId || (state.mentorCohort && state.mentorCohort.id);
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
    root.innerHTML = sessions.map(s => {
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
            `<div style="padding:6px 0;border-bottom:1px solid #FED7AA;font-size:.78rem;"><strong>${esc(r.display_name)}</strong> — ${esc(r.help_reason || '')}
              <button type="button" class="cohort-btn secondary" style="margin-left:8px;padding:4px 8px;" data-open="${esc(r.user_id)}">Profil</button>
            </div>`).join('')}`;
          help.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openProfile(b.getAttribute('data-open'))));
        }
      }
      if (!table) return;
      table.innerHTML = `<div style="overflow:auto;"><table class="cohort-table">
        <thead><tr><th>Nama</th><th>Toko</th><th>Produk</th><th>Crawl</th><th>Hadir</th><th>Flag</th><th></th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td style="font-weight:600;cursor:pointer;" data-open="${esc(r.user_id)}">${esc(r.display_name)}</td>
          <td>${r.toko || 0}${r.pending ? ` <span class="cohort-pill" style="background:#FEF3C7;color:#92400E;">${r.pending} pending</span>` : ''}</td>
          <td>${r.produk || 0}</td>
          <td>${esc(r.sensor || '—')}${r.last_crawl_day ? `<div class="cohort-muted">${esc(fmtDay(r.last_crawl_day))}</div>` : ''}</td>
          <td>${r.hadir || 0} / absen ${r.absen || 0}</td>
          <td>${r.flag ? `<span class="cohort-pill" style="background:#FEF3C7;color:#92400E;">${esc(r.flag)}</span>` : '—'}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="cohort-btn secondary" data-inc="${esc(r.user_id)}" style="padding:4px 8px;">Verifikasi</button>
            <button type="button" class="cohort-btn secondary" data-exc="${esc(r.user_id)}" style="padding:4px 8px;">Kecualikan</button>
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
      root.innerHTML = rows.map(r => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #F3F4F6;font-size:.78rem;">
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

  async function render() {
    const stu = $('cohort-student-wrap');
    const men = $('cohort-mentor-wrap');
    const joinCard = $('cohort-join-card');
    const info = $('cohort-student-info');
    const sub = $('cohort-student-subtabs');
    const wa = $('cohort-wa-link');
    const cid = state.studentCohortId;
    const c = cid && state.cohortMap[cid];

    if (stu) stu.style.display = '';
    if (men) men.style.display = (state.mentorCohort || isAdmin()) ? '' : 'none';
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

    if (state.mentorCohort) {
      const sum = $('cohort-mentor-summary');
      if (sum) sum.innerHTML = `<strong>${esc(state.mentorCohort.name || 'Kohort')}</strong>`;
      await renderRoster(state.mentorCohort.id);
    }
    switchStudentTab(state.studentTab);
    if (state.mentorCohort || isAdmin()) switchMentorTab(state.mentorTab);
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
        const cid = state.studentCohortId || (state.mentorCohort && state.mentorCohort.id);
        if (cid) void renderRankings(cid);
      });
    });
    $('cohort-post-send')?.addEventListener('click', () => void submitPost());
    $('cohort-ann-send')?.addEventListener('click', () => void postAnnouncement());
  }

  async function open() {
    bind();
    await initMembership();
    await render();
  }

  global.LarisCohort = {
    initMembership,
    open,
    renderOps,
    hasAccess: function () { return !!(state.studentCohortId || state.mentorCohort || isAdmin()); },
    mount: function (opts) {
      opts = opts || {};
      sb = opts.getSupabase;
      me = opts.getUser;
      if (opts.esc) esc = opts.esc;
      if (opts.toast) toast = opts.toast;
      if (opts.isAdmin) isAdmin = opts.isAdmin;
      if (opts.openProfile) openProfile = opts.openProfile;
    },
  };
})(window);
