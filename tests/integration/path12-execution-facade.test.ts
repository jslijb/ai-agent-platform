import { describe, it, expect, beforeEach, vi } from "vitest";
import { ExecutionFacade, type ExecutionConfig } from "@/server/agents/execution-facade";
import { ToolRegistry } from "@/server/tools/registry";
import { EnhancedSkillRegistry } from "@/server/agents/skills/enhanced-registry";
import type { RegisteredTool } from "@/server/agents/skills/types";
import type { EnhancedSkillDefinition } from "@/server/agents/skills/enhanced-types";

function makeTool(name: string, description: string = "测试工具", category?: string): RegisteredTool {
  return {
    name,
    description,
    parameters: {},
    execute: async (params) => ({ tool: name, params, result: "mock_data" }),
    category,
  };
}

describe("路径12: ExecutionFacade → 统一执行入口", () => {
  let facade: ExecutionFacade;

  beforeEach(() => {
    const registry = ToolRegistry as unknown as { tools: Map<string, RegisteredTool> };
    registry.tools.clear();
    const skillRegistry = EnhancedSkillRegistry as unknown as { skills: Map<string, EnhancedSkillDefinition> };
    skillRegistry.skills.clear();

    // 注册测试工具
    ToolRegistry.register(makeTool("calculateRSI", "计算RSI指标", "technical-analysis"));
    ToolRegistry.register(makeTool("calculateMA", "计算MA指标", "technical-analysis"));
    ToolRegistry.register(makeTool("getStockHistory", "获取历史K线", "market-data"));

    facade = new ExecutionFacade();
  });

  describe("I12.1: Skill 模式成功", () => {
    it("routeType=skill 时使用 Skill 模式执行", async () => {
      const skill: EnhancedSkillDefinition = {
        name: "technical-analysis",
        description: "技术分析",
        steps: [
          { tool: "calculateRSI", params: { period: 14 } },
          { tool: "calculateMA", params: { period: 20 } },
        ],
        skillCategory: "investment_analysis",
      };

      const result = await facade.execute(
        {
          routeType: "skill",
          matchedSkill: skill,
          availableTools: ["calculateRSI", "calculateMA"],
          enhancedPrompt: "测试提示",
        },
        "分析五粮液技术面",
        {
          routeType: "skill",
          availableTools: ["calculateRSI", "calculateMA"],
          systemPrompt: "测试系统提示",
        }
      );

      expect(result.executionMode).toBe("skill");
      expect(result.success).toBe(true);
      expect(result.skillResult).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("I12.2: ReAct 模式成功 (需要真实LLM)", () => {
    it.skip("routeType=full_fallback 时使用 ReAct 模式", async () => {
      // 此测试需要真实 LLM 调用
    });
  });

  describe("I12.3: Skill 失败 → 错误传播", () => {
    it("Skill 执行抛出异常时返回 success=false", async () => {
      // 注册一个会抛出异常的工具
      ToolRegistry.register({
        name: "errorTool",
        description: "错误工具",
        parameters: {},
        execute: async () => { throw new Error("模拟执行失败"); },
      });

      const skill: EnhancedSkillDefinition = {
        name: "error-skill",
        description: "错误测试",
        steps: [{ tool: "errorTool", params: {} }],
        errorRecovery: { type: "abort" },
      };

      const result = await facade.execute(
        {
          routeType: "skill",
          matchedSkill: skill,
          availableTools: ["errorTool"],
          enhancedPrompt: "测试",
        },
        "测试错误",
        {
          routeType: "skill",
          availableTools: ["errorTool"],
          systemPrompt: "测试",
        }
      );

      expect(result.executionMode).toBe("skill");
      expect(result.success).toBe(false);
    });
  });

  describe("I12.4: ReAct 多轮迭代 (需要真实LLM)", () => {
    it.skip("对比五粮液和格力电器需要多轮工具调用", async () => {
      // 此测试需要真实 LLM 调用
    });
  });

  describe("I12.5: Unknown routeType 兜底 (需要真实LLM)", () => {
    it.skip("routeType 不是 skill 时回退到 ReAct", async () => {
      // 此测试需要真实 LLM 调用（ReAct 模式）
    });
  });

  describe("执行时间记录", () => {
    it("executionTimeMs 正确记录", async () => {
      const skill: EnhancedSkillDefinition = {
        name: "timing-skill",
        description: "计时测试",
        steps: [{ tool: "calculateRSI", params: {} }],
      };

      const result = await facade.execute(
        {
          routeType: "skill",
          matchedSkill: skill,
          availableTools: ["calculateRSI"],
          enhancedPrompt: "测试",
        },
        "测试",
        {
          routeType: "skill",
          availableTools: ["calculateRSI"],
          systemPrompt: "测试",
        }
      );

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTimeMs).toBe("number");
    });
  });
});
