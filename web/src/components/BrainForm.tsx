// BrainForm — a generic create/edit modal for Brain entities, driven by a field
// list so every entity (products, actors, locations, competitors, references,
// glossary) reuses one form. Assembles a typed body matching the backend Zod
// schemas. Strings централизирани во i18n; no business logic here.
import { useMemo, useState } from 'react';
import { mk } from '../i18n/mk';

export type FieldKind = 'text' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'tags' | 'langs' | 'kvlines';

export interface FieldDef {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  defaultChecked?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
}

type Val = string | boolean | string[];

function toEditable(field: FieldDef, raw: unknown): Val {
  switch (field.kind) {
    case 'checkbox':
      return raw === undefined || raw === null ? Boolean(field.defaultChecked) : Boolean(raw);
    case 'tags':
      return Array.isArray(raw) ? raw.join(', ') : '';
    case 'langs':
      return Array.isArray(raw) ? raw.map(String) : [];
    case 'kvlines':
      return raw && typeof raw === 'object'
        ? Object.entries(raw as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join('\n')
        : '';
    case 'number':
      return raw === undefined || raw === null ? '' : String(raw);
    case 'date':
      return raw ? String(raw).slice(0, 10) : '';
    case 'select':
      return raw !== undefined && raw !== null && raw !== ''
        ? String(raw)
        : field.required && field.options?.[0]
          ? field.options[0].value
          : '';
    default:
      return raw === undefined || raw === null ? '' : String(raw);
  }
}

const LANG_OPTS = ['MK', 'SQ', 'BOTH'];

export function BrainForm({
  title,
  fields,
  initial,
  saving = false,
  onSubmit,
  onCancel,
}: {
  title: string;
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  saving?: boolean;
  onSubmit: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, Val>>(() => {
    const v: Record<string, Val> = {};
    for (const f of fields) v[f.name] = toEditable(f, initial?.[f.name]);
    return v;
  });

  const set = (name: string, v: Val) => setValues((prev) => ({ ...prev, [name]: v }));

  const valid = useMemo(
    () =>
      fields
        .filter((f) => f.required)
        .every((f) => {
          const v = values[f.name];
          if (Array.isArray(v)) return v.length > 0;
          return String(v ?? '').trim() !== '';
        }),
    [fields, values],
  );

  const submit = () => {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      switch (f.kind) {
        case 'checkbox':
          body[f.name] = Boolean(v);
          break;
        case 'number': {
          const s = String(v ?? '').trim();
          if (s !== '') body[f.name] = Number(s);
          break;
        }
        case 'date': {
          const s = String(v ?? '').trim();
          if (s !== '') body[f.name] = s;
          break;
        }
        case 'tags':
          body[f.name] = String(v ?? '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
          break;
        case 'langs':
          body[f.name] = Array.isArray(v) ? v : [];
          break;
        case 'kvlines': {
          const rec: Record<string, string> = {};
          String(v ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .forEach((line) => {
              const i = line.indexOf(':');
              if (i > 0) rec[line.slice(0, i).trim()] = line.slice(i + 1).trim();
            });
          body[f.name] = rec;
          break;
        }
        default: {
          const s = String(v ?? '').trim();
          if (s !== '') body[f.name] = s;
          break;
        }
      }
    }
    onSubmit(body);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onClick={onCancel}>
      <div
        className="max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-sheet border border-rule bg-sheet p-5 shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-16 font-semibold">{title}</h3>
        <div className="flex flex-col gap-3">
          {fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-13 text-ink-2">
              {f.kind !== 'checkbox' && (
                <span>
                  {f.label}
                  {f.required && <span className="text-signal"> *</span>}
                  {f.hint && <span className="text-ink-2"> — {f.hint}</span>}
                </span>
              )}
              <FieldInput field={f} value={values[f.name] ?? ''} onChange={(v) => set(f.name, v)} />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="h-9 rounded-control border border-rule px-4 text-14 hover:bg-row-hover" onClick={onCancel}>
            {mk.common.cancel}
          </button>
          <button
            className="h-9 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50"
            onClick={submit}
            disabled={!valid || saving}
          >
            {mk.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: Val; onChange: (v: Val) => void }) {
  const input = 'rounded-control border border-rule p-2 text-14 text-ink focus:border-ink focus:outline-none';
  switch (field.kind) {
    case 'textarea':
    case 'kvlines':
      return <textarea className={input} rows={3} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select className={input} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'checkbox':
      return (
        <span className="flex items-center gap-2 text-14 text-ink">
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </span>
      );
    case 'langs': {
      const arr = Array.isArray(value) ? value : [];
      return (
        <span className="flex gap-3 text-14 text-ink">
          {LANG_OPTS.map((l) => (
            <label key={l} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={arr.includes(l)}
                onChange={(e) => onChange(e.target.checked ? [...arr, l] : arr.filter((x) => x !== l))}
              />
              {mk.lang[l]}
            </label>
          ))}
        </span>
      );
    }
    case 'number':
      return <input type="number" className={input} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input type="date" className={input} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input type="text" className={input} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}
