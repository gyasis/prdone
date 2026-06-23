// Resolve a ranked list of "proper start paths" for launching Claude / shell
// commands, so the user is nudged toward the project root (git toplevel /
// worktree root / PRD-owner sentinel dir) instead of whatever subfolder the
// workspace happens to be opened to.
//
// This is a SUGGESTION surface, never a guard — "you can start from anywhere".
// The IO orchestrator (`resolveStartPath`) shells out to git and walks the
// filesystem for the `.memory/.prd-owner` sentinel; the ranking and the
// handoff-hint extraction are split out as PURE functions so they're unit-
// testable without touching the disk.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type StartKind = 'worktree' | 'git-root' | 'main-repo' | 'prd-owner' | 'current';

export interface StartCandidate {
  /** Absolute path to suggest cd-ing into. */
  path: string;
  kind: StartKind;
  /** Short human label, e.g. "git root", "worktree", "prd owner", "current folder". */
  label: string;
}

export interface StartPathInfo {
  /** The directory resolution started from (workspace folder, or a handoff's project hint). */
  from: string;
  /** Ranked candidates, best-first, deduplicated by path. candidates[0] is the recommendation. */
  candidates: StartCandidate[];
  /** True when `from` is a strict subdirectory of the recommended candidate (the "wrong folder" warning). */
  belowRoot: boolean;
}

const LABELS: Record<StartKind, string> = {
  'worktree': 'worktree',
  'git-root': 'git root',
  'main-repo': 'main repo',
  'prd-owner': 'prd owner',
  'current': 'current folder',
};

/** True when `child` is STRICTLY below `parent` (not equal). */
function isStrictlyBelow(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export interface RankInputs {
  fromDir: string;
  /** git toplevel of the current worktree (linked or main). null when not in a repo. */
  worktreeRoot: string | null;
  /** When in a LINKED worktree, the main repo's working dir. null otherwise. */
  mainRepoRoot: string | null;
  /** Whether worktreeRoot is a linked worktree (vs the main checkout). */
  linkedWorktree: boolean;
  /** Directory owning the nearest `.memory/.prd-owner` sentinel. null when none found. */
  prdOwnerDir: string | null;
}

/**
 * PURE ranking. Produces the deduped, best-first candidate list + the
 * "you're in a subfolder" flag. No IO. Ordering:
 *   1. worktree / git root   (the recommendation)
 *   2. main repo root        (only when in a linked worktree)
 *   3. prd-owner sentinel dir
 *   4. current folder        (fromDir — so "stay here" is always pickable)
 */
export function rankCandidates(input: RankInputs): StartPathInfo {
  const fromDir = path.resolve(input.fromDir);
  const ordered: StartCandidate[] = [];

  if (input.worktreeRoot) {
    const kind: StartKind = input.linkedWorktree ? 'worktree' : 'git-root';
    ordered.push({ path: input.worktreeRoot, kind, label: LABELS[kind] });
  }
  if (input.linkedWorktree && input.mainRepoRoot) {
    ordered.push({ path: input.mainRepoRoot, kind: 'main-repo', label: LABELS['main-repo'] });
  }
  if (input.prdOwnerDir) {
    ordered.push({ path: input.prdOwnerDir, kind: 'prd-owner', label: LABELS['prd-owner'] });
  }
  // current folder is always offered last — "you can start from anywhere".
  ordered.push({ path: fromDir, kind: 'current', label: LABELS['current'] });

  // Dedupe by resolved path, keeping the first (highest-priority) occurrence.
  const seen = new Set<string>();
  const candidates: StartCandidate[] = [];
  for (const c of ordered) {
    const p = path.resolve(c.path);
    if (seen.has(p)) continue;
    seen.add(p);
    candidates.push({ ...c, path: p });
  }

  const top = candidates[0];
  const belowRoot = !!top && top.kind !== 'current' && isStrictlyBelow(fromDir, top.path);

  return { from: fromDir, candidates, belowRoot };
}

/** Run `git` in `cwd` and resolve its trimmed stdout lines, or null on any failure. */
function git(cwd: string, args: string[]): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout: 4000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      resolve(stdout.split('\n').map(l => l.trim()).filter(Boolean));
    });
  });
}

