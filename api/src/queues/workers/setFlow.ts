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
import { buildCreativeDirectorPrompt, buildWriterPrompt, buildCriticPrompt, scriptSkeleton } from '../../agents/prompts.js';
import { listHooks } from '../../services/mineService.js';
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

// Load the client's language + glossary (preferred/banned) for any text-writing
// agent — required input by invariant 8. Only confirmed terms are used so an
// unconfirmed proposal never steers generation.
async function loadGlossary(clientId: string) {
  const glossary = await prisma.glossaryTerm.findMany({ where: { clientId, confirmed: true } });
  const banned = glossary.filter((g) => g.kind === 'BANNED').map((g) => g.term);
  const preferred = glossary.filter((g) => g.kind !== 'BANNED').map((g) => `${g.term} (${g.meaning})`);
  return { banned, preferred };
}

// Confirmed catalog ESSENCE — the substance the Writer builds real content from,
// instead of inventing it or borrowing it from an example. Price is deliberately
// omitted: it changes per set and essence matters more than the exact number
// (catalog↔mentions separation). Only confirmed products (invariant 2).
async function loadCatalog(clientId: string) {
  const products = await prisma.product.findMany({
    where: { clientId, confirmed: true, active: true },
    select: { name: true, category: true, usp: true },
    take: 12,
  });
  return products.map((p) => `${p.name}${p.category ? ` (${p.category})` : ''}: ${p.usp ?? '—'}`);
}

