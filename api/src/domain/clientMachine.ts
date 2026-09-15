import {
  evaluateTransition,
  type ClientStatus,
  type TransitionCtx,
  type TransitionMap,
  type TransitionResult,
} from './types.js';

// Client onboarding state machine (PRD §8.1). `*` = human checkpoint.
// DRAFT → INTAKE → ANALYST_RUNNING → ANALYST_QUESTIONS* → ANALYST_REVIEW*
// → AVATARS_RUNNING → AVATARS_REVIEW* → MANUAL_SETUP* → ACTIVE
export const CLIENT_TRANSITIONS: TransitionMap<ClientStatus> = {
  DRAFT: {
    to: ['INTAKE'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  INTAKE: {
    to: ['ANALYST_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['ENQUEUE_CLIENT_ANALYST'],
  },
  ANALYST_RUNNING: {
    // ANALYST_QUESTIONS/REVIEW on success; INTAKE is the failure-recovery edge
    // when the analyst job exhausts its retries (invariant 10).
    to: ['ANALYST_QUESTIONS', 'ANALYST_REVIEW', 'INTAKE'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  ANALYST_QUESTIONS: {
    to: ['ANALYST_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    checkpoint: true,
    sideEffects: ['RESUME_CLIENT_ANALYST'],
  },
  ANALYST_REVIEW: {
    // approve → build avatars; request_changes → resume analyst in same session
    to: ['AVATARS_RUNNING', 'ANALYST_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    checkpoint: true,
  },
  AVATARS_RUNNING: {
    // AVATARS_REVIEW on success; ANALYST_REVIEW is the failure-recovery edge
    // when the avatar job exhausts its retries (invariant 10).
    to: ['AVATARS_REVIEW', 'ANALYST_REVIEW'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  AVATARS_REVIEW: {
    to: ['MANUAL_SETUP', 'AVATARS_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    checkpoint: true,
  },
  MANUAL_SETUP: {
    // MANUAL_SETUP does not block: a client may go ACTIVE with at least one actor.
    to: ['ACTIVE'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    checkpoint: true,
    guard: (ctx) => ctx.data?.hasActor === true,
  },
  ACTIVE: {
    // "Ажурирај анализа" re-opens the analyst in the same session.
    to: ['ANALYST_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['RESUME_CLIENT_ANALYST'],
  },
};

export function transitionClient(
  ctx: TransitionCtx<ClientStatus>,
): TransitionResult<ClientStatus> {
  return evaluateTransition(CLIENT_TRANSITIONS, ctx);
}

export function isClientCheckpoint(status: ClientStatus): boolean {
  return CLIENT_TRANSITIONS[status]?.checkpoint === true;
}
