/*
 * laris-mascot.js -- makes the Garuda feel alive without a 3D model.
 *
 * The mascot only exists as flat renders. scripts/build-mascot-rig.py slices
 * each one into a few feathered overlay patches; this file nudges them.
 * Everything is transform-only so it stays on the compositor, and every
 * offset is expressed as a percentage of the layer's own box, which makes the
 * whole rig resolution-independent -- no need to know the display scale.
 *
 * Deliberately understated. If a visitor notices an animation, it is wrong.
 *
 * Public API (mirrors the states the brand brief asked for):
 *   LarisMascot.init()            scan the document for [data-mascot]
 *   LarisMascot.idle()            return every rig to rest
 *   LarisMascot.typing(el)        glance toward an input
 *   LarisMascot.thinking()        working on it
 *   LarisMascot.success()         a small nod, then back to idle
 *   LarisMascot.refresh()         re-measure after a layout change
 *   LarisMascot.destroyAll()
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var RIGS = window.LARIS_MASCOT_RIGS || {};

  // House rule: CSS kills the animation, JS jumps to the end state. Here the
  // end state is simply the original <img>, so we build nothing at all.
  var REDUCED = typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Idle motion, in source-image pixels. Small on purpose.
  var BREATH_PERIOD = 5.5;   // seconds
  var BREATH_LAG = 0.45;     // head trails the chest; this is what reads alive
  var SWAY_PERIOD = 17.3;    // weight shift. Incommensurate with the breath
  var WING_PERIOD = 7.1;     // period so the combined loop never repeats.
  var ENGAGE_PX = 420;       // how near the cursor must be to be noticed

  var rigs = [];
  var raf = 0;
  var pointer = { x: 0, y: 0, seen: false };
  var listening = false;

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function imp(el, prop, val) { el.style.setProperty(prop, val, 'important'); }

  /* ------------------------------------------------------------------ */
  /* shared loop                                                         */
  /* ------------------------------------------------------------------ */

  function tickAll(ts) {
    raf = 0;
    var live = 0;
    for (var i = 0; i < rigs.length; i++) {
      if (rigs[i].visible && !rigs[i].hidden) { rigs[i].tick(ts); live++; }
    }
    if (live) raf = requestAnimationFrame(tickAll);
  }

  function wake() {
    if (!raf) raf = requestAnimationFrame(tickAll);
  }

  function onPointerMove(e) {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true;
  }

  function onVisibility() {
    var h = document.hidden;
    for (var i = 0; i < rigs.length; i++) rigs[i].hidden = h;
    if (!h) wake();
  }

  function listen() {
    if (listening) return;
    listening = true;
    // Passive, and it only stores coordinates -- all the maths happens in the
    // rAF tick so pointer spam cannot cause layout work.
    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', LarisMascot.refresh, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* rig                                                                 */
  /* ------------------------------------------------------------------ */

  function Rig(host, poseName) {
    this.host = host;
    this.pose = poseName;
    this.man = RIGS[poseName];
    this.img = host.querySelector('img');
    this.built = false;
    this.visible = false;
    this.hidden = document.hidden;
    this.state = 'idle';
    this.lookEl = null;
    this.t0 = now();

    this.look = { x: 0, y: 0 };
    this.settle = { x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0, next: 0 };
    this.blinkAt = now() + rand(1200, 3600);
    this.blinkT = -1;
    this.nodT = -1;

    this.layers = {};
    this.eyes = [];
    this.rect = null;
    this.rectAt = 0;
  }

  Rig.prototype.build = function () {
    if (this.built || !this.man || !this.img) return;
    this.built = true;

    var man = this.man, L = man.layers, self = this;
    var box = document.createElement('div');
    box.className = 'mrig';
    box.setAttribute('aria-hidden', 'true');

    var headGroup = document.createElement('div');
    headGroup.className = 'mrig-head';
    headGroup.style.transformOrigin = man.pivot[0] + '% ' + man.pivot[1] + '%';

    var pending = 0, done = false;
    function settled() {
      if (done) return;
      done = true;
      box.classList.add('is-ready');
    }

    function add(name, parent, cls) {
      var d = L[name];
      if (!d) return null;
      var el = document.createElement('img');
      el.className = 'mrig-l' + (cls ? ' ' + cls : '');
      el.alt = '';
      el.decoding = 'async';
      // !important so a host's own `... img { width: … }` cannot reposition a
      // layer. Percentages are of the rig box, which makes the whole rig
      // resolution-independent.
      imp(el, 'left', (d.x / man.w * 100) + '%');
      imp(el, 'top', (d.y / man.h * 100) + '%');
      imp(el, 'width', (d.w / man.w * 100) + '%');
      if (d.origin) el.style.transformOrigin = d.origin[0] + '% ' + d.origin[1] + '%';
      pending++;
      el.addEventListener('load', function () { if (!--pending) settled(); });
      el.addEventListener('error', function () { if (!--pending) settled(); });
      el.src = d.src;
      parent.appendChild(el);
      self.layers[name] = { el: el, d: d };
      return el;
    }

    add('wing', box);
    add('torso', box);
    add('head', headGroup);

    this.eyes = [];
    var eyes = man.eyes || [];
    for (var i = 0; i < eyes.length; i++) {
      var e = eyes[i];
      if (e.sclera) add(e.sclera, headGroup);
      var iris = e.iris ? add(e.iris, headGroup) : null;
      var lid = e.lid ? add(e.lid, headGroup, 'mrig-lid') : null;
      this.eyes.push({ iris: iris, lid: lid, travel: e.travel || [0, 0],
                       irisBox: e.iris ? L[e.iris] : null });
    }

    box.appendChild(headGroup);
    this.box = box;
    this.headGroup = headGroup;
    (this.img.parentNode || this.host).appendChild(box);
    this.place();
    if (!pending) settled();
  };

  /*
   * Line the overlay up with the image's *content* box.
   *
   * The <img> is object-fit:contain, so when a max-height binds the painted
   * pixels are letterboxed inside a taller element box. Measuring instead of
   * assuming keeps the rig glued to the artwork through every breakpoint.
   */
  Rig.prototype.place = function () {
    if (!this.built || !this.box) return;
    var img = this.img, man = this.man;
    var cw = img.clientWidth, ch = img.clientHeight;
    if (!cw || !ch) return;

    var ar = man.w / man.h;
    var w = Math.min(cw, ch * ar);
    var h = w / ar;

    var pos = (window.getComputedStyle(img).objectPosition || '50% 50%').split(/\s+/);
    var px = parseFloat(pos[0]);
    var py = parseFloat(pos.length > 1 ? pos[1] : pos[0]);
    if (isNaN(px)) px = 50;
    if (isNaN(py)) py = 50;

    var parent = this.img.parentNode;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    var pr = parent.getBoundingClientRect(), ir = img.getBoundingClientRect();

    imp(this.box, 'left', (ir.left - pr.left + (cw - w) * px / 100) + 'px');
    imp(this.box, 'top', (ir.top - pr.top + (ch - h) * py / 100) + 'px');
    imp(this.box, 'width', w + 'px');
    imp(this.box, 'height', h + 'px');
    this.rect = null;
  };

  /* Where the eyes should be pointing, as -1..1 either side of centre. */
  Rig.prototype.lookTarget = function (t, ts) {
    if (this.state === 'thinking') {
      // Eyes wander up and off to one side, the way people look at nothing
      // while they think.
      return { x: -0.45 + Math.sin(t * 0.9) * 0.14,
               y: -0.55 + Math.sin(t * 0.63) * 0.10 };
    }

    // Cached: a layout read every frame would be the one expensive thing in
    // an otherwise transform-only rig, and a slightly stale rect cannot
    // matter when the whole mascot moves by three pixels.
    if (!this.rect || ts - this.rectAt > 200) {
      this.rect = this.box.getBoundingClientRect();
      this.rectAt = ts;
    }
    var r = this.rect;
    var cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.42;
    var tx, ty;

    if (this.state === 'typing' && this.lookEl && this.lookEl.isConnected) {
      var er = this.lookEl.getBoundingClientRect();
      if (!er.width && !er.height) return { x: 0, y: 0 };
      tx = er.left + er.width * 0.5;
      ty = er.top + er.height * 0.5;
    } else if (pointer.seen) {
      tx = pointer.x; ty = pointer.y;
      var dx = tx - cx, dy = ty - cy;
      // Only react once the cursor comes near; otherwise it reads as a
      // gimmick that follows you around the whole page.
      if (Math.sqrt(dx * dx + dy * dy) > ENGAGE_PX + r.width * 0.5) {
        return { x: 0, y: 0 };
      }
    } else {
      return { x: 0, y: 0 };
    }

    return {
      x: clamp((tx - cx) / (r.width * 0.9), -1, 1),
      y: clamp((ty - cy) / (r.height * 0.9), -1, 1)
    };
  };

  Rig.prototype.tick = function (ts) {
    if (!this.built) { this.build(); if (!this.built) return; }
    var man = this.man;
    var t = (ts - this.t0) / 1000;

    var period = this.state === 'thinking' ? BREATH_PERIOD * 1.18 : BREATH_PERIOD;
    var br = Math.sin(t * TAU / period);
    var brLag = Math.sin((t - BREATH_LAG) * TAU / period);
    var sway = Math.sin(t * TAU / SWAY_PERIOD);

    /* occasional head settle ---------------------------------------- */
    var s = this.settle;
    if (ts >= s.next) {
      s.tx = rand(-1.1, 1.1);
      s.ty = rand(-0.9, 0.9);
      s.tr = rand(-0.22, 0.22);
      s.next = ts + rand(7000, 14000);
    }
    s.x += (s.tx - s.x) * 0.018;
    s.y += (s.ty - s.y) * 0.018;
    s.r += (s.tr - s.r) * 0.018;

    /* look ----------------------------------------------------------- */
    var want = this.lookTarget(t, ts);
    this.look.x += (want.x - this.look.x) * 0.075;
    this.look.y += (want.y - this.look.y) * 0.075;

    /* blink ---------------------------------------------------------- */
    var lid = 0;
    if (this.blinkT < 0 && ts >= this.blinkAt) this.blinkT = 0;
    if (this.blinkT >= 0) {
      this.blinkT = ts - (this.blinkAt);
      var b = this.blinkT;
      if (b < 110) lid = b / 110;
      else if (b < 165) lid = 1;
      else if (b < 315) lid = 1 - (b - 165) / 150;
      else {
        lid = 0; this.blinkT = -1;
        this.blinkAt = ts + rand(4800, 8200);
      }
      lid = clamp(lid, 0, 1);
    }

    /* success nod ---------------------------------------------------- */
    var nodY = 0, nodR = 0;
    if (this.nodT >= 0) {
      var u = (ts - this.nodT) / 480;
      if (u >= 1) { this.nodT = -1; }
      else {
        var e = Math.sin(u * Math.PI);
        nodY = e * 3.4;
        nodR = e * 0.5;
      }
    }

    /* compose -------------------------------------------------------- */
    var tilt = this.state === 'thinking' ? 2.2 : 0;

    var headX = sway * 1.3 + s.x + this.look.x * 2.2;
    var headY = -brLag * 1.9 + s.y + nodY;
    var headR = sway * 0.18 + s.r + this.look.x * 0.7 + tilt + nodR;

    setT(this.headGroup,
      'translate(' + (headX / man.w * 100).toFixed(3) + '%,' +
      (headY / man.h * 100).toFixed(3) + '%) rotate(' + headR.toFixed(3) + 'deg)');

    var torso = this.layers.torso;
    if (torso) {
      setT(torso.el, 'translateY(' + (-br * 1.1 / torso.d.h * 100).toFixed(3) +
        '%) scaleY(' + (1 + br * 0.0035).toFixed(5) + ')');
    }

    var wing = this.layers.wing;
    if (wing) {
      setT(wing.el, 'rotate(' +
        (Math.sin(t * TAU / WING_PERIOD + 1.1) * 0.42).toFixed(3) + 'deg)');
    }

    for (var i = 0; i < this.eyes.length; i++) {
      var eye = this.eyes[i];
      if (eye.iris && eye.irisBox) {
        setT(eye.iris,
          'translate(' + (this.look.x * eye.travel[0] / eye.irisBox.w * 100).toFixed(3) +
          '%,' + (this.look.y * eye.travel[1] / eye.irisBox.h * 100).toFixed(3) + '%)');
      }
      if (eye.lid) setT(eye.lid, 'scaleY(' + lid.toFixed(4) + ')');
    }
  };

  function setT(el, v) {
    if (!el) return;
    if (el._mt !== v) { el._mt = v; el.style.transform = v; }
  }

  Rig.prototype.observe = function () {
    var self = this;
    if (!('IntersectionObserver' in window)) {
      this.visible = true; this.build(); wake(); return;
    }
    this.io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        self.visible = entries[i].isIntersecting;
        if (self.visible) { self.build(); self.place(); wake(); }
      }
    }, { threshold: 0.01 });
    this.io.observe(this.host);

    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(function () { self.place(); });
      this.ro.observe(this.img);
    }
  };

  Rig.prototype.destroy = function () {
    if (this.io) this.io.disconnect();
    if (this.ro) this.ro.disconnect();
    if (this.box && this.box.parentNode) this.box.parentNode.removeChild(this.box);
    this.built = false; this.visible = false;
    var k = rigs.indexOf(this);
    if (k >= 0) rigs.splice(k, 1);
  };

  /* ------------------------------------------------------------------ */
  /* public                                                              */
  /* ------------------------------------------------------------------ */

  function each(fn) { for (var i = 0; i < rigs.length; i++) fn(rigs[i]); }

  var LarisMascot = {
    reduced: REDUCED,

    init: function (root) {
      if (REDUCED) return;
      var nodes = (root || document).querySelectorAll('[data-mascot]');
      for (var i = 0; i < nodes.length; i++) {
        var host = nodes[i];
        if (host._mrig) continue;
        var pose = host.getAttribute('data-mascot');
        if (!RIGS[pose] || !host.querySelector('img')) continue;
        var rig = new Rig(host, pose);
        host._mrig = rig;
        rigs.push(rig);
        rig.observe();
      }
      if (rigs.length) listen();
    },

    refresh: function () { each(function (r) { r.place(); }); },

    idle: function () {
      each(function (r) { r.state = 'idle'; r.lookEl = null; });
      wake();
    },

    typing: function (el) {
      each(function (r) { r.state = 'typing'; r.lookEl = el || null; });
      wake();
    },

    thinking: function () {
      each(function (r) { r.state = 'thinking'; r.lookEl = null; });
      wake();
    },

    success: function () {
      each(function (r) {
        r.nodT = now();
        r.state = 'idle';
        r.lookEl = null;
        // A blink just after the nod sells the "got it" beat. Never retimes a
        // blink that is already playing.
        if (r.blinkT < 0) r.blinkAt = Math.min(r.blinkAt, now() + 380);
      });
      wake();
    },

    destroyAll: function () {
      while (rigs.length) rigs[0].destroy();
    }
  };

  window.LarisMascot = LarisMascot;

  if (!REDUCED) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { LarisMascot.init(); });
    } else {
      LarisMascot.init();
    }
  }
})();
