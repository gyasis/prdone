// Boundary type-guard coverage. Per Constitution Principle V: every JSON
// crossing has a hand-written guard; these tests verify the predicates do the
// stated job.

import { describe, it, expect } from 'vitest';
import {
  isPrd,
  isWebviewAction,
  isExtensionResponse,
  isKanbanApiPayload,
  isAbsolutePath
} from '../../src/guards';

const validPrd = {
  id: 'cdia_append_only_safety_2026-05-02',
  title: 'CDIA append-only safety',
  path: '/home/user/dev/prd/scratch/cdia_append_only_safety_2026-05-02.md',
  tier: 'scratch',
  status: 'ACTIVE',
  age_days: 5,
  ephemeral: 'delete after PR #161 merged + 14d clean',
  context: 'Cube exposes CDIA scoring rows...',
  decisions: 7,
  subagents: 1,
  significance: null,
  tags: '',
  stale: false
};

describe('isPrd', () => {
  it('accepts a valid Prd', () => {
    expect(isPrd(validPrd)).toBe(true);
  });

  it('accepts optional parent and children', () => {
    expect(isPrd({ ...validPrd, parent: 'some_other_prd', children: ['child_a'] })).toBe(true);
  });

  it('rejects null', () => expect(isPrd(null)).toBe(false));
  it('rejects undefined', () => expect(isPrd(undefined)).toBe(false));
  it('rejects empty object', () => expect(isPrd({})).toBe(false));

  it('rejects empty id', () => {
    expect(isPrd({ ...validPrd, id: '' })).toBe(false);
  });

  it('rejects unknown tier', () => {
    expect(isPrd({ ...validPrd, tier: 'foo' })).toBe(false);
  });

  it('rejects unknown status', () => {
    expect(isPrd({ ...validPrd, status: 'PENDING' })).toBe(false);
  });

  it('rejects negative age_days', () => {
    expect(isPrd({ ...validPrd, age_days: -1 })).toBe(false);
  });

  it('rejects significance > 100', () => {
    expect(isPrd({ ...validPrd, significance: 101 })).toBe(false);
  });

  it('rejects significance < 0', () => {
    expect(isPrd({ ...validPrd, significance: -1 })).toBe(false);
  });

  it('accepts significance 0 and 100 (inclusive)', () => {
    expect(isPrd({ ...validPrd, significance: 0 })).toBe(true);
    expect(isPrd({ ...validPrd, significance: 100 })).toBe(true);
  });

  it('rejects non-string tags', () => {
    expect(isPrd({ ...validPrd, tags: ['a', 'b'] })).toBe(false);
  });

  it('rejects non-boolean stale', () => {
    expect(isPrd({ ...validPrd, stale: 'no' })).toBe(false);
  });

  it('rejects malformed children array', () => {
    expect(isPrd({ ...validPrd, children: ['ok', 42] })).toBe(false);
  });
});

describe('isAbsolutePath', () => {
  it('accepts POSIX paths', () => {
    expect(isAbsolutePath('/home/user/file.md')).toBe(true);
  });

  it('accepts Windows drive paths', () => {
    expect(isAbsolutePath('C:\\Users\\file.md')).toBe(true);
    expect(isAbsolutePath('D:/Users/file.md')).toBe(true);
  });

  it('accepts UNC paths', () => {
    expect(isAbsolutePath('\\\\server\\share\\file.md')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isAbsolutePath('./relative/path.md')).toBe(false);
    expect(isAbsolutePath('relative/path.md')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isAbsolutePath('')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isAbsolutePath(42)).toBe(false);
    expect(isAbsolutePath(null)).toBe(false);
  });
});

