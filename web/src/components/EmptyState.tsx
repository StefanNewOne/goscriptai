import type { ReactNode } from 'react';

// An empty screen is an invitation to act: one sentence + one button (Design Brief §5).
export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="max-w-[560px] rounded-sheet border border-rule bg-sheet p-8">
      <p className="text-16 text-ink">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinnerless({ text }: { text: string }) {
  // No spinner, ever (Design Brief §11). A quiet progress line instead.
  return (
    <div className="max-w-[560px] rounded-sheet border border-rule bg-sheet p-6">
      <p className="text-14 text-ink-2">{text}</p>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded bg-nav-hover">
        <div className="h-full w-1/3 animate-pulse bg-ink" />
      </div>
    </div>
  );
}
