# PRD Skills — Summary & Workflows

There are **6 PRD-related skills** covering an ephemeral planning-doc lifecycle. Files live in `~/dev/prd/{scratch,archive,library}/`.

## The skills

| Skill | Role |
|---|---|
| **`/prd`** | Master CLI: `new`, `list`, `link`, `attach`, `log`, `find`, `resolve`, `graduate`, `revision`, `reopen`, `sweep`, `doctor` |
| **`/prd-checkout`** | "Put this PRD back in my head" — resume work after >1 day; classifies WORK vs PERSONAL, ASKS before pulling Jira/Confluence/Bitbucket via MCP, prints briefing card |
| **`/prd-summary`** | Librarian view of all PRDs across tiers (cards/table/json, filters by stale/active/archived/graduated, sort by age/tier/significance) |
| **`/prd-diary`** | Per-session narrative on the active PRD (open/close auto via hooks; manual `append --done/--discussed/--escalation/--pickup`) |
| **`/session-prd-cleanup`** | Back-fills missing `prd log`/`diary` entries by scanning recent session JSONLs for keyword hits per open PRD |
| **`prd-README`** | Reference doc (not a skill) — explains tiers, status signals, lifecycle |

## Three-tier lifecycle

```
scratch/  →  archive/  →  library/
 active     resolved     graduated (git-tracked, ≥60 significance)
```

| Tier | Means | Next step |
|---|---|---|
| `scratch/` | Active or stale-active | Work on it, log progress, eventually `prd resolve` |
| `archive/` | Closed but recent | Read for history; `prd reopen` if work resumes; auto-pruned at 30d |
| `library/` | Graduated, foundational | Read-only reference; `prd revision` for amendments |

## Four status signals (priority order)

1. **Tier (folder)** — coarse status (scratch=active, archive=resolved, library=graduated)
2. **`## Resolution` header presence** — fine status within scratch
3. **`**Status:**` prose header** — agent-authored hint (DRAFT/ACTIVE/DEFERRED/BLOCKED/RESOLVED), NOT enforced
4. **Age + activity** — staleness detector (scratch ≥14d no Resolution = stale; archive ≥30d = old)

## Core workflows

### 1. Create — `prd new <descriptor>`

Runs a **Decision Rule** on current git branch+repo before writing:

| Route | Trigger | Action |
|---|---|---|
| **NEW-ROOT** | No candidate, or branch in {none, main, master} | Proceed normally |
| **APPEND-NOTE** | Candidate <4h old OR token-overlap ≥50% | CLI exits 2 → redirect to `prd log <slug> note "<descriptor>"` |
| **SUB-PRD** | Candidate within 14 days, neither of above | CLI exits 2 → redirect to `prd new --parent <slug> <descriptor>` |

Auto-invoked by `plan-persistence.md` rules T1–T6:
- T1: ≥3-step plan
- T2: 2+ parallel sub-agents
- T3: 4+ active tasks
- T4: Cross-session work (>2hr or spans `/compact`)
- T5: 3+ conflicting truths to reconcile
- T6: User explicit ask ("write this down", "big one")

Flags: `--parent <slug>` (link as child), `--root` (bypass Decision Rule, use sparingly)

### 2. Work / log — auto-cadence

**PostToolUse cadence hook** (`~/.claude/hooks/prd-cadence/post-tool-use.sh`) auto-logs to the active PRD:

| Event | Auto-logged as |
|---|---|
| `TaskUpdate(status=completed)` | `## Note: <ISO> — Task completed: <subject>` |
| `TaskUpdate(status=blocked)` | Decisions Log row: `Blocked: <subject>` |
| `Agent` (write-class subagent return, 15-min dedup) | Subagent Log row: `<subagent_type>=returned` |
| `AskUserQuestion` answered | Decisions Log row: `User chose: <Q→A>` |
| 60-min wall-clock silence on active PRD | `## Note: <ISO> — Heartbeat (60min mark)` |

**Manual logging** only for architectural pivots the hook missed:
```bash
prd log <slug> decision "switched from approach A to B because A blocked on X"
prd log <slug> note "<small refinement>"
prd log <slug> subagent <name>="<purpose>"
```

