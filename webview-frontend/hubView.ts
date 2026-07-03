// The Work Hub, rendered INSIDE the sidebar bundle (not a separate HTML page).
// It is "just another surface" over the same PRD-one data + interactions:
//   • PRD rows go through the EXACT SAME renderTileGrid -> openDetail path as the
//     PRDs tab, so clicking a PRD in the hub opens the identical detail panel
//     (context + copy-command buttons + the connections graph), just compact.
//   • Handoff / issue rows route their click to openDetail on their LINKED PRD,
//     so "handoff -> its PRD connections" reuses the same panel + graph.
// Data (work / issues / handoffs / links) comes from the extension host via
// message-passing (HUB_DATA_REQUEST / HUB_REPOS_REQUEST). PRDs are the same full
// Prd objects the grid already holds — the assembler only decides which belong
// to the repo; the bundle renders them as real tiles.

import type { Prd } from '../src/types';
import { renderTileGrid, getVSCodeApi } from './tileGrid';
import { openDetail } from './sidePanel';

interface HubHandoff { file: string; mtime: number; prdRefs?: string[]; }
interface HubIssue { number: number; title: string; url?: string; labels?: string[]; prdRefs?: string[]; }
interface HubWork { branch?: string; worktrees?: number; dirty?: number; recent?: string[]; }
interface HubConnections { uses: string[]; usedBy: string[]; references: string[]; }
interface HubData {
  ok?: boolean; repo: string; work?: HubWork; prds: { id: string }[];
  issues: HubIssue[]; handoffs: HubHandoff[];
  links?: { byPrd?: Record<string, number[]>; orphans?: number[] };
  connections?: HubConnections;
}
interface RepoEntry { name: string; tracker?: string; prdCount?: number; giteaOpenIssues?: number; }

const TABS = ['Work', 'PRDs', 'Issues', 'Handoffs', 'Links'] as const;
type Tab = typeof TABS[number];

// --- message-passing request/response (bundle -> extension host -> back) ---
let ridSeq = 0;
const pending: Record<number, (v: unknown) => void> = {};
let listening = false;
function ensureListener(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (e) => {
    const m = e.data as { reqId?: number; payload?: unknown } | null;
    if (m && typeof m.reqId === 'number' && pending[m.reqId]) {
      const f = pending[m.reqId];
      delete pending[m.reqId];
      f(m.payload);
    }
  });
}
function req<T>(type: string, extra?: Record<string, unknown>): Promise<T> {
  ensureListener();
  const api = getVSCodeApi();
  return new Promise<T>((res) => {
    const id = ++ridSeq;
    pending[id] = (v) => res(v as T);
    api?.postMessage(Object.assign({ type, reqId: id }, extra || {}));
  });
}

const PALETTE = ['#4ea3ff', '#a98bff', '#3ad0b0', '#f5a35b', '#ef6f6f', '#5cc98a', '#e6c15a', '#e87fb0', '#7dd3fc', '#c084fc', '#fb923c', '#4ade80', '#f472b6', '#38bdf8', '#a3e635', '#fbbf24'];
function repoColor(n: string): string { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
function esc(s: unknown): string { return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string)); }

// --- module state ---
let allPrds: Prd[] = [];
let repo = (window as unknown as { __PRD_HUB_REPO__?: string }).__PRD_HUB_REPO__ || 'twicedata_intra';
let tab: Tab = 'PRDs';
let hub: HubData | null = null;
let repos: RepoEntry[] = [];
let root: HTMLElement | null = null;
// Multi-select: cmd/ctrl/shift-click PRD rows to build a set, then see the
// connections AMONG the selected files. Plain click stays = openDetail.
const selected = new Set<string>();

/** Public entry: render the hub into `container`. Call again with fresh PRDs to
 *  keep the PRD tiles in sync with the grid's data. */
export function renderHubView(container: HTMLElement, currentPrds: Prd[]): void {
  allPrds = currentPrds;
  root = container;
  container.innerHTML = `
    <div class="hub" style="--repoColor:${repoColor(repo)}">
      <div class="hub-head">
        <span class="hub-repo" id="hub-repo">${esc(repo)}</span>
        <span class="hub-cnt" id="hub-cnt"></span>
      </div>
      <div class="hub-tabs" id="hub-tabs"></div>
      <div class="hub-repos" id="hub-repos"></div>
      <div class="hub-list" id="hub-list"><div class="hub-loading">loading…</div></div>
    </div>`;
  renderTabs();
  renderRepoBar();
  void loadRepos();
  void load();
}

