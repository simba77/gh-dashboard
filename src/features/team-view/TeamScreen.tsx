import { openUrl } from '@tauri-apps/plugin-opener';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { OrgMember } from '../../api/queries/orgMembers';
import type { ActiveItem } from '../../api/queries/projectActiveItems';
import { logger } from '../../lib/logger';
import { useSettings } from '../../settings/useSettings';
import type { WatchedPerson } from '../../settings/settingsStore';
import { UpdatedAgo } from '../../ui/UpdatedAgo';
import { useOrgMembers } from './useOrgMembers';
import { useTeamActivity } from './useTeamActivity';

const NO_STATUS_LABEL = '(no status)';

function handleOpen(url: string): void {
  openUrl(url).catch((e: unknown) => {
    logger.error('Failed to open item url', e);
  });
}

interface StatusGroup {
  name: string;
  items: ActiveItem[];
}

function groupByStatus(items: ActiveItem[]): StatusGroup[] {
  const map = new Map<string, ActiveItem[]>();
  for (const item of items) {
    const key = item.status ?? NO_STATUS_LABEL;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map, ([name, groupItems]) => ({ name, items: groupItems })).sort((a, b) => {
    if (a.name === NO_STATUS_LABEL) return 1;
    if (b.name === NO_STATUS_LABEL) return -1;
    return a.name.localeCompare(b.name);
  });
}

