import { useCallback, useSyncExternalStore } from 'react';

import type { ProjectItemRow } from '../../db/projectItems';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';
import { getInFlight, refreshAll, subscribeInFlight } from '../../sync/orchestrator';
import { getLastSyncAt, subscribeItems } from '../../sync/itemStore';
import { useItems } from '../../sync/useItems';

// Conventional status name — must match the option label on the project board.
// Items with a different `status` value (or none) won't appear here.
const STATUS_TESTING = 'Testing';

export interface TestingItem {
  itemId: string;
  projectTitle: string;
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  isDraft: boolean;
  assignees: string[];
}

export interface TestingQueueState {
  items: TestingItem[];
  loading: boolean;
  lastUpdated: Date | null;
  paused: boolean;
  refresh: () => void;
}

function toTestingItem(row: ProjectItemRow): TestingItem {
  return {
    itemId: row.itemId,
    projectTitle: row.projectTitle,
    title: row.title,
    url: row.url,
    number: row.number,
    repository: row.repository,
    isDraft: row.isDraft,
    assignees: row.assignees,
  };
}

// "Tasks in Testing waiting for me" = items with Status=Testing where I'm the
// originator (author for Issue/PR, creator for DraftIssue). The assignee stays
// as the developer; the author verifies. All filtering is local — the sync
// layer keeps the cache fresh in the background.
export function useTestingQueue(viewerLogin: string | null): TestingQueueState {
  const { pausedUntil } = useRateLimit();
  const items = useItems(
    (rows) => {
      if (!viewerLogin) {
        return [];
      }
      return rows
        .filter((r) => r.status === STATUS_TESTING && r.author === viewerLogin)
        .map(toTestingItem);
    },
    [viewerLogin],
  );
  const loading = useSyncExternalStore(subscribeInFlight, getInFlight);
  // lastSyncAt is bumped alongside the snapshot in itemStore, so we subscribe
  // to the items channel rather than the inFlight one.
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
