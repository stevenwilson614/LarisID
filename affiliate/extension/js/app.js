/* Laris Affiliate — side panel. Kirim only via Seller Center tab. */
(function () {
  var SEED = window.LARIS_AFFILIATE_SEED;
  var Send = window.LarisAffiliateSend;
  var KEY = 'laris-affiliate-ext-v1';
  var JAKARTA = 'Asia/Jakarta';
  var $ = function (id) { return document.getElementById(id); };

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
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2200);
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
      quota: { dailyCap: Send.DAILY, batch: Send.BATCH, weeklyCap: SEED.quota.weeklyCap, used: 0, weekUsed: 0, day: todayKey() },
      creators: SEED.demoCreators.map(function (c) {
        return {
          id: uid('c'),
          handle: Send.normHandle(c.handle),
          name: c.name || '',
          creatorOpenId: c.creatorOpenId || '',
          demo: !!c.demo,
          status: 'new'
        };
      }),
      campaigns: [],
      template: SEED.template
    };
  }

  function hydrate(raw) {
    var s = raw || defaultState();
    if (!s.account) s.account = Object.assign({}, SEED.account);
    if (!s.quota) s.quota = defaultState().quota;
    if (s.quota.day !== todayKey()) {
      s.quota.used = 0;
      s.quota.day = todayKey();
    }
    if (!Array.isArray(s.creators)) s.creators = [];
    if (!Array.isArray(s.campaigns)) s.campaigns = [];
    if (!s.template) s.template = SEED.template;
    s.creators.forEach(function (c) {
      if (!c.creatorOpenId) c.creatorOpenId = '';
    });
    if (!s.account.allowLiveSend) s.account.allowLiveSend = false;
    return s;
  }

  var db = defaultState();
  var ui = {
    tab: 'kampanye',
    wizard: null,
    selected: {},
    filter: '',
    jobId: null,
    conn: { ok: false, shopSession: false, affiliate: false, shopName: '', href: '', recon: {} }
  };
  var runner = { id: null, timer: null, paused: false, busy: false };

  function persist() {
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
  function bumpQuota() {
    db.quota.used += 1;
    db.quota.weekUsed = (db.quota.weekUsed || 0) + 1;
    persist();
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

  function renderDock() {
    var tabs = [
      { id: 'kampanye', label: 'Kampanye' },
      { id: 'kreator', label: 'Kreator' },
      { id: 'crm', label: 'CRM' },
      { id: 'akun', label: 'Akun' }
    ];
    $('dock').innerHTML = tabs.map(function (t) {
      return '<button type="button" data-act="tab" data-id="' + t.id + '" aria-selected="' + (ui.tab === t.id) + '">' + esc(t.label) + '</button>';
    }).join('');
  }
  function renderQuota() {
    var el = $('quota-chip');
    el.textContent = db.quota.used + '/' + db.quota.dailyCap;
    el.classList.toggle('is-max', leftDaily() === 0);
  }
  function render() {
    renderDock();
    renderQuota();
    var main = $('main');
    if (ui.wizard) main.innerHTML = viewWizard();
    else if (ui.tab === 'kreator') main.innerHTML = viewKreator();
    else if (ui.tab === 'crm') main.innerHTML = viewCrm();
    else if (ui.tab === 'akun') main.innerHTML = viewAkun();
    else main.innerHTML = viewKampanye();
    if (ui.jobId) renderJob(ui.jobId);
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
    var body = list.length
      ? list.map(campaignCard).join('')
      : '<div class="empty card"><p class="muted">Belum ada kampanye. Kirim memakai sesi Affiliate Center di tab Chrome — bukan preview.</p></div>';
    return '<section class="card">' +
      '<p class="preview-banner">Unofficial · sesi Chrome kamu · kirim live terkunci sampai kamu izinkan</p>' +
      '<h2>Kampanye</h2>' +
      '<p class="muted">' + connChip() + ' Uji cari tidak mengirim undangan. Kirim live butuh centang di Akun.</p>' +
      '<button type="button" class="btn" data-act="new-campaign" style="margin-top:10px">Buat kampanye</button>' +
      '</section>' + body;
  }

  function campaignCard(c) {
    var k = counts(c);
    var pct = k.n ? Math.round((k.sent + k.failed + (k.probed || 0)) / k.n * 100) : 0;
    return '<section class="card" data-act="open-campaign" data-id="' + esc(c.id) + '" style="cursor:pointer">' +
      '<h3>' + esc(c.title) + '</h3>' +
      '<p class="muted">' + esc(channelLabel(c.channel)) + ' · ' + fmtWhen(c.createdAt) + '</p>' +
      '<div class="bar" style="margin:8px 0"><span style="width:' + pct + '%"></span></div>' +
      '<p class="muted">' + k.sent + ' terkirim · ' + k.failed + ' gagal · ' + k.pending + ' antri · <span class="chip">' + esc(c.status) + '</span></p>' +
      '</section>';
  }

  function viewKreator() {
    var q = (ui.filter || '').toLowerCase();
    var rows = db.creators.filter(function (c) {
      if (!q) return true;
      return (c.handle + ' ' + (c.name || '') + ' ' + (c.creatorOpenId || '')).toLowerCase().indexOf(q) !== -1;
    });
    var selectedN = rows.filter(function (c) { return ui.selected[c.id]; }).length;
    return '<section class="card">' +
      '<h2>Kreator</h2>' +
      '<p class="muted">CSV gaya Kalodata Creator List: <code>Creator Handle</code> + <code>Unique ID</code>. Contoh unduhan di bawah.</p>' +
      '<form data-act="add-handle" class="row" style="margin-top:10px">' +
        '<input name="handle" type="text" placeholder="@handle" required autocomplete="off" style="flex:1;min-width:0">' +
        '<button class="btn-sm" type="submit">Tambah</button>' +
      '</form>' +
      '<label class="field">Import CSV</label>' +
      '<input type="file" accept=".csv,text/csv" data-act="csv">' +
      '<a class="btn-ghost" href="' + esc(chrome.runtime.getURL('sample/Creator_List_ID_Last30Days_sample.csv')) + '" download="Creator_List_ID_Last30Days_sample.csv" style="margin-top:10px;display:block;text-align:center;text-decoration:none">Unduh contoh Kalodata</a>' +
      '</section>' +
      '<section class="card">' +
        '<div class="row" style="justify-content:space-between">' +
          '<label class="muted"><input type="checkbox" data-act="sel-all" ' + (rows.length && selectedN === rows.length ? 'checked' : '') + '> Pilih semua</label>' +
          '<span class="muted">' + selectedN + ' dipilih</span>' +
        '</div>' +
        '<input type="search" placeholder="Cari" value="' + esc(ui.filter) + '" data-act="filter" style="margin:10px 0">' +
        (rows.length ? rows.map(personRow).join('') : '<p class="muted">Kosong.</p>') +
      '</section>';
  }

  function personRow(c) {
    return '<label class="person">' +
      '<input type="checkbox" data-act="sel" data-id="' + esc(c.id) + '"' + (ui.selected[c.id] ? ' checked' : '') + '>' +
      '<span><strong>' + esc(Send.displayHandle(c.handle)) + '</strong>' +
        '<span class="meta">' + esc(c.name || '') +
        (c.creatorOpenId ? ' · id ' + esc(String(c.creatorOpenId).slice(0, 10)) : ' · handle saja') +
        (c.demo ? ' · <span class="chip warn">contoh</span>' : '') +
        ' · ' + statusChip(c.status) + '</span></span>' +
      '<button type="button" class="btn-ghost" data-act="del-creator" data-id="' + esc(c.id) + '" style="padding:6px 8px;width:auto">Hapus</button>' +
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
    var sent = db.creators.filter(function (c) { return c.status === 'sent' || c.status === 'connected'; });
    var failed = db.creators.filter(function (c) { return c.status === 'failed'; });
    var rows = [];
    db.campaigns.forEach(function (c) {
      (c.rows || []).forEach(function (r) {
        if (r.status === 'pending' || r.status === 'sending') return;
        rows.push({ campaign: c.title, handle: r.handle, status: r.status, at: r.at, note: r.note || '', endpoint: r.endpoint || '' });
      });
    });
    rows.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    return '<section class="card"><h2>CRM</h2>' +
      '<p class="muted">Terkirim ' + sent.length + ' · gagal ' + failed.length + ' · hanya toko di Chrome ini.</p></section>' +
      '<section class="card">' +
      (rows.length
        ? rows.map(function (r) {
            return '<div class="person" style="grid-template-columns:1fr auto">' +
              '<span><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
              '<span class="meta">' + esc(r.campaign) + ' · ' + fmtWhen(r.at) +
              (r.note ? ' · ' + esc(r.note) : '') + '</span></span>' +
              statusChip(r.status) + '</div>';
          }).join('')
        : '<p class="muted">Belum ada kiriman.</p>') +
      '</section>';
  }

  function reconLine(ok, label) {
    return '<li>' + (ok ? '<span class="chip ok">terrekam</span>' : '<span class="chip locked">belum</span>') + ' ' + esc(label) + '</li>';
  }

  function viewAkun() {
    var recon = ui.conn.recon || {};
    var href = ui.conn.href || '';
    return '<section class="card">' +
      '<h2>Affiliate Center</h2>' +
      '<p>' + connChip() + ' ' + esc(ui.conn.shopName || db.account.shopName || 'Toko belum terbaca') + '</p>' +
      (href ? '<p class="muted">' + esc(pathOnly(href)) + '</p>' : '') +
      '<button type="button" class="btn" data-act="open-affiliate" style="margin-top:10px">Buka Affiliate Center</button>' +
      '<button type="button" class="btn-ghost" data-act="probe-one" style="margin-top:8px">Uji cari 1 kreator (tidak kirim)</button>' +
      '<p class="muted" style="margin-top:8px">Tidak ada kolom password. Pakai login Chrome kamu.</p>' +
      '</section>' +
      '<section class="card">' +
      '<h2>Kirim live</h2>' +
      '<p class="muted">Default terkunci. Saya tidak mengirim dari sini. Hanya jalan jika kamu centang dan konfirmasi di wizard.</p>' +
      '<label class="muted"><input type="checkbox" data-act="arm-live"' + (db.account.allowLiveSend ? ' checked' : '') + '> Izinkan kirim live</label>' +
      (db.account.allowLiveSend ? '<p class="note">Live terbuka. Tes 1 / Kirim akan minta konfirmasi lagi.</p>' : '') +
      '</section>' +
      '<section class="card">' +
      '<h2>Adapter (rekaman request)</h2>' +
      '<p class="muted">Buka <strong>Find Creators / Cari Kreator</strong> dan ketik sebuah handle. Jangan klik undang. Chip Cari kreator harus jadi terrekam.</p>' +
      '<ul class="recon-list">' +
        reconLine(!!recon.collab, 'Target Collab') +
        reconLine(!!recon.im, 'Pesan IM') +
        reconLine(!!recon.search, 'Cari kreator') +
      '</ul>' +
      '<button type="button" class="btn-ghost" data-act="reset-recon" style="margin-top:10px">Hapus rekaman adapter</button>' +
      '</section>' +
      '<section class="card">' +
      '<h2>Pengirim di template</h2>' +
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
      '<h2>Kuota toko</h2>' +
      '<p class="muted">Cap TikTok Shop: ' + Send.BATCH + ' / batch, ' + Send.DAILY + ' / 24 jam. Meter ini di ekstensi, bukan jaminan cap live.</p>' +
      '<div class="bar"><span style="width:' + Math.min(100, db.quota.used / db.quota.dailyCap * 100) + '%"></span></div>' +
      '<p class="muted" style="margin-top:8px">Hari ini ' + db.quota.used + ' / ' + db.quota.dailyCap +
        ' · minggu unconnected ' + (db.quota.weekUsed || 0) + ' / ' + db.quota.weeklyCap + '</p>' +
      '<button type="button" class="btn-ghost" data-act="reset-quota">Reset kuota lokal</button>' +
      '</section>' +
      '<section class="card">' +
      '<button type="button" class="btn-ghost danger" data-act="reset-all">Hapus data lokal</button>' +
      '</section>';
  }

  function viewWizard() {
    var w = ui.wizard;
    var html = '<div class="steps">' + [0, 1, 2, 3].map(function (i) {
      return '<i' + (i <= w.step ? ' class="on"' : '') + '></i>';
    }).join('') + '</div>';
    if (w.step === 0) {
      html += '<section class="card"><h2>Channel</h2>' +
        '<p class="preview-banner">Sesi Affiliate Center · bukan API Partner Center</p>' +
        '<button type="button" class="channel' + (w.channel === 'target_collab' ? ' on' : '') + '" data-act="wiz-ch" data-id="target_collab">' +
          '<strong>Kolaborasi Bertarget</strong><em>' + esc(Send.endpointFor('target_collab')) + '</em></button>' +
        '<button type="button" class="channel' + (w.channel === 'im' ? ' on' : '') + '" data-act="wiz-ch" data-id="im">' +
          '<strong>Pesan IM</strong><em>' + esc(Send.endpointFor('im')) + '</em></button>' +
        '<div class="sticky-actions"><button type="button" class="btn" data-act="wiz-next">Lanjut</button>' +
        '<button type="button" class="btn-ghost" data-act="wiz-cancel">Batal</button></div></section>';
    } else if (w.step === 1) {
      var rows = db.creators;
      html += '<section class="card"><h2>Pilih kreator</h2>' +
        '<label class="muted"><input type="checkbox" data-act="wiz-all"' + (rows.length && rows.every(function (c) { return w.ids[c.id]; }) ? ' checked' : '') + '> Pilih semua</label>' +
        (rows.length ? rows.map(function (c) {
          return '<label class="person">' +
            '<input type="checkbox" data-act="wiz-sel" data-id="' + esc(c.id) + '"' + (w.ids[c.id] ? ' checked' : '') + '>' +
            '<span><strong>' + esc(Send.displayHandle(c.handle)) + '</strong><span class="meta">' + esc(c.name || '') +
            (c.creatorOpenId ? '' : ' · handle saja') + '</span></span></label>';
        }).join('') : '<p class="muted">Tambah handle di Kreator dulu.</p>') +
        '<div class="sticky-actions"><button type="button" class="btn" data-act="wiz-next">Lanjut</button>' +
        '<button type="button" class="btn-ghost" data-act="wiz-back">Kembali</button></div></section>';
    } else if (w.step === 2) {
      html += '<section class="card"><h2>Template</h2>' +
        '<p class="muted">{handle} {name} {toko} {produk} {komisi}</p>' +
        '<textarea data-act="wiz-tpl">' + esc(w.template) + '</textarea>' +
        '<div class="sticky-actions"><button type="button" class="btn" data-act="wiz-next">Lanjut</button>' +
        '<button type="button" class="btn-ghost" data-act="wiz-back">Kembali</button></div></section>';
    } else {
      var chosen = selectedCreators(w);
      var cap = leftDaily();
      var n = Math.min(chosen.length, cap);
      var batches = Math.max(1, Math.ceil(n / Send.BATCH));
      html += '<section class="card"><h2>Kirim</h2>' +
        '<p><strong>' + n + '</strong> kreator · ' + batches + ' batch × max ' + Send.BATCH + ' · sisa hari ini ' + cap + '.</p>' +
        (ui.conn.ok ? '<p class="muted">' + connChip() + '</p>' :
          '<div class="note">Seller Center belum terhubung. Buka tabnya dulu.</div>') +
        (db.account.allowLiveSend
          ? '<div class="note">Kirim live terbuka. Tes 1 / Kirim kampanye akan minta konfirmasi, lalu benar-benar mengundang.</div>'
          : '<p class="muted">Kirim live terkunci. Uji cari tidak mengirim undangan.</p>') +
        '<div class="sticky-actions">' +
          '<button type="button" class="btn" data-act="wiz-probe"' + (n && ui.conn.ok ? '' : ' disabled') + '>Uji cari (tidak kirim)</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-one"' + (n && ui.conn.ok && db.account.allowLiveSend ? '' : ' disabled') + '>Tes 1 kreator · LIVE</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-go"' + (n && ui.conn.ok && db.account.allowLiveSend ? '' : ' disabled') + '>Kirim kampanye · LIVE</button>' +
          '<button type="button" class="btn-ghost" data-act="wiz-back">Kembali</button></div></section>';
    }
    return html;
  }

  function selectedCreators(w) {
    return db.creators.filter(function (c) { return w.ids[c.id]; });
  }

  function startWizard() {
    var ids = {};
    Object.keys(ui.selected).forEach(function (id) { if (ui.selected[id]) ids[id] = true; });
    if (!Object.keys(ids).length) db.creators.forEach(function (c) { ids[c.id] = true; });
    ui.wizard = { step: 0, channel: 'target_collab', ids: ids, template: db.template };
    render();
  }

  function startJobFromWizard(opts) {
    opts = opts || {};
    var w = ui.wizard;
    if (!ui.conn.ok) {
      toast('Buka Seller Center dulu');
      return;
    }
    var chosen = selectedCreators(w).slice(0, leftDaily());
    if (opts.limit) chosen = chosen.slice(0, opts.limit);
    if (!chosen.length) { toast('Tidak ada yang bisa dikirim'); return; }
    if (opts.dryRun) {
      /* probe only */
    } else {
      if (!db.account.allowLiveSend) { toast('Kirim live terkunci'); return; }
      var n = chosen.length;
      if (!confirm('LIVE: kirim ' + (w.channel === 'target_collab' ? 'undangan Target Collab' : 'pesan IM') + ' ke ' + n + ' kreator di toko kamu. Lanjut?')) return;
    }
    db.template = w.template;
    var campaign = {
      id: uid('job'),
      title: (opts.dryRun ? 'Uji cari · ' : 'LIVE · ') + channelLabel(w.channel) + (opts.limit === 1 ? ' · 1' : '') + ' · ' + new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short', timeZone: JAKARTA }),
      channel: w.channel,
      template: w.template,
      dryRun: !!opts.dryRun,
      status: 'berjalan',
      createdAt: new Date().toISOString(),
      cursor: 0,
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

  function stopRunner() {
    if (runner.timer) clearTimeout(runner.timer);
    runner.timer = null;
    runner.id = null;
    runner.busy = false;
    runner.paused = false;
  }

  function startRunner(id) {
    stopRunner();
    runner.id = id;
    runner.paused = false;
    ui.jobId = id;
    renderJob(id);
    queueTick(80);
  }

  function queueTick(ms) {
    if (runner.timer) clearTimeout(runner.timer);
    runner.timer = setTimeout(function () { tickCampaign(); }, ms);
  }

  async function tickCampaign() {
    if (runner.paused || runner.busy) return;
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
    var done = counts(campaign).sent + counts(campaign).failed + counts(campaign).probed;
    if (done > 0 && done % Send.BATCH === 0 && nextPending(campaign) && campaign._batchWaited !== done) {
      campaign._batchWaited = done;
      campaign.status = 'batch';
      persist();
      renderJob(id);
      queueTick(1400);
      return;
    }
    var row = nextPending(campaign);
    if (!row) {
      campaign.status = 'selesai';
      persist();
      stopRunner();
      renderJob(id);
      render();
      return;
    }
    runner.busy = true;
    row.status = 'sending';
    campaign.status = 'berjalan';
    persist();
    renderJob(id);
    var creator = creatorById(row.creatorId) || { handle: row.handle, creatorOpenId: row.creatorOpenId };
    var result = await Send.send(creator, {
      channel: campaign.channel,
      account: db.account,
      template: campaign.template,
      dryRun: !!campaign.dryRun
    });
    row.at = new Date().toISOString();
    row.endpoint = result.endpoint || row.endpoint;
    row.note = result.requestId || result.reason || '';
    if (result.creatorOpenId && creatorById(row.creatorId) && !creatorById(row.creatorId).creatorOpenId) {
      creatorById(row.creatorId).creatorOpenId = result.creatorOpenId;
      row.creatorOpenId = result.creatorOpenId;
    }
    if (result.ok) {
      if (campaign.dryRun) {
        row.status = 'probed';
        if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'probed';
      } else {
        row.status = 'sent';
        bumpQuota();
        if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'sent';
      }
    } else {
      row.status = 'failed';
      if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'failed';
    }
    persist();
    runner.busy = false;
    renderJob(id);
    renderQuota();
    if (!runner.paused && runner.id === id) queueTick(220);
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
      '<p class="muted"><button type="button" class="btn-ghost" data-act="close-job">Tutup</button> · antrian jalan selama panel terbuka</p>' +
      '<section class="card">' +
        '<p class="preview-banner">' + (campaign.dryRun ? 'UJI CARI · tidak kirim undangan' : 'LIVE · ' + esc(Send.endpointFor(campaign.channel))) + '</p>' +
        '<h2>' + esc(campaign.title) + '</h2>' +
        '<p class="muted">' + k.sent + ' terkirim · ' + (k.probed || 0) + ' uji · ' + k.failed + ' gagal · ' + k.pending + ' antri' +
          (sending ? ' · mengirim ' + esc(Send.displayHandle(sending.handle)) : '') + '</p>' +
        '<div class="bar" style="margin:10px 0"><span style="width:' + pct + '%"></span></div>' +
        (quotaStop ? '<div class="note">Cap harian lokal penuh.</div>' : '') +
        (campaign.status === 'batch' ? '<div class="note">Istirahat antar batch ' + Send.BATCH + '.</div>' : '') +
        (done ? '<p><strong>Selesai.</strong></p>' : '') +
        '<div class="job-actions">' +
          (done ? '' : '<button type="button" class="btn" data-act="job-pause">' + pauseLbl + '</button>') +
        '</div>' +
      '</section>' +
      '<section class="card"><h3>Log</h3>' +
        (log.length ? log.map(function (r) {
          var label = r.status === 'sending' ? 'mengirim…' : r.status === 'sent' ? 'terkirim' : r.status === 'probed' ? 'uji' : 'gagal';
          return '<div class="job-log ' + esc(r.status) + '"><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
            '<span>' + esc(label) + (r.status === 'failed' && r.note ? ' · ' + esc(r.note).slice(0, 40) : '') + '</span></div>';
        }).join('') : '<p class="muted">Menunggu worker…</p>') +
      '</section>'
    );
  }

  function addHandle(raw, name, creatorOpenId) {
    var h = Send.normHandle(raw);
    if (!h) { toast('Handle kosong'); return; }
    if (creatorByHandle(h)) { toast('Sudah ada'); return; }
    db.creators.unshift({
      id: uid('c'),
      handle: h,
      name: name || '',
      creatorOpenId: creatorOpenId || '',
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
    var lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    var head = lines[0].split(/[,;\t]/).map(function (h) {
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
    // Prefer dedicated handle col; Unique ID alone is not a handle.
    if (hi < 0 && colIndex(head, ['unique id', 'unique_id', 'creator id', 'creator_id']) >= 0) {
      /* leave hi < 0 so we don't treat Unique ID as handle */
    }
    var start = (hi >= 0 || ni >= 0 || oi >= 0) ? 1 : 0;
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var cols = splitCsvLine(lines[i]);
      var handle = hi >= 0 ? cols[hi] : (start === 0 ? cols[0] : '');
      var name = ni >= 0 ? cols[ni] : '';
      var openId = oi >= 0 ? cols[oi] : '';
      var n = Send.normHandle(handle);
      if (n) out.push({ handle: n, name: String(name || '').trim(), creatorOpenId: String(openId || '').trim() });
    }
    return out;
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
      recon: (ping && ping.recon) || {
        search: !!(recon && recon.search && recon.search.length),
        collab: !!(recon && recon.collab && recon.collab.length),
        im: !!(recon && recon.im && recon.im.length)
      }
    };
    if (ui.conn.shopName && ui.conn.shopName !== db.account.shopName) {
      db.account.shopName = ui.conn.shopName;
      persist();
    }
    renderQuota();
    var sig = JSON.stringify(ui.conn);
    if (sig === connSig) return;
    connSig = sig;
    if (ui.jobId) return;
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
      db.creators.forEach(function (c) { ui.wizard.ids[c.id] = t.checked; });
      render();
    }     else if (act === 'wiz-go') { startJobFromWizard(); }
    else if (act === 'wiz-one') { startJobFromWizard({ limit: 1 }); }
    else if (act === 'wiz-probe') { startJobFromWizard({ limit: 1, dryRun: true }); }
    else if (act === 'sel') { ui.selected[id] = t.checked; }
    else if (act === 'sel-all') {
      db.creators.forEach(function (c) { ui.selected[c.id] = t.checked; });
      render();
    } else if (act === 'del-creator') {
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
      db.quota.used = 0; db.quota.weekUsed = 0; db.quota.day = todayKey(); persist(); render(); toast('Kuota lokal direset');
    } else if (act === 'reset-recon') {
      chrome.storage.local.set({ 'laris-affiliate-recon': { search: [], collab: [], im: [] } }, function () {
        toast('Rekaman adapter dihapus');
        refreshConn();
      });
    } else if (act === 'reset-all') {
      if (!confirm('Hapus kampanye dan kreator di ekstensi ini?')) return;
      stopRunner();
      db = defaultState(); persist();
      ui = { tab: 'kampanye', wizard: null, selected: {}, filter: '', jobId: null, conn: ui.conn };
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
    else if (act === 'csv' && t.files && t.files[0]) {
      t.files[0].text().then(function (text) {
        var rows = parseCsv(text);
        var n = 0;
        rows.forEach(function (r) {
          var existing = creatorByHandle(r.handle);
          if (existing) {
            if (r.creatorOpenId && !existing.creatorOpenId) existing.creatorOpenId = r.creatorOpenId;
            if (r.name && !existing.name) existing.name = r.name;
            return;
          }
          db.creators.push({
            id: uid('c'),
            handle: r.handle,
            name: r.name,
            creatorOpenId: r.creatorOpenId || '',
            demo: false,
            status: 'new'
          });
          n += 1;
        });
        persist(); render(); toast('Import ' + n + ' handle');
      });
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.getAttribute('data-act') === 'filter') {
      ui.filter = t.value;
      render();
      var box = document.querySelector('[data-act="filter"]');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    } else if (t.getAttribute('data-act') === 'wiz-tpl') ui.wizard.template = t.value;
  });

  document.addEventListener('submit', function (ev) {
    var form = ev.target.closest('form[data-act="add-handle"]');
    if (!form) return;
    ev.preventDefault();
    addHandle(form.handle.value, '');
    form.reset();
  });

  chrome.storage.local.get(KEY, function (res) {
    db = hydrate(res[KEY]);
    render();
    refreshConn();
    setInterval(refreshConn, 2500);
  });
})();
