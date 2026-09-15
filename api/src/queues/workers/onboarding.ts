import { prisma } from '../../lib/prisma.js';
import { getRouting, getSystemPrompt } from '../../agents/registry.js';
import { isStubMode, runQuery, parseAgentJson } from '../../agents/sdk.js';
import { questionsSchema, profileSchema, avatarsSchema } from '../../agents/schemas.js';
import { stubAnalystQuestions, stubClientProfile, stubAvatars, type StubAvatar } from '../../agents/stubs.js';
import { startRun, recordMessage, recordCost, finishRun } from '../../services/agentRunService.js';
import { transitionClient } from '../../domain/clientMachine.js';
import { publish } from '../../events/bus.js';
import type { ClientStatus } from '../../domain/types.js';

export type OnboardingJob =
  | { kind: 'client_analyst'; phase: 'research'; clientId: string }
  | { kind: 'client_analyst'; phase: 'profile'; clientId: string; answers: Record<string, string>; comment?: string }
  | { kind: 'avatar_builder'; clientId: string };

// Transition helper that goes through the state machine (invariant 1) and
// publishes an SSE status event.
async function advance(clientId: string, from: ClientStatus, to: ClientStatus) {
  const res = transitionClient({ from, to, role: 'ADMIN' });
  if (!res.ok) throw new Error(`Bad transition ${from}→${to}: ${res.message}`);
  // Guarded on the source status so a concurrent transition can't be clobbered
  // (invariant 1) — the write applies only if the client is still in `from`.
  const upd = await prisma.client.updateMany({ where: { id: clientId, status: from }, data: { status: to } });
  if (upd.count === 0) throw new Error(`Client ${clientId} no longer in ${from} for ${from}→${to}`);
  await publish({ type: 'status.changed', scope: 'client', id: clientId, status: to });
}

