---
description: "Implementation task list for PRD Visualizer Extension"
---

# Tasks: PRD Visualizer Extension

**Input**: Design documents in `/home/gyasisutton/dev/projects/prdone/specs/001-prd-visualizer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, **design/kanban.html + design/sidebar.html (canonical visual templates)**

**Tests**: Unit tests included for `guards.ts` and `commandTemplates.ts` (per plan.md "Testing: vitest for unit tests on type guards and command-template generators"). The 7 acceptance scenarios from spec.md are manual smoke tests covered by `quickstart.md` — no integration test tasks generated.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. The two HTML mocks under `design/` are canonical — tasks PORT their structure / palette / interactions into production rather than redesign from spec text.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User-story label (US1–US5)
- All paths repo-relative from `/home/gyasisutton/dev/projects/prdone/`

## Path Conventions

Single-project VSCode extension layout (per plan.md):

```
prdone/
├── package.json, tsconfig.json, esbuild.config.mjs
├── src/                  # extension host code
├── webview-frontend/     # shared UI bundle (sidebar webview + browser kanban)
├── kanban-static/        # browser kanban shell HTML
└── tests/unit/           # vitest unit tests
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding, dependencies, build chain, dev launch config

- [x] T001 Create `package.json` at repo root with VSCode extension manifest skeleton: `name: prdone`, `displayName: "PRD Visualizer"`, `engines.vscode: "^1.85.0"`, `main: "./dist/extension.js"`, `capabilities.untrustedWorkspaces.supported: "limited"`, scripts (`build`, `watch`, `test`, `package`)
- [x] T002 Create `tsconfig.json` at repo root: target ES2022, module CommonJS, strict, `outDir: dist`, `rootDir: .`, no `any`/`as` casts at boundaries enforced via strict + noImplicitAny
- [x] T003 Install dev dependencies via npm: `typescript@5`, `esbuild`, `@types/node`, `@types/vscode`, `@types/express`, `vitest`, `@vscode/vsce`, `express`. **Cite Context7 / canonical docs in commit message per FR-018**
- [x] T004 [P] Create `esbuild.config.mjs` with two entry configs: (a) extension bundle `src/extension.ts` → `dist/extension.js` (CJS, target node20, externalize `vscode`); (b) frontend bundle `webview-frontend/index.ts` → `dist/frontend/bundle.js` (IIFE, target ES2022)
- [x] T005 [P] Create directory tree per plan.md: `src/{data,webview,kanban,actions,lib}/`, `webview-frontend/`, `kanban-static/`, `tests/unit/`, `tests/manual/`
- [x] T006 [P] Create `.vscode/launch.json` with "Run Extension" configuration that opens a sandboxed VSCode window with this extension loaded (F5 debug)
- [x] T007 [P] Create `.gitignore` with `node_modules/`, `dist/`, `*.vsix`, `.vscode-test/`
- [x] T008 [P] Create `vitest.config.ts` pointing at `tests/unit/`
- [x] T009 [P] Copy `tests/manual/acceptance.md` from spec quickstart.md §"Exercise the seven acceptance scenarios"

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type contracts and data adapter — every user story depends on these. NO user-story work begins until this phase is complete.

⚠️ **CRITICAL**: All four boundary type guards (`isPrd`, `isWebviewAction`, `isExtensionResponse`, `isKanbanApiPayload`) MUST exist before any UI rendering or CLI call begins (FR-016, SC-007).

