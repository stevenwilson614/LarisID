/* Marketplace fee table — the ONE source of truth for admin/komisi rates.
 *
 * Loaded as a plain global-defining script (no build step on this site) by
 * index.html before js/gpt-app.js, and by the static calculators under
 * /kalkulator/. Before this file existed the same numbers lived in two
 * different tables inside gpt-app.js (GPT_KALC_MPS for the Kalkulator Profit,
 * PLATFORM_FEES for the Deep Dive "Biaya" strip) and disagreed with each
 * other and with the SEO pages. Edit a rate HERE and nowhere else.
 *
 * All rates are ESTIMATES for a Non-Star / non-Mall seller. Every consumer
 * must keep the number user-editable and show UPDATED + the source link.
 */
window.LARIS_MP = (function () {
  'use strict';

  const UPDATED = 'September 2026';

  // The DB's canonical taxonomy (public.category_map, 18 buckets). Mirrors
  // category_map.sort_order. gpt-app.js reads this as DIR_CANON_CATS so the
  // Produk category rail and the calculator can never drift apart.
  const CANON_CATS = [
    'Rumah & Dekorasi', 'Dapur', 'Kamar Mandi', 'Fashion', 'Sepatu, Tas & Aksesoris',
    'Kecantikan & Perawatan', 'Kesehatan', 'Ibu, Bayi & Anak', 'Elektronik & Listrik',
    'HP, Komputer & Gaming', 'Motor & Mobil', 'Olahraga & Outdoor', 'Hewan Peliharaan',
    'Taman, Tanaman & Perkakas', 'Sekolah, Kantor & Usaha', 'Hobi, Kerajinan & Pesta',
    'Makanan & Minuman', 'Perlengkapan Ibadah',
  ];

  // Canonical bucket -> fee tier. Tiers follow Shopee's Jan 2026 grouping
  // (A = fashion/FMCG/lifestyle, D = elektronik high-end, E = logam mulia /
  // voucher). No canonical bucket maps to E — it is reachable only through
  // the "Lainnya / isi manual" option.
  const TIER_BY_CANON = {
    'Fashion': 'A', 'Sepatu, Tas & Aksesoris': 'A', 'Rumah & Dekorasi': 'A', 'Dapur': 'A',
    'Kamar Mandi': 'A', 'Makanan & Minuman': 'A', 'Hewan Peliharaan': 'A',
    'Hobi, Kerajinan & Pesta': 'A', 'Sekolah, Kantor & Usaha': 'A',
    'Taman, Tanaman & Perkakas': 'A', 'Perlengkapan Ibadah': 'A',
    'Kecantikan & Perawatan': 'B', 'Elektronik & Listrik': 'B',
    'Olahraga & Outdoor': 'B', 'Motor & Mobil': 'B',
    'Kesehatan': 'C', 'Ibu, Bayi & Anak': 'C',
    'HP, Komputer & Gaming': 'D',
  };

  // Legacy NU_ONB_CATS strings (onboarding chips, Deep Dive chip categories)
  // -> canonical. Products carry the canonical strings, but normalizeDdChipCat
  // still emits the legacy ones, so every tier lookup goes through here first.
  // Without this hop 'Sekolah, Kantor & Usaha' and 'Taman, Tanaman & Perkakas'
  // matched nothing and silently fell back to tier B.
  const LEGACY_TO_CANON = {
    'Alat Tulis': 'Sekolah, Kantor & Usaha',
    'Bayi & Anak': 'Ibu, Bayi & Anak',
    'Dapur': 'Dapur',
    'Elektronik': 'Elektronik & Listrik',
    'Fashion': 'Fashion',
    'Hewan Peliharaan': 'Hewan Peliharaan',
    'Hobi & Kerajinan': 'Hobi, Kerajinan & Pesta',
    'HP & Gadget': 'HP, Komputer & Gaming',
    'Kamar Mandi': 'Kamar Mandi',
    'Keamanan': 'Elektronik & Listrik',
    'Kecantikan': 'Kecantikan & Perawatan',
    'Kesehatan': 'Kesehatan',
    'Motor & Mobil': 'Motor & Mobil',
    'Olahraga': 'Olahraga & Outdoor',
    'Outdoor & Camping': 'Olahraga & Outdoor',
    'Rumah': 'Rumah & Dekorasi',
    'Sepeda': 'Olahraga & Outdoor',
    'Taman': 'Taman, Tanaman & Perkakas',
    'Tanaman': 'Taman, Tanaman & Perkakas',
  };

  const DEFAULT_TIER = 'B';

  /* Brand marks — inline SVG app-icon squares, brand colors, no emoji.
   * logo(key) is a function, not a constant string, because the Lazada mark
   * carries a <linearGradient> whose id would collide when the same mark is
   * rendered in two places on one page (kalkulator strip + Deep Dive strip).
   * Each call gets a fresh id. */
  let _gradSeq = 0;
  const LOGO_SRC = {
    shopee:    () => `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#EE4D2D"/><path d="M11.4 12.3a4.6 4.6 0 0 1 9.2 0" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M8.8 12h14.4l-1 11.2a1.6 1.6 0 0 1-1.6 1.45H11.4a1.6 1.6 0 0 1-1.6-1.45z" fill="#fff"/><path d="M16 15.8c-1.5 0-2.55.85-2.55 2.05 0 2.45 4.35 1.6 4.35 3.45 0 .85-.85 1.3-1.85 1.3-1 0-1.75-.4-2.2-1" fill="none" stroke="#EE4D2D" stroke-width="1.2" stroke-linecap="round"/></svg>`,
    tiktok:    () => `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#010101"/><path d="M19.3 7.4c.34 2.06 1.66 3.4 3.62 3.6v2.55c-1.18 0-2.36-.4-3.42-1.04v5.55a5.36 5.36 0 1 1-5.36-5.36c.3 0 .58.02.86.07v2.66a2.8 2.8 0 1 0 1.96 2.67V7.4z" fill="#25F4EE" transform="translate(-0.9,-0.6)"/><path d="M19.3 7.4c.34 2.06 1.66 3.4 3.62 3.6v2.55c-1.18 0-2.36-.4-3.42-1.04v5.55a5.36 5.36 0 1 1-5.36-5.36c.3 0 .58.02.86.07v2.66a2.8 2.8 0 1 0 1.96 2.67V7.4z" fill="#FE2C55" transform="translate(0.9,0.6)"/><path d="M19.3 7.4c.34 2.06 1.66 3.4 3.62 3.6v2.55c-1.18 0-2.36-.4-3.42-1.04v5.55a5.36 5.36 0 1 1-5.36-5.36c.3 0 .58.02.86.07v2.66a2.8 2.8 0 1 0 1.96 2.67V7.4z" fill="#fff"/></svg>`,
    tokopedia: () => `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#42B549"/><circle cx="12.6" cy="14" r="3.9" fill="#fff"/><circle cx="19.4" cy="14" r="3.9" fill="#fff"/><circle cx="12.6" cy="14" r="1.7" fill="#42B549"/><circle cx="19.4" cy="14" r="1.7" fill="#42B549"/><path d="M14.3 19.4h3.4L16 21.6z" fill="#fff"/></svg>`,
    lazada:    () => { const id = 'lzdg-' + (++_gradSeq); return `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF0F64"/><stop offset=".55" stop-color="#FF6A00"/><stop offset="1" stop-color="#2A1A8A"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="#0E1466"/><path d="M16 23.5s-6.2-3.6-6.2-8.1A3.55 3.55 0 0 1 16 12.6a3.55 3.55 0 0 1 6.2 2.8c0 4.5-6.2 8.1-6.2 8.1z" fill="url(#${id})"/></svg>`; },
    blibli:    () => `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0072BC"/><path d="M11.4 12.3a4.6 4.6 0 0 1 9.2 0" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M8.8 12h14.4l-1 11.2a1.6 1.6 0 0 1-1.6 1.45H11.4a1.6 1.6 0 0 1-1.6-1.45z" fill="#fff"/><circle cx="16" cy="18.4" r="2.2" fill="#0072BC"/></svg>`,
  };
  function logo(key) { return (LOGO_SRC[key] || LOGO_SRC.shopee)(); }

  /* comm    — komisi/biaya kategori per tier, % of harga jual
   * admin   — biaya administrasi tetap (%), separate from komisi
   * program — Gratis Ongkir / promo program (%), opt-in per toko
   * flat    — biaya proses pesanan, Rp per pesanan (NOT a %)
   * ship    — default ongkir subsidy seed for the calculator, Rp
   * capRp   — hard cap on the komisi in Rp per item, null = uncapped
   */
  const FEES = {
    shopee: {
      label: 'Shopee', color: '#EE4D2D',
      comm: { A: 10, B: 9.5, C: 6.75, D: 5.25, E: 4.25 },
      program: 5.5, programLabel: 'Gratis Ongkir XTRA', programDefaultOn: true,
      flat: 1250, ship: 9000, capRp: null,
      src: 'seller.shopee.co.id',
      srcUrl: 'https://seller.shopee.co.id/edu/article/15965',
    },
    tiktok: {
      label: 'TikTok Shop', color: '#111827',
      comm: { A: 10, B: 8.5, C: 7, D: 5, E: 2.5 },
      program: 0, programLabel: 'Program promo & subsidi', programDefaultOn: false,
      flat: 1250, ship: 9000, capRp: 650000,
      note: 'Sejak Mei 2026 ada biaya layanan logistik Rp 260–3.000 per pesanan di luar angka ini.',
      src: 'seller-id.tokopedia.com',
      srcUrl: 'https://seller-id.tokopedia.com/edu/article/seller-fee',
    },
    tokopedia: {
      label: 'Tokopedia', color: '#42B549',
      comm: { A: 10, B: 8.5, C: 7, D: 5, E: 2.5 },
      program: 0, programLabel: 'Program promo & subsidi', programDefaultOn: false,
      flat: 1250, ship: 10000, capRp: 650000,
      note: 'Satu mesin biaya dengan TikTok Shop sejak merger; batas komisi Rp 650.000 per item sejak 18 Mei 2026.',
      src: 'tokopedia.com/help',
      srcUrl: 'https://seller.tokopedia.com/edu/biaya-layanan',
    },
    lazada: {
      label: 'Lazada', color: '#1E3A8A',
      comm: { A: 8, B: 6, C: 4.5, D: 4, E: 2.5 },
      admin: 1.82,
      program: 0, programLabel: 'Program promo & subsidi', programDefaultOn: false,
      flat: 1250, ship: 10000, capRp: 20000,
      note: 'Komisi Lazada dibatasi Rp 20.000 per produk (Rp 10.000 untuk elektronik), jadi potongan efektif turun tajam di produk mahal.',
      src: 'sellercenter.lazada.co.id',
      srcUrl: 'https://sellercenter.lazada.co.id/apps/help/index',
    },
    blibli: {
      label: 'Blibli', color: '#0072BC',
      comm: { A: 8, B: 6, C: 5, D: 3, E: 2.5 },
      program: 0, programLabel: 'Program promo & subsidi', programDefaultOn: false,
      flat: 0, ship: 10000, capRp: null,
      note: 'Blibli tidak menerbitkan tarif per kategori — komisi mengikuti kontrak merchant (mulai 2%). Angka ini perkiraan; cek Seller Center kamu.',
      src: 'seller.blibli.com',
      srcUrl: 'https://seller.blibli.com/',
    },
  };

  const KEYS = Object.keys(FEES);

  // Resolve any category string (canonical, legacy chip, or a scrape's raw
  // wording) to one of CANON_CATS, or null when there is no confident match.
  function canonFor(cat) {
    const raw = String(cat || '').trim();
    if (!raw) return null;
    if (TIER_BY_CANON[raw]) return raw;
    if (LEGACY_TO_CANON[raw]) return LEGACY_TO_CANON[raw];
    const lower = raw.toLowerCase();
    for (const k of CANON_CATS) if (k.toLowerCase() === lower) return k;
    for (const k of Object.keys(LEGACY_TO_CANON)) {
      if (k.toLowerCase() === lower) return LEGACY_TO_CANON[k];
    }
    // Substring both ways — 'Elektronik' inside 'Elektronik & Listrik', and a
    // scrape's 'Fashion Muslim' inside nothing but starting with 'Fashion'.
    for (const k of CANON_CATS) {
      const kl = k.toLowerCase();
      if (lower.includes(kl) || kl.includes(lower)) return k;
    }
    return null;
  }

  function tierFor(cat) {
    const raw = String(cat || '').trim();
    if (!raw) return DEFAULT_TIER;
    if (TIER_BY_CANON[raw]) return TIER_BY_CANON[raw];
    const canon = LEGACY_TO_CANON[raw];
    if (canon && TIER_BY_CANON[canon]) return TIER_BY_CANON[canon];
    // Case-insensitive last chance before the default.
    const lower = raw.toLowerCase();
    for (const k of Object.keys(TIER_BY_CANON)) {
      if (k.toLowerCase() === lower) return TIER_BY_CANON[k];
    }
    for (const k of Object.keys(LEGACY_TO_CANON)) {
      if (k.toLowerCase() === lower) return TIER_BY_CANON[LEGACY_TO_CANON[k]] || DEFAULT_TIER;
    }
    return DEFAULT_TIER;
  }

  // Resolved rates for one marketplace + category. programOn defaults to the
  // platform's own default; pass false to price without the free-shipping program.
  function rateFor(mpKey, cat, opts) {
    const f = FEES[mpKey] || FEES.shopee;
    const o = opts || {};
    const tier = tierFor(cat);
    const comm = o.commManual != null && o.commManual !== '' && isFinite(o.commManual)
      ? Number(o.commManual)
      : (f.comm[tier] || 0);
    const programOn = o.programOn != null ? !!o.programOn : !!f.programDefaultOn;
    const program = programOn ? (f.program || 0) : 0;
    const admin = f.admin || 0;
    return {
      key: mpKey, label: f.label, tier, comm, admin, program, programOn,
      programLabel: f.programLabel, flat: f.flat || 0, capRp: f.capRp || null,
      ship: f.ship || 0, note: f.note || '', src: f.src, srcUrl: f.srcUrl,
      // Baseline potongan platform (komisi + biaya admin) — verified for all
      // five, so this is the only apples-to-apples number to compare on. The
      // opt-in program fee is NOT in here: it is only verified for Shopee, and
      // folding an unverified 0 into the others would make Shopee look worse
      // than it is.
      pctBase: +(comm + admin).toFixed(2),
      // Everything charged as a percentage of harga jual, before the cap.
      pctTotal: +(comm + admin + program).toFixed(2),
    };
  }

  // Rupiah the platform takes on one order at this price, cap applied to the
  // komisi only (admin/program are uncapped percentages).
  function feeRp(mpKey, cat, price, opts) {
    const r = rateFor(mpKey, cat, opts);
    const p = Number(price) || 0;
    const commRp = r.capRp != null ? Math.min(p * r.comm / 100, r.capRp) : p * r.comm / 100;
    const adminRp = p * r.admin / 100;
    const programRp = p * r.program / 100;
    return {
      ...r, commRp, adminRp, programRp,
      pctRp: commRp + adminRp + programRp,
      totalRp: commRp + adminRp + programRp + r.flat,
      // Effective % actually charged once the cap bites — what to show.
      pctEffective: p > 0 ? +(((commRp + adminRp + programRp) / p) * 100).toFixed(2) : r.pctTotal,
      pctBaseEffective: p > 0 ? +(((commRp + adminRp) / p) * 100).toFixed(2) : r.pctBase,
    };
  }

  // Two decimals, trailing zeros trimmed: Shopee publishes 6,75% / 5,25% /
  // 4,25% and Lazada 1,82%, and rounding those to one decimal misstates the
  // exact rate these pages exist to show.
  function fmtPct(n) {
    return (Math.round(Number(n) * 100) / 100).toFixed(2)
      .replace('.', ',').replace(/,?0+$/, '') + '%';
  }

  return {
    UPDATED, CANON_CATS, TIER_BY_CANON, LEGACY_TO_CANON, FEES, KEYS,
    logo, canonFor, tierFor, rateFor, feeRp, fmtPct,
  };
})();
