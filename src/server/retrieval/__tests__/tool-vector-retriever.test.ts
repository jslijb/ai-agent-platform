import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ToolRegistry
vi.mock("../../tools/registry", () => ({
  ToolRegistry: {
    get: vi.fn(),
    list: vi.fn(() => [
      { name: "getStockHistory", description: "获取历史数据", parameters: {}, category: "market-data" },
      { name: "calculateMA", description: "计算均线", parameters: {}, category: "technical-analysis" },
      { name: "checkTradeCompliance", description: "合规检查", parameters: {}, category: "risk-compliance" },
    ]),
    listNames: vi.fn(() => ["getStockHistory", "calculateMA", "checkTradeCompliance"]),
    has: vi.fn(() => false),
  },
}));

// Mock toolGroupManager
vi.mock("../../routing/tool-group-manager", () => ({
  toolGroupManager: {
    getGroupForTool: vi.fn((name: string) => {
      if (name === "getStockHistory") return { groupId: "market-data", groupResponsibility: "data_acquisition" };
      if (name === "calculateMA") return { groupId: "technical-analysis", groupResponsibility: "data_analysis" };
      if (name === "checkTradeCompliance") return { groupId: "risk-compliance", groupResponsibility: "data_analysis" };
      return undefined;
    }),
  },
}));

// Mock embeddingService
vi.mock("../embedding-service", () => ({
  embeddingService: {
    embed: vi.fn(),
    embedBatch: vi.fn(),
  },
}));

import { ToolVectorRetriever } from "../tool-vector-retriever";
import { embeddingService } from "../embedding-service";

const mockEmbed = embeddingService.embed as ReturnType<typeof vi.fn>;
const mockEmbedBatch = embeddingService.embedBatch as ReturnType<typeof vi.fn>;

describe("ToolVectorRetriever", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isReady returns false before buildIndex", () => {
    const retriever = new ToolVectorRetriever();
    expect(retriever.isReady()).toBe(false);
  });

  it("buildIndex creates index from ToolRegistry", async () => {
    mockEmbedBatch.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);

    const retriever = new ToolVectorRetriever();
    await retriever.buildIndex();
    expect(retriever.isReady()).toBe(true);
  });

  it("retrieve returns sorted results by cosine similarity", async () => {
    mockEmbedBatch.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    mockEmbed.mockResolvedValue([0.9, 0.1, 0]); // 最接近 getStockHistory

    const retriever = new ToolVectorRetriever();
    await retriever.buildIndex();

    const results = await retriever.retrieve("历史数据", 3);
    expect(results.length).toBe(3);
    expect(results[0].toolName).toBe("getStockHistory"); // 最相似
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("retrieve returns empty when embed returns null", async () => {
    mockEmbedBatch.mockResolvedValue([[1, 0, 0]]);
    mockEmbed.mockResolvedValue(null);

    const retriever = new ToolVectorRetriever();
    await retriever.buildIndex();

    const results = await retriever.retrieve("测试", 5);
    expect(results).toEqual([]);
  });

  it("retrieve filters by candidateGroups", async () => {
    mockEmbedBatch.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    mockEmbed.mockResolvedValue([0.9, 0.1, 0]);

    const retriever = new ToolVectorRetriever();
    await retriever.buildIndex();

    const results = await retriever.retrieve("历史数据", 5, ["market-data"]);
    expect(results.length).toBe(1);
    expect(results[0].toolName).toBe("getStockHistory");
  });

  it("retrieve respects topK limit", async () => {
    mockEmbedBatch.mockResolvedValue([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    mockEmbed.mockResolvedValue([0.5, 0.5, 0.5]);

    const retriever = new ToolVectorRetriever();
    await retriever.buildIndex();

    const results = await retriever.retrieve("测试", 2);
    expect(results.length).toBe(2);
  });

  it("buildIndex handles null embeddings gracefully", async () => {
    mockEmbedBatch.mockResolvedValue([
      [1, 0, 0],
      null,
      [0, 0, 1],
    ]);

    const retriever = new ToolVectorRetriever();
    await retriever.buildIndex();
    expect(retriever.isReady()).toBe(true);

    // 只有2个工具有embedding
    const results = await retriever.retrieve("测试", 10);
    mockEmbed.mockResolvedValue([1, 0, 0]);
    expect(results.length).toBe(2);
  });
});