/** Update the PRD data backing the hub (called when SYNC_DATA lands while the hub
 *  is visible) so PRD tiles + connection lookups stay fresh. */
export function hubSetPrds(currentPrds: Prd[]): void {
  allPrds = currentPrds;
  if (root && tab === 'PRDs') renderList();
}

function counts(): Record<Tab, number | string> {
  if (!hub) return { Work: '·', PRDs: '·', Issues: '·', Handoffs: '·', Links: '·' };
  const cn = hub.connections || { uses: [], usedBy: [], references: [] };
  return {
    Work: hub.work?.dirty || 0,
    PRDs: (hub.prds || []).length,
    Issues: (hub.issues || []).length,
    Handoffs: (hub.handoffs || []).length,
    Links: cn.uses.length + cn.usedBy.length + cn.references.length
  };
}

function renderTabs(): void {
  const el = root?.querySelector('#hub-tabs');
  if (!el) return;
  const c = counts();
  el.innerHTML = TABS.map((t) => `<button class="hub-tab${t === tab ? ' on' : ''}" data-tab="${t}" type="button">${t}<span class="hub-tc">${c[t]}</span></button>`).join('');
  el.querySelectorAll<HTMLElement>('.hub-tab').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab as Tab;
    selected.clear();
    renderTabs();
    renderList();
  }));
}

async function loadRepos(): Promise<void> {
  const d = await req<{ shown: number; repos: RepoEntry[] }>('HUB_REPOS_REQUEST');
  repos = d?.repos || [];
  const cnt = root?.querySelector('#hub-cnt');
  if (cnt) cnt.textContent = `${d?.shown || repos.length} repos`;
  renderRepoBar();
}

function renderRepoBar(): void {
  const el = root?.querySelector('#hub-repos');
  if (!el) return;
  el.innerHTML = repos.length
    ? repos.map((r) => `<button class="hub-repo-chip${r.name === repo ? ' on' : ''}" data-repo="${esc(r.name)}" style="--rc:${repoColor(r.name)}" type="button" title="${esc(r.name)}"><span class="rc-dot"></span><span class="rc-lbl">${esc(r.name)}</span></button>`).join('')
    : `<span class="hub-repo-chip on"><span class="rc-dot"></span><span class="rc-lbl">${esc(repo)}</span></span>`;
  el.querySelectorAll<HTMLElement>('.hub-repo-chip').forEach((b) => b.addEventListener('click', () => {
    const r = b.dataset.repo;
    if (!r) return;
    repo = r;
    const rn = root?.querySelector('#hub-repo');
    if (rn) rn.textContent = r;
    (root?.querySelector('.hub') as HTMLElement | null)?.style.setProperty('--repoColor', repoColor(r));
    void load();
  }));
}

async function load(): Promise<void> {
  selected.clear();
  const list = root?.querySelector('#hub-list');
  if (list) list.innerHTML = `<div class="hub-loading">loading ${esc(repo)}…</div>`;
  hub = await req<HubData>('HUB_DATA_REQUEST', { repo });
  renderTabs();
  renderList();
}

function prdsForRepo(): Prd[] {
  const ids = new Set((hub?.prds || []).map((p) => p.id));
  return allPrds.filter((p) => ids.has(p.id));
}

