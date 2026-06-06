# Implementation Plan: PRD Visualizer Extension

**Branch**: `001-prd-visualizer` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification at `/home/gyasisutton/dev/projects/prdone/specs/001-prd-visualizer/spec.md`

## Summary

A read-only VSCode extension that renders the canonical `prd summary --json`
output as two surfaces: (1) a sidebar tile-grid webview that tracks the
editor's theme, and (2) a wide-screen kanban page served by a bundled
Node/Express process bound to `127.0.0.1`. Tile click opens a side panel of
copy-pasteable Claude Code slash commands; clicking a command places its
exact text on the system clipboard. Phase 1 is strictly read-only — no CLI
write subcommand is invoked. The extension watches `vscode.workspace.onDidSaveTextDocument`
to refresh within 300ms of any PRD save. A Doctor View handles missing-CLI
recovery. All cross-process boundaries (CLI → extension, extension ↔ webview,
extension ↔ kanban server, kanban server → browser) pass through hand-written
TypeScript type guards.

## Technical Context

**Language/Version**: TypeScript 5.x (extension + webview/browser scripts), targeting Node 20+ runtime as bundled with VSCode.
**Primary Dependencies**: `vscode` (extension API), `express` (kanban server), `open` (cross-platform browser launch). No frontend framework. No runtime validation library (no Zod). Build tool: `esbuild` for both extension and shared frontend bundle.
**Storage**: None. Data lives in PRD `.md` files on disk; `prd summary --json` is the canonical reader. No extension-side caching beyond in-memory state for the current session.
**Testing**: `vitest` for unit tests on type guards and command-template generators; the 7 acceptance scenarios from spec §User Stories serve as manual smoke tests run before tagging v0.1.
**Target Platform**: VSCode 1.85+ on Linux/macOS/Windows. Browser surface: any Chromium/Firefox/Safari on the same machine, reaching `http://127.0.0.1:<port>`.
**Project Type**: Single-project VSCode extension (TypeScript) with a bundled local web server.
**Performance Goals**: Grid renders in ≤500ms after CLI returns at ~85 PRDs; Doctor View renders in ≤1.5s on activation; live-update reflects file save in ≤300ms; kanban server start + browser open in ≤2s.
**Constraints**: Read-only Phase 1 (FR-010, FR-019). Loopback-only kanban (FR-006, FR-009). Type guard at every boundary (FR-016, SC-007). No `any` / `as` casts at boundaries. Plain HTML/CSS/JS for both surfaces. Workspace Trust = `limited`.
**Scale/Scope**: Single user, single machine. Realistic working set 85–150 PRDs. No marketplace publication.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Pragmatic Simplicity | ✅ PASS | No framework (React/Vue), no Zod, no UI toolkit. esbuild + vscode + express + open is the entire dependency surface. Three similar lines beats premature abstraction; shared frontend bundle is real reuse, not abstraction. |
| II. Read-Only Phase 1 — CLI Owns State | ✅ PASS | FR-010, FR-019, SC-006 enforce zero state-mutating CLI calls. The `WebviewAction.EXECUTE_CLI` variant is defined but gated off (FR-017). Workspace Trust prevents CLI shell-out in untrusted folders. |
| III. Verify Library Docs Before Coding | ✅ PASS (process gate) | FR-018 binds every new dependency / API call to a Context7 or canonical-doc citation in commit message. Phase 0 research dispatches doc-fetch tasks for each dependency. |
| IV. Single Source of Truth — No Parser Drift | ✅ PASS | FR-001 forbids `.md` scraping. Tree data deferred to CLI `--with-tree` flag, not local extraction. `onDidSaveTextDocument` (deterministic) chosen over `FileSystemWatcher`. |
| V. Type-Safe JSON Boundaries | ✅ PASS | FR-016 + SC-007. Hand-written `isPrd`, `isWebviewAction`, `isExtensionResponse`, `isKanbanApiPayload` type guards at all four boundaries. |

