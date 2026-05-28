import { fetchProjectActiveItems, type ActiveItem } from '../../api/queries/projectActiveItems';
import { useFanout, type FanoutState } from '../../hooks/useFanout';
import { loadSettings } from '../../settings/settingsStore';

// Team is heavier than the dashboard widgets (one request per project across
// the whole org), so we poll it on a slower cadence to keep the quota safe.
const TEAM_POLL_INTERVAL_MS = 10 * 60 * 1000;

export function useTeamActivity(): FanoutState<ActiveItem> {
  return useFanout<string, ActiveItem>(
    async () => {
      const settings = await loadSettings();
      return settings.orgs.flatMap((o) => {
        const excluded = new Set(o.teamExcludedProjectIds);
        return o.projects.filter((p) => !excluded.has(p.id)).map((p) => p.id);
      });
    },
    (projectId) => fetchProjectActiveItems(projectId),
    'projects',
    [],
    false,
    'team-activity',
    TEAM_POLL_INTERVAL_MS,
  );
}
