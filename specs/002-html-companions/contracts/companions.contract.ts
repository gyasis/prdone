/**
 * Spec 002 — HTML Companion PRDs
 * Canonical TypeScript types for the `companions` field that appears on every
 * PRD entry produced by `prd summary --json`.
 *
 * Consumers:
 *  - prdone VSCode extension (sidebar tile grid + browser kanban + Gallery view)
 *  - any future tool that ingests `prd summary --json`
 *
 * Source of truth: see ../data-model.md
 */

/**
 * Known companion file types. The `prd` CLI is open to new types over time
 * (data-model.md §1 — extensibility); add a new key here when a new type is
 * introduced. Readers MUST treat unknown keys as opaque — do not crash on them.
 */
export type CompanionType =
  | 'html'    // Spec 002 — visual design PRD (Pharos-style)
  | 'pdf'     // future — printable export
  | 'pptx'    // future — slide deck export
  | 'ipynb';  // future — Jupyter notebook companion

/**
 * Map of companion type → absolute path on disk to the companion file.
 *
 * Invariants enforced by `prd doctor`:
 *  - Every key is a valid CompanionType (or unknown / forward-compat).
 *  - Every value is an absolute path that EXISTS on disk.
 *  - The companion file shares the same base descriptor + date as the parent
 *    MD index, only the extension differs.
 *
 * Example:
 *   {
 *     html: "/home/me/dev/prd/scratch/pharos_v1_2026-05-22.html"
 *   }
 *
 * A PRD with no companions has `companions: null` OR the field is absent
 * entirely. Both forms MUST be accepted by readers.
 */
export type Companions = {
  [K in CompanionType]?: string;
};

/**
 * The PRD tier — where the entry lives on disk.
 * Per ~/.claude/rules/domains/plan-persistence.md.
 */
export type PrdTier = 'scratch' | 'archive' | 'library';

/**
 * The PRD status field. New states may be added over time; readers should
 * default unknown statuses to "open" for UI rendering safety.
 */
export type PrdStatus =
  | 'open'
  | 'blocked'
  | 'resolved'
  | 'archived'
  | 'graduated';

/**
 * A single PRD entry as returned by `prd summary --json`.
 *
 * NOTE: Spec 002 ADDS `companions` to this interface. Older entries on disk
 * may lack the field. Readers MUST handle both cases (see helpers below).
 */
export interface PrdEntry {
  id: string;
  tier: PrdTier;
  path: string;            // absolute path to .md
  title: string;
  status: PrdStatus;
  descriptor: string;      // <3-word-descriptor>[_<feature-suffix>]
  created: string;         // ISO date (YYYY-MM-DD)

  /**
   * Spec 002 addition. Optional + nullable to preserve back-compat with
   * pre-Spec-002 entries.
   */
  companions?: Companions | null;

  // ... existing fields preserved verbatim by the CLI (branch_at_creation,
  // owner_path, session_origin, ephemeral_marker, etc.).
  [key: string]: unknown;
}

/**
 * Top-level output shape from `prd summary --json`.
 */
export type PrdSummaryJson = PrdEntry[];

/**
 * Helpers — recommended for consumers (prdone webview, etc.).
 * Keep these tiny + correct; the back-compat handling matters.
 */

export function getCompanions(entry: PrdEntry): Companions {
  return entry.companions ?? {};
}

export function getCompanionPath(
  entry: PrdEntry,
  type: CompanionType,
): string | null {
  return entry.companions?.[type] ?? null;
}

export function hasCompanion(entry: PrdEntry, type: CompanionType): boolean {
  return getCompanionPath(entry, type) !== null;
}

export function getCompanionTypes(entry: PrdEntry): CompanionType[] {
  return Object.keys(getCompanions(entry)) as CompanionType[];
}

/**
 * UI hint — what icon glyph to render in the tile footer for each companion
 * type. The kanban + sidebar both use this so the iconography stays consistent.
 */
export const COMPANION_GLYPHS: Record<CompanionType, string> = {
  html: '🌐',
  pdf: '📕',
  pptx: '📊',
  ipynb: '📓',
};

/**
 * MD itself is always present and gets its own glyph in the tile footer.
 * Convention: render MD first, then companion glyphs in CompanionType order.
 */
export const MD_GLYPH = '📄';
