import { useState } from 'react';

import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useViewer } from './auth/useViewer';
import { AssignedByMeWidget } from './features/assigned-by-me/AssignedByMeWidget';
import { KanbanWidget } from './features/kanban/KanbanWidget';
import { MyTasksWidget } from './features/my-tasks/MyTasksWidget';
import { PrAwaitingReviewWidget } from './features/pr-review/PrAwaitingReviewWidget';
import { ProjectsScreen } from './features/projects-engagement/ProjectsScreen';
import { TeamScreen } from './features/team-view/TeamScreen';
import { TestingQueueWidget } from './features/testing-queue/TestingQueueWidget';
import { useRateLimit } from './hooks/rateLimit';
import { SettingsScreen } from './settings/SettingsScreen';
import { useProjectSync } from './sync/useProjectSync';
import { TopNav, type View } from './ui/TopNav';
import './App.css';

const KIND_LABEL: Record<string, string> = {
  primary: 'GitHub API budget exhausted',
  secondary: 'GitHub secondary rate limit (abuse protection)',
  graphql: 'GitHub GraphQL points exhausted',
};

function formatRelative(target: Date): string {
  const diffSec = Math.max(0, Math.round((target.getTime() - Date.now()) / 1000));
  if (diffSec < 60) {
    return `in ${String(diffSec)}s`;
  }
  const min = Math.round(diffSec / 60);
  return `in ${String(min)} min`;
}

function RateLimitBanner() {
  const { remaining, pausedUntil, pauseKind } = useRateLimit();
  if (!pausedUntil || pausedUntil.getTime() <= Date.now()) {
    return null;
  }
  const label = pauseKind ? KIND_LABEL[pauseKind] : 'Rate-limited';
  return (
    <div className="rate-limit-banner">
      <strong>{label}.</strong> Polling paused — resumes {formatRelative(pausedUntil)} (at{' '}
      {pausedUntil.toLocaleTimeString()}
      {remaining !== null ? `, ${String(remaining)} requests remaining` : ''}).
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
  // Single sync orchestrator for the whole app. Mount-once contract: a stray
  // second mount is guarded inside the hook via a module-level generation.
  useProjectSync(login !== null);

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
        <div hidden={view !== 'projects'}>
          <ProjectsScreen />
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
