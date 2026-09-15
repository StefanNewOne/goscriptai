import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

interface Template {
  id: string;
  kind: string;
  version: number;
  content: string;
}

const KIND_LABEL: Record<string, string> = {
  client_analyst: 'Клиент-анализа',
  avatar_builder: 'Аватари',
  creative_director: 'Креативен директор',
  writer: 'Писател',
  critic: 'Критичар',
};

// Settings (Admin only). Agent templates are versioned — saving creates a new
// active version; running work keeps its version.
export function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: () => api.get<Template[]>('/settings/templates'), enabled: user?.role === 'ADMIN' });
  const { data: routing } = useQuery({ queryKey: ['routing'], queryFn: () => api.get<Record<string, { model: string; fallback: string; budgetUsd: number }>>('/settings/model_routing'), enabled: user?.role === 'ADMIN' });

  const [selected, setSelected] = useState<string>('creative_director');
  const [draft, setDraft] = useState<string | null>(null);
  const current = templates?.find((t) => t.kind === selected);
  const content = draft ?? current?.content ?? '';

  const save = useMutation({
    mutationFn: () => api.post(`/settings/templates/${selected}`, { content }),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['templates'] }); },
  });

  // Model routing is editable (backend reads it at runtime via getRouting). Edits
  // stay local until saved; the whole map is PUT at once.
  type Routing = Record<string, { model: string; fallback: string; budgetUsd: number }>;
  const [routingDraft, setRoutingDraft] = useState<Routing | null>(null);
  const routingView = routingDraft ?? routing ?? {};
  const routingDirty = routingDraft !== null && JSON.stringify(routingDraft) !== JSON.stringify(routing);
  const setRoutingField = (kind: string, field: 'model' | 'fallback' | 'budgetUsd', value: string) => {
    const base = routingDraft ?? routing ?? {};
    const row = base[kind] ?? { model: '', fallback: '', budgetUsd: 0 };
    setRoutingDraft({ ...base, [kind]: { ...row, [field]: field === 'budgetUsd' ? Number(value) || 0 : value } });
  };
  const saveRouting = useMutation({
    mutationFn: () => api.put('/settings/model_routing', { value: routingView }),
    onSuccess: () => { setRoutingDraft(null); qc.invalidateQueries({ queryKey: ['routing'] }); },
  });

  if (user?.role !== 'ADMIN') {
    return <div><h1 className="mb-4 text-28 font-semibold">Поставки</h1><p className="text-14 text-ink-2">Само за администратор.</p></div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-28 font-semibold">Поставки</h1>
      <div className="grid grid-cols-[200px_1fr] gap-6">
        <nav className="flex flex-col gap-0.5">
          {Object.keys(KIND_LABEL).map((k) => (
            <button key={k} className={`rounded-control px-2 py-2 text-left text-14 ${k === selected ? 'bg-nav-active font-semibold' : 'hover:bg-nav-hover'}`} onClick={() => { setSelected(k); setDraft(null); }}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </nav>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-14 text-ink-2">{current ? `верзија ${current.version}` : ''}</span>
          </div>
          <textarea className="w-full rounded-sheet border border-rule bg-sheet p-3 font-mono text-14" rows={14} value={content} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-3">
            <button className="h-10 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50" onClick={() => save.mutate()} disabled={draft === null || draft === current?.content || save.isPending}>
              Зачувај верзија {(current?.version ?? 0) + 1}
            </button>
          </div>

          <h2 className="mb-3 mt-8 text-16 font-semibold">Модели и буџети</h2>
          <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_90px] gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2">
              <span>Агент</span><span>Модел</span><span>Fallback</span><span>Буџет ($)</span>
            </div>
            {Object.entries(routingView).map(([kind, r]) => (
              <div key={kind} className="grid grid-cols-[1.2fr_1fr_1fr_90px] items-center gap-4 border-t border-rule px-4 py-2 text-13">
                <span>{KIND_LABEL[kind] ?? kind}</span>
                <input className="rounded-control border border-rule bg-sheet px-2 py-1 font-mono text-13" value={r.model} onChange={(e) => setRoutingField(kind, 'model', e.target.value)} />
                <input className="rounded-control border border-rule bg-sheet px-2 py-1 font-mono text-13 text-ink-2" value={r.fallback} onChange={(e) => setRoutingField(kind, 'fallback', e.target.value)} />
                <input type="number" step="0.1" min="0" className="w-full rounded-control border border-rule bg-sheet px-2 py-1 font-mono text-13" value={r.budgetUsd} onChange={(e) => setRoutingField(kind, 'budgetUsd', e.target.value)} />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button className="h-10 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50" onClick={() => saveRouting.mutate()} disabled={!routingDirty || saveRouting.isPending}>
              Зачувај модели и буџети
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
