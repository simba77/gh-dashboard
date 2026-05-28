import { useState } from 'react';

import type { OrgProject } from '../api/queries/orgProjects';
import { useSettings } from './useSettings';

interface OrgSectionProps {
  login: string;
  projects: OrgProject[];
  trackedIds: Set<string>;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleTracked: (projectId: string) => void;
  onRemove: () => void;
}

function OrgSection({
  login,
  projects,
  trackedIds,
  refreshing,
  onRefresh,
  onToggleTracked,
  onRemove,
}: OrgSectionProps) {
  return (
    <section className="settings__org">
      <div className="settings__org-head">
        <h2>{login}</h2>
        <div className="app__actions">
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh projects'}
          </button>
          <button type="button" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="settings__hint">
          {refreshing ? 'Loading projects…' : 'No projects yet. Click Refresh.'}
        </p>
      ) : null}

      <ul className="settings__projects">
        {projects.map((project) => (
          <li key={project.id}>
            <label className="settings__project">
              <input
                type="checkbox"
                checked={trackedIds.has(project.id)}
                onChange={() => {
                  onToggleTracked(project.id);
                }}
              />
              <span>
                {project.title} <span className="settings__hint">#{project.number}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const {
    settings,
    loading,
    error,
    refreshing,
    addOrg,
    removeOrg,
    refreshOrgProjects,
    toggleTracked,
  } = useSettings();
  const [slug, setSlug] = useState('');

  function handleAdd() {
    const login = slug.trim();
    if (login) {
      addOrg(login);
      setSlug('');
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>Settings</h1>
        <button type="button" onClick={onClose}>
          Done
        </button>
      </header>

      <form
        className="settings__add"
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <input
          type="text"
          placeholder="Organization slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
          }}
        />
        <button type="submit">Add organization</button>
      </form>

      <p className="settings__hint">
        Ticked projects appear in dashboard widgets. The Team view shows all listed projects unless
        you hide individual ones from its own &quot;Manage projects&quot; panel.
      </p>

      {error ? <p className="login__error">{error}</p> : null}
      {loading ? <p className="settings__hint">Loading settings…</p> : null}

      {!loading && settings.orgs.length === 0 ? (
        <p className="settings__hint">
          No organizations yet. Add one above to discover its projects.
        </p>
      ) : null}

      {settings.orgs.map((org) => (
        <OrgSection
          key={org.login}
          login={org.login}
          projects={org.projects}
          trackedIds={new Set(org.trackedProjectIds)}
          refreshing={refreshing[org.login] ?? false}
          onRefresh={() => {
            refreshOrgProjects(org.login);
          }}
          onToggleTracked={(projectId) => {
            toggleTracked(org.login, projectId);
          }}
          onRemove={() => {
            removeOrg(org.login);
          }}
        />
      ))}
    </main>
  );
}
