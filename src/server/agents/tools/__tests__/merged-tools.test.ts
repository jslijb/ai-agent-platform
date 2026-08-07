import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/mcp/tools/quant_analysis", () => ({
  calculateMA: vi.fn((data: number[], period: number) => ({
    period,
    values: data.map((_, i) => i >= period - 1 ? data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period : null),
  })),
  calculateMACD: vi.fn((data: number[]) => ({
    fast: 12, slow: 26, signal: 9,
    dif: data.map(() => 0.5), dea: data.map(() => 0.3), macd: data.map(() => 0.2),
  })),
  calculateRSI: vi.fn((data: number[], period: number) => ({
    period,
    values: data.map(() => 50),
  })),
  calculateBollinger: vi.fn((data: number[]) => ({
    period: 20, stdDev: 2,
    upper: data.map(() => 100), middle: data.map(() => 90), lower: data.map(() => 80),
  })),
  calculateKDJ: vi.fn((highs: number[], lows: number[], closes: number[]) => ({
    period: 9,
    k: closes.map(() => 50), d: closes.map(() => 50), j: closes.map(() => 50),
  })),
  calculateVWAP: vi.fn(() => 15.5),
  calculateSharpeRatio: vi.fn(() => 1.2),
  calculateMaxDrawdown: vi.fn(() => ({ maxDrawdown: 0.15, peakIndex: 0, troughIndex: 5 })),
  calculateVolatility: vi.fn(() => 0.25),
  calculateCorrelation: vi.fn(() => 0.85),
}));

vi.mock("@/server/mcp/tools/risk_control", () => ({
  calculateVaR: vi.fn((params: { returns: number[]; confidence: number; horizon: number }) => ({
    success: true, confidence: params.confidence, horizon: params.horizon, varValue: -0.02,
  })),
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

vi.mock("@/server/compliance/log", () => ({
  logCompliance: vi.fn(),
}));

import { technicalAnalysisTool, setStockDataCache, getStockDataCache } from "../technical-analysis";
import { riskAnalysisTool } from "../risk-analysis";
import { complianceCheckTool } from "../compliance-check";
import { toolSearchTool } from "../tool-search";
import { marketDataTool } from "../market-data";

describe("technicalAnalysisTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStockDataCache({
      code: "sh.600036",
      closes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      highs: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
      lows: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      volumes: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
      dates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"],
      latestTradeDate: "2026-01-11",
    });
  });

  it("should calculate MA with cached data", async () => {
    const result = await technicalAnalysisTool.execute({ indicator: "MA", period: 5 });
    const parsed = JSON.parse(result);
    expect(parsed.indicator).toBe("MA");
    expect(parsed.period).toBe(5);
    expect(parsed.latestMA).toBeDefined();
  });

  it("should calculate MACD with cached data", async () => {
    const result = await technicalAnalysisTool.execute({ indicator: "MACD" });
    const parsed = JSON.parse(result);
    expect(parsed.indicator).toBe("MACD");
    expect(parsed.latestDIF).toBeDefined();
  });

  it("should calculate RSI with cached data", async () => {
    const result = await technicalAnalysisTool.execute({ indicator: "RSI", period: 14 });
    const parsed = JSON.parse(result);
    expect(parsed.indicator).toBe("RSI");
  });

  it("should calculate BB with cached data", async () => {
    const result = await technicalAnalysisTool.execute({ indicator: "BB" });
    const parsed = JSON.parse(result);
    expect(parsed.indicator).toBe("BB");
  });

  it("should calculate KDJ with cached data", async () => {
    const result = await technicalAnalysisTool.execute({ indicator: "KDJ" });
    const parsed = JSON.parse(result);
    expect(parsed.indicator).toBe("KDJ");
  });

  it("should return error for unsupported indicator", async () => {
    const result = await technicalAnalysisTool.execute({ indicator: "UNKNOWN" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("不支持");
  });

  it("should return error when no data available", async () => {
    setStockDataCache(null as any);
    const result = await technicalAnalysisTool.execute({ indicator: "MA", period: 5 });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });

  it("should have correct tool metadata", () => {
    expect(technicalAnalysisTool.name).toBe("technicalAnalysis");
    expect(technicalAnalysisTool.category).toBe("technical-analysis");
    expect(technicalAnalysisTool.parameters.indicator.required).toBe(true);
  });
});

