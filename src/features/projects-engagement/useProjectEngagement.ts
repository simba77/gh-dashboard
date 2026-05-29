import type { ProjectItemRow } from '../../db/projectItems';
import { useItems } from '../../sync/useItems';

export interface Contributor {
  login: string;
  count: number;
}

export interface ProjectEngagement {
  projectId: string;
  projectTitle: string;
  // Total number of items in the project, including ones with no assignee.
  total: number;
  // Assignees ranked by how many of the project's items they're on.
  contributors: Contributor[];
}

// Engagement = how many tasks each person is attributed to, per project. We
// count every item regardless of state (this measures involvement, not
// completion) and credit each assignee — an item with two assignees counts
// once for each. Items with no assignee still raise the project `total`.
function selectEngagement(rows: ProjectItemRow[]): ProjectEngagement[] {
  const byProject = new Map<
    string,
    { title: string; total: number; counts: Map<string, number> }
  >();
  for (const row of rows) {
    let project = byProject.get(row.projectId);
    if (!project) {
      project = { title: row.projectTitle, total: 0, counts: new Map() };
      byProject.set(row.projectId, project);
    }
    project.total += 1;
    for (const login of row.assignees) {
      project.counts.set(login, (project.counts.get(login) ?? 0) + 1);
    }
  }

  const projects: ProjectEngagement[] = [];
  for (const [projectId, project] of byProject) {
    const contributors = Array.from(project.counts, ([login, count]) => ({ login, count })).sort(
      (a, b) => (a.count !== b.count ? b.count - a.count : a.login.localeCompare(b.login)),
    );
    projects.push({ projectId, projectTitle: project.title, total: project.total, contributors });
  }
  return projects.sort((a, b) =>
    a.total !== b.total ? b.total - a.total : a.projectTitle.localeCompare(b.projectTitle),
  );
}

export function useProjectEngagement(): ProjectEngagement[] {
  return useItems(selectEngagement, []);
}
