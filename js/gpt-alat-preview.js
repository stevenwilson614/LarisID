/**
 * Seller tools (My Toko). Live on the main app: sift doors → URL scrape /
 * kabar → kompetitor → analisis. ?preview=off turns the alat chrome off.
 *
 * gpt-app.js calls LarisAlatPreview.attach(host) after boot wiring.
 *
 * Doors:
 *  - Seller baru → questionnaire (no sidebar) → Temukan Produk → Cari Produk
 *  - Sudah punya toko → 1/4 URL (enqueue Mac scrape) → 2/4 kabar/kontak
 *    (while scrape runs) → 3/4 pantau kompetitor → 4/4 analisis → My Toko.
 *    Extension “Ini toko saya” is the backup if Mac scrape fails.
 */
(function (global) {
  'use strict';

  var SS_FLAG = 'lid_preview_alat';
  var SS_INTENT = 'lid_alat_intent';
  var PROFILE_KEY = 'lid_alat_shop_v1';
  var CLIENT_KEY = 'lid_alat_client_v1';
  var TRACK_MAX = 20;
  var LIST_PREVIEW = 40;
  var SCRAPE_WAIT_MS = 90000;
  var SCRAPE_POLL_MS = 2000;

  var host = null;
  var _shop = null;
  var _shopMeta = null;
  var _listings = [];
  var _peers = [];
  var _peersByKw = Object.create(null);
  var _audits = [];
  var _auditsByItem = Object.create(null);
  var _step = 1;
  var _trackSelected = []; // listing indices, max TRACK_MAX
  var _trackFocus = -1;
  var _peerChecks = Object.create(null); // `${itemIdx}:${shopId}` → true
  var _analyzeFocus = -1;
  var _trackedIds = []; // item_id strings from seller center / wizard
  var _alerts = { email: false, wa: false, wa_number: '', cadence: 'daily' };
  var _wizardDone = false;
  var _shopLogo = '';
  var _selectedIdx = -1;
  var _detailTab = 'kompetitor'; // 'kompetitor' | 'analisa'
  var _claimSnapId = '';
  var _scrapeJobId = '';
  var _pendingUrl = '';

  function clientId() {
    try {
      var id = localStorage.getItem(CLIENT_KEY);
      if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
      id = (global.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
      localStorage.setItem(CLIENT_KEY, id);
      return id;
    } catch (_) {
      return '00000000-0000-4000-8000-000000000001';
    }
  }

  function cwsExtUrl() {
    try {
      if (typeof global.CWS_EXT_URL === 'string' && global.CWS_EXT_URL) return global.CWS_EXT_URL;
    } catch (_) {}
    return 'https://chromewebstore.google.com/detail/ldgcjbnecfnpbgenechgfbdagecnloae';
  }

  function applyFlag() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('preview') === 'off') {
        sessionStorage.setItem(SS_FLAG, '0');
      } else if (q.get('preview') === 'alat') {
        sessionStorage.setItem(SS_FLAG, '1');
      } else if (sessionStorage.getItem(SS_FLAG) !== '0') {
        // Live default: My Toko doors on unless explicitly turned off.
        sessionStorage.setItem(SS_FLAG, '1');
      }
    } catch (_) {}
    var on = active();
    document.documentElement.classList.toggle('alat-preview', on);
    if (document.body) document.body.classList.toggle('alat-preview', on);
    return on;
  }

  function active() {
    try { return sessionStorage.getItem(SS_FLAG) === '1'; } catch (_) { return false; }
  }

  function $(id) { return host && host.$ ? host.$(id) : document.getElementById(id); }
  function esc(s) { return host && host.esc ? host.esc(s) : String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function user() { return host && host.user ? host.user() : null; }
  function sb() { return host && host.supabase ? host.supabase() : null; }

  function fmtRp(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return 'Rp ' + Math.round(x).toLocaleString('id-ID');
  }
  function fmtN(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '—';
    if (x >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'jt';
    if (x >= 1e3) return (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'rb';
    return String(Math.round(x));
  }

  /** Hide app chrome (sidebar / topbar / composer) during sift, quest, audit wizard. */
  function setFocus(on) {
    if (!document.body) return;
    document.body.classList.toggle('alat-focus', !!on);
  }

  function exitFocus() {
    setFocus(false);
  }

  function forceFinder() {
    return active() && intent() === 'first_time' && document.body.classList.contains('alat-focus');
  }

  function parseShopInput(raw) {
    var s = String(raw || '').trim();
    if (!s) return null;
    if (/shopee\./i.test(s)) {
      var url = /^https?:\/\//i.test(s) ? s : ('https://' + s.replace(/^\/\//, ''));
      var byId = s.match(/\/shop\/(\d+)/i);
      if (byId) return { shopId: Number(byId[1]), url: url };
      var byItem = s.match(/[./-]i\.(\d+)\.(\d+)/i);
      if (byItem) return { shopId: Number(byItem[1]), url: url };
      var bySlug = s.match(/shopee\.[a-z.]+\/([^/?#]+)/i);
      if (bySlug && !/^(product|shop|search)$/i.test(bySlug[1])) {
        return {
          q: decodeURIComponent(bySlug[1]).replace(/[-_]+/g, ' ').trim(),
          url: url,
        };
      }
      return { url: url };
    }
    if (/^\d{4,}$/.test(s)) return { shopId: Number(s), url: 'https://shopee.co.id/shop/' + s };
    return { q: s };
  }

  function rememberShop(shop) {
    _shop = shop;
    persistProfile();
  }

  function persistProfile() {
    if (!_shop) return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        shop_id: _shop.shop_id,
        store_name: _shop.store_name || '',
        ts: Date.now(),
        wizard_done: !!_wizardDone,
        tracked_item_ids: (_trackedIds || []).slice(0, TRACK_MAX),
        snap_id: _claimSnapId || '',
        scrape_job_id: _scrapeJobId || '',
        pending_url: _pendingUrl || '',
        alerts: {
          email: !!_alerts.email,
          wa: !!_alerts.wa,
          wa_number: String(_alerts.wa_number || '').slice(0, 20),
          cadence: _alerts.cadence === 'weekly' ? 'weekly' : 'daily',
        },
      }));
    } catch (_) {}
  }

  function loadProfileBlob() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null') || null;
    } catch (_) { return null; }
  }

  function rememberedShop() {
    if (_shop) return _shop;
    try {
      var raw = loadProfileBlob();
      if (raw && raw.shop_id) {
        _shop = { shop_id: raw.shop_id, store_name: raw.store_name || '' };
        _wizardDone = !!raw.wizard_done;
        _trackedIds = Array.isArray(raw.tracked_item_ids)
          ? raw.tracked_item_ids.map(String).slice(0, TRACK_MAX)
          : [];
        if (raw.snap_id && /^[0-9a-f-]{36}$/i.test(String(raw.snap_id))) {
          _claimSnapId = String(raw.snap_id);
        }
        if (raw.scrape_job_id && /^[0-9a-f-]{36}$/i.test(String(raw.scrape_job_id))) {
          _scrapeJobId = String(raw.scrape_job_id);
        }
        if (raw.pending_url) _pendingUrl = String(raw.pending_url).slice(0, 600);
        if (raw.alerts && typeof raw.alerts === 'object') {
          _alerts = {
            email: !!raw.alerts.email,
            wa: !!raw.alerts.wa,
            wa_number: String(raw.alerts.wa_number || ''),
            cadence: raw.alerts.cadence === 'weekly' ? 'weekly' : 'daily',
          };
        }
        return _shop;
      }
    } catch (_) {}
    return null;
  }

  function markWizardDone() {
    _wizardDone = true;
    persistProfile();
    syncNavLabels();
  }

  function isWizardDone() {
    if (_wizardDone) return true;
    var raw = loadProfileBlob();
    return !!(raw && raw.wizard_done && raw.shop_id);
  }

  /** Existing sellers: Favorit Aku → Product Tracker; Audit → My Toko. */
  function syncNavLabels() {
    if (!active()) return;
    var existing = intent() === 'existing' || isWizardDone();
    var trk = $('btn-tracker');
    if (trk) {
      var lbl = trk.querySelector('.side-btn-label');
      if (existing) {
        trk.title = 'Product Tracker';
        if (lbl) lbl.textContent = 'Product Tracker';
      } else {
        trk.title = 'Favorit Aku';
        if (lbl) lbl.textContent = 'Favorit Aku';
      }
    }
    var aud = $('btn-audit');
    if (aud) {
      var al = aud.querySelector('.side-btn-label');
      aud.title = 'My Toko';
      if (al) al.textContent = 'My Toko';
    }
  }

  function setIntent(kind) {
    try { sessionStorage.setItem(SS_INTENT, kind); } catch (_) {}
    if (!host) return;
    if (kind === 'existing' || kind === 'first_time') {
      host.setExperience(kind);
    }
    syncNavLabels();
  }

  function intent() {
    try { return sessionStorage.getItem(SS_INTENT) || ''; } catch (_) { return ''; }
  }

  function log(name, extra) {
    try { host && host.logUserEvent && host.logUserEvent(name, Object.assign({ ui: 'gpt', preview: 'alat' }, extra || {})); } catch (_) {}
  }

  function progressHtml(step, title) {
    var pct = Math.round((step / 4) * 100);
    return (
      '<div class="alat-progress" aria-label="Langkah ' + step + ' dari 4">' +
        '<div class="alat-progress-meta">' +
          '<span class="alat-progress-n">' + step + ' / 4</span>' +
          '<span class="alat-progress-t">' + esc(title) + '</span>' +
        '</div>' +
        '<div class="alat-progress-track"><i style="width:' + pct + '%"></i></div>' +
        '<ol class="alat-progress-steps">' +
          '<li class="' + (step >= 1 ? 'on' : '') + (step === 1 ? ' cur' : '') + '">Toko</li>' +
          '<li class="' + (step >= 2 ? 'on' : '') + (step === 2 ? ' cur' : '') + '">Kabar</li>' +
          '<li class="' + (step >= 3 ? 'on' : '') + (step === 3 ? ' cur' : '') + '">Kompetitor</li>' +
          '<li class="' + (step >= 4 ? 'on' : '') + (step === 4 ? ' cur' : '') + '">Analisis</li>' +
        '</ol>' +
      '</div>'
    );
  }

  function startNewSeller() {
    setIntent('first_time');
    if (host && host.markPendingAlat) host.markPendingAlat(null);
    log('alat_sift', { door: 'first_time' });
    openQuest();
  }

  function openQuest() {
    setFocus(true);
    if (host && host.resetFinderForAlat) host.resetFinderForAlat();
    if (host && host.renderHome) host.renderHome();
    else if (host && host.setView) host.setView('home');
  }

  function startExistingSeller() {
    setIntent('existing');
    log('alat_sift', { door: 'existing' });
    openAudit({ fresh: true });
  }

  async function saveStoreProfile(shop) {
    var client = sb();
    var u = user();
    if (!client || !u || !shop || !(Number(shop.shop_id) > 0)) return;
    try {
      await client.from('user_store_profiles').upsert({
        user_id: u.id,
        shopee_store_name: shop.store_name || '',
        shopee_shop_id: shop.shop_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch (_) {}
  }

  async function loadProfileFromDb() {
    var client = sb();
    var u = user();
    if (!client || !u) return rememberedShop();
    try {
      var res = await client.from('user_store_profiles')
        .select('shopee_store_name,shopee_shop_id')
        .eq('user_id', u.id)
        .maybeSingle();
      var row = res && res.data;
      if (row && row.shopee_shop_id) {
        rememberShop({ shop_id: row.shopee_shop_id, store_name: row.shopee_store_name || '' });
        return _shop;
      }
    } catch (_) {}
    return rememberedShop();
  }

  function renderConnect() {
    var root = $('alat-root');
    if (!root) return;
    root.className = 'alat-page';
    _step = 1;
    root.innerHTML =
      progressHtml(1, 'Hubungkan toko') +
      '<section class="alat-card">' +
        '<h2>Tempel link toko Shopee</h2>' +
        '<p class="alat-lead">Kami ambil produk toko di latar (biasanya &lt;1 menit). Sementara itu kamu isi kabar kompetitor. Kalau gagal, ekstensi Chrome jadi cadangan.</p>' +
        '<label class="alat-label" for="alat-shop-q">Link / nama toko</label>' +
        '<div class="alat-row">' +
          '<input type="text" id="alat-shop-q" class="alat-input" placeholder="https://shopee.co.id/… atau nama toko" autocomplete="off">' +
          '<button type="button" class="btn-primary" id="alat-shop-go">Lanjut</button>' +
        '</div>' +
        '<p class="alat-err" id="alat-shop-err" hidden></p>' +
        '<div id="alat-shop-picker" class="alat-picker" hidden></div>' +
        '<p class="alat-hint">Sudah punya ekstensi? Di halaman toko Shopee, ketuk “Ini toko saya”.</p>' +
      '</section>';
    $('alat-shop-go')?.addEventListener('click', function () { void searchShop(); });
    $('alat-shop-q')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); void searchShop(); }
    });
  }

  function showErr(msg) {
    var el = $('alat-shop-err');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  async function searchShop() {
    var client = sb();
    if (!client) { showErr('Koneksi data belum siap. Muat ulang sebentar.'); return; }
    var parsed = parseShopInput($('alat-shop-q')?.value);
    if (!parsed) { showErr('Masukkan nama toko atau link Shopee.'); return; }
    showErr('');
    var go = $('alat-shop-go');
    if (go) { go.disabled = true; go.textContent = 'Mencari…'; }
    try {
      if (parsed.shopId) {
        var hit = await lookupShopId(parsed.shopId);
        if (hit) {
          await beginOnboard(hit, parsed.url || ('https://shopee.co.id/shop/' + parsed.shopId), false);
          return;
        }
        await beginOnboard(
          { shop_id: parsed.shopId, store_name: 'Toko ' + parsed.shopId },
          parsed.url || ('https://shopee.co.id/shop/' + parsed.shopId),
          true
        );
        return;
      }
      if (parsed.url) {
        var nameHint = parsed.q || '';
        await beginOnboard(
          { shop_id: null, store_name: nameHint || 'Toko Shopee' },
          parsed.url,
          true
        );
        return;
      }
      var rows = await findShopsByName(parsed.q, 8);
      if (!rows.length) {
        showErr('Toko "' + parsed.q + '" belum ada di data kami. Tempel link toko Shopee lengkap supaya kami ambil produknya sekarang.');
        return;
      }
      var exact = rows.filter(function (r) { return r.match_kind === 'exact'; });
      if (exact.length === 1) {
        await beginOnboard(exact[0], 'https://shopee.co.id/shop/' + exact[0].shop_id, false);
        return;
      }
      renderPicker(rows);
    } finally {
      if (go) { go.disabled = false; go.textContent = 'Lanjut'; }
    }
  }

  async function requestShopScrape(url, shop) {
    var client = sb();
    if (!client || !url) return null;
    try {
      var res = await client.rpc('request_shop_scrape', {
        p_client: clientId(),
        p_source_url: url,
        p_shop_id: shop && shop.shop_id ? Number(shop.shop_id) : null,
        p_store_name: (shop && shop.store_name) || '',
      });
      var d = res && res.data;
      if (d && d.ok && d.job_id) return d;
      if (d && d.reason === 'rate_limited') return d;
    } catch (_) {}
    return null;
  }

  async function pollScrapeJob(jobId, onTick) {
    var client = sb();
    if (!client || !jobId) return null;
    var started = Date.now();
    while (Date.now() - started < SCRAPE_WAIT_MS) {
      try {
        var res = await client.rpc('get_shop_scrape_job', {
          p_job_id: jobId,
          p_client: clientId(),
        });
        var d = res && res.data;
        if (d && d.ok) {
          if (typeof onTick === 'function') onTick(d);
          if (d.status === 'done' || d.status === 'failed') return d;
        }
      } catch (_) {}
      await new Promise(function (r) { setTimeout(r, SCRAPE_POLL_MS); });
    }
    return { ok: true, status: 'timeout', job_id: jobId };
  }

  async function beginOnboard(row, url, needScrape) {
    var shop = {
      shop_id: row.shop_id != null ? row.shop_id : null,
      store_name: row.store_name || (row.shop_id ? ('Toko ' + row.shop_id) : 'Toko Shopee'),
    };
    _pendingUrl = url || '';
    _scrapeJobId = '';
    if (shop.shop_id) {
      rememberShop(shop);
      await saveStoreProfile(shop);
      log('alat_shop_claimed', { shop_id: shop.shop_id, via: needScrape ? 'url_scrape' : 'db' });
    } else {
      _shop = shop;
      persistProfile();
    }
    if (needScrape && url) {
      var queued = await requestShopScrape(url, shop);
      if (queued && queued.job_id) {
        _scrapeJobId = String(queued.job_id);
        persistProfile();
      }
    } else if (url && shop.shop_id) {
      // Known shop: still queue a soft refresh when URL was pasted (best-effort).
      var soft = await requestShopScrape(url, shop);
      if (soft && soft.job_id) {
        _scrapeJobId = String(soft.job_id);
        persistProfile();
      }
    }
    renderPersonalInfo(shop);
  }

  function readAlertsFromForm() {
    _alerts.email = !!$('alat-alert-email')?.checked;
    _alerts.wa = !!$('alat-alert-wa')?.checked;
    _alerts.wa_number = String($('alat-wa-num')?.value || '').replace(/\D/g, '').slice(0, 20);
    var cad = document.querySelector('input[name="alat-cadence"]:checked');
    _alerts.cadence = cad && cad.value === 'weekly' ? 'weekly' : 'daily';
    persistProfile();
  }

  function renderPersonalInfo(shop) {
    var root = $('alat-root');
    if (!root) return;
    root.className = 'alat-page';
    _step = 2;
    var scrapeNote = _scrapeJobId
      ? '<p class="alat-hint" id="alat-scrape-status">Sedang mengambil produk toko di latar… isi kabar di bawah, tidak perlu menunggu.</p>'
      : '<p class="alat-hint" id="alat-scrape-status">Toko sudah dikenal di data kami — lanjut isi kabar, lalu pilih produk.</p>';
    root.innerHTML =
      progressHtml(2, 'Kabar kompetitor') +
      '<section class="alat-card">' +
        '<p class="alat-kicker">' + esc(shop.store_name || 'Toko') + '</p>' +
        '<h2>Mau dikabari perubahan kompetitor?</h2>' +
        '<p class="alat-lead">Opsional. Preferensi tersimpan di perangkat ini. Produk toko tetap diambil meski kamu lewati.</p>' +
        scrapeNote +
        '<div class="myt-alert-channels" style="margin-top:12px">' +
          '<label class="myt-alert-card' + (_alerts.email ? ' is-on' : '') + '">' +
            '<input type="checkbox" id="alat-alert-email"' + (_alerts.email ? ' checked' : '') + '>' +
            '<span><b>Email</b><small>Ke email akun LarisID</small></span>' +
          '</label>' +
          '<label class="myt-alert-card' + (_alerts.wa ? ' is-on' : '') + '">' +
            '<input type="checkbox" id="alat-alert-wa"' + (_alerts.wa ? ' checked' : '') + '>' +
            '<span><b>WhatsApp</b><small>Pesan harian singkat</small></span>' +
          '</label>' +
        '</div>' +
        '<div class="alat-row" id="alat-wa-row"' + (_alerts.wa ? '' : ' hidden') + ' style="margin-top:12px">' +
          '<label class="alat-label" for="alat-wa-num" style="width:100%;margin:0">Nomor WhatsApp</label>' +
          '<input type="tel" id="alat-wa-num" class="alat-input" inputmode="tel" placeholder="0812xxxxxxxx" value="' + esc(_alerts.wa_number || '') + '">' +
        '</div>' +
        '<fieldset class="myt-cadence">' +
          '<legend>Frekuensi</legend>' +
          '<label><input type="radio" name="alat-cadence" value="daily"' +
            (_alerts.cadence !== 'weekly' ? ' checked' : '') + '> Setiap hari</label>' +
          '<label><input type="radio" name="alat-cadence" value="weekly"' +
            (_alerts.cadence === 'weekly' ? ' checked' : '') + '> Sekali seminggu</label>' +
        '</fieldset>' +
        '<div class="alat-row alat-row-end" style="margin-top:16px">' +
          '<button type="button" class="btn-ghost" id="alat-kabar-back">Ganti toko</button>' +
          '<button type="button" class="btn-primary" id="alat-kabar-go">Lanjut</button>' +
        '</div>' +
        '<p class="alat-err" id="alat-kabar-err" hidden></p>' +
      '</section>';

    function syncCards() {
      document.querySelectorAll('.myt-alert-card').forEach(function (lab) {
        var on = !!lab.querySelector('input')?.checked;
        lab.classList.toggle('is-on', on);
      });
      var row = $('alat-wa-row');
      if (row) row.hidden = !$('alat-alert-wa')?.checked;
    }
    $('alat-alert-email')?.addEventListener('change', syncCards);
    $('alat-alert-wa')?.addEventListener('change', syncCards);
    $('alat-kabar-back')?.addEventListener('click', function () { clearShopAndReconnect(); });
    $('alat-kabar-go')?.addEventListener('click', function () { void finishPersonalInfo(shop); });
  }

  async function finishPersonalInfo(shop) {
    readAlertsFromForm();
    var go = $('alat-kabar-go');
    var status = $('alat-scrape-status');
    var err = $('alat-kabar-err');
    if (err) { err.hidden = true; err.textContent = ''; }
    if (go) { go.disabled = true; go.textContent = 'Menyiapkan…'; }

    if (_scrapeJobId) {
      var already = [];
      if (shop.shop_id) {
        try { already = await fetchTokoListings(shop.shop_id); } catch (_) { already = []; }
      }
      var waitMs = already.length ? 12000 : SCRAPE_WAIT_MS;
      if (status) {
        status.textContent = already.length
          ? 'Menyegarkan produk toko (opsional)…'
          : 'Mengambil produk toko… biasanya selesai sebelum kamu baca ini.';
      }
      var started = Date.now();
      var job = null;
      var client = sb();
      while (client && Date.now() - started < waitMs) {
        try {
          var res = await client.rpc('get_shop_scrape_job', {
            p_job_id: _scrapeJobId,
            p_client: clientId(),
          });
          job = res && res.data;
          if (job && job.ok) {
            if (status) {
              if (job.status === 'claimed' || job.status === 'pending') {
                status.textContent = 'Mac kami sedang membuka halaman toko…';
              } else if (job.status === 'done') {
                status.textContent = 'Produk toko siap.';
              } else if (job.status === 'failed') {
                status.textContent = 'Ambil otomatis gagal — siapin cadangan ekstensi.';
              }
            }
            if (job.status === 'done' || job.status === 'failed') break;
          }
        } catch (_) {}
        await new Promise(function (r) { setTimeout(r, SCRAPE_POLL_MS); });
      }
      if (!job || (job.status !== 'done' && job.status !== 'failed')) {
        job = { ok: true, status: already.length ? 'skip' : 'timeout', job_id: _scrapeJobId };
      }
      if (job && job.status === 'done' && job.snap_id) {
        _claimSnapId = String(job.snap_id);
        if (job.shop_id) shop.shop_id = job.shop_id;
        if (job.store_name) shop.store_name = job.store_name;
        rememberShop(shop);
        await saveStoreProfile(shop);
        persistProfile();
        await loadShopWork(shop, { freshListings: true });
        return;
      }
      if (job && (job.status === 'failed' || job.status === 'timeout') && !already.length) {
        // Fall through to extension if nothing in DB.
      } else if (already.length) {
        rememberShop(shop);
        await loadShopWork(shop, { freshListings: true });
        return;
      }
    }

    if (!shop.shop_id) {
      renderExtBackup(shop, 'Belum dapat shop id dari link itu.');
      return;
    }
    rememberShop(shop);
    await loadShopWork(shop, { freshListings: true });
  }

  function renderExtBackup(shop, reason) {
    var root = $('alat-root');
    if (!root) return;
    root.className = 'alat-page';
    root.innerHTML =
      progressHtml(2, 'Cadangan ekstensi') +
      '<section class="alat-card">' +
        '<p class="alat-kicker">' + esc(shop.store_name || 'Toko') + '</p>' +
        '<h2>Ambil lewat ekstensi LarisID</h2>' +
        '<p class="alat-lead">' + esc(reason || 'Sapuan otomatis belum berhasil.') +
          ' Pasang ekstensi, buka halaman toko Shopee-mu, ketuk “Ini toko saya”. Preferensi kabar sudah tersimpan.</p>' +
        '<div class="alat-row" style="margin-top:12px">' +
          '<a class="btn-primary" id="alat-ext-cws" href="' + esc(cwsExtUrl()) + '" target="_blank" rel="noopener">Pasang ekstensi</a>' +
          '<button type="button" class="btn-ghost" id="alat-ext-retry">Coba link lagi</button>' +
        '</div>' +
      '</section>';
    $('alat-ext-retry')?.addEventListener('click', function () { clearShopAndReconnect(); });
  }

  async function findShopsByName(q, limit) {
    var client = sb();
    var needle = String(q || '').trim();
    if (!client || !needle) return [];
    // Prefer RPC when signed in; anon falls through to public mv_shops.
    if (user()) {
      try {
        var res = await client.rpc('find_shops_by_name', { p_q: needle, p_limit: limit || 8 });
        if (!res.error) return res.data || [];
      } catch (_) {}
    }
    var low = needle.toLowerCase();
    var res2 = await client.from('mv_shops')
      .select('shop_id,store_name,n_listings,total_sold,location')
      .ilike('store_name', '%' + needle + '%')
      .order('n_listings', { ascending: false })
      .limit(limit || 8);
    return (res2.data || []).map(function (r) {
      var name = String(r.store_name || '').toLowerCase();
      return Object.assign({}, r, {
        match_kind: name === low ? 'exact' : (name.indexOf(low) === 0 ? 'prefix' : 'contains'),
      });
    });
  }

  async function lookupShopId(shopId) {
    var client = sb();
    if (!client) return null;
    var res = await client.from('mv_shops')
      .select('shop_id,store_name,n_listings,total_sold,location,canonical_category,last_seen_at')
      .eq('shop_id', shopId)
      .limit(1);
    var row = res && res.data && res.data[0];
    return row || null;
  }

  async function fetchShopLogo(shopId) {
    if (host && typeof host.getShopLogo === 'function') {
      try {
        var url = await host.getShopLogo(shopId);
        if (url) return String(url);
      } catch (_) {}
    }
    var client = sb();
    if (!client || !shopId) return '';
    try {
      var cached = await client.from('shop_logo_cache')
        .select('logo_url')
        .eq('shop_id', Number(shopId))
        .maybeSingle();
      if (cached && cached.data && cached.data.logo_url) return cached.data.logo_url;
    } catch (_) {}
    try {
      var inv = await client.functions.invoke('get-shop-logo', { body: { shop_id: Number(shopId) } });
      var d = inv && inv.data;
      if (d && (d.logo_url || d.logo)) return d.logo_url || d.logo;
    } catch (_) {}
    return '';
  }

  function thumb(url) {
    if (host && typeof host.imgThumb === 'function') return host.imgThumb(url) || url;
    var u = String(url || '');
    return /^https:\/\/cf\.shopee\.co\.id\/file\/[\w-]+$/.test(u) ? u + '_tn.webp' : u;
  }

  function shopInitials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (/^\d+$/.test(words[0])) return words[0].slice(0, 2);
    return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
  }

  async function fetchTokoListings(shopId) {
    var client = sb();
    if (!client) return [];
    if (user()) {
      try {
        var res = await client.rpc('get_toko_listings', { p_shop_id: Number(shopId) });
        if (!res.error && res.data) return res.data;
      } catch (_) {}
    }
    var res2 = await client.from('listings_deduped')
      .select('item_id,product_name,price,total_sold,rating,reviews,image_url,category,keyword')
      .eq('shop_id', Number(shopId))
      .eq('is_offtopic', false)
      .order('total_sold', { ascending: false })
      .limit(50);
    return res2.data || [];
  }

  async function fetchClaimSnapshot(snapId) {
    var client = sb();
    if (!client || !snapId) return null;
    try {
      var res = await client.rpc('get_shop_claim_snapshot', { p_snap_id: snapId });
      var d = res && res.data;
      if (d && d.ok) return d;
    } catch (_) {}
    return null;
  }

  function mergeTokoListings(scraped, snapRows) {
    var byId = Object.create(null);
    (scraped || []).forEach(function (p) {
      if (!p || p.item_id == null) return;
      byId[String(p.item_id)] = Object.assign({}, p, { from_snapshot: false });
    });
    (snapRows || []).forEach(function (p) {
      if (!p || p.item_id == null) return;
      var id = String(p.item_id);
      if (byId[id]) {
        if (!byId[id].image_url && p.image_url) byId[id].image_url = p.image_url;
        if (!byId[id].keyword && p.keyword) byId[id].keyword = p.keyword;
        return;
      }
      byId[id] = {
        item_id: p.item_id,
        product_name: p.product_name || '',
        price: p.price,
        total_sold: p.total_sold,
        reviews: p.reviews,
        rating: p.rating,
        image_url: p.image_url || '',
        category: p.category || '',
        keyword: p.keyword || '',
        from_snapshot: true,
      };
    });
    return Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) {
      return (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0);
    });
  }

  async function attachKeywords(listings) {
    var need = (listings || []).filter(function (p) {
      return p && p.item_id && !String(p.keyword || '').trim();
    });
    if (!need.length) return;
    var client = sb();
    if (!client) return;
    try {
      var res = await client.rpc('match_titles_to_keywords', {
        p_titles: need.map(function (p) {
          return {
            item_id: p.item_id,
            product_name: p.product_name || '',
            category: p.category || '',
          };
        }),
      });
      var map = res && res.data;
      if (typeof map === 'string') {
        try { map = JSON.parse(map); } catch (_) { map = {}; }
      }
      if (!map || typeof map !== 'object') return;
      listings.forEach(function (p) {
        if (!p || String(p.keyword || '').trim()) return;
        var kw = map[String(p.item_id)] || map[p.item_id];
        if (kw) p.keyword = kw;
      });
    } catch (_) {}
  }

  function anySnapshotListing() {
    return (_listings || []).some(function (p) { return p && p.from_snapshot; });
  }

  async function fetchCompetitivePosition(kw, shopId, itemId) {
    var client = sb();
    if (!client) return null;
    if (user()) {
      try {
        var res = await client.rpc('get_competitive_position', {
          p_keyword: kw,
          p_shop_id: Number(shopId),
          p_item_id: Number(itemId),
        });
        if (!res.error) return res.data;
      } catch (_) {}
    }
    var q = await client.from('listings_deduped')
      .select('item_id,shop_id,product_name,price,total_sold,reviews')
      .eq('keyword', kw)
      .eq('is_offtopic', false)
      .gt('total_sold', 0)
      .order('total_sold', { ascending: false })
      .limit(80);
    var rows = q.data || [];
    if (!rows.length) return { found: false };
    var prices = rows.map(function (r) { return Number(r.price); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    var median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    var mineIdx = rows.findIndex(function (r) {
      return Number(r.shop_id) === Number(shopId) && (itemId == null || Number(r.item_id) === Number(itemId));
    });
    if (mineIdx < 0) {
      mineIdx = rows.findIndex(function (r) { return Number(r.shop_id) === Number(shopId); });
    }
    if (mineIdx < 0) return { found: false, total_sellers: rows.length, median_price: median };
    var mine = rows[mineIdx];
    var marketTotal = rows.reduce(function (s, r) { return s + (Number(r.total_sold) || 0); }, 0);
    var top3 = rows.slice(0, 3);
    var top3Reviews = top3.reduce(function (s, r) { return s + (Number(r.reviews) || 0); }, 0) / Math.max(top3.length, 1);
    var top3Price = top3.reduce(function (s, r) { return s + (Number(r.price) || 0); }, 0) / Math.max(top3.length, 1);
    return {
      found: true,
      my_rank: mineIdx + 1,
      total_sellers: rows.length,
      my_sold: mine.total_sold,
      market_total: marketTotal,
      market_share: marketTotal ? Math.round((Number(mine.total_sold) / marketTotal) * 1000) / 10 : null,
      my_price: mine.price,
      median_price: median != null ? Math.round(median) : null,
      my_reviews: mine.reviews,
      top3_reviews: Math.round(top3Reviews),
      top3_price: Math.round(top3Price),
      my_name: mine.product_name,
    };
  }

  function renderPicker(rows) {
    var box = $('alat-shop-picker');
    if (!box) return;
    box.hidden = false;
    box.innerHTML = rows.map(function (r, i) {
      var meta = [fmtN(r.n_listings || r.n_products) + ' listing', r.location || ''].filter(Boolean).join(' · ');
      return '<button type="button" class="alat-pick" data-alat-pick="' + i + '">' +
        '<span class="alat-pick-name">' + esc(r.store_name || ('Toko ' + r.shop_id)) + '</span>' +
        '<span class="alat-pick-meta">' + esc(meta) + '</span></button>';
    }).join('');
    box._rows = rows;
    box.querySelectorAll('[data-alat-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = box._rows[Number(btn.getAttribute('data-alat-pick'))];
        if (row) void pickShop(row);
      });
    });
  }

  async function pickShop(row) {
    await beginOnboard(row, 'https://shopee.co.id/shop/' + row.shop_id, false);
  }

  async function loadShopWork(shop, opts) {
    opts = opts || {};
    var root = $('alat-root');
    if (!root) return;
    var wantCenter = !!(opts.center || (isWizardDone() && !opts.forceWizard));
    root.className = wantCenter ? 'alat-page alat-page--wide' : 'alat-page';
    if (wantCenter) {
      root.innerHTML =
        '<div class="myt-center"><p class="alat-lead agent-wait" style="padding:24px 4px">Memuat My Toko…</p></div>';
    } else {
      root.innerHTML = progressHtml(1, 'Hubungkan toko') +
        '<p class="alat-lead" style="padding:8px 4px">Memuat listing toko…</p>';
    }

    // Reuse in-memory listings when reopening the same shop (nav / finish).
    var sameShop = _shop && Number(_shop.shop_id) === Number(shop.shop_id) && _listings.length;
    if (!sameShop || opts.freshListings) {
      var scraped = [];
      try { scraped = await fetchTokoListings(shop.shop_id); } catch (_) { scraped = []; }
      var snapRows = [];
      if (_claimSnapId) {
        try {
          var snap = await fetchClaimSnapshot(_claimSnapId);
          if (snap && snap.ok) {
            snapRows = Array.isArray(snap.listings) ? snap.listings : [];
            if (snap.store_name && !shop.store_name) shop.store_name = snap.store_name;
            if (snap.shop_id && !shop.shop_id) {
              shop.shop_id = snap.shop_id;
              rememberShop(shop);
            }
          }
        } catch (_) {}
      }
      _listings = mergeTokoListings(scraped, snapRows);
      await attachKeywords(_listings);
      try { _shopMeta = await lookupShopId(shop.shop_id); } catch (_) { _shopMeta = null; }
      try { _shopLogo = await fetchShopLogo(shop.shop_id); } catch (_) { _shopLogo = ''; }
    }
    if (!_shopLogo && _listings[0] && _listings[0].image_url) {
      // Soft fallback: top listing photo until shop portrait is cached.
      _shopLogo = '';
    }
    if (_shopMeta && _shopMeta.store_name && !shop.store_name) {
      shop.store_name = _shopMeta.store_name;
      rememberShop(shop);
    }
    if (!_listings.length) {
      renderExtBackup(shop, 'Belum ada listing toko ini di sapuan kami, dan ambil otomatis belum mengisi produk.');
      return;
    }
    // Restore tracked selection from profile when revisiting.
    if (_trackedIds.length) {
      _trackSelected = [];
      _listings.forEach(function (p, i) {
        if (_trackedIds.indexOf(String(p.item_id)) >= 0 && _trackSelected.length < TRACK_MAX) {
          _trackSelected.push(i);
        }
      });
    }
    if (!_trackSelected.length) {
      _trackSelected = [];
      _trackFocus = -1;
    } else if (_trackFocus < 0) {
      _trackFocus = _trackSelected[0];
    }

    if (wantCenter) {
      // Don't preload peers for every keyword — load on product select.
      renderSellerCenter(shop);
      return;
    }
    _peerChecks = Object.create(null);
    _auditsByItem = Object.create(null);
    _peers = await suggestPeers(shop, _listings);
    renderTrackStep(shop);
    void prepareAudits(shop, _listings);
  }

  function clearShopAndReconnect() {
    try { localStorage.removeItem(PROFILE_KEY); } catch (_) {}
    _shop = null;
    _shopMeta = null;
    _shopLogo = '';
    _selectedIdx = -1;
    _listings = [];
    _trackedIds = [];
    _claimSnapId = '';
    _scrapeJobId = '';
    _pendingUrl = '';
    _wizardDone = false;
    _trackSelected = [];
    renderConnect();
  }

  async function peersForKeyword(shop, keyword) {
    var kw = String(keyword || '').trim();
    if (!kw) return [];
    if (_peersByKw[kw]) return _peersByKw[kw];
    var client = sb();
    if (!client) return [];
    try {
      var q = await client.from('listings_deduped')
        .select('shop_id,store_name,item_id,product_name,price,total_sold,image_url,keyword,category,reviews')
        .eq('keyword', kw)
        .eq('is_offtopic', false)
        .gt('total_sold', 0)
        .order('total_sold', { ascending: false })
        .limit(10);
      var rows = (q.data || []).filter(function (r) {
        return Number(r.shop_id) !== Number(shop.shop_id);
      }).slice(0, 6);
      _peersByKw[kw] = rows;
      return rows;
    } catch (_) {
      _peersByKw[kw] = [];
      return [];
    }
  }

  async function suggestPeers(shop, listings) {
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < Math.min(listings.length, 8); i++) {
      var rows = await peersForKeyword(shop, listings[i].keyword);
      rows.forEach(function (r) {
        var id = String(r.shop_id);
        if (seen[id]) return;
        seen[id] = true;
        out.push(r);
      });
      if (out.length >= 8) break;
    }
    return out.slice(0, 8);
  }

  function productCardHtml(p, idx, opts) {
    opts = opts || {};
    var selected = !!opts.selected;
    var focused = !!opts.focused;
    var cls = 'alat-pcard' + (selected ? ' is-selected' : '') + (focused ? ' is-focus' : '');
    return (
      '<button type="button" class="' + cls + '" data-alat-pcard="' + idx + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
        (p.image_url
          ? '<img class="alat-pcard-img" src="' + esc(p.image_url) + '" alt="">'
          : '<span class="alat-pcard-img alat-ph"></span>') +
        '<span class="alat-pcard-body">' +
          '<span class="alat-pcard-name">' + esc((p.product_name || '').slice(0, 48)) + '</span>' +
          '<span class="alat-pcard-meta">' + esc(p.keyword || '') + '</span>' +
          '<span class="alat-pcard-price">' + fmtRp(p.price) + ' · ' + fmtN(p.total_sold) + ' terjual</span>' +
        '</span>' +
      '</button>'
    );
  }

  function renderTrackStep(shop) {
    var root = $('alat-root');
    if (!root) return;
    root.className = 'alat-page';
    _step = 3;
    var mine = _listings.slice(0, LIST_PREVIEW);
    if (!_trackSelected.length && mine.length) {
      _trackSelected = [0];
      _trackFocus = 0;
      // default-check top 2 peers for first product once loaded
      void peersForKeyword(shop, mine[0].keyword).then(function (rows) {
        rows.slice(0, 2).forEach(function (r) {
          _peerChecks[peerKey(0, r.shop_id)] = true;
        });
        paintTrackPeers(shop);
      });
    }
    if (_trackFocus < 0 && _trackSelected.length) _trackFocus = _trackSelected[0];

    var html = progressHtml(3, 'Pantau kompetitor') +
      '<section class="alat-card">' +
        '<p class="alat-kicker">Toko · ' + esc(shop.store_name) + '</p>' +
        '<h2>Pilih hingga ' + TRACK_MAX + ' produk</h2>' +
        '<p class="alat-lead">Ketuk kartu produkmu. Kompetitor di bawah mengikuti produk yang aktif. Geser ke samping kalau banyak.</p>' +
        '<div class="alat-pcard-rail" id="alat-mine-rail" role="list">' +
          mine.map(function (p, i) {
            return productCardHtml(p, i, {
              selected: _trackSelected.indexOf(i) >= 0,
              focused: i === _trackFocus,
            });
          }).join('') +
        '</div>' +
        '<p class="alat-hint" id="alat-sel-count">' + _trackSelected.length + ' / ' + TRACK_MAX + ' dipilih</p>' +
        '<div id="alat-peer-panel"></div>' +
        '<div class="alat-row alat-row-end">' +
          '<button type="button" class="btn-ghost" id="alat-skip-track">Lewati</button>' +
          '<button type="button" class="btn-primary" id="alat-confirm">Simpan &amp; lanjut</button>' +
        '</div>' +
      '</section>';
    root.innerHTML = html;
    wireTrackCards(shop, mine);
    paintTrackPeers(shop);
    $('alat-confirm')?.addEventListener('click', function () { void confirmTracks(shop, true); });
    $('alat-skip-track')?.addEventListener('click', function () {
      log('alat_tracks_skipped', {});
      renderAnalyzeStep(shop);
    });
  }

  function peerKey(mineIdx, shopId) {
    return String(mineIdx) + ':' + String(shopId);
  }

  function wireTrackCards(shop, mine) {
    var rail = $('alat-mine-rail');
    if (!rail) return;
    rail.querySelectorAll('[data-alat-pcard]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-alat-pcard'));
        var pos = _trackSelected.indexOf(idx);
        if (pos >= 0) {
          if (_trackFocus === idx) {
            // deselect focused
            _trackSelected.splice(pos, 1);
            _trackFocus = _trackSelected.length ? _trackSelected[_trackSelected.length - 1] : -1;
          } else {
            _trackFocus = idx;
          }
        } else {
          if (_trackSelected.length >= TRACK_MAX) {
            if (host && host.showToast) host.showToast('Maksimal ' + TRACK_MAX + ' produk.');
            return;
          }
          _trackSelected.push(idx);
          _trackFocus = idx;
        }
        refreshTrackRail(shop, mine);
        paintTrackPeers(shop);
      });
    });
  }

  function refreshTrackRail(shop, mine) {
    var rail = $('alat-mine-rail');
    if (!rail) return;
    rail.innerHTML = mine.map(function (p, i) {
      return productCardHtml(p, i, {
        selected: _trackSelected.indexOf(i) >= 0,
        focused: i === _trackFocus,
      });
    }).join('');
    wireTrackCards(shop, mine);
    var cnt = $('alat-sel-count');
    if (cnt) cnt.textContent = _trackSelected.length + ' / ' + TRACK_MAX + ' dipilih';
  }

  function paintTrackPeers(shop) {
    var panel = $('alat-peer-panel');
    if (!panel) return;
    if (_trackFocus < 0 || _trackSelected.indexOf(_trackFocus) < 0) {
      panel.innerHTML = '<p class="alat-hint">Pilih satu produk di atas untuk melihat kompetitor.</p>';
      return;
    }
    var mine = _listings[_trackFocus];
    if (!mine) {
      panel.innerHTML = '';
      return;
    }
    panel.innerHTML =
      '<h3 class="alat-h3">Kompetitor untuk “' + esc((mine.product_name || '').slice(0, 40)) + '”</h3>' +
      '<p class="alat-hint">Keyword: ' + esc(mine.keyword || '—') + ' · centang yang mau dipantau</p>' +
      '<div class="alat-list" id="alat-peers"><p class="alat-lead">Memuat kompetitor…</p></div>';
    void peersForKeyword(shop, mine.keyword).then(function (rows) {
      var box = $('alat-peers');
      if (!box) return;
      if (!rows.length) {
        box.innerHTML = '<p class="alat-hint">Belum ketemu kompetitor di keyword yang sama.</p>';
        return;
      }
      box.innerHTML = rows.map(function (r, i) {
        var key = peerKey(_trackFocus, r.shop_id);
        var checked = _peerChecks[key] ? ' checked' : '';
        return '<label class="alat-check">' +
          '<input type="checkbox" data-alat-peer-key="' + esc(key) + '" data-alat-peer-i="' + i + '"' + checked + '>' +
          (r.image_url ? '<img src="' + esc(r.image_url) + '" alt="">' : '<span class="alat-ph"></span>') +
          '<span><b>' + esc(r.store_name || ('Toko ' + r.shop_id)) + '</b>' +
          '<small>' + esc((r.product_name || '').slice(0, 56)) + ' · ' + fmtRp(r.price) +
          ' · ' + fmtN(r.total_sold) + ' terjual</small></span></label>';
      }).join('');
      box._rows = rows;
      box.querySelectorAll('input[data-alat-peer-key]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var k = inp.getAttribute('data-alat-peer-key');
          if (inp.checked) _peerChecks[k] = true;
          else delete _peerChecks[k];
        });
      });
    });
  }

  async function confirmTracks(shop, goNext) {
    if (!host) return;
    var btn = $('alat-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    var nProd = 0;
    var nToko = 0;
    var trackedShops = Object.create(null);
    for (var i = 0; i < _trackSelected.length; i++) {
      var p = _listings[_trackSelected[i]];
      if (!p) continue;
      var ok = await host.addTrackedProduct({
        item_id: p.item_id,
        shop_id: shop.shop_id,
        product_name: p.product_name,
        keyword: p.keyword,
        image_url: p.image_url,
        price: p.price,
        category: p.category,
        store_name: shop.store_name,
        total_sold: p.total_sold,
      });
      if (ok) nProd++;
    }
    var keys = Object.keys(_peerChecks);
    for (var j = 0; j < keys.length; j++) {
      if (!_peerChecks[keys[j]]) continue;
      var parts = keys[j].split(':');
      var mineIdx = Number(parts[0]);
      var shopId = Number(parts[1]);
      if (_trackSelected.indexOf(mineIdx) < 0) continue;
      if (trackedShops[shopId]) continue;
      var mine = _listings[mineIdx];
      var rows = mine ? await peersForKeyword(shop, mine.keyword) : [];
      var peer = rows.find(function (r) { return Number(r.shop_id) === shopId; });
      var st = await host.addTrackedStore(shopId, (peer && peer.store_name) || '');
      if (st && st.ok !== false) {
        trackedShops[shopId] = true;
        nToko++;
      }
    }
    log('alat_tracks_confirmed', { products: nProd, stores: nToko });
    syncTrackedFromSelection();
    if (host.showToast) host.showToast(nProd + ' listing dan ' + nToko + ' toko masuk pantauan.');
    if (goNext) renderAnalyzeStep(shop);
    else if (btn) { btn.disabled = false; btn.textContent = 'Simpan & lanjut'; }
  }

  function syncTrackedFromSelection() {
    _trackedIds = _trackSelected.map(function (i) {
      return _listings[i] && String(_listings[i].item_id);
    }).filter(Boolean).slice(0, TRACK_MAX);
    persistProfile();
  }

  async function prepareAudits(shop, listings) {
    var targets = _trackSelected.length
      ? _trackSelected.map(function (i) { return listings[i]; }).filter(Boolean)
      : listings.slice(0, 6);
    _audits = [];
    _auditsByItem = Object.create(null);
    for (var i = 0; i < targets.length; i++) {
      var mine = targets[i];
      if (!mine) continue;
      var pos = await fetchCompetitivePosition(mine.keyword, shop.shop_id, mine.item_id);
      var peers = await peersForKeyword(shop, mine.keyword);
      var entry = { keyword: mine.keyword, mine: mine, pos: pos, peers: peers.slice(0, 3) };
      _audits.push(entry);
      _auditsByItem[String(mine.item_id)] = entry;
    }
  }

  function titleKeywordScore(name, keyword) {
    var n = String(name || '').toLowerCase();
    var parts = String(keyword || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.length || !n) return { hit: 0, total: 0, missing: [] };
    var missing = [];
    var hit = 0;
    parts.forEach(function (w) {
      if (n.indexOf(w) >= 0) hit++;
      else missing.push(w);
    });
    return { hit: hit, total: parts.length, missing: missing };
  }

  function buildInsights(a) {
    var p = a.pos || {};
    var mine = a.mine || {};
    var out = [];
    if (p.found && p.my_price != null && p.median_price != null) {
      var delta = Number(p.my_price) - Number(p.median_price);
      var pct = Number(p.median_price) ? Math.round((delta / Number(p.median_price)) * 100) : 0;
      if (Math.abs(pct) < 5) {
        out.push({ tone: 'ok', label: 'Harga', text: 'Harga kamu dekat median pasar (' + fmtRp(p.median_price) + ').' });
      } else if (pct > 0) {
        out.push({ tone: 'warn', label: 'Harga', text: 'Harga kamu ~' + pct + '% di atas median (' + fmtRp(p.my_price) + ' vs ' + fmtRp(p.median_price) + '). Cek apakah nilai / bundling cukup jelas.' });
      } else {
        out.push({ tone: 'ok', label: 'Harga', text: 'Harga kamu ~' + Math.abs(pct) + '% di bawah median. Pastikan margin dan biaya iklan masih masuk.' });
      }
    } else if (mine.price != null) {
      out.push({ tone: 'mute', label: 'Harga', text: 'Harga listing ' + fmtRp(mine.price) + '. Bandingkan dengan 2–3 kompetitor di keyword yang sama.' });
    }
    if (p.found && p.my_rank != null) {
      out.push({
        tone: p.my_rank <= 10 ? 'ok' : 'warn',
        label: 'Penjualan vs pasar',
        text: 'Peringkat terjual #' + p.my_rank + ' dari ' + (p.total_sellers || '—') + ' listing' +
          (p.market_share != null ? ' · pangsa ~' + p.market_share + '%' : '') +
          (p.my_sold != null ? ' · terjual ' + fmtN(p.my_sold) : '') + '.',
      });
    }
    var tk = titleKeywordScore(mine.product_name || p.my_name, a.keyword);
    if (tk.total) {
      if (tk.missing.length === 0) {
        out.push({ tone: 'ok', label: 'Keyword', text: 'Judul sudah memuat kata kunci “' + a.keyword + '”.' });
      } else {
        out.push({
          tone: 'warn',
          label: 'Keyword',
          text: 'Judul belum memuat: ' + tk.missing.map(function (w) { return '“' + w + '”'; }).join(', ') +
            '. Tambahkan di judul (bukan spam) supaya lebih cocok dengan pencarian pembeli.',
        });
      }
    }
    var peers = a.peers || [];
    if (peers.length) {
      var lines = peers.slice(0, 3).map(function (r) {
        return (r.store_name || 'Toko') + ' · ' + fmtRp(r.price) + ' · ' + fmtN(r.total_sold) + ' terjual';
      });
      out.push({
        tone: 'mute',
        label: 'Kompetitor serupa',
        text: lines.join(' · '),
      });
    }
    return out;
  }

  function buildSuggestions(a) {
    var insights = buildInsights(a);
    var mine = a.mine || {};
    var suggestions = [];
    insights.forEach(function (ins) {
      if (ins.tone === 'warn') {
        if (ins.label === 'Harga') {
          suggestions.push({
            title: 'Sesuaikan harga',
            text: ins.text,
            action: 'Cek 2–3 kompetitor teratas, lalu uji harga ±5–10% selama 1 minggu.',
          });
        } else if (ins.label === 'Keyword') {
          suggestions.push({
            title: 'Perkuat judul & keyword',
            text: ins.text,
            action: 'Masukkan kata kunci pencarian di judul tanpa spam — satu frasa utama di depan.',
          });
        } else if (ins.label.indexOf('Penjualan') === 0) {
          suggestions.push({
            title: 'Naikkan daya saing listing',
            text: ins.text,
            action: 'Perbaiki foto utama, bundling, dan gratis ongkir jika kompetitor di atas sudah memakainya.',
          });
        } else {
          suggestions.push({ title: ins.label, text: ins.text, action: 'Tinjau listing dan bandingkan dengan kompetitor di keyword yang sama.' });
        }
      } else if (ins.tone === 'ok') {
        suggestions.push({
          title: 'Pertahankan: ' + ins.label.toLowerCase(),
          text: ins.text,
          action: 'Jaga kualitas listing; pantau kompetitor kalau mereka potong harga.',
        });
      }
    });
    if (!suggestions.length) {
      suggestions.push({
        title: 'Pantau kompetitor rutin',
        text: 'Data untuk “' + (mine.product_name || a.keyword || 'produk ini') + '” masih tipis.',
        action: 'Simpan produk & 2 toko peer ke Favorit supaya kami bisa kabari perubahan.',
      });
    }
    return suggestions.slice(0, 4);
  }

  function analyzeProducts() {
    if (_trackSelected.length) {
      return _trackSelected.map(function (i) { return { idx: i, p: _listings[i] }; }).filter(function (x) { return x.p; });
    }
    return _listings.slice(0, Math.min(6, TRACK_MAX)).map(function (p, i) { return { idx: i, p: p }; });
  }

  function renderAnalyzeStep(shop) {
    var root = $('alat-root');
    if (!root) return;
    root.className = 'alat-page';
    _step = 4;
    var products = analyzeProducts();
    root.innerHTML =
      progressHtml(4, 'Analisis listing') +
      '<section class="alat-card alat-analyze-card">' +
        '<p class="alat-kicker">Analisis Laris · ' + esc(shop.store_name) + '</p>' +
        '<h2>Menganalisis produkmu</h2>' +
        '<p class="alat-lead">Kami bandingkan harga, keyword, dan penjualan kompetitor dari data sapuan.</p>' +
        '<div id="alat-think-host" class="alat-think-host"></div>' +
        '<div id="alat-suggest-host" class="alat-suggest-host" hidden></div>' +
        '<div class="alat-row alat-row-end" id="alat-analyze-actions" hidden style="margin-top:20px">' +
          '<button type="button" class="btn-ghost" id="alat-back-track">Kembali</button>' +
          '<button type="button" class="btn-primary" id="alat-finish">Selesai</button>' +
        '</div>' +
      '</section>';
    $('alat-back-track')?.addEventListener('click', function () { renderTrackStep(shop); });
    $('alat-finish')?.addEventListener('click', function () {
      log('alat_analyze_done', { products: products.length });
      finishAuditWizard();
    });
    void runAnalyzeThinking(shop, products);
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function runAnalyzeThinking(shop, products) {
    var hostEl = $('alat-think-host');
    if (!hostEl) return;
    var steps = [
      'Membaca listing toko kamu',
      'Membandingkan harga vs pasar',
      'Cek keyword di judul',
      'Menyusun saran tindakan',
    ];
    hostEl.innerHTML =
      '<details class="ai-think agent-think" open>' +
        '<summary>Proses berpikir</summary>' +
        '<div id="alat-think-trace" class="agent-wait">Memulai analisis…</div>' +
      '</details>' +
      '<ol class="agent-plan" id="alat-think-plan">' +
        steps.map(function (t, i) {
          return '<li class="agent-step" data-state="pending" data-alat-step="' + i + '">' +
            '<div class="agent-step-head">' +
              '<span class="agent-step-mark"><i class="agent-step-spin"></i></span>' +
              '<span class="agent-step-label">' + esc(t) + '</span>' +
              '<span class="agent-step-count">' + (i + 1) + '/' + steps.length + '</span>' +
            '</div>' +
          '</li>';
        }).join('') +
      '</ol>';

    var trace = $('alat-think-trace');
    var thinkLines = [
      'Mengambil ' + products.length + ' produk yang dipilih…',
      'Melihat median harga dan peringkat terjual di keyword masing-masing…',
      'Mencocokkan kata kunci di judul listing…',
      'Menyusun saran yang bisa langsung dicoba…',
    ];

    function setStep(i, state) {
      var li = hostEl.querySelector('[data-alat-step="' + i + '"]');
      if (!li) return;
      li.setAttribute('data-state', state);
      if (state === 'active') li.setAttribute('data-open', '1');
    }

    // Kick off data fetch in parallel with the staged thinking UI.
    var dataPromise = prepareAudits(shop, _listings);

    for (var i = 0; i < steps.length; i++) {
      setStep(i, 'running');
      if (trace) trace.textContent = thinkLines[i];
      await sleep(650 + Math.min(i, 2) * 200);
      // Ensure data is ready before the last step finishes.
      if (i === steps.length - 2) await dataPromise;
      setStep(i, 'done');
    }
    await dataPromise;

    var details = hostEl.querySelector('.ai-think');
    if (details) details.open = false;
    if (trace) {
      trace.classList.remove('agent-wait');
      trace.textContent = 'Selesai. Berikut saran berdasarkan data sapuan.';
    }
    hostEl.querySelector('.agent-plan')?.setAttribute('data-done', '1');

    renderSuggestions(shop, products);
  }

  function renderSuggestions(shop, products) {
    var suggest = $('alat-suggest-host');
    var actions = $('alat-analyze-actions');
    if (!suggest) return;
    suggest.hidden = false;
    if (actions) actions.hidden = false;

    if (!products.length) {
      suggest.innerHTML = '<p class="alat-hint">Belum ada produk untuk dianalisis. Kembali dan pilih listing.</p>';
      return;
    }

    var html = '<h3 class="alat-h3">Saran untuk toko kamu</h3>';
    products.forEach(function (x) {
      var a = _auditsByItem[String(x.p.item_id)] || {
        keyword: x.p.keyword,
        mine: x.p,
        pos: {},
        peers: [],
      };
      var suggestions = buildSuggestions(a);
      html +=
        '<article class="alat-suggest-block">' +
          '<div class="alat-suggest-head">' +
            (x.p.image_url
              ? '<img src="' + esc(x.p.image_url) + '" alt="">'
              : '<span class="alat-ph"></span>') +
            '<div>' +
              '<b>' + esc((x.p.product_name || '').slice(0, 64)) + '</b>' +
              '<small>' + esc(x.p.keyword || '') + ' · ' + fmtRp(x.p.price) + '</small>' +
            '</div>' +
          '</div>' +
          '<ul class="alat-suggest-list">' +
            suggestions.map(function (s) {
              return '<li>' +
                '<b>' + esc(s.title) + '</b>' +
                '<span>' + esc(s.text) + '</span>' +
                '<em>' + esc(s.action) + '</em>' +
              '</li>';
            }).join('') +
          '</ul>' +
        '</article>';
    });
    suggest.innerHTML = html;
  }

  function finishAuditWizard() {
    markWizardDone();
    syncTrackedFromSelection();
    exitFocus();
    openSellerCenter();
    if (!user()) {
      showSignupCta();
    }
  }

  function openSellerCenter() {
    setIntent('existing');
    exitFocus();
    if (host && host.setView) host.setView('audit');
    var shop = rememberedShop();
    if (!shop || !shop.shop_id) {
      renderConnect();
      return;
    }
    void loadShopWork(shop, { center: true });
  }

  function storeStats() {
    var n = _listings.length;
    var sold = 0;
    var revSum = 0;
    var revN = 0;
    var rateSum = 0;
    var rateN = 0;
    _listings.forEach(function (p) {
      sold += Number(p.total_sold) || 0;
      var r = Number(p.reviews);
      if (Number.isFinite(r) && r > 0) { revSum += r; revN++; }
      var rt = Number(p.rating);
      if (Number.isFinite(rt) && rt > 0) { rateSum += rt; rateN++; }
    });
    return {
      n: n,
      sold: sold,
      reviews: revSum,
      rating: rateN ? (rateSum / rateN) : null,
      metaN: _shopMeta && (_shopMeta.n_listings || _shopMeta.n_products),
    };
  }

  function renderSellerCenter(shop) {
    var root = $('alat-root');
    if (!root) return;
    root.className = 'alat-page alat-page--wide';
    exitFocus();
    syncNavLabels();
    var st = storeStats();
    var trackedSet = Object.create(null);
    _trackedIds.forEach(function (id) { trackedSet[String(id)] = true; });
    _trackSelected = [];
    _listings.forEach(function (p, i) {
      if (trackedSet[String(p.item_id)] && _trackSelected.length < TRACK_MAX) {
        _trackSelected.push(i);
      }
    });
    if (_selectedIdx >= _listings.length) _selectedIdx = -1;

    var ratingTxt = st.rating != null ? st.rating.toFixed(1).replace('.', ',') : '—';
    var loc = (_shopMeta && _shopMeta.location) || '';
    var logoImg = _shopLogo
      ? '<img class="myt-logo-img" src="' + esc(thumb(_shopLogo)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">'
      : (_listings[0] && _listings[0].image_url
        ? '<img class="myt-logo-img" src="' + esc(thumb(_listings[0].image_url)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">'
        : '');
    var cards = _listings.slice(0, LIST_PREVIEW).map(function (p, i) {
      var on = !!trackedSet[String(p.item_id)];
      var sel = i === _selectedIdx;
      var rate = Number(p.rating) > 0 ? String(Number(p.rating).toFixed(1)).replace('.', ',') : '—';
      return (
        '<button type="button" class="myt-pcard' + (sel ? ' is-selected' : '') + (on ? ' is-tracked' : '') + '" data-myt-card="' + i + '">' +
          '<div class="myt-pcard-img">' +
            (p.image_url
              ? '<img src="' + esc(thumb(p.image_url)) + '" alt="" loading="lazy">'
              : '<span class="alat-ph"></span>') +
            (on ? '<span class="myt-pcard-badge">Dipantau</span>'
              : (p.from_snapshot ? '<span class="myt-pcard-badge is-snap">Snapshot</span>' : '')) +
          '</div>' +
          '<div class="myt-pcard-body">' +
            '<b>' + esc((p.product_name || '').slice(0, 56)) + '</b>' +
            '<span class="myt-pcard-price">' + fmtRp(p.price) + '</span>' +
            '<span class="myt-pcard-meta">' + fmtN(p.total_sold) + ' terjual · ★ ' + rate + '</span>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    root.innerHTML =
      '<div class="myt-center">' +
        '<header class="myt-store">' +
          '<div class="myt-store-id">' +
            '<div class="myt-logo" aria-hidden="true">' +
              '<span class="myt-logo-txt">' + esc(shopInitials(shop.store_name)) + '</span>' +
              logoImg +
            '</div>' +
            '<div class="myt-store-text">' +
              '<p class="alat-kicker">My Toko</p>' +
              '<h2>' + esc(shop.store_name || ('Toko ' + shop.shop_id)) + '</h2>' +
              '<p class="myt-store-sub">' +
                (loc ? esc(loc) + ' · ' : '') +
                'Shop ID ' + esc(String(shop.shop_id)) +
                ' · 1 toko per akun' +
                (anySnapshotListing() ? ' · Snapshot halaman' : '') +
              '</p>' +
            '</div>' +
          '</div>' +
          '<div class="myt-store-stats" aria-label="Ringkasan toko">' +
            '<div><b>' + fmtN(st.metaN || st.n) + '</b><span>Produk</span></div>' +
            '<div><b>' + fmtN(st.sold) + '</b><span>Terjual</span></div>' +
            '<div><b>' + ratingTxt + '</b><span>Penilaian</span></div>' +
            '<div><b>' + fmtN(st.reviews) + '</b><span>Ulasan</span></div>' +
          '</div>' +
        '</header>' +

        '<section class="myt-products-sec">' +
          '<div class="myt-sec-head">' +
            '<div>' +
              '<h3 class="alat-h3" style="margin:0">Produk toko</h3>' +
              '<p class="alat-hint" id="myt-track-count" style="margin:4px 0 0">' +
                _trackedIds.length + ' / ' + TRACK_MAX + ' dipantau · ketuk kartu untuk detail' +
                (anySnapshotListing() ? ' · angka snapshot dari halaman Shopee, bukan sapuan mingguan' : '') +
              '</p>' +
            '</div>' +
          '</div>' +
          '<div class="myt-pcard-grid" id="myt-pcard-grid">' +
            (cards || '<p class="alat-hint">Belum ada listing di sapuan kami.</p>') +
          '</div>' +
          '<div id="myt-detail" class="myt-detail" ' + (_selectedIdx < 0 ? 'hidden' : '') + '></div>' +
        '</section>' +

        '<section class="alat-card">' +
          '<h3 class="alat-h3" style="margin-top:0">Ganti toko</h3>' +
          '<p class="alat-lead">Hanya 1 toko. Mengganti URL menggantikan toko yang sekarang — pantauan produk toko lama dihapus.</p>' +
          '<label class="alat-label" for="myt-swap-q">Link / nama toko baru</label>' +
          '<div class="alat-row">' +
            '<input type="text" id="myt-swap-q" class="alat-input" placeholder="shopee.co.id/shop/… atau nama toko" autocomplete="off">' +
            '<button type="button" class="btn-primary" id="myt-swap-go">Ganti toko</button>' +
          '</div>' +
          '<p class="alat-err" id="myt-swap-err" hidden></p>' +
          '<div id="myt-swap-picker" class="alat-picker" hidden></div>' +
        '</section>' +

        '<section class="alat-card myt-alerts">' +
          '<h3 class="alat-h3" style="margin-top:0">Kabar harian kompetitor</h3>' +
          '<p class="alat-lead">Opsional. Kami kirim ringkasan perubahan harga / promo kompetitor di keyword produk yang kamu pantau.</p>' +
          '<div class="myt-alert-channels">' +
            '<label class="myt-alert-card' + (_alerts.email ? ' is-on' : '') + '">' +
              '<input type="checkbox" id="myt-alert-email"' + (_alerts.email ? ' checked' : '') + '>' +
              '<span><b>Email</b><small>Ke email akun LarisID</small></span>' +
            '</label>' +
            '<label class="myt-alert-card' + (_alerts.wa ? ' is-on' : '') + '">' +
              '<input type="checkbox" id="myt-alert-wa"' + (_alerts.wa ? ' checked' : '') + '>' +
              '<span><b>WhatsApp</b><small>Pesan harian singkat</small></span>' +
            '</label>' +
          '</div>' +
          '<div class="alat-row" id="myt-wa-row"' + (_alerts.wa ? '' : ' hidden') + ' style="margin-top:12px">' +
            '<label class="alat-label" for="myt-wa-num" style="width:100%;margin:0">Nomor WhatsApp</label>' +
            '<input type="tel" id="myt-wa-num" class="alat-input" inputmode="tel" placeholder="0812xxxxxxxx" value="' + esc(_alerts.wa_number || '') + '">' +
          '</div>' +
          '<fieldset class="myt-cadence">' +
            '<legend>Frekuensi</legend>' +
            '<label><input type="radio" name="myt-cadence" value="daily"' +
              (_alerts.cadence !== 'weekly' ? ' checked' : '') + '> Setiap hari</label>' +
            '<label><input type="radio" name="myt-cadence" value="weekly"' +
              (_alerts.cadence === 'weekly' ? ' checked' : '') + '> Sekali seminggu</label>' +
          '</fieldset>' +
          '<div class="alat-row alat-row-end">' +
            '<button type="button" class="btn-primary" id="myt-alert-save">Simpan preferensi kabar</button>' +
          '</div>' +
          '<p class="alat-hint" id="myt-alert-msg" hidden></p>' +
        '</section>' +
      '</div>';

    wireSellerCenter(shop);
    if (_selectedIdx >= 0) paintProductDetail(shop);
    // Late logo paint if fetch finishes after first paint.
    if (!_shopLogo) {
      void fetchShopLogo(shop.shop_id).then(function (url) {
        if (!url || _shop !== shop) return;
        _shopLogo = url;
        var box = document.querySelector('.myt-logo');
        if (!box || box.querySelector('.myt-logo-img')) return;
        var img = document.createElement('img');
        img.className = 'myt-logo-img';
        img.src = thumb(url);
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = function () { img.remove(); };
        box.appendChild(img);
      });
    }
  }

  function wireSellerCenter(shop) {
    var countEl = $('myt-track-count');
    function refreshCount() {
      if (countEl) {
        countEl.textContent = _trackedIds.length + ' / ' + TRACK_MAX + ' dipantau · ketuk kartu untuk detail';
      }
    }

    document.querySelectorAll('[data-myt-card]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-myt-card'));
        if (_selectedIdx === idx) {
          // Toggle off
          _selectedIdx = -1;
          document.querySelectorAll('.myt-pcard').forEach(function (el) { el.classList.remove('is-selected'); });
          var det = $('myt-detail');
          if (det) { det.hidden = true; det.innerHTML = ''; }
          return;
        }
        _selectedIdx = idx;
        _detailTab = 'kompetitor';
        document.querySelectorAll('.myt-pcard').forEach(function (el) {
          el.classList.toggle('is-selected', Number(el.getAttribute('data-myt-card')) === idx);
        });
        paintProductDetail(shop);
        log('alat_myt_select_product', { item_id: _listings[idx] && _listings[idx].item_id });
      });
    });

    $('myt-swap-go')?.addEventListener('click', function () { void swapShop(); });
    $('myt-swap-q')?.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); void swapShop(); }
    });

    var waRow = $('myt-wa-row');
    $('myt-alert-wa')?.addEventListener('change', function () {
      if (waRow) waRow.hidden = !$('myt-alert-wa').checked;
      $('myt-alert-wa')?.closest('.myt-alert-card')?.classList.toggle('is-on', $('myt-alert-wa').checked);
    });
    $('myt-alert-email')?.addEventListener('change', function () {
      $('myt-alert-email')?.closest('.myt-alert-card')?.classList.toggle('is-on', $('myt-alert-email').checked);
    });
    $('myt-alert-save')?.addEventListener('click', function () {
      _alerts.email = !!$('myt-alert-email')?.checked;
      _alerts.wa = !!$('myt-alert-wa')?.checked;
      _alerts.wa_number = String($('myt-wa-num')?.value || '').trim();
      var cad = document.querySelector('input[name="myt-cadence"]:checked');
      _alerts.cadence = cad && cad.value === 'weekly' ? 'weekly' : 'daily';
      if (_alerts.wa && !_alerts.wa_number) {
        var msg = $('myt-alert-msg');
        if (msg) { msg.hidden = false; msg.textContent = 'Isi nomor WhatsApp dulu.'; msg.className = 'alat-err'; }
        return;
      }
      persistProfile();
      log('alat_myt_alerts_save', {
        email: _alerts.email,
        wa: _alerts.wa,
        cadence: _alerts.cadence,
      });
      var ok = $('myt-alert-msg');
      if (ok) {
        ok.hidden = false;
        ok.className = 'alat-hint';
        ok.textContent = 'Preferensi kabar disimpan' +
          (_alerts.email || _alerts.wa
            ? ' — kami akan kirim ringkasan kompetitor ' + (_alerts.cadence === 'weekly' ? 'mingguan' : 'harian') + '.'
            : ' (tidak ada saluran aktif).');
      }
      if (host && host.showToast) host.showToast('Preferensi kabar disimpan.');
    });

    wireSellerCenter._refreshCount = refreshCount;
  }

  function paintProductDetail(shop) {
    var det = $('myt-detail');
    if (!det) return;
    var p = _listings[_selectedIdx];
    if (!p) {
      det.hidden = true;
      det.innerHTML = '';
      return;
    }
    det.hidden = false;
    var tracked = _trackedIds.indexOf(String(p.item_id)) >= 0;
    det.innerHTML =
      '<div class="myt-detail-head">' +
        (p.image_url ? '<img src="' + esc(thumb(p.image_url)) + '" alt="">' : '<span class="alat-ph"></span>') +
        '<div>' +
          '<b>' + esc((p.product_name || '').slice(0, 72)) + '</b>' +
          '<small>' + esc(p.keyword || '') + ' · ' + fmtRp(p.price) + ' · ' + fmtN(p.total_sold) + ' terjual' +
            (p.from_snapshot ? ' · snapshot halaman' : '') + '</small>' +
        '</div>' +
        '<button type="button" class="btn-primary myt-track-btn' + (tracked ? ' is-on' : '') + '" id="myt-track-one">' +
          (tracked ? '✓ Dipantau' : 'Pantau produk') +
        '</button>' +
      '</div>' +
      '<div class="myt-tabs" role="tablist">' +
        '<button type="button" role="tab" class="myt-tab' + (_detailTab === 'kompetitor' ? ' is-on' : '') + '" data-myt-tab="kompetitor" aria-selected="' + (_detailTab === 'kompetitor') + '">Kompetitor</button>' +
        '<button type="button" role="tab" class="myt-tab' + (_detailTab === 'analisa' ? ' is-on' : '') + '" data-myt-tab="analisa" aria-selected="' + (_detailTab === 'analisa') + '">Analisa</button>' +
      '</div>' +
      '<div class="myt-tab-panel" id="myt-tab-panel"></div>';

    det.querySelectorAll('[data-myt-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        _detailTab = tab.getAttribute('data-myt-tab') || 'kompetitor';
        paintProductDetail(shop);
      });
    });
    $('myt-track-one')?.addEventListener('click', function () {
      toggleTrackProduct(shop, _selectedIdx);
      paintProductDetail(shop);
      // Refresh card badge
      var card = document.querySelector('[data-myt-card="' + _selectedIdx + '"]');
      if (card) {
        var on = _trackedIds.indexOf(String(p.item_id)) >= 0;
        card.classList.toggle('is-tracked', on);
        var badge = card.querySelector('.myt-pcard-badge');
        if (on && !badge) {
          var wrap = card.querySelector('.myt-pcard-img');
          if (wrap) wrap.insertAdjacentHTML('beforeend', '<span class="myt-pcard-badge">Dipantau</span>');
        } else if (!on && badge) badge.remove();
      }
      if (wireSellerCenter._refreshCount) wireSellerCenter._refreshCount();
    });

    var panel = $('myt-tab-panel');
    if (_detailTab === 'analisa') {
      void fillAnalisaTab(shop, panel, _selectedIdx);
    } else {
      void fillKompetitorTab(shop, panel, _selectedIdx);
    }
    det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function toggleTrackProduct(shop, idx) {
    var p = _listings[idx];
    if (!p) return;
    var id = String(p.item_id);
    var pos = _trackedIds.indexOf(id);
    if (pos >= 0) {
      _trackedIds.splice(pos, 1);
      persistProfile();
      log('alat_myt_track_toggle', { on: false, item_id: p.item_id });
      return;
    }
    if (_trackedIds.length >= TRACK_MAX) {
      if (host && host.showToast) host.showToast('Maksimal ' + TRACK_MAX + ' produk.');
      return;
    }
    _trackedIds.push(id);
    persistProfile();
    if (host && host.addTrackedProduct) {
      void host.addTrackedProduct({
        item_id: p.item_id,
        shop_id: shop.shop_id,
        product_name: p.product_name,
        keyword: p.keyword,
        image_url: p.image_url,
        price: p.price,
        category: p.category,
        store_name: shop.store_name,
        total_sold: p.total_sold,
      });
    }
    log('alat_myt_track_toggle', { on: true, item_id: p.item_id });
  }

  async function fillKompetitorTab(shop, panel, idx) {
    if (!panel) return;
    var mine = _listings[idx];
    if (!mine) { panel.innerHTML = ''; return; }
    if (!mine.keyword) {
      panel.innerHTML = '<p class="alat-hint">Belum ada pasar sejenis di sapuan kami untuk judul ini.</p>';
      return;
    }
    panel.innerHTML = '<p class="alat-lead agent-wait">Memuat kompetitor di keyword “' + esc(mine.keyword || '') + '”…</p>';
    var rows = await peersForKeyword(shop, mine.keyword);
    if (_selectedIdx !== idx || _detailTab !== 'kompetitor') return;
    if (!rows.length) {
      panel.innerHTML = '<p class="alat-hint">Belum ada pasar sejenis di sapuan kami untuk judul ini.</p>';
      return;
    }
    panel.innerHTML =
      '<p class="alat-hint" style="margin-top:0">Centang toko peer untuk dipantau (masuk Product Tracker).</p>' +
      '<div class="alat-list" id="myt-peers">' +
        rows.map(function (r, i) {
          var key = peerKey(idx, r.shop_id);
          var checked = _peerChecks[key] ? ' checked' : '';
          return '<label class="alat-check">' +
            '<input type="checkbox" data-myt-peer-key="' + esc(key) + '" data-myt-peer-i="' + i + '"' + checked + '>' +
            (r.image_url ? '<img src="' + esc(thumb(r.image_url)) + '" alt="">' : '<span class="alat-ph"></span>') +
            '<span><b>' + esc(r.store_name || ('Toko ' + r.shop_id)) + '</b>' +
            '<small>' + esc((r.product_name || '').slice(0, 56)) + ' · ' + fmtRp(r.price) +
            ' · ' + fmtN(r.total_sold) + ' terjual</small></span></label>';
        }).join('') +
      '</div>' +
      '<div class="alat-row alat-row-end" style="margin-top:12px">' +
        '<button type="button" class="btn-primary" id="myt-save-peers">Simpan pantauan kompetitor</button>' +
      '</div>';
    panel.querySelectorAll('input[data-myt-peer-key]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var k = inp.getAttribute('data-myt-peer-key');
        if (inp.checked) _peerChecks[k] = true;
        else delete _peerChecks[k];
      });
    });
    $('myt-save-peers')?.addEventListener('click', function () {
      void saveSelectedPeers(shop, idx, rows);
    });
  }

  async function saveSelectedPeers(shop, idx, rows) {
    if (!host || !host.addTrackedStore) return;
    var n = 0;
    var seen = Object.create(null);
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var key = peerKey(idx, r.shop_id);
      if (!_peerChecks[key] || seen[r.shop_id]) continue;
      seen[r.shop_id] = true;
      var st = await host.addTrackedStore(r.shop_id, r.store_name || '');
      if (st && st.ok !== false) n++;
    }
    // Also ensure the product itself is tracked.
    toggleTrackProductEnsureOn(shop, idx);
    if (host.showToast) host.showToast(n + ' toko kompetitor dipantau.');
    log('alat_myt_peers_saved', { n: n });
    paintProductDetail(shop);
  }

  function toggleTrackProductEnsureOn(shop, idx) {
    var p = _listings[idx];
    if (!p) return;
    if (_trackedIds.indexOf(String(p.item_id)) < 0) toggleTrackProduct(shop, idx);
  }

  async function fillAnalisaTab(shop, panel, idx) {
    if (!panel) return;
    var mine = _listings[idx];
    if (!mine) { panel.innerHTML = ''; return; }
    if (!String(mine.keyword || '').trim()) {
      panel.innerHTML =
        '<h3 class="alat-h3" style="margin-top:0">Ringkasan posisi</h3>' +
        '<p class="alat-hint">Harga listing ' + fmtRp(mine.price) +
        '. Belum ada pasar sejenis di sapuan kami untuk judul ini — Analisa kompetitor muncul setelah keyword cocok.</p>';
      return;
    }
    panel.innerHTML =
      '<details class="ai-think agent-think" open>' +
        '<summary>Proses berpikir</summary>' +
        '<div class="agent-wait">Membandingkan harga, keyword, dan penjualan kompetitor…</div>' +
      '</details>';
    _trackSelected = [idx];
    await prepareAudits(shop, _listings);
    if (_selectedIdx !== idx || _detailTab !== 'analisa') return;

    var a = _auditsByItem[String(mine.item_id)] || {
      keyword: mine.keyword, mine: mine, pos: {}, peers: [],
    };
    var pos = a.pos || {};
    var suggestions = buildSuggestions(a);
    var breakdown =
      '<div class="myt-break">' +
        '<div class="myt-break-item"><span>Peringkat di keyword</span><b>' +
          (pos.found ? ('#' + pos.my_rank + ' / ' + pos.total_sellers) : '—') + '</b></div>' +
        '<div class="myt-break-item"><span>Harga kamu</span><b>' + fmtRp(pos.my_price || mine.price) + '</b></div>' +
        '<div class="myt-break-item"><span>Median pasar</span><b>' + fmtRp(pos.median_price) + '</b></div>' +
        '<div class="myt-break-item"><span>Share (perkiraan)</span><b>' +
          (pos.market_share != null ? (String(pos.market_share).replace('.', ',') + '%') : '—') + '</b></div>' +
        '<div class="myt-break-item"><span>Ulasan kamu</span><b>' + fmtN(pos.my_reviews || mine.reviews) + '</b></div>' +
        '<div class="myt-break-item"><span>Ulasan top 3</span><b>' + fmtN(pos.top3_reviews) + '</b></div>' +
      '</div>';

    var think = panel.querySelector('.ai-think');
    if (think) think.open = false;
    panel.innerHTML =
      '<h3 class="alat-h3" style="margin-top:0">Ringkasan posisi</h3>' +
      breakdown +
      '<h3 class="alat-h3">Saran tindakan</h3>' +
      '<ul class="alat-suggest-list">' +
        suggestions.map(function (s) {
          return '<li><b>' + esc(s.title) + '</b><span>' + esc(s.text) + '</span><em>' + esc(s.action) + '</em></li>';
        }).join('') +
      '</ul>';
    log('alat_myt_analyze', { n: 1, item_id: mine.item_id });
  }

  async function runCenterAnalyze(shop, idxs) {
    if (!idxs || !idxs.length) return;
    _selectedIdx = idxs[0];
    _detailTab = 'analisa';
    paintProductDetail(shop);
  }

  async function swapShop() {
    var err = $('myt-swap-err');
    function showSwapErr(msg) {
      if (!err) return;
      err.hidden = !msg;
      err.textContent = msg || '';
    }
    var parsed = parseShopInput($('myt-swap-q')?.value);
    if (!parsed) { showSwapErr('Masukkan nama toko atau link Shopee.'); return; }
    showSwapErr('');
    var go = $('myt-swap-go');
    if (go) { go.disabled = true; go.textContent = 'Mencari…'; }
    try {
      var hit = null;
      if (parsed.shopId) {
        hit = await lookupShopId(parsed.shopId);
        if (!hit) {
          showSwapErr('Toko dari link itu belum ada di database LarisID.');
          return;
        }
        await applySwapShop(hit);
        return;
      }
      var rows = await findShopsByName(parsed.q, 8);
      if (!rows.length) {
        showSwapErr('Toko belum ketemu di data kami. Coba nama lebih pendek atau tempel link.');
        return;
      }
      var exact = rows.filter(function (r) { return r.match_kind === 'exact'; });
      if (exact.length === 1) { await applySwapShop(exact[0]); return; }
      var box = $('myt-swap-picker');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = rows.map(function (r, i) {
        var meta = [fmtN(r.n_listings || r.n_products) + ' listing', r.location || ''].filter(Boolean).join(' · ');
        return '<button type="button" class="alat-pick" data-myt-swap="' + i + '">' +
          '<span class="alat-pick-name">' + esc(r.store_name || ('Toko ' + r.shop_id)) + '</span>' +
          '<span class="alat-pick-meta">' + esc(meta) + '</span></button>';
      }).join('');
      box._rows = rows;
      box.querySelectorAll('[data-myt-swap]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var row = box._rows[Number(btn.getAttribute('data-myt-swap'))];
          if (row) void applySwapShop(row);
        });
      });
    } finally {
      if (go) { go.disabled = false; go.textContent = 'Ganti toko'; }
    }
  }

  async function applySwapShop(row) {
    _trackedIds = [];
    _trackSelected = [];
    _selectedIdx = -1;
    _shopLogo = '';
    _listings = [];
    _peersByKw = Object.create(null);
    _claimSnapId = '';
    _wizardDone = true; // stay on seller center after swap
    var shop = {
      shop_id: row.shop_id,
      store_name: row.store_name || ('Toko ' + row.shop_id),
    };
    rememberShop(shop);
    await saveStoreProfile(shop);
    log('alat_myt_swap_shop', { shop_id: shop.shop_id });
    if (host && host.showToast) host.showToast('Toko diganti. Hanya 1 toko aktif.');
    await loadShopWork(shop, { center: true, freshListings: true });
  }

  function showSignupCta() {
    var existing = document.getElementById('alat-signup-cta');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'alat-signup-cta';
    el.className = 'alat-signup-cta';
    el.innerHTML =
      '<div class="alat-signup-cta-card" role="dialog" aria-labelledby="alat-signup-title">' +
        '<p class="alat-kicker">Hampir selesai</p>' +
        '<h2 id="alat-signup-title">Daftar gratis untuk simpan My Toko</h2>' +
        '<p class="alat-lead">Pantau kompetitor, dapatkan kabar harian, dan lanjut riset di Cari Produk — tanpa kartu kredit.</p>' +
        '<div class="alat-row alat-row-end">' +
          '<button type="button" class="btn-ghost" id="alat-signup-later">Nanti saja</button>' +
          '<button type="button" class="btn-primary" id="alat-signup-go">Daftar Gratis</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) dismissSignupCta();
    });
    $('alat-signup-later')?.addEventListener('click', dismissSignupCta);
    $('alat-signup-go')?.addEventListener('click', function () {
      dismissSignupCta();
      if (host && host.openAuthModal) host.openAuthModal('signup', 'alat_analyze_cta');
    });
    log('alat_signup_cta_shown', {});
  }

  function dismissSignupCta() {
    var el = document.getElementById('alat-signup-cta');
    if (el) el.remove();
  }

  function consumeClaimQuery() {
    try {
      var q = new URLSearchParams(location.search);
      var shopId = q.get('claim_shop');
      var name = q.get('claim_name') || '';
      var snapId = q.get('claim_snap');
      var had = false;
      if (snapId && /^[0-9a-f-]{36}$/i.test(snapId)) {
        _claimSnapId = snapId;
        had = true;
      }
      if (shopId && /^\d{4,}$/.test(shopId)) {
        rememberShop({ shop_id: Number(shopId), store_name: name });
        setIntent('existing');
        had = true;
      } else if (had) {
        setIntent('existing');
      }
      if (q.has('claim_shop') || q.has('claim_name') || q.has('claim_snap')) {
        q.delete('claim_shop');
        q.delete('claim_name');
        q.delete('claim_snap');
        var qs = q.toString();
        history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }
      if (had) persistProfile();
      return had;
    } catch (_) { return false; }
  }

  function openAudit(opts) {
    opts = opts || {};
    var wantCenter = !opts.fresh && (opts.center || isWizardDone());
    if (opts.focus === false || wantCenter) exitFocus();
    else setFocus(true);
    if (host && host.setView) host.setView('audit');
    syncNavLabels();
    if (opts.fresh) {
      _wizardDone = false;
      renderConnect();
      return;
    }
    consumeClaimQuery();
    var claimed = rememberedShop();
    if ((!claimed || !claimed.shop_id) && _claimSnapId) {
      void (async function () {
        var snap = await fetchClaimSnapshot(_claimSnapId);
        if (snap && snap.ok && snap.shop_id) {
          var shop = {
            shop_id: snap.shop_id,
            store_name: snap.store_name || '',
          };
          rememberShop(shop);
          await saveStoreProfile(shop);
          await loadShopWork(shop, { center: wantCenter, freshListings: true });
          return;
        }
        renderConnect();
      })();
      return;
    }
    if (claimed && claimed.shop_id) {
      void (async function () {
        await saveStoreProfile(claimed);
        await loadShopWork(claimed, { center: wantCenter, freshListings: !!_claimSnapId });
      })();
      return;
    }
    void (async function () {
      var fromDb = await loadProfileFromDb();
      if (fromDb && fromDb.shop_id) await loadShopWork(fromDb, { center: wantCenter });
      else renderConnect();
    })();
  }

  function shouldTakeBoot() {
    if (!active()) return false;
    if (intent() === 'existing') return true;
    if (host && host.pendingAlat && host.pendingAlat() === 'existing') return true;
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('claim_shop') || q.get('claim_snap')) return true;
    } catch (_) {}
    var o = host && host.onboarding && host.onboarding();
    return !!(o && o.experience === 'existing' && rememberedShop());
  }

  function openSift() {
    exitFocus();
    if (host && host.setView) host.setView('sift');
  }

  function onBoot() {
    if (!active()) return false;
    stripExpor();
    rememberedShop(); // hydrate tracked / alerts / wizard flag before gates
    syncNavLabels();
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('claim_shop') || q.get('claim_snap')) { openAudit(); return true; }
    } catch (_) {}
    if (document.body.classList.contains('view-audit') && $('alat-root')?.querySelector('.myt-store, #alat-shop-q, .alat-progress')) {
      return true;
    }
    if ((intent() === 'existing' || isWizardDone()) && isWizardDone() && rememberedShop()) {
      openSellerCenter();
      return true;
    }
    if (intent() === 'first_time' && forceFinder()) {
      openQuest();
      return true;
    }
    openSift();
    return true;
  }

  function hideFinderXp() {
    var step = document.getElementById('finder-xp-step');
    if (step) step.hidden = active();
  }

  function wireLanding() {
    document.querySelectorAll('[data-alat-door]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var door = btn.getAttribute('data-alat-door');
        if (door === 'existing') startExistingSeller();
        else startNewSeller();
      });
    });
    $('alat-sift-login')?.addEventListener('click', function () {
      if (host && host.openAuthModal) host.openAuthModal('login', 'alat_sift_login');
    });
    $('alat-sift-signup')?.addEventListener('click', function () {
      if (host && host.openAuthModal) host.openAuthModal('signup', 'alat_sift_signup');
    });
    var exit = $('alat-preview-exit');
    if (exit) {
      exit.addEventListener('click', function () {
        try {
          sessionStorage.setItem(SS_FLAG, '0');
          sessionStorage.removeItem(SS_INTENT);
        } catch (_) {}
        exitFocus();
        dismissSignupCta();
        var u = new URL(location.href);
        u.searchParams.delete('preview');
        u.searchParams.delete('claim_shop');
        u.searchParams.delete('claim_name');
        u.searchParams.delete('claim_snap');
        location.href = u.pathname + (u.search || '') + u.hash;
      });
    }
  }

  function stripExpor() {
    if (!active()) return;
    try {
      document.body.classList.remove('expor-lab');
      document.body.classList.remove('pasar-expor');
      document.body.classList.add('pasar-shopee');
    } catch (_) {}
    document.querySelectorAll('.side-links a[href="/expor/"], .expor-tab').forEach(function (el) {
      el.hidden = true;
      el.style.display = 'none';
    });
  }

  function attach(h) {
    host = h || {};
    if (!applyFlag()) return;
    stripExpor();
    hideFinderXp();
    wireLanding();
    rememberedShop(); // hydrate tracked / alerts / wizard flag
    syncNavLabels();
    var banner = $('alat-preview-banner');
    if (banner) banner.hidden = false;
    document.querySelectorAll('.alat-nav').forEach(function (el) { el.hidden = false; });
    $('btn-audit')?.addEventListener('click', function () {
      if (isWizardDone()) openSellerCenter();
      else openAudit({ fresh: false, focus: false });
    });
    if (consumeClaimQuery()) {
      openAudit();
    }
  }

  applyFlag();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      document.body.classList.toggle('alat-preview', active());
    });
  } else if (document.body) {
    document.body.classList.toggle('alat-preview', active());
  }

  global.LarisAlatPreview = {
    active: active,
    attach: attach,
    openAudit: openAudit,
    openSellerCenter: openSellerCenter,
    openSift: openSift,
    openQuest: openQuest,
    shouldTakeBoot: shouldTakeBoot,
    onBoot: onBoot,
    startNewSeller: startNewSeller,
    startExistingSeller: startExistingSeller,
    hideFinderXp: hideFinderXp,
    intent: intent,
    forceFinder: forceFinder,
    exitFocus: exitFocus,
    setFocus: setFocus,
    syncNavLabels: syncNavLabels,
    isWizardDone: isWizardDone,
  };
})(window);
