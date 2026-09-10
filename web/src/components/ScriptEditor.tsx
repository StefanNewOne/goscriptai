import { useState } from 'react';
import type { ScriptContent, Frame } from './ScriptView';

// ScriptEditor — the same screenplay typography becomes editable in place
// (Design Brief §7.8). Actor names stay non-editable; saving creates a version.
export function ScriptEditor({ content, onSave, onCancel, saving }: { content: ScriptContent; onSave: (c: ScriptContent) => void; onCancel: () => void; saving?: boolean }) {
  const [frames, setFrames] = useState<Frame[]>(structuredClone(content.frames));

  const setDirection = (fi: number, v: string) => setFrames((fs) => fs.map((f, i) => (i === fi ? { ...f, direction: v } : f)));
  const setLine = (fi: number, li: number, v: string) =>
    setFrames((fs) => fs.map((f, i) => (i === fi ? { ...f, lines: f.lines.map((l, j) => (j === li ? { ...l, text: v } : l)) } : f)));
  const setEditing = (fi: number, v: string) => setFrames((fs) => fs.map((f, i) => (i === fi ? { ...f, editing: v } : f)));

  return (
    <article className="rounded-sheet border border-rule bg-sheet p-8">
      <p className="mb-4 text-13 text-ink-2">Уреди го текстот директно. Имињата на актерите се фиксни.</p>
      <div className="flex flex-col gap-7">
        {frames.map((f, i) => (
          <section key={i} className="grid grid-cols-[110px_minmax(0,68ch)] gap-4">
            <div className="text-13">
              <div className="font-semibold text-ink">{f.role}</div>
              <div className="text-ink-2">Кадар {i + 1}</div>
            </div>
            <div className="font-mono text-16 leading-[1.7]">
              <textarea className="w-full resize-none rounded-control border border-rule bg-sheet p-2 text-14 italic text-ink-2" rows={2} value={f.direction} onChange={(e) => setDirection(i, e.target.value)} />
              {f.lines.map((l, j) => (
                <div key={j} className="mt-2 flex gap-2">
                  <span className="font-semibold">{l.actor}:</span>
                  <textarea className="w-full resize-none rounded-control border border-rule bg-sheet p-2 text-14" rows={2} value={l.text} onChange={(e) => setLine(i, j, e.target.value)} />
                </div>
              ))}
              {f.editing !== undefined && (
                <input className="mt-2 w-full rounded-control border border-rule bg-sheet p-2 text-14 text-ink-2" value={f.editing} onChange={(e) => setEditing(i, e.target.value)} placeholder="Монтажа…" />
              )}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <button className="h-10 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50" onClick={() => onSave({ frames })} disabled={saving}>
          Зачувај верзија
        </button>
        <button className="h-10 rounded-control border border-rule px-4 text-14" onClick={onCancel}>Откажи</button>
      </div>
    </article>
  );
}
