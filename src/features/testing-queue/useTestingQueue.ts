import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProjectTestingItems, type TestingItem } from '../../api/queries/projectTestingItems';
import { logger } from '../../lib/logger';
import { loadSettings } from '../../settings/settingsStore';

interface TestingQueueState {
  items: TestingItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Aggregates "Testing" items from every tracked project across the user's
// configured organizations. One broken project shouldn't hide the others, so
// failures are collected via allSettled and surfaced as a single error line.
export function useTestingQueue(viewerLogin: string | null): TestingQueueState {
  const [items, setItems] = useState<TestingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Ref-based cancellation so post-await checks aren't narrowed away by TS.
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
          projectIds.map((id) => fetchProjectTestingItems(id, viewerLogin)),
        );
        if (!activeRef.current) {
          return;
        }

        const collected: TestingItem[] = [];
        const failures: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            collected.push(...r.value);
          } else {
            const msg = toMessage(r.reason);
            failures.push(msg);
            logger.error('Failed to load project testing items', r.reason);
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
        logger.error('Failed to load testing queue', e);
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