// The client's VOICE as a compact CARD + a few structural SKELETONS — never raw
// example text. `data.tone` gives cadence/address/do-don't (not website
// sentences); skeletons give rhythm (not phrases). Both are guidance, not text
// to reproduce — this is what stops the Writer recycling existing lines.
async function loadVoice(clientId: string) {
  const profile = await prisma.clientProfile.findFirst({ where: { clientId, approved: true }, orderBy: { version: 'desc' } });
  const data = (profile?.data ?? {}) as { tone?: string };
  const voiceCard = (data.tone ?? '').trim() || (profile?.markdown ?? '').slice(0, 800);
  const stars = await prisma.script.findMany({
    where: { clientId, isStarExample: true },
    select: { content: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  const skeletons = stars.map((s) => scriptSkeleton(s.content)).filter((sk) => sk.length > 0);
  return { voiceCard, skeletons };
}

// Creativity fuel for the Creative Director: proven hooks (swipe file), manual
// insights (what works), and DO_NOT_COPY references (what to avoid).
async function loadInspiration(clientId: string) {
  const hooks = (await listHooks(clientId)).slice(0, 8);
  const insights = await prisma.insight.findMany({
    where: { OR: [{ clientId }, { clientId: null }] },
    orderBy: { weight: 'desc' },
    take: 8,
  });
  const doNotCopy = await prisma.trendReference.findMany({ where: { clientId, flag: 'DO_NOT_COPY' }, take: 5 });
  return { hooks, insights, doNotCopy };
}

async function creativeDirector(setId: string) {
  const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId }, include: { client: true } });
  const brief = set.brief as { product?: string; notes?: string; avatarIds?: string[]; actorIds?: string[]; locationIds?: string[] };
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
      const { banned, preferred } = await loadGlossary(set.clientId);
      const voice = await loadVoice(set.clientId);
      const insp = await loadInspiration(set.clientId);
      const doNotCopy = insp.doNotCopy.map((r) => r.analysis || r.url).filter((s): s is string => !!s);
      const prompt = buildCreativeDirectorPrompt({
        brief: brief.notes,
        clientName: set.client.name,
        language: set.client.language,
        requested: set.requested,
        product: brief.product,
        avatars,
        actors,
        locations,
        preferred,
        banned,
        voiceCard: voice.voiceCard,
        hooks: insp.hooks,
        insights: insp.insights,
        doNotCopy,
      });
      const res = await runQuery({ systemPrompt: system, prompt, model: routing.model, schema: conceptsSchema });
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
  const concept = await prisma.concept.findUniqueOrThrow({ where: { id: job.conceptId }, include: { actor: true, location: true, set: { include: { client: true } } } });
  const set = concept.set;
  const client = set.client;
  const actorName = concept.actor?.name ?? 'Актер';
  const card = concept.card as { hook: string; insight?: string; why?: string };

  const routing = await getRouting('writer');
  const system = await getSystemPrompt('writer');
  const run = await startRun({ clientId: set.clientId, setId: set.id, conceptId: concept.id, agentKind: 'writer', model: routing.model, scope: 'set', scopeId: set.id });
  try {
    const brief = set.brief as { product?: string; notes?: string };
    let drafted: {
      title: string;
      content: ScriptContent;
      format?: string;
      vibe?: string;
      music?: string;
      platforms?: string[];
      durationSec?: number;
      hookVariants?: string[];
      captions?: string[];
      productionNote?: string;
    };
    let writerSession: string | undefined;
    let costUsd = isStubMode() ? 0.4 : 0;
    if (isStubMode()) {
      drafted = stubScript({ actorName, hook: card.hook, product: brief.product });
    } else {
      const { banned, preferred } = await loadGlossary(set.clientId);
      const voice = await loadVoice(set.clientId);
      const catalog = await loadCatalog(set.clientId);
      const actor = concept.actor;
      const avatar = concept.avatarId ? await prisma.avatar.findUnique({ where: { id: concept.avatarId } }) : null;
      // Resume the session for THIS concept (invariant 4) — not just any writer
      // run on the set, or parallel writers would resume each other's context.
      const priorRun = job.revision ? await prisma.agentRun.findFirst({ where: { setId: set.id, conceptId: concept.id, agentKind: 'writer', sessionId: { not: null } }, orderBy: { createdAt: 'desc' } }) : null;
      const prompt = buildWriterPrompt({
        brief: brief.notes,
        language: client.language,
        revision: job.revision,
        comment: job.comment,
        hook: card.hook,
        insight: card.insight,
        why: card.why,
        scriptType: concept.type,
        avatar,
        product: brief.product,
        catalog,
        actorName,
        actorStyle: actor?.style ?? null,
        actorCannotDo: actor?.cannotDo,
        location: concept.location,
        preferred,
        banned,
        voiceCard: voice.voiceCard,
        skeletons: voice.skeletons,
      });
      const res = await runQuery({ systemPrompt: system, prompt, model: routing.model, schema: scriptSchema, sessionId: priorRun?.sessionId ?? undefined });
      drafted = parseAgentJson<typeof drafted>(res);
      writerSession = res.sessionId;
      costUsd = res.costUsd;
    }

    // Rich delivered-document fields (scenario-templejt) — stored alongside the
    // frames so the export can render the full document the scriptwriter delivers.
    const rich = {
      format: drafted.format ?? null,
      vibe: drafted.vibe ?? null,
      music: drafted.music ?? null,
      platforms: drafted.platforms ?? [],
      durationSec: drafted.durationSec != null ? Math.round(drafted.durationSec) : null,
      hookVariants: drafted.hookVariants ?? [],
      captions: drafted.captions ?? [],
      productionNote: drafted.productionNote ?? null,
    };

    // Move set into CRITIC phase. Tolerant of concurrent writers AND of a
    // revision in progress: a returned script leaves the set in REVISION and an
    // auto-revision leaves it in CRITIC_RUNNING — both must land in CRITIC_RUNNING
    // so the set status reflects reality (invariant 1/10), not silently no-op.
    await moveSet(set.id, ['SCRIPTS_WRITING', 'REVISION', 'CRITIC_RUNNING'], 'CRITIC_RUNNING');

    let script = await prisma.script.findFirst({ where: { setId: set.id, conceptId: concept.id } });
    if (script && job.revision) {
      const nn = Number.parseInt(script.code.split('-')[2] ?? '1', 10);
      const markdown = renderScriptMarkdown({ nn, title: drafted.title, type: concept.type, code: script.code, ...rich }, drafted.content);
      await prisma.scriptVersion.create({ data: { scriptId: script.id, version: script.version, content: drafted.content as never, markdown, authoredBy: 'critic-revision', note: job.comment } });
      script = await prisma.script.update({ where: { id: script.id }, data: { content: drafted.content as never, markdown, version: { increment: 1 }, status: 'CRITIC_RUNNING', ...rich } });
    } else if (!script) {
      // Parallel writers race on code allocation; retry on unique collision so
      // each script gets the next free NN (invariant 7).
      for (let attempt = 0; attempt < 8 && !script; attempt++) {
        const existing = await prisma.script.findMany({ where: { clientId: set.clientId, code: { startsWith: `${client.code}-${set.yymm}-` } }, select: { code: true } });
        const nn = nextSequence(existing.map((e) => e.code), client.code, set.yymm);
        const code = buildCode({ clientCode: client.code, yymm: set.yymm, nn });
        const markdown = renderScriptMarkdown({ nn, title: drafted.title, type: concept.type, code, ...rich }, drafted.content);
        try {
          script = await prisma.script.create({
            data: {
              clientId: set.clientId, setId: set.id, conceptId: concept.id, code, title: drafted.title, type: concept.type,
              language: client.language, avatarId: concept.avatarId, actorIds: concept.actorId ? [concept.actorId] : [], locationId: concept.locationId,
              content: drafted.content as never, markdown, status: 'CRITIC_RUNNING', source: 'GENERATED', ...rich,
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
      const { banned, preferred } = await loadGlossary(script.clientId);
      const catalog = await loadCatalog(script.clientId);
      // The intent behind the script (F6): its concept (buyer + angle) and the
      // set brief — so avatar/hook/structure criteria are judged against intent.
      const concept = script.conceptId ? await prisma.concept.findUnique({ where: { id: script.conceptId }, include: { avatar: true } }) : null;
      const conceptCard = (concept?.card ?? {}) as { hook?: string; insight?: string };
      const set = script.setId ? await prisma.scriptSet.findUnique({ where: { id: script.setId } }) : null;
      const briefNotes = (set?.brief as { notes?: string } | null)?.notes;
      const res = await runQuery({
        systemPrompt: system,
        prompt: buildCriticPrompt({
          language: script.language,
          preferred,
          banned,
          catalog,
          markdown: script.markdown,
          brief: briefNotes,
          avatar: concept?.avatar,
          conceptHook: conceptCard.hook,
          conceptInsight: conceptCard.insight,
        }),
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
