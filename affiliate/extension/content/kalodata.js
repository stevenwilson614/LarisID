/* Isolated world only. Read visible Kalodata creator rows. No fetch, no MAIN hook. */
(function () {
  if (window.__larisKalodataContent) return;
  window.__larisKalodataContent = true;

  /* Live-mapped 2026-09-18 on https://www.kalodata.com/creator (ID ranking table). */
  var SELECTORS = {
    row: 'tr[data-slot="table-row"], tr.group.cursor-pointer, table tbody tr',
    headerRow: 'thead tr, tr[data-slot="table-row"]:not(.cursor-pointer)',
    cell: 'td[data-slot="table-cell"], td'
  };

  function textOf(el) {
    return String(el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  }

  function parseNum(raw) {
    var s = String(raw || '').trim().toLowerCase().replace(/\s/g, '');
    if (!s || s === '****') return 0;
    s = s.replace(/rp/g, '').replace(/idr/g, '');
    var mul = 1;
    if (/jt|juta/.test(s)) mul = 1e6;
    else if (/rb|ribu/.test(s)) mul = 1e3;
    else if (/miliar/.test(s)) mul = 1e9;
    else if (/m$/.test(s)) mul = 1e9;
    else if (/k$/.test(s)) mul = 1e3;
    s = s.replace(/jt|juta|ribu|miliar|rb/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n * mul : 0;
  }

  var SKIP = { kalodata: 1, tiktok: 1, tiktokshop: 1, youtube: 1, instagram: 1, facebook: 1, google: 1 };

  function handleFrom(str) {
    var m = String(str || '').match(/@([A-Za-z0-9._]{2,24})/);
    if (!m) return '';
    var h = m[1];
    return SKIP[h.toLowerCase()] ? '' : h;
  }

  function headerLabels() {
    var row = document.querySelector(SELECTORS.headerRow);
    if (!row) return [];
    return Array.prototype.map.call(row.querySelectorAll('th, ' + SELECTORS.cell), function (c) {
      return textOf(c).toLowerCase();
    });
  }

  function colIndex(heads, names) {
    for (var i = 0; i < heads.length; i++) {
      for (var j = 0; j < names.length; j++) {
        if (heads[i].indexOf(names[j]) >= 0) return i;
      }
    }
    return -1;
  }

  function uniqueIdFrom(el) {
    if (!el || !el.getAttribute) return '';
    var key = el.getAttribute('data-row-key') || el.getAttribute('data-id') || '';
    if (/^\d{8,}$/.test(key)) return key;
    var a = el.querySelector && el.querySelector('a[href]');
    var href = a && a.getAttribute('href') || '';
    try {
      var u = new URL(href, location.href);
      var keys = ['id', 'cid', 'creatorId', 'creator_id', 'uniqueId', 'unique_id'];
      for (var i = 0; i < keys.length; i++) {
        var v = u.searchParams.get(keys[i]);
        if (v && /^\d{8,}$/.test(v)) return v;
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function readVisible() {
    var seen = {};
    var rows = [];
    var heads = headerLabels();
    var iNick = colIndex(heads, ['info kreator', 'kreator', 'creator']);
    var iRev = colIndex(heads, ['pendapatan', 'revenue', 'gmv']);
    var iFol = colIndex(heads, ['pengikut', 'follower']);
    var nodes = document.querySelectorAll(SELECTORS.row);
    Array.prototype.forEach.call(nodes, function (tr) {
      var blob = textOf(tr);
      var handle = handleFrom(blob);
      if (!handle || seen[handle]) return;
      var cells = tr.querySelectorAll(SELECTORS.cell);
      var info = iNick >= 0 && cells[iNick] ? textOf(cells[iNick]) : blob;
      var name = info.replace('@' + handle, '').replace(/^@/, '').trim();
      var revTxt = iRev >= 0 && cells[iRev] ? textOf(cells[iRev]) : '';
      var folTxt = iFol >= 0 && cells[iFol] ? textOf(cells[iFol]) : '';
      seen[handle] = true;
      rows.push({
        handle: handle,
        name: name,
        creatorOpenId: uniqueIdFrom(tr),
        followers: parseNum(folTxt),
        revenue: parseNum(revTxt)
      });
    });
    if (!rows.length) {
      var text = textOf(document.body);
      var re = /@([A-Za-z0-9._]{2,24})/g;
      var m;
      while ((m = re.exec(text))) {
        if (seen[m[1]]) continue;
        seen[m[1]] = true;
        rows.push({ handle: m[1], name: '', creatorOpenId: '', followers: 0, revenue: 0 });
      }
    }
    return {
      ok: true,
      kalodata: true,
      href: location.href,
      page: location.pathname,
      count: rows.length,
      rows: rows
    };
  }

  function hello() {
    var shot = readVisible();
    chrome.runtime.sendMessage({
      type: 'laris-hello',
      href: location.href,
      kalodata: true,
      count: shot.count
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.type !== 'laris-kalodata-read') return;
    sendResponse(readVisible());
  });

  hello();
  setInterval(hello, 2500);
  document.addEventListener('DOMContentLoaded', hello);
})();
