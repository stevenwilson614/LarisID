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
 *
 * Two kinds of rig share all of the above. The hero and Ask poses read
 * pre-cut patches from js/laris-mascot-rigs.js. The loading poses build their
 * patches at runtime instead, by masking copies of the base <img> with a
 * radial-gradient -- same feathered edge, but no extra files and no extra
 * bytes, which matters for artwork that is only on screen for ~1s. See
 * LOADER_RIGS below.
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

  // Searching, not resting. The sweep is shaped so it dwells at each end of
  // its arc -- that pause is what reads as looking at something, rather than
  // panning past it.
  var SCAN_PERIOD = 3.4;     // binoculars: one sweep of the horizon
  var SCAN_DWELL = 0.55;     // exponent < 1 snaps the sweep toward its extremes
  var INSPECT_X = 2.6;       // magnifier: two incommensurate frequencies, so
  var INSPECT_Y = 1.7;       // it never pores over the same loop twice
  var EYE_LEAD = 0.18;       // the eye arrives before the head does
  var SCAN_BREATH = 0.6;     // breath stays, but underneath the search
  var CURSOR_BIAS = 0.35;    // how much a nearby cursor pulls the gaze

  /*
   * Loading poses. Geometry is in source-image pixels, read off a coordinate
   * grid of each render; ellipses are (cx, cy, rx, ry) and `f` is the feather
   * width. Unlike the pre-cut rigs, every layer here is a full-bleed copy of
   * the base <img> that a radial-gradient mask cuts down -- so a layer's own
   * box IS the canvas, and the tick's percentage maths needs no special case.
   *
   * In both poses the tool is pressed to the face and held in the mascot's own
   * hands, so one ellipse covers skull + tool + hands and the whole group
   * sweeps together. For the magnifier that is not just tidier, it is required:
   * a lens moving on its own would slide off the magnified eye behind it.
   */
  var LOADER_RIGS = {
    'load-binocs': {
      mask: true, src: '/images/brand/mascot-load-binocs.webp', w: 496, h: 641,
      motion: 'sweep', pivot: [290, 235],
      layers: [
        { n: 'wing',  g: 'base', e: [135, 350, 115, 105], f: 40, o: [255, 290] },
        { n: 'torso', g: 'base', e: [310, 290, 120, 80],  f: 38, o: [310, 370] },
        { n: 'head',  g: 'head', e: [300, 130, 165, 125], f: 46 }
      ],
      // The barrels cover the face completely, so there is nothing to blink.
      eyes: []
    },
    'load-magnify': {
      mask: true, src: '/images/brand/mascot-load-magnify.webp', w: 483, h: 558,
      motion: 'inspect', pivot: [255, 330],
      layers: [
        { n: 'torso', g: 'base', e: [270, 420, 135, 95],  f: 38, o: [270, 510] },
        { n: 'head',  g: 'head', e: [210, 225, 195, 190], f: 46 }
      ],
      // Only the eye behind the lens; the other is drawn winked shut, so
      // blinking this one alone still reads as a whole-face blink. The iris
      // patch is masked wide enough to carry its own white surround, which is
      // what keeps the painted iris underneath covered at every offset -- no
      // inpainted sclera needed here.
      eyes: [{
        iris: [155, 234, 36, 38], f: 9, travel: [5.5, 5.0],
        // Sized well inside the eye's drawn rim (~0.8x): a lid that covers
        // the rim too reads as a pale blob rather than a closed eye.
        lid: [156, 233, 34, 33], tone: '238,232,228'
      }]
    }
  };

  function poseManifest(name) { return RIGS[name] || LOADER_RIGS[name] || null; }

  /* radial-gradient whose solid stop sits at the un-feathered radius, so the
     ramp spans exactly `f` source pixels either side of the ellipse. */
  function maskFor(e, f, W, H) {
    var rx = e[2] + f, ry = e[3] + f;
    return 'radial-gradient(ellipse ' + (rx / W * 100).toFixed(4) + '% ' +
      (ry / H * 100).toFixed(4) + '% at ' + (e[0] / W * 100).toFixed(4) + '% ' +
      (e[1] / H * 100).toFixed(4) + '%, #000 ' +
      (e[2] / rx * 100).toFixed(1) + '%, transparent 100%)';
  }

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
    for (var i = rigs.length - 1; i >= 0; i--) {
      // Loader rigs are thrown away wholesale every time their container is
      // re-rendered (grid.innerHTML = ...). Without this the Rig object
      // outlives its DOM forever, holding a detached subtree alive and still
      // being walked by each() on every state change.
      if (!rigs[i].host.isConnected) { rigs[i].destroy(); continue; }
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

  function Rig(host, poseName, opts) {
    opts = opts || {};
    this.host = host;
    this.pose = poseName;
    this.man = poseManifest(poseName);
    this.img = host.querySelector('img');
    this.built = false;
    this.visible = false;
    this.hidden = document.hidden;
    this.state = opts.state || 'idle';
    // A locked rig drives itself and ignores the global state API, so the
    // LarisMascot.thinking() fired by the AI stream cannot hijack a loader.
    this.locked = !!opts.locked;
    this.lookEl = null;
    this.t0 = now();

    this.look = { x: 0, y: 0 };
    this.settle = { x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0, next: 0 };
    this.blinkAt = now() + (this.locked ? rand(700, 1800) : rand(1200, 3600));
    this.blinkT = -1;
    this.nodT = -1;

    this.layers = {};
    this.eyes = [];
    this.rect = null;
    this.rectAt = 0;
  }

  /*
   * Runtime-masked rig. Every layer is a full-bleed copy of the same cached
   * <img>, so nothing extra is fetched, and because a layer's box equals the
   * canvas the tick's percentage maths (which divides by the layer's own
   * width/height) resolves to canvas percentages with no special case.
   */
  Rig.prototype.buildMask = function () {
    var man = this.man, W = man.w, H = man.h, self = this;

    var box = document.createElement('div');
    // The layers are pixel-identical to the <img> already on screen, so there
    // is nothing to fade in from -- and a 450ms fade is half a loader's life.
    box.className = 'mrig is-ready';
    box.setAttribute('aria-hidden', 'true');

    var headGroup = document.createElement('div');
    headGroup.className = 'mrig-head';
    headGroup.style.transformOrigin =
      (man.pivot[0] / W * 100) + '% ' + (man.pivot[1] / H * 100) + '%';

    var groups = { base: box, head: headGroup };

    function patch(e, f, parent, origin) {
      var el = document.createElement('img');
      el.className = 'mrig-l';
      el.alt = '';
      el.decoding = 'async';
      // The shared .mrig-l rule pins height:auto !important for the pre-cut
      // rigs, so a full-bleed layer has to out-important it.
      imp(el, 'left', '0'); imp(el, 'top', '0');
      imp(el, 'width', '100%'); imp(el, 'height', '100%');
      var m = maskFor(e, f, W, H);
      el.style.webkitMaskImage = m; el.style.maskImage = m;
      el.style.webkitMaskRepeat = 'no-repeat'; el.style.maskRepeat = 'no-repeat';
      if (origin) el.style.transformOrigin =
        (origin[0] / W * 100) + '% ' + (origin[1] / H * 100) + '%';
      el.src = man.src;
      parent.appendChild(el);
      return el;
    }

    for (var i = 0; i < man.layers.length; i++) {
      var L = man.layers[i];
      this.layers[L.n] = {
        el: patch(L.e, L.f, groups[L.g] || box, L.o),
        d: { w: W, h: H }
      };
    }

    this.eyes = [];
    var eyes = man.eyes || [];
    for (var k = 0; k < eyes.length; k++) {
      var E = eyes[k];
      var iris = patch(E.iris, E.f, headGroup);

      var lid = document.createElement('div');
      lid.className = 'mrig-lid mrig-lid--soft';
      lid.style.left = ((E.lid[0] - E.lid[2]) / W * 100) + '%';
      lid.style.top = ((E.lid[1] - E.lid[3]) / H * 100) + '%';
      lid.style.width = (E.lid[2] * 2 / W * 100) + '%';
      lid.style.height = (E.lid[3] * 2 / H * 100) + '%';
      lid.style.background =
        'radial-gradient(ellipse at 50% 20%, rgba(' + E.tone + ',1) 44%,' +
        'rgba(' + E.tone + ',.94) 78%, rgba(188,178,170,.88) 100%)';
      headGroup.appendChild(lid);

      this.eyes.push({ iris: iris, lid: lid, travel: E.travel,
                       irisBox: { w: W, h: H } });
    }

    box.appendChild(headGroup);
    this.box = box;
    this.headGroup = headGroup;
    (this.img.parentNode || this.host).appendChild(box);
    this.place();
  };

  Rig.prototype.build = function () {
    if (this.built || !this.man || !this.img) return;
    this.built = true;
    if (this.man.mask) return this.buildMask();

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
    if (this.state === 'scanning') {
      // Led by the scan itself, with a light pull toward a nearby cursor --
      // searching for your thing, but it notices you.
      var lx, ly;
      if (this.man.motion === 'sweep') {
        lx = shapeSweep(t + EYE_LEAD); ly = 0;
      } else {
        lx = Math.sin((t + EYE_LEAD) * TAU / INSPECT_X);
        ly = Math.sin((t + EYE_LEAD) * TAU / INSPECT_Y);
      }
      var near = this.cursorTarget(ts);
      if (near) {
        lx += (near.x - lx) * CURSOR_BIAS;
        ly += (near.y - ly) * CURSOR_BIAS;
      }
      return { x: clamp(lx, -1, 1), y: clamp(ly, -1, 1) };
    }

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

  /* The cursor as -1..1, or null when it is nowhere near. */
  Rig.prototype.cursorTarget = function (ts) {
    if (!pointer.seen || !this.box) return null;
    if (!this.rect || ts - this.rectAt > 200) {
      this.rect = this.box.getBoundingClientRect();
      this.rectAt = ts;
    }
    var r = this.rect;
    if (!r.width) return null;
    var cx = r.left + r.width * 0.5, cy = r.top + r.height * 0.42;
    var dx = pointer.x - cx, dy = pointer.y - cy;
    if (Math.sqrt(dx * dx + dy * dy) > ENGAGE_PX + r.width * 0.5) return null;
    return { x: clamp(dx / (r.width * 0.9), -1, 1),
             y: clamp(dy / (r.height * 0.9), -1, 1) };
  };

  /* |sin|^0.55 keeps its sign but snaps toward the extremes, so the sweep
     lingers at each end of the arc and transits quickly between. */
  function shapeSweep(t) {
    var v = Math.sin(t * TAU / SCAN_PERIOD);
    return (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), SCAN_DWELL);
  }

  Rig.prototype.tick = function (ts) {
    if (!this.built) { this.build(); if (!this.built) return; }
    var man = this.man;
    var t = (ts - this.t0) / 1000;

    var scanning = this.state === 'scanning';
    var period = this.state === 'thinking' ? BREATH_PERIOD * 1.18 : BREATH_PERIOD;
    // While searching the breath is the floor, not the figure.
    var depth = scanning ? SCAN_BREATH : 1;
    var br = Math.sin(t * TAU / period) * depth;
    var brLag = Math.sin((t - BREATH_LAG) * TAU / period) * depth;
    var sway = scanning ? 0 : Math.sin(t * TAU / SWAY_PERIOD);

    /* occasional head settle ---------------------------------------- */
    var s = this.settle;
    if (scanning) { s.x = s.y = s.r = 0; s.next = ts + 9e5; }
    else if (ts >= s.next) {
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
    // A pose whose eyes are hidden behind its own tool has nothing to blink.
    var lid = 0;
    if (this.eyes.length && this.blinkT < 0 && ts >= this.blinkAt) this.blinkT = 0;
    if (this.blinkT >= 0) {
      this.blinkT = ts - (this.blinkAt);
      var b = this.blinkT;
      if (b < 110) lid = b / 110;
      else if (b < 165) lid = 1;
      else if (b < 315) lid = 1 - (b - 165) / 150;
      else {
        lid = 0; this.blinkT = -1;
        // A searching bird blinks more than a resting one.
        this.blinkAt = ts + (scanning ? rand(2600, 4500) : rand(4800, 8200));
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

    if (scanning) {
      // The search drives the head outright here; the gaze is a passenger, so
      // it is not added on top the way it is at rest.
      if (this.man.motion === 'sweep') {
        var sw = shapeSweep(t);
        headX = sw * 5.5;
        headR = sw * 1.9;
        headY = -brLag * 1.9 - Math.pow(Math.abs(sw), 2) * 1.2;
        var wingEl = this.layers.wing;
        if (wingEl) setT(wingEl.el, 'rotate(' +
          (Math.sin(t * TAU / 4.9 + 1.1) * 0.85).toFixed(3) + 'deg)');
      } else {
        headX = Math.sin(t * TAU / INSPECT_X) * 4.2;
        headY = -brLag * 1.9 + Math.sin(t * TAU / INSPECT_Y) * 2.4;
        headR = Math.sin(t * TAU / INSPECT_X) * 1.4;
      }
    }

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
    // A loader lives about a second. Waiting on IntersectionObserver's async
    // first callback would spend a visible slice of that doing nothing, so
    // locked rigs start immediately and only observe for the resize path.
    if (this.locked || !('IntersectionObserver' in window)) {
      this.visible = true; this.build(); wake();
      if (this.locked && 'ResizeObserver' in window) {
        this.ro = new ResizeObserver(function () { self.place(); });
        this.ro.observe(this.img);
      }
      return;
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

  // Locked rigs run their own state, so the global API steps over them.
  function each(fn) {
    for (var i = 0; i < rigs.length; i++) if (!rigs[i].locked) fn(rigs[i]);
  }

  var LarisMascot = {
    reduced: REDUCED,

    init: function (root) {
      if (REDUCED) return;
      var nodes = (root || document).querySelectorAll('[data-mascot]');
      for (var i = 0; i < nodes.length; i++) {
        var host = nodes[i];
        if (host._mrig) continue;
        var pose = host.getAttribute('data-mascot');
        if (!poseManifest(pose) || !host.querySelector('img')) continue;
        var motion = host.getAttribute('data-mascot-motion');
        var rig = new Rig(host, pose, motion === 'scanning'
          ? { state: 'scanning', locked: true } : null);
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
