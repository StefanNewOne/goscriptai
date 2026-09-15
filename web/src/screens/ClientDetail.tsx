import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import type { ClientDetail as ClientDetailT, Product, Actor, GlossaryTerm } from '../lib/types';
import { mk } from '../i18n/mk';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { OnboardingPanel } from '../components/OnboardingPanel';
import { AvatarCard } from '../components/AvatarCard';
import { WhatsNewList } from '../components/WhatsNewList';
import { BrainSection } from '../components/BrainSection';
import { ClientIngest } from '../components/ClientIngest';
import type { FieldDef } from '../components/BrainForm';

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
        <WhatsNewList changes={c.changeLog} emptyText="Нема промени." />
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
      <IntakePanel clientId={c.id} />
      <ClientIngest clientId={c.id} />
      <ClientSets clientId={c.id} clientCode={c.code} />
    </div>
  );
}

interface IntakeJob {
  id: string;
  status: string;
  progress?: string | null;
  error?: string | null;
  webUrl?: string | null;
  videosPath?: string | null;
  graphicsPath?: string | null;
  docsPath?: string | null;
}

const JOB_STATUS: Record<string, { label: string; tone: 'ok' | 'hold' | 'signal' | 'neutral' }> = {
  PENDING: { label: 'чека работник', tone: 'hold' },
  RUNNING: { label: 'се обработува', tone: 'signal' },
  DONE: { label: 'готово', tone: 'ok' },
  FAILED: { label: 'падна', tone: 'hold' },
};

