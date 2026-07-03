// Full-size "Search & Read Station" (Phase 1) — the wide-screen browser app.
// A synthesis surface (the sidebar is for execution): cross-repo full-text
// SEARCH (server-side ripgrep) + a full-markdown DEEP READER, with the same
// connections graph + copy-command model as the sidebar (rewired to the
// browser clipboard). 3 panes: left = search+results, center = rendered
// markdown, right = metadata + detailGraph + copy-Claude-command buttons.

import { marked } from 'marked';
import type { Prd } from '../src/types';
import { renderDetailGraph } from './detailGraph';
import { actionCommandsFor } from '../src/actions/commandTemplates';

let ALL: Prd[] = [];
let byPath = new Map<string, Prd>();
// Pin-to-Compare + reader state.
let currentPath = '';
let pinnedPath: string | null = null;
const rawCache = new Map<string, { content: string; type: string }>();
// Pulse Strip: per-file last-touched times for the activity histogram.
let pulseItems: { path: string; type: string; mtime: number; birthtime: number }[] = [];

const esc = (s: unknown): string => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m] as string));
const basename = (p: string): string => p.split('/').pop() || p;

interface SearchMatch { line: number; text: string; }
interface SearchResult { path: string; type: 'prd' | 'handoff' | 'other'; count: number; matches: SearchMatch[]; }

