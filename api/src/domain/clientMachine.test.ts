import { describe, it, expect } from 'vitest';
import { transitionClient, isClientCheckpoint, CLIENT_TRANSITIONS } from './clientMachine.js';
import type { ClientStatus, Role } from './types.js';

const SW: Role = 'SCRIPTWRITER';

describe('clientMachine', () => {
  it('allows the happy path DRAFT → ACTIVE', () => {
    const path: [ClientStatus, ClientStatus, Record<string, unknown>?][] = [
      ['DRAFT', 'INTAKE'],
      ['INTAKE', 'ANALYST_RUNNING'],
      ['ANALYST_RUNNING', 'ANALYST_QUESTIONS'],
      ['ANALYST_QUESTIONS', 'ANALYST_RUNNING'],
      ['ANALYST_RUNNING', 'ANALYST_REVIEW'],
      ['ANALYST_REVIEW', 'AVATARS_RUNNING'],
      ['AVATARS_RUNNING', 'AVATARS_REVIEW'],
      ['AVATARS_REVIEW', 'MANUAL_SETUP'],
      ['MANUAL_SETUP', 'ACTIVE', { hasActor: true }],
    ];
    for (const [from, to, data] of path) {
      const res = transitionClient({ from, to, role: SW, data });
      expect(res.ok, `${from} → ${to}`).toBe(true);
    }
  });

  it('emits side effects on INTAKE → ANALYST_RUNNING', () => {
    const res = transitionClient({ from: 'INTAKE', to: 'ANALYST_RUNNING', role: SW });
    expect(res).toMatchObject({ ok: true, sideEffects: ['ENQUEUE_CLIENT_ANALYST'] });
  });

  it('rejects a status with no transitions defined as source', () => {
    // ACTIVE has transitions, but jumping to a non-listed target is WRONG_STATUS
    const res = transitionClient({ from: 'DRAFT', to: 'ACTIVE', role: SW });
    expect(res).toMatchObject({ ok: false, code: 'WRONG_STATUS' });
  });

  it('blocks MANUAL_SETUP → ACTIVE without an actor', () => {
    const res = transitionClient({ from: 'MANUAL_SETUP', to: 'ACTIVE', role: SW, data: { hasActor: false } });
    expect(res).toMatchObject({ ok: false, code: 'GUARD_FAILED' });
  });

  it('forbids VIEWER from transitioning', () => {
    const res = transitionClient({ from: 'DRAFT', to: 'INTAKE', role: 'VIEWER' });
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('allows request_changes from ANALYST_REVIEW back to ANALYST_RUNNING', () => {
    const res = transitionClient({ from: 'ANALYST_REVIEW', to: 'ANALYST_RUNNING', role: SW });
    expect(res.ok).toBe(true);
  });

  it('allows ACTIVE → ANALYST_RUNNING (Ажурирај анализа)', () => {
    const res = transitionClient({ from: 'ACTIVE', to: 'ANALYST_RUNNING', role: SW });
    expect(res).toMatchObject({ ok: true, sideEffects: ['RESUME_CLIENT_ANALYST'] });
  });

  it('recovers a failed analyst/avatar job to the nearest checkpoint', () => {
    // Analyst research fail → INTAKE; avatar fail → ANALYST_REVIEW (invariant 10).
    expect(transitionClient({ from: 'ANALYST_RUNNING', to: 'INTAKE', role: SW }).ok).toBe(true);
    expect(transitionClient({ from: 'AVATARS_RUNNING', to: 'ANALYST_REVIEW', role: SW }).ok).toBe(true);
  });

  it('reports checkpoints correctly', () => {
    expect(isClientCheckpoint('ANALYST_REVIEW')).toBe(true);
    expect(isClientCheckpoint('AVATARS_REVIEW')).toBe(true);
    expect(isClientCheckpoint('MANUAL_SETUP')).toBe(true);
    expect(isClientCheckpoint('ANALYST_QUESTIONS')).toBe(true);
    expect(isClientCheckpoint('DRAFT')).toBe(false);
    expect(isClientCheckpoint('ACTIVE')).toBe(false);
  });

  it('every source status has at least one allowed role', () => {
    for (const key of Object.keys(CLIENT_TRANSITIONS) as ClientStatus[]) {
      expect(CLIENT_TRANSITIONS[key]!.allowedRoles.length).toBeGreaterThan(0);
    }
  });
});
