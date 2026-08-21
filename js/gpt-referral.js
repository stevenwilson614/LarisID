(function (global) {
  'use strict';

  // ---------- inline SVG icons (wire‑style, stroke‑width 2, fill none) ----------
  function clipboardSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  }

  function whatsappSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
  }

  function emailSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';
  }

  function checkSvg() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ---------- copy helpers ----------
  function fallbackCopy(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(textarea);
  }

  function copyText(text, btn) {
    var setCopied = function () {
      btn.innerHTML = checkSvg() + ' Tersalin!';
      setTimeout(function () {
        if (btn.dataset.originalText) {
          btn.innerHTML = btn.dataset.originalText;
        }
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(setCopied).catch(function () {
        fallbackCopy(text);
        setCopied();
      });
    } else {
      fallbackCopy(text);
      setCopied();
    }
  }

  // ---------- render helpers ----------
  function renderSuccess(container, baseUrl, code, data) {
    var total = data ? data.total : 0;
    var bonusActive = data ? data.bonus_active : 0;
    var shareLink = baseUrl + '?ref=' + encodeURIComponent(code);
    var waText = 'Aku pakai LarisID buat riset produk Shopee — 100% gratis, semua fiturnya. Daftar lewat link aku ya: ' + shareLink;
    var encodedWa = encodeURIComponent(waText);
    var waUrl = 'https://wa.me/?text=' + encodedWa;
    var subject = encodeURIComponent('Coba LarisID — riset produk Shopee gratis');
    var body = encodeURIComponent(waText);
    var mailtoUrl = 'mailto:?subject=' + subject + '&body=' + body;

    container.innerHTML =
      '<div style="font-family:system-ui, sans-serif; color:#333; line-height:1.4;">' +
        '<div style="font-weight:bold; margin-bottom:4px;">Ajak teman, dapat jatah pencarian tambahan</div>' +
        '<div style="font-size:0.8rem; color:#666; margin-bottom:12px;">+1 pencarian harian untuk tiap teman yang daftar lewat linkmu (maks +5).</div>' +
        '<div style="display:flex; align-items:center; gap:6px; margin-bottom:12px;">' +
          '<input id="referral-link-field" readonly style="flex:1; padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#f9f9f9; font-size:0.85rem;" value="' + escapeHtml(shareLink) + '" />' +
          '<button id="referral-copy-btn" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #aaa;border-radius:4px;background:#fff;font-size:0.85rem;cursor:pointer;">' +
            clipboardSvg() + ' Salin' +
          '</button>' +
        '</div>' +
        '<div style="display:flex; gap:8px; margin-bottom:12px;">' +
          '<a id="referral-wa-btn" href="' + waUrl + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#333;text-decoration:none;font-size:0.85rem;">' +
            whatsappSvg() + ' WhatsApp' +
          '</a>' +
          '<a id="referral-email-btn" href="' + mailtoUrl + '" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#333;text-decoration:none;font-size:0.85rem;">' +
            emailSvg() + ' Email' +
          '</a>' +
        '</div>' +
        '<div style="font-size:0.85rem; color:#666;">' +
          '<span>' + total + ' teman sudah daftar</span> · <span>+' + bonusActive + '/5 pencarian aktif</span>' +
        '</div>' +
      '</div>';

    var copyBtn = container.querySelector('#referral-copy-btn');
    var linkField = container.querySelector('#referral-link-field');
    if (copyBtn) {
      copyBtn.dataset.originalText = copyBtn.innerHTML;
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var txt = linkField ? linkField.value : shareLink;
        copyText(txt, copyBtn);
      });
    }
  }

  function renderFallback(container, baseUrl) {
    var waText = 'Aku pakai LarisID buat riset produk Shopee — 100% gratis, semua fiturnya. Daftar lewat link aku ya: ' + baseUrl;
    var encodedWa = encodeURIComponent(waText);
    var waUrl = 'https://wa.me/?text=' + encodedWa;
    var subject = encodeURIComponent('Coba LarisID — riset produk Shopee gratis');
    var body = encodeURIComponent(waText);
    var mailtoUrl = 'mailto:?subject=' + subject + '&body=' + body;

    container.innerHTML =
      '<div style="font-family:system-ui, sans-serif; color:#333; line-height:1.4;">' +
        '<div style="font-weight:bold; margin-bottom:4px;">Ajak teman, dapat jatah pencarian tambahan</div>' +
        '<div style="font-size:0.8rem; color:#666; margin-bottom:12px;">+1 pencarian harian untuk tiap teman yang daftar lewat linkmu (maks +5).</div>' +
        '<div style="display:flex; gap:8px;">' +
          '<a href="' + waUrl + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#333;text-decoration:none;font-size:0.85rem;">' +
            whatsappSvg() + ' WhatsApp' +
          '</a>' +
          '<a href="' + mailtoUrl + '" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:1px solid #aaa;border-radius:4px;background:#fff;color:#333;text-decoration:none;font-size:0.85rem;">' +
            emailSvg() + ' Email' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  // ---------- public API ----------
  function mount(container, options) {
    var supabase = options && options.supabase;
    if (!container || !supabase) return;

    if (container.dataset.referralMounted === 'true') {
      return;
    }
    container.dataset.referralMounted = 'true';

    // lightweight placeholder while loading
    container.innerHTML = '<div style="font-family:system-ui, sans-serif; color:#666;">Memuat...</div>';

    var baseUrl = location.origin + location.pathname;

    supabase.rpc('my_referral_stats').then(function (result) {
      var data = result && result.data ? result.data : null;
      var code = data && data.code ? data.code : '';
      // An empty code means the link would be "...?ref=" — indistinguishable
      // from broken. Fall back to the no-code share (still useful) rather
      // than presenting a dead link as if it were real.
      if (code) renderSuccess(container, baseUrl, code, data);
      else renderFallback(container, baseUrl);
    }).catch(function () {
      renderFallback(container, baseUrl);
    });
  }

  function redeemPending(supabase, refCode) {
    if (!refCode || !supabase) return Promise.resolve();
    try {
      return supabase.rpc('redeem_referral', { p_code: refCode }).then(function () {
        // success – nothing to do
      }).catch(function () {
        // silently ignore every error
      });
    } catch (_) {
      return Promise.resolve();
    }
  }

  global.GptReferral = {
    mount: mount,
    redeemPending: redeemPending
  };
})(window);
