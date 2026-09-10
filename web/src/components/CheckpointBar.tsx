// CheckpointBar — the ONLY component that carries a `signal` button
// (Design Brief §4.2, §8). Shown when a human decision is required. Sticky at
// the bottom so the action follows the reader. "Врати со коментар" requires a
// non-empty comment (COMMENT_REQUIRED, CLAUDE.md convention).
import { useState } from 'react';
import { mk } from '../i18n/mk';

export function CheckpointBar({
  primaryLabel,
  onPrimary,
  onEdit,
  onReturn,
  busy = false,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  onEdit?: () => void;
  onReturn?: (comment: string) => void;
  busy?: boolean;
}) {
  const [returning, setReturning] = useState(false);
  const [comment, setComment] = useState('');

  return (
    <div className="sticky bottom-4 mt-4 rounded-sheet border border-rule bg-sheet p-3 shadow-float">
      {returning ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="w-full rounded-control border border-rule p-2 text-14 focus:border-ink focus:outline-none"
            rows={3}
            autoFocus
            placeholder={mk.checkpoint.commentPlaceholder}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="h-9 rounded-control bg-signal px-4 text-14 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
              onClick={() => onReturn?.(comment)}
              disabled={!comment.trim() || busy}
            >
              {mk.checkpoint.send}
            </button>
            <button
              className="h-9 rounded-control border border-rule px-4 text-14 hover:bg-row-hover"
              onClick={() => {
                setReturning(false);
                setComment('');
              }}
            >
              {mk.common.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            className="h-10 rounded-control bg-signal px-5 text-14 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
            onClick={onPrimary}
            disabled={busy}
          >
            {primaryLabel}
          </button>
          {onEdit && (
            <button
              className="h-10 rounded-control border border-rule px-4 text-14 hover:bg-row-hover"
              onClick={onEdit}
            >
              {mk.checkpoint.edit}
            </button>
          )}
          {onReturn && (
            <button
              className="h-10 rounded-control border border-rule px-4 text-14 hover:bg-row-hover"
              onClick={() => setReturning(true)}
            >
              {mk.checkpoint.returnWithComment}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