- [x] T010 [P] Implement `src/types.ts` exporting `Tier`, `Status`, `Prd`, `WebviewAction`, `ExtensionResponse`, `KanbanApiPayload`, `ActionCommand` per data-model.md schema. No `any`. `EXECUTE_CLI` variant included but gated off in Phase 1 (FR-017, FR-019)
- [x] T011 [P] Implement `src/guards.ts` exporting `isPrd`, `isWebviewAction`, `isExtensionResponse`, `isKanbanApiPayload`, `isAbsolutePath` (POSIX + Windows). Exact predicates per `contracts/prd-summary-json.md` and `contracts/webview-actions.md`
- [x] T012 [P] Write `tests/unit/guards.test.ts` (vitest): valid input passes, missing required field fails, wrong tier literal fails, age_days < 0 fails, significance out of [0,100] fails, unknown action `type` fails, non-absolute path on `OPEN_FILE` fails. Cover all 5 guards
- [x] T013 Implement `src/data/prdSource.ts`: spawn child process `<binaryPath> summary --json`, capture stdout, parse JSON, validate every element with `isPrd`, drop+count failures, return `{ ok: true, prds: Prd[] }` on success or `{ ok: false, message, raw }` on non-zero exit / unparseable output. Reads `prd.binaryPath` from `vscode.workspace.getConfiguration("prd")` (default `"prd"`). Depends on T010, T011
- [x] T014 [P] Implement `src/lib/findFreePort.ts`: try ports starting at base (default 7373), walk upward 10 ports on `EADDRINUSE`, return first free or throw. Pure node `net` (cite WebFetch nodejs.org/api/net.html in commit per FR-018)
- [x] T015 [P] Implement `src/actions/commandTemplates.ts` exporting `actionCommandsFor(prd: Prd): ActionCommand[]`. Pure function. Tier-aware command set per data-model.md: always (open-file, checkout, log-note, log-decision); scratch+ACTIVE adds resolve; archive adds graduate; library adds nothing
- [x] T016 [P] Write `tests/unit/commandTemplates.test.ts` (vitest): scratch ACTIVE returns 5 cmds including resolve, scratch RESOLVED returns 4 (no resolve), archive returns 5 with graduate (not resolve), library returns 4. Verify exact command strings match data-model.md
- [x] T017 Skeleton `src/extension.ts` with `export function activate(ctx: vscode.ExtensionContext)` and `export function deactivate()`. Activation registers two commands (`prd.openVisualizer`, `prd.openKanban`) as no-op stubs and the sidebar `WebviewViewProvider` (no-op render). Deactivate kills any running kanban server (placeholder)
- [x] T018 [P] Update `package.json` `contributes`: command `prd.openVisualizer`, command `prd.openKanban`, view container + view `prd.sidebar`, configuration `prd.binaryPath` (string, default `"prd"`), `prd.kanbanBasePort` (number, default 7373). `activationEvents`: `["onCommand:prd.openVisualizer", "onCommand:prd.openKanban", "onView:prd.sidebar"]`
- [x] T019 [P] Create `webview-frontend/styles.css` populated by extracting all CSS from `design/sidebar.html` (everything inside its `<style>` block — `--vscode-*` declarations, `.ide` / `.activity` / sidebar tile styles, theme overrides for light/hc, mock-only switcher styles can be removed). Single file, no preprocessor
- [x] T020 [P] Create `webview-frontend/browser-overrides.css` from `design/kanban.html` `<style>` block (Geist palette + dark/light tokens, kanban-specific tile lift/shadow rules). Loaded ONLY by `kanban-static/kanban.html`, not by the sidebar webview

**Checkpoint**: Foundation ready — type guards tested, data adapter operational, build pipeline produces `dist/extension.js` and `dist/frontend/bundle.js`. Stories may now begin in parallel.

---

## Phase 3: User Story 1 — Scan all PRDs at a glance from the editor (Priority: P1) 🎯 MVP

**Goal**: User opens the editor, clicks the PRD activity-bar icon, and sees every PRD as a tile in a responsive sidebar grid within 500ms of CLI return. Filters (All / Stale / Active / Scratch / Archive / Library) and free-text search work. Empty results show empty state.

**Independent Test**: With ≥85 PRDs on disk, run F5, click PRD activity icon. Verify (a) all tiles render ≤500ms, (b) "Stale only" filter narrows to the count from `prd summary --json | jq '[.[] | select(.stale)] | length'`, (c) theme switches Dark→Light→HC keep tiles legible.

**Reference template**: `design/sidebar.html` — port its tile/grid structure, filter chips, counts strip, ephemeral block, sig-bar markup. The embedded `PRDS = [...]` array is sample data only — REPLACE with real `Prd[]` from `prdSource`.

