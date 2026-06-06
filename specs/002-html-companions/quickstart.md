---
description: "Quickstart / manual acceptance scenarios for Spec 002 — HTML Companion PRDs"
spec_id: 002-html-companions
---

# Quickstart: HTML Companion PRDs

**Audience:** developer implementing or smoke-testing Spec 002.
**Goal:** Bring up the new functionality, run the 8 acceptance scenarios, sign off the spec.

The acceptance scenarios are the 8 from `spec.md §7`. Each is bounded by 5 minutes of clock time.

---

## Prerequisites

- `dev-kid` execute environment ready (see `/devkid.init-check`)
- Branch `002-html-companions` checked out
- `prd` CLI at `~/bin/prd` is the patched version with `--html` support (T079 bumps to v0.2.0)
- prdone extension built locally with Spec 002 changes loaded (F5 dev host)
- At least one existing `.md` PRD in `~/dev/prd/scratch/` for the doctor-test scenarios
- ≥30 sample `.html` companions for the gallery performance test (T104) — can synthesize via `for i in {1..30}; do prd new --html "test_$i"; done`

---

## Build steps (developer)

```bash
# 1. Activate the spec-002 branch
cd ~/dev/projects/prdone
git checkout 002-html-companions

# 2. Pull the CLI changes — the prd binary is a bash script, so no rebuild needed
# (Just ensure ~/bin/prd has the v0.2.0 changes from Phase 7 tasks.)
prd --version   # expect: 0.2.0 or higher

# 3. Rebuild the prdone extension to pick up tile + Gallery changes
npm install
npm run build
npm run package   # produces dist/prdone-0.2.0-alpha.vsix

# 4. Install locally
code --install-extension dist/prdone-0.2.0-alpha.vsix --force

# 5. Restart VSCode and verify
```

---

## Acceptance scenarios

### Scenario 1 — `prd new --html` creates both files + registry update

```bash
cd /tmp
prd new --html "test feature"
ls ~/dev/prd/scratch/test_feature_*.{md,html}    # expect: BOTH files present
jq '.active[] | select(.descriptor == "test_feature") | .companions' \
  ~/dev/prd/scratch/.memory/active-prds.json
# expect: { "html": "/abs/path/to/test_feature_<date>.html" }
```

**PASS criteria:**
- Both files created with matching base + date.
- Stub HTML is ≤ 3 KB and contains the doctype + masthead placeholders.
- Registry entry has `companions.html` set to the new HTML path.
- Terminal output includes the hint: "Run `/design-prd <descriptor>` to fill the HTML."

---

### Scenario 2 — `prd open --html <id>` opens webview + browser button

In VSCode with the prdone extension active:

```bash
prd open --html test-feature
```

**PASS criteria:**
- A new VSCode `WebviewPanel` opens with title "test feature".
- The webview renders the stub HTML (skeleton with placeholders).
- An "↗ Open in Browser" button is visible top-right of the webview.
- Clicking the button opens the file in Windows Chrome / Linux chromium via `vscode.env.openExternal`.

---

### Scenario 3 — Kanban tile renders companion icon row

In the browser kanban at `http://127.0.0.1:7373/`:

**PASS criteria:**
- The tile for `test_feature` displays both `📄 MD` and `🌐 HTML` icons in its footer.
- Hovering each icon shows a tooltip with the corresponding file path.
- Clicking `📄` opens the .md in VSCode; clicking `🌐` opens the .html in a webview.
- Tiles for MD-only PRDs (no companion) show only the `📄` icon.

---

### Scenario 4 — Gallery tab loads + lazy-loads iframes

Synthesize ≥30 HTML companions (one-time):

```bash
for i in {1..30}; do prd new --html "gallery_test_$i"; done
```

Navigate to `http://127.0.0.1:7373/gallery`.

**PASS criteria:**
- First paint of gallery ≤ 2 seconds.
- Cards visible in viewport render their iframe; cards off-screen show placeholder until scrolled into view.
- Scroll remains smooth (≥ 30 FPS, no jank).
- Main-process memory ≤ 100 MB during scroll.
- Maximum 20 iframes mounted concurrently (verified via DevTools > Elements > count `<iframe>`).

