# Feature Specification: PRD Visualizer Extension

**Feature Branch**: `001-prd-visualizer`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "Use the existing PRD.md as the source of truth. The feature is the VSCode PRD Visualizer Extension — a read-only extension that renders `prd summary --json` as (1) a sidebar tile grid webview and (2) a browser kanban page served by a bundled Node/Express process on 127.0.0.1 (port auto-pick from 7373). Phase 1 is read-only with copy-pasteable Claude Code commands; no write-back to the prd CLI."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan all PRDs at a glance from the editor (Priority: P1)

A power user of the `prd` lifecycle CLI has accumulated ~85 PRDs across three tiers (scratch, archive, library). The terminal output of `prd summary` scrolls past the screen and is unusable for visual triage. The user wants to open their daily editor, click a single command, and see every PRD at once as a dense, scannable grid — title, tier, age, status, ephemeral marker, decision count, subagent count, significance — without leaving the editor.

**Why this priority**: This is the entire reason the feature exists. If the grid view does not solve the wall-of-text problem, no other surface matters.

**Independent Test**: With ≥85 PRDs on disk, invoke the visualizer command; verify the grid renders within 500ms of data arrival, every PRD appears as a tile, and the user can identify a stale scratch PRD without scrolling more than two screens.

**Acceptance Scenarios**:

1. **Given** ≥85 PRDs exist on disk, **When** the user opens the visualizer, **Then** all PRDs render as tiles in a responsive grid within 500ms of data arrival, with no console errors.
2. **Given** the grid is visible, **When** the user applies the "stale only" filter, **Then** the displayed tile count drops to the count reported by the data source's stale flag, and an empty result shows a clear empty state (not a blank pane).
3. **Given** the user switches the editor color theme (dark / light / high contrast), **When** the grid is visible, **Then** all tile text remains legible and all borders remain visible without manual restart.

---

### User Story 2 - Copy a Claude Code command for the selected PRD (Priority: P1)

The user has identified a PRD they want to act on. Write actions (resolve, graduate, log a note, log a decision) live in the existing CLI and its hooks — the visualizer must NOT duplicate that surface. Instead, when the user clicks a tile, a side panel must show the exact slash commands they can paste into Claude Code (or a terminal) to act on the PRD, and clicking any command must place it on the system clipboard.

**Why this priority**: Without an action path, the visualizer is read-only in a useless way. The copy-pasteable command bridge is what makes the read-only boundary acceptable.

**Independent Test**: Click any tile, verify the side panel shows at least four context-appropriate commands (open file, prd-checkout, prd log note, plus prd resolve or prd graduate based on tier). Click any command and confirm via system clipboard inspection that the exact text was copied.

**Acceptance Scenarios**:

1. **Given** the user clicks a scratch-tier tile, **When** the side panel opens, **Then** it shows commands including "open file", "prd-checkout <id>", "prd log note", "prd log decision", and "prd resolve <id>".
2. **Given** the user clicks an archive-tier tile, **When** the side panel opens, **Then** "prd graduate <id>" appears in place of "prd resolve".
3. **Given** the user clicks any command in the side panel, **When** the click registers, **Then** the exact command text is on the system clipboard, verifiable by paste.

---

### User Story 3 - Wide-screen kanban view in a browser (Priority: P2)

The sidebar tile grid is too narrow for a multi-column kanban layout. The user wants a separate command that opens a browser kanban grouped by tier (scratch / archive / library) on their secondary monitor, while keeping the sidebar for quick lookups during editing.

**Why this priority**: The kanban view is the second-most-requested surface in the source PRD but is not strictly required to solve the wall-of-text problem. P1 (grid) ships first; kanban can ship in the same release if time permits, otherwise immediately after.

**Independent Test**: Run the kanban command; the user's default browser opens on a localhost URL within 2 seconds; three tier columns appear with correct tile counts; clicking "open in editor" on any kanban tile returns focus to the editor and opens the underlying file.

**Acceptance Scenarios**:

1. **Given** the kanban command is invoked, **When** the local server starts, **Then** the user's default browser opens on a `127.0.0.1` URL within 2 seconds and three columns are visible (scratch, archive, library) with correct tile counts.
2. **Given** the kanban is open, **When** the user clicks "open in editor" on a tile, **Then** focus returns to the editor and the underlying file opens in a new editor tab.
3. **Given** the user closes the editor (deactivates the extension), **When** the kanban server is checked, **Then** the local port is no longer bound.

---

### User Story 4 - Live update on file save (Priority: P2)

The user edits a PRD's title or status in an editor tab, saves, and expects the visualizer (whichever surface they have open) to reflect the change without a manual refresh.

**Why this priority**: Without live update, the visualizer becomes out-of-sync the moment the user edits anything, undermining its trustworthiness as a dashboard.

