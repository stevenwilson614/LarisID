(function (global) {
  'use strict';

  let _opts;
  let _container;
  let _listEl;
  let _activeKind = 'all'; // all | feature | complaint
  let _posts = [];
  let _expandedPostIds = new Set();
  let _commentsCache = {};

  const STATUS_META = {
    open: {
      label: 'Baru',
      cls: 'baru',
      empty: 'Belum ada usulan. Jadi yang pertama!',
    },
    considering: {
      label: 'Sedang dipertimbangkan',
      cls: 'considering',
      empty: 'Belum ada usulan dengan status ini.',
    },
    done: {
      label: 'Ditinjau',
      cls: 'reviewed',
      empty: 'Belum ada usulan yang ditinjau.',
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

  function authorTagHtml(row) {
    const name = _opts.esc(authorDisplayName(row));
    if (!row.author_id) {
      return `<span class="msb-author">${avatarHtml(row, 22)}<span class="msb-author-name">${name}</span></span>`;
    }
    return `<button type="button" class="msb-author" data-action="open-profile" data-user-id="${_opts.esc(row.author_id)}">${avatarHtml(row, 22)}<span class="msb-author-name">${name}</span></button>`;
  }

  function statusBadgeHtml(status) {
    const meta = STATUS_META[status] || STATUS_META.open;
    return `<span class="msb-status msb-status--${meta.cls}">${svgSparkle()} ${_opts.esc(meta.label)}</span>`;
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
        return `<div class="msb-comment">${authorTagHtml(c)}<span class="msb-comment-body">${_opts.esc(c.body)}</span><span class="msb-comment-date">${formatDate(c.created_at)}</span></div>`;
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
    if (error) return;
    _commentsCache[postId] = data || [];
    renderCommentsForPost(postId);
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
      const bodyText = truncateBody(post.body || '', isExpanded);
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
              ${statusBadgeHtml(post.status)}
              <button type="button" class="msb-more" aria-label="Opsi" tabindex="-1">${svgDots()}</button>
            </div>
          </div>
          <div class="msb-meta">
            ${authorTagHtml(post)}
            <span class="msb-dot">·</span>
            <span class="msb-date">${formatDate(post.created_at)}</span>
          </div>
          <p class="msb-body">${bodyHtml(bodyText)}</p>
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
      .msb-banner {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        background: linear-gradient(90deg, #fff7f8 0%, #fff1f2 55%, #ffe8ec 100%);
        border: 1px solid #FDE2E4;
        border-radius: 16px;
        padding: 18px 20px 18px 22px;
        margin-bottom: 22px;
        overflow: hidden;
        position: relative;
      }
      .msb-banner-copy { flex: 1; min-width: 0; z-index: 1; }
      .msb-banner-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
      .msb-beta {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 3px 10px; border-radius: 999px;
        border: 1.5px solid var(--msb-red); color: var(--msb-red);
        background: #fff; font-size: 11px; font-weight: 800; letter-spacing: .06em;
      }
      .msb-banner-title { margin: 0; font-size: 1rem; font-weight: 750; color: var(--msb-ink); }
      .msb-banner-sub { margin: 0; font-size: .875rem; line-height: 1.45; color: #374151; max-width: 46rem; }
      .msb-banner-art {
        flex: 0 0 auto; width: min(220px, 34vw); height: 92px;
        background: url('/images/masukan-banner-illust.png') right center / contain no-repeat;
        pointer-events: none;
      }
      .msb-head { margin-bottom: 16px; }
      .msb-head h2 {
        margin: 0 0 6px; font-size: 1.75rem; font-weight: 800;
        letter-spacing: -.03em; color: #0f172a;
      }
      .msb-head p { margin: 0; color: var(--msb-muted); font-size: .95rem; line-height: 1.45; }
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
        padding: 9px 16px; border-radius: 999px; font-size: .875rem; font-weight: 700;
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
      .msb-more {
        border: none; background: none; color: #9CA3AF; cursor: default; padding: 2px;
        line-height: 0;
      }
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
        background: #F3F4F6; border: 1px solid #E5E7EB; border-radius: 14px;
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
        .msb-banner { padding: 14px; }
        .msb-banner-art { width: 120px; height: 72px; }
        .msb-banner-title { font-size: .92rem; }
        .msb-head h2 { font-size: 1.4rem; }
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

    if (container.dataset.communityBoardMounted === 'msb-v2') {
      // Already built — just refresh the list instead of losing an
      // in-progress form by rebuilding the DOM from scratch.
      _listEl = container.querySelector('#msb-list');
      fetchPosts();
      return;
    }
    container.dataset.communityBoardMounted = 'msb-v2';
    injectStyles();

    container.innerHTML = `
      <div id="msb">
        <div class="msb-banner">
          <div class="msb-banner-copy">
            <div class="msb-banner-row">
              <span class="msb-beta">BETA</span>
              <p class="msb-banner-title">LarisID masih dalam tahap Beta</p>
            </div>
            <p class="msb-banner-sub">Masukan kamu sangat berarti! Bantu kami membuat LarisID jadi lebih baik untuk semua seller Indonesia.</p>
          </div>
          <div class="msb-banner-art" role="img" aria-label="Ilustrasi roket dan bendera Indonesia"></div>
        </div>

        <div class="msb-head">
          <h2>Usulan Fitur</h2>
          <p>Usulkan fitur atau laporkan keluhan — dibaca dan bisa disukai/dikomentari user lain.</p>
        </div>

        <div class="msb-toolbar">
          <div class="msb-filters" role="tablist" aria-label="Filter usulan">
            <button type="button" class="msb-filter is-active" data-kind="all">Semua</button>
            <button type="button" class="msb-filter" data-kind="feature">Fitur</button>
            <button type="button" class="msb-filter" data-kind="complaint">Keluhan</button>
          </div>
          <button type="button" class="msb-btn-primary" id="msb-open-form">${svgPlus()} Ajukan Masukan</button>
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

        <div class="msb-cta">
          <div class="msb-cta-left">
            <div class="msb-cta-ico">${svgBulb()}</div>
            <p class="msb-cta-text">Punya ide atau menemukan hal yang mengganggu? Sampaikan masukanmu, komunitas akan mendukung dan tim LarisID akan meninjaunya.</p>
          </div>
          <button type="button" class="msb-btn-outline" id="msb-cta-open">${svgPlus()} Ajukan Masukan Sekarang</button>
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
        const input = _listEl.querySelector(`.msb-comment-input[data-post-id="${postId}"]`);
        if (input) {
          const body = input.value.trim();
          if (body) {
            await addComment(postId, body);
            input.value = '';
          }
        }
      }
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
