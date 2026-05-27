import { invoke } from '@tauri-apps/api/core';

// The token itself lives in the OS keyring on the Rust side and never crosses
// into JS. These wrappers only query presence and clear it.

export function hasToken(): Promise<boolean> {
  return invoke<boolean>('is_authenticated');
}

export function clearToken(): Promise<void> {
  return invoke('logout');
}
