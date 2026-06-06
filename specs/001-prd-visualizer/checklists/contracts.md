# Read-Only Boundary + Type Safety — Requirements Quality Checklist

**Purpose**: "Unit tests for English" — validate that the contract / boundary / type-safety requirements in spec.md / plan.md / data-model.md / contracts/ are well-written. Items are answerable YES/NO by reading the documents alone; nothing here verifies implementation correctness.
**Created**: 2026-05-07
**Feature**: [spec.md](../spec.md)
**Scope**: 12 items, ~5 min walkthrough
**Audience**: spec author (pre-PR self-review)

---

## Read-only Phase-1 boundary

- [ ] **CHK001** Does the spec enumerate the exact CLI subcommands forbidden in Phase 1, or only describe them as "state-mutating"? — *Clarity* (spec.md FR-010, FR-019)
- [ ] **CHK002** Is the `EXECUTE_CLI` action variant's Phase-1 status explicitly described as "reserved in the type, rejected at runtime", or left ambiguous? — *Clarity* (data-model.md WebviewAction, contracts/webview-actions.md)
- [ ] **CHK003** Is the trigger for Phase 2 (when `EXECUTE_CLI` is enabled) defined, or left as "future work"? — *Completeness*

## Boundary identification

- [ ] **CHK004** Are all four cross-process boundaries named in spec.md FR-016, AND each has a corresponding type guard named in data-model.md / plan.md? — *Consistency across docs*
- [ ] **CHK005** Does each boundary contract (`prd-summary-json.md`, `webview-actions.md`, `kanban-api.md`) name the type guard that protects it, or merely describe validation in prose? — *Clarity*

## Schema definition completeness

- [ ] **CHK006** Are all `Prd` fields listed with their type, optionality, and validation rule (e.g., `age_days >= 0`, `significance ∈ [0,100] | null`)? — *Completeness* (data-model.md)
- [ ] **CHK007** Is the `Prd` field list in data-model.md identical to the field list embedded in `contracts/prd-summary-json.md` example JSON? — *Consistency*
- [ ] **CHK008** Are optional fields (`parent`, `children`) called out as appearing only when the CLI is invoked with `--with-tree`, or left as silently optional? — *Coverage*

## Failure mode definitions

- [ ] **CHK009** Is the behavior for malformed CLI JSON output specified (drop-and-count vs surface-as-error), with a stated user-facing outcome? — *Coverage* (contracts/prd-summary-json.md)
- [ ] **CHK010** Is the behavior for an empty `[]` CLI response explicitly defined as success (empty state) rather than error? — *Coverage*
- [ ] **CHK011** Are the kanban server's HTTP method-not-allowed (POST/PUT/DELETE/PATCH → 405) responses stated as a requirement, or only implied by "read-only"? — *Clarity* (contracts/kanban-api.md)

## Network posture

- [ ] **CHK012** Is the loopback-only binding for the kanban server stated as a refusal-to-bind requirement, or only as a default behavior? — *Clarity* (contracts/kanban-api.md security posture, FR-006/009)

---

## Notes

- Mark each `[ ]` as `[x]` once confirmed adequately specified, or `[~]` with a one-line follow-up note.
- Items that fail = update spec/plan/contract wording; they are NOT bugs against code.
- See `checklists/ux.md` and `checklists/release.md` for orthogonal angles.
