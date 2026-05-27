import { useState } from 'react';

import type { OrgProject } from '../api/queries/orgProjects';
import { useOrgProjects } from './useOrgProjects';
import { useSettings } from './useSettings';

interface OrgSectionProps {
  login: string;
  trackedIds: Set<string>;
  onToggle: (project: OrgProject) => void;
  onRemove: () => void;
}

function OrgSection({ login, trackedIds, onToggle, onRemove }: OrgSectionProps) {
  const { projects, loading, error } = useOrgProjects(login);

  return (
    <section className="settings__org">
      <div className="settings__org-head">
        <h2>{login}</h2>
        <button type="button" onClick={onRemove}>
          Remove
        </button>
      </div>

      {loading ? <p className="settings__hint">Loading projects…</p> : null}
      {error ? <p className="login__error">{error}</p> : null}
      {!loading && !error && projects.length === 0 ? (
        <p className="settings__hint">No projects in this organization.</p>
      ) : null}

      <ul className="settings__projects">
        {projects.map((project) => (
          <li key={project.id}>
            <label className="settings__project">
              <input
                type="checkbox"
                checked={trackedIds.has(project.id)}
                onChange={() => {
                  onToggle(project);
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
  const { settings, loading, error, addOrg, removeOrg, toggleProject } = useSettings();
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

      {error ? <p className="login__error">{error}</p> : null}
      {loading ? <p className="settings__hint">Loading settings…</p> : null}

      {!loading && settings.orgs.length === 0 ? (
        <p className="settings__hint">No organizations yet. Add one above to track its projects.</p>
      ) : null}

      {settings.orgs.map((org) => (
        <OrgSection
          key={org.login}
          login={org.login}
          trackedIds={new Set(org.projects.map((p) => p.id))}
          onToggle={(project) => {
            toggleProject(org.login, project);
          }}
          onRemove={() => {
            removeOrg(org.login);
          }}
        />
      ))}
    </main>
  );
}
