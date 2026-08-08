/* ═══════════════════════════════════════════════════════════════════════════
   LarisTrending – "Produk Trending" module (Site A / Site B).
   Mount it once per host element; it never touches global Supabase /
   currentUser.  Data comes through a small adapter that provides `fetch` / 
   formatting / navigation.

   ── Growth metric ──
   Kenaikan = penjualan periode ini (delta) dibanding CUMULATIVE baseline
   sebelum periode ini (total_sold – delta).  Ini bukan week‑over‑week; 
   periode scrape kami terlalu jarang.  Angka ditampilkan sebagai persentase 
   baseline, atau "Baru" untuk produk yang baseline‑nya < 50.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Constants ───────────────────────────────────────────────────────────

  const TREND_RANGES = {
    '7d':  { label: 'Minggu Ini',        delta: 'delta_7d'  },
    '14d': { label: '2 Minggu Terakhir', delta: 'delta_14d' },
    '30d': { label: '1 Bulan Terakhir',  delta: 'delta_30d' },
  };

  // ── Module state ────────────────────────────────────────────────────────

  let host    = null;
  let adapter = Object.create(null);
  let site    = 'a';               // passed by mount for analytics
  let rows    = [];                // raw fetched rows
  let range   = '7d';             // currently selected range
  let items   = [];               // computed active items (sorted by delta)
  let stats   = {};               // computed summary
  let catMovers = [];             // category movers
  let anchorDate = '—';
  let expanded = false;           // true after "Lihat Semua"
  let built   = false;

  // ── Math helpers ────────────────────────────────────────────────────────

  function median(arr) {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.floor((sorted.length - 1) * p / 100);
    return sorted[idx];
  }

  function trendGrowthPct(row, deltaKey) {
    const d = Number(row[deltaKey]) || 0;
    if (d <= 0) return null;
    const base = (Number(row.total_sold) || 0) - d;
    if (base < 50) return Infinity;
    return Math.round(d / base * 100);
  }

  // ── Safe adapters ───────────────────────────────────────────────────────

  function esc(v) {
    try { return adapter.esc ? adapter.esc(v == null ? '' : v) : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    catch (e) { return String(v); }
  }

  function fmtRp(n) {
    try { if (adapter.fmtRp) return adapter.fmtRp(n); } catch (_) {}
    return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
  }

  function fmtSold(n) {
    try { if (adapter.fmtSold) return adapter.fmtSold(n); } catch (_) {}
    const v = Math.round(n || 0);
    if (v >= 1e6) return (v/1e6).toFixed(1).replace('.0','') + 'jt';
    if (v >= 1e3) return (v/1e3).toFixed(1).replace('.0','') + 'rb';
    return String(v);
  }

  function track(evt, props) {
    try { if (adapter.track) adapter.track(evt, props || {}); } catch (_) {}
  }

  // ── Data processing ─────────────────────────────────────────────────────

  function computeView(rng) {
    const cfg = TREND_RANGES[rng];
    if (!cfg || !rows.length) {
      items = []; stats = {}; catMovers = []; return;
    }

    // active rows = delta > 0
    const active = rows.filter(r => Number(r[cfg.delta]) > 0);

    // top 20 items sorted by delta descending
    const topItems = active.slice()
      .map(r => {
        const d = Number(r[cfg.delta]) || 0;
        const pct = trendGrowthPct(r, cfg.delta);
        return { ...r, _delta: d, _pct: pct };
      })
      .sort((a, b) => b._delta - a._delta)
      .slice(0, 20);

    items = topItems;

    // summary stats over all active rows
    const finitePcts = items.map(i => i._pct).filter(v => v != null && Number.isFinite(v));
    const medPct = median(finitePcts);

    const rising = active.length;
    const catsSet = new Set();
    active.forEach(r => { catsSet.add((r.category || 'Lainnya')); });
    const shopsSet = new Set();
    active.forEach(r => { if (r.shop_id != null) shopsSet.add(r.shop_id); });
    const totalDelta = active.reduce((s, r) => s + (Number(r[cfg.delta]) || 0), 0);

    stats = {
      medPct:   medPct != null ? Math.round(medPct) : null,
      rising,
      catsMoving: catsSet.size,
      shops: shopsSet.size,
      units: totalDelta,
    };

    // category movers (all active, top 5 by delta sum)
    const catDelta = {};
    active.forEach(r => {
      const cat = r.category || 'Lainnya';
      catDelta[cat] = (catDelta[cat] || 0) + (Number(r[cfg.delta]) || 0);
    });

    let catList = Object.entries(catDelta)
      .map(([cat, sumDelta]) => {
        let base = active
          .filter(r => (r.category || 'Lainnya') === cat)
          .reduce((s, r) => s + Math.max(0, (Number(r.total_sold) || 0) - (Number(r[cfg.delta]) || 0)), 0);
        const pct = base >= 50 ? Math.round(sumDelta / base * 100) : (sumDelta > 0 ? Infinity : null);
        return { cat, sumDelta, pct };
      })
      .sort((a, b) => b.sumDelta - a.sumDelta)
      .slice(0, 5);

    const maxCatDelta = Math.max(...catList.map(c => c.sumDelta), 1);
    catMovers = catList.map(c => ({
      ...c,
      barPct: Math.max(4, Math.round(c.sumDelta / maxCatDelta * 100)),
    }));
  }

  // ── Render helpers ──────────────────────────────────────────────────────

  function upArrowSvg(width, height) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V3"/><path d="M4 7l4-4 4 4"/></svg>`;
  }

  function chipHtml(pct) {
    if (pct === Infinity) return `<span class="ltr-chip ltr-chip--baru">Baru</span>`;
    if (pct == null)      return `<span class="ltr-chip ltr-chip--flat">—</span>`;
    return `<span class="ltr-chip ltr-chip--up">${upArrowSvg(10,10)}&nbsp;+${pct}%</span>`;
  }

  function noEmojiFlameIcon() {
    // simple flame SVG (wire style)
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 002.5 2.5z"/></svg>`;
  }

  function render() {
    if (!host) return;
    const cfg = TREND_RANGES[range] || TREND_RANGES['7d'];
    const tabButtons = Object.keys(TREND_RANGES).map(k => {
      const active = k === range ? ' class="ltr-tab ltr-tab--active"' : ' class="ltr-tab"';
      return `<button type="button"${active} data-tab="${k}">${TREND_RANGES[k].label}</button>`;
    }).join('');

    const medPctStr = stats.medPct != null ? `+${stats.medPct}%` : '—';
    const statTiles = `
      <div class="ltr-tile">${medPctStr}<span class="ltr-tile-sub">Median kenaikan penjualan produk trending</span></div>
      <div class="ltr-tile">${stats.rising ?? '—'}<span class="ltr-tile-sub">Produk dengan penjualan naik</span></div>
      <div class="ltr-tile">${stats.catsMoving ?? '—'}<span class="ltr-tile-sub">Kategori ikut bergerak</span></div>
      <div class="ltr-tile">${stats.shops ?? '—'}<span class="ltr-tile-sub">Toko aktif ikut menjual</span></div>
      <div class="ltr-tile">${fmtSold(stats.units)}<span class="ltr-tile-sub">Unit terjual periode ini (est.)</span></div>
    `;

    let tableRows = '';
    const showCount = expanded ? items.length : Math.min(items.length, 5);
    if (!items.length) {
      tableRows = '<tr class="ltr-empty-row"><td colspan="6">Belum ada produk yang naik di periode ini.</td></tr>';
    }
    for (let i = 0; i < showCount; i++) {
      const r = items[i];
      const img = r.image_url ? `<div class="ltr-prod-img"><img src="${esc(r.image_url)}" alt="" onerror="this.style.display='none'" loading="lazy"></div>` : '';
      const cat = r.category ? esc(r.category) : '—';
      tableRows += `
        <tr class="ltr-row" tabindex="0" role="button" data-key="${esc(r.item_id)}__${esc(r.shop_id)}">
          <td>${i + 1}</td>
          <td>
            <div class="ltr-prod-cell">
              ${img}
              <div>
                <div class="ltr-prod-name">${esc(r.product_name || '—')}</div>
                <div class="ltr-prod-cat">${cat}</div>
              </div>
            </div>
          </td>
          <td>${chipHtml(r._pct)}</td>
          <td>${fmtSold(r._delta)}</td>
          <td>${fmtRp(r.price)}</td>
          <td><button type="button" class="ltr-analyse-btn" tabindex="-1">Lihat Analisis</button></td>
        </tr>`;
    }

    const catRows = catMovers.map((c, i) => {
      const chip = chipHtml(c.pct);
      const bar = `<div class="ltr-cat-bar"><div class="ltr-cat-bar-fill" style="width:${c.barPct}%"></div></div>`;
      return `
        <div class="ltr-cat-row">
          <span class="ltr-cat-rank">${i + 1}</span>
          <span class="ltr-cat-name">${esc(c.cat)}</span>
          <span class="ltr-cat-chips">${chip}</span>
          <span class="ltr-cat-bar-wrap">${bar}</span>
        </div>`;
    }).join('');

    // Insight box
    let insights = '';
    if (catMovers.length) {
      const topCat = catMovers[0].cat;
      const secondCat = catMovers.length >= 2 ? catMovers[1].cat : null;
      const catMsg = secondCat ? `${topCat} dan ${secondCat} mendominasi kenaikan di periode ini.` : `${topCat} menjadi kategori dengan kenaikan tertinggi.`;
      insights += `<li>${catMsg}</li>`;
    }
    if (items.length) {
      const topItem = items[0];
      const name = topItem.product_name || 'Produk';
      insights += `<li>Produk <strong>${esc(name)}</strong> bertambah ${fmtSold(topItem._delta)} unit.</li>`;
    }
    const prices = items.map(i => i.price).filter(p => p > 0);
    if (prices.length >= 5) {
      const sorted = [...prices].sort((a, b) => a - b);
      const p25 = percentile(sorted, 25);
      const p75 = percentile(sorted, 75);
      insights += `<li>Rentang harga trending: ${fmtRp(p25)} – ${fmtRp(p75)}.</li>`;
    }
    const insightHtml = insights ? `<ul class="ltr-insight-list">${insights}</ul>` : '';

    const moreBtn = items.length > 5 && !expanded
      ? `<button class="ltr-more-btn" id="ltr-more-btn">Lihat Semua</button>` : '';

    host.innerHTML = `
      <div class="ltr-card">
        <div class="ltr-hdr">
          <span class="ltr-hdr-icon">${noEmojiFlameIcon()}</span>
          <div class="ltr-hdr-text">
            <div class="ltr-hdr-title">Produk Trending — ${cfg.label}</div>
            <div class="ltr-hdr-sub">Data diambil dari Shopee Indonesia • Update: ${esc(anchorDate)}</div>
          </div>
        </div>
        <div class="ltr-tabs">${tabButtons}</div>
        <div class="ltr-stats">${statTiles}</div>
        <div class="ltr-body">
          <div class="ltr-left">
            <div class="ltr-section-title">Top ${expanded ? 20 : Math.min(items.length, 5)} Produk Trending</div>
            <div class="ltr-table-scroll">
              <table class="ltr-table">
                <thead>
                  <tr><th>#</th><th>Produk</th><th>Kenaikan</th><th>Unit</th><th>Harga</th><th></th></tr>
                </thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
            ${moreBtn}
          </div>
          <div class="ltr-right">
            <div class="ltr-section-title">Kategori Paling Trending</div>
            ${catRows || '<div class="ltr-cat-empty">Belum ada kategori yang bergerak di periode ini.</div>'}
            <div class="ltr-insight-box">
              <div class="ltr-insight-title">Insight LarisID</div>
              ${insightHtml || '<span class="ltr-insight-empty">Belum cukup data untuk insight.</span>'}
            </div>
          </div>
        </div>
        <div class="ltr-foot">Kenaikan = tambahan penjualan periode ini dibanding total penjualan sebelumnya · dihitung dari panel scrape LarisID</div>
      </div>`;

    // attach event listeners
    delegateEvents();
  }

  function delegateEvents() {
    if (!host) return;
    const tabs = host.querySelectorAll('.ltr-tab');
    tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const newRange = btn.getAttribute('data-tab');
        if (newRange && newRange !== range) {
          range = newRange;
          expanded = false;
          computeView(range);
          render();
          track('trending_tab', { ui: site, range });
        }
      });
    });

    const moreBtn = host.querySelector('#ltr-more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        expanded = true;
        render();
        track('trending_expand', { ui: site });
      });
    }

    // Rows and the button are the SAME click target: the analyse button lives
    // inside its row, so a listener on each independently double-fired
    // openProduct (and every event it logs) on every button click. One
    // delegated listener on the row, keyed off data-key, fixes both paths at once.
    function openRow(el) {
      const key = el.getAttribute('data-key');
      if (!key) return;
      const [itemId, shopId] = key.split('__');
      const row = items.find(r => String(r.item_id) === itemId && String(r.shop_id) === shopId);
      if (row && adapter.openProduct) adapter.openProduct(row);
    }
    host.querySelectorAll('.ltr-row').forEach(el => {
      el.addEventListener('click', () => openRow(el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(el); }
      });
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────

  function mount(opts) {
    const o = opts || {};
    site = o.site || 'a';
    adapter = o.adapter || Object.create(null);
    const el = document.getElementById(o.hostId);
    if (!el) return;
    host = el;

    if (!built) {
      // initial render is a skeleton while data loads
      computeView(range); // compute with empty rows
      render();
      built = true;
    }
    fetchAndApply();
  }

  function unmount() {
    if (host) host.innerHTML = '';
    host    = null;
    built   = false;
    rows    = [];
    items   = [];
    stats   = {};
    catMovers = [];
    expanded = false;
  }

  async function refresh() {
    await fetchAndApply();
  }

  async function fetchAndApply() {
    if (!adapter.fetchTrending) return;
    try {
      const res = await adapter.fetchTrending();
      if (Array.isArray(res)) rows = res;
      if (rows.length) {
        const anchor = rows[0].anchor_at;
        if (anchor) {
          try {
            const d = new Date(anchor);
            if (!isNaN(d.getTime())) {
              anchorDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
            }
          } catch (_) {}
        }
      }
    } catch (_) { /* if fetch fails show last known state */ }
    computeView(range);
    render();
  }

  global.LarisTrending = {
    mount,
    refresh,
    unmount,
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : this);
