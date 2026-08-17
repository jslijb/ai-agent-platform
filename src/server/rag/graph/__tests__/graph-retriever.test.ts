import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        execute: vi.fn(async () => []),
      })),
    })),
  },
}));

vi.mock("@/server/llm/router", () => ({
  callWithFallback: vi.fn(async () => ({
    content: JSON.stringify(["五粮液", "营业收入"]),
    model: "test-model",
    provider: "test",
  })),
}));

vi.mock("../graph-builder-v2", () => ({
  isNeo4jAvailable: vi.fn(async () => false),
  getNeo4jDriver: vi.fn(),
}));

import { extractQueryEntities, graphSearch } from "../graph-retriever";

describe("graph-retriever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractQueryEntities", () => {
    it("should extract entities from query via LLM", async () => {
      const entities = await extractQueryEntities("五粮液的营业收入是多少");
      expect(entities).toEqual(["五粮液", "营业收入"]);
    });

    it("should return empty array when LLM returns invalid response", async () => {
      const { callWithFallback } = await import("@/server/llm/router");
      vi.mocked(callWithFallback).mockResolvedValueOnce({
        content: "not a json array",
        model: "test",
        provider: "test",
      });

      const entities = await extractQueryEntities("test query");
      expect(entities).toEqual([]);
    });
  });

  describe("graphSearch", () => {
    it("should return empty results when Neo4j is unavailable", async () => {
      const results = await graphSearch("五粮液营收", 2);
      expect(results).toEqual([]);
    });
  });
});