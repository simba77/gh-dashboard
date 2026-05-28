import { getDb } from './connection';

// Mirrors one row of `project_status_options`. `position` preserves the order
// declared on the project's Status field, so Kanban columns render in the
// same sequence the user sees on github.com.
export interface StatusOptionRow {
  projectId: string;
  optionId: string;
  name: string;
  position: number;
}

interface RawRow {
  project_id: string;
  option_id: string;
  name: string;
  position: number;
}

function fromRaw(row: RawRow): StatusOptionRow {
  return {
    projectId: row.project_id,
    optionId: row.option_id,
    name: row.name,
    position: row.position,
  };
}

// Replaces the full set of options for one project. Status fields are tiny
// (a handful of options) and full sync owns the source of truth, so a
// delete-then-insert is simpler than reconciling diffs and costs nothing.
export async function replaceStatusOptions(
  projectId: string,
  options: { optionId: string; name: string; position: number }[],
): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM project_status_options WHERE project_id = ?', [projectId]);
  if (options.length === 0) {
    return;
  }
  const placeholders = options.map(() => '(?,?,?,?)').join(',');
  const values: unknown[] = [];
  for (const opt of options) {
    values.push(projectId, opt.optionId, opt.name, opt.position);
  }
  await db.execute(
    `INSERT INTO project_status_options (project_id, option_id, name, position)
     VALUES ${placeholders}`,
    values,
  );
}

export async function selectStatusOptions(projectId: string): Promise<StatusOptionRow[]> {
  const db = await getDb();
  const rows = await db.select<RawRow[]>(
    'SELECT * FROM project_status_options WHERE project_id = ? ORDER BY position',
    [projectId],
  );
  return rows.map(fromRaw);
}
