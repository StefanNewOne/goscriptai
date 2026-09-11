/* eslint-disable no-console */
// Full LIVE end-to-end: boots the server + in-process workers against the dev
// DB + Redis and drives a whole client onboarding + one set through the BullMQ
// agents with REAL Claude (Max). Unlike the stub integration test, assertions
// are relaxed (live outputs vary) and timeouts are generous. Proves the DB
// persistence path (AgentRun / CostEntry / Message / Script) under live agents.
// Run: AGENT_LIVE=1 tsx --env-file=.env scripts/live-e2e.ts
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { isStubMode } from '../src/agents/sdk.js';

const PORT = 3998;
const BASE = `http://localhost:${PORT}/api/v1`;
const CODE = 'LIVEE2E';

let token = '';
async function req(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitClient(id: string, target: string, tries = 300) {
  for (let i = 0; i < tries; i++) {
    const c = await req('GET', `/clients/${id}`);
    const st = c.json?.data?.status;
    if (st === target) return c.json.data;
    if (st === 'FAILED' || st === 'BUDGET_HOLD') throw new Error(`client went ${st} (waiting ${target})`);
    await sleep(1000);
  }
  throw new Error(`timeout: client never reached ${target}`);
}
async function waitSet(id: string, target: string, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const s = await req('GET', `/sets/${id}`);
    const st = s.json?.data?.status;
    if (st === target) return s.json.data;
    if (st === 'FAILED' || st === 'BUDGET_HOLD') throw new Error(`set went ${st} (waiting ${target})`);
    await sleep(1000);
  }
  throw new Error(`timeout: set never reached ${target}`);
}

