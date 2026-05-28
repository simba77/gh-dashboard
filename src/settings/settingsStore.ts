import { load, type Store } from '@tauri-apps/plugin-store';

import type { OrgProject } from '../api/queries/orgProjects';

// Discovered list per org (manually refreshed by the user) + two independent
// subsets: which projects feed the dashboard widgets, and which ones the
// Team view should hide. Stored without the watched-people list (kept on
// Settings itself).
export interface OrgSettings {
  login: string;
  projects: OrgProject[];
  trackedProjectIds: string[];
  teamExcludedProjectIds: string[];
}

// Cached so the Team view can render names/avatars without any extra request.
export interface WatchedPerson {
  login: string;
  name?: string | null;
  avatarUrl?: string;
}

export interface Settings {
  orgs: OrgSettings[];
  watched: WatchedPerson[];
}

const STORE_FILE = 'settings.json';
const SETTINGS_KEY = 'settings';
const EMPTY: Settings = { orgs: [], watched: [] };

// One store handle per process. `load` resolves the JSON file in the app config
// dir on the Rust side; we open it lazily on first access.
let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE);
  return storePromise;
}

// Older shape lacked `trackedProjectIds`, `teamExcludedProjectIds` and
// `watched`. Anything previously stored under `projects` was, by definition,
// what the user wanted tracked, so we seed both arrays from it.
interface LegacyOrgSettings {
  login: string;
  projects: OrgProject[];
  trackedProjectIds?: string[];
  teamExcludedProjectIds?: string[];
}

interface LegacySettings {
  orgs: LegacyOrgSettings[];
  watched?: WatchedPerson[];
}

function migrate(raw: LegacySettings): Settings {
  return {
    orgs: raw.orgs.map((o) => ({
      login: o.login,
      projects: o.projects,
      trackedProjectIds: o.trackedProjectIds ?? o.projects.map((p) => p.id),
      teamExcludedProjectIds: o.teamExcludedProjectIds ?? [],
    })),
    watched: raw.watched ?? [],
  };
}

export async function loadSettings(): Promise<Settings> {
  const store = await getStore();
  const value = await store.get<LegacySettings>(SETTINGS_KEY);
  return value ? migrate(value) : EMPTY;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set(SETTINGS_KEY, settings);
  await store.save();
}
