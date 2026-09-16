import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DiffView } from '../components/DiffView';
import { UsersSection } from '../components/UsersSection';

interface Template {
  id: string;
  kind: string;
  version: number;
  content: string;
  active?: boolean;
  createdAt?: string;
}

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('en-GB').replace(/\//g, '.') : '');

interface RubricCriterion { key: string; label: string; min: number }
interface RubricConfig { criteria: RubricCriterion[]; minTotalRatio: number }

// Fallback so the editor renders even before the setting is seeded.
const DEFAULT_RUBRIC: RubricConfig = {
  criteria: [
    { key: 'avatar', label: 'Аватар', min: 3 },
    { key: 'hook', label: 'Hook', min: 3 },
    { key: 'essence', label: 'Суштина', min: 3 },
    { key: 'actorFeasibility', label: 'Изводливост за актерот', min: 3 },
    { key: 'location', label: 'Локација', min: 3 },
    { key: 'structure', label: 'Структура', min: 3 },
    { key: 'cta', label: 'CTA', min: 3 },
    { key: 'antiGeneric', label: 'Анти-генеричност', min: 3 },
    { key: 'language', label: 'Јазик', min: 3 },
    { key: 'duration', label: 'Времетраење', min: 3 },
    { key: 'accuracy', label: 'Точност', min: 3 },
  ],
  minTotalRatio: 0.8,
};

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
  const { data: rubricRaw } = useQuery({ queryKey: ['rubric'], queryFn: () => api.get<RubricConfig | RubricCriterion[] | null>('/settings/critic_rubric'), enabled: user?.role === 'ADMIN' });

  const [selected, setSelected] = useState<string>('creative_director');
  const [draft, setDraft] = useState<string | null>(null);
  const current = templates?.find((t) => t.kind === selected);
  const content = draft ?? current?.content ?? '';

  // Version history for the selected kind (for the diff view).
  const [compareId, setCompareId] = useState<string | null>(null);
  const { data: versions } = useQuery({
    queryKey: ['template-versions', selected],
    queryFn: () => api.get<Template[]>(`/settings/templates/${selected}/versions`),
    enabled: user?.role === 'ADMIN',
  });
  const compareTo = versions?.find((v) => v.id === compareId);

  const save = useMutation({
    mutationFn: () => api.post(`/settings/templates/${selected}`, { content }),
    onSuccess: () => { setDraft(null); qc.invalidateQueries({ queryKey: ['templates'] }); qc.invalidateQueries({ queryKey: ['template-versions', selected] }); },
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

  // Critic rubric + threshold — editable and read at evaluation time (invariant 9).
  // Normalize the legacy array shape into the object shape.
  const rubricServer: RubricConfig = Array.isArray(rubricRaw)
    ? { criteria: rubricRaw, minTotalRatio: 0.8 }
    : rubricRaw ?? DEFAULT_RUBRIC;
  const [rubricDraft, setRubricDraft] = useState<RubricConfig | null>(null);
  const rubricView = rubricDraft ?? rubricServer;
  const rubricDirty = rubricDraft !== null && JSON.stringify(rubricDraft) !== JSON.stringify(rubricServer);
  const setCriterionMin = (key: string, value: string) => {
    const n = Math.max(1, Math.min(5, Number(value) || 1));
    setRubricDraft({ ...rubricView, criteria: rubricView.criteria.map((c) => (c.key === key ? { ...c, min: n } : c)) });
  };
  const setTotalPercent = (value: string) => {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    setRubricDraft({ ...rubricView, minTotalRatio: pct / 100 });
  };
  const saveRubric = useMutation({
    mutationFn: () => api.put('/settings/critic_rubric', { value: rubricView }),
    onSuccess: () => { setRubricDraft(null); qc.invalidateQueries({ queryKey: ['rubric'] }); },
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
            <button key={k} className={`rounded-control px-2 py-2 text-left text-14 ${k === selected ? 'bg-nav-active font-semibold' : 'hover:bg-nav-hover'}`} onClick={() => { setSelected(k); setDraft(null); setCompareId(null); }}>
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

          {!!versions && versions.length > 1 && (
            <div className="mt-6">
              <h3 className="mb-2 text-14 font-medium">Историја на верзии</h3>
              <div className="flex flex-wrap gap-2">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    className={`rounded-control border px-2 py-1 text-13 ${compareId === v.id ? 'border-ink' : 'border-rule hover:bg-nav-hover'} ${v.active ? 'font-semibold' : 'text-ink-2'}`}
                    onClick={() => setCompareId(compareId === v.id ? null : v.id)}
                    title={fmtDate(v.createdAt)}
                  >
                    в{v.version}{v.active ? ' • активна' : ''}
                  </button>
                ))}
              </div>
              {compareTo && (
                <div className="mt-3">
                  <p className="mb-2 text-13 text-ink-2">Промени од в{compareTo.version} ({fmtDate(compareTo.createdAt)}) до тековната содржина:</p>
                  <DiffView before={compareTo.content} after={content} />
                </div>
              )}
            </div>
          )}

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

          <h2 className="mb-1 mt-8 text-16 font-semibold">Рубрика на критичарот</h2>
          <p className="mb-3 text-13 text-ink-2">Минимум по критериум (1–5) и вкупен праг. Критичарот ги чита при секое оценување.</p>
          <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
            <div className="grid grid-cols-[1fr_90px] gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2">
              <span>Критериум</span><span>Мин.</span>
            </div>
            {rubricView.criteria.map((c) => (
              <div key={c.key} className="grid grid-cols-[1fr_90px] items-center gap-4 border-t border-rule px-4 py-2 text-13">
                <span>{c.label}</span>
                <input type="number" min="1" max="5" step="1" className="w-full rounded-control border border-rule bg-sheet px-2 py-1 font-mono text-13" value={c.min} onChange={(e) => setCriterionMin(c.key, e.target.value)} />
              </div>
            ))}
            <div className="grid grid-cols-[1fr_90px] items-center gap-4 border-t border-rule px-4 py-2 text-13">
              <span className="font-medium">Вкупен праг (%)</span>
              <input type="number" min="0" max="100" step="1" className="w-full rounded-control border border-rule bg-sheet px-2 py-1 font-mono text-13" value={Math.round(rubricView.minTotalRatio * 100)} onChange={(e) => setTotalPercent(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <button className="h-10 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50" onClick={() => saveRubric.mutate()} disabled={!rubricDirty || saveRubric.isPending}>
              Зачувај рубрика
            </button>
          </div>
        </div>
      </div>

      {user && <UsersSection currentUserId={user.id} />}
    </div>
  );
}
