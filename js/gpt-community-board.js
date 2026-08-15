(function (global) {
  'use strict';

  let _opts;
  let _container;
  let _listEl;
  let _activeKind = 'all'; // all | feature | complaint
  let _posts = [];
  let _expandedPostIds = new Set();
  let _expandedBodyIds = new Set();
  let _commentsCache = {};

  const STATUS_META = {
    open: {
      label: 'Baru',
      cls: 'baru',
    },
    considering: {
      label: 'Dikerjakan',
      cls: 'considering',
    },
    done: {
      label: 'Selesai',
      cls: 'reviewed',
    },
  };

  const AVATAR_PALETTE = [
    '#DBEAFE', '#FCE7F3', '#E0E7FF', '#D1FAE5', '#FEF3C7', '#FDE68A', '#FBCFE8', '#CFFAFE',
  ];

  // ---------- helpers ----------

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      return '';
    }
  }

  function svgThumb(active) {
    const fill = active ? '#B5202A' : 'none';
    const stroke = active ? '#B5202A' : '#B5202A';
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`;
  }

  function svgComment() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }

  function svgSend() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  }

  function svgSparkle() {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2z"/></svg>`;
  }

  function svgPlus() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
  }

  function svgBulb() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>`;
  }

  function svgDots() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`;
  }

  function truncateBody(body, expanded) {
    if (expanded) return body;
    if (body.length > 220) return body.substring(0, 220) + '…';
    return body;
  }

  function bodyHtml(text) {
    return _opts.esc(text);
  }

  function authorDisplayName(row) {
    return row.author_first_name || 'Pengguna LarisID';
  }

  function avatarTone(name) {
    let h = 0;
    const s = String(name || '?');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
  }

  function avatarHtml(row, size) {
    const px = size || 28;
    const name = authorDisplayName(row);
    const letter = _opts.esc(name.charAt(0).toUpperCase());
    if (row.author_headshot_url) {
      return `<img class="msb-avatar" src="${_opts.esc(row.author_headshot_url)}" alt="" width="${px}" height="${px}" loading="lazy">`;
    }
    return `<span class="msb-avatar msb-avatar--letter" style="width:${px}px;height:${px}px;background:${avatarTone(name)}">${letter}</span>`;
  }

  function adminBadgeHtml(row) {
    if (!row.author_is_admin) return '';
    return `<span class="msb-role" title="Founder LarisID">Admin</span>`;
  }

  function authorTagHtml(row) {
    const name = _opts.esc(authorDisplayName(row));
    const badge = adminBadgeHtml(row);
    if (!row.author_id) {
      return `<span class="msb-author">${avatarHtml(row, 22)}<span class="msb-author-name">${name}</span>${badge}</span>`;
    }
    return `<button type="button" class="msb-author" data-action="open-profile" data-user-id="${_opts.esc(row.author_id)}">${avatarHtml(row, 22)}<span class="msb-author-name">${name}</span>${badge}</button>`;
  }

  function statusBadgeHtml(status) {
    const meta = STATUS_META[status] || STATUS_META.open;
    return `<span class="msb-status msb-status--${meta.cls}">${svgSparkle()} ${_opts.esc(meta.label)}</span>`;
  }

  function isOwn(authorId) {
    return !!authorId && authorId === _opts.currentUserId;
  }

  function isAdmin() {
    return typeof _opts.isAdmin === 'function' ? !!_opts.isAdmin() : !!_opts.isAdmin;
  }

  function canManage(authorId) {
    return isOwn(authorId) || isAdmin();
  }

  function statusControlHtml(post) {
    if (!isAdmin()) return statusBadgeHtml(post.status);
    const current = STATUS_META[post.status] ? post.status : 'open';
    const meta = STATUS_META[current];
    const opts = Object.keys(STATUS_META)
      .map((key) => {
        const m = STATUS_META[key];
        return `<option value="${key}" ${key === current ? 'selected' : ''}>${_opts.esc(m.label)}</option>`;
      })
      .join('');
    return `<label class="msb-status-wrap">
      <select class="msb-status-select msb-status--${meta.cls}" data-action="set-status" data-post-id="${post.id}" aria-label="Ubah status">
        ${opts}
      </select>
    </label>`;
  }

  function postMenuHtml(post) {
    if (!canManage(post.author_id)) {
      return `<button type="button" class="msb-more" aria-hidden="true" tabindex="-1">${svgDots()}</button>`;
    }
    return `<div class="msb-menu">
      <button type="button" class="msb-more" data-action="toggle-menu" data-post-id="${post.id}" aria-label="Opsi">${svgDots()}</button>
      <div class="msb-menu-pop" hidden>
        <button type="button" data-action="edit-post" data-post-id="${post.id}">Edit</button>
        <button type="button" class="msb-menu-danger" data-action="delete-post" data-post-id="${post.id}">Hapus</button>
      </div>
    </div>`;
  }

  function notifyAuthor(payload) {
    if (!_opts.supabase || typeof _opts.supabase.functions?.invoke !== 'function') return;
    _opts.supabase.functions.invoke('notify-feature-board', { body: payload })
      .then(({ error }) => { if (error) console.warn('notify-feature-board:', error.message); })
      .catch(() => {});
  }

  function kindChipHtml(kind) {
    const label = kind === 'complaint' ? 'Keluhan' : 'Fitur';
    const cls = kind === 'complaint' ? 'complaint' : 'feature';
    return `<span class="msb-kind msb-kind--${cls}">${svgPlus()} ${_opts.esc(label)}</span>`;
  }

  function showLoading(show) {
    const el = _container && _container.querySelector('#msb-loading');
    if (el) el.hidden = !show;
  }

  function updateLikeDisplay(postId, liked, count) {
    const btn = _listEl && _listEl.querySelector(`.msb-vote[data-post-id="${postId}"]`);
    if (!btn) return;
    btn.classList.toggle('is-liked', !!liked);
    btn.innerHTML = `${svgThumb(!!liked)}<span class="msb-vote-count">${count}</span><span class="msb-vote-label">Dukung</span>`;
  }

  function updateCommentCountDisplay(postId, count) {
    const el = _listEl && _listEl.querySelector(`.msb-comments-count[data-post-id="${postId}"]`);
    if (!el) return;
    el.innerHTML = `${svgComment()} ${count} komentar`;
  }

  function renderCommentsForPost(postId) {
    const section = _listEl && _listEl.querySelector(`[data-comments-for="${postId}"]`);
    if (!section) return;
    const comments = _commentsCache[postId] || [];
    const list = section.querySelector('.msb-comments-list');
    if (!list) return;
    list.innerHTML = comments
      .map((c) => {
        const manage = canManage(c.author_id)
          ? `<span class="msb-comment-actions">
              <button type="button" data-action="edit-comment" data-post-id="${postId}" data-comment-id="${c.id}">Edit</button>
              <button type="button" data-action="delete-comment" data-post-id="${postId}" data-comment-id="${c.id}">Hapus</button>
            </span>`
          : '';
        return `<div class="msb-comment" data-comment-id="${c.id}">${authorTagHtml(c)}<span class="msb-comment-body">${_opts.esc(c.body)}</span><span class="msb-comment-date">${formatDate(c.created_at)}</span>${manage}</div>`;
      })
      .join('');
  }

  async function loadComments(postId) {
    if (_commentsCache[postId]) {
      renderCommentsForPost(postId);
      return;
    }
    const { data, error } = await _opts.supabase
      .from('feature_request_comments')
      .select('id, author_id, author_first_name, author_city, author_headshot_url, author_is_admin, body, created_at')
      .eq('request_id', postId)
      .order('created_at', { ascending: true });
    if (error) return;
    _commentsCache[postId] = data || [];
    renderCommentsForPost(postId);
  }

  // Independent of toggleComments — a long usulan body shouldn't force the
  // comment thread open just to read the rest of it.
  function toggleBody(postId) {
    const post = _posts.find((p) => p.id === postId);
    const card = _listEl && _listEl.querySelector(`.msb-card[data-post-id="${postId}"]`);
    if (!post || !card) return;
    if (_expandedBodyIds.has(postId)) _expandedBodyIds.delete(postId);
    else _expandedBodyIds.add(postId);
    const nowExpanded = _expandedBodyIds.has(postId);
    const bodyEl = card.querySelector('.msb-body');
    const toggleBtn = card.querySelector('.msb-body-toggle');
    if (bodyEl) bodyEl.innerHTML = bodyHtml(truncateBody(post.body || '', nowExpanded));
    if (toggleBtn) toggleBtn.textContent = nowExpanded ? 'Sembunyikan' : 'Baca selengkapnya';
  }

  function toggleComments(postId) {
    const section = _listEl && _listEl.querySelector(`[data-comments-for="${postId}"]`);
    if (!section) return;
    if (_expandedPostIds.has(postId)) {
      section.hidden = true;
      _expandedPostIds.delete(postId);
    } else {
      section.hidden = false;
      _expandedPostIds.add(postId);
      loadComments(postId);
    }
  }

  async function toggleLike(postId) {
    const post = _posts.find((p) => p.id === postId);
    if (!post) return;
    const wasLiked = post.liked_by_me;
    const prevCount = post.like_count;
    post.liked_by_me = !wasLiked;
    post.like_count = wasLiked ? prevCount - 1 : prevCount + 1;
    updateLikeDisplay(postId, post.liked_by_me, post.like_count);
    let error;
    if (wasLiked) {
      const res = await _opts.supabase
        .from('feature_request_likes')
        .delete()
        .eq('request_id', postId)
        .eq('user_id', _opts.currentUserId);
      error = res.error;
    } else {
      const res = await _opts.supabase
        .from('feature_request_likes')
        .insert({ request_id: postId, user_id: _opts.currentUserId });
      error = res.error;
    }
    if (error) {
      post.liked_by_me = wasLiked;
      post.like_count = prevCount;
      updateLikeDisplay(postId, post.liked_by_me, post.like_count);
      _opts.toast('Gagal memperbarui dukungan. Coba lagi.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
    }
  }

  async function addComment(postId, body) {
    if (!body.trim()) {
      _opts.toast('Komentar tidak boleh kosong.');
      return;
    }
    const { data, error } = await _opts.supabase
      .from('feature_request_comments')
      .insert({
        author_id: _opts.currentUserId,
        request_id: postId,
        body: body.trim(),
      })
      .select('id, author_id, author_first_name, author_city, author_headshot_url, author_is_admin, body, created_at')
      .single();
    if (error) {
      _opts.toast('Gagal mengirim komentar. Coba lagi.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    if (!_commentsCache[postId]) _commentsCache[postId] = [];
    _commentsCache[postId].push(data);
    renderCommentsForPost(postId);
    const post = _posts.find((p) => p.id === postId);
    if (post) {
      post.comment_count = (post.comment_count || 0) + 1;
      updateCommentCountDisplay(postId, post.comment_count);
      if (post.author_id !== _opts.currentUserId) {
        notifyAuthor({ kind: 'comment', request_id: postId, comment_id: data.id });
      }
    }
  }

  async function setPostStatus(postId, status) {
    if (!STATUS_META[status]) return;
    const post = _posts.find((p) => p.id === postId);
    const prev = post && post.status;
    if (post) post.status = status;
    const { error } = await _opts.supabase
      .from('feature_requests')
      .update({ status })
      .eq('id', postId);
    if (error) {
      if (post) post.status = prev;
      _opts.toast('Gagal mengubah status.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      renderPosts();
      return;
    }
    renderPosts();
    if (status === 'done' && post && post.author_id !== _opts.currentUserId) {
      notifyAuthor({ kind: 'resolved', request_id: postId });
    }
  }

  async function deletePost(postId) {
    if (!confirm('Hapus usulan ini? Komentar ikut terhapus.')) return;
    const { error } = await _opts.supabase.from('feature_requests').delete().eq('id', postId);
    if (error) {
      _opts.toast('Gagal menghapus.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    _posts = _posts.filter((p) => p.id !== postId);
    delete _commentsCache[postId];
    renderPosts();
  }

  async function savePostEdit(postId, title, body) {
    const t = (title || '').trim();
    const b = (body || '').trim();
    if (!t || !b) {
      _opts.toast('Judul dan deskripsi harus diisi.');
      return;
    }
    const { error } = await _opts.supabase
      .from('feature_requests')
      .update({ title: t, body: b })
      .eq('id', postId);
    if (error) {
      _opts.toast('Gagal menyimpan.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    const post = _posts.find((p) => p.id === postId);
    if (post) {
      post.title = t;
      post.body = b;
    }
    renderPosts();
  }

  function startPostEdit(postId) {
    const post = _posts.find((p) => p.id === postId);
    const card = _listEl && _listEl.querySelector(`.msb-card[data-post-id="${postId}"]`);
    if (!post || !card) return;
    const main = card.querySelector('.msb-card-main');
    if (!main) return;
    const titleEl = main.querySelector('.msb-title');
    const bodyEl = main.querySelector('.msb-body');
    if (!titleEl || !bodyEl) return;
    titleEl.outerHTML = `<input class="msb-edit-title" data-edit-title="${postId}" value="${_opts.esc(post.title)}" maxlength="120">`;
    bodyEl.outerHTML = `<textarea class="msb-edit-body" data-edit-body="${postId}" maxlength="4000">${_opts.esc(post.body || '')}</textarea>
      <div class="msb-edit-actions">
        <button type="button" class="msb-btn-ghost" data-action="cancel-edit-post" data-post-id="${postId}">Batal</button>
        <button type="button" class="msb-btn-primary" data-action="save-post" data-post-id="${postId}">Simpan</button>
      </div>`;
    const toggle = main.querySelector('.msb-body-toggle');
    if (toggle) toggle.remove();
  }

  async function deleteComment(postId, commentId) {
    if (!confirm('Hapus komentar ini?')) return;
    const { error } = await _opts.supabase.from('feature_request_comments').delete().eq('id', commentId);
    if (error) {
      _opts.toast('Gagal menghapus komentar.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    _commentsCache[postId] = (_commentsCache[postId] || []).filter((c) => c.id !== commentId);
    renderCommentsForPost(postId);
    const post = _posts.find((p) => p.id === postId);
    if (post) {
      post.comment_count = Math.max(0, (post.comment_count || 0) - 1);
      updateCommentCountDisplay(postId, post.comment_count);
    }
  }

  async function saveCommentEdit(postId, commentId, body) {
    const b = (body || '').trim();
    if (!b) {
      _opts.toast('Komentar tidak boleh kosong.');
      return;
    }
    const { error } = await _opts.supabase
      .from('feature_request_comments')
      .update({ body: b })
      .eq('id', commentId);
    if (error) {
      _opts.toast('Gagal menyimpan komentar.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    const comments = _commentsCache[postId] || [];
    const row = comments.find((c) => c.id === commentId);
    if (row) row.body = b;
    renderCommentsForPost(postId);
  }

  function startCommentEdit(postId, commentId) {
    const el = _listEl && _listEl.querySelector(`.msb-comment[data-comment-id="${commentId}"]`);
    const comments = _commentsCache[postId] || [];
    const row = comments.find((c) => c.id === commentId);
    if (!el || !row) return;
    const bodyEl = el.querySelector('.msb-comment-body');
    if (!bodyEl) return;
    bodyEl.outerHTML = `<span class="msb-comment-edit">
      <input type="text" class="msb-comment-edit-input" value="${_opts.esc(row.body)}" maxlength="2000" data-comment-id="${commentId}">
      <button type="button" data-action="save-comment" data-post-id="${postId}" data-comment-id="${commentId}">Simpan</button>
      <button type="button" data-action="cancel-edit-comment" data-post-id="${postId}">Batal</button>
    </span>`;
    el.querySelector('.msb-comment-edit-input')?.focus();
  }

  function closeMenus(except) {
    _listEl && _listEl.querySelectorAll('.msb-menu-pop').forEach((pop) => {
      if (pop !== except) pop.hidden = true;
    });
  }

  async function fetchPosts() {
    if (!_listEl) return;
    _listEl.innerHTML = '';
    showLoading(true);
    let q = _opts.supabase
      .from('feature_requests_feed')
      .select('*')
      .order('like_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (_activeKind !== 'all') q = q.eq('kind', _activeKind);
    const { data, error } = await q;
    showLoading(false);
    if (error) {
      _opts.toast('Gagal memuat. Coba lagi.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    _posts = data || [];
    renderPosts();
  }

  function renderPosts() {
    if (!_listEl) return;
    _listEl.innerHTML = '';
    if (_posts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'msb-empty';
      empty.textContent = 'Belum ada usulan. Jadi yang pertama!';
      _listEl.appendChild(empty);
      return;
    }
    _posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'msb-card';
      card.dataset.postId = post.id;
      const isExpanded = _expandedPostIds.has(post.id);
      const rawBody = post.body || '';
      const bodyExpanded = _expandedBodyIds.has(post.id);
      const bodyText = truncateBody(rawBody, bodyExpanded);
      const needsBodyToggle = rawBody.length > 220;
      const commentLabel = `${post.comment_count || 0} komentar`;
      card.innerHTML = `
        <button type="button" class="msb-vote ${post.liked_by_me ? 'is-liked' : ''}" data-action="like" data-post-id="${post.id}" aria-label="Dukung usulan">
          ${svgThumb(!!post.liked_by_me)}
          <span class="msb-vote-count">${post.like_count || 0}</span>
          <span class="msb-vote-label">Dukung</span>
        </button>
        <div class="msb-card-main">
          <div class="msb-card-top">
            <h3 class="msb-title">${_opts.esc(post.title)}</h3>
            <div class="msb-card-aside">
              ${statusControlHtml(post)}
              ${postMenuHtml(post)}
            </div>
          </div>
          <div class="msb-meta">
            ${authorTagHtml(post)}
            <span class="msb-dot">·</span>
            <span class="msb-date">${formatDate(post.created_at)}</span>
          </div>
          <p class="msb-body">${bodyHtml(bodyText)}</p>
          ${needsBodyToggle ? `<button type="button" class="msb-body-toggle" data-action="toggle-body" data-post-id="${post.id}">${bodyExpanded ? 'Sembunyikan' : 'Baca selengkapnya'}</button>` : ''}
          <div class="msb-card-foot">
            ${kindChipHtml(post.kind)}
            <button type="button" class="msb-comments-count" data-action="toggle-comments" data-post-id="${post.id}">
              ${svgComment()} ${commentLabel}
            </button>
          </div>
          <div class="msb-comments" data-comments-for="${post.id}" ${isExpanded ? '' : 'hidden'}>
            <div class="msb-comments-list"></div>
            <div class="msb-comment-form">
              <input type="text" class="msb-comment-input" placeholder="Tulis komentar…" data-post-id="${post.id}">
              <button type="button" class="msb-comment-send" data-action="send-comment" data-post-id="${post.id}">${svgSend()}</button>
            </div>
          </div>
        </div>
      `;
      _listEl.appendChild(card);
      if (isExpanded) loadComments(post.id);
    });
  }

  async function submitPost() {
    const titleInput = _container.querySelector('#msb-title');
    const bodyInput = _container.querySelector('#msb-body');
    const kindSelect = _container.querySelector('#msb-kind');
    if (!titleInput || !bodyInput) return;
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    const kind = (kindSelect && kindSelect.value) || 'feature';
    if (!title || !body) {
      _opts.toast('Judul dan deskripsi harus diisi.');
      return;
    }
    const { error } = await _opts.supabase.from('feature_requests').insert({
      author_id: _opts.currentUserId,
      kind,
      title,
      body,
    });
    if (error) {
      _opts.toast('Gagal mengirim. Coba lagi.');
      if (typeof _opts.onError === 'function') _opts.onError(error);
      return;
    }
    _opts.toast('Berhasil dikirim. Terima kasih!');
    titleInput.value = '';
    bodyInput.value = '';
    closeForm();
    fetchPosts();
  }

  function openForm() {
    const panel = _container.querySelector('#msb-form-panel');
    if (panel) {
      panel.hidden = false;
      _container.querySelector('#msb-title')?.focus();
    }
  }

  function closeForm() {
    const panel = _container.querySelector('#msb-form-panel');
    if (panel) panel.hidden = true;
  }

  function switchKind(kind) {
    _activeKind = kind;
    _container.querySelectorAll('.msb-filter').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.kind === kind);
    });
    _posts = [];
    fetchPosts();
  }

  function injectStyles() {
    if (document.getElementById('gpt-community-board-style')) {
      document.getElementById('gpt-community-board-style').remove();
    }
    const style = document.createElement('style');
    style.id = 'gpt-community-board-style';
    style.textContent = `
      #msb, #msb * { box-sizing: border-box; }
      #msb {
        --msb-red: #B5202A;
        --msb-red-soft: #FFF1F2;
        --msb-ink: #111827;
        --msb-muted: #6B7280;
        --msb-line: #E5E7EB;
        --msb-bg: #F9FAFB;
        color: var(--msb-ink);
        font-family: inherit;
        max-width: 920px;
      }
      /* Top hero: title+CTA left, Garuda right. Waist hangs into the white
         panel below so the card edge cuts the torso for a 3D pop. */
      .msb-hero {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px 20px;
        margin: 0 0 0;
        position: relative;
        z-index: 0;
      }
      .msb-hero-text {
        flex: 1 1 auto;
        min-width: 0;
        align-self: center;
        padding: 8px 0 22px;
      }
      .msb-hero-text h2 {
        margin: 0 0 8px;
        font-size: clamp(1.7rem, 3vw, 2.15rem);
        font-weight: 800;
        letter-spacing: -.03em;
        color: #0f172a;
        line-height: 1.15;
      }
      .msb-hero-text p {
        margin: 0 0 16px;
        color: var(--msb-muted);
        font-size: .95rem;
        line-height: 1.5;
        max-width: 42ch;
      }
      .msb-hero-mascot {
        flex: 0 0 auto;
        display: block;
        align-self: flex-end;
        margin: 0 -6px -42px 0;
        line-height: 0;
        pointer-events: none;
        user-select: none;
        position: relative;
        z-index: 0;
      }
      .msb-hero-mascot img {
        display: block;
        width: 280px;
        height: auto;
      }
      .msb-panel {
        position: relative;
        z-index: 1;
        background: #fff;
        border: 1px solid var(--msb-line);
        border-radius: 22px;
        padding: 18px 20px 22px;
        box-shadow: 0 1px 2px rgba(0,0,0,.03);
      }
      .msb-toolbar {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        flex-wrap: wrap; margin-bottom: 14px;
      }
      .msb-filters { display: flex; gap: 8px; flex-wrap: wrap; }
      .msb-filter {
        border: 1px solid #D1D5DB; background: #fff; color: #374151;
        padding: 7px 14px; border-radius: 999px; font-size: .875rem; font-weight: 600;
        cursor: pointer;
      }
      .msb-filter.is-active {
        background: var(--msb-red); border-color: var(--msb-red); color: #fff;
      }
      .msb-btn-primary {
        display: inline-flex; align-items: center; gap: 6px;
        background: var(--msb-red); color: #fff; border: none;
        padding: 10px 18px; border-radius: 999px; font-size: .9rem; font-weight: 700;
        cursor: pointer; white-space: nowrap;
      }
      .msb-btn-primary:hover { filter: brightness(.96); }
      .msb-form {
        border: 1px solid var(--msb-line); border-radius: 14px; background: #fff;
        padding: 14px; margin-bottom: 14px;
      }
      .msb-form input, .msb-form textarea, .msb-form select {
        width: 100%; border: 1px solid #D1D5DB; border-radius: 10px;
        padding: 9px 11px; font-size: .9rem; margin-bottom: 8px; font: inherit;
      }
      .msb-form textarea { min-height: 90px; resize: vertical; }
      .msb-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
      .msb-btn-ghost {
        background: #F3F4F6; color: #374151; border: none; padding: 8px 14px;
        border-radius: 999px; cursor: pointer; font-weight: 600;
      }
      .msb-loading, .msb-empty {
        text-align: center; color: var(--msb-muted); padding: 28px 12px; font-size: .95rem;
      }
      .msb-list { display: flex; flex-direction: column; gap: 12px; }
      .msb-card {
        display: grid; grid-template-columns: 72px 1fr; gap: 4px 10px;
        background: #fff; border: 1px solid var(--msb-line); border-radius: 14px;
        padding: 14px 14px 14px 10px;
      }
      .msb-vote {
        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        gap: 2px; padding: 8px 4px; background: none; border: none; cursor: pointer;
        color: var(--msb-red); min-height: 84px;
      }
      .msb-vote-count {
        font-size: 1.15rem; font-weight: 800; color: var(--msb-ink); line-height: 1.1;
      }
      .msb-vote-label {
        font-size: .72rem; font-weight: 700; color: var(--msb-red); letter-spacing: .01em;
      }
      .msb-vote.is-liked .msb-vote-count { color: var(--msb-red); }
      .msb-card-main { min-width: 0; }
      .msb-card-top {
        display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
      }
      .msb-title {
        margin: 0; font-size: 1.02rem; font-weight: 750; color: #0f172a;
        line-height: 1.35; flex: 1; min-width: 0;
      }
      .msb-card-aside { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .msb-status {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 10px; border-radius: 999px; font-size: .72rem; font-weight: 700;
        white-space: nowrap;
      }
      .msb-status--baru { background: #DBEAFE; color: #1D4ED8; }
      .msb-status--considering { background: #FFEDD5; color: #C2410C; }
      .msb-status--reviewed { background: #D1FAE5; color: #047857; }
      .msb-status-wrap { display: inline-flex; }
      .msb-status-select {
        appearance: none; -webkit-appearance: none;
        border: none; border-radius: 999px; font-size: .72rem; font-weight: 700;
        padding: 4px 22px 4px 10px; cursor: pointer; font-family: inherit;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 6px center;
      }
      .msb-status-select.msb-status--baru { background-color: #DBEAFE; color: #1D4ED8; }
      .msb-status-select.msb-status--considering { background-color: #FFEDD5; color: #C2410C; }
      .msb-status-select.msb-status--reviewed { background-color: #D1FAE5; color: #047857; }
      .msb-menu { position: relative; }
      .msb-more {
        border: none; background: none; color: #9CA3AF; cursor: pointer; padding: 2px;
        line-height: 0;
      }
      .msb-more:hover { color: #374151; }
      .msb-menu-pop {
        position: absolute; right: 0; top: 100%; z-index: 5;
        background: #fff; border: 1px solid var(--msb-line); border-radius: 10px;
        box-shadow: 0 8px 20px rgba(0,0,0,.08); min-width: 120px; padding: 4px;
      }
      .msb-menu-pop button {
        display: block; width: 100%; text-align: left; border: none; background: none;
        padding: 7px 10px; border-radius: 8px; cursor: pointer; font: inherit; font-size: .82rem;
        font-weight: 600; color: #374151;
      }
      .msb-menu-pop button:hover { background: #F3F4F6; }
      .msb-menu-danger { color: #B91C1C !important; }
      .msb-edit-title, .msb-edit-body {
        width: 100%; border: 1px solid #D1D5DB; border-radius: 10px;
        padding: 8px 10px; font: inherit; margin: 0 0 8px;
      }
      .msb-edit-title { font-weight: 750; font-size: 1.02rem; }
      .msb-edit-body { min-height: 90px; resize: vertical; }
      .msb-edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
      .msb-meta {
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        margin-top: 8px; font-size: .8rem; color: var(--msb-muted);
      }
      .msb-author {
        display: inline-flex; align-items: center; gap: 6px;
        border: none; background: none; padding: 0; cursor: pointer;
        font: inherit; color: #374151; font-weight: 650;
      }
      button.msb-author:hover .msb-author-name { text-decoration: underline; }
      .msb-role {
        display: inline-flex; align-items: center;
        margin-left: 2px; padding: 1px 7px; border-radius: 999px;
        background: #B5202A; color: #fff; font-size: .65rem; font-weight: 800;
        letter-spacing: .02em; line-height: 1.4;
      }
      .msb-avatar {
        border-radius: 50%; object-fit: cover; flex-shrink: 0; width: 22px; height: 22px;
        background: #E5E7EB;
      }
      .msb-avatar--letter {
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800; color: #374151;
      }
      .msb-dot { color: #D1D5DB; }
      .msb-body {
        margin: 8px 0 0; font-size: .9rem; line-height: 1.5; color: #4B5563;
        white-space: pre-wrap;
      }
      .msb-body-toggle {
        display: inline-block; margin: 4px 0 0; padding: 0;
        background: none; border: none; cursor: pointer;
        font-size: .82rem; font-weight: 700; color: var(--msb-red);
      }
      .msb-body-toggle:hover { text-decoration: underline; }
      .msb-card-foot {
        display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px;
      }
      .msb-kind {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 9px; border-radius: 999px; font-size: .72rem; font-weight: 700;
        background: #F3F4F6; color: #4B5563;
      }
      .msb-kind--feature { background: #EDE9FE; color: #6D28D9; }
      .msb-kind--complaint { background: #FEE2E2; color: #B91C1C; }
      .msb-comments-count {
        display: inline-flex; align-items: center; gap: 5px;
        border: none; background: none; color: var(--msb-muted); cursor: pointer;
        font-size: .8rem; font-weight: 600; padding: 0;
      }
      .msb-comments-count:hover { color: var(--msb-ink); }
      .msb-comments {
        margin-top: 12px; padding-top: 10px; border-top: 1px solid #F3F4F6;
      }
      .msb-comment {
        display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
        margin-bottom: 8px; font-size: .82rem; color: #374151;
      }
      .msb-comment-body { flex: 1 1 50%; }
      .msb-comment-date { color: #9CA3AF; font-size: .75rem; }
      .msb-comment-actions { display: inline-flex; gap: 8px; }
      .msb-comment-actions button {
        border: none; background: none; padding: 0; cursor: pointer;
        font-size: .75rem; font-weight: 700; color: var(--msb-red);
      }
      .msb-comment-edit { display: flex; flex: 1 1 100%; gap: 6px; align-items: center; }
      .msb-comment-edit-input {
        flex: 1; border: 1px solid #D1D5DB; border-radius: 999px; padding: 6px 10px; font-size: .82rem;
      }
      .msb-comment-edit button {
        border: none; background: none; cursor: pointer; font-weight: 700; font-size: .75rem; color: var(--msb-red);
      }
      .msb-comment-form { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
      .msb-comment-input {
        flex: 1; border: 1px solid #D1D5DB; border-radius: 999px;
        padding: 7px 12px; font-size: .85rem;
      }
      .msb-comment-send {
        border: none; background: none; color: var(--msb-red); cursor: pointer; padding: 4px;
      }
      .msb-cta {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        margin-top: 18px; padding: 16px 18px;
        background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
        flex-wrap: wrap;
      }
      .msb-cta-left {
        display: flex; align-items: flex-start; gap: 12px; min-width: 0; flex: 1;
      }
      .msb-cta-ico {
        width: 36px; height: 36px; border-radius: 999px; flex-shrink: 0;
        display: grid; place-items: center; background: #FEE2E2; color: var(--msb-red);
      }
      .msb-cta-text { margin: 0; font-size: .875rem; line-height: 1.45; color: #374151; }
      .msb-btn-outline {
        display: inline-flex; align-items: center; gap: 6px;
        background: #fff; color: var(--msb-red); border: 1.5px solid var(--msb-red);
        padding: 9px 14px; border-radius: 999px; font-size: .85rem; font-weight: 750;
        cursor: pointer; white-space: nowrap;
      }
      .msb-btn-outline:hover { background: var(--msb-red-soft); }
      @media (max-width: 700px) {
        .msb-hero { flex-direction: column; align-items: stretch; text-align: center; gap: 6px; }
        .msb-hero-text { align-self: stretch; padding: 4px 0 0; }
        .msb-hero-text p { margin-left: auto; margin-right: auto; }
        .msb-hero-text .msb-btn-primary { margin: 0 auto; }
        .msb-hero-mascot { align-self: center; margin: 0 0 4px; order: -1; }
        .msb-hero-mascot img { width: 200px; }
        .msb-panel { padding: 14px 14px 18px; border-radius: 18px; }
        .msb-card { grid-template-columns: 58px 1fr; padding: 12px 10px; }
        .msb-status { font-size: .68rem; padding: 3px 8px; }
        .msb-cta { padding: 14px; }
      }
    `;
    document.head.appendChild(style);
  }

  function mount(container, options) {
    _opts = options;
    _container = container;

    if (container.dataset.communityBoardMounted === 'msb-v5') {
      // Already built — just refresh the list instead of losing an
      // in-progress form by rebuilding the DOM from scratch.
      _listEl = container.querySelector('#msb-list');
      fetchPosts();
      return;
    }
    container.dataset.communityBoardMounted = 'msb-v5';
    injectStyles();

    container.innerHTML = `
      <div id="msb">
        <header class="msb-hero">
          <div class="msb-hero-text">
            <h2>Ajukan Fitur</h2>
            <p>Usulkan fitur atau laporkan keluhan — dibaca dan bisa disukai/dikomentari user lain.</p>
            <button type="button" class="msb-btn-primary" id="msb-open-form">${svgPlus()} Ajukan Ide Baru</button>
          </div>
          <div class="msb-hero-mascot" aria-hidden="true">
            <img src="/images/brand/mascot-fitur.webp" width="280" height="235" alt="" loading="lazy" decoding="async">
          </div>
        </header>

        <div class="msb-panel">
          <div class="msb-toolbar">
            <div class="msb-filters" role="tablist" aria-label="Filter usulan">
              <button type="button" class="msb-filter is-active" data-kind="all">Semua</button>
              <button type="button" class="msb-filter" data-kind="feature">Fitur</button>
              <button type="button" class="msb-filter" data-kind="complaint">Keluhan</button>
            </div>
          </div>

          <div class="msb-form" id="msb-form-panel" hidden>
            <select id="msb-kind">
              <option value="feature">Fitur</option>
              <option value="complaint">Keluhan</option>
            </select>
            <input id="msb-title" type="text" placeholder="Judul singkat" maxlength="120" required>
            <textarea id="msb-body" placeholder="Jelaskan singkat apa yang kamu butuhkan…" maxlength="4000" required></textarea>
            <div class="msb-form-actions">
              <button type="button" class="msb-btn-ghost" id="msb-cancel">Batal</button>
              <button type="button" class="msb-btn-primary" id="msb-submit">Kirim</button>
            </div>
          </div>

          <div class="msb-loading" id="msb-loading" hidden>Memuat…</div>
          <div class="msb-list" id="msb-list"></div>
        </div>

        <div class="msb-cta">
          <div class="msb-cta-left">
            <div class="msb-cta-ico">${svgBulb()}</div>
            <p class="msb-cta-text">Punya ide atau menemukan hal yang mengganggu? Sampaikan masukanmu, komunitas akan mendukung dan tim LarisID akan meninjaunya.</p>
          </div>
          <button type="button" class="msb-btn-outline" id="msb-cta-open">${svgPlus()} Ajukan Ide Baru</button>
        </div>
      </div>
    `;

    _listEl = container.querySelector('#msb-list');

    container.querySelectorAll('.msb-filter').forEach((btn) => {
      btn.addEventListener('click', () => switchKind(btn.dataset.kind));
    });
    container.querySelector('#msb-open-form')?.addEventListener('click', openForm);
    container.querySelector('#msb-cta-open')?.addEventListener('click', openForm);
    container.querySelector('#msb-cancel')?.addEventListener('click', closeForm);
    container.querySelector('#msb-submit')?.addEventListener('click', submitPost);

    _listEl.addEventListener('click', async (e) => {
      const menuBtn = e.target.closest('[data-action="toggle-menu"]');
      if (menuBtn) {
        e.preventDefault();
        const pop = menuBtn.parentElement && menuBtn.parentElement.querySelector('.msb-menu-pop');
        if (!pop) return;
        const willOpen = pop.hidden;
        closeMenus(pop);
        pop.hidden = !willOpen;
        return;
      }
      if (!e.target.closest('.msb-menu')) closeMenus();
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      const postId = actionEl.dataset.postId;
      const commentId = actionEl.dataset.commentId;
      if (action === 'open-profile') {
        e.preventDefault();
        const userId = actionEl.dataset.userId;
        if (userId && typeof _opts.onOpenProfile === 'function') _opts.onOpenProfile(userId);
      } else if (action === 'like') {
        e.preventDefault();
        await toggleLike(postId);
      } else if (action === 'toggle-body') {
        e.preventDefault();
        toggleBody(postId);
      } else if (action === 'toggle-comments') {
        e.preventDefault();
        toggleComments(postId);
      } else if (action === 'send-comment') {
        e.preventDefault();
        const input = _listEl.querySelector(`.msb-comment-input[data-post-id="${postId}"]`);
        if (input) {
          const body = input.value.trim();
          if (body) {
            await addComment(postId, body);
            input.value = '';
          }
        }
      } else if (action === 'edit-post') {
        e.preventDefault();
        closeMenus();
        startPostEdit(postId);
      } else if (action === 'delete-post') {
        e.preventDefault();
        closeMenus();
        await deletePost(postId);
      } else if (action === 'save-post') {
        e.preventDefault();
        const title = _listEl.querySelector(`[data-edit-title="${postId}"]`)?.value;
        const body = _listEl.querySelector(`[data-edit-body="${postId}"]`)?.value;
        await savePostEdit(postId, title, body);
      } else if (action === 'cancel-edit-post') {
        e.preventDefault();
        renderPosts();
      } else if (action === 'edit-comment') {
        e.preventDefault();
        startCommentEdit(postId, commentId);
      } else if (action === 'delete-comment') {
        e.preventDefault();
        await deleteComment(postId, commentId);
      } else if (action === 'save-comment') {
        e.preventDefault();
        const input = _listEl.querySelector(`.msb-comment-edit-input[data-comment-id="${commentId}"]`);
        await saveCommentEdit(postId, commentId, input && input.value);
      } else if (action === 'cancel-edit-comment') {
        e.preventDefault();
        renderCommentsForPost(postId);
      }
    });

    _listEl.addEventListener('change', async (e) => {
      const sel = e.target.closest('[data-action="set-status"]');
      if (!sel) return;
      await setPostStatus(sel.dataset.postId, sel.value);
    });

    _listEl.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('.msb-comment-input');
      if (!input) return;
      e.preventDefault();
      const postId = input.dataset.postId;
      const body = input.value.trim();
      if (body) {
        await addComment(postId, body);
        input.value = '';
      }
    });

    fetchPosts();
  }

  global.GptCommunityBoard = { mount: mount };
})(window);
