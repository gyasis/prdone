# AGENTS.md — install & use `prdone` autonomously

This file is written **for an AI coding agent** (Claude Code, Cursor, etc.) that has
just cloned this repo and needs to install the `prd` tooling onto the current machine,
with no human in the loop. If you are a human, this works for you too — it's just `bash`.

---

## What this repo ships

`prdone` is two things in one repo:

1. **The `prd` lifecycle CLI** — a self-contained Bash script (no runtime deps beyond
   `bash` + coreutils). Manages PRDs across a `scratch / archive / library` three-tier
   model. Installs to `~/bin/prd`.
2. **The Claude Code skills** that drive the CLI — `prd`, `prd-checkout`, `prd-diary`,
   `prd-summary`, `prd-README`. Install to `~/.claude/skills/<name>/SKILL.md`.

Plus an optional **VSCode extension** ("PRD Visualizer") that renders PRDs in a sidebar +
browser kanban and exposes the same install via a command. The extension is NOT required
to use the CLI or skills.

The installable payload lives in `bundle/`:

```
bundle/
├─ bin/prd                      # the CLI (chmod 755 on install)
└─ skills/
   ├─ prd/SKILL.md
   ├─ prd-checkout/SKILL.md
   ├─ prd-diary/SKILL.md
   ├─ prd-summary/SKILL.md
   └─ prd-README/SKILL.md
```

---

## Install (the whole job — one command)

From a fresh clone:

```bash
git clone https://github.com/gyasis/prdone.git
cd prdone
./install.sh
```

That installs the CLI **and** all skills. It is **idempotent** and **non-interactive**
(no prompts — safe for an agent to run unattended). Existing files are backed up to
`<name>.bak` before overwrite.

### What `install.sh` does, exactly

| Source (in repo)                | Destination                              |
|---------------------------------|------------------------------------------|
| `bundle/bin/prd`                | `~/bin/prd` (chmod 755)                   |
| `bundle/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md`        |

It also **retires stale flat skill shadows**: if a `~/.claude/skills/<name>.md` flat file
exists (the old, loader-ignored form), it is renamed to `.bak`. The Claude Code skill
loader **only** picks up the `<name>/SKILL.md` directory form — never flat `.md` files.

### Flags

```bash
./install.sh                # CLI + all skills
./install.sh --dry-run      # print every action, change nothing  ← run this first to preview
./install.sh --skills-only  # skills only, skip the CLI
./install.sh --cli-only     # CLI only, skip skills
./install.sh --help
```

**Agent tip:** run `./install.sh --dry-run` first, confirm the planned destinations look
right for this machine's `$HOME`, then run `./install.sh` for real.

---

## Verify the install succeeded

```bash
# 1. CLI is present and runs
~/bin/prd --help            # exit 0 == good

# 2. PATH — if ~/bin is not on PATH, the installer prints a warning.
command -v prd || echo 'add: export PATH="$HOME/bin:$PATH" to ~/.bashrc'

# 3. Skills landed in dir-form (NOT flat .md)
ls ~/.claude/skills/prd/SKILL.md \
   ~/.claude/skills/prd-checkout/SKILL.md \
   ~/.claude/skills/prd-diary/SKILL.md \
   ~/.claude/skills/prd-summary/SKILL.md
```

Skills are loaded by Claude Code **at session start** — restart the Claude Code session
(or reload the window) for the new `/prd*` skills to appear.

---

## Use the CLI (quickstart)

```bash
prd --help                       # full subcommand list
prd new <descriptor>             # create a scratch PRD
prd list                         # list active PRDs
prd summary                      # librarian view (card catalog)
prd log <slug> note "..."        # append a note
prd log <slug> decision "..."    # append a decision
prd resolve <slug>               # mark resolved
prd graduate <slug>              # promote scratch -> library
```

The full behavioral contract is in `~/.claude/skills/prd/SKILL.md` (installed) or
`bundle/skills/prd/SKILL.md` (in this repo). Skill `prd-checkout` is the "resume work"
command; `prd-summary` is the inventory view; `prd-diary` is the per-session diary.

---

## Optional: the VSCode extension

Only if you want the visual sidebar/kanban. It is not needed for CLI/skill use.

```bash
npm install
npm run build      # esbuild -> dist/extension.js
npm run package    # vsce -> dist/prdone-<version>.vsix  (auto-named from package.json)
code --install-extension dist/prdone-*.vsix
```

The extension contributes a command **"PRD: Install Skills + CLI Into Home"**
(`prd.installSkills`) that performs the same install as `install.sh`, from the packaged
extension's bundled `bundle/` dir. (`bundle/**` is intentionally kept in the `.vsix` —
do not re-add it to `.vscodeignore`, or the in-editor installer breaks.)

---

## Uninstall / rollback

```bash
rm -f ~/bin/prd
rm -rf ~/.claude/skills/prd ~/.claude/skills/prd-checkout \
       ~/.claude/skills/prd-diary ~/.claude/skills/prd-summary \
       ~/.claude/skills/prd-README
# restore any backups the installer made:
#   ~/bin/prd.bak , ~/.claude/skills/<name>/SKILL.md.bak
```

---

## Notes for the agent

- **No network, no build step** is required for the CLI+skills install — `install.sh`
  only copies files already in the clone. `npm` is only for the optional VSCode extension.
- The repo is the source of truth for the payload. To refresh what gets installed, update
  the files under `bundle/` and re-run `install.sh`.
- `dist/` and `*.vsix` are gitignored — the clone-and-install flow reads from `bundle/`,
  not from a committed `.vsix`. Always install via `install.sh` (or build the vsix locally).
