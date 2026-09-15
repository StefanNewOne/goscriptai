import { prisma } from '../../lib/prisma.js';
import { getRouting, getSystemPrompt, getCriticRubric } from '../../agents/registry.js';
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
  // language/scriptId target ONE language version on revision (BOTH clients have
  // two per concept); both are omitted on fresh generation.
  | { kind: 'writer'; setId: string; conceptId: string; revision?: boolean; comment?: string; language?: string; scriptId?: string }
  | { kind: 'critic'; setId: string; scriptId: string };

// A Writer's structured output — the script plus the rich delivered-document fields.
interface WriterDraft {
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
}

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

// What the Writer produces + persists for ONE language version of a concept.
interface LangResult {
  lang: string;
  run: { id: string };
  drafted: WriterDraft;
  rich: Record<string, unknown>;
  session?: string;
  costUsd: number;
  script?: { id: string; code: string; status: string };
  needsCritic: boolean;
  finished: boolean;
}

async function writer(job: Extract<SetJob, { kind: 'writer' }>) {
  const concept = await prisma.concept.findUniqueOrThrow({ where: { id: job.conceptId }, include: { actor: true, location: true, set: { include: { client: true } } } });
  const set = concept.set;
  const client = set.client;
  const actorName = concept.actor?.name ?? 'Актер';
  const actor = concept.actor;
  const card = concept.card as { hook: string; insight?: string; why?: string };
  const brief = set.brief as { product?: string; notes?: string };

  const routing = await getRouting('writer');
  const system = await getSystemPrompt('writer');

  // BOTH clients get two versions per concept (-MK/-SQ, invariant 8) sharing one
  // NN; a revision targets exactly ONE language version (job.language).
  const isBoth = client.language === 'BOTH';
  const langs: string[] = job.revision ? [job.language ?? client.language] : isBoth ? ['MK', 'SQ'] : [client.language];

  // Move set into CRITIC phase once. Tolerant of concurrent writers AND of a
  // revision in progress: a returned script leaves the set in REVISION and an
  // auto-revision leaves it in CRITIC_RUNNING — both must land in CRITIC_RUNNING
  // so the set status reflects reality (invariant 1/10), not silently no-op.
  await moveSet(set.id, ['SCRIPTS_WRITING', 'REVISION', 'CRITIC_RUNNING'], 'CRITIC_RUNNING');

  const stub = isStubMode();
  // Language-independent context — loaded once, reused for each language.
  let banned: string[] = [];
  let preferred: string[] = [];
  let voiceCard = '';
  let skeletons: string[] = [];
  let catalog: string[] = [];
  let avatar: { name?: string; profile?: unknown } | null = null;
  if (!stub) {
    ({ banned, preferred } = await loadGlossary(set.clientId));
    const voice = await loadVoice(set.clientId);
    voiceCard = voice.voiceCard;
    skeletons = voice.skeletons;
    catalog = await loadCatalog(set.clientId);
    avatar = concept.avatarId ? await prisma.avatar.findUnique({ where: { id: concept.avatarId } }) : null;
  }

  const results: LangResult[] = [];
  try {
    // ── Draft each language version (its own agent run + resumable session) ──
    for (const lang of langs) {
      const run = await startRun({ clientId: set.clientId, setId: set.id, conceptId: concept.id, language: isBoth ? lang : undefined, agentKind: 'writer', model: routing.model, scope: 'set', scopeId: set.id });
      const r: LangResult = { lang, run, drafted: { title: '', content: { frames: [] } }, rich: {}, costUsd: stub ? 0.4 : 0, needsCritic: false, finished: false };
      results.push(r);
      if (stub) {
        r.drafted = stubScript({ actorName, hook: card.hook, product: brief.product });
      } else {
        // Resume the session for THIS concept+language (invariant 4) — filtered by
        // language too, so a BOTH client's parallel MK/SQ writers don't resume
        // each other's context.
        const priorRun = job.revision
          ? await prisma.agentRun.findFirst({ where: { setId: set.id, conceptId: concept.id, agentKind: 'writer', sessionId: { not: null }, ...(isBoth ? { language: lang } : {}) }, orderBy: { createdAt: 'desc' } })
          : null;
        const prompt = buildWriterPrompt({
          brief: brief.notes,
          language: lang,
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
          voiceCard,
          skeletons,
        });
        const res = await runQuery({ systemPrompt: system, prompt, model: routing.model, schema: scriptSchema, sessionId: priorRun?.sessionId ?? undefined });
        r.drafted = parseAgentJson<WriterDraft>(res);
        r.session = res.sessionId;
        r.costUsd = res.costUsd;
      }
      // Rich delivered-document fields — stored alongside the frames so the
      // export can render the full document the scriptwriter delivers.
      r.rich = {
        format: r.drafted.format ?? null,
        vibe: r.drafted.vibe ?? null,
        music: r.drafted.music ?? null,
        platforms: r.drafted.platforms ?? [],
        durationSec: r.drafted.durationSec != null ? Math.round(r.drafted.durationSec) : null,
        hookVariants: r.drafted.hookVariants ?? [],
        captions: r.drafted.captions ?? [],
        productionNote: r.drafted.productionNote ?? null,
      };
    }

    // ── Persist ──
    if (job.revision) {
      const r = results[0]!;
      const target = job.scriptId
        ? await prisma.script.findUnique({ where: { id: job.scriptId } })
        : await prisma.script.findFirst({ where: { setId: set.id, conceptId: concept.id } });
      if (!target) throw new Error('Нема сценарио за ревизија.');
      const nn = Number.parseInt(target.code.split('-')[2] ?? '1', 10);
      const markdown = renderScriptMarkdown({ nn, title: r.drafted.title, type: concept.type, code: target.code, ...r.rich }, r.drafted.content);
      await prisma.scriptVersion.create({ data: { scriptId: target.id, version: target.version, content: r.drafted.content as never, markdown, authoredBy: 'critic-revision', note: job.comment } });
      r.script = await prisma.script.update({ where: { id: target.id }, data: { content: r.drafted.content as never, markdown, version: { increment: 1 }, status: 'CRITIC_RUNNING', ...r.rich } });
      r.needsCritic = true;
    } else {
      // Fresh: idempotent per (concept, language) so a retry never duplicates. All
      // language versions of a concept share ONE NN (invariant 8); collision retry
      // guards the atomic allocation across parallel writers (invariant 7).
      const existingForConcept = await prisma.script.findMany({ where: { setId: set.id, conceptId: concept.id } });
      for (const r of results) {
        const sib = existingForConcept.find((s) => (isBoth ? s.language === r.lang : true));
        if (sib) r.script = sib; // already created on a prior attempt — reuse, don't re-critique
      }
      const missing = results.filter((r) => !r.script);
      if (missing.length) {
        let nn: number | null = existingForConcept.length ? Number.parseInt(existingForConcept[0]!.code.split('-')[2] ?? '1', 10) : null;
        let created = false;
        for (let attempt = 0; attempt < 8 && !created; attempt++) {
          if (nn == null) {
            const all = await prisma.script.findMany({ where: { clientId: set.clientId, code: { startsWith: `${client.code}-${set.yymm}-` } }, select: { code: true } });
            nn = nextSequence(all.map((e) => e.code), client.code, set.yymm);
          }
          try {
            const made = await prisma.$transaction(
              missing.map((r) => {
                const code = buildCode({ clientCode: client.code, yymm: set.yymm, nn: nn!, language: isBoth ? (r.lang as 'MK' | 'SQ') : undefined });
                const markdown = renderScriptMarkdown({ nn: nn!, title: r.drafted.title, type: concept.type, code, ...r.rich }, r.drafted.content);
                return prisma.script.create({
                  data: {
                    clientId: set.clientId, setId: set.id, conceptId: concept.id, code, title: r.drafted.title, type: concept.type,
                    language: (isBoth ? r.lang : client.language) as typeof client.language,
                    avatarId: concept.avatarId, actorIds: concept.actorId ? [concept.actorId] : [], locationId: concept.locationId,
                    content: r.drafted.content as never, markdown, status: 'CRITIC_RUNNING', source: 'GENERATED', ...r.rich,
                  },
                });
              }),
            );
            missing.forEach((r, idx) => {
              r.script = made[idx]!;
              r.needsCritic = true;
            });
            created = true;
          } catch (e) {
            if ((e as { code?: string }).code === 'P2002') { nn = null; continue; } // code taken, next NN
            throw e;
          }
        }
        if (missing.some((r) => !r.script)) throw new Error('Не можев да алоцирам код за сценарио.');
      }
    }

    // ── Bookkeeping per language run ──
    for (const r of results) {
      await recordMessage(r.run.id, 'script', { code: r.script!.code }, 'set', set.id);
      await recordCost({ runId: r.run.id, clientId: set.clientId, setId: set.id, agentKind: 'writer', model: routing.model, usd: r.costUsd, scope: 'set', scopeId: set.id });
      await finishRun(r.run.id, 'DONE', 'set', set.id, 'writer', undefined, r.session);
      r.finished = true;
    }
    if (await enforceBudget(set.id)) return;
    for (const r of results) {
      if (r.needsCritic) await setQueue.add('critic', { kind: 'critic', setId: set.id, scriptId: r.script!.id });
    }
  } catch (err) {
    for (const r of results) {
      if (!r.finished) await finishRun(r.run.id, 'FAILED', 'set', set.id, 'writer', String(err)).catch(() => {});
    }
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
    // Rubric + threshold are editable from Settings (invariant 9) — read them at
    // evaluation time instead of the hardcoded baseline.
    const rubric = await getCriticRubric();
    const evaluation = evaluateCritic(scores, rubric.minPerCriterion, rubric.minTotalRatio, rubric.perCriterionMin);
    const outcome = nextCriticOutcome(evaluation, script.revisionRound);
    const report = { scores, findings, totalPercent: evaluation.totalPercent, passed: evaluation.passed, failedCriteria: evaluation.failedCriteria };

    await prisma.script.update({ where: { id: script.id }, data: { criticReport: report as never } });
    await recordCost({ runId: run.id, clientId: script.clientId, setId: script.setId ?? undefined, agentKind: 'critic', model: routing.model, usd: costUsd, scope: 'set', scopeId: script.setId! });
    await finishRun(run.id, 'DONE', 'set', script.setId!, 'critic');
    if (await enforceBudget(script.setId!)) return;

    if (outcome === 'AUTO_REVISION') {
      await prisma.script.update({ where: { id: script.id }, data: { status: 'WRITING', revisionRound: { increment: 1 } } });
      await setQueue.add('writer', { kind: 'writer', setId: script.setId!, conceptId: script.conceptId!, revision: true, language: script.language, scriptId: script.id });
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
