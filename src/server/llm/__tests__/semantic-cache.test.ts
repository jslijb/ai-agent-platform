import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
        groupBy: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(async () => {}),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => ({ rowCount: 0 })),
    })),
    execute: vi.fn(async () => []),
  },
}));

vi.mock("@/server/retrieval/embedding-service", () => ({
  embeddingService: {
    embed: vi.fn(async () => [0.1, 0.2, 0.3]),
    checkReady: vi.fn(async () => true),
  },
}));

vi.mock("@/server/lib/redis", () => ({
  redisGet: vi.fn(async () => null),
  redisSet: vi.fn(async () => {}),
  redisDel: vi.fn(async () => {}),
  isRedisConnected: vi.fn(() => false),
}));

import {
  semanticCacheGet,
  semanticCacheSet,
  semanticCacheStats,
  semanticCacheCleanup,
} from "../semantic-cache";

describe("semantic-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("semanticCacheGet", () => {
    it("should return miss when no cache exists", async () => {
      const result = await semanticCacheGet("test-template", "test input");
      expect(result.hitType).toBe("miss");
      expect(result.content).toBeNull();
    });

    it("should return miss when embedding is unavailable", async () => {
      const { embeddingService } = await import("@/server/retrieval/embedding-service");
      vi.mocked(embeddingService.embed).mockResolvedValueOnce(null);

      const result = await semanticCacheGet("test-template", "test input");
      expect(result.hitType).toBe("miss");
    });
  });

  describe("semanticCacheSet", () => {
    it("should write cache entry without error", async () => {
      await semanticCacheSet("test-template", "test input", "test response", "test-model", "test-provider");
    });

    it("should handle embedding failure gracefully", async () => {
      const { embeddingService } = await import("@/server/retrieval/embedding-service");
      vi.mocked(embeddingService.embed).mockResolvedValueOnce(null);

      await semanticCacheSet("test-template", "test input", "test response");
    });
  });

  describe("semanticCacheStats", () => {
    it("should return stats object", async () => {
      const stats = await semanticCacheStats();
      expect(stats).toHaveProperty("totalEntries");
      expect(stats).toHaveProperty("byTemplate");
    });
  });

  describe("semanticCacheCleanup", () => {
    it("should return number of deleted entries", async () => {
      const count = await semanticCacheCleanup();
      expect(typeof count).toBe("number");
    });
  });
});