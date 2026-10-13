/* Belajar — free seller course. Content and progress come from belajar_course(). */
(function (global) {
  'use strict';

  const PLATFORMS = [
    { id: 'shopee', label: 'Shopee' },
    { id: 'tokopedia', label: 'Tokopedia' },
    { id: 'tiktok', label: 'TikTok Shop' },
    { id: 'lazada', label: 'Lazada' },
  ];

  let _ctx = null;
  let _course = null;
  let _lessonSlug = null;
  let _busy = false;
  let _bound = false;
  let _adminBound = false;
  let _loadGen = 0;
  let _paintKey = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function safeUrl(url) {
    const u = String(url || '').trim();
    if (u.startsWith('/') && !u.startsWith('//')) return u;
    if (/^https:\/\//i.test(u)) return u;
    return '';
  }

  function ytId(url) {
    const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  function rootEl() {
    return document.getElementById('belajar-root');
  }

  function modules() {
    return arr(_course && _course.modules);
  }

  function lessonBySlug(slug) {
    for (const mod of modules()) {
      for (const lesson of arr(mod.lessons)) {
        if (lesson.slug === slug) return { lesson, module: mod };
      }
    }
    return null;
  }

  async function rpc(name, args) {
    if (!_ctx || !_ctx.supabase) throw new Error('no_client');
    const { data, error } = await _ctx.supabase.rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  function paras(text) {
    return String(text || '').split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function signalLine(lesson) {
    const key = lesson.action && lesson.action.verify_key;
    const s = (_course && _course.signals) || {};
    if (key === 'deepdive') return `Deep Dive tercatat: ${s.deepdive || 0}. Butuh minimal 1.`;
    if (key === 'favorit3') return `Favorit tersimpan: ${s.favorit || 0} dari 3.`;
    if (key === 'kalk') return (s.kalk > 0) ? 'Kalkulasi tersimpan di riwayat.' : 'Belum ada kalkulasi yang disimpan.';
    if (key === 'store') return s.store ? 'URL toko sudah tersimpan.' : 'URL toko belum tersimpan di Profil.';
    if (key === 'pantau') {
      return `Favorit ${s.favorit || 0} dari 3 · ${s.notify ? 'kabar menyala' : 'kabar belum dinyalakan'}.`;
    }
    return '';
  }

  function statusMark(lesson) {
    if (lesson.status === 'done') return '✓';
    if (lesson.status === 'skipped') return '–';
    return '';
  }

  function scrollTopIfNeeded(key) {
    if (key === _paintKey) return;
    _paintKey = key;
    const panel = document.getElementById('panel');
    if (panel) requestAnimationFrame(() => { panel.scrollTop = 0; });
  }

  const ICO = {
    video: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M10.2 8.8v6.4L16 12l-5.8-3.2z" fill="currentColor" stroke="none"/></svg>',
    doc: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5M8 12.5h8M8 16h6"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13.5a4 4 0 0 0 5.7.4l2.2-2.2a4 4 0 0 0-5.7-5.6L11 7.3"/><path d="M14 10.5a4 4 0 0 0-5.7-.4L6.1 12.3a4 4 0 0 0 5.7 5.6L13 16.7"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"/></svg>',
    ask: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 1 1 3.6 2.7c-.7.3-1.3.9-1.3 1.6V14"/><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none"/></svg>',
    step: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h12M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12.5l4.2 4.2L19 7.5"/></svg>',
  };

  function sectionHtml(icon, title, count, body) {
    if (!body) return '';
    return `<section class="blj-sec">
      <header class="blj-sec-h">
        <span class="blj-sec-ic" aria-hidden="true">${icon}</span>
        <div>
          <strong>${esc(title)}</strong>
          ${count ? `<span>${esc(count)}</span>` : ''}
        </div>
      </header>
      <div class="blj-sec-body">${body}</div>
    </section>`;
  }

  function kindLabel(kind) {
    if (kind === 'video') return 'Video';
    if (kind === 'document') return 'Dokumen';
    if (kind === 'tool') return 'Langkah di LarisID';
    return 'Bacaan';
  }

  function mediaInner(lesson) {
    const url = safeUrl(lesson.url);
    const id = ytId(lesson.url);
    if (id) {
      return `<button type="button" class="blj-yt" data-blj-yt="${esc(id)}">
        <img alt="" src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" loading="lazy">
        <span>Putar video</span>
      </button>`;
    }
    if (url && (lesson.kind === 'document' || lesson.kind === 'video')) {
      return `<a class="blj-doc" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Buka dokumen</a>`;
    }
    return '';
  }

  function mediaHtml(lesson) {
    const inner = mediaInner(lesson);
    if (!inner) return '';
    const video = !!ytId(lesson.url) || lesson.kind === 'video';
    return sectionHtml(video ? ICO.video : ICO.doc, video ? 'Video' : 'Dokumen', video ? 'Putar saat kamu siap' : 'Panduan resmi', inner);
  }

  function resourcesHtml(lesson) {
    const own = safeUrl(lesson.url);
    const items = arr(lesson.resources).map((r) => {
      const url = safeUrl(r && r.url);
      if (!url || url === own) return '';
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc((r && r.name) || url)}</a></li>`;
    }).filter(Boolean);
    if (!items.length) return '';
    const n = items.length;
    return sectionHtml(ICO.link, 'Tautan', n === 1 ? '1 tautan' : `${n} tautan`, `<ul class="blj-links">${items.join('')}</ul>`);
  }

  function pointsHtml(lesson) {
    const items = arr(lesson.points).map((p) => `<li>${esc(p)}</li>`).join('');
    if (!items) return '';
    const n = arr(lesson.points).length;
    return sectionHtml(ICO.list, 'Poin penting', n === 1 ? '1 poin' : `${n} poin`, `<ul class="blj-points">${items}</ul>`);
  }

  function questionsHtml(lesson) {
    const qs = arr(lesson.questions);
    if (!qs.length) return '';
    const saved = lesson.answers || {};
    const fields = qs.map((q, i) => {
      const val = saved[String(i)] != null ? saved[String(i)] : '';
      return `<label class="blj-q">
        <span>${esc(q.q || '')}</span>
        ${q.hint ? `<em>${esc(q.hint)}</em>` : ''}
        <textarea data-blj-answer="${i}" rows="3">${esc(val)}</textarea>
      </label>`;
    }).join('');
    const n = qs.length;
    return sectionHtml(
      ICO.ask,
      'Cek pemahaman',
      n === 1 ? '1 pertanyaan' : `${n} pertanyaan`,
      `<p class="blj-quiet">Untuk kamu, bukan untuk dinilai. Jawaban tersimpan saat kamu menandai selesai.</p>${fields}`
    );
  }

  function actionHtml(lesson) {
    const action = lesson.action;
    if (!action || !action.view || !action.label) return '';
    const line = signalLine(lesson);
    const verified = lesson.verify_met
      ? '<p class="blj-verified">Sudah terverifikasi dari aktivitasmu.</p>'
      : '';
    return sectionHtml(
      ICO.step,
      'Langkah berikutnya',
      'Di LarisID',
      `${line ? `<p class="blj-quiet">${esc(line)}</p>` : ''}${verified}<button type="button" class="btn-primary" data-blj-action="${esc(action.view)}">${esc(action.label)}</button>`
    );
  }

  function orderedLessons() {
    const out = [];
    modules().forEach((mod) => {
      arr(mod.lessons).forEach((lesson) => out.push({ lesson, module: mod }));
    });
    return out;
  }

  function neighbor(dir) {
    const items = orderedLessons();
    const i = items.findIndex((item) => item.lesson.slug === _lessonSlug);
    if (i < 0) return null;
    return items[i + dir] || null;
  }

  function trailHtml(currentSlug) {
    const items = orderedLessons();
    if (!items.length || !_course) return '';
    const p = _course.progress || {};
    const done = p.done || 0;
    const total = p.total || 0;
    const pct = total ? Math.max(0, Math.min(100, p.pct || 0)) : 0;
    const focus = currentSlug || (p.next && p.next.slug) || '';
    const focusIdx = items.findIndex((item) => item.lesson.slug === focus);
    const here = focusIdx >= 0 ? items[focusIdx] : null;
    const dots = items.map((item, i) => {
      const lesson = item.lesson;
      const cls = [
        'blj-dot',
        lesson.status === 'done' ? 'is-done' : '',
        lesson.status === 'skipped' ? 'is-skip' : '',
        lesson.applicable ? '' : 'is-quiet',
        lesson.slug === focus ? 'is-current' : '',
      ].filter(Boolean).join(' ');
      const mark = lesson.status === 'done' ? ICO.check : '';
      return `<button type="button" class="${cls}" data-blj-lesson="${esc(lesson.slug)}" title="${esc(lesson.title)}" aria-label="${esc((i + 1) + '. ' + lesson.title)}"${lesson.slug === focus ? ' aria-current="step"' : ''}>${mark}</button>`;
    }).join('');
    const place = currentSlug
      ? 'Kamu sedang di sini'
      : (here ? here.lesson.title : 'Semua langkah yang dihitung selesai');
    return `<div class="blj-trail">
      <div class="blj-dots" data-blj-dots>${dots}</div>
      <div class="blj-trail-meta">
        <div>
          <strong>${done} / ${total} langkah selesai</strong>
          <span>${esc(place)}</span>
        </div>
        <b>${pct}%</b>
      </div>
    </div>`;
  }

  function lessonChrome(found) {
    const items = orderedLessons();
    const i = items.findIndex((item) => item.lesson.slug === found.lesson.slug);
    const at = i >= 0 ? i + 1 : 1;
    return `<div class="blj-chrome"><div class="blj-top">
      <button type="button" class="blj-back" data-blj-back>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
        Belajar
      </button>
      <span class="blj-pos">${at} / ${items.length || 1}</span>
      <button type="button" class="blj-navbtn" data-blj-step="-1" ${i > 0 ? '' : 'disabled'} aria-label="Materi sebelumnya">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>
      </button>
      <button type="button" class="blj-navbtn" data-blj-step="1" ${i >= 0 && i < items.length - 1 ? '' : 'disabled'} aria-label="Materi berikutnya">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 6l6 6-6 6"/></svg>
      </button>
    </div>
    ${trailHtml(found.lesson.slug)}</div>`;
  }

  function pagerHtml() {
    const prev = neighbor(-1);
    const next = neighbor(1);
    return `<div class="blj-pager">
      <button type="button" class="blj-pager-btn" data-blj-step="-1" ${prev ? '' : 'disabled'}>Materi sebelumnya</button>
      <button type="button" class="blj-pager-btn is-next" data-blj-step="1" ${next ? '' : 'disabled'}>Materi berikutnya</button>
    </div>`;
  }

  function lessonHtml(found) {
    const lesson = found.lesson;
    const mod = found.module;
    const done = lesson.status === 'done';
    const skipped = lesson.status === 'skipped';
    const plat = PLATFORMS.find((p) => p.id === lesson.platform);
    const body = paras(lesson.body);
    const next = neighbor(1);
    const finish = done
      ? (next
        ? '<button type="button" class="blj-finish is-done" data-blj-step="1">Selesai · lanjut</button>'
        : '<p class="blj-finish is-done" role="status">Selesai</p>')
      : '<button type="button" class="blj-finish" data-blj-done>Tandai selesai</button>';
    return `<div class="blj-player">
      ${lessonChrome(found)}
      <article class="blj-lesson">
        <p class="blj-kicker">${esc(mod.title)}${plat ? ` · ${esc(plat.label)}` : ''}</p>
        <h2>${esc(lesson.title)}</h2>
        <p class="blj-kind">${esc(kindLabel(lesson.kind))}${lesson.est_mins ? ` · ${lesson.est_mins} mnt` : ''}</p>
        ${!lesson.applicable ? '<p class="blj-quiet">Langkah ini tidak masuk hitungan progresmu. Tetap bisa dibaca.</p>' : ''}
        ${mediaHtml(lesson)}
        ${body ? sectionHtml(ICO.doc, 'Bacaan', '', `<div class="blj-body">${body}</div>`) : ''}
        ${pointsHtml(lesson)}
        ${resourcesHtml(lesson)}
        ${questionsHtml(lesson)}
        ${actionHtml(lesson)}
        ${finish}
        ${pagerHtml()}
        <div class="blj-actions">
          ${done
            ? '<button type="button" class="btn-ghost" data-blj-clear>Buka lagi</button>'
            : `<button type="button" class="btn-ghost" data-blj-draft>Simpan jawaban</button>
               ${skipped
                 ? '<button type="button" class="btn-ghost" data-blj-clear>Kembalikan</button>'
                 : '<button type="button" class="btn-ghost" data-blj-skip>Lewati</button>'}`}
        </div>
      </article>
    </div>`;
  }

  function lessonRow(lesson) {
    const cls = [
      'blj-row',
      lesson.status === 'done' ? 'is-done' : '',
      lesson.status === 'skipped' ? 'is-skipped' : '',
      lesson.applicable ? '' : 'is-quiet',
      lesson.slug === _lessonSlug ? 'is-current' : '',
    ].filter(Boolean).join(' ');
    const mark = statusMark(lesson);
    const plat = lesson.platform ? `<em>${esc(lesson.platform)}</em>` : '';
    return `<button type="button" class="${cls}" data-blj-lesson="${esc(lesson.slug)}">
      <i>${mark || ''}</i>
      <span>${esc(lesson.title)}</span>
      ${plat}
    </button>`;
  }

  function homeHtml() {
    const p = _course.progress || {};
    const next = p.next || null;
    const existing = _course.track === 'existing';
    const plats = arr(_course.platforms);
    const complete = (p.total || 0) > 0 && (p.done || 0) >= p.total && !next;
    const chips = PLATFORMS.map((pl) => {
      const on = plats.includes(pl.id);
      return `<button type="button" class="blj-chip${on ? ' is-on' : ''}" data-blj-platform="${pl.id}" aria-pressed="${on ? 'true' : 'false'}">${esc(pl.label)}</button>`;
    }).join('');

    const mods = modules().map((mod) => {
      const open = (next && next.module_slug === mod.slug) || arr(mod.lessons).some((l) => l.slug === _lessonSlug);
      const early = existing && mod.slug !== 'pantau' && (mod.sort_order || 0) < 5;
      return `<details class="blj-mod${early ? ' is-early' : ''}" ${open ? 'open' : ''}>
        <summary>
          <strong>${esc(mod.title)}</strong>
          ${mod.subtitle ? `<span>${esc(mod.subtitle)}</span>` : ''}
        </summary>
        <div class="blj-rows">${arr(mod.lessons).map(lessonRow).join('')}</div>
      </details>`;
    }).join('');

    return `<header class="blj-hero">
      <p class="blj-kicker">Belajar</p>
      <h2>Dari belum punya produk sampai listing-nya hidup</h2>
      <p class="blj-lead">Gratis. Semua materi bisa dibaca. Tandai selesai kalau langkahnya sudah kamu kerjakan. Kalau aktivitasmu di LarisID sudah membuktikan, langkah itu tertandai sendiri.</p>
    </header>
    <section class="blj-progress" aria-label="Progres">${trailHtml(null)}</section>
    ${complete ? `<section class="blj-done-card">
      <h3>Kamu sampai di sini</h3>
      <p>Listing dan pantauan ada di langkah yang kamu selesaikan. Kalau mau dibimbing mentor, atau ikut kelompok berikutnya, catat minatmu di Edukasi.</p>
      <button type="button" class="btn-primary" data-blj-action="edukasi">Buka Edukasi</button>
    </section>` : (next ? `<section class="blj-next-card">
      <p class="blj-kicker">Langkah berikutnya</p>
      <button type="button" class="blj-next-go" data-blj-lesson="${esc(next.slug)}">
        <strong>${esc(next.title)}</strong>
        <span>${esc(next.module_title || '')}</span>
      </button>
    </section>` : '')}
    <div class="blj-track" role="group" aria-label="Pengalaman toko">
      <button type="button" data-blj-track="new" aria-pressed="${existing ? 'false' : 'true'}">Belum punya toko</button>
      <button type="button" data-blj-track="existing" aria-pressed="${existing ? 'true' : 'false'}">Sudah punya toko</button>
    </div>
    ${existing ? '<p class="blj-quiet">Modul 1–4 tetap bisa dibuka. Yang dihitung: pantau kompetitor, plus pelajaran awal yang kamu selesaikan. Tidak ada yang ditandai selesai kalau kamu belum mengerjakannya.</p>' : ''}
    <div class="blj-platforms">
      <p class="blj-kicker">Toko yang mau kamu buka</p>
      <div class="blj-chips">${chips}</div>
      <p class="blj-quiet">Hanya platform yang dicentang yang masuk hitungan. Data LarisID adalah data Shopee.</p>
    </div>
    <div class="blj-modules">${mods}</div>`;
  }

  function paint() {
    const el = rootEl();
    if (!el || !_course) return;
    const found = _lessonSlug ? lessonBySlug(_lessonSlug) : null;
    if (_lessonSlug && !found) _lessonSlug = null;
    scrollTopIfNeeded(_lessonSlug || 'home');
    el.innerHTML = found ? lessonHtml(found) : homeHtml();
    const box = el.querySelector('[data-blj-dots]');
    const cur = box && box.querySelector('.is-current');
    if (box && cur) {
      box.scrollLeft = Math.max(0, cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2);
    }
  }

  async function load(opts) {
    const el = rootEl();
    const gen = ++_loadGen;
    if (el && !_course) el.innerHTML = '<p class="blj-loading">Menyusun materi…</p>';
    try {
      const data = await rpc('belajar_course');
      if (gen !== _loadGen) return;
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = data;
      paint();
      if (opts && opts.entry && _ctx && _ctx.log) {
        _ctx.log('belajar_open', { ui: 'gpt', track: data.track || '' });
      }
    } catch (err) {
      if (gen !== _loadGen) return;
      if (el) {
        el.innerHTML = '<p class="blj-loading">Materi belum bisa dimuat.</p><button type="button" class="btn-primary" data-blj-retry>Coba lagi</button>';
      }
      try { console.warn('[belajar]', err); } catch (_) {}
    }
  }

  function readAnswers(scope) {
    const out = {};
    if (!scope) return out;
    scope.querySelectorAll('[data-blj-answer]').forEach((node) => {
      out[node.getAttribute('data-blj-answer')] = node.value || '';
    });
    return out;
  }

  async function mark(status) {
    if (_busy || !_lessonSlug) return;
    const found = lessonBySlug(_lessonSlug);
    if (!found) return;
    if (status === 'skipped') {
      const ok = global.confirm('Lewati langkah ini? Tidak dihitung selesai.');
      if (!ok) return;
    }
    _busy = true;
    const article = rootEl() && rootEl().querySelector('.blj-lesson');
    try {
      const data = await rpc('belajar_mark_lesson', {
        p_lesson: found.lesson.id,
        p_status: status,
        p_answers: readAnswers(article),
      });
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = data;
      if (status === 'done' && _ctx && _ctx.log) {
        _ctx.log('belajar_lesson_done', { ui: 'gpt', slug: found.lesson.slug });
      }
      if (status === 'done' && _ctx && _ctx.open) {
        const step = neighbor(1);
        const fallback = data.progress && data.progress.next;
        const slug = step ? step.lesson.slug : (fallback && fallback.slug ? fallback.slug : null);
        _ctx.open(slug);
      } else {
        paint();
      }
      if (_ctx && _ctx.toast) {
        _ctx.toast(status === 'done' ? 'Ditandai selesai.' : status === 'skipped' ? 'Langkah dilewati.' : status === 'clear' ? 'Langkah dibuka lagi.' : 'Jawaban tersimpan.');
      }
    } catch (err) {
      if (_ctx && _ctx.toast) _ctx.toast('Belum tersimpan. Coba lagi.');
      try { console.warn('[belajar]', err); } catch (_) {}
    } finally {
      _busy = false;
    }
  }

  async function setState(track, platforms) {
    if (_busy || !_course) return;
    _busy = true;
    try {
      const data = await rpc('belajar_set_state', { p_track: track, p_platforms: platforms });
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = data;
      paint();
      if (_ctx && _ctx.log) {
        _ctx.log('belajar_track_set', { ui: 'gpt', track: track, platforms: platforms });
      }
    } catch (err) {
      if (_ctx && _ctx.toast) _ctx.toast('Pilihan belum tersimpan.');
      try { console.warn('[belajar]', err); } catch (_) {}
    } finally {
      _busy = false;
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-blj-lesson],[data-blj-back],[data-blj-track],[data-blj-platform],[data-blj-done],[data-blj-skip],[data-blj-draft],[data-blj-clear],[data-blj-action],[data-blj-yt],[data-blj-retry],[data-blj-step]');
    if (!el || !rootEl() || !rootEl().contains(el)) return;
    if (el.hasAttribute('data-blj-retry')) {
      e.preventDefault();
      void load();
      return;
    }
    if (el.hasAttribute('data-blj-yt')) {
      e.preventDefault();
      const id = el.getAttribute('data-blj-yt') || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
      const frame = document.createElement('div');
      frame.className = 'blj-frame';
      frame.innerHTML = `<iframe title="Video" src="https://www.youtube-nocookie.com/embed/${id}?rel=0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      el.replaceWith(frame);
      return;
    }
    if (el.hasAttribute('data-blj-step')) {
      e.preventDefault();
      if (el.disabled) return;
      const dir = Number(el.getAttribute('data-blj-step'));
      const next = neighbor(dir);
      if (next && _ctx && _ctx.open) _ctx.open(next.lesson.slug);
      return;
    }
    if (el.hasAttribute('data-blj-lesson')) {
      e.preventDefault();
      const slug = el.getAttribute('data-blj-lesson');
      if (_ctx && _ctx.open) _ctx.open(slug);
      return;
    }
    if (el.hasAttribute('data-blj-back')) {
      e.preventDefault();
      if (_ctx && _ctx.open) _ctx.open(null);
      return;
    }
    if (el.hasAttribute('data-blj-track')) {
      e.preventDefault();
      void setState(el.getAttribute('data-blj-track'), arr(_course && _course.platforms));
      return;
    }
    if (el.hasAttribute('data-blj-platform')) {
      e.preventDefault();
      const id = el.getAttribute('data-blj-platform');
      const cur = arr(_course && _course.platforms);
      const next = cur.includes(id) ? cur.filter((p) => p !== id) : cur.concat(id);
      void setState((_course && _course.track) || 'new', next);
      return;
    }
    if (el.hasAttribute('data-blj-action')) {
      e.preventDefault();
      if (_ctx && _ctx.action) _ctx.action(el.getAttribute('data-blj-action'));
      return;
    }
    if (el.hasAttribute('data-blj-done')) { e.preventDefault(); void mark('done'); return; }
    if (el.hasAttribute('data-blj-skip')) { e.preventDefault(); void mark('skipped'); return; }
    if (el.hasAttribute('data-blj-draft')) { e.preventDefault(); void mark('draft'); return; }
    if (el.hasAttribute('data-blj-clear')) { e.preventDefault(); void mark('clear'); return; }
  }

  function ensureBound() {
    const el = rootEl();
    if (!el || _bound) return;
    _bound = true;
    el.addEventListener('click', onClick);
  }

  function render(ctx, opts) {
    _ctx = ctx || _ctx;
    opts = opts || {};
    ensureBound();
    const slug = opts.lesson || null;
    const changed = slug !== _lessonSlug;
    _lessonSlug = slug;
    if (changed && _lessonSlug && _ctx && _ctx.log) {
      _ctx.log('belajar_lesson_open', { ui: 'gpt', slug: _lessonSlug });
    }
    if (!_course || opts.entry) {
      if (_course) paint();
      return load(opts);
    }
    paint();
    return undefined;
  }

  async function syncHome(ctx) {
    _ctx = ctx || _ctx;
    const card = document.getElementById('home-belajar');
    if (!card) return;
    if (!_ctx || !_ctx.user || !_ctx.supabase) {
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    try {
      const { data, error } = await _ctx.supabase.rpc('belajar_course');
      if (error || !data || data.ok === false) {
        card.hidden = true;
        return;
      }
      _course = data;
      const p = data.progress || {};
      const next = p.next || null;
      const finished = (p.total || 0) > 0 && (p.done || 0) >= p.total && !next;
      const title = next ? next.title : (finished ? 'Kursus selesai' : 'Dari cari produk sampai pantau kompetitor');
      const label = next ? 'Lanjut belajar' : (finished ? 'Lihat lagi' : 'Mulai belajar');
      card.hidden = false;
      card.innerHTML = `<p class="home-ret-kicker">Belajar · ${p.done || 0} dari ${p.total || 0}</p>
        <h2>${esc(title)}</h2>
        <button type="button" class="home-ret-link" data-home-belajar>${esc(label)}</button>`;
      card.querySelector('[data-home-belajar]').addEventListener('click', () => {
        if (_ctx && _ctx.open) _ctx.open(next ? next.slug : null);
      });
    } catch (_) {
      card.hidden = true;
    }
  }

  function pretty(value, empty) {
    if (value == null) return empty;
    try { return JSON.stringify(value, null, 2); } catch (_) { return empty; }
  }

  function moduleAdmin(mod) {
    const lessons = arr(mod.lessons).map((lesson) => {
      const kinds = ['text', 'document', 'video', 'tool'].map((k) =>
        `<option value="${k}"${lesson.kind === k ? ' selected' : ''}>${k}</option>`).join('');
      const plats = [{ id: '', label: 'Semua' }].concat(PLATFORMS).map((pl) =>
        `<option value="${pl.id}"${(lesson.platform || '') === pl.id ? ' selected' : ''}>${esc(pl.label)}</option>`).join('');
      return `<details class="blj-admin-lesson">
        <summary>${esc(lesson.title)} <em>${lesson.done || 0} selesai · ${lesson.skipped || 0} lewati${lesson.published ? '' : ' · disembunyikan'}</em></summary>
        <form class="blj-admin-form" data-lesson-id="${esc(lesson.id)}">
          <label>Judul <input name="title" value="${esc(lesson.title)}"></label>
          <label>URL <input name="url" value="${esc(lesson.url || '')}"></label>
          <div class="blj-admin-row">
            <label>Jenis <select name="kind">${kinds}</select></label>
            <label>Platform <select name="platform">${plats}</select></label>
            <label>Menit <input name="mins" type="number" min="0" max="180" value="${lesson.est_mins || 0}"></label>
            <label>Urutan <input name="sort" type="number" value="${lesson.sort_order || 0}"></label>
            <label class="blj-admin-check"><input name="published" type="checkbox"${lesson.published ? ' checked' : ''}> Tayang</label>
          </div>
          <label>Isi <textarea name="body" rows="8">${esc(lesson.body || '')}</textarea></label>
          <label>Poin (JSON array) <textarea name="points" rows="4">${esc(pretty(lesson.points, '[]'))}</textarea></label>
          <label>Bacaan (JSON array) <textarea name="resources" rows="4">${esc(pretty(lesson.resources, '[]'))}</textarea></label>
          <label>Pertanyaan (JSON array) <textarea name="questions" rows="4">${esc(pretty(lesson.questions, '[]'))}</textarea></label>
          <label>Aksi (JSON object atau kosong) <textarea name="action" rows="3">${esc(pretty(lesson.action, ''))}</textarea></label>
          <p class="blj-admin-err" data-err></p>
          <button type="submit" class="btn-primary">Simpan pelajaran</button>
        </form>
      </details>`;
    }).join('');
    return `<section class="blj-admin-mod">
      <form class="blj-admin-form" data-module-id="${esc(mod.id)}">
        <div class="blj-admin-row">
          <label>Modul <input name="title" value="${esc(mod.title || '')}"></label>
          <label>Urutan <input name="sort" type="number" value="${mod.sort_order || 0}"></label>
          <label class="blj-admin-check"><input name="published" type="checkbox"${mod.published ? ' checked' : ''}> Tayang</label>
        </div>
        <label>Subjudul <input name="subtitle" value="${esc(mod.subtitle || '')}"></label>
        <p class="blj-admin-err" data-err></p>
        <button type="submit" class="btn-ghost">Simpan modul</button>
      </form>
      ${lessons}
    </section>`;
  }

  function field(form, name) {
    const node = form.elements[name];
    if (!node) return '';
    if (node.type === 'checkbox') return node.checked;
    return node.value;
  }

  async function saveAdmin(form) {
    const errEl = form.querySelector('[data-err]');
    if (errEl) errEl.textContent = '';
    const lessonId = form.getAttribute('data-lesson-id');
    const moduleId = form.getAttribute('data-module-id');
    try {
      let data;
      if (moduleId) {
        data = await rpc('belajar_admin_save_module', {
          p_id: moduleId,
          p_title: String(field(form, 'title') || ''),
          p_subtitle: String(field(form, 'subtitle') || ''),
          p_sort: Number(field(form, 'sort')),
          p_published: !!field(form, 'published'),
        });
      } else if (lessonId) {
        const actionRaw = String(field(form, 'action') || '').trim();
        data = await rpc('belajar_admin_save_lesson', {
          p_id: lessonId,
          p_title: String(field(form, 'title') || ''),
          p_kind: String(field(form, 'kind') || 'text'),
          p_url: String(field(form, 'url') || ''),
          p_body: String(field(form, 'body') || ''),
          p_points: JSON.parse(String(field(form, 'points') || '[]')),
          p_resources: JSON.parse(String(field(form, 'resources') || '[]')),
          p_questions: JSON.parse(String(field(form, 'questions') || '[]')),
          p_action: actionRaw ? JSON.parse(actionRaw) : null,
          p_platform: String(field(form, 'platform') || ''),
          p_est_mins: Number(field(form, 'mins')),
          p_sort: Number(field(form, 'sort')),
          p_published: !!field(form, 'published'),
        });
      }
      if (!data || data.ok === false) throw new Error((data && data.error) || 'gagal');
      _course = null;
      if (_ctx && _ctx.toast) _ctx.toast('Tersimpan.');
      await loadAdmin(_ctx);
    } catch (err) {
      const msg = (err && err.message) ? String(err.message) : 'Gagal menyimpan.';
      if (errEl) errEl.textContent = msg;
    }
  }

  function ensureAdminBound() {
    const body = document.getElementById('adm-belajar-body');
    if (!body || _adminBound) return;
    _adminBound = true;
    body.addEventListener('submit', (e) => {
      const form = e.target.closest('form');
      if (!form || !body.contains(form)) return;
      e.preventDefault();
      void saveAdmin(form);
    });
  }

  async function loadAdmin(ctx) {
    _ctx = ctx || _ctx;
    const body = document.getElementById('adm-belajar-body');
    const sum = document.getElementById('adm-belajar-summary');
    if (!body) return;
    ensureAdminBound();
    if (sum) sum.textContent = 'Memuat…';
    try {
      const data = await rpc('belajar_admin_overview');
      if (!data || data.ok === false) {
        if (sum) sum.textContent = (data && data.error === 'admin_only') ? 'Admin only.' : 'Gagal memuat kurikulum.';
        body.innerHTML = '';
        return;
      }
      if (sum) {
        sum.textContent = `${data.learners || 0} orang mulai · ${data.completed || 0} menyelesaikan semua langkah yang dihitung. Menyimpan di sini mengganti salinan live.`;
      }
      body.innerHTML = arr(data.modules).map(moduleAdmin).join('') || '<p class="dd-sub">Belum ada modul.</p>';
    } catch (err) {
      if (sum) sum.textContent = 'Gagal memuat kurikulum.';
      try { console.warn('[belajar-admin]', err); } catch (_) {}
    }
  }

  global.LarisBelajar = { render, syncHome, loadAdmin };
})(window);
