import { invoke } from '@tauri-apps/api/core';

// Thin wrapper over the Rust `graphql_request` command. Auth header injection
// and rate-limit logging happen on the Rust side, where the token lives.
export function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('graphql_request', { query, variables });
}
