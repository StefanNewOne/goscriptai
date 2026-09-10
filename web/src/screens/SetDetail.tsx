import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';
import { ScriptView, type ScriptContent } from '../components/ScriptView';
import { ScriptEditor } from '../components/ScriptEditor';
import { StatusBadge } from '../components/StatusBadge';
import { ConceptCard, type ConceptCardData } from '../components/ConceptCard';
import { AgentStatusLine } from '../components/AgentStatusLine';
import { CheckpointBar } from '../components/CheckpointBar';
import { CriticScore, type CriticReport } from '../components/CriticScore';
import { ContextSheet } from '../components/ContextSheet';

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
  concepts: ConceptCardData[];
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

      {set.status === 'CONCEPTS_GENERATING' && <AgentStatusLine label={mk.set.generatingConcepts} />}
      {set.status === 'CONCEPTS_REVIEW' && <Concepts set={set} />}
      {(set.status === 'SCRIPTS_WRITING' || set.status === 'CRITIC_RUNNING') && (
        <AgentStatusLine
          label={`${mk.set.writingScripts} · ${set.scripts.filter((s) => s.status === 'SCRIPTS_REVIEW').length} ${mk.set.ready}`}
        />
      )}
      {['SCRIPTS_REVIEW', 'APPROVED', 'EXPORTED'].includes(set.status) && <Scripts set={set} />}
    </div>
  );
}

function Concepts({ set }: { set: SetData }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['set', set.id] });
  const decide = useMutation({
    mutationFn: (v: { conceptId: string; decision: 'SELECTED' | 'REJECTED' }) =>
      api.post(`/concepts/${v.conceptId}/decision`, { decision: v.decision }),
    onSuccess: invalidate,
  });
  const writeSelected = useMutation({ mutationFn: () => api.post(`/sets/${set.id}/write`), onSuccess: invalidate });
  const selected = set.concepts.filter((c) => c.decision === 'SELECTED').length;

  return (
    <div className="grid grid-cols-[1fr_260px] gap-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-3.5">
        {set.concepts.map((c) => (
          <ConceptCard
            key={c.id}
            concept={c}
            onSelect={() => decide.mutate({ conceptId: c.id, decision: 'SELECTED' })}
            onReject={() => decide.mutate({ conceptId: c.id, decision: 'REJECTED' })}
          />
        ))}
      </div>
      <aside className="sticky top-20 h-fit">
        <p className="text-20 font-semibold">
          {mk.set.selectedOf.replace('{n}', String(selected)).replace('{m}', String(set.requested))}
        </p>
        <button
          className="mt-4 h-11 w-full rounded-control bg-signal text-14 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
          onClick={() => writeSelected.mutate()}
          disabled={selected === 0 || writeSelected.isPending}
        >
          {mk.set.writeSelected}
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
  const [editing, setEditing] = useState(false);

  const approve = useMutation({ mutationFn: (sid: string) => api.post(`/scripts/${sid}/approve`), onSuccess: invalidate });
  const ret = useMutation({
    mutationFn: (v: { sid: string; comment: string }) => api.post(`/scripts/${v.sid}/return`, { comment: v.comment }),
    onSuccess: invalidate,
  });
  const editSave = useMutation({
    mutationFn: (v: { sid: string; content: ScriptContent }) => api.patch(`/scripts/${v.sid}/content`, { content: v.content }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });
  const exportSet = useMutation({ mutationFn: () => api.post(`/sets/${set.id}/export`), onSuccess: invalidate });

  if (!current) return null;
  const allApproved = set.scripts.every((s) => s.status === 'APPROVED' || s.status === 'EXPORTED');
  const token = localStorage.getItem('gs_token');

  const jumpToFrame = (frame: number) => {
    document.getElementById(`frame-${frame}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-wrap gap-6">
      {/* list */}
      <div className="w-[210px] shrink-0">
        {set.scripts.map((s) => (
          <button
            key={s.id}
            className={`mb-1 flex w-full items-center gap-2 rounded-control border px-2 py-2 text-left ${
              s.id === current.id ? 'border-rule bg-sheet' : 'border-transparent hover:bg-nav-hover'
            }`}
            onClick={() => setCurrentId(s.id)}
          >
            <span className="font-mono text-13 text-ink-2">{s.code.split('-').pop()}</span>
            <span className="flex-1 truncate text-14">{s.title}</span>
            <span className={`h-2 w-2 rounded-full ${scriptDot(s.status)}`} />
          </button>
        ))}
        {allApproved && set.status !== 'EXPORTED' && (
          <button
            className="mt-3 h-9 w-full rounded-control bg-signal text-14 font-semibold text-white hover:bg-signal-hover"
            onClick={() => exportSet.mutate()}
          >
            {mk.set.toExport}
          </button>
        )}
        {set.status === 'EXPORTED' && (
          <div className="mt-3 rounded-control border border-ok/30 bg-sheet p-3 text-13">
            <p className="mb-2 text-ok">{mk.set.exported}</p>
            <a className="block underline" href={`/api/v1/sets/${set.id}/export/download?type=docx&token=${token}`}>
              {mk.set.downloadDocx}
            </a>
            <a className="block underline" href={`/api/v1/sets/${set.id}/export/download?type=md&token=${token}`}>
              {mk.set.downloadMd}
            </a>
          </div>
        )}
      </div>

      {/* script */}
      <div className="min-w-[460px] flex-1">
        {editing ? (
          <ScriptEditor
            content={current.content}
            saving={editSave.isPending}
            onCancel={() => setEditing(false)}
            onSave={(c) => editSave.mutate({ sid: current.id, content: c })}
          />
        ) : (
          <ScriptView
            meta={{ code: current.code, title: current.title, type: typeLabel(current.type), seconds: undefined, version: current.version }}
            content={current.content}
          />
        )}

        {current.status === 'SCRIPTS_REVIEW' && !editing && (
          <CheckpointBar
            primaryLabel={mk.checkpoint.approve}
            onPrimary={() => approve.mutate(current.id)}
            onEdit={() => setEditing(true)}
            onReturn={(comment) => ret.mutate({ sid: current.id, comment })}
            busy={approve.isPending || ret.isPending}
          />
        )}
        {current.status === 'APPROVED' && <p className="mt-4 text-14 text-ok">{mk.set.approved}</p>}
      </div>

      {/* critic context */}
      {current.criticReport && (
        <ContextSheet title="Критика">
          <CriticScore report={current.criticReport} onJumpToFrame={jumpToFrame} />
        </ContextSheet>
      )}
    </div>
  );
}

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    CONCEPTS_GENERATING: mk.set.generatingConcepts,
    CONCEPTS_REVIEW: 'Концепти за избор',
    SCRIPTS_WRITING: 'Се пишуваат',
    CRITIC_RUNNING: mk.set.inCritic,
    SCRIPTS_REVIEW: 'За одобрување',
    APPROVED: 'Одобрено',
    EXPORTED: 'Експортирано',
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
