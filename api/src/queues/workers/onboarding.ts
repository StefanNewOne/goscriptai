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
  await prisma.client.update({ where: { id: clientId }, data: { status: to } });
  await publish({ type: 'status.changed', scope: 'client', id: clientId, status: to });
}

export async function runOnboardingJob(job: OnboardingJob): Promise<void> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: job.clientId } });
  const scope = 'client';

  if (job.kind === 'client_analyst') {
    const routing = await getRouting('client_analyst');
    const system = await getSystemPrompt('client_analyst');
    const run = await startRun({ clientId: client.id, agentKind: 'client_analyst', model: routing.model, scope, scopeId: client.id });
    await recordMessage(run.id, 'system', { system }, scope, client.id);

    try {
      if (job.phase === 'research') {
        const prompt = `Истражи го клиентот „${client.name}“ (индустрија: ${client.industry ?? 'непозната'}). Постави 3–5 конкретни прашања до операторот таму каде податокот недостасува, во бараниот JSON облик.`;
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
          : `Состави ClientProfile.md од одговорите на операторот: ${JSON.stringify(answers)}. Врати markdown + структурирани податоци во бараниот JSON облик.`;
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
