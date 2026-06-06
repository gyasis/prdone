---
name: prd-summary
description: Librarian view of all PRDs across scratch/archive/library tiers — the canonical "where am I sitting on PRDs" command. Shows title, age, status, ephemeral marker, first-paragraph context, decision/subagent counts, significance score, tags. Filters (--stale-only, --active-only, --archived-only, --graduated-only, --tier <name>) + sorts (--by-age, --by-tier, --by-significance) + formats (--cards default, --table, --json). Triggers — "what PRDs am I sitting on", "what PRDs do I have", "show me my PRDs", "PRD librarian", "PRD inventory", "what's stale", "what's rotting in scratch", "show open items across PRDs", "what PRDs need resolving", "what's foundational" (filter by significance), "PRDs from this week / last week", "any catalog or inventory question about PRDs". Use --stale-only for "what's stale". Use --by-significance to surface foundational work. Use --table for compact at-a-glance view; --cards for detailed reading.
---

# /prd-summary — PRD Librarian View

A card-catalog or table view of every PRD on disk.

## Invocation

The skill shells out to `~/bin/prd summary` with whatever flags the user passed. The wrapper handles all logic — this skill is a thin Claude-Code-side entry point.

## Usage examples

```bash
prd summary                               # all 18 PRDs, cards view, sorted by age
prd summary --table                       # compact table
prd summary --table --by-tier             # group by scratch/archive/library
prd summary --by-significance --table     # show foundational ones first
prd summary --stale-only                  # 14d+ untouched scratch PRDs
prd summary --active-only --table         # scratch only
prd summary --archived-only               # 30d cooling bay
prd summary --graduated-only              # the curated library
prd summary --tier scratch --json         # machine-readable
```

## When to use

- User asks "what PRDs do I have"
- User asks "show me a list of my PRDs" / "summarize my PRDs"
- User asks "what's stale" / "what should I clean up"
- User says "librarian" / "card catalog"
- Session start — orient by recent active PRDs
- Before `/prd new` — check if a similar PRD already exists

## Card output anatomy

```
📝 [SCRATCH] PRD — hhdev Parallel Worktrees & Multi-Project Local Dev
   id:        hhdev_parallel_worktrees_2026-04-24
   age:       0d  •  status: ACTIVE
   activity:  9 decisions  •  3 subagents
   delete:    delete after design accepted or rejected
   summary:   The hhdev local dev stack assumes one active project at a time...
   path:      /home/gyasisutton/dev/prd/scratch/hhdev_parallel_worktrees_2026-04-24.md
```

- **Tier icon**: 📝 scratch · 📦 archive · 📚 library
- **age** = days since mtime
- **status** = `ACTIVE` (no Resolution Summary) | `RESOLVED` (Resolution Summary present)
- **activity** = non-empty rows in Decisions Log + Subagent Log
- **delete** = ephemeral marker (or `(missing)` if not declared)
- **summary** = first paragraph of `## 1. Context` (truncated to ~200 chars)
- **stale flag**: ⏸ STALE if scratch + ≥14 days + not resolved
- **significance** = score from Resolution Summary if present (else `-`)

## Implementation

The skill execution path:

```bash
# Skill wrapper just calls the CLI. Pass args verbatim.
~/bin/prd summary "$@"
```

No additional logic. The CLI does the extraction, sorting, and formatting.

## Companion skills

- `/prd new <descriptor>` — create a scratch PRD
- `/prd resolve <id>` — close → move to archive
- `/prd graduate <id>` — promote → library
- `/prd-summary` — this skill (read-only inventory)

## Edge cases

- Empty tiers print `(no PRDs match the filter)` and exit cleanly.
- PRDs with no `## 1. Context` section show `(no Context section)`.
- PRDs with placeholder Context (starts with `(`) show `(no context written yet)`.
- Hidden files (`README.md`, `INDEX.md` in library/) are excluded.
- The hook (`prd-guard`) is not invoked — this is read-only.
