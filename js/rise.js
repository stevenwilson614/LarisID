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

  /* ---- 3. the 20 dots ----------------------------------------------------- */
  var HIT = [6, 12];   /* the two highlighted of twenty */

  function initDots() {
    var wrap = $('#rz-dots');
    if (!wrap) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 20; i++) {
      var d = document.createElement('span');
      d.className = 'rz-dot';
      d.style.setProperty('--d', (i * 0.045).toFixed(3) + 's');
      frag.appendChild(d);
    }
    wrap.appendChild(frag);
    var dots = $$('.rz-dot', wrap);

    function land() {
      dots.forEach(function (d) { d.classList.add('is-in'); });
      HIT.forEach(function (n, k) {
        if (REDUCED) { dots[n].classList.add('is-hit'); return; }
        setTimeout(function () { dots[n].classList.add('is-hit'); }, 1150 + k * 260);
      });
    }
    if (REDUCED || !HAS_IO) { land(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      land();
      io.disconnect();
    }, { threshold: 0.35 });
    io.observe(wrap);
  }

  /* ---- 4. LARIS -> RISE --------------------------------------------------- */
  /* LARIS already contains R-I-S. L and A fall away, R I S hold their place,
     E arrives — then the four stack into the acronym beside their meanings. */
  var GAPU = 12;          /* letter gap, in source-artwork units */
  var WORD = 'larise';
  var ACR = 'rise';

  function initRise() {
    var sect = $('#rise');
    var stage = $('#rz-stage');
    var layer = $('#rz-letters');
    var cap = $('#rz-cap');
    var phx = $('#rz-phx');
    if (!sect || !stage || !layer) return null;

    var letters = {};
    $$('.rz-ltr', layer).forEach(function (el) {
      letters[el.getAttribute('data-ltr')] = {
        el: el,
        sw: parseFloat(el.style.getPropertyValue('--sw')),
        sh: parseFloat(el.style.getPropertyValue('--sh'))
      };
    });
    var means = $$('.rz-mean', sect);

    if (REDUCED) {
      sect.classList.add('rz-static');
      means.forEach(function (m) { m.classList.add('is-on'); });
      return null;
    }

    var L = null;   /* measured layout */

    function measure() {
      var lb = layer.getBoundingClientRect();
      if (!lb.width || !lb.height) return;

      /* One scale for both word phases so R, I and S never resize mid-flight. */
      var unitsLaris = 0, i;
      for (i = 0; i < 5; i++) unitsLaris += letters[WORD[i]].sw;
      unitsLaris += GAPU * 4;
      var maxSH = 0;
      for (var k in letters) maxSH = Math.max(maxSH, letters[k].sh);
      var kWord = Math.min(lb.width * 0.86 / unitsLaris, lb.height * 0.34 / maxSH);

      var slot = $('.rz-slot', sect).getBoundingClientRect();
      var kCol = Math.min(slot.width / 116, slot.height / maxSH);

      /* Bottom-align every glyph: they share a baseline in the source alphabet. */
      var baseY = (lb.height + maxSH * kWord) / 2;

      function row(keys) {
        var w = 0, n;
        for (n = 0; n < keys.length; n++) w += letters[keys[n]].sw * kWord;
        w += GAPU * kWord * (keys.length - 1);
        var x = (lb.width - w) / 2, out = {};
        for (n = 0; n < keys.length; n++) {
          out[keys[n]] = x;
          x += letters[keys[n]].sw * kWord + GAPU * kWord;
        }
        return out;
      }

      var col = {};
      $$('.rz-slot', sect).forEach(function (s, n) {
        var key = ACR[n];
        var r = s.getBoundingClientRect();
        col[key] = {
          x: r.left - lb.left + (r.width - letters[key].sw * kCol) / 2,
          y: r.top - lb.top + (r.height - letters[key].sh * kCol) / 2
        };
      });

      L = {
        w: lb.width, h: lb.height, kWord: kWord, baseY: baseY,
        laris: row('laris'.split('')), rise: row(ACR.split('')), col: col,
        s: kCol / kWord
      };

      for (var key in letters) {
        var o = letters[key];
        o.el.style.width = (o.sw * kWord) + 'px';
        o.el.style.height = (o.sh * kWord) + 'px';
      }

      /* Park the caption just under the letter band. The band's baseline is
         known exactly here, so it can't drift onto the letters at any size. */
      if (cap) {
        cap.style.top = Math.round(
          lb.top - stage.getBoundingClientRect().top + baseY + Math.max(26, lb.height * 0.06)
        ) + 'px';
      }
    }

    function apply(p) {
      if (!L) return;
      var d = easeInOut(seg(p, 0.54, 0.76));           /* word -> column */
      var gold = p > 0.46;

      'laris'.split('').forEach(function (key, i) {
        var o = letters[key];
        var enter = easeOut(seg(p, i * 0.018, 0.15 + i * 0.018));
        var restY = L.baseY - o.sh * L.kWord;
        var x, y, s = 1, op = enter;

        if (key === 'l' || key === 'a') {
          var out = easeInOut(seg(p, 0.20, 0.34));
          x = L.laris[key];
          y = restY + (1 - enter) * 30 - out * L.h * 0.34;
          op = enter * (1 - out);
        } else {
          var m = easeInOut(seg(p, 0.20, 0.42));
          x = lerp(L.laris[key], L.rise[key], m);
          y = restY + (1 - enter) * 30;
          x = lerp(x, L.col[key].x, d);
          y = lerp(y, L.col[key].y, d);
          s = lerp(1, L.s, d);
        }
        o.el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
        o.el.style.opacity = op.toFixed(3);
        o.el.classList.toggle('is-gold', gold && key !== 'l' && key !== 'a');
      });

      /* E is not in LARIS — it flies in from the right once R I S have settled. */
      var e = letters.e;
      var ein = easeOut(seg(p, 0.38, 0.54));
      var ex = lerp(L.w + e.sw * L.kWord, L.rise.e, ein);
      var ey = L.baseY - e.sh * L.kWord;
      ex = lerp(ex, L.col.e.x, d);
      ey = lerp(ey, L.col.e.y, d);
      e.el.style.transform = 'translate3d(' + ex.toFixed(2) + 'px,' + ey.toFixed(2) + 'px,0) scale(' + lerp(1, L.s, d).toFixed(4) + ')';
      e.el.style.opacity = ein.toFixed(3);
      e.el.classList.toggle('is-gold', gold);

      if (cap) cap.style.opacity = Math.min(seg(p, 0.28, 0.37), 1 - seg(p, 0.54, 0.63)).toFixed(3);
      if (phx) phx.style.opacity = (easeOut(seg(p, 0.02, 0.14)) * (1 - seg(p, 0.50, 0.62))).toFixed(3);

      means.forEach(function (m, i) {
        m.classList.toggle('is-on', p > 0.74 + i * 0.05);
      });
    }

    /* will-change only while the sequence can actually be seen. */
    if (HAS_IO) {
      var vio = new IntersectionObserver(function (entries) {
        var on = entries[0].isIntersecting;
        $$('.rz-ltr', layer).forEach(function (el) {
          el.style.willChange = on ? 'transform,opacity' : '';
        });
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

  /* ---- 5. generic scroll progress ---------------------------------------- */
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

  /* ---- 6. nav + sticky CTA ------------------------------------------------ */
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
    initDots();
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
