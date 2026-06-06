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

  // GET / — serves the kanban shell.
  app.get('/', (_req: Request, res: Response) => {
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
