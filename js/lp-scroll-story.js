/* LarisID landing — pinned scroll story (Discover → Riset → Optimalkan → Jual) */
(function () {
  var ROOT = '#lp-flow';
  var mobileMq = window.matchMedia('(max-width: 760px)');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function qs(sel) { return document.querySelector(ROOT + ' ' + sel); }
  function qsa(sel) { return document.querySelectorAll(ROOT + ' ' + sel); }

  function init() {
    var section = document.getElementById('lp-flow');
    if (!section || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    if (mobileMq.matches || reduce) return;

    gsap.registerPlugin(ScrollTrigger);

    var WATCH_FRAME_COUNT = 24;
    var WATCH_FRAMES = [];
    for (var fi = 1; fi <= WATCH_FRAME_COUNT; fi++) {
      WATCH_FRAMES.push('/images/story/watch-frames-nobg/frame_' + String(fi).padStart(3, '0') + '.png');
    }
    var watchImg = qs('.hero-watch-img');
    var spinStart = 2.15;
    var spinEnd = 5.75;
    var WATCH_CARD_NUDGE_X = -50;

    function setWatchFrame(idx) {
      if (!watchImg) return;
      watchImg.src = WATCH_FRAMES[Math.max(0, Math.min(WATCH_FRAME_COUNT - 1, idx))];
    }
    WATCH_FRAMES.forEach(function (src) { var im = new Image(); im.src = src; });

    gsap.set(ROOT + ' .hero-watch', { left: '50%', top: '50%', xPercent: -50, yPercent: -50, autoAlpha: 0 });
    gsap.set(ROOT + ' .hero-watch-inner', { scale: 0.26, rotateY: 0, rotateX: 0, transformOrigin: '50% 50%' });
    gsap.set(ROOT + ' .choose-scroll', { y: -40 });
    gsap.set(ROOT + ' .scene--choose', { autoAlpha: 1 });
    gsap.set(ROOT + ' .choose-unit', { scale: 1, autoAlpha: 1 });
    gsap.set(ROOT + ' .feat-head, ' + ROOT + ' .feat-panel--tabs, ' + ROOT + ' .feat-panel--score, ' + ROOT + ' .feat-panel--metrics', { autoAlpha: 0 });
    gsap.set(ROOT + ' .feat-donut-ring', { strokeDasharray: 188.5, strokeDashoffset: 188.5 });
    gsap.set(ROOT + ' .line', function (i, el) { var len = el.getTotalLength(); return { strokeDasharray: len, strokeDashoffset: len }; });
    gsap.set(ROOT + ' .grow-up', { scaleY: 0, transformOrigin: '50% 100%' });
    gsap.set(ROOT + ' .area', { autoAlpha: 0 });
    gsap.set(ROOT + ' .choose-watch-cover', { autoAlpha: 0 });
    setWatchFrame(0);

    function placeWatchOnCard() {
      var unit = qs('.choose-unit');
      var stage = qs('.stage');
      if (!unit || !stage) return;
      var ur = unit.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();
      gsap.set(ROOT + ' .hero-watch', {
        left: ur.left - sr.left + ur.width * 0.38 + WATCH_CARD_NUDGE_X,
        top: ur.top - sr.top + ur.height * 0.38,
        xPercent: -50, yPercent: -50
      });
    }

    function monitorCoords() {
      var slot = qs('.monitor-slot');
      var stage = qs('.stage');
      if (!slot || !stage) return null;
      var mr = slot.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();
      return {
        left: mr.left - sr.left + mr.width * 0.46,
        top: mr.top - sr.top + mr.height * 0.52,
        scale: (mr.width / 300) * 1.05
      };
    }

    function boxCoords() {
      var slot = qs('.box-slot');
      var stage = qs('.stage');
      if (!slot || !stage) return null;
      var br = slot.getBoundingClientRect();
      var sr = stage.getBoundingClientRect();
      return {
        left: br.left - sr.left + br.width * 0.5,
        top: br.top - sr.top + br.height * 0.55,
        scale: (br.width / 300) * 0.85
      };
    }

    function updateWatchFrame(time) {
      if (time < spinStart) { setWatchFrame(0); return; }
      if (time > spinEnd) { setWatchFrame(WATCH_FRAME_COUNT - 1); return; }
      var p = (time - spinStart) / (spinEnd - spinStart);
      setWatchFrame(Math.min(WATCH_FRAME_COUNT - 1, Math.floor(p * WATCH_FRAME_COUNT)));
    }

    placeWatchOnCard();
    window.addEventListener('resize', function () { placeWatchOnCard(); ScrollTrigger.refresh(); });

    var dots = gsap.utils.toArray(ROOT + ' .story-progress .dot');
    function setStep(n) { dots.forEach(function (d, i) { d.classList.toggle('on', i === n); }); }
    setStep(0);

    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: ROOT,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 1,
        pin: ROOT + ' .story-pin',
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          var p = self.progress;
          setStep(p < 0.22 ? 0 : p < 0.44 ? 1 : p < 0.72 ? 2 : 3);
          updateWatchFrame(self.progress * tl.duration());
        }
      }
    });

    tl.fromTo(ROOT + ' .choose-scroll', { y: -40 }, { y: -225, duration: 1.7 }, 0);
    tl.fromTo(ROOT + ' .cap--choose', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.55 }, 0.15);
    tl.to(ROOT + ' .scroll-hint', { autoAlpha: 0, duration: 0.25 }, 0.2);

    tl.to(ROOT + ' .cap--choose', { autoAlpha: 0, duration: 0.3 }, 1.7);
    tl.add(function () { placeWatchOnCard(); }, 1.72);
    tl.set(ROOT + ' .hero-watch', { autoAlpha: 1 }, 1.72);
    tl.to(ROOT + ' .choose-watch-cover', { autoAlpha: 1, duration: 0.2 }, 1.72);
    tl.fromTo(ROOT + ' .hero-watch-inner', { scale: 0.11 }, { scale: 0.36, duration: 0.85, ease: 'power2.out' }, 1.73);
    tl.to(ROOT + ' .scene--choose', { autoAlpha: 0, duration: 0.4 }, 2.05);

    tl.to(ROOT + ' .scene--research', { autoAlpha: 1, duration: 0.55 }, 2.1);
    tl.to(ROOT + ' .hero-watch', {
      left: function () { var c = monitorCoords(); return c ? c.left : '50%'; },
      top: function () { var c = monitorCoords(); return c ? c.top : '50%'; },
      xPercent: -50, yPercent: -50, duration: 0.7, ease: 'power2.inOut'
    }, 2.15);
    tl.to(ROOT + ' .hero-watch-inner', {
      scale: function () { var c = monitorCoords(); return c ? c.scale : 0.18; },
      filter: 'drop-shadow(0 6px 14px rgba(26,26,26,.14))',
      duration: 0.7, ease: 'power2.inOut'
    }, 2.15);
    tl.fromTo(ROOT + ' .cap--research', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 2.35);
    tl.to(ROOT + ' .line--l', { strokeDashoffset: 0, duration: 1.2, ease: 'power1.inOut' }, 2.45);
    tl.to(ROOT + ' .line--r', { strokeDashoffset: 0, duration: 1.2, ease: 'power1.inOut' }, 2.55);
    tl.to(ROOT + ' .grow-up--l', { scaleY: 1, duration: 1.0, stagger: 0.04, ease: 'power2.out' }, 2.6);
    tl.to(ROOT + ' .grow-up--r', { scaleY: 1, duration: 1.0, stagger: 0.04, ease: 'power2.out' }, 2.7);
    tl.to(ROOT + ' .area--l', { autoAlpha: 1, duration: 0.6 }, 3.0);
    tl.to(ROOT + ' .area--r', { autoAlpha: 1, duration: 0.6 }, 3.1);
    tl.to(ROOT + ' .cap--research', { autoAlpha: 0, duration: 0.3 }, 3.75);
    tl.to(ROOT + ' .scene--research', { autoAlpha: 0, duration: 0.45 }, 3.8);

    tl.to(ROOT + ' .scene--features', { autoAlpha: 1, duration: 0.5 }, 3.85);
    tl.to(ROOT + ' .caption-scrim', { autoAlpha: 0, duration: 0.35 }, 3.85);
    tl.to(ROOT + ' .hero-watch', { left: '50%', top: '60%', xPercent: -50, yPercent: -50, duration: 0.55, ease: 'power2.inOut' }, 3.85);
    tl.to(ROOT + ' .hero-watch-inner', { scale: 0.68, filter: 'drop-shadow(0 24px 44px rgba(26,26,26,.22))', duration: 0.55, ease: 'power2.inOut' }, 3.85);
    tl.fromTo(ROOT + ' .feat-head', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45 }, 3.9);
    tl.fromTo(ROOT + ' .feat-panel--tabs, ' + ROOT + ' .feat-panel--score, ' + ROOT + ' .feat-panel--metrics', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.08, ease: 'power2.out' }, 3.95);
    tl.to(ROOT + ' .feat-donut-ring', { strokeDashoffset: 188.5 * (1 - 0.87), duration: 0.9, ease: 'power1.out' }, 4.05);
    tl.to(ROOT + ' .hero-watch-inner', { scale: 0.98, duration: 1.7, ease: 'power1.out' }, 4.1);
    tl.fromTo(ROOT + ' .c-band', { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.4, ease: 'back.out(1.6)' }, 4.25);
    tl.fromTo(ROOT + ' .c-cuaca', { autoAlpha: 0, x: 16 }, { autoAlpha: 1, x: 0, duration: 0.4, ease: 'back.out(1.6)' }, 4.55);
    tl.to([ROOT + ' .c-band', ROOT + ' .c-cuaca'], { autoAlpha: 0, duration: 0.3 }, 5.65);
    tl.to(ROOT + ' .scene--features', { autoAlpha: 0, duration: 0.4 }, 5.75);
    tl.to(ROOT + ' .caption-scrim', { autoAlpha: 1, duration: 0.3 }, 5.75);

    tl.to(ROOT + ' .hero-watch', {
      left: function () { var c = boxCoords(); return c ? c.left : '50%'; },
      top: function () { var c = boxCoords(); return c ? c.top : '50%'; },
      xPercent: -50, yPercent: -50, duration: 1.15, ease: 'power2.inOut'
    }, 5.75);
    tl.to(ROOT + ' .hero-watch-inner', {
      scale: function () { var c = boxCoords(); return c ? c.scale : 0.08; },
      filter: 'drop-shadow(0 2px 4px rgba(26,26,26,.1))',
      duration: 1.15, ease: 'power2.inOut'
    }, 5.75);
    tl.to(ROOT + ' .scene--sell', { autoAlpha: 1, duration: 0.75 }, 5.95);
    tl.to(ROOT + ' .hero-watch', { autoAlpha: 0, duration: 0.45 }, 6.65);
    tl.fromTo(ROOT + ' .cap--sell', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 6.15);

    ScrollTrigger.addEventListener('refreshInit', function () { placeWatchOnCard(); });
    ScrollTrigger.refresh();
  }

  function loadGsap(cb) {
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') { cb(); return; }
    var s1 = document.createElement('script');
    s1.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
    s1.onload = function () {
      var s2 = document.createElement('script');
      s2.src = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js';
      s2.onload = cb;
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }

  function boot() {
    if (!document.getElementById('lp-flow')) return;
    loadGsap(init);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