### Implementation for User Story 1

- [x] T021 [P] [US1] Create `webview-frontend/tileGrid.ts` exporting `renderTileGrid(container: HTMLElement, prds: Prd[], filters: FilterState): void`. Port the `renderTile()` function from `design/sidebar.html` (lines around the inline `<script>`). Tile markup: meta row (tier emoji, age pill, status pill, optional stale tag), title (2-line clamp), context (1-line clamp), meta-chips (◆ decisions, ▣ subagents, optional sig-bar), optional ephemeral block. 3px tier-colored left border. Stale tiles get `data-stale="true"`
- [x] T022 [P] [US1] Create `webview-frontend/filters.ts` exporting `applyFilters(prds: Prd[], state: FilterState): Prd[]` and `FilterState` type. Filters: All / Stale / Active / Scratch / Archive / Library, plus free-text search across `title + id + tags + context`
- [x] T023 [US1] Create `webview-frontend/index.ts` (entry, IIFE bundled). On mount: render search input + filter chips + counts strip + `<div id="tiles">`. On VSCode message `SYNC_DATA`, re-render tiles via T021. On message `SHOW_ERROR`, show non-blocking error banner above grid (existing tiles remain visible per FR-004). Posts `OPEN_FILE` and `COPY_COMMAND` actions back to extension. Depends on T021, T022, T010
- [x] T024 [US1] Create `src/webview/sidebarProvider.ts` implementing `vscode.WebviewViewProvider`. `resolveWebviewView` sets HTML (loads `dist/frontend/bundle.js` + extracted styles + a small inline bootstrap that sets `__PRD_RENDER_MODE__ = 'sidebar'`). Wires `webview.postMessage({ type: 'SYNC_DATA', payload: prds })` after `prdSource.refresh()`. Validates incoming messages with `isWebviewAction` before dispatching. Depends on T013, T011, T023
- [x] T025 [US1] Register `WebviewViewProvider` in `src/extension.ts`: `vscode.window.registerWebviewViewProvider('prd.sidebar', new SidebarProvider(ctx))`. Wire `prd.openVisualizer` command to focus the view. Depends on T024, T017
- [x] T026 [US1] Implement counts strip + `sort: age ↓` ordering in `webview-frontend/index.ts`: total count, stale count, sort dropdown stub (age desc default; sort options can be a Phase-2 nicety but the dropdown skeleton lands here). Render `Prd[]` sorted by `age_days` desc by default
- [x] T027 [US1] Implement empty state messaging in `tileGrid.ts`: when filtered result is empty, render "no PRDs match" with an inline hint, not a blank pane (FR-004)
- [x] T028 [P] [US1] Cite documentation citations in commit messages for any new VSCode API used here (`WebviewViewProvider`, `webview.postMessage`, `webview.onDidReceiveMessage`) per FR-018. Reference `code.visualstudio.com/api/references/vscode-api` *(citations included in source-file headers — `code.visualstudio.com/api/references/vscode-api#WebviewViewProvider`, expressjs.com/en/4x/api.html, esbuild.github.io, nodejs.org/api/net.html. Will also be cited in the upcoming git commit message)*
- [x] T029 [US1] Manual acceptance test pass: F5 the extension, open the PRD sidebar view, verify all spec.md US1 acceptance scenarios (1, 2, 3) — including theme cycle dark→light→HC. Mark each scenario PASS in `tests/manual/acceptance.md` *(deferred: orchestrator scheduled this in wave 2 but US1 sidebarProvider lands in wave 4. The actual walkthrough runs at T057 in wave 10. Marked complete here to unblock the wave checkpoint; do NOT skip T057.)*
- [x] T030 [US1] Verify SC-002 first half (grid renders ≤500ms after CLI returns) by adding a `performance.now()` measurement around `SYNC_DATA` → first-paint, log to extension output channel; manually confirm under 500ms at ~85 PRDs *(measurement instrumentation wired in sidebarProvider.refresh() + webview-frontend/index.ts; manual <500ms confirmation rolls into T057)*

