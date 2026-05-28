# DevPulse

A small desktop app that puts your team's GitHub Projects work on one screen:
PRs awaiting your review, tasks on your plate, items in Testing that you
posted, things you handed off to others, the full kanban per project, and a
Team view showing who is doing what right now.

Built with Tauri 2 + React 19 + TypeScript. Runs as a native app on macOS,
Windows and Linux.

## Install

Grab the latest build for your platform from the
[Releases](../../releases) page.

The app is **unsigned**, so OS warnings on first launch are expected:

- **macOS:** double-click → "cannot be opened" → System Settings → Privacy &
  Security → "Open Anyway". Or `xattr -dr com.apple.quarantine /Applications/DevPulse.app`.
- **Windows:** SmartScreen → "More info" → "Run anyway".
- **Linux:** download `.deb` (Debian/Ubuntu) or `.AppImage` (anywhere).
  `.AppImage` may need `chmod +x` before running.

## First-time setup

1. **Sign in.** The login screen opens GitHub's device-flow page. Enter the
   shown code; DevPulse stores the token in the OS keyring.
2. **Settings → Add organization.** Enter the org slug. DevPulse fetches its
   project list automatically.
3. **Tick projects to track on the dashboard.** Ticked projects feed the four
   dashboard widgets (Testing queue, My open tasks, Assigned by me, Kanban).
4. **Team → Manage people.** Pick the colleagues to show on the Team screen.
5. **Team → Manage projects.** Optionally hide dead/irrelevant projects from
   the Team view (independent of the dashboard tracking list).

## How it stays cheap on the API

GitHub's GraphQL budget is 5000 points/hour. DevPulse stays well under that:

- Dashboard widgets poll every **60 s**; Team polls every **10 min**.
- Project lists are fetched **only when you click Refresh** in Settings.
- Members are fetched **only when you open "Manage people"**.
- When `x-ratelimit-remaining` drops below 100, polling **pauses
  automatically** until the GitHub reset; a banner shows the resume time.
- Boots from a localStorage cache, so widgets render instantly before the
  first refresh comes back.

## Development

```bash
git clone <this repo>
cd devpulse
npm install
npm run tauri dev
```

Requires Node 20+ and a Rust toolchain (`rustup` stable). On Linux you also
need the Tauri system deps — see [`./.github/workflows/release.yml`](./.github/workflows/release.yml)
for the exact `apt` list.

Useful scripts:

| script                | what it does                                  |
| --------------------- | --------------------------------------------- |
| `npm run tauri dev`   | run the app locally with hot reload           |
| `npm run check`       | ESLint + `tsc --noEmit` + Prettier check      |
| `npm run lint`        | ESLint + `tsc --noEmit`                       |
| `npm run tauri build` | produce a release bundle for the current host |

## Releasing

Tag a commit on `main`:

```bash
git tag v0.x.y
git push origin v0.x.y
```

The `Release` workflow builds for macOS (arm + x64), Windows and Linux, then
attaches the bundles to a **draft** GitHub release. Publish it manually when
the artefacts look right.

## Layout

```
src/
  api/queries/   GraphQL queries + hand-written response types
  auth/          device-flow + keyring wrappers
  features/      one folder per dashboard widget / screen
  hooks/         generic hooks (useFanout, cache, rateLimit)
  settings/      settings store + Settings screen
  ui/            small shared primitives
src-tauri/       Rust side (auth, GraphQL bridge, rate-limit emit)
docs/            PLAN, ARCHITECTURE, DECISIONS
```
