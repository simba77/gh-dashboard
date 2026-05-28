import { useState } from 'react';

import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useViewer } from './auth/useViewer';
import { AssignedByMeWidget } from './features/assigned-by-me/AssignedByMeWidget';
import { KanbanWidget } from './features/kanban/KanbanWidget';
import { MyTasksWidget } from './features/my-tasks/MyTasksWidget';
import { PrAwaitingReviewWidget } from './features/pr-review/PrAwaitingReviewWidget';
import { TeamScreen } from './features/team-view/TeamScreen';
import { TestingQueueWidget } from './features/testing-queue/TestingQueueWidget';
import { useRateLimit } from './hooks/rateLimit';
import { SettingsScreen } from './settings/SettingsScreen';
import { TopNav, type View } from './ui/TopNav';
import './App.css';

function RateLimitBanner() {
  const { remaining, pausedUntil } = useRateLimit();
  if (!pausedUntil || pausedUntil.getTime() <= Date.now()) {
    return null;
  }
  return (
    <div className="rate-limit-banner">
      Rate-limited ({remaining ?? '?'} left). Polling paused until{' '}
      {pausedUntil.toLocaleTimeString()}.
    </div>
  );
}

function Dashboard({ viewerLogin }: { viewerLogin: string | null }) {
  return (
    <>
      <PrAwaitingReviewWidget />
      <MyTasksWidget viewerLogin={viewerLogin} />
      <TestingQueueWidget viewerLogin={viewerLogin} />
      <AssignedByMeWidget viewerLogin={viewerLogin} />
      <KanbanWidget />
    </>
  );
}

function Authenticated({ onLogout }: { onLogout: () => Promise<void> }) {
  const { login, error } = useViewer();
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className="app-shell">
      <TopNav
        view={view}
        onChange={setView}
        viewerLogin={login}
        onLogout={() => {
          void onLogout();
        }}
      />
      <div className="app">
        {error ? <p className="login__error">{error}</p> : null}
        <RateLimitBanner />
        {/* All screens are mounted at once and toggled via `hidden`, so widget
            state and in-flight polls survive tab switches. Trade-off: every
            screen fetches on first login, not only the active one. */}
        <div hidden={view !== 'dashboard'}>
          <Dashboard viewerLogin={login} />
        </div>
        <div hidden={view !== 'team'}>
          <TeamScreen />
        </div>
        <div hidden={view !== 'settings'}>
          <SettingsScreen />
        </div>
      </div>
    </div>
  );
}

function App() {
  const { status, deviceCode, error, login, logout } = useAuth();

  if (status === 'loading') {
    return <main className="app">Loading…</main>;
  }

  if (status === 'authenticated') {
    return <Authenticated onLogout={logout} />;
  }

  return <LoginScreen deviceCode={deviceCode} error={error} onLogin={login} />;
}

export default App;
