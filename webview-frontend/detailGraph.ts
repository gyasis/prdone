// §5c — Embedded mini-network graph inside the side-panel detail card.
// Renders the clicked PRD's 1-hop neighborhood as a strict 3-row mermaid
// hierarchy (parent / self+siblings / children) using pure inline SVG.
//
// Aesthetic: "Variant 4 — Kanban-card chunk" from design-explorations/v1-mermaid-3row.html.
// Each node is a mini-card: tier glyph + truncated title + truncated slug + age.
// Self gets a cyan border + slight tint + ★ marker.
// All edges are right-angle elbows (no curves).
//
// No cytoscape, no graph lib — keeps bundle tiny and gives us total control
// over layout. Re-rendered on every openDetail() call.

import type { Prd, PrdRelation } from '../src/types';

type EdgeType = PrdRelation['type'];
type Role = 'self' | 'parent' | 'child' | 'sibling' | 'related';

interface NeighborhoodNode {
  id: string;
  prd: Prd | null;        // null = ghost (slug declared but PRD not in allPrds)
  role: Role;
  /** For 'related' role only: which non-hierarchical edge type connects this node to self.
   *  Determines edge style (red dashed for blocks, gray dotted for relates-to, etc.). */
  edgeFromSelf?: EdgeType;
  /** Optional reason text for the edge, surfaced as SVG <title>. */
  edgeReason?: string;
}

// Layout constants. Stage is 600×N; we compute height by row count.
const STAGE_W = 600;
const PARENT_Y = 32;
const SELF_Y = 124;
const CHILD_Y = 256;
const RELATED_ROW_GAP = 22;     // gap between children row and related row
const STAGE_PAD_BOTTOM = 50;

const CARD_PARENT_W = 156;
const CARD_PARENT_H = 46;
const CARD_SELF_W = 184;
const CARD_SELF_H = 60;
const CARD_SIB_W = 140;
const CARD_SIB_H = 46;
const CARD_CHILD_W = 130;
const CARD_CHILD_H = 44;
const CARD_REL_W = 130;
const CARD_REL_H = 44;