### 3. Diary — per-session narrative

Lives at `## 10. Dev Diary` at bottom of PRD. Auto open/close via SessionStart/Stop/PreCompact hooks.

**Manual append (BLOCKING) required after:**
1. `gemini_debug` was called → `--escalation`
2. Approach abandoned ("let's try X instead") → `--discussed`
3. User corrected agent direction → `--escalation`
4. Material decision not in Decisions Log → `--discussed`
5. Subagent returned with substantive finding → `--done`
6. Session wrap ("done for today") → `--pickup`

```bash
prd diary <slug> append --done "<bullet>"
prd diary <slug> append --discussed "<bullet>"
prd diary <slug> append --escalation "<bullet>"
prd diary <slug> append --pickup "<replaces Next pickup line>"
```

### 4. Resume — `/prd-checkout <slug>`

The "put-back" — bringing the PRD back into your head. Steps 1–5 (never skip user-confirm):

1. Run `prd checkout <id>` CLI (deterministic — reads PRD, runs `git log` on named branch)
2. Classify as WORK or PERSONAL based on Jira/Bitbucket/HH-keyword signals
3. **ASK user** before pulling Jira/Confluence/Bitbucket PR comments via MCP
4. Pull external context in parallel
5. Synthesize "where you left off" briefing card

Writes a Revision Log entry — reading IS a breadcrumb. Always use slash command (not just CLI) when returning after >1 day.

### 5. Resolve — `prd resolve <slug>` (interrogative)

1. Take context lock
2. Verify Ephemeral Marker present
3. **Prompt user** (required, stdin): "One sentence: why are you closing this PRD?"
4. LLM synthesizes Resolution Summary
5. Compute **Significance Score** (0–100):
   - architectural_keywords (design/architecture/schema/hook/rule/constitution/pipeline/refactor): +5 each, cap 30
   - subagent_count: +5 each, cap 20
   - decision_count: +3 each, cap 20
   - work_days_span: +3/day, cap 15
   - file_length: ≥8KB = +10, ≥15KB = +15
6. Append Resolution Summary, move file `scratch/` → `archive/`
7. Update open-items
8. **If score ≥60:** prompt to graduate

### 6. Graduate — `prd graduate <slug>`

Promote archive → library (git-tracked, immutable via Edit).

1. Take lock; verify in `archive/` with Resolution Summary
2. **Dual-confirm** (MCP creative-op rule): tags + final yes
3. Generate YAML frontmatter (`id: L<NNN>`, `title`, `graduated`, `tags`, `significance`, `revisions: 1`)
4. Copy to `library/<id>_<slug>.md`
5. Regenerate `library/INDEX.md`
6. `git commit -m "graduate: <slug>"`

Library PRDs amended ONLY via `prd revision <slug> "<reason>"` (opens $EDITOR, bumps revision counter, commits).

### 7. Reopen — `prd reopen <slug>`

`mv archive/<f>.md scratch/<f>.md` + Revision Log entry. Used when resolved work needs resumption.

### 8. Sweep / Doctor — periodic hygiene

```bash
prd sweep    # flag stale scratch (≥14d, no Resolution) + old archive (≥30d) — never auto-deletes
prd doctor   # health check: tier counts, breadcrumb sync, ephemeral marker compliance, hook presence
```

### 9. Session-PRD cleanup — `/session-prd-cleanup`

Bridges gap between work-that-happened (session JSONLs) vs work-that-was-logged (PRD logs).

Workflow (BLOCKING user-confirm before writes):
1. Inventory open scratch PRDs
2. For each: derive keywords + last-logged timestamp
3. **Read FULL PRD body** (added 2026-05-05 — header-only reads caused 3/4 stale back-fill drafts)
4. Run `session-search <keywords> --recent N --files`
5. Build audit table (drift YES/BORDERLINE/NO + proposed entries)
6. ASK user — apply all / pick selectively / skip
7. Apply via `prd log note` + optional `prd diary append --done`
8. Re-list open PRDs with real status

## Parent / child / sibling structure (shipped 2026-04-30)

- **Parent → child**: child has `**Parent:** <slug>` header; parent has `## Children` section
- **Sibling**: default flat layout
- **Append-note**: minor refinement → `## Note: <ISO>` block on existing PRD instead of new file

