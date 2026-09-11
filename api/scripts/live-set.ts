/* eslint-disable no-console */
// LIVE set-flow proof on an already-ACTIVE client: Creative Director → Writers
// (parallel) → Critic → approve → export, all through BullMQ with real Claude.
// Complements live-e2e (onboarding). Run:
//   AGENT_LIVE=1 tsx --env-file=.env scripts/live-set.ts [CLIENT_CODE]
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/prisma.js';
import { closeQueues } from '../src/queues/index.js';
import { isStubMode } from '../src/agents/sdk.js';

const PORT = 3997;
const BASE = `http://localhost:${PORT}/api/v1`;
const CLIENT_CODE = process.argv[2] ?? 'ALEKS';

let token = '';
async function req(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitSet(id: string, target: string, tries = 500) {
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

  let sid = '';
  try {
    {
      const r = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@godigital.mk', password: 'goscript' }) });
      token = (await r.json()).data.token;
    }
    const client = await prisma.client.findFirst({ where: { code: CLIENT_CODE } });
    if (!client) throw new Error(`нема клиент со код ${CLIENT_CODE}`);
    console.log(`Клиент: ${client.name} (${client.code}) · ${client.status}`);

    console.log('\n1) Нов сет → Creative Director…');
    const setRes = await req('POST', '/sets', { clientId: client.id, requested: 2, brief: { product: 'Летна понуда', goal: 'Повеќе пораки од локална публика', notes: 'Директен тон, нагласи испорака.' } });
    if (setRes.status !== 201) throw new Error(`createSet → ${setRes.status}: ${JSON.stringify(setRes.json)}`);
    sid = setRes.json.data.id;
    // Give the set some headroom so a pricier critic run can't trip BUDGET_HOLD.
    await req('POST', `/sets/${sid}/raise-budget`, { budgetUsd: 25 });
    const cr = await waitSet(sid, 'CONCEPTS_REVIEW');
    console.log(`   ✓ ${cr.concepts.length} концепти:`);
    for (const c of cr.concepts as any[]) console.log(`      · [${c.type}] „${c.card.hook.slice(0, 55)}…“ (~${c.card.estimateSec}с)`);

    console.log('\n2) Избирам 2 → Writers (паралелно) → Critic…');
    for (const c of (cr.concepts as any[]).slice(0, 2)) await req('POST', `/concepts/${c.id}/decision`, { decision: 'SELECTED' });
    await req('POST', `/sets/${sid}/write`);
    const rev = await waitSet(sid, 'SCRIPTS_REVIEW');
    for (const s of rev.scripts as any[]) {
      const cp = s.criticReport;
      const low = cp?.scores ? Object.entries(cp.scores).filter(([, v]) => (v as number) < 3).map(([k]) => k) : [];
      console.log(`   ✓ ${s.code} „${s.title.slice(0, 45)}“ · ${s.content.frames.length} кадри · критика ${cp?.totalPercent ?? '—'}% ${cp?.passed ? '(поминува)' : '(под праг)'}${low.length ? ' · слаби: ' + low.join(',') : ''}`);
      const hook = s.content.frames.find((f: any) => f.role === 'ХООК');
      if (hook?.lines?.[0]) console.log(`      ХООК: „${hook.lines[0].text.slice(0, 70)}…“`);
    }

    console.log('\n3) Одобрувам сите → експорт…');
    for (const s of rev.scripts as any[]) await req('POST', `/scripts/${s.id}/approve`);
    await waitSet(sid, 'APPROVED');
    const exp = await req('POST', `/sets/${sid}/export`);
    console.log(`   ✓ Експортирано: ${exp.json.data?.base}  (docx + md)`);

    console.log('\n4) Докази за персистенција (live агенти):');
    const runs = await prisma.agentRun.findMany({ where: { setId: sid }, select: { agentKind: true, model: true, status: true, costUsd: true, sessionId: true } });
    const msgs = await prisma.message.count({ where: { run: { setId: sid } } });
    const costs = await prisma.costEntry.aggregate({ where: { setId: sid }, _sum: { usd: true }, _count: true });
    const setRow = await prisma.scriptSet.findUnique({ where: { id: sid }, select: { spentUsd: true, status: true } });
    for (const r of runs) console.log(`   · AgentRun ${r.agentKind} → ${r.model} [${r.status}] $${Number(r.costUsd).toFixed(4)} ${r.sessionId ? '(session ✓)' : ''}`);
    console.log(`   · Messages: ${msgs}  ·  CostEntry: ${costs._count} записи, сума $${Number(costs._sum.usd ?? 0).toFixed(4)}`);
    console.log(`   · Set.spentUsd: $${Number(setRow?.spentUsd ?? 0).toFixed(4)}  ·  статус: ${setRow?.status}`);

    const ok = runs.length > 0 && runs.every((r) => r.status === 'DONE') && msgs > 0 && Number(costs._sum.usd) > 0;
    console.log(`\n${ok ? '✅ LIVE SET FLOW ПОМИНА' : '⚠️ Проверка'} — CD → Writers → Critic → export низ вистински агенти, со DB персистенција.`);
  } finally {
    // Leave the set in place for inspection; only disconnect. (Pilot client kept.)
    if (sid) console.log(`\n(Сетот ${sid} е зачуван за преглед.)`);
    await app.close();
    await closeQueues();
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('❌ Live set падна:', e?.message ?? e);
  process.exit(1);
});
