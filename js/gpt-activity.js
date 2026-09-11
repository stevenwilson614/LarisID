/* Mixed Riwayat feed + Arsip Unduhan + header bell. */
(function (global) {
  'use strict';

  var api = {};
  var CHIP_KEY = 'lid_riwayat_chip_v1';
  var _chip = 'all';
  var _cache = { chats: [], searches: [], dives: [], downloads: [] };
  var _notices = [];
  var _bellOpen = false;
  var _wired = false;

  function esc(s) { return api.esc ? api.esc(s) : String(s == null ? '' : s); }
  function $(id) { return document.getElementById(id); }

  function loadChip() {
    try {
      var v = localStorage.getItem(CHIP_KEY);
      if (v === 'chat' || v === 'dive' || v === 'cari' || v === 'unduh') _chip = v;
    } catch (_) {}
  }

  function whenLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  function items() {
    var out = [];
    (_cache.chats || []).forEach(function (c) {
      out.push({
        kind: 'chat',
        at: c.created_at || c.updated_at || 0,
        id: c.id || c.localId,
        title: c.title || 'Chat',
        rename: true,
        chat: c,
      });
    });
    (_cache.searches || []).forEach(function (s) {
      out.push({
        kind: 'cari',
        at: s.created_at,
        id: 's:' + (s.id || s.keyword),
        title: s.keyword,
        query: s.keyword,
      });
    });
    (_cache.dives || []).forEach(function (d) {
      var m = d.metadata || {};
      out.push({
        kind: 'dive',
        at: d.created_at,
        id: 'd:' + (d.id || '') + (m.item_id || '') + (m.shop_id || ''),
        title: m.keyword || m.product_name || 'Deep Dive',
        item_id: m.item_id,
        shop_id: m.shop_id,
        keyword: m.keyword,
      });
    });
    (_cache.downloads || []).forEach(function (j) {
      var p = j.payload || {};
      out.push({
        kind: 'unduh',
        at: j.created_at,
        id: 'e:' + j.request_id,
        title: p.query || (j.source === 'deepdive' ? 'Unduhan Deep Dive' : 'Unduhan Cari Produk'),
        job: j,
      });
    });
    out.sort(function (a, b) { return new Date(b.at || 0) - new Date(a.at || 0); });
    var q = String($('chat-search-input') && $('chat-search-input').value || '').trim().toLowerCase();
    if (q) out = out.filter(function (it) { return String(it.title || '').toLowerCase().indexOf(q) !== -1; });
    if (_chip !== 'all') out = out.filter(function (it) { return it.kind === _chip; });
    return out;
  }

  function kindLabel(k) {
    return { chat: 'Chat', dive: 'Dive', cari: 'Cari', unduh: 'Unduh' }[k] || k;
  }

  function chipsHtml() {
    var chips = [
      ['all', 'Semua'], ['chat', 'Chat'], ['dive', 'Dive'], ['cari', 'Cari'], ['unduh', 'Unduh'],
    ];
    return '<div class="riwayat-chips" id="riwayat-chips">' + chips.map(function (c) {
      return '<button type="button" class="riwayat-chip' + (_chip === c[0] ? ' is-on' : '')
        + '" data-riwayat="' + c[0] + '">' + c[1] + '</button>';
    }).join('') + '</div>';
  }

  function rowHtml(it) {
    var active = '';
    if (it.kind === 'chat' && api.activeChatId && api.activeChatId() === it.id) active = ' active';
    var rename = it.kind === 'chat'
      ? '<button type="button" class="chat-rename-btn" data-rename="' + esc(it.id)
        + '" title="Ubah nama" aria-label="Ubah nama chat">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
        + '</button>'
      : '';
    return '<div class="chat-row' + active + '" data-act-row="' + esc(it.id) + '" data-act-kind="' + it.kind + '"'
      + (it.kind === 'chat' ? ' data-chat-row="' + esc(it.id) + '"' : '') + '>'
      + '<button type="button" class="chat-item" data-act="' + esc(it.id) + '" data-act-kind="' + it.kind + '">'
      + '<span class="riwayat-kind">' + kindLabel(it.kind) + '</span> '
      + esc(it.title)
      + '<span class="riwayat-when">' + esc(whenLabel(it.at)) + '</span>'
      + '</button>' + rename + '</div>';
  }

  function archiveHtml() {
    var jobs = _cache.downloads || [];
    if (!jobs.length) {
      return '<div class="chat-empty">Belum ada unduhan. Unduh dari Cari Produk atau Deep Dive — arsipnya muncul di sini, termasuk unduh ulang tanpa kuota.</div>';
    }
    return '<div class="arsip-list">' + jobs.map(function (j) {
      var p = j.payload || {};
      var title = p.query || (j.source === 'deepdive' ? 'Deep Dive' : 'Cari Produk');
      var meta = [j.rows_total ? (j.rows_total + ' baris') : '', whenLabel(j.created_at)].filter(Boolean).join(' · ');
      return '<div class="arsip-card">'
        + '<div class="arsip-name">' + esc(title) + '</div>'
        + '<div class="arsip-meta">' + esc(meta) + '</div>'
        + '<button type="button" class="btn-ghost" data-arsip-dl="' + esc(j.request_id) + '">Unduh lagi</button>'
        + '</div>';
    }).join('') + '</div>';
  }

  function paintList() {
    var list = $('chat-list');
    if (!list) return;
    var host = $('riwayat-chips');
    if (host) host.outerHTML = chipsHtml();
    else {
      var search = $('chat-search');
      if (search) search.insertAdjacentHTML('afterend', chipsHtml());
    }
    if (_chip === 'unduh') {
      list.innerHTML = archiveHtml();
      return;
    }
    var rows = items();
    if (!rows.length) {
      var q = String($('chat-search-input') && $('chat-search-input').value || '').trim();
      list.innerHTML = '<div class="chat-empty">' + (q ? 'Tidak ketemu aktivitas itu.' : 'Belum ada aktivitas') + '</div>';
      return;
    }
    list.innerHTML = rows.slice(0, 80).map(rowHtml).join('');
  }

  async function load() {
    loadChip();
    _cache.chats = (api.chats && api.chats()) || [];
    var sb = api.supabase && api.supabase();
    var user = api.user && api.user();
    if (!sb || !user) {
      try {
        var raw = JSON.parse(localStorage.getItem('larisid_search_history_v1') || '[]');
        _cache.searches = Array.isArray(raw) ? raw : [];
      } catch (_) { _cache.searches = []; }
      paintList();
      return;
    }
    try {
      var s = await sb.from('user_search_history').select('id,keyword,source,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(80);
      _cache.searches = s.data || [];
    } catch (_) {}
    try {
      var d = await sb.from('activity_events').select('id,event_type,metadata,created_at')
        .eq('user_id', user.id).eq('event_type', 'deepdive_open')
        .order('created_at', { ascending: false }).limit(80);
      _cache.dives = d.data || [];
    } catch (_) {}
    try {
      var e = await sb.from('export_jobs').select('request_id,source,shape,weeks,rows_total,products,payload,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }).limit(40);
      _cache.downloads = e.data || [];
    } catch (_) {}
    paintList();
  }

  function noticeLead(n) {
    var p = n.payload || {};
    if (p.lead) return String(p.lead);
    if (n.kind === 'keyword_ready') return 'Kata kunci “' + (p.keyword || '') + '” sudah siap';
    if (n.kind === 'criteria_hit') return (p.n || '') + ' produk baru cocok kriteriamu';
    if (n.kind === 'export_done') return 'Unduhan selesai';
    if (n.kind === 'tracker_change') return p.lead || 'Favorit Aku berubah';
    return 'Pemberitahuan';
  }

  function paintBell() {
    var btn = $('notif-bell');
    var badge = $('notif-bell-badge');
    var panel = $('notif-panel');
    if (!btn) return;
    var n = _notices.length;
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = n > 9 ? '9+' : String(n);
    }
    btn.setAttribute('aria-label', n ? ('Pemberitahuan, ' + n + ' belum dibaca') : 'Pemberitahuan');
    if (!panel) return;
    if (!_bellOpen) { panel.hidden = true; return; }
    panel.hidden = false;
    if (!n) {
      panel.innerHTML = '<p class="notif-empty">Belum ada kabar baru.</p>';
      return;
    }
    panel.innerHTML = _notices.map(function (x) {
      return '<button type="button" class="notif-item" data-notice="' + esc(x.id) + '" data-kind="' + esc(x.kind) + '">'
        + esc(noticeLead(x)) + '</button>';
    }).join('');
  }

  async function loadNotices() {
    var sb = api.supabase && api.supabase();
    var user = api.user && api.user();
    if (!sb || !user) { _notices = []; paintBell(); return; }
    try {
      var { data } = await sb.from('user_notices').select('id,kind,payload,created_at')
        .is('dismissed_at', null).order('created_at', { ascending: false }).limit(20);
      _notices = data || [];
    } catch (_) { _notices = []; }
    paintBell();
  }

  async function markRead() {
    var sb = api.supabase && api.supabase();
    if (!sb) return;
    try { await sb.rpc('dismiss_notices_open'); } catch (_) {}
    _notices = [];
    paintBell();
  }

  function openItem(it) {
    if (!it) return;
    if (it.kind === 'chat' && api.openChat) api.openChat(it.id);
    else if (it.kind === 'cari' && api.rerunSearch) api.rerunSearch(it.query || it.title);
    else if (it.kind === 'dive' && api.openDive) api.openDive(it);
    else if (it.kind === 'unduh' && api.redownload) api.redownload(it.job);
  }

  function findItem(id, kind) {
    return items().find(function (x) { return x.id === id && (!kind || x.kind === kind); })
      || items().find(function (x) { return x.id === id; });
  }

  function wire() {
    if (_wired) return;
    _wired = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var chip = t.closest('[data-riwayat]');
      if (chip) {
        _chip = chip.getAttribute('data-riwayat') || 'all';
        try { localStorage.setItem(CHIP_KEY, _chip); } catch (_) {}
        paintList();
        return;
      }
      var act = t.closest('[data-act]');
      if (act) {
        var it = findItem(act.getAttribute('data-act'), act.getAttribute('data-act-kind'));
        openItem(it);
        return;
      }
      var arsip = t.closest('[data-arsip-dl]');
      if (arsip && api.redownload) {
        var id = arsip.getAttribute('data-arsip-dl');
        var job = (_cache.downloads || []).find(function (j) { return j.request_id === id; });
        if (job) api.redownload(job);
        return;
      }
      var rename = t.closest('[data-rename]');
      if (rename && api.renameChat) {
        e.stopPropagation();
        api.renameChat(rename.getAttribute('data-rename'));
        return;
      }
      if (t.closest('#notif-bell')) {
        _bellOpen = !_bellOpen;
        paintBell();
        if (_bellOpen) void markRead();
        return;
      }
      var notice = t.closest('[data-notice]');
      if (notice) {
        var n = _notices.find(function (x) { return x.id === notice.getAttribute('data-notice'); });
        var p = (n && n.payload) || {};
        if (p.keyword && api.rerunSearch) api.rerunSearch(p.keyword);
        else if (p.query && api.rerunSearch) api.rerunSearch(p.query);
        _bellOpen = false;
        paintBell();
        return;
      }
      if (_bellOpen && !t.closest('#notif-wrap')) {
        _bellOpen = false;
        paintBell();
      }
    });
  }

  function init(next) {
    api = next || {};
    loadChip();
    wire();
    void load();
    void loadNotices();
  }

  global.LarisActivity = {
    init: init,
    render: function () { void load(); },
    refreshBell: function () { void loadNotices(); },
    paintList: paintList,
  };
})(window);
