---
description: "Data model changes for Spec 002 — HTML Companion PRDs"
spec_id: 002-html-companions
---

# Data Model: HTML Companion PRDs

This document specifies the schema changes required to support HTML companion PRDs alongside the existing Markdown PRD lifecycle.

---

## 1. `companions` field — the central new concept

Every PRD entry in the system gains an optional `companions` field that maps companion-type identifiers to absolute file paths.

```jsonc
"companions": {
  "html": "/abs/path/to/<descriptor>_<YYYY-MM-DD>.html",
  // future:
  "pdf":  "/abs/path/to/<descriptor>_<YYYY-MM-DD>.pdf",
  "pptx": "/abs/path/to/<descriptor>_<YYYY-MM-DD>.pptx",
  "ipynb": "/abs/path/to/<descriptor>_<YYYY-MM-DD>.ipynb"
}
```

- **Key constraint:** Each companion file MUST share the same base descriptor + date as the parent MD PRD. Only the extension differs.
- **Null state:** PRDs without companions have `companions: null` OR the field is absent.
- **Extensibility:** Adding new companion types means adding a new well-known key to the object — no schema migration required for existing entries.
- **Validation:** `prd doctor` enforces the paired-name constraint and reports drift.

---

## 2. `active-prds.json` registry schema

Location: `~/dev/prd/<tier>/.memory/active-prds.json` for each tier (`scratch`, `archive`, `library`).

### Before Spec 002

```jsonc
{
  "active": [
    {
      "id": "pharos-v1",
      "path": "/abs/path/to/pharos_v1_2026-05-22.md",
      "status": "open",
      "created": "2026-05-22",
      "descriptor": "pharos_v1_index",
      "branch_at_creation": "001-prd-visualizer",
      "owner_path": "/home/gyasisutton/dev/projects/prdone",
      "session_origin": "<UUID>"
    }
  ],
  "closed_prds": [/* same shape */]
}
```

### After Spec 002

```jsonc
{
  "active": [
    {
      "id": "pharos-v1",
      "path": "/abs/path/to/pharos_v1_2026-05-22.md",
      "status": "open",
      "created": "2026-05-22",
      "descriptor": "pharos_v1",
      "branch_at_creation": "002-html-companions",
      "owner_path": "/home/gyasisutton/dev/projects/prdone",
      "session_origin": "<UUID>",
      "companions": {
        "html": "/abs/path/to/pharos_v1_2026-05-22.html"
      }
    }
  ],
  "closed_prds": [/* same shape */]
}
```

### Backward compatibility

Readers MUST handle entries that lack `companions`:

```typescript
function getCompanions(entry: PrdEntry): Companions {
  return entry.companions ?? {};
}

function getHtmlCompanion(entry: PrdEntry): string | null {
  return entry.companions?.html ?? null;
}
```

No migration script is required for existing entries. They self-heal on the next `prd doctor` run: doctor scans the tier directory, finds any `.html` siblings with matching base+date, and updates the entry's `companions` field.

---

## 3. `prd summary --json` output schema

The CLI's `summary --json` subcommand is the canonical source of truth for prdone's visualizer. Schema after Spec 002:

```jsonc
[
  {
    "id": "pharos-v1",
    "tier": "scratch",
    "path": "/home/gyasisutton/dev/prd/scratch/pharos_v1_2026-05-22.md",
    "title": "Pharos v1 Index PRD",
    "status": "open",
    "descriptor": "pharos_v1",
    "created": "2026-05-22",
    "companions": {
      "html": "/home/gyasisutton/dev/prd/scratch/pharos_v1_2026-05-22.html"
    },
    "/* existing fields */": ""
  },
  {
    "id": "auth-flow",
    "tier": "scratch",
    "path": "/home/gyasisutton/dev/prd/scratch/auth_flow_2026-05-25.md",
    "title": "Auth Flow Refactor",
    "status": "open",
    "descriptor": "auth_flow",
    "created": "2026-05-25",
    "companions": null
  }
]
```

`companions` is either `null` (or absent) for MD-only PRDs, or a non-empty object listing existing companion files.

---

## 4. Discovery flow (CLI side)

`prd summary --json` derives `companions` as follows:

1. Read each tier's `active-prds.json`.
2. For each entry, list the tier directory.
3. For each known companion extension (`.html`, future: `.pdf`, `.pptx`, `.ipynb`), check if a file with the same base descriptor + date exists.
4. Build the `companions` object from observed files.
5. (Stretch) Update `active-prds.json`'s `companions` field if it drifted from the on-disk reality.

This makes `companions` **derivable from the filesystem at any moment**, with `active-prds.json` as a cached convenience.

---

## 5. Naming constraints — formal

Filename pattern, per `~/.claude/rules/domains/plan-persistence.md`:

```
<3-word-descriptor>[_<feature-suffix>]_<YYYY-MM-DD>.<ext>
```

Where:
- `<3-word-descriptor>` — snake_case, 1-5 underscore-separated words
- `<feature-suffix>` — optional, snake_case, additional descriptive segments
- `<YYYY-MM-DD>` — ISO date of PRD creation
- `<ext>` — `md` for the index, `html` / `pdf` / etc. for companions

**Forbidden patterns** (validated by `prd doctor`):

| Pattern | Why forbidden |
|---|---|
| `auth_flow_<date>.md` + `auth_flow_design_<date>.html` (different base) | Companion must share base descriptor with MD |
| `auth-flow_<date>.html` (kebab-case) | Must be snake_case |
| `auth_flow_design_prd.html` (missing date) | Date is mandatory |
| `Auth_Flow_<date>.html` (PascalCase) | Must be lowercase snake |
| `auth_flow_<date>.HTML` (uppercase ext) | Must be lowercase |

---

## 6. Type definitions (TypeScript)

See `contracts/companions.contract.ts` for canonical TS types consumed by prdone's webview and the express kanban server.

```typescript
export type CompanionType = 'html' | 'pdf' | 'pptx' | 'ipynb';

export type Companions = {
  [K in CompanionType]?: string; // absolute path to companion file
};

export interface PrdEntry {
  id: string;
  tier: 'scratch' | 'archive' | 'library';
  path: string;          // absolute path to .md
  title: string;
  status: 'open' | 'blocked' | 'resolved' | 'archived' | 'graduated';
  descriptor: string;
  created: string;       // ISO date
  companions?: Companions | null;
  // ... existing fields preserved ...
}
```

---

## 7. Migration: legacy PRDs without companions

| Scenario | Handling |
|---|---|
| Old entry, no `companions` field, no `.html` sibling | Treated as `companions: null`. No action. |
| Old entry, no `companions` field, `.html` sibling matches base+date | `prd doctor` auto-populates `companions.html` on its next run. |
| Old entry, no `companions` field, `.html` sibling with DIFFERENT base (Pharos case) | `prd doctor` flags as a paired-name violation. Suggested rename surfaces but is NEVER auto-applied. |
| Entry with `companions.html` but file missing on disk | `prd doctor` flags as missing-companion warning. |
| Entry with `companions.html`, file exists, name parity OK | Healthy state. |

---

## 8. Revision log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-05-22 | Initial data model spec. Defines `companions` field, registry schema, summary output, naming constraints, TS contract, migration handling. |
