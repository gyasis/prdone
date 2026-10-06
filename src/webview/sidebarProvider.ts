// Sidebar WebviewViewProvider for the PRD Visualizer extension.
// Loads the bundled frontend (`dist/frontend/bundle.js` + `webview-frontend/styles.css`),
// listens for actions, broadcasts SYNC_DATA after every prdSource.refresh().

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { refresh as refreshPrdSource } from '../data/prdSource';
import { listHandoffs } from '../data/handoffSource';
import { handleWebviewAction } from '../actions/messageHandler';
import { renderDoctorView } from './doctorView';
import { resolveStartPath } from '../lib/resolveStartPath';
import type { ExtensionResponse } from '../types';

export class SidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'prd.sidebar';

  private view?: vscode.WebviewView;
  private outputChannel: vscode.OutputChannel;
  // Audit fix: monotonic refresh generation. Concurrent refreshes can race —
  // we only commit the latest issued generation; older in-flight responses
  // are dropped so the user never sees an older snapshot overwrite a newer one.
  private refreshGen = 0;
  // Per-view subscription bag. Cleared on every resolveWebviewView and on
  // view dispose, so opening + closing the panel cannot accumulate listeners.
  private viewDisposables: vscode.Disposable[] = [];
  private disposed = false;

  // Lazily-required cross-repo hub assembler (hub/assemble.cjs). Same module the
  // kanban server uses; called in the extension host so the Work Hub renders
  // NATIVELY in the sidebar (no server, no iframe) — data flows over webview
  // message-passing, exactly like the PRD grid.
  private hubModCache?: {
    assembleHub: (repo: string) => unknown;
    listRepos: (all: boolean, refresh: boolean) => unknown;
  };
  // Short-TTL memo so re-opening the hub / switching tabs is instant instead of
  // re-shelling to gh/git/prd every time.
  private hubDataCache = new Map<string, { ts: number; data: unknown }>();
  private reposCache?: { ts: number; data: unknown };
  private static readonly HUB_TTL_MS = 60_000;
  // Cross-repo issue titles for hub search. Populated OUT-OF-PROCESS (warmIssues)
  // because the aggregation shells to gh/git for every repo — running it inline
  // would freeze the extension host. Cached 5 min; search reuses it.
  private allIssuesCache?: { ts: number; issues: Array<{ number: number; title: string; url?: string; repo?: string }> };
  private issuesWarming = false;
  private static readonly ISSUES_TTL_MS = 5 * 60_000;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.outputChannel = vscode.window.createOutputChannel('prdone');
  }

  /** eval('require') keeps esbuild from bundling the .cjs; same trick as server.ts. */
  private hubMod(): NonNullable<SidebarProvider['hubModCache']> {
    if (!this.hubModCache) {
      const nodeRequire = eval('require') as NodeRequire;
      this.hubModCache = nodeRequire(
        path.join(this.extensionUri.fsPath, 'hub', 'assemble.cjs')
      );
    }
    return this.hubModCache!;
  }

  /** Called by VSCode when the extension is deactivated. */
  dispose(): void {
    this.disposed = true;
    this.disposeView();
    this.outputChannel.dispose();
  }

  /** Tear down everything attached to the current view. Idempotent. */
  private disposeView(): void {
    for (const d of this.viewDisposables.splice(0)) {
      try { d.dispose(); } catch { /* ignore */ }
    }
    this.view = undefined;
    // Invalidate any in-flight refresh so its result is dropped on return.
    this.refreshGen++;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    // If VSCode re-resolves the view (rare but possible), tear down the prior
    // wiring first so we never end up with two message listeners.
    this.disposeView();
    if (this.disposed) return;
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      // Note: WebviewView (unlike WebviewPanel) cannot opt into
      // retainContextWhenHidden via WebviewOptions. Context is reliably
      // disposed when the view is hidden, so we defend against listener
      // accumulation in two places instead:
      //   1. viewDisposables tear-down on every resolveWebviewView + onDidDispose
      //   2. Idempotent boot guard in webview-frontend/index.ts (__PRD_BOOTED_*)
      localResourceRoots: [
        vscode.Uri.file(path.join(this.extensionUri.fsPath, 'dist')),
        vscode.Uri.file(path.join(this.extensionUri.fsPath, 'webview-frontend'))
      ]
    };
    view.webview.html = this.getHtml(view.webview);

    // Handle messages from the webview (validated via messageHandler).
    // Track the subscription so it is disposed when the view goes away.
    this.viewDisposables.push(
      view.webview.onDidReceiveMessage((msg: unknown) => {
        // Intercept hub data requests before the validated PRD action union.
        if (this.tryHandleHubMessage(msg)) return;
        handleWebviewAction(msg, {
          sendResponse: (resp) => this.sendToWebview(resp),
          triggerRefresh: () => this.refresh()
        });
      })
    );

    // Audit fix: when VSCode disposes the view (panel collapsed permanently,
    // workspace closed, etc.) we MUST drop all references so listeners and
    // in-flight refreshes can be garbage-collected.
    this.viewDisposables.push(view.onDidDispose(() => this.disposeView()));

    // Initial data fetch.
    this.refresh();
  }

  /** Hub data + light open actions from the bundle's hub surface. PRD row clicks
   *  do NOT come here — they reuse openDetail (OPEN_FILE / COPY_COMMAND) via the
   *  validated action union, exactly like the grid. Returns true if handled. */
  private tryHandleHubMessage(msg: unknown): boolean {
    if (typeof msg !== 'object' || msg === null) return false;
    const m = msg as { type?: unknown; reqId?: unknown; repo?: unknown };
    if (m.type === 'HUB_REPOS_REQUEST') {
      // The hub surface just opened — start warming cross-repo issues in the
      // background so search has them ready without a freeze.
      this.warmIssues();
      this.respondHub(m.reqId, () => {
        const now = Date.now();
        if (!this.reposCache || now - this.reposCache.ts > SidebarProvider.HUB_TTL_MS) {
          this.reposCache = { ts: now, data: this.hubMod().listRepos(false, false) };
        }
        return this.reposCache.data;
      });
      return true;
    }
    if (m.type === 'HUB_SEARCH_REQUEST') {
      this.handleHubSearch(m.reqId, String((m as { q?: unknown }).q ?? ''));
      return true;
    }
    if (m.type === 'HUB_DATA_REQUEST') {
      const repo = String(m.repo ?? '');
      this.respondHub(m.reqId, () => {
        const now = Date.now();
        const hit = this.hubDataCache.get(repo);
        if (hit && now - hit.ts < SidebarProvider.HUB_TTL_MS) return hit.data;
        const data = this.hubMod().assembleHub(repo);
        this.hubDataCache.set(repo, { ts: now, data });
        return data;
      });
      return true;
    }
    if (m.type === 'HUB_OPEN_URL') {
      const url = String((m as { url?: unknown }).url ?? '');
      if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
      return true;
    }
    if (m.type === 'HUB_OPEN_HANDOFF') {
      const file = String((m as { file?: unknown }).file ?? '');
      if (file) void vscode.window.showTextDocument(vscode.Uri.file(path.join(os.homedir(), 'handoff', file)));
      return true;
    }
    if (m.type === 'HUB_COPY_HANDOFF') {
      // Copy the pickup line a fresh Claude Code session needs -- the same wording
      // the /handoff skill prints. The ABSOLUTE path is resolved here because the
      // webview cannot know $HOME, and basename() keeps the copy inside ~/handoff/.
      const file = path.basename(String((m as { file?: unknown }).file ?? ''));
      if (!file) return true;
      const abs = path.join(os.homedir(), 'handoff', file);
      if (!fs.existsSync(abs)) {
        void vscode.window.showWarningMessage(`Handoff not found: ${abs}`);
        return true;
      }
      const cmd = `read the handoff at ${abs} and continue`;
      vscode.env.clipboard.writeText(cmd).then(
        () => vscode.window.setStatusBarMessage(`$(clippy) Copied handoff command: ${file}`, 4000),
        (err: Error) => void vscode.window.showErrorMessage(`Could not copy handoff command: ${err.message}`)
      );
      return true;
    }
    return false;
  }

  /** Run a hub producer and post {reqId, payload} back to the webview; on error
   *  post an {error} payload so the view can surface it instead of hanging. */
  private respondHub(reqId: unknown, produce: () => unknown): void {
    let payload: unknown;
    try {
      payload = produce();
    } catch (err) {
      payload = { ok: false, error: (err as Error).message };
      this.outputChannel.appendLine(`[prd] hub request failed: ${(err as Error).message}`);
    }
    this.view?.webview.postMessage({ reqId, payload });
  }

  /** The whitelisted markdown roots hub search greps: PRDs + handoffs. */
  private searchRoots(): { roots: string[]; prdRoot: string; handoffRoot: string } {
    const home = os.homedir();
    const prdRoot = process.env.PRD_ROOT || path.join(home, 'dev', 'prd');
    const handoffRoot = path.join(home, 'handoff');
    return { roots: [prdRoot, handoffRoot], prdRoot, handoffRoot };
  }

  /** Populate allIssuesCache OUT OF PROCESS so the gh/git fan-out never blocks the
   *  extension host. Runs assemble.cjs's assembleHub('(all-issues)') in a child
   *  node process (electron-as-node) and caches the returned issue list. */
  private warmIssues(): void {
    if (this.issuesWarming) return;
    if (this.allIssuesCache && Date.now() - this.allIssuesCache.ts < SidebarProvider.ISSUES_TTL_MS) return;
    this.issuesWarming = true;
    const assemblePath = path.join(this.extensionUri.fsPath, 'hub', 'assemble.cjs');
    const script =
      `try{const m=require(${JSON.stringify(assemblePath)});` +
      `const r=m.assembleHub('(all-issues)');` +
      `process.stdout.write(JSON.stringify((r&&r.issues)||[]));}catch(e){process.stdout.write('[]');}`;
    cp.execFile(
      process.execPath, ['-e', script],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, maxBuffer: 32 * 1024 * 1024, timeout: 60_000 },
      (err, stdout) => {
        this.issuesWarming = false;
        if (err) { this.outputChannel.appendLine(`[prd] hub issue warm failed: ${err.message}`); return; }
        try { this.allIssuesCache = { ts: Date.now(), issues: JSON.parse(String(stdout) || '[]') }; }
        catch { this.allIssuesCache = { ts: Date.now(), issues: [] }; }
        this.outputChannel.appendLine(`[prd] hub issues warmed: ${this.allIssuesCache.issues.length}`);
      }
    );
  }

  /** Cross-tab hub search: ripgrep over PRD + handoff markdown (async) folded with
   *  cross-repo issue-title matches from the warmed cache. Posts a single
   *  {reqId, payload:{ok,q,files,issues,issuesPending}} back to the webview. */
  private handleHubSearch(reqId: unknown, q: string): void {
    const post = (payload: unknown): void => { this.view?.webview.postMessage({ reqId, payload }); };
    q = q.trim();
    if (!q) { post({ ok: true, q, files: [], issues: [], issuesPending: false }); return; }
    this.warmIssues(); // ensure the issue cache is warming if it isn't yet
    const { roots, prdRoot, handoffRoot } = this.searchRoots();
    const classify = (p: string): string =>
      p.startsWith(handoffRoot + path.sep) ? 'handoff' : p.startsWith(prdRoot + path.sep) ? 'prd' : 'other';
    const lc = q.toLowerCase();
    const issuesAll = this.allIssuesCache?.issues || [];
    const issues = issuesAll
      .filter((i) => String(i.title || '').toLowerCase().includes(lc) || ('#' + i.number) === q)
      .slice(0, 60);
    const issuesPending = !this.allIssuesCache;
    cp.execFile(
      'rg', ['--json', '-i', '--max-count', '8', '-g', '*.md', '-g', '!node_modules', '-e', q, ...roots],
      { maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
      (err, stdout) => {
        const byFile: Record<string, { path: string; type: string; count: number; matches: { line: number; text: string }[] }> = {};
        if (!(err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
          for (const line of String(stdout).split('\n')) {
            if (!line) continue;
            let o: { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
            try { o = JSON.parse(line); } catch { continue; }
            if (o.type !== 'match' || !o.data?.path?.text) continue;
            const p = o.data.path.text;
            const e = (byFile[p] ??= { path: p, type: classify(p), count: 0, matches: [] });
            e.count++;
            if (e.matches.length < 3) e.matches.push({ line: o.data.line_number ?? 0, text: (o.data.lines?.text ?? '').trim().slice(0, 200) });
          }
        }
        const files = Object.values(byFile)
          .sort((a, b) => (a.type === b.type ? b.count - a.count : a.type === 'prd' ? -1 : b.type === 'prd' ? 1 : 0))
          .slice(0, 60);
        post({ ok: true, q, files, issues, issuesPending });
      }
    );
  }

  /** Public so extension.ts can wire onDidSaveTextDocument (T045) to it. */
  public async refresh(): Promise<void> {
    if (!this.view) return;

    const gen = ++this.refreshGen;
    const cliStart = Date.now();
    let result;
    try {
      result = await refreshPrdSource();
    } catch (err) {
      // Audit fix: any unexpected throw from prdSource MUST surface as
      // SHOW_ERROR so the webview clears its spinner; previously the click
      // handler's `.spinning` class would never be removed.
      if (gen === this.refreshGen) {
        this.sendToWebview({
          type: 'SHOW_ERROR',
          payload: { message: `prd refresh threw: ${(err as Error).message}` }
        });
      }
      return;
    }
    const cliReturn = Date.now();

    // Audit fix: drop stale responses. A later refresh has already started;
    // committing this older result would overwrite newer data.
    if (gen !== this.refreshGen) {
      this.outputChannel.appendLine(`[prd] refresh gen=${gen} superseded by gen=${this.refreshGen} — dropping result`);
      return;
    }

    if (result.payload.ok === false) {
      // Doctor view path (US5 / FR-014).
      this.sendDoctorView(result.payload.message, result.payload.raw);
      return;
    }

    if (result.dropped > 0) {
      this.outputChannel.appendLine(
        `[prd] ${result.dropped} CLI rows failed validation and were dropped.`
      );
    }

    this.sendToWebview({ type: 'SYNC_DATA', payload: result.payload.prds });
    const sentAt = Date.now();

    this.outputChannel.appendLine(
      `[prd] refresh gen=${gen}: ${result.payload.prds.length} prds | CLI ${cliReturn - cliStart}ms | post ${sentAt - cliReturn}ms`
    );

    // Start-path suggestion: resolve the ranked "start here" candidates for the
    // current workspace folder and broadcast. Non-fatal — a missing workspace
    // (no folder open) simply yields no suggestion. Gen-guarded like the rest.
    try {
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const startInfo = await resolveStartPath(wsFolder);
      if (gen === this.refreshGen && startInfo) {
        this.sendToWebview({ type: 'SYNC_START_PATH', payload: startInfo });
        this.outputChannel.appendLine(
          `[prd] refresh gen=${gen}: start-path from=${startInfo.from} → ${startInfo.candidates[0]?.path ?? '(none)'} belowRoot=${startInfo.belowRoot}`
        );
      }
    } catch (err) {
      this.outputChannel.appendLine(`[prd] resolveStartPath threw (non-fatal): ${(err as Error).message}`);
    }

    // Resume Rail: fetch handoffs and broadcast alongside PRD data.
    // Errors are non-fatal — a missing ~/handoff dir is normal.
    try {
      const handoffs = await listHandoffs();
      // Guard: only send if this generation is still the latest (a newer
      // refresh might have started while we awaited listHandoffs).
      if (gen === this.refreshGen) {
        // Slug→PRD join: for each handoff whose slug exactly matches a PRD id,
        // upgrade prdId and resumeCmd so the frontend can show a /prd-checkout badge.
        const prdIdSet = new Set(result.payload.prds.map(p => p.id));
        let joined = 0;
        for (const h of handoffs) {
          if (prdIdSet.has(h.slug)) {
            h.prdId = h.slug;
            h.resumeCmd = `/prd-checkout ${h.slug}`;
            joined++;
          }
        }

        // Per-handoff start root: resolve each handoff's parsed projectHint to a
        // recommended launch directory (its git/worktree root). Cached per hint
        // dir so N handoffs in the same project cost one git resolution, not N.
        const startRootCache = new Map<string, string | null>();
        for (const h of handoffs) {
          if (!h.projectHint) continue;
          if (!startRootCache.has(h.projectHint)) {
            try {
              const info = await resolveStartPath(h.projectHint);
              startRootCache.set(h.projectHint, info?.candidates[0]?.path ?? null);
            } catch {
              startRootCache.set(h.projectHint, null);
            }
          }
          h.startRoot = startRootCache.get(h.projectHint) ?? null;
        }

        // A newer refresh may have started while we awaited the resolutions.
        if (gen !== this.refreshGen) return;
        this.sendToWebview({ type: 'SYNC_HANDOFFS', payload: handoffs });
        this.outputChannel.appendLine(`[prd] refresh gen=${gen}: ${handoffs.length} handoffs (${joined} joined to PRDs)`);
      }
    } catch (err) {
      this.outputChannel.appendLine(`[prd] listHandoffs threw (non-fatal): ${(err as Error).message}`);
    }
  }

  private sendToWebview(message: ExtensionResponse): void {
    this.view?.webview.postMessage(message);
  }

  private sendDoctorView(message: string, raw?: string): void {
    if (!this.view) return;
    this.view.webview.html = renderDoctorView(this.view.webview, message, raw, this.extensionUri);
  }

  private getHtml(webview: vscode.Webview): string {
    // Audit fix: cache-bust both asset URIs with the file's mtime so VSCode
    // never serves a stale bundle/stylesheet after a rebuild.
    const bundlePath = path.join(this.extensionUri.fsPath, 'dist', 'frontend', 'bundle.js');
    const stylesPath = path.join(this.extensionUri.fsPath, 'webview-frontend', 'styles.css');
    const bv = safeMtime(bundlePath);
    const sv = safeMtime(stylesPath);
    const bundleUri = webview.asWebviewUri(vscode.Uri.file(bundlePath)).with({ query: `v=${bv}` });
    const stylesUri = webview.asWebviewUri(vscode.Uri.file(stylesPath)).with({ query: `v=${sv}` });

    // CSP: the bundle is local; styles are inline + local; no remote resources.
    const nonce = makeNonce();

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
<title>PRDs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="${stylesUri}">
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}">window.__PRD_RENDER_MODE__ = 'sidebar'; window.__PRD_HUB_REPO__ = ${JSON.stringify(this.currentRepo())};</script>
<script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
  }

  /** The repo the hub opens on. Default is '(all)' -- the cross-repo bucket, which
   *  always exists. 'workspace' opens on the workspace folder's basename instead;
   *  with no folder open it still falls back to '(all)', never a hardcoded repo. */
  private currentRepo(): string {
    const mode = vscode.workspace.getConfiguration('prd').get<string>('hubDefaultView', 'all');
    const ws = vscode.workspace.workspaceFolders?.[0];
    return mode === 'workspace' && ws ? path.basename(ws.uri.fsPath) : '(all)';
  }
}

function safeMtime(p: string): number {
  try { return Math.floor(fs.statSync(p).mtimeMs); } catch { return Date.now(); }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
