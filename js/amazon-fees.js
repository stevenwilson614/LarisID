/**
 * LARIS_AMZ -- the ONE source of truth for Amazon US selling costs used by LarisExpor.
 *
 * Consumable BOTH ways with no build step: it assigns to globalThis, so the static
 * calculators under /expor/kalkulator/ load it as a plain <script>, AND
 * scripts/build-expor.mjs can `await import()` it and read globalThis.LARIS_AMZ.
 * That matters -- js/marketplace-fees.js is browser-only, which forced
 * scripts/build-tools.mjs to re-type every rate into its template strings, so the
 * generated copy and the live calculator can silently drift apart. Do not repeat that.
 *
 * Two different tier SEMANTICS exist and conflating them produces wrong fees:
 *   - 'marginal': the rate applies per bracket (Furniture: 15% of the first $200, then 10%).
 *   - 'flat':     one rate applies to the WHOLE price, chosen by which band it falls in
 *                 (Grocery: 8% if the price is <= $15, otherwise 15% of everything).
 *
 * Rates verified September 2026 against two independent sources; Amazon has frozen US
 * referral rates since January 2024 through 2026. Freight and FX are editable DEFAULTS,
 * not quoted rates -- they move constantly and the calculator asks the user to confirm them.
 */
(function (root) {
  'use strict';

  var UPDATED = 'September 2026';

  // ---- Referral fees (Amazon US) ----------------------------------------------------
  // min: Amazon charges at least $0.30 per unit in most categories.
  var REFERRAL = {
    home: {
      label: 'Home & Kitchen', mode: 'flat', min: 0.30,
      bands: [{ upTo: null, pct: 15 }],
    },
    furniture: {
      label: 'Furniture', mode: 'marginal', min: 0.30,
      bands: [{ upTo: 200, pct: 15 }, { upTo: null, pct: 10 }],
      note: '15% untuk $200 pertama, 10% untuk sisanya.',
    },
    grocery: {
      label: 'Grocery & Gourmet Food', mode: 'flat', min: 0.30,
      bands: [{ upTo: 15, pct: 8 }, { upTo: null, pct: 15 }],
      note: 'Harga di bawah $15 hanya kena 8% -- menaikkan harga melewati $15 bisa menurunkan untung bersih.',
    },
    beauty: {
      label: 'Beauty, Health & Personal Care', mode: 'flat', min: 0.30,
      bands: [{ upTo: 10, pct: 8 }, { upTo: null, pct: 15 }],
      note: 'Harga di bawah $10 hanya kena 8%.',
    },
    apparel: {
      label: 'Clothing & Accessories', mode: 'flat', min: 0.30,
      bands: [{ upTo: 15, pct: 5 }, { upTo: 20, pct: 10 }, { upTo: null, pct: 17 }],
      note: 'Tarif melompat dari 10% ke 17% tepat di atas $20.',
    },
    jewelry: {
      label: 'Jewelry', mode: 'marginal', min: 0.30,
      bands: [{ upTo: 250, pct: 20 }, { upTo: null, pct: 5 }],
      note: '20% untuk $250 pertama -- tarif tertinggi di antara kategori ekspor umum.',
    },
    footwear: { label: 'Footwear', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
    bags: { label: 'Backpacks, Handbags & Luggage', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
    office: { label: 'Office Products', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
    toys: { label: 'Toys & Games', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
    sports: { label: 'Sports & Outdoors', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
    garden: { label: 'Lawn & Garden', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
    other: { label: 'Everything Else', mode: 'flat', min: 0.30, bands: [{ upTo: null, pct: 15 }] },
  };

  var REFERRAL_SRC = 'sellercentral.amazon.com (tarif AS dibekukan sejak Januari 2024 s/d 2026)';
  var REFERRAL_SRC_URL = 'https://sellercentral.amazon.com/help/hub/reference/GTG4BAWSY39SJHTS';

  // ---- LarisExpor corpus category -> Amazon referral category -----------------------
  // Deliberately conservative: mixed buckets (Produk Kelapa holds both food and homeware)
  // default to the more common case and the calculator lets the seller override.
  var CAT_MAP = {
    'Furnitur & Dekorasi': 'furniture',
    'Kerajinan & Anyaman': 'home',
    'Kopi, Teh & Kakao': 'grocery',
    'Rempah & Bumbu': 'grocery',
    'Minyak Atsiri & Ekstrak': 'beauty',
    'Produk Kelapa': 'grocery',
    'Fesyen & Tekstil': 'apparel',
    'Perhiasan & Aksesori': 'jewelry',
    'Perawatan Diri & Wellness': 'beauty',
    'Dapur & Peralatan Makan': 'home',
    'Makanan Olahan': 'grocery',
    'Hasil Laut & Rumput Laut': 'grocery',
  };

  // ---- FBA fulfilment (Amazon US, 2026 base rates before the fuel surcharge) --------
  var FBA = {
    bands: [
      { key: 'small_light', label: 'Small standard, s/d 2 oz (57 g)', fee: 3.06 },
      { key: 'small_heavy', label: 'Small standard, 14-16 oz (~450 g)', fee: 3.65 },
      { key: 'large_light', label: 'Large standard, s/d 4 oz (113 g)', fee: 3.68 },
      { key: 'large_mid', label: 'Large standard, ~1-2 lb (0,5-1 kg)', fee: 5.30 },
      { key: 'large_heavy', label: 'Large standard, 3-20 lb (1,4-9 kg)', fee: 6.92 },
      { key: 'bulky', label: 'Large bulky, 0-50 lb', fee: 9.61, perLb: 0.38 },
      { key: 'xl', label: 'Extra-large, 0-50 lb', fee: 26.33, perLb: 0.38 },
    ],
    FUEL_SURCHARGE: 0.035,     // 3.5%, applies to all FBA fulfilment fees in 2026
    STORAGE_PER_CUFT: 0.78,    // Jan-Sep, standard size, per cubic foot per month
    src: 'Amazon FBA fee schedule 2026',
    srcUrl: 'https://sellercentral.amazon.com/help/hub/reference/GABBX6GCVHTBH8B4',
    note: 'FBA naik rata-rata $0,08/unit di 2026 dan semua biaya fulfilment kena surcharge 3,5%.',
  };

  // ---- Freight from Indonesia -- EDITABLE DEFAULTS, not quotes ----------------------
  // Rates move weekly. These are mid-range published ballparks so the form is not empty;
  // every calculator surfaces them as inputs and tells the seller to use a real quote.
  var FREIGHT = {
    air: { label: 'Udara (air freight)', usdPerKg: 7.0, range: '$5-9 /kg', divisor: 6000 },
    seaLcl: { label: 'Laut LCL (per CBM)', usdPerCbm: 115, range: '$80-150 /CBM' },
    seaFcl20: { label: 'Laut FCL 20ft', usdFlat: 2800, range: '$2.000-4.000' },
    docs: { label: 'Dokumen & bea cukai ekspor', usdFlat: 150, range: '$100-250' },
    note: 'Tarif kirim berubah tiap minggu. Angka ini hanya titik awal -- minta quote ke forwarder sebelum ambil keputusan.',
    volumetricNote: 'Air freight menagih berat yang lebih besar antara berat asli dan berat volumetrik (P x L x T cm / 6000).',
  };

  // ---- FX ---------------------------------------------------------------------------
  var FX = {
    idrPerUsd: 16500,
    note: 'Kurs default, bukan kurs hari ini. Ganti sesuai kurs yang kamu pakai.',
  };

  // ---- Helpers ----------------------------------------------------------------------

  function catFor(corpusCategory) {
    return CAT_MAP[corpusCategory] || 'other';
  }

  /**
   * Referral fee in USD for a price, honouring the category's tier mode.
   * Returns { usd, pctEffective, catKey, label }.
   */
  function referralFee(catKey, priceUsd) {
    var cat = REFERRAL[catKey] || REFERRAL.other;
    var price = Number(priceUsd) || 0;
    var fee = 0;

    if (cat.mode === 'marginal') {
      var remaining = price;
      var prevCap = 0;
      for (var i = 0; i < cat.bands.length && remaining > 0; i++) {
        var b = cat.bands[i];
        var cap = b.upTo == null ? Infinity : b.upTo;
        var slice = Math.min(remaining, cap - prevCap);
        if (slice > 0) { fee += slice * (b.pct / 100); remaining -= slice; }
        prevCap = cap;
      }
    } else {
      // flat: one rate for the whole price, picked by the band the price falls in
      var pct = cat.bands[cat.bands.length - 1].pct;
      for (var j = 0; j < cat.bands.length; j++) {
        if (cat.bands[j].upTo != null && price <= cat.bands[j].upTo) { pct = cat.bands[j].pct; break; }
      }
      fee = price * (pct / 100);
    }

    if (cat.min && fee < cat.min) fee = cat.min;
    return {
      usd: fee,
      pctEffective: price > 0 ? (fee / price) * 100 : 0,
      catKey: (REFERRAL[catKey] ? catKey : 'other'),
      label: cat.label,
    };
  }

  /** FBA fulfilment fee in USD for a band key, including the 2026 fuel surcharge. */
  function fbaFee(bandKey, weightLb) {
    var band = null;
    for (var i = 0; i < FBA.bands.length; i++) if (FBA.bands[i].key === bandKey) band = FBA.bands[i];
    if (!band) band = FBA.bands[2];
    var base = band.fee + (band.perLb ? band.perLb * (Number(weightLb) || 0) : 0);
    return base * (1 + FBA.FUEL_SURCHARGE);
  }

  /** Air-freight chargeable weight: the greater of actual and volumetric. */
  function chargeableKg(actualKg, lCm, wCm, hCm, divisor) {
    var d = Number(divisor) || FREIGHT.air.divisor;
    var vol = (Number(lCm) || 0) * (Number(wCm) || 0) * (Number(hCm) || 0) / d;
    return Math.max(Number(actualKg) || 0, vol);
  }

  function fmtUsd(n) {
    var v = Number(n) || 0;
    return '$' + v.toFixed(2);
  }

  /** Indonesian number formatting: dot thousands separator. */
  function fmtIdr(n) {
    var v = Math.round(Number(n) || 0);
    return 'Rp' + v.toLocaleString('id-ID');
  }

  function fmtPct(n) {
    var v = Number(n) || 0;
    return v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + '%';
  }

  root.LARIS_AMZ = {
    UPDATED: UPDATED,
    REFERRAL: REFERRAL,
    REFERRAL_SRC: REFERRAL_SRC,
    REFERRAL_SRC_URL: REFERRAL_SRC_URL,
    CAT_MAP: CAT_MAP,
    FBA: FBA,
    FREIGHT: FREIGHT,
    FX: FX,
    catFor: catFor,
    referralFee: referralFee,
    fbaFee: fbaFee,
    chargeableKg: chargeableKg,
    fmtUsd: fmtUsd,
    fmtIdr: fmtIdr,
    fmtPct: fmtPct,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
