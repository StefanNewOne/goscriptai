// ConceptCard — one Creative Director concept on the concepts screen (★1,
// Design Brief §7.7). Select / reject; rejected cards fade. No `signal` here —
// the single decision button lives in the CheckpointBar/aside.
export interface ConceptCardData {
  id: string;
  type: string;
  decision: string;
  card: { hook: string; insight: string; why: string; estimateSec: number; complexity: string };
  avatar?: { name: string } | null;
  actor?: { name: string } | null;
  location?: { name: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  PRODUCT_OFFER: 'Продажно',
  EDUCATIONAL: 'Едукативно',
  TESTIMONIAL: 'Тестимонијал',
  SKETCH: 'Скеч',
};

export function ConceptCard({
  concept,
  onSelect,
  onReject,
}: {
  concept: ConceptCardData;
  onSelect: () => void;
  onReject: () => void;
}) {
  const c = concept;
  const selected = c.decision === 'SELECTED';
  const rejected = c.decision === 'REJECTED';
  return (
    <div className={`rounded-sheet border border-rule bg-sheet p-4 ${rejected ? 'opacity-45' : ''}`}>
      <div className="mb-2 flex items-center gap-2 text-13 text-ink-2">
        <span className="rounded-pill bg-paper px-2 py-0.5">{TYPE_LABEL[c.type] ?? c.type}</span>
        {c.avatar && <span>{c.avatar.name}</span>}
        <span className="ml-auto font-mono">~{c.card.estimateSec}с</span>
      </div>
      <p className="text-20 font-semibold leading-[1.25]">{c.card.hook}</p>
      <p className="mt-2 text-14 text-ink-2">{c.card.insight}</p>
      {(c.actor || c.location) && (
        <p className="mt-1 text-13">{[c.actor?.name, c.location?.name].filter(Boolean).join(' · ')}</p>
      )}
      <p className="mt-2 border-t border-rule pt-2 text-13 text-ink-2">
        Зошто треба да работи: {c.card.why}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          className={`h-8 rounded-control px-3 text-13 ${
            selected ? 'bg-ink text-white' : 'border border-rule hover:bg-row-hover'
          }`}
          onClick={onSelect}
        >
          {selected ? 'Избрано' : 'Избери'}
        </button>
        <button
          className="h-8 rounded-control border border-rule px-3 text-13 hover:bg-row-hover"
          onClick={onReject}
        >
          {rejected ? 'Врати' : 'Отфрли'}
        </button>
      </div>
    </div>
  );
}
