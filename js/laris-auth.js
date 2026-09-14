/**
 * LARIS_AUTH -- minimal session client for pages outside the main app bundle.
 *
 * Why this exists: /expor/ needs to know who is signed in, but js/gpt-app.js is 1.13 MB
 * and loading it on a static page to read one localStorage key would be absurd. This is a
 * ~150-line read-mostly client over the SAME session store.
 *
 * The session carries over for free. LarisExpor lives at larisid.com/expor/, the same
 * ORIGIN as the main app, so the 'laris_auth_v1' localStorage entry that gpt-app.js
 * writes is already readable here -- anyone signed into LarisID arrives signed in, with
 * no redirect and no second login. That is the whole reason /expor/ is a subfolder
 * rather than a subdomain.
 *
 * Shapes are mirrored deliberately from js/gpt-app.js and MUST stay in step:
 *   - key            'laris_auth_v1'                            (gpt-app.js _AUTH_SK)
 *   - stored value   { access_token, refresh_token, expires_at, user }   (_authSave)
 *   - refresh        POST /auth/v1/token?grant_type=refresh_token        (_authRefresh)
 *   - password login POST /auth/v1/token?grant_type=password
 * gpt-app.js is intentionally NOT refactored onto this file: it is huge, a Cursor agent
 * commits to this repo concurrently, and the duplication is cheaper than that risk.
 * If the key or session shape ever changes there, change it here too.
 *
 * Loaded as a plain global-defining script, same convention as js/marketplace-fees.js.
 */
(function (w) {
  'use strict';

  var SUPA_URL = 'https://api.larisid.com';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
  var SK = 'laris_auth_v1';
  var SKEW_MS = 30000;   // refresh this far before real expiry, as gpt-app.js does

  var _session = null;   // in-memory cache for the life of the page
  var _inflight = null;  // de-dupes concurrent getSession() calls

  function load() {
    try { return JSON.parse(w.localStorage.getItem(SK) || 'null'); } catch (_) { return null; }
  }
  function save(d, keepUser) {
    try {
      w.localStorage.setItem(SK, JSON.stringify({
        access_token: d.access_token,
        refresh_token: d.refresh_token,
        expires_at: Date.now() + ((d.expires_in || 3600) * 1000),
        user: d.user || keepUser || decodeUser(d.access_token),
      }));
    } catch (_) {}
  }
  function clear() {
    _session = null;
    try { w.localStorage.removeItem(SK); } catch (_) {}
  }

  /** Read the user out of the access token. A refresh response may omit `user`. */
  function decodeUser(token) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var payload = JSON.parse(decodeURIComponent(escape(w.atob(part))));
      if (!payload.sub) return null;
      return {
        id: payload.sub,
        email: payload.email || '',
        user_metadata: payload.user_metadata || {},
        role: payload.role || 'authenticated',
      };
    } catch (_) { return null; }
  }

  function fresh(s) {
    return !!(s && s.access_token && s.expires_at && s.expires_at > Date.now() + SKEW_MS);
  }

  function refresh(refreshToken) {
    return fetch(SUPA_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      return (d && d.access_token) ? d : null;
    }).catch(function () { return null; });
  }

  /**
   * Resolves to a valid session, or null when signed out.
   * Restores from localStorage and silently refreshes an expired token.
   */
  function getSession() {
    if (fresh(_session)) return Promise.resolve(_session);
    if (_inflight) return _inflight;

    var stored = load();
    if (fresh(stored)) { _session = stored; return Promise.resolve(stored); }
    if (!stored || !stored.refresh_token) { _session = null; return Promise.resolve(null); }

    _inflight = refresh(stored.refresh_token).then(function (d) {
      _inflight = null;
      if (!d) { clear(); return null; }
      save(d, stored.user);
      _session = load();
      return _session;
    });
    return _inflight;
  }

  /** Synchronous best-effort read, for deciding what to paint on first frame. */
  function peek() {
    var s = _session || load();
    return fresh(s) ? s : null;
  }

  function user() {
    var s = peek();
    return s ? (s.user || decodeUser(s.access_token)) : null;
  }

  /**
   * Email + password sign-in against the same GoTrue endpoint the main app uses, writing
   * the same localStorage key -- so this is genuinely one account across both sides.
   * Resolves { ok: true, session } or { ok: false, error }.
   */
  function signIn(email, password) {
    return fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || !d.access_token) {
          return { ok: false, error: d.msg || d.error_description || d.error || 'Login gagal.' };
        }
        save(d);
        _session = load();
        return { ok: true, session: _session };
      });
    }).catch(function () {
      return { ok: false, error: 'Gagal terhubung ke server. Coba lagi.' };
    });
  }

  function signOut() {
    var s = peek();
    if (s && s.access_token) {
      fetch(SUPA_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + s.access_token },
      }).catch(function () {});
    }
    clear();
  }

  /**
   * Headers for a PostgREST/RPC call: the user's JWT when signed in, the anon key when
   * not. Passing the anon key as Authorization is what PostgREST expects for anon access.
   */
  function headers(extra) {
    var s = peek();
    var h = {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + (s && s.access_token ? s.access_token : SUPA_KEY),
      'Content-Type': 'application/json',
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    return h;
  }

  w.LARIS_AUTH = {
    SUPA_URL: SUPA_URL,
    SUPA_KEY: SUPA_KEY,
    STORAGE_KEY: SK,
    getSession: getSession,
    peek: peek,
    user: user,
    isSignedIn: function () { return !!peek(); },
    signIn: signIn,
    signOut: signOut,
    headers: headers,
    decodeUser: decodeUser,
  };
})(window);
