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

  var injectedStyle = false;
  function ensureStyle() {
    if (injectedStyle) return;
    injectedStyle = true;
    var style = document.createElement('style');
    style.textContent = [
      '#winback-admin { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 14px; background: #1e1e1e; color: #e0e0e0; padding: 24px; border-radius: 12px; max-width: 100%; }',
      '#winback-admin h2 { margin: 0 0 20px; color: #fff; }',
      '#winback-admin label { display: block; font-weight: 600; margin: 12px 0 4px; color: #bbb; }',
      '#winback-admin select, #winback-admin input { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 6px; border: 1px solid #444; background: #2a2a2a; color: #f0f0f0; font-size: 14px; margin-bottom: 8px; }',
      '#winback-admin select:focus, #winback-admin input:focus { outline: 2px solid #B5202A; outline-offset: 1px; }',
      '#winback-admin .wb-btn-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }',
      '#winback-admin .wb-btn { padding: 10px 18px; border-radius: 6px; border: none; font-weight: 700; cursor: pointer; font-size: 14px; color: #fff; }',
      '#winback-admin .wb-btn:disabled { opacity: 0.4; cursor: not-allowed; }',
      '#winback-admin .wb-btn-dry { background: #4a4a4a; }',
      '#winback-admin .wb-btn-test { background: #2a5298; }',
      '#winback-admin .wb-btn-send { background: #B5202A; border: 2px solid #dd3333; }',
      '#winback-admin .wb-out { margin-top: 20px; min-height: 40px; }',
      '#winback-admin .wb-table-wrap { overflow-x: auto; max-width: 100%; margin-top: 12px; }',
      '#winback-admin table { width: 100%; border-collapse: collapse; font-size: 13px; }',
      '#winback-admin th { background: #333; color: #ddd; text-align: left; padding: 8px; white-space: nowrap; }',
      '#winback-admin td { padding: 8px; border-bottom: 1px solid #444; vertical-align: top; }',
      '#winback-admin .wb-err { color: #ff7b7b; font-weight: 600; }',
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
    return body;
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
      var html = '<p>Terkirim <strong>' + sent + '</strong> dari <strong>' + total + '</strong></p>';
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

    var token = _supaAccessTokenSync();
    if (!token) {
      out.innerHTML = '<div class="wb-err">Token tidak tersedia. Sesi mungkin habis. Coba login ulang.</div>';
      setButtonsDisabled(false);
      return;
    }

    var body = buildBody(mode);
    try {
      var response = await fetch(SUPA_URL + '/functions/v1/send-winback', {
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

  function mount(el) {
    if (!isPlatformAdmin()) return;
    ensureStyle();

    el.id = 'winback-admin';
    el.innerHTML = [
      '<h2>Kampanye Win-back</h2>',
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
      '<label for="wb-max">Batas kirim (ramp)</label>',
      '<input id="wb-max" type="number" min="1" max="200" value="20">',
      '<label for="wb-test">Kirim uji ke</label>',
      '<input id="wb-test" type="email" value="stevenwilson614@gmail.com">',
      '<div class="wb-btn-row">',
        '<button id="wb-dry" class="wb-btn wb-btn-dry">Lihat rencana (dry run)</button>',
        '<button id="wb-test-btn" class="wb-btn wb-btn-test">Kirim uji ke saya</button>',
        '<button id="wb-send" class="wb-btn wb-btn-send">KIRIM GELOMBANG</button>',
      '</div>',
      '<div id="wb-out" class="wb-out"></div>',
    ].join('');

    get('wb-dry').addEventListener('click', function () { run('dry'); });
    get('wb-test-btn').addEventListener('click', function () { run('test'); });
    get('wb-send').addEventListener('click', function () { run('send'); });
  }

  window.WinbackAdmin = {
    mount: mount,
    run: run
  };
})();
