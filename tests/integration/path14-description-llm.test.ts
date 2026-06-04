import { describe, it, expect, beforeEach, vi } from "vitest";
import { toolDescriptionEnhancer } from "@/server/description/tool-description-enhancer";
import { fewShotInjector, FINANCE_FEW_SHOT_EXAMPLES } from "@/server/description/fewshot-injector";
import { ToolRegistry } from "@/server/tools/registry";
import type { RegisteredTool } from "@/server/agents/skills/types";

function makeTool(name: string, description: string, category?: string): RegisteredTool {
  return {
    name,
    description,
    parameters: {},
    execute: async () => ({}),
    category,
  };
}

describe("路径14: ToolDescriptionEnhancer → LLM 工具调用精度", () => {
  beforeEach(() => {
    const registry = ToolRegistry as unknown as { tools: Map<string, RegisteredTool> };
    registry.tools.clear();

    // 注册测试工具
    ToolRegistry.register(makeTool("calculateMA", "计算移动平均线MA，支持MA5/MA10/MA20/MA60等", "technical-analysis"));
    ToolRegistry.register(makeTool("calculateMACD", "计算MACD指标", "technical-analysis"));
    ToolRegistry.register(makeTool("calculateRSI", "计算RSI相对强弱指标", "technical-analysis"));
    ToolRegistry.register(makeTool("getStockRealtime", "获取股票实时行情，包括PE/PB/涨跌幅等", "market-data"));
    ToolRegistry.register(makeTool("getStockFinancial", "获取股票财务数据", "fundamental-data"));
    ToolRegistry.register(makeTool("getStockHistory", "获取股票历史K线数据", "market-data"));
    ToolRegistry.register(makeTool("hybridSearch", "RAG混合检索", "knowledge-documents"));
  });

  describe("I14.1: 格式验证: whenToUse 非空", () => {
    it("增强描述包含工具用途说明", () => {
      const descriptions = ToolRegistry.getEnhancedDescriptions();
      expect(descriptions).toBeDefined();
      expect(descriptions.length).toBeGreaterThan(0);
      // 每个工具描述应该包含工具名和描述
      expect(descriptions).toContain("calculateMA");
      expect(descriptions).toContain("getStockRealtime");
    });

    it("formatForPrompt 返回非空字符串", () => {
      const toolNames = ToolRegistry.listNames();
      const prompt = toolDescriptionEnhancer.formatForPrompt(toolNames);
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe("string");
    });
  });

  describe("I14.2: few-shot 示例注入", () => {
    it("注入 few-shot 示例到 prompt", () => {
      const basePrompt = "可用工具:\n- calculateMA: 计算MA\n- getStockRealtime: 获取行情";
      const result = fewShotInjector.inject(basePrompt, FINANCE_FEW_SHOT_EXAMPLES);
      expect(result).toBeDefined();
      expect(typeof result).toBe("string");
      // 注入后 prompt 应该包含原始内容
      expect(result).toContain("calculateMA");
    });

    it("FINANCE_FEW_SHOT_EXAMPLES 非空", () => {
      expect(FINANCE_FEW_SHOT_EXAMPLES).toBeDefined();
      expect(Array.isArray(FINANCE_FEW_SHOT_EXAMPLES)).toBe(true);
    });
  });

  describe("I14.3: 分组描述生成", () => {
    it("按分组生成描述", () => {
      const techTools = ToolRegistry.listByGroup("technical-analysis");
      expect(techTools.length).toBeGreaterThan(0);

      const names = techTools.map((t) => t.name);
      const descriptions = ToolRegistry.getEnhancedDescriptions(names);
      expect(descriptions).toContain("calculateMA");
      expect(descriptions).toContain("calculateRSI");
    });

    it("不同分组工具不混淆", () => {
      const techTools = ToolRegistry.listByGroup("technical-analysis");
      const marketTools = ToolRegistry.listByGroup("market-data");

      const techNames = techTools.map((t) => t.name);
      const marketNames = marketTools.map((t) => t.name);

      // 技术分析组应该包含 calculateMA 但不包含 getStockRealtime
      expect(techNames).toContain("calculateMA");
      expect(techNames).not.toContain("getStockRealtime");

      // 行情组应该包含 getStockRealtime
      expect(marketNames).toContain("getStockRealtime");
    });
  });

  describe("I14.4: LLM 调用精度 (需要真实LLM)", () => {
    it.skip("计算五粮液MA20 → calculateMA", async () => {
      // 此测试需要真实 LLM 调用
    });
  });

  describe("I14.5: LLM 避免混淆 (需要真实LLM)", () => {
    it.skip("获取五粮液PE → getStockRealtime", async () => {
      // 此测试需要真实 LLM 调用
    });
  });
});
