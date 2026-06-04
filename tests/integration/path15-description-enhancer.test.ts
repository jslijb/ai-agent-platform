import { describe, it, expect } from "vitest";
import { ToolDescriptionEnhancer } from "@/server/description/tool-description-enhancer";
import { FewShotInjector, FINANCE_FEW_SHOT_EXAMPLES } from "@/server/description/fewshot-injector";
import type { EnhancedToolDescription } from "@/server/description/types";

describe("路径15: ToolDescriptionEnhancer → LLM 工具调用精度", () => {
  describe("ToolDescriptionEnhancer", () => {
    const mockDescriptions: EnhancedToolDescription[] = [
      {
        name: "calculateMA",
        description: "计算移动平均线",
        whenToUse: "用户需要MA指标时",
        whenNotToUse: "用户需要MACD时用calculateMACD",
        parameters: { period: { type: "number", description: "周期" } },
        exampleCalls: [{ description: "计算MA20", parameters: { period: 20 } }],
        groupId: "technical-analysis",
      },
      {
        name: "getStockFinancial",
        description: "获取财务数据",
        whenToUse: "用户需要ROE/毛利率/净利润等财务指标时",
        whenNotToUse: "用户需要行情数据时用getStockHistory",
        parameters: { code: { type: "string", description: "股票代码" } },
        exampleCalls: [{ description: "获取五粮液财报", parameters: { code: "000858" } }],
        groupId: "fundamental-data",
      },
    ];

    it("I15.1: 工具描述增强后含 when_to_use", () => {
      const enhancer = new ToolDescriptionEnhancer();
      enhancer.load(mockDescriptions);

      const enhanced = enhancer.get("calculateMA");
      expect(enhanced).toBeDefined();
      expect(enhanced!.whenToUse).toBe("用户需要MA指标时");
      expect(enhanced!.whenNotToUse).toContain("MACD");
      expect(enhanced!.exampleCalls).toHaveLength(1);

      const rawDesc = "计算移动平均线";
      expect(enhanced!.description).toBe(rawDesc);
    });

    it("I15.2: few-shot 示例注入到 system prompt", () => {
      const injector = new FewShotInjector();
      const systemPrompt = "你是一个金融分析助手";
      const result = injector.inject(systemPrompt, FINANCE_FEW_SHOT_EXAMPLES);

      expect(result).toContain(systemPrompt);
      expect(result).toContain("Few-Shot 示例");
      expect(result).toContain("五粮液MA20");
      expect(result).toContain("calculateMA");
      expect(result).toContain("getStockFinancial");
    });

    it("I15.3: 增强描述不丢失原始信息", () => {
      const enhancer = new ToolDescriptionEnhancer();
      enhancer.load(mockDescriptions);

      for (const desc of mockDescriptions) {
        const enhanced = enhancer.get(desc.name);
        expect(enhanced).toBeDefined();
        expect(enhanced!.description).toBe(desc.description);
        expect(enhanced!.whenToUse.length).toBeGreaterThan(3);
        expect(enhanced!.groupId).toBe(desc.groupId);
      }
    });

    it("I15.4: 工具分组描述生成", () => {
      const enhancer = new ToolDescriptionEnhancer();
      enhancer.load(mockDescriptions);

      const formatted = enhancer.formatForPrompt();
      expect(formatted).toContain("calculateMA");
      expect(formatted).toContain("technical-analysis");
      expect(formatted).toContain("getStockFinancial");
      expect(formatted).toContain("fundamental-data");
    });

    it("I15.4b: formatForPrompt 可按工具名过滤", () => {
      const enhancer = new ToolDescriptionEnhancer();
      enhancer.load(mockDescriptions);

      const formatted = enhancer.formatForPrompt(["calculateMA"]);
      expect(formatted).toContain("calculateMA");
      expect(formatted).not.toContain("getStockFinancial");
    });

    it("I15.x: 增强描述包含 when_to_use 和 when_not_to_use", () => {
      const enhancer = new ToolDescriptionEnhancer();
      enhancer.load(mockDescriptions);

      const formatted = enhancer.formatForPrompt();
      expect(formatted).toContain("何时使用");
      expect(formatted).toContain("何时不使用");
    });
  });

  describe("FewShotInjector", () => {
    it("I15.2b: inject with custom examples", () => {
      const injector = new FewShotInjector();
      const prompt = "系统提示";
      const customExamples = [
        {
          userQuery: "格力电器PE是多少",
          toolCalls: [{ tool: "getStockRealtime", parameters: { code: "000651" }, reasoning: "获取实时估值" }],
        },
      ];

      const result = injector.inject(prompt, customExamples);
      expect(result).toContain("格力电器");
      expect(result).toContain("000651");
    });

    it("I15.2c: FINANCE_FEW_SHOT_EXAMPLES 完整性", () => {
      expect(FINANCE_FEW_SHOT_EXAMPLES.length).toBeGreaterThanOrEqual(3);
      for (const example of FINANCE_FEW_SHOT_EXAMPLES) {
        expect(example.userQuery.length).toBeGreaterThan(0);
        expect(example.toolCalls.length).toBeGreaterThan(0);
        for (const tc of example.toolCalls) {
          expect(tc.tool.length).toBeGreaterThan(0);
        }
      }
    });
  });
});