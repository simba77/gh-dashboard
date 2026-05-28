import { fetchAllProjectItems, fetchProjectItemsPage } from '../api/queries/projectItems';
import { deleteMissing, upsertItems } from '../db/projectItems';
import { replaceStatusOptions } from '../db/projectStatusOptions';
import { getSyncState, recordSync } from '../db/syncState';
import { logger } from '../lib/logger';

// Full pagination is expensive (one GraphQL request per 100 items on the
// board), so we only do it on first boot for a project and every 30 minutes
// thereafter. Between full syncs we just pull the DESC-first page — that's
// the tail of the board where active work lives, and it covers virtually
// every change a user makes in real time.
export const FULL_SYNC_INTERVAL_MS = 30 * 60_000;

export type SyncKind = 'full' | 'tail';

export interface SyncResult {
  kind: SyncKind;
  upserted: number;
  removed: number;
}

// Decides what kind of sync the project needs right now and runs it. Exposed
// directly so the sync hook can call it per project on each polling tick.
export async function syncProject(projectId: string): Promise<SyncResult> {
  const state = await getSyncState(projectId);
  const dueForFull =
    !state?.lastFullSync || Date.now() - state.lastFullSync >= FULL_SYNC_INTERVAL_MS;

  if (dueForFull) {
    const { items, statusOptions } = await fetchAllProjectItems(projectId);
    await upsertItems(items);
    await deleteMissing(
      projectId,
      items.map((it) => it.itemId),
    );
    if (statusOptions !== null) {
      await replaceStatusOptions(projectId, statusOptions);
    }
    const now = Date.now();
    await recordSync(projectId, { lastFullSync: now, lastTailSync: now });
    logger.info(`Full sync ${projectId}: ${String(items.length)} items`);
    return { kind: 'full', upserted: items.length, removed: 0 };
  }

  // Tail sync: just the first DESC page. Items missing from this page that
  // already live in the DB are NOT removed — they may be in the head we
  // didn't fetch. The next full sync reconciles deletions. Status options
  // are cheap and arrive on every page; we keep them fresh on tail sync too.
  const page = await fetchProjectItemsPage(projectId, null);
  await upsertItems(page.items);
  if (page.statusOptions !== null) {
    await replaceStatusOptions(projectId, page.statusOptions);
  }
  await recordSync(projectId, { lastTailSync: Date.now() });
  logger.info(`Tail sync ${projectId}: ${String(page.items.length)} items`);
  return { kind: 'tail', upserted: page.items.length, removed: 0 };
}
