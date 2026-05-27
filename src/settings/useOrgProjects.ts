import { useEffect, useState } from 'react';

import { fetchOrgProjects, type OrgProject } from '../api/queries/orgProjects';
import { logger } from '../lib/logger';

interface OrgProjectsState {
  projects: OrgProject[];
  loading: boolean;
  error: string | null;
}

// Fetches the ProjectsV2 boards of an organization so the settings screen can
// offer them for selection. Refetches whenever the login changes.
export function useOrgProjects(login: string): OrgProjectsState {
  const [state, setState] = useState<OrgProjectsState>({
    projects: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    setState({ projects: [], loading: true, error: null });

    fetchOrgProjects(login)
      .then((projects) => {
        if (active) {
          setState({ projects, loading: false, error: null });
        }
      })
      .catch((e: unknown) => {
        if (!active) {
          return;
        }
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`Failed to fetch projects for ${login}`, e);
        setState({ projects: [], loading: false, error: message });
      });

    return () => {
      active = false;
    };
  }, [login]);

  return state;
}
