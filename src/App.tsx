import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useViewer } from './auth/useViewer';
import './App.css';

function Authenticated({ onLogout }: { onLogout: () => Promise<void> }) {
  const { login, error } = useViewer();

  return (
    <main className="app">
      <header className="app__header">
        <span>{login ? `Signed in as ${login}` : 'Verifying…'}</span>
        <button
          type="button"
          onClick={() => {
            void onLogout();
          }}
        >
          Sign out
        </button>
      </header>
      {error ? <p className="login__error">{error}</p> : null}
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