**Result**: All five principles PASS without justification. No entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-prd-visualizer/
├── plan.md              # This file
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/           # Phase 1 output (this command)
│   ├── prd-summary-json.md     # CLI → extension contract
│   ├── webview-actions.md      # extension ↔ webview contract
│   └── kanban-api.md           # extension ↔ browser kanban contract
├── checklists/
│   └── requirements.md         # spec quality checklist (already exists)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
prdone/
├── package.json                      # extension manifest + scripts
├── tsconfig.json
├── esbuild.config.mjs                # bundles extension + shared frontend
├── src/
│   ├── extension.ts                  # activation/deactivation entry point
│   ├── types.ts                      # Prd, Tier, Status, WebviewAction, ExtensionResponse
│   ├── guards.ts                     # isPrd, isWebviewAction, isKanbanApiPayload
│   ├── data/
│   │   └── prdSource.ts              # spawns `prd summary --json`, parses, validates
│   ├── webview/
│   │   ├── sidebarProvider.ts        # WebviewViewProvider for the grid surface
│   │   └── doctorView.ts             # Doctor View HTML factory
│   ├── kanban/
│   │   ├── server.ts                 # express app, free-port pick, lifecycle
│   │   └── routes.ts                 # GET /api/prds → reuses prdSource.ts
│   ├── actions/
│   │   ├── commandTemplates.ts       # tier/status → Claude Code slash commands
│   │   └── messageHandler.ts         # webview ↔ extension message dispatch
│   └── lib/
│       └── findFreePort.ts
├── webview-frontend/                 # shared bundle for sidebar webview + browser kanban
│   ├── index.ts                      # entry — render mode chosen by global flag
│   ├── tileGrid.ts
│   ├── kanbanBoard.ts
│   ├── sidePanel.ts                  # detail/copy-command panel
│   ├── styles.css                    # VSCode CSS vars (sidebar) — see browser overrides
│   └── browser-overrides.css         # static dark/light palette + prefers-color-scheme
├── kanban-static/
│   └── kanban.html                   # shell that loads the shared bundle in browser mode
└── tests/
    ├── unit/
    │   ├── guards.test.ts            # type-guard coverage
    │   └── commandTemplates.test.ts  # tier→command mapping
    └── manual/
        └── acceptance.md             # 7 manual smoke tests from spec
```

**Structure Decision**: Single-project layout. The `webview-frontend/` directory ships a shared esbuild bundle consumed by both the sidebar webview (loaded via `webview.html`) and the browser kanban page (loaded via `kanban-static/kanban.html`); render mode is selected by a global flag injected at HTML-shell time. This satisfies the spec's "two surfaces, one frontend" principle without a framework.

## Design References (Phase 1 — canonical visual templates)

Two HTML mockups produced via the Open Design app (localhost:5173) on 2026-05-07. They are **canonical** for this feature: the production implementation MUST port their structure, palette, typography, and interaction model rather than redesigning from spec text. Treat them as authoritative for any tasks that touch tile rendering, the detail panel, the action-command list, or theming.

| Surface | Spec-dir path (versioned with feature) | OD project (live, iterable) | Aesthetic |
|---|---|---|---|
| Browser kanban — wide-screen "wow" surface | `specs/001-prd-visualizer/design/kanban.html` (1383 lines, 72K) | `http://localhost:5173/projects/3545c6d5-4a29-4e21-b459-fd757f732bf3` (UUID `3545c6d5-...`) | Geist + Geist Mono, deep blue-black ↔ cream paper, burnt-orange accent. Self-contained — own palette since browser cannot read VSCode CSS vars. |
| VSCode sidebar — in-editor surface | `specs/001-prd-visualizer/design/sidebar.html` (1216 lines, 52K) | `http://localhost:5173/projects/6281780f-5575-429e-99c8-d7a804a1d0ab` (UUID `6281780f-...`) | System stack (-apple-system / Segoe UI / Cascadia Mono), color exclusively via `var(--vscode-*)` tokens. Native VSCode look that morphs with the editor's theme at runtime. |

**Iteration loop (going forward):** the user iterates inside OD's chat sidebar; when ready, the OD-canonical `index.html` is `cp`-synced into the spec-dir path above. The spec-dir copies are the only files downstream tasks reference.

**Implications for `/speckit-tasks`:**
- DO NOT generate "design the sidebar / design the kanban" tasks — that work is done.
- DO generate "port `design/kanban.html` to the bundled frontend" and "port `design/sidebar.html` to the WebviewView provider" tasks.
- The deliberate split (kanban=Geist, sidebar=VSCode-native) is a constitution-level decision — preserve it across the port.
- Type guards / data shapes in `data-model.md` are the source of truth for both mocks' embedded sample data; the production code reads from `prd summary --json`, not the embedded arrays.

## Complexity Tracking

No entries — Constitution Check passed without violations.
