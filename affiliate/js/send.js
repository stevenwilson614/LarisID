/* Send workers. P0 = TikTok app (copy + open). P2 = Affiliate Seller API stub. */
(function (root) {
  function normHandle(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    s = s.replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '');
    s = s.replace(/^@+/, '');
    s = s.split(/[/?#\s]/)[0];
    return s;
  }

  function displayHandle(raw) {
    var h = normHandle(raw);
    return h ? '@' + h : '';
  }

  function tiktokUrl(raw) {
    var h = normHandle(raw);
    return h ? 'https://www.tiktok.com/@' + encodeURIComponent(h) : '';
  }

  function compose(template, vars) {
    var map = vars || {};
    return String(template || '').replace(/\{(\w+)\}/g, function (_, key) {
      return map[key] != null ? String(map[key]) : '{' + key + '}';
    });
  }

  function varsFor(row, account) {
    var acc = account || {};
    var handle = normHandle(row && row.handle);
    return {
      handle: handle,
      name: acc.name || '',
      toko: acc.display || displayHandle(acc.handle),
      produk: acc.productName || '',
      komisi: acc.commissionPct != null ? acc.commissionPct : ''
    };
  }

  async function copy(text) {
    var value = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch (err) { /* fallback */ }
    }
    var ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function openTikTok(raw) {
    var url = tiktokUrl(raw);
    if (!url) return { ok: false, code: 'no_handle' };
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, method: 'tiktok-app', url: url };
  }

  function shopBound(account) {
    return !!(account && account.shopToken);
  }

  function channelAvailable(channel, account) {
    if (channel === 'tiktok_dm') {
      return { ok: true, worker: 'tiktokApp' };
    }
    if (channel === 'target_collab') {
      if (shopBound(account)) {
        return { ok: true, worker: 'affiliateSeller' };
      }
      return { ok: false, code: 'no_shop', reason: 'Butuh toko terhubung (OAuth Anton). Bukan password Seller Center.' };
    }
    return { ok: false, code: 'unknown_channel' };
  }

  async function tiktokAppSend(row, ctx) {
    var body = compose(ctx.template, varsFor(row, ctx.account));
    var copied = await copy(body);
    var opened = openTikTok(row.handle);
    return {
      ok: opened.ok,
      method: 'tiktok-app',
      copied: copied,
      url: opened.url,
      body: body
    };
  }

  async function affiliateSellerSend(row, ctx) {
    if (!shopBound(ctx.account)) {
      return { ok: false, code: 'no_shop', reason: 'Toko belum terhubung.' };
    }
    return {
      ok: false,
      code: 'not_wired',
      method: 'affiliate-seller',
      reason: 'Token toko ada, API Affiliate Seller belum dipasang. Kirim tidak menembak TikTok Shop.'
    };
  }

  async function send(row, ctx) {
    var channel = (ctx && ctx.channel) || 'tiktok_dm';
    var avail = channelAvailable(channel, ctx && ctx.account);
    if (!avail.ok) return avail;
    if (avail.worker === 'affiliateSeller') return affiliateSellerSend(row, ctx);
    return tiktokAppSend(row, ctx);
  }

  root.LarisAffiliateSend = {
    normHandle: normHandle,
    displayHandle: displayHandle,
    tiktokUrl: tiktokUrl,
    compose: compose,
    varsFor: varsFor,
    copy: copy,
    openTikTok: openTikTok,
    shopBound: shopBound,
    channelAvailable: channelAvailable,
    send: send,
    workers: {
      tiktokApp: tiktokAppSend,
      affiliateSeller: affiliateSellerSend
    }
  };
})(window);
