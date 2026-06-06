---
name: prd
description: PRD lifecycle skill v3 — scratch/archive/library three-tier model with hook-enforced write gate AND parent/child tree (Branch+Repo+Parent headers, ## Children sections). Create / resolve / graduate / revise planning docs. Subcommands: new/list/find/link/attach/log/resolve/graduate/revision/reopen/sweep/doctor. NEW (2026-04-30) — `prd new` runs a Decision Rule (NEW-ROOT / SUB-PRD / APPEND-NOTE) on git branch+repo before writing; `--parent <slug>` auto-links child↔parent; `--root` bypasses; `prd log <slug> note "<text>"` appends a `## Note: <ISO>` block; PostToolUse cadence hook auto-logs TaskUpdate / write-class subagent / AskUserQuestion / 60-min heartbeat. Triggers — "create a PRD", "is there an existing PRD on this branch", "note this on the PRD", "log a decision", "resolve / graduate / reopen / sweep PRDs", "PRD doctor / health check". For lifecycle reference see prd-README.md; for inventory see prd-summary; for resume see prd-checkout. Auto-invoked by plan-persistence rule (T1–T6); enforced by prd-guard PreToolUse hook.
---

# /prd — PRD Lifecycle v2

Three-tier ephemeral planning docs with enforced graduation.

## Layout

```
~/dev/prd/
├── scratch/       Wild West — flat, mutable, non-git, where 95% of PRDs live & die
├── archive/       30-day cooling bay after /prd resolve
└── library/       git-tracked, curated, immutable-via-Edit (graduated <5%)
```

## Skill-context lock

Before invoking any tool that writes/edits under `~/dev/prd/` (outside `scratch/`), the skill **MUST** take the context lock:

```bash
# On skill entry
echo "$$" > /tmp/claude-prd-skill.lock
trap 'rm -f /tmp/claude-prd-skill.lock' EXIT
```

The `prd-guard` PreToolUse hook checks for this lock. No lock = writes outside `scratch/` are blocked (or warned in WARN mode).

**Unlock happens automatically on skill exit.** If the skill crashes and leaves a stale lock, `/prd doctor` detects and clears.

## Subcommands

### `/prd new <descriptor> [--parent <slug>] [--root]`

Create a scratch PRD.

**Validation:**
- `<descriptor>` = 3+ snake_case words, optionally `_<suffix>`. Example: `user_mentioned_library_workflow`.
- Filename: `<descriptor>_<YYYY-MM-DD>.md`.
- Rejects if filename already exists in scratch/ or archive/.

**Decision Rule (runs when neither `--parent` nor `--root` is supplied):**

`prd new` reads the current git branch + repo, then scans `~/dev/prd/scratch/` for a PRD with matching `**Branch:**` and `**Repo:**` headers. Three routes:

| Route | Trigger | Agent action |
|---|---|---|
| **NEW-ROOT** | No candidate, or branch in {none, main, master} | Proceed normally |
| **APPEND-NOTE** | Candidate <4h old OR token-overlap ≥50% | CLI exits 2 with redirect to `prd log <slug> note "<descriptor>"` |
| **SUB-PRD** | Candidate within 14 days, neither of above | CLI exits 2 with redirect to `prd new --parent <slug> <descriptor>` |

The agent must read the redirect message and re-invoke with the suggested command. **Use `--root` ONLY when the current branch is being reused for a completely unrelated architectural pivot.** Defaulting to `--root` to suppress the conflict message defeats the rule.

**Flags:**
- `--parent <slug>` — link the new PRD as a child. Writes `**Parent:** <slug>` to the new file's header AND appends the new slug to the parent's `## Children` section (creating the section if missing).
- `--root` — bypass the Decision Rule. Use sparingly.

**Steps:**
1. Take context lock.
2. Write `~/dev/prd/scratch/<descriptor>_<date>.md` from the template (below).
3. Register via `/open-items add "<descriptor>" --tag prd --context "<path>" --project "$PWD"`.
4. Append path to `$PWD/.memory/active-prds.json` (`prd_paths` array).
5. Print: path, open-items ID, ephemeral marker prompt.
6. Release lock.

**Template — enforced sections (absent → creation FAILS):**

```markdown
# <Title from descriptor>

**Ephemeral PRD** — delete when: <REQUIRED — user must fill, no default>

- **Status:** DRAFT
- **Created:** <date>
- **Trigger:** <what caused creation>
- **Related:** <optional — PR/branch/Jira>
**Branch:** <git branch at creation, or "none">
**Repo:** <git repo basename at creation, or "none">
**Parent:** <slug, only if --parent was passed>

## 1. Context
<required, 1-3 paragraphs>

## 2. Current Tasks
<mirror of TaskList at creation>

## 3. Subagent Log
| Spawn | Name | Purpose | Result |
|---|---|---|---|

## 4. Decisions Log
| Time | Decision | Rationale |
|---|---|---|

## 5. Open Items
- [ ]

## 6. Ephemeral Marker
**Delete when:** <explicit condition — MUST match frontmatter>

## 7. Revision Log
| Version | Date | Change |
|---|---|---|
| 0.1 | <date> | Initial draft |
```

### `/prd list [--include-archive] [--include-library]`

Delegates to `/open-items list --tag prd`. Default scope = scratch/ only.

Columns: `id | status | descriptor | age | tier | path`.

Status icons:
- 🔄 actively touched this session
- ⏸ stale (>14d mtime, no activity)
- ✅ resolved (archive)
- 📚 graduated (library)

### `/prd link <id> | --last`

Read-only — surface Status + Current Tasks + Open Items of target PRD into conversation. **Auto-attaches** current Claude Code session UUID to the PRD's `## Sessions` section (idempotent). Takes the skill lock briefly for the attach.

`--last` = most-recently-modified scratch PRD.

### `/prd relate <slug> --to <other-slug> --type <type> [--reason "<text>"] [--force]` (added 2026-05-09)

Connect two **existing** PRDs with a typed edge. Edges are stored as JSON inside a fenced code block under `## Relations` (machine-friendly; survives manual edits as long as the JSON parses). The inverse edge is auto-mirrored on the target PRD.

**Edge types and inverses:**
| type | inverse |
|---|---|
| `parent` | `child` |
| `blocks` | `blocked-by` |
| `supersedes` | `superseded-by` |
| `relates-to` | `relates-to` (symmetric) |

**Behaviors:**
- Idempotent — re-relating the same edge is a no-op
- `parent` is single-valued: if the source already has a parent, refuse without `--force`. With `--force`, also auto-cleans the stale `child` edge on the previous parent
- `--reason "<text>"` records the why on both sides; only overwritten with `--force`
- Reads canonical JSON-block format AND legacy `**Parent:**` header / `## Children` section, so older PRDs Just Work without migration

**Storage format on disk:**
```markdown
## Relations

​```json
[
  {"type": "parent", "slug": "vscode_prd_visualizer_extension_2026-05-07"},
  {"type": "blocks", "slug": "prdone_phase2", "reason": "needs --with-tree first"}
]
​```
```

### `/prd unrelate <slug> --to <other-slug> [--type <type>]`

Remove an edge AND its mirror. With `--type`, removes only that specific type; without, removes ALL edges between the two slugs. Quiet no-op if nothing matches.

### `/prd link-parent <child-slug> --parent <parent-slug>` (sugar)

Shortcut for `prd relate <child> --to <parent> --type parent`. Mirrors `prd new --parent` behavior on existing PRDs.

### `/prd unlink-parent <child-slug>` (sugar)

Shortcut for removing the parent edge. Reads the current parent from the child file and removes it on both sides.

### `/prd orphans [--all] [--json|--table]`

List PRDs that have ZERO relationships (no parent, no children, no blockers, no relates-to). Default scans `scratch/`; `--all` adds archive + library. Useful before a session cleanup pass to find candidates for linking.

### `/prd attach <id> [--session <uuid>] [--scope "<text>"]`

Manually attach a session UUID to a PRD's `## Sessions` section. Defaults to detecting the current Claude Code session via the most-recently-modified JSONL in `~/.claude/projects/`. Useful for:
- Backfilling old work (`--session f82acd7f-...`) where auto-attach didn't fire
- Disambiguating when multiple Claude sessions are running in parallel (auto-detect picks one; explicit attach overrides)
- Adding context with `--scope "what we did this session"`

Idempotent — same UUID never appended twice. Creates the `## Sessions` section if missing (placed before `## Ephemeral Marker`).

### `/prd log <id> subagent <name>="<purpose>" [--result "<r>"]`

Append row to target PRD's Subagent Log. Auto-invoked by `plan-persistence` rule on Agent tool calls when an active PRD is present.

### `/prd log <id> decision "<text>"`

Append row to Decisions Log with ISO timestamp.

### `/prd log <id> note "<text>"`

Append a `## Note: <ISO-timestamp>` block to the PRD body (inserted before `## Ephemeral Marker` if present, else appended at end). Used by:
- The `prd new` Decision Rule for APPEND-NOTE redirects (small refinements within scope of an active PRD).
- The PRD-cadence PostToolUse hook for task completions and 60-min heartbeats.
- The agent for environmental updates / scope-drift notes that aren't full decisions.

Idempotent timestamps; multiple notes accumulate chronologically. Does NOT collide with `subagent` (Subagent Log table) or `decision` (Decisions Log table) verbs — they're orthogonal.

### `/prd find [--branch <b>] [--repo <r>]`

Read-only helper used internally by the Decision Rule. Returns `<slug>\t<mtime_epoch>` for the most-recently-modified scratch PRD whose `**Branch:**` and `**Repo:**` headers match (defaults: current git branch / repo). Empty stdout when no candidate exists.

Useful for the agent to *check before creating*: `prd find` first; if a row comes back, decide to `prd log <slug> note ...`, `prd new --parent <slug> ...`, or (rare) `prd new --root ...`.

### `/prd resolve <id>` ⚠ **interrogative**

Close a scratch PRD with mandatory human-in-the-loop summary.

**Steps:**
1. Take context lock.
2. Read PRD; verify Ephemeral Marker present (else prompt to add + re-run).
3. **Prompt user (required, stdin):** "One sentence: why are you closing this PRD?"
   - If stdin not a tty (loop/bg): require `--reason "..."` flag or abort.
4. LLM synthesizes Resolution Summary from:
   - User's one-sentence answer
   - Decisions Log
   - Subagent Log
   - File length / mtime span
   - Template below
5. Compute **Significance Score** (0-100):
   - `architectural_keywords` (design|architecture|schema|hook|rule|constitution|pipeline|refactor): +5 each, cap 30
   - `subagent_count`: +5 per subagent, cap 20
   - `decision_count`: +3 per decision, cap 20
   - `work_days_span` (created → resolved): +3 per day, cap 15
   - `file_length`: ≥8 KB = +10, ≥15 KB = +15
6. Append Resolution Summary to PRD.
7. Move file `scratch/<f>.md` → `archive/<f>.md`.
8. Update open-items: `/open-items done <id> --evidence "<one-sentence>"`.
9. **If score ≥60:** prompt "This looks foundational (score=<N>). Graduate to library? [y/N]". Default = first-letter of user-statement's sentiment (neutral → N).
   - `y` → continue to `/prd graduate <id>`.
10. Release lock.

**Resolution Summary appended template:**

```markdown
## Resolution — <date>

**User statement:** <verbatim>

**Outcome:** <LLM synthesis>

**What worked:**
- <bullets>

**What didn't (be honest — include at least one thing that failed):**
- <bullets>

**Decisions that survive:**
- <bullets — candidates for library graduation>

**Significance score:** <N> / 100
  - architectural_keywords: <n>
  - subagent_count: <n>
  - decision_count: <n>
  - work_days_span: <n>
  - file_length: <chars>

**Graduate?** <yes/no>
```

### `/prd graduate <id>`

Promote an archived PRD to the git-tracked library.

**Steps:**
1. Take context lock.
2. Verify PRD is in `archive/` (reject scratch — must resolve first).
3. Verify Resolution Summary present (reject if missing).
4. **Dual-confirm (MCP creative-op rule):**
   - Prompt 1: "Graduating `<slug>` to library. Tags (comma-separated)?"
   - Prompt 2: "Confirm graduation? (y/N)"
5. Generate YAML frontmatter:
   ```yaml
   ---
   id: L<next-3-digit>
   title: <from filename>
   graduated: <date>
   tags: [<list>]
   significance: <score-from-resolution>
   source_path: archive/<original>
   revisions: 1
   ---
   ```
6. Prepend frontmatter to file; copy (don't mv — keep archive copy for 30d) → `library/<id>_<slug>.md`.
7. Regenerate `library/INDEX.md` by scanning all `library/*.md` frontmatter.
8. `git -C ~/dev/prd/library add -A && git commit -m "graduate: <slug>"`.
9. Release lock.

### `/prd revision <id> "<reason>"`

The ONLY path to edit a graduated PRD.

**Steps:**
1. Take context lock.
2. Open `library/<id>_*.md` in `$EDITOR`.
3. On close: bump `revisions` in frontmatter, append to Revision Log.
4. Regenerate INDEX.md.
5. `git commit -m "revise: <slug> — <reason>"`.
6. Release lock.

### `/prd reopen <id>`

Move an archived PRD back to scratch. Used when resolved work needs resumption.

**Steps:**
1. Take lock.
2. `mv archive/<f>.md scratch/<f>.md`.
3. Append to Revision Log: "Reopened <date> — <reason>".
4. `/open-items reopen <id>`.
5. Release lock.

### `/prd sweep`

Manual stale-flag. Normally runs automatically at `/session-reconcile` start.

**Never auto-deletes.** For each file in `scratch/`:
- If `mtime > 14d ago` AND no Resolution Summary:
  - Print flag.
  - Prompt per file: `[R]esolve now / [T]ouch mtime to keep / [D]elete / [S]kip`.

For each file in `archive/`:
- If `mtime > 30d ago`:
  - If significance ≥60 and NOT already graduated: prompt "Graduate?"
  - Else: prompt "Delete?"

### `/prd doctor`

Health check. Reports:
- Active-PRDs sync: count in `.memory/active-prds.json` vs actual files in scratch/.
- Orphan files in scratch/ (not in open-items).
- Ephemeral-marker compliance (missing count).
- Archive age distribution (0-7d / 8-30d / >30d).
- Library INDEX consistency (frontmatter ↔ INDEX rows).
- Stale context lock at `/tmp/claude-prd-skill.lock` (clears if process doesn't exist).

## Integration

### Storage model (delegation to open-items)

PRDs = two artifacts:
1. **File** — rich markdown in `scratch/` → `archive/` → `library/`.
2. **Ledger entry** — one row in `~/.claude/continuity_ledger.jsonl` (managed by `/open-items`), tagged `prd`, context = file path.

Project-local breadcrumb at `<cwd>/.memory/active-prds.json`:
```json
{
  "active": [
    { "id": "...", "path": "/.../scratch/<f>.md", "status": "open", "created": "...", "descriptor": "...",
      "branch_at_creation": "...", "owner_path": "/.../<project-root>", "session_origin": "<uuid>" }
  ]
}
```

**Sentinel requirement (origin 2026-05-15 cross-contamination incident):**
- Any `.memory/` directory acting as a PRD scope MUST have a `.prd-owner` sentinel file.
- `prd new` / `prd link` / cadence + diary hooks walk UP from cwd looking for `.memory/.prd-owner`. No sentinel found → WARN-with-options (CLI) or silent skip (hooks). No silent fallback to global.
- Bootstrap a new scope: `prd init-owner --scope project --description "<one line>" [--dir <path>]`
- For root-tier cross-cutting PRDs: `prd new --root <descriptor>` (requires `~/dev/.memory/.prd-owner` with `scope=root`).
- Inspect current resolution: `prd context`

Sentinel file format:
```
scope=project|root
created=YYYY-MM-DD
description=<one-line summary>
```

See `~/.claude/rules/domains/plan-persistence.md § Cross-session restoration` for the full policy. Schema migration tool: `~/.claude/scripts/prd-schema-migrate.py`.

### Session restoration

On `/session-reconcile`:
1. Read `<cwd>/.memory/active-prds.json` (fast project-local).
2. `/open-items list --tag prd --project <cwd>` (canonical).
3. Run `/prd sweep` (stale check).
4. Surface top 3 active by recency; ask user to `link` one.

### Session auto-tracking (added 2026-04-28)

When `prd` runs inside Claude Code (`CLAUDECODE=1`), every write subcommand auto-appends the current session UUID to a `## Sessions` section in the target PRD:

| Subcommand | Auto-attaches? | Scope text written |
|---|---|---|
| `link` | ✓ | `linked / context lookup` |
| `attach` | ✓ (this is the explicit form) | user-supplied via `--scope` |
| `log subagent` | ✓ | `logged subagent` |
| `log decision` | ✓ | `logged decision` |
| `resolve` | ✓ (on the archived path) | `resolved: <reason>` |
| `graduate` | ✓ (on the library path) | `graduated — tags=<tags>` |
| `revision` | ✓ | `revised: <reason>` |
| `reopen` | ✓ (on the new scratch path) | `reopened from archive` |
| `new` | ✗ | (no session known yet — happens before linking) |
| `list` / `summary` / `doctor` | ✗ | (read-only) |

**Detection heuristic:** picks the most-recently-modified JSONL across all `~/.claude/projects/*/` subdirs in the last 10 minutes. Usually correct, but with multiple parallel Claude sessions running it can pick a sibling. For unambiguous attaches, use `prd attach <id> --session <uuid>` explicitly.

**Idempotency:** the same UUID is never appended twice. Re-running `link` or any other subcommand against the same PRD in the same session is safe.

**Section format auto-created** if missing:
```markdown
## 9. Sessions

| Date | Session UUID | Scope |
|---|---|---|
| 2026-04-28 | `b7eba9ee-9766-...` | linked / context lookup |
```
Inserted before `## Ephemeral Marker` if present, else appended at end.

**Disable globally:** `export PRD_NO_AUTO_ATTACH=1`. Useful for scripted backfills where you don't want the running shell's session attached, or when you're running `prd` outside of a meaningful "session".

**Why this exists:** when checking out an old PRD via `/prd-checkout`, the `## Sessions` section gives a list of session UUIDs to feed into `session-search` for richer context recovery — much better than guessing which past session touched which work.

### Auto-invoke triggers

`~/.claude/rules/domains/plan-persistence.md` defines T1-T6. The rule tells the agent WHEN to invoke `/prd new`. This skill defines HOW.

### prd-guard hook

The `~/.claude/hooks/prd-guard/prd-guard.sh` PreToolUse hook enforces:
- Write/Edit to `scratch/` — always allowed.
- Write/Edit to root `~/dev/prd/` — blocked unless `/tmp/claude-prd-skill.lock` present.
- Write/Edit to `archive/` — blocked unless skill lock present.
- Write/Edit to `library/` — blocked except via `/prd revision` path.

Starts in **WARN mode** (logs violations to stderr, never blocks). Flip to STRICT by setting `PRD_GUARD_STRICT=1` in settings.json env.

## What this is NOT

- Not a Confluence replacement.
- Not an ADR system (ADRs are system-wide decisions; PRDs are multi-step work).
- Not a ticket system (Jira is ticket; PRD is working doc).
- Not a knowledge base (memory-bank/ + Graphiti cover that).

Library entry bar: "multi-step planning doc encoding a durable decision we'll want to re-read in 6 months."

## Tag Ontology (origin 2026-05-12)

Every PRD carries a `tags:` array in YAML frontmatter using a **5-namespace closed ontology** plus free-form tags. The `prd` CLI populates these automatically; agents can also set them manually with `prd tag`.

### Namespaces (closed set — unknown namespaces are not auto-detected)

| Namespace | Examples | Purpose |
|---|---|---|
| `domain:` | `domain:hcc`, `domain:raf`, `domain:cdia`, `domain:careplan`, `domain:quality`, `domain:hedis`, `domain:scheduling`, `domain:tcm`, `domain:awv`, `domain:behavioral-health`, `domain:membership`, `domain:attribution` | Clinical / business domain |
| `payor:` | `payor:bcbs`, `payor:medicare`, `payor:aetna`, `payor:uhc`, `payor:cigna`, `payor:humana`, `payor:multi` | Payor identification |
| `type:` | `type:audit`, `type:bugfix`, `type:feature`, `type:refactor`, `type:spike`, `type:doc`, `type:postmortem`, `type:migration` | Work type |
| `repo:` | `repo:databricks-dbt`, `repo:hh-dev`, `repo:prdone`, `repo:quality`, `repo:zeno` | Source repository (from frontmatter `Repo:` field) |
| `jira:` | `jira:DEV-1234`, `jira:RAF-001`, `jira:BAS-2` | Linked Jira keys (allowlist: DEV, RAF, HCC, CDIA, BAS, TIC, SAL, CCM, QUAL) |
| `tool:` | `tool:agentbridge`, `tool:promptchain`, `tool:dspy`, `tool:chiron`, `tool:sio`, `tool:prdone`, `tool:hhdev`, `tool:zeno`, `tool:cube`, `tool:databricks`, `tool:snowflake`, `tool:graphiti`, `tool:hybridrag`, `tool:superset`, `tool:tableau`, `tool:claude-code`, `tool:tuva` | Tooling / infrastructure (orthogonal to clinical `domain:`) |

Plus **free-form tags** without a `:` prefix (e.g. `urgent`, `blocked`, `wip`). Auto-detector never touches these.

### Commands

```bash
prd tag <id> show                    # show current tags as CSV
prd tag <id> add tag1[,tag2,...]     # add (merges, dedups)
prd tag <id> remove tag1[,tag2,...]  # remove specific tags
prd tag <id> set tag1,tag2           # replace entire tag set (manual override)
prd tag <id> auto                    # run auto-detector on this one PRD
prd sweep --retag                    # auto-detect across all scratch + archive (library skipped)
prd tag-audit                        # list PRDs with empty tags (report-only)
prd tag-audit --fix                  # run auto_tag on each empty PRD; reports stragglers
```

**Note**: `prd new` automatically runs `auto_tag` on the new file before returning, so every fresh PRD ships with whatever signal exists in the title + scaffold body. Re-run `prd tag <id> auto` after you flesh out the Context section.

### Coexistence rules (MANDATORY when editing tags programmatically)

- **Auto-sweep MAY add, replace, or remove** tags whose prefix matches a known namespace
- **Auto-sweep MUST NOT touch** tags without a `:` separator (free-form tags survive across sweeps)
- **Library tier is read-only for retag** — graduated tags are canonical; auto-detector skips library
- Manual overrides via `prd tag <id> set` survive subsequent sweeps unless the body text materially changes the detector signal

### When agents should use this

- Surface tag context in `/prd-checkout`: when checking out a PRD, mention its domain/payor/type so the next-step decisions are anchored to the right business context.
- After substantial body edits (>200 char change to context), re-run `prd tag <id> auto` so derived tags stay fresh.
- Never write tags directly to frontmatter via `Edit` — always go through `prd tag` so the auto-detector merges cleanly.

Full ontology spec: `~/dev/prd/scratch/prd_tag_ontology_2026-05-12.md` (extension UI work pending P4-P7).

## Lifecycle hooks

- `/compact` — pre-compact hook serializes active PRD IDs to `.pre-compact-discoveries.json`.
- `/session-reconcile` — auto-runs `/prd sweep`.
- `/prd resolve` with significance ≥60 → auto-nudge graduate prompt.
- 30d in archive with no graduate → offer delete (never auto-rm).
