#!/usr/bin/env node
/**
 * LMS class API contract. Spawns server.mjs with a temp disk and LMS_AUTH_STUB.
 * No production GoTrue, no live volume. Run: node scripts/test-lms-api.mjs
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

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
  if (opt.cookie) headers.cookie = opt.cookie;
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
  return { status: res.status, json: json, cookie: res.headers.get('set-cookie') || '' };
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

function courseRules() {
  const CourseAccess = require(path.join(ROOT, 'obrolan.marketing', 'js', 'course-access.js'));
  const soon = new Date(Date.now() + 10 * 86400000).toISOString();
  const state = {
    paymentsEnabled: true,
    dunning: { graceDays: 1 },
    lectures: [
      { id: 'a', weekId: 'w', title: 'Satu', videoKey: 'school/a/vid' },
      { id: 'b', weekId: 'w2', title: 'Dua', videoKey: 'school/b/vid' }
    ],
    weeks: [{ id: 'w', title: '1' }, { id: 'w2', title: '2' }],
    kurikulum: { name: 'Kelas', published: true },
    packages: [{ id: 'pkg-1', months: 1, priceIdr: 10000, label: '1 bulan' }],
    billing: { s1: { status: 'lunas', plan: 'mentoring', accessUntil: soon, paidAt: new Date().toISOString() } },
    applications: { s1: { at: '2026-01-01' }, s2: { at: '2026-01-01' } },
    groups: []
  };
  ok('migrate', CourseAccess.ensure(state) === true);
  eq('main course', state.courses[0].id, 'c-utama');
  eq('migrated mode', state.courses[0].access.mode, 'subscription');
  ok('migrated community', state.courses[0].access.includesCommunity === true);
  ok('billing copied', state.courseBilling.s1['c-utama'].status === 'lunas');
  ok('payer opens', CourseAccess.canOpenCourse(state, 's1', 'c-utama'));
  ok('stranger locked', CourseAccess.canOpenCourse(state, 's2', 'c-utama') === false);
  ok('preview first', CourseAccess.canPreviewLecture(state, 's2', state.lectures[0]));
  ok('no preview later', CourseAccess.canPreviewLecture(state, 's2', state.lectures[1]) === false);
  ok('community mentee', CourseAccess.hasCommunity(state, 's1'));

  const once = CourseAccess.blankCourse();
  once.title = 'Batch';
  once.published = true;
  once.access.mode = 'once';
  once.access.priceIdr = 50000;
  once.access.audience = 'groups';
  once.access.groupIds = ['g1'];
  state.courses.push(once);
  state.groups.push({ id: 'g1', name: 'Batch 1', memberIds: ['s2'] });
  state.weeks.push({ id: 'w3', title: 'Khusus', courseId: once.id });
  state.lectures.push({ id: 'c', weekId: 'w3', title: 'Khusus', videoKey: 'school/c/vid' });
  ok('group cannot buy-open yet', CourseAccess.canOpenCourse(state, 's2', once.id) === false);
  ok('outsider hidden', CourseAccess.courseShown(state, 's1', once) === false);
  once.access.freeGroupIds = ['g1'];
  ok('group gratis', CourseAccess.canOpenCourse(state, 's2', once.id));
  state.groups[0].memberIds = [];
  ok('left group loses gratis', CourseAccess.canOpenCourse(state, 's2', once.id) === false);
  state.groups[0].memberIds = ['s2'];
  once.access.freeGroupIds = [];
  CourseAccess.grantCoursePaid(state, 's2', { courseId: once.id, amount: 50000, source: 'test' });
  ok('one-time until null', state.courseBilling.s2[once.id].until == null);
  ok('one-time opens', CourseAccess.canOpenCourse(state, 's2', once.id));
  const beforeExpire = JSON.stringify(state.courseBilling.s2[once.id]);
  state.courseBilling.s1['c-utama'].until = new Date(Date.now() - 5 * 86400000).toISOString();
  ok('expire subscription', CourseAccess.expireCourseBilling(state) === true);
  eq('one-time untouched', state.courseBilling.s2[once.id], JSON.parse(beforeExpire));
  ok('expired sub closed', CourseAccess.canOpenCourse(state, 's1', 'c-utama') === false);
  CourseAccess.setGrant(state, 's2', once.id, { kind: 'deny', at: new Date().toISOString() });
  ok('deny beats payment', CourseAccess.canOpenCourse(state, 's2', once.id) === false);
  ok('locked file denied', CourseAccess.studentMayReadKey(state, 's1', 'school/c/vid') === false);

  once.access.audience = 'all';
  const sub = CourseAccess.blankCourse();
  sub.published = true;
  sub.title = 'Langganan';
  sub.access.mode = 'subscription';
  sub.access.includesCommunity = true;
  sub.access.alsoUnlocks = [once.id];
  state.courses.push(sub);
  const paid = CourseAccess.grantCoursePaid(state, 's3', { courseId: sub.id, months: 1, amount: 10000, source: 'test' });
  ok('community flag', paid && paid.community === true);
  ok('bundle opens other course', CourseAccess.canOpenCourse(state, 's3', once.id));
  ok('community from that sub', CourseAccess.hasCommunity(state, 's3'));
  sub.access.alsoUnlocks = [];
  ok('snapshot kept after uncheck', CourseAccess.canOpenCourse(state, 's3', once.id));

  const freeSchool = { lectures: [], weeks: [], applications: { s9: { at: '2026-01-01' } } };
  CourseAccess.ensure(freeSchool);
  ok('empty stays empty', freeSchool.courses.length === 0);
  ok('open school community', CourseAccess.hasCommunity(freeSchool, 's9'));
}

async function main() {
  courseRules();
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
    const migrated = kept.json && kept.json.state;
    eq('lazy course id', migrated && migrated.courses && migrated.courses[0] && migrated.courses[0].id, 'c-utama');
    eq('week courseId', migrated && migrated.weeks && migrated.weeks[0] && migrated.weeks[0].courseId, 'c-utama');
    eq('free until payments', migrated && migrated.courses[0].access.mode, 'free');

    const keptRev = Number(kept.json.rev) || 1;
    const wipeCourses = await http(port, '/state/' + slug, {
      method: 'PUT',
      token: 'stub:owner-one',
      body: { rev: keptRev + 1, state: Object.assign({}, migrated, { courses: [] }) }
    });
    eq('empty courses put accepted', wipeCourses.status, 200);
    const coursesKept = await http(port, '/state/' + slug, { token: 'stub:owner-one' });
    eq('courses kept', coursesKept.json && coursesKept.json.state && coursesKept.json.state.courses[0].id, 'c-utama');

    const withSecret = coursesKept.json.state;
    withSecret.courses.push({
      id: 'c-secret',
      title: 'Batch 1',
      description: '',
      published: true,
      access: {
        mode: 'once',
        priceIdr: 25000,
        packages: [],
        audience: 'groups',
        groupIds: ['g-batch'],
        studentIds: [],
        alsoUnlocks: [],
        includesCommunity: false,
        freeGroupIds: [],
        lynkByPackage: {}
      }
    });
    withSecret.groups = [{ id: 'g-batch', name: 'Batch 1', memberIds: [] }];
    withSecret.weeks.push({ id: 'w-secret', title: 'Rahasia', courseId: 'c-secret' });
    withSecret.lectures.push({ id: 'lec-secret', weekId: 'w-secret', title: 'Rahasia', videoKey: slug + '/lec-secret/deadbeef' });
    const secretRev = Number(coursesKept.json.rev) || keptRev;
    const savedSecret = await http(port, '/state/' + slug, {
      method: 'PUT',
      token: 'stub:owner-one',
      body: { rev: secretRev + 1, state: withSecret }
    });
    eq('secret course saved', savedSecret.status, 200);

    const invite = withSecret.inviteCode;
    const joined = await http(port, '/join', {
      method: 'POST',
      body: { slug: slug, invite: invite, firstName: 'Ana', lastName: 'Uji', wa: '6281234567890' }
    });
    eq('student join', joined.status, 200);
    const cookie = String(joined.cookie || '').split(';')[0];
    ok('student cookie', cookie.indexOf('lms_student=') === 0);
    const asStudent = await http(port, '/state/' + slug, { cookie: cookie });
    const seenIds = ((asStudent.json && asStudent.json.state && asStudent.json.state.courses) || []).map((row) => row.id);
    ok('student sees main course', seenIds.indexOf('c-utama') >= 0);
    ok('student hides other group', seenIds.indexOf('c-secret') < 0);
    const secretFile = await http(port, '/media/file?key=' + encodeURIComponent(slug + '/lec-secret/deadbeef'), { cookie: cookie });
    eq('locked course file denied', secretFile.status, 403);

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
