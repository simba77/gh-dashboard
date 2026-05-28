import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProjectKanban, type KanbanBoard } from '../../api/queries/projectKanban';
import { readCache, writeCache } from '../../hooks/cache';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';

const POLL_INTERVAL_MS = 60_000;
const RESUME_PAD_MS = 500;
const CACHE_PREFIX = 'kanban:';

interface ProjectKanbanState {
  board: KanbanBoard | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  paused: boolean;
  refresh: () => void;
}

function formatPause(until: Date): string {
  return `Paused — rate limit resets at ${until.toLocaleTimeString()}`;
}

// Fetches the kanban board for a single project, polls every 60s, persists
// the last-known board per projectId and pauses while rate-limited. null
// `projectId` resets state (used while settings load).
export function useProjectKanban(projectId: string | null): ProjectKanbanState {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);
  const { pausedUntil } = useRateLimit();
  const pausedAtMs = pausedUntil?.getTime() ?? 0;

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
    const now = Date.now();
    if (pausedAtMs > now) {
      setLoading(false);
      // Paint a cached board if we have one so the user isn't staring at
      // a blank tab while paused. Surface the pause as an error only when
      // there's nothing to show — otherwise the global banner is enough.
      const cached = readCache<KanbanBoard>(cacheKey);
      if (cached) {
        setBoard(cached.items);
        setLastUpdated(new Date(cached.savedAt));
        setError(null);
      } else {
        setBoard(null);
        setLastUpdated(null);
        setError(formatPause(new Date(pausedAtMs)));
      }
      const wakeTimer = window.setTimeout(
        () => {
          setTick((t) => t + 1);
        },
        pausedAtMs - now + RESUME_PAD_MS,
      );
      return () => {
        window.clearTimeout(wakeTimer);
      };
    }

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
  }, [projectId, tick, pausedAtMs]);

  const refresh = useCallback(() => {
    if (pausedAtMs > Date.now()) {
      return;
    }
    setTick((t) => t + 1);
  }, [pausedAtMs]);

  return { board, loading, error, lastUpdated, paused: pausedAtMs > Date.now(), refresh };
}
