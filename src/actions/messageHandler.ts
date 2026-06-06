// Message handler for webview → extension postMessage actions.
// Validates with isWebviewAction at the boundary (FR-016).
// EXECUTE_CLI is rejected at runtime in Phase 1 (FR-019, Constitution Principle II).

import * as vscode from 'vscode';
import type { WebviewAction, ExtensionResponse } from '../types';
import { isWebviewAction } from '../guards';

export interface MessageContext {
  /** Send a response back to the webview that originated the action. */
  sendResponse: (response: ExtensionResponse) => void;
  /** Trigger a fresh prdSource refresh + SYNC_DATA broadcast (used by RETRY_CONNECTION). */
  triggerRefresh: () => Promise<void>;
}

export async function handleWebviewAction(
  raw: unknown,
  ctx: MessageContext
): Promise<void> {
  if (!isWebviewAction(raw)) {
    // Drop silently — the webview should never send a malformed action; if
    // it does, surface a SHOW_ERROR rather than crash.
    ctx.sendResponse({
      type: 'SHOW_ERROR',
      payload: { message: 'Webview sent an unrecognized action; ignored.' }
    });
    return;
  }

  const action: WebviewAction = raw;

  switch (action.type) {
    case 'OPEN_FILE': {
      try {
        await vscode.window.showTextDocument(vscode.Uri.file(action.payload.path));
      } catch (err) {
        ctx.sendResponse({
          type: 'SHOW_ERROR',
          payload: {
            message: `Could not open ${action.payload.path}`,
            raw: (err as Error).message
          }
        });
      }
      return;
    }

    case 'COPY_COMMAND': {
      try {
        await vscode.env.clipboard.writeText(action.payload.command);
      } catch (err) {
        ctx.sendResponse({
          type: 'SHOW_ERROR',
          payload: {
            message: 'Could not write to clipboard',
            raw: (err as Error).message
          }
        });
      }
      return;
    }

    case 'RETRY_CONNECTION': {
      await ctx.triggerRefresh();
      return;
    }

    case 'REFRESH': {
      // B2.1: explicit user-initiated refresh from the title-bar button or
      // the prd.refreshVisualizer VSCode command. Same code path as the
      // Doctor View's RETRY_CONNECTION; distinguished only so telemetry /
      // future logging can tell them apart.
      await ctx.triggerRefresh();
      return;
    }

    case 'WEBVIEW_READY': {
      // Webview signals it has booted and is ready to receive SYNC_DATA.
      await ctx.triggerRefresh();
      return;
    }

    case 'OPEN_SETTINGS': {
      try {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          action.payload.setting
        );
      } catch (err) {
        ctx.sendResponse({
          type: 'SHOW_ERROR',
          payload: {
            message: `Could not open settings for ${action.payload.setting}`,
            raw: (err as Error).message
          }
        });
      }
      return;
    }

    case 'OPEN_KANBAN': {
      try {
        await vscode.commands.executeCommand('prd.openKanban');
      } catch (err) {
        ctx.sendResponse({
          type: 'SHOW_ERROR',
          payload: {
            message: 'Could not open kanban',
            raw: (err as Error).message
          }
        });
      }
      return;
    }

    case 'EXECUTE_CLI': {
      // Phase-1 rejection per FR-019 / Constitution Principle II.
      // The variant exists in the type so Phase-2 lands without a contract refactor.
      ctx.sendResponse({
        type: 'SHOW_ERROR',
        payload: {
          message: 'EXECUTE_CLI is reserved for a future phase and is not enabled in v0.1.',
          raw: `Attempted argv: ${action.payload.argv.join(' ')}`
        }
      });
      return;
    }

    case 'OPEN_HTML_COMPANION': {
      // Spec 002 — open the HTML companion in a sandboxed WebviewPanel.
      // CSP allows Google Fonts + local resources only; iframe loads the HTML
      // via vscode-resource URI. A toolbar at the top provides an
      // "↗ Open in Browser" button that escapes to the system default browser
      // via vscode.env.openExternal (full fidelity, no webview CSP limits).
      try {
        const { path: htmlPath, title } = action.payload;
        const fileUri = vscode.Uri.file(htmlPath);
        const dirUri = vscode.Uri.file(htmlPath.replace(/\/[^/]+$/, '') || '/');
        const panel = vscode.window.createWebviewPanel(
          'prdoneHtmlCompanion',
          title || 'PRD HTML Companion',
          vscode.ViewColumn.Active,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [dirUri],
          }
        );

        const iframeSrc = panel.webview.asWebviewUri(fileUri).toString();
        const cspSource = panel.webview.cspSource;
        const safeTitle = (title || 'PRD HTML Companion').replace(/[&<>"']/g, c =>
          ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
        );

        // CSP: webview itself is locked down. The iframe loaded from vscode-resource
        // does its own CSP via its embedded fonts.googleapis.com link.
        // T092 — allowlist fonts.googleapis.com + fonts.gstatic.com for the iframe content.
        panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${cspSource}; style-src ${cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src ${cspSource} 'unsafe-inline'; font-src ${cspSource} https://fonts.gstatic.com data:; img-src ${cspSource} https: data:;">
<title>${safeTitle}</title>
<style>
  body { margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; background: var(--vscode-editor-background, #fff); font-family: var(--vscode-font-family, system-ui, sans-serif); }
  .prdone-toolbar { padding: 6px 12px; background: var(--vscode-titleBar-activeBackground, #f0f0f0); color: var(--vscode-titleBar-activeForeground, #000); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--vscode-panel-border, #ccc); font-size: 12px; }
  .prdone-toolbar .title { opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%; }
  .prdone-toolbar button { background: var(--vscode-button-background, #007acc); color: var(--vscode-button-foreground, #fff); border: 1px solid var(--vscode-button-border, transparent); padding: 4px 10px; font-size: 11px; cursor: pointer; border-radius: 2px; font-family: inherit; }
  .prdone-toolbar button:hover { background: var(--vscode-button-hoverBackground, #005f9e); }
  iframe { flex: 1; border: 0; width: 100%; background: white; }
</style>
</head>
<body>
  <div class="prdone-toolbar" role="toolbar" aria-label="HTML companion controls">
    <span class="title" title="${safeTitle}">${safeTitle}</span>
    <button id="open-in-browser-btn" type="button" title="Open in your system browser for full-fidelity rendering with no webview CSP restrictions.">↗ Open in Browser</button>
  </div>
  <iframe id="companion-iframe" src="${iframeSrc}" sandbox="allow-scripts allow-same-origin" referrerpolicy="no-referrer" title="${safeTitle}"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('open-in-browser-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_IN_BROWSER' });
    });
  </script>
</body>
</html>`;

        // Handle the toolbar button's message-back.
        panel.webview.onDidReceiveMessage((msg) => {
          if (msg && msg.type === 'OPEN_IN_BROWSER') {
            vscode.env.openExternal(fileUri);
          }
        });
      } catch (err) {
        ctx.sendResponse({
          type: 'SHOW_ERROR',
          payload: {
            message: `Could not open HTML companion: ${action.payload.path}`,
            raw: (err as Error).message,
          },
        });
      }
      return;
    }
  }
}
