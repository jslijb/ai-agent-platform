import { describe, it, expect } from "vitest";
import { SkillDescriptionEnhancer } from "../skill-description-enhancer";
import type { EnhancedSkillDefinition } from "../../agents/skills/enhanced-types";

describe("SkillDescriptionEnhancer", () => {
  it("formatForPrompt returns formatted string for skills", () => {
    const enhancer = new SkillDescriptionEnhancer();
    const skills: EnhancedSkillDefinition[] = [
      {
        name: "fundamental-analysis",
        description: "基本面分析",
        steps: [{ tool: "t1", params: {} }],
        applicableScenarios: "分析公司基本面",
        orchestrationSummary: "获取财务数据→估值指标→公司概况",
        typicalQueries: ["基本面分析", "财务分析"],
      },
    ];
    const result = enhancer.formatForPrompt(skills);
    expect(result).toContain("fundamental-analysis");
    expect(result).toContain("基本面分析");
    expect(result).toContain("适用场景");
    expect(result).toContain("编排概要");
    expect(result).toContain("典型查询");
  });

  it("formatForPrompt handles skills without optional fields", () => {
    const enhancer = new SkillDescriptionEnhancer();
    const skills: EnhancedSkillDefinition[] = [
      {
        name: "minimal-skill",
        description: "最小化Skill",
        steps: [{ tool: "t1", params: {} }],
      },
    ];
    const result = enhancer.formatForPrompt(skills);
    expect(result).toContain("minimal-skill");
    expect(result).toContain("通用"); // applicableScenarios 默认值
    expect(result).toContain("标准编排"); // orchestrationSummary 默认值
  });

  it("formatForPrompt handles empty skills array", () => {
    const enhancer = new SkillDescriptionEnhancer();
    const result = enhancer.formatForPrompt([]);
    expect(result).toBe("");
  });

  it("formatForPrompt handles multiple skills", () => {
    const enhancer = new SkillDescriptionEnhancer();
    const skills: EnhancedSkillDefinition[] = [
      {
        name: "skill-a",
        description: "Skill A",
        steps: [{ tool: "t1", params: {} }],
        applicableScenarios: "场景A",
      },
      {
        name: "skill-b",
        description: "Skill B",
        steps: [{ tool: "t2", params: {} }],
        applicableScenarios: "场景B",
      },
    ];
    const result = enhancer.formatForPrompt(skills);
    expect(result).toContain("skill-a");
    expect(result).toContain("skill-b");
    expect(result).toContain("场景A");
    expect(result).toContain("场景B");
  });
});
