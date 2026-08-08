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

  const closeSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const cameraSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';

  /* ---------- helpers ---------- */

  function getInitials(name) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p.charAt(0).toUpperCase()).join('');
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
    display: flex; align-items: center; justify-content: center; z-index:9999;
  }
  .gpt-card {
    background: #fff; border-radius: 8px; padding: 24px; max-width: 480px;
    width: 90%; max-height: 90vh; overflow-y: auto; position: relative;
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
  }
  .gpt-close {
    position: absolute; top: 12px; right: 12px;
    background: none; border: none; cursor: pointer; padding: 4px; line-height: 0;
  }
  .gpt-close svg { display: block; color: #555; }
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
  .gpt-actions { text-align: right; margin-top: 16px; }
  .gpt-btn {
    background: #1a73e8; color: #fff; border: none; padding: 8px 20px;
    border-radius: 6px; cursor: pointer; font-size: 14px;
  }
  .gpt-btn:hover { background: #1558b0; }
  .gpt-status { margin-top: 8px; font-size: 13px; min-height: 20px; }
  .gpt-status.error { color: #c62828; }
  .gpt-status.success { color: #2e7d32; }
  .gpt-status.info { color: #555; }
  .gpt-signout { text-align: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid #eee; }
  .gpt-signout button { background: none; border: none; color: #c62828; font-size: 13px; cursor: pointer; padding: 4px; }
  .gpt-pv-name { font-size: 18px; font-weight: 700; color: #111; margin-top: 4px; }
  .gpt-pv-city { font-size: 13px; color: #6B7280; margin-top: 2px; }
  .gpt-pv-bio { font-size: 14px; color: #374151; line-height: 1.5; margin: 16px 0 0; }
  .gpt-pv-shopee { display: inline-block; margin-top: 10px; font-size: 13px; color: #1a73e8; text-decoration: none; }
  .gpt-pv-shopee:hover { text-decoration: underline; }
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
    const public_shopee_url = root.querySelector('.js-shopee').value.trim();
    const bio = root.querySelector('.js-bio').value.trim();

    const payload = {
      user_id: userId,
      display_name: display_name || null,
      public_whatsapp: public_whatsapp || null,
      public_email: public_email || null,
      public_shopee_url: public_shopee_url || null,
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
      `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
      '<div style="text-align:center">' +
        '<div class="gpt-avatar-wrap">' +
          '<img class="gpt-avatar-img js-avatar-img" alt="" />' +
          '<div class="gpt-avatar-fallback js-avatar-fallback"></div>' +
        '</div>' +
      '</div>' +
      `<div class="gpt-field">` +
        `<label for="gpt-file-input" class="gpt-file-btn">${cameraSVG} Unggah foto</label>` +
        '<input type="file" id="gpt-file-input" accept="image/*" class="js-file-input" hidden />' +
      '</div>' +
      '<div class="gpt-field"><label>Nama tampilan</label><input type="text" class="js-display-name" maxlength="80" /></div>' +
      '<div class="gpt-field"><label>WhatsApp (publik)</label><input type="text" class="js-whatsapp" maxlength="32" /></div>' +
      '<div class="gpt-field"><label>Email (publik)</label><input type="email" class="js-email" maxlength="120" /></div>' +
      '<div class="gpt-field"><label>Toko Shopee (URL)</label><input type="url" class="js-shopee" maxlength="200" /></div>' +
      '<div class="gpt-field"><label>Bio</label><textarea class="js-bio" rows="3"></textarea></div>' +
      '<div class="gpt-actions"><button type="button" class="gpt-btn js-save-btn">Simpan</button></div>' +
      '<div class="gpt-status js-status"></div>' +
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

    root.querySelector('.js-display-name').value = currentRow.display_name || '';
    root.querySelector('.js-whatsapp').value = currentRow.public_whatsapp || '';
    root.querySelector('.js-shopee').value = currentRow.public_shopee_url || '';

    let emailValue = currentRow.public_email;
    if (!emailValue && userEmail) emailValue = userEmail;
    root.querySelector('.js-email').value = emailValue || '';

    root.querySelector('.js-bio').value = currentRow.bio || '';

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

    root.querySelector('.js-save-btn').addEventListener('click', saveProfile);
    const signOutBtn = root.querySelector('.js-signout-btn');
    if (signOutBtn && onSignOut) {
      signOutBtn.addEventListener('click', () => { close(); onSignOut(); });
    }
  }

  /* ---------- public profile (read-only, someone else's) ---------- */

  function publicAvatarHtml(row) {
    const name = row.display_name || row.first_name || '';
    if (row.headshot_url) {
      return `<img class="gpt-avatar-img" style="display:block" src="${esc(row.headshot_url)}" alt="" />`;
    }
    return `<div class="gpt-avatar-fallback" style="display:flex">${esc(getInitials(name || '?'))}</div>`;
  }

  function renderPublicProfile(row, viewerId) {
    const name = esc(row.display_name || row.first_name || 'Pengguna LarisID');
    const cityLine = row.city ? `<div class="gpt-pv-city">${esc(row.city)}</div>` : '';
    const bioLine = row.bio ? `<p class="gpt-pv-bio">${esc(row.bio)}</p>` : '';
    const shopeeLine = row.shopee_store_url
      ? `<a class="gpt-pv-shopee" href="${esc(row.shopee_store_url)}" target="_blank" rel="noopener noreferrer">${esc(row.shopee_store_name || 'Toko Shopee')}</a>`
      : '';
    const canMessage = viewerId && viewerId !== row.user_id;
    const html = modalHTML(
      `<button class="gpt-close js-close-btn">${closeSVG}</button>` +
      '<div style="text-align:center">' +
        `<div class="gpt-avatar-wrap">${publicAvatarHtml(row)}</div>` +
        `<div class="gpt-pv-name">${name}</div>` +
        cityLine +
      '</div>' +
      bioLine + shopeeLine +
      (canMessage
        ? '<div class="gpt-pv-msg" id="gpt-pv-msg-block">' +
            '<button type="button" class="gpt-btn js-msg-toggle" style="width:100%">Kirim Pesan</button>' +
            '<div class="gpt-pv-msg-form" style="display:none">' +
              '<textarea class="js-msg-input" rows="3" maxlength="2000" placeholder="Tulis pesan…"></textarea>' +
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
          '<div class="gpt-status info">Profil ini tidak tersedia.</div>'
        );
        renderState(html);
        getRoot().querySelector('.js-close-btn')?.addEventListener('click', close);
        return;
      }
      renderPublicProfile(row, opts.currentUserId || null);
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

    if (!supabase || !userId) {
      renderLoginRequired();
      return;
    }

    showLoading();
    loadProfile();
  }

  global.GptProfile = { open, close, viewPublic };
})(window);
