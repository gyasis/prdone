// Shared frontend entry — bundled into dist/frontend/bundle.js.
// Consumed by both the sidebar webview AND the browser kanban (different
// render modes, same bundle) per plan.md "Structure Decision".
// T023 (wave 4) finishes the sidebar entry; T038 (wave 5) finishes kanban.
// This file lands here in wave 3 with the sidebar path operational so US1+US2
// flow end-to-end; kanban renderer joins later.

import type { Prd, HandoffDoc, StartPathInfo } from '../src/types';
import { isExtensionResponse, isKanbanApiPayload } from '../src/guards';
import { renderTileGrid, setVSCodeApi, type VSCodeApi } from './tileGrid';
import { applyFilters, defaultFilterState, type FilterState } from './filters';
import { renderKanbanBoard } from './kanbanBoard';
import { renderGallery } from './galleryView';

declare global {
  interface Window {
    __PRD_RENDER_MODE__?: 'sidebar' | 'kanban' | 'gallery';
    acquireVsCodeApi?: () => VSCodeApi;
  }
}

const mode = window.__PRD_RENDER_MODE__ ?? 'sidebar';

// Audit fix: idempotent boot. If the bundle is ever re-evaluated in the same
// JS context (e.g. VSCode reloading the webview), we MUST NOT register a
// second message listener or a second setInterval — that's the listener-stack
// bug the audit flagged as the root cause of "stuck at 1 stale". Cheap guard
// using a window-level flag with mode included so sidebar/kanban don't
// collide if the bundle is ever loaded twice in different surfaces.
const __BOOT_KEY = `__PRD_BOOTED_${mode}`;
if ((window as unknown as Record<string, boolean>)[__BOOT_KEY]) {
  console.warn(`[prd] bundle re-evaluated in mode=${mode}; skipping second boot to prevent listener leak`);
} else {
  (window as unknown as Record<string, boolean>)[__BOOT_KEY] = true;
  if (mode === 'sidebar') {
    bootSidebar();
  } else if (mode === 'kanban') {
    bootKanban();
  } else if (mode === 'gallery') {
    bootGallery();
  }
}

