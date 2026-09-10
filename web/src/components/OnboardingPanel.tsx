import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ClientDetail } from '../lib/types';

// Drives the Client Brain onboarding checkpoints from the overview. Agents are
// invisible workers: the panel shows a quiet status line while a job runs and
// the human action when a checkpoint waits.
interface Question {
  id: string;
  text: string;
  kind: 'text' | 'choice';
  options?: string[];
}

const RUNNING = ['ANALYST_RUNNING', 'AVATARS_RUNNING'];

export function OnboardingPanel({ c }: { c: ClientDetail }) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', c.id] });

  // Poll while an agent job is running (no spinner theatre — a quiet line).
  useQuery({
    queryKey: ['client', c.id, 'poll'],
    queryFn: async () => {
      await qc.invalidateQueries({ queryKey: ['client', c.id] });
      return Date.now();
    },
    enabled: RUNNING.includes(c.status),
    refetchInterval: 1500,
  });

  const analyze = useMutation({ mutationFn: () => api.post(`/clients/${c.id}/analyze`), onSuccess: invalidate });
  const activate = useMutation({ mutationFn: () => api.post(`/clients/${c.id}/activate`), onSuccess: invalidate });

  if (c.status === 'ACTIVE') return null;

  return (
    <section className="mb-5 rounded-sheet border border-rule bg-sheet p-5">
      <h2 className="mb-3 text-16 font-semibold">Onboarding · {statusLabel(c.status)}</h2>

      {(c.status === 'DRAFT' || c.status === 'INTAKE') && (
        <button
          className="h-10 rounded-control bg-signal px-4 text-14 font-medium text-white hover:bg-signal-hover disabled:opacity-60"
          onClick={() => analyze.mutate()}
          disabled={analyze.isPending}
        >
          Пушти анализа
        </button>
      )}

      {RUNNING.includes(c.status) && <RunningLine label={c.status === 'ANALYST_RUNNING' ? 'Се анализира клиентот…' : 'Се градат аватари…'} />}

      {c.status === 'ANALYST_QUESTIONS' && <QuestionsForm clientId={c.id} onDone={invalidate} />}

      {c.status === 'ANALYST_REVIEW' && (
        <ProfileReview clientId={c.id} markdown={c.profiles[0]?.markdown ?? ''} kind="profile" onDone={invalidate} />
      )}

      {c.status === 'AVATARS_REVIEW' && (
        <ProfileReview
          clientId={c.id}
          markdown={`Предложени ${c.avatars.length} аватари: ${c.avatars.map((a) => a.name).join(', ')}.`}
          kind="avatars"
          onDone={invalidate}
        />
      )}

      {c.status === 'MANUAL_SETUP' && (
        <div>
          <p className="mb-3 text-14 text-ink-2">Додади барем еден актер, потоа активирај го клиентот.</p>
          <button
            className="h-10 rounded-control bg-signal px-4 text-14 font-medium text-white hover:bg-signal-hover disabled:opacity-60"
            onClick={() => activate.mutate()}
            disabled={activate.isPending || c.actors.length === 0}
          >
            Активирај клиент
          </button>
          {c.actors.length === 0 && <p className="mt-2 text-13 text-hold">Нема актери — додади во табот Актери.</p>}
        </div>
      )}
    </section>
  );
}

function RunningLine({ label }: { label: string }) {
  return (
    <div>
      <p className="text-14 text-ink-2">{label}</p>
      <div className="mt-2 h-[3px] w-full max-w-[320px] overflow-hidden rounded bg-nav-hover">
        <div className="h-full w-1/3 animate-pulse bg-ink" />
      </div>
    </div>
  );
}

function QuestionsForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const { data } = useQuery({
    queryKey: ['client', clientId, 'questions'],
    queryFn: () => api.get<{ questions: Question[] }>(`/clients/${clientId}/questions`),
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const submit = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/answers`, { answers }),
    onSuccess: onDone,
  });
  const questions = data?.questions ?? [];

  return (
    <div className="flex flex-col gap-4">
      {questions.map((q) => (
        <div key={q.id}>
          <label className="mb-1 block text-14">{q.text}</label>
          {q.kind === 'choice' ? (
            <select
              className="h-9 w-full max-w-[420px] rounded-control border border-rule bg-sheet px-2 text-14"
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            >
              <option value="">—</option>
              {q.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="h-9 w-full max-w-[420px] rounded-control border border-rule bg-sheet px-3 text-14"
              value={answers[q.id] ?? ''}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <button
        className="h-10 w-fit rounded-control bg-signal px-4 text-14 font-medium text-white hover:bg-signal-hover disabled:opacity-60"
        onClick={() => submit.mutate()}
        disabled={submit.isPending}
      >
        Испрати одговори
      </button>
    </div>
  );
}

function ProfileReview({ clientId, markdown, kind, onDone }: { clientId: string; markdown: string; kind: 'profile' | 'avatars'; onDone: () => void }) {
  const [comment, setComment] = useState('');
  const [returning, setReturning] = useState(false);
  const endpoint = kind === 'profile' ? 'profile-decision' : 'avatars-decision';
  const decide = useMutation({
    mutationFn: (decision: 'approve' | 'request_changes') => api.post(`/clients/${clientId}/${endpoint}`, { decision, comment: comment || undefined }),
    onSuccess: onDone,
  });

  return (
    <div>
      <article className="mb-4 max-w-read whitespace-pre-wrap rounded-control border border-rule bg-paper p-4 text-14 leading-[1.55]">{markdown}</article>
      {returning ? (
        <div className="flex flex-col gap-2">
          <textarea
            className="w-full max-w-[520px] rounded-control border border-rule bg-sheet p-2 text-14"
            rows={3}
            placeholder="Коментар за ревизија…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="h-9 rounded-control bg-signal px-4 text-14 font-medium text-white hover:bg-signal-hover disabled:opacity-60"
              onClick={() => decide.mutate('request_changes')}
              disabled={!comment || decide.isPending}
            >
              Испрати
            </button>
            <button className="h-9 rounded-control border border-rule px-4 text-14" onClick={() => setReturning(false)}>
              Откажи
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            className="h-10 rounded-control bg-signal px-4 text-14 font-medium text-white hover:bg-signal-hover disabled:opacity-60"
            onClick={() => decide.mutate('approve')}
            disabled={decide.isPending}
          >
            Одобри
          </button>
          <button className="h-10 rounded-control border border-rule px-4 text-14" onClick={() => setReturning(true)}>
            Врати со коментар
          </button>
        </div>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'нацрт',
    INTAKE: 'внесен',
    ANALYST_RUNNING: 'анализа во тек',
    ANALYST_QUESTIONS: 'прашања од анализа',
    ANALYST_REVIEW: 'профил за одобрување',
    AVATARS_RUNNING: 'се градат аватари',
    AVATARS_REVIEW: 'аватари за потврда',
    MANUAL_SETUP: 'рачно поставување',
  };
  return map[status] ?? status;
}