async function run() {
  if (isStubMode()) {
    console.error('❌ STUB режим. Пушти со AGENT_LIVE=1 (Max login).');
    process.exit(1);
  }
  console.log('✓ LIVE режим потврден.\n');

  const app = await buildServer();
  await app.listen({ port: PORT, host: '127.0.0.1' });

  try {
    await prisma.client.deleteMany({ where: { code: { startsWith: CODE } } });
    {
      const r = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'aleksandar@godigital.mk', password: 'goscript' }) });
      token = (await r.json()).data.token;
    }

    // 1) Client + Analyst -----------------------------------------------------
    console.log('1) Креирам клиент + пуштам Client Analyst…');
    const fc = await req('POST', '/clients', { name: 'Лајв Е2Е Клиент', code: CODE, language: 'MK', industry: 'Тест агенција', website: 'https://godigital.mk' });
    const fid = fc.json.data.id;
    await req('POST', `/clients/${fid}/analyze`);
    await waitClient(fid, 'ANALYST_QUESTIONS');
    const qs = (await req('GET', `/clients/${fid}/questions`)).json.data.questions as { id: string; text: string }[];
    console.log(`   ✓ Аналитичарот врати ${qs.length} прашања. Прво: „${qs[0]?.text?.slice(0, 80)}…“`);

    // 2) Answer → profile -----------------------------------------------------
    console.log('2) Одговарам на прашањата → генерирам профил…');
    const answers = Object.fromEntries(qs.map((q) => [q.id, 'Директен, топол тон; фокус на резултати и локална публика.']));
    await req('POST', `/clients/${fid}/answers`, { answers });
    await waitClient(fid, 'ANALYST_REVIEW');
    const prof = (await req('GET', `/clients/${fid}`)).json.data.profiles[0];
    console.log(`   ✓ Профил v${prof.version} (${prof.markdown.length} знаци). Извадок: „${prof.markdown.replace(/\s+/g, ' ').slice(0, 90)}…“`);
    await req('POST', `/clients/${fid}/profile-decision`, { decision: 'approve' });

    // 3) Avatars --------------------------------------------------------------
    console.log('3) Avatar Builder…');
    await waitClient(fid, 'AVATARS_REVIEW');
    const avs = (await req('GET', `/clients/${fid}`)).json.data.avatars as { name: string; status: string }[];
    console.log(`   ✓ ${avs.length} аватари (PENDING): ${avs.map((a) => a.name).join(', ')}`);
    await req('POST', `/clients/${fid}/avatars-decision`, { decision: 'approve' });

    // 4) Manual setup → activate ---------------------------------------------
    await waitClient(fid, 'MANUAL_SETUP');
    await req('POST', `/clients/${fid}/actors`, { name: 'Ајтов', role: 'ангажиран', languages: ['MK'], canDo: ['монолог', 'хумор'] });
    await req('POST', `/clients/${fid}/activate`);
    console.log('   ✓ Клиент активиран (ACTIVE).\n');

    // 5) Set: Creative Director → concepts -----------------------------------
    console.log('5) Нов сет → Creative Director…');
    const setRes = await req('POST', '/sets', { clientId: fid, requested: 2, brief: { product: 'Летна понуда', goal: 'Пораст на пораки', notes: 'Нагласи локална испорака.' } });
    const sid = setRes.json.data.id;
    const cr = await waitSet(sid, 'CONCEPTS_REVIEW');
    console.log(`   ✓ ${cr.concepts.length} концепти. Хукови: ${cr.concepts.slice(0, 3).map((c: any) => '„' + c.card.hook.slice(0, 40) + '…“').join('  ')}`);

    // 6) Select 2 → Writers (parallel) → Critic ------------------------------
    console.log('6) Избирам 2 концепти → Writers (паралелно) → Critic…');
    for (const c of cr.concepts.slice(0, 2)) await req('POST', `/concepts/${c.id}/decision`, { decision: 'SELECTED' });
    await req('POST', `/sets/${sid}/write`);
    const rev = await waitSet(sid, 'SCRIPTS_REVIEW');
    for (const s of rev.scripts as any[]) {
      const cp = s.criticReport;
      console.log(`   ✓ ${s.code} „${s.title.slice(0, 40)}“ · ${s.content.frames.length} кадри · критика ${cp?.totalPercent ?? '—'}% (${cp?.passed ? 'поминува' : 'под праг'})`);
    }

    // 7) Approve all → export -------------------------------------------------
    console.log('7) Одобрувам сите → експорт docx/md…');
    for (const s of rev.scripts as any[]) await req('POST', `/scripts/${s.id}/approve`);
    await waitSet(sid, 'APPROVED');
    const exp = await req('POST', `/sets/${sid}/export`);
    console.log(`   ✓ Експортирано: ${exp.json.data?.base}`);

    // 8) DB persistence proof -------------------------------------------------
    console.log('\n8) Докази за персистенција во база (live агенти):');
    const runs = await prisma.agentRun.findMany({ where: { set: { clientId: fid } }, select: { agentKind: true, model: true, status: true, costUsd: true, sessionId: true } });
    const clientRuns = await prisma.agentRun.findMany({ where: { clientId: fid }, select: { agentKind: true, model: true, status: true, costUsd: true } });
    const allRuns = [...clientRuns, ...runs];
    const msgs = await prisma.message.count({ where: { run: { OR: [{ clientId: fid }, { set: { clientId: fid } }] } } });
    const costs = await prisma.costEntry.aggregate({ where: { clientId: fid }, _sum: { usd: true }, _count: true });
    const client = await prisma.client.findUnique({ where: { id: fid }, select: { spentUsd: true } });
    for (const r of allRuns) console.log(`   · AgentRun ${r.agentKind} → ${r.model} [${r.status}] $${Number(r.costUsd).toFixed(4)}`);
    console.log(`   · Messages снимени: ${msgs}`);
    console.log(`   · CostEntry записи: ${costs._count}  ·  сума $${Number(costs._sum.usd ?? 0).toFixed(4)}`);
    console.log(`   · Client.spentUsd: $${Number(client?.spentUsd ?? 0).toFixed(4)}`);

    const realModels = allRuns.every((r) => r.status === 'DONE' && !r.model.includes('stub'));
    console.log(`\n${realModels && msgs > 0 && Number(costs._sum.usd) > 0 ? '✅ LIVE E2E ПОМИНА' : '⚠️ Проверка'} — целиот тек мина низ вистински агенти со DB персистенција.`);
  } finally {
    await prisma.client.deleteMany({ where: { code: { startsWith: CODE } } });
    await app.close();
    await closeQueues();
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('❌ Live E2E падна:', e?.message ?? e);
  process.exit(1);
});
