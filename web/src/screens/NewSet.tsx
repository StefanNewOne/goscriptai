import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { ClientListItem } from '../lib/types';

// Brief (Design Brief §7.6). One screen, filled in three minutes. The Creative
// Director job is enqueued on submit and the user is free to leave.
export function NewSet() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get<ClientListItem[]>('/clients') });
  const active = (clients ?? []).filter((c) => c.status === 'ACTIVE');

  const [clientId, setClientId] = useState(params.get('client') ?? '');
  const [requested, setRequested] = useState(4);
  const [product, setProduct] = useState('');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>('/sets', { clientId, requested, brief: { product, notes } }),
    onSuccess: (set) => navigate(`/sets/${set.id}`),
  });

  return (
    <div className="mx-auto max-w-read">
      <h1 className="mb-6 text-28 font-semibold">Нов сет</h1>
      <div className="flex flex-col gap-5">
        <Card>
          <Label>Клиент</Label>
          <select className="h-9 w-full max-w-[420px] rounded-control border border-rule bg-sheet px-2 text-14" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— избери —</option>
            {active.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Card>

        <Card>
          <Label>Број на сценарија</Label>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-control border border-rule">
              <button className="h-9 w-9 border-r border-rule" onClick={() => setRequested((n) => Math.max(1, n - 1))}>
                −
              </button>
              <span className="w-10 text-center font-mono">{requested}</span>
              <button className="h-9 w-9 border-l border-rule" onClick={() => setRequested((n) => Math.min(10, n + 1))}>
                +
              </button>
            </div>
            <span className="text-13 text-ink-2">Креативниот директор предлага {requested * 2} концепти.</span>
          </div>
        </Card>

        <Card>
          <Label>Продукт / понуда во фокус</Label>
          <input className="h-9 w-full max-w-[420px] rounded-control border border-rule bg-sheet px-3 text-14" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="пр. Роденденски попусти" />
        </Card>

        <Card>
          <Label>Бриф: идеја и насока за овој сет (најважно)</Label>
          <textarea className="w-full rounded-control border border-rule bg-sheet p-2 text-14" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Што сакаш од овој сет реелови? Аголот, пораката, поводот, тонот — ова води сѐ." />
        </Card>

        <div className="flex items-center gap-4">
          <button
            className="h-11 rounded-control bg-ink px-5 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-60"
            onClick={() => create.mutate()}
            disabled={!clientId || create.isPending}
          >
            Генерирај концепти
          </button>
          <span className="text-13 text-ink-2">{requested} сценарија</span>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-sheet border border-rule bg-sheet p-5">{children}</section>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-14 font-medium">{children}</div>;
}
