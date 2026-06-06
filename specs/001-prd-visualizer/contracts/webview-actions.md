# Contract: Extension ↔ Webview Messages

**Boundary**: VSCode extension host ↔ sidebar webview (and same shape used by browser kanban via `postMessage`-equivalent on the JS side after fetch).
**Type guards**: `isWebviewAction`, `isExtensionResponse` applied at every receive.

## Webview → Extension (`WebviewAction`)

```typescript
type WebviewAction =
  | { type: 'OPEN_FILE'; payload: { path: string } }
  | { type: 'COPY_COMMAND'; payload: { command: string } }
  | { type: 'RETRY_CONNECTION'; payload: Record<string, never> }
  | { type: 'EXECUTE_CLI'; payload: { argv: string[] } };
```

| `type` | Purpose | Phase 1 behaviour |
|---|---|---|
| `OPEN_FILE` | Open the underlying PRD `.md` in an editor tab | Extension calls `vscode.window.showTextDocument(vscode.Uri.file(path))`. Path validated as absolute. |
| `COPY_COMMAND` | Place the exact command text on the system clipboard | Extension calls `vscode.env.clipboard.writeText(command)`. Empty string rejected. |
| `RETRY_CONNECTION` | Re-attempt to reach the CLI after a Doctor View failure | Extension re-invokes `prdSource.refresh()` and broadcasts a fresh `SYNC_DATA` or `SHOW_ERROR`. |
| `EXECUTE_CLI` | RESERVED — Phase 2 write actions | Extension MUST reject in Phase 1 with a `SHOW_ERROR` response. The variant exists in the type so Phase 2 lands without contract refactor (FR-017). |

### Validation

```typescript
function isWebviewAction(x: unknown): x is WebviewAction {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  switch (o.type) {
    case 'OPEN_FILE':
      return typeof o.payload === 'object' && o.payload !== null
        && typeof (o.payload as { path: unknown }).path === 'string'
        && isAbsolutePath((o.payload as { path: string }).path);
    case 'COPY_COMMAND':
      return typeof o.payload === 'object' && o.payload !== null
        && typeof (o.payload as { command: unknown }).command === 'string'
        && (o.payload as { command: string }).command.length > 0;
    case 'RETRY_CONNECTION':
      return typeof o.payload === 'object' && o.payload !== null;
    case 'EXECUTE_CLI':
      return typeof o.payload === 'object' && o.payload !== null
        && Array.isArray((o.payload as { argv: unknown }).argv)
        && (o.payload as { argv: unknown[] }).argv.every(a => typeof a === 'string');
    default:
      return false;
  }
}
```

`isAbsolutePath` must recognize POSIX (`/...`) and Windows (`C:\...`, `\\server\share\...`) absolute paths.

## Extension → Webview (`ExtensionResponse`)

```typescript
type ExtensionResponse =
  | { type: 'SYNC_DATA'; payload: Prd[] }
  | { type: 'SHOW_ERROR'; payload: { message: string; raw?: string } };
```

| `type` | Purpose |
|---|---|
| `SYNC_DATA` | Replace the entire PRD list visible in the webview. Webview MUST treat it as a full refresh, not a delta. |
| `SHOW_ERROR` | Display a non-blocking error banner with `message`; if `raw` is present, expose it behind a "details" affordance. Previous data remains visible. |

### Validation (webview side)

```typescript
function isExtensionResponse(x: unknown): x is ExtensionResponse {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.type === 'SYNC_DATA') {
    return Array.isArray(o.payload) && o.payload.every(isPrd);
  }
  if (o.type === 'SHOW_ERROR') {
    const p = o.payload as Record<string, unknown> | undefined;
    return !!p && typeof p.message === 'string'
      && (p.raw === undefined || typeof p.raw === 'string');
  }
  return false;
}
```

## Lifecycle invariants

- The extension MUST send a `SYNC_DATA` (possibly with empty array) within 1.5s of webview ready, OR a `SHOW_ERROR` directing the user to the Doctor View.
- Webview MUST handle `SHOW_ERROR` while preserving any existing tile grid (no blank pane).
- Phase 1: `EXECUTE_CLI` is rejected by the extension with a `SHOW_ERROR` reading "Phase 2 feature, not enabled".
