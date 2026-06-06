# Quickstart — prdone PRD Visualizer

Five-minute getting-started guide. For full feature docs see [README.md](README.md).

---

## 1. Install dependencies + build

```bash
git clone <repo-url> ~/dev/projects/prdone
cd ~/dev/projects/prdone
npm install              # ~30 seconds
npm run build            # esbuild bundles src/ + webview-frontend/
npm run package          # produces dist/prdone-0.2.0-alpha.vsix
```

## 2. Install skills + CLI into home

The extension uses a global `prd` CLI on your PATH and three Claude Code
skills under `~/.claude/skills/`.

```bash
# Copy the bundled prd CLI to your bin
mkdir -p ~/bin
cp bundle/bin/prd ~/bin/prd
chmod +x ~/bin/prd
# Confirm
prd --version              # → prd 0.2.0 — Spec 002 (HTML companion PRDs)

# Install the bundled skills (prd, design-prd, etc.)
mkdir -p ~/.claude/skills
cp -r bundle/skills/* ~/.claude/skills/
# OR symlink (preferred for dev):
ln -sfn ~/dev/projects/open-design/skills/design-prd ~/.claude/skills/design-prd
```

The `design-prd` skill is the HTML PRD authoring agent (Spec 002). After
`prd new --html` creates the stub, invoke `/design-prd <descriptor>` in
Claude Code to fill the HTML.

## 3. Install the VSCode extension

```bash
code --install-extension dist/prdone-0.2.0-alpha.vsix --force
```

Restart VSCode. A **PRDs** icon appears in the activity bar (left strip).

## 4. Try it

### Sidebar tile grid

Click the **PRDs** icon → sidebar shows all PRDs across the three tiers
(`scratch`, `archive`, `library`).

Each tile has a footer icon row:
- `📄` → click to open the `.md` index in VSCode
- `🌐` → (only when HTML companion exists) opens a WebviewPanel preview

### Create a paired PRD

```bash
prd new --html auth_flow_refactor --root
# Creates ~/dev/prd/scratch/auth_flow_refactor_<YYYY-MM-DD>.{md,html}
```

In Claude Code, invoke the skill to fill the HTML:
```
/design-prd auth_flow_refactor
```

### Browser kanban (full board)

In the sidebar, click the kanban-board icon next to "Refresh" → opens
`http://127.0.0.1:7373/` in your default browser.

### Browser gallery (HTML preview grid)

Click `🌐 Gallery <N>` in the kanban header → `/gallery` route shows a
CSS grid of every PRD with an HTML companion, with scaled-down iframe
previews. Lazy-loaded; capped at 20 concurrent iframes.

### Audit + maintenance

```bash
prd doctor               # health check + orphan companion check
prd summary --json | jq '.[] | select(.companions)'   # PRDs with companions
prd graduate <id>         # promote to library (moves .md + .html together)
prd open --html <id>      # open HTML companion (VSCode webview / browser)
```

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Sidebar shows "Doctor View" | Check `prd.binaryPath` setting; reinstall `bundle/bin/prd` to `~/bin/prd` |
| `prd new --html` says "unknown flag" | CLI is pre-Spec-002. Re-copy bundle/bin/prd |
| HTML companion appears unstyled in webview | Google Fonts blocked by CSP. Click `↗ Open in Browser` for full fidelity |
| Gallery shows empty state | No PRDs have HTML companions. Run `prd new --html <descriptor>` to create one |
| `prd doctor` flags orphans | Either rename them to match an MD, or delete the orphan `.html` |

## Next steps

- [Full feature docs](README.md)
- [Spec 002 — HTML Companion PRDs](specs/002-html-companions/spec.md)
- [Spec 001 — Original PRD Visualizer](specs/001-prd-visualizer/spec.md)
- [Changelog](CHANGELOG.md)
