# Phase 0 — Research: PRD Visualizer Extension

**Date**: 2026-05-07
**Constitution principle invoked**: III. Verify Library Docs Before Coding —
every dependency listed below requires a Context7 / canonical-doc citation in
the commit that introduces it (FR-018).

---

## R1 — VSCode Extension API: WebviewView vs Webview Panel

- **Decision**: Use `WebviewViewProvider` (registered against a `views` contribution in `package.json`) for the sidebar grid surface. Use a separate command (`prd.openKanban`) that does NOT open a `WebviewPanel` — it spawns the local server and calls `vscode.env.openExternal` instead.
- **Rationale**: `WebviewView` lives in the activity bar / sidebar, persists across editor focus changes, auto-injects VSCode CSS variables for theme tracking (FR-005). A `WebviewPanel` would create a tab and lose sidebar persistence. The kanban surface needs full-screen real estate, so an external browser tab via `openExternal` is preferred over any in-editor webview.
- **Alternatives**: (a) `WebviewPanel` for both surfaces — rejected: kanban would be cramped in an editor tab. (b) `TreeView` for the grid — rejected: cannot render arbitrary HTML/CSS for tile layout. (c) Status-bar item — rejected: cannot host a grid.
- **Doc citation required at commit**: `https://code.visualstudio.com/api/references/vscode-api#WebviewViewProvider` (resolve via Context7 or WebFetch).

## R2 — Theme tracking (sidebar) vs OS preference (browser)