export function renderDetailGraph(
  container: HTMLElement,
  prd: Prd,
  allPrds: Prd[]
): void {
  const byId = new Map<string, Prd>();
  for (const p of allPrds) byId.set(p.id, p);

  // ----- Resolve neighborhood -----
  // Source priority: typed `relations` array (post §11 typed-edges), with
  // fallback to legacy `parent`/`children` scalars for older CLI output.
  const relations: PrdRelation[] = prd.relations && prd.relations.length > 0
    ? prd.relations
    : [
        ...(prd.parent ? [{ type: 'parent' as const, slug: prd.parent }] : []),
        ...((prd.children ?? []).map((c) => ({ type: 'child' as const, slug: c }))),
      ];

  // Hierarchical edges → existing 3-row layout.
  const parentRel = relations.find((r) => r.type === 'parent');
  const parentSlug = parentRel?.slug ?? null;
  const parentNode: NeighborhoodNode | null = parentSlug
    ? { id: parentSlug, prd: byId.get(parentSlug) ?? null, role: 'parent' }
    : null;

  const childRels = relations.filter((r) => r.type === 'child');
  const childNodes: NeighborhoodNode[] = childRels.map((r) => ({
    id: r.slug,
    prd: byId.get(r.slug) ?? null,
    role: 'child',
  }));

  // Siblings = parent's other children (excluding self), as before.
  const siblingNodes: NeighborhoodNode[] = [];
  if (parentNode) {
    const ppr = parentNode.prd;
    // Pull from parent's relations OR legacy children scalar.
    const parentChildSlugs = (ppr?.relations
      ? ppr.relations.filter((r) => r.type === 'child').map((r) => r.slug)
      : (ppr?.children ?? []));
    for (const sSlug of parentChildSlugs) {
      if (sSlug === prd.id) continue;
      siblingNodes.push({ id: sSlug, prd: byId.get(sSlug) ?? null, role: 'sibling' });
    }
  }

  // Non-hierarchical edges → 4th "RELATED" row.
  // De-dup by slug: if a slug already appears in the hierarchical layout
  // (parent/sibling/child), DO NOT duplicate-render it here — instead, the
  // typed edge will be drawn from self to its existing position (Phase 2).
  const hierarchicalSlugs = new Set<string>([
    prd.id,
    ...(parentSlug ? [parentSlug] : []),
    ...siblingNodes.map((s) => s.id),
    ...childNodes.map((c) => c.id),
  ]);
  const NON_HIER: ReadonlySet<EdgeType> = new Set(['blocks', 'blocked-by', 'supersedes', 'superseded-by', 'relates-to']);
  const relatedNodes: NeighborhoodNode[] = [];
  const seenRelated = new Set<string>();
  for (const r of relations) {
    if (!NON_HIER.has(r.type)) continue;
    if (hierarchicalSlugs.has(r.slug)) continue; // skip dupes
    if (seenRelated.has(r.slug)) continue;
    seenRelated.add(r.slug);
    relatedNodes.push({
      id: r.slug,
      prd: byId.get(r.slug) ?? null,
      role: 'related',
      edgeFromSelf: r.type,
      edgeReason: r.reason,
    });
  }

  // ----- Empty state -----
  if (!parentNode && childNodes.length === 0 && siblingNodes.length === 0 && relatedNodes.length === 0) {
    container.innerHTML = `
      <div class="detail-graph-empty">
        No parent, children, or siblings recorded for this PRD.
        Use <code>prd new --parent ${escapeHtml(prd.id)} &lt;descriptor&gt;</code> to add one.
      </div>`;
    return;
  }

  // ----- Compute X positions -----
  // Self always centered.
  const selfX = (STAGE_W - CARD_SELF_W) / 2;

  // Parent centered under top row.
  const parentX = (STAGE_W - CARD_PARENT_W) / 2;

  // Siblings flank self left/right. We balance left/right; if odd, extra goes left.
  // For each side, distribute evenly within the available margin.
  const sibCenterY = SELF_Y + CARD_SELF_H / 2 - CARD_SIB_H / 2;
  const leftCount = Math.ceil(siblingNodes.length / 2);
  const rightCount = siblingNodes.length - leftCount;
  const leftSibs = siblingNodes.slice(0, leftCount);
  const rightSibs = siblingNodes.slice(leftCount);

  function sibPositions(count: number, side: 'left' | 'right'): number[] {
    if (count === 0) return [];
    const xs: number[] = [];
    // Available horizontal band on this side: 8px margin … (selfX - 8) for left,
    // or (selfX + CARD_SELF_W + 8) … (STAGE_W - 8) for right.
    const bandStart = side === 'left' ? 8 : selfX + CARD_SELF_W + 8;
    const bandEnd = side === 'left' ? selfX - 8 : STAGE_W - 8;
    const bandWidth = bandEnd - bandStart;
    if (count === 1) {
      xs.push(bandStart + bandWidth - CARD_SIB_W); // hug toward self
      if (side === 'right') xs[0] = bandStart;     // hug toward self on right
      return xs;
    }
    // Multiple siblings on a side: stack vertically. Compute per-card x = end of band aligned.
    for (let i = 0; i < count; i++) xs.push(side === 'left' ? bandStart : bandStart);
    return xs;
  }

  function sibYStack(count: number): number[] {
    // For multiple sibs on one side: stack vertically, center-aligned to sibCenterY.
    if (count <= 1) return [sibCenterY];
    const gap = 6;
    const totalH = count * CARD_SIB_H + (count - 1) * gap;
    const startY = SELF_Y + (CARD_SELF_H - totalH) / 2;
    const ys: number[] = [];
    for (let i = 0; i < count; i++) ys.push(startY + i * (CARD_SIB_H + gap));
    return ys;
  }

  const leftSibXs = sibPositions(leftSibs.length, 'left');
  const rightSibXs = sibPositions(rightSibs.length, 'right');
  const leftSibYs = sibYStack(leftSibs.length);
  const rightSibYs = sibYStack(rightSibs.length);

  // Children evenly distributed across the bottom row.
  let childPositions: { x: number; y: number; node: NeighborhoodNode }[] = [];
  let stageHeight = SELF_Y + CARD_SELF_H + 30; // default if no children
  if (childNodes.length > 0) {
    stageHeight = CHILD_Y + CARD_CHILD_H + STAGE_PAD_BOTTOM;
    const totalW = childNodes.length * CARD_CHILD_W + (childNodes.length - 1) * 14;
    let startX = (STAGE_W - totalW) / 2;
    if (startX < 8) startX = 8;
    childPositions = childNodes.map((n, i) => ({
      x: startX + i * (CARD_CHILD_W + 14),
      y: CHILD_Y,
      node: n,
    }));
  }

  // Related row (4th row) — non-hierarchical edges (blocks, supersedes, relates-to).
  let relatedPositions: { x: number; y: number; node: NeighborhoodNode }[] = [];
  if (relatedNodes.length > 0) {
    const relatedY = (childNodes.length > 0 ? CHILD_Y + CARD_CHILD_H : SELF_Y + CARD_SELF_H) + RELATED_ROW_GAP;
    stageHeight = relatedY + CARD_REL_H + STAGE_PAD_BOTTOM;
    const totalW = relatedNodes.length * CARD_REL_W + (relatedNodes.length - 1) * 14;
    let startX = (STAGE_W - totalW) / 2;
    if (startX < 8) startX = 8;
    relatedPositions = relatedNodes.map((n, i) => ({
      x: startX + i * (CARD_REL_W + 14),
      y: relatedY,
      node: n,
    }));
  }

  // ----- Build SVG -----
  const parts: string[] = [];
  parts.push(`<svg class="dg" viewBox="0 0 ${STAGE_W} ${stageHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`);

  // Soft shadow filter (the variant-4 look).
  parts.push(`
    <defs>
      <filter id="dg-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.18"/>
      </filter>
    </defs>`);

  // ----- Edges (drawn first, behind cards) -----
  if (parentNode) {
    const parentBottomY = PARENT_Y + CARD_PARENT_H;
    const parentCx = parentX + CARD_PARENT_W / 2;
    const selfTopY = SELF_Y;
    const selfCx = selfX + CARD_SELF_W / 2;
    const elbowY = (parentBottomY + selfTopY) / 2;

    // parent → self
    parts.push(edgePath([
      [parentCx, parentBottomY],
      [parentCx, elbowY],
      [selfCx, elbowY],
      [selfCx, selfTopY],
    ]));

    // parent → each left sibling
    leftSibs.forEach((_, i) => {
      const sx = leftSibXs[i] + CARD_SIB_W; // attach to right edge of sibling
      const sy = leftSibYs[i] + CARD_SIB_H / 2;
      parts.push(edgePath([
        [parentCx, parentBottomY],
        [parentCx, elbowY],
        [sx + 12, elbowY],
        [sx + 12, sy],
        [sx, sy],
      ]));
    });

    // parent → each right sibling
    rightSibs.forEach((_, i) => {
      const sx = rightSibXs[i]; // attach to left edge of sibling
      const sy = rightSibYs[i] + CARD_SIB_H / 2;
      parts.push(edgePath([
        [parentCx, parentBottomY],
        [parentCx, elbowY],
        [sx - 12, elbowY],
        [sx - 12, sy],
        [sx, sy],
      ]));
    });
  }

  if (childNodes.length > 0) {
    const selfBottomY = SELF_Y + CARD_SELF_H;
    const selfCx = selfX + CARD_SELF_W / 2;
    const teeY = CHILD_Y - 14;

    // self → tee bar
    parts.push(edgePath([[selfCx, selfBottomY], [selfCx, teeY]]));

    // tee bar spanning all children
    if (childPositions.length > 1) {
      const firstCx = childPositions[0].x + CARD_CHILD_W / 2;
      const lastCx = childPositions[childPositions.length - 1].x + CARD_CHILD_W / 2;
      parts.push(edgePath([[firstCx, teeY], [lastCx, teeY]]));
    }

    // tee → each child
    childPositions.forEach((cp) => {
      const cx = cp.x + CARD_CHILD_W / 2;
      parts.push(edgePath([[cx, teeY], [cx, CHILD_Y]]));
    });
  }

  // Self → each related node (typed edges with edge-type-specific styles).
  if (relatedPositions.length > 0) {
    const selfBottomY = SELF_Y + CARD_SELF_H;
    const selfCx = selfX + CARD_SELF_W / 2;
    relatedPositions.forEach((rp) => {
      const cx = rp.x + CARD_REL_W / 2;
      const targetTop = rp.y;
      const elbowY = (selfBottomY + targetTop) / 2;
      const cls = `dg-edge dg-edge-${rp.node.edgeFromSelf ?? 'relates-to'}`;
      // Right-angle elbow: down from self, horizontal at midpoint, down into target.
      const d = `M ${selfCx} ${selfBottomY} L ${selfCx} ${elbowY} L ${cx} ${elbowY} L ${cx} ${targetTop}`;
      parts.push(`<path class="${cls}" d="${d}" />`);
    });
  }

  // ----- Cards (drawn after edges, on top) -----
  if (parentNode) {
    parts.push(renderCard(parentNode, parentX, PARENT_Y, CARD_PARENT_W, CARD_PARENT_H));
  }

  // Self card
  parts.push(renderCard({ id: prd.id, prd, role: 'self' }, selfX, SELF_Y, CARD_SELF_W, CARD_SELF_H));

  // Siblings
  leftSibs.forEach((n, i) => parts.push(renderCard(n, leftSibXs[i], leftSibYs[i], CARD_SIB_W, CARD_SIB_H)));
  rightSibs.forEach((n, i) => parts.push(renderCard(n, rightSibXs[i], rightSibYs[i], CARD_SIB_W, CARD_SIB_H)));

  // Children
  childPositions.forEach((cp) => {
    parts.push(renderCard(cp.node, cp.x, cp.y, CARD_CHILD_W, CARD_CHILD_H));
  });

  // Related (4th row)
  relatedPositions.forEach((rp) => {
    parts.push(renderCard(rp.node, rp.x, rp.y, CARD_REL_W, CARD_REL_H));
  });

  parts.push(`</svg>`);

  container.innerHTML = parts.join('');

  // ----- Post-render truncation pass -----
  // The per-character estimate above is approximate. After the SVG is in the
  // DOM we can call getComputedTextLength() and shave one char at a time
  // until the text actually fits the card (minus the budget eaten by glyph
  // and age). This catches edge cases like uppercase-heavy titles or unicode
  // characters that don't fit the average-glyph-width assumption.
  container.querySelectorAll<SVGTextElement>('svg.dg .dg-title, svg.dg .dg-self-title, svg.dg .dg-slug, svg.dg .dg-meta').forEach((textEl) => {
    const card = textEl.closest('g.dg-card') as SVGGElement | null;
    if (!card) return;
    const rect = card.querySelector<SVGRectElement>('.dg-rect');
    if (!rect) return;
    const cardW = parseFloat(rect.getAttribute('width') ?? '0');
    const cardX = parseFloat(rect.getAttribute('x') ?? '0');
    // Budget = card right edge - text x - right padding
    const textX = parseFloat(textEl.getAttribute('x') ?? `${cardX}`);
    const isAgeAnchored = textEl.getAttribute('text-anchor') === 'end';
    if (isAgeAnchored) return; // age label is anchored end; skip
    // Reserve ~32px on the right for the age badge if present.
    const hasAge = !!card.querySelector('.dg-age');
    const rightPad = hasAge ? 36 : 8;
    const budget = (cardX + cardW) - textX - rightPad;
    if (budget <= 0) return;

    // Squeeze until fits.
    let len = textEl.getComputedTextLength();
    if (len <= budget) return;
    let txt = textEl.textContent ?? '';
    // Bail if extremely short — leave as-is.
    if (txt.length < 4) return;
    while (len > budget && txt.length > 3) {
      txt = txt.slice(0, -2) + '…';
      // If already ends with '…', the slice removed the … too — re-add.
      if (!txt.endsWith('…')) txt = txt.slice(0, -1) + '…';
      textEl.textContent = txt;
      len = textEl.getComputedTextLength();
    }
  });

  // ----- Click delegation: any card → emit detail-graph-node-clicked -----
  container.querySelectorAll<SVGElement>('.dg-card[data-path]').forEach((g) => {
    g.addEventListener('click', () => {
      const path = g.getAttribute('data-path') ?? '';
      const id = g.getAttribute('data-id') ?? '';
      if (!path) return;
      container.dispatchEvent(new CustomEvent('detail-graph-node-clicked', {
        detail: { path, id },
        bubbles: true,
      }));
    });
  });
}

