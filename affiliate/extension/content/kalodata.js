/* Isolated world only. Read visible Kalodata creator rows. No fetch, no MAIN hook. */
(function () {
  if (window.__larisKalodataContent) return;
  window.__larisKalodataContent = true;

  /* Mapped against www.kalodata.com/creator (Ant Design table). Tune here only. */
  var SELECTORS = {
    row: 'tr.ant-table-row, tr[data-row-key], [class*="creator-item"], [role="row"]',
    handleLink: 'a[href*="tiktok.com/@"]',
    detailLink: 'a[href*="/creator/detail"], a[href*="/creator/"], a[href*="cid="], a[href*="unique"]',
    tableHead: 'thead th, tr:first-child th',
    cell: 'td'
  };
  var ID_PARAMS = ['creator_oecuid', 'oecuid', 'uniqueId', 'unique_id', 'cid', 'creatorId', 'creator_id', 'id'];

  function textOf(el) {
    return String(el && el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function parseNum(raw) {
    var s = String(raw || '').trim().toLowerCase().replace(/\s/g, '');
    if (!s) return 0;
    s = s.replace(/rp/g, '').replace(/idr/g, '');
    var mul = 1;
    if (/jt|juta/.test(s)) mul = 1e6;
    else if (/rb|ribu/.test(s) || /[0-9]k\b/.test(s)) mul = 1e3;
    else if (/miliar/.test(s)) mul = 1e9;
    else if (/\dm\b/.test(s)) mul = 1e6;
    s = s.replace(/jt|juta|ribu|miliar|rb/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n * mul : 0;
  }

  function handleFrom(str, href) {
    var h = '';
    var m = String(href || '').match(/tiktok\.com\/@([A-Za-z0-9._]+)/i);
    if (m) h = m[1];
    if (!h) {
      m = String(str || '').match(/@([A-Za-z0-9._]{2,24})/);
      if (m) h = m[1];
    }
    return h.replace(/^@+/, '');
  }

  function uniqueIdFrom(href, el, rowEl) {
    if (rowEl && rowEl.getAttribute) {
      var key = rowEl.getAttribute('data-row-key') || rowEl.getAttribute('data-row-id');
      if (key && /^\d{8,}$/.test(key)) return key;
    }
    var u = String(href || '');
    try {
      var url = new URL(u, location.href);
      for (var i = 0; i < ID_PARAMS.length; i++) {
        var v = url.searchParams.get(ID_PARAMS[i]);
        if (v && /^\d{8,}$/.test(v)) return v;
      }
      var path = url.pathname.match(/\/(?:creator|detail)\/(\d{8,})/);
      if (path) return path[1];
    } catch (e) { /* ignore */ }
    var attr = '';
    if (el && el.getAttribute) {
      ['data-id', 'data-creator-id', 'data-oec-id', 'data-unique-id'].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && /^\d{8,}$/.test(v) && !attr) attr = v;
      });
    }
    if (attr) return attr;
    var digits = String(textOf(rowEl || el)).match(/\b(\d{15,})\b/);
    return digits ? digits[1] : '';
  }

  function closestRow(el) {
    return el.closest(SELECTORS.row) || el.closest('tr, li') || el.parentElement;
  }

  function cellMap(row) {
    var map = { followers: 0, revenue: 0, nickname: '' };
    if (!row) return map;
    var table = row.closest('table, .ant-table');
    var cells = row.querySelectorAll(SELECTORS.cell);
    if (table && cells.length) {
      var heads = Array.prototype.map.call(table.querySelectorAll(SELECTORS.tableHead), function (th) {
        return textOf(th).toLowerCase();
      });
      Array.prototype.forEach.call(cells, function (td, i) {
        var label = heads[i] || '';
        var val = textOf(td);
        if (/follower|pengikut/.test(label)) map.followers = parseNum(val);
        else if (/revenue|gmv|pendapatan|omset/.test(label)) map.revenue = parseNum(val);
        else if (/nick|nama|name/.test(label) && !/handle|id/.test(label)) map.nickname = val;
      });
      return map;
    }
    var blob = textOf(row);
    var fol = blob.match(/([\d.,]+)\s*(k|rb|jt|m)?\s*(followers|pengikut)/i);
    if (fol) map.followers = parseNum(fol[1] + (fol[2] || ''));
    return map;
  }

  function readVisible() {
    var seen = {};
    var rows = [];
    var nodes = document.querySelectorAll(SELECTORS.row + ', ' + SELECTORS.handleLink + ', ' + SELECTORS.detailLink);
    Array.prototype.forEach.call(nodes, function (el) {
      var href = el.getAttribute && el.getAttribute('href') || '';
      var blob = textOf(el);
      var handle = handleFrom(blob, href);
      if (!handle) return;
      if (seen[handle]) return;
      var rowEl = closestRow(el);
      var idHref = href;
      if (rowEl) {
        var detail = rowEl.querySelector(SELECTORS.detailLink + ', ' + SELECTORS.handleLink);
        if (detail) idHref = detail.getAttribute('href') || idHref;
      }
      var uid = uniqueIdFrom(idHref, el, rowEl);
      var cells = cellMap(rowEl);
      seen[handle] = true;
      rows.push({
        handle: handle,
        name: cells.nickname || '',
        creatorOpenId: uid,
        followers: cells.followers || 0,
        revenue: cells.revenue || 0
      });
    });
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
