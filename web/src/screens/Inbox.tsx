import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';
import { EmptyState } from '../components/EmptyState';

interface InboxItem {
  group: string;
  clientId: string;
  clientName: string;
  clientCode: string;
  setLabel?: string;
  what: string;
  link: string;
  writer?: string;
}
interface InboxData {
  groups: { group: string; items: InboxItem[] }[];
  total: number;
}

// Inbox "Чека тебе" — the start page. Aggregates every checkpoint (client + set)
// across the system (Design Brief §7.1).
export function Inbox() {
  const [onlyMine, setOnlyMine] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['inbox', onlyMine],
    queryFn: () => api.get<InboxData>(`/inbox${onlyMine ? '?mine=1' : ''}`),
    refetchInterval: 4000,
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-28 font-semibold">{mk.inbox.title}</h1>
          <p className="text-14 text-ink-2">{data && data.total > 0 ? `${data.total} нешта чекаат на тебе.` : ''}</p>
        </div>
        <label className="flex items-center gap-2 text-14 text-ink-2">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          {mk.inbox.onlyMine}
        </label>
      </div>

      {isLoading && <p className="text-14 text-ink-2">{mk.common.loading}</p>}

      {data && data.total === 0 && (
        <EmptyState
          text={mk.inbox.empty}
          action={
            <Link to="/clients" className="inline-block h-9 rounded-control border border-rule bg-sheet px-4 py-2 text-14 hover:bg-row-hover">
              {mk.inbox.openClients}
            </Link>
          }
        />
      )}

      <div className="flex flex-col gap-6">
        {data?.groups.map((g) => (
          <section key={g.group}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-14 font-medium">{g.group}</h2>
              <span className="text-13 text-ink-2">{g.items.length}</span>
            </div>
            <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
              {g.items.map((it, i) => (
                <Link
                  key={i}
                  to={it.link}
                  className="grid grid-cols-[36px_1fr_1.4fr_110px] items-center gap-4 border-t border-rule px-4 py-3 first:border-t-0 hover:bg-row-hover"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-control border border-rule text-13 font-semibold text-ink-2">
                    {it.clientCode.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block font-medium">{it.clientName}</span>
                    {it.setLabel && <span className="block text-13 text-ink-2">{it.setLabel}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-14">
                    <span className="h-2 w-2 rounded-full bg-signal" aria-hidden />
                    {it.what}
                  </span>
                  <span className="text-right text-13 text-ink-2">{it.writer ?? ''}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
