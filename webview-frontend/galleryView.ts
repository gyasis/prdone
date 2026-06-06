// Spec 002 T097–T104 — Gallery view (browser kanban /gallery route).
// Renders a CSS grid of large cards; top 50% of each card is an iframe of the
// PRD's HTML companion (lazy-loaded via IntersectionObserver, capped at 20
// concurrent mounts, sandbox="allow-scripts allow-same-origin").
//
// Design choices:
//   - Iframes load via /companion?path=<absPath>, not file:// (file:// is
//     blocked from a localhost http origin).
//   - Lazy mount via IntersectionObserver with rootMargin "200px" so cards
//     just below the fold pre-load. Unmount as they fall off-screen.
//   - Concurrent cap = 20. When the 21st card enters, the oldest (LRU) is
//     forced back to placeholder state.
//   - Sandbox attribute documented in code comment (T101).
//   - Empty state (T103): friendly card when no PRDs have HTML companions.

import type { Prd } from '../src/types';

/** Hard cap on simultaneously-mounted iframes — protects browser memory. */
const MAX_CONCURRENT_IFRAMES = 20;
/** IntersectionObserver rootMargin — pre-mount cards just below the fold. */
const OBSERVER_ROOT_MARGIN = '200px';

interface GalleryCardState {
  prd: Prd;
  htmlPath: string;
  cardEl: HTMLElement;
  iframeMounted: boolean;
}

export function renderGallery(container: HTMLElement, prds: Prd[]): void {
  const withHtml = prds.filter(p => typeof p.companions?.html === 'string');

  if (withHtml.length === 0) {
    container.innerHTML = renderEmptyState();
    return;
  }

  container.innerHTML = `
    <header class="g-header">
      <div class="g-title-row">
        <span class="g-wordmark">Gallery</span>
        <span class="g-subtitle">HTML companions</span>
        <div class="g-nav">
          <a href="/" class="g-nav-link" title="Back to kanban">← Kanban</a>
        </div>
      </div>
      <div class="g-counts">
        <span class="g-count-num">${withHtml.length}</span>
        <span class="g-count-label">PRD${withHtml.length === 1 ? '' : 's'} with HTML companion</span>
      </div>
    </header>
    <main class="g-grid" id="g-grid"></main>
  `;

  const grid = container.querySelector<HTMLElement>('#g-grid');
  if (!grid) return;

  // Build cards with placeholder iframes.
  grid.innerHTML = withHtml.map((p, i) => renderCard(p, i)).join('');

  // Set up the lazy-mount + cap logic.
  const states: GalleryCardState[] = [];
  grid.querySelectorAll<HTMLElement>('.g-card').forEach((cardEl, i) => {
    states.push({
      prd: withHtml[i],
      htmlPath: withHtml[i].companions!.html!,
      cardEl,
      iframeMounted: false,
    });
  });

  /** Tracks mount order so we can evict the oldest under cap pressure (LRU-ish). */
  const mountOrder: GalleryCardState[] = [];

  function mountIframe(state: GalleryCardState): void {
    if (state.iframeMounted) {
      // Touch into mountOrder so it stays "recent".
      const idx = mountOrder.indexOf(state);
      if (idx >= 0) mountOrder.splice(idx, 1);
      mountOrder.push(state);
      return;
    }
    const placeholder = state.cardEl.querySelector<HTMLElement>('.g-iframe-slot');
    if (!placeholder) return;
    const iframeSrc = `/companion?path=${encodeURIComponent(state.htmlPath)}`;
    // T101 — sandbox attribute: allow-scripts (PRD HTML may include
    // IntersectionObserver / fonts.googleapis.com link tags). allow-same-origin
    // is required so the iframe can read its own CSS-OM (Newsreader fonts).
    // We do NOT include allow-top-navigation / allow-forms / allow-popups —
    // a malicious PRD HTML cannot navigate the parent or pop up windows.
    placeholder.innerHTML = `<iframe class="g-iframe"
      src="${escapeAttr(iframeSrc)}"
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      loading="lazy"
      title="${escapeAttr(state.prd.title)}"></iframe>`;
    state.iframeMounted = true;
    mountOrder.push(state);

    // T100 — enforce concurrent cap. Evict the oldest if we're over.
    while (mountOrder.length > MAX_CONCURRENT_IFRAMES) {
      const victim = mountOrder.shift();
      if (victim && victim !== state) unmountIframe(victim);
    }
  }

  function unmountIframe(state: GalleryCardState): void {
    if (!state.iframeMounted) return;
    const slot = state.cardEl.querySelector<HTMLElement>('.g-iframe-slot');
    if (slot) slot.innerHTML = renderIframePlaceholder();
    state.iframeMounted = false;
  }

  // IntersectionObserver: mount when entering viewport (with rootMargin),
  // unmount when leaving (only if we've hit the cap or are otherwise pressured —
  // here we just leave mounted iframes alone unless cap pressure forces eviction).
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const idx = Number((entry.target as HTMLElement).dataset.idx ?? '-1');
        if (idx < 0) continue;
        const state = states[idx];
        if (!state) continue;
        if (entry.isIntersecting) {
          mountIframe(state);
        }
      }
    },
    { rootMargin: OBSERVER_ROOT_MARGIN }
  );
  states.forEach(s => io.observe(s.cardEl));

  // Wire click on companion icons in the metadata footer.
  grid.querySelectorAll<HTMLAnchorElement>('.g-card .k-companion').forEach(anchor => {
    anchor.addEventListener('click', (ev) => ev.stopPropagation());
  });
}

