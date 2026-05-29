import { useCallback, useSyncExternalStore } from 'react';

import { useRateLimit } from '../hooks/rateLimit';
import { logger } from '../lib/logger';
import { getLastSyncAt, subscribeItems } from '../sync/itemStore';
import { getInFlight, refreshAll, subscribeInFlight } from '../sync/orchestrator';
import { UpdatedAgo } from './UpdatedAgo';

// Single app-wide refresh for every orchestrator-backed widget (My tasks,
// Testing, Assigned by me, Kanban). They all share one sync pass and one
// in-flight flag, so a per-widget button only ever duplicated this control.
// The PR-review widget keeps its own button — it polls independently of the
// orchestrator.
export function SyncControl() {
  const { pausedUntil } = useRateLimit();
  const loading = useSyncExternalStore(subscribeInFlight, getInFlight);
  const lastSyncAt = useSyncExternalStore(subscribeItems, getLastSyncAt);
  const paused = (pausedUntil?.getTime() ?? 0) > Date.now();
  const pauseTitle = pausedUntil
    ? `Rate-limited until ${pausedUntil.toLocaleTimeString()}`
    : undefined;

  const refresh = useCallback(() => {
    refreshAll().catch((e: unknown) => {
      logger.error('Refresh failed', e);
    });
  }, []);

  return (
    <div className="topnav__sync">
      <UpdatedAgo at={lastSyncAt ? new Date(lastSyncAt) : null} paused={paused} />
      <button type="button" onClick={refresh} disabled={loading || paused} title={pauseTitle}>
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
