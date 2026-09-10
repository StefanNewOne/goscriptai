// Live smoke test — confirms the Claude Agent SDK ↔ Max path works outside STUB
// mode: one cheap structured call, asserting we are live, got structured JSON
// back, and a cost was reported. Run: AGENT_LIVE=1 tsx --env-file=.env scripts/live-smoke.ts
import { isStubMode, runQuery, parseAgentJson } from '../src/agents/sdk.js';
import { getRouting } from '../src/agents/registry.js';

async function main() {
  if (isStubMode()) {
    console.error('❌ STUB режим сè уште активен. Постави AGENT_LIVE=1 (Max login) или ANTHROPIC_API_KEY.');
    process.exit(1);
  }
  console.log('✓ Live режим (не stub).');

  // Use the cheapest routed model (reporter → haiku) for a near-zero-cost check.
  const routing = await getRouting('reporter');
  console.log(`→ Модел: ${routing.model}`);

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: { ok: { type: 'boolean' }, word: { type: 'string' } },
    required: ['ok', 'word'],
  };

  const started = Date.now();
  const res = await runQuery({
    systemPrompt: 'Ти си тест. Одговори само со бараниот JSON.',
    prompt: 'Врати JSON со ok=true и word="жив".',
    model: routing.model,
    schema,
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const parsed = parseAgentJson<{ ok: boolean; word: string }>(res);
  console.log(`✓ Структуриран излез: ${JSON.stringify(parsed)}`);
  console.log(`✓ Трошок: $${res.costUsd.toFixed(6)}  ·  сесија: ${res.sessionId ?? '—'}  ·  ${secs}s`);

  if (parsed.ok !== true) {
    console.error('❌ Моделот не го врати очекуваниот JSON.');
    process.exit(1);
  }
  console.log('\n✅ LIVE SMOKE ПОМИНА — Max login + Agent SDK + structured output + cost работат.');
}

main().catch((e) => {
  console.error('❌ Live smoke падна:', e?.message ?? e);
  process.exit(1);
});
