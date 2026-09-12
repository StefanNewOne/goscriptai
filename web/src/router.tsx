import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { AppShell } from './components/AppShell';
import { Login } from './screens/Login';
import { Inbox } from './screens/Inbox';
import { Clients } from './screens/Clients';
import { ClientDetail } from './screens/ClientDetail';
import { NewSet } from './screens/NewSet';
import { SetDetail } from './screens/SetDetail';
import { Import } from './screens/Import';
import { Settings } from './screens/Settings';
import { ScriptsDB } from './screens/ScriptsDB';
import { Reports } from './screens/Reports';
import { Results } from './screens/Results';
import { mk } from './i18n/mk';

export function Router() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6 text-14 text-ink-2">{mk.common.loading}</div>;
  if (!user) return <Login />;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Inbox />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail section="overview" />} />
        <Route path="/clients/:id/brain/:tab" element={<ClientDetail section="brain" />} />
        <Route path="/scripts" element={<ScriptsDB />} />
        <Route path="/results" element={<Results />} />
        <Route path="/import" element={<Import />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sets/new" element={<NewSet />} />
        <Route path="/sets/:id" element={<SetDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