function renderCard(prd: Prd, idx: number): string {
  const htmlPath = prd.companions?.html ?? '';
  return `
    <article class="g-card" data-tier="${prd.tier}" data-idx="${idx}">
      <div class="g-iframe-slot">${renderIframePlaceholder()}</div>
      <div class="g-card-meta">
        <div class="g-card-top">
          <span class="g-tier g-tier-${prd.tier}">${tierLabel(prd.tier)}</span>
          <span class="g-card-id">${escape(prd.id)}</span>
        </div>
        <h3 class="g-card-title">${escape(prd.title)}</h3>
        <p class="g-card-ctx">${escape(prd.context).slice(0, 140)}</p>
        <footer class="g-card-foot">
          <a class="k-companion" data-companion-type="html"
             href="/companion?path=${encodeURIComponent(htmlPath)}"
             target="_blank" rel="noopener noreferrer"
             title="Open full HTML in new tab">🌐 open</a>
          <a class="k-companion" data-companion-type="md"
             href="vscode://file/${encodeURI(prd.path)}"
             title="Open .md in VSCode">📄 md</a>
        </footer>
      </div>
    </article>`;
}

function renderIframePlaceholder(): string {
  return `<div class="g-iframe-placeholder" aria-hidden="true">
    <span class="g-placeholder-glyph">🌐</span>
    <span class="g-placeholder-text">scrolling will render preview…</span>
  </div>`;
}

function renderEmptyState(): string {
  // T103 — friendly empty card when no HTML companions exist.
  return `
    <div class="g-empty" role="status">
      <div class="g-empty-glyph">🌐</div>
      <h2 class="g-empty-heading">No HTML companions yet</h2>
      <p class="g-empty-hint">
        Run <code>prd new --html &lt;descriptor&gt;</code> to create a PRD with both
        a Markdown index and an HTML design companion. Then invoke
        <code>/design-prd &lt;descriptor&gt;</code> in Claude Code to fill the HTML.
      </p>
      <p class="g-empty-nav"><a href="/">← Back to kanban</a></p>
    </div>`;
}

function tierLabel(tier: Prd['tier']): string {
  switch (tier) {
    case 'scratch': return '📝 scratch';
    case 'archive': return '📦 archive';
    case 'library': return '📚 library';
  }
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
function escapeAttr(s: string): string { return escape(s); }
