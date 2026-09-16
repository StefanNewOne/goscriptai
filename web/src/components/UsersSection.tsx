import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Role } from '../lib/types';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const ROLE_LABEL: Record<Role, string> = {
  SCRIPTWRITER: 'Сценарист',
  ADMIN: 'Админ',
  VIEWER: 'Прегледувач',
};
const ROLES: Role[] = ['SCRIPTWRITER', 'ADMIN', 'VIEWER'];

// User administration (Admin, GS-42). Own role can't be changed (self-lockout
// guard is enforced server-side too). Users are never deleted — only reroled.
export function UsersSection({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => api.get<AdminUser[]>('/users') });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('SCRIPTWRITER');
  const [password, setPassword] = useState('');
  const [pw, setPw] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const create = useMutation({
    mutationFn: () => api.post('/users', { name, email, role, password }),
    onSuccess: () => { setName(''); setEmail(''); setPassword(''); setRole('SCRIPTWRITER'); invalidate(); },
  });
  const changeRole = useMutation({ mutationFn: (v: { id: string; role: Role }) => api.patch(`/users/${v.id}/role`, { role: v.role }), onSuccess: invalidate });
  const reset = useMutation({
    mutationFn: (v: { id: string; password: string }) => api.post(`/users/${v.id}/reset-password`, { password: v.password }),
    onSuccess: (_d, v) => setPw((p) => ({ ...p, [v.id]: '' })),
  });

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-16 font-semibold">Корисници</h2>

      <div className="overflow-hidden rounded-sheet border border-rule bg-sheet">
        <div className="grid grid-cols-[1.2fr_1.6fr_160px_1fr] gap-4 border-b border-rule px-4 py-2 text-13 text-ink-2">
          <span>Име</span><span>Е-маил</span><span>Улога</span><span>Нова лозинка</span>
        </div>
        {(users ?? []).map((u) => (
          <div key={u.id} className="grid grid-cols-[1.2fr_1.6fr_160px_1fr] items-center gap-4 border-t border-rule px-4 py-2 text-13">
            <span>{u.name}{u.id === currentUserId ? ' (ти)' : ''}</span>
            <span className="text-ink-2">{u.email}</span>
            <select
              className="rounded-control border border-rule bg-sheet px-2 py-1 text-13 disabled:opacity-50"
              value={u.role}
              disabled={u.id === currentUserId || changeRole.isPending}
              onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value as Role })}
            >
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="password"
                className="h-8 w-full rounded-control border border-rule bg-sheet px-2 text-13"
                placeholder="min 6 знаци"
                value={pw[u.id] ?? ''}
                onChange={(e) => setPw((p) => ({ ...p, [u.id]: e.target.value }))}
              />
              <button
                className="h-8 shrink-0 rounded-control border border-rule px-2 text-13 hover:bg-nav-hover disabled:opacity-50"
                disabled={(pw[u.id] ?? '').length < 6 || reset.isPending}
                onClick={() => reset.mutate({ id: u.id, password: pw[u.id]! })}
              >
                Ресетирај
              </button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-14 font-medium">Додади корисник</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-13 text-ink-2">Име
          <input className="mt-1 block h-9 w-40 rounded-control border border-rule px-2 text-14 text-ink" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-13 text-ink-2">Е-маил
          <input type="email" className="mt-1 block h-9 w-56 rounded-control border border-rule px-2 text-14 text-ink" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="text-13 text-ink-2">Улога
          <select className="mt-1 block h-9 w-40 rounded-control border border-rule px-2 text-14 text-ink" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="text-13 text-ink-2">Лозинка
          <input type="password" className="mt-1 block h-9 w-40 rounded-control border border-rule px-2 text-14 text-ink" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button
          className="h-9 rounded-control bg-ink px-4 text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-50"
          disabled={!name || !email || password.length < 6 || create.isPending}
          onClick={() => create.mutate()}
        >
          Додади
        </button>
      </div>
      {create.isError && <p className="mt-2 text-13 text-fail">{(create.error as Error).message}</p>}
    </div>
  );
}
