import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../../src'),
      '@ai-agent/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
      '@ai-agent/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src'),
    },
  },
});
