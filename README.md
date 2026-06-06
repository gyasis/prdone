# PRD Visualizer  · v0.2.0-alpha

A read-only VSCode extension that renders the canonical [`prd`](https://github.com/gyasis/prd) lifecycle CLI as three surfaces:

- **Sidebar tile grid** in the editor — inherits VSCode's theme via `--vscode-*` CSS variables (Default Dark / Light+ / High Contrast), morphs as you switch.
- **Browser kanban** on `127.0.0.1:7373+` — wide-screen "wow" surface with three tier columns (scratch / archive / library), Geist + cream/ink editorial palette.
- **Browser gallery** on `127.0.0.1:7373+/gallery` (Spec 002, v0.2.0+) — CSS-grid preview of every PRD with an HTML companion. Lazy-loaded iframes, capped at 20 concurrent, sandboxed.

Click a tile → side panel with copy-pasteable Claude Code slash commands. **Phase 1 is read-only**: the extension never invokes state-mutating `prd` subcommands; you copy commands and run them yourself.

### Spec 002 — HTML companion PRDs (v0.2.0)

Each PRD's `.md` index can pair with a same-base-name `.html` design companion produced by the `/design-prd` skill in Claude Code.

```bash
prd new --html auth_flow_refactor          # creates BOTH auth_flow_refactor_<date>.{md,html}
prd open --html auth_flow_refactor         # opens HTML companion in VSCode WebviewPanel
prd doctor                                  # flags any orphan .html files (no .md sibling)
```

Tiles in both surfaces show a footer icon row: `📄 MD` (always) + `🌐 HTML` (when paired). Click `🌐` to open the companion in a sandboxed webview with an "↗ Open in Browser" button for full-fidelity rendering. The gallery view (`/gallery`) shows scaled-down iframe previews of every HTML companion in a CSS grid.

Why two surfaces? Running `prd summary` in a 24-line terminal scrolls past everything at ~85 PRDs. The sidebar gives you a quick scan during editing; the kanban gives you the full board on a second monitor.

> **🚧 Alpha**: 4 of 7 acceptance scenarios pass on the F5 host (US1 grid + filters, US1 theme cycling, US2 copy-commands, US3 browser kanban). Live save-sync (US4), Workspace Trust (US5b), and Doctor View (US5a) remain to be walked. Use only on a single-user single-machine setup. Not on the marketplace; install from the bundled .vsix.

---

## Quickstart (Recommended) — install the bundled .vsix

If you just want to *use* the extension:

```bash
# 1. Clone + go in
git clone <repo-url> ~/dev/projects/prdone
cd ~/dev/projects/prdone

# 2. Install dependencies (one-time, ~30s)
npm install

# 3. Build + package the .vsix
npm run build
npm run package
# → produces dist/prdone-0.2.0-alpha.vsix

# 4. Install into VSCode
code --install-extension dist/prdone-0.2.0-alpha.vsix
```

Restart VSCode. A **PRDs** icon appears in the activity bar (left strip). Click it.

If the sidebar shows a "Doctor View" instead of the tile grid, your shell PATH isn't reaching the `prd` binary — open VSCode settings, search `prd.binaryPath`, set it to an absolute path (e.g. `/home/you/bin/prd`), then click "Retry connection" in the Doctor View.

## Install the `prd` skill set + CLI on a fresh machine

The .vsix bundles the canonical [`prd` CLI binary](bundle/bin/prd) and the [`prd*` skill set](bundle/skills) (the markdown skills Claude Code reads). After installing the .vsix:

1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **`PRD: Install Skills + CLI Into Home`**
3. Confirm the prompt — the command will:
   - Copy `bundle/skills/prd*.md` → `~/.claude/skills/`
   - Copy `bundle/bin/prd` → `~/bin/prd` (chmod +x)
   - Back up any existing files to `<name>.bak` before overwrite

That's it. From a fresh Claude Code install, you go from no PRD tooling to a working `prd` CLI + Claude-Code-aware skill set in one click. No shell scripts, no manual symlinks.

If `~/bin` is not on your PATH, add this to your shell rc:
```bash
export PATH="$HOME/bin:$PATH"
```

## Quickstart (Developer) — F5 dev session

If you want to hack on the extension itself:

```bash
git clone <repo-url> ~/dev/projects/prdone
cd ~/dev/projects/prdone
npm install
npm run build
code .   # opens this repo in VSCode
```

In VSCode, press **F5** (or Run → "Run Extension"). A second window labelled `[Extension Development Host]` opens with the live source loaded. Edit, rebuild (`npm run build` or `npm run watch`), `Ctrl+R` in the host window to reload.

## Prerequisites

- VSCode **1.85+**
- Node **20+** (for build)
- The [`prd`](https://github.com/gyasis/prd) CLI installed and on PATH, OR set `prd.binaryPath` in VSCode settings to its absolute path. (VSCode launched from a GUI doesn't always inherit your shell PATH — see Doctor View below.)
- `~/dev/prd/` populated with at least one PRD (or `prd new ...` to create one).
- Internet access at first webview load (Geist & Geist Mono fonts come from Google Fonts; CSP allows `fonts.googleapis.com` + `fonts.gstatic.com` only).

## Usage

| Command (palette) | What it does |
|---|---|
| **PRD: Open Visualizer** | Reveals the sidebar tile grid (or focuses if already open). |
| **PRD: Open Kanban (Browser)** | Starts the bundled local Express server (port walks 7373→7382), opens your default browser at `http://127.0.0.1:<port>/`. |

Click any tile → side panel with **Open file**, **`/prd-checkout <id>`**, **`prd log <id> note`**, **`prd log <id> decision`**, plus tier-specific **`prd resolve`** (scratch ACTIVE) or **`prd graduate`** (archive). Click any command — it copies to your clipboard with a 900ms green flash.

### Settings

| Setting | Default | Description |
|---|---|---|
| `prd.binaryPath` | `"prd"` | Path to the `prd` CLI binary. Use absolute path when launching VSCode from a GUI. |
| `prd.kanbanBasePort` | `7373` | Starting port for the bundled local kanban server. Walker increments by 1 up to 10 ports. |

### Doctor View

If the CLI isn't reachable on activation (binary missing, PATH not inherited, etc.), the sidebar shows a Doctor View instead of a blank pane:

- One-click **"Set binary path…"** → opens VSCode settings filtered to `prd.binaryPath`.
- **"Retry connection"** link → re-runs the CLI without an editor restart.
- The full stderr from the failed call is printed below for debugging.

## Verifying it works (the v0.1 acceptance gate)

The seven scenarios below come from [`specs/001-prd-visualizer/quickstart.md`](specs/001-prd-visualizer/quickstart.md). All seven must pass before tagging `v0.1.0`. Each is bounded to 5 minutes — total budget 35 minutes.

1. **Activation & Doctor View** — Unset `prd.binaryPath`, remove `prd` from PATH. Reload window. Doctor View appears ≤1.5s.
2. **Theme fidelity** — Cycle Dark Modern → Light+ → Light High Contrast. Tiles stay legible without restart.
3. **Live sync** — Edit a PRD `.md` in another editor tab, save. Tile updates ≤300ms.
4. **Tile grid scans cleanly** — At ≥85 PRDs, grid renders ≤500ms after CLI returns. "Stale only" filter narrows correctly. Empty filter result shows a hint.
5. **Kanban view** — Run "PRD: Open Kanban". Three columns, correct counts, read-only.
6. **Action contract** — Click any tile; side-panel shows ≥4 commands. Click `/prd-checkout`; verify clipboard via `xclip -selection clipboard -o` (Linux) / `pbpaste` (macOS).
7. **Workspace Trust** — Open in an untrusted folder. Read-only render works; CLI invocation gated until trust is granted.

Manual runbook: [`tests/manual/acceptance.md`](tests/manual/acceptance.md).

## Architecture

```
src/                           extension host (Node)
├── extension.ts               activate / deactivate, command registration
├── types.ts                   Prd, Tier, Status, WebviewAction, …
├── guards.ts                  isPrd / isWebviewAction / isExtensionResponse / isKanbanApiPayload
├── data/prdSource.ts          spawn `prd summary --json`, validate, return Prd[]
├── webview/
│   ├── sidebarProvider.ts     WebviewViewProvider — sidebar entry
│   └── doctorView.ts          rendered when prdSource fails
├── kanban/server.ts           Express on 127.0.0.1, 405 on POST/PUT/DELETE
├── actions/
│   ├── messageHandler.ts      validates webview→extension actions
│   └── commandTemplates.ts    pure: Prd → ActionCommand[] (tier-aware)
└── lib/findFreePort.ts        port walker
webview-frontend/              shared frontend bundle (sidebar + kanban)
├── index.ts                   entry; mode chosen by __PRD_RENDER_MODE__
├── tileGrid.ts                renderTileGrid + empty-state
├── sidePanel.ts               click-tile → slide-up detail panel
├── filters.ts                 applyFilters (pure)
├── kanbanBoard.ts             three-column kanban renderer
├── styles.css                 sidebar styles (uses var(--vscode-*))
└── browser-overrides.css      kanban-specific palette + fonts
kanban-static/kanban.html      shell served by Express
specs/001-prd-visualizer/      spec, plan, contracts, design templates
└── design/                    canonical visual references (port, don't redesign)
```

Every cross-process boundary (CLI ↔ extension, extension ↔ webview, server ↔ browser) is type-guarded. Phase 1 surface is strictly read-only — `EXECUTE_CLI` action is reserved in the type but rejected at runtime (Phase 2 territory).

## Spec & governance

- [Constitution](.specify/memory/constitution.md) — 5 principles binding this codebase
- [Spec](specs/001-prd-visualizer/spec.md) — 5 user stories, 19 functional requirements, 8 success criteria
- [Plan](specs/001-prd-visualizer/plan.md) — tech context + design references
- [Tasks](specs/001-prd-visualizer/tasks.md) — 65-task implementation track
- [Design templates](specs/001-prd-visualizer/design/) — `kanban.html` + `sidebar.html` produced via Open Design

## License

UNLICENSED — single-developer personal tool. No marketplace publication planned.
