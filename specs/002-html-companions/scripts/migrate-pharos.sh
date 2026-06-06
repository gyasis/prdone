#!/usr/bin/env bash
# Spec 002 T106 — Pharos PRD migration script.
#
# Renames three files in ~/dev/prd/scratch/ to comply with the Spec 002
# paired-name convention, and rewrites all internal cross-references.
#
#   pharos_v1_index_2026-05-22.md         → pharos_v1_2026-05-22.md
#   viz_tool_v1_design_2026-05-22.html    → pharos_v1_2026-05-22.html
#   pharos_v1_design_journal_2026-05-22.md → pharos_v1_journal_2026-05-22.md
#
# Reference: specs/002-html-companions/pharos-migration-inventory.md (T105)
#
# Usage:
#   migrate-pharos.sh --dry-run    # prints what would change; touches nothing
#   migrate-pharos.sh --apply      # actually renames + rewrites
#
# Always run --dry-run first, review the diff, then --apply.

set -euo pipefail

MODE="${1:-}"
if [ "$MODE" != "--dry-run" ] && [ "$MODE" != "--apply" ]; then
  echo "usage: $0 --dry-run | --apply" >&2
  exit 1
fi

SCRATCH="${PRD_ROOT:-$HOME/dev/prd}/scratch"
REGISTRY="${PRD_ROOT:-$HOME/dev/prd}/scratch/.memory/active-prds.json"

declare -A RENAMES=(
  ["$SCRATCH/pharos_v1_index_2026-05-22.md"]="$SCRATCH/pharos_v1_2026-05-22.md"
  ["$SCRATCH/viz_tool_v1_design_2026-05-22.html"]="$SCRATCH/pharos_v1_2026-05-22.html"
  ["$SCRATCH/pharos_v1_design_journal_2026-05-22.md"]="$SCRATCH/pharos_v1_journal_2026-05-22.md"
)

# Substitution map — applied to body of each file. Longer keys first so prefix
# collisions don't bite. The Python script handles the actual replacement.
SUBS_PY=$(cat <<'PY'
import sys, pathlib, json
subs = [
    ("viz_tool_v1_design_2026-05-22.html", "pharos_v1_2026-05-22.html"),
    ("pharos_v1_design_journal_2026-05-22.md", "pharos_v1_journal_2026-05-22.md"),
    ("pharos_v1_index_2026-05-22.md", "pharos_v1_2026-05-22.md"),
]
path = pathlib.Path(sys.argv[1])
text = path.read_text()
replaced = 0
for old, new in subs:
    n = text.count(old)
    if n > 0:
        text = text.replace(old, new)
        replaced += n
if "--dry-run" in sys.argv:
    print(f"  [{replaced} substitutions] {path}", file=sys.stderr)
else:
    path.write_text(text)
    print(f"  ✓ rewrote {replaced} reference(s) in {path}", file=sys.stderr)
PY
)

echo "==============================================="
echo "  Pharos PRD Migration — Spec 002 T106-T108"
echo "  Mode: $MODE"
echo "  Target dir: $SCRATCH"
echo "==============================================="
echo

# Step 1: verify pre-conditions
echo "=== Step 1: pre-flight checks ==="
missing=0
for src in "${!RENAMES[@]}"; do
  if [ ! -e "$src" ]; then
    echo "  ❌ source missing: $src"
    missing=$((missing + 1))
  else
    echo "  ✅ found: $(basename "$src")"
  fi
done
if [ "$missing" -gt 0 ]; then
  echo
  echo "ABORT: $missing source file(s) missing. Cannot proceed."
  exit 2
fi

# Check destination collisions
echo
echo "=== Step 1b: destination collision check ==="
for dst in "${RENAMES[@]}"; do
  if [ -e "$dst" ]; then
    # OK if dst is the same as src (already-paired sub-case)
    same=0
    for src in "${!RENAMES[@]}"; do
      if [ "$src" = "$dst" ]; then same=1; break; fi
    done
    if [ "$same" -eq 0 ]; then
      echo "  ❌ destination already exists: $(basename "$dst")"
      missing=$((missing + 1))
    fi
  else
    echo "  ✅ destination free: $(basename "$dst")"
  fi