function ItemRow({ item }: { item: ActiveItem }) {
  const inner = (
    <>
      {item.number !== null ? <span className="team__num">#{item.number}</span> : null}
      <span className="team__item-title">{item.title}</span>
      <span className="team__project">{item.projectTitle}</span>
      {item.isDraft ? <span className="widget__tag">draft</span> : null}
    </>
  );
  const { url } = item;
  if (!url) {
    return <div className="team__item team__item--static">{inner}</div>;
  }
  return (
    <button
      type="button"
      className="team__item"
      onClick={() => {
        handleOpen(url);
      }}
    >
      {inner}
    </button>
  );
}

function MemberCard({ person, items }: { person: WatchedPerson; items: ActiveItem[] }) {
  const displayName = person.name ?? person.login;

  if (items.length === 0) {
    return (
      <article className="team__card team__card--idle">
        <header className="team__card-head">
          <img className="team__avatar" src={person.avatarUrl ?? ''} alt="" />
          <div className="team__who">
            <div className="team__name">{displayName}</div>
            <div className="team__login">@{person.login}</div>
          </div>
        </header>
        <p className="settings__hint">nothing in flight</p>
      </article>
    );
  }

  const groups = groupByStatus(items);
  return (
    <article className="team__card">
      <header className="team__card-head">
        <img className="team__avatar" src={person.avatarUrl ?? ''} alt="" />
        <div className="team__who">
          <div className="team__name">{displayName}</div>
          <div className="team__login">
            @{person.login} · {items.length}
          </div>
        </div>
      </header>
      {groups.map((group) => (
        <section key={group.name} className="team__group">
          <h4 className="team__group-head">
            {group.name} <span className="team__count">({group.items.length})</span>
          </h4>
          <ul className="team__items">
            {group.items.map((item) => (
              <li key={`${person.login}:${item.itemId}`}>
                <ItemRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

interface PeoplePanelProps {
  watched: WatchedPerson[];
  onChange: (next: WatchedPerson[]) => void;
}

function PeoplePanel({ watched, onChange }: PeoplePanelProps) {
  const { members, loading, error } = useOrgMembers(true);
  const watchedSet = new Set(watched.map((w) => w.login));

  function toggle(member: OrgMember): void {
    if (watchedSet.has(member.login)) {
      onChange(watched.filter((w) => w.login !== member.login));
    } else {
      onChange([
        ...watched,
        { login: member.login, name: member.name, avatarUrl: member.avatarUrl },
      ]);
    }
  }

  return (
    <div className="team__panel">
      <h3>People shown on this screen</h3>
      {loading ? <p className="settings__hint">Loading members…</p> : null}
      {error ? <p className="login__error">{error}</p> : null}
      <ul className="team__panel-list">
        {members.map((m) => (
          <li key={m.login}>
            <label className="settings__project">
              <input
                type="checkbox"
                checked={watchedSet.has(m.login)}
                onChange={() => {
                  toggle(m);
                }}
              />
              <img className="team__avatar team__avatar--sm" src={m.avatarUrl} alt="" />
              <span>
                {m.name ?? m.login} <span className="settings__hint">@{m.login}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ProjectsPanelOrg {
  login: string;
  projects: { id: string; title: string; number: number }[];
  excluded: Set<string>;
}

interface ProjectsPanelProps {
  orgs: ProjectsPanelOrg[];
  refreshing: Record<string, boolean>;
  onToggle: (login: string, projectId: string) => void;
  onRefresh: (login: string) => void;
}

function ProjectsPanel({ orgs, refreshing, onToggle, onRefresh }: ProjectsPanelProps) {
  // Auto-refresh each org once per panel session — migrated installs have
  // `projects` populated only with the previously-tracked subset, so without
  // this the list looks suspiciously short.
  const refreshedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const org of orgs) {
      if (!refreshedRef.current.has(org.login)) {
        refreshedRef.current.add(org.login);
        onRefresh(org.login);
      }
    }
  }, [orgs, onRefresh]);

  return (
    <div className="team__panel">
      <h3>Projects included on this screen</h3>
      <p className="settings__hint">
        Untick to hide dead/irrelevant projects. Dashboard widgets are not affected.
      </p>
      {orgs.map((org) => (
        <section key={org.login} className="team__panel-org">
          <div className="team__panel-org-head">
            <h4>{org.login}</h4>
            <button
              type="button"
              onClick={() => {
                onRefresh(org.login);
              }}
              disabled={refreshing[org.login] ?? false}
            >
              {refreshing[org.login] ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {org.projects.length === 0 ? (
            <p className="settings__hint">
              {refreshing[org.login] ? 'Loading projects…' : 'No projects discovered.'}
            </p>
          ) : null}
          <ul className="team__panel-list">
            {org.projects.map((p) => (
              <li key={p.id}>
                <label className="settings__project">
                  <input
                    type="checkbox"
                    checked={!org.excluded.has(p.id)}
                    onChange={() => {
                      onToggle(org.login, p.id);
                    }}
                  />
                  <span>
                    {p.title} <span className="settings__hint">#{p.number}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Panel = 'none' | 'people' | 'projects';

export function TeamScreen() {
  const { settings, setWatched, toggleTeamExcluded, refreshOrgProjects, refreshing } =
    useSettings();
  const activity = useTeamActivity();
  const [panel, setPanel] = useState<Panel>('none');

  const itemsByLogin = useMemo(() => {
    const map = new Map<string, ActiveItem[]>();
    for (const item of activity.items) {
      for (const login of item.assignees) {
        const arr = map.get(login) ?? [];
        arr.push(item);
        map.set(login, arr);
      }
    }
    return map;
  }, [activity.items]);

  const sortedWatched = useMemo(() => {
    return [...settings.watched].sort((a, b) => {
      const ac = itemsByLogin.get(a.login)?.length ?? 0;
      const bc = itemsByLogin.get(b.login)?.length ?? 0;
      if (ac !== bc) return bc - ac;
      return (a.name ?? a.login).localeCompare(b.name ?? b.login);
    });
  }, [settings.watched, itemsByLogin]);

  const projectsPanelOrgs: ProjectsPanelOrg[] = settings.orgs.map((o) => ({
    login: o.login,
    projects: o.projects,
    excluded: new Set(o.teamExcludedProjectIds),
  }));

  function togglePanel(next: Panel): void {
    setPanel((current) => (current === next ? 'none' : next));
  }

  return (
    <>
      <header className="screen__head">
        <h1 className="screen__title">Team</h1>
        <div className="app__actions">
          <UpdatedAgo at={activity.lastUpdated} />
          <button
            type="button"
            onClick={() => {
              togglePanel('people');
            }}
            aria-pressed={panel === 'people'}
          >
            Manage people
          </button>
          <button
            type="button"
            onClick={() => {
              togglePanel('projects');
            }}
            aria-pressed={panel === 'projects'}
          >
            Manage projects
          </button>
          <button type="button" onClick={activity.refresh} disabled={activity.loading}>
            {activity.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {activity.error ? <p className="login__error">{activity.error}</p> : null}

      {panel === 'people' ? <PeoplePanel watched={settings.watched} onChange={setWatched} /> : null}
      {panel === 'projects' ? (
        <ProjectsPanel
          orgs={projectsPanelOrgs}
          refreshing={refreshing}
          onRefresh={refreshOrgProjects}
          onToggle={(login, projectId) => {
            toggleTeamExcluded(login, projectId);
            // Re-fetch so the change takes effect without waiting for the
            // next 60s poll — a stale "hidden" project would still appear.
            activity.refresh();
          }}
        />
      ) : null}

      {settings.watched.length === 0 ? (
        <p className="settings__hint">
          No one watched yet. Open &quot;Manage people&quot; to choose who to show here.
        </p>
      ) : null}

      <div className="team__grid">
        {sortedWatched.map((p) => (
          <MemberCard key={p.login} person={p} items={itemsByLogin.get(p.login) ?? []} />
        ))}
      </div>
    </>
  );
}