**Independent Test**: Open the visualizer; edit a PRD's title in another editor tab; save; verify the corresponding tile updates within 300ms of the save event.

**Acceptance Scenarios**:

1. **Given** the visualizer is open, **When** the user saves a modified PRD file, **Then** the corresponding tile updates within 300ms.
2. **Given** the user creates a new PRD file via the existing CLI flow, **When** the file is saved, **Then** a new tile appears in the grid (and in the kanban scratch column, if open) within 300ms.

---

### User Story 5 - Graceful environment failure (Priority: P3)

The user launched the editor from a GUI launcher (so the shell PATH is not inherited) or has not yet installed the `prd` CLI. The extension must not silently render an empty grid; it must show a Doctor View that explains the problem and offers a way to point at the CLI binary.

**Why this priority**: Without this, a first-run user sees a blank pane and assumes the extension is broken. Low priority because most users will have the CLI on PATH; required because no other recovery path exists.

**Independent Test**: Unset the CLI binary path and the configuration override; activate the extension; verify the Doctor View renders within 1.5s with a clear "set binary path" affordance.

**Acceptance Scenarios**:

1. **Given** the CLI is not on PATH and no binary-path configuration is set, **When** the visualizer activates, **Then** the Doctor View renders within 1.5s with a clear control to configure the binary path.
2. **Given** the user sets the binary-path configuration to a valid CLI, **When** they retry, **Then** the grid renders normally without an editor restart.

---

### Edge Cases

- **No PRDs exist** — empty state with a one-line hint, not a blank pane.
- **Filter matches zero results** — "no PRDs match" empty state, not a blank pane.
- **CLI returns malformed JSON** — non-blocking error banner with truncated raw output and a "retry" action; previous data (if any) remains visible.
- **Untrusted workspace** — read-only render path works without invoking the CLI; if the CLI is required (initial load), the user is prompted to trust the workspace.
- **Kanban port already bound** — the bundled local server walks the port range upward from a starting port until a free one is found and reports the chosen URL to the user.
- **Browser kanban opened, then editor closed** — the bundled server is killed on extension deactivation; an open browser tab simply fails its next request, surfaced as a "server stopped" banner on the kanban page.
- **Theme switch mid-session** — sidebar surface MUST track the editor theme automatically; browser surface follows the operating system light/dark preference.
- **PRD file deleted while visualizer is open** — the next data refresh removes the tile; clicking a stale tile before refresh shows an error banner ("PRD no longer exists, refreshing").
- **>500 PRDs** — out of scope for v1; performance targets apply at the realistic 85–150 range.

## Requirements *(mandatory)*

### Functional Requirements

#### Data and rendering

- **FR-001**: The system MUST source all PRD data from the canonical `prd summary --json` command output. It MUST NOT scrape PRD markdown files to extract PRD-level fields.
- **FR-002**: The system MUST render every PRD returned by the data source as a tile in a responsive grid, surfacing at minimum: title, tier, age, status, ephemeral marker, decision count, subagent count, significance.
- **FR-003**: The system MUST provide sort and filter controls for: age, tier, significance, stale-only, active-only, and free-text search by keyword.
- **FR-004**: The system MUST render an empty state (with a clear hint) when the result set is empty, whether due to no data or filter exhaustion. It MUST NOT show a blank pane.

#### Surfaces

- **FR-005**: The system MUST provide a sidebar grid surface inside the editor that tracks the editor's color theme automatically (dark, light, high contrast) without manual restart.
- **FR-006**: The system MUST provide a separate command that opens a browser-based kanban surface, on the user's machine only (loopback address), grouped by tier (scratch / archive / library). The kanban surface MUST follow the operating system light/dark preference.
- **FR-007**: The kanban surface MUST allow returning the user to the editor with the underlying PRD file opened, via a single click.
- **FR-008**: The kanban server MUST be killed when the extension deactivates; the user MUST never need to manually free the port.
- **FR-009**: The kanban server MUST automatically pick a free local port starting from a configured base port, reporting the chosen URL to the user.

#### Read-only boundary

- **FR-010**: The system MUST NOT invoke any CLI subcommand that mutates state (creating, editing, resolving, graduating, logging, sweeping PRDs).
- **FR-011**: The system MUST present, on tile click, a side panel containing at minimum four copy-pasteable Claude Code commands relevant to the selected PRD's tier. Clicking any command MUST place its exact text on the system clipboard.
- **FR-012**: The system MUST present an "open file" action for every tile that opens the underlying PRD markdown file in an editor tab.

#### Live behaviour and recovery

