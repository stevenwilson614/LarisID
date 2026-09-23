/* MAIN world: watch the page's own fetch/XHR. Never post cookies. */
(function () {
  if (window.__larisAffiliateHooked) return;
  window.__larisAffiliateHooked = true;

  var SRC_MAIN = 'laris-affiliate-main';
  var SRC_ISO = 'laris-affiliate-isolated';
  var MAX_BODY = 24000;
  var origFetch = window.fetch.bind(window);

  function clip(s) {
    s = String(s == null ? '' : s);
    if (s.length > MAX_BODY) return s.slice(0, MAX_BODY);
    return s;
  }

  function bodyOf(init) {
    if (!init) return '';
    var b = init.body;
    if (b == null) return '';
    if (typeof b === 'string') return clip(b);
    try { return clip(JSON.stringify(b)); } catch (e) { return ''; }
  }

  function emitCapture(payload) {
    try {
      window.postMessage({ source: SRC_MAIN, op: 'capture', payload: payload }, '*');
    } catch (e) { /* ignore */ }
  }

  window.fetch = function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e1) { url = ''; }
    var method = (init && init.method) || (input && input.method) || 'GET';
    var reqBody = bodyOf(init);
    var p = origFetch(input, init);
    p.then(function (res) {
      try {
        var copy = res.clone();
        copy.text().then(function (text) {
          emitCapture({
            url: url,
            method: String(method || 'GET').toUpperCase(),
            reqBody: reqBody,
            status: res.status,
            resBody: clip(text)
          });
        }).catch(function () {});
      } catch (e2) { /* ignore */ }
    }).catch(function () {});
    return p;
  };

  var OrigXHR = window.XMLHttpRequest;
  function WrappedXHR() {
    var xhr = new OrigXHR();
    var method = 'GET';
    var url = '';
    var reqBody = '';
    var open = xhr.open;
    xhr.open = function (m, u) {
      method = m;
      url = u;
      return open.apply(xhr, arguments);
    };
    var send = xhr.send;
    xhr.send = function (body) {
      reqBody = body == null ? '' : clip(typeof body === 'string' ? body : '');
      xhr.addEventListener('load', function () {
        emitCapture({
          url: url,
          method: String(method || 'GET').toUpperCase(),
          reqBody: reqBody,
          status: xhr.status,
          resBody: clip(xhr.responseText)
        });
      });
      return send.apply(xhr, arguments);
    };
    return xhr;
  }
  WrappedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = WrappedXHR;

  function extraHeaders() {
    var h = {};
    var csrf = (document.cookie.match(/(?:^|; )(?:tt_csrf_token|csrf_token)=([^;]*)/) || [])[1];
    if (csrf) h['x-tt-csrf-token'] = decodeURIComponent(csrf);
    return h;
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== SRC_ISO || d.op !== 'fetch') return;
    var init = d.init || {};
    var headers = Object.assign({}, extraHeaders(), init.headers || {});
    origFetch(d.url, Object.assign({ credentials: 'include' }, init, { headers: headers })).then(function (res) {
      return res.text().then(function (text) {
        window.postMessage({
          source: SRC_MAIN,
          op: 'fetch-result',
          id: d.id,
          status: res.status,
          ok: res.ok,
          text: clip(text)
        }, '*');
      });
    }).catch(function (err) {
      window.postMessage({
        source: SRC_MAIN,
        op: 'fetch-result',
        id: d.id,
        status: 0,
        ok: false,
        text: '',
        error: String(err && err.message || err)
      }, '*');
    });
  });
})();
