---
name: prd-checkout
description: Smart PRD checkout — the canonical "resume work / put-back into my head" command for any PRD. Wraps `prd checkout <id>` CLI with WORK vs PERSONAL classification, ASKS before pulling Jira/Confluence/Bitbucket/git context via MCP, then synthesizes a "where you left off" briefing card (open items + recent decisions + project folder + git log on the named branch). Triggers — "where did I leave off on X", "resume the Y work", "check out the X PRD", "what was I doing on Z", "let me work on this PRD now", "pick up the HCC work", "open the BCBS PRD", "show me the active PRD on this branch", "what's the status of <PRD>", "I'm coming back to this — context me up". Always use the slash command (not just CLI) when returning after >1 day. Writes a Revision Log entry so reading is itself a breadcrumb. See /prd-checkout slash command for the full step-by-step (Steps 1–5; never skip the user-confirmation step).
---

# /prd-checkout (skill alias)

Skill mirror of the `/prd-checkout` slash command. Both files describe the same workflow — see `~/.claude/commands/prd-checkout.md` for the full step-by-step behavior the agent must follow.

The skill exists so the harness exposes `prd-checkout` in the Skill tool list (for MCP-style invocation) in addition to the typed slash command surface.

## Quick reference

```bash
prd checkout <id>           # deterministic CLI portion (always run first)
/prd-checkout <id>          # full agent flow (CLI + classification + ask + pull + brief)
```

The agent MUST follow Step 1-5 from `~/.claude/commands/prd-checkout.md` — never skip the user-confirmation step in Step 2.
