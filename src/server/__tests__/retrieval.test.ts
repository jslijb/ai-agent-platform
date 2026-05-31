import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../retrieval/embedding-service", () => ({
  embeddingService: {
    embed: vi.fn(),
    embedBatch: vi.fn(),
  },
}));

import { SkillVectorRetriever } from "../retrieval/skill-vector-retriever";
import { ToolVectorRetriever } from "../retrieval/tool-vector-retriever";
import type { EnhancedSkillDefinition } from "../agents/skills/enhanced-types";
import { embeddingService } from "../retrieval/embedding-service";

const mockEmbed = embeddingService.embed as ReturnType<typeof vi.fn>;
const mockEmbedBatch = embeddingService.embedBatch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SkillVectorRetriever", () => {
  it("buildIndex and retrieve with cosine similarity", async () => {
    const retriever = new SkillVectorRetriever();

    const skills: EnhancedSkillDefinition[] = [
      {
        name: "ma-analysis",
        description: "均线分析",
        steps: [{ tool: "calculateMA", params: {} }],
        applicableScenarios: "计算均线指标",
        triggerKeywords: ["均线", "MA"],
        typicalQueries: ["MA20是多少"],
        relatedTools: ["calculateMA"],
        relatedGroups: ["technical-analysis"],
        skillCategory: "investment_analysis",
      },
      {
        name: "risk-check",
        description: "风险检查",
        steps: [{ tool: "checkTradeCompliance", params: {} }],
        applicableScenarios: "合规风控",
        triggerKeywords: ["合规", "风控"],
        typicalQueries: ["检查合规"],
        relatedTools: ["checkTradeCompliance"],
        relatedGroups: ["risk-compliance"],
        skillCategory: "risk_compliance",
      },
    ];

    mockEmbedBatch.mockResolvedValue([[1, 0, 0], [0, 1, 0]]);
    mockEmbed.mockResolvedValue([0.9, 0.1, 0]);

    await retriever.buildIndex(skills);
    expect(retriever.isReady()).toBe(true);

    const results = await retriever.retrieve("均线指标", 2);
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[0].skillId).toBe("ma-analysis");
  });

  it("returns empty when embed returns null", async () => {
    const retriever = new SkillVectorRetriever();
    mockEmbed.mockResolvedValue(null);
    const results = await retriever.retrieve("test", 5);
    expect(results).toEqual([]);
  });

  it("filters by candidateGroups", async () => {
    const retriever = new SkillVectorRetriever();

    const skills: EnhancedSkillDefinition[] = [
      {
        name: "skill-a",
        description: "A",
        steps: [{ tool: "t1", params: {} }],
        relatedGroups: ["group1"],
        skillCategory: "investment_analysis",
      },
      {
        name: "skill-b",
        description: "B",
        steps: [{ tool: "t2", params: {} }],
        relatedGroups: ["group2"],
        skillCategory: "risk_compliance",
      },
    ];

    mockEmbedBatch.mockResolvedValue([[1, 0], [0, 1]]);
    mockEmbed.mockResolvedValue([1, 0]);

    await retriever.buildIndex(skills);
    const results = await retriever.retrieve("test", 5, ["group1"]);
    expect(results.length).toBe(1);
    expect(results[0].skillId).toBe("skill-a");
  });
});

describe("ToolVectorRetriever", () => {
  it("isReady returns false before buildIndex", () => {
    const retriever = new ToolVectorRetriever();
    expect(retriever.isReady()).toBe(false);
  });
});
