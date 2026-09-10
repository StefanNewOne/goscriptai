// ConfirmDialog — a small modal for confirming an action (Design Brief §8).
// `tone: 'signal'` for decisions that wait on the human; 'danger' for
// destructive confirms (archive, budget hold). No browser confirm() (blocks).
import { mk } from '../i18n/mk';

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'signal',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: 'signal' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  const confirmClass =
    tone === 'danger'
      ? 'bg-fail hover:opacity-90'
      : 'bg-signal hover:bg-signal-hover';
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-[420px] rounded-sheet border border-rule bg-sheet p-5 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-16 font-semibold">{title}</h3>
        {body && <p className="mt-2 text-14 text-ink-2">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-control border border-rule px-4 text-14 hover:bg-row-hover" onClick={onCancel}>
            {mk.common.cancel}
          </button>
          <button
            className={`h-9 rounded-control px-4 text-14 font-semibold text-white disabled:opacity-50 ${confirmClass}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel ?? mk.common.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
