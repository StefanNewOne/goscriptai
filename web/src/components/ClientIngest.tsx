// ClientIngest — the "Полнење" review queue on a client. Shows PENDING media
// assets pushed by the local ingestion tool (video→script + brain proposals)
// and lets the scriptwriter confirm (→ IMPORTED script + active mentions) or
// reject. Nothing entered the brain as active until confirmed (invariant 2).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';
import { useToast } from './Toast';

interface PendingMedia {
  id: string;
  filename: string;
  extraction: {
    script?: { title?: string; hook?: string; shots?: unknown[] };
    brain?: {
      tags?: { videoType?: string; topic?: string[]; hookType?: string; ctaGoal?: string };
      actors?: { gender?: string; ageRange?: string; look?: string }[];
      buyerAvatar?: { persona?: string };
    };
  };
  mentions: { id: string; name: string; essence: string }[];
}

export function ClientIngest({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['client', clientId, 'ingest'],
    queryFn: () => api.get<PendingMedia[]>(`/clients/${clientId}/ingest`),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', clientId] });

  const confirm = useMutation({
    mutationFn: (mediaId: string) => api.post<{ code?: string }>(`/clients/${clientId}/ingest/${mediaId}/confirm`),
    onSuccess: (r) => {
      toast(`${mk.ingest.confirmedScript} ${r?.code ?? ''}`.trim(), 'ok');
      invalidate();
    },
  });
  const reject = useMutation({
    mutationFn: (mediaId: string) => api.post(`/clients/${clientId}/ingest/${mediaId}/reject`),
    onSuccess: () => {
      toast(mk.ingest.rejected, 'neutral');
      invalidate();
    },
  });

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-5 rounded-sheet border border-rule bg-sheet">
      <h2 className="border-b border-rule px-4 py-3 text-14 font-medium">
        {mk.ingest.title} ({data.length})
      </h2>
      {data.map((m) => {
        const s = m.extraction?.script ?? {};
        const t = m.extraction?.brain?.tags;
        const actors = m.extraction?.brain?.actors ?? [];
        const avatar = m.extraction?.brain?.buyerAvatar?.persona;
        const tagLine = [t?.videoType, t?.hookType, t?.ctaGoal].filter(Boolean).join(' · ');
        return (
          <div key={m.id} className="border-t border-rule p-4">
            <div className="text-14 font-medium">{s.title || m.filename}</div>
            {s.hook && <div className="mt-1 text-13 text-ink-2">ХООК: „{s.hook}"</div>}
            <div className="mt-1 text-13 text-ink-2">
              {s.shots?.length ?? 0} {mk.ingest.shots}
              {tagLine ? ` · ${tagLine}` : ''}
            </div>
            {t?.topic?.length ? (
              <div className="text-13">
                <span className="text-ink-2">{mk.ingest.topics}: </span>
                {t.topic.join(', ')}
              </div>
            ) : null}
            {m.mentions.length > 0 && (
              <div className="text-13">
                <span className="text-ink-2">{mk.ingest.products}: </span>
                {m.mentions.map((x) => x.name).join(', ')}
              </div>
            )}
            {actors.length > 0 && (
              <div className="text-13">
                <span className="text-ink-2">{mk.ingest.actors}: </span>
                {actors.map((a) => [a.gender, a.ageRange].filter(Boolean).join(' ')).join(' · ')}
              </div>
            )}
            {avatar && (
              <div className="text-13">
                <span className="text-ink-2">{mk.ingest.avatar}: </span>
                {avatar}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="h-9 rounded-control bg-signal px-4 text-14 font-semibold text-white hover:bg-signal-hover disabled:opacity-50"
                onClick={() => confirm.mutate(m.id)}
                disabled={confirm.isPending || reject.isPending}
              >
                {mk.ingest.confirm}
              </button>
              <button
                className="h-9 rounded-control border border-rule px-4 text-14 hover:bg-row-hover disabled:opacity-50"
                onClick={() => reject.mutate(m.id)}
                disabled={confirm.isPending || reject.isPending}
              >
                {mk.ingest.reject}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
