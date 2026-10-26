/* Laris Affiliate — side panel. Kirim only via Seller Center tab. */
(function () {
  var SEED = window.LARIS_AFFILIATE_SEED;
  var Send = window.LarisAffiliateSend;
  var KEY = 'laris-affiliate-ext-v1';
  var LOCK = 'laris-affiliate-runner-lock';
  var SURFACE_OVERLAY = /(?:\?|&)surface=overlay(?:&|$)/.test(location.search);
  var SURFACE = (SURFACE_OVERLAY ? 'overlay-' : 'panel-') + Math.random().toString(36).slice(2);
  var JAKARTA = 'Asia/Jakarta';
  var $ = function (id) { return document.getElementById(id); };
  var VERSION = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '0.5.1';
  if (SURFACE_OVERLAY) {
    document.documentElement.classList.add('surface-overlay');
    document.body.classList.add('surface-overlay');
  }
  (function markBuild() {
    var badge = $('build-badge');
    if (!badge) return;
    badge.textContent = SURFACE_OVERLAY
      ? ('Overlay · v' + VERSION)
      : ('Panel · v' + VERSION + ' · klik ikon di Affiliate Center untuk overlay');
  })();

  function notifyParent(on) {
    if (!SURFACE_OVERLAY || !window.parent || window.parent === window) return;
    try { window.parent.postMessage({ source: 'laris-affiliate-panel', running: !!on }, '*'); } catch (e) { /* ignore */ }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function todayKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function fmtWhen(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: JAKARTA });
  }
  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function toast(msg, kind, ms) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, ms || (kind === 'ok' ? 4500 : 2400));
  }
  function channelLabel(ch) {
    return ch === 'target_collab' ? 'Kolaborasi Bertarget' : 'Pesan IM';
  }
  function pathOnly(url) {
    try {
      var u = new URL(url, 'https://seller-id.tokopedia.com');
      return u.host + u.pathname;
    } catch (e) { return String(url || '').slice(0, 80); }
  }

  function defaultState() {
    return {
      account: Object.assign({}, SEED.account),
      quota: { dailyCap: Send.DAILY, batch: Send.BATCH, used: 0, day: todayKey() },
      creators: SEED.demoCreators.map(function (c) {
        return {
          id: uid('c'),
          handle: Send.normHandle(c.handle),
          name: c.name || '',
          creatorOpenId: c.creatorOpenId || '',
          followers: c.followers || 0,
          revenue: c.revenue || 0,
          source: c.source || '',
          demo: !!c.demo,
          status: 'new'
        };
      }),
      campaigns: [],
      template: SEED.template,
      blacklist: []
    };
  }

  function hydrate(raw, opts) {
    opts = opts || {};
    var s = raw || defaultState();
    if (!s.account) s.account = Object.assign({}, SEED.account);
    if (!s.quota) s.quota = defaultState().quota;
    if (s.quota.day !== todayKey()) {
      s.quota.used = 0;
      s.quota.day = todayKey();
    }
    if (!Array.isArray(s.creators)) s.creators = [];
    if (!Array.isArray(s.campaigns)) s.campaigns = [];
    if (!s.template || s.template === SEED.oldTemplate) s.template = SEED.template;
    s.creators.forEach(function (c) {
      if (!c.creatorOpenId) c.creatorOpenId = '';
      if (c.followers == null) c.followers = 0;
      if (c.revenue == null) c.revenue = 0;
    });
    if (!s.account.allowLiveSend) s.account.allowLiveSend = false;
    if (!s.account.allowKalodataRead) s.account.allowKalodataRead = false;
    if (!s.account.allowKalodataPages) s.account.allowKalodataPages = false;
    if (!Array.isArray(s.blacklist)) s.blacklist = [];
    if (!opts.keepRunning) {
      (s.campaigns || []).forEach(function (c) {
        (c.rows || []).forEach(function (r) {
          if (r.status === 'sending') {
            r.status = 'failed';
            r.note = 'panel ditutup saat mengirim';
          }
        });
        if (c.status === 'berjalan') {
          var pending = (c.rows || []).some(function (r) { return r.status === 'pending'; });
          c.status = pending ? 'jeda' : 'selesai';
        }
      });
    }
    return s;
  }

  var db = defaultState();
  var ui = {
    tab: 'kampanye',
    wizard: null,
    selected: {},
    filter: '',
    campFilter: 'all',
    jobId: null,
    importNotice: '',
    conn: { ok: false, shopSession: false, affiliate: false, shopName: '', href: '', recon: {}, reconOrigin: '', reconShopName: '', kalodata: { present: false, count: 0 }, sku: {} }
  };
  var runner = { id: null, timer: null, paused: false, busy: false };

  function persist() {
    if (typeof chrome === 'undefined' || !chrome.storage) return Promise.resolve();
    return chrome.storage.local.set({ [KEY]: db });
  }

  function leftDaily() {
    if (db.quota.day !== todayKey()) {
      db.quota.used = 0;
      db.quota.day = todayKey();
      persist();
    }
    return Math.max(0, db.quota.dailyCap - db.quota.used);
  }
  function bumpQuota(n) {
    db.quota.used += n || 1;
    persist();
  }
  function newCreators() {
    return db.creators.filter(function (c) { return !c.status || c.status === 'new'; });
  }
  function rankedCreators(list) {
    return list.slice().sort(function (a, b) {
      return (b.revenue || 0) - (a.revenue || 0) || (b.followers || 0) - (a.followers || 0);
    });
  }
  function skuLine() {
    var sku = (ui.conn.recon && ui.conn.recon.sku) || ui.conn.sku || {};
    if (!sku.productId && !sku.productName) {
      return 'Produk undangan = yang terekam di adapter. Ganti SKU/komisi? Kirim 1 undangan manual lagi.';
    }
    var comm = sku.commissionPct != null ? (Math.round(sku.commissionPct * 10) / 10) + '%' : '—';
    return (sku.productName || ('produk ' + sku.productId)) + ' · komisi ' + comm +
      (sku.invitationName ? ' · ' + sku.invitationName : '');
  }
  function skuFromReconStore(recon) {
    var sku = { productId: '', productName: '', commissionPct: null, invitationName: '', hasMessage: false, hasCommission: false, hasName: false, hasEnd: false, endTime: '' };
    ((recon && recon.collab) || []).forEach(function (e) {
      var body = null;
      try { body = JSON.parse(e.reqBody || ''); } catch (err) { body = null; }
      if (!body) return;
      var g = body.invitation_group;
      var p = g && g.product_list && g.product_list[0];
      if (p && p.product_id) {
        sku.productId = String(p.product_id);
        if (p.target_commission != null) {
          sku.commissionPct = p.target_commission >= 100 ? p.target_commission / 100 : p.target_commission;
          sku.hasCommission = true;
        }
        if (g.name != null) {
          sku.invitationName = g.name;
          sku.hasName = true;
        }
        if (g.end_time != null) {
          sku.endTime = g.end_time;
          sku.hasEnd = true;
        }
        if (p.title) sku.productName = p.title;
      }
      if (g && (g.message != null || g.invitation_msg != null || g.invite_msg != null)) sku.hasMessage = true;
      var inv = body.invitation && body.invitation.product_list && body.invitation.product_list[0];
      if (inv && inv.title) sku.productName = inv.title;
    });
    return sku;
  }
  function creatorById(id) { return db.creators.find(function (c) { return c.id === id; }); }
  function creatorByHandle(handle) {
    var h = Send.normHandle(handle);
    return db.creators.find(function (c) { return c.handle === h; });
  }
  function campaignById(id) { return db.campaigns.find(function (c) { return c.id === id; }); }
  function counts(c) {
    var rows = c.rows || [];
    return {
      n: rows.length,
      sent: rows.filter(function (r) { return r.status === 'sent'; }).length,
      probed: rows.filter(function (r) { return r.status === 'probed'; }).length,
      failed: rows.filter(function (r) { return r.status === 'failed'; }).length,
      pending: rows.filter(function (r) { return r.status === 'pending' || r.status === 'sending'; }).length,
      sending: rows.filter(function (r) { return r.status === 'sending'; }).length
    };
  }
  function nextPending(c) {
    return (c.rows || []).find(function (r) { return r.status === 'pending'; });
  }

  function dockIcon(id) {
    if (id === 'kampanye') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V8l8-4 8 4v11"/><path d="M9 19v-6h6v6"/></svg>';
    if (id === 'kreator') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.6.4 4.6 2 5 4.8"/></svg>';
    if (id === 'crm') return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.6"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 19c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5"/></svg>';
  }
  function renderDock() {
    var tabs = [
      { id: 'kampanye', label: 'Kampanye' },
      { id: 'kreator', label: 'Kreator' },
      { id: 'crm', label: 'CRM' },
      { id: 'akun', label: 'Akun' }
    ];
    $('dock').innerHTML = tabs.map(function (t) {
      return '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' + (ui.tab === t.id) + '">' +
        dockIcon(t.id) + esc(t.label) + '</button>';
    }).join('');
  }
  function renderQuota() {
    var el = $('quota-chip');
    el.textContent = db.quota.used + '/' + db.quota.dailyCap;
    el.classList.toggle('is-max', leftDaily() === 0);
  }
  function selectedCount() {
    return db.creators.filter(function (c) { return ui.selected[c.id]; }).length;
  }
  function render() {
    renderDock();
    renderQuota();
    var pick = !ui.wizard && ui.tab === 'kreator' && selectedCount() > 0;
    $('app').classList.toggle('has-pick', pick);
    var main = $('main');
    if (ui.wizard) main.innerHTML = viewWizard();
    else if (ui.tab === 'kreator') main.innerHTML = viewKreator();
    else if (ui.tab === 'crm') main.innerHTML = viewCrm();
    else if (ui.tab === 'akun') main.innerHTML = viewAkun();
    else main.innerHTML = viewKampanye();
    if (ui.jobId) renderJob(ui.jobId);
  }
  function fmtStat(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'jt';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'rb';
    return String(Math.round(n));
  }
  function campaignKind(st) {
    if (st === 'selesai') return 'selesai';
    if (st === 'jeda' || st === 'pause') return 'jeda';
    return 'berjalan';
  }
  function campaignChip(st) {
    var kind = campaignKind(st);
    if (kind === 'selesai') return '<span class="chip ok dot">Selesai</span>';
    if (kind === 'jeda') return '<span class="chip warn dot">Jeda</span>';
    return '<span class="chip ok dot">Berjalan</span>';
  }
  function statsHtml(items) {
    return '<div class="stats">' + items.map(function (it) {
      return '<div class="stat"><b>' + esc(it.n) + '</b><span>' + esc(it.label) + '</span></div>';
    }).join('') + '</div>';
  }
  function filteredCreators() {
    var q = (ui.filter || '').toLowerCase();
    return db.creators.filter(function (c) {
      if (!q) return true;
      return (c.handle + ' ' + (c.name || '') + ' ' + (c.creatorOpenId || '')).toLowerCase().indexOf(q) !== -1;
    });
  }
  function sampleCsvUrl() {
    try { return chrome.runtime.getURL('sample/Creator_List_ID_Last30Days_sample.csv'); }
    catch (e) { return 'sample/Creator_List_ID_Last30Days_sample.csv'; }
  }

  function closeOverlay() {
    ui.jobId = null;
    var el = $('overlay');
    el.hidden = true;
    el.innerHTML = '';
  }
  function openOverlay(html) {
    var el = $('overlay');
    el.innerHTML = html;
    el.hidden = false;
  }

  function connChip() {
    if (ui.conn.affiliate) return '<span class="chip ok">Affiliate Center</span>';
    if (ui.conn.shopSession) return '<span class="chip warn">Seller Center</span>';
    return '<span class="chip locked">belum tab</span>';
  }

  function viewKampanye() {
    var list = db.campaigns.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var nBerjalan = list.filter(function (c) { return campaignKind(c.status) === 'berjalan'; }).length;
    var nSelesai = list.filter(function (c) { return campaignKind(c.status) === 'selesai'; }).length;
    var nJeda = list.filter(function (c) { return campaignKind(c.status) === 'jeda'; }).length;
    var shown = list.filter(function (c) {
      return ui.campFilter === 'all' || campaignKind(c.status) === ui.campFilter;
    });
    var filters = [
      { id: 'all', label: 'Semua' },
      { id: 'berjalan', label: 'Berjalan' },
      { id: 'selesai', label: 'Selesai' },
      { id: 'jeda', label: 'Jeda' }
    ];
    var body = shown.length
      ? shown.map(campaignCard).join('')
      : '<div class="empty card"><p class="muted">Belum ada kampanye. Kirim memakai sesi Affiliate Center di tab Chrome — bukan preview.</p></div>';
    return '<div class="page-head"><h2>Kampanye</h2>' +
      '<p>Buat dan kelola undangan affiliate dari Chrome. ' + connChip() + '</p></div>' +
      '<button type="button" class="btn" data-act="new-campaign">+ Buat kampanye</button>' +
      statsHtml([
        { n: list.length, label: 'Total' },
        { n: nBerjalan, label: 'Berjalan' },
        { n: nSelesai, label: 'Selesai' },
        { n: nJeda, label: 'Jeda' }
      ]) +
      '<div class="filters">' + filters.map(function (f) {
        return '<button type="button" class="filter" data-act="camp-filter" data-id="' + f.id + '" aria-selected="' + (ui.campFilter === f.id) + '">' + esc(f.label) + '</button>';
      }).join('') + '</div>' +
      body;
  }

  function campaignCard(c) {
    var k = counts(c);
    var pct = k.n ? Math.round((k.sent + k.failed + (k.probed || 0)) / k.n * 100) : 0;
    return '<section class="card camp-card" data-act="open-campaign" data-id="' + esc(c.id) + '">' +
      '<div class="camp-top"><h3>' + esc(c.title) + '</h3>' + campaignChip(c.status) + '</div>' +
      '<p class="camp-meta">' + esc(channelLabel(c.channel)) + ' · ' + fmtWhen(c.createdAt) + '</p>' +
      '<div class="metrics">' +
        '<div><b>' + k.n + '</b><span>Kreator</span></div>' +
        '<div><b>' + k.sent + '</b><span>Terkirim</span></div>' +
        '<div><b>' + k.pending + '</b><span>Menunggu</span></div>' +
        '<div><b>' + k.failed + '</b><span>Gagal</span></div>' +
      '</div>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="camp-foot"><span class="muted">' + pct + '%</span>' +
        '<button type="button" class="link" data-act="open-campaign" data-id="' + esc(c.id) + '">Lihat detail</button></div>' +
      '</section>';
  }

  function viewKreator() {
    var rows = filteredCreators();
    var selectedN = rows.filter(function (c) { return ui.selected[c.id]; }).length;
    var kalo = ui.conn.kalodata && ui.conn.kalodata.present
      ? '<span class="chip ok">Kalodata · ' + (ui.conn.kalodata.count || 0) + ' baris terlihat</span>'
      : '<span class="chip locked">Kalodata belum tab</span>';
    return '<div class="page-head"><h2>Kreator</h2>' +
      '<p>Temukan dan pilih kreator, lalu kirim kolaborasi.</p></div>' +
      (ui.importNotice ? '<div class="notice-ok" role="status">' + esc(ui.importNotice) + '</div>' : '') +
      '<input class="search" type="search" placeholder="Cari handle atau nama kreator…" value="' + esc(ui.filter) + '" data-act="filter">' +
      '<section class="card flat" style="margin-top:10px">' +
        '<details class="import-box">' +
          '<summary>Import kreator</summary>' +
          '<p class="muted">Tempel baris Kalodata, ambil halaman yang terlihat, atau CSV. Starter Kalodata tidak bisa ekspor.</p>' +
          '<form data-act="add-handle" class="row" style="margin-bottom:10px">' +
            '<input name="handle" type="text" placeholder="@handle" required autocomplete="off" style="flex:1;min-width:0">' +
            '<button class="btn-sm" type="submit">Tambah</button>' +
          '</form>' +
          '<label class="field">Tempel dari Kalodata</label>' +
          '<textarea data-act="paste-handles" placeholder="@handle atau Unique ID, satu per baris"></textarea>' +
          '<button type="button" class="btn-ghost" data-act="paste-go" style="margin-top:8px">Masukkan tempelan</button>' +
          '<p class="muted" style="margin-top:10px">' + kalo + '</p>' +
          '<button type="button" class="btn" data-act="kalo-read" style="margin-top:8px"' +
            (db.account.allowKalodataRead ? '' : ' disabled') +
          '>Ambil dari halaman Kalodata</button>' +
          '<p class="muted">Geser halaman di Kalodata, lalu Ambil lagi. Membaca banyak halaman ada di wizard, dengan opt-in terpisah.</p>' +
          '<label class="field">Import CSV</label>' +
          '<input type="file" accept=".csv,text/csv" data-act="csv">' +
          '<a class="btn-ghost" href="' + esc(sampleCsvUrl()) + '" download="Creator_List_ID_Last30Days_sample.csv" style="margin-top:10px;display:block;text-align:center;text-decoration:none">Unduh contoh Kalodata</a>' +
        '</details>' +
        '<div class="list-head">' +
          '<label class="muted"><input type="checkbox" data-act="sel-all" ' + (rows.length && selectedN === rows.length ? 'checked' : '') + '> Pilih semua</label>' +
          '<span>' + rows.length + ' kreator</span>' +
        '</div>' +
        (rows.length ? rows.map(personRow).join('') : '<p class="muted" style="padding:16px 12px">Kosong. Tambah handle atau import dulu.</p>') +
      '</section>' +
      (selectedN
        ? '<div class="pick-bar"><span>' + selectedN + ' kreator dipilih</span>' +
          '<button type="button" class="btn-sm" data-act="new-campaign">Kirim kolaborasi</button></div>'
        : '');
  }

  function personRow(c) {
    var bits = [];
    if (c.name) bits.push(esc(c.name));
    if (c.followers) bits.push(fmtStat(c.followers) + ' pengikut');
    if (c.revenue) bits.push(fmtStat(c.revenue) + ' omset');
    if (!c.creatorOpenId) bits.push('handle saja');
    if (c.source === 'kalodata-page') bits.push('halaman Kalodata');
    if (c.demo) bits.push('contoh');
    return '<label class="person">' +
      '<input type="checkbox" data-act="sel" data-id="' + esc(c.id) + '"' + (ui.selected[c.id] ? ' checked' : '') + '>' +
      '<span><strong>' + esc(Send.displayHandle(c.handle)) + '</strong>' +
        (bits.length ? '<span class="meta">' + bits.join(' · ') + '</span>' : '') + '</span>' +
      '<span class="person-side">' + statusChip(c.status) +
        '<button type="button" class="btn-ghost slim" data-act="del-creator" data-id="' + esc(c.id) + '">Hapus</button></span>' +
      '</label>';
  }

  function statusChip(st) {
    if (st === 'probed') return '<span class="chip warn">uji · tidak kirim</span>';
    if (st === 'sent') return '<span class="chip ok">terkirim</span>';
    if (st === 'sending') return '<span class="chip warn">mengirim</span>';
    if (st === 'failed') return '<span class="chip bad">gagal</span>';
    if (st === 'connected') return '<span class="chip ok">terhubung</span>';
    return '<span class="chip">baru</span>';
  }

  function viewCrm() {
    var rows = [];
    var nSent = 0, nWait = 0, nFail = 0, nQueue = 0;
    db.campaigns.forEach(function (c) {
      (c.rows || []).forEach(function (r) {
        if (r.status === 'sent' || r.status === 'probed') nSent += 1;
        else if (r.status === 'sending') nWait += 1;
        else if (r.status === 'failed') nFail += 1;
        else nQueue += 1;
        rows.push({ campaign: c.title, handle: r.handle, status: r.status, at: r.at, note: r.note || '' });
      });
    });
    rows.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    return '<div class="page-head"><h2>CRM</h2>' +
      '<p>Pantau status kolaborasi di toko Chrome ini.</p></div>' +
      statsHtml([
        { n: nSent, label: 'Terkirim' },
        { n: nWait, label: 'Menunggu' },
        { n: nFail, label: 'Gagal' },
        { n: nQueue, label: 'Antrean' }
      ]) +
      '<section class="card flat">' +
        '<div class="list-head"><span>Aktivitas</span><span>' + rows.length + '</span></div>' +
        (rows.length
          ? rows.map(function (r) {
              return '<div class="person" style="grid-template-columns:1fr auto">' +
                '<span><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
                '<span class="meta">' + esc(r.campaign) + ' · ' + fmtWhen(r.at) +
                (r.note ? ' · ' + esc(r.note) : '') + '</span></span>' +
                statusChip(r.status) + '</div>';
            }).join('')
          : '<p class="muted" style="padding:16px 12px">Belum ada kiriman.</p>') +
      '</section>';
  }

  function reconLine(ok, label) {
    return '<li>' + (ok ? '<span class="chip ok">terrekam</span>' : '<span class="chip locked">belum</span>') + ' ' + esc(label) + '</li>';
  }

  function connState(ok, yes, no) {
    return ok ? '<span class="chip ok">' + esc(yes || 'Terhubung') + '</span>' : '<span class="chip locked">' + esc(no || 'Belum') + '</span>';
  }
  function currentOrigin() {
    try { return ui.conn.href ? new URL(ui.conn.href).origin : ''; } catch (e) { return ''; }
  }
  function reconShopLine() {
    var origin = ui.conn.reconOrigin || '';
    var shop = ui.conn.reconShopName || '';
    if (!origin && !shop) return '';
    var cur = currentOrigin();
    var mismatch = origin && cur && origin !== cur;
    var line = 'Rekaman dari: ' + (shop || 'toko') + (origin ? ' · ' + origin : '');
    return '<p class="muted" style="margin-top:10px">' + esc(line) + '</p>' +
      (mismatch
        ? '<div class="note">Rekaman adapter dari origin lain. Hapus rekaman adapter di bawah, lalu kirim 1 undangan manual di toko ini.</div>'
        : '');
  }
  function viewAkun() {
    var recon = ui.conn.recon || {};
    var href = ui.conn.href || '';
    var shop = ui.conn.shopName || db.account.shopName || 'Toko belum terbaca';
    var usedPct = Math.min(100, db.quota.used / db.quota.dailyCap * 100);
    var kaloOn = !!(ui.conn.kalodata && ui.conn.kalodata.present);
    return '<div class="page-head"><h2>Akun</h2>' +
      '<p>Kelola koneksi, kuota, dan pengaturan ekstensi.</p></div>' +
      '<section class="card">' +
        '<h3>Koneksi</h3>' +
        '<div class="conn-row"><div><strong>Affiliate Center</strong>' +
          (href ? '<span class="meta">' + esc(pathOnly(href)) + '</span>' : '<span class="meta">Sesi Chrome kamu</span>') +
          '</div><div class="side">' + connState(!!ui.conn.affiliate) +
          '<button type="button" class="btn-ghost slim" data-act="open-affiliate">Buka</button></div></div>' +
        '<div class="conn-row"><div><strong>Seller Center</strong><span class="meta">Login toko di tab ini</span></div>' +
          '<div class="side">' + connState(!!ui.conn.shopSession) + '</div></div>' +
        '<div class="conn-row"><div><strong>Kalodata</strong><span class="meta">' +
          (kaloOn ? (ui.conn.kalodata.count || 0) + ' baris terlihat' : 'Buka tab kalodata.com/creator') +
          '</span></div><div class="side">' + connState(kaloOn) + '</div></div>' +
        reconShopLine() +
      '</section>' +
      '<section class="card">' +
        '<h3>Toko</h3>' +
        '<div class="shop-line"><strong>' + esc(shop) + '</strong>' + connChip() + '</div>' +
        '<p class="muted">Tidak ada kolom password. Pakai login Chrome kamu.</p>' +
        '<button type="button" class="btn-ghost" data-act="probe-one" style="margin-top:8px">Uji cari 1 kreator (tidak kirim)</button>' +
      '</section>' +
      '<section class="card">' +
        '<h3>Kuota lokal</h3>' +
        '<div class="bar"><span style="width:' + usedPct + '%"></span></div>' +
        '<p class="quota-line">Hari ini ' + db.quota.used + ' / ' + db.quota.dailyCap + ' kreator. Hitungan lokal, bukan cap live TikTok.</p>' +
        '<p class="muted">50 kreator / kolaborasi, 1.000 kolaborasi / 24 jam. Kuota mingguan toko bisa lebih kecil.</p>' +
        '<button type="button" class="btn-ghost" data-act="reset-quota" style="margin-top:8px">Reset kuota lokal</button>' +
      '</section>' +
      '<section class="card">' +
        '<h3>Siap kirim</h3>' +
        '<ul class="checklist">' +
          reconLine(!!ui.conn.affiliate, 'Affiliate Center terbuka') +
          reconLine(!!(ui.conn.recon && ui.conn.recon.collab), 'Target Collab terrekam') +
          reconLine(!!(ui.conn.recon && ui.conn.recon.search), 'Cari kreator terrekam') +
          reconLine(!!(ui.conn.recon && ui.conn.recon.sku && ui.conn.recon.sku.productId), skuLine()) +
          reconLine(!!db.account.allowLiveSend, 'Kirim live diizinkan') +
        '</ul>' +
      '</section>' +
      '<section class="card">' +
        '<h3>Pengaturan</h3>' +
        '<div class="setting-row"><div><strong>Izinkan kirim live</strong>' +
          '<span class="meta">Terkunci sampai kamu centang dan konfirmasi di wizard.</span></div>' +
          '<label class="toggle"><input type="checkbox" data-act="arm-live"' + (db.account.allowLiveSend ? ' checked' : '') + '></label></div>' +
        (db.account.allowLiveSend ? '<p class="note">Live terbuka. Tes 1 / Kirim minta konfirmasi lagi.</p>' : '') +
        '<div class="setting-row"><div><strong>Baca halaman Kalodata</strong>' +
          '<span class="meta">Opt-in. Risiko ke akun Kalodata kamu (ToS 4.1.7 / 4.1.8). Satu halaman.</span></div>' +
          '<label class="toggle"><input type="checkbox" data-act="arm-kalo" aria-label="Baca halaman Kalodata"' + (db.account.allowKalodataRead ? ' checked' : '') + '></label></div>' +
        '<div class="setting-row"><div><strong>Baca semua halaman Kalodata</strong>' +
          '<span class="meta">Opt-in terpisah. Mengklik Berikutnya di tabel yang terbuka. Risiko yang sama.</span></div>' +
          '<label class="toggle"><input type="checkbox" data-act="arm-kalo-pages" aria-label="Baca semua halaman Kalodata"' + (db.account.allowKalodataPages ? ' checked' : '') + '></label></div>' +
      '</section>' +
      '<section class="card">' +
        '<h3>Adapter</h3>' +
        '<p class="muted">Untuk daftar: Find Creators, kosongkan pencarian, set filter, buka halaman 2. Ketik satu handle hanya untuk uji cari. Ganti produk: kirim 1 undangan manual lagi.</p>' +
        '<ul class="recon-list">' +
          reconLine(!!recon.collab, 'Target Collab') +
          reconLine(!!recon.im, 'Pesan IM') +
          reconLine(!!recon.search, 'Cari kreator') +
        '</ul>' +
        '<button type="button" class="btn-ghost" data-act="reset-recon" style="margin-top:10px">Hapus rekaman adapter</button>' +
        '<button type="button" class="btn-ghost" data-act="copy-diag" style="margin-top:8px">Salin diagnostik</button>' +
      '</section>' +
      '<section class="card">' +
        '<h3>Pengirim di template</h3>' +
        '<label class="field">Handle</label>' +
        '<input type="text" data-act="acc-handle" value="' + esc(db.account.handle) + '">' +
        '<label class="field">Nama</label>' +
        '<input type="text" data-act="acc-name" value="' + esc(db.account.name) + '">' +
        '<label class="field">Produk</label>' +
        '<input type="text" data-act="acc-produk" value="' + esc(db.account.productName) + '">' +
        '<label class="field">Komisi %</label>' +
        '<input type="number" min="1" max="80" data-act="acc-komisi" value="' + esc(db.account.commissionPct) + '">' +
      '</section>' +
      '<section class="card">' +
        '<button type="button" class="btn-ghost danger" data-act="reset-all">Hapus data lokal</button>' +
      '</section>';
  }

  function skuNow() {
    var sku = ui.conn.sku || {};
    if (sku.productId) return sku;
    return (ui.conn.recon && ui.conn.recon.sku) || {};
  }
  function endDateInput(raw) {
    if (raw == null || raw === '') return '';
    var n = Number(raw);
    if (!isFinite(n) || n < 1e9) {
      var s = String(raw);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
    }
    var ms = n > 1e12 ? n : n * 1000;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    } catch (e) { return ''; }
  }
  function defaultTake() {
    var live = ui.conn.liveQuota && ui.conn.liveQuota.remaining;
    var n = leftDaily();
    if (typeof live === 'number') n = Math.min(n, live);
    return Math.max(0, Math.min(Send.DAILY, n));
  }
  function blockedHandles() {
    var set = {};
    (db.blacklist || []).forEach(function (h) {
      var n = Send.normHandle(h);
      if (n) set[n] = 'blacklist';
    });
    var pid = skuNow().productId || '';
    db.campaigns.forEach(function (c) {
      if (c.dryRun) return;
      if (pid && c.productId && String(c.productId) !== String(pid)) return;
      (c.rows || []).forEach(function (r) {
        if (r.status === 'sent') set[Send.normHandle(r.handle)] = 'dup';
      });
    });
    return set;
  }
  function wizardCreators() {
    var w = ui.wizard || {};
    var minF = Number(w.minFollowers) || 0;
    var minR = Number(w.minRevenue) || 0;
    var q = String(w.filter || '').toLowerCase();
    var blocked = blockedHandles();
    return db.creators.filter(function (c) {
      if (blocked[c.handle]) return false;
      if (minF && c.followers && c.followers < minF) return false;
      if (minR && c.revenue && c.revenue < minR) return false;
      if (q && (c.handle + ' ' + (c.name || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function removalCounts() {
    var blocked = blockedHandles();
    var dup = 0;
    var black = 0;
    db.creators.forEach(function (c) {
      if (blocked[c.handle] === 'dup') dup += 1;
      if (blocked[c.handle] === 'blacklist') black += 1;
    });
    return { dup: dup, black: black };
  }
  function shapeFromRecon(recon) {
    var P = window.LarisAffiliatePaging;
    if (!P || !recon) return null;
    var list = recon.search || [];
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var body = null;
      try { body = JSON.parse(list[i].reqBody || ''); } catch (e) { body = null; }
      if (!body) continue;
      var spec = P.describeSearch(body);
      if (!fallback) fallback = spec;
      if (!spec.handleLookup && (spec.page || spec.offset || spec.cursor)) return spec;
    }
    return fallback;
  }
  function liveQuotaLine() {
    var q = ui.conn.liveQuota;
    if (!q || q.remaining == null) {
      return 'Kuota TikTok belum terekam. Buka halaman undangan di Affiliate Center supaya rate_limit_info ikut terekam.';
    }
    var total = q.total != null ? ' / ' + q.total : '';
    return 'Kuota TikTok tersisa ' + q.remaining + total + '. Bukan jaminan; toko bisa berhenti lebih awal.';
  }
  function findHint() {
    var shape = ui.conn.searchShape;
    if (!shape) return 'Buka Find Creators, set filter, lalu buka halaman berikutnya. Setelah itu Cek rekaman.';
    if (shape.handleLookup) return 'Rekaman terakhir cari satu handle. Kosongkan pencarian, set filter, buka halaman 2, lalu Cek rekaman.';
    if (!shape.page && !shape.offset && !shape.cursor) return 'Rekaman belum punya nomor halaman. Buka halaman 2 di Find Creators, lalu Cek rekaman.';
    var bits = ['Filter terekam'];
    if (shape.filters && shape.filters.followers) bits.push('pengikut min ' + shape.filters.followers.value);
    if (shape.filters && shape.filters.gmv) bits.push('GMV min ' + shape.filters.gmv.value);
    if (shape.filters && shape.filters.category) bits.push(shape.filters.category);
    return bits.join(' · ') + '. Ambil memutar halaman itu.';
  }
  function stepHead() {
    var labels = ['Produk', 'Kreator', 'Undangan', 'Kirim'];
    return '<div class="step-labels">' + labels.map(function (label, i) {
      return '<span class="' + (i <= ui.wizard.step ? 'on' : '') + '">' + (i + 1) + '. ' + esc(label) + '</span>';
    }).join('') + '</div><div class="steps">' + [0, 1, 2, 3].map(function (i) {
      return '<i' + (i <= ui.wizard.step ? ' class="on"' : '') + '></i>';
    }).join('') + '</div>';
  }
  function wizActions(nextLabel) {
    var back = ui.wizard.step > 0 ? '<button type="button" class="btn-ghost" data-act="wiz-back">Kembali</button>' : '';
    var cancel = ui.wizard.step === 0 ? '<button type="button" class="btn-ghost" data-act="wiz-cancel">Batal</button>' : '';
    return '<div class="sticky-actions"><button type="button" class="btn" data-act="wiz-next">' + esc(nextLabel || 'Lanjut') + '</button>' +
      back + cancel + '</div>';
  }

  function viewWizard() {
    var w = ui.wizard;
    var sku = skuNow();
    var html = stepHead();
    if (w.step === 0) {
      html += '<section class="card"><h2>Produk</h2>' +
        '<p class="preview-banner">Dari undangan manual yang terekam · ganti SKU dengan 1 undangan baru</p>' +
        (sku.productId
          ? '<p><strong>' + esc(sku.productName || ('produk ' + sku.productId)) + '</strong></p>' +
            '<p class="muted">ID ' + esc(sku.productId) + '</p>'
          : '<div class="note">Belum ada undangan terekam. Kirim 1 Target Collab manual di Affiliate Center untuk produk dan komisi yang akan dipakai.</div>') +
        (sku.hasCommission
          ? '<label class="field">Komisi %</label><input type="number" min="1" max="80" step="0.1" data-act="wiz-komisi" value="' + esc(w.commissionPct) + '">'
          : (sku.productId ? '<p class="muted">Komisi mengikuti rekaman' + (sku.commissionPct != null ? ' (' + esc(sku.commissionPct) + '%)' : '') + '.</p>' : '')) +
        (sku.hasName
          ? '<label class="field">Nama undangan</label><input type="text" data-act="wiz-nama" value="' + esc(w.invitationName || '') + '">'
          : '') +
        (sku.hasEnd
          ? '<label class="field">Berlaku sampai</label><input type="date" data-act="wiz-end" value="' + esc(w.endDate || '') + '">'
          : '') +
        wizActions() + '</section>';
    } else if (w.step === 1) {
      html += viewWizardCreators();
    } else if (w.step === 2) {
      html += '<section class="card"><h2>Undangan</h2>' +
        '<button type="button" class="channel' + (w.channel === 'target_collab' ? ' on' : '') + '" data-act="wiz-ch" data-id="target_collab">' +
          '<strong>Kolaborasi Bertarget</strong><em>' + esc(Send.endpointFor('target_collab')) + '</em></button>' +
        '<button type="button" class="channel' + (w.channel === 'im' ? ' on' : '') + '" data-act="wiz-ch" data-id="im">' +
          '<strong>Pesan IM</strong><em>' + esc(Send.endpointFor('im')) + '</em></button>' +
        '<p class="muted">{handle} {name} {toko} {produk} {komisi}</p>' +
        (w.channel === 'target_collab' && sku.hasMessage === false
          ? '<div class="note">Rekaman Target Collab tidak punya field pesan. Teks di bawah tidak dikirim ke kreator — hanya nama, produk, dan komisi yang terekam.</div>'
          : '') +
        '<textarea data-act="wiz-tpl">' + esc(w.template) + '</textarea>' +
        wizActions() + '</section>';
    } else {
      var chosen = selectedCreators(w).filter(function (c) { return !blockedHandles()[c.handle]; });
      var cap = leftDaily();
      var liveLeft = ui.conn.liveQuota && ui.conn.liveQuota.remaining;
      if (typeof liveLeft === 'number') cap = Math.min(cap, liveLeft);
      var n = Math.min(chosen.length, cap, Send.DAILY);
      var batches = n ? Math.ceil(n / Send.BATCH) : 0;
      var bare = chosen.filter(function (c) { return !c.creatorOpenId; }).length;
      var dropped = selectedCreators(w).length - chosen.length;
      html += '<section class="card"><h2>Kirim</h2>' +
        '<p class="note">' + esc(wizardSkuLine()) + '</p>' +
        '<p><strong>' + n + '</strong> kreator · ' + batches + ' kolaborasi × max ' + Send.BATCH +
          ' · sisa hitungan lokal ' + leftDaily() + '.</p>' +
        '<p class="muted">' + esc(liveQuotaLine()) + '</p>' +
        (bare ? '<p class="muted">' + bare + ' handle masih perlu dicari di TikTok sebelum undangan (belum ada creator_oec_id).</p>' : '') +
        (dropped ? '<p class="muted">' + dropped + ' tidak ikut: sudah diundang untuk produk ini, atau ada di blacklist.</p>' : '') +
        '<p class="muted">50 kreator per kolaborasi, jeda 4–7 detik. Jangan tutup overlay atau tab Affiliate Center.</p>' +
        (ui.conn.ok ? '<p class="muted">' + connChip() + '</p>' :
          '<div class="note">Seller Center belum terhubung. Buka tabnya dulu.</div>') +
        (db.account.allowLiveSend
          ? '<div class="note">Kirim live terbuka. Tes 1 / Kirim kampanye minta konfirmasi, lalu benar-benar mengundang.</div>'
          : '<p class="muted">Kirim live terkunci. Uji cari tidak mengirim undangan.</p>') +
        '<div class="sticky-actions">' +
          '<button type="button" class="btn" data-act="wiz-probe"' + (n && ui.conn.ok ? '' : ' disabled') + '>Uji cari (tidak kirim)</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-probe-all"' + (n && ui.conn.ok ? '' : ' disabled') + '>Uji cari semua (tidak kirim)</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-one"' + (n && ui.conn.ok && db.account.allowLiveSend ? '' : ' disabled') + '>Tes 1 kreator · LIVE</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-go"' + (n && ui.conn.ok && db.account.allowLiveSend ? '' : ' disabled') + '>Kirim kampanye · LIVE</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-back">Kembali</button></div></section>';
    }
    return html;
  }

  function viewWizardCreators() {
    var w = ui.wizard;
    var shape = ui.conn.searchShape;
    var rows = wizardCreators();
    var removed = removalCounts();
    var kalo = ui.conn.kalodata && ui.conn.kalodata.present
      ? '<span class="chip ok">Kalodata · ' + (ui.conn.kalodata.count || 0) + ' baris terlihat</span>'
      : '<span class="chip locked">Kalodata belum tab</span>';
    var shown = rows.slice(0, 300);
    var findFilters = '';
    if (shape && shape.filters && shape.filters.followers) {
      findFilters += '<label class="field">Pengikut min (rekaman)</label><input type="number" min="0" data-act="wiz-find-fol" value="' + esc(w.findFollowers != null ? w.findFollowers : shape.filters.followers.value) + '">';
    }
    if (shape && shape.filters && shape.filters.gmv) {
      findFilters += '<label class="field">GMV min (rekaman)</label><input type="number" min="0" data-act="wiz-find-gmv" value="' + esc(w.findGmv != null ? w.findGmv : shape.filters.gmv.value) + '">';
    }
    var source = w.kreatorTab === 'kalo'
      ? '<p class="muted">' + kalo + '</p>' +
        '<div class="row" style="margin:8px 0">' +
          '<button type="button" class="btn-sm" data-act="open-kalodata">Buka Kalodata</button>' +
          '<button type="button" class="btn-sm" data-act="kalo-read"' + (db.account.allowKalodataRead ? '' : ' disabled') + '>Ambil halaman ini</button>' +
        '</div>' +
        '<div class="setting-row"><div><strong>Baca halaman ini</strong><span class="meta">Opt-in. ToS Kalodata 4.1.7 / 4.1.8, risiko ke akun kamu.</span></div>' +
          '<label class="toggle"><input type="checkbox" data-act="arm-kalo" aria-label="Baca halaman ini"' + (db.account.allowKalodataRead ? ' checked' : '') + '></label></div>' +
        '<div class="setting-row"><div><strong>Baca semua halaman</strong><span class="meta">Klik Berikutnya di tabel yang terbuka. Opt-in terpisah, risiko yang sama.</span></div>' +
          '<label class="toggle"><input type="checkbox" data-act="arm-kalo-pages" aria-label="Baca semua halaman"' + (db.account.allowKalodataPages ? ' checked' : '') + '></label></div>' +
        '<button type="button" class="btn" data-act="kalo-pages"' + (db.account.allowKalodataPages ? '' : ' disabled') + '>Baca semua halaman</button>' +
        '<button type="button" class="btn-ghost" data-act="pull-stop" style="margin-top:8px">Berhenti</button>' +
        '<label class="field">Tempel dari Kalodata</label>' +
        '<textarea data-act="paste-handles" placeholder="@handle atau Unique ID, satu per baris"></textarea>' +
        '<button type="button" class="btn-ghost" data-act="paste-go" style="margin-top:8px">Masukkan tempelan</button>' +
        '<label class="field">Import CSV</label>' +
        '<input type="file" accept=".csv,text/csv" data-act="csv">' +
        '<p class="muted">Unique ID belum terbukti sama dengan creator_oec_id. Pembanding rekaman: @bule_barat = 7495372765352463150.</p>'
      : '<p class="muted">' + esc(findHint()) + '</p>' +
        findFilters +
        '<div class="row" style="margin-top:8px">' +
          '<button type="button" class="btn-sm" data-act="wiz-refresh">Cek rekaman</button>' +
          '<button type="button" class="btn-sm" data-act="open-affiliate">Buka Affiliate</button>' +
        '</div>' +
        '<button type="button" class="btn" data-act="wiz-find" style="margin-top:8px"' + (ui.finding ? ' disabled' : '') + '>Ambil dari Find Creators</button>' +
        '<button type="button" class="btn-ghost" data-act="pull-stop" style="margin-top:8px">Berhenti</button>';
    var list = '<section class="card flat"><div class="list-head">' +
      '<label class="muted"><input type="checkbox" data-act="wiz-all"' + (rows.length && rows.every(function (c) { return w.ids[c.id]; }) ? ' checked' : '') + '> Pilih yang tampil (' + rows.length + ')</label>' +
      '<span>' + selectedCreators(w).length + ' dipilih</span></div>' +
      '<input class="search" type="search" placeholder="Cari handle…" value="' + esc(w.filter || '') + '" data-act="wiz-q">' +
      '<div class="row" style="padding:8px 12px">' +
        '<input type="number" min="0" placeholder="Min pengikut" data-act="wiz-min-fol" value="' + esc(w.minFollowers || '') + '" style="width:auto;flex:1">' +
        '<input type="number" min="0" placeholder="Min omset" data-act="wiz-min-rev" value="' + esc(w.minRevenue || '') + '" style="width:auto;flex:1">' +
      '</div>' +
      (removed.dup || removed.black ? '<p class="muted" style="padding:0 12px">Disembunyikan: ' + removed.dup + ' sudah diundang untuk produk ini, ' + removed.black + ' blacklist.</p>' : '') +
      '<div class="creator-scroll">' +
      (shown.length ? shown.map(function (c) {
        return '<label class="person"><input type="checkbox" data-act="wiz-sel" data-id="' + esc(c.id) + '"' + (w.ids[c.id] ? ' checked' : '') + '>' +
          '<span><strong>' + esc(Send.displayHandle(c.handle)) + '</strong><span class="meta">' + esc(c.name || '') +
          (c.followers ? ' · ' + fmtStat(c.followers) + ' pengikut' : '') +
          (c.revenue ? ' · ' + fmtStat(c.revenue) + ' omset' : '') +
          (c.creatorOpenId ? '' : ' · handle saja') + '</span></span></label>';
      }).join('') : '<p class="muted" style="padding:16px 12px">Belum ada yang lolos filter.</p>') +
      (rows.length > shown.length ? '<p class="muted" style="padding:8px 12px">Menampilkan 300 dari ' + rows.length + '.</p>' : '') +
      '</div>' +
      '<label class="field" style="padding:0 12px">Blacklist</label>' +
      '<textarea data-act="wiz-blacklist" placeholder="@handle, satu per baris" style="margin:0 12px 12px;width:calc(100% - 24px)">' + esc((db.blacklist || []).join('\n')) + '</textarea>' +
      '</section>';
    return '<div class="wiz-split"><section class="card"><h2>Kreator</h2>' +
      '<div class="tabs">' +
        '<button type="button" data-act="wiz-ktab" data-id="find" aria-selected="' + (w.kreatorTab !== 'kalo') + '">Temukan kreator</button>' +
        '<button type="button" data-act="wiz-ktab" data-id="kalo" aria-selected="' + (w.kreatorTab === 'kalo') + '">Dari Kalodata</button>' +
      '</div>' +
      '<label class="field">Jumlah</label>' +
      '<input type="number" min="1" max="1000" data-act="wiz-taken" value="' + esc(w.takeN) + '">' +
      '<p class="muted">Default mengikuti sisa kuota. Maks 1.000.</p>' +
      source +
      '<p id="pull-note" class="muted">' + esc(ui.pullNote || '') + '</p>' +
      wizActions() + '</section>' + list + '</div>';
  }

  function wizardSkuLine() {
    var sku = skuNow();
    var w = ui.wizard || {};
    if (!sku.productId && !sku.productName) return skuLine();
    var pct = w.commissionPct != null && w.commissionPct !== '' ? w.commissionPct : sku.commissionPct;
    var comm = pct != null && pct !== '' ? (Math.round(Number(pct) * 10) / 10) + '%' : '—';
    var name = w.invitationName || sku.invitationName || '';
    return (sku.productName || ('produk ' + sku.productId)) + ' · komisi ' + comm + (name ? ' · ' + name : '');
  }

  function selectedCreators(w) {
    return db.creators.filter(function (c) { return w.ids[c.id]; });
  }

  function startWizard() {
    var ids = {};
    Object.keys(ui.selected).forEach(function (id) { if (ui.selected[id]) ids[id] = true; });
    if (!Object.keys(ids).length) {
      rankedCreators(newCreators()).slice(0, Send.BATCH).forEach(function (c) { ids[c.id] = true; });
    }
    var sku = skuNow();
    ui.wizard = {
      step: 0,
      channel: 'target_collab',
      ids: ids,
      template: db.template,
      kreatorTab: 'find',
      takeN: defaultTake(),
      minFollowers: '',
      minRevenue: '',
      filter: '',
      commissionPct: sku.commissionPct != null ? sku.commissionPct : (db.account.commissionPct || ''),
      invitationName: sku.invitationName || '',
      endDate: endDateInput(sku.endTime),
      findFollowers: sku && ui.conn.searchShape && ui.conn.searchShape.filters && ui.conn.searchShape.filters.followers
        ? ui.conn.searchShape.filters.followers.value : '',
      findGmv: ui.conn.searchShape && ui.conn.searchShape.filters && ui.conn.searchShape.filters.gmv
        ? ui.conn.searchShape.filters.gmv.value : ''
    };
    render();
  }

  function applyTakeN(n) {
    if (!ui.wizard) return;
    var ids = {};
    rankedCreators(newCreators()).slice(0, n).forEach(function (c) { ids[c.id] = true; });
    ui.wizard.ids = ids;
    render();
  }

  function startJobFromWizard(opts) {
    opts = opts || {};
    var w = ui.wizard;
    if (!ui.conn.ok) {
      toast('Buka Seller Center dulu');
      return;
    }
    var blocked = blockedHandles();
    var pool = selectedCreators(w).filter(function (c) { return !blocked[Send.normHandle(c.handle)]; });
    var dropped = selectedCreators(w).length - pool.length;
    var cap = leftDaily();
    var liveLeft = ui.conn.liveQuota && ui.conn.liveQuota.remaining;
    if (typeof liveLeft === 'number') cap = Math.min(cap, liveLeft);
    var chosen = pool.slice(0, cap);
    if (opts.limit) chosen = chosen.slice(0, opts.limit);
    if (!chosen.length) { toast('Tidak ada yang bisa dikirim'); return; }
    if (opts.dryRun) {
      /* probe only */
    } else {
      if (!db.account.allowLiveSend) { toast('Kirim live terkunci'); return; }
      var n = chosen.length;
      if (!confirm('LIVE: kirim ' + (w.channel === 'target_collab' ? 'undangan Target Collab' : 'pesan IM') + ' ke ' + n + ' kreator di toko kamu (max ' + Send.BATCH + ' per kolaborasi)' + (dropped ? '. ' + dropped + ' dilewati (duplikat/blacklist)' : '') + '. Lanjut?')) return;
    }
    db.template = w.template;
    var campaign = {
      id: uid('job'),
      title: (opts.dryRun ? 'Uji cari · ' : 'LIVE · ') + channelLabel(w.channel) + (opts.limit === 1 ? ' · 1' : '') + ' · ' + new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short', timeZone: JAKARTA }),
      channel: w.channel,
      template: w.template,
      dryRun: !!opts.dryRun,
      productId: skuNow().productId || '',
      invite: {
        commissionPct: w.commissionPct,
        invitationName: w.invitationName || '',
        endTime: (w.endDate && w.endDate !== endDateInput(skuNow().endTime)) ? w.endDate : ''
      },
      status: 'berjalan',
      createdAt: new Date().toISOString(),
      cursor: 0,
      failStreak: 0,
      rows: chosen.map(function (c) {
        return {
          creatorId: c.id,
          handle: c.handle,
          creatorOpenId: c.creatorOpenId || '',
          status: 'pending',
          at: null,
          note: '',
          endpoint: Send.endpointFor(w.channel)
        };
      })
    };
    db.campaigns.push(campaign);
    ui.wizard = null;
    persist();
    render();
    startRunner(campaign.id);
  }

  function claimLock(campaignId) {
    return new Promise(function (resolve) {
      if (!chrome.storage) { resolve(true); return; }
      chrome.storage.local.get(LOCK, function (res) {
        var lock = res[LOCK];
        if (lock && lock.owner !== SURFACE && (Date.now() - (lock.at || 0) < 8000)) {
          resolve(false);
          return;
        }
        chrome.storage.local.set({ [LOCK]: { owner: SURFACE, campaignId: campaignId, at: Date.now() } }, function () {
          resolve(true);
        });
      });
    });
  }
  function beatLock() {
    if (!runner.id || !chrome.storage) return;
    chrome.storage.local.set({ [LOCK]: { owner: SURFACE, campaignId: runner.id, at: Date.now() } });
  }
  function releaseLock() {
    if (!chrome.storage) return;
    chrome.storage.local.get(LOCK, function (res) {
      var lock = res[LOCK];
      if (lock && lock.owner === SURFACE) chrome.storage.local.remove(LOCK);
    });
    notifyParent(false);
  }

  function stopRunner() {
    if (runner.timer) clearTimeout(runner.timer);
    runner.timer = null;
    runner.id = null;
    runner.busy = false;
    runner.paused = false;
    releaseLock();
  }

  async function startRunner(id) {
    if (runner.timer) clearTimeout(runner.timer);
    runner.timer = null;
    var ok = await claimLock(id);
    if (!ok) {
      toast('Antrian sudah jalan di jendela lain. Tutup overlay atau panel itu dulu.', 'warn', 5000);
      return;
    }
    runner.id = id;
    runner.paused = false;
    runner.busy = false;
    ui.jobId = id;
    notifyParent(true);
    renderJob(id);
    queueTick(80);
  }

  function queueTick(ms) {
    if (runner.timer) clearTimeout(runner.timer);
    runner.timer = setTimeout(function () { tickCampaign(); }, ms);
  }

  function nextPendingBatch(campaign, limit) {
    var out = [];
    (campaign.rows || []).some(function (r) {
      if (r.status === 'pending') {
        out.push(r);
        if (out.length >= limit) return true;
      }
      return false;
    });
    return out;
  }

  function applyRowResult(campaign, row, result, dryRun) {
    row.at = new Date().toISOString();
    row.endpoint = result.endpoint || row.endpoint;
    row.note = result.requestId || result.reason || result.note || '';
    if (result.creatorOpenId && creatorById(row.creatorId) && !creatorById(row.creatorId).creatorOpenId) {
      creatorById(row.creatorId).creatorOpenId = result.creatorOpenId;
      row.creatorOpenId = result.creatorOpenId;
    }
    if (result.ok) {
      campaign.failStreak = 0;
      if (dryRun) {
        row.status = 'probed';
        if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'probed';
      } else {
        row.status = 'sent';
        if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'sent';
      }
    } else {
      row.status = 'failed';
      if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'failed';
    }
  }

  async function tickCampaign() {
    if (runner.paused || runner.busy) return;
    beatLock();
    var id = runner.id;
    var campaign = id && campaignById(id);
    if (!campaign) return;
    if (leftDaily() === 0) {
      campaign.status = 'pause';
      persist();
      renderJob(id);
      render();
      return;
    }
    if ((campaign.failStreak || 0) >= 3) {
      campaign.status = 'jeda';
      runner.paused = true;
      persist();
      renderJob(id);
      render();
      toast('Dijeda: 3 gagal berturut-turut. ' + (campaign.lastFail || ''), 'bad', 6000);
      return;
    }
    var pending = nextPending(campaign);
    if (!pending) {
      campaign.status = 'selesai';
      persist();
      stopRunner();
      renderJob(id);
      render();
      return;
    }
    var dryRun = !!campaign.dryRun;
    var batchSize = dryRun ? 1 : Math.min(Send.BATCH, leftDaily());
    var batch = nextPendingBatch(campaign, batchSize);
    runner.busy = true;
    batch.forEach(function (r) { r.status = 'sending'; });
    campaign.status = 'berjalan';
    persist();
    renderJob(id);
    var creators = batch.map(function (r) {
      return creatorById(r.creatorId) || { handle: r.handle, creatorOpenId: r.creatorOpenId, name: r.name || '' };
    });
    var ctx = {
      channel: campaign.channel,
      account: db.account,
      template: campaign.template,
      dryRun: dryRun,
      invite: campaign.invite || null
    };
    var leaves;
    var leftover = [];
    var lastReason = '';
    if (dryRun) {
      var probe = await Send.send(creators[0], ctx);
      leaves = [{ creators: creators, result: probe }];
    } else {
      var split = await Send.bisectDispatch(creators, ctx, function (list, c) {
        return Send.sendBatch(list, c);
      }, { minDelay: 800, maxDelay: 1200, pauseAt: 3 });
      leaves = split.leaves || [];
      leftover = split.leftover || [];
    }
    leftover.forEach(function (c) {
      var row = batch.find(function (r) { return Send.normHandle(r.handle) === Send.normHandle(c.handle); });
      if (row && row.status === 'sending') row.status = 'pending';
    });
    var sentN = 0;
    var size1Fails = 0;
    var anyGood = false;
    leaves.forEach(function (leaf) {
      var result = leaf.result || {};
      lastReason = result.reason || lastReason;
      var byHandle = {};
      (result.results || []).forEach(function (r) {
        if (r && r.handle) byHandle[Send.normHandle(r.handle)] = r;
      });
      (leaf.creators || []).forEach(function (c) {
        var row = batch.find(function (r) { return Send.normHandle(r.handle) === Send.normHandle(c.handle); });
        if (!row) return;
        var one = byHandle[Send.normHandle(row.handle)] || {
          ok: result.ok,
          reason: result.reason,
          creatorOpenId: result.creatorOpenId,
          endpoint: result.endpoint,
          requestId: result.requestId
        };
        applyRowResult(campaign, row, one, dryRun);
        if (row.status === 'sent') sentN += 1;
        if (row.status === 'sent' || row.status === 'probed') anyGood = true;
      });
      if (!dryRun && (leaf.creators || []).length === 1 && !result.ok) size1Fails += 1;
    });
    if (sentN) bumpQuota(sentN);
    if (!dryRun) {
      if (anyGood) campaign.failStreak = 0;
      if (size1Fails) campaign.failStreak = (campaign.failStreak || 0) + size1Fails;
      if (!anyGood && !size1Fails && leftover.length === 0) {
        campaign.failStreak = (campaign.failStreak || 0) + 1;
      }
      if (lastReason) campaign.lastFail = lastReason;
    } else if (!anyGood) {
      campaign.failStreak = (campaign.failStreak || 0) + 1;
      campaign.lastFail = lastReason || 'gagal';
    } else {
      campaign.failStreak = 0;
    }
    if (!dryRun && (campaign.failStreak || 0) >= 3) {
      campaign.status = 'jeda';
      runner.paused = true;
    }
    persist();
    runner.busy = false;
    renderJob(id);
    renderQuota();
    if (runner.paused) {
      render();
      toast('Dijeda: 3 gagal berturut-turut. ' + (campaign.lastFail || ''), 'bad', 6000);
      return;
    }
    if (!runner.paused && runner.id === id) {
      var wait = !nextPending(campaign) ? 220 : (dryRun ? 900 : 4000 + Math.floor(Math.random() * 3001));
      queueTick(wait);
    }
  }

  function renderJob(id) {
    var campaign = campaignById(id);
    if (!campaign) return;
    ui.jobId = id;
    var k = counts(campaign);
    var pct = k.n ? Math.round((k.sent + k.failed + (k.probed || 0)) / k.n * 100) : 0;
    var sending = (campaign.rows || []).find(function (r) { return r.status === 'sending'; });
    var log = (campaign.rows || []).slice().reverse().filter(function (r) { return r.status !== 'pending'; }).slice(0, 12);
    var pauseLbl = runner.paused ? 'Lanjut' : 'Jeda';
    var done = campaign.status === 'selesai';
    var quotaStop = campaign.status === 'pause' && leftDaily() === 0;
    openOverlay(
      '<p class="muted"><button type="button" class="btn-ghost" data-act="close-job">Tutup</button> · jangan tutup halaman Affiliate Center atau overlay ini. Menutupnya menghentikan antrian.</p>' +
      '<section class="card">' +
        '<p class="preview-banner">' + (campaign.dryRun ? 'UJI CARI · tidak kirim undangan' : 'LIVE · ' + esc(Send.endpointFor(campaign.channel))) + '</p>' +
        '<h2>' + esc(campaign.title) + '</h2>' +
        '<p class="muted">' + k.sent + ' terkirim · ' + (k.probed || 0) + ' uji · ' + k.failed + ' gagal · ' + k.pending + ' antri' +
          (sending ? ' · mengirim ' + esc(Send.displayHandle(sending.handle)) : '') + '</p>' +
        '<div class="bar" style="margin:10px 0"><span style="width:' + pct + '%"></span></div>' +
        (quotaStop ? '<div class="note">Cap harian lokal penuh.</div>' : '') +
        ((campaign.failStreak || 0) >= 3 ? '<div class="note">Dijeda otomatis setelah 3 gagal. ' + esc(campaign.lastFail || '') + '</div>' : '') +
        (campaign.status === 'batch' ? '<div class="note">Istirahat antar kolaborasi ' + Send.BATCH + ' kreator.</div>' : '') +
        (done ? '<p><strong>Selesai.</strong></p>' : '') +
        '<div class="job-actions">' +
          (done ? '' : '<button type="button" class="btn" data-act="job-pause">' + pauseLbl + '</button>') +
        '</div>' +
      '</section>' +
      '<section class="card"><h3>Log</h3>' +
        (log.length ? log.map(function (r) {
          var label = r.status === 'sending' ? 'mengirim…' : r.status === 'sent' ? 'terkirim' : r.status === 'probed' ? 'uji' : 'gagal';
          return '<div class="job-log ' + esc(r.status) + '"><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
            '<span>' + esc(label) + (r.status === 'failed' && r.note ? ' · ' + esc(r.note) : '') + '</span></div>';
        }).join('') : '<p class="muted">Menunggu worker…</p>') +
      '</section>'
    );
  }

  function addHandle(raw, name, creatorOpenId, extra) {
    extra = extra || {};
    var h = Send.normHandle(raw);
    if (!h) { toast('Handle kosong'); return; }
    if (creatorByHandle(h)) { toast('Sudah ada'); return; }
    db.creators.unshift({
      id: uid('c'),
      handle: h,
      name: name || '',
      creatorOpenId: creatorOpenId || '',
      followers: extra.followers || 0,
      revenue: extra.revenue || 0,
      source: extra.source || '',
      demo: false,
      status: 'new'
    });
    persist(); render(); toast('Ditambah ' + Send.displayHandle(h));
  }

  function colIndex(head, names) {
    for (var i = 0; i < names.length; i++) {
      var idx = head.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseCsv(text) {
    var raw = String(text || '').replace(/^\uFEFF/, '');
    var lines = raw.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    var head = splitCsvLine(lines[0]).map(function (h) {
      return h.trim().toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ');
    });
    var hi = colIndex(head, [
      'creator handle', 'creator_handle', 'handle', 'username', 'tiktok handle', 'unique_id(handle)'
    ]);
    var ni = colIndex(head, [
      'nickname', 'creator nickname', 'creator_nickname', 'name', 'creator name', 'creator_name', 'nick_name'
    ]);
    var oi = colIndex(head, [
      'unique id', 'unique_id', 'creator id', 'creator_id', 'open_id', 'openid', 'oec_id', 'creator_oecuid', 'uid'
    ]);
    var fi = colIndex(head, ['followers', 'follower', 'pengikut']);
    var ri = colIndex(head, ['revenue', 'gmv', 'item sold', 'omset', 'pendapatan']);
    var start = (hi >= 0 || ni >= 0 || oi >= 0) ? 1 : 0;
    var out = [];
    var missingId = 0;
    for (var i = start; i < lines.length; i++) {
      var cols = splitCsvLine(lines[i]);
      var handle = hi >= 0 ? cols[hi] : (start === 0 ? cols[0] : '');
      var name = ni >= 0 ? cols[ni] : '';
      var openId = oi >= 0 ? cols[oi] : '';
      var n = Send.normHandle(handle);
      if (!n) continue;
      var oid = String(openId || '').trim();
      if (!oid) missingId += 1;
      out.push({
        handle: n,
        name: String(name || '').trim(),
        creatorOpenId: oid,
        followers: fi >= 0 ? Number(String(cols[fi] || '').replace(/[^\d.]/g, '')) || 0 : 0,
        revenue: ri >= 0 ? Number(String(cols[ri] || '').replace(/[^\d.]/g, '')) || 0 : 0,
        source: 'csv'
      });
    }
    out._missingId = missingId;
    return out;
  }

  function readFileText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('read_failed')); };
      reader.readAsText(file);
    });
  }

  function selectHandles(rows) {
    if (!ui.wizard) return;
    var blocked = blockedHandles();
    (rows || []).forEach(function (r) {
      var c = creatorByHandle(r.handle);
      if (!c || blocked[c.handle]) return;
      ui.wizard.ids[c.id] = true;
    });
  }

  function pullFind() {
    if (ui.finding || !ui.wizard) return;
    ui.finding = true;
    ui.pullNote = 'Mengambil dari Find Creators…';
    render();
    var w = ui.wizard;
    var n = Math.max(0, Math.min(1000, +w.takeN || 0));
    if (!n) {
      ui.finding = false;
      ui.pullNote = 'Kuota tersisa 0.';
      toast('Kuota tersisa 0. Tidak ada yang diambil.', 'warn');
      render();
      return;
    }
    Send.findPages(n, { followers: w.findFollowers, gmv: w.findGmv }).then(function (res) {
      ui.finding = false;
      if (!res || !res.ok) {
        ui.pullNote = (res && res.reason) || 'Gagal ambil.';
        toast(ui.pullNote, 'bad', 6000);
        render();
        return;
      }
      var mapped = (res.rows || []).map(function (r) {
        return {
          handle: Send.normHandle(r.handle),
          name: r.name || '',
          creatorOpenId: r.creatorOpenId || '',
          followers: r.followers || 0,
          revenue: r.revenue || 0,
          source: 'find'
        };
      }).filter(function (r) { return r.handle; });
      if (mapped.length) mergeRows(mapped, 'find');
      selectHandles(mapped);
      ui.pullNote = mapped.length + ' kreator dari ' + (res.pages || 0) + ' halaman' +
        (res.stopped === 'end' ? ' (halaman habis).' : res.stopped === 'abort' ? ' (dihentikan).' : '.');
      if (!mapped.length) toast(ui.pullNote, 'warn', 5000);
      render();
    }).catch(function () {
      ui.finding = false;
      ui.pullNote = 'Find Creators tidak menjawab.';
      toast(ui.pullNote, 'bad');
      render();
    });
  }

  function pullKalodataPages() {
    if (!db.account.allowKalodataPages) {
      toast('Izinkan baca semua halaman Kalodata dulu');
      return;
    }
    if (ui.finding) return;
    ui.finding = true;
    ui.pullNote = 'Membaca halaman Kalodata…';
    render();
    var n = Math.max(0, Math.min(1000, +(ui.wizard && ui.wizard.takeN) || 0));
    if (!n) {
      ui.finding = false;
      ui.pullNote = 'Kuota tersisa 0.';
      toast('Kuota tersisa 0. Tidak ada yang diambil.', 'warn');
      render();
      return;
    }
    Send.kaloPages(n).then(function (res) {
      ui.finding = false;
      var rows = ((res && res.rows) || []).map(function (r) {
        return {
          handle: Send.normHandle(r.handle),
          name: r.name || '',
          creatorOpenId: r.creatorOpenId || '',
          followers: r.followers || 0,
          revenue: r.revenue || 0,
          source: 'kalodata-page'
        };
      }).filter(function (r) { return r.handle; });
      if (!rows.length) {
        ui.pullNote = (res && res.reason) || 'Tidak ada baris baru.';
        toast(ui.pullNote, 'bad', 5000);
        render();
        return;
      }
      mergeRows(rows, 'kalodata-page');
      selectHandles(rows);
      ui.pullNote = rows.length + ' kreator, ' + (res.pages || 0) + ' halaman' +
        (res.stopped === 'abort' ? ' (dihentikan).' : res.stopped === 'end' ? ' (halaman habis).' : '.');
      render();
    }).catch(function () {
      ui.finding = false;
      toast('Kalodata tidak terbaca.', 'bad');
      render();
    });
  }

  var kaloPulling = false;
  function pullKalodata(opts) {
    opts = opts || {};
    if (!db.account.allowKalodataRead) {
      toast('Izinkan baca halaman Kalodata di Akun dulu');
      return;
    }
    if (kaloPulling && !opts.retry) return;
    kaloPulling = true;
    var left = opts.retries == null ? 0 : opts.retries;
    if (!opts.retry) toast('Mengambil baris Kalodata…');
    Send.kaloRead().then(function (res) {
      var rows = ((res && res.rows) || []).map(function (r) {
        return {
          handle: Send.normHandle(r.handle),
          name: r.name || '',
          creatorOpenId: r.creatorOpenId || '',
          followers: r.followers || 0,
          revenue: r.revenue || 0,
          source: 'kalodata-page'
        };
      }).filter(function (r) { return r.handle; });
      if (rows.length) {
        kaloPulling = false;
        ui.tab = 'kreator';
        mergeRows(rows, 'kalodata-page');
        return;
      }
      if (left > 0) {
        setTimeout(function () {
          kaloPulling = false;
          pullKalodata({ retries: left - 1, retry: true });
        }, 700);
        return;
      }
      kaloPulling = false;
      toast((res && res.reason) || 'Tidak ada @handle di halaman Kalodata. Refresh tab Daftar Kreator, lalu Ambil lagi.', 'bad');
    }).catch(function () {
      kaloPulling = false;
      toast('Kalodata tidak terbaca. Reload ekstensi, refresh kalodata.com/creator, lalu Ambil.', 'bad');
    });
  }

  function mergeRows(rows, sourceLabel) {
    if (!rows || !rows.length) {
      toast('Tidak ada kreator terbaca.', 'bad');
      ui.importNotice = '';
      return;
    }
    var n = 0;
    var updated = 0;
    var missingId = 0;
    rows.forEach(function (r) {
      var existing = creatorByHandle(r.handle);
      if (!r.creatorOpenId) missingId += 1;
      if (existing) {
        var changed = false;
        if (r.creatorOpenId && !existing.creatorOpenId) {
          existing.creatorOpenId = r.creatorOpenId;
          changed = true;
        }
        if (r.name && !existing.name) {
          existing.name = r.name;
          changed = true;
        }
        if (r.followers && !existing.followers) {
          existing.followers = r.followers;
          changed = true;
        }
        if (r.revenue && !existing.revenue) {
          existing.revenue = r.revenue;
          changed = true;
        }
        if (r.source && !existing.source) existing.source = r.source;
        if (changed) updated += 1;
        return;
      }
      db.creators.push({
        id: uid('c'),
        handle: r.handle,
        name: r.name || '',
        creatorOpenId: r.creatorOpenId || '',
        followers: r.followers || 0,
        revenue: r.revenue || 0,
        source: r.source || sourceLabel || '',
        demo: false,
        status: 'new'
      });
      n += 1;
    });
    persist();
    var skipped = rows.length - n - updated;
    var extra = missingId ? ' ' + missingId + ' tanpa Unique ID (perlu Cari kreator terrekam).' : '';
    if (sourceLabel === 'csv') {
      extra += ' Unique ID belum terbukti = creator_oec_id (@bule_barat rekaman 7495372765352463150).';
    }
    if (n) {
      ui.importNotice = 'Berhasil: ' + n + ' kreator ditambahkan' +
        (updated ? ', ' + updated + ' diperbarui' : '') +
        (skipped > 0 ? ', ' + skipped + ' sudah ada' : '') +
        '. Total sekarang ' + db.creators.length + '.' + extra;
      toast(ui.importNotice, 'ok', 5000);
    } else if (updated) {
      ui.importNotice = 'Berhasil memperbarui ' + updated + ' kreator. Total ' + db.creators.length + '.' + extra;
      toast(ui.importNotice, 'ok', 4500);
    } else {
      ui.importNotice = 'Tidak ada yang baru. ' + rows.length + ' baris sudah ada di daftar.' + extra;
      toast(ui.importNotice, 'warn', 4000);
    }
    render();
  }

  function parseHandlesText(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    var seen = {};
    lines.forEach(function (line) {
      var handle = '';
      var id = '';
      var hm = line.match(/@([A-Za-z0-9._]{2,24})/);
      if (hm) handle = hm[1];
      if (!handle) {
        var tok = line.trim().split(/[\s,;\t]+/)[0];
        if (tok && !/^\d+$/.test(tok)) handle = Send.normHandle(tok);
      }
      var idm = line.match(/\b(\d{15,})\b/);
      if (idm) id = idm[1];
      handle = Send.normHandle(handle);
      if (!handle || seen[handle]) return;
      seen[handle] = true;
      out.push({ handle: handle, name: '', creatorOpenId: id, source: 'paste' });
    });
    return out;
  }

  function importCsvText(text) {
    var rows = parseCsv(text);
    mergeRows(rows, 'csv');
  }

  function clipReconForDiag(recon) {
    var out = {};
    ['search', 'collab', 'im', 'quota'].forEach(function (ch) {
      out[ch] = ((recon && recon[ch]) || []).slice(0, 3).map(function (e) {
        return {
          url: e.url,
          method: e.method,
          status: e.status,
          origin: e.origin || '',
          shopName: e.shopName || '',
          reqBody: String(e.reqBody || '').slice(0, 4000),
          resBody: String(e.resBody || '').slice(0, 4000),
          at: e.at
        };
      });
    });
    return out;
  }

  function downloadJson(name, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function copyDiagnostics() {
    var recon = await Send.recon();
    var version = '0.5.0';
    try { version = chrome.runtime.getManifest().version || version; } catch (e) { /* ignore */ }
    var lastRows = [];
    db.campaigns.forEach(function (c) {
      (c.rows || []).forEach(function (r) {
        lastRows.push({
          campaign: c.title,
          handle: r.handle,
          status: r.status,
          note: r.note || '',
          at: r.at,
          endpoint: r.endpoint || ''
        });
      });
    });
    lastRows.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    var payload = {
      version: version,
      at: new Date().toISOString(),
      conn: {
        ok: ui.conn.ok,
        affiliate: ui.conn.affiliate,
        shopSession: ui.conn.shopSession,
        shopName: ui.conn.shopName,
        href: ui.conn.href,
        reconOrigin: ui.conn.reconOrigin,
        reconShopName: ui.conn.reconShopName,
        sku: ui.conn.sku || (ui.conn.recon && ui.conn.recon.sku) || {},
        kalodata: ui.conn.kalodata
      },
      allowLiveSend: !!db.account.allowLiveSend,
      quota: { used: db.quota.used, dailyCap: db.quota.dailyCap, day: db.quota.day },
      searchShape: ui.conn.searchShape || null,
      liveQuota: ui.conn.liveQuota || null,
      recon: clipReconForDiag(recon),
      lastRows: lastRows.slice(0, 20)
    };
    var text = JSON.stringify(payload, null, 2);
    var copied = await Send.copy(text);
    if (copied) {
      toast('Diagnostik tersalin. Tempel ke Cursor.', 'ok', 4000);
      return;
    }
    if (downloadJson('laris-affiliate-diagnostik.json', text)) {
      toast('Clipboard gagal. File diagnostik diunduh.', 'warn', 4500);
      return;
    }
    toast('Gagal menyalin diagnostik', 'bad');
  }

  function splitCsvLine(line) {
    var out = [];
    var cur = '';
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i += 1; }
        else q = !q;
      } else if ((ch === ',' || ch === ';' || ch === '\t') && !q) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  var connSig = '';
  async function refreshConn() {
    var ping = await Send.ping();
    var recon = await Send.recon();
    ui.conn = {
      ok: !!(ping && ping.ok),
      shopSession: !!(ping && ping.shopSession),
      affiliate: !!(ping && ping.affiliate),
      shopName: ping && ping.shopName || '',
      href: ping && ping.href || '',
      reconOrigin: ping && ping.reconOrigin || '',
      reconShopName: ping && ping.reconShopName || '',
      kalodata: (ping && ping.kalodata) || { present: false, count: 0 },
      recon: (ping && ping.recon) || {
        search: !!(recon && recon.search && recon.search.length),
        collab: !!(recon && recon.collab && recon.collab.length),
        im: !!(recon && recon.im && recon.im.length)
      },
      sku: (ping && ping.recon && ping.recon.sku) || {},
      searchShape: shapeFromRecon(recon),
      liveQuota: (window.LarisAffiliatePaging && recon) ? window.LarisAffiliatePaging.parseLiveQuota(recon.quota || []) : null
    };
    if (recon) {
      var parsedSku = skuFromReconStore(recon);
      if (parsedSku.productId) {
        ui.conn.sku = parsedSku;
        ui.conn.recon.sku = Object.assign({}, ui.conn.recon.sku || {}, parsedSku);
      }
    }
    if (ui.conn.shopName && ui.conn.shopName !== db.account.shopName) {
      db.account.shopName = ui.conn.shopName;
      persist();
    }
    renderQuota();
    var sig = JSON.stringify(ui.conn);
    if (sig === connSig) return;
    connSig = sig;
    if (ui.jobId || ui.wizard) return;
    // Full re-render kills the CSV file picker mid-select. Only refresh Akun / Kampanye.
    if (ui.tab === 'kreator') return;
    if (document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-act') === 'csv') return;
    render();
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act');
    var id = t.getAttribute('data-id');
    if (act === 'tab') {
      ui.tab = id;
      ui.wizard = null;
      closeOverlay();
      render();
    } else if (act === 'camp-filter') {
      ui.campFilter = id;
      render();
    } else if (act === 'new-campaign') {
      if (!db.creators.length) { toast('Tambah handle di Kreator dulu'); ui.tab = 'kreator'; render(); return; }
      startWizard();
    } else if (act === 'wiz-cancel') { ui.wizard = null; render(); }
    else if (act === 'wiz-back') { ui.wizard.step = Math.max(0, ui.wizard.step - 1); render(); }
    else if (act === 'wiz-next') {
      if (ui.wizard.step === 1 && !selectedCreators(ui.wizard).length) { toast('Pilih minimal satu'); return; }
      ui.wizard.step = Math.min(3, ui.wizard.step + 1); render();
    } else if (act === 'wiz-ch') { ui.wizard.channel = id; render(); }
    else if (act === 'wiz-sel') { ui.wizard.ids[id] = t.checked; }
    else if (act === 'wiz-all') {
      (ui.wizard ? wizardCreators() : newCreators()).forEach(function (c) { ui.wizard.ids[c.id] = t.checked; });
      render();
    } else if (act === 'wiz-ktab') {
      ui.wizard.kreatorTab = id === 'kalo' ? 'kalo' : 'find';
      render();
    } else if (act === 'wiz-refresh') {
      refreshConn().then(function () { render(); });
    } else if (act === 'wiz-find') { pullFind(); }
    else if (act === 'kalo-pages') { pullKalodataPages(); }
    else if (act === 'pull-stop') {
      Send.findStop();
      Send.kaloStop();
      ui.pullNote = 'Berhenti diminta. Halaman yang sedang jalan akan selesai dulu.';
      var note = $('pull-note');
      if (note) note.textContent = ui.pullNote;
    } else if (act === 'open-kalodata') {
      Send.openKalodata().then(function () { toast('Tab Kalodata'); });
    } else if (act === 'wiz-take') {
      var take = id === 'quota' ? leftDaily() : +id;
      applyTakeN(Math.max(0, take));
    }     else if (act === 'wiz-go') { startJobFromWizard(); }
    else if (act === 'wiz-one') { startJobFromWizard({ limit: 1 }); }
    else if (act === 'wiz-probe') { startJobFromWizard({ limit: 1, dryRun: true }); }
    else if (act === 'wiz-probe-all') { startJobFromWizard({ dryRun: true }); }
    else if (act === 'sel') { ui.selected[id] = t.checked; render(); }
    else if (act === 'sel-all') {
      filteredCreators().forEach(function (c) { ui.selected[c.id] = t.checked; });
      render();
    } else if (act === 'del-creator') {
      ev.preventDefault();
      ev.stopPropagation();
      db.creators = db.creators.filter(function (c) { return c.id !== id; });
      delete ui.selected[id];
      persist(); render();
    } else if (act === 'open-campaign') {
      ui.jobId = id;
      if (campaignById(id) && campaignById(id).status === 'berjalan' && !runner.id) startRunner(id);
      else renderJob(id);
    } else if (act === 'close-job') { closeOverlay(); render(); }
    else if (act === 'job-pause') {
      runner.paused = !runner.paused;
      var c = campaignById(runner.id);
      if (c) { c.status = runner.paused ? 'jeda' : 'berjalan'; persist(); }
      if (!runner.paused && runner.id) queueTick(120);
      renderJob(ui.jobId || runner.id);
    }     else if (act === 'open-affiliate') {
      Send.openAffiliate().then(function () { toast('Tab Seller Center'); refreshConn(); });
    } else if (act === 'probe-one') {
      if (!db.creators.length) { toast('Tambah handle di Kreator dulu'); ui.tab = 'kreator'; render(); return; }
      ui.wizard = { step: 3, channel: 'target_collab', ids: {}, template: db.template };
      ui.wizard.ids[db.creators[0].id] = true;
      startJobFromWizard({ limit: 1, dryRun: true });
    } else if (act === 'reset-quota') {
      db.quota.used = 0; db.quota.day = todayKey(); persist(); render(); toast('Kuota lokal direset');
    } else if (act === 'paste-go') {
      var box = document.querySelector('[data-act="paste-handles"]');
      mergeRows(parseHandlesText(box && box.value), 'paste');
    } else if (act === 'kalo-read') {
      pullKalodata();
    } else if (act === 'copy-diag') {
      copyDiagnostics();
    } else if (act === 'reset-recon') {
      chrome.storage.local.set({ 'laris-affiliate-recon': { search: [], collab: [], im: [] } }, function () {
        toast('Rekaman adapter dihapus');
        refreshConn();
      });
    } else if (act === 'reset-all') {
      if (!confirm('Hapus kampanye dan kreator di ekstensi ini?')) return;
      stopRunner();
      db = defaultState(); persist();
      ui = { tab: 'kampanye', wizard: null, selected: {}, filter: '', campFilter: 'all', jobId: null, importNotice: '', conn: ui.conn };
      closeOverlay(); render();
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target;
    var act = t.getAttribute && t.getAttribute('data-act');
    if (act === 'wiz-tpl') ui.wizard.template = t.value;
    else if (act === 'acc-handle') {
      db.account.handle = Send.normHandle(t.value) || db.account.handle;
      db.account.display = Send.displayHandle(db.account.handle);
      persist();
    } else if (act === 'acc-name') { db.account.name = t.value; persist(); }
    else if (act === 'acc-produk') { db.account.productName = t.value; persist(); }
    else if (act === 'acc-komisi') { db.account.commissionPct = +t.value || 0; persist(); }
    else if (act === 'arm-live') {
      if (t.checked) {
        if (!confirm('Izinkan kirim LIVE dari ekstensi ini? Undangan/IM bisa benar-benar terkirim setelah kamu konfirmasi di wizard. Default tetap: uji cari tidak mengirim.')) {
          t.checked = false;
          return;
        }
        db.account.allowLiveSend = true;
      } else {
        db.account.allowLiveSend = false;
      }
      persist(); render();
    }
    else if (act === 'arm-kalo') {
      if (t.checked) {
        if (!confirm('Izinkan ekstensi membaca baris kreator yang sudah terlihat di tab Kalodata kamu? Ini menyentuh Kalodata ToS 4.1.7 dan 4.1.8. Risikonya ke akun Kalodata kamu, bukan server LarisID. Centang ini mengambil halaman yang sedang terbuka.')) {
          t.checked = false;
          return;
        }
        db.account.allowKalodataRead = true;
        persist();
        ui.tab = 'kreator';
        render();
        pullKalodata({ retries: 6 });
        return;
      }
      db.account.allowKalodataRead = false;
      persist(); render();
    }
    else if (act === 'arm-kalo-pages') {
      if (t.checked) {
        if (!confirm('Baca semua halaman membalik tabel Kalodata yang sedang terbuka: klik Berikutnya, tunggu, baca baris. Ini menyentuh Kalodata ToS 4.1.7 dan 4.1.8. Risikonya ke akun Kalodata kamu. Kamu bisa berhenti kapan saja. Tidak ada request tersembunyi.')) {
          t.checked = false;
          return;
        }
        db.account.allowKalodataPages = true;
      } else {
        db.account.allowKalodataPages = false;
      }
      persist(); render();
    }
    else if (act === 'wiz-blacklist') render();
    else if (act === 'csv' && t.files && t.files[0]) {
      var file = t.files[0];
      toast('Membaca ' + file.name + '…');
      readFileText(file).then(function (text) {
        importCsvText(text);
        try { t.value = ''; } catch (e) { /* ignore */ }
      }).catch(function () {
        toast('Gagal baca file CSV');
        try { t.value = ''; } catch (e2) { /* ignore */ }
      });
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    var act = t.getAttribute && t.getAttribute('data-act');
    if (!ui.wizard && act && act.indexOf('wiz-') === 0) return;
    if (act === 'filter') {
      ui.filter = t.value;
      render();
      var box = document.querySelector('[data-act="filter"]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (act === 'wiz-tpl') ui.wizard.template = t.value;
    else if (act === 'wiz-komisi') {
      ui.wizard.commissionPct = t.value;
      db.account.commissionPct = +t.value || db.account.commissionPct;
      persist();
    } else if (act === 'wiz-nama') ui.wizard.invitationName = t.value;
    else if (act === 'wiz-end') ui.wizard.endDate = t.value;
    else if (act === 'wiz-taken') ui.wizard.takeN = Math.max(1, Math.min(1000, +t.value || 1));
    else if (act === 'wiz-find-fol') ui.wizard.findFollowers = t.value;
    else if (act === 'wiz-find-gmv') ui.wizard.findGmv = t.value;
    else if (act === 'wiz-blacklist') {
      db.blacklist = String(t.value || '').split(/\r?\n/).map(function (h) { return Send.normHandle(h); }).filter(Boolean);
      persist();
    } else if (act === 'wiz-q' || act === 'wiz-min-fol' || act === 'wiz-min-rev') {
      if (act === 'wiz-q') ui.wizard.filter = t.value;
      if (act === 'wiz-min-fol') ui.wizard.minFollowers = t.value;
      if (act === 'wiz-min-rev') ui.wizard.minRevenue = t.value;
      var pos = t.selectionStart;
      render();
      var again = document.querySelector('[data-act="' + act + '"]');
      if (again) {
        again.focus();
        if (again.setSelectionRange && pos != null) again.setSelectionRange(pos, pos);
      }
    }
  });

  document.addEventListener('submit', function (ev) {
    var form = ev.target.closest('form[data-act="add-handle"]');
    if (!form) return;
    ev.preventDefault();
    addHandle(form.handle.value, '');
    form.reset();
  });

  function boot(saved, keepRunning) {
    db = hydrate(saved, { keepRunning: !!keepRunning });
    if (!keepRunning) persist();
    render();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      refreshConn();
      setInterval(refreshConn, 2500);
      setInterval(function () { if (runner.id) beatLock(); }, 3000);
      chrome.runtime.onMessage.addListener(function (msg) {
        if (!msg) return;
        if (msg.type !== 'laris-find-progress' && msg.type !== 'laris-kalodata-progress') return;
        ui.pullNote = 'Terkumpul ' + (msg.got || 0) + ' / ' + (msg.limit || 0) + ' · halaman ' + (msg.page || 0);
        var note = $('pull-note');
        if (note) note.textContent = ui.pullNote;
      });
      window.addEventListener('beforeunload', releaseLock);
      if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local') return;
          if (changes[LOCK]) {
            var lock = changes[LOCK].newValue;
            if (lock && lock.owner !== SURFACE && runner.id && lock.campaignId === runner.id) {
              if (runner.timer) clearTimeout(runner.timer);
              runner.timer = null;
              runner.id = null;
              runner.busy = false;
              notifyParent(false);
            }
          }
          if (changes[KEY] && changes[KEY].newValue && !runner.busy && !runner.id) {
            db = hydrate(changes[KEY].newValue, { keepRunning: true });
          }
        });
      }
    }
  }
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get([KEY, LOCK], function (res) {
      var lock = res[LOCK];
      var other = lock && lock.owner !== SURFACE && (Date.now() - (lock.at || 0) < 8000);
      boot(res[KEY], other);
    });
  } else {
    boot(null, false);
  }
})();
