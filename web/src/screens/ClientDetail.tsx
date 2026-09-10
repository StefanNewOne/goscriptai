import { useQuery } from '@tanstack/react-query';
import { Link, useParams, NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import type { ClientDetail as ClientDetailT } from '../lib/types';
import { mk } from '../i18n/mk';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OnboardingPanel } from '../components/OnboardingPanel';

const BRAIN_TABS: { key: string; label: string }[] = [
  { key: 'profile', label: mk.brain.profile },
  { key: 'avatars', label: mk.brain.avatars },
  { key: 'products', label: mk.brain.products },
  { key: 'actors', label: mk.brain.actors },
  { key: 'locations', label: mk.brain.locations },
  { key: 'competitors', label: mk.brain.competitors },
  { key: 'references', label: mk.brain.references },
  { key: 'glossary', label: mk.brain.glossary },
  { key: 'insights', label: mk.brain.insights },
];

export function ClientDetail({ section }: { section: 'overview' | 'brain' }) {
  const { id, tab } = useParams();
  const { data: c, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<ClientDetailT>(`/clients/${id}`),
    enabled: !!id,
  });

  if (isLoading || !c) return <p className="text-14 text-ink-2">{mk.common.loading}</p>;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-control border border-rule bg-sheet text-16 font-semibold text-ink-2">
          {c.code.slice(0, 1)}
        </span>
        <div>
          <h1 className="text-28 font-semibold">{c.name}</h1>
          <div className="flex items-center gap-3 text-13 text-ink-2">
            <span className="font-mono">{c.code}</span>
            <span className="text-rule">|</span>
            <span>{mk.lang[c.language]}</span>
            {c.reelsPerMonth && (
              <>
                <span className="text-rule">|</span>
                <span>{c.reelsPerMonth} реелови/мес.</span>
              </>
            )}
          </div>
        </div>
        <div className="flex-1" />
        <button className="h-10 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover">
          {mk.client.newSet}
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-6 border-b border-rule">
        <TabLink to={`/clients/${c.id}`} active={section === 'overview'}>
          {mk.client.overview}
        </TabLink>
        <TabLink to={`/clients/${c.id}/brain/profile`} active={section === 'brain'}>
          {mk.client.brain}
        </TabLink>
      </div>

      {section === 'overview' ? <Overview c={c} /> : <Brain c={c} tab={tab ?? 'profile'} />}
    </div>
  );
}

function TabLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={`-mb-px border-b-2 px-1 pb-2 text-14 ${active ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-2'}`}
    >
      {children}
    </Link>
  );
}

