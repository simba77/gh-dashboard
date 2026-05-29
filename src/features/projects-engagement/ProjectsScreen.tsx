import { useMemo } from 'react';

import { useSettings } from '../../settings/useSettings';
import type { WatchedPerson } from '../../settings/settingsStore';
import { useProjectEngagement } from './useProjectEngagement';
import type { Contributor, ProjectEngagement } from './useProjectEngagement';

function ContributorRow({
  contributor,
  person,
  max,
}: {
  contributor: Contributor;
  person: WatchedPerson | undefined;
  max: number;
}) {
  const displayName = person?.name ?? person?.login ?? contributor.login;
  // Bar width is relative to the project's top contributor, so the leader
  // always fills the row and everyone else reads as a fraction of them.
  const pct = max > 0 ? Math.round((contributor.count / max) * 100) : 0;
  return (
    <li className="projects__row">
      <img className="team__avatar team__avatar--sm" src={person?.avatarUrl ?? ''} alt="" />
      <span className="projects__who" title={`@${contributor.login}`}>
        {displayName}
      </span>
      <span className="projects__bar" aria-hidden="true">
        <span className="projects__bar-fill" style={{ width: `${String(pct)}%` }} />
      </span>
      <span className="projects__count">{contributor.count}</span>
    </li>
  );
}

function ProjectCard({
  project,
  peopleByLogin,
}: {
  project: ProjectEngagement;
  peopleByLogin: Map<string, WatchedPerson>;
}) {
  const max = project.contributors[0]?.count ?? 0;
  return (
    <article className="team__card">
      <header className="projects__head">
        <h3 className="projects__title">{project.projectTitle}</h3>
        <span className="team__count">({project.total})</span>
      </header>
      {project.contributors.length === 0 ? (
        <p className="settings__hint">no assignees yet</p>
      ) : (
        <ul className="projects__rows">
          {project.contributors.map((c) => (
            <ContributorRow
              key={c.login}
              contributor={c}
              person={peopleByLogin.get(c.login)}
              max={max}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

export function ProjectsScreen() {
  const projects = useProjectEngagement();
  const { settings } = useSettings();

  // `watched` only enriches names/avatars where available — anyone assigned but
  // not watched still shows up, by login.
  const peopleByLogin = useMemo(() => {
    const map = new Map<string, WatchedPerson>();
    for (const p of settings.watched) {
      map.set(p.login, p);
    }
    return map;
  }, [settings.watched]);

  return (
    <>
      <header className="screen__head">
        <h1 className="screen__title">Projects</h1>
      </header>

      {projects.length === 0 ? (
        <p className="settings__hint">
          No data yet. Projects appear here once the first sync populates the local cache.
        </p>
      ) : (
        <div className="team__grid">
          {projects.map((p) => (
            <ProjectCard key={p.projectId} project={p} peopleByLogin={peopleByLogin} />
          ))}
        </div>
      )}
    </>
  );
}
