// Sidebar WebviewViewProvider for the PRD Visualizer extension.
// Loads the bundled frontend (`dist/frontend/bundle.js` + `webview-frontend/styles.css`),
// listens for actions, broadcasts SYNC_DATA after every prdSource.refresh().

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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

  constructor(private readonly extensionUri: vscode.Uri) {
    this.outputChannel = vscode.window.createOutputChannel('PRD Visualizer');
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
<script nonce="${nonce}">window.__PRD_RENDER_MODE__ = 'sidebar';</script>
<script nonce="${nonce}" src="${bundleUri}"></script>
</body>
</html>`;
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
