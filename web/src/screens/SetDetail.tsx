import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';
import { ScriptView, type ScriptContent } from '../components/ScriptView';
import { ScriptEditor } from '../components/ScriptEditor';
import { StatusBadge } from '../components/StatusBadge';

interface Concept {
  id: string;
  type: string;
  decision: string;
  comment?: string | null;
  card: { hook: string; insight: string; why: string; estimateSec: number; complexity: string };
  avatar?: { name: string } | null;
  actor?: { name: string } | null;
  location?: { name: string } | null;
}
interface CriticReport {
  totalPercent: number;
  passed: boolean;
  findings: { criterion: string; text: string; frame?: number }[];
  scores: Record<string, number>;
}
interface Script {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  version: number;
  content: ScriptContent;
  criticReport?: CriticReport | null;
}
interface SetData {
  id: string;
  status: string;
  yymm: string;
  requested: number;
  spentUsd: string;
  budgetUsd: string;
  client: { name: string; code: string };
  concepts: Concept[];
  scripts: Script[];
}

const POLLING = ['CONCEPTS_GENERATING', 'SCRIPTS_WRITING', 'CRITIC_RUNNING'];

export function SetDetail() {
  const { id } = useParams();
  const { data: set } = useQuery({
    queryKey: ['set', id],
    queryFn: () => api.get<SetData>(`/sets/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (POLLING.includes((q.state.data as SetData | undefined)?.status ?? '') ? 1500 : false),
  });

  if (!set) return <p className="text-14 text-ink-2">{mk.common.loading}</p>;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <span className="text-13 text-ink-2">{set.client.name}</span>
        <h1 className="text-20 font-semibold">Сет {set.client.code}-{set.yymm}</h1>
        <span className="rounded-pill border border-rule px-2 py-0.5 text-13">
          <StatusBadge label={statusLabel(set.status)} tone={statusTone(set.status)} />
        </span>
        <span className="ml-auto font-mono text-13 text-ink-2">${set.spentUsd} / ${set.budgetUsd}</span>
      </div>

      {set.status === 'CONCEPTS_GENERATING' && <Generating label="Се генерираат концепти" />}
      {set.status === 'CONCEPTS_REVIEW' && <Concepts set={set} />}
      {(set.status === 'SCRIPTS_WRITING' || set.status === 'CRITIC_RUNNING') && (
        <Generating label={`Се пишуваат сценарија · ${set.scripts.filter((s) => s.status === 'SCRIPTS_REVIEW').length} готови`} />
      )}
      {['SCRIPTS_REVIEW', 'APPROVED', 'EXPORTED'].includes(set.status) && <Scripts set={set} />}
    </div>
  );
}

function Generating({ label }: { label: string }) {
  return (
    <div className="max-w-[560px] rounded-sheet border border-rule bg-sheet p-6">
      <p className="text-14 text-ink-2">{label}</p>
      <div className="mt-3 h-[3px] w-full overflow-hidden rounded bg-nav-hover">
        <div className="h-full w-1/3 animate-pulse bg-ink" />
      </div>
      <p className="mt-3 text-13 text-ink-2">Можеш да продолжиш со друга работа — ќе се појави во „Чека тебе“.</p>
    </div>
  );
}

function Concepts({ set }: { set: SetData }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['set', set.id] });
  const decide = useMutation({
    mutationFn: (v: { conceptId: string; decision: 'SELECTED' | 'REJECTED' }) => api.post(`/concepts/${v.conceptId}/decision`, { decision: v.decision }),
    onSuccess: invalidate,
  });
  const writeSelected = useMutation({ mutationFn: () => api.post(`/sets/${set.id}/write`), onSuccess: invalidate });
  const selected = set.concepts.filter((c) => c.decision === 'SELECTED').length;

  return (
    <div className="grid grid-cols-[1fr_260px] gap-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-3.5">
        {set.concepts.map((c) => (
          <div key={c.id} className={`rounded-sheet border border-rule bg-sheet p-4 ${c.decision === 'REJECTED' ? 'opacity-45' : ''}`}>
            <div className="mb-2 flex items-center gap-2 text-13 text-ink-2">
              <span className="rounded-pill bg-paper px-2 py-0.5">{typeLabel(c.type)}</span>
              {c.avatar && <span>{c.avatar.name}</span>}
              <span className="ml-auto font-mono">~{c.card.estimateSec}с</span>
            </div>
            <p className="text-20 font-semibold leading-[1.25]">{c.card.hook}</p>
            <p className="mt-2 text-14 text-ink-2">{c.card.insight}</p>
            <p className="mt-1 text-13">{[c.actor?.name, c.location?.name].filter(Boolean).join(' · ')}</p>
            <p className="mt-2 border-t border-rule pt-2 text-13 text-ink-2">Зошто треба да работи: {c.card.why}</p>
            <div className="mt-3 flex gap-2">
              <button
                className={`h-8 rounded-control px-3 text-13 ${c.decision === 'SELECTED' ? 'bg-ink text-white' : 'border border-rule hover:bg-row-hover'}`}
                onClick={() => decide.mutate({ conceptId: c.id, decision: 'SELECTED' })}
              >
                {c.decision === 'SELECTED' ? 'Избрано' : 'Избери'}
              </button>
              <button className="h-8 rounded-control border border-rule px-3 text-13 hover:bg-row-hover" onClick={() => decide.mutate({ conceptId: c.id, decision: 'REJECTED' })}>
                {c.decision === 'REJECTED' ? 'Врати' : 'Отфрли'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <aside className="sticky top-20 h-fit">
        <p className="text-20 font-semibold">Избрани {selected} од {set.requested} барани</p>
        <button
          className="mt-4 h-11 w-full rounded-control bg-signal text-14 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
          onClick={() => writeSelected.mutate()}
          disabled={selected === 0 || writeSelected.isPending}
        >
          Пиши ги избраните
        </button>
      </aside>
    </div>
  );
}

function Scripts({ set }: { set: SetData }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['set', set.id] });
  const [currentId, setCurrentId] = useState(set.scripts[0]?.id);
  const current = set.scripts.find((s) => s.id === currentId) ?? set.scripts[0];
  const [comment, setComment] = useState('');
  const [returning, setReturning] = useState(false);
  const [editing, setEditing] = useState(false);

  const approve = useMutation({ mutationFn: (sid: string) => api.post(`/scripts/${sid}/approve`), onSuccess: invalidate });
  const ret = useMutation({ mutationFn: (v: { sid: string; comment: string }) => api.post(`/scripts/${v.sid}/return`, { comment: v.comment }), onSuccess: () => { setReturning(false); setComment(''); invalidate(); } });
  const editSave = useMutation({ mutationFn: (v: { sid: string; content: ScriptContent }) => api.patch(`/scripts/${v.sid}/content`, { content: v.content }), onSuccess: () => { setEditing(false); invalidate(); } });
  const exportSet = useMutation({ mutationFn: () => api.post(`/sets/${set.id}/export`), onSuccess: invalidate });

  if (!current) return null;
  const allApproved = set.scripts.every((s) => s.status === 'APPROVED' || s.status === 'EXPORTED');

  return (
    <div className="flex flex-wrap gap-6">
      {/* list */}
      <div className="w-[210px] shrink-0">
        {set.scripts.map((s) => (
          <button
            key={s.id}
            className={`mb-1 flex w-full items-center gap-2 rounded-control border px-2 py-2 text-left ${s.id === current.id ? 'border-rule bg-sheet' : 'border-transparent hover:bg-nav-hover'}`}
            onClick={() => setCurrentId(s.id)}
          >
            <span className="font-mono text-13 text-ink-2">{s.code.split('-').pop()}</span>
            <span className="flex-1 truncate text-14">{s.title}</span>
            <span className={`h-2 w-2 rounded-full ${scriptDot(s.status)}`} />
          </button>
        ))}
        {allApproved && set.status !== 'EXPORTED' && (
          <button className="mt-3 h-9 w-full rounded-control bg-signal text-14 font-semibold text-white hover:bg-signal-hover" onClick={() => exportSet.mutate()}>
            Кон експорт
          </button>
        )}
        {set.status === 'EXPORTED' && (
          <div className="mt-3 rounded-control border border-ok/30 bg-sheet p-3 text-13">
            <p className="mb-2 text-ok">Експортирано.</p>
            <a className="block underline" href={`/api/v1/sets/${set.id}/export/download?type=docx&token=${localStorage.getItem('gs_token')}`}>Преземи .docx</a>
            <a className="block underline" href={`/api/v1/sets/${set.id}/export/download?type=md&token=${localStorage.getItem('gs_token')}`}>Преземи .md</a>
          </div>
        )}
      </div>

      {/* script */}
      <div className="min-w-[460px] flex-1">
        {editing ? (
          <ScriptEditor content={current.content} saving={editSave.isPending} onCancel={() => setEditing(false)} onSave={(c) => editSave.mutate({ sid: current.id, content: c })} />
        ) : (
          <ScriptView
            meta={{ code: current.code, title: current.title, type: typeLabel(current.type), seconds: undefined, version: current.version }}
            content={current.content}
          />
        )}

        {current.status === 'SCRIPTS_REVIEW' && !editing && (
          <div className="sticky bottom-4 mt-4 rounded-sheet border border-rule bg-sheet p-3 shadow-float">
            {returning ? (
              <div className="flex flex-col gap-2">
                <textarea className="w-full rounded-control border border-rule p-2 text-14" rows={3} placeholder="Коментар за писателот…" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex gap-2">
                  <button className="h-9 rounded-control bg-signal px-4 text-14 font-semibold text-white disabled:opacity-50" onClick={() => ret.mutate({ sid: current.id, comment })} disabled={!comment}>
                    Испрати
                  </button>
                  <button className="h-9 rounded-control border border-rule px-4 text-14" onClick={() => setReturning(false)}>Откажи</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="h-10 rounded-control bg-signal px-5 text-14 font-semibold text-white hover:bg-signal-hover" onClick={() => approve.mutate(current.id)}>
                  Одобри
                </button>
                <button className="h-10 rounded-control border border-rule px-4 text-14" onClick={() => setEditing(true)}>Доработи рачно</button>
                <button className="h-10 rounded-control border border-rule px-4 text-14" onClick={() => setReturning(true)}>Врати со коментар</button>
              </div>
            )}
          </div>
        )}
        {current.status === 'APPROVED' && <p className="mt-4 text-14 text-ok">Одобрено.</p>}
      </div>

      {/* critic context */}
      <aside className="w-[300px] shrink-0">
        {current.criticReport && (
          <div className="rounded-sheet border border-rule bg-sheet p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-20 font-semibold">{current.criticReport.totalPercent}%</span>
              <StatusBadge label={current.criticReport.passed ? 'поминува' : 'под прагот'} tone={current.criticReport.passed ? 'ok' : 'hold'} />
            </div>
            {current.criticReport.findings.map((f, i) => (
              <p key={i} className="mb-2 text-13">
                {f.text}
              </p>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    CONCEPTS_GENERATING: 'Се генерираат концепти', CONCEPTS_REVIEW: 'Концепти за избор', SCRIPTS_WRITING: 'Се пишуваат', CRITIC_RUNNING: 'Во критика',
    SCRIPTS_REVIEW: 'За одобрување', APPROVED: 'Одобрено', EXPORTED: 'Експортирано',
  };
  return m[s] ?? s;
}
function statusTone(s: string): 'ok' | 'hold' | 'signal' | 'neutral' {
  if (['CONCEPTS_REVIEW', 'SCRIPTS_REVIEW'].includes(s)) return 'signal';
  if (['APPROVED', 'EXPORTED'].includes(s)) return 'ok';
  return 'neutral';
}
function typeLabel(t: string): string {
  return { PRODUCT_OFFER: 'Продажно', EDUCATIONAL: 'Едукативно', TESTIMONIAL: 'Тестимонијал', SKETCH: 'Скеч' }[t] ?? t;
}
function scriptDot(s: string): string {
  if (s === 'SCRIPTS_REVIEW') return 'bg-signal';
  if (s === 'APPROVED' || s === 'EXPORTED') return 'bg-ok';
  if (s === 'CRITIC_FAILED') return 'bg-hold';
  return 'bg-ink-2';
}
