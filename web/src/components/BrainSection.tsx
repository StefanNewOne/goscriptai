// BrainSection — CRUD wrapper for one Brain entity tab: an "Додади" header,
// a list of items with Уреди/Избриши actions, the BrainForm modal, and a
// delete ConfirmDialog. Wires to the existing backend routes
// (POST /clients/:id/:entity, PATCH /:entity/:id, DELETE /:entity/:id) via
// TanStack Query; invalidates the client so the brain refreshes. No backend
// change. RBAC stays server-side.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { mk } from '../i18n/mk';
import { EmptyState } from './EmptyState';
import { ConfirmDialog } from './ConfirmDialog';
import { BrainForm, type FieldDef } from './BrainForm';

interface Identified {
  id: string;
}

type Mode = { type: 'add' } | { type: 'edit'; item: Identified } | null;

export function BrainSection<T extends Identified>({
  clientId,
  entity,
  label,
  fields,
  items,
  renderContent,
  toInitial,
  emptyText,
}: {
  clientId: string;
  entity: string;
  label: string;
  fields: FieldDef[];
  items: T[];
  renderContent: (item: T) => React.ReactNode;
  toInitial?: (item: T) => Record<string, unknown>;
  emptyText: string;
}) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['client', clientId] });
  const [mode, setMode] = useState<Mode>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/clients/${clientId}/${entity}`, body),
    onSuccess: () => {
      setMode(null);
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Record<string, unknown> }) => api.patch(`/${entity}/${v.id}`, v.body),
    onSuccess: () => {
      setMode(null);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/${entity}/${id}`),
    onSuccess: () => {
      setPendingDelete(null);
      invalidate();
    },
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-14 font-medium">{label}</span>
        <button
          className="h-9 rounded-control bg-ink px-3 text-14 font-medium text-white hover:bg-ink-btn-hover"
          onClick={() => setMode({ type: 'add' })}
        >
          {mk.common.add}
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
          {items.map((it) => (
            <div key={it.id} className="flex items-start justify-between gap-3 border-b border-rule p-3 last:border-b-0">
              <div className="min-w-0 flex-1">{renderContent(it)}</div>
              <div className="flex shrink-0 gap-2">
                <button className="text-13 text-ink-2 underline underline-offset-2 hover:text-ink" onClick={() => setMode({ type: 'edit', item: it })}>
                  {mk.common.edit}
                </button>
                <button className="text-13 text-fail underline underline-offset-2 hover:opacity-80" onClick={() => setPendingDelete(it)}>
                  {mk.common.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode?.type === 'add' && (
        <BrainForm
          title={`${mk.common.add} ${label.toLowerCase()}`}
          fields={fields}
          saving={create.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(body) => create.mutate(body)}
        />
      )}
      {mode?.type === 'edit' && (
        <BrainForm
          title={`${mk.common.edit} ${label.toLowerCase()}`}
          fields={fields}
          initial={toInitial ? toInitial(mode.item as T) : (mode.item as unknown as Record<string, unknown>)}
          saving={update.isPending}
          onCancel={() => setMode(null)}
          onSubmit={(body) => update.mutate({ id: mode.item.id, body })}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={mk.common.delete}
        body={mk.common.confirmDelete}
        confirmLabel={mk.common.delete}
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
