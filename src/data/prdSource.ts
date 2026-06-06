// Spawn the canonical `prd summary --json` CLI, validate every element with
// `isPrd`, return either { ok: true, prds } or { ok: false, message, raw }.
//
// Boundary: external CLI (process spawn) → extension host. Type-guarded.
// Contract: contracts/prd-summary-json.md
// Constitution Principle IV: Single source of truth — no .md scraping.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Prd, KanbanApiPayload } from '../types';
import { isPrd } from '../guards';

/** Read <workspace>/.memory/active-prds.json and return the set of pinned PRD paths. */
function readPinnedPaths(): Set<string> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder) return new Set();
  const file = path.join(folder, '.memory', 'active-prds.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return new Set();
    const obj = parsed as { prd_paths?: unknown; active?: unknown };
    // Schema A: { prd_paths: ["/path/...", ...] }
    if (Array.isArray(obj.prd_paths)) {
      return new Set(obj.prd_paths.filter((p): p is string => typeof p === 'string'));
    }
    // Schema B: { active: [{ path | prd_path: "...", ... }, ...] }
    if (Array.isArray(obj.active)) {
      const paths: string[] = [];
      for (const entry of obj.active) {
        if (typeof entry !== 'object' || entry === null) continue;
        const e = entry as { path?: unknown; prd_path?: unknown };
        if (typeof e.path === 'string') paths.push(e.path);
        else if (typeof e.prd_path === 'string') paths.push(e.prd_path);
      }
      return new Set(paths);
    }
  } catch {
    // missing file or malformed JSON — silently treat as no pins
  }
  return new Set();
}

export interface RefreshResult {
  payload: KanbanApiPayload;
  /** Number of CLI rows that failed validation and were dropped (for diagnostics). */
  dropped: number;
}

export async function refresh(): Promise<RefreshResult> {
  const cfg = vscode.workspace.getConfiguration('prd');
  const binaryPath = cfg.get<string>('binaryPath') ?? 'prd';

  // §11: --with-tree augments each row with `parent: string|null` and
  // `children: string[]` so the §5c graph view can render relationships
  // without a second CLI round-trip. Older `prd` CLIs that don't recognise
  // the flag will ignore unknown args (they fall through the `*) shift ;;`
  // case in cmd_summary), so this is backward-compatible.
  const args = ['summary', '--json', '--with-tree'];
  const result = await runProcess(binaryPath, args);

  if (result.exitCode !== 0) {
    return {
      payload: {
        ok: false,
        message: `prd CLI exited ${result.exitCode}`,
        raw: result.stderr.slice(0, 1024)
      },
      dropped: 0
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    return {
      payload: {
        ok: false,
        message: `prd CLI returned malformed JSON: ${(err as Error).message}`,
        raw: result.stdout.slice(0, 1024)
      },
      dropped: 0
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      payload: {
        ok: false,
        message: 'prd CLI did not return a JSON array',
        raw: JSON.stringify(parsed).slice(0, 1024)
      },
      dropped: 0
    };
  }

  const pinned = readPinnedPaths();
  const valid: Prd[] = [];
  let dropped = 0;
  for (const row of parsed) {
    if (isPrd(row)) {
      valid.push({ ...row, pinned: pinned.has(row.path) });
    } else {
      dropped++;
    }
  }

  return {
    payload: { ok: true, prds: valid },
    dropped
  };
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// Audit fix: hard wall-clock cap + stdout buffer cap.
// A hung `prd` binary previously left the sidebar spinner running forever
// because SYNC_DATA / SHOW_ERROR is gated on this promise resolving.
const SPAWN_TIMEOUT_MS = 10_000;
const STDOUT_MAX_BYTES = 10 * 1024 * 1024;

function runProcess(cmd: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let settled = false;
    const settle = (r: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const child = spawn(cmd, args, { shell: false });

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      // Hard-kill fallback after 1s if SIGTERM didn't take.
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* ignore */ } }, 1000).unref();
      settle({ exitCode: -2, stdout, stderr: `${stderr}\nprd CLI timed out after ${SPAWN_TIMEOUT_MS}ms` });
    }, SPAWN_TIMEOUT_MS);
    timer.unref();

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > STDOUT_MAX_BYTES) {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        settle({ exitCode: -3, stdout, stderr: `${stderr}\nprd CLI stdout exceeded ${STDOUT_MAX_BYTES} bytes` });
        return;
      }
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      settle({ exitCode: -1, stdout, stderr: `${err.message}\n${stderr}` });
    });

    child.on('close', (code) => {
      settle({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}
