# Implementation Plan

Desktop dashboard aggregating GitHub Projects v2 boards across a GitHub
organization. macOS dev, Win/Linux via CI. Each user runs locally with their
own GitHub account.

## Stack

- Tauri 2 + React 19 + TypeScript (strict)
- Tailwind 4 + shadcn/ui
- GitHub GraphQL API (REST is not used; Projects v2 lives only in GraphQL)
- OAuth Device Flow for authentication

## Auth model

- OAuth App registered on github.com with Device Flow enabled.
- Client ID is public (embedded in binary). No client secret — public client.
- Token stored in OS keyring via Tauri plugin.
- Required scopes: `read:org`, `read:project`, `repo` (read access to issues/PRs).

## Features (4 widgets on dashboard)

1. **PRs awaiting my review** — `search` query with `review-requested:@me`,
   show CI status (green/yellow/red) from `statusCheckRollup`.
2. **Tasks in Testing waiting for me** — items from configured org projects
   where Status field = "Testing".
3. **Tasks I assigned to others** — items where I am the author and assignee
   is someone else.
4. **Full kanban per project** — tabs per project, columns by Status field.

## Stages

### Stage 0 — Foundation (DONE)

Tauri + React + TypeScript skeleton, strict tsconfig, ESLint flat config,
Prettier, EditorConfig, husky + lint-staged, CI workflows.

### Stage 1 — OAuth App registration (DONE, manual)

OAuth App created on github.com with Device Flow enabled. Client ID stored
in source (see `src/auth/config.ts` once created).

### Stage 2 — Authentication

- Device Flow implementation: request device code, show user_code + URL,
  poll for token.
- Token storage via OS keyring (Tauri keyring plugin).
- Login screen + auth state hook.
- Logout that actually removes the token.
- Single GraphQL query `viewer { login }` to verify token works.

### Stage 3 — Settings

- Screen to add organizations by slug.
- For each organization, list its ProjectsV2 and let user pick which to track.
- Persist selection locally (JSON in app config dir, not keyring).

### Stage 4 — Widgets (one at a time)

- 4.1 PRs awaiting review (simplest, uses `search` API).
- 4.2 Testing queue (uses project items + Status field filter).
- 4.3 Tasks assigned by me to others.
- 4.4 Full kanban view per project.

### Stage 5 — Polish

- Polling every 60s with localStorage cache for instant render on boot.
- "Updated N seconds ago" indicator.
- Error states and rate-limit handling.

### Stage 6 — Distribution

- Test release.yml workflow with a real tag.
- Document install steps for colleagues in README.

## Out of scope for v1

- Drag-n-drop status changes from the dashboard (read-only first).
- Native notifications on new Testing items.
- Multi-organization support per user (one org per user for v1).
- Tests (see DECISIONS.md D5).
- Code signing on macOS/Windows (colleagues click through warnings).
