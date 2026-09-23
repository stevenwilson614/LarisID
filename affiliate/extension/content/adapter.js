/* Classify Affiliate Center traffic and replay Target Collab. No cookies stored. */
(function (root) {
  if (root.LarisAffiliateAdapter) return;
  var STORE = 'laris-affiliate-recon';
  var MAX_EACH = 6;

  function lower(s) { return String(s || '').toLowerCase(); }

  function classify(url, body, method) {
    var u = lower(url);
    var m = String(method || 'GET').toUpperCase();
    var write = m === 'POST' || m === 'PUT' || m === 'PATCH';
    if (!write) return null;
    if (/invitation_group\/create/.test(u) && !/conflict|sensitive|rate_limit|relevancy|prediction/.test(u)) {
      return 'collab';
    }
    if (/invitation_group\/rate_limit_info/.test(u)) return 'quota';
    if (/creator\/marketplace\/find/.test(u)) return 'search';
    if (/(\/im\/send|messages\/send|conversation\/send|chat\/send|affiliate_im)/.test(u) &&
        !/helpdesk\/im\/url|optimizer\/message/.test(u)) {
      return 'im';
    }
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
    var t = String(text || '').trim();
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
    return /(creator_oec_id|creator_oecuid|oec_id|oecuid|open_id|openid)$/i.test(String(k));
  }
  function looksLikeHandle(k) {
    return /(user_name|username|handle|unique_id|uniqueid|nick_name)$/i.test(String(k));
  }
  function looksLikeMessage(k) {
    return /^(message|invitation_msg|invite_msg|im_body)$/i.test(String(k));
  }

  function extractCreator(json, handle) {
    var want = lower(handle).replace(/^@/, '');
    var found = null;
    walk(json, function (k, val, parent) {
      if (found) return;
      if (typeof val !== 'string' && typeof val !== 'number') return;
      if (!parent || typeof parent !== 'object' || Array.isArray(parent)) return;
      var rec = {};
      walk(parent, function (pk, pv) {
        if (typeof pv !== 'string' && typeof pv !== 'number') return;
        if (looksLikeHandle(pk) && !rec.handle) rec.handle = String(pv).replace(/^@/, '');
        if (looksLikeCreatorId(pk) && !rec.creatorOpenId) rec.creatorOpenId = String(pv);
      });
      if (!rec.creatorOpenId) return;
      if (want && rec.handle && lower(rec.handle) !== want) return;
      if (want && !rec.handle && looksLikeHandle(k) && lower(val).replace(/^@/, '') !== want) return;
      found = rec;
    });
    return found;
  }

  function fillSearchTemplate(templateObj, row) {
    var json = JSON.parse(JSON.stringify(templateObj));
    if (json.query != null) json.query = row.handle;
    if (json.request && typeof json.request === 'object' && json.request.query != null) {
      json.request.query = row.handle;
    }
    return json;
  }

  function fillCollabTemplate(templateObj, rows, message) {
    var json = JSON.parse(JSON.stringify(templateObj));
    var g = json.invitation_group || json;
    if (message != null && g.message != null) g.message = message;
    var proto = (g.creator_id_list && g.creator_id_list[0])
      ? JSON.parse(JSON.stringify(g.creator_id_list[0]))
      : { base_info: { creator_id: '', nick_name: '', creator_oec_id: '' } };
    g.creator_id_list = (rows || []).map(function (row) {
      var one = JSON.parse(JSON.stringify(proto));
      var base = one.base_info || (one.base_info = {});
      base.creator_oec_id = row.creatorOpenId || row.creator_oec_id || '';
      if ('nick_name' in base) base.nick_name = row.name || '';
      if ('user_name' in base) base.user_name = row.handle || '';
      if (!base.creator_id) base.creator_id = '';
      return one;
    });
    return json;
  }

  function fillImTemplate(templateObj, row, message) {
    var json = JSON.parse(JSON.stringify(templateObj));
    walk(json, function (k, val, parent) {
      if (typeof val !== 'string' && typeof val !== 'number') return;
      if (looksLikeMessage(k)) parent[k] = message;
      else if (looksLikeHandle(k)) parent[k] = row.handle;
      else if (looksLikeCreatorId(k) && row.creatorOpenId) parent[k] = row.creatorOpenId;
    });
    return json;
  }

  function fillTemplate(templateObj, row, message) {
    if (templateObj && templateObj.invitation_group) {
      return fillCollabTemplate(templateObj, [row], message);
    }
    if (templateObj && (templateObj.query != null || (templateObj.request && templateObj.request.query != null))) {
      return fillSearchTemplate(templateObj, row);
    }
    return fillImTemplate(templateObj, row, message);
  }

  function collabSku(data) {
    var create = latest(data, 'collab');
    var body = parseMaybe(create && create.reqBody);
    var g = body && body.invitation_group;
    var product = g && g.product_list && g.product_list[0] || {};
    var title = product.title || '';
    ((data && data.collab) || []).forEach(function (e) {
      var b = parseMaybe(e.reqBody);
      var list = (b && b.invitation && b.invitation.product_list) ||
        (b && b.invitation_group && b.invitation_group.product_list) || [];
      if (list[0] && list[0].title) title = list[0].title;
    });
    var rawComm = product.target_commission;
    var pct = rawComm == null ? null : (rawComm >= 100 ? rawComm / 100 : rawComm);
    return {
      productId: product.product_id ? String(product.product_id) : '',
      productName: title,
      commissionPct: pct,
      invitationName: g && g.name || '',
      endTime: g && g.end_time || '',
      recordedCreators: g && g.creator_id_list ? g.creator_id_list.length : 0
    };
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
        resolve(res[STORE] || { search: [], collab: [], im: [], quota: [] });
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
    if (!list || !list.length) return null;
    if (channel === 'search') {
      var find = list.find(function (e) { return /marketplace\/find/.test(e.url); });
      if (find) return find;
    }
    if (channel === 'collab') {
      var create = list.find(function (e) { return /invitation_group\/create/.test(e.url); });
      if (create) return create;
    }
    return list[0];
  }

  function reconFlags(data) {
    data = data || {};
    var search = latest(data, 'search');
    var collab = latest(data, 'collab');
    var im = latest(data, 'im');
    return {
      search: !!(search && /marketplace\/find/.test(search.url)),
      collab: !!(collab && /invitation_group\/create/.test(collab.url)),
      im: !!(im && !/helpdesk\/im\/url/.test(im.url)),
      quota: !!(data.quota && data.quota.length),
      sku: collabSku(data)
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

  function failIdsFromResponse(parsed) {
    var ids = {};
    walk(parsed, function (k, val) {
      if (!looksLikeCreatorId(k)) return;
      if (typeof val === 'string' || typeof val === 'number') {
        var parentKey = '';
        /* fail lists often sit under fail / error / invalid */
      }
    });
    walk(parsed, function (k, val, parent) {
      if (!Array.isArray(val)) return;
      if (!/fail|error|invalid|reject/i.test(String(k))) return;
      val.forEach(function (item) {
        if (!item) return;
        if (typeof item === 'string' || typeof item === 'number') {
          ids[String(item)] = true;
          return;
        }
        walk(item, function (pk, pv) {
          if (looksLikeCreatorId(pk) && (typeof pv === 'string' || typeof pv === 'number')) {
            ids[String(pv)] = true;
          }
        });
      });
    });
    return ids;
  }

  root.LarisAffiliateAdapter = {
    classify: classify,
    fillUrl: fillUrl,
    parseMaybe: parseMaybe,
    extractCreator: extractCreator,
    fillTemplate: fillTemplate,
    fillCollabTemplate: fillCollabTemplate,
    fillSearchTemplate: fillSearchTemplate,
    collabSku: collabSku,
    ingest: ingest,
    loadStore: loadStore,
    saveStore: saveStore,
    latest: latest,
    reconFlags: reconFlags,
    needsOpenId: needsOpenId,
    failIdsFromResponse: failIdsFromResponse
  };
})(typeof window !== 'undefined' ? window : self);
