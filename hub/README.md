# prdone Work Hub (prototype)

Cross-repo work hub: for any repo you build in, one view ties together **current work**
(git), **issues** (Gitea/GitHub via the `issue-king` layer), **PRDs** (the `prd` CLI,
filtered to that repo), and **handoffs** (`~/handoff/`) — with **issue → PRD → repo**
links. UI = the "pilot" (dark blue/purple/teal board). See PRD
`prdone_cross_repo_work_hub_2026-07-01`.

## Run

```bash
npm run hub          # → http://127.0.0.1:8813/
#                       http://127.0.0.1:8813/?repo=<name> to deep-link a repo
```

## Pieces

- **`discover.cjs`** — enumerates every repo you actually work in from ground truth
  (GitHub + Gitea APIs, PRD `repo:` tags, session `cwd` history, and a local index over
  `~/Documents` AND `~/Documents/code` + worktrees). Resolves tracker + local path per
  repo; filters ~235 candidates → the ~55 relevant (has issues / PRDs / recent activity).
- **`hub-server.cjs`** — express (127.0.0.1 only). `GET /api/repos`, `GET /api/hub?repo=`,
  `GET /`. Assembles per-repo work + issues + PRDs + handoffs + issue⋈PRD links. Shells to
  `~/.local/bin/issue-list`, `~/bin/prd summary --json --with-tree`, and `git`.
- **`hub.html`** — the pilot-look UI (PRD-spine + 4-lane, repo switcher).

## Status

Prototype — runs standalone. Next: fold into the VSCode extension's kanban server
(`src/kanban/server.ts`) + webview, and merge with the tier board. Tracked in the PRD.
