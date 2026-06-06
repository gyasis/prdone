# UX & Theme Inheritance — Requirements Quality Checklist

**Purpose**: "Unit tests for English" — validate that the UX-related requirements in spec.md / plan.md / data-model.md are well-written. Items are answerable YES/NO by reading the documents alone; nothing here verifies implementation behavior.
**Created**: 2026-05-07
**Feature**: [spec.md](../spec.md)
**Scope**: 12 items, ~5 min walkthrough
**Audience**: spec author (pre-PR self-review)

---

## Theme requirements

- [ ] **CHK001** Are visual fidelity requirements specified for all three themes (Default Dark, Light+, High Contrast), or does the spec mention only "dark/light"? — *Completeness*
- [ ] **CHK002** Does the spec quantify what "remains legible" means under theme switching, or is it left as subjective judgment? — *Measurability* (spec.md US1 acceptance scenario 3)
- [ ] **CHK003** Are color tokens for the sidebar surface enumerated with the exact `--vscode-*` token names, or referenced only as "VSCode CSS variables"? — *Clarity*
- [ ] **CHK004** Is the deliberate divergence between sidebar (VSCode-native palette) and kanban (Geist + cream/ink) recorded as a decision, or is it implied? — *Consistency between plan.md and design references*

## Layout & dimensions

- [ ] **CHK005** Is the sidebar width range specified with a numeric bound, or described qualitatively ("narrow")? — *Measurability*
- [ ] **CHK006** Are the kanban column proportions and ordering (Scratch / Archive / Library) explicit, or left to designer discretion? — *Completeness*
- [ ] **CHK007** Does the spec define what "responsive" means for the sidebar grid — at minimum a min-tile-width or column-count rule? — *Clarity*

## Tile content rules

- [ ] **CHK008** Is the surfaced field set on a tile (title, tier, age, status, ephemeral, decisions, subagents, significance) enumerated in spec.md FR-002 with each field's data source named? — *Completeness*
- [ ] **CHK009** Are stale-tile visual rules defined beyond "desaturate" — opacity %, saturation %, additional cues? — *Clarity*
- [ ] **CHK010** Does the spec or plan specify what happens when `significance` is `null` versus a number — the visual treatment for each? — *Coverage of edge case*

## Interaction & states

- [ ] **CHK011** Is the side-panel slide direction specified per surface (sidebar = up-from-bottom, kanban = in-from-right), or left to the designer? — *Consistency / Clarity*
- [ ] **CHK012** Are empty-state requirements (filter matches zero, no PRDs found, CLI unreachable) defined as distinct cases with distinct copy, or collapsed into one generic empty pane? — *Coverage* (spec.md FR-004 + Edge Cases)

---

## Notes

- Mark each `[ ]` as `[x]` once you've confirmed the spec adequately addresses the concern (or `[~]` with a one-line note for partial coverage that needs follow-up).
- Items that fail = spec wording change; they are NOT bug reports against the implementation.
- See `checklists/contracts.md` and `checklists/release.md` for the other two angles.
