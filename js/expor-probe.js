/**
 * Interest form for LarisExpor. Posts to public.expor_interest as anon
 * (or as the signed-in user when LARIS_AUTH already has a session).
 *
 * Loaded after js/laris-auth.js (both defer, this file second) so headers()
 * is available. Never blocks page render; a failed insert is a message, not a throw.
 */
(function () {
  'use strict';

  var form = document.getElementById('probe-form');
  if (!form) return;

  var emailEl = document.getElementById('probe-email');
  var needEl = document.getElementById('probe-need');
  var noteEl = document.getElementById('probe-note');
  var msg = document.getElementById('probe-msg');
  var btn = form.querySelector('button[type="submit"]');
  var auth = window.LARIS_AUTH;
  var URL = (auth && auth.SUPA_URL ? auth.SUPA_URL : 'https://api.larisid.com') + '/rest/v1/expor_interest';

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = (emailEl && emailEl.value || '').trim();
    var need = (needEl && needEl.value) || '';
    var note = (noteEl && noteEl.value || '').trim();
    if (!email || !need) return;

    btn.disabled = true;
    msg.className = 'probe-msg';
    msg.textContent = 'Mengirim…';

    var body = {
      email: email,
      need: need,
      note: note || null,
      context: form.getAttribute('data-context') || '',
    };
    var user = auth && auth.user ? auth.user() : null;
    if (user && user.id) body.user_id = user.id;

    var headers = auth && auth.headers
      ? auth.headers({ Prefer: 'return=minimal' })
      : { 'Content-Type': 'application/json', Prefer: 'return=minimal' };

    fetch(URL, { method: 'POST', headers: headers, body: JSON.stringify(body) })
      .then(function (r) {
        if (!r.ok) return r.text().then(function () { throw new Error('insert failed'); });
        msg.className = 'probe-msg ok';
        msg.textContent = 'Terima kasih. Itu yang kami butuhkan untuk memutuskan bagian mana yang dibangun dulu.';
        form.reset();
        btn.disabled = false;
      })
      .catch(function () {
        msg.className = 'probe-msg err';
        msg.textContent = 'Gagal mengirim. Coba lagi dalam beberapa saat.';
        btn.disabled = false;
      });
  });
})();
