# Phase 1 — Data Model: PRD Visualizer Extension

**Date**: 2026-05-07
**Source of truth**: `prd summary --json` output (see `contracts/prd-summary-json.md`).
**Constitution principle**: V. Type-Safe JSON Boundaries — every entity below has a corresponding hand-written type guard at the boundary that introduces it.

---

## Entity: Prd

The canonical record of a single PRD as returned by the CLI.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | `<slug>_<YYYY-MM-DD>` — stable identifier across tiers |
| `title` | `string` | yes | Plain text, may contain Unicode |
| `path` | `string` | yes | Absolute filesystem path to the `.md` file |
| `tier` | `'scratch' \| 'archive' \| 'library'` | yes | Lifecycle tier — drives kanban column and command set |
| `status` | `'ACTIVE' \| 'RESOLVED' \| 'DRAFT'` | yes | Current lifecycle status |
| `age_days` | `number` | yes | Integer days since creation |
| `ephemeral` | `string` | yes | Marker text or sentinel `"(missing)"` |
| `context` | `string` | yes | First-paragraph snippet or `"(no context written yet)"` |
| `decisions` | `number` | yes | Count of rows in `## 4. Decisions Log` |
| `subagents` | `number` | yes | Count of rows in `## 3. Subagent Log` |
| `significance` | `number \| null` | yes | 0–100, `null` for non-resolved PRDs |
| `tags` | `string` | yes | Comma-separated, `""` for non-library tiers |
| `stale` | `boolean` | yes | CLI's stale-detection flag |
| `parent` | `string \| null` | optional | Slug of parent PRD, only present when CLI invoked with `--with-tree` |
| `children` | `string[]` | optional | Slugs of children, only present when CLI invoked with `--with-tree` |

**Validation rules**:
- `id` MUST be non-empty.
- `tier` MUST be one of the three literals.
- `age_days` MUST be ≥ 0.
- `significance` when not `null` MUST be in [0, 100].
- Boundary: validated by `isPrd(x: unknown): x is Prd` before any consumer touches the value.

**State transitions**: None inside the extension. Tier and status changes happen exclusively via the CLI; the extension observes the new state on the next file-save refresh.

---

## Entity: TierColumn (kanban surface)

A grouping bucket in the browser kanban.

| Field | Type | Required | Notes |
|---|---|---|---|
| `tier` | `Tier` | yes | One of the three literal values |
| `count` | `number` | yes | Length of `prds` array, surfaced in column header |
| `prds` | `Prd[]` | yes | Ordered: stale-first, then by `age_days` ascending |

**Validation rules**: Derived; no direct external input. Recomputed on every `Prd[]` refresh.

---

## Entity: ActionCommand

A copy-pasteable Claude Code slash command scoped to one PRD.

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | `string` | yes | Human-readable label shown in side panel (e.g., "Open file", "Resolve PRD") |
| `command` | `string` | yes | Exact text placed on clipboard when clicked |
| `kind` | `'open-file' \| 'checkout' \| 'log-note' \| 'log-decision' \| 'resolve' \| 'graduate'` | yes | Discriminator used to filter by tier/status |

**Generation rules** (all rendered statically; no CLI invocation):
- Always: `open-file` → `code <path>` + `checkout` → `/prd-checkout <id>` + `log-note` → `prd log <id> note "..."` + `log-decision` → `prd log <id> decision "..."`.
- `tier === 'scratch'` AND `status === 'ACTIVE'` → add `resolve` → `prd resolve <id> --reason "..."`.
- `tier === 'archive'` → add `graduate` → `prd graduate <id>`.
- `tier === 'library'` → no extra (terminal state).

**Boundary**: pure function `actionCommandsFor(prd: Prd): ActionCommand[]` — no validation needed (output is constructed, not parsed).

---

## Entity: WebviewAction (extension ↔ webview)

Discriminated union for messages flowing webview → extension.

```typescript
type WebviewAction =
  | { type: 'OPEN_FILE'; payload: { path: string } }
  | { type: 'COPY_COMMAND'; payload: { command: string } }
  | { type: 'RETRY_CONNECTION'; payload: Record<string, never> }
  | { type: 'EXECUTE_CLI'; payload: { argv: string[] } };  // Phase 2 — gated off
```

**Validation rules**:
- `type` MUST be one of the four literals.
- `OPEN_FILE.payload.path` MUST be an absolute path; rejected if it does not start with `/` (Linux/macOS) or match a Windows drive pattern.
- `COPY_COMMAND.payload.command` MUST be non-empty.
- `EXECUTE_CLI` is rejected outright in Phase 1 (FR-019). The variant is reserved in the type so Phase 2 lands without a contract refactor.
- Boundary: `isWebviewAction(x: unknown): x is WebviewAction`.

---

## Entity: ExtensionResponse (extension → webview)

Discriminated union for messages flowing extension → webview.

```typescript
type ExtensionResponse =
  | { type: 'SYNC_DATA'; payload: Prd[] }
  | { type: 'SHOW_ERROR'; payload: { message: string; raw?: string } };
```

**Validation rules**:
- `SYNC_DATA.payload` MUST pass `isPrd` for every element; failures degrade to `SHOW_ERROR`.
- `SHOW_ERROR.payload.message` MUST be a single user-facing line; `raw` (optional) carries truncated raw output for debugging.
- Boundary: webview side validates with `isExtensionResponse(x: unknown): x is ExtensionResponse`.

---

## Entity: KanbanApiPayload (kanban server → browser)

The single response shape served by `GET /api/prds`.

```typescript
type KanbanApiPayload =
  | { ok: true; prds: Prd[] }
  | { ok: false; message: string; raw?: string };
```

**Validation rules**:
- Browser side validates with `isKanbanApiPayload(x: unknown): x is KanbanApiPayload` after parsing the response.
- Server side: same `Prd[]` produced by `prdSource.ts` is reused; no duplicate fetch path.

---

## Cross-entity invariants

- `Prd[]` is the single in-memory shape circulated to all surfaces. Sidebar webview, kanban server, and browser kanban all consume the same array; they never compute fields locally except for sort/filter views.
- `actionCommandsFor(prd)` is pure and deterministic — re-running it on the same `Prd` yields the same `ActionCommand[]`.
- The `Tier` and `Status` literal types are the only enums in the system; widening them requires a CLI-side change first (Principle IV).
