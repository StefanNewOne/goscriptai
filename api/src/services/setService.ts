import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { transitionSet } from '../domain/setMachine.js';
import { evaluateBudget, canResumeAfterRaise } from '../domain/budget.js';
import { yymmFromDate } from '../domain/code.js';
import { renderScriptMarkdown } from '../domain/scriptFormat.js';
import { publish } from '../events/bus.js';
import { notify } from './notificationService.js';
import { setQueue } from '../queues/index.js';
import type { Role, SetStatus } from '../domain/types.js';
import type { ScriptContent as ScriptContentT } from '../domain/scriptFormat.js';

// Atomic, machine-validated set transition. transitionSet is the authority on
// allowed edges (invariant 1); updateMany guards against concurrent workers.
// The transition is valid if `to` is reachable from ANY of the given froms.
export async function moveSet(setId: string, froms: SetStatus[], to: SetStatus, role: Role = 'ADMIN', data?: Record<string, unknown>) {
  const valid = froms.map((f) => transitionSet({ from: f, to, role, data })).find((r) => r.ok);
  if (!valid || !valid.ok) {
    const first = transitionSet({ from: froms[0]!, to, role, data });
    const code = !first.ok && first.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'WRONG_STATUS';
    throw new AppError(code, `Транзиција во ${to} не е дозволена.`);
  }
  const updated = await prisma.scriptSet.updateMany({ where: { id: setId, status: { in: froms } }, data: { status: to } });
  if (updated.count > 0) {
    await publish({ type: 'status.changed', scope: 'set', id: setId, status: to });
  }
  return { moved: updated.count > 0, sideEffects: valid.sideEffects };
}

export async function listSets(filter: { clientId?: string; writerUserId?: string }) {
  return prisma.scriptSet.findMany({
    where: { clientId: filter.clientId, writerUserId: filter.writerUserId },
    orderBy: { createdAt: 'desc' },
    include: { client: { select: { name: true, code: true } }, _count: { select: { scripts: true, concepts: true } } },
  });
}

export async function getSet(id: string) {
  const set = await prisma.scriptSet.findUnique({
    where: { id },
    include: {
      client: true,
      concepts: { include: { avatar: true, actor: true, location: true }, orderBy: { createdAt: 'asc' } },
      scripts: { orderBy: { createdAt: 'asc' } },
      agentRuns: { orderBy: { createdAt: 'desc' } },
      costEntries: true,
    },
  });
  if (!set) throw new AppError('NOT_FOUND', 'Сетот не постои.');
  return set;
}

// Brief → create set, enqueue Creative Director. The user is free to leave.
export async function createSet(input: {
  clientId: string;
  writerUserId: string;
  requested: number;
  brief: Record<string, unknown>;
}) {
  const client = await prisma.client.findUnique({ where: { id: input.clientId } });
  if (!client) throw new AppError('NOT_FOUND', 'Клиентот не постои.');
  if (client.status !== 'ACTIVE') throw new AppError('WRONG_STATUS', 'Клиентот мора да е активен за нов сет.');
  // Client-scope budget (invariant 6): no new agent work once the client budget
  // is reached — raise it in Settings to continue.
  if (evaluateBudget(Number(client.spentUsd), Number(client.budgetUsd)).shouldHold) {
    throw new AppError('BUDGET_EXCEEDED', 'Буџетот на клиентот е достигнат. Крени го во Поставки.');
  }

  const set = await prisma.scriptSet.create({
    data: {
      clientId: input.clientId,
      writerUserId: input.writerUserId,
      requested: input.requested,
      yymm: yymmFromDate(new Date()),
      brief: input.brief as never,
      status: 'DRAFT',
    },
  });
  await moveSet(set.id, ['DRAFT'], 'BRIEF_SUBMITTED');
  await moveSet(set.id, ['BRIEF_SUBMITTED'], 'CONCEPTS_GENERATING');
  await setQueue.add('creative_director', { kind: 'creative_director', setId: set.id });
  return set;
}

export async function decideConcept(conceptId: string, decision: 'SELECTED' | 'REJECTED', comment?: string) {
  const concept = await prisma.concept.update({ where: { id: conceptId }, data: { decision, comment } });
  await publish({ type: 'status.changed', scope: 'set', id: concept.setId, status: 'CONCEPTS_REVIEW' });
  return concept;
}

