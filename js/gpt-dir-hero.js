/* LarisID — Cari Produk header carousel (default state only).
 *
 * Companion script to gpt-app.js, loaded the same way js/gpt-dir-filters.js is.
 * It owns nothing but its own DOM: every navigation action is handed back to
 * gpt-app.js through the `api` callbacks, so the hero can never drift from the
 * directory's own filter logic (applyDirectoryCategory already resets search,
 * page, the filter host and the mega-menu — duplicating that here is how the
 * two surfaces would start disagreeing).
 *
 * Slide backgrounds live in /images/dir-hero/. They are loaded as CSS
 * background layers over a gradient, so a missing file degrades to the
 * gradient instead of a broken image — dropping the art in later needs no
 * code change. Same idea for the overlay thumbnails: the art-directed file is
 * tried first and an onerror swaps in the live Shopee photo behind it.
 */
(function (global) {
  'use strict';

  var IMG_BASE = '/images/dir-hero/';
  var AUTOPLAY_MS = 7000;

  /* Wire icons — house rule is SVG, never emoji. */
  var ICONS = {
    flame: '<path d="M12 2.6c.6 3.1 2.4 4.3 3.9 5.9a7.4 7.4 0 0 1 2.3 5.3 6.2 6.2 0 0 1-12.4 0c0-2 .9-3.4 2-4.6.5 1 1.2 1.6 2 1.9-.4-2.9.6-6 2.2-8.5Z"/>',
    heart: '<path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z"/>',
    trend: '<path d="M3.5 16.5 9 11l3.5 3.5L20 7"/><path d="M15.5 7H20v4.5"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    chevL: '<path d="M15 5l-7 7 7 7"/>'
  };

  function svg(path, w, opts) {
    opts = opts || {};
    return '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="' +
      (opts.fill || 'none') + '" stroke="' + (opts.stroke || 'currentColor') +
      '" stroke-width="' + (opts.sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      path + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Indonesian formatting: full stops for thousands, comma for the decimal. */
  function idNum(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }
  function idCompact(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' jt';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' rb';
    return idNum(n);
  }
  function idPct(p) {
    return (Number(p) || 0).toFixed(1).replace('.', ',') + '%';
  }

  /* ── Slide 1: Olahraga & Outdoor › Camping ───────────────────────────── */
  var CAMPING_CAT = 'Olahraga & Outdoor';
  var CAMPING_SUB = 'Camping';
  /* Optional art-directed cut-outs. Present file wins; missing file falls back
   * to the live Shopee photo for that slot (see fillAside). */
  var CAMPING_ART = ['out-kursi.webp', 'out-lentera.webp', 'out-tas.webp', 'out-kompor.webp'];

  /* ── Slide 2: household tiles. Canonical bucket names only — the
   * onboarding-chip vocabulary is a different list and filtering with it
   * returns zero rows. ─────────────────────────────────────────────────── */
  var CAT_ICON_BASE = '/images/onboarding/categories/';
  /* The tile fallback is the onboarding cut-out, NOT the category's top live
   * photo: the highest-omset listing in a big category is usually a promo
   * banner covered in sale text, which reads as clutter at tile size. */
  var HOME_TILES = [
    { cat: 'Dapur',                  label: 'Dapur',      art: 'home-dapur.webp',      icon: 'dapur.png',      tone: 'sage'  },
    { cat: 'Kecantikan & Perawatan', label: 'Kecantikan', art: 'home-kecantikan.webp', icon: 'kecantikan.png', tone: 'blush' },
    { cat: 'Elektronik & Listrik',   label: 'Elektronik', art: 'home-elektronik.webp', icon: 'elektronik.png', tone: 'sky'   },
    { cat: 'Fashion',                label: 'Fashion',    art: 'home-fashion.webp',    icon: 'fashion.png',    tone: 'sand'  }
  ];

  /* Canonical bucket names run long ("Taman, Tanaman & Perkakas"); the chart
   * rows are ~6rem wide. Display-only — the click still carries the canonical
   * name, which is what the directory filters on. */
  var SHORT_CAT = {
    'Kecantikan & Perawatan': 'Kecantikan',
    'Sekolah, Kantor & Usaha': 'Sekolah & Kantor',
    'Taman, Tanaman & Perkakas': 'Taman & Perkakas',
    'Hobi, Kerajinan & Pesta': 'Hobi & Kerajinan',
    'Ibu, Bayi & Anak': 'Bayi & Anak',
    'HP, Komputer & Gaming': 'HP & Komputer',
    'Sepatu, Tas & Aksesoris': 'Tas & Aksesoris',
    'Elektronik & Listrik': 'Elektronik',
    'Rumah & Dekorasi': 'Rumah',
    'Olahraga & Outdoor': 'Olahraga',
    'Perlengkapan Ibadah': 'Ibadah',
    'Makanan & Minuman': 'Makanan'
  };
  function shortCat(c) { return SHORT_CAT[c] || c; }

  var SLIDES = [
    {
      key: 'camping',
      bg: 'slide-camping.webp',
      badge: { icon: ICONS.flame, text: 'Sorotan', solid: true },
      title: 'Siap Untuk <em>Petualangan?</em>',
      sub: 'Peralatan outdoor favorit yang paling banyak dibeli minggu ini.',
      cta: 'Jelajahi Sekarang'
    },
    {
      key: 'rumah',
      bg: 'slide-rumah.webp',
      badge: { icon: ICONS.heart, text: 'Gaya Hidup' },
      title: 'Buat Hidup<br>Makin <em>Nyaman</em>',
      sub: 'Temukan produk rumah tangga, kecantikan, hingga elektronik pilihan untuk kehidupan yang lebih baik.',
      cta: 'Lihat Kategori Populer'
    },
    {
      key: 'insight',
      bg: 'slide-insight.webp',
      badge: { icon: ICONS.trend, text: 'Insight' },
      title: 'Data Hari Ini,<br><em>Peluang Besok.</em>',
      sub: 'Kami menganalisis jutaan produk setiap hari untuk menemukan peluang terbaik untukmu.',
      cta: 'Lihat Pantauan'
    }
  ];

  /* --------------------------------------------------------------------------
   * Markup
   * -------------------------------------------------------------------------- */
  function slideHtml(s, i) {
    var b = s.badge;
    return '' +
    '<div class="dh-slide dh-slide--' + s.key + '" data-dh-slide="' + s.key + '" role="group" ' +
         'aria-roledescription="slide" aria-label="' + (i + 1) + ' dari ' + SLIDES.length + '">' +
      '<div class="dh-photo" style="background-image:url(' + IMG_BASE + s.bg + ')"></div>' +
      '<div class="dh-scrim"></div>' +
      '<div class="dh-body">' +
        '<div class="dh-text">' +
          '<p class="dh-badge' + (b.solid ? ' dh-badge--solid' : '') + '">' +
            svg(b.icon, 13, b.icon === ICONS.trend ? {} : { fill: 'currentColor', stroke: 'none' }) +
            esc(b.text) +
          '</p>' +
          '<h3 class="dh-title">' + s.title + '</h3>' +
          '<p class="dh-sub">' + esc(s.sub) + '</p>' +
          '<button type="button" class="dh-cta" data-dh-cta="' + s.key + '">' +
            esc(s.cta) + svg(ICONS.chevR, 15, { sw: 2.4 }) +
          '</button>' +
        '</div>' +
        '<div class="dh-aside" data-dh-aside="' + s.key + '"></div>' +
      '</div>' +
    '</div>';
  }

  function shellHtml() {
    return '' +
    '<div class="dir-hero-viewport">' +
      '<div class="dir-hero-track" data-dh-track>' +
        SLIDES.map(slideHtml).join('') +
      '</div>' +
    '</div>' +
    '<button type="button" class="dir-hero-arrow dir-hero-arrow--prev" data-dh-nav="-1" aria-label="Slide sebelumnya">' +
      svg(ICONS.chevL, 18, { sw: 2.4 }) + '</button>' +
    '<button type="button" class="dir-hero-arrow dir-hero-arrow--next" data-dh-nav="1" aria-label="Slide berikutnya">' +
      svg(ICONS.chevR, 18, { sw: 2.4 }) + '</button>' +
    '<div class="dir-hero-dots" role="tablist" aria-label="Pilih slide">' +
      SLIDES.map(function (s, i) {
        return '<button type="button" class="dir-hero-dot' + (i ? '' : ' on') + '" data-dh-dot="' + i +
          '" role="tab" aria-selected="' + (i ? 'false' : 'true') + '" aria-label="Slide ' + (i + 1) + '"></button>';
      }).join('') +
    '</div>';
  }

  /* --------------------------------------------------------------------------
   * Data — one RPC for the aggregates, small lean reads for the thumbnails.
   *
   * The thumbnail reads deliberately bypass gpt-app.js's fetchProductTypes():
   * its cache key omits `limit`, so a 6-row hero call would poison the entry
   * the directory grid later reads at limit 1000 and the grid would render six
   * cards. These select four columns instead of the full card projection.
   * -------------------------------------------------------------------------- */
  var _statsPromise = null;
  var _thumbCache = Object.create(null);

  function loadStats(sb) {
    if (_statsPromise) return _statsPromise;
    if (!sb) return Promise.resolve(null);
    _statsPromise = sb.rpc('dir_hero_stats')
      .then(function (r) { return r && !r.error ? r.data : null; })
      .catch(function () { return null; });
    return _statsPromise;
  }

  function pickImage(row) {
    var arr = row && row.images;
    if (Array.isArray(arr) && arr.length && arr[0]) return arr[0];
    return (row && row.rep_image_url) || '';
  }

  /* Near-duplicate keywords ("kursi camping lipat" / "kursi lipat camping")
   * come back adjacent and would fill the strip with the same chair. Keep one
   * row per leading word. */
  function distinctByHead(rows, n) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < rows.length && out.length < n; i++) {
      var kw = String(rows[i].keyword || '');
      var head = kw.split(/\s+/)[0].toLowerCase();
      if (!head || seen[head]) continue;
      if (!pickImage(rows[i])) continue;
      seen[head] = 1;
      out.push(rows[i]);
    }
    return out;
  }

  function loadThumbs(sb, cat, sub, limit) {
    var key = cat + '|' + (sub || '');
    if (_thumbCache[key]) return _thumbCache[key];
    if (!sb) return Promise.resolve([]);
    var q = sb.from('product_types_v')
      .select('keyword, images, rep_image_url')
      .eq('city', 'ALL')
      .eq('category_canonical', cat)
      .gte('n_listings', 3)
      .order('omset_top15', { ascending: false, nullsFirst: false })
      .limit(limit || 12);
    if (sub) q = q.eq('subgroup', sub);
    _thumbCache[key] = q
      .then(function (r) { return (r && !r.error && r.data) ? r.data : []; })
      .catch(function () { return []; });
    return _thumbCache[key];
  }

  /* --------------------------------------------------------------------------
   * Aside panels (the right-hand overlay on each slide)
   * -------------------------------------------------------------------------- */
  function thumbImg(artFile, liveUrl, imgThumb, alt) {
    var live = liveUrl ? (imgThumb ? imgThumb(liveUrl) : liveUrl) : '';
    var src = artFile ? (IMG_BASE + artFile) : live;
    if (!src) return '<span class="dh-thumb-ph" aria-hidden="true"></span>';
    /* The art file is optional; if it 404s, fall back to the live photo once. */
    var fb = (artFile && live) ? ' data-dh-fallback="' + esc(live) + '"' : '';
    return '<img src="' + esc(src) + '" alt="' + esc(alt || '') + '" loading="lazy" decoding="async" draggable="false"' + fb + '>';
  }

  function catPct(stats, cat) {
    var list = (stats && stats.cats) || [];
    for (var i = 0; i < list.length; i++) if (list[i].cat === cat) return Number(list[i].pct) || 0;
    return 0;
  }

  function asideCamping(rows, stats, imgThumb) {
    var picks = distinctByHead(rows, 4);
    var pct = catPct(stats, CAMPING_CAT);
    var cells = picks.map(function (r, i) {
      return '<span class="dh-round">' + thumbImg(CAMPING_ART[i], pickImage(r), imgThumb, r.keyword) + '</span>';
    }).join('');
    if (!cells) return '';
    return '<div class="dh-card dh-card--dark">' +
      '<p class="dh-card-title">Produk Outdoor Terlaris</p>' +
      '<div class="dh-rounds">' + cells + '</div>' +
      (pct > 0
        ? '<p class="dh-card-foot">' + svg(ICONS.trend, 14, { sw: 2.2 }) +
          'Penjualan kategori ini naik <b>' + idPct(pct) + '</b> minggu ini</p>'
        : '') +
    '</div>';
  }

  function asideRumah() {
    var tiles = HOME_TILES.map(function (t) {
      var icon = CAT_ICON_BASE + t.icon;
      var src = IMG_BASE + t.art;
      return '<button type="button" class="dh-tile dh-tile--' + t.tone + '" data-dh-cat="' + esc(t.cat) + '">' +
        '<span class="dh-tile-img"><img src="' + esc(src) + '" alt="' + esc(t.label) + '" ' +
          'loading="lazy" decoding="async" draggable="false" data-dh-fallback="' + esc(icon) + '"></span>' +
        '<span class="dh-tile-label">' + esc(t.label) + '</span>' +
      '</button>';
    }).join('');
    return '<div class="dh-tiles">' + tiles + '</div>';
  }

  function asideInsight(stats) {
    if (!stats || !stats.totals) return '';
    var t = stats.totals;
    var cats = (stats.cats || []).slice();

    /* Volume bars — the six biggest canonical markets this week. Deliberately
     * a bar chart, not the mockup's rising line: there is no clean global
     * daily series behind this data (scrape coverage swings day to day), so a
     * line would be noise drawn as a trend. */
    var bars = cats.slice(0, 6);
    var max = bars.reduce(function (m, c) { return Math.max(m, Number(c.units) || 0); }, 1);
    var barsHtml = bars.map(function (c) {
      var w = Math.max(4, Math.round(100 * (Number(c.units) || 0) / max));
      return '<li class="dh-bar">' +
        '<span class="dh-bar-name">' + esc(shortCat(c.cat)) + '</span>' +
        '<span class="dh-bar-track"><i style="width:' + w + '%"></i></span>' +
        '<span class="dh-bar-val">' + idCompact(c.units) + '</span>' +
      '</li>';
    }).join('');

    /* Fastest movers. Floor on `types` so a thin bucket can't top the list on
     * a handful of rows. */
    var active = cats.filter(function (c) { return (Number(c.types) || 0) >= 500; })
      .sort(function (a, b) { return (Number(b.pct) || 0) - (Number(a.pct) || 0); })
      .slice(0, 5);
    var topPct = active.length ? (Number(active[0].pct) || 1) : 1;
    var activeHtml = active.map(function (c, i) {
      var w = Math.max(8, Math.round(100 * (Number(c.pct) || 0) / topPct));
      return '<li class="dh-rank">' +
        '<span class="dh-rank-n">' + (i + 1) + '.</span>' +
        '<span class="dh-rank-body">' +
          '<span class="dh-rank-name">' + esc(shortCat(c.cat)) + '</span>' +
          '<span class="dh-rank-track"><i style="width:' + w + '%"></i></span>' +
        '</span>' +
        '<span class="dh-rank-pct">+' + idPct(c.pct) + '</span>' +
      '</li>';
    }).join('');

    return '<div class="dh-ins">' +
      '<div class="dh-ins-main">' +
        '<p class="dh-ins-label">Unit Terjual Minggu Ini</p>' +
        '<p class="dh-ins-big">' + idNum(t.wk_units) + '</p>' +
        '<ul class="dh-bars">' + barsHtml + '</ul>' +
        '<div class="dh-stats">' +
          '<div class="dh-stat"><span class="dh-stat-k">Tipe produk dipantau</span><span class="dh-stat-v">' + idNum(t.types) + '</span></div>' +
          '<div class="dh-stat"><span class="dh-stat-k">Naik signifikan</span><span class="dh-stat-v">' + idNum(t.risers) + '</span></div>' +
          '<div class="dh-stat"><span class="dh-stat-k">Toko terpantau</span><span class="dh-stat-v">' + idNum(t.shops) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="dh-ins-side">' +
        '<p class="dh-card-title">Kategori Paling Aktif</p>' +
        '<ul class="dh-ranks">' + activeHtml + '</ul>' +
        '<p class="dh-ins-note">Pertumbuhan unit terjual minggu ini</p>' +
      '</div>' +
    '</div>';
  }

  /* --------------------------------------------------------------------------
   * Carousel — same track/drag mechanic as the deep-dive gallery
   * (bindDdrCarousel in gpt-app.js), plus arrows, dots and autoplay.
   * -------------------------------------------------------------------------- */
  function bindCarousel(host, api) {
    var track = host.querySelector('[data-dh-track]');
    var view = host.querySelector('.dir-hero-viewport');
    var dots = [].slice.call(host.querySelectorAll('[data-dh-dot]'));
    if (!track || !view) return null;

    var n = SLIDES.length;
    var i = 0;
    var sx = 0, dx = 0, tracking = false, width = view.clientWidth || 1;
    var timer = null;
    var reduce = false;
    try { reduce = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

    function apply(offset, animate) {
      track.classList.toggle('is-dragging', !animate);
      var pct = (-i * 100) + (width ? (offset / width) * 100 : 0);
      track.style.transform = 'translateX(' + pct + '%)';
    }
    function show(k, animate) {
      i = ((k % n) + n) % n;
      dx = 0;
      apply(0, animate !== false);
      dots.forEach(function (d, idx) {
        d.classList.toggle('on', idx === i);
        d.setAttribute('aria-selected', idx === i ? 'true' : 'false');
      });
      host.setAttribute('data-dh-active', SLIDES[i].key);
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      stop();
      if (reduce || n < 2) return;
      timer = setInterval(function () {
        if (document.hidden) return;
        show(i + 1, true);
      }, AUTOPLAY_MS);
    }

    show(0, false);
    start();

    host.addEventListener('mouseenter', stop);
    host.addEventListener('mouseleave', start);
    host.addEventListener('focusin', stop);
    host.addEventListener('focusout', start);

    dots.forEach(function (d) {
      d.addEventListener('click', function () { show(Number(d.dataset.dhDot) || 0, true); start(); });
    });
    [].slice.call(host.querySelectorAll('[data-dh-nav]')).forEach(function (b) {
      b.addEventListener('click', function () { show(i + (Number(b.dataset.dhNav) || 1), true); start(); });
    });

    function onStart(x) { tracking = true; sx = x; dx = 0; width = view.clientWidth || 1; track.classList.add('is-dragging'); }
    function onMove(x) { if (!tracking) return; dx = x - sx; apply(dx, false); }
    function onEnd() {
      if (!tracking) return;
      tracking = false;
      var thresh = Math.max(40, width * 0.16);
      if (dx <= -thresh) show(i + 1, true);
      else if (dx >= thresh) show(i - 1, true);
      else show(i, true);
      start();
    }

    view.addEventListener('touchstart', function (e) { stop(); onStart(e.changedTouches[0].clientX); }, { passive: true });
    view.addEventListener('touchmove', function (e) { if (tracking) onMove(e.changedTouches[0].clientX); }, { passive: true });
    view.addEventListener('touchend', onEnd, { passive: true });
    view.addEventListener('touchcancel', onEnd, { passive: true });
    view.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      if (e.target.closest('button')) return;
      stop(); onStart(e.clientX);
    });
    global.addEventListener('pointermove', function (e) { if (tracking) onMove(e.clientX); });
    global.addEventListener('pointerup', onEnd);
    global.addEventListener('resize', function () { width = view.clientWidth || 1; apply(0, false); });

    host.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { show(i + 1, true); start(); }
      else if (e.key === 'ArrowLeft') { show(i - 1, true); start(); }
    });

    return { show: show, stop: stop, start: start };
  }

  /* --------------------------------------------------------------------------
   * Public entry
   * -------------------------------------------------------------------------- */
  function render(host, api) {
    if (!host) return;
    api = api || {};
    if (host.dataset.dhReady === '1') return;
    host.dataset.dhReady = '1';

    host.setAttribute('role', 'region');
    host.setAttribute('aria-roledescription', 'carousel');
    host.setAttribute('aria-label', 'Sorotan kategori');
    host.innerHTML = shellHtml();

    var car = bindCarousel(host, api);
    host._dhApi = car;

    /* Clicks: everything routes back through gpt-app.js. */
    host.addEventListener('click', function (e) {
      var tile = e.target.closest('[data-dh-cat]');
      if (tile) {
        var c = tile.getAttribute('data-dh-cat');
        if (api.onEvent) api.onEvent('dir_hero_click', { slide: 'rumah', target: c });
        if (api.onCategory) api.onCategory(c, null);
        return;
      }
      var cta = e.target.closest('[data-dh-cta]');
      if (!cta) return;
      var key = cta.getAttribute('data-dh-cta');
      if (api.onEvent) api.onEvent('dir_hero_click', { slide: key, target: 'cta' });
      if (key === 'camping' && api.onCategory) api.onCategory(CAMPING_CAT, CAMPING_SUB);
      else if (key === 'rumah' && api.onKategoriMenu) api.onKategoriMenu();
      else if (key === 'insight' && api.onTracker) api.onTracker();
    });

    /* An art-directed override that isn't on disk yet falls back to the live
     * photo rather than showing a broken image. */
    host.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      var fb = img.getAttribute('data-dh-fallback');
      if (!fb) return;
      img.removeAttribute('data-dh-fallback');
      /* Cut-outs need contain + padding; the art files are full-bleed cover. */
      if (fb.indexOf('/onboarding/') !== -1) img.classList.add('is-cutout');
      img.src = fb;
    }, true);

    var sb = api.supabase;
    var imgThumb = api.imgThumb;
    var stats = null;

    function paint(key, html) {
      var slot = host.querySelector('[data-dh-aside="' + key + '"]');
      if (slot && html) { slot.innerHTML = html; slot.classList.add('is-filled'); }
    }

    loadStats(sb).then(function (s) {
      stats = s;
      paint('insight', asideInsight(stats));
      return loadThumbs(sb, CAMPING_CAT, CAMPING_SUB, 12);
    }).then(function (rows) {
      paint('camping', asideCamping(rows || [], stats, imgThumb));
    }).catch(function () { /* hero degrades to text-only slides */ });

    /* Tiles are static art, so slide 2 never waits on the network. */
    paint('rumah', asideRumah());
  }

  function destroy(host) {
    if (!host) return;
    if (host._dhApi && host._dhApi.stop) host._dhApi.stop();
  }

  global.LarisGptDirHero = { render: render, destroy: destroy };

})(window);
