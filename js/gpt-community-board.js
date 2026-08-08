(function (global) {
  'use strict';

  let _opts;
  let _container;
  let _listEl;
  let _activeTab = 'feature';
  let _posts = [];
  let _expandedPostIds = new Set();
  let _commentsCache = {};

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

  function svgHeart(liked) {
    const fill = liked ? '#B5202A' : 'none';
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78l1.06 1.06L12 21.73l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  }

  function svgComment() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  }

  function svgSend() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  }

  function truncateBody(body, expanded) {
    if (expanded) return body;
    if (body.length > 180) return body.substring(0, 180) + ' ...';
    return body;
  }

  // "Steven - Bandung" when a city is on file, else just the name — most
  // early submitters won't have set a city yet, so this must degrade cleanly.
  function authorLabel(row) {
    const name = _opts.esc(row.author_first_name || 'Pengguna LarisID');
    const city = row.author_city ? _opts.esc(row.author_city) : '';
    return city ? `${name} - ${city}` : name;
  }

  function avatarHtml(row, size) {
    const px = size || 28;
    if (row.author_headshot_url) {
      return `<img class="author-avatar" src="${_opts.esc(row.author_headshot_url)}" alt="" width="${px}" height="${px}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'author-avatar author-avatar--letter',textContent:${JSON.stringify((row.author_first_name || '?').charAt(0).toUpperCase())}}))">`;
    }
    const letter = _opts.esc((row.author_first_name || '?').charAt(0).toUpperCase());
    return `<span class="author-avatar author-avatar--letter" style="width:${px}px;height:${px}px">${letter}</span>`;
  }

  // Author name + avatar are clickable everywhere they appear on the board,
  // opening the host's public-profile view (name/city/avatar only — the host
  // is responsible for never surfacing contact details through this path).
  function authorTagHtml(row) {
    if (!row.author_id) return `<span class="author-tag">${avatarHtml(row)}<span class="author-name">${authorLabel(row)}</span></span>`;
    return `<button type="button" class="author-tag" data-action="open-profile" data-user-id="${_opts.esc(row.author_id)}">` +
      `${avatarHtml(row)}<span class="author-name">${authorLabel(row)}</span></button>`;
  }

  function showLoading(show) {
    const el = _container && _container.querySelector('#loading-area');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  function updateLikeDisplay(postId, liked, count) {
    const btn = _listEl && _listEl.querySelector(`.like-btn[data-post-id="${postId}"]`);
    if (!btn) return;
    btn.innerHTML = `${svgHeart(liked)} <span class="like-count">${count}</span>`;
  }

  function updateCommentCountDisplay(postId, count) {
    const btn = _listEl && _listEl.querySelector(`.comment-toggle-btn[data-post-id="${postId}"]`);
    if (!btn) return;
    const countSpan = btn.querySelector('.comment-count');
    if (countSpan) countSpan.textContent = count;
  }

  function renderCommentsForPost(postId) {
    const section = _listEl && _listEl.querySelector(`[data-comments-for="${postId}"]`);
    if (!section) return;
    const comments = _commentsCache[postId] || [];
    const list = section.querySelector('.comments-list');
    if (!list) return;
    list.innerHTML = comments
      .map((c) => {
        const body = _opts.esc(c.body);
        const date = formatDate(c.created_at);
        return `<div class="comment-item">${authorTagHtml(c)} <span class="comment-body">${body}</span> <span class="comment-date">${date}</span></div>`;
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
      .select('id, author_id, author_first_name, author_city, author_headshot_url, body, created_at')
      .eq('request_id', postId)
      .order('created_at', { ascending: true });
    if (error) {
      return;
    }
    _commentsCache[postId] = data || [];
    renderCommentsForPost(postId);
  }

  function toggleComments(postId) {
    const section = _listEl && _listEl.querySelector(`[data-comments-for="${postId}"]`);
    if (!section) return;
    if (_expandedPostIds.has(postId)) {
      section.style.display = 'none';
      _expandedPostIds.delete(postId);
    } else {
      section.style.display = 'block';
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
      _opts.toast('Gagal memperbarui suka. Coba lagi.');
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
      .select('id, author_id, author_first_name, author_city, author_headshot_url, body, created_at')
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
    }
  }

  async function fetchPosts() {
    if (!_listEl) return;
    _listEl.innerHTML = '';
    showLoading(true);
    const { data, error } = await _opts.supabase
      .from('feature_requests_feed')
      .select('*')
      .eq('kind', _activeTab)
      .order('created_at', { ascending: false })
      .limit(50);
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
      empty.className = 'empty-state';
      empty.textContent =
        _activeTab === 'feature'
          ? 'Belum ada fitur yang diajukan. Jadi yang pertama!'
          : 'Belum ada keluhan yang dilaporkan. Jadi yang pertama!';
      _listEl.appendChild(empty);
      return;
    }
    _posts.forEach((post) => {
      const card = document.createElement('div');
      card.className = 'post-card';
      card.dataset.postId = post.id;
      const isExpanded = _expandedPostIds.has(post.id);
      const bodyText = truncateBody(post.body, isExpanded);
      card.innerHTML = `
        <div class="post-header">
          <strong class="post-title">${_opts.esc(post.title)}</strong>
          <span class="post-meta">${authorTagHtml(post)}<span class="post-date">${formatDate(post.created_at)}</span></span>
        </div>
        <div class="post-body ${isExpanded ? 'expanded' : 'collapsed'}">
          <p>${_opts.esc(bodyText)}</p>
        </div>
        <div class="post-footer">
          <button class="like-btn" data-action="like" data-post-id="${post.id}">
            ${svgHeart(post.liked_by_me)}
            <span class="like-count">${post.like_count}</span>
          </button>
          <button class="comment-toggle-btn" data-action="toggle-comments" data-post-id="${post.id}">
            ${svgComment()}
            <span class="comment-count">${post.comment_count}</span>
          </button>
        </div>
        <div class="comments-section" data-comments-for="${post.id}" style="display:${isExpanded ? 'block' : 'none'}">
          <div class="comments-list"></div>
          <div class="comment-form">
            <input type="text" class="comment-input" placeholder="Tulis komentar..." data-post-id="${post.id}">
            <button class="send-comment-btn" data-action="send-comment" data-post-id="${post.id}">${svgSend()}</button>
          </div>
        </div>
      `;
      _listEl.appendChild(card);
      if (isExpanded) {
        loadComments(post.id);
      }
    });
  }

  async function submitPost() {
    const titleInput = _container.querySelector('#post-title');
    const bodyInput = _container.querySelector('#post-body');
    if (!titleInput || !bodyInput) return;
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    if (!title || !body) {
      _opts.toast('Judul dan deskripsi harus diisi.');
      return;
    }
    const { error } = await _opts.supabase.from('feature_requests').insert({
      author_id: _opts.currentUserId,
      kind: _activeTab,
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
    const panel = _container.querySelector('#form-panel');
    if (panel) panel.style.display = 'none';
    fetchPosts();
  }

  function switchTab(tab) {
    _activeTab = tab;
    const addBtn = _container.querySelector('#toggle-form-btn');
    if (addBtn)
      addBtn.textContent = tab === 'feature' ? '+ Ajukan Fitur' : '+ Laporkan Keluhan';
    const tabBtns = _container.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      if (btn.dataset.tab === tab) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    _posts = [];
    fetchPosts();
  }

  // ---------- mount ----------

  function mount(container, options) {
    _opts = options;
    _container = container;

    if (container.dataset.communityBoardMounted === 'true') {
      // Already built — just refresh the list instead of losing an
      // in-progress form by rebuilding the DOM from scratch.
      _listEl = container.querySelector('#board-list');
      fetchPosts();
      return;
    }
    container.dataset.communityBoardMounted = 'true';

    // inject style once
    if (!document.getElementById('gpt-community-board-style')) {
      const style = document.createElement('style');
      style.id = 'gpt-community-board-style';
      style.textContent = `
        #gpt-board * { box-sizing: border-box; }
        #gpt-board { max-width: 100%; background: transparent; }
        .gpt-board-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
        .tab-btn { background: #f9fafb; border: 1px solid #d1d5db; color: #374151; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .tab-btn.active { background: #B5202A; color: #fff; border-color: #B5202A; }
        .btn-add { background: #B5202A; color: #fff; border: none; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .gpt-board-form { margin: 12px 0; border: 1px solid #E5E7EB; border-radius: 12px; padding: 12px; }
        #post-title, #post-body { width: 100%; box-sizing: border-box; margin-bottom: 8px; border: 1px solid #D1D5DB; border-radius: 8px; padding: 8px; font-size: 14px; }
        #post-body { resize: vertical; min-height: 80px; }
        .form-buttons { display: flex; gap: 8px; justify-content: flex-end; }
        .btn-primary { background: #B5202A; color: #fff; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
        #cancel-form-btn { background: #E5E7EB; color: #374151; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
        .post-card { background: #fff; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
        .post-header { margin-bottom: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .post-title { font-size: 16px; font-weight: 600; color: #111827; width: 100%; }
        .post-meta { font-size: 12px; color: #6B7280; display: inline-flex; align-items: center; gap: 8px; }
        .post-date { color: #9CA3AF; }
        .post-body { font-size: 14px; color: #374151; margin-top: 8px; }
        .post-footer { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
        .like-btn, .comment-toggle-btn { background: none; border: none; padding: 4px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: #374151; font-size:14px; }
        .like-btn svg, .comment-toggle-btn svg { pointer-events: none; }
        .comments-section { margin-top: 12px; padding-left: 20px; border-left: 2px solid #E5E7EB; }
        .comment-item { margin-bottom: 8px; font-size:13px; color: #374151; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
        .comment-body { flex: 1; min-width: 60%; }
        .comment-date { font-size: 11px; color: #9CA3AF; }
        .author-tag {
          display: inline-flex; align-items: center; gap: 6px; background: none; border: none;
          padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer;
        }
        button.author-tag:hover .author-name { text-decoration: underline; }
        .author-avatar { border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #E5E7EB; }
        .author-avatar--letter { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #6B7280; }
        .author-name { white-space: nowrap; }
        .comment-form { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        .comment-input { flex: 1; border: 1px solid #D1D5DB; border-radius: 8px; padding: 6px 8px; font-size:13px; box-sizing:border-box; }
        .send-comment-btn { background: none; border: none; cursor: pointer; color: #B5202A; padding: 2px; }
        .empty-state { color: #6B7280; font-size: 14px; padding: 20px; text-align: center; }
        .gpt-loading { text-align: center; color: #6B7280; padding: 20px; }
      `;
      document.head.appendChild(style);
    }

    container.innerHTML = '';
    container.innerHTML = `
      <div id="gpt-board">
        <div class="gpt-board-tabs">
          <button class="tab-btn" data-tab="feature" id="tab-feature">Fitur</button>
          <button class="tab-btn" data-tab="complaint" id="tab-complaint">Keluhan</button>
        </div>
        <div class="gpt-board-actions">
          <button class="btn-add" id="toggle-form-btn">+ Ajukan Fitur</button>
        </div>
        <div class="gpt-board-form" style="display:none" id="form-panel">
          <input id="post-title" type="text" placeholder="Judul" maxlength="120" required>
          <textarea id="post-body" placeholder="Deskripsi" maxlength="4000" required></textarea>
          <div class="form-buttons">
            <button id="submit-post-btn" class="btn-primary">Kirim</button>
            <button id="cancel-form-btn">Batal</button>
          </div>
        </div>
        <div class="gpt-loading" id="loading-area" style="display:none">Memuat…</div>
        <div class="gpt-board-list" id="board-list"></div>
      </div>
    `;

    _listEl = container.querySelector('#board-list');

    container.querySelector('#tab-feature').addEventListener('click', () => switchTab('feature'));
    container.querySelector('#tab-complaint').addEventListener('click', () => switchTab('complaint'));

    container.querySelector('#toggle-form-btn').addEventListener('click', () => {
      const panel = container.querySelector('#form-panel');
      if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
      } else {
        panel.style.display = 'none';
      }
    });

    container.querySelector('#submit-post-btn').addEventListener('click', submitPost);
    container.querySelector('#cancel-form-btn').addEventListener('click', () => {
      container.querySelector('#form-panel').style.display = 'none';
    });

    _listEl.addEventListener('click', async (e) => {
      const actionEl = e.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      const postId = actionEl.dataset.postId;
      if (action === 'open-profile') {
        e.preventDefault();
        const userId = actionEl.dataset.userId;
        if (userId && typeof _opts.onOpenProfile === 'function') _opts.onOpenProfile(userId);
      } else if (action === 'like') {
        e.preventDefault();
        await toggleLike(postId);
      } else if (action === 'toggle-comments') {
        e.preventDefault();
        toggleComments(postId);
      } else if (action === 'send-comment') {
        e.preventDefault();
        const input = _listEl.querySelector(`.comment-input[data-post-id="${postId}"]`);
        if (input) {
          const body = input.value.trim();
          if (body) {
            await addComment(postId, body);
            input.value = '';
          }
        }
      }
    });

    switchTab('feature');
  }

  // ---------- export ----------

  global.GptCommunityBoard = { mount: mount };
})(window);
