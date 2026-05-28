import { useCallback, useSyncExternalStore } from 'react';

import type { ProjectItemRow } from '../../db/projectItems';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';
import { getLastSyncAt, subscribeItems } from '../../sync/itemStore';
import { getInFlight, refreshAll, subscribeInFlight } from '../../sync/orchestrator';
import { useItems } from '../../sync/useItems';

export interface AssignedItem {
  itemId: string;
  projectTitle: string;
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  isDraft: boolean;
  status: string | null;
  // Viewer login is stripped — the widget answers "who's working on it?", and
  // mentioning the viewer themselves is noise.
  assignees: string[];
}

export interface AssignedByMeState {
  items: AssignedItem[];
  loading: boolean;
  lastUpdated: Date | null;
  paused: boolean;
  refresh: () => void;
}

// "Tasks I delegated" = items I authored that are still in flight and someone
// other than me is assigned. Matches the workflow where the постановщик hands
// off work and wants to track its progress without managing it directly.
export function useAssignedByMe(viewerLogin: string | null): AssignedByMeState {
  const { pausedUntil } = useRateLimit();
  const items = useItems(
    (rows): AssignedItem[] => {
      if (!viewerLogin) {
        return [];
      }
      const out: AssignedItem[] = [];
      for (const r of rows) {
        if (r.author !== viewerLogin) continue;
        if (r.contentState === 'CLOSED' || r.contentState === 'MERGED') continue;
        const others = r.assignees.filter((a: string) => a !== viewerLogin);
        // Self-assigned items belong in "My open tasks", not here.
        if (others.length === 0) continue;
        out.push({
          itemId: r.itemId,
          projectTitle: r.projectTitle,
          title: r.title,
          url: r.url,
          number: r.number,
          repository: r.repository,
          isDraft: r.isDraft,
          status: r.status,
          assignees: others,
        });
      }
      return out;
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

// Re-export for convenience so widgets needn't reach into ProjectItemRow.
export type { ProjectItemRow };
