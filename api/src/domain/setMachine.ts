import {
  evaluateTransition,
  type SetStatus,
  type TransitionCtx,
  type TransitionMap,
  type TransitionResult,
} from './types.js';

// Set flow state machine (PRD §9.1). `*` = human checkpoint.
// DRAFT → BRIEF_SUBMITTED → CONCEPTS_GENERATING → CONCEPTS_REVIEW*
// → SCRIPTS_WRITING → CRITIC_RUNNING → (AUTO_REVISION ≤2) → SCRIPTS_REVIEW*
// (↔ REVISION) → APPROVED → EXPORTED → [Ф2] LINKED_TO_ADS → LEARNED → ARCHIVED
export const SET_TRANSITIONS: TransitionMap<SetStatus> = {
  DRAFT: {
    to: ['BRIEF_SUBMITTED'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  BRIEF_SUBMITTED: {
    to: ['CONCEPTS_GENERATING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['ENQUEUE_CREATIVE_DIRECTOR'],
  },
  CONCEPTS_GENERATING: {
    to: ['CONCEPTS_REVIEW', 'FAILED', 'BUDGET_HOLD'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  CONCEPTS_REVIEW: {
    // "Пиши ги избраните" → fan out Writers
    to: ['SCRIPTS_WRITING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    checkpoint: true,
    guard: (ctx) => (ctx.data?.selectedCount as number) >= 1,
    sideEffects: ['ENQUEUE_WRITERS'],
  },
  SCRIPTS_WRITING: {
    to: ['CRITIC_RUNNING', 'FAILED', 'BUDGET_HOLD'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['ENQUEUE_CRITIC'],
  },
  CRITIC_RUNNING: {
    // pass → review; fail under threshold within 2 rounds → auto-revision
    to: ['SCRIPTS_REVIEW', 'AUTO_REVISION', 'FAILED', 'BUDGET_HOLD'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  AUTO_REVISION: {
    to: ['CRITIC_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['RESUME_WRITER'],
  },
  SCRIPTS_REVIEW: {
    // approve all → APPROVED; return with comment → REVISION (same session)
    to: ['APPROVED', 'REVISION'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    checkpoint: true,
  },
  REVISION: {
    // A returned script re-enters the writer→critic loop: the redraft goes back
    // through CRITIC_RUNNING before returning to SCRIPTS_REVIEW.
    to: ['CRITIC_RUNNING', 'SCRIPTS_REVIEW'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['RESUME_WRITER'],
  },
  APPROVED: {
    to: ['EXPORTED'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
    sideEffects: ['GENERATE_DOCX'],
  },
  EXPORTED: {
    // Phase 2 branch (model exists, runtime not built)
    to: ['LINKED_TO_ADS', 'ARCHIVED'],
    allowedRoles: ['ADMIN'],
  },
  LINKED_TO_ADS: {
    to: ['LEARNED'],
    allowedRoles: ['ADMIN'],
  },
  LEARNED: {
    to: ['ARCHIVED'],
    allowedRoles: ['ADMIN'],
  },
  // Special statuses — recoverable from anywhere via the service layer.
  PAUSED: {
    to: ['CONCEPTS_GENERATING', 'SCRIPTS_WRITING', 'CRITIC_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
  BUDGET_HOLD: {
    // raising the budget returns to prevStatus (handled by budget.ts + service)
    to: ['CONCEPTS_GENERATING', 'SCRIPTS_WRITING', 'CRITIC_RUNNING', 'ARCHIVED'],
    allowedRoles: ['ADMIN'],
  },
  FAILED: {
    // manual retry resets the attempt counter
    to: ['CONCEPTS_GENERATING', 'SCRIPTS_WRITING', 'CRITIC_RUNNING'],
    allowedRoles: ['SCRIPTWRITER', 'ADMIN'],
  },
};

// Special statuses reachable from (almost) any active status.
export const SPECIAL_SET_STATUSES: readonly SetStatus[] = ['PAUSED', 'FAILED', 'BUDGET_HOLD'];

export function transitionSet(ctx: TransitionCtx<SetStatus>): TransitionResult<SetStatus> {
  return evaluateTransition(SET_TRANSITIONS, ctx);
}

export function isSetCheckpoint(status: SetStatus): boolean {
  return SET_TRANSITIONS[status]?.checkpoint === true;
}
