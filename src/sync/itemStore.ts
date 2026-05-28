import { selectByProjects, type ProjectItemRow } from '../db/projectItems';
import { logger } from '../lib/logger';

// In-memory snapshot of every cached project_item row, indexed by item_id.
// All widget hooks read from this map (after filtering for their concern)
// instead of issuing their own DB queries — keeps cross-widget updates in
// lockstep and lets the React tree re-render in one pass per sync tick.
let snapshot = new Map<string, ProjectItemRow>();
// Wall-clock ms of the most recent successful reload — surfaced to widgets so
// they can render "Updated Xm ago". Null until the first reload completes.
let lastSyncAt: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeItems(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getItemsSnapshot(): Map<string, ProjectItemRow> {
  return snapshot;
}

export function getLastSyncAt(): number | null {
  return lastSyncAt;
}

// Reads the latest state from SQLite for the given projects and swaps the
// in-memory snapshot atomically. Called by the sync orchestrator after every
// successful project sync (one project at a time, so widgets get incremental
// updates instead of waiting for the whole org to finish).
export async function reloadFromDb(projectIds: string[]): Promise<void> {
  try {
    const rows = await selectByProjects(projectIds);
    const next = new Map<string, ProjectItemRow>();
    for (const r of rows) {
      next.set(r.itemId, r);
    }
    snapshot = next;
    lastSyncAt = Date.now();
    emit();
  } catch (e) {
    logger.error('Failed to reload items from db', e);
  }
}
