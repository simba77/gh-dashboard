import { logger } from '../lib/logger';
import { loadSettings } from '../settings/settingsStore';
import { reloadFromDb } from './itemStore';
import { syncProject } from './projectSync';

// Module-level generation guard. Bumped on mount/unmount and on rate-limit
// resume; any in-flight pass that observes a stale generation bails out.
let generation = 0;
// Set while a pass is running so the Refresh button can avoid stacking work
// or showing a stale "loading" state.
let inFlight = false;
const inFlightListeners = new Set<() => void>();

export function bumpGeneration(): number {
  generation += 1;
  return generation;
}

export function getInFlight(): boolean {
  return inFlight;
}

export function subscribeInFlight(l: () => void): () => void {
  inFlightListeners.add(l);
  return () => {
    inFlightListeners.delete(l);
  };
}

function setInFlight(next: boolean): void {
  if (inFlight === next) {
    return;
  }
  inFlight = next;
  for (const l of inFlightListeners) l();
}

async function collectTrackedProjectIds(): Promise<string[]> {
  const settings = await loadSettings();
  const ids: string[] = [];
  for (const org of settings.orgs) {
    const tracked = new Set(org.trackedProjectIds);
    for (const p of org.projects) {
      if (tracked.has(p.id)) {
        ids.push(p.id);
      }
    }
  }
  return ids;
}

// Refreshes the local cache by syncing every tracked project in turn. Parallel
// fan-out is tempting but reliably trips GitHub's secondary rate limit when
// the user has 10+ projects; sequential is slower but predictable.
export async function runSyncPass(gen: number): Promise<void> {
  if (gen !== generation) {
    return;
  }
  setInFlight(true);
  try {
    const ids = await collectTrackedProjectIds();
    if (ids.length === 0) {
      await reloadFromDb([]);
      return;
    }
    for (const id of ids) {
      if (gen !== generation) {
        return;
      }
      try {
        await syncProject(id);
        await reloadFromDb(ids);
      } catch (e) {
        logger.error(`Project sync failed for ${id}`, e);
      }
    }
  } finally {
    setInFlight(false);
  }
}

// Convenience entry for the Refresh button — always runs against the latest
// generation so it can't be cancelled by a stale unmount.
export async function refreshAll(): Promise<void> {
  await runSyncPass(generation);
}

// Initial paint from the DB cache, used during boot and while rate-limited.
export async function paintFromCache(): Promise<void> {
  const ids = await collectTrackedProjectIds();
  await reloadFromDb(ids);
}
