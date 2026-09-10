import { CRITERIA, type CriterionScores } from '../domain/critic.js';
import type { ScriptContent } from '../domain/scriptFormat.js';
import type { ScriptType } from '../domain/types.js';

// Deterministic stub outputs for the set-flow agents (dev without a live Claude
// session). Only agents/sdk.ts decides stub-vs-real.

export interface StubConcept {
  type: ScriptType;
  avatarId?: string;
  actorId?: string;
  locationId?: string;
  card: { hook: string; insight: string; why: string; layer?: string; estimateSec: number; complexity: string };
}

const TYPES: ScriptType[] = ['PRODUCT_OFFER', 'EDUCATIONAL', 'TESTIMONIAL', 'SKETCH'];

// N requested → N×2 concept cards (PRD §9.3).
export function stubConcepts(params: {
  requested: number;
  clientName: string;
  avatarIds: string[];
  actorIds: string[];
  locationIds: string[];
  product?: string;
}): StubConcept[] {
  const out: StubConcept[] = [];
  const total = Math.max(1, params.requested) * 2;
  for (let i = 0; i < total; i++) {
    const type = TYPES[i % TYPES.length]!;
    out.push({
      type,
      avatarId: params.avatarIds[i % Math.max(1, params.avatarIds.length)],
      actorId: params.actorIds[i % Math.max(1, params.actorIds.length)],
      locationId: params.locationIds[i % Math.max(1, params.locationIds.length)],
      card: {
        hook: `Концепт ${i + 1}: „${params.product ?? 'понудата'}“ за ${params.clientName}.`,
        insight: 'Аватарот застанува на конкретна бројка во првите 3 секунди.',
        why: 'Директно ја адресира главната болка на аватарот и води кон јасна CTA.',
        estimateSec: 30 + (i % 3) * 5,
        complexity: i % 2 === 0 ? 'лесно' : 'средно',
      },
    });
  }
  return out;
}

// A writer stub script (3 frames) using the actor name.
export function stubScript(params: { actorName: string; hook: string; product?: string }): { title: string; content: ScriptContent } {
  const a = params.actorName;
  return {
    title: params.hook.slice(0, 40),
    content: {
      frames: [
        { role: 'ХООК', direction: `${a} гледа право во камера, енергично.`, lines: [{ actor: a, text: params.hook }] },
        {
          role: 'БОДИ',
          direction: `${a} ја објаснува понудата, покажувајќи производи.`,
          lines: [{ actor: a, text: `Ова е ${params.product ?? 'нашата понуда'} — конкретно, без комплицирање.` }],
          editing: 'цените се појавуваат како натпис на екран',
        },
        { role: 'ЦТА', direction: `${a} со лого 20 години во позадина.`, lines: [{ actor: a, text: 'Дојди кај нас или пиши ни порака сега.' }] },
      ],
    },
  };
}

// A critic stub that passes the threshold (all 4 → 80%), with one soft finding.
export function stubCritic(): { scores: CriterionScores; findings: { criterion: string; text: string; frame?: number }[] } {
  const scores = Object.fromEntries(CRITERIA.map((c) => [c, 4])) as CriterionScores;
  return {
    scores,
    findings: [{ criterion: 'cta', text: 'CTA е јасна; провери дали одговара на објективот на кампањата.', frame: 3 }],
  };
}
