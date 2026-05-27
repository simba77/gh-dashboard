import { useEffect, useState } from 'react';

import { fetchViewer } from '../api/queries/viewer';
import { logger } from '../lib/logger';

interface ViewerState {
  login: string | null;
  error: string | null;
}

// Resolves the authenticated user's login, confirming the stored token works.
export function useViewer(): ViewerState {
  const [state, setState] = useState<ViewerState>({ login: null, error: null });

  useEffect(() => {
    fetchViewer()
      .then((data) => {
        setState({ login: data.viewer.login, error: null });
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        logger.error('Failed to fetch viewer', e);
        setState({ login: null, error: message });
      });
  }, []);

  return state;
}
