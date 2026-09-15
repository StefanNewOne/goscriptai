import { describe, it, expect } from 'vitest';
import { transitionSet, isSetCheckpoint, SET_TRANSITIONS, SPECIAL_SET_STATUSES } from './setMachine.js';
import type { Role, SetStatus } from './types.js';

const SW: Role = 'SCRIPTWRITER';
const ADMIN: Role = 'ADMIN';

describe('setMachine', () => {
  it('walks the happy path DRAFT → EXPORTED', () => {
    const steps: [SetStatus, SetStatus, Record<string, unknown>?][] = [
      ['DRAFT', 'BRIEF_SUBMITTED'],
      ['BRIEF_SUBMITTED', 'CONCEPTS_GENERATING'],
      ['CONCEPTS_GENERATING', 'CONCEPTS_REVIEW'],
      ['CONCEPTS_REVIEW', 'SCRIPTS_WRITING', { selectedCount: 3 }],
      ['SCRIPTS_WRITING', 'CRITIC_RUNNING'],
      ['CRITIC_RUNNING', 'SCRIPTS_REVIEW'],
      ['SCRIPTS_REVIEW', 'APPROVED'],
      ['APPROVED', 'EXPORTED'],
    ];
    for (const [from, to, data] of steps) {
      expect(transitionSet({ from, to, role: SW, data }).ok, `${from} → ${to}`).toBe(true);
    }
  });

  it('requires at least one selected concept to write', () => {
    const res = transitionSet({ from: 'CONCEPTS_REVIEW', to: 'SCRIPTS_WRITING', role: SW, data: { selectedCount: 0 } });
    expect(res).toMatchObject({ ok: false, code: 'GUARD_FAILED' });
  });

  it('fans out writers with a side effect', () => {
    const res = transitionSet({ from: 'CONCEPTS_REVIEW', to: 'SCRIPTS_WRITING', role: SW, data: { selectedCount: 2 } });
    expect(res).toMatchObject({ ok: true, sideEffects: ['ENQUEUE_WRITERS'] });
  });

  it('supports the auto-revision loop', () => {
    expect(transitionSet({ from: 'CRITIC_RUNNING', to: 'AUTO_REVISION', role: SW }).ok).toBe(true);
    expect(transitionSet({ from: 'AUTO_REVISION', to: 'CRITIC_RUNNING', role: SW }).ok).toBe(true);
  });

  it('supports return-with-comment revision loop', () => {
    expect(transitionSet({ from: 'SCRIPTS_REVIEW', to: 'REVISION', role: SW }).ok).toBe(true);
    expect(transitionSet({ from: 'REVISION', to: 'SCRIPTS_REVIEW', role: SW }).ok).toBe(true);
  });

  it('routes a returned script back through the critic (REVISION → CRITIC_RUNNING)', () => {
    expect(transitionSet({ from: 'REVISION', to: 'CRITIC_RUNNING', role: SW }).ok).toBe(true);
  });

  it('allows BUDGET_HOLD and FAILED from generating/writing/critic', () => {
    expect(transitionSet({ from: 'CONCEPTS_GENERATING', to: 'BUDGET_HOLD', role: SW }).ok).toBe(true);
    expect(transitionSet({ from: 'SCRIPTS_WRITING', to: 'FAILED', role: SW }).ok).toBe(true);
  });

  it('only ADMIN can drive the Phase 2 branch', () => {
    expect(transitionSet({ from: 'EXPORTED', to: 'LINKED_TO_ADS', role: SW }).ok).toBe(false);
    expect(transitionSet({ from: 'EXPORTED', to: 'LINKED_TO_ADS', role: ADMIN }).ok).toBe(true);
    expect(transitionSet({ from: 'LINKED_TO_ADS', to: 'LEARNED', role: ADMIN }).ok).toBe(true);
    expect(transitionSet({ from: 'LEARNED', to: 'ARCHIVED', role: ADMIN }).ok).toBe(true);
  });

  it('recovers from special statuses', () => {
    expect(transitionSet({ from: 'PAUSED', to: 'CONCEPTS_GENERATING', role: SW }).ok).toBe(true);
    expect(transitionSet({ from: 'BUDGET_HOLD', to: 'SCRIPTS_WRITING', role: ADMIN }).ok).toBe(true);
    expect(transitionSet({ from: 'BUDGET_HOLD', to: 'ARCHIVED', role: ADMIN }).ok).toBe(true);
    expect(transitionSet({ from: 'FAILED', to: 'CRITIC_RUNNING', role: SW }).ok).toBe(true);
  });

  it('rejects an undefined source status', () => {
    const res = transitionSet({ from: 'ARCHIVED', to: 'DRAFT', role: ADMIN });
    expect(res).toMatchObject({ ok: false, code: 'WRONG_STATUS' });
  });

  it('marks the two set checkpoints', () => {
    expect(isSetCheckpoint('CONCEPTS_REVIEW')).toBe(true);
    expect(isSetCheckpoint('SCRIPTS_REVIEW')).toBe(true);
    expect(isSetCheckpoint('DRAFT')).toBe(false);
    expect(isSetCheckpoint('APPROVED')).toBe(false);
  });

  it('exposes the special statuses list', () => {
    expect(SPECIAL_SET_STATUSES).toContain('PAUSED');
    expect(SPECIAL_SET_STATUSES).toContain('FAILED');
    expect(SPECIAL_SET_STATUSES).toContain('BUDGET_HOLD');
  });

  it('every transition target is itself a defined source or terminal', () => {
    const defined = new Set(Object.keys(SET_TRANSITIONS));
    const terminal = new Set<SetStatus>(['ARCHIVED']);
    for (const key of Object.keys(SET_TRANSITIONS) as SetStatus[]) {
      for (const t of SET_TRANSITIONS[key]!.to) {
        expect(defined.has(t) || terminal.has(t), `${t} reachable`).toBe(true);
      }
    }
  });
});