function renderList(): void {
  const el = root?.querySelector('#hub-list') as HTMLElement | null;
  if (!el) return;
  const h = hub || ({} as HubData);
  const prdById = new Map(allPrds.map((p) => [p.id, p] as const));
  const openPrd = (id: string): boolean => { const p = prdById.get(id); if (p) { openDetail(p, allPrds); return true; } return false; };

  if (tab === 'PRDs') {
    const rp = prdsForRepo();
    if (!rp.length) { el.innerHTML = `<div class="hub-empty">no PRDs for this repo</div>`; return; }
    el.innerHTML = `<div class="hub-selbar" id="hub-selbar" hidden></div><div class="hub-grid" id="hub-grid"></div>`;
    const grid = el.querySelector('#hub-grid') as HTMLElement;
    // SAME renderer as the grid → SAME tiles → SAME openDetail (context + copy
    // buttons + connections graph). onTileClick adds multi-select on top:
    // plain click = openDetail; cmd/ctrl/shift-click = toggle into the set.
    renderTileGrid(grid, {
      prds: rp, totalBeforeFilter: rp.length, allPrds,
      onTileClick: (prd, tileEl, ev) => {
        if ((ev as MouseEvent).metaKey || (ev as MouseEvent).ctrlKey || (ev as MouseEvent).shiftKey) {
          if (selected.has(prd.id)) { selected.delete(prd.id); tileEl.classList.remove('sel'); }
          else { selected.add(prd.id); tileEl.classList.add('sel'); }
          updateSelBar();
        } else {
          openDetail(prd, allPrds);
        }
      }
    });
    updateSelBar();
    return;
  }

  if (tab === 'Handoffs') {
    const hs = h.handoffs || [];
    if (!hs.length) { el.innerHTML = `<div class="hub-empty">no handoffs linked<br><span class="hub-sub">~/handoff/</span></div>`; return; }
    el.innerHTML = hs.map((x, i) => {
      const linked = (x.prdRefs || []).filter((id) => prdById.has(id));
      const badge = linked.length
        ? `<span class="hub-link">↑ ${esc((prdById.get(linked[0]) as Prd).title.slice(0, 28))}</span>`
        : `<span class="hub-link none">no PRD link</span>`;
      return `<div class="hub-tile" data-i="${i}" tabindex="0"><div class="hub-tt">⇲ ${esc(x.file)}</div>${badge}</div>`;
    }).join('');
    el.querySelectorAll<HTMLElement>('.hub-tile').forEach((t) => t.addEventListener('click', () => {
      const x = hs[Number(t.dataset.i)];
      const linked = (x.prdRefs || []).filter((id) => prdById.has(id));
      // Primary click = open the connected PRD's detail (the connection is the point).
      if (linked.length && openPrd(linked[0])) return;
      getVSCodeApi()?.postMessage({ type: 'HUB_OPEN_HANDOFF', file: x.file });
    }));
    return;
  }

  if (tab === 'Issues') {
    const is = h.issues || [];
    if (!is.length) { el.innerHTML = `<div class="hub-empty">no open issues</div>`; return; }
    el.innerHTML = is.map((x, i) => {
      const linked = (x.prdRefs || []).filter((id) => prdById.has(id));
      const badge = linked.length
        ? `<span class="hub-link">↑ ${esc((prdById.get(linked[0]) as Prd).title.slice(0, 26))}</span>`
        : `<span class="hub-link none">no PRD</span>`;
      return `<div class="hub-tile" data-i="${i}" tabindex="0"><div class="hub-trow"><span class="hub-num">#${esc(x.number)}</span><span class="hub-tt">${esc(x.title)}</span></div>${badge}${x.url ? `<button class="hub-ext" data-url="${esc(x.url)}" title="Open issue in browser" type="button">↗</button>` : ''}</div>`;
    }).join('');
    el.querySelectorAll<HTMLElement>('.hub-ext').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const url = b.dataset.url; if (url) getVSCodeApi()?.postMessage({ type: 'HUB_OPEN_URL', url });
    }));
    el.querySelectorAll<HTMLElement>('.hub-tile').forEach((t) => t.addEventListener('click', () => {
      const x = is[Number(t.dataset.i)];
      const linked = (x.prdRefs || []).filter((id) => prdById.has(id));
      if (linked.length && openPrd(linked[0])) return;
      if (x.url) getVSCodeApi()?.postMessage({ type: 'HUB_OPEN_URL', url: x.url });
    }));
    return;
  }

  if (tab === 'Work') {
    const w = h.work || {};
    const recent = w.recent || [];
    el.innerHTML =
      `<div class="hub-work">branch <b>${esc(w.branch || '?')}</b> · ${w.worktrees || 0} worktree(s) · ${w.dirty || 0} dirty</div>` +
      (recent.length ? recent.map((c) => `<div class="hub-tile static"><div class="hub-tt wrap">${esc(c)}</div></div>`).join('') : `<div class="hub-empty">no recent commits</div>`);
    return;
  }

  // Links: cross-repo connections; click a repo name to jump to it.
  const cn = h.connections || { uses: [], usedBy: [], references: [] };
  const group = (label: string, arr: string[], arrow: string): string => arr.length
    ? `<div class="hub-conn-label">${label}</div>` + arr.map((rn) => `<div class="hub-tile conn" data-repo="${esc(rn)}" tabindex="0"><span class="cdot" style="background:${repoColor(rn)}"></span><span class="hub-tt">${arrow} ${esc(rn)}</span></div>`).join('')
    : '';
  const html = group('Uses →', cn.uses, '→') + group('Used by ←', cn.usedBy, '←') + group('References', cn.references, '·');
  el.innerHTML = html || `<div class="hub-empty">no detected connections</div>`;
  el.querySelectorAll<HTMLElement>('.hub-tile.conn').forEach((t) => t.addEventListener('click', () => {
    const r = t.dataset.repo;
    if (!r) return;
    repo = r;
    const rn = root?.querySelector('#hub-repo'); if (rn) rn.textContent = r;
    (root?.querySelector('.hub') as HTMLElement | null)?.style.setProperty('--repoColor', repoColor(r));
    renderRepoBar();
    void load();
  }));
}

