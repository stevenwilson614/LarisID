/* LARIS RISE — scroll storytelling for /rise/.
   No animation library: the repo dropped GSAP for the landing scroll story and
   this follows that precedent. Four primitives only — a reveal observer, a
   rAF-throttled progress driver, count-ups, and the sticky CTA. */
(function () {
  'use strict';

  var REDUCED = !!(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var HAS_IO = 'IntersectionObserver' in window;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---- 1. reveal ---------------------------------------------------------- */
  function initReveal() {
    var els = $$('[data-reveal]');
    if (REDUCED || !HAS_IO) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---- 2. count-up -------------------------------------------------------- */
  function countTo(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    if (REDUCED) { el.textContent = target.toLocaleString('id-ID'); return; }
    var t0 = null, dur = 1100;
    function step(now) {
      if (t0 === null) t0 = now;
      var t = clamp((now - t0) / dur, 0, 1);
      el.textContent = Math.round(target * easeOut(t)).toLocaleString('id-ID');
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCounts() {
    var els = $$('[data-count]');
    if (!els.length) return;
    if (REDUCED || !HAS_IO) {
      els.forEach(function (el) {
        el.textContent = parseFloat(el.getAttribute('data-count')).toLocaleString('id-ID');
      });
      return;
    }
    els.forEach(function (el) { el.textContent = '0'; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        countTo(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---- 3. LARIS + RISE -> LARISE -> the acronym --------------------------- */
  /* LARIS and RISE share R-I-S. The two words start apart and slide together
     until those letters coincide, which spells LARISE without adding anything.
     The LARIS copies of R, I and S fade as they arrive, then L and A drop away
     and the remaining RISE transposes into the vertical acronym. */
  /* Artwork-space extents, from geometry.json. The composition is centred on the
     letter block, but the arrow reaches further right and lower than the letters
     do — so the fit is measured as the largest extent from that centre, not the
     bounding-box width, or the arrowhead clips off screen. */
  /* Emitted by scripts/build-rise-letters.py as geometry.json "_composition";
     copy the printed values here if the artwork or spacing ever changes. */
  var UNIT = {
    cx: 511, cy: 90.5,         /* centre of the merged brush-LA + RISE composition */
    halfW: 439,                /* cx -> arrowhead (the far edge) */
    halfH: 132.5,              /* cy -> bottom of the arrow sweep */
    tallest: 146,              /* tallest emblem glyph, for the acronym column */
    widest: 190                /* widest emblem glyph */
  };
  var SEP = 250;               /* apart-state offset; script reports minSep 226 */
  var ACR = 'rise';

  function initRise() {
    var sect = $('#rise');
    var stage = $('#rz-stage');
    var layer = $('#rz-letters');
    var cap = $('#rz-cap');
    var phx = $('#rz-phx');
    if (!sect || !stage || !layer) return null;

    var glyphs = $$('.rz-ltr', layer).map(function (el) {
      var cs = el.style;
      return {
        el: el,
        key: el.getAttribute('data-ltr'),
        grp: el.getAttribute('data-grp') || 'mark',
        keep: el.hasAttribute('data-keep'),
        x: parseFloat(cs.getPropertyValue('--gx')),
        y: parseFloat(cs.getPropertyValue('--gy')),
        w: parseFloat(cs.getPropertyValue('--gw')),
        h: parseFloat(cs.getPropertyValue('--gh'))
      };
    });
    var means = $$('.rz-mean', sect);

    if (REDUCED) {
      sect.classList.add('rz-static');
      means.forEach(function (m) { m.classList.add('is-on'); });
      return null;
    }

    var L = null;

    function measure() {
      var lb = layer.getBoundingClientRect();
      if (!lb.width || !lb.height) return;

      /* Merged scale fits the wordmark plus its arrow; the separated state is
         wider, so it starts smaller and the merge reads as a zoom in. */
      var k1 = Math.min(lb.width * 0.90 / (UNIT.halfW * 2),
                        lb.height * 0.46 / (UNIT.halfH * 2));
      var k0 = lb.width * 0.90 / (UNIT.halfW * 2 + SEP * 2);
      if (k0 > k1) k0 = k1;

      var slot = $('.rz-slot', sect).getBoundingClientRect();
      var kc = Math.min(slot.width / UNIT.widest, slot.height / UNIT.tallest);

      var col = {};
      $$('.rz-slot', sect).forEach(function (sl, n) {
        var key = ACR[n], r = sl.getBoundingClientRect(), g;
        for (var i = 0; i < glyphs.length; i++) {
          if (glyphs[i].key === key && glyphs[i].grp === 'rise') { g = glyphs[i]; break; }
        }
        col[key] = {
          x: r.left - lb.left + (r.width - g.w * kc) / 2,
          y: r.top - lb.top + (r.height - g.h * kc) / 2
        };
      });

      L = { w: lb.width, h: lb.height, k0: k0, k1: k1, col: col, cs: kc / k1,
            cx: lb.width / 2, cy: lb.height / 2 };

      glyphs.forEach(function (g) {
        g.el.style.width = (g.w * k1) + 'px';
        g.el.style.height = (g.h * k1) + 'px';
      });
      if (cap) {
        cap.style.top = Math.round(lb.top - stage.getBoundingClientRect().top +
          L.cy + UNIT.halfH * k1 + Math.max(26, lb.height * 0.06)) + 'px';
      }
    }

    function apply(p) {
      if (!L) return;
      var enter = easeOut(seg(p, 0, 0.12));
      var m = easeInOut(seg(p, 0.14, 0.44));          /* words converge */
      var k = lerp(L.k0, L.k1, m);
      var base = k / L.k1;
      /* Dissolve LARIS's R I S across the approach, not after it, so the words
         read as merging rather than colliding while they overlap. */
      var dupe = 1 - easeInOut(seg(p, 0.18, 0.42));
      var laOut = 1 - easeInOut(seg(p, 0.58, 0.70));  /* L and A drop away */
      var arrow = Math.min(easeOut(seg(p, 0.42, 0.58)), 1 - seg(p, 0.58, 0.68));
      var d = easeInOut(seg(p, 0.58, 0.80));          /* RISE -> column */

      glyphs.forEach(function (g) {
        var off = g.grp === 'laris' ? -SEP * (1 - m)
                : g.grp === 'rise' ? SEP * (1 - m) : 0;
        var x = L.cx + (g.x + off - UNIT.cx) * k;
        var y = L.cy + (g.y - UNIT.cy) * k;
        var sc = base, op = enter;

        if (g.key === 'arrow') {
          op = arrow;
        } else if (g.grp === 'laris') {
          op = enter * (g.keep ? laOut : dupe);
        } else {
          var c = L.col[g.key];
          x = lerp(x, c.x, d);
          y = lerp(y, c.y, d);
          sc = lerp(base, L.cs, d);
        }
        g.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) +
          'px,0) scale(' + sc.toFixed(4) + ')';
        g.el.style.opacity = op.toFixed(3);
      });

      if (cap) cap.style.opacity = Math.min(seg(p, 0.40, 0.48), 1 - seg(p, 0.56, 0.64)).toFixed(3);
      if (phx) phx.style.opacity = (easeOut(seg(p, 0.02, 0.14)) * (1 - seg(p, 0.52, 0.64))).toFixed(3);

      means.forEach(function (mm, i) { mm.classList.toggle('is-on', p > 0.80 + i * 0.045); });
    }

    if (HAS_IO) {
      var vio = new IntersectionObserver(function (entries) {
        var on = entries[0].isIntersecting;
        glyphs.forEach(function (g) { g.el.style.willChange = on ? 'transform,opacity' : ''; });
      }, { rootMargin: '20% 0px' });
      vio.observe(sect);
    }

    function progress() {
      var r = sect.getBoundingClientRect();
      var span = r.height - stage.offsetHeight;
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }

    measure();
    apply(0);
    return { measure: measure, update: function () { apply(progress()); } };
  }

  /* ---- 4. generic scroll progress ---------------------------------------- */
  function initProgress() {
    var els = $$('[data-progress]').filter(function (el) { return el.id !== 'rise'; });
    if (!els.length) return [];
    if (REDUCED) {
      els.forEach(function (el) { el.style.setProperty('--p', '1'); });
      return [];
    }
    return els.map(function (el) {
      return {
        measure: function () {},
        update: function () {
          var r = el.getBoundingClientRect();
          var vh = window.innerHeight || document.documentElement.clientHeight;
          var p = clamp((vh * 0.8 - r.top) / r.height, 0, 1);
          el.style.setProperty('--p', p.toFixed(4));
        }
      };
    });
  }

  /* The movement count steps on entry rather than on scroll: the section is
     shorter than a phone viewport, so there is no scroll range to spend. */
  function initScale() {
    var wrap = $('#rz-scale');
    if (!wrap) return;
    var steps = $$('.rz-scale-n', wrap);
    if (!steps.length) return;

    function show(i) {
      steps.forEach(function (n, k) { n.classList.toggle('is-on', k === i); });
    }
    if (REDUCED || !HAS_IO) { show(steps.length - 1); return; }

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      steps.forEach(function (_, i) {
        if (i) setTimeout(function () { show(i); }, i * 620);
      });
    }, { threshold: 0.4 });
    io.observe(wrap);
  }

  /* ---- 5. nav + sticky CTA ------------------------------------------------ */
  function initNav() {
    var nav = $('#rz-nav'), btn = $('#rz-navbtn'), sheet = $('#rz-sheet');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('is-stuck', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    if (!btn || !sheet) return;

    function close(focusBtn) {
      sheet.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Buka menu');
      if (focusBtn) btn.focus();
    }
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      if (open) { close(false); return; }
      sheet.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Tutup menu');
      var first = $('a', sheet);
      if (first) first.focus();
    });
    $$('a', sheet).forEach(function (a) {
      a.addEventListener('click', function () { close(false); });
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !sheet.hidden) close(true);
    });
  }

  function initSticky() {
    var bar = $('#rz-sticky'), hero = $('.rz-hero'), end = $('#daftar');
    if (!bar || !hero || !end || !HAS_IO) return;
    var heroIn = true, endIn = false;

    function sync() {
      var on = !heroIn && !endIn;
      bar.classList.toggle('is-on', on);
      bar.setAttribute('aria-hidden', on ? 'false' : 'true');
      bar.setAttribute('tabindex', on ? '0' : '-1');
    }
    new IntersectionObserver(function (e) {
      heroIn = e[0].isIntersecting; sync();
    }, { threshold: 0 }).observe(hero);
    new IntersectionObserver(function (e) {
      endIn = e[0].isIntersecting; sync();
    }, { threshold: 0 }).observe(end);
    sync();
  }

  /* ---- boot --------------------------------------------------------------- */
  function init() {
    initNav();
    initReveal();
    initCounts();
    initScale();
    initSticky();

    var scenes = initProgress();
    var rise = initRise();
    if (rise) scenes.push(rise);
    if (!scenes.length || REDUCED) return;

    var ticking = false;
    function frame() {
      ticking = false;
      for (var i = 0; i < scenes.length; i++) scenes[i].update();
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(frame);
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        for (var i = 0; i < scenes.length; i++) scenes[i].measure();
        frame();
      }, 140);
    }, { passive: true });

    /* Masks decode after first paint; re-measure once everything has settled. */
    window.addEventListener('load', function () {
      for (var i = 0; i < scenes.length; i++) scenes[i].measure();
      frame();
    });
    frame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
