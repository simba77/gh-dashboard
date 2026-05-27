import { useCallback, useEffect, useState } from 'react';

import { logger } from '../lib/logger';
import type { DeviceCode } from './deviceFlow';
import { pollDeviceFlow, startDeviceFlow } from './deviceFlow';
import { clearToken, hasToken } from './tokenStorage';

type Status = 'loading' | 'unauthenticated' | 'authenticated';

export interface AuthState {
  status: Status;
  // Set while a device flow is in progress, for the UI to display.
  deviceCode: DeviceCode | null;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAuth(): AuthState {
  const [status, setStatus] = useState<Status>('loading');
  const [deviceCode, setDeviceCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hasToken()
      .then((present) => {
        setStatus(present ? 'authenticated' : 'unauthenticated');
      })
      .catch((e: unknown) => {
        logger.error('Failed to read auth state', e);
        setStatus('unauthenticated');
      });
  }, []);

  const login = useCallback(async () => {
    setError(null);
    try {
      const code = await startDeviceFlow();
      setDeviceCode(code);
      await pollDeviceFlow(code.device_code, code.interval);
      setStatus('authenticated');
    } catch (e) {
      setError(toMessage(e));
    } finally {
      setDeviceCode(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await clearToken();
    } catch (e) {
      logger.error('Logout failed', e);
    } finally {
      setStatus('unauthenticated');
    }
  }, []);

  return { status, deviceCode, error, login, logout };
}
