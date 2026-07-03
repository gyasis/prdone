// Bundled Express server for the browser kanban surface.
// Doc citation per FR-018: https://expressjs.com/en/4x/api.html
//
// Hard constraints (FR-006, FR-009, contracts/kanban-api.md):
//   • binds to 127.0.0.1 only — refuses all other interfaces
//   • walks ports starting at the configured base, 10-port window
//   • POST/PUT/DELETE/PATCH → 405
//   • single read path (refresh()) shared with the sidebar
//   • killed on extension deactivate()

import express, { type Request, type Response, type NextFunction } from 'express';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { refresh as refreshPrdSource } from '../data/prdSource';
import { findFreePort } from '../lib/findFreePort';
import type { KanbanApiPayload } from '../types';

export interface KanbanServerHandle {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface StartOptions {
  /** Absolute path to the extension root, used for serving static assets. */
  extensionRoot: string;
  /** Starting port; walker increments by 1 up to windowSize-1. */
  basePort: number;
  /** Number of ports to try (inclusive of base). Default 10. */
  windowSize?: number;
}

export async function startKanbanServer(opts: StartOptions): Promise<KanbanServerHandle> {
  const port = await findFreePort(opts.basePort, opts.windowSize ?? 10);
  const app = express();

  // 405 on all state-mutating methods (read-only contract).
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE' || req.method === 'PATCH') {
      res.set('Allow', 'GET, HEAD');
      res.status(405).type('text/plain').send('Method Not Allowed (read-only)');
      return;
    }
    next();
  });

  // GET /api/prds — single read path shared with sidebar.
  // Audit fix: surface CLI failure as HTTP 503 so external HTTP consumers
  // can distinguish "data is broken" from "server is fine".
  app.get('/api/prds', async (_req: Request, res: Response) => {
    const result = await refreshPrdSource();
    const payload: KanbanApiPayload = result.payload;
    const status = payload.ok === false ? 503 : 200;
    res.status(status).set('Cache-Control', 'no-store').type('application/json').send(JSON.stringify(payload));
  });

  // GET /assets/<file> — serves the bundled frontend + browser-overrides.css.
  app.get('/assets/bundle.js', (_req: Request, res: Response) => {
    res.sendFile(path.join(opts.extensionRoot, 'dist', 'frontend', 'bundle.js'));
  });
  app.get('/assets/browser-overrides.css', (_req: Request, res: Response) => {
    res.sendFile(path.join(opts.extensionRoot, 'webview-frontend', 'browser-overrides.css'));
  });
  // Audit fix: kanban-static HTML referenced /assets/styles.css implicitly via
  // shared visual language but the file was never served — kanban rendered
  // unstyled. Serve the same stylesheet the sidebar uses.
  app.get('/assets/styles.css', (_req: Request, res: Response) => {
    res.sendFile(path.join(opts.extensionRoot, 'webview-frontend', 'styles.css'));
  });

  // ── Cross-repo Work Hub surfaces ─────────────────────────────────────────
  // Data layer is hub/assemble.cjs (node builtins + shelling to gh/git/prd/
  // issue-list; NO npm deps) so it runs in the extension host. Loaded via a
  // runtime require so esbuild doesn't try to bundle the .cjs (eval('require')
  // keeps the call opaque to the bundler; VSCode extension output is CJS).
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require') as NodeRequire;
  const hubDir = path.join(opts.extensionRoot, 'hub');
  const hubMod = (): { assembleHub: (r: string) => unknown; listRepos: (a: boolean, r: boolean) => unknown } =>
    nodeRequire(path.join(hubDir, 'assemble.cjs'));
  app.get('/api/repos', (req: Request, res: Response) => {
    try { res.set('Cache-Control', 'no-store').json(hubMod().listRepos(req.query.all === '1', req.query.refresh === '1')); }
    catch (e) { res.status(500).json({ ok: false, error: String((e as Error).message || e) }); }
  });
  app.get('/api/hub', (req: Request, res: Response) => {
    try { res.set('Cache-Control', 'no-store').json(hubMod().assembleHub(String(req.query.repo || 'twicedata_intra'))); }
    catch (e) { res.status(500).json({ ok: false, error: String((e as Error).message || e) }); }
  });
  app.get('/sidebar', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(hubDir, 'sidebar.html'));
  });
  app.get('/hub', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(hubDir, 'hub.html'));
  });

  // ── Full-size "Search & Read Station" (Phase 1) ──────────────────────────
  // The wide-screen app. Read-only. Two new endpoints power it:
  //   /api/raw?path=   read a PRD/handoff .md (path-safe, whitelisted roots)
  //   /api/search?q=   cross-repo full-text via ripgrep over the same roots
  // ALLOWED_ROOTS gates BOTH — the #1 risk is a ?path=/etc/passwd traversal.
  const home = process.env.HOME ?? os.homedir();
  const prdRoot = process.env.PRD_ROOT ?? path.join(home, 'dev', 'prd');
  const handoffRoot = path.join(home, 'handoff');
  const ALLOWED_ROOTS = [prdRoot, handoffRoot];
  const underRoot = (p: string): boolean =>
    ALLOWED_ROOTS.some((r) => p === r || p.startsWith(r + path.sep));
  const classify = (p: string): 'prd' | 'handoff' | 'other' =>
    p.startsWith(handoffRoot + path.sep) ? 'handoff' : p.startsWith(prdRoot + path.sep) ? 'prd' : 'other';

  app.get('/api/raw', (req: Request, res: Response) => {
    const raw = typeof req.query.path === 'string' ? req.query.path : '';
    if (!raw) { res.status(400).type('text/plain').send('missing ?path='); return; }
    let resolved: string;
    try { resolved = path.resolve(raw); } catch { res.status(400).type('text/plain').send('invalid path'); return; }
    if (!underRoot(resolved)) { res.status(403).type('text/plain').send('forbidden: outside allowed roots'); return; }
    if (!resolved.endsWith('.md')) { res.status(403).type('text/plain').send('forbidden: only .md files'); return; }
    if (!fs.existsSync(resolved)) { res.status(404).type('text/plain').send('not found'); return; }
    const st = fs.statSync(resolved);
    res.set('Cache-Control', 'no-store').json({
      ok: true, path: resolved, type: classify(resolved),
      content: fs.readFileSync(resolved, 'utf8'), mtime: st.mtimeMs, size: st.size
    });
  });

  app.get('/api/search', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) { res.set('Cache-Control', 'no-store').json({ ok: true, q, results: [] }); return; }
    // ripgrep over the whitelisted roots, markdown only, JSON output for robust parsing.
    execFile('rg', ['--json', '-i', '--max-count', '8', '-g', '*.md', '-g', '!node_modules', '-e', q, ...ALLOWED_ROOTS],
      { maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
      (err, stdout) => {
        // rg exit 1 = "no matches" (not an error); ENOENT = rg not installed.
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          res.status(500).json({ ok: false, error: 'ripgrep (rg) not found on PATH' }); return;
        }
        const byFile: Record<string, { path: string; type: string; count: number; matches: { line: number; text: string }[] }> = {};
        for (const line of stdout.split('\n')) {
          if (!line) continue;
          let obj: { type?: string; data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } } };
          try { obj = JSON.parse(line); } catch { continue; }
          if (obj.type !== 'match' || !obj.data?.path?.text) continue;
          const p = obj.data.path.text;
          const e = (byFile[p] ??= { path: p, type: classify(p), count: 0, matches: [] });
          e.count++;
          if (e.matches.length < 3) e.matches.push({ line: obj.data.line_number ?? 0, text: (obj.data.lines?.text ?? '').trim().slice(0, 200) });
        }
        // PRDs first, then handoffs, then by match count.
        const results = Object.values(byFile).sort((a, b) =>
          (a.type === b.type ? b.count - a.count : a.type === 'prd' ? -1 : b.type === 'prd' ? 1 : 0)
        ).slice(0, 60);
        res.set('Cache-Control', 'no-store').json({ ok: true, q, results });
      });
  });

  // GET /api/pulse — every PRD/handoff .md with its created + last-touched times,
  // for the activity histogram ("Pulse Strip"). Filesystem stat only; no bodies.
  app.get('/api/pulse', (_req: Request, res: Response) => {
    const items: { path: string; type: string; mtime: number; birthtime: number }[] = [];
    const walk = (root: string): void => {
      if (!fs.existsSync(root)) return;
      const stack = [root];
      while (stack.length) {
        const d = stack.pop() as string;
        let ents: fs.Dirent[];
        try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
          const fp = path.join(d, e.name);
          if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') stack.push(fp); }
          else if (e.name.endsWith('.md')) {
            try { const st = fs.statSync(fp); items.push({ path: fp, type: classify(fp), mtime: st.mtimeMs, birthtime: (st.birthtimeMs || st.ctimeMs) }); } catch { /* skip */ }
          }
        }
      }
    };
    ALLOWED_ROOTS.forEach(walk);
    res.set('Cache-Control', 'no-store').json({ ok: true, items });
  });

  // GET / — the full-size Station (Search & Read). The kanban board moves to /kanban.
  app.get('/', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(opts.extensionRoot, 'kanban-static', 'app.html'));
  });
  app.get('/kanban', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(opts.extensionRoot, 'kanban-static', 'kanban.html'));
  });

  // Spec 002 — Gallery view (T097).
  // GET /gallery — serves the gallery shell. Same boot dispatcher as kanban;
  // the shell sets window.__PRD_RENDER_MODE__ = 'gallery'.
  app.get('/gallery', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store').sendFile(path.join(opts.extensionRoot, 'kanban-static', 'gallery.html'));
  });

  // GET /companion?path=<absPath> — streams an HTML companion file as text/html
  // so the gallery's iframes can load it via http (file:// is blocked from a
  // localhost http origin). Read-only; security-gated: path MUST live under
  // ~/dev/prd/ and MUST end in .html.
  app.get('/companion', (req: Request, res: Response) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (!rawPath) {
      res.status(400).type('text/plain').send('missing ?path=');
      return;
    }
    // Security: refuse traversal + non-allowlisted roots.
    const home = process.env.HOME ?? '';
    const prdRoot = process.env.PRD_ROOT ?? path.join(home, 'dev', 'prd');
    let resolved: string;
    try {
      resolved = path.resolve(rawPath);
    } catch {
      res.status(400).type('text/plain').send('invalid path');
      return;
    }
    if (!resolved.startsWith(prdRoot + path.sep) && resolved !== prdRoot) {
      res.status(403).type('text/plain').send('forbidden: companion must live under ~/dev/prd/');
      return;
    }
    if (!resolved.endsWith('.html')) {
      res.status(403).type('text/plain').send('forbidden: only .html companions allowed');
      return;
    }
    if (!fs.existsSync(resolved)) {
      res.status(404).type('text/plain').send('companion not found');
      return;
    }
    // Stream as text/html with no-store so iframes always see the latest version.
    res.set('Cache-Control', 'no-store').type('text/html').sendFile(resolved);
  });

  return new Promise((resolve, reject) => {
    const server: http.Server = app.listen(port, '127.0.0.1', () => {
      resolve({
        port,
        url: `http://127.0.0.1:${port}/`,
        close: () => closeServer(server)
      });
    });
    server.once('error', reject);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    // 5s fallback per contracts/kanban-api.md — also cleared on graceful close
    // so we don't keep a dangling timer ref after the server already closed.
    const t = setTimeout(() => { resolved = true; resolve(); }, 5000);
    t.unref();
    const done = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(t);
      resolve();
    };
    server.close(() => done());
  });
}
