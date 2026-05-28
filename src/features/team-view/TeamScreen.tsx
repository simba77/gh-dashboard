import { openUrl } from '@tauri-apps/plugin-opener';
import { useMemo } from 'react';

import type { OrgMember } from '../../api/queries/orgMembers';
import type { ActiveItem } from '../../api/queries/projectActiveItems';
import { logger } from '../../lib/logger';
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
    if (a.name === NO_STATUS_LABEL) {
      return 1;
    }
    if (b.name === NO_STATUS_LABEL) {
      return -1;
    }
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

function MemberCard({ member, items }: { member: OrgMember; items: ActiveItem[] }) {
  const displayName = member.name ?? member.login;

  if (items.length === 0) {
    return (
      <article className="team__card team__card--idle">
        <header className="team__card-head">
          <img className="team__avatar" src={member.avatarUrl} alt="" />
          <div className="team__who">
            <div className="team__name">{displayName}</div>
            <div className="team__login">@{member.login}</div>
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
        <img className="team__avatar" src={member.avatarUrl} alt="" />
        <div className="team__who">
          <div className="team__name">{displayName}</div>
          <div className="team__login">
            @{member.login} · {items.length}
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
              <li key={`${member.login}:${item.itemId}`}>
                <ItemRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

export function TeamScreen({ onClose }: { onClose: () => void }) {
  const members = useOrgMembers();
  const activity = useTeamActivity();

  // Group items by assignee login. An item with two assignees lands under both
  // people — workload visibility wins over deduplication here.
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

  const sorted = useMemo(() => {
    return [...members.members].sort((a, b) => {
      const ac = itemsByLogin.get(a.login)?.length ?? 0;
      const bc = itemsByLogin.get(b.login)?.length ?? 0;
      if (ac !== bc) {
        return bc - ac;
      }
      return (a.name ?? a.login).localeCompare(b.name ?? b.login);
    });
  }, [members.members, itemsByLogin]);

  const loading = members.loading || activity.loading;
  const refreshAll = () => {
    members.refresh();
    activity.refresh();
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>Team</h1>
        <div className="app__actions">
          <button type="button" onClick={refreshAll} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </header>

      {members.error ? <p className="login__error">Members: {members.error}</p> : null}
      {activity.error ? <p className="login__error">Activity: {activity.error}</p> : null}

      {!loading && members.members.length === 0 ? (
        <p className="settings__hint">No organizations configured. Add at least one in Settings.</p>
      ) : null}

      <p className="settings__hint">
        Showing in-flight items (open, Status ≠ Done/Closed/Cancelled). Assignees outside the listed
        organizations are not shown.
      </p>

      <div className="team__grid">
        {sorted.map((m) => (
          <MemberCard key={m.login} member={m} items={itemsByLogin.get(m.login) ?? []} />
        ))}
      </div>
    </main>
  );
}
