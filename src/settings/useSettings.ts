import { useCallback, useEffect, useRef, useState } from 'react';

import type { OrgProject } from '../api/queries/orgProjects';
import { logger } from '../lib/logger';
import { loadSettings, saveSettings, type Settings } from './settingsStore';

export interface SettingsState {
  settings: Settings;
  loading: boolean;
  error: string | null;
  addOrg: (login: string) => void;
  removeOrg: (login: string) => void;
  toggleProject: (login: string, project: OrgProject) => void;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings>({ orgs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mirrors the latest state so mutators can read it without being recreated on
  // every change, keeping their identities stable for consumers.
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

  const addOrg = useCallback(
    (login: string) => {
      const current = settingsRef.current;
      if (current.orgs.some((o) => o.login === login)) {
        return;
      }
      apply({ orgs: [...current.orgs, { login, projects: [] }] });
    },
    [apply],
  );

  const removeOrg = useCallback(
    (login: string) => {
      apply({ orgs: settingsRef.current.orgs.filter((o) => o.login !== login) });
    },
    [apply],
  );

  const toggleProject = useCallback(
    (login: string, project: OrgProject) => {
      const orgs = settingsRef.current.orgs.map((org) => {
        if (org.login !== login) {
          return org;
        }
        const tracked = org.projects.some((p) => p.id === project.id);
        return {
          ...org,
          projects: tracked
            ? org.projects.filter((p) => p.id !== project.id)
            : [...org.projects, project],
        };
      });
      apply({ orgs });
    },
    [apply],
  );

  return { settings, loading, error, addOrg, removeOrg, toggleProject };
}
