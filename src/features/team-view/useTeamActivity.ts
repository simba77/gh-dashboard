import { fetchProjectActiveItems, type ActiveItem } from '../../api/queries/projectActiveItems';
import { useFanout, type FanoutState } from '../../hooks/useFanout';
import { loadSettings } from '../../settings/settingsStore';

export function useTeamActivity(): FanoutState<ActiveItem> {
  return useFanout<string, ActiveItem>(
    async () => {
      const settings = await loadSettings();
      return settings.orgs.flatMap((o) => o.projects.map((p) => p.id));
    },
    (projectId) => fetchProjectActiveItems(projectId),
    'projects',
    [],
  );
}
