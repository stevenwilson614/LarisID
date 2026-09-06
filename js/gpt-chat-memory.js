/**
 * Laris AI thread memory — follow-up detection, research constraints, and
 * history serialization. Loaded before gpt-app.js in the browser; required by
 * scripts/test-ask-laris-followup.mjs in Node. No DOM, no fetch.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.LarisGptMemory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AFFIRM = /^(mau|iya+|ya+|yes|yep|yeah|oke+|ok|okay|boleh|lanjut|lanjutkan|silakan|gas|yuk|sure|yess|yap)(\s+(dong|deh|aja|a|lah|bang|kak|min|boleh|lanjut|jawaban))?[\s!,.]*$|^(ya|iya|oke|ok|boleh),?\s+(boleh|lanjut|lanjutkan)(\s+jawaban)?[\s!,.]*$|^lanjutkan jawaban[\s!,.]*$/i;
  const DECLINE = /^(tidak|nggak|gak|ga|enggak|no|nope|skip|batal|jangan)(\s+(dong|deh|aja|lah|makasih|terima kasih))?[\s!.]*$/i;
  const REFINE = /^(untuk|tapi|bukan|jangan|kecuali|yang tadi|di kategori|kalau untuk|kalau di|kalau yang)\b|\b(untuk|tapi|bukan|kecuali|yang tadi|di kategori)\b/;
  // Broad category words only — product nouns like "celana" must stay searches.
  const BROAD_CAT = /\b(pashion|fasion|fashion|olahraga|sport|fitness|kecantikan|beauty|skincare|dapur|elektronik|kesehatan|hobi)\b/;
  const CAT_HINTS = [
    { cat: 'Fashion', re: /\b(pashion|fasion|fashion|pakaian)\b/ },
    { cat: 'Olahraga', re: /\b(olahraga|sport|fitness|gym)\b/ },
    { cat: 'Kecantikan', re: /\b(kecantikan|beauty|skincare|kosmetik|makeup)\b/ },
    { cat: 'Dapur', re: /\b(dapur|kitchen)\b/ },
    { cat: 'Elektronik', re: /\b(elektronik|electronics)\b/ },
    { cat: 'Kesehatan', re: /\b(kesehatan|health)\b/ },
    { cat: 'Rumah', re: /\b(rumah|dekorasi|home decor)\b/ },
    { cat: 'Bayi & Anak', re: /\b(bayi|anak|baby)\b/ },
    { cat: 'Hobi & Kerajinan', re: /\b(hobi|hobby|kerajinan|craft)\b/ },
  ];
  const CLARIFY_TEXTS = new Set([
    'Klarifikasi pencarian', 'Hasil pasar', 'Hasil kategori',
    'Produk trending', 'Rencana perlu produk',
  ]);
  const WEEKLY_RE = /terlaris.{0,24}(minggu|pekan) ini|(minggu|pekan) ini.{0,24}terlaris|paling laris.{0,24}(minggu|pekan)|terlaris (minggu|pekan)|(terlaris|best.?sell\w*|top.?sell\w*).{0,24}this week|this week.{0,24}(terlaris|best.?sell\w*|top.?sell\w*)/;
  const REFER_RE = /\b(afiliasi|affiliate|affiliator|komisi\s*xtra|xtra\s*komisi|shopee\s*live|live\s*gmv|berapa (orang )?(affiliate|afiliasi|kreator))\b/;
  const PUBLIC_RE = /\b(supplier|grosir|pabrik|wholesale|aturan|regulasi|berita|undang[\s-]?undang|bea cukai|tiktok shop|kalodata)\b/;
  const JUDGMENT_RE = /\b(kenapa|mengapa|why|bandingkan|banding|compare|mana yang|yang mana|which|sebaiknya|should i|worth|bedanya|beda|risiko|risk|strategi|strategy|prospek|peluang|jelaskan|explain|analisa|analisis|analyze|paling bagus|terbaik|best)\b/;
  const CONTINUE_RE = /lanjutkan jawaban|^(ya,?\s*)?lanjut(kan)?(\s+jawaban)?[\s!.]*$/;
  const SHOWN_REF = /\b(yang tadi|yang itu|those|these|them|tadi|barusan|di atas|any of|ada yang|seller|toko|penjual)\b/;
  const FILTER_HINT = /\b(di|dari|kota|lokasi|in|from|harga|usia|umur|bandung|jakarta|surabaya|medan|bekasi|tangerang|depok|semarang|makassar|palembang)\b/;

  function norm(text) {
    return String(text || '').toLowerCase().trim();
  }

  function isAffirmativeReply(text) {
    return AFFIRM.test(norm(text));
  }

  function isDeclineReply(text) {
    return DECLINE.test(norm(text));
  }

  function isConstraintRefinement(text) {
    const s = norm(text);
    if (!s || isAffirmativeReply(s) || isDeclineReply(s)) return false;
    if (REFINE.test(s)) return true;
    const tokens = s.split(/\s+/).filter(Boolean);
    if (tokens.length <= 8 && BROAD_CAT.test(s) && !/\b(vs|bandingkan)\b/.test(s)) return true;
    return false;
  }

  function lastAssistantContent(chat) {
    const msgs = chat?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') return msgs[i].content;
    }
    return null;
  }

  function chatIsConversationalThread(chat) {
    if (!chat) return false;
    const kind = chat.context?.kind;
    if (kind === 'market_agent' || kind === 'product' || kind === 'pasar_search') return true;
    if (chat.context?.pendingOffer) return true;
    const research = chat.context?.research;
    if (research && (research.category || research.omset_min || research.max_age_days)) return true;
    const c = lastAssistantContent(chat);
    if (!c) return false;
    if (Array.isArray(c.types) && c.types.length) return true;
    const text = typeof c === 'string' ? c : (c.text || '');
    if (CLARIFY_TEXTS.has(text)) return false;
    return String(text).length > 80;
  }

  function extractPendingOffer(assistantText) {
    const s = String(assistantText || '').trim();
    if (!s) return null;
    const asks = /\bmau\s*\??\s*$/i.test(s)
      || /\bmau aku\b/i.test(s)
      || /\blingin aku\b/i.test(s)
      || /\bwant(?: to)?\s*\??\s*$/i.test(s);
    if (!asks) return null;

    const vs = s.match(/antara\s+\*{0,2}\s*([^,*\n]{3,80}?)\s+vs\.?\s+([^,*\n]{3,80}?)(?:\s*\*{1,2}|\s+untuk|\s+buat|,|\.|$)/i)
      || s.match(/\*{2}([^*\n]{3,40})\s+vs\.?\s+([^*\n]{3,40})\*{2}/i);
    if (vs) {
      const a = vs[1].replace(/\*+/g, '').trim();
      const b = vs[2].replace(/\*+/g, '').replace(/\s+untuk\b[\s\S]*$/i, '').trim();
      return {
        prompt: `Bandingkan ${a} vs ${b}`,
        yesLabel: 'Ya, bandingkan',
        noLabel: 'Tidak, cari yang lain',
      };
    }
    const lanjut = s.match(/lanjut(?:kan)?(?:\s+ke)?\s+([^?]{6,80}?)\??\s*$/i);
    if (lanjut) {
      return {
        prompt: `Ya, lanjut ${lanjut[1].replace(/\?+$/, '').trim()}`,
        yesLabel: 'Ya, lanjut',
        noLabel: 'Tidak, cari yang lain',
      };
    }
    const stripped = s.replace(/\s*mau\s*\??\s*$/i, '').trim();
    const parts = stripped.split(/(?<=[.!?])\s+/);
    const last = (parts.pop() || stripped).replace(/^kalau kamu\s+/i, '').trim();
    return {
      prompt: last.length > 12 ? `Ya. ${last}` : 'Ya, lanjutkan yang kamu tawarkan.',
      yesLabel: 'Ya, lanjut',
      noLabel: 'Tidak, cari yang lain',
    };
  }

  function resolveAffirmativePrompt(text, pendingOffer) {
    if (pendingOffer && pendingOffer.prompt) return String(pendingOffer.prompt);
    const t = String(text || '').trim() || 'mau';
    return `Ya, lanjutkan tawaran terakhirmu. User menjawab: "${t}"`;
  }

  function _moneyToRp(num, unit) {
    let rp = num;
    const u = String(unit || '').toLowerCase();
    if (/rb|ribu|^k$/.test(u)) rp = num * 1e3;
    else if (/jt|juta|jta/.test(u)) rp = num * 1e6;
    else if (/^m$|miliar/.test(u)) rp = num * 1e9;
    return Math.round(rp);
  }

  function parseResearchConstraints(text) {
    const s = norm(text);
    const out = {};
    if (!s) return out;

    const omset = s.match(/(?:omset|omzet|penjualan(?:an)?(?:\s*per\s*bulan|perbulan)?)\s*(?:mencapai|minimal|min)?[^\d]{0,32}([\d][\d.,]*)\s*(rb|ribu|jt|juta|jta|k|m|miliar)?/i)
      || s.match(/([\d][\d.,]*)\s*(jt|juta|jta)\b/);
    if (omset) {
      const num = parseFloat(omset[1].replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(num) && num > 0) {
        const rp = _moneyToRp(num, omset[2] || (/jt|juta|jta/.test(omset[0]) ? 'juta' : ''));
        if (rp >= 10000) out.omset_min = rp;
      }
    }

    const bulan = s.match(/(\d{1,2})\s*bulan/);
    const hari = s.match(/(\d{1,3})\s*hari/);
    if (bulan) out.max_age_days = Math.min(Number(bulan[1]) * 30, 730);
    else if (hari) out.max_age_days = Math.min(Number(hari[1]), 730);

    for (const h of CAT_HINTS) {
      if (h.re.test(s)) { out.category = h.cat; break; }
    }
    return out;
  }

  function mergeResearchConstraints(existing, incoming) {
    const a = existing && typeof existing === 'object' ? { ...existing } : {};
    const b = incoming && typeof incoming === 'object' ? incoming : {};
    for (const [k, v] of Object.entries(b)) {
      if (v != null && v !== '') a[k] = v;
    }
    return a;
  }

  function researchPromptBlock(research) {
    if (!research || typeof research !== 'object') return '';
    const lines = [];
    if (research.category) lines.push(`kategori: ${research.category}`);
    if (research.omset_min) {
      lines.push(`omset per bulan minimal: Rp${Number(research.omset_min).toLocaleString('id-ID')} (filter_listing.omset_min; angka omset_bln adalah perkiraan kecuali omset_label=terukur)`);
    }
    if (research.max_age_days) {
      lines.push(`umur listing maksimal: ${research.max_age_days} hari (filter_listing.umur_hari_max)`);
    }
    if (!lines.length) return '';
    return '\nKONTEKS THREAD (pertahankan di setiap putaran, termasuk follow-up):\n- '
      + lines.join('\n- ')
      + '\nJangan membuang filter ini kecuali user jelas membatalkannya.';
  }

  function serializeMessageForAi(content) {
    if (typeof content === 'string') return content;
    if (!content || typeof content !== 'object') return '';
    const types = Array.isArray(content.types) ? content.types.filter(Boolean) : [];
    const text = String(content.text || '').trim();
    if (types.length) {
      const q = content.q ? ` untuk "${content.q}"` : '';
      const label = text && text !== 'Hasil pasar' ? text : 'Hasil pasar';
      return `${label}${q}: ${types.slice(0, 12).join(', ')}`;
    }
    return text;
  }

  function extractPasarKeysFromToolOut(out) {
    const keys = [];
    const add = (k) => {
      const s = String(k || '').trim();
      if (s && !keys.includes(s)) keys.push(s);
    };
    if (!out || typeof out !== 'object') return keys;
    if (typeof out.pasar === 'string') add(out.pasar);
    else if (Array.isArray(out.pasar)) {
      out.pasar.forEach((p) => add(typeof p === 'string' ? p : p && p.pasar));
    }
    if (Array.isArray(out.pasar_terkait)) {
      out.pasar_terkait.forEach((p) => add(typeof p === 'string' ? p : p && p.pasar));
    }
    if (Array.isArray(out.listing)) {
      out.listing.forEach((l) => add(l && l.pasar));
    }
    return keys;
  }

  function listingAgeDays(listingDate, nowMs) {
    if (!listingDate) return null;
    const t = new Date(listingDate).getTime();
    if (!Number.isFinite(t)) return null;
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    return Math.max(1, Math.round((now - t) / 86400000));
  }

  function omsetLabel(row) {
    const src = String(row?.nowcast_method || row?.nowcast_confidence || row?.source || '').toLowerCase();
    if (src === 'latest' || src === 'blend' || src === 'measured') return 'terukur';
    return 'perkiraan';
  }

  function packListingFields(r, nowMs) {
    const umur = listingAgeDays(r && r.listing_date, nowMs);
    const omset = Math.round(Number(r && r.nowcast_omset_monthly) || 0);
    return {
      listing_date: (r && r.listing_date) || null,
      umur_hari: umur,
      omset_bln: omset > 0 ? omset : null,
      omset_label: omset > 0 ? omsetLabel(r) : null,
    };
  }

  function isContinueReply(text) {
    return CONTINUE_RE.test(norm(text));
  }

  function isOutOfScopeRefer(text) {
    return REFER_RE.test(norm(text));
  }

  function isWeeklyAsk(text) {
    return WEEKLY_RE.test(norm(text));
  }

  function isPublicAsk(text) {
    const s = norm(text);
    if (isOutOfScopeRefer(s) || isWeeklyAsk(s)) return false;
    return PUBLIC_RE.test(s);
  }

  function isLookupAsk(text) {
    const s = norm(text);
    if (!s || isOutOfScopeRefer(s) || isWeeklyAsk(s) || isPublicAsk(s)) return false;
    if (JUDGMENT_RE.test(s)) return false;
    if (isAffirmativeReply(s) || isDeclineReply(s) || isContinueReply(s)) return false;
    const tokens = s.replace(/[?!.,]+/g, ' ').split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 6) return false;
    if (/^(cari|carikan|tunjukkan|tampilkan|show|find)\b/.test(s) && tokens.length <= 6) return true;
    return !/\b(apakah|kenapa|mengapa|sebaiknya|bagaimana)\b/.test(s);
  }

  function isShownSetFilter(text, chat) {
    const s = norm(text);
    if (!s || isContinueReply(s) || isAffirmativeReply(s) || isDeclineReply(s)) return false;
    if (isOutOfScopeRefer(s) || isWeeklyAsk(s)) return false;
    const listings = chat?.context?.lastShown?.listings;
    if (!Array.isArray(listings) || !listings.length) return false;
    // "Crocs Bandung" is a new lookup-with-city, not a filter of the last set.
    if (!SHOWN_REF.test(s) && !/ada yang/.test(s)) return false;
    return FILTER_HINT.test(s) || /ada yang/.test(s);
  }

  function detectResponseMode(text, chat) {
    const s = String(text || '');
    if (isContinueReply(s)) return 'continue';
    if (isOutOfScopeRefer(s)) return 'refer';
    if (isShownSetFilter(s, chat)) return 'filter';
    if (isWeeklyAsk(s)) return 'weekly';
    if (isLookupAsk(s)) return 'lookup';
    if (JUDGMENT_RE.test(norm(s))) return 'judgment';
    if (isPublicAsk(s)) return 'public';
    return 'judgment';
  }

  function parseLanjutLines(body) {
    return String(body || '').split('\n')
      .map(l => l.replace(/^\s*\d{1,2}\s*[.)\-]\s*/, '').replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  function extractLanjutBlock(text) {
    const s = String(text || '');
    const o = s.indexOf('<lanjut>');
    if (o < 0) return { lines: [], rest: s, open: false };
    const c = s.indexOf('</lanjut>', o);
    if (c < 0) return { lines: [], rest: s.slice(0, o), open: true };
    return {
      lines: parseLanjutLines(s.slice(o + 8, c)),
      rest: (s.slice(0, o) + s.slice(c + 9)).trim(),
      open: false,
    };
  }

  function packLastShown(listings, types, query) {
    const rows = Array.isArray(listings) ? listings : [];
    const typeKeys = Array.isArray(types)
      ? types.map(t => (typeof t === 'string' ? t : t && t.keyword)).filter(Boolean)
      : [];
    return {
      query: String(query || ''),
      types: typeKeys.slice(0, 12),
      listings: rows.slice(0, 24).map(r => ({
        item_id: r && r.item_id,
        shop_id: r && r.shop_id,
        product_name: r && r.product_name,
        store_name: r && r.store_name,
        location: r && r.location,
        price: r && r.price,
        image_url: r && r.image_url,
        url: r && r.url,
        keyword: r && r.keyword,
        category: r && r.category,
        total_sold: r && r.total_sold,
        reviews: r && r.reviews,
        rating: r && r.rating,
        listing_date: r && r.listing_date,
        nowcast_omset_monthly: r && r.nowcast_omset_monthly,
        nowcast_confidence: r && r.nowcast_confidence,
        nowcast_method: r && r.nowcast_method,
      })).filter(r => r.item_id != null),
    };
  }

  return {
    isAffirmativeReply,
    isDeclineReply,
    isConstraintRefinement,
    chatIsConversationalThread,
    extractPendingOffer,
    resolveAffirmativePrompt,
    parseResearchConstraints,
    mergeResearchConstraints,
    researchPromptBlock,
    serializeMessageForAi,
    extractPasarKeysFromToolOut,
    listingAgeDays,
    omsetLabel,
    packListingFields,
    isContinueReply,
    isOutOfScopeRefer,
    isWeeklyAsk,
    isPublicAsk,
    isLookupAsk,
    isShownSetFilter,
    detectResponseMode,
    parseLanjutLines,
    extractLanjutBlock,
    packLastShown,
  };
});
