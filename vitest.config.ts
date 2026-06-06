import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'webview-frontend/**/*.ts'],
      exclude: ['**/*.test.ts', 'dist/**', 'node_modules/**']
    }
  }
});
