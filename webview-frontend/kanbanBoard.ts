// Kanban-mode renderer for the shared frontend bundle.
// T038 (wave 4): replace the wave-3 stub bootKanban with a proper 3-column board.
//
// Tile shape mirrors tileGrid's renderTile so the visual language stays coherent
// across surfaces (per Constitution Principle I — pragmatic simplicity, no
// premature abstraction; just two renderers consuming the same Prd type).

import type { Prd } from '../src/types';
import { parseTag, splitTags, sortTagsByPriority } from './tileGrid';

type GroupBy = 'tier' | 'type' | 'domain' | 'payor' | 'repo' | 'jira';
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'tier', label: 'Tier' },
  { value: 'type', label: 'Type' },
  { value: 'domain', label: 'Domain' },
  { value: 'payor', label: 'Payor' },
  { value: 'repo', label: 'Repo' },
  { value: 'jira', label: 'Jira' },
];

// Persisted across renders so the dropdown state survives auto-refresh.
let currentGroupBy: GroupBy = 'tier';

export function renderKanbanBoard(container: HTMLElement, prds: Prd[]): void {
  const scratch = prds.filter(p => p.tier === 'scratch');
  const archive = prds.filter(p => p.tier === 'archive');
  const library = prds.filter(p => p.tier === 'library');

  const groupOpts = GROUP_OPTIONS.map(o =>
    `<option value="${o.value}"${o.value === currentGroupBy ? ' selected' : ''}>${o.label}</option>`
  ).join('');

  // Spec 002 T102 — count HTML companions to display in the gallery nav link.
  const htmlCount = prds.filter(p => typeof p.companions?.html === 'string').length;

  container.innerHTML = `
    <header class="kanban-header">
      <h1 class="kanban-wordmark">PRDs<span class="dot">.</span></h1>
      <div class="kanban-meta">
        <span>${prds.length} records</span>
        <span class="sep">·</span>
        <span>scratch ${scratch.length}</span>
        <span class="sep">·</span>
        <span>archive ${archive.length}</span>
        <span class="sep">·</span>
        <span>library ${library.length}</span>
        <span class="sep">·</span>
        <label class="kanban-groupby">Group by:
          <select id="kanban-groupby-select">${groupOpts}</select>
        </label>
        <span class="sep">·</span>
        <a class="kanban-nav-link" href="/gallery" title="Gallery view — preview HTML companions in a grid">🌐 Gallery${htmlCount > 0 ? ` <span class="kanban-nav-count">${htmlCount}</span>` : ''}</a>
      </div>
    </header>
    <div class="kanban-board" id="kanban-board-inner">
      ${renderBoardColumns(prds, currentGroupBy)}
    </div>`;

  const sel = container.querySelector<HTMLSelectElement>('#kanban-groupby-select');
  sel?.addEventListener('change', () => {
    currentGroupBy = (sel.value as GroupBy) ?? 'tier';
    const inner = container.querySelector<HTMLElement>('#kanban-board-inner');
    if (inner) {
      inner.innerHTML = renderBoardColumns(prds, currentGroupBy);
      wireTileClicks(container, prds);
    }
  });

  wireTileClicks(container, prds);

  // Backdrop click + Esc-key close. Wired once per renderKanbanBoard call.
  document.removeEventListener('keydown', handleEscClose);
  document.addEventListener('keydown', handleEscClose);
}

function wireTileClicks(container: HTMLElement, prds: Prd[]): void {
  const byPath = new Map<string, Prd>();
  for (const p of prds) byPath.set(p.path, p);
  container.querySelectorAll<HTMLElement>('.k-tile').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.k-open-link')) return;
      const path = el.dataset.path ?? '';
      const prd = byPath.get(path);
      if (prd) renderDetailDrawer(prd);
    });
  });
}

// Decide column composition. For tier mode we keep the original 3-column shape
// + ordering. For namespace modes we group by tag value within that namespace;
// PRDs with no tag in that namespace go into an "(untagged)" column last.
function renderBoardColumns(prds: Prd[], groupBy: GroupBy): string {
  if (groupBy === 'tier') {
    const scratch = prds.filter(p => p.tier === 'scratch');
    const archive = prds.filter(p => p.tier === 'archive');
    const library = prds.filter(p => p.tier === 'library');
    return [
      renderColumn('scratch', '📝', 'Scratch', scratch),
      renderColumn('archive', '📦', 'Archive', archive),
      renderColumn('library', '📚', 'Library', library),
    ].join('');
  }

  // Group by tag namespace
  const buckets = new Map<string, Prd[]>();
  const UNTAGGED = '(untagged)';
  for (const p of prds) {
    const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const matches = tags
      .filter(t => t.startsWith(`${groupBy}:`))
      .map(t => t.slice(groupBy.length + 1));
    if (matches.length === 0) {
      if (!buckets.has(UNTAGGED)) buckets.set(UNTAGGED, []);
      buckets.get(UNTAGGED)!.push(p);
    } else {
      for (const v of matches) {
        if (!buckets.has(v)) buckets.set(v, []);
        buckets.get(v)!.push(p);
      }
    }
  }
  // Order: by count desc, untagged last
  const entries = [...buckets.entries()]
    .filter(([k]) => k !== UNTAGGED)
    .sort((a, b) => b[1].length - a[1].length);
  if (buckets.has(UNTAGGED)) entries.push([UNTAGGED, buckets.get(UNTAGGED)!]);

  return entries.map(([value, list]) => {
    const tier = value === UNTAGGED ? 'untagged' : 'tagged';
    return renderColumn(tier, '🏷', `${groupBy}:${value}`, list);
  }).join('');
}

