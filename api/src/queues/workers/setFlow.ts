import { prisma } from '../../lib/prisma.js';
import { getRouting, getSystemPrompt } from '../../agents/registry.js';
import { isStubMode, runQuery, parseAgentJson } from '../../agents/sdk.js';
import { conceptsSchema, scriptSchema, criticSchema } from '../../agents/schemas.js';
import { stubConcepts, stubScript, stubCritic, type StubConcept } from '../../agents/setStubs.js';
import { startRun, recordMessage, recordCost, finishRun } from '../../services/agentRunService.js';
import { buildCode, nextSequence } from '../../domain/code.js';
import { renderScriptMarkdown, type ScriptContent } from '../../domain/scriptFormat.js';
import { evaluateCritic, nextCriticOutcome, type CriterionScores } from '../../domain/critic.js';
import { moveSet, maybeReviewSet, enforceBudget } from '../../services/setService.js';
import { notify } from '../../services/notificationService.js';
import { publish } from '../../events/bus.js';
import { setQueue } from '../index.js';

export type SetJob =
  | { kind: 'creative_director'; setId: string }
  | { kind: 'writer'; setId: string; conceptId: string; revision?: boolean; comment?: string }
  | { kind: 'critic'; setId: string; scriptId: string };

export async function runSetJob(job: SetJob): Promise<void> {
  if (job.kind === 'creative_director') return creativeDirector(job.setId);
  if (job.kind === 'writer') return writer(job);
  return critic(job);
}

async function creativeDirector(setId: string) {
  const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId }, include: { client: true } });
  const brief = set.brief as { product?: string; avatarIds?: string[]; actorIds?: string[]; locationIds?: string[] };
  const avatars = await prisma.avatar.findMany({ where: { clientId: set.clientId, status: 'ACTIVE' } });
  const actors = await prisma.actor.findMany({ where: { OR: [{ clientId: set.clientId }, { clientId: null }] } });
  const locations = await prisma.location.findMany({ where: { clientId: set.clientId } });

  const routing = await getRouting('creative_director');
  const system = await getSystemPrompt('creative_director');
  const run = await startRun({ clientId: set.clientId, setId, agentKind: 'creative_director', model: routing.model, scope: 'set', scopeId: setId });
  try {
    const avatarIds = brief.avatarIds?.length ? brief.avatarIds : avatars.map((a) => a.id);
    const actorIds = brief.actorIds?.length ? brief.actorIds : actors.map((a) => a.id);
    const locationIds = brief.locationIds?.length ? brief.locationIds : locations.map((l) => l.id);
    let concepts: StubConcept[];
    let costUsd = isStubMode() ? 0.5 : 0;
    if (isStubMode()) {
      concepts = stubConcepts({ requested: set.requested, clientName: set.client.name, avatarIds, actorIds, locationIds, product: brief.product });
    } else {
      const ctx = `Клиент: ${set.client.name} (јазик ${set.client.language}). Барани сценарија: ${set.requested} (генерирај ${set.requested * 2} концепти).\nПродукт во фокус: ${brief.product ?? '—'}\nАватари (id·име): ${avatars.map((a) => `${a.id}·${a.name}`).join(', ')}\nАктери (id·име·јазици): ${actors.map((a) => `${a.id}·${a.name}·${a.languages.join('/')}`).join(', ')}\nЛокации (id·име): ${locations.map((l) => `${l.id}·${l.name}`).join(', ')}`;
      const res = await runQuery({ systemPrompt: system, prompt: `${ctx}\nВрати ги концептите во бараниот JSON облик. Користи ги ТОЧНИТЕ id вредности за avatarId/actorId/locationId.`, model: routing.model, schema: conceptsSchema });
      concepts = parseAgentJson<{ concepts: StubConcept[] }>(res).concepts;
      costUsd = res.costUsd;
    }
    for (const c of concepts) {
      await prisma.concept.create({
        data: { setId, type: c.type, avatarId: c.avatarId, actorId: c.actorId, locationId: c.locationId, card: c.card, decision: 'PENDING' },
      });
    }
    await recordMessage(run.id, 'concepts', { count: concepts.length }, 'set', setId);
    await recordCost({ runId: run.id, clientId: set.clientId, setId, agentKind: 'creative_director', model: routing.model, usd: costUsd, scope: 'set', scopeId: setId });
    await finishRun(run.id, 'DONE', 'set', setId, 'creative_director');
    if (await enforceBudget(setId)) return;
    await moveSet(setId, ['CONCEPTS_GENERATING'], 'CONCEPTS_REVIEW');
    await publish({ type: 'concept.ready', scope: 'set', id: setId, setId });
    await notify('concepts_ready', { userId: set.writerUserId, link: `/sets/${setId}`, payload: { setId } });
  } catch (err) {
    await finishRun(run.id, 'FAILED', 'set', setId, 'creative_director', String(err));
    throw err;
  }
}

