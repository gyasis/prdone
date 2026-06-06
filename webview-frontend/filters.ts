// Pure functions for sidebar tile filtering and sorting.
// No DOM, no side effects. Tested via the manual acceptance walkthrough; could
// add unit tests later if the logic grows.

import type { Prd, Tier } from '../src/types';

export type FilterMode = 'all' | 'stale' | 'open' | 'resolved' | 'tier';

export interface FilterState {
  mode: FilterMode;
  tier?: Tier;
  search: string;
  sort: 'age-desc' | 'age-asc';
  /**
   * Active tag filters keyed by namespace.
   * - Within a namespace: OR (any tag matches)
   * - Across namespaces: AND (every active namespace must match)
   * Empty / undefined = no tag filtering.
   */
  tagFilters?: Record<string, Set<string>>;
}

export function applyFilters(prds: Prd[], state: FilterState): Prd[] {
  let out = prds;

  switch (state.mode) {
    case 'stale':
      out = out.filter(p => p.stale);
      break;
    case 'open':
      // Everything that's still actionable. Excludes RESOLVED; includes
      // ACTIVE + DRAFT. The default "real work" view.
      out = out.filter(p => p.status !== 'RESOLVED');
      break;
    case 'resolved':
      out = out.filter(p => p.status === 'RESOLVED');
      break;
    case 'tier':
      if (state.tier) out = out.filter(p => p.tier === state.tier);
      break;
    case 'all':
    default:
      // pass-through
      break;
  }

  // Tag filters: AND across namespaces, OR within namespace
  if (state.tagFilters) {
    const active = Object.entries(state.tagFilters).filter(([, s]) => s.size > 0);
    if (active.length > 0) {
      out = out.filter(p => {
        const tagSet = new Set(
          (p.tags || '').split(',').map(t => t.trim()).filter(Boolean)
        );
        return active.every(([ns, values]) => {
          for (const v of values) {
            if (tagSet.has(`${ns}:${v}`)) return true;
          }
          return false;
        });
      });
    }
  }

  const q = state.search.trim().toLowerCase();
  if (q.length > 0) {
    out = out.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.tags.toLowerCase().includes(q) ||
      p.context.toLowerCase().includes(q)
    );
  }

  // Sort age desc by default. Stable sort: array.sort() is stable in V8.
  out = out.slice().sort((a, b) =>
    state.sort === 'age-asc' ? a.age_days - b.age_days : b.age_days - a.age_days
  );

  return out;
}

export function defaultFilterState(): FilterState {
  return { mode: 'all', search: '', sort: 'age-desc' };
}