Decision Rule routes new work to right relationship automatically.

## Storage model

PRDs are TWO artifacts:
1. **File** — rich markdown in `scratch/` → `archive/` → `library/`
2. **Ledger entry** — one row in `~/.claude/continuity_ledger.jsonl` (managed by `/open-items`), tagged `prd`, context = file path

Project-local breadcrumb: `<cwd>/.memory/active-prds.json` (lookup optimization only — `/open-items` is canonical).

## Session auto-tracking (added 2026-04-28)

When `prd` runs inside Claude Code (`CLAUDECODE=1`), every write subcommand auto-appends current session UUID to `## 9. Sessions` table:

| Subcommand | Auto-attaches? |
|---|---|
| `link`, `attach`, `log subagent`, `log decision`, `resolve`, `graduate`, `revision`, `reopen` | ✓ |
| `new`, `list`, `summary`, `doctor` | ✗ (read-only or pre-link) |

Idempotent (same UUID never appended twice). Disable: `export PRD_NO_AUTO_ATTACH=1`.

## Enforcement (hooks & locks)

- **`prd-guard` PreToolUse hook** (`~/.claude/hooks/prd-guard/prd-guard.sh`): blocks writes outside `scratch/` unless skill lock `/tmp/claude-prd-skill.lock` present. Starts in WARN mode; flip to STRICT via `PRD_GUARD_STRICT=1`.
- **`prd-cadence` PostToolUse hook**: auto-logs TaskUpdate / subagent / AskUserQuestion / 60-min heartbeat
- **Diary hooks** (SessionStart/Stop/PreCompact): auto open/close diary entries
- **Skill-context lock**: every write subcommand takes/releases `/tmp/claude-prd-skill.lock`
- **Auto session-attach**: `## Sessions` table records every UUID that touched the PRD (fed into `session-search` by `/prd-checkout`)

## Daily commands cheat sheet

```bash
prd summary --table              # state of the world
prd summary --stale-only         # what's rotting
prd summary --by-significance    # foundational first
prd checkout <slug>              # resume — briefing card
/prd-checkout <slug>             # full resume (CLI + Jira/Confluence pull)
prd new <descriptor>             # create — runs Decision Rule
prd log <slug> note "..."        # quick note
prd log <slug> decision "..."    # architectural pivot
prd find                         # is there an active PRD on this branch?
prd resolve <slug>               # close
prd graduate <slug>              # promote archive → library
prd revision <slug> "..."        # amend a library PRD
prd sweep                        # report stale + old
prd doctor                       # health check
```

## What this system is NOT

- Not a Confluence/Jira/Bitbucket replacement — those remain canonical for cross-team work
- Not a task list — `TaskCreate`/`TaskUpdate` remain canonical for in-session task state
- Not a memory store — Graphiti and `memory-bank/` remain canonical for persistent knowledge; PRDs are working surface only
- Not an ADR system — ADRs are system-wide decisions; PRDs are multi-step work
- Not a dashboard — `prd summary` is intentionally terminal-only

Library entry bar: "multi-step planning doc encoding a durable decision we'll want to re-read in 6 months."

## Where the rules live

| Concern | File |
|---|---|
| Subcommand reference + Decision Rule + flags | `~/.claude/skills/prd.md` |
| Resume / "put-back" flow | `~/.claude/skills/prd-checkout.md` + `~/.claude/commands/prd-checkout.md` |
| Librarian / inventory view | `~/.claude/skills/prd-summary.md` |
| Diary | `~/.claude/skills/prd-diary.md` |
| Session cleanup | `~/.claude/skills/session-prd-cleanup.md` |
| Auto-invoke triggers (T1–T6) + Decision Rule + Cadence Rubric | `~/.claude/rules/domains/plan-persistence.md` |
| CLI implementation | `~/bin/prd` |
| Write gate | `~/.claude/hooks/prd-guard/prd-guard.sh` |
| Auto-cadence logging | `~/.claude/hooks/prd-cadence/post-tool-use.sh` |
| Project-local breadcrumb | `<cwd>/.memory/active-prds.json` |
