/* LarisID landing — scroll-driven watch frames + stat reveals */
(function () {
  var WATCH_FRAME_COUNT = 24;
  var WATCH_FRAMES = [];
  for (var fi = 1; fi <= WATCH_FRAME_COUNT; fi++) {
    WATCH_FRAMES.push('/images/story/watch-frames-nobg/frame_' + String(fi).padStart(3, '0') + '.webp');
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function initWatchScroll() {
    var section = document.getElementById('lp-watch');
    var img = document.getElementById('lp-watch-img');
    if (!section || !img) return;

    var loaded = {};
    function preload(idx) {
      var i = Math.max(0, Math.min(WATCH_FRAME_COUNT - 1, idx));
      if (loaded[i]) return;
      loaded[i] = true;
      var im = new Image();
      im.src = WATCH_FRAMES[i];
    }
    function setFrame(idx) {
      var i = Math.max(0, Math.min(WATCH_FRAME_COUNT - 1, idx));
      if (img.src.indexOf(WATCH_FRAMES[i]) === -1) img.src = WATCH_FRAMES[i];
      preload(i + 1);
      preload(i - 1);
    }

    setFrame(0);
    preload(1);

    if (prefersReducedMotion()) return;

    function updateFromScroll() {
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var start = vh * 0.9;
      var end = vh * 0.15;
      var progress = (start - rect.top) / (start - end);
      progress = Math.max(0, Math.min(1, progress));
      var frameIdx = Math.round(progress * (WATCH_FRAME_COUNT - 1));
      setFrame(frameIdx);
    }

    window.addEventListener('scroll', updateFromScroll, { passive: true });
    window.addEventListener('resize', updateFromScroll, { passive: true });
    updateFromScroll();
  }

  function initStatReveals() {
    var stage = document.querySelector('#lp-watch .lp-watch-stage');
    var stats = document.querySelectorAll('#lp-watch [data-lp-stat]');
    if (!stats.length) return;

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      stats.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        stats.forEach(function (el, i) {
          setTimeout(function () { el.classList.add('is-visible'); }, i * 140);
        });
        io.disconnect();
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -5% 0px' });

    io.observe(stage || stats[0]);
  }

  function init() {
    initWatchScroll();
    initStatReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
