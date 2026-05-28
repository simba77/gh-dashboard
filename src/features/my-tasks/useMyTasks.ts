import { useCallback, useSyncExternalStore } from 'react';

import type { ProjectItemRow } from '../../db/projectItems';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';
import { getLastSyncAt, subscribeItems } from '../../sync/itemStore';
import { getInFlight, refreshAll, subscribeInFlight } from '../../sync/orchestrator';
import { useItems } from '../../sync/useItems';

// Items in Testing are surfaced by the dedicated "Testing waiting for me"
// widget (where I'm the originator). Excluding them here keeps the two
// dashboard lists meaningfully distinct.
const EXCLUDE_STATUS = new Set(['testing']);

export interface MyTask {
  itemId: string;
  projectTitle: string;
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  isDraft: boolean;
  status: string | null;
}

export interface MyTasksState {
  items: MyTask[];
  loading: boolean;
  lastUpdated: Date | null;
  paused: boolean;
  refresh: () => void;
}

function toMyTask(row: ProjectItemRow): MyTask {
  return {
    itemId: row.itemId,
    projectTitle: row.projectTitle,
    title: row.title,
    url: row.url,
    number: row.number,
    repository: row.repository,
    isDraft: row.isDraft,
    status: row.status,
  };
}

// "Tasks assigned to me that aren't done and aren't in Testing" — i.e. the
// work currently on my plate. Filters in SQL would be cleaner but the assignee
// list is JSON, so we sift in TS instead. Cost is negligible compared to the
// sync round-trip we save by sharing the cache.
export function useMyTasks(viewerLogin: string | null): MyTasksState {
  const { pausedUntil } = useRateLimit();
  const items = useItems(
    (rows) => {
      if (!viewerLogin) {
        return [];
      }
      return rows
        .filter((r) => {
          if (!r.assignees.includes(viewerLogin)) {
            return false;
          }
          // Drop closed Issues/PRs even when the board's Status field wasn't
          // moved to a terminal column (a common drift in real-world boards).
          // DraftIssue has no state, so we keep it whenever Status allows.
          if (r.contentState === 'CLOSED' || r.contentState === 'MERGED') {
            return false;
          }
          const status = r.status?.toLowerCase();
          return status === undefined || !EXCLUDE_STATUS.has(status);
        })
        .map(toMyTask);
    },
    [viewerLogin],
  );
  const loading = useSyncExternalStore(subscribeInFlight, getInFlight);
  const lastSyncAt = useSyncExternalStore(subscribeItems, getLastSyncAt);
  const refresh = useCallback(() => {
    refreshAll().catch((e: unknown) => {
      logger.error('Refresh failed', e);
    });
  }, []);

  return {
    items,
    loading,
    lastUpdated: lastSyncAt ? new Date(lastSyncAt) : null,
    paused: (pausedUntil?.getTime() ?? 0) > Date.now(),
    refresh,
  };
}