async function writer(job: Extract<SetJob, { kind: 'writer' }>) {
  const concept = await prisma.concept.findUniqueOrThrow({ where: { id: job.conceptId }, include: { actor: true, set: { include: { client: true } } } });
  const set = concept.set;
  const client = set.client;
  const actorName = concept.actor?.name ?? 'Актер';
  const card = concept.card as { hook: string };

  const routing = await getRouting('writer');
  const system = await getSystemPrompt('writer');
  const run = await startRun({ clientId: set.clientId, setId: set.id, agentKind: 'writer', model: routing.model, scope: 'set', scopeId: set.id });
  try {
    const brief = set.brief as { product?: string };
    let drafted: { title: string; content: ScriptContent };
    let writerSession: string | undefined;
    let costUsd = isStubMode() ? 0.4 : 0;
    if (isStubMode()) {
      drafted = stubScript({ actorName, hook: card.hook, product: brief.product });
    } else {
      const glossary = await prisma.glossaryTerm.findMany({ where: { clientId: set.clientId } });
      const banned = glossary.filter((g) => g.kind === 'BANNED').map((g) => g.term);
      const preferred = glossary.filter((g) => g.kind !== 'BANNED').map((g) => `${g.term} (${g.meaning})`);
      const actor = concept.actor;
      const priorRun = job.revision ? await prisma.agentRun.findFirst({ where: { setId: set.id, agentKind: 'writer', sessionId: { not: null } }, orderBy: { createdAt: 'desc' } }) : null;
      const prompt = job.revision
        ? `Ревидирај го сценариото според коментарот: „${job.comment ?? ''}“. Задржи го форматот §11.`
        : `Напиши цело реел-сценарио на јазик ${client.language} во стандардниот формат (кадри со улога ХООК/БОДИ/ЦТА, режија одвоена од реплика, реплика со име на актер).\nКонцепт (hook): „${card.hook}“\nПродукт: ${brief.product ?? '—'}\nАктер: ${actorName}${actor?.style ? ` — стил: ${actor.style}` : ''}${actor?.cannotDo?.length ? ` — НЕ МОЖЕ: ${actor.cannotDo.join(', ')}` : ''}\nПретпочитани термини: ${preferred.join('; ') || '—'}\nЗАБРАНЕТИ фрази (не користи): ${banned.join('; ') || '—'}\nВрати го во бараниот JSON облик.`;
      const res = await runQuery({ systemPrompt: system, prompt, model: routing.model, schema: scriptSchema, sessionId: priorRun?.sessionId ?? undefined });
      drafted = parseAgentJson<{ title: string; content: ScriptContent }>(res);
      writerSession = res.sessionId;
      costUsd = res.costUsd;
    }

    // Move set into CRITIC phase (tolerant of concurrent writers).
    await moveSet(set.id, ['SCRIPTS_WRITING'], 'CRITIC_RUNNING');

    let script = await prisma.script.findFirst({ where: { setId: set.id, conceptId: concept.id } });
    if (script && job.revision) {
      const nn = Number.parseInt(script.code.split('-')[2] ?? '1', 10);
      const markdown = renderScriptMarkdown({ nn, title: drafted.title, type: concept.type, code: script.code }, drafted.content);
      await prisma.scriptVersion.create({ data: { scriptId: script.id, version: script.version, content: drafted.content as never, markdown, authoredBy: 'critic-revision', note: job.comment } });
      script = await prisma.script.update({ where: { id: script.id }, data: { content: drafted.content as never, markdown, version: { increment: 1 }, status: 'CRITIC_RUNNING' } });
    } else if (!script) {
      // Parallel writers race on code allocation; retry on unique collision so
      // each script gets the next free NN (invariant 7).
      for (let attempt = 0; attempt < 8 && !script; attempt++) {
        const existing = await prisma.script.findMany({ where: { clientId: set.clientId, code: { startsWith: `${client.code}-${set.yymm}-` } }, select: { code: true } });
        const nn = nextSequence(existing.map((e) => e.code), client.code, set.yymm);
        const code = buildCode({ clientCode: client.code, yymm: set.yymm, nn });
        const markdown = renderScriptMarkdown({ nn, title: drafted.title, type: concept.type, code }, drafted.content);
        try {
          script = await prisma.script.create({
            data: {
              clientId: set.clientId, setId: set.id, conceptId: concept.id, code, title: drafted.title, type: concept.type,
              language: client.language, avatarId: concept.avatarId, actorIds: concept.actorId ? [concept.actorId] : [], locationId: concept.locationId,
              content: drafted.content as never, markdown, status: 'CRITIC_RUNNING', source: 'GENERATED',
            },
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002') continue; // code taken, retry with next NN
          throw e;
        }
      }
      if (!script) throw new Error('Не можев да алоцирам код за сценарио.');
    }

    await recordMessage(run.id, 'script', { code: script!.code }, 'set', set.id);
    await recordCost({ runId: run.id, clientId: set.clientId, setId: set.id, agentKind: 'writer', model: routing.model, usd: costUsd, scope: 'set', scopeId: set.id });
    await finishRun(run.id, 'DONE', 'set', set.id, 'writer', undefined, writerSession);
    if (await enforceBudget(set.id)) return;
    await setQueue.add('critic', { kind: 'critic', setId: set.id, scriptId: script!.id });
  } catch (err) {
    await finishRun(run.id, 'FAILED', 'set', set.id, 'writer', String(err));
    throw err;
  }
}

async function critic(job: Extract<SetJob, { kind: 'critic' }>) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: job.scriptId } });
  const routing = await getRouting('critic');
  const system = await getSystemPrompt('critic');
  const run = await startRun({ clientId: script.clientId, setId: script.setId ?? undefined, agentKind: 'critic', model: routing.model, scope: 'set', scopeId: script.setId! });
  try {
    let scores: CriterionScores;
    let findings: { criterion: string; text: string; frame?: number }[];
    let costUsd = isStubMode() ? 0.3 : 0;
    if (isStubMode()) {
      ({ scores, findings } = stubCritic());
    } else {
      const res = await runQuery({
        systemPrompt: system,
        prompt: `Оцени го сценариото по 11-те критериуми (1–5) и дај наоди со референца на кадар. Јазик: ${script.language}.\nСценарио (markdown):\n${script.markdown}\nВрати ги оценките и наодите во бараниот JSON облик.`,
        model: routing.model,
        schema: criticSchema,
      });
      const parsed = parseAgentJson<{ scores: CriterionScores; findings: { criterion: string; text: string; frame?: number }[] }>(res);
      scores = parsed.scores;
      findings = parsed.findings;
      costUsd = res.costUsd;
    }
    const evaluation = evaluateCritic(scores);
    const outcome = nextCriticOutcome(evaluation, script.revisionRound);
    const report = { scores, findings, totalPercent: evaluation.totalPercent, passed: evaluation.passed, failedCriteria: evaluation.failedCriteria };

    await prisma.script.update({ where: { id: script.id }, data: { criticReport: report as never } });
    await recordCost({ runId: run.id, clientId: script.clientId, setId: script.setId ?? undefined, agentKind: 'critic', model: routing.model, usd: costUsd, scope: 'set', scopeId: script.setId! });
    await finishRun(run.id, 'DONE', 'set', script.setId!, 'critic');
    if (await enforceBudget(script.setId!)) return;

    if (outcome === 'AUTO_REVISION') {
      await prisma.script.update({ where: { id: script.id }, data: { status: 'WRITING', revisionRound: { increment: 1 } } });
      await setQueue.add('writer', { kind: 'writer', setId: script.setId!, conceptId: script.conceptId!, revision: true });
      return;
    }
    await prisma.script.update({ where: { id: script.id }, data: { status: outcome === 'REVIEW' ? 'SCRIPTS_REVIEW' : 'CRITIC_FAILED' } });
    await publish({ type: 'script.ready', scope: 'set', id: script.setId!, setId: script.setId!, scriptId: script.id });
    await maybeReviewSet(script.setId!);
  } catch (err) {
    await finishRun(run.id, 'FAILED', 'set', script.setId!, 'critic', String(err));
    throw err;
  }
}
