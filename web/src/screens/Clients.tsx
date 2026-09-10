import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { ClientListItem } from '../lib/types';
import { mk } from '../i18n/mk';
import { StatusBadge } from '../components/StatusBadge';

function brainTone(status: string): 'ok' | 'hold' {
  return status === 'ACTIVE' ? 'ok' : 'hold';
}

export function Clients() {
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<ClientListItem[]>('/clients'),
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-28 font-semibold">{mk.clients.title}</h1>
          <p className="text-14 text-ink-2">{data ? `${data.length} клиенти` : ''}</p>
        </div>
        <button
          className="h-9 rounded-control border border-rule bg-sheet px-4 text-14 hover:bg-row-hover"
          onClick={() => setCreating((v) => !v)}
        >
          {mk.clients.newClient}
        </button>
      </div>

      {creating && <NewClientForm onClose={() => setCreating(false)} />}

      {isLoading && <p className="text-14 text-ink-2">{mk.common.loading}</p>}
      {isError && <p className="text-14 text-fail">{mk.common.error}</p>}

      {data && (
        <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
          <div className="grid grid-cols-[36px_1.4fr_70px_1.2fr_110px_110px] items-center gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2">
            <span />
            <span>Клиент</span>
            <span>{mk.clients.language}</span>
            <span>{mk.clients.brain}</span>
            <span>{mk.clients.setsThisMonth}</span>
            <span className="text-right">{mk.clients.waiting}</span>
          </div>
          {data.map((c) => (
            <Link
              key={c.id}
              to={`/clients/${c.id}`}
              className="grid grid-cols-[36px_1.4fr_70px_1.2fr_110px_110px] items-center gap-4 border-t border-rule px-4 py-3 hover:bg-row-hover"
              style={{ marginTop: -1 }}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-control border border-rule bg-sheet text-13 font-semibold text-ink-2">
                {c.code.slice(0, 1)}
              </span>
              <span>
                <span className="block font-medium">{c.name}</span>
                <span className="block text-13 text-ink-2">{c.industry ?? ''}</span>
              </span>
              <span className="text-13 text-ink-2">{mk.lang[c.language]}</span>
              <span>
                <StatusBadge label={c.status === 'ACTIVE' ? mk.clients.brainComplete : c.status} tone={brainTone(c.status)} />
              </span>
              <span className="text-13 text-ink-2">{c.reelsPerMonth ? `0 од ${c.reelsPerMonth}` : '—'}</span>
              <span className="text-right font-mono text-13 text-ink-2">{c._count?.avatars ?? 0} авт.</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewClientForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [industry, setIndustry] = useState('');
  const [language, setLanguage] = useState<'MK' | 'SQ' | 'BOTH'>('MK');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/clients', {
        name,
        code: code || undefined,
        industry: industry || undefined,
        language,
      }),
    onSuccess: (client) => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
      navigate(`/clients/${client.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="mb-6 rounded-sheet border border-rule bg-sheet p-5">
      <div className="grid max-w-[720px] grid-cols-2 gap-3">
        <label className="text-13 text-ink-2">
          Име
          <input className="mt-1 h-9 w-full rounded-control border border-rule px-3 text-14 text-ink" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-13 text-ink-2">
          Код (опционално)
          <input className="mt-1 h-9 w-full rounded-control border border-rule px-3 font-mono text-14 text-ink" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="авто од име" />
        </label>
        <label className="text-13 text-ink-2">
          Индустрија
          <input className="mt-1 h-9 w-full rounded-control border border-rule px-3 text-14 text-ink" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </label>
        <label className="text-13 text-ink-2">
          Јазик
          <select className="mt-1 h-9 w-full rounded-control border border-rule px-2 text-14 text-ink" value={language} onChange={(e) => setLanguage(e.target.value as 'MK' | 'SQ' | 'BOTH')}>
            <option value="MK">МК</option>
            <option value="SQ">SQ</option>
            <option value="BOTH">МК / SQ</option>
          </select>
        </label>
      </div>
      {error && <p className="mt-2 text-13 text-fail">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="h-9 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-60" onClick={() => create.mutate()} disabled={!name || create.isPending}>
          {mk.common.save}
        </button>
        <button className="h-9 rounded-control border border-rule px-4 text-14" onClick={onClose}>
          {mk.common.cancel}
        </button>
      </div>
    </div>
  );
}
