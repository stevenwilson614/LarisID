/* Isolated world: hello + one send via the page's own fetch. */
(function () {
  if (window.__larisAffiliateContent) return;
  window.__larisAffiliateContent = true;
  var Adapter = window.LarisAffiliateAdapter;
  var SRC_MAIN = 'laris-affiliate-main';
  var SRC_ISO = 'laris-affiliate-isolated';
  var pending = {};
  var seq = 1;

  function pageFetch(url, init) {
    return new Promise(function (resolve) {
      var id = 'f' + (seq += 1);
      pending[id] = resolve;
      window.postMessage({ source: SRC_ISO, op: 'fetch', id: id, url: url, init: init || {} }, '*');
      setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        resolve({ ok: false, status: 0, text: '', error: 'timeout' });
      }, 8000);
    });
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== SRC_MAIN) return;
    if (d.op === 'capture' && d.payload) {
      Adapter.ingest(d.payload);
      return;
    }
    if (d.op === 'fetch-result' && pending[d.id]) {
      var resolve = pending[d.id];
      delete pending[d.id];
      resolve({ ok: !!d.ok, status: d.status, text: d.text || '', error: d.error || '' });
    }
  });

  function shopNameGuess() {
    var t = document.title || '';
    t = t.replace(/\s*[|\-–].*$/, '').trim();
    if (t && !/tiktok|tokopedia|seller|login|sign/i.test(t)) return t.slice(0, 80);
    var el = document.querySelector('[class*="shop-name"], [class*="shopName"], [data-e2e="shop-name"]');
    if (el && el.textContent) return el.textContent.trim().slice(0, 80);
    return '';
  }

  function isAffiliateContext() {
    var href = location.href || '';
    if (/affiliate|collaboration|target.?collab|creator|connection\/target|find.?creator/i.test(href)) return true;
    var text = '';
    try { text = (document.body && document.body.innerText || '').slice(0, 4000); } catch (e) { text = ''; }
    return /target collaboration|kolaborasi bertarget|affiliate center|undang kreator|invite to collaborate/i.test(text);
  }

  function isLoggedOut() {
    var href = location.href || '';
    if (/\/login|\/account\/login|passport/i.test(href)) return true;
    return /sign in|masuk ke|log in to seller/i.test(document.title || '');
  }

  function isShopSession() {
    if (isLoggedOut()) return false;
    var host = location.hostname || '';
    return /(^|\.)seller-id\.tokopedia\.com$|(^|\.)affiliate-id\.tokopedia\.com$|(^|\.)tiktokshop\.com$|(^|\.)tiktokglobalshop\.com$/i.test(host);
  }

  async function hello() {
    var data = await Adapter.loadStore();
    chrome.runtime.sendMessage({
      type: 'laris-hello',
      href: location.href,
      shopSession: isShopSession(),
      affiliate: isAffiliateContext() && !isLoggedOut(),
      shopName: shopNameGuess(),
      recon: Adapter.reconFlags(data)
    });
  }

  async function resolveCreator(row, data) {
    if (row.creatorOpenId) return row;
    var search = Adapter.latest(data, 'search');
    if (!search) return row;
    var url = Adapter.fillUrl ? Adapter.fillUrl(search.url, row) : search.url;
    var bodyObj = Adapter.parseMaybe(search.reqBody);
    var init = { method: search.method || 'POST', headers: { 'content-type': 'application/json' } };
    if (bodyObj) {
      init.body = JSON.stringify(Adapter.fillTemplate(bodyObj, row, ''));
    } else if ((search.method || 'POST') !== 'GET') {
      init.body = search.reqBody || '';
    }
    var res = await pageFetch(url, init);
    var json = Adapter.parseMaybe(res.text);
    if (!json) return row;
    var found = Adapter.extractCreator(json, row.handle);
    if (found && found.creatorOpenId) row.creatorOpenId = found.creatorOpenId;
    return row;
  }

  function jsonOk(status, parsed) {
    if (status < 200 || status >= 300) return false;
    if (!parsed || typeof parsed !== 'object') return true;
    if (parsed.code === 0 || parsed.code === '0') return true;
    if (parsed.message === 'success' || parsed.msg === 'success') return true;
    if (parsed.code) return false;
    return true;
  }

  async function probeOne(row) {
    row = {
      handle: String(row && row.handle || '').replace(/^@/, ''),
      name: row && row.name || '',
      creatorOpenId: row && (row.creatorOpenId || row.openId || row.creatorId) || ''
    };
    if (!row.handle && !row.creatorOpenId) {
      return { ok: false, live: false, method: 'probe', code: 'no_handle', reason: 'Handle kosong.' };
    }
    var data = await Adapter.loadStore();
    var flags = Adapter.reconFlags(data);
    if (row.creatorOpenId) {
      return {
        ok: true,
        live: false,
        method: 'probe',
        code: 'already_id',
        endpoint: 'probe',
        creatorOpenId: row.creatorOpenId,
        reason: 'Sudah ada creator_id. Tidak ada undangan yang dikirim.'
      };
    }
    if (!flags.search) {
      return {
        ok: false,
        live: false,
        method: 'probe',
        code: 'no_search',
        endpoint: 'probe',
        reason: 'Belum rekaman cari kreator. Buka Find Creators / Cari Kreator, ketik handle, jangan klik undang.'
      };
    }
    row = await resolveCreator(row, data);
    if (row.creatorOpenId) {
      return {
        ok: true,
        live: false,
        method: 'probe',
        code: 'resolved',
        endpoint: (Adapter.latest(data, 'search').method || 'GET') + ' ' + Adapter.latest(data, 'search').url.split('?')[0],
        creatorOpenId: row.creatorOpenId,
        reason: 'Kreator ketemu. Tidak ada undangan yang dikirim.'
      };
    }
    return {
      ok: false,
      live: false,
      method: 'probe',
      code: 'search_miss',
      endpoint: 'probe',
      reason: 'Search jalan, kreator tidak ketemu. Tidak ada undangan yang dikirim.'
    };
  }

  async function sendOne(row, ctx) {
    if (!ctx || ctx.dryRun) return probeOne(row);
    if (!ctx.allowLiveSend) {
      return {
        ok: false,
        live: false,
        method: 'seller-center',
        code: 'locked',
        reason: 'Kirim live terkunci. Centang Izinkan kirim live di Akun, lalu konfirmasi.'
      };
    }
    row = {
      handle: String(row && row.handle || '').replace(/^@/, ''),
      name: row && row.name || '',
      creatorOpenId: row && (row.creatorOpenId || row.openId || row.creatorId) || ''
    };
    if (!row.handle && !row.creatorOpenId) {
      return { ok: false, code: 'no_handle', reason: 'Handle kosong.' };
    }
    var channel = ctx && ctx.channel === 'target_collab' ? 'collab' : 'im';
    var data = await Adapter.loadStore();
    var entry = Adapter.latest(data, channel);
    if (!entry) {
      return {
        ok: false,
        live: false,
        method: 'seller-center',
        code: 'needs_recon',
        reason: channel === 'collab'
          ? 'Belum ada rekaman Target Collab. Kirim 1 undangan manual di Affiliate Center, lalu coba lagi.'
          : 'Belum ada rekaman IM. Kirim 1 pesan manual di Affiliate Center, lalu coba lagi.'
      };
    }
    if (Adapter.needsOpenId(entry) && !row.creatorOpenId) {
      row = await resolveCreator(row, data);
      if (!row.creatorOpenId) {
        return {
          ok: false,
          live: false,
          method: 'seller-center',
          code: 'handle_only',
          endpoint: entry.method + ' ' + entry.url,
          reason: 'Request ini butuh creator_id / open_id. Import CSV yang punya kolom itu, atau rekam search kreator dulu.'
        };
      }
    }
    var message = ctx && ctx.body ? String(ctx.body) : '';
    var bodyObj = Adapter.parseMaybe(entry.reqBody);
    if ((entry.method || 'POST') !== 'GET' && !bodyObj) {
      return {
        ok: false,
        live: false,
        method: 'seller-center',
        code: 'bad_template',
        endpoint: entry.method + ' ' + entry.url,
        reason: 'Rekaman request bukan JSON. Kirim 1 undangan manual lagi di Affiliate Center.'
      };
    }
    var init = {
      method: entry.method || 'POST',
      headers: { 'content-type': 'application/json' }
    };
    if (bodyObj) init.body = JSON.stringify(Adapter.fillTemplate(bodyObj, row, message));
    else if ((entry.method || 'POST') !== 'GET') init.body = entry.reqBody || '';

    var res = await pageFetch(entry.url, init);
    var parsed = Adapter.parseMaybe(res.text);
    var ok = !res.error && jsonOk(res.status, parsed);
    var reason = '';
    if (!ok) {
      reason = res.error || (parsed && (parsed.message || parsed.msg || parsed.error)) || ('HTTP ' + res.status);
    }
    return {
      ok: ok,
      live: true,
      method: 'seller-center',
      code: ok ? 'sent' : 'send_failed',
      endpoint: entry.method + ' ' + entry.url.split('?')[0],
      requestId: parsed && (parsed.request_id || parsed.requestId) || '',
      reason: reason,
      status: res.status
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === 'laris-probe') {
      probeOne(msg.row).then(sendResponse);
      return true;
    }
    if (msg.type !== 'laris-send') return;
    sendOne(msg.row, msg.ctx).then(sendResponse);
    return true;
  });

  hello();
  setInterval(hello, 2500);
  document.addEventListener('DOMContentLoaded', hello);
})();