// "Полни мозок" — the scriptwriter points to a web URL + LOCAL folders and clicks;
// a local companion worker (`npm run worker`) does the heavy lifting on this
// machine and uploads only results. Raw files never leave the machine.
function IntakePanel({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [web, setWeb] = useState('');
  const [videos, setVideos] = useState('');
  const [graphics, setGraphics] = useState('');
  const [docs, setDocs] = useState('');
  const { data: jobs } = useQuery({
    queryKey: ['intake-jobs', clientId],
    queryFn: () => api.get<IntakeJob[]>(`/intake/jobs?clientId=${clientId}`),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === 'PENDING' || j.status === 'RUNNING') ? 3000 : false),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post('/intake/jobs', {
        clientId,
        webUrl: web || undefined,
        videosPath: videos || undefined,
        graphicsPath: graphics || undefined,
        docsPath: docs || undefined,
      }),
    onSuccess: () => {
      setWeb('');
      setVideos('');
      setGraphics('');
      setDocs('');
      qc.invalidateQueries({ queryKey: ['intake-jobs', clientId] });
    },
  });
  const anyInput = !!(web || videos || graphics || docs);
  const field = (label: string, value: string, set: (v: string) => void, ph: string) => (
    <label className="text-13 text-ink-2">
      {label}
      <input className="mt-1 h-9 w-full rounded-control border border-rule px-3 text-14 text-ink" value={value} onChange={(e) => set(e.target.value)} placeholder={ph} />
    </label>
  );

  return (
    <section className="mt-5 rounded-sheet border border-rule bg-sheet p-4">
      <div className="text-14 font-medium">{mk.client.fillBrain}</div>
      <p className="mb-3 text-13 text-ink-2">{mk.client.fillBrainHint}</p>
      <div className="grid grid-cols-2 gap-3">
        {field('Веб URL', web, setWeb, 'https://...')}
        {field('Папка со видеа', videos, setVideos, 'C:\\...\\видеа')}
        {field('Папка со графики', graphics, setGraphics, 'C:\\...\\графики')}
        {field('Папка со стари сценарија (.docx)', docs, setDocs, 'C:\\...\\сценарија')}
      </div>
      {create.isError && <p className="mt-2 text-13 text-fail">{(create.error as Error).message}</p>}
      <button
        className="mt-3 h-9 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50"
        onClick={() => create.mutate()}
        disabled={!anyInput || create.isPending}
      >
        {mk.client.fillBrainStart}
      </button>

      {!!jobs?.length && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-rule pt-3">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3 text-13">
              <StatusBadge label={(JOB_STATUS[j.status] ?? { label: j.status }).label} tone={JOB_STATUS[j.status]?.tone ?? 'neutral'} />
              <span className="text-ink-2">
                {[j.webUrl && 'веб', j.videosPath && 'видеа', j.graphicsPath && 'графики', j.docsPath && 'docs'].filter(Boolean).join(' · ')}
              </span>
              {j.progress && <span className="text-ink-2">— {j.progress}</span>}
              {j.error && <span className="text-fail">— {j.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface ClientSetSummary {
  id: string;
  yymm: string;
  status: string;
  requested: number;
  concepts: { id: string; type: string; decision: string; hook: string }[];
  scripts: { id: string; code: string; title: string; type: string; status: string; conceptId: string | null }[];
}

const SET_STATUS: Record<string, string> = {
  DRAFT: 'Нацрт',
  CONCEPTS_GENERATING: 'Се генерираат концепти',
  CONCEPTS_REVIEW: 'Концепти за избор',
  SCRIPTS_WRITING: 'Се пишуваат',
  CRITIC_RUNNING: 'Во критика',
  SCRIPTS_REVIEW: 'За одобрување',
  APPROVED: 'Одобрено',
  EXPORTED: 'Експортирано',
  PAUSED: 'Паузирано',
  FAILED: 'Падна',
  BUDGET_HOLD: 'Буџет',
};

// Client-level traceability: which sets exist, which concepts were chosen, and
// which script came from which concept. Read-only view over /clients/:id/sets.
function ClientSets({ clientId, clientCode }: { clientId: string; clientCode: string }) {
  const { data: sets } = useQuery({
    queryKey: ['client', clientId, 'sets'],
    queryFn: () => api.get<ClientSetSummary[]>(`/clients/${clientId}/sets`),
  });
  if (!sets) return null;

  return (
    <section className="mt-5 rounded-sheet border border-rule bg-sheet">
      <h2 className="border-b border-rule px-4 py-3 text-14 font-medium">{mk.client.sets}</h2>
      {sets.length === 0 ? (
        <p className="px-4 py-4 text-13 text-ink-2">{mk.client.noSets}</p>
      ) : (
        sets.map((s) => {
          const selected = s.concepts.filter((c) => c.decision === 'SELECTED');
          const rejected = s.concepts.filter((c) => c.decision === 'REJECTED');
          const hookOf = (conceptId: string | null) => s.concepts.find((c) => c.id === conceptId)?.hook ?? '';
          return (
            <div key={s.id} className="border-t border-rule px-4 py-3">
              <div className="mb-2 flex items-center gap-3">
                <span className="font-mono text-14">
                  {clientCode}-{s.yymm}
                </span>
                <StatusBadge label={SET_STATUS[s.status] ?? s.status} tone={setTone(s.status)} />
                <span className="text-13 text-ink-2">
                  {mk.client.selectedN} {selected.length}
                  {rejected.length > 0 ? ` · ${mk.client.rejectedN} ${rejected.length}` : ''}
                </span>
                <Link to={`/sets/${s.id}`} className="ml-auto text-13 underline underline-offset-2 hover:text-ink">
                  {mk.client.openSet}
                </Link>
              </div>
              {s.scripts.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {s.scripts.map((sc) => (
                    <li key={sc.id} className="flex flex-wrap items-baseline gap-2 text-13">
                      <span className="font-mono text-ink-2">{sc.code.split('-').pop()}</span>
                      <span>{sc.title}</span>
                      {hookOf(sc.conceptId) && (
                        <span className="text-ink-2">
                          — {mk.client.fromConcept}: „{hookOf(sc.conceptId).slice(0, 48)}…"
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

function setTone(s: string): 'ok' | 'hold' | 'signal' | 'neutral' {
  if (['CONCEPTS_REVIEW', 'SCRIPTS_REVIEW'].includes(s)) return 'signal';
  if (['APPROVED', 'EXPORTED'].includes(s)) return 'ok';
  if (['FAILED', 'BUDGET_HOLD', 'PAUSED'].includes(s)) return 'hold';
  return 'neutral';
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
        {(tab === 'actors' || tab === 'glossary') && <MineButton clientId={c.id} />}
        <BrainTab c={c} tab={tab} />
      </div>
    </div>
  );
}

// Field definitions per Brain entity — drive the shared BrainForm. Names match
// the backend Zod schemas exactly (api/src/schemas/brain.ts).
const langOpts = (['MK', 'SQ', 'BOTH'] as const).map((v) => ({ value: v, label: mk.lang[v] ?? v }));
const bfOpt = mk.bf.opt as Record<string, string>;
const PRODUCT_FIELDS: FieldDef[] = [
  { name: 'name', label: mk.bf.f.name, kind: 'text', required: true },
  { name: 'category', label: mk.bf.f.category, kind: 'text' },
  { name: 'price', label: mk.bf.f.price, kind: 'number' },
  { name: 'installment', label: mk.bf.f.installment, kind: 'number' },
  { name: 'usp', label: mk.bf.f.usp, kind: 'textarea' },
  { name: 'seasonality', label: mk.bf.f.seasonality, kind: 'text' },
  { name: 'active', label: mk.bf.f.active, kind: 'checkbox', defaultChecked: true },
];
const ACTOR_FIELDS: FieldDef[] = [
  { name: 'name', label: mk.bf.f.name, kind: 'text', required: true },
  { name: 'role', label: mk.bf.f.role, kind: 'text', required: true },
  { name: 'languages', label: mk.bf.f.languages, kind: 'langs' },
  { name: 'style', label: mk.bf.f.style, kind: 'text' },
  { name: 'canDo', label: mk.bf.f.canDo, kind: 'tags', hint: mk.bf.hint.tags },
  { name: 'cannotDo', label: mk.bf.f.cannotDo, kind: 'tags', hint: mk.bf.hint.tags },
  { name: 'notes', label: mk.bf.f.notes, kind: 'textarea' },
];
const LOCATION_FIELDS: FieldDef[] = [
  { name: 'name', label: mk.bf.f.name, kind: 'text', required: true },
  { name: 'description', label: mk.bf.f.description, kind: 'textarea', required: true },
  { name: 'usableElements', label: mk.bf.f.usableElements, kind: 'tags', hint: mk.bf.hint.tags },
  { name: 'constraints', label: mk.bf.f.constraints, kind: 'textarea' },
];
const COMPETITOR_FIELDS: FieldDef[] = [
  { name: 'name', label: mk.bf.f.name, kind: 'text', required: true },
  { name: 'why', label: mk.bf.f.why, kind: 'textarea' },
  { name: 'doNotCopy', label: mk.bf.f.doNotCopy, kind: 'textarea' },
  { name: 'links', label: mk.bf.f.links, kind: 'kvlines', hint: mk.bf.hint.kv },
];
const REFERENCE_FIELDS: FieldDef[] = [
  {
    name: 'flag',
    label: mk.bf.f.flag,
    kind: 'select',
    required: true,
    options: [
      { value: 'INSPIRATION', label: mk.bf.opt.INSPIRATION },
      { value: 'DO_NOT_COPY', label: mk.bf.opt.DO_NOT_COPY },
    ],
  },
  { name: 'platform', label: mk.bf.f.platform, kind: 'text' },
  { name: 'url', label: mk.bf.f.url, kind: 'text' },
  { name: 'analysis', label: mk.bf.f.analysis, kind: 'textarea' },
  { name: 'transcript', label: mk.bf.f.transcript, kind: 'textarea' },
];
const INSIGHT_FIELDS: FieldDef[] = [
  { name: 'text', label: mk.bf.f.text, kind: 'textarea', required: true },
  { name: 'weight', label: mk.bf.f.weight, kind: 'number' },
  { name: 'industry', label: mk.bf.f.industry, kind: 'text' },
];
const GLOSSARY_FIELDS: FieldDef[] = [
  { name: 'language', label: mk.bf.f.language, kind: 'select', required: true, options: langOpts },
  { name: 'term', label: mk.bf.f.term, kind: 'text', required: true },
  { name: 'meaning', label: mk.bf.f.meaning, kind: 'text', required: true },
  {
    name: 'kind',
    label: mk.bf.f.kind,
    kind: 'select',
    required: true,
    options: [
      { value: 'PREFERRED', label: mk.bf.opt.PREFERRED },
      { value: 'BANNED', label: mk.bf.opt.BANNED },
      { value: 'PRODUCT_NAME', label: mk.bf.opt.PRODUCT_NAME },
    ],
  },
];

// Product row content — shows a "чека потврда" badge + Потврди for scraped
// proposals (confirmed=false), so the catalog stays human-confirmed.
function ProductContent({ product: p, clientId }: { product: Product; clientId: string }) {
  const qc = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => api.post(`/products/${p.id}/confirm`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId] }),
  });
  return (
    <div>
      <div className="flex items-center gap-2 text-14 font-medium">
        {p.name}
        {!p.active && <span className="text-13 font-normal text-ink-2">(неактивен)</span>}
        {!p.confirmed && <StatusBadge label={mk.brain.pending} tone="hold" />}
      </div>
      <div className="text-13 text-ink-2">
        {[p.category, p.price ? `${p.price} ден.` : null, p.installment ? `рата ${p.installment}` : null].filter(Boolean).join(' · ')}
      </div>
      {p.usp && <div className="text-13">{p.usp}</div>}
      {!p.confirmed && (
        <button
          className="mt-2 h-8 rounded-control bg-signal px-3 text-13 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending}
        >
          {mk.brain.confirm}
        </button>
      )}
    </div>
  );
}

// A small "Потврди" affordance shared by mined proposals (confirmed=false).
function ConfirmButton({ entity, id, clientId }: { entity: string; id: string; clientId: string }) {
  const qc = useQueryClient();
  const confirm = useMutation({
    mutationFn: () => api.post(`/${entity}/${id}/confirm`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId] }),
  });
  return (
    <button
      className="mt-2 h-8 rounded-control bg-signal px-3 text-13 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
      onClick={() => confirm.mutate()}
      disabled={confirm.isPending}
    >
      {mk.brain.confirm}
    </button>
  );
}

// Actor row — shows a "чека потврда" badge + Потврди for mined proposals.
function ActorContent({ actor: a, clientId }: { actor: Actor; clientId: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-14 font-medium">
        {a.name}
        {!a.confirmed && <StatusBadge label={mk.brain.pending} tone="hold" />}
      </div>
      <div className="text-13 text-ink-2">
        {[a.role, a.languages.map((l) => mk.lang[l]).join(', ')].filter(Boolean).join(' · ')}
      </div>
      {a.canDo.length > 0 && (
        <div className="text-13">
          <span className="text-ink-2">Може: </span>
          {a.canDo.join(', ')}
        </div>
      )}
      {a.cannotDo.length > 0 && (
        <div className="text-13">
          <span className="text-ink-2">Не може: </span>
          {a.cannotDo.join(', ')}
        </div>
      )}
      {a.notes && <div className="text-13 text-ink-2">{a.notes}</div>}
      {!a.confirmed && <ConfirmButton entity="actors" id={a.id} clientId={clientId} />}
    </div>
  );
}

// Glossary row — shows a "чека потврда" badge + Потврди for mined proposals.
function GlossaryContent({ term: g, clientId }: { term: GlossaryTerm; clientId: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-14 font-medium">
        {g.term} <span className="text-13 font-normal text-ink-2">({mk.lang[g.language]})</span>
        {!g.confirmed && <StatusBadge label={mk.brain.pending} tone="hold" />}
      </div>
      {g.meaning && <div className="text-13 text-ink-2">{g.meaning}</div>}
      <div className="text-13">{(mk.bf.opt as Record<string, string>)[g.kind] ?? g.kind}</div>
      {!g.confirmed && <ConfirmButton entity="glossary" id={g.id} clientId={clientId} />}
    </div>
  );
}

// "Извлечи од сценарија" — mines confirmed star scripts into Actor + Glossary
// proposals (confirmed=false). Calls POST /clients/:id/mine, then refreshes.
function MineButton({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const mine = useMutation({
    mutationFn: () => api.post<{ actors: number; glossary: number; scriptsScanned: number }>(`/clients/${clientId}/mine`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', clientId] }),
  });
  const r = mine.data;
  const message = r
    ? r.actors + r.glossary === 0
      ? mk.brain.mineNone
      : mk.brain.mineDone(r.actors, r.glossary, r.scriptsScanned)
    : mk.brain.mineHint;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-sheet border border-rule bg-sheet px-4 py-3">
      <button
        className="h-9 shrink-0 rounded-control bg-ink px-3 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50"
        onClick={() => mine.mutate()}
        disabled={mine.isPending}
      >
        {mine.isPending ? mk.brain.mineRunning : mk.brain.mine}
      </button>
      <span className="text-13 text-ink-2">{message}</span>
    </div>
  );
}

interface HookItem {
  scriptCode: string;
  scriptTitle: string;
  direction: string;
  text: string;
}

// Хук-библиотека — proven hooks pulled from the client's own confirmed star
// scripts. Read-only creativity swipe file; each hook is copyable.
function HookLibrary({ clientId }: { clientId: string }) {
  const { data: hooks } = useQuery({
    queryKey: ['client', clientId, 'hooks'],
    queryFn: () => api.get<HookItem[]>(`/clients/${clientId}/hooks`),
  });
  const [copied, setCopied] = useState<number | null>(null);
  const copy = (i: number, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied((v) => (v === i ? null : v)), 1500);
  };
  if (!hooks) return null;

  return (
    <section className="mb-5 rounded-sheet border border-rule bg-sheet">
      <div className="border-b border-rule px-4 py-3">
        <div className="text-14 font-medium">{mk.brain.hooksTitle}</div>
        <div className="text-13 text-ink-2">{mk.brain.hooksHint}</div>
      </div>
      {hooks.length === 0 ? (
        <p className="px-4 py-4 text-13 text-ink-2">{mk.brain.hooksEmpty}</p>
      ) : (
        <ul>
          {hooks.map((h, i) => {
            const body = h.text || h.direction;
            return (
              <li key={`${h.scriptCode}-${i}`} className="flex items-start justify-between gap-3 border-t border-rule px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap font-mono text-14 leading-[1.5]">{body}</p>
                  <div className="mt-1 text-13 text-ink-2">
                    <span className="font-mono">{h.scriptCode}</span>
                    {h.scriptTitle ? ` · ${h.scriptTitle}` : ''}
                    {h.text && h.direction ? ` · ${h.direction}` : ''}
                  </div>
                </div>
                <button
                  className="shrink-0 text-13 text-ink-2 underline underline-offset-2 hover:text-ink"
                  onClick={() => copy(i, body)}
                >
                  {copied === i ? mk.brain.copied : mk.brain.copy}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
            <AvatarCard key={a.id} avatar={a} />
          ))}
        </div>
      ) : (
        <EmptyState text="Овој клиент нема аватари. Пушти го агентот за аватари или додади рачно." />
      );
    case 'products':
      return (
        <BrainSection
          clientId={c.id}
          entity="products"
          label={mk.brain.products}
          fields={PRODUCT_FIELDS}
          items={c.products}
          emptyText="Нема продукти."
          renderContent={(p) => <ProductContent product={p} clientId={c.id} />}
        />
      );
    case 'actors':
      return (
        <BrainSection
          clientId={c.id}
          entity="actors"
          label={mk.brain.actors}
          fields={ACTOR_FIELDS}
          items={c.actors}
          emptyText="Нема актери. Додади барем еден за да стане клиентот активен."
          renderContent={(a) => <ActorContent actor={a} clientId={c.id} />}
        />
      );
    case 'locations':
      return (
        <BrainSection
          clientId={c.id}
          entity="locations"
          label={mk.brain.locations}
          fields={LOCATION_FIELDS}
          items={c.locations}
          emptyText="Нема локации."
          renderContent={(l) => (
            <div>
              <div className="flex items-center gap-2 text-14 font-medium">
                {l.name}
                {!l.confirmed && <StatusBadge label={mk.brain.pending} tone="hold" />}
              </div>
              {l.description && <div className="text-13 text-ink-2">{l.description}</div>}
              {l.constraints && (
                <div className="text-13">
                  <span className="text-ink-2">Ограничувања: </span>
                  {l.constraints}
                </div>
              )}
              {!l.confirmed && <ConfirmButton entity="locations" id={l.id} clientId={c.id} />}
            </div>
          )}
        />
      );
    case 'competitors':
      return (
        <BrainSection
          clientId={c.id}
          entity="competitors"
          label={mk.brain.competitors}
          fields={COMPETITOR_FIELDS}
          items={c.competitors}
          emptyText="Нема конкуренти."
          renderContent={(x) => (
            <div>
              <div className="flex items-center gap-2 text-14 font-medium">
                {x.name}
                <StatusBadge label={x.status === 'CONFIRMED' ? 'потврден' : 'чека потврда'} tone={x.status === 'CONFIRMED' ? 'ok' : 'hold'} />
              </div>
              {x.why && <div className="text-13 text-ink-2">{x.why}</div>}
              {x.doNotCopy && (
                <div className="text-13">
                  <span className="text-ink-2">Не копирај: </span>
                  {x.doNotCopy}
                </div>
              )}
              {x.status !== 'CONFIRMED' && <ConfirmButton entity="competitors" id={x.id} clientId={c.id} />}
            </div>
          )}
        />
      );
    case 'references':
      return (
        <div>
          <HookLibrary clientId={c.id} />
          <BrainSection
            clientId={c.id}
            entity="references"
            label={mk.brain.references}
            fields={REFERENCE_FIELDS}
            items={c.references}
            emptyText="Нема референци."
            renderContent={(r) => (
              <div>
                <div className="text-14 font-medium">
                  {bfOpt[r.flag] ?? r.flag}
                  {r.platform ? ` · ${r.platform}` : ''}
                </div>
                {r.url && <div className="truncate text-13 text-ink-2">{r.url}</div>}
                {r.analysis && <div className="text-13">{r.analysis}</div>}
              </div>
            )}
          />
        </div>
      );
    case 'glossary':
      return (
        <BrainSection
          clientId={c.id}
          entity="glossary"
          label={mk.brain.glossary}
          fields={GLOSSARY_FIELDS}
          items={c.glossary}
          emptyText="Нема термини."
          renderContent={(g) => <GlossaryContent term={g} clientId={c.id} />}
        />
      );
    case 'insights':
      return (
        <div>
          <p className="mb-3 text-13 text-ink-2">{mk.brain.insightsEmpty}</p>
          <BrainSection
            clientId={c.id}
            entity="insights"
            label={mk.brain.insights}
            fields={INSIGHT_FIELDS}
            items={c.insights}
            emptyText="Нема инсајти. Додади научено што пали."
            renderContent={(i) => (
              <div>
                <div className="text-14">{i.text}</div>
                <div className="text-13 text-ink-2">
                  {[i.industry, `тежина ${i.weight}`].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
          />
        </div>
      );
    default:
      return null;
  }
}

