import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchProjectAssignedItems,
  type AssignedItem,
} from '../../api/queries/projectAssignedItems';
import { logger } from '../../lib/logger';
import { loadSettings } from '../../settings/settingsStore';

interface AssignedByMeState {
  items: AssignedItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Aggregates "items I created that are now delegated" across every tracked
// project. Same pattern as useTestingQueue — failures of individual projects
// don't hide the others.
export function useAssignedByMe(viewerLogin: string | null): AssignedByMeState {
  const [items, setItems] = useState<AssignedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    if (!viewerLogin) {
      return;
    }
    activeRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const settings = await loadSettings();
        const projectIds = settings.orgs.flatMap((o) => o.projects.map((p) => p.id));

        const results = await Promise.allSettled(
          projectIds.map((id) => fetchProjectAssignedItems(id, viewerLogin)),
        );
        if (!activeRef.current) {
          return;
        }

        const collected: AssignedItem[] = [];
        const failures: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            collected.push(...r.value);
          } else {
            failures.push(toMessage(r.reason));
            logger.error('Failed to load project assigned items', r.reason);
          }
        }

        setItems(collected);
        const first = failures[0] ?? '';
        setError(
          failures.length === 0
            ? null
            : failures.length === 1
              ? first
              : `${String(failures.length)} projects failed to load: ${first}`,
        );
      } catch (e) {
        if (!activeRef.current) {
          return;
        }
        logger.error('Failed to load assigned-by-me items', e);
        setError(toMessage(e));
      } finally {
        if (activeRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      activeRef.current = false;
    };
  }, [viewerLogin, tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { items, loading, error, refresh };
}
