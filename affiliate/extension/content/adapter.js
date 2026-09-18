/* Classify Affiliate Center traffic and replay one invite/IM. No cookies stored. */
(function (root) {
  if (root.LarisAffiliateAdapter) return;
  var STORE = 'laris-affiliate-recon';
  var MAX_EACH = 6;

  function lower(s) { return String(s || '').toLowerCase(); }

  function classify(url, body, method) {
    var u = lower(url);
    var b = lower(body);
    var hay = u + ' ' + b;
    var m = String(method || 'GET').toUpperCase();
    var write = m === 'POST' || m === 'PUT' || m === 'PATCH';
    if (write && /(\/im\/|\/message\/|messages\/send|conversation|chat\/send|im_send|affiliate_im)/.test(hay)) return 'im';
    if (write && /(target.?collab|target_collaboration|invitation|invite.*creator|creator.*invite|collaboration\/invite|invite_to_collaborate)/.test(hay)) return 'collab';
    if (/(creator.*search|search.*creator|find_creator|marketplace\/creator|creator\/list|query.?creator|creator\/marketplace)/.test(hay)) return 'search';
    return null;
  }

  function fillUrl(url, row) {
    try {
      var u = new URL(url, location.href);
      ['keyword', 'username', 'handle', 'query', 'search_key', 'unique_id', 'creator_name'].forEach(function (key) {
        if (u.searchParams.has(key)) u.searchParams.set(key, row.handle);
      });
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function interestingUrl(url) {
    var u = lower(url);
    if (!u) return false;
    if (/\.(png|jpe?g|gif|webp|css|woff2?|mp4)(\?|$)/.test(u)) return false;
    if (/google-analytics|doubleclick|sentry|hotjar|pixel/.test(u)) return false;
    return /tokopedia|tiktokshop|tiktokglobalshop|affiliate/.test(u);
  }

  function parseMaybe(text) {
    if (!text) return null;
    var t = String(text).trim();
    if (!t) return null;
    if (t[0] !== '{' && t[0] !== '[') return null;
    try { return JSON.parse(t); } catch (e) { return null; }
  }

  function walk(node, fn) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(function (item, i) { fn(i, item, node); walk(item, fn); });
      return;
    }
    Object.keys(node).forEach(function (k) {
      fn(k, node[k], node);
      walk(node[k], fn);
    });
  }

  function looksLikeCreatorId(k) {
    return /(open_id|openid|creator_id|creatorid|oec_id|oecuid|creator_oec|uid)$/i.test(String(k));
  }
  function looksLikeHandle(k) {
    return /(username|handle|unique_id|uniqueid|creator_name|nick_name)$/i.test(String(k));
  }
  function looksLikeMessage(k) {
    return /(message|content|text|remark|invitation_msg|invite_msg|im_body)$/i.test(String(k));
  }

  function extractCreator(json, handle) {
    var want = lower(handle).replace(/^@/, '');
    var found = null;
    walk(json, function (k, val, parent) {
      if (found) return;
      if (typeof val !== 'string' && typeof val !== 'number') return;
      if (!looksLikeHandle(k) && !looksLikeCreatorId(k)) return;
      if (looksLikeHandle(k) && want && lower(val).replace(/^@/, '') !== want) return;
      if (parent && typeof parent === 'object' && !Array.isArray(parent)) {
        var rec = { raw: parent };
        walk(parent, function (pk, pv) {
          if (typeof pv !== 'string' && typeof pv !== 'number') return;
          if (looksLikeHandle(pk) && !rec.handle) rec.handle = String(pv).replace(/^@/, '');
          if (looksLikeCreatorId(pk) && !rec.creatorOpenId) rec.creatorOpenId = String(pv);
        });
        if (rec.handle || rec.creatorOpenId) found = rec;
      }
    });
    return found;
  }

  function shrinkCreatorArrays(obj, row) {
    walk(obj, function (k, val, parent) {
      if (!Array.isArray(val) || !val.length) return;
      var first = val[0];
      if (!first || typeof first !== 'object') {
        if (typeof first === 'string' && looksLikeHandle(k)) parent[k] = [row.handle];
        return;
      }
      var hit = false;
      Object.keys(first).forEach(function (fk) {
        if (looksLikeHandle(fk) || looksLikeCreatorId(fk)) hit = true;
      });
      if (!hit) return;
      var one = JSON.parse(JSON.stringify(first));
      walk(one, function (pk, pv, pnode) {
        if (looksLikeHandle(pk) && typeof pv === 'string') pnode[pk] = row.handle;
        if (looksLikeCreatorId(pk) && row.creatorOpenId) pnode[pk] = row.creatorOpenId;
      });
      parent[k] = [one];
    });
  }

  function fillTemplate(templateObj, row, message) {
    var json = JSON.parse(JSON.stringify(templateObj));
    walk(json, function (k, val, parent) {
      if (typeof val !== 'string' && typeof val !== 'number') return;
      if (looksLikeMessage(k)) parent[k] = message;
      else if (looksLikeHandle(k)) parent[k] = row.handle;
      else if (looksLikeCreatorId(k) && row.creatorOpenId) parent[k] = row.creatorOpenId;
    });
    shrinkCreatorArrays(json, row);
    return json;
  }

  function summarize(entry) {
    return {
      url: entry.url,
      method: entry.method,
      reqBody: entry.reqBody || '',
      status: entry.status,
      at: Date.now()
    };
  }

  function loadStore() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(STORE, function (res) {
        resolve(res[STORE] || { search: [], collab: [], im: [] });
      });
    });
  }

  function saveStore(data) {
    return chrome.storage.local.set({ [STORE]: data });
  }

  async function ingest(raw) {
    if (!raw || !interestingUrl(raw.url)) return null;
    var channel = classify(raw.url, raw.reqBody || '', raw.method);
    if (!channel) return null;
    var data = await loadStore();
    if (!data[channel]) data[channel] = [];
    data[channel].unshift(summarize(raw));
    data[channel] = data[channel].slice(0, MAX_EACH);
    data.updatedAt = Date.now();
    await saveStore(data);
    return { channel: channel, url: raw.url };
  }

  function latest(data, channel) {
    var list = data && data[channel];
    return list && list[0] ? list[0] : null;
  }

  function reconFlags(data) {
    data = data || {};
    return {
      search: !!(data.search && data.search.length),
      collab: !!(data.collab && data.collab.length),
      im: !!(data.im && data.im.length)
    };
  }

  function needsOpenId(entry) {
    var body = parseMaybe(entry && entry.reqBody);
    if (!body) return false;
    var need = false;
    walk(body, function (k, val) {
      if (looksLikeCreatorId(k) && (typeof val === 'string' || typeof val === 'number')) need = true;
    });
    return need;
  }

  root.LarisAffiliateAdapter = {
    classify: classify,
    fillUrl: fillUrl,
    parseMaybe: parseMaybe,
    extractCreator: extractCreator,
    fillTemplate: fillTemplate,
    ingest: ingest,
    loadStore: loadStore,
    saveStore: saveStore,
    latest: latest,
    reconFlags: reconFlags,
    needsOpenId: needsOpenId
  };
})(typeof window !== 'undefined' ? window : self);
