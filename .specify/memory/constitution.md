<!--
SYNC IMPACT REPORT
==================
Version change: (template) → 1.0.0
Bump rationale: Initial ratification — first concrete instantiation of the template.

Modified principles (template → final):
  - [PRINCIPLE_1_NAME] → I. Pragmatic Simplicity (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Read-Only Phase 1 — CLI Owns State
  - [PRINCIPLE_3_NAME] → III. Verify Library Docs Before Coding
  - [PRINCIPLE_4_NAME] → IV. Single Source of Truth — No Parser Drift
  - [PRINCIPLE_5_NAME] → V. Type-Safe JSON Boundaries
Added sections:
  - Technical Constraints (replaces SECTION_2)
  - Development Workflow (replaces SECTION_3)
Removed sections: none
Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (Constitution Check section already generic — references "Constitution"; no change required)
  - ✅ .specify/templates/spec-template.md (no constitution-specific gates referenced)
  - ✅ .specify/templates/tasks-template.md (no constitution-specific task categories referenced)
Deferred TODOs: none
-->

# prdone Constitution

## Core Principles

### I. Pragmatic Simplicity (NON-NEGOTIABLE)
This is a single-user, single-machine tool. Implementation budget is measured in
evenings, not sprints. Every feature MUST justify its complexity against the
question "does the current 85-PRD scan-on-a-terminal problem need this to be
solved?" YAGNI is enforced: no abstractions added for hypothetical Phase 2
needs unless the contract is explicitly pre-architected (see §III of Phase 2
list in PRD.md). No frameworks (React/Vue/etc.), no runtime validation
libraries (Zod), no UI toolkits — plain HTML/CSS/JS plus VSCode webview APIs.
Three similar lines beat a premature abstraction.

### II. Read-Only Phase 1 — CLI Owns State
The extension is a viewer and a copy-paste command generator. It MUST NOT
write to PRD files, MUST NOT shell out to any `prd` subcommand that mutates
state (`prd new`, `prd log`, `prd resolve`, `prd graduate`, `prd sweep`), and
MUST NOT reimplement PRD lifecycle semantics in TypeScript. Lifecycle hooks,
locks, and the Decision Rule live in Claude Code; do not duplicate them.
Phase 2 write-back is deferred and pre-architected via the `WebviewAction`
discriminated union — the `EXECUTE_CLI` variant exists in the type but is
gated off in v0.1.

### III. Verify Library Docs Before Coding
Before writing or modifying code that uses any third-party library, framework,
SDK, or VSCode API, the developer (or AI assistant) MUST fetch current
documentation via Context7 (`mcp__context7-mcp__query-docs` /
`resolve-library-id`) or, when Context7 lacks coverage, via WebFetch against
the canonical docs URL. Training-data recall is NOT sufficient. This applies
to: VSCode Extension API, webview message-passing, Express, Node `http`,
`vscode://` URL scheme, `vsce`, and any future dependency. Rationale: the
Webview UI Toolkit was deprecated late 2024 — relying on stale knowledge
ships dead code. Cost of one doc-fetch is far less than one wrong API call.

### IV. Single Source of Truth — No Parser Drift
PRD data MUST come from `prd summary --json` (and the future `--with-tree`
flag). The extension MUST NOT scrape `.md` files directly to extract PRD
fields, parent/child relationships, decision counts, or status. If a needed
field is absent from the JSON, the fix is to extend the CLI (T13 pattern),
NOT to reimplement extraction in TypeScript. File-save events are watched
with `vscode.workspace.onDidSaveTextDocument` (deterministic), NOT
`FileSystemWatcher` (silently exhausts on large dirs).

### V. Type-Safe JSON Boundaries
Every cross-process boundary (CLI → extension, extension host → webview,
webview → kanban server) MUST pass through a hand-written TypeScript type
guard. The canonical `Prd`, `WebviewAction`, and `ExtensionResponse` types
in §10 of PRD.md are normative — code MUST match them. No `any`, no `as`
casts at boundaries, no Zod (overkill for one CLI we control). When the CLI
schema changes, the type guard is updated in the same commit.

## Technical Constraints

- **Stack**: TypeScript + VSCode Extension API + Node.js + Express + plain
  HTML/CSS/JS. No bundler-driven frameworks.
- **Surfaces**: (1) Sidebar webview using VSCode auto-injected CSS variables
  for theme fidelity, (2) browser kanban served by a bundled Node/Express
  process bound to `127.0.0.1`, port auto-pick starting at 7373, killed on
  `deactivate()`. The browser surface CANNOT read VSCode CSS variables and
  ships its own dark/light palette via `prefers-color-scheme`.
- **Workspace Trust**: `untrustedWorkspaces.supported = "limited"`. Read-only
  rendering works untrusted; CLI shell-out requires trust.
- **Configuration**: `prd.binaryPath` (default `"prd"`) — VSCode launched from
  GUI does not inherit shell PATH. Do NOT parse `.zshrc`, `.bashrc`, or
  similar.
- **Round-trip**: Browser kanban → editor uses the `vscode://file/<absolute>`
  URL scheme. No HTTP callback dance.
- **No marketplace publication**. Personal tool. `package.json` stays clean
  enough that publication would be a config flip if ever needed, but it is
  not a goal.

## Development Workflow

- **Tasks**: Tracked via the `prd` lifecycle (this very constitution lives
  alongside `PRD.md`). Decisions go in `## 4. Decisions Log` of the PRD.
- **Commits**: One coherent change per commit. Constitution amendments use
  the message form `docs: amend constitution to vX.Y.Z (<summary>)`.
- **Reviews / quality gates**: Each Pull Request (or pre-merge self-review,
  given single-user scope) MUST verify (a) no new dependency was added
  without a Context7 / doc-fetch citation in the commit message, (b) no JSON
  boundary lacks a type guard, (c) no write-path to `prd` CLI was introduced
  in Phase 1.
- **Testing**: The 7 success criteria in §8 of PRD.md are the v0.1 acceptance
  gate. Each MUST be testable in <5 minutes and MUST pass before tagging v0.1.
- **Complexity justification**: Any deviation from these principles MUST be
  recorded as a decision row in `PRD.md` §4 with explicit rationale. Silent
  drift is a constitution violation.

## Governance

This constitution supersedes ad-hoc preferences for the prdone project. It
applies only to this repository; it is not global.

- **Amendments**: Open a PR (or, for single-user mode, a commit) that
  modifies `.specify/memory/constitution.md`, increments the version per
  semantic-versioning rules below, updates the `Last Amended` date, and
  prepends a Sync Impact Report comment listing the change.
- **Versioning**:
  - **MAJOR**: Removing or redefining a principle in a backward-incompatible
    way (e.g., loosening Read-Only Phase 1 to allow CLI write-back).
  - **MINOR**: Adding a new principle or materially expanding guidance.
  - **PATCH**: Wording, typo, or clarification fixes that do not change
    semantics.
- **Compliance review**: Self-review on every PR; ad-hoc audit when a
  decision row in `PRD.md` cites the constitution.
- **Runtime guidance**: `PRD.md` is the runtime guidance file — read it
  before implementing or reviewing any task.

**Version**: 1.0.0 | **Ratified**: 2026-05-07 | **Last Amended**: 2026-05-07
