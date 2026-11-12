#!/usr/bin/env node
/**
 * LMS class API contract. Spawns server.mjs with a temp disk and LMS_AUTH_STUB.
 * No production GoTrue, no live volume. Run: node scripts/test-lms-api.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'obrolan.marketing', 'server', 'server.mjs');

let failed = 0;
function ok(name, cond) {
  if (cond) console.log('ok  ' + name);
  else {
    failed += 1;
    console.error('FAIL ' + name);
  }
}
function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) console.log('ok  ' + name);
  else {
    failed += 1;
    console.error('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = addr && addr.port;
      srv.close(() => resolve(port));
    });
  });
}

async function http(port, pathname, opts) {
  const opt = opts || {};
  const headers = {};
  if (opt.token) headers.authorization = 'Bearer ' + opt.token;
  let body;
  if (opt.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opt.body);
  }
  const res = await fetch('http://127.0.0.1:' + port + pathname, {
    method: opt.method || 'GET',
    headers: headers,
    body: body
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch (err) { json = { raw: text.slice(0, 200) }; }
  }
  return { status: res.status, json: json };
}

async function waitHealth(port, child) {
  let last = '';
  for (let i = 0; i < 50; i += 1) {
    if (child.exitCode != null) throw new Error('server exited ' + child.exitCode + '\n' + last);
    try {
      const res = await http(port, '/health');
      if (res.status === 200 && res.json && res.json.ok === true) return;
    } catch (err) { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('health timeout\n' + last);
}

async function stop(child) {
  if (!child || child.exitCode != null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (err) { /* already gone */ }
      resolve();
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-api-'));
  const port = await freePort();
  let stderr = '';
  const child = spawn(process.execPath, [SERVER], {
    env: Object.assign({}, process.env, {
      DATA_DIR: dataDir,
      PORT: String(port),
      LMS_AUTH_STUB: '1',
      LMS_SESSION_SECRET: 'test-lms-session',
      ANTON_ADMIN_KEY: ''
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (buf) => { stderr += String(buf); });
  child.stdout.on('data', () => {});
  try {
    await waitHealth(port, child);
    ok('health', true);

    const anon = await http(port, '/owners/me');
    eq('owners/me without token', anon.status, 401);

    const fresh = await http(port, '/owners/me', { token: 'stub:fresh-user' });
    eq('owners/me no school', [fresh.status, fresh.json && fresh.json.slug], [200, '']);

    const reserved = await http(port, '/owners/claim', {
      method: 'POST',
      token: 'stub:fresh-user',
      body: { slug: 'lms', orgName: 'Nope', displayName: 'Nope' }
    });
    eq('claim reserved', [reserved.status, reserved.json && reserved.json.error], [409, 'reserved']);

    const slug = 'harden-' + port.toString(36);
    const created = await http(port, '/owners/claim', {
      method: 'POST',
      token: 'stub:owner-one',
      body: { slug: slug, orgName: 'Kelas Uji', displayName: 'Owner One' }
    });
    eq('claim creates', [created.status, created.json && created.json.slug, created.json && created.json.created], [201, slug, true]);

    const again = await http(port, '/owners/claim', {
      method: 'POST',
      token: 'stub:owner-one',
      body: { slug: slug, orgName: 'Kelas Uji', displayName: 'Owner One' }
    });
    eq('claim reuses', [again.status, again.json && again.json.slug, again.json && again.json.created], [200, slug, false]);

    const taken = await http(port, '/owners/claim', {
      method: 'POST',
      token: 'stub:owner-two',
      body: { slug: slug, orgName: 'Lain', displayName: 'Owner Two' }
    });
    eq('claim taken', [taken.status, taken.json && taken.json.error], [409, 'taken']);

    const guest = await http(port, '/state/' + slug);
    const guestState = (guest.json && guest.json.state) || {};
    eq('guest state status', guest.status, 200);
    eq('guest lectures hidden', guestState.lectures, []);
    eq('guest roster hidden', guestState.liveStudents, []);
    eq('guest invite hidden', guestState.inviteCode, '');
    ok('guest has no staffAdmins', !Object.prototype.hasOwnProperty.call(guestState, 'staffAdmins'));

    const owner = await http(port, '/state/' + slug, { token: 'stub:owner-one' });
    ok('owner staffAdmins', owner.status === 200 && owner.json && Array.isArray(owner.json.state && owner.json.state.staffAdmins));

    const guestPut = await http(port, '/state/' + slug, {
      method: 'PUT',
      body: { rev: 99, state: { lectures: [{ id: 'x' }], weeks: [{ id: 'w' }] } }
    });
    eq('guest put forbidden', guestPut.status, 403);

    const diskRev = Number(owner.json && owner.json.rev) || 1;
    const stale = await http(port, '/state/' + slug, {
      method: 'PUT',
      token: 'stub:owner-one',
      body: { rev: diskRev, state: owner.json.state }
    });
    eq('stale put', stale.status, 409);

    const base = Object.assign({}, owner.json.state, {
      lectures: [{ id: 'lec-1', title: 'Materi' }],
      weeks: [{ id: 'week-1', title: 'Minggu' }]
    });
    const saved = await http(port, '/state/' + slug, {
      method: 'PUT',
      token: 'stub:owner-one',
      body: { rev: diskRev + 1, state: base }
    });
    eq('owner put outline', saved.status, 200);

    const guestAfter = await http(port, '/state/' + slug);
    eq('guest still hides lectures', guestAfter.json && guestAfter.json.state && guestAfter.json.state.lectures, []);

    const wiped = Object.assign({}, base, { lectures: [], weeks: [] });
    const wipe = await http(port, '/state/' + slug, {
      method: 'PUT',
      token: 'stub:owner-one',
      body: { rev: diskRev + 2, state: wiped }
    });
    eq('empty outline put accepted', wipe.status, 200);

    const kept = await http(port, '/state/' + slug, { token: 'stub:owner-one' });
    const keptLectures = kept.json && kept.json.state && kept.json.state.lectures;
    ok('outline kept', Array.isArray(keptLectures) && keptLectures.length === 1 && keptLectures[0].id === 'lec-1');
    ok('state backup', fs.existsSync(path.join(dataDir, 'state', slug + '.json.bak.1')));

    const key = slug + '/lec-1/abcd1234';
    const media = await http(port, '/media/file?key=' + encodeURIComponent(key));
    eq('media without cookie', media.status, 403);
    const mediaKey = await http(port, '/media/file?key=' + encodeURIComponent(key) + '&k=INVITECODE');
    eq('media ?k= does not authorize', mediaKey.status, 403);
  } catch (err) {
    failed += 1;
    console.error('FAIL harness ' + (err && err.message ? err.message : err));
    if (stderr) console.error(stderr.slice(-2000));
  } finally {
    await stop(child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('ok lms api contract');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
