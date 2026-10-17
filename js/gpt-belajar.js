/* Belajar — free seller course. Content and progress come from belajar_course(). */
(function (global) {
  'use strict';

  const PLATFORMS = [
    { id: 'shopee', label: 'Shopee' },
    { id: 'tokopedia', label: 'Tokopedia' },
    { id: 'tiktok', label: 'TikTok Shop' },
    { id: 'lazada', label: 'Lazada' },
  ];

  const DOT_LABEL = {
    cari: 'Cari produk',
    supplier: 'Sumber',
    toko: 'Jualan',
    pantau: 'Pantau',
  };

  const WIDGETS = new Set([
    'ide-produk', 'pra-listing', 'hitung-modal', 'tanya-sumber',
    'cara-mulai', 'listing-pertama', 'tautan-toko', 'pantau-kompetitor',
  ]);

  const STOP = new Set('dan atau untuk dengan yang dari pada ini itu ada adalah produk barang set pcs free warna original murah ready the and for with'.split(' '));

  const GUIDES = {
    shopee: {
      start: 'Daftar lewat aplikasi Shopee (Mulai Jual) atau Seller Center. Verifikasi memakai KTP pemilik akun, lalu lengkapi rekening. Kalau layar Shopee berbeda, yang di layar mereka yang berlaku.',
      listing: 'Judul yang menyebut isi atau manfaat, dengan kata yang orang ketik. Harga di atas harga pokok setelah potongan platform.',
      links: [
        { name: 'Mulai berjualan di Shopee', url: 'https://seller.shopee.co.id/edu/article/464' },
        { name: 'Shopee Seller Center', url: 'https://seller.shopee.co.id/' },
        { name: 'Pusat Edukasi Penjual', url: 'https://seller.shopee.co.id/edu' },
      ],
    },
    tokopedia: {
      start: 'Daftar di Seller Center Tokopedia dan TikTok Shop. Individu biasanya diminta KTP. Peninjauan bisa makan beberapa hari. Itu antrean mereka, bukan tanda gagal.',
      listing: 'Setelah toko disetujui, unggah produk dan atur pengiriman. Tokopedia dan TikTok Shop Indonesia berbagi Seller Center.',
      links: [
        { name: 'Daftar penjual Indonesia', url: 'https://seller-id.tokopedia.com/account/register' },
        { name: 'Academy', url: 'https://seller-id.tokopedia.com/university/home?identity=1&role=seller' },
        { name: 'Mulai berjualan (Academy)', url: 'https://seller-id.tokopedia.com/university/course?content_id=6685219521595153&lang=id-ID&learning_id=6691229207562001' },
      ],
    },
    tiktok: {
      start: 'Di Indonesia, TikTok Shop dikelola bersama Tokopedia. Setelah toko di Seller Center aktif, tautkan akun TikTok: Profil, Akun Saya, Akun TikTok yang ditautkan. Tanpa tautan itu, keranjang di video tidak nyambung.',
      listing: 'Jangan buat pendaftaran kedua kalau toko yang pertama masih ditinjau. Listing mengikuti etalase Seller Center yang sama.',
      links: [
        { name: 'Academy', url: 'https://seller-id.tokopedia.com/university/home?identity=1&role=seller' },
        { name: 'Mulai berjualan (Academy)', url: 'https://seller-id.tokopedia.com/university/course?content_id=6685219521595153&lang=id-ID&learning_id=6691229207562001' },
      ],
    },
    lazada: {
      start: 'Daftar lewat halaman jualan Lazada, lalu isi alamat, dokumen, dan rekening di Seller Center. Seller Center akan meminta login dulu. Itu normal. Promo 0% di halaman mereka punya masa berlaku.',
      listing: 'Ikuti form listing di Seller Center Lazada. Syarat foto dan kategori adalah aturan mereka.',
      links: [
        { name: 'Jualan online di Lazada', url: 'https://www.lazada.co.id/wow/i/id/sell-on-lazada/jualanonline' },
        { name: 'Daftar Seller Center', url: 'https://sellercenter.lazada.co.id/apps/register/index' },
        { name: 'Lazada University', url: 'https://university.lazada.co.id/' },
      ],
    },
  };

  let _ctx = null;
  let _course = null;
  let _lessonSlug = null;
  let _busy = false;
  let _bound = false;
  let _adminBound = false;
  let _loadGen = 0;
  let _paintKey = '';
  let _tab = '';
  let _focus = '';
  let _photoUrl = '';
  let _askDraft = { slug: '', body: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeUrl(url) {
    const u = String(url || '').trim();
    if (u.startsWith('/') && !u.startsWith('//')) return u;
    if (/^https:\/\//i.test(u)) return u;
    return '';
  }

  function ytId(url) {
    const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function rp(n) {
    const x = Math.round(Number(n) || 0);
    return 'Rp\u00a0' + x.toLocaleString('id-ID');
  }

  function moneyOrNull(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) ? n : null;
  }

  function rootEl() {
    return document.getElementById('belajar-root');
  }

  function modules() {
    return arr(_course && _course.modules);
  }

  function draft() {
    const d = (_course && _course.draft) || {};
    return {
      idea: Object.assign({ choice: '', name: '', description: '', cost: null, price: null }, d.idea || {}),
      analysis: d.analysis || {},
      listing: Object.assign({ title: '', description: '', sku: false, variations: '' }, d.listing || {}),
      rating: d.rating || {},
      manual: arr(d.manual),
    };
  }

  function lessonBySlug(slug) {
    for (const mod of modules()) {
      for (const lesson of arr(mod.lessons)) {
        if (lesson.slug === slug) return { lesson, module: mod };
      }
    }
    return null;
  }

  async function rpc(name, args) {
    if (!_ctx || !_ctx.supabase) throw new Error('no_client');
    const { data, error } = await _ctx.supabase.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  function paras(text) {
    return String(text || '').split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function signalLine(lesson) {
    const key = lesson.action && lesson.action.verify_key;
    const s = (_course && _course.signals) || {};
    if (key === 'ide') {
      if (s.analyzed) return 'Analisis ide sudah tersimpan.';
      return `Deep Dive tercatat: ${s.deepdive || 0}. Butuh analisis, atau minimal 1 Deep Dive.`;
    }
    if (key === 'pra') return s.title ? 'Judul pra-listing tersimpan.' : 'Judul pra-listing belum disimpan.';
    if (key === 'deepdive') return `Deep Dive tercatat: ${s.deepdive || 0}. Butuh minimal 1.`;
    if (key === 'favorit3') return `Favorit tersimpan: ${s.favorit || 0} dari 3.`;
    if (key === 'kalk') return (s.kalk > 0) ? 'Kalkulasi tersimpan di riwayat.' : 'Belum ada kalkulasi yang disimpan.';
    if (key === 'diskusi') return s.diskusi ? 'Pertanyaanmu di Diskusi sudah tercatat.' : 'Belum ada pertanyaan dari akun ini.';
    if (key === 'store') return s.store ? 'URL toko sudah tersimpan.' : 'URL toko belum tersimpan.';
    if (key === 'watch') return s.watch ? 'Ada favorit atau catatan kompetitor.' : 'Belum ada favorit atau catatan URL.';
    if (key === 'pantau') {
      return `Favorit ${s.favorit || 0} dari 3 · ${s.notify ? 'kabar menyala' : 'kabar belum dinyalakan'}.`;
    }
    return '';
  }

  function failText(data) {
    const code = data && data.error;
    if (code === 'link_failed') return (data && data.message) || 'URL toko belum dikenali.';
    if (code === 'no_shop') return 'Tautkan URL toko dulu.';
    if (code === 'bad_amount') return 'Angka omset belum masuk akal.';
    if (code === 'draft_too_big') return 'Draf terlalu panjang.';
    if (code === 'bad_baseline') return 'Pilihan awal belum dikenali.';
    return 'Belum tersimpan. Coba lagi.';
  }

  function scrollTopIfNeeded(key) {
    if (key === _paintKey) return;
    _paintKey = key;
    const panel = document.getElementById('panel');
    if (panel) requestAnimationFrame(() => { panel.scrollTop = 0; });
  }

  const ICO = {
    check: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5l4.2 4.2L19 7.5"/></svg>',
  };

  function sectionHtml(title, count, body) {
    if (!body) return '';
    const header = title
      ? `<header class="blj-sec-h">
          <div>
            <strong>${esc(title)}</strong>
            ${count ? `<span>${esc(count)}</span>` : ''}
          </div>
        </header>`
      : '';
    return `<section class="blj-sec">
      ${header}
      <div class="blj-sec-body">${body}</div>
    </section>`;
  }

  function kindLabel(kind) {
    if (kind === 'video') return 'Video';
    if (kind === 'document') return 'Dokumen';
    if (kind === 'tool') return 'Langkah di LarisID';
    return 'Bacaan';
  }

  function playerHtml(url) {
    const id = ytId(url);
    if (!id) return '';
    return `<button type="button" class="blj-yt" data-blj-yt="${esc(id)}">
      <img alt="" src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" loading="lazy">
      <span>Putar video</span>
    </button>`;
  }

  function mediaHtml(lesson) {
    const url = safeUrl(lesson.url);
    if (ytId(lesson.url)) return playerHtml(lesson.url);
    if (url && (lesson.kind === 'document' || lesson.kind === 'video')) {
      return `<a class="blj-doc" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buka dokumen</a>`;
    }
    return '';
  }

  function resourcesHtml(lesson) {
    if (lesson.slug === 'cara-mulai' || lesson.slug === 'ide-produk' || lesson.slug === 'pra-listing') return '';
    const own = safeUrl(lesson.url);
    const items = arr(lesson.resources).map((r) => {
      const url = safeUrl(r && r.url);
      if (!url || url === own || ytId(url)) return '';
      if (url === '/cara-kerja/' || /cara\s*kerja/i.test(String((r && r.name) || ''))) return '';
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc((r && r.name) || url)}</a></li>`;
    }).filter(Boolean);
    if (!items.length) return '';
    const n = items.length;
    return sectionHtml('Tautan', n === 1 ? '1 tautan' : `${n} tautan`, `<ul class="blj-links">${items.join('')}</ul>`);
  }

  function platformLogo(id) {
    try {
      if (global.LARIS_MP && typeof global.LARIS_MP.logo === 'function') {
        return global.LARIS_MP.logo(id).replace(/width="26" height="26"/g, 'width="22" height="22"');
      }
    } catch (_) {}
    return '';
  }

  function askSeed(slug) {
    const name = draft().idea.name || draft().listing.title || 'produk saya';
    const prompts = {
      'ide-produk': `Ada yang pernah jual ${name}? Saya lagi cek idenya dari listing yang ada.`,
      'pra-listing': `Boleh lihat draf judul listing saya untuk ${name}?`,
      'hitung-modal': `Untuk ${name}, biaya apa yang sering kelewat waktu hitung modal?`,
      'mulai-sourcing': `Yang pernah cari supplier untuk ${name}, apa yang perlu ditanya sebelum transfer?`,
      'tanya-sumber': `Yang pernah cari supplier untuk ${name}, lewat pasar lokal, 1688, atau Alibaba: apa yang perlu ditanya sebelum transfer? Saya butuh sampel dulu.`,
      'cara-mulai': 'Yang baru buka toko, verifikasi KTP-nya biasanya nyangkut di mana?',
      'listing-pertama': `Listing pertama ${name}: foto atau judul yang lebih sering bikin orang nanya?`,
      'tautan-toko': 'Setelah toko hidup, apa yang kalian pantau di minggu pertama?',
      'pantau-kompetitor': 'Kalian pantau kompetitor dari harga, atau dari listing baru?',
    };
    return prompts[slug] || prompts['tanya-sumber'];
  }

  function communityAskHtml(lesson) {
    const slug = (lesson && lesson.slug) || '';
    const typed = fieldVal(rootEl(), '[data-blj-ask-body]');
    if (_askDraft.slug === slug && typed != null) _askDraft.body = typed;
    else if (_askDraft.slug !== slug) {
      _askDraft = { slug, body: askSeed(slug) };
    }
    const seed = _askDraft.body || askSeed(slug);
    const line = lesson && lesson.action && lesson.action.verify_key === 'diskusi'
      ? signalLine(lesson)
      : '';
    return sectionHtml(
      'Tanya komunitas',
      'Diskusi',
      `<p class="blj-quiet">Edit draf di bawah, lalu buka Diskusi. Kamu yang menekan kirim — kami tidak memposting otomatis.</p>
       ${line ? `<p class="blj-verified">${esc(line)}</p>` : ''}
       <label class="blj-ask-label">Draf pertanyaan
         <textarea data-blj-ask-body rows="3" maxlength="4000">${esc(seed)}</textarea>
       </label>
       <button type="button" class="btn-primary" data-blj-go="diskusi">Tanya di Diskusi</button>`
    );
  }

  function pointsHtml(lesson) {
    const items = arr(lesson.points).map((p) => `<li>${esc(p)}</li>`).join('');
    if (!items) return '';
    return `<div class="blj-outcomes"><strong>Setelah bagian ini</strong><ul>${items}</ul></div>`;
  }

  function questionsHtml(lesson) {
    const qs = arr(lesson.questions);
    if (!qs.length) return '';
    const saved = lesson.answers || {};
    const fields = qs.map((q, i) => {
      const val = saved[String(i)] != null ? saved[String(i)] : '';
      return `<label class="blj-q">
        <span>${esc(q.q || '')}</span>
        ${q.hint ? `<em>${esc(q.hint)}</em>` : ''}
        <textarea data-blj-answer="${i}" rows="3">${esc(val)}</textarea>
      </label>`;
    }).join('');
    return sectionHtml(
      'Cek pemahaman',
      qs.length === 1 ? '1 pertanyaan' : `${qs.length} pertanyaan`,
      `<p class="blj-quiet">Untuk kamu, bukan untuk dinilai. Jawaban tersimpan saat kamu menandai selesai.</p>${fields}`
    );
  }

  function orderedLessons() {
    const out = [];
    modules().forEach((mod) => {
      arr(mod.lessons).forEach((lesson) => out.push({ lesson, module: mod }));
    });
    return out;
  }

  function neighbor(dir) {
    const items = orderedLessons();
    const i = items.findIndex((item) => item.lesson.slug === _lessonSlug);
    if (i < 0) return null;
    return items[i + dir] || null;
  }

  function focusPlatform() {
    const plats = arr(_course && _course.platforms);
    if (_focus && plats.includes(_focus)) return _focus;
    return plats[0] || 'shopee';
  }

  function moduleTone(mod) {
    const lessons = arr(mod.lessons);
    const applicable = lessons.filter((l) => l.applicable);
    const done = applicable.length > 0 && applicable.every((l) => l.status === 'done');
    const quiet = applicable.length === 0;
    const current = _lessonSlug
      ? lessons.some((l) => l.slug === _lessonSlug)
      : !!((_course.progress || {}).next && (_course.progress || {}).next.module_slug === mod.slug);
    return { done, quiet, current };
  }

  function stepsHtml() {
    const mods = modules();
    const dots = mods.map((mod, i) => {
      const tone = moduleTone(mod);
      const cls = [
        'blj-step',
        tone.done ? 'is-done' : '',
        tone.quiet ? 'is-quiet' : '',
        tone.current ? 'is-current' : '',
      ].filter(Boolean).join(' ');
      const mark = tone.done ? ICO.check : String(i + 1);
      const label = DOT_LABEL[mod.slug] || mod.title;
      return `<button type="button" class="${cls}" data-blj-module="${esc(mod.slug)}" aria-label="${esc((i + 1) + '. ' + label)}"${tone.current ? ' aria-current="step"' : ''}>
        <i>${mark}</i><span>${esc(label)}</span>
      </button>`;
    }).join('');
    const p = _course.progress || {};
    return `<div class="blj-steps-wrap">
      <button type="button" class="blj-materi-btn" data-blj-sheet>Materi</button>
      <div class="blj-steps" aria-label="Empat langkah">${dots}</div>
      <p class="blj-steps-meta"><strong>${p.done || 0} / ${p.total || 0}</strong> bagian selesai</p>
    </div>`;
  }

  function lessonRow(lesson) {
    const cls = [
      'blj-row',
      lesson.status === 'done' ? 'is-done' : '',
      lesson.status === 'skipped' ? 'is-skipped' : '',
      lesson.applicable ? '' : 'is-quiet',
      lesson.slug === _lessonSlug ? 'is-current' : '',
    ].filter(Boolean).join(' ');
    const mark = lesson.status === 'done' ? '✓' : (lesson.status === 'skipped' ? '–' : '');
    const mins = lesson.est_mins ? `${lesson.est_mins} mnt` : '';
    return `<button type="button" class="${cls}" data-blj-lesson="${esc(lesson.slug)}">
      <i>${mark}</i>
      <span>${esc(lesson.title)}</span>
      ${mins ? `<em>${esc(mins)}</em>` : ''}
    </button>`;
  }

  function railInner() {
    const p = _course.progress || {};
    const pct = p.pct || 0;
    const mods = modules().map((mod) => {
      const open = moduleTone(mod).current || arr(mod.lessons).some((l) => l.slug === _lessonSlug);
      const n = arr(mod.lessons).length;
      const mins = arr(mod.lessons).reduce((sum, l) => sum + (Number(l.est_mins) || 0), 0);
      return `<details class="blj-mod" ${open ? 'open' : ''}>
        <summary>
          <strong>${esc(mod.title)}</strong>
          <span>${n} bagian${mins ? ` · ${mins} mnt` : ''}</span>
        </summary>
        <div class="blj-rows">${arr(mod.lessons).map(lessonRow).join('')}</div>
      </details>`;
    }).join('');
    return `<div class="blj-rail-top">
        <strong>Dari nol sampai jualan online</strong>
        <b>${pct}%</b>
      </div>
      <div class="blj-rail-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <p class="blj-quiet">${p.done || 0} dari ${p.total || 0} bagian yang dihitung</p>
      ${mods}`;
  }

  function railHtml() {
    return `<aside class="blj-rail" aria-label="Daftar materi">${railInner()}</aside>`;
  }

  function sheetHtml() {
    return `<div class="blj-sheet" hidden>
      <div class="blj-sheet-card" role="dialog" aria-label="Daftar materi">
        <button type="button" class="blj-sheet-close" data-blj-sheet-close>Tutup</button>
        ${railInner()}
      </div>
    </div>`;
  }

  function fieldVal(scope, sel) {
    const node = scope && scope.querySelector(sel);
    return node ? node.value : null;
  }

  function readIdea(scope) {
    const idea = Object.assign({}, draft().idea);
    const name = fieldVal(scope, '[data-blj-idea="name"]');
    if (name != null) idea.name = name.trim();
    const description = fieldVal(scope, '[data-blj-idea="description"]');
    if (description != null) idea.description = description.trim();
    const cost = fieldVal(scope, '[data-blj-idea="cost"]');
    if (cost != null) idea.cost = moneyOrNull(cost);
    const price = fieldVal(scope, '[data-blj-idea="price"]');
    if (price != null) idea.price = moneyOrNull(price);
    return idea;
  }

  function readListing(scope) {
    const listing = Object.assign({}, draft().listing);
    const title = fieldVal(scope, '[data-blj-list="title"]');
    if (title != null) listing.title = title.trim();
    const description = fieldVal(scope, '[data-blj-list="description"]');
    if (description != null) listing.description = description.trim();
    const sku = scope && scope.querySelector('[data-blj-sku]');
    if (sku) listing.sku = !!sku.checked;
    const variations = fieldVal(scope, '[data-blj-list="variations"]');
    if (variations != null) listing.variations = variations.trim();
    return listing;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return null;
    const i = (sorted.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return sorted[lo];
    return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
  }

  function wordCounts(rows) {
    const counts = new Map();
    rows.forEach((row) => {
      String(row.product_name || '').toLowerCase().split(/[^a-z0-9]+/i).forEach((w) => {
        if (w.length < 4 || STOP.has(w)) return;
        counts.set(w, (counts.get(w) || 0) + 1);
      });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map((pair) => pair[0]);
  }

  function summarize(idea, rows) {
    const list = arr(rows);
    const prices = list.map((r) => Math.round(Number(r.price) || 0)).filter((n) => n > 0).sort((a, b) => a - b);
    const median = percentile(prices, 0.5);
    const userPrice = idea.price || null;
    let priceVs = 'unknown';
    if (userPrice && median) {
      const ratio = userPrice / median;
      priceVs = ratio > 1.1 ? 'above' : ratio < 0.9 ? 'below' : 'near';
    }
    const omsets = list.map((r) => {
      if (r.nowcast_omset_monthly == null) return null;
      const n = Number(r.nowcast_omset_monthly);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }).filter((n) => n != null).sort((a, b) => a - b);
    const sample = list.slice().sort((a, b) => {
      const ao = a.nowcast_omset_monthly == null ? -1 : Number(a.nowcast_omset_monthly);
      const bo = b.nowcast_omset_monthly == null ? -1 : Number(b.nowcast_omset_monthly);
      return (Number.isFinite(bo) ? bo : -1) - (Number.isFinite(ao) ? ao : -1);
    }).slice(0, 6).map((r) => ({
      item_id: String(r.item_id == null ? '' : r.item_id),
      shop_id: String(r.shop_id == null ? '' : r.shop_id),
      name: String(r.product_name || '').slice(0, 180),
      price: Math.round(Number(r.price) || 0) || null,
      omset: r.nowcast_omset_monthly == null || !Number.isFinite(Number(r.nowcast_omset_monthly))
        ? null
        : Math.round(Number(r.nowcast_omset_monthly)),
      store: String(r.store_name || '').slice(0, 120),
      keyword: String(r.keyword || '').slice(0, 80),
      category: String(r.category || r.category_canonical || '').slice(0, 80),
      image: /^https:\/\//i.test(String(r.image_url || '')) ? String(r.image_url).slice(0, 800) : '',
    }));
    return {
      ran: true,
      query: idea.name,
      n: list.length,
      median_price: median,
      user_price: userPrice,
      price_vs: priceVs,
      omset_p25: percentile(omsets, 0.25),
      omset_p75: percentile(omsets, 0.75),
      words: wordCounts(list),
      sample,
    };
  }

  function priceNote(analysis) {
    const vs = analysis.price_vs;
    const median = analysis.median_price;
    if (!median) return 'Sampel ini belum punya harga yang bisa dibandingkan.';
    if (vs === 'above') return `Harga jualmu di atas median sampel ini (${rp(median)}).`;
    if (vs === 'below') return `Harga jualmu di bawah median sampel ini (${rp(median)}). Cek dulu apakah masih di atas harga pokok setelah biaya.`;
    if (vs === 'near') return `Harga jualmu dekat median sampel ini (${rp(median)}).`;
    return `Median harga sampel ini ${rp(median)}. Isi harga jual kalau kamu sudah punya angka.`;
  }

  function omsetNote(analysis) {
    if (analysis.omset_p25 == null || analysis.omset_p75 == null) {
      return 'Sampel ini belum punya omset perkiraan yang bisa dirangkum.';
    }
    return `Dari ${analysis.n || 0} listing yang ketemu, omset bulanannya perkiraan antara ${rp(analysis.omset_p25)} dan ${rp(analysis.omset_p75)}. Ini sampel pencarian, bukan seluruh pasar, dan bukan angka untuk produkmu.`;
  }

  function savedFav(item, shop) {
    return arr(_course && _course.favorites).some((f) => String(f.item_id) === String(item) && String(f.shop_id) === String(shop));
  }

  function analysisHtml(analysis) {
    if (!analysis || !analysis.ran) return '';
    const words = arr(analysis.words);
    const rows = arr(analysis.sample).map((row, i) => {
      const canFav = row.item_id && row.shop_id;
      const saved = canFav && savedFav(row.item_id, row.shop_id);
      const omset = row.omset == null ? 'omset belum ada' : `${rp(row.omset)} perkiraan`;
      return `<li class="blj-comp">
        <div>
          <strong>${esc(row.name || 'Listing')}</strong>
          <span>${row.price ? esc(rp(row.price)) : '—'} · ${esc(omset)}${row.store ? ` · ${esc(row.store)}` : ''}</span>
        </div>
        ${canFav ? `<button type="button" class="btn-ghost" data-blj-fav="${i}" ${saved ? 'disabled' : ''}>${saved ? 'Sudah di Favorit' : 'Simpan ke Favorit'}</button>` : ''}
      </li>`;
    }).join('');
    const empty = !analysis.n
      ? `<p>Tidak ada listing yang ketemu untuk “${esc(analysis.query || '')}”. Coba kata yang lebih umum, atau cari sendiri.</p>
         <button type="button" class="btn-primary" data-blj-go="search" data-q="${esc(analysis.query || '')}">Buka Cari Produk</button>`
      : '';
    return `<div class="blj-result">
      <p><strong>${analysis.n || 0} listing</strong> di sampel pencarian ini.</p>
      <p>${esc(priceNote(analysis))}</p>
      <p>${esc(omsetNote(analysis))}</p>
      ${words.length ? `<p>Kata yang sering muncul di judul sampel: ${esc(words.join(', '))}.</p>` : ''}
      ${empty}
      ${rows ? `<ul class="blj-comps">${rows}</ul>` : ''}
    </div>`;
  }

  function widgetIde() {
    const idea = draft().idea;
    return `<div class="blj-form">
      <h3>Mau jual apa?</h3>
      <p class="blj-quiet">Isi yang kamu tahu. Belum punya semua detailnya tidak apa-apa.</p>
      <label>Nama produk <input data-blj-idea="name" maxlength="200" value="${esc(idea.name || '')}" required placeholder="contoh: baju wanita"></label>
      <label>Deskripsi <textarea data-blj-idea="description" maxlength="2000" rows="3" placeholder="opsional">${esc(idea.description || '')}</textarea></label>
      <div class="blj-price-row">
        <label>Harga modal <input data-blj-idea="cost" inputmode="numeric" placeholder="opsional" value="${idea.cost ? esc(String(idea.cost)) : ''}"></label>
        <label>Harga jual <input data-blj-idea="price" inputmode="numeric" placeholder="opsional" value="${idea.price ? esc(String(idea.price)) : ''}"></label>
      </div>
      <button type="button" class="btn-primary" data-blj-go="analyze">Analisis ide produk</button>
      ${analysisHtml(draft().analysis)}
      <div class="blj-inspire">
        <p class="blj-quiet">Belum yakin produknya? Cari inspirasi dari data Shopee yang sudah ada.</p>
        <button type="button" class="btn-ghost" data-blj-go="search" data-q="${esc(idea.name || '')}">Cari inspirasi di Cari Produk</button>
      </div>
    </div>`;
  }

  function samplePhotoUrl() {
    if (_photoUrl) return _photoUrl;
    const hit = arr(draft().analysis && draft().analysis.sample).find((r) => r.image);
    return hit ? hit.image : '';
  }

  function rateTipsHtml() {
    const d = draft();
    const rating = d.rating || {};
    if (!rating.ran) return '';
    const tips = arr(rating.tips).map((t) => `<li>${esc(t)}</li>`).join('');
    return `<div class="blj-rate-out" data-blj-rate-out>
      <p><strong>Skor draf:</strong> ${esc(String(rating.score || 0))}/10 terhadap sampel kompetitor.</p>
      ${tips ? `<ul class="blj-points">${tips}</ul>` : ''}
      <button type="button" class="btn-ghost" data-blj-go="ask">Tanya Laris AI</button>
      <p class="blj-quiet">Laris AI mendapat drafmu dan sampel listing. Ia tidak boleh mengarang angka terjual.</p>
    </div>`;
  }

  function listingPrefill() {
    const d = draft();
    return {
      title: d.listing.title || d.idea.name || '',
      description: d.listing.description || d.idea.description || '',
      sku: !!d.listing.sku,
      variations: d.listing.variations || '',
    };
  }

  function widgetListing() {
    const listing = listingPrefill();
    const sku = !!listing.sku;
    const sample = samplePhotoUrl();
    const fromSample = !_photoUrl && !!sample;
    const preview = sample
      ? `<img class="blj-photo" data-blj-photo-preview src="${esc(sample)}" alt="Foto sampel listing mirip">`
      : '<img class="blj-photo" data-blj-photo-preview alt="" hidden>';
    const analysis = draft().analysis || {};
    const hint = analysis.ran
      ? `<p class="blj-quiet">${esc(priceNote(analysis))}${arr(analysis.words).length ? ` Kata sering di judul sampel: ${esc(analysis.words.join(', '))}.` : ''}</p>`
      : '<p class="blj-quiet">Jalankan analisis di langkah sebelumnya supaya penilaian memakai listing yang ketemu, bukan tebakan.</p>';
    return `<div class="blj-form">
      <h3>Nilai listingmu</h3>
      <p class="blj-quiet">Bandingkan drafmu dengan kompetitor dari langkah ide. Judul dan deskripsi diisi dari langkah 1 kalau sudah ada.</p>
      <div class="blj-photo-block">
        ${preview}
        ${fromSample ? '<p class="blj-quiet">Foto sampel dari listing mirip. Kamu bisa unggah foto sendiri — hanya tampil di perangkat ini, kami tidak menyimpan.</p>' : '<p class="blj-quiet">Unggah foto kalau mau. Hanya tampil di perangkat ini; kami tidak menyimpan. Pakai foto yang haknya kamu punya.</p>'}
        <label class="blj-photo-pick">Unggah foto sendiri
          <input type="file" accept="image/*" data-blj-photo>
        </label>
      </div>
      <label>Judul <input data-blj-list="title" maxlength="200" value="${esc(listing.title)}"></label>
      <label>Deskripsi <textarea data-blj-list="description" maxlength="4000" rows="4">${esc(listing.description)}</textarea></label>
      <label class="blj-check"><input type="checkbox" data-blj-sku ${sku ? 'checked' : ''}> Ada variasi SKU</label>
      <label data-blj-variations ${sku ? '' : 'hidden'}>Nama variasi <input data-blj-list="variations" maxlength="500" value="${esc(listing.variations)}" placeholder="contoh: dusty pink, sage"></label>
      <p class="blj-quiet">Setiap variasi adalah barang lain yang harus kamu stok.</p>
      ${hint}
      <button type="button" class="btn-primary" data-blj-go="rate-listing">Nilai listing vs kompetitor</button>
      ${rateTipsHtml()}
      <button type="button" class="btn-ghost" data-blj-go="save-listing">Simpan draf listing</button>
    </div>`;
  }

  function widgetModal(lesson) {
    const idea = draft().idea;
    const price = idea.price ? rp(idea.price) : 'belum diisi';
    const cost = idea.cost ? rp(idea.cost) : 'belum diisi';
    const line = signalLine(lesson);
    return `<div class="blj-form">
      <p>Harga jual di pra-listing: <strong>${esc(price)}</strong>. Harga modal: <strong>${esc(cost)}</strong>.</p>
      <p class="blj-quiet">Kalkulator terbuka dengan angka itu. Tambahkan ongkir, kemasan, biaya platform, iklan, dan cadangan retur di sana. Simpan ke Riwayat.</p>
      ${line ? `<p class="blj-quiet">${esc(line)}</p>` : ''}
      <button type="button" class="btn-primary" data-blj-go="kalk">Buka kalkulator</button>
    </div>`;
  }

  function widgetDiskusi(lesson) {
    const line = signalLine(lesson);
    return `<div class="blj-form">
      <p>Pakai kotak <strong>Tanya komunitas</strong> di bawah. Edit draf sourcing-nya, lalu buka Diskusi — kamu yang kirim.</p>
      ${line ? `<p class="blj-verified">${esc(line)}</p>` : '<p class="blj-quiet">Belum ada pertanyaan dari akun ini.</p>'}
    </div>`;
  }

  function guideLinks(links) {
    return `<ul class="blj-links">${arr(links).map((r) => {
      const url = safeUrl(r.url);
      if (!url) return '';
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(r.name || url)}</a></li>`;
    }).join('')}</ul>`;
  }

  function platformLinks(lesson, platformId) {
    const plat = PLATFORMS.find((p) => p.id === platformId);
    const key = plat ? plat.label.split(' ')[0].toLowerCase() : platformId;
    const matched = arr(lesson.resources).filter((r) => {
      const url = safeUrl(r && r.url);
      if (!url || ytId(url)) return false;
      return String((r && r.name) || '').toLowerCase().includes(key);
    });
    if (matched.length) return matched;
    return (GUIDES[platformId] || GUIDES.shopee).links;
  }

  function platformVideo(lesson, platformId) {
    const plat = PLATFORMS.find((p) => p.id === platformId);
    const key = plat ? plat.label.split(' ')[0].toLowerCase() : platformId;
    const hit = arr(lesson.resources).find((r) => ytId(r && r.url) && String((r && r.name) || '').toLowerCase().includes(key));
    return hit ? hit.url : '';
  }

  function platformSwitcher() {
    const focus = focusPlatform();
    return `<div class="blj-plats" role="group" aria-label="Platform">${PLATFORMS.map((pl) => {
      const on = focus === pl.id;
      const logo = platformLogo(pl.id);
      return `<button type="button" class="blj-plat${on ? ' is-on' : ''}" data-blj-focus="${pl.id}" aria-pressed="${on ? 'true' : 'false'}">
        ${logo || ''}<span>${esc(pl.label)}</span>
      </button>`;
    }).join('')}</div>`;
  }

  function widgetPlatform(lesson, which) {
    const id = focusPlatform();
    const guide = GUIDES[id] || GUIDES.shopee;
    const shared = (id === 'tokopedia' || id === 'tiktok')
      ? '<p>Tokopedia dan TikTok Shop Indonesia berbagi Seller Center.</p>'
      : '';
    const video = playerHtml(platformVideo(lesson, id));
    const body = which === 'start' ? guide.start : guide.listing;
    return `<div class="blj-form">
      ${platformSwitcher()}
      ${video}
      <p>${esc(body)}</p>
      ${shared}
      ${which === 'start' ? '<ul class="blj-points"><li>KTP pemilik akun</li><li>Rekening atas nama yang sama</li><li>Alamat pengiriman yang bisa kamu layani</li></ul>' : ''}
      ${guideLinks(platformLinks(lesson, id))}
    </div>`;
  }

  function widgetFirstListing(lesson) {
    const d = draft();
    const items = [
      ['Judul', !!d.listing.title, d.listing.title || 'belum ada judul'],
      ['Deskripsi', !!d.listing.description, d.listing.description ? 'sudah ada draf' : 'belum ada deskripsi'],
      ['Harga jual', !!d.idea.price, d.idea.price ? rp(d.idea.price) : 'belum diisi di ide'],
      ['Variasi', true, d.listing.sku ? (d.listing.variations || 'ada variasi, nama belum diisi') : 'tanpa variasi'],
    ];
    const list = items.map((item) => `<li class="${item[1] ? 'is-on' : ''}"><span>${item[1] ? '✓' : '○'}</span> ${esc(item[0])}: ${esc(item[2])}</li>`).join('');
    return `${widgetPlatform(lesson, 'listing')}
      <div class="blj-form">
        <h3>Dari pra-listingmu</h3>
        <ul class="blj-checks">${list}</ul>
        <p class="blj-quiet">Foto disiapkan di perangkatmu. Kami tidak menyimpannya.</p>
        <h3>Minggu pertama</h3>
        <ul class="blj-points">
          <li>Balas chat di hari yang sama.</li>
          <li>Packing yang sesuai foto.</li>
          <li>Siapkan jawaban kalau pembeli komplain ukuran atau warna.</li>
        </ul>
      </div>`;
  }

  function outcomeHtml() {
    const o = _course && _course.outcome;
    if (!o) return '<p class="blj-quiet">URL toko belum tersimpan.</p>';
    const bits = [`<p>Tautan tersimpan · ${esc(o.platform || '')}<br><a href="${esc(safeUrl(o.shop_url) || '#')}" target="_blank" rel="noopener noreferrer">${esc(o.shop_url || '')}</a></p>`];
    if (o.platform !== 'shopee') {
      bits.push('<p>Omset Laris baru dihitung untuk toko Shopee yang listingnya ada di data kami. Tautan ini tetap tercatat.</p>');
    } else if (!o.est_listing_n) {
      bits.push('<p>Belum ada data Laris untuk toko ini. Bukan berarti penjualannya nol.</p>');
    } else if (o.est_omset_idr == null) {
      bits.push(`<p>Ada ${o.est_listing_n} listing toko ini di data Laris, tapi omset perkiraannya belum terisi.</p>`);
    } else {
      bits.push(`<p>Dari ${o.est_listing_n} listing toko ini yang ada di data Laris, jumlah omset bulanannya <strong>${esc(rp(o.est_omset_idr))}</strong>, perkiraan. Bukan seluruh toko, dan bukan angka resmi Shopee.</p>`);
    }
    if (o.reached_3jt_at) {
      bits.push('<p class="blj-verified">Omset perkiraan dari data Laris sudah melewati Rp 3 juta. Itu omset kotor, bukan untung.</p>');
    }
    if (o.reported_omset_idr != null) {
      bits.push(`<p>Laporanmu sendiri: ${esc(rp(o.reported_omset_idr))}. Angka ini tidak menghitung milestone Rp 3 juta.</p>`);
    }
    const idea = draft().idea;
    if (idea.price || idea.cost) {
      bits.push(`<p class="blj-quiet">Di kalkulator, harga jual ${idea.price ? esc(rp(idea.price)) : 'belum diisi'} dan modal ${idea.cost ? esc(rp(idea.cost)) : 'belum diisi'}. Untung ada di sana, bukan di angka omset ini.</p>`);
    }
    return bits.join('');
  }

  function widgetShop(lesson) {
    const line = signalLine(lesson);
    const reported = _course && _course.outcome && _course.outcome.reported_omset_idr;
    return `<div class="blj-form">
      ${line ? `<p class="blj-quiet">${esc(line)}</p>` : ''}
      <label>URL toko <input data-blj-shop-url placeholder="https://shopee.co.id/tokokamu" value="${esc((_course.outcome && _course.outcome.shop_url) || '')}"></label>
      <button type="button" class="btn-primary" data-blj-go="link-shop">Simpan URL toko</button>
      ${outcomeHtml()}
      <label>Omset bulan ini menurutmu, kalau sudah tahu <input data-blj-report inputmode="numeric" placeholder="contoh 1500000" value="${reported ? esc(String(reported)) : ''}"></label>
      <p class="blj-quiet">Ini laporanmu, bukan data Laris. Kosongkan lalu simpan kalau mau menghapusnya.</p>
      <button type="button" class="btn-ghost" data-blj-go="report">Simpan laporan omset</button>
    </div>`;
  }

  function widgetWatch(lesson) {
    const favs = arr(_course && _course.favorites);
    const favList = favs.length
      ? `<ul class="blj-comps">${favs.map((f) => `<li class="blj-comp"><div><strong>${esc(f.name || 'Produk')}</strong><span>${f.price ? esc(rp(f.price)) : '—'}${f.store ? ` · ${esc(f.store)}` : ''}</span></div></li>`).join('')}</ul>`
      : '<p class="blj-quiet">Belum ada Favorit. Simpan dari hasil analisis, atau tempel URL produk Shopee.</p>';
    const notes = arr(draft().manual);
    const noteList = notes.length
      ? `<ul class="blj-links">${notes.map((n) => `<li>${esc(n.label || n.url)} <span class="blj-quiet">catatanmu, tanpa angka penjualan</span></li>`).join('')}</ul>`
      : '';
    const line = signalLine(lesson);
    return `<div class="blj-form">
      ${line ? `<p class="blj-quiet">${esc(line)}</p>` : ''}
      <h3>Yang sedang dipantau</h3>
      ${favList}
      ${noteList}
      <label>URL produk kompetitor <input data-blj-watch-url placeholder="https://shopee.co.id/nama-i.123.456"></label>
      <button type="button" class="btn-primary" data-blj-go="watch">Simpan kompetitor</button>
      <button type="button" class="btn-ghost" data-blj-go="tracker">Buka Favorit Aku</button>
    </div>`;
  }

  function widgetHtml(lesson) {
    if (lesson.slug === 'ide-produk') return widgetIde();
    if (lesson.slug === 'pra-listing') return widgetListing();
    if (lesson.slug === 'hitung-modal') return widgetModal(lesson);
    if (lesson.slug === 'tanya-sumber') return widgetDiskusi(lesson);
    if (lesson.slug === 'cara-mulai') return widgetPlatform(lesson, 'start');
    if (lesson.slug === 'listing-pertama') return widgetFirstListing(lesson);
    if (lesson.slug === 'tautan-toko') return widgetShop(lesson);
    if (lesson.slug === 'pantau-kompetitor') return widgetWatch(lesson);
    return '';
  }

  function lessonChrome(found) {
    const items = orderedLessons();
    const i = items.findIndex((item) => item.lesson.slug === found.lesson.slug);
    const mods = modules();
    const mi = mods.findIndex((m) => m.slug === found.module.slug);
    return `<div class="blj-chrome"><div class="blj-top">
      <button type="button" class="blj-back" data-blj-back>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        Belajar
      </button>
      <span class="blj-pos">Langkah ${mi >= 0 ? mi + 1 : 1} dari ${mods.length || 4}</span>
      <button type="button" class="blj-navbtn" data-blj-step="-1" ${i > 0 ? '' : 'disabled'} aria-label="Bagian sebelumnya">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>
      </button>
      <button type="button" class="blj-navbtn" data-blj-step="1" ${i >= 0 && i < items.length - 1 ? '' : 'disabled'} aria-label="Bagian berikutnya">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg>
      </button>
    </div></div>`;
  }

  function finishHtml(lesson) {
    const done = lesson.status === 'done';
    const next = neighbor(1);
    if (done) {
      return next
        ? '<button type="button" class="blj-finish is-done" data-blj-step="1">Lanjut ke berikutnya</button>'
        : '<p class="blj-finish is-done" role="status">Semua bagian di jalur ini selesai</p>';
    }
    return next
      ? '<button type="button" class="blj-finish" data-blj-done>Lanjut ke berikutnya</button>'
      : '<button type="button" class="blj-finish" data-blj-done>Selesai</button>';
  }

  function lessonMain(found) {
    const lesson = found.lesson;
    const mod = found.module;
    const done = lesson.status === 'done';
    const skipped = lesson.status === 'skipped';
    const widget = widgetHtml(lesson);
    return `${lessonChrome(found)}
      <article class="blj-lesson">
        <p class="blj-kicker">${esc(mod.title)}</p>
        <h2>${esc(lesson.title)}</h2>
        <p class="blj-kind">${esc(kindLabel(lesson.kind))}${lesson.est_mins ? ` · ${lesson.est_mins} mnt` : ''}</p>
        ${!lesson.applicable ? '<p class="blj-quiet">Bagian ini tidak masuk hitungan progresmu. Tetap bisa dibaca.</p>' : ''}
        ${mediaHtml(lesson)}
        ${paras(lesson.body) ? `<div class="blj-body">${paras(lesson.body)}</div>` : ''}
        ${widget ? sectionHtml('', '', widget) : ''}
        ${resourcesHtml(lesson)}
        ${questionsHtml(lesson)}
        ${communityAskHtml(lesson)}
        ${finishHtml(lesson)}
        <div class="blj-actions">
          ${done
            ? '<button type="button" class="btn-ghost" data-blj-clear>Buka lagi</button>'
            : `${skipped
                 ? '<button type="button" class="btn-ghost" data-blj-clear>Kembalikan</button>'
                 : '<button type="button" class="btn-ghost" data-blj-skip>Lewati</button>'}`}
        </div>
      </article>`;
  }

  function mobileBar(found) {
    const lesson = found.lesson;
    const done = lesson.status === 'done';
    const next = neighbor(1);
    const label = next ? 'Lanjut ke berikutnya' : (done ? 'Selesai' : 'Selesai');
    const primary = done
      ? `<button type="button" class="blj-finish is-done" data-blj-step="1" ${next ? '' : 'disabled'}>${label}</button>`
      : `<button type="button" class="blj-finish" data-blj-done>${label}</button>`;
    return `<div class="blj-mobile-bar">${primary}</div>`;
  }

  function homeMain() {
    const p = _course.progress || {};
    const next = p.next || null;
    const existing = _course.track === 'existing';
    const baseline = _course.baseline || 'unknown';
    const plats = arr(_course.platforms);
    const complete = (p.total || 0) > 0 && (p.done || 0) >= p.total && !next;
    const chips = PLATFORMS.map((pl) => {
      const on = plats.includes(pl.id);
      return `<button type="button" class="blj-chip${on ? ' is-on' : ''}" data-blj-platform="${pl.id}" aria-pressed="${on ? 'true' : 'false'}">${esc(pl.label)}</button>`;
    }).join('');
    const bases = [
      ['no_store', 'Belum punya toko'],
      ['no_sales', 'Punya toko, belum ada penjualan'],
      ['has_sales', 'Sudah ada penjualan'],
    ].map((pair) => {
      const on = baseline === pair[0];
      return `<button type="button" data-blj-baseline="${pair[0]}" aria-pressed="${on ? 'true' : 'false'}">${esc(pair[1])}</button>`;
    }).join('');
    return `<header class="blj-hero">
      <p class="blj-kicker">Belajar</p>
      <h2>Dari nol sampai jualan online</h2>
      <p class="blj-lead">Gratis. Empat langkah, dari ide produk sampai pantau kompetitor. Semua bagian bisa dibaca. Tidak ada yang dikunci.</p>
    </header>
    ${complete ? `<section class="blj-done-card">
      <h3>Kamu sampai di sini</h3>
      <p>Listing dan pantauan ada di bagian yang kamu selesaikan. Kalau mau dibimbing mentor, catat minatmu di Edukasi.</p>
      <button type="button" class="btn-primary" data-blj-action="edukasi">Buka Edukasi</button>
    </section>` : (next ? `<section class="blj-next-card">
      <p class="blj-kicker">Langkah berikutnya</p>
      <button type="button" class="blj-next-go" data-blj-lesson="${esc(next.slug)}">
        <strong>${esc(next.title)}</strong>
        <span>${esc(next.module_title || '')}</span>
      </button>
    </section>` : '')}
    <div class="blj-platforms">
      <p class="blj-kicker">Posisi tokomu sekarang</p>
      <div class="blj-track" role="group" aria-label="Posisi toko">${bases}</div>
      <p class="blj-quiet">Pilihan ini mencatat titik awal. Boleh dikosongkan. Yang sudah punya toko tetap bisa membaca cari produk dan sumber; yang dihitung mulai dari tempat jual.</p>
      ${existing ? '<p class="blj-quiet">Langkah awal yang kamu selesaikan sendiri tetap masuk hitungan.</p>' : ''}
    </div>
    <div class="blj-platforms">
      <p class="blj-kicker">Tempat yang mau kamu jual</p>
      <div class="blj-chips">${chips}</div>
      <p class="blj-quiet">Panduan di langkah jual mengikuti platform yang sedang kamu lihat. Data LarisID adalah data Shopee.</p>
    </div>`;
  }

  function pageHtml(found) {
    return `<div class="blj-shell">
      <div class="blj-main">
        ${stepsHtml()}
        ${found ? lessonMain(found) : homeMain()}
      </div>
      ${railHtml()}
    </div>
    ${sheetHtml()}
    ${found ? mobileBar(found) : ''}`;
  }

  function paint() {
    const el = rootEl();
    if (!el || !_course) return;
    const found = _lessonSlug ? lessonBySlug(_lessonSlug) : null;
    if (_lessonSlug && !found) _lessonSlug = null;
    scrollTopIfNeeded(_lessonSlug || 'home');
    el.innerHTML = pageHtml(_lessonSlug ? lessonBySlug(_lessonSlug) : null);
  }

  function loadFailReason(err) {
    const code = (err && err.payload && err.payload.error)
      || (err && err.message)
      || (err && err.code)
      || '';
    if (code === 'login_required' || /login|jwt|auth/i.test(String(code))) {
      return 'Login dulu, lalu buka Belajar lagi.';
    }
    if (code === 'admin_only') {
      return 'Belajar masih terbatas untuk admin platform.';
    }
    if (code === 'no_client') {
      return 'Koneksi belum siap. Muat ulang halaman.';
    }
    return 'Materi belum bisa dimuat.';
  }

  async function fetchCourse() {
    if (!_ctx || !_ctx.supabase) throw new Error('no_client');
    const data = await rpc('belajar_course');
    if (!data || data.ok === false) {
      throw Object.assign(new Error((data && data.error) || 'gagal'), { payload: data });
    }
    return data;
  }

  async function load(opts) {
    const el = rootEl();
    const gen = ++_loadGen;
    if (el && !_course) el.innerHTML = '<p class="blj-loading">Menyusun materi…</p>';
    try {
      let data;
      try {
        data = await fetchCourse();
      } catch (first) {
        const code = (first && first.payload && first.payload.error) || (first && first.message) || '';
        // Auth/session often lands a beat after the first paint — one quiet retry.
        if (code === 'login_required' || code === 'no_client') {
          await new Promise((r) => setTimeout(r, 450));
          if (gen !== _loadGen) return;
          data = await fetchCourse();
        } else {
          throw first;
        }
      }
      if (gen !== _loadGen) return;
      _course = data;
      try {
        paint();
      } catch (paintErr) {
        try { console.warn('[belajar] paint', paintErr); } catch (_) {}
        if (el) {
          el.innerHTML = `<p class="blj-loading">Materi terunduh, tapi tampilannya gagal.</p>
            <p class="blj-quiet">${esc(String((paintErr && paintErr.message) || paintErr || ''))}</p>
            <button type="button" class="btn-primary" data-blj-retry>Coba lagi</button>`;
        }
        return;
      }
      if (opts && opts.entry && _ctx && _ctx.log) {
        _ctx.log('belajar_open', { ui: 'gpt', track: data.track || '', baseline: data.baseline || '' });
      }
    } catch (err) {
      if (gen !== _loadGen) return;
      if (el) {
        el.innerHTML = `<p class="blj-loading">${esc(loadFailReason(err))}</p>
          <button type="button" class="btn-primary" data-blj-retry>Coba lagi</button>`;
      }
      try { console.warn('[belajar]', err); } catch (_) {}
    }
  }

  function readAnswers(scope) {
    const out = {};
    if (!scope) return out;
    scope.querySelectorAll('[data-blj-answer]').forEach((node) => {
      out[node.getAttribute('data-blj-answer')] = node.value || '';
    });
    return out;
  }

  async function saveDraft(next) {
    const data = await rpc('belajar_save_draft', { p_draft: next });
    if (!data || data.ok === false) throw Object.assign(new Error('draft'), { payload: data });
    _course = data;
    return data;
  }

  async function mark(status) {
    if (_busy || !_lessonSlug) return;
    const found = lessonBySlug(_lessonSlug);
    if (!found) return;
    if (status === 'skipped') {
      const ok = global.confirm('Lewati bagian ini? Tidak dihitung selesai.');
      if (!ok) return;
    }
    _busy = true;
    const article = rootEl() && rootEl().querySelector('.blj-lesson');
    try {
      const data = await rpc('belajar_mark_lesson', {
        p_lesson: found.lesson.id,
        p_status: status,
        p_answers: readAnswers(article),
      });
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = data;
      if (status === 'done' && _ctx && _ctx.log) {
        _ctx.log('belajar_lesson_done', { ui: 'gpt', slug: found.lesson.slug });
      }
      if (status === 'done' && _ctx && _ctx.open) {
        const step = neighbor(1);
        const fallback = data.progress && data.progress.next;
        const slug = step ? step.lesson.slug : (fallback && fallback.slug ? fallback.slug : null);
        _ctx.open(slug);
      } else {
        paint();
      }
      if (_ctx && _ctx.toast) {
        _ctx.toast(status === 'done' ? 'Lanjut.' : status === 'skipped' ? 'Bagian dilewati.' : status === 'clear' ? 'Bagian dibuka lagi.' : 'Jawaban tersimpan.');
      }
    } catch (err) {
      if (_ctx && _ctx.toast) _ctx.toast('Belum tersimpan. Coba lagi.');
      try { console.warn('[belajar]', err); } catch (_) {}
    } finally {
      _busy = false;
    }
  }

  async function setState(track, platforms) {
    if (_busy || !_course) return;
    _busy = true;
    try {
      const data = await rpc('belajar_set_state', { p_track: track, p_platforms: platforms });
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = data;
      paint();
      if (_ctx && _ctx.log) {
        _ctx.log('belajar_track_set', { ui: 'gpt', track: track, platforms: platforms });
      }
    } catch (err) {
      if (_ctx && _ctx.toast) _ctx.toast('Pilihan belum tersimpan.');
      try { console.warn('[belajar]', err); } catch (_) {}
    } finally {
      _busy = false;
    }
  }

  function toastFail(err) {
    const data = err && err.payload;
    if (_ctx && _ctx.toast) _ctx.toast(data ? failText(data) : 'Belum tersimpan. Coba lagi.');
  }

  async function onChoice(choice) {
    if (_busy) return;
    const idea = readIdea(rootEl());
    idea.choice = choice;
    const next = draft();
    next.idea = idea;
    _busy = true;
    try {
      await saveDraft(next);
      paint();
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  async function onAnalyze() {
    if (_busy || !_ctx || !_ctx.search) return;
    const idea = readIdea(rootEl());
    idea.choice = 'yes';
    if (!String(idea.name || '').trim()) {
      if (_ctx.toast) _ctx.toast('Isi nama produk dulu.');
      return;
    }
    _busy = true;
    const btn = rootEl() && rootEl().querySelector('[data-blj-go="analyze"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Mencari listing…'; }
    try {
      const q = [idea.name, idea.description].filter(Boolean).join(' ').trim();
      const rows = await _ctx.search(q || idea.name);
      const next = draft();
      next.idea = idea;
      next.analysis = summarize(idea, rows);
      if (!next.listing.title && idea.name) next.listing.title = idea.name;
      if (!next.listing.description && idea.description) next.listing.description = idea.description;
      await saveDraft(next);
      if (_ctx.log) _ctx.log('belajar_analysis', { ui: 'gpt', n: next.analysis.n || 0 });
      paint();
    } catch (err) {
      toastFail(err);
      try { console.warn('[belajar]', err); } catch (_) {}
    } finally {
      _busy = false;
    }
  }

  function buildRating(listing, analysis) {
    const tips = [];
    let score = 4;
    const title = String(listing.title || '').trim();
    const desc = String(listing.description || '').trim();
    const words = arr(analysis && analysis.words);
    const n = (analysis && analysis.n) || 0;
    if (!analysis || !analysis.ran) {
      return {
        ran: true,
        score: 3,
        tips: ['Jalankan analisis ide dulu supaya penilaian memakai listing yang ketemu, bukan tebakan.'],
      };
    }
    if (!n) {
      tips.push('Sampel kompetitor kosong. Coba kata yang lebih umum di langkah ide, atau cari inspirasi di Cari Produk.');
    } else {
      score += 2;
    }
    if (title.length >= 20 && title.length <= 100) {
      score += 2;
      tips.push('Panjang judulmu masuk kisaran yang biasa dipakai di sampel.');
    } else if (title.length < 12) {
      tips.push('Judul masih pendek. Sebut isi atau manfaat yang orang ketik saat cari.');
    } else if (title.length > 120) {
      tips.push('Judul terlalu panjang. Potong ke kata yang paling sering dicari.');
    } else {
      score += 1;
    }
    if (words.length) {
      const lower = title.toLowerCase();
      const hit = words.filter((w) => lower.includes(w));
      if (hit.length) {
        score += 1;
        tips.push(`Judulmu sudah memakai kata yang sering muncul di sampel: ${hit.join(', ')}.`);
      } else {
        tips.push(`Coba sisipkan kata yang sering di judul sampel: ${words.slice(0, 4).join(', ')}.`);
      }
    }
    if (desc.length >= 40) {
      score += 1;
      tips.push('Deskripsi sudah ada. Pastikan bahan, ukuran, dan isi paket jujur.');
    } else {
      tips.push('Tambah deskripsi singkat: bahan, ukuran, dan apa yang pembeli terima.');
    }
    if (analysis.median_price) {
      tips.push(priceNote(analysis));
      if (analysis.user_price && analysis.price_vs === 'below') {
        tips.push('Harga jual di bawah median sampel — cek masih di atas modal setelah biaya platform.');
      } else if (analysis.user_price && analysis.price_vs === 'near') {
        score += 1;
      }
    }
    if (arr(analysis.sample).some((r) => r.image)) {
      tips.push('Ada foto sampel dari listing mirip. Unggah foto sendiri kalau hak fotonya kamu punya — jangan pakai foto merek orang lain.');
    }
    score = Math.max(1, Math.min(10, score));
    return { ran: true, score, tips: tips.slice(0, 6) };
  }

  async function onRateListing() {
    if (_busy) return;
    const listing = readListing(rootEl());
    if (!String(listing.title || '').trim()) {
      if (_ctx && _ctx.toast) _ctx.toast('Isi judul dulu.');
      return;
    }
    const next = draft();
    if (!listing.title && next.idea.name) listing.title = next.idea.name;
    if (!listing.description && next.idea.description) listing.description = next.idea.description;
    next.listing = listing;
    next.rating = buildRating(listing, next.analysis);
    _busy = true;
    try {
      await saveDraft(next);
      paint();
      if (_ctx && _ctx.toast) _ctx.toast('Penilaian siap. Baca saran di bawah.');
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  async function onSaveListing() {
    if (_busy) return;
    const listing = readListing(rootEl());
    if (!String(listing.title || '').trim()) {
      if (_ctx && _ctx.toast) _ctx.toast('Isi judul dulu.');
      return;
    }
    const next = draft();
    next.listing = listing;
    _busy = true;
    try {
      await saveDraft(next);
      paint();
      if (_ctx && _ctx.toast) _ctx.toast('Draf listing tersimpan.');
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  function larisPrompt() {
    const d = draft();
    const a = d.analysis || {};
    const lines = [
      'Tolong bantu rapikan judul dan deskripsi listing ini.',
      'Pakai hanya fakta di bawah. Jangan mengarang angka terjual atau omset.',
      '',
      `Judul draf: ${d.listing.title || '(belum)'}`,
      `Deskripsi: ${d.listing.description || '(belum)'}`,
      `Variasi: ${d.listing.sku ? (d.listing.variations || 'ada, nama belum diisi') : 'tidak'}`,
      `Harga jual: ${a.user_price || d.idea.price || '(belum)'}`,
      `Median harga sampel: ${a.median_price || '(tidak ada)'} dari ${a.n || 0} listing`,
      `Kata yang sering di judul sampel: ${arr(a.words).join(', ') || '(tidak ada)'}`,
    ];
    arr(a.sample).slice(0, 5).forEach((row, i) => {
      const omset = row.omset == null ? 'tidak ada' : `${row.omset} perkiraan`;
      lines.push(`${i + 1}. ${row.name} · harga ${row.price || '—'} · omset ${omset}`);
    });
    return lines.join('\n');
  }

  function parseShopeeItem(url) {
    const s = String(url || '');
    let m = s.match(/-i\.(\d+)\.(\d+)/);
    if (m) return { shop_id: m[1], item_id: m[2] };
    m = s.match(/\/product\/(\d+)\/(\d+)/);
    if (m) return { shop_id: m[1], item_id: m[2] };
    return null;
  }

  function httpsUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/\//, '');
    u = u.replace(/^http:\/\//i, 'https://');
    return safeUrl(u);
  }

  async function onWatch() {
    if (_busy || !_ctx) return;
    const input = rootEl() && rootEl().querySelector('[data-blj-watch-url]');
    const url = httpsUrl(input && input.value);
    if (!url) {
      if (_ctx.toast) _ctx.toast('Tempel URL produknya.');
      return;
    }
    _busy = true;
    try {
      const parsed = parseShopeeItem(url);
      let found = null;
      if (parsed && _ctx.lookupListing) {
        found = await _ctx.lookupListing(Number(parsed.item_id), Number(parsed.shop_id));
      }
      if (found && _ctx.favorite) {
        const ok = await _ctx.favorite(found);
        if (ok) {
          const data = await rpc('belajar_course');
          if (data && data.ok !== false) _course = data;
          paint();
        }
        return;
      }
      const next = draft();
      if (!next.manual.some((row) => row.url === url)) {
        next.manual = next.manual.concat([{ url, label: url }]).slice(0, 8);
      }
      await saveDraft(next);
      if (_ctx.toast) _ctx.toast('Disimpan sebagai catatanmu. Angka penjualannya tidak kami isi.');
      paint();
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  async function onFav(index) {
    if (_busy || !_ctx || !_ctx.favorite) return;
    const row = arr(draft().analysis.sample)[index];
    if (!row || !row.item_id || !row.shop_id) return;
    _busy = true;
    try {
      const ok = await _ctx.favorite({
        item_id: Number(row.item_id),
        shop_id: Number(row.shop_id),
        product_name: row.name || '',
        store_name: row.store || '',
        price: row.price,
        keyword: row.keyword || '',
        category: row.category || '',
        image_url: row.image || '',
      });
      if (!ok) return;
      const data = await rpc('belajar_course');
      if (data && data.ok !== false) _course = data;
      paint();
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  async function onLinkShop() {
    if (_busy) return;
    const input = rootEl() && rootEl().querySelector('[data-blj-shop-url]');
    const url = String((input && input.value) || '').trim();
    if (!url) {
      if (_ctx && _ctx.toast) _ctx.toast('Tempel URL toko dulu.');
      return;
    }
    _busy = true;
    try {
      const data = await rpc('belajar_link_shop', { p_url: url });
      if (!data || data.ok === false) throw Object.assign(new Error('link'), { payload: data });
      _course = data;
      if (_ctx && _ctx.log) _ctx.log('belajar_shop_linked', { ui: 'gpt', platform: (data.outcome && data.outcome.platform) || '' });
      paint();
      if (_ctx && _ctx.toast) _ctx.toast('URL toko tersimpan.');
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  async function onReport() {
    if (_busy) return;
    const input = rootEl() && rootEl().querySelector('[data-blj-report]');
    const amount = moneyOrNull(input && input.value);
    _busy = true;
    try {
      const data = await rpc('belajar_set_reported_omset', { p_amount: amount });
      if (!data || data.ok === false) throw Object.assign(new Error('report'), { payload: data });
      _course = data;
      paint();
      if (_ctx && _ctx.toast) _ctx.toast(amount == null ? 'Laporan dihapus.' : 'Laporan tersimpan. Bukan data Laris.');
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  async function onBaseline(value) {
    if (_busy) return;
    _busy = true;
    try {
      const data = await rpc('belajar_set_baseline', { p_baseline: value });
      if (!data || data.ok === false) throw Object.assign(new Error('baseline'), { payload: data });
      _course = data;
      if (_ctx && _ctx.log) _ctx.log('belajar_baseline', { ui: 'gpt', baseline: value });
      paint();
    } catch (err) {
      toastFail(err);
    } finally {
      _busy = false;
    }
  }

  function diskusiPayload() {
    const name = draft().idea.name || draft().listing.title || 'produk saya';
    const typed = fieldVal(rootEl(), '[data-blj-ask-body]');
    const body = (typed && typed.trim()) || _askDraft.body || askSeed(_lessonSlug);
    const title = (_lessonSlug === 'tanya-sumber' ? `Sourcing ${name}` : body).slice(0, 120);
    return { title, body: body.slice(0, 4000) };
  }

  function onClick(e) {
    if (e.target.classList && e.target.classList.contains('blj-sheet')) {
      e.target.hidden = true;
      return;
    }
    const el = e.target.closest('[data-blj-lesson],[data-blj-back],[data-blj-platform],[data-blj-done],[data-blj-skip],[data-blj-draft],[data-blj-clear],[data-blj-action],[data-blj-yt],[data-blj-retry],[data-blj-step],[data-blj-go],[data-blj-choice],[data-blj-baseline],[data-blj-focus],[data-blj-sheet],[data-blj-sheet-close],[data-blj-tab],[data-blj-fav],[data-blj-module]');
    if (!el || !rootEl() || !rootEl().contains(el)) return;
    if (el.hasAttribute('data-blj-retry')) {
      e.preventDefault();
      void load();
      return;
    }
    if (el.hasAttribute('data-blj-yt')) {
      e.preventDefault();
      const id = el.getAttribute('data-blj-yt') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      const frame = document.createElement('div');
      frame.className = 'blj-frame';
      frame.innerHTML = `<iframe title="Video" src="https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      el.replaceWith(frame);
      return;
    }
    if (el.hasAttribute('data-blj-sheet')) {
      e.preventDefault();
      const sheet = rootEl().querySelector('.blj-sheet');
      if (sheet) sheet.hidden = false;
      return;
    }
    if (el.hasAttribute('data-blj-sheet-close')) {
      e.preventDefault();
      const sheet = rootEl().querySelector('.blj-sheet');
      if (sheet) sheet.hidden = true;
      return;
    }
    if (el.hasAttribute('data-blj-tab')) {
      e.preventDefault();
      const tab = el.getAttribute('data-blj-tab');
      if (tab === 'diskusi') {
        const payload = diskusiPayload();
        if (_ctx && _ctx.action) _ctx.action('community', payload);
        return;
      }
      _tab = tab || 'materi';
      paint();
      return;
    }
    if (el.hasAttribute('data-blj-module')) {
      e.preventDefault();
      const mod = modules().find((m) => m.slug === el.getAttribute('data-blj-module'));
      if (!mod || !_ctx || !_ctx.open) return;
      const lessons = arr(mod.lessons);
      const next = lessons.find((l) => l.applicable && l.status !== 'done') || lessons[0];
      if (next) _ctx.open(next.slug);
      return;
    }
    if (el.hasAttribute('data-blj-step')) {
      e.preventDefault();
      if (el.disabled) return;
      const dir = Number(el.getAttribute('data-blj-step'));
      const next = neighbor(dir);
      if (next && _ctx && _ctx.open) _ctx.open(next.lesson.slug);
      return;
    }
    if (el.hasAttribute('data-blj-lesson')) {
      e.preventDefault();
      const slug = el.getAttribute('data-blj-lesson');
      if (_ctx && _ctx.open) _ctx.open(slug);
      return;
    }
    if (el.hasAttribute('data-blj-back')) {
      e.preventDefault();
      if (_ctx && _ctx.open) _ctx.open(null);
      return;
    }
    if (el.hasAttribute('data-blj-platform')) {
      e.preventDefault();
      const id = el.getAttribute('data-blj-platform');
      const cur = arr(_course && _course.platforms);
      const next = cur.includes(id) ? cur.filter((p) => p !== id) : cur.concat(id);
      void setState((_course && _course.track) || 'new', next);
      return;
    }
    if (el.hasAttribute('data-blj-focus')) {
      e.preventDefault();
      const id = el.getAttribute('data-blj-focus');
      _focus = id;
      const cur = arr(_course && _course.platforms);
      if (!cur.includes(id)) {
        void setState((_course && _course.track) || 'new', cur.concat(id));
        return;
      }
      paint();
      return;
    }
    if (el.hasAttribute('data-blj-choice')) {
      e.preventDefault();
      void onChoice(el.getAttribute('data-blj-choice'));
      return;
    }
    if (el.hasAttribute('data-blj-baseline')) {
      e.preventDefault();
      void onBaseline(el.getAttribute('data-blj-baseline'));
      return;
    }
    if (el.hasAttribute('data-blj-fav')) {
      e.preventDefault();
      void onFav(Number(el.getAttribute('data-blj-fav')));
      return;
    }
    if (el.hasAttribute('data-blj-go')) {
      e.preventDefault();
      const go = el.getAttribute('data-blj-go');
      if (go === 'analyze') { void onAnalyze(); return; }
      if (go === 'rate-listing') { void onRateListing(); return; }
      if (go === 'save-listing') { void onSaveListing(); return; }
      if (go === 'link-shop') { void onLinkShop(); return; }
      if (go === 'report') { void onReport(); return; }
      if (go === 'watch') { void onWatch(); return; }
      if (go === 'search' && _ctx && _ctx.action) {
        _ctx.action('directory', { query: el.getAttribute('data-q') || '' });
        return;
      }
      if (go === 'kalk' && _ctx && _ctx.action) {
        const idea = draft().idea;
        _ctx.action('kalkulator', { kalc: { price: idea.price || 0, cogs: idea.cost || 0, marketplace: 'shopee' } });
        return;
      }
      if (go === 'ask' && _ctx && _ctx.action) {
        _ctx.action('chat', { prompt: larisPrompt() });
        return;
      }
      if (go === 'diskusi' && _ctx && _ctx.action) {
        _ctx.action('community', diskusiPayload());
        return;
      }
      if (go === 'tracker' && _ctx && _ctx.action) {
        _ctx.action('tracker');
      }
      return;
    }
    if (el.hasAttribute('data-blj-action')) {
      e.preventDefault();
      if (_ctx && _ctx.action) _ctx.action(el.getAttribute('data-blj-action'));
      return;
    }
    if (el.hasAttribute('data-blj-done')) { e.preventDefault(); void mark('done'); return; }
    if (el.hasAttribute('data-blj-skip')) { e.preventDefault(); void mark('skipped'); return; }
    if (el.hasAttribute('data-blj-draft')) { e.preventDefault(); void mark('draft'); return; }
    if (el.hasAttribute('data-blj-clear')) { e.preventDefault(); void mark('clear'); return; }
  }

  function onChange(e) {
    const el = e.target;
    if (!el || !rootEl() || !rootEl().contains(el)) return;
    if (el.hasAttribute('data-blj-sku')) {
      const box = rootEl().querySelector('[data-blj-variations]');
      if (box) box.hidden = !el.checked;
      return;
    }
    if (el.hasAttribute('data-blj-photo')) {
      const file = el.files && el.files[0];
      if (_photoUrl) {
        try { URL.revokeObjectURL(_photoUrl); } catch (_) {}
      }
      _photoUrl = file ? URL.createObjectURL(file) : '';
      const img = rootEl().querySelector('[data-blj-photo-preview]');
      if (img) {
        img.hidden = !_photoUrl;
        if (_photoUrl) img.src = _photoUrl;
      }
    }
  }

  function ensureBound() {
    const el = rootEl();
    if (!el || _bound) return;
    _bound = true;
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
  }

  function render(ctx, opts) {
    _ctx = ctx || _ctx;
    opts = opts || {};
    ensureBound();
    const slug = opts.lesson || null;
    const changed = slug !== _lessonSlug;
    _lessonSlug = slug;
    if (changed) {
      _tab = '';
      _askDraft = { slug: '', body: '' };
    }
    if (changed && _lessonSlug && _ctx && _ctx.log) {
      _ctx.log('belajar_lesson_open', { ui: 'gpt', slug: _lessonSlug });
    }
    if (!_course || opts.entry) {
      if (_course) paint();
      return load(opts);
    }
    paint();
    return undefined;
  }

  async function syncHome(ctx) {
    _ctx = ctx || _ctx;
    const card = document.getElementById('home-belajar');
    if (!card) return;
    if (!_ctx || !_ctx.user || !_ctx.supabase) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    try {
      const { data, error } = await _ctx.supabase.rpc('belajar_course');
      if (error || !data || data.ok === false) {
        card.hidden = true;
        return;
      }
      _course = data;
      const p = data.progress || {};
      const next = p.next || null;
      const finished = (p.total || 0) > 0 && (p.done || 0) >= p.total && !next;
      const title = next ? next.title : (finished ? 'Kursus selesai' : 'Dari nol sampai jualan online');
      const label = next ? 'Lanjut belajar' : (finished ? 'Lihat lagi' : 'Mulai belajar');
      card.hidden = false;
      card.innerHTML = `<p class="home-ret-kicker">Belajar · ${p.done || 0} dari ${p.total || 0}</p>
        <h2>${esc(title)}</h2>
        <button type="button" class="home-ret-link" data-home-belajar>${esc(label)}</button>`;
      card.querySelector('[data-home-belajar]').addEventListener('click', () => {
        if (_ctx && _ctx.open) _ctx.open(next ? next.slug : null);
      });
    } catch (_) {
      card.hidden = true;
    }
  }

  function pretty(value, empty) {
    if (value == null) return empty;
    try { return JSON.stringify(value, null, 2); } catch (_) { return empty; }
  }

  function moduleAdmin(mod) {
    const lessons = arr(mod.lessons).map((lesson) => {
      const kinds = ['text', 'document', 'video', 'tool'].map((k) =>
        `<option value="${k}"${lesson.kind === k ? ' selected' : ''}>${k}</option>`).join('');
      const plats = [{ id: '', label: 'Semua' }].concat(PLATFORMS).map((pl) =>
        `<option value="${pl.id}"${(lesson.platform || '') === pl.id ? ' selected' : ''}>${esc(pl.label)}</option>`).join('');
      return `<details class="blj-admin-lesson">
        <summary>${esc(lesson.title)} <em>${lesson.done || 0} selesai · ${lesson.skipped || 0} lewati${lesson.published ? '' : ' · disembunyikan'}</em></summary>
        <form class="blj-admin-form" data-lesson-id="${esc(lesson.id)}">
          <label>Judul <input name="title" value="${esc(lesson.title)}"></label>
          <label>URL <input name="url" value="${esc(lesson.url || '')}"></label>
          <div class="blj-admin-row">
            <label>Jenis <select name="kind">${kinds}</select></label>
            <label>Platform <select name="platform">${plats}</select></label>
            <label>Menit <input name="mins" type="number" min="0" max="180" value="${lesson.est_mins || 0}"></label>
            <label>Urutan <input name="sort" type="number" value="${lesson.sort_order || 0}"></label>
            <label class="blj-admin-check"><input name="published" type="checkbox"${lesson.published ? ' checked' : ''}> Tayang</label>
          </div>
          <label>Isi <textarea name="body" rows="8">${esc(lesson.body || '')}</textarea></label>
          <label>Poin (JSON array) <textarea name="points" rows="4">${esc(pretty(lesson.points, '[]'))}</textarea></label>
          <label>Bacaan (JSON array) <textarea name="resources" rows="4">${esc(pretty(lesson.resources, '[]'))}</textarea></label>
          <label>Pertanyaan (JSON array) <textarea name="questions" rows="4">${esc(pretty(lesson.questions, '[]'))}</textarea></label>
          <label>Aksi (JSON object atau kosong) <textarea name="action" rows="3">${esc(pretty(lesson.action, ''))}</textarea></label>
          <p class="blj-admin-err" data-err></p>
          <button type="submit" class="btn-primary">Simpan pelajaran</button>
        </form>
      </details>`;
    }).join('');
    return `<section class="blj-admin-mod">
      <form class="blj-admin-form" data-module-id="${esc(mod.id)}">
        <div class="blj-admin-row">
          <label>Modul <input name="title" value="${esc(mod.title || '')}"></label>
          <label>Urutan <input name="sort" type="number" value="${mod.sort_order || 0}"></label>
          <label class="blj-admin-check"><input name="published" type="checkbox"${mod.published ? ' checked' : ''}> Tayang</label>
        </div>
        <label>Subjudul <input name="subtitle" value="${esc(mod.subtitle || '')}"></label>
        <p class="blj-admin-err" data-err></p>
        <button type="submit" class="btn-ghost">Simpan modul</button>
      </form>
      ${lessons}
    </section>`;
  }

  function field(form, name) {
    const node = form.elements[name];
    if (!node) return '';
    if (node.type === 'checkbox') return node.checked;
    return node.value;
  }

  async function saveAdmin(form) {
    const errEl = form.querySelector('[data-err]');
    if (errEl) errEl.textContent = '';
    const lessonId = form.getAttribute('data-lesson-id');
    const moduleId = form.getAttribute('data-module-id');
    try {
      let data;
      if (moduleId) {
        data = await rpc('belajar_admin_save_module', {
          p_id: moduleId,
          p_title: String(field(form, 'title') || ''),
          p_subtitle: String(field(form, 'subtitle') || ''),
          p_sort: Number(field(form, 'sort')),
          p_published: !!field(form, 'published'),
        });
      } else if (lessonId) {
        const actionRaw = String(field(form, 'action') || '').trim();
        data = await rpc('belajar_admin_save_lesson', {
          p_id: lessonId,
          p_title: String(field(form, 'title') || ''),
          p_kind: String(field(form, 'kind') || 'text'),
          p_url: String(field(form, 'url') || ''),
          p_body: String(field(form, 'body') || ''),
          p_points: JSON.parse(String(field(form, 'points') || '[]')),
          p_resources: JSON.parse(String(field(form, 'resources') || '[]')),
          p_questions: JSON.parse(String(field(form, 'questions') || '[]')),
          p_action: actionRaw ? JSON.parse(actionRaw) : null,
          p_platform: String(field(form, 'platform') || ''),
          p_est_mins: Number(field(form, 'mins')),
          p_sort: Number(field(form, 'sort')),
          p_published: !!field(form, 'published'),
        });
      }
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = null;
      if (_ctx && _ctx.toast) _ctx.toast('Tersimpan.');
      await loadAdmin(_ctx);
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : 'Gagal menyimpan.';
      if (errEl) errEl.textContent = msg;
    }
  }

  function ensureAdminBound() {
    const body = document.getElementById('adm-belajar-body');
    if (!body || _adminBound) return;
    _adminBound = true;
    body.addEventListener('submit', (e) => {
      const form = e.target.closest('form');
      if (!form || !body.contains(form)) return;
      e.preventDefault();
      void saveAdmin(form);
    });
  }

  function funnelLine(data) {
    const f = data.funnel || {};
    return `${data.learners || 0} mulai · belum toko ${f.no_store || 0} · toko tanpa penjualan ${f.no_sales || 0} · sudah jual ${f.has_sales || 0} · tautan ${f.linked || 0} · omset perkiraan ≥ Rp 3 jt ${f.reached_3jt || 0} · selesai semua bagian ${data.completed || 0}.`;
  }

  async function loadAdmin(ctx) {
    _ctx = ctx || _ctx;
    const body = document.getElementById('adm-belajar-body');
    const sum = document.getElementById('adm-belajar-summary');
    if (!body) return;
    ensureAdminBound();
    if (sum) sum.textContent = 'Memuat…';
    try {
      const data = await rpc('belajar_admin_overview');
      if (!data || data.ok === false) {
        if (sum) sum.textContent = (data && data.error === 'admin_only') ? 'Admin only.' : 'Gagal memuat kurikulum.';
        body.innerHTML = '';
        return;
      }
      if (sum) sum.textContent = funnelLine(data);
      const f = data.funnel || {};
      const funnel = `<p class="blj-quiet">Dari belum punya toko: ${f.linked_no_store || 0} menautkan URL, ${f.reached_no_store || 0} mencapai Rp 3 jt perkiraan. Dari toko tanpa penjualan: ${f.linked_no_sales || 0} tautan, ${f.reached_no_sales || 0} mencapai Rp 3 jt. Milestone hanya dari listing Shopee yang ada di data Laris, omset kotor.</p>`;
      body.innerHTML = funnel + (arr(data.modules).map(moduleAdmin).join('') || '<p class="dd-sub">Belum ada modul.</p>');
    } catch (err) {
      if (sum) sum.textContent = 'Gagal memuat kurikulum.';
      try { console.warn('[belajar-admin]', err); } catch (_) {}
    }
  }

  global.LarisBelajar = { render, syncHome, loadAdmin };
})(window);
