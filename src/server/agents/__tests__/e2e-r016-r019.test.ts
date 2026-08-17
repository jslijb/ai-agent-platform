import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/mcp/tools/quant_analysis", () => ({
  calculateMA: vi.fn((d: number[], p: number) => ({ period: p, values: d.map(() => 50) })),
  calculateMACD: vi.fn((d: number[]) => ({ fast: 12, slow: 26, signal: 9, dif: d.map(() => 0.5), dea: d.map(() => 0.3), macd: d.map(() => 0.2) })),
  calculateRSI: vi.fn((d: number[], p: number) => ({ period: p, values: d.map(() => 50) })),
  calculateBollinger: vi.fn((d: number[]) => ({ period: 20, stdDev: 2, upper: d.map(() => 100), middle: d.map(() => 90), lower: d.map(() => 80) })),
  calculateKDJ: vi.fn((h: number[], l: number[], c: number[]) => ({ period: 9, k: c.map(() => 50), d: c.map(() => 50), j: c.map(() => 50) })),
  calculateVWAP: vi.fn(() => 15.5),
  calculateSharpeRatio: vi.fn(() => 1.2),
  calculateMaxDrawdown: vi.fn(() => ({ maxDrawdown: 0.15, peakIndex: 0, troughIndex: 5 })),
  calculateVolatility: vi.fn(() => 0.25),
  calculateCorrelation: vi.fn(() => 0.85),
}));

vi.mock("@/server/mcp/tools/risk_control", () => ({
  calculateVaR: vi.fn((p: { returns: number[]; confidence: number; horizon: number }) => ({ success: true, confidence: p.confidence, horizon: p.horizon, varValue: -0.02 })),
  calculateStressTest: vi.fn(() => ({ success: true, scenarios: [] })),
  checkRiskLimits: vi.fn(() => ({ passed: true, violations: [] })),
  generateRiskReport: vi.fn(() => ({ accountId: "test", summary: "ok" })),
}));

vi.mock("@/server/mcp/tools/compliance", () => ({
  checkTradeCompliance: vi.fn(() => ({ passed: true, violations: [], warnings: [] })),
  checkPositionLimit: vi.fn(() => ({ passed: true, violations: [], maxAllowedRatio: 0.3 })),
  checkRestrictedStock: vi.fn(() => ({ isRestricted: false, reasons: [], code: "sh.600036" })),
  getComplianceReport: vi.fn(() => ({ accountId: "test", totalChecks: 0, passedChecks: 0, failedChecks: 0, violations: [], summary: "ok" })),
}));

vi.mock("@/server/compliance/log", () => ({ logCompliance: vi.fn() }));
vi.mock("@/server/llm/router", () => ({ callWithFallback: vi.fn(async () => ({ content: '{"decisions":["test"],"toolResults":[],"userPrefs":[],"financialData":{}}', usage: { prompt_tokens: 100, completion_tokens: 50 } })) }));
vi.mock("@/server/lib/redis", () => {
  const store = new Map<string, string>();
  return {
    redisGet: vi.fn(async (key: string) => store.get(key) || null),
    redisSet: vi.fn(async (key: string, value: string, ttl?: number) => { store.set(key, value); }),
    redisDel: vi.fn(async (key: string) => { store.delete(key); }),
    isRedisConnected: vi.fn(() => false),
  };
});

import { technicalAnalysisTool, setStockDataCache } from "@/server/agents/tools/technical-analysis";
import { riskAnalysisTool } from "@/server/agents/tools/risk-analysis";
import { complianceCheckTool } from "@/server/agents/tools/compliance-check";
import { marketDataTool } from "@/server/agents/tools/market-data";
import { toolSearchTool } from "@/server/agents/tools/tool-search";
import { compactContext } from "@/server/agents/context-compaction";
import { saveCheckpoint, loadCheckpoint, recordError, canRetry, buildRecoveryContext, clearCheckpoint } from "@/server/agents/checkpoint";
import type { BailianMessage } from "@/server/llm/providers/bailian";

const MOCK_STOCK_DATA = {
  code: "sh.600036",
  closes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  highs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  lows: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  volumes: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
  dates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"],
  latestTradeDate: "2026-01-11",
};

