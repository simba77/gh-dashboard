import { openUrl } from '@tauri-apps/plugin-opener';
import { useState } from 'react';

import { logger } from '../lib/logger';
import type { DeviceCode } from './deviceFlow';

interface LoginScreenProps {
  deviceCode: DeviceCode | null;
  error: string | null;
  onLogin: () => Promise<void>;
}

export function LoginScreen({ deviceCode, error, onLogin }: LoginScreenProps) {
  const [starting, setStarting] = useState(false);

  function handleLogin() {
    setStarting(true);
    void onLogin().finally(() => {
      setStarting(false);
    });
  }

  function handleOpen(uri: string) {
    openUrl(uri).catch((e: unknown) => {
      logger.error('Failed to open verification URL', e);
    });
  }

  return (
    <main className="login">
      <h1>DevPulse</h1>

      {deviceCode ? (
        <div className="login__code">
          <p>Enter this code on GitHub to authorize:</p>
          <code className="login__user-code">{deviceCode.user_code}</code>
          <button
            type="button"
            onClick={() => {
              handleOpen(deviceCode.verification_uri);
            }}
          >
            Open GitHub
          </button>
          <p className="login__hint">Waiting for authorization…</p>
        </div>
      ) : (
        <button type="button" disabled={starting} onClick={handleLogin}>
          {starting ? 'Starting…' : 'Sign in with GitHub'}
        </button>
      )}

      {error ? <p className="login__error">{error}</p> : null}
    </main>
  );
}
