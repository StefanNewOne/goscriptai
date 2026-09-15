import { prisma } from '../lib/prisma.js';
import { publish } from '../events/bus.js';
import { evaluateBudget } from '../domain/budget.js';
import type { AgentKind } from '../agents/registry.js';

// Creates and records an AgentRun. Message records are written during the run
// (invariant 5); CostEntry is automatic from SDK output (invariant 6).

export async function startRun(params: {
  clientId: string;
  setId?: string;
  conceptId?: string;
  agentKind: AgentKind;
  model: string;
  scope: string; // 'client' | 'set'
  scopeId: string;
}) {
  const run = await prisma.agentRun.create({
    data: {
      clientId: params.clientId,
      setId: params.setId,
      conceptId: params.conceptId,
      agentKind: params.agentKind,
      model: params.model,
      status: 'RUNNING',
    },
  });
  await publish({ type: 'run.started', scope: params.scope, id: params.scopeId, agentKind: params.agentKind, runId: run.id });
  return run;
}

export async function recordMessage(runId: string, role: string, content: unknown, scope: string, scopeId: string) {
  await prisma.message.create({ data: { runId, role, content: content as never } });
  await publish({ type: 'message', scope, id: scopeId, runId, role });
}

// Record cost against client + set and re-evaluate the budget. Returns whether
// the budget is now on hold.
export async function recordCost(params: {
  runId: string;
  clientId: string;
  setId?: string;
  agentKind: AgentKind;
  model: string;
  usd: number;
  scope: string;
  scopeId: string;
}): Promise<{ hold: boolean }> {
  if (params.usd > 0) {
    // Atomic: the ledger (CostEntry) and the running totals must never drift.
    await prisma.$transaction([
      prisma.costEntry.create({ data: { clientId: params.clientId, setId: params.setId, agentKind: params.agentKind, model: params.model, usd: params.usd } }),
      prisma.agentRun.update({ where: { id: params.runId }, data: { costUsd: { increment: params.usd } } }),
      prisma.client.update({ where: { id: params.clientId }, data: { spentUsd: { increment: params.usd } } }),
      ...(params.setId ? [prisma.scriptSet.update({ where: { id: params.setId }, data: { spentUsd: { increment: params.usd } } })] : []),
    ]);
  }

  const client = await prisma.client.findUniqueOrThrow({ where: { id: params.clientId } });
  await publish({ type: 'cost.updated', scope: params.scope, id: params.scopeId, spentUsd: Number(client.spentUsd) });
  const evalr = evaluateBudget(Number(client.spentUsd), Number(client.budgetUsd));
  return { hold: evalr.shouldHold };
}

export async function finishRun(runId: string, status: 'DONE' | 'FAILED', scope: string, scopeId: string, agentKind: AgentKind, error?: string, sessionId?: string) {
  await prisma.agentRun.update({ where: { id: runId }, data: { status, error, sessionId } });
  await publish({ type: 'run.finished', scope, id: scopeId, agentKind, runId });
}
