// ScriptView — the hero. Renders a script in screenplay typography (Design
// Brief §7.8): role in the margin (ХООК/БОДИ/ЦТА), italic direction, actor
// lines in mono, "Монтажа:" set apart. Read-only here; the editor shares it.
export interface Line {
  actor: string;
  text: string;
}
export interface Frame {
  role: 'ХООК' | 'БОДИ' | 'ЦТА';
  direction: string;
  lines: Line[];
  editing?: string;
  subLabel?: string;
}
export interface ScriptContent {
  frames: Frame[];
}

export interface ScriptMeta {
  code: string;
  title: string;
  type: string;
  actor?: string;
  location?: string;
  seconds?: number;
  version: number;
}

export function ScriptView({ meta, content }: { meta: ScriptMeta; content: ScriptContent }) {
  const metaBits = [meta.type, meta.actor, meta.location, meta.seconds ? `~${meta.seconds} сек` : undefined].filter(Boolean);
  return (
    <article className="rounded-sheet border border-rule bg-sheet p-8">
      <div className="mb-1 font-mono text-13 text-ink-2">СЦЕНАРИО {meta.code.split('-').pop()}</div>
      <h2 className="font-mono text-20 font-semibold">{meta.title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-3 border-b border-rule pb-3 text-13 text-ink-2">
        {metaBits.map((b, i) => (
          <span key={i} className="flex items-center gap-3">
            {i > 0 && <span className="text-rule">|</span>}
            {b}
          </span>
        ))}
        <span className="text-rule">|</span>
        <span className="font-mono text-ink">{meta.code}</span>
        <span className="ml-auto">верзија {meta.version}</span>
      </div>

      <div className="mt-6 flex flex-col gap-7">
        {content.frames.map((f, i) => (
          <section key={i} id={`frame-${i + 1}`} className="grid grid-cols-[110px_minmax(0,68ch)] gap-4" style={{ scrollMarginTop: 90 }}>
            <div className="text-13">
              <div className="font-semibold text-ink">{f.role}</div>
              <div className="text-ink-2">Кадар {i + 1}</div>
              {f.subLabel && <div className="italic text-ink-2">{f.subLabel}</div>}
            </div>
            <div className="font-mono text-16 leading-[1.7]">
              {f.direction && <p className="italic text-ink-2">{f.direction}</p>}
              {f.lines.map((l, j) => (
                <p key={j} className="mt-2">
                  <span className="font-semibold">{l.actor}:</span> „{l.text}“
                </p>
              ))}
              {f.editing && <p className="mt-2 border-l-2 border-rule pl-3 text-14 text-ink-2">Монтажа: {f.editing}</p>}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
