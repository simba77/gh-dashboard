import { fetchProjectTestingItems, type TestingItem } from '../../api/queries/projectTestingItems';
import { useFanout, type FanoutState } from '../../hooks/useFanout';
import { loadSettings } from '../../settings/settingsStore';

// Carries both inputs of fetchProjectTestingItems so the per-key fetcher in
// useFanout doesn't close over `viewerLogin` and fight TypeScript's narrowing.
interface Key {
  projectId: string;
  login: string;
}

export function useTestingQueue(viewerLogin: string | null): FanoutState<TestingItem> {
  return useFanout<Key, TestingItem>(
    async () => {
      if (!viewerLogin) {
        return [];
      }
      const settings = await loadSettings();
      return settings.orgs.flatMap((o) =>
        o.projects.map((p) => ({ projectId: p.id, login: viewerLogin })),
      );
    },
    (k) => fetchProjectTestingItems(k.projectId, k.login),
    'projects',
    [viewerLogin],
    !viewerLogin,
  );
}
