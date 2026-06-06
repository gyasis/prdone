# prdone Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-05-07

## Active Technologies

- TypeScript 5.x (extension + webview/browser scripts), targeting Node 20+ runtime as bundled with VSCode. + `vscode` (extension API), `express` (kanban server), `open` (cross-platform browser launch). No frontend framework. No runtime validation library (no Zod). Build tool: `esbuild` for both extension and shared frontend bundle. (001-prd-visualizer)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (extension + webview/browser scripts), targeting Node 20+ runtime as bundled with VSCode.: Follow standard conventions

## Recent Changes

- 001-prd-visualizer: Added TypeScript 5.x (extension + webview/browser scripts), targeting Node 20+ runtime as bundled with VSCode. + `vscode` (extension API), `express` (kanban server), `open` (cross-platform browser launch). No frontend framework. No runtime validation library (no Zod). Build tool: `esbuild` for both extension and shared frontend bundle.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
