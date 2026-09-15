import { prisma } from '../lib/prisma.js';
import { MIN_PER_CRITERION, MIN_TOTAL_RATIO, type CriterionKey } from '../domain/critic.js';

export type AgentKind =
  | 'client_analyst'
  | 'avatar_builder'
  | 'creative_director'
  | 'writer'
  | 'critic'
  | 'reporter';

export interface AgentRouting {
  model: string;
  fallback: string;
  budgetUsd: number;
}

const DEFAULTS: Record<AgentKind, AgentRouting> = {
  client_analyst: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 3 },
  avatar_builder: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  creative_director: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  writer: { model: 'claude-fable-5', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  critic: { model: 'claude-opus-4-8', fallback: 'claude-opus-4-8', budgetUsd: 2 },
  reporter: { model: 'claude-haiku-4-5-20251001', fallback: 'claude-haiku-4-5-20251001', budgetUsd: 0.2 },
};

// Model routing is read from Settings (editable from the UI), never hardcoded in
// service code (CLAUDE.md invariant 15). Falls back to defaults if unset.
export async function getRouting(kind: AgentKind): Promise<AgentRouting> {
  const setting = await prisma.setting.findUnique({ where: { key: 'model_routing' } });
  const map = (setting?.value as Record<string, AgentRouting> | undefined) ?? {};
  return map[kind] ?? DEFAULTS[kind];
}

// The active system-prompt template for an agent (versioned in the DB).
export async function getSystemPrompt(kind: AgentKind): Promise<string> {
  const tpl = await prisma.template.findFirst({ where: { kind, active: true }, orderBy: { version: 'desc' } });
  return tpl?.content ?? '';
}

export interface CriticRubricConfig {
  minPerCriterion: number; // fallback bar for any criterion not overridden
  minTotalRatio: number; // 0..1
  perCriterionMin: Partial<Record<CriterionKey, number>>;
}

// The critic rubric/threshold from Settings (invariant 9 — editable). Accepts
// both the object shape { criteria:[{key,min}], minTotalRatio } and the legacy
// array [{key,min}]; falls back to the code baseline when unset.
export async function getCriticRubric(): Promise<CriticRubricConfig> {
  const setting = await prisma.setting.findUnique({ where: { key: 'critic_rubric' } });
  const value = setting?.value as unknown;
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const criteria = (Array.isArray(value) ? value : Array.isArray(obj?.criteria) ? obj!.criteria : []) as { key?: string; min?: number }[];
  const perCriterionMin: Partial<Record<CriterionKey, number>> = {};
  for (const c of criteria) {
    if (c?.key && typeof c.min === 'number') perCriterionMin[c.key as CriterionKey] = c.min;
  }
  const minTotalRatio = obj && typeof obj.minTotalRatio === 'number' ? obj.minTotalRatio : MIN_TOTAL_RATIO;
  return { minPerCriterion: MIN_PER_CRITERION, minTotalRatio, perCriterionMin };
}
