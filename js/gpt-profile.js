(function (global) {
  'use strict';

  let supabase = null;
  let userId = null;
  let userEmail = '';
  let esc = function (s) { return s; };
  let toast = null;

  let modalRoot = null;
  let isOpen = false;

  let currentRow = {};
  let imgPreview = null;
  let initialsFallback = null;
  let statusEl = null;
  let onSignOut = null;
  let onProfileChanged = null;
  let getUsage = null;
  let storeLinks = [];

  const STORE_PLATFORMS = {
    shopee: 'Shopee',
    tokopedia: 'Tokopedia',
    tiktok_shop: 'TikTok Shop',
    lazada: 'Lazada',
    blibli: 'Blibli',
  };

  const closeSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const cameraSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  const pencilSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  const lockSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const ROW_ICONS = {
    name: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.5-4.5A8 8 0 1 1 8 20L3 21z"/><path d="M8.5 9.5c0 3 2 5 5 5"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    shopee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    bio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>',
  };
  // Settings-style rows with real input chrome (border + bg + pencil), not
  // borderless text that looks read-only. Whole row focuses the field.
  function rowHtml(icoKey, label, inputHtml) {
    return '<div class="gpt-row" role="group" aria-label="' + label + '">' +
      '<span class="gpt-row-ico" aria-hidden="true">' + ROW_ICONS[icoKey] + '</span>' +
      '<span class="gpt-row-body"><span class="gpt-row-label">' + label + '</span>' + inputHtml + '</span>' +
      '<span class="gpt-row-edit" aria-hidden="true" title="Ketuk untuk mengubah">' + pencilSVG + '</span>' +
    '</div>';
  }

  /* ---------- helpers ---------- */

  function getInitials(name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p.charAt(0).toUpperCase()).join('');
  }

  function readUsage() {
    if (typeof getUsage !== 'function') return null;
    try { return getUsage() || null; } catch (_) { return null; }
  }

  function quotaRingHtml(kind, num) {
    return '<span class="usage-ring-wrap gpt-quota-ring js-quota-' + kind + '-ring" data-tone="ok">' +
      '<svg class="usage-ring" viewBox="0 0 36 36" aria-hidden="true">' +
        '<circle class="track" cx="18" cy="18" r="15"></circle>' +
        '<circle class="prog" cx="18" cy="18" r="15" stroke-dasharray="94.2" stroke-dashoffset="0"></circle>' +
      '</svg>' +
      '<span class="usage-ring-num">' + (num || '') + '</span>' +
    '</span>';
  }

  function quotaHtml() {
    const u = readUsage() || {};
    return '<div class="gpt-quota" aria-label="Jatah harian">' +
      '<div class="gpt-quota-item">' +
        quotaRingHtml('dive', u.diveNum || '∞') +
        '<span class="gpt-quota-copy">' +
          '<span class="gpt-quota-lbl">Deep Dive</span>' +
          '<span class="gpt-quota-val js-quota-dives">' + (u.divesText || '—') + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="gpt-quota-item">' +
        quotaRingHtml('dl', u.dlNum || '90') +
        '<span class="gpt-quota-copy">' +
          '<span class="gpt-quota-lbl">Unduhan</span>' +
          '<span class="gpt-quota-val js-quota-downloads">' + (u.downloadsText || '90/90') + '</span>' +
        '</span>' +
      '</div>' +
    '</div>';
  }

  function paintQuotaRing(wrap, num, tone, offset) {
    if (!wrap) return;
    if (tone) wrap.dataset.tone = tone;
    const prog = wrap.querySelector('.prog');
    const numEl = wrap.querySelector('.usage-ring-num');
    if (numEl && num != null) numEl.textContent = num;
    if (prog && offset != null) {
      prog.setAttribute('stroke-dasharray', '94.2');
      prog.setAttribute('stroke-dashoffset', String(offset));
    }
  }

  function refreshUsage() {
    if (!isOpen || !modalRoot) return;
    const u = readUsage();
    if (!u) return;
    const diveEl = modalRoot.querySelector('.js-quota-dives');
    const dlEl = modalRoot.querySelector('.js-quota-downloads');
    if (diveEl && u.divesText) diveEl.textContent = u.divesText;
    if (dlEl && u.downloadsText) dlEl.textContent = u.downloadsText;
    paintQuotaRing(modalRoot.querySelector('.js-quota-dive-ring'), u.diveNum, u.diveTone, u.diveOffset);
    paintQuotaRing(modalRoot.querySelector('.js-quota-dl-ring'), u.dlNum, u.dlTone, u.dlOffset);
  }

  function handleKey(e) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }

  function getRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement('div');
    modalRoot.id = 'gpt-profile-modal';
    modalRoot.style.display = 'none';
    modalRoot.addEventListener('click', function (e) {
      if (e.target === modalRoot) close();
    });
    document.body.appendChild(modalRoot);
    return modalRoot;
  }

  function modalHTML(content) {
    return `<style>
  #gpt-profile-modal * { box-sizing: border-box; }
  #gpt-profile-modal {
    position: fixed; top:0; left:0; width:100%; height:100%;
    background: rgba(0,0,0,0.4);
    display: flex; align-items: flex-end; justify-content: center; z-index:9999;
  }
  @media (min-width: 560px) { #gpt-profile-modal { align-items: center; } }
  .gpt-card {
    background: #fff; border-radius: 20px 20px 0 0; padding: 10px 22px 26px;
    max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; position: relative;
    box-shadow: 0 -8px 32px rgba(0,0,0,0.15);
    animation: gptSheetUp .22s ease;
  }
  @media (min-width: 560px) { .gpt-card { border-radius: 20px; } }
  @keyframes gptSheetUp { from { transform: translateY(28px); opacity: .5; } to { transform: none; opacity: 1; } }
  .gpt-sheet-handle { width: 36px; height: 4px; border-radius: 999px; background: #E5E7EB; margin: 6px auto 12px; }
  @media (min-width: 560px) { .gpt-sheet-handle { display: none; } }
  .gpt-sheet-head { padding: 2px 34px 18px 0; }
  .gpt-sheet-title { font-size: 21px; font-weight: 800; margin: 0 0 4px; color: #111; letter-spacing: -.01em; }
  .gpt-sheet-sub { font-size: 13px; color: #6B7280; margin: 0; line-height: 1.4; }
  .gpt-close {
    position: absolute; top: 14px; right: 14px;
    width: 30px; height: 30px; border-radius: 50%; background: #F3F4F6;
    border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;
  }
  .gpt-close svg { display: block; color: #374151; width: 18px; height: 18px; }
  .gpt-field { margin-bottom: 16px; }
  .gpt-field label {
    display: block; margin-bottom: 4px; font-weight: 600; font-size: 14px;
  }
  .gpt-field input, .gpt-field textarea {
    width: 100%; padding: 8px 12px; border:1px solid #ccc; border-radius:6px; font-size:14px;
  }
  .gpt-field input:focus, .gpt-field textarea:focus {
    outline: none; border-color: #1a73e8;
  }
  .gpt-file-btn {
    display: inline-block; cursor: pointer; color: #1a73e8;
  }
  .gpt-upload-icon { vertical-align: middle; }
  .gpt-avatar-wrap {
    margin: 0 auto 12px; width: 80px; height: 80px; border-radius: 50%;
    overflow: hidden; position: relative; background: #f0f0f0;
    display: flex; align-items: center; justify-content: center;
  }
  .gpt-avatar-img {
    width: 100%; height: 100%; object-fit: cover; display: none;
  }
  .gpt-avatar-fallback {
    font-size: 24px; font-weight: 700; color: #555; display: flex;
  }
  /* Bottom-sheet edit form: profile picture + camera badge, then icon-circle
     rows with real input chrome so editability is obvious (Instagram /
     Google Account pattern: bordered fields + pencil, not nav chevrons). */
  .gpt-sheet-hero {
    display: flex; align-items: center; justify-content: center; gap: 16px;
    margin: 4px 0 22px; flex-wrap: wrap;
  }
  .gpt-sheet-hero .gpt-sheet-avatar-wrap { margin: 0; flex-shrink: 0; }
  .gpt-sheet-avatar-wrap { position: relative; width: 96px; height: 96px; margin: 4px auto 22px; }
  .gpt-sheet-avatar-wrap .gpt-avatar-wrap { width: 96px; height: 96px; margin: 0; }
  .gpt-quota { display: flex; flex-direction: column; gap: 8px; min-width: 168px; }
  .gpt-quota-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px 8px 8px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 12px;
  }
  .gpt-quota-ring { width: 36px; height: 36px; flex-shrink: 0; }
  .gpt-quota-ring .usage-ring-num { font-size: 10px; font-weight: 750; }
  .gpt-quota-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .gpt-quota-lbl {
    font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #6B7280;
  }
  .gpt-quota-val { font-size: 16px; font-weight: 800; color: #111; letter-spacing: -.02em; line-height: 1.15; }
  .gpt-avatar-camera-badge {
    position: absolute; right: -2px; bottom: -2px; width: 32px; height: 32px; border-radius: 50%;
    background: #fff; border: 1px solid #E5E7EB; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 6px rgba(0,0,0,.12); color: #374151;
  }
  .gpt-avatar-camera-badge svg { width: 16px; height: 16px; }
  .gpt-rows { margin: 4px 0 4px; display: flex; flex-direction: column; gap: 10px; }
  .gpt-row {
    display: flex; align-items: flex-start; gap: 12px; padding: 12px;
    border: 1px solid #E5E7EB; border-radius: 14px; background: #F9FAFB;
    cursor: text; transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
  }
  .gpt-row:hover { border-color: #D1D5DB; background: #F3F4F6; }
  .gpt-row.is-editing {
    border-color: #B5202A; background: #fff;
    box-shadow: 0 0 0 3px rgba(181, 32, 42, 0.12);
  }
  .gpt-row-ico {
    flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
    background: #fff; border: 1px solid #E5E7EB; color: #4B5563;
    display: flex; align-items: center; justify-content: center; margin-top: 2px;
  }
  .gpt-row.is-editing .gpt-row-ico { border-color: #F9EAE4; background: #F9EAE4; color: #B5202A; }
  .gpt-row-ico svg { width: 18px; height: 18px; }
  .gpt-row-body { flex: 1; min-width: 0; }
  .gpt-row-label {
    display: block; font-size: 12px; font-weight: 700; color: #6B7280;
    margin: 0 0 6px; letter-spacing: .01em;
  }
  .gpt-row.is-editing .gpt-row-label { color: #B5202A; }
  .gpt-row-input {
    display: block; width: 100%; border: 1px solid #E5E7EB; border-radius: 10px;
    padding: 10px 12px; margin: 0; background: #fff;
    font: inherit; font-size: 15px; font-weight: 600; color: #111; resize: none;
    line-height: 1.35; transition: border-color .15s ease, box-shadow .15s ease;
  }
  .gpt-row-input:focus {
    outline: none; border-color: #B5202A;
    box-shadow: 0 0 0 3px rgba(181, 32, 42, 0.15);
  }
  .gpt-row-input::placeholder { color: #9CA3AF; font-weight: 500; }
  .gpt-row-edit {
    flex-shrink: 0; color: #9CA3AF; margin-top: 8px;
    width: 28px; height: 28px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    background: #fff; border: 1px solid #E5E7EB;
  }
  .gpt-row.is-editing .gpt-row-edit { color: #B5202A; border-color: #F9EAE4; background: #F9EAE4; }
  .gpt-row-edit svg { display: block; width: 14px; height: 14px; }
  .gpt-disclaimer {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    margin-top: 14px; font-size: 11.5px; color: #9CA3AF; text-align: center; line-height: 1.4;
  }
  .gpt-disclaimer svg { flex-shrink: 0; width: 13px; height: 13px; }
  .gpt-actions { text-align: right; margin-top: 16px; }
  .gpt-btn {
    background: #111; color: #fff; border: none; padding: 15px 20px;
    border-radius: 14px; cursor: pointer; font-size: 15px; font-weight: 700;
    width: 100%;
  }
  .gpt-btn:hover { background: #000; }
  .gpt-status { margin-top: 8px; font-size: 13px; min-height: 20px; text-align: center; }
  .gpt-status.error { color: #c62828; }
  .gpt-status.success { color: #2e7d32; }
  .gpt-status.info { color: #555; }
  .gpt-signout { text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; }
  .gpt-signout button { background: none; border: none; color: #c62828; font-size: 13px; cursor: pointer; padding: 4px; }
  .gpt-ext-install { text-align: center; margin: 12px 0 0; font-size: 13px; }
  .gpt-ext-install a { color: #B5202A; font-weight: 700; }
  .gpt-pv-name { font-size: 18px; font-weight: 700; color: #111; margin-top: 4px; }
  .gpt-pv-role {
    display: inline-flex; align-items: center; margin-left: 6px; vertical-align: middle;
    padding: 2px 8px; border-radius: 999px; background: #B5202A; color: #fff;
    font-size: 11px; font-weight: 800; letter-spacing: .02em;
  }
  .gpt-pv-city { font-size: 13px; color: #6B7280; margin-top: 2px; }
  .gpt-pv-bio { font-size: 14px; color: #374151; line-height: 1.5; margin: 16px 0 0; }
  .gpt-pv-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; justify-content: center; }
  .gpt-pv-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 700; background: #F9EAE4; color: #8E191F;
    border-radius: 999px; padding: 4px 10px;
  }
  .gpt-pv-badge-v { font-size: 9px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #1A7A46; }
  .gpt-pv-shopee { display: inline-block; margin-top: 10px; font-size: 13px; color: #1a73e8; text-decoration: none; }
  .gpt-pv-shopee:hover { text-decoration: underline; }
  .gpt-stores { margin: 8px 0 4px; padding: 14px 0 4px; border-top: 1px solid #F3F4F6; }
  .gpt-stores-h { font-size: 14px; font-weight: 700; color: #111; margin: 0 0 4px; }
  .gpt-stores-sub { font-size: 12px; color: #9CA3AF; margin: 0 0 10px; line-height: 1.4; }
  .gpt-store-list { display: flex; flex-direction: column; gap: 8px; margin: 0 0 10px; }
  .gpt-store-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #F9FAFB; border-radius: 10px; }
  .gpt-store-plat { flex-shrink: 0; font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #B5202A; background: #F9EAE4; padding: 3px 7px; border-radius: 999px; }
  .gpt-store-url { flex: 1; min-width: 0; font-size: 12px; color: #374151; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gpt-store-url:hover { text-decoration: underline; }
  .gpt-store-del { flex-shrink: 0; border: 0; background: none; color: #9CA3AF; font-size: 12px; font-weight: 700; cursor: pointer; padding: 4px; }
  .gpt-store-del:hover { color: #C0392B; }
  .gpt-store-empty { font-size: 12px; color: #9CA3AF; margin: 0 0 10px; }
  .gpt-store-add { display: flex; gap: 8px; }
  .gpt-store-add input { flex: 1; min-width: 0; padding: 8px 12px; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 13px; }
  .gpt-store-add input:focus { outline: none; border-color: #111; }
  .gpt-store-add button { flex-shrink: 0; border: 0; background: #111; color: #fff; border-radius: 8px; padding: 8px 12px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .gpt-pv-stores { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
  .gpt-pv-store { font-size: 12px; font-weight: 700; color: #B5202A; text-decoration: none; background: #F9EAE4; padding: 5px 10px; border-radius: 999px; }
  .gpt-pv-msg { margin-top: 20px; }
  .gpt-pv-msg-form { margin-top: 10px; }
  .gpt-pv-msg-form textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; resize: vertical; font: inherit; }
  .gpt-inbox { margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; }
  .gpt-inbox-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 8px; }
  .gpt-inbox-item { padding: 8px 0; border-bottom: 1px solid #F3F4F6; font-size: 13px; }
  .gpt-inbox-item:last-child { border-bottom: none; }
  .gpt-inbox-from { font-weight: 600; color: #111; }
  .gpt-inbox-date { color: #9CA3AF; font-size: 11px; margin-left: 6px; }
  .gpt-inbox-body { color: #374151; margin-top: 2px; }
  .gpt-inbox-empty { color: #9CA3AF; font-size: 13px; }
</style><div class="gpt-card">${content}</div>`;
  }

  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'gpt-status ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
  }

  /* ---------- close ---------- */

  function close() {
    if (!isOpen || !modalRoot) return;
    isOpen = false;
    modalRoot.style.display = 'none';
    document.removeEventListener('keydown', handleKey);
  }

  /* ---------- render states ---------- */

  function renderState(html) {
    const root = getRoot();
    root.innerHTML = html;
    root.style.display = 'flex';
    isOpen = true;
    document.addEventListener('keydown', handleKey);
  }

  function showLoading() {
    renderState(modalHTML('<div class="gpt-status info">Memuat profil...</div>'));
  }

  function renderLoginRequired() {
    const html = modalHTML('<button class="gpt-close js-close-btn">' + closeSVG + '</button><div class="gpt-status info">Kamu harus login dulu.</div>');
    renderState(html);
    const closeBtn = getRoot().querySelector('.js-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  /* ---------- file upload ---------- */

  function setupUpload(fileInput) {
    fileInput.addEventListener('change', async function () {
      const file = fileInput.files[0];
      if (!file) return;

      const maxBytes = 2 * 1024 * 1024;
      if (file.size > maxBytes) {
        showStatus('Ukuran file maksimal 2 MB.', 'error');
        return;
      }

      showStatus('Mengunggah foto...', 'info');

      try {
        const path = `headshots/${userId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('profile-headshots')
          .upload(path, file, { upsert: true, cacheControl: '3600' });

        if (uploadError) throw uploadError;

        // v2 client returns { data: { publicUrl } } (lowercase "url", nested
        // under data) -- the old v1 shape { publicURL } silently resolves to
        // undefined here, saving a broken image URL with no error surfaced.
        const { data: pub } = supabase.storage
          .from('profile-headshots')
          .getPublicUrl(path);
        const publicUrl = pub && pub.publicUrl;

        currentRow.headshot_url = publicUrl;
        imgPreview.src = publicUrl;
        imgPreview.style.display = 'block';
        initialsFallback.style.display = 'none';
        showStatus('Foto berhasil diunggah.', 'success');
        if (toast) toast('Foto berhasil diunggah.');
        if (typeof onProfileChanged === 'function') onProfileChanged(currentRow);
      } catch (err) {
        showStatus('Gagal mengunggah foto.', 'error');
      }
    });
  }

  /* ---------- save ---------- */

  async function saveProfile() {
    const root = getRoot();
    const display_name = root.querySelector('.js-display-name').value.trim();
    const public_whatsapp = root.querySelector('.js-whatsapp').value.trim();
    const public_email = root.querySelector('.js-email').value.trim();
    const bio = root.querySelector('.js-bio').value.trim();

    const payload = {
      user_id: userId,
      display_name: display_name || null,
      public_whatsapp: public_whatsapp || null,
      public_email: public_email || null,
      bio: bio || null,
      is_public: true,
      headshot_url: currentRow.headshot_url || null,
    };

    showStatus('Menyimpan profil...', 'info');
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .maybeSingle();

      if (error) throw error;
      currentRow = data;
      showStatus('Profil tersimpan.', 'success');
      if (toast) toast('Profil tersimpan.');
      if (typeof onProfileChanged === 'function') onProfileChanged(currentRow);

      setTimeout(() => {
        close();
      }, 1000);
    } catch (err) {
      showStatus('Gagal menyimpan profil. Coba lagi.', 'error');
    }
  }

  /* ---------- load profile ---------- */

  async function loadProfile() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      currentRow = data || {};
      renderForm();
    } catch (err) {
      const html = modalHTML(
        `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
        '<div class="gpt-status error">Gagal memuat profil. Coba lagi.</div>'
      );
      renderState(html);
      const closeBtn = getRoot().querySelector('.js-close-btn');
      if (closeBtn) closeBtn.addEventListener('click', close);
    }
  }

  function rpcErrorMessage(err) {
    const raw = (err && (err.message || err.details || err.hint)) || '';
    return raw.replace(/^.*error:\s*/i, '').replace(/\s+$/, '') || 'Terjadi kesalahan. Coba lagi.';
  }

  async function loadStores() {
    storeLinks = [];
    if (!supabase || !userId) return;
    try {
      const { data, error } = await supabase
        .from('student_account')
        .select('id,platform,handle,url')
        .eq('student_id', userId)
        .eq('kind', 'shop')
        .eq('active', true)
        .order('created_at', { ascending: true });
      if (error) throw error;
      storeLinks = data || [];
    } catch (err) {
      storeLinks = [];
    }
    renderStoreList();
  }

  function renderStoreList() {
    const root = getRoot();
    const list = root.querySelector('#gpt-store-list');
    const empty = root.querySelector('#gpt-store-empty');
    if (!list) return;
    if (!storeLinks.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = storeLinks.map((s) => {
      const label = STORE_PLATFORMS[s.platform] || s.platform;
      const href = esc(s.url || '');
      const shown = esc(s.handle || s.url || '');
      return '<div class="gpt-store-item">' +
        '<span class="gpt-store-plat">' + esc(label) + '</span>' +
        '<a class="gpt-store-url" href="' + href + '" target="_blank" rel="noopener noreferrer">' + shown + '</a>' +
        '<button type="button" class="gpt-store-del js-store-del" data-id="' + esc(s.id) + '">Hapus</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.js-store-del').forEach((btn) => {
      btn.addEventListener('click', () => { void unlinkStore(btn.getAttribute('data-id')); });
    });
  }

  async function linkStore() {
    const root = getRoot();
    const input = root.querySelector('.js-store-url');
    const url = (input && input.value || '').trim();
    if (!url) { showStatus('Tempel tautan tokomu dulu.', 'error'); return; }
    showStatus('Menyimpan toko...', 'info');
    try {
      const { error } = await supabase.rpc('ssis_link_shop', { p_url: url });
      if (error) throw error;
      if (input) input.value = '';
      showStatus('Toko tersimpan.', 'success');
      if (toast) toast('Toko tersimpan.');
      await loadStores();
    } catch (err) {
      showStatus(rpcErrorMessage(err), 'error');
    }
  }

  async function unlinkStore(id) {
    if (!id) return;
    showStatus('Menghapus toko...', 'info');
    try {
      const { error } = await supabase.rpc('ssis_unlink_shop', { p_id: id });
      if (error) throw error;
      showStatus('Toko dihapus.', 'success');
      await loadStores();
    } catch (err) {
      showStatus(rpcErrorMessage(err), 'error');
    }
  }

  function storesEditorHtml() {
    return '<div class="gpt-stores">' +
      '<p class="gpt-stores-h">Toko marketplace</p>' +
      '<p class="gpt-stores-sub">Tempel tautan toko Shopee, Tokopedia, TikTok Shop, Lazada, atau Blibli. Boleh lebih dari satu — ini yang dipakai program LARISE untuk mengikuti tokomu.</p>' +
      '<div id="gpt-store-list" class="gpt-store-list"></div>' +
      '<p id="gpt-store-empty" class="gpt-store-empty">Belum ada toko. Tempel tautannya di bawah.</p>' +
      '<div class="gpt-store-add">' +
        '<input type="url" class="js-store-url" maxlength="400" placeholder="https://shopee.co.id/namatoko" enterkeyhint="done">' +
        '<button type="button" class="js-store-add">Tambah</button>' +
      '</div>' +
    '</div>';
  }

  function publicStoresHtml(row) {
    const links = Array.isArray(row.store_links) ? row.store_links : [];
    if (links.length) {
      return '<div class="gpt-pv-stores">' + links.map((s) => {
        const label = STORE_PLATFORMS[s.platform] || s.platform;
        return '<a class="gpt-pv-store" href="' + esc(s.url || '#') + '" target="_blank" rel="noopener noreferrer">' +
          esc(label) + (s.handle ? ' · ' + esc(s.handle) : '') + '</a>';
      }).join('') + '</div>';
    }
    if (row.shopee_store_url) {
      return '<a class="gpt-pv-shopee" href="' + esc(row.shopee_store_url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(row.shopee_store_name || 'Toko Shopee') + '</a>';
    }
    return '';
  }

  const VERIFIED_BADGE_KEYS = {
    first_listing: 1, first_sale_verified: 1, first_review: 1,
    lima_produk: 1, sepuluh_terjual: 1, dua_toko: 1,
  };

  function publicBadgesHtml(row) {
    const badges = Array.isArray(row.badges) ? row.badges : [];
    if (!badges.length) return '';
    return '<div class="gpt-pv-badges">' + badges.map((b) => {
      const verified = VERIFIED_BADGE_KEYS[b.key]
        ? '<span class="gpt-pv-badge-v">dari toko</span>' : '';
      return '<span class="gpt-pv-badge">' + esc(b.title || b.key) + verified + '</span>';
    }).join('') + '</div>';
  }

  /* ---------- inbox (basic: flat list, no threads/reply-in-place) ---------- */

  async function loadInbox() {
    const box = getRoot().querySelector('#gpt-inbox-root');
    if (!box || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('user_messages_inbox')
        .select('id, from_first_name, from_city, body, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = data || [];
      if (!rows.length) {
        box.innerHTML = '<div class="gpt-inbox-title">Pesan masuk</div><div class="gpt-inbox-empty">Belum ada pesan.</div>';
        return;
      }
      box.innerHTML = '<div class="gpt-inbox-title">Pesan masuk</div>' + rows.map((m) => {
        const from = esc(m.from_first_name || 'Pengguna LarisID') + (m.from_city ? ' - ' + esc(m.from_city) : '');
        const date = new Date(m.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        return '<div class="gpt-inbox-item"><span class="gpt-inbox-from">' + from + '</span>' +
          '<span class="gpt-inbox-date">' + date + '</span>' +
          '<div class="gpt-inbox-body">' + esc(m.body) + '</div></div>';
      }).join('');
    } catch (err) {
      box.innerHTML = '<div class="gpt-inbox-title">Pesan masuk</div><div class="gpt-inbox-empty">Gagal memuat pesan.</div>';
    }
  }

  /* ---------- form render ---------- */

  function renderForm() {
    const formHTML = modalHTML(
      '<div class="gpt-sheet-handle"></div>' +
      `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
      '<div class="gpt-sheet-head">' +
        '<h2 class="gpt-sheet-title">Edit Profil</h2>' +
        '<p class="gpt-sheet-sub">Ketuk kolom di bawah untuk mengubah. Perubahan tersimpan setelah kamu tekan Simpan.</p>' +
      '</div>' +
      '<div class="gpt-sheet-hero">' +
        '<div class="gpt-sheet-avatar-wrap">' +
          '<div class="gpt-avatar-wrap">' +
            '<img class="gpt-avatar-img js-avatar-img" alt="" />' +
            '<div class="gpt-avatar-fallback js-avatar-fallback"></div>' +
          '</div>' +
          `<label for="gpt-file-input" class="gpt-avatar-camera-badge">${cameraSVG.replace('width="24" height="24"', '')}</label>` +
          '<input type="file" id="gpt-file-input" accept="image/*" class="js-file-input" hidden />' +
        '</div>' +
        quotaHtml() +
      '</div>' +
      '<div class="gpt-rows">' +
        rowHtml('name', 'Nama tampilan', '<input type="text" class="gpt-row-input js-display-name" maxlength="80" placeholder="Ketik nama kamu" aria-label="Nama tampilan">') +
        rowHtml('whatsapp', 'WhatsApp (publik)', '<input type="text" class="gpt-row-input js-whatsapp" maxlength="32" placeholder="+62…" aria-label="WhatsApp publik">') +
        rowHtml('email', 'Email (publik)', '<input type="email" class="gpt-row-input js-email" maxlength="120" placeholder="email@contoh.com" aria-label="Email publik">') +
        rowHtml('bio', 'Bio', '<textarea class="gpt-row-input js-bio" rows="2" maxlength="280" placeholder="Ceritakan sedikit tentang kamu" aria-label="Bio"></textarea>') +
      '</div>' +
      storesEditorHtml() +
      '<div class="gpt-actions"><button type="button" class="gpt-btn js-save-btn">Simpan Perubahan</button></div>' +
      '<div class="gpt-status js-status"></div>' +
      `<p class="gpt-disclaimer">${lockSVG}Informasi Anda aman dan hanya digunakan sesuai pengaturan profil.</p>` +
      (global.CWS_EXT_URL
        ? '<p class="gpt-ext-install"><a href="' + global.CWS_EXT_URL + '" target="_blank" rel="noopener">Pasang Extension Chrome</a> — omset &amp; tren tampil di halaman Shopee.</p>'
        : '') +
      '<div class="gpt-inbox" id="gpt-inbox-root"><div class="gpt-inbox-title">Pesan masuk</div><div class="gpt-inbox-empty">Memuat…</div></div>' +
      (onSignOut ? '<div class="gpt-signout"><button type="button" class="js-signout-btn">Keluar dari akun</button></div>' : '')
    );

    renderState(formHTML);

    const root = getRoot();

    const avatarImg = root.querySelector('.js-avatar-img');
    const avatarFB = root.querySelector('.js-avatar-fallback');
    const fileInput = root.querySelector('.js-file-input');
    const closeBtn = root.querySelector('.js-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    const nameInput = root.querySelector('.js-display-name');
    nameInput.value = currentRow.display_name || '';
    root.querySelector('.js-whatsapp').value = currentRow.public_whatsapp || '';

    let emailValue = currentRow.public_email;
    if (!emailValue && userEmail) emailValue = userEmail;
    root.querySelector('.js-email').value = emailValue || '';

    root.querySelector('.js-bio').value = currentRow.bio || '';

    // Whole row → focus field; focus/blur → red "editing" chrome so users
    // always know which field they're changing (Google/Instagram edit UX).
    root.querySelectorAll('.gpt-row').forEach((row) => {
      const field = row.querySelector('.gpt-row-input');
      if (!field) return;
      row.addEventListener('click', (e) => {
        if (e.target === field || field.contains(e.target)) return;
        field.focus();
      });
      field.addEventListener('focus', () => row.classList.add('is-editing'));
      field.addEventListener('blur', () => row.classList.remove('is-editing'));
    });

    if (currentRow.headshot_url) {
      avatarImg.src = currentRow.headshot_url;
      avatarImg.style.display = 'block';
      avatarFB.style.display = 'none';
    } else {
      const initials = getInitials(currentRow.display_name || '');
      avatarFB.textContent = initials;
      avatarFB.style.display = 'flex';
      avatarImg.style.display = 'none';
    }

    imgPreview = avatarImg;
    initialsFallback = avatarFB;
    statusEl = root.querySelector('.js-status');

    setupUpload(fileInput);

    loadInbox();
    void loadStores();
    root.querySelector('.js-store-add')?.addEventListener('click', () => { void linkStore(); });
    root.querySelector('.js-store-url')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); void linkStore(); }
    });

    root.querySelector('.js-save-btn').addEventListener('click', saveProfile);
    const signOutBtn = root.querySelector('.js-signout-btn');
    if (signOutBtn && onSignOut) {
      signOutBtn.addEventListener('click', () => { close(); onSignOut(); });
    }

    refreshUsage();

    // Land cursor in name so edit mode is unmistakable on open.
    requestAnimationFrame(() => {
      try {
        nameInput.focus();
        const len = nameInput.value.length;
        nameInput.setSelectionRange(len, len);
      } catch (_) {}
    });
  }

  /* ---------- public profile (read-only, someone else's) ---------- */

  function publicAvatarHtml(row) {
    const name = row.display_name || row.first_name || '';
    if (row.headshot_url) {
      return `<img class="gpt-avatar-img" style="display:block" src="${esc(row.headshot_url)}" alt="" />`;
    }
    return `<div class="gpt-avatar-fallback" style="display:flex">${esc(getInitials(name || '?'))}</div>`;
  }

  function renderPublicProfile(row, viewerId, openMessage) {
    const name = esc(row.display_name || row.first_name || 'Pengguna LarisID');
    const role = row.is_admin ? ' <span class="gpt-pv-role">Admin</span>' : '';
    const cityLine = row.city ? `<div class="gpt-pv-city">${esc(row.city)}</div>` : '';
    const bioLine = row.bio ? `<p class="gpt-pv-bio">${esc(row.bio)}</p>` : '';
    const storesLine = publicStoresHtml(row);
    const badgesLine = publicBadgesHtml(row);
    const canMessage = viewerId && viewerId !== row.user_id;
    const formOpen = !!(openMessage && canMessage);
    const html = modalHTML(
      `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
      '<div style="text-align:center">' +
        `<div class="gpt-avatar-wrap">${publicAvatarHtml(row)}</div>` +
        `<div class="gpt-pv-name">${name}${role}</div>` +
        cityLine +
      '</div>' +
      bioLine + storesLine + badgesLine +
      (canMessage
        ? '<div class="gpt-pv-msg" id="gpt-pv-msg-block">' +
            '<button type="button" class="gpt-btn js-msg-toggle" style="width:100%">Kirim Pesan</button>' +
            `<div class="gpt-pv-msg-form" style="display:${formOpen ? 'block' : 'none'}">` +
              '<textarea class="js-msg-input" rows="3" maxlength="2000" placeholder="Tulis pesan privat. Jangan tulis niche, supplier, atau margin."></textarea>' +
              '<div class="gpt-actions"><button type="button" class="gpt-btn js-msg-send">Kirim</button></div>' +
            '</div>' +
          '</div>'
        : '') +
      '<div class="gpt-status js-status"></div>'
    );
    renderState(html);
    const root = getRoot();
    root.querySelector('.js-close-btn')?.addEventListener('click', close);
    statusEl = root.querySelector('.js-status');

    const toggleBtn = root.querySelector('.js-msg-toggle');
    const form = root.querySelector('.gpt-pv-msg-form');
    if (toggleBtn && form) {
      toggleBtn.addEventListener('click', () => {
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
      });
    }
    root.querySelector('.js-msg-send')?.addEventListener('click', async () => {
      const input = root.querySelector('.js-msg-input');
      const body = (input?.value || '').trim();
      if (!body) { showStatus('Pesan tidak boleh kosong.', 'error'); return; }
      showStatus('Mengirim…', 'info');
      try {
        const { error } = await supabase.from('user_messages').insert({
          from_user_id: viewerId, to_user_id: row.user_id, body,
        });
        if (error) throw error;
        showStatus('Pesan terkirim.', 'success');
        if (toast) toast('Pesan terkirim.');
        if (input) input.value = '';
        if (form) form.style.display = 'none';
      } catch (err) {
        showStatus('Gagal mengirim pesan. Coba lagi.', 'error');
      }
    });
  }

  /** Read-only view of someone else's public profile — never fetches or
   * shows wa_number/contact_email/public_whatsapp/public_email; the RPC this
   * calls doesn't select those columns at all. */
  async function viewPublic(targetUserId, options) {
    const opts = options || {};
    supabase = opts.supabase;
    esc = opts.esc || function (s) { return s; };
    toast = opts.toast;

    if (!supabase || !targetUserId) return;
    // Looking at your own name/avatar opens the editable version instead.
    if (opts.currentUserId && targetUserId === opts.currentUserId) {
      open(opts.selfOpenOptions || { supabase, userId: targetUserId, userEmail: opts.userEmail, esc, toast });
      return;
    }

    showLoading();
    try {
      const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: targetUserId });
      if (error) throw error;
      const row = (data && data[0]) || null;
      if (!row) {
        const html = modalHTML(
          `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
          '<div class="gpt-status info">Profil privat atau belum dibuka. Kirim Pesan hanya jalan kalau seller ini menyalakan profil publik di akunnya.</div>'
        );
        renderState(html);
        getRoot().querySelector('.js-close-btn')?.addEventListener('click', close);
        return;
      }
      renderPublicProfile(row, opts.currentUserId || null, !!opts.openMessage);
    } catch (err) {
      const html = modalHTML(
        `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
        '<div class="gpt-status error">Gagal memuat profil. Coba lagi.</div>'
      );
      renderState(html);
      getRoot().querySelector('.js-close-btn')?.addEventListener('click', close);
      if (typeof opts.onError === 'function') opts.onError(err);
    }
  }

  /* ---------- public API ---------- */

  function open(options) {
    const opts = options || {};
    supabase = opts.supabase;
    userId = opts.userId;
    userEmail = opts.userEmail || '';
    esc = opts.esc || function (s) { return s; };
    toast = opts.toast;
    onSignOut = opts.onSignOut || null;
    onProfileChanged = opts.onProfileChanged || null;
    getUsage = typeof opts.getUsage === 'function' ? opts.getUsage : null;

    if (!supabase || !userId) {
      renderLoginRequired();
      return;
    }

    showLoading();
    loadProfile();
  }

  global.GptProfile = { open, close, viewPublic, refreshUsage };
})(window);
