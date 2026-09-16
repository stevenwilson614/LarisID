/* Send workers. Preview mimics Affiliate Seller API; live swap is the same send(). */
(function (root) {
  var BATCH = 50;
  var DAILY = 1000;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

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
    try { ok = document.execCommand('copy'); } catch (err2) { ok = false; }
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

  function liveApi(account) {
    return !!(account && account.liveApi);
  }

  function endpointFor(channel) {
    if (channel === 'target_collab') {
      return 'POST /affiliate_seller/202412/target_collaboration/links/generate';
    }
    return 'POST /affiliate_seller/202412/messages/send';
  }

  function channelAvailable(channel, account) {
    if (channel === 'im' || channel === 'tiktok_dm' || channel === 'target_collab') {
      if (liveApi(account) && shopBound(account)) {
        return { ok: true, worker: 'affiliateSeller', live: true };
      }
      return { ok: true, worker: 'preview', live: false };
    }
    return { ok: false, code: 'unknown_channel' };
  }

  async function previewSend(row, ctx) {
    var channel = (ctx && ctx.channel) || 'im';
    var body = compose(ctx.template, varsFor(row, ctx.account));
    var ms = 320 + Math.floor(Math.random() * 380);
    await sleep(ms);
    var n = ctx.index == null ? 0 : ctx.index;
    if (n % 7 === 6) {
      return {
        ok: false,
        live: false,
        method: 'preview',
        code: 'preview_fail',
        endpoint: endpointFor(channel),
        reason: 'Preview: simulasi gagal (kuota kreator / timeout).',
        body: body
      };
    }
    return {
      ok: true,
      live: false,
      method: 'preview',
      endpoint: endpointFor(channel),
      requestId: 'prev_' + Date.now().toString(36),
      body: body
    };
  }

  async function tiktokAppSend(row, ctx) {
    var body = compose(ctx.template, varsFor(row, ctx.account));
    var copied = await copy(body);
    var opened = openTikTok(row.handle);
    return {
      ok: opened.ok,
      live: false,
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
    if (!liveApi(ctx.account)) {
      var preview = await previewSend(row, ctx);
      preview.method = 'affiliate-seller-preview';
      return preview;
    }
    return {
      ok: false,
      code: 'not_wired',
      method: 'affiliate-seller',
      reason: 'API Affiliate Seller belum dipasang.'
    };
  }

  async function send(row, ctx) {
    ctx = ctx || {};
    if (ctx.manualTiktok) return tiktokAppSend(row, ctx);
    var channel = ctx.channel || 'im';
    var avail = channelAvailable(channel, ctx.account);
    if (!avail.ok) return avail;
    if (avail.worker === 'affiliateSeller' && avail.live) return affiliateSellerSend(row, ctx);
    return previewSend(row, ctx);
  }

  root.LarisAffiliateSend = {
    BATCH: BATCH,
    DAILY: DAILY,
    sleep: sleep,
    normHandle: normHandle,
    displayHandle: displayHandle,
    tiktokUrl: tiktokUrl,
    compose: compose,
    varsFor: varsFor,
    copy: copy,
    openTikTok: openTikTok,
    shopBound: shopBound,
    liveApi: liveApi,
    endpointFor: endpointFor,
    channelAvailable: channelAvailable,
    send: send,
    workers: {
      preview: previewSend,
      tiktokApp: tiktokAppSend,
      affiliateSeller: affiliateSellerSend
    }
  };
})(window);