// A compact digest of what the system already KNOWS about the client from its
// videos and graphics — so the Client Analyst synthesizes ALL sources into the
// profile, not just the website text. Keeps it short (top items) to avoid
// drowning the analyst; only confirmed catalog/glossary count (invariant 2).
async function buildBrainDigest(clientId: string): Promise<string> {
  const [products, mentions, tags, slogans, actors, locations, stars] = await Promise.all([
    prisma.product.findMany({ where: { clientId, confirmed: true, active: true }, select: { name: true, usp: true }, take: 20 }),
    prisma.mention.findMany({ where: { clientId, status: 'CONFIRMED' }, select: { name: true }, take: 60 }),
    prisma.tag.findMany({ where: { clientId }, select: { dimension: true, value: true }, take: 80 }),
    prisma.glossaryTerm.findMany({ where: { clientId, confirmed: true, kind: 'PREFERRED' }, select: { term: true }, take: 20 }),
    prisma.actor.findMany({ where: { clientId, confirmed: true }, select: { name: true }, take: 20 }),
    prisma.location.findMany({ where: { clientId, confirmed: true }, select: { name: true }, take: 20 }),
    prisma.script.findMany({ where: { clientId, isStarExample: true }, select: { title: true }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const byDim = (d: string) => uniq(tags.filter((t) => t.dimension === d).map((t) => t.value));
  const parts: string[] = [];
  if (products.length) parts.push(`ПРОДУКТИ/УСЛУГИ (потврдени): ${products.map((p) => `${p.name}${p.usp ? ` — ${p.usp}` : ''}`).join('; ')}`);
  const m = uniq(mentions.map((x) => x.name));
  if (m.length) parts.push(`СПОМНАТИ ВО ВИДЕА: ${m.join('; ')}`);
  const vt = byDim('videoType');
  if (vt.length) parts.push(`ТИПОВИ ВИДЕА: ${vt.join(', ')}`);
  const tp = byDim('topic');
  if (tp.length) parts.push(`ТЕМИ ЗАСТАПЕНИ: ${tp.join(', ')}`);
  const ht = byDim('hookType');
  if (ht.length) parts.push(`ТИПОВИ ХУКОВИ: ${ht.join(', ')}`);
  if (slogans.length) parts.push(`ПОТПИСНИ ФРАЗИ: ${slogans.map((s) => s.term).join('; ')}`);
  if (actors.length) parts.push(`АКТЕРИ: ${uniq(actors.map((a) => a.name)).join(', ')}`);
  if (locations.length) parts.push(`ЛОКАЦИИ: ${uniq(locations.map((l) => l.name)).join(', ')}`);
  if (stars.length) parts.push(`${stars.length} постоечки сценарија. Наслови (примерок): ${stars.slice(0, 12).map((s) => s.title).join(' · ')}`);
  return parts.length ? parts.join('\n') : '';
}

export async function runOnboardingJob(job: OnboardingJob): Promise<void> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: job.clientId } });
  const scope = 'client';

  if (job.kind === 'client_analyst') {
    const routing = await getRouting('client_analyst');
    const system = await getSystemPrompt('client_analyst');
    const run = await startRun({ clientId: client.id, agentKind: 'client_analyst', model: routing.model, scope, scopeId: client.id });
    await recordMessage(run.id, 'system', { system }, scope, client.id);

    // Full scraped site text (from the ingest scraper) is the analyst's main
    // source when present — richer profile, fewer questions.
    const site = client.websiteText
      ? `\n\nТЕКСТ ОД ВЕБ-САЈТОТ НА КЛИЕНТОТ (главен извор за фактите):\n${client.websiteText.slice(0, 60000)}`
      : '';
    // What the system already knows from the client's videos + graphics.
    const brainDigest = await buildBrainDigest(client.id);
    const brainBlock = brainDigest
      ? `\n\nШТО СИСТЕМОТ ВЕЌЕ ГО ЗНАЕ ОД ВИДЕАТА И ГРАФИКИТЕ НА КЛИЕНТОТ (реален материјал — синтетизирај го):\n${brainDigest}`
      : '';
    try {
      if (job.phase === 'research') {
        const prompt = `Истражи го клиентот „${client.name}“ (индустрија: ${client.industry ?? 'непозната'}).${site}${brainBlock}\nПостави 3–5 конкретни прашања до операторот САМО за она што НЕ е јасно од сајтот, видеата и графиките, во бараниот JSON облик.`;
        await recordMessage(run.id, 'user', { prompt }, scope, client.id);
        let sessionId: string | undefined;
        let questions;
        let costUsd = isStubMode() ? 0.01 : 0;
        if (isStubMode()) {
          questions = stubAnalystQuestions(client.name);
        } else {
          const res = await runQuery({ systemPrompt: system, prompt, model: routing.model, schema: questionsSchema });
          questions = parseAgentJson<ReturnType<typeof stubAnalystQuestions>>(res);
          sessionId = res.sessionId;
          costUsd = res.costUsd;
        }
        await recordMessage(run.id, 'questions', questions, scope, client.id);
        await recordCost({ runId: run.id, clientId: client.id, agentKind: 'client_analyst', model: routing.model, usd: costUsd, scope, scopeId: client.id });
        await finishRun(run.id, 'DONE', scope, client.id, 'client_analyst', undefined, sessionId);
        await advance(client.id, 'ANALYST_RUNNING', 'ANALYST_QUESTIONS');
        await publish({ type: 'questions.ready', scope, id: client.id });
      } else {
        const answers = job.answers;
        await recordMessage(run.id, 'user', { answers, comment: job.comment }, scope, client.id);
        // Resume the analyst's research session so context isn't re-paid (invariant 4).
        const prior = await prisma.agentRun.findFirst({ where: { clientId: client.id, agentKind: 'client_analyst', sessionId: { not: null } }, orderBy: { createdAt: 'desc' } });
        const prompt = job.comment
          ? `Ревидирај го профилот според коментарот: „${job.comment}“. Задржи ги одговорите: ${JSON.stringify(answers)}`
          : `Состави богат ClientProfile.md од одговорите на операторот: ${JSON.stringify(answers)}.${site}${brainBlock}\nСинтетизирај ги СИТЕ извори (веб + видеа + графики). Вклучи јасно: индустрија, продукти/услуги (искористи го РЕАЛНИОТ каталог и споменатото во видеа), УСП и позиционирање, ТОН НА ГЛАС и претпочитани/забранети зборови (од потписните фрази), ЦЕЛНА ПУБЛИКА (за аватари), ТИПОВИ СОДРЖИНА што клиентот веќе ги прави (типови видеа/теми/хукови), и ТЕСТИМОНИЈАЛИ/резултати ако ги има.\nИсто така предложи 2–4 директни КОНКУРЕНТИ на пазарот во полето „competitors“ (name, why = зошто е релевантен, doNotCopy = што да не се копира). Врати markdown + структурирани податоци во бараниот JSON облик.`;
        let sessionId: string | undefined;
        let profile;
        let costUsd = isStubMode() ? 0.03 : 0;
        if (isStubMode()) {
          profile = stubClientProfile(client.name, answers);
        } else {
          const res = await runQuery({ systemPrompt: system, prompt, model: routing.model, schema: profileSchema, sessionId: prior?.sessionId ?? undefined });
          profile = parseAgentJson<ReturnType<typeof stubClientProfile>>(res);
          sessionId = res.sessionId;
          costUsd = res.costUsd;
        }
        const last = await prisma.clientProfile.findFirst({ where: { clientId: client.id }, orderBy: { version: 'desc' } });
        const version = (last?.version ?? 0) + 1;
        await prisma.clientProfile.create({ data: { clientId: client.id, version, markdown: profile.markdown, data: profile.data as never, approved: false } });
        await prisma.brainChange.create({ data: { clientId: client.id, kind: 'Профил', summary: `Генериран профил v${version} (чека одобрување).` } });
        // Proposed competitors → PENDING_CONFIRMATION (invariant 2). Only added
        // when the analyst returns them and they don't already exist by name.
        const proposed = ((profile as { competitors?: { name?: string; why?: string; doNotCopy?: string }[] }).competitors ?? []).filter((cp) => cp?.name);
        if (proposed.length) {
          const existing = new Set(
            (await prisma.competitor.findMany({ where: { clientId: client.id }, select: { name: true } })).map((x) => x.name.toLowerCase()),
          );
          let added = 0;
          for (const cp of proposed) {
            if (existing.has(cp.name!.toLowerCase())) continue;
            await prisma.competitor.create({
              data: { clientId: client.id, name: cp.name!, links: {}, why: cp.why ?? null, doNotCopy: cp.doNotCopy ?? null, status: 'PENDING_CONFIRMATION' },
            });
            added++;
          }
          if (added > 0) await prisma.brainChange.create({ data: { clientId: client.id, kind: 'Конкурент', summary: `Предложени ${added} конкуренти (чекаат потврда).` } });
        }
        await recordMessage(run.id, 'profile', profile, scope, client.id);
        await recordCost({ runId: run.id, clientId: client.id, agentKind: 'client_analyst', model: routing.model, usd: costUsd, scope, scopeId: client.id });
        await finishRun(run.id, 'DONE', scope, client.id, 'client_analyst', undefined, sessionId);
        await advance(client.id, 'ANALYST_RUNNING', 'ANALYST_REVIEW');
        await publish({ type: 'profile.ready', scope, id: client.id });
      }
    } catch (err) {
      await finishRun(run.id, 'FAILED', scope, client.id, 'client_analyst', String(err));
      throw err;
    }
    return;
  }

  // avatar_builder
  const routing = await getRouting('avatar_builder');
  const system = await getSystemPrompt('avatar_builder');
  const run = await startRun({ clientId: client.id, agentKind: 'avatar_builder', model: routing.model, scope, scopeId: client.id });
  try {
    const profileDoc = await prisma.clientProfile.findFirst({ where: { clientId: client.id, approved: true }, orderBy: { version: 'desc' } });
    let avatars: StubAvatar[];
    let costUsd = isStubMode() ? 0.02 : 0;
    if (isStubMode()) {
      avatars = stubAvatars(client.name);
    } else {
      const res = await runQuery({
        systemPrompt: system,
        prompt: `Од одобрениот профил изгради 4–8 аватари на купци за „${client.name}“. Профил:\n${profileDoc?.markdown ?? ''}\nВрати ги во бараниот JSON облик.`,
        model: routing.model,
        schema: avatarsSchema,
      });
      avatars = parseAgentJson<{ avatars: StubAvatar[] }>(res).avatars;
      costUsd = res.costUsd;
    }
    // Idempotent on retry: clear any previously-proposed (unconfirmed) avatars so
    // a re-run replaces the proposed set instead of duplicating it (invariant 10).
    await prisma.avatar.deleteMany({ where: { clientId: client.id, status: 'PENDING_CONFIRMATION' } });
    for (const a of avatars) {
      await prisma.avatar.create({ data: { clientId: client.id, name: a.name, profile: a.profile as never, status: 'PENDING_CONFIRMATION' } });
    }
    await prisma.brainChange.create({ data: { clientId: client.id, kind: 'Аватари', summary: `Предложени ${avatars.length} аватари (чекаат потврда).` } });
    await recordMessage(run.id, 'avatars', { count: avatars.length }, scope, client.id);
    await recordCost({ runId: run.id, clientId: client.id, agentKind: 'avatar_builder', model: routing.model, usd: costUsd, scope, scopeId: client.id });
    await finishRun(run.id, 'DONE', scope, client.id, 'avatar_builder');
    await advance(client.id, 'AVATARS_RUNNING', 'AVATARS_REVIEW');
    await publish({ type: 'avatars.ready', scope, id: client.id });
  } catch (err) {
    await finishRun(run.id, 'FAILED', scope, client.id, 'avatar_builder', String(err));
    throw err;
  }
}