describe("riskAnalysisTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStockDataCache({
      code: "sh.600036",
      closes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      highs: [], lows: [],
      volumes: [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000],
      dates: [], latestTradeDate: null,
    });
  });

  it("should calculate VWAP with cached data", async () => {
    const result = await riskAnalysisTool.execute({ metric: "VWAP" });
    const parsed = JSON.parse(result);
    expect(parsed.metric).toBe("VWAP");
    expect(parsed.value).toBeDefined();
  });

  it("should calculate Sharpe with cached data", async () => {
    const result = await riskAnalysisTool.execute({ metric: "Sharpe" });
    const parsed = JSON.parse(result);
    expect(parsed.metric).toBe("Sharpe");
  });

  it("should calculate MaxDrawdown with cached data", async () => {
    const result = await riskAnalysisTool.execute({ metric: "MaxDrawdown" });
    const parsed = JSON.parse(result);
    expect(parsed.metric).toBe("MaxDrawdown");
  });

  it("should calculate Volatility with cached data", async () => {
    const result = await riskAnalysisTool.execute({ metric: "Volatility" });
    const parsed = JSON.parse(result);
    expect(parsed.metric).toBe("Volatility");
  });

  it("should calculate VaR with cached data", async () => {
    const result = await riskAnalysisTool.execute({ metric: "VaR", confidence: 0.95, horizon: 1 });
    const parsed = JSON.parse(result);
    expect(parsed.metric).toBe("VaR");
  });

  it("should return error for unsupported metric", async () => {
    const result = await riskAnalysisTool.execute({ metric: "UNKNOWN" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("不支持");
  });

  it("should have correct tool metadata", () => {
    expect(riskAnalysisTool.name).toBe("riskAnalysis");
    expect(riskAnalysisTool.category).toBe("risk-analysis");
    expect(riskAnalysisTool.parameters.metric.required).toBe(true);
  });
});

describe("complianceCheckTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should check trade compliance", async () => {
    const result = await complianceCheckTool.execute({
      checkType: "trade",
      code: "sh.600036", direction: "buy", quantity: 100, price: 35.5, prevClose: 35.0,
    });
    const parsed = JSON.parse(result);
    expect(parsed.checkType).toBe("trade");
  });

  it("should check restricted stock", async () => {
    const result = await complianceCheckTool.execute({ checkType: "restricted", code: "sh.600036" });
    const parsed = JSON.parse(result);
    expect(parsed.checkType).toBe("restricted");
  });

  it("should check risk limits", async () => {
    const result = await complianceCheckTool.execute({ checkType: "riskLimits", accountId: "test-account" });
    const parsed = JSON.parse(result);
    expect(parsed.checkType).toBe("riskLimits");
  });

  it("should return error for missing trade params", async () => {
    const result = await complianceCheckTool.execute({ checkType: "trade", code: "sh.600036" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toBeDefined();
  });

  it("should return error for unsupported check type", async () => {
    const result = await complianceCheckTool.execute({ checkType: "unknown" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("不支持");
  });

  it("should have correct tool metadata", () => {
    expect(complianceCheckTool.name).toBe("complianceCheck");
    expect(complianceCheckTool.category).toBe("risk-compliance");
    expect(complianceCheckTool.parameters.checkType.required).toBe(true);
  });
});

describe("toolSearchTool", () => {
  it("should return tool details for technicalAnalysis", async () => {
    const result = await toolSearchTool.execute({ toolName: "technicalAnalysis" });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("technicalAnalysis");
    expect(parsed.parameters).toBeDefined();
    expect(parsed.examples).toBeDefined();
    expect(parsed.examples.length).toBeGreaterThan(0);
  });

  it("should return tool details for marketData", async () => {
    const result = await toolSearchTool.execute({ toolName: "marketData" });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe("marketData");
  });

  it("should return error for unknown tool", async () => {
    const result = await toolSearchTool.execute({ toolName: "nonExistent" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("未找到");
  });

  it("should have correct tool metadata", () => {
    expect(toolSearchTool.name).toBe("toolSearch");
    expect(toolSearchTool.category).toBe("meta");
    expect(toolSearchTool.parameters.toolName.required).toBe(true);
  });
});

describe("marketDataTool", () => {
  it("should have correct tool metadata", () => {
    expect(marketDataTool.name).toBe("marketData");
    expect(marketDataTool.category).toBe("market-data");
    expect(marketDataTool.parameters.dataType.required).toBe(true);
    expect(marketDataTool.parameters.code.required).toBe(true);
  });

  it("should return error for unsupported data type", async () => {
    const result = await marketDataTool.execute({ dataType: "unknown", code: "600036" });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain("不支持");
  });
});