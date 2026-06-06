// Canonical types for the PRD Visualizer extension.
// Source of truth: specs/001-prd-visualizer/data-model.md
// Every cross-process boundary in the codebase MUST validate incoming data
// against the corresponding type guard in ./guards.ts before use (FR-016).

export type Tier = 'scratch' | 'archive' | 'library';

export type Status = 'ACTIVE' | 'RESOLVED' | 'DRAFT';

export interface Prd {
  id: string;
  title: string;
  path: string;
  tier: Tier;
  status: Status;
  age_days: number;
  ephemeral: string;
  context: string;
  decisions: number;
  subagents: number;
  significance: number | null;
  tags: string;
  stale: boolean;
  /** True when this PRD's path is listed in <workspace>/.memory/active-prds.json. */
  pinned?: boolean;
  parent?: string | null;
  children?: string[];
  /** Typed edges from `## Relations` JSON block. Emitted by `prd summary --with-tree`.
   *  Contains parent/child entries too (redundant with the legacy scalars above)
   *  PLUS blocks, blocked-by, supersedes, superseded-by, relates-to. */
  relations?: PrdRelation[];
  /**
   * Spec 002 — companion artifacts paired with this PRD's .md.
   * Map of companion type ('html' | 'pdf' | 'pptx' | 'ipynb') → absolute path.
   * Each companion shares the same base descriptor + date as the .md, only the
   * extension differs. `null` or absent for MD-only PRDs.
   * Source: `prd summary --json` (CLI scans tier dir for paired-name siblings).
   */
  companions?: Companions | null;
}

/**
 * Spec 002 — companion file types (HTML / PDF / PPTX / IPYNB) for a PRD.
 * Keys map to absolute file paths. See specs/002-html-companions/data-model.md §1.
 */
export type CompanionType = 'html' | 'pdf' | 'pptx' | 'ipynb';
export type Companions = {
  [K in CompanionType]?: string;
};

export interface PrdRelation {
  type: 'parent' | 'child' | 'blocks' | 'blocked-by' | 'supersedes' | 'superseded-by' | 'relates-to';
  slug: string;
  reason?: string;
}

export type WebviewAction =
  | { type: 'OPEN_FILE'; payload: { path: string } }
  | { type: 'COPY_COMMAND'; payload: { command: string } }
  | { type: 'RETRY_CONNECTION'; payload: Record<string, never> }
  | { type: 'OPEN_SETTINGS'; payload: { setting: string } }
  | { type: 'OPEN_KANBAN'; payload: Record<string, never> }
  | { type: 'REFRESH'; payload: Record<string, never> }
  | { type: 'WEBVIEW_READY'; payload?: Record<string, never> }
  | { type: 'EXECUTE_CLI'; payload: { argv: string[] } }
  /**
   * Spec 002 — open an HTML companion in a sandboxed VSCode WebviewPanel.
   * The handler reads the file, wraps it in a CSP-bounded shell with a
   * top-right "↗ Open in Browser" button, and presents it as a new tab.
   */
  | { type: 'OPEN_HTML_COMPANION'; payload: { path: string; title: string } };

export type ExtensionResponse =
  | { type: 'SYNC_DATA'; payload: Prd[] }
  | { type: 'SHOW_ERROR'; payload: { message: string; raw?: string } };

export type KanbanApiPayload =
  | { ok: true; prds: Prd[] }
  | { ok: false; message: string; raw?: string };

export interface ActionCommand {
  label: string;
  command: string;
  kind: 'open-file' | 'checkout' | 'log-note' | 'log-decision' | 'resolve' | 'graduate';
}
