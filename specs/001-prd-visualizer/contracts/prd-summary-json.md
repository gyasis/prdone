# Contract: `prd summary --json` → Extension

**Boundary**: External CLI (process spawn) → extension host (`src/data/prdSource.ts`).
**Direction**: One-way; extension reads stdout, never writes to stdin.
**Type guard**: `isPrd(x: unknown): x is Prd` applied to every array element before use.

## Invocation

```text
<binaryPath> summary --json [--with-tree]
```

- `<binaryPath>` resolved from configuration setting `prd.binaryPath` (default `"prd"`).
- `--with-tree` is added only when the user opts into tree rendering (deferred from v0.1).
- stdout: a single JSON document (UTF-8) consisting of an array of PRD objects.
- stderr: ignored unless exit code ≠ 0.
- exit code: 0 on success; any non-zero triggers Doctor View / error banner.

## Schema (success)

```json
[
  {
    "tier": "scratch",
    "id": "vscode_prd_visualizer_2026-05-07",
    "title": "VSCode PRD Visualizer Extension",
    "path": "/home/user/dev/prd/scratch/vscode_prd_visualizer_2026-05-07.md",
    "age_days": 0,
    "status": "DRAFT",
    "ephemeral": "delete when v0.1 ships AND used 5 days",
    "context": "The PRD lifecycle system has matured to ~85 active PRDs...",
    "decisions": 13,
    "subagents": 0,
    "significance": null,
    "tags": "",
    "stale": false,
    "parent": null,
    "children": []
  }
]
```

## Schema (failure)

- Non-zero exit → extension MUST surface a `SHOW_ERROR` response with the first 1KB of stderr as `raw`.
- Empty array (`[]`) is a valid success — extension MUST render the empty state, NOT an error.

## Validation

```typescript
function isPrd(x: unknown): x is Prd {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' && o.id.length > 0 &&
    typeof o.title === 'string' &&
    typeof o.path === 'string' &&
    (o.tier === 'scratch' || o.tier === 'archive' || o.tier === 'library') &&
    (o.status === 'ACTIVE' || o.status === 'RESOLVED' || o.status === 'DRAFT') &&
    typeof o.age_days === 'number' && o.age_days >= 0 &&
    typeof o.ephemeral === 'string' &&
    typeof o.context === 'string' &&
    typeof o.decisions === 'number' &&
    typeof o.subagents === 'number' &&
    (o.significance === null || (typeof o.significance === 'number' && o.significance >= 0 && o.significance <= 100)) &&
    typeof o.tags === 'string' &&
    typeof o.stale === 'boolean' &&
    (o.parent === undefined || o.parent === null || typeof o.parent === 'string') &&
    (o.children === undefined || (Array.isArray(o.children) && o.children.every(c => typeof c === 'string')))
  );
}
```

Any element failing `isPrd` MUST be dropped and counted toward a `SHOW_ERROR` summary ("3 of 87 PRDs failed validation — see raw output").

## Versioning

- The CLI is the single source of truth (Constitution Principle IV).
- Schema additions are non-breaking when fields are appended and `isPrd` widens permissively.
- Schema removals or type changes are breaking and require a paired type-guard PR before the extension is rebuilt.
