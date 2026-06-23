# prdone · PRD lifecycle tooling

[![visibility](https://img.shields.io/badge/repo-public-blue)](https://github.com/gyasis/prdone)
![version](https://img.shields.io/badge/version-0.2.0--alpha-orange)
![cli](https://img.shields.io/badge/CLI-bash%2C%20zero%20deps-success)
![vscode](https://img.shields.io/badge/VSCode-%E2%89%A51.85-purple)

**`prdone`** is a clone-and-install bundle for the `prd` **PRD lifecycle CLI** and its
**Claude Code skills**, plus an optional **VSCode "PRD Visualizer"** extension that renders
your PRDs as a sidebar grid + browser kanban.

> A **PRD** here is a lightweight, file-based "plan record" — a markdown doc with frontmatter
> that persists a multi-step plan across sessions. The `prd` CLI manages them across three
> tiers: **`scratch`** (active work), **`archive`** (resolved), **`library`** (graduated /
> reusable). The skills let Claude Code create, resume, log, and summarize them.

The whole point of this repo: **clone it on any machine, run one script, and you have the
CLI + skills installed and working** — no build step, no dependencies.

---

## Table of contents

- [Quick install](#quick-install-the-whole-job)
- [What gets installed](#what-gets-installed)
- [Using the `prd` CLI](#using-the-prd-cli)
- [The Claude Code skills](#the-claude-code-skills)
- [For AI agents](#for-ai-agents)
- [The VSCode extension (optional)](#the-vscode-extension-optional)
- [Repo layout](#repo-layout)
- [Development](#development)
- [Packaging the .vsix](#packaging-the-vsix)
- [Uninstall](#uninstall)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Quick install (the whole job)

```bash
git clone https://github.com/gyasis/prdone.git
cd prdone
./install.sh
```

That's it — the CLI **and** all skills are installed. `install.sh` is **self-contained**
(only `bash` + coreutils — no `npm`, no network, no build), **idempotent**, and
**non-interactive** (safe to run unattended, including by an AI agent). Existing files are
backed up to `<name>.bak` before overwrite.

```bash
./install.sh --dry-run      # preview every action, change nothing   ← run this first
./install.sh --skills-only  # install skills, skip the CLI
./install.sh --cli-only     # install the CLI, skip skills
./install.sh --help
```

Then verify:

```bash
prd --help                  # exit 0 == CLI installed
ls ~/.claude/skills/prd/SKILL.md   # skills present (dir-form)
```

If the installer warns that `~/bin` isn't on your `PATH`, add this to your shell rc
(`~/.bashrc` / `~/.zshrc`) and restart your shell:

```bash
export PATH="$HOME/bin:$PATH"
```

Restart Claude Code afterward so it loads the newly installed `/prd*` skills.

---

## What gets installed

| Source (in this repo)            | Destination                              | Notes |
|----------------------------------|------------------------------------------|-------|
| `bundle/bin/prd`                 | `~/bin/prd` (`chmod 755`)                | the CLI — a self-contained bash script |
| `bundle/skills/<name>/SKILL.md`  | `~/.claude/skills/<name>/SKILL.md`       | **dir-form** — the only form Claude Code's loader reads |

The installer also **retires stale flat skill shadows**: if a legacy
`~/.claude/skills/<name>.md` (flat file) exists, it's renamed to `.bak`. Claude Code only
loads `~/.claude/skills/<name>/SKILL.md` — flat `.md` files are silently ignored, which is a
classic footgun this installer guards against.

Skills shipped: **`prd`**, **`prd-checkout`**, **`prd-diary`**, **`prd-summary`**,
**`prd-README`**.

---

## Using the `prd` CLI

```bash
prd --help                       # full subcommand reference
prd new <descriptor>             # create a scratch PRD
prd new --parent <slug> <desc>   # create a child PRD under a parent
prd list                         # active PRDs (current branch/repo aware)
prd summary                      # librarian "card catalog" view across all tiers
prd log <slug> note "..."        # append a timestamped note
prd log <slug> decision "..."    # append a decision to the Decisions Log
prd log <slug> subagent <name>="<purpose>"
prd resolve <slug>               # mark a scratch PRD resolved -> archive
prd graduate <slug>              # promote a PRD into the reusable library tier
prd reopen <slug>                # reopen a resolved/archived PRD
prd sweep                        # surface stale PRDs needing attention
prd doctor                       # integrity checks (orphans, schema drift, etc.)
```

PRDs follow a **three-tier model** — `scratch/` (active), `archive/` (resolved),
`library/` (graduated). The CLI is branch/repo-aware so `prd list` surfaces the work
relevant to where you are. Full behavioral contract: `~/.claude/skills/prd/SKILL.md`
(installed) or [`bundle/skills/prd/SKILL.md`](bundle/skills/prd/SKILL.md) (in this repo).

---

## The Claude Code skills

Once installed, these appear as `/prd*` slash commands / Skill-tool entries in Claude Code:

| Skill | Purpose |
|---|---|
| **`/prd`** | Master PRD lifecycle skill — create, list, log, resolve, graduate. Wraps the CLI. |
| **`/prd-checkout`** | "Resume work" — pulls deep context for a PRD (open items, recent decisions, git log) so you can pick up where you left off. |
| **`/prd-summary`** | Librarian inventory view — every PRD with status, age, ephemeral marker, significance, tags. Filters + sorts. |
| **`/prd-diary`** | Per-session dev diary attached to a PRD — opens/closes per session, records done / discussed / escalations / next-pickup. |
| **`prd-README`** | Reference doc skill describing the whole PRD system. |

These are the source of truth for *how* the agent should drive the CLI; the binary is the
*mechanism*. Keeping them paired (and versioned together in this repo) is the reason `prdone`
exists as one bundle.

---

## For AI agents

If you are an AI coding agent that just cloned this repo, read **[`AGENTS.md`](AGENTS.md)** —
it's a purpose-written, step-by-step install + usage guide for autonomous operation
(clone → `./install.sh` → verify → use), including dry-run discipline and uninstall.

---

## The VSCode extension (optional)

`prdone` is also a **read-only VSCode extension** ("PRD Visualizer", v0.2.0) that
renders the CLI's output as three surfaces. It is **not required** to use the CLI or skills.

- **Sidebar tile grid** — in-editor, inherits VSCode's theme via `--vscode-*` CSS variables
  (Dark / Light+ / High Contrast), morphs live as you switch themes.
- **Browser kanban** — `http://127.0.0.1:7373+` (port walks 7373→7382), wide-screen board
  with three tier columns (scratch / archive / library), editorial Geist + cream/ink palette.
- **Browser gallery** — `…/gallery`, a CSS-grid preview of every PRD that has an HTML
  companion (lazy-loaded sandboxed iframes, capped at 20 concurrent).

Click a tile → side panel with copy-pasteable Claude Code commands (`/prd-checkout <id>`,
`prd log <id> note`, `prd log <id> decision`, tier-aware `prd resolve` / `prd graduate`).
**Phase 1 is strictly read-only** — the extension never invokes state-mutating `prd`
subcommands; you copy commands and run them yourself. The `EXECUTE_CLI` action exists in the
type system but is rejected at runtime (Phase 2 territory).

### Install the extension

```bash
npm install
npm run build          # esbuild -> dist/extension.js
npm run package        # vsce -> dist/prdone-<version>.vsix (auto-named from package.json)
code --install-extension dist/prdone-*.vsix
```

Restart VSCode — a **PRDs** icon appears in the activity bar. The extension also contributes
a command **"PRD: Install Skills + CLI Into Home"** (`prd.installSkills`) that runs the same
install as `install.sh`, from the bundled payload inside the `.vsix`.

### Extension commands & settings

| Command (palette) | What it does |
|---|---|
| **PRD: Open Visualizer** | Reveals/focuses the sidebar tile grid. |
| **PRD: Open Kanban (Browser)** | Starts the bundled local Express server, opens your browser at `127.0.0.1:<port>/`. |
| **PRD: Refresh Visualizer** | Re-runs `prd summary --json`. Bindable to a shortcut. |
| **PRD: Install Skills + CLI Into Home** | Installs the bundled CLI + skills (dir-form). |

| Setting | Default | Description |
|---|---|---|
| `prd.binaryPath` | `"prd"` | Path to the `prd` CLI. Use an **absolute** path when launching VSCode from a GUI (GUI launches don't always inherit your shell PATH). |
| `prd.kanbanBasePort` | `7373` | Starting port for the local kanban server (walks up to 10 ports). |

If the CLI isn't reachable on activation, the sidebar shows a **Doctor View** (not a blank
pane) with a one-click "Set binary path…", a "Retry connection" link, and the failed call's
stderr for debugging.

> **🚧 Alpha.** The extension is single-user / single-machine and not on the marketplace.
> Install from the bundled `.vsix`. The CLI + skills (via `install.sh`) are the stable,
> primary deliverable; the visualizer is a convenience layer on top.

---

## Repo layout

```
prdone/
├── install.sh                 ← clone-and-install entry point (CLI + skills)
├── AGENTS.md                  ← agent-facing install + usage guide
├── bundle/                    ← the installable payload (shipped in the .vsix too)
│   ├── bin/prd                  the prd CLI (bash, self-contained)
│   └── skills/<name>/SKILL.md   dir-form Claude Code skills
├── src/                       ← VSCode extension host (TypeScript)
│   ├── extension.ts             activate/deactivate, command registration, installSkills
│   ├── webview/                 sidebar provider + Doctor View
│   ├── kanban/server.ts         read-only Express server (405 on writes)
│   ├── actions/                 webview↔extension action validation + command templates
│   └── data/prdSource.ts        spawn `prd summary --json`, validate
├── webview-frontend/          ← shared frontend (sidebar grid + kanban board)
├── kanban-static/             ← HTML shell served by Express
├── specs/                     ← spec-kit specs/plans/tasks/design refs
├── dist/                      ← build output + .vsix (gitignored)
└── package.json               ← extension manifest + scripts
```

Every cross-process boundary (CLI ↔ extension, extension ↔ webview, server ↔ browser) is
type-guarded.

---

## Development

```bash
npm install
npm run build       # esbuild bundles src/ + webview-frontend/ -> dist/
npm run watch       # rebuild on change
npm test            # vitest unit tests
```

**F5 dev session:** open the repo in VSCode and press **F5** (Run → "Run Extension"). A second
`[Extension Development Host]` window loads the live source. Edit → `npm run build` (or
`watch`) → `Ctrl+R` in the host window to reload.

Prerequisites for extension dev: **VSCode 1.85+**, **Node 20+**. The CLI itself needs nothing
but `bash`.

---

## Packaging the .vsix

```bash
npm run package     # vsce package -o dist/  → dist/prdone-<version>.vsix
```

The `.vsix` **includes `bundle/`** (the CLI + skills) so the in-editor "Install Skills + CLI"
command works from a packaged install. Do **not** add `bundle/**` back to `.vscodeignore` — that
would ship a `.vsix` whose installer can't find its payload. The package filename is
auto-derived from `package.json` `version`.

---

## Uninstall

```bash
rm -f ~/bin/prd
rm -rf ~/.claude/skills/prd ~/.claude/skills/prd-checkout \
       ~/.claude/skills/prd-diary ~/.claude/skills/prd-summary \
       ~/.claude/skills/prd-README
# the installer's backups, if you want to restore them:
#   ~/bin/prd.bak , ~/.claude/skills/<name>/SKILL.md.bak
```

Uninstall the VSCode extension via the Extensions panel, or
`code --uninstall-extension gyasis.prdone`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `prd: command not found` after install | `~/bin` isn't on `PATH` — add `export PATH="$HOME/bin:$PATH"` to your shell rc. |
| `/prd` skills don't appear in Claude Code | Restart Claude Code — skills load at session start. Confirm they're at `~/.claude/skills/<name>/SKILL.md` (dir-form), not flat `.md`. |
| Extension shows "Doctor View" | The CLI isn't reachable. Set `prd.binaryPath` to an absolute path (e.g. `/home/you/bin/prd`) and click "Retry connection". |
| `install.sh: bundle/ missing` | You're not in a full clone (or it's a partial checkout). Re-clone the repo. |
| Kanban port in use | The server walks 7373→7382; if all are taken, free one or change `prd.kanbanBasePort`. |

---

## License

[MIT](LICENSE) © 2026 Gyasi Sutton.
