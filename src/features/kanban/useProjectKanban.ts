import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProjectKanban, type KanbanBoard } from '../../api/queries/projectKanban';
import { readCache, writeCache } from '../../hooks/cache';
import { logger } from '../../lib/logger';

const POLL_INTERVAL_MS = 60_000;
const CACHE_PREFIX = 'kanban:';

interface ProjectKanbanState {
  board: KanbanBoard | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

// Fetches the kanban board for a single project, polls every 60s and persists
// the last-known board per projectId so switching back to a tab feels instant.
// null `projectId` resets state (used while settings load).
export function useProjectKanban(projectId: string | null): ProjectKanbanState {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    if (!projectId) {
      setBoard(null);
      setLoading(false);
      setError(null);
      setLastUpdated(null);
      return;
    }
    activeRef.current = true;

    const cacheKey = CACHE_PREFIX + projectId;
    const cached = readCache<KanbanBoard>(cacheKey);
    if (cached) {
      setBoard(cached.items);
      setLastUpdated(new Date(cached.savedAt));
    } else {
      setBoard(null);
      setLastUpdated(null);
    }
    setLoading(true);

    let timerId: number | undefined;

    fetchProjectKanban(projectId)
      .then((next) => {
        if (!activeRef.current) {
          return;
        }
        setBoard(next);
        setLastUpdated(new Date());
        setError(null);
        writeCache(cacheKey, next);
      })
      .catch((e: unknown) => {
        if (!activeRef.current) {
          return;
        }
        logger.error('Failed to load kanban', e);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (activeRef.current) {
          setLoading(false);
          timerId = window.setInterval(() => {
            setTick((t) => t + 1);
          }, POLL_INTERVAL_MS);
        }
      });

    return () => {
      activeRef.current = false;
      if (timerId !== undefined) {
        window.clearInterval(timerId);
      }
    };
  }, [projectId, tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { board, loading, error, lastUpdated, refresh };
}
