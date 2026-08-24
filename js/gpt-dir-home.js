/* LarisID — Cari Produk default-home rows (under the kategori rail).
 *
 * Companion to gpt-dir-hero.js. Owns the Trending Sekarang rail and the
 * Meledak | Pencarian Terbanyak split. Every navigation action is handed
 * back to gpt-app.js so sort / Deep Dive never drift from the directory.
 *
 * Card HTML is supplied by gpt-app.js (typeCardHtml variants) so weekly
 * tooltips and Deep Dive wiring stay in one place.
 */
(function (global) {
  'use strict';

  var ICONS = {
    flame: '<path d="M12 2.6c.6 3.1 2.4 4.3 3.9 5.9a7.4 7.4 0 0 1 2.3 5.3 6.2 6.2 0 0 1-12.4 0c0-2 .9-3.4 2-4.6.5 1 1.2 1.6 2 1.9-.4-2.9.6-6 2.2-8.5Z"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    trend: '<path d="M3.5 16.5 9 11l3.5 3.5L20 7"/><path d="M15.5 7H20v4.5"/>'
  };

  function svg(path, w, opts) {
    opts = opts || {};
    return '<svg width="' + w + '" height="' + w + '" viewBox="0 0 24 24" fill="' +
      (opts.fill || 'none') + '" stroke="' + (opts.stroke || 'currentColor') +
      '" stroke-width="' + (opts.sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      path + '</svg>';
  }

  function trendingShell() {
    return '' +
      '<div class="dir-home-hd">' +
        '<h3 class="dir-home-title">Trending Sekarang</h3>' +
      '</div>' +
      '<p class="dir-home-sub">Pasar dengan unit mingguan tertinggi — disetarakan ke 7 hari dari rentang scrape terakhir.</p>' +
      '<div class="dir-home-rail-wrap">' +
        '<div class="dir-home-rail" data-dhm-rail></div>' +
        '<button type="button" class="dir-home-nav" data-dhm-next aria-label="Geser ke kanan">' +
          svg(ICONS.chevR, 16, { sw: 2.4 }) +
        '</button>' +
      '</div>';
  }

  function featureShell() {
    return '' +
      '<div class="dir-home-meledak">' +
        '<h3 class="dir-home-title">Produk Baru, Langsung Meledak!</h3>' +
        '<p class="dir-home-sub">Pasar dengan lonjakan penjualan tertinggi terhadap penjualan sebelumnya. Bukan perbandingan dengan minggu lalu — jadwal scrape kami belum harian.</p>' +
        '<button type="button" class="dir-home-cta" data-dhm-meledak-cta>' +
          'Lihat Produk Meledak' + svg(ICONS.chevR, 14, { sw: 2.4 }) +
        '</button>' +
        '<div class="dir-home-meledak-grid" data-dhm-meledak></div>' +
      '</div>' +
      '<div class="dir-home-cari">' +
        '<span class="dir-home-cari-art" aria-hidden="true">' +
          svg(ICONS.search, 72, { sw: 1.6 }) +
        '</span>' +
        '<h3 class="dir-home-title">Pencarian Terbanyak</h3>' +
        '<p class="dir-home-sub">Pasar dengan unit mingguan tertinggi minggu ini.</p>' +
        '<button type="button" class="dir-home-cta dir-home-cta--light" data-dhm-cari-cta>' +
          'Lihat Selengkapnya' + svg(ICONS.chevR, 14, { sw: 2.4 }) +
        '</button>' +
      '</div>';
  }

  function fillSlot(host, sel, html, bind) {
    var slot = host.querySelector(sel);
    if (!slot) return;
    slot.innerHTML = html || '';
    if (html && bind) bind(slot);
  }

  function bindOnce(host, api) {
    if (host._dhmBound) return;
    host._dhmBound = true;
    host.addEventListener('click', function (e) {
      var next = e.target.closest('[data-dhm-next]');
      if (next) {
        var rail = host.querySelector('[data-dhm-rail]');
        if (rail) rail.scrollBy({ left: Math.max(280, rail.clientWidth * 0.8), behavior: 'smooth' });
        return;
      }
      if (e.target.closest('[data-dhm-meledak-cta]')) {
        if (api.onEvent) api.onEvent('dir_home_click', { target: 'meledak' });
        if (api.onMeledak) api.onMeledak();
        return;
      }
      if (e.target.closest('[data-dhm-cari-cta]')) {
        if (api.onEvent) api.onEvent('dir_home_click', { target: 'pencarian' });
        if (api.onPencarian) api.onPencarian();
      }
    });
  }

  function render(api) {
    api = api || {};
    var tHost = api.trendingHost;
    var fHost = api.featureHost;
    if (!tHost || !fHost) return;

    if (tHost.dataset.dhmReady !== '1') {
      tHost.dataset.dhmReady = '1';
      tHost.setAttribute('aria-label', 'Trending sekarang');
      tHost.innerHTML = trendingShell();
    }
    if (fHost.dataset.dhmReady !== '1') {
      fHost.dataset.dhmReady = '1';
      fHost.setAttribute('aria-label', 'Pasar meledak dan unit mingguan tertinggi');
      fHost.innerHTML = featureShell();
    }

    bindOnce(tHost, api);
    bindOnce(fHost, api);

    fillSlot(tHost, '[data-dhm-rail]', api.trendHtml, api.bindCards);
    fillSlot(fHost, '[data-dhm-meledak]', api.meledakHtml, api.bindCards);

    tHost.hidden = !!api.ready && !api.trendHtml;
    fHost.hidden = false;
  }

  global.LarisGptDirHome = { render: render };

})(window);
