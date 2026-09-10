// WhatsNewList — the "Што е ново" feed of brain changes (Design Brief §8).
// Every brain mutation appends a BrainChange (CLAUDE.md inv. 11) so the writer
// reads only the delta, never everything again.
import type { BrainChange } from '../lib/types';

const KIND_LABEL: Record<string, string> = {
  PROFILE: 'Профил',
  AVATAR: 'Аватар',
  PRODUCT: 'Продукт',
  ACTOR: 'Актер',
  LOCATION: 'Локација',
  COMPETITOR: 'Конкурент',
  REFERENCE: 'Референца',
  GLOSSARY: 'Речник',
  INSIGHT: 'Инсајт',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function WhatsNewList({ changes, emptyText }: { changes: BrainChange[]; emptyText: string }) {
  if (changes.length === 0) {
    return <p className="px-4 py-4 text-13 text-ink-2">{emptyText}</p>;
  }
  return (
    <ul>
      {changes.map((ch) => (
        <li key={ch.id} className="grid grid-cols-[92px_1fr_auto] gap-3 border-t border-rule px-4 py-3 text-13">
          <span className="text-ink-2">{KIND_LABEL[ch.kind] ?? ch.kind}</span>
          <span>{ch.summary}</span>
          {ch.createdAt && <span className="font-mono text-ink-2">{fmtDate(ch.createdAt)}</span>}
        </li>
      ))}
    </ul>
  );
}
