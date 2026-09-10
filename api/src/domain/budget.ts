// Budget rules (PRD §16). Pure arithmetic over cents-safe numbers; the service
// layer feeds Decimal.toNumber() in and persists the decision. CostEntry is
// always automatic from SDK output (CLAUDE.md invariant 6).

export const WARN_THRESHOLD = 0.8;
export const HOLD_THRESHOLD = 1.0;

export type BudgetState = 'OK' | 'WARN' | 'HOLD';

export interface BudgetEvaluation {
  state: BudgetState;
  ratio: number; // spent / budget, clamped ≥ 0
  shouldWarn: boolean; // crossed 80% (and not already warned)
  shouldHold: boolean; // reached/exceeded 100%
}

export function evaluateBudget(
  spentUsd: number,
  budgetUsd: number,
  alreadyWarned = false,
): BudgetEvaluation {
  if (budgetUsd <= 0) {
    // A non-positive budget means everything is immediately on hold.
    return { state: 'HOLD', ratio: Infinity, shouldWarn: false, shouldHold: true };
  }
  const ratio = Math.max(0, spentUsd) / budgetUsd;
  if (ratio >= HOLD_THRESHOLD) {
    return { state: 'HOLD', ratio, shouldWarn: false, shouldHold: true };
  }
  if (ratio >= WARN_THRESHOLD) {
    return { state: 'WARN', ratio, shouldWarn: !alreadyWarned, shouldHold: false };
  }
  return { state: 'OK', ratio, shouldWarn: false, shouldHold: false };
}

// Would this projected extra spend push the run over budget? Used to gate an
// agent call before it starts.
export function wouldExceed(spentUsd: number, estimatedUsd: number, budgetUsd: number): boolean {
  return spentUsd + estimatedUsd > budgetUsd;
}

// Raising the budget above what's already spent lets the set leave BUDGET_HOLD.
export function canResumeAfterRaise(spentUsd: number, newBudgetUsd: number): boolean {
  return newBudgetUsd > spentUsd;
}
