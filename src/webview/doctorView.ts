// Doctor View — rendered when prdSource fails (CLI not on PATH, etc.).
// T050 (wave 7) ports the full design/sidebar.html doctor block. This file
// lands stub-form here because sidebarProvider references it (T024 → T050 dep).

import * as vscode from 'vscode';

export function renderDoctorView(
  webview: vscode.Webview,
  message: string,
  raw: string | undefined,
  _extensionUri: vscode.Uri
): string {
  // T050 enriches this with the design/sidebar.html doctor markup, the
  // 56px Geist 800 "prd?" glyph, and the proper retry button. (The original
  // brief specified a Georgia-italic glyph; we consolidated to Geist after
  // the kanban + sidebar typography unification — see commit history.)
  void _extensionUri; // reserved for stylesheet wiring at T050.
  const safeMsg = escape(message);
  const safeRaw = raw ? escape(raw.slice(0, 1024)) : '';

  const nonce = makeNonce();
  const csp = `default-src 'none'; style-src ${webview.cspSource} https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}';`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>PRD Visualizer — Doctor</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700;800&family=Geist+Mono:wght@400;500&display=swap">
<style>
  body { font-family: 'Geist', system-ui, -apple-system, "Segoe UI", sans-serif; padding: 32px 20px; color: var(--vscode-foreground); }
  .doctor-glyph { font-family: 'Geist', system-ui, sans-serif; font-weight: 800; font-size: 56px; color: #cf5e2c; line-height: 1; margin-bottom: 16px; letter-spacing: -0.02em; }
  h2 { font-family: 'Geist', system-ui, sans-serif; font-weight: 700; font-size: 17px; margin: 0 0 12px; letter-spacing: -0.01em; }
  p { font-size: 12px; line-height: 1.5; max-width: 280px; color: var(--vscode-descriptionForeground); margin: 0 0 16px; }
  code { font-family: 'Geist Mono', "SF Mono", Monaco, Consolas, monospace; font-size: 11px; color: var(--vscode-foreground); }
  pre { font-family: 'Geist Mono', "SF Mono", Monaco, Consolas, monospace; font-size: 10.5px; color: var(--vscode-descriptionForeground); max-width: 320px; white-space: pre-wrap; word-break: break-all; }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 16px; cursor: pointer; font-family: inherit; font-size: 12px; border-radius: 2px; margin-top: 8px; }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  a.retry { display: inline-block; margin-top: 12px; font-size: 12px; color: var(--vscode-textLink-foreground, var(--vscode-charts-blue, #4daafc)); text-decoration: none; cursor: pointer; }
  a.retry:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="doctor-glyph">prd?</div>
  <h2>Can't reach the prd CLI</h2>
  <p>${safeMsg}</p>
  ${safeRaw ? `<pre>${safeRaw}</pre>` : ''}
  <p style="margin-top: 24px;">
    Set <code>prd.binaryPath</code> in your VSCode settings to point at the CLI binary.
  </p>
  <button id="set-binary-path" class="primary" type="button">Set binary path…</button>
  <br>
  <a id="retry" class="retry" href="#">Retry connection</a>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('set-binary-path').addEventListener('click', () => {
      vscode.postMessage({ type: 'OPEN_SETTINGS', payload: { setting: 'prd.binaryPath' } });
    });
    document.getElementById('retry').addEventListener('click', (ev) => {
      ev.preventDefault();
      vscode.postMessage({ type: 'RETRY_CONNECTION', payload: {} });
    });
  </script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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
