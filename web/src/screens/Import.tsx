import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ClientListItem } from '../lib/types';
import { ScriptView, type ScriptContent } from '../components/ScriptView';

interface ParseResult {
  content: ScriptContent;
  warnings: { code: string; message: string; frame?: number }[];
}

const SAMPLE = `КАДАР 1 — ХООК
Ајтов држи ваучер и гледа во камера.
Ајтов: „500 денари попуст, само овој викенд.“

КАДАР 2 — ЦТА
Кадри од салонот, лого.
Ајтов: „Дојди во Алекс Дизајн во Радишани.“`;

// Import (README §12): idle → parsing → parsed → saved.
export function Import() {
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => api.get<ClientListItem[]>('/clients') });
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('PRODUCT_OFFER');
  const [code, setCode] = useState('');
  const [star, setStar] = useState(false);

  const parse = useMutation({ mutationFn: () => api.post<ParseResult>('/import/parse', { text }), onSuccess: setParsed });
  const commit = useMutation({
    mutationFn: () => api.post<{ code: string }>('/import/commit', { clientId, title: title || 'Увезено сценарио', type, code: code || undefined, isStarExample: star, content: parsed!.content }),
    onSuccess: (s) => setSaved(s.code),
  });

  if (saved) {
    return (
      <div>
        <h1 className="mb-6 text-28 font-semibold">Увоз</h1>
        <div className="max-w-[560px] rounded-sheet border border-rule bg-sheet p-6">
          <p className="text-16 text-ok">Зачувано со код {saved}.</p>
          <button className="mt-4 h-9 rounded-control border border-rule px-4 text-14" onClick={() => { setSaved(null); setParsed(null); setText(''); setCode(''); setTitle(''); }}>
            Увези уште едно
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-28 font-semibold">Увоз</h1>

      {!parsed && (
        <div className="max-w-read">
          <textarea className="w-full rounded-sheet border border-rule bg-sheet p-3 font-mono text-14" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Вметни сценарио (кадри со КАДАР, реплики Име: „…“)…" />
          <div className="mt-3 flex gap-2">
            <button className="h-10 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50" onClick={() => parse.mutate()} disabled={!text || parse.isPending}>
              Парсирај
            </button>
            <button className="h-10 rounded-control border border-rule px-4 text-14" onClick={() => setText(SAMPLE)}>
              Вметни пример
            </button>
          </div>
        </div>
      )}

      {parsed && (
        <div>
          {parsed.warnings.length > 0 && (
            <div className="mb-4 rounded-sheet border border-hold/40 bg-sheet p-4">
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-13 text-hold">{w.message}</p>
              ))}
            </div>
          )}
          <div className="mb-4 grid grid-cols-2 gap-6">
            <ScriptView meta={{ code: code || 'НОВ-КОД', title: title || 'Увезено', type, version: 1 }} content={parsed.content} />
            <pre className="overflow-auto whitespace-pre-wrap rounded-sheet border border-rule bg-paper p-4 text-13 text-ink-2">{text}</pre>
          </div>

          <div className="grid max-w-read grid-cols-2 gap-3">
            <label className="text-13 text-ink-2">Клиент
              <select className="mt-1 h-9 w-full rounded-control border border-rule px-2 text-14 text-ink" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— избери —</option>
                {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-13 text-ink-2">Наслов
              <input className="mt-1 h-9 w-full rounded-control border border-rule px-3 text-14 text-ink" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="text-13 text-ink-2">Код (опционално)
              <input className="mt-1 h-9 w-full rounded-control border border-rule px-3 font-mono text-14 text-ink" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="авто" />
            </label>
            <label className="text-13 text-ink-2">Тип
              <select className="mt-1 h-9 w-full rounded-control border border-rule px-2 text-14 text-ink" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="PRODUCT_OFFER">Продажно</option>
                <option value="EDUCATIONAL">Едукативно</option>
                <option value="TESTIMONIAL">Тестимонијал</option>
                <option value="SKETCH">Скеч</option>
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2 text-14 text-ink">
              <input type="checkbox" checked={star} onChange={(e) => setStar(e.target.checked)} /> Ѕвезда пример
            </label>
          </div>

          {commit.isError && <p className="mt-2 text-13 text-fail">{(commit.error as Error).message}</p>}
          <div className="mt-4 flex gap-2">
            <button className="h-11 rounded-control bg-ink px-5 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50" onClick={() => commit.mutate()} disabled={!clientId || commit.isPending}>
              Прифати и зачувај
            </button>
            <button className="h-11 rounded-control border border-rule px-4 text-14" onClick={() => setParsed(null)}>Откажи</button>
            <span className="self-center text-13 text-ink-2">Кодот мора да е еднаков со името на рекламата.</span>
          </div>
        </div>
      )}
    </div>
  );
}
