import { describe, it, expect } from "vitest";
import { TOOL_ENHANCED_DESCRIPTIONS } from "../tool-enhanced-descriptions";

describe("TOOL_ENHANCED_DESCRIPTIONS data integrity", () => {
  it("has descriptions for all key tools", () => {
    const names = TOOL_ENHANCED_DESCRIPTIONS.map((d) => d.name);
    // 核心工具必须存在
    const requiredTools = [
      "getStockHistory",
      "getStockRealtime",
      "getStockFinancial",
      "calculateMA",
      "calculateMACD",
      "calculateRSI",
      "checkTradeCompliance",
      "hybridSearch",
    ];
    for (const tool of requiredTools) {
      expect(names).toContain(tool);
    }
  });

  it("each description has required fields", () => {
    for (const desc of TOOL_ENHANCED_DESCRIPTIONS) {
      expect(desc.name).toBeDefined();
      expect(desc.description).toBeDefined();
      expect(desc.whenToUse).toBeDefined();
      expect(desc.whenNotToUse).toBeDefined();
      expect(desc.parameters).toBeDefined();
      expect(desc.exampleCalls).toBeDefined();
      expect(desc.groupId).toBeDefined();
    }
  });

  it("each description has at least one example call", () => {
    for (const desc of TOOL_ENHANCED_DESCRIPTIONS) {
      expect(desc.exampleCalls.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("whenNotToUse points to correct alternative tools", () => {
    // 验证 whenNotToUse 中提到的工具名在描述列表中存在
    const names = new Set(TOOL_ENHANCED_DESCRIPTIONS.map((d) => d.name));
    for (const desc of TOOL_ENHANCED_DESCRIPTIONS) {
      // whenNotToUse 应该提到替代工具名
      expect(desc.whenNotToUse.length).toBeGreaterThan(0);
    }
  });

  it("groupIds match known group IDs", () => {
    const validGroups = [
      "market-data",
      "fundamental-data",
      "technical-analysis",
      "risk-compliance",
      "paper-trading",
      "knowledge-documents",
    ];
    for (const desc of TOOL_ENHANCED_DESCRIPTIONS) {
      expect(validGroups).toContain(desc.groupId);
    }
  });

  it("tool names are unique", () => {
    const names = TOOL_ENHANCED_DESCRIPTIONS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("confusing tools have cross-references in whenNotToUse", () => {
    // getStockFinancial vs getFinancialReport 互相指向
    const financial = TOOL_ENHANCED_DESCRIPTIONS.find(d => d.name === "getStockFinancial");
    const report = TOOL_ENHANCED_DESCRIPTIONS.find(d => d.name === "getFinancialReport");
    expect(financial?.whenNotToUse).toContain("getFinancialReport");
    expect(report?.whenNotToUse).toContain("getStockFinancial");

    // getStockHistory vs getStockRealtime 互相指向
    const history = TOOL_ENHANCED_DESCRIPTIONS.find(d => d.name === "getStockHistory");
    const realtime = TOOL_ENHANCED_DESCRIPTIONS.find(d => d.name === "getStockRealtime");
    expect(history?.whenNotToUse).toContain("getStockRealtime");
    expect(realtime?.whenNotToUse).toContain("getStockHistory");
  });
});
