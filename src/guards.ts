// Hand-written type guards at every cross-process boundary.
// Constitution Principle V: Type-Safe JSON Boundaries.
// No Zod, no io-ts — one CLI we control, one schema (data-model.md).

import type {
  Prd,
  WebviewAction,
  ExtensionResponse,
  KanbanApiPayload
} from './types';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isAbsolutePath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false;
  // POSIX
  if (p.startsWith('/')) return true;
  // Windows drive letter (C:\..., C:/...) or UNC (\\server\share)
  if (/^[A-Za-z]:[\\/]/.test(p)) return true;
  if (p.startsWith('\\\\')) return true;
  return false;
}

export function isPrd(x: unknown): x is Prd {
  if (!isObject(x)) return false;
  if (typeof x.id !== 'string' || x.id.length === 0) return false;
  if (typeof x.title !== 'string') return false;
  if (typeof x.path !== 'string') return false;
  if (x.tier !== 'scratch' && x.tier !== 'archive' && x.tier !== 'library') return false;
  if (x.status !== 'ACTIVE' && x.status !== 'RESOLVED' && x.status !== 'DRAFT') return false;
  if (typeof x.age_days !== 'number' || x.age_days < 0) return false;
  if (typeof x.ephemeral !== 'string') return false;
  if (typeof x.context !== 'string') return false;
  if (typeof x.decisions !== 'number') return false;
  if (typeof x.subagents !== 'number') return false;
  if (
    x.significance !== null &&
    (typeof x.significance !== 'number' || x.significance < 0 || x.significance > 100)
  ) return false;
  if (typeof x.tags !== 'string') return false;
  if (typeof x.stale !== 'boolean') return false;
  if (x.pinned !== undefined && typeof x.pinned !== 'boolean') return false;
  if (x.parent !== undefined && x.parent !== null && typeof x.parent !== 'string') return false;
  if (
    x.children !== undefined &&
    (!Array.isArray(x.children) || !x.children.every(c => typeof c === 'string'))
  ) return false;
  if (x.relations !== undefined) {
    if (!Array.isArray(x.relations)) return false;
    const validTypes = new Set(['parent','child','blocks','blocked-by','supersedes','superseded-by','relates-to']);
    for (const r of x.relations) {
      if (!isObject(r)) return false;
      const rr = r as Record<string, unknown>;
      if (typeof rr.type !== 'string' || !validTypes.has(rr.type)) return false;
      if (typeof rr.slug !== 'string' || rr.slug.length === 0) return false;
      if (rr.reason !== undefined && typeof rr.reason !== 'string') return false;
    }
  }
  // Spec 002 — validate optional companions field.
  // Shape: { html?: absPath, pdf?: absPath, pptx?: absPath, ipynb?: absPath }
  // Unknown keys are tolerated (forward-compat) but ignored.
  if (x.companions !== undefined && x.companions !== null) {
    if (!isObject(x.companions)) return false;
    const knownCompanionTypes = new Set(['html', 'pdf', 'pptx', 'ipynb']);
    for (const [key, val] of Object.entries(x.companions)) {
      if (!knownCompanionTypes.has(key)) continue; // forward-compat: ignore unknown keys
      if (!isAbsolutePath(val)) return false;
    }
  }
  return true;
}

export function isWebviewAction(x: unknown): x is WebviewAction {
  if (!isObject(x)) return false;
  switch (x.type) {
    case 'OPEN_FILE':
      return (
        isObject(x.payload) &&
        isAbsolutePath((x.payload as { path: unknown }).path)
      );
    case 'COPY_COMMAND':
      return (
        isObject(x.payload) &&
        typeof (x.payload as { command: unknown }).command === 'string' &&
        ((x.payload as { command: string }).command).length > 0
      );
    case 'RETRY_CONNECTION':
      return isObject(x.payload);
    case 'OPEN_SETTINGS':
      return (
        isObject(x.payload) &&
        typeof (x.payload as { setting: unknown }).setting === 'string' &&
        ((x.payload as { setting: string }).setting).length > 0
      );
    case 'OPEN_KANBAN':
      return isObject(x.payload);
    case 'REFRESH':
      return isObject(x.payload);
    case 'WEBVIEW_READY':
      return x.payload === undefined || isObject(x.payload);
    case 'EXECUTE_CLI':
      return (
        isObject(x.payload) &&
        Array.isArray((x.payload as { argv: unknown }).argv) &&
        ((x.payload as { argv: unknown[] }).argv).every(a => typeof a === 'string')
      );
    case 'OPEN_HTML_COMPANION':
      return (
        isObject(x.payload) &&
        isAbsolutePath((x.payload as { path: unknown }).path) &&
        typeof (x.payload as { title: unknown }).title === 'string' &&
        ((x.payload as { title: string }).title).length > 0
      );
    default:
      return false;
  }
}

export function isExtensionResponse(x: unknown): x is ExtensionResponse {
  if (!isObject(x)) return false;
  if (x.type === 'SYNC_DATA') {
    return Array.isArray(x.payload) && x.payload.every(isPrd);
  }
  if (x.type === 'SHOW_ERROR') {
    if (!isObject(x.payload)) return false;
    const p = x.payload as { message: unknown; raw?: unknown };
    if (typeof p.message !== 'string') return false;
    if (p.raw !== undefined && typeof p.raw !== 'string') return false;
    return true;
  }
  return false;
}

export function isKanbanApiPayload(x: unknown): x is KanbanApiPayload {
  if (!isObject(x)) return false;
  if (x.ok === true) {
    return Array.isArray(x.prds) && x.prds.every(isPrd);
  }
  if (x.ok === false) {
    if (typeof x.message !== 'string') return false;
    if (x.raw !== undefined && typeof x.raw !== 'string') return false;
    return true;
  }
  return false;
}
