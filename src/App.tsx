import { useState } from 'react';

import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useViewer } from './auth/useViewer';
import { AssignedByMeWidget } from './features/assigned-by-me/AssignedByMeWidget';
import { KanbanWidget } from './features/kanban/KanbanWidget';
import { PrAwaitingReviewWidget } from './features/pr-review/PrAwaitingReviewWidget';
import { TeamScreen } from './features/team-view/TeamScreen';
import { TestingQueueWidget } from './features/testing-queue/TestingQueueWidget';
import { useRateLimit } from './hooks/rateLimit';
import { SettingsScreen } from './settings/SettingsScreen';
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

type View = 'dashboard' | 'team' | 'settings';

function Authenticated({ onLogout }: { onLogout: () => Promise<void> }) {
  const { login, error } = useViewer();
  const [view, setView] = useState<View>('dashboard');

  if (view === 'settings') {
    return (
      <SettingsScreen
        onClose={() => {
          setView('dashboard');
        }}
      />
    );
  }

  if (view === 'team') {
    return (
      <TeamScreen
        onClose={() => {
          setView('dashboard');
        }}
      />
    );
  }

  return (
    <main className="app">
      <header className="app__header">
        <span>{login ? `Signed in as ${login}` : 'Verifying…'}</span>
        <div className="app__actions">
          <button
            type="button"
            onClick={() => {
              setView('team');
            }}
          >
            Team
          </button>
          <button
            type="button"
            onClick={() => {
              setView('settings');
            }}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      {error ? <p className="login__error">{error}</p> : null}
      <RateLimitBanner />
      <PrAwaitingReviewWidget />
      <TestingQueueWidget viewerLogin={login} />
      <AssignedByMeWidget viewerLogin={login} />
      <KanbanWidget />
    </main>
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