describe('isWebviewAction', () => {
  it('accepts OPEN_FILE with absolute path', () => {
    expect(isWebviewAction({ type: 'OPEN_FILE', payload: { path: '/abs/path.md' } })).toBe(true);
  });

  it('rejects OPEN_FILE with relative path', () => {
    expect(isWebviewAction({ type: 'OPEN_FILE', payload: { path: './rel.md' } })).toBe(false);
  });

  it('accepts COPY_COMMAND with non-empty string', () => {
    expect(isWebviewAction({ type: 'COPY_COMMAND', payload: { command: 'prd resolve foo' } })).toBe(true);
  });

  it('rejects COPY_COMMAND with empty string', () => {
    expect(isWebviewAction({ type: 'COPY_COMMAND', payload: { command: '' } })).toBe(false);
  });

  it('accepts RETRY_CONNECTION', () => {
    expect(isWebviewAction({ type: 'RETRY_CONNECTION', payload: {} })).toBe(true);
  });

  it('accepts OPEN_SETTINGS with non-empty setting', () => {
    expect(isWebviewAction({ type: 'OPEN_SETTINGS', payload: { setting: 'prd.binaryPath' } })).toBe(true);
  });

  it('rejects OPEN_SETTINGS with empty setting', () => {
    expect(isWebviewAction({ type: 'OPEN_SETTINGS', payload: { setting: '' } })).toBe(false);
  });

  it('accepts EXECUTE_CLI structurally (rejection happens at handler, not at boundary)', () => {
    expect(isWebviewAction({ type: 'EXECUTE_CLI', payload: { argv: ['prd', 'resolve'] } })).toBe(true);
  });

  it('rejects EXECUTE_CLI with non-string argv element', () => {
    expect(isWebviewAction({ type: 'EXECUTE_CLI', payload: { argv: ['prd', 42] } })).toBe(false);
  });

  it('rejects unknown action type', () => {
    expect(isWebviewAction({ type: 'BOGUS', payload: {} })).toBe(false);
  });
});

describe('isExtensionResponse', () => {
  it('accepts SYNC_DATA with all-valid Prds', () => {
    expect(isExtensionResponse({ type: 'SYNC_DATA', payload: [validPrd] })).toBe(true);
  });

  it('accepts SYNC_DATA with empty array (success, empty state)', () => {
    expect(isExtensionResponse({ type: 'SYNC_DATA', payload: [] })).toBe(true);
  });

  it('rejects SYNC_DATA with one invalid Prd', () => {
    expect(isExtensionResponse({ type: 'SYNC_DATA', payload: [validPrd, { id: 'bad' }] })).toBe(false);
  });

  it('accepts SHOW_ERROR with message only', () => {
    expect(isExtensionResponse({ type: 'SHOW_ERROR', payload: { message: 'oops' } })).toBe(true);
  });

  it('accepts SHOW_ERROR with raw', () => {
    expect(isExtensionResponse({ type: 'SHOW_ERROR', payload: { message: 'oops', raw: 'stderr...' } })).toBe(true);
  });

  it('rejects SHOW_ERROR with non-string raw', () => {
    expect(isExtensionResponse({ type: 'SHOW_ERROR', payload: { message: 'oops', raw: 42 } })).toBe(false);
  });
});

describe('isKanbanApiPayload', () => {
  it('accepts ok=true with valid Prds', () => {
    expect(isKanbanApiPayload({ ok: true, prds: [validPrd] })).toBe(true);
  });

  it('accepts ok=true with empty prds', () => {
    expect(isKanbanApiPayload({ ok: true, prds: [] })).toBe(true);
  });

  it('accepts ok=false with message', () => {
    expect(isKanbanApiPayload({ ok: false, message: 'nope' })).toBe(true);
  });

  it('accepts ok=false with message + raw', () => {
    expect(isKanbanApiPayload({ ok: false, message: 'nope', raw: 'stderr' })).toBe(true);
  });

  it('rejects truthy ok with bad prds element', () => {
    expect(isKanbanApiPayload({ ok: true, prds: [{ id: 'bad' }] })).toBe(false);
  });

  it('rejects missing ok field', () => {
    expect(isKanbanApiPayload({ prds: [] })).toBe(false);
  });
});
