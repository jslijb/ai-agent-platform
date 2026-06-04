import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@ai-agent/shared-types': path.resolve(__dirname, '../shared-types/src/index.ts'),
      '@ai-agent/shared-utils': path.resolve(__dirname, '../shared-utils/src/index.ts'),
    },
  },
});
