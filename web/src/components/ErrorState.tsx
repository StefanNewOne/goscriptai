// ErrorState — a failure surface with an optional retry (Design Brief §8).
// The message comes from the API in Macedonian ("what happened + what to do",
// CLAUDE.md), so it is shown verbatim; no apology, no English.
import { mk } from '../i18n/mk';

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-sheet border border-fail/30 bg-sheet p-6">
      <p className="text-14 text-fail">{message ?? mk.common.error}</p>
      {onRetry && (
        <button
          className="mt-3 h-9 rounded-control border border-rule px-4 text-14 hover:bg-row-hover"
          onClick={onRetry}
        >
          {mk.common.retry}
        </button>
      )}
    </div>
  );
}
