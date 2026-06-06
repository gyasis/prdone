---
name: prd-README
description: Reference doc for the PRD lifecycle system. NOT a skill — open this file when you (or the agent) need to understand "where is this PRD sitting", "what state is it in", "is it stale", or "what's the next step". Companion to prd.md (skill spec), prd-checkout.md (resume flow), prd-summary.md (librarian view).
---

# PRD Lifecycle — How It Works

A PRD is an **ephemeral working surface** for a multi-step plan. It lives on disk, gets logged to as work happens, and ends in one of three places: deleted, archived, or graduated to the library.

This file explains the lifecycle, the four status signals, and the daily commands. For implementation, see `prd.md`. For the design rationale, see `~/.claude/rules/domains/plan-persistence.md`.

---

## The three tiers (where the file physically lives)

```
~/dev/prd/
├── scratch/    Active work. ~3-5 PRDs/day land here. Mutable. NOT git-tracked.
├── archive/    Resolved (closed). 30-day cooling bay. Mutable but inactive.
└── library/    Graduated. Significance ≥ 60. Git-tracked. Has frontmatter, INDEX.md.
```

**Tier IS the primary status.** When you ask "where is this PRD?", check which folder it's in.

| Tier | Means | Next step |
|---|---|---|
| `scratch/` | Active or stale-active | Work on it, log progress, eventually `prd resolve` |
| `archive/` | Closed but recent | Read it for history; `prd reopen` if work resumes; auto-pruned at 30d |
| `library/` | Graduated, foundational | Read-only reference; `prd revision` for amendments |

---

## The four status signals (in priority order)

When the agent asks "what state is this PRD in?", it checks these in order:

### 1. Tier (folder location) — coarse status
- Scratch = active
- Archive = resolved
- Library = graduated

### 2. `## Resolution` header presence — fine status within scratch
- **No `## Resolution`** = work in progress
- **Has `## Resolution`** = was resolved but not yet moved to archive (rare, transitional)

In archive/library, `## Resolution` is always present (writing it is what `prd resolve` does).

### 3. `**Status:**` prose header — agent-authored sub-state
A free-text bold-prose line in the PRD's header block. Common values you'll see:
- `DRAFT` — just created, plan still being written
- `ACTIVE` — actively being worked on
- `DEFERRED` — paused for a known reason (parent PRD, blocker)
- `BLOCKED` — waiting on external input
- `RESOLVED` — closed (mirrors `## Resolution`)

This field is **not enforced**. Treat it as a hint, not ground truth. Tier + `## Resolution` are authoritative.

### 4. Age + activity — staleness detector
`prd list` and `prd sweep` use mtime to flag stale work:
- **Scratch** PRD with no activity in **≥14 days** + no `## Resolution` → marked `⏸ stale`
- **Archive** PRD older than **≥30 days** → marked `🗑 old` (candidate for delete or graduate)

These are SOFT signals — sweep never auto-deletes. It just reports.

---

## "Where am I sitting on this PRD?" — the answer in one command

```bash
prd summary --table          # at-a-glance: all PRDs, all tiers, with age + activity counts
prd summary --stale-only     # what's rotting in scratch
prd summary --by-significance # sorted — foundational work at top
```

The output of `prd summary` is the canonical "state of the world" view. It shows for each PRD:
- **TIER** (scratch / archive / library) — primary status
- **AGE** in days
- **STATUS** column (ACTIVE / RESOLVED, derived from `## Resolution` presence)
- **D / A** counts (Decisions logged / subAgents logged) — proxies for engagement
- **SIG** (significance score 0-100, set during `resolve`)
- **⏸** flag if stale-active

To go deeper on one PRD: `prd checkout <slug>` (see "Resume work" below).

---

## The lifecycle, step by step

### 1. Create — `prd new <descriptor>`

Triggered automatically by `plan-persistence.md` rules T1–T6 (multi-step plans, parallel sub-agents, 4+ TaskCreates, cross-session work, multi-truth reconciliation, user explicit ask).

The CLI runs the **Decision Rule** before writing the file:

