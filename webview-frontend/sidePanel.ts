// Slide-up detail panel for the sidebar webview.
// T031 (wave 4 in plan, landed early because tileGrid wires it in T032).
// T035: clipboard "copied" 900ms green flash on chip click.

import type { Prd, ActionCommand } from '../src/types';
import { actionCommandsFor } from '../src/actions/commandTemplates';
import { getVSCodeApi, parseTag, splitTags } from './tileGrid';
import { renderDetailGraph } from './detailGraph';

export function openDetail(prd: Prd, allPrds: Prd[] = [prd]): void {
  let panel = document.getElementById('detail-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'detail-panel';
    panel.className = 'detail-panel';
    document.body.appendChild(panel);
  }

  const cmds = actionCommandsFor(prd);
  const slug = (prd.path.split('/').pop() ?? '').replace(/\.md$/, '');
  const checkoutCmd = `/prd-checkout ${slug}`;
  const cleanupCmd = `/session-prd-cleanup`;
  panel.innerHTML = `
    <button class="detail-close" type="button" aria-label="Close detail">×</button>
    <div class="detail-id">${escape(prd.path)}</div>
    <h2 class="detail-title">${escape(prd.title)}</h2>

    <div class="detail-section-label">Status</div>
    <div class="detail-status">
      <span class="tier-glyph">${tierGlyph(prd.tier)}</span>
      <span class="age">${ageStr(prd.age_days)}</span>
      <span>${prd.decisions} decisions</span>
      <span>${prd.subagents} subagents</span>
      ${prd.significance !== null ? `<span>sig ${prd.significance}</span>` : ''}
    </div>

    ${prd.ephemeral ? `
      <div class="detail-section-label">Ephemeral marker</div>
      <div class="detail-ephemeral">${escape(prd.ephemeral)}</div>
    ` : ''}

    ${renderDrawerTags(prd)}

    <div class="detail-section-label">Context</div>
    <div class="detail-context">${escape(prd.context)}</div>

    <div class="detail-section-label">Network · parent · siblings · children</div>
    <div class="detail-graph-wrap">
      <div id="detail-graph" class="detail-graph"></div>
    </div>

    <div class="detail-section-label">Claude Code · click to copy, paste into Claude</div>
    <div class="cmd-list">
      <button class="cmd" data-kind="copy-claude-checkout" data-command="${escape(checkoutCmd)}" type="button">
        <span class="cmd-label">📋 Audit this PRD</span>
        <span class="cmd-text">${escape(checkoutCmd)}</span>
      </button>
      <button class="cmd" data-kind="copy-claude-cleanup" data-command="${escape(cleanupCmd)}" type="button">
        <span class="cmd-label">📋 Sweep all active PRDs</span>
        <span class="cmd-text">${escape(cleanupCmd)}</span>
      </button>
    </div>

    <div class="detail-section-label">Commands · click to copy</div>
    <div class="cmd-list">
      ${cmds.map((c) => renderChip(c)).join('')}
    </div>
  `;

  // Trigger slide-up animation via a class. CSS in styles.css handles the transform.
  requestAnimationFrame(() => {
    panel?.classList.add('open');
  });

  // §5c: render the embedded 1-hop network graph.
  const graphEl = panel.querySelector<HTMLElement>('#detail-graph');
  if (graphEl) {
    try {
      renderDetailGraph(graphEl, prd, allPrds);
    } catch (err) {
      graphEl.innerHTML = `<div class="detail-graph-empty">Graph could not render: ${escape((err as Error).message)}</div>`;
    }
    // Listen for clicks on neighbor nodes — open the file via the existing OPEN_FILE channel.
    graphEl.addEventListener('detail-graph-node-clicked', (ev) => {
      const detail = (ev as CustomEvent<{ path: string; id: string }>).detail;
      if (!detail?.path) return;
      const api = getVSCodeApi();
      if (api) api.postMessage({ type: 'OPEN_FILE', payload: { path: detail.path } });
    });
  }

  // Close handler.
  panel.querySelector('.detail-close')?.addEventListener('click', closeDetail);

  // Open-file action via vscode message channel.
  panel.querySelector('.cmd[data-kind="open-file"]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    const api = getVSCodeApi();
    if (api) api.postMessage({ type: 'OPEN_FILE', payload: { path: prd.path } });
    flash(ev.currentTarget as HTMLElement);
  });

  // Copy-command actions.
  panel.querySelectorAll<HTMLElement>('.cmd[data-kind]:not([data-kind="open-file"])').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      const cmd = el.dataset.command ?? '';
      if (!cmd) return;
      const api = getVSCodeApi();
      if (api) api.postMessage({ type: 'COPY_COMMAND', payload: { command: cmd } });
      flash(el);
    });
  });
}

export function closeDetail(): void {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;
  panel.classList.remove('open');
  // Remove from DOM after the slide-out finishes (matches CSS transition duration).
  setTimeout(() => panel.remove(), 240);
}

/** Render all tags grouped by namespace for the drawer (full list, not capped). */
function renderDrawerTags(prd: Prd): string {
  const tags = splitTags(prd.tags);
  if (tags.length === 0) return '';
  const groups = new Map<string, string[]>();
  for (const t of tags) {
    const { ns } = parseTag(t);
    const key = ns ?? '_free';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  // Namespace display order matches tile priority
  const order = ['type', 'domain', 'payor', 'jira', 'repo', '_free'];
  const sections: string[] = [];
  for (const ns of order) {
    const list = groups.get(ns);
    if (!list) continue;
    const label = ns === '_free' ? 'other' : ns;
    const pills = list.map(t => {
      const { ns: n, value } = parseTag(t);
      const nsAttr = n ? `data-ns="${escape(n)}"` : '';
      const nsPrefix = n ? `<span class="tag-ns">${escape(n)}:</span>` : '';
      return `<span class="tag-pill" ${nsAttr}>${nsPrefix}${escape(value)}</span>`;
    }).join('');
    sections.push(`<div class="drawer-tag-ns-label">${escape(label)}</div><div class="drawer-tag-group">${pills}</div>`);
  }
  if (sections.length === 0) return '';
  return `<div class="detail-section-label">Tags</div>${sections.join('')}`;
}

function renderChip(cmd: ActionCommand): string {
  return `
    <button class="cmd" data-kind="${cmd.kind}" data-command="${escape(cmd.command)}" type="button">
      <span class="cmd-label">${escape(cmd.label)}</span>
      <span class="cmd-text">${escape(cmd.command)}</span>
    </button>`;
}

/** T035: 900ms green "copied" flash on the chip's label. */
function flash(el: HTMLElement): void {
  const labelEl = el.querySelector<HTMLElement>('.cmd-label');
  if (!labelEl) return;
  const original = labelEl.textContent ?? '';
  labelEl.textContent = 'Copied';
  labelEl.classList.add('cmd-label-flash');
  setTimeout(() => {
    labelEl.textContent = original;
    labelEl.classList.remove('cmd-label-flash');
  }, 900);
}

function tierGlyph(tier: Prd['tier']): string {
  switch (tier) {
    case 'scratch': return '📝';
    case 'archive': return '📦';
    case 'library': return '📚';
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
