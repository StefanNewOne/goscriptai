import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mk } from '../i18n/mk';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';

const NAV = [
  { to: '/', label: mk.nav.inbox, end: true },
  { to: '/clients', label: mk.nav.clients },
  { to: '/scripts', label: mk.nav.scripts },
  { to: '/results', label: mk.nav.results },
  { to: '/import', label: mk.nav.import },
  { to: '/reports', label: mk.nav.reports },
  { to: '/settings', label: mk.nav.settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: inbox } = useQuery({
    queryKey: ['inbox', false],
    queryFn: () => api.get<{ total: number }>('/inbox'),
    refetchInterval: 4000,
  });
  const waiting = inbox?.total ?? 0;

  return (
    <div className="flex min-h-full">
      {/* Left nav — fixed 240px, sticky (Design Brief §4.4) */}
      <nav className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-rule bg-paper px-3 py-4">
        <div className="px-2 pb-4 text-16 font-semibold">{mk.app.name}</div>
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-control px-2 py-2 text-14 transition-colors ${
                    isActive ? 'bg-nav-active font-semibold' : 'hover:bg-nav-hover'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.to === '/' && waiting > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-13 font-medium text-white animate-gs-pulse">
                    {waiting}
                  </span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto px-2 pt-4 text-13 text-ink-2">
          <div>{user?.name}</div>
          <button className="mt-1 underline hover:text-ink" onClick={logout}>
            {mk.nav.logout}
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-rule bg-paper px-6">
          <input
            type="search"
            placeholder="Пребарај клиент или сценарио…"
            className="h-9 w-full max-w-[520px] rounded-control border border-rule bg-sheet px-3 text-14 outline-none focus:border-ink"
          />
          <div className="flex-1" />
          <button
            className="h-9 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover"
            onClick={() => navigate('/sets/new')}
          >
            {mk.nav.newSet}
          </button>
        </header>
        <main className="mx-auto w-full max-w-content flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