---

### Scenario 5 — `prd doctor` flags Pharos mismatches

Run from any directory:

```bash
prd doctor
```

**PASS criteria (pre-Pharos-migration):**
- Output includes a "paired-name violations" section.
- (Post-T108 — fully migrated) Lists 0 violations. Pre-T108 it listed `viz_tool_v1_design_2026-05-22.html` as having no matching `.md`.
- Provides a suggested rename command.
- Does NOT auto-rename anything — read-only diagnostic only.

**PASS criteria (post-Pharos-migration via T108):**
- `prd doctor` reports 0 paired-name violations.
- Pharos files exist as `pharos_v1_2026-05-22.{md,html}` with matching base.

---

### Scenario 6 — `prd graduate` moves both files

Create a test PRD, then graduate it:

```bash
prd new --html "graduate test"
prd graduate graduate-test --to library
ls ~/dev/prd/scratch/graduate_test_*    # expect: nothing
ls ~/dev/prd/library/graduate_test_*    # expect: both .md and .html
jq '.active[] | select(.descriptor == "graduate_test")' \
  ~/dev/prd/library/.memory/active-prds.json
# expect: entry present with companions.html pointing at library path
```

**PASS criteria:**
- Both `.md` and `.html` moved together.
- Registry entry transferred from scratch → library.
- `companions.html` path updated to point at the new library location.
- If either file move fails, BOTH rollback (no partial state).

---

### Scenario 7 — Webview CSP holds (no console violations)

In VSCode:

1. Open the test-feature HTML companion via `prd open --html test-feature`.
2. Open the webview's DevTools (Cmd/Ctrl+Shift+I in the webview pane).
3. Reload the webview.

**PASS criteria:**
- No CSP violations in the Console tab.
- Google Fonts (Newsreader serif) load successfully — visible in Network tab as `fonts.googleapis.com` request returning 200.
- Embedded `<script type="application/ld+json">` schema.org block parses without errors.

---

### Scenario 8 — Workspace Trust gating

1. Open prdone in an untrusted folder (`File > Open Folder` with a fresh folder + click "No, don't trust").
2. Activate the prdone sidebar.

**PASS criteria:**
- Tile grid renders from cached `active-prds.json` (if present) — read-only mode.
- The 🌐 icon is grayed out / disabled with tooltip "Workspace not trusted — HTML preview disabled".
- Attempting `prd open --html` returns an error explaining the trust gate.
- No file-system writes occur in the untrusted folder.

---

## Cleanup after smoke test

```bash
# Remove the synthesized gallery_test PRDs
for i in {1..30}; do
  rm -f ~/dev/prd/scratch/gallery_test_${i}_*.{md,html}
done

# Remove standalone test-feature PRD
rm -f ~/dev/prd/scratch/test_feature_*.{md,html}

# Re-run doctor to confirm clean state
prd doctor
```

---

## Pass criteria for Spec 002 sign-off

All 8 scenarios must PASS in sequence. Log results in `tests/manual/spec-002-acceptance.md` with timestamps. Tag `v0.2.0-alpha` (T113) only after sign-off.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `prd new --html` says "unknown flag" | CLI binary at `~/bin/prd` is pre-Spec-002 | Reinstall via `prd-install-from-vsix` (see prdone QUICKSTART) |
| Gallery tab shows blank | Iframes blocked by extension CSP | Check webview CSP allowlist for `fonts.googleapis.com` (T092) |
| `prd doctor` reports false-positive violations | Stale `.html` file in tier dir without intended companion | Manually delete the orphan `.html` or rename to match an MD |
| Webview HTML appears unstyled | Newsreader serif blocked by CSP | Verify CSP source list includes `https://fonts.googleapis.com` and `https://fonts.gstatic.com` |
| `prd graduate` partial failure leaves one file behind | Transactional move not wrapping both ops | Check T076 implementation — both moves should rollback together |
