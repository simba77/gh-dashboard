import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { logger } from '../lib/logger';

export interface FanoutState<V> {
  items: V[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Generalises the recurring shape "load a list of keys, fetch each in parallel
// with Promise.allSettled, concat fulfilled, surface rejections as one line".
// `skip` keeps the hook in the loading state without fetching (used when a
// required input like the viewer login hasn't arrived yet).
export function useFanout<K, V>(
  loadKeys: () => Promise<K[]>,
  fetchOne: (key: K) => Promise<V[]>,
  noun: string,
  deps: DependencyList,
  skip = false,
): FanoutState<V> {
  const [items, setItems] = useState<V[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    if (skip) {
      return;
    }
    activeRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const keys = await loadKeys();
        const results = await Promise.allSettled(keys.map((k) => fetchOne(k)));
        if (!activeRef.current) {
          return;
        }

        const collected: V[] = [];
        const failures: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            collected.push(...r.value);
          } else {
            failures.push(toMessage(r.reason));
            logger.error(`Failed to load ${noun}`, r.reason);
          }
        }

        setItems(collected);
        const first = failures[0] ?? '';
        setError(
          failures.length === 0
            ? null
            : failures.length === 1
              ? first
              : `${String(failures.length)} ${noun} failed to load: ${first}`,
        );
      } catch (e) {
        if (!activeRef.current) {
          return;
        }
        logger.error(`Failed to load ${noun}`, e);
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
    // The caller owns deps and passes stable `loadKeys`/`fetchOne` (closures
    // captured per-render are fine — we re-run when the caller's deps change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, skip, ...deps]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { items, loading, error, refresh };
}
