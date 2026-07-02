/* LarisID landing — watch frame loop + scroll-triggered stat reveals */
(function () {
  var WATCH_FRAME_COUNT = 24;
  var WATCH_FRAMES = [];
  for (var fi = 1; fi <= WATCH_FRAME_COUNT; fi++) {
    WATCH_FRAMES.push('/images/story/watch-frames-nobg/frame_' + String(fi).padStart(3, '0') + '.webp');
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function initWatchLoop() {
    var img = document.getElementById('lp-watch-img');
    if (!img || prefersReducedMotion()) return;

    var frameIdx = 0;
    var lastTs = 0;
    var frameDur = 2000 / WATCH_FRAME_COUNT;
    var loaded = {};

    function preload(idx) {
      if (loaded[idx]) return;
      loaded[idx] = true;
      var im = new Image();
      im.src = WATCH_FRAMES[idx];
    }

    preload(0);
    preload(1);

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      var elapsed = ts - lastTs;
      if (elapsed >= frameDur) {
        frameIdx = (frameIdx + 1) % WATCH_FRAME_COUNT;
        img.src = WATCH_FRAMES[frameIdx];
        preload((frameIdx + 1) % WATCH_FRAME_COUNT);
        lastTs = ts;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initStatReveals() {
    var stats = document.querySelectorAll('#lp-watch [data-lp-stat]');
    if (!stats.length) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      stats.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = Array.prototype.indexOf.call(stats, el) * 120;
        setTimeout(function () { el.classList.add('is-visible'); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

    stats.forEach(function (el) { io.observe(el); });
  }

  function init() {
    initWatchLoop();
    initStatReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