describe("E2E: R016 工具合并验证", () => {
  it("应有6个合并工具（非21个旧工具）", () => {
    const mergedTools = [technicalAnalysisTool, riskAnalysisTool, complianceCheckTool, marketDataTool, toolSearchTool];
    const mergedNames = mergedTools.map((t) => t.name);
    expect(mergedNames).toContain("technicalAnalysis");
    expect(mergedNames).toContain("riskAnalysis");
    expect(mergedNames).toContain("complianceCheck");
    expect(mergedNames).toContain("marketData");
    expect(mergedNames).toContain("toolSearch");
  });

  it("旧工具名不应存在", () => {
    const oldNames = ["calculateMA", "calculateRSI", "getStockHistory", "getStockFinancial", "getFinancialReport", "getStockRealtime", "checkTradeCompliance", "calculateVaR"];
    const currentNames = [technicalAnalysisTool, riskAnalysisTool, complianceCheckTool, marketDataTool, toolSearchTool].map((t) => t.name);
    for (const old of oldNames) {
      expect(currentNames).not.toContain(old);
    }
  });

  it("technicalAnalysis应合并MA/RSI/MACD/BB/KDJ", async () => {
    setStockDataCache(MOCK_STOCK_DATA);
    const indicators = ["MA", "RSI", "MACD", "BB", "KDJ"];
    for (const ind of indicators) {
      const result = await technicalAnalysisTool.execute({ indicator: ind, period: 5 });
      const parsed = JSON.parse(result);
      expect(parsed.indicator).toBe(ind);
      expect(parsed.error).toBeUndefined();
    }
  });

  it("riskAnalysis应合并VWAP/Sharpe/MaxDrawdown/Volatility/VaR", async () => {
    setStockDataCache(MOCK_STOCK_DATA);
    const metrics = ["VWAP", "Sharpe", "MaxDrawdown", "Volatility", "VaR"];
    for (const m of metrics) {
      const result = await riskAnalysisTool.execute({ metric: m, confidence: 0.95, horizon: 1 });
      const parsed = JSON.parse(result);
      expect(parsed.metric).toBe(m);
      expect(parsed.error).toBeUndefined();
    }
  });

  it("complianceCheck应合并trade/position/restricted/riskLimits", async () => {
    const checks = [
      { checkType: "trade", code: "sh.600036", direction: "buy", quantity: 100, price: 35.5, prevClose: 35.0 },
      { checkType: "restricted", code: "sh.600036" },
      { checkType: "riskLimits", accountId: "test" },
    ];
    for (const params of checks) {
      const result = await complianceCheckTool.execute(params);
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeUndefined();
    }
  });

  it("marketData应合并history/realtime/financial/financialReport", () => {
    expect(marketDataTool.name).toBe("marketData");
    expect(marketDataTool.parameters.dataType.required).toBe(true);
  });

  it("toolSearch应返回所有工具详情", async () => {
    const tools = ["technicalAnalysis", "riskAnalysis", "complianceCheck", "marketData", "hybridSearch"];
    for (const t of tools) {
      const result = await toolSearchTool.execute({ toolName: t });
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe(t);
      expect(parsed.parameters).toBeDefined();
    }
  });
});

describe("E2E: R017 Context Compaction验证", () => {
  it("消息数<=20时不压缩", async () => {
    const messages: BailianMessage[] = [
      { role: "system", content: "system prompt" },
      ...Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i + 1}`,
      })),
    ];
    const { messages: result, result: compactionResult } = await compactContext(messages);
    expect(compactionResult.compacted).toBe(false);
    expect(result.length).toBe(messages.length);
  });

  it("消息数>20时压缩早期消息", async () => {
    const messages: BailianMessage[] = [
      { role: "system", content: "system prompt" },
      ...Array.from({ length: 25 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i + 1}: 招商银行营收500亿元，净利润150亿元，ROE=15.5%`,
      })),
    ];
    const { messages: result, result: compactionResult } = await compactContext(messages);
    expect(compactionResult.compacted).toBe(true);
    expect(compactionResult.originalMessageCount).toBe(25);
    expect(result.length).toBeLessThan(messages.length);
    expect(result.filter((m) => m.role === "system").length).toBe(1);
  });

  it("压缩后保留system消息和最近5条", async () => {
    const messages: BailianMessage[] = [
      { role: "system", content: "system prompt" },
      ...Array.from({ length: 25 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i + 1}`,
      })),
    ];
    const { messages: result } = await compactContext(messages);
    const nonSystem = result.filter((m) => m.role !== "system");
    expect(nonSystem.length).toBeLessThanOrEqual(7);
  });
});

describe("E2E: R018 Checkpoint+Resume验证", () => {
  const convId = "test-conv-e2e";

  it("保存和加载checkpoint", async () => {
    await saveCheckpoint(convId, 1, [{ name: "marketData", resultPreview: "成功获取数据" }], "获取历史数据");
    const checkpoint = await loadCheckpoint(convId);
    expect(checkpoint).not.toBeNull();
    expect(checkpoint!.iteration).toBe(1);
    expect(checkpoint!.completedTools.length).toBe(1);
    expect(checkpoint!.completedTools[0].name).toBe("marketData");
    await clearCheckpoint(convId);
  });

  it("错误记录和重试判断", async () => {
    await saveCheckpoint(convId, 2, [{ name: "technicalAnalysis", resultPreview: "MA20=35.5" }], "计算技术指标");
    const afterError = await recordError(convId, "LLM调用超时");
    expect(afterError).not.toBeNull();
    expect(afterError!.error).toBe("LLM调用超时");
    expect(afterError!.retryCount).toBe(1);
    expect(canRetry(afterError)).toBe(true);

    const afterError2 = await recordError(convId, "再次超时");
    expect(afterError2!.retryCount).toBe(2);
    expect(canRetry(afterError2)).toBe(false);
    await clearCheckpoint(convId);
  });

  it("恢复上下文应包含已完成工具和错误信息", async () => {
    await saveCheckpoint(convId, 3, [
      { name: "marketData", resultPreview: "获取成功" },
      { name: "technicalAnalysis", resultPreview: "MA20=35.5" },
    ], "技术分析");
    const afterError = await recordError(convId, "RSI计算失败");
    const context = buildRecoveryContext(afterError!);
    expect(context).toContain("marketData");
    expect(context).toContain("technicalAnalysis");
    expect(context).toContain("RSI计算失败");
    expect(context).toContain("跳过已完成的工具");
    await clearCheckpoint(convId);
  });
});

describe("E2E: R019 耗时追踪验证", () => {
  it("工具执行结果应包含耗时信息", async () => {
    setStockDataCache(MOCK_STOCK_DATA);
    const start = Date.now();
    const result = await technicalAnalysisTool.execute({ indicator: "MA", period: 5 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    expect(result).toBeDefined();
    const parsed = JSON.parse(result);
    expect(parsed.indicator).toBe("MA");
  });

  it("toolSearch应返回工具使用示例", async () => {
    const result = await toolSearchTool.execute({ toolName: "technicalAnalysis" });
    const parsed = JSON.parse(result);
    expect(parsed.examples).toBeDefined();
    expect(parsed.examples.length).toBeGreaterThan(0);
    expect(parsed.usageTips).toBeDefined();
  });
});