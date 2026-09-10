// Domain-level types. Mirrors the Prisma enums as string-literal unions so the
// domain layer stays free of any Prisma/Fastify import (CLAUDE.md invariant 15).

export type Role = 'SCRIPTWRITER' | 'ADMIN' | 'VIEWER';

export type Language = 'MK' | 'SQ' | 'BOTH';

export type ClientStatus =
  | 'DRAFT'
  | 'INTAKE'
  | 'ANALYST_RUNNING'
  | 'ANALYST_QUESTIONS'
  | 'ANALYST_REVIEW'
  | 'AVATARS_RUNNING'
  | 'AVATARS_REVIEW'
  | 'MANUAL_SETUP'
  | 'ACTIVE';

export type SetStatus =
  | 'DRAFT'
  | 'BRIEF_SUBMITTED'
  | 'CONCEPTS_GENERATING'
  | 'CONCEPTS_REVIEW'
  | 'SCRIPTS_WRITING'
  | 'CRITIC_RUNNING'
  | 'AUTO_REVISION'
  | 'SCRIPTS_REVIEW'
  | 'REVISION'
  | 'APPROVED'
  | 'EXPORTED'
  | 'LINKED_TO_ADS'
  | 'LEARNED'
  | 'ARCHIVED'
  | 'PAUSED'
  | 'FAILED'
  | 'BUDGET_HOLD';

export type ScriptType = 'PRODUCT_OFFER' | 'EDUCATIONAL' | 'TESTIMONIAL' | 'SKETCH';

export type FrameRole = 'ХООК' | 'БОДИ' | 'ЦТА';

// A generic transition definition used by both state machines.
export interface Transition<S extends string> {
  to: readonly S[];
  allowedRoles: readonly Role[];
  // Optional guard: returns true when the transition is permitted for the ctx.
  guard?: (ctx: TransitionCtx<S>) => boolean;
  // Named side-effects the service layer must run after a successful transition.
  sideEffects?: readonly string[];
  // Marks a status that requires an explicit human decision to leave.
  checkpoint?: boolean;
}

export interface TransitionCtx<S extends string> {
  from: S;
  to: S;
  role: Role;
  // Free-form guard payload (e.g. { hasActor: true }).
  data?: Record<string, unknown>;
}

export type TransitionMap<S extends string> = Partial<Record<S, Transition<S>>>;

export type TransitionError =
  | { ok: false; code: 'WRONG_STATUS'; message: string }
  | { ok: false; code: 'FORBIDDEN'; message: string }
  | { ok: false; code: 'GUARD_FAILED'; message: string };

export type TransitionResult<S extends string> =
  | { ok: true; to: S; sideEffects: readonly string[] }
  | TransitionError;

// Shared evaluator used by both machines — the single place that decides
// whether a status change is allowed (CLAUDE.md invariant 1).
export function evaluateTransition<S extends string>(
  map: TransitionMap<S>,
  ctx: TransitionCtx<S>,
): TransitionResult<S> {
  const def = map[ctx.from];
  if (!def) {
    return { ok: false, code: 'WRONG_STATUS', message: `Нема дефинирани транзиции од статус ${ctx.from}.` };
  }
  if (!def.to.includes(ctx.to)) {
    return { ok: false, code: 'WRONG_STATUS', message: `Транзиција ${ctx.from} → ${ctx.to} не е дозволена.` };
  }
  if (!def.allowedRoles.includes(ctx.role)) {
    return { ok: false, code: 'FORBIDDEN', message: `Улогата ${ctx.role} не смее да направи ${ctx.from} → ${ctx.to}.` };
  }
  if (def.guard && !def.guard(ctx)) {
    return { ok: false, code: 'GUARD_FAILED', message: `Условот за ${ctx.from} → ${ctx.to} не е исполнет.` };
  }
  return { ok: true, to: ctx.to, sideEffects: def.sideEffects ?? [] };
}
