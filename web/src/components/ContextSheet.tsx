// ContextSheet — the right-hand context column on desktop, a bottom sheet on
// mobile (Design Brief §8, §4 layout: detail = 65%/35%). Holds critic score,
// brain context, etc. beside the reading surface. Presentational only.
import { useState } from 'react';

export function ContextSheet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: sticky side column */}
      <aside className="hidden w-[300px] shrink-0 md:block">
        <div className="sticky top-20 flex flex-col gap-3">{children}</div>
      </aside>

      {/* Mobile: toggle + bottom sheet */}
      <div className="md:hidden">
        <button
          className="fixed bottom-4 right-4 z-20 h-11 rounded-pill border border-rule bg-sheet px-4 text-14 font-medium shadow-float"
          onClick={() => setOpen(true)}
        >
          {title}
        </button>
        {open && (
          <div className="fixed inset-0 z-30 flex flex-col justify-end bg-ink/30" onClick={() => setOpen(false)}>
            <div
              className="max-h-[80vh] overflow-y-auto rounded-t-sheet border-t border-rule bg-paper p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-14 font-medium">{title}</span>
                <button className="text-14 text-ink-2" onClick={() => setOpen(false)}>
                  Затвори
                </button>
              </div>
              <div className="flex flex-col gap-3">{children}</div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
