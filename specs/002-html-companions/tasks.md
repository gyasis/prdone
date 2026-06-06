---
description: "Implementation task list for Spec 002 — HTML Companion PRDs"
---

# Tasks: HTML Companion PRDs (Spec 002)

**Input**: Design documents in `/home/gyasisutton/dev/projects/prdone/specs/002-html-companions/`
**Prerequisites**: spec.md (this folder); related upstream skill at `~/.claude/skills/design-prd/`

**Origin**: 2026-05-22 multi-phase design session — adversarial-audit (Phase 1) + paired-debate × 2 (Phases 2 + 3). 10 SKILL.md fixes locked. Paired-name sidecar locked. Heavy prdone scope locked (first-class HTML, new CLI subcommands, Gallery view, tile icon row).

**Stories (US1–US5)**: see spec.md §3.

**Read-only safety**: Spec 002 maintains the Phase 1 read-only contract for prdone. `prd new --html` and `prd open --html` are CLI commands (user-invoked); prdone surfaces them as copy-pasteable strings, never executes them.

**Numbering convention**: continues from spec 001's T065. This spec uses T066–T114.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User-story label (US1–US5) per spec.md §3

---

## Phase 6: Spec 002 setup

- [x] T066 Read `specs/002-html-companions/spec.md` end-to-end. Verify 10 SKILL.md fixes + 5 sub-decisions + Pharos migration are clear before implementation
- [x] T067 [P] Create `specs/002-html-companions/checklists/` folder; mirror structure of 001-prd-visualizer
- [x] T068 [P] Create `specs/002-html-companions/data-model.md` detailing the new `companions` field, schema migration of active-prds.json, backward-compat reader rules
- [x] T069 [P] Create `specs/002-html-companions/contracts/companions.contract.ts` (TypeScript interface) for the `Companions` type returned by `prd summary --json`
- [x] T070 [P] Create `specs/002-html-companions/quickstart.md` — 8 manual acceptance scenarios from spec.md §7

## Phase 7: `prd` CLI extensions (binary at `~/bin/prd`)

**Purpose**: Make HTML PRDs first-class in the CLI lifecycle.

- [x] T071 [US1] Add `--html` flag to `prd new` subcommand. When passed: creates BOTH `<descriptor>_<date>.md` (existing logic) AND `<descriptor>_<date>.html` (stub from embedded template). Update active-prds.json with `companions.html` path.
- [x] T072 [P] [US1] Author stub HTML template (≤3 KB): doctype, semantic skeleton, masthead/hero/footer placeholders, hint comment "Run `/design-prd <descriptor>` to fill". Embed in CLI binary.
- [x] T073 [US2] Add `prd open --html <id>` subcommand. Resolves `<id>` to a PRD, locates `companions.html`, opens via priority: VSCode webview (if `VSCODE_IPC_HOOK_CLI` env detected) → `wslview` → `xdg-open` → error with helpful message.
- [x] T074 [P] [US4] Extend `prd doctor` with paired-name check. For every `.html` in scratch/archive/library, verify a matching `.md` (same base descriptor + date) exists. Report violations + suggested rename commands. NEVER auto-rename (read-only contract).
- [x] T075 [US5] Extend `prd summary --json` output: per-PRD entry adds `companions: Record<string, string> | null`. Null when no companions; object with `html` field when paired. Schema documented in `contracts/companions.contract.ts`.
- [x] T076 [US1] Extend `prd graduate` / `archive` / `resolve` / `sweep` to move BOTH `.md` AND `.html` companion when present. Wrap in transactional rollback if either move fails.
- [x] T077 [P] [US5] Backward compat: handle missing `companions` field in older active-prds.json entries — treat as `null`. No migration script required for old entries; they self-heal on next `prd doctor` run.
- [x] T078 [P] Unit tests: paired-name glob discovery, companion-aware move operations, doctor's violation detection, summary schema output
- [x] T079 Bump CLI version to v0.2.0. Update `bundle/bin/prd` if used. Update extension's bundled CLI if it ships its own copy.

## Phase 8: `design-prd` SKILL.md fixes (10 audit findings)

**Location**: `~/dev/projects/open-design/skills/design-prd/SKILL.md` (symlinked from `~/.claude/skills/design-prd/`)

