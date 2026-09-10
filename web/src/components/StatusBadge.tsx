// StatusBadge — the only place colour maps to status (Design Brief §4.2).
// signal is reserved for "waiting for you"; everything else is ok/hold/fail/neutral.
type Tone = 'ok' | 'hold' | 'fail' | 'signal' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-ok',
  hold: 'text-hold',
  fail: 'text-fail',
  signal: 'text-signal',
  neutral: 'text-ink-2',
};

const DOT_CLASS: Record<Tone, string> = {
  ok: 'bg-ok',
  hold: 'bg-hold',
  fail: 'bg-fail',
  signal: 'bg-signal',
  neutral: 'bg-ink-2',
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-2 text-13 ${TONE_CLASS[tone]}`}>
      <span className={`h-2 w-2 rounded-full ${DOT_CLASS[tone]}`} aria-hidden />
      {label}
    </span>
  );
}

// A small signal pill counter (Inbox / waiting badge).
export function WaitingPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-6 items-center rounded-pill bg-signal px-2 text-13 font-medium text-white">
      Чека тебе {count}
    </span>
  );
}
