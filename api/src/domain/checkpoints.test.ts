import { describe, it, expect } from 'vitest';
import {
  CHECKPOINTS,
  INBOX_GROUP_ORDER,
  clientCheckpointKind,
  setCheckpointKind,
} from './checkpoints.js';

describe('checkpoints', () => {
  it('maps set statuses to checkpoint kinds', () => {
    expect(setCheckpointKind('CONCEPTS_REVIEW')).toBe('CONCEPTS_REVIEW');
    expect(setCheckpointKind('SCRIPTS_REVIEW')).toBe('SCRIPTS_REVIEW');
    expect(setCheckpointKind('DRAFT')).toBeNull();
  });

  it('maps client statuses to checkpoint kinds', () => {
    expect(clientCheckpointKind('ANALYST_REVIEW')).toBe('ANALYST_REVIEW');
    expect(clientCheckpointKind('AVATARS_REVIEW')).toBe('AVATARS_REVIEW');
    expect(clientCheckpointKind('MANUAL_SETUP')).toBe('MANUAL_SETUP');
    expect(clientCheckpointKind('ANALYST_QUESTIONS')).toBe('ANALYST_QUESTIONS');
    expect(clientCheckpointKind('DRAFT')).toBeNull();
  });

  it('every checkpoint has a group that exists in the Inbox order', () => {
    for (const meta of Object.values(CHECKPOINTS)) {
      expect(INBOX_GROUP_ORDER).toContain(meta.group as (typeof INBOX_GROUP_ORDER)[number]);
    }
  });

  it('keeps the fixed inbox group order', () => {
    expect(INBOX_GROUP_ORDER[0]).toBe('Концепти за избор');
    expect(INBOX_GROUP_ORDER[1]).toBe('Сценарија за одобрување');
  });
});
