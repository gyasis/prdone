// Two-target esbuild config:
//   1. Extension bundle (CJS, externalize vscode, target node20)
//   2. Frontend bundle (IIFE, target ES2022, consumed by sidebar webview + browser kanban)
//
// Doc citation per FR-018:
//   https://esbuild.github.io/getting-started/
//   https://esbuild.github.io/api/

import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info'
};

const frontendConfig = {
  entryPoints: ['webview-frontend/index.ts'],
  bundle: true,
  outfile: 'dist/frontend/bundle.js',
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: true,
  logLevel: 'info'
};

if (watch) {
  const ext = await esbuild.context(extensionConfig);
  const fe = await esbuild.context(frontendConfig);
  await Promise.all([ext.watch(), fe.watch()]);
  console.log('[esbuild] watching both bundles…');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(frontendConfig)
  ]);
  console.log('[esbuild] built both bundles');
}
