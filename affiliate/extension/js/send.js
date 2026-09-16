/* Send workers. Live path = Seller Center tab, never a fake sent. */
(function (root) {
  var BATCH = 50;
  var DAILY = 1000;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function runtimeSend(payload) {
    return new Promise(function (resolve) {
      if (!root.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false, code: 'not_extension', reason: 'Bukan ekstensi Chrome.' });
        return;
      }
      chrome.runtime.sendMessage(payload, function (res) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, code: 'runtime', reason: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false, code: 'empty', reason: 'Tidak ada jawaban.' });
      });
    });
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
      name: row && row.name || acc.name || '',
      toko: acc.shopName || acc.display || displayHandle(acc.handle),
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
    return false;
  }

  function openTikTok(raw) {
    var url = tiktokUrl(raw);
    if (!url) return { ok: false, code: 'no_handle' };
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, method: 'tiktok-app', url: url };
  }

  function endpointFor(channel) {
    return channel === 'target_collab'
      ? 'Affiliate Center · Kolaborasi Bertarget'
      : 'Affiliate Center · Pesan IM';
  }

  function channelAvailable(channel) {
    if (channel === 'im' || channel === 'target_collab') {
      return { ok: true, worker: 'sellerCenter', live: true };
    }
    return { ok: false, code: 'unknown_channel' };
  }

  async function ping() {
    return runtimeSend({ type: 'laris-ping' });
  }

  async function openAffiliate() {
    return runtimeSend({ type: 'laris-open-affiliate' });
  }

  async function recon() {
    return runtimeSend({ type: 'laris-recon-get' });
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

  async function sellerCenterSend(row, ctx) {
    var body = compose(ctx.template, varsFor(row, ctx.account));
    return runtimeSend({
      type: 'laris-send',
      row: {
        handle: normHandle(row.handle),
        name: row.name || '',
        creatorOpenId: row.creatorOpenId || row.openId || row.creatorId || ''
      },
      ctx: {
        channel: ctx.channel || 'im',
        body: body
      }
    }).then(function (res) {
      if (!res.endpoint) res.endpoint = endpointFor(ctx.channel);
      if (res.ok === true) return res;
      return {
        ok: false,
        live: !!res.live,
        method: res.method || 'seller-center',
        code: res.code || 'send_failed',
        endpoint: res.endpoint,
        reason: res.reason || 'Gagal kirim. Jangan ditandai terkirim.'
      };
    });
  }

  async function send(row, ctx) {
    ctx = ctx || {};
    if (ctx.manualTiktok) return tiktokAppSend(row, ctx);
    var channel = ctx.channel || 'im';
    var avail = channelAvailable(channel);
    if (!avail.ok) return avail;
    return sellerCenterSend(row, ctx);
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
    endpointFor: endpointFor,
    channelAvailable: channelAvailable,
    ping: ping,
    openAffiliate: openAffiliate,
    recon: recon,
    send: send,
    workers: {
      sellerCenter: sellerCenterSend,
      tiktokApp: tiktokAppSend
    }
  };
})(window);
