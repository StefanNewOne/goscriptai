import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ScriptView, type ScriptContent } from '../components/ScriptView';
import { mk } from '../i18n/mk';

interface ScriptRow {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  version: number;
  isStarExample: boolean;
  createdAt: string;
  content: ScriptContent;
  client: { name: string; code: string };
}

const TYPE_CHIPS = [
  { key: '', label: 'Сите' },
  { key: 'PRODUCT_OFFER', label: 'Продажно' },
  { key: 'EDUCATIONAL', label: 'Едукативно' },
  { key: 'TESTIMONIAL', label: 'Тестимонијал' },
  { key: 'SKETCH', label: 'Скеч' },
];

// Script database (Design Brief §7.11): one search field (code/title; semantic
// shares the same input) + type/star chips, opens the read-only ScriptView.
export function ScriptsDB() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [star, setStar] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['scripts', q, type, star],
    queryFn: () => api.get<ScriptRow[]>(`/scripts?${new URLSearchParams({ ...(q ? { q } : {}), ...(type ? { type } : {}), ...(star ? { star: '1' } : {}) })}`),
  });

  const toggleStar = useMutation({
    mutationFn: (v: { id: string; star: boolean }) => api.post(`/scripts/${v.id}/star`, { star: v.star }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scripts'] }),
  });

  // Admin: backfill semantic embeddings (no-op server-side without a Voyage key).
  const reindex = useMutation({ mutationFn: () => api.post<{ indexed: number; total: number }>('/scripts/reindex') });

  const open = data?.find((s) => s.id === openId);

  return (
    <div>
      <h1 className="mb-4 text-28 font-semibold">{mk.nav.scripts}</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="h-9 w-full max-w-[420px] rounded-control border border-rule bg-sheet px-3 text-14" placeholder="Код, наслов, hook…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {TYPE_CHIPS.map((c) => (
            <button key={c.key} className={`h-8 rounded-pill px-3 text-13 ${type === c.key ? 'bg-ink text-white' : 'border border-rule hover:bg-row-hover'}`} onClick={() => setType(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <button className={`h-8 rounded-pill px-3 text-13 ${star ? 'bg-ink text-white' : 'border border-rule hover:bg-row-hover'}`} onClick={() => setStar((v) => !v)}>
          ★ Ѕвезди
        </button>
        {user?.role === 'ADMIN' && (
          <button
            className="ml-auto h-8 rounded-control border border-rule px-3 text-13 hover:bg-row-hover disabled:opacity-50"
            onClick={() => reindex.mutate()}
            disabled={reindex.isPending}
            title="Изгради семантички индекс за сценарија без индекс"
          >
            {reindex.isPending ? 'Индексирам…' : reindex.data ? `Индексирани ${reindex.data.indexed}/${reindex.data.total}` : 'Индексирај'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-[1fr_minmax(0,1.4fr)] gap-6">
        <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
          <div className="grid grid-cols-[140px_1fr_120px_90px] gap-3 border-b border-rule px-4 py-2 text-13 text-ink-2">
            <span>Код</span><span>Наслов</span><span>Клиент</span><span>Статус</span>
          </div>
          {(data ?? []).map((s) => (
            <button key={s.id} className={`grid w-full grid-cols-[140px_1fr_120px_90px] items-center gap-3 border-t border-rule px-4 py-3 text-left hover:bg-row-hover ${s.id === openId ? 'bg-row-hover' : ''}`} onClick={() => setOpenId(s.id)}>
              <span className="font-mono text-13">{s.isStarExample ? '◆ ' : ''}{s.code}</span>
              <span className="truncate text-14">{s.title}</span>
              <span className="text-13 text-ink-2">{s.client.code}</span>
              <span className="text-13 text-ink-2">{s.status}</span>
            </button>
          ))}
          {data && data.length === 0 && <p className="px-4 py-4 text-13 text-ink-2">Нема сценарија.</p>}
        </div>

        <div>
          {open ? (
            <div>
              <div className="mb-2 flex justify-end">
                <button className="h-8 rounded-control border border-rule px-3 text-13 hover:bg-row-hover" onClick={() => toggleStar.mutate({ id: open.id, star: !open.isStarExample })}>
                  {open.isStarExample ? '★ Отстрани ѕвезда' : '☆ Означи ѕвезда'}
                </button>
              </div>
              <ScriptView meta={{ code: open.code, title: open.title, type: open.type, version: open.version }} content={open.content} />
            </div>
          ) : (
            <p className="text-14 text-ink-2">Избери сценарио за преглед.</p>
          )}
        </div>
      </div>
    </div>
  );
}
