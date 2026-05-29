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

// Read accessor — the polling loop checks this between awaits so a stale
// generation aborts cleanly when the user logs out / hot-reload remounts.
export function getGeneration(): number {
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

// Union of every project any widget might query:
//   * `trackedProjectIds` — dashboard widgets (My tasks, Testing, ...).
//   * known projects minus `teamExcludedProjectIds` — the Team screen, which
//     defaults to showing everything in the org.
// Syncing the superset means widgets share one cache instead of fanning out
// duplicate fetches per concern.
async function collectActiveProjectIds(): Promise<string[]> {
  const settings = await loadSettings();
  const ids = new Set<string>();
  for (const org of settings.orgs) {
    const tracked = new Set(org.trackedProjectIds);
    const excluded = new Set(org.teamExcludedProjectIds);
    for (const p of org.projects) {
      if (tracked.has(p.id) || !excluded.has(p.id)) {
        ids.add(p.id);
      }
    }
  }
  return Array.from(ids);
}

// Refreshes the local cache by syncing every tracked project in turn. Parallel
// fan-out is tempting but reliably trips GitHub's secondary rate limit when
// the user has 10+ projects; sequential is slower but predictable.
//
// Skip-if-running: when a poll tick fires while the previous pass is still
// in flight (large org → 47 projects → sync takes >60s while interval is 60s),
// the new tick is dropped instead of stacking work. Otherwise passes overlap,
// double the request rate, and the user sees an unbroken stream of GraphQL
// hits in the log — which is exactly what we just observed.
export async function runSyncPass(gen: number, trigger: string): Promise<void> {
  if (gen !== generation) {
    return;
  }
  if (inFlight) {
    logger.info(`Sync pass skipped (${trigger}): previous pass still running`);
    return;
  }
  setInFlight(true);
  const startedAt = Date.now();
  let projectsDone = 0;
  let projectsFailed = 0;
  logger.info(`Sync pass started (${trigger})`);
  try {
    const ids = await collectActiveProjectIds();
    if (ids.length === 0) {
      await reloadFromDb([]);
      return;
    }
    logger.info(`Sync pass: ${String(ids.length)} project(s) to sync`);
    for (const id of ids) {
      if (gen !== generation) {
        logger.info(
          `Sync pass aborted (generation bumped) at ${String(projectsDone)}/${String(ids.length)}`,
        );
        return;
      }
      try {
        await syncProject(id);
        await reloadFromDb(ids);
        projectsDone += 1;
      } catch (e) {
        projectsFailed += 1;
        logger.error(`Project sync failed for ${id}`, e);
      }
    }
  } finally {
    setInFlight(false);
    const elapsedMs = Date.now() - startedAt;
    logger.info(
      `Sync pass finished: ${String(projectsDone)} ok, ${String(projectsFailed)} failed, ${String(elapsedMs)} ms`,
    );
  }
}

// Convenience entry for the Refresh button — always runs against the latest
// generation so it can't be cancelled by a stale unmount.
export async function refreshAll(): Promise<void> {
  await runSyncPass(generation, 'manual-refresh');
}

// Initial paint from the DB cache, used during boot and while rate-limited.
export async function paintFromCache(): Promise<void> {
  const ids = await collectActiveProjectIds();
  await reloadFromDb(ids);
}
