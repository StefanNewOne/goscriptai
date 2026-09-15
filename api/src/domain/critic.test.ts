import { describe, it, expect } from 'vitest';
import { evaluateCritic, nextCriticOutcome, CRITERIA, type CriterionScores } from './critic.js';

function scoresOf(value: number): CriterionScores {
  return Object.fromEntries(CRITERIA.map((c) => [c, value])) as CriterionScores;
}

describe('critic', () => {
  it('passes when all criteria ≥ 3 and total ≥ 80%', () => {
    const e = evaluateCritic(scoresOf(5));
    expect(e.passed).toBe(true);
    expect(e.totalPercent).toBe(100);
    expect(e.failedCriteria).toHaveLength(0);
  });

  it('fails when a single criterion is below the minimum', () => {
    const s = { ...scoresOf(5), hook: 2 };
    const e = evaluateCritic(s);
    expect(e.passed).toBe(false);
    expect(e.belowMinimum).toBe(true);
    expect(e.failedCriteria).toContain('hook');
  });

  it('fails when total is below 80% even if each criterion ≥ 3', () => {
    const e = evaluateCritic(scoresOf(3)); // 33/55 = 60%
    expect(e.belowMinimum).toBe(false);
    expect(e.belowTotal).toBe(true);
    expect(e.passed).toBe(false);
  });

  it('treats missing scores as zero', () => {
    const e = evaluateCritic({ hook: 5 });
    expect(e.failedCriteria.length).toBe(CRITERIA.length - 1);
  });

  it('honors a custom per-criterion minimum', () => {
    const e = evaluateCritic(scoresOf(4), 5);
    expect(e.belowMinimum).toBe(true);
  });

  it('honors a configurable total ratio (invariant 9 editable threshold)', () => {
    // 3/5 everywhere = 60%. Passes a 0.5 bar, fails the default 0.8.
    expect(evaluateCritic(scoresOf(3), 3, 0.5).belowTotal).toBe(false);
    expect(evaluateCritic(scoresOf(3), 3, 0.5).passed).toBe(true);
    expect(evaluateCritic(scoresOf(3), 3, 0.9).belowTotal).toBe(true);
  });

  it('honors a per-criterion override map', () => {
    // All 4s pass the default 3 bar, but a hook-specific 5 bar fails only hook.
    const e = evaluateCritic(scoresOf(4), 3, 0.8, { hook: 5 });
    expect(e.failedCriteria).toEqual(['hook']);
    expect(e.belowMinimum).toBe(true);
  });

  it('routes outcomes: pass → REVIEW', () => {
    expect(nextCriticOutcome(evaluateCritic(scoresOf(5)), 0)).toBe('REVIEW');
  });

  it('routes outcomes: fail with rounds left → AUTO_REVISION', () => {
    expect(nextCriticOutcome(evaluateCritic(scoresOf(3)), 0)).toBe('AUTO_REVISION');
    expect(nextCriticOutcome(evaluateCritic(scoresOf(3)), 1)).toBe('AUTO_REVISION');
  });

  it('routes outcomes: fail out of rounds → CRITIC_FAILED', () => {
    expect(nextCriticOutcome(evaluateCritic(scoresOf(3)), 2)).toBe('CRITIC_FAILED');
  });
});