function bootSidebar(): void {
  const api = window.acquireVsCodeApi?.();
  if (api) setVSCodeApi(api);

  // Build sidebar shell: title bar + search + filter chips + counts + tiles div.
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div class="sidebar-shell" data-theme="dark">
      <header class="sidebar-title">
        <span class="wordmark">PRDs</span>
        <span class="subtitle">PRD VISUALIZER</span>
        <div class="title-actions">
          <button id="refresh-visualizer" class="title-action refresh-pill" type="button" title="Refresh PRDs (last refreshed: never)" aria-label="Refresh PRD list">
            <svg class="refresh-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"/>
              <polyline points="13.5 2 13.5 5.5 10 5.5"/>
            </svg>
            <span id="refresh-label" class="refresh-label">never</span>
          </button>
          <button id="open-kanban" class="title-action" type="button" title="Open Kanban (Browser)" aria-label="Open Kanban in browser">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="2" y="3" width="3" height="10" rx="0.5"/>
              <rect x="6.5" y="3" width="3" height="6" rx="0.5"/>
              <rect x="11" y="3" width="3" height="8" rx="0.5"/>
            </svg>
          </button>
        </div>
      </header>
      <div class="toolbar">
        <input id="search" class="search-input" type="search" placeholder="Search PRDs by title, id, tag…" />
        <div class="filter-chips" id="filter-chips">
          <button class="chip active" data-mode="all">All <span class="chip-count" data-count="all">—</span></button>
          <button class="chip" data-mode="open">Open <span class="chip-count" data-count="open">—</span></button>
          <button class="chip" data-mode="resolved">Resolved <span class="chip-count" data-count="resolved">—</span></button>
          <button class="chip" data-mode="stale">Stale <span class="chip-count" data-count="stale">—</span></button>
          <button class="chip" data-mode="tier" data-tier="scratch">📝 <span class="chip-count" data-count="scratch">—</span></button>
          <button class="chip" data-mode="tier" data-tier="archive">📦 <span class="chip-count" data-count="archive">—</span></button>
          <button class="chip" data-mode="tier" data-tier="library">📚 <span class="chip-count" data-count="library">—</span></button>
        </div>
      </div>
      <div class="tag-filter-section" id="tag-filter-section" hidden>
        <div class="tag-filter-header" id="tag-filter-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="tag-filter-row">
          <span class="tag-filter-glyph">▸</span>
          <span class="tag-filter-label">Tags</span>
          <span class="tag-filter-count" id="tag-filter-count">0</span>
        </div>
        <div class="tag-filter-row" id="tag-filter-row" hidden></div>
      </div>
      <div class="counts" id="counts"><span id="count-total">—</span> · <span id="count-stale">—</span> stale · <button id="sort-toggle" class="sort" type="button" aria-label="Toggle sort by age" title="Toggle sort by age">sort: age <span id="sort-glyph">↓</span></button></div>
      <section class="start-rail" id="start-rail" aria-label="Start here" hidden>
        <div class="start-rail-header" id="start-rail-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="start-rail-list">
          <span class="start-rail-glyph">▸</span>
          <span class="start-rail-label">Start here</span>
          <span class="start-rail-reco" id="start-rail-reco"></span>
          <span class="start-rail-warn" id="start-rail-warn" hidden title="Your workspace is opened to a subfolder of the project root — launch Claude from the root instead.">⚠ subfolder</span>
        </div>
        <ul class="start-rail-list" id="start-rail-list" role="list" hidden></ul>
      </section>
      <section class="resume-rail" id="resume-rail" aria-label="Resume Rail" hidden>
        <div class="resume-rail-header" id="resume-rail-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="resume-rail-list">
          <span class="resume-rail-glyph">▸</span>
          <span class="resume-rail-label">Resume Rail</span>
          <span class="resume-rail-count" id="resume-rail-count">0</span>
        </div>
        <ul class="resume-rail-list" id="resume-rail-list" role="list" hidden></ul>
      </section>
      <div class="tiles" id="tiles"></div>
      <div id="error-banner" class="error-banner" hidden></div>
    </div>`;

  // Local state.
  let allPrds: Prd[] = [];
  let filterState: FilterState = defaultFilterState();

  // Resume Rail state — collapsed by default.
  let resumeRailOpen = false;

  // Resume Rail elements.
  const resumeRailSection = document.getElementById('resume-rail')!;
  const resumeRailList = document.getElementById('resume-rail-list')!;
  const resumeRailCount = document.getElementById('resume-rail-count')!;
  const resumeRailToggle = document.getElementById('resume-rail-toggle')!;

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    } as Record<string, string>)[c] ?? c);
  }

  function fmtWhen(ms: number): string {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
    const diff = Date.now() - ms;
    const min = 60_000, hr = 3_600_000, day = 86_400_000;
    if (diff < hr) return `${Math.max(1, Math.round(diff / min))}m ago`;
    if (diff < day) return `${Math.round(diff / hr)}h ago`;
    if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
    const d = new Date(ms);
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return `${mon} ${d.getDate()}`;
  }

  function renderResumeRail(handoffs: HandoffDoc[]): void {
    resumeRailCount.textContent = String(handoffs.length);
    if (handoffs.length === 0) {
      resumeRailSection.hidden = true;
      return;
    }
    resumeRailSection.hidden = false;

    resumeRailList.innerHTML = handoffs.map(h => {
      const displayFocus = h.focus.length > 120
        ? h.focus.slice(0, 120) + '…'
        : h.focus;
      const badge = h.prdId
        ? `<span class="resume-badge prd" title="Maps to PRD ${escapeHtml(h.prdId)}">PRD</span>`
        : `<span class="resume-badge orphan" title="No matching PRD">orphan</span>`;
      return `<li class="resume-card" role="listitem">
        <div class="resume-card-meta">
          <span class="resume-card-when">${escapeHtml(fmtWhen(h.capturedMs))}</span>
          ${badge}
        </div>
        <div class="resume-card-title">${escapeHtml(h.title)}</div>
        ${displayFocus ? `<div class="resume-card-focus">${escapeHtml(displayFocus)}</div>` : ''}
        <div class="resume-card-actions">
          <button type="button" class="resume-action resume-copy" data-cmd="${escapeHtml(h.resumeCmd)}" title="Copy resume command to clipboard">Copy resume cmd</button>
          ${h.startRoot ? `<button type="button" class="resume-action resume-cd" data-cmd='cd "${escapeAttr(h.startRoot)}"' title="Copy: cd &quot;${escapeAttr(h.startRoot)}&quot; — launch this handoff from its project root">Copy cd</button>` : ''}
          <button type="button" class="resume-action resume-open" data-path="${escapeHtml(h.path)}" title="Open handoff file in editor">Open</button>
          <button type="button" class="resume-action resume-archive" data-path="${escapeHtml(h.path)}" title="Archive this handoff">Archive</button>
        </div>
        ${h.startRoot ? `<div class="resume-card-root" title="${escapeAttr(h.startRoot)}">└ cd "${escapeHtml(tildify(h.startRoot))}"</div>` : ''}
      </li>`;
    }).join('');

    // Wire button handlers.
    resumeRailList.querySelectorAll<HTMLButtonElement>('.resume-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd ?? '';
        api?.postMessage({ type: 'COPY_COMMAND', payload: { command: cmd } });
      });
    });
    resumeRailList.querySelectorAll<HTMLButtonElement>('.resume-cd').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd ?? '';
        if (cmd) api?.postMessage({ type: 'COPY_COMMAND', payload: { command: cmd } });
      });
    });
    resumeRailList.querySelectorAll<HTMLButtonElement>('.resume-open').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.path ?? '';
        api?.postMessage({ type: 'OPEN_FILE', payload: { path: p } });
      });
    });
    resumeRailList.querySelectorAll<HTMLButtonElement>('.resume-archive').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.path ?? '';
        api?.postMessage({ type: 'ARCHIVE_HANDOFF', payload: { path: p } });
      });
    });
  }

  // Toggle collapse/expand of the Resume Rail list.
  function toggleResumeRail(): void {
    resumeRailOpen = !resumeRailOpen;
    resumeRailList.hidden = !resumeRailOpen;
    resumeRailToggle.setAttribute('aria-expanded', String(resumeRailOpen));
    const glyph = resumeRailToggle.querySelector('.resume-rail-glyph');
    if (glyph) glyph.textContent = resumeRailOpen ? '▾' : '▸';
  }

  resumeRailToggle.addEventListener('click', toggleResumeRail);
  resumeRailToggle.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleResumeRail(); }
  });

  // ── Start-here rail ──────────────────────────────────────────────────────
  // Ranked "launch Claude from HERE" suggestion for the current workspace, so
  // the user stops kicking work off from the wrong subfolder. Suggestion only —
  // copies `cd "<path>"`, never executes.
  const startRailSection = document.getElementById('start-rail')!;
  const startRailList = document.getElementById('start-rail-list')!;
  const startRailReco = document.getElementById('start-rail-reco')!;
  const startRailWarn = document.getElementById('start-rail-warn')!;
  const startRailToggle = document.getElementById('start-rail-toggle')!;
  let startRailOpen = false;

  /** Abbreviate the user's home prefix to `~` for compact display. Full path is still copied. */
  function tildify(p: string): string {
    return p.replace(/^\/(?:home|Users)\/[^/]+/, '~');
  }

  function renderStartRail(info: StartPathInfo): void {
    const cands = info.candidates ?? [];
    const top = cands[0];
    // Nothing useful to suggest when the only candidate is the current folder
    // (no git repo, no PRD-owner sentinel) and we're not below a root.
    const meaningful = cands.length > 1 || (!!top && top.kind !== 'current') || info.belowRoot;
    if (!meaningful) {
      startRailSection.hidden = true;
      return;
    }
    startRailSection.hidden = false;

    startRailReco.textContent = top ? `${top.label} · ${tildify(top.path)}` : '';
    startRailWarn.hidden = !info.belowRoot;

    startRailList.innerHTML = cands.map((c, i) => {
      const isReco = i === 0;
      const isCurrent = c.kind === 'current';
      const star = isReco ? ' <span class="start-reco-star" title="Recommended">⭐</span>' : '';
      const here = isCurrent && info.belowRoot
        ? ' <span class="start-here-flag" title="Where your workspace is opened">⚠ you are here</span>'
        : (isCurrent ? ' <span class="start-here-flag" title="Where your workspace is opened">you are here</span>' : '');
      return `<li class="start-card${isReco ? ' reco' : ''}${isCurrent ? ' current' : ''}" role="listitem">
        <div class="start-card-row">
          <span class="start-card-kind">${escapeHtml(c.label)}${star}${here}</span>
          <button type="button" class="start-action start-copy" data-cmd='cd "${escapeAttr(c.path)}"' title="Copy: cd &quot;${escapeAttr(c.path)}&quot;">Copy cd</button>
        </div>
        <div class="start-card-path" title="${escapeAttr(c.path)}">${escapeHtml(tildify(c.path))}</div>
      </li>`;
    }).join('');

    startRailList.querySelectorAll<HTMLButtonElement>('.start-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd ?? '';
        if (cmd) api?.postMessage({ type: 'COPY_COMMAND', payload: { command: cmd } });
      });
    });
  }

  function toggleStartRail(): void {
    startRailOpen = !startRailOpen;
    startRailList.hidden = !startRailOpen;
    startRailToggle.setAttribute('aria-expanded', String(startRailOpen));
    const glyph = startRailToggle.querySelector('.start-rail-glyph');
    if (glyph) glyph.textContent = startRailOpen ? '▾' : '▸';
  }
  startRailToggle.addEventListener('click', toggleStartRail);
  startRailToggle.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleStartRail(); }
  });

  // Toggle collapse/expand of the Tags section (collapsed by default).
  let tagFilterOpen = false;
  const tagFilterToggle = document.getElementById('tag-filter-toggle')!;
  const tagFilterRowEl = document.getElementById('tag-filter-row')!;
  function toggleTagFilter(): void {
    tagFilterOpen = !tagFilterOpen;
    tagFilterRowEl.hidden = !tagFilterOpen;
    tagFilterToggle.setAttribute('aria-expanded', String(tagFilterOpen));
    const glyph = tagFilterToggle.querySelector('.tag-filter-glyph');
    if (glyph) glyph.textContent = tagFilterOpen ? '▾' : '▸';
  }
  tagFilterToggle.addEventListener('click', toggleTagFilter);
  tagFilterToggle.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleTagFilter(); }
  });

  const tilesEl = document.getElementById('tiles')!;
  const searchEl = document.getElementById('search') as HTMLInputElement;
  const chipsEl = document.getElementById('filter-chips')!;
  const countTotalEl = document.getElementById('count-total')!;
  const countStaleEl = document.getElementById('count-stale')!;
  const errorBannerEl = document.getElementById('error-banner')!;

  searchEl.addEventListener('input', () => {
    filterState = { ...filterState, search: searchEl.value };
    repaint();
  });

  // Title-bar action: Open Kanban → ask the extension to run prd.openKanban.
  document.getElementById('open-kanban')?.addEventListener('click', () => {
    api?.postMessage({ type: 'OPEN_KANBAN', payload: {} });
  });

  // B2.1: Refresh button — post REFRESH; extension re-runs `prd summary --json`
  // and broadcasts SYNC_DATA. Brief CSS spin while the request is in flight.
  // The button text shows freshness ("3m ago"); it goes orange when stale (>5m).
  let lastRefreshAt: number | null = null;
  const refreshBtn = document.getElementById('refresh-visualizer');
  const refreshLabel = document.getElementById('refresh-label');

  function formatRelative(ms: number): string {
    if (ms < 30_000) return 'just now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return `${Math.floor(ms / 1000)}s ago`;
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function updateRefreshLabel(): void {
    if (!refreshLabel || !refreshBtn) return;

    // Three-state freshness model — chosen so the user can DIAGNOSE whether
    // the 30-min auto-refresh process (B2.2) is actually firing:
    //   < 3 min                : fresh (no class)            — neutral / quiet
    //   3 min ≤ age < 35 min   : .aging (amber/yellow)       — normal between auto-refreshes
    //   age ≥ 35 min           : .broken (orange + flash)    — auto-refresh SHOULD have fired by 30m;
    //                                                          if you see flashing, the auto loop is dead
    //   lastRefreshAt === null : .broken                     — never refreshed → loudest signal
    refreshBtn.classList.remove('aging', 'broken');

    if (lastRefreshAt === null) {
      refreshLabel.textContent = 'never';
      refreshBtn.setAttribute('title', 'Refresh PRDs (last refreshed: never)');
      refreshBtn.classList.add('broken');
      return;
    }

    const ageMs = Date.now() - lastRefreshAt;
    refreshLabel.textContent = formatRelative(ageMs);
    refreshBtn.setAttribute(
      'title',
      `Refresh PRDs (last refreshed ${formatRelative(ageMs)})`
    );

    if (ageMs >= 35 * 60_000) {
      refreshBtn.classList.add('broken');
    } else if (ageMs >= 3 * 60_000) {
      refreshBtn.classList.add('aging');
    }
    // else: fresh — both classes already removed at top of function.
  }

  // Audit fix: client-side watchdog. If the extension host never returns a
  // SYNC_DATA / SHOW_ERROR within 15s, strip the spinner and show a banner
  // so the user isn't staring at a button that spins forever.
  let refreshWatchdog: number | null = null;
  function startSpin(): void {
    refreshBtn?.classList.add('spinning');
    if (refreshWatchdog !== null) clearTimeout(refreshWatchdog);
    refreshWatchdog = window.setTimeout(() => {
      refreshBtn?.classList.remove('spinning');
      errorBannerEl.textContent = 'Refresh timed out (no response from extension after 15s). The prd CLI may be hung.';
      errorBannerEl.hidden = false;
      refreshWatchdog = null;
    }, 15_000);
  }
  function stopSpin(): void {
    refreshBtn?.classList.remove('spinning');
    if (refreshWatchdog !== null) { clearTimeout(refreshWatchdog); refreshWatchdog = null; }
  }

  refreshBtn?.addEventListener('click', () => {
    startSpin();
    api?.postMessage({ type: 'REFRESH', payload: {} });
    // Spin stops on next SYNC_DATA / SHOW_ERROR or the 15s watchdog.
  });

  // Tick the label every 30s so "3m ago" actually moves without user action.
  // Track the id so a hot-reload (or any second boot path) can clear it.
  const refreshTickId = window.setInterval(updateRefreshLabel, 30_000);
  (window as unknown as Record<string, number>).__PRD_REFRESH_TICK = refreshTickId;
  updateRefreshLabel();

  // B1 fix: wire the sort indicator as a real toggle. The comparator in
  // filters.ts was correct; the UI just had a static label and no handler.
  const sortBtn = document.getElementById('sort-toggle');
  const sortGlyph = document.getElementById('sort-glyph');
  sortBtn?.addEventListener('click', () => {
    const next: FilterState['sort'] = filterState.sort === 'age-desc' ? 'age-asc' : 'age-desc';
    filterState = { ...filterState, sort: next };
    if (sortGlyph) sortGlyph.textContent = next === 'age-desc' ? '↓' : '↑';
    repaint();
  });

  chipsEl.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      chipsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const mode = (btn.dataset.mode ?? 'all') as FilterState['mode'];
      filterState = {
        ...filterState,
        mode,
        tier: mode === 'tier' ? (btn.dataset.tier as Prd['tier']) : undefined
      };
      repaint();
    });
  });

  function repaint(): void {
    // Audit fix: any successful repaint means the on-screen data is fresh.
    document.querySelector('.counts')?.classList.remove('outdated');
    tilesEl.classList.remove('outdated');
    const filtered = applyFilters(allPrds, filterState);
    renderTileGrid(tilesEl, { prds: filtered, totalBeforeFilter: allPrds.length, allPrds });
    countTotalEl.textContent = String(allPrds.length);
    countStaleEl.textContent = String(allPrds.filter(p => p.stale).length);

    // Populate live counts on every filter chip so the user can see at a
    // glance how the set breaks down WITHOUT clicking each chip.
    const setCount = (key: string, n: number) => {
      const el = chipsEl.querySelector(`.chip-count[data-count="${key}"]`);
      if (el) el.textContent = String(n);
    };
    setCount('all',      allPrds.length);
    setCount('open',     allPrds.filter(p => p.status !== 'RESOLVED').length);
    setCount('resolved', allPrds.filter(p => p.status === 'RESOLVED').length);
    setCount('stale',    allPrds.filter(p => p.stale).length);
    setCount('scratch',  allPrds.filter(p => p.tier === 'scratch').length);
    setCount('archive',  allPrds.filter(p => p.tier === 'archive').length);
    setCount('library',  allPrds.filter(p => p.tier === 'library').length);

    // Tag filter chip row — auto-populates per current data
    renderTagFilterRow();
  }

  // Build per-namespace tag chips. Each chip toggles a value in filterState.tagFilters.
  // Layout: chips sorted by namespace priority (type, domain, payor, repo, jira), then
  // by count desc within namespace. Clicking a chip toggles its value.
  function renderTagFilterRow(): void {
    const row = document.getElementById('tag-filter-row');
    if (!row) return;
    const NS_ORDER = ['type', 'domain', 'payor', 'repo', 'jira'] as const;
    const counts: Record<string, Map<string, number>> = {};
    for (const ns of NS_ORDER) counts[ns] = new Map();
    for (const p of allPrds) {
      if (!p.tags) continue;
      for (const raw of p.tags.split(',')) {
        const t = raw.trim();
        if (!t.includes(':')) continue;
        const idx = t.indexOf(':');
        const ns = t.slice(0, idx);
        const value = t.slice(idx + 1);
        if (!(ns in counts)) continue;
        counts[ns].set(value, (counts[ns].get(value) ?? 0) + 1);
      }
    }
    const parts: string[] = [];
    for (const ns of NS_ORDER) {
      const entries = [...counts[ns].entries()].sort((a, b) => b[1] - a[1]);
      for (const [value, n] of entries) {
        const active = filterState.tagFilters?.[ns]?.has(value) ?? false;
        parts.push(
          `<button class="chip tag-pill ${active ? 'active' : ''}" data-ns="${ns}" data-tag-value="${escapeAttr(value)}" type="button">`
          + `<span class="tag-ns">${ns}:</span>${escapeAttr(value)} <span class="chip-count">${n}</span>`
          + `</button>`
        );
      }
    }
    row.innerHTML = parts.join('');
    // Show the collapsible Tags section only when there are tags; reflect the count.
    const tagSection = document.getElementById('tag-filter-section');
    const tagCount = document.getElementById('tag-filter-count');
    if (tagSection) tagSection.hidden = parts.length === 0;
    if (tagCount) tagCount.textContent = String(parts.length);
    row.querySelectorAll<HTMLButtonElement>('.chip[data-ns]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ns = btn.dataset.ns!;
        const value = btn.dataset.tagValue!;
        const tf = { ...(filterState.tagFilters ?? {}) };
        const set = new Set(tf[ns] ?? []);
        if (set.has(value)) set.delete(value); else set.add(value);
        if (set.size === 0) delete tf[ns]; else tf[ns] = set;
        filterState = { ...filterState, tagFilters: tf };
        repaint();
      });
    });
  }

  function escapeAttr(s: string): string {
    return s.replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    } as Record<string, string>)[c] ?? c);
  }

  // Listen for SYNC_DATA / SHOW_ERROR / SYNC_HANDOFFS.
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!isExtensionResponse(msg)) return;
    if (msg.type === 'SYNC_DATA') {
      allPrds = msg.payload;
      errorBannerEl.hidden = true;
      stopSpin();
      lastRefreshAt = Date.now();
      updateRefreshLabel();
      const t0 = performance.now();
      repaint();
      const t1 = performance.now();
      console.log(`[prd] first-paint ${Math.round(t1 - t0)}ms (${msg.payload.length} prds)`);
    } else if (msg.type === 'SHOW_ERROR') {
      stopSpin();
      errorBannerEl.textContent = msg.payload.message;
      errorBannerEl.hidden = false;
      // Audit fix: re-run repaint so the "outdated" class can mark counters
      // visually stale; without this the user has no UI signal that the
      // numbers on screen are from before the failed refresh.
      document.querySelector('.counts')?.classList.add('outdated');
      // Tiles remain visible per FR-004 but get the same outdated marker.
      tilesEl.classList.add('outdated');
    } else if (msg.type === 'SYNC_HANDOFFS') {
      renderResumeRail(msg.payload);
    } else if (msg.type === 'SYNC_START_PATH') {
      renderStartRail(msg.payload);
    }
  });

  // Signal readiness so extension can immediately post initial SYNC_DATA.
  api?.postMessage({ type: 'WEBVIEW_READY' });
}

async function bootKanban(): Promise<void> {
  // T038 (wave 4): full kanban renderer, fetching from /api/prds.
  const app = document.getElementById('app');
  if (!app) return;
  try {
    const resp = await fetch('/api/prds');
    const data: unknown = await resp.json();
    if (!isKanbanApiPayload(data)) {
      app.innerHTML = '<p style="padding:24px;color:#e98e5a">Malformed response from /api/prds</p>';
      return;
    }
    if (data.ok === false) {
      app.innerHTML = `<p style="padding:24px;color:#e98e5a">${data.message}</p>`;
      return;
    }
    renderKanbanBoard(app, data.prds);
  } catch (err) {
    app.innerHTML = `<p style="padding:24px;color:#e98e5a">Could not reach /api/prds: ${(err as Error).message}</p>`;
  }
}

async function bootGallery(): Promise<void> {
  // Spec 002 T097 — gallery boot: fetch /api/prds, filter to those with
  // HTML companions, hand to renderGallery.
  const app = document.getElementById('app');
  if (!app) return;
  try {
    const resp = await fetch('/api/prds');
    const data: unknown = await resp.json();
    if (!isKanbanApiPayload(data)) {
      app.innerHTML = '<p style="padding:24px;color:#e98e5a">Malformed response from /api/prds</p>';
      return;
    }
    if (data.ok === false) {
      app.innerHTML = `<p style="padding:24px;color:#e98e5a">${data.message}</p>`;
      return;
    }
    const t0 = performance.now();
    renderGallery(app, data.prds);
    const t1 = performance.now();
    console.log(`[prd-gallery] first-paint ${Math.round(t1 - t0)}ms (${data.prds.length} prds total, ${data.prds.filter(p => p.companions?.html).length} with HTML)`);
  } catch (err) {
    app.innerHTML = `<p style="padding:24px;color:#e98e5a">Could not reach /api/prds: ${(err as Error).message}</p>`;
  }
}