done
if [ "$missing" -gt 0 ]; then
  echo
  echo "ABORT: destination collision. Resolve manually."
  exit 3
fi

# Step 2: rewrite cross-references INSIDE each source file (before rename)
echo
echo "=== Step 2: rewrite internal cross-references ==="
for src in "${!RENAMES[@]}"; do
  if [ "$MODE" = "--dry-run" ]; then
    python3 -c "$SUBS_PY" "$src" --dry-run 2>&1
  else
    python3 -c "$SUBS_PY" "$src" 2>&1
  fi
done

# Step 3: rename files
echo
echo "=== Step 3: rename files ==="
for src in "${!RENAMES[@]}"; do
  dst="${RENAMES[$src]}"
  if [ "$src" = "$dst" ]; then
    echo "  (skip — already at target name) $(basename "$src")"
    continue
  fi
  if [ "$MODE" = "--dry-run" ]; then
    echo "  [dry-run] mv $(basename "$src") → $(basename "$dst")"
  else
    mv "$src" "$dst"
    echo "  ✓ mv $(basename "$src") → $(basename "$dst")"
  fi
done

# Step 4: update active-prds.json registry if present
echo
echo "=== Step 4: update registry ==="
if [ -f "$REGISTRY" ]; then
  # Same substitutions, but on the JSON
  if [ "$MODE" = "--dry-run" ]; then
    echo "  [dry-run] would rewrite paths in: $REGISTRY"
    python3 -c "
import json, pathlib
p = pathlib.Path('$REGISTRY')
data = json.loads(p.read_text())
subs = [
    ('viz_tool_v1_design_2026-05-22.html', 'pharos_v1_2026-05-22.html'),
    ('pharos_v1_design_journal_2026-05-22.md', 'pharos_v1_journal_2026-05-22.md'),
    ('pharos_v1_index_2026-05-22.md', 'pharos_v1_2026-05-22.md'),
]
def walk(o):
    if isinstance(o, dict):
        return {k: walk(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v) for v in o]
    if isinstance(o, str):
        for old, new in subs:
            o = o.replace(old, new)
        return o
    return o
new = walk(data)
diff_count = sum(1 for line in json.dumps(new, indent=2).splitlines() if line not in json.dumps(data, indent=2))
print(f'  [{diff_count} lines would change in registry]')
"
  else
    python3 -c "
import json, pathlib
p = pathlib.Path('$REGISTRY')
data = json.loads(p.read_text())
subs = [
    ('viz_tool_v1_design_2026-05-22.html', 'pharos_v1_2026-05-22.html'),
    ('pharos_v1_design_journal_2026-05-22.md', 'pharos_v1_journal_2026-05-22.md'),
    ('pharos_v1_index_2026-05-22.md', 'pharos_v1_2026-05-22.md'),
]
def walk(o):
    if isinstance(o, dict):
        return {k: walk(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v) for v in o]
    if isinstance(o, str):
        for old, new in subs:
            o = o.replace(old, new)
        return o
    return o
new = walk(data)
p.write_text(json.dumps(new, indent=2))
print('  ✓ registry rewritten')
"
  fi
else
  echo "  (registry not present — skipping)"
fi

# Step 5: verify
echo
echo "=== Step 5: post-migration verification ==="
if [ "$MODE" = "--apply" ]; then
  echo "  Files now in scratch:"
  ls -1 "$SCRATCH"/pharos_v1_*.{md,html} 2>/dev/null | sed 's/^/    /'
  echo
  echo "  Run \`prd doctor\` to confirm 0 paired-name violations."
  echo "  Expected outcome: pharos_v1_2026-05-22.{md,html} pair + pharos_v1_journal_2026-05-22.md as standalone MD."
else
  echo "  (dry-run — no files changed)"
fi

echo
echo "==============================================="
echo "  Done ($MODE)."
echo "==============================================="
