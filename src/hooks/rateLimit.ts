import { listen } from '@tauri-apps/api/event';
import { useEffect, useSyncExternalStore } from 'react';

import { logger } from '../lib/logger';

// When `remaining` drops below this floor, polling pauses until `resetAt`.
// Matches the floor used Rust-side for the warning log.
const FLOOR = 100;

interface State {
  remaining: number | null;
  resetAt: Date | null;
}

interface Payload {
  remaining: number;
  // Unix epoch seconds — Rust uses GitHub's header value as-is.
  reset_at: number;
}

let state: State = { remaining: null, resetAt: null };
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
    state = {
      remaining: event.payload.remaining,
      resetAt: new Date(event.payload.reset_at * 1000),
    };
    emit();
  }).catch((e: unknown) => {
    logger.error('Failed to subscribe to rate-limit events', e);
  });
}

export interface RateLimit extends State {
  // Non-null only while we're under the floor — hooks check this to decide
  // whether to skip polling. Setting to `null` resumes normal cadence.
  pausedUntil: Date | null;
}

export function useRateLimit(): RateLimit {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    init();
  }, []);

  const pausedUntil =
    snapshot.remaining !== null && snapshot.remaining < FLOOR && snapshot.resetAt
      ? snapshot.resetAt
      : null;

  return { ...snapshot, pausedUntil };
}
