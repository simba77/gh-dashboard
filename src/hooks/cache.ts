import { logger } from '../lib/logger';

// Stored shape: arbitrary JSON-serialisable payload with the wall-clock time
// it was written, so consumers can render "updated N ago" on cache hits.
export interface CachedEntry<T> {
  items: T;
  savedAt: number;
}

const STORAGE_PREFIX = 'cache:';

export function readCache<T>(key: string): CachedEntry<T> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as CachedEntry<T>;
  } catch (e) {
    logger.warn('cache read failed', e);
    return null;
  }
}

export function writeCache(key: string, items: unknown): void {
  try {
    const entry: CachedEntry<unknown> = { items, savedAt: Date.now() };
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    logger.warn('cache write failed', e);
  }
}
