import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchOrgProjects } from '../api/queries/orgProjects';
import { logger } from '../lib/logger';
import {
  loadSettings,
  saveSettings,
  type OrgSettings,
  type Settings,
  type WatchedPerson,
} from './settingsStore';

export interface SettingsState {
  settings: Settings;
  loading: boolean;
  error: string | null;
  // Per-org "currently refreshing projects" indicator; missing key = idle.
  refreshing: Record<string, boolean>;

  addOrg: (login: string) => void;
  removeOrg: (login: string) => void;
  refreshOrgProjects: (login: string) => void;

  toggleTracked: (login: string, projectId: string) => void;
  toggleTeamExcluded: (login: string, projectId: string) => void;

  setWatched: (next: WatchedPerson[]) => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EMPTY: Settings = { orgs: [], watched: [] };

export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});

  // Mirrors the latest state so mutators stay stable for consumers.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    loadSettings()
      .then(setSettings)
      .catch((e: unknown) => {
        logger.error('Failed to load settings', e);
        setError(toMessage(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Persists the next state and adopts it only once the write succeeds, so the
  // UI never shows a selection that failed to save.
  const apply = useCallback((next: Settings) => {
    saveSettings(next)
      .then(() => {
        setSettings(next);
        setError(null);
      })
      .catch((e: unknown) => {
        logger.error('Failed to save settings', e);
        setError(toMessage(e));
      });
  }, []);

  const updateOrg = useCallback(
    (login: string, fn: (org: OrgSettings) => OrgSettings): void => {
      const current = settingsRef.current;
      apply({
        ...current,
        orgs: current.orgs.map((o) => (o.login === login ? fn(o) : o)),
      });
    },
    [apply],
  );

  // Pulls the latest project list from GitHub and reconciles the two id
  // subsets: anything no longer present in the org is dropped from both,
  // anything new lands in `projects` but stays untracked/included by default.
  const refreshOrgProjects = useCallback(
    (login: string) => {
      setRefreshing((prev) => ({ ...prev, [login]: true }));
      fetchOrgProjects(login)
        .then((fresh) => {
          const ids = new Set(fresh.map((p) => p.id));
          updateOrg(login, (org) => ({
            ...org,
            projects: fresh,
            trackedProjectIds: org.trackedProjectIds.filter((id) => ids.has(id)),
            teamExcludedProjectIds: org.teamExcludedProjectIds.filter((id) => ids.has(id)),
          }));
        })
        .catch((e: unknown) => {
          logger.error(`Failed to refresh projects for ${login}`, e);
          setError(toMessage(e));
        })
        .finally(() => {
          setRefreshing((prev) => {
            const { [login]: _drop, ...rest } = prev;
            return rest;
          });
        });
    },
    [updateOrg],
  );

  const addOrg = useCallback(
    (login: string) => {
      const current = settingsRef.current;
      if (current.orgs.some((o) => o.login === login)) {
        return;
      }
      apply({
        ...current,
        orgs: [
          ...current.orgs,
          { login, projects: [], trackedProjectIds: [], teamExcludedProjectIds: [] },
        ],
      });
      // Populate the new org's project list immediately — otherwise the user
      // sees an empty section with nothing to tick.
      refreshOrgProjects(login);
    },
    [apply, refreshOrgProjects],
  );

  const removeOrg = useCallback(
    (login: string) => {
      const current = settingsRef.current;
      apply({ ...current, orgs: current.orgs.filter((o) => o.login !== login) });
    },
    [apply],
  );

  const toggleInSet = (ids: string[], projectId: string): string[] =>
    ids.includes(projectId) ? ids.filter((id) => id !== projectId) : [...ids, projectId];

  const toggleTracked = useCallback(
    (login: string, projectId: string) => {
      updateOrg(login, (org) => ({
        ...org,
        trackedProjectIds: toggleInSet(org.trackedProjectIds, projectId),
      }));
    },
    [updateOrg],
  );

  const toggleTeamExcluded = useCallback(
    (login: string, projectId: string) => {
      updateOrg(login, (org) => ({
        ...org,
        teamExcludedProjectIds: toggleInSet(org.teamExcludedProjectIds, projectId),
      }));
    },
    [updateOrg],
  );

  const setWatched = useCallback(
    (next: WatchedPerson[]) => {
      apply({ ...settingsRef.current, watched: next });
    },
    [apply],
  );

  return {
    settings,
    loading,
    error,
    refreshing,
    addOrg,
    removeOrg,
    refreshOrgProjects,
    toggleTracked,
    toggleTeamExcluded,
    setWatched,
  };
}
