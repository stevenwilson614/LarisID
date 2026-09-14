/**
 * LarisExpor Amazon adapter for the home SPA (pasar=expor).
 *
 * Same Cari Produk / LOOKUP chrome as Shopee, different data:
 *   amazon_keywords + amazon_listings via RPCs on api.larisid.com.
 * Omset/bulan = price_usd × bought_past_month (Amazon "bought in past month"
 * badge floor). Always perkiraan. Blank when Amazon hides the badge.
 *
 * Loaded before js/gpt-app.js. gpt-app calls window.LarisExpor.
 */
(function (w) {
  'use strict';

  var FX = 16500;

  function qsPasar() {
    try {
      return String(new URLSearchParams(location.search).get('pasar') || '').toLowerCase();
    } catch (_) { return ''; }
  }

  function readPasar() {
    if (qsPasar() === 'expor') return 'expor';
    try {
      if (localStorage.getItem('laris_pasar_v1') === 'expor') return 'expor';
    } catch (_) {}
    return 'shopee';
  }

  function isOn() {
    return readPasar() === 'expor';
  }

  function setPasar(name, opts) {
    var next = name === 'expor' ? 'expor' : 'shopee';
    try { localStorage.setItem('laris_pasar_v1', next); } catch (_) {}
    try {
      var u = new URL(location.href);
      if (next === 'expor') u.searchParams.set('pasar', 'expor');
      else u.searchParams.delete('pasar');
      if (!opts || opts.replace !== false) {
        history.replaceState(history.state || {}, '', u.pathname + u.search + u.hash);
      }
    } catch (_) {}
    document.body.classList.toggle('pasar-expor', next === 'expor');
    document.body.classList.toggle('pasar-shopee', next !== 'expor');
    syncChrome(next === 'expor');
    return next;
  }

  function syncChrome(on) {
    var brand = document.getElementById('btn-home');
    if (brand) {
      brand.title = on ? 'Beranda LarisExpor' : 'Beranda LarisID';
      var lockup = brand.querySelector('.brand-lockup');
      if (lockup) lockup.alt = on ? 'LARIS Expor' : 'LARIS';
    }
    var inp = document.getElementById('results-bar-input');
    if (inp) {
      inp.placeholder = on ? 'Cari produk ekspor… meja jati, minyak kelapa' : 'Cari produk…';
      inp.setAttribute('aria-label', on ? 'Cari produk ekspor Amazon US' : 'Cari produk');
    }
    var tab = document.getElementById('btn-expor-pasar');
    if (tab) tab.classList.toggle('active', !!on);
    var lid = document.getElementById('btn-shopee-pasar');
    if (lid) {
      lid.hidden = true;
      lid.classList.toggle('active', !on);
    }
  }

  function activate() {
    return setPasar('expor');
  }

  function fmtUsd(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) return '—';
    var rounded = n >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
    return '$' + rounded.toLocaleString('en-US', {
      minimumFractionDigits: rounded % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  function fmtOmsetUsd(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'jt/bln';
    if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US') + '/bln';
    return fmtUsd(n) + '/bln';
  }

  function fmtIdrHint(usd) {
    var n = Number(usd) * FX;
    if (!Number.isFinite(n) || n <= 0) return '';
    if (n >= 1e9) return '≈ Rp ' + (n / 1e9).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1e6) return '≈ Rp ' + (n / 1e6).toFixed(1).replace('.', ',') + ' jt';
    return '≈ Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function asListing(r) {
    if (!r) return null;
    var price = r.price_usd != null ? Number(r.price_usd) : Number(r.price);
    var bought = r.bought_past_month != null ? Number(r.bought_past_month) : null;
    var omset = r.omset_usd != null
      ? Number(r.omset_usd)
      : (Number.isFinite(price) && Number.isFinite(bought) && bought > 0 ? price * bought : 0);
    var asin = String(r.asin || r.item_id || '');
    return {
      _pasar: 'expor',
      asin: asin,
      item_id: asin,
      shop_id: 'amazon',
      product_name: r.title || r.product_name || '',
      store_name: r.is_amazon_choice ? 'Amazon US · Amazon\'s Choice' : 'Amazon US',
      price: Number.isFinite(price) ? price : 0,
      price_usd: Number.isFinite(price) ? price : null,
      total_sold: Number.isFinite(bought) ? bought : 0,
      bought_past_month: Number.isFinite(bought) ? bought : null,
      reviews: Number(r.reviews) || 0,
      rating: r.rating != null ? Number(r.rating) : null,
      image_url: r.image_url || '',
      url: r.url || (asin ? 'https://www.amazon.com/dp/' + asin : ''),
      keyword: r.keyword || r.kw_en || '',
      category: r.kategori || r.category || '',
      nama_id: r.nama_id || '',
      slug: r.slug || '',
      listing_date: null,
      age_days: null,
      nowcast_omset_monthly: omset || 0,
      nowcast_method: 'amazon_badge',
      is_amazon_choice: !!r.is_amazon_choice,
      is_best_seller: !!r.is_best_seller,
      search_rank: r.search_rank != null ? Number(r.search_rank) : null,
      fetched_at: r.fetched_at || null,
    };
  }

  function supabase() {
    return w._larisExporSb || null;
  }

  async function searchKeywords(q, limit) {
    var sb = supabase();
    var query = String(q || '').trim();
    if (!sb) return [];
    try {
      var res = await sb.rpc('amazon_search_keywords', {
        p_q: query,
        p_limit: limit || 24,
      });
      if (res.error) throw res.error;
      return res.data || [];
    } catch (e) {
      console.warn('[expor] amazon_search_keywords', e && e.message || e);
      return [];
    }
  }

  async function listingsForKeywords(kws, perKw, max) {
    var sb = supabase();
    var keywords = [];
    var seen = {};
    (kws || []).forEach(function (k) {
      var s = String(k || '').trim();
      if (s && !seen[s]) { seen[s] = 1; keywords.push(s); }
    });
    if (!sb || !keywords.length) return [];
    try {
      var res = await sb.rpc('amazon_listings_for_keywords', {
        p_keywords: keywords,
        p_per_kw: perKw || 20,
        p_max: max || 300,
      });
      if (res.error) throw res.error;
      return (res.data || []).map(asListing).filter(Boolean);
    } catch (e) {
      console.warn('[expor] amazon_listings_for_keywords', e && e.message || e);
      return [];
    }
  }

  async function homeListings(max) {
    var sb = supabase();
    if (!sb) return [];
    try {
      var res = await sb.rpc('amazon_listings_home', { p_max: max || 80 });
      if (res.error) throw res.error;
      return (res.data || []).map(asListing).filter(Boolean);
    } catch (e) {
      console.warn('[expor] amazon_listings_home', e && e.message || e);
      return [];
    }
  }

  async function listingByAsin(asin) {
    var sb = supabase();
    if (!sb || !asin) return null;
    try {
      var res = await sb.rpc('amazon_listing_by_asin', { p_asin: String(asin) });
      if (res.error) throw res.error;
      var row = Array.isArray(res.data) ? res.data[0] : res.data;
      return row ? asListing(row) : null;
    } catch (e) {
      return null;
    }
  }

  async function categories() {
    var sb = supabase();
    if (!sb) return [];
    try {
      var res = await sb.from('amazon_keywords').select('kategori').limit(400);
      if (res.error) throw res.error;
      var set = {};
      (res.data || []).forEach(function (r) {
        if (r.kategori) set[r.kategori] = 1;
      });
      return Object.keys(set).sort();
    } catch (_) { return []; }
  }

  async function keywordsForCategory(cat) {
    var sb = supabase();
    if (!sb || !cat) return [];
    try {
      var res = await sb.from('amazon_keywords')
        .select('slug,kw_en,nama_id,kategori')
        .eq('kategori', cat)
        .limit(80);
      if (res.error) throw res.error;
      return res.data || [];
    } catch (_) { return []; }
  }

  function typeFromKw(row) {
    return {
      keyword: row.kw_en || row.keyword,
      nama_id: row.nama_id,
      category: row.kategori || row.category,
      slug: row.slug,
      _pasar: 'expor',
      n_sellers: null,
      price_median: null,
      omset_top15: null,
    };
  }

  async function resolvePool(opts) {
    opts = opts || {};
    var q = String(opts.q || '').trim();
    var cats = opts.cats || [];
    var out = {
      keywords: [],
      listings: [],
      primaryKw: '',
      matchLevel: 'keyword',
      nearby: false,
      brand: '',
      unsold: 0,
    };
    if (q) {
      var types = await searchKeywords(q, 24);
      out.keywords = types.map(typeFromKw);
      out.primaryKw = types[0] ? types[0].kw_en : '';
      out.matchLevel = types.length > 1 && q.split(/\s+/).length === 1 ? 'chooser' : 'keyword';
      var kws = types.map(function (t) { return t.kw_en; }).filter(Boolean).slice(0, 15);
      if (!kws.length) kws = [q];
      out.listings = await listingsForKeywords(kws, 20, 240);
      if (!out.listings.length && types.length) {
        out.matchLevel = 'nearby';
        out.nearby = true;
      }
      return out;
    }
    if (cats.length) {
      var grouped = [];
      for (var i = 0; i < cats.length && grouped.length < 40; i++) {
        var rows = await keywordsForCategory(cats[i]);
        grouped = grouped.concat(rows);
      }
      out.keywords = grouped.map(typeFromKw);
      out.primaryKw = '';
      out.listings = await listingsForKeywords(
        grouped.map(function (t) { return t.kw_en; }).slice(0, 15),
        20,
        300,
      );
      return out;
    }
    out.listings = await homeListings(80);
    var seenKw = {};
    out.keywords = out.listings.map(function (r) {
      if (!r.keyword || seenKw[r.keyword]) return null;
      seenKw[r.keyword] = 1;
      return typeFromKw({ kw_en: r.keyword, nama_id: r.nama_id, kategori: r.category, slug: r.slug });
    }).filter(Boolean);
    return out;
  }

  function lookupOverviewHtml(esc, type, query) {
    var q = esc(query);
    var honesty = ' Omset/bulan = harga Amazon × badge “bought in past month” (lantai Amazon, selalu perkiraan). Bukan unit terjual yang kami ukur. Amazon tidak punya field negara asal — ini listing AS untuk kata kunci ekspor Indonesia.';
    if (!type) {
      return '<p>Ini listing Amazon US yang cocok dengan <strong>' + q + '</strong>.' + honesty + '</p>' +
        '<p>Tiap baris satu listing Amazon. Ketuk baris untuk Deep Dive.</p>';
    }
    var nama = type.nama_id ? esc(type.nama_id) : esc(type.keyword);
    return '<p>Pasar ekspor <strong>' + nama + '</strong> (cari Amazon: “' + esc(type.keyword) + '”) paling dekat dengan “' + q + '”.</p>' +
      '<p>Tiap baris di bawah satu listing Amazon US.' + honesty + ' Ketuk baris untuk Deep Dive.</p>';
  }

  function defaultFollowups() {
    return ['Cari meja jati', 'Minyak kelapa di Amazon', 'Kursi rotan'];
  }

  function weeklyRefuseHtml() {
    return '<p>Belum ada riwayat mingguan Amazon. Omset yang kami punya adalah badge “bought in past month” dari satu pengambilan, selalu perkiraan — bukan tren minggu ini.</p>' +
      '<p>Cari nama produk (misalnya meja jati atau minyak kelapa) untuk lihat listing Amazon US.</p>';
  }

  function deepDiveHtml(esc, fmtU, fmtO, product) {
    var p = product || {};
    var omset = Number(p.nowcast_omset_monthly) || 0;
    var bought = p.bought_past_month;
    var price = Number(p.price) || 0;
    var img = p.image_url
      ? '<img class="ddr-hero-img" src="' + esc(p.image_url) + '" alt="">'
      : '<div class="ddr-hero-img ddr-hero-ph"></div>';
    var boughtLine = bought != null
      ? Number(bought).toLocaleString('id-ID') + '+ / bulan (badge Amazon)'
      : 'Amazon tidak menampilkan badge penjualan untuk listing ini';
    var omsetLine = omset
      ? fmtO(omset) + ' <span class="omset-chip omset-chip--perkiraan">perkiraan</span>'
      : '—';
    var cat = p.category || '';
    var calcQ = new URLSearchParams();
    if (price) calcQ.set('harga', String(price.toFixed(2)));
    var calcHref = '/expor/kalkulator/margin-amazon/' + (calcQ.toString() ? '?' + calcQ.toString() : '');
    var slugHref = p.slug ? '/expor/produk/' + encodeURIComponent(p.slug) + '/' : '/expor/produk/';
    var amzHref = p.url || (p.asin ? 'https://www.amazon.com/dp/' + p.asin : '');
    return (
      '<div class="dd-head ddr-header expor-dd">' +
        '<button type="button" class="ddr-back" data-expor-dd-back>← Cari Produk</button>' +
        '<div class="ddr-media">' + img + '</div>' +
        '<div class="ddr-head-main">' +
          '<p class="cat-pill">Amazon US · ekspor</p>' +
          '<h2>' + esc(p.product_name || 'Listing Amazon') + '</h2>' +
          '<p class="dd-sub">ASIN ' + esc(p.asin || '—') +
            (p.keyword ? ' · kata kunci “' + esc(p.keyword) + '"' : '') +
            (cat ? ' · ' + esc(cat) : '') + '</p>' +
          '<div class="stat-grid">' +
            '<div class="stat"><div class="stat-num">' + fmtU(price) + '</div><div class="stat-label">Harga</div>' +
              (price ? '<div class="stat-sub">' + esc(fmtIdrHint(price)) + '</div>' : '') + '</div>' +
            '<div class="stat"><div class="stat-num">' + omsetLine + '</div><div class="stat-label">Omset/bulan</div>' +
              '<div class="stat-sub">harga × terjual/bln</div></div>' +
            '<div class="stat"><div class="stat-num">' + esc(boughtLine) + '</div><div class="stat-label">Terjual/bln</div></div>' +
            '<div class="stat"><div class="stat-num">' + (p.reviews ? Number(p.reviews).toLocaleString('id-ID') : '0') +
              '</div><div class="stat-label">Review</div>' +
              (p.rating != null ? '<div class="stat-sub">rating ' + String(p.rating).replace('.', ',') + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<p class="disclaimer">Amazon tidak mempublikasikan unit terjual. Angka omset memakai badge “bought in past month” milik Amazon (lantai kisaran, misalnya 100+ jadi 100). Selalu perkiraan. Amazon juga tidak punya field negara asal — ini bukan bukti produk dibuat di Indonesia.</p>' +
          '<div class="cta-row">' +
            (amzHref ? '<a class="btn-primary" href="' + esc(amzHref) + '" target="_blank" rel="nofollow noopener">Buka di Amazon</a>' : '') +
            '<a class="btn-secondary" href="' + esc(calcHref) + '">Hitung margin Amazon</a>' +
            '<a class="btn-secondary" href="' + esc(slugHref) + '">Syarat ekspor &amp; Comtrade</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function bindDeepDive(root, goDir) {
    if (!root) return;
    var btn = root.querySelector('[data-expor-dd-back]');
    if (btn) btn.addEventListener('click', function () { goDir && goDir(); });
  }

  w.LarisExpor = {
    isOn: isOn,
    readPasar: readPasar,
    setPasar: setPasar,
    activate: activate,
    syncChrome: function () { syncChrome(isOn()); },
    attachSupabase: function (sb) { w._larisExporSb = sb; },
    fmtUsd: fmtUsd,
    fmtOmsetUsd: fmtOmsetUsd,
    fmtIdrHint: fmtIdrHint,
    asListing: asListing,
    resolvePool: resolvePool,
    searchKeywords: searchKeywords,
    listingsForKeywords: listingsForKeywords,
    homeListings: homeListings,
    listingByAsin: listingByAsin,
    categories: categories,
    lookupOverviewHtml: lookupOverviewHtml,
    defaultFollowups: defaultFollowups,
    weeklyRefuseHtml: weeklyRefuseHtml,
    deepDiveHtml: deepDiveHtml,
    bindDeepDive: bindDeepDive,
    FX: FX,
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (isOn()) {
      document.body.classList.add('pasar-expor');
      syncChrome(true);
    }
  });
})(window);