- **Decision**: Sidebar webview uses `var(--vscode-*)` CSS variables exclusively for color (no hard-coded colors). Browser kanban ships a static palette with a `prefers-color-scheme: dark` media query. No JavaScript theme synchronization between them.
- **Rationale**: VSCode auto-injects its theme variables into webviews; the browser cannot read them (they don't exist outside the editor process). Two separate theming scopes match the two separate runtime environments. Avoids any cross-process theme RPC.
- **Alternatives**: (a) Send theme JSON from extension to browser — rejected: needless coupling, no real-time benefit. (b) Use only static palette in sidebar — rejected: would not adapt to high-contrast theme (acceptance scenario US1.3).
- **Doc citation**: VSCode "Theming" reference + MDN `prefers-color-scheme`.

## R3 — File watching: `onDidSaveTextDocument` vs `FileSystemWatcher`

- **Decision**: Use `vscode.workspace.onDidSaveTextDocument`, filter for files under the configured PRD root, debounce 0ms (re-fetch on every save).
- **Rationale**: Save events are deterministic and originate from VSCode itself. `FileSystemWatcher` silently exhausts on networked or large directories and stops firing without warning. The source PRD logs this as a Decisions Log row dated 2026-05-07.
- **Alternatives**: (a) `FileSystemWatcher` — rejected per above. (b) Polling — rejected: wasteful and slower than save events.
- **Doc citation**: `vscode.workspace.onDidSaveTextDocument` API ref.

## R4 — Local server: bare `http` vs `express`

- **Decision**: Use `express` for the kanban server. Listen on `127.0.0.1` only. Auto-pick port starting at 7373, walking up on `EADDRINUSE` until success or 7382 (10-port window) before erroring.
- **Rationale**: Express simplifies static-file serving (`kanban-static/kanban.html` + bundled JS) plus one `/api/prds` JSON route — that is sufficient. Bare `http` would re-implement static serving by hand. Express remains a well-maintained, low-surface-area dep; one route + one static dir is its sweet spot.
- **Alternatives**: (a) Bare `http` — rejected: re-implements MIME and static-file logic for no gain. (b) `fastify` — rejected: more deps, no measurable benefit at this surface size. (c) Vite dev server — rejected: dev tool, not deployable inside an extension bundle.
- **Doc citation**: `https://expressjs.com/en/4x/api.html` (Express 4.x stable).

## R5 — Browser launcher: VSCode's `openExternal` vs `open` package

- **Decision**: Use `vscode.env.openExternal(vscode.Uri.parse(url))` from the extension. Do NOT bundle the `open` npm package.
- **Rationale**: VSCode already provides a cross-platform browser-launch API; bundling `open` adds a dependency for behavior the host already exposes. Removes the `open` line from `package.json` listed in plan.md (correction noted: dep dropped after research).
- **Alternatives**: (a) `open` npm package — rejected per above (extra dep). (b) Shell out to `xdg-open` / `start` — rejected: not portable.
- **Doc citation**: `vscode.env.openExternal` API ref.

## R6 — VSCode → editor round-trip from browser

- **Decision**: Browser kanban "open in editor" links use the `vscode://file/<absolute-path>` URL scheme. Extension does not need to intercept; the OS handler routes to the running VSCode instance.
- **Rationale**: Native handler in VSCode for the `vscode://` scheme means zero callback dance, no HTTP round-trip back to the kanban server. URL-encode the absolute path to preserve spaces.
- **Alternatives**: (a) HTTP callback to `/api/open-file` then `vscode.window.showTextDocument` — rejected: requires the browser tab to know the kanban server URL is the same machine and adds round-trip latency. (b) Browser-only file rendering — rejected: explicit FR-007 requires editor focus return.
- **Doc citation**: VSCode "URL handler" docs.

## R7 — Type guards vs Zod

- **Decision**: Hand-written predicate type guards (`function isPrd(x: unknown): x is Prd { ... }`) for all four cross-process boundaries. No Zod, io-ts, or yup.
- **Rationale**: One CLI we control, one schema. Constitution Principle V states this directly. Hand-written guards compile to nothing at runtime beyond the comparisons themselves; Zod adds ~30KB to the extension bundle for value not delivered.
- **Alternatives**: Zod, io-ts — rejected per above.
- **Doc citation**: TypeScript Handbook "User-Defined Type Guards".

## R8 — Bundle strategy: esbuild vs webpack vs raw tsc

- **Decision**: `esbuild` with two configs — one for the extension (CommonJS, target Node 20, externalize `vscode`), one for the shared frontend bundle (IIFE, target ES2022, no externals). Both run via a single `esbuild.config.mjs`. No `webpack`.
- **Rationale**: VSCode's modern extension scaffolding (2024+) recommends esbuild for sub-second builds. Webpack is heavier and slower; raw `tsc` cannot bundle the frontend into a single JS file for the webview.
- **Alternatives**: (a) Webpack — rejected: slower, heavier config. (b) `tsc` only — rejected: no bundling, would need separate per-file webview loading. (c) Vite — rejected: dev-server-oriented; production bundle output for a webview is awkward.
- **Doc citation**: `https://esbuild.github.io/getting-started/` + VSCode extension scaffolding docs.

## R9 — `--with-tree` CLI flag dependency

- **Decision**: v0.1 ships flat (no parent / children rendering). The `prd summary --with-tree` enhancement is a follow-on task tracked in PRD.md §11 but is NOT a v0.1 blocker. The `Prd` type marks `parent` and `children` as optional fields so they can be consumed without a refactor when the CLI lands them.
- **Rationale**: Spec assumption explicitly states "v1 ships flat if this enhancement is not yet available". Pre-architecting the optional fields satisfies Principle I (pragmatic) without committing the user to a CLI change.
- **Alternatives**: (a) Block v0.1 on CLI change — rejected: out-of-scope work. (b) Local `.md` parsing as fallback — rejected: violates Principle IV.

## R10 — VSCode workspace trust

- **Decision**: Declare `capabilities.untrustedWorkspaces.supported = "limited"` in `package.json`. In untrusted workspaces, render the last-known JSON (if any) from extension state and skip CLI invocation; show a banner explaining the limitation.
- **Rationale**: FR-015 mandates limited functionality in untrusted folders. Shelling to the CLI is the only trust-requiring action; rendering cached data is safe.
- **Alternatives**: (a) `supported = false` — rejected: blocks the read-only render path users expect. (b) `supported = true` — rejected: shelling to a binary path under user control in an untrusted workspace is the exact threat model VSCode workspace trust addresses.
- **Doc citation**: `https://code.visualstudio.com/api/extension-guides/workspace-trust`.

## Open items (none block Phase 1)

- The default port (7373) and walk window (10) are documented but configurable via a future `prd.kanbanPort` setting if collisions become routine. Not required for v0.1.
- Number of "actions" surfaced per tier in the side panel is bounded by the templates in `commandTemplates.ts`; full template list is finalized in Phase 1 contracts/webview-actions.md.

---

**Outcome**: Zero `NEEDS CLARIFICATION` markers remain. All technology choices have a doc-citation requirement bound to FR-018. Ready for Phase 1.
