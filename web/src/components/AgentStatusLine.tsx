// AgentStatusLine — a TEXT status while an agent job runs (Design Brief §8:
// "text status, no spinner"; §11 forbids spinners and "thinking…" animations).
// Agent/model names never appear in the main flow (CLAUDE.md) — pass a
// human phase label like "Се генерираат концепти".
export function AgentStatusLine({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="max-w-[560px] rounded-sheet border border-rule bg-sheet p-6">
      <div className="flex items-center gap-2 text-14">
        <span className="h-2 w-2 rounded-full bg-ink-2 motion-safe:animate-gs-pulse" aria-hidden />
        <span className="text-ink-2">{label}</span>
      </div>
      <p className="mt-3 text-13 text-ink-2">
        {hint ?? 'Можеш да продолжиш со друга работа — ќе се појави во „Чека тебе“.'}
      </p>
    </div>
  );
}
