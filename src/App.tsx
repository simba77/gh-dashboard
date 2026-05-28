import { useState } from 'react';

import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useViewer } from './auth/useViewer';
import { AssignedByMeWidget } from './features/assigned-by-me/AssignedByMeWidget';
import { KanbanWidget } from './features/kanban/KanbanWidget';
import { PrAwaitingReviewWidget } from './features/pr-review/PrAwaitingReviewWidget';
import { TestingQueueWidget } from './features/testing-queue/TestingQueueWidget';
import { SettingsScreen } from './settings/SettingsScreen';
import './App.css';

function Authenticated({ onLogout }: { onLogout: () => Promise<void> }) {
  const { login, error } = useViewer();
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <SettingsScreen
        onClose={() => {
          setShowSettings(false);
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
              setShowSettings(true);
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
