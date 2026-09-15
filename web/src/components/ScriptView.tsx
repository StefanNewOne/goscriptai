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
  // Rich delivered-document fields (scenario-templejt).
  format?: string | null;
  vibe?: string | null;
  music?: string | null;
  platforms?: string[];
  durationSec?: number | null;
  hookVariants?: string[];
  captions?: string[];
  productionNote?: string | null;
}

export function ScriptView({ meta, content }: { meta: ScriptMeta; content: ScriptContent }) {
  const dur = meta.durationSec ?? meta.seconds;
  const metaBits = [meta.type, meta.actor, meta.location, dur ? `~${dur} сек` : undefined].filter(Boolean);
  const shootBits = [
    meta.format ? `Формат: ${meta.format}` : null,
    meta.vibe ? `Вајб: ${meta.vibe}` : null,
    meta.music ? `Музика: ${meta.music}` : null,
    meta.platforms?.length ? `Платформи: ${meta.platforms.join(' + ')}` : null,
  ].filter(Boolean) as string[];
  const hooks = (meta.hookVariants ?? []).filter((h) => h.trim());
  const captions = (meta.captions ?? []).filter((c) => c.trim());
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

      {shootBits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-13 text-ink-2">
          {shootBits.map((b, i) => (
            <span key={i}>{b}</span>
          ))}
        </div>
      )}

      {hooks.length > 0 && (
        <div className="mt-4 rounded-control border border-rule p-4">
          <div className="mb-2 text-13 font-medium">Hook — {hooks.length} варијанти (избери)</div>
          <ol className="flex flex-col gap-2">
            {hooks.map((h, i) => (
              <li key={i} className="font-mono text-16 leading-[1.5]">
                <span className="text-ink-2">Вар. {i + 1}: </span>„{h}“
              </li>
            ))}
          </ol>
        </div>
      )}

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

      {captions.length > 0 && (
        <div className="mt-7 rounded-control border border-rule p-4">
          <div className="mb-2 text-13 font-medium">Caption — {captions.length} варијанти (избери)</div>
          <ol className="flex flex-col gap-2">
            {captions.map((c, i) => (
              <li key={i} className="text-14 leading-[1.5]">
                <span className="text-ink-2">Вар. {i + 1}: </span>„{c}“
              </li>
            ))}
          </ol>
        </div>
      )}

      {meta.productionNote?.trim() && (
        <div className="mt-4 rounded-control border border-rule bg-paper p-4">
          <div className="mb-1 text-13 font-medium">Продукциска забелешка</div>
          <p className="whitespace-pre-wrap text-14 leading-[1.6] text-ink-2">{meta.productionNote}</p>
        </div>
      )}
    </article>
  );
}
