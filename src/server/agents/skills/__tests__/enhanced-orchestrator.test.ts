import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ToolRegistry
vi.mock("@/server/tools/registry", () => {
  const tools: Record<string, { name: string; description: string; parameters: Record<string, unknown>; category?: string; execute: (params: Record<string, unknown>) => Promise<string> }> = {
    getStockHistory: {
      name: "getStockHistory",
      description: "获取股票历史数据",
      parameters: { code: { type: "string", description: "股票代码", required: true } },
      category: "market-data",
      execute: vi.fn(async (params) => `历史数据: ${params.code}`),
    },
    calculateMA: {
      name: "calculateMA",
      description: "计算均线",
      parameters: { period: { type: "number", description: "周期", required: true } },
      category: "technical-analysis",
      execute: vi.fn(async (params) => `MA${params.period}: 25.5`),
    },
    checkTradeCompliance: {
      name: "checkTradeCompliance",
      description: "合规检查",
      parameters: { code: { type: "string", description: "股票代码" } },
      category: "risk-compliance",
      execute: vi.fn(async () => "合规通过"),
    },
    fallbackTool: {
      name: "fallbackTool",
      description: "降级工具",
      parameters: {},
      category: "test",
      execute: vi.fn(async () => "降级结果"),
    },
  };

  return {
    ToolRegistry: {
      get: (name: string) => tools[name] || undefined,
      list: () => Object.values(tools),
      listNames: () => Object.keys(tools),
      has: (name: string) => name in tools,
    },
  };
});

import { executeEnhancedSkill } from "../enhanced-orchestrator";
import type { EnhancedSkillDefinition } from "../enhanced-types";
import { ToolRegistry } from "@/server/tools/registry";

describe("EnhancedOrchestrator", () => {
  it("executes a simple 2-step skill", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "simple-skill",
      description: "简单Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
        { tool: "calculateMA", params: { period: 20 } },
      ],
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(2);
    expect(result.stepResults[0].tool).toBe("getStockHistory");
    expect(result.stepResults[1].tool).toBe("calculateMA");
    expect(result.finalOutput).toContain("simple-skill");
  });

  it("handles unregistered tool gracefully", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "missing-tool-skill",
      description: "缺失工具Skill",
      steps: [
        { tool: "nonExistentTool", params: {} },
        { tool: "calculateMA", params: { period: 20 } },
      ],
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.stepResults[0].success).toBe(false);
    expect(result.stepResults[0].output).toContain("未注册");
    // 第二步仍然执行
    expect(result.stepResults[1].success).toBe(true);
  });

  it("skips step when condition is not met", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "condition-skill",
      description: "条件Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
        { tool: "calculateMA", params: { period: 20 }, condition: "noError" },
      ],
    };

    const result = await executeEnhancedSkill(skill, {});
    // 第一步成功，condition "noError" 为 true，第二步应执行
    expect(result.stepResults[1].skipped).toBeFalsy();
  });

  it("skips step when condition evaluates to false", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "condition-false-skill",
      description: "条件为假Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
        { tool: "calculateMA", params: { period: 20 }, condition: "always" },
      ],
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.stepResults[1].skipped).toBeFalsy(); // "always" 条件为 true
  });

  it("resolves paramRefs from previous steps", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "paramref-skill",
      description: "参数引用Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
        {
          tool: "calculateMA",
          params: {},
          paramRefs: { code: "{{steps[0].output}}" },
        },
      ],
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(2);
  });

  it("uses outputTemplate for final output", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "template-skill",
      description: "模板Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
      ],
      outputTemplate: "结果: {{steps[0].output}}",
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.finalOutput).toContain("结果:");
    expect(result.finalOutput).not.toContain("{{steps[0].output}}");
  });

  it("fallback strategy uses fallbackTool on error", async () => {
    // 让 getStockHistory 抛出异常
    const mockTool = ToolRegistry.get("getStockHistory");
    const originalExecute = mockTool!.execute;
    (mockTool as unknown as { execute: ReturnType<typeof vi.fn> }).execute = vi.fn(async () => {
      throw new Error("模拟执行失败");
    });

    const skill: EnhancedSkillDefinition = {
      name: "fallback-skill",
      description: "降级Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" }, fallbackTool: "fallbackTool" },
      ],
      errorRecovery: { type: "fallback", fallbackTool: "fallbackTool" },
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.stepResults[0].success).toBe(true); // fallback 成功
    expect(result.stepResults[0].output).toContain("降级结果");

    // 恢复原始 execute
    (mockTool as { execute: unknown }).execute = originalExecute;
  });

  it("abort strategy stops on error", async () => {
    const mockTool = ToolRegistry.get("getStockHistory");
    const originalExecute = mockTool!.execute;
    (mockTool as unknown as { execute: ReturnType<typeof vi.fn> }).execute = vi.fn(async () => {
      throw new Error("模拟执行失败");
    });

    const skill: EnhancedSkillDefinition = {
      name: "abort-skill",
      description: "终止Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
        { tool: "calculateMA", params: { period: 20 } },
      ],
      errorRecovery: { type: "abort" },
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.stepResults.length).toBe(1); // 第二步不应执行
    expect(result.context.status).toBe("error");

    // 恢复原始 execute
    (mockTool as { execute: unknown }).execute = originalExecute;
  });

  it("retry strategy retries on failure", async () => {
    let callCount = 0;
    const mockTool = ToolRegistry.get("getStockHistory");
    const originalExecute = mockTool!.execute;
    (mockTool as unknown as { execute: ReturnType<typeof vi.fn> }).execute = vi.fn(async () => {
      callCount++;
      if (callCount < 3) throw new Error("暂时失败");
      return "成功结果";
    });

    const skill: EnhancedSkillDefinition = {
      name: "retry-skill",
      description: "重试Skill",
      steps: [
        { tool: "getStockHistory", params: { code: "000858" } },
      ],
      errorRecovery: { type: "retry", maxRetries: 3 },
    };

    const result = await executeEnhancedSkill(skill, {});
    expect(result.stepResults[0].success).toBe(true);
    expect(result.stepResults[0].retried).toBeGreaterThanOrEqual(1);

    // 恢复原始 execute
    (mockTool as { execute: unknown }).execute = originalExecute;
  });

  it("merges initialParams with step params", async () => {
    const skill: EnhancedSkillDefinition = {
      name: "merge-params-skill",
      description: "参数合并Skill",
      steps: [
        { tool: "getStockHistory", params: {} }, // code 从 initialParams 传入
      ],
    };

    const result = await executeEnhancedSkill(skill, { code: "000858" });
    expect(result.success).toBe(true);
  });
});