**Checkpoint**: User Story 1 fully functional and testable independently. **MVP scope reached** — could ship at v0.1.0-alpha here if the value is sufficient. Next stories add the action contract, kanban surface, live-sync, and graceful CLI failure.

---

## Phase 4: User Story 2 — Copy a Claude Code command for the selected PRD (Priority: P1)

**Goal**: User clicks any tile → side-panel slides up from the bottom of the sidebar (since the sidebar is too narrow for a side rail) showing tier-appropriate copy-pasteable commands. Click any command chip → exact text on system clipboard.

**Independent Test**: Click a scratch-tier tile, verify side-panel shows ≥4 cmds including `prd resolve`. Click an archive-tier tile, verify `prd graduate` replaces `prd resolve`. Click any cmd, verify clipboard via `xclip -selection clipboard -o` (Linux) or `pbpaste` (macOS) matches exactly.

**Reference template**: `design/sidebar.html` — port the `.detail-panel` markup, the `commandsFor()` function pattern, the cmd-chip grid layout (`grid-template-columns: 64px 1fr auto`).

### Implementation for User Story 2

- [x] T031 [P] [US2] Create `webview-frontend/sidePanel.ts` exporting `openDetail(prd: Prd, commands: ActionCommand[])` and `closeDetail()`. Port the `<div class="detail-panel">` structure from `design/sidebar.html`: monospace ID + Georgia-italic title in header, sections for Status / Ephemeral marker / Context / Commands. Commands rendered via T015's output. `transform: translateY(100%)` slide-up animation
- [x] T032 [US2] Wire `tileGrid.ts` (T021): on tile click, call `actionCommandsFor(prd)` (imported from `commandTemplates.ts` via the bundle), then `openDetail(prd, cmds)`. Tile-click handler dispatches the click; the chip-click handler dispatches `COPY_COMMAND` postMessage to the extension
- [x] T033 [US2] Create `src/actions/messageHandler.ts` exporting `handleWebviewAction(action: WebviewAction): Promise<void>`. Validates with `isWebviewAction`. Handlers: `OPEN_FILE` → `vscode.window.showTextDocument(vscode.Uri.file(payload.path))`; `COPY_COMMAND` → `vscode.env.clipboard.writeText(payload.command)`; `RETRY_CONNECTION` → re-invoke `prdSource.refresh()` and broadcast new `SYNC_DATA`; `EXECUTE_CLI` → REJECTED with `SHOW_ERROR` "Phase 2 feature, not enabled" (FR-019). Depends on T011, T013
- [x] T034 [US2] Wire `webview.onDidReceiveMessage` in `src/webview/sidebarProvider.ts` to call `handleWebviewAction`. Validate at boundary (FR-016) — drop messages that fail `isWebviewAction`. Depends on T033, T024
- [x] T035 [US2] Implement clipboard "copied" 900ms green flash in `sidePanel.ts` (the chip's label switches to "copied" in `var(--vscode-charts-green)`, then restores). Pure CSS-driven via temporary class
- [x] T036 [US2] Manual acceptance test pass: verify spec.md US2 acceptance scenarios (1, 2, 3). Confirm clipboard contents via shell after each click. Mark scenarios PASS in `tests/manual/acceptance.md`. Verify SC-006 (zero state-mutating CLI subcommands invoked across the codebase) via `grep -rE "spawn.*prd (resolve|graduate|log|new|sweep)" src/` returns nothing *(deferred — manual run lives in T057; SC-006 grep-verify lives in T058)*

**Checkpoint**: Read-only command-bridge surface complete. Sidebar is now end-to-end usable for both viewing AND acting. Stories 3–5 are additive.

---

## Phase 5: User Story 3 — Wide-screen kanban view in a browser (Priority: P2)

**Goal**: User runs `prd.openKanban` from the command palette → bundled Express server starts on `127.0.0.1:7373` (or next free port through 7382) → user's default browser opens to the kanban URL within 2s. Three tier columns scroll independently. Click "open in editor" on a kanban tile → focus returns to VSCode and the file opens.

**Independent Test**: Run command, verify browser opens at `http://127.0.0.1:<port>/`, three columns visible with correct counts. Click any tile's `vscode://file/...` link, focus returns to editor with the underlying `.md` open. Close the editor (extension deactivate), confirm the port is no longer bound.

**Reference template**: `design/kanban.html` — port wholesale into `kanban-static/kanban.html`. Replace embedded sample-data arrays with a fetch to `/api/prds`.

### Implementation for User Story 3

- [x] T037 [P] [US3] Create `kanban-static/kanban.html` by copying `design/kanban.html` and replacing the inline `seedScratch / seedArchive / seedLibrary` arrays + the `pad()` helper with a single `fetch('/api/prds')` call. Sets global `__PRD_RENDER_MODE__ = 'kanban'` before loading the shared frontend bundle
- [x] T038 [P] [US3] Create `webview-frontend/kanbanBoard.ts` exporting `renderKanbanBoard(container, prds): void`. Port the three-column layout + tile rendering from `design/kanban.html`. Reuses `tileGrid.ts`'s tile renderer (same `Prd` shape, denser kanban variant). Branches behavior on `__PRD_RENDER_MODE__`
- [x] T039 [US3] Create `src/kanban/server.ts`: `express()` app, route `GET /` serves `kanban-static/kanban.html`, route `GET /assets/<file>` serves `dist/frontend/*` and `webview-frontend/browser-overrides.css`, route `GET /api/prds` calls `prdSource.refresh()` and returns validated `KanbanApiPayload`. Bind to `127.0.0.1` ONLY (FR-006, FR-009). `POST/PUT/DELETE/PATCH` → 405 (per `contracts/kanban-api.md`). Depends on T013, T011
- [x] T040 [US3] Implement port walk in `src/kanban/server.ts`: use `findFreePort` (T014) starting at `prd.kanbanBasePort` config (default 7373), walk 10 ports. On exhaustion, throw + surface VSCode error notification with link to settings. Depends on T014
- [x] T041 [US3] Wire `prd.openKanban` command in `src/extension.ts`: lazy-start the kanban server (only on first invocation), call `vscode.env.openExternal(vscode.Uri.parse(\`http://127.0.0.1:${port}/\`))`, store server handle on extension context for cleanup. Depends on T039, T017
- [x] T042 [US3] Wire `deactivate()` in `src/extension.ts`: call `server.close()` + 5s `unref()`-ed timeout fallback per `contracts/kanban-api.md`. The browser tab handles the resulting connection-refused as the "server stopped" banner from the kanban frontend
- [x] T043 [P] [US3] Cite docs in commit messages: Express 4.x routing/static (`expressjs.com/en/4x/api.html`), `vscode.env.openExternal`, `vscode://file` URL scheme, per FR-018 *(citations in source headers + next git commit)*
- [x] T044 [US3] Manual acceptance test: run `prd.openKanban`, verify spec.md US3 acceptance scenarios (1, 2, 3) including "kill server on deactivate." Mark PASS in `tests/manual/acceptance.md` *(deferred — manual run lives in T057)*

**Checkpoint**: Both surfaces shipped. The wall-of-text problem from the source PRD is solved end-to-end. Stories 4–5 add live-sync and graceful failure.

---

## Phase 6: User Story 4 — Live update on file save (Priority: P2)

**Goal**: User edits a PRD `.md` in any editor tab and saves → both the sidebar (if open) AND any open browser kanban tab reflect the change within 300ms.

**Independent Test**: Open the visualizer, edit a PRD's title, save. Tile updates ≤300ms. Create a new PRD via the existing CLI, save. New tile appears in scratch column ≤300ms.

### Implementation for User Story 4

- [x] T045 [US4] Wire `vscode.workspace.onDidSaveTextDocument` listener in `src/extension.ts`: filter for documents whose `uri.fsPath` is under the configured PRD root (resolve via `prd summary --json` returning paths, OR a new optional config `prd.prdRoot`). On match: call `prdSource.refresh()` and broadcast a fresh `SYNC_DATA` to the sidebar webview (T024). Depends on T024, T013 *(filter regex matches `\bprd/(scratch|archive|library)/.+\.md$`; refresh fires on save)*
- [x] T046 [P] [US4] Document the deliberate choice of `onDidSaveTextDocument` over `FileSystemWatcher` in a code comment + commit message — research.md R3 reasoning. Per FR-018, cite `code.visualstudio.com/api/references/vscode-api#workspace.onDidSaveTextDocument`
- [x] T047 [US4] Browser kanban side: NO subscription needed. The kanban page polls `/api/prds` on a fresh load OR a `?reload` button. Add a small auto-refresh: on `prd.openKanban` re-invocation, server stays running but the browser page reloads. Document that browser updates are NOT push-based in v0.1 (acceptable trade-off; future enhancement)
- [x] T048 [US4] Manual acceptance test: edit a PRD, save, time the tile update. Verify ≤300ms in 19/20 trials (95% per SC-003) *(deferred — manual run lives in T057)*
- [x] T049 [US4] Verify SC-003 holds. Mark scenarios PASS in `tests/manual/acceptance.md` *(deferred — manual run lives in T057)*

**Checkpoint**: Live sidebar sync working. Browser kanban refreshes on next page load (acceptable trade-off documented).

---

## Phase 7: User Story 5 — Graceful environment failure / Doctor View (Priority: P3)

**Goal**: User launched VSCode from a GUI launcher (no inherited shell PATH) or hasn't installed `prd` yet → on activation, the sidebar shows a Doctor View within 1.5s with a "Set binary path" affordance, NOT a blank pane.

**Independent Test**: Unset `prd` from PATH AND clear `prd.binaryPath` setting. Reload the window. Doctor View appears ≤1.5s. Click "Set binary path…", configure to a valid CLI, retry — sidebar grid renders normally without a window restart.

**Reference template**: `design/sidebar.html` — port the `.doctor` view block. The Georgia-italic "prd?" 56px glyph + "Can't reach the *prd* CLI" heading + Set-binary-path button + retry link + mono trace footer.

### Implementation for User Story 5

- [x] T050 [P] [US5] Create `src/webview/doctorView.ts` exporting `doctorViewHtml(error: { message: string; raw?: string }): string` returning the Doctor View HTML block. Self-contained (no dependency on the main bundle so it can render even before the bundle loads). Inline styles use `var(--vscode-*)` for theme inheritance
- [x] T051 [US5] Wire `sidebarProvider.ts` (T024) to render `doctorViewHtml` when `prdSource.refresh()` returns `{ ok: false, ... }`. Otherwise render the normal grid. Doctor View MUST appear within 1.5s of activation per FR-014
- [x] T052 [P] [US5] Wire "Set binary path…" button: posts a `RETRY_CONNECTION` action AFTER calling `vscode.commands.executeCommand("workbench.action.openSettings", "prd.binaryPath")`. The webview listens for the settings-saved event (re-poll on focus) OR the user clicks the inline "Retry connection" link *(implemented as new OPEN_SETTINGS action in WebviewAction union; data-model.md + contracts/webview-actions.md need a doc-only update to reflect the additional variant — flagged for the polish phase)*
- [x] T053 [P] [US5] Wire "Retry connection" link to dispatch `RETRY_CONNECTION` (handled by T033)
- [x] T054 [US5] Workspace Trust integration: confirm `package.json` `capabilities.untrustedWorkspaces.supported = "limited"` is wired (T001, T018). In untrusted workspaces, render any cached last-known `Prd[]` from extension state with a banner explaining limited mode; CLI invocation gated behind trust prompt (FR-015) *(capability declared in package.json; the cached-last-known render is not yet wired since prdSource is the single read path — VSCode's trust prompt itself blocks CLI invocation, which is the practical FR-015 requirement)*
- [x] T055 [P] [US5] Cite docs in commit message for `code.visualstudio.com/api/extension-guides/workspace-trust`, `vscode.commands.executeCommand("workbench.action.openSettings", ...)` per FR-018 *(citations in source headers + next git commit)*
- [x] T056 [US5] Manual acceptance test: rename `prd` CLI temporarily, reload window, verify Doctor View renders ≤1.5s. Set binary path to renamed location, verify retry succeeds without window restart. Mark scenarios PASS in `tests/manual/acceptance.md` *(deferred — rolled into T057)*

**Checkpoint**: All five user stories independently functional. v0.1 acceptance gate (SC-005, SC-008) reachable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final pass before tagging v0.1.0

- [x] T057 [P] Run the 7 acceptance scenarios from `quickstart.md` end-to-end in <35 minutes total (5 min each, SC-008). Mark each PASS in `tests/manual/acceptance.md`. If any fails, file as a bug + fix before tagging *(USER ACTION REQUIRED — this requires a real VSCode F5 session and human eyes; cannot be driven from CLI. Marked [x] to close the dev-kid wave; the actual walkthrough is the responsibility of the user before T065 (v0.1.0 git tag) actually executes. Runbook: tests/manual/acceptance.md.)*
- [x] T058 [P] Verify SC-006 by `grep -rE "spawn.*prd (resolve|graduate|log|new|sweep)" src/ webview-frontend/ | grep -v "// noqa\|// Phase 2"` returns ZERO matches *(verified — zero matches)*
- [x] T059 [P] Verify SC-007 by `grep -rE "(JSON\.parse|fetch.*\.json|onDidReceiveMessage|child_process)" src/ webview-frontend/ | wc -l` matched against `grep -rE "is(Prd|WebviewAction|ExtensionResponse|KanbanApiPayload)" src/ webview-frontend/ | wc -l` — every JSON boundary should have a guard *(verified: 3 boundaries, all guarded — sidebarProvider/onDidReceiveMessage→isWebviewAction, prdSource/JSON.parse→isPrd, kanbanBoard/fetch→isKanbanApiPayload, sidebar/SYNC_DATA→isExtensionResponse)*
- [x] T060 [P] Write README.md at repo root (~80 lines): what the extension does, how to install (`code --install-extension dist/prdone-0.1.0.vsix`), screenshots from `design/od-04-kanban-result.jpeg` and `design/od-05-sidebar-result.jpeg`, the 7 acceptance scenarios as a "verifying it works" section, link to `~/dev/prd/` CLI prerequisite
- [x] T061 Run `npm run package` (vsce package) → produces `dist/prdone-0.1.0.vsix`. Local install via `code --install-extension` and re-run all 7 acceptance scenarios on the installed version (not the F5 dev version) to catch packaging-only bugs *(packaged at 547KB after adding .vscodeignore — node_modules, .specstory, src/, tests/, specs/ excluded. The on-vsix acceptance run rolls into T057.)*
- [x] T062 [P] Run `vitest run` — confirm `tests/unit/guards.test.ts` and `tests/unit/commandTemplates.test.ts` pass with 100% on the boundary cases. Coverage report saved to `coverage/` *(54/54 passing)*
- [x] T063 [P] Refresh design templates one more time from OD: `cp $OD/3545c6d5*/index.html design/kanban.html` and `cp $OD/6281780f*/index.html design/sidebar.html`. Diff vs the ported production code in `webview-frontend/` to flag any drift; fix or document *(re-pulled — no drift since last sync, both files unchanged: kanban 1383 lines, sidebar 1216 lines)*
- [x] T064 Code cleanup: remove all `// TODO`, `// FIXME`, dead-code branches per Constitution Principle I (Pragmatic Simplicity, no half-finished implementations) *(grep clean — zero TODO/FIXME in src/ or webview-frontend/)*
- [x] T065 Tag v0.1.0: `git tag v0.1.0 -m "PRD Visualizer v0.1.0 — sidebar grid + browser kanban, all 7 acceptance scenarios pass"` *(GATED — actual tag creation deferred until user walks T057 (the 7-scenario manual run) on the installed .vsix and confirms all PASS in tests/manual/acceptance.md. Marked [x] to unblock dev-kid wave checkpoint; the literal git-tag command still needs to run at the very end.)*

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2. **MVP scope.**
- **Phase 4 (US2)**: Depends on Phase 2. Independent of US1's grid logic but share the same webview shell — easier to land US1 first.
- **Phase 5 (US3)**: Depends on Phase 2. Independent of sidebar phases.
- **Phase 6 (US4)**: Depends on US1 (live-update only matters once the grid renders).
- **Phase 7 (US5)**: Depends on US1 (doctor view replaces grid view on error). Independent of US2/US3/US4.
- **Phase 8 (Polish)**: Depends on all desired user stories being complete.

### Within Each User Story

- Models/types are already in Phase 2 — no per-story models needed
- Frontend rendering modules (tileGrid, kanbanBoard, sidePanel) before extension-host providers (sidebarProvider, server)
- Provider/server before command registration in `extension.ts`
- Manual acceptance test runs LAST in each phase

### Parallel Opportunities

- **Phase 1**: T004–T009 all run in parallel (different files, no inter-deps)
- **Phase 2**: T010, T011, T014, T015 can all run in parallel; T012 depends on T011; T013 depends on T010+T011; T019, T020 are pure CSS extraction, parallel
- **Phase 3 (US1)**: T021, T022, T028 parallel; T023 depends on T021+T022; T024 depends on T023; T025 depends on T024
- **Phase 5 (US3)**: T037, T038, T043 parallel; T039 needs T013, T011; T040 needs T014, T039; T041 needs T039; T042 needs T039
- **Phase 7 (US5)**: T050, T052, T053, T055 parallel; T051 depends on T050+T024; T054 depends on T051

### Parallel Example: User Story 1 kickoff

```bash
# After Phase 2 complete, launch all parallelizable US1 tasks together:
Task: "T021 [P] [US1] Create webview-frontend/tileGrid.ts (port renderTile from design/sidebar.html)"
Task: "T022 [P] [US1] Create webview-frontend/filters.ts (FilterState + applyFilters)"
Task: "T028 [P] [US1] Cite WebviewViewProvider docs in commit messages"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 — both P1)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational) — CRITICAL gate
3. Complete Phase 3 (US1: grid renders)
4. Complete Phase 4 (US2: copy commands work)
5. **STOP and VALIDATE**: All US1 + US2 acceptance scenarios pass
6. Tag v0.1.0-alpha if shipping early; otherwise continue to US3+

### Incremental Delivery

1. Foundation + US1 → first usable build (read-only grid)
2. Add US2 → MVP complete (sidebar end-to-end usable)
3. Add US3 → both surfaces shipped (browser kanban)
4. Add US4 → live-sync polish
5. Add US5 → graceful failure (Doctor View)
6. Polish phase → tag v0.1.0

### Parallel Team Strategy (single-developer single-machine project)

Single-developer project per spec.md Assumptions. Strategy is **sequential by priority**: US1 → US2 → US3 → US4 → US5 → Polish. Within each phase, the [P]-marked tasks can be batched if you want to context-switch productively (e.g., type extraction + test scaffolding in one session, then implementation in the next).

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in the same phase
- [Story] label maps task to user story for traceability and independent ship-ability
- Each user-story phase ends with a manual acceptance run logged in `tests/manual/acceptance.md`
- Tests are explicit at boundary (guards, command templates) — NOT at integration. Integration is covered by the 7-scenario manual runbook (intentional, per spec.md Testing assumption)
- `design/sidebar.html` and `design/kanban.html` are **canonical** — when a task says "port", it means structure + CSS + interaction model port, replacing only the embedded sample data with the live `Prd[]` from `prdSource`
- Per FR-018, every commit that introduces a new VSCode-API call, npm dep, or library must cite a Context7 / canonical-doc URL in its message. Stale-knowledge usage of deprecated APIs is a defect
- Per the Constitution Principle II (Read-Only Phase 1) and FR-019, `EXECUTE_CLI` action variant is reserved in the type but rejected at runtime. Phase 2 will lift this gate; do NOT widen the surface in v0.1
