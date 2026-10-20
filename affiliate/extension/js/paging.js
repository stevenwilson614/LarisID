/* Pure helpers for Find Creators replay, quota, and invite field edits. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.LarisAffiliatePaging = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function walk(node, fn, path) {
    path = path || [];
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(function (item, i) {
        fn(String(i), item, node, path.concat(i));
        walk(item, fn, path.concat(i));
      });
      return;
    }
    Object.keys(node).forEach(function (k) {
      fn(k, node[k], node, path.concat(k));
      walk(node[k], fn, path.concat(k));
    });
  }

  function parentKey(path) {
    return path.length >= 2 ? String(path[path.length - 2]) : '';
  }

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function setPath(obj, path, value) {
    var cur = obj;
    for (var i = 0; i < path.length - 1; i++) {
      if (!cur || typeof cur !== 'object') return;
      cur = cur[path[i]];
    }
    if (cur && typeof cur === 'object') cur[path[path.length - 1]] = value;
  }

  function emptySearch() {
    return {
      page: null,
      offset: null,
      size: null,
      cursor: null,
      query: null,
      handleLookup: false,
      filters: { followers: null, gmv: null, category: '' }
    };
  }

  function better(next, prev) {
    if (!prev) return true;
    if (next.score !== prev.score) return next.score > prev.score;
    return next.path.length < prev.path.length;
  }

  function describeSearch(body) {
    var spec = emptySearch();
    if (!body || typeof body !== 'object') return spec;
    var page = null;
    var offset = null;
    var size = null;
    var cursor = null;
    var query = null;
    walk(body, function (k, val, parent, path) {
      if (val != null && typeof val === 'object') {
        if (!spec.filters.category && /categor/i.test(k) && Array.isArray(val) && val.length) {
          spec.filters.category = val.length + ' kategori';
        }
        return;
      }
      var parentName = parentKey(path);
      var pagy = /pagination|page_info|paging/i.test(parentName) ? 5 : 0;
      if (isNum(val) && /^(page|page_num|page_number|page_index|page_no)$/i.test(k)) {
        var rec = { path: path.slice(), value: val, score: pagy + (/^page$/i.test(k) ? 2 : 1) };
        if (better(rec, page)) page = rec;
      } else if (isNum(val) && /^(offset|start_index|item_offset)$/i.test(k)) {
        var off = { path: path.slice(), value: val, score: pagy + 2 };
        if (better(off, offset)) offset = off;
      } else if (isNum(val) && val >= 1 && val <= 100 && /^(size|page_size|pagesize|limit|page_count)$/i.test(k)) {
        var sz = { path: path.slice(), value: val, score: pagy + (/page_size|pagesize/i.test(k) ? 3 : 1) };
        if (better(sz, size)) size = sz;
      } else if (/^(cursor|next_cursor|next_item_cursor|scroll_id|search_id|search_key)$/i.test(k) &&
          (typeof val === 'string' || typeof val === 'number')) {
        if (/^search_key$/i.test(k) && !/pagination|page_info|paging/i.test(parentName)) return;
        var cur = { path: path.slice(), value: val, score: pagy + (/^next_/i.test(k) ? 1 : 2) };
        if (better(cur, cursor)) cursor = cur;
      } else if (typeof val === 'string' && /^query$/i.test(k)) {
        var q = { path: path.slice(), value: val, score: path.length ? 1 : 0 };
        if (!query || path.length < query.path.length) query = q;
      }
      if (!spec.filters.followers && isNum(val)) {
        if (/left_bound|min/i.test(k) && /follower/i.test(parentName)) {
          spec.filters.followers = { path: path.slice(), value: val };
        } else if (/^(min_follower|min_followers|follower_min|follower_cnt_min)$/i.test(k)) {
          spec.filters.followers = { path: path.slice(), value: val };
        }
      }
      if (!spec.filters.gmv && isNum(val)) {
        if (/left_bound|min/i.test(k) && /gmv|revenue/i.test(parentName)) {
          spec.filters.gmv = { path: path.slice(), value: val };
        } else if (/^(min_gmv|gmv_min|revenue_min)$/i.test(k)) {
          spec.filters.gmv = { path: path.slice(), value: val };
        }
      }
      if (!spec.filters.category && /categor/i.test(k)) {
        if (Array.isArray(val) && val.length) spec.filters.category = val.length + ' kategori';
        else if (typeof val === 'string' && val) spec.filters.category = val.slice(0, 40);
        else if (isNum(val) && val > 0) spec.filters.category = 'kategori ' + val;
      }
    });
    spec.page = page;
    spec.offset = offset;
    spec.size = size;
    spec.cursor = cursor;
    spec.query = query;
    var qv = query ? String(query.value || '').trim() : '';
    spec.handleLookup = /^@?[A-Za-z0-9._]{2,32}$/.test(qv);
    return spec;
  }

  function applyPaging(body, spec, step) {
    var json = JSON.parse(JSON.stringify(body || {}));
    spec = spec || emptySearch();
    step = step || {};
    var size = step.size || (spec.size && spec.size.value) || 20;
    if (spec.size) setPath(json, spec.size.path, size);
    if (spec.page) setPath(json, spec.page.path, Number(spec.page.value) + (step.pageIndex || 0));
    if (spec.offset) setPath(json, spec.offset.path, (step.pageIndex || 0) * size);
    if (spec.cursor && step.cursor != null) setPath(json, spec.cursor.path, step.cursor);
    if (step.clearQuery && spec.query) setPath(json, spec.query.path, '');
    if (step.followers != null && step.followers !== '' && spec.filters && spec.filters.followers) {
      setPath(json, spec.filters.followers.path, Number(step.followers));
    }
    if (step.gmv != null && step.gmv !== '' && spec.filters && spec.filters.gmv) {
      setPath(json, spec.filters.gmv.path, Number(step.gmv));
    }
    return json;
  }

  function nextCursor(json) {
    var preferred = null;
    var fallback = null;
    walk(json, function (k, val, parent, path) {
      if (val == null || val === '' || val === 0 || typeof val === 'object') return;
      if (!/^(next_cursor|next_item_cursor|search_key|cursor|search_id)$/i.test(k)) return;
      var pagy = /pagination|page_info|paging/i.test(parentKey(path));
      if (/^next_/i.test(k)) {
        if (!preferred) preferred = val;
        return;
      }
      if (pagy && !fallback) fallback = val;
    });
    return preferred != null ? preferred : fallback;
  }

  function looksLikeCreatorId(k) {
    return /(creator_oec_id|creator_oecuid|oec_id|oecuid|open_id|openid)$/i.test(String(k));
  }
  function looksLikeHandle(k) {
    return /(user_name|username|handle|unique_id|uniqueid)$/i.test(String(k)) && !/open_?id/i.test(String(k));
  }
  function looksLikeNick(k) {
    return /(nick_name|nickname|display_name)$/i.test(String(k));
  }
  function looksLikeFollowers(k) {
    return /(follower_cnt|follower_count|followers|fans_count|follower_num)$/i.test(String(k));
  }
  function looksLikeGmv(k) {
    return /(^gmv$|video_gmv|live_gmv|total_gmv|revenue)$/i.test(String(k));
  }

  function absorb(obj, rec) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (typeof v === 'object') return;
      if (!rec.handle && looksLikeHandle(k)) rec.handle = String(v).replace(/^@/, '');
      if (!rec.name && looksLikeNick(k)) rec.name = String(v);
      if (!rec.followers && looksLikeFollowers(k) && isNum(Number(v))) rec.followers = Number(v) || 0;
      if (!rec.revenue && looksLikeGmv(k)) {
        var n = Number(String(v).replace(/[^\d.]/g, ''));
        if (isFinite(n)) rec.revenue = n;
      }
    });
    ['base_info', 'creator_info', 'creator', 'author'].forEach(function (nest) {
      if (obj[nest] && typeof obj[nest] === 'object') absorb(obj[nest], rec);
    });
  }

  function extractCreatorList(json) {
    var seen = {};
    var rows = [];
    walk(json, function (k, val, parent) {
      if (!looksLikeCreatorId(k)) return;
      if (typeof val !== 'string' && typeof val !== 'number') return;
      var id = String(val);
      if (!/^\d{8,}$/.test(id) || seen[id]) return;
      var rec = { creatorOpenId: id, handle: '', name: '', followers: 0, revenue: 0 };
      absorb(parent, rec);
      if (!rec.handle) return;
      seen[id] = true;
      rows.push(rec);
    });
    return rows;
  }

  function numKey(obj, names) {
    if (!obj || typeof obj !== 'object') return null;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      for (var j = 0; j < names.length; j++) {
        if (keys[i].toLowerCase() === names[j]) {
          var n = Number(obj[keys[i]]);
          if (isFinite(n)) return n;
        }
      }
    }
    return null;
  }

  function readQuotaObject(obj, path) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    var blob = path.join('.').toLowerCase() + '.' + Object.keys(obj).join('.').toLowerCase();
    if (!/quota|invitation|limit|rate/.test(blob)) return null;
    var remaining = numKey(obj, ['remaining', 'remain', 'left', 'available', 'rest_quota', 'unused_quota', 'quota_left']);
    var total = numKey(obj, ['total', 'max', 'max_quota', 'limit', 'quota_limit', 'total_quota', 'max_limit']);
    var used = numKey(obj, ['used', 'used_num', 'used_quota', 'used_count']);
    if (remaining == null && total != null && used != null) remaining = Math.max(0, total - used);
    if (remaining == null) return null;
    if (remaining < 0 || remaining > 1000000) return null;
    return { remaining: remaining, total: total, used: used };
  }

  function parseLiveQuota(entries) {
    var best = null;
    (entries || []).forEach(function (entry) {
      var json = null;
      if (entry && typeof entry.resBody === 'string') {
        try { json = JSON.parse(entry.resBody); } catch (e) { json = null; }
      } else if (entry && typeof entry === 'object' && entry.resBody && typeof entry.resBody === 'object') {
        json = entry.resBody;
      }
      if (!json) return;
      var found = null;
      var root = readQuotaObject(json, []);
      if (root) found = root;
      walk(json, function (k, val, parent, path) {
        var rec = readQuotaObject(val, path);
        if (rec) found = rec;
      });
      if (!found) return;
      found.at = entry.at || 0;
      if (!best || found.at >= best.at) best = found;
    });
    return best;
  }

  function commissionRaw(recorded, pct) {
    var n = Number(pct);
    if (!isFinite(n)) return recorded;
    if (Number(recorded) >= 100) return Math.round(n * 100);
    return n;
  }

  function endRaw(recorded, dateStr) {
    if (!dateStr) return recorded;
    var ms = Date.parse(String(dateStr).slice(0, 10) + 'T23:59:59+07:00');
    if (!isFinite(ms)) return recorded;
    if (typeof recorded === 'number') {
      if (recorded > 1e12) return ms;
      if (recorded > 1e9) return Math.floor(ms / 1000);
    }
    if (typeof recorded === 'string' && /^\d{10,13}$/.test(recorded)) {
      return String(recorded.length >= 13 ? ms : Math.floor(ms / 1000));
    }
    if (typeof recorded === 'string' && /^\d{4}-\d{2}-\d{2}/.test(recorded)) return String(dateStr).slice(0, 10);
    return recorded;
  }

  return {
    walk: walk,
    describeSearch: describeSearch,
    applyPaging: applyPaging,
    nextCursor: nextCursor,
    extractCreatorList: extractCreatorList,
    parseLiveQuota: parseLiveQuota,
    commissionRaw: commissionRaw,
    endRaw: endRaw,
    looksLikeCreatorId: looksLikeCreatorId,
    looksLikeHandle: looksLikeHandle,
    looksLikeNick: looksLikeNick
  };
});
