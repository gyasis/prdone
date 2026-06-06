# Changelog

All notable changes to the prdone PRD Visualizer extension.

The format is roughly [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

---

## v0.2.0-alpha — 2026-05-22

**Spec 002: HTML Companion PRDs** ([spec](specs/002-html-companions/spec.md))

Adds first-class support for HTML "design PRD" companions paired with the
canonical Markdown index. Spans CLI extensions, sidebar + browser tile
renderers, and a new Gallery view.

### Added

- **`prd new --html <descriptor>`** — creates BOTH `<descriptor>_<date>.md`
  and `<descriptor>_<date>.html` (stub) in `~/dev/prd/scratch/`.
- **`prd open --html <id>`** — opens the HTML companion via priority chain:
  VSCode webview → `wslview` → `xdg-open`.
- **`prd doctor`** — extended with paired-name companion check; reports
  orphan `.html` files in any tier directory.
- **`prd summary --json`** — each entry now has a `companions: { html?, … }`
  field. `null` or absent for MD-only PRDs.
- **`prd graduate` / `resolve` / `reopen`** — move companion files alongside
  the `.md` when transitioning tiers. Transactional: rolls back on partial
  failure.
- **`prd --version`** — new subcommand. Reports `prd 0.2.0`.
- **Companion icon row** in every tile (sidebar + browser kanban):
  `📄 MD` always present, plus `🌐 HTML` / `📕 PDF` / `📊 PPTX` / `📓 IPYNB`
  when respective companions exist. Click opens the companion.
- **WebviewPanel for HTML preview** — clicking `🌐` in the sidebar opens
  the HTML in a CSP-bounded VSCode webview with an `↗ Open in Browser`
  button. CSP allowlists `fonts.googleapis.com` + `fonts.gstatic.com` so
  the Pharos-style Newsreader serif renders correctly.
- **Gallery view** (`/gallery` route) — CSS grid of ≥320px cards with
  scaled-down iframe previews of every HTML companion. Lazy-loaded via
  IntersectionObserver, capped at 20 concurrent mounts, sandboxed. Empty
  state shows when no HTML companions exist.
- **Nav link** in kanban header: `🌐 Gallery <count>` → `/gallery`.

### Type / API

- `Prd.companions?: Companions | null` (new optional field) per
  [data-model](specs/002-html-companions/data-model.md).
- `WebviewAction` adds `'OPEN_HTML_COMPANION'` variant.
- New TS contract at
  [`specs/002-html-companions/contracts/companions.contract.ts`](specs/002-html-companions/contracts/companions.contract.ts).

### Server (express)

- `GET /gallery` — gallery shell HTML.
- `GET /companion?path=<absPath>` — streams an HTML companion as
  `text/html`. Security-gated: rejects paths outside `$PRD_ROOT` and any
  non-`.html` extension.

### Skill changes

- `~/.claude/skills/design-prd/SKILL.md` rewritten with all 10 audit fixes
  applied (Write-to-disk output contract, mandatory `prd new --html`
  pre-step, name-parity enforcement, required-vs-conditional sections,
  aesthetic-selection heuristic, grep-able self-checks, decision count
  scaling, `@media print` reset, inline JSON-LD template).

### Migration

- One-time Pharos rename (T108) — applied 2026-05-22:
  - `pharos_v1_index_2026-05-22.md` → `pharos_v1_2026-05-22.md`
  - `viz_tool_v1_design_2026-05-22.html` → `pharos_v1_2026-05-22.html`
  - `pharos_v1_design_journal_2026-05-22.md` → `pharos_v1_journal_2026-05-22.md`
  - 11 internal cross-references rewritten; `prd doctor` now reports 0 orphans.

### Tests

- `tests/unit/companionRow.test.ts` — 12 vitest assertions covering tile
  icon-row rendering (md-only, with-html, multi-companion ordering, XSS
  escaping, ARIA toolbar structure).
- `tests/manual/test-spec-002-cli.sh` — bash smoke tests for the CLI
  extensions (`prd doctor` paired-name check, `prd summary --json`
  companions field).
- `tests/manual/gallery-smoke-test.md` — 7-point manual acceptance
  scenario for the gallery view (first-paint ≤2s, ≥30 FPS scroll, ≤100MB
  memory, ≤20 iframes concurrent, etc.).

### Total tests passing

- vitest: 66 / 66 ✅ (includes Spec 001's 54 + Spec 002's 12)

---

## v0.1.0-alpha — 2026-05-08

**Spec 001: PRD Visualizer** ([spec](specs/001-prd-visualizer/spec.md))

Initial release of the read-only PRD Visualizer:

- Sidebar tile grid in VSCode editor (theme-aware, --vscode-* variables)
- Browser kanban on 127.0.0.1:7373+ (three-tier columns, Geist+cream/ink palette)
- Side panel with copy-pasteable Claude Code slash commands
- Phase 1 read-only contract (no state-mutating subcommands invoked)
- Refresh button + 30-min auto-refresh + 15s watchdog
- Tag-based filter chips
- Doctor View fallback when `prd` binary unreachable