```
Detect git $BRANCH + $REPO  →  scan scratch/ for matching active PRD
  No candidate         →  NEW-ROOT (file written)
  <4h or overlap≥50%   →  exit 2 with redirect to: prd log <slug> note "<descriptor>"
  <14 days             →  exit 2 with redirect to: prd new --parent <slug> <descriptor>
  ≥14 days             →  NEW-ROOT
```

Use `--root` to bypass (only when the branch is being reused for unrelated work).
Use `--parent <slug>` to explicitly link as a child.

Output: file at `~/dev/prd/scratch/<descriptor>_<YYYY-MM-DD>.md` with the standard sections (Context, Current Tasks, Subagent Log, Decisions Log, Open Items, Ephemeral Marker, Revision Log) plus `**Branch:**`, `**Repo:**`, and (if applicable) `**Parent:**` headers.

### 2. Work — log as you go

A **PostToolUse cadence hook** at `~/.claude/hooks/prd-cadence/post-tool-use.sh` auto-logs to the active PRD:

| Event | Auto-logged as |
|---|---|
| `TaskUpdate(status=completed)` | `## Note: <ISO> — Task completed: <subject>` |
| `TaskUpdate(status=blocked)` | row in Decisions Log: `Blocked: <subject>` |
| `Agent` tool with write-class subagent return (15-min dedup) | row in Subagent Log: `<subagent_type>=returned` |
| `AskUserQuestion` answered | row in Decisions Log: `User chose: <Q→A>` |
| 60-min wall-clock silence on the active PRD | `## Note: <ISO> — Heartbeat (60min mark)` |

You only need to **manually** log when you make an architectural pivot the hook didn't capture:

```bash
prd log <slug> decision "switched from approach A to B because A blocked on X"
```

Disable the hook anytime: `export PRD_CADENCE_DISABLED=1`.

### 3. Resume work — `prd checkout <slug>` / `/prd-checkout <slug>`

This is the **"put-back" — bringing the PRD back into your head**.

- `prd checkout <slug>` (CLI) — deterministic. Reads the PRD, classifies as WORK or PERSONAL based on Jira/Bitbucket/HH-keyword signals, runs `git log` on the named branch if available, prints a briefing card.
- `/prd-checkout <slug>` (slash command / skill) — wraps the CLI, ASKS before pulling Jira/Confluence/Bitbucket via MCP, synthesizes a "where you left off" briefing across all signals.

Always run the slash command, not just the CLI, when you're returning to a PRD after >1 day.

**The checkout writes a row to the PRD's Revision Log** — so even reading a PRD leaves a breadcrumb that you came back to it.

### 4. Resolve — `prd resolve <slug>`

Closes a scratch PRD. Mandatory human-in-the-loop:
1. CLI prompts: "One sentence: why are you closing this PRD?"
2. CLI computes a **significance score** (0-100) from architectural keywords + subagent rows + decisions rows + file length.
3. CLI appends a `## Resolution — <date>` block: user statement, outcome (LLM-synthesized), what worked, what didn't, decisions that survive, significance score, "graduate? (y/N)" prompt.
4. File moves to `archive/`.
5. If significance ≥60, CLI offers to graduate immediately.

### 5. Graduate — `prd graduate <slug>`

Promotes an archived PRD to `library/`. The library is **git-tracked**. Files get YAML frontmatter (`id: L00N`, `title:`, `graduated:`, `tags:`, `revisions:`). `INDEX.md` regenerates. A git commit happens.

Library PRDs are **immutable via Edit** — the prd-guard hook blocks direct writes. Use `prd revision <slug> "<reason>"` to amend (opens in $EDITOR, bumps revisions counter, appends to Revision Log, commits).

### 6. Reopen — `prd reopen <slug>`

Moves an archived PRD back to scratch with a new revision-log entry. Use when you discover the work isn't actually done.

### 7. Sweep / Doctor — periodic hygiene

```bash
prd sweep    # report stale scratch (≥14d, no Resolution) + old archive (≥30d)
prd doctor   # health check: tier counts, breadcrumb sync, ephemeral marker compliance, hook presence
```

Neither auto-modifies anything. They're advisory.

---

## Parent / child / sibling structure

Shipped 2026-04-30. Three relationship types:

