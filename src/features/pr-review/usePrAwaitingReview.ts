import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchPrsAwaitingReview, type PrAwaitingReview } from '../../api/queries/prAwaitingReview';
import { readCache, writeCache } from '../../hooks/cache';
import { useRateLimit } from '../../hooks/rateLimit';
import { logger } from '../../lib/logger';

const POLL_INTERVAL_MS = 60_000;
const RESUME_PAD_MS = 500;
const CACHE_KEY = 'pr-awaiting-review';

interface PrAwaitingReviewState {
  prs: PrAwaitingReview[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

// Owns the query for the "PRs awaiting my review" widget. Mirrors the
// cache+poll+lastUpdated+pause pattern of useFanout but without fan-out —
// there's only one underlying GraphQL call.
export function usePrAwaitingReview(): PrAwaitingReviewState {
  const [prs, setPrs] = useState<PrAwaitingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);
  const { pausedUntil } = useRateLimit();
  const pausedAtMs = pausedUntil?.getTime() ?? 0;

  useEffect(() => {
    activeRef.current = true;

    const now = Date.now();
    if (pausedAtMs > now) {
      setLoading(false);
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

    const cached = readCache<PrAwaitingReview[]>(CACHE_KEY);
    if (cached) {
      setPrs(cached.items);
      setLastUpdated(new Date(cached.savedAt));
    }
    setLoading(true);

    let timerId: number | undefined;

    fetchPrsAwaitingReview()
      .then((next) => {
        if (!activeRef.current) {
          return;
        }
        setPrs(next);
        setLastUpdated(new Date());
        setError(null);
        writeCache(CACHE_KEY, next);
      })
      .catch((e: unknown) => {
        if (!activeRef.current) {
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        logger.error('Failed to fetch PRs awaiting review', e);
        setError(message);
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
  }, [tick, pausedAtMs]);

  const refresh = useCallback(() => {
    if (pausedAtMs > Date.now()) {
      return;
    }
    setTick((t) => t + 1);
  }, [pausedAtMs]);

  return { prs, loading, error, lastUpdated, refresh };
}
