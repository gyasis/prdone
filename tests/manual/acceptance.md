# Manual Acceptance Test Runbook

Source: extracted from `specs/001-prd-visualizer/quickstart.md` §"Exercise the seven acceptance scenarios"
Target: each scenario passes in ≤5 minutes (SC-008: 7 × 5min = 35min total before tagging v0.1.0)

| # | Scenario | Status | Notes |
|---|---|---|---|
| 1 | **Activation & Doctor View** — Unset `prd.binaryPath` and remove `prd` from PATH (or rename the binary). Reload window. The Doctor View MUST appear ≤1.5s; clicking the "configure binary path" affordance opens settings. | ☐ | |
| 2 | **Theme fidelity** — Cycle the editor through Dark Modern → Light+ → Light High Contrast. Tile text and borders MUST remain legible without restart. | ✅ PASS | F5 host, 2026-05-08. Required two real fixes: (1) stripped hardcoded `--vscode-*` declarations from styles.css that were locking the webview into Dark+ regardless of the editor theme — VSCode's auto-injected tokens now flow through; (2) replaced `--vscode-disabledForeground` + opacity-based muting with `--vscode-descriptionForeground` for all secondary text (counts strip, tile context, ephemeral, meta-row, empty-state). Bonus consolidation: typography unified to Geist + Geist Mono across sidebar and detail panel; new "Open" / "Resolved" filter chips with live counts; tier strips given brand-color fallbacks so they're always visible. |
| 3 | **Live sync** — In any editor tab, edit a PRD `.md`'s title, save. The matching tile MUST update ≤300ms. | ☐ | |
| 4 | **Tile grid scans cleanly** — At ≥85 PRDs, the grid MUST render ≤500ms after CLI returns. Apply `stale only`; expect the grid to shrink to the count returned by `prd summary --json \| jq '[.[] \| select(.stale)] \| length'`. Empty filter result MUST show "no PRDs match". | ✅ PASS | F5 host, 2026-05-08. Stale count = 1 (matches CLI ground truth). Scroll fixed by adding webview-context flex-chain overrides to styles.css. Wordmark switched from Georgia to Geist for cross-surface cohesion with kanban (CSP relaxed for fonts.googleapis.com). |
| 5 | **Kanban view** — Run "PRD: Open Kanban". Three columns appear (scratch / archive / library) with correct counts. Read-only — no drag-write actually mutates state. | ✅ PASS | F5 host, 2026-05-08. Four bug fixes: (1) `body { overflow: hidden }` + `#app { height: 100% }` flex-chain so `.k-col-body` gets a bounded scroll area (cards no longer fall off bottom); (2) responsive break <1100px stacks columns + lets outer page scroll; (3) data-indexing bug — tiles keyed by `data-path` not column-local `data-idx` (clicking Archive[0] now opens the actual Archive PRD, not Scratch[0]); (4) drawer redesign — scrim + Esc-close + cross-PRD flash transition + sectioned padding + word-break for long titles. Bonus: sidebar title-bar action-button opens the kanban with one click. |
| 6 | **Action contract** — Click any tile. Side panel shows ≥4 commands. Click "prd-checkout <id>"; verify clipboard via `xclip -selection clipboard -o` (Linux) or `pbpaste` (macOS). | ✅ PASS | F5 host, 2026-05-08. Tile click slides up detail panel; tier-aware command list (scratch+ACTIVE → 5 cmds with prd resolve; archive → 5 with prd graduate; library → 4); copy-to-clipboard with green "Copied" 900ms flash all working. |
| 7 | **Workspace Trust** — Open the extension in an untrusted folder. Read-only render of cached data succeeds; CLI invocation is gated until trust is granted. | ☐ | |

## Walkthrough log

Date | Tester | Pass count | Total time | Notes
---|---|---|---|---
| | | / 7 | min | |
