import { useMemo } from 'react';

import { fetchOrgMembers, type OrgMember } from '../../api/queries/orgMembers';
import { useFanout } from '../../hooks/useFanout';
import { loadSettings } from '../../settings/settingsStore';

interface OrgMembersState {
  members: OrgMember[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

// `enabled` lets the Team view defer this fetch until the user actually opens
// the "Manage people" panel — saves one query per refresh on the common path.
export function useOrgMembers(enabled = true): OrgMembersState {
  const { items, loading, error, lastUpdated, refresh } = useFanout<string, OrgMember>(
    async () => {
      const settings = await loadSettings();
      return settings.orgs.map((o) => o.login);
    },
    (login) => fetchOrgMembers(login),
    'orgs',
    [],
    !enabled,
    'team-members',
  );

  // Members are deduped by login here (not inside useFanout) — that's a
  // domain rule, not part of the generic fan-out shape.
  const members = useMemo(() => {
    const byLogin = new Map<string, OrgMember>();
    for (const m of items) {
      if (!byLogin.has(m.login)) {
        byLogin.set(m.login, m);
      }
    }
    return Array.from(byLogin.values());
  }, [items]);

  return { members, loading, error, lastUpdated, refresh };
}
