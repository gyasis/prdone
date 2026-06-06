// Extension entry point.
// T017 (wave 3): activate/deactivate, register commands + sidebar provider.
// T025 wires WebviewViewProvider; T041 wires prd.openKanban; T042 deactivate
// kills the kanban server. Those tasks all land in this file across waves.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SidebarProvider } from './webview/sidebarProvider';
import { startKanbanServer, type KanbanServerHandle } from './kanban/server';

let sidebarProvider: SidebarProvider | undefined;
let kanbanServer: KanbanServerHandle | undefined;
let autoRefreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // T024 + T025: WebviewViewProvider for the activity-bar PRD view.
  sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );
  // Audit fix: also register the provider itself for disposal so its output
  // channel + per-view disposables are released on extension deactivate.
  context.subscriptions.push(sidebarProvider);

  // Command: focus / reveal the PRD sidebar view.
  context.subscriptions.push(
    vscode.commands.registerCommand('prd.openVisualizer', async () => {
      // Focus the view by id; VSCode reveals the activity-bar entry.
      await vscode.commands.executeCommand(`${SidebarProvider.viewType}.focus`);
    })
  );

  // T9: install bundled prd skills (~/.claude/skills/prd*.md) and CLI
  // (~/bin/prd) into the user's home from the extension's `bundle/` dir.
  // Confirmation-gated; backs up existing files with .bak before overwriting.
  context.subscriptions.push(
    vscode.commands.registerCommand('prd.installSkills', async () => {
      await installPrdSkills(context.extensionUri.fsPath);
    })
  );

  // B2.1: explicit refresh command. Bindable to a keyboard shortcut.
  // Triggers the same prdSource.refresh() path used by the title-bar button
  // (REFRESH webview action) and onDidSaveTextDocument auto-refresh.
  context.subscriptions.push(
    vscode.commands.registerCommand('prd.refreshVisualizer', async () => {
      await sidebarProvider?.refresh();
    })
  );

  // T041: prd.openKanban — lazy-start the bundled local Express server,
  // open the user's default browser at the chosen port, store the handle
  // for cleanup in deactivate().
  context.subscriptions.push(
    vscode.commands.registerCommand('prd.openKanban', async () => {
      try {
        if (!kanbanServer) {
          const cfg = vscode.workspace.getConfiguration('prd');
          const basePort = cfg.get<number>('kanbanBasePort') ?? 7373;
          kanbanServer = await startKanbanServer({
            extensionRoot: context.extensionUri.fsPath,
            basePort
          });
        }
        await vscode.env.openExternal(vscode.Uri.parse(kanbanServer.url));
      } catch (err) {
        vscode.window.showErrorMessage(
          `Could not start kanban server: ${(err as Error).message}`
        );
      }
    })
  );

  // B2.2: Auto-refresh every N minutes (default 30, configurable via
  // `prd.autoRefreshMinutes`). Defensive against the FileSystemWatcher gaps
  // that B2 was opened to fix — terminal-driven `prd new` doesn't fire
  // onDidSaveTextDocument, so a periodic poll guarantees the sidebar
  // catches up without the user having to click refresh.
  function startAutoRefresh(): void {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = undefined;
    }
    const cfg = vscode.workspace.getConfiguration('prd');
    const minutes = cfg.get<number>('autoRefreshMinutes') ?? 30;
    if (minutes <= 0) return; // user disabled it; manual refresh only
    autoRefreshTimer = setInterval(() => {
      void sidebarProvider?.refresh();
    }, minutes * 60 * 1000);
  }
  startAutoRefresh();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('prd.autoRefreshMinutes')) {
        startAutoRefresh();
      }
    })
  );

  // T045: live-update on PRD file save.
  //
  // T046 / research.md R3: we deliberately use onDidSaveTextDocument over
  // FileSystemWatcher. Save events are deterministic and originate from VSCode
  // itself; FileSystemWatcher silently exhausts on networked or large
  // directories and stops firing without warning (the prior PRD logged this as
  // a 2026-05-07 decision row).
  //
  // Doc citation per FR-018:
  //   https://code.visualstudio.com/api/references/vscode-api#workspace.onDidSaveTextDocument
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // Filter for files under the PRD root. We don't have an explicit "prd
      // root" config; the practical heuristic is: the file's path matches
      // /\bprd\/(scratch|archive|library)\// (the canonical layout). This
      // avoids a refresh on every unrelated markdown save in the workspace.
      if (/\bprd\/(scratch|archive|library)\/.+\.md$/.test(doc.uri.fsPath)) {
        void sidebarProvider?.refresh();
      }
    })
  );
}

