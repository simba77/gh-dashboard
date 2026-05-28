import { getDb } from './connection';

export interface SyncState {
  projectId: string;
  // Wall-clock ms of the most recent **full-pagination** pull. Null until the
  // project has been fully synced at least once after this DB was created.
  lastFullSync: number | null;
  // Most recent pull of any kind (full or tail). Drives the polling cadence.
  lastTailSync: number | null;
}

interface RawRow {
  project_id: string;
  last_full_sync: number | null;
  last_tail_sync: number | null;
}

function fromRaw(row: RawRow): SyncState {
  return {
    projectId: row.project_id,
    lastFullSync: row.last_full_sync,
    lastTailSync: row.last_tail_sync,
  };
}

export async function getSyncState(projectId: string): Promise<SyncState | null> {
  const db = await getDb();
  const rows = await db.select<RawRow[]>('SELECT * FROM project_sync_state WHERE project_id = ?', [
    projectId,
  ]);
  return rows[0] ? fromRaw(rows[0]) : null;
}

export async function getAllSyncStates(): Promise<SyncState[]> {
  const db = await getDb();
  const rows = await db.select<RawRow[]>('SELECT * FROM project_sync_state', []);
  return rows.map(fromRaw);
}

// Both timestamps optional so callers update only what's relevant — a tail
// sync touches `last_tail_sync` only, full sync touches both (a full sync
// also counts as a tail sync for cadence purposes).
export async function recordSync(
  projectId: string,
  patch: { lastFullSync?: number; lastTailSync?: number },
): Promise<void> {
  const db = await getDb();
  const existing = await getSyncState(projectId);
  const next = {
    lastFullSync: patch.lastFullSync ?? existing?.lastFullSync ?? null,
    lastTailSync: patch.lastTailSync ?? existing?.lastTailSync ?? null,
  };
  if (existing) {
    await db.execute(
      'UPDATE project_sync_state SET last_full_sync = ?, last_tail_sync = ? WHERE project_id = ?',
      [next.lastFullSync, next.lastTailSync, projectId],
    );
  } else {
    await db.execute(
      'INSERT INTO project_sync_state (project_id, last_full_sync, last_tail_sync) VALUES (?, ?, ?)',
      [projectId, next.lastFullSync, next.lastTailSync],
    );
  }
}