function Overview({ c }: { c: ClientDetailT }) {
  return (
    <div>
      <OnboardingPanel c={c} />
      <div className="grid grid-cols-[1.3fr_1fr] gap-5">
      <section className="rounded-sheet border border-rule bg-sheet">
        <h2 className="border-b border-rule px-4 py-3 text-14 font-medium">{mk.client.whatsNew}</h2>
        {c.changeLog.length === 0 ? (
          <p className="px-4 py-4 text-13 text-ink-2">Нема промени.</p>
        ) : (
          <ul>
            {c.changeLog.map((ch) => (
              <li key={ch.id} className="grid grid-cols-[90px_1fr] gap-3 border-t border-rule px-4 py-3 text-13">
                <span className="text-ink-2">{ch.kind}</span>
                <span>{ch.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-sheet border border-rule bg-sheet">
        <h2 className="border-b border-rule px-4 py-3 text-14 font-medium">{mk.client.avatarCoverage}</h2>
        {c.avatars.length === 0 ? (
          <p className="px-4 py-4 text-13 text-ink-2">Нема аватари.</p>
        ) : (
          <ul>
            {c.avatars.map((a) => (
              <li key={a.id} className="flex items-center justify-between border-t border-rule px-4 py-3 text-14">
                <span>{a.name}</span>
                <StatusBadge label={a.status === 'ACTIVE' ? 'потврден' : 'чека потврда'} tone={a.status === 'ACTIVE' ? 'ok' : 'hold'} />
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

function Brain({ c, tab }: { c: ClientDetailT; tab: string }) {
  return (
    <div className="grid grid-cols-[200px_1fr] gap-6">
      <nav className="flex flex-col gap-0.5">
        {BRAIN_TABS.map((t) => (
          <NavLink
            key={t.key}
            to={`/clients/${c.id}/brain/${t.key}`}
            className={({ isActive }) =>
              `rounded-control px-2 py-2 text-14 ${isActive ? 'bg-nav-active font-semibold' : 'hover:bg-nav-hover'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div>
        <BrainTab c={c} tab={tab} />
      </div>
    </div>
  );
}

function BrainTab({ c, tab }: { c: ClientDetailT; tab: string }) {
  switch (tab) {
    case 'profile': {
      const p = c.profiles[0];
      if (!p) return <EmptyState text="Овој клиент нема профил. Пушти ја анализата или додади рачно." />;
      return (
        <article className="max-w-read whitespace-pre-wrap rounded-sheet border border-rule bg-sheet p-8 text-16 leading-[1.55]">
          <div className="mb-4 text-13 text-ink-2">
            Профил v{p.version} · {p.approved ? 'одобрен' : 'нацрт'}
          </div>
          {p.markdown}
        </article>
      );
    }
    case 'avatars':
      return c.avatars.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {c.avatars.map((a) => (
            <div key={a.id} className="rounded-sheet border border-rule bg-sheet p-4">
              <div className="flex items-center justify-between">
                <span className="text-16 font-semibold">{a.name}</span>
                <StatusBadge label={a.status === 'ACTIVE' ? 'потврден' : 'чека потврда'} tone={a.status === 'ACTIVE' ? 'ok' : 'hold'} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Овој клиент нема аватари. Пушти го агентот за аватари или додади рачно." />
      );
    case 'products':
      return <SimpleTable rows={c.products.map((p) => [p.name, p.category ?? '', p.installment ? `${p.installment} ден./мес.` : ''])} head={['Производ', 'Категорија', 'Рата']} empty="Нема продукти." />;
    case 'actors':
      return c.actors.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {c.actors.map((a) => (
            <div key={a.id} className="grid grid-cols-[120px_1fr] gap-4 rounded-sheet border border-rule bg-sheet p-4">
              <div className="min-h-[160px] rounded-control bg-[repeating-linear-gradient(45deg,#ECEEEB,#ECEEEB_8px,#F5F6F4_8px,#F5F6F4_16px)]" />
              <div>
                <div className="text-20 font-semibold">{a.name}</div>
                <div className="mb-2 text-13 text-ink-2">
                  {a.role} · {a.languages.map((l) => mk.lang[l]).join(', ')}
                </div>
                {a.style && <div className="text-13"><span className="text-ink-2">Стил: </span>{a.style}</div>}
                {a.canDo.length > 0 && <div className="text-13"><span className="text-ink-2">Може: </span>{a.canDo.join(', ')}</div>}
                {a.cannotDo.length > 0 && <div className="text-13"><span className="text-ink-2">Не може: </span>{a.cannotDo.join(', ')}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Нема актери. Додади барем еден за да стане клиентот активен." />
      );
    case 'locations':
      return <SimpleTable rows={c.locations.map((l) => [l.name, l.description, l.constraints ?? ''])} head={['Локација', 'Опис', 'Ограничувања']} empty="Нема локации." />;
    case 'competitors':
      return <SimpleTable rows={c.competitors.map((x) => [x.name, x.why ?? '', x.status])} head={['Конкурент', 'Зошто', 'Статус']} empty="Нема конкуренти." />;
    case 'references':
      return <SimpleTable rows={c.references.map((r) => [r.platform ?? '', r.url ?? '', r.flag])} head={['Платформа', 'Линк', 'Флаг']} empty="Нема референци." />;
    case 'glossary':
      return <SimpleTable rows={c.glossary.map((g) => [mk.lang[g.language], g.term, g.meaning, g.kind])} head={['Јазик', 'Термин', 'Значење', 'Вид']} empty="Нема термини." />;
    case 'insights':
      return <EmptyState text={mk.brain.insightsEmpty} />;
    default:
      return null;
  }
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: (string | undefined)[][]; empty: string }) {
  if (rows.length === 0) return <EmptyState text={empty} />;
  return (
    <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
      <div className="grid gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2" style={{ gridTemplateColumns: `repeat(${head.length}, 1fr)` }}>
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-4 border-t border-rule px-4 py-3 text-14" style={{ gridTemplateColumns: `repeat(${head.length}, 1fr)` }}>
          {r.map((cell, j) => (
            <span key={j} className={j === 0 ? 'font-medium' : 'text-ink-2'}>
              {cell ?? ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
