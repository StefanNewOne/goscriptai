import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';

interface MonthlyRow {
  yymm: string;
  sets: number;
  scripts: number;
  costUsd: number;
  byWriter: Record<string, number>;
}
interface ClientRow {
  id: string;
  name: string;
  code: string;
  setsDone: number;
  contract: number;
  spentUsd: number;
  budgetUsd: number;
}

// Reports (Design Brief §7.13/§7.14). Horizontal bars only — no pies.
export function Reports() {
  const [tab, setTab] = useState<'monthly' | 'clients'>('monthly');
  const monthly = useQuery({ queryKey: ['report-monthly'], queryFn: () => api.get<MonthlyRow[]>('/reports/monthly'), enabled: tab === 'monthly' });
  const clients = useQuery({ queryKey: ['report-clients'], queryFn: () => api.get<ClientRow[]>('/reports/clients'), enabled: tab === 'clients' });

  return (
    <div className="print-area">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-28 font-semibold">{mk.nav.reports}</h1>
        <button
          className="no-print h-9 rounded-control border border-rule px-4 text-14 hover:bg-nav-hover"
          onClick={() => window.print()}
        >
          Печати / Зачувај PDF
        </button>
      </div>
      <div className="mb-6 flex gap-6 border-b border-rule">
        {(['monthly', 'clients'] as const).map((t) => (
          <button key={t} className={`no-print -mb-px border-b-2 px-1 pb-2 text-14 ${tab === t ? 'border-ink font-semibold' : 'border-transparent text-ink-2'}`} onClick={() => setTab(t)}>
            {t === 'monthly' ? 'Месечно' : 'По клиент'}
          </button>
        ))}
      </div>

      {tab === 'monthly' && (
        <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
          <div className="grid grid-cols-[120px_80px_90px_1fr_130px] gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2">
            <span>Месец</span><span>Сетови</span><span>Сценарија</span><span>По сценарист</span><span>Трошок</span>
          </div>
          {(monthly.data ?? []).map((r) => (
            <div key={r.yymm} className="grid grid-cols-[120px_80px_90px_1fr_130px] gap-4 border-t border-rule px-4 py-3 text-14">
              <span className="font-mono">{r.yymm}</span>
              <span>{r.sets}</span>
              <span>{r.scripts}</span>
              <span className="text-13 text-ink-2">{Object.entries(r.byWriter).map(([n, c]) => `${n}: ${c}`).join(' · ')}</span>
              <span className="font-mono">${r.costUsd.toFixed(2)}</span>
            </div>
          ))}
          {monthly.data && monthly.data.length === 0 && <p className="px-4 py-4 text-13 text-ink-2">Нема податоци.</p>}
          <p className="border-t border-rule px-4 py-2 text-13 text-ink-2">Трошокот е покриен од Max претплатата.</p>
        </div>
      )}

      {tab === 'clients' && (
        <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
          <div className="grid grid-cols-[1.4fr_1fr_130px] gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2">
            <span>Клиент</span><span>Сетови / договор</span><span>Потрошено</span>
          </div>
          {(clients.data ?? []).map((c) => {
            const ratio = c.contract > 0 ? Math.min(1, c.setsDone / c.contract) : 0;
            return (
              <div key={c.id} className="grid grid-cols-[1.4fr_1fr_130px] items-center gap-4 border-t border-rule px-4 py-3 text-14">
                <span>{c.name}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-24 overflow-hidden rounded bg-nav-hover">
                    <span className={`block h-full ${ratio >= 0.5 ? 'bg-ok' : 'bg-hold'}`} style={{ width: `${ratio * 100}%` }} />
                  </span>
                  <span className="text-13 text-ink-2">{c.setsDone} / {c.contract || '—'}</span>
                </span>
                <span className="font-mono">${c.spentUsd.toFixed(2)} / ${c.budgetUsd.toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
