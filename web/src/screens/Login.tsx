import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { mk } from '../i18n/mk';
import { useAuth } from '../lib/auth';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError(mk.login.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-[360px] rounded-sheet border border-rule bg-sheet p-8">
        <h1 className="text-20 font-semibold">{mk.app.name}</h1>
        <p className="mb-6 mt-1 text-14 text-ink-2">{mk.login.title}</p>

        <label className="mb-1 block text-13 text-ink-2">{mk.login.email}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 h-10 w-full rounded-control border border-rule bg-sheet px-3 text-14 outline-none focus:border-ink"
          autoFocus
        />

        <label className="mb-1 block text-13 text-ink-2">{mk.login.password}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 h-10 w-full rounded-control border border-rule bg-sheet px-3 text-14 outline-none focus:border-ink"
        />

        {error && <p className="mb-3 text-13 text-fail">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="h-10 w-full rounded-control bg-ink text-14 font-medium text-white hover:bg-ink-btn-hover disabled:opacity-60"
        >
          {mk.login.submit}
        </button>
      </form>
    </div>
  );
}
