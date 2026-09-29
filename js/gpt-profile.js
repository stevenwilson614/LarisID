(function (global) {
  'use strict';

  const EXTRA_KEY = 'lid_profile_extra_v1';
  const STORE_PLATFORMS = {
    shopee: 'Shopee',
    tokopedia: 'Tokopedia',
    tiktok_shop: 'TikTok Shop',
    lazada: 'Lazada',
    blibli: 'Blibli',
  };
  const SELL_PLATFORMS = [
    { id: 'shopee', label: 'Shopee' },
    { id: 'tiktok_shop', label: 'TikTok Shop' },
    { id: 'tokopedia', label: 'Tokopedia' },
    { id: 'lazada', label: 'Lazada' },
    { id: 'blibli', label: 'Blibli' },
  ];
  const FOCUS_SUGGEST = ['Riset produk', 'Iklan', 'Supplier', 'Konten'];
  const SOCIAL_PLATFORMS = [
    { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'] },
    { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com'] },
    { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  ];
  const VERIFIED_BADGE_KEYS = {
    first_listing: 1, first_sale_verified: 1, first_review: 1,
    lima_produk: 1, sepuluh_terjual: 1, dua_toko: 1,
  };

  const cameraSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  const pencilSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  const lockSVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const chevSVG = '<svg class="pf-rchev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';

  let supabase = null;
  let userId = null;
  let userEmail = '';
  let viewerId = null;
  let esc = function (s) { return String(s == null ? '' : s); };
  let toast = null;
  let onSignOut = null;
  let onProfileChanged = null;
  let getUsage = null;
  let onOpenKomunitas = null;
  let getOnboardingCity = null;
  let pageRoot = null;
  let currentRow = {};
  let storeLinks = [];
  let inboxRows = [];
  let isOwn = false;
  let previewMode = null;
  let wantMessage = false;
  let edit = { header: false, focus: false, social: false, toko: false };
  let riwayatChip = 'all';
  let statusEl = null;
  let imgPreview = null;
  let initialsFallback = null;

  function $(sel, root) {
    return (root || pageRoot || document).querySelector(sel);
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
  }

  function fmtNum(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('id-ID');
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtJoined(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }

  function asList(v) {
    if (Array.isArray(v)) return v.filter(Boolean);
    return [];
  }

  function readExtra() {
    try {
      const raw = JSON.parse(localStorage.getItem(EXTRA_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (_) {
      return {};
    }
  }

  function writeExtra(part) {
    const next = Object.assign(readExtra(), part || {});
    try { localStorage.setItem(EXTRA_KEY, JSON.stringify(next)); } catch (_) {}
  }

  function mergeExtra(row) {
    const extra = readExtra();
    if (!asList(row.focus_areas).length && asList(extra.focus_areas).length) row.focus_areas = extra.focus_areas;
    if (!asList(row.selling_platforms).length && asList(extra.selling_platforms).length) {
      row.selling_platforms = extra.selling_platforms;
    }
    if (!asList(row.social_links).length && asList(extra.social_links).length) row.social_links = extra.social_links;
    return row;
  }

  function previewFilled() {
    return {
      user_id: 'preview-isi',
      display_name: 'Steven Wilson',
      first_name: 'Steven',
      city: 'Bandung',
      bio: 'Seller & content creator. Fokus di Shopee, TikTok Shop, dan riset produk.',
      headshot_url: '',
      is_admin: true,
      is_public: true,
      completed_at: '2023-01-12T00:00:00.000Z',
      focus_areas: ['Riset produk', 'Iklan', 'Supplier'],
      selling_platforms: ['shopee', 'tiktok_shop'],
      social_links: [
        { platform: 'instagram', handle: 'stevenwilson', url: 'https://instagram.com/stevenwilson' },
        { platform: 'tiktok', handle: 'stevenwilson', url: 'https://www.tiktok.com/@stevenwilson' },
        { platform: 'youtube', handle: 'stevenwilson', url: 'https://www.youtube.com/@stevenwilson' },
      ],
      store_links: [
        { platform: 'shopee', handle: 'tokoluma', url: 'https://shopee.co.id/tokoluma' },
        { platform: 'tiktok_shop', handle: 'tokoluma', url: 'https://www.tiktok.com/@tokoluma' },
      ],
      badges: [],
      komunitas_posts: 18,
      komunitas_comments: 62,
      komunitas_likes: 127,
      komunitas_recent: [
        { id: 'preview-1', title: 'Foto produk di rumah, lighting pakai apa?', created_at: '2026-09-20T00:00:00.000Z' },
        { id: 'preview-2', title: 'Iklan Shopee pertama, budget harian mulai berapa?', created_at: '2026-09-12T00:00:00.000Z' },
        { id: 'preview-3', title: 'Ongkir Jawa–luar Jawa, naikkan harga atau makan sendiri?', created_at: '2026-09-04T00:00:00.000Z' },
      ],
    };
  }

  function previewEmpty() {
    return {
      user_id: 'preview-kosong',
      display_name: 'Pengguna LarisID',
      first_name: '',
      city: '',
      bio: '',
      headshot_url: '',
      is_admin: false,
      is_public: true,
      completed_at: '',
      focus_areas: [],
      selling_platforms: [],
      social_links: [],
      store_links: [],
      badges: [],
      komunitas_posts: 0,
      komunitas_comments: 0,
      komunitas_likes: 0,
      komunitas_recent: [],
    };
  }

  function previewRiwayat() {
    return [
      {
        kind: 'dive', at: '2026-09-15T00:00:00.000Z', id: 'd:preview',
        title: 'tas gym',
        image: 'https://cf.shopee.co.id/file/id-11134207-822wp-mmr1603rhp1i19',
      },
      {
        kind: 'cari', at: '2026-09-20T00:00:00.000Z', id: 's:preview1',
        title: 'rak dapur',
      },
      {
        kind: 'kalk', at: '2026-09-12T00:00:00.000Z', id: 'k:preview',
        title: 'Botol minum 1 liter',
      },
      {
        kind: 'chat', at: '2026-09-08T00:00:00.000Z', id: 'c:preview',
        title: 'Sendok bayi silikon',
      },
    ];
  }

  function hostOk(platform, url) {
    const spec = SOCIAL_PLATFORMS.find((p) => p.id === platform);
    if (!spec) return false;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      return spec.hosts.some((h) => host === h || host.endsWith('.' + h));
    } catch (_) {
      return false;
    }
  }

  function parseSocial(platform, raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    const handle = value.replace(/^@/, '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
    let url = value;
    if (!/^https?:\/\//i.test(value)) {
      const h = value.replace(/^@/, '').replace(/^\/+/, '');
      if (platform === 'instagram') url = 'https://instagram.com/' + h;
      else if (platform === 'tiktok') url = 'https://www.tiktok.com/@' + h.replace(/^@/, '');
      else url = 'https://www.youtube.com/@' + h.replace(/^@/, '');
    }
    if (!hostOk(platform, url)) return null;
    let shown = handle;
    try {
      const u = new URL(url);
      shown = decodeURIComponent(u.pathname.replace(/^\/+/, '')).replace(/^@/, '') || handle;
    } catch (_) {}
    return { platform, url, handle: shown.slice(0, 80) };
  }

  function readUsage() {
    if (typeof getUsage !== 'function') return null;
    try { return getUsage() || null; } catch (_) { return null; }
  }

  function quotaRingHtml(kind, num) {
    return '<span class="usage-ring-wrap gpt-quota-ring js-quota-' + kind + '-ring" data-tone="ok">' +
      '<svg class="usage-ring" viewBox="0 0 36 36" aria-hidden="true">' +
        '<circle class="track" cx="18" cy="18" r="15"></circle>' +
        '<circle class="prog" cx="18" cy="18" r="15" stroke-dasharray="94.2" stroke-dashoffset="0"></circle>' +
      '</svg>' +
      '<span class="usage-ring-num">' + (num || '') + '</span>' +
    '</span>';
  }

  function quotaHtml() {
    const u = readUsage() || {};
    return '<div class="gpt-quota" aria-label="Jatah harian">' +
      '<div class="gpt-quota-item">' +
        quotaRingHtml('dive', u.diveNum || '∞') +
        '<span class="gpt-quota-copy">' +
          '<span class="gpt-quota-lbl">Deep Dive</span>' +
          '<span class="gpt-quota-val js-quota-dives">' + (u.divesText || '—') + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="gpt-quota-item">' +
        quotaRingHtml('dl', u.dlNum || '90') +
        '<span class="gpt-quota-copy">' +
          '<span class="gpt-quota-lbl">Unduhan</span>' +
          '<span class="gpt-quota-val js-quota-downloads">' + (u.downloadsText || '90/90') + '</span>' +
        '</span>' +
      '</div>' +
    '</div>';
  }

  function paintQuotaRing(wrap, num, tone, offset) {
    if (!wrap) return;
    if (tone) wrap.dataset.tone = tone;
    const prog = wrap.querySelector('.prog');
    const numEl = wrap.querySelector('.usage-ring-num');
    if (numEl && num != null) numEl.textContent = num;
    if (prog && offset != null) {
      prog.setAttribute('stroke-dasharray', '94.2');
      prog.setAttribute('stroke-dashoffset', String(offset));
    }
  }

  function refreshUsage() {
    if (!pageRoot || !isOwn) return;
    const u = readUsage();
    if (!u) return;
    const diveEl = pageRoot.querySelector('.js-quota-dives');
    const dlEl = pageRoot.querySelector('.js-quota-downloads');
    if (diveEl && u.divesText) diveEl.textContent = u.divesText;
    if (dlEl && u.downloadsText) dlEl.textContent = u.downloadsText;
    paintQuotaRing(pageRoot.querySelector('.js-quota-dive-ring'), u.diveNum, u.diveTone, u.diveOffset);
    paintQuotaRing(pageRoot.querySelector('.js-quota-dl-ring'), u.dlNum, u.dlTone, u.dlOffset);
  }

  function showStatus(message, type) {
    if (!statusEl) statusEl = pageRoot && pageRoot.querySelector('.js-status');
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.className = 'pf-status js-status ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
  }

  function rpcErrorMessage(err) {
    const raw = (err && (err.message || err.details || err.hint)) || '';
    return raw.replace(/^.*error:\s*/i, '').replace(/\s+$/, '') || 'Terjadi kesalahan. Coba lagi.';
  }

  function icoBtn(action, label) {
    return '<button type="button" class="pf-ico-btn" data-pf="' + action + '" aria-label="' + label + '" title="' + label + '">' + pencilSVG + '</button>';
  }

  function avatarHtml(row, canEdit) {
    const name = row.display_name || row.first_name || '';
    const cam = canEdit
      ? '<label class="pf-av-cam" for="pf-file-input">' + cameraSVG.replace('width="24" height="24"', '') + '</label>' +
        '<input type="file" id="pf-file-input" accept="image/*" class="js-file-input" hidden>'
      : '';
    if (row.headshot_url) {
      return '<div class="pf-av-wrap"><div class="pf-av"><img class="js-avatar-img" src="' + esc(row.headshot_url) + '" alt=""></div>' + cam + '</div>';
    }
    return '<div class="pf-av-wrap"><div class="pf-av js-avatar-fallback">' + esc(getInitials(name)) + '</div>' +
      '<img class="js-avatar-img" alt="" hidden>' + cam + '</div>';
  }

  function badgesHtml(row) {
    const badges = asList(row.badges);
    if (!badges.length) return '';
    return '<div class="pf-badge-row">' + badges.map((b) => {
      const verified = VERIFIED_BADGE_KEYS[b.key] ? '<span class="gpt-pv-badge-v">dari toko</span>' : '';
      return '<span class="gpt-pv-badge">' + esc(b.title || b.key) + verified + '</span>';
    }).join('') + '</div>';
  }

  function previewBarHtml() {
    if (!previewMode) return '';
    return '<div class="pf-preview">' +
      '<span>Pratinjau lokal — belum ke larisid.com. Simpan toko dan hitungan live belum dihubungkan.</span>' +
      '<div class="pf-preview-btns">' +
        '<button type="button" data-pf="preview-filled"' + (previewMode === 'filled' ? ' class="is-on"' : '') + '>Terisi</button>' +
        '<button type="button" data-pf="preview-empty"' + (previewMode === 'empty' ? ' class="is-on"' : '') + '>Kosong</button>' +
      '</div>' +
    '</div>';
  }

  function headerHtml(row) {
    const name = esc(row.display_name || row.first_name || 'Pengguna LarisID');
    const role = row.is_admin ? ' <span class="gpt-pv-role">Admin</span>' : '';
    const city = row.city ? esc(row.city) : '';
    const joined = fmtJoined(row.completed_at || row.joined_at);
    const meta = [city, joined ? 'Bergabung ' + joined : ''].filter(Boolean).join(' · ');
    const actions = isOwn
      ? '<button type="button" class="pf-edit-btn" data-pf="edit-header">' + pencilSVG + ' Edit profil</button>'
      : (viewerId && viewerId !== row.user_id
        ? '<button type="button" class="pf-msg-btn" data-pf="msg-open">Kirim Pesan</button>'
        : '');
    if (isOwn && edit.header) {
      return '<section class="pf-card">' +
        '<div class="pf-hero">' +
          avatarHtml(row, true) +
          '<div class="pf-hero-body">' +
            '<div class="pf-field"><label for="pf-name">Nama tampilan</label>' +
              '<input id="pf-name" class="js-display-name" maxlength="80" value="' + esc(row.display_name || '') + '"></div>' +
            '<div class="pf-field"><label for="pf-city">Kota</label>' +
              '<input id="pf-city" class="js-city" maxlength="80" value="' + esc(row.city || '') + '" placeholder="Kota tempat kamu jualan"></div>' +
            '<div class="pf-field"><label for="pf-bio">Bio</label>' +
              '<textarea id="pf-bio" class="js-bio" maxlength="280" rows="3" placeholder="Ceritakan sedikit tentang kamu">' + esc(row.bio || '') + '</textarea></div>' +
            '<button type="button" class="pf-save" data-pf="save-header">Simpan</button>' +
          '</div>' +
        '</div>' +
      '</section>';
    }
    return '<section class="pf-card">' +
      '<div class="pf-hero">' +
        avatarHtml(row, isOwn) +
        '<div class="pf-hero-body">' +
          '<h2 class="pf-name">' + name + role + '</h2>' +
          (meta ? '<p class="pf-meta">' + meta + '</p>' : '') +
          (row.bio ? '<p class="pf-bio">' + esc(row.bio) + '</p>' : (isOwn ? '<p class="pf-empty">Belum ada bio. Ketuk Edit profil untuk menulisnya.</p>' : '')) +
          badgesHtml(row) +
        '</div>' +
        (actions ? '<div class="pf-hero-actions">' + actions + '</div>' : '') +
      '</div>' +
      (!isOwn && viewerId && viewerId !== row.user_id
        ? '<div class="gpt-pv-msg-form" id="pf-msg-form"' + (wantMessage ? '' : ' hidden') + '>' +
            '<textarea class="js-msg-input" rows="3" maxlength="2000" placeholder="Tulis pesan privat. Jangan tulis niche, supplier, atau margin."></textarea>' +
            '<div style="margin-top:8px"><button type="button" class="pf-save" data-pf="msg-send">Kirim</button></div>' +
          '</div>'
        : '') +
    '</section>';
  }

  function chipBtn(on, attrs, label, removable) {
    return '<button type="button" class="pf-chip' + (on ? ' is-on' : '') + '" ' + attrs + '>' +
      esc(label) + (removable ? '<span class="pf-chip-x" aria-hidden="true">×</span>' : '') +
    '</button>';
  }

  function focusHtml(row) {
    const focus = asList(row.focus_areas);
    const plats = asList(row.selling_platforms);
    const shownFocus = FOCUS_SUGGEST.slice();
    focus.forEach((t) => { if (!shownFocus.includes(t)) shownFocus.push(t); });
    let body;
    if (isOwn && edit.focus) {
      body = '<p class="pf-card-sub">Platform yang sudah kamu pakai</p>' +
        '<div class="pf-chips">' + SELL_PLATFORMS.map((p) =>
          chipBtn(plats.includes(p.id), 'data-pf="tog-plat" data-id="' + p.id + '"', p.label)
        ).join('') + '</div>' +
        '<p class="pf-card-sub" style="margin-top:14px">Fokus</p>' +
        '<div class="pf-chips">' + shownFocus.map((t) =>
          chipBtn(focus.includes(t), 'data-pf="tog-focus" data-tag="' + esc(t) + '"', t, focus.includes(t) && !FOCUS_SUGGEST.includes(t))
        ).join('') +
        (focus.length < 8 ? '<button type="button" class="pf-chip is-add" data-pf="add-focus">+ Tambah</button>' : '') +
        '</div>' +
        '<div style="margin-top:14px"><button type="button" class="pf-save" data-pf="save-focus">Simpan</button></div>';
    } else {
      const platChips = plats.map((id) => {
        const label = (SELL_PLATFORMS.find((p) => p.id === id) || {}).label || id;
        return '<span class="pf-chip is-on">' + esc(label) + '</span>';
      }).join('');
      const focusChips = focus.map((t) => '<span class="pf-chip is-on">' + esc(t) + '</span>').join('');
      if (!platChips && !focusChips) {
        body = '<p class="pf-empty">' + (isOwn ? 'Belum ada fokus atau platform. Ketuk pensil untuk menambah.' : 'Belum diisi.') + '</p>';
      } else {
        body = (platChips ? '<div class="pf-chips" style="margin-bottom:10px">' + platChips + '</div>' : '') +
          (focusChips ? '<div class="pf-chips">' + focusChips + '</div>' : '');
      }
    }
    return '<section class="pf-card">' +
      '<div class="pf-card-h"><h3>Fokus</h3>' + (isOwn ? icoBtn('edit-focus', 'Ubah fokus') : '') + '</div>' +
      body +
    '</section>';
  }

  function komunitasHtml(row) {
    const posts = Number(row.komunitas_posts) || 0;
    const comments = Number(row.komunitas_comments) || 0;
    const likes = Number(row.komunitas_likes) || 0;
    const recent = asList(row.komunitas_recent);
    const empty = !posts && !comments && !likes;
    return '<section class="pf-card">' +
      '<div class="pf-card-h"><h3>Komunitas</h3></div>' +
      '<div class="pf-stats">' +
        '<div class="pf-stat"><span class="pf-stat-n">' + fmtNum(posts) + '</span><span class="pf-stat-l">Postingan</span></div>' +
        '<div class="pf-stat"><span class="pf-stat-n">' + fmtNum(comments) + '</span><span class="pf-stat-l">Komentar</span></div>' +
        '<div class="pf-stat"><span class="pf-stat-n">' + fmtNum(likes) + '</span><span class="pf-stat-l">Disukai</span></div>' +
      '</div>' +
      (empty
        ? '<p class="pf-empty">Belum ada postingan atau balasan di Komunitas.</p>'
        : (recent.length
          ? '<div class="pf-klist">' + recent.map((p) =>
              '<button type="button" class="pf-krow" data-pf="open-komunitas" data-id="' + esc(p.id) + '">' +
                '<span>' + esc(p.title || 'Postingan') + '</span>' +
                '<span class="pf-kwhen">' + esc(fmtWhen(p.created_at)) + '</span>' +
              '</button>'
            ).join('') + '</div>'
          : '')) +
    '</section>';
  }

  function riwayatKindLabel(k) {
    return { chat: 'Chat', dive: 'Deep Dive', cari: 'Cari Produk', kalk: 'Kalkulator', unduh: 'Unduh' }[k] || k;
  }

  function riwayatItems() {
    if (previewMode === 'filled') {
      return previewRiwayat().filter((it) => riwayatChip === 'all' || it.kind === riwayatChip);
    }
    if (previewMode === 'empty') return [];
    const act = global.LarisActivity;
    if (!act || typeof act.items !== 'function') return [];
    return act.items().filter((it) => riwayatChip === 'all' || it.kind === riwayatChip).slice(0, 40);
  }

  function thumbHtml(it) {
    if (it.image) return '<span class="pf-rthumb"><img src="' + esc(it.image) + '" alt=""></span>';
    return '<span class="pf-rthumb" aria-hidden="true">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/></svg>' +
    '</span>';
  }

  function riwayatHtml() {
    if (!isOwn) return '';
    const chips = [['all', 'Semua'], ['chat', 'Chat'], ['dive', 'Dive'], ['cari', 'Cari'], ['kalk', 'Kalk'], ['unduh', 'Unduh']];
    const rows = riwayatItems();
    const act = global.LarisActivity;
    const when = act && act.whenLabel ? act.whenLabel : function (iso) { return fmtWhen(iso); };
    return '<section class="pf-card">' +
      '<div class="pf-card-h"><h3>Riwayat</h3></div>' +
      '<div class="pf-riwayat-chips">' + chips.map((c) =>
        '<button type="button" class="pf-rchip' + (riwayatChip === c[0] ? ' is-on' : '') + '" data-pf="riwayat-chip" data-chip="' + c[0] + '">' + c[1] + '</button>'
      ).join('') + '</div>' +
      (rows.length
        ? '<div class="pf-rlist">' + rows.map((it) =>
            '<button type="button" class="pf-rrow" data-pf="riwayat-open" data-id="' + esc(it.id) + '" data-kind="' + esc(it.kind) + '">' +
              thumbHtml(it) +
              '<span class="pf-rbody"><span class="pf-rtitle">' + esc(it.title || riwayatKindLabel(it.kind)) + '</span>' +
              '<span class="pf-rmeta">' + esc(riwayatKindLabel(it.kind)) + (it.at ? ' · ' + esc(when(it.at)) : '') + '</span></span>' +
              chevSVG +
            '</button>'
          ).join('') + '</div>'
        : '<p class="pf-empty">Belum ada aktivitas. Cari produk, buka Deep Dive, atau simpan kalkulasi — semuanya muncul di sini.</p>') +
    '</section>';
  }

  function tentangHtml(row) {
    const city = row.city ? esc(row.city) : '';
    const bio = row.bio ? esc(row.bio) : '';
    const joined = fmtJoined(row.completed_at || row.joined_at);
    const focus = asList(row.focus_areas).join(', ');
    const plats = asList(row.selling_platforms).map((id) =>
      (SELL_PLATFORMS.find((p) => p.id === id) || {}).label || id
    ).join(', ');
    const pin = '<svg class="pf-about-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
    const rows = [
      city && pin + '<span>' + city + '</span>',
      bio && '<svg class="pf-about-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h10"/></svg><span>' + bio + '</span>',
      plats && '<svg class="pf-about-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8h12l1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><span>' + esc(plats) + '</span>',
      focus && '<svg class="pf-about-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg><span>' + esc(focus) + '</span>',
      joined && '<svg class="pf-about-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span>Bergabung ' + esc(joined) + '</span>',
    ].filter(Boolean);
    return '<section class="pf-card">' +
      '<div class="pf-card-h"><h3>Tentang</h3>' + (isOwn ? icoBtn('edit-header', 'Ubah tentang') : '') + '</div>' +
      (rows.length
        ? '<div class="pf-about">' + rows.map((r) => '<div class="pf-about-row">' + r + '</div>').join('') + '</div>'
        : '<p class="pf-empty">' + (isOwn ? 'Isi kota dan bio lewat Edit profil.' : 'Belum diisi.') + '</p>') +
    '</section>';
  }

  function socialHtml(row) {
    const links = asList(row.social_links);
    const list = links.map((s) => {
      const label = (SOCIAL_PLATFORMS.find((p) => p.id === s.platform) || {}).label || s.platform;
      return '<div class="pf-link">' +
        '<span class="pf-link-plat">' + esc(label) + '</span>' +
        '<a href="' + esc(s.url || '#') + '" target="_blank" rel="noopener noreferrer">' + esc(s.handle || s.url || label) + '</a>' +
        (isOwn && edit.social ? '<button type="button" class="pf-del" data-pf="del-social" data-plat="' + esc(s.platform) + '">Hapus</button>' : '<span class="pf-link-go" aria-hidden="true">↗</span>') +
      '</div>';
    }).join('');
    const editor = isOwn && edit.social
      ? '<div class="pf-addrow">' +
          '<select class="js-social-plat">' + SOCIAL_PLATFORMS.map((p) => '<option value="' + p.id + '">' + p.label + '</option>').join('') + '</select>' +
          '<input class="js-social-url" maxlength="200" placeholder="@nama atau tautan">' +
          '<button type="button" data-pf="add-social">Tambah</button>' +
        '</div>' +
        '<div style="margin-top:12px"><button type="button" class="pf-save" data-pf="save-social">Simpan</button></div>'
      : '';
    return '<section class="pf-card">' +
      '<div class="pf-card-h"><h3>Link sosial media</h3>' + (isOwn ? icoBtn('edit-social', 'Ubah tautan sosial') : '') + '</div>' +
      (list ? '<div class="pf-linklist">' + list + '</div>' : '<p class="pf-empty">' + (isOwn ? 'Belum ada tautan. Ketuk pensil untuk menambah Instagram, TikTok, atau YouTube.' : 'Belum ada tautan.') + '</p>') +
      editor +
    '</section>';
  }

  function tokoHtml(row) {
    const links = storeLinks.length ? storeLinks : asList(row.store_links);
    const list = links.map((s) => {
      const label = STORE_PLATFORMS[s.platform] || s.platform;
      return '<div class="pf-link">' +
        '<span class="pf-link-plat">' + esc(label) + '</span>' +
        '<a href="' + esc(s.url || '#') + '" target="_blank" rel="noopener noreferrer">' + esc(s.handle || s.url || label) + '</a>' +
        (isOwn && edit.toko && s.id
          ? '<button type="button" class="pf-del" data-pf="del-store" data-id="' + esc(s.id) + '">Hapus</button>'
          : '<span class="pf-link-go" aria-hidden="true">↗</span>') +
      '</div>';
    }).join('');
    const fallback = !links.length && row.shopee_store_url
      ? '<a class="pf-link" href="' + esc(row.shopee_store_url) + '" target="_blank" rel="noopener noreferrer">' +
          '<span class="pf-link-plat">Shopee</span>' + esc(row.shopee_store_name || 'Toko Shopee') + '</a>'
      : '';
    const editor = isOwn && edit.toko
      ? '<div class="pf-addrow">' +
          '<input class="js-store-url" type="url" maxlength="400" placeholder="https://shopee.co.id/namatoko">' +
          '<button type="button" data-pf="add-store">Tambah</button>' +
        '</div>'
      : '';
    return '<section class="pf-card">' +
      '<div class="pf-card-h"><h3>Toko saya</h3>' + (isOwn ? icoBtn('edit-toko', 'Ubah toko') : '') + '</div>' +
      (list || fallback
        ? '<div class="pf-linklist">' + (list || fallback) + '</div>'
        : '<p class="pf-empty">' + (isOwn ? 'Tempel tautan toko Shopee, Tokopedia, TikTok Shop, Lazada, atau Blibli.' : 'Belum ada toko.') + '</p>') +
      editor +
    '</section>';
  }

  function inboxHtml() {
    if (!isOwn) return '';
    if (!inboxRows.length) {
      return '<div class="gpt-inbox"><div class="gpt-inbox-title">Pesan masuk</div><div class="gpt-inbox-empty">Belum ada pesan.</div></div>';
    }
    return '<div class="gpt-inbox"><div class="gpt-inbox-title">Pesan masuk</div>' + inboxRows.map((m) => {
      const from = esc(m.from_first_name || 'Pengguna LarisID') + (m.from_city ? ' — ' + esc(m.from_city) : '');
      return '<div class="gpt-inbox-item"><span class="gpt-inbox-from">' + from + '</span>' +
        '<span class="gpt-inbox-date">' + esc(fmtWhen(m.created_at)) + '</span>' +
        '<div class="gpt-inbox-body">' + esc(m.body) + '</div></div>';
    }).join('') + '</div>';
  }

  function footerHtml() {
    if (!isOwn) return '';
    const ext = global.CWS_EXT_URL && (typeof global.cwsExtOfferable !== 'function' || global.cwsExtOfferable())
      ? '<p class="gpt-ext-install"><a href="' + global.CWS_EXT_URL + '" target="_blank" rel="noopener" data-cws-ext="profile">Pasang Extension Chrome</a> — omset &amp; tren tampil di halaman Shopee.</p>'
      : '';
    return '<section class="pf-card pf-foot">' +
      quotaHtml() +
      inboxHtml() +
      ext +
      '<p class="gpt-disclaimer">' + lockSVG + ' Informasi kamu aman dan hanya dipakai sesuai pengaturan profil.</p>' +
      (onSignOut ? '<div class="gpt-signout"><button type="button" data-pf="signout">Keluar dari akun</button></div>' : '') +
    '</section>';
  }

  function pageHtml(row) {
    return previewBarHtml() +
      '<div class="pf-main">' +
        headerHtml(row) +
        focusHtml(row) +
        komunitasHtml(row) +
        riwayatHtml() +
      '</div>' +
      '<aside class="pf-rail">' +
        tentangHtml(row) +
        socialHtml(row) +
        tokoHtml(row) +
      '</aside>' +
      footerHtml() +
      '<div class="pf-status js-status"></div>';
  }

  function paint() {
    if (!pageRoot) return;
    pageRoot.innerHTML = '<div class="pf-page">' + pageHtml(currentRow) + '</div>';
    statusEl = pageRoot.querySelector('.js-status');
    imgPreview = pageRoot.querySelector('.js-avatar-img');
    initialsFallback = pageRoot.querySelector('.js-avatar-fallback');
    const file = pageRoot.querySelector('.js-file-input');
    if (file) setupUpload(file);
    refreshUsage();
  }

  function setupUpload(fileInput) {
    fileInput.addEventListener('change', async function () {
      const file = fileInput.files[0];
      if (!file) return;
      if (previewMode) { showStatus('Pratinjau: unggah foto belum dihubungkan.', 'info'); return; }
      if (file.size > 2 * 1024 * 1024) { showStatus('Ukuran file maksimal 2 MB.', 'error'); return; }
      if (!supabase || !userId) return;
      showStatus('Mengunggah foto...', 'info');
      try {
        const path = 'headshots/' + userId + '/' + Date.now() + '-' + file.name;
        const { error: uploadError } = await supabase.storage
          .from('profile-headshots')
          .upload(path, file, { upsert: true, cacheControl: '3600' });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('profile-headshots').getPublicUrl(path);
        const publicUrl = pub && pub.publicUrl;
        currentRow.headshot_url = publicUrl;
        await supabase.from('user_profiles').upsert({
          user_id: userId,
          headshot_url: publicUrl,
          is_public: true,
        }, { onConflict: 'user_id' });
        paint();
        showStatus('Foto berhasil diunggah.', 'success');
        if (toast) toast('Foto berhasil diunggah.');
        if (typeof onProfileChanged === 'function') onProfileChanged(currentRow);
      } catch (err) {
        showStatus('Gagal mengunggah foto.', 'error');
      }
    });
  }

  async function saveCore(payload, extra) {
    if (previewMode) {
      Object.assign(currentRow, payload, extra || {});
      if (extra) writeExtra(extra);
      edit.header = false;
      edit.focus = false;
      edit.social = false;
      paint();
      showStatus('Pratinjau: perubahan hanya di layar ini.', 'info');
      return;
    }
    if (!supabase || !userId) return;
    const body = Object.assign({ user_id: userId, is_public: true }, payload, extra || {});
    showStatus('Menyimpan…', 'info');
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert(body, { onConflict: 'user_id' })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      currentRow = mergeExtra(data || Object.assign(currentRow, body));
      if (extra) writeExtra(extra);
      edit.header = false;
      edit.focus = false;
      edit.social = false;
      paint();
      showStatus('Profil tersimpan.', 'success');
      if (toast) toast('Profil tersimpan.');
      if (typeof onProfileChanged === 'function') onProfileChanged(currentRow);
    } catch (err) {
      if (extra) {
        try {
          const { data, error } = await supabase
            .from('user_profiles')
            .upsert(Object.assign({ user_id: userId, is_public: true }, payload), { onConflict: 'user_id' })
            .select('*')
            .maybeSingle();
          if (error) throw error;
          writeExtra(extra);
          currentRow = mergeExtra(Object.assign(data || currentRow, extra));
          edit.header = false;
          edit.focus = false;
          edit.social = false;
          paint();
          showStatus('Tersimpan di perangkat. Kolom baru masuk setelah migrasi di server.', 'info');
          if (typeof onProfileChanged === 'function') onProfileChanged(currentRow);
          return;
        } catch (_) {}
      }
      showStatus('Gagal menyimpan profil. Coba lagi.', 'error');
    }
  }

  async function saveHeader() {
    const display_name = ($('.js-display-name') && $('.js-display-name').value || '').trim();
    const city = ($('.js-city') && $('.js-city').value || '').trim();
    const bio = ($('.js-bio') && $('.js-bio').value || '').trim();
    await saveCore({
      display_name: display_name || null,
      city: city || null,
      bio: bio || null,
      headshot_url: currentRow.headshot_url || null,
    });
  }

  async function saveFocus() {
    const focus_areas = asList(currentRow.focus_areas).slice(0, 8);
    const selling_platforms = asList(currentRow.selling_platforms);
    await saveCore({}, { focus_areas, selling_platforms });
  }

  async function saveSocial() {
    await saveCore({}, { social_links: asList(currentRow.social_links) });
  }

  async function loadStores() {
    storeLinks = asList(currentRow.store_links);
    if (previewMode || !supabase || !userId || !isOwn) return;
    try {
      const { data, error } = await supabase
        .from('student_account')
        .select('id,platform,handle,url')
        .eq('student_id', userId)
        .eq('kind', 'shop')
        .eq('active', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      storeLinks = data || [];
      currentRow.store_links = storeLinks;
    } catch (_) {}
  }

  async function loadInbox() {
    inboxRows = [];
    if (previewMode || !isOwn || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('user_messages_inbox')
        .select('id, from_first_name, from_city, body, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      inboxRows = data || [];
    } catch (_) {}
  }

  async function loadKomunitas(targetId) {
    if (previewMode) return;
    if (currentRow.komunitas_posts != null && currentRow.komunitas_recent) return;
    if (!supabase || !targetId) return;
    try {
      const posts = await supabase.from('feature_requests')
        .select('id,title,created_at', { count: 'exact' })
        .eq('author_id', targetId)
        .order('created_at', { ascending: false })
        .limit(3);
      const comments = await supabase.from('feature_request_comments')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', targetId);
      currentRow.komunitas_posts = posts.count || 0;
      currentRow.komunitas_comments = comments.count || 0;
      currentRow.komunitas_recent = posts.data || [];
      let likes = 0;
      const ids = (posts.data || []).map((p) => p.id);
      if (ids.length) {
        const liked = await supabase.from('feature_request_likes').select('request_id').in('request_id', ids);
        likes += (liked.data || []).length;
      }
      const myComments = await supabase.from('feature_request_comments').select('id').eq('author_id', targetId);
      const cids = (myComments.data || []).map((c) => c.id);
      if (cids.length) {
        const cl = await supabase.from('feature_request_comment_likes').select('comment_id').in('comment_id', cids);
        likes += (cl.data || []).length;
      }
      currentRow.komunitas_likes = likes;
    } catch (_) {
      currentRow.komunitas_posts = currentRow.komunitas_posts || 0;
      currentRow.komunitas_comments = currentRow.komunitas_comments || 0;
      currentRow.komunitas_likes = currentRow.komunitas_likes || 0;
      currentRow.komunitas_recent = currentRow.komunitas_recent || [];
    }
  }

  async function loadOwn() {
    if (previewMode) {
      currentRow = previewMode === 'empty' ? previewEmpty() : previewFilled();
      storeLinks = asList(currentRow.store_links);
      return;
    }
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    currentRow = mergeExtra(data || {});
    if (!currentRow.city && typeof getOnboardingCity === 'function') {
      currentRow.city = String(getOnboardingCity() || '').trim();
    }
    await loadStores();
    await loadInbox();
    await loadKomunitas(userId);
  }

  async function loadPublic(targetUserId) {
    if (previewMode) {
      currentRow = previewMode === 'empty' ? previewEmpty() : previewFilled();
      currentRow.user_id = targetUserId;
      storeLinks = asList(currentRow.store_links);
      return true;
    }
    const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: targetUserId });
    if (error) throw error;
    const row = (data && data[0]) || null;
    if (!row) return false;
    currentRow = row;
    storeLinks = asList(row.store_links);
    await loadKomunitas(targetUserId);
    return true;
  }

  async function linkStore() {
    if (previewMode) { showStatus('Pratinjau: tautan toko belum dihubungkan.', 'info'); return; }
    const input = $('.js-store-url');
    const url = (input && input.value || '').trim();
    if (!url) { showStatus('Tempel tautan tokomu dulu.', 'error'); return; }
    showStatus('Menyimpan toko...', 'info');
    try {
      const { error } = await supabase.rpc('ssis_link_shop', { p_url: url });
      if (error) throw error;
      if (input) input.value = '';
      await loadStores();
      paint();
      showStatus('Toko tersimpan.', 'success');
      if (toast) toast('Toko tersimpan.');
    } catch (err) {
      showStatus(rpcErrorMessage(err), 'error');
    }
  }

  async function unlinkStore(id) {
    if (previewMode || !id) return;
    showStatus('Menghapus toko...', 'info');
    try {
      const { error } = await supabase.rpc('ssis_unlink_shop', { p_id: id });
      if (error) throw error;
      await loadStores();
      paint();
      showStatus('Toko dihapus.', 'success');
    } catch (err) {
      showStatus(rpcErrorMessage(err), 'error');
    }
  }

  async function sendMessage() {
    const input = $('.js-msg-input');
    const body = (input && input.value || '').trim();
    if (!body) { showStatus('Pesan tidak boleh kosong.', 'error'); return; }
    if (previewMode) { showStatus('Pratinjau: pesan tidak terkirim.', 'info'); return; }
    showStatus('Mengirim…', 'info');
    try {
      const { error } = await supabase.from('user_messages').insert({
        from_user_id: viewerId, to_user_id: currentRow.user_id, body,
      });
      if (error) throw error;
      if (input) input.value = '';
      const form = $('#pf-msg-form');
      if (form) form.hidden = true;
      showStatus('Pesan terkirim.', 'success');
      if (toast) toast('Pesan terkirim.');
    } catch (err) {
      showStatus('Gagal mengirim pesan. Coba lagi.', 'error');
    }
  }

  function onClick(e) {
    const t = e.target.closest('[data-pf]');
    if (!t || !pageRoot.contains(t)) return;
    const act = t.getAttribute('data-pf');
    if (act === 'preview-filled') { previewMode = 'filled'; isOwn = true; currentRow = previewFilled(); storeLinks = asList(currentRow.store_links); paint(); return; }
    if (act === 'preview-empty') { previewMode = 'empty'; isOwn = true; currentRow = previewEmpty(); storeLinks = []; paint(); return; }
    if (act === 'edit-header') { edit.header = !edit.header; paint(); return; }
    if (act === 'edit-focus') { edit.focus = !edit.focus; paint(); return; }
    if (act === 'edit-social') { edit.social = !edit.social; paint(); return; }
    if (act === 'edit-toko') { edit.toko = !edit.toko; paint(); return; }
    if (act === 'save-header') { void saveHeader(); return; }
    if (act === 'save-focus') { void saveFocus(); return; }
    if (act === 'save-social') { void saveSocial(); return; }
    if (act === 'tog-plat') {
      const id = t.getAttribute('data-id');
      const cur = asList(currentRow.selling_platforms);
      currentRow.selling_platforms = cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat([id]);
      paint();
      return;
    }
    if (act === 'tog-focus') {
      const tag = t.getAttribute('data-tag');
      const cur = asList(currentRow.focus_areas);
      currentRow.focus_areas = cur.includes(tag) ? cur.filter((x) => x !== tag) : cur.concat([tag]).slice(0, 8);
      paint();
      return;
    }
    if (act === 'add-focus') {
      const tag = window.prompt('Fokus baru (maks. 24 huruf)', '');
      const clean = String(tag || '').trim().slice(0, 24);
      if (!clean) return;
      const cur = asList(currentRow.focus_areas);
      if (!cur.includes(clean) && cur.length < 8) currentRow.focus_areas = cur.concat([clean]);
      paint();
      return;
    }
    if (act === 'add-social') {
      const plat = ($('.js-social-plat') && $('.js-social-plat').value) || 'instagram';
      const parsed = parseSocial(plat, $('.js-social-url') && $('.js-social-url').value);
      if (!parsed) { showStatus('Pakai handle atau tautan ' + plat + ' yang benar.', 'error'); return; }
      currentRow.social_links = asList(currentRow.social_links).filter((s) => s.platform !== plat).concat([parsed]);
      paint();
      return;
    }
    if (act === 'del-social') {
      const plat = t.getAttribute('data-plat');
      currentRow.social_links = asList(currentRow.social_links).filter((s) => s.platform !== plat);
      paint();
      return;
    }
    if (act === 'add-store') { void linkStore(); return; }
    if (act === 'del-store') { void unlinkStore(t.getAttribute('data-id')); return; }
    if (act === 'msg-open') {
      const form = $('#pf-msg-form');
      if (form) form.hidden = !form.hidden;
      return;
    }
    if (act === 'msg-send') { void sendMessage(); return; }
    if (act === 'signout' && onSignOut) { onSignOut(); return; }
    if (act === 'riwayat-chip') {
      riwayatChip = t.getAttribute('data-chip') || 'all';
      paint();
      return;
    }
    if (act === 'riwayat-open') {
      if (previewMode) { showStatus('Pratinjau: baris riwayat tidak membuka halaman lain.', 'info'); return; }
      const actApi = global.LarisActivity;
      if (!actApi || !actApi.items || !actApi.openItem) return;
      const id = t.getAttribute('data-id');
      const kind = t.getAttribute('data-kind');
      const it = actApi.items().find((x) => x.id === id && x.kind === kind) || actApi.items().find((x) => x.id === id);
      if (it) actApi.openItem(it);
      return;
    }
    if (act === 'open-komunitas') {
      const id = t.getAttribute('data-id');
      if (previewMode || !id || String(id).indexOf('preview-') === 0) {
        showStatus('Pratinjau: judul ini tidak membuka thread asli.', 'info');
        return;
      }
      if (typeof onOpenKomunitas === 'function') onOpenKomunitas(id);
    }
  }

  function getRoot() {
    return pageRoot || document.getElementById('profil-root');
  }

  function applyOpts(opts) {
    const o = opts || {};
    supabase = o.supabase || null;
    userId = o.userId || null;
    userEmail = o.userEmail || '';
    viewerId = o.currentUserId || o.userId || null;
    esc = o.esc || function (s) { return String(s == null ? '' : s); };
    toast = o.toast || null;
    onSignOut = o.onSignOut || null;
    onProfileChanged = o.onProfileChanged || null;
    getUsage = typeof o.getUsage === 'function' ? o.getUsage : null;
    onOpenKomunitas = o.onOpenKomunitas || null;
    getOnboardingCity = o.getOnboardingCity || null;
    previewMode = o.preview || null;
    wantMessage = !!o.openMessage;
  }

  async function mount(root, options) {
    pageRoot = root || document.getElementById('profil-root');
    if (!pageRoot) return;
    applyOpts(options);
    const targetId = options && options.targetUserId ? options.targetUserId : userId;
    isOwn = !!(previewMode || (viewerId && targetId && viewerId === targetId));
    edit = { header: false, focus: false, social: false, toko: false };
    pageRoot.onclick = onClick;
    pageRoot.innerHTML = '<div class="pf-page"><section class="pf-card"><p class="pf-empty">Memuat profil…</p></section></div>';
    try {
      if (isOwn) {
        if (!previewMode && (!supabase || !userId)) {
          pageRoot.innerHTML = '<div class="pf-page"><section class="pf-card pf-privat"><h2>Masuk dulu</h2><p>Profil lengkap muncul setelah kamu masuk.</p></section></div>';
          return;
        }
        await loadOwn();
        paint();
        return;
      }
      if (!supabase || !targetId) {
        pageRoot.innerHTML = '<div class="pf-page"><section class="pf-card pf-privat"><p>Profil tidak bisa dibuka.</p></section></div>';
        return;
      }
      const ok = await loadPublic(targetId);
      if (!ok) {
        pageRoot.innerHTML = '<div class="pf-page"><section class="pf-card pf-privat"><h2>Profil privat</h2><p>Profil privat atau belum dibuka. Kirim Pesan hanya jalan kalau seller ini menyalakan profil publik di akunnya.</p></section></div>';
        return;
      }
      paint();
    } catch (err) {
      pageRoot.innerHTML = '<div class="pf-page"><section class="pf-card pf-privat"><p>Gagal memuat profil. Coba lagi.</p></section></div>';
      if (options && typeof options.onError === 'function') options.onError(err);
    }
  }

  function open(options) {
    const opts = options || {};
    const root = document.getElementById('profil-root');
    void mount(root, Object.assign({ targetUserId: opts.userId, currentUserId: opts.userId }, opts));
  }

  function viewPublic(targetUserId, options) {
    const opts = options || {};
    if (opts.currentUserId && targetUserId === opts.currentUserId) {
      open(opts.selfOpenOptions || opts);
      return;
    }
    void mount(document.getElementById('profil-root'), Object.assign({}, opts, {
      targetUserId,
      userId: opts.currentUserId,
    }));
  }

  function close() {}

  global.GptProfile = { open, close, viewPublic, refreshUsage, mount };
})(window);
