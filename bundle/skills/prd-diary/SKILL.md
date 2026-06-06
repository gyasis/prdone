---
name: prd-diary
description: Capture per-session dev-diary entries on an active PRD — open at session start, append narrative-worthy moments (gemini_debug escalations, abandoned approaches, user corrections, pivots), close at session end. Hook auto-handles open/close; this skill covers manual append for narrative-worthy moments. Use when user says "log this to the diary", "note that we abandoned X", "diary this", or proactively after gemini_debug / undo / user_correction / pivot decisions.
---

# PRD Dev Diary

A per-session structured narrative on the active PRD — what was tried, what worked, what got abandoned, what escalated. Lives at `## 10. Dev Diary` at the **bottom** of the PRD so `/prd-checkout` can skim past it unless full historical context is needed.

## Why this exists

`/prd-checkout` on an old PRD shows you remaining tasks but not the *narrative* — what was tried last session, why approach X was abandoned, what gemini_debug suggested, what the user corrected. Without it, the agent guesses wrong on resume → 32+ user_correction events per pattern in mined SIO data (2026-05-01 SIO scan, score 0.71).

## How it splits between auto and manual

| Trigger | Mechanism | Action |
|---|---|---|
| Session start (Claude Code session begins) | Hook (`SessionStart`) | `prd diary <slug> open` — auto |
| Session end (Stop / PreCompact) | Hook (`Stop`, `PreCompact`) | `prd diary <slug> close` — auto |
| **Concrete action / file edited** | **Manual via skill** | `prd diary <slug> append --done "..."` |
| **Decision or talking point** | **Manual via skill** | `prd diary <slug> append --discussed "..."` |
| **Escalation moment** | **Manual via skill** | `prd diary <slug> append --escalation "..."` |
| **Hand-off line for next session** | **Manual via skill** | `prd diary <slug> append --pickup "..."` |

The agent is responsible for the **manual** rows. Hook handles the bookkeeping.

## When to manually append (BLOCKING triggers)

The agent MUST call `prd diary <slug> append` after any of these events on a session with an active PRD:

1. **`gemini_debug` was called** → `--escalation "gemini_debug on <error>: chose <approach>"`
2. **An approach was abandoned** ("let's try X instead", "Y didn't work") → `--discussed "Abandoned <Y> because <reason>; pivoted to <X>"`
3. **User corrected agent direction** ("no, that's wrong", "I meant X") → `--escalation "User correction: <summary>"`
4. **A material decision was made** that isn't already in `## 4. Decisions Log` → `--discussed "<decision>"`
5. **A subagent returned with a substantive finding** (not just "completed") → `--done "<subagent>: <finding>"`
6. **Before user wraps the session** ("ok we're done for today", "let's pick this up tomorrow") → `--pickup "<one-line hand-off>"`

Manual append is NOT for: every file edit, every Bash call, routine subagent spawns, or anything the cadence hook already auto-captures (TaskUpdate completions, decisions logged via `prd log <slug> decision`).

## Resolving the active PRD

Active PRD lookup order (origin 2026-05-15 sentinel hardening):
1. Walk UP from `$PWD` looking for `.memory/.prd-owner` sentinel.
2. Read `.active[0].path` from the sentineled dir's `active-prds.json`.

If no sentinel found anywhere up-tree → diary commands silently skip. The legacy `~/dev/.memory/` fallback is REMOVED — that path is only used if it has its own `.prd-owner` sentinel (root scope). See `~/.claude/rules/domains/plan-persistence.md § Sentinel requirement`.

If a PRD declares `**Owner_path:**` in frontmatter and it mismatches the resolved sentinel owner → diary command emits stderr WARN and skips (prevents cross-contamination).

## Section format (what gets written)

```
## 10. Dev Diary

### Session 2026-05-01 — `7792cf0f` — 14:26→16:42 UTC (2h16m)
**Focus:** Add evidence_source_family column to BCBS submission fact

**Done**
- Added column to fct_quality__bcbs_mn_submission (commit abc123)
- Cube measure count_patients_by_evidence_source live

**Discussed / Decided**
- Chose Option C (column on fact) over Option A (separate dim) — simpler join
- Deferred dashboard tile to its own PRD

**Escalations**
- gemini_debug on window function — chose ROW_NUMBER over RANK

**Next pickup:** Wire alert when psh_count goes 0 → non-zero
```

While a session is open, the header reads `OPEN since HH:MM UTC` instead of the duration range.

## Quick command reference

```bash
prd diary <slug> open [--focus "<one-line>"]            # auto on SessionStart
prd diary <slug> close [--pickup "<hand-off>"]          # auto on Stop / PreCompact
prd diary <slug> append --done "<bullet>"
prd diary <slug> append --discussed "<bullet>"
prd diary <slug> append --escalation "<bullet>"
prd diary <slug> append --pickup "<replaces Next pickup line>"
```

`open` is idempotent — same session UUID never opens twice. `close` finds the most recent `OPEN since` header for any UUID and closes it.

## Disable

- One session: `export PRD_DIARY_DISABLED=1`
- Permanently: remove the `prd-diary` entries from `~/.claude/settings.json` SessionStart / Stop / PreCompact hooks
