import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: [
      "src/server/__tests__/**/*.test.ts",
      "src/server/**/__tests__/**/*.test.ts",
      "src/server/lib/__tests__/**/*.test.ts",
      "tests/**/*.test.ts",
      "tests/**/test-*.ts",
    ],
    environment: "node",
    pool: "forks",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