- [x] T080 Fix A (Critical) — Replace `<artifact>` output contract with Write-tool + on-disk path. Add Step 0: resolve filename `<descriptor>_<YYYY-MM-DD>.html` and target `~/dev/prd/scratch/`. Use Write tool, not artifact tags.
- [x] T081 Fix B (Critical) — Add mandatory pre-step: "Confirm `prd new --html <descriptor>` has been run. If not, instruct user to run it first."
- [x] T082 Fix C (Major) — Add naming-convention enforcement section. Forbidden patterns: `-design-prd` suffix, kebab-case mixing, missing date, MD and HTML with different base descriptors. Cite Pharos as the case study.
- [x] T083 Fix D (Critical) — Change Step 6 from "the agent should mention these even if it doesn't produce them" to "the companion MD MUST exist at the same base name; produce it via `prd new --html` BEFORE running this skill."
- [x] T084 Fix F (Major) — Split sections into REQUIRED (masthead, hero, decisions, references, colophon) and CONDITIONAL (modules iff ≥3 distinct; scale tiers iff scaling is an axis; agent flow iff LLM layer; interface code iff load-bearing). Add explicit "omit if N/A — do not fabricate."
- [x] T085 Fix G (Major) — Add aesthetic-selection heuristic: "Schematic for infra/protocol; Editorial for long-lived architecture docs (default); Brutalist for developer tools/security; Manuscript for editorial/publication; Bauhaus for products." If brief doesn't signal, default Editorial.
- [x] T086 Fix H (Major) — Convert qualitative self-checks to grep-able structural checks. "Hero answers what+why in 5s" → "hero is ≤3 paragraphs, ≤80 words total." "Wordmark is BIGGEST" → "`.wordmark` font-size ≥6rem AND no other element exceeds it (verify by reading the stylesheet)."
- [x] T087 Fix I (Minor) — Replace "captures 11 architectural decisions" anchor with "scales 3-20 decision cards with project complexity; do NOT pad to match example." Document `data-spread="full"` use (for cards with code blocks + score tables).
- [x] T088 Fix J (Minor) — Add print fallback to CSS template: `@media print { [data-reveal], .reveal { opacity: 1 !important; transform: none !important; } }`. Mention in self-check.
- [x] T089 Fix K (Minor) — Provide JSON-LD template inline in SKILL.md. Required: `@context: schema.org`, `@type: TechArticle`, `headline`, `datePublished`, `version`, `author`, `description`, `identifier` (matches filename without ext + date).

## Phase 9: prdone tile + click handler (US2)

**Purpose**: Render companion-status icons; open HTML on click.

- [x] T090 [US2] Update tile renderer to read `companions` field from PRD data. Render footer icon row: `📄 MD` always; `🌐 HTML` when `companions.html` present; future `📊 PPTX`, `📕 PDF` icons follow same pattern.
- [x] T091 [US2] [P] Click handler for `🌐 HTML` icon: opens HTML in a new VSCode `WebviewPanel` with title = PRD title. Webview persistent across editor focus loss.
- [x] T092 [US2] [P] Configure webview CSP: allowlist `https://fonts.googleapis.com` + `https://fonts.gstatic.com` for the Pharos-style Newsreader serif. Set `img-src 'self' data:` for embedded SVG diagrams. Document allowed origins in `src/webview/csp.ts`.
- [x] T093 [US2] Add "↗ Open in Browser" button to webview header (top-right). On click: `vscode.env.openExternal(vscode.Uri.file(htmlPath))`. Tooltip explains why (full fidelity, no CSP restrictions).
- [x] T094 [US2] [P] Update sidebar webview (VSCode native) to also surface the icon row. Maintain --vscode-* CSS variable theme alignment.
- [x] T095 [US2] [P] Update browser kanban (Geist + cream/ink palette) to surface icon row. Visual style consistent with existing tile chrome.
- [x] T096 [US2] [P] Unit tests for tile-icon-row rendering (presence of icons matches `companions` field state).

## Phase 10: Gallery view (US3)

**Purpose**: Visual browsing of HTML PRDs at scale.

