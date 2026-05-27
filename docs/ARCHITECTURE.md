# Architecture

## Folder layout

src/
api/
client.ts           # fetch wrapper, auth header injection, rate-limit log
queries/            # .ts files exporting query strings + response types
auth/
deviceFlow.ts       # OAuth device flow logic
tokenStorage.ts     # Tauri keyring wrapper
features/
pr-review/          # PRs awaiting my review widget
testing-queue/      # Tasks in Testing waiting for me
assigned-by-me/     # Tasks I assigned to others
kanban/             # Full kanban view per project
hooks/                # generic reusable hooks (usePolling, etc.)
ui/                   # shadcn components + small primitives
lib/                  # pure utilities, no React, no IO
App.tsx
main.tsx

src-tauri/              # Rust side, minimal — only secure storage
# and platform shell

## Rules

- Features are independent: a feature folder owns its components, hooks,
  and types. No cross-feature imports except through `lib/` or `api/`.
- `lib/` is pure and dependency-free. No imports from `features/` or `api/`.
- Auth state lives in one place (`auth/`). Read via a hook, never via
  direct localStorage/keyring access from features.

## Data flow

1. App boot → check stored token → if absent, show login screen.
2. Login screen → device flow → token saved to OS keyring.
3. Main screen → polling hook fires GraphQL queries every 60s.
4. Each widget owns its own query + cache.
5. localStorage holds last-known data per widget for instant render on boot.
