/* Top frame only. Pill + iframe of the extension panel. */
(function () {
  if (window.__larisPill) return;
  if (window.top !== window) return;
  window.__larisPill = true;

  var running = false;
  var open = false;
  var host = document.createElement('div');
  host.setAttribute('data-laris-affiliate', 'pill');
  var shadow = host.attachShadow({ mode: 'closed' });

  var style = document.createElement('style');
  style.textContent = [
    ':host { all: initial; }',
    '.pill {',
    '  position: fixed; z-index: 2147483646; right: 0; top: 42%;',
    '  border: 0; cursor: pointer;',
    '  background: #B5202A; color: #fff;',
    '  font: 750 13px/1 "Plus Jakarta Sans", system-ui, sans-serif;',
    '  letter-spacing: .02em;',
    '  padding: 14px 11px; border-radius: 14px 0 0 14px;',
    '  box-shadow: 0 10px 28px rgba(181,32,42,.28);',
    '}',
    '.pill:focus-visible { outline: 2px solid #C9974B; outline-offset: 2px; }',
    '.back {',
    '  position: fixed; inset: 0; z-index: 2147483646;',
    '  background: rgba(31,31,31,.48);',
    '  display: flex; align-items: center; justify-content: center;',
    '  padding: 24px;',
    '}',
    '.back[hidden] { display: none; }',
    '.card {',
    '  width: min(1080px, calc(100vw - 48px));',
    '  height: min(860px, calc(100vh - 48px));',
    '  background: #fff; border-radius: 20px; overflow: hidden;',
    '  border: 1px solid #e5e5e5;',
    '  box-shadow: 0 24px 60px rgba(0,0,0,.22);',
    '}',
    '.card iframe { width: 100%; height: 100%; border: 0; background: #fff; }'
  ].join('\n');

  var pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'pill';
  pill.textContent = 'Laris';
  pill.setAttribute('aria-expanded', 'false');
  pill.title = 'Laris Affiliate · overlay 0.5.3';

  var back = document.createElement('div');
  back.className = 'back';
  back.hidden = true;
  var card = document.createElement('div');
  card.className = 'card';
  var frame = document.createElement('iframe');
  frame.title = 'Laris Affiliate';
  frame.src = chrome.runtime.getURL('panel.html?surface=overlay');
  card.appendChild(frame);
  back.appendChild(card);

  shadow.appendChild(style);
  shadow.appendChild(pill);
  shadow.appendChild(back);

  function setOpen(next) {
    open = next;
    back.hidden = !open;
    pill.setAttribute('aria-expanded', open ? 'true' : 'false');
    pill.hidden = open;
  }

  function closeOverlay() {
    if (running && !confirm('Antrian kirim berhenti kalau overlay ditutup. Tutup?')) return;
    setOpen(false);
  }

  pill.addEventListener('click', function () { setOpen(true); });
  back.addEventListener('click', function (ev) {
    if (ev.target === back) closeOverlay();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && open) closeOverlay();
  });

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.source !== 'laris-affiliate-panel') return;
    if (typeof d.running === 'boolean') running = d.running;
    if (d.close) setOpen(false);
  });

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'laris-open-overlay') return;
    mount();
    setOpen(true);
    try { sendResponse({ ok: true }); } catch (e) { /* ignore */ }
  });

  function mount() {
    if (host.isConnected) return;
    (document.documentElement || document.body).appendChild(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