// "Пиши ги избраните" — fan out one Writer job per selected concept. This is the
// human decision at the CONCEPTS_REVIEW checkpoint, so it leaves an Approval
// trail (invariant 11).
export async function writeSelected(setId: string, userId: string) {
  const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId } });
  const selected = await prisma.concept.findMany({ where: { setId, decision: 'SELECTED' } });
  if (selected.length === 0) throw new AppError('WRONG_STATUS', 'Избери барем еден концепт.');
  await moveSet(setId, ['CONCEPTS_REVIEW'], 'SCRIPTS_WRITING', 'SCRIPTWRITER', { selectedCount: selected.length });
  await prisma.approval.create({
    data: { setId, clientId: set.clientId, checkpoint: 'CONCEPTS_REVIEW', decision: 'approve', userId, comment: `Избрани ${selected.length} концепти.` },
  });
  for (const c of selected) {
    await setQueue.add('writer', { kind: 'writer', setId, conceptId: c.id });
  }
  return { count: selected.length };
}

async function saveVersion(scriptId: string, content: ScriptContentT, markdown: string, authoredBy: string, note?: string) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } });
  await prisma.scriptVersion.create({
    data: { scriptId, version: script.version, content: content as never, markdown, authoredBy, note },
  });
}

// Checkpoint 2 actions. A script may only be approved/returned from a decision
// state (SCRIPTS_REVIEW or CRITIC_FAILED) — the guarded updateMany prevents
// force-approving a script that is mid-write/critique.
const SCRIPT_DECISION_STATES = ['SCRIPTS_REVIEW', 'CRITIC_FAILED'] as const;

export async function approveScript(scriptId: string, userId: string) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } });
  const res = await prisma.script.updateMany({ where: { id: scriptId, status: { in: SCRIPT_DECISION_STATES as never } }, data: { status: 'APPROVED' } });
  if (res.count === 0) throw new AppError('WRONG_STATUS', 'Сценариото не е во состојба за одобрување.');
  await prisma.approval.create({ data: { setId: script.setId, clientId: script.clientId, checkpoint: 'SCRIPTS_REVIEW', decision: 'approve', userId } });
  await maybeFinishSet(script.setId!);
  return { ok: true };
}

export async function returnScript(scriptId: string, userId: string, comment: string) {
  if (!comment) throw new AppError('COMMENT_REQUIRED', 'Внеси коментар.');
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } });
  const res = await prisma.script.updateMany({ where: { id: scriptId, status: { in: SCRIPT_DECISION_STATES as never } }, data: { status: 'WRITING', version: { increment: 1 }, criticReport: undefined } });
  if (res.count === 0) throw new AppError('WRONG_STATUS', 'Сценариото не е во состојба за враќање.');
  await prisma.approval.create({ data: { setId: script.setId, clientId: script.clientId, checkpoint: 'SCRIPTS_REVIEW', decision: 'request_changes', comment, userId } });
  // Reflect the revision at set level so the machine and notifications stay in sync.
  if (script.setId) await moveSet(script.setId, ['SCRIPTS_REVIEW'], 'REVISION', 'SCRIPTWRITER');
  await setQueue.add('writer', { kind: 'writer', setId: script.setId!, conceptId: script.conceptId!, revision: true, comment });
  return { ok: true };
}

export async function editScript(scriptId: string, content: ScriptContentT, userId: string) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId } });
  const nn = Number.parseInt(script.code.split('-')[2] ?? '1', 10);
  const markdown = renderScriptMarkdown({ nn, title: script.title, type: script.type, code: script.code }, content);
  await saveVersion(scriptId, content as ScriptContentT, markdown, userId, 'рачна доработка');
  await prisma.script.update({ where: { id: scriptId }, data: { content: content as never, markdown, version: { increment: 1 } } });
  return { ok: true };
}

// When every expected script in the set is review-ready, the set enters
// SCRIPTS_REVIEW. Gated on the number of SELECTED concepts so a fast critic
// can't move the set while slower parallel writers are still producing scripts.
const SCRIPT_DONE_STATES = ['SCRIPTS_REVIEW', 'CRITIC_FAILED', 'APPROVED', 'EXPORTED'];
export async function maybeReviewSet(setId: string) {
  const expected = await prisma.concept.count({ where: { setId, decision: 'SELECTED' } });
  const scripts = await prisma.script.findMany({ where: { setId } });
  const allDone = scripts.length >= Math.max(1, expected) && scripts.every((s) => SCRIPT_DONE_STATES.includes(s.status));
  if (allDone) {
    const res = await moveSet(setId, ['SCRIPTS_WRITING', 'CRITIC_RUNNING', 'REVISION'], 'SCRIPTS_REVIEW');
    if (res.moved) {
      const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId } });
      await notify('scripts_ready', { userId: set.writerUserId, link: `/sets/${setId}`, payload: { setId } });
    }
  }
}

