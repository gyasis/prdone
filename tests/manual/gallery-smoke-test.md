# Gallery view — manual smoke test (Spec 002 T104)

**Goal:** Verify the gallery scales to ≥30 HTML companions without performance
degradation. This is a manual scenario (automated browser perf testing is out
of scope for v0.2.0-alpha).

## Pass criteria

1. **First paint ≤ 2 s** after navigating to `/gallery` with 30+ companions.
2. **Scroll smooth at ≥ 30 FPS** — no visible jank, no white flashes between cards.
3. **Memory ≤ 100 MB** in the main process (Chrome / Edge `chrome://memory`).
4. **At most 20 iframes mounted concurrently** (verify via DevTools → Elements → count `<iframe>`).
5. **Cards off-screen show placeholder** (`scrolling will render preview…`) until scrolled into view.
6. **Empty-state friendly card** appears when no HTML companions exist.
7. **Nav link from kanban** (`🌐 Gallery <count>` in header) navigates to `/gallery` and back.

## Setup — synthesize 30+ companions

```bash
# Create 30 disposable test PRDs, each with its own HTML companion stub.
# Pick base descriptors that won't collide with real work.
for i in {1..30}; do
  prd new --html gallery_test_${i}_alpha --root
done
```

This creates 60 files total (30 `.md` + 30 `.html`) in `~/dev/prd/scratch/`.
Each `.html` is the ~3 KB stub emitted by `prd new --html` (T071).

## Run the extension

```bash
cd ~/dev/projects/prdone
npm run build           # esbuild bundles src/ + webview-frontend/
# Either:
#   F5 in VSCode (Run Extension launch config)
# OR:
#   Reload the already-installed extension
```

Then in the sidebar:
1. Click **🌐 Gallery** in the kanban header → navigates to `http://127.0.0.1:7373+/gallery`.

## Measurements

| # | Check | How to verify | Pass? |
|---|---|---|---|
| 1 | First paint ≤ 2 s | Reload page; Network tab shows `/api/prds` returning; `console` shows `[prd-gallery] first-paint <Nms>` | _____ |
| 2 | Scroll smooth | Open DevTools → Performance → record 5 s of scroll; verify no red bars | _____ |
| 3 | Memory ≤ 100 MB | DevTools → Memory → take heap snapshot during steady scroll | _____ |
| 4 | ≤ 20 iframes | DevTools → Elements → `document.querySelectorAll('iframe').length` ≤ 20 | _____ |
| 5 | Placeholder before scroll | Scroll quickly to the bottom; verify cards near top return to placeholder state | _____ |
| 6 | Empty state | Delete all `.html` companions from scratch; reload `/gallery`; friendly empty card appears | _____ |
| 7 | Nav round-trip | Click `← Kanban` link → returns to `/`; click `🌐 Gallery` → back to `/gallery` | _____ |

## Cleanup

```bash
# Remove the synthesized test PRDs.
for i in {1..30}; do
  rm -f ~/dev/prd/scratch/gallery_test_${i}_alpha_*.{md,html}
done

# Confirm cleanup
prd doctor
ls ~/dev/prd/scratch/gallery_test_* 2>/dev/null || echo "no test files remain ✅"
```

## Known limitations (v0.2.0-alpha)

- Iframes use `transform: scale(0.5)` for fit-to-card preview — Firefox may
  render slightly differently than Chrome on this. The semantic content is
  identical; only visual scaling differs.
- The `Open Full Tab` link in each card opens a new browser tab with the raw
  HTML companion (no scaling). This is the canonical full-fidelity view.
- IntersectionObserver `rootMargin: 200px` is hard-coded. Tuning for very long
  PRD HTMLs (deep scrolls) is deferred to v0.3.

## Sign-off

Tested by: _____________________
Date:       _____________________
Build SHA:  _____________________
Result:     PASS / FAIL (circle one)
Notes:      _____________________________________________________________
            _____________________________________________________________
