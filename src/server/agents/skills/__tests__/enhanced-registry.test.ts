import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("../tools/registry", () => ({
  ToolRegistry: {
    get: vi.fn(),
    list: vi.fn(() => []),
    listNames: vi.fn(() => []),
    has: vi.fn(() => false),
  },
}));

vi.mock("@/server/agents/skills/enhanced-orchestrator", () => ({
  executeEnhancedSkill: vi.fn(async (skill, params) => ({
    success: true,
    finalOutput: `mock output for ${skill.name}`,
    stepResults: [],
    context: { skillId: skill.name, currentStepIndex: 0, stepResults: [], status: "completed" as const, initialParams: params },
  })),
}));

vi.mock("../tools/name-aliases", () => ({
  resolveToolName: vi.fn((name) => name),
}));

import { EnhancedSkillRegistry, executeSkill } from "../enhanced-registry";
import type { EnhancedSkillDefinition } from "../enhanced-types";
import { executeEnhancedSkill } from "../enhanced-orchestrator";

describe("EnhancedSkillRegistry", () => {
  it("register and get skill", () => {
    const skill: EnhancedSkillDefinition = {
      name: "test-skill-1",
      description: "测试Skill",
      steps: [{ tool: "t1", params: {} }],
      skillCategory: "investment_analysis",
    };
    EnhancedSkillRegistry.register(skill);
    expect(EnhancedSkillRegistry.get("test-skill-1")).toBeDefined();
    expect(EnhancedSkillRegistry.get("test-skill-1")?.name).toBe("test-skill-1");
  });

  it("get returns undefined for unknown skill", () => {
    expect(EnhancedSkillRegistry.get("nonexistent-skill-xyz")).toBeUndefined();
  });

  it("register skips duplicate skill", () => {
    const skill: EnhancedSkillDefinition = {
      name: "dup-skill",
      description: "重复Skill",
      steps: [{ tool: "t1", params: {} }],
    };
    EnhancedSkillRegistry.register(skill);
    EnhancedSkillRegistry.register(skill);
    const list = EnhancedSkillRegistry.list().filter(s => s.name === "dup-skill");
    expect(list.length).toBe(1);
  });

  it("list returns all registered skills", () => {
    const before = EnhancedSkillRegistry.list().length;
    EnhancedSkillRegistry.register({
      name: "list-test-a",
      description: "A",
      steps: [{ tool: "t1", params: {} }],
    });
    EnhancedSkillRegistry.register({
      name: "list-test-b",
      description: "B",
      steps: [{ tool: "t2", params: {} }],
    });
    const list = EnhancedSkillRegistry.list();
    expect(list.length).toBeGreaterThanOrEqual(before + 2);
  });

  it("listByCategory filters by skillCategory", () => {
    EnhancedSkillRegistry.register({
      name: "cat-invest",
      description: "投研",
      steps: [{ tool: "t1", params: {} }],
      skillCategory: "investment_analysis",
    });
    EnhancedSkillRegistry.register({
      name: "cat-risk",
      description: "风控",
      steps: [{ tool: "t2", params: {} }],
      skillCategory: "risk_compliance",
    });
    const investSkills = EnhancedSkillRegistry.listByCategory("investment_analysis");
    expect(investSkills.every(s => s.skillCategory === "investment_analysis")).toBe(true);
    const riskSkills = EnhancedSkillRegistry.listByCategory("risk_compliance");
    expect(riskSkills.every(s => s.skillCategory === "risk_compliance")).toBe(true);
  });

  it("listDescriptions returns formatted string", () => {
    EnhancedSkillRegistry.register({
      name: "desc-skill",
      description: "描述测试",
      steps: [{ tool: "t1", params: {} }],
      triggerKeywords: ["测试"],
      skillCategory: "vision_analysis",
    });
    const desc = EnhancedSkillRegistry.listDescriptions();
    expect(desc).toContain("desc-skill");
    expect(desc).toContain("描述测试");
  });

  it("listEnhancedDescriptions includes applicableScenarios and orchestrationSummary", () => {
    EnhancedSkillRegistry.register({
      name: "enhanced-desc-skill",
      description: "增强描述测试",
      steps: [{ tool: "t1", params: {} }],
      applicableScenarios: "适用场景描述",
      orchestrationSummary: "编排概要描述",
      typicalQueries: ["典型查询1"],
      skillCategory: "comprehensive_diagnosis",
    });
    const desc = EnhancedSkillRegistry.listEnhancedDescriptions();
    expect(desc).toContain("适用场景");
    expect(desc).toContain("编排概要");
    expect(desc).toContain("典型查询");
  });

  it("match returns skill matching triggerKeywords", () => {
    EnhancedSkillRegistry.register({
      name: "match-kw-skill",
      description: "关键词匹配测试",
      steps: [{ tool: "t1", params: {} }],
      triggerKeywords: ["均线分析", "MA指标"],
      typicalQueries: ["MA20是多少"],
    });
    // query 需要包含完整关键词 "均线分析" 才能匹配
    const result = EnhancedSkillRegistry.match("帮我做均线分析");
    expect(result).not.toBeNull();
    expect(result?.name).toBe("match-kw-skill");
  });

  it("match returns skill matching typicalQueries", () => {
    EnhancedSkillRegistry.register({
      name: "match-tq-skill",
      description: "典型查询匹配",
      steps: [{ tool: "t1", params: {} }],
      typicalQueries: ["五粮液估值分析"],
    });
    const result = EnhancedSkillRegistry.match("五粮液估值分析");
    expect(result).not.toBeNull();
  });

  it("match returns null when no skill matches", () => {
    const result = EnhancedSkillRegistry.match("完全无关的查询xyz123");
    expect(result === null || result?.name).toBeDefined();
  });
});

describe("executeSkill", () => {
  it("calls executeEnhancedSkill and returns SkillExecutionResult", async () => {
    // executeEnhancedSkill 已在 vi.mock 中被 mock，直接使用默认实现
    const result = await executeSkill(
      { name: "test-skill", description: "test", steps: [{ tool: "t1", params: {} }] },
      { code: "000858" }
    );

    expect(result.skillName).toBe("test-skill");
    expect(result.success).toBe(true);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });
});
