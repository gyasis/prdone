---
description: "HTML Companion PRDs — first-class HTML design PRDs in the prdone lifecycle"
spec_id: 002-html-companions
status: draft
created: 2026-05-22
upstream_skill: ~/.claude/skills/design-prd
companion_to: 001-prd-visualizer
---

# Spec: HTML Companion PRDs

**Goal:** Make HTML "design PRDs" (produced by the `/design-prd` skill) first-class citizens in the `prd` CLI lifecycle and the `prdone` visualizer extension. Today the system is `.md`-only; HTML PRDs are invisible to `prd list`, `prd summary`, the kanban tile grid, and the VSCode sidebar.

This spec is the deliverable of a multi-phase design session run on 2026-05-22 (adversarial-audit + paired-debate × 2). The decisions below are locked. The implementation tasks are in `tasks.md`.

---

## 1. Background

### What exists today (`prd` CLI + prdone, Phase 1 alpha)

- `prd` CLI binary at `~/bin/prd` with subcommands: `new`, `list`, `link`, `log`, `resolve`, `graduate`, `revision`, `reopen`, `sweep`, `doctor`, `summary`
- PRDs live in three tier directories: `~/dev/prd/{scratch,archive,library}/`
- Naming convention (per `~/.claude/rules/domains/plan-persistence.md`): `<3-word-descriptor>[_<feature-suffix>]_<YYYY-MM-DD>.md`
- Registry at `<tier>/.memory/active-prds.json`
- prdone visualizer (VSCode extension at `~/dev/projects/prdone`) renders the PRD set as sidebar tile grid + browser kanban at `127.0.0.1:7373+`
- Reads PRDs via `prd summary --json`

### What changed on 2026-05-22

A new skill `/design-prd` was created at `~/.claude/skills/design-prd/` (symlink to `~/dev/projects/open-design/skills/design-prd/`). It produces self-contained HTML "design PRD" documents — polished architectural artifacts with hero/pillars/decisions/interface code/module stories/scoring tables/deferred backlog. The canonical example is the Pharos v1 Design PRD (also from 2026-05-22).

The skill produces HTML files but the surrounding lifecycle tooling does not yet know about them. This spec is the integration.

---

## 2. Design session record (decisions locked)

### Phase 1 — Adversarial audit of `design-prd` SKILL.md

Two adversarial-bug-hunter agents in parallel (general sweep + targeted hunt) + Claude × Gemini convergence adjudication. 12 merged findings.

