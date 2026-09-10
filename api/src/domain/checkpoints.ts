import { isClientCheckpoint } from './clientMachine.js';
import { isSetCheckpoint } from './setMachine.js';
import type { ClientStatus, SetStatus } from './types.js';

// The human checkpoints across the system (PRD §8.1, §9.1). These are the
// entries that surface in the Inbox "Чека тебе" and require an explicit
// Approval decision before the machine can advance.

export type CheckpointKind =
  | 'ANALYST_QUESTIONS'
  | 'ANALYST_REVIEW'
  | 'AVATARS_REVIEW'
  | 'MANUAL_SETUP'
  | 'CONCEPTS_REVIEW'
  | 'SCRIPTS_REVIEW';

export interface CheckpointMeta {
  kind: CheckpointKind;
  scope: 'client' | 'set';
  // Inbox group label (Macedonian). Ordered per README §1.
  group: string;
}

export const CHECKPOINTS: Record<CheckpointKind, CheckpointMeta> = {
  CONCEPTS_REVIEW: { kind: 'CONCEPTS_REVIEW', scope: 'set', group: 'Концепти за избор' },
  SCRIPTS_REVIEW: { kind: 'SCRIPTS_REVIEW', scope: 'set', group: 'Сценарија за одобрување' },
  ANALYST_QUESTIONS: { kind: 'ANALYST_QUESTIONS', scope: 'client', group: 'Прашања од анализа' },
  ANALYST_REVIEW: { kind: 'ANALYST_REVIEW', scope: 'client', group: 'Предлози за потврда' },
  AVATARS_REVIEW: { kind: 'AVATARS_REVIEW', scope: 'client', group: 'Предлози за потврда' },
  MANUAL_SETUP: { kind: 'MANUAL_SETUP', scope: 'client', group: 'Предлози за потврда' },
};

// Fixed Inbox group order (README §1). Budget and unmapped ads (Ф2) are
// generated outside the machines and appended by the service layer.
export const INBOX_GROUP_ORDER = [
  'Концепти за избор',
  'Сценарија за одобрување',
  'Прашања од анализа',
  'Предлози за потврда',
  'Буџет',
] as const;

export function clientCheckpointKind(status: ClientStatus): CheckpointKind | null {
  return isClientCheckpoint(status) ? (status as CheckpointKind) : null;
}

export function setCheckpointKind(status: SetStatus): CheckpointKind | null {
  return isSetCheckpoint(status) ? (status as CheckpointKind) : null;
}
