/**
 * Connected My Toko benchmark: Ringkasan, Produk, Kompetitor.
 * One keyword market from get_toko_market. Omzet is the 30-day nowcast.
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

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function scoreOf(row) {
    return row && row.omzetN ? row.omzet : (row ? row.sold : 0);
  }

  function keywordScores(listings, hiddenItems) {
    var hide = hiddenItems || {};
    var map = Object.create(null);
    (listings || []).forEach(function (p) {
      if (!p || hide[String(p.item_id)]) return;
      var k = String(p.keyword || '').trim();
      if (!k) return;
      if (!map[k]) map[k] = { keyword: k, omzet: 0, omzetN: 0, sold: 0 };
      var o = Number(p.nowcast_omset_monthly);
      if (o > 0) {
        map[k].omzet += o;
        map[k].omzetN += 1;
      }
      map[k].sold += Number(p.total_sold) || 0;
    });
    var rows = Object.keys(map).map(function (k) { return map[k]; });
    rows.sort(function (a, b) { return scoreOf(b) - scoreOf(a); });
    return rows;
  }

  function keywordChoices(listings, bench, hiddenItems) {
    var scores = keywordScores(listings, hiddenItems);
    var peer = Object.create(null);
    var markets = bench && Array.isArray(bench.markets) ? bench.markets : [];
    markets.forEach(function (m) {
      if (m && m.keyword) peer[String(m.keyword)] = peerCount(m);
    });
    var eligible = scores.filter(function (s) {
      if (peer[s.keyword] == null) return true;
      return peer[s.keyword] >= 5;
    });
    if (!eligible.length) eligible = scores;
    var best = eligible[0] || null;
    var choices = [];
    if (best) {
      var top = scoreOf(best);
      choices = eligible.filter(function (s, i) {
        return i === 0 || (top > 0 && scoreOf(s) >= top * 0.25);
      }).slice(0, 4);
    }
    return { primary: best ? best.keyword : '', choices: choices };
  }

  function topPct(rank, n) {
    rank = Number(rank);
    n = Number(n);
    if (!(n >= 5) || !(rank >= 1)) return null;
    return Math.ceil((100 * rank) / n);
  }

  function avgOf(rows, key) {
    var sum = 0;
    var n = 0;
    (rows || []).forEach(function (row) {
      var v = num(row[key]);
      if (v == null) return;
      sum += v;
      n += 1;
    });
    return n ? sum / n : null;
  }

  function figuresFromListings(listings, keyword) {
    var omzet = 0;
    var nOm = 0;
    var rating = 0;
    var nR = 0;
    var reviews = 0;
    var price = 0;
    var nP = 0;
    var n = 0;
    (listings || []).forEach(function (p) {
      if (String(p.keyword || '') !== keyword) return;
      n += 1;
      var o = Number(p.nowcast_omset_monthly);
      if (o > 0) { omzet += o; nOm += 1; }
      var rt = Number(p.rating);
      if (rt > 0) { rating += rt; nR += 1; }
      reviews += Number(p.reviews) || 0;
      var pr = Number(p.price);
      if (pr > 0) { price += pr; nP += 1; }
    });
    return {
      n_listings: n,
      omzet: nOm ? omzet : null,
      rating: nR ? rating / nR : null,
      reviews: n ? reviews : null,
      avg_price: nP ? price / nP : null,
    };
  }

  function assembleView(ctx) {
    ctx = ctx || {};
    var market = ctx.market && ctx.market.ok !== false ? ctx.market : {};
    var keyword = String(ctx.keyword || market.keyword || '');
    var hideItems = Object.create(null);
    var hideShops = Object.create(null);
    (ctx.hiddenItems || []).forEach(function (id) { hideItems[String(id)] = true; });
    (ctx.hiddenShops || []).forEach(function (id) { hideShops[String(id)] = true; });
    var mineRpc = market.mine || {};
    var hiddenHere = [];
    (ctx.listings || []).forEach(function (p) {
      if (!hideItems[String(p.item_id)]) return;
      if (String(p.keyword || '') !== keyword) return;
      hiddenHere.push(p);
    });
    var you = {
      n_listings: num(mineRpc.n_listings),
      omzet: num(mineRpc.omzet),
      rating: num(mineRpc.rating),
      reviews: num(mineRpc.reviews),
      avg_price: num(mineRpc.avg_price),
    };
    var hidOm = 0;
    hiddenHere.forEach(function (p) {
      var o = Number(p.nowcast_omset_monthly);
      if (o > 0) hidOm += o;
    });
    if (hiddenHere.length && you.n_listings != null) {
      you.n_listings = Math.max(0, you.n_listings - hiddenHere.length);
    }
    if (hidOm && you.omzet != null) {
      you.omzet = you.omzet - hidOm;
      if (!(you.omzet > 0)) you.omzet = null;
    }
    if (hiddenHere.length) {
      var visible = (ctx.listings || []).filter(function (p) {
        return !hideItems[String(p.item_id)];
      });
      var fig = figuresFromListings(visible, keyword);
      you.n_listings = fig.n_listings;
      you.rating = fig.rating;
      you.reviews = fig.reviews;
      you.avg_price = fig.avg_price;
      if (you.omzet == null) you.omzet = fig.omzet;
    }

    var shops = [];
    (market.shops || []).forEach(function (s) {
      if (!s || hideShops[String(s.shop_id)]) return;
      shops.push(s);
    });
    var seenShop = Object.create(null);
    shops.forEach(function (s) { seenShop[String(s.shop_id)] = true; });
    var ownId = ctx.shop && ctx.shop.shop_id;
    (ctx.addedShops || []).forEach(function (s) {
      if (!s || seenShop[String(s.shop_id)] || hideShops[String(s.shop_id)]) return;
      if (Number(s.shop_id) === Number(ownId)) return;
      shops.push({
        shop_id: s.shop_id,
        store_name: s.store_name || 'Toko',
        location: s.location || '',
        n_listings: null,
        omzet: null,
        rating: null,
        reviews: null,
        avg_price: null,
        rank: null,
        added: true,
        is_mine: false,
      });
    });

    var recount = hiddenHere.length > 0 || (ctx.hiddenShops && ctx.hiddenShops.length);
    var others = shops.filter(function (s) { return !s.is_mine; });
    if (recount && you.omzet > 0) {
      var ahead = 0;
      others.forEach(function (s) {
        if (num(s.omzet) > you.omzet) ahead += 1;
      });
      you.rank = ahead + 1;
    } else {
      you.rank = you.omzet > 0 ? num(mineRpc.rank) : null;
    }

    var averages = market.averages || {};
    var avg = {
      omzet: num(averages.omzet),
      n_listings: num(averages.n_listings),
      rating: num(averages.rating),
      reviews: num(averages.reviews),
      avg_price: num(averages.avg_price),
    };
    if (recount) {
      avg = {
        omzet: avgOf(others, 'omzet'),
        n_listings: avgOf(others, 'n_listings'),
        rating: avgOf(others, 'rating'),
        reviews: avgOf(others, 'reviews'),
        avg_price: avgOf(others, 'avg_price'),
      };
    }

    var nField = recount
      ? others.filter(function (s) { return num(s.omzet) > 0; }).length + (you.omzet > 0 ? 1 : 0)
      : num(market.ranked_shops);
    var pct = topPct(you.rank, nField);
    var showRank = nField >= 5 && you.rank >= 1;

    function comp(kind, label, yours, avgValue, money) {
      if (kind === 'omzet' && !(yours > 0)) return null;
      if (yours == null || !(avgValue > 0)) return null;
      return {
        kind: kind,
        label: label,
        you: yours,
        avg: avgValue,
        money: !!money,
        index: (yours / avgValue) * 100,
      };
    }
    var comps = [
      comp('omzet', 'Penjualan', you.omzet, avg.omzet, true),
      comp('count', 'Jumlah produk', you.n_listings, avg.n_listings, false),
      comp('rating', 'Penilaian', you.rating, avg.rating, false),
      comp('reviews', 'Ulasan', you.reviews, avg.reviews, false),
      comp('price', 'Harga', you.avg_price, avg.avg_price, true),
    ].filter(Boolean);

    var products = (ctx.listings || []).filter(function (p) {
      return p && !hideItems[String(p.item_id)];
    });
    products.sort(function (a, b) {
      var ak = String(a.keyword || '') === keyword ? 0 : 1;
      var bk = String(b.keyword || '') === keyword ? 0 : 1;
      if (ak !== bk) return ak - bk;
      return (Number(b.nowcast_omset_monthly) || 0) - (Number(a.nowcast_omset_monthly) || 0);
    });
    var selected = null;
    products.forEach(function (p) {
      if (selected) return;
      if (String(p.item_id) === String(ctx.selectedItemId)) selected = p;
    });
    if (!selected) {
      products.forEach(function (p) {
        if (selected) return;
        if (String(p.keyword || '') === keyword) selected = p;
      });
    }
    if (!selected) selected = products[0] || null;

    var item = market.item || null;
    if (item && selected && String(item.item_id) !== String(selected.item_id)) item = null;
    var listingAvg = market.listing_avg || {};

    return {
      keyword: keyword,
      peerCount: num(market.peer_count) || 0,
      shopCount: num(market.shop_count) || shops.length,
      listingCount: num(market.listing_count) || 0,
      rankedListings: num(market.ranked_listings) || 0,
      you: you,
      manualShop: num(ctx.manual && ctx.manual.shop),
      manualItems: (ctx.manual && ctx.manual.items) || {},
      avg: avg,
      shops: shops,
      comps: comps,
      showRank: showRank,
      topPct: pct,
      points: market.points || [],
      weeks: market.weeks || [],
      itemWeeks: market.item_weeks || [],
      products: products,
      selected: selected,
      item: item,
      listingAvg: listingAvg,
      medianPrice: num(listingAvg.median_price),
    };
  }

  function weekLabel(iso) {
    var d = new Date(String(iso) + 'T00:00:00');
    if (!Number.isFinite(d.getTime())) return '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function moneyOrNum(v, money) {
    if (v == null) return '—';
    return money ? fmtRpShort(v) : (Math.abs(v) >= 10 && Math.abs(v) < 1000 && String(v).indexOf('.') >= 0
      ? fmtRating(v)
      : (money ? fmtRpShort(v) : (Number(v) > 20 ? fmtN(v) : fmtRating(v))));
  }

  function cellValue(comp) {
    if (comp.kind === 'rating') return fmtRating(comp.you);
    if (comp.kind === 'price' || comp.kind === 'omzet') return fmtRpShort(comp.you);
    return fmtN(comp.you);
  }

  function cellAvg(comp) {
    if (comp.kind === 'rating') return fmtRating(comp.avg);
    if (comp.kind === 'price' || comp.kind === 'omzet') return fmtRpShort(comp.avg);
    return fmtN(comp.avg);
  }

  function deltaHtml(you, avg, kind) {
    if (you == null || !(avg > 0)) return '<span class="myt-bench-muted">—</span>';
    var pct = Math.round(((you - avg) / avg) * 100);
    var good = kind === 'price' ? pct < 0 : pct > 0;
    var cls = pct === 0 ? 'is-flat' : (good ? 'is-up' : 'is-down');
    var arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '');
    var n = (pct > 0 ? '+' : '') + pct + '%';
    return '<span class="myt-bench-delta ' + cls + '">' + arrow + ' ' + n + '</span>';
  }

  function manualForm(itemId) {
    return '<form class="myt-manual" data-manual-item="' + Number(itemId || 0) + '">' +
      '<input class="alat-input" type="number" min="0" step="1" inputmode="numeric" placeholder="Omzet 30 hari, Rp" aria-label="Omzet 30 hari">' +
      '<button type="submit" class="btn-primary">Simpan</button></form>';
  }

  function omzetBits(value, manual, itemId) {
    if (value > 0) return { html: '<b>' + esc(fmtRpShort(value)) + '</b><small>perkiraan</small>', filled: true };
    if (manual > 0) return { html: '<b>' + esc(fmtRpShort(manual)) + '</b><small>kamu isi</small>', filled: false };
    return { html: manualForm(itemId), filled: false };
  }

  function metricIcon(kind) {
    var open = '<svg class="myt-ico" viewBox="0 0 16 16" aria-hidden="true">';
    if (kind === 'omzet') return open + '<path d="M1.5 12.5 L5.5 7.5 L8.2 9.6 L14.5 3" fill="none" stroke="#B5202A" stroke-width="1.4" stroke-linecap="round"/></svg>';
    if (kind === 'count') return open + '<rect x="2" y="2" width="5" height="5" rx="1" fill="#F9EAE4" stroke="#B5202A"/><rect x="9" y="2" width="5" height="5" rx="1" fill="#F9EAE4" stroke="#B5202A"/><rect x="2" y="9" width="5" height="5" rx="1" fill="#F9EAE4" stroke="#B5202A"/><rect x="9" y="9" width="5" height="5" rx="1" fill="#F9EAE4" stroke="#B5202A"/></svg>';
    if (kind === 'rating') return open + '<path d="M8 1.8 L9.5 5.4 L13.4 5.8 L10.4 8.3 L11.3 12.2 L8 10.2 L4.7 12.2 L5.6 8.3 L2.6 5.8 L6.5 5.4 Z" fill="#C9974B"/></svg>';
    if (kind === 'reviews') return open + '<path d="M2 3 H14 V10.5 H6.2 L3.2 13.2 V10.5 H2 Z" fill="none" stroke="#1A1A1A" stroke-width="1.2"/></svg>';
    return open + '<path d="M2.5 3.5 H13.5 L11.2 12.5 H4.8 Z" fill="none" stroke="#1A1A1A" stroke-width="1.2"/></svg>';
  }

  function indexTone(kind, index) {
    if (Math.round(index) === 100) return '#8A8A8A';
    var better = kind === 'price' ? index < 100 : index > 100;
    return better ? '#16A34A' : '#DC2626';
  }

  function spiderSvg(comps) {
    var axes = comps.filter(function (c) { return c.index > 0; });
    if (axes.length < 3) return '';
    var max = 150;
    axes.forEach(function (a) { if (a.index > max) max = a.index; });
    var cx = 160;
    var cy = 118;
    var R = 68;
    function pt(i, index) {
      var ang = (-Math.PI / 2) + (i * 2 * Math.PI / axes.length);
      var rr = R * Math.max(0, index) / max;
      return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr];
    }
    function poly(indexOf) {
      return axes.map(function (a, i) {
        var p = pt(i, indexOf(a));
        return p[0].toFixed(1) + ',' + p[1].toFixed(1);
      }).join(' ');
    }
    var spokes = axes.map(function (a, i) {
      var p = pt(i, max);
      return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#E8E8E8"/>';
    }).join('');
    var labels = axes.map(function (a, i) {
      var p = pt(i, max * 1.28);
      var anchor = p[0] < cx - 8 ? 'end' : (p[0] > cx + 8 ? 'start' : 'middle');
      return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="' + anchor + '" font-size="10" fill="#1A1A1A">' +
        esc(a.label) + ' <tspan fill="' + indexTone(a.kind, a.index) + '" font-weight="700">' + Math.round(a.index) + '</tspan></text>';
    }).join('');
    var ring = (R * 100 / max).toFixed(1);
    return '<svg class="myt-chart" viewBox="0 0 320 236" role="img" aria-label="Indeks toko dibanding rata-rata">' +
      spokes +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + ring + '" fill="#E8E0D4" fill-opacity="0.45" stroke="#C8C2B4"/>' +
      '<polygon points="' + poly(function (a) { return a.index; }) + '" fill="#B5202A" fill-opacity="0.18" stroke="#B5202A" stroke-width="2"/>' +
      labels + '</svg>';
  }

  function scatterSvg(points, xOf, yOf, mine, axis) {
    var pts = (points || []).filter(function (p) { return xOf(p) > 0 && yOf(p) > 0; });
    if (pts.length < 2) return '<p class="myt-bench-empty">Belum cukup titik.</p>';
    var maxX = 0;
    var maxY = 0;
    pts.forEach(function (p) {
      if (xOf(p) > maxX) maxX = xOf(p);
      if (yOf(p) > maxY) maxY = yOf(p);
    });
    if (!(maxX > 0) || !(maxY > 0)) return '<p class="myt-bench-empty">Belum cukup titik.</p>';
    maxX *= 1.12;
    maxY *= 1.12;
    function X(v) { return 48 + (v / maxX) * 228; }
    function Y(v) { return 148 - (v / maxY) * 112; }
    function dotColor(p, on) {
      if (on) return '#B5202A';
      var rank = p.store_name ? p.rank : p.sold_rank;
      if (rank === 1) return '#C9974B';
      if (rank === 2) return '#8A8A8A';
      if (rank === 3) return '#A15C38';
      return '#D9D3C8';
    }
    var ordered = pts.filter(function (p) { return !mine(p); }).concat(pts.filter(mine));
    var grid = [0, 0.5, 1].map(function (t) {
      var y = Y(maxY * t).toFixed(1);
      var x = X(maxX * t).toFixed(1);
      return '<line x1="48" y1="' + y + '" x2="276" y2="' + y + '" stroke="#F1F1F2"/>' +
        '<line x1="' + x + '" y1="36" x2="' + x + '" y2="148" stroke="#F1F1F2"/>';
    }).join('');
    var ticks = '<text x="44" y="40" text-anchor="end" font-size="8" fill="#8A8A8A">' + esc(fmtRpShort(maxY / 1.12)) + '</text>' +
      '<text x="276" y="164" text-anchor="end" font-size="8" fill="#8A8A8A">' + esc(fmtN(Math.round(maxX / 1.12))) + '</text>';
    var dots = ordered.map(function (p) {
      var on = mine(p);
      return '<circle cx="' + X(xOf(p)).toFixed(1) + '" cy="' + Y(yOf(p)).toFixed(1) +
        '" r="' + (on ? 6 : 4.5) + '" fill="' + dotColor(p, on) + '"' +
        (on ? ' stroke="#fff" stroke-width="1.5"' : '') + '/>';
    }).join('');
    var names = axis || {};
    var caption = (names.x || names.y)
      ? '<text x="162" y="176" text-anchor="middle" font-size="9" fill="#8A8A8A">' +
        esc(names.x || '') + ' → ' + esc(names.y || '') + '</text>'
      : '';
    return '<svg class="myt-chart" viewBox="0 0 300 184" role="img" aria-label="Sebaran kompetitor">' +
      grid + ticks + dots + caption + '</svg>';
  }

  function lineSvg(series) {
    var usable = (series || []).filter(function (s) { return s.weeks && s.weeks.length >= 2; });
    if (!usable.length) return '<p class="myt-bench-empty">Belum ada dua sapuan terukur.</p>';
    var weeks = [];
    var seen = Object.create(null);
    usable.forEach(function (s) {
      s.weeks.forEach(function (w) {
        var key = String(w.week_start);
        if (!key || seen[key]) return;
        seen[key] = true;
        weeks.push(key);
      });
    });
    weeks.sort();
    var maxY = 0;
    usable.forEach(function (s) {
      s.weeks.forEach(function (w) { if (Number(w.omzet) > maxY) maxY = Number(w.omzet); });
    });
    if (!(maxY > 0) || weeks.length < 2) return '<p class="myt-bench-empty">Belum ada dua sapuan terukur.</p>';
    function X(iso) {
      var i = weeks.indexOf(String(iso));
      return 58 + (i / (weeks.length - 1)) * 220;
    }
    function Y(v) { return 132 - (Number(v) / maxY) * 100; }
    var colors = ['#1A1A1A', '#C9974B', '#8A8A8A', '#E38B86', '#8E191F'];
    var marks = '';
    var paths = usable.map(function (s, si) {
      var color = s.mine ? '#B5202A' : colors[si % colors.length];
      var sorted = s.weeks.slice().sort(function (a, b) {
        return String(a.week_start) < String(b.week_start) ? -1 : 1;
      });
      var d = '';
      var prev = '';
      sorted.forEach(function (w) {
        var x = X(w.week_start).toFixed(1);
        var y = Y(w.omzet).toFixed(1);
        var gap = prev ? (new Date(w.week_start) - new Date(prev)) / 86400000 : 0;
        d += (!prev || gap > 8 ? 'M' : 'L') + x + ' ' + y;
        var solid = w.measured === true;
        marks += '<circle cx="' + x + '" cy="' + y + '" r="3.2" fill="' + (solid ? color : '#fff') +
          '" stroke="' + color + '" stroke-width="1.5"/>';
        prev = w.week_start;
      });
      var measured = sorted.every(function (w) { return w.measured === true; });
      return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"' +
        (measured ? '' : ' stroke-dasharray="4 3"') + '/>';
    }).join('');
    var grid = [0, 0.5, 1].map(function (t) {
      var y = Y(maxY * t).toFixed(1);
      var label = t === 0 ? '0' : fmtRpShort(maxY * t);
      return '<line x1="58" y1="' + y + '" x2="278" y2="' + y + '" stroke="#F1F1F2"/>' +
        '<text x="54" y="' + (Number(y) + 3).toFixed(1) + '" text-anchor="end" font-size="8" fill="#8A8A8A">' + esc(label) + '</text>';
    }).join('');
    var labels = weeks.map(function (iso) {
      return '<text x="' + X(iso).toFixed(1) + '" y="156" text-anchor="middle" font-size="9" fill="#8A8A8A">' +
        esc(weekLabel(iso)) + '</text>';
    }).join('');
    var legend = '<ul class="myt-tren-legend">' + usable.map(function (s, si) {
      var color = s.mine ? '#B5202A' : colors[si % colors.length];
      return '<li><i style="background:' + color + '"></i><span>' + esc(s.name || 'Toko') + '</span></li>';
    }).join('') + '</ul>';
    return '<svg class="myt-chart" viewBox="0 0 300 168" role="img" aria-label="Tren penjualan mingguan toko yang dipantau">' +
      grid + paths + marks + labels + '</svg>' + legend;
  }

  function barsSvg(points, itemId) {
    var rows = (points || []).filter(function (p) { return num(p.nowcast) > 0; });
    rows.sort(function (a, b) { return num(b.nowcast) - num(a.nowcast); });
    var mine = null;
    rows.forEach(function (p) {
      if (String(p.item_id) === String(itemId)) mine = p;
    });
    var shown = rows.slice(0, 36);
    if (mine && shown.indexOf(mine) < 0) {
      shown = shown.slice(0, 35);
      shown.push(mine);
    }
    if (!shown.length) return '<p class="myt-bench-empty">Belum ada perkiraan pembanding.</p>';
    var max = 0;
    shown.forEach(function (p) { if (num(p.nowcast) > max) max = num(p.nowcast); });
    var bars = shown.map(function (p, i) {
      var h = Math.max(4, (num(p.nowcast) / max) * 86);
      var on = String(p.item_id) === String(itemId);
      var x = 8 + i * (280 / shown.length);
      var w = Math.max(3, (280 / shown.length) - 2);
      return '<rect x="' + x.toFixed(1) + '" y="' + (110 - h).toFixed(1) + '" width="' + w.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="2" fill="' + (on ? '#B5202A' : '#E7E2DA') + '"/>';
    }).join('');
    return '<svg class="myt-chart" viewBox="0 0 300 120" role="img" aria-label="Peringkat produk di kata kunci ini">' +
      bars + '</svg>';
  }

  function weekGroups(weeks) {
    var map = Object.create(null);
    (weeks || []).forEach(function (w) {
      var id = String(w.shop_id);
      if (!map[id]) map[id] = [];
      map[id].push(w);
    });
    return map;
  }

  function shopSeries(view) {
    var groups = weekGroups(view.weeks);
    var top = [];
    view.shops.forEach(function (s) {
      if (s.rank >= 1 && s.rank <= 5) top.push(s);
    });
    var mine = null;
    view.shops.forEach(function (s) { if (s.is_mine) mine = s; });
    if (mine && !(mine.rank >= 1 && mine.rank <= 5)) top.push(mine);
    return top.map(function (s) {
      return {
        name: s.store_name,
        mine: !!s.is_mine,
        weeks: groups[String(s.shop_id)] || [],
      };
    }).filter(function (s) { return s.weeks.length >= 2; });
  }

  function insightLines(view) {
    var lines = [];
    var others = view.shops.filter(function (s) { return !s.is_mine && num(s.omzet) > 0; });
    others.sort(function (a, b) { return num(b.omzet) - num(a.omzet); });
    if (others[0]) {
      lines.push({
        tone: 'gold',
        text: others[0].store_name + ' · ' + fmtRpShort(others[0].omzet) + ' perkiraan · ' + fmtN(others[0].n_listings) + ' produk',
      });
    }
    var worst = null;
    view.comps.forEach(function (c) {
      var gap = c.kind === 'price' ? c.index - 100 : 100 - c.index;
      if (gap > 0 && (!worst || gap > worst.gap)) worst = { gap: gap, comp: c };
    });
    if (worst) {
      var behind = worst.comp.kind === 'price' ? worst.comp.index > 100 : worst.comp.index < 100;
      var dir = worst.comp.index < 100 ? 'di bawah' : 'di atas';
      lines.push({
        tone: behind ? 'down' : 'up',
        text: worst.comp.label + ' kamu ' + Math.abs(Math.round(worst.comp.index - 100)) + '% ' + dir + ' rata-rata.',
      });
    }
    var price = null;
    view.comps.forEach(function (c) { if (c.kind === 'price') price = c; });
    if (price && price.index > 105) {
      lines.push({
        tone: 'down',
        text: 'Harga rata-rata kamu ' + Math.round(price.index - 100) + '% di atas rata-rata di kata kunci ini.',
      });
    } else {
      var count = null;
      view.comps.forEach(function (c) { if (c.kind === 'count') count = c; });
      if (count && count.index < 80) {
        lines.push({ tone: 'down', text: 'Produk yang terlihat di kata kunci ini lebih sedikit dari rata-rata.' });
      } else if (count && count.index >= 100) {
        lines.push({ tone: 'up', text: 'Jumlah produk yang terlihat di kata kunci ini di atas rata-rata.' });
      }
    }
    return lines.slice(0, 3);
  }

  function topTable(view) {
    var rows = [];
    view.shops.forEach(function (s) {
      if (s.rank >= 1 && s.rank <= 5) rows.push(s);
    });
    rows.sort(function (a, b) { return a.rank - b.rank; });
    var mine = null;
    view.shops.forEach(function (s) { if (s.is_mine) mine = s; });
    if (mine && !(mine.rank >= 1 && mine.rank <= 5)) rows.push(mine);
    if (!rows.length) return '<p class="myt-bench-empty">Belum ada toko dengan perkiraan di kata kunci ini.</p>';
    return '<table class="myt-bench-table"><thead><tr><th>#</th><th>Toko</th><th>Penjualan</th><th>Produk</th><th>Nilai</th></tr></thead><tbody>' +
      rows.map(function (s) {
        var name = esc(s.store_name || 'Toko');
        var shopBtn = s.shop_id
          ? '<button type="button" class="myt-shop-link" data-open-shop="' + Number(s.shop_id) + '">' + name + '</button>'
          : '<b class="myt-one-line">' + name + '</b>';
        return '<tr class="' + (s.is_mine ? 'is-mine' : '') + '">' +
          '<td data-label="#">' + (s.rank || '—') + '</td>' +
          '<td data-label="Toko">' + shopBtn + (s.is_mine ? '<small>Kamu</small>' : '') + '</td>' +
          '<td data-label="Penjualan">' + (num(s.omzet) > 0 ? esc(fmtRpShort(s.omzet)) + '<small>perkiraan</small>' : '—') + '</td>' +
          '<td data-label="Produk">' + (s.n_listings != null ? fmtN(s.n_listings) : '—') + '</td>' +
          '<td data-label="Nilai">' + fmtRating(s.rating) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function rivalDelta(s, you) {
    var yours = you && you.omzet;
    var theirs = num(s.omzet);
    if (!(yours > 0) || !(theirs > 0)) return '<span class="myt-bench-muted">—</span>';
    var pct = Math.round(((theirs - yours) / yours) * 100);
    var cls = pct > 0 ? 'is-up' : (pct < 0 ? 'is-down' : 'is-flat');
    return '<span class="myt-bench-delta ' + cls + '">' + (pct > 0 ? '+' : '') + pct + '%</span>';
  }

  function rivalRows(view, q) {
    q = String(q || '').trim().toLowerCase();
    var rows = view.shops.filter(function (s) {
      if (!q) return true;
      return String(s.store_name || '').toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) { return (a.rank || 9999) - (b.rank || 9999); });
    if (!rows.length) return '<tr><td colspan="8">Tidak ada toko dengan nama itu.</td></tr>';
    return rows.map(function (s) {
      var mine = !!s.is_mine;
      var medal = s.rank === 1 ? ' is-gold' : (s.rank === 2 ? ' is-silver' : (s.rank === 3 ? ' is-bronze' : ''));
      return '<tr class="' + (mine ? 'is-mine' : '') + medal + '">' +
        '<td data-label="#"><span class="myt-medal' + medal + '">' + (s.rank || '—') + '</span></td>' +
        '<td data-label="Toko"><b class="myt-one-line">' + esc(s.store_name || 'Toko') + '</b>' +
          (mine ? '<small>Kamu</small>' : '') + '</td>' +
        '<td data-label="Kota">' + (s.location ? esc(s.location) : '—') + '</td>' +
        '<td data-label="Penjualan">' + (num(s.omzet) > 0 ? esc(fmtRpShort(s.omzet)) + '<small>perkiraan</small>' : '—') + '</td>' +
        '<td data-label="Produk">' + (s.n_listings != null ? fmtN(s.n_listings) : '—') + '</td>' +
        '<td data-label="Nilai">' + fmtRating(s.rating) + '</td>' +
        '<td data-label="Harga">' + (num(s.avg_price) > 0 ? esc(fmtRp(s.avg_price)) : '—') + '</td>' +
        '<td data-label="">' + (mine ? '—' : rivalDelta(s, view.you)) +
          (mine ? '' : ' <button type="button" class="btn-ghost myt-hide" data-hide-shop="' + Number(s.shop_id) + '">Sembunyikan</button>') +
        '</td></tr>';
    }).join('');
  }

  function renderRingkasan(ctx, view) {
    var youBits = omzetBits(view.you.omzet, view.manualShop, 0);
    var posisi = view.showRank
      ? '<b class="myt-lay-rank">#' + view.you.rank + '</b><span>dari ' + fmtN(view.shopCount) + ' toko</span>'
      : '<b class="myt-lay-rank">—</b><span>' + (ctx.marketLoading ? 'Menghitung…' : 'Belum cukup toko') + '</span>';
    var top3 = view.shops.filter(function (s) { return s.rank >= 1 && s.rank <= 3; })
      .sort(function (a, b) { return a.rank - b.rank; });
    var top3Html = top3.length
      ? '<ol class="myt-lay-ol">' + top3.map(function (s) {
        return '<li class="is-r' + s.rank + (s.is_mine ? ' is-mine' : '') + '">' +
          '<b class="myt-lay-place">' + s.rank + '</b>' +
          '<span class="myt-lay-name">' + esc(s.store_name || 'Toko') + (s.is_mine ? ' (Kamu)' : '') + '</span>' +
          '<b class="myt-lay-amt">' + esc(fmtRpShort(s.omzet)) + '</b></li>';
      }).join('') + '</ol>'
      : '<p class="myt-bench-empty">Belum ada perkiraan 30 hari.</p>';
    var pct = view.showRank && view.topPct != null
      ? '<div class="myt-lay-pct"><b>Top ' + view.topPct + '%</b><span>di kata kunci ini</span></div>'
      : '';
    var cmpRows = view.comps.map(function (c) {
      var youCell = c.kind === 'omzet' ? youBits.html : cellValue(c);
      return '<tr><td data-label="Metrik"><span class="myt-cmp-item">' + metricIcon(c.kind) +
        '<span>' + esc(c.label) + '</span></span></td>' +
        '<td data-label="Toko kamu">' + youCell + '</td>' +
        '<td data-label="Rata-rata">' + cellAvg(c) + '</td>' +
        '<td data-label="Perbedaan">' + deltaHtml(c.you, c.avg, c.kind) + '</td></tr>';
    }).join('');
    var penjualanRow = '';
    if (!(view.you.omzet > 0)) {
      penjualanRow = '<tr><td data-label="Metrik"><span class="myt-cmp-item">' + metricIcon('omzet') +
        '<span>Penjualan</span></span></td><td data-label="Toko kamu">' + youBits.html +
        '</td><td data-label="Rata-rata">—</td><td data-label=""></td></tr>';
    }
    var cmp = (view.comps.length || penjualanRow)
      ? '<table class="myt-bench-table myt-cmp"><thead><tr><th>Metrik</th><th>Toko kamu</th><th>Rata-rata</th><th></th></tr></thead><tbody>' +
        penjualanRow + cmpRows + '</tbody></table>'
      : '<p class="myt-bench-empty">Belum ada rata-rata di kata kunci ini.</p>';
    var spider = spiderSvg(view.comps);
    var rows = [];
    if (ctx.benchmark) {
      rows = buildRows(ctx.listings || [], ctx.benchmark.markets || []).filter(function (r) {
        return String(r.listing.keyword || '') === view.keyword;
      });
    }
    var summary = summarizeShop(rows);
    function side(title, items, tone) {
      var body = items.length
        ? '<ul class="myt-bench-list">' + items.slice(0, 3).map(function (item) {
          return '<li>' + esc(item.text) + '</li>';
        }).join('') + '</ul>'
        : '<p class="myt-bench-empty">Belum ada catatan.</p>';
      return '<section class="myt-bench-card myt-lay-' + tone + '"><h3>' + title + '</h3>' + body + '</section>';
    }
    return '<p class="myt-lay-kw">di kata kunci ini · ' + esc(view.keyword || '—') + '</p>' +
      '<div class="myt-lay-top">' +
        '<section class="myt-bench-card myt-lay-posisi"><h3>Posisi toko</h3>' + posisi + '</section>' +
        '<section class="myt-bench-card"><h3>Peringkat penjualan</h3>' +
          '<div class="myt-lay-rankrow">' + top3Html + pct + '</div></section>' +
      '</div>' +
      '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Perbandingan</h3>' + cmp + '</section>' +
        '<section class="myt-bench-card"><h3>Indeks</h3>' +
          (spider || '<p class="myt-bench-empty">Perlu minimal 3 metrik.</p>') +
          '<p class="myt-lay-legend"><i class="is-you"></i> Kamu <i class="is-avg"></i> Rata-rata = 100</p></section>' +
      '</div>' +
      '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Peringkat kompetitor</h3>' + topTable(view) + '</section>' +
        '<section class="myt-bench-card"><h3>Tren penjualan</h3>' + lineSvg(shopSeries(view)) + '</section>' +
      '</div>' +
      '<div class="myt-bench-split">' +
        side('Sudah jalan', summary.ok, 'ok') +
        side('Bisa diubah', summary.warn, 'warn') +
      '</div>';
  }

  function renderKompetitor(ctx, view) {
    var lines = insightLines(view);
    var insights = lines.length
      ? '<ul class="myt-intisari">' + lines.map(function (t) {
        return '<li class="is-' + t.tone + '">' + esc(t.text) + '</li>';
      }).join('') + '</ul>'
      : '<p class="myt-bench-empty">Belum ada selisih yang bisa dihitung.</p>';
    var mineId = ctx.shop && ctx.shop.shop_id;
    return '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Peta kompetitor</h3>' +
          scatterSvg(view.shops, function (s) { return num(s.n_listings) || 0; }, function (s) { return num(s.omzet) || 0; }, function (s) {
            return !!s.is_mine || Number(s.shop_id) === Number(mineId);
          }, { x: 'Produk terlihat', y: 'Penjualan 30 hari' }) +
          '<p class="myt-lay-legend"><i class="is-you"></i> Kamu <i class="is-gold"></i> 1 <i class="is-silver"></i> 2 <i class="is-bronze"></i> 3</p></section>' +
        '<section class="myt-bench-card"><h3>Intisari</h3>' + insights + '</section>' +
      '</div>' +
      '<section class="myt-bench-card">' +
        '<div class="myt-lay-tools">' +
          '<input type="search" id="myt-rival-q" class="alat-input" placeholder="Cari kompetitor" value="' + esc(ui.q || '') + '">' +
          '<input type="search" id="myt-add-q" class="alat-input" placeholder="Tambah toko" autocomplete="off">' +
          '<button type="button" class="btn-primary" id="myt-add-go">Tambah</button>' +
        '</div>' +
        '<div id="myt-add-picker" class="alat-picker" hidden></div>' +
        '<div class="myt-rival-scroll">' +
          '<table class="myt-bench-table myt-rival-table"><thead><tr><th>#</th><th>Toko</th><th>Kota</th><th>Penjualan</th><th>Produk</th><th>Nilai</th><th>Harga</th><th>Selisih vs kamu</th></tr></thead>' +
          '<tbody id="myt-rival-body">' + rivalRows(view, ui.q) + '</tbody></table>' +
        '</div>' +
      '</section>';
  }

  function productComps(view) {
    var item = view.item;
    var listing = view.selected;
    var avg = view.listingAvg || {};
    var youOm = item ? num(item.nowcast) : (listing ? num(listing.nowcast_omset_monthly) : null);
    var youPrice = item ? num(item.price) : (listing ? num(listing.price) : null);
    var youRating = item ? num(item.rating) : (listing ? num(listing.rating) : null);
    var youReviews = item ? num(item.reviews) : (listing ? num(listing.reviews) : null);
    function row(kind, label, yours, avgValue, money) {
      if (kind === 'omzet' && !(yours > 0)) return null;
      if (yours == null || !(Number(avgValue) > 0)) return null;
      return { kind: kind, label: label, you: yours, avg: Number(avgValue), money: !!money, index: (yours / Number(avgValue)) * 100 };
    }
    return {
      omzet: youOm,
      rows: [
        row('omzet', 'Penjualan', youOm, avg.omzet, true),
        row('price', 'Harga', youPrice, avg.price, true),
        row('rating', 'Penilaian', youRating, avg.rating, false),
        row('reviews', 'Ulasan', youReviews, avg.reviews, false),
      ].filter(Boolean),
    };
  }

  function renderProduk(ctx, view) {
    var listing = view.selected;
    var opts = view.products.map(function (p) {
      var on = listing && String(p.item_id) === String(listing.item_id);
      return '<option value="' + Number(p.item_id) + '"' + (on ? ' selected' : '') + '>' +
        esc(clip(p.product_name)) + '</option>';
    }).join('');
    var perf = productComps(view);
    var manual = listing ? num(view.manualItems[String(listing.item_id)]) : null;
    var bits = omzetBits(perf.omzet, manual, listing ? listing.item_id : 0);
    var perfRows = perf.rows.map(function (c) {
      var youCell = c.kind === 'omzet' ? bits.html : (c.kind === 'rating' ? fmtRating(c.you) : (c.kind === 'price' ? fmtRp(c.you) : fmtN(c.you)));
      var avgCell = c.kind === 'rating' ? fmtRating(c.avg) : (c.kind === 'price' || c.kind === 'omzet' ? fmtRpShort(c.avg) : fmtN(c.avg));
      return '<tr><td data-label="Metrik"><span class="myt-cmp-item">' + metricIcon(c.kind) +
        '<span>' + esc(c.label) + '</span></span></td><td data-label="Produk kamu">' + youCell +
        '</td><td data-label="Rata-rata">' + avgCell + '</td><td data-label="">' + deltaHtml(c.you, c.avg, c.kind) + '</td></tr>';
    }).join('');
    var rankN = view.rankedListings;
    var rank = view.item ? num(view.item.rank) : null;
    var rankBlock = rank >= 1
      ? '<b class="myt-lay-rank">#' + rank + '</b><span>dari ' + fmtN(rankN) + ' produk</span>'
      : '<b class="myt-lay-rank">—</b>';
    var itemWeeks = (view.itemWeeks || []).map(function (w) {
      return { week_start: w.week_start, omzet: w.omzet, measured: w.measured };
    });
    var peers = (view.points || []).slice().sort(function (a, b) {
      return (num(a.sold_rank) || 9999) - (num(b.sold_rank) || 9999);
    }).slice(0, 8);
    if (listing && !peers.some(function (p) { return String(p.item_id) === String(listing.item_id); }) && view.item) {
      peers.push(view.item);
    }
    var peerTable = peers.length
      ? '<table class="myt-bench-table"><thead><tr><th>#</th><th>Produk</th><th>Penjualan</th><th>Harga</th><th>Nilai</th></tr></thead><tbody>' +
        peers.map(function (p) {
          var mine = listing && String(p.item_id) === String(listing.item_id);
          var place = num(p.sold_rank);
          var medal = place === 1 ? ' is-gold' : (place === 2 ? ' is-silver' : (place === 3 ? ' is-bronze' : ''));
          return '<tr class="' + (mine ? 'is-mine' : '') + medal + '">' +
            '<td data-label="#"><span class="myt-medal' + medal + '">' + (place || '—') + '</span></td>' +
            '<td data-label="Produk"><span class="myt-prod-cell">' + imgHtml(p.image_url, 'myt-prod-thumb') +
              '<b>' + esc(clip(p.product_name)) + '</b></span>' +
              (mine ? '<small>Kamu</small>' : '') + '</td>' +
            '<td data-label="Penjualan">' + (num(p.nowcast) > 0 ? esc(fmtRpShort(p.nowcast)) + '<small>perkiraan</small>' : '—') + '</td>' +
            '<td data-label="Harga">' + (num(p.price) > 0 ? esc(fmtRp(p.price)) : '—') + '</td>' +
            '<td data-label="Nilai">' + fmtRating(p.rating) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="myt-bench-empty">Belum ada produk pembanding.</p>';
    var notes = [];
    if (listing) {
      notes = listingNotes(listing, {
        peer_count: view.peerCount,
        median_price: view.medianPrice,
        total_sellers: view.listingCount,
        mine: [{ item_id: listing.item_id, rank: view.item && view.item.sold_rank }],
      });
    }
    var recs = notes.slice(0, 3).map(function (note) {
      var text = note.kind === 'judul'
        ? 'Judul belum memuat ' + (note.missing || []).slice(0, 2).join(', ') + '.'
        : noteText(note.kind, [note]);
      return '<article class="myt-lay-rec ' + (note.tone === 'warn' ? 'is-warn' : 'is-ok') + '"><b>' +
        esc(note.tone === 'warn' ? 'Bisa diubah' : 'Sudah jalan') + '</b><p>' + esc(text) + '</p></article>';
    }).join('');
    return '<div class="myt-lay-tools">' +
        '<div class="myt-prod-pick">' +
          (listing ? imgHtml(listing.image_url, 'myt-prod-pick-img') : '') +
          '<select id="myt-product" class="alat-input myt-prod-select"' + (opts ? '' : ' disabled') + '>' +
            (opts || '<option>Belum ada produk</option>') + '</select>' +
        '</div>' +
        (listing ? '<button type="button" class="btn-ghost" id="myt-pantau">Pantau</button>' : '') +
      '</div>' +
      '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Performa vs kompetitor</h3>' +
          (perfRows ? '<table class="myt-bench-table myt-cmp"><tbody>' + perfRows + '</tbody></table>' : '<p class="myt-bench-empty">Pilih produk yang punya pembanding.</p>') +
          (perf.rows.some(function (c) { return c.kind === 'omzet'; }) ? '' : bits.html) +
        '</section>' +
        '<section class="myt-bench-card myt-lay-posisi"><h3>Peringkat produk</h3>' + rankBlock + '</section>' +
      '</div>' +
      '<div class="myt-bench-split">' +
        '<section class="myt-bench-card"><h3>Tren penjualan</h3>' +
          lineSvg([{ mine: true, name: listing ? clip(listing.product_name) : 'Produk', weeks: itemWeeks }]) + '</section>' +
        '<section class="myt-bench-card"><h3>Peta harga</h3>' +
          scatterSvg(view.points, function (p) { return num(p.price) || 0; }, function (p) { return num(p.nowcast) || 0; }, function (p) {
            return listing && String(p.item_id) === String(listing.item_id);
          }, { x: 'Harga', y: 'Penjualan' }) +
          '<p class="myt-lay-legend"><i class="is-you"></i> Produk ini <i class="is-gold"></i> 1 <i class="is-silver"></i> 2 <i class="is-bronze"></i> 3</p></section>' +
      '</div>' +
      '<section class="myt-bench-card"><h3>Produk kompetitor</h3>' + peerTable + '</section>' +
      (recs ? '<div class="myt-lay-recs">' + recs + '</div>' : '');
  }

  function alertsHtml(alerts) {
    alerts = alerts || {};
    var email = !!alerts.email;
    var wa = !!alerts.wa;
    var weekly = alerts.cadence === 'weekly';
    return '<section class="alat-card">' +
      '<h3 class="alat-h3" style="margin-top:0">Ganti toko</h3>' +
      '<p class="alat-lead">Hanya 1 toko. Mengganti URL menggantikan toko yang sekarang.</p>' +
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

  function settingsHtml(ctx) {
    var alerts = alertsHtml(ctx.alerts);
    var hide = (ctx.listings || []).map(function (p) {
      var on = (ctx.hiddenItems || []).some(function (id) { return String(id) === String(p.item_id); });
      return '<li><span>' + esc(clip(p.product_name)) + '</span>' +
        '<button type="button" class="btn-ghost" data-hide-item="' + Number(p.item_id) + '" data-hidden="' + (on ? '1' : '0') + '">' +
        (on ? 'Tampilkan' : 'Sembunyikan') + '</button></li>';
    }).join('');
    return alerts +
      '<section class="alat-card"><h3 class="alat-h3" style="margin-top:0">Produk</h3>' +
        '<ul class="myt-lay-hide">' + hide + '</ul></section>' +
      '<section class="alat-card"><h3 class="alat-h3" style="margin-top:0">Lainnya</h3>' +
        '<div class="alat-row">' +
          '<button type="button" class="btn-ghost" id="myt-remove-shop">Hapus toko</button>' +
          '<button type="button" class="btn-primary" id="myt-refresh"' + (ctx.loading ? ' disabled' : '') + '>' +
            (ctx.loading ? 'Membandingkan…' : 'Analisis ulang') + '</button>' +
          '<a class="btn-ghost" href="' + esc(ctx.extUrl || '#') + '" target="_blank" rel="noopener">Pakai ekstensi</a>' +
        '</div></section>';
  }

  function shell(ctx, view) {
    var shop = ctx.shop || {};
    var name = shop.store_name || (view.you && '') || ('Toko ' + (shop.shop_id || ''));
    if (ctx.market && ctx.market.mine && ctx.market.mine.store_name && !shop.store_name) {
      name = ctx.market.mine.store_name;
    }
    name = shop.store_name || name;
    var logo = ctx.shopLogo || '';
    if (!logo && ctx.listings && ctx.listings[0]) logo = ctx.listings[0].image_url || '';
    var tab = ctx.tab || 'ringkasan';
    var tabs = [['ringkasan', 'Ringkasan'], ['produk', 'Produk'], ['kompetitor', 'Kompetitor']];
    return '<div class="myt-center myt-bench" id="myt-bench">' +
      '<header class="myt-bench-head">' +
        '<div class="myt-store-id">' +
          '<div class="myt-logo" aria-hidden="true"><span class="myt-logo-txt">' + esc(shopInitials(name)) + '</span>' +
            (logo ? '<img class="myt-logo-img" src="' + esc(thumb(logo)) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
          '</div>' +
          '<div class="myt-store-text"><h2>' + esc(name) + '</h2></div></div>' +
        '</header>' +
      '<div id="myt-manage"' + (ctx.settingsOpen ? '' : ' hidden') + '>' + settingsHtml(ctx) + '</div>' +
      (ctx.error ? '<p class="alat-err myt-bench-status">' + esc(ctx.error) + '</p>' : '') +
      (ctx.marketError ? '<p class="alat-err myt-bench-status">' + esc(ctx.marketError) + '</p>' : '') +
      '<div class="myt-bench-tabs" role="tablist">' +
        tabs.map(function (pair) {
          var on = pair[0] === tab;
          return '<button type="button" role="tab" class="myt-bench-tab' + (on ? ' is-on' : '') +
            '" data-bench-tab="' + pair[0] + '" aria-selected="' + (on ? 'true' : 'false') + '">' + pair[1] + '</button>';
        }).join('') +
      '</div>' +
      '<div id="myt-bench-main"></div>' +
      '<div id="myt-detail" class="myt-detail" hidden></div>' +
      '<button type="button" class="myt-settings-link" id="myt-settings-toggle" aria-expanded="' + (ctx.settingsOpen ? 'true' : 'false') + '">Pengaturan</button>' +
    '</div>';
  }

  function mount(root, ctx) {
    if (!root || !ctx) return;
    var sid = Number(ctx.shop && ctx.shop.shop_id) || 0;
    if (sid !== ui.shopId) {
      ui.q = '';
      ui.shopId = sid;
    }
    var view = assembleView(ctx);
    root.className = 'alat-page alat-page--wide';
    root.innerHTML = shell(ctx, view);
    var main = root.querySelector('#myt-bench-main');
    var tab = ctx.tab || 'ringkasan';
    if (ctx.marketLoading && !(ctx.market && ctx.market.ok)) {
      main.innerHTML = '<p class="alat-hint">Membandingkan kata kunci ini…</p>';
    } else if (tab === 'produk') {
      main.innerHTML = renderProduk(ctx, view);
    } else if (tab === 'kompetitor') {
      main.innerHTML = renderKompetitor(ctx, view);
    } else {
      main.innerHTML = renderRingkasan(ctx, view);
    }

    root.querySelectorAll('[data-bench-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-bench-tab');
        if (next && ctx.onTab) ctx.onTab(next);
      });
    });
    root.querySelectorAll('[data-bench-kw]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kw = btn.getAttribute('data-bench-kw');
        if (kw && ctx.onKeyword) ctx.onKeyword(kw);
      });
    });
    var settingsBtn = root.querySelector('#myt-settings-toggle');
    var panel = root.querySelector('#myt-manage');
    if (settingsBtn && panel) {
      settingsBtn.addEventListener('click', function () {
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        settingsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (ctx.onSettings) ctx.onSettings(!!open);
      });
    }
    var refresh = root.querySelector('#myt-refresh');
    if (refresh) refresh.addEventListener('click', function () { if (ctx.onRefresh) ctx.onRefresh(); });
    var remove = root.querySelector('#myt-remove-shop');
    if (remove) remove.addEventListener('click', function () { if (ctx.onRemoveShop) ctx.onRemoveShop(); });
    root.querySelectorAll('[data-hide-item]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (ctx.onHideItem) ctx.onHideItem(Number(btn.getAttribute('data-hide-item')), btn.getAttribute('data-hidden') !== '1');
      });
    });
    root.querySelectorAll('[data-hide-shop]').forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (ctx.onHideShop) ctx.onHideShop(Number(btn.getAttribute('data-hide-shop')));
      });
    });
    root.querySelectorAll('[data-open-shop]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = Number(btn.getAttribute('data-open-shop'));
        if (id) window.open('https://shopee.co.id/shop/' + id, '_blank', 'noopener');
      });
    });
    root.querySelectorAll('form.myt-manual').forEach(function (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = form.querySelector('input');
        var amount = Number(input && input.value);
        if (!(amount > 0) || !ctx.onSaveManual) return;
        ctx.onSaveManual(Number(form.getAttribute('data-manual-item')) || 0, amount);
      });
    });
    var product = root.querySelector('#myt-product');
    if (product) {
      product.addEventListener('change', function () {
        if (ctx.onSelectItem) ctx.onSelectItem(Number(product.value));
      });
    }
    var pantau = root.querySelector('#myt-pantau');
    if (pantau) {
      pantau.addEventListener('click', function () {
        if (view.selected && ctx.onOpenDetail) ctx.onOpenDetail(view.selected.item_id);
      });
    }
    var q = root.querySelector('#myt-rival-q');
    if (q) {
      q.addEventListener('input', function () {
        ui.q = q.value;
        var body = root.querySelector('#myt-rival-body');
        if (body) body.innerHTML = rivalRows(view, ui.q);
        root.querySelectorAll('[data-hide-shop]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            if (ctx.onHideShop) ctx.onHideShop(Number(btn.getAttribute('data-hide-shop')));
          });
        });
      });
    }
    var addGo = root.querySelector('#myt-add-go');
    var addQ = root.querySelector('#myt-add-q');
    if (addGo && addQ) {
      addGo.addEventListener('click', function () {
        if (!ctx.onFindShops) return;
        Promise.resolve(ctx.onFindShops(addQ.value)).then(function (rows) {
          var box = root.querySelector('#myt-add-picker');
          if (!box) return;
          rows = rows || [];
          if (!rows.length) {
            box.hidden = false;
            box.innerHTML = '<p class="myt-bench-empty">Toko tidak ketemu.</p>';
            return;
          }
          box.hidden = false;
          box.innerHTML = rows.map(function (row, i) {
            return '<button type="button" class="alat-pick" data-add-shop="' + i + '">' +
              esc(row.store_name || 'Toko') +
              (row.location ? '<small>' + esc(row.location) + '</small>' : '') + '</button>';
          }).join('');
          box._rows = rows;
          box.querySelectorAll('[data-add-shop]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var row = box._rows[Number(btn.getAttribute('data-add-shop'))];
              if (row && ctx.onAddShop) ctx.onAddShop(row);
            });
          });
        });
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
    keywordScores: keywordScores,
    keywordChoices: keywordChoices,
    topPct: topPct,
    assembleView: assembleView,
  };
});
