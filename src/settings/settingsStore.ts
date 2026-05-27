import { load, type Store } from '@tauri-apps/plugin-store';

import type { OrgProject } from '../api/queries/orgProjects';

// Tracked projects are stored with their title/number so the dashboard can
// render them on boot without refetching the org's full project list.
export interface OrgSettings {
  login: string;
  projects: OrgProject[];
}

export interface Settings {
  orgs: OrgSettings[];
}

const STORE_FILE = 'settings.json';
const SETTINGS_KEY = 'settings';
const EMPTY: Settings = { orgs: [] };

// One store handle per process. `load` resolves the JSON file in the app config
// dir on the Rust side; we open it lazily on first access.
let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE);
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  const store = await getStore();
  const value = await store.get<Settings>(SETTINGS_KEY);
  return value ?? EMPTY;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const store = await getStore();
  await store.set(SETTINGS_KEY, settings);
  await store.save();
}
