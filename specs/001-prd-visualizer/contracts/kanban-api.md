# Contract: Kanban Server ↔ Browser

**Boundary**: bundled Express server (extension process) ↔ browser kanban page.
**Network**: loopback (`127.0.0.1`) only. Plain HTTP. No CORS — same-origin guaranteed by the bundled `kanban.html`.
**Type guard**: `isKanbanApiPayload(x: unknown): x is KanbanApiPayload` on the browser after `response.json()`.

## Endpoints

### `GET /` — kanban shell

- Serves `kanban-static/kanban.html`, which loads the shared frontend bundle and sets a global flag `window.__PRD_RENDER_MODE__ = 'kanban'`.
- Cache-Control: `no-store` (data freshness).

### `GET /assets/<file>` — shared frontend bundle and CSS

- Serves the same JS bundle the sidebar webview consumes, plus `browser-overrides.css`.
- Long-cache OK (filename includes a content hash).

### `GET /api/prds` — data

```typescript
type KanbanApiPayload =
  | { ok: true; prds: Prd[] }
  | { ok: false; message: string; raw?: string };
```

- Internally invokes the same `prdSource.refresh()` the sidebar uses — single read path.
- `Prd[]` validated server-side with `isPrd` before serialization; failures collapse to `ok: false`.
- Cache-Control: `no-store`.

## Lifecycle

- Server starts on the first invocation of the `prd.openKanban` command (lazy start).
- Port: auto-pick from `7373` upward, walking on `EADDRINUSE`. Window of 10 ports (7373–7382). On window exhaustion, surface a VSCode error notification with the "set base port" affordance.
- Server is killed on extension `deactivate()` via `server.close()` and an `unref()`-ed timeout fallback (5s).
- The browser tab handles a stopped server by surfacing a "server stopped — restart from the editor" banner on the next failed `/api/prds` call.

## Browser → editor round-trip

- Each tile in the kanban renders an "open in editor" anchor with `href="vscode://file/<absolute-path>"` (URL-encoded path).
- Click invokes the OS handler; no callback to the kanban server is needed.

## Validation (browser side)

```typescript
function isKanbanApiPayload(x: unknown): x is KanbanApiPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.ok === true) {
    return Array.isArray(o.prds) && o.prds.every(isPrd);
  }
  if (o.ok === false) {
    return typeof o.message === 'string'
      && (o.raw === undefined || typeof o.raw === 'string');
  }
  return false;
}
```

## Security posture

- Loopback only — server MUST refuse to bind a non-loopback interface (explicit bind to `127.0.0.1`).
- No authentication — single-user, single-machine; trust boundary is the OS user account.
- No state-mutating endpoints. `POST/PUT/DELETE/PATCH` MUST return 405.