// Budget enforcement (invariant 6): at 100% the set enters BUDGET_HOLD and no
// further agent work runs. Returns true if the set is now held.
export async function enforceBudget(setId: string): Promise<boolean> {
  const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId } });
  const evalr = evaluateBudget(Number(set.spentUsd), Number(set.budgetUsd));
  if (evalr.shouldHold) {
    const res = await moveSet(setId, ['CONCEPTS_GENERATING', 'SCRIPTS_WRITING', 'CRITIC_RUNNING'], 'BUDGET_HOLD');
    if (res.moved) {
      await prisma.scriptSet.update({ where: { id: setId }, data: { prevStatus: set.status } });
      await notify('budget_hold', { userId: set.writerUserId, link: `/sets/${setId}`, payload: { setId } });
    }
    return res.moved;
  }
  // 80% warning (invariant 6) — emit once per set (dedup on the stored link).
  if (evalr.state === 'WARN') {
    const already = await prisma.notification.findFirst({ where: { event: 'budget_80', link: { contains: `/sets/${setId}` } } });
    if (!already) await notify('budget_80', { userId: set.writerUserId, link: `/sets/${setId}`, payload: { setId } });
  }
  return false;
}

// Move a set to FAILED after its job exhausted retries (invariant 3/10),
// remembering where it was so a manual retry can resume.
export async function failSet(setId: string) {
  const set = await prisma.scriptSet.findUnique({ where: { id: setId } });
  if (!set) return;
  const res = await moveSet(setId, ['CONCEPTS_GENERATING', 'SCRIPTS_WRITING', 'CRITIC_RUNNING'], 'FAILED');
  if (res.moved) await prisma.scriptSet.update({ where: { id: setId }, data: { prevStatus: set.status } });
}

// Manual retry from FAILED: re-run the phase that was interrupted.
export async function retrySet(setId: string) {
  const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId } });
  if (set.status !== 'FAILED') throw new AppError('WRONG_STATUS', 'Сетот не е во FAILED.');
  const resume = (set.prevStatus ?? 'CONCEPTS_GENERATING') as SetStatus;
  await moveSet(setId, ['FAILED'], resume);
  if (resume === 'CONCEPTS_GENERATING') {
    await setQueue.add('creative_director', { kind: 'creative_director', setId });
  } else {
    // Re-run writers for any concept without a review-ready script.
    const selected = await prisma.concept.findMany({ where: { setId, decision: 'SELECTED' } });
    for (const c of selected) {
      const script = await prisma.script.findFirst({ where: { setId, conceptId: c.id } });
      if (!script || !['SCRIPTS_REVIEW', 'APPROVED', 'EXPORTED'].includes(script.status)) {
        await setQueue.add('writer', { kind: 'writer', setId, conceptId: c.id, revision: !!script });
      }
    }
  }
  return { ok: true, resumedTo: resume };
}

// Raise the set budget above spend and resume from where it was held.
export async function raiseSetBudget(setId: string, newBudgetUsd: number) {
  const set = await prisma.scriptSet.findUniqueOrThrow({ where: { id: setId } });
  if (set.status !== 'BUDGET_HOLD') throw new AppError('WRONG_STATUS', 'Сетот не е во BUDGET_HOLD.');
  if (!canResumeAfterRaise(Number(set.spentUsd), newBudgetUsd)) {
    throw new AppError('BUDGET_EXCEEDED', 'Новиот буџет мора да е над потрошеното.');
  }
  await prisma.scriptSet.update({ where: { id: setId }, data: { budgetUsd: newBudgetUsd } });
  const resumeTo = (set.prevStatus ?? 'CONCEPTS_GENERATING') as never;
  await moveSet(setId, ['BUDGET_HOLD'], resumeTo);
  return { ok: true, resumedTo: resumeTo };
}

// When every script is APPROVED, the set is APPROVED (ready for export).
async function maybeFinishSet(setId: string) {
  const scripts = await prisma.script.findMany({ where: { setId } });
  if (scripts.length > 0 && scripts.every((s) => s.status === 'APPROVED')) {
    await moveSet(setId, ['SCRIPTS_REVIEW'], 'APPROVED');
  }
}
