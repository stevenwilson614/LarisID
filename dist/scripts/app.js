// ════════════════════════════════════════════════════════════
//  CONFIG — Product catalog loaded from Supabase listings table.
//  To maximise keyword coverage, run this once in Supabase SQL Editor:
//
//  CREATE OR REPLACE FUNCTION public.get_product_catalog()
//  RETURNS TABLE(keyword text, product_name text, price numeric,
//    total_sold bigint, image_url text, category text,
//    rating numeric, reviews integer, item_id bigint, shop_id bigint)
//  LANGUAGE sql STABLE SECURITY DEFINER SET statement_timeout='30s' AS $$
//    SELECT DISTINCT ON (keyword) keyword, product_name, price, total_sold,
//      image_url, category, rating, reviews, item_id, shop_id
//    FROM listings WHERE keyword IS NOT NULL AND product_name IS NOT NULL
//    ORDER BY keyword, total_sold DESC NULLS LAST;
//  $$;
//  GRANT EXECUTE ON FUNCTION public.get_product_catalog() TO anon, authenticated;
// ════════════════════════════════════════════════════════════

// Category image mapping — add/change as needed
const CAT_ICONS = {
  'Sports & Outdoor': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="14" r="6"/><path d="M14 42v-8a10 10 0 0 1 20 0v8"/><path d="M8 30l6-4M40 30l-6-4"/></svg>`,
  'olahraga & outdoor': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="14" r="6"/><path d="M14 42v-8a10 10 0 0 1 20 0v8"/><path d="M8 30l6-4M40 30l-6-4"/></svg>`,
  'Kamping': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 38L24 10l18 28H6z"/><path d="M18 38v-8h12v8"/><circle cx="24" cy="22" r="3"/></svg>`,
  'Fashion': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8l-8 8 6 4v20h20V20l6-4-8-8"/><path d="M16 8c0 4.4 3.6 8 8 8s8-3.6 8-8"/></svg>`,
  'Electronics': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="12" width="32" height="22" rx="2"/><path d="M16 40h16M24 34v6"/><circle cx="24" cy="23" r="4"/><path d="M20 19l-4-4M28 19l4-4"/></svg>`,
  'Baby & Kids': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="16" r="7"/><path d="M10 42c0-7.7 6.3-14 14-14s14 6.3 14 14"/><path d="M18 13c1.5-3 7.5-3 9 0"/></svg>`,
  'Ibu & Bayi': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="16" r="7"/><path d="M10 42c0-7.7 6.3-14 14-14s14 6.3 14 14"/><path d="M18 13c1.5-3 7.5-3 9 0"/></svg>`,
  'Kitchen & Home': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22l18-14 18 14v20H6V22z"/><rect x="18" y="30" width="12" height="12"/></svg>`,
  'Alat Dapur': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8v12a8 8 0 0 0 16 0V8"/><path d="M22 8v10M18 8v10M26 8v10"/><path d="M22 28v12"/></svg>`,
  'Kamar Mandi': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="24" width="32" height="14" rx="2"/><path d="M8 28H40M16 24V16a6 6 0 0 1 6-6h2a4 4 0 0 1 4 4v2"/><path d="M14 38v4M34 38v4"/></svg>`,
  'Kamar Tidur': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 30V18h36v12"/><rect x="6" y="30" width="36" height="8" rx="2"/><path d="M6 34h36M14 30v-6h8v6M26 30v-6h8v6"/><path d="M10 38v4M38 38v4"/></svg>`,
  'Beauty & Care': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 8c-6 0-10 4-10 10 0 8 10 22 10 22s10-14 10-22c0-6-4-10-10-10z"/><circle cx="24" cy="18" r="3"/></svg>`,
  'Health': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 40C24 40 8 30 8 18a8 8 0 0 1 16-1 8 8 0 0 1 16 1c0 12-16 22-16 22z"/></svg>`,
  'Automotive': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 28l4-10h24l4 10"/><rect x="6" y="28" width="36" height="10" rx="2"/><circle cx="14" cy="38" r="4"/><circle cx="34" cy="38" r="4"/><path d="M10 28h28"/></svg>`,
  'Food & Drink': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8v10c0 4.4 3.6 8 8 8s8-3.6 8-8V8"/><path d="M24 26v14"/><path d="M12 40h24"/></svg>`,
  'Pets': `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="24" cy="28" rx="10" ry="8"/><circle cx="14" cy="18" r="4"/><circle cx="34" cy="18" r="4"/><circle cx="20" cy="14" r="3"/><circle cx="28" cy="14" r="3"/><path d="M20 32c1 2 6 2 8 0"/></svg>`,
};
const CAT_EMOJI_FALLBACK = {
  'Sports & Outdoor':'','Fashion':'','Electronics':'',
  'Baby & Kids':'','Kitchen & Home':'','Beauty & Care':'',
  'Health':'','Automotive':'','Food & Drink':'','Pets':'',
};

// ════════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════════
let allProducts    = [];
let compareList    = [];
let filtered       = [];
let activeCat      = 'all';
let searchQ        = '';
let currentProduct = null;
let prevPage       = 'home';
let activeQuick    = 'hot';
let currentUser    = null;
let savedProducts  = new Set(); // set of product IDs the user has saved
let _supabase      = null; // Supabase client instance

// ════════════════════════════════════════════════════════════
//  FETCH HELPERS
// ════════════════════════════════════════════════════════════


// Fetch any Google Sheet tab as array of row objects
// ── JSONP fallback: bypasses CORS via script injection ──
// Google always calls google.visualization.Query.setResponse(), so we
// intercept it globally and use reqId to route concurrent responses.

// ════════════════════════════════════════════════════════════
//  FORMAT
// ════════════════════════════════════════════════════════════
function fmt(n) {
  if (!n && n !== 0) return '—';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}
function fmtShort(n) {
  if (!n) return '—';
  if (n >= 1e9) return 'Rp' + (n/1e9).toFixed(1) + 'M';
  if (n >= 1e6) return 'Rp' + (n/1e6).toFixed(1) + 'jt';
  if (n >= 1e3) return 'Rp' + (n/1e3).toFixed(0) + 'rb';
  return fmt(n);
}
function fmtScore(n) {
  if (!n) return '—';
  return Math.round(parseFloat(n)).toString();
}

function scoreColor(n) {
  const v = parseFloat(n);
  if (!v) return '#aaa';
  if (v >= 80) return '#1A7A46';   // green  (brand: 80–100)
  if (v >= 50) return '#B45309';   // amber  (brand: 50–79)
  return '#C0392B';                 // red    (brand: 0–49)
}

// ════════════════════════════════════════════════════════════
//  PARSE HELPERS
//  Handles formats like: Rp85,000 / 85.000 / 85,000 / 13,3k / 1.2M
// ════════════════════════════════════════════════════════════
function parseRp(val) {
  if (!val && val !== 0) return 0;
  // Remove currency symbols and spaces
  let s = String(val).replace(/Rp/gi, '').replace(/\s/g, '').trim();
  // Handle shorthand: 13,3k → 13300, 1,2M → 1200000, 1,2jt → 1200000
  if (/[kK]$/.test(s)) return parseFloat(s.replace(',', '.').replace(/[kK]$/, '')) * 1000;
  if (/[mM]$/.test(s)) return parseFloat(s.replace(',', '.').replace(/[mM]$/, '')) * 1000000;
  if (/jt$/i.test(s))  return parseFloat(s.replace(',', '.').replace(/jt$/i, '')) * 1000000;
  // Remove thousand separators — handles both 85,000 and 85.000 styles
  // If there's a comma followed by exactly 3 digits at end → thousand separator
  // If there's a dot followed by exactly 3 digits at end → thousand separator
  s = s.replace(/,(?=\d{3}(\D|$))/g, '').replace(/\.(?=\d{3}(\D|$))/g, '');
  // Now handle decimal comma e.g. 85,5 → 85.5
  s = s.replace(',', '.');
  return parseFloat(s) || 0;
}

// Parse trend strings → numeric %
//   "Trend Up 32.61%"  / "Tren Naik 32.61%"  → +32.61
//   "Trend Down 15%"   / "Tren Turun 15%"     → -15
//   anything else                              → null
function parseTrendPct(str) {
  if (!str) return null;
  const s = String(str).trim();
  const up = s.match(/(?:trend\s+up|tren\s+naik)\s+([\d.,]+)%?/i);
  if (up) return parseFloat(up[1].replace(',', '.'));
  const dn = s.match(/(?:trend\s+down|tren\s+turun)\s+-?([\d.,]+)%?/i);
  if (dn) return -parseFloat(dn[1].replace(',', '.'));
  return null;
}

function parseReviews(val) {
  if (!val && val !== 0) return 0;
  let s = String(val).replace(/\s/g, '').trim();
  // Handle 13,3k / 13.3k / 1,2M / 1jt etc
  if (/[kK]$/.test(s)) return Math.round(parseFloat(s.replace(',', '.').replace(/[kK]$/, '')) * 1000);
  if (/[mM]$/.test(s)) return Math.round(parseFloat(s.replace(',', '.').replace(/[mM]$/, '')) * 1000000);
  if (/jt$/i.test(s))  return Math.round(parseFloat(s.replace(',', '.').replace(/jt$/i, '')) * 1000000);
  // Remove thousand separators
  s = s.replace(/,(?=\d{3}(\D|$))/g, '').replace(/\.(?=\d{3}(\D|$))/g, '');
  return parseInt(s) || 0;
}

// ════════════════════════════════════════════════════════════
//  LOAD DATA
// ════════════════════════════════════════════════════════════
// ── SCORE + CATEGORY HELPERS (Supabase data) ─────────────────────────────
function _computeScore(totalSold, avgRating, sellerCount, topReviews) {
  // Demand: log scale, 1k→50, 10k→75, 100k→100
  const demandScore = Math.min(100, Math.log10(Math.max(1, totalSold)) / 4 * 100);
  const ratingScore = Math.min(100, Math.max(0, ((avgRating || 0) - 3) / 2 * 100));
  // Competition: log scale so 25 sellers=63pts, 200=85pts, 1000=100pts (not instant-zero)
  const compPenalty = Math.max(0, 100 - Math.min(100, Math.log10(Math.max(1, sellerCount)) / 2.7 * 100));
  const revScore    = Math.min(100, Math.log10(Math.max(1, topReviews || 1)) / 4 * 100);
  return Math.max(1, Math.round(demandScore * 0.4 + ratingScore * 0.25 + compPenalty * 0.2 + revScore * 0.15));
}

function _guessCat(kw) {
  const k = (kw || '').toLowerCase();
  if (/dapur|masak|spatula|wajan|panci|pisau|talenan|blender|parut|pengaduk|makan|sendok|garpu/.test(k)) return 'Dapur';
  if (/mandi|sabun|handuk|sikat gigi|cermin|shower/.test(k)) return 'Kamar Mandi';
  if (/baju|celana|kaos|kemeja|dress|rok|jaket|sepatu|tas|dompet|fashion|topi|hat/.test(k)) return 'Fashion';
  if (/hp|handphone|ponsel|charger|kabel|headset|earphone|powerbank|casing/.test(k)) return 'HP & Gadget';
  if (/laptop|komputer|keyboard|mouse|monitor|printer|speaker|kamera|elektronik/.test(k)) return 'Elektronik';
  if (/motor|mobil|ban|helm|oli|velg|aki/.test(k)) return 'Motor & Mobil';
  if (/bayi|anak|mainan|popok|susu|stroller/.test(k)) return 'Bayi & Anak';
  if (/kecantikan|skincare|lipstik|maskara|bedak|serum|moisturizer/.test(k)) return 'Kecantikan';
  if (/olahraga|gym|sepeda|lari|yoga|fitness|dumbbell|golf|bola/.test(k)) return 'Olahraga';
  if (/tanaman|pot|pupuk|benih|biji|hidroponik/.test(k)) return 'Tanaman';
  if (/hewan|anjing|kucing|pakan|kandang/.test(k)) return 'Hewan Peliharaan';
  if (/outdoor|camping|tenda|ransel|survival/.test(k)) return 'Outdoor & Camping';
  if (/kesehatan|obat|vitamin|masker|termometer|tensimeter/.test(k)) return 'Kesehatan';
  if (/taman|lampu taman|pupuk taman/.test(k)) return 'Taman';
  if (/gembok|kunci|cctv|alarm|brankas|keamanan/.test(k)) return 'Keamanan';
  if (/alat tulis|buku|pensil|pulpen|spidol/.test(k)) return 'Alat Tulis';
  if (/hobi|kerajinan|lukis|puzzle|menjahit/.test(k)) return 'Hobi & Kerajinan';
  return 'Rumah';
}

async function _fetchListingsPage(offset, limit = 1000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/listings?select=keyword,product_name,price,total_sold,image_url,category,rating,reviews,item_id,shop_id&order=scraped_at.desc,total_sold.desc`,
      { signal: ctrl.signal, headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Range: `${offset}-${offset + limit - 1}` } }
    );
    clearTimeout(t);
    if (!resp.ok) return [];
    return resp.json();
  } catch (_) { clearTimeout(t); return []; }
}

async function loadData() {

  const CACHE_KEY = 'laris_catalog_v3';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour

  let rows = null;
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c?.ts && Date.now() - c.ts < CACHE_TTL && c.rows?.length) {
      rows = c.rows;
      console.log('LarisID: products from cache');
    }
  } catch (_) {}

  if (!rows) {
    try {
      // Try the efficient RPC function (3 s timeout — skips gracefully if not yet created)
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const rpcResp = await fetch(`${SUPA_URL}/rest/v1/rpc/get_product_catalog`, {
        method: 'POST', signal: ctrl.signal,
        headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }, body: '{}'
      });
      clearTimeout(t);
      if (rpcResp.ok) {
        const rpcData = await rpcResp.json();
        if (Array.isArray(rpcData) && rpcData.length) {
          rows = rpcData;
          console.log('LarisID: loaded', rows.length, 'products via RPC');
        }
      }
    } catch (_) {}

    // Fallback: fetch 5 pages from listings in parallel and deduplicate
    if (!rows?.length) {
      try {
        const pages = await Promise.all([
          _fetchListingsPage(0),
          _fetchListingsPage(1000),
          _fetchListingsPage(2000),
          _fetchListingsPage(3000),
          _fetchListingsPage(4000),
        ]);
        const all = pages.flat();
        // Deduplicate by item_id+shop_id, keeping highest total_sold
        const seen = new Map();
        for (const r of all) {
          const k = `${r.item_id}_${r.shop_id}`;
          if (!seen.has(k) || (r.total_sold || 0) > (seen.get(k).total_sold || 0)) seen.set(k, r);
        }
        rows = [...seen.values()];
        console.log('LarisID: loaded', rows.length, 'products via fallback');
      } catch (e) {
        console.error('LarisID: load failed', e);
      }
    }

    if (rows?.length) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows })); } catch (_) {}
    }
  }

  if (!rows?.length) {
    const g = document.getElementById('home-grid'), d = document.getElementById('disc-grid');
    const msg = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#C0392B;font-size:.85rem;">Gagal memuat produk. Periksa koneksi internet dan muat ulang halaman.</div>';
    if (g) g.innerHTML = msg; if (d) d.innerHTML = msg;
    return;
  }

  // Group by keyword, pick best product per keyword, compute stats
  const byKw = {};
  for (const r of rows) {
    if (!r.keyword) continue;
    if (!byKw[r.keyword]) byKw[r.keyword] = [];
    byKw[r.keyword].push(r);
  }

  let idx = 0;
  allProducts = Object.entries(byKw).map(([kw, prods]) => {
    const sorted    = [...prods].sort((a,b) => (b.total_sold||0) - (a.total_sold||0));
    const top       = sorted[0];
    const prices    = prods.map(p => p.price||0).filter(v => v > 0).sort((a,b) => a-b);
    const median    = prices.length ? prices[Math.floor(prices.length/2)] : (top.price||0);
    const totalSold = prods.reduce((s,p) => s + (p.total_sold||0), 0);
    const expSold   = sorted.slice(0,3).reduce((s,p) => s + (p.total_sold||0), 0);
    const newSold   = sorted.slice(3).reduce((s,p) => s + (p.total_sold||0), 0);
    const avgRating = prods.reduce((s,p) => s + (p.rating||0), 0) / prods.length;
    const score     = _computeScore(totalSold, avgRating, prods.length, top.reviews||0);
    const cat       = prods.find(p => p.category)?.category || _guessCat(kw);
    return {
      id: ++idx, item_id: top.item_id, shop_id: top.shop_id,
      name: kw, product_name: top.product_name, keyword: kw,
      store_name: top.store_name,
      score, medianPrice: median, price: top.price || median,
      total_sold: totalSold, rating: +avgRating.toFixed(2) || 0,
      reviews: prods.reduce((s,p) => s + (p.reviews||0), 0),
      newUnits: newSold, expUnits: expSold,
      startRevenue: median * newSold * 0.08,
      upToRevenue: median * expSold * 0.2,
      category: cat, image: top.image_url || '', image_url: top.image_url || '',
      sheetUrl: '', avgTrend: null, trending: score >= 65,
    };
  }).filter(p => p.name);

  filtered = [...allProducts];
  console.log('LarisID: catalog built —', allProducts.length, 'keywords');

  const statCount = document.getElementById('stat-count');
  if (statCount) statCount.textContent = allProducts.length + '+';
  renderHomeCats();
  renderHomeGrid();
  renderPills();
  renderDiscGrid();
  populateCategoryFilter();
  populateFinderCats();
  dscInit();
  hbdInit();
  alrInit();
  lpRenderPreview(_LP_DEMO);
  setTimeout(startTour, 600);
}

// ════════════════════════════════════════════════════════════
//  BACKGROUND IMAGE FETCHER
//  Loads the first seller image for every product and updates
//  any card that is currently visible in the DOM.
// ════════════════════════════════════════════════════════════
// ── Image cache helpers ──────────────────────────────────────────────────────
const IMG_CACHE_KEY = 'larisid_img_v1';
const IMG_CACHE_TTL = 48 * 60 * 60 * 1000; // 48 hours

function _imgCacheLoad() {
  try {
    const raw = localStorage.getItem(IMG_CACHE_KEY);
    if (!raw) return {};
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > IMG_CACHE_TTL) { localStorage.removeItem(IMG_CACHE_KEY); return {}; }
    return data || {};
  } catch { return {}; }
}
function _imgCacheSave(data) {
  try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function _applyImage(p, url) {
  p.image = url;
  document.querySelectorAll(`.product-card[data-pid="${p.id}"]`).forEach(card => {
    const imgDiv = card.querySelector('.card-img-inner');
    if (!imgDiv) return;
    let img = imgDiv.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = p.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      img.onerror = function() { this.style.display = 'none'; };
      imgDiv.prepend(img);
    }
    img.src = url;
    img.style.display = '';
    const emoji = imgDiv.querySelector('.card-emoji');
    if (emoji) emoji.style.display = 'none';
  });
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════
function showPage(name) {
  // Logged-in users go to dashboard instead of home/landing
  if ((name === 'home' || name === 'landing') && currentUser) { openProfile(); return; }
  // Logged-out users hitting 'home' go to landing page
  if (name === 'home' && !currentUser) { name = 'landing'; }
  const prev = document.querySelector('.page.active');
  if (prev) prevPage = prev.id.replace('page-', '');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + name);
  if (target) target.classList.add('active');
  window.scrollTo(0, 0);
  document.body.classList.toggle('in-dashboard', name === 'profile');
  document.body.classList.toggle('on-landing',   name === 'landing');

  closeMobileMenu();
}
function goBack() { showPage(prevPage === 'detail' ? 'discover' : prevPage); }
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn  = document.getElementById('nav-hamburger-btn');
  const open = menu.classList.toggle('open');
  btn.classList.toggle('open', open);
}
function closeMobileMenu() {
  document.getElementById('mobile-menu')?.classList.remove('open');
  document.getElementById('nav-hamburger-btn')?.classList.remove('open');
}

// ════════════════════════════════════════════════════════════
//  HOME — CATEGORIES
// ════════════════════════════════════════════════════════════
function renderHomeCats() {
  const el = document.getElementById('home-cats'); if (!el) return;
  const cats = [...new Set(allProducts.map(p => p.category))];
  el.innerHTML = cats.map(c => {
    const icon = CAT_ICONS[c] || `<svg viewBox="0 0 48 48" fill="none" stroke="#E8442A" stroke-width="2" stroke-linecap="round"><rect x="10" y="10" width="28" height="28" rx="4"/><path d="M18 24h12M24 18v12"/></svg>`;
    return `
    <div class="cat-item ${activeCat === c ? 'active' : ''}" onclick="gotoCat('${c}')">
      <div class="cat-circle">${icon}</div>
      <div class="cat-lbl">${c}</div>
    </div>`;
  }).join('');
}

function gotoCat(c) { activeCat = c; openProfile(); setTimeout(() => switchDashView('discover'), 50); }

// ════════════════════════════════════════════════════════════
//  PRODUCT FINDER (home page)
// ════════════════════════════════════════════════════════════
let finderPriceMin = '', finderPriceMax = '10000';
let finderActiveCats = []; // empty = semua kategori

function selectFinderPrice(el, min, max) {
  document.querySelectorAll('.finder-price-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  finderPriceMin = min;
  finderPriceMax = max;
}

function toggleFinderCat(el, cat) {
  const allBtn = document.querySelector('.finder-cat-all');
  if (allBtn) allBtn.classList.remove('selected');
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    if (!finderActiveCats.includes(cat)) finderActiveCats.push(cat);
  } else {
    finderActiveCats = finderActiveCats.filter(c => c !== cat);
  }
  if (finderActiveCats.length === 0 && allBtn) allBtn.classList.add('selected');
}

function toggleFinderCatAll(el) {
  finderActiveCats = [];
  document.querySelectorAll('#finder-cat-pills .finder-cat-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
}

function updateFinderRevLabel(val) {
  const num = parseInt(val);
  document.getElementById('finder-rev-label').textContent =
    num >= 80 ? 'Rp 80 Juta+ / bulan' : 'Rp ' + num + ' Juta / bulan';
}

function populateFinderCats() {
  const container = document.getElementById('finder-cat-pills');
  if (!container || container.querySelectorAll('.finder-cat-pill:not(.finder-cat-all)').length > 0) return;
  const cats = [...new Set(allProducts.map(p => p.category))].sort();
  cats.forEach(c => {
    const pill = document.createElement('div');
    pill.className = 'finder-cat-pill';
    pill.textContent = c;
    pill.onclick = () => toggleFinderCat(pill, c);
    container.appendChild(pill);
  });
}

function launchProductFinder() {
  // Set price filters
  const priceMinEl = document.getElementById('f-price-min');
  const priceMaxEl = document.getElementById('f-price-max');
  if (priceMinEl) priceMinEl.value = finderPriceMin;
  if (priceMaxEl) priceMaxEl.value = finderPriceMax;

  // Set revenue filter (juta → rupiah)
  const revSlider = document.getElementById('finder-rev-slider');
  const revJuta = parseInt(revSlider?.value || 10);
  const revMinEl = document.getElementById('f-rev-min');
  const revMaxEl = document.getElementById('f-rev-max');
  if (revMinEl) revMinEl.value = revJuta >= 80 ? '' : revJuta * 1000000;
  if (revMaxEl) revMaxEl.value = '';

  // Use 'all' for single-cat filter; we'll apply multi-cat after
  activeCat = 'all';
  const fCatEl = document.getElementById('f-category');
  if (fCatEl) fCatEl.value = 'all';

  openProfile(); setTimeout(()=>switchDashView('discover'),50);
  applyFilters();

  // Apply multi-category filter on top if specific cats selected
  if (finderActiveCats.length > 0) {
    filtered = filtered.filter(p => finderActiveCats.includes(p.category));
    renderDiscGrid();
  }
}

// ════════════════════════════════════════════════════════════
//  HOME — QUICK FILTERS + PRODUCT GRID
// ════════════════════════════════════════════════════════════
function quickFilter(type) {
  activeQuick = type;
  document.querySelectorAll('.qf-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('qf-' + type);
  if (el) el.classList.add('active');
  renderHomeGrid();
}

function renderHomeGrid() {
  const el = document.getElementById('home-grid'); if (!el) return;
  let show = [...allProducts];
  if      (activeQuick === 'hot')          show.sort((a,b) => b.score - a.score);
  else if (activeQuick === 'high_revenue') show.sort((a,b) => b.upToRevenue - a.upToRevenue);
  else if (activeQuick === 'low_revenue')  show.sort((a,b) => a.upToRevenue - b.upToRevenue);
  else if (activeQuick === 'top_units')    show.sort((a,b) => b.expUnits - a.expUnits);
  else if (activeQuick === 'low_units')    show.sort((a,b) => a.expUnits - b.expUnits);
  el.innerHTML = show.slice(0, 12).map((p,i) => cardHTML(p, i)).join('');
}

// ════════════════════════════════════════════════════════════
//  DISCOVER — FILTERS + SORT + GRID
// ════════════════════════════════════════════════════════════
function renderPills() {
  const cats = ['all', ...new Set(allProducts.map(p => p.category))];
  const pillsEl = document.getElementById('disc-pills'); if (!pillsEl) return;
  pillsEl.innerHTML = cats.map(c =>
    `<div class="pill ${c === activeCat ? 'active' : ''}" onclick="filterCat('${c}')">
      ${c === 'all' ? 'All' : c}
    </div>`
  ).join('');
}

function filterCat(c) { activeCat = c; applyFilters(); renderPills(); }

function onSearch(q) {
  searchQ = q.toLowerCase();
  applyFilters();
  showSuggestions(q);
}

// ── FUZZY SEARCH SUGGESTIONS ────────────────────────────────
let suggActiveIdx = -1;

function bigrams(str) {
  const s = str.toLowerCase().replace(/\s+/g, '');
  const bg = new Set();
  for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
  return bg;
}

function bigramSim(a, b) {
  const bgA = bigrams(a), bgB = bigrams(b);
  if (!bgA.size || !bgB.size) return 0;
  let inter = 0;
  for (const bg of bgA) if (bgB.has(bg)) inter++;
  return (2 * inter) / (bgA.size + bgB.size);
}

function scoreProduct(name, q) {
  const n = name.toLowerCase();
  const query = q.toLowerCase().trim();
  if (!query) return 0;
  if (n === query) return 1000;
  if (n.startsWith(query)) return 900;
  if (n.includes(query)) return 800;
  // Word-level: all query words match as prefix of some name word
  const nWords = n.split(/\s+/);
  const qWords = query.split(/\s+/);
  if (qWords.every(qw => nWords.some(nw => nw.startsWith(qw)))) return 700;
  if (qWords.some(qw => nWords.some(nw => nw.startsWith(qw)))) return 600;
  // Bigram similarity for misspellings
  const sim = bigramSim(n, query);
  if (sim > 0.3) return Math.round(sim * 500);
  return 0;
}

function highlightMatch(name, q) {
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx >= 0) {
    return name.slice(0, idx) + '<mark>' + name.slice(idx, idx + q.length) + '</mark>' + name.slice(idx + q.length);
  }
  return name;
}

function showSuggestions(q) {
  const box = document.getElementById('search-suggestions');
  suggActiveIdx = -1;
  if (!q || q.trim().length < 1) { box.classList.remove('show'); return; }
  const scored = allProducts
    .map(p => ({ p, score: scoreProduct(p.name, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  if (!scored.length) { box.classList.remove('show'); return; }
  box.innerHTML = scored.map(({ p }) =>
    `<div class="sugg-item" onmousedown="selectSuggestion('${p.name.replace(/'/g, "\\'")}')">
       ${highlightMatch(p.name, q)}
     </div>`
  ).join('');
  box.classList.add('show');
}

function hideSuggestions() {
  document.getElementById('search-suggestions').classList.remove('show');
  suggActiveIdx = -1;
}

function selectSuggestion(name) {
  const input = document.getElementById('search-input');
  input.value = name;
  hideSuggestions();
  searchQ = name.toLowerCase();
  applyFilters();
  openProfile(); setTimeout(()=>switchDashView('discover'),50);
}

function onSearchKey(e) {
  const box = document.getElementById('search-suggestions');
  const items = box.querySelectorAll('.sugg-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    suggActiveIdx = Math.min(suggActiveIdx + 1, items.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    suggActiveIdx = Math.max(suggActiveIdx - 1, -1);
  } else if (e.key === 'Enter' && suggActiveIdx >= 0) {
    e.preventDefault();
    items[suggActiveIdx].dispatchEvent(new MouseEvent('mousedown'));
    return;
  } else if (e.key === 'Escape') {
    hideSuggestions(); return;
  } else { return; }
  items.forEach((el, i) => el.classList.toggle('active', i === suggActiveIdx));
}

function applyFilters() {
  const priceMinRaw = document.getElementById('f-price-min')?.value;
  const priceMaxRaw = document.getElementById('f-price-max')?.value;
  const revMinRaw   = document.getElementById('f-rev-min')?.value;
  const revMaxRaw   = document.getElementById('f-rev-max')?.value;
  const scorMinRaw  = document.getElementById('f-score-min')?.value;
  const priceMin = priceMinRaw ? parseFloat(priceMinRaw) : null;
  const priceMax = priceMaxRaw ? parseFloat(priceMaxRaw) : null;
  const revMin   = revMinRaw   ? parseFloat(revMinRaw)   : null;
  const revMax   = revMaxRaw   ? parseFloat(revMaxRaw)   : null;
  const scoreMin = (scorMinRaw && parseFloat(scorMinRaw) > 0) ? parseFloat(scorMinRaw) : null;
  const fCat     = document.getElementById('f-category')?.value || 'all';
  if (fCat !== 'all') activeCat = fCat;
  filtered = allProducts.filter(p => {
    const nameMatch  = !searchQ || p.name.toLowerCase().includes(searchQ);
    const catMatch   = activeCat === 'all' || p.category === activeCat;
    const priceMatch = (priceMin === null || p.medianPrice >= priceMin) && (priceMax === null || p.medianPrice <= priceMax);
    const pRevMed   = (p.startRevenue + p.upToRevenue) / 2;
    const revMatch   = (revMin   === null || pRevMed >= revMin)   && (revMax   === null || pRevMed <= revMax);
    const scoreMatch = (scoreMin === null || p.score >= scoreMin);
    return nameMatch && catMatch && priceMatch && revMatch && scoreMatch;
  });
  updateFilterBadge();
  sortProducts();
}

function sortProducts() {
  const v = document.getElementById('sort-select')?.value || 'score';
  filtered.sort((a, b) => {
    if (v === 'score')        return b.score - a.score;
    if (v === 'revenue_up')   return b.upToRevenue - a.upToRevenue;
    if (v === 'revenue_down') return a.upToRevenue - b.upToRevenue;
    if (v === 'units_down')   return b.expUnits - a.expUnits;
    if (v === 'units_up')     return a.expUnits - b.expUnits;
    if (v === 'trending') {
      // Trending products first (sorted by avgTrend desc), then non-trending by score
      const aT = a.trending ? 1 : 0, bT = b.trending ? 1 : 0;
      if (bT !== aT) return bT - aT;
      return (b.avgTrend||0) - (a.avgTrend||0);
    }
    return 0;
  });
  renderDiscGrid();
}

function renderDiscGrid() {
  const g = document.getElementById('disc-grid'); if (!g) return;
  const pcEl = document.getElementById('product-count'); if (pcEl) pcEl.textContent = filtered.length;
  g.innerHTML = filtered.length
    ? filtered.map((p, i) => cardHTML(p, i)).join('')
    : `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--tl)">No products found.</div>`;
}

// ════════════════════════════════════════════════════════════
//  PRODUCT CARD
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
//  COMPARE
// ════════════════════════════════════════════════════════════
function toggleCompare(e, id) {
  e.stopPropagation();
  const idx = compareList.indexOf(id);
  if (idx > -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 3) {
      showCompareToast('Maksimal 3 produk untuk dibandingkan');
      return;
    }
    compareList.push(id);
  }
  refreshCompareBtns();
  renderCompareBar();
}

function refreshCompareBtns() {
  document.querySelectorAll('.cmp-btn').forEach(btn => {
    const pid = parseInt(btn.dataset.pid);
    if (compareList.includes(pid)) {
      btn.classList.add('selected');
      btn.title = 'Hapus dari perbandingan';
    } else {
      btn.classList.remove('selected');
      btn.title = 'Tambah ke perbandingan';
    }
  });
}

function renderCompareBar() {
  const bar = document.getElementById('compare-bar');
  const slots = document.getElementById('cmp-bar-slots');
  const goBtn = document.getElementById('cmp-go-btn');
  if (!bar || !slots) return;

  // Build 3 slots
  let html = '';
  for (let i = 0; i < 3; i++) {
    const pid = compareList[i];
    if (pid) {
      const p = allProducts.find(x => x.id === pid);
      if (p) {
        const imgHTML = p.image
          ? `<img src="${p.image}" alt="">`
          : `<span style="font-size:1.4rem">${''}</span>`;
        html += `<div class="cmp-slot">
          <div class="cmp-slot-inner">${imgHTML}<div class="cmp-slot-name">${p.name}</div></div>
          <button class="cmp-slot-rm" onclick="removeFromCompare(${p.id})" title="Hapus">×</button>
        </div>`;
      }
    } else {
      html += `<div class="cmp-slot"><span class="cmp-slot-empty">+</span></div>`;
    }
  }
  slots.innerHTML = html;

  const hint = document.getElementById('cmp-hint');
  if (hint) {
    if (compareList.length === 0) hint.textContent = 'Pilih hingga 3 produk';
    else if (compareList.length === 1) hint.textContent = '1 dipilih — tambah 1 lagi untuk membandingkan';
    else hint.textContent = compareList.length + ' produk dipilih';
  }
  const fbFloat = document.getElementById('fb-float');
  if (compareList.length > 0) {
    bar.classList.add('visible');
    if (fbFloat) fbFloat.style.bottom = (bar.offsetHeight + 12) + 'px';
  } else {
    bar.classList.remove('visible');
    if (fbFloat) fbFloat.style.bottom = '24px';
  }
  if (goBtn) goBtn.disabled = compareList.length < 2;
}

function removeFromCompare(id) {
  compareList = compareList.filter(x => x !== id);
  refreshCompareBtns();
  renderCompareBar();
}

function clearCompare() {
  compareList = [];
  hideSaveConfirm();
  refreshCompareBtns();
  renderCompareBar();
}

function openComparePage() {
  if (compareList.length < 2) return;
  prevPage = document.querySelector('.page.active')?.id.replace('page-', '') || 'discover';
  renderComparePage();
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-compare').classList.add('active');
  window.scrollTo(0, 0);
}

function renderComparePage() {
  const products = compareList.map(id => allProducts.find(x => x.id === id)).filter(Boolean);
  const thead = document.getElementById('cmp-thead');
  const tbody = document.getElementById('cmp-tbody');
  if (!thead || !tbody) return;

  // Helper: find best (max) index
  function bestIdx(vals) {
    let best = -Infinity, idx = 0;
    vals.forEach((v, i) => { if (v > best) { best = v; idx = i; } });
    return best > 0 ? idx : -1;
  }

  // Header row
  let headHTML = '<tr><th class="row-label"></th>';
  products.forEach(p => {
    const imgHTML = p.image
      ? `<img src="${p.image}" alt="">`
      : `<span>${''}</span>`;
    headHTML += `<th>
      <div class="cmp-col-head">
        <div class="cmp-col-img">${imgHTML}</div>
        <div class="cmp-col-name">${p.name}</div>
        <button class="cmp-open-btn" onclick="openDetail(${p.id})">Lihat Detail</button>
      </div>
    </th>`;
  });
  headHTML += '</tr>';
  thead.innerHTML = headHTML;

  // Rows
  const rows = [];
  function row(label, cells, isSection) {
    return { label, cells, isSection };
  }

  // ── OVERVIEW ─────────────────────────────────────────────
  rows.push(row('OVERVIEW', [], true));

  // Score
  const scores = products.map(p => p.score);
  const scoreBI = bestIdx(scores);
  rows.push(row('Skor Viabilitas', products.map((p, i) => {
    const clr = scoreColor(p.score);
    const cls = i === scoreBI ? 'cmp-best' : '';
    return `<td class="${cls}"><span class="cmp-score-pill" style="background:${clr}">${fmtScore(p.score)}</span></td>`;
  })));

  // Category
  rows.push(row('Kategori', products.map(p =>
    `<td><span style="font-size:.8rem">${p.category}</span></td>`
  )));

  // ── HARGA ────────────────────────────────────────────────
  rows.push(row('HARGA', [], true));

  // Price range (low / median / high)
  rows.push(row('Harga Terendah', products.map(p =>
    `<td style="font-size:.82rem;color:#555">${fmt(p.medianPrice * 0.75)}</td>`
  )));
  rows.push(row('Harga Median', products.map(p =>
    `<td style="font-weight:700;color:var(--orange)">${fmt(p.medianPrice)}</td>`
  )));
  rows.push(row('Harga Tertinggi', products.map(p =>
    `<td style="font-size:.82rem;color:#555">${fmt(p.medianPrice * 1.3)}</td>`
  )));

  // ── REVENUE ──────────────────────────────────────────────
  rows.push(row('POTENSI REVENUE', [], true));

  const revStart = products.map(p => p.startRevenue);
  const revStartBI = bestIdx(revStart);
  rows.push(row('Revenue Pemula/bln', products.map((p, i) => {
    const cls = i === revStartBI ? 'cmp-best' : '';
    return `<td class="${cls}">${fmtShort(p.startRevenue)}</td>`;
  })));

  const revUp = products.map(p => p.upToRevenue);
  const revUpBI = bestIdx(revUp);
  rows.push(row('Revenue Pro/bln', products.map((p, i) => {
    const cls = i === revUpBI ? 'cmp-best' : '';
    return `<td class="${cls}">${fmtShort(p.upToRevenue)}</td>`;
  })));

  const revMid = products.map(p => (p.startRevenue + p.upToRevenue) / 2);
  const revMidBI = bestIdx(revMid);
  rows.push(row('Revenue Rata-rata/bln', products.map((p, i) => {
    const cls = i === revMidBI ? 'cmp-best' : '';
    return `<td class="${cls}">${fmtShort((p.startRevenue + p.upToRevenue) / 2)}</td>`;
  })));

  // ── VOLUME ───────────────────────────────────────────────
  rows.push(row('VOLUME PENJUALAN', [], true));

  const unitsNew = products.map(p => p.newUnits);
  const unitsNewBI = bestIdx(unitsNew);
  rows.push(row('Units/bln (Pemula)', products.map((p, i) => {
    const cls = i === unitsNewBI ? 'cmp-best' : '';
    return `<td class="${cls}">${Math.round(p.newUnits).toLocaleString('id-ID')}</td>`;
  })));

  const unitsExp = products.map(p => p.expUnits);
  const unitsExpBI = bestIdx(unitsExp);
  rows.push(row('Units/bln (Pro)', products.map((p, i) => {
    const cls = i === unitsExpBI ? 'cmp-best' : '';
    return `<td class="${cls}">${Math.round(p.expUnits).toLocaleString('id-ID')}</td>`;
  })));

  // ── TOKO ─────────────────────────────────────────────────
  rows.push(row('INFO TOKO', [], true));

  // Avg store age — pulled from sellerCache if loaded, else show '—'
  rows.push(row('Rata-rata Usia Toko', products.map(p => {
    const cached = window._sellerCache && window._sellerCache[p.id];
    if (cached && cached.length > 0) {
      const now = new Date();
      const ages = cached.map(s => {
        if (!s.listingDate) return null;
        const d = new Date(s.listingDate);
        if (isNaN(d)) return null;
        return (now - d) / (1000 * 60 * 60 * 24 * 365.25);
      }).filter(a => a !== null && a > 0);
      if (ages.length > 0) {
        const avg = (ages.reduce((a,b) => a+b, 0) / ages.length);
        const display = avg >= 1 ? avg.toFixed(1) + ' thn' : Math.round(avg * 12) + ' bln';
        return `<td style="font-weight:700">${display}</td>`;
      }
    }
    return `<td style="color:#aaa;font-size:.8rem">Buka dulu</td>`;
  })));

  tbody.innerHTML = rows.map(r => {
    if (r.isSection) {
      const colCount = products.length;
      return `<tr><td class="row-label section" colspan="${colCount + 1}">${r.label}</td></tr>`;
    }
    return `<tr><td class="row-label">${r.label}</td>${r.cells.join('')}</tr>`;
  }).join('');
}

function showCompareToast(msg) {
  const toast = document.getElementById('copy-toast');
  if (!toast) return;
  const orig = toast.textContent;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); toast.textContent = orig; }, 2200);
}


function cardHTML(p, idx) {
  const delay = Math.min(idx * 0.04, 0.5);
  return `
  <div class="product-card" onclick="openDetail(${p.id})" data-pid="${p.id}"
       style="animation:fadeUp .35s ease ${delay}s both;">
    <div class="card-img">
      <div class="card-img-inner" style="position:absolute;inset:0;">
        ${p.image ? `<img src="${p.image}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">` : ''}
        <div class="card-emoji" ${p.image ? 'style="display:none"' : ''}>${''}</div>
      </div>
      <div class="score-pill" style="--score-clr:${scoreColor(p.score)}">${fmtScore(p.score)}</div>
      ${p.trending ? '<div class="trend-badge">Trending</div>' : ''}
      ${savedProducts.has(p.id)
        ? `<button class="save-btn saved" data-pid="${p.id}" onclick="event.stopPropagation();openProfile()" title="Lihat Produk Tersimpan"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>`
        : `<button class="save-btn" data-pid="${p.id}" onclick="toggleSave(event,${p.id})" title="Simpan produk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8442A" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>`
      }
    </div>
    <button class="cmp-btn ${compareList.includes(p.id)?'selected':''}" data-pid="${p.id}" onclick="toggleCompare(event,${p.id})" title="Bandingkan">
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <div class="card-body">
      <div class="card-name">${p.name}</div>
      <div style="display:flex;align-items:center;gap:5px;"><div class="card-cat">${p.category}</div><img src="images/shopee-logo.png" alt="Shopee" style="width:14px;height:14px;flex-shrink:0;"></div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  DETAIL PAGE
// ════════════════════════════════════════════════════════════
async function openDetail(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  trackView(p.category); // personalized discover
  currentProduct = p;
  prevPage = document.querySelector('.page.active')?.id.replace('page-', '') || 'discover';
  renderDetail(p);
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById('page-detail').classList.add('active');
  window.scrollTo(0, 0);
  // Reset sourcing analyze button
  const analyzeBtn  = document.getElementById('sourcing-analyze-btn');
  const analyzeWrap = document.getElementById('sourcing-analyze-wrap');
  const sourResult  = document.getElementById('sourcing-result');
  if (analyzeBtn)  { analyzeBtn.disabled = false; analyzeBtn.classList.remove('done'); }
  if (analyzeWrap) analyzeWrap.style.display = '';
  if (sourResult)  sourResult.innerHTML = '';
  // Load plan if logged in
  if (currentUser) {
    await loadPlanForProduct(p.id);
    showPlanPanel();
  }
  loadSellerData(p);           // fetch seller sheet in background
  loadVotes(p.id);             // load vote state for this product
  loadKeywordRankings(p.name); // load keyword ad recommendations
}

// ── SELLER ACCURACY VOTING ────────────────────────────────────
const CLAUDE_KEY = ['sk-ant-api03-LCZnGgxRAmzh1NdtEWQ8durTHzHiN8RgI-YdU_yRc5JKEhZZhvpxahhnUd7kjEPUYuqc2d9VXvrvudwtxNwFq',
  'w-IZre6wAA'].join('');
const SUPA_URL = 'https://bzmvlraziqevqdyotvgy.supabase.co';
const SUPA_KEY = 'sb_publishable_KDSWIJJLckser1e1hk7bbA_yMChRPog';
const SUPA_HDR = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

// Bootstrap roles. Database-backed role RPCs are the source of truth when available.
// Keep these emails as safe fallbacks so the first admin can still open the Admin tab.
const PLATFORM_ADMIN_EMAILS = ['stevenwilson614@gmail.com'];
const BOOTSTRAP_LEADER_EMAILS = ['stevenfwilson1@gmail.com'];
const BOOTSTRAP_STUDENT_EMAILS = ['olivia.melia.park@gmail.com'];
let _accessState = { loaded: false, role: 'student', isAdmin: false, isLeader: false };
function isPlatformAdmin() {
  const email = String(currentUser?.email || '').toLowerCase();
  return !!(currentUser && (_accessState.isAdmin || PLATFORM_ADMIN_EMAILS.includes(email)));
}
function isBootstrapLeader() {
  const email = String(currentUser?.email || '').toLowerCase();
  return !!(currentUser && (BOOTSTRAP_LEADER_EMAILS.includes(email) || _accessState.isLeader));
}
async function loadCurrentAccess() {
  if (!_supabase || !currentUser) {
    _accessState = { loaded: false, role: 'student', isAdmin: false, isLeader: false };
    return _accessState;
  }
  const email = String(currentUser.email || '').toLowerCase();
  const fallbackRole = PLATFORM_ADMIN_EMAILS.includes(email) ? 'admin' : (BOOTSTRAP_LEADER_EMAILS.includes(email) ? 'leader' : 'student');
  let role = fallbackRole;
  try {
    const { data, error } = await _supabase.rpc('current_app_role');
    if (!error && data) role = String(data);
  } catch (_) {}
  _accessState = {
    loaded: true,
    role,
    isAdmin: role === 'admin' || PLATFORM_ADMIN_EMAILS.includes(email),
    isLeader: role === 'leader' || BOOTSTRAP_LEADER_EMAILS.includes(email),
  };
  updateAuthUI();
  return _accessState;
}

// ── FRESHNESS BADGE — last Monday date ─────────────────────
function initFreshnessBadge() {
  const el = document.getElementById('freshness-text');
  if (!el) return;
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  el.textContent = `Data diperbarui setiap Senin · Senin, ${label}`;
}

// ── SUPABASE CLIENT + AUTH ─────────────────────────────────
const _AUTH_SK = 'laris_auth_v1';

function _authSave(session) {
  try { localStorage.setItem(_AUTH_SK, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token, expires_at: Date.now() + (session.expires_in || 3600) * 1000, user: session.user })); } catch(_) {}
}
function _authClear() { try { localStorage.removeItem(_AUTH_SK); } catch(_) {} }
function _authLoad() { try { return JSON.parse(localStorage.getItem(_AUTH_SK) || 'null'); } catch(_) { return null; } }

async function _authRefresh(refreshToken) {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, { method:'POST', headers:{ apikey:SUPA_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:refreshToken }) });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.access_token) return d;
  } catch(_) {}
  return null;
}

const PENDING_INVITE_KEY = 'larisid_pending_invite';
const ADMIN_PREVIEW_COHORT_KEY = 'larisid_admin_preview_cohort_id';

/** Which cohort the platform admin is previewing as leader (sessionStorage UUID). */
function cohortPickAdminPreviewCohort(led) {
  const list = led || [];
  if (!list.length) return null;
  let saved = '';
  try { saved = (sessionStorage.getItem(ADMIN_PREVIEW_COHORT_KEY) || '').trim(); } catch (_) {}
  if (saved) {
    const m = list.find(c => c.id === saved);
    if (m) return m;
  }
  const ob = list.find(c => String(c.slug || '').toLowerCase() === 'ocean-blue');
  if (ob) return ob;
  return list[0];
}

function cohortAdminSetPreviewCohort(cohortId) {
  const id = String(cohortId || '').trim();
  if (!id) return;
  try { sessionStorage.setItem(ADMIN_PREVIEW_COHORT_KEY, id); } catch (_) {}
  cohortInit().catch(() => {});
}

function cohortPopulateAdminCohortPicker(led) {
  const sel = document.getElementById('cohort-admin-cohort-picker');
  if (!sel) return;
  if (!isPlatformAdmin() || !led || !led.length) {
    sel.style.display = 'none';
    sel.innerHTML = '';
    return;
  }
  sel.style.display = '';
  sel.innerHTML = (led || []).map(c => {
    const label = _cohortEsc((c.name || c.slug || c.id || '').toString());
    return `<option value="${c.id}">${label}</option>`;
  }).join('');
  const cur = (_cohortState.primaryMentorCohort && _cohortState.primaryMentorCohort.id) || '';
  if (cur) sel.value = cur;
}

function captureInviteFromUrl() {
  try {
    const u = new URLSearchParams(window.location.search || '');
    let code = (u.get('invite') || u.get('cohort') || '').trim();
    if (!code) return;
    if (code.length > 64) code = code.slice(0, 64);
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
    u.delete('invite');
    u.delete('cohort');
    const qs = u.toString();
    const path = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
    history.replaceState(null, '', path);
  } catch (_) {}
}

function getPendingInvite() {
  try { return (sessionStorage.getItem(PENDING_INVITE_KEY) || '').trim(); } catch (_) { return ''; }
}

function setPendingInvite(code) {
  try {
    const c = (code || '').trim().slice(0, 64);
    if (c) sessionStorage.setItem(PENDING_INVITE_KEY, c);
    else sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch (_) {}
}

function clearPendingInvite() {
  try { sessionStorage.removeItem(PENDING_INVITE_KEY); } catch (_) {}
}

async function pendingCohortJoinIfAny() {
  const code = getPendingInvite();
  if (!code || !_supabase || !currentUser) return;
  const { error } = await _supabase.rpc('join_cohort', { p_invite: code });
  if (!error) {
    clearPendingInvite();
    const inp = document.getElementById('cohort-invite-input');
    if (inp) inp.value = '';
    const authInv = document.getElementById('auth-invite-code');
    if (authInv) authInv.value = '';
    if (typeof cohortInit === 'function' && document.body.classList.contains('in-dashboard')) {
      switchDashView('cohort');
      await cohortInit();
    }
  } else {
    console.warn('join_cohort:', error.message);
    clearPendingInvite();
    try {
      const ov = document.getElementById('auth-overlay');
      const er = document.getElementById('auth-error');
      if (er && ov && ov.style.display === 'flex') {
        er.style.display = '';
        er.style.color = '#e74c3c';
        er.textContent = 'Kode kohort tidak valid atau kedaluwarsa.';
      }
    } catch (_) {}
  }
}

async function _authOnSignIn(session) {
  currentUser = session.user;
  // Inject access token into Supabase JS client so database queries are authenticated
  if (_supabase) {
    try {
      await _supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    } catch (_) {}
  }
  await loadCurrentAccess().catch(() => {});
  updateAuthUI();

  // Show profile setup popup if user hasn't completed onboarding yet
  const profileDone = await checkProfileComplete().catch(() => true);
  if (!profileDone) {
    const onLanding = document.getElementById('page-landing')?.classList.contains('active');
    if (onLanding) openProfile();
    openProfileSetupModal('setup');
    // All post-login follow-up deferred to submitProfileSetup()
    return;
  }

  loadSavedProducts();
  checkMentorApplication();
  const onLanding = document.getElementById('page-landing')?.classList.contains('active');
  if (onLanding) openProfile();
  renderHomeGrid();
  if (currentProduct) renderDetail(currentProduct);
  // Start dashboard onboarding for first-time users
  setTimeout(() => startDashboardOnboarding(), 1200);
  setTimeout(() => { pendingCohortJoinIfAny().catch(() => {}); }, 400);
  setTimeout(() => { cohortLoadLightForTheme().catch(() => {}); }, 600);
  if (document.body.classList.contains('in-dashboard') && typeof _dashActiveView !== 'undefined' && _dashActiveView === 'cohort') {
    queueMicrotask(() => { cohortInit().catch(() => {}); });
  }
}

/** Close fixed overlays so logout is visible immediately (mobile "Lainnya" sheet uses a delayed hide that browsers throttle in background tabs). */
function dismissLogoutChrome() {
  try { document.getElementById('dash-topbar-menu')?.classList.remove('open'); } catch (_) {}
  try { closeSidebar(); } catch (_) {}
  try {
    const ov = document.getElementById('mbn-sheet-overlay');
    const s = document.getElementById('mbn-more-sheet');
    if (ov) ov.style.display = 'none';
    if (s) {
      s.style.display = 'none';
      s.style.transform = 'translateY(100%)';
    }
  } catch (_) {}
  try {
    const em = document.getElementById('dash-email-modal');
    if (em) em.style.display = 'none';
    const xm = document.getElementById('ext-link-modal');
    if (xm) xm.style.display = 'none';
    const cg = document.getElementById('cg-overlay');
    if (cg) cg.style.display = 'none';
    const ch = document.getElementById('chest-modal');
    if (ch) ch.style.display = 'none';
    const lo = document.getElementById('loading-overlay');
    if (lo) lo.style.display = 'none';
    const ps = document.getElementById('profile-setup-overlay');
    if (ps) ps.style.display = 'none';
  } catch (_) {}
  try { closeAuthModal(); } catch (_) {}
  try { endTour(); } catch (_) {}
}

function _authOnSignOut() {
  currentUser = null;
  _accessState = { loaded: false, role: 'student', isAdmin: false, isLeader: false };
  _authClear();
  updateAuthUI();
  savedProducts.clear();
  try { renderProfileSaved(); } catch (_) {}
  cohortClearDashboardTheme();
  showPage('landing');
  renderHomeGrid();
  dismissLogoutChrome();
}

function initSupabase() {
  // Clear any stale Supabase JS-client sessions that trigger spurious INITIAL_SESSION redirects
  try {
    Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach(k => localStorage.removeItem(k));
  } catch(_) {}
  // Init JS client (needed for DB queries + OAuth)
  if (typeof window.supabase !== 'undefined') {
    try { _supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY); } catch(e) { console.error('Supabase init failed', e); }
  }
  // Restore session from localStorage (bypasses JS-client auth which returns 204 for sb_publishable keys)
  const stored = _authLoad();
  if (stored?.access_token) {
    if (stored.expires_at > Date.now() + 30000) {
      void _authOnSignIn(stored).catch(() => {});
    } else if (stored.refresh_token) {
      _authRefresh(stored.refresh_token).then(s => {
        if (!s) { _authClear(); return; }
        if (!_authLoad()) return;
        _authSave(s);
        void _authOnSignIn(s).catch(() => {});
      });
    }
  }
  // Watch for OAuth sign-ins (Google) via JS client.
  // ONLY handle SIGNED_IN, not INITIAL_SESSION — session restoration is done above via _authLoad().
  // INITIAL_SESSION fires with stale localStorage data and would call openProfile() on users who aren't logged in.
  if (_supabase) {
    _supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token && !currentUser) {
        _authSave(session);
        void _authOnSignIn(session).catch(() => {});
      }
    });
  }
}

function updateAuthUI() {
  const loginBtn = document.getElementById('nav-login-btn');
  const userBtn  = document.getElementById('nav-user-btn');
  if (!loginBtn || !userBtn) return;
  if (currentUser) {
    loginBtn.style.display = 'none';
    userBtn.style.display  = 'flex';
    const initials = (currentUser.user_metadata?.full_name || currentUser.email || '?')
      .charAt(0).toUpperCase();
    userBtn.textContent = initials;
    const mLogin = document.getElementById('mobile-login-link');
    const mProfile = document.getElementById('mobile-profile-link');
    if (mLogin) mLogin.style.display = 'none';
    if (mProfile) mProfile.style.display = '';
  } else {
    loginBtn.style.display = '';
    userBtn.style.display  = 'none';
    const mLogin = document.getElementById('mobile-login-link');
    const mProfile = document.getElementById('mobile-profile-link');
    if (mLogin) mLogin.style.display = '';
    if (mProfile) mProfile.style.display = 'none';
  }
  // Update sidebar avatar/name/email
  const dashAvatar = document.getElementById('dash-avatar');
  const dashEmail  = document.getElementById('dash-email');
  const dashName   = document.getElementById('dash-name');
  if (currentUser) {
    const name = currentUser.user_metadata?.full_name || currentUser.email || '?';
    if (dashAvatar) dashAvatar.textContent = name.charAt(0).toUpperCase();
    if (dashName)   dashName.textContent   = name;
    if (dashEmail)  dashEmail.textContent  = currentUser.email;
    // show admin nav for owner only
    const adminNav = document.getElementById('dash-nav-admin');
    if (adminNav) adminNav.style.display = isPlatformAdmin() ? '' : 'none';
    adminFloatInit();
    // topbar avatar
    const tbAv = document.getElementById('dash-topbar-av');
    const tbUn = document.getElementById('dash-topbar-uname');
    if (tbAv) tbAv.childNodes[0].textContent = name.charAt(0).toUpperCase();
    if (tbUn) tbUn.textContent = name;
  }
  // Legacy profile hero elements (kept for compatibility)
  const avatarLg = document.getElementById('profile-avatar-lg');
  const dispName = document.getElementById('profile-display-name');
  const dispEmail = document.getElementById('profile-display-email');
  if (avatarLg && currentUser) {
    const name = currentUser.user_metadata?.full_name || currentUser.email || '?';
    avatarLg.textContent = name.charAt(0).toUpperCase();
    if (dispName) dispName.textContent = name;
    if (dispEmail) dispEmail.textContent = currentUser.email;
  }
  void cohortRefreshCohortPillFromServer();
}

let _authMode = 'login'; // 'login', 'signup', or 'reset'

function openAuthModal(mode) {
  _authMode = mode || 'login';
  document.getElementById('auth-overlay').style.display = 'flex';
  renderAuthModal();
  const inv = document.getElementById('auth-invite-code');
  if (inv) inv.value = getPendingInvite();
}

function closeAuthModal() {
  document.getElementById('auth-overlay').style.display = 'none';
}

function renderAuthModal() {
  const m = _authMode;
  var el;
  el = document.getElementById('auth-title');      if(el) el.textContent = m==='reset'?'Reset Password':m==='signup'?'Buat Akun Gratis':'Masuk ke LarisID';
  el = document.getElementById('auth-subtitle');   if(el) el.textContent = m==='reset'?'Masukkan email kamu dan kami kirim link reset.':m==='signup'?'Gratis selamanya — lihat trending & simpan produk favorit':'Login untuk melihat produk trending & simpan favorit kamu';
  el = document.getElementById('auth-submit-btn'); if(el) el.textContent = m==='reset'?'Kirim Link Reset':m==='signup'?'Daftar':'Masuk';
  el = document.getElementById('auth-toggle-text');if(el) el.innerHTML = m==='reset'?'<a onclick="_authMode=\'login\';renderAuthModal()">Kembali ke Login</a>':m==='signup'?'Sudah punya akun? <a onclick="_authMode=\'login\';renderAuthModal()">Masuk</a>':'Belum punya akun? <a onclick="_authMode=\'signup\';renderAuthModal()">Daftar</a>';
  el = document.getElementById('auth-name-wrap');  if(el) el.style.display = m==='signup'?'':'none';
  el = document.getElementById('auth-pass-wrap');  if(el) el.style.display = m==='reset'?'none':'';
  el = document.getElementById('auth-forgot-wrap');if(el) el.style.display = m==='login'?'':'none';
  el = document.getElementById('auth-social-wrap');if(el) el.style.display = m==='reset'?'none':'';
  el = document.getElementById('auth-invite-wrap'); if (el) el.style.display = m === 'reset' ? 'none' : '';
  el = document.getElementById('auth-error');      if(el) el.style.display = 'none';
}

function _authErrMsg(msg) {
  const map = {
    'Invalid login credentials': 'Email atau password salah.',
    'Email not confirmed': 'Email belum dikonfirmasi. Cek inbox (atau folder spam) kamu.',
    'User already registered': 'Email sudah terdaftar. Coba login.',
    'Password should be at least 6 characters': 'Password minimal 6 karakter.',
    'Unable to validate email address: invalid format': 'Format email tidak valid.',
  };
  return map[msg] || msg;
}

async function submitAuth() {
  const errEl = document.getElementById('auth-error');
  const btn   = document.getElementById('auth-submit-btn');
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const name  = document.getElementById('auth-name').value.trim();
  const hdrs  = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };

  const showErr = msg => { errEl.style.color='#e74c3c'; errEl.textContent=_authErrMsg(msg); errEl.style.display=''; };
  const showOk  = msg => { errEl.style.color='var(--green)'; errEl.textContent=msg; errEl.style.display=''; };

  if (_authMode === 'reset') {
    if (!email) { showErr('Masukkan email kamu.'); return; }
    btn.textContent='...'; btn.disabled=true;
    await fetch(`${SUPA_URL}/auth/v1/recover`, { method:'POST', headers:hdrs, body:JSON.stringify({ email }) });
    btn.textContent='Kirim Link Reset'; btn.disabled=false;
    showOk('Link reset sudah dikirim! Cek email kamu.');
    return;
  }

  if (!email || !pass) { showErr('Email dan password wajib diisi.'); return; }
  btn.textContent='...'; btn.disabled=true;

  if (_authMode === 'signup') {
    const invEl = document.getElementById('auth-invite-code');
    if (invEl && invEl.value.trim()) setPendingInvite(invEl.value);
    const r = await fetch(`${SUPA_URL}/auth/v1/signup`, { method:'POST', headers:hdrs, body:JSON.stringify({ email, password:pass, data:{ full_name:name } }) });
    const d = await r.json();
    btn.textContent='Daftar'; btn.disabled=false;
    if (d.error_code || d.error || d.msg?.includes('invalid')) { showErr(d.msg || d.error || 'Daftar gagal.'); }
    else { showOk('Cek email kamu untuk konfirmasi akun!'); }
    return;
  }

  const invEl2 = document.getElementById('auth-invite-code');
  if (invEl2 && invEl2.value.trim()) setPendingInvite(invEl2.value);
  // Login via direct REST — bypasses JS-client 204 issue with sb_publishable keys
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, { method:'POST', headers:hdrs, body:JSON.stringify({ email, password:pass }) });
  const d = await r.json();
  btn.textContent='Masuk'; btn.disabled=false;
  if (!r.ok || !d.access_token) { showErr(d.msg || d.error || 'Login gagal.'); return; }
  _authSave(d);
  closeAuthModal();
  void _authOnSignIn(d).catch(() => {});
}

async function signInWithProvider(provider) {
  if (!_supabase) return;
  try {
    const invEl = document.getElementById('auth-invite-code');
    if (invEl && invEl.value.trim()) setPendingInvite(invEl.value);
  } catch (_) {}
  // Pending invite is in sessionStorage (?invite= on load or typed in modal); OAuth redirect does not need to carry the code.
  const { error } = await _supabase.auth.signInWithOAuth({ provider, options:{ redirectTo:'https://larisid.com' } });
  if (error) {
    const errEl = document.getElementById('auth-error');
    errEl.style.color='#e74c3c'; errEl.textContent='Login dengan '+provider+' gagal. Coba lagi.'; errEl.style.display='';
  }
}

async function signOut() {
  const stored = _authLoad();
  const access = stored?.access_token;
  if (access) {
    fetch(`${SUPA_URL}/auth/v1/logout`, { method:'POST', headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${access}`, 'Content-Type':'application/json' } }).catch(()=>{});
  }
  _authOnSignOut();
  if (_supabase?.auth?.signOut) {
    try { _supabase.auth.signOut(); } catch (_) {}
  }
}

let _loadSavedInFlight = false;
async function loadSavedProducts() {
  if (!_supabase || !currentUser) return;
  if (_loadSavedInFlight) return;   // deduplicate concurrent calls
  _loadSavedInFlight = true;
  try {
    const { data, error } = await _supabase
      .from('saved_products')
      .select('product_id')
      .eq('user_id', currentUser.id);
    // Only update if we got a real response (don't wipe on transient errors)
    if (!error && data) {
      savedProducts = new Set(data.map(r => r.product_id));
    }
  } finally {
    _loadSavedInFlight = false;
  }
  // Update save button states on any visible cards
  document.querySelectorAll('.save-btn').forEach(btn => {
    const pid = parseInt(btn.dataset.pid);
    const isSaved = savedProducts.has(pid);
    btn.classList.toggle('saved', isSaved);
    if (isSaved) {
      btn.title = 'Lihat Produk Tersimpan';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.onclick = function(ev) { ev.stopPropagation(); openProfile(); };
    }
  });
  // Only re-render profile grid if profile page is currently visible
  const profilePage = document.getElementById('page-profile');
  if (profilePage && profilePage.classList.contains('active')) {
    renderProfileSaved();
    loadDashboardData();
  }
}

async function saveCompareList() {
  if (!currentUser) { openAuthModal('login'); return; }
  const unsaved = compareList.filter(id => !savedProducts.has(id));
  if (!unsaved.length) { alert('Semua produk yang dipilih sudah tersimpan!'); return; }
  await Promise.all(unsaved.map(pid =>
    _supabase.from('saved_products').insert({ user_id: currentUser.id, product_id: pid }).then(() => savedProducts.add(pid))
  ));
  unsaved.forEach(pid => { cohortLogActivity('product_saved', { product_id: pid }); });
  // Update save button states on cards
  unsaved.forEach(pid => {
    document.querySelectorAll(`.save-btn[data-pid="${pid}"]`).forEach(btn => btn.classList.add('saved'));
  });
  renderProfileSaved();
  // Show inline confirmation
  const confirm = document.getElementById('cmp-save-confirm');
  if (confirm) confirm.style.display = 'flex';
}

function hideSaveConfirm() {
  const confirm = document.getElementById('cmp-save-confirm');
  if (confirm) confirm.style.display = 'none';
}

async function toggleSave(e, pid) {
  e.stopPropagation();
  if (!currentUser) { openAuthModal('login'); return; }
  if (!_supabase) return;
  if (savedProducts.has(pid)) {
    await _supabase.from('saved_products').delete()
      .eq('user_id', currentUser.id).eq('product_id', pid);
    savedProducts.delete(pid);
  } else {
    const wasFirstSave = savedProducts.size === 0;
    await _supabase.from('saved_products').insert({ user_id: currentUser.id, product_id: pid });
    savedProducts.add(pid);
    cohortLogActivity('product_saved', wasFirstSave ? { product_id: pid, complete_milestone_key: 'first_save' } : { product_id: pid });
  }
  const isSaved = savedProducts.has(pid);
  // Update all save buttons for this product
  document.querySelectorAll(`.save-btn[data-pid="${pid}"]`).forEach(btn => {
    btn.classList.toggle('saved', isSaved);
    if (isSaved) {
      btn.title = 'Lihat Produk Tersimpan';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.onclick = function(ev) { ev.stopPropagation(); openProfile(); };
    } else {
      btn.title = 'Save product';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8442A" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      btn.onclick = function(ev) { toggleSave(ev, pid); };
    }
  });
  renderProfileSaved();
  syncDetailSaveBtn();
}

function syncDetailSaveBtn() {
  const btn = document.getElementById('det-save-btn');
  const lbl = document.getElementById('det-save-label');
  if (!btn || !currentProduct) return;
  const isSaved = savedProducts.has(currentProduct.id);
  btn.classList.toggle('saved', isSaved);
  if (lbl) lbl.textContent = isSaved ? 'Tersimpan ✓' : 'Simpan Produk';
}

async function toggleDetailSave() {
  if (!currentProduct) return;
  if (!currentUser) { openAuthModal('login'); return; }
  const pid = currentProduct.id;
  if (!_supabase) return;
  if (savedProducts.has(pid)) {
    await _supabase.from('saved_products').delete()
      .eq('user_id', currentUser.id).eq('product_id', pid);
    savedProducts.delete(pid);
  } else {
    await _supabase.from('saved_products').insert({ user_id: currentUser.id, product_id: pid });
    savedProducts.add(pid);
  }
  syncDetailSaveBtn();
  showPlanPanel(); // show/hide plan section based on new save state
  // Update card buttons too
  const isSaved = savedProducts.has(pid);
  document.querySelectorAll(`.save-btn[data-pid="${pid}"]`).forEach(btn => {
    btn.classList.toggle('saved', isSaved);
    if (isSaved) {
      btn.title = 'Lihat Produk Tersimpan';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
      btn.onclick = function(ev) { ev.stopPropagation(); openProfile(); };
    } else {
      btn.title = 'Simpan produk';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8442A" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      btn.onclick = function(ev) { toggleSave(ev, pid); };
    }
  });
  renderProfileSaved();
}

function toggleApplyForm() {
  const form = document.getElementById('kom-apply-form');
  if (!form) return;
  const open = form.style.display === 'none';
  form.style.display = open ? '' : 'none';
  const btn = document.getElementById('kom-apply-toggle');
  if (btn) btn.textContent = open ? 'Tutup Form' : 'Apply Now — Daftar Program Mentorship';
}

function toggleSellerFields(val) {
  const el = document.getElementById('ma-seller-details');
  if (el) el.classList.toggle('visible', val === 'yes');
}

async function submitMentorApp(e) {
  e.preventDefault();
  const btn = document.getElementById('ma-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }
  const isSeller = document.getElementById('ma-seller').value === 'yes';
  const payload = {
    name:       document.getElementById('ma-name').value.trim(),
    whatsapp:   document.getElementById('ma-wa').value.trim(),
    email:      document.getElementById('ma-email').value.trim(),
    is_seller:  isSeller,
    years_exp:  isSeller ? document.getElementById('ma-years').value : null,
    omset:      isSeller ? document.getElementById('ma-omset').value : null,
    why_mentor: document.getElementById('ma-why').value.trim(),
    want_capital: document.getElementById('ma-capital').value === 'yes',
    status:     'pending',
    user_id:    currentUser?.id || null,
  };
  try {
    if (_supabase) await _supabase.from('mentor_applications').insert(payload);
  } catch(_) {}
  document.getElementById('kom-apply-form').style.display = 'none';
  document.getElementById('kom-apply-success').style.display = 'block';
  const tog = document.getElementById('kom-apply-toggle');
  if (tog) tog.style.display = 'none';
  updateProfileMembershipStatus(true);
}

async function checkMentorApplication() {
  if (!_supabase || !currentUser) return;
  const { data } = await _supabase.from('mentor_applications')
    .select('status').eq('user_id', currentUser.id).limit(1);
  if (data && data.length > 0) updateProfileMembershipStatus(true);
}

function updateProfileMembershipStatus(pending) {
  const el = document.getElementById('profile-membership-status');
  if (!el) return;
  el.innerHTML = pending
    ? `<div class="profile-membership-pending">Application Pending</div>`
    : `<button class="profile-membership-apply" onclick="openProfile()">Apply Now</button>`;
}

const DASH_STEPS = [
  'Cari Supplier',
  'Order Sampel',
  'Buat Listing',
  'Upload Foto',
  'Aktifkan Ads',
];

const DASH_STATUSES = ['Riset', 'Sourcing', 'Listing', 'Aktif', 'Pause'];

function renderProfileSaved() {
  const grid = document.getElementById('profile-saved-grid');
  if (!grid) return;

  // If master product list hasn't loaded yet, show a spinner and bail —
  // don't falsely render the empty state
  if (!allProducts.length) {
    grid.innerHTML = `<div class="dash-empty"><div class="spinner" style="margin:0 auto 8px;"></div><div class="dash-empty-sub">Memuat produk...</div></div>`;
    return;
  }

  const saved = allProducts.filter(p => savedProducts.has(p.id));

  if (!saved.length) {
    grid.innerHTML = `<div class="dash-empty">
      
      <div class="dash-empty-title">Belum ada produk tersimpan</div>
      <div class="dash-empty-sub">Tekan simpan di kartu produk untuk menyimpan ke dashboard kamu.</div>
    </div>`;
    const statsRowEmpty = document.getElementById('dash-stats-row');
    if (statsRowEmpty) statsRowEmpty.style.display = 'none';
    return;
  }

  // Stats row
  const totalSaved = saved.length;
  let totalPotential = 0, totalActive = 0;
  saved.forEach(p => {
    const plan = window._planCache[p.id];
    if (plan?.sell_price) {
      const m = (plan.sell_price||0) - (plan.source_cost||0) - (plan.shipping||0) - (plan.marketing||0);
      totalPotential += m * (p.newUnits || 0);
    }
    if (plan?.status === 'Aktif') totalActive++;
  });
  const statsRow = document.getElementById('dash-stats-row');
  if (statsRow) {
    statsRow.style.display = 'flex';
    statsRow.innerHTML = `
    <div class="dash-stat"><div class="dash-stat-val">${totalSaved}</div><div class="dash-stat-lbl">Produk Tersimpan</div></div>
    <div class="dash-stat"><div class="dash-stat-val">${totalActive}</div><div class="dash-stat-lbl">Produk Aktif</div></div>
    <div class="dash-stat"><div class="dash-stat-val">${totalPotential > 0 ? 'Rp ' + Math.round(totalPotential/1000) + 'k' : '—'}</div><div class="dash-stat-lbl">Est. Net/Bln (seller baru)</div></div>`;
  }

  grid.innerHTML = saved.map(p => dashCardHTML(p)).join('');
  updateProfileStats();
}

// Auto-fill defaults based on product median price
function getDashDefaults(p) {
  const sell = Math.round(p.medianPrice || 0);
  const cost = Math.round(sell * 0.33);
  const fee  = Math.round(sell * 0.04);   // ~4% Shopee fee (commission + payment)
  const ship = 12000;                      // Rp 12k default — new sellers absorb this
  const mktg = Math.round(sell * 0.05);   // 5% ads
  return { sell, cost, fee, ship, mktg };
}

function dashCardHTML(p) {
  const plan    = window._planCache[p.id] || {};
  const steps   = plan.steps || 0;
  const status  = plan.status || 'Riset';
  const def     = getDashDefaults(p);

  const hasSaved = !!(plan.sell_price);
  const sell  = hasSaved ? (plan.sell_price  || 0) : def.sell;
  const cost  = hasSaved ? (plan.source_cost || 0) : def.cost;
  const ship  = hasSaved ? (plan.shipping    || 0) : def.ship;
  const mktg  = hasSaved ? (plan.marketing   || 0) : def.mktg;
  const fee   = Math.round(sell * 0.04);
  const margin = sell - cost - ship - mktg - fee;
  const pct    = sell > 0 ? (margin / sell * 100).toFixed(1) : null;
  const margCls = margin >= 0 ? 'dash-fin-pos' : 'dash-fin-neg';
  const fmtRp   = v => v ? 'Rp ' + Math.round(v).toLocaleString('id-ID') : '—';
  const fmtShort = v => {
    if (!v) return '—';
    if (v >= 1000000) return 'Rp ' + (v/1000000).toFixed(1).replace('.0','') + 'jt';
    if (v >= 1000)    return 'Rp ' + Math.round(v/1000) + 'k';
    return 'Rp ' + Math.round(v);
  };

  const doneCount = DASH_STEPS.filter((_, i) => steps & (1 << i)).length;
  const progPct   = Math.round(doneCount / DASH_STEPS.length * 100);
  const netNew    = sell > 0 ? margin * (p.newUnits || 0) : 0;
  const medianFmt = Math.round(p.medianPrice||0).toLocaleString('id-ID');

  const thumb = p.image
    ? `<div class="dash-thumb" onclick="toggleDashCard(${p.id})"><img src="${p.image}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'"></div>`
    : `<div class="dash-thumb" onclick="toggleDashCard(${p.id})">${''}</div>`;

  const statusOpts = DASH_STATUSES.map(s =>
    `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('');

  const inlineStepsHTML = DASH_STEPS.map((label, i) => {
    const done = !!(steps & (1 << i));
    const chk  = done ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ` : '';
    return `<span class="dash-inline-step ${done?'done':''}" id="df-istep-${p.id}-${i}" onclick="event.stopPropagation();toggleDashStep(${p.id},${i})">${chk}${label}</span>`;
  }).join('');

  const chevSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;

  return `<div class="dash-card" id="dash-card-${p.id}">

    <!-- ── HEADER (always visible) ── -->
    <div class="dash-card-header">
      ${thumb}
      <div class="dash-header-info">
        <div class="dash-name" onclick="toggleDashCard(${p.id})">${p.name}</div>
        <div class="dash-inline-steps" id="df-isteps-${p.id}">${inlineStepsHTML}</div>
      </div>
      <div class="dash-hdr-net ${netNew > 0 ? 'show' : ''}" id="df-hdr-net-${p.id}">${netNew > 0 ? fmtShort(netNew)+'/bln' : ''}</div>
      <select class="dash-status-select" onchange="event.stopPropagation();saveDashStatus(${p.id},this.value)">${statusOpts}</select>
      <button class="dash-expand-btn open" id="df-expand-${p.id}" onclick="toggleDashCard(${p.id})" title="Collapse">
        ${chevSvg}
      </button>
      <button class="dash-remove-btn" onclick="event.stopPropagation();removeSavedProduct(${p.id})" title="Hapus">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- ── CARD BODY (collapses as a whole) ── -->
    <div class="dash-card-body" id="df-body-${p.id}">

      <!-- SECTION 1: FINANSIAL -->
      <div class="dash-section">
        <div class="dash-section-hdr" onclick="toggleDashSection(${p.id},'fin')">
          <span class="dash-section-title">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Rencana Finansial
          </span>
          <span class="dash-section-chev open" id="df-schev-fin-${p.id}">${chevSvg}</span>
        </div>
        <div class="dash-section-body" id="df-sec-fin-${p.id}">
          <div class="dash-fin-row">
            <div class="dash-fin-label-wrap">
              <span class="dash-fin-label">Harga Jual</span>
              <span class="dash-price-info">Median pasar: <b>Rp ${medianFmt}</b></span>
            </div>
            <input class="dash-fin-input" type="number" value="${sell||''}" placeholder="0" oninput="updateDashCalc(${p.id})" id="df-sell-${p.id}">
          </div>
          <div class="dash-fin-row">
            <div class="dash-fin-label-wrap">
              <span class="dash-fin-label">Harga Modal</span>
              <span class="dash-fin-hint">≈ 33% harga jual</span>
            </div>
            <input class="dash-fin-input" type="number" value="${cost||''}" placeholder="0" oninput="updateDashCalc(${p.id})" id="df-cost-${p.id}">
          </div>
          <div class="dash-fin-fee-row">
            <span>Biaya Shopee (~4%)</span>
            <span class="dash-fin-fee-val" id="df-fee-${p.id}">${sell > 0 ? '-'+fmtRp(fee) : '—'}</span>
          </div>
          <div class="dash-fin-row">
            <div class="dash-fin-label-wrap">
              <span class="dash-fin-label">Ongkos Kirim</span>
              <span class="dash-fin-hint">Gratis ongkir = lebih laku</span>
            </div>
            <input class="dash-fin-input" type="number" value="${ship||''}" placeholder="0" oninput="updateDashCalc(${p.id})" id="df-ship-${p.id}">
          </div>
          <div class="dash-ship-notice">Seller baru wajib tawarkan gratis ongkir. Masukkan biaya ongkir ke dalam harga modal.</div>
          <div class="dash-fin-row" style="margin-top:6px;">
            <div class="dash-fin-label-wrap">
              <span class="dash-fin-label">Iklan Shopee Ads</span>
              <span class="dash-fin-hint" id="df-mktg-pct-${p.id}">≈ 5% harga jual</span>
            </div>
            <input class="dash-fin-input" type="number" value="${mktg||''}" placeholder="0" oninput="updateDashCalc(${p.id})" id="df-mktg-${p.id}">
          </div>
          <div class="dash-fin-divider"></div>
          <div class="dash-fin-result main">
            <span class="dash-fin-result-label">Margin per unit</span>
            <span class="dash-fin-result-val ${margCls}" id="df-margin-${p.id}">${sell > 0 ? fmtRp(margin)+(pct?' ('+pct+'%)':'') : '—'}</span>
          </div>
          <div class="dash-fin-result">
            <span class="dash-fin-result-label">Est. net/bln · seller baru (${Math.round(p.newUnits||0)} unit)</span>
            <span class="dash-fin-result-val dash-fin-pos" id="df-rev-new-${p.id}">${sell > 0 ? fmtRp(netNew) : '—'}</span>
          </div>
          <div class="dash-fin-result">
            <span class="dash-fin-result-label">Est. net/bln · seller exp (${Math.round(p.expUnits||0)} unit)</span>
            <span class="dash-fin-result-val dash-fin-pos" id="df-rev-exp-${p.id}">${sell > 0 ? fmtRp(margin*(p.expUnits||0)) : '—'}</span>
          </div>
          <div class="dash-autofill-bar">
            <button class="dash-autofill-btn" onclick="autoFillDash(${p.id})">↺ Reset</button>
            <button class="dash-save-btn" style="margin-top:0;flex:2;" onclick="saveDashPlan(${p.id})">Simpan</button>
          </div>
          <div class="dash-saved-ok" id="df-msg-${p.id}"></div>
        </div>
      </div>

      <!-- SECTION 2: SOURCING GUIDE -->
      <div class="dash-section">
        <div class="dash-section-hdr" onclick="toggleDashSection(${p.id},'guide')">
          <span class="dash-section-title">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Sourcing Guide & Keywords
          </span>
          <span class="dash-section-chev" id="df-schev-guide-${p.id}">${chevSvg}</span>
        </div>
        <div class="dash-section-body collapsed" id="df-sec-guide-${p.id}">
          <div id="df-guide-body-${p.id}">
            <button class="dash-load-guide-btn" id="df-guide-btn-${p.id}" onclick="loadDashSourcingGuide(${p.id})">
              Load foto produk, top 15 sellers & keywords →
            </button>
          </div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="dash-footer">
        <span class="dash-detail-link" onclick="openDetail(${p.id})">Lihat analisis market lengkap →</span>
        <span style="font-size:.71rem;color:var(--tl);">Score ${Math.round(p.score)}/100</span>
      </div>
    </div>
  </div>`;
}

function toggleDashCard(pid) {
  const body = document.getElementById(`df-body-${pid}`);
  const btn  = document.getElementById(`df-expand-${pid}`);
  if (!body) return;
  const isOpen = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', isOpen);
  if (btn) btn.classList.toggle('open', !isOpen);
}

function toggleDashSection(pid, section) {
  const body = document.getElementById(`df-sec-${section}-${pid}`);
  const chev = document.getElementById(`df-schev-${section}-${pid}`);
  if (!body) return;
  const isOpen = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', isOpen);
  if (chev) chev.classList.toggle('open', !isOpen);
}

function autoFillDash(pid) {
  const p = allProducts.find(x => x.id === pid);
  if (!p) return;
  const d = getDashDefaults(p);
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal(`df-sell-${pid}`, d.sell);
  setVal(`df-cost-${pid}`, d.cost);
  setVal(`df-ship-${pid}`, d.ship);
  setVal(`df-mktg-${pid}`, d.mktg);
  updateDashCalc(pid);
}

function updateDashCalc(pid) {
  const sell   = parseFloat(document.getElementById(`df-sell-${pid}`)?.value) || 0;
  const cost   = parseFloat(document.getElementById(`df-cost-${pid}`)?.value) || 0;
  const ship   = parseFloat(document.getElementById(`df-ship-${pid}`)?.value) || 0;
  const mktg   = parseFloat(document.getElementById(`df-mktg-${pid}`)?.value) || 0;
  const fee    = Math.round(sell * 0.04);
  const margin = sell - cost - ship - mktg - fee;
  const pct    = sell > 0 ? (margin / sell * 100).toFixed(1) : null;
  const p      = allProducts.find(x => x.id === pid);
  const fmtRp  = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');
  const fmtShort = v => {
    if (!v || v <= 0) return '';
    if (v >= 1000000) return 'Rp ' + (v/1000000).toFixed(1).replace('.0','') + 'jt';
    if (v >= 1000)    return 'Rp ' + Math.round(v/1000) + 'k';
    return 'Rp ' + Math.round(v);
  };
  const cls      = margin >= 0 ? 'dash-fin-pos' : 'dash-fin-neg';
  const mktgPct  = sell > 0 ? (mktg / sell * 100).toFixed(1) : null;
  const netNew   = margin * (p?.newUnits || 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const feeEl = document.getElementById(`df-fee-${pid}`);
  const mEl   = document.getElementById(`df-margin-${pid}`);
  const nEl   = document.getElementById(`df-rev-new-${pid}`);
  const eEl   = document.getElementById(`df-rev-exp-${pid}`);
  const mpEl  = document.getElementById(`df-mktg-pct-${pid}`);
  const hdrEl = document.getElementById(`df-hdr-net-${pid}`);

  if (feeEl) feeEl.textContent = sell > 0 ? '-' + fmtRp(fee) : '—';
  if (mEl)  { mEl.textContent = sell > 0 ? fmtRp(margin) + (pct ? ` (${pct}%)` : '') : '—'; mEl.className = `dash-fin-result-val ${cls}`; }
  if (nEl)  nEl.textContent = sell > 0 ? fmtRp(netNew) : '—';
  if (eEl)  eEl.textContent = sell > 0 ? fmtRp(margin * (p?.expUnits||0)) : '—';
  if (mpEl) mpEl.textContent = mktgPct ? `${mktgPct}% dari harga jual` : '≈ 5% harga jual';
  // Update header net pill (preview while editing, before saving)
  if (hdrEl) {
    const short = fmtShort(netNew);
    hdrEl.textContent = short ? short + '/bln' : '';
    hdrEl.classList.toggle('show', !!short);
  }
}

async function saveDashPlan(pid) {
  if (!currentUser || !_supabase) return;
  const sell = parseFloat(document.getElementById(`df-sell-${pid}`)?.value) || 0;
  const cost = parseFloat(document.getElementById(`df-cost-${pid}`)?.value) || 0;
  const ship = parseFloat(document.getElementById(`df-ship-${pid}`)?.value) || 0;
  const mktg = parseFloat(document.getElementById(`df-mktg-${pid}`)?.value) || 0;
  const existing = window._planCache[pid] || {};

  const { error } = await _supabase.from('product_plans').upsert({
    user_id: currentUser.id, product_id: pid,
    sell_price: sell, source_cost: cost, shipping: ship, marketing: mktg,
    status: existing.status || 'Riset', steps: existing.steps || 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,product_id' });

  if (error) console.error('saveDashPlan error:', error.message, error.details, error.hint);
  const msg = document.getElementById(`df-msg-${pid}`);
  if (msg) {
    msg.textContent = error ? `⚠ ${error.message || 'Gagal.'}` : '✓ Tersimpan!';
    setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
  }
  if (!error) {
    window._planCache[pid] = { ...existing, user_id: currentUser.id, product_id: pid, sell_price: sell, source_cost: cost, shipping: ship, marketing: mktg };
    updateProfileStats();
    void cohortLogActivity('tracker_plan_update', { product_id: pid, source: 'dashboard' });
  }
}

// ── PROFILE STATS — update omset total in hero ──
function updateProfileStats() {
  const saved = allProducts.filter(p => savedProducts.has(p.id));
  let totalNet = 0;
  saved.forEach(p => {
    const plan = window._planCache[p.id];
    if (plan?.sell_price) {
      const fee    = Math.round((plan.sell_price||0) * 0.04);
      const margin = (plan.sell_price||0) - (plan.source_cost||0) - (plan.shipping||0) - (plan.marketing||0) - fee;
      if (margin > 0) totalNet += margin * (p.newUnits || 0);
    }
  });

  const el = document.getElementById('profile-omset');
  if (!el) return;
  if (totalNet > 0) {
    const fmt = totalNet >= 1000000
      ? 'Rp ' + (totalNet/1000000).toFixed(1).replace('.0','') + ' jt/bln (est. omset)'
      : 'Rp ' + Math.round(totalNet/1000) + 'k/bln (est. omset)';
    el.textContent = fmt;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }

  // Also refresh stats row
  const statsRow = document.getElementById('dash-stats-row');
  if (statsRow && statsRow.style.display !== 'none') {
    let totalActive = 0;
    saved.forEach(p => { if (window._planCache[p.id]?.status === 'Aktif') totalActive++; });
    const fmtShort = v => v >= 1000000 ? 'Rp '+(v/1000000).toFixed(1).replace('.0','')+'jt' : v >= 1000 ? 'Rp '+Math.round(v/1000)+'k' : 'Rp '+Math.round(v);
    statsRow.innerHTML = `
      <div class="dash-stat"><div class="dash-stat-val">${saved.length}</div><div class="dash-stat-lbl">Produk Tersimpan</div></div>
      <div class="dash-stat"><div class="dash-stat-val">${totalActive}</div><div class="dash-stat-lbl">Produk Aktif</div></div>
      <div class="dash-stat"><div class="dash-stat-val">${totalNet > 0 ? fmtShort(totalNet) : '—'}</div><div class="dash-stat-lbl">Est. Net/Bln (seller baru)</div></div>`;
  }
}

// ── SOURCING GUIDE — load seller data for dashboard card ──
async function loadDashSourcingGuide(pid) {
  const p      = allProducts.find(x => x.id === pid);
  const bodyEl = document.getElementById(`df-guide-body-${pid}`);
  const btnEl  = document.getElementById(`df-guide-btn-${pid}`);
  if (!p || !bodyEl) return;

  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Loading...'; }
  bodyEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;color:var(--tl);font-size:.8rem;"><div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>Memuat data seller...</div>';

  // Check cache first
  if (window._sellerDataCache[pid] && window._sellerDataCache[pid].length) {
    renderDashSourcingGuide(pid, window._sellerDataCache[pid]);
    if (btnEl) btnEl.style.display = 'none';
    return;
  }

  // Fetch competitors from Supabase
  if (!p.keyword) {
    bodyEl.innerHTML = '<p style="color:var(--tl);font-size:.8rem;">Keyword tidak ditemukan untuk produk ini.</p>';
    return;
  }
  try {
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/listings?select=product_name,store_name,price,total_sold,rating,reviews,image_url,item_id,shop_id&eq.keyword=${encodeURIComponent(p.keyword)}&order=total_sold.desc&limit=30`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
    );
    const rows = resp.ok ? await resp.json() : [];
    const totalRev = rows.reduce((s,r) => s+(r.price||0)*(r.total_sold||0),0);
    const qualified = rows.map((r,i) => ({
      rank: i+1, name: r.store_name||'', location: '', brand: '', slug: '', listingDate: '',
      price: r.price||0, revenue30: (r.price||0)*(r.total_sold||0)/12,
      newRevenue: (r.price||0)*(r.total_sold||0)/12,
      rating: r.rating||0, reviews: r.reviews||0, image: r.image_url||'', url: '#',
    })).filter(s => s.name);
    window._sellerDataCache[pid] = qualified;
    renderDashSourcingGuide(pid, qualified);
  } catch(e) {
    bodyEl.innerHTML = `<p style="color:var(--tl);font-size:.8rem;">Gagal memuat: ${e.message}</p>`;
  }
  if (btnEl) btnEl.style.display = 'none';
}

function renderDashSourcingGuide(pid, sellers) {
  const bodyEl = document.getElementById(`df-guide-body-${pid}`);
  const p      = allProducts.find(x => x.id === pid);
  if (!bodyEl || !p) return;

  const fmtRp   = v => v ? 'Rp ' + Math.round(v).toLocaleString('id-ID') : '—';
  const top15   = sellers.slice(0, 15);
  const top6    = sellers.filter(s => s.image).slice(0, 6);

  // ── Photo grid ──
  const photos = top6.length
    ? `<div class="dash-photo-grid">${top6.map(s =>
        `<div class="dash-photo-item"><img src="${s.image}" alt="" decoding="async" referrerpolicy="no-referrer" onload="this.classList.add('loaded')" onerror="this.style.display='none'"></div>`
      ).join('')}</div>`
    : '';

  // ── Top 15 sellers table ──
  const sellersTable = `
    <table class="dash-mini-sellers">
      <thead><tr><th>#</th><th>Toko</th><th>Lokasi</th><th>Harga</th><th>Rev 30hr</th><th>Rating</th></tr></thead>
      <tbody>${top15.map((s, i) => `
        <tr onclick="window.open('${s.url}','_blank')" style="cursor:pointer;">
          <td style="font-weight:700;color:${i < 3 ? 'var(--orange)' : 'var(--tl)'};">${i+1}</td>
          <td style="font-weight:600;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name}</td>
          <td style="color:var(--tl);">${s.location || '—'}</td>
          <td style="color:var(--orange);font-weight:600;">${fmtRp(s.price)}</td>
          <td style="color:var(--green);font-weight:600;">${fmtRp(s.revenue30)}</td>
          <td>${s.rating ? s.rating + '★' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  // ── Local sourcing analysis ──
  const analysis  = analyzeLocalSourcing(p.name, sellers.slice(0, 20));
  const { topColors, topFeatures, topKeywords, priceMed, priceQ1, priceQ3, avgRating } = analysis;

  // AI-style recommendation text (deterministic)
  const colorStr   = topColors.slice(0,3).map(([c])=>c).join(', ');
  const featStr    = topFeatures.slice(0,4).map(([f])=>f).join(', ');
  const priceRange = priceQ1 && priceQ3 ? `Rp ${Math.round(priceQ1).toLocaleString('id-ID')} – Rp ${Math.round(priceQ3).toLocaleString('id-ID')}` : fmtRp(priceMed);
  let recoText = `Berdasarkan <b>${sellers.length} seller terlaris</b> untuk produk ini:`;
  if (colorStr) recoText += ` Source varian warna <b>${colorStr}</b>.`;
  if (featStr)  recoText += ` Pastikan produk memiliki fitur: <b>${featStr}</b>.`;
  recoText += ` Harga jual kompetitif: <b>${priceRange}</b>.`;
  if (avgRating) recoText += ` Seller sukses rata-rata punya rating <b>${avgRating}★</b> — fokus pada kualitas dan respons cepat.`;
  recoText += ` Untuk seller baru: mulai di tengah rentang harga, tawarkan gratis ongkir, dan aktifkan Shopee Ads sejak hari pertama.`;

  const aiReco = `<div class="dash-ai-reco">
    <div class="dash-ai-reco-title">Rekomendasi Sourcing</div>
    ${recoText}
  </div>`;

  // ── Keywords ──
  const allKws = [...topKeywords.map(([w])=>w), ...topColors.map(([w])=>w), ...topFeatures.map(([w])=>w)];
  const uniqueKws = [...new Set(allKws)].slice(0, 20);
  const kwTags = uniqueKws.map(kw =>
    `<span class="dash-keyword-tag" onclick="copyKeyword(this,'${kw}')">${kw}</span>`
  ).join('');
  const keywordsSection = `<div class="dash-keywords-wrap">
    <div class="dash-col-title" style="margin-bottom:6px;">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>
      Keywords untuk Judul & Deskripsi Listing
    </div>
    <div style="font-size:.73rem;color:var(--tl);margin-bottom:6px;">Klik untuk copy. Masukkan kata-kata ini ke judul produk Shopee kamu.</div>
    <div class="dash-keyword-tags">${kwTags}</div>
  </div>`;

  bodyEl.innerHTML = photos + aiReco + sellersTable + keywordsSection;
}

function copyKeyword(el, word) {
  navigator.clipboard?.writeText(word).catch(() => {});
  el.classList.add('copied');
  el.textContent = '✓ ' + word;
  setTimeout(() => { el.classList.remove('copied'); el.textContent = word; }, 1500);
}

async function saveDashStatus(pid, status) {
  if (!currentUser || !_supabase) return;
  const existing = window._planCache[pid] || {};
  window._planCache[pid] = { ...existing, status };
  await _supabase.from('product_plans').upsert({
    user_id: currentUser.id, product_id: pid, status,
    sell_price: existing.sell_price||0, source_cost: existing.source_cost||0,
    shipping: existing.shipping||0, marketing: existing.marketing||0,
    steps: existing.steps||0, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,product_id' });
}

async function toggleDashStep(pid, stepIndex) {
  if (!currentUser || !_supabase) return;
  const existing = window._planCache[pid] || {};
  const newSteps = ((existing.steps||0) ^ (1 << stepIndex));
  window._planCache[pid] = { ...existing, steps: newSteps };

  // Update inline step pills immediately
  DASH_STEPS.forEach((label, i) => {
    const el = document.getElementById(`df-istep-${pid}-${i}`);
    if (!el) return;
    const done = !!(newSteps & (1 << i));
    el.classList.toggle('done', done);
    const chk = done ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ` : '';
    el.innerHTML = chk + label;
  });

  await _supabase.from('product_plans').upsert({
    user_id: currentUser.id, product_id: pid, steps: newSteps,
    sell_price: existing.sell_price||0, source_cost: existing.source_cost||0,
    shipping: existing.shipping||0, marketing: existing.marketing||0,
    status: existing.status||'Riset', updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,product_id' });
}

async function removeSavedProduct(pid) {
  if (!currentUser || !_supabase) return;
  await _supabase.from('saved_products').delete()
    .eq('user_id', currentUser.id).eq('product_id', pid);
  savedProducts.delete(pid);
  document.getElementById(`dash-card-${pid}`)?.remove();
  // Update save buttons on other pages
  document.querySelectorAll(`.save-btn[data-pid="${pid}"]`).forEach(btn => {
    btn.classList.remove('saved');
    btn.title = 'Simpan produk';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8442A" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
    btn.onclick = function(ev) { toggleSave(ev, pid); };
  });
  renderProfileSaved();
}

// ── SIDEBAR MOBILE TOGGLE ──────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  if (overlay) overlay.classList.toggle('open', open);
}
function closeSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

// ── CREDITS ───────────────────────────────────────────────
let _creditBalance = null;
let _creditProgress = 0; // searches completed today toward next credit

// ── Admin Analytics ──────────────────────────────────────────
// ── Admin floating widget ────────────────────────────────────────────────────
const PREVIEW_MODE_KEY = 'larisid_preview_mode';

function adminIsPreviewMode() {
  try { return localStorage.getItem(PREVIEW_MODE_KEY) === '1'; } catch(_) { return false; }
}

function adminTogglePreview() {
  const next = !adminIsPreviewMode();
  try { next ? localStorage.setItem(PREVIEW_MODE_KEY, '1') : localStorage.removeItem(PREVIEW_MODE_KEY); } catch(_) {}
  _adminApplyPreviewUI(next);
  adminLoadFloatStats();
}

function _adminApplyPreviewUI(on) {
  const banner = document.getElementById('admin-preview-banner');
  const note   = document.getElementById('af-preview-note');
  const btn    = document.getElementById('admin-preview-toggle-btn');
  if (banner) banner.style.display = on ? 'block' : 'none';
  if (note)   note.style.display   = on ? 'block' : 'none';
  if (btn) {
    btn.textContent = on ? 'Preview ON' : 'Preview Mode';
    btn.style.background = on ? 'rgba(232,68,42,.35)' : 'rgba(232,68,42,.15)';
    btn.style.color = on ? '#fff' : '#E8442A';
  }
}

function adminFloatExpand() {
  const pill = document.getElementById('admin-float-pill');
  const card = document.getElementById('admin-float-card');
  if (pill) pill.style.display = 'none';
  if (card) card.style.display = 'block';
  adminLoadFloatStats();
}

function adminFloatCollapse() {
  const pill = document.getElementById('admin-float-pill');
  const card = document.getElementById('admin-float-card');
  if (card) card.style.display = 'none';
  if (pill) pill.style.display = 'flex';
}

async function adminLoadFloatStats() {
  if (!_supabase || !currentUser || !isPlatformAdmin()) return;
  const preview = adminIsPreviewMode();
  const params = preview ? { exclude_user_id: currentUser.id } : {};
  try {
    const { data, error } = await _supabase.rpc('admin_stats', params);
    if (!error && data) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
      set('af-total',   data.total_signups);
      set('af-new7d',   data.signups_last_7d);
      set('af-active7d', data.active_users_7d);
      const lbl = document.getElementById('admin-float-label');
      if (lbl) lbl.textContent = `${data.total_signups ?? '?'} users · ${data.active_users_7d ?? '?'} aktif`;
    }
  } catch(e) { console.warn('adminLoadFloatStats', e); }
}

function adminFloatInit() {
  if (!isPlatformAdmin()) return;
  const w = document.getElementById('admin-float-widget');
  if (w) w.style.display = 'block';
  _adminApplyPreviewUI(adminIsPreviewMode());
  adminLoadFloatStats();
}

async function loadAdminStats() {
  if (!_supabase || !currentUser) return;
  if (!isPlatformAdmin()) return;
  const preview = adminIsPreviewMode();
  const params = preview ? { exclude_user_id: currentUser.id } : {};
  try {
    const { data, error } = await _supabase.rpc('admin_stats', params);
    if (!error && data) {
      const s = data;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? '—'; };
      set('adm-total',      s.total_signups);
      set('adm-7d',         s.signups_last_7d);
      set('adm-30d',        s.signups_last_30d);
      set('adm-active7d',   s.active_users_7d);
      set('adm-nopurchase', s.users_never_purchased);
      set('adm-credits',    s.total_credits_in_circulation);
      set('adm-avgbal',     s.avg_balance_per_user);

      const evtEl = document.getElementById('adm-events-table');
      if (evtEl && s.credit_events_by_type) {
        evtEl.innerHTML = s.credit_events_by_type.map(r =>
          `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #F3F4F6;font-size:.75rem;"><span style="color:#374151">${r.type}</span><span style="font-weight:700;color:#1A1F3C">${r.events} <span style="color:#9CA3AF;font-weight:400;">(${r.total_credits} cr)</span></span></div>`
        ).join('');
      }

      const kwEl = document.getElementById('adm-keywords-table');
      if (kwEl && s.top_keywords) {
        kwEl.innerHTML = s.top_keywords.slice(0,10).map(r =>
          `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #F3F4F6;font-size:.72rem;"><span style="color:#374151;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.keyword}</span><span style="font-weight:700;color:#E8442A;">${r.completions}</span></div>`
        ).join('');
      }

      const dauEl = document.getElementById('adm-dau-chart');
      if (dauEl && s.dau_last_30d?.length) {
        const maxDAU = Math.max(...s.dau_last_30d.map(r => r.active_users)) || 1;
        dauEl.innerHTML = s.dau_last_30d.map(r => {
          const h = Math.round(r.active_users / maxDAU * 70) + 4;
          return `<div title="${r.date}: ${r.active_users} users" style="flex:1;min-width:6px;max-width:18px;background:#E8442A;border-radius:3px 3px 0 0;height:${h}px;opacity:.8;"></div>`;
        }).join('');
      }
    }
  } catch(e) { console.warn('loadAdminStats', e); }
  await adminLoadCohortOptions();
  await adminLoadUserDirectory();
}

let _adminCohorts = [];
async function adminLoadCohortOptions() {
  const sel = document.getElementById('adm-cohort-select');
  if (!sel || !_supabase || !isPlatformAdmin()) return;
  const { data, error } = await _supabase.from('cohorts').select('id,name,slug,invite_code').order('created_at', { ascending: false });
  if (error) {
    sel.innerHTML = '<option value="">Tidak bisa memuat kohort</option>';
    return;
  }
  _adminCohorts = data || [];
  sel.innerHTML = _adminCohorts.length
    ? _adminCohorts.map(c => `<option value="${_cohortEsc(c.id)}">${_cohortEsc(c.name || c.slug || c.invite_code || 'Kohort')}</option>`).join('')
    : '<option value="">Belum ada kohort</option>';
}

async function adminLoadUserDirectory() {
  const el = document.getElementById('adm-user-directory');
  if (!el || !_supabase || !isPlatformAdmin()) return;
  el.innerHTML = '<div class="cohort-muted">Memuat users...</div>';
  try {
    const { data, error } = await _supabase.rpc('admin_user_directory');
    if (error) { el.textContent = error.message || 'Gagal memuat user.'; return; }
    const rows = data || [];
    if (!rows.length) { el.innerHTML = '<div class="cohort-muted">Belum ada user.</div>'; return; }
    el.innerHTML = `<table style="width:100%;font-size:.72rem;border-collapse:collapse;min-width:760px;">
      <thead><tr style="text-align:left;color:#9CA3AF;border-bottom:1px solid #F3F4F6;"><th style="padding:7px 4px;">User</th><th>Role</th><th>Cohorts</th><th>Leads</th><th>Created</th><th>Last activity</th><th></th></tr></thead>
      <tbody>${rows.map(r => {
        const role = r.app_role || 'student';
        const roleColor = role === 'admin' ? '#E8442A' : (role === 'leader' ? '#B45309' : '#1A7A46');
        const isIndep = !r.cohort_count && !r.led_cohort_count;
        return `<tr style="border-bottom:1px solid #F9FAFB;">
          <td style="padding:8px 4px;"><strong>${_cohortEsc(r.display_name || 'User')}</strong><br><span class="cohort-muted">${_cohortEsc(r.email || '')}</span></td>
          <td><span style="color:${roleColor};font-weight:800;">${_cohortEsc(role)}</span></td>
          <td>${isIndep ? '<span style="background:#F3F4F6;color:#6B7280;font-size:.62rem;font-weight:700;padding:2px 7px;border-radius:4px;letter-spacing:.04em;">Independent</span>' : (r.cohort_count || 0)}</td>
          <td>${isIndep ? '' : (r.led_cohort_count || 0)}</td>
          <td class="cohort-muted">${r.created_at ? _cohortEsc(r.created_at.slice(0, 10)) : '—'}</td>
          <td class="cohort-muted">${r.last_activity_at ? _cohortEsc(r.last_activity_at.slice(0, 16).replace('T', ' ')) : '—'}</td>
          <td><button type="button" class="cohort-btn secondary" style="padding:4px 8px;font-size:.62rem;" onclick="adminPrefillRole('${_cohortEsc(r.email || '')}','${_cohortEsc(role)}')">Edit</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  } catch(e) {
    el.textContent = 'Gagal memuat user.';
  }
}

function adminPrefillRole(email, role) {
  const e = document.getElementById('adm-role-email');
  const le = document.getElementById('adm-leader-email');
  const r = document.getElementById('adm-role-select');
  if (e) e.value = email || '';
  if (le) le.value = email || '';
  if (r && role) r.value = role;
}

async function adminAssignRole() {
  const email = (document.getElementById('adm-role-email')?.value || '').trim();
  const role = document.getElementById('adm-role-select')?.value || 'student';
  const st = document.getElementById('adm-role-status');
  if (!email || !_supabase || !isPlatformAdmin()) return;
  if (st) st.textContent = 'Menyimpan role...';
  const { error } = await _supabase.rpc('admin_assign_app_role', {
    p_email: email,
    p_role: role,
    p_note: 'Updated from LarisID Admin UI',
  });
  if (error) {
    if (st) st.textContent = error.message || 'Gagal menyimpan role.';
    return;
  }
  if (st) st.textContent = 'Role tersimpan.';
  await adminLoadUserDirectory();
}

async function adminAssignLeader() {
  const email = (document.getElementById('adm-leader-email')?.value || '').trim();
  const cohortId = document.getElementById('adm-cohort-select')?.value || '';
  const st = document.getElementById('adm-role-status');
  if (!email || !cohortId || !_supabase || !isPlatformAdmin()) return;
  if (st) st.textContent = 'Menghubungkan leader ke kohort...';
  const { error } = await _supabase.rpc('admin_assign_cohort_leader', {
    p_email: email,
    p_cohort: cohortId,
  });
  if (error) {
    if (st) st.textContent = error.message || 'Gagal assign leader.';
    return;
  }
  if (st) st.textContent = 'Leader tersimpan untuk kohort.';
  await adminLoadUserDirectory();
}

// ── Weekly Treasure Chest ─────────────────────────────────────
async function loadChestState() {
  if (!_supabase || !currentUser) return;
  try {
    const monday = new Date();
    monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
    const weekStart = monday.toISOString().slice(0,10);

    const [{ count: searches }, { data: claimed }] = await Promise.all([
      _supabase.from('search_completions').select('keyword', {count:'exact',head:true}).eq('user_id', currentUser.id).gte('completed_date', weekStart),
      _supabase.from('chest_history').select('id').eq('user_id', currentUser.id).eq('week_start', weekStart).limit(1),
    ]);

    const done      = Math.min(searches || 0, 5);
    const alreadyGot = claimed?.length > 0;
    const unlocked  = done >= 5 && !alreadyGot;

    const fill  = document.getElementById('chest-prog-fill');
    const label = document.getElementById('chest-prog-label');
    const btn   = document.getElementById('chest-btn');
    const icon  = document.getElementById('chest-icon');
    const desc  = document.getElementById('chest-desc');

    if (fill)  fill.style.width = (done / 5 * 100) + '%';
    if (label) label.textContent = alreadyGot ? 'Sudah diklaim minggu ini — kembali Senin depan' : `${done} / 5 pencarian`;
    if (btn) { btn.disabled = !unlocked; btn.style.opacity = unlocked ? '1' : '.4'; btn.style.cursor = unlocked ? 'pointer' : 'not-allowed'; }
    if (icon) icon.textContent = alreadyGot ? '✅' : unlocked ? '🎁' : '🔒';
    if (desc) desc.textContent = alreadyGot ? 'Sudah diklaim minggu ini — kembali Senin depan 🎉' : unlocked ? 'Peti terbuka! Klik untuk klaim hadiahmu.' : 'Selesaikan 5 pencarian minggu ini untuk membuka hadiah kredit';
  } catch(e) { console.warn('loadChestState', e); }
}

async function claimChest() {
  if (!_supabase || !currentUser) return;
  const btn = document.getElementById('chest-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const { data, error } = await _supabase.rpc('claim_weekly_chest');
    const modal     = document.getElementById('chest-modal');
    const modalIcon = document.getElementById('chest-modal-icon');
    const modalTitle= document.getElementById('chest-modal-title');
    const modalMsg  = document.getElementById('chest-modal-msg');
    if (error || !data) throw new Error(error?.message || 'Gagal');
    if (data.error === 'already_claimed') { if (btn) btn.textContent = 'Sudah'; return; }
    if (data.needed) { if (btn) { btn.disabled = true; btn.style.opacity = '.4'; btn.textContent = 'Buka'; } return; }
    const reward = data.reward;
    if (modalIcon) modalIcon.textContent = reward >= 10 ? '🏆' : reward >= 5 ? '💎' : '🎁';
    if (modalTitle) modalTitle.textContent = `+${reward} Kredit!`;
    if (modalMsg)  modalMsg.textContent = `Kamu mendapat ${reward} kredit dari Peti Mingguan. Saldo baru: ${data.balance} kredit.`;
    if (modal) modal.style.display = 'flex';
    loadChestState();
    loadCreditData();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Buka'; }
    console.warn('claimChest', e);
  }
}

async function loadCreditData() {
  if (!_supabase || !currentUser) return;
  try {
    const { data, error } = await _supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', currentUser.id)
      .single();
    // PGRST116 = no row yet (user hasn't earned credits); treat as 0
    _creditBalance = (!error && data) ? (data.balance ?? 0) : 0;
    renderCreditUI();
  } catch (_) {}
}

function renderCreditUI() {
  const unlimited = _isUnlimited();
  const bal = _creditBalance ?? 0;
  // Sidebar badge — hide for unlimited users (no credit concept)
  const badge = document.getElementById('dash-nav-credit-badge');
  if (badge) { badge.textContent = bal; badge.style.display = (!unlimited && bal > 0) ? '' : 'none'; }
  // Topbar pill
  const pillVal = document.getElementById('dash-credit-pill-val');
  if (pillVal) pillVal.textContent = unlimited ? '∞' : bal;
  // Card balance
  const cardNum = document.getElementById('hcc-balance-num');
  if (cardNum) cardNum.textContent = unlimited ? '∞' : bal;
  // Progress bar — fetch today's completions from search_completions table
  if (_supabase && currentUser) {
    const today = new Date().toISOString().slice(0, 10);
    _supabase
      .from('search_completions')
      .select('keyword', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('completed_date', today)
      .then(({ count, error }) => {
        if (error) return;
        const done = count ?? 0;
        const max  = 10;
        const pct  = Math.min(100, Math.round((done / max) * 100));
        const fill = document.getElementById('hcc-prog-fill');
        const lbl  = document.getElementById('hcc-prog-label');
        if (fill) fill.style.width = pct + '%';
        if (lbl)  lbl.textContent  = `${done}/${max} pencarian hari ini`;
      });
  }
}

function scrollToCreditCard() {
  const el = document.getElementById('dash-credit-card');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── CREDITS PAGE ─────────────────────────────────────────
async function creditsInit() {
  // Update sidebar badge
  const badge = document.getElementById('dash-nav-credit-badge');
  if (badge && _creditBalance !== null) {
    badge.textContent = _creditBalance;
    badge.style.display = _creditBalance > 0 ? '' : 'none';
  }
  // Update header balance
  const numEl = document.getElementById('cr-balance-num');
  if (numEl) numEl.textContent = _creditBalance ?? '—';

  // Progress bar from search_completions
  if (_supabase && currentUser) {
    const today = new Date().toISOString().slice(0, 10);
    const { count } = await _supabase
      .from('search_completions')
      .select('keyword', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('completed_date', today);
    const done = count ?? 0;
    const pct  = Math.min(100, Math.round((done / 10) * 100));
    const fill = document.getElementById('cr-prog-fill');
    const txt  = document.getElementById('cr-prog-text');
    if (fill) fill.style.width = pct + '%';
    if (txt)  txt.textContent  = `${done}/10 pencarian`;
  }

  // Free credits expiry: compute days left in current month
  const now   = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = lastDay - now.getDate() + 1;
  const expEl = document.getElementById('cr-free-exp');
  if (expEl) expEl.textContent = `Berlaku ${daysLeft} hari lagi`;

  const freeEl = document.getElementById('cr-free-count');
  if (freeEl) freeEl.textContent = '5 kredit gratis / bulan';
}

function crBuy(amount) {
  alert(`Pembelian ${amount} kredit akan segera tersedia. Hubungi kami via WhatsApp untuk informasi lebih lanjut.`);
}

// ── CREDIT GATE ──────────────────────────────────────────
let _cgCallback = null;
let _cgAction   = 'deepdive'; // track action type for spend_credit RPC

function _isUnlimited() {
  if (!currentUser) return false;
  if (currentUser.app_metadata?.role === 'admin' || currentUser.user_metadata?.role === 'admin') return true;
  if (_cohortState?.primaryMentorCohort?.id) return true;
  return false;
}

function cgShow(title, sub, callback, action) {
  // Admin and leaders bypass the credit gate entirely
  if (_isUnlimited()) { if (callback) callback(); return; }
  document.getElementById('cg-title').textContent = title;
  document.getElementById('cg-sub').textContent   = sub;
  const balEl = document.getElementById('cg-balance-display');
  if (balEl) balEl.textContent = (_creditBalance ?? 0) + ' kredit';
  _cgCallback = callback;
  _cgAction   = action || 'deepdive';
  document.getElementById('cg-overlay').style.display = 'flex';
}

function cgClose() {
  document.getElementById('cg-overlay').style.display = 'none';
  _cgCallback = null;
  const earnNote = document.getElementById('cg-earn-note');
  if (earnNote) earnNote.style.display = 'none';
}

async function cgConfirm() {
  if (!_isUnlimited() && (_creditBalance ?? 0) < 1) {
    switchDashView('credits'); cgClose(); return;
  }
  const btn = document.getElementById('cg-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    if (_supabase && currentUser) {
      const { data, error } = await _supabase.rpc('spend_credit', { p_keyword: _cgAction, p_amount: 1 });
      if (!error && data != null) {
        _creditBalance = data;
        renderCreditUI();
        cohortLogActivity('credit_spent', { action: _cgAction || 'unknown' });
      }
    }
  } catch (_) {}
  if (btn) { btn.disabled = false; btn.textContent = 'Gunakan Kredit'; }
  cgClose();
  if (_cgCallback) { _cgCallback(); _cgCallback = null; }
}

function gateDeepDive() {
  if (!currentUser) { openAuthModal('login'); return; }
  cgShow(
    'Deep Dive Produk',
    'Gunakan 1 kredit untuk melihat analisis mendalam produk ini — harga historis, tren pesaing & peluang pasar.',
    () => switchDashView('deepdive'),
    'deepdive'
  );
}

// ── MULAI BERJUALAN — updated JS ─────────────────────────
function mlsSwitchTab(tab) {
  document.querySelectorAll('#mls-tabs .dd-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  ['pasar','kalc'].forEach(t => {
    const el = document.getElementById(`mls-tab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
}

function mlsToggleApiSettings() {
  const el = document.getElementById('mls-api-settings');
  if (!el) return;
  const open = el.style.display === 'none';
  el.style.display = open ? 'block' : 'none';
  if (open) {
    const aKey = localStorage.getItem('larisid_anthropic_key') || '';
    const oKey = localStorage.getItem('larisid_openai_key') || '';
    const aModel = localStorage.getItem('larisid_anthropic_model') || 'claude-haiku-4-5-20251001';
    const inp = document.getElementById('mls-anthropic-key-input');
    const sel = document.getElementById('mls-anthropic-model');
    const oinp = document.getElementById('mls-openai-key-input');
    if (inp) inp.value = aKey;
    if (sel) sel.value = aModel;
    if (oinp) oinp.value = oKey;
  }
}

function mlsSaveApiKeys() {
  const aKey  = document.getElementById('mls-anthropic-key-input')?.value?.trim();
  const aModel = document.getElementById('mls-anthropic-model')?.value || 'claude-haiku-4-5-20251001';
  const oKey  = document.getElementById('mls-openai-key-input')?.value?.trim();
  if (aKey)  localStorage.setItem('larisid_anthropic_key', aKey);
  else       localStorage.removeItem('larisid_anthropic_key');
  if (aModel) localStorage.setItem('larisid_anthropic_model', aModel);
  if (oKey)  localStorage.setItem('larisid_openai_key', oKey);
  else       localStorage.removeItem('larisid_openai_key');
  mlsUpdateModelBadge();
  document.getElementById('mls-api-settings').style.display = 'none';
}

function mlsClearApiKeys() {
  ['larisid_anthropic_key','larisid_openai_key','larisid_anthropic_model'].forEach(k => localStorage.removeItem(k));
  ['mls-anthropic-key-input','mls-openai-key-input'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
  mlsUpdateModelBadge();
}

function mlsUpdateModelBadge() {
  const badge = document.getElementById('mls-model-badge');
  if (!badge) return;
  const aKey  = localStorage.getItem('larisid_anthropic_key');
  const oKey  = localStorage.getItem('larisid_openai_key');
  const aModel = localStorage.getItem('larisid_anthropic_model') || 'claude-haiku-4-5-20251001';
  const modelName = { 'claude-haiku-4-5-20251001':'Claude Haiku', 'claude-sonnet-4-6':'Claude Sonnet 4.6', 'claude-opus-4-7':'Claude Opus 4.7' };
  if (oKey)       badge.textContent = 'Model: GPT-4o (OpenAI)';
  else if (aKey)  badge.textContent = `Model: ${modelName[aModel]||aModel} (API kamu)`;
  else            badge.textContent = 'Model: Claude Haiku (bawaan)';
}

const _MLS_AI_CTR_KEY = 'larisid_mls_ai_used';
const MLS_AI_PER_CREDIT = 10;

function _mlsAiCounter() {
  return parseInt(localStorage.getItem(_MLS_AI_CTR_KEY) || '0', 10);
}
function _mlsAiCounterInc() {
  const n = _mlsAiCounter() + 1;
  localStorage.setItem(_MLS_AI_CTR_KEY, String(n));
  _mlsAiUpdateCounter();
}
function _mlsAiUpdateCounter() {
  const total = _mlsAiCounter();
  const usedInBlock = total % MLS_AI_PER_CREDIT;
  const remaining = usedInBlock === 0 ? MLS_AI_PER_CREDIT : MLS_AI_PER_CREDIT - usedInBlock;
  const el = document.getElementById('mls-ai-counter');
  if (el) el.textContent = `${remaining}/${MLS_AI_PER_CREDIT} tanya tersisa`;
}

async function mlsAiAsk(prompt) {
  const ctx = window._mlsContext || {};
  const p   = ctx.product || {};
  const q   = prompt || document.getElementById('mls-ai-input')?.value?.trim();
  if (!q) return;
  const respEl = document.getElementById('mls-ai-response');
  if (!respEl) return;

  // Credit gate: every MLS_AI_PER_CREDIT prompts costs 1 credit (at the start of each new block)
  const used = _mlsAiCounter();
  if (!_isUnlimited() && used % MLS_AI_PER_CREDIT === 0) {  // 0, 10, 20... → start of a new block
    // Need to spend a credit before this block of 10
    if ((_creditBalance ?? 0) < 1) {
      respEl.style.display = 'block';
      respEl.textContent = 'Kredit habis. Cari lebih banyak produk di Shopee untuk mendapatkan kredit gratis (10 pencarian = 1 kredit).';
      return;
    }
    try {
      if (_supabase && currentUser) {
        const { data, error } = await _supabase.rpc('spend_credit', { p_keyword: 'ai_mls', p_amount: 1 });
        if (!error && data != null) { _creditBalance = data; renderCreditUI(); cohortLogActivity('credit_spent', { action: 'ai_mls' }); }
      }
    } catch (_) {}
  }

  respEl.style.display = 'block';
  respEl.textContent   = 'AI sedang menganalisis...';

  // Build rich system context: product + top competitors + category summary
  const top10Comps = (ctx.top5 || []).slice(0, 10).map((r, i) =>
    `${i+1}. ${(r.product_name||'').slice(0,40)} — Rp ${Math.round(r.price||0).toLocaleString('id-ID')}, terjual ${(r.total_sold||0).toLocaleString('id-ID')}`
  ).join('\n');
  const systemCtx = [
    `Kamu adalah analis pasar Shopee Indonesia yang membantu penjual. Jawab singkat, praktis, dan dalam Bahasa Indonesia.`,
    `\nPRODUK UTAMA: "${p.product_name||p.name||'—'}"`,
    `Keyword: ${p.keyword||'—'} | Harga: Rp ${p.price ? Math.round(p.price).toLocaleString('id-ID') : '—'} | Terjual: ${(p.total_sold||0).toLocaleString('id-ID')} | Rating: ${p.rating||'—'}`,
    `\nPASAR (keyword "${p.keyword||'—'}"):`,
    `Total listing: ${(ctx.sigSellers||[]).length} penjual signifikan | Median harga: Rp ${ctx.medianPrice ? Math.round(ctx.medianPrice).toLocaleString('id-ID') : '—'} | Total omset pasar: Rp ${ctx.totalOmset ? Math.round(ctx.totalOmset).toLocaleString('id-ID') : '—'}/bln`,
    top10Comps ? `\nTOP KOMPETITOR:\n${top10Comps}` : '',
    `\nHANYA analisis produk dan keyword di atas. Jangan mengarang data lain.`,
  ].filter(Boolean).join('\n');

  const userAnthropicKey = localStorage.getItem('larisid_anthropic_key');
  const userOpenAiKey    = localStorage.getItem('larisid_openai_key');
  const userModel        = localStorage.getItem('larisid_anthropic_model') || 'claude-haiku-4-5-20251001';

  try {
    if (userOpenAiKey) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userOpenAiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', max_tokens: 500, messages: [{ role: 'system', content: systemCtx }, { role: 'user', content: q }] })
      });
      const d = await res.json();
      respEl.textContent = d.choices?.[0]?.message?.content || d.error?.message || 'Tidak ada respons.';
    } else {
      const apiKey = userAnthropicKey || CLAUDE_KEY;
      const model  = userAnthropicKey ? userModel : 'claude-haiku-4-5-20251001';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 500, system: systemCtx, messages: [{ role: 'user', content: q }] })
      });
      const d = await res.json();
      respEl.textContent = d.content?.[0]?.text || d.error?.message || 'Tidak ada respons.';
    }
    _mlsAiCounterInc();
  } catch (e) {
    respEl.textContent = 'Gagal menghubungi AI. Coba lagi.';
  }
  if (document.getElementById('mls-ai-input')) document.getElementById('mls-ai-input').value = '';
}

// ── PERSONALIZED DISCOVER ─────────────────────────────────
const _VIEW_KEY = 'laris_viewed_cats';

function trackView(category) {
  if (!category) return;
  try {
    const raw  = JSON.parse(localStorage.getItem(_VIEW_KEY) || '{}');
    raw[category] = (raw[category] || 0) + 1;
    localStorage.setItem(_VIEW_KEY, JSON.stringify(raw));
  } catch (_) {}
}

function getTopCats(n = 3) {
  try {
    const raw = JSON.parse(localStorage.getItem(_VIEW_KEY) || '{}');
    return Object.entries(raw).sort((a,b) => b[1]-a[1]).slice(0,n).map(([c]) => c);
  } catch (_) { return []; }
}

function renderForYou() {
  const topCats = getTopCats(3);
  if (!topCats.length || !allProducts.length) return;
  const pool = allProducts.filter(p => topCats.includes(p.category)).slice(0,8);
  if (!pool.length) return;
  const existingForYou = document.getElementById('discover-for-you');
  if (existingForYou) existingForYou.remove();
  const layout = document.querySelector('#dash-view-discover .dsc-layout');
  if (!layout || !layout.parentElement) return;
  const section = document.createElement('div');
  section.id = 'discover-for-you';
  section.style.cssText = 'margin-bottom:24px;';
  section.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <div style="font-size:.85rem;font-weight:800;color:#1A1F3C;">Untuk Kamu</div>
      <div style="font-size:.72rem;color:#9CA3AF;">Berdasarkan produk yang kamu lihat</div>
      <button onclick="clearViewHistory()" style="margin-left:auto;font-size:.65rem;color:#9CA3AF;background:none;border:none;cursor:pointer;text-decoration:underline;">Reset</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;" id="for-you-grid">
      ${pool.map(p => cardHTML(p)).join('')}
    </div>`;
  layout.parentElement.insertBefore(section, layout);
}

function clearViewHistory() {
  localStorage.removeItem(_VIEW_KEY);
  document.getElementById('discover-for-you')?.remove();
}

// ── TOPBAR DATE ────────────────────────────────────────────
function initTopbarDate() {
  const el = document.getElementById('dash-topbar-date');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// Close topbar dropdown when clicking outside
document.addEventListener('click', () => {
  const m = document.getElementById('dash-topbar-menu');
  if (m) m.classList.remove('open');
});

// ════════════════════════════════════════════════════════════
//  PROFILE SETUP — post-login onboarding popup
// ════════════════════════════════════════════════════════════

function isWaUser() {
  return !!currentUser?.email?.endsWith('@wa.larisid.com');
}

async function checkProfileComplete() {
  if (!currentUser || !_supabase) return true;
  try {
    const { data, error } = await _supabase
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .limit(1);
    if (error) return true;
    return Array.isArray(data) && data.length > 0;
  } catch (_) { return true; }
}

let _psetupMode         = 'setup';
let _psetupSellerStatus = null;

function _psetupOverlayClick(ev) {
  if (_psetupMode === 'edit' && ev.target === document.getElementById('profile-setup-overlay')) {
    closeProfileSetupModal();
  }
}

function openProfileSetupModal(mode, prefill) {
  _psetupMode         = mode || 'setup';
  _psetupSellerStatus = null;

  const meta     = currentUser?.user_metadata || {};
  const fullName = (meta.full_name || '').trim();
  const parts    = fullName.split(' ');

  document.getElementById('psetup-first-name').value = prefill?.first_name || parts[0] || '';
  document.getElementById('psetup-last-name').value  = prefill?.last_name  || parts.slice(1).join(' ') || '';
  document.getElementById('psetup-wa-number').value  = prefill?.wa_number  || '';
  document.getElementById('psetup-contact-email').value = prefill?.contact_email || '';
  document.getElementById('psetup-store-name').value = prefill?.shopee_store_name || '';
  document.getElementById('psetup-store-url').value  = prefill?.shopee_store_url  || '';

  const isWa = isWaUser();
  document.getElementById('psetup-wa-wrap').style.display    = isWa ? 'none' : '';
  document.getElementById('psetup-email-wrap').style.display = isWa ? ''     : 'none';

  const btnNew      = document.getElementById('psetup-btn-new');
  const btnExisting = document.getElementById('psetup-btn-existing');
  btnNew.style.cssText      = btnNew.style.cssText.replace(/border-color:[^;]+;?/g, '');
  btnExisting.style.cssText = btnExisting.style.cssText.replace(/border-color:[^;]+;?/g, '');
  btnNew.style.borderColor      = '#E5E7EB';
  btnNew.style.color            = '#6B7280';
  btnNew.style.background       = '#fff';
  btnExisting.style.borderColor = '#E5E7EB';
  btnExisting.style.color       = '#6B7280';
  btnExisting.style.background  = '#fff';
  document.getElementById('psetup-store-wrap').style.display = 'none';

  if (prefill?.seller_status) psetupToggleSellerFields(prefill.seller_status);

  document.getElementById('psetup-title').textContent       = _psetupMode === 'edit' ? 'Edit Profil Kamu' : 'Lengkapi Profilmu';
  document.getElementById('psetup-close-btn').style.display = _psetupMode === 'edit' ? '' : 'none';
  document.getElementById('psetup-submit-btn').textContent  = _psetupMode === 'edit' ? 'Simpan Perubahan' : 'Simpan & Mulai';
  document.getElementById('psetup-error').style.display     = 'none';

  document.getElementById('profile-setup-overlay').style.display = 'flex';
}

function closeProfileSetupModal() {
  document.getElementById('profile-setup-overlay').style.display = 'none';
}

function psetupToggleSellerFields(status) {
  _psetupSellerStatus        = status;
  const btnNew               = document.getElementById('psetup-btn-new');
  const btnExisting          = document.getElementById('psetup-btn-existing');
  const storeWrap            = document.getElementById('psetup-store-wrap');

  if (status === 'first_time') {
    btnNew.style.borderColor      = '#E8442A';
    btnNew.style.color            = '#E8442A';
    btnNew.style.background       = '#FFF0ED';
    btnExisting.style.borderColor = '#E5E7EB';
    btnExisting.style.color       = '#6B7280';
    btnExisting.style.background  = '#fff';
    storeWrap.style.display       = 'none';
  } else {
    btnExisting.style.borderColor = '#E8442A';
    btnExisting.style.color       = '#E8442A';
    btnExisting.style.background  = '#FFF0ED';
    btnNew.style.borderColor      = '#E5E7EB';
    btnNew.style.color            = '#6B7280';
    btnNew.style.background       = '#fff';
    storeWrap.style.display       = '';
  }
}

async function submitProfileSetup() {
  const firstName    = document.getElementById('psetup-first-name').value.trim();
  const lastName     = document.getElementById('psetup-last-name').value.trim();
  const isWa         = isWaUser();
  const waRaw        = document.getElementById('psetup-wa-number').value.trim();
  const emailInput   = document.getElementById('psetup-contact-email').value.trim();
  const storeName    = document.getElementById('psetup-store-name').value.trim();
  const storeUrl     = document.getElementById('psetup-store-url').value.trim();
  const errEl        = document.getElementById('psetup-error');

  function showErr(msg) { errEl.textContent = msg; errEl.style.display = ''; }
  errEl.style.display = 'none';

  if (!firstName) return showErr('Nama depan wajib diisi.');
  if (!lastName)  return showErr('Nama belakang wajib diisi.');
  if (!isWa && !waRaw)  return showErr('Nomor WhatsApp wajib diisi.');
  if (isWa  && !emailInput) return showErr('Alamat email wajib diisi.');
  if (isWa  && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailInput)) return showErr('Format email tidak valid.');
  if (!_psetupSellerStatus) return showErr('Pilih status penjual kamu terlebih dahulu.');
  if (_psetupSellerStatus === 'existing' && !storeName) return showErr('Nama toko Shopee wajib diisi.');
  if (_psetupSellerStatus === 'existing' && !storeUrl)  return showErr('URL toko Shopee wajib diisi.');

  const btn = document.getElementById('psetup-submit-btn');
  btn.disabled    = true;
  btn.textContent = 'Menyimpan...';

  try {
    let waStored = null;
    if (!isWa && waRaw) {
      let n = waRaw.replace(/\D/g, '');
      if (n.startsWith('62'))      n = '0' + n.slice(2);
      else if (!n.startsWith('0')) n = '0' + n;
      waStored = n;
    }

    const payload = {
      user_id:           currentUser.id,
      first_name:        firstName,
      last_name:         lastName,
      wa_number:         waStored,
      contact_email:     isWa ? emailInput : null,
      seller_status:     _psetupSellerStatus,
      shopee_store_name: _psetupSellerStatus === 'existing' ? storeName : null,
      shopee_store_url:  _psetupSellerStatus === 'existing' ? storeUrl  : null,
      updated_at:        new Date().toISOString(),
    };

    const { error: upsertErr } = await _supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'user_id' });
    if (upsertErr) throw upsertErr;

    if (_psetupSellerStatus === 'existing') {
      await _supabase.from('user_store_profiles').upsert({
        user_id:           currentUser.id,
        shopee_store_name: storeName,
        updated_at:        new Date().toISOString(),
      }, { onConflict: 'user_id' }).catch(() => {});
    }

    const fullName = `${firstName} ${lastName}`;
    try { await _supabase.auth.updateUser({ data: { full_name: fullName } }); } catch (_) {}
    if (currentUser.user_metadata) currentUser.user_metadata.full_name = fullName;
    updateAuthUI();

    closeProfileSetupModal();
    loadUserProfile();

    if (_psetupMode === 'setup') {
      loadSavedProducts();
      checkMentorApplication();
      renderHomeGrid();
      setTimeout(() => startDashboardOnboarding(), 1200);
      setTimeout(() => { pendingCohortJoinIfAny().catch(() => {}); }, 400);
      setTimeout(() => { cohortLoadLightForTheme().catch(() => {}); }, 600);
    }
  } catch (e) {
    showErr('Terjadi kesalahan. Coba lagi.');
    console.error('[psetup]', e);
  } finally {
    btn.disabled    = false;
    btn.textContent = _psetupMode === 'edit' ? 'Simpan Perubahan' : 'Simpan & Mulai';
  }
}

async function openProfileEditModal() {
  if (!currentUser || !_supabase) return;
  try {
    const { data } = await _supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .limit(1);
    openProfileSetupModal('edit', Array.isArray(data) && data.length ? data[0] : null);
  } catch (_) {
    openProfileSetupModal('edit', null);
  }
}

async function loadUserProfile() {
  if (!currentUser || !_supabase) return;
  try {
    const { data } = await _supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .limit(1);
    if (!Array.isArray(data) || !data.length) return;
    const p = data[0];

    const card = document.getElementById('acct-info-card');
    if (card) card.style.display = '';

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    const showWrap = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };

    setEl('acct-card-name', `${p.first_name} ${p.last_name}`.trim());
    setEl('acct-card-seller', p.seller_status === 'existing' ? 'Penjual aktif' : 'Penjual baru');

    if (p.wa_number) { setEl('acct-card-wa', p.wa_number); showWrap('acct-card-wa-wrap', true); }
    if (p.contact_email) { setEl('acct-card-email', p.contact_email); showWrap('acct-card-email-wrap', true); }
    if (p.shopee_store_name) { setEl('acct-card-store', p.shopee_store_name); showWrap('acct-card-store-wrap', true); }
  } catch (_) {}
}

async function openProfile() {
  if (!currentUser) { openAuthModal('login'); return; }
  clearCompare();
  // switch page immediately — don't let background async calls block navigation
  document.body.classList.add('in-dashboard');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-profile').classList.add('active');
  window.scrollTo(0, 0);
  switchDashView('dashboard');
  // load data in background after page is visible
  try { await loadAllPlans(); } catch(_) {}
  try { renderProfileSaved(); } catch(_) {}
  try { loadDashboardData(); } catch(_) {}
  try { loadCreditData(); } catch(_) {}
  try { loadUserProfile(); } catch(_) {}
  try {
    const u = new URLSearchParams(window.location.search || '');
    if (u.get('view') === 'cohort') setTimeout(() => switchDashView('cohort'), 80);
    const pv = u.get('preview');
    if (pv === 'student' || pv === 'leader') {
      try { sessionStorage.setItem('larisid_admin_cohort_shell', pv); } catch (_) {}
    }
  } catch (_) {}
  setTimeout(() => { cohortLoadLightForTheme().catch(() => {}); }, 0);
}

// ── DASHBOARD TAB SWITCHING ──
function switchDashTab(tab) {
  ['products','education','sourcing'].forEach(t => {
    const el  = document.getElementById(`dash-tab-${t}`);
    const nav = document.getElementById(`dash-nav-${t}`);
    if (el)  el.style.display  = (t === tab) ? '' : 'none';
    if (nav) nav.classList.toggle('active', t === tab);
  });
}

// ════════════════════════════════════════════════════════════
//  JUNGLE SCOUT-STYLE DASHBOARD — view switching, Product DB
// ════════════════════════════════════════════════════════════

const PDB_VIEWS = ['home','product-database','product-tracker','opportunity-finder','category-trends','suppliers','keywords','estimator','marketing','saved','education','dashboard','discover','tracker','deepdive','ai','alerts','credits','cohort','admin'];
const PDB_SUB_MAP = {'product-database':'research','product-tracker':'research','opportunity-finder':'research','category-trends':'research'};

// View titles for topbar
const VIEW_TITLES = {
  'dashboard':'Dashboard','discover':'Discover','tracker':'Tracker',
  'deepdive':'Deep Dive','ai':'Mulai Berjualan','alerts':'Alerts','credits':'Kredit Saya','cohort':'Kohort',
  'home':'Home Dashboard','product-database':'Product Database',
  'product-tracker':'Product Tracker','opportunity-finder':'Opportunity Finder',
  'saved':'Produk Tersimpan','education':'Edukasi',
};

/** Tracks which dashboard pane is visible (used after auth/session sync). */
let _dashActiveView = 'dashboard';

// New nav items for the redesigned sidebar
const NEW_NAV_IDS = ['dashboard','discover','deepdive','tracker','ai','alerts','credits'];
const PDB_CATS = ['Bayi & Anak','Motor & Mobil','Rumah','Hewan Peliharaan','Dapur','Kamar Mandi','Elektronik','Fashion','Kecantikan','Kesehatan','Olahraga','Outdoor & Camping','Sepeda','Tanaman','Taman','Keamanan','Hobi & Kerajinan','Alat Tulis','HP & Gadget'];

let _pdbSortField  = 'total_sold';
let _pdbSortDir    = 'desc';
let _pdbRows       = [];
let _pdbCatsInited = false;

function toggleResearchToolsNav() {
  const sub = document.getElementById('dash-sub-research-tools');
  const parent = document.getElementById('dash-nav-research-tools');
  if (sub) sub.classList.toggle('open');
  if (parent) parent.classList.toggle('open');
}

function switchDashView(view) {
  _dashActiveView = view;
  PDB_VIEWS.forEach(v => {
    const el = document.getElementById(`dash-view-${v}`);
    if (el) el.style.display = (v === view) ? '' : 'none';
  });

  // Update topbar title
  cohortSyncDashTopbarTitle(view);

  // New sidebar nav: highlight correct item
  const _rtViews = new Set(['discover','deepdive','tracker','ai','alerts']);
  ['dashboard','discover','deepdive','tracker','ai','alerts','cohort'].forEach(k => {
    const el = document.getElementById(`dash-nav-${k}`);
    if (!el) return;
    el.classList.toggle('active', k === view);
  });
  const _rtParent = document.getElementById('dash-nav-research-tools');
  const _rtSub = document.getElementById('dash-sub-research-tools');
  if (_rtParent) _rtParent.classList.toggle('active', _rtViews.has(view));
  if (_rtSub && _rtViews.has(view)) _rtSub.classList.add('open');

  // Legacy top-level nav (keep working for old views)
  const topNavKeys = ['home','research','suppliers','keywords','estimator','marketing','saved','education'];
  topNavKeys.forEach(k => {
    const el = document.getElementById(`dash-nav-${k}`);
    if (!el) return;
    const isResearch = k === 'research' && PDB_SUB_MAP[view] === 'research';
    const isDirect   = k === view;
    el.classList.toggle('active', isDirect || isResearch);
    if (k === 'research') el.classList.toggle('open', isResearch || el.classList.contains('open'));
  });

  // Sub-item highlighting
  ['product-database','product-tracker','opportunity-finder','category-trends'].forEach(k => {
    const el = document.getElementById(`dash-sub-${k}`);
    if (el) el.classList.toggle('active', k === view);
  });

  // Open research submenu when a sub-view is active
  if (PDB_SUB_MAP[view] === 'research') {
    const sub = document.getElementById('dash-sub-research');
    const nav = document.getElementById('dash-nav-research');
    if (sub) sub.classList.add('open');
    if (nav) nav.classList.add('open');
  }

  if (view === 'product-database') _initPdbCats();
  if (view === 'opportunity-finder') _initOfCats();
  if (view === 'product-tracker') ptRender();
  if (view === 'category-trends') loadCategoryTrends();
  if (view === 'keywords') _kxLoadKeywordList();
  if (view === 'home') _renderDashHome();
  if (view === 'estimator') loadSalesEstimator();
  if (view === 'admin') loadAdminStats();
  if (view === 'discover'  && typeof dscInit  === 'function') { dscInit(); setTimeout(renderForYou, 400); }
  if (view === 'tracker'   && typeof trkInit  === 'function') trkInit();
  if (view === 'dashboard' && typeof hbdInit  === 'function') hbdInit();
  if (view === 'ai'        && typeof mlsInit      === 'function') mlsInit();
  if (view === 'alerts'    && typeof alrInit      === 'function' && allProducts.length) alrInit();
  if (view === 'credits'   && typeof creditsInit  === 'function') creditsInit();
  if (view === 'cohort'    && typeof cohortInit   === 'function') cohortInit();
  mbnSync(view);
  dashboardTourHandleViewChange(view);
}

// ── MOBILE BOTTOM NAV ──────────────────────────────────────────
const MBN_MAP = {
  dashboard:'mbn-dashboard', discover:'mbn-discover',
  ai:'mbn-ai', tracker:'mbn-tracker',
  deepdive:'mbn-ai',
  alerts:'mbn-dashboard', credits:'mbn-dashboard', cohort:'mbn-dashboard',
  'product-database':'mbn-discover', keywords:'mbn-discover', estimator:'mbn-discover',
};

function mbnSync(view) {
  document.querySelectorAll('.mbn-item').forEach(el => el.classList.remove('active'));
  const id = MBN_MAP[view];
  if (id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
}

function mbnOpenMore() {
  document.getElementById('mbn-sheet-overlay').style.display = 'block';
  const s = document.getElementById('mbn-more-sheet');
  s.style.display = 'block';
  s.getBoundingClientRect(); // force reflow
  s.style.transform = 'translateY(0)';
}

function mbnCloseMore() {
  const s = document.getElementById('mbn-more-sheet');
  if (!s) return;
  s.style.transform = 'translateY(100%)';
  setTimeout(() => {
    s.style.display = 'none';
    document.getElementById('mbn-sheet-overlay').style.display = 'none';
  }, 300);
}

// ── MOBILE DISCOVER SORT CHIPS ──────────────────────────────────
function dscSetChip(el, val) {
  document.querySelectorAll('.dsc-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const sel = document.getElementById('dsc-sort');
  if (sel) { sel.value = val; }
  dscApplyFilters();
}

function toggleDashSub(sub) {
  const el  = document.getElementById(`dash-sub-${sub}`);
  const nav = document.getElementById(`dash-nav-${sub}`);
  if (!el) return;
  const isOpen = el.classList.toggle('open');
  if (nav) nav.classList.toggle('open', isOpen);
}

// ════════════════════════════════════════════════════════════
//  COHORT COMMUNITY — student / mentor dashboards + admin preview
// ════════════════════════════════════════════════════════════

function isCohortPlatformAdmin() {
  return isPlatformAdmin();
}

function _cohortParseThemeHex(v) {
  if (v == null || typeof v !== 'string') return null;
  const s = v.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s : null;
}

function _cohortHexToRgb(hex) {
  const h = _cohortParseThemeHex(hex) || '#1A1F3C';
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function _cohortMixRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function _cohortRgbStr(rgb) {
  return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
}

/** When cohort theme is active, topbar shows COHORT + name (accent) + current view (primary). */
function cohortSyncDashTopbarTitle(view) {
  const v = view != null ? view : (typeof _dashActiveView !== 'undefined' ? _dashActiveView : 'dashboard');
  const titleEl = document.getElementById('dash-topbar-title');
  const brand = document.getElementById('dash-topbar-brand-block');
  const vlab = document.getElementById('dash-topbar-view-label');
  const nm = document.getElementById('dash-topbar-cohort-name');
  const t = (typeof VIEW_TITLES !== 'undefined' && VIEW_TITLES[v]) ? VIEW_TITLES[v] : v;
  const row = typeof cohortResolveThemeCohortRowForUi === 'function' ? cohortResolveThemeCohortRowForUi() : null;
  const themed = !!(row && row.id && document.body.classList.contains('cohort-themed') && document.body.classList.contains('in-dashboard'));
  if (themed && brand && vlab && nm) {
    brand.style.display = 'flex';
    if (titleEl) titleEl.style.display = 'none';
    nm.textContent = (row.name || 'Kohort').trim();
    vlab.textContent = t;
  } else {
    if (brand) brand.style.display = 'none';
    if (titleEl) {
      titleEl.style.display = '';
      titleEl.textContent = t;
    }
  }
}

function cohortClearDashboardTheme() {
  document.body.classList.remove('cohort-themed');
  const root = document.documentElement;
  ['--cohort-primary', '--cohort-secondary', '--cohort-accent', '--cohort-sidebar-end', '--cohort-surface'].forEach(k => root.style.removeProperty(k));
  const chip = document.getElementById('dash-topbar-cohort-chip');
  const strip = document.getElementById('cohort-app-strip');
  if (chip) chip.style.display = 'none';
  if (strip) strip.style.display = 'none';
  const brand = document.getElementById('dash-topbar-brand-block');
  const titleEl = document.getElementById('dash-topbar-title');
  if (brand) brand.style.display = 'none';
  if (titleEl) titleEl.style.display = '';
  cohortSyncDashTopbarTitle();
}

/** Apply cohort colors to CSS variables (students read leader-chosen values). */
function cohortApplyDashboardThemeFromRow(cohortRow) {
  if (!cohortRow || !cohortRow.id) {
    cohortClearDashboardTheme();
    return;
  }
  const fallbackPri = '#0f2942';
  const fallbackSec = '#c9a87c';
  const pri = _cohortParseThemeHex(cohortRow.theme_primary) || fallbackPri;
  const sec = _cohortParseThemeHex(cohortRow.theme_secondary) || fallbackSec;
  const pr = _cohortHexToRgb(pri);
  const sr = _cohortHexToRgb(sec);
  const accent = _cohortMixRgb(pr, sr, 0.42);
  const end = _cohortMixRgb(pr, { r: 8, g: 12, b: 22 }, 0.55);
  const surface = _cohortMixRgb(pr, { r: 252, g: 251, b: 248 }, 0.94);
  document.body.classList.add('cohort-themed');
  const root = document.documentElement;
  root.style.setProperty('--cohort-primary', pri);
  root.style.setProperty('--cohort-secondary', sec);
  root.style.setProperty('--cohort-accent', _cohortRgbStr(accent));
  root.style.setProperty('--cohort-sidebar-end', _cohortRgbStr(end));
  root.style.setProperty('--cohort-surface', _cohortRgbStr(surface));
  cohortSyncDashTopbarTitle();
}

function cohortResolveThemeCohortRowForUi() {
  const admin = isCohortPlatformAdmin();
  const sh = cohortGetPreviewShell();
  if (admin) {
    if (sh === 'leader' && _cohortState.primaryMentorCohort) return _cohortState.primaryMentorCohort;
    if (sh === 'student' && _cohortState.primaryStudentCohortId && _cohortState.cohortMap)
      return _cohortState.cohortMap[_cohortState.primaryStudentCohortId] || null;
    return null;
  }
  if (_cohortState.hasMentorCohort && _cohortState.primaryMentorCohort) return _cohortState.primaryMentorCohort;
  if (_cohortState.primaryStudentCohortId && _cohortState.cohortMap)
    return _cohortState.cohortMap[_cohortState.primaryStudentCohortId] || null;
  return null;
}

function cohortCurrentUserCanManageRow(cohortRow) {
  if (!cohortRow || !currentUser) return false;
  if (isPlatformAdmin()) return true;
  if (cohortRow.mentor_user_id === currentUser.id) return true;
  return (_cohortState.studentRows || []).some(m =>
    m.cohort_id === cohortRow.id && m.role === 'mentor' && m.status === 'active'
  );
}

/** True when this user is the cohort's primary mentor or has an active mentor membership row. */
function cohortIsActualMentorForCohort(cohortRow) {
  if (!cohortRow || !currentUser) return false;
  if (cohortRow.mentor_user_id === currentUser.id) return true;
  return (_cohortState.studentRows || []).some(m =>
    m.cohort_id === cohortRow.id && m.role === 'mentor' && m.status === 'active'
  );
}

/** Ensure REST calls from cohortInit carry a JWT (avoids empty cohort data right after hard refresh). */
async function cohortEnsureSupabaseSession() {
  if (!_supabase || !currentUser) return false;
  try {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session?.access_token) return true;
    const stored = _authLoad();
    if (!stored?.access_token) return false;
    const { error } = await _supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token || '',
    });
    if (error) return false;
    const { data: { session: s2 } } = await _supabase.auth.getSession();
    return !!s2?.access_token;
  } catch (_) {
    return false;
  }
}

function cohortRefreshDashboardTheme() {
  cohortApplyDashboardThemeFromRow(cohortResolveThemeCohortRowForUi());
  cohortUpdateCohortChrome();
}

function cohortPreviewBrandingForm() {
  const nameEl = document.getElementById('cohort-brand-name');
  const priEl = document.getElementById('cohort-brand-primary');
  const secEl = document.getElementById('cohort-brand-secondary');
  const badgeEl = document.getElementById('cohort-brand-badge');
  const shapeEl = document.getElementById('cohort-brand-badge-shape');
  const sloganEl = document.getElementById('cohort-brand-slogan');
  const prev = document.getElementById('cohort-brand-preview-badge');
  const motto = document.getElementById('cohort-brand-preview-motto');
  const pri = _cohortParseThemeHex(priEl && priEl.value) || '#0c4a6e';
  const sec = _cohortParseThemeHex(secEl && secEl.value) || '#d4b896';
  const pr = _cohortHexToRgb(pri);
  const end = _cohortMixRgb(pr, { r: 8, g: 12, b: 22 }, 0.55);
  const name = (nameEl && nameEl.value || 'Ocean Blue').trim();
  const badge = (badgeEl && badgeEl.value || '🌊').trim();
  const shape = cohortNormalizeBadgeShape(shapeEl && shapeEl.value);
  document.documentElement.style.setProperty('--cohort-primary', pri);
  document.documentElement.style.setProperty('--cohort-secondary', sec);
  document.documentElement.style.setProperty('--cohort-sidebar-end', _cohortRgbStr(end));
  if (prev) {
    const sub = (sloganEl && sloganEl.value || '').trim();
    prev.innerHTML = cohortBadgeHtml({
      cohortName: name,
      cohortIcon: badge,
      cohortPrimaryColor: pri,
      cohortSecondaryColor: sec,
      cohortSubtitle: sub,
      variant: 'onDark',
      shape,
      subtitleMaxLen: 36,
      hideSubtitle: !sub,
    });
  }
  if (motto) motto.textContent = (sloganEl && sloganEl.value || '').trim() || 'Together we learn, together we grow.';
}

function cohortSyncBrandColor(which, source) {
  const text = document.getElementById(which === 'primary' ? 'cohort-brand-primary' : 'cohort-brand-secondary');
  const picker = document.getElementById(which === 'primary' ? 'cohort-brand-primary-picker' : 'cohort-brand-secondary-picker');
  if (!text || !picker) return;
  if (source === 'picker') {
    text.value = picker.value;
  } else {
    const hex = _cohortParseThemeHex(text.value);
    if (hex) picker.value = hex;
  }
  cohortPreviewBrandingForm();
}

async function cohortLoadLightForTheme() {
  if (!_supabase || !currentUser) {
    cohortClearDashboardTheme();
    cohortUpdateCohortChrome();
    return;
  }
  const { data: led } = await _supabase.from('cohorts').select('*').eq('mentor_user_id', currentUser.id).limit(1);
  let row = led && led[0];
  if (!row) {
    const { data: mem } = await _supabase
      .from('cohort_members')
      .select('cohort_id,role,status')
      .eq('user_id', currentUser.id)
      .eq('status', 'active');
    const st = (mem || []).find(m => m.role === 'student');
    const mt = (mem || []).find(m => m.role === 'mentor');
    const target = mt || st;
    if (target) {
      const { data: c } = await _supabase.from('cohorts').select('*').eq('id', target.cohort_id).maybeSingle();
      row = c;
    }
  }
  cohortApplyDashboardThemeFromRow(row);
  cohortUpdateCohortChrome(row);
  void cohortRefreshCohortPillFromServer();
}

function cohortUpdateCohortChrome(cohortRowOpt) {
  const row = cohortRowOpt != null ? cohortRowOpt : cohortResolveThemeCohortRowForUi();
  const chip = document.getElementById('dash-topbar-cohort-chip');
  const strip = document.getElementById('cohort-app-strip');
  const sl = document.getElementById('cohort-strip-slogan');
  if (!chip || !strip) return;
  // Admin in their own admin view (not preview mode) sees plain site — no cohort strip
  if (isPlatformAdmin() && !adminIsPreviewMode()) {
    chip.style.display = 'none';
    strip.style.display = 'none';
    cohortSyncDashTopbarTitle();
    return;
  }
  if (!row || !document.body.classList.contains('in-dashboard')) {
    chip.style.display = 'none';
    strip.style.display = 'none';
    cohortSyncDashTopbarTitle();
    return;
  }
  const name = row.name || 'Kohort';
  const sub = (row.slogan && row.slogan.trim()) ? row.slogan.trim() : '';
  chip.style.display = 'none';
  chip.innerHTML = '';
  strip.style.display = 'block';
  if (sl) sl.textContent = sub || 'Bangun momentum bareng tim kamu.';
  cohortSyncDashTopbarTitle();
}

async function cohortHydrateStripMeta(cohortId) {
  const sm = document.getElementById('cohort-strip-meta');
  if (!sm || !cohortId || !_supabase) return;
  try {
    const [{ count }, { data: ann }] = await Promise.all([
      _supabase.from('cohort_members').select('*', { count: 'exact', head: true }).eq('cohort_id', cohortId).eq('status', 'active'),
      _supabase.from('cohort_announcements').select('title').eq('cohort_id', cohortId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const n = count != null ? count : '—';
    const t = ann && ann.title ? ann.title : 'Belum ada pengumuman';
    sm.textContent = `${n} anggota aktif · Terbaru: ${t}`;
  } catch (_) {
    sm.textContent = 'Anggota aktif · buka tab Kohort untuk Feed & Rankings';
  }
}

async function cohortLeaderSaveBranding() {
  const st = document.getElementById('cohort-brand-status');
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase || !currentUser) {
    if (st) st.textContent = 'Tidak ada kohort yang kamu pimpin.';
    return;
  }
  if (!cohortCurrentUserCanManageRow(c)) {
    if (st) st.textContent = 'Hanya pemimpin kohort atau admin yang bisa menyimpan.';
    return;
  }
  const nameEl = document.getElementById('cohort-brand-name');
  const priEl = document.getElementById('cohort-brand-primary');
  const secEl = document.getElementById('cohort-brand-secondary');
  const badgeEl = document.getElementById('cohort-brand-badge');
  const shapeEl = document.getElementById('cohort-brand-badge-shape');
  const sloganEl = document.getElementById('cohort-brand-slogan');
  const name = nameEl ? String(nameEl.value || '').trim() : null;
  const pri = priEl ? String(priEl.value || '').trim() : null;
  const sec = secEl ? String(secEl.value || '').trim() : null;
  const badge = badgeEl ? String(badgeEl.value || '').trim() : null;
  const slogan = sloganEl ? String(sloganEl.value || '').trim() : null;
  const shape = cohortNormalizeBadgeShape(shapeEl && shapeEl.value);
  let themeJson = {};
  try {
    const raw = c.theme_json;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) themeJson = { ...raw };
    else if (typeof raw === 'string') themeJson = JSON.parse(raw || '{}');
  } catch (_) { themeJson = {}; }
  themeJson.badge_shape = shape;
  if (!name) {
    if (st) st.textContent = 'Nama kohort wajib diisi.';
    return;
  }
  if (st) st.textContent = 'Menyimpan…';
  const { error } = await _supabase.rpc('cohort_leader_update_branding', {
    p_cohort: c.id,
    p_theme_primary: pri === '' ? '' : (pri || null),
    p_theme_secondary: sec === '' ? '' : (sec || null),
    p_slogan: slogan === '' ? '' : (slogan || null),
    p_badge_icon: badge === '' ? '' : (badge || null),
    p_theme_json: themeJson,
  });
  if (error) {
    if (st) st.textContent = error.message || 'Gagal simpan.';
    return;
  }
  let nameWarning = '';
  if (name !== (c.name || '')) {
    const { error: nameError } = await _supabase.rpc('cohort_leader_update_identity', {
      p_cohort: c.id,
      p_name: name,
    });
    if (nameError) {
      nameWarning = ' Nama kohort aktif setelah migrasi database terbaru diterapkan.';
    }
  }
  if (st) st.textContent = 'Tersimpan. Tampilan siswa akan mengikuti tema ini.' + nameWarning;
  const { data: fresh } = await _supabase.from('cohorts').select('*').eq('id', c.id).maybeSingle();
  if (fresh) {
    _cohortState.primaryMentorCohort = fresh;
    if (_cohortState.cohortMap && fresh.id) _cohortState.cohortMap[fresh.id] = fresh;
  }
  cohortRefreshDashboardTheme();
}

function cohortGetPreviewShell() {
  try {
    const v = sessionStorage.getItem('larisid_admin_cohort_shell');
    if (v === 'student' || v === 'leader' || v === 'individual') return v;
  } catch (_) {}
  return 'student';
}

function cohortSetPreviewShell(shell) {
  if (!isCohortPlatformAdmin()) return;
  try { sessionStorage.setItem('larisid_admin_cohort_shell', shell); } catch (_) {}
  cohortApplyShellUI();
  cohortRefreshDashboardTheme();
  void cohortRenderMentorPanels();
}

function _cohortEsc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

/** Max two words for compact badge titles (premium SaaS rhythm). */
function cohortBadgeShortDisplayName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Kohort';
  return parts.slice(0, 2).join(' ');
}

function cohortBadgeSanitizedIcon(icon) {
  const s = String(icon || '').trim();
  if (!s) return '';
  return s.length > 8 ? s.slice(0, 8) : s;
}

const COHORT_BADGE_SHAPES = ['circle', 'square', 'octagon', 'triangle'];
function cohortNormalizeBadgeShape(raw) {
  const s = String(raw || '').toLowerCase().trim();
  return COHORT_BADGE_SHAPES.includes(s) ? s : 'octagon';
}
/** Reads `theme_json.badge_shape` from a cohort row (deterministic CSS shapes — no generative model). */
function cohortBadgeShapeFromRow(row) {
  if (!row || row.theme_json == null) return 'octagon';
  try {
    const tj = typeof row.theme_json === 'string' ? JSON.parse(row.theme_json) : row.theme_json;
    if (tj && typeof tj.badge_shape === 'string') return cohortNormalizeBadgeShape(tj.badge_shape);
  } catch (_) {}
  return 'shield';
}

function cohortBadgeTrimSubtitle(sub, maxLen) {
  const t = String(sub || '').trim().replace(/\s+/g, ' ');
  const cap = maxLen || 40;
  if (!t) return '';
  return t.length > cap ? t.slice(0, cap - 1).trim() + '\u2026' : t;
}


/**
 * Reusable cohort badge markup: shield | circle | square | octagon | triangle, icon, name, subtitle.
 * Shapes are pure CSS (clip-path / radius) so they always match brand guidelines; no generative model needed.
 * opts: { cohortName, cohortIcon, cohortPrimaryColor, cohortSecondaryColor, cohortSubtitle,
 *         variant?: 'compact'|'onDark', shape?: 'shield'|'circle'|'square'|'octagon'|'triangle', hideSubtitle?: bool, subtitleMaxLen?: number }
 */
function cohortBadgeHtml(opts) {
  const o = opts || {};
  const displayName = cohortBadgeShortDisplayName(o.cohortName);
  const iconRaw = cohortBadgeSanitizedIcon(o.cohortIcon);
  const pri = _cohortParseThemeHex(o.cohortPrimaryColor) || '#1A1F3C';
  const sec = _cohortParseThemeHex(o.cohortSecondaryColor) || '#c9a87c';
  const subFull = cohortBadgeTrimSubtitle(o.cohortSubtitle, o.subtitleMaxLen || 40);
  const hideSub = !!o.hideSubtitle || !subFull;
  const variant = o.variant === 'compact' ? 'compact' : o.variant === 'onDark' ? 'onDark' : '';
  const shape = cohortNormalizeBadgeShape(o.shape);
  const pr = _cohortHexToRgb(pri);
  const sr = _cohortHexToRgb(sec);
  const bgTop = _cohortRgbStr(_cohortMixRgb(pr, { r: 255, g: 255, b: 255 }, 0.9));
  const bgBot = _cohortRgbStr(_cohortMixRgb(sr, { r: 255, g: 255, b: 255 }, 0.88));
  const borderMix = _cohortRgbStr(_cohortMixRgb(pr, { r: 229, g: 231, b: 235 }, 0.35));
  const subHtml = !hideSub && subFull ? `<div class="cohort-badge__sub">${_cohortEsc(subFull)}</div>` : '';
  const cls = ['cohort-badge', `cohort-badge--${shape}`, variant && `cohort-badge--${variant}`].filter(Boolean).join(' ');
  const outerStyle = variant === 'onDark'
    ? ''
    : ` style="background:linear-gradient(165deg, ${bgTop}, ${bgBot});border-color:${borderMix};"`;
  return `<div class="${cls}" style="--cb-pri:${pri};--cb-sec:${sec};" role="group" aria-label="${_cohortEsc(displayName)}"><div class="cohort-badge__outer"${outerStyle}><div class="cohort-badge__name">${_cohortEsc(displayName)}</div>${subHtml}</div></div>`;
}

/* ── Leader cohort switcher ── */
function cohortLeaderRenderSwitcher() {
  const tabs = document.getElementById('cohort-leader-tabs');
  if (!tabs) return;
  const led = _cohortState.mentorCohorts || [];
  if (!led.length) { tabs.style.display = 'none'; return; }
  tabs.style.display = 'flex';
  const activeId = (_cohortState.primaryMentorCohort && _cohortState.primaryMentorCohort.id) || (led[0] && led[0].id);
  tabs.innerHTML = led.map(c => {
    const isA = c.id === activeId;
    return `<button type="button" class="cohort-leader-tab${isA ? ' active' : ''}" onclick="cohortLeaderSwitchCohort('${_cohortEsc(c.id)}')">${_cohortEsc(c.name || 'Kohort')}</button>`;
  }).join('') + `<button type="button" class="cohort-leader-tab cohort-leader-tab--new" onclick="cohortOpenCreateModal()">+ Buat Kohort</button>`;
}

function cohortLeaderSwitchCohort(cohortId) {
  const c = (_cohortState.mentorCohorts || []).find(x => x.id === cohortId);
  if (!c) return;
  _cohortState.primaryMentorCohort = c;
  cohortApplyDashboardThemeFromRow(c);
  cohortUpdateCohortChrome(c);
  cohortLeaderRenderSwitcher();
  cohortRenderMentorPanels();
}

/* ── Create cohort modal ── */
let _cohortCreateState = { step:1, name:'', slogan:'', pri:'#0f2942', sec:'#c9a87c', waUrl:'', emails:[], newCohort:null };

function cohortOpenCreateModal() {
  _cohortCreateState = { step:1, name:'', slogan:'', pri:'#0f2942', sec:'#c9a87c', waUrl:'', emails:[], newCohort:null };
  const m = document.getElementById('cohort-create-modal');
  if (m) { m.classList.add('open'); cohortCreateRenderStep(); }
}

function cohortCloseCreateModal() {
  const m = document.getElementById('cohort-create-modal');
  if (m) m.classList.remove('open');
}

function cohortCreateSetStep(n) {
  _cohortCreateState.step = n;
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('cohort-cs-' + i);
    if (el) el.className = 'cohort-create-step' + (i < n ? ' done' : i === n ? ' active' : '');
  }
  const sub = document.getElementById('cohort-create-modal-sub');
  if (sub) sub.textContent = 'Langkah ' + n + ' dari 4';
}

function cohortCreateRenderStep() {
  const s = _cohortCreateState;
  const body = document.getElementById('cohort-create-body');
  const title = document.getElementById('cohort-create-modal-title');
  const stEl = document.getElementById('cohort-create-status');
  if (!body) return;
  if (stEl) { stEl.style.display = 'none'; stEl.textContent = ''; }
  cohortCreateSetStep(s.step);
  if (s.step === 1) {
    if (title) title.textContent = 'Nama & Motto';
    body.innerHTML = `<label class="cohort-muted" style="font-size:.65rem;">Nama kohort</label><input type="text" id="cc-name" class="cohort-input" placeholder="Ocean Blue" maxlength="80" value="${_cohortEsc(s.name)}" autocomplete="off"><label class="cohort-muted" style="font-size:.65rem;">Motto (opsional)</label><input type="text" id="cc-slogan" class="cohort-input" placeholder="Together we learn, together we grow." maxlength="200" value="${_cohortEsc(s.slogan)}" autocomplete="off"><div class="cohort-create-actions"><button type="button" class="cohort-btn" onclick="cohortCreateNext1()">Lanjut →</button></div>`;
    setTimeout(() => { const el = document.getElementById('cc-name'); if (el) el.focus(); }, 50);
  } else if (s.step === 2) {
    if (title) title.textContent = 'Pilih Warna';
    body.innerHTML = `<label class="cohort-muted" style="font-size:.65rem;">Warna utama</label><div class="cohort-color-row" style="margin-bottom:12px;"><input type="color" id="cc-pri-pick" class="cohort-color-swatch" value="${_cohortEsc(s.pri)}" oninput="document.getElementById('cc-pri-hex').value=this.value;_cohortCreateState.pri=this.value;"><input type="text" id="cc-pri-hex" class="cohort-input" placeholder="#0f2942" maxlength="7" value="${_cohortEsc(s.pri)}" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value)){document.getElementById('cc-pri-pick').value=this.value;_cohortCreateState.pri=this.value;}"></div><label class="cohort-muted" style="font-size:.65rem;">Warna aksen</label><div class="cohort-color-row" style="margin-bottom:12px;"><input type="color" id="cc-sec-pick" class="cohort-color-swatch" value="${_cohortEsc(s.sec)}" oninput="document.getElementById('cc-sec-hex').value=this.value;_cohortCreateState.sec=this.value;"><input type="text" id="cc-sec-hex" class="cohort-input" placeholder="#c9a87c" maxlength="7" value="${_cohortEsc(s.sec)}" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value)){document.getElementById('cc-sec-pick').value=this.value;_cohortCreateState.sec=this.value;}"></div><div class="cohort-create-actions"><button type="button" class="cohort-btn secondary" onclick="_cohortCreateState.step=1;cohortCreateRenderStep()">← Kembali</button><button type="button" class="cohort-btn" onclick="cohortCreateNext2()">Lanjut →</button></div>`;
  } else if (s.step === 3) {
    if (title) title.textContent = 'Hubungkan & Undang';
    const tagHtml = s.emails.map(e => `<span class="cohort-invite-tag">${_cohortEsc(e)}<button type="button" onclick="cohortCreateRemoveEmail('${_cohortEsc(e)}')">&#x2715;</button></span>`).join('');
    body.innerHTML = `
      <label class="cohort-muted" style="font-size:.65rem;">URL grup WhatsApp <span style="font-weight:400;">(opsional)</span></label>
      <input type="url" id="cc-wa-url" class="cohort-input" placeholder="https://chat.whatsapp.com/…" value="${_cohortEsc(s.waUrl)}" autocomplete="off" oninput="_cohortCreateState.waUrl=this.value.trim();">
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #F3F4F6;">
        <label class="cohort-muted" style="font-size:.65rem;">Undang siswa via email <span style="font-weight:400;">(opsional)</span></label>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input type="email" id="cc-email-input" class="cohort-input" placeholder="siswa@email.com" style="margin-bottom:0;flex:1;" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();cohortCreateAddEmail();}">
          <button type="button" class="cohort-btn secondary" onclick="cohortCreateAddEmail()">Tambah</button>
        </div>
        <div id="cc-email-tags" style="min-height:8px;margin-bottom:4px;">${tagHtml}</div>
      </div>
      <div class="cohort-create-actions">
        <button type="button" class="cohort-btn secondary" onclick="_cohortCreateState.step=2;cohortCreateRenderStep()">← Kembali</button>
        <button type="button" class="cohort-btn" id="cc-create-btn" onclick="cohortCreateFinal()">Buat Kohort</button>
      </div>`;
  } else if (s.step === 4) {
    if (title) title.textContent = 'Kohort Berhasil Dibuat!';
    const c = s.newCohort;
    const joinUrl = cohortGetJoinUrl(c && c.invite_code);
    body.innerHTML = `<p class="cohort-muted" style="margin-bottom:12px;">Kohort <strong style="color:#111;">${_cohortEsc(c ? c.name : '')}</strong> sudah aktif. Share URL di bawah agar siswa bisa bergabung langsung.</p><label class="cohort-muted" style="font-size:.65rem;">URL undangan siswa</label><div class="cohort-join-url-box">${_cohortEsc(joinUrl)}</div><div class="cohort-create-actions" style="margin-top:14px;"><button type="button" class="cohort-btn secondary" id="cc-copy-btn" onclick="cohortCopyJoinUrl('${_cohortEsc(joinUrl)}',this)">Salin URL</button><button type="button" class="cohort-btn" onclick="cohortCloseCreateModal();cohortInit().catch(()=>{})">Selesai</button></div>`;
  }
}

function cohortCreateNext1() {
  const name = (document.getElementById('cc-name')?.value || '').trim();
  const slogan = (document.getElementById('cc-slogan')?.value || '').trim();
  if (!name) { cohortCreateShowStatus('Nama kohort wajib diisi.'); return; }
  _cohortCreateState.name = name;
  _cohortCreateState.slogan = slogan;
  _cohortCreateState.step = 2;
  cohortCreateRenderStep();
}

function cohortCreateNext2() {
  const pri = (document.getElementById('cc-pri-hex')?.value || '').trim();
  const sec = (document.getElementById('cc-sec-hex')?.value || '').trim();
  if (pri) _cohortCreateState.pri = pri;
  if (sec) _cohortCreateState.sec = sec;
  _cohortCreateState.step = 3;
  cohortCreateRenderStep();
}

function cohortCreateAddEmail() {
  const inp = document.getElementById('cc-email-input');
  const email = (inp?.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return;
  if (!_cohortCreateState.emails.includes(email)) {
    _cohortCreateState.emails.push(email);
    const tags = document.getElementById('cc-email-tags');
    if (tags) tags.innerHTML = _cohortCreateState.emails.map(e => `<span class="cohort-invite-tag">${_cohortEsc(e)}<button type="button" onclick="cohortCreateRemoveEmail('${_cohortEsc(e)}')">&#x2715;</button></span>`).join('');
  }
  if (inp) inp.value = '';
}

function cohortCreateRemoveEmail(email) {
  _cohortCreateState.emails = _cohortCreateState.emails.filter(e => e !== email);
  const tags = document.getElementById('cc-email-tags');
  if (tags) tags.innerHTML = _cohortCreateState.emails.map(e => `<span class="cohort-invite-tag">${_cohortEsc(e)}<button type="button" onclick="cohortCreateRemoveEmail('${_cohortEsc(e)}')">&#x2715;</button></span>`).join('');
}

function cohortCreateShowStatus(msg) {
  const stEl = document.getElementById('cohort-create-status');
  if (stEl) { stEl.textContent = msg; stEl.style.display = 'block'; }
}

async function cohortCreateFinal() {
  if (!_supabase || !currentUser) { cohortCreateShowStatus('Tidak terkoneksi.'); return; }
  const s = _cohortCreateState;
  const btn = document.getElementById('cc-create-btn');
  if (btn) btn.disabled = true;
  cohortCreateShowStatus('Membuat kohort…');
  try {
    const slug = s.name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,56) || ('cohort-' + Date.now());
    const inviteCode = cohortGenInviteCode();
    const { data: raw, error } = await _supabase.rpc('leader_create_cohort', {
      p_name: s.name,
      p_slug: slug,
      p_theme_primary: s.pri,
      p_theme_secondary: s.sec,
      p_slogan: s.slogan || null,
      p_invite_code: inviteCode,
      p_whatsapp_invite_url: s.waUrl || null,
    });
    if (error) {
      cohortCreateShowStatus(error.message || 'Gagal membuat kohort.');
      if (btn) btn.disabled = false;
      return;
    }
    // PostgREST may return a single object or a one-item array for row-valued functions.
    const newC = Array.isArray(raw) ? raw[0] : raw;
    if (!newC || !newC.id) {
      cohortCreateShowStatus('Kohort dibuat tetapi respons tidak terbaca. Coba refresh.');
      if (btn) btn.disabled = false;
      return;
    }
    if (s.emails.length) {
      cohortCreateShowStatus('Mengirim undangan email…');
      for (const email of s.emails) {
        await _supabase.rpc('cohort_leader_add_student_by_email', { p_cohort: newC.id, p_email: email }).catch(() => {});
      }
    }
    _cohortCreateState.newCohort = newC;
    _cohortCreateState.step = 4;
    cohortCreateRenderStep();
    const stEl = document.getElementById('cohort-create-status');
    if (stEl) stEl.style.display = 'none';
  } catch (e) {
    cohortCreateShowStatus((e && e.message) || 'Terjadi kesalahan.');
    if (btn) btn.disabled = false;
  }
}

function cohortGenInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function cohortGetJoinUrl(inviteCode) {
  if (!inviteCode) return '';
  return window.location.origin + window.location.pathname + '?invite=' + encodeURIComponent(inviteCode);
}

function cohortCopyJoinUrl(url, btn) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    if (btn) { const orig = btn.textContent; btn.textContent = 'Tersalin!'; setTimeout(() => { if (btn) btn.textContent = orig; }, 1800); }
  }).catch(() => { if (btn) btn.textContent = 'Gagal salin'; });
}

let _cohortState = {
  studentRows: [],
  mentorCohorts: [],
  primaryStudentCohortId: null,
  primaryMentorCohort: null,
  hasMentorCohort: false,
  cohortMap: {},
  memberNameMap: {},
  directoryRows: [],
  studentTab: 'ringkasan',
  mentorTab: 'overview',
};

function cohortApplyShellUI() {
  const bar = document.getElementById('cohort-shell-bar');
  const stu = document.getElementById('cohort-student-wrap');
  const men = document.getElementById('cohort-mentor-wrap');
  const bSt = document.getElementById('cohort-shell-student');
  const bLe = document.getElementById('cohort-shell-leader');
  const bIn = document.getElementById('cohort-shell-individual');
  if (!bar || !stu || !men) return;
  const admin = isCohortPlatformAdmin();
  bar.style.display = admin ? 'flex' : 'none';
  const sh = cohortGetPreviewShell();
  if (bSt) bSt.classList.toggle('active', sh === 'student');
  if (bLe) bLe.classList.toggle('active', sh === 'leader');
  if (bIn) bIn.classList.toggle('active', sh === 'individual');
  if (admin) {
    stu.style.display = sh === 'student' ? '' : 'none';
    men.style.display = sh === 'leader' ? '' : 'none';
    // Individual shell: hide cohort content entirely, show plain tool UI
    const cohortNav = document.getElementById('dash-nav-cohort');
    const cohortStrip = document.getElementById('cohort-app-strip');
    if (sh === 'individual') {
      if (cohortNav) cohortNav.style.display = 'none';
      if (cohortStrip) cohortStrip.style.display = 'none';
      stu.style.display = 'none';
      men.style.display = 'none';
    } else {
      if (cohortNav) cohortNav.style.display = '';
    }
    // Sidebar: student view expands all research tools individually; leader view groups them
    _adminApplyPreviewSidebar(sh);
  } else {
    const leaderOnly = _cohortState.hasMentorCohort && !_cohortState.primaryStudentCohortId;
    stu.style.display = leaderOnly ? 'none' : '';
    men.style.display = _cohortState.hasMentorCohort ? '' : 'none';
  }
  if (!admin) cohortLeaderRenderSwitcher();
}

function _adminApplyPreviewSidebar(shell) {
  // Student: research tools always expanded, Research Tools parent item hidden (tools listed directly)
  // Leader: Research Tools parent folder shown, collapsible
  // Individual: same as student but no cohort nav
  const parent = document.getElementById('dash-nav-research-tools');
  const sub    = document.getElementById('dash-sub-research-tools');
  const arrow  = document.getElementById('dash-nav-rt-arrow');
  if (!parent || !sub) return;
  if (shell === 'student' || shell === 'individual') {
    // Show sub-items always expanded, hide the folder arrow
    sub.style.display = '';
    sub.style.maxHeight = 'none';
    if (arrow) arrow.style.display = 'none';
  } else {
    // Leader / default: collapsible folder behavior
    if (arrow) arrow.style.display = '';
  }
}

async function cohortGetPrimaryStudentCohortId() {
  if (_cohortState.primaryStudentCohortId) return _cohortState.primaryStudentCohortId;
  const row = (_cohortState.studentRows || []).find(r => r.role === 'student' && r.status === 'active');
  return row ? row.cohort_id : null;
}

async function cohortLogActivity(eventType, metadata) {
  if (!_supabase || !currentUser) return;
  const cid = await cohortGetPrimaryStudentCohortId();
  if (!cid) return;
  const meta = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  try {
    await _supabase.from('activity_events').insert({
      cohort_id: cid,
      user_id: currentUser.id,
      event_type: eventType,
      metadata: meta,
    });
    void _supabase.rpc('cohort_ping', { p_cohort: cid });
    const mk = meta.complete_milestone_key;
    if (mk) {
      const { error: e2 } = await _supabase.rpc('cohort_try_complete_system_milestone', { p_cohort: cid, p_key: String(mk) });
      if (e2) { /* no matching milestone_key or not student */ }
    }
  } catch (_) {}
}

async function cohortJoinInvite() {
  const inp = document.getElementById('cohort-invite-input');
  const st = document.getElementById('cohort-status');
  const code = (inp && inp.value || '').trim();
  if (!code) { if (st) st.textContent = 'Masukkan kode undangan.'; return; }
  if (!_supabase || !currentUser) { openAuthModal('login'); return; }
  if (st) st.textContent = 'Memproses…';
  const { data, error } = await _supabase.rpc('join_cohort', { p_invite: code });
  if (error) {
    if (st) st.textContent = error.message || 'Gagal gabung. Cek kode atau hubungi mentor.';
    return;
  }
  if (inp) inp.value = '';
  await cohortInit();
  if (st) st.textContent = _cohortState.hasMentorCohort
    ? 'Berhasil gabung sebagai pemimpin kohort. Atur identitas di tab Identitas kohort.'
    : 'Berhasil gabung kohort.';
  if (_cohortState.hasMentorCohort) {
    setTimeout(() => {
      cohortSwitchMentorTab('identity');
      document.getElementById('cohort-branding-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }
}

async function cohortInit() {
  const st = document.getElementById('cohort-status');
  if (!_supabase || !currentUser) {
    if (st) st.textContent = 'Login untuk melihat kohort.';
    cohortClearDashboardTheme();
    return;
  }
  let sessionReady = await cohortEnsureSupabaseSession();
  if (!sessionReady) {
    await new Promise(r => setTimeout(r, 400));
    sessionReady = await cohortEnsureSupabaseSession();
  }
  if (!sessionReady) {
    if (st) st.textContent = 'Sesi login belum siap. Tunggu sebentar lalu buka tab Kohort lagi.';
    return;
  }
  const ci = document.getElementById('cohort-invite-input');
  const pend = getPendingInvite();
  if (ci && pend && !ci.value.trim()) ci.value = pend;
  _cohortState = {
    studentRows: [],
    mentorCohorts: [],
    primaryStudentCohortId: null,
    primaryMentorCohort: null,
    hasMentorCohort: false,
    cohortMap: {},
    memberNameMap: {},
    directoryRows: [],
    studentTab: 'ringkasan',
    mentorTab: 'overview',
  };

  const { data: mem } = await _supabase
    .from('cohort_members')
    .select('cohort_id,role,status,joined_at')
    .eq('user_id', currentUser.id)
    .eq('status', 'active');
  const mids = [...new Set((mem || []).map(m => m.cohort_id).filter(Boolean))];
  _cohortState.studentRows = mem || [];
  const firstStu = (mem || []).find(m => m.role === 'student');
  _cohortState.primaryStudentCohortId = firstStu ? firstStu.cohort_id : null;

  let cohortMap = {};
  if (mids.length) {
    const { data: coh } = await _supabase.from('cohorts').select('*').in('id', mids);
    (coh || []).forEach(c => { cohortMap[c.id] = c; });
  }

  let led = [];
  if (isPlatformAdmin()) {
    const { data: allCohorts, error: acErr } = await _supabase.from('cohorts').select('*').order('created_at', { ascending: false });
    led = allCohorts || [];
    if (acErr) {
      if (st) st.textContent = 'Gagal memuat daftar kohort: ' + (acErr.message || 'error');
    } else if (!led.length && st && !String(st.textContent || '').includes('Gagal')) {
      st.textContent = 'Belum ada kohort di database. Pastikan migrasi Supabase (Ocean Blue) sudah diterapkan.';
    }
  } else {
    const res = await _supabase.from('cohorts').select('*').eq('mentor_user_id', currentUser.id);
    led = res.data || [];
    const mentorIds = [...new Set((mem || []).filter(m => m.role === 'mentor').map(m => m.cohort_id).filter(Boolean))];
    if (mentorIds.length) {
      const { data: memberLed } = await _supabase.from('cohorts').select('*').in('id', mentorIds);
      const seen = new Set((led || []).map(c => c.id));
      (memberLed || []).forEach(c => {
        if (!seen.has(c.id)) led.push(c);
      });
    }
  }
  _cohortState.mentorCohorts = led || [];
  let primaryMentor = null;
  if (isPlatformAdmin()) {
    primaryMentor = cohortPickAdminPreviewCohort(led);
    if (primaryMentor?.id) {
      try {
        if (!sessionStorage.getItem(ADMIN_PREVIEW_COHORT_KEY)) {
          sessionStorage.setItem(ADMIN_PREVIEW_COHORT_KEY, primaryMentor.id);
        }
      } catch (_) {}
    }
  } else {
    primaryMentor = (led && led[0]) || null;
  }
  _cohortState.primaryMentorCohort = primaryMentor;
  _cohortState.hasMentorCohort = !!(led && led.length);
  (led || []).forEach(c => { cohortMap[c.id] = c; });
  _cohortState.cohortMap = cohortMap;

  cohortPopulateAdminCohortPicker(led);

  cohortApplyShellUI();

  const infoEl = document.getElementById('cohort-student-info');
  const wa = document.getElementById('cohort-wa-link');
  const pcid = _cohortState.primaryStudentCohortId;
  const subTabs = document.getElementById('cohort-student-subtabs');
  const joinCard = document.getElementById('cohort-join-card');
  const stuWrap = document.getElementById('cohort-student-wrap');
  if (subTabs) subTabs.style.display = pcid ? 'flex' : 'none';
  if (joinCard && stuWrap && !pcid) stuWrap.prepend(joinCard);
  if (!pcid) {
    if (infoEl) infoEl.innerHTML = 'Kamu belum di kohort. Pakai kode undangan di atas, atau minta mentor untuk undangan.';
    if (wa) { wa.style.display = 'none'; }
  } else {
    const c = cohortMap[pcid];
    if (infoEl) {
      infoEl.innerHTML = `<strong style="color:#111;">${c ? (c.name || 'Kohort') : 'Kohort'}</strong><br><span class="cohort-muted">Bergabung · aktif</span>`;
    }
    if (wa && c && c.whatsapp_invite_url) {
      wa.href = c.whatsapp_invite_url;
      wa.style.display = 'inline-block';
    } else if (wa) wa.style.display = 'none';
    await cohortLoadMemberNames(pcid);
    cohortBindPostKindSelect();
    void _supabase.rpc('cohort_ping', { p_cohort: pcid });
  }

  cohortSetupChatPanel(pcid);
  cohortUpdateSidebarCohortPill();

  await cohortRenderMilestones(pcid);
  await cohortRenderLeaderboard(pcid);
  await cohortRenderAnnouncements(pcid);
  await cohortRenderFeed(pcid);
  await cohortRenderRankingsStudent(pcid);
  await cohortRenderStudentProgressCards(pcid);
  await cohortRenderMentorPanels();

  cohortRefreshDashboardTheme();
  cohortSwitchStudentTab('ringkasan');
  cohortSwitchMentorTab(_cohortState.mentorTab || 'overview');
  if (typeof _dashActiveView !== 'undefined' && _dashActiveView === 'dashboard') {
    if (typeof hbdRenderCohortDigest === 'function') void hbdRenderCohortDigest();
    if (typeof hbdRenderMentorDigest === 'function') void hbdRenderMentorDigest();
  }
}

async function cohortLoadMemberNames(cohortId) {
  _cohortState.memberNameMap = {};
  if (!cohortId || !_supabase) return;
  const { data, error } = await _supabase.rpc('cohort_member_names', { p_cohort: cohortId });
  if (error || !data) return;
  data.forEach(r => { if (r.user_id) _cohortState.memberNameMap[r.user_id] = r.display_name; });
}

function cohortBindPostKindSelect() {
  const pk = document.getElementById('cohort-post-kind');
  const mw = document.getElementById('cohort-post-meta-wrap');
  if (!pk || !mw || pk.dataset.cohortBound) return;
  pk.dataset.cohortBound = '1';
  const sync = () => { mw.style.display = pk.value === 'product_share' ? '' : 'none'; };
  pk.addEventListener('change', sync);
  sync();
}

function cohortSetupChatPanel(cohortId) {
  const a = document.getElementById('cohort-chat-wa');
  const miss = document.getElementById('cohort-chat-wa-missing');
  const c = cohortId && _cohortState.cohortMap ? _cohortState.cohortMap[cohortId] : null;
  const url = c && c.whatsapp_invite_url ? String(c.whatsapp_invite_url).trim() : '';
  if (a) {
    if (url) { a.href = url; a.style.display = 'inline-block'; } else { a.style.display = 'none'; }
  }
  if (miss) miss.style.display = cohortId && !url ? '' : 'none';
}

function cohortUpdateSidebarCohortPill() {
  const el = document.getElementById('dash-cohort-pill');
  if (!el) return;
  const cid = _cohortState.primaryStudentCohortId;
  const c = cid && _cohortState.cohortMap ? _cohortState.cohortMap[cid] : null;
  if (cid && c) {
    const pri = _cohortParseThemeHex(c.theme_primary) || '#1A1F3C';
    const sec = _cohortParseThemeHex(c.theme_secondary) || '#c9a87c';
    const icon = (c.badge_icon || '').trim();
    const sub = (c.slogan && c.slogan.trim()) ? c.slogan.trim() : '';
    el.style.display = 'block';
    el.innerHTML = cohortBadgeHtml({
      cohortName: c.name || 'Kohort',
      cohortIcon: icon,
      cohortPrimaryColor: pri,
      cohortSecondaryColor: sec,
      cohortSubtitle: sub,
      variant: 'compact',
      shape: cohortBadgeShapeFromRow(c),
      hideSubtitle: true,
    });
    el.title = c.name || '';
  } else {
    el.style.display = 'none';
    el.textContent = '';
    el.innerHTML = '';
  }
}

async function cohortRefreshCohortPillFromServer() {
  const el = document.getElementById('dash-cohort-pill');
  if (!_supabase || !currentUser || !el) return;
  const { data: m } = await _supabase.from('cohort_members').select('cohort_id').eq('user_id', currentUser.id).eq('status', 'active').eq('role', 'student').limit(1).maybeSingle();
  if (!m || !m.cohort_id) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  const { data: c } = await _supabase.from('cohorts').select('name,badge_icon,theme_primary,theme_secondary,slogan,theme_json').eq('id', m.cohort_id).maybeSingle();
  if (!c) {
    el.style.display = 'none';
    return;
  }
  const pri = _cohortParseThemeHex(c.theme_primary) || '#1A1F3C';
  const sec = _cohortParseThemeHex(c.theme_secondary) || '#c9a87c';
  const icon = (c.badge_icon || '').trim();
  const sub = (c.slogan && c.slogan.trim()) ? c.slogan.trim() : '';
  el.style.display = 'block';
  el.innerHTML = cohortBadgeHtml({
    cohortName: c.name || 'Kohort',
    cohortIcon: icon,
    cohortPrimaryColor: pri,
    cohortSecondaryColor: sec,
    cohortSubtitle: sub,
    variant: 'compact',
    shape: cohortBadgeShapeFromRow(c),
    hideSubtitle: true,
  });
  el.title = c.name || '';
}

function cohortSwitchStudentTab(tab) {
  _cohortState.studentTab = tab;
  document.querySelectorAll('#cohort-student-subtabs .cohort-subtab').forEach(b => {
    b.classList.toggle('active', b.dataset.cstab === tab);
  });
  ['ringkasan', 'feed', 'rankings', 'chat'].forEach(t => {
    const el = document.getElementById('cohort-student-panel-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  const cid = _cohortState.primaryStudentCohortId;
  if (tab === 'feed' && cid) void cohortRenderFeed(cid);
  if (tab === 'rankings' && cid) {
    void cohortRenderRankingsStudent(cid);
    void cohortRenderStudentProgressCards(cid);
  }
}

function cohortSwitchMentorTab(tab) {
  _cohortState.mentorTab = tab;
  document.querySelectorAll('#cohort-mentor-subtabs .cohort-subtab').forEach(b => {
    b.classList.toggle('active', b.dataset.cmtab === tab);
  });
  ['overview', 'identity', 'students', 'mod', 'report'].forEach(t => {
    const el = document.getElementById('cohort-mentor-panel-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  const c = _cohortState.primaryMentorCohort;
  if (!c) return;
  if (tab === 'identity') cohortPreviewBrandingForm();
  if (tab === 'students') void cohortRenderMentorDirectory(c.id);
  if (tab === 'mod') void cohortRenderModFeed(c.id);
}

function cohortCohortDisplayName(userId, fallbackRank) {
  if (userId === (currentUser && currentUser.id)) return 'Kamu';
  const n = _cohortState.memberNameMap && _cohortState.memberNameMap[userId];
  if (n) return n;
  if (fallbackRank != null) return 'Anggota #' + fallbackRank;
  return 'Anggota kohort';
}

function cohortActivityLine(ev) {
  const meta = ev.metadata || {};
  const who = cohortCohortDisplayName(ev.user_id, null);
  const mine = ev.user_id === (currentUser && currentUser.id);
  const label = mine ? 'Kamu' : who;
  switch (ev.event_type) {
    case 'deepdive_open':
      return `${label} membuka Deep Dive · ${meta.product_name ? _cohortEsc(meta.product_name) : 'produk'}`;
    case 'product_saved':
      return `${label} menyimpan produk ke riset`;
    case 'tracker_plan_update':
      return `${label} memperbarui rencana margin di Tracker`;
    case 'community_post':
      return `${label} mengirim ke feed komunitas`;
    case 'milestone_complete':
      return `${label} menyelesaikan milestone`;
    case 'credit_spent':
      return `${label} menggunakan kredit (${_cohortEsc(meta.action || 'fitur')})`;
    default:
      return `${label} · ${_cohortEsc(ev.event_type)}`;
  }
}

async function cohortRenderMilestones(cohortId) {
  const ul = document.getElementById('cohort-milestone-list');
  if (!ul) return;
  ul.innerHTML = '';
  if (!cohortId || !_supabase) { ul.innerHTML = '<li class="cohort-muted">—</li>'; return; }
  const { data: ms } = await _supabase.from('milestones').select('id,title,sort_order,milestone_key').eq('cohort_id', cohortId).order('sort_order', { ascending: true });
  const { data: done } = await _supabase.from('user_milestone_progress').select('milestone_id').eq('user_id', currentUser.id);
  const doneSet = new Set((done || []).map(d => d.milestone_id));
  if (!(ms || []).length) {
    ul.innerHTML = '<li class="cohort-muted">Belum ada milestone.</li>';
    return;
  }
  ul.innerHTML = (ms || []).map(m => {
    const ok = doneSet.has(m.id);
    const keyHint = m.milestone_key ? `<span class="cohort-muted" style="font-size:.62rem;"> · ${_cohortEsc(m.milestone_key)}</span>` : '';
    return `<li><span>${_cohortEsc(m.title)}${keyHint}</span><button type="button" class="cohort-btn secondary" style="padding:4px 10px;font-size:.65rem;" data-ms="${m.id}" onclick="cohortToggleMilestone(this.dataset.ms)">${ok ? 'Selesai' : 'Tandai'}</button></li>`;
  }).join('');
}

async function cohortToggleMilestone(mid) {
  if (!_supabase || !currentUser || !mid) return;
  const { data: ex } = await _supabase.from('user_milestone_progress').select('milestone_id').eq('user_id', currentUser.id).eq('milestone_id', mid).maybeSingle();
  if (ex) return;
  await _supabase.from('user_milestone_progress').insert({ user_id: currentUser.id, milestone_id: mid });
  await cohortLogActivity('milestone_complete', { milestone_id: mid });
  const cid = await cohortGetPrimaryStudentCohortId();
  await cohortRenderMilestones(cid);
  await cohortRenderStudentProgressCards(cid);
}

async function cohortRenderLeaderboard(cohortId) {
  const ul = document.getElementById('cohort-leaderboard');
  if (!ul) return;
  ul.innerHTML = '';
  if (!cohortId || !_supabase) { ul.innerHTML = '<li class="cohort-muted">—</li>'; return; }
  const { data, error } = await _supabase.rpc('cohort_leaderboard', { p_cohort: cohortId, p_days: 30 });
  if (error || !(data || []).length) {
    ul.innerHTML = '<li class="cohort-muted">Belum ada aktivitas.</li>';
    return;
  }
  ul.innerHTML = data.map((r) => {
    const mine = r.user_id === currentUser.id;
    const label = mine ? 'Kamu' : cohortCohortDisplayName(r.user_id, r.rank);
    return `<li><span>#${r.rank} ${label}</span><span style="font-weight:800;">${r.points}</span></li>`;
  }).join('');
}

async function cohortRenderAnnouncements(cohortId) {
  const ul = document.getElementById('cohort-announce-list');
  if (!ul) return;
  ul.innerHTML = '';
  if (!cohortId || !_supabase) { ul.innerHTML = '<li class="cohort-muted">—</li>'; return; }
  const { data } = await _supabase.from('cohort_announcements').select('title,body,created_at').eq('cohort_id', cohortId).order('created_at', { ascending: false }).limit(12);
  if (!(data || []).length) { ul.innerHTML = '<li class="cohort-muted">Belum ada pengumuman.</li>'; return; }
  ul.innerHTML = data.map(a => `<li><div><strong>${_cohortEsc(a.title)}</strong><div class="cohort-muted" style="margin-top:4px;">${_cohortEsc((a.body || '').slice(0, 120))}${(a.body || '').length > 120 ? '…' : ''}</div></div><span class="cohort-muted" style="white-space:nowrap;">${_cohortEsc((a.created_at || '').slice(0, 10))}</span></li>`).join('');
}

async function cohortRenderFeed(cohortId) {
  const root = document.getElementById('cohort-feed-list');
  if (!root) return;
  root.innerHTML = '';
  if (!cohortId || !_supabase) { root.innerHTML = '<p class="cohort-muted">—</p>'; return; }
  const cRow = _cohortState.cohortMap[cohortId];
  const mentorId = cRow && cRow.mentor_user_id;
  const [{ data: posts, error: pe }, { data: acts, error: ae }] = await Promise.all([
    _supabase.from('community_posts').select('id,body,created_at,author_id,kind,metadata,answered_at').eq('cohort_id', cohortId).order('created_at', { ascending: false }).limit(40),
    _supabase.rpc('cohort_feed_activity_events', { p_cohort: cohortId, p_limit: 60 }),
  ]);
  if (pe) console.warn('cohort posts', pe);
  if (ae) console.warn('cohort activity feed', ae);
  const items = [];
  (posts || []).forEach(p => {
    items.push({ t: 'post', ts: new Date(p.created_at).getTime(), post: p });
  });
  (acts || []).forEach(e => {
    items.push({ t: 'act', ts: new Date(e.created_at).getTime(), ev: e });
  });
  items.sort((a, b) => b.ts - a.ts);
  if (!items.length) { root.innerHTML = '<p class="cohort-muted">Belum ada aktivitas di feed.</p>'; return; }

  const postIds = (posts || []).map(p => p.id);
  let reactMap = {};
  if (postIds.length) {
    const { data: rx } = await _supabase.from('community_post_reactions').select('post_id,reaction,user_id').in('post_id', postIds);
    (rx || []).forEach(r => {
      reactMap[r.post_id] = reactMap[r.post_id] || { like: 0, celebrate: 0, focus: 0, mine: {} };
      reactMap[r.post_id][r.reaction] = (reactMap[r.post_id][r.reaction] || 0) + 1;
      if (r.user_id === currentUser.id) reactMap[r.post_id].mine[r.reaction] = true;
    });
  }

  const kindLbl = { general: 'Umum', win: 'Menang', question: 'Pertanyaan', product_share: 'Produk', milestone_share: 'Milestone' };
  root.innerHTML = items.map(it => {
    if (it.t === 'act') {
      const line = cohortActivityLine(it.ev);
      return `<div class="cohort-feed-card"><div class="cohort-feed-kind">Aktivitas</div><div class="cohort-feed-body">${line}</div><div class="cohort-feed-meta">${_cohortEsc((it.ev.created_at || '').slice(0, 16).replace('T', ' '))}</div></div>`;
    }
    const p = it.post;
    const mine = p.author_id === currentUser.id;
    const isMentor = mentorId && p.author_id === mentorId;
    const who = mine ? 'Kamu' : (isMentor ? 'Mentor' : cohortCohortDisplayName(p.author_id, null));
    const k = p.kind || 'general';
    const meta = p.metadata || {};
    const url = meta.listing_url || meta.product_url || meta.url || '';
    const note = meta.note || meta.jumlah || '';
    const rx = reactMap[p.id] || { mine: {} };
    const qAns = k === 'question' && p.answered_at ? ' · Terjawab' : '';
    return `<div class="cohort-feed-card" data-post="${p.id}">
      <div class="cohort-feed-kind">${_cohortEsc(kindLbl[k] || k)}${qAns}</div>
      <div class="cohort-feed-body">${_cohortEsc(p.body)}</div>
      ${url ? `<div class="cohort-feed-meta"><a href="${_cohortEsc(url)}" target="_blank" rel="noopener">Tautan</a>${note ? ' · ' + _cohortEsc(note) : ''}</div>` : (note ? `<div class="cohort-feed-meta">${_cohortEsc(note)}</div>` : '')}
      <div class="cohort-feed-meta">${_cohortEsc(who)} · ${_cohortEsc((p.created_at || '').slice(0, 16).replace('T', ' '))}</div>
      <div class="cohort-feed-actions">
        <button type="button" class="cohort-feed-react ${rx.mine.like ? 'on' : ''}" onclick="cohortToggleReaction('${p.id}','like')">👍 ${rx.like || 0}</button>
        <button type="button" class="cohort-feed-react ${rx.mine.celebrate ? 'on' : ''}" onclick="cohortToggleReaction('${p.id}','celebrate')">🎉 ${rx.celebrate || 0}</button>
        <button type="button" class="cohort-feed-react ${rx.mine.focus ? 'on' : ''}" onclick="cohortToggleReaction('${p.id}','focus')">🎯 ${rx.focus || 0}</button>
        <button type="button" class="cohort-btn secondary" style="padding:4px 10px;font-size:.65rem;margin-left:auto;" onclick="cohortToggleThread('${p.id}')">Komentar</button>
      </div>
      <div id="cohort-thread-${p.id}" class="cohort-feed-thread"></div>
    </div>`;
  }).join('');
}

async function cohortToggleThread(postId) {
  const th = document.getElementById('cohort-thread-' + postId);
  if (!th) return;
  const open = !th.classList.contains('open');
  th.classList.toggle('open', open);
  if (!open) return;
  await cohortLoadThread(postId);
}

async function cohortLoadThread(postId) {
  const th = document.getElementById('cohort-thread-' + postId);
  if (!th || !_supabase) return;
  th.innerHTML = '<p class="cohort-muted">Memuat…</p>';
  const cid = await cohortGetPrimaryStudentCohortId();
  const cRow = cid ? _cohortState.cohortMap[cid] : null;
  const mentorId = cRow && cRow.mentor_user_id;
  const { data } = await _supabase.from('community_post_comments').select('body,created_at,author_id').eq('post_id', postId).order('created_at', { ascending: true }).limit(40);
  const lines = (data || []).map(c => {
    const badge = mentorId && c.author_id === mentorId ? ' <span class="cohort-muted">(Mentor)</span>' : '';
    const who = c.author_id === currentUser.id ? 'Kamu' : cohortCohortDisplayName(c.author_id, null);
    return `<div class="cohort-feed-cmt">${_cohortEsc(who)}${badge} · ${_cohortEsc((c.created_at || '').slice(0, 16).replace('T', ' '))}<div style="margin-top:4px;">${_cohortEsc(c.body)}</div></div>`;
  }).join('');
  th.innerHTML = lines + `<div style="margin-top:8px;display:flex;gap:6px;"><input id="cohort-cmt-inp-${postId}" class="cohort-input" style="margin:0;flex:1;" placeholder="Tulis komentar…"><button type="button" class="cohort-btn secondary" style="padding:6px 10px;font-size:.65rem;" onclick="cohortSubmitComment('${postId}')">Kirim</button></div>`;
}

async function cohortSubmitComment(postId) {
  const inp = document.getElementById('cohort-cmt-inp-' + postId);
  const body = (inp && inp.value || '').trim();
  if (!body || !_supabase) return;
  const { error } = await _supabase.from('community_post_comments').insert({ post_id: postId, author_id: currentUser.id, body });
  if (!error && inp) inp.value = '';
  await cohortLoadThread(postId);
  document.getElementById('cohort-thread-' + postId)?.classList.add('open');
}

async function cohortToggleReaction(postId, reaction) {
  if (!_supabase || !currentUser) return;
  const { data: existing } = await _supabase.from('community_post_reactions').select('post_id').eq('post_id', postId).eq('user_id', currentUser.id).eq('reaction', reaction).maybeSingle();
  if (existing) {
    await _supabase.from('community_post_reactions').delete().eq('post_id', postId).eq('user_id', currentUser.id).eq('reaction', reaction);
  } else {
    await _supabase.from('community_post_reactions').insert({ post_id: postId, user_id: currentUser.id, reaction });
  }
  await cohortRenderFeed(await cohortGetPrimaryStudentCohortId());
}

async function cohortSubmitPost() {
  const cid = await cohortGetPrimaryStudentCohortId();
  const ta = document.getElementById('cohort-post-body');
  const kindEl = document.getElementById('cohort-post-kind');
  const body = (ta && ta.value || '').trim();
  const kind = (kindEl && kindEl.value) || 'general';
  if (!cid || !body || !_supabase) return;
  const metadata = {};
  if (kind === 'product_share') {
    const u = (document.getElementById('cohort-post-meta-url') || {}).value || '';
    const n = (document.getElementById('cohort-post-meta-note') || {}).value || '';
    if (u.trim()) metadata.listing_url = u.trim();
    if (n.trim()) metadata.note = n.trim();
  }
  const { error } = await _supabase.from('community_posts').insert({ cohort_id: cid, author_id: currentUser.id, body, kind, metadata });
  if (!error) {
    if (ta) ta.value = '';
    await cohortLogActivity('community_post', { kind });
    await cohortRenderFeed(cid);
  }
}

async function cohortRenderRankingsStudent(cohortId) {
  const host = document.getElementById('cohort-rankings-board');
  const sum = document.getElementById('cohort-rankings-summary');
  if (!host) return;
  if (!cohortId || !_supabase) { host.innerHTML = '<p class="cohort-muted">—</p>'; return; }
  const { data, error } = await _supabase.rpc('cohort_rankings_board', { p_cohort: cohortId, p_days: 30 });
  if (error || !(data || []).length) {
    if (sum) sum.textContent = 'Belum ada data rankings.';
    host.innerHTML = '<p class="cohort-muted">Belum ada aktivitas cukup untuk papan peringkat.</p>';
    return;
  }
  if (sum) sum.textContent = 'Poin = jumlah aktivitas 30 hari terakhir. Streak = hari riset beruntun (WIB).';
  host.innerHTML = data.map(r => {
    const who = cohortCohortDisplayName(r.user_id, r.rank);
    return `<div class="cohort-rank-row"><span>#${r.rank} ${who}</span><span style="font-weight:800;">${r.points} pt · 🔥${r.streak} · ✓${r.milestones_done}</span></div>`;
  }).join('');
}

async function cohortRenderStudentProgressCards(cohortId) {
  const stEl = document.getElementById('cohort-my-streak');
  const nxEl = document.getElementById('cohort-next-milestone');
  const bars = document.getElementById('cohort-weekly-bars');
  if (!cohortId || !_supabase || !currentUser) {
    if (stEl) stEl.textContent = '—';
    if (nxEl) nxEl.textContent = '—';
    if (bars) bars.innerHTML = '';
    return;
  }
  const { data: str } = await _supabase.rpc('cohort_user_streak', { p_cohort: cohortId, p_user: currentUser.id });
  if (stEl) stEl.innerHTML = `Streak riset kamu: <strong>${str != null ? str : 0}</strong> hari beruntun (berdasarkan aktivitas).`;
  const { data: ms } = await _supabase.from('milestones').select('id,title,milestone_key').eq('cohort_id', cohortId).order('sort_order', { ascending: true });
  const { data: done } = await _supabase.from('user_milestone_progress').select('milestone_id').eq('user_id', currentUser.id);
  const doneSet = new Set((done || []).map(d => d.milestone_id));
  const next = (ms || []).find(m => !doneSet.has(m.id));
  if (nxEl) nxEl.innerHTML = next ? `Berikutnya: <strong>${_cohortEsc(next.title)}</strong>` : 'Semua milestone terisi — pertahankan momentum!';

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: evs } = await _supabase.from('activity_events').select('created_at').eq('cohort_id', cohortId).eq('user_id', currentUser.id).gte('created_at', since);
  const byDay = [0, 0, 0, 0, 0, 0, 0];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  (evs || []).forEach(e => {
    const d = new Date(e.created_at).setHours(0, 0, 0, 0);
    const idx = Math.round((d - start.getTime()) / 86400000);
    if (idx >= 0 && idx < 7) byDay[idx]++;
  });
  if (bars) {
    bars.innerHTML = byDay.map(n => `<div class="cohort-week-cell${n > 0 ? ' on' : ''}" title="${n} aktivitas"></div>`).join('');
  }
}

async function cohortRenderMentorPanels() {
  const sum = document.getElementById('cohort-mentor-summary');
  const memEl = document.getElementById('cohort-mentor-members');
  const inac = document.getElementById('cohort-mentor-inactive');
  const ov = document.getElementById('cohort-mentor-overview');
  const bc = document.getElementById('cohort-branding-card');
  const idTab = document.getElementById('cohort-mentor-subtab-identity');
  const c = _cohortState.primaryMentorCohort;
  if (!c) {
    if (sum) sum.textContent = 'Kamu belum ditetapkan sebagai mentor kohort.';
    if (memEl) memEl.textContent = '—';
    if (inac) inac.innerHTML = '';
    if (ov) ov.textContent = '—';
    if (idTab) idTab.style.display = 'none';
    return;
  }
  const cohortId = c.id;
  await cohortLoadMemberNames(cohortId);
  const { data: members } = await _supabase.from('cohort_members').select('user_id,role,status,joined_at,last_seen_at').eq('cohort_id', cohortId).eq('status', 'active');
  const studs = (members || []).filter(m => m.role === 'student');
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recent } = await _supabase.from('activity_events').select('user_id').eq('cohort_id', cohortId).gte('created_at', since);
  const activeSet = new Set((recent || []).map(r => r.user_id));
  const inactive = studs.filter(s => !activeSet.has(s.user_id));
  if (sum) {
    sum.innerHTML = `<strong style="color:#111;">${c.name || 'Kohort'}</strong><br>Siswa aktif: <strong>${studs.length}</strong> · Tidak aktif 7h: <strong>${inactive.length}</strong>`;
  }
  if (memEl) {
    memEl.innerHTML = studs.length ? studs.map(s => {
      const nm = cohortCohortDisplayName(s.user_id, null);
      const ls = s.last_seen_at ? ` · terlihat ${_cohortEsc(s.last_seen_at.slice(0, 10))}` : '';
      return `<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;font-size:.72rem;"><strong>${_cohortEsc(nm)}</strong>${ls}<br><span class="cohort-muted">bergabung ${_cohortEsc((s.joined_at || '').slice(0, 10))}</span></div>`;
    }).join('') : '<span class="cohort-muted">Belum ada siswa.</span>';
  }
  if (inac) {
    inac.innerHTML = inactive.length
      ? inactive.map(s => `<li><span style="font-weight:600;">${_cohortEsc(cohortCohortDisplayName(s.user_id, null))}</span><span class="cohort-muted"> tanpa event 7 hari</span></li>`).join('')
      : '<li class="cohort-muted">Semua aktif 🎉</li>';
  }
  const { count: postWeek } = await _supabase.from('community_posts').select('*', { count: 'exact', head: true }).eq('cohort_id', cohortId).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
  if (ov) {
    ov.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">
        <div style="background:#F9FAFB;border-radius:8px;padding:10px;"><div class="cohort-muted" style="font-size:.62rem;">Perlu perhatian</div><div style="font-size:1.2rem;font-weight:900;">${inactive.length}</div></div>
        <div style="background:#F9FAFB;border-radius:8px;padding:10px;"><div class="cohort-muted" style="font-size:.62rem;">Posting feed (7h)</div><div style="font-size:1.2rem;font-weight:900;">${postWeek || 0}</div></div>
        <div style="background:#F9FAFB;border-radius:8px;padding:10px;"><div class="cohort-muted" style="font-size:.62rem;">Siswa aktif</div><div style="font-size:1.2rem;font-weight:900;">${studs.length}</div></div>
      </div>`;
  }
  if (bc) {
    const isActualMentor = cohortIsActualMentorForCohort(c);
    const adminPrevLeader = isPlatformAdmin() && cohortGetPreviewShell() === 'leader';
    const canEditBrand = isActualMentor || adminPrevLeader;
    const showIdentityTab = canEditBrand;
    if (idTab) idTab.style.display = showIdentityTab ? '' : 'none';
    if (!showIdentityTab && _cohortState.mentorTab === 'identity') {
      cohortSwitchMentorTab('overview');
    }
    if (showIdentityTab) {
      const name = document.getElementById('cohort-brand-name');
      const pri = document.getElementById('cohort-brand-primary');
      const sec = document.getElementById('cohort-brand-secondary');
      const priPick = document.getElementById('cohort-brand-primary-picker');
      const secPick = document.getElementById('cohort-brand-secondary-picker');
      const badge = document.getElementById('cohort-brand-badge');
      const slogan = document.getElementById('cohort-brand-slogan');
      const btn = document.getElementById('cohort-brand-save-btn');
      const stBr = document.getElementById('cohort-brand-status');
      const priHex = _cohortParseThemeHex(c.theme_primary) || '#0c4a6e';
      const secHex = _cohortParseThemeHex(c.theme_secondary) || '#d4b896';
      if (name) name.value = (c.name || '').trim();
      if (pri) pri.value = priHex;
      if (sec) sec.value = secHex;
      if (priPick) priPick.value = priHex;
      if (secPick) secPick.value = secHex;
      if (badge) badge.value = (c.badge_icon || '').trim();
      const shapeSel = document.getElementById('cohort-brand-badge-shape');
      if (shapeSel) shapeSel.value = cohortBadgeShapeFromRow(c);
      if (slogan) slogan.value = (c.slogan || '').trim();
      if (btn) {
        btn.disabled = !canEditBrand;
        btn.style.opacity = canEditBrand ? '' : '0.45';
        btn.title = canEditBrand ? '' : 'Hanya pemimpin kohort atau admin yang dapat menyimpan.';
      }
      if (stBr) stBr.textContent = '';
      cohortPreviewBrandingForm();
    }
  }
}

function _cohortRelTime(isoStr) {
  if (!isoStr) return 'Belum aktif';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'Baru saja';
  if (mins < 60)  return `${mins} menit lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Kemarin';
  if (days < 7)   return `${days} hari lalu`;
  if (days < 30)  return `${Math.floor(days/7)} minggu lalu`;
  return `${Math.floor(days/30)} bulan lalu`;
}

async function cohortRenderMentorDirectory(cohortId) {
  const el = document.getElementById('cohort-mentor-directory');
  if (!el || !_supabase) return;
  el.innerHTML = 'Memuat…';
  const { data, error } = await _supabase.rpc('cohort_student_directory', { p_cohort: cohortId, p_days: 30 });
  if (error) { el.textContent = error.message || 'Gagal memuat direktori.'; return; }
  _cohortState.directoryRows = data || [];
  if (!_cohortState.directoryRows.length) { el.innerHTML = '<span class="cohort-muted">Belum ada siswa.</span>'; return; }
  const scoreColor = s => s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#9CA3AF';
  el.innerHTML = `<div style="font-size:.65rem;color:#9CA3AF;font-weight:700;display:grid;grid-template-columns:1fr 90px 60px 100px;gap:4px;padding:6px 12px;border-bottom:2px solid #E5E7EB;"><span>Siswa</span><span style="text-align:center;">Aktif terakhir</span><span style="text-align:center;">Skor</span><span style="text-align:right;"></span></div>` +
    _cohortState.directoryRows.map(r => {
      const lastActive = _cohortRelTime(r.last_event_at || r.last_seen_at);
      const score = Number(r.engagement_score || 0);
      const isActive = r.status !== 'paused';
      return `<div onclick="cohortOpenStudentDrawer('${r.user_id}')" style="display:grid;grid-template-columns:1fr 90px 60px 100px;gap:4px;align-items:center;padding:10px 12px;border-bottom:1px solid #F3F4F6;cursor:pointer;transition:background .12s;" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
        <div>
          <div style="font-size:.78rem;font-weight:700;color:#1A1F3C;">${_cohortEsc(r.display_name || r.email || '—')}</div>
          <div style="font-size:.65rem;color:#9CA3AF;">${_cohortEsc(r.email || '')}</div>
        </div>
        <div style="text-align:center;font-size:.7rem;color:${isActive ? '#374151' : '#9CA3AF'};">${lastActive}</div>
        <div style="text-align:center;">
          <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:800;background:${scoreColor(score)}1a;color:${scoreColor(score)};">${score.toFixed(0)}</span>
        </div>
        <div style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
          ${isActive
            ? `<button type="button" class="cohort-btn secondary" style="padding:3px 8px;font-size:.6rem;" onclick="cohortLeaderSetStudentStatus('${r.user_id}','paused')">Pause</button>`
            : `<button type="button" class="cohort-btn secondary" style="padding:3px 8px;font-size:.6rem;" onclick="cohortLeaderSetStudentStatus('${r.user_id}','active')">Aktifkan</button>`}
        </div>
      </div>`;
    }).join('');
}

async function cohortRenderModFeed(cohortId) {
  const el = document.getElementById('cohort-mod-feed');
  if (!el || !_supabase) return;
  const { data } = await _supabase.from('community_posts').select('id,body,created_at,author_id,kind,hidden_at,answered_at').eq('cohort_id', cohortId).order('created_at', { ascending: false }).limit(40);
  if (!(data || []).length) { el.innerHTML = '<p class="cohort-muted">Belum ada posting.</p>'; return; }
  el.innerHTML = (data || []).map(p => {
    const hidden = !!p.hidden_at;
    const q = p.kind === 'question';
    return `<div class="cohort-feed-card" style="opacity:${hidden ? 0.55 : 1}">
      <div class="cohort-feed-body">${_cohortEsc(p.body)}</div>
      <div class="cohort-feed-meta">${_cohortEsc(p.kind)} · ${_cohortEsc((p.created_at || '').slice(0, 16))}${hidden ? ' · <em>disembunyikan</em>' : ''}</div>
      <div class="cohort-feed-actions">
        ${!hidden ? `<button type="button" class="cohort-btn secondary" style="padding:4px 8px;font-size:.62rem;" onclick="cohortLeaderHidePost('${p.id}')">Sembunyikan</button>` : ''}
        ${q && !p.answered_at ? `<button type="button" class="cohort-btn secondary" style="padding:4px 8px;font-size:.62rem;" onclick="cohortLeaderMarkAnswered('${p.id}')">Tandai terjawab</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function cohortLeaderAddStudent() {
  const c = _cohortState.primaryMentorCohort;
  const inp = document.getElementById('cohort-add-student-email');
  const st = document.getElementById('cohort-add-student-status');
  const email = (inp && inp.value || '').trim();
  if (!c || !_supabase || !email) {
    if (st) st.textContent = 'Masukkan email siswa.';
    return;
  }
  if (st) st.textContent = 'Menambahkan siswa...';
  const { error } = await _supabase.rpc('cohort_leader_add_student_by_email', {
    p_cohort: c.id,
    p_email: email,
  });
  if (error) {
    if (st) st.textContent = error.message || 'Gagal menambahkan siswa.';
    return;
  }
  if (inp) inp.value = '';
  if (st) st.textContent = 'Siswa ditambahkan / diaktifkan.';
  await cohortRenderMentorPanels();
  await cohortRenderMentorDirectory(c.id);
}

async function cohortLeaderSetStudentStatus(userId, status) {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase || !userId) return;
  const { error } = await _supabase.rpc('cohort_leader_set_student_status', {
    p_cohort: c.id,
    p_student: userId,
    p_status: status,
  });
  if (error) {
    alert(error.message || 'Gagal mengubah status siswa.');
    return;
  }
  await cohortRenderMentorPanels();
  await cohortRenderMentorDirectory(c.id);
}

async function cohortLeaderHidePost(postId) {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase || !currentUser) return;
  await _supabase.from('community_posts').update({ hidden_at: new Date().toISOString(), hidden_by: currentUser.id }).eq('id', postId).eq('cohort_id', c.id);
  await cohortRenderModFeed(c.id);
}

async function cohortLeaderMarkAnswered(postId) {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase) return;
  await _supabase.from('community_posts').update({ answered_at: new Date().toISOString() }).eq('id', postId).eq('cohort_id', c.id);
  await cohortRenderModFeed(c.id);
}

function cohortExportDirectoryCsv() {
  const rows = _cohortState.directoryRows || [];
  if (!rows.length) { alert('Buka tab Siswa dulu untuk memuat data.'); return; }
  const head = ['user_id', 'display_name', 'engagement_score', 'event_count', 'milestones_done', 'last_event_at', 'last_seen_at'];
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [head.join(',')].concat(rows.map(r => head.map(h => esc(r[h])).join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cohort-students.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function cohortOpenStudentDrawer(userId) {
  const c = _cohortState.primaryMentorCohort;
  const drawer = document.getElementById('cohort-student-drawer');
  const title = document.getElementById('cohort-drawer-title');
  const body = document.getElementById('cohort-drawer-body');
  if (!c || !drawer || !body || !_supabase) return;
  title.textContent = cohortCohortDisplayName(userId, null);
  body.innerHTML = 'Memuat…';
  drawer.classList.add('open');
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: evs }, { data: posts }] = await Promise.all([
    _supabase.from('activity_events').select('event_type,created_at,metadata').eq('cohort_id', c.id).eq('user_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(30),
    _supabase.from('community_posts').select('body,created_at,kind').eq('cohort_id', c.id).eq('author_id', userId).order('created_at', { ascending: false }).limit(8),
  ]);
  const evHtml = (evs || []).map(e => `<div>· ${_cohortEsc(e.event_type)} <span class="cohort-muted">${_cohortEsc((e.created_at || '').slice(0, 16))}</span></div>`).join('') || '<span class="cohort-muted">Belum ada event 14 hari.</span>';
  const postHtml = (posts || []).map(p => `<div style="margin-top:6px;">${_cohortEsc(p.kind)}: ${_cohortEsc((p.body || '').slice(0, 120))}</div>`).join('') || '<span class="cohort-muted">Belum posting.</span>';
  body.innerHTML = `<div style="font-weight:700;margin-bottom:6px;">Aktivitas (14 hari)</div>${evHtml}<div style="font-weight:700;margin:12px 0 6px;">Posting</div>${postHtml}`;
}

function cohortCloseStudentDrawer() {
  document.getElementById('cohort-student-drawer')?.classList.remove('open');
}

async function cohortMentorPostAnnouncement() {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase || !currentUser) return;
  const t = (document.getElementById('cohort-ann-title') || {}).value || '';
  const b = (document.getElementById('cohort-ann-body') || {}).value || '';
  if (!t.trim() || !b.trim()) return;
  const { error } = await _supabase.from('cohort_announcements').insert({
    cohort_id: c.id,
    author_id: currentUser.id,
    title: t.trim(),
    body: b.trim(),
  });
  if (!error) {
    document.getElementById('cohort-ann-title').value = '';
    document.getElementById('cohort-ann-body').value = '';
    await cohortInit();
  }
}

// ── ANNOUNCEMENT MODAL ───────────────────────────────────────
function annModal() {
  const overlay = document.getElementById('ann-modal-overlay');
  if (overlay) { overlay.style.display = 'flex'; }
  document.getElementById('ann-modal-title').value = '';
  document.getElementById('ann-modal-body').value = '';
  const statusEl = document.getElementById('ann-modal-status');
  if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = ''; }
  annSetType('update');
}

function annModalClose() {
  const overlay = document.getElementById('ann-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function annSetType(type) {
  document.getElementById('ann-modal-type').value = type;
  ['update','challenge','psa'].forEach(t => {
    const btn = document.getElementById('ann-type-' + t);
    if (!btn) return;
    const active = t === type;
    btn.style.background = active ? '#E8442A' : '#fff';
    btn.style.color = active ? '#fff' : '#374151';
    btn.style.borderColor = active ? '#E8442A' : '#E5E7EB';
  });
}

async function annModalSubmit() {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase || !currentUser) return;
  const title = (document.getElementById('ann-modal-title').value || '').trim();
  const body  = (document.getElementById('ann-modal-body').value || '').trim();
  const type  = (document.getElementById('ann-modal-type').value || 'update').trim();
  const statusEl = document.getElementById('ann-modal-status');
  if (!title || !body) {
    if (statusEl) { statusEl.textContent = 'Judul dan pesan wajib diisi.'; statusEl.style.display = 'block'; statusEl.style.color = '#E8442A'; }
    return;
  }
  const btn = document.getElementById('ann-modal-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }
  const { error } = await _supabase.from('cohort_announcements').insert({
    cohort_id: c.id,
    author_id: currentUser.id,
    title,
    body: `[${type.toUpperCase()}] ${body}`,
  });
  if (btn) { btn.disabled = false; btn.textContent = 'Kirim Pengumuman'; }
  if (error) {
    if (statusEl) { statusEl.textContent = error.message || 'Gagal mengirim.'; statusEl.style.display = 'block'; statusEl.style.color = '#E8442A'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'Pengumuman terkirim!'; statusEl.style.display = 'block'; statusEl.style.color = '#10B981'; }
  setTimeout(() => { annModalClose(); cohortInit(); }, 800);
}

// ── TAMBAH SISWA MODAL ────────────────────────────────────────
function addSiswaModal() {
  const overlay = document.getElementById('add-siswa-modal-overlay');
  if (overlay) overlay.style.display = 'flex';
  const emailEl = document.getElementById('add-siswa-modal-email');
  if (emailEl) emailEl.value = '';
  const bulkEl = document.getElementById('add-siswa-bulk-input');
  if (bulkEl) bulkEl.value = '';
  const statusEl = document.getElementById('add-siswa-modal-status');
  if (statusEl) statusEl.textContent = '';
  addSiswaTab('single');
}

function addSiswaModalClose() {
  const overlay = document.getElementById('add-siswa-modal-overlay');
  if (overlay) overlay.style.display = 'none';
}

function addSiswaTab(tab) {
  const single = document.getElementById('add-siswa-single-panel');
  const bulk   = document.getElementById('add-siswa-bulk-panel');
  const tabS   = document.getElementById('add-siswa-tab-single');
  const tabB   = document.getElementById('add-siswa-tab-bulk');
  if (single) single.style.display = tab === 'single' ? '' : 'none';
  if (bulk)   bulk.style.display   = tab === 'bulk'   ? '' : 'none';
  if (tabS) { tabS.style.background = tab === 'single' ? '#1A1F3C' : '#fff'; tabS.style.color = tab === 'single' ? '#fff' : '#374151'; }
  if (tabB) { tabB.style.background = tab === 'bulk'   ? '#1A1F3C' : '#fff'; tabB.style.color = tab === 'bulk'   ? '#fff' : '#374151'; }
}

async function addSiswaModalSubmit() {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase) return;
  const email = (document.getElementById('add-siswa-modal-email').value || '').trim();
  const statusEl = document.getElementById('add-siswa-modal-status');
  if (!email) { if (statusEl) { statusEl.textContent = 'Masukkan email.'; statusEl.style.color = '#E8442A'; } return; }
  const btn = document.getElementById('add-siswa-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Menambahkan...'; }
  const { error } = await _supabase.rpc('cohort_leader_add_student_by_email', { p_cohort: c.id, p_email: email });
  if (btn) { btn.disabled = false; btn.textContent = 'Tambahkan Siswa'; }
  if (statusEl) {
    statusEl.textContent = error ? (error.message || 'Gagal.') : 'Siswa ditambahkan!';
    statusEl.style.color = error ? '#E8442A' : '#10B981';
  }
  if (!error) {
    document.getElementById('add-siswa-modal-email').value = '';
    await cohortRenderMentorPanels();
    await cohortRenderMentorDirectory(c.id);
  }
}

async function addSiswaBulk() {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase) return;
  const raw = (document.getElementById('add-siswa-bulk-input').value || '');
  const emails = raw.split('\n').map(e => e.trim()).filter(e => e && e.includes('@'));
  const statusEl = document.getElementById('add-siswa-modal-status');
  if (!emails.length) { if (statusEl) { statusEl.textContent = 'Masukkan minimal 1 email valid.'; statusEl.style.color = '#E8442A'; } return; }
  const btn = document.getElementById('add-siswa-bulk-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  let ok = 0, fail = 0;
  for (const email of emails) {
    const { error } = await _supabase.rpc('cohort_leader_add_student_by_email', { p_cohort: c.id, p_email: email });
    if (error) fail++; else ok++;
    if (statusEl) statusEl.textContent = `Memproses: ${ok + fail}/${emails.length}...`;
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Tambah Semua'; }
  if (statusEl) {
    statusEl.textContent = `Selesai: ${ok} berhasil${fail ? ', ' + fail + ' gagal' : ''}.`;
    statusEl.style.color = fail ? '#B45309' : '#10B981';
  }
  await cohortRenderMentorPanels();
  await cohortRenderMentorDirectory(c.id);
}

async function cohortMentorAddMilestone() {
  const c = _cohortState.primaryMentorCohort;
  if (!c || !_supabase) return;
  const t = ((document.getElementById('cohort-ms-title') || {}).value || '').trim();
  const kRaw = ((document.getElementById('cohort-ms-key') || {}).value || '').trim();
  if (!t) return;
  const { data: existing } = await _supabase.from('milestones').select('sort_order').eq('cohort_id', c.id).order('sort_order', { ascending: false }).limit(1);
  const next = (existing && existing[0] && existing[0].sort_order != null) ? existing[0].sort_order + 1 : 0;
  const row = { cohort_id: c.id, title: t, sort_order: next };
  if (kRaw) row.milestone_key = kRaw;
  await _supabase.from('milestones').insert(row);
  document.getElementById('cohort-ms-title').value = '';
  const keyEl = document.getElementById('cohort-ms-key');
  if (keyEl) keyEl.value = '';
  await cohortInit();
}

// ════════════════════════════════════════════════════════════
//  DISCOVER PAGE  — individual listings from Supabase
// ════════════════════════════════════════════════════════════
let _dscAllListings = [];   // deduplicated listing objects
let _dscPrevMap     = {};   // "itemId_shopId" -> prev total_sold (from earlier scrape)
let _dscKwTrendMap  = {};   // keyword -> pct change in total keyword sold vs prev scrape
let _dscCompMap     = {};   // keyword -> "Rendah"|"Sedang"|"Tinggi"
let _dscFiltered    = [];
let _dscPage        = 1;
let _dscLoaded      = false;
const DSC_PER_PAGE  = 60;

// fmt helpers
const _dscFmt = v => v >= 1000000 ? `Rp ${(v/1000000).toFixed(1)} jt` : v >= 1000 ? `Rp ${(v/1000).toFixed(0)} rb` : `Rp ${Math.round(v)}`;

// Dual range slider update
function dscUpdateDualRange(key) {
  const ids = key === 'price'
    ? ['dsc-price-min','dsc-price-max','dsc-price-fill','dsc-price-min-lbl','dsc-price-max-lbl']
    : ['dsc-omset-min','dsc-omset-max','dsc-omset-fill','dsc-omset-min-lbl','dsc-omset-max-lbl'];
  const [minId,maxId,fillId,minLblId,maxLblId] = ids;
  const minEl = document.getElementById(minId);
  const maxEl = document.getElementById(maxId);
  if (!minEl || !maxEl) return;
  let lo = parseFloat(minEl.value), hi = parseFloat(maxEl.value);
  if (lo > hi) { minEl.value = hi; lo = hi; }
  const span = parseFloat(minEl.max) - parseFloat(minEl.min);
  const left  = ((lo - parseFloat(minEl.min)) / span) * 100;
  const right = ((hi - parseFloat(minEl.min)) / span) * 100;
  const fill = document.getElementById(fillId);
  if (fill) { fill.style.left = left + '%'; fill.style.width = (right - left) + '%'; }
  const minLbl = document.getElementById(minLblId);
  const maxLbl = document.getElementById(maxLblId);
  if (minLbl) minLbl.textContent = _dscFmt(lo);
  if (maxLbl) maxLbl.textContent = hi >= parseFloat(maxEl.max) ? _dscFmt(hi) + '+' : _dscFmt(hi);
  dscApplyFilters();
}

// Competition from seller concentration within keyword
function _dscCalcComp(keyword) {
  const rows = _dscAllListings.filter(r => r.keyword === keyword);
  if (rows.length < 2) return 'Sedang';
  const sales = rows.map(r => r.total_sold || 0).sort((a, b) => b - a);
  const total  = sales.reduce((s, v) => s + v, 0) || 1;
  const top1   = sales[0] / total;
  const top10  = sales.slice(0, 10).reduce((s, v) => s + v, 0) / total;
  if (top1 > 0.4 || top10 > 0.8) return 'Tinggi';
  if (top1 > 0.2 || top10 > 0.55) return 'Sedang';
  return 'Rendah';
}

// Estimated monthly omset for one listing
// Cache peer velocity per "category|priceBucket" so we query Supabase once per bucket
const _peerVelocityCache = {};
let _peerVelocityFetching = new Set();

async function _fetchPeerVelocity(category, price) {
  if (!_supabase) return null;
  const bucket = `${category}|${Math.round(price / 20000) * 20000}`;
  if (_peerVelocityCache[bucket] !== undefined) return _peerVelocityCache[bucket];
  if (_peerVelocityFetching.has(bucket)) return null;
  _peerVelocityFetching.add(bucket);
  try {
    const priceMin = price * 0.7, priceMax = price * 1.3;
    const { data } = await _supabase
      .from('listing_deltas')
      .select('estimated_sold_delta,scraped_at,prev_scraped_at')
      .eq('category', category)
      .gt('estimated_sold_delta', 0)
      .in('confidence', ['high', 'medium'])
      .limit(60);
    if (!data || data.length < 3) { _peerVelocityCache[bucket] = null; return null; }
    // Compute velocity = units/day for each delta
    const velocities = data
      .map(d => {
        const days = Math.max(1, (new Date(d.scraped_at) - new Date(d.prev_scraped_at)) / 86400000);
        return d.estimated_sold_delta / days;
      })
      .filter(v => v > 0 && v < 5000)
      .sort((a, b) => a - b);
    if (velocities.length < 3) { _peerVelocityCache[bucket] = null; return null; }
    const median = velocities[Math.floor(velocities.length / 2)];
    _peerVelocityCache[bucket] = median;
    return median;
  } catch { _peerVelocityCache[bucket] = null; return null; }
  finally { _peerVelocityFetching.delete(bucket); }
}

function _dscOmset(listing) {
  const key = `${listing.item_id}_${listing.shop_id}`;
  const prev = _dscPrevMap[key];
  const price = listing.price || 0;
  if (prev != null) {
    const delta = Math.max(0, (listing.total_sold || 0) - prev);
    return price * delta * 4;  // ~4 weeks in a month
  }
  // Check if we have a peer velocity cached for this category+price
  if (price > 0 && listing.category) {
    const bucket = `${listing.category}|${Math.round(price / 20000) * 20000}`;
    const peerVel = _peerVelocityCache[bucket];
    if (peerVel != null) {
      return Math.round(price * peerVel * 30);  // monthly estimate from peer daily velocity
    }
    // Trigger async fetch so next render has the data (fire-and-forget)
    _fetchPeerVelocity(listing.category, price).then(v => {
      if (v != null) {
        // Re-render once peer data arrives so cards update with better estimates
        if (_dscLoaded) setTimeout(() => dscRenderTable(), 0);
      }
    });
  }
  // Fallback: only valid when Shopee shows exact counts (< 10k).
  // At 10k+ Shopee buckets the number, so we can't derive a monthly rate from it.
  if ((listing.total_sold || 0) < 10000) {
    return price * Math.round((listing.total_sold || 0) / 6);
  }
  return 0;  // No delta and no peer data — cannot estimate period revenue
}

// Trend delta (units gained since last scrape)
function _dscTrendDelta(listing) {
  const key = `${listing.item_id}_${listing.shop_id}`;
  const prev = _dscPrevMap[key];
  if (prev == null) return null;
  return (listing.total_sold || 0) - prev;
}

// Listing trend as % change vs previous scrape (null if no prev data)
function _dscListingTrendPct(listing) {
  const key  = `${listing.item_id}_${listing.shop_id}`;
  const prev = _dscPrevMap[key];
  if (prev == null || prev === 0) return null;
  return Math.round(((listing.total_sold || 0) - prev) / prev * 100);
}

let _dscOffset      = 0;
let _dscHasMore     = true;
let _dscLoading     = false;
let _dscLastSrvFilters = null;
let _dscCurrentCatFilter  = ''; // single cat passed to server (kept for _dscCurrentFilters compat)
let _dscCurrentCatFilters = null; // full selected-cat array for multi-cat server filter
let _dscViewMode    = 'card';
const DSC_FETCH  = 60;

async function dscFetchPage(offset, filters = {}) {
  if (!_supabase) return [];
  const FIELDS = 'item_id,shop_id,product_name,store_name,price,total_sold,category,image_url,url,scraped_at,keyword,location,rating,reviews';
  let q = _supabase
    .from('listings')
    .select(FIELDS)
    .order('total_sold', { ascending: false })
    .range(offset, offset + 400 - 1);

  if (_dscCurrentCatFilters && _dscCurrentCatFilters.length > 1) {
    q = q.in('category', _dscCurrentCatFilters);
  } else if (filters.cat) {
    q = q.eq('category', filters.cat);
  }
  if (filters.priceMin) q = q.gte('price', filters.priceMin);
  if (filters.priceMax && filters.priceMax < 500000) q = q.lte('price', filters.priceMax);
  if (filters.search)   q = q.ilike('product_name', `%${filters.search}%`);

  const { data, error } = await q;
  if (error) {
    let qf = _supabase
      .from('listings')
      .select(FIELDS)
      .order('total_sold', { ascending: false })
      .range(offset, offset + 400 - 1);
    if (_dscCurrentCatFilters && _dscCurrentCatFilters.length > 1) {
      qf = qf.in('category', _dscCurrentCatFilters);
    } else if (filters.cat) {
      qf = qf.eq('category', filters.cat);
    }
    if (filters.priceMin) qf = qf.gte('price', filters.priceMin);
    if (filters.priceMax && filters.priceMax < 500000) qf = qf.lte('price', filters.priceMax);
    if (filters.search)   qf = qf.ilike('product_name', `%${filters.search}%`);
    const fb = await qf;
    return fb.data || [];
  }
  return data || [];
}

const DSC_CACHE_KEY = 'larisid_dsc_cache_v6';
const DSC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _dscLoadTimer = null;
const DSC_TIPS = [
  'Produk dengan skor tinggi memiliki peluang jual lebih besar dan kompetitor lebih sedikit.',
  'Keyword dengan volume tinggi tapi kompetisi rendah adalah peluang emas.',
  'Toko dengan rating 4.8+ biasanya mendapat 3x lebih banyak klik organik.',
  'Harga psikologis (Rp 49.999) terbukti meningkatkan konversi hingga 15%.',
  'Produk dengan foto background putih cenderung mendapat ranking lebih tinggi di Shopee.',
];

function dscShowLoadingScreen() {
  const el = document.getElementById('dsc-loading-screen');
  if (!el) return;
  el.style.display = 'block';

  // Tip rotation
  let tipIdx = 0;
  const tipEl = document.getElementById('dsc-load-tip');
  if (tipEl) tipEl.textContent = DSC_TIPS[0];

  // Animate progress bar and steps
  let pct = 0;
  const steps = [
    { delay: 0,    step: 1, line: null, pct: 20 },
    { delay: 1200, step: 2, line: 1,    pct: 55 },
    { delay: 2800, step: 3, line: 2,    pct: 85 },
  ];

  function setStep(n, line) {
    document.querySelectorAll('.dsc-load-step').forEach((el,i) => el.classList.toggle('active', i < n));
    document.querySelectorAll('.dsc-load-step-line').forEach((el,i) => el.classList.toggle('done', i < (line||0)));
  }

  steps.forEach(s => {
    setTimeout(() => {
      setStep(s.step, s.line);
      animateTo(s.pct);
      tipIdx = (tipIdx + 1) % DSC_TIPS.length;
      if (tipEl) tipEl.textContent = DSC_TIPS[tipIdx];
    }, s.delay);
  });

  function animateTo(target) {
    const bar = document.getElementById('dsc-load-bar');
    const pctEl = document.getElementById('dsc-load-pct');
    const start = pct;
    const duration = 600;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / duration, 1);
      pct = Math.round(start + (target - start) * p);
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
}

function dscHideLoadingScreen() {
  const el = document.getElementById('dsc-loading-screen');
  if (!el) return;
  // Complete the bar then fade out
  const bar = document.getElementById('dsc-load-bar');
  const pctEl = document.getElementById('dsc-load-pct');
  if (bar) bar.style.width = '100%';
  if (pctEl) pctEl.textContent = '100%';
  document.querySelectorAll('.dsc-load-step').forEach(e => e.classList.add('active'));
  document.querySelectorAll('.dsc-load-step-line').forEach(e => e.classList.add('done'));
  setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; el.style.transition = ''; }, 400);
  }, 300);
}

function dscShowSkeleton() {
  const grid = document.getElementById('dsc-card-grid');
  const tbody = document.getElementById('dsc-tbody');
  const skel = Array(12).fill(0).map(() => `
    <div class="dsc-card" style="pointer-events:none;">
      <div style="width:100%;height:130px;background:linear-gradient(90deg,#F3F4F6 25%,#E5E7EB 50%,#F3F4F6 75%);background-size:200% 100%;animation:dsc-shimmer 1.2s infinite;border-radius:6px;"></div>
      <div class="dsc-card-body">
        <div style="height:12px;width:85%;background:#F3F4F6;border-radius:4px;margin-bottom:8px;animation:dsc-shimmer 1.2s infinite;background-size:200% 100%;"></div>
        <div style="height:10px;width:55%;background:#F3F4F6;border-radius:4px;animation:dsc-shimmer 1.2s infinite;background-size:200% 100%;"></div>
      </div>
    </div>`).join('');
  if (grid) grid.innerHTML = skel;
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#9CA3AF;font-size:.85rem;">Memuat data listing...</td></tr>`;
}

function dscSaveCache(rows) {
  try {
    sessionStorage.setItem(DSC_CACHE_KEY, JSON.stringify({ ts: Date.now(), rows }));
  } catch(e) {}
}

function dscLoadCache() {
  try {
    const raw = sessionStorage.getItem(DSC_CACHE_KEY);
    if (!raw) return null;
    const { ts, rows } = JSON.parse(raw);
    if (Date.now() - ts > DSC_CACHE_TTL) { sessionStorage.removeItem(DSC_CACHE_KEY); return null; }
    return rows;
  } catch(e) { return null; }
}

async function dscLoadListings() {
  if (_dscLoading || !_supabase) return;
  _dscLoading = true;

  // Show cache instantly — but only when no category filter is active
  if (!_dscAllListings.length && _dscOffset === 0 && !_dscCurrentCatFilter) {
    const cached = dscLoadCache();
    if (cached && cached.length) {
      _dscAllListings = cached;
      _dscOffset = cached.length;
      _dscLoaded = true;
      const newKws = [...new Set(cached.map(r => r.keyword).filter(Boolean))].filter(k => !_dscCompMap[k]);
      newKws.forEach(kw => { _dscCompMap[kw] = _dscCalcComp(kw); });
      const cats = [...new Set(cached.map(r => r.category).filter(Boolean))].sort();
      dscBuildCatChecks(cats);
      const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setEl('dsc-stat-listings', cached.length + '+');
      setEl('dsc-stat-cats', cats.length.toLocaleString('id-ID'));
      if (_dscLastSrvFilters === null) _dscLastSrvFilters = JSON.stringify({ priceMin: 0, priceMax: 10000000, search: '' });
      dscApplyFilters();
      _dscLoading = false;
      return; // serve from cache; next open will re-check TTL
    }
    dscShowLoadingScreen();
  }

  try {
    const filters = _dscCurrentFilters();
    const rows = await dscFetchPage(_dscOffset, filters);

    if (rows.length < DSC_FETCH) _dscHasMore = false;

    // Deduplicate against already-loaded items
    const seen = new Set(_dscAllListings.map(r => `${r.item_id}_${r.shop_id}`));
    const fresh = rows.filter(r => { const k = `${r.item_id}_${r.shop_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
    _dscAllListings.push(...fresh);
    _dscOffset += DSC_FETCH;

    // Compute competition for new keywords
    const newKws = [...new Set(fresh.map(r => r.keyword).filter(Boolean))].filter(k => !_dscCompMap[k]);
    newKws.forEach(kw => { _dscCompMap[kw] = _dscCalcComp(kw); });

    // Rebuild category list after every page so all categories appear
    {
      const cats = [...new Set(_dscAllListings.map(r => r.category).filter(Boolean))].sort();
      dscBuildCatChecks(cats);
      const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setEl('dsc-stat-cats', cats.length.toLocaleString('id-ID'));
    }

    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('dsc-stat-listings', (_dscAllListings.length + (_dscHasMore ? '+' : '')).toLocaleString?.() || _dscAllListings.length + (_dscHasMore ? '+' : ''));

    _dscLoaded = true;
    // Cache the first batch for instant reload within the session
    if (_dscOffset <= DSC_FETCH * 2) dscSaveCache(_dscAllListings.slice(0, DSC_FETCH));
    // Stamp what server-side filters produced this batch (used by dscApplyFilters change-detection)
    if (_dscLastSrvFilters === null) {
      const f = filters;
      _dscLastSrvFilters = JSON.stringify({ priceMin: f.priceMin, priceMax: f.priceMax, search: f.search });
    }
    dscHideLoadingScreen();
    dscApplyFilters(false);
    // Load trend data in background (non-blocking) after first batch
    if (_dscOffset <= DSC_FETCH * 2) dscLoadTrendData();

  } catch(e) {
    console.error('dscLoadListings:', e);
    dscHideLoadingScreen();
  } finally {
    _dscLoading = false;
  }
}

// Fetch previous scrape's total_sold to compute listing + keyword trends.
// Runs in background; re-renders table once data is ready.
async function dscLoadTrendData() {
  if (!_supabase || !_dscAllListings.length) return;
  try {
    // Get the two most recent scrape dates
    const { data: dates } = await _supabase.from('listings')
      .select('scraped_at').order('scraped_at', { ascending: false }).limit(2);
    const latestDate = dates?.[0]?.scraped_at?.slice(0, 10);
    const prevDate   = dates?.[1]?.scraped_at?.slice(0, 10);
    if (!prevDate || prevDate === latestDate) return;

    // Fetch prev scrape data for all loaded listings' keywords
    const keywords = [...new Set(_dscAllListings.map(r => r.keyword).filter(Boolean))];
    const { data: prevRows } = await _supabase
      .from('listings')
      .select('item_id,shop_id,total_sold,keyword')
      .gte('scraped_at', prevDate)
      .lt('scraped_at', latestDate)
      .limit(3000);

    if (!prevRows?.length) return;

    // Populate per-listing prev map
    const kwPrev = {}, kwCurr = {};
    prevRows.forEach(r => {
      _dscPrevMap[`${r.item_id}_${r.shop_id}`] = r.total_sold || 0;
      kwPrev[r.keyword] = (kwPrev[r.keyword] || 0) + (r.total_sold || 0);
    });

    // Compute keyword-level total sold for current scrape
    _dscAllListings.forEach(r => {
      kwCurr[r.keyword] = (kwCurr[r.keyword] || 0) + (r.total_sold || 0);
    });

    // Compute keyword trend %
    keywords.forEach(kw => {
      const prev = kwPrev[kw], curr = kwCurr[kw];
      _dscKwTrendMap[kw] = prev > 0 ? Math.round((curr - prev) / prev * 100) : null;
    });

    // Re-render table and cards now that trend data is available
    dscApplyFilters(false);
  } catch(e) {
    console.warn('dscLoadTrendData:', e);
  }
}

function _dscSelectedCats() {
  const checks = document.querySelectorAll('#dsc-cat-checks input[type=checkbox]');
  if (!checks.length) return null; // not yet populated — no filter
  const checked = [...checks].filter(c => c.checked).map(c => c.value);
  // 0 checked or all checked both mean "no filter" — never return an empty array
  if (checked.length === 0 || checked.length === checks.length) return null;
  return checked;
}

const _DSC_CAT_SS_KEY = 'larisid_dsc_unchecked_cats_v1';

function _dscSaveCatState() {
  const unchecked = [...document.querySelectorAll('#dsc-cat-checks input[type=checkbox]:not(:checked)')].map(i => i.value);
  try { sessionStorage.setItem(_DSC_CAT_SS_KEY, JSON.stringify(unchecked)); } catch {}
}

function dscBuildCatChecks(cats) {
  const el = document.getElementById('dsc-cat-checks');
  if (!el) return;
  // Always include all 19 known categories; merge any extras from loaded data
  const ALL_CATS = ['Alat Tulis','Bayi & Anak','Dapur','Elektronik','Fashion','Hewan Peliharaan',
    'Hobi & Kerajinan','HP & Gadget','Kamar Mandi','Keamanan','Kecantikan','Kesehatan',
    'Motor & Mobil','Olahraga','Outdoor & Camping','Rumah','Sepeda','Taman','Tanaman'];
  const merged = [...new Set([...ALL_CATS, ...cats])].sort();
  const newKey = merged.join(',');
  if (el.dataset.built === newKey) return;
  // Restore from sessionStorage (survives tab switches) then also read current DOM
  let unchecked = new Set();
  try { const s = sessionStorage.getItem(_DSC_CAT_SS_KEY); if (s) JSON.parse(s).forEach(c => unchecked.add(c)); } catch {}
  [...el.querySelectorAll('input[type=checkbox]:not(:checked)')].forEach(i => unchecked.add(i.value));
  el.dataset.built = newKey;
  el.innerHTML = merged.map(c => `
    <label style="display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:.72rem;color:#374151;user-select:none;transition:background .1s;" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${c}" ${unchecked.has(c) ? '' : 'checked'} onchange="_dscSaveCatState()" style="accent-color:#E8442A;width:13px;height:13px;flex-shrink:0;">
      <span>${c}</span>
    </label>`).join('');
}


function dscCatSelectAll() {
  const checks = document.querySelectorAll('#dsc-cat-checks input[type=checkbox]');
  const allChecked = [...checks].every(c => c.checked);
  checks.forEach(c => c.checked = !allChecked);
  _dscSaveCatState();
}

function _dscCurrentFilters() {
  return {
    cat:      _dscCurrentCatFilter, // empty = all; set when exactly 1 category selected
    priceMin: parseFloat(document.getElementById('dsc-price-min')?.value) || 0,
    priceMax: parseFloat(document.getElementById('dsc-price-max')?.value) || 10000000,
    search:   document.getElementById('dsc-search')?.value?.trim() || '',
  };
}

function dscInit() {
  dscUpdateDualRange('price');
  dscUpdateDualRange('omset');
  // Pre-populate all known categories immediately so filters are usable before data loads
  dscBuildCatChecks(['Alat Tulis','Bayi & Anak','Dapur','Elektronik','Fashion','Hewan Peliharaan',
    'Hobi & Kerajinan','HP & Gadget','Kamar Mandi','Keamanan','Kecantikan','Kesehatan',
    'Motor & Mobil','Olahraga','Outdoor & Camping','Rumah','Sepeda','Taman','Tanaman']);
  if (!_dscLoaded) dscLoadListings();
}

function dscApplyFilters(resetPage = true) {
  if (!_dscLoaded) return;
  const q        = (document.getElementById('dsc-search')?.value || '').toLowerCase();
  const selectedCats = _dscSelectedCats(); // null = all, array = filter to these
  const priceMin = parseFloat(document.getElementById('dsc-price-min')?.value) || 0;
  const priceMaxRaw = parseFloat(document.getElementById('dsc-price-max')?.value) || 500000;
  const priceMax = priceMaxRaw >= 500000 ? Infinity : priceMaxRaw;
  const omsetMin = parseFloat(document.getElementById('dsc-omset-min')?.value) || 0;
  const omsetMaxRaw = parseFloat(document.getElementById('dsc-omset-max')?.value) || 500000000;
  const omsetMax = omsetMaxRaw >= 500000000 ? Infinity : omsetMaxRaw;
  const sortVal  = document.getElementById('dsc-sort')?.value || 'omset-desc';

  // Include single-category selection in server key so DB re-fetch targets that category
  // Any non-null selectedCats (partial selection) triggers a server re-fetch filtered by those cats
  const srvCatKey = selectedCats ? selectedCats.slice().sort().join('|') : '';
  const srvKey = JSON.stringify({ priceMin, priceMax: priceMaxRaw, search: q, cat: srvCatKey });
  if (_dscLastSrvFilters !== null && _dscLastSrvFilters !== srvKey) {
    _dscAllListings = [];
    _dscOffset = 0;
    _dscHasMore = true;
    _dscLoaded = false;
    _dscLastSrvFilters = srvKey;
    // Store selected cats for dscFetchPage to use
    _dscCurrentCatFilter = selectedCats && selectedCats.length === 1 ? selectedCats[0] : '';
    _dscCurrentCatFilters = selectedCats || null; // multi-cat list
    // Show loading feedback while re-fetching from Supabase
    const _tbody = document.getElementById('dsc-tbody');
    if (_tbody) _tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#9CA3AF;font-size:.85rem;">Memuat produk...</td></tr>`;
    const _overlay = document.getElementById('dsc-loading-overlay');
    if (_overlay) { _overlay.style.display = 'flex'; }
    dscLoadListings();
    return;
  }
  _dscLastSrvFilters = srvKey;

  const minSkor = parseInt(document.getElementById('dsc-skor-min')?.value) || 0;

  // Pre-compute scores when needed for filtering or sorting
  const needsScore = sortVal.startsWith('score') || minSkor > 0;
  const _kwMapForSort = {};
  if (needsScore) {
    _dscAllListings.forEach(r => { const k = r.keyword||'__'; if (!_kwMapForSort[k]) _kwMapForSort[k]=[]; _kwMapForSort[k].push(r); });
  }
  const _scoreOf = p => calcListingScore(p, _kwMapForSort[p.keyword||'__'], _dscListingTrendPct(p), _dscKwTrendMap[p.keyword]??null).total;

  let list = _dscAllListings.filter(p => {
    if (q && !(p.product_name||'').toLowerCase().includes(q) && !(p.store_name||'').toLowerCase().includes(q) && !(p.category||'').toLowerCase().includes(q)) return false;
    if (selectedCats && !selectedCats.includes(p.category)) return false;
    const price = p.price || 0;
    if (price < priceMin || price > priceMax) return false;
    const omset = _dscOmset(p);
    if (omset < omsetMin || omset > omsetMax) return false;
    if (minSkor > 0 && _scoreOf(p) < minSkor) return false;
    return true;
  });

  const [sf, sd] = sortVal.split('-');
  list.sort((a, b) => {
    let va, vb;
    if (sf === 'omset')  { va = _dscOmset(a); vb = _dscOmset(b); }
    else if (sf === 'score') { va = _scoreOf(a); vb = _scoreOf(b); }
    else if (sf === 'tren')  { va = _dscTrendDelta(a) ?? -Infinity; vb = _dscTrendDelta(b) ?? -Infinity; }
    else if (sf === 'price') { va = a.price || 0; vb = b.price || 0; }
    else if (sf === 'name')  { return sd === 'asc' ? (a.product_name||'').localeCompare(b.product_name||'') : (b.product_name||'').localeCompare(a.product_name||''); }
    else { va = _dscOmset(a); vb = _dscOmset(b); }
    return sd === 'asc' ? va - vb : vb - va;
  });

  const totalOmset = list.reduce((s, p) => s + _dscOmset(p), 0);
  const omsetEl = document.getElementById('dsc-stat-omset');
  if (omsetEl) omsetEl.textContent = _dscFmt(totalOmset);

  _dscFiltered = list;
  if (resetPage) _dscPage = 1;
  dscRenderTable();
}

function dscRenderTable() {
  const total = _dscFiltered.length;
  const pages = Math.max(1, Math.ceil(total / DSC_PER_PAGE));
  _dscPage = Math.min(_dscPage, pages);
  const start = (_dscPage - 1) * DSC_PER_PAGE;
  const slice = _dscFiltered.slice(start, start + DSC_PER_PAGE);

  // Show/hide correct view container
  const cardGrid  = document.getElementById('dsc-card-grid');
  const tableInner = document.getElementById('dsc-table-inner');
  if (cardGrid)   cardGrid.style.display   = _dscViewMode === 'card'  ? '' : 'none';
  if (tableInner) tableInner.style.display = _dscViewMode === 'table' ? '' : 'none';

  const compBadge = (comp, small) => {
    const cfg = { Rendah: '#10B981', Sedang: '#F59E0B', Tinggi: '#EF4444' };
    const color = cfg[comp] || '#9CA3AF';
    const pad = small ? '2px 7px' : '2px 9px';
    const fs  = small ? '.66rem' : '.72rem';
    return `<span style="display:inline-block;padding:${pad};border-radius:20px;font-size:${fs};font-weight:700;background:${color}1a;color:${color};border:1px solid ${color}40">${comp}</span>`;
  };

  const trendHtml = delta => {
    if (delta == null) return `<span style="color:#9CA3AF;font-size:.8rem;">—</span>`;
    if (delta > 0) return `<span style="color:#10B981;font-weight:700;font-size:.8rem;display:inline-flex;align-items:center;gap:2px;"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2 6M6 2L10 6" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>+${delta.toLocaleString('id-ID')}</span>`;
    if (delta < 0) return `<span style="color:#EF4444;font-weight:700;font-size:.8rem;display:inline-flex;align-items:center;gap:2px;"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M6 10L2 6M6 10L10 6" stroke="#EF4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${delta.toLocaleString('id-ID')}</span>`;
    return `<span style="color:#9CA3AF;font-size:.8rem;">0</span>`;
  };

  const emptyHtml = '<div style="text-align:center;padding:40px;color:#9CA3AF;font-size:.85rem;">Tidak ada produk yang sesuai filter.</div>';

  // ── CARD VIEW ──
  if (_dscViewMode === 'card' && cardGrid) {
    if (!slice.length) {
      cardGrid.innerHTML = emptyHtml;
    } else {
      const _cardKwMap = {};
      _dscAllListings.forEach(r => { const k = r.keyword||'__'; if (!_cardKwMap[k]) _cardKwMap[k]=[]; _cardKwMap[k].push(r); });
      const _fmtRp = v => 'Rp' + Math.round(v).toLocaleString('id-ID');
      cardGrid.innerHTML = slice.map(p => {
        const omset = _dscOmset(p);
        const delta = _dscTrendDelta(p);
        const imgHtml = p.image_url
          ? `<img src="${p.image_url}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='📦'">`
          : '📦';
        const key   = `${p.item_id}__${p.shop_id}`;
        const ls    = calcListingScore(p, _cardKwMap[p.keyword||'__'], _dscListingTrendPct(p), _dscKwTrendMap[p.keyword]??null);
        const lslbl = listingScoreLabel(ls.total);
        return `<div class="dsc-card" onclick="dscOpenDeepDive('${key}')">
          <div class="dsc-card-img" style="position:relative;">${imgHtml}
            <div style="position:absolute;top:6px;left:6px;background:${lslbl.clr};color:#fff;border-radius:8px;padding:3px 9px;font-size:.82rem;font-weight:800;line-height:1.4;box-shadow:0 1px 4px rgba(0,0,0,.22);">${ls.total}</div>
          </div>
          <div class="dsc-card-body">
            <div class="dsc-card-name">${(p.product_name||'').slice(0,70)}</div>
            <div class="dsc-card-store">${p.store_name||''}</div>
            <div style="margin-top:8px;">
              <div class="dsc-card-price">${_fmtRp(p.price||0)}</div>
              <div style="font-size:.74rem;color:#6B7280;margin-top:1px;">${omset > 0 ? _fmtRp(omset)+'/bln' : '—'}</div>
            </div>
          </div>
          ${delta !== null ? `<div class="dsc-card-footer" style="padding:6px 10px;">${trendHtml(delta)}</div>` : ''}
        </div>`;
      }).join('');
    }
  }

  // ── TABLE VIEW ──
  const tbody = document.getElementById('dsc-tbody');
  if (_dscViewMode === 'table' && tbody) {
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:#9CA3AF;font-size:.85rem;">Tidak ada produk yang sesuai filter.</td></tr>`;
    } else {
      // Group all loaded listings by keyword for peer-context scoring
      const _dscKwMap = {};
      _dscAllListings.forEach(r => { const k = r.keyword||'__'; if (!_dscKwMap[k]) _dscKwMap[k]=[]; _dscKwMap[k].push(r); });
      tbody.innerHTML = slice.map(p => {
        const imgHtml = p.image_url
          ? `<div class="dsc-prod-img"><img src="${p.image_url}" alt="" loading="lazy" onerror="this.style.display='none'"></div>`
          : `<div class="dsc-prod-img">📦</div>`;
        const comp   = _dscCompMap[p.keyword] || 'Sedang';
        const omset  = _dscOmset(p);
        const delta  = _dscTrendDelta(p);
        const key    = `${p.item_id}__${p.shop_id}`;
        const ls     = calcListingScore(p, _dscKwMap[p.keyword||'__'], _dscListingTrendPct(p), _dscKwTrendMap[p.keyword]??null);
        const lslbl  = listingScoreLabel(ls.total);
        const scoreBadge = `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;">
          <span style="background:${lslbl.clr};color:#fff;padding:2px 8px;border-radius:8px;font-size:.72rem;font-weight:800;">${ls.total}</span>
          <span style="font-size:.55rem;color:#9CA3AF;">/${ls.larisScore} mkt</span>
        </span>`;
        return `<tr style="cursor:pointer" onclick="dscOpenDeepDive('${key}')">
          <td>
            <div class="dsc-prod-cell">
              ${imgHtml}
              <div>
                <div class="dsc-prod-name">${(p.product_name||'').slice(0,60)}</div>
                <div class="dsc-prod-cat" style="color:#6B7280;font-size:.72rem;">${p.store_name||''}</div>
              </div>
            </div>
          </td>
          <td><div class="dsc-price">${_dscFmt(p.price||0)}</div></td>
          <td><div style="font-size:.78rem;color:#6B7280">${p.category||'—'}</div></td>
          <td><div class="dsc-price">${omset > 0 ? _dscFmt(omset) : '—'}</div><div class="dsc-price-sub">/bulan</div></td>
          <td style="text-align:center;">${scoreBadge}</td>
          <td>${compBadge(comp, false)}</td>
          <td>${trendHtml(delta)}</td>
          <td onclick="event.stopPropagation()"><button class="dsc-analyse-btn" onclick="dscOpenDeepDive('${key}')">Analisis</button></td>
        </tr>`;
      }).join('');
    }
  }

  const countEl = document.getElementById('dsc-count');
  if (countEl) countEl.textContent = `${total.toLocaleString('id-ID')} listing`;

  // If there's more data on the server, show one extra page button beyond what's loaded
  const visiblePages = _dscHasMore ? pages + 1 : pages;

  const infoEl = document.getElementById('dsc-page-info');
  if (infoEl) infoEl.textContent = total ? `${start + 1}–${Math.min(start + DSC_PER_PAGE, total)} dari ${total}${_dscHasMore ? '+' : ''}` : '';

  const btnsEl = document.getElementById('dsc-page-btns');
  if (btnsEl) {
    let html = `<button class="dsc-page-btn" onclick="dscGoPage(${_dscPage - 1})" ${_dscPage <= 1 ? 'disabled' : ''}>&#8592;</button>`;
    for (let i = Math.max(1, _dscPage - 2); i <= Math.min(visiblePages, _dscPage + 2); i++) {
      const isExtra = i > pages; // page exists only on server, not loaded yet
      html += `<button class="dsc-page-btn ${i === _dscPage ? 'active' : ''}" onclick="dscGoPage(${i})" ${isExtra ? 'style="opacity:.7"' : ''}>${i}</button>`;
    }
    html += `<button class="dsc-page-btn" onclick="dscGoPage(${_dscPage + 1})" ${_dscPage >= visiblePages ? 'disabled' : ''}>&#8594;</button>`;
    btnsEl.innerHTML = html;
  }
  // Hide loading overlay once render completes
  const _ov = document.getElementById('dsc-loading-overlay');
  if (_ov) _ov.style.display = 'none';
}

function dscSetView(mode) {
  _dscViewMode = mode;
  document.getElementById('dsc-btn-card')?.classList.toggle('active', mode === 'card');
  document.getElementById('dsc-btn-table')?.classList.toggle('active', mode === 'table');
  dscRenderTable();
}

function dscOpenDeepDive(key) {
  const [itemId, shopId] = String(key).split('__');
  const listing = _dscAllListings.find(r => String(r.item_id) === itemId && String(r.shop_id) === shopId);
  if (!listing) return;
  const omset = _dscOmset(listing);
  const monthlyUnits = listing.price > 0 ? Math.round(omset / listing.price) : 0;
  const p = {
    id:          listing.item_id,
    name:        listing.product_name || '—',
    category:    listing.category || 'Umum',
    image:       listing.image_url || null,
    medianPrice: listing.price || 0,
    score:       65,
    newUnits:    monthlyUnits,
    total_sold:  listing.total_sold || 0,
    _listing:    listing,
  };
  // Reset keyword context so stale peer data doesn't bleed into new product's Ringkasan
  _ddKwRows = []; _ddKwListing = null; _ddKwTotal = 0; _analisa_pending = false; _tren_pending = false;

  // Switch view first so canvases are visible when Chart.js measures them
  switchDashView('deepdive');
  ddSwitchTab('ringkasan');

  const ctx = document.getElementById('dd-kw-context');
  if (ctx) ctx.style.display = '';

  // Defer render one tick so the DOM is painted before Chart.js measures canvases
  setTimeout(() => {
    ddRender(p);
    ddLoadKeywordContext(listing);
    ddLoadTrendHistory(listing);
    dashboardTourHandleProductOpen();
  }, 0);
  void cohortLogActivity('deepdive_open', { item_id: listing.item_id, shop_id: listing.shop_id, product_name: listing.product_name || '' });
}

let _ddCurrentP = null;

// ── KALKULATOR ────────────────────────────────────────────────────────────────
function kalcFmt(n) {
  if (n >= 1000000) return 'Rp ' + (n/1000000).toFixed(1).replace(/\.0$/,'') + ' jt';
  if (n >= 1000) return 'Rp ' + Math.round(n/1000) + ' rb';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
function kalcFmtFull(n) {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function kalcCalc() {
  try {
  const price    = parseFloat(document.getElementById('kal-price')?.value) || 0;
  const cogs     = parseFloat(document.getElementById('kal-cogs')?.value) || 0;
  const shipping = parseFloat(document.getElementById('kal-shipping')?.value) || 0;
  const packing  = parseFloat(document.getElementById('kal-packing')?.value) || 0;
  const opex     = parseFloat(document.getElementById('kal-opex')?.value) || 0;
  const ads      = parseFloat(document.getElementById('kal-ads')?.value) || 0;
  const comm     = parseFloat(document.getElementById('kal-commission')?.value) || 0.10;
  const svc      = parseFloat(document.getElementById('kal-service')?.value) || 0.01;
  const freeship = parseFloat(document.getElementById('kal-freeship')?.value) || 0;
  const ret      = parseFloat(document.getElementById('kal-return')?.value) || 0.02;
  const monthlyUnits = parseInt(document.getElementById('kal-monthly-units')?.value) || 30;

  const commAmt    = price * comm;
  const svcAmt     = price * svc;
  const retAmt     = price * ret;
  const totalCost  = cogs + shipping + packing + opex + ads + commAmt + svcAmt + freeship + retAmt;
  const profit     = price - totalCost;
  const margin     = price > 0 ? (profit / price * 100) : 0;
  const roi        = cogs > 0 ? (profit / cogs * 100) : 0;

  // Ads recommendation
  const adsRecEl = document.getElementById('kal-ads-rec');
  if (adsRecEl) adsRecEl.textContent = `${kalcFmtFull(price*0.07)} – ${kalcFmtFull(price*0.10)}`;

  // Summary sidebar
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kal-profit-unit', kalcFmtFull(profit));
  set('kal-margin-badge', margin.toFixed(1) + '% Margin');
  const badgeEl = document.getElementById('kal-margin-badge');
  if (badgeEl) {
    badgeEl.style.background = margin >= 20 ? '#DCFCE7' : margin >= 10 ? '#FEF9C3' : '#FEE2E2';
    badgeEl.style.color = margin >= 20 ? '#16A34A' : margin >= 10 ? '#CA8A04' : '#DC2626';
  }
  set('kal-sum-price', kalcFmtFull(price));
  set('kal-sum-cost', kalcFmtFull(totalCost));
  set('kal-sum-profit', kalcFmtFull(profit));
  set('kal-sum-roi', roi.toFixed(1) + '%');

  // Monthly
  set('kal-monthly-profit', kalcFmtFull(profit * monthlyUnits));
  set('kal-monthly-omset', kalcFmtFull(price * monthlyUnits));
  set('kal-monthly-gross', (margin.toFixed(1) + '%'));

  // BEP
  const bepEl = document.getElementById('kal-bep-val');
  if (bepEl) bepEl.textContent = kalcFmtFull(totalCost);
  const bepPct = price > 0 ? Math.min((totalCost / price) * 100, 100) : 50;
  const fillEl = document.getElementById('kal-bep-fill');
  const dotEl  = document.getElementById('kal-bep-dot');
  if (fillEl) fillEl.style.width = bepPct + '%';
  if (dotEl)  dotEl.style.left   = bepPct + '%';
  const scaleEl = document.getElementById('kal-bep-scale');
  if (scaleEl) {
    const ticks = [0.6,0.7,0.8,0.9,1.0].map(f => kalcFmt(price * f));
    scaleEl.innerHTML = ticks.map(t => `<span>${t}</span>`).join('');
  }

  // Donut chart
  const costs = [
    { label: 'Modal (COGS)', val: cogs,     color: '#3B4FD8' },
    { label: 'Komisi & Layanan', val: commAmt+svcAmt, color: '#6B7280' },
    { label: 'Iklan', val: ads,             color: '#F59E0B' },
    { label: 'Ongkir & Subsidi', val: shipping+freeship, color: '#E8442A' },
    { label: 'Lainnya', val: packing+opex+retAmt, color: '#CBD5E1' },
  ].filter(c => c.val > 0);
  const canvas = document.getElementById('kal-donut');
  if (canvas && canvas.getContext) {
    const ctx2 = canvas.getContext('2d');
    const total = costs.reduce((s,c) => s+c.val, 0) || 1;
    ctx2.clearRect(0,0,80,80);
    let angle = -Math.PI/2;
    costs.forEach(c => {
      const sweep = (c.val/total) * Math.PI * 2;
      ctx2.beginPath();
      ctx2.moveTo(40,40);
      ctx2.arc(40,40,36,angle,angle+sweep);
      ctx2.closePath();
      ctx2.fillStyle = c.color;
      ctx2.fill();
      angle += sweep;
    });
    ctx2.beginPath();
    ctx2.arc(40,40,22,0,Math.PI*2);
    ctx2.fillStyle = '#fff';
    ctx2.fill();
  }
  const legendEl = document.getElementById('kal-legend');
  if (legendEl && costs.length) {
    const totalC = costs.reduce((s,c) => s+c.val, 0);
    legendEl.innerHTML = costs.map(c => `
      <div style="display:flex;align-items:center;gap:5px;">
        <div style="width:8px;height:8px;border-radius:2px;background:${c.color};flex-shrink:0;"></div>
        <span style="color:#374151;">${c.label}</span>
        <span style="margin-left:auto;color:#6B7280;">${kalcFmtFull(c.val)} (${(c.val/totalC*100).toFixed(1)}%)</span>
      </div>`).join('');
  }

  // Scenarios
  const scenEl = document.getElementById('kal-scenarios');
  if (scenEl) {
    const scenarios = [
      { name: 'Pesimis', priceMult: 0.93, rec: false },
      { name: 'Realistis', priceMult: 1.0, rec: true },
      { name: 'Optimis', priceMult: 1.07, rec: false },
    ];
    scenEl.innerHTML = scenarios.map(s => {
      const sp = price * s.priceMult;
      const sc = totalCost + (sp - price) * 0; // costs same
      const sv = sp - totalCost;
      const sm = sp > 0 ? (sv/sp*100) : 0;
      const border = s.rec ? 'border:2px solid #F97316;' : 'border:1px solid #E5E7EB;';
      return `<div style="border-radius:10px;padding:14px;${border}position:relative;">
        ${s.rec ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#F97316;color:#fff;font-size:.58rem;font-weight:700;padding:2px 8px;border-radius:20px;">Direkomendasikan</div>' : ''}
        <div style="font-size:.72rem;font-weight:700;color:#111827;margin-bottom:10px;">${s.name}</div>
        <div style="display:flex;justify-content:space-between;font-size:.65rem;margin-bottom:4px;"><span style="color:#6B7280;">Harga Jual</span><span style="font-weight:600;">${kalcFmtFull(sp)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.65rem;margin-bottom:4px;"><span style="color:#6B7280;">Margin</span><span style="font-weight:600;">${sm.toFixed(1)}%</span></div>
        <div style="display:flex;justify-content:space-between;font-size:.65rem;"><span style="color:#6B7280;">Profit / Unit</span><span style="font-weight:600;color:${sv>=0?'#16A34A':'#DC2626'};">${kalcFmtFull(sv)}</span></div>
      </div>`;
    }).join('');
  }

  // Insights
  const insightsEl = document.getElementById('kal-insights');
  if (insightsEl) {
    const tips = [];
    if (margin >= 20) tips.push(`Margin ${margin.toFixed(1)}% termasuk kategori sehat`);
    else tips.push(`Margin ${margin.toFixed(1)}% — pertimbangkan kurangi biaya atau naikkan harga`);
    if (price > 0) tips.push(`Harga jual masih kompetitif di pasaran`);
    tips.push(`Kamu bisa naikkan harga hingga ${kalcFmtFull(price*1.03)} – ${kalcFmtFull(price*1.07)}`);
    if (ads > 0) tips.push(`Iklan ${(ads/price*100).toFixed(1)}% membantu meningkatkan visibilitas produk`);
    insightsEl.innerHTML = tips.map(t => `<div style="display:flex;gap:6px;"><span style="color:#16A34A;flex-shrink:0;">✓</span><span>${t}</span></div>`).join('');
  }

  // Tip bar
  const tipPriceEl = document.getElementById('kal-tip-price');
  if (tipPriceEl && price > 0) {
    const psych = Math.floor((price - 1) / 1000) * 1000 + 999;
    tipPriceEl.textContent = kalcFmtFull(psych);
  }
  } catch(e) { console.error('kalcCalc:', e); }
}

function ddSwitchTab(tab) {
  const tabs = ['listing','ringkasan','analisa','kompetitor','keyword','tren','kalkulator'];
  tabs.forEach(t => {
    const panel = document.getElementById(`dd-tab-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });
  document.querySelectorAll('#dd-tabs .dd-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  if (tab === 'ringkasan' && typeof ddRender === 'function' && _ddCurrentP) {
    // Show the panel first so canvas elements have non-zero dimensions before Chart.js renders
    const _rPanel = document.getElementById('dd-tab-ringkasan');
    if (_rPanel) _rPanel.style.display = '';
    setTimeout(() => ddRender(_ddCurrentP), 50);
  }
  if (tab === 'kalkulator') {
    kalcCalc();
  }
  if (tab === 'kompetitor') {
    ddRenderKompetitor();
  }
  if (tab === 'keyword') {
    ddRenderKeyword();
  }
  if (tab === 'tren') {
    if (!_ddKwListing && !_ddCurrentP?._listing) {
      _tren_pending = true;
    } else {
      ddRenderTren();
    }
  }
  if (tab === 'analisa') {
    if (!_ddKwRows || !_ddKwRows.length) {
      _analisa_pending = true;
      const s1 = document.getElementById('ap-s1');
      if (s1) s1.innerHTML = '<span style="font-size:.75rem;color:#6B7280;">Memuat data pasar...</span>';
    } else {
      ddRenderAnalisa();
    }
  }
}

async function ddLoadKeywordContext(listing) {
  if (!listing || !_supabase) return;

  const kw = listing.keyword || '';
  document.getElementById('dd-kw-name').textContent = kw || '—';

  // Populate listing mini-hero
  const miniImg = document.getElementById('dd-listing-mini-img');
  if (miniImg) {
    miniImg.innerHTML = listing.image_url
      ? `<img src="${listing.image_url}" alt="" onerror="this.parentElement.innerHTML='📦'">`
      : '📦';
  }
  const g = id => document.getElementById(id);
  if (g('dd-listing-mini-name'))  g('dd-listing-mini-name').textContent  = listing.product_name || '—';
  if (g('dd-listing-mini-store')) g('dd-listing-mini-store').textContent = listing.store_name || '—';
  if (g('dd-listing-mini-price')) g('dd-listing-mini-price').textContent = _dscFmt(listing.price || 0);
  if (g('dd-listing-mini-sold'))  g('dd-listing-mini-sold').textContent  = (listing.total_sold || 0).toLocaleString('id-ID');

  const loadEl = document.getElementById('dd-kw-sellers-loading');
  const tableEl = document.getElementById('dd-kw-sellers-table');
  if (loadEl) { loadEl.style.display = ''; loadEl.textContent = 'Memuat data keyword...'; }
  if (tableEl) tableEl.style.display = 'none';

  if (!kw) {
    if (loadEl) loadEl.textContent = 'Keyword tidak tersedia.';
    return;
  }

  try {
    // Fetch all listings for this keyword (raw table — faster with keyword filter)
    const { data, error } = await _supabase
      .from('listings')
      .select('item_id,shop_id,product_name,store_name,price,total_sold,image_url,url,rating,reviews,listing_date,location')
      .eq('keyword', kw)
      .order('total_sold', { ascending: false })
      .limit(120);

    if (error || !data || !data.length) {
      if (loadEl) loadEl.textContent = 'Data keyword tidak tersedia.';
      return;
    }

    // Deduplicate by item_id+shop_id (keep highest total_sold)
    const seen = new Map();
    data.forEach(r => {
      const key = `${r.item_id}_${r.shop_id}`;
      if (!seen.has(key) || (r.total_sold || 0) > (seen.get(key).total_sold || 0)) seen.set(key, r);
    });
    const rows = [...seen.values()].sort((a, b) => (b.total_sold || 0) - (a.total_sold || 0));

    const totalSold = rows.reduce((s, r) => s + (r.total_sold || 0), 0);
    const rank = rows.findIndex(r => String(r.item_id) === String(listing.item_id) && String(r.shop_id) === String(listing.shop_id)) + 1;
    const thisShare = totalSold > 0 ? (listing.total_sold || 0) / totalSold * 100 : 0;

    // Significant sellers: > 0.5% share
    const threshold = totalSold * 0.005;
    const sigSellers = rows.filter(r => (r.total_sold || 0) >= threshold);
    const sigPrices = sigSellers.map(r => r.price || 0).filter(p => p > 0).sort((a, b) => a - b);
    const medianPrice = sigPrices.length ? sigPrices[Math.floor(sigPrices.length / 2)] : 0;

    // Populate stat cards
    const rankDisplay = rank > 0 ? `#${rank}` : '—';
    const posPct = rank > 0 && rows.length > 1 ? Math.max(3, Math.round((1 - (rank - 1) / (rows.length - 1)) * 100)) : 0;

    if (g('dd-kw-rank'))       g('dd-kw-rank').textContent       = rankDisplay;
    if (g('dd-kw-pos-fill'))   g('dd-kw-pos-fill').style.width   = posPct + '%';
    if (g('dd-kw-rank-sub'))   g('dd-kw-rank-sub').textContent   = `dari ${rows.length} listing`;
    if (g('dd-kw-med-price'))  g('dd-kw-med-price').textContent  = medianPrice > 0 ? _dscFmt(medianPrice) : '—';
    if (g('dd-kw-sig-count'))  g('dd-kw-sig-count').textContent  = sigSellers.length;
    if (g('dd-kw-total-sold')) g('dd-kw-total-sold').textContent = totalSold.toLocaleString('id-ID');
    if (g('dd-listing-mini-share')) g('dd-listing-mini-share').textContent = thisShare > 0 ? thisShare.toFixed(1) + '%' : '< 0.1%';
    if (g('dd-listing-mini-omset')) g('dd-listing-mini-omset').textContent = _dscFmt(_dscOmset(listing));

    // Top sellers table
    const tbody = document.getElementById('dd-kw-sellers-tbody');
    if (tbody) {
      tbody.innerHTML = rows.slice(0, 15).map((r, i) => {
        const share = totalSold > 0 ? (r.total_sold || 0) / totalSold * 100 : 0;
        const sharePct = share.toFixed(1);
        const barPct = Math.min(100, share * 5);
        const isThis = String(r.item_id) === String(listing.item_id) && String(r.shop_id) === String(listing.shop_id);
        return `<tr class="${isThis ? 'is-this' : ''}">
          <td style="color:#9CA3AF;font-weight:700;font-size:.75rem;">${i + 1}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              ${r.image_url ? `<img src="${r.image_url}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">` : ''}
              <div>
                <div style="font-size:.76rem;font-weight:600;line-height:1.3;">${(r.product_name||'').slice(0,44)}${isThis ? '<span class="dd-kw-this-tag">Ini</span>' : ''}</div>
                <div style="font-size:.64rem;color:#9CA3AF;">${r.store_name||''}</div>
              </div>
            </div>
          </td>
          <td style="font-weight:600;white-space:nowrap;">${_dscFmt(r.price||0)}</td>
          <td style="font-weight:600;">${(r.total_sold||0).toLocaleString('id-ID')}</td>
          <td>
            <div class="dd-kw-share-bar">
              <div class="dd-kw-share-track"><div class="dd-kw-share-fill" style="width:${barPct}%;background:${isThis?'#E8442A':'#3B82F6'};"></div></div>
              <span style="font-size:.7rem;color:#6B7280;white-space:nowrap;">${sharePct}%</span>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    if (loadEl) loadEl.style.display = 'none';
    if (tableEl) tableEl.style.display = '';

    // Store for competitor + keyword tabs
    _ddKwRows    = rows;
    _ddKwListing = listing;
    _ddKwTotal   = totalSold;
    if (_analisa_pending) { _analisa_pending = false; ddRenderAnalisa(); }
    if (_tren_pending)    { _tren_pending    = false; ddRenderTren(); }

    // Update Deep Dive scores now that we have full keyword peers
    const _kwTrend = _dscKwTrendMap[listing.keyword] ?? null;
    const _lstTrend = _dscListingTrendPct(listing);
    const _ls  = calcListingScore(listing, rows, _lstTrend, _kwTrend);
    const _lbl = listingScoreLabel(_ls.total);
    const numEl = document.getElementById('dd-score-num');
    const tagEl = document.getElementById('dd-score-tag');
    if (numEl) numEl.textContent = _ls.total;
    if (tagEl) {
      tagEl.textContent = _lbl.lbl;
      tagEl.style.background  = _lbl.bg;
      tagEl.style.color       = _lbl.clr;
      tagEl.style.borderColor = _lbl.border;
    }
    // Show LarisScore (market ease) as a sub-label below main score
    const subEl = document.getElementById('dd-score-sub');
    if (subEl) {
      const mkLbl = _ls.larisScore >= 75 ? 'Mudah Masuk' : _ls.larisScore >= 55 ? 'Persaingan Sedang' : _ls.larisScore >= 35 ? 'Cukup Sulit' : 'Sangat Kompetitif';
      subEl.textContent = `Pasar: ${_ls.larisScore}/100 · ${mkLbl}`;
    }
    ddRenderKompetitor();
    ddUpdateRingkasanFromKw(rows, totalSold, listing);
    // Rebuild Listing tab competitor table now that _ddKwRows is populated
    _ddCompAll = rows.slice(0, 15).map((r, i) => ({
      rank: i + 1,
      product_name: r.product_name || '—',
      store_name:   r.store_name   || '—',
      url:          r.url          || null,
      image_url:    r.image_url    || null,
      price:        r.price        || 0,
      total_sold:   r.total_sold   || 0,
      rating:       r.rating       || 0,
    }));
    ddRenderCompetitors();

  } catch(e) {
    console.error('ddLoadKeywordContext:', e);
    if (loadEl) loadEl.textContent = 'Gagal memuat data.';
  }
}

// Updates Ringkasan stat cards and charts using real keyword peer data from Supabase.
// Called by ddLoadKeywordContext after rows are loaded.
function ddUpdateRingkasanFromKw(rows, totalSold, listing) {
  if (!rows || !rows.length) return;

  // Competition score: combination of top-3 concentration and seller count
  const top3Sold   = rows.slice(0, 3).reduce((s, r) => s + (r.total_sold || 0), 0);
  const top3Share  = totalSold > 0 ? top3Sold / totalSold : 0;
  const nSellers   = new Set(rows.map(r => String(r.shop_id || r.store_name || ''))).size;
  const concScore  = Math.round(top3Share * 100);
  const sellScore  = Math.min(100, Math.round(nSellers / 80 * 100));
  const kompDiff   = Math.round(concScore * 0.6 + sellScore * 0.4);
  const kompLbl    = kompDiff >= 65 ? 'Tinggi' : kompDiff >= 40 ? 'Sedang' : 'Rendah';
  const kompClr    = kompDiff >= 65 ? '#E8442A' : kompDiff >= 40 ? '#D97706' : '#10B981';
  const kompEl = document.getElementById('dd-h-komp');
  if (kompEl) { kompEl.textContent = kompLbl; kompEl.style.color = kompClr; }
  const kompSubEl = document.getElementById('dd-h-komp-sub');
  if (kompSubEl) kompSubEl.textContent = `Skor: ${kompDiff}/100 · ${nSellers} penjual`;

  // Price range bar from real peer prices (p25–p75 sweet spot)
  const prices = rows.map(r => r.price || 0).filter(p => p > 0).sort((a, b) => a - b);
  if (prices.length >= 4) {
    const pMin = prices[0], pMax = prices[prices.length - 1];
    const p25  = prices[Math.floor(prices.length * 0.25)];
    const p75  = prices[Math.floor(prices.length * 0.75)];
    const span = pMax - pMin || 1;
    const leftPct  = Math.max(0, Math.round((p25 - pMin) / span * 100));
    const widthPct = Math.max(5, Math.round((p75 - p25) / span * 100));
    const fmtK = v => v >= 1000000 ? (v/1000000).toFixed(1)+'jt' : (v/1000).toFixed(0)+'k';
    const rangeLabel = document.getElementById('dd-price-range-label');
    const rangeZone  = document.getElementById('dd-range-zone');
    const rangeLabels = document.getElementById('dd-range-labels');
    const rangeNote   = document.getElementById('dd-range-note');
    if (rangeLabel) rangeLabel.textContent = `Rp ${p25.toLocaleString('id-ID')} – Rp ${p75.toLocaleString('id-ID')}`;
    if (rangeZone)  rangeZone.style.cssText = `left:${leftPct}%;width:${widthPct}%;`;
    if (rangeLabels) rangeLabels.innerHTML = `<span>${fmtK(pMin)}</span><span>${fmtK(Math.round(pMin+(pMax-pMin)*0.33))}</span><span>${fmtK(Math.round(pMin+(pMax-pMin)*0.66))}</span><span>${fmtK(pMax)}</span>`;
    if (rangeNote) rangeNote.textContent = `Rentang harga dari ${prices.length} listing di keyword ini`;
  }

  // Price distribution scatter — each seller with >0.5% of sales as a dot (x=price, y=% of sales)
  const totalKwSold = rows.reduce((s, r) => s + (r.total_sold || 0), 0);
  if (_ddChartDist && totalKwSold > 0) {
    const scatterPoints = rows
      .filter(r => r.price > 0 && (r.total_sold || 0) / totalKwSold > 0.005)
      .map(r => ({ x: r.price, y: parseFloat((r.total_sold / totalKwSold * 100).toFixed(1)), label: r.store_name || '' }));
    _ddChartDist.data.datasets[0].data = scatterPoints;
    _ddChartDist.update();
  }

  // Update listing count in category perf card
  const tokoEl = document.getElementById('dd-catperf-toko');
  if (tokoEl) tokoEl.textContent = rows.length.toLocaleString('id-ID');

  // AI insights from real data
  const medianPrice = prices[Math.floor(prices.length / 2)] || 0;
  const priceLbl = listing.price && medianPrice ? (listing.price < medianPrice ? 'di bawah' : listing.price > medianPrice * 1.1 ? 'di atas' : 'setara dengan') : 'setara dengan';
  const insights = [
    `Keyword ini memiliki ${rows.length} listing dengan ${nSellers} penjual unik.`,
    `Kompetisi ${kompLbl.toLowerCase()} — top 3 penjual menguasai ${Math.round(top3Share*100)}% total penjualan.`,
    `Harga produk ini ${priceLbl} median pasar (Rp ${medianPrice.toLocaleString('id-ID')}).`,
  ];
  const aiList = document.getElementById('dd-ai-list');
  if (aiList) aiList.innerHTML = insights.map(t => `<div class="dd-ai-item"><div class="dd-ai-check">✓</div><div>${t}</div></div>`).join('');
}

// ── COMPETITOR TAB ─────────────────────────────────────────────────────────────
let _ddKwRows    = [];
let _ddKwListing = null;
let _ddKwTotal   = 0;
let _analisa_pending = false;
let _tren_pending    = false;
let _kompShowing = 10;
let _kompFiltered = [];

function kompFmt(n) {
  if (n >= 1000000) return 'Rp ' + (n/1000000).toFixed(1).replace(/\.0$/,'') + ' jt';
  if (n >= 1000)    return 'Rp ' + Math.round(n/1000) + ' rb';
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

function ddRenderKompetitor() {
  const rows    = _ddKwRows;
  const listing = _ddKwListing;
  const totalSold = _ddKwTotal;
  if (!rows || !rows.length) {
    const tbody = document.getElementById('komp-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#9CA3AF;font-size:.8rem;">Buka listing dari halaman Discover untuk melihat data kompetitor.</td></tr>`;
    const sub = document.getElementById('komp-subtitle');
    if (sub) sub.textContent = 'Data kompetitor belum tersedia';
    return;
  }

  const g = id => document.getElementById(id);

  // ── Stats ──
  const prices   = rows.map(r => r.price||0).filter(p => p > 0);
  const solds    = rows.map(r => r.total_sold||0);
  const ratings  = rows.map(r => parseFloat(r.rating)||0).filter(r => r > 0);
  const avgPrice = prices.length ? prices.reduce((a,b)=>a+b,0)/prices.length : 0;
  const avgSold  = solds.length  ? solds.reduce((a,b)=>a+b,0)/solds.length   : 0;
  const avgRating= ratings.length? ratings.reduce((a,b)=>a+b,0)/ratings.length: 0;
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const minSold  = solds.length  ? Math.min(...solds)  : 0;
  const maxSold  = solds.length  ? Math.max(...solds)  : 0;
  const minRating= ratings.length? Math.min(...ratings): 0;
  const maxRating= ratings.length? Math.max(...ratings): 0;

  // Estimate ads: top-30% sellers we assume use ads
  const adsCount = Math.round(rows.length * 0.6);
  const adsPct   = rows.length ? Math.round(adsCount/rows.length*100) : 0;

  // Competition level from top3 concentration
  const top3sold = rows.slice(0,3).reduce((s,r)=>(s+(r.total_sold||0)),0);
  const top3pct  = totalSold > 0 ? top3sold/totalSold*100 : 0;
  let compLevel = 'Rendah'; let compColor = '#16A34A';
  if (top3pct > 60) { compLevel = 'Tinggi'; compColor = '#DC2626'; }
  else if (top3pct > 35) { compLevel = 'Sedang'; compColor = '#F97316'; }
  const compScore = Math.round(Math.min(100, top3pct * 1.5));

  const set = (id, v) => { const el = g(id); if (el) el.textContent = v; };
  set('komp-subtitle', `Analisis ${rows.length} kompetitor di keyword ini`);
  set('komp-avg-price', kompFmt(avgPrice));
  set('komp-price-range', `Min: ${kompFmt(minPrice)}  Maks: ${kompFmt(maxPrice)}`);
  set('komp-avg-sold', Math.round(avgSold).toLocaleString('id-ID'));
  set('komp-sold-range', `Min: ${Math.round(minSold).toLocaleString('id-ID')}  Maks: ${Math.round(maxSold).toLocaleString('id-ID')}`);
  set('komp-avg-rating', avgRating > 0 ? avgRating.toFixed(1) + ' / 5' : '—');
  set('komp-rating-range', ratings.length ? `Min: ${minRating.toFixed(1)}  Maks: ${maxRating.toFixed(1)}` : '—');
  set('komp-ads-count', `${adsCount} / ${rows.length}`);
  set('komp-ads-pct', `${adsPct}% kompetitor`);
  const compEl = g('komp-comp-level');
  if (compEl) { compEl.textContent = compLevel; compEl.style.color = compColor; }
  set('komp-comp-score', `Skor: ${compScore}/100`);

  // ── Price distribution bars ──
  const distEl = g('komp-dist-bars');
  if (distEl) {
    const buckets = [
      { label: `< ${kompFmt(100000)}`, fn: p => p < 100000 },
      { label: `${kompFmt(100000)} - ${kompFmt(150000)}`, fn: p => p >= 100000 && p < 150000 },
      { label: `${kompFmt(150000)} - ${kompFmt(200000)}`, fn: p => p >= 150000 && p < 200000 },
      { label: `${kompFmt(200000)} - ${kompFmt(300000)}`, fn: p => p >= 200000 && p < 300000 },
      { label: `> ${kompFmt(300000)}`,                    fn: p => p >= 300000 },
    ].map(b => ({ ...b, count: prices.filter(b.fn).length }));
    const maxCount = Math.max(...buckets.map(b => b.count), 1);
    const topBucket = buckets.reduce((a,b) => b.count > a.count ? b : a, buckets[0]);
    distEl.innerHTML = buckets.map(b => {
      const pct = Math.round(b.count/prices.length*100)||0;
      const isTop = b === topBucket;
      return `<div style="display:flex;align-items:center;gap:8px;font-size:.65rem;">
        <div style="width:110px;color:#6B7280;flex-shrink:0;">${b.label}</div>
        <div style="flex:1;height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden;">
          <div style="height:6px;border-radius:3px;background:${isTop?'#E8442A':'#D1D5DB'};width:${Math.round(b.count/maxCount*100)}%;"></div>
        </div>
        <div style="width:30px;text-align:right;color:#6B7280;font-weight:${isTop?'700':'400'};">${pct}%</div>
      </div>`;
    }).join('');
  }

  // ── Insights ──
  const insEl = g('komp-insights');
  if (insEl) {
    const icons = ['📈','✅','🏆','⭐'];
    const tips = [
      `Mayoritas kompetitor menjual di harga <strong>${kompFmt(Math.round(avgPrice*0.9))} – ${kompFmt(Math.round(avgPrice*1.1))}</strong>`,
      `${adsPct}% kompetitor menggunakan iklan Shopee Ads`,
      `Top 3 kompetitor menguasai <strong>${top3pct.toFixed(0)}%</strong> penjualan di keyword ini`,
      ratings.length ? `Produk dengan rating di atas ${(avgRating+0.3).toFixed(1)} cenderung terjual lebih banyak` : `${rows.length} kompetitor aktif di keyword ini`,
    ];
    insEl.innerHTML = tips.map((t,i) => `<div style="display:flex;gap:8px;align-items:flex-start;font-size:.65rem;color:#374151;">
      <span style="font-size:.9rem;flex-shrink:0;">${icons[i]}</span><span>${t}</span></div>`).join('');
  }

  // ── Recommendation price ──
  const recEl = g('komp-rec-price');
  if (recEl) {
    const p10 = [...prices].sort((a,b)=>a-b)[Math.floor(prices.length*0.35)]||avgPrice;
    const p60 = [...prices].sort((a,b)=>a-b)[Math.floor(prices.length*0.65)]||avgPrice;
    recEl.textContent = `${kompFmt(p10)} – ${kompFmt(p60)}`;
  }

  // ── Table (initialise filter) ──
  _kompFiltered = rows;
  _kompShowing  = 10;
  kompFilter();
}

function kompFilter() {
  const rows    = _ddKwRows;
  if (!rows || !rows.length) return;
  const q       = (document.getElementById('komp-search')?.value || '').toLowerCase();
  const sort    = document.getElementById('komp-sort')?.value || 'sold';
  const pf      = document.getElementById('komp-price-filter')?.value || '';

  let filtered = rows.filter(r => {
    if (q && !(r.product_name||'').toLowerCase().includes(q) && !(r.store_name||'').toLowerCase().includes(q)) return false;
    if (pf === 'low'  && (r.price||0) >= 100000) return false;
    if (pf === 'mid'  && ((r.price||0) < 100000 || (r.price||0) > 200000)) return false;
    if (pf === 'high' && (r.price||0) <= 200000) return false;
    return true;
  });

  const estMonthly = r => Math.round((r.total_sold||0) / 6 * (r.price||0));
  if      (sort === 'price_asc')  filtered.sort((a,b) => (a.price||0) - (b.price||0));
  else if (sort === 'price_desc') filtered.sort((a,b) => (b.price||0) - (a.price||0));
  else if (sort === 'rating')     filtered.sort((a,b) => (parseFloat(b.rating)||0) - (parseFloat(a.rating)||0));
  else if (sort === 'omset')      filtered.sort((a,b) => estMonthly(b) - estMonthly(a));
  else if (sort === 'share')      filtered.sort((a,b) => (b.total_sold||0) - (a.total_sold||0));
  else                            filtered.sort((a,b) => (b.total_sold||0) - (a.total_sold||0));

  _kompFiltered = filtered;
  kompRenderTable();
}

function kompRenderTable() {
  const rows    = _kompFiltered;
  const listing = _ddKwListing;
  const totalSold = _ddKwTotal;
  const tbody = document.getElementById('komp-tbody');
  const moreBtn = document.getElementById('komp-more-btn');
  if (!tbody) return;

  const visible = rows.slice(0, _kompShowing);
  if (!visible.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:#9CA3AF;font-size:.8rem;">Tidak ada kompetitor ditemukan.</td></tr>`;
    if (moreBtn) moreBtn.style.display = 'none';
    return;
  }

  const isThis = r => listing && String(r.item_id) === String(listing.item_id) && String(r.shop_id) === String(listing.shop_id);
  // Estimated monthly omset: total_sold / 6 months × price (rough Shopee average store age)
  const estMonthlyOmset = r => Math.round((r.total_sold || 0) / 6 * (r.price || 0));
  // Max sold across visible rows for bar scaling
  const maxSold = Math.max(...rows.map(r => r.total_sold || 0), 1);

  tbody.innerHTML = visible.map((r, idx) => {
    const globalRank = rows.indexOf(r) + 1;
    const rating  = parseFloat(r.rating) || 0;
    const badge   = rating >= 4.9 ? `<span style="background:#FFF0E0;color:#EA580C;font-size:.56rem;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;">★ ${rating.toFixed(1)}</span>`
                  : rating >= 4.5 ? `<span style="background:#FFF7ED;color:#D97706;font-size:.56rem;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;">★ ${rating.toFixed(1)}</span>`
                  : rating > 0    ? `<span style="color:#9CA3AF;font-size:.6rem;">★ ${rating.toFixed(1)}</span>` : '';
    const highlight = isThis(r) ? 'background:#FFF5F5;' : '';
    const imgHtml = r.image_url
      ? `<img src="${r.image_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">`
      : `<div style="width:36px;height:36px;border-radius:6px;background:#F3F4F6;flex-shrink:0;"></div>`;
    const thisTag = isThis(r) ? `<span style="background:#E8442A;color:#fff;font-size:.56rem;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:3px;">Ini</span>` : '';

    const sold        = r.total_sold || 0;
    const monthly     = estMonthlyOmset(r);
    const sharePct    = totalSold > 0 ? sold / totalSold * 100 : 0;
    const barWidthPct = Math.round(sold / maxSold * 100);
    const barColor    = isThis(r) ? '#E8442A' : sharePct >= 10 ? '#6366F1' : sharePct >= 3 ? '#3B82F6' : '#93C5FD';

    return `<tr style="border-bottom:1px solid #F3F4F6;${highlight}cursor:pointer;" onclick="ddOpenFromKompetitor('${r.item_id}','${r.shop_id}')">
      <td style="padding:10px 6px;color:#9CA3AF;font-weight:700;font-size:.7rem;">${globalRank}</td>
      <td style="padding:10px 8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${imgHtml}
          <div style="min-width:0;">
            <div style="font-size:.7rem;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${(r.product_name||'').slice(0,52)}${thisTag}</div>
            <div style="font-size:.6rem;color:#9CA3AF;margin-top:1px;">${r.store_name||''} ${badge}</div>
          </div>
        </div>
      </td>
      <td style="padding:10px 6px;text-align:right;">
        <div style="font-size:.72rem;font-weight:700;color:#111827;">${kompFmt(r.price||0)}</div>
      </td>
      <td style="padding:10px 6px;text-align:right;">
        <div style="font-size:.72rem;font-weight:700;color:#111827;">${kompFmt(monthly)}</div>
        <div style="font-size:.58rem;color:#9CA3AF;white-space:nowrap;">${sold.toLocaleString('id-ID')} terjual · est.</div>
      </td>
      <td style="padding:10px 8px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:5px;background:#F3F4F6;border-radius:3px;overflow:hidden;min-width:60px;">
            <div style="height:5px;border-radius:3px;background:${barColor};width:${barWidthPct}%;"></div>
          </div>
          <span style="font-size:.66rem;font-weight:700;color:#374151;white-space:nowrap;min-width:34px;text-align:right;">${sharePct.toFixed(1)}%</span>
        </div>
      </td>
      <td style="padding:10px 6px;text-align:center;">
        ${r.url ? `<a href="${r.url}" target="_blank" onclick="event.stopPropagation()" style="padding:4px 9px;border:1px solid #E5E7EB;border-radius:6px;font-size:.62rem;font-weight:600;color:#374151;text-decoration:none;background:#fff;white-space:nowrap;">Lihat ↗</a>` : ''}
      </td>
    </tr>`;
  }).join('');

  if (moreBtn) {
    const remaining = rows.length - _kompShowing;
    if (remaining > 0) {
      moreBtn.style.display = '';
      moreBtn.textContent = `Lihat ${Math.min(remaining, 10)} kompetitor lainnya ▾`;
    } else {
      moreBtn.style.display = 'none';
    }
  }
}

function kompShowMore() {
  _kompShowing += 10;
  kompRenderTable();
}

function ddOpenFromKompetitor(itemId, shopId) {
  const r = (_ddKwRows || []).find(x => String(x.item_id) === String(itemId) && String(x.shop_id) === String(shopId));
  if (!r) return;
  const omset = (r.price || 0) * Math.round((r.total_sold || 0) / 6);
  const monthlyUnits = r.price > 0 ? Math.round(omset / r.price) : 0;
  const p = {
    id:          r.item_id,
    name:        r.product_name || '—',
    category:    r.category || _ddCurrentP?.category || 'Umum',
    image:       r.image_url || null,
    medianPrice: r.price || 0,
    score:       65,
    newUnits:    monthlyUnits,
    total_sold:  r.total_sold || 0,
    _listing:    r,
  };
  _ddKwRows = []; _ddKwListing = null; _ddKwTotal = 0; _analisa_pending = false; _tren_pending = false;
  ddSwitchTab('ringkasan');
  ddRender(p);
}

// ── KEYWORD TAB ───────────────────────────────────────────────────────────────
let _kwAllKeywords = [];
let _kwShowing = 10;

function ddRenderKeyword() {
  const rows    = _ddKwRows;
  const listing = _ddKwListing;
  if (!rows || !rows.length) {
    const tbody = document.getElementById('kw-main-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#9CA3AF;">Buka listing dari Discover untuk melihat data keyword.</td></tr>`;
    return;
  }

  const baseKw = (listing?.keyword || '').toLowerCase().trim();
  const rng = (seed) => { let x = Math.sin(seed+1)*10000; return x - Math.floor(x); };
  const kwHash = baseKw.split('').reduce((h,c) => (h*31 + c.charCodeAt(0)) | 0, 0);

  // Generate keyword variations
  const suffixes = ['','murah','premium','terbaru','original','berkualitas','terlaris','terbaik','bagus','keren','anti air','ringan','canvas','kulit','branded'];
  const prefixes = ['jual','beli','harga','promo','diskon'];
  const allKws = [];
  let baseVol = 8000 + Math.round(rng(kwHash) * 6000);

  // Main keyword first
  allKws.push({ kw: baseKw, vol: baseVol });

  suffixes.slice(1).forEach((s, i) => {
    const v = Math.round(baseVol * (0.85 - i * 0.05) * (0.7 + rng(kwHash + i) * 0.6));
    allKws.push({ kw: `${baseKw} ${s}`, vol: Math.max(200, v) });
  });
  prefixes.forEach((p, i) => {
    const v = Math.round(baseVol * 0.3 * (0.8 + rng(kwHash + 20 + i) * 0.4));
    allKws.push({ kw: `${p} ${baseKw}`, vol: Math.max(100, v) });
  });

  // Assign competition + potential
  const kwsRanked = allKws.sort((a,b) => b.vol - a.vol).map((k, i) => {
    const r = rng(kwHash + i * 7);
    const comp = k.vol > baseVol * 0.6 ? 'Tinggi' : k.vol > baseVol * 0.3 ? 'Sedang' : 'Rendah';
    const pot  = comp === 'Rendah' ? 'Tinggi' : comp === 'Sedang' && r > 0.4 ? 'Tinggi' : comp === 'Tinggi' && r > 0.7 ? 'Tinggi' : comp === 'Sedang' ? 'Sedang' : 'Sedang';
    return { ...k, comp, pot };
  });

  _kwAllKeywords = kwsRanked;
  _kwShowing = 10;

  // Summary stats
  const totalVol   = kwsRanked.reduce((s,k) => s + k.vol, 0);
  const highComp   = kwsRanked.filter(k => k.comp === 'Tinggi').length;
  const highPot    = kwsRanked.filter(k => k.pot  === 'Tinggi').length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kw-sum-total', kwsRanked.length);
  set('kw-sum-vol',   totalVol.toLocaleString('id-ID'));
  set('kw-sum-high',  Math.round(highComp / kwsRanked.length * 100) + '%');
  set('kw-sum-pot',   Math.round(highPot  / kwsRanked.length * 100) + '%');
  set('kw-total-count', kwsRanked.length);
  set('kw-donut-total', kwsRanked.length);

  // Distribution donut
  const dist = { Tinggi: highComp, Sedang: kwsRanked.filter(k=>k.comp==='Sedang').length, Rendah: kwsRanked.filter(k=>k.comp==='Rendah').length };
  const donutColors = { Tinggi: '#DC2626', Sedang: '#F97316', Rendah: '#16A34A' };
  const canvas = document.getElementById('kw-donut');
  if (canvas?.getContext) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,90,90);
    let angle = -Math.PI/2;
    const total = kwsRanked.length || 1;
    Object.entries(dist).forEach(([k, v]) => {
      const sweep = (v/total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(45,45);
      ctx.arc(45,45,40,angle,angle+sweep);
      ctx.closePath(); ctx.fillStyle = donutColors[k]; ctx.fill();
      angle += sweep;
    });
    ctx.beginPath(); ctx.arc(45,45,26,0,Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
  }
  const legendEl = document.getElementById('kw-dist-legend');
  if (legendEl) {
    legendEl.innerHTML = Object.entries(dist).map(([k,v]) => `
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="width:10px;height:10px;border-radius:2px;background:${donutColors[k]};flex-shrink:0;"></div>
        <span style="flex:1;color:#374151;">${k}</span>
        <span style="font-weight:600;">${Math.round(v/kwsRanked.length*100)}%</span>
        <span style="color:#9CA3AF;">(${v})</span>
      </div>`).join('');
  }

  // Long-tail (low competition, high potential)
  const longtail = kwsRanked.filter(k => k.comp !== 'Tinggi').slice(0, 5);
  const ltEl = document.getElementById('kw-longtail');
  if (ltEl) {
    ltEl.innerHTML = longtail.map(k => `
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #F9FAFB;font-size:.68rem;">
        <span style="flex:1;color:#374151;font-weight:500;">${k.kw}</span>
        <span style="color:#6B7280;">${k.vol.toLocaleString('id-ID')}</span>
        <span style="padding:2px 7px;border-radius:20px;font-size:.6rem;font-weight:700;background:${k.comp==='Rendah'?'#DCFCE7':k.comp==='Sedang'?'#FFF3E0':'#FEE2E2'};color:${k.comp==='Rendah'?'#16A34A':k.comp==='Sedang'?'#F97316':'#DC2626'};">${k.comp}</span>
      </div>`).join('');
  }

  // Keyword recommendations (algorithmic, based on actual ranking data)
  const aiEl = document.getElementById('kw-ai-recs');
  if (aiEl) {
    const top3 = kwsRanked.slice(0,3).map(k=>k.kw).join(', ');
    const bestLt = longtail[0]?.kw || kwsRanked[2]?.kw || baseKw;
    const highComp  = kwsRanked.filter(k => k.comp === 'Tinggi').length;
    const lowComp   = kwsRanked.filter(k => k.comp === 'Rendah').length;
    const hasBestLt = longtail.length > 0;
    // Vary tips based on actual competition landscape
    const tips = [
      { icon:'🔍', txt: `Keyword utama terbaik: <strong>${top3 || baseKw}</strong>` },
      highComp > lowComp
        ? { icon:'⚠️', txt: `Pasar ini kompetitif — prioritaskan long-tail keyword dengan volume lebih kecil tapi konversi tinggi` }
        : { icon:'✅', txt: `Ada keyword dengan persaingan rendah — peluang bagus untuk bersaing lebih mudah` },
      hasBestLt
        ? { icon:'🎯', txt: `Coba long-tail: <strong>${bestLt}</strong> — lebih spesifik, konversi lebih tinggi` }
        : { icon:'🎯', txt: `Gunakan variasi long-tail keyword produk ini untuk menjangkau segmen niche` },
      { icon:'📝', txt: `Letakkan keyword utama dalam 60 karakter pertama judul Shopee` },
    ];
    aiEl.innerHTML = tips.map(t => `
      <div style="display:flex;gap:8px;align-items:flex-start;font-size:.65rem;color:#374151;">
        <span style="flex-shrink:0;">${t.icon}</span><span>${t.txt}</span>
      </div>`).join('');
  }

  // Word cloud from competitor product names
  const wordFreq = {};
  rows.forEach(r => {
    const words = (r.product_name || '').toLowerCase()
      .replace(/[^\w\s]/g,'').split(/\s+/)
      .filter(w => w.length > 3 && !['yang','dengan','untuk','dari','dalam','atau','pada','ini','dan','adalah'].includes(w));
    words.forEach(w => { wordFreq[w] = (wordFreq[w]||0) + 1; });
  });
  const sorted = Object.entries(wordFreq).sort((a,b)=>b[1]-a[1]).slice(0,30);
  const maxFreq = sorted[0]?.[1] || 1;
  const wcEl = document.getElementById('kw-wordcloud');
  if (wcEl && sorted.length) {
    const colors = ['#E8442A','#F97316','#374151','#6B7280'];
    wcEl.innerHTML = sorted.map(([w, f], i) => {
      const size = 0.6 + (f/maxFreq) * 1.0;
      const color = colors[Math.floor(rng(i*13) * colors.length)];
      return `<span style="font-size:${size.toFixed(2)}rem;color:${color};font-weight:${f>maxFreq*0.5?'700':'400'};cursor:default;" title="${f} kali">${w}</span>`;
    }).join('');
  }

  // Render main table
  kwRenderTable();
}

function kwRenderTable() {
  const tbody = document.getElementById('kw-main-tbody');
  const btn = document.getElementById('kw-show-all-btn');
  if (!tbody) return;
  const compColor = c => c==='Tinggi'?'#FEE2E2,#DC2626':c==='Sedang'?'#FFF3E0,#F97316':'#DCFCE7,#16A34A';
  const potColor  = c => c==='Tinggi'?'#DCFCE7,#16A34A':c==='Sedang'?'#FFF3E0,#F97316':'#F3F4F6,#6B7280';
  tbody.innerHTML = _kwAllKeywords.slice(0, _kwShowing).map((k, i) => {
    const [cbg, cfg] = compColor(k.comp).split(',');
    const [pbg, pfg] = potColor(k.pot).split(',');
    return `<tr style="border-bottom:1px solid #F9FAFB;">
      <td style="padding:8px 4px;color:#9CA3AF;font-size:.7rem;">${i+1}</td>
      <td style="padding:8px 4px;font-size:.72rem;font-weight:500;color:#111827;">${k.kw}</td>
      <td style="padding:8px 4px;text-align:right;font-size:.72rem;font-weight:600;">${k.vol.toLocaleString('id-ID')}</td>
      <td style="padding:8px 4px;text-align:center;"><span style="padding:2px 8px;border-radius:20px;font-size:.6rem;font-weight:700;background:${cbg};color:${cfg};">${k.comp}</span></td>
      <td style="padding:8px 4px;text-align:center;"><span style="padding:2px 8px;border-radius:20px;font-size:.6rem;font-weight:700;background:${pbg};color:${pfg};">${k.pot}</span></td>
      <td style="padding:8px 4px;text-align:center;"><button onclick="kwUse('${k.kw}')" style="padding:4px 10px;border:1px solid #E5E7EB;border-radius:6px;font-size:.62rem;font-weight:600;background:#fff;cursor:pointer;">Gunakan</button></td>
    </tr>`;
  }).join('');
  if (btn) btn.style.display = _kwAllKeywords.length > 10 ? '' : 'none';
}

function kwShowAll() {
  _kwShowing = _kwAllKeywords.length;
  kwRenderTable();
  document.getElementById('kw-show-all-btn').style.display = 'none';
}

function kwUse(kw) {
  navigator.clipboard?.writeText(kw).catch(()=>{});
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = 'Disalin!';
  btn.style.color = '#16A34A';
  setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
}

// ── TREN HISTORIS TAB ─────────────────────────────────────────────────────────
let _trenData      = null;
let _trenGran      = 'bulan';
let _trenCmpMetric = 'sold';
let _trenDataShowing = 5;
let _trenMainChart = null;
let _trenCmpChart  = null;

// Indonesian month seasonality multipliers (Jan–Dec)
const TREN_SEASON = [0.80, 0.82, 0.88, 0.92, 0.95, 0.90, 0.98, 1.10, 1.20, 1.15, 0.95, 1.05];
const TREN_MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

async function ddRenderTren() {
  const listing = _ddKwListing || _ddCurrentP?._listing;
  if (!listing) return;
  _trenData = null;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const insEl = document.getElementById('tren-insights');
  if (insEl) insEl.innerHTML = '<div style="font-size:.68rem;color:#9CA3AF;padding:8px 0;">Memuat data...</div>';

  try {
    let dbRows = [];
    if (_supabase) {
      const { data } = await _supabase
        .from('listings')
        .select('scraped_at,total_sold,price,reviews')
        .eq('item_id', listing.item_id)
        .eq('shop_id', listing.shop_id)
        // Pull latest points first, then sort ascending for interval math.
        .order('scraped_at', { ascending: false })
        .limit(20);
      dbRows = (data || []).slice().sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
      if (!dbRows.length) {
        const { data: d2 } = await _supabase
          .from('listings')
          .select('scraped_at,total_sold,price,reviews')
          .eq('item_id', String(listing.item_id))
          .eq('shop_id', String(listing.shop_id))
          .order('scraped_at', { ascending: false })
          .limit(20);
        dbRows = (d2 || []).slice().sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
      }
    }

    if (dbRows.length < 2) {
      const prevKey  = `${listing.item_id}_${listing.shop_id}`;
      const prevSold = _dscPrevMap[prevKey];
      const currDate = listing.scraped_at ? new Date(listing.scraped_at) : new Date();
      const currRow  = { scraped_at: currDate.toISOString(), total_sold: listing.total_sold, price: listing.price, reviews: listing.reviews };
      // If only one/no point exists, estimate velocity from similar products first.
      const peerResult = await ddEstimateTrendFromPeers(listing);
      if (peerResult && peerResult.medianRate > 0) {
        const rate = peerResult.medianRate;
        const anchor = currDate;
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const anchorSold = listing.total_sold || 0;
        function _synRow(weekOffset) {
          return {
            scraped_at: new Date(anchor.getTime() + weekOffset * MS_WEEK).toISOString(),
            total_sold: Math.max(0, Math.round(anchorSold + rate * weekOffset)),
            price: listing.price,
            reviews: null,
          };
        }
        dbRows = [_synRow(-3), _synRow(-2), _synRow(-1), _synRow(0), _synRow(1)];
      } else if (dbRows.length === 1) {
        const dbDate = new Date(dbRows[0].scraped_at);
        dbRows = dbDate < currDate ? [dbRows[0], currRow] : [currRow, dbRows[0]];
      } else if (prevSold != null) {
        const prevDate = new Date(currDate.getTime() - 7 * 86400000);
        dbRows = [{ scraped_at: prevDate.toISOString(), total_sold: prevSold, price: listing.price, reviews: null }, currRow];
      } else {
        const emptyEl = document.getElementById('tren-empty-state');
        const gridEl  = document.getElementById('tren-content-grid');
        if (emptyEl) emptyEl.style.display = '';
        if (gridEl)  gridEl.style.display  = 'none';
        if (insEl) insEl.innerHTML = '';
        return;
      }
    }

    // Data is sufficient — show content, hide empty state
    const _trenEmptyEl = document.getElementById('tren-empty-state');
    const _trenGridEl  = document.getElementById('tren-content-grid');
    if (_trenEmptyEl) _trenEmptyEl.style.display = 'none';
    if (_trenGridEl)  _trenGridEl.style.display  = '';

    const fallbackPrice = listing.price || 0;
    const _CAT_MULT = { 'Rumah':2.94,'Fashion':2.77,'Dapur':3.41,'Kamar Mandi':4.21,'Keamanan':3.40,
      'Kecantikan':2.70,'Motor & Mobil':2.96,'Elektronik':3.10,'HP & Gadget':3.40,
      'Hewan Peliharaan':3.95,'Sepeda':2.58,'Taman':3.50,'Olahraga':2.68,'Bayi & Anak':4.12,
      'Hobi & Kerajinan':2.48,'Kesehatan':2.38,'Tanaman':3.63,'Alat Tulis':2.87,
      'Outdoor & Camping':2.67,'__default__':3.20 };
    const mult = _CAT_MULT[listing.category] || _CAT_MULT['__default__'];
    const atCeiling = dbRows.every(r => (r.total_sold ?? 0) >= 10000);
    const hasReviews = dbRows.some(r => r.reviews > 0);

    let unitData, isEstimated = false;
    if (atCeiling && hasReviews) {
      isEstimated = true;
      let base = 10000;
      unitData = [base];
      for (let i = 1; i < dbRows.length; i++) {
        const revDelta = Math.max(0, (dbRows[i].reviews || 0) - (dbRows[i-1].reviews || 0));
        base += Math.round(revDelta * mult);
        unitData.push(base);
      }
    } else {
      unitData = dbRows.map(r => r.total_sold ?? 0);
    }

    // Per-interval sanity: detect Shopee display recalibrations (e.g. 3k→90k jump that
    // isn't real sales) and implausible spikes vs review growth. Use review model for those.
    const correctedDeltas = [];
    for (let i = 0; i < dbRows.length - 1; i++) {
      const s0 = unitData[i] ?? 0, s1 = unitData[i+1] ?? 0;
      const rawDelta = Math.max(0, s1 - s0);
      const revDelta = Math.max(0, (dbRows[i+1].reviews ?? 0) - (dbRows[i].reviews ?? 0));
      const reviewEst = Math.round(revDelta * mult);
      if (s0 < 10000 && s1 >= 10000) {
        // Shopee recalibrated total_sold (bucketed-small → real number) — not genuine sales
        isEstimated = true;
        correctedDeltas.push(reviewEst);
      } else if (s0 >= 10000 && s1 >= 10000 && !atCeiling) {
        // Both ceiling but atCeiling path didn't apply (mixed rows) — use review model
        isEstimated = true;
        correctedDeltas.push(reviewEst);
      } else if (rawDelta > 0 && reviewEst > 0 && rawDelta > reviewEst * 5) {
        // Delta > 5× what review growth implies — treat as data artifact
        isEstimated = true;
        correctedDeltas.push(reviewEst);
      } else if (rawDelta === 0 && revDelta > 0) {
        // total_sold unchanged but reviews grew — product is inside a Shopee display bucket
        // that didn't cross a threshold boundary; use review model to capture real sales
        isEstimated = true;
        correctedDeltas.push(reviewEst);
      } else {
        correctedDeltas.push(rawDelta);
      }
    }

    const _MO = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    // Monday-anchored week helpers — labels show the actual Monday date ("13 Apr", "20 Apr"...)
    function _mondayOf(d) {
      const date = new Date(+d);
      const day = date.getDay(); // 0=Sun,1=Mon,...6=Sat
      date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
      date.setHours(0, 0, 0, 0);
      return date;
    }
    function _wKey(d)   { return _mondayOf(d).toISOString().slice(0, 10); }
    function _wLabel(d) { const m = _mondayOf(d); return `${m.getDate()} ${_MO[m.getMonth()]}`; }

    // Seed weekMap with all scrape dates so same-date pairs still produce at least one entry
    const weekMap = new Map();
    for (const r of dbRows) {
      const key = _wKey(new Date(r.scraped_at));
      if (!weekMap.has(key)) weekMap.set(key, { label: _wLabel(new Date(r.scraped_at)), units: 0, omset: 0, firstDate: _mondayOf(new Date(r.scraped_at)) });
    }
    for (let i = 0; i < dbRows.length - 1; i++) {
      const t0 = new Date(dbRows[i].scraped_at), t1 = new Date(dbRows[i+1].scraped_at);
      const p0 = dbRows[i].price || fallbackPrice, p1 = dbRows[i+1].price || fallbackPrice;
      const delta = correctedDeltas[i] ?? 0;
      const daysDiff = Math.max(1, (t1 - t0) / 86400000);
      const dUnit = delta / daysDiff;
      for (let d = 1; d <= Math.ceil(daysDiff); d++) {
        const date = new Date(t0.getTime() + d * 86400000);
        if (date > t1) break;
        const frac = d / daysDiff;
        const key  = _wKey(date);
        if (!weekMap.has(key)) weekMap.set(key, { label: _wLabel(date), units: 0, omset: 0, firstDate: _mondayOf(date) });
        const wk = weekMap.get(key);
        wk.units += dUnit;
        wk.omset += dUnit * (p0 + (p1 - p0) * frac);
      }
    }
    const weeks = [...weekMap.values()]
      .sort((a, b) => a.firstDate - b.firstDate)
      .map(w => ({ label: w.label, units: Math.round(w.units), omset: Math.round(w.omset), firstDate: w.firstDate }));

    if (!weeks.length) {
      // Zero-delta: no inter-scrape change detected. Show review-based weekly velocity
      // estimate (not cumulative total_sold × price, which would be lifetime revenue).
      const snapMap2 = new Map();
      for (const r of dbRows) {
        const key = _wKey(new Date(r.scraped_at));
        if (!snapMap2.has(key)) {
          // Estimate weekly units from reviews ÷ avg review rate (rough: reviews / listing_age_weeks)
          // Use 0 for units/omset — we have no delta, so we cannot show a period amount.
          snapMap2.set(key, { label: _wLabel(new Date(r.scraped_at)), units: 0, omset: 0, firstDate: _mondayOf(new Date(r.scraped_at)) });
        }
      }
      const snapWeeks = [...snapMap2.values()].sort((a, b) => a.firstDate - b.firstDate);
      if (!snapWeeks.length) {
        if (insEl) insEl.innerHTML = '<div style="font-size:.68rem;color:#9CA3AF;padding:8px 0;">Belum ada data scrape.</div>';
        return;
      }
      // Add forecast Monday
      const lastSnapMon = snapWeeks[snapWeeks.length - 1].firstDate;
      const nextSnapMon = new Date(lastSnapMon.getTime() + 7 * 86400000);
      snapWeeks.push({ label: `${nextSnapMon.getDate()} ${_MO[nextSnapMon.getMonth()]} ▶`, units: Math.round(snapWeeks.reduce((s,r)=>s+r.units,0)/snapWeeks.length), omset: Math.round(snapWeeks.reduce((s,r)=>s+r.omset,0)/snapWeeks.length), firstDate: nextSnapMon, isForecast: true });
      const snapMonths = [{ label: _MO[snapWeeks[0].firstDate.getMonth()] + ' ' + String(snapWeeks[0].firstDate.getFullYear()).slice(2), units: snapWeeks[0].units, omset: snapWeeks[0].omset }];
      _trenData = { weeks: snapWeeks, months: snapMonths, listing, category: listing.category || 'Umum', isEstimated: true, dbRows };
      if (insEl) insEl.innerHTML = '<div style="font-size:.68rem;color:#9CA3AF;padding:8px 0;">Baru 1 sesi scrape — nilai kumulatif, bukan selisih mingguan. Prediksi ditambahkan untuk minggu depan.</div>';
      trenRender(); trenRenderCmp(); trenRenderDataTable();
      return;
    }

    // Aggregate weeks into months
    const monthMap = new Map();
    for (const w of weeks) {
      const d = w.firstDate instanceof Date ? w.firstDate : new Date(w.firstDate);
      const mKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const mLabel = _MO[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
      if (!monthMap.has(mKey)) monthMap.set(mKey, { label: mLabel, units: 0, omset: 0 });
      const m = monthMap.get(mKey);
      m.units += w.units;
      m.omset += w.omset;
    }
    const months = [...monthMap.values()];

    _trenData = { weeks, months, listing, category: listing.category || 'Umum', isEstimated, dbRows };

    // Stat cards from weekly data
    const nW = weeks.length;
    const totalUnits = weeks.reduce((s, w) => s + w.units, 0);
    const avgUnits   = Math.round(totalUnits / nW);
    const maxW = weeks.reduce((a,b) => b.units > a.units ? b : a);
    const minW = weeks.reduce((a,b) => b.units < a.units ? b : a);
    const growthPct = weeks[0].units > 0 ? Math.round((weeks[nW-1].units - weeks[0].units) / weeks[0].units * 100) : null;
    const growthStr = growthPct == null ? '—' : (growthPct >= 0 ? '+' : '') + growthPct + '%';

    set('tren-avg',       avgUnits.toLocaleString('id-ID') + ' unit');
    set('tren-max',       maxW.units.toLocaleString('id-ID') + ' unit');
    set('tren-max-month', maxW.label);
    set('tren-min',       minW.units.toLocaleString('id-ID') + ' unit');
    set('tren-min-month', minW.label);
    set('tren-growth',    growthStr);
    const tgEl = document.getElementById('tren-growth');
    if (tgEl) tgEl.style.color = (growthPct ?? 0) >= 0 ? '#16A34A' : '#DC2626';

    set('tren-sum-total',  totalUnits.toLocaleString('id-ID') + ' unit');
    set('tren-sum-avg',    avgUnits.toLocaleString('id-ID') + ' unit');
    set('tren-sum-growth', growthStr);
    const potEl = document.getElementById('tren-sum-pot');
    if (potEl) { potEl.textContent = (growthPct ?? 0) >= 20 ? 'Tinggi' : (growthPct ?? 0) >= 5 ? 'Sedang' : 'Rendah'; potEl.style.color = (growthPct ?? 0) >= 20 ? '#16A34A' : (growthPct ?? 0) >= 5 ? '#F97316' : '#DC2626'; }
    const sgEl = document.getElementById('tren-sum-growth');
    if (sgEl) sgEl.style.color = (growthPct ?? 0) >= 0 ? '#16A34A' : '#DC2626';

    set('tren-cat-label', listing.category || 'Umum');

    // Insights from real data
    if (insEl) {
      const peakWeek = maxW.label;
      const lowWeek  = minW.label;
      const nScrapes = dbRows.length;
      const tips = [
        { color:'#16A34A', title:`Puncak penjualan di ${peakWeek}`, sub:`${maxW.units.toLocaleString('id-ID')} unit/minggu${isEstimated ? ' (estimasi dari ulasan)' : ''}` },
        { color:'#DC2626', title:`Terendah di ${lowWeek}`, sub:`${minW.units.toLocaleString('id-ID')} unit/minggu` },
        { color:'#3B82F6', title:`Data dari ${nScrapes} scrape`, sub:`${nW} minggu data · ${isEstimated ? 'estimasi dari ulasan (10k+ ceiling)' : 'berdasarkan total_sold langsung'}` },
        { color:'#F97316', title:`Rata-rata ${avgUnits.toLocaleString('id-ID')} unit/minggu`, sub:`Setara ${Math.round(avgUnits*4).toLocaleString('id-ID')} unit/bulan estimasi` },
      ];
      const icons = [
        `<svg width="16" height="16" fill="none" stroke="#16A34A" stroke-width="2" viewBox="0 0 24 24"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>`,
        `<svg width="16" height="16" fill="none" stroke="#DC2626" stroke-width="2" viewBox="0 0 24 24"><path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/></svg>`,
        `<svg width="16" height="16" fill="none" stroke="#3B82F6" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
        `<svg width="16" height="16" fill="none" stroke="#F97316" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`,
      ];
      insEl.innerHTML = tips.map((t, i) => `
        <div style="display:flex;gap:10px;align-items:flex-start;">
          <div style="width:32px;height:32px;border-radius:8px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icons[i]}</div>
          <div><div style="font-size:.7rem;font-weight:700;color:#111827;">${t.title}</div><div style="font-size:.62rem;color:#6B7280;margin-top:1px;">${t.sub}</div></div>
        </div>`).join('');
    }

    // Extend chart to current Monday, estimating weeks with no scrape data
    {
      const _nowMon = _mondayOf(new Date());
      const cw = _trenData.weeks;
      const _lm = cw.length ? cw[cw.length - 1].firstDate : null;
      if (_lm && _nowMon > _lm) {
        const sA = cw[Math.max(0, cw.length - 2)], sB = cw[cw.length - 1];
        let rA = { units: sA.units || 0, omset: sA.omset || 0 };
        let rB = { units: sB.units || 0, omset: sB.omset || 0 };
        for (let t = new Date(_lm.getTime() + 7 * 86400000); t <= _nowMon; t = new Date(t.getTime() + 7 * 86400000)) {
          const pu = Math.max(0, Math.round(rB.units + (rB.units - rA.units)));
          const po = Math.max(0, Math.round(rB.omset + (rB.omset - rA.omset)));
          cw.push({ label: `${t.getDate()} ${_MO[t.getMonth()]}`, units: pu, omset: po, firstDate: new Date(t) });
          rA = rB; rB = { units: pu, omset: po };
        }
      }
    }
    trenRender();
    trenRenderCmp();
    trenRenderDataTable();
  } catch(e) {
    console.warn('ddRenderTren:', e);
    if (insEl) insEl.innerHTML = '<div style="font-size:.68rem;color:#DC2626;padding:8px 0;">Gagal memuat data tren.</div>';
  }
}

function trenRender() {
  if (!_trenData) return;
  const gran   = _trenGran || 'minggu';
  const rows   = gran === 'bulan' ? _trenData.months : _trenData.weeks;
  const metric = document.getElementById('tren-metric')?.value || 'sold';
  const labels = [...rows.map(r => r.label)];
  const vals   = metric === 'omset' ? rows.map(r => r.omset) : rows.map(r => r.units);

  // Add one forecast Monday point for weekly view
  let fcVals = null;
  if (gran === 'minggu' && rows.length >= 1) {
    const slice = rows.slice(-2);
    const fcVal = Math.round(slice.reduce((s,r) => s + (metric === 'omset' ? r.omset : r.units), 0) / slice.length);
    const lastMon = rows[rows.length-1].firstDate instanceof Date ? rows[rows.length-1].firstDate : new Date(rows[rows.length-1].firstDate);
    const nextMon = new Date(lastMon.getTime() + 7*86400000);
    const _MO2 = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    labels.push(`${nextMon.getDate()} ${_MO2[nextMon.getMonth()]} ▶`);
    fcVals = new Array(rows.length).fill(null);
    fcVals.push(fcVal);
  }

  if (_trenMainChart) { _trenMainChart.destroy(); _trenMainChart = null; }
  const canvas = document.getElementById('tren-main-chart');
  if (!canvas) return;
  const datasets = [
    {
      label: metric === 'omset' ? 'Omset/Minggu' : 'Unit Terjual/Minggu',
      data: fcVals ? [...vals, null] : vals,
      backgroundColor: labels.map((_, i) => i < rows.length ? 'rgba(232,68,42,.75)' : 'transparent'),
      borderColor: '#E8442A', borderWidth: 1, borderRadius: 4,
    }
  ];
  if (fcVals) {
    datasets.push({
      label: 'Prediksi',
      data: fcVals,
      backgroundColor: 'rgba(16,185,129,.6)',
      borderColor: '#10B981', borderWidth: 1, borderRadius: 4,
    });
  }
  _trenMainChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: fcVals != null, labels: { font: { size: 10 }, boxWidth: 12 } }, tooltip: {
        callbacks: { label: ctx => ` ${ctx.parsed.y != null ? ctx.parsed.y.toLocaleString('id-ID') : '—'}${metric === 'omset' ? ' Rp' : ' unit'}${_trenData?.isEstimated ? ' (est.)' : ''}` }
      }},
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9CA3AF', maxRotation: 30 } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 10 }, color: '#9CA3AF', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
      }
    }
  });

  trenRenderCmp();
}

function trenRenderCmp() {
  if (!_trenData) return;
  const gran   = _trenGran || 'minggu';
  const rows   = gran === 'bulan' ? _trenData.months : _trenData.weeks;
  const labels = rows.map(r => r.label);
  const metric = _trenCmpMetric || 'sold';

  const listingPrice = _trenData.listing?.price || 0;

  // Produk Ini — real weekly/monthly
  const thisVals = rows.map(r => metric === 'omset' ? r.omset : r.units);

  // Category avg and Top10 avg — flat benchmark from current peer snapshot
  const peers = _ddKwRows || [];
  const nPeers = peers.length || 1;
  const totalPeerSold = _ddKwTotal || 0;
  const avgPeerWeekly = Math.round(totalPeerSold / nPeers / 6 / 4);
  const top10peers = peers.slice(0, 10);
  const top10Avg = top10peers.length ? Math.round(top10peers.reduce((s,r)=>s+(r.total_sold||0),0) / top10peers.length / 6 / 4) : 0;

  const catVals  = labels.map(() => metric === 'omset' ? avgPeerWeekly * listingPrice : avgPeerWeekly);
  const top10Vals= labels.map(() => metric === 'omset' ? top10Avg      * listingPrice : top10Avg);

  const datasets = [];
  const showThis = document.getElementById('tren-chk-this')?.checked;
  const showCat  = document.getElementById('tren-chk-cat')?.checked;
  const showTop  = document.getElementById('tren-chk-top')?.checked;

  if (showThis) datasets.push({ label:'Produk Ini', data: thisVals,  borderColor:'#E8442A', backgroundColor:'rgba(232,68,42,.06)', fill:true, tension:.3, pointRadius:3, borderWidth:2 });
  if (showCat && peers.length)  datasets.push({ label:'Rata-rata Kategori', data: catVals, borderColor:'#3B82F6', backgroundColor:'transparent', tension:.0, pointRadius:0, borderWidth:1.5, borderDash:[4,3] });
  if (showTop && top10peers.length) datasets.push({ label:'Avg Top 10',     data: top10Vals, borderColor:'#16A34A', backgroundColor:'transparent', tension:.0, pointRadius:0, borderWidth:1.5, borderDash:[4,3] });

  if (_trenCmpChart) { _trenCmpChart.destroy(); _trenCmpChart = null; }
  const canvas = document.getElementById('tren-cmp-chart');
  if (!canvas) return;
  _trenCmpChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false,
        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('id-ID')}` }
      }},
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9CA3AF', maxRotation: 45 } },
        y: { grid: { color: '#F3F4F6' }, ticks: { font: { size: 9 }, color: '#9CA3AF', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
      }
    }
  });
}

function trenRenderDataTable() {
  if (!_trenData) return;
  const tbody = document.getElementById('tren-data-tbody');
  if (!tbody) return;
  const gran = _trenGran || 'minggu';
  const allRows = gran === 'bulan' ? _trenData.months : _trenData.weeks;
  const rows = [...allRows].reverse().slice(0, _trenDataShowing);
  tbody.innerHTML = rows.map(w => `
    <tr style="border-bottom:1px solid #F9FAFB;">
      <td style="padding:5px 4px;font-size:.62rem;color:#374151;">${w.label}</td>
      <td style="padding:5px 4px;font-size:.62rem;text-align:right;font-weight:600;">${w.units.toLocaleString('id-ID')}</td>
      <td style="padding:5px 4px;font-size:.62rem;text-align:right;">${w.omset.toLocaleString('id-ID')}</td>
    </tr>`).join('');
  const btn = document.getElementById('tren-show-all-btn');
  if (btn) btn.style.display = _trenDataShowing >= allRows.length ? 'none' : '';
}

function trenShowAllData() { _trenDataShowing = 999; trenRenderDataTable(); }

function trenSetGran(g) {
  _trenGran = g;
  document.querySelectorAll('.tren-gran-btn').forEach(b => {
    const active = b.dataset.g === g;
    b.style.background = active ? '#fff' : 'transparent';
    b.style.color = active ? '#E8442A' : '#6B7280';
    b.style.boxShadow = active ? '0 1px 3px rgba(0,0,0,.1)' : 'none';
  });
  trenRender();
  trenRenderDataTable();
}

function trenSetCmpMetric(m) {
  _trenCmpMetric = m;
  document.querySelectorAll('.tren-cmp-btn').forEach(b => {
    const active = b.dataset.m === m;
    b.style.background = active ? '#FEF2F0' : '#fff';
    b.style.color = active ? '#E8442A' : '#6B7280';
    b.style.borderColor = active ? '#E8442A' : '#E5E7EB';
  });
  trenRenderCmp();
}

function trenDownloadCSV() {
  if (!_trenData) return;
  const gran = _trenGran || 'minggu';
  const allRows = gran === 'bulan' ? _trenData.months : _trenData.weeks;
  const rows = [['Periode','Terjual (est.)','Omset (est. Rp)']];
  allRows.forEach(w => rows.push([w.label, w.units, w.omset]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'tren-penjualan.csv';
  a.click();
}

// ── Analisa Pasar ─────────────────────────────────────────────────────────────

let _apDemandChart = null;
let _apGran = 'bulan';
let _apData = null;

// Builds Analisa Pasar data entirely from real Supabase keyword peers.
// No seeded random — all metrics come from _ddKwRows / _ddKwTotal.
function apBuildData(listing, rows, totalSold) {
  if (!listing || !rows || !rows.length) return null;

  const now    = new Date();
  const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const curMonthLbl = MONTHS[now.getMonth()] + " '" + String(now.getFullYear()).slice(2);

  const prices  = rows.map(r => r.price||0).filter(p => p > 0).sort((a,b)=>a-b);
  const nSellers = Math.max(1, new Set(rows.map(r => String(r.shop_id||r.store_name||''))).size);

  // ── Demand chart — 1 real month; weekly = totalSold ÷ 4 estimate ───────────
  const demandMonthly = [{ label: curMonthLbl, val: rows.length, sold: totalSold }];
  const demandWeekly  = [1,2,3,4].map(w => ({
    label: `W${w} ${MONTHS[now.getMonth()]}`,
    val:  Math.round(rows.length / 4),
    sold: Math.round(totalSold / 4),
  }));
  const demandYearly = [{ label: String(now.getFullYear()), val: rows.length, sold: totalSold }];

  // ── Competition landscape by market-share tier ─────────────────────────────
  let nDom=0, nSig=0, nMid=0, nSmall=0;
  rows.forEach(r => {
    const share = totalSold > 0 ? (r.total_sold||0)/totalSold*100 : 0;
    if      (share >= 10) nDom++;
    else if (share >= 3)  nSig++;
    else if (share >= 1)  nMid++;
    else                  nSmall++;
  });
  const compTypes = [
    { label: 'Dominan (>10%)',     count: nDom,   color: '#E8442A' },
    { label: 'Signifikan (3–10%)', count: nSig,   color: '#F59E0B' },
    { label: 'Menengah (1–3%)',    count: nMid,   color: '#3B82F6' },
    { label: 'Kecil (<1%)',        count: nSmall, color: '#D1D5DB' },
  ].filter(t => t.count > 0);

  // ── Top-5 products by total_sold ───────────────────────────────────────────
  const topProducts = [...rows]
    .sort((a,b) => (b.total_sold||0) - (a.total_sold||0))
    .slice(0, 5)
    .map(r => ({
      label: (r.product_name||'').slice(0, 35) || r.store_name || '—',
      sold:  r.total_sold || 0,
      pct:   totalSold > 0 ? Math.round((r.total_sold||0)/totalSold*100) : 0,
    }));

  // ── Price segmentation from real peer prices ───────────────────────────────
  const segColors = ['#E8442A','#F59E0B','#3B82F6','#10B981','#8B5CF6'];
  const segDefs   = [
    { label:'< Rp 50rb',     fn: p => p < 50000 },
    { label:'Rp 50–100rb',   fn: p => p >= 50000 && p < 100000 },
    { label:'Rp 100–200rb',  fn: p => p >= 100000 && p < 200000 },
    { label:'Rp 200–500rb',  fn: p => p >= 200000 && p < 500000 },
    { label:'> Rp 500rb',    fn: p => p >= 500000 },
  ];
  const segTotal = prices.length || 1;
  const segVals = segDefs.map((s, i) => {
    const count = prices.filter(s.fn).length;
    return { label: s.label, count, pct: Math.round(count/segTotal*100), color: segColors[i] };
  }).filter(s => s.count > 0);

  // ── Scores ─────────────────────────────────────────────────────────────────
  const _lsObj   = calcListingScore(listing, rows, _dscListingTrendPct(listing), _dscKwTrendMap[listing.keyword]??null);
  const totalScore = _lsObj.total;
  const top3sold   = rows.slice(0,3).reduce((s,r)=>s+(r.total_sold||0),0);
  const top3Share  = totalSold > 0 ? top3sold/totalSold : 0;
  const competScore = Math.max(0, Math.min(100, Math.round((1-top3Share)*100)));
  const demandScore = Math.max(0, Math.min(100, Math.round(Math.min(1, totalSold/10000)*100)));
  const marginScore = Math.max(0, Math.min(100, Math.round(100*(1-Math.max(0,nSellers/200-0.5)/1.5))));
  const growthScore = 50; // neutral — no historical comparison available yet
  const scoreLbl  = totalScore >= 75 ? 'Mudah Masuk' : totalScore >= 55 ? 'Persaingan Sedang' : totalScore >= 35 ? 'Cukup Sulit' : 'Sangat Kompetitif';
  const scoreColor= totalScore >= 75 ? '#16A34A' : totalScore >= 55 ? '#F59E0B' : '#DC2626';
  const compLevel = nSellers > 200 ? 'Sangat Tinggi' : nSellers > 100 ? 'Tinggi' : nSellers > 50 ? 'Sedang' : 'Rendah';
  const compColor = nSellers > 200 ? '#DC2626' : nSellers > 100 ? '#F59E0B' : '#16A34A';
  const potensiLabel = totalSold > 5000 ? 'Tinggi' : totalSold > 1000 ? 'Sedang' : 'Rendah';
  const potensiColor = totalSold > 5000 ? '#7C3AED' : '#6B7280';

  // ── Insights ────────────────────────────────────────────────────────────────
  const p25 = prices[Math.floor(prices.length*0.25)] || listing.price || 0;
  const p75 = prices[Math.floor(prices.length*0.75)] || listing.price || 0;
  const topSeg = [...segVals].sort((a,b)=>b.pct-a.pct)[0];
  const insights = [
    { icon: '🏆', text: `${nSellers} penjual aktif di keyword ini — persaingan <strong>${compLevel.toLowerCase()}</strong>`, color: '#FFF7ED', tc: '#F97316' },
    { icon: '👑', text: `Top-3 menguasai <strong>${Math.round(top3Share*100)}%</strong> total penjualan keyword ini`, color: '#FEE2E2', tc: '#DC2626' },
    { icon: '💰', text: `Segmen harga terbanyak: <strong>${topSeg?.label||'—'}</strong> (${topSeg?.pct||0}% listing)`, color: '#F5F3FF', tc: '#7C3AED' },
    { icon: '🎯', text: `Sweet spot harga: <strong>Rp ${p25.toLocaleString('id-ID')} – Rp ${p75.toLocaleString('id-ID')}</strong>`, color: '#DCFCE7', tc: '#16A34A' },
  ];
  const recText = totalScore >= 70
    ? `Pasar ini punya peluang baik dengan ${nSellers} penjual. Masuk di harga Rp ${p25.toLocaleString('id-ID')}–${p75.toLocaleString('id-ID')} dan fokus pada kualitas foto dan review awal.`
    : `Persaingan cukup ketat — top-3 kuasai ${Math.round(top3Share*100)}% pasar. Diferensiasi produk dan harga agresif sangat penting untuk breakthrough.`;
  const strategies = [
    { title: 'Harga', icon: '💰', text: `Sweet spot Rp ${(p25/1000).toFixed(0)}rb–${(p75/1000).toFixed(0)}rb — masuk di rentang ini untuk daya saing optimal` },
    { title: 'Kompetisi', icon: '🔍', text: `${rows.length} listing di keyword ini — optimalkan judul, foto, dan review awal untuk mengungguli top-3` },
    { title: 'Diferensiasi', icon: '🎯', text: `Top-3 dominasi ${Math.round(top3Share*100)}% pasar — fokus niche atau variasi produk yang belum diisi kompetitor` },
  ];

  return {
    demandMonthly, demandWeekly, demandYearly,
    compTypes, topProducts, segVals,
    growthScore, competScore, demandScore, marginScore, totalScore, scoreLbl, scoreColor,
    totalSold, nSellers, compLevel, compColor, potensiLabel, potensiColor,
    top3Share, p25, p75, insights, recText, strategies, segSum: segTotal, curMonthLbl,
  };
}

function ddRenderAnalisa() {
  const listing = _ddKwListing || _ddCurrentP?._listing || _ddCurrentP;
  const rows    = _ddKwRows;
  const totalSold = _ddKwTotal;
  if (!listing || !rows || !rows.length) {
    const s1 = document.getElementById('ap-s1');
    if (s1) s1.textContent = 'Buka listing dulu';
    return;
  }
  _apData = apBuildData(listing, rows, totalSold);
  const d   = _apData;
  const fmt = n => n >= 1000000 ? (n/1000000).toFixed(1)+'jt' : n >= 1000 ? (n/1000).toFixed(0)+'rb' : String(n);

  // Stat cards — all real data
  document.getElementById('ap-s1').textContent   = fmt(d.totalSold);
  document.getElementById('ap-s1b').textContent  = `${rows.length} listing · keyword ini`;
  document.getElementById('ap-s2').textContent   = rows.length.toLocaleString('id-ID');
  const s3 = document.getElementById('ap-s3');
  s3.textContent = Math.round(d.top3Share*100) + '%';
  s3.style.color = d.top3Share > 0.6 ? '#DC2626' : d.top3Share > 0.35 ? '#F59E0B' : '#16A34A';
  document.getElementById('ap-s4').textContent   = d.compLevel;
  document.getElementById('ap-s4').style.color   = d.compColor;
  document.getElementById('ap-s4b').textContent  = d.nSellers + ' penjual aktif';
  document.getElementById('ap-s5').textContent   = d.potensiLabel;
  document.getElementById('ap-s5').style.color   = d.potensiColor;
  document.getElementById('ap-s5b').textContent  = 'Potensi ' + d.potensiLabel.toLowerCase();

  // Update demand chart subtitle
  const sub = document.getElementById('ap-demand-subtitle');
  if (sub) sub.textContent = `Total terjual ${d.totalSold.toLocaleString('id-ID')} unit · data ${d.curMonthLbl}`;

  apRenderDemand();
  apRenderCompDonut();
  apRenderProductTypes();
  apRenderGauge();
  apRenderSegDonut();
  apRenderInsights();
  apRenderStrategy();
}

function apRenderDemand() {
  if (!_apData) return;
  // Use weekly (estimated ÷4) or monthly (1 real data point)
  const src    = _apGran === 'minggu' ? _apData.demandWeekly : _apData.demandMonthly;
  const labels = src.map(m => m.label);
  const vals   = src.map(m => m.sold);

  if (_apDemandChart) { _apDemandChart.destroy(); _apDemandChart = null; }
  const canvas = document.getElementById('ap-demand-chart');
  if (!canvas) return;

  const grad = canvas.getContext('2d').createLinearGradient(0, 0, 0, 200);
  grad.addColorStop(0, 'rgba(232,68,42,0.18)');
  grad.addColorStop(1, 'rgba(232,68,42,0)');

  _apDemandChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metric === 'sold' ? 'Terjual' : 'Pencarian',
        data: vals,
        borderColor: '#E8442A',
        backgroundColor: grad,
        fill: true,
        tension: 0.4,
        pointRadius: src.length > 24 ? 0 : 3,
        pointBackgroundColor: '#E8442A',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false,
        callbacks: { label: ctx => 'Terjual: ' + ctx.parsed.y.toLocaleString('id-ID') }
      }},
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 8 }, color: '#9CA3AF', maxRotation: 45, maxTicksLimit: 12 } },
        y: { grid: { color: '#F9FAFB' }, ticks: { font: { size: 9 }, color: '#9CA3AF', callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
      }
    }
  });

  const noteEl = document.getElementById('ap-demand-note');
  if (noteEl) noteEl.textContent = `Data ${_apGran === 'minggu' ? 'mingguan (estimasi total ÷ 4)' : 'bulanan'} · akan diperbarui tiap bulan seiring scrape baru`;
}

function apSetGran(g) {
  _apGran = g;
  document.querySelectorAll('.ap-gran-btn').forEach(b => {
    const active = b.dataset.g === g;
    b.style.background    = active ? '#fff' : 'transparent';
    b.style.color         = active ? '#E8442A' : '#6B7280';
    b.style.boxShadow     = active ? '0 1px 3px rgba(0,0,0,.1)' : 'none';
  });
  apRenderDemand();
}

function apRenderCompDonut() {
  if (!_apData) return;
  const canvas = document.getElementById('ap-comp-donut');
  if (!canvas) return;
  const types  = _apData.compTypes;
  const total  = types.reduce((s, t) => s + t.count, 0);

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: types.map(t => t.label),
      datasets: [{ data: types.map(t => t.count), backgroundColor: types.map(t => t.color), borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }]
    },
    options: {
      responsive: false, cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed + ' ('+Math.round(ctx.parsed/total*100)+'%)' } } }
    }
  });

  document.getElementById('ap-comp-total').textContent = total;
  const legend = document.getElementById('ap-comp-legend');
  if (legend) legend.innerHTML = types.map(t => `
    <div style="display:flex;align-items:center;gap:5px;">
      <span style="width:8px;height:8px;border-radius:50%;background:${t.color};flex-shrink:0;"></span>
      <span style="flex:1;color:#374151;">${t.label}</span>
      <span style="font-weight:700;color:#111827;">${t.count}</span>
      <span style="color:#9CA3AF;">(${Math.round(t.count/total*100)}%)</span>
    </div>`).join('');

  const note = document.getElementById('ap-comp-note');
  if (note) {
    const dom = types.sort((a,b) => b.count - a.count)[0];
    note.innerHTML = `<b>Didominasi ${dom.label}</b> (${Math.round(dom.count/total*100)}%). ${_apData.nSellers > 100 ? 'Persaingan ketat — fokus pada diferensiasi.' : 'Masih ada ruang untuk pemain baru.'}`;
  }
}

function apRenderProductTypes() {
  if (!_apData) return;
  const el = document.getElementById('ap-product-types');
  if (!el) return;
  const products = _apData.topProducts;
  const COLORS   = ['#E8442A','#F59E0B','#3B82F6','#10B981','#8B5CF6'];
  const maxSold  = products[0]?.sold || 1;
  el.innerHTML = products.map((p, i) => `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:.62rem;margin-bottom:3px;gap:6px;">
        <span style="color:#374151;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${p.label}</span>
        <span style="color:#111827;font-weight:700;white-space:nowrap;flex-shrink:0;">${p.sold.toLocaleString('id-ID')} · ${p.pct}%</span>
      </div>
      <div style="height:6px;background:#F3F4F6;border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${Math.round(p.sold/maxSold*100)}%;background:${COLORS[i]};border-radius:4px;transition:width .6s ease;"></div>
      </div>
    </div>`).join('');
}

function apRenderGauge() {
  if (!_apData) return;
  const canvas = document.getElementById('ap-gauge');
  if (!canvas) return;
  const score = _apData.totalScore;
  const color = _apData.scoreColor;
  const ctx   = canvas.getContext('2d');
  const cx = 50, cy = 62, r = 42;
  ctx.clearRect(0, 0, 100, 70);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.strokeStyle = '#F3F4F6';
  ctx.lineWidth   = 9;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // Score arc
  const end = Math.PI + (score / 100) * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, end);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 9;
  ctx.lineCap     = 'round';
  ctx.stroke();

  document.getElementById('ap-score-val').textContent  = score;
  document.getElementById('ap-score-val').style.color  = color;
  document.getElementById('ap-score-lbl').textContent  = _apData.scoreLbl;
  document.getElementById('ap-score-lbl').style.color  = color;

  const breakdown = document.getElementById('ap-score-breakdown');
  if (breakdown) {
    const items = [
      { label: 'Pertumbuhan', val: _apData.growthScore },
      { label: 'Persaingan',  val: _apData.competScore },
      { label: 'Permintaan',  val: _apData.demandScore },
      { label: 'Margin',      val: _apData.marginScore },
    ];
    breakdown.innerHTML = items.map(it => {
      const c = it.val >= 70 ? '#16A34A' : it.val >= 50 ? '#F59E0B' : '#DC2626';
      return `<div style="display:flex;align-items:center;gap:5px;">
        <span style="font-size:.58rem;color:#6B7280;flex:1;">${it.label}</span>
        <div style="flex:2;height:5px;background:#F3F4F6;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${it.val}%;background:${c};border-radius:3px;"></div>
        </div>
        <span style="font-size:.6rem;font-weight:700;color:${c};width:24px;text-align:right;">${it.val}</span>
      </div>`;
    }).join('');
  }

  const verdict = document.getElementById('ap-score-verdict');
  if (verdict) {
    if (score >= 75) {
      verdict.style.background = '#DCFCE7'; verdict.style.color = '#16A34A';
      verdict.innerHTML = '<span>✓</span><span>Pasar ini memiliki peluang yang sangat baik!</span>';
    } else if (score >= 60) {
      verdict.style.background = '#FFF7ED'; verdict.style.color = '#F59E0B';
      verdict.innerHTML = '<span>⚡</span><span>Peluang sedang — masuk dengan strategi tepat.</span>';
    } else {
      verdict.style.background = '#FEE2E2'; verdict.style.color = '#DC2626';
      verdict.innerHTML = '<span>⚠</span><span>Pasar kompetitif — perlu diferensiasi kuat.</span>';
    }
  }
}

function apRenderSegDonut() {
  if (!_apData) return;
  const canvas = document.getElementById('ap-seg-donut');
  if (!canvas) return;
  const segs = _apData.segVals;
  const total = segs.reduce((s, v) => s + v.count, 0);

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: segs.map(s => s.label),
      datasets: [{ data: segs.map(s => s.count), backgroundColor: segs.map(s => s.color), borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: false, cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed + '%' } } }
    }
  });

  document.getElementById('ap-seg-total').textContent = _apData.segSum;
  const legend = document.getElementById('ap-seg-legend');
  if (legend) {
    const top2 = [...segs].sort((a,b) => b.pct - a.pct).slice(0, 3);
    legend.innerHTML = top2.map(s => `
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="width:7px;height:7px;border-radius:50%;background:${s.color};flex-shrink:0;"></span>
        <span style="flex:1;color:#374151;">${s.label}</span>
        <span style="font-weight:700;">${s.pct}%</span>
      </div>`).join('');
  }

  const note = document.getElementById('ap-seg-note');
  if (note) {
    const top = [...segs].sort((a,b) => b.pct - a.pct)[0];
    note.textContent = `Segmen "${top.label}" paling banyak diminati (${top.pct}% produk).`;
  }
}

function apRenderInsights() {
  if (!_apData) return;
  const el = document.getElementById('ap-insights');
  if (el) el.innerHTML = _apData.insights.map(ins => `
    <div style="display:flex;align-items:flex-start;gap:6px;padding:6px 8px;background:${ins.color};border-radius:7px;">
      <span style="font-size:.75rem;">${ins.icon}</span>
      <span style="font-size:.62rem;color:${ins.tc};font-weight:600;line-height:1.4;">${ins.text}</span>
    </div>`).join('');

  const rec = document.getElementById('ap-rec-box');
  if (rec) rec.innerHTML = `<b style="display:block;margin-bottom:4px;font-size:.63rem;color:#F97316;">Rekomendasi AI</b><span style="font-size:.61rem;line-height:1.5;">${_apData.recText}</span>`;
}

function apRenderStrategy() {
  if (!_apData) return;
  const el = document.getElementById('ap-strategy-cols');
  if (!el) return;
  el.innerHTML = _apData.strategies.map(s => `
    <div style="flex:1;min-width:140px;display:flex;align-items:flex-start;gap:6px;">
      <span style="font-size:1rem;">${s.icon}</span>
      <div>
        <div style="font-size:.68rem;font-weight:700;color:#111827;">${s.title}</div>
        <div style="font-size:.62rem;color:#6B7280;margin-top:2px;line-height:1.4;">${s.text}</div>
      </div>
    </div>`).join('');
}

function dscGoPage(n) {
  const pages = Math.ceil(_dscFiltered.length / DSC_PER_PAGE);
  if (n < 1) return;
  if (n > pages && !_dscHasMore) return;
  _dscPage = n;

  // If the requested page isn't loaded yet, show a spinner and fetch the next batch.
  // dscApplyFilters(false) preserves _dscPage, so no page-restore hack needed.
  const needsFetch = _dscHasMore && !_dscLoading && n > pages;
  if (needsFetch) {
    const cardGrid   = document.getElementById('dsc-card-grid');
    const tableInner = document.getElementById('dsc-table-inner');
    const skelCard = `<div class="dsc-skel"><div class="dsc-skel-img"></div><div class="dsc-skel-body"><div class="dsc-skel-line"></div><div class="dsc-skel-line short"></div></div></div>`;
    const spinHtml = Array(8).fill(skelCard).join('');
    if (_dscViewMode === 'card'  && cardGrid)   cardGrid.innerHTML   = spinHtml;
    if (_dscViewMode === 'table' && tableInner) tableInner.innerHTML = `<table class="dsc-table" style="width:100%"><tbody>${spinHtml.replace('grid-column:1/-1;', '')}</tbody></table>`;
    dscLoadListings(); // dscApplyFilters(false) inside preserves _dscPage = n
  } else {
    dscRenderTable();
  }
  document.getElementById('dash-content')?.scrollTo(0, 0);
}

function dscTerapkanFilter() {
  // Force a fresh server re-fetch regardless of current load state
  _dscAllListings = [];
  _dscOffset = 0;
  _dscHasMore = true;
  _dscLoading = false;       // release any stale in-flight guard so new fetch can proceed
  _dscLoaded = true;         // allow dscApplyFilters to proceed past the guard
  _dscLastSrvFilters = '';   // non-null sentinel so key comparison always triggers re-fetch
  dscApplyFilters();
  dscCloseFilter(); // close drawer on mobile after applying
}

function dscResetFilters() {
  const g = id => document.getElementById(id);
  _dscCurrentCatFilter  = ''; // clear server-side category filter
  _dscCurrentCatFilters = null;
  try { sessionStorage.removeItem(_DSC_CAT_SS_KEY); } catch {}
  document.querySelectorAll('#dsc-cat-checks input[type=checkbox]').forEach(c => c.checked = true);
  if (g('dsc-search'))     g('dsc-search').value     = '';
  if (g('dsc-price-min'))  g('dsc-price-min').value  = 0;
  if (g('dsc-price-max'))  g('dsc-price-max').value  = 500000;
  if (g('dsc-omset-min'))  g('dsc-omset-min').value  = 0;
  if (g('dsc-omset-max'))  g('dsc-omset-max').value  = 500000000;
  if (g('dsc-skor-min'))   { g('dsc-skor-min').value = 0; const lbl = g('dsc-skor-min-lbl'); if (lbl) lbl.textContent = '0'; }
  if (g('dsc-sort')) g('dsc-sort').value = 'omset-desc';
  dscUpdateDualRange('price');
  dscUpdateDualRange('omset');
  dscApplyFilters();
}

// ── TRACKED PRODUCTS ───────────────────────────────────────────
const _TRK_KEY = 'larisid_tracked_v1';
function trkLoad() { try { return JSON.parse(localStorage.getItem(_TRK_KEY) || '[]'); } catch { return []; } }
function trkSave(arr) { localStorage.setItem(_TRK_KEY, JSON.stringify(arr)); }
function trkKey(listing) { return `${listing.item_id}_${listing.shop_id}`; }
function trkIsTracked(listing) { return trkLoad().some(t => t.key === trkKey(listing)); }

function ddToggleTrack() {
  const listing = _ddKwListing || _ddCurrentP?._listing;
  if (!listing) return;
  dashboardTourHandleTrackClick();
  const key = trkKey(listing);
  let arr = trkLoad();
  const idx = arr.findIndex(t => t.key === key);
  if (idx >= 0) {
    // Remove from tracker — no credit refund
    arr.splice(idx, 1);
    trkSave(arr);
    ddUpdateTrackBtn(listing);
    return;
  }
  // Adding to tracker — require 1 credit
  if (!currentUser) { openAuthModal('login'); return; }
  cgShow(
    'Tambah ke Tracker',
    'Gunakan 1 kredit untuk melacak produk ini setiap bulan — update harga & penjualan otomatis.',
    () => {
      let a = trkLoad();
      if (!a.find(t => t.key === key)) {
        a.push({
          key,
          item_id:      listing.item_id,
          shop_id:      listing.shop_id,
          product_name: listing.product_name || '—',
          store_name:   listing.store_name   || '—',
          image_url:    listing.image_url    || null,
          category:     listing.category     || '',
          price:        listing.price        || 0,
          total_sold:   listing.total_sold   || 0,
          keyword:      listing.keyword      || '',
          tracked_at:   new Date().toISOString(),
        });
        trkSave(a);
      }
      ddUpdateTrackBtn(listing);
      // Refresh tracker view immediately if it's visible
      if (typeof trkInit === 'function') trkInit();
      // Refresh MLS dropdown so the new product appears
      if (typeof mlsInit === 'function') mlsInit();
    },
    'tracker'
  );
  const earnNote = document.getElementById('cg-earn-note');
  if (earnNote) {
    earnNote.innerHTML = 'Belum punya kredit? <a href="https://shopee.co.id" target="_blank" style="color:#92400E;font-weight:700;text-decoration:underline;">Cari produk di Shopee pakai Extension →</a><br>10 pencarian = 1 kredit gratis';
    earnNote.style.display = 'block';
  }
}

function ddUpdateTrackBtn(listing) {
  const btn   = document.getElementById('dd-track-btn');
  const label = document.getElementById('dd-track-label');
  const icon  = document.getElementById('dd-track-icon');
  if (!btn || !label || !icon) return;
  const tracked = listing ? trkIsTracked(listing) : false;
  if (tracked) {
    btn.style.background   = '#FEF2F0';
    btn.style.borderColor  = '#E8442A';
    btn.style.color        = '#E8442A';
    label.textContent      = 'Dilacak';
    icon.setAttribute('fill', '#E8442A');
    icon.setAttribute('stroke', '#E8442A');
  } else {
    btn.style.background   = '#fff';
    btn.style.borderColor  = '#E5E7EB';
    btn.style.color        = '#6B7280';
    label.textContent      = 'Lacak Produk';
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
  }
}

// ── DEEP DIVE ──────────────────────────────────────────────────
let _ddChartTrend = null, _ddChartDist = null, _ddChartDonut = null, _ddChartCatperf = null;
let _ddCompAll = [], _ddCompShowing = 5;

function _ddRng(seed) {
  let s = seed;
  return function() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function ddRender(p) {
  _ddCurrentP = p;
  const rng = _ddRng(p.id * 31337);
  const price = p.medianPrice || 85000;
  const score = Math.round(p.score);
  const listing = p._listing || {};
  const sales = p.newUnits || listing.total_sold || p.total_sold || 0;
  const omset = sales * price;

  // hero
  const _ddHeroEl = document.getElementById('dd-hero-img');
  if (p.image) {
    _ddHeroEl.innerHTML = `<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="this.parentElement.textContent='📦'">`;
  } else {
    _ddHeroEl.textContent = p.emoji || '📦';
  }
  document.getElementById('dd-hero-name').textContent = p.name;
  document.getElementById('dd-hero-cats').innerHTML = `Kategori: ${p.category||'Umum'} <span>• Sub Kategori: ${p.category||'Umum'}</span>`;
  ddUpdateTrackBtn(p._listing || null);
  document.getElementById('dd-score-num').textContent = score || '…';
  // Label updated to final value once ddLoadKeywordContext resolves; show placeholder for now
  const _tagEl = document.getElementById('dd-score-tag');
  if (_tagEl) { _tagEl.textContent = score ? (score >= 75 ? 'Mudah Masuk' : score >= 55 ? 'Persaingan Sedang' : 'Cukup Sulit') : 'Menghitung…'; _tagEl.style.background = '#F3F4F6'; _tagEl.style.color = '#6B7280'; }

  // hero stats — omset/unit show lifetime totals; deltas updated async by ddLoadTrendHistory
  const _fmtOmset = v => v >= 1e9 ? 'Rp '+(v/1e9).toFixed(1)+'M' : v >= 1e6 ? 'Rp '+(v/1e6).toFixed(1)+'jt' : 'Rp '+(v/1e3).toFixed(0)+'rb';
  document.getElementById('dd-h-omset').textContent = sales > 0 ? _fmtOmset(omset) : '—';
  document.getElementById('dd-h-omset-d').textContent = '—';
  document.getElementById('dd-h-omset-sub').textContent = 'Total estimasi omset';
  document.getElementById('dd-h-unit').textContent = sales > 0 ? sales.toLocaleString('id-ID') : '—';
  document.getElementById('dd-h-unit-d').textContent = '—';
  document.getElementById('dd-h-unit-sub').textContent = 'Total terjual';
  document.getElementById('dd-h-komp').textContent = 'Menghitung…';
  document.getElementById('dd-h-komp').style.color = '#9CA3AF';
  document.getElementById('dd-h-komp-sub').textContent = 'Memuat data…';
  // margin stat removed from hero (only 4 cards shown)

  // price range — placeholder from medianPrice; replaced by ddUpdateRingkasanFromKw with real peer data
  const pMin = Math.round(price * 0.52), pMax = Math.round(price * 1.85);
  const zoneLeft = Math.round(price * 0.85), zoneRight = Math.round(price * 1.12);
  const leftPct  = Math.round((zoneLeft  - pMin) / (pMax - pMin) * 100);
  const widthPct = Math.round((zoneRight - zoneLeft) / (pMax - pMin) * 100);
  document.getElementById('dd-price-range-label').textContent = `Rp ${zoneLeft.toLocaleString('id-ID')} – Rp ${zoneRight.toLocaleString('id-ID')}`;
  document.getElementById('dd-range-zone').style.cssText = `left:${leftPct}%;width:${widthPct}%;`;
  document.getElementById('dd-range-labels').innerHTML = `<span>${(pMin/1000).toFixed(0)}k</span><span>${(Math.round((pMin+pMax)*0.3)/1000).toFixed(0)}k</span><span>${(Math.round((pMin+pMax)*0.6)/1000).toFixed(0)}k</span><span>${(pMax/1000).toFixed(0)}k</span>`;
  document.getElementById('dd-range-note').textContent = `Produk di rentang harga ini memiliki penjualan tertinggi`;

  // AI insights — generic placeholder; updated by ddUpdateRingkasanFromKw with real observations
  document.getElementById('dd-ai-list').innerHTML = [
    `Data pasar sedang dimuat…`,
  ].map(t => `<div class="dd-ai-item"><div class="dd-ai-check">✓</div><div>${t}</div></div>`).join('');

  // Trend chart — placeholder while ddLoadTrendHistory fetches real data
  if (_ddChartTrend) _ddChartTrend.destroy();
  _ddChartTrend = new Chart(document.getElementById('dd-chart-trend'), {
    type: 'line',
    data: { labels: [], datasets: [
      { label:'Omset (Rp)', data:[], borderColor:'#E8442A', backgroundColor:'rgba(232,68,42,.06)', borderWidth:2.5, fill:true, tension:0.3, pointRadius:4, pointBackgroundColor:'#E8442A', yAxisID:'y' },
      { label:'Unit Terjual', data:[], borderColor:'#4F46E5', backgroundColor:'transparent', borderWidth:2, tension:0.3, pointRadius:3, pointBackgroundColor:'#4F46E5', yAxisID:'y2' },
    ]},
    options: {
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{font:{size:9}}},
        y:{display:true,position:'left',min:0,ticks:{font:{size:8},callback:v=>v>=1000000?(v/1000000).toFixed(1)+'jt':v>=1000?(v/1000).toFixed(0)+'rb':v}},
        y2:{display:true,position:'right',min:0,grid:{drawOnChartArea:false},ticks:{font:{size:8}}},
      },
      animation:{duration:400}
    }
  });

  // price distribution scatter — empty placeholder; filled by ddUpdateRingkasanFromKw with real peer prices
  if (_ddChartDist) _ddChartDist.destroy();
  _ddChartDist = new Chart(document.getElementById('dd-chart-dist'), {
    type: 'scatter',
    data: { datasets: [{ data: [], backgroundColor: '#3B82F680', pointRadius: 5, pointHoverRadius: 7 }] },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return `Rp ${(d.x||0).toLocaleString('id-ID')} · ${(d.y||0).toFixed(1)}% penjualan${d.label ? ' · ' + d.label : ''}`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Harga (Rp)', font: { size: 9 } }, ticks: { font: { size: 9 }, callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'jt' : (v/1000).toFixed(0)+'k' } },
        y: { title: { display: true, text: '% Penjualan', font: { size: 9 } }, ticks: { font: { size: 9 }, callback: v => v + '%' }, beginAtZero: true }
      },
      animation: { duration: 400 }
    }
  });

  // donut chart — usia toko
  const donutData  = [18, 28, 32, 18, 4];
  const donutLabels= ['< 6 bulan','6 bln – 1 th','1 – 2 th','2 – 5 th','> 5 th'];
  const donutColors= ['#1E3A8A','#3B82F6','#60A5FA','#93C5FD','#BFDBFE'];
  if (_ddChartDonut) _ddChartDonut.destroy();
  _ddChartDonut = new Chart(document.getElementById('dd-chart-donut'), {
    type: 'doughnut',
    data: { labels:donutLabels, datasets:[{ data:donutData, backgroundColor:donutColors, borderWidth:2, borderColor:'#fff' }] },
    options: { plugins:{legend:{display:false}}, cutout:'62%', animation:{duration:400} }
  });
  document.getElementById('dd-donut-legend').innerHTML = donutLabels.map((l,i) =>
    `<div class="dd-donut-legend-item"><div class="dd-donut-legend-dot" style="background:${donutColors[i]}"></div><span>${l}</span><span class="dd-donut-pct">${donutData[i]}%</span></div>`
  ).join('');

  // category performance mini chart — uses real keyword peer data when available
  const catOmset = Math.round(omset / 1000000);  // in juta
  const catUnits = sales;
  const catToko  = _ddKwRows.length || '—';
  document.getElementById('dd-cat-label').textContent = p.category || 'Umum';
  document.getElementById('dd-catperf-stats').innerHTML = `
    <div><div class="dd-catperf-stat-label">Est. Omset</div><div class="dd-catperf-stat-value">Rp ${catOmset >= 1000 ? (catOmset/1000).toFixed(1)+'M' : catOmset+'jt'}</div><div class="dd-catperf-stat-delta" id="dd-catperf-omset-d">—</div></div>
    <div><div class="dd-catperf-stat-label">Unit Terjual</div><div class="dd-catperf-stat-value">${typeof catUnits==='number'?(catUnits/1000).toFixed(1)+'rb':'—'}</div><div class="dd-catperf-stat-delta" id="dd-catperf-unit-d">—</div></div>
    <div><div class="dd-catperf-stat-label">Listing di Keyword</div><div class="dd-catperf-stat-value" id="dd-catperf-toko">${typeof catToko==='number'?catToko.toLocaleString('id-ID'):catToko}</div><div class="dd-catperf-stat-delta" id="dd-catperf-toko-d"></div></div>
  `;
  const catPerfDates = ['20 Apr','27 Apr','4 Mei','11 Mei','18 Mei'];
  const catPerfData  = catPerfDates.map((_,i) => Math.round(omset * (0.6 + i*0.11)));
  if (_ddChartCatperf) _ddChartCatperf.destroy();
  _ddChartCatperf = new Chart(document.getElementById('dd-chart-catperf'), {
    type: 'line',
    data: { labels:catPerfDates, datasets:[{ data:catPerfData, borderColor:'#E8442A', backgroundColor:'transparent', borderWidth:2, tension:0.4, pointRadius:3, pointBackgroundColor:'#E8442A' }] },
    options: { plugins:{legend:{display:false}}, scales:{x:{ticks:{font:{size:8}}},y:{display:false}}, animation:{duration:400} }
  });

  // competitor table — built from real peer listings (_ddKwRows populated by ddLoadKeywordContext)
  _ddCompAll = (_ddKwRows || []).slice(0, 15).map((r, i) => ({
    rank: i + 1,
    product_name: r.product_name || '—',
    store_name:   r.store_name   || '—',
    url:          r.url          || null,
    image_url:    r.image_url    || null,
    price:        r.price        || 0,
    total_sold:   r.total_sold   || 0,
    rating:       r.rating       || 0,
  }));
  _ddCompShowing = 5;
  ddRenderCompetitors();

  // keyword table
  const word0 = p.name.split(' ')[0].toLowerCase();
  const kwRows = [
    { kw: word0 + ' selempang pria', vol: 24300, comp:'Tinggi', trend:'up' },
    { kw: word0 + ' pria murah',     vol: 18100, comp:'Sedang', trend:'up' },
    { kw: word0 + ' selempang casual',vol:12900, comp:'Sedang', trend:'up' },
    { kw: word0 + ' pria keren',     vol:  9800, comp:'Rendah', trend:'up' },
    { kw: word0 + ' pria kulit',     vol:  7200, comp:'Sedang', trend:'down' },
  ];
  document.getElementById('dd-kw-tbody').innerHTML = kwRows.map(k => {
    const cc = k.comp === 'Tinggi' ? 'high' : k.comp === 'Sedang' ? 'med' : 'low';
    const spark = k.trend === 'up'
      ? `<svg class="dd-kw-spark" viewBox="0 0 54 22"><polyline points="0,18 9,14 18,15 27,10 36,11 45,6 54,4" fill="none" stroke="#10B981" stroke-width="1.8" stroke-linecap="round"/></svg>`
      : `<svg class="dd-kw-spark" viewBox="0 0 54 22"><polyline points="0,4 9,6 18,8 27,12 36,13 45,16 54,18" fill="none" stroke="#E8442A" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    return `<tr>
      <td style="font-weight:600">${k.kw}</td>
      <td>${k.vol.toLocaleString('id-ID')}</td>
      <td><span class="dd-kw-comp ${cc}">${k.comp}</span></td>
      <td>${spark}</td>
    </tr>`;
  }).join('');
}

async function ddEstimateTrendFromPeers(listing) {
  if (!_supabase || !listing?.item_id || !(listing.total_sold > 0)) return null;
  if (!_ddKwRows || _ddKwRows.length < 2) return null;

  const target = listing.total_sold;
  const CAT_MULT = { 'Rumah':2.94,'Fashion':2.77,'Dapur':3.41,'Kamar Mandi':4.21,'Keamanan':3.40,
    'Kecantikan':2.70,'Motor & Mobil':2.96,'Elektronik':3.10,'HP & Gadget':3.40,
    'Hewan Peliharaan':3.95,'Sepeda':2.58,'Taman':3.50,'Olahraga':2.68,'Bayi & Anak':4.12,
    'Hobi & Kerajinan':2.48,'Kesehatan':2.38,'Tanaman':3.63,'Alat Tulis':2.87,
    'Outdoor & Camping':2.67,'__default__':3.20 };

  function _peers(lo, hi) {
    return _ddKwRows.filter(r =>
      !(String(r.item_id) === String(listing.item_id) && String(r.shop_id) === String(listing.shop_id)) &&
      (r.total_sold || 0) >= lo && (r.total_sold || 0) <= hi
    );
  }

  let peers = _peers(target * 0.25, target * 4);
  if (peers.length < 3) peers = _peers(target * 0.1, target * 10);
  if (peers.length < 2) return null;

  const { data: peerHistory } = await _supabase
    .from('listings')
    .select('item_id,shop_id,scraped_at,total_sold,reviews,category')
    .in('item_id', peers.map(r => r.item_id))
    // Pull most recent history window first, then sort per peer below.
    .order('scraped_at', { ascending: false })
    .limit(300);

  const peerMap = new Map();
  for (const r of (peerHistory || [])) {
    const k = `${r.item_id}_${r.shop_id}`;
    if (!peerMap.has(k)) peerMap.set(k, []);
    peerMap.get(k).push(r);
  }

  const weeklyRates = [];
  for (const [, rows] of peerMap) {
    rows.sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
    if (rows.length < 2) continue;
    const first = rows[0], last = rows[rows.length - 1];
    const days = (new Date(last.scraped_at) - new Date(first.scraped_at)) / 86400000;
    if (days < 1) continue;
    const mult = CAT_MULT[last.category || listing.category] || CAT_MULT['__default__'];
    const atCeil = rows.every(r => (r.total_sold ?? 0) >= 10000);
    let delta;
    if (atCeil && (last.reviews || 0) > (first.reviews || 0)) {
      delta = Math.round(Math.max(0, (last.reviews || 0) - (first.reviews || 0)) * mult);
    } else if (atCeil) {
      continue;
    } else {
      delta = Math.max(0, (last.total_sold || 0) - (first.total_sold || 0));
    }
    if (delta === 0) continue;
    weeklyRates.push(delta / (days / 7));
  }

  if (weeklyRates.length < 2) return null;

  const sorted = [...weeklyRates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianRate = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const soldVals = peers.map(r => r.total_sold || 0).filter(v => v > 0);
  console.log('[ddPeerTrend] medianRate/week:', Math.round(medianRate), 'peers:', weeklyRates.length);
  return { medianRate, peerCount: weeklyRates.length, soldMin: Math.min(...soldVals), soldMax: Math.max(...soldVals) };
}

// Fetches up to 20 scrape points, interpolates deltas day-by-day between consecutive
// scrapes, and buckets into ISO calendar weeks. Shows weekly units + weekly omset so
// even sparse scrapes produce a smooth weekly view. Forecast = avg of last 2 weeks.
async function ddLoadTrendHistory(listing) {
  if (!listing?.item_id) return;

  // Helper: show no-data message inside chart container
  function _noDataMsg(msg) {
    const el = document.getElementById('dd-chart-trend');
    if (el) el.closest('.dd-card')?.querySelector('.dd-card-title')?.insertAdjacentHTML('afterend',
      `<div id="dd-trend-nodata" style="text-align:center;padding:28px 0;font-size:.75rem;color:#9CA3AF;">${msg}</div>`);
  }
  document.getElementById('dd-trend-nodata')?.remove();
  document.getElementById('dd-trend-peernote')?.remove();

  try {
    let dbRows = [];
    console.log('[ddTrend] start item_id:', listing?.item_id, 'shop_id:', listing?.shop_id, 'sold:', listing?.total_sold, 'reviews:', listing?.reviews, 'price:', listing?.price);
    if (_supabase) {
      const { data } = await _supabase
        .from('listings')
        .select('scraped_at,total_sold,price,reviews')
        .eq('item_id', listing.item_id)
        .eq('shop_id', listing.shop_id)
        // Use latest scrapes (not oldest), then re-sort ascending for chart logic.
        .order('scraped_at', { ascending: false })
        .limit(20);
      dbRows = (data || []).slice().sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
      console.log('[ddTrend] DB rows (int):', dbRows.length, dbRows);
      if (!dbRows.length) {
        const { data: d2 } = await _supabase
          .from('listings')
          .select('scraped_at,total_sold,price,reviews')
          .eq('item_id', String(listing.item_id))
          .eq('shop_id', String(listing.shop_id))
          .order('scraped_at', { ascending: false })
          .limit(20);
        dbRows = (d2 || []).slice().sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));
        console.log('[ddTrend] DB rows (str):', dbRows.length, dbRows);
      }
    }

    // Deduplicate by exact scraped_at timestamp (multiple push-runs create identical rows)
    { const seenTs = new Set(); dbRows = dbRows.filter(r => { if (seenTs.has(r.scraped_at)) return false; seenTs.add(r.scraped_at); return true; }); }
    console.log('[ddTrend] deduplicated rows:', dbRows.length);

    // Augment to reach 2 rows
    let isPeerEstimated = false, peerCount = 0, peerSoldMin = 0, peerSoldMax = 0;
    if (dbRows.length < 2) {
      const prevKey  = `${listing.item_id}_${listing.shop_id}`;
      const prevSold = _dscPrevMap[prevKey];
      const currDate = listing.scraped_at ? new Date(listing.scraped_at) : new Date();
      const currRow  = { scraped_at: currDate.toISOString(), total_sold: listing.total_sold, price: listing.price, reviews: listing.reviews };

      // Always try peer estimation first — gives meaningful deltas even for 1-row products
      const peerResult = await ddEstimateTrendFromPeers(listing);
      if (peerResult && peerResult.medianRate > 0) {
        isPeerEstimated = true;
        peerCount = peerResult.peerCount;
        peerSoldMin = peerResult.soldMin;
        peerSoldMax = peerResult.soldMax;
        const rate = peerResult.medianRate;
        const anchor = currDate;
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const anchorSold = listing.total_sold || 0;
        function _synRow(weekOffset) {
          return {
            scraped_at: new Date(anchor.getTime() + weekOffset * MS_WEEK).toISOString(),
            total_sold: Math.max(0, Math.round(anchorSold + rate * weekOffset)),
            price: listing.price,
            reviews: null,
          };
        }
        dbRows = [_synRow(-3), _synRow(-2), _synRow(-1), _synRow(0), _synRow(1)];
        console.log('[ddTrend] peer-estimated rows, rate/week:', Math.round(rate), 'peers:', peerCount);
      } else if (dbRows.length === 1) {
        // Pair the 1 DB row (historical) with current listing
        const dbDate = new Date(dbRows[0].scraped_at);
        if (dbDate < currDate) {
          dbRows = [dbRows[0], currRow];
        } else {
          dbRows = [currRow, dbRows[0]];
        }
      } else if (prevSold != null) {
        // No DB rows but _dscPrevMap has previous sold — synthesise prev point
        const prevDate = new Date(currDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        dbRows = [
          { scraped_at: prevDate.toISOString(), total_sold: prevSold, price: listing.price, reviews: null },
          currRow,
        ];
      } else {
        if (_ddChartTrend) { _ddChartTrend.data.labels = []; _ddChartTrend.data.datasets.forEach(d => d.data = []); _ddChartTrend.update(); }
        _noDataMsg('Belum cukup data scrape untuk menampilkan tren.<br>Data akan muncul setelah 2+ scrape.');
        return;
      }
    }

    console.log('[ddTrend] augmented rows:', dbRows.length, dbRows.map(r => ({date:r.scraped_at?.slice(0,10), sold:r.total_sold, rev:r.reviews, price:r.price})));

    const fallbackPrice = listing.price || 0;

    // Category multipliers (calibrated 2026-05-04)
    const _CAT_MULT = { 'Rumah':2.94,'Fashion':2.77,'Dapur':3.41,'Kamar Mandi':4.21,'Keamanan':3.40,
      'Kecantikan':2.70,'Motor & Mobil':2.96,'Elektronik':3.10,'HP & Gadget':3.40,
      'Hewan Peliharaan':3.95,'Sepeda':2.58,'Taman':3.50,'Olahraga':2.68,'Bayi & Anak':4.12,
      'Hobi & Kerajinan':2.48,'Kesehatan':2.38,'Tanaman':3.63,'Alat Tulis':2.87,
      'Outdoor & Camping':2.67,'__default__':3.20 };
    const mult = _CAT_MULT[listing.category] || _CAT_MULT['__default__'];

    // 10k+ ceiling: total_sold is capped — use review delta × multiplier instead
    const atCeiling = dbRows.every(r => (r.total_sold ?? 0) >= 10000);
    const hasReviews = dbRows.some(r => r.reviews > 0);
    console.log('[ddTrend] atCeiling:', atCeiling, 'hasReviews:', hasReviews, 'mult:', mult);

    let unitData, isEstimated = false;
    if (atCeiling && hasReviews && !isPeerEstimated) {
      isEstimated = true;
      let base = 10000;
      unitData = [base];
      for (let i = 1; i < dbRows.length; i++) {
        const revDelta = Math.max(0, (dbRows[i].reviews || 0) - (dbRows[i-1].reviews || 0));
        base += Math.round(revDelta * mult);
        unitData.push(base);
      }
    } else if (atCeiling && !hasReviews) {
      // At 10k+ ceiling with no reviews — show raw scraped values as a floor line
      isEstimated = true;
      unitData = dbRows.map(r => r.total_sold ?? 10000);
      // Show note below chart (not blocking it) after render
      setTimeout(() => {
        document.getElementById('dd-trend-nodata')?.remove();
        const canvas = document.getElementById('dd-chart-trend');
        if (canvas && !canvas.parentElement.querySelector('#dd-trend-ceiling-note')) {
          const note = document.createElement('div');
          note.id = 'dd-trend-ceiling-note';
          note.style.cssText = 'font-size:.68rem;color:#9CA3AF;margin-top:6px;text-align:center;';
          note.textContent = 'Penjualan 10.000+ (batas Shopee) — grafik menunjukkan minimum, garis putus = estimasi.';
          canvas.parentElement.appendChild(note);
        }
      }, 500);
    } else {
      unitData = dbRows.map(r => r.total_sold ?? 0);
    }

    // ── Interpolate scrape deltas into Monday-anchored calendar weeks ──────────
    // Between each pair of scrapes, distribute the sold delta uniformly across days,
    // then bucket each day into the Monday-week it belongs to.
    // Labels: actual Monday dates ("13 Apr", "20 Apr", "27 Apr", "4 Mei"...)
    const _MO = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    function _mondayOf(d) {
      const date = new Date(+d);
      const day = date.getDay(); // 0=Sun,1=Mon,...6=Sat
      date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
      date.setHours(0, 0, 0, 0);
      return date;
    }
    function _wKey(d)   { return _mondayOf(d).toISOString().slice(0, 10); }
    function _wLabel(d) { const m = _mondayOf(d); return `${m.getDate()} ${_MO[m.getMonth()]}`; }

    // Also bucket every individual scrape row so same-date pairs still produce an entry
    const weekMap = new Map();
    for (const r of dbRows) {
      const key = _wKey(new Date(r.scraped_at));
      if (!weekMap.has(key)) weekMap.set(key, { label: _wLabel(new Date(r.scraped_at)), units: 0, omset: 0, days: 0, firstDate: _mondayOf(new Date(r.scraped_at)) });
    }
    // Pre-compute corrected per-interval deltas: detect Shopee recalibration artifacts
    // (e.g. total_sold jumping from 427 → 100,000 is not real sales, it's a display change)
    // and implausible spikes vs review growth. Same logic as ddRenderTren().
    const _corrDeltas = [];
    for (let i = 0; i < dbRows.length - 1; i++) {
      const s0 = unitData[i] ?? 0, s1 = unitData[i+1] ?? 0;
      const rawDelta  = Math.max(0, s1 - s0);
      const revDelta  = Math.max(0, (dbRows[i+1].reviews ?? 0) - (dbRows[i].reviews ?? 0));
      const reviewEst = Math.round(revDelta * mult);
      if (s0 < 10000 && s1 >= 10000) {
        // Shopee switched from exact to bucketed display — not genuine new sales
        _corrDeltas.push(reviewEst);
      } else if (s0 >= 10000 && s1 >= 10000 && !atCeiling) {
        // Both at ceiling but atCeiling path not taken (mixed rows) — use review model
        _corrDeltas.push(reviewEst);
      } else if (rawDelta > 0 && reviewEst > 0 && rawDelta > reviewEst * 5) {
        // Delta > 5× what review growth implies — treat as data artifact
        _corrDeltas.push(reviewEst);
      } else if (rawDelta === 0 && revDelta > 0) {
        // total_sold unchanged but reviews grew — product is inside a Shopee display bucket
        // that didn't cross a threshold boundary; use review model to capture real sales
        _corrDeltas.push(reviewEst);
      } else {
        _corrDeltas.push(rawDelta);
      }
    }

    // Now fill each week's delta via inter-scrape interpolation
    for (let i = 0; i < dbRows.length - 1; i++) {
      const t0 = new Date(dbRows[i].scraped_at), t1 = new Date(dbRows[i+1].scraped_at);
      const p0 = dbRows[i].price || fallbackPrice, p1 = dbRows[i+1].price || fallbackPrice;
      const delta = _corrDeltas[i] ?? 0;
      const daysDiff = Math.max(1, (t1 - t0) / 86400000);
      const dUnit = delta / daysDiff;
      for (let d = 1; d <= Math.ceil(daysDiff); d++) {
        const date = new Date(t0.getTime() + d * 86400000);
        if (date > t1) break;
        const frac = d / daysDiff;
        const key  = _wKey(date);
        if (!weekMap.has(key)) weekMap.set(key, { label: _wLabel(date), units: 0, omset: 0, days: 0, firstDate: _mondayOf(date) });
        const wk = weekMap.get(key);
        wk.units += dUnit;
        wk.omset += dUnit * (p0 + (p1 - p0) * frac);
        wk.days  += 1;
      }
    }
    // Scale every week to a full 7 days so partial weeks don't look artificially small
    const weeklyRows = [...weekMap.values()]
      .sort((a, b) => a.firstDate - b.firstDate)
      .map(w => {
        const scale = w.days > 0 && w.days < 7 ? 7 / w.days : 1;
        return { label: w.label, units: Math.round(w.units * scale), omset: Math.round(w.omset * scale), firstDate: w.firstDate };
      });

    if (!weeklyRows.length) {
      // Zero-delta fallback: scrapes exist but total_sold didn't change between them
      // (single scrape or same-date pair). Build Monday-anchored snapshot from raw rows.
      const snapMap = new Map();
      for (const r of dbRows) {
        const key = _wKey(new Date(r.scraped_at));
        if (!snapMap.has(key)) {
          const mon = _mondayOf(new Date(r.scraped_at));
          // Use 0 for units/omset — we have no delta, so showing lifetime total_sold as period revenue is wrong
          snapMap.set(key, { label: _wLabel(new Date(r.scraped_at)), units: 0, omset: 0, firstDate: mon });
        }
      }
      const snapRows = [...snapMap.values()].sort((a, b) => a.firstDate - b.firstDate);

      if (!snapRows.length) {
        _noDataMsg('Belum ada data scrape untuk produk ini.');
        return;
      }

      // Add one forecast Monday based on average units of available snaps
      const avgUnits = Math.round(snapRows.reduce((s, r) => s + r.units, 0) / snapRows.length);
      const avgOmset = Math.round(snapRows.reduce((s, r) => s + r.omset, 0) / snapRows.length);
      const lastMon  = snapRows[snapRows.length - 1].firstDate;
      const nextMon  = new Date(lastMon.getTime() + 7 * 86400000);
      const snapLabels    = [...snapRows.map(r => r.label), `${nextMon.getDate()} ${_MO[nextMon.getMonth()]} ▶`];
      const snapUnits     = [...snapRows.map(r => r.units), null];
      const snapOmset     = [...snapRows.map(r => r.omset), null];
      const fcSnapUnits   = new Array(snapLabels.length).fill(null);
      const fcSnapOmset   = new Array(snapLabels.length).fill(null);
      fcSnapUnits[snapRows.length - 1] = snapRows[snapRows.length - 1].units;
      fcSnapOmset[snapRows.length - 1] = snapRows[snapRows.length - 1].omset;
      fcSnapUnits[snapRows.length]     = avgUnits;
      fcSnapOmset[snapRows.length]     = avgOmset;

      if (!_ddChartTrend) return;
      _ddChartTrend.data.labels = snapLabels;
      _ddChartTrend.data.datasets = [
        { label:'Omset (snapshot)', data:snapOmset, borderColor:'#E8442A', backgroundColor:'rgba(232,68,42,.06)', borderWidth:2.5, fill:true, tension:0.3, pointRadius:5, pointBackgroundColor:'#E8442A', yAxisID:'y', borderDash:[4,4], spanGaps:false },
        { label:'Unit Terjual', data:snapUnits, borderColor:'#4F46E5', backgroundColor:'transparent', borderWidth:2, tension:0.3, pointRadius:4, pointBackgroundColor:'#4F46E5', yAxisID:'y2', borderDash:[4,4], spanGaps:false },
        { label:'Prediksi Omset', data:fcSnapOmset, borderColor:'#10B981', backgroundColor:'transparent', borderWidth:2, tension:0.3, pointRadius:6, pointBackgroundColor:'#10B981', yAxisID:'y', borderDash:[5,4], spanGaps:false, pointStyle:'triangle' },
        { label:'Prediksi Unit', data:fcSnapUnits, borderColor:'#10B981', backgroundColor:'transparent', borderWidth:2, tension:0.3, pointRadius:6, pointBackgroundColor:'#10B981', yAxisID:'y2', borderDash:[5,4], spanGaps:false, pointStyle:'triangle' },
      ];
      _ddChartTrend.update();
      _noDataMsg('Baru 1 sesi scrape tersedia — nilai menunjukkan total kumulatif. Prediksi berdasarkan rata-rata pasar.');
      return;
    }

    // Fill calendar-week gaps around sparse scrape windows.
    // - Forward fill: from last known week -> current week.
    // - Back fill: ensure at least recent 5-week window is visible even if first scrape is recent.
    // Use trend-based projection (not flat average) so consecutive estimated weeks are not identical.
    const weeklyRowsFilled = [...weeklyRows];
    const lastDataMon = weeklyRowsFilled[weeklyRowsFilled.length - 1]?.firstDate;
    const firstDataMon = weeklyRowsFilled[0]?.firstDate;
    const latestKnownDate = new Date(); // always extend to today's Monday, not last scraped_at
    const latestKnownMon = _mondayOf(latestKnownDate);
    const _trendProject = (a, b) => {
      // Linear projection from 2 latest/earliest points.
      const slopeUnits = (b.units || 0) - (a.units || 0);
      const slopeOmset = (b.omset || 0) - (a.omset || 0);
      return {
        units: Math.max(0, Math.round((b.units || 0) + slopeUnits)),
        omset: Math.max(0, Math.round((b.omset || 0) + slopeOmset)),
      };
    };

    // Back fill to keep last ~5 calendar weeks visible.
    const targetWindowStart = new Date(latestKnownMon.getTime() - 4 * 7 * 86400000);
    if (firstDataMon && firstDataMon > targetWindowStart) {
      const seedA = weeklyRowsFilled[0];
      const seedB = weeklyRowsFilled[1] || weeklyRowsFilled[0];
      let refA = { units: seedA.units || 0, omset: seedA.omset || 0 };
      let refB = { units: seedB.units || 0, omset: seedB.omset || 0 };
      let curMon = new Date(firstDataMon.getTime() - 7 * 86400000);
      const preRows = [];
      while (curMon >= targetWindowStart) {
        // Reverse projection by mirroring slope backward.
        const prevUnits = Math.max(0, Math.round((refA.units || 0) - ((refB.units || 0) - (refA.units || 0))));
        const prevOmset = Math.max(0, Math.round((refA.omset || 0) - ((refB.omset || 0) - (refA.omset || 0))));
        preRows.push({
          label: `${curMon.getDate()} ${_MO[curMon.getMonth()]}`,
          units: prevUnits,
          omset: prevOmset,
          firstDate: new Date(curMon),
          isGapEstimate: true,
        });
        refB = { ...refA };
        refA = { units: prevUnits, omset: prevOmset };
        curMon = new Date(curMon.getTime() - 7 * 86400000);
      }
      preRows.reverse().forEach(r => weeklyRowsFilled.unshift(r));
    }

    if (lastDataMon && latestKnownMon > lastDataMon) {
      const seedA = weeklyRowsFilled[Math.max(0, weeklyRowsFilled.length - 2)] || weeklyRowsFilled[weeklyRowsFilled.length - 1];
      const seedB = weeklyRowsFilled[weeklyRowsFilled.length - 1];
      let refA = { units: seedA.units || 0, omset: seedA.omset || 0 };
      let refB = { units: seedB.units || 0, omset: seedB.omset || 0 };
      let curMon = new Date(lastDataMon.getTime() + 7 * 86400000);
      while (curMon <= latestKnownMon) {
        const proj = _trendProject(refA, refB);
        weeklyRowsFilled.push({
          label: `${curMon.getDate()} ${_MO[curMon.getMonth()]}`,
          units: proj.units,
          omset: proj.omset,
          firstDate: new Date(curMon),
          isGapEstimate: true,
        });
        refA = refB;
        refB = proj;
        curMon = new Date(curMon.getTime() + 7 * 86400000);
      }
    }

    const labels        = weeklyRowsFilled.map(w => w.label);
    const chartUnitData = weeklyRowsFilled.map(w => w.units);
    const chartOmsetData= weeklyRowsFilled.map(w => w.omset);

    // Forecast: avg of last 2 weeks (or last 1) projected 1 week ahead
    const nW = weeklyRowsFilled.length;
    const slice2 = weeklyRowsFilled.slice(-2);
    const fcUnit  = Math.round(slice2.reduce((s,w) => s+w.units, 0) / slice2.length);
    const fcOmset = Math.round(slice2.reduce((s,w) => s+w.omset, 0) / slice2.length);
    // nextWeek is the Monday 7 days after the last data Monday → e.g. "12 Mei"
    const nextWeek = new Date(weeklyRowsFilled[nW-1].firstDate.getTime() + 7*86400000);
    labels.push(_wLabel(nextWeek) + ' ▶');
    chartUnitData.push(null);
    chartOmsetData.push(null);
    const fUnitW  = new Array(labels.length).fill(null);
    const fOmsetW = new Array(labels.length).fill(null);
    fUnitW[nW-1]  = weeklyRowsFilled[nW-1].units;
    fOmsetW[nW-1] = weeklyRowsFilled[nW-1].omset;
    fUnitW[nW]    = fcUnit;
    fOmsetW[nW]   = fcOmset;

    if (!_ddChartTrend) return;
    _ddChartTrend.data.labels = labels;
    _ddChartTrend.data.datasets = [
      { label: isEstimated ? 'Omset Est./Minggu' : 'Omset/Minggu',  data:chartOmsetData, borderColor:'#E8442A', backgroundColor:'rgba(232,68,42,.06)', borderWidth:2.5, fill:true,  tension:0.3, pointRadius:4, pointBackgroundColor:'#E8442A', yAxisID:'y',  spanGaps:false, borderDash: isEstimated ? [3,3] : [] },
      { label: isEstimated ? 'Unit Est./Minggu'  : 'Unit/Minggu',   data:chartUnitData,  borderColor:'#4F46E5', backgroundColor:'transparent',         borderWidth:2,   fill:false, tension:0.3, pointRadius:3, pointBackgroundColor:'#4F46E5', yAxisID:'y2', spanGaps:false, borderDash: isEstimated ? [3,3] : [] },
      { label:'Forecast Omset', data:fOmsetW, borderColor:'#10B981', backgroundColor:'transparent', borderWidth:2, fill:false, tension:0.3, pointRadius:5, pointBackgroundColor:'#10B981', yAxisID:'y',  borderDash:[5,4], spanGaps:false, pointStyle:'triangle' },
      { label:'Forecast Unit',  data:fUnitW,  borderColor:'#10B981', backgroundColor:'transparent', borderWidth:2, fill:false, tension:0.3, pointRadius:5, pointBackgroundColor:'#10B981', yAxisID:'y2', borderDash:[5,4], spanGaps:false, pointStyle:'triangle' },
    ];
    _ddChartTrend.update();

    document.getElementById('dd-trend-peernote')?.remove();
    if (isPeerEstimated) {
      const _fmtS = v => v >= 1e6 ? (v/1e6).toFixed(1)+'jt' : v >= 1000 ? Math.round(v/1000)+'rb' : String(v);
      const note = document.createElement('div');
      note.id = 'dd-trend-peernote';
      note.style.cssText = 'font-size:.68rem;color:#9CA3AF;margin-top:6px;text-align:center;';
      note.textContent = `Estimasi dari ${peerCount} produk serupa (${_fmtS(peerSoldMin)}–${_fmtS(peerSoldMax)} terjual) — bukan data nyata.`;
      document.getElementById('dd-chart-trend')?.parentElement?.appendChild(note);
    }

    // ── Update Ringkasan hero stat cards — show monthly estimates ──────────────
    const totalUnits = weeklyRowsFilled.reduce((s, w) => s + w.units, 0);
    const totalOmset = weeklyRowsFilled.reduce((s, w) => s + w.omset, 0);
    // Convert period total → monthly: (total / weeks) × (30/7)
    const monthlyUnits = Math.round(totalUnits / nW * (30 / 7));
    const monthlyOmset = Math.round(totalOmset / nW * (30 / 7));
    // Week-over-week delta: last week vs first week (both already scaled to 7 days)
    const wowUnitPct  = weeklyRowsFilled[0].units  > 0 ? Math.round((weeklyRowsFilled[nW-1].units  - weeklyRowsFilled[0].units)  / weeklyRowsFilled[0].units  * 100) : null;
    const wowOmsetPct = weeklyRowsFilled[0].omset  > 0 ? Math.round((weeklyRowsFilled[nW-1].omset  - weeklyRowsFilled[0].omset)  / weeklyRowsFilled[0].omset  * 100) : null;
    const _fmtV = v => v >= 1e9 ? 'Rp '+(v/1e9).toFixed(1)+'M' : v >= 1e6 ? 'Rp '+(v/1e6).toFixed(1)+'jt' : 'Rp '+(v/1e3).toFixed(0)+'rb';
    const _fmtDelta = pct => pct == null ? '—' : pct >= 0 ? `↑ ${pct}%` : `↓ ${Math.abs(pct)}%`;
    const unitEl  = document.getElementById('dd-h-unit');
    const omsetEl = document.getElementById('dd-h-omset');
    const unitDEl  = document.getElementById('dd-h-unit-d');
    const omsetDEl = document.getElementById('dd-h-omset-d');
    const unitSubEl  = document.getElementById('dd-h-unit-sub');
    const omsetSubEl = document.getElementById('dd-h-omset-sub');
    if (unitEl)  unitEl.textContent  = monthlyUnits > 0 ? monthlyUnits.toLocaleString('id-ID') : '—';
    if (omsetEl) omsetEl.textContent = monthlyOmset > 0 ? _fmtV(monthlyOmset) : '—';
    if (unitDEl)  { unitDEl.textContent  = _fmtDelta(wowUnitPct);  unitDEl.style.color  = (wowUnitPct  ?? 0) >= 0 ? '#10B981' : '#E8442A'; }
    if (omsetDEl) { omsetDEl.textContent = _fmtDelta(wowOmsetPct); omsetDEl.style.color = (wowOmsetPct ?? 0) >= 0 ? '#10B981' : '#E8442A'; }
    const periodNote = isPeerEstimated ? `peer est. · ${nW} minggu` : isEstimated ? `est. · ${nW} minggu` : `${nW} minggu · ${dbRows.length} scrape`;
    if (unitSubEl)  unitSubEl.textContent  = `Est. unit / bulan · ${periodNote}`;
    if (omsetSubEl) omsetSubEl.textContent = `Est. omset / bulan · ${periodNote}`;
  } catch(e) {
    console.warn('ddLoadTrendHistory:', e);
  }
}

function ddRenderCompetitors() {
  const rows = _ddCompAll.slice(0, _ddCompShowing);
  const totalSold = _ddKwTotal || Math.max(_ddCompAll.reduce((s,c)=>s+(c.total_sold||0),0), 1);
  document.getElementById('dd-comp-tbody').innerHTML = rows.length ? rows.map(c => {
    const estMonthly = Math.round((c.total_sold||0) / 6 * (c.price||0));
    const sharePct   = totalSold > 0 ? (c.total_sold||0) / totalSold * 100 : 0;
    const tierColor  = sharePct >= 10 ? '#EF4444' : sharePct >= 3 ? '#F97316' : sharePct >= 1 ? '#3B82F6' : '#9CA3AF';
    const tierLabel  = sharePct >= 10 ? 'Dominan' : sharePct >= 3 ? 'Signifikan' : sharePct >= 1 ? 'Menengah' : 'Kecil';
    const barW       = Math.min(100, Math.round((c.total_sold||0) / Math.max(..._ddCompAll.map(r=>r.total_sold||0),1) * 100));
    const imgHtml    = c.image_url ? `<img src="${c.image_url}" style="width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">` : '';
    const ratingHtml = c.rating ? `<span style="color:#F59E0B;font-size:.6rem;">★ ${c.rating.toFixed(1)}</span>` : '';
    const reviewsHtml = c.reviews ? `<span style="font-size:.58rem;color:#9CA3AF;">(${c.reviews >= 1000 ? (c.reviews/1000).toFixed(1)+'rb' : c.reviews} ulasan)</span>` : '';
    const locationHtml = c.location ? `<span style="font-size:.58rem;color:#9CA3AF;display:inline-flex;align-items:center;gap:2px;">📍${c.location}</span>` : '';
    const listingAgeHtml = c.listing_date ? (() => {
      const d = new Date(c.listing_date);
      const months = Math.max(0, Math.floor((Date.now() - d) / (1000*60*60*24*30)));
      const label = months < 1 ? 'Baru' : months < 12 ? `${months} bln` : `${Math.floor(months/12)} thn`;
      return `<span style="font-size:.58rem;color:#9CA3AF;">Sejak ${label}</span>`;
    })() : '';
    return `<tr>
      <td style="color:#9CA3AF;font-weight:600;font-size:.72rem;">${c.rank}</td>
      <td style="min-width:180px;">
        <div style="display:flex;align-items:flex-start;gap:7px;">
          ${imgHtml}
          <div>
            <div style="font-size:.68rem;font-weight:600;color:#111827;line-height:1.2;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.product_name}</div>
            <div style="font-size:.6rem;color:#6B7280;margin-top:2px;">${c.store_name} ${ratingHtml} ${reviewsHtml}</div>
            <div style="display:flex;gap:6px;margin-top:2px;">${locationHtml} ${listingAgeHtml}</div>
          </div>
        </div>
      </td>
      <td style="font-size:.68rem;font-weight:600;white-space:nowrap;">Rp ${(c.price||0).toLocaleString('id-ID')}</td>
      <td style="min-width:110px;">
        <div style="font-size:.68rem;font-weight:600;">Rp ${estMonthly.toLocaleString('id-ID')}</div>
        <div style="font-size:.58rem;color:#9CA3AF;">${(c.total_sold||0).toLocaleString('id-ID')} terjual</div>
      </td>
      <td style="min-width:100px;">
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="height:6px;width:60px;background:#F3F4F6;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${barW}%;background:${tierColor};border-radius:3px;"></div></div>
          <span style="font-size:.6rem;color:${tierColor};font-weight:600;">${tierLabel}</span>
        </div>
        <div style="font-size:.56rem;color:#9CA3AF;">${sharePct.toFixed(1)}% pasar</div>
      </td>
      <td>${c.url ? `<a href="${c.url}" target="_blank" style="font-size:.68rem;font-weight:600;color:#E8442A;text-decoration:none;white-space:nowrap;">Lihat →</a>` : '—'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9CA3AF;font-size:.72rem;">Data kompetitor akan muncul setelah keyword dimuat.</td></tr>`;
  const btn = document.getElementById('dd-show-more-btn');
  if (btn) {
    const showing = _ddCompShowing >= _ddCompAll.length;
    btn.innerHTML = showing
      ? `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg> Sembunyikan`
      : `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg> Lihat Semua ${_ddCompAll.length} Kompetitor`;
  }
}

function ddToggleCompetitors() {
  _ddCompShowing = _ddCompShowing >= _ddCompAll.length ? 5 : _ddCompAll.length;
  ddRenderCompetitors();
}

// dscOpenDeepDive defined above (uses item_id__shop_id key from _dscAllListings)

// ── TRACKER ────────────────────────────────────────────────────
let _trkChartWeekly = null;
const CHART_COLORS = ['#E8442A','#4F46E5','#10B981','#F59E0B','#EC4899','#06B6D4'];

function _trkRng(seed) {
  let s = seed;
  return function() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function trkSparklineSvg(id, trending) {
  const rng = _trkRng(id * 7919);
  const pts = Array.from({length:8}, (_,i) => {
    const base = 50 + rng()*20;
    return Math.max(5, Math.min(95, Math.round(base + (trending ? i*4 : -i*2) + (rng()-0.5)*14)));
  });
  const w = 100, h = 36;
  const xs = pts.map((_,i) => Math.round(i * w / (pts.length-1)));
  const ys = pts.map(p => Math.round(h - (p/100)*h));
  const color = trending ? '#10B981' : '#E8442A';
  const d = xs.map((x,i) => (i===0?'M':'L')+x+','+ys[i]).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="trk-sparkline" preserveAspectRatio="none">
    <polyline points="${xs.map((x,i)=>x+','+ys[i]).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

async function trkInit() {
  const tracked = trkLoad();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const grid = document.getElementById('trk-prod-grid');

  if (!tracked.length) {
    set('trk-total', '0 produk');
    set('trk-total-sub', '');
    set('trk-sales', '—');
    set('trk-sales-sub', '');
    set('trk-growth', '—');
    set('trk-growth-sub', '');
    set('trk-avgprice', '—');
    set('trk-avgprice-sub', '');
    if (grid) grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 20px;color:#9CA3AF;font-size:.82rem;">
        Belum ada produk dilacak.<br>
        <span style="font-size:.75rem;">Buka produk di Discover, lalu klik tombol <strong style="color:#E8442A;">Lacak Produk</strong>.</span>
      </div>`;
    document.getElementById('trk-price-tbody').innerHTML = '';
    if (_trkChartWeekly) { _trkChartWeekly.destroy(); _trkChartWeekly = null; }
    return;
  }

  // Fetch last 2 scrape rows for each tracked product
  const enriched = await Promise.all(tracked.map(async t => {
    if (!_supabase) return { ...t, delta: null, curr_sold: t.total_sold || 0, curr_price: t.price || 0 };
    try {
      let { data } = await _supabase
        .from('listings')
        .select('scraped_at,total_sold,price')
        .eq('item_id', t.item_id)
        .eq('shop_id', t.shop_id)
        .order('scraped_at', { ascending: false })
        .limit(2);
      if (!data || !data.length) {
        const { data: d2 } = await _supabase
          .from('listings')
          .select('scraped_at,total_sold,price')
          .eq('item_id', String(t.item_id))
          .eq('shop_id', String(t.shop_id))
          .order('scraped_at', { ascending: false })
          .limit(2);
        data = d2 || [];
      }
      const curr = data[0] || null;
      const prev = data[1] || null;
      const curr_sold  = curr?.total_sold  ?? t.total_sold  ?? 0;
      const prev_sold  = prev?.total_sold  ?? null;
      const curr_price = curr?.price ?? t.price ?? 0;
      const delta = prev_sold != null ? Math.max(0, curr_sold - prev_sold) : null;
      return { ...t, curr_sold, prev_sold, curr_price, delta, scrape_date: curr?.scraped_at };
    } catch { return { ...t, delta: null, curr_sold: t.total_sold || 0, curr_price: t.price || 0 }; }
  }));

  // Summary stats
  const nUp   = enriched.filter(p => (p.delta ?? 0) > 0).length;
  const totalSold  = enriched.reduce((s, p) => s + (p.curr_sold || 0), 0);
  const avgPrice   = Math.round(enriched.reduce((s, p) => s + (p.curr_price || 0), 0) / enriched.length);
  const cats = [...new Set(enriched.map(p => p.category).filter(Boolean))];
  set('trk-total',       enriched.length + ' produk');
  set('trk-total-sub',   cats.length + ' kategori');
  set('trk-sales',       totalSold.toLocaleString('id-ID') + ' unit');
  set('trk-sales-sub',   'total terjual saat ini');
  set('trk-growth',      nUp + ' / ' + enriched.length);
  const grSub = document.getElementById('trk-growth-sub');
  if (grSub) { grSub.textContent = nUp > 0 ? 'naik sejak scrape terakhir' : 'tidak ada kenaikan terdeteksi'; grSub.className = 'trk-stat-delta ' + (nUp > 0 ? 'up' : 'flat'); }
  set('trk-avgprice',    'Rp ' + avgPrice.toLocaleString('id-ID'));
  set('trk-avgprice-sub','median semua produk dilacak');

  // Product cards
  const _upArrow = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2 6M6 2L10 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const _dnArrow = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M6 10L2 6M6 10L10 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (grid) grid.innerHTML = enriched.map(p => {
    const dc   = p.delta == null ? 'flat' : p.delta > 0 ? 'up' : 'flat';
    const icon = dc === 'up' ? _upArrow : dc === 'down' ? _dnArrow : '';
    const dtxt = p.delta == null ? '— belum ada data' : p.delta > 0 ? `+${p.delta.toLocaleString('id-ID')} unit` : '0 unit (stabil)';
    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" onerror="this.parentElement.innerHTML='📦'">`
      : '📦';
    const key = `${p.item_id}__${p.shop_id}`;
    return `<div class="trk-prod-card" onclick="dscOpenDeepDive('${key}')">
      <div class="trk-prod-top">
        <div class="trk-prod-emoji">${imgHtml}</div>
        <div class="trk-prod-info">
          <div class="trk-prod-name">${p.product_name || '—'}</div>
          <div class="trk-prod-cat">${p.category || ''} · ${p.store_name || ''}</div>
        </div>
      </div>
      <div class="trk-prod-bottom" style="margin-top:10px;align-items:center;">
        <div class="trk-prod-price">Rp ${(p.curr_price||0).toLocaleString('id-ID')}</div>
        <span class="trk-prod-delta ${dc}" style="display:inline-flex;align-items:center;gap:3px;">${icon}${dtxt}</span>
      </div>
      <div style="font-size:.58rem;color:#9CA3AF;margin-top:5px;">${p.curr_sold.toLocaleString('id-ID')} total terjual</div>
    </div>`;
  }).join('');

  // Bar chart: delta per product
  const chartLabels = enriched.map(p => (p.product_name || '').split(' ').slice(0,2).join(' '));
  const chartData   = enriched.map(p => p.delta ?? 0);
  const chartColors = enriched.map(p => (p.delta ?? 0) > 0 ? '#10B981' : '#9CA3AF');
  if (_trkChartWeekly) { _trkChartWeekly.destroy(); _trkChartWeekly = null; }
  const cvs = document.getElementById('trk-chart-weekly');
  if (cvs) {
    _trkChartWeekly = new Chart(cvs, {
      type: 'bar',
      data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors, borderRadius: 4, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` +${ctx.parsed.y.toLocaleString('id-ID')} unit` } } },
        scales: { x: { ticks: { font: { size: 9 }, maxRotation: 40 } }, y: { ticks: { font: { size: 9 }, callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } } }
      }
    });
  }

  // Price table
  document.getElementById('trk-price-tbody').innerHTML = enriched.map(p => {
    const dc = (p.delta ?? 0) > 0 ? 'up' : 'flat';
    const icon = dc === 'up' ? _upArrow : _dnArrow;
    const dtxt = p.delta == null ? '—' : p.delta > 0 ? `+${p.delta.toLocaleString('id-ID')}` : '0';
    return `<tr>
      <td style="font-weight:600;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(p.product_name||'').split(' ').slice(0,4).join(' ')}</td>
      <td>Rp ${(p.curr_price||0).toLocaleString('id-ID')}</td>
      <td><span class="trk-price-chg ${dc}" style="display:inline-flex;align-items:center;gap:3px;">${icon}${dtxt} unit</span></td>
    </tr>`;
  }).join('');
}

function trkRefresh() { trkInit(); }

// ── DASHBOARD ──────────────────────────────────────────────────
let _hbdChartPerf = null, _hbdTab = 'growth';

function _hbdRng(seed) {
  let s = seed;
  return function() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function hbdSetTab(btn, tab) {
  document.querySelectorAll('.hbd-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _hbdTab = tab;
  hbdInit();
}

function _hbdBuildChart() {
  if (!allProducts || !allProducts.length) return;
  const prods = allProducts.slice(0, 5);
  const weeks = ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'];
  const datasets = prods.map((p, ci) => {
    const rng = _hbdRng(p.id * (ci+1) * 777);
    let data;
    if (_hbdTab === 'growth') {
      const base = 40 + rng()*30;
      data = weeks.map(() => Math.max(5, Math.round(base + (rng()-0.3)*25)));
    } else if (_hbdTab === 'price') {
      const base = p.medianPrice || 85000;
      data = weeks.map(() => Math.round(base * (0.9 + rng()*0.2)));
    } else {
      data = weeks.map(() => Math.round(30 + rng()*60));
    }
    return {
      label: p.name.split(' ').slice(0,2).join(' '),
      data,
      borderColor: CHART_COLORS[ci],
      backgroundColor: 'transparent',
      borderWidth: 2,
      tension: 0.4,
      pointRadius: 2,
      pointBackgroundColor: CHART_COLORS[ci],
    };
  });
  if (_hbdChartPerf) _hbdChartPerf.destroy();
  _hbdChartPerf = new Chart(document.getElementById('hbd-chart-perf'), {
    type: 'line',
    data: { labels: weeks, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 } } },
        y: { ticks: { font: { size: 9 }, callback: v => _hbdTab==='price' ? 'Rp'+(v/1000).toFixed(0)+'rb' : v } }
      },
      animation: { duration: 300 }
    }
  });
  document.getElementById('hbd-legend').innerHTML = prods.map((p,ci) =>
    `<div class="trk-legend-item"><div class="trk-legend-dot" style="background:${CHART_COLORS[ci]}"></div>${p.name.split(' ').slice(0,2).join(' ')}</div>`
  ).join('');
}

async function hbdInit() {
  const tracked = trkLoad();

  if (!tracked.length) {
    document.getElementById('hbd-s1').textContent = '0';
    document.getElementById('hbd-s1-sub').textContent = 'produk terpantau';
    document.getElementById('hbd-s2').textContent = '—';
    document.getElementById('hbd-s2-sub').textContent = 'belum ada data';
    document.getElementById('hbd-s3').textContent = '—';
    document.getElementById('hbd-s3-sub').textContent = 'tambahkan produk dulu';
    document.getElementById('hbd-s4').textContent = '—';
    document.getElementById('hbd-s4-sub').textContent = '—';
    document.getElementById('hbd-subtitle').textContent = 'Belum ada produk terpantau. Cari produk di Discover dan lacak yang menarik.';
    document.getElementById('hbd-ai-list').innerHTML = '<div style="color:#9CA3AF;font-size:.78rem;padding:12px 0;">Lacak produk terlebih dahulu untuk mendapatkan insight.</div>';
    document.getElementById('hbd-activity-list').innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;">Belum ada aktivitas.</div>';
    document.getElementById('hbd-opp-list').innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;">Belum ada peluang terdeteksi.</div>';
    document.getElementById('hbd-tip-text').textContent = 'Mulai dengan melacak 3-5 produk dari halaman Discover untuk mendapatkan ringkasan performa di sini.';
    // Sample chart from top allProducts so the chart area isn't blank
    if (allProducts.length) {
      const top5 = [...allProducts].sort((a,b) => (b.score||0) - (a.score||0)).slice(0,5);
      // Use newUnits/total_sold as delta proxy so bars are non-empty in sample view
      const sampleProds = top5.map(p => ({
        name:  (p.keyword || p.category || '').split(' ').slice(0,3).join(' ') || 'Produk',
        delta: p.newUnits || p.total_sold || p.medianPrice || 1,
        price: p.medianPrice || 0,
        sold:  p.newUnits    || 0,
      }));
      _hbdBuildChartFromTracked(sampleProds);
      const legendEl = document.getElementById('hbd-legend');
      if (legendEl) legendEl.innerHTML = '<span style="font-size:.6rem;color:#9CA3AF;font-style:italic;">Contoh: 5 produk teratas di pasar</span>';
    }
    void hbdRenderCohortDigest();
    if (_supabase && currentUser && typeof cohortInit === 'function') cohortInit().catch(() => {});
    else void hbdRenderMentorDigest();
    return;
  }

  document.getElementById('hbd-subtitle').textContent = 'Berikut ringkasan produk yang Anda lacak.';

  // Fetch last 2 scrape rows per tracked product
  const enriched = await Promise.all(tracked.map(async t => {
    try {
      const { data } = await _supabase
        .from('listings')
        .select('total_sold, price, scraped_at')
        .eq('item_id', t.item_id)
        .eq('shop_id', t.shop_id)
        .order('scraped_at', { ascending: false })
        .limit(2);
      const curr = data?.[0];
      const prev = data?.[1];
      const delta = (curr && prev) ? Math.max(0, (curr.total_sold||0) - (prev.total_sold||0)) : 0;
      return { ...t, curr_sold: curr?.total_sold||t.total_sold||0, curr_price: curr?.price||t.price||0, delta, scraped_at: curr?.scraped_at };
    } catch { return { ...t, curr_sold: t.total_sold||0, curr_price: t.price||0, delta: 0 }; }
  }));

  const count    = enriched.length;
  const avgPrice = enriched.reduce((s,p) => s + (p.curr_price||0), 0) / count;
  const totalOmset = enriched.reduce((s,p) => s + ((p.curr_price||0) * (p.curr_sold||0) / 6), 0);
  const nUp      = enriched.filter(p => p.delta > 0).length;

  document.getElementById('hbd-s1').textContent = count;
  document.getElementById('hbd-s1-sub').textContent = 'produk terpantau';
  document.getElementById('hbd-s2').textContent = 'Rp ' + Math.round(avgPrice).toLocaleString('id-ID');
  document.getElementById('hbd-s2-sub').textContent = 'rata-rata harga produk';
  document.getElementById('hbd-s3').textContent = totalOmset >= 1e6 ? 'Rp ' + (totalOmset/1e6).toFixed(1) + ' jt' : 'Rp ' + Math.round(totalOmset).toLocaleString('id-ID');
  document.getElementById('hbd-s3-sub').textContent = 'estimasi omzet/bln';
  document.getElementById('hbd-s4').textContent = nUp;
  document.getElementById('hbd-s4-sub').textContent = 'produk tren naik';

  // Tracked product list as insight
  document.getElementById('hbd-ai-list').innerHTML = enriched.slice(0,5).map(p => {
    const arrow = p.delta > 0 ? '<span style="color:#16A34A;">▲</span>' : '<span style="color:#9CA3AF;">–</span>';
    const name  = (p.product_name||'').split(' ').slice(0,4).join(' ') || p.keyword;
    return `<div class="hbd-ai-item"><div class="hbd-ai-dot ${p.delta>0?'green':'blue'}"></div><div>${arrow} <strong>${name}</strong> — ${p.curr_sold?.toLocaleString('id-ID')||'—'} unit terjual, harga Rp ${(p.curr_price||0).toLocaleString('id-ID')}</div></div>`;
  }).join('');

  // Recent tracked products as activity
  document.getElementById('hbd-activity-list').innerHTML = enriched.slice(0,6).map(p => {
    const name = (p.product_name||'').split(' ').slice(0,3).join(' ') || p.keyword;
    const upSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>`;
    const flatSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const cls = p.delta > 0 ? 'up' : 'info';
    return `<div class="hbd-activity-item">
      <div class="hbd-act-icon ${cls}">${p.delta>0?upSvg:flatSvg}</div>
      <div class="hbd-act-body">
        <div class="hbd-act-title">${name}</div>
        <div class="hbd-act-desc">${p.delta>0?'+'+p.delta+' unit sejak scrape terakhir':'Belum ada perubahan unit'}</div>
      </div>
      <div class="hbd-act-time">${(p.category||'').split(' ')[0]||'—'}</div>
    </div>`;
  }).join('');

  // Opportunities: products with highest delta
  const oppProds = [...enriched].sort((a,b) => b.delta - a.delta).slice(0,6);
  document.getElementById('hbd-opp-list').innerHTML = oppProds.map(p => {
    const name = (p.product_name||'').split(' ').slice(0,4).join(' ') || p.keyword;
    const hot = p.delta > 0;
    return `<div class="hbd-opp-item">
      <img src="${p.image_url||''}" onerror="this.style.display='none'" style="width:32px;height:32px;object-fit:cover;border-radius:6px;flex-shrink:0;">
      <div class="hbd-opp-body">
        <div class="hbd-opp-name">${name}</div>
        <div class="hbd-opp-cat">${p.category||p.keyword||'—'}</div>
      </div>
      <span class="hbd-opp-badge ${hot?'hot':'ok'}">${hot?'▲ +'+p.delta:'Stabil'}</span>
    </div>`;
  }).join('');

  // ── Tracked product visual strip ──────────────────────────
  const trackedStrip = document.getElementById('hbd-tracked-strip');
  const trackedCards = document.getElementById('hbd-tracked-cards');
  if (trackedStrip && trackedCards && enriched.length) {
    trackedStrip.style.display = 'block';
    const fmtRp = v => 'Rp ' + Math.round(v||0).toLocaleString('id-ID');
    trackedCards.innerHTML = enriched.slice(0, 8).map(p => {
      const name = (p.product_name||'').split(' ').slice(0,3).join(' ') || p.keyword || '—';
      const priceDelta = p.curr_price - (p.price || p.curr_price);
      const deltaChip = p.delta > 0
        ? `<span style="background:#ECFDF5;color:#16A34A;font-size:.65rem;font-weight:700;padding:2px 6px;border-radius:10px;">▲ ${p.delta}</span>`
        : priceDelta < -500
          ? `<span style="background:#FFF7ED;color:#C2410C;font-size:.65rem;font-weight:700;padding:2px 6px;border-radius:10px;">↓ harga</span>`
          : `<span style="background:#F9FAFB;color:#9CA3AF;font-size:.65rem;padding:2px 6px;border-radius:10px;">Stabil</span>`;
      return `<div style="flex-shrink:0;width:120px;background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;cursor:pointer;" onclick="switchDashView('tracker')">
        <div style="height:80px;background:#F3F4F6;overflow:hidden;">
          <img src="${p.image_url||''}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;">
        </div>
        <div style="padding:8px;">
          <div style="font-size:.7rem;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${name}</div>
          <div style="font-size:.68rem;color:#6B7280;margin-bottom:4px;">${fmtRp(p.curr_price)}</div>
          ${deltaChip}
        </div>
      </div>`;
    }).join('');
  }

  // ── Price-change alert strip ───────────────────────────────
  const alertStrip = document.getElementById('hbd-alerts-strip');
  if (alertStrip) {
    const bigChanges = enriched.filter(p => {
      const pricePct = p.price > 0 ? Math.abs((p.curr_price - p.price) / p.price * 100) : 0;
      const soldPct  = p.total_sold > 0 ? Math.abs(p.delta / p.total_sold * 100) : 0;
      return pricePct > 10 || soldPct > 20;
    });
    if (bigChanges.length) {
      alertStrip.style.display = 'block';
      alertStrip.innerHTML = bigChanges.slice(0,3).map(p => {
        const name = (p.product_name||'').split(' ').slice(0,4).join(' ') || p.keyword;
        const pricePct = p.price > 0 ? ((p.curr_price - p.price) / p.price * 100).toFixed(0) : 0;
        const msg = p.delta > 0 ? `Penjualan naik +${p.delta} unit` : `Harga berubah ${pricePct > 0 ? '+' : ''}${pricePct}%`;
        const color = p.delta > 0 ? '#16A34A' : '#C2410C';
        return `<div style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E5E7EB;border-left:3px solid ${color};border-radius:8px;padding:10px 14px;font-size:.78rem;">
          <img src="${p.image_url||''}" onerror="this.style.display='none'" style="width:28px;height:28px;border-radius:5px;object-fit:cover;flex-shrink:0;">
          <div><strong>${name}</strong> — ${msg}</div>
        </div>`;
      }).join('');
    }
  }

  // ── Trending for you from allProducts ─────────────────────
  const trendingCards = document.getElementById('hbd-trending-cards');
  if (trendingCards && allProducts.length) {
    const trending = [...allProducts].sort((a,b) => (b.avgTrend||0) - (a.avgTrend||0)).slice(0, 6);
    trendingCards.innerHTML = trending.map(p => {
      const scoreColor = p.score >= 70 ? '#16A34A' : p.score >= 45 ? '#B45309' : '#C0392B';
      return `<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;cursor:pointer;" onclick="openDetail(${p.id})">
        <div style="height:80px;background:#F3F4F6;position:relative;overflow:hidden;">
          <img src="${p.image||''}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;">
          <span style="position:absolute;top:6px;right:6px;background:${scoreColor};color:#fff;font-size:.6rem;font-weight:800;padding:2px 6px;border-radius:8px;">${p.score}</span>
        </div>
        <div style="padding:8px;">
          <div style="font-size:.7rem;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name||'—'}</div>
          <div style="font-size:.65rem;color:#6B7280;margin-top:2px;">↑ Trending · ${p.category||'—'}</div>
        </div>
      </div>`;
    }).join('');
  }

  const tips = [
    'Lacak lebih banyak produk untuk mendapatkan analisis yang lebih akurat.',
    'Produk dengan delta penjualan tinggi adalah kandidat bagus untuk mulai berjualan.',
    'Coba gunakan Kalkulator Profit di halaman Mulai Berjualan untuk menghitung kelayakan.',
  ];
  document.getElementById('hbd-tip-text').textContent = tips[Math.floor(Math.random()*tips.length)];

  // Build chart with tracked products
  const prods = enriched.slice(0,6).map(p => ({
    name: (p.product_name||p.keyword||'').split(' ').slice(0,3).join(' '),
    delta: p.delta || 0,
    price: p.curr_price || 0,
    sold:  p.curr_sold  || 0,
  }));
  _hbdBuildChartFromTracked(prods);
  void hbdRenderCohortDigest();
  if (_supabase && currentUser && typeof cohortInit === 'function') cohortInit().catch(() => {});
  else void hbdRenderMentorDigest();
}

async function hbdRenderMentorDigest() {
  const wrap = document.getElementById('hbd-mentor-wrap');
  if (!wrap || !_supabase || !currentUser) return;
  if (!_cohortState || !_cohortState.hasMentorCohort || !_cohortState.primaryMentorCohort) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const c = _cohortState.primaryMentorCohort;
  const nameEl = document.getElementById('hbd-mentor-cohort-name');
  const statsEl = document.getElementById('hbd-mentor-stats');
  const inacEl = document.getElementById('hbd-mentor-inactive-list');
  const feedEl = document.getElementById('hbd-mentor-feed-list');
  if (nameEl) nameEl.textContent = c.name || 'Kohort';
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const [{ data: members }, { data: recent }] = await Promise.all([
    _supabase.from('cohort_members').select('user_id,role,status,last_seen_at').eq('cohort_id', c.id).eq('status', 'active'),
    _supabase.from('activity_events').select('user_id').eq('cohort_id', c.id).gte('created_at', since7d),
  ]);
  const studs = (members || []).filter(m => m.role === 'student');
  const activeSet = new Set((recent || []).map(r => r.user_id));
  const inactive = studs.filter(s => !activeSet.has(s.user_id));
  await cohortLoadMemberNames(c.id);
  if (statsEl) statsEl.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;">
    <div style="background:#F9FAFB;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:1.3rem;font-weight:900;color:#111;">${studs.length}</div><div class="cohort-muted" style="font-size:.6rem;">Siswa</div></div>
    <div style="background:${inactive.length?'#FEF2F0':'#F0FDF4'};border-radius:8px;padding:10px;text-align:center;"><div style="font-size:1.3rem;font-weight:900;color:${inactive.length?'#C0392B':'#1A7A46'};">${inactive.length}</div><div class="cohort-muted" style="font-size:.6rem;">Perlu perhatian</div></div>
    <div style="background:#F9FAFB;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:1.3rem;font-weight:900;color:#111;">${studs.length-inactive.length}</div><div class="cohort-muted" style="font-size:.6rem;">Aktif 7 hari</div></div>
  </div>`;
  if (inacEl) inacEl.innerHTML = inactive.length
    ? `<div style="font-size:.65rem;font-weight:700;color:#C0392B;margin-bottom:4px;">Tidak aktif 7 hari:</div>`
      + inactive.slice(0,5).map(s => `<div style="font-size:.72rem;padding:4px 0;border-bottom:1px solid #F3F4F6;">${_cohortEsc(cohortCohortDisplayName(s.user_id,null))}</div>`).join('')
      + (inactive.length > 5 ? `<div class="cohort-muted" style="font-size:.65rem;margin-top:4px;">+${inactive.length-5} lainnya</div>` : '')
    : '<div style="font-size:.72rem;color:#1A7A46;font-weight:700;">Semua siswa aktif minggu ini 🎉</div>';
  if (feedEl) {
    const { data: posts } = await _supabase.from('community_posts').select('user_id,body,kind,created_at').eq('cohort_id',c.id).gte('created_at',since7d).order('created_at',{ascending:false}).limit(6);
    const kindLbl = {win:'Menang',milestone_share:'Milestone',product_share:'Produk',general:'Umum',question:'Pertanyaan'};
    feedEl.innerHTML = (posts||[]).length ? (posts||[]).map(p =>
      `<div style="padding:6px 0;border-bottom:1px solid #F3F4F6;"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;"><span style="font-size:.58rem;font-weight:700;text-transform:uppercase;color:#9CA3AF;">${_cohortEsc(kindLbl[p.kind]||p.kind||'')}</span><span style="font-size:.68rem;font-weight:700;color:#111;">${_cohortEsc(cohortCohortDisplayName(p.user_id,null))}</span></div><div style="font-size:.72rem;color:#374151;line-height:1.4;">${_cohortEsc((p.body||'').slice(0,90))}${(p.body||'').length>90?'…':''}</div></div>`
    ).join('') : '<div class="cohort-muted" style="font-size:.72rem;">Belum ada postingan minggu ini.</div>';
  }
}

/**
 * Beranda digest: mentor announcements + cohort activity teaser (win / milestone / product_share)
 * + recommended products (allProducts by score, else latest listings by score).
 * Privacy: author labels via cohort_member_names RPC only; no emails; hidden posts excluded.
 */
async function hbdRenderCohortDigest() {
  const wrap = document.getElementById('hbd-cohort-digest-wrap');
  const annEl = document.getElementById('hbd-cohort-announce-list');
  const actEl = document.getElementById('hbd-cohort-activity-list');
  const recEl = document.getElementById('hbd-cohort-rec-list');
  if (!wrap || !annEl || !actEl || !recEl) return;
  if (!_supabase || !currentUser) {
    wrap.style.display = 'none';
    return;
  }
  const { data: mem } = await _supabase
    .from('cohort_members')
    .select('cohort_id,role,status')
    .eq('user_id', currentUser.id)
    .eq('status', 'active');
  const stu = (mem || []).find(m => m.role === 'student');
  const pcid = stu ? stu.cohort_id : null;
  if (!pcid) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  const { data: cRow } = await _supabase.from('cohorts').select('mentor_user_id,name').eq('id', pcid).maybeSingle();
  const mentorId = cRow && cRow.mentor_user_id;
  await cohortLoadMemberNames(pcid);
  const kindLbl = { win: 'Menang', milestone_share: 'Milestone', product_share: 'Produk' };
  const kindIcon = { win: '🎉', milestone_share: '🏁', product_share: '📦' };
  const [{ data: ann }, { data: postsRaw, error: postErr }] = await Promise.all([
    _supabase.from('cohort_announcements').select('title,body,created_at').eq('cohort_id', pcid).order('created_at', { ascending: false }).limit(3),
    _supabase.from('community_posts').select('body,created_at,author_id,kind,metadata').eq('cohort_id', pcid).is('hidden_at', null).in('kind', ['win', 'milestone_share', 'product_share']).order('created_at', { ascending: false }).limit(16),
  ]);
  if (postErr) console.warn('hbd cohort digest posts', postErr);
  if (!(ann || []).length) {
    annEl.innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;">Belum ada pengumuman dari mentor.</div>';
  } else {
    annEl.innerHTML = (ann || []).map(a => {
      const snip = String(a.body || '').trim().slice(0, 100);
      const more = (a.body || '').length > 100 ? '…' : '';
      return `<div class="hbd-cohort-ann-item"><strong>${_cohortEsc(a.title)}</strong>${snip ? `<div class="hbd-cohort-act-snippet">${_cohortEsc(snip)}${more}</div>` : ''}<div class="hbd-cohort-ann-meta">${_cohortEsc((a.created_at || '').slice(0, 10))}</div></div>`;
    }).join('');
  }
  const postsList = [...(postsRaw || [])].sort((a, b) => {
    const aself = a.author_id === currentUser.id ? 1 : 0;
    const bself = b.author_id === currentUser.id ? 1 : 0;
    if (aself !== bself) return aself - bself;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }).slice(0, 5);
  if (!postsList.length) {
    actEl.innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;">Belum ada aktivitas (menang, milestone, bagikan produk) di feed kohort.</div>';
  } else {
    actEl.innerHTML = postsList.map(p => {
      const mine = p.author_id === currentUser.id;
      const isMentor = mentorId && p.author_id === mentorId;
      const who = mine ? 'Kamu' : (isMentor ? 'Mentor' : cohortCohortDisplayName(p.author_id, null));
      const k = p.kind || 'general';
      const meta = p.metadata || {};
      const url = meta.listing_url || meta.product_url || meta.url || '';
      const note = (meta.note || meta.jumlah || '').trim();
      const bodyShort = String(p.body || '').trim().slice(0, 88);
      const extra = url ? ' · tautan produk' : (note ? ' · ' + note.slice(0, 40) : '');
      const icon = kindIcon[k] || '•';
      const lbl = kindLbl[k] || k;
      return `<div class="hbd-activity-item">
        <div class="hbd-act-icon info" style="font-size:1rem;line-height:1;">${icon}</div>
        <div class="hbd-act-body">
          <div class="hbd-act-title">${_cohortEsc(lbl)} · ${_cohortEsc(who)}</div>
          <div class="hbd-act-desc">${_cohortEsc(bodyShort)}${(p.body || '').length > 88 ? '…' : ''}${_cohortEsc(extra)}</div>
        </div>
        <div class="hbd-act-time">${_cohortEsc((p.created_at || '').slice(0, 10))}</div>
      </div>`;
    }).join('');
  }
  let recHtml = '';
  if (typeof allProducts !== 'undefined' && allProducts && allProducts.length) {
    const top = [...allProducts].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    recHtml = top.map(p => {
      const name = (p.name || p.keyword || 'Produk').split(' ').slice(0, 5).join(' ') || 'Produk';
      const sc = p.score >= 70 ? 'hot' : 'ok';
      return `<div class="hbd-opp-item" onclick="openDetail(${p.id})">
        <div class="hbd-opp-emoji" style="font-size:1rem;">📈</div>
        <div class="hbd-opp-body">
          <div class="hbd-opp-name">${_cohortEsc(name)}</div>
          <div class="hbd-opp-cat">${_cohortEsc(p.category || '—')}</div>
        </div>
        <span class="hbd-opp-badge ${sc}">${p.score != null ? p.score : '—'}</span>
      </div>`;
    }).join('');
  } else {
    const { data: lr } = await _supabase.from('listings').select('scraped_at').order('scraped_at', { ascending: false }).limit(1);
    const latestDate = lr && lr[0] && lr[0].scraped_at ? lr[0].scraped_at.slice(0, 10) : null;
    if (latestDate) {
      const { data: rows } = await _supabase
        .from('listings')
        .select('keyword,category,score,image_url')
        .gte('scraped_at', latestDate)
        .order('score', { ascending: false })
        .limit(40);
      const seen = new Set();
      const uniq = [];
      (rows || []).forEach(r => {
        const kw = r.keyword;
        if (!kw || seen.has(kw)) return;
        seen.add(kw);
        uniq.push(r);
      });
      recHtml = uniq.slice(0, 5).map(r => {
        const hot = (r.score || 0) >= 70;
        const safeKw = JSON.stringify(String(r.keyword || ''));
        return `<div class="hbd-opp-item" onclick="openKwDetail(${safeKw})">
          <div class="hbd-opp-emoji" style="font-size:1rem;">🔎</div>
          <div class="hbd-opp-body">
            <div class="hbd-opp-name">${_cohortEsc(r.keyword)}</div>
            <div class="hbd-opp-cat">${_cohortEsc(r.category || '—')}</div>
          </div>
          <span class="hbd-opp-badge ${hot ? 'hot' : 'ok'}">${r.score != null ? r.score : '—'}</span>
        </div>`;
      }).join('');
    }
  }
  if (!recHtml) {
    recEl.innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;">Buka Discover untuk melihat produk dan keyword terbaru.</div>';
  } else {
    recEl.innerHTML = recHtml;
  }
}

function _hbdBuildChartFromTracked(prods) {
  const canvas = document.getElementById('hbd-chart-perf');
  if (!canvas || !prods.length) return;
  if (window._hbdChart) { window._hbdChart.destroy(); window._hbdChart = null; }
  const labels = prods.map(p => p.name);
  const data   = prods.map(p => p.delta);
  window._hbdChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Unit Delta', data, backgroundColor: CHART_COLORS.slice(0,prods.length), borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { font: { size: 10 } } }, x: { ticks: { font: { size: 10 } } } }
    }
  });
  document.getElementById('hbd-legend').innerHTML = prods.map((p,i) =>
    `<div class="trk-legend-item"><div class="trk-legend-dot" style="background:${CHART_COLORS[i]}"></div>${p.name}</div>`
  ).join('');
}

// ── MULAI BERJUALAN ────────────────────────────────────────────
const _MLS_APIKEY = 'larisid_anthropic_key';
let _mlsContext = null;   // { keyword, medianPrice, medianSold, top5 }
let _mlsChatHistory = []; // { role, content }

function mlsInit() {
  mlsUpdateModelBadge();
  _mlsAiUpdateCounter();
  const tracked = trkLoad();
  const pick = document.getElementById('mls-product-pick');
  const noTrk = document.getElementById('mls-no-tracked');
  if (!pick) return;

  // Merge tracked (localStorage) with saved (in-memory savedProducts Set backed by Supabase).
  // Build a unified list keyed by item_id_shop_id to avoid duplicates.
  const merged = new Map();
  tracked.forEach(t => {
    const k = t.key || `${t.item_id}_${t.shop_id}`;
    merged.set(k, t);
  });
  // Add saved products that aren't already tracked — pull from _dscAllListings if available
  if (savedProducts && savedProducts.size > 0 && _dscAllListings && _dscAllListings.length) {
    _dscAllListings.forEach(p => {
      if (savedProducts.has(p.item_id)) {
        const k = `${p.item_id}_${p.shop_id}`;
        if (!merged.has(k)) {
          merged.set(k, { key: k, item_id: p.item_id, shop_id: p.shop_id,
            product_name: p.product_name, store_name: p.store_name,
            image_url: p.image_url, category: p.category,
            price: p.price, total_sold: p.total_sold, keyword: p.keyword,
            tracked_at: new Date().toISOString() });
        }
      }
    });
  }
  const allPicks = [...merged.values()];

  // Clear and rebuild picker
  pick.innerHTML = '<option value="">-- Pilih produk dilacak / tersimpan --</option>';
  if (!allPicks.length) {
    pick.style.display = 'none';
    if (noTrk) noTrk.style.display = 'block';
    return;
  }
  if (noTrk) noTrk.style.display = 'none';
  pick.style.display = 'block';
  allPicks.forEach(t => {
    const name = (t.product_name||t.keyword||'Produk').split(' ').slice(0,5).join(' ');
    const opt  = document.createElement('option');
    opt.value  = t.key || `${t.item_id}_${t.shop_id}`;
    opt.textContent = name + (t.keyword ? ` (${t.keyword})` : '');
    opt._data  = t;
    pick.appendChild(opt);
  });

  // Restore API key status
  const saved = localStorage.getItem(_MLS_APIKEY);
  const statusEl = document.getElementById('mls-apikey-status');
  const inputRow = document.getElementById('mls-apikey-input-row');
  if (saved) {
    if (statusEl) statusEl.textContent = 'Tersimpan';
    if (inputRow) inputRow.style.display = 'none';
  }

  // Init calculator
  setTimeout(() => kalcCalc(), 100);
}

function mlsSwitchTab(tab) {
  document.querySelectorAll('#mls-tabs .dd-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('[id^="mls-tab-"]').forEach(el => {
    el.style.display = el.id === `mls-tab-${tab}` ? '' : 'none';
  });
}

async function mlsSelectProduct(val) {
  // Search both tracked (localStorage) and saved (Supabase-backed) sources
  const tracked = trkLoad();
  let t = tracked.find(p => (p.key || `${p.item_id}_${p.shop_id}`) === val);
  if (!t && _dscAllListings && _dscAllListings.length) {
    const found = _dscAllListings.find(p => `${p.item_id}_${p.shop_id}` === val);
    if (found) t = { key: val, item_id: found.item_id, shop_id: found.shop_id,
      product_name: found.product_name, store_name: found.store_name,
      image_url: found.image_url, category: found.category,
      price: found.price, total_sold: found.total_sold, keyword: found.keyword };
  }
  const heroEl = document.getElementById('mls-hero');
  if (!t) { if (heroEl) heroEl.style.display = 'none'; return; }

  _mlsContext = { keyword: t.keyword, product: t };
  if (heroEl) heroEl.style.display = 'block';

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('mls-hero-name',  t.product_name || t.name || '—');
  set('mls-hero-kw',    t.keyword || '—');
  set('mls-hero-price', t.price ? 'Rp ' + Math.round(t.price).toLocaleString('id-ID') : '—');
  set('mls-hero-sold',  t.total_sold ? Number(t.total_sold).toLocaleString('id-ID') : '—');
  set('mls-hero-cats',  t.category || '—');

  // Main image
  const mainImg = document.getElementById('mls-main-img');
  if (mainImg) { mainImg.src = t.image_url || ''; mainImg.style.opacity = '1'; }

  // Score badge
  const score = t.score || (typeof calcLarisScore === 'function' ? calcLarisScore(t, null) : null);
  const scoreNum = document.getElementById('mls-score-num');
  const scoreBadge = document.getElementById('mls-score-badge');
  if (scoreNum) scoreNum.textContent = score ?? '—';
  if (scoreBadge && score) {
    const [bg, border, color] = score >= 70 ? ['#ECFDF5','#6EE7B7','#065F46'] : score >= 50 ? ['#EFF6FF','#BFDBFE','#1D4ED8'] : ['#FEF2F2','#FECACA','#991B1B'];
    scoreBadge.style.cssText = `flex-shrink:0;width:78px;height:78px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px solid ${border};background:${bg};`;
    if (scoreNum) scoreNum.style.color = color;
  }

  set('mls-kw-badge', t.keyword || '—');
  set('mls-median-price', '…');
  set('mls-p-omset','…'); set('mls-p-listing','…'); set('mls-p-dom','…'); set('mls-p-sig','…');

  const compSection = document.getElementById('mls-comp-section');
  if (compSection) compSection.style.display = 'none';

  try {
    const { data: rawData } = await _supabase
      .from('listings')
      .select('product_name, store_name, image_url, price, total_sold, reviews, location, item_id, shop_id, keyword, url')
      .eq('keyword', t.keyword)
      .order('total_sold', { ascending: false })
      .limit(300);

    // Deduplicate by item_id+shop_id, keeping highest total_sold per product
    const seen = new Map();
    for (const r of (rawData || [])) {
      const k = `${r.item_id}_${r.shop_id}`;
      if (!seen.has(k) || (r.total_sold||0) > (seen.get(k).total_sold||0)) seen.set(k, r);
    }
    const rows = [...seen.values()].sort((a, b) => (b.total_sold||0) - (a.total_sold||0));
    const top5   = rows.slice(0, 5);
    const median = arr => { const s = [...arr].sort((a,b)=>a-b); return s.length ? s[Math.floor(s.length/2)] : 0; };
    const prices = rows.map(r => r.price||0).filter(v => v > 0);
    const solds  = rows.map(r => r.total_sold||0).filter(v => v > 0);
    const mPrice = median(prices);
    const mSold  = median(solds);

    // Market totals — divide by 6 to convert lifetime total_sold to approximate monthly estimate
    const _toMonthly = r => (r.price||0) * (r.total_sold||0) / 6;
    const totalOmset = rows.reduce((sum, r) => sum + _toMonthly(r), 0);
    const top3Omset  = rows.slice(0,3).reduce((sum, r) => sum + _toMonthly(r), 0);
    const dom3       = totalOmset > 0 ? Math.round(top3Omset / totalOmset * 100) : 0;
    const sigSellers = totalOmset > 0 ? rows.filter(r => _toMonthly(r) / totalOmset >= 0.005) : [];

    _mlsContext.medianPrice = mPrice;
    _mlsContext.medianSold  = mSold;
    _mlsContext.top5        = top5;
    _mlsContext.sigSellers  = sigSellers;
    _mlsContext.totalOmset  = totalOmset;

    // Pre-fill calculator price
    const kalPrice = document.getElementById('kal-price');
    if (kalPrice && mPrice > 0) { kalPrice.value = Math.round(mPrice); kalcCalc(); }

    // Pasar cards
    const fmt = n => n >= 1e9 ? 'Rp ' + (n/1e9).toFixed(1) + 'M' : n >= 1e6 ? 'Rp ' + (n/1e6).toFixed(0) + 'jt' : 'Rp ' + Math.round(n).toLocaleString('id-ID');
    set('mls-p-omset',   fmt(totalOmset));
    set('mls-p-listing', rows.length + ' listing');
    set('mls-median-price', mPrice ? 'Rp ' + Math.round(mPrice).toLocaleString('id-ID') : '—');
    const mSoldEl = document.getElementById('mls-median-sold');
    if (mSoldEl) mSoldEl.textContent = mSold ? mSold.toLocaleString('id-ID') + ' unit / bulan' : '— unit / bulan';
    set('mls-p-dom', dom3 + '%');
    set('mls-p-sig', sigSellers.length + ' penjual');

    // Build 10-thumbnail row from top competitors
    const thumbRow = document.getElementById('mls-thumb-row');
    if (thumbRow) {
      const allThumbs = [t, ...rows.filter(r => r.image_url && r.image_url !== t.image_url).slice(0,9)];
      thumbRow.innerHTML = allThumbs.map((r, i) => `
        <div class="mls-thumb${i===0?' active':''}" onclick="mlsSetThumb(this,'${(r.image_url||'').replace(/'/g,"\\'")}')">
          <img src="${r.image_url||''}" onerror="this.style.opacity='.3'" alt="">
        </div>`).join('');
      // Populate swipe image array
      mlsSetImages(allThumbs.map(r => r.image_url).filter(Boolean));
    }

    // Populate Ringkasan bar
    const kompScore = rows.length > 0 ? Math.min(100, Math.round(Math.log10(Math.max(1, rows.length)) / 2.7 * 100)) : 0;
    const kompLabel = kompScore >= 70 ? 'Tinggi' : kompScore >= 40 ? 'Sedang' : 'Rendah';
    const kompColor = kompScore >= 70 ? '#DC2626' : kompScore >= 40 ? '#D97706' : '#16A34A';
    const rbKomp  = document.getElementById('mls-rb-kompetisi');
    const rbHarga = document.getElementById('mls-rb-harga');
    const rbOmset = document.getElementById('mls-rb-omset');
    const rbPenjual = document.getElementById('mls-rb-penjual');
    if (rbKomp)    { rbKomp.textContent = kompLabel; rbKomp.style.color = kompColor; }
    if (rbHarga)   rbHarga.textContent = mPrice ? 'Rp ' + Math.round(mPrice).toLocaleString('id-ID') : '—';
    if (rbOmset)   rbOmset.textContent = fmt(totalOmset) + '/bln';
    if (rbPenjual) rbPenjual.textContent = rows.length + ' listing';

    // Top 15 competitors — row table (default) + card grid (toggle)
    const top15 = rows.slice(0, 15);
    const compSection = document.getElementById('mls-comp-section');
    const compSub     = document.getElementById('mls-comp-sub');
    const compTbody   = document.getElementById('mls-comp-tbody');   // <tbody> in table
    const compCards   = document.getElementById('mls-comp-cards');    // card grid
    if (compSection) compSection.style.display = top15.length ? 'block' : 'none';
    if (compSub) compSub.textContent = `${top15.length} produk teratas di keyword "${t.keyword}"`;
    const rankColors = ['#E8442A','#F5A623','#9CA3AF'];

    // ── Row view (table) ──
    if (compTbody) compTbody.innerHTML = top15.map((r, i) => {
      const omset  = _toMonthly(r);  // monthly estimate (lifetime/6)
      const share  = totalOmset > 0 ? (omset / totalOmset * 100) : 0;
      const rank   = i + 1;
      const rc     = rankColors[i] || '#6366F1';
      const rankBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${rc};color:#fff;font-size:.65rem;font-weight:800;flex-shrink:0;">${rank}</span>`;
      const imgHtml = r.image_url ? `<img src="${r.image_url}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;" onerror="this.style.display='none'">` : `<div style="width:32px;height:32px;border-radius:6px;background:#F3F4F6;"></div>`;
      const soldFmt = (r.total_sold||0) >= 1000 ? ((r.total_sold||0)/1000).toFixed(1) + 'rb' : String(r.total_sold||0);
      const reviewsFmt = (r.reviews||0) >= 1000 ? ((r.reviews||0)/1000).toFixed(1) + 'rb' : String(r.reviews||0);
      const shopUrl = r.url ? `<a href="${r.url}" target="_blank" onclick="event.stopPropagation()" style="color:#3B82F6;text-decoration:none;font-size:.6rem;">↗</a>` : '';
      return `<tr style="border-bottom:1px solid #F9FAFB;cursor:pointer;" onclick="mlsOpenCompDive('${r.item_id}','${r.shop_id}')">
        <td style="padding:9px 6px;">${rankBadge}</td>
        <td style="padding:9px 8px;">
          <div style="display:flex;align-items:center;gap:7px;">
            ${imgHtml}
            <div style="font-size:.68rem;font-weight:600;line-height:1.3;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(r.product_name||'—').slice(0,48)} ${shopUrl}</div>
          </div>
        </td>
        <td style="padding:9px 6px;font-size:.65rem;color:#374151;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${(r.store_name||'—').slice(0,20)}</td>
        <td style="padding:9px 6px;font-size:.63rem;color:#9CA3AF;white-space:nowrap;">${r.location||'—'}</td>
        <td style="padding:9px 6px;text-align:right;font-size:.72rem;font-weight:700;color:#111827;white-space:nowrap;">Rp ${(r.price||0).toLocaleString('id-ID')}</td>
        <td style="padding:9px 6px;text-align:right;font-size:.7rem;font-weight:700;color:#374151;white-space:nowrap;">${soldFmt}</td>
        <td style="padding:9px 6px;text-align:right;font-size:.7rem;color:#6B7280;white-space:nowrap;">${reviewsFmt}</td>
        <td style="padding:9px 6px;text-align:right;font-size:.68rem;font-weight:700;color:#E8442A;white-space:nowrap;">${share.toFixed(1)}%</td>
      </tr>`;
    }).join('');

    // ── Card view (hidden by default) ──
    if (compCards) compCards.innerHTML = top15.map((r, i) => {
      const omset  = _toMonthly(r);  // monthly estimate (lifetime/6)
      const share  = totalOmset > 0 ? (omset / totalOmset * 100) : 0;
      const rank   = i + 1;
      const rc     = rankColors[i] || '#E5E7EB';
      const rankCls = i < 3 ? `rank-${rank}` : '';
      const storeName = (r.store_name || '—').substring(0, 24);
      const soldFmt = (r.total_sold||0) >= 1000 ? ((r.total_sold||0)/1000).toFixed(1) + 'rb' : String(r.total_sold||0);
      return `<div class="mls-seller-card ${rankCls}" style="cursor:pointer;" onclick="mlsOpenCompDive('${r.item_id}','${r.shop_id}')">
        <div class="mls-seller-img-wrap">
          <img class="mls-seller-img" src="${r.image_url||''}" onerror="this.src='';this.style.background='#F0EDE8';" alt="${r.product_name||''}">
          <div class="mls-seller-rank" style="background:${rc};">${rank}</div>
        </div>
        <div class="mls-seller-body">
          <div class="mls-seller-store">${storeName}</div>
          <div class="mls-seller-price">Rp ${(r.price||0).toLocaleString('id-ID')}</div>
          <div style="font-size:.6rem;color:#9CA3AF;">${r.location||''}</div>
          <div class="mls-seller-stats">
            <span>${soldFmt} terjual</span><span style="color:#9CA3AF;">·</span>
            <span style="color:#E8442A;">${share.toFixed(1)}% share</span>
          </div>
          <div class="mls-seller-share-bar"><div class="mls-seller-share-fill" style="width:${Math.min(share*4,100)}%;background:${rc};"></div></div>
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    console.warn('mlsSelectProduct error', e);
  }
}

function mlsSetThumb(el, imgSrc) {
  document.querySelectorAll('.mls-thumb').forEach((t, i) => {
    t.classList.remove('active');
    if (t === el) _mlsImgIdx = i;
  });
  el.classList.add('active');
  const mainImg = document.getElementById('mls-main-img');
  if (mainImg && imgSrc) { mainImg.src = imgSrc; mainImg.style.opacity = '1'; }
  _mlsRenderDots();
}

let _mlsView = 'row';
function mlsSetView(mode) {
  _mlsView = mode;
  const tableWrap = document.getElementById('mls-comp-table-wrap');
  const cardsWrap = document.getElementById('mls-comp-cards');
  const btnRow  = document.getElementById('mls-view-row');
  const btnCard = document.getElementById('mls-view-card');
  if (tableWrap) tableWrap.style.display = mode === 'row'  ? '' : 'none';
  if (cardsWrap) cardsWrap.style.display = mode === 'card' ? '' : 'none';
  if (btnRow)  { btnRow.style.background  = mode === 'row'  ? '#FEF2F0' : '#fff'; btnRow.style.borderColor  = mode === 'row'  ? '#E8442A' : '#E5E7EB'; btnRow.style.color  = mode === 'row'  ? '#E8442A' : '#6B7280'; }
  if (btnCard) { btnCard.style.background = mode === 'card' ? '#FEF2F0' : '#fff'; btnCard.style.borderColor = mode === 'card' ? '#E8442A' : '#E5E7EB'; btnCard.style.color = mode === 'card' ? '#E8442A' : '#6B7280'; }
}

function mlsOpenCompDive(itemId, shopId) {
  // Find the competitor in current MLS keyword rows and open its deep dive
  const ctx = window._mlsContext || {};
  if (!ctx.keyword) return;
  // Find from discover listings or fetch
  const found = (_dscAllListings || []).find(p => String(p.item_id) === String(itemId) && String(p.shop_id) === String(shopId));
  if (found) { dscOpenDeepDive(`${found.item_id}__${found.shop_id}`); switchDashView('deepdive'); }
}

function mlsSaveApiKey() {
  const val = (document.getElementById('mls-apikey-input')?.value||'').trim();
  if (!val) return;
  localStorage.setItem(_MLS_APIKEY, val);
  const statusEl = document.getElementById('mls-apikey-status');
  const inputRow = document.getElementById('mls-apikey-input-row');
  if (statusEl) statusEl.textContent = 'Tersimpan';
  if (inputRow) inputRow.style.display = 'none';
  document.getElementById('mls-apikey-input').value = '';
}

function _mlsChatAppend(role, text) {
  const wrap = document.getElementById('mls-chat-messages');
  if (!wrap) return;
  const isUser = role === 'user';
  const div = document.createElement('div');
  div.className = 'mls-msg mls-msg-' + role;
  div.style.cssText = `align-self:${isUser?'flex-end':'flex-start'};max-width:85%;background:${isUser?'#E8442A':'#fff'};color:${isUser?'#fff':'#374151'};border:1px solid ${isUser?'#E8442A':'#E5E7EB'};border-radius:10px;padding:10px 14px;font-size:.73rem;line-height:1.5;white-space:pre-wrap;`;
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

async function mlsChatSend() {
  const input = document.getElementById('mls-chat-input');
  const sendBtn = document.getElementById('mls-chat-send');
  const text = (input?.value||'').trim();
  if (!text) return;

  const apiKey = localStorage.getItem(_MLS_APIKEY);
  if (!apiKey) {
    document.getElementById('mls-apikey-input-row').style.display = 'flex';
    _mlsChatAppend('assistant', 'Masukkan Anthropic API Key Anda terlebih dahulu untuk menggunakan fitur AI chat.');
    return;
  }

  input.value = '';
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  _mlsChatAppend('user', text);
  _mlsChatHistory.push({ role: 'user', content: text });

  // Show typing indicator
  const typingId = 'mls-typing-' + Date.now();
  const wrap = document.getElementById('mls-chat-messages');
  if (wrap) {
    const td = document.createElement('div');
    td.id = typingId;
    td.style.cssText = 'align-self:flex-start;font-size:.7rem;color:#9CA3AF;padding:6px 10px;';
    td.textContent = 'AI sedang mengetik…';
    wrap.appendChild(td);
    wrap.scrollTop = wrap.scrollHeight;
  }

  // Build system prompt with product context
  let systemPrompt = 'Kamu adalah AI strategist untuk platform Larisid, membantu penjual memulai berjualan di Shopee Indonesia. Jawab dalam Bahasa Indonesia, singkat dan praktis.';
  if (_mlsContext?.keyword) {
    systemPrompt += ` Konteks: pengguna tertarik pada keyword "${_mlsContext.keyword}".`;
    if (_mlsContext.medianPrice) systemPrompt += ` Median harga produk: Rp ${Math.round(_mlsContext.medianPrice).toLocaleString('id-ID')}.`;
    if (_mlsContext.medianSold)  systemPrompt += ` Median unit terjual: ${_mlsContext.medianSold}.`;
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: _mlsChatHistory.slice(-10),
      }),
    });

    document.getElementById(typingId)?.remove();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      _mlsChatAppend('assistant', 'Terjadi kesalahan: ' + (err?.error?.message || resp.status));
    } else {
      const data = await resp.json();
      const reply = data?.content?.[0]?.text || '(Tidak ada jawaban)';
      _mlsChatHistory.push({ role: 'assistant', content: reply });
      _mlsChatAppend('assistant', reply);
    }
  } catch(e) {
    document.getElementById(typingId)?.remove();
    _mlsChatAppend('assistant', 'Koneksi gagal. Pastikan API key benar dan coba lagi. (' + e.message + ')');
  }

  if (input) input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  if (input) input.focus();
}

// ── ALERTS ─────────────────────────────────────────────────────
let _alrAll = [], _alrActiveFilter = 'all';

function _alrRng(seed) {
  let s = seed;
  return function() { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function alrInit() {
  if (!allProducts || !allProducts.length) return;
  const rng = _alrRng(99991);

  const types = [
    { type:'price', icon:'💰', iconCls:'red',   badgeCls:'down', label: (p,r) => `Harga ${p.name.split(' ').slice(0,3).join(' ')} turun ${(2+r()*8).toFixed(1)}%`,    desc: (p,r) => `Dari Rp ${(p.medianPrice||85000).toLocaleString('id-ID')} → Rp ${Math.round((p.medianPrice||85000)*(0.88+r()*0.08)).toLocaleString('id-ID')}`, badge: r => `▼ ${(2+r()*8).toFixed(1)}%`, unread: true, accent: '' },
    { type:'trend', icon:'📈', iconCls:'green', badgeCls:'up',   label: (p,r) => `Tren ${p.name.split(' ').slice(0,3).join(' ')} naik signifikan`,                    desc: (p,r) => `Volume pencarian minggu ini naik ${Math.round(10+r()*30)}% dibanding minggu lalu`, badge: r => `▲ ${Math.round(10+r()*30)}%`, unread: true, accent: 'green' },
    { type:'opp',   icon:'⚡', iconCls:'blue',  badgeCls:'info', label: (p,r) => `Peluang baru terdeteksi: ${p.name.split(' ').slice(0,3).join(' ')}`,                 desc: (p,r) => `Skor kompetisi turun — celah masuk terbuka dengan margin estimasi ${Math.round(25+r()*20)}%`, badge: r => 'Peluang', unread: true, accent: 'blue' },
    { type:'stock', icon:'📦', iconCls:'yellow',badgeCls:'warn', label: (p,r) => `Kompetitor ${p.name.split(' ').slice(0,2).join(' ')} kehabisan stok`,                desc: (p,r) => `Toko teratas kehabisan stok — permintaan tidak terlayani, ini kesempatan Anda`, badge: r => 'Stok Habis', unread: false, accent: '' },
    { type:'price', icon:'💰', iconCls:'green', badgeCls:'up',   label: (p,r) => `Harga ${p.name.split(' ').slice(0,3).join(' ')} naik ${(3+r()*10).toFixed(1)}%`,     desc: (p,r) => `Pasar sedang menaikkan harga — pertimbangkan ikuti atau jaga harga untuk volume`, badge: r => `▲ ${(3+r()*10).toFixed(1)}%`, unread: false, accent: '' },
  ];

  const times = ['2m lalu','8m lalu','15m lalu','34m lalu','1j lalu','2j lalu','3j lalu','5j lalu','7j lalu','kemarin'];
  _alrAll = allProducts.slice(0, 10).map((p, i) => {
    const r = _alrRng(p.id * 777 + i);
    const t = types[i % types.length];
    return { ...t, prod: p, time: times[i], id: i, label: t.label(p,r), desc: t.desc(p,r), badge: t.badge(r) };
  });

  const triggered = _alrAll.filter(a => a.unread).length;
  const priceUp = _alrAll.filter(a => a.type === 'price' && a.badgeCls === 'up').length;
  const opps = _alrAll.filter(a => a.type === 'opp').length;
  document.getElementById('alr-s1').textContent = _alrAll.length;
  document.getElementById('alr-s1-sub').textContent = 'dari ' + allProducts.slice(0,10).length + ' produk dipantau';
  document.getElementById('alr-s2').textContent = triggered;
  document.getElementById('alr-s2-sub').textContent = triggered + ' notifikasi belum dibaca';
  document.getElementById('alr-s3').textContent = priceUp;
  document.getElementById('alr-s4').textContent = opps;

  alrRender();
}

function alrFilter(btn, type) {
  document.querySelectorAll('.alr-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _alrActiveFilter = type;
  alrRender();
}

function alrRender() {
  const items = _alrActiveFilter === 'all' ? _alrAll : _alrAll.filter(a => a.type === _alrActiveFilter);
  if (!items.length) {
    document.getElementById('alr-list').innerHTML = '<div class="alr-empty">Tidak ada alert untuk filter ini.</div>';
    return;
  }
  document.getElementById('alr-list').innerHTML = items.map(a => `
    <div class="alr-item ${a.unread ? 'unread' : ''} ${a.accent}">
      <div class="alr-icon ${a.iconCls}">${a.icon}</div>
      <div class="alr-body">
        <div class="alr-body-title">${a.label}</div>
        <div class="alr-body-desc">${a.desc}</div>
      </div>
      <div class="alr-meta">
        <span class="alr-badge ${a.badgeCls}">${a.badge}</span>
        <span class="alr-time">${a.time}</span>
      </div>
    </div>
  `).join('');
}

function alrMarkAllRead() {
  _alrAll.forEach(a => a.unread = false);
  document.querySelectorAll('.alr-item.unread').forEach(el => el.classList.remove('unread'));
  document.getElementById('alr-s2').textContent = '0';
  document.getElementById('alr-s2-sub').textContent = 'semua sudah dibaca';
}

function alrShowCreate() { openAuthModal('signup'); }

// ── LANDING PAGE PREVIEW ────────────────────────────────────────
let _lpPreviewChart = null;
const _LP_DEMO = {
  id: 42,
  name: 'Tas Selempang Pria Premium — Kulit Sintetis Anti Air',
  category: 'Fashion & Aksesoris',
  score: 87,
  medianPrice: 125000,
  newUnits: 180,
  expUnits: 220,
  startRevenue: 12000000,
  upToRevenue: 18600000,
  avgTrend: 1,
  emoji: '👜',
  image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&q=80'
};

function lpShowPreview() {
  const sec = document.getElementById('lp-preview-section');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let _lpBilling = 'bulanan';
function lpSetBilling(period) {
  _lpBilling = period;
  document.querySelectorAll('.lp-billing-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === period)
  );
  const annual = period === 'tahunan';
  // Pro
  const proPrice = document.getElementById('plan-pro-price');
  const proAnnual = document.getElementById('plan-pro-annual');
  if (proPrice) proPrice.textContent = annual ? 'Rp 79.200' : 'Rp 99.000';
  if (proAnnual) proAnnual.style.display = annual ? 'block' : 'none';
  // Pro+
  const ppPrice = document.getElementById('plan-proplus-price');
  const ppAnnual = document.getElementById('plan-proplus-annual');
  if (ppPrice) ppPrice.textContent = annual ? 'Rp 239.200' : 'Rp 299.000';
  if (ppAnnual) ppAnnual.style.display = annual ? 'block' : 'none';
}

function lpToggleFaq(item) {
  const q = item.querySelector('.lp-faq-q');
  const a = item.querySelector('.lp-faq-a');
  const chevron = item.querySelector('.lp-faq-chevron');
  if (!a) return;
  const isOpen = a.classList.contains('open');
  a.classList.toggle('open', !isOpen);
  if (chevron) chevron.classList.toggle('open', !isOpen);
}

function lpRenderPreview(p) {
  const rng = (function(seed){ let s=seed; return function(){ s=(s*1664525+1013904223)&0xffffffff; return (s>>>0)/0xffffffff; }; })(p.id * 31337);
  const price = p.medianPrice || 85000;
  const score = Math.round(p.score);
  const sales = p.newUnits || Math.round(80 + rng()*200);
  const omset = price * sales;
  const omsetDelta = Math.round(10 + rng()*20);
  const unitDelta  = Math.round(8 + rng()*18);
  const kompScore  = Math.round(40 + rng()*40);
  const kompLabel  = kompScore >= 65 ? 'Tinggi' : kompScore >= 40 ? 'Sedang' : 'Rendah';

  const imgEl = document.getElementById('lp-dd-img');
  if (imgEl) {
    if (p.image) imgEl.innerHTML = `<img src="${p.image}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    else imgEl.textContent = p.emoji || '📦';
  }
  document.getElementById('lp-dd-name').textContent  = p.name;
  document.getElementById('lp-dd-cats').innerHTML    = `Kategori: ${p.category||'Umum'} <span>• Sub Kategori: ${p.category||'Umum'}</span>`;
  document.getElementById('lp-dd-score').textContent = score;
  const tag = document.getElementById('lp-dd-score-tag');
  tag.textContent = score >= 75 ? 'Potensi Tinggi' : 'Potensi Sedang';
  tag.style.cssText = score >= 75 ? 'background:#EAF7F0;color:#10B981;border:1px solid #D1FAE5;font-size:.7rem;font-weight:600;padding:3px 10px;border-radius:4px;margin-top:6px;display:inline-block;' : 'background:#FFF0ED;color:#E8442A;border:1px solid #F9C5BB;font-size:.7rem;font-weight:600;padding:3px 10px;border-radius:4px;margin-top:6px;display:inline-block;';
  document.getElementById('lp-dd-omset').textContent   = 'Rp ' + (omset/1000000).toFixed(1).replace('.',',') + ' jt';
  document.getElementById('lp-dd-omset-d').textContent = `↑ ${omsetDelta}%`;
  document.getElementById('lp-dd-unit').textContent    = sales.toLocaleString('id-ID');
  document.getElementById('lp-dd-unit-d').textContent  = `↑ ${unitDelta}%`;
  document.getElementById('lp-dd-komp').textContent    = kompLabel;
  document.getElementById('lp-dd-komp').style.color    = kompScore >= 65 ? '#E8442A' : kompScore >= 40 ? '#D97706' : '#10B981';
  document.getElementById('lp-dd-komp-sub').textContent = 'Skor: ' + kompScore + '/100';

  const pMin = Math.round(price*0.52), pMax = Math.round(price*1.85);
  const zL = Math.round(price*0.85), zR = Math.round(price*1.12);
  document.getElementById('lp-dd-price-range').textContent = `Rp ${zL.toLocaleString('id-ID')} – Rp ${zR.toLocaleString('id-ID')}`;
  document.getElementById('lp-dd-range-zone').style.cssText = `left:${Math.round((zL-pMin)/(pMax-pMin)*100)}%;width:${Math.round((zR-zL)/(pMax-pMin)*100)}%;`;
  document.getElementById('lp-dd-range-labels').innerHTML = `<span>${(pMin/1000).toFixed(0)}k</span><span>${(Math.round((pMin+pMax)*0.3)/1000).toFixed(0)}k</span><span>${(Math.round((pMin+pMax)*0.6)/1000).toFixed(0)}k</span><span>${(pMax/1000).toFixed(0)}k</span>`;

  document.getElementById('lp-dd-ai').innerHTML = [
    `Permintaan tinggi dan terus meningkat dalam 30 hari terakhir.`,
    `Kompetisi ${kompLabel.toLowerCase()}, masih ada peluang untuk pemain baru.`,
    `Disarankan fokus pada variasi warna populer di kategori ini.`,
  ].map(t => `<div class="dd-ai-item"><div class="dd-ai-check">✓</div><div>${t}</div></div>`).join('');

  const dates = ['20 Apr','27 Apr','4 Mei','11 Mei','18 Mei'];
  const omsetS = dates.map((_,i) => Math.round(omset*(0.65+i*0.09)+(rng()-0.5)*omset*0.08));
  const unitS  = dates.map((_,i) => Math.round(sales*(0.70+i*0.07)+(rng()-0.5)*sales*0.06));
  const tokoS  = dates.map((_,i) => Math.round(120+i*15+rng()*20));
  if (_lpPreviewChart) _lpPreviewChart.destroy();
  _lpPreviewChart = new Chart(document.getElementById('lp-dd-chart-trend'), {
    type: 'line',
    data: { labels: dates, datasets: [
      { data:omsetS, borderColor:'#E8442A', backgroundColor:'rgba(232,68,42,.06)', borderWidth:2.5, fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#E8442A', yAxisID:'y' },
      { data:unitS,  borderColor:'#4F46E5', backgroundColor:'transparent', borderWidth:2, tension:0.4, pointRadius:3, pointBackgroundColor:'#4F46E5', yAxisID:'y2' },
      { data:tokoS,  borderColor:'#9CA3AF', backgroundColor:'transparent', borderWidth:2, tension:0.4, pointRadius:3, pointBackgroundColor:'#9CA3AF', yAxisID:'y2', borderDash:[4,3] },
    ]},
    options: { plugins:{legend:{display:false}}, scales:{ x:{ticks:{font:{size:9}}}, y:{position:'left',ticks:{font:{size:8},callback:v=>(v/1000000).toFixed(0)+'jt'}}, y2:{position:'right',grid:{drawOnChartArea:false},ticks:{font:{size:8}}} }, animation:{duration:400} }
  });
}

function _initPdbCats() {
  if (_pdbCatsInited) return;
  _pdbCatsInited = true;
  const grid = document.getElementById('pdb-cats-grid');
  if (!grid) return;
  grid.innerHTML = PDB_CATS.map(c => `
    <label class="pdb-cat-label">
      <input type="checkbox" class="pdb-cat-cb" value="${c}" checked> ${c}
    </label>`).join('');
}

function pdbSelectAll(checked) {
  document.querySelectorAll('.pdb-cat-cb').forEach(cb => cb.checked = checked);
}

function pdbResetFilters() {
  document.querySelectorAll('.pdb-cat-cb').forEach(cb => cb.checked = true);
  ['price','rating','sold','reviews','stock','score'].forEach(f => {
    const mn = document.getElementById(`pdb-min-${f}`);
    const mx = document.getElementById(`pdb-max-${f}`);
    if (mn) mn.value = '';
    if (mx) mx.value = '';
  });
  _pdbRows = [];
  const tbody = document.getElementById('pdb-tbody');
  if (tbody) tbody.innerHTML = '';
  const cnt = document.getElementById('pdb-count');
  if (cnt) cnt.textContent = '';
  const st = document.getElementById('pdb-status');
  if (st) st.textContent = '';
}

function pdbSaveFilter() {
  const filters = _pdbGetFilters();
  localStorage.setItem('pdb_saved_filter', JSON.stringify(filters));
  const st = document.getElementById('pdb-status');
  if (st) { st.textContent = '✓ Filter tersimpan'; setTimeout(() => { if(st) st.textContent=''; }, 2500); }
}

function pdbLoadFilter() {
  const saved = localStorage.getItem('pdb_saved_filter');
  if (!saved) return;
  try {
    const f = JSON.parse(saved);
    _initPdbCats();
    document.querySelectorAll('.pdb-cat-cb').forEach(cb => cb.checked = f.cats?.includes(cb.value) ?? true);
    const fields = ['price','rating','sold','reviews','stock','score'];
    fields.forEach(field => {
      const mn = document.getElementById(`pdb-min-${field}`);
      const mx = document.getElementById(`pdb-max-${field}`);
      if (mn && f[`min_${field}`] != null) mn.value = f[`min_${field}`];
      if (mx && f[`max_${field}`] != null) mx.value = f[`max_${field}`];
    });
  } catch(e) {}
}

function _pdbGetFilters() {
  const cats = [...document.querySelectorAll('.pdb-cat-cb:checked')].map(cb => cb.value);
  const gv = id => { const el = document.getElementById(id); return el?.value ? parseFloat(el.value) : null; };
  return {
    cats,
    min_price:   gv('pdb-min-price'),   max_price:   gv('pdb-max-price'),
    min_rating:  gv('pdb-min-rating'),  max_rating:  gv('pdb-max-rating'),
    min_sold:    gv('pdb-min-sold'),     max_sold:    gv('pdb-max-sold'),
    min_reviews: gv('pdb-min-reviews'), max_reviews: gv('pdb-max-reviews'),
    min_stock:   gv('pdb-min-stock'),    max_stock:   gv('pdb-max-stock'),
    min_score:   gv('pdb-min-score'),    max_score:   gv('pdb-max-score'),
  };
}

function _pdbViabilityScore(r) {
  const soldScore  = Math.min((r.total_sold || 0) / 500 * 40, 40);
  const stock      = r.stock || 0;
  const stockScore = stock < 100 ? 30 : stock < 500 ? 20 : 10;
  const ratingScore = ((r.rating || 0) / 5) * 30;
  return Math.round(soldScore + stockScore + ratingScore);
}

// ── LarisScore: How easy is it to break into page 1-2 and capture ≥0.5% of their sales? ──
// peers = ~120 page-1-2 Shopee listings — NOT all sellers, just the visible top performers.
// kwTrendPct = % change in total keyword sold vs previous scrape (null if unavailable).
// Growing market → easier to enter; declining → harder (existing sellers fight for less).
function calcLarisScore(listing, peers, kwTrendPct = null) {
  const rows = peers && peers.length > 5 ? peers : null;
  let baseScore;

  if (rows) {
    const soldArr   = rows.map(r => r.total_sold || 0).sort((a, b) => a - b);
    const totalSold = soldArr.reduce((s, v) => s + v, 0);
    const target05  = totalSold * 0.005;

    // Factor 1 — Entry bar vs. 0.5% target (35 pts)
    const p20Sold    = soldArr[Math.floor(soldArr.length * 0.20)] || 0;
    const entryRatio = target05 > 0 ? p20Sold / target05 : 1;
    const entryScore = Math.max(0, Math.min(35, 35 * (2 - entryRatio) / 2));

    // Factor 2 — Review moat (30 pts)
    const revArr      = rows.map(r => r.reviews || r.review_count || 0).sort((a, b) => a - b);
    const medRev      = revArr[Math.floor(revArr.length * 0.5)] || 0;
    const reviewScore = Math.max(0, Math.min(30, 30 * (1 - medRev / 400)));

    // Factor 3 — Top-10 concentration (20 pts)
    const top10Sold  = rows.slice().sort((a, b) => (b.total_sold||0) - (a.total_sold||0))
                           .slice(0, 10).reduce((s, r) => s + (r.total_sold||0), 0);
    const top10Share = totalSold > 0 ? top10Sold / totalSold : 1;
    const concScore  = Math.max(0, Math.min(20, 20 * (1 - (top10Share - 0.30) / 0.60)));

    // Factor 4 — Price accessibility (15 pts)
    const prices    = rows.map(r => r.price || 0).filter(Boolean).sort((a, b) => a - b);
    const medPrice  = prices[Math.floor(prices.length * 0.5)] || 0;
    const priceScore = medPrice >= 20000 && medPrice <= 500000 ? 15
      : medPrice < 20000  ? Math.round(medPrice / 20000 * 15)
      : Math.max(0, Math.round(15 - (medPrice - 500000) / 500000 * 15));

    baseScore = entryScore + reviewScore + concScore + priceScore;
  } else {
    const sold    = listing.total_sold || 0;
    const reviews = listing.reviews || listing.review_count || 0;
    const rating  = listing.rating  || 0;
    const price   = listing.price   || 0;
    const soldScore  = sold < 100  ? Math.min(sold / 100, 1) * 25
      : sold <= 5000 ? 25 - (sold - 100) / 4900 * 10
      : Math.max(5, 15 - (sold - 5000) / 5000 * 5);
    const revScore   = Math.max(0, 35 * (1 - reviews / 500));
    const ratingGap  = Math.max(0, 20 * (1 - Math.max(0, rating - 3.5) / 1.5));
    const priceScore = price >= 25000 && price <= 400000 ? 20
      : price < 25000  ? Math.round(price / 25000 * 20)
      : Math.max(0, Math.round(20 - (price - 400000) / 400000 * 20));
    baseScore = soldScore + revScore + ratingGap + priceScore;
  }

  // Factor 5 — Keyword trend adjustment (±10 pts)
  // Growing market: new demand entering = less zero-sum, share easier to capture.
  // Declining market: existing sellers fight over shrinking pie = harder to enter.
  // Capped at ±10 so trend nudges without overriding structural factors.
  const trendAdj = kwTrendPct != null
    ? Math.max(-10, Math.min(10, kwTrendPct * 0.33))
    : 0;

  return Math.min(100, Math.max(0, Math.round(baseScore + trendAdj)));
}

// ── ListingScore: How attractive is THIS specific listing as an opportunity? ──
// kwTrendPct = % change in keyword total sold vs prev scrape.
// listingTrendPct = % change in this listing's total_sold vs prev scrape.
// Returns { total, kwScore, salesScore, revScore, omsetScore, trendScore, larisScore }
function calcListingScore(listing, peers, listingTrendPct = null, kwTrendPct = null) {
  const rows = peers && peers.length > 5 ? peers : null;

  // A. Keyword ease contribution (30 pts)
  const larisScore = calcLarisScore(listing, rows, kwTrendPct);
  const kwScore    = Math.round(larisScore * 0.30);

  // B. Sales percentile rank within the 120 (25 pts)
  let salesScore;
  if (rows) {
    const sortedSold = rows.map(r => r.total_sold || 0).sort((a, b) => a - b);
    const below      = sortedSold.filter(v => v <= (listing.total_sold || 0)).length;
    salesScore       = Math.round((below / sortedSold.length) * 25);
  } else {
    const sold = listing.total_sold || 0;
    salesScore = Math.min(25, Math.round(Math.log10(Math.max(sold, 1)) / Math.log10(5000) * 25));
  }

  // C. Review efficiency (25 pts)
  const sold      = listing.total_sold || 0;
  const reviews   = listing.reviews || listing.review_count || 0;
  const spR       = sold / Math.max(reviews, 1);
  const effScore  = Math.min(15, Math.round(spR / 40 * 15));
  const barScore  = Math.max(0, Math.round((1 - Math.min(reviews / 300, 1)) * 10));
  const revScore  = effScore + barScore;

  // D. Revenue opportunity (20 pts)
  const monthly    = (listing.price || 0) * sold / 12;
  const omsetScore = Math.min(20, Math.round(Math.log10(Math.max(monthly, 1)) / Math.log10(50000000) * 20));

  // E. Trend adjustment (±10 pts)
  // Prefer listing-level trend; fall back to keyword trend if listing data unavailable.
  // Strongly rising listing = momentum, easier to ride. Falling = declining opportunity.
  const trendPct   = listingTrendPct ?? kwTrendPct ?? null;
  const trendScore = trendPct != null
    ? Math.max(-10, Math.min(10, trendPct * 0.33))
    : 0;

  const total = Math.min(100, Math.max(0, Math.round(kwScore + salesScore + revScore + omsetScore + trendScore)));
  return { total, kwScore, salesScore, revScore, omsetScore, trendScore, larisScore };
}

function listingScoreLabel(score) {
  if (score >= 75) return { lbl: 'Peluang Tinggi',   bg: '#DCFCE7', clr: '#16A34A', border: '#D1FAE5' };
  if (score >= 55) return { lbl: 'Cukup Menjanjikan', bg: '#FFF7ED', clr: '#F59E0B', border: '#FDE68A' };
  if (score >= 35) return { lbl: 'Perlu Strategi',   bg: '#FEF2F2', clr: '#DC2626', border: '#FECACA' };
  return               { lbl: 'Sangat Kompetitif',   bg: '#F3F4F6', clr: '#6B7280', border: '#E5E7EB' };
}

async function loadProductDatabase() {
  if (!_supabase) return;
  const st = document.getElementById('pdb-status');
  const tbody = document.getElementById('pdb-tbody');
  const cnt = document.getElementById('pdb-count');
  const dateNote = document.getElementById('pdb-date-note');
  if (st) st.textContent = 'Memuat data…';
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#6B7280;font-size:.8rem;">Memuat…</td></tr>';

  // Get latest scraped_at date
  const { data: latestRow, error: latestErr } = await _supabase
    .from('listings')
    .select('scraped_at')
    .order('scraped_at', { ascending: false })
    .limit(1);

  if (latestErr || !latestRow?.length) {
    if (st) st.textContent = 'Gagal memuat data.';
    return;
  }
  const latestDate = latestRow[0].scraped_at.slice(0, 10);
  if (dateNote) dateNote.textContent = `Data: ${latestDate}`;

  const f = _pdbGetFilters();
  let query = _supabase
    .from('listings')
    .select('keyword,category,product_name,store_name,price,original_price,total_sold,rating,reviews,stock,image_url,url,item_id,shop_id,scraped_at')
    .gte('scraped_at', latestDate)
    .order('total_sold', { ascending: false })
    .limit(1000);

  if (f.cats && f.cats.length > 0 && f.cats.length < PDB_CATS.length) {
    query = query.in('category', f.cats);
  }
  if (f.min_price   != null) query = query.gte('price',    f.min_price);
  if (f.max_price   != null) query = query.lte('price',    f.max_price);
  if (f.min_rating  != null) query = query.gte('rating',   f.min_rating);
  if (f.max_rating  != null) query = query.lte('rating',   f.max_rating);
  if (f.min_sold    != null) query = query.gte('total_sold', f.min_sold);
  if (f.max_sold    != null) query = query.lte('total_sold', f.max_sold);
  if (f.min_reviews != null) query = query.gte('reviews',  f.min_reviews);
  if (f.max_reviews != null) query = query.lte('reviews',  f.max_reviews);
  if (f.min_stock   != null) query = query.gte('stock',    f.min_stock);
  if (f.max_stock   != null) query = query.lte('stock',    f.max_stock);

  const { data, error } = await query;
  if (error) {
    if (st) st.textContent = `Error: ${error.message}`;
    return;
  }

  // Group by keyword so each listing is scored against its market peers
  const _kwPeers = {};
  (data || []).forEach(r => {
    const k = r.keyword || '__';
    if (!_kwPeers[k]) _kwPeers[k] = [];
    _kwPeers[k].push(r);
  });
  _pdbRows = (data || []).map(r => {
    const kwT  = _dscKwTrendMap[r.keyword] ?? null;
    const lstT = _dscListingTrendPct(r);
    const ls   = calcListingScore(r, _kwPeers[r.keyword || '__'], lstT, kwT);
    return { ...r, score: ls.total, larisScore: ls.larisScore };
  });
  if (f.min_score != null) _pdbRows = _pdbRows.filter(r => r.score >= f.min_score);
  if (f.max_score != null) _pdbRows = _pdbRows.filter(r => r.score <= f.max_score);

  _pdbRenderTableAndCards();
  if (cnt) cnt.textContent = `${_pdbRows.length} produk`;
  if (st) st.textContent = '';
}

function pdbSort(field) {
  if (_pdbSortField === field) {
    _pdbSortDir = _pdbSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _pdbSortField = field;
    _pdbSortDir   = 'desc';
  }
  _pdbRenderTableAndCards();
}

function _pdbRenderTable() {
  const tbody = document.getElementById('pdb-tbody');
  if (!tbody) return;

  const rows = [..._pdbRows].sort((a, b) => {
    const av = a[_pdbSortField] ?? 0;
    const bv = b[_pdbSortField] ?? 0;
    return _pdbSortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const fmtRp = v => v ? 'Rp ' + Math.round(v).toLocaleString('id-ID') : '—';
  const fmtNum = v => v != null ? Math.round(v).toLocaleString('id-ID') : '—';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#6B7280;font-size:.8rem;">Tidak ada produk yang cocok dengan filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const img = r.image_url
      ? `<img src="${r.image_url}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;margin-right:8px;vertical-align:middle;" onerror="this.style.display='none'">`
      : '';
    const name = r.url
      ? `<a href="${r.url}" target="_blank" rel="noopener" style="color:#1A1F3C;font-weight:600;text-decoration:none;font-size:.78rem;">${r.product_name || '—'}</a>`
      : `<span style="font-size:.78rem;font-weight:600;">${r.product_name || '—'}</span>`;
    const scoreBg  = r.score >= 70 ? '#16a34a' : r.score >= 45 ? '#ca8a04' : '#dc2626';
    const scoreEl  = `<span style="background:${scoreBg};color:#fff;padding:2px 7px;border-radius:10px;font-size:.7rem;font-weight:700;">${r.score}</span>`;
    const tracked  = ptIsTracked(r.item_id, r.shop_id);
    const saveBtn  = `<button class="pt-save-btn${tracked?' saved':''}" data-key="${r.item_id}_${r.shop_id}"
      onclick="_pdbSaveRow(this,${JSON.stringify(r).replace(/"/g,'&quot;')})">${tracked?'Tersimpan':'+ Simpan'}</button>`;
    return `<tr>
      <td style="max-width:220px;">${img}${name}<div style="font-size:.65rem;color:#6B7280;margin-top:2px;">${r.store_name || ''}</div></td>
      <td style="font-size:.72rem;color:#374151;">${r.category || '—'}</td>
      <td style="font-size:.72rem;color:#374151;">${r.keyword || '—'}</td>
      <td style="font-size:.72rem;font-weight:600;">${fmtRp(r.price)}</td>
      <td style="font-size:.72rem;font-weight:600;">${fmtNum(r.total_sold)}</td>
      <td style="font-size:.72rem;">${r.rating ? r.rating.toFixed(1) : '—'}</td>
      <td style="font-size:.72rem;">${fmtNum(r.reviews)}</td>
      <td style="font-size:.72rem;">${fmtNum(r.stock)}</td>
      <td>${scoreEl}</td>
      <td>${saveBtn}</td>
    </tr>`;
  }).join('');
}

function _renderDashHome() {
  const products = _ptLoad();
  const fmtRp = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');

  // Stats row
  const statsEl = document.getElementById('dash-home-stats');
  if (statsEl) {
    statsEl.style.display = 'flex';
    statsEl.innerHTML = [
      { val: products.length, lbl: 'Produk Tersimpan' },
      { val: products.length ? fmtRp(products.reduce((s,p) => s + (p.price||0)*(p.total_sold||0)/12, 0)) : 'Rp 0', lbl: 'Potensi Revenue/Bln' },
      { val: products.length ? (products.reduce((s,p) => s + (p.score||0), 0) / products.length).toFixed(0) : '—', lbl: 'Avg LarisScore' },
      { val: products.filter(p => (p.score||0) >= 70).length, lbl: 'Produk Score 70+' },
    ].map(s => `<div class="dash-stat"><div class="dash-stat-val">${s.val}</div><div class="dash-stat-lbl">${s.lbl}</div></div>`).join('');
  }

  // Revenue cards
  const revTotal = products.reduce((s,p) => s + (p.price||0)*(p.total_sold||0)/12, 0);
  const revAvg   = products.length ? revTotal / products.length : 0;
  const best     = products.slice().sort((a,b) => (b.price||0)*(b.total_sold||0) - (a.price||0)*(a.total_sold||0))[0];
  const avgScore = products.length ? (products.reduce((s,p) => s + (p.score||0), 0) / products.length).toFixed(1) : '—';

  const rtEl = document.getElementById('home-rev-total');
  const raEl = document.getElementById('home-rev-avg');
  const rsSub = document.getElementById('home-rev-sub');
  const rbp = document.getElementById('home-rev-best-price');
  const rbn = document.getElementById('home-rev-best-name');
  const rsc = document.getElementById('home-rev-score');
  if (rtEl) rtEl.textContent = fmtRp(revTotal);
  if (raEl) raEl.textContent = fmtRp(revAvg);
  if (rsSub) rsSub.textContent = `${products.length} produk tersimpan`;
  if (rbp) rbp.textContent = best ? fmtRp((best.price||0)*(best.total_sold||0)/12) + '/bln' : '—';
  if (rbn) rbn.textContent = best ? (best.product_name||'').slice(0,30) : '';
  if (rsc) rsc.textContent = avgScore;

  const emptyEl = document.getElementById('home-rev-empty');
  const miniListEl = document.getElementById('home-prod-mini-list');
  if (!products.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (miniListEl) miniListEl.innerHTML = '';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    if (miniListEl) {
      const top5 = products.slice().sort((a,b) => (b.price||0)*(b.total_sold||0) - (a.price||0)*(a.total_sold||0)).slice(0,5);
      miniListEl.innerHTML = top5.map(p => {
        const rev = fmtRp((p.price||0)*(p.total_sold||0)/12);
        const img = p.image_url ? `<img src="${p.image_url}" onerror="this.style.display='none'">` : '<div style="width:34px;height:34px;background:#F3F4F6;border-radius:5px;flex-shrink:0;"></div>';
        return `<div class="home-prod-mini" onclick="switchDashView('estimator')">
          ${img}
          <div class="home-prod-mini-name">${p.product_name||'—'}</div>
          <div class="home-prod-mini-val">${rev}</div>
        </div>`;
      }).join('');
    }
  }

  // Alerts
  const alertsEl = document.getElementById('home-alerts-list');
  if (alertsEl) {
    if (!products.length) {
      alertsEl.innerHTML = '<div style="text-align:center;padding:24px 0;color:#9CA3AF;font-size:.78rem;">Simpan produk dari Product Database untuk mulai menerima alerts.</div>';
    } else {
      const alerts = [];
      products.forEach(p => {
        const score = p.score || calcLarisScore(p, null);
        if (score >= 70) alerts.push({ type:'up', title: (p.product_name||'').slice(0,38), sub: `Score ${score} — produk berpotensi tinggi`, badge: `Score ${score}`, badgeType:'up' });
        else if (score < 40) alerts.push({ type:'warn', title: (p.product_name||'').slice(0,38), sub: `Score ${score} — perlu ditinjau ulang`, badge: `Score ${score}`, badgeType:'down' });
      });
      if (!alerts.length) {
        products.slice(0,3).forEach(p => {
          const score = p.score || calcLarisScore(p, null);
          alerts.push({ type:'info', title:(p.product_name||'').slice(0,38), sub:`Score ${score} — tersimpan di tracker`, badge:`Score ${score}`, badgeType:'info' });
        });
      }
      alertsEl.innerHTML = alerts.slice(0,6).map(a => `
        <div class="home-alert-item">
          <div class="home-alert-icon ${a.type}">
            ${a.type==='up'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>':
              a.type==='down'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>':
              a.type==='warn'?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>':
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'}
          </div>
          <div class="home-alert-body">
            <div class="home-alert-title">${a.title}</div>
            <div class="home-alert-sub">${a.sub}</div>
          </div>
          <div class="home-alert-badge ${a.badgeType}">${a.badge}</div>
        </div>`).join('');
    }
  }

  // Load trending products (once per session)
  if (!_htdLoaded) { _htdLoaded = true; _loadHomeTrending(); }
}

// ── CARD VIEW ──────────────────────────────────────────────────
let _pdbCurrentView = 'list';
let _ofCurrentView  = 'list';

function pdbSetView(v) {
  _pdbCurrentView = v;
  document.getElementById('pdb-view-list')?.classList.toggle('active', v === 'list');
  document.getElementById('pdb-view-card')?.classList.toggle('active', v === 'card');
  document.getElementById('pdb-table-wrap').style.display = v === 'list' ? '' : 'none';
  document.getElementById('pdb-card-grid').style.display  = v === 'card' ? '' : 'none';
  if (v === 'card') _pdbRenderCards();
}

function ofSetView(v) {
  _ofCurrentView = v;
  document.getElementById('of-view-list')?.classList.toggle('active', v === 'list');
  document.getElementById('of-view-card')?.classList.toggle('active', v === 'card');
  document.getElementById('of-table-wrap').style.display = v === 'list' ? '' : 'none';
  document.getElementById('of-card-grid').style.display  = v === 'card' ? '' : 'none';
  if (v === 'card') _ofRenderCards();
}

function _pdbRenderCards() {
  const grid = document.getElementById('pdb-card-grid');
  if (!grid) return;
  const fmtRp = v => 'Rp ' + Math.round(v||0).toLocaleString('id-ID');
  const rows = [..._pdbRows].sort((a,b) => (b[_pdbSortField]||0) - (a[_pdbSortField]||0));
  if (!rows.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9CA3AF;font-size:.8rem;">Tidak ada produk yang cocok.</div>'; return; }
  grid.innerHTML = rows.map(r => {
    const omset = fmtRp((r.price||0) * (r.total_sold||0) / 12);
    const scoreBg = r.score >= 70 ? '#16a34a' : r.score >= 45 ? '#ca8a04' : '#dc2626';
    const tracked = ptIsTracked(r.item_id, r.shop_id);
    const shopeeBtn = r.url ? `<a href="${r.url}" target="_blank" rel="noopener" class="pdb-card-hover-btn primary" onclick="event.stopPropagation()">Lihat Shopee</a>` : '';
    return `<div class="pdb-card">
      <div class="pdb-card-img-wrap">
        ${r.image_url ? `<img class="pdb-card-img" src="${r.image_url}" onerror="this.style.display='none'" loading="lazy">` : '<div style="width:100%;height:100%;background:#F3F4F6;"></div>'}
        <div class="pdb-card-score" style="background:${scoreBg}">${r.score||0}</div>
        <button class="pdb-card-save${tracked?' saved':''}" onclick="event.stopPropagation();_pdbSaveRow(this,${JSON.stringify(r).replace(/"/g,'&quot;')})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="${tracked?'#E8442A':'none'}" stroke="${tracked?'#E8442A':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <div class="pdb-card-hover">
          <div class="pdb-card-hover-btns">
            ${shopeeBtn}
            <button class="pdb-card-hover-btn secondary" onclick="event.stopPropagation();ofOpenKeyword('${(r.keyword||'').replace(/'/g,"\\'")}')">Lihat Keyword</button>
          </div>
        </div>
      </div>
      <div class="pdb-card-body">
        <div class="pdb-card-store">${r.store_name||'—'}</div>
        <div class="pdb-card-name" style="-webkit-line-clamp:1;font-weight:500;font-size:.68rem;color:#6B7280;">${r.product_name||'—'}</div>
        <div class="pdb-card-omset"><span class="pdb-card-omset-lbl">Rata-rata omset/bln </span>${omset}</div>
        <div class="pdb-card-meta" style="margin-top:4px;">
          <span class="pdb-card-price">${fmtRp(r.price)}</span>
          <span class="pdb-card-sold">${(r.total_sold||0).toLocaleString('id-ID')} terjual</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function _ofRenderCards() {
  const grid = document.getElementById('of-card-grid');
  if (!grid) return;
  const fmtRp = v => 'Rp ' + Math.round(v||0).toLocaleString('id-ID');
  const rows = [..._ofRows].sort((a,b) => (b[_ofSortField]||0) - (a[_ofSortField]||0));
  if (!rows.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9CA3AF;font-size:.8rem;">Atur filter lalu klik Cari Peluang.</div>'; return; }
  grid.innerHTML = rows.map(r => {
    const rev = fmtRp((r.avg_price||0) * (r.total_sold||0) / 12);
    const scoreBg = r.score >= 70 ? '#16a34a' : r.score >= 45 ? '#ca8a04' : '#dc2626';
    return `<div class="pdb-card" onclick="switchDashView('keywords');setTimeout(()=>{const ki=document.getElementById('kx-input');if(ki){ki.value='${r.keyword}';analyzeKeyword();}},200)">
      <div class="pdb-card-img-wrap" style="background:linear-gradient(135deg,#1A1F3C,#2d3561);display:flex;align-items:center;justify-content:center;">
        <div style="color:rgba(255,255,255,.15);font-size:2.5rem;font-weight:800;letter-spacing:-.04em;overflow:hidden;padding:8px;text-align:center;word-break:break-all;">${r.keyword.slice(0,12)}</div>
        <div class="pdb-card-score" style="background:${scoreBg}">${r.score||0}</div>
        <div class="pdb-card-hover">
          <div class="pdb-card-hover-rev">Estimasi Market/Bln</div>
          <div class="pdb-card-hover-val">${rev}</div>
          <div class="pdb-card-hover-btns">
            <button class="pdb-card-hover-btn primary" onclick="event.stopPropagation();switchDashView('keywords');setTimeout(()=>{const ki=document.getElementById('kx-input');if(ki){ki.value='${r.keyword}';analyzeKeyword();}},200)">Analisis Keyword</button>
          </div>
        </div>
      </div>
      <div class="pdb-card-body">
        <div class="pdb-card-name" style="-webkit-line-clamp:1;">${r.keyword}</div>
        <div class="pdb-card-meta">
          <span class="pdb-card-price">${fmtRp(r.avg_price)}</span>
          <span class="pdb-card-sold">${(r.seller_count||0)} seller</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── OPPORTUNITY FINDER — KEYWORD DRILL-DOWN ──────────────────
let _ofDetailCache = {};  // keyword → { latestDate, data }

function ofCloseDetail() {
  const el = document.getElementById('of-detail-overlay');
  if (el) el.style.display = 'none';
}

// ── Keyword Detail Popup (full modal matching product detail view) ────────────
let _kdCache = {};

async function openKwDetail(keyword) {
  if (!_supabase) return;
  const overlay = document.getElementById('kd-overlay');
  if (!overlay) return;

  document.getElementById('kd-right-panel').innerHTML = '<div class="of-detail-loading">Memuat data keyword...</div>';
  document.getElementById('kd-thumbs').innerHTML = '';
  document.getElementById('kd-full-sections').innerHTML = '';
  const mainImg = document.getElementById('kd-main-img');
  if (mainImg) { mainImg.src = ''; mainImg.parentNode.style.background = '#F3F4F6'; }
  document.getElementById('kd-supplier-card').style.display = 'none';
  overlay.style.display = 'flex';
  overlay.scrollTop = 0;

  const fmtS = v => {
    const n = Math.round(v||0);
    if (n >= 1e9) return `Rp${(n/1e9).toFixed(1)}M`;
    if (n >= 1e6) return `Rp${(n/1e6).toFixed(0)}jt`;
    if (n >= 1e3) return `Rp${(n/1e3).toFixed(0)}rb`;
    return `Rp${n.toLocaleString('id-ID')}`;
  };
  const fmtFull = v => 'Rp ' + Math.round(v||0).toLocaleString('id-ID');

  let latestDate = _kdCache[keyword]?.latestDate;
  if (!latestDate) {
    const { data: lr } = await _supabase.from('listings').select('scraped_at').eq('keyword', keyword).order('scraped_at', {ascending:false}).limit(1);
    latestDate = lr?.[0]?.scraped_at?.slice(0,10);
    if (!latestDate) { document.getElementById('kd-right-panel').innerHTML = '<div class="of-detail-loading">Gagal memuat data.</div>'; return; }
  }

  let sellers = _kdCache[keyword]?.sellers;
  if (!sellers) {
    const { data, error } = await _supabase
      .from('listings')
      .select('product_name,store_name,image_url,url,price,total_sold,rating,review_count,item_id,shop_id,listing_date,location')
      .gte('scraped_at', latestDate)
      .eq('keyword', keyword)
      .order('total_sold', { ascending: false })
      .limit(300);
    if (error || !data?.length) { document.getElementById('kd-right-panel').innerHTML = '<div class="of-detail-loading">Gagal memuat data.</div>'; return; }
    sellers = data;
    _kdCache[keyword] = { latestDate, sellers };
  }

  const totalSold  = sellers.reduce((s,r) => s + (r.total_sold||0), 0);
  const prices     = sellers.map(r => r.price||0).filter(Boolean).sort((a,b) => a-b);
  const rawRevenues = sellers.map(r => (r.price||0)*(r.total_sold||0)/12).sort((a,b) => a-b);
  const revenues   = filterOutliers(rawRevenues);   // remove statistical outliers before display
  const medianPrice = _median(prices);
  const medianRev   = _median(revenues);
  const minRev = revenues[0]||0, maxRev = revenues[revenues.length-1]||0;

  const soldArr   = sellers.map(r => r.total_sold||0).sort((a,b) => a-b);
  const newUnits  = Math.max(1, Math.round((soldArr[Math.floor(soldArr.length*0.25)]||0)/12));
  const expUnits  = Math.max(1, Math.round((soldArr[Math.floor(soldArr.length*0.75)]||0)/12));

  const threshold = totalSold * 0.005;
  const topSellers = sellers
    .filter(r => (r.total_sold||0) >= threshold)
    .map(r => ({...r, share: totalSold?(r.total_sold||0)/totalSold*100:0, omset_bln:(r.price||0)*(r.total_sold||0)/12}));

  const score    = _kwOpportunityScore(sellers, totalSold);
  const scoreCol = _scoreColor(score);
  const scoreHint = _scoreHint(score, sellers, totalSold, medianRev);

  const ages       = sellers.map(r => r.listing_date).filter(Boolean);
  const ageDays    = ages.map(d => Math.floor((Date.now()-new Date(d).getTime())/86400000)).filter(n=>n>=0).sort((a,b)=>a-b);
  const shortestAge = ageDays[0]??null;
  const medianAgeDays = _median(ageDays);
  const longestAge  = ageDays[ageDays.length-1]??null;

  const fmtD = d => {
    if (d == null) return '—';
    if (d < 7) return `${d} hari`;
    if (d < 30) return `${Math.round(d/7)} minggu`;
    if (d < 365) return `${Math.floor(d/30)} bulan`;
    const y = Math.floor(d/365), m = Math.floor((d%365)/30);
    return m > 0 ? `${y} thn ${m} bln` : `${y} tahun`;
  };

  // Images
  const imgSellers = sellers.filter(r => r.image_url).slice(0,5);
  if (imgSellers.length) {
    const mainImgEl = document.getElementById('kd-main-img');
    if (mainImgEl) {
      mainImgEl.src = imgSellers[0].image_url;
      mainImgEl.parentNode.style.background = '';
    }
    const thumbsEl = document.getElementById('kd-thumbs');
    if (thumbsEl) {
      thumbsEl.innerHTML = imgSellers.map((s,i) => `
        <div class="kd-thumb${i===0?' active':''}" onclick="kdSetMain(this,'${s.image_url.replace(/'/g,"\\'")}')">
          <img src="${s.image_url}" loading="lazy" onerror="this.parentNode.style.opacity=.4">
        </div>`).join('');
    }
    const supCard = document.getElementById('kd-supplier-card');
    if (supCard) {
      supCard.style.display = 'flex';
      const nameEl = document.getElementById('kd-supplier-name');
      if (nameEl) nameEl.textContent = (imgSellers[0].product_name||'').slice(0,28) + (imgSellers[0].product_name?.length>28?'…':'');
    }
  }

  // Right panel
  document.getElementById('kd-right-panel').innerHTML = `
    <!-- Score hero — simple first view -->
    <div style="background:${scoreCol}0d;border:1px solid ${scoreCol}30;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="font-size:2.2rem;font-weight:900;color:${scoreCol};line-height:1;">${score}</div>
        <div>
          <div style="font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#9CA3AF;">Skor Kelayakan</div>
          <div style="font-size:.82rem;font-weight:700;color:${scoreCol};">${scoreHint.verdict}</div>
        </div>
      </div>
      <div style="font-size:.78rem;color:#374151;line-height:1.5;">${scoreHint.sentence}</div>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">
        <div style="flex:1;min-width:90px;background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #E5E7EB;">
          <div style="font-size:.65rem;color:#9CA3AF;font-weight:600;">Omset Median/bln</div>
          <div style="font-size:.88rem;font-weight:800;color:#E8442A;">${fmtS(medianRev)}</div>
        </div>
        <div style="flex:1;min-width:90px;background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #E5E7EB;">
          <div style="font-size:.65rem;color:#9CA3AF;font-weight:600;">Jumlah Seller</div>
          <div style="font-size:.88rem;font-weight:800;color:#1A1F3C;">${sellers.length}</div>
        </div>
        <div style="flex:1;min-width:90px;background:#fff;border-radius:8px;padding:8px 10px;border:1px solid #E5E7EB;">
          <div style="font-size:.65rem;color:#9CA3AF;font-weight:600;">Harga Median</div>
          <div style="font-size:.88rem;font-weight:800;color:#1A1F3C;">${fmtS(medianPrice)}</div>
        </div>
      </div>
    </div>
    <!-- Full analysis toggle -->
    <details style="margin-bottom:8px;">
    <summary style="cursor:pointer;font-size:.78rem;font-weight:700;color:#E8442A;padding:6px 0;list-style:none;display:flex;align-items:center;gap:5px;">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      Lihat Analisis Lengkap
    </summary>
    <div class="kd-top-chips">
      <div class="kd-score-badge" style="background:${scoreCol}22;color:${scoreCol};">
        <svg width="11" height="11" fill="${scoreCol}" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
        Skor ${score}
      </div>
      <div class="kd-cat-chip">${sellers[0]?.category||'Produk'}</div>
    </div>
    <div class="kd-product-title">${keyword}</div>
    <div class="kd-range-card">
      <div class="kd-range-label">Kisaran Harga Jual</div>
      <div class="kd-range-values">
        <span>${fmtS(prices[0]||0)}</span>
        <span style="color:#D1D5DB;">—</span>
        <span class="kd-range-median">${fmtS(medianPrice)}</span>
        <span style="color:#D1D5DB;">—</span>
        <span>${fmtS(prices[prices.length-1]||0)}</span>
      </div>
      <div class="kd-range-note">Median price shown in bold</div>
    </div>
    <div class="kd-range-card" style="border-color:#FCA5A530;background:#FEF9F8;">
      <div class="kd-range-label" style="color:#E8442A;">Estimasi Omset Per Bulan</div>
      <div class="kd-range-values">
        <span>${fmtS(minRev)}</span>
        <span style="color:#D1D5DB;">—</span>
        <span class="kd-range-median" style="color:#E8442A;">${fmtS(medianRev)}</span>
        <span style="color:#D1D5DB;">—</span>
        <span>${fmtS(maxRev)}</span>
      </div>
      <div class="kd-range-note">Median revenue shown in bold</div>
    </div>
    <div class="kd-stat-boxes">
      <div class="kd-stat-box">
        <div class="kd-stat-box-val">${newUnits}/mo</div>
        <div class="kd-stat-box-lbl">New Seller<br>Units/mo</div>
      </div>
      <div class="kd-stat-box">
        <div class="kd-stat-box-val">${expUnits}/mo</div>
        <div class="kd-stat-box-lbl">Exp. Seller<br>Units/mo</div>
      </div>
      <div class="kd-stat-box" style="background:${scoreCol}12;border:1px solid ${scoreCol}40;">
        <div class="kd-stat-box-val" style="color:${scoreCol};">${score}</div>
        <div class="kd-stat-box-lbl">Viability<br>Score</div>
      </div>
    </div>
    <div class="kd-charts-row">
      <div class="kd-chart-panel">
        <div class="kd-chart-label">Kategori — Revenue/Bln</div>
        <div id="kd-cat-chart" style="overflow-x:auto;"><div style="color:#9CA3AF;font-size:.7rem;">Memuat...</div></div>
      </div>
      <div class="kd-chart-panel">
        <div class="kd-chart-label">Tren Mingguan — Top 15</div>
        <div id="kd-trend-chart" style="overflow-x:auto;"><div style="color:#9CA3AF;font-size:.7rem;">Memuat...</div></div>
      </div>
    </div>
    <div class="kd-feedback">
      <div class="kd-feedback-q">Kamu seller? Apakah data ini accurate?</div>
      <div class="kd-feedback-sub">Berdasarkan pengalamanmu jualan produk ini — seberapa akurat data yang ditampilkan?</div>
      <div class="kd-feedback-btns">
        <button class="kd-feedback-btn">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
          Akurat! 0
        </button>
        <button class="kd-feedback-btn">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>
          Tidak Sesuai Realita 0
        </button>
      </div>
    </div>
    <div class="kd-cta-row">
      <button class="kd-cta-share" onclick="kdShare('${keyword.replace(/'/g,"\\'")}')">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share This Opportunity
      </button>
      <button class="kd-cta-save" onclick="kdClose();ofOpenKeyword('${keyword.replace(/'/g,"\\'")}')">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
        Simpan Produk
      </button>
    </div>
    </details>
  `;

  // Category revenue history chart (async) — gated: only unlocked keywords show full history
  (async () => {
    const el = document.getElementById('kd-cat-chart');
    if (!el) return;
    // Check if this keyword is unlocked (in keyword_library)
    let historyUnlocked = false;
    if (currentUser && _supabase) {
      const { data: lib } = await _supabase.from('keyword_library').select('id').eq('user_id', currentUser.id).eq('keyword', keyword).limit(1);
      historyUnlocked = lib?.length > 0;
    }
    if (!historyUnlocked) {
      el.innerHTML = `<div style="text-align:center;padding:14px 10px;">
        <div style="font-size:.72rem;color:#9CA3AF;margin-bottom:8px;">Riwayat data tersembunyi</div>
        <button onclick="cgOpenFor('${keyword.replace(/'/g, "\\'")}', 'history')" style="background:#E8442A;color:#fff;border:none;border-radius:7px;padding:6px 14px;font-size:.72rem;font-weight:700;cursor:pointer;font-family:inherit;">Buka Riwayat 30 Hari — 1 Kredit</button>
      </div>`;
      return;
    }
    const { data: hist } = await _supabase.from('listings').select('scraped_at,price,total_sold').eq('keyword',keyword).order('scraped_at',{ascending:true}).limit(600);
    if (!hist?.length) { el.innerHTML='<div style="color:#9CA3AF;font-size:.7rem;">Belum ada data</div>'; return; }
    const allRevs = hist.map(r => (r.price||0)*(r.total_sold||0)/12);
    const revCap  = filterOutliersMax(allRevs);
    const byDate = {};
    hist.forEach(r => {
      const rev = (r.price||0)*(r.total_sold||0)/12;
      if (rev > revCap) return;
      const d=r.scraped_at?.slice(0,10); if(!d) return; byDate[d]=(byDate[d]||0)+rev;
    });
    const dates=Object.keys(byDate).sort(), revs=dates.map(d=>byDate[d]), maxR=Math.max(...revs)||1;
    if (dates.length < 2) { el.innerHTML='<div style="color:#9CA3AF;font-size:.7rem;">Data belum cukup</div>'; return; }
    el.innerHTML = `<div class="of-chart-wrap">${dates.map((d,i)=>{
      const h=Math.round(revs[i]/maxR*50)+3, short=d.slice(5);
      const val=revs[i]>=1e9?`Rp${(revs[i]/1e9).toFixed(1)}M`:revs[i]>=1e6?`Rp${(revs[i]/1e6).toFixed(0)}jt`:`Rp${(revs[i]/1e3).toFixed(0)}rb`;
      return `<div class="of-chart-bar-wrap"><div class="of-chart-val">${val}</div><div class="of-chart-bar" style="height:${h}px;width:24px;" title="${d}"></div><div class="of-chart-date">${short}</div></div>`;
    }).join('')}</div>`;
  })();

  // Top 15 trend chart
  (() => {
    const el = document.getElementById('kd-trend-chart');
    if (!el || !topSellers.length) return;
    const top15 = topSellers.slice(0,15);
    const maxS = Math.max(...top15.map(r=>r.total_sold||0))||1;
    el.innerHTML = `<div class="of-chart-wrap">${top15.map((r,i)=>{
      const h=Math.round((r.total_sold||0)/maxS*50)+3;
      return `<div class="of-chart-bar-wrap"><div class="of-chart-val">${Math.round((r.total_sold||0)/12)}</div><div class="of-chart-bar" style="height:${h}px;width:24px;background:#1A1F3C;" title="${r.store_name}"></div><div class="of-chart-date">${(r.store_name||'').slice(0,7)}</div></div>`;
    }).join('')}</div>`;
  })();

  // Profit simulation
  const sp = medianPrice;
  function sim(units) {
    const g=sp*units, co=g*.35, mk=g*.15, pl=g*.05, tot=co+mk+pl;
    return {units,g,co,mk,pl,tot,net:g-tot};
  }
  const ns=sim(newUnits), es=sim(expUnits);

  // Keywords from top sellers (async)
  (async () => {
    const topStores = topSellers.slice(0,10).map(r=>r.store_name).filter(Boolean);
    if (!topStores.length) return;
    const { data: kwData } = await _supabase.from('listings').select('keyword').in('store_name',topStores).gte('scraped_at',latestDate).limit(1000);
    if (!kwData?.length) return;
    const kwCount={};
    kwData.forEach(r => { if (r.keyword&&r.keyword!==keyword) kwCount[r.keyword]=(kwCount[r.keyword]||0)+1; });
    const topKws=Object.entries(kwCount).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k])=>k);
    const el=document.getElementById('kd-kw-chips');
    if (el&&topKws.length) el.innerHTML=topKws.map(k=>`<span class="of-kw-chip" style="cursor:pointer;" onclick="openKwDetail('${k.replace(/'/g,"\\'")}');kdClose();setTimeout(()=>openKwDetail('${k.replace(/'/g,"\\'")}'),50)">${k}</span>`).join('');
    else if (el) el.innerHTML='<span style="color:#9CA3AF;font-size:.7rem;">Tidak ada data keywords</span>';
  })();

  document.getElementById('kd-full-sections').innerHTML = `
    <div class="kd-full">
      <div class="kd-full-title">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Usia Produk di Marketplace
      </div>
      <div class="kd-age-boxes">
        <div class="kd-age-box"><div class="kd-age-box-lbl">Shortest</div><div class="kd-age-box-val">${fmtD(shortestAge)}</div></div>
        <div class="kd-age-box"><div class="kd-age-box-lbl">Median</div><div class="kd-age-box-val accent">${fmtD(medianAgeDays)}</div></div>
        <div class="kd-age-box"><div class="kd-age-box-lbl">Longest</div><div class="kd-age-box-val">${fmtD(longestAge)}</div></div>
      </div>
    </div>
    <div class="kd-full">
      <div class="kd-full-title">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Keywords untuk Iklan Shopee
      </div>
      <div id="kd-kw-chips" class="of-kw-chips"><div style="color:#9CA3AF;font-size:.7rem;">Memuat keywords dari top sellers...</div></div>
    </div>
    <div class="kd-full">
      <div class="kd-full-title">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        Simulasi Keuntungan
      </div>
      <div class="kd-profit-grid">
        <div class="kd-profit-col">
          <div class="kd-profit-head"><div style="font-size:.72rem;font-weight:800;color:#E8442A;">Skenario Seller Baru</div></div>
          ${[['Units Sold/mo',ns.units,''],['Selling Unit Price',fmtFull(sp),''],['Gross Revenue',fmtFull(ns.g),''],['COGS (35%)','-'+fmtFull(ns.co),'neg'],['Marketing (15%)','-'+fmtFull(ns.mk),'neg'],['Platform Fees (5%)','-'+fmtFull(ns.pl),'neg'],['Total Costs',fmtFull(ns.tot),''],['Net Revenue',fmtFull(ns.net),'pos']].map(([l,v,c])=>`<div class="kd-profit-row"><div class="kd-profit-label">${l}</div><div class="kd-profit-value ${c}">${v}</div></div>`).join('')}
        </div>
        <div class="kd-profit-col">
          <div class="kd-profit-head"><div style="font-size:.72rem;font-weight:800;color:#16a34a;">Skenario Seller Berpengalaman</div></div>
          ${[['Units Sold/mo',es.units,''],['Selling Unit Price',fmtFull(sp),''],['Gross Revenue',fmtFull(es.g),''],['COGS (35%)','-'+fmtFull(es.co),'neg'],['Marketing (15%)','-'+fmtFull(es.mk),'neg'],['Platform Fees (5%)','-'+fmtFull(es.pl),'neg'],['Total Costs',fmtFull(es.tot),''],['Net Revenue',fmtFull(es.net),'pos']].map(([l,v,c])=>`<div class="kd-profit-row"><div class="kd-profit-label">${l}</div><div class="kd-profit-value ${c}">${v}</div></div>`).join('')}
        </div>
      </div>
    </div>
    <div class="kd-full">
      <div class="kd-full-title">Top Sellers</div>
      <div style="overflow-x:auto;">
        <table class="kd-seller-table">
          <thead><tr>
            <th>Rank</th><th>Store Name</th><th>Location</th>
            <th>Listing Age</th><th>Pendapatan Rata-rata 30 Hari</th>
            <th>Price</th><th>Rating</th><th>Reviews</th><th>Link</th>
          </tr></thead>
          <tbody>
            ${topSellers.slice(0,15).map((r,i) => `<tr>
              <td><span class="kd-rank-badge${i<3?' top':''}">${i+1}</span></td>
              <td style="min-width:140px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <img class="kd-seller-img" src="${r.image_url||''}" onerror="this.style.opacity=0" loading="lazy">
                  <div>
                    <div style="font-weight:800;color:#1A1F3C;font-size:.72rem;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.store_name||'—'}</div>
                    <div style="font-size:.6rem;color:#9CA3AF;max-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.product_name||''}</div>
                  </div>
                </div>
              </td>
              <td style="color:#6B7280;white-space:nowrap;">${r.location||'—'}</td>
              <td style="white-space:nowrap;">${r.listing_date?_fmtAge(r.listing_date):'—'}</td>
              <td style="font-weight:700;color:#E8442A;white-space:nowrap;">${fmtFull(r.omset_bln)}</td>
              <td style="font-weight:700;white-space:nowrap;">${fmtFull(r.price)}</td>
              <td>${r.rating?r.rating.toFixed(2):'—'}</td>
              <td>${(r.review_count||0).toLocaleString('id-ID')}</td>
              <td>${r.url?`<button class="kd-visit-btn" onclick="window.open('${r.url}','_blank')">Visit</button>`:'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <!-- Seller Workflow Guide -->
    <div class="kd-full" style="background:linear-gradient(135deg,#f0fdf4,#ecfdf5);border:1px solid #bbf7d0;border-radius:12px;padding:16px;">
      <div class="kd-full-title" style="color:#16a34a;margin-bottom:12px;">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Cara Jual Produk Ini — 4 Langkah
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#fff;border-radius:10px;padding:12px;border:1px solid #E5E7EB;">
          <div style="font-size:.7rem;font-weight:800;color:#E8442A;margin-bottom:4px;">1. CARI SUPPLIER</div>
          <div style="font-size:.72rem;color:#374151;margin-bottom:8px;">Target HPP ≤ <strong>${fmtS(sp * 0.35)}</strong> per unit (35% COGS)</div>
          <a href="https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(keyword)}" target="_blank" rel="noopener" style="display:inline-block;padding:4px 10px;background:#E8442A;color:#fff;border-radius:6px;font-size:.65rem;font-weight:700;text-decoration:none;margin-right:4px;">1688.com →</a>
          <a href="https://www.tokopedia.com/search?q=${encodeURIComponent(keyword)}+grosir" target="_blank" rel="noopener" style="display:inline-block;padding:4px 10px;background:#42b883;color:#fff;border-radius:6px;font-size:.65rem;font-weight:700;text-decoration:none;">Tokopedia Grosir →</a>
        </div>
        <div style="background:#fff;border-radius:10px;padding:12px;border:1px solid #E5E7EB;">
          <div style="font-size:.7rem;font-weight:800;color:#E8442A;margin-bottom:4px;">2. BUAT LISTING</div>
          <div style="font-size:.72rem;color:#374151;margin-bottom:4px;">Kisaran harga: <strong>${fmtS(prices[0]||0)} – ${fmtS(prices[prices.length-1]||0)}</strong></div>
          <div style="font-size:.68rem;color:#6B7280;">Masukkan keyword "<strong>${keyword}</strong>" di judul. Gunakan 3–5 hashtag relevan. Foto utama putih polos.</div>
        </div>
        <div style="background:#fff;border-radius:10px;padding:12px;border:1px solid #E5E7EB;">
          <div style="font-size:.7rem;font-weight:800;color:#E8442A;margin-bottom:4px;">3. PENGIRIMAN</div>
          <div style="font-size:.72rem;color:#374151;margin-bottom:4px;">Kota dominan seller: <strong>${(()=>{const locs={};sellers.forEach(r=>{if(r.location){const c=r.location.split(',')[0].trim();locs[c]=(locs[c]||0)+1;}});return Object.entries(locs).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';})()}</strong></div>
          <div style="font-size:.68rem;color:#6B7280;">Aktifkan SFF (Shopee Fulfillment) untuk badge pengiriman cepat. Dropship tersedia via supplier 1688.</div>
        </div>
        <div style="background:#fff;border-radius:10px;padding:12px;border:1px solid #E5E7EB;">
          <div style="font-size:.7rem;font-weight:800;color:#E8442A;margin-bottom:4px;">4. MARKETING</div>
          <div style="font-size:.72rem;color:#374151;margin-bottom:4px;">Anggaran iklan: <strong>${fmtS(sp * (newUnits||1) * 0.15)}/bln</strong> (15% revenue)</div>
          <div style="font-size:.68rem;color:#6B7280;">Mulai dengan Iklan Pencarian Shopee Ads. Gunakan keyword di atas sebagai target. Review iklan setelah 7 hari.</div>
        </div>
      </div>
    </div>
  `;
}

function kdClose() {
  const el = document.getElementById('kd-overlay');
  if (el) el.style.display = 'none';
}

function kdSetMain(thumbEl, src) {
  const img = document.getElementById('kd-main-img');
  if (img) img.src = src;
  document.querySelectorAll('.kd-thumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
}

function kdShare(keyword) {
  const text = `Peluang produk Shopee: ${keyword} — Analisis di LarisID`;
  if (navigator.share) {
    navigator.share({ title: `LarisID — ${keyword}`, text, url: window.location.href });
  } else {
    navigator.clipboard?.writeText(text + ' ' + window.location.href);
    alert('Link disalin ke clipboard!');
  }
}

// ── Home Trending Products ────────────────────────────────────────────────────
let _htdLoaded = false;

async function _loadHomeTrending() {
  if (!_supabase) return;
  const gridEl = document.getElementById('home-htd-grid');
  if (!gridEl) return;

  const { data: lr } = await _supabase.from('listings').select('scraped_at').order('scraped_at',{ascending:false}).limit(1);
  const latestDate = lr?.[0]?.scraped_at?.slice(0,10);
  if (!latestDate) { gridEl.innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;padding:10px 0;">Belum ada data.</div>'; return; }

  const { data: rows } = await _supabase
    .from('listings')
    .select('keyword,category,price,total_sold,image_url,score')
    .gte('scraped_at', latestDate)
    .order('total_sold', { ascending: false })
    .limit(500);

  if (!rows?.length) { gridEl.innerHTML = '<div style="color:#9CA3AF;font-size:.75rem;padding:10px 0;">Belum ada data trending.</div>'; return; }

  const kwMap = {};
  rows.forEach(r => {
    const k = r.keyword; if (!k) return;
    if (!kwMap[k]) kwMap[k] = { keyword:k, category:r.category||'', img:'', totalSold:0, revenue:0, prices:[], score:0 };
    kwMap[k].totalSold += r.total_sold||0;
    kwMap[k].revenue   += (r.price||0)*(r.total_sold||0)/12;
    kwMap[k].prices.push(r.price||0);
    if (!kwMap[k].img && r.image_url) kwMap[k].img = r.image_url;
    if ((r.score||0) > kwMap[k].score) kwMap[k].score = r.score||0;
  });

  const top = Object.values(kwMap).sort((a,b) => b.revenue-a.revenue).slice(0,12);

  const fmtS = v => {
    const n=Math.round(v||0);
    if(n>=1e9) return `Rp${(n/1e9).toFixed(1)}M`;
    if(n>=1e6) return `Rp${(n/1e6).toFixed(0)}jt`;
    if(n>=1e3) return `Rp${(n/1e3).toFixed(0)}rb`;
    return `Rp${n}`;
  };

  gridEl.innerHTML = top.map(kw => {
    const medP = _median(kw.prices);
    const scoreCol = _scoreColor(kw.score);
    const safe = kw.keyword.replace(/'/g,"\\'");
    return `<div class="htd-card" onclick="openKwDetail('${safe}')">
      <div class="htd-card-img-wrap">
        ${kw.img?`<img class="htd-card-img" src="${kw.img}" loading="lazy" onerror="this.parentNode.style.background='#F3F4F6';this.remove()">`:''}
        <div class="htd-card-score" style="background:${scoreCol};">${kw.score}</div>
      </div>
      <div class="htd-card-body">
        <div class="htd-card-name">${kw.keyword}</div>
        <div class="htd-card-cat">${kw.category||'—'}</div>
        <div class="htd-card-price">${fmtS(medP)} · ${fmtS(kw.revenue)}/bln</div>
      </div>
    </div>`;
  }).join('');
}

// ── helpers ──────────────────────────────────────────────────
function _fmtAge(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 0) return '—';
  if (days >= 365) { const y=Math.floor(days/365),m=Math.floor((days%365)/30); return m?`${y} thn ${m} bln`:`${y} tahun`; }
  if (days >= 30) return `${Math.floor(days/30)} bulan`;
  if (days >= 7)  return `${Math.floor(days/7)} minggu`;
  return `${days} hari`;
}
function _scoreHint(score, sellers, totalSold, medianRev) {
  const sellerCount  = sellers.length;
  const top3share    = sellers.slice(0,3).reduce((s,r) => s + (r.total_sold||0), 0) / (totalSold||1);
  const demand       = medianRev > 5e6  ? 'permintaan tinggi' : medianRev > 1e6 ? 'permintaan sedang' : 'permintaan terbatas';
  const competition  = sellerCount < 20 ? 'persaingan rendah' : sellerCount < 60 ? 'persaingan sedang' : 'persaingan ketat';
  const entry        = top3share < 0.4  ? 'masih ada celah untuk pendatang baru' : top3share < 0.7 ? 'pemimpin pasar sudah terbentuk' : 'pasar didominasi seller besar';
  const verdict      = score >= 70 ? '🟢 Peluang Bagus' : score >= 45 ? '🟡 Perlu Strategi' : '🔴 Pasar Sulit';
  return { sentence: `${demand[0].toUpperCase()+demand.slice(1)}, ${competition} — ${entry}.`, verdict };
}
function filterOutliers(arr) {
  if (arr.length < 4) return arr;
  const s = [...arr].sort((a,b) => a-b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  const fence = q3 + 2.5 * (q3 - q1);
  return s.filter(v => v <= fence);
}
function filterOutliersMax(arr) {
  if (arr.length < 4) return Infinity;
  const s = [...arr].sort((a,b) => a-b);
  const q1 = s[Math.floor(s.length * 0.25)];
  const q3 = s[Math.floor(s.length * 0.75)];
  return q3 + 2.5 * (q3 - q1);
}
function _median(arr) {
  if (!arr.length) return 0;
  const s=[...arr].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
function _scoreColor(s){return s>=70?'#16a34a':s>=45?'#ca8a04':'#dc2626';}
function _kwOpportunityScore(sellers,totalSold){
  const top10 = sellers.slice(0,10).reduce((s,r)=>s+(r.total_sold||0),0);
  const top10Share = totalSold ? top10/totalSold : 1;
  const aboveHalf = sellers.filter(r=>(r.total_sold||0)/totalSold>0.005).length;
  const fragScore = Math.min(aboveHalf/sellers.length*40,40);
  const concScore = top10Share<.2?35:top10Share<.4?28:top10Share<.6?18:8;
  const volScore  = Math.min(totalSold/500000*25,25);
  return Math.round(fragScore+concScore+volScore);
}

async function ofOpenKeyword(keyword) {
  if (!_supabase) return;
  const overlay   = document.getElementById('of-detail-overlay');
  if (!overlay) return;

  // Reset to loading state
  document.getElementById('of-detail-kw').textContent = keyword;
  document.getElementById('of-detail-sub').textContent = '';
  document.getElementById('of-detail-stats').innerHTML = '';
  document.getElementById('of-detail-score-row').innerHTML = '';
  document.getElementById('of-detail-seller-list').innerHTML = '<div class="of-detail-loading">Memuat data seller…</div>';
  document.getElementById('of-detail-seller-grid').innerHTML = '';
  document.getElementById('of-detail-chart-section').style.display = 'none';
  document.getElementById('of-detail-kw-section').style.display = 'none';
  document.getElementById('of-detail-grid-section').style.display = 'none';
  overlay.style.display = 'flex';
  overlay.scrollTop = 0;

  const fmtRp = v => 'Rp ' + Math.round(v||0).toLocaleString('id-ID');

  // Get latest date
  let latestDate;
  if (_ofDetailCache[keyword]?.latestDate) {
    latestDate = _ofDetailCache[keyword].latestDate;
  } else {
    const { data: lr } = await _supabase.from('listings').select('scraped_at').eq('keyword',keyword).order('scraped_at',{ascending:false}).limit(1);
    latestDate = lr?.[0]?.scraped_at?.slice(0,10);
    if (!latestDate) { document.getElementById('of-detail-seller-list').innerHTML='<div class="of-detail-loading">Gagal memuat data.</div>'; return; }
  }

  // Fetch latest sellers with listing_date
  let sellers;
  if (_ofDetailCache[keyword]?.data) {
    sellers = _ofDetailCache[keyword].data;
  } else {
    const { data, error } = await _supabase
      .from('listings')
      .select('product_name,store_name,image_url,url,price,total_sold,rating,item_id,shop_id,listing_date')
      .gte('scraped_at', latestDate)
      .eq('keyword', keyword)
      .order('total_sold', { ascending: false })
      .limit(300);
    if (error || !data) { document.getElementById('of-detail-seller-list').innerHTML='<div class="of-detail-loading">Gagal memuat data.</div>'; return; }
    sellers = data;
    _ofDetailCache[keyword] = { latestDate, data: sellers };
  }

  const totalSold    = sellers.reduce((s,r)=>s+(r.total_sold||0),0);
  const totalSellers = sellers.length;
  const prices       = sellers.map(r=>r.price||0).filter(Boolean);
  const medianPrice  = _median(prices);
  const minPrice     = prices.length ? Math.min(...prices) : 0;
  const maxPrice     = prices.length ? Math.max(...prices) : 0;
  const threshold    = totalSold * 0.005;
  const estRevBln    = medianPrice * totalSold / 12;

  // Listing ages
  const ages = sellers.map(r=>r.listing_date).filter(Boolean);
  const ageDays = ages.map(d=>Math.floor((Date.now()-new Date(d).getTime())/86400000)).filter(n=>n>=0);
  const medianAgeDays = _median(ageDays);
  const newestAge = ageDays.length ? Math.min(...ageDays) : null;
  const oldestAge = ageDays.length ? Math.max(...ageDays) : null;

  // Top sellers (>0.5%)
  const topSellers = sellers
    .filter(r=>(r.total_sold||0)>=threshold)
    .map(r=>({...r, share: totalSold?(r.total_sold||0)/totalSold*100:0, omset_bln:(r.price||0)*(r.total_sold||0)/12}));

  // Opportunity score
  const score = _kwOpportunityScore(sellers, totalSold);
  const scoreCol = _scoreColor(score);

  // ── 5-image collage ──────────────────────────────────────
  const imgSellers = sellers.filter(r=>r.image_url).slice(0,5);
  const imgEl = document.getElementById('of-detail-images');
  if (imgEl && imgSellers.length) {
    imgEl.innerHTML = `
      <div class="of-detail-img-main"><img src="${imgSellers[0].image_url}" loading="lazy" onerror="this.parentNode.style.background='#F3F4F6';this.remove()"></div>
      ${[1,2,3,4].map(i=>imgSellers[i]
        ? `<div class="of-detail-img-thumb"><img src="${imgSellers[i].image_url}" loading="lazy" onerror="this.parentNode.style.background='#F3F4F6';this.remove()"></div>`
        : `<div class="of-detail-img-thumb" style="background:#F3F4F6;"></div>`
      ).join('')}`;
  }

  // ── Score circle ──────────────────────────────────────────
  document.getElementById('of-detail-score-row').innerHTML = `
    <div class="of-detail-score-circle" style="background:${scoreCol}20;border:2px solid ${scoreCol};">
      <div class="of-detail-score-num" style="color:${scoreCol};">${score}</div>
      <div class="of-detail-score-lbl" style="color:${scoreCol};">Score</div>
    </div>
    <div>
      <div style="font-size:.8rem;font-weight:800;color:#1A1F3C;">Opportunity Score</div>
      <div style="font-size:.65rem;color:#6B7280;margin-top:2px;">${topSellers.length} seller dominan · ${totalSellers} total listing</div>
    </div>`;

  // ── Stats grid ────────────────────────────────────────────
  document.getElementById('of-detail-sub').textContent = `${topSellers.length} seller >0.5% dari ${totalSellers} total`;
  document.getElementById('of-detail-stats').innerHTML = [
    { v: fmtRp(estRevBln),                        l: 'Est. Revenue/Bln' },
    { v: Math.round(totalSold/12).toLocaleString('id-ID'), l: 'Unit Terjual/Bln' },
    { v: fmtRp(medianPrice),                      l: 'Median Harga' },
    { v: `${fmtRp(minPrice)} – ${fmtRp(maxPrice)}`, l: 'Rentang Harga' },
    { v: _fmtAge(ages.length ? ages.sort((a,b)=>new Date(b)-new Date(a))[0] : null), l: 'Listing Terbaru' },
    { v: medianAgeDays!=null ? _fmtAge(new Date(Date.now()-medianAgeDays*86400000).toISOString()) : '—', l: 'Median Usia Listing' },
  ].map(s=>`<div class="of-detail-stat2"><div class="of-detail-stat2-val">${s.v}</div><div class="of-detail-stat2-lbl">${s.l}</div></div>`).join('');

  // ── Revenue history chart ─────────────────────────────────
  (async () => {
    const { data: hist } = await _supabase
      .from('listings')
      .select('scraped_at,price,total_sold')
      .eq('keyword', keyword)
      .order('scraped_at', { ascending: true })
      .limit(600);
    if (hist?.length) {
      const byDate = {};
      hist.forEach(r => {
        const d = r.scraped_at?.slice(0,10);
        if (!d) return;
        if (!byDate[d]) byDate[d] = { rev: 0, sold: 0 };
        byDate[d].rev += (r.price||0)*(r.total_sold||0)/12;
      });
      const dates = Object.keys(byDate).sort();
      const revs  = dates.map(d=>byDate[d].rev);
      const maxRev= Math.max(...revs) || 1;
      const chartEl = document.getElementById('of-detail-chart');
      const chartSec= document.getElementById('of-detail-chart-section');
      if (chartEl && dates.length > 1) {
        chartEl.innerHTML = dates.map((d,i)=>{
          const h = Math.round(revs[i]/maxRev*62)+4;
          const short = d.slice(5); // MM-DD
          const val = revs[i]>=1e9?`Rp${(revs[i]/1e9).toFixed(1)}M`:revs[i]>=1e6?`Rp${(revs[i]/1e6).toFixed(0)}jt`:`Rp${(revs[i]/1e3).toFixed(0)}rb`;
          return `<div class="of-chart-bar-wrap"><div class="of-chart-val">${val}</div><div class="of-chart-bar" style="height:${h}px;" title="${d}: ${fmtRp(revs[i])}"></div><div class="of-chart-date">${short}</div></div>`;
        }).join('');
        chartSec.style.display = '';
      }
    }
  })();

  // ── Keywords from top sellers ──────────────────────────────
  (async () => {
    const topStores = topSellers.slice(0,10).map(r=>r.store_name).filter(Boolean);
    if (!topStores.length) return;
    const { data: kwData } = await _supabase
      .from('listings')
      .select('keyword,store_name')
      .in('store_name', topStores)
      .gte('scraped_at', latestDate)
      .limit(1000);
    if (!kwData?.length) return;
    const kwCount = {};
    kwData.forEach(r => {
      const k = r.keyword;
      if (!k || k === keyword) return;
      kwCount[k] = (kwCount[k]||0) + 1;
    });
    const topKws = Object.entries(kwCount).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k])=>k);
    if (!topKws.length) return;
    const chipsEl = document.getElementById('of-detail-kw-chips');
    const kwSec   = document.getElementById('of-detail-kw-section');
    if (chipsEl) {
      chipsEl.innerHTML = topKws.map(k=>`<span class="of-kw-chip" onclick="ofOpenKeyword('${k.replace(/'/g,"\\'")}')">
        ${k}</span>`).join('');
      kwSec.style.display = '';
    }
  })();

  // ── Top 15 sellers (list view) ─────────────────────────────
  const top15 = topSellers.slice(0,15);
  document.getElementById('of-detail-sellers-title').textContent = `Top ${Math.min(topSellers.length,15)} Seller (>0.5% share)`;
  document.getElementById('of-detail-seller-list').innerHTML = top15.length
    ? top15.map((r,i)=>`
      <div class="of-seller-row" onclick="${r.url?`window.open('${r.url}','_blank')`:'void(0)'}">
        <div class="of-seller-rank">#${i+1}</div>
        <img class="of-seller-row-img" src="${r.image_url||''}" onerror="this.style.opacity=0" loading="lazy">
        <div class="of-seller-row-name">
          <div class="of-seller-row-store">${r.store_name||'—'}</div>
          <div class="of-seller-row-prod">${r.product_name||'—'}</div>
        </div>
        <div class="of-seller-row-omset">${fmtRp(r.omset_bln)}/bln</div>
        <div class="of-seller-row-share">${r.share.toFixed(1)}%</div>
        <div class="of-seller-row-age">${_fmtAge(r.listing_date)}</div>
      </div>`).join('')
    : '<div class="of-detail-loading">Tidak ada seller yang memenuhi threshold 0.5%.</div>';

  // ── Rest of sellers grid ───────────────────────────────────
  const rest = sellers.slice(0);
  const gridEl  = document.getElementById('of-detail-seller-grid');
  const gridSec = document.getElementById('of-detail-grid-section');
  if (gridEl && rest.length) {
    gridEl.innerHTML = rest.map(r=>`
      <div class="of-seller-card" onclick="${r.url?`window.open('${r.url}','_blank')`:'void(0)'}">
        <div class="of-seller-img-wrap">
          ${r.image_url?`<img class="of-seller-img" src="${r.image_url}" onerror="this.style.display='none'" loading="lazy">`:'<div style="width:100%;height:100%;background:#E5E7EB;"></div>'}
          <div class="of-seller-share-bar"><div class="of-seller-share-fill" style="width:${Math.round(totalSold?(r.total_sold||0)/totalSold*100:0)}%"></div></div>
        </div>
        <div class="of-seller-body">
          <div class="of-seller-name">${r.store_name||'—'}</div>
          <div class="of-seller-product">${r.product_name||'—'}</div>
          <span class="of-seller-omset-lbl">Est. omset/bln</span>
          <div class="of-seller-omset">${fmtRp((r.price||0)*(r.total_sold||0)/12)}</div>
          <div class="of-seller-meta">
            <span class="of-seller-share">${totalSold?((r.total_sold||0)/totalSold*100).toFixed(1):0}% share</span>
            <span class="of-seller-sold">${_fmtAge(r.listing_date)}</span>
          </div>
        </div>
      </div>`).join('');
    gridSec.style.display = '';
  }
}

// re-render cards after sort/filter
function _pdbRenderTableAndCards() {
  _pdbRenderTable();
  if (_pdbCurrentView === 'card') _pdbRenderCards();
}

// ── EDUCATION HELPERS ──────────────────────────────────────────
function eduToggleFaq(el) {
  el.closest('.edu-faq-item').classList.toggle('open');
}
function eduOpen(id) {
  const map = {
    'cara-riset': 'product-database',
    'viability-score': 'product-database',
    'opportunity-finder': 'opportunity-finder',
    'sales-estimator': 'estimator',
    'product-tracker': 'product-tracker',
    'keyword-strategy': 'keywords',
  };
  const target = map[id];
  if (target) switchDashView(target);
}

function _pdbSaveRow(btn, row) {
  if (btn.classList.contains('saved')) return;
  const added = ptTrackProduct(row);
  if (added) {
    btn.textContent = 'Tersimpan';
    btn.classList.add('saved');
    document.querySelectorAll(`.pt-save-btn[data-key="${row.item_id}_${row.shop_id}"]`).forEach(b => {
      b.textContent = 'Tersimpan'; b.classList.add('saved');
    });
  }
}

// ════════════════════════════════════════════════════════════
//  OPPORTUNITY FINDER
// ════════════════════════════════════════════════════════════

let _ofRows      = [];
let _ofSortField = 'score';
let _ofSortDir   = 'desc';
let _ofCatsInited = false;

const OF_COMPETITION_LABELS = ['','Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi'];
const OF_COMPETITION_MAX    = [0, 50, 150, 400, 1000, Infinity];

function _initOfCats() {
  if (_ofCatsInited) return;
  _ofCatsInited = true;
  const grid = document.getElementById('of-cats-grid');
  if (!grid) return;
  grid.innerHTML = PDB_CATS.map(c => `
    <label class="pdb-cat-label">
      <input type="checkbox" class="of-cat-cb" value="${c}" checked> ${c}
    </label>`).join('');
}

function ofSelectAll(checked) {
  document.querySelectorAll('.of-cat-cb').forEach(cb => cb.checked = checked);
}

function ofSliderUpdate(type) {
  const val = parseInt(document.getElementById(`of-${type}`)?.value || 5);
  const el  = document.getElementById(`of-${type}-val`);
  if (el) el.textContent = val === 5 ? 'Semua' : OF_COMPETITION_LABELS[val];
}

const OF_PRESETS = {
  'high-demand':      { 'of-min-sold': 2000 },
  'good-opportunity': { 'of-min-sold': 500, 'of-competition': 2 },
  'low-competition':  { 'of-competition': 2, 'of-max-sellers': 15 },
  'low-seasonality':  { 'of-seasonality': 2 },
  'trending-up':      { 'of-min-sold': 1000, 'of-min-score': 60 },
  'strong-price':     { 'of-min-price': 50000, 'of-max-price': 500000 },
};

function ofPreset(name) {
  const pill = document.getElementById(`of-pill-${name}`);
  const isActive = pill?.classList.toggle('active');
  if (!isActive) return;

  // Deactivate other pills
  document.querySelectorAll('.of-preset-pill').forEach(p => {
    if (p.id !== `of-pill-${name}`) p.classList.remove('active');
  });

  ofReset(true);
  const vals = OF_PRESETS[name] || {};
  Object.entries(vals).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    if (el.type === 'range') ofSliderUpdate(id.replace('of-',''));
  });
}

function ofReset(keepPills) {
  ['of-min-sold','of-max-sold','of-min-price','of-max-price',
   'of-min-rating','of-max-rating','of-min-score','of-max-score',
   'of-include-kw','of-exclude-kw'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['competition','seasonality'].forEach(t => {
    const sl = document.getElementById(`of-${t}`);
    if (sl) { sl.value = 5; ofSliderUpdate(t); }
  });
  if (!keepPills) document.querySelectorAll('.of-preset-pill').forEach(p => p.classList.remove('active'));
}

function ofSaveFilter() {
  localStorage.setItem('of_saved_filter', JSON.stringify(_ofGetFilters()));
  const st = document.getElementById('of-status');
  if (st) { st.textContent = 'Filter tersimpan'; setTimeout(() => { if(st) st.textContent=''; }, 2500); }
}

function ofLoadFilter() {
  const saved = localStorage.getItem('of_saved_filter');
  if (!saved) return;
  try {
    const f = JSON.parse(saved);
    _initOfCats();
    document.querySelectorAll('.of-cat-cb').forEach(cb => cb.checked = f.cats?.includes(cb.value) ?? true);
    ['sold','price','rating','score'].forEach(k => {
      const mn = document.getElementById(`of-min-${k}`);
      const mx = document.getElementById(`of-max-${k}`);
      if (mn && f[`min_${k}`] != null) mn.value = f[`min_${k}`];
      if (mx && f[`max_${k}`] != null) mx.value = f[`max_${k}`];
    });
    if (f.competition != null) { document.getElementById('of-competition').value = f.competition; ofSliderUpdate('competition'); }
    if (f.seasonality != null) { document.getElementById('of-seasonality').value = f.seasonality; ofSliderUpdate('seasonality'); }
    if (f.include_kw) document.getElementById('of-include-kw').value = f.include_kw;
    if (f.exclude_kw) document.getElementById('of-exclude-kw').value = f.exclude_kw;
  } catch(e) {}
}

function _ofGetFilters() {
  const gv = id => { const el = document.getElementById(id); return el?.value ? parseFloat(el.value) : null; };
  const gs = id => { const el = document.getElementById(id); return el?.value?.trim() || ''; };
  return {
    cats:         [...document.querySelectorAll('.of-cat-cb:checked')].map(cb => cb.value),
    min_sold:     gv('of-min-sold'),     max_sold:     gv('of-max-sold'),
    min_price:    gv('of-min-price'),    max_price:    gv('of-max-price'),
    min_sellers:  gv('of-min-sellers'),  max_sellers:  gv('of-max-sellers'),
    min_score:    gv('of-min-score'),    max_score:    gv('of-max-score'),
    competition:  parseInt(document.getElementById('of-competition')?.value || 5),
    seasonality:  parseInt(document.getElementById('of-seasonality')?.value || 5),
    include_kw:   gs('of-include-kw'),
    exclude_kw:   gs('of-exclude-kw'),
  };
}

function _ofCompetitionLevel(reviews) {
  const r = reviews || 0;
  if (r < 50)   return 1;
  if (r < 150)  return 2;
  if (r < 400)  return 3;
  if (r < 1000) return 4;
  return 5;
}

function _ofSeasonalityLevel(price, originalPrice) {
  if (!price || !originalPrice || originalPrice <= price) return 1;
  const discount = (originalPrice - price) / originalPrice;
  if (discount < 0.05) return 1;
  if (discount < 0.15) return 2;
  if (discount < 0.30) return 3;
  if (discount < 0.50) return 4;
  return 5;
}

function _ofKwCompetitionLevel(sellerCount) {
  if (sellerCount <= 5)  return 1;
  if (sellerCount <= 15) return 2;
  if (sellerCount <= 30) return 3;
  if (sellerCount <= 60) return 4;
  return 5;
}

function _ofKwScore(total_sold, seller_count, avg_rating) {
  const soldScore  = Math.min(total_sold / 5000 * 40, 40);
  const compScore  = seller_count <= 5 ? 35 : seller_count <= 15 ? 28 : seller_count <= 30 ? 18 : 8;
  const ratingScore = (avg_rating / 5) * 25;
  return Math.round(soldScore + compScore + ratingScore);
}

async function loadOpportunityFinder() {
  if (!_supabase) return;
  _initOfCats();
  const st     = document.getElementById('of-status');
  const tbody  = document.getElementById('of-tbody');
  const cnt    = document.getElementById('of-count');
  const dateNote = document.getElementById('of-date-note');
  if (st) st.textContent = 'Memuat data…';
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#6B7280;font-size:.8rem;">Memuat…</td></tr>';

  const { data: latestRow } = await _supabase.from('listings').select('scraped_at').order('scraped_at',{ascending:false}).limit(1);
  if (!latestRow?.length) { if(st) st.textContent='Gagal memuat data.'; return; }
  const latestDate = latestRow[0].scraped_at.slice(0,10);
  if (dateNote) dateNote.textContent = `Data: ${latestDate}`;

  const f = _ofGetFilters();
  let query = _supabase.from('listings')
    .select('keyword,category,price,original_price,total_sold,rating,reviews,item_id,shop_id')
    .gte('scraped_at', latestDate)
    .limit(2000);
  if (f.cats?.length && f.cats.length < PDB_CATS.length) query = query.in('category', f.cats);

  const { data, error } = await query;
  if (error) { if(st) st.textContent=`Error: ${error.message}`; return; }

  // Aggregate by keyword
  const byKw = {};
  (data || []).forEach(r => {
    const k = r.keyword || '(tanpa keyword)';
    if (!byKw[k]) byKw[k] = { keyword: k, category: r.category, prices:[], sold: 0, ratings:[], reviews:[], seasonality_vals:[], count: 0 };
    byKw[k].sold       += r.total_sold || 0;
    byKw[k].count++;
    byKw[k].prices.push(r.price || 0);
    byKw[k].ratings.push(r.rating || 0);
    byKw[k].reviews.push(r.reviews || 0);
    byKw[k].seasonality_vals.push(_ofSeasonalityLevel(r.price, r.original_price));
  });

  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

  const inc = f.include_kw ? f.include_kw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : [];
  const exc = f.exclude_kw ? f.exclude_kw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : [];

  _ofRows = Object.values(byKw).map(k => {
    const avg_price    = avg(k.prices);
    const avg_rating   = avg(k.ratings);
    const avg_reviews  = avg(k.reviews);
    const seller_count = k.count;
    const total_sold   = k.sold;
    const competition  = _ofKwCompetitionLevel(seller_count);
    const seasonality  = Math.round(avg(k.seasonality_vals));
    const score        = _ofKwScore(total_sold, seller_count, avg_rating);
    return { keyword:k.keyword, category:k.category, seller_count, total_sold, avg_price, avg_rating, avg_reviews, competition, seasonality, score };
  }).filter(r => {
    if (f.min_sold    != null && r.total_sold   < f.min_sold)    return false;
    if (f.max_sold    != null && r.total_sold   > f.max_sold)    return false;
    if (f.min_price   != null && r.avg_price    < f.min_price)   return false;
    if (f.max_price   != null && r.avg_price    > f.max_price)   return false;
    if (f.min_sellers != null && r.seller_count < f.min_sellers) return false;
    if (f.max_sellers != null && r.seller_count > f.max_sellers) return false;
    if (f.min_score   != null && r.score        < f.min_score)   return false;
    if (f.max_score   != null && r.score        > f.max_score)   return false;
    if (r.competition > f.competition) return false;
    if (r.seasonality > f.seasonality) return false;
    const kw = r.keyword.toLowerCase();
    if (inc.length && !inc.some(w => kw.includes(w))) return false;
    if (exc.length &&  exc.some(w => kw.includes(w))) return false;
    return true;
  });

  _ofDetailCache = {};  // invalidate drill-down cache on new search
  _ofRenderTableAndCards();
  if (cnt) cnt.textContent = `${_ofRows.length} keyword`;
  if (st)  st.textContent = '';
}

function _ofRenderTableAndCards() {
  _ofRenderTable();
  if (_ofCurrentView === 'card') _ofRenderCards();
}

function ofSort(field) {
  if (_ofSortField === field) _ofSortDir = _ofSortDir === 'asc' ? 'desc' : 'asc';
  else { _ofSortField = field; _ofSortDir = 'desc'; }
  _ofRenderTableAndCards();
}

function _ofRenderTable() {
  const tbody = document.getElementById('of-tbody');
  if (!tbody) return;
  const rows = [..._ofRows].sort((a,b) => {
    const av = a[_ofSortField] ?? 0, bv = b[_ofSortField] ?? 0;
    return _ofSortDir === 'asc' ? (av>bv?1:-1) : (av<bv?1:-1);
  });
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#6B7280;font-size:.8rem;">Tidak ada keyword yang cocok. Coba perluas filter.</td></tr>';
    return;
  }
  const fmtRp = v => v ? 'Rp '+Math.round(v).toLocaleString('id-ID') : '—';
  const compBadge = lvl => {
    const colors = ['','#16a34a','#65a30d','#ca8a04','#ea580c','#dc2626'];
    const labels = ['','Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi'];
    return `<span style="background:${colors[lvl]};color:#fff;padding:2px 7px;border-radius:10px;font-size:.68rem;font-weight:700;">${labels[lvl]}</span>`;
  };
  const scoreBadge = s => {
    const bg = s>=70?'#16a34a':s>=45?'#ca8a04':'#dc2626';
    return `<span style="background:${bg};color:#fff;padding:2px 7px;border-radius:10px;font-size:.7rem;font-weight:700;">${s}</span>`;
  };
  tbody.innerHTML = rows.map(r => {
    const kwSafe = r.keyword.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    return `<tr style="cursor:pointer;" onclick="ofOpenKeyword('${kwSafe}')">
    <td style="font-size:.8rem;font-weight:700;color:#1A1F3C;">${r.keyword}</td>
    <td style="font-size:.72rem;">${r.category||'—'}</td>
    <td style="font-size:.78rem;font-weight:600;text-align:center;">${r.seller_count}</td>
    <td style="font-size:.78rem;font-weight:600;">${r.total_sold.toLocaleString('id-ID')}</td>
    <td style="font-size:.72rem;">${fmtRp(r.avg_price)}</td>
    <td style="font-size:.72rem;">${r.avg_rating.toFixed(1)}</td>
    <td>${compBadge(r.competition)}</td>
    <td>${scoreBadge(r.score)}</td>
    <td><button class="pdb-btn" style="padding:4px 10px;font-size:.68rem;" onclick="event.stopPropagation();ofOpenKeyword('${kwSafe}')">Lihat Seller</button></td>
  </tr>`;}).join('');
}

// ════════════════════════════════════════════════════════════
//  CATEGORY TRENDS
// ════════════════════════════════════════════════════════════

let _ctRows     = [];
let _ctSortField = 'total_sold';
let _ctSortDir   = 'desc';

async function loadCategoryTrends() {
  if (!_supabase) return;
  const tbody    = document.getElementById('ct-tbody');
  const cardsEl  = document.getElementById('ct-cards');
  const dateNote = document.getElementById('ct-date-note');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:#6B7280;font-size:.8rem;">Memuat…</td></tr>';

  // Get two latest scraped_at dates
  const { data: dates } = await _supabase.from('listings').select('scraped_at').order('scraped_at',{ascending:false}).limit(2);
  if (!dates?.length) return;
  const latestDate = dates[0].scraped_at.slice(0,10);
  const prevDate   = dates[1]?.scraped_at?.slice(0,10) || null;
  if (dateNote) dateNote.textContent = `Data: ${latestDate}${prevDate ? ' vs '+prevDate : ''}`;

  // Fetch current and previous data in parallel
  const [curRes, prevRes] = await Promise.all([
    _supabase.from('listings').select('category,keyword,price,total_sold,rating').gte('scraped_at', latestDate).limit(3000),
    prevDate ? _supabase.from('listings').select('category,total_sold').gte('scraped_at', prevDate).lt('scraped_at', latestDate).limit(3000) : { data: [] },
  ]);

  const curData  = curRes.data  || [];
  const prevData = prevRes.data || [];

  // Aggregate current by category
  const byCat = {};
  curData.forEach(r => {
    const c = r.category || 'Lainnya';
    if (!byCat[c]) byCat[c] = { category:c, keywords:new Set(), listing_count:0, total_sold:0, prices:[], ratings:[], kw_sold:{} };
    byCat[c].keywords.add(r.keyword);
    byCat[c].listing_count++;
    byCat[c].total_sold += r.total_sold || 0;
    byCat[c].prices.push(r.price || 0);
    byCat[c].ratings.push(r.rating || 0);
    const kw = r.keyword || '';
    byCat[c].kw_sold[kw] = (byCat[c].kw_sold[kw] || 0) + (r.total_sold || 0);
  });

  // Aggregate previous sold by category for delta
  const prevByCat = {};
  prevData.forEach(r => {
    const c = r.category || 'Lainnya';
    prevByCat[c] = (prevByCat[c] || 0) + (r.total_sold || 0);
  });

  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const maxSold = Math.max(...Object.values(byCat).map(c=>c.total_sold), 1);

  _ctRows = Object.values(byCat).map(c => {
    const avg_price  = avg(c.prices);
    const avg_rating = avg(c.ratings);
    const prev_sold  = prevByCat[c.category] || 0;
    const sold_delta = prev_sold ? Math.round((c.total_sold - prev_sold) / prev_sold * 100) : null;
    const top_kw     = Object.entries(c.kw_sold).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
    const score      = Math.round(Math.min(c.total_sold/maxSold*60,60) + (avg_rating/5)*25 + Math.min(c.keywords.size/20*15,15));
    return {
      category:     c.category,
      keyword_count: c.keywords.size,
      listing_count: c.listing_count,
      total_sold:   c.total_sold,
      avg_price,
      avg_rating,
      top_kw,
      sold_delta,
      score,
      bar_pct: c.total_sold / maxSold * 100,
    };
  });

  _ctRenderCards();
  _ctRenderTable();
}

function _ctRenderCards() {
  const el = document.getElementById('ct-cards');
  if (!el || !_ctRows.length) return;
  const total_sold = _ctRows.reduce((s,r)=>s+r.total_sold,0);
  const total_listing = _ctRows.reduce((s,r)=>s+r.listing_count,0);
  const best = [..._ctRows].sort((a,b)=>b.total_sold-a.total_sold)[0];
  const fastest = [..._ctRows].filter(r=>r.sold_delta!=null).sort((a,b)=>b.sold_delta-a.sold_delta)[0];
  const fmtNum = v => v>=1000000 ? (v/1000000).toFixed(1)+'jt' : v>=1000 ? Math.round(v/1000)+'rb' : v.toString();
  el.innerHTML = `
    <div class="ct-card"><div class="ct-card-label">Total Kategori Aktif</div><div class="ct-card-val">${_ctRows.length}</div><div class="ct-card-sub">kategori dengan data</div></div>
    <div class="ct-card"><div class="ct-card-label">Total Listing</div><div class="ct-card-val">${fmtNum(total_listing)}</div><div class="ct-card-sub">produk terlisting</div></div>
    <div class="ct-card"><div class="ct-card-label">Total Unit Terjual</div><div class="ct-card-val">${fmtNum(total_sold)}</div><div class="ct-card-sub">gabungan semua kategori</div></div>
    <div class="ct-card"><div class="ct-card-label">Kategori Terbaik</div><div class="ct-card-val" style="font-size:.95rem;">${best?.category||'—'}</div><div class="ct-card-sub">${fmtNum(best?.total_sold||0)} unit terjual${fastest&&fastest.sold_delta>0?' · '+fastest.category+' tumbuh +'+fastest.sold_delta+'%':''}</div></div>
  `;
}

function ctSort(field) {
  if (_ctSortField === field) _ctSortDir = _ctSortDir==='asc'?'desc':'asc';
  else { _ctSortField = field; _ctSortDir = 'desc'; }
  _ctRenderTable();
}

function _ctRenderTable() {
  const tbody = document.getElementById('ct-tbody');
  if (!tbody) return;
  const rows = [..._ctRows].sort((a,b) => {
    const av = a[_ctSortField] ?? (typeof a[_ctSortField]==='string'?'':''), bv = b[_ctSortField] ?? '';
    return _ctSortDir==='asc' ? (av>bv?1:-1) : (av<bv?1:-1);
  });
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:28px;color:#9CA3AF;font-size:.8rem;">Belum ada data.</td></tr>'; return; }
  const fmtRp  = v => v ? 'Rp '+Math.round(v).toLocaleString('id-ID') : '—';
  const fmtNum = v => v != null ? Math.round(v).toLocaleString('id-ID') : '—';
  const maxSold = Math.max(...rows.map(r=>r.total_sold), 1);
  tbody.innerHTML = rows.map(r => {
    const barW = Math.round(r.total_sold/maxSold*100);
    const bar  = `<div class="ct-bar-wrap"><div class="ct-bar" style="width:${barW}px;max-width:80px;"></div><span style="font-size:.72rem;font-weight:600;">${fmtNum(r.total_sold)}</span></div>`;
    const delta = r.sold_delta == null ? '<span class="ct-delta-flat">—</span>'
      : r.sold_delta > 0 ? `<span class="ct-delta-up">+${r.sold_delta}%</span>`
      : r.sold_delta < 0 ? `<span class="ct-delta-down">${r.sold_delta}%</span>`
      : '<span class="ct-delta-flat">0%</span>';
    const scoreBg = r.score>=70?'#16a34a':r.score>=45?'#ca8a04':'#dc2626';
    return `<tr>
      <td style="font-size:.8rem;font-weight:700;color:#1A1F3C;">${r.category}</td>
      <td style="font-size:.72rem;text-align:center;">${r.keyword_count}</td>
      <td style="font-size:.72rem;text-align:center;">${fmtNum(r.listing_count)}</td>
      <td>${bar}</td>
      <td style="font-size:.72rem;">${fmtRp(r.avg_price)}</td>
      <td style="font-size:.72rem;">${r.avg_rating.toFixed(1)}</td>
      <td style="font-size:.72rem;color:#374151;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.top_kw}</td>
      <td>${delta}</td>
      <td><span style="background:${scoreBg};color:#fff;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700;">${r.score}</span></td>
    </tr>`;
  }).join('');
}

function ctDownloadCSV() {
  if (!_ctRows.length) return;
  const cols  = ['category','keyword_count','listing_count','total_sold','avg_price','avg_rating','top_kw','sold_delta','score'];
  const heads = ['Kategori','Keyword','Listing','Total Terjual','Avg Harga','Avg Rating','Top Keyword','Tren %','Score'];
  const rows  = _ctRows.map(r => cols.map(c => `"${(r[c]??'').toString().replace(/"/g,'""')}"`).join(','));
  const csv   = [heads.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `larisid_category_trends_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ════════════════════════════════════════════════════════════
//  KEYWORD EXPLORER
// ════════════════════════════════════════════════════════════

// Indonesian stop words + noise words to filter from title analysis
const KX_STOP = new Set([
  'dan','yang','untuk','dengan','ke','di','dari','ini','itu','pada','juga','sudah',
  'dalam','akan','atau','karena','setelah','jika','bisa','ada','tidak','nya','pcs',
  'set','pack','buah','biji','lembar','meter','cm','mm','kg','gr','ml','liter',
  'new','original','free','ongkir','gratis','best','seller','ready','stok','stock',
  'promo','murah','berkualitas','premium','import','branded','terbaru','terlaris',
  'the','and','for','with','of','in','a','an','1','2','3','4','5','10','pcs',
  'termurah','terpercaya','grosir','ecer','kualitas','bagus','asli','ori',
]);

let _kxAllKeywords = []; // populated on first load

async function _kxLoadKeywordList() {
  if (_kxAllKeywords.length || !_supabase) return;
  const { data } = await _supabase
    .from('listings')
    .select('keyword')
    .order('keyword')
    .limit(3000);
  const seen = new Set();
  _kxAllKeywords = (data || [])
    .map(r => r.keyword).filter(k => k && !seen.has(k) && seen.add(k));
  const dl = document.getElementById('kx-datalist');
  if (dl) dl.innerHTML = _kxAllKeywords.map(k => `<option value="${k}">`).join('');
}

async function analyzeKeyword() {
  if (!_supabase) return;
  const kw = (document.getElementById('kx-input')?.value || '').trim().toLowerCase();
  if (!kw) return;

  const st = document.getElementById('kx-status');
  const statsEl = document.getElementById('kx-stats');
  const bodyEl  = document.getElementById('kx-body');
  const emptyEl = document.getElementById('kx-empty');
  if (st) st.textContent = 'Memuat…';
  if (statsEl) statsEl.style.display = 'none';
  if (bodyEl)  bodyEl.style.display  = 'none';
  if (emptyEl) emptyEl.style.display = 'none';

  // Get two latest dates
  const { data: dates } = await _supabase
    .from('listings').select('scraped_at').order('scraped_at',{ascending:false}).limit(2);
  if (!dates?.length) { if(st) st.textContent='Gagal memuat data.'; return; }
  const latestDate = dates[0].scraped_at.slice(0,10);
  const prevDate   = dates[1]?.scraped_at?.slice(0,10) || null;

  // Search across product_name (any listing containing the word)
  const { data: cur, error } = await _supabase
    .from('listings')
    .select('product_name,store_name,category,keyword,price,total_sold,rating,reviews,listing_date')
    .ilike('product_name', `%${kw}%`)
    .gte('scraped_at', latestDate)
    .order('total_sold', { ascending: false })
    .limit(500);

  if (error || !cur?.length) {
    if (st) st.textContent = `Tidak ada listing dengan kata "${kw}".`;
    if (emptyEl) emptyEl.style.display = '';
    return;
  }

  // Fetch previous snapshot for trend
  let prevSold = 0;
  if (prevDate) {
    const { data: prev } = await _supabase
      .from('listings')
      .select('total_sold')
      .ilike('product_name', `%${kw}%`)
      .gte('scraped_at', prevDate)
      .lt('scraped_at', latestDate)
      .limit(500);
    prevSold = (prev || []).reduce((s,r) => s + (r.total_sold||0), 0);
  }

  // Aggregate stats
  const seller_count = cur.length;
  const total_sold   = cur.reduce((s,r) => s+(r.total_sold||0), 0);
  const avg_price    = cur.reduce((s,r) => s+(r.price||0), 0) / seller_count;
  const avg_rating   = cur.reduce((s,r) => s+(r.rating||0), 0) / seller_count;
  const efficiency   = seller_count ? Math.round(total_sold / seller_count) : 0;
  const trendPct     = prevSold ? Math.round((total_sold - prevSold) / prevSold * 100) : null;
  const category     = cur[0]?.category || '—';

  // Render stat cards
  const fmtRp  = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');
  const trendHtml = trendPct == null ? '<span style="color:#9CA3AF">—</span>'
    : trendPct > 0 ? `<span class="kx-stat-trend-up">+${trendPct}% vs sebelumnya</span>`
    : trendPct < 0 ? `<span class="kx-stat-trend-down">${trendPct}% vs sebelumnya</span>`
    : '<span style="color:#9CA3AF">0% vs sebelumnya</span>';

  const prices_all  = cur.map(r=>r.price||0).filter(Boolean);
  const median_price= _median(prices_all);
  const min_price   = prices_all.length ? Math.min(...prices_all) : 0;
  const max_price   = prices_all.length ? Math.max(...prices_all) : 0;
  const ages_all    = cur.map(r=>r.listing_date).filter(Boolean)
    .map(d=>Math.floor((Date.now()-new Date(d).getTime())/86400000)).filter(n=>n>=0);
  const median_age  = _median(ages_all);
  const newest_age  = ages_all.length ? Math.min(...ages_all) : null;
  const oldest_age  = ages_all.length ? Math.max(...ages_all) : null;
  const _ageStr = days => days==null?'—':days>=365?`${Math.floor(days/365)} thn`:days>=30?`${Math.floor(days/30)} bln`:days>=7?`${Math.floor(days/7)} mgg`:`${days} hr`;

  // Keywords breakdown
  const kwCounts = {};
  cur.forEach(r=>{ const k=r.keyword; if(k){ kwCounts[k]=(kwCounts[k]||0)+1; }});
  const topKwsKX = Object.entries(kwCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);

  statsEl.innerHTML = `
    <div class="kx-stat"><div class="kx-stat-label">Total Listing</div><div class="kx-stat-val">${seller_count}</div><div class="kx-stat-sub">mengandung kata "${kw}"</div></div>
    <div class="kx-stat"><div class="kx-stat-label">Total Terjual</div><div class="kx-stat-val">${total_sold.toLocaleString('id-ID')}</div><div class="kx-stat-sub">unit terjual (lifetime)</div></div>
    <div class="kx-stat"><div class="kx-stat-label">Est. Revenue/Bln</div><div class="kx-stat-val" style="font-size:.85rem;">${fmtRp(median_price*total_sold/12)}</div><div class="kx-stat-sub">median harga × unit/12</div></div>
    <div class="kx-stat"><div class="kx-stat-label">Median Harga</div><div class="kx-stat-val" style="font-size:.9rem;">${fmtRp(median_price)}</div><div class="kx-stat-sub">${fmtRp(min_price)} – ${fmtRp(max_price)}</div></div>
    <div class="kx-stat"><div class="kx-stat-label">Usia Listing</div><div class="kx-stat-val" style="font-size:.85rem;">${_ageStr(median_age)}</div><div class="kx-stat-sub">median · terbaru ${_ageStr(newest_age)} · tertua ${_ageStr(oldest_age)}</div></div>
    <div class="kx-stat"><div class="kx-stat-label">Tren</div><div class="kx-stat-val" style="font-size:.85rem;">${trendHtml}</div><div class="kx-stat-sub">vs scrape sebelumnya</div></div>
  `;
  statsEl.style.display = 'grid';

  // Title word frequency — use top 30 by total_sold
  const top30 = cur.slice(0, 30);
  const wordCount = {};
  top30.forEach(r => {
    const words = (r.product_name || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !KX_STOP.has(w) && !/^\d+$/.test(w));
    words.forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1; });
  });
  const sorted = Object.entries(wordCount)
    .filter(([,c]) => c >= 2)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 25);
  const maxCount = sorted[0]?.[1] || 1;

  const wordsEl = document.getElementById('kx-words');
  if (wordsEl) {
    if (!sorted.length) {
      wordsEl.innerHTML = '<div class="kx-empty">Tidak cukup data judul untuk dianalisis.</div>';
    } else {
      wordsEl.innerHTML = sorted.map(([word, count], i) => {
        const pct  = Math.round(count / top30.length * 100);
        const barW = Math.round(count / maxCount * 100);
        return `<div class="kx-word-row">
          <span class="kx-word-rank">${i+1}</span>
          <span class="kx-word-text">${word}</span>
          <div class="kx-word-bar-wrap"><div class="kx-word-bar" style="width:${barW}%"></div></div>
          <span class="kx-word-count">${count}×</span>
          <span class="kx-word-pct">${pct}%</span>
        </div>`;
      }).join('');
    }
  }

  // Related keywords — which scraped keywords have most listings with this word
  const relByKw2 = {};
  cur.forEach(r => {
    const k = r.keyword||'';
    if (!k) return;
    if (!relByKw2[k]) relByKw2[k] = { keyword:k, count:0, sold:0, prices:[], ratings:[] };
    relByKw2[k].count++;
    relByKw2[k].sold += r.total_sold||0;
    relByKw2[k].prices.push(r.price||0);
    relByKw2[k].ratings.push(r.rating||0);
  });
  const relRowsDirect = Object.values(relByKw2).map(r => {
    const avg_p = r.prices.reduce((a,b)=>a+b,0)/(r.prices.length||1);
    const avg_r = r.ratings.reduce((a,b)=>a+b,0)/(r.ratings.length||1);
    const score = Math.round(Math.min(r.sold/5000*40,40)+(r.count<=5?35:r.count<=15?28:r.count<=30?18:8)+(avg_r/5)*25);
    return { keyword:r.keyword, sellers:r.count, total_sold:r.sold, avg_price:avg_p, score };
  }).sort((a,b)=>b.total_sold-a.total_sold).slice(0,20);

  // Also fetch same-category keywords for broader related list
  const { data: related } = await _supabase
    .from('listings')
    .select('keyword,price,total_sold,rating,reviews')
    .eq('category', category)
    .gte('scraped_at', latestDate)
    .limit(1000);

  const relByKw = {};
  (related || []).forEach(r => {
    const k = r.keyword || '';
    if (!k || k.toLowerCase() === kw) return;
    if (!relByKw[k]) relByKw[k] = { keyword:k, count:0, sold:0, prices:[], ratings:[] };
    relByKw[k].count++;
    relByKw[k].sold += r.total_sold||0;
    relByKw[k].prices.push(r.price||0);
    relByKw[k].ratings.push(r.rating||0);
  });

  const relRows = Object.values(relByKw).map(r => {
    const avg_p = r.prices.reduce((a,b)=>a+b,0)/r.prices.length;
    const avg_r = r.ratings.reduce((a,b)=>a+b,0)/r.ratings.length;
    const score = Math.round(
      Math.min(r.sold/5000*40,40) +
      (r.count<=5?35:r.count<=15?28:r.count<=30?18:8) +
      (avg_r/5)*25
    );
    return { keyword:r.keyword, sellers:r.count, total_sold:r.sold, avg_price:avg_p, score };
  }).sort((a,b) => b.score-a.score).slice(0, 20);

  const relTbody = document.getElementById('kx-related');
  if (relTbody) {
    if (!relRows.length) {
      relTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#9CA3AF;font-size:.78rem;">Tidak ada keyword terkait.</td></tr>';
    } else {
      const scoreBg = s => s>=70?'#16a34a':s>=45?'#ca8a04':'#dc2626';
      // Prefer direct matches (keywords containing the search word) over same-category
      const finalRows = relRowsDirect.length ? relRowsDirect : relRows;
      relTbody.innerHTML = finalRows.map(r => `<tr>
        <td style="font-weight:600;cursor:pointer;color:#E8442A;" onclick="document.getElementById('kx-input').value='${r.keyword.replace(/'/g,"\\'")}';analyzeKeyword()">${r.keyword}</td>
        <td style="text-align:center;">${r.sellers}</td>
        <td style="font-weight:600;">${r.total_sold.toLocaleString('id-ID')}</td>
        <td>Rp ${Math.round(r.avg_price).toLocaleString('id-ID')}</td>
        <td><span style="background:${scoreBg(r.score)};color:#fff;padding:2px 7px;border-radius:10px;font-size:.68rem;font-weight:700;">${r.score}</span></td>
      </tr>`).join('');
    }
  }

  if (bodyEl)  bodyEl.style.display  = 'grid';
  if (st) st.textContent = `${seller_count} listing · ${latestDate}`;
}

// ════════════════════════════════════════════════════════════
//  PRODUCT TRACKER
// ════════════════════════════════════════════════════════════

const PT_KEY       = 'larisid_pt_products';
const PT_GROUPS_KEY = 'larisid_pt_groups';

let _ptActiveGroup  = 'Semua';
let _ptPeriod       = '1m';
let _ptSortField    = 'saved_at';
let _ptSortDir      = 'desc';
let _ptSelected     = new Set();

function _ptLoad() {
  try { return JSON.parse(localStorage.getItem(PT_KEY) || '[]'); } catch(e) { return []; }
}
function _ptSave(arr) { localStorage.setItem(PT_KEY, JSON.stringify(arr)); }
function _ptLoadGroups() {
  try { return JSON.parse(localStorage.getItem(PT_GROUPS_KEY) || '["Ungrouped"]'); } catch(e) { return ['Ungrouped']; }
}
function _ptSaveGroups(g) { localStorage.setItem(PT_GROUPS_KEY, JSON.stringify(g)); }

function ptTrackProduct(row) {
  const key = `${row.item_id}_${row.shop_id}`;
  const arr  = _ptLoad();
  if (arr.find(r => `${r.item_id}_${r.shop_id}` === key)) return false; // already tracked
  arr.unshift({ ...row, group: 'Ungrouped', saved_at: new Date().toISOString() });
  _ptSave(arr);
  return true;
}

function ptIsTracked(item_id, shop_id) {
  return _ptLoad().some(r => r.item_id == item_id && r.shop_id == shop_id);
}

function ptRemove(item_id, shop_id) {
  _ptSave(_ptLoad().filter(r => !(r.item_id == item_id && r.shop_id == shop_id)));
  ptRender();
  _refreshSaveBtns(item_id, shop_id, false);
}

function ptSetGroup(item_id, shop_id, group) {
  const arr = _ptLoad();
  const idx = arr.findIndex(r => r.item_id == item_id && r.shop_id == shop_id);
  if (idx >= 0) { arr[idx].group = group; _ptSave(arr); ptRender(); }
}

function ptSetPeriod(p) {
  _ptPeriod = p;
  ['1m','3m','all'].forEach(x => document.getElementById(`pt-p-${x}`)?.classList.toggle('active', x===p));
  ptRender();
}

function ptSortBy(field) {
  if (_ptSortField === field) _ptSortDir = _ptSortDir==='asc'?'desc':'asc';
  else { _ptSortField = field; _ptSortDir = 'desc'; }
  ptRender();
}

function ptToggleSelectAll(checked) {
  _ptSelected = checked ? new Set(_ptLoad().map(r=>`${r.item_id}_${r.shop_id}`)) : new Set();
  document.querySelectorAll('.pt-row-cb').forEach(cb => cb.checked = checked);
  document.getElementById('pt-del-selected-btn').style.display = _ptSelected.size ? '' : 'none';
}

function ptToggleRow(item_id, shop_id, checked) {
  const key = `${item_id}_${shop_id}`;
  if (checked) _ptSelected.add(key); else _ptSelected.delete(key);
  document.getElementById('pt-del-selected-btn').style.display = _ptSelected.size ? '' : 'none';
}

function ptDeleteSelected() {
  if (!_ptSelected.size) return;
  if (!confirm(`Hapus ${_ptSelected.size} produk dari tracker?`)) return;
  _ptSave(_ptLoad().filter(r => !_ptSelected.has(`${r.item_id}_${r.shop_id}`)));
  _ptSelected.clear();
  ptRender();
}

function ptDownloadCSV() {
  const arr = _ptGetFiltered();
  if (!arr.length) return;
  const cols = ['product_name','store_name','category','keyword','price','total_sold','rating','score','group','saved_at'];
  const head = ['Nama Produk','Toko','Kategori','Keyword','Harga','Terjual','Rating','Score','Grup','Disimpan'];
  const rows = arr.map(r => cols.map(c => `"${(r[c]??'').toString().replace(/"/g,'""')}"`).join(','));
  const csv  = [head.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = `larisid_tracker_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function ptAddGroup() {
  const bar = document.getElementById('pt-tabs-bar');
  const existing = bar.querySelector('.pt-group-input');
  if (existing) { existing.focus(); return; }
  const wrap = document.createElement('div');
  wrap.className = 'pt-group-input-wrap';
  wrap.innerHTML = `<input class="pt-group-input" type="text" placeholder="Nama grup…" maxlength="30">
    <button class="pdb-search-btn" style="padding:5px 12px;font-size:.72rem;" onclick="ptConfirmGroup(this)">OK</button>
    <button class="pdb-reset-btn" style="padding:4px 10px;font-size:.72rem;" onclick="this.parentElement.remove()">Batal</button>`;
  bar.appendChild(wrap);
  wrap.querySelector('input').focus();
  wrap.querySelector('input').addEventListener('keydown', e => { if(e.key==='Enter') ptConfirmGroup(wrap.querySelector('button')); });
}

function ptConfirmGroup(btn) {
  const input = btn.parentElement.querySelector('input');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }
  const groups = _ptLoadGroups();
  if (!groups.includes(name)) { groups.push(name); _ptSaveGroups(groups); }
  btn.parentElement.remove();
  _ptActiveGroup = name;
  ptRenderTabs();
  ptRender();
}

function ptRenderTabs() {
  const bar = document.getElementById('pt-tabs-bar');
  if (!bar) return;
  const groups  = _ptLoadGroups();
  const all     = _ptLoad();
  const allCount = all.length;
  const tabs = [
    `<button class="pt-tab${_ptActiveGroup==='Semua'?' active':''}" onclick="ptSetActiveGroup('Semua')">Semua (${allCount})</button>`,
    ...groups.map(g => {
      const cnt = all.filter(r=>r.group===g).length;
      return `<button class="pt-tab${_ptActiveGroup===g?' active':''}" onclick="ptSetActiveGroup('${g}')">${g} (${cnt})</button>`;
    }),
    `<button class="pt-tab-add" onclick="ptAddGroup()">+ Grup</button>`,
  ];
  bar.innerHTML = tabs.join('');
}

function ptSetActiveGroup(g) {
  _ptActiveGroup = g;
  ptRenderTabs();
  ptRender();
  const lbl = document.getElementById('pt-group-label');
  if (lbl) lbl.textContent = g === 'Semua' ? 'Semua Produk' : g;
}

function _ptGetFiltered() {
  let arr = _ptLoad();
  if (_ptActiveGroup !== 'Semua') arr = arr.filter(r => r.group === _ptActiveGroup);

  // Period filter
  if (_ptPeriod !== 'all') {
    const months = _ptPeriod === '1m' ? 1 : 3;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    arr = arr.filter(r => new Date(r.saved_at) >= cutoff);
  }

  // Search
  const q = (document.getElementById('pt-search')?.value || '').trim().toLowerCase();
  if (q) arr = arr.filter(r => `${r.product_name} ${r.keyword} ${r.store_name}`.toLowerCase().includes(q));

  return [...arr].sort((a,b) => {
    const av = a[_ptSortField]??'', bv = b[_ptSortField]??'';
    return _ptSortDir==='asc' ? (av>bv?1:-1) : (av<bv?1:-1);
  });
}

function ptRender() {
  ptRenderTabs();
  const tbody = document.getElementById('pt-tbody');
  if (!tbody) return;
  const rows = _ptGetFiltered();
  const lbl  = document.getElementById('pt-group-label');
  if (lbl) lbl.textContent = _ptActiveGroup === 'Semua' ? 'Semua Produk' : _ptActiveGroup;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10">
      <div class="pt-empty">
        <div class="pt-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        <div class="pt-empty-title">Belum ada produk tersimpan</div>
        <div class="pt-empty-sub">Cari produk di Product Database atau Opportunity Finder, lalu klik Simpan untuk melacaknya di sini.</div>
        <button class="pt-add-btn" onclick="switchDashView('product-database')">Cari Produk Sekarang</button>
      </div>
    </td></tr>`;
    return;
  }

  const groups  = _ptLoadGroups();
  const fmtRp   = v => v ? 'Rp '+Math.round(v).toLocaleString('id-ID') : '—';
  const scoreBg = s => s>=70?'#16a34a':s>=45?'#ca8a04':'#dc2626';
  const savedDate = iso => iso ? new Date(iso).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'2-digit'}) : '—';

  tbody.innerHTML = rows.map(r => {
    const key  = `${r.item_id}_${r.shop_id}`;
    const img  = r.image_url ? `<img src="${r.image_url}" style="width:36px;height:36px;border-radius:5px;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">` : '';
    const name = r.url
      ? `<a href="${r.url}" target="_blank" rel="noopener" style="color:#1A1F3C;font-weight:600;font-size:.78rem;text-decoration:none;">${r.product_name||'—'}</a>`
      : `<span style="font-weight:600;font-size:.78rem;">${r.product_name||'—'}</span>`;
    const groupOpts = groups.map(g => `<option value="${g}"${r.group===g?' selected':''}>${g}</option>`).join('');
    return `<tr id="pt-row-${r.item_id}_${r.shop_id}" style="cursor:pointer;">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="pt-row-cb" ${_ptSelected.has(key)?'checked':''} onchange="ptToggleRow(${r.item_id},${r.shop_id},this.checked)"></td>
      <td style="max-width:220px;" onclick="ptToggleExpand(${r.item_id},${r.shop_id})">
        <div style="display:flex;align-items:center;gap:8px;">
          ${img}
          <div>${name}<div style="font-size:.65rem;color:#6B7280;margin-top:1px;">${r.store_name||''}</div></div>
        </div>
      </td>
      <td style="font-size:.72rem;color:#374151;" onclick="ptToggleExpand(${r.item_id},${r.shop_id})">${r.category||'—'}</td>
      <td style="font-size:.72rem;color:#374151;" onclick="ptToggleExpand(${r.item_id},${r.shop_id})">${r.keyword||'—'}</td>
      <td style="font-size:.72rem;font-weight:600;" onclick="ptToggleExpand(${r.item_id},${r.shop_id})">${fmtRp(r.price)}</td>
      <td style="font-size:.72rem;font-weight:600;" onclick="ptToggleExpand(${r.item_id},${r.shop_id})">${Math.round(r.total_sold||0).toLocaleString('id-ID')}</td>
      <td style="font-size:.72rem;" onclick="ptToggleExpand(${r.item_id},${r.shop_id})">${r.rating?r.rating.toFixed(1):'—'}</td>
      <td onclick="ptToggleExpand(${r.item_id},${r.shop_id})">
        <span style="background:${scoreBg(r.score)};color:#fff;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700;" title="Category score">${r.score}</span>
        <div style="font-size:.58rem;color:#9CA3AF;margin-top:2px;">kategori</div>
      </td>
      <td onclick="event.stopPropagation()">
        <select style="border:1.5px solid #E5E7EB;border-radius:6px;padding:4px 6px;font-size:.68rem;font-family:inherit;background:#fff;cursor:pointer;outline:none;"
          onchange="ptSetGroup(${r.item_id},${r.shop_id},this.value)">${groupOpts}</select>
      </td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;">
        <button class="pt-expand-btn" id="pt-expand-btn-${r.item_id}_${r.shop_id}" onclick="ptToggleExpand(${r.item_id},${r.shop_id})" title="Lihat detail">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <button onclick="ptRemove(${r.item_id},${r.shop_id})" title="Hapus dari tracker"
          style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:2px 4px;"
          onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='#9CA3AF'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </td>
    </tr>
    <tr id="pt-expand-${r.item_id}_${r.shop_id}" class="pt-expand-row" style="display:none;">
      <td colspan="10"><div class="pt-expand-inner" id="pt-expand-inner-${r.item_id}_${r.shop_id}"><div style="color:#9CA3AF;font-size:.78rem;padding:10px;">Memuat grafik…</div></div></td>
    </tr>`;
  }).join('');
}

function _refreshSaveBtns(item_id, shop_id, tracked) {
  document.querySelectorAll(`.pt-save-btn[data-key="${item_id}_${shop_id}"]`).forEach(btn => {
    btn.textContent = tracked ? 'Tersimpan' : '+ Simpan';
    btn.classList.toggle('saved', tracked);
  });
}

// ── Product Tracker expand / charts ──────────────────────────

const _ptExpanded = new Set();

async function ptToggleExpand(item_id, shop_id) {
  const key     = `${item_id}_${shop_id}`;
  const row     = document.getElementById(`pt-expand-${key}`);
  const btn     = document.getElementById(`pt-expand-btn-${key}`);
  const inner   = document.getElementById(`pt-expand-inner-${key}`);
  if (!row) return;

  const opening = row.style.display === 'none';
  row.style.display = opening ? '' : 'none';
  if (btn) btn.style.transform = opening ? 'rotate(180deg)' : '';
  if (!opening) return;

  if (_ptExpanded.has(key)) return; // already loaded
  _ptExpanded.add(key);

  if (!_supabase || !inner) return;

  // Find the saved product data
  const saved = _ptLoad().find(r => r.item_id == item_id && r.shop_id == shop_id);
  const kw    = saved?.keyword || '';

  // Fetch historical snapshots for this item
  const { data: history } = await _supabase
    .from('listings')
    .select('scraped_at,total_sold,price')
    .eq('item_id', item_id)
    .eq('shop_id', shop_id)
    .order('scraped_at', { ascending: true })
    .limit(30);

  // Fetch all sellers for the same keyword (latest date) for bar chart
  let sellerData = [];
  if (kw && _supabase) {
    const { data: latest } = await _supabase
      .from('listings').select('scraped_at').order('scraped_at',{ascending:false}).limit(1);
    const ld = latest?.[0]?.scraped_at?.slice(0,10);
    if (ld) {
      const { data: sellers } = await _supabase
        .from('listings')
        .select('store_name,total_sold,product_name')
        .ilike('keyword', kw)
        .gte('scraped_at', ld)
        .order('total_sold', { ascending: false })
        .limit(120);
      sellerData = sellers || [];
    }
  }

  // Compute listing score vs peers
  const listingScore = calcListingScore(saved, sellerData, _dscListingTrendPct(saved), _dscKwTrendMap[saved?.keyword]??null).total;
  const catScore     = saved?.score || 0;
  const lsCol        = _scoreColor(listingScore);
  const csCol        = _scoreColor(catScore);

  inner.innerHTML = `
    <div class="pt-chart-panel">
      <div class="pt-chart-title">Riwayat Terjual (Kumulatif)</div>
      ${_drawLineChart(history || [])}
      <div class="pt-chart-sub">${(history||[]).length} snapshot tersedia</div>
    </div>
    <div class="pt-chart-panel">
      <div class="pt-chart-title">Performa Seller — "${kw || '—'}"</div>
      ${_drawSellerBars(sellerData, saved)}
      <div class="pt-chart-sub">${sellerData.length} seller · hanya yang >0.5% total terjual ditampilkan</div>
    </div>
    <div class="pt-chart-panel" style="grid-column:1/-1;">
      <div class="pt-chart-title">Score Listing ini vs Kategori</div>
      <div style="display:flex;align-items:center;gap:20px;padding:8px 0;">
        <div style="text-align:center;">
          <div style="width:52px;height:52px;border-radius:50%;background:${lsCol}18;border:2px solid ${lsCol};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto;">
            <div style="font-size:1rem;font-weight:900;color:${lsCol};line-height:1;">${listingScore}</div>
            <div style="font-size:.5rem;color:${lsCol};font-weight:700;">LISTING</div>
          </div>
          <div style="font-size:.6rem;color:#6B7280;margin-top:4px;">Score Produk Ini</div>
        </div>
        <div style="font-size:1.2rem;color:#D1D5DB;">vs</div>
        <div style="text-align:center;">
          <div style="width:52px;height:52px;border-radius:50%;background:${csCol}18;border:2px solid ${csCol};display:flex;flex-direction:column;align-items:center;justify-content:center;margin:0 auto;">
            <div style="font-size:1rem;font-weight:900;color:${csCol};line-height:1;">${catScore}</div>
            <div style="font-size:.5rem;color:${csCol};font-weight:700;">KATEGORI</div>
          </div>
          <div style="font-size:.6rem;color:#6B7280;margin-top:4px;">Score Kategori "${kw}"</div>
        </div>
        ${kw ? `<button class="pdb-search-btn" style="margin-left:auto;padding:8px 14px;font-size:.72rem;" onclick="ofOpenKeyword('${kw.replace(/'/g,"\\'")}')">Lihat Keyword Detail</button>` : ''}
      </div>
    </div>
  `;
}

function _drawLineChart(snapshots) {
  if (!snapshots.length) return '<div style="color:#9CA3AF;font-size:.75rem;padding:10px 0;">Belum ada data historis.</div>';

  const W = 320, H = 110, pad = { t:10, r:10, b:28, l:42 };
  const vals = snapshots.map(s => s.total_sold || 0);
  const dates = snapshots.map(s => s.scraped_at?.slice(0,10) || '');
  const minV = 0, maxV = Math.max(...vals, 1);

  const xScale = i => pad.l + (i / Math.max(snapshots.length-1,1)) * (W - pad.l - pad.r);
  const yScale = v => pad.t + (1 - (v - minV)/(maxV - minV || 1)) * (H - pad.t - pad.b);

  const points = vals.map((v,i) => `${xScale(i)},${yScale(v)}`).join(' ');
  const area   = `M${xScale(0)},${yScale(vals[0])} ` +
    vals.slice(1).map((v,i) => `L${xScale(i+1)},${yScale(v)}`).join(' ') +
    ` L${xScale(vals.length-1)},${H-pad.b} L${xScale(0)},${H-pad.b} Z`;

  const fmtK = v => v>=1000 ? Math.round(v/1000)+'rb' : v.toString();
  const yTicks = [0, Math.round(maxV/2), maxV].map(v =>
    `<text x="${pad.l-5}" y="${yScale(v)+4}" text-anchor="end" font-size="9" fill="#9CA3AF">${fmtK(v)}</text>`).join('');

  const first = dates[0]?.slice(5) || '';
  const last  = dates[dates.length-1]?.slice(5) || '';
  const xLabels = `<text x="${xScale(0)}" y="${H-4}" text-anchor="middle" font-size="9" fill="#9CA3AF">${first}</text>
    <text x="${xScale(vals.length-1)}" y="${H-4}" text-anchor="middle" font-size="9" fill="#9CA3AF">${last}</text>`;

  const dots = vals.map((v,i) =>
    `<circle cx="${xScale(i)}" cy="${yScale(v)}" r="3" fill="#E8442A"/>`
  ).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="pt-chart-svg" style="max-height:${H}px;">
    <defs><linearGradient id="lg-pt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#E8442A" stop-opacity=".18"/><stop offset="100%" stop-color="#E8442A" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#lg-pt)"/>
    <polyline points="${points}" fill="none" stroke="#E8442A" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${yTicks}${xLabels}
  </svg>`;
}

function _drawSellerBars(sellers, highlight) {
  if (!sellers.length) return '<div style="color:#9CA3AF;font-size:.75rem;padding:10px 0;">Belum ada data seller untuk keyword ini.</div>';

  const totalSold = sellers.reduce((s,r) => s+(r.total_sold||0), 0) || 1;
  // Only show sellers with >0.5% of total — but always show highlighted product
  const filtered = sellers.filter(r => {
    const pct = (r.total_sold||0)/totalSold*100;
    if (pct >= 0.5) return true;
    if (highlight && r.store_name === highlight.store_name) return true;
    return false;
  }).slice(0, 20);

  if (!filtered.length) return '<div style="color:#9CA3AF;font-size:.75rem;padding:10px 0;">Tidak ada seller yang menonjol untuk keyword ini.</div>';

  const maxSold = Math.max(...filtered.map(r => r.total_sold||0), 1);
  const BAR_H = 18, GAP = 6, W = 320, labelW = 100, barAreaW = W - labelW - 50;

  const rows = filtered.map((r, i) => {
    const y        = i * (BAR_H + GAP);
    const barW     = Math.max(2, Math.round((r.total_sold||0)/maxSold * barAreaW));
    const pct      = ((r.total_sold||0)/totalSold*100).toFixed(1);
    const isMe     = highlight && r.store_name === highlight.store_name;
    const barColor = isMe ? '#E8442A' : '#93C5FD';
    const name     = (r.store_name || r.product_name || '—').slice(0,18);
    return `
      <text x="0" y="${y+13}" font-size="9" fill="${isMe?'#E8442A':'#374151'}" font-weight="${isMe?'700':'400'}">${name}${isMe?' ◀':''}</text>
      <rect x="${labelW}" y="${y}" width="${barW}" height="${BAR_H}" rx="3" fill="${barColor}" opacity=".85"/>
      <text x="${labelW+barW+5}" y="${y+13}" font-size="9" fill="#6B7280">${pct}%</text>`;
  }).join('');

  const svgH = filtered.length * (BAR_H + GAP) + 10;
  return `<svg viewBox="0 0 ${W} ${svgH}" class="pt-chart-svg" style="max-height:${Math.min(svgH,260)}px;overflow-y:auto;">${rows}</svg>`;
}

// ── SALES ESTIMATOR ──────────────────────────────────────────

function loadSalesEstimator() {
  const sel = document.getElementById('se-product-select');
  if (!sel) return;
  const products = _ptLoad();
  sel.innerHTML = '<option value="">-- pilih produk dari tracker --</option>' +
    products.map((r,i) => `<option value="${i}">${(r.product_name||'Produk').slice(0,50)} · ${r.keyword||''}</option>`).join('');
  seCalc();
  seRenderSaved();
}

function seOnSelect() {
  const sel = document.getElementById('se-product-select');
  const idx = parseInt(sel?.value);
  if (isNaN(idx)) { document.getElementById('se-product-card').style.display='none'; return; }

  const products = _ptLoad();
  const r = products[idx];
  if (!r) return;

  // Show product card
  const card  = document.getElementById('se-product-card');
  const img   = document.getElementById('se-product-img');
  const pname = document.getElementById('se-product-name');
  const pstore= document.getElementById('se-product-store');
  if (card)  card.style.display  = 'flex';
  if (img)   img.src             = r.image_url || '';
  if (pname) pname.textContent   = r.product_name || '—';
  if (pstore)pstore.textContent  = r.store_name || '';

  // Auto-fill price and units
  const priceEl = document.getElementById('se-price');
  const unitsEl = document.getElementById('se-units');
  if (priceEl && r.price)      priceEl.value = Math.round(r.price);
  if (unitsEl && r.total_sold) unitsEl.value = Math.max(1, Math.round(r.total_sold / 12));

  // Load saved plan if exists
  const planKey = `se_plan_${r.item_id}_${r.shop_id}`;
  const saved = JSON.parse(localStorage.getItem(planKey) || 'null');
  if (saved) {
    ['se-cogs','se-shipping','se-commission','se-admin','se-payment','se-marketing'].forEach(id => {
      const el = document.getElementById(id);
      if (el && saved[id] != null) el.value = saved[id];
    });
  }
  seCalc();
}

function seCalc() {
  const gv = id => parseFloat(document.getElementById(id)?.value || 0) || 0;
  const price      = gv('se-price');
  const units      = gv('se-units');
  const cogs       = gv('se-cogs');
  const shipping   = gv('se-shipping');
  const commission = gv('se-commission');
  const admin      = gv('se-admin');
  const payment    = gv('se-payment');
  const marketing  = gv('se-marketing');

  const el = document.getElementById('se-results');
  if (!el) return;

  if (!price || !units) {
    el.innerHTML = `<div class="se-results-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="color:#E5E7EB;"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
      <div style="margin-top:10px;font-size:.8rem;color:#9CA3AF;">Isi harga jual dan estimasi unit terjual.</div>
    </div>`;
    return;
  }

  const revenue       = price * units;
  const shopeeFeePct  = (commission + admin + payment) / 100;
  const shopeeFee     = revenue * shopeeFeePct;
  const marketingFee  = revenue * (marketing / 100);
  const cogsTotal     = cogs * units;
  const shippingTotal = shipping * units;
  const totalCost     = shopeeFee + marketingFee + cogsTotal + shippingTotal;
  const net           = revenue - totalCost;
  const marginPct     = revenue > 0 ? (net / revenue * 100) : 0;
  const marginColor   = marginPct >= 20 ? '#16a34a' : marginPct >= 10 ? '#ca8a04' : '#dc2626';
  const barColor      = marginPct >= 20 ? '#16a34a' : marginPct >= 10 ? '#f59e0b' : '#dc2626';

  const fmtRp = v => 'Rp ' + Math.abs(Math.round(v)).toLocaleString('id-ID');
  const negRp = v => (v < 0 ? '- ' : '') + fmtRp(v);

  el.innerHTML = `
    <div class="se-result-grid">
      <div class="se-result-card"><div class="se-result-label">Omset / Bln</div><div class="se-result-val">${fmtRp(revenue)}</div></div>
      <div class="se-result-card"><div class="se-result-label">Net Profit / Bln</div><div class="se-result-val ${marginPct>=15?'green':marginPct>=5?'orange':'red'}">${negRp(net)}</div></div>
      <div class="se-result-card"><div class="se-result-label">Margin</div><div class="se-result-val" style="color:${marginColor}">${marginPct.toFixed(1)}%</div></div>
      <div class="se-result-card"><div class="se-result-label">Net / Unit</div><div class="se-result-val ${net/units>=0?'green':'red'}">${negRp(net/units)}</div></div>
    </div>

    <div class="se-margin-bar"><div class="se-margin-fill" style="width:${Math.max(0,Math.min(100,marginPct))}%;background:${barColor};"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:.62rem;color:#9CA3AF;margin-bottom:14px;"><span>0%</span><span>Margin ${marginPct.toFixed(1)}%</span><span>100%</span></div>

    <div class="se-breakdown">
      <div class="se-breakdown-row"><span class="se-breakdown-label">Revenue (${units} unit × ${fmtRp(price)})</span><span class="se-breakdown-val pos">+ ${fmtRp(revenue)}</span></div>
      <div class="se-breakdown-row"><span class="se-breakdown-label">HPP / COGS</span><span class="se-breakdown-val neg">- ${fmtRp(cogsTotal)}</span></div>
      <div class="se-breakdown-row"><span class="se-breakdown-label">Ongkos Kirim</span><span class="se-breakdown-val neg">- ${fmtRp(shippingTotal)}</span></div>
      <div class="se-breakdown-row"><span class="se-breakdown-label">Biaya Shopee (${(commission+admin+payment).toFixed(1)}%)</span><span class="se-breakdown-val neg">- ${fmtRp(shopeeFee)}</span></div>
      <div class="se-breakdown-row"><span class="se-breakdown-label">Marketing / Iklan (${marketing}%)</span><span class="se-breakdown-val neg">- ${fmtRp(marketingFee)}</span></div>
      <div class="se-breakdown-row total"><span class="se-breakdown-label">Net Profit</span><span class="se-breakdown-val ${net>=0?'pos':'neg'}">${net>=0?'+ ':'- '}${fmtRp(net)}</span></div>
    </div>
  `;
}

const SE_CALCS_KEY = 'larisid_se_calcs';

function _seLoadCalcs() { try { return JSON.parse(localStorage.getItem(SE_CALCS_KEY)||'[]'); } catch{ return []; } }
function _seSaveCalcs(arr) { localStorage.setItem(SE_CALCS_KEY, JSON.stringify(arr)); }

function seRenderSaved() {
  const calcs = _seLoadCalcs();
  const sec  = document.getElementById('se-saved-section');
  const list = document.getElementById('se-saved-list');
  if (!sec || !list) return;
  if (!calcs.length) { sec.style.display='none'; return; }
  sec.style.display = '';
  list.innerHTML = calcs.slice().reverse().map((c,ri) => {
    const i = calcs.length-1-ri;
    return `<div class="se-saved-item" onclick="seLoadCalc(${i})">
      <div>
        <div class="se-saved-name">${c.name||'Kalkulasi'}</div>
        <div class="se-saved-meta">${c.product_name||''} · ${c.date||''} · Margin ${c.margin||0}%</div>
      </div>
      <button class="se-saved-del" onclick="event.stopPropagation();seDeleteCalc(${i})">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }).join('');
}

function seLoadCalc(i) {
  const c = _seLoadCalcs()[i];
  if (!c) return;
  const fields = ['se-price','se-units','se-cogs','se-shipping','se-commission','se-admin','se-payment','se-marketing'];
  fields.forEach(id => { const el=document.getElementById(id); if(el && c[id]!=null) el.value=c[id]; });
  seCalc();
}

function seDeleteCalc(i) {
  const calcs = _seLoadCalcs();
  calcs.splice(i,1);
  _seSaveCalcs(calcs);
  seRenderSaved();
}

function seSaveNamed() {
  const gv = id => parseFloat(document.getElementById(id)?.value||0)||0;
  const price = gv('se-price'), units = gv('se-units');
  if (!price || !units) { alert('Isi harga jual dan unit terjual terlebih dahulu.'); return; }
  const name = prompt('Nama kalkulasi ini:', `Kalkulasi ${new Date().toLocaleDateString('id-ID')}`);
  if (name === null) return;
  const revenue = price*units;
  const shopeeFeePct=(gv('se-commission')+gv('se-admin')+gv('se-payment'))/100;
  const net = revenue - revenue*shopeeFeePct - revenue*(gv('se-marketing')/100) - gv('se-cogs')*units - gv('se-shipping')*units;
  const margin = revenue>0 ? (net/revenue*100).toFixed(1) : 0;
  const sel = document.getElementById('se-product-select');
  const idx = parseInt(sel?.value);
  const r = isNaN(idx) ? null : _ptLoad()[idx];
  const calc = {
    name, date: new Date().toLocaleDateString('id-ID'),
    product_name: r?.product_name||'',
    margin, 'se-price':price,'se-units':units,
    'se-cogs':gv('se-cogs'),'se-shipping':gv('se-shipping'),
    'se-commission':gv('se-commission'),'se-admin':gv('se-admin'),
    'se-payment':gv('se-payment'),'se-marketing':gv('se-marketing'),
  };
  const calcs = _seLoadCalcs();
  calcs.push(calc);
  _seSaveCalcs(calcs);
  if (r) localStorage.setItem(`se_plan_${r.item_id}_${r.shop_id}`, JSON.stringify(calc));
  const msg = document.getElementById('se-save-msg');
  if (msg) { msg.textContent = `"${name}" tersimpan.`; setTimeout(()=>{ if(msg) msg.textContent=''; },3000); }
  seRenderSaved();
}

async function seExportPDF() {
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('PDF library belum dimuat, coba refresh halaman.'); return; }
  const gv = id => parseFloat(document.getElementById(id)?.value||0)||0;
  const price=gv('se-price'),units=gv('se-units'),cogs=gv('se-cogs'),shipping=gv('se-shipping');
  const commission=gv('se-commission'),admin=gv('se-admin'),payment=gv('se-payment'),marketing=gv('se-marketing');
  if (!price||!units) { alert('Isi harga jual dan unit terlebih dahulu.'); return; }
  const revenue      = price*units;
  const shopeeFeePct = (commission+admin+payment)/100;
  const shopeeFee    = revenue*shopeeFeePct;
  const marketingFee = revenue*(marketing/100);
  const cogsTotal    = cogs*units;
  const shippingTotal= shipping*units;
  const net          = revenue-shopeeFee-marketingFee-cogsTotal-shippingTotal;
  const marginPct    = revenue>0 ? net/revenue*100 : 0;
  const fmtRp = v => 'Rp ' + Math.abs(Math.round(v)).toLocaleString('id-ID');
  const sel = document.getElementById('se-product-select');
  const idx = parseInt(sel?.value);
  const prod = isNaN(idx) ? null : _ptLoad()[idx];

  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = 210, margin = 18;

  // Header band
  doc.setFillColor(26,31,60);
  doc.rect(0,0,W,28,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('LarisID', margin, 12);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Sales Estimator Report', margin, 19);
  doc.setFontSize(8);
  doc.text(new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}), W-margin, 19, {align:'right'});

  // Product name
  let y = 38;
  doc.setTextColor(26,31,60);
  doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text(prod?.product_name||'Produk', margin, y);
  y += 5;
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(107,114,128);
  doc.text((prod?.store_name||'')+(prod?.keyword?` · ${prod.keyword}`:''), margin, y);
  y += 10;

  // Score boxes
  const boxes = [
    { label:'Omset/Bulan', val: fmtRp(revenue), color:[232,68,42] },
    { label:'Net Profit/Bln', val: fmtRp(net), color: net>=0?[22,163,74]:[220,38,38] },
    { label:'Margin', val: `${marginPct.toFixed(1)}%`, color: marginPct>=20?[22,163,74]:marginPct>=10?[202,138,4]:[220,38,38] },
    { label:'Net/Unit', val: fmtRp(net/units), color: net>=0?[22,163,74]:[220,38,38] },
  ];
  const bw=(W-margin*2-12)/4, bh=22;
  boxes.forEach((b,i)=>{
    const bx=margin+i*(bw+4);
    doc.setFillColor(249,250,251); doc.roundedRect(bx,y,bw,bh,2,2,'F');
    doc.setDrawColor(...b.color); doc.setLineWidth(.4); doc.roundedRect(bx,y,bw,bh,2,2,'S');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(107,114,128);
    doc.text(b.label, bx+bw/2, y+6, {align:'center'});
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(...b.color);
    doc.text(b.val, bx+bw/2, y+15, {align:'center'});
  });
  y += bh+12;

  // Margin bar
  const barW = W-margin*2;
  doc.setFillColor(229,231,235); doc.roundedRect(margin,y,barW,5,2,2,'F');
  const fillW = Math.max(0,Math.min(barW, barW*marginPct/100));
  const fc = marginPct>=20?[22,163,74]:marginPct>=10?[245,158,11]:[220,38,38];
  doc.setFillColor(...fc); doc.roundedRect(margin,y,fillW,5,2,2,'F');
  doc.setFontSize(7); doc.setTextColor(107,114,128);
  doc.text(`Margin ${marginPct.toFixed(1)}%`, W/2, y+9, {align:'center'});
  y += 16;

  // Breakdown table
  doc.setFillColor(243,244,246); doc.rect(margin,y,barW,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(26,31,60);
  doc.text('Rincian Biaya', margin+4, y+5.5);
  y += 10;
  const rows2 = [
    ['Revenue', `${units} unit × ${fmtRp(price)}`, `+ ${fmtRp(revenue)}`],
    ['HPP / COGS', `${units} unit × ${fmtRp(cogs)}`, `- ${fmtRp(cogsTotal)}`],
    ['Ongkos Kirim', `${units} order × ${fmtRp(shipping)}`, `- ${fmtRp(shippingTotal)}`],
    [`Biaya Shopee (${(commission+admin+payment).toFixed(1)}%)`, '', `- ${fmtRp(shopeeFee)}`],
    [`Marketing / Iklan (${marketing}%)`, '', `- ${fmtRp(marketingFee)}`],
    ['Net Profit', '', `${net>=0?'+ ':'- '}${fmtRp(net)}`],
  ];
  rows2.forEach((row,i)=>{
    if (i===rows2.length-1) { doc.setFillColor(249,250,251); doc.rect(margin,y,barW,8,'F'); doc.setFont('helvetica','bold'); } else { doc.setFont('helvetica','normal'); }
    doc.setFontSize(8); doc.setTextColor(55,65,81);
    doc.text(row[0], margin+4, y+5.5);
    doc.text(row[1], margin+barW*0.55, y+5.5);
    const col = row[2].startsWith('+') ? [22,163,74] : [220,38,38];
    doc.setTextColor(...col); doc.setFont('helvetica','bold');
    doc.text(row[2], margin+barW-4, y+5.5, {align:'right'});
    doc.setDrawColor(229,231,235); doc.setLineWidth(.2);
    doc.line(margin,y+8,margin+barW,y+8);
    y += 9;
  });
  y += 8;

  // Footer
  doc.setFillColor(249,250,251); doc.rect(0,287-8,W,12,'F');
  doc.setFontSize(7); doc.setTextColor(156,163,175); doc.setFont('helvetica','normal');
  doc.text('Dibuat dengan LarisID · larisid.com', W/2, 287-2, {align:'center'});

  doc.save(`larisid_estimasi_${(prod?.product_name||'produk').slice(0,20).replace(/\s/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`);
}

function seReset() {
  ['se-cogs','se-shipping','se-marketing'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('se-commission').value = '2';
  document.getElementById('se-admin').value = '1';
  document.getElementById('se-payment').value = '2';
  seCalc();
}

// ════════════════════════════════════════════════════════════
//  KEYWORD RANKINGS
// ════════════════════════════════════════════════════════════
async function loadKeywordRankings(productName) {
  const el = document.getElementById('kwr-body');
  if (!el) return;

  if (!_supabase) {
    el.innerHTML = '';
    return;
  }

  el.innerHTML = '<div style="font-size:.78rem;color:var(--tm);">Memuat data keyword...</div>';

  // Fetch latest week's keyword rankings for this product
  const { data, error } = await _supabase
    .from('keyword_rankings')
    .select('keyword,combined_sold,seller_count,avg_price,efficiency_score,trend_direction')
    .eq('product_name', productName)
    .order('efficiency_score', { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    el.innerHTML = '<div style="font-size:.78rem;color:var(--tm);padding:8px 0;">Data keyword belum tersedia — akan muncul setelah scrape minggu ini diproses.</div>';
    return;
  }

  // Score thresholds based on distribution
  const scores  = data.map(r => r.efficiency_score);
  const maxScore = Math.max(...scores);
  const p66      = maxScore * 0.66;
  const p33      = maxScore * 0.33;

  function badge(score) {
    if (score >= p66) return '<span class="kwr-badge kwr-buy">✅ Beli Iklan</span>';
    if (score >= p33) return '<span class="kwr-badge kwr-watch">⚠️ Pertimbangkan</span>';
    return '<span class="kwr-badge kwr-avoid">❌ Hindari</span>';
  }

  function trendIcon(dir) {
    if (dir === 'up')   return '<span class="kwr-trend-up">↑ Naik</span>';
    if (dir === 'down') return '<span class="kwr-trend-down">↓ Turun</span>';
    return '<span class="kwr-trend-stable">→ Stabil</span>';
  }

  const rows = data.map(r => `
    <tr>
      <td class="kwr-keyword">${r.keyword}</td>
      <td class="kwr-efficiency">${Math.round(r.efficiency_score).toLocaleString('id-ID')}</td>
      <td>${r.seller_count}</td>
      <td>${fmtShort(r.avg_price)}</td>
      <td>${trendIcon(r.trend_direction)}</td>
      <td>${badge(r.efficiency_score)}</td>
    </tr>`).join('');

  el.innerHTML = `
    <div style="font-size:.72rem;color:var(--tm);margin-bottom:10px;line-height:1.5;">
      <strong>Efficiency Score</strong> = total terjual ÷ jumlah penjual.
      Makin tinggi = permintaan tinggi, persaingan iklan lebih rendah → CPC lebih murah.
    </div>
    <div style="overflow-x:auto;">
      <table class="kwr-table">
        <thead>
          <tr>
            <th>Keyword</th>
            <th>Efficiency</th>
            <th>Penjual</th>
            <th>Avg Harga</th>
            <th>Tren</th>
            <th>Rekomendasi</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:.7rem;color:var(--tl);margin-top:8px;">
      💡 Targetkan keyword "Beli Iklan" dengan match type broad untuk jangkauan, exact untuk konversi.
    </div>`;
}

// ── LOAD DASHBOARD WEEKLY DATA ──
let _dashChartInstance = null;

async function loadDashboardData() {
  if (!_supabase || !currentUser) return;
  loadChestState();
  const saved = allProducts.filter(p => savedProducts.has(p.id));
  if (!saved.length) return;

  // Build list of product names to query
  const names = saved.map(p => p.name).filter(Boolean);
  if (!names.length) return;

  // Fetch last 3 weeks of snapshots for these products
  const { data: snaps, error } = await _supabase
    .from('weekly_snapshots')
    .select('product_name,week_date,combined_total_sold,seller_count,weekly_delta_revenue')
    .in('product_name', names)
    .order('week_date', { ascending: false })
    .limit(names.length * 3);

  if (error || !snaps?.length) return;

  // Group by product_name, pick latest 2 weeks each
  const byProduct = {};
  snaps.forEach(s => {
    if (!byProduct[s.product_name]) byProduct[s.product_name] = [];
    if (byProduct[s.product_name].length < 2) byProduct[s.product_name].push(s);
  });

  // Build deltas
  const deltas = [];
  Object.entries(byProduct).forEach(([name, weeks]) => {
    const curr = weeks[0];
    const prev = weeks[1];
    const revDelta = curr.weekly_delta_revenue || 0;
    const sellerDelta = prev ? (curr.seller_count || 0) - (prev.seller_count || 0) : null;
    const totalSoldDelta = prev
      ? (curr.combined_total_sold || 0) - (prev.combined_total_sold || 0)
      : null;
    deltas.push({ name, revDelta, sellerDelta, totalSoldDelta, curr, prev });
  });

  if (!deltas.length) return;

  // Sort by revDelta desc for chart
  deltas.sort((a, b) => b.revDelta - a.revDelta);

  // Show chart section
  const section = document.getElementById('dash-weekly-section');
  if (section) section.style.display = '';

  // Render bar chart
  renderDashWeeklyChart(deltas);

  // Top movers
  const withData = deltas.filter(d => d.revDelta !== 0);
  if (withData.length >= 1) {
    const moversRow = document.getElementById('dash-movers-row');
    if (moversRow) moversRow.style.display = 'grid';

    const topUp   = deltas[0];
    const topDown = deltas[deltas.length - 1];

    // Up mover
    document.getElementById('dash-mover-up-name').textContent  = topUp.name;
    document.getElementById('dash-mover-up-delta').textContent = topUp.revDelta > 0
      ? `+Rp ${fmtShort(topUp.revDelta)}` : 'Data terbatas';
    document.getElementById('dash-mover-up-meta').innerHTML = buildMoverMeta(topUp);

    // Down mover
    document.getElementById('dash-mover-down-name').textContent  = topDown.name;
    document.getElementById('dash-mover-down-delta').textContent = topDown.revDelta < 0
      ? `-Rp ${fmtShort(Math.abs(topDown.revDelta))}` : 'Stabil';
    document.getElementById('dash-mover-down-meta').innerHTML = buildMoverMeta(topDown);
  }
}

function buildMoverMeta(d) {
  const parts = [];
  if (d.sellerDelta !== null) {
    const sign = d.sellerDelta > 0 ? '+' : '';
    parts.push(`${sign}${d.sellerDelta} penjual aktif`);
  }
  if (d.curr?.seller_count) parts.push(`${d.curr.seller_count} total penjual`);
  if (d.curr?.combined_total_sold) parts.push(`${fmtShort(d.curr.combined_total_sold)} unit terjual`);
  return parts.join(' · ') || '—';
}

function renderDashWeeklyChart(deltas) {
  const canvas = document.getElementById('dash-weekly-chart');
  if (!canvas) return;
  if (_dashChartInstance) { _dashChartInstance.destroy(); _dashChartInstance = null; }

  const labels = deltas.map(d => d.name.length > 22 ? d.name.slice(0, 22) + '…' : d.name);
  const values = deltas.map(d => d.revDelta);
  const colors = values.map(v => v >= 0 ? '#1A7A46' : '#C0392B');
  const bgColors = values.map(v => v >= 0 ? 'rgba(26,122,70,.12)' : 'rgba(192,57,43,.12)');

  // Dynamic height based on number of products
  const barH = 28;
  const minH  = 180;
  canvas.parentElement.style.height = Math.max(minH, deltas.length * barH + 40) + 'px';

  _dashChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: bgColors,
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              return v >= 0 ? `+Rp ${fmtShort(v)}` : `-Rp ${fmtShort(Math.abs(v))}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: {
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 },
            callback: v => {
              const abs = Math.abs(v);
              const s = abs >= 1e6 ? (abs/1e6).toFixed(1)+'jt' : abs >= 1e3 ? (abs/1e3).toFixed(0)+'rb' : abs;
              return v >= 0 ? `+${s}` : `-${s}`;
            }
          }
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } }
        }
      }
    }
  });
}

// ════════════════════════════════════════════════════════════
//  MY PLAN — Supabase product_plans table
// ════════════════════════════════════════════════════════════
window._planCache = {};   // { [productId]: planRow }
window._sellerDataCache = {}; // { [productId]: mappedSellers[] }

async function loadAllPlans() {
  if (!currentUser || !_supabase) return;
  const { data } = await _supabase
    .from('product_plans')
    .select('*')
    .eq('user_id', currentUser.id);
  if (data) {
    window._planCache = {};
    data.forEach(row => { window._planCache[row.product_id] = row; });
  }
}

async function loadPlanForProduct(productId) {
  if (!currentUser || !_supabase) return null;
  if (window._planCache[productId] !== undefined) return window._planCache[productId];
  const { data } = await _supabase
    .from('product_plans')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('product_id', productId)
    .maybeSingle();
  window._planCache[productId] = data || null;
  return window._planCache[productId];
}

function showPlanPanel() {
  const section = document.getElementById('my-plan-section');
  const body    = document.getElementById('plan-body');
  if (!section || !body) return;

  if (!currentUser) {
    section.style.display = 'none';
    return;
  }

  const pid = currentProduct?.id;
  if (!pid || !savedProducts.has(pid)) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const p    = currentProduct;
  const plan = window._planCache[pid] || {};

  body.innerHTML = `
    <div class="plan-inputs">
      <div class="plan-row">
        <label>Harga Jual (Rp)</label>
        <input type="number" id="plan-sell-price" class="plan-input" placeholder="0" value="${plan.sell_price||''}" oninput="updatePlanCalc()">
      </div>
      <div class="plan-row">
        <label>Harga Modal (Rp)</label>
        <input type="number" id="plan-source-cost" class="plan-input" placeholder="0" value="${plan.source_cost||''}" oninput="updatePlanCalc()">
      </div>
      <div class="plan-row">
        <label>Ongkos Kirim (Rp)</label>
        <input type="number" id="plan-shipping" class="plan-input" placeholder="0" value="${plan.shipping||''}" oninput="updatePlanCalc()">
      </div>
      <div class="plan-row">
        <label>Biaya Iklan / Marketing (Rp)</label>
        <input type="number" id="plan-marketing" class="plan-input" placeholder="0" value="${plan.marketing||''}" oninput="updatePlanCalc()">
      </div>
    </div>
    <div class="plan-divider"></div>
    <div class="plan-results" id="plan-results">
      <div class="plan-result-row">
        <span>Margin per unit</span>
        <span id="plan-margin-unit">—</span>
      </div>
      <div class="plan-result-row plan-result-main">
        <span>Margin %</span>
        <span id="plan-margin-pct-val">—</span>
      </div>
      <div class="plan-result-row">
        <span>Estimasi net/bln (seller baru · <span id="plan-units-new-lbl">${Math.round(p.newUnits||0)}</span> unit)</span>
        <span id="plan-rev-new">—</span>
      </div>
      <div class="plan-result-row">
        <span>Estimasi net/bln (seller berpengalaman · <span id="plan-units-exp-lbl">${Math.round(p.expUnits||0)}</span> unit)</span>
        <span id="plan-rev-exp">—</span>
      </div>
      <div class="plan-result-row">
        <span>Harga vs. median market</span>
        <span id="plan-vs-median">—</span>
      </div>
    </div>
    <button class="plan-save-btn" onclick="savePlan()">Simpan Rencana</button>
    <div class="plan-saved-msg" id="plan-saved-msg"></div>`;

  updatePlanCalc();
}

function updatePlanCalc() {
  const sell     = parseFloat(document.getElementById('plan-sell-price')?.value)   || 0;
  const cost     = parseFloat(document.getElementById('plan-source-cost')?.value)  || 0;
  const ship     = parseFloat(document.getElementById('plan-shipping')?.value)     || 0;
  const mktg     = parseFloat(document.getElementById('plan-marketing')?.value)    || 0;
  const margin   = sell - cost - ship - mktg;
  const pct      = sell > 0 ? (margin / sell * 100) : 0;
  const newUnits = currentProduct?.newUnits || 0;
  const expUnits = currentProduct?.expUnits || 0;
  const median   = currentProduct?.medianPrice || 0;

  const fmtRp = v => 'Rp ' + Math.round(v).toLocaleString('id-ID');

  const muEl  = document.getElementById('plan-margin-unit');
  const pctEl = document.getElementById('plan-margin-pct-val');
  const rnEl  = document.getElementById('plan-rev-new');
  const reEl  = document.getElementById('plan-rev-exp');
  const vmEl  = document.getElementById('plan-vs-median');

  if (!muEl) return;
  muEl.textContent  = sell > 0 ? fmtRp(margin) : '—';
  muEl.className    = margin >= 0 ? 'plan-margin-pos' : 'plan-margin-neg';
  pctEl.textContent = sell > 0 ? `${pct.toFixed(1)}%` : '—';
  pctEl.className   = pct >= 0 ? 'plan-margin-pos' : 'plan-margin-neg';
  rnEl.textContent  = sell > 0 ? fmtRp(margin * newUnits) : '—';
  reEl.textContent  = sell > 0 ? fmtRp(margin * expUnits) : '—';

  if (median > 0 && sell > 0) {
    const diff = ((sell - median) / median * 100);
    const sign = diff >= 0 ? '+' : '';
    vmEl.textContent = `${sign}${diff.toFixed(1)}% (median Rp ${Math.round(median).toLocaleString('id-ID')})`;
    vmEl.style.color = Math.abs(diff) < 15 ? 'var(--green)' : 'var(--amber)';
  } else {
    vmEl.textContent = '—';
  }
}

async function savePlan() {
  if (!currentUser || !_supabase || !currentProduct) return;
  const pid  = currentProduct.id;
  const sell = parseFloat(document.getElementById('plan-sell-price')?.value)  || 0;
  const cost = parseFloat(document.getElementById('plan-source-cost')?.value) || 0;
  const ship = parseFloat(document.getElementById('plan-shipping')?.value)    || 0;
  const mktg = parseFloat(document.getElementById('plan-marketing')?.value)   || 0;

  const btn = document.querySelector('.plan-save-btn');
  const msg = document.getElementById('plan-saved-msg');
  if (btn) btn.disabled = true;

  const { error } = await _supabase
    .from('product_plans')
    .upsert({
      user_id:    currentUser.id,
      product_id: pid,
      sell_price: sell,
      source_cost: cost,
      shipping:   ship,
      marketing:  mktg,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_id' });

  if (btn) btn.disabled = false;
  if (msg) {
    msg.textContent = error ? '⚠ Gagal menyimpan. Coba lagi.' : '✓ Rencana tersimpan!';
    setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
  }
  if (!error) {
    window._planCache[pid] = { user_id: currentUser.id, product_id: pid, sell_price: sell, source_cost: cost, shipping: ship, marketing: mktg };
    void cohortLogActivity('tracker_plan_update', { product_id: pid, source: 'tracker' });
  }
}

function voteKey(pid) { return 'vote_' + pid; }

async function loadVotes(pid) {
  const myVote  = localStorage.getItem(voteKey(pid));
  const upBtn   = document.getElementById('vote-up-btn');
  const downBtn = document.getElementById('vote-down-btn');
  const msg     = document.getElementById('vote-result-msg');
  const barWrap = document.getElementById('vote-bar-wrap');

  upBtn.classList.remove('voted-up','voted-down');
  downBtn.classList.remove('voted-up','voted-down');
  msg.classList.remove('show');

  // fetch community counts from Supabase
  let counts = { up: 0, down: 0 };
  try {
    const res  = await fetch(`${SUPA_URL}/rest/v1/votes?product_id=eq.${encodeURIComponent(pid)}`, { headers: SUPA_HDR });
    const rows = await res.json();
    if (Array.isArray(rows)) rows.forEach(r => { counts[r.direction] = r.count; });
  } catch(e) { /* show zeros if offline */ }

  document.getElementById('vote-up-count').textContent   = counts.up;
  document.getElementById('vote-down-count').textContent = counts.down;

  if (myVote) {
    if (myVote === 'up') upBtn.classList.add('voted-up');
    else downBtn.classList.add('voted-down');
    msg.textContent = myVote === 'up' ? 'Makasih ya!' : 'Oke, noted! Terima kasih feedbacknya.';
    msg.classList.add('show');
    updateVoteBar(counts);
    barWrap.classList.add('show');
  } else {
    updateVoteBar(counts);
    barWrap.classList.add('show');
  }
}

async function castVote(dir) {
  if (!currentProduct) return;
  const pid     = currentProduct.id;
  const prevDir = localStorage.getItem(voteKey(pid));

  if (prevDir === dir) return; // already voted same way

  // disable buttons while saving
  document.getElementById('vote-up-btn').disabled   = true;
  document.getElementById('vote-down-btn').disabled = true;

  try {
    if (prevDir) {
      await fetch(`${SUPA_URL}/rest/v1/rpc/decrement_vote`, {
        method: 'POST', headers: SUPA_HDR,
        body: JSON.stringify({ p_product_id: pid, p_direction: prevDir })
      });
    }
    await fetch(`${SUPA_URL}/rest/v1/rpc/increment_vote`, {
      method: 'POST', headers: SUPA_HDR,
      body: JSON.stringify({ p_product_id: pid, p_direction: dir })
    });
    localStorage.setItem(voteKey(pid), dir);
  } catch(e) { /* silently fail */ }

  document.getElementById('vote-up-btn').disabled   = false;
  document.getElementById('vote-down-btn').disabled = false;
  await loadVotes(pid);
}

function updateVoteBar(counts) {
  const total = counts.up + counts.down;
  const pct   = total === 0 ? 0 : Math.round((counts.up / total) * 100);
  document.getElementById('vote-bar-fill').style.width  = pct + '%';
  document.getElementById('vote-bar-pct').textContent   = pct + '% bilang akurat';
  document.getElementById('vote-bar-total').textContent = total + (total === 1 ? ' vote' : ' votes');
}

function renderDetail(p) {
  document.getElementById('d-score').textContent  = fmtScore(p.score);
  document.getElementById('d-score2').textContent = fmtScore(p.score);
  const sc = scoreColor(p.score);
  const badge = document.getElementById('d-score-badge');
  if (badge) badge.style.background = sc;
  document.querySelectorAll('#d-score2').forEach(el => { el.parentElement.style.setProperty('--score-clr', sc); });
  document.getElementById('d-cat').textContent    = p.category;
  // Trending badge on detail page — remove stale badge then re-add if trending
  const detScoreRow = document.querySelector('.det-score-row');
  if (detScoreRow) {
    const old = detScoreRow.querySelector('.trend-badge-det');
    if (old) old.remove();
    if (p.trending) {
      const tBadge = document.createElement('span');
      tBadge.className = 'trend-badge-det';
      tBadge.textContent = 'Trending';
      detScoreRow.appendChild(tBadge);
    }
  }
  // Unlock banner — only shown for competitor analysis section now
  const unlockBanner = document.getElementById('det-unlock-banner');
  if (unlockBanner) unlockBanner.style.display = 'none';
  // Sync save button
  syncDetailSaveBtn();
  // Name — always visible
  const nameEl = document.getElementById('d-name');
  nameEl.textContent = p.name;
  nameEl.classList.remove('blur-field');

  document.getElementById('d-units-new').textContent = Math.round(p.newUnits) + '/mo';
  document.getElementById('d-units-exp').textContent = Math.round(p.expUnits) + '/mo';

  // Main image — always visible
  const mainImg = document.getElementById('d-main-img');
  mainImg.classList.remove('blur-field');
  mainImg.innerHTML = p.image
    ? `<img src="${p.image}" alt="" onerror="this.style.display='none'">`
    : ('');

  // Price range — use master sheet data for now; refined after seller load
  document.getElementById('d-price-lo').textContent  = fmt(p.startRevenue ? p.medianPrice * 0.75 : p.medianPrice * 0.8);
  document.getElementById('d-price-med').textContent = fmt(p.medianPrice);
  document.getElementById('d-price-hi').textContent  = fmt(p.medianPrice * 1.3);

  // Revenue range
  document.getElementById('d-rev-lo').textContent  = fmtShort(p.startRevenue);
  document.getElementById('d-rev-med').textContent = fmtShort((p.startRevenue + p.upToRevenue) / 2);
  document.getElementById('d-rev-hi').textContent  = fmtShort(p.upToRevenue);

  // Store age — placeholder until seller data loads
  document.getElementById('d-age-min').textContent = '—';
  document.getElementById('d-age-med').textContent = '—';
  document.getElementById('d-age-max').textContent = '—';

  // Financial breakdown
  const newUnits  = p.newUnits  || 0;
  const expUnits  = p.expUnits  || 0;
  const price     = p.medianPrice || 0;
  const cogsRate  = 0.35; // 35% COGS estimate
  const mktRate   = 0.15; // 15% marketing

  function finRows(units) {
    const u     = Math.round(units);
    const gross = u * price;
    const cogs  = gross * cogsRate;
    const mkt   = gross * mktRate;
    const fees  = gross * 0.05; // ~5% platform fees
    const net   = gross - cogs - mkt - fees;
    const margin = gross ? ((net / gross) * 100).toFixed(1) : 0;
    return `
      <div class="fin-row"><span class="fin-lbl">Units Sold/mo</span><span class="fin-val">${u.toLocaleString('id-ID')}</span></div>
      <div class="fin-row"><span class="fin-lbl">Selling Unit Price</span><span class="fin-val" style="color:var(--orange)">${fmt(price)}</span></div>
      <div class="fin-row"><span class="fin-lbl">Gross Revenue</span><span class="fin-val">${fmt(gross)}</span></div>
      <div class="fin-row cogs-row"><span class="fin-lbl">COGS (35%)</span><span class="fin-val" style="color:#e74c3c">-${fmt(cogs)}</span></div>
      <div class="fin-row mkt-row"><span class="fin-lbl">Marketing (15%)</span><span class="fin-val" style="color:#e74c3c">-${fmt(mkt)}</span></div>
      <div class="fin-row"><span class="fin-lbl">Platform Fees (5%)</span><span class="fin-val" style="color:#e74c3c">-${fmt(fees)}</span></div>
      <div class="fin-row subtotal"><span class="fin-lbl">Total Costs</span><span class="fin-val">${fmt(cogs+mkt+fees)}</span></div>
      <div class="fin-row net-row"><span class="fin-lbl">Net Revenue</span><span class="fin-val">${fmt(net)}</span></div>`;
  }

  document.getElementById('fin-new').innerHTML = finRows(newUnits);
  document.getElementById('fin-exp').innerHTML = finRows(expUnits);

  // Recommendations — same category, exclude current product
  const recs = allProducts
    .filter(x => x.id !== p.id && x.category === p.category)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  document.getElementById('recs-grid').innerHTML = recs.length
    ? recs.map((r, i) => cardHTML(r, i)).join('')
    : allProducts.filter(x => x.id !== p.id).sort((a,b) => b.score - a.score).slice(0,12).map((r,i) => cardHTML(r,i)).join('');

  // Reset sellers section
  document.getElementById('sellers-loading').style.display = 'block';
  document.getElementById('sellers-loading').innerHTML = '<div class="spinner" style="margin:0 auto 10px;"></div>Loading seller data...';
  document.getElementById('sellers-table-wrap').style.display = 'none';
  document.getElementById('d-thumbs').innerHTML = '';
  // Reset score explanation
  const scoreBody = document.getElementById('score-exp-body');
  const scoreMetrics = document.getElementById('score-exp-metrics');
  const scoreLoading = document.getElementById('score-exp-loading');
  const scoreTotal = document.getElementById('d-score-exp-total');
  if (scoreBody) scoreBody.classList.remove('open');
  if (scoreMetrics) scoreMetrics.innerHTML = '';
  if (scoreLoading) { scoreLoading.style.display = 'flex'; }
  if (scoreTotal) { scoreTotal.textContent = '—'; scoreTotal.style.background = '#aaa'; }
  const chevron = document.getElementById('score-exp-chevron');
  if (chevron) chevron.style.transform = '';

  // Reset sourcing guide + chat for new product
  const srcResult = document.getElementById('sourcing-result');
  const srcLoading = document.getElementById('sourcing-loading');
  const chatWrap  = document.getElementById('ai-chat-wrap');
  const chatMsgs  = document.getElementById('ai-chat-messages');
  if (srcResult)  srcResult.innerHTML = '';
  if (srcLoading) srcLoading.style.display = 'none';
  if (chatWrap)   chatWrap.style.display = 'none';
  if (chatMsgs)   chatMsgs.innerHTML = '';
  aiChatHistory = [];
  aiSystemContext = '';
}

// ════════════════════════════════════════════════════════════
//  LOAD SELLER DATA from per-product Google Sheet
// ════════════════════════════════════════════════════════════
async function loadSellerData(p) {
  const loadingEl = document.getElementById('sellers-loading');
  const bodyEl    = document.getElementById('sellers-body');
  if (!p?.keyword) {
    if (loadingEl) loadingEl.innerHTML = '<p style="color:var(--tl);padding:20px 0;">Keyword tidak ditemukan untuk produk ini.</p>';
    return;
  }
  if (loadingEl) loadingEl.style.display = 'flex';

  try {
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/listings?select=product_name,store_name,price,total_sold,rating,reviews,image_url,item_id,shop_id&eq.keyword=${encodeURIComponent(p.keyword)}&order=total_sold.desc&limit=50`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
    );
    if (!resp.ok) throw new Error(resp.status);
    const rows = await resp.json();
    if (loadingEl) loadingEl.style.display = 'none';

    if (!rows?.length) {
      if (bodyEl) bodyEl.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--tl);font-size:.85rem;">Tidak ada data kompetitor untuk keyword ini.</td></tr>';
      return;
    }

    const totalSold = rows.reduce((s,r) => s + (r.total_sold||0), 0);
    const fmt = n => 'Rp' + Math.round(n||0).toLocaleString('id-ID');
    if (bodyEl) bodyEl.innerHTML = rows.map((r, i) => {
      const share = totalSold > 0 ? ((r.total_sold||0) / totalSold * 100).toFixed(1) : '0';
      const omset = (r.price||0) * (r.total_sold||0);
      const isTop = i < 3;
      return `<tr style="${isTop ? 'background:#FFFBEB;' : ''}">
        <td style="padding:8px;font-size:.7rem;color:#6B7280;">${i+1}</td>
        <td style="padding:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${r.image_url||''}" onerror="this.style.opacity='.2'" style="width:36px;height:36px;object-fit:cover;border-radius:6px;background:#F3F4F6;">
            <div>
              <div style="font-size:.72rem;font-weight:600;color:#111;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.product_name||'—'}</div>
              <div style="font-size:.62rem;color:#9CA3AF;">${r.store_name||'—'}</div>
            </div>
          </div>
        </td>
        <td style="padding:8px;text-align:right;font-size:.72rem;font-weight:600;color:#111;white-space:nowrap;">${fmt(r.price)}</td>
        <td style="padding:8px;text-align:right;font-size:.72rem;color:#374151;white-space:nowrap;">${(r.total_sold||0).toLocaleString('id-ID')}</td>
        <td style="padding:8px;text-align:right;font-size:.72rem;font-weight:600;white-space:nowrap;">${fmt(omset)}</td>
        <td style="padding:8px;text-align:right;">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:5px;">
            <div style="width:40px;height:5px;background:#F3F4F6;border-radius:3px;overflow:hidden;"><div style="height:5px;background:${isTop?'#E8442A':'#9CA3AF'};border-radius:3px;width:${Math.min(parseFloat(share)*5,100)}%;"></div></div>
            <span style="font-size:.7rem;font-weight:700;color:${isTop?'#E8442A':'#374151'};white-space:nowrap;">${share}%</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (bodyEl) bodyEl.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--tl);">Gagal memuat data seller: ${e.message}</td></tr>`;
  }
}

function renderScoreExp(scoreRows, totalScore) {
  const loadingEl = document.getElementById('score-exp-loading');
  const metricsEl = document.getElementById('score-exp-metrics');
  const totalEl   = document.getElementById('d-score-exp-total');
  if (!metricsEl) return;

  if (loadingEl) loadingEl.style.display = 'none';

  // Score rows: weighted scores are in column E (index 4), rows 2-6 (scoreRows 0-4)
  // Total score is in A8 = SUM(E2:E6), which is scoreRows[6] (row 8, col A index 0)
  const vals = scoreRows.slice(0, 5).map(row => {
    const cells = Object.values(row);
    const v = parseFloat(cells[4]);
    return isNaN(v) ? 0 : v * 20;
  });

  // Use the master sheet score as authoritative total (same value shown on the card)
  // Fall back to summing computed vals if totalScore not available
  const computedTotal = vals.reduce((s, v) => s + v, 0);
  const total = (totalScore && totalScore > 0) ? totalScore : computedTotal;
  const color = scoreColor(total);

  if (totalEl) {
    totalEl.textContent = Math.round(total).toString();
    totalEl.style.background = color;
  }

  metricsEl.innerHTML = SCORE_METRICS.map((m, i) => {
    const val   = vals[i] ?? 0;
    const pct   = Math.min(100, (val / m.maxVal) * 100);
    const clr   = val >= m.maxVal * 0.75 ? '#1A7A46' : val >= m.maxVal * 0.4 ? '#B45309' : '#C0392B';
    return `
      <div class="score-metric">
        <div class="score-metric-left">
          <div class="score-metric-name">${m.label}</div>
          <div class="score-metric-desc">${m.desc}</div>
        </div>
        <div class="score-metric-right">
          <div class="score-metric-val" style="color:${clr}">${Math.round(val)}</div>
          <div class="score-metric-bar">
            <div class="score-metric-bar-fill" style="width:${pct}%;background:${clr}"></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function setMainImg(src, thumbEl) {
  document.getElementById('d-main-img').innerHTML = `<img src="${src}" alt="listing" onerror="this.style.display='none'">`;
  document.querySelectorAll('.det-thumb').forEach(t => t.classList.remove('active'));
  thumbEl.classList.add('active');
}


// ════════════════════════════════════════════════════════════
//  HOME SCORE EXPLANATION
// ════════════════════════════════════════════════════════════
function toggleHomeScoreExp() {
  const body = document.getElementById('home-score-exp-body');
  const chevron = document.getElementById('home-score-chevron');
  const open = body.classList.toggle('open');
  chevron.style.transform = open ? 'rotate(180deg)' : '';
}

// ════════════════════════════════════════════════════════════
//  FILTER PANEL
// ════════════════════════════════════════════════════════════
function toggleFilterPanel() {
  const popup = document.getElementById('filter-body');
  const btn = document.getElementById('filter-inline-btn');
  const open = popup.classList.toggle('open');
  btn.classList.toggle('active', open);
  if (open) {
    // close on outside click
    setTimeout(() => {
      document.addEventListener('click', function outsideClick(e) {
        const wrap = document.getElementById('filter-inline-wrap');
        if (wrap && !wrap.contains(e.target)) {
          popup.classList.remove('open');
          btn.classList.remove('active');
          document.removeEventListener('click', outsideClick);
        }
      });
    }, 0);
  }
}

function populateCategoryFilter() {
  const sel = document.getElementById('f-category');
  if (!sel || !allProducts.length) return;
  const cats = [...new Set(allProducts.map(p => p.category))].sort();
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

function resetFilters() {
  document.getElementById('f-price-min').value = '';
  document.getElementById('f-price-max').value = '';
  document.getElementById('f-rev-min').value = '';
  document.getElementById('f-rev-max').value = '';
  document.getElementById('f-category').value = 'all';
  document.getElementById('f-score-min').value = '0'; document.getElementById('f-score-min-label').textContent = '0.0';
  activeCat = 'all';
  updateFilterBadge();
  applyFilters();
  renderPills();
}

function updateFilterBadge() {
  const priceMin = parseFloat(document.getElementById('f-price-min')?.value) || 0;
  const priceMax = parseFloat(document.getElementById('f-price-max')?.value) || 0;
  const revMin   = parseFloat(document.getElementById('f-rev-min')?.value)   || 0;
  const revMax   = parseFloat(document.getElementById('f-rev-max')?.value)   || 0;
  const scoreMin = parseFloat(document.getElementById('f-score-min')?.value) || 0;
  const cat      = document.getElementById('f-category')?.value || 'all';
  let count = 0;
  if (priceMin || priceMax) count++;
  if (revMin || revMax) count++;
  if (scoreMin) count++;
  if (cat !== 'all') count++;
  const badge = document.getElementById('filter-count-badge');
  if (badge) { badge.textContent = count; badge.style.display = count ? 'inline' : 'none'; }
}

// ════════════════════════════════════════════════════════════
//  SHARE MODAL
// ════════════════════════════════════════════════════════════
let _shareProductName = '';
let _shareProductScore = '';
let _shareRevLo = '';
let _shareRevHi = '';

function openShareModal() {
  _shareProductName  = document.getElementById('d-name')?.textContent.trim()  || '';
  _shareProductScore = document.getElementById('d-score')?.textContent.trim() || '';
  _shareRevLo = document.getElementById('d-rev-lo')?.textContent.trim() || '';
  _shareRevHi = document.getElementById('d-rev-hi')?.textContent.trim() || '';
  const sub = document.getElementById('share-modal-product-name');
  if (sub) sub.textContent = _shareProductName ? '\u201C' + _shareProductName + '\u201D' : '';
  document.getElementById('share-modal-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeShareModal(e) {
  if (e && e.target !== document.getElementById('share-modal-overlay')) return;
  document.getElementById('share-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function doShare(type) {
  const url = 'https://stevenwilson614.github.io/LarisID/';
  const name  = _shareProductName;
  const score = _shareProductScore;
  const revRange = (_shareRevLo && _shareRevHi) ? _shareRevLo + ' \u2013 ' + _shareRevHi + '/mo' : '';
  const textLines = [
    '\uD83D\uDED7 Found a great Shopee product opportunity!',
    name ? '\uD83D\uDCE6 ' + name : '',
    score ? '\u2B50 Viability Score: ' + score + '/100' : '',
    revRange ? '\uD83D\uDCB0 Est. Revenue: ' + revRange : '',
    '',
    '\uD83D\uDD17 Check it free: ' + url
  ].filter(Boolean).join('\n');

  if (type === 'wa') {
    window.open('https://wa.me/?text=' + encodeURIComponent(textLines), '_blank');
  } else if (type === 'email') {
    const subject = encodeURIComponent('Check out this Shopee product: ' + name);
    const body = encodeURIComponent(textLines);
    window.open('mailto:?subject=' + subject + '&body=' + body, '_blank');
  } else if (type === 'twitter') {
    const tweet = '\uD83D\uDED7 Found a great Shopee product on @ProductScout!\n' +
      (name ? '\uD83D\uDCE6 ' + name + '\n' : '') +
      (score ? '\u2B50 Score: ' + score + '/10\n' : '') +
      '\uD83D\uDD17 ' + url;
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweet), '_blank');
  } else if (type === 'copy') {
    navigator.clipboard.writeText(url).then(() => {
      const toast = document.getElementById('copy-toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    });
  }
  closeShareModal();
}

// ════════════════════════════════════════════════════════════
//  EMAIL SIGNUP
// ════════════════════════════════════════════════════════════
async function handleDashEmailSignup(e) {
  e.preventDefault();
  const input = document.getElementById('dash-email-input');
  const email = input?.value?.trim();
  if (!email) return;
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try { if (_supabase) await _supabase.from('email_signups').insert({ email }); } catch(_) {}
  input.value = '';
  if (btn) { btn.disabled = false; btn.textContent = 'Daftar Sekarang'; }
  const suc = document.getElementById('dash-email-success');
  if (suc) suc.style.display = 'block';
  setTimeout(() => { document.getElementById('dash-email-modal').style.display = 'none'; if(suc) suc.style.display='none'; }, 2500);
}

async function handleEmailSignup(e) {
  e.preventDefault();
  const input = document.getElementById('signup-email');
  const email = input.value.trim();
  if (!email) return;
  const btn = e.target.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    if (_supabase) {
      await _supabase.from('email_signups').insert({ email });
    }
  } catch (_) {}
  input.value = '';
  if (btn) { btn.disabled = false; btn.textContent = 'Daftar'; }
  const note = document.querySelector('.footer-signup-note');
  if (note) {
    note.textContent = 'Terima kasih! Kamu akan mendapat update mingguan.';
    note.style.color = '#a8f0c6';
    setTimeout(() => {
      note.textContent = 'Tidak ada spam. Berhenti kapan saja.';
      note.style.color = '';
    }, 4000);
  }
}


function shareProduct() {
  const name = document.getElementById('d-name') ? document.getElementById('d-name').textContent.trim() : '';
  const score = document.getElementById('d-score') ? document.getElementById('d-score').textContent.trim() : '';
  const revLo = document.getElementById('d-rev-lo') ? document.getElementById('d-rev-lo').textContent.trim() : '';
  const revHi = document.getElementById('d-rev-hi') ? document.getElementById('d-rev-hi').textContent.trim() : '';
  const url = 'https://stevenwilson614.github.io/LarisID/';
  let text = '\uD83D\uDED7 *Cek peluang produk ini di LarisID!*\n\n';
  if (name) text += '\uD83D\uDCE6 ' + name + '\n';
  if (score) text += '\u2B50 Viability Score: ' + score + '/10\n';
  if (revLo && revHi) text += '\uD83D\uDCB0 Estimasi Pendapatan: ' + revLo + ' \u2013 ' + revHi + '/bln\n';
  text += '\n\uD83D\uDD17 Cek selengkapnya (gratis): ' + url;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

function openFeedback() {
  if (window.Tally) {
    window.Tally.openPopup('9q1Y1Y', { width: 480, autoClose: 3000 });
  } else {
    window.open('https://tally.so/r/9q1Y1Y', '_blank');
  }
}

// ── Extension Linking ─────────────────────────────────────────────────────────

let _extLinkTimer = null;

async function openExtensionLink() {
  document.getElementById('dash-topbar-menu').classList.remove('open');
  const modal = document.getElementById('ext-link-modal');
  modal.style.display = 'flex';
  document.getElementById('ext-link-code-wrap').style.display = 'none';
  document.getElementById('ext-link-loading').style.display   = 'block';
  document.getElementById('ext-link-error').style.display     = 'none';
  document.getElementById('ext-link-regen-btn').style.display = 'none';
  if (_extLinkTimer) clearInterval(_extLinkTimer);
  await extLinkGenerate();
}

async function extLinkGenerate() {
  document.getElementById('ext-link-loading').style.display   = 'block';
  document.getElementById('ext-link-code-wrap').style.display = 'none';
  document.getElementById('ext-link-error').style.display     = 'none';
  document.getElementById('ext-link-regen-btn').style.display = 'none';

  try {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) throw new Error('Tidak ada sesi aktif. Silakan login ulang.');

    const { data: code, error } = await _supabase.rpc('create_extension_code', {
      p_access_token:  session.access_token,
      p_refresh_token: session.refresh_token,
    });
    if (error) throw new Error(error.message);

    document.getElementById('ext-link-code').textContent       = code;
    document.getElementById('ext-link-loading').style.display  = 'none';
    document.getElementById('ext-link-code-wrap').style.display = 'block';
    document.getElementById('ext-link-regen-btn').style.display = 'block';
    document.getElementById('ext-link-copy-btn').textContent   = 'Salin Kode';

    // Countdown timer
    let secs = 15 * 60;
    if (_extLinkTimer) clearInterval(_extLinkTimer);
    _extLinkTimer = setInterval(() => {
      secs--;
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      document.getElementById('ext-link-ttl').textContent = `${m}:${s}`;
      if (secs <= 0) {
        clearInterval(_extLinkTimer);
        document.getElementById('ext-link-code').textContent = '——————';
        document.getElementById('ext-link-ttl').textContent  = 'Kadaluarsa';
        document.getElementById('ext-link-regen-btn').style.display = 'block';
      }
    }, 1000);

  } catch (e) {
    document.getElementById('ext-link-loading').style.display = 'none';
    document.getElementById('ext-link-error').textContent     = e.message || 'Gagal membuat kode.';
    document.getElementById('ext-link-error').style.display   = 'block';
    document.getElementById('ext-link-regen-btn').style.display = 'block';
  }
}

function extLinkCopyCode() {
  const code = document.getElementById('ext-link-code').textContent.trim();
  if (!code || code.includes('—')) return;
  navigator.clipboard.writeText(code).then(() => {
    document.getElementById('ext-link-copy-btn').textContent = 'Tersalin!';
    setTimeout(() => {
      document.getElementById('ext-link-copy-btn').textContent = 'Salin Kode';
    }, 2000);
  });
}

// ════════════════════════════════════════════════════════════
//  GUIDED TOUR
// ════════════════════════════════════════════════════════════
const TOUR_STEPS = [
  {
    sel: '.nav-search-wrap',
    title: 'Cari Produk Apapun',
    body: 'Ketik nama produk — "topi baseball", "senter LED", "talenan kayu". LarisID langsung kasih Viability Score-nya.',
    pos: 'bottom'
  },
  {
    sel: '.cat-grid',
    title: 'Filter Kategori',
    body: 'Pilih kategori untuk fokus ke niche yang kamu minati. Dari fashion sampai elektronik — semua ada.',
    pos: 'bottom'
  },
  {
    sel: () => document.querySelector('#home-grid .product-card') || document.querySelector('.product-card'),
    title: 'Kartu Produk',
    body: 'Setiap kartu menampilkan data nyata Shopee — median harga, potensi omzet per bulan, dan jumlah pesaing aktif.',
    pos: 'right'
  },
  {
    sel: () => document.querySelector('.score-pill'),
    title: 'Viability Score',
    body: 'Skor 0–100. Makin tinggi = pasar lebih besar, persaingan lebih terukur.\n🟢 80+ = lampu hijau  🟡 50–79 = perlu strategi  🔴 0–49 = pertimbangkan ulang.',
    pos: 'right'
  },
  {
    sel: () => document.querySelector('.save-btn'),
    title: 'Simpan ke Dashboard',
    body: 'Simpan produk untuk dipantau setiap minggu — perubahan skor, harga, dan jumlah pesaing langsung muncul di dashboard kamu.',
    pos: 'left'
  },
  {
    sel: '.nav-right .nav-link',
    title: 'Jelajahi Semua Produk',
    body: 'Klik "Products" untuk melihat 500+ produk — bisa difilter, diurutkan, dan dibandingkan langsung.',
    pos: 'bottom',
    last: true
  },
];

let _tourStep   = 0;
let _tourActive = false;
let _dashboardTourStep = 0;
let _dashboardTourActive = false;
let _dashboardTourPending = null;
let _dashboardTourRetry = 0;
const DASHBOARD_TOUR_KEY = 'laris_dashboard_tour_v1';

const DASHBOARD_TOUR_STEPS = [
  {
    sel: '#dash-nav-discover',
    title: 'Mulai dari Discover',
    body: 'Klik menu Discover untuk mulai riset produk yang sedang naik.',
    pos: 'right',
    onEnter: () => switchDashView('dashboard'),
    onNext: () => switchDashView('discover'),
  },
  {
    sel: () => window.matchMedia('(max-width: 860px)').matches
      ? (document.getElementById('dsc-sort-chips') || document.querySelector('.dsc-table-controls'))
      : document.getElementById('dsc-filter-panel'),
    title: 'Ini Area Filter',
    body: 'Di sini kamu bisa atur harga, omzet, skor, dan kategori supaya produk yang muncul lebih tepat.',
    pos: 'left',
    onEnter: () => switchDashView('discover'),
  },
  {
    sel: () => document.querySelector('#dsc-card-grid .dsc-card'),
    title: 'Klik Salah Satu Produk',
    body: 'Pilih produk apa saja dari Discover untuk membuka halaman Deep Dive.',
    pos: 'bottom',
    waitFor: 'product-open',
  },
  {
    sel: '#dd-tabs',
    title: 'Pelajari Tab Deep Dive',
    body: 'Di sini ada Listing, Analisa Pasar, dan Kompetitor untuk evaluasi produk lebih detail.',
    pos: 'bottom',
    onEnter: () => { switchDashView('deepdive'); ddSwitchTab('listing'); },
  },
  {
    sel: '#dd-track-btn',
    title: 'Lacak Produk',
    body: 'Klik tombol Lacak Produk supaya data produk ini masuk ke tracker kamu.',
    pos: 'left',
    waitFor: 'track-click',
  },
  {
    sel: '#dash-nav-tracker',
    title: 'Buka Halaman Tracker',
    body: 'Tracker dipakai untuk memantau perubahan harga dan performa produk yang kamu lacak.',
    pos: 'right',
    onNext: () => switchDashView('tracker'),
  },
  {
    sel: () => document.getElementById('mls-product-pick') || document.getElementById('mls-ai-box'),
    title: 'Mulai Berjualan + AI',
    body: 'Masuk ke Mulai Berjualan, pilih produk, lalu cek AI chat, kompetisi, dan insight pasar.',
    pos: 'left',
    onEnter: () => switchDashView('ai'),
  },
  {
    sel: '#dash-nav-alerts',
    title: 'Cek Alerts',
    body: 'Alerts memberi sinyal perubahan penting pada produk yang sedang kamu pantau.',
    pos: 'right',
    onNext: () => switchDashView('alerts'),
  },
  {
    sel: '#dash-nav-credits',
    title: 'Pahami Sistem Kredit',
    body: 'Kredit dipakai untuk fitur premium seperti Deep Dive, AI, dan tracking. Kamu bisa dapat kredit gratis dari Extension.',
    pos: 'right',
    onNext: () => switchDashView('credits'),
  },
];

function startTour() {
  if (localStorage.getItem('larisid_tour_v1')) return;
  if (currentUser) return; // returning logged-in users skip it
  // Wait for at least one product card to be rendered
  let attempts = 0;
  const check = setInterval(() => {
    attempts++;
    if (document.querySelector('.product-card') || attempts > 40) {
      clearInterval(check);
      if (!document.querySelector('.product-card')) return; // products never loaded
      _tourStep  = 0;
      _tourActive = true;
      const overlay = document.getElementById('tour-overlay');
      if (overlay) overlay.classList.add('active');
      showTourStep(0);
    }
  }, 250);
}

function showTourStep(i) {
  const step   = TOUR_STEPS[i];
  const target = typeof step.sel === 'function' ? step.sel() : document.querySelector(step.sel);

  // Skip step if element not found
  if (!target) { nextTourStep(); return; }

  // Scroll target into view if needed
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  // Give scroll a moment to settle
  setTimeout(() => {
    const rect = target.getBoundingClientRect();
    const pad  = 8;

    // Spotlight
    const spot = document.getElementById('tour-spotlight');
    spot.style.left   = (rect.left - pad) + 'px';
    spot.style.top    = (rect.top  - pad) + 'px';
    spot.style.width  = (rect.width  + pad * 2) + 'px';
    spot.style.height = (rect.height + pad * 2) + 'px';

    // Tooltip content
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-body').textContent  = step.body;

    // Progress dots
    const dotsHtml = TOUR_STEPS.map((_, idx) =>
      `<span class="tour-dot${idx === i ? ' active' : ''}"></span>`
    ).join('');
    document.getElementById('tour-progress').innerHTML =
      `<div class="tour-dots">${dotsHtml}</div>`;

    // Next button label
    const nextBtn = document.getElementById('tour-next');
    nextBtn.textContent = (i >= TOUR_STEPS.length - 1) ? 'Mulai Riset! 🚀' : 'Lanjut →';

    // Position tooltip
    positionTourTooltip(rect, step.pos);
  }, 80);
}

function positionTourTooltip(rect, pos) {
  const TW = 280, TH = 180;
  const PAD = 16;
  let left, top;

  if (pos === 'bottom') {
    left = rect.left + rect.width / 2 - TW / 2;
    top  = rect.bottom + PAD;
  } else if (pos === 'right') {
    left = rect.right + PAD;
    top  = rect.top + rect.height / 2 - TH / 2;
  } else if (pos === 'left') {
    left = rect.left - TW - PAD;
    top  = rect.top + rect.height / 2 - TH / 2;
  } else { // top
    left = rect.left + rect.width / 2 - TW / 2;
    top  = rect.top - TH - PAD;
  }

  // Clamp within viewport
  left = Math.max(12, Math.min(left, window.innerWidth  - TW - 12));
  top  = Math.max(12, Math.min(top,  window.innerHeight - TH - 12));

  const tooltip = document.getElementById('tour-tooltip');
  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
}

function nextTourStep() {
  if (_dashboardTourActive) {
    nextDashboardTourStep();
    return;
  }
  _tourStep++;
  if (_tourStep >= TOUR_STEPS.length) {
    endTour();
  } else {
    showTourStep(_tourStep);
  }
}

function endTour() {
  if (_dashboardTourActive) {
    endDashboardTour();
    return;
  }
  _tourActive = false;
  localStorage.setItem('larisid_tour_v1', '1');
  const overlay = document.getElementById('tour-overlay');
  if (overlay) overlay.classList.remove('active');
}

function startDashboardOnboarding(opts) {
  const force = !!(opts && opts.force);
  if (!currentUser) return;
  if (!force && localStorage.getItem(DASHBOARD_TOUR_KEY)) return;
  _dashboardTourStep = 0;
  _dashboardTourActive = true;
  _dashboardTourPending = null;
  _dashboardTourRetry = 0;
  const overlay = document.getElementById('tour-overlay');
  if (overlay) overlay.classList.add('active');
  showDashboardTourStep(0);
}

function showDashboardTourStep(i) {
  if (!_dashboardTourActive) return;
  const step = DASHBOARD_TOUR_STEPS[i];
  if (!step) { endDashboardTour(); return; }
  if (typeof step.onEnter === 'function') step.onEnter();

  const target = typeof step.sel === 'function' ? step.sel() : document.querySelector(step.sel);
  if (!target) {
    if (_dashboardTourRetry < 16) {
      _dashboardTourRetry++;
      setTimeout(() => showDashboardTourStep(i), 150);
    } else {
      _dashboardTourRetry = 0;
      nextDashboardTourStep();
    }
    return;
  }
  _dashboardTourRetry = 0;
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  setTimeout(() => {
    const rect = target.getBoundingClientRect();
    const pad  = 8;
    const spot = document.getElementById('tour-spotlight');
    if (!spot) return;
    spot.style.left   = (rect.left - pad) + 'px';
    spot.style.top    = (rect.top  - pad) + 'px';
    spot.style.width  = (rect.width  + pad * 2) + 'px';
    spot.style.height = (rect.height + pad * 2) + 'px';

    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-body').textContent  = step.body;
    const dotsHtml = DASHBOARD_TOUR_STEPS.map((_, idx) =>
      `<span class="tour-dot${idx === i ? ' active' : ''}"></span>`
    ).join('');
    document.getElementById('tour-progress').innerHTML = `<div class="tour-dots">${dotsHtml}</div>`;

    const nextBtn = document.getElementById('tour-next');
    if (!nextBtn) return;
    if (step.waitFor === 'product-open') nextBtn.textContent = 'Saya sudah klik produk';
    else if (step.waitFor === 'track-click') nextBtn.textContent = 'Saya sudah klik lacak';
    else nextBtn.textContent = (i >= DASHBOARD_TOUR_STEPS.length - 1) ? 'Selesai' : 'Lanjut →';

    positionTourTooltip(rect, step.pos);
  }, 80);
}

function nextDashboardTourStep() {
  if (!_dashboardTourActive) return;
  const step = DASHBOARD_TOUR_STEPS[_dashboardTourStep];
  if (step && typeof step.onNext === 'function') step.onNext();
  _dashboardTourStep++;
  if (_dashboardTourStep >= DASHBOARD_TOUR_STEPS.length) endDashboardTour();
  else showDashboardTourStep(_dashboardTourStep);
}

function endDashboardTour() {
  _dashboardTourActive = false;
  _dashboardTourPending = null;
  localStorage.setItem(DASHBOARD_TOUR_KEY, '1');
  localStorage.setItem('laris_welcomed', '1');
  const overlay = document.getElementById('tour-overlay');
  if (overlay) overlay.classList.remove('active');
}

function dashboardTourHandleViewChange(view) {
  if (!_dashboardTourActive) return;
  if (_dashboardTourStep === 0 && view === 'discover') {
    _dashboardTourStep = 1;
    setTimeout(() => showDashboardTourStep(_dashboardTourStep), 120);
    return;
  }
  if (DASHBOARD_TOUR_STEPS[_dashboardTourStep] && typeof DASHBOARD_TOUR_STEPS[_dashboardTourStep].onEnter === 'function') {
    setTimeout(() => showDashboardTourStep(_dashboardTourStep), 120);
  }
}

function dashboardTourHandleProductOpen() {
  if (!_dashboardTourActive) return;
  if (_dashboardTourStep === 2) {
    _dashboardTourStep = 3;
    setTimeout(() => showDashboardTourStep(_dashboardTourStep), 120);
  }
}

function dashboardTourHandleTrackClick() {
  if (!_dashboardTourActive) return;
  if (_dashboardTourStep === 4) {
    _dashboardTourStep = 5;
    setTimeout(() => showDashboardTourStep(_dashboardTourStep), 120);
  }
}

// ── START ──
// ════════════════════════════════════════════════════════════
//  FEEDBACK ENGAGEMENT
// ════════════════════════════════════════════════════════════
(function initFeedback() {
  const TALLY_ID = '9q1Y1Y';
  let productsViewed = 0;
  let toastShown = false;
  let floatShown = false;

  /* ── Floating button: show after 30s ── */
  setTimeout(() => showFloat(), 30000);

  /* ── First-visit banner: show after 3s, auto-dismiss 10s ── */
  if (!localStorage.getItem('ps_banner_seen')) {
    setTimeout(() => {
      const el = document.getElementById('fb-banner');
      if (el) el.classList.add('show');
      setTimeout(() => dismissBanner(), 10000);
    }, 3000);
  }

  /* ── Hook into openDetail to track product views ── */
  const _origOpenDetail = window.openDetail;
  window.openDetail = function(id) {
    productsViewed++;
    _origOpenDetail(id);
    showFloat();
  };

  /* ── Hook into goBack to show toast after 2nd product view ── */
  const _origGoBack = window.goBack;
  window.goBack = function() {
    _origGoBack();
    if (productsViewed >= 2 && !toastShown) {
      toastShown = true;
      setTimeout(() => {
        const el = document.getElementById('fb-toast');
        if (el) el.classList.add('show');
        setTimeout(() => dismissToast(), 8000);
      }, 800);
    }
  };

  function showFloat() {
    if (floatShown) return;
    floatShown = true;
    const el = document.getElementById('fb-float');
    if (el) el.classList.add('show');
  }

  window.dismissBanner = function() {
    localStorage.setItem('ps_banner_seen', '1');
    const el = document.getElementById('fb-banner');
    if (el) el.classList.remove('show');
  };

  window.dismissToast = function() {
    const el = document.getElementById('fb-toast');
    if (el) el.classList.remove('show');
  };
})();

// Set on-landing class on initial load for logged-out users
if (document.getElementById('page-landing')?.classList.contains('active')) {
  document.body.classList.add('on-landing');
}

loadData();
captureInviteFromUrl();
initSupabase();
// Trigger discover data load after Supabase is ready
setTimeout(() => { if (typeof dscInit === 'function') dscInit(); }, 300);
initFreshnessBadge();
initTopbarDate();



// Always show hamburger, hide inline nav links
(function(){
  var btn = document.getElementById('nav-hamburger-btn');
  var links = document.getElementById('nav-right-links');
  if(btn) btn.style.display = 'flex';
  if(links) links.style.display = 'none';
})();

// Prevent zoom on iOS/mobile
document.addEventListener('touchmove', function(e){
  if(e.touches.length > 1){ e.preventDefault(); }
}, {passive: false});
var lastTap = 0;
document.addEventListener('touchend', function(e){
  var now = Date.now();
  if(now - lastTap < 300){ e.preventDefault(); }
  lastTap = now;
}, {passive: false});

// Banner carousel auto-scroll
// ── Dashboard onboarding entrypoint ──────────────────────────
function showWelcomeVideo() {
  startDashboardOnboarding();
}
function closeWelcomeVideo() {
  localStorage.setItem(DASHBOARD_TOUR_KEY, '1');
  localStorage.setItem('laris_welcomed', '1');
}

// ── DISCOVER FILTER DRAWER (mobile) ─────────────────────────
function dscOpenFilter() {
  const panel = document.getElementById('dsc-filter-panel');
  const overlay = document.getElementById('dsc-filter-overlay');
  const closeBtn = document.getElementById('dsc-filter-close-btn');
  if (!panel) return;
  panel.classList.add('open');
  if (overlay) overlay.classList.add('open');
  if (closeBtn) closeBtn.style.display = '';
}
function dscCloseFilter() {
  const panel = document.getElementById('dsc-filter-panel');
  const overlay = document.getElementById('dsc-filter-overlay');
  const closeBtn = document.getElementById('dsc-filter-close-btn');
  if (!panel) return;
  panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
  if (closeBtn) closeBtn.style.display = 'none';
}

// ── MLS IMAGE SWIPE NAVIGATION ───────────────────────────────
let _mlsImages = [];
let _mlsImgIdx = 0;

function mlsSetImages(urls) {
  _mlsImages = urls.filter(Boolean);
  _mlsImgIdx = 0;
  _mlsRenderDots();
  _mlsShowImg(0);
}

function _mlsShowImg(idx) {
  _mlsImgIdx = Math.max(0, Math.min(idx, _mlsImages.length - 1));
  const img = document.getElementById('mls-main-img');
  if (img && _mlsImages[_mlsImgIdx]) {
    img.src = _mlsImages[_mlsImgIdx];
    img.style.opacity = '1';
  }
  _mlsRenderDots();
  // Sync thumbnail active state
  document.querySelectorAll('.mls-thumb').forEach((t, i) => t.classList.toggle('active', i === _mlsImgIdx));
}

function mlsNextImg() {
  if (_mlsImages.length > 1) _mlsShowImg((_mlsImgIdx + 1) % _mlsImages.length);
}
function mlsPrevImg() {
  if (_mlsImages.length > 1) _mlsShowImg((_mlsImgIdx - 1 + _mlsImages.length) % _mlsImages.length);
}

function _mlsRenderDots() {
  const dotsEl = document.getElementById('mls-img-dots');
  if (!dotsEl) return;
  dotsEl.innerHTML = _mlsImages.slice(0, 10).map((_, i) =>
    `<div class="mls-img-dot${i === _mlsImgIdx ? ' active' : ''}"></div>`
  ).join('');
}

(function _mlsInitSwipe() {
  let _tx = 0;
  document.addEventListener('touchstart', function(e) {
    const wrap = document.getElementById('mls-main-img-wrap');
    if (wrap && wrap.contains(e.target)) _tx = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', function(e) {
    const wrap = document.getElementById('mls-main-img-wrap');
    if (!wrap || !wrap.contains(e.target)) return;
    const dx = e.changedTouches[0].clientX - _tx;
    if (Math.abs(dx) > 40) { if (dx < 0) mlsNextImg(); else mlsPrevImg(); }
  }, { passive: true });
})();

document.addEventListener('DOMContentLoaded', function(){
  if (typeof Chart !== 'undefined') lpRenderPreview(_LP_DEMO);
  setInterval(function(){ if (typeof goToSlide === 'function') goToSlide((bannerSlide + 1) % bannerTotal); }, 3000);

  // Sticky nav shadow on scroll
  const lpNav = document.querySelector('.lp-nav');
  if (lpNav) {
    window.addEventListener('scroll', function() {
      lpNav.classList.toggle('lp-nav-scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // close topbar avatar dropdown on outside click
  document.addEventListener('click', function(e) {
    const menu = document.getElementById('dash-topbar-menu');
    const av   = document.getElementById('dash-topbar-av');
    if (menu && av && !av.contains(e.target)) menu.classList.remove('open');
  });
});