/** T9: copy bundle/skills/* → ~/.claude/skills/ AND bundle/bin/prd → ~/bin/prd
 *  Runs only on user-confirmed invocation (`prd.installSkills` command).
 *  Backs up any existing files to <name>.bak before overwriting. */
async function installPrdSkills(extensionRoot: string): Promise<void> {
  const home = os.homedir();
  const skillsSrc = path.join(extensionRoot, 'bundle', 'skills');
  const binSrc = path.join(extensionRoot, 'bundle', 'bin', 'prd');
  const skillsDst = path.join(home, '.claude', 'skills');
  const binDst = path.join(home, 'bin', 'prd');

  if (!fs.existsSync(skillsSrc) || !fs.existsSync(binSrc)) {
    vscode.window.showErrorMessage(
      `prd: bundle/ directory missing from extension at ${extensionRoot}. Re-install the .vsix.`
    );
    return;
  }

  // Skills ship in Claude Code dir-form: bundle/skills/<name>/SKILL.md.
  // The loader ONLY picks up ~/.claude/skills/<name>/SKILL.md — flat
  // ~/.claude/skills/<name>.md files are silently ignored, so we install dirs.
  const skillNames = fs
    .readdirSync(skillsSrc, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsSrc, d.name, 'SKILL.md')))
    .map((d) => d.name);
  const summary =
    `Will copy:\n` +
    `  • ${skillNames.length} skills → ${skillsDst}/<name>/SKILL.md\n` +
    `  • prd CLI binary → ${binDst}\n\n` +
    `Existing files will be backed up to <name>.bak before overwrite.`;

  const choice = await vscode.window.showInformationMessage(
    `Install prd skill set + CLI into your home directory?\n\n${summary}`,
    { modal: true },
    'Install',
    'Cancel'
  );
  if (choice !== 'Install') return;

  fs.mkdirSync(skillsDst, { recursive: true });
  fs.mkdirSync(path.dirname(binDst), { recursive: true });

  const installed: string[] = [];
  const backed: string[] = [];

  for (const name of skillNames) {
    const src = path.join(skillsSrc, name, 'SKILL.md');
    const dstDir = path.join(skillsDst, name);
    const dst = path.join(dstDir, 'SKILL.md');
    fs.mkdirSync(dstDir, { recursive: true });
    if (fs.existsSync(dst)) {
      fs.copyFileSync(dst, dst + '.bak');
      backed.push(dst + '.bak');
    }
    // Retire any stale flat shadow ~/.claude/skills/<name>.md — the loader
    // ignores it and the dir form wins, but a dead flat file is confusing.
    const flat = path.join(skillsDst, `${name}.md`);
    if (fs.existsSync(flat)) {
      fs.renameSync(flat, `${flat}.bak`);
      backed.push(`${flat}.bak`);
    }
    fs.copyFileSync(src, dst);
    installed.push(dst);
  }

  if (fs.existsSync(binDst)) {
    fs.copyFileSync(binDst, binDst + '.bak');
    backed.push(binDst + '.bak');
  }
  fs.copyFileSync(binSrc, binDst);
  fs.chmodSync(binDst, 0o755);
  installed.push(binDst);

  const msg = `Installed ${installed.length} files. ${backed.length ? `Backed up ${backed.length} existing files to .bak.` : ''}`;
  vscode.window.showInformationMessage(msg);
}

export async function deactivate(): Promise<void> {
  // B2.2: stop the auto-refresh timer.
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = undefined;
  }
  // T042: kill the kanban server if it was started during the session.
  if (kanbanServer) {
    try {
      await kanbanServer.close();
    } catch {
      /* close errors are non-fatal at shutdown */
    }
    kanbanServer = undefined;
  }
}
