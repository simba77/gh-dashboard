import { getDb } from './connection';

// Mirror of the `project_items` SQLite schema. `assignees` is stored as JSON
// text in one column — we never filter on individual logins in SQL, only group
// in TS, so a separate table would be cost without benefit.
export interface ProjectItemRow {
  itemId: string;
  projectId: string;
  projectTitle: string;
  contentType: 'Issue' | 'PullRequest' | 'DraftIssue';
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  author: string | null;
  assignees: string[];
  status: string | null;
  isDraft: boolean;
  fetchedAt: number;
}

// Shape coming back from sqlx — column names match the SELECT list verbatim.
interface RawRow {
  item_id: string;
  project_id: string;
  project_title: string;
  content_type: ProjectItemRow['contentType'];
  title: string;
  url: string | null;
  number: number | null;
  repository: string | null;
  author: string | null;
  assignees_json: string;
  status: string | null;
  is_draft: number;
  fetched_at: number;
}

function fromRaw(row: RawRow): ProjectItemRow {
  // assignees_json is stored under our own control (always a JSON array we
  // wrote) — parse failures here would mean DB corruption, not user input.
  let assignees: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.assignees_json);
    if (Array.isArray(parsed)) {
      assignees = parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    assignees = [];
  }
  return {
    itemId: row.item_id,
    projectId: row.project_id,
    projectTitle: row.project_title,
    contentType: row.content_type,
    title: row.title,
    url: row.url,
    number: row.number,
    repository: row.repository,
    author: row.author,
    assignees,
    status: row.status,
    isDraft: row.is_draft !== 0,
    fetchedAt: row.fetched_at,
  };
}

export type UpsertItem = Omit<ProjectItemRow, 'fetchedAt'>;

// Bulk insert-or-replace. Used by the sync layer after every fetch — fetched_at
// is set here so callers don't have to thread `Date.now()` through their code.
export async function upsertItems(items: UpsertItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const db = await getDb();
  const now = Date.now();
  // Single multi-row INSERT keeps the round-trip count to one. SQLite caps
  // bound parameters at 999 by default; 12 columns × ~80 items per project
  // stays well under that. If we ever blow past, chunk here.
  const cols = '(?,?,?,?,?,?,?,?,?,?,?,?,?)';
  const placeholders = items.map(() => cols).join(',');
  const values: unknown[] = [];
  for (const it of items) {
    values.push(
      it.itemId,
      it.projectId,
      it.projectTitle,
      it.contentType,
      it.title,
      it.url,
      it.number,
      it.repository,
      it.author,
      JSON.stringify(it.assignees),
      it.status,
      it.isDraft ? 1 : 0,
      now,
    );
  }
  await db.execute(
    `INSERT OR REPLACE INTO project_items
       (item_id, project_id, project_title, content_type, title, url, number,
        repository, author, assignees_json, status, is_draft, fetched_at)
     VALUES ${placeholders}`,
    values,
  );
}

// After a full project sync we drop rows that didn't appear in the latest
// pull — the only way to notice items deleted on GitHub. Tail sync (partial)
// must NOT call this; it would erase the head of the project we didn't fetch.
export async function deleteMissing(projectId: string, keepItemIds: string[]): Promise<void> {
  const db = await getDb();
  if (keepItemIds.length === 0) {
    await db.execute('DELETE FROM project_items WHERE project_id = ?', [projectId]);
    return;
  }
  const placeholders = keepItemIds.map(() => '?').join(',');
  await db.execute(
    `DELETE FROM project_items
     WHERE project_id = ? AND item_id NOT IN (${placeholders})`,
    [projectId, ...keepItemIds],
  );
}

export async function selectByProject(projectId: string): Promise<ProjectItemRow[]> {
  const db = await getDb();
  const rows = await db.select<RawRow[]>('SELECT * FROM project_items WHERE project_id = ?', [
    projectId,
  ]);
  return rows.map(fromRaw);
}

// Single-shot query used by every widget — pulls items from many projects
// in one round-trip. Empty `projectIds` returns [] without touching the DB.
export async function selectByProjects(projectIds: string[]): Promise<ProjectItemRow[]> {
  if (projectIds.length === 0) {
    return [];
  }
  const db = await getDb();
  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await db.select<RawRow[]>(
    `SELECT * FROM project_items WHERE project_id IN (${placeholders})`,
    projectIds,
  );
  return rows.map(fromRaw);
}