- [x] T097 [US3] Add `/gallery` route to express server in browser kanban (existing server at `127.0.0.1:7373+`). Static HTML shell at `kanban-static/gallery.html`.
- [x] T098 [US3] [P] Gallery layout: CSS grid of large cards (≥320×240px), top 50% = iframe area, bottom 50% = title + tier badge + PRD metadata.
- [x] T099 [US3] [P] Lazy-load iframe via IntersectionObserver: only render `<iframe src=...>` when card enters viewport. Replace with placeholder `<div>` when off-screen.
- [x] T100 [US3] Concurrent-iframe cap: max 20 simultaneously rendered. Track via `Set<cardId>`. Unmount oldest when 21st enters viewport.
- [x] T101 [US3] [P] Iframe sandbox attributes: `sandbox="allow-scripts allow-same-origin"` for the design-prd HTML (IntersectionObserver inside the iframe needs scripts). Document risk in `src/kanban/gallery.ts` comment.
- [x] T102 [US3] [P] Navigation: add "Gallery" link in main kanban header next to "Scratch / Archive / Library" tier tabs. Highlight when active.
- [x] T103 [US3] [P] Empty-state: when no HTML companions exist across all tiers, render friendly empty card with "No HTML companions yet — run `prd new --html <descriptor>` to create one."
- [x] T104 [US3] Manual smoke test: run with ≥30 HTML companions; gallery first-paint ≤2 s; scroll smooth at ≥30 FPS; no >100 MB main-process memory.

## Phase 11: Pharos PRD migration (US4 + one-time cleanup)

**Purpose**: Repair the existing naming mismatch.

- [x] T105 [US4] Inventory cross-references inside the three Pharos files (search for "viz_tool_v1_design", "pharos_v1_index", "pharos_v1_design_journal" within each file body). Capture as `specs/002-html-companions/pharos-migration-inventory.md`.
- [x] T106 [US4] Author migration script `specs/002-html-companions/scripts/migrate-pharos.sh`. Performs: (a) rename 3 files to paired-name convention, (b) sed-replace internal cross-references, (c) update `~/dev/prd/scratch/.memory/active-prds.json` entry to point at new paths.
- [x] T107 [US4] Dry-run migration: run script with `--dry-run`; review proposed changes; require user OK before live execution.
- [x] T108 [US4] Execute live migration. Verify `prd doctor` reports 0 paired-name violations after. Verify prdone kanban (if running) still renders the tile correctly.
- [x] T109 [P] [US4] Update spec 002 references where they cite the OLD Pharos filenames — they should now cite the NEW paired-name versions.

## Phase 12: Polish + release

- [x] T110 [P] Update `prdone/README.md` with new `prd new --html` and `prd open --html` workflow; gallery view screenshot.
- [x] T111 [P] Update `prdone/CHANGELOG.md` with v0.2.0-alpha entry covering all spec-002 deliverables.
- [x] T112 [P] Update `prdone/QUICKSTART.md` "Install Skills + CLI Into Home" command to also link `design-prd` skill into `~/.claude/skills/`.
- [x] T113 Bump extension version to `0.2.0-alpha` in `package.json`. Re-package: `npm run package`. Verify .vsix contains updated CLI binary + design-prd skill.
- [x] T114 Run all 8 acceptance scenarios from spec 002 §7. Log results in `tests/manual/spec-002-acceptance.md`.

---

## Dependency notes (spec 002)

- Phase 7 (CLI) MUST land before Phase 9 (prdone tile) — prdone consumes the new `companions` field
- Phase 8 (SKILL.md fixes) is INDEPENDENT of Phase 7 — can run in parallel
- Phase 10 (Gallery) depends on Phase 9 (tile renderer) for shared `companions` data path
- Phase 11 (Pharos migration) is INDEPENDENT — can run any time after T071+T074 land (so `prd doctor` knows what to look for)
- Phase 12 (polish) is the final gate

## Acceptance gate

Before tagging v0.2.0-alpha, ALL 8 scenarios from spec.md §7 must pass:
1. `prd new --html` creates both files + updates registry
2. `prd open --html` opens webview + offers browser button
3. Kanban tile shows icon row
4. Gallery tab loads + lazy-loads iframes
5. `prd doctor` flags Pharos mismatches
6. `prd graduate` moves both files
7. Webview CSP holds (no console violations)
8. Workspace Trust gating works on untrusted folder

---

## Switching the root `tasks.md` symlink (optional)

`~/dev/projects/prdone/tasks.md` currently symlinks to `specs/001-prd-visualizer/tasks.md`. To make spec 002's tasks the active default:

```bash
cd ~/dev/projects/prdone
rm tasks.md
ln -s specs/002-html-companions/tasks.md tasks.md
```

This is a convention-preserving change — every active spec's tasks.md becomes the root symlink target when that spec is in-flight. Defer until spec 001 closes (it's still alpha with US4 + US5b + US5a pending).
