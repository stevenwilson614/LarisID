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
    return String(template || '')
      .replace(/@\{(\w+)\}/g, function (_, key) {
        var v = map[key];
        if (v == null || String(v) === '') return '';
        return String(v).charAt(0) === '@' ? String(v) : '@' + v;
      })
      .replace(/\{(\w+)\}/g, function (_, key) {
        return map[key] != null ? String(map[key]) : '{' + key + '}';
      })
      .replace(/Halo\s*,\s*/gi, 'Halo Kak, ');
  }

  function varsFor(row, account) {
    var acc = account || {};
    var handle = normHandle(row && row.handle);
    return {
      handle: handle,
      name: acc.name || '',
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

  function packRow(row) {
    return {
      handle: normHandle(row.handle),
      name: row.name || '',
      creatorOpenId: row.creatorOpenId || row.openId || row.creatorId || row.creator_oec_id || ''
    };
  }

  async function sellerCenterSendBatch(rows, ctx) {
    ctx = ctx || {};
    var dryRun = !!ctx.dryRun;
    var list = (rows || []).map(packRow);
    var vars = varsFor(list[0] || {}, ctx.account);
    if (list.length > 1) vars.handle = '';
    var payload = {
      type: dryRun ? 'laris-probe' : 'laris-send',
      row: list[0],
      rows: list,
      ctx: {
        channel: ctx.channel || 'im',
        body: compose(ctx.template, vars),
        dryRun: dryRun,
        allowLiveSend: !dryRun && !!(ctx.account && ctx.account.allowLiveSend)
      }
    };
    return runtimeSend(payload).then(function (res) {
      res = res || {};
      if (!res.endpoint) res.endpoint = dryRun ? 'probe' : endpointFor(ctx.channel);
      if (res.ok === true) return res;
      return {
        ok: false,
        live: !!res.live,
        method: res.method || (dryRun ? 'probe' : 'seller-center'),
        code: res.code || 'send_failed',
        endpoint: res.endpoint,
        reason: res.reason || (dryRun ? 'Uji gagal. Tidak ada yang dikirim.' : 'Gagal kirim. Jangan ditandai terkirim.'),
        results: res.results || [],
        status: res.status,
        bizReject: !!res.bizReject,
        tiktokCode: res.tiktokCode
      };
    });
  }

  async function sellerCenterSend(row, ctx) {
    return sellerCenterSendBatch([row], ctx);
  }

  async function send(row, ctx) {
    ctx = ctx || {};
    if (ctx.manualTiktok) return tiktokAppSend(row, ctx);
    var channel = ctx.channel || 'im';
    var avail = channelAvailable(channel);
    if (!avail.ok) return avail;
    return sellerCenterSend(row, ctx);
  }

  async function sendBatch(rows, ctx) {
    ctx = ctx || {};
    var channel = ctx.channel || 'im';
    var avail = channelAvailable(channel);
    if (!avail.ok) return avail;
    return sellerCenterSendBatch(rows, ctx);
  }

  async function kaloRead() {
    return runtimeSend({ type: 'laris-kalodata-read' });
  }

  async function bisectDispatch(creators, ctx, sendFn, opts) {
    opts = opts || {};
    var acc = { size1Fails: 0 };
    var sleepFn = opts.sleep || sleep;
    var minDelay = opts.minDelay != null ? opts.minDelay : 800;
    var maxDelay = opts.maxDelay != null ? opts.maxDelay : 1200;
    var pauseAt = opts.pauseAt != null ? opts.pauseAt : 3;
    async function pauseMs() {
      var span = Math.max(0, maxDelay - minDelay);
      return sleepFn(minDelay + Math.floor(Math.random() * (span + 1)));
    }
    async function go(list) {
      if (acc.size1Fails >= pauseAt) return { leftover: list.slice(), leaves: [] };
      var result = await sendFn(list, ctx);
      if (result && result.ok) {
        acc.size1Fails = 0;
        return { leftover: [], leaves: [{ creators: list, result: result }] };
      }
      if (!result || !result.bizReject || list.length <= 1) {
        if (list.length === 1) acc.size1Fails += 1;
        return { leftover: [], leaves: [{ creators: list, result: result || { ok: false } }] };
      }
      await pauseMs();
      var mid = Math.ceil(list.length / 2);
      var left = await go(list.slice(0, mid));
      if (acc.size1Fails >= pauseAt) {
        return { leftover: left.leftover.concat(list.slice(mid)), leaves: left.leaves };
      }
      await pauseMs();
      var right = await go(list.slice(mid));
      return {
        leftover: left.leftover.concat(right.leftover),
        leaves: left.leaves.concat(right.leaves)
      };
    }
    var out = await go(creators || []);
    out.size1Fails = acc.size1Fails;
    return out;
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
    sendBatch: sendBatch,
    bisectDispatch: bisectDispatch,
    kaloRead: kaloRead,
    workers: {
      sellerCenter: sellerCenterSend,
      tiktokApp: tiktokAppSend
    }
  };
})(window);
