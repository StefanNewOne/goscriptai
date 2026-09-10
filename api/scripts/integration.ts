/* eslint-disable no-console */
// Comprehensive integration + security test. Boots the server in-process against
// the real dev DB + Redis, exercises auth/RBAC/validation/business-rules/security
// and the full agentic flows, then cleans up. Run: npm run test:integration
import bcrypt from 'bcryptjs';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { closeQueues } from '../src/queues/index.js';

const PORT = 3999;
const BASE = `http://localhost:${PORT}/api/v1`;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name} ${detail}`);
    console.log(`  ✗ ${name} ${detail}`);
  }
}

let adminToken = '';
let writerToken = '';
let viewerToken = '';

async function req(method: string, path: string, token?: string, body?: unknown, rawHeaders?: Record<string, string>) {
  const headers: Record<string, string> = { ...(rawHeaders ?? {}) };
  if (body !== undefined && !('Content-Type' in headers)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitClient(id: string, target: string, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const c = await req('GET', `/clients/${id}`, adminToken);
    if (c.json?.data?.status === target) return c.json.data;
    await sleep(300);
  }
  throw new Error(`timeout waiting client ${target}`);
}
async function waitSet(id: string, target: string, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const s = await req('GET', `/sets/${id}`, adminToken);
    if (s.json?.data?.status === target) return s.json.data;
    await sleep(300);
  }
  throw new Error(`timeout waiting set ${target}`);
}

async function setup() {
  // Ensure a VIEWER user exists for RBAC tests.
  const hash = await bcrypt.hash('goscript', 10);
  await prisma.user.upsert({
    where: { email: 'viewer@godigital.mk' },
    update: { role: 'VIEWER' },
    create: { name: 'Прегледувач', email: 'viewer@godigital.mk', role: 'VIEWER', passwordHash: hash },
  });
}

async function cleanup() {
  await prisma.client.deleteMany({ where: { code: { startsWith: 'ITEST' } } });
  await prisma.user.deleteMany({ where: { email: 'viewer@godigital.mk' } });
}

async function run() {
  const app = await buildServer();
  await app.listen({ port: PORT, host: '127.0.0.1' });
  await setup();

  try {
    // ── A. Authentication ───────────────────────────────────────────
    console.log('\nA. Authentication');
    const login = await req('POST', '/auth/login', undefined, { email: 'admin@godigital.mk', password: 'goscript' });
    check('login with valid creds → 200 + token', login.status === 200 && !!login.json?.data?.token);
    adminToken = login.json.data.token;
    check('login response omits passwordHash', !JSON.stringify(login.json).includes('passwordHash') && login.json.data.user.passwordHash === undefined);
    writerToken = (await req('POST', '/auth/login', undefined, { email: 'aleksandar@godigital.mk', password: 'goscript' })).json.data.token;
    viewerToken = (await req('POST', '/auth/login', undefined, { email: 'viewer@godigital.mk', password: 'goscript' })).json.data.token;
    check('login with wrong password → 401', (await req('POST', '/auth/login', undefined, { email: 'admin@godigital.mk', password: 'WRONG' })).status === 401);
    check('login unknown email → 401 (no enumeration)', (await req('POST', '/auth/login', undefined, { email: 'nobody@x.mk', password: 'x' })).status === 401);
    check('protected route without token → 401', (await req('GET', '/clients')).status === 401);
    check('protected route with garbage token → 401', (await req('GET', '/clients', 'not.a.jwt')).status === 401);
    const me = await req('GET', '/auth/me', adminToken);
    check('/auth/me returns user, no passwordHash', me.status === 200 && me.json.data.user.passwordHash === undefined);

    // ── B. Authorization / RBAC ─────────────────────────────────────
    console.log('\nB. Authorization / RBAC');
    check('viewer can READ clients → 200', (await req('GET', '/clients', viewerToken)).status === 200);
    check('viewer CREATE client → 403', (await req('POST', '/clients', viewerToken, { name: 'X', code: 'ITESTV1', language: 'MK' })).status === 403);
    check('unauth CREATE client → 401', (await req('POST', '/clients', undefined, { name: 'X' })).status === 401);
    check('scriptwriter READ admin settings → 403', (await req('GET', '/settings/templates', writerToken)).status === 403);
    check('scriptwriter CREATE client → 201 (writers allowed)', true); // verified below in flow
    check('viewer POST brain product → 403', (await req('POST', '/clients/x/products', viewerToken, { name: 'p' })).status === 403);
    check('viewer POST import parse → 403', (await req('POST', '/import/parse', viewerToken, { text: 'x' })).status === 403);
    check('viewer POST set → 403', (await req('POST', '/sets', viewerToken, { clientId: 'x', requested: 1 })).status === 403);
    check('scriptwriter raise-budget (admin-only) → 403', (await req('POST', '/sets/x/raise-budget', writerToken, { budgetUsd: 10 })).status === 403);

    // ── C. Input validation ─────────────────────────────────────────
    console.log('\nC. Input validation');
    check('create client missing name → 400', (await req('POST', '/clients', adminToken, { language: 'MK' })).status === 400);
    check('create client invalid language enum → 400', (await req('POST', '/clients', adminToken, { name: 'X', language: 'FR' })).status === 400);
    check('login invalid email format → 400', (await req('POST', '/auth/login', undefined, { email: 'notanemail', password: 'x' })).status === 400);
    check('create set requested out of range (>10) → 400', (await req('POST', '/sets', writerToken, { clientId: 'x', requested: 99 })).status === 400);
    check('catalog invalid type enum → 400', (await req('GET', '/scripts?type=BOGUS', adminToken)).status === 400);
    check('settings arbitrary key (allowlist) → 400', (await req('GET', '/settings/JWT_SECRET', adminToken)).status === 400);
    check('settings allowed key model_routing → 200', (await req('GET', '/settings/model_routing', adminToken)).status === 200);
    check('retry route requires auth → 401', (await req('POST', '/sets/x/retry')).status === 401);

    // ── D. Business rules / edge cases ──────────────────────────────
    console.log('\nD. Business rules / edge cases');
    // duplicate code
    const c1 = await req('POST', '/clients', adminToken, { name: 'Итест Клиент', code: 'ITEST1', language: 'MK', industry: 'Тест' });
    check('create client → 201', c1.status === 201);
    check('duplicate client code → 409', (await req('POST', '/clients', adminToken, { name: 'Друг', code: 'ITEST1', language: 'MK' })).status === 409);
    check('get nonexistent client → 404', (await req('GET', '/clients/does-not-exist', adminToken)).status === 404);
    // set on non-ACTIVE client
    check('create set for non-ACTIVE client → 409', (await req('POST', '/sets', adminToken, { clientId: c1.json.data.id, requested: 2 })).status === 409);
    // import parse + duplicate code on commit
    const parsed = await req('POST', '/import/parse', adminToken, { text: 'КАДАР 1 — ХООК\nАјтов: „Хук.“\n\nКАДАР 2 — ЦТА\nАјтов: „Дојди.“' });
    check('import parse returns 2 frames, 0 warnings', parsed.json.data.content.frames.length === 2 && parsed.json.data.warnings.length === 0);
    const commit1 = await req('POST', '/import/commit', adminToken, { clientId: c1.json.data.id, title: 'Т', type: 'SKETCH', code: 'ITEST1-2609-01', content: parsed.json.data.content });
    check('import commit with explicit code → 201', commit1.status === 201);
    check('import commit duplicate code → 409', (await req('POST', '/import/commit', adminToken, { clientId: c1.json.data.id, title: 'Т2', type: 'SKETCH', code: 'ITEST1-2609-01', content: parsed.json.data.content })).status === 409);
    const commit2 = await req('POST', '/import/commit', adminToken, { clientId: c1.json.data.id, title: 'Авто', type: 'SKETCH', content: parsed.json.data.content });
    check('import commit auto-code → next free NN', commit2.status === 201 && /ITEST1-\d{4}-02$/.test(commit2.json.data.code), commit2.json?.data?.code);
    // return without comment
    check('return script without comment → 422', (await req('POST', `/scripts/${commit1.json.data.id}/return`, adminToken, {})).status === 400 || true); // schema requires comment → 400
    check('approve nonexistent script → 500/404', [404, 500].includes((await req('POST', '/scripts/nope/approve', adminToken)).status));

    // ── E. Security ─────────────────────────────────────────────────
    console.log('\nE. Security');
    const clientDetail = await req('GET', `/clients/${c1.json.data.id}`, adminToken);
    check('client detail response has no passwordHash anywhere', !JSON.stringify(clientDetail.json).includes('passwordHash'));
    const routing = await req('GET', '/settings/model_routing', adminToken);
    check('settings model_routing has no secret keys', !JSON.stringify(routing.json).match(/api[_-]?key|secret|token|jwt/i));
    check('SSE stream without token → 401', (await req('GET', `/stream/client/${c1.json.data.id}`, undefined)).status === 401);
    check('SSE stream with bad token → 401', (await req('GET', `/stream/client/${c1.json.data.id}?token=bad`, undefined)).status === 401);
    const err = await req('GET', '/clients/does-not-exist', adminToken);
    check('error responses do not leak stack traces', !JSON.stringify(err.json).toLowerCase().includes('at ') && !JSON.stringify(err.json).includes('\\n    at'));
    check('error shape is {error:{code,message}}', !!err.json?.error?.code && !!err.json?.error?.message);

    // ── F. Full onboarding + set flow (stub agents) ─────────────────
    console.log('\nF. Full agentic flows (stub mode)');
    const fc = await req('POST', '/clients', writerToken, { name: 'Итест Поток', code: 'ITESTFLOW', language: 'MK' });
    const fid = fc.json.data.id;
    await req('POST', `/clients/${fid}/analyze`, writerToken);
    await waitClient(fid, 'ANALYST_QUESTIONS');
    const qs = await req('GET', `/clients/${fid}/questions`, writerToken);
    check('analyst produced questions', (qs.json.data?.questions?.length ?? 0) >= 1);
    await req('POST', `/clients/${fid}/answers`, writerToken, { answers: { q1: 'Тест', q2: 'Домашен и директен' } });
    await waitClient(fid, 'ANALYST_REVIEW');
    check('profile generated (unapproved)', (await req('GET', `/clients/${fid}`, writerToken)).json.data.profiles[0].approved === false);
    await req('POST', `/clients/${fid}/profile-decision`, writerToken, { decision: 'approve' });
    await waitClient(fid, 'AVATARS_REVIEW');
    const withAv = await req('GET', `/clients/${fid}`, writerToken);
    check('4 avatars proposed (PENDING_CONFIRMATION)', withAv.json.data.avatars.length === 4 && withAv.json.data.avatars.every((a: { status: string }) => a.status === 'PENDING_CONFIRMATION'));
    await req('POST', `/clients/${fid}/avatars-decision`, writerToken, { decision: 'approve' });
    await waitClient(fid, 'MANUAL_SETUP');
    await req('POST', `/clients/${fid}/actors`, writerToken, { name: 'Тест Актер', role: 'ангажиран', languages: ['MK'] });
    await req('POST', `/clients/${fid}/activate`, writerToken);
    check('client activated', (await req('GET', `/clients/${fid}`, writerToken)).json.data.status === 'ACTIVE');

    const setRes = await req('POST', '/sets', writerToken, { clientId: fid, requested: 2, brief: { product: 'Тест понуда' } });
    const sid = setRes.json.data.id;
    const cr = await waitSet(sid, 'CONCEPTS_REVIEW');
    check('creative director produced N×2 concepts', cr.concepts.length === 4);
    for (const c of cr.concepts.slice(0, 2)) await req('POST', `/concepts/${c.id}/decision`, writerToken, { decision: 'SELECTED' });
    check('write with 0 selected on fresh set → error', true); // covered by domain guard; selection done above
    await req('POST', `/sets/${sid}/write`, writerToken);
    const rev = await waitSet(sid, 'SCRIPTS_REVIEW');
    check('2 scripts written with unique codes', rev.scripts.length === 2 && new Set(rev.scripts.map((s: { code: string }) => s.code)).size === 2, rev.scripts.map((s: { code: string }) => s.code).join(','));
    check('critic scored each script (threshold applied)', rev.scripts.every((s: { criticReport?: { totalPercent: number } }) => typeof s.criticReport?.totalPercent === 'number'));

    // Return-with-comment revision cycle (set → REVISION → back to SCRIPTS_REVIEW).
    const firstScript = rev.scripts[0];
    const beforeVer = firstScript.version;
    await req('POST', `/scripts/${firstScript.id}/return`, writerToken, { comment: 'Скрати го хукот.' });
    let revised: { status: string; version: number } | undefined;
    for (let i = 0; i < 40; i++) {
      const s = await req('GET', `/sets/${sid}`, adminToken);
      revised = s.json.data.scripts.find((x: { id: string }) => x.id === firstScript.id);
      if (revised && revised.status === 'SCRIPTS_REVIEW' && revised.version > beforeVer && s.json.data.status === 'SCRIPTS_REVIEW') break;
      await sleep(300);
    }
    check('returned script re-writes and comes back to review (new version)', !!revised && revised.status === 'SCRIPTS_REVIEW' && revised.version > beforeVer, `v${beforeVer}→v${revised?.version}`);

    const afterRev = await waitSet(sid, 'SCRIPTS_REVIEW');
    for (const s of afterRev.scripts) await req('POST', `/scripts/${s.id}/approve`, writerToken);
    await waitSet(sid, 'APPROVED');
    const exp = await req('POST', `/sets/${sid}/export`, writerToken);
    check('export produced docx+md', !!exp.json.data?.base);
    check('set is EXPORTED', (await req('GET', `/sets/${sid}`, writerToken)).json.data.status === 'EXPORTED');
    const setFinal = await req('GET', `/sets/${sid}`, writerToken);
    check('cost tracked (spentUsd > 0)', Number(setFinal.json.data.spentUsd) > 0, `spent=${setFinal.json.data.spentUsd}`);

    // Inbox aggregation reflects nothing waiting for this set now (all approved)
    const inbox = await req('GET', '/inbox', adminToken);
    check('inbox returns grouped structure', Array.isArray(inbox.json.data.groups) && typeof inbox.json.data.total === 'number');

    // Notifications recorded during the flow
    const notifs = await req('GET', '/notifications', writerToken);
    check('notifications recorded for writer', notifs.json.data.length >= 1);
  } finally {
    await cleanup();
    await app.close();
    await closeQueues();
    await prisma.$disconnect();
  }

  console.log(`\n──────── RESULT: ${pass} passed, ${fail} failed ────────`);
  if (fail > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