/** Walk up from `startDir` looking for a `.memory/.prd-owner` sentinel file. */
function findPrdOwner(startDir: string): string | null {
  let dir = path.resolve(startDir);
  // Bound the walk at the filesystem root.
  for (;;) {
    try {
      if (fs.existsSync(path.join(dir, '.memory', '.prd-owner'))) return dir;
    } catch { /* permission / race — keep walking */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * IO orchestrator: resolve the ranked start-path candidates for `fromDir`.
 * Returns null only when `fromDir` is falsy. When not in a git repo and no
 * sentinel is found, the result still contains the `current` candidate so the
 * caller always has something to show.
 */
export async function resolveStartPath(fromDir: string | undefined | null): Promise<StartPathInfo | null> {
  if (!fromDir) return null;
  const dir = path.resolve(fromDir);

  let worktreeRoot: string | null = null;
  let mainRepoRoot: string | null = null;
  let linkedWorktree = false;

  const top = await git(dir, ['rev-parse', '--show-toplevel']);
  if (top && top[0]) {
    worktreeRoot = path.resolve(top[0]);
    const dirs = await git(dir, ['rev-parse', '--absolute-git-dir', '--git-common-dir']);
    if (dirs && dirs.length >= 2) {
      const gitDir = path.resolve(dir, dirs[0]);
      const commonDir = path.resolve(dir, dirs[1]);
      if (gitDir !== commonDir) {
        linkedWorktree = true;
        // common-dir for a linked worktree is the MAIN repo's `.git`; its parent
        // is the main working tree.
        if (path.basename(commonDir) === '.git') {
          mainRepoRoot = path.dirname(commonDir);
        }
      }
    }
  }

  const prdOwnerDir = findPrdOwner(dir);

  return rankCandidates({ fromDir: dir, worktreeRoot, mainRepoRoot, linkedWorktree, prdOwnerDir });
}

/**
 * PURE: best-effort extraction of the project directory a handoff doc belongs
 * to, from its markdown. Handoffs are freeform, but conventionally carry a
 * `Worktree: \`<path>\`` line and/or `## Read first` paths under the user's dev
 * tree. We prefer the explicit Worktree line, then fall back to the first
 * home-rooted path we can find. Returns an ABSOLUTE directory (file paths are
 * reduced to their dirname), or null when no usable hint exists.
 *
 * `home` is injectable for testing; defaults to os.homedir().
 */
export function extractProjectHint(markdown: string, home: string = os.homedir()): string | null {
  if (typeof markdown !== 'string' || markdown.length === 0) return null;

  const expand = (p: string): string =>
    p.startsWith('~/') ? path.join(home, p.slice(2)) : (p === '~' ? home : p);

  // A path "looks like a file" when its last segment has a dot extension.
  const toDir = (p: string): string => {
    const base = path.basename(p);
    return /\.[A-Za-z0-9]+$/.test(base) ? path.dirname(p) : p;
  };

  // 1. Explicit `Worktree: ` line (strongest signal). Tolerates **bold** and backticks.
  const wt = markdown.match(/^\s*(?:[-*]\s*)?(?:\*\*)?\s*Worktree:?\s*(?:\*\*)?\s*`?\s*(~?\/?[^`\s,)]+)/im);
  if (wt && wt[1]) {
    const p = expand(wt[1]);
    if (path.isAbsolute(p)) return path.resolve(toDir(p));
  }

  // 2. First home-rooted path anywhere (inside backticks or bare). Matches
  //    `~/dev/...`, `/home/<user>/...`, `/Users/<user>/...`.
  const generic = markdown.match(/(~\/[^\s`,)]+|\/(?:home|Users)\/[^\s`,)]+)/);
  if (generic && generic[1]) {
    const p = expand(generic[1]);
    if (path.isAbsolute(p)) return path.resolve(toDir(p));
  }

  return null;
}
