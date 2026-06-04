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
    exclude: [
      // 独立运行脚本（非 vitest 格式，使用 process.exit）
      "tests/test-dataset-adapters.ts",
      "tests/agent/test-agent-tools.ts",
      "tests/db/test-db-insert.ts",
      "tests/db/test-integrity.ts",
      "tests/rag/test-rag.ts",
      "tests/pdf/test-pdf-parse.ts",
      "tests/tools/test-21-tools.ts",
      "tests/tools/test-isolated.ts",
      "tests/tools/test-llm-router.ts",
      "tests/unit/test-config-resolution.ts",
      "tests/unit/test-dense-retriever-truncation.ts",
      "tests/unit/test-drizzle-runtime.ts",
      "tests/unit/test-memory-overlap.ts",
      "tests/unit/test-memory-system.ts",
      "tests/unit/test-semantic-chunker-integration.ts",
      "tests/unit/test-skill-system.ts",
      "tests/unit/test-sparse-retriever-preprocess.ts",
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
