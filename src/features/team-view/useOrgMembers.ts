import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchOrgMembers, type OrgMember } from '../../api/queries/orgMembers';
import { logger } from '../../lib/logger';
import { loadSettings } from '../../settings/settingsStore';

interface OrgMembersState {
  members: OrgMember[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Aggregates members across every configured organization, deduplicating by
// login so a user in two orgs appears once. Same allSettled pattern as the
// other multi-source hooks — one broken org doesn't hide the others.
export function useOrgMembers(): OrgMembersState {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const settings = await loadSettings();
        const logins = settings.orgs.map((o) => o.login);

        const results = await Promise.allSettled(logins.map((login) => fetchOrgMembers(login)));
        if (!activeRef.current) {
          return;
        }

        const byLogin = new Map<string, OrgMember>();
        const failures: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled') {
            for (const m of r.value) {
              if (!byLogin.has(m.login)) {
                byLogin.set(m.login, m);
              }
            }
          } else {
            failures.push(toMessage(r.reason));
            logger.error('Failed to load org members', r.reason);
          }
        }

        setMembers(Array.from(byLogin.values()));
        const first = failures[0] ?? '';
        setError(
          failures.length === 0
            ? null
            : failures.length === 1
              ? first
              : `${String(failures.length)} orgs failed to load: ${first}`,
        );
      } catch (e) {
        if (!activeRef.current) {
          return;
        }
        logger.error('Failed to load team members', e);
        setError(toMessage(e));
      } finally {
        if (activeRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      activeRef.current = false;
    };
  }, [tick]);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { members, loading, error, refresh };
}
