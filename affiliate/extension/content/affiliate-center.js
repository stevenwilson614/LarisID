/* Isolated world: hello + one send via the page's own fetch. */
(function () {
  if (window.__larisAffiliateContent) return;
  window.__larisAffiliateContent = true;
  var Adapter = window.LarisAffiliateAdapter;
  var SRC_MAIN = 'laris-affiliate-main';
  var SRC_ISO = 'laris-affiliate-isolated';
  var pending = {};
  var seq = 1;

  function pageFetch(url, init, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var id = 'f' + (seq += 1);
      pending[id] = resolve;
      window.postMessage({
        source: SRC_ISO,
        op: 'fetch',
        id: id,
        url: url,
        init: init || {},
        maxBody: opts.maxBody || 0
      }, '*');
      setTimeout(function () {
        if (!pending[id]) return;
        delete pending[id];
        resolve({ ok: false, status: 0, text: '', error: 'timeout' });
      }, opts.timeout || 20000);
    });
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== SRC_MAIN) return;
    if (d.op === 'capture' && d.payload) {
      d.payload.shopName = shopNameGuess();
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

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function reconOriginOf(data) {
    var collab = Adapter.latest(data, 'collab');
    var search = Adapter.latest(data, 'search');
    return (collab && collab.origin) || (search && search.origin) || '';
  }

  async function hello() {
    var data = await Adapter.loadStore();
    chrome.runtime.sendMessage({
      type: 'laris-hello',
      href: location.href,
      shopSession: isShopSession(),
      affiliate: isAffiliateContext() && !isLoggedOut(),
      shopName: shopNameGuess(),
      recon: Adapter.reconFlags(data),
      reconOrigin: reconOriginOf(data)
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

  function failReason(res, parsed) {
    if (res && res.error) return res.error;
    var parts = [];
    if (parsed) {
      if (parsed.code != null && parsed.code !== 0 && parsed.code !== '0') {
        parts.push('code ' + parsed.code);
      }
      var msg = parsed.message || parsed.msg || parsed.error;
      if (msg) parts.push(String(msg));
    }
    if (!parts.length && res) parts.push('HTTP ' + res.status);
    return parts.join(' · ');
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

  function normRow(row) {
    return {
      handle: String(row && row.handle || '').replace(/^@/, ''),
      name: row && row.name || '',
      creatorOpenId: row && (row.creatorOpenId || row.openId || row.creatorId || row.creator_oec_id) || '',
      creatorId: row && row.creatorId || ''
    };
  }

  async function sendBatch(rows, ctx) {
    if (!ctx || ctx.dryRun) return probeOne(rows && rows[0]);
    if (!ctx.allowLiveSend) {
      return {
        ok: false,
        live: false,
        method: 'seller-center',
        code: 'locked',
        reason: 'Kirim live terkunci. Centang Izinkan kirim live di Akun, lalu konfirmasi.'
      };
    }
    rows = (rows || []).map(normRow).filter(function (r) { return r.handle || r.creatorOpenId; });
    if (!rows.length) return { ok: false, code: 'no_handle', reason: 'Handle kosong.' };

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
          ? 'Belum ada rekaman Target Collab (invitation_group/create). Kirim 1 undangan manual di Affiliate Center, lalu coba lagi.'
          : 'Belum ada rekaman IM. Kirim 1 pesan manual di Affiliate Center, lalu coba lagi.'
      };
    }

    var unresolved = [];
    var ready = [];
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (Adapter.needsOpenId(entry) && !row.creatorOpenId) {
        row = await resolveCreator(row, data);
        if (i < rows.length - 1) {
          await sleep(400 + Math.floor(Math.random() * 401));
        }
      }
      if (Adapter.needsOpenId(entry) && !row.creatorOpenId) {
        unresolved.push({
          handle: row.handle,
          ok: false,
          code: 'handle_only',
          reason: 'Butuh creator_oec_id. Rekam Cari kreator, atau ambil Unique ID dari Kalodata.'
        });
      } else {
        ready.push(row);
      }
    }
    if (!ready.length) {
      return {
        ok: false,
        live: false,
        method: 'seller-center',
        code: 'handle_only',
        endpoint: entry.method + ' ' + entry.url.split('?')[0],
        reason: unresolved[0] && unresolved[0].reason,
        results: unresolved
      };
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

    var filled = channel === 'collab'
      ? Adapter.fillCollabTemplate(bodyObj, ready, message, ctx && ctx.invite)
      : Adapter.fillTemplate(bodyObj, ready[0], message);

    var init = {
      method: entry.method || 'POST',
      headers: { 'content-type': 'application/json' }
    };
    if (bodyObj) init.body = JSON.stringify(filled);
    else if ((entry.method || 'POST') !== 'GET') init.body = entry.reqBody || '';

    var res = await pageFetch(entry.url, init);
    var parsed = Adapter.parseMaybe(res.text);
    var ok = !res.error && jsonOk(res.status, parsed);
    var bizReject = !ok && !res.error && res.status >= 200 && res.status < 300;
    var reason = '';
    if (!ok) reason = failReason(res, parsed);
    var failIds = ok ? Adapter.failIdsFromResponse(parsed) : {};
    var results = ready.map(function (r) {
      var failed = !ok || failIds[r.creatorOpenId];
      return {
        handle: r.handle,
        creatorOpenId: r.creatorOpenId,
        ok: !failed,
        code: failed ? 'send_failed' : 'sent',
        reason: failed ? reason : ''
      };
    }).concat(unresolved);
    var anyOk = results.some(function (r) { return r.ok; });
    return {
      ok: anyOk,
      live: true,
      method: 'seller-center',
      code: anyOk ? 'sent' : 'send_failed',
      endpoint: entry.method + ' ' + (entry.url.split('?')[0]),
      requestId: parsed && (parsed.request_id || parsed.requestId) || '',
      reason: anyOk ? '' : reason,
      status: res.status,
      bizReject: bizReject,
      tiktokCode: parsed && parsed.code,
      sku: Adapter.collabSku(data),
      results: results
    };
  }

  async function sendOne(row, ctx) {
    return sendBatch([row], ctx);
  }

  var findAbort = false;

  async function findPages(limit, step) {
    var P = window.LarisAffiliatePaging;
    if (!P) return { ok: false, code: 'no_paging', reason: 'Helper halaman belum termuat. Reload ekstensi.' };
    limit = Math.max(1, Math.min(1000, Number(limit) || 1));
    step = step || {};
    var data = await Adapter.loadStore();
    var entry = Adapter.latestList(data);
    if (!entry) {
      var any = Adapter.latest(data, 'search');
      if (any && Adapter.searchKind(any) === 'handle') {
        return {
          ok: false,
          code: 'handle_lookup',
          reason: 'Rekaman terakhir cari satu handle. Di Find Creators, kosongkan pencarian, set filter, buka halaman berikutnya, lalu Ambil lagi.'
        };
      }
      return {
        ok: false,
        code: 'no_search',
        reason: 'Belum ada rekaman daftar kreator. Buka Find Creators, set filter, ganti halaman sekali, jangan undang.'
      };
    }
    var body = Adapter.parseMaybe(entry.reqBody);
    var spec = P.describeSearch(body);
    if (!spec.page && !spec.offset && !spec.cursor) {
      return {
        ok: false,
        code: 'no_page',
        reason: 'Rekaman Find Creators tidak punya nomor halaman. Set filter, buka halaman 2, lalu Ambil lagi.'
      };
    }
    var rows = [];
    var seen = {};
    var page = 0;
    var cursor = spec.cursor ? spec.cursor.value : '';
    var size = spec.size ? spec.size.value : 20;
    var guardMax = Math.min(80, Math.ceil(limit / Math.max(1, size)) + 3);
    var pages = 0;
    while (rows.length < limit && pages < guardMax) {
      if (findAbort) break;
      var nextBody = P.applyPaging(body, spec, {
        pageIndex: page,
        size: size,
        cursor: cursor,
        clearQuery: !!step.clearQuery,
        followers: step.followers,
        gmv: step.gmv
      });
      var init = { method: entry.method || 'POST', headers: { 'content-type': 'application/json' } };
      if ((entry.method || 'POST') !== 'GET') init.body = JSON.stringify(nextBody);
      var res = await pageFetch(entry.url, init, { maxBody: 1500000, timeout: 25000 });
      var json = Adapter.parseMaybe(res.text);
      if (res.error || !jsonOk(res.status, json)) {
        if (!rows.length) {
          return {
            ok: false,
            code: 'find_failed',
            reason: failReason(res, json) || 'Find Creators tidak menjawab.',
            rows: []
          };
        }
        break;
      }
      var batch = P.extractCreatorList(json);
      var added = 0;
      batch.forEach(function (rec) {
        if (rows.length >= limit) return;
        var key = rec.creatorOpenId || rec.handle;
        if (!key || seen[key]) return;
        seen[key] = true;
        rows.push(rec);
        added += 1;
      });
      pages += 1;
      try {
        chrome.runtime.sendMessage({ type: 'laris-find-progress', got: rows.length, page: pages, limit: limit });
      } catch (e) { /* panel may be closed */ }
      if (!added) break;
      if (rows.length >= limit) break;
      var nxt = P.nextCursor(json);
      var advanced = false;
      if (spec.cursor && nxt != null && nxt !== '' && String(nxt) !== String(cursor)) {
        cursor = nxt;
        advanced = true;
      }
      if (spec.page || spec.offset) {
        page += 1;
        advanced = true;
      }
      if (!advanced) break;
      await sleep(1000);
    }
    return {
      ok: true,
      rows: rows,
      pages: pages,
      stopped: findAbort ? 'abort' : (rows.length >= limit ? 'limit' : 'end'),
      endpoint: (entry.method || 'POST') + ' ' + String(entry.url || '').split('?')[0]
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === 'laris-find-stop') {
      findAbort = true;
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'laris-find-pages') {
      findAbort = false;
      findPages(msg.limit, msg.step).then(sendResponse);
      return true;
    }
    if (msg.type === 'laris-probe') {
      probeOne(msg.row).then(sendResponse);
      return true;
    }
    if (msg.type !== 'laris-send') return;
    var rows = msg.rows && msg.rows.length ? msg.rows : [msg.row];
    sendBatch(rows, msg.ctx).then(sendResponse);
    return true;
  });

  hello();
  setInterval(hello, 2500);
  document.addEventListener('DOMContentLoaded', hello);
})();
