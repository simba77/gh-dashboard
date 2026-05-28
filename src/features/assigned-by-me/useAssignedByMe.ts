import {
  fetchProjectAssignedItems,
  type AssignedItem,
} from '../../api/queries/projectAssignedItems';
import { useFanout, type FanoutState } from '../../hooks/useFanout';
import { loadSettings } from '../../settings/settingsStore';

interface Key {
  projectId: string;
  login: string;
}

export function useAssignedByMe(viewerLogin: string | null): FanoutState<AssignedItem> {
  return useFanout<Key, AssignedItem>(
    async () => {
      if (!viewerLogin) {
        return [];
      }
      const settings = await loadSettings();
      return settings.orgs.flatMap((o) => {
        const tracked = new Set(o.trackedProjectIds);
        return o.projects
          .filter((p) => tracked.has(p.id))
          .map((p) => ({ projectId: p.id, login: viewerLogin }));
      });
    },
    (k) => fetchProjectAssignedItems(k.projectId, k.login),
    'projects',
    [viewerLogin],
    !viewerLogin,
    'assigned-by-me',
  );
}
