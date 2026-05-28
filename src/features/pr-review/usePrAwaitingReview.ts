import { useCallback, useEffect, useState } from 'react';

import { fetchPrsAwaitingReview, type PrAwaitingReview } from '../../api/queries/prAwaitingReview';
import { logger } from '../../lib/logger';

interface PrAwaitingReviewState {
  prs: PrAwaitingReview[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// Owns the query for the "PRs awaiting my review" widget. Polling and caching
// land in Stage 5; for now this fetches on mount and on manual refresh.
export function usePrAwaitingReview(): PrAwaitingReviewState {
  const [prs, setPrs] = useState<PrAwaitingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchPrsAwaitingReview()
      .then((next) => {
        if (active) {
          setPrs(next);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!active) {
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        logger.error('Failed to fetch PRs awaiting review', e);
        setError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { prs, loading, error, refresh };
}
