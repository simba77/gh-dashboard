import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { ProjectItemRow } from '../../db/projectItems';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';
import { loadSettings } from '../../settings/settingsStore';
import { getLastSyncAt, subscribeItems } from '../../sync/itemStore';
import { getInFlight, refreshAll, subscribeInFlight } from '../../sync/orchestrator';
import { useItems } from '../../sync/useItems';

export interface TeamActivityItem {
  itemId: string;
  projectTitle: string;
  title: string;
  url: string | null;
  number: number | null;
  isDraft: boolean;
  assignees: string[];
  status: string | null;
}

export interface TeamActivityState {
  items: TeamActivityItem[];
  loading: boolean;
  lastUpdated: Date | null;
  paused: boolean;
  refresh: () => void;
}

function toItem(row: ProjectItemRow): TeamActivityItem {
  return {
    itemId: row.itemId,
    projectTitle: row.projectTitle,
    title: row.title,
    url: row.url,
    number: row.number,
    isDraft: row.isDraft,
    assignees: row.assignees,
    status: row.status,
  };
}

// "Active items across the team's projects" = everything still in flight on
// any project not excluded from the team view. Drives the per-person columns
// on the Team screen. Reads `teamExcludedProjectIds` from settings on mount —
// changing the set requires reloading the screen, which is fine for v1.
export function useTeamActivity(): TeamActivityState {
  const { pausedUntil } = useRateLimit();
  const [includedProjects, setIncludedProjects] = useState<Set<string> | null>(null);

  useEffect(() => {
    loadSettings()
      .then((settings) => {
        const ids = new Set<string>();
        for (const org of settings.orgs) {
          const excluded = new Set(org.teamExcludedProjectIds);
          for (const p of org.projects) {
            if (!excluded.has(p.id)) {
              ids.add(p.id);
            }
          }
        }
        setIncludedProjects(ids);
      })
      .catch((e: unknown) => {
        logger.error('Failed to load team-excluded settings', e);
      });
  }, []);

  const items = useItems(
    (rows): TeamActivityItem[] => {
      if (!includedProjects) {
        return [];
      }
      const out: TeamActivityItem[] = [];
      for (const r of rows) {
        if (!includedProjects.has(r.projectId)) continue;
        if (r.contentState === 'CLOSED' || r.contentState === 'MERGED') continue;
        out.push(toItem(r));
      }
      return out;
    },
    [includedProjects],
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
