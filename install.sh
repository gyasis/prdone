#!/usr/bin/env bash
#
# install.sh — installs the prd lifecycle CLI + Claude Code skills from this repo
# into the current user's home. Self-contained: clone the repo, run this script,
# done. No build step, no network, no dependencies beyond bash + coreutils.
#
#   prd CLI   ->  ~/bin/prd                         (chmod 755)
#   skills    ->  ~/.claude/skills/<name>/SKILL.md  (Claude Code dir-form)
#
# Existing files are backed up to <name>.bak before overwrite. Re-runnable.
#
# Usage:
#   ./install.sh                 install CLI + all skills
#   ./install.sh --dry-run       print what would happen, change nothing
#   ./install.sh --skills-only   install skills, skip the CLI
#   ./install.sh --cli-only      install the CLI, skip skills
#   ./install.sh --help
#
set -euo pipefail

# --- resolve repo root (works regardless of cwd / symlinks) ------------------
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
REPO_ROOT="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"

BUNDLE="$REPO_ROOT/bundle"
SKILLS_SRC="$BUNDLE/skills"
CLI_SRC="$BUNDLE/bin/prd"

SKILLS_DST="$HOME/.claude/skills"
BIN_DST="$HOME/bin/prd"

DRY_RUN=0
DO_CLI=1
DO_SKILLS=1

# --- args --------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)     DRY_RUN=1 ;;
    --skills-only) DO_CLI=0 ;;
    --cli-only)    DO_SKILLS=0 ;;
    -h|--help)
      # print the leading comment block (skip the shebang line), strip "# "
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$SOURCE"
      exit 0 ;;
    *) echo "install.sh: unknown arg '$1' (try --help)" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY_RUN" -eq 1 ]; then say "  [dry-run] $*"; else eval "$*"; fi; }
note() { printf '  \033[2m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

# --- preflight ---------------------------------------------------------------
[ -d "$BUNDLE" ] || { echo "install.sh: bundle/ missing at $BUNDLE — is this a full clone?" >&2; exit 1; }
if [ "$DO_CLI" -eq 1 ] && [ ! -f "$CLI_SRC" ]; then
  echo "install.sh: $CLI_SRC missing — cannot install CLI" >&2; exit 1
fi
if [ "$DO_SKILLS" -eq 1 ] && [ ! -d "$SKILLS_SRC" ]; then
  echo "install.sh: $SKILLS_SRC missing — cannot install skills" >&2; exit 1
fi

say ""
say "prdone installer  (repo: $REPO_ROOT)"
[ "$DRY_RUN" -eq 1 ] && say "*** DRY RUN — no files will be changed ***"
say ""

installed=0
backed=0

# --- CLI ---------------------------------------------------------------------
if [ "$DO_CLI" -eq 1 ]; then
  say "prd CLI -> $BIN_DST"
  run "mkdir -p '$(dirname "$BIN_DST")'"
  if [ -f "$BIN_DST" ]; then
    run "cp -p '$BIN_DST' '$BIN_DST.bak'"; backed=$((backed+1)); note "backed up existing -> $BIN_DST.bak"
  fi
  run "cp '$CLI_SRC' '$BIN_DST'"
  run "chmod 755 '$BIN_DST'"
  ok "prd CLI installed"; installed=$((installed+1))
  say ""
fi

# --- skills ------------------------------------------------------------------
if [ "$DO_SKILLS" -eq 1 ]; then
  say "skills -> $SKILLS_DST/<name>/SKILL.md"
  run "mkdir -p '$SKILLS_DST'"
  for d in "$SKILLS_SRC"/*/; do
    [ -d "$d" ] || continue
    name="$(basename "$d")"
    src="$d/SKILL.md"
    [ -f "$src" ] || { warn "$name: no SKILL.md, skipping"; continue; }
    dstdir="$SKILLS_DST/$name"
    dst="$dstdir/SKILL.md"
    run "mkdir -p '$dstdir'"
    if [ -f "$dst" ]; then
      run "cp -p '$dst' '$dst.bak'"; backed=$((backed+1))
    fi
    # remove any stale FLAT shadow (~/.claude/skills/<name>.md) — loader ignores
    # it and the dir form wins, but a dead flat file is confusing.
    if [ -f "$SKILLS_DST/$name.md" ]; then
      run "mv '$SKILLS_DST/$name.md' '$SKILLS_DST/$name.md.bak'"
      note "moved stale flat $name.md -> .bak"
    fi
    run "cp '$src' '$dst'"
    ok "$name"; installed=$((installed+1))
  done
  say ""
fi

# --- PATH sanity -------------------------------------------------------------
if [ "$DO_CLI" -eq 1 ]; then
  case ":$PATH:" in
    *":$HOME/bin:"*) : ;;
    *)
      warn "$HOME/bin is not on your PATH. Add this to ~/.bashrc (or ~/.zshrc):"
      say  "      export PATH=\"\$HOME/bin:\$PATH\""
      ;;
  esac
fi

say "Done. installed=$installed backed-up=$backed"
if [ "$DRY_RUN" -eq 0 ] && [ "$DO_CLI" -eq 1 ]; then
  say ""
  say "Verify:  prd --help   (restart Claude Code to load the skills)"
fi
