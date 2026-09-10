// AvatarCard — a buyer avatar with a one-line coverage summary (Design Brief
// §8). Status: ACTIVE = потврден, PENDING_CONFIRMATION = чека потврда
// (no agent-written avatar is active until a human confirms — CLAUDE.md inv. 2).
import type { Avatar } from '../lib/types';
import { StatusBadge } from './StatusBadge';

function coverageLine(profile: Record<string, unknown>): string | null {
  const bits = [profile.summary, profile.pain, profile.desire, profile.segment].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return bits[0] ?? null;
}

export function AvatarCard({ avatar }: { avatar: Avatar }) {
  const active = avatar.status === 'ACTIVE';
  const line = coverageLine(avatar.profile);
  return (
    <div className="rounded-sheet border border-rule bg-sheet p-4">
      <div className="flex items-center justify-between">
        <span className="text-16 font-semibold">{avatar.name}</span>
        <StatusBadge label={active ? 'потврден' : 'чека потврда'} tone={active ? 'ok' : 'hold'} />
      </div>
      {line && <p className="mt-2 text-13 text-ink-2">{line}</p>}
    </div>
  );
}
