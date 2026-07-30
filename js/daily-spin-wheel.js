/**
 * Daily prize wheel — shared by Site A (laris-app) and Site B (gpt-app).
 * Honesty: caller runs RPC first, then playAward(award) animates to a matching segment.
 */
(function (global) {
  'use strict';

  const SEGMENTS = [5, 2, 1, 0, 2, 1, 5, 0];
  const SEG_COLORS = [
    '#F5C542', '#F97316', '#4ADE80', '#FB7185',
    '#60A5FA', '#F472B6', '#FBBF24', '#FB923C'
  ];
  const SEG_DEG = 360 / SEGMENTS.length;
  const SPIN_MS = 4000;

  let _host = null;
  let _opts = {};
  let _busy = false;
  let _rotation = 0;
  let _built = false;

  function reduceMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (_) {}
  }

  function el(tag, cls, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    return n;
  }

  function conicBackground() {
    const parts = SEG_COLORS.map((c, i) => {
      const a0 = i * SEG_DEG;
      const a1 = (i + 1) * SEG_DEG;
      return `${c} ${a0}deg ${a1}deg`;
    });
    return `conic-gradient(from ${-SEG_DEG / 2}deg, ${parts.join(', ')})`;
  }

  function placeBulbs(rim) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const bulb = el('span', 'dsw-bulb');
      const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
      const r = 46; // % of wrap via left/top calc
      bulb.style.left = `calc(50% + ${Math.cos(ang) * r}%)`;
      bulb.style.top = `calc(50% + ${Math.sin(ang) * r}%)`;
      bulb.style.animationDelay = `${(i % 4) * 0.15}s`;
      rim.appendChild(bulb);
    }
  }

  function placeLabels(layer) {
    SEGMENTS.forEach((award, i) => {
      const lab = el('div', 'dsw-seg-label');
      const mid = i * SEG_DEG;
      lab.style.transform = `rotate(${mid}deg) translateY(calc(-1 * min(100px, 26vw)))`;
      const inner = el('div', 'dsw-seg-label-inner');
      inner.style.transform = `rotate(${-mid}deg)`;
      inner.appendChild(el('span', 'dsw-gift'));
      inner.appendChild(document.createTextNode(award === 0 ? '+0' : `+${award} Riset`));
      lab.appendChild(inner);
      layer.appendChild(lab);
    });
  }

  function build(host) {
    if (_built && _host === host) return;
    _host = host;
    host.className = 'dsw-overlay';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-labelledby', 'dsw-title');
    host.innerHTML = '';

    const modal = el('div', 'dsw-modal');
    const close = el('button', 'dsw-close', { type: 'button', 'aria-label': 'Tutup', text: '×' });
    close.addEventListener('click', () => closeWheel());

    const head = el('div', 'dsw-head');
    const confetti = el('div', 'dsw-confetti');
    for (let i = 0; i < 6; i++) confetti.appendChild(el('i'));
    head.appendChild(confetti);
    head.appendChild(el('h2', 'dsw-title', { id: 'dsw-title', text: 'Putar Roda Keberuntungan!' }));
    head.appendChild(el('p', 'dsw-sub', { text: 'Putar sekali tiap hari dan dapatkan hadiah menarik.' }));

    const wrap = el('div', 'dsw-wheel-wrap');
    wrap.appendChild(el('div', 'dsw-pointer'));
    wrap.appendChild(el('div', 'dsw-rim'));
    const bulbs = el('div', 'dsw-bulbs');
    placeBulbs(bulbs);
    wrap.appendChild(bulbs);

    const disk = el('div', 'dsw-disk');
    disk.id = 'dsw-disk';
    disk.style.background = conicBackground();
    const labels = el('div', 'dsw-seg-labels');
    placeLabels(labels);
    disk.appendChild(labels);
    wrap.appendChild(disk);

    const hub = el('button', 'dsw-hub', { type: 'button', id: 'dsw-hub', text: 'PUTAR' });
    hub.addEventListener('click', () => onPutar());
    wrap.appendChild(hub);

    const msg = el('div', 'dsw-msg', { id: 'dsw-msg' });

    const result = el('div', 'dsw-result', { id: 'dsw-result' });
    result.innerHTML = `
      <div class="dsw-result-rays" aria-hidden="true"></div>
      <div class="dsw-burst" id="dsw-burst" aria-hidden="true"></div>
      <div class="dsw-result-inner">
        <p class="dsw-result-kicker" id="dsw-result-kicker">Selamat! Kamu dapat</p>
        <div class="dsw-result-pill"><span class="dsw-result-gift" aria-hidden="true"></span><span id="dsw-result-award">+2 RISET</span></div>
        <p class="dsw-result-sub" id="dsw-result-sub">Riset produk tambahan untuk hari ini!</p>
        <div class="dsw-actions">
          <button type="button" class="dsw-btn dsw-btn-primary" id="dsw-cta">Mulai Riset</button>
          <button type="button" class="dsw-btn dsw-btn-ghost" id="dsw-done">Tutup</button>
        </div>
      </div>`;

    modal.appendChild(close);
    modal.appendChild(head);
    modal.appendChild(wrap);
    modal.appendChild(msg);
    modal.appendChild(result);
    host.appendChild(modal);

    host.addEventListener('click', (e) => {
      if (e.target === host && !_busy) closeWheel();
    });
    result.querySelector('#dsw-cta').addEventListener('click', () => {
      if (typeof _opts.onCta === 'function') _opts.onCta();
      closeWheel();
    });
    result.querySelector('#dsw-done').addEventListener('click', () => closeWheel());

    _built = true;
  }

  function pickSegmentIndex(award) {
    const n = Number(award);
    const matches = [];
    SEGMENTS.forEach((v, i) => { if (v === n) matches.push(i); });
    if (!matches.length) {
      // Fallback: closest known award segment
      const fallback = SEGMENTS.indexOf(1);
      return fallback >= 0 ? fallback : 0;
    }
    return matches[Math.floor(Math.random() * matches.length)];
  }

  function targetRotationForSegment(index) {
    // conic from -SEG_DEG/2 so segment i center is at i * SEG_DEG (0 = top)
    const center = index * SEG_DEG;
    const mod = ((360 - center) % 360 + 360) % 360;
    const extra = 5 + Math.floor(Math.random() * 3); // 5–7 full turns
    // Continue from current absolute rotation
    const base = Math.ceil(_rotation / 360) * 360;
    let next = base + extra * 360 + mod;
    if (next <= _rotation + 360) next += 360;
    return next;
  }

  function showMessage(text) {
    const msg = document.getElementById('dsw-msg');
    if (!msg) return;
    msg.textContent = text || '';
    msg.classList.toggle('show', !!text);
  }

  function burstConfetti() {
    const box = document.getElementById('dsw-burst');
    if (!box) return;
    box.innerHTML = '';
    const colors = ['#F5C542', '#E8442A', '#60A5FA', '#22C55E', '#FB923C', '#fff'];
    for (let i = 0; i < 18; i++) {
      const s = el('span');
      const ang = (i / 18) * Math.PI * 2;
      const dist = 40 + Math.random() * 90;
      s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = `${Math.random() * 0.12}s`;
      box.appendChild(s);
    }
  }

  function showResult(award) {
    const result = document.getElementById('dsw-result');
    const kicker = document.getElementById('dsw-result-kicker');
    const awardEl = document.getElementById('dsw-result-award');
    const sub = document.getElementById('dsw-result-sub');
    const cta = document.getElementById('dsw-cta');
    if (!result) return;
    const n = Number(award) || 0;
    if (n <= 0) {
      if (kicker) kicker.textContent = 'Belum beruntung kali ini';
      if (awardEl) awardEl.textContent = '+0 RISET';
      if (sub) sub.textContent = 'Coba lagi besok — putaran harian reset tiap hari.';
    } else {
      if (kicker) kicker.textContent = 'Selamat! Kamu dapat';
      if (awardEl) awardEl.textContent = `+${n} RISET`;
      if (sub) sub.textContent = 'Riset produk tambahan untuk hari ini!';
    }
    if (cta) cta.style.display = n > 0 ? '' : 'none';
    result.classList.add('show');
    burstConfetti();
    haptic(n > 0 ? [30, 40, 50] : [20]);
  }

  function resetUi() {
    _busy = false;
    const hub = document.getElementById('dsw-hub');
    const wrap = _host && _host.querySelector('.dsw-wheel-wrap');
    const result = document.getElementById('dsw-result');
    if (hub) { hub.disabled = false; hub.textContent = 'PUTAR'; }
    if (wrap) wrap.classList.remove('is-spinning');
    if (result) result.classList.remove('show');
    showMessage('');
  }

  async function onPutar() {
    if (_busy) return;
    if (typeof _opts.onSpin !== 'function') return;
    _busy = true;
    const hub = document.getElementById('dsw-hub');
    const wrap = _host && _host.querySelector('.dsw-wheel-wrap');
    if (hub) { hub.disabled = true; hub.textContent = '…'; }
    if (wrap) wrap.classList.add('is-spinning');
    showMessage('');
    haptic(12);

    let data;
    try {
      data = await _opts.onSpin();
    } catch (err) {
      _busy = false;
      if (hub) { hub.disabled = false; hub.textContent = 'PUTAR'; }
      if (wrap) wrap.classList.remove('is-spinning');
      showMessage('Gagal memutar. Coba lagi nanti.');
      return;
    }

    if (!data || data.allowed === false) {
      _busy = false;
      if (hub) { hub.disabled = true; hub.textContent = 'PUTAR'; }
      if (wrap) wrap.classList.remove('is-spinning');
      const reason = data && data.reason;
      showMessage(reason === 'already_spun'
        ? 'Kamu sudah putar hari ini. Balik lagi besok ya.'
        : 'Putaran belum bisa dipakai sekarang.');
      return;
    }

    await playAward(data.award);
    if (typeof _opts.onAwarded === 'function') _opts.onAwarded(data);
  }

  function playAward(award) {
    return new Promise((resolve) => {
      const disk = document.getElementById('dsw-disk');
      const wrap = _host && _host.querySelector('.dsw-wheel-wrap');
      const hub = document.getElementById('dsw-hub');
      const idx = pickSegmentIndex(award);
      const next = targetRotationForSegment(idx);

  let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        _rotation = next;
        if (wrap) wrap.classList.remove('is-spinning');
        if (hub) hub.textContent = 'PUTAR';
        showResult(award);
        _busy = false;
        resolve(award);
      };

      if (!disk || reduceMotion()) {
        _rotation = next;
        if (disk) {
          disk.classList.remove('is-animating');
          disk.style.transform = `rotate(${next}deg)`;
        }
        finish();
        return;
      }

      // Force reflow so transition always runs from current rotation
      disk.classList.remove('is-animating');
      disk.style.transform = `rotate(${_rotation}deg)`;
      void disk.offsetWidth;
      disk.classList.add('is-animating');
      disk.style.transform = `rotate(${next}deg)`;

      let tickTimer = null;
      const start = performance.now();
      const tick = () => {
        const t = performance.now() - start;
        if (t > SPIN_MS * 0.65 && t < SPIN_MS) haptic(8);
        if (t < SPIN_MS) tickTimer = requestAnimationFrame(tick);
      };
      tickTimer = requestAnimationFrame(tick);

      const onEnd = (e) => {
        if (e && e.propertyName && e.propertyName !== 'transform') return;
        disk.removeEventListener('transitionend', onEnd);
        if (tickTimer) cancelAnimationFrame(tickTimer);
        finish();
      };
      disk.addEventListener('transitionend', onEnd);
      setTimeout(onEnd, SPIN_MS + 200);
    });
  }

  function openWheel(options) {
    _opts = options || {};
    const host = document.getElementById(_opts.hostId || 'daily-spin-root');
    if (!host) return;
    build(host);
    resetUi();
    // Keep disk angle
    const disk = document.getElementById('dsw-disk');
    if (disk) {
      disk.classList.remove('is-animating');
      disk.style.transform = `rotate(${_rotation}deg)`;
    }
    host.classList.add('open');
    host.style.display = 'flex';
  }

  function closeWheel() {
    if (_busy) return;
    if (_host) {
      _host.classList.remove('open');
      _host.style.display = 'none';
    }
    if (typeof _opts.onClose === 'function') _opts.onClose();
  }

  function isOpen() {
    return !!(!_host ? false : _host.classList.contains('open'));
  }

  global.LarisDailySpin = {
    open: openWheel,
    close: closeWheel,
    isOpen,
    playAward,
    showMessage,
    reset: resetUi,
  };
})(typeof window !== 'undefined' ? window : globalThis);