function handleEscClose(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape') return;
  const drawer = document.getElementById('k-drawer');
  if (drawer?.classList.contains('open')) closeDrawer();
}

function closeDrawer(): void {
  const drawer = document.getElementById('k-drawer');
  const scrim = document.getElementById('k-scrim');
  if (drawer) {
    drawer.classList.remove('open');
    setTimeout(() => drawer.remove(), 240);
  }
  if (scrim) {
    scrim.classList.remove('open');
    setTimeout(() => scrim.remove(), 240);
  }
}

function renderColumn(tier: string, glyph: string, label: string, prds: Prd[]): string {
  const stale = prds.filter(p => p.stale).length;
  return `
    <section class="k-col k-col-${tier}">
      <header class="k-col-head">
        <span class="k-col-glyph">${glyph}</span>
        <h2 class="k-col-title">${label}</h2>
        <span class="k-col-count">${prds.length}${stale ? ` · ${stale} stale` : ''}</span>
      </header>
      <div class="k-col-body">
        ${prds.map((p, i) => renderKanbanTile(p, i)).join('')}
      </div>
    </section>`;
}

function renderKanbanTile(prd: Prd, _idx: number): string {
  const sigBlock =
    prd.significance !== null
      ? `<span class="k-sig">sig <strong>${prd.significance}</strong></span>`
      : '';
  // Spec 002 — companion icon row. Always show 📄 MD; add 🌐 / 📕 / 📊 / 📓 if companions exist.
  // In browser kanban these icons are anchors (no postMessage available; the
  // sidebar webview version uses postMessage to open via WebviewPanel instead).
  // Browser kanban opens HTML directly in a new tab — full fidelity, no CSP limits.
  const companionRow = renderKanbanCompanionRow(prd);
  // data-path uniquely identifies the tile across all columns; data-idx kept
  // for any debug/dev tooling but no longer used for lookup.
  return `
    <article class="k-tile" data-path="${escape(prd.path)}" data-tier="${prd.tier}" data-stale="${prd.stale}">
      <div class="k-meta">
        <span class="k-age">${ageStr(prd.age_days)}</span>
        <span class="k-status k-status-${prd.status.toLowerCase()}">${prd.status}</span>
        ${prd.stale ? '<span class="k-stale">stale</span>' : ''}
      </div>
      <h3 class="k-title">${escape(prd.title)}</h3>
      ${renderKanbanTags(prd, 3)}
      <p class="k-ctx">${escape(prd.context)}</p>
      <footer class="k-foot">
        <span>◆ ${prd.decisions}</span>
        <span>▣ ${prd.subagents}</span>
        ${sigBlock}
        <a class="k-open-link" href="vscode://file/${encodeURI(prd.path)}" title="Open in VSCode">↗ open</a>
      </footer>
      ${companionRow}
    </article>`;
}

function renderKanbanCompanionRow(prd: Prd): string {
  // Always render the MD icon. It's the canonical index file.
  const items: string[] = [
    `<a class="k-companion" data-companion-type="md" href="vscode://file/${encodeURI(prd.path)}" title="Open ${escape(prd.id)}.md in VSCode" onclick="event.stopPropagation()">📄</a>`,
  ];
  const companions = prd.companions ?? {};
  const order: Array<{ key: 'html' | 'pdf' | 'pptx' | 'ipynb'; glyph: string; label: string }> = [
    { key: 'html',  glyph: '🌐', label: 'Open HTML companion in this browser' },
    { key: 'pdf',   glyph: '📕', label: 'Open PDF companion' },
    { key: 'pptx',  glyph: '📊', label: 'Open PPTX companion' },
    { key: 'ipynb', glyph: '📓', label: 'Open Jupyter notebook companion' },
  ];
  for (const { key, glyph, label } of order) {
    const path = companions[key];
    if (!path) continue;
    if (key === 'html') {
      // Browser kanban: open HTML directly via file:// in a new tab. Bypasses the
      // sidebar's WebviewPanel route (no CSP limits, full Newsreader + JS).
      items.push(
        `<a class="k-companion" data-companion-type="html" href="file://${encodeURI(path)}" target="_blank" rel="noopener noreferrer" title="${escape(label)}: ${escape(path)}" onclick="event.stopPropagation()">${glyph}</a>`
      );
    } else {
      // Other companion types fall back to vscode:// (extension intercepts).
      items.push(
        `<a class="k-companion" data-companion-type="${key}" href="vscode://file/${encodeURI(path)}" title="${escape(label)}: ${escape(path)}" onclick="event.stopPropagation()">${glyph}</a>`
      );
    }
  }
  return `<div class="k-companion-row" role="toolbar" aria-label="Companion artifacts">${items.join('')}</div>`;
}

