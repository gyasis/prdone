import { describe, it, expect } from 'vitest';
import { rankCandidates, extractProjectHint } from '../../src/lib/resolveStartPath';

const HOME = '/home/tester';

describe('rankCandidates', () => {
  it('ranks worktree → main-repo → prd-owner → current in a linked worktree below root', () => {
    const info = rankCandidates({
      fromDir: '/wt/proj/models/sub',
      worktreeRoot: '/wt/proj',
      mainRepoRoot: '/main/proj',
      linkedWorktree: true,
      prdOwnerDir: '/wt/proj/.scope-owner-parent',
    });
    expect(info.candidates.map(c => c.kind)).toEqual(['worktree', 'main-repo', 'prd-owner', 'current']);
    expect(info.candidates[0].path).toBe('/wt/proj');
    expect(info.candidates[0].label).toBe('worktree');
    expect(info.belowRoot).toBe(true);
  });

  it('labels the top candidate "git root" in a main (non-linked) checkout and omits main-repo', () => {
    const info = rankCandidates({
      fromDir: '/repo/a/b',
      worktreeRoot: '/repo',
      mainRepoRoot: null,
      linkedWorktree: false,
      prdOwnerDir: null,
    });
    expect(info.candidates.map(c => c.kind)).toEqual(['git-root', 'current']);
    expect(info.candidates[0].label).toBe('git root');
    expect(info.belowRoot).toBe(true);
  });

  it('drops the current entry (and reports belowRoot=false) when fromDir IS the root', () => {
    const info = rankCandidates({
      fromDir: '/repo',
      worktreeRoot: '/repo',
      mainRepoRoot: null,
      linkedWorktree: false,
      prdOwnerDir: null,
    });
    expect(info.candidates).toHaveLength(1);
    expect(info.candidates[0].kind).toBe('git-root');
    expect(info.belowRoot).toBe(false);
  });

  it('falls back to only the current folder when there is no git repo and no sentinel', () => {
    const info = rankCandidates({
      fromDir: '/some/random/dir',
      worktreeRoot: null,
      mainRepoRoot: null,
      linkedWorktree: false,
      prdOwnerDir: null,
    });
    expect(info.candidates).toHaveLength(1);
    expect(info.candidates[0].kind).toBe('current');
    expect(info.belowRoot).toBe(false);
  });

  it('dedupes when the prd-owner dir equals the git root', () => {
    const info = rankCandidates({
      fromDir: '/repo/x',
      worktreeRoot: '/repo',
      mainRepoRoot: null,
      linkedWorktree: false,
      prdOwnerDir: '/repo',
    });
    expect(info.candidates.map(c => c.path)).toEqual(['/repo', '/repo/x']);
    expect(info.candidates.map(c => c.kind)).toEqual(['git-root', 'current']);
  });
});

describe('extractProjectHint', () => {
  it('prefers an explicit Worktree line and expands ~', () => {
    const md = [
      '# Handoff — do the thing',
      '',
      'Worktree: `~/dev/v3/worktrees/quality-funnel-v3`, branch `feature/x`',
    ].join('\n');
    expect(extractProjectHint(md, HOME)).toBe('/home/tester/dev/v3/worktrees/quality-funnel-v3');
  });

  it('handles a **bold** Worktree label', () => {
    const md = '**Worktree:** `~/dev/a/b`';
    expect(extractProjectHint(md, HOME)).toBe('/home/tester/dev/a/b');
  });

  it('reduces a file path to its directory when no Worktree line exists', () => {
    const md = '## Read first\n- `~/dev/proj/models/staging/x.sql` — the model';
    expect(extractProjectHint(md, HOME)).toBe('/home/tester/dev/proj/models/staging');
  });

  it('matches a bare /home/<user> path', () => {
    const md = 'see /home/bob/dev/thing/notes.md for context';
    expect(extractProjectHint(md, HOME)).toBe('/home/bob/dev/thing');
  });

  it('returns null when there is no usable path hint', () => {
    expect(extractProjectHint('# Handoff\nNothing pathy here.', HOME)).toBeNull();
    expect(extractProjectHint('', HOME)).toBeNull();
  });
});
