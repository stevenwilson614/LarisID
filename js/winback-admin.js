(function () {
  'use strict';

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // Dependency bindings, set once by mount(). Default to the bare global
  // identifiers Site A already relies on (classic <script> tags share one
  // lexical scope there) so A's existing no-arg `WinbackAdmin.mount(el)` call
  // keeps working unchanged. Site B's js/gpt-app.js is wrapped in its own
  // top-level IIFE, so those bare identifiers don't resolve inside it, and B
  // deletes the Supabase SDK's own default auth-token localStorage key on
  // boot -- _supaAccessTokenSync() would silently return null there. B must
  // pass all four explicitly via the `deps` param.
  var _supabase_ = null;
  var _isAdmin_ = function () { return false; };
  var _getToken_ = function () { return null; };
  var _supaUrl_ = '';

  var injectedStyle = false;
  function ensureStyle() {
    if (injectedStyle) return;
    injectedStyle = true;
    var style = document.createElement('style');
    // Light palette to match the surrounding admin cards (#1A1A1A text, #6B7280
    // muted, #E5E7EB borders, #E8442A brand red). The admin UI is light; a dark
    // panel here would read as a foreign widget.
    style.textContent = [
      '.wb-admin { font-size: 14px; color: #1A1A1A; }',
      '.wb-admin label { display: block; font-weight: 700; margin: 12px 0 4px; color: #6B7280; font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; }',
      '.wb-admin select, .wb-admin input, .wb-admin textarea { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 6px; border: 1px solid #E5E7EB; background: #fff; color: #1A1A1A; font-size: 14px; margin-bottom: 8px; font-family: inherit; }',
      '.wb-admin select:focus, .wb-admin input:focus, .wb-admin textarea:focus { outline: 2px solid #E8442A; outline-offset: 1px; }',
      '.wb-admin .wb-btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }',
      '.wb-admin .wb-btn { padding: 10px 18px; border-radius: 6px; border: 1px solid #E5E7EB; font-weight: 700; cursor: pointer; font-size: 14px; background: #fff; color: #1A1A1A; }',
      '.wb-admin .wb-btn:disabled { opacity: .45; cursor: not-allowed; }',
      '.wb-admin .wb-btn-test { border-color: #1A1F3C; color: #1A1F3C; }',
      // The only irreversible button, so it is the only filled one.
      '.wb-admin .wb-btn-send { background: #E8442A; border-color: #E8442A; color: #fff; }',
      '.wb-admin .wb-out { margin-top: 18px; min-height: 24px; }',
      '.wb-admin .wb-table-wrap { overflow-x: auto; max-width: 100%; margin-top: 12px; }',
      '.wb-admin table { width: 100%; border-collapse: collapse; font-size: 13px; }',
      '.wb-admin th { background: #F5F5F4; color: #6B7280; text-align: left; padding: 8px; white-space: nowrap; }',
      '.wb-admin td { padding: 8px; border-bottom: 1px solid #F3F4F6; vertical-align: top; }',
      '.wb-admin .wb-err { color: #B5202A; font-weight: 700; }',
      '.wb-admin pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; }',
      '.wb-admin .wb-hr { border: 0; border-top: 1px solid #E5E7EB; margin: 22px 0 16px; }',
      '.wb-admin .wb-hourbar-row { display: flex; align-items: center; gap: 8px; font-size: 12px; margin: 2px 0; }',
      '.wb-admin .wb-hourbar-label { width: 34px; color: #6B7280; flex: none; text-align: right; }',
      '.wb-admin .wb-hourbar-track { flex: 1; background: #F5F5F4; border-radius: 3px; height: 14px; overflow: hidden; }',
      '.wb-admin .wb-hourbar-fill { background: #E8442A; height: 100%; }',
      '.wb-admin .wb-hourbar-count { width: 28px; flex: none; color: #6B7280; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function get(id) { return document.getElementById(id); }

  function setButtonsDisabled(disabled) {
    var dry = get('wb-dry');
    var test = get('wb-test-btn');
    var send = get('wb-send');
    if (dry) dry.disabled = disabled;
    if (test) test.disabled = disabled;
    if (send) send.disabled = disabled;
  }

  function buildBody(mode) {
    var campaignSel = get('wb-campaign');
    var testInp = get('wb-test');
    var maxInp = get('wb-max');
    var body = { campaign: campaignSel ? campaignSel.value : 'wb1_a' };
    if (mode === 'dry') {
      body.dry_run = true;
    } else if (mode === 'test') {
      body.test_to = testInp ? testInp.value.trim() : '';
      body.max_sends = 1;
    } else if (mode === 'send') {
      var v = maxInp ? parseInt(maxInp.value, 10) : 20;
      if (isNaN(v) || v < 1) v = 1;
      if (v > 200) v = 200;
      body.max_sends = v;
    }
    // wb4_bedah has no automated data source: the market and its one-line
    // insight are picked by hand, and send-winback rejects the campaign without
    // them. Parse the textarea so selecting it cannot silently 400.
    if (body.campaign === 'wb4_bedah') {
      var raw = (get('wb-pasar') || {}).value || '';
      if (!raw.trim()) throw new Error('Kampanye wb4_bedah butuh data pasar (JSON) di kolom bawah.');
      try {
        body.pasar = JSON.parse(raw);
      } catch (e) {
        throw new Error('Data pasar bukan JSON yang valid: ' + e.message);
      }
    }
    return body;
  }

  // Shown only for wb4_bedah.
  function syncPasarVisibility() {
    var wrap = get('wb-pasar-wrap');
    var sel = get('wb-campaign');
    if (wrap && sel) wrap.style.display = sel.value === 'wb4_bedah' ? '' : 'none';
  }

  function renderResult(data, mode, out) {
    if (!data) {
      out.innerHTML = '<div class="wb-err">Respon kosong.</div>';
      return;
    }
    if (mode === 'dry' && data.recipients && Array.isArray(data.recipients)) {
      var html = '<p>' + escapeHtml(String(data.count)) + ' penerima</p>';
      html += '<div class="wb-table-wrap"><table><thead><tr><th>Email</th><th>Segmen</th><th>Nama</th><th>Kota</th><th>Subject</th></tr></thead><tbody>';
      data.recipients.forEach(function(r) {
        html += '<tr>' +
          '<td>' + escapeHtml(r.email) + '</td>' +
          '<td>' + escapeHtml(r.segment) + '</td>' +
          '<td>' + escapeHtml(r.nama) + '</td>' +
          '<td>' + escapeHtml(r.kota) + '</td>' +
          '<td>' + escapeHtml(r.subject) + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
      out.innerHTML = html;
    } else {
      var sent = data.sent || 0;
      var total = data.total_targets || 0;
      var failed = data.failed || [];
      var html = '<p>Terkirim <strong>' + escapeHtml(sent) + '</strong> dari <strong>' + escapeHtml(total) + '</strong></p>';
      if (data.note) html += '<p>' + escapeHtml(data.note) + '</p>';
      if (failed.length) {
        html += '<ul>';
        failed.forEach(function(f) {
          html += '<li>' + escapeHtml(f.email) + ' - ' + escapeHtml(f.error) + '</li>';
        });
        html += '</ul>';
      }
      out.innerHTML = html;
    }
  }

  async function run(mode) {
    var out = get('wb-out');
    if (!out) return;

    if (mode === 'send') {
      var campaignSel = get('wb-campaign');
      var camValue = campaignSel ? campaignSel.value : '';
      var typed = window.prompt('Ketik ulang campaign id untuk mengonfirmasi pengiriman sebenarnya', '');
      if (typed !== camValue) {
        out.innerHTML = '<div class="wb-err">Konfirmasi dibatalkan — campaign id tidak cocok.</div>';
        return;
      }
    }

    out.innerHTML = 'Menjalankan...';
    setButtonsDisabled(true);

    var token = _getToken_();
    if (!token) {
      out.innerHTML = '<div class="wb-err">Token tidak tersedia. Sesi mungkin habis. Coba login ulang.</div>';
      setButtonsDisabled(false);
      return;
    }

    var body;
    try {
      body = buildBody(mode);
    } catch (e) {
      out.innerHTML = '<div class="wb-err">' + escapeHtml(e.message) + '</div>';
      setButtonsDisabled(false);
      return;
    }

    try {
      var response = await fetch(_supaUrl_ + '/functions/v1/send-winback', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        var errText = await response.text().catch(function() { return 'No response body'; });
        out.innerHTML = '<div class="wb-err">Server error ' + response.status + ':</div><pre>' + escapeHtml(errText) + '</pre>';
        return;
      }

      var data = await response.json();
      renderResult(data, mode, out);
    } catch (e) {
      out.innerHTML = '<div class="wb-err">Gagal menghubungi server: ' + escapeHtml(e.message) + '</div>';
    } finally {
      setButtonsDisabled(false);
    }
  }

  function fmtPct(v) { return (v == null ? '-' : escapeHtml(v) + '%'); }
  function fmtNum(v) { return (v == null ? '-' : escapeHtml(v)); }
  function fmtMin(v) { return (v == null ? '-' : escapeHtml(v) + ' mnt'); }

  function renderStatsTable(rows) {
    if (!rows || !rows.length) return '<p>Belum ada data terkirim.</p>';
    var html = '<div class="wb-table-wrap"><table><thead><tr>' +
      '<th>Kampanye</th><th>Terkirim</th><th>Delivered</th><th>Dibuka</th><th>Open rate</th>' +
      '<th>Bounce</th><th>Komplain</th><th>Klaim</th><th>Claim rate</th><th>Rata2 buka</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr>' +
        '<td>' + escapeHtml(r.campaign) + '</td>' +
        '<td>' + fmtNum(r.sent) + '</td>' +
        '<td>' + fmtNum(r.delivered) + '</td>' +
        '<td>' + fmtNum(r.opened) + '</td>' +
        '<td>' + fmtPct(r.open_rate) + '</td>' +
        '<td>' + fmtNum(r.bounced) + '</td>' +
        '<td>' + fmtNum(r.complained) + '</td>' +
        '<td>' + fmtNum(r.claimed) + '</td>' +
        '<td>' + fmtPct(r.claim_rate) + '</td>' +
        '<td>' + fmtMin(r.avg_minutes_to_open) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderHourHistogram(rows) {
    var byHour = {};
    (rows || []).forEach(function (r) { byHour[r.hour_wib] = Number(r.opens) || 0; });
    var max = 0;
    for (var h = 0; h < 24; h++) max = Math.max(max, byHour[h] || 0);
    if (max === 0) return '<p>Belum ada bukaan tercatat.</p>';
    var html = '';
    for (var i = 0; i < 24; i++) {
      var n = byHour[i] || 0;
      var pct = Math.round((n / max) * 100);
      html += '<div class="wb-hourbar-row">' +
        '<div class="wb-hourbar-label">' + String(i).padStart(2, '0') + ':00</div>' +
        '<div class="wb-hourbar-track"><div class="wb-hourbar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="wb-hourbar-count">' + n + '</div>' +
        '</div>';
    }
    return html;
  }

  async function runStats() {
    var out = get('wb-stats-out');
    if (!out || !_supabase_) return;
    out.innerHTML = 'Memuat statistik...';
    try {
      var statsRes = await _supabase_.rpc('winback_campaign_stats');
      var histRes = await _supabase_.rpc('winback_open_hour_histogram', { p_campaign: null });
      if (statsRes.error) throw statsRes.error;
      if (histRes.error) throw histRes.error;
      out.innerHTML =
        '<p style="font-weight:700;margin-bottom:8px;">Per kampanye</p>' +
        renderStatsTable(statsRes.data) +
        '<p style="font-weight:700;margin:18px 0 8px;">Jam buka (WIB), semua kampanye</p>' +
        '<p style="font-size:.7rem;color:#6B7280;margin-bottom:8px;">Angka bisa meleset ke dua arah: klien yang memblokir gambar tidak pernah tercatat (undercount), dan Apple Mail Privacy Protection membuka pixel otomatis untuk semua penerima Apple Mail terlepas dibaca atau tidak (overcount). Baca sebagai arah, bukan angka pasti.</p>' +
        renderHourHistogram(histRes.data);
    } catch (e) {
      out.innerHTML = '<div class="wb-err">Gagal memuat statistik: ' + escapeHtml(e.message || String(e)) + '</div>';
    }
  }

  // mount(el) — Site A's existing call site, unchanged.
  // mount(el, deps) — deps: { supabase, isAdmin, supaUrl, getToken }. Any key
  // omitted falls back to the bare-global default above, so a caller can pass
  // only what its scope actually has.
  function mount(el, deps) {
    _supabase_ = (deps && deps.supabase) || (typeof _supabase !== 'undefined' ? _supabase : null);
    _isAdmin_  = (deps && deps.isAdmin)  || (typeof isPlatformAdmin === 'function' ? isPlatformAdmin : function () { return false; });
    _getToken_ = (deps && deps.getToken) || (typeof _supaAccessTokenSync === 'function' ? _supaAccessTokenSync : function () { return null; });
    _supaUrl_  = (deps && deps.supaUrl)  || (typeof SUPA_URL !== 'undefined' ? SUPA_URL : '');

    if (!el || !_isAdmin_()) return;
    ensureStyle();

    // Add a class rather than overwriting el.id -- the caller's id is how the
    // rest of the admin page finds this container.
    el.classList.add('wb-admin');
    el.innerHTML = [
      '<div class="adm-section-title" style="margin-bottom:2px;">Kampanye Win-back</div>',
      '<div style="font-size:.7rem;color:#6B7280;margin-bottom:6px;">Selalu jalankan dry run dulu. Kirim uji ke diri sendiri sebelum gelombang asli.</div>',
      '<label for="wb-campaign">Kampanye</label>',
      '<select id="wb-campaign">',
        '<option value="wb1_a">wb1_a - Hari 0, segmen A (belum pernah deep dive)</option>',
        '<option value="wb1_b">wb1_b - Hari 0, segmen B (1-4 deep dive)</option>',
        '<option value="wb1_c">wb1_c - Hari 0, segmen C (5+ deep dive, teks polos)</option>',
        '<option value="wb2_kota">wb2_kota - Hari 3, daftar produk kota</option>',
        '<option value="wb3_pantau_a">wb3_pantau_a - Hari 7, sudah klaim akses</option>',
        '<option value="wb3_pantau_b">wb3_pantau_b - Hari 7, belum klaim akses</option>',
        '<option value="wb4_bedah">wb4_bedah - Hari 21, bedah satu pasar</option>',
        '<option value="wb5_sunset">wb5_sunset - Hari 45, penutup</option>',
      '</select>',
      '<div id="wb-pasar-wrap" style="display:none;">',
        '<label for="wb-pasar">Data pasar (JSON, wajib untuk wb4_bedah)</label>',
        '<textarea id="wb-pasar" rows="6" spellcheck="false">' +
          escapeHtml(JSON.stringify({
            nama_pasar: 'jilbab anak',
            jumlah_penjual: 412,
            omset_bulanan: 3120000000,
            harga_median: 19698,
            harga_min: 7500,
            harga_max: 45000,
            insight: 'ganti dengan satu kalimat temuan yang nyata dari data.',
          }, null, 2)) +
        '</textarea>',
      '</div>',
      '<label for="wb-max">Batas kirim (ramp)</label>',
      '<input id="wb-max" type="number" min="1" max="200" value="20">',
      '<label for="wb-test">Kirim uji ke</label>',
      '<input id="wb-test" type="email" value="stevenwilson614@gmail.com">',
      '<div class="wb-btn-row">',
        '<button type="button" id="wb-dry" class="wb-btn wb-btn-dry">Lihat rencana (dry run)</button>',
        '<button type="button" id="wb-test-btn" class="wb-btn wb-btn-test">Kirim uji ke saya</button>',
        '<button type="button" id="wb-send" class="wb-btn wb-btn-send">KIRIM GELOMBANG</button>',
      '</div>',
      '<div id="wb-out" class="wb-out"></div>',
      '<hr class="wb-hr">',
      '<div class="wb-btn-row" style="margin-top:0;">',
        '<button type="button" id="wb-stats-btn" class="wb-btn wb-btn-test">Lihat statistik</button>',
      '</div>',
      '<div id="wb-stats-out" class="wb-out"></div>',
    ].join('');

    get('wb-dry').addEventListener('click', function () { run('dry'); });
    get('wb-test-btn').addEventListener('click', function () { run('test'); });
    get('wb-send').addEventListener('click', function () { run('send'); });
    get('wb-stats-btn').addEventListener('click', runStats);
    get('wb-campaign').addEventListener('change', syncPasarVisibility);
    syncPasarVisibility();
  }

  window.WinbackAdmin = {
    mount: mount,
    run: run
  };
})();
