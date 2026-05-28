import Database from '@tauri-apps/plugin-sql';

// Filename matches the migration registered Rust-side in lib.rs. The plugin
// resolves `sqlite:` URLs to a file under the OS-appropriate app-data dir,
// which is exactly where we want it (per-user, per-install, survives upgrades).
const DB_URL = 'sqlite:devpulse.db';

// One Database handle per process. `Database.load` opens (or reuses) the
// connection; subsequent calls return the same wrapper. We memoise the promise
// so concurrent callers during boot don't race the open.
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  dbPromise ??= Database.load(DB_URL);
  return dbPromise;
}
