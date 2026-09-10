import { describe, it, expect } from 'vitest';
import { evaluateBudget, wouldExceed, canResumeAfterRaise } from './budget.js';

describe('budget', () => {
  it('is OK below 80%', () => {
    const e = evaluateBudget(3, 8);
    expect(e.state).toBe('OK');
    expect(e.shouldWarn).toBe(false);
    expect(e.shouldHold).toBe(false);
  });

  it('warns once at/above 80%', () => {
    const first = evaluateBudget(6.4, 8, false);
    expect(first.state).toBe('WARN');
    expect(first.shouldWarn).toBe(true);
    const already = evaluateBudget(6.4, 8, true);
    expect(already.state).toBe('WARN');
    expect(already.shouldWarn).toBe(false);
  });

  it('holds at/above 100%', () => {
    const e = evaluateBudget(8, 8);
    expect(e.state).toBe('HOLD');
    expect(e.shouldHold).toBe(true);
    expect(e.shouldWarn).toBe(false);
  });

  it('treats a non-positive budget as immediate hold', () => {
    const e = evaluateBudget(0, 0);
    expect(e.state).toBe('HOLD');
    expect(e.ratio).toBe(Infinity);
  });

  it('clamps negative spend to zero ratio', () => {
    const e = evaluateBudget(-5, 8);
    expect(e.ratio).toBe(0);
    expect(e.state).toBe('OK');
  });

  it('projects whether the next call exceeds budget', () => {
    expect(wouldExceed(7, 2, 8)).toBe(true);
    expect(wouldExceed(5, 2, 8)).toBe(false);
  });

  it('allows resume only when new budget exceeds spend', () => {
    expect(canResumeAfterRaise(8, 10)).toBe(true);
    expect(canResumeAfterRaise(8, 8)).toBe(false);
  });
});
