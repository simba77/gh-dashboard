import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { logger } from '../lib/logger';
import { readCache, writeCache } from './cache';
import { useRateLimit } from './rateLimit';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
// Tiny pad so we don't wake up a hair before the reset and immediately bounce.
const RESUME_PAD_MS = 500;

export interface FanoutState<V> {
  items: V[];
  loading: boolean;
  error: string | null;
  // Wall-clock time of the most recent successful fetch (or cache hit on boot).
  // null until the first successful load.
  lastUpdated: Date | null;
  // True while polling is held off because we're rate-limited. Widgets use
  // this to disable Refresh and to label `UpdatedAgo` as stale.
  paused: boolean;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatPause(until: Date): string {
  return `Paused — rate limit resets at ${until.toLocaleTimeString()}`;
}

// Generalises the recurring shape "load a list of keys, fetch each in parallel
// with Promise.allSettled, concat fulfilled, surface rejections as one line".
// `skip` keeps the hook in the loading state without fetching (used when a
// required input like the viewer login hasn't arrived yet).
// `cacheKey` enables localStorage-backed instant render on boot and writes
// fresh results after every successful fetch. Assumed stable for the hook's
// lifetime — changing it mid-life won't switch caches.
export function useFanout<K, V>(
  loadKeys: () => Promise<K[]>,
  fetchOne: (key: K) => Promise<V[]>,
  noun: string,
  deps: DependencyList,
  skip = false,
  cacheKey?: string,
  // 0 disables polling entirely (fetch once on mount, then only on explicit
  // `refresh()`). The post-rate-limit wake-up still fires so a throttled first
  // load eventually completes.
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
): FanoutState<V> {
  const [items, setItems] = useState<V[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);
  // Mirror of items.length so the pause branch below can decide whether to
  // surface a pause-as-error without depending on `items` and re-running the
  // whole fetch effect every time results change.
  const hasItemsRef = useRef(false);
  hasItemsRef.current = items.length > 0;
  const { pausedUntil } = useRateLimit();
  // Date instance is stable across renders unless state updates, so this is
  // a cheap dep value that only changes when pause state actually changes.
  const pausedAtMs = pausedUntil?.getTime() ?? 0;

  useEffect(() => {
    if (skip) {
      return;
    }
    activeRef.current = true;

    // Hold off the fetch entirely while we're rate-limited; wake up just after
    // the reset and bump tick so the effect re-runs and goes through the
    // normal fetch+poll path. When there's no prior data to keep showing,
    // surface the pause as an error so the widget renders a reason instead of
    // an empty block. We don't set it unconditionally — if cached items are
    // visible, the global banner is enough and a duplicate red line is noise.
    const now = Date.now();
    if (pausedAtMs > now) {
      setLoading(false);
      if (!hasItemsRef.current) {
        setError(formatPause(new Date(pausedAtMs)));
      }
      const wakeIn = pausedAtMs - now + RESUME_PAD_MS;
      const wakeTimer = window.setTimeout(() => {
        setTick((t) => t + 1);
      }, wakeIn);
      return () => {
        window.clearTimeout(wakeTimer);
      };
    }

    // Cache hit before fetch: paint immediately, then refresh in the
    // background. The refresh button stays disabled while loading=true.
    if (cacheKey) {
      const cached = readCache<V[]>(cacheKey);
      if (cached) {
        setItems(cached.items);
        setLastUpdated(new Date(cached.savedAt));
      }
    }
    setLoading(true);

    let timerId: number | undefined;

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
        setLastUpdated(new Date());
        if (cacheKey) {
          writeCache(cacheKey, collected);
        }
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
          if (pollIntervalMs > 0) {
            // Schedule the next poll only after this fetch finished, so polls
            // never overlap. Manual refresh bumps `tick`, re-runs the effect,
            // and the cleanup below clears this interval before a new one is
            // scheduled — so the cadence naturally resets on every refresh.
            timerId = window.setInterval(() => {
              setTick((t) => t + 1);
            }, pollIntervalMs);
          }
        }
      }
    })();

    return () => {
      activeRef.current = false;
      if (timerId !== undefined) {
        window.clearInterval(timerId);
      }
    };
    // The caller owns deps and passes stable `loadKeys`/`fetchOne` closures —
    // we re-run when the caller's deps change. `cacheKey`/`noun` are constant
    // by contract; including them would force the user to memoise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, skip, pausedAtMs, ...deps]);

  const refresh = useCallback(() => {
    // Drop manual refresh attempts while paused — otherwise the user can
    // dig the quota further into the floor.
    if (pausedAtMs > Date.now()) {
      return;
    }
    setTick((t) => t + 1);
  }, [pausedAtMs]);

  return { items, loading, error, lastUpdated, paused: pausedAtMs > Date.now(), refresh };
}
