import { describe, it, expect, beforeEach } from "vitest";
import { resolveToolName, TOOL_NAME_ALIASES } from "@/server/tools/name-aliases";
import { ToolRegistry } from "@/server/tools/registry";
import type { RegisteredTool } from "@/server/agents/skills/types";

function makeTool(name: string, description: string = "测试工具"): RegisteredTool {
  return {
    name,
    description,
    parameters: {},
    execute: async () => ({}),
  };
}

describe("路径17: NameAliases → ToolRegistry → Agent 工具别名解析", () => {
  beforeEach(() => {
    const registry = ToolRegistry as unknown as {
      tools: Map<string, RegisteredTool>;
    };
    const tools = (registry as { tools: Map<string, RegisteredTool> }).tools;
    tools.clear();

    ToolRegistry.register(makeTool("calculateMA", "计算移动平均线"));
    ToolRegistry.register(makeTool("calculateMACD", "计算MACD指标"));
    ToolRegistry.register(makeTool("calculateRSI", "计算RSI指标"));
    ToolRegistry.register(makeTool("calculateBollinger", "计算布林带"));
    ToolRegistry.register(makeTool("getStockFinancial", "获取财务数据"));
    ToolRegistry.register(makeTool("checkTradeCompliance", "交易合规检查"));
    ToolRegistry.register(makeTool("checkPositionLimit", "持仓限制检查"));
  });

  it("I17.1: getMA→calculateMA 别名解析", () => {
    const resolved = resolveToolName("getMA", ToolRegistry);
    expect(resolved).toBe("calculateMA");
    expect(ToolRegistry.has("calculateMA")).toBe(true);
    expect(ToolRegistry.get("getMA")).toBeDefined();
  });

  it("I17.2: getMACD→calculateMACD 别名解析", () => {
    const resolved = resolveToolName("getMACD", ToolRegistry);
    expect(resolved).toBe("calculateMACD");
    expect(ToolRegistry.has("calculateMACD")).toBe(true);
  });

  it("I17.3: getFinancialData→getStockFinancial 别名解析", () => {
    const resolved = resolveToolName("getFinancialData", ToolRegistry);
    expect(resolved).toBe("getStockFinancial");
    expect(ToolRegistry.get("getFinancialData")).toBeDefined();
  });

  it("I17.4: known tool name returns directly", () => {
    const resolved = resolveToolName("calculateRSI", ToolRegistry);
    expect(resolved).toBe("calculateRSI");
  });

  it("I17.5: alias target not registered returns original name", () => {
    const resolved = resolveToolName("getRiskLimits", ToolRegistry);
    expect(resolved).toBe("getRiskLimits");
  });

  it("I17.6: unknown name returns as-is", () => {
    const resolved = resolveToolName("nonexistentTool", ToolRegistry);
    expect(resolved).toBe("nonexistentTool");
  });

  it("I17.x: 所有别名映射完整性检查", () => {
    for (const [alias, target] of Object.entries(TOOL_NAME_ALIASES)) {
      const registered = ToolRegistry.has(target);
      if (registered) {
        expect(resolveToolName(alias, ToolRegistry)).toBe(target);
      }
    }
  });
});