export async function renderStation(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="station">
      <aside class="st-left">
        <div class="st-brand"><b>prdone</b><span class="st-sub">STATION</span><a class="st-navlink" href="/kanban">kanban ↗</a></div>
        <div class="st-search"><input id="st-q" type="search" placeholder="Search all PRDs + handoffs…" autocomplete="off" spellcheck="false"></div>
        <div class="st-results" id="st-results"></div>
      </aside>
      <main class="st-center" id="st-center">
        <div class="st-ctoolbar" id="st-ctoolbar" hidden></div>
        <div class="st-panes" id="st-panes"><div class="st-blank">Search across every PRD + handoff, or pick one to read full-size.</div></div>
      </main>
      <aside class="st-right" id="st-right"><div class="st-blank2">Pick a document to see its connections + commands.</div></aside>
      <div class="st-pulse" id="st-pulse" title="Activity — files touched over time"></div>
    </div>`;
  try {
    const data = await (await fetch('/api/prds')).json();
    ALL = data.ok === false ? [] : (data.prds || []);
    byPath = new Map(ALL.map((p) => [p.path, p]));
  } catch { ALL = []; }
  renderRecent();
  void loadPulse();

  const q = document.getElementById('st-q') as HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => void runSearch(q.value.trim()), 220); });
}

function renderRecent(): void {
  const el = document.getElementById('st-results');
  if (!el) return;
  const recent = [...ALL].sort((a, b) => a.age_days - b.age_days).slice(0, 50);
  el.innerHTML = `<div class="st-rlabel">${recent.length} PRDs · newest first</div>` +
    recent.map((p) => `<div class="st-result" data-path="${esc(p.path)}"><div class="st-rtop"><span class="st-rtype ${esc(p.tier)}">${esc(p.tier)}</span><span class="st-rtitle">${esc(p.title)}</span><span class="st-rcount">${p.age_days}d</span></div></div>`).join('');
  wireResults(el);
}

async function runSearch(term: string): Promise<void> {
  const el = document.getElementById('st-results');
  if (!el) return;
  if (!term) { renderRecent(); return; }
  el.innerHTML = `<div class="st-rlabel">searching…</div>`;
  let data: { ok: boolean; error?: string; results?: SearchResult[] };
  try { data = await (await fetch('/api/search?q=' + encodeURIComponent(term))).json(); }
  catch { el.innerHTML = `<div class="st-rlabel">search failed</div>`; return; }
  if (data.ok === false) { el.innerHTML = `<div class="st-rlabel err">${esc(data.error)}</div>`; return; }
  const results = data.results || [];
  if (!results.length) { el.innerHTML = `<div class="st-rlabel">no matches for “${esc(term)}”</div>`; return; }
  el.innerHTML = `<div class="st-rlabel">${results.length} files match</div>` + results.map((r) => {
    const prd = byPath.get(r.path);
    const title = prd ? prd.title : basename(r.path);
    const snip = (r.matches || []).slice(0, 2).map((m) => `<div class="st-snip">${esc(m.text)}</div>`).join('');
    return `<div class="st-result" data-path="${esc(r.path)}"><div class="st-rtop"><span class="st-rtype ${esc(r.type)}">${esc(r.type)}</span><span class="st-rtitle">${esc(title)}</span><span class="st-rcount">${r.count}</span></div>${snip}</div>`;
  }).join('');
  wireResults(el);
}

function wireResults(el: HTMLElement): void {
  el.querySelectorAll<HTMLElement>('.st-result').forEach((r) => r.addEventListener('click', () => {
    el.querySelectorAll('.st-result.on').forEach((x) => x.classList.remove('on'));
    r.classList.add('on');
    void openDoc(r.dataset.path || '');
  }));
}

async function ensureRaw(p: string): Promise<{ content: string; type: string } | null> {
  const hit = rawCache.get(p);
  if (hit) return hit;
  try {
    const data = await (await fetch('/api/raw?path=' + encodeURIComponent(p))).json();
    if (data.ok === false) return null;
    const v = { content: data.content ?? '', type: data.type || 'other' };
    rawCache.set(p, v);
    return v;
  } catch { return null; }
}

async function openDoc(p: string): Promise<void> {
  currentPath = p;
  const panes = document.getElementById('st-panes');
  if (panes) panes.innerHTML = `<div class="st-blank">loading…</div>`;
  await renderCenter();
  const raw = rawCache.get(p);
  const right = document.getElementById('st-right');
  if (right) renderRight(right, p, raw?.type || 'other');
}

/** Render the center: one doc, or two side-by-side when a doc is pinned for
 *  comparison. Pin-to-Compare is the wide-screen-only power move. */
async function renderCenter(): Promise<void> {
  const panes = document.getElementById('st-panes');
  const toolbar = document.getElementById('st-ctoolbar');
  if (!panes) return;
  const split = !!(pinnedPath && currentPath && pinnedPath !== currentPath);
  const need = split ? [pinnedPath as string, currentPath] : [currentPath];
  const raws = await Promise.all(need.map(ensureRaw));
  panes.className = 'st-panes' + (split ? ' split' : '');
  panes.innerHTML = need.map((p, i) => {
    const raw = raws[i];
    const title = byPath.get(p)?.title || basename(p);
    const head = split ? `<div class="st-panehd">${i === 0 ? '📌 ' : ''}${esc(title)}</div>` : '';
    const body = raw ? (marked.parse(raw.content) as string) : `<div class="st-blank">could not load</div>`;
    return `<div class="st-pane">${head}<article class="st-doc">${body}</article></div>`;
  }).join('');

  if (toolbar) {
    if (!currentPath) { toolbar.hidden = true; toolbar.innerHTML = ''; }
    else {
      toolbar.hidden = false;
      const title = byPath.get(currentPath)?.title || basename(currentPath);
      toolbar.innerHTML = `<span class="st-ctitle">${esc(title)}</span>` + (pinnedPath
        ? `<button class="st-pinbtn on" id="st-unpin" type="button">📌 Unpin</button><span class="st-cmpare">${split ? 'comparing ↔' : 'open another to compare'}</span>`
        : `<button class="st-pinbtn" id="st-pin" type="button">📌 Pin to compare</button>`);
      toolbar.querySelector('#st-pin')?.addEventListener('click', () => { pinnedPath = currentPath; void renderCenter(); });
      toolbar.querySelector('#st-unpin')?.addEventListener('click', () => { pinnedPath = null; void renderCenter(); });
    }
  }
}

async function loadPulse(): Promise<void> {
  try {
    const data = await (await fetch('/api/pulse')).json();
    pulseItems = data.ok === false ? [] : (data.items || []);
  } catch { pulseItems = []; }
  renderPulse();
}

/** The Pulse Strip: a tiny linear activity histogram (files touched per week)
 *  across the bottom. Click a bar to filter the list to that week. */
function renderPulse(): void {
  const el = document.getElementById('st-pulse');
  if (!el) return;
  if (!pulseItems.length) { el.innerHTML = ''; return; }
  const WEEK = 7 * 24 * 3600 * 1000;
  const weeks = 52;
  const start = Date.now() - weeks * WEEK;
  const buckets = Array.from({ length: weeks }, () => ({ prd: 0, handoff: 0 }));
  const mtimeByPath = new Map<string, number>();
  for (const it of pulseItems) {
    mtimeByPath.set(it.path, it.mtime);
    if (it.mtime < start) continue;
    const idx = Math.min(weeks - 1, Math.floor((it.mtime - start) / WEEK));
    if (idx >= 0) { if (it.type === 'handoff') buckets[idx].handoff++; else buckets[idx].prd++; }
  }
  const max = Math.max(1, ...buckets.map((b) => b.prd + b.handoff));
  el.innerHTML =
    `<div class="st-pulse-lbl">activity · 52w</div><div class="st-pulse-bars">` +
    buckets.map((b, i) => {
      const total = b.prd + b.handoff;
      const h = total ? Math.max(3, Math.round((total / max) * 34)) : 0;
      const ws = start + i * WEEK;
      const recent = i >= weeks - 8; // last 8 weeks brighter
      const dom = b.handoff > b.prd ? 'handoff' : 'prd';
      const title = total ? `${new Date(ws).toISOString().slice(0, 10)} · ${b.prd} PRD${b.prd !== 1 ? 's' : ''}${b.handoff ? `, ${b.handoff} handoff` : ''}` : '';
      return `<span class="st-bar ${dom}${total ? '' : ' empty'}${recent ? ' recent' : ''}" data-i="${i}" style="height:${h}px" title="${esc(title)}"></span>`;
    }).join('') + `</div>`;
  el.querySelectorAll<HTMLElement>('.st-bar').forEach((bar) => bar.addEventListener('click', () => {
    const i = Number(bar.dataset.i); const s = start + i * WEEK; const e = s + WEEK;
    const hits = ALL.filter((p) => { const mt = mtimeByPath.get(p.path); return mt != null && mt >= s && mt < e; });
    renderFiltered(hits, `week of ${new Date(s).toISOString().slice(0, 10)}`);
  }));
}

function renderFiltered(prds: Prd[], label: string): void {
  const el = document.getElementById('st-results');
  if (!el) return;
  if (!prds.length) { el.innerHTML = `<div class="st-rlabel">no PRDs touched · ${esc(label)}</div>`; return; }
  el.innerHTML = `<div class="st-rlabel">${prds.length} · ${esc(label)}</div>` +
    prds.map((p) => `<div class="st-result" data-path="${esc(p.path)}"><div class="st-rtop"><span class="st-rtype ${esc(p.tier)}">${esc(p.tier)}</span><span class="st-rtitle">${esc(p.title)}</span><span class="st-rcount">${p.age_days}d</span></div></div>`).join('');
  wireResults(el);
}

function renderRight(right: HTMLElement, p: string, type: string): void {
  const prd = byPath.get(p);
  if (!prd) {
    right.innerHTML = `<div class="st-meta"><div class="st-mlabel">${esc(type)}</div><div class="st-mpath">${esc(basename(p))}</div></div>` +
      copyBlock([{ label: 'Copy path', command: p }]);
    wireCopy(right); return;
  }
  right.innerHTML =
    `<div class="st-meta"><div class="st-mtitle">${esc(prd.title)}</div>` +
    `<div class="st-mlabel">${esc(prd.tier)} · ${esc(prd.status)} · ${prd.age_days}d</div>` +
    `<div class="st-mstat">${prd.decisions} decisions · ${prd.subagents} subagents</div></div>` +
    `<div class="st-mlabel2">Connections</div><div class="st-graph" id="st-graph"></div>` +
    `<div class="st-mlabel2">Claude Code · click to copy</div>` +
    copyBlock(actionCommandsFor(prd).filter((c) => c.kind !== 'open-file'));
  const g = right.querySelector('#st-graph') as HTMLElement | null;
  if (g) {
    try { renderDetailGraph(g, prd, ALL); } catch { /* graph is best-effort */ }
    // Phase 2: clicking a connected node in the graph navigates the center
    // reader to that PRD — traverse the knowledge graph without leaving the app.
    g.addEventListener('detail-graph-node-clicked', (ev) => {
      const d = (ev as CustomEvent<{ path: string; id: string }>).detail;
      if (!d?.path) return; // ghost node (slug with no PRD file) — nothing to open
      const results = document.getElementById('st-results');
      results?.querySelectorAll<HTMLElement>('.st-result').forEach((row) =>
        row.classList.toggle('on', row.dataset.path === d.path));
      void openDoc(d.path);
    });
  }
  wireCopy(right);
}

function copyBlock(cmds: { label: string; command: string }[]): string {
  return `<div class="st-cmds">` + cmds.map((c) =>
    `<button class="st-cmd" data-cmd="${esc(c.command)}" type="button"><span class="st-clabel">📋 ${esc(c.label)}</span><span class="st-ctext">${esc(c.command)}</span></button>`).join('') + `</div>`;
}
function wireCopy(scope: HTMLElement): void {
  scope.querySelectorAll<HTMLElement>('.st-cmd').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.cmd || ''); b.classList.add('copied'); setTimeout(() => b.classList.remove('copied'), 900); } catch { /* clipboard may be blocked */ }
  }));
}