// -------- helpers --------

function edgePath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  return `<path class="dg-edge" d="${d}" />`;
}

function renderCard(
  node: NeighborhoodNode,
  x: number,
  y: number,
  w: number,
  h: number
): string {
  const role = node.role;
  const ghost = node.prd === null;
  const tier = node.prd?.tier ?? 'scratch';
  const glyph = tierGlyph(tier);
  const title = node.prd?.title ?? `(missing: ${node.id})`;
  const ageLabel = node.prd ? ageStr(node.prd.age_days) : '?';
  const path = node.prd?.path ?? '';
  const slug = node.id;

  // Truncation: title and slug both budgeted by card width.
  // Card has ~10px of horizontal padding each side; glyph eats ~22px on the left,
  // age eats ~28px on the right. So usable text width ≈ w - 60.
  const titleMax = role === 'self' ? Math.floor((w - 70) / 6.5) : Math.floor((w - 60) / 6.2);
  const slugMax = Math.floor((w - 28) / 6.0);
  const truncTitle = truncate(title, titleMax);
  const truncSlug = truncate(slug, slugMax);

  // Self gets the ★ prefix and a slightly different layout (3 lines).
  const selfPrefix = role === 'self' ? '★ ' : '';

  // Build text rows.
  const rows: string[] = [];
  if (role === 'self') {
    rows.push(`<text class="dg-glyph" x="${x + 12}" y="${y + 22}">${escapeXml(glyph)}</text>`);
    rows.push(`<text class="dg-title dg-self-title" x="${x + 32}" y="${y + 22}">${escapeXml(selfPrefix + truncTitle)}</text>`);
    rows.push(`<text class="dg-slug" x="${x + 32}" y="${y + 38}">${escapeXml(truncSlug)}</text>`);
    rows.push(`<text class="dg-age" x="${x + w - 10}" y="${y + 22}" text-anchor="end">SELF</text>`);
    rows.push(`<text class="dg-meta" x="${x + 32}" y="${y + 52}">${escapeXml(`${tier} · ${node.prd?.status?.toLowerCase() ?? '?'}`)}</text>`);
  } else {
    rows.push(`<text class="dg-glyph" x="${x + 10}" y="${y + 20}">${escapeXml(glyph)}</text>`);
    rows.push(`<text class="dg-title" x="${x + 28}" y="${y + 20}">${escapeXml(truncTitle)}</text>`);
    rows.push(`<text class="dg-slug" x="${x + 28}" y="${y + 36}">${escapeXml(truncSlug)}</text>`);
    // For 'related' role: show the edge type label instead of age (it's more useful here).
    const cornerLabel = role === 'related' && node.edgeFromSelf
      ? edgeTypeLabel(node.edgeFromSelf)
      : ageLabel;
    rows.push(`<text class="dg-age" x="${x + w - 8}" y="${y + 20}" text-anchor="end">${escapeXml(cornerLabel)}</text>`);
  }

  const edgeTypeClass = role === 'related' && node.edgeFromSelf
    ? `dg-related-${node.edgeFromSelf}`
    : '';
  const classes = ['dg-card', `dg-${role}`, edgeTypeClass, ghost ? 'dg-ghost' : '']
    .filter(Boolean).join(' ');

  // Title attribute provides the full title+slug on hover, plus reason if present.
  const fullTitle = node.edgeReason
    ? `${title}\n${slug}\n[${node.edgeFromSelf}] ${node.edgeReason}`
    : `${title}\n${slug}`;
  const dataPath = ghost || role === 'self' ? '' : path;
  const dataAttr = dataPath ? `data-path="${escapeAttr(dataPath)}" data-id="${escapeAttr(node.id)}"` : '';

  return `
    <g class="${classes}" ${dataAttr}>
      <title>${escapeXml(fullTitle)}</title>
      <rect class="dg-rect" x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" />
      ${rows.join('\n      ')}
    </g>`;
}

function edgeTypeLabel(t: EdgeType): string {
  switch (t) {
    case 'blocks':         return 'BLOCKS';
    case 'blocked-by':     return 'BLOCKED';
    case 'supersedes':     return 'REPLACES';
    case 'superseded-by':  return 'OBSOLETE';
    case 'relates-to':     return 'RELATED';
    default:               return t.toUpperCase();
  }
}

function tierGlyph(tier: 'scratch' | 'archive' | 'library'): string {
  switch (tier) {
    case 'scratch': return '📝';
    case 'archive': return '📦';
    case 'library': return '📚';
  }
}

function ageStr(days: number): string {
  if (days < 1) return 'today';
  if (days < 60) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function truncate(s: string, max: number): string {
  if (max < 4) return s.slice(0, max);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function escapeHtml(s: string): string {
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

function escapeXml(s: string): string {
  return escapeHtml(s);
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
