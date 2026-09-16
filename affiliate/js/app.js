/* Laris Affiliate — Kaloboost-shaped preview job (auto), same send() as live API later. */
(function () {
  var SEED = window.LARIS_AFFILIATE_SEED;
  var Send = window.LarisAffiliateSend;
  var KEY = 'laris-affiliate-v2';
  var JAKARTA = 'Asia/Jakarta';
  var $ = function (id) { return document.getElementById(id); };

  if (/larisid\.com$/i.test(location.hostname) || /\.pages\.dev$/i.test(location.hostname)) {
    $('prod-block').hidden = false;
    $('app').hidden = true;
    return;
  }
  $('prod-block').hidden = true;
  $('app').hidden = false;

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
  function isLanHost() {
    var h = location.hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' ||
      /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  }
  function channelLabel(ch) {
    return ch === 'target_collab' ? 'Kolaborasi Bertarget' : 'Pesan IM';
  }

  function defaultState() {
    return {
      account: Object.assign({ liveApi: false }, SEED.account),
      quota: { dailyCap: Send.DAILY, batch: Send.BATCH, weeklyCap: SEED.quota.weeklyCap, used: 0, weekUsed: 0, day: todayKey() },
      creators: SEED.demoCreators.map(function (c) {
        return { id: uid('c'), handle: Send.normHandle(c.handle), name: c.name || '', demo: !!c.demo, status: 'new' };
      }),
      campaigns: [],
      template: SEED.template
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      if (!s.account) s.account = Object.assign({}, SEED.account);
      if (!s.quota) s.quota = defaultState().quota;
      if (s.quota.day !== todayKey()) {
        s.quota.used = 0;
        s.quota.day = todayKey();
      }
      if (!Array.isArray(s.creators)) s.creators = [];
      if (!Array.isArray(s.campaigns)) s.campaigns = [];
      if (!s.template) s.template = SEED.template;
      return s;
    } catch (err) {
      return defaultState();
    }
  }

  var db = load();
  var ui = { tab: 'kampanye', wizard: null, selected: {}, filter: '', jobId: null };
  var runner = { id: null, timer: null, paused: false, busy: false };

  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

  function leftDaily() {
    if (db.quota.day !== todayKey()) {
      db.quota.used = 0;
      db.quota.day = todayKey();
      save();
    }
    return Math.max(0, db.quota.dailyCap - db.quota.used);
  }
  function bumpQuota() {
    db.quota.used += 1;
    db.quota.weekUsed = (db.quota.weekUsed || 0) + 1;
    save();
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
    el.textContent = 'Preview ' + db.quota.used + '/' + db.quota.dailyCap;
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

  function viewKampanye() {
    var list = db.campaigns.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var body = list.length
      ? list.map(campaignCard).join('')
      : '<div class="empty card"><p class="muted">Belum ada kampanye. Kirim = antrian otomatis (preview API). Tidak masuk inbox TikTok sampai toko live.</p></div>';
    return '<section class="card">' +
      '<p class="preview-banner">Preview toko · Kirim jalan sendiri, batch ' + Send.BATCH + ', cap ' + Send.DAILY + '/hari. Bukan blast cookie.</p>' +
      '<h2>Kampanye</h2>' +
      '<p class="muted">Sama seperti nanti: pilih channel, kreator, template, satu tombol Kirim. Worker preview dulu; API Partner Center mengganti isi <code>send()</code> tanpa ganti layar ini.</p>' +
      '<button type="button" class="btn" data-act="new-campaign" style="margin-top:10px">Buat kampanye</button>' +
      '</section>' + body;
  }

  function campaignCard(c) {
    var k = counts(c);
    var pct = k.n ? Math.round((k.sent + k.failed) / k.n * 100) : 0;
    return '<section class="card" data-act="open-campaign" data-id="' + esc(c.id) + '" style="cursor:pointer">' +
      '<h3>' + esc(c.title) + '</h3>' +
      '<p class="muted">' + esc(channelLabel(c.channel)) + ' · ' + fmtWhen(c.createdAt) +
        (c.live ? '' : ' · <span class="chip warn">preview</span>') + '</p>' +
      '<div class="bar" style="margin:8px 0"><span style="width:' + pct + '%"></span></div>' +
      '<p class="muted">' + k.sent + ' terkirim · ' + k.failed + ' gagal · ' + k.pending + ' antri · <span class="chip">' + esc(c.status) + '</span></p>' +
      '</section>';
  }

  function viewKreator() {
    var q = (ui.filter || '').toLowerCase();
    var rows = db.creators.filter(function (c) {
      if (!q) return true;
      return (c.handle + ' ' + (c.name || '')).toLowerCase().indexOf(q) !== -1;
    });
    var selectedN = rows.filter(function (c) { return ui.selected[c.id]; }).length;
    return '<section class="card">' +
      '<h2>Kreator</h2>' +
      '<p class="muted">Daftar untuk kampanye. CSV Kalodata bisa diimpor. Preview tidak menembak TikTok.</p>' +
      '<form data-act="add-handle" class="row" style="margin-top:10px">' +
        '<input name="handle" type="text" placeholder="@handle" required autocomplete="off" style="flex:1;min-width:0">' +
        '<button class="btn-sm" type="submit">Tambah</button>' +
      '</form>' +
      '<label class="field">Import CSV (kolom handle)</label>' +
      '<input type="file" accept=".csv,text/csv" data-act="csv">' +
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
        (c.demo ? ' · <span class="chip warn">contoh</span>' : '') +
        ' · ' + statusChip(c.status) + '</span></span>' +
      '<button type="button" class="btn-ghost" data-act="del-creator" data-id="' + esc(c.id) + '" style="padding:6px 8px">Hapus</button>' +
      '</label>';
  }

  function statusChip(st) {
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
      '<p class="muted">Terkirim ' + sent.length + ' · gagal ' + failed.length + ' · status preview di perangkat ini.</p></section>' +
      '<section class="card">' +
      (rows.length
        ? rows.map(function (r) {
            return '<div class="person" style="grid-template-columns:1fr auto">' +
              '<span><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
              '<span class="meta">' + esc(r.campaign) + ' · ' + fmtWhen(r.at) +
              (r.endpoint ? ' · ' + esc(r.endpoint.split(' ').pop()) : '') +
              (r.note ? ' · ' + esc(r.note) : '') + '</span></span>' +
              statusChip(r.status) + '</div>';
          }).join('')
        : '<p class="muted">Belum ada kiriman.</p>') +
      '</section>';
  }

  function viewAkun() {
    var bound = Send.shopBound(db.account);
    var live = Send.liveApi(db.account);
    return '<section class="card">' +
      '<h2>Toko / pengirim</h2>' +
      '<p class="muted">Preview memakai handle ini di template. Kirim otomatis = worker preview, bukan DM TikTok.</p>' +
      '<label class="field">Handle</label>' +
      '<input type="text" data-act="acc-handle" value="' + esc(db.account.handle) + '">' +
      '<label class="field">Nama di template</label>' +
      '<input type="text" data-act="acc-name" value="' + esc(db.account.name) + '">' +
      '<label class="field">Produk</label>' +
      '<input type="text" data-act="acc-produk" value="' + esc(db.account.productName) + '">' +
      '<label class="field">Komisi %</label>' +
      '<input type="number" min="1" max="80" data-act="acc-komisi" value="' + esc(db.account.commissionPct) + '">' +
      '</section>' +
      '<section class="card">' +
      '<h2>Kuota (bentuk cap toko)</h2>' +
      '<p class="muted">Sama dengan TikTok Shop: ' + Send.BATCH + ' / batch, ' + Send.DAILY + ' / 24 jam, kuota mingguan unconnected. Angka di bawah preview, bukan cap live.</p>' +
      '<div class="bar"><span style="width:' + Math.min(100, db.quota.used / db.quota.dailyCap * 100) + '%"></span></div>' +
      '<p class="muted" style="margin-top:8px">Hari ini ' + db.quota.used + ' / ' + db.quota.dailyCap +
        ' · minggu unconnected ' + (db.quota.weekUsed || 0) + ' / ' + db.quota.weeklyCap + '</p>' +
      '<button type="button" class="btn-ghost" data-act="reset-quota">Reset kuota preview</button>' +
      '</section>' +
      '<section class="card">' +
      '<h2>Toko TikTok Shop</h2>' +
      (live
        ? '<p><span class="chip ok">API live</span></p>'
        : '<p><span class="chip warn">preview</span> Worker belum menembak Affiliate Center.</p>') +
      (bound
        ? '<p><span class="chip ok">token ada</span> ' + esc(db.account.shopName || 'Toko') + '</p>' +
          '<button type="button" class="btn-ghost danger" data-act="unbind-shop">Putuskan toko (lokal)</button>'
        : '<p><span class="chip locked">belum OAuth</span></p>' +
          '<button type="button" class="btn" disabled>Hubungkan toko</button>' +
          '<p class="muted" style="margin-top:8px">Nanti: Anton OAuth. Jangan tempel password Seller Center.</p>' +
          (isLanHost()
            ? '<button type="button" class="btn-ghost" data-act="sim-shop" style="margin-top:8px">Simulasikan token (UI saja)</button>'
            : '')) +
      '</section>' +
      '<section class="card">' +
      '<h2>OAuth nanti (Anton)</h2>' +
      '<ol class="checklist">' +
        '<li>Partner Center app (LarisID + paspor).</li>' +
        '<li>Anton otorisasi toko.</li>' +
        '<li><code>liveApi = true</code> → <code>send()</code> panggil messages/send + Target Collab.</li>' +
        '<li>Layar kampanye tidak berubah.</li>' +
      '</ol>' +
      '<p class="muted"><a href="./README.md">Checklist</a></p>' +
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
        '<p class="preview-banner">Dua channel yang sama dengan Affiliate Center. Preview meniru API, bukan DM aplikasi.</p>' +
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
            '<span><strong>' + esc(Send.displayHandle(c.handle)) + '</strong><span class="meta">' + esc(c.name || '') + (c.demo ? ' · contoh' : '') + '</span></span></label>';
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
        '<p class="muted">Satu ketuk: antrian jalan sendiri. Pause kapan saja. Tidak membuka TikTok.</p>' +
        '<div class="sticky-actions">' +
          '<button type="button" class="btn" data-act="wiz-go"' + (n ? '' : ' disabled') + '>Kirim kampanye</button>' +
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

  function startJobFromWizard() {
    var w = ui.wizard;
    var chosen = selectedCreators(w).slice(0, leftDaily());
    if (!chosen.length) { toast('Tidak ada yang bisa dikirim'); return; }
    db.template = w.template;
    var campaign = {
      id: uid('job'),
      title: channelLabel(w.channel) + ' · ' + new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short', timeZone: JAKARTA }),
      channel: w.channel,
      template: w.template,
      live: false,
      status: 'berjalan',
      createdAt: new Date().toISOString(),
      cursor: 0,
      rows: chosen.map(function (c) {
        return { creatorId: c.id, handle: c.handle, status: 'pending', at: null, note: '', endpoint: Send.endpointFor(w.channel) };
      })
    };
    db.campaigns.push(campaign);
    ui.wizard = null;
    save();
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
      save();
      renderJob(id);
      render();
      return;
    }
    var done = counts(campaign).sent + counts(campaign).failed;
    if (done > 0 && done % Send.BATCH === 0 && nextPending(campaign) && campaign._batchWaited !== done) {
      campaign._batchWaited = done;
      campaign.status = 'batch';
      save();
      renderJob(id);
      queueTick(1400);
      return;
    }
    var row = nextPending(campaign);
    if (!row) {
      campaign.status = 'selesai';
      save();
      stopRunner();
      renderJob(id);
      render();
      return;
    }
    runner.busy = true;
    row.status = 'sending';
    campaign.status = 'berjalan';
    save();
    renderJob(id);
    var creator = creatorById(row.creatorId) || { handle: row.handle };
    var idx = campaign.rows.indexOf(row);
    var result = await Send.send(creator, {
      channel: campaign.channel,
      account: db.account,
      template: campaign.template,
      index: idx
    });
    row.at = new Date().toISOString();
    row.endpoint = result.endpoint || row.endpoint;
    row.note = result.requestId || result.reason || '';
    if (result.ok) {
      row.status = 'sent';
      bumpQuota();
      if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'sent';
    } else {
      row.status = 'failed';
      if (creatorById(row.creatorId)) creatorById(row.creatorId).status = 'failed';
    }
    save();
    runner.busy = false;
    renderJob(id);
    renderQuota();
    if (!runner.paused && runner.id === id) queueTick(180);
  }

  function renderJob(id) {
    var campaign = campaignById(id);
    if (!campaign) return;
    ui.jobId = id;
    var k = counts(campaign);
    var pct = k.n ? Math.round((k.sent + k.failed) / k.n * 100) : 0;
    var sending = (campaign.rows || []).find(function (r) { return r.status === 'sending'; });
    var log = (campaign.rows || []).slice().reverse().filter(function (r) { return r.status !== 'pending'; }).slice(0, 12);
    var pauseLbl = runner.paused ? 'Lanjut' : 'Jeda';
    var ep = Send.endpointFor(campaign.channel);
    var done = campaign.status === 'selesai';
    var quotaStop = campaign.status === 'pause' && leftDaily() === 0;
    openOverlay(
      '<p class="muted"><button type="button" class="btn-ghost" data-act="close-job">Tutup</button> · job tetap jalan di belakang</p>' +
      '<section class="card">' +
        '<p class="preview-banner">' + (campaign.live ? 'LIVE' : 'PREVIEW') + ' · ' + esc(ep) + '</p>' +
        '<h2>' + esc(campaign.title) + '</h2>' +
        '<p class="muted">' + k.sent + ' terkirim · ' + k.failed + ' gagal · ' + k.pending + ' antri' +
          (sending ? ' · mengirim ' + esc(Send.displayHandle(sending.handle)) : '') + '</p>' +
        '<div class="bar" style="margin:10px 0"><span style="width:' + pct + '%"></span></div>' +
        (quotaStop ? '<div class="note">Cap harian preview penuh. Reset di Akun atau lanjut besok.</div>' : '') +
        (campaign.status === 'batch' ? '<div class="note">Istirahat antar batch ' + Send.BATCH + ' (seperti cap TikTok).</div>' : '') +
        (done ? '<p><strong>Selesai.</strong> Inbox TikTok tidak berubah. CRM di app ini sudah terisi.</p>' : '') +
        '<div class="job-actions">' +
          (done ? '' : '<button type="button" class="btn" data-act="job-pause">' + pauseLbl + '</button>') +
          '<button type="button" class="btn-ghost" data-act="job-manual" data-id="' + esc(campaign.id) + '">Buka 1 profil di TikTok (opsional)</button>' +
        '</div>' +
      '</section>' +
      '<section class="card"><h3>Log</h3>' +
        (log.length ? log.map(function (r) {
          var label = r.status === 'sending' ? 'mengirim…' : r.status === 'sent' ? 'terkirim' : 'gagal';
          return '<div class="job-log ' + esc(r.status) + '"><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
            '<span>' + esc(label) + '</span></div>';
        }).join('') : '<p class="muted">Menunggu worker…</p>') +
      '</section>'
    );
  }

  async function jobManual(id) {
    var campaign = campaignById(id);
    var row = (campaign.rows || []).find(function (r) { return r.status === 'sent'; }) || nextPending(campaign);
    if (!row) { toast('Tidak ada baris'); return; }
    var creator = creatorById(row.creatorId) || { handle: row.handle };
    await Send.send(creator, { channel: campaign.channel, account: db.account, template: campaign.template, manualTiktok: true });
    toast('TikTok dibuka. Itu tes manual, bukan kiriman kampanye.');
  }

  function addHandle(raw, name) {
    var h = Send.normHandle(raw);
    if (!h) { toast('Handle kosong'); return; }
    if (creatorByHandle(h)) { toast('Sudah ada'); return; }
    db.creators.unshift({ id: uid('c'), handle: h, name: name || '', demo: false, status: 'new' });
    save(); render(); toast('Ditambah ' + Send.displayHandle(h));
  }

  function parseCsv(text) {
    var lines = String(text || '').trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    var head = lines[0].split(/[,;\t]/).map(function (h) { return h.trim().toLowerCase(); });
    var hi = head.indexOf('handle');
    if (hi < 0) hi = head.indexOf('username');
    var start = hi >= 0 ? 1 : 0;
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var cols = lines[i].split(/[,;\t]/);
      var handle = hi >= 0 ? cols[hi] : cols[0];
      var name = cols[1] && hi !== 1 ? cols[1] : '';
      var n = Send.normHandle(handle);
      if (n) out.push({ handle: n, name: String(name || '').trim() });
    }
    return out;
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
    } else if (act === 'wiz-go') { startJobFromWizard(); }
    else if (act === 'sel') { ui.selected[id] = t.checked; }
    else if (act === 'sel-all') {
      db.creators.forEach(function (c) { ui.selected[c.id] = t.checked; });
      render();
    } else if (act === 'del-creator') {
      db.creators = db.creators.filter(function (c) { return c.id !== id; });
      delete ui.selected[id];
      save(); render();
    } else if (act === 'open-campaign') {
      ui.jobId = id;
      if (campaignById(id) && campaignById(id).status === 'berjalan' && !runner.id) startRunner(id);
      else renderJob(id);
    } else if (act === 'close-job') { closeOverlay(); render(); }
    else if (act === 'job-pause') {
      runner.paused = !runner.paused;
      var c = campaignById(runner.id);
      if (c) { c.status = runner.paused ? 'jeda' : 'berjalan'; save(); }
      if (!runner.paused && runner.id) queueTick(120);
      renderJob(ui.jobId || runner.id);
    } else if (act === 'job-manual') { jobManual(id); }
    else if (act === 'reset-quota') {
      db.quota.used = 0; db.quota.weekUsed = 0; db.quota.day = todayKey(); save(); render(); toast('Kuota preview direset');
    } else if (act === 'sim-shop') {
      if (!isLanHost()) return;
      db.account.shopToken = 'dev-placeholder';
      db.account.shopName = 'Toko uji (bukan OAuth)';
      save(); render(); toast('Token dummy. Kirim tetap preview.');
    } else if (act === 'unbind-shop') {
      db.account.shopToken = null; db.account.shopName = ''; db.account.liveApi = false; save(); render();
    } else if (act === 'reset-all') {
      if (!confirm('Hapus kampanye dan kreator di browser ini?')) return;
      stopRunner();
      db = defaultState(); save();
      ui = { tab: 'kampanye', wizard: null, selected: {}, filter: '', jobId: null };
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
      save();
    } else if (act === 'acc-name') { db.account.name = t.value; save(); }
    else if (act === 'acc-produk') { db.account.productName = t.value; save(); }
    else if (act === 'acc-komisi') { db.account.commissionPct = +t.value || 0; save(); }
    else if (act === 'csv' && t.files && t.files[0]) {
      t.files[0].text().then(function (text) {
        var rows = parseCsv(text);
        var n = 0;
        rows.forEach(function (r) {
          if (creatorByHandle(r.handle)) return;
          db.creators.push({ id: uid('c'), handle: r.handle, name: r.name, demo: false, status: 'new' });
          n += 1;
        });
        save(); render(); toast('Import ' + n + ' handle');
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

  render();
})();
