// Critic rubric + threshold (PRD §10, §9.4). Threshold is a code barrier:
// all criteria ≥ 3 AND total ≥ 80% (CLAUDE.md invariant 9).

export const CRITERIA = [
  'avatar',
  'hook',
  'essence',
  'actorFeasibility',
  'location',
  'structure',
  'cta',
  'antiGeneric',
  'language',
  'duration',
  'accuracy',
] as const;

export type CriterionKey = (typeof CRITERIA)[number];

export const MIN_PER_CRITERION = 3; // configurable per-criterion from Settings
export const MIN_TOTAL_RATIO = 0.8;
export const MAX_SCORE = 5;
export const MAX_AUTO_REVISION_ROUNDS = 2;

export type CriterionScores = Partial<Record<CriterionKey, number>>;

export interface CriticFinding {
  criterion: CriterionKey;
  text: string;
  frame?: number; // "скокни до кадар N"
}

export interface CriticEvaluation {
  passed: boolean;
  totalRatio: number; // 0..1
  totalPercent: number; // 0..100 rounded
  failedCriteria: CriterionKey[];
  belowMinimum: boolean;
  belowTotal: boolean;
}

// Evaluate a full set of scores against the threshold. The per-criterion minimum
// and the total ratio are configurable from Settings (invariant 9); a
// per-criterion override map lets a single criterion carry a different bar. All
// arguments default to the code baseline, so callers that pass nothing get the
// canonical "all ≥ 3 AND total ≥ 80%".
export function evaluateCritic(
  scores: CriterionScores,
  minPerCriterion: number = MIN_PER_CRITERION,
  minTotalRatio: number = MIN_TOTAL_RATIO,
  perCriterionMin?: Partial<Record<CriterionKey, number>>,
): CriticEvaluation {
  const values = CRITERIA.map((c) => scores[c] ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const max = CRITERIA.length * MAX_SCORE;
  const totalRatio = total / max;
  const failedCriteria = CRITERIA.filter((c) => (scores[c] ?? 0) < (perCriterionMin?.[c] ?? minPerCriterion));
  const belowMinimum = failedCriteria.length > 0;
  const belowTotal = totalRatio < minTotalRatio;
  return {
    passed: !belowMinimum && !belowTotal,
    totalRatio,
    totalPercent: Math.round(totalRatio * 100),
    failedCriteria,
    belowMinimum,
    belowTotal,
  };
}

// Decide the next step after a critic run.
// - passed → go to human review
// - failed but rounds left → auto-revision back to writer (same session)
// - failed and out of rounds → CRITIC_FAILED (shown with findings, human may still approve)
export type CriticOutcome = 'REVIEW' | 'AUTO_REVISION' | 'CRITIC_FAILED';

export function nextCriticOutcome(
  evaluation: CriticEvaluation,
  roundsUsed: number,
  maxRounds: number = MAX_AUTO_REVISION_ROUNDS,
): CriticOutcome {
  if (evaluation.passed) return 'REVIEW';
  if (roundsUsed < maxRounds) return 'AUTO_REVISION';
  return 'CRITIC_FAILED';
}
