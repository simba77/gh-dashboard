import { fetchProjectActiveItems, type ActiveItem } from '../../api/queries/projectActiveItems';
import { useFanout, type FanoutState } from '../../hooks/useFanout';
import { loadSettings } from '../../settings/settingsStore';

// Items in Testing are covered by the dedicated "Testing waiting for me"
// widget (where I'm the author/постановщик). Excluding them here keeps the
// two lists meaningfully distinct on the dashboard.
const EXCLUDE_STATUS = new Set(['testing']);

interface Key {
  projectId: string;
  login: string;
}

// Tasks assigned to me that aren't done and aren't in Testing — i.e. the
// work currently sitting on my plate.
export function useMyTasks(viewerLogin: string | null): FanoutState<ActiveItem> {
  return useFanout<Key, ActiveItem>(
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
    async (k) => {
      const items = await fetchProjectActiveItems(k.projectId);
      return items.filter((it) => {
        if (!it.assignees.includes(k.login)) {
          return false;
        }
        const status = it.status?.toLowerCase();
        return status === undefined || !EXCLUDE_STATUS.has(status);
      });
    },
    'projects',
    [viewerLogin],
    !viewerLogin,
    'my-tasks',
  );
}
