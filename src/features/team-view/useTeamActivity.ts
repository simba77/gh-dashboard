import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProjectActiveItems, type ActiveItem } from '../../api/queries/projectActiveItems';
import { logger } from '../../lib/logger';
import { loadSettings } from '../../settings/settingsStore';

interface TeamActivityState {
  items: ActiveItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Pulls all in-flight items from every tracked project. The TeamScreen groups
// them by assignee to build per-person workload cards.
export function useTeamActivity(): TeamActivityState {
  const [items, setItems] = useState<ActiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const settings = await loadSettings();
        const projectIds = settings.orgs.flatMap((o) => o.projects.map((p) => p.id));

        const results = await Promise.allSettled(
          projectIds.map((id) => fetchProjectActiveItems(id)),
        );
        if (!activeRef.current) {
          return;
        }

        const collected: ActiveItem[] = [];
        const failures: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            collected.push(...r.value);
          } else {
            failures.push(toMessage(r.reason));
            logger.error('Failed to load active items', r.reason);
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
        logger.error('Failed to load team activity', e);
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
  }, [tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { items, loading, error, refresh };
}
