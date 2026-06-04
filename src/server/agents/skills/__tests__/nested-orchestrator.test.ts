import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock EnhancedSkillRegistry
vi.mock("../enhanced-registry", () => ({
  EnhancedSkillRegistry: {
    get: vi.fn(),
    list: vi.fn(() => []),
  },
}));

// Mock enhanced-orchestrator
vi.mock("../enhanced-orchestrator", () => ({
  executeEnhancedSkill: vi.fn(),
}));

import { executeNestedSkill, comprehensiveDiagnosisNestedSkill } from "../nested-orchestrator";
import { EnhancedSkillRegistry } from "../enhanced-registry";
import { executeEnhancedSkill } from "../enhanced-orchestrator";
import type { NestedSkillDefinition } from "../nested-orchestrator";

const mockGetSkill = EnhancedSkillRegistry.get as ReturnType<typeof vi.fn>;
const mockExecuteEnhanced = executeEnhancedSkill as ReturnType<typeof vi.fn>;

describe("NestedOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes nested skill with subSkillId", async () => {
    const subSkill = {
      name: "sub-skill-a",
      description: "子Skill A",
      steps: [{ tool: "t1", params: {} }],
    };
    mockGetSkill.mockReturnValue(subSkill);
    mockExecuteEnhanced.mockResolvedValue({
      success: true,
      finalOutput: "子Skill A 结果",
      stepResults: [{ step: 0, tool: "t1", success: true, output: "子Skill A 结果" }],
      context: { skillId: "sub-skill-a", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    const skill: NestedSkillDefinition = {
      name: "parent-skill",
      description: "父Skill",
      steps: [
        { tool: "sub-skill-a", params: {}, subSkillId: "sub-skill-a" },
      ],
    };

    const result = await executeNestedSkill(skill, {});
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(1);
    expect(result.stepResults[0].tool).toBe("sub-skill-a");
    expect(mockGetSkill).toHaveBeenCalledWith("sub-skill-a");
  });

  it("handles unregistered subSkill gracefully", async () => {
    mockGetSkill.mockReturnValue(undefined);

    const skill: NestedSkillDefinition = {
      name: "parent-missing-sub",
      description: "缺失子Skill",
      steps: [
        { tool: "missing-sub", params: {}, subSkillId: "missing-sub" },
      ],
    };

    const result = await executeNestedSkill(skill, {});
    expect(result.success).toBe(false);
    expect(result.stepResults[0].error).toContain("未注册");
  });

  it("executes regular step (no subSkillId) via executeEnhancedSkill", async () => {
    mockExecuteEnhanced.mockResolvedValue({
      success: true,
      finalOutput: "步骤结果",
      stepResults: [{ step: 0, tool: "t1", success: true, output: "步骤结果" }],
      context: { skillId: "step-skill", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    const skill: NestedSkillDefinition = {
      name: "mixed-skill",
      description: "混合Skill",
      steps: [
        { tool: "t1", params: {} }, // 普通步骤
      ],
    };

    const result = await executeNestedSkill(skill, {});
    expect(result.success).toBe(true);
    expect(mockExecuteEnhanced).toHaveBeenCalled();
  });

  it("handles subSkill execution exception", async () => {
    const subSkill = {
      name: "error-sub",
      description: "异常子Skill",
      steps: [{ tool: "t1", params: {} }],
    };
    mockGetSkill.mockReturnValue(subSkill);
    mockExecuteEnhanced.mockRejectedValue(new Error("子Skill执行异常"));

    const skill: NestedSkillDefinition = {
      name: "parent-error",
      description: "异常父Skill",
      steps: [
        { tool: "error-sub", params: {}, subSkillId: "error-sub" },
      ],
    };

    const result = await executeNestedSkill(skill, {});
    expect(result.success).toBe(false);
    expect(result.stepResults[0].error).toContain("执行异常");
  });

  it("uses outputTemplate for final output", async () => {
    mockExecuteEnhanced.mockResolvedValue({
      success: true,
      finalOutput: "分析结果",
      stepResults: [{ step: 0, tool: "t1", success: true, output: "分析结果" }],
      context: { skillId: "t", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    const skill: NestedSkillDefinition = {
      name: "template-nested",
      description: "模板嵌套Skill",
      steps: [
        { tool: "t1", params: {} },
      ],
      outputTemplate: "报告: {{steps[0].output}}",
    };

    const result = await executeNestedSkill(skill, {});
    expect(result.finalOutput).toContain("报告:");
  });

  it("comprehensiveDiagnosisNestedSkill is properly defined", () => {
    expect(comprehensiveDiagnosisNestedSkill.name).toBe("comprehensive-diagnosis-nested");
    expect(comprehensiveDiagnosisNestedSkill.steps.length).toBeGreaterThan(0);
    expect(comprehensiveDiagnosisNestedSkill.skillCategory).toBe("comprehensive_diagnosis");
    // 至少有一个步骤带 subSkillId
    const subSteps = comprehensiveDiagnosisNestedSkill.steps.filter(s => s.subSkillId);
    expect(subSteps.length).toBeGreaterThan(0);
  });

  it("executes multi-step nested skill with mixed steps", async () => {
    const subSkill = {
      name: "sub-a",
      description: "子Skill A",
      steps: [{ tool: "t1", params: {} }],
    };
    mockGetSkill.mockReturnValue(subSkill);

    // 第一次调用: subSkillId 步骤
    mockExecuteEnhanced.mockResolvedValueOnce({
      success: true,
      finalOutput: "子Skill结果",
      stepResults: [{ step: 0, tool: "sub-a", success: true, output: "子Skill结果" }],
      context: { skillId: "sub-a", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    // 第二次调用: 普通步骤
    mockExecuteEnhanced.mockResolvedValueOnce({
      success: true,
      finalOutput: "普通步骤结果",
      stepResults: [{ step: 0, tool: "t2", success: true, output: "普通步骤结果" }],
      context: { skillId: "mixed", currentStepIndex: 0, stepResults: [], status: "completed", initialParams: {} },
    });

    const skill: NestedSkillDefinition = {
      name: "multi-step-nested",
      description: "多步骤嵌套Skill",
      steps: [
        { tool: "sub-a", params: {}, subSkillId: "sub-a" },
        { tool: "t2", params: {} },
      ],
    };

    const result = await executeNestedSkill(skill, {});
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(2);
  });
});