- **FR-013**: The system MUST update the visible surfaces within 300ms of a PRD file being saved by the editor.
- **FR-014**: The system MUST display a Doctor View when the data source is unreachable on activation, including a control to configure the path to the CLI binary. The Doctor View MUST render within 1.5s of activation.
- **FR-015**: The system MUST work in a limited capacity in untrusted workspaces: read-only rendering of any cached or last-known data MUST succeed; CLI invocation MUST require the user to trust the workspace.

#### Type safety and contracts

- **FR-016**: Every cross-process boundary (CLI → extension, extension → webview, webview → local server, local server → browser page) MUST validate incoming data against a hand-written type guard before use. Malformed data MUST surface as an error banner, not a silent failure.
- **FR-017**: The extension MUST define an action-message contract that accepts (a) open-file, (b) copy-command, (c) retry-connection in v1, and reserves a fourth variant for future write actions without requiring a contract refactor.

#### Documentation gate

- **FR-018**: Before introducing any new third-party dependency or editor-API call, the implementer MUST cite a current documentation source (Context7 or canonical doc URL) in the corresponding commit message. Stale-knowledge introductions of deprecated APIs are a defect.

#### Out of scope (Phase 1)

- **FR-019**: The system MUST NOT implement drag-and-drop write-back, status change from the UI, virtual scrolling, debounced file events, status-bar badges, multi-machine sync, or marketplace publication in this phase.

### Key Entities

- **PRD record**: Represents one PRD as returned by the canonical CLI. Carries identity (id, title), location (file path), classification (tier: scratch / archive / library; status), lifecycle markers (age in days, ephemeral marker text, stale flag), and quality signals (decision count, subagent count, significance score, tags). May optionally carry parent / children relationships when the data source provides a tree-aware mode.
- **Tier column**: A grouping bucket in the kanban surface representing one of the three lifecycle tiers; receives all PRD records whose tier matches; renders a count and an ordered list of tiles.
- **Action command**: A copy-pasteable Claude Code command string scoped to a single PRD record, generated from a small fixed set of templates (open file, prd-checkout, prd log note, prd log decision, prd resolve, prd graduate) chosen by the PRD's tier and status.
- **Doctor view**: A first-run / failure-mode surface that explains a missing-CLI condition and exposes a single control to configure the path to the CLI binary.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At a realistic working set (≥85 PRDs), the user identifies a specific PRD by visual scan in under 10 seconds.
- **SC-002**: The grid surface fully renders within 500ms after the data source returns; the Doctor View renders within 1.5s of activation when the data source is unreachable.
- **SC-003**: After saving an edit to a PRD file, the on-screen tile reflects the change within 300ms in 95% of trials over 20 saves.
- **SC-004**: The user replaces their use of the terminal `prd summary` command with the visualizer for at least 5 consecutive workdays — the ephemeral-PRD success bar from the source PRD.
- **SC-005**: 100% of v1 acceptance scenarios pass without modification before the v0.1 tag.
- **SC-006**: Across the entire v1 codebase, zero CLI invocations of state-mutating subcommands exist (verifiable by code search over the source tree).
- **SC-007**: Every cross-process boundary in the codebase has an associated type guard (verifiable by code search / lint rule).
- **SC-008**: 100% of the seven success criteria from the source PRD §8 pass on a fresh clone in under 35 minutes total testing time (5 minutes per criterion).

## Assumptions

- The user has the canonical `prd` CLI installed (or is willing to point at a binary path) and PRDs already exist in the conventional location.
- The user's primary editor is the targeted IDE; multi-editor portability is out of scope for v1.
- The user's machine is single-user; the local server is bound to loopback and never exposed externally.
- The user accepts the ephemeral nature of the local server (no cross-session persistence, no auto-restart on browser refresh after deactivation).
- The base port for the local kanban server is configurable but defaults to a value chosen to minimize collisions with common developer tools; port collisions are resolved by walking upward, not by failing.
- The CLI's JSON schema is stable enough that hand-written type guards do not need to be regenerated more often than once per CLI release; schema drift is a CLI-side change with a corresponding type-guard PR.
- The browser surface is reached only by the user's own default browser on the same machine; serving over plain HTTP on loopback is acceptable.

## Dependencies

- Canonical `prd` CLI providing a `summary --json` output that matches the field set defined in §10 of the source PRD.
- An optional CLI enhancement (`--with-tree` flag) to surface parent / children relationships in the JSON. v1 ships flat if this enhancement is not yet available.
- Editor extension APIs for: webview rendering, theme variable injection, file save events, file open by path, untrusted-workspace capability declaration, command palette contributions, configuration settings.

## Out of Scope (Phase 2 — pre-architected, not built)

- Drag-and-drop write-back from the kanban surface.
- Status-bar badge with PRD counts.
- Significance-based heat-map weighting on tiles.
- Virtual scrolling.
- Debounced file events.
- Tag-based filtering and saved searches.
- Multi-machine sync; marketplace publication.