function renderKanbanTags(prd: Prd, maxPills: number): string {
  const tags = splitTags(prd.tags);
  if (tags.length === 0) return '';
  const sorted = sortTagsByPriority(tags);
  const visible = sorted.slice(0, maxPills);
  const overflow = sorted.slice(maxPills);
  const pills = visible.map(t => {
    const { ns, value } = parseTag(t);
    const nsAttr = ns ? `data-ns="${escape(ns)}"` : '';
    const nsPrefix = ns ? `<span class="tag-ns">${escape(ns)}:</span>` : '';
    return `<span class="tag-pill" ${nsAttr}>${nsPrefix}${escape(value)}</span>`;
  }).join('');
  const overflowPill = overflow.length > 0
    ? `<span class="tag-pill overflow" title="${escape(overflow.join(', '))}">+${overflow.length} more</span>`
    : '';
  return `<div class="tag-row">${pills}${overflowPill}</div>`;
}

function renderKanbanDrawerTags(prd: Prd): string {
  const tags = splitTags(prd.tags);
  if (tags.length === 0) return '';
  const groups = new Map<string, string[]>();
  for (const t of tags) {
    const { ns } = parseTag(t);
    const key = ns ?? '_free';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
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
  return `<div class="k-drawer-section">Tags</div>${sections.join('')}`;
}

function renderDetailDrawer(prd: Prd): void {
  // Backdrop scrim: dim the page when drawer is open, click-to-close.
  let scrim = document.getElementById('k-scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'k-scrim';
    scrim.className = 'k-scrim';
    scrim.addEventListener('click', closeDrawer);
    document.body.appendChild(scrim);
  }

  let drawer = document.getElementById('k-drawer');
  const isReplacing = drawer !== null;
  if (!drawer) {
    drawer = document.createElement('aside');
    drawer.id = 'k-drawer';
    drawer.className = 'k-drawer';
    document.body.appendChild(drawer);
  }

  // Status pill mirrors the tile's pill so the drawer's header reads coherently.
  const sigPart = prd.significance !== null ? `<span class="k-drawer-sig">sig ${prd.significance}</span>` : '';
  const stalePart = prd.stale ? '<span class="k-drawer-stale">stale</span>' : '';

  drawer.innerHTML = `
    <button class="k-drawer-close" type="button" aria-label="Close">×</button>
    <header class="k-drawer-head">
      <div class="k-drawer-meta">
        <span class="k-drawer-tier">${tierGlyph(prd.tier)} ${prd.tier}</span>
        <span class="k-drawer-age">${ageStr(prd.age_days)}</span>
        <span class="k-status k-status-${prd.status.toLowerCase()}">${prd.status}</span>
        ${stalePart}
        ${sigPart}
      </div>
      <h2 class="k-drawer-title">${escape(prd.title)}</h2>
      <div class="k-drawer-id">${escape(prd.path)}</div>
    </header>

    ${prd.ephemeral ? `
      <div class="k-drawer-section">Ephemeral marker</div>
      <div class="k-drawer-ephemeral">⏱ ${escape(prd.ephemeral)}</div>
    ` : ''}

    ${renderKanbanDrawerTags(prd)}

    <div class="k-drawer-section">Context</div>
    <p class="k-drawer-ctx">${escape(prd.context) || '(no context written)'}</p>

    <div class="k-drawer-section">Stats</div>
    <div class="k-drawer-stats">
      <span>◆ ${prd.decisions} decisions</span>
      <span>▣ ${prd.subagents} subagents</span>
    </div>

    <div class="k-drawer-section">Open in editor</div>
    <a class="k-drawer-vsc-link" href="vscode://file/${encodeURI(prd.path)}">↗ Open in VSCode</a>
  `;

  drawer.querySelector('.k-drawer-close')?.addEventListener('click', closeDrawer);

  // Slide-in animation: only re-trigger if drawer was just created. If
  // replacing content (user clicked another tile while drawer is open),
  // briefly add a content-fade class so the change is visually obvious
  // instead of an instant content swap.
  if (isReplacing) {
    drawer.classList.add('k-drawer-flash');
    setTimeout(() => drawer?.classList.remove('k-drawer-flash'), 240);
  } else {
    requestAnimationFrame(() => {
      drawer?.classList.add('open');
      scrim?.classList.add('open');
    });
  }
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
