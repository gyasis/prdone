// Tile-grid renderer for the sidebar webview.
// T021 (wave 3): full renderTile() port from design/sidebar.html.
// T027 (wave 2 — landed): empty-state messaging.
// T032 (wave 3): tile-click → openDetail wiring.

import type { Prd } from '../src/types';
import { openDetail } from './sidePanel';

export interface TileGridState {
  /** PRDs visible after filters applied. */
  prds: Prd[];
  /** Total PRDs before filters (for "no PRDs match" vs "no PRDs found" disambiguation). */
  totalBeforeFilter: number;
  /**
   * §5c: complete unfiltered PRD list, used by the side-panel detail graph
   * so a PRD's parent / children / siblings still resolve even when the
   * current filter would have hidden them. Falls back to `prds` if absent.
   */
  allPrds?: Prd[];
}

/** vscode webview-api glue. The webview gets `acquireVsCodeApi()` injected by the host. */
export interface VSCodeApi {
  postMessage(message: unknown): void;
}

let vscodeApi: VSCodeApi | null = null;

export function setVSCodeApi(api: VSCodeApi): void {
  vscodeApi = api;
}

export function getVSCodeApi(): VSCodeApi | null {
  return vscodeApi;
}

export function renderTileGrid(container: HTMLElement, state: TileGridState): void {
  if (state.prds.length === 0) {
    renderEmptyState(container, state.totalBeforeFilter);
    return;
  }

  // Pinned PRDs float to the top; preserve incoming order otherwise.
  const ordered = [...state.prds].sort((a, b) => {
    const ap = a.pinned ? 0 : 1;
    const bp = b.pinned ? 0 : 1;
    return ap - bp;
  });
  // Re-bind the click target to the reordered array.
  state = { ...state, prds: ordered };

  container.innerHTML = ordered.map((p, i) => renderTile(p, i)).join('');

  // Wire tile-click → openDetail. Tiles are tabindex=0 so keyboard nav works.
  container.querySelectorAll<HTMLElement>('.tile').forEach((el) => {
    const open = () => {
      const idx = Number(el.dataset.idx ?? '0');
      const prd = state.prds[idx];
      if (prd) openDetail(prd, state.allPrds ?? state.prds);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open();
      }
    });
  });

  // Spec 002 — wire companion-icon click handlers.
  // Click on 📄 → OPEN_FILE; click on 🌐/📕/📊/📓 → OPEN_HTML_COMPANION (or
  // generic OPEN_FILE for non-html types until they get dedicated handlers).
  // Crucially, stopPropagation prevents the tile's own click handler from also
  // firing and opening the side-panel drawer.
  container.querySelectorAll<HTMLElement>('.companion-icon').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const api = getVSCodeApi();
      if (!api) return;
      const type = btn.dataset.companionType;
      const path = btn.dataset.companionPath;
      const title = btn.dataset.companionTitle ?? path ?? '';
      if (!path) return;
      if (type === 'html') {
        api.postMessage({ type: 'OPEN_HTML_COMPANION', payload: { path, title } });
      } else {
        // MD / PDF / PPTX / IPYNB → just open in the OS default app via OPEN_FILE.
        api.postMessage({ type: 'OPEN_FILE', payload: { path } });
      }
    });
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        btn.click();
      }
    });
  });
}

// Tag rendering — shared across tile + drawer + kanban (P4 of tag-ontology PRD)
// Priority order chosen so the sidebar's cramped 3-pill cap surfaces the most
// actionable signal first: work-type > clinical-domain > payor > jira > repo.
const TAG_PRIORITY = ['type', 'domain', 'payor', 'jira', 'repo'] as const;

export function parseTag(t: string): { ns: string | null; value: string } {
  if (t.includes(':')) {
    const idx = t.indexOf(':');
    return { ns: t.slice(0, idx), value: t.slice(idx + 1) };
  }
  return { ns: null, value: t };
}

export function splitTags(csv: string): string[] {
  if (!csv) return [];
  return csv.split(',').map(t => t.trim()).filter(Boolean);
}

export function sortTagsByPriority(tags: string[]): string[] {
  const rank = (t: string): number => {
    const { ns } = parseTag(t);
    if (!ns) return TAG_PRIORITY.length + 1; // free-form last
    const i = TAG_PRIORITY.indexOf(ns as typeof TAG_PRIORITY[number]);
    return i === -1 ? TAG_PRIORITY.length : i;
  };
  return [...tags].sort((a, b) => rank(a) - rank(b));
}

function renderTagPill(tag: string): string {
  const { ns, value } = parseTag(tag);
  const nsAttr = ns ? `data-ns="${escape(ns)}"` : '';
  const nsPrefix = ns ? `<span class="tag-ns">${escape(ns)}:</span>` : '';
  return `<span class="tag-pill" ${nsAttr}>${nsPrefix}${escape(value)}</span>`;
}

function renderTileTags(prd: Prd, maxPills = 3): string {
  const tags = splitTags(prd.tags);
  if (tags.length === 0) return '';
  const sorted = sortTagsByPriority(tags);
  const visible = sorted.slice(0, maxPills);
  const overflow = sorted.slice(maxPills);
  const pills = visible.map(renderTagPill).join('');
  const overflowPill = overflow.length > 0
    ? `<span class="tag-pill overflow" title="${escape(overflow.join(', '))}">+${overflow.length} more</span>`
    : '';
  return `<div class="tag-row">${pills}${overflowPill}</div>`;
}

