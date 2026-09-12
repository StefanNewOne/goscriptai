// ClientIngest — the "Полнење" review queue on a client. Shows PENDING media
// assets pushed by the local ingestion tool (video→script + brain proposals),
// lets the scriptwriter EXPAND the full script (shots + verbatim lines) before
// deciding, and confirm (→ IMPORTED script + active mentions) or reject.
// Nothing enters the brain as active until confirmed (invariant 2).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';
import { useToast } from './Toast';

interface Shot {
  index?: number;
  role?: string;
  description?: string;
  onScreenText?: string;
  actor?: string;
  line?: string;
}
interface PendingMedia {
  id: string;
  filename: string;
  extraction: {
    script?: {
      title?: string;
      format?: string;
      language?: string;
      durationSec?: number;
      platforms?: string[];
      vibe?: string;
      music?: string;
      hook?: string;
      cta?: string;
      captions?: string[];
      shots?: Shot[];
    };
    brain?: {
      tags?: { videoType?: string; topic?: string[]; hookType?: string; ctaGoal?: string; extra?: string[] };
      productMentions?: { name?: string; essence?: string; quote?: string }[];
      actors?: { gender?: string; ageRange?: string; look?: string }[];
      buyerAvatar?: { persona?: string };
      productionNote?: string;
    };
  };
  mentions: { id: string; name: string; essence: string }[];
}

export function ClientIngest({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
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
        const b = m.extraction?.brain ?? {};
        const t = b.tags;
        const actors = b.actors ?? [];
        const open = openId === m.id;
        const tagLine = [t?.videoType, t?.hookType, t?.ctaGoal].filter(Boolean).join(' · ');
        const metaLine = [s.format, s.language, s.durationSec ? `~${s.durationSec}с` : null, (s.platforms ?? []).join(' + ') || null]
          .filter(Boolean)
          .join(' · ');
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
            {b.buyerAvatar?.persona && (
              <div className="text-13">
                <span className="text-ink-2">{mk.ingest.avatar}: </span>
                {b.buyerAvatar.persona}
              </div>
            )}

            {open && (
              <div className="mt-3 rounded-control border border-rule bg-paper p-4">
                {metaLine && <div className="mb-2 text-13 text-ink-2">{metaLine}</div>}
                {s.vibe && (
                  <div className="text-13">
                    <span className="text-ink-2">Вајб: </span>
                    {s.vibe}
                  </div>
                )}
                {s.music && (
                  <div className="mb-2 text-13">
                    <span className="text-ink-2">Музика: </span>
                    {s.music}
                  </div>
                )}
                <div className="flex flex-col gap-3 border-t border-rule pt-3">
                  {(s.shots ?? []).map((sh, i) => (
                    <div key={i} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-13">
                      <div className="text-ink-2">
                        <div className="font-semibold text-ink">{sh.role ?? ''}</div>
                        <div>Кадар {sh.index ?? i + 1}</div>
                      </div>
                      <div>
                        {sh.description && <p className="italic text-ink-2">{sh.description}</p>}
                        {sh.onScreenText && <p className="text-ink-2">Текст на екран: {sh.onScreenText}</p>}
                        {sh.line && (
                          <p className="mt-1 font-mono text-14 leading-[1.6]">
                            <span className="font-semibold">{sh.actor || 'Актер'}:</span> „{sh.line}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {s.cta && (
                  <div className="mt-3 border-t border-rule pt-2 text-13">
                    <span className="text-ink-2">{mk.ingest.cta}: </span>
                    {s.cta}
                  </div>
                )}
                {s.captions?.length ? (
                  <div className="mt-2 text-13">
                    <span className="text-ink-2">{mk.ingest.captions}: </span>
                    {s.captions.join(' · ')}
                  </div>
                ) : null}
                {(b.productMentions ?? []).length > 0 && (
                  <div className="mt-3 border-t border-rule pt-2">
                    {(b.productMentions ?? []).map((pm, i) => (
                      <div key={i} className="text-13">
                        <span className="font-medium">{pm.name}</span>
                        {pm.essence ? ` — ${pm.essence}` : ''}
                        {pm.quote ? <span className="text-ink-2"> „{pm.quote}"</span> : null}
                      </div>
                    ))}
                  </div>
                )}
                {actors.length > 0 && (
                  <div className="mt-2 text-13">
                    {actors.map((a, i) => (
                      <div key={i} className="text-ink-2">
                        {mk.ingest.actors} {actors.length > 1 ? i + 1 : ''}: {[a.gender, a.ageRange, a.look].filter(Boolean).join(', ')}
                      </div>
                    ))}
                  </div>
                )}
                {b.productionNote && (
                  <div className="mt-2 text-13">
                    <span className="text-ink-2">{mk.ingest.productionNote}: </span>
                    {b.productionNote}
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
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
              <button
                className="h-9 rounded-control border border-rule px-4 text-14 hover:bg-row-hover"
                onClick={() => setOpenId(open ? null : m.id)}
              >
                {open ? mk.ingest.hide : mk.ingest.showFull}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
