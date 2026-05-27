# Project: GitHub Projects Dashboard

Desktop app aggregating GitHub Projects v2 boards across an organization.
Stack: Tauri 2 + React 18 + TypeScript + Tailwind + shadcn/ui.
Target platforms: macOS (dev), Windows + Linux (.deb, AppImage) via CI.

## Working agreement

- **Plan before coding.** For any non-trivial change, output a short plan first
  and wait for confirmation. "Trivial" = single-file, <20 lines, no new deps.
- **Small diffs.** Prefer many focused commits over one big change.
- **No speculative generality.** Build for current requirements. No "what if we
  later need..." abstractions. YAGNI strictly.
- **Ask, don't assume.** If a requirement is ambiguous, ask one sharp question
  rather than guessing and producing 200 lines that need rewriting.
- **No silent dependency additions.** Adding any npm/cargo dependency requires
  explicit approval with a one-line justification.

## Code quality bar

- TypeScript `strict: true`. No `any`. No `// @ts-ignore` without a comment
  explaining why and a linked issue if it's temporary.
- No `console.log` in committed code. Use the logger module.
- Errors are values: every fetch/IO has explicit error handling. No bare
  try/catch that swallows.
- No magic numbers/strings: extract to named consts at top of file.
- Functions: one job, <40 lines as a soft cap. If longer, justify in a comment.
- Components: presentational vs. container split. Data fetching lives in
  hooks (`useXxx`), not inside JSX components.

## What NOT to do

- Do NOT install state managers (Redux/Zustand/Jotai) unless I ask. React
  state + a couple of custom hooks is enough for this app.
- Do NOT add testing libraries proactively. We'll add Vitest when we have
  something worth testing.
- Do NOT generate boilerplate "just in case" files (empty contexts, providers,
  utils.ts, types.ts grab-bags). Create files when there's content for them.
- Do NOT use barrel exports (`index.ts` re-exports). Import from source.
- Do NOT add comments that restate the code. Comments explain _why_, not _what_.
- Do NOT use `useEffect` for derived state. Compute during render.

## GraphQL specifics

- All GitHub queries live in `src/api/queries/`, one query per file as a
  named `.graphql` string export. No inline query strings in components.
- Every query has a matching TypeScript type for its response, hand-written
  (we are NOT setting up codegen for this size of project).
- Rate limit: log remaining quota from response headers. Back off if <100.

## Commit discipline

- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`.
- One logical change per commit. If you find yourself writing "and" in a
  commit message, split it.

## When stuck

Stop and ask. Do not generate a "best guess" 300-line file. A short clarifying
question is always preferred over speculative code.