function renderTile(prd: Prd, idx: number): string {
  const sigBlock =
    prd.significance !== null
      ? `<span class="sig"><span>sig</span><span class="sig-bar"><span style="width:${prd.significance}%"></span></span><span>${prd.significance}</span></span>`
      : '';
  const ephemBlock = prd.ephemeral
    ? `<div class="ephemeral">⏱ ${escape(prd.ephemeral)}</div>`
    : '';
  const staleTag = prd.stale ? `<span class="stale-tag">stale</span>` : '';
  const pinBadge = prd.pinned ? `<span class="pin-badge" title="Active PRD in this workspace">📌</span>` : '';
  const companionRow = renderCompanionIconRow(prd);

  return `
    <article class="tile ${prd.tier} ${prd.stale ? 'stale' : ''} ${prd.pinned ? 'pinned' : ''}" data-idx="${idx}" data-tier="${prd.tier}" data-stale="${prd.stale}" data-pinned="${prd.pinned ? 'true' : 'false'}" tabindex="0">
      <div class="meta-top">
        ${pinBadge}
        <span class="tier-glyph">${tierGlyph(prd.tier)}</span>
        <span class="age">${ageStr(prd.age_days)}</span>
        <span class="pill ${statusPill(prd.status)}">${prd.status}</span>
        ${staleTag}
      </div>
      <div class="title">${escape(prd.title)}</div>
      ${renderTileTags(prd)}
      <div class="ctx">${escape(prd.context)}</div>
      <div class="meta-row">
        <span><span class="glyph">◆</span> ${prd.decisions}</span>
        <span><span class="glyph">▣</span> ${prd.subagents}</span>
        ${sigBlock}
      </div>
      ${ephemBlock}
      ${companionRow}
    </article>`;
}

/**
 * Spec 002 — companion icon row at the bottom of each tile.
 * Always shows 📄 MD (the index file). Adds 🌐 HTML, 📕 PDF, 📊 PPTX, 📓 IPYNB
 * when the corresponding companion exists in `prd.companions`.
 * Each icon is a button that posts an action to the extension host on click.
 *
 * The row is wrapped in `<div class="companion-row">` so CSS can style it
 * consistently with the rest of the tile chrome.
 */
export function renderCompanionIconRow(prd: Prd): string {
  // Always render the MD icon (the .md is the index file, always present).
  const icons: string[] = [
    `<button type="button" class="companion-icon" data-companion-type="md" data-companion-path="${escape(prd.path)}" title="Open ${escape(prd.id)}.md in editor" aria-label="Open Markdown index">📄</button>`,
  ];

  const companions = prd.companions ?? {};
  // Render in canonical order (html → pdf → pptx → ipynb) so tiles stay visually consistent.
  const order: Array<{ key: 'html' | 'pdf' | 'pptx' | 'ipynb'; glyph: string; label: string }> = [
    { key: 'html',  glyph: '🌐', label: 'Open HTML companion' },
    { key: 'pdf',   glyph: '📕', label: 'Open PDF companion' },
    { key: 'pptx',  glyph: '📊', label: 'Open PPTX companion' },
    { key: 'ipynb', glyph: '📓', label: 'Open Jupyter notebook companion' },
  ];
  for (const { key, glyph, label } of order) {
    const path = companions[key];
    if (!path) continue;
    icons.push(
      `<button type="button" class="companion-icon" data-companion-type="${key}" data-companion-path="${escape(path)}" data-companion-title="${escape(prd.title)}" title="${label}: ${escape(path)}" aria-label="${label}">${glyph}</button>`
    );
  }

  return `<div class="companion-row" role="toolbar" aria-label="Companion artifacts">${icons.join('')}</div>`;
}

function renderEmptyState(container: HTMLElement, totalBeforeFilter: number): void {
  // FR-004: empty state with a clear hint, never a blank pane. Distinguish
  // (a) data source returned zero from (b) filters cut everything.
  const isEmptySource = totalBeforeFilter === 0;
  const heading = isEmptySource ? 'No PRDs found' : 'No PRDs match';
  const hint = isEmptySource
    ? 'No PRDs were returned by <code>prd summary --json</code>. Check the configured location, or run <code>prd new</code> to create one.'
    : 'Adjust the search or filter chips above to widen the result set.';

  container.innerHTML = `
    <div class="empty-state" role="status">
      <div class="empty-state-heading">${heading}</div>
      <div class="empty-state-hint">${hint}</div>
    </div>
  `;
}

function tierGlyph(tier: Prd['tier']): string {
  switch (tier) {
    case 'scratch': return '📝';
    case 'archive': return '📦';
    case 'library': return '📚';
  }
}

function statusPill(status: Prd['status']): string {
  switch (status) {
    case 'ACTIVE': return 'pill-active';
    case 'DRAFT': return 'pill-draft';
    case 'RESOLVED': return 'pill-resolved';
  }
}

function ageStr(days: number): string {
  if (days < 1) return 'today';
  if (days < 14) return `${Math.floor(days)}d`;
  if (days < 60) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