- **Parent → child** (one parent, many children): child file has `**Parent:** <slug>` header; parent file has `## Children` section listing each child slug.
- **Sibling** (no link): default; flat layout that predated the system.
- **Append-note** (no new file): minor refinement gets a `## Note: <ISO>` block on an existing PRD instead of a new file.

The Decision Rule (above) routes new work to the right relationship automatically.

To see the tree: `grep -r "**Parent:**" ~/dev/prd/scratch/` (a `prd list --tree` view is on the v2 roadmap).

---

## Daily commands cheat sheet

```bash
prd summary --table         # state of the world
prd summary --stale-only    # what's rotting
prd checkout <slug>         # resume — get a briefing card
/prd-checkout <slug>        # full resume (CLI + Jira/Confluence pull)
prd new <descriptor>        # create — runs Decision Rule
prd log <slug> note "..."   # append a quick note
prd log <slug> decision "..."  # log an architectural pivot
prd find                    # is there an active PRD on this branch?
prd resolve <slug>          # close
prd graduate <slug>         # promote archive → library
prd revision <slug> "..."   # amend a library PRD
prd sweep                   # report stale + old
prd doctor                  # health check
```

---

## Status quick-reference

| Question | Answer |
|---|---|
| Where does this PRD live? | `prd summary --table` (TIER column) or `find ~/dev/prd -name "<slug>*"` |
| Is it active? | In `scratch/` AND no `## Resolution` block. |
| Is it stale? | In `scratch/`, age ≥14 days, no `## Resolution`. `prd summary --stale-only` lists them. |
| Has it been resolved? | `## Resolution` header present (always true in archive/library; rare in scratch). |
| Is it foundational? | In `library/`. Or scratch/archive with `**Significance score:** ≥60` in the Resolution block. |
| Has it been actively worked on? | Decisions Log + Subagent Log row counts (visible in `prd summary --table` D/A columns). |
| Has it been touched recently? | mtime — visible as `AGE` column in `prd summary`. |
| What sessions touched it? | `## Sessions` table (auto-populated by every `link`/`log`/`resolve`/`graduate`/`revision` call when run inside Claude Code). |
| Is it linked to others? | Look for `**Parent:**` (it's a child) or `## Children` (it's a parent). |

---

## Where the rules live

| Concern | File |
|---|---|
| Subcommand reference + Decision Rule + flags | `~/.claude/skills/prd.md` |
| Resume / "put-back" flow | `~/.claude/skills/prd-checkout.md` + `~/.claude/commands/prd-checkout.md` |
| Librarian / inventory view | `~/.claude/skills/prd-summary.md` |
| Auto-invoke triggers (T1–T6) + Decision Rule + Cadence Rubric | `~/.claude/rules/domains/plan-persistence.md` |
| CLI implementation | `~/bin/prd` |
| Write gate (blocks edits outside scratch/) | `~/.claude/hooks/prd-guard/prd-guard.sh` |
| Auto-cadence logging | `~/.claude/hooks/prd-cadence/post-tool-use.sh` |
| Project-local active-PRD breadcrumb | `<cwd>/.memory/active-prds.json` (sentinel walk-up; requires `.memory/.prd-owner`) |
| PRD owner sentinel | `.memory/.prd-owner` — declares this dir as a legitimate PRD scope. Bootstrap: `prd init-owner --scope project --description "<one line>"` |
| Schema migration tool | `~/.claude/scripts/prd-schema-migrate.py` (normalizes legacy schemas A1/B/M9, drops archive-rot) |
| Anchor backfill tool | `~/.claude/scripts/prd-backfill-anchor.py` (adds Owner_path/Session_origin/Branch_at_creation frontmatter to PRDs with knowable owners) |
| Context inspector | `prd context` (shows cwd, branch, session, resolved owner, active PRD anchor match) |

---

## What this system is NOT

- Not a replacement for Jira / Confluence / Bitbucket — those remain canonical for cross-team work.
- Not a task list — `TaskCreate` / `TaskUpdate` (the harness's task tools) remain canonical for in-session task state.
- Not a memory store — Graphiti and `memory-bank/` remain canonical for persistent knowledge. PRDs are working surface only.
- Not a dashboard — `prd summary` is intentionally terminal-only; for richer views use the slash commands or read the files directly.
