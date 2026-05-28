import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProjectKanban, type KanbanBoard } from '../../api/queries/projectKanban';
import { logger } from '../../lib/logger';

interface ProjectKanbanState {
  board: KanbanBoard | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Fetches the kanban board for a single project. Refetches when the active
// project changes; null `projectId` resets state (used while settings load).
export function useProjectKanban(projectId: string | null): ProjectKanbanState {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    if (!projectId) {
      setBoard(null);
      setLoading(false);
      setError(null);
      return;
    }
    activeRef.current = true;
    setLoading(true);

    fetchProjectKanban(projectId)
      .then((next) => {
        if (activeRef.current) {
          setBoard(next);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!activeRef.current) {
          return;
        }
        logger.error('Failed to load kanban', e);
        setError(toMessage(e));
      })
      .finally(() => {
        if (activeRef.current) {
          setLoading(false);
        }
      });

    return () => {
      activeRef.current = false;
    };
  }, [projectId, tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { board, loading, error, refresh };
}
