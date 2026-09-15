import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { transitionClient } from '../domain/clientMachine.js';
import { publish } from '../events/bus.js';
import { brainQueue } from '../queues/index.js';
import { notify } from './notificationService.js';
import type { ClientStatus, Role } from '../domain/types.js';

// Machine-validated, ATOMIC client transition (invariant 1). The updateMany is
// guarded on the source status so two concurrent brain jobs can't clobber the
// client's status — the write applies only if the client is still in `from`.
async function move(clientId: string, to: ClientStatus, role: Role, data?: Record<string, unknown>) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const from = client.status as ClientStatus;
  const res = transitionClient({ from, to, role, data });
  if (!res.ok) throw new AppError(res.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'WRONG_STATUS', res.message);
  const upd = await prisma.client.updateMany({ where: { id: clientId, status: from }, data: { status: to } });
  if (upd.count === 0) throw new AppError('WRONG_STATUS', `Клиентот не е повеќе во ${from}.`);
  await publish({ type: 'status.changed', scope: 'client', id: clientId, status: to });
  return res.sideEffects;
}

// Recover a client whose brain job exhausted its retries so it never stays stuck
// in a *_RUNNING status (invariant 10). Moves back to the nearest reviewable
// checkpoint depending on which phase failed, and leaves a trail + notification.
export async function failClient(clientId: string, job: { kind: string; phase?: string }) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;
  const target: ClientStatus | null =
    client.status === 'AVATARS_RUNNING'
      ? 'ANALYST_REVIEW'
      : client.status === 'ANALYST_RUNNING'
        ? job.phase === 'profile'
          ? 'ANALYST_QUESTIONS'
          : 'INTAKE'
        : null;
  if (!target) return; // not stuck in a running state — nothing to recover
  try {
    await move(clientId, target, 'ADMIN');
  } catch {
    return; // status already moved on by another path
  }
  await prisma.brainChange.create({
    data: { clientId, kind: 'Статус', summary: 'Агентски job падна по 3 обиди — вратено за повторен обид.' },
  });
  await notify('agent_failed', { link: `/clients/${clientId}`, payload: { clientId } });
}

// INTAKE → ANALYST_RUNNING, enqueue the research phase.
export async function startAnalysis(clientId: string, role: Role) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  // Allow starting from DRAFT (auto-move to INTAKE) or INTAKE.
  if (client.status === 'DRAFT') await move(clientId, 'INTAKE', role);
  await move(clientId, 'ANALYST_RUNNING', role);
  await brainQueue.add('client_analyst', { kind: 'client_analyst', phase: 'research', clientId });
  return { ok: true };
}

// Read the latest questions produced by the analyst (stored as a Message).
export async function getQuestions(clientId: string) {
  const run = await prisma.agentRun.findFirst({
    where: { clientId, agentKind: 'client_analyst' },
    orderBy: { createdAt: 'desc' },
    include: { messages: { where: { role: 'questions' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return run?.messages[0]?.content ?? null;
}

// ANALYST_QUESTIONS → ANALYST_RUNNING (resume), enqueue the profile phase.
export async function submitAnswers(clientId: string, role: Role, answers: Record<string, string>) {
  await move(clientId, 'ANALYST_RUNNING', role);
  await brainQueue.add('client_analyst', { kind: 'client_analyst', phase: 'profile', clientId, answers });
  return { ok: true };
}

// Human checkpoint on the profile.
export async function decideProfile(clientId: string, role: Role, userId: string, decision: 'approve' | 'request_changes', comment?: string) {
  if (decision === 'request_changes' && !comment) throw new AppError('COMMENT_REQUIRED', 'Внеси коментар за да вратиш.');
  await prisma.approval.create({ data: { clientId, checkpoint: 'ANALYST_REVIEW', decision, comment, userId } });

  if (decision === 'approve') {
    const latest = await prisma.clientProfile.findFirst({ where: { clientId }, orderBy: { version: 'desc' } });
    if (latest) await prisma.clientProfile.update({ where: { id: latest.id }, data: { approved: true } });
    await move(clientId, 'AVATARS_RUNNING', role);
    await brainQueue.add('avatar_builder', { kind: 'avatar_builder', clientId });
  } else {
    await move(clientId, 'ANALYST_RUNNING', role);
    const answers = await lastAnswers(clientId);
    await brainQueue.add('client_analyst', { kind: 'client_analyst', phase: 'profile', clientId, answers, comment });
  }
  return { ok: true };
}

async function lastAnswers(clientId: string): Promise<Record<string, string>> {
  const run = await prisma.agentRun.findFirst({
    where: { clientId, agentKind: 'client_analyst' },
    orderBy: { createdAt: 'desc' },
    include: { messages: { where: { role: 'user' }, orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const content = run?.messages[0]?.content as { answers?: Record<string, string> } | undefined;
  return content?.answers ?? {};
}

// Human checkpoint on the avatars: confirm the proposed set, then MANUAL_SETUP.
export async function decideAvatars(clientId: string, role: Role, userId: string, decision: 'approve' | 'request_changes', comment?: string) {
  if (decision === 'request_changes' && !comment) throw new AppError('COMMENT_REQUIRED', 'Внеси коментар за да вратиш.');
  await prisma.approval.create({ data: { clientId, checkpoint: 'AVATARS_REVIEW', decision, comment, userId } });
  if (decision === 'approve') {
    await prisma.avatar.updateMany({ where: { clientId, status: 'PENDING_CONFIRMATION' }, data: { status: 'ACTIVE' } });
    await move(clientId, 'MANUAL_SETUP', role);
  } else {
    await prisma.avatar.deleteMany({ where: { clientId, status: 'PENDING_CONFIRMATION' } });
    await move(clientId, 'AVATARS_RUNNING', role);
    await brainQueue.add('avatar_builder', { kind: 'avatar_builder', clientId });
  }
  return { ok: true };
}

// MANUAL_SETUP → ACTIVE (guard: at least one actor).
export async function activate(clientId: string, role: Role) {
  const actors = await prisma.actor.count({ where: { OR: [{ clientId }, { clientId: null }] } });
  await move(clientId, 'ACTIVE', role, { hasActor: actors > 0 });
  await prisma.brainChange.create({ data: { clientId, kind: 'Статус', summary: 'Клиентот е активен.' } });
  return { ok: true };
}
