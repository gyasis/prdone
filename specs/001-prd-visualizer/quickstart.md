# Quickstart: PRD Visualizer Extension (development)

**Audience**: the single developer of this repo.
**Goal**: bring the extension up locally, exercise both surfaces, run the seven acceptance scenarios.

## Prerequisites

- Node 20+ and `npm`
- VSCode 1.85+
- `prd` CLI on PATH (or note its absolute path for the `prd.binaryPath` setting)
- ≥85 PRDs already on disk under the canonical PRD root (run `prd summary --json | jq 'length'` to confirm)

## First-run setup

```bash
cd ~/dev/projects/prdone
npm install
npm run build           # esbuild produces dist/extension.js + dist/frontend/*
```

## Run the extension in a sandboxed VSCode

1. Open this repo in VSCode.
2. Press F5 (or Run → "Run Extension"). A second VSCode window opens with the extension loaded.
3. In the new window, the activity bar shows a "PRD" view. Click it — the sidebar grid renders.
4. Run command "PRD: Open Kanban" from the command palette. The default browser opens at `http://127.0.0.1:7373/` (or the next free port).

## Exercise the seven acceptance scenarios

Run each in sequence; stopwatch optional. Each is bounded by 5 minutes (SC-008).

1. **Activation & Doctor View** — Unset `prd.binaryPath` and remove `prd` from PATH (or rename the binary). Reload window. The Doctor View MUST appear ≤1.5s; clicking the "configure binary path" affordance opens settings.
2. **Theme fidelity** — Cycle the editor through Dark Modern → Light+ → Light High Contrast. Tile text and borders MUST remain legible without restart.
3. **Live sync** — In any editor tab, edit a PRD `.md`'s title, save. The matching tile MUST update ≤300ms.
4. **Tile grid scans cleanly** — At ≥85 PRDs, the grid MUST render ≤500ms after CLI returns. Apply `stale only`; expect the grid to shrink to the count returned by `prd summary --json | jq '[.[] | select(.stale)] | length'`. Empty filter result MUST show "no PRDs match".
5. **Kanban view** — Run "PRD: Open Kanban". Three columns appear (scratch / archive / library) with correct counts. Read-only — no drag-write actually mutates state.
6. **Action contract** — Click any tile. Side panel shows ≥4 commands. Click "prd-checkout <id>"; verify clipboard via `xclip -selection clipboard -o` (Linux) or `pbpaste` (macOS).
7. **Workspace Trust** — Open the extension in an untrusted folder. Read-only render of cached data succeeds; CLI invocation is gated until trust is granted.

## Common dev loops

- `npm run watch` — esbuild watch mode for both extension and frontend bundles.
- `npm run test` — runs `vitest` over `tests/unit/`.
- `code --install-extension dist/prdone-0.1.0.vsix` — install the packaged extension globally.

## Troubleshooting

- **"prd: command not found"**: VSCode launched from a GUI does not inherit shell PATH. Set `prd.binaryPath` to the absolute path (e.g., `/home/<user>/bin/prd`).
- **Kanban port already taken**: the server walks 7373→7382. If all are bound, override via the `prd.kanbanBasePort` setting (or kill the offending process).
- **"server stopped" in browser**: the editor was closed (or the extension was disabled). Reopen VSCode and re-run "PRD: Open Kanban".
- **Stale tiles**: confirm `onDidSaveTextDocument` fires for the configured PRD root (only files under that root trigger refresh).

## Tagging v0.1

When all seven scenarios pass on a fresh clone in ≤35 minutes total:

```bash
git tag v0.1.0
npm run package         # produces dist/prdone-0.1.0.vsix
```
