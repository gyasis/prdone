---
description: "T105 — inventory of cross-references inside the Pharos PRD trio before the T106 migration script runs"
spec_id: 002-html-companions
captured: 2026-05-22
---

# Pharos Migration Inventory (T105)

## Current state — naming mismatch

Three files in `~/dev/prd/scratch/` form a tightly-coupled PRD trio but do
NOT share a base descriptor (violates the Spec 002 paired-name convention):

| Current name | Role |
|---|---|
| `pharos_v1_index_2026-05-22.md` | Index PRD (tracking) |
| `pharos_v1_design_journal_2026-05-22.md` | Design Journal (full debate archive) |
| `viz_tool_v1_design_2026-05-22.html` | Design PRD (polished visual artifact) |

The HTML file uses base `viz_tool_v1_design` while the other two use base
`pharos_v1_*`. `prd doctor` currently flags the `.html` as an orphan with no
matching `.md` sibling.

## Target state — paired-name convention

After migration (T108):

| Old name | New name | Base after rename |
|---|---|---|
| `pharos_v1_index_2026-05-22.md` | `pharos_v1_2026-05-22.md` | `pharos_v1` |
| `viz_tool_v1_design_2026-05-22.html` | `pharos_v1_2026-05-22.html` | `pharos_v1` |
| `pharos_v1_design_journal_2026-05-22.md` | `pharos_v1_journal_2026-05-22.md` | `pharos_v1_journal` |

Result:
- The Design PRD (HTML) is now the paired companion of the Index PRD (MD).
- The Design Journal keeps its own base (`pharos_v1_journal`) — it's a
  separate artifact, not a companion. It would not appear in `prd summary`'s
  companions field; it appears as its own PRD entry.

## Cross-references that must be updated by the migration

### `pharos_v1_index_2026-05-22.md` → `pharos_v1_2026-05-22.md`

| Line | Current text | Replacement |
|---|---|---|
| 27 | `> **📐 [Design PRD (HTML)](./viz_tool_v1_design_2026-05-22.html)**` | `> **📐 [Design PRD (HTML)](./pharos_v1_2026-05-22.html)**` |
| 28 | `> \`/home/gyasisutton/dev/prd/scratch/viz_tool_v1_design_2026-05-22.html\`` | `> \`/home/gyasisutton/dev/prd/scratch/pharos_v1_2026-05-22.html\`` |
| 64 | `The deep design rationale for each lives in the [HTML design PRD](./viz_tool_v1_design_2026-05-22.html). Quick reference here:` | `The deep design rationale for each lives in the [HTML design PRD](./pharos_v1_2026-05-22.html). Quick reference here:` |
| 251 | `| **Design PRD (HTML, visual)** | \`~/dev/prd/scratch/viz_tool_v1_design_2026-05-22.html\` | The source of truth for v1 architecture |` | substitute path |
| 252 | `| **This index PRD** | \`~/dev/prd/scratch/pharos_v1_index_2026-05-22.md\` | Pointer + tracking |` | substitute path |

### `pharos_v1_design_journal_2026-05-22.md` → `pharos_v1_journal_2026-05-22.md`

| Line | Current text | Replacement |
|---|---|---|
| 46 | `This document complements the **Design PRD (HTML)** at \`~/dev/prd/scratch/viz_tool_v1_design_2026-05-22.html\`. ...` | substitute path |
| 1608 | `| **Design PRD (HTML)** | \`~/dev/prd/scratch/viz_tool_v1_design_2026-05-22.html\` | ...` | substitute path |
| 1609 | `| **Index PRD** | \`~/dev/prd/scratch/pharos_v1_index_2026-05-22.md\` | ...` | substitute path |
| 1610 | `| **This journal** | \`~/dev/prd/scratch/pharos_v1_design_journal_2026-05-22.md\` | ...` | substitute path |

### `viz_tool_v1_design_2026-05-22.html` → `pharos_v1_2026-05-22.html`

| Line | Current text | Replacement |
|---|---|---|
| 2344 | `<code>~/dev/prd/scratch/pharos_v1_index_2026-05-22.md</code>` | `<code>~/dev/prd/scratch/pharos_v1_2026-05-22.md</code>` |
| 2345 | `<code>~/dev/prd/scratch/pharos_v1_design_journal_2026-05-22.md</code>` | `<code>~/dev/prd/scratch/pharos_v1_journal_2026-05-22.md</code>` |

## Substitution map

The migration script (T106) uses these exact string substitutions, applied
in this order (string order matters — substitute LONGER strings first so
prefixes don't accidentally match):

```
viz_tool_v1_design_2026-05-22.html     →  pharos_v1_2026-05-22.html
pharos_v1_design_journal_2026-05-22.md →  pharos_v1_journal_2026-05-22.md
pharos_v1_index_2026-05-22.md          →  pharos_v1_2026-05-22.md
```

## Registry update

`~/dev/prd/scratch/.memory/active-prds.json` (if it exists) may have entries
pointing at the old paths. The migration script must also update these:

```bash
jq '.active[] | select(.path | test("viz_tool_v1_design|pharos_v1_index|pharos_v1_design_journal"))' \
  ~/dev/prd/scratch/.memory/active-prds.json
```

(In practice the breadcrumb registry may not track these files — they predate
the Spec 002 `prd new --html` flow. The migration script handles both cases:
update if present, skip silently if absent.)

## Verification post-migration

```bash
# After T108 runs:
prd doctor                       # Should report 0 paired-name violations
ls ~/dev/prd/scratch/pharos_v1_*.{md,html}  # Three files with new names
prd summary --json | jq '.[] | select(.id | startswith("pharos_v1")) | .companions'
# Should show:
#   pharos_v1_2026-05-22         → { "html": ".../pharos_v1_2026-05-22.html" }
#   pharos_v1_journal_2026-05-22 → null
```
