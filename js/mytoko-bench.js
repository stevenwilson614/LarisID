/**
 * Connected My Toko benchmark: Ringkasan, Produk, Kompetitor.
 * Numbers come from get_toko_benchmark. Omzet is nowcast only.
 * Position rules: docs/mytoko-bench.md
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LarisMyTokoBench = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var POS_LABEL = {
    unggul: 'Lebih unggul',
    setara: 'Setara',
    bawah: 'Di bawah',
    none: 'Belum ada pembanding',
  };
  var WARN_ORDER = ['harga-atas', 'judul', 'rank-luar'];
  var OK_ORDER = ['rating', 'harga-dekat', 'rank-top', 'judul-ok', 'harga-bawah'];
  var ACTIONS = {
    'harga-atas': {
      title: 'Cek harga yang di atas median',
      text: 'Bandingkan dengan 2–3 listing teratas di kata kunci yang sama, lalu uji selisih kecil selama seminggu. Ini bukan harga sasaran.',
    },
    judul: {
      title: 'Lengkapi kata kunci di judul',
      text: 'Masukkan kata kunci pencarian di judul tanpa spam — satu frasa utama di depan.',
    },
    'rank-luar': {
      title: 'Lihat listing di atas kamu',
      text: 'Peringkat ini di sapuan kata kunci LarisID, bukan peringkat Shopee. Bandingkan foto utama dan isi paket dengan listing yang terjualnya lebih banyak.',
    },
  };
  var CAT_COLORS = ['#B5202A', '#E38B86', '#C9974B', '#1A1A1A', '#C8C2B4'];
  var POS_COLORS = { unggul: '#B5202A', setara: '#C9974B', bawah: '#8A8A8A' };

  var ui = { q: '', category: '', sort: 'posisi', shopId: 0 };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function thumb(url) {
    var u = String(url || '');
    return /^https:\/\/cf\.shopee\.co\.id\/file\/[\w-]+$/.test(u) ? u + '_tn.webp' : u;
  }

  function fmtRp(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return 'Rp ' + Math.round(x).toLocaleString('id-ID');
  }

  function fmtRpShort(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '—';
    if (x >= 1e9) return 'Rp ' + (x / 1e9).toFixed(1).replace('.', ',').replace(',0', '') + ' M';
    if (x >= 1e6) return 'Rp ' + (x / 1e6).toFixed(x >= 1e8 ? 0 : 1).replace('.', ',').replace(',0', '') + ' jt';
    if (x >= 1e3) return 'Rp ' + Math.round(x / 1e3).toLocaleString('id-ID') + ' rb';
    return fmtRp(x);
  }

  function fmtN(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '—';
    if (x >= 1e6) return (x / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' jt';
    if (x >= 1e3) return (x / 1e3).toFixed(1).replace('.', ',').replace(',0', '') + ' rb';
    return Math.round(x).toLocaleString('id-ID');
  }

  function fmtRating(n) {
    var x = Number(n);
    if (!(x > 0)) return '—';
    return x.toFixed(1).replace('.', ',');
  }

  function clip(name) {
    var s = String(name || '').trim();
    if (!s) return 'produk ini';
    return s.length > 42 ? s.slice(0, 40) + '…' : s;
  }

  function peerCount(market) {
    if (!market) return 0;
    var n = Number(market.peer_count);
    if (Number.isFinite(n)) return n;
    var sellers = Number(market.total_sellers) || 0;
    var mineN = Array.isArray(market.mine) ? market.mine.length : 0;
    return Math.max(0, sellers - mineN);
  }

  function findMine(listing, market) {
    if (!market || !Array.isArray(market.mine)) return null;
    var id = Number(listing && listing.item_id);
    var found = null;
    market.mine.forEach(function (m) {
      if (Number(m.item_id) === id) found = m;
    });
    return found;
  }

  function indexMarkets(markets) {
    var exact = Object.create(null);
    var lower = Object.create(null);
    (markets || []).forEach(function (m) {
      if (!m) return;
      var k = String(m.keyword || '');
      if (!k) return;
      exact[k] = m;
      lower[k.trim().toLowerCase()] = m;
    });
    return { exact: exact, lower: lower };
  }

  function marketFor(listing, idx) {
    var k = String(listing && listing.keyword || '');
    if (!k || !idx) return null;
    if (idx.exact[k]) return idx.exact[k];
    return idx.lower[k.trim().toLowerCase()] || null;
  }

  function positionOf(listing, market) {
    if (!listing || !market) return 'none';
    if (peerCount(market) < 5) return 'none';
    var median = Number(market.median_price);
    var price = Number(listing.price);
    if (!(median > 0) || !Number.isFinite(price)) return 'none';
    var mine = findMine(listing, market);
    var rank = mine ? Number(mine.rank) : NaN;
    var sellers = Number(market.total_sellers) || 0;
    if (!(rank >= 1) || !(sellers >= 1)) return 'none';
    var top = rank <= Math.ceil(sellers * 0.3);
    var bottom = rank > sellers / 2;
    var cheap = price <= median * 1.05;
    var dear = price >= median * 1.15;
    var above = price > median;
    if (top && cheap) return 'unggul';
    if (dear || (bottom && above)) return 'bawah';
    return 'setara';
  }

  function priceGap(listing, market) {
    if (!market || peerCount(market) < 5) return null;
    var median = Number(market.median_price);
    var price = Number(listing && listing.price);
    if (!(median > 0) || !Number.isFinite(price)) return null;
    return Math.round((price - median) / median * 100);
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

  function listingNotes(listing, market) {
    var notes = [];
    var name = String(listing.product_name || '').trim();
    var gap = priceGap(listing, market);
    if (gap != null) {
      if (Math.abs(gap) < 5) notes.push({ tone: 'ok', kind: 'harga-dekat', gap: gap, name: name });
      else if (gap > 0) notes.push({ tone: 'warn', kind: 'harga-atas', gap: gap, name: name });
      else notes.push({ tone: 'ok', kind: 'harga-bawah', gap: gap, name: name });
    }
    var mine = findMine(listing, market);
    if (mine && Number(mine.rank) >= 1 && peerCount(market) >= 5) {
      if (Number(mine.rank) <= 10) notes.push({ tone: 'ok', kind: 'rank-top', rank: Number(mine.rank), name: name });
      else notes.push({ tone: 'warn', kind: 'rank-luar', rank: Number(mine.rank), name: name });
    }
    var kw = String(listing.keyword || '').trim();
    if (kw) {
      var tk = titleKeywordScore(name, kw);
      if (tk.total) {
        if (tk.missing.length) notes.push({ tone: 'warn', kind: 'judul', missing: tk.missing, name: name });
        else notes.push({ tone: 'ok', kind: 'judul-ok', name: name });
      }
    }
    return notes;
  }

  function noteText(kind, arr) {
    var n = arr.length;
    var ex = arr.slice().sort(function (a, b) {
      return Math.abs(b.gap || 0) - Math.abs(a.gap || 0);
    })[0] || {};
    if (kind === 'harga-atas') {
      return n + ' produk harganya di atas median kata kuncinya. Contoh: ' +
        clip(ex.name) + ', sekitar ' + ex.gap + '% di atas.';
    }
    if (kind === 'harga-dekat') return n + ' produk harganya dekat median kata kuncinya.';
    if (kind === 'harga-bawah') {
      return n + ' produk harganya di bawah median. Pastikan margin masih masuk sebelum diturunkan lagi.';
    }
    if (kind === 'judul') {
      var miss = (ex.missing || []).slice(0, 3).join(', ');
      return n + ' judul belum memuat kata kunci pencarian' + (miss ? ' (misalnya ' + miss + ')' : '') + '.';
    }
    if (kind === 'judul-ok') return n + ' judul sudah memuat kata kunci pencariannya.';
    if (kind === 'rank-top') return n + ' produk ada di 10 besar terjual di kata kuncinya.';
    if (kind === 'rank-luar') return n + ' produk peringkat terjualnya di luar 10 besar kata kuncinya.';
    if (kind === 'rating') return ex.text || '';
    return '';
  }

  function summarizeShop(rows) {
    var groups = Object.create(null);
    (rows || []).forEach(function (row) {
      listingNotes(row.listing, row.market).forEach(function (note) {
        if (!groups[note.kind]) groups[note.kind] = [];
        groups[note.kind].push(note);
      });
    });
    var rated = (rows || []).filter(function (r) { return Number(r.listing && r.listing.rating) > 0; });
    if (rated.length >= 3) {
      var sum = 0;
      rated.forEach(function (r) { sum += Number(r.listing.rating); });
      var avg = sum / rated.length;
      if (avg >= 4.8) {
        groups.rating = [{
          tone: 'ok',
          kind: 'rating',
          text: 'Rating rata-rata ' + avg.toFixed(1).replace('.', ',') +
            ' dari ' + rated.length + ' listing yang punya penilaian.',
        }];
      }
    }
    function take(order, tone) {
      var kinds = Object.keys(groups).filter(function (k) {
        return groups[k].length && groups[k][0].tone === tone;
      });
      kinds.sort(function (a, b) {
        var d = groups[b].length - groups[a].length;
        if (d) return d;
        return order.indexOf(a) - order.indexOf(b);
      });
      return kinds.slice(0, 4).map(function (k) {
        return { kind: k, text: noteText(k, groups[k]) };
      }).filter(function (x) { return x.text; });
    }
    var warn = take(WARN_ORDER, 'warn');
    var ok = take(OK_ORDER, 'ok');
    var actions = [];
    WARN_ORDER.forEach(function (k) {
      if (!groups[k] || !groups[k].length || !ACTIONS[k]) return;
      actions.push(ACTIONS[k]);
    });
    return { ok: ok, warn: warn, actions: actions.slice(0, 4) };
  }

  function visiblePatterns(rows) {
    var out = [];
    var below = 0;
    var compared = 0;
    var reviewBehind = 0;
    var reviewN = 0;
    var seenKw = Object.create(null);
    (rows || []).forEach(function (row) {
      var m = row.market;
      if (!m || peerCount(m) < 5) return;
      var kw = String(m.keyword || '');
      // One pass per keyword. Counting every peer against every listing of
      // yours would report the same shops several times.
      if (kw && !seenKw[kw]) {
        seenKw[kw] = true;
        var yours = null;
        (rows || []).forEach(function (r) {
          if (!r.market || String(r.market.keyword || '') !== kw) return;
          if (!yours || Number(r.listing.total_sold) > Number(yours.listing.total_sold)) yours = r;
        });
        var price = yours ? Number(yours.listing.price) : 0;
        (m.peers || []).forEach(function (peer) {
          var pp = Number(peer.price);
          if (!(pp > 0) || !(price > 0)) return;
          compared++;
          if (pp < price) below++;
        });
      }
      var top3 = Number(m.top3_reviews);
      var reviews = row.listing ? row.listing.reviews : null;
      if (top3 > 0 && reviews != null && reviews !== '' && Number.isFinite(Number(reviews))) {
        reviewN++;
        if (Number(reviews) < top3) reviewBehind++;
      }
    });
    if (compared >= 5) {
      out.push({
        title: 'Harga',
        text: below + ' dari ' + compared +
          ' listing kompetitor yang kami bandingkan lebih murah dari listing kamu yang paling laku di kata kunci yang sama.',
      });
    }
    if (reviewN >= 3 && reviewBehind > 0) {
      out.push({
        title: 'Ulasan',
        text: reviewBehind + ' dari ' + reviewN +
          ' produkmu punya lebih sedikit ulasan daripada rata-rata 3 teratas di kata kunci yang sama.',
      });
    }
    return out;
  }

  function storeScore(positions) {
    var comparable = (positions || []).filter(function (p) {
      return p === 'unggul' || p === 'setara' || p === 'bawah';
    });
    if (comparable.length < 3) return null;
    var good = comparable.filter(function (p) { return p === 'unggul' || p === 'setara'; }).length;
    return Math.round(100 * good / comparable.length);
  }

  function categoryShares(listings) {
    var list = listings || [];
    var withOm = list.filter(function (p) { return Number(p.nowcast_omset_monthly) > 0; });
    var useOm = withOm.length > 0;
    var src = useOm ? withOm : list;
    var map = Object.create(null);
    src.forEach(function (p) {
      var c = String(p.category || '').trim() || 'Lainnya';
      map[c] = (map[c] || 0) + (useOm ? Number(p.nowcast_omset_monthly) : 1);
    });
    var rows = Object.keys(map).map(function (k) { return { category: k, value: map[k] }; });
    rows.sort(function (a, b) { return b.value - a.value; });
    var top = rows.slice(0, 4);
    var restVal = 0;
    rows.slice(4).forEach(function (r) { restVal += r.value; });
    if (restVal > 0) {
      var lain = null;
      top.forEach(function (r) { if (r.category === 'Lainnya') lain = r; });
      if (lain) lain.value += restVal;
      else top.push({ category: 'Lainnya', value: restVal });
    }
    var total = 0;
    top.forEach(function (r) { total += r.value; });
    var slices = top.map(function (r) {
      return {
        category: r.category,
        value: r.value,
        pct: total ? Math.floor((100 * r.value) / total) : 0,
      };
    });
    var used = 0;
    slices.forEach(function (s) { used += s.pct; });
    if (slices.length && total) slices[0].pct += 100 - used;
    return {
      mode: useOm ? 'omzet' : 'count',
      partial: !!(useOm && withOm.length < list.length),
      total: total,
      slices: slices,
    };
  }

  function countPositions(rows) {
    var c = { unggul: 0, setara: 0, bawah: 0, none: 0, comparable: 0 };
    (rows || []).forEach(function (r) {
      var p = r.position || 'none';
      if (c[p] == null) c[p] = 0;
      c[p]++;
      if (p !== 'none') c.comparable++;
    });
    return c;
  }

  function buildRows(listings, markets) {
    var idx = indexMarkets(markets);
    return (listings || []).map(function (listing, index) {
      var market = marketFor(listing, idx);
      return {
        index: index,
        listing: listing,
        market: market,
        position: positionOf(listing, market),
        gap: priceGap(listing, market),
      };
    });
  }

  function buildModel(listings, benchmark) {
    var markets = benchmark && Array.isArray(benchmark.markets) ? benchmark.markets : [];
    var rows = buildRows(listings, markets);
    return {
      rows: rows,
      counts: countPositions(rows),
      score: storeScore(rows.map(function (r) { return r.position; })),
      categories: categoryShares(listings),
      summary: summarizeShop(rows),
      rivals: benchmark && Array.isArray(benchmark.rivals) ? benchmark.rivals : [],
      shop: benchmark && benchmark.shop ? benchmark.shop : null,
      patterns: visiblePatterns(rows),
      marketCount: markets.filter(function (m) { return peerCount(m) >= 5; }).length,
    };
  }

  function oldestIso(shopInfo, listings) {
    var times = [];
    if (shopInfo && shopInfo.oldest_listing_date) {
      var a = Date.parse(shopInfo.oldest_listing_date);
      if (Number.isFinite(a)) times.push(a);
    }
    (listings || []).forEach(function (p) {
      var t = Date.parse(p && p.listing_date);
      if (Number.isFinite(t)) times.push(t);
    });
    if (!times.length) return '';
    return new Date(Math.min.apply(null, times)).toISOString();
  }

  function oldestLabel(iso) {
    var t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    var months = (Date.now() - t) / (30.4375 * 24 * 3600 * 1000);
    if (months < 0) return '';
    if (months < 1) return 'Listing tertua yang terlihat: kurang dari sebulan';
    if (months < 24) return 'Listing tertua yang terlihat: ±' + Math.round(months) + ' bln';
    var years = Math.round((months / 12) * 10) / 10;
    return 'Listing tertua yang terlihat: ±' + String(years).replace('.', ',') + ' th';
  }

  function scoreWord(score) {
    if (score >= 75) return 'Baik';
    if (score >= 50) return 'Cukup';
    return 'Perlu diperhatikan';
  }

  function positionLabel(row) {
    if (row.position !== 'none') return POS_LABEL[row.position] || POS_LABEL.none;
    if (row.gap != null) return 'Belum ada peringkat';
    return POS_LABEL.none;
  }

  function gapHtml(row) {
    if (row.gap == null) return '';
    var cls = row.gap > 0 ? 'is-down' : (row.gap < 0 ? 'is-up' : 'is-flat');
    var dir = row.gap > 0 ? 'di atas median' : (row.gap < 0 ? 'di bawah median' : 'di median');
    var n = row.gap > 0 ? '+' + row.gap : String(row.gap);
    return '<span class="myt-bench-delta ' + cls + '">' + n + '% ' + dir + '</span>';
  }

  function imgHtml(url, cls) {
    if (!url) return '<span class="' + cls + ' alat-ph"></span>';
    return '<img class="' + cls + '" src="' + esc(thumb(url)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">';
  }

  function sumNum(rows, pick) {
    var n = 0;
    var any = false;
    rows.forEach(function (r) {
      var v = Number(pick(r));
      if (!Number.isFinite(v)) return;
      any = true;
      n += v;
    });
    return any ? n : null;
  }

  function avgGap(rows) {
    var xs = [];
    rows.forEach(function (r) { if (r.gap != null) xs.push(r.gap); });
    if (!xs.length) return null;
    var s = 0;
    xs.forEach(function (n) { s += n; });
    return Math.round(s / xs.length);
  }

  function shopInitials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (/^\d+$/.test(words[0])) return words[0].slice(0, 2);
    return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
  }

  function trackedMap(ids) {
    var set = Object.create(null);
    (ids || []).forEach(function (id) { set[String(id)] = true; });
    return set;
  }

  function sortRows(rows) {
    var q = String(ui.q || '').trim().toLowerCase();
    var cat = ui.category;
    var order = { bawah: 0, setara: 1, unggul: 2, none: 3 };
    var out = rows.filter(function (r) {
      if (cat && String(r.listing.category || '') !== cat) return false;
      if (!q) return true;
      var name = String(r.listing.product_name || '').toLowerCase();
      var kw = String(r.listing.keyword || '').toLowerCase();
      return name.indexOf(q) >= 0 || kw.indexOf(q) >= 0;
    });
    out.sort(function (a, b) {
      if (ui.sort === 'harga') {
        var ga = a.gap == null ? -9999 : a.gap;
        var gb = b.gap == null ? -9999 : b.gap;
        return gb - ga;
      }
      if (ui.sort === 'omzet') {
        return (Number(b.listing.nowcast_omset_monthly) || 0) - (Number(a.listing.nowcast_omset_monthly) || 0);
      }
      if (ui.sort === 'terjual') {
        return (Number(b.listing.total_sold) || 0) - (Number(a.listing.total_sold) || 0);
      }
      var pa = order[a.position] == null ? 9 : order[a.position];
      var pb = order[b.position] == null ? 9 : order[b.position];
      if (pa !== pb) return pa - pb;
      return (Number(b.listing.total_sold) || 0) - (Number(a.listing.total_sold) || 0);
    });
    return out;
  }

  function categoriesOf(listings) {
    var seen = Object.create(null);
    var out = [];
    (listings || []).forEach(function (p) {
      var c = String(p.category || '').trim();
      if (!c || seen[c]) return;
      seen[c] = true;
      out.push(c);
    });
    out.sort(function (a, b) { return a.localeCompare(b, 'id'); });
    return out;
  }

  function donutStyle(slices, colors) {
    if (!slices.length) return '';
    var acc = 0;
    var parts = [];
    slices.forEach(function (s, i) {
      var start = acc;
      acc += Number(s.pct) || 0;
      parts.push((colors[i] || '#E8E8E8') + ' ' + start + '% ' + acc + '%');
    });
    if (acc < 100) parts.push('#F3F3F4 ' + acc + '% 100%');
    return 'background:conic-gradient(' + parts.join(',') + ')';
  }

  function kpi(value, label, sub) {
    return '<div class="myt-bench-kpi"><b>' + value + '</b><span>' + esc(label) + '</span>' +
      (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  }

  function noteList(items, empty) {
    if (!items.length) return '<p class="myt-bench-empty">' + esc(empty) + '</p>';
    return '<ul class="myt-bench-list">' + items.map(function (item) {
      return '<li>' + esc(item.text) + '</li>';
    }).join('') + '</ul>';
  }

  function detailBtn(idx) {
    return '<button type="button" class="btn-ghost myt-bench-detail" data-bench-detail="' + idx + '">Detail</button>';
  }

  function productCell(row, tracked) {
    var p = row.listing;
    var on = tracked[String(p.item_id)];
    return '<div class="myt-bench-prod">' +
      imgHtml(p.image_url, 'myt-bench-thumb') +
      '<div><b>' + esc(clip(p.product_name)) + '</b>' +
      '<small>' + esc(p.keyword || 'Belum ada kata kunci') +
      (on ? ' · Dipantau' : '') +
      (p.from_snapshot ? ' · Snapshot' : '') +
      ' · ' + fmtN(p.total_sold) + ' terjual kumulatif</small></div></div>';
  }

  function omzetCell(p) {
    if (!(Number(p.nowcast_omset_monthly) > 0)) return '<span class="myt-bench-muted">—</span>';
    return '<b>' + esc(fmtRpShort(p.nowcast_omset_monthly)) + '</b><small>perkiraan</small>';
  }

  function rankLine(row) {
    if (!row.market || peerCount(row.market) < 5) return '';
    var mine = findMine(row.listing, row.market);
    if (!mine || !(Number(mine.rank) >= 1)) return '';
    var total = Number(row.market && row.market.total_sellers) || 0;
    return '<small>#' + Math.round(mine.rank) + (total ? ' dari ' + total : '') + ' di kata kunci ini</small>';
  }

  function priceVsYou(rival, rows) {
    var feat = rival.featured || {};
    var kw = String(feat.keyword || '');
    if (!kw) return null;
    var mine = null;
    rows.forEach(function (r) {
      if (String(r.listing.keyword || '') !== kw) return;
      if (!mine || Number(r.listing.total_sold) > Number(mine.listing.total_sold)) mine = r;
    });
    if (!mine) return null;
    var theirs = Number(feat.price);
    var yours = Number(mine.listing.price);
    if (!(theirs > 0) || !(yours > 0)) return null;
    return {
      pct: Math.round(((theirs - yours) / yours) * 100),
      keyword: kw,
    };
  }

  function rivalDeltaHtml(info) {
    if (!info) return '<span class="myt-bench-muted">—</span>';
    if (!info.pct) return '<span class="myt-bench-delta is-flat">Harga sama di kata kunci ini</span>';
    var cheaper = info.pct < 0;
    var cls = cheaper ? 'is-down' : 'is-up';
    var n = Math.abs(info.pct);
    var words = cheaper ? 'lebih murah dari kamu' : 'lebih mahal dari kamu';
    return '<span class="myt-bench-delta ' + cls + '">' + n + '% ' + words + '</span>' +
      '<small>' + esc(info.keyword) + '</small>';
  }

  function renderScore(model, loading) {
    var c = model.counts;
    if (model.score == null) {
      if (loading && !c.comparable) {
        return '<div class="myt-bench-score"><b>…</b><span>Skor dihitung setelah pembanding masuk</span></div>';
      }
      if (!c.comparable) {
        return '<div class="myt-bench-score"><b>—</b><span>Belum cukup listing dengan pembanding untuk skor. Perlu minimal 3, masing-masing dengan 5 kompetitor di kata kunci yang sama.</span></div>';
      }
      return '<div class="myt-bench-score"><b>' + c.comparable + '</b><span>listing punya pembanding · ' +
        c.unggul + ' lebih unggul · ' + c.setara + ' setara · ' + c.bawah +
        ' di bawah. Skor belum ditampilkan karena belum 3 listing.</span></div>';
    }
    return '<div class="myt-bench-score" title="Bagian listing yang Lebih unggul atau Setara, dari sapuan LarisID, bukan skor Shopee.">' +
      '<b>' + model.score + '<small>/100</small></b>' +
      '<span>' + esc(scoreWord(model.score)) + ' · dari sapuan LarisID, bukan skor Shopee. ' +
      'Dihitung dari listing yang punya minimal 5 kompetitor: bagian yang Lebih unggul atau Setara.</span></div>';
  }

  function renderDonut(slices, colors, holeTitle, holeSub) {
    if (!slices.length) return '';
    return '<div class="myt-donut" style="' + donutStyle(slices, colors) + '">' +
      '<div class="myt-donut-hole"><b>' + esc(holeTitle) + '</b><span>' + esc(holeSub) + '</span></div></div>';
  }

  function legend(slices, colors) {
    return '<ul class="myt-bench-legend">' + slices.map(function (s, i) {
      return '<li><i style="background:' + (colors[i] || '#E8E8E8') + '"></i>' +
        esc(s.category || s.label) + '<b>' + s.pct + '%</b></li>';
    }).join('') + '</ul>';
  }

  function renderRingkasan(ctx, model) {
    var listings = ctx.listings || [];
    var loading = !!ctx.loading;
    var sold = sumNum(listings, function (p) { return p.total_sold; });
    var reviews = sumNum(listings, function (p) { return p.reviews; });
    var rated = listings.filter(function (p) { return Number(p.rating) > 0; });
    var rate = null;
    if (rated.length) {
      var rs = 0;
      rated.forEach(function (p) { rs += Number(p.rating); });
      rate = rs / rated.length;
    }
    var age = oldestLabel(oldestIso(model.shop, listings));
    var snap = listings.some(function (p) { return p && p.from_snapshot; });
    var kpis = kpi(fmtN(listings.length), 'Produk', snap ? 'termasuk snapshot halaman' : '') +
      kpi(sold == null ? '—' : fmtN(sold), 'Terjual', 'kumulatif') +
      kpi(rate == null ? '—' : fmtRating(rate), 'Penilaian', '') +
      kpi(reviews == null ? '—' : fmtN(reviews), 'Ulasan', '');
    var summary = model.summary;
    var waitEmpty = loading ? 'Masih membandingkan…' : 'Belum cukup sinyal dari sapuan untuk bagian ini.';
    var cards = '<div class="myt-bench-cols">' +
      '<section class="myt-bench-card is-ok"><h3>Sudah bagus</h3>' + noteList(summary.ok, waitEmpty) + '</section>' +
      '<section class="myt-bench-card is-warn"><h3>Bisa diubah</h3>' + noteList(summary.warn, waitEmpty) + '</section>' +
      '</div>';

    var best = model.rows.slice().sort(function (a, b) {
      return (Number(b.listing.total_sold) || 0) - (Number(a.listing.total_sold) || 0);
    }).slice(0, 3);
    var bestHtml = best.length
      ? '<table class="myt-bench-table"><thead><tr><th>Produk</th><th>Terjual</th><th>Rating</th><th>Omzet</th><th></th></tr></thead><tbody>' +
        best.map(function (row) {
          var p = row.listing;
          return '<tr class="' + (row.index === ctx.selectedIdx ? 'is-selected' : '') + '">' +
            '<td data-label="Produk">' + productCell(row, trackedMap(ctx.trackedIds)) + '</td>' +
            '<td data-label="Terjual">' + fmtN(p.total_sold) + '<small>kumulatif</small></td>' +
            '<td data-label="Rating">' + fmtRating(p.rating) + '</td>' +
            '<td data-label="Omzet">' + omzetCell(p) + '</td>' +
            '<td data-label="">' + detailBtn(row.index) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="myt-bench-empty">Belum ada listing.</p>';

    var cat = model.categories;
    var catColors = CAT_COLORS.slice();
    var catBlock = cat.slices.length
      ? '<div class="myt-bench-donut-row">' +
        renderDonut(cat.slices, catColors, cat.mode === 'omzet' ? fmtRpShort(cat.total).replace('Rp ', '') : String(listings.length), cat.mode === 'omzet' ? 'Omzet perkiraan' : 'Jumlah produk') +
        legend(cat.slices, catColors) + '</div>' +
        (cat.partial ? '<p class="alat-hint">Cincin omzet hanya dari listing yang punya perkiraan. Yang lain tidak masuk.</p>' : '') +
        (cat.mode === 'count' ? '<p class="alat-hint">Belum ada perkiraan omzet, jadi cincin ini jumlah produk.</p>' : '')
      : '<p class="myt-bench-empty">Belum ada kategori pada listing ini.</p>';

    var rivals = model.rivals.slice(0, 4);
    var rivalTable = '';
    if (loading && !rivals.length) {
      rivalTable = '<p class="myt-bench-empty">Membandingkan toko di kata kunci yang sama…</p>';
    } else if (!rivals.length) {
      rivalTable = '<p class="myt-bench-empty">Belum ada toko lain di kata kunci yang sama pada sapuan terbaru.</p>';
    } else {
      rivalTable = '<table class="myt-bench-table"><thead><tr><th>Toko</th><th>Kata kunci sama</th><th>Harga vs kamu</th><th>Omzet</th></tr></thead><tbody>' +
        rivals.map(function (rv) {
          return '<tr><td data-label="Toko"><b>' + esc(rv.store_name || 'Toko') + '</b>' +
            (rv.location ? '<small>' + esc(rv.location) + '</small>' : '') + '</td>' +
            '<td data-label="Kata kunci sama">' + fmtN(rv.overlap) + '</td>' +
            '<td data-label="Harga vs kamu">' + rivalDeltaHtml(priceVsYou(rv, model.rows)) + '</td>' +
            '<td data-label="Omzet">' + (Number(rv.overlap_omzet) > 0
              ? '<b>' + esc(fmtRpShort(rv.overlap_omzet)) + '</b><small>perkiraan, listing yang sama</small>'
              : '<span class="myt-bench-muted">—</span>') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    var actions = summary.actions.length
      ? '<ol class="myt-bench-list myt-bench-actions-list">' + summary.actions.map(function (a) {
          return '<li><b>' + esc(a.title) + '</b><span>' + esc(a.text) + '</span></li>';
        }).join('') + '</ol>'
      : '<p class="myt-bench-empty">' + (loading ? 'Saran menyusul setelah pembanding masuk.' : 'Belum ada saran dari selisih harga, judul, atau peringkat.') + '</p>';

    return '<div class="myt-bench-kpis">' + kpis + '</div>' +
      (age ? '<p class="alat-hint myt-bench-age">' + esc(age) + '. Ini bukan tanggal toko bergabung di Shopee.</p>' : '') +
      renderScore(model, loading) +
      cards +
      '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Terjual terbanyak</h3><p class="alat-hint">Dari listing yang kami lihat, bukan lencana Shopee.</p>' + bestHtml + '</section>' +
        '<section class="myt-bench-card"><h3>Performa kategori</h3>' + catBlock + '</section>' +
      '</div>' +
      '<section class="myt-bench-card"><h3>Kompetitor utama</h3>' +
        '<p class="alat-hint">Toko yang muncul di sapuan kata kunci yang sama. Omzet hanya dari listing yang tumpang tindih, perkiraan.</p>' +
        rivalTable + '</section>' +
      '<section class="myt-bench-card"><h3>Yang bisa dikerjakan</h3>' + actions + '</section>';
  }

  function renderProduk(ctx, model) {
    var loading = !!ctx.loading;
    var c = model.counts;
    var gap = avgGap(model.rows);
    var rated = (ctx.listings || []).filter(function (p) { return Number(p.rating) > 0; });
    var rate = null;
    if (rated.length) {
      var rs = 0;
      rated.forEach(function (p) { rs += Number(p.rating); });
      rate = rs / rated.length;
    }
    var gapSub = gap == null ? '' : (gap > 0 ? 'kamu lebih mahal' : (gap < 0 ? 'kamu lebih murah' : 'di median'));
    var kpis = kpi(fmtN((ctx.listings || []).length), 'Total produk', '') +
      kpi(loading && !c.comparable ? '…' : fmtN(c.comparable), 'Punya pembanding', 'min. 5 kompetitor') +
      kpi(loading && !c.comparable ? '…' : (c.comparable ? (c.unggul + ' / ' + c.comparable) : '—'), 'Lebih unggul', '') +
      kpi(gap == null ? (loading ? '…' : '—') : ((gap > 0 ? '+' : '') + gap + '%'), 'Rata-rata harga vs median', gapSub) +
      kpi(rate == null ? '—' : fmtRating(rate), 'Rata-rata rating', '');

    var posSlices = [
      { label: 'Lebih unggul', category: 'Lebih unggul', pct: 0, n: c.unggul },
      { label: 'Setara', category: 'Setara', pct: 0, n: c.setara },
      { label: 'Di bawah', category: 'Di bawah', pct: 0, n: c.bawah },
    ].filter(function (s) { return s.n > 0; });
    if (c.comparable) {
      var used = 0;
      posSlices.forEach(function (s, i) {
        s.pct = i === posSlices.length - 1 ? 0 : Math.floor((100 * s.n) / c.comparable);
        used += s.pct;
      });
      if (posSlices.length) posSlices[posSlices.length - 1].pct = 100 - used;
    }
    var posColors = posSlices.map(function (s) { return POS_COLORS[s.label === 'Lebih unggul' ? 'unggul' : s.label === 'Setara' ? 'setara' : 'bawah']; });
    var donut = '';
    if (c.comparable) {
      donut = '<div class="myt-bench-donut-row">' +
        renderDonut(posSlices, posColors, String(c.comparable), 'dibanding') +
        legend(posSlices, posColors) + '</div>';
    } else if (loading) {
      donut = '<p class="myt-bench-empty">Membandingkan posisi di kata kunci…</p>';
    } else {
      donut = '<p class="myt-bench-empty">Belum cukup listing dengan pembanding untuk diagram. Perlu minimal 5 kompetitor di kata kunci yang sama.</p>';
    }

    var temuan = [];
    model.summary.warn.slice(0, 2).forEach(function (x) { temuan.push(x.text); });
    model.summary.ok.slice(0, 1).forEach(function (x) { temuan.push(x.text); });
    var temuanHtml = temuan.length
      ? '<ul class="myt-bench-list">' + temuan.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
      : '<p class="myt-bench-empty">' + (loading ? 'Temuan menyusul.' : 'Belum ada temuan harga, judul, atau peringkat.') + '</p>';

    var cats = categoriesOf(ctx.listings);
    var filters = '<div class="myt-bench-filters">' +
      '<input type="search" id="myt-bench-q" class="alat-input" placeholder="Cari produk…" value="' + esc(ui.q) + '">' +
      '<select id="myt-bench-cat" class="alat-input">' +
        '<option value="">Semua kategori</option>' +
        cats.map(function (categ) {
          return '<option value="' + esc(categ) + '"' + (categ === ui.category ? ' selected' : '') + '>' + esc(categ) + '</option>';
        }).join('') +
      '</select>' +
      '<select id="myt-bench-sort" class="alat-input">' +
        '<option value="posisi"' + (ui.sort === 'posisi' ? ' selected' : '') + '>Urutkan: posisi</option>' +
        '<option value="harga"' + (ui.sort === 'harga' ? ' selected' : '') + '>Urutkan: harga</option>' +
        '<option value="omzet"' + (ui.sort === 'omzet' ? ' selected' : '') + '>Urutkan: omzet</option>' +
        '<option value="terjual"' + (ui.sort === 'terjual' ? ' selected' : '') + '>Urutkan: terjual</option>' +
      '</select></div>';

    return '<div class="myt-bench-kpis">' + kpis + '</div>' +
      '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Posisi di kata kunci</h3>' +
          '<p class="alat-hint">Bukan peringkat kategori Shopee. Dihitung dari sapuan terbaru kata kunci itu.</p>' + donut + '</section>' +
        '<section class="myt-bench-card"><h3>Temuan utama</h3>' + temuanHtml + '</section>' +
      '</div>' +
      filters +
      '<div id="myt-bench-results"></div>';
  }

  function renderProductTable(ctx, model) {
    var tracked = trackedMap(ctx.trackedIds);
    var rows = sortRows(model.rows);
    if (!rows.length) {
      return '<p class="myt-bench-empty">Tidak ada produk yang cocok dengan saringan ini.</p>';
    }
    return '<table class="myt-bench-table"><thead><tr>' +
      '<th>Produk</th><th>Posisi</th><th>Harga vs median</th><th>Rating</th><th>Omzet</th><th></th>' +
      '</tr></thead><tbody>' +
      rows.map(function (row) {
        var p = row.listing;
        var median = row.market ? row.market.median_price : null;
        return '<tr class="myt-bench-row' + (row.index === ctx.selectedIdx ? ' is-selected' : '') + '">' +
          '<td data-label="Produk">' + productCell(row, tracked) + '</td>' +
          '<td data-label="Posisi"><span class="myt-bench-pos is-' + row.position + '">' + esc(positionLabel(row)) + '</span>' +
            rankLine(row) + '</td>' +
          '<td data-label="Harga vs median"><b>' + fmtRp(p.price) + '</b>' + gapHtml(row) +
            (median != null && row.gap != null ? '<small>median ' + fmtRp(median) + '</small>' : '') + '</td>' +
          '<td data-label="Rating">' + fmtRating(p.rating) + '</td>' +
          '<td data-label="Omzet">' + omzetCell(p) + '</td>' +
          '<td data-label="">' + detailBtn(row.index) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="alat-hint">' + rows.length + ' produk · ' +
      (ctx.trackedIds ? ctx.trackedIds.length : 0) + ' / ' + (ctx.trackMax || 30) +
      ' dipantau. Omzet kosong berarti belum ada perkiraan, bukan nol.</p>';
  }

  function renderKompetitor(ctx, model) {
    var loading = !!ctx.loading;
    var c = model.counts;
    var kpis = kpi(loading && !model.rivals.length ? '…' : fmtN(model.rivals.length), 'Kompetitor utama', 'di kata kunci kamu') +
      kpi(loading && !model.marketCount ? '…' : fmtN(model.marketCount), 'Kata kunci terbanding', 'min. 5 kompetitor') +
      kpi(loading && !c.comparable ? '…' : fmtN(c.unggul), 'Produk lebih unggul', '') +
      kpi(loading && !c.comparable ? '…' : fmtN(c.bawah), 'Produk di bawah', '');

    var rivals = model.rivals;
    var table;
    if (loading && !rivals.length) {
      table = '<p class="myt-bench-empty">Membandingkan toko di kata kunci yang sama…</p>';
    } else if (!rivals.length) {
      table = '<p class="myt-bench-empty">Belum ada toko lain di kata kunci yang sama pada sapuan terbaru.</p>';
    } else {
      table = '<table class="myt-bench-table"><thead><tr>' +
        '<th>Toko</th><th>Kata kunci sama</th><th>Listing di sapuan</th><th>Harga vs kamu</th><th>Rating</th><th>Omzet</th>' +
        '</tr></thead><tbody>' +
        rivals.map(function (rv) {
          var feat = rv.featured || {};
          return '<tr><td data-label="Toko"><b>' + esc(rv.store_name || 'Toko') + '</b>' +
            (rv.location ? '<small>' + esc(rv.location) + '</small>' : '') + '</td>' +
            '<td data-label="Kata kunci sama">' + fmtN(rv.overlap) + '</td>' +
            '<td data-label="Listing di sapuan">' + (rv.n_listings != null ? fmtN(rv.n_listings) : '—') +
              '<small>yang kami lihat, bukan katalog penuh</small></td>' +
            '<td data-label="Harga vs kamu">' + rivalDeltaHtml(priceVsYou(rv, model.rows)) + '</td>' +
            '<td data-label="Rating">' + fmtRating(feat.rating) + '</td>' +
            '<td data-label="Omzet">' + (Number(rv.overlap_omzet) > 0
              ? '<b>' + esc(fmtRpShort(rv.overlap_omzet)) + '</b><small>perkiraan, listing yang sama</small>'
              : '<span class="myt-bench-muted">—</span>') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    var patterns = model.patterns;
    var pola = '';
    if (patterns.length) {
      pola = '<div class="myt-bench-cols">' + patterns.map(function (p) {
        return '<div class="myt-bench-pattern"><h3>' + esc(p.title) + '</h3><p>' + esc(p.text) + '</p></div>';
      }).join('') + '</div>';
    } else if (!loading) {
      pola = '<p class="myt-bench-empty">Belum ada pola harga atau ulasan yang cukup untuk ditampilkan. Video, voucher, dan jadwal promo tidak kami kumpulkan.</p>';
    }

    var cards = rivals.filter(function (rv) { return rv.featured && rv.featured.product_name; });
    var featured = '';
    if (cards.length) {
      featured = '<div class="myt-bench-fcards">' + cards.map(function (rv) {
        var f = rv.featured;
        return '<article class="myt-bench-fcard">' +
          imgHtml(f.image_url, 'myt-bench-fimg') +
          '<small>' + esc(rv.store_name || '') + '</small>' +
          '<b>' + esc(clip(f.product_name)) + '</b>' +
          '<span class="myt-bench-fprice">' + fmtRp(f.price) + '</span>' +
          '<span>' + fmtN(f.total_sold) + ' terjual kumulatif' +
            (Number(f.rating) > 0 ? ' · ' + fmtRating(f.rating) : '') + '</span>' +
          (Number(f.nowcast_omset_monthly) > 0
            ? '<span>' + esc(fmtRpShort(f.nowcast_omset_monthly)) + ' perkiraan</span>'
            : '') +
          '</article>';
      }).join('') + '</div>';
    }

    return '<div class="myt-bench-kpis">' + kpis + '</div>' +
      '<section class="myt-bench-card"><h3>Toko di kata kunci yang sama</h3>' +
        '<p class="alat-hint">Bukan peringkat kategori. Urutan dari berapa kata kunci kamu yang juga mereka munculi, lalu listing terlaris di irisan itu.</p>' +
        table + '</section>' +
      (pola ? '<section class="myt-bench-card"><h3>Pola yang terlihat</h3>' + pola + '</section>' : '') +
      (featured ? '<section class="myt-bench-card"><h3>Listing kompetitor di irisan yang sama</h3>' + featured + '</section>' : '');
  }

  function alertsHtml(alerts) {
    alerts = alerts || {};
    var email = !!alerts.email;
    var wa = !!alerts.wa;
    var weekly = alerts.cadence === 'weekly';
    return '<section class="alat-card">' +
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
      '<h3 class="alat-h3" style="margin-top:0">Kabar kompetitor</h3>' +
      '<p class="alat-lead">Opsional. Kabar mengikuti perubahan harga dan penjualan di produk yang kamu pantau.</p>' +
      '<div class="myt-alert-channels">' +
        '<label class="myt-alert-card' + (email ? ' is-on' : '') + '">' +
          '<input type="checkbox" id="myt-alert-email"' + (email ? ' checked' : '') + '>' +
          '<span><b>Email</b><small>Ke email akun LarisID</small></span></label>' +
        '<label class="myt-alert-card' + (wa ? ' is-on' : '') + '">' +
          '<input type="checkbox" id="myt-alert-wa"' + (wa ? ' checked' : '') + '>' +
          '<span><b>WhatsApp</b><small>Pesan singkat</small></span></label>' +
      '</div>' +
      '<div class="alat-row" id="myt-wa-row"' + (wa ? '' : ' hidden') + ' style="margin-top:12px">' +
        '<label class="alat-label" for="myt-wa-num" style="width:100%;margin:0">Nomor WhatsApp</label>' +
        '<input type="tel" id="myt-wa-num" class="alat-input" inputmode="tel" placeholder="0812xxxxxxxx" value="' + esc(alerts.wa_number || '') + '">' +
      '</div>' +
      '<fieldset class="myt-cadence"><legend>Frekuensi</legend>' +
        '<label><input type="radio" name="myt-cadence" value="daily"' + (weekly ? '' : ' checked') + '> Setiap hari</label>' +
        '<label><input type="radio" name="myt-cadence" value="weekly"' + (weekly ? ' checked' : '') + '> Sekali seminggu</label>' +
      '</fieldset>' +
      '<div class="alat-row alat-row-end"><button type="button" class="btn-primary" id="myt-alert-save">Simpan preferensi kabar</button></div>' +
      '<p class="alat-hint" id="myt-alert-msg" hidden></p>' +
    '</section>';
  }

  function shell(ctx, model) {
    var shop = ctx.shop || {};
    var meta = ctx.shopMeta || {};
    var info = model.shop || {};
    var name = shop.store_name || info.store_name || ('Toko ' + (shop.shop_id || ''));
    var loc = meta.location || info.location || '';
    var logo = ctx.shopLogo || '';
    if (!logo && ctx.listings && ctx.listings[0]) logo = ctx.listings[0].image_url || '';
    var tab = ctx.tab || 'ringkasan';
    var tabs = [
      ['ringkasan', 'Ringkasan'],
      ['produk', 'Produk'],
      ['kompetitor', 'Kompetitor'],
    ];
    return '<div class="myt-center myt-bench" id="myt-bench">' +
      '<header class="myt-bench-head">' +
        '<div class="myt-store-id">' +
          '<div class="myt-logo" aria-hidden="true"><span class="myt-logo-txt">' + esc(shopInitials(name)) + '</span>' +
            (logo ? '<img class="myt-logo-img" src="' + esc(thumb(logo)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
          '</div>' +
          '<div class="myt-store-text">' +
            '<p class="alat-kicker">My Toko</p>' +
            '<h2>' + esc(name) + '</h2>' +
            '<p class="myt-bench-sub">' +
              (loc ? esc(loc) + ' · ' : '') +
              'Shop ID ' + esc(String(shop.shop_id || '')) +
            '</p></div></div>' +
        '<div class="myt-bench-head-actions">' +
          '<button type="button" class="btn-ghost" id="myt-manage-toggle" aria-expanded="' + (ctx.manageOpen ? 'true' : 'false') + '">Kelola toko</button>' +
          '<button type="button" class="btn-primary" id="myt-refresh"' + (ctx.loading ? ' disabled' : '') + '>' +
            (ctx.loading ? 'Membandingkan…' : 'Analisis ulang') + '</button>' +
        '</div></header>' +
      '<div id="myt-manage"' + (ctx.manageOpen ? '' : ' hidden') + '>' + alertsHtml(ctx.alerts) + '</div>' +
      (ctx.error ? '<p class="alat-err myt-bench-status">' + esc(ctx.error) + '</p>' : '') +
      (ctx.loading ? '<p class="alat-hint myt-bench-status">Membandingkan listing kamu dengan sapuan kata kunci yang sama…</p>' : '') +
      '<div class="myt-bench-tabs" role="tablist">' +
        tabs.map(function (pair) {
          var on = pair[0] === tab;
          return '<button type="button" role="tab" class="myt-bench-tab' + (on ? ' is-on' : '') +
            '" data-bench-tab="' + pair[0] + '" aria-selected="' + (on ? 'true' : 'false') + '">' + pair[1] + '</button>';
        }).join('') +
      '</div>' +
      '<div id="myt-bench-main"></div>' +
      '<div id="myt-detail" class="myt-detail" hidden></div>' +
    '</div>';
  }

  function mount(root, ctx) {
    if (!root || !ctx) return;
    var sid = Number(ctx.shop && ctx.shop.shop_id) || 0;
    if (sid !== ui.shopId) {
      ui.q = '';
      ui.category = '';
      ui.sort = 'posisi';
      ui.shopId = sid;
    }
    var model = buildModel(ctx.listings || [], ctx.benchmark);
    root.innerHTML = shell(ctx, model);

    function wireRows() {
      root.querySelectorAll('[data-bench-detail]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = Number(btn.getAttribute('data-bench-detail'));
          if (ctx.onSelect) ctx.onSelect(idx);
        });
      });
    }

    function fillResults() {
      var box = root.querySelector('#myt-bench-results');
      if (!box) return;
      box.innerHTML = renderProductTable(ctx, model);
      wireRows();
    }

    var main = root.querySelector('#myt-bench-main');
    var tab = ctx.tab || 'ringkasan';
    if (tab === 'produk') {
      main.innerHTML = renderProduk(ctx, model);
      var q = root.querySelector('#myt-bench-q');
      var cat = root.querySelector('#myt-bench-cat');
      var sort = root.querySelector('#myt-bench-sort');
      if (q) q.addEventListener('input', function () { ui.q = q.value; fillResults(); });
      if (cat) cat.addEventListener('change', function () { ui.category = cat.value; fillResults(); });
      if (sort) sort.addEventListener('change', function () { ui.sort = sort.value || 'posisi'; fillResults(); });
      fillResults();
    } else if (tab === 'kompetitor') {
      main.innerHTML = renderKompetitor(ctx, model);
      wireRows();
    } else {
      main.innerHTML = renderRingkasan(ctx, model);
      wireRows();
    }

    root.querySelectorAll('[data-bench-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-bench-tab');
        if (next && ctx.onTab) ctx.onTab(next);
      });
    });
    var manageBtn = root.querySelector('#myt-manage-toggle');
    var panel = root.querySelector('#myt-manage');
    if (manageBtn && panel) {
      manageBtn.addEventListener('click', function () {
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        manageBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (ctx.onManage) ctx.onManage(!!open);
      });
    }
    var refresh = root.querySelector('#myt-refresh');
    if (refresh) {
      refresh.addEventListener('click', function () {
        if (ctx.onRefresh) ctx.onRefresh();
      });
    }
  }

  return {
    mount: mount,
    positionOf: positionOf,
    priceGap: priceGap,
    storeScore: storeScore,
    categoryShares: categoryShares,
    summarizeShop: summarizeShop,
    visiblePatterns: visiblePatterns,
    buildRows: buildRows,
    buildModel: buildModel,
    oldestLabel: oldestLabel,
    peerCount: peerCount,
  };
});