| ID | Severity | Verdict | Finding |
|---|---|---|---|
| A | Critical | CONFIRMED | `<artifact>` output contract orphans files — no Write tool call, no on-disk path |
| B | Critical | CONFIRMED | `prd` CLI not integrated as required pre-step |
| C | Major | CONFIRMED | Naming convention not enforced — Pharos files already violate |
| D | Critical | CONFIRMED | Companion MD mandate missing — said "mention," should say "produce" |
| E | Major | MITIGATED | prdone visualizer never acknowledged (resolved by D's fix) |
| F | Major | INTENTIONAL (with refinement) | Over-specified for viz-tool engineering shape — split required vs conditional |
| G | Major | INTENTIONAL (with refinement) | Aesthetic selection has no decision criterion — add heuristic |
| H | Major | REFUTED (partial) | Self-check items not all testable — make font-size compare concrete |
| I | Minor | CONFIRMED | "11 decisions" anchored as norm — clarify 3-20 range, no padding |
| J | Minor | CONFIRMED | Print fallback under-specified — mandate `@media print` reset |
| K | Minor | CONFIRMED | Schema.org block under-specified — provide template |
| L | Trivial | REFUTED | No-codename case (handled by CLI flow) |

**10 fixes apply to `design-prd` SKILL.md.** They are batched into the implementation tasks below.

### Phase 2 — MD↔HTML linkage convention (5-round paired-debate)

5 candidates compared: paired-name sidecar, frontmatter pointer, inline reference, separate tier, hybrid.

**LOCKED: A — Paired-name sidecar.**

- Same base descriptor, different extension: `<descriptor>_<YYYY-MM-DD>.md` ↔ `<descriptor>_<YYYY-MM-DD>.html`
- Both files live in same tier directory (`scratch/`, `archive/`, `library/`)
- `prd` CLI extends to discover `.html` siblings via simple globbing — no frontmatter parsing
- Pharos files require one-time rename (3 files) as part of implementation

Score: 35/40 vs Hybrid (E) 37/40. The 2-point edge for Hybrid came from "pre-existing-file repair" (no rename needed). Decision: a one-time Pharos rename is cheaper than permanent branchy CLI logic. **Simplicity wins.**

### Phase 3 — prdone integration (5 sub-decisions, paired-debate Round 1 + refinements)

| Sub-decision | Lock |
|---|---|
| 1. `prd new --html` semantics | **1.1 with refinement** — produces MD + **stub HTML** (scaffold only); user invokes `/design-prd` to fill content |
| 2. `prd open --html <id>` | **2.3** — opens BOTH VSCode webview (in-IDE preview) AND offers "Open in Browser" button (full-fidelity rendering) |
| 3. Kanban gallery mode | **3.5** — separate Gallery tab; lazy-loaded iframes per-tile (only when in viewport) |
| 4. `prd summary --json` schema | **4.2** — extensible `companions: { html?: path, pdf?: path, ... }` object |
| 5. Tile badge | **5.3** — icon row in tile footer (📄 MD, 🌐 HTML) |

---

## 3. User stories

### US1 — Author creates a new HTML design PRD in one command

**As a** PRD author
**I want** to run a single command to scaffold both the MD index AND the HTML design surface
**So that** I don't have to coordinate two tools and risk orphan files

**Acceptance:**
- `prd new --html "auth flow refactor"` creates BOTH:
  - `~/dev/prd/scratch/auth_flow_refactor_<YYYY-MM-DD>.md` (index PRD via existing `prd new` logic)
  - `~/dev/prd/scratch/auth_flow_refactor_<YYYY-MM-DD>.html` (stub HTML with hero/sections scaffolded but content empty)
- The MD entry in `<tier>/.memory/active-prds.json` includes `companions: { html: "<path>" }`
- After the command, terminal prints: "Run `/design-prd auth_flow_refactor` in Claude Code to fill the HTML."
- The stub HTML is < 3 KB (just the skeleton).

### US2 — User opens an HTML companion from the kanban tile

**As a** PRD viewer
**I want** to click the HTML icon on a kanban tile to see the rendered design PRD
**So that** I can review the visual artifact without leaving my workflow

**Acceptance:**
- Each kanban tile with an HTML companion shows two icons in the footer: 📄 MD, 🌐 HTML.
- Clicking 🌐 opens the HTML in a VSCode webview tab AND offers a small "↗ Open in Browser" button in the webview header.
- The webview enforces a sandbox attribute; iframe content is read-only.
- The browser opener uses `vscode.env.openExternal(vscode.Uri.parse(file_url))` — no shell injection risk.

### US3 — User scans many design PRDs in a Gallery view

**As a** PRD curator/reviewer
**I want** a Gallery tab in the kanban that shows scaled HTML thumbnails
**So that** I can visually browse multiple design PRDs at once

**Acceptance:**
- New Gallery tab in the browser kanban at `127.0.0.1:7373+/gallery`.
- Grid of large cards; top 50% of each card is a scaled-down live iframe of the HTML PRD.
- Iframes lazy-load: only render when the card enters the viewport (IntersectionObserver).
- Performance: kanban with 100 PRDs (30 with HTML companions) loads gallery view in <2s on first paint; scroll remains smooth (>30 FPS).
- Cap: max 20 simultaneously-rendered iframes; older iframes unmount as new ones scroll into view.

### US4 — User discovers naming convention violations (Pharos repair)

**As a** PRD maintainer
**I want** `prd doctor` to flag PRDs that violate the paired-name convention
**So that** I can fix legacy files like the Pharos PRDs (mismatched base names)

**Acceptance:**
- `prd doctor` scans each tier directory; for every `.html` file, checks for a matching `.md` with the same base.
- Reports violations with a one-line description: e.g., `~/dev/prd/scratch/viz_tool_v1_design_2026-05-22.html → no matching .md (closest: pharos_v1_index_2026-05-22.md, different base)`.
- Provides suggested rename: `mv viz_tool_v1_design_2026-05-22.html pharos_v1_2026-05-22.html && mv pharos_v1_index_2026-05-22.md pharos_v1_2026-05-22.md`.
- Does NOT auto-rename — read-only diagnostic only (Phase 1 prdone safety contract).

### US5 — `prd summary --json` exposes companions

**As a** prdone webview developer
**I want** `prd summary --json` to include the `companions` object for each PRD
**So that** the kanban can render icon rows and the Gallery view without re-globbing the filesystem

**Acceptance:**
- `prd summary --json` output schema includes:
  ```jsonc
  [
    {
      "id": "pharos-v1",
      "tier": "scratch",
      "path": "~/dev/prd/scratch/pharos_v1_2026-05-22.md",
      "title": "Pharos v1 Index PRD",
      "status": "open",
      "companions": {
        "html": "~/dev/prd/scratch/pharos_v1_2026-05-22.html"
      }
    }
  ]
  ```
- `companions` is `null` or `{}` for PRDs without companions.
- Other companion types (pdf, pptx, ipynb) follow the same shape when future support lands.

---

## 4. Data model changes

### 4.1 `active-prds.json` per-tier registry

Adds `companions` field per entry. Backward compatible — readers must handle missing field.

```jsonc
{
  "active": [
    {
      "id": "pharos-v1",
      "path": "<abs path to .md>",
      "status": "open",
      "created": "2026-05-22",
      "descriptor": "pharos_v1",
      "branch_at_creation": "<git branch>",
      "owner_path": "<absolute dir owning this PRD>",
      "session_origin": "<UUID>",
      "companions": {
        "html": "<abs path to .html>"
      }
    }
  ],
  "closed_prds": [ /* same shape */ ]
}
```

### 4.2 `prd summary --json` output schema

Per-PRD entry adds `companions: Record<string, string> | null`.

### 4.3 New CLI subcommands

- `prd new --html <descriptor>` — creates MD + stub HTML; updates active-prds.json
- `prd open --html <id>` — locates the HTML companion; opens in VSCode webview if extension is active, else uses `wslview`/`xdg-open`
- `prd doctor` — extended to flag paired-name violations (already exists; adds check)
- `prd summary --json` — extends output schema (already exists; adds field)

Existing subcommands (`graduate`, `archive`, `resolve`, `sweep`, `link`, `revision`, `reopen`) extended internally to move/symlink both files when a paired companion exists. From user's perspective: no API change.

---

## 5. Implementation surface (high-level)

### 5.1 `prd` CLI changes (binary at `~/bin/prd`)

- Add `--html` flag to `prd new`
- Add `prd open --html <id>` subcommand
- Extend `prd doctor` with paired-name check
- Extend `prd summary --json` output with `companions` field
- Extend `prd graduate` / `archive` / `resolve` to move HTML companion alongside MD
- Stub HTML template embedded in the binary (~3 KB)

### 5.2 `design-prd` SKILL.md changes (the 10 Phase 1 fixes)

| ID | Fix |
|---|---|
| A | Add Step 0: resolve path + filename FIRST (`~/dev/prd/scratch/<descriptor>_<YYYY-MM-DD>.html`). Use `Write` tool, not `<artifact>` blocks. |
| B | Add mandatory pre-step: "Confirm `prd new --html <descriptor>` has been run; if not, instruct user to run it first." |
| C | Add naming-convention enforcement section: MD and HTML must share base; reject `-design-prd` suffix, kebab-case mixing, missing date. |
| D | Change Step 6 from "mention" to "REQUIRED": the companion MD must exist at the same base name; the skill does NOT produce orphan HTML. |
| F | Split sections into REQUIRED (masthead, hero, decisions, references, colophon) and CONDITIONAL (modules only if ≥3 distinct, scale tiers only if axis, agent only if LLM layer); add explicit "omit if N/A — do not fabricate". |
| G | Add aesthetic-selection heuristic: "Schematic for infra/protocol/hardware; Editorial blueprint for long-lived architectural docs; Brutalist for developer tools/security; Manuscript for editorial/publication; Bauhaus for products". |
| H | Convert qualitative self-checks to grep-able structural checks (font-size compare, `@media (max-width: 960px)` block present, etc.). |
| I | Scale rule: 3-20 decisions, do not pad. Document `data-spread="full"` use (for cards with code + score table). |
| J | Mandate `@media print { [data-reveal] { opacity: 1 !important; transform: none !important } }` reset in CSS template. |
| K | Provide minimal JSON-LD template with `@context: schema.org`, `@type: TechArticle`, required fields: `headline`, `datePublished`, `version`, `author`, `description`, `identifier`. |

### 5.3 `prdone` VSCode extension changes

- **Tile renderer:** add icon row to tile footer (📄 MD + 🌐 HTML when companion present)
- **Click handler:** 🌐 icon opens the HTML in a VSCode `WebviewPanel` with `Webview.cspSource` allowlisting `https://fonts.googleapis.com` + `https://fonts.gstatic.com`
- **Webview header:** add "↗ Open in Browser" button → calls `vscode.env.openExternal(vscode.Uri.file(htmlPath))`
- **New Gallery tab:** separate route in browser kanban (`/gallery`) with lazy-loaded iframe grid
- **Tile-fetch:** consume the new `companions` field from `prd summary --json`

### 5.4 Pharos PRD migration (one-time)

```bash
cd ~/dev/prd/scratch
mv pharos_v1_index_2026-05-22.md pharos_v1_2026-05-22.md
mv viz_tool_v1_design_2026-05-22.html pharos_v1_2026-05-22.html
mv pharos_v1_design_journal_2026-05-22.md pharos_v1_journal_2026-05-22.md
# update internal cross-references in each file
```

Plus update the `active-prds.json` registry entry to point at the new paths.

---

## 6. Non-goals (out of scope)

- PDF / PPTX / IPYNB companion support (data model accommodates; implementation deferred)
- Multi-HTML companions per MD (single `companions.html` field; future schema if needed)
- HTML editing inside prdone (Phase 1 remains read-only; HTML editing happens in `/design-prd` skill)
- Real-time HTML preview sync (regenerating thumbnails on every save is out of scope for v1)
- Image / thumbnail generation via headless browser (the gallery uses live iframes; static thumbnails would need Puppeteer/Playwright bundled with extension)

---

## 7. Acceptance scenarios (5-minute manual smoke tests)

| # | Scenario | Pass criteria |
|---|---|---|
| 1 | `prd new --html "test feature"` | Two files created in scratch with matching base name + date; active-prds.json updated with companions field |
| 2 | `prd open --html test-feature` | HTML opens in VSCode webview AND "Open in Browser" button present in header |
| 3 | Kanban tile renders icon row | Tile in browser kanban shows 📄 + 🌐 icons when companion present; only 📄 when MD-only |
| 4 | Gallery tab loads | Navigate to `/gallery`; iframes lazy-load as you scroll; no >2s blocking on first paint |
| 5 | `prd doctor` flags Pharos | Running `prd doctor` reports the Pharos naming mismatches with suggested rename commands |
| 6 | `prd graduate` moves both files | Running on a paired PRD in scratch moves BOTH MD and HTML to library; active-prds.json updated |
| 7 | Webview CSP holds | Google Fonts load in VSCode webview without CSP violation in DevTools console |
| 8 | Workspace Trust gating | Open prdone in an untrusted folder; HTML preview blocked; tile icons render from cached registry only |

---

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| VSCode webview CSP blocks Google Fonts | Allowlist `fonts.googleapis.com` + `fonts.gstatic.com` in `webview.cspSource`; fallback to system fonts if blocked |
| Iframe-per-gallery-tile crashes VSCode | Cap concurrent iframes at 20; unmount as new ones scroll in (already in design) |
| Pharos rename breaks references | Inventory and update all cross-references in MD bodies before renaming; provide migration script |
| `prd new --html` produces stub HTML user never fills | Terminal output explicitly prompts: "Run `/design-prd <descriptor>` in Claude Code to fill the HTML." Stub is ≤3 KB so wasted-byte cost is minimal |
| HTML companion gets out of sync with MD content | Out of scope for v1. v2: add `prd sync --html` command. v1: human discipline. |
| `prd graduate` partial failure leaves one file in scratch, one in library | Wrap MD + HTML move in a transaction; rollback if either fails. Test with crafted permission errors. |

---

## 9. References

- `~/.claude/skills/design-prd/SKILL.md` — the new HTML PRD authoring skill
- `~/.claude/skills/design-prd/example.html` — Pharos PRD canonical example
- `~/.claude/skills/prd.md` — existing `prd` CLI lifecycle skill
- `~/.claude/rules/domains/plan-persistence.md` — PRD naming convention rules
- `~/dev/projects/prdone/specs/001-prd-visualizer/spec.md` — existing visualizer spec (companion to this one)
- `~/dev/prd/scratch/pharos_v1_2026-05-22.md` — Pharos index PRD (renamed from `pharos_v1_index_2026-05-22.md` in T108)
- `~/dev/prd/scratch/pharos_v1_2026-05-22.html` — Pharos design PRD (renamed from `viz_tool_v1_design_2026-05-22.html` in T108)
- `~/dev/prd/scratch/pharos_v1_journal_2026-05-22.md` — Pharos design journal (renamed from `pharos_v1_design_journal_2026-05-22.md` in T108)

---

## 10. Revision log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-05-22 | Initial draft. Captures adversarial-audit + 2 paired-debate phases. 5 user stories, 8 acceptance scenarios, 10 SKILL.md fixes, Pharos migration plan. |
