/* Laris Affiliate — P0 job loop, P1 Kaloboost shell, P2 send-worker seam. */
(function () {
  var SEED = window.LARIS_AFFILIATE_SEED;
  var Send = window.LarisAffiliateSend;
  var KEY = 'laris-affiliate-v1';
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

  function defaultState() {
    return {
      account: Object.assign({}, SEED.account),
      quota: { cap: SEED.quota.cap, used: 0, day: todayKey() },
      creators: SEED.demoCreators.map(function (c) {
        return {
          id: uid('c'),
          handle: Send.normHandle(c.handle),
          name: c.name || '',
          demo: !!c.demo,
          status: 'new'
        };
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
      if (!s.quota) s.quota = { cap: SEED.quota.cap, used: 0, day: todayKey() };
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
  var ui = {
    tab: 'kampanye',
    wizard: null,
    selected: {},
    filter: ''
  };

  function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  function leftQuota() {
    if (db.quota.day !== todayKey()) {
      db.quota.used = 0;
      db.quota.day = todayKey();
      save();
    }
    return Math.max(0, db.quota.cap - db.quota.used);
  }

  function bumpQuota() {
    db.quota.used += 1;
    save();
  }

  function creatorById(id) {
    return db.creators.find(function (c) { return c.id === id; });
  }

  function creatorByHandle(handle) {
    var h = Send.normHandle(handle);
    return db.creators.find(function (c) { return c.handle === h; });
  }

  /* ── chrome ──────────────────────────────────────────────────────── */
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
    var left = leftQuota();
    var el = $('quota-chip');
    el.textContent = 'Latihan ' + db.quota.used + '/' + db.quota.cap;
    el.classList.toggle('is-max', left === 0);
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
  }

  function closeOverlay() {
    var el = $('overlay');
    el.hidden = true;
    el.innerHTML = '';
  }

  function openOverlay(html) {
    var el = $('overlay');
    el.innerHTML = html;
    el.hidden = false;
  }

  /* ── views ───────────────────────────────────────────────────────── */
  function viewKampanye() {
    var list = db.campaigns.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var body = list.length
      ? list.map(campaignCard).join('')
      : '<div class="empty card"><p class="muted">Belum ada kampanye. Tambah handle di Kreator, lalu kirim Pesan TikTok — salin, buka aplikasi, ketuk Send.</p></div>';
    return '<section class="card">' +
      '<h2>Kampanye</h2>' +
      '<p class="muted">P0: pesan teman di aplikasi TikTok sebagai ' + esc(db.account.display) + '. Bukan Affiliate Center. Bukan 1.000 DM / 10 menit.</p>' +
      '<button type="button" class="btn" data-act="new-campaign" style="margin-top:10px">Buat kampanye</button>' +
      '</section>' + body;
  }

  function campaignCard(c) {
    var done = (c.rows || []).filter(function (r) { return r.status === 'sent'; }).length;
    var n = (c.rows || []).length;
    var ch = c.channel === 'target_collab' ? 'Kolaborasi Bertarget' : 'Pesan TikTok';
    return '<section class="card" data-act="open-campaign" data-id="' + esc(c.id) + '" style="cursor:pointer">' +
      '<h3>' + esc(c.title) + '</h3>' +
      '<p class="muted">' + esc(ch) + ' · ' + fmtWhen(c.createdAt) + '</p>' +
      '<div class="bar" style="margin:8px 0"><span style="width:' + (n ? Math.round(done / n * 100) : 0) + '%"></span></div>' +
      '<p class="muted">' + done + '/' + n + ' terkirim · <span class="chip">' + esc(c.status) + '</span></p>' +
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
      '<p class="muted">Handle teman untuk tes. CSV Kalodata bisa diimpor — kirim tetap Pesan TikTok sampai toko terhubung.</p>' +
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
        '<span class="meta">' + esc(c.name || (c.demo ? 'contoh' : '')) +
        (c.demo ? ' · <span class="chip warn">contoh</span>' : '') +
        ' · ' + statusChip(c.status) + '</span></span>' +
      '<button type="button" class="btn-ghost" data-act="del-creator" data-id="' + esc(c.id) + '" style="padding:6px 8px">Hapus</button>' +
      '</label>';
  }

  function statusChip(st) {
    if (st === 'sent') return '<span class="chip ok">terkirim</span>';
    if (st === 'failed') return '<span class="chip bad">gagal</span>';
    if (st === 'skipped') return '<span class="chip">lewati</span>';
    if (st === 'connected') return '<span class="chip ok">terhubung</span>';
    return '<span class="chip">baru</span>';
  }

  function viewCrm() {
    var sent = db.creators.filter(function (c) { return c.status === 'sent' || c.status === 'connected'; });
    var failed = db.creators.filter(function (c) { return c.status === 'failed'; });
    var rows = [];
    db.campaigns.forEach(function (c) {
      (c.rows || []).forEach(function (r) {
        rows.push({ campaign: c.title, handle: r.handle, status: r.status, at: r.at, note: r.note || '' });
      });
    });
    rows.sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); });
    return '<section class="card"><h2>CRM</h2>' +
      '<p class="muted">Terkirim ' + sent.length + ' · gagal ' + failed.length + ' · dari kampanye di perangkat ini.</p></section>' +
      '<section class="card">' +
      (rows.length
        ? rows.map(function (r) {
            return '<div class="person" style="grid-template-columns:1fr auto">' +
              '<span><strong>' + esc(Send.displayHandle(r.handle)) + '</strong>' +
              '<span class="meta">' + esc(r.campaign) + ' · ' + fmtWhen(r.at) + (r.note ? ' · ' + esc(r.note) : '') + '</span></span>' +
              statusChip(r.status) + '</div>';
          }).join('')
        : '<p class="muted">Belum ada kiriman.</p>') +
      '</section>';
  }

  function viewAkun() {
    var bound = Send.shopBound(db.account);
    return '<section class="card">' +
      '<h2>Akun TikTok</h2>' +
      '<p class="muted">Ini akun TikTok, bukan toko Seller Center. Tes teman memakai handle ini.</p>' +
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
      '<h2>Toko TikTok Shop</h2>' +
      (bound
        ? '<p><span class="chip ok">terhubung</span> ' + esc(db.account.shopName || 'Toko') + '</p>' +
          '<p class="muted">Kolaborasi Bertarget terbuka. Worker API masih stub — Kirim tidak menembak Affiliate Center sampai Partner Center dipasang.</p>' +
          '<button type="button" class="btn-ghost danger" data-act="unbind-shop">Putuskan toko (lokal)</button>'
        : '<p><span class="chip locked">belum terhubung</span></p>' +
          '<p class="muted">KTP tidak bisa membuka toko ID dari akun AS. Hubungkan toko Anton lewat OAuth, bukan password.</p>' +
          '<button type="button" class="btn" disabled>Hubungkan toko</button>' +
          '<p class="muted" style="margin-top:8px">Tombol hidup setelah callback OAuth. Jangan tempel cookie / password Seller Center.</p>' +
          (isLanHost()
            ? '<button type="button" class="btn-ghost" data-act="sim-shop" style="margin-top:8px">Simulasikan toko terhubung (UI saja)</button>' +
              '<p class="muted">Hanya LAN. Membuka channel Target Collab supaya wizard bisa dites. Worker tetap stub — tidak kirim ke Affiliate Center.</p>'
            : '')) +
      '<div class="note">Latihan kuota ' + db.quota.used + '/' + db.quota.cap + ' hari ini (WIB). Bukan cap resmi toko. Reset hanya untuk tes.</div>' +
      '<button type="button" class="btn-ghost" data-act="reset-quota">Reset latihan kuota</button>' +
      '</section>' +
      '<section class="card">' +
      '<h2>OAuth nanti (Anton)</h2>' +
      '<ol class="checklist">' +
        '<li>Daftar app di Partner Center (LarisID US LLC + paspor, bukan KTP toko).</li>' +
        '<li>Anton otorisasi toko — bukan login Seller Center di app ini.</li>' +
        '<li>Simpan shop token di <code>account.shopToken</code> → channel Target Collab terbuka.</li>' +
        '<li>Tes 1 kreator yang Anton kontrol, baru mass sesuai cap toko (50/batch, 1.000/hari).</li>' +
      '</ol>' +
      '<p class="muted"><a href="./README.md">Baca checklist lengkap</a></p>' +
      '</section>' +
      '<section class="card">' +
      '<button type="button" class="btn-ghost danger" data-act="reset-all">Hapus data lokal</button>' +
      '</section>';
  }

  function viewWizard() {
    var w = ui.wizard;
    var bound = Send.shopBound(db.account);
    var collab = Send.channelAvailable('target_collab', db.account);
    var html = '<div class="steps">' + [0, 1, 2, 3].map(function (i) {
      return '<i' + (i <= w.step ? ' class="on"' : '') + '></i>';
    }).join('') + '</div>';
    if (w.step === 0) {
      html += '<section class="card"><h2>Channel</h2>' +
        '<button type="button" class="channel' + (w.channel === 'tiktok_dm' ? ' on' : '') + '" data-act="wiz-ch" data-id="tiktok_dm">' +
          '<strong>Pesan TikTok</strong><em>Salin + buka aplikasi. Tes teman sebagai ' + esc(db.account.display) + '.</em></button>' +
        '<button type="button" class="channel' + (w.channel === 'target_collab' ? ' on' : '') + '"' +
          (bound ? '' : ' disabled') + ' data-act="wiz-ch" data-id="target_collab">' +
          '<strong>Kolaborasi Bertarget</strong><em>' +
          (bound ? esc(collab.ok ? 'Toko terhubung — API belum kirim sungguhan.' : collab.reason) : 'Terkunci. Butuh toko terhubung (OAuth Anton).') +
          '</em></button>' +
        '<div class="sticky-actions"><button type="button" class="btn" data-act="wiz-next">Lanjut</button>' +
        '<button type="button" class="btn-ghost" data-act="wiz-cancel">Batal</button></div></section>';
    } else if (w.step === 1) {
      var rows = db.creators;
      html += '<section class="card"><h2>Pilih orang</h2>' +
        '<label class="muted"><input type="checkbox" data-act="wiz-all"' + (rows.length && rows.every(function (c) { return w.ids[c.id]; }) ? ' checked' : '') + '> Pilih semua</label>' +
        (rows.length ? rows.map(function (c) {
          return '<label class="person">' +
            '<input type="checkbox" data-act="wiz-sel" data-id="' + esc(c.id) + '"' + (w.ids[c.id] ? ' checked' : '') + '>' +
            '<span><strong>' + esc(Send.displayHandle(c.handle)) + '</strong><span class="meta">' + esc(c.name || '') + (c.demo ? ' · contoh' : '') + '</span></span></label>';
        }).join('') : '<p class="muted">Tambah handle di tab Kreator dulu.</p>') +
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
      var cap = leftQuota();
      var n = Math.min(chosen.length, cap);
      var truncated = chosen.length > n;
      html += '<section class="card"><h2>Kirim</h2>' +
        '<p><strong>' + n + '</strong> dari ' + chosen.length + ' antrian. Sisa latihan hari ini: ' + cap + '.</p>' +
        (truncated ? '<div class="note">Dipotong ke latihan kuota ' + cap + '. Sisanya tidak masuk job ini.</div>' : '') +
        (w.channel === 'target_collab' ? '<div class="note">Channel toko: worker API belum menembak Affiliate Center.</div>' : '') +
        '<p class="muted">Tiap baris: salin pesan, buka TikTok, kamu yang ketuk Send di aplikasi.</p>' +
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
    if (!Object.keys(ids).length) {
      db.creators.forEach(function (c) { ids[c.id] = true; });
    }
    ui.wizard = {
      step: 0,
      channel: 'tiktok_dm',
      ids: ids,
      template: db.template
    };
    render();
  }

  function startJobFromWizard() {
    var w = ui.wizard;
    var avail = Send.channelAvailable(w.channel, db.account);
    if (!avail.ok) { toast(avail.reason || 'Channel terkunci'); return; }
    var chosen = selectedCreators(w).slice(0, leftQuota());
    if (!chosen.length) { toast('Tidak ada yang bisa dikirim'); return; }
    db.template = w.template;
    var campaign = {
      id: uid('job'),
      title: (w.channel === 'target_collab' ? 'Target Collab' : 'Pesan TikTok') + ' · ' + new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short', timeZone: JAKARTA }),
      channel: w.channel,
      template: w.template,
      status: 'berjalan',
      createdAt: new Date().toISOString(),
      cursor: 0,
      rows: chosen.map(function (c) {
        return { creatorId: c.id, handle: c.handle, status: 'pending', at: null, note: '' };
      })
    };
    db.campaigns.push(campaign);
    ui.wizard = null;
    save();
    render();
    showJob(campaign.id);
  }

  function campaignById(id) {
    return db.campaigns.find(function (c) { return c.id === id; });
  }

  function currentRow(campaign) {
    return (campaign.rows || []).find(function (r) { return r.status === 'pending'; });
  }

  function showJob(id) {
    var campaign = campaignById(id);
    if (!campaign) return;
    var row = currentRow(campaign);
    var done = campaign.rows.filter(function (r) { return r.status !== 'pending'; }).length;
    var total = campaign.rows.length;
    if (!row) {
      campaign.status = 'selesai';
      save();
      openOverlay(
        '<p class="muted"><button type="button" class="btn-ghost" data-act="close-job">Tutup</button></p>' +
        '<section class="card"><h2>Selesai</h2>' +
        '<p>' + campaign.rows.filter(function (r) { return r.status === 'sent'; }).length + ' terkirim · ' +
        campaign.rows.filter(function (r) { return r.status === 'failed'; }).length + ' gagal.</p>' +
        '<p class="muted">Cek inbox TikTok. CRM di perangkat ini sudah di-update.</p></section>'
      );
      render();
      return;
    }
    if (leftQuota() === 0 && row.status === 'pending') {
      openOverlay(
        '<p class="muted"><button type="button" class="btn-ghost" data-act="close-job">Tutup</button></p>' +
        '<section class="card"><h2>Latihan kuota penuh</h2>' +
        '<p>50 baris hari ini. Sisa antrian tetap di kampanye. Reset di Akun hanya untuk tes.</p></section>'
      );
      campaign.status = 'pause';
      save();
      render();
      return;
    }
    var creator = creatorById(row.creatorId) || { handle: row.handle };
    var body = Send.compose(campaign.template, Send.varsFor(creator, db.account));
    var pct = Math.round(done / total * 100);
    openOverlay(
      '<p class="muted"><button type="button" class="btn-ghost" data-act="close-job">Tutup</button> · ' + (done + 1) + '/' + total + '</p>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
      '<section class="card" style="margin-top:12px">' +
        '<h2>' + esc(Send.displayHandle(row.handle)) + '</h2>' +
        '<p class="muted">Salin, buka TikTok, kirim di aplikasi, lalu tandai di sini.</p>' +
        '<div class="job-body">' + esc(body) + '</div>' +
        '<div class="job-actions">' +
          '<button type="button" class="btn" data-act="job-go" data-id="' + esc(campaign.id) + '">' +
            (campaign.channel === 'target_collab' ? 'Coba kirim API' : 'Salin &amp; buka TikTok') +
          '</button>' +
          '<button type="button" class="btn-ghost" data-act="job-sent" data-id="' + esc(campaign.id) + '">Sudah kirim</button>' +
          '<button type="button" class="btn-ghost danger" data-act="job-fail" data-id="' + esc(campaign.id) + '">Gagal</button>' +
        '</div></section>'
    );
  }

  async function jobGo(id) {
    var campaign = campaignById(id);
    var row = campaign && currentRow(campaign);
    if (!row) return;
    var creator = creatorById(row.creatorId) || { handle: row.handle };
    var result = await Send.send(creator, {
      channel: campaign.channel,
      account: db.account,
      template: campaign.template
    });
    if (result.code === 'not_wired' || result.code === 'no_shop') {
      toast(result.reason || 'Tidak terkirim');
      row.status = 'failed';
      row.note = result.code;
      row.at = new Date().toISOString();
      var cr = creatorById(row.creatorId);
      if (cr) cr.status = 'failed';
      save();
      showJob(id);
      return;
    }
    if (result.copied && result.ok) toast('Tersalin. Kirim di TikTok, lalu Sudah kirim.');
    else if (result.copied) toast('Tersalin. Buka TikTok manual.');
    else toast('Salin gagal — blokir clipboard?');
  }

  function jobMark(id, status) {
    var campaign = campaignById(id);
    var row = campaign && currentRow(campaign);
    if (!row) return;
    row.status = status;
    row.at = new Date().toISOString();
    var cr = creatorById(row.creatorId);
    if (cr) cr.status = status === 'sent' ? 'sent' : 'failed';
    if (status === 'sent') bumpQuota();
    campaign.status = 'berjalan';
    save();
    showJob(id);
    render();
  }

  function addHandle(raw, name) {
    var h = Send.normHandle(raw);
    if (!h) { toast('Handle kosong'); return; }
    if (creatorByHandle(h)) { toast('Sudah ada'); return; }
    db.creators.unshift({ id: uid('c'), handle: h, name: name || '', demo: false, status: 'new' });
    save();
    render();
    toast('Ditambah ' + Send.displayHandle(h));
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

  /* ── events ──────────────────────────────────────────────────────── */
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
    } else if (act === 'wiz-cancel') {
      ui.wizard = null; render();
    } else if (act === 'wiz-back') {
      ui.wizard.step = Math.max(0, ui.wizard.step - 1); render();
    } else if (act === 'wiz-next') {
      if (ui.wizard.step === 0 && !ui.wizard.channel) ui.wizard.channel = 'tiktok_dm';
      if (ui.wizard.step === 1 && !selectedCreators(ui.wizard).length) { toast('Pilih minimal satu'); return; }
      ui.wizard.step = Math.min(3, ui.wizard.step + 1); render();
    } else if (act === 'wiz-ch') {
      var avail = Send.channelAvailable(id, db.account);
      if (!avail.ok) { toast(avail.reason); return; }
      ui.wizard.channel = id; render();
    } else if (act === 'wiz-sel') {
      ui.wizard.ids[id] = t.checked;
    } else if (act === 'wiz-all') {
      db.creators.forEach(function (c) { ui.wizard.ids[c.id] = t.checked; });
      render();
    } else if (act === 'wiz-go') {
      startJobFromWizard();
    } else if (act === 'sel') {
      ui.selected[id] = t.checked;
    } else if (act === 'sel-all') {
      db.creators.forEach(function (c) { ui.selected[c.id] = t.checked; });
      render();
    } else if (act === 'del-creator') {
      db.creators = db.creators.filter(function (c) { return c.id !== id; });
      delete ui.selected[id];
      save(); render();
    } else if (act === 'open-campaign') {
      showJob(id);
    } else if (act === 'close-job') {
      closeOverlay(); render();
    } else if (act === 'job-go') {
      jobGo(id);
    } else if (act === 'job-sent') {
      jobMark(id, 'sent');
    } else if (act === 'job-fail') {
      jobMark(id, 'failed');
    } else if (act === 'reset-quota') {
      db.quota.used = 0; db.quota.day = todayKey(); save(); render(); toast('Kuota latihan direset');
    } else if (act === 'sim-shop') {
      if (!isLanHost()) return;
      db.account.shopToken = 'dev-placeholder';
      db.account.shopName = 'Toko uji (bukan OAuth)';
      save(); render(); toast('Channel Target Collab terbuka. API belum kirim.');
    } else if (act === 'unbind-shop') {
      db.account.shopToken = null; db.account.shopName = ''; save(); render();
    } else if (act === 'reset-all') {
      if (!confirm('Hapus kampanye dan kreator di browser ini?')) return;
      db = defaultState(); save(); ui = { tab: 'kampanye', wizard: null, selected: {}, filter: '' }; closeOverlay(); render();
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
      var f = t.files[0];
      f.text().then(function (text) {
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
    } else if (t.getAttribute('data-act') === 'wiz-tpl') {
      ui.wizard.template = t.value;
    }
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
