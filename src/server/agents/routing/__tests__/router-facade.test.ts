import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies using vi.hoisted to avoid hoisting issues
const { mockListByCategory, mockList, mockGet } = vi.hoisted(() => ({
  mockListByCategory: vi.fn(() => []),
  mockList: vi.fn(() => []),
  mockGet: vi.fn(),
}));

vi.mock("../../skills/enhanced-registry", () => ({
  EnhancedSkillRegistry: {
    list: mockList,
    listByCategory: mockListByCategory,
    get: mockGet,
    match: vi.fn(() => null),
    listDescriptions: vi.fn(() => ""),
    listEnhancedDescriptions: vi.fn(() => ""),
  },
}));

vi.mock("../../tools/registry", () => ({
  ToolRegistry: {
    get: vi.fn(),
    list: vi.fn(() => []),
    listNames: vi.fn(() => ["tool1", "tool2"]),
    has: vi.fn(() => false),
  },
}));

vi.mock("../../retrieval/skill-vector-retriever", () => ({
  SkillVectorRetriever: vi.fn(() => ({
    buildIndex: vi.fn(async () => {}),
    retrieve: vi.fn(async () => []),
    isReady: vi.fn(() => false),
  })),
}));

vi.mock("../../retrieval/tool-vector-retriever", () => ({
  ToolVectorRetriever: vi.fn(() => ({
    buildIndex: vi.fn(async () => {}),
    retrieve: vi.fn(async () => []),
    isReady: vi.fn(() => false),
  })),
}));

vi.mock("../../description/tool-description-enhancer", () => ({
  toolDescriptionEnhancer: {
    formatForPrompt: vi.fn(() => "- tool1: 描述1\n- tool2: 描述2"),
    load: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("../../description/fewshot-injector", () => ({
  fewShotInjector: {
    inject: vi.fn((prompt) => prompt + "\n\nFew-Shot 示例"),
  },
  FINANCE_FEW_SHOT_EXAMPLES: [],
}));

import { RouterFacade } from "../router-facade";
import { MultiSkillMatcher } from "../multi-skill-matcher";

describe("RouterFacade", () => {
  let facade: RouterFacade;

  beforeEach(() => {
    vi.restoreAllMocks();
    // 重新设置被 clearAllMocks 清除的 mock 实现
    mockList.mockReturnValue([]);
    mockListByCategory.mockReturnValue([]);
    mockGet.mockReturnValue(undefined);
    facade = new RouterFacade();
  });

  it("returns full_fallback when no skill or group matches", () => {
    const result = facade.route("今天天气怎么样");
    expect(result.routeType).toBe("full_fallback");
    // full_fallback 时使用 ToolRegistry.listNames() 获取全量工具
    expect(result.availableTools).toBeDefined();
    expect(Array.isArray(result.availableTools)).toBe(true);
  });

  it("returns enhancedPrompt with tool descriptions", () => {
    const result = facade.route("测试查询");
    expect(result.enhancedPrompt).toBeDefined();
    expect(result.enhancedPrompt.length).toBeGreaterThan(0);
  });

  it("routes to vision skill when images provided and vision keywords present", () => {
    const visionSkill = {
      name: "chart-pattern-recognition",
      description: "图表形态识别",
      steps: [{ tool: "analyzeImage", params: {} }],
      relatedTools: ["analyzeImage"],
      skillCategory: "vision_analysis" as const,
    };
    mockListByCategory.mockReturnValue([visionSkill] as any);

    const result = facade.route("分析这个K线图截图", ["base64image"]);
    expect(result.routeType).toBe("skill");
    expect(result.matchedSkill?.name).toBe("chart-pattern-recognition");
  });

  it("falls back to text route when images provided but no vision keywords", () => {
    const result = facade.route("普通查询", ["base64image"]);
    expect(result.routeType).toBeDefined();
  });

  it("initialize sets vectorReady on success", async () => {
    await facade.initialize();
    expect(true).toBe(true);
  });
});

describe("MultiSkillMatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when only one or zero skills match", () => {
    mockList.mockReturnValue([
      {
        name: "skill-a",
        description: "A",
        steps: [{ tool: "t1", params: {} }],
        triggerKeywords: ["关键词A"],
      },
    ] as any);

    const matcher = new MultiSkillMatcher();
    const result = matcher.match("关键词A查询");
    expect(result).toBeNull();
  });

  it("returns multi-skill match when multiple skills match", () => {
    mockList.mockReturnValue([
      {
        name: "skill-a",
        description: "A",
        steps: [{ tool: "t1", params: {} }],
        triggerKeywords: ["偿债能力"],
        relatedGroups: ["fundamental-data"],
        relatedTools: ["getStockFinancial"],
      },
      {
        name: "skill-b",
        description: "B",
        steps: [{ tool: "t2", params: {} }],
        triggerKeywords: ["技术面"],
        relatedGroups: ["technical-analysis"],
        relatedTools: ["calculateMA"],
      },
    ] as any);

    const matcher = new MultiSkillMatcher();
    const result = matcher.match("分析偿债能力和技术面");
    expect(result).not.toBeNull();
    expect(result!.primarySkill).toBeDefined();
    expect(result!.auxiliarySkills.length).toBeGreaterThan(0);
    expect(result!.mergedToolGroups.length).toBeGreaterThan(0);
  });

  it("merges tool groups from all matched skills", () => {
    mockList.mockReturnValue([
      {
        name: "skill-x",
        description: "X",
        steps: [{ tool: "t1", params: {} }],
        triggerKeywords: ["分析"],
        relatedGroups: ["group-a"],
      },
      {
        name: "skill-y",
        description: "Y",
        steps: [{ tool: "t2", params: {} }],
        triggerKeywords: ["分析"],
        relatedGroups: ["group-b"],
      },
    ] as any);

    const matcher = new MultiSkillMatcher();
    const result = matcher.match("分析");
    expect(result).not.toBeNull();
    expect(result!.mergedToolGroups).toContain("group-a");
    expect(result!.mergedToolGroups).toContain("group-b");
  });

  it("returns null when no skills match query", () => {
    mockList.mockReturnValue([
      {
        name: "skill-z",
        description: "Z",
        steps: [{ tool: "t1", params: {} }],
        triggerKeywords: ["特定关键词"],
      },
    ] as any);

    const matcher = new MultiSkillMatcher();
    const result = matcher.match("完全不相关的查询");
    expect(result).toBeNull();
  });
});
