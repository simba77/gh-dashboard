import { useEffect } from 'react';

import { useRateLimit } from '../hooks/rateLimit';
import { bumpGeneration, paintFromCache, runSyncPass } from './orchestrator';

const POLL_INTERVAL_MS = 60_000;
const RESUME_PAD_MS = 500;

// Mount once at the app shell. Starts the polling loop and hands every cycle
// to the orchestrator, which fan-outs over tracked projects.
export function useProjectSync(enabled: boolean): void {
  const { pausedUntil } = useRateLimit();
  const pausedAtMs = pausedUntil?.getTime() ?? 0;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const gen = bumpGeneration();

    if (pausedAtMs > Date.now()) {
      // Paint whatever the DB already has so widgets render; resume syncing
      // by re-running this effect once the pause clears.
      void paintFromCache();
      const wakeTimer = window.setTimeout(
        () => {
          bumpGeneration();
        },
        pausedAtMs - Date.now() + RESUME_PAD_MS,
      );
      return () => {
        window.clearTimeout(wakeTimer);
      };
    }

    // Boot ordering: paint cache → first sync → poll. A returning user sees
    // their last-known state instantly; a fresh-install user sees the same
    // brief empty state they would have anyway.
    void paintFromCache().then(() => runSyncPass(gen));
    const timerId = window.setInterval(() => {
      void runSyncPass(gen);
    }, POLL_INTERVAL_MS);

    return () => {
      bumpGeneration();
      window.clearInterval(timerId);
    };
  }, [enabled, pausedAtMs]);
}