/** Show/refresh the multi-select action bar above the PRD grid. */
function updateSelBar(): void {
  const bar = root?.querySelector('#hub-selbar') as HTMLElement | null;
  if (!bar) return;
  const n = selected.size;
  if (!n) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  bar.innerHTML =
    `<span class="hub-seln">${n} selected</span>` +
    `<button class="hub-selbtn" id="hub-conn" type="button"${n < 2 ? ' disabled' : ''}>⇄ Connections</button>` +
    `<button class="hub-selbtn ghost" id="hub-clear" type="button">Clear</button>`;
  bar.querySelector('#hub-conn')?.addEventListener('click', () => { if (selected.size >= 2) renderMultiConnections(); });
  bar.querySelector('#hub-clear')?.addEventListener('click', () => {
    selected.clear();
    root?.querySelectorAll('.hub-grid .tile.sel').forEach((t) => t.classList.remove('sel'));
    updateSelBar();
  });
}

/** Connections AMONG the selected PRDs: direct edges (parent/child/relations)
 *  between them, plus shared neighbors ≥2 of them link to. Slide-up panel. */
function renderMultiConnections(): void {
  const byId = new Map(allPrds.map((p) => [p.id, p] as const));
  const sel = [...selected].map((id) => byId.get(id)).filter(Boolean) as Prd[];
  if (sel.length < 2) return;
  const ids = new Set(sel.map((p) => p.id));
  const nm = (id: string): string => byId.get(id)?.title || id;

  const edges: { a: string; b: string; type: string }[] = [];
  const seen = new Set<string>();
  const addEdge = (a: string, b: string, type: string): void => {
    if (a === b || !ids.has(b)) return;
    const k = [a, b, type].join('|'); if (seen.has(k)) return; seen.add(k);
    edges.push({ a, b, type });
  };
  const neigh: Record<string, number> = {};
  for (const p of sel) {
    const refs = new Set<string>();
    if (p.parent) { refs.add(p.parent); addEdge(p.id, p.parent, 'parent'); }
    (p.children || []).forEach((c) => { refs.add(c); addEdge(p.id, c, 'child'); });
    (p.relations || []).forEach((r) => { refs.add(r.slug); addEdge(p.id, r.slug, r.type); });
    refs.forEach((rf) => { if (!ids.has(rf)) neigh[rf] = (neigh[rf] || 0) + 1; });
  }
  const shared = Object.entries(neigh).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);

  let panel = document.getElementById('hub-conn-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'hub-conn-panel'; panel.className = 'detail-panel hub-conn-panel'; document.body.appendChild(panel); }
  panel.innerHTML =
    `<button class="detail-close" type="button" aria-label="Close">×</button>` +
    `<h2 class="detail-title">Connections · ${sel.length} PRDs</h2>` +
    `<div class="detail-section-label">Selected</div>` +
    `<div class="hcp-chips">${sel.map((p) => `<button class="hcp-chip" data-id="${esc(p.id)}" type="button">${esc(p.title)}</button>`).join('')}</div>` +
    `<div class="detail-section-label">Direct links between them</div>` +
    (edges.length
      ? `<div class="hcp-edges">${edges.map((e) => `<div class="hcp-edge"><span class="hcp-a" data-id="${esc(e.a)}">${esc(nm(e.a))}</span><span class="hcp-rel">${esc(e.type)} →</span><span class="hcp-a" data-id="${esc(e.b)}">${esc(nm(e.b))}</span></div>`).join('')}</div>`
      : `<div class="hcp-empty">no direct links among the selected PRDs</div>`) +
    `<div class="detail-section-label">Shared connections (linked by ≥2)</div>` +
    (shared.length
      ? `<div class="hcp-edges">${shared.map(([id, c]) => `<div class="hcp-edge"><span class="hcp-a" data-id="${esc(id)}">${esc(nm(id))}</span><span class="hcp-rel">linked by ${c}</span></div>`).join('')}</div>`
      : `<div class="hcp-empty">no shared connections</div>`);
  panel.querySelector('.detail-close')?.addEventListener('click', () => panel?.remove());
  panel.querySelectorAll<HTMLElement>('[data-id]').forEach((b) => b.addEventListener('click', () => {
    const p = byId.get(b.dataset.id || ''); if (p) openDetail(p, allPrds);
  }));
}
