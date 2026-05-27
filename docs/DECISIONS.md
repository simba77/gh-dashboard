# Decisions

## D1. Tauri over Electron
Bundle size and resource use. Accepted trade-off: WebKit on Linux/Mac.

## D2. Device Flow over PAT
UX for non-technical colleagues. Single OAuth App, public client_id in binary.

## D3. No codegen for GraphQL
Project size doesn't justify the toolchain. Hand-written types in queries/.

## D4. No global state manager
React state + hooks. Revisit if app exceeds ~15 components with shared state.

## D5. No tests until v0.2
We're prototyping for a small known audience. Add Vitest when refactoring.
