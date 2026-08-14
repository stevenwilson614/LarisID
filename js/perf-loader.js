/* LarisID — lazy script loading & deferred boot helpers */
(function (w) {
  var _scripts = {};

  function loadScript(src) {
    if (_scripts[src]) return _scripts[src];
    _scripts[src] = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-laris-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.larisLoaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.dataset.larisSrc = src;
      s.onload = function () { s.dataset.larisLoaded = '1'; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return _scripts[src];
  }

  w.larisLoadScript = loadScript;

  w.ensureSupabase = function () {
    if (w.supabase) return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
  };

  w.ensureChartJs = function () {
    if (typeof w.Chart !== 'undefined') return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js');
  };

  w.ensureJsPdf = function () {
    if (w.jspdf) return Promise.resolve();
    return loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
  };

  w.larisIdle = function (fn, timeout) {
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(fn, timeout != null ? { timeout: timeout } : undefined);
    } else {
      setTimeout(fn, timeout != null ? timeout : 1);
    }
  };

  w.larisHasStoredAuth = function () {
    try {
      var auth = JSON.parse(localStorage.getItem('laris_auth_v1') || 'null');
      return !!(auth && auth.access_token);
    } catch (_) {
      return false;
    }
  };

  w.larisShouldLoadCatalog = function () {
    return !!(w.currentUser || w.larisHasStoredAuth());
  };

  w.larisClarityEvent = function () {
    // Never drop events: if the deferred Clarity tag hasn't arrived yet, create
    // the official queue stub — the real tag drains .q when it loads.
    if (!w.clarity) w.clarity = function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
    var args = arguments;
    w.larisIdle(function () {
      try { w.clarity.apply(w, args); } catch (_) {}
    }, 2000);
  };

  w.larisLoadApp = function () {
    if (w.__larisAppLoaded || w.__larisAppLoading) return;
    w.__larisAppLoading = true;
    var s = document.createElement('script');
    s.src = '/js/laris-app.js?v=20260814a';
    s.defer = true;
    s.onload = function () { w.__larisAppLoaded = true; };
    document.body.appendChild(s);
  };
})(window);
