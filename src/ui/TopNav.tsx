import { SyncControl } from './SyncControl';

export type View = 'dashboard' | 'team' | 'settings';

interface TopNavProps {
  view: View;
  onChange: (next: View) => void;
  viewerLogin: string | null;
  onLogout: () => void;
}

const TABS: { id: View; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'team', label: 'Team' },
  { id: 'settings', label: 'Settings' },
];

// Single persistent navigation across all authenticated screens. Replaces the
// per-screen "Done" button pattern, which read like a form-submit affordance.
export function TopNav({ view, onChange, viewerLogin, onLogout }: TopNavProps) {
  return (
    <nav className="topnav">
      <div className="topnav__brand">DevPulse</div>
      <div className="topnav__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={view === tab.id ? 'topnav__tab topnav__tab--active' : 'topnav__tab'}
            onClick={() => {
              onChange(tab.id);
            }}
            aria-current={view === tab.id ? 'page' : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <SyncControl />
      <div className="topnav__user">
        <span className="topnav__login">{viewerLogin ? `@${viewerLogin}` : 'Verifying…'}</span>
        <button type="button" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
