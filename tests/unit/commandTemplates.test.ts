// Tier-aware action-command contract per data-model.md §"Entity: ActionCommand".

import { describe, it, expect } from 'vitest';
import { actionCommandsFor } from '../../src/actions/commandTemplates';
import type { Prd } from '../../src/types';

const basePrd: Prd = {
  id: 'sample_2026-05-01',
  title: 'Sample',
  path: '/home/u/dev/prd/scratch/sample_2026-05-01.md',
  tier: 'scratch',
  status: 'ACTIVE',
  age_days: 1,
  ephemeral: '',
  context: '',
  decisions: 0,
  subagents: 0,
  significance: null,
  tags: '',
  stale: false
};

describe('actionCommandsFor', () => {
  describe('common commands (always present)', () => {
    it('always includes open-file, checkout, log-note, log-decision', () => {
      const cmds = actionCommandsFor(basePrd);
      const kinds = cmds.map(c => c.kind);
      expect(kinds).toContain('open-file');
      expect(kinds).toContain('checkout');
      expect(kinds).toContain('log-note');
      expect(kinds).toContain('log-decision');
    });

    it('open-file uses code <path>', () => {
      const cmds = actionCommandsFor(basePrd);
      const open = cmds.find(c => c.kind === 'open-file');
      expect(open?.command).toBe(`code "${basePrd.path}"`);
    });

    it('checkout uses /prd-checkout slash command', () => {
      const cmds = actionCommandsFor(basePrd);
      const checkout = cmds.find(c => c.kind === 'checkout');
      expect(checkout?.command).toBe(`/prd-checkout ${basePrd.id}`);
    });
  });

  describe('scratch tier', () => {
    it('returns 5 commands when ACTIVE (adds resolve)', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'scratch', status: 'ACTIVE' });
      expect(cmds).toHaveLength(5);
      expect(cmds.map(c => c.kind)).toContain('resolve');
    });

    it('returns 4 commands when DRAFT (no resolve)', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'scratch', status: 'DRAFT' });
      expect(cmds).toHaveLength(4);
      expect(cmds.map(c => c.kind)).not.toContain('resolve');
    });

    it('returns 4 commands when RESOLVED (no resolve again)', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'scratch', status: 'RESOLVED' });
      expect(cmds).toHaveLength(4);
      expect(cmds.map(c => c.kind)).not.toContain('resolve');
    });

    it('resolve command uses --reason placeholder', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'scratch', status: 'ACTIVE' });
      const resolve = cmds.find(c => c.kind === 'resolve');
      expect(resolve?.command).toBe(`prd resolve ${basePrd.id} --reason "..."`);
    });
  });

  describe('archive tier', () => {
    it('returns 5 commands (adds graduate, no resolve)', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'archive', status: 'RESOLVED' });
      expect(cmds).toHaveLength(5);
      const kinds = cmds.map(c => c.kind);
      expect(kinds).toContain('graduate');
      expect(kinds).not.toContain('resolve');
    });

    it('graduate command uses just the id', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'archive', status: 'RESOLVED' });
      const graduate = cmds.find(c => c.kind === 'graduate');
      expect(graduate?.command).toBe(`prd graduate ${basePrd.id}`);
    });
  });

  describe('library tier', () => {
    it('returns only the 4 common commands (terminal state)', () => {
      const cmds = actionCommandsFor({ ...basePrd, tier: 'library', status: 'RESOLVED' });
      expect(cmds).toHaveLength(4);
      const kinds = cmds.map(c => c.kind);
      expect(kinds).not.toContain('resolve');
      expect(kinds).not.toContain('graduate');
    });
  });

  describe('label vs command separation', () => {
    it('every command has a non-empty label distinct from its command string', () => {
      const cmds = actionCommandsFor(basePrd);
      for (const c of cmds) {
        expect(c.label.length).toBeGreaterThan(0);
        expect(c.label).not.toBe(c.command);
      }
    });
  });
});
