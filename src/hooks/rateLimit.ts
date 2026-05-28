import { listen } from '@tauri-apps/api/event';
import { useEffect, useSyncExternalStore } from 'react';

import { logger } from '../lib/logger';

export type RateLimitKind = 'primary' | 'secondary' | 'graphql';

interface Pause {
  kind: RateLimitKind;
  until: Date;
}

interface State {
  remaining: number | null;
  resetAt: Date | null;
  pause: Pause | null;
}

interface Payload {
  remaining: number | null;
  reset_at: number | null;
  pause: { kind: RateLimitKind; until: number } | null;
}

let state: State = { remaining: null, resetAt: null, pause: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): State {
  return state;
}

// One Tauri event subscription per process — set up the first time a consumer
// mounts. `listen` returns an unlisten fn we don't need to call: the bridge
// lives as long as the app.
let initialized = false;
function init(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  listen<Payload>('rate-limit', (event) => {
    const { remaining, reset_at, pause } = event.payload;
    state = {
      remaining,
      resetAt: reset_at !== null ? new Date(reset_at * 1000) : null,
      pause: pause ? { kind: pause.kind, until: new Date(pause.until * 1000) } : null,
    };
    emit();
  }).catch((e: unknown) => {
    logger.error('Failed to subscribe to rate-limit events', e);
  });
}

export interface RateLimit {
  remaining: number | null;
  resetAt: Date | null;
  // Non-null only while we're actually blocked. Hooks check this to decide
  // whether to skip polling; the banner uses it to render the warning.
  pausedUntil: Date | null;
  pauseKind: RateLimitKind | null;
}

export function useRateLimit(): RateLimit {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    init();
  }, []);

  // A stale `pause` whose `until` has already passed should read as "not
  // paused" until the next event clears it explicitly. The next request will
  // re-emit and either confirm the pause or drop it.
  const { pause } = snapshot;
  const active = pause && pause.until.getTime() > Date.now() ? pause : null;

  return {
    remaining: snapshot.remaining,
    resetAt: snapshot.resetAt,
    pausedUntil: active?.until ?? null,
    pauseKind: active?.kind ?? null,
  };
}
