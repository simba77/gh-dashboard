import { useEffect } from 'react';

import { useRateLimit } from '../hooks/rateLimit';
import { bumpGeneration, getGeneration, paintFromCache, runSyncPass } from './orchestrator';

// Delay between the end of one sync pass and the start of the next. Recursive
// setTimeout (not setInterval) is intentional — for a 47-project org one pass
// can take 50–70s, and a fixed-interval timer would queue another pass on top
// before the previous finished. Sequential scheduling keeps load predictable.
const POLL_INTERVAL_MS = 60_000;
const RESUME_PAD_MS = 500;

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

    let nextTimer: number | undefined;

    // Run-then-wait loop. Re-entry only after the prior pass resolves, so two
    // sync passes can never run at the same time even if a pass exceeds the
    // poll interval. Cancellation: cleanup bumps the generation, the tick
    // bails out at its next check.
    const tick = async (trigger: string): Promise<void> => {
      await runSyncPass(gen, trigger);
      if (gen !== getGeneration()) {
        return;
      }
      nextTimer = window.setTimeout(() => {
        void tick('poll');
      }, POLL_INTERVAL_MS);
    };

    // Boot ordering: paint cache → first sync → schedule next. A returning
    // user sees their last-known state instantly.
    void paintFromCache().then(() => tick('boot'));

    return () => {
      bumpGeneration();
      if (nextTimer !== undefined) {
        window.clearTimeout(nextTimer);
      }
    };
  }, [enabled, pausedAtMs]);
}
