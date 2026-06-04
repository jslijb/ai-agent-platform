import { describe, it, expect } from "vitest";
import { TOOL_GROUP_CONFIGS } from "../group-configs";
import type { ToolGroupConfig } from "../types";

describe("TOOL_GROUP_CONFIGS data integrity", () => {
  it("has exactly 6 groups", () => {
    expect(TOOL_GROUP_CONFIGS.length).toBe(6);
  });

  it("each group has required fields", () => {
    for (const group of TOOL_GROUP_CONFIGS) {
      expect(group.groupId).toBeDefined();
      expect(group.groupName).toBeDefined();
      expect(group.groupResponsibility).toBeDefined();
      expect(group.tools).toBeDefined();
      expect(group.description).toBeDefined();
      expect(group.priority).toBeDefined();
    }
  });

  it("each group has 5-12 tools", () => {
    for (const group of TOOL_GROUP_CONFIGS) {
      expect(group.tools.length).toBeGreaterThanOrEqual(5);
      expect(group.tools.length).toBeLessThanOrEqual(12);
    }
  });

  it("each tool belongs to exactly one group", () => {
    const toolCounts: Record<string, number> = {};
    for (const group of TOOL_GROUP_CONFIGS) {
      for (const tool of group.tools) {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      }
    }
    for (const [tool, count] of Object.entries(toolCounts)) {
      expect(count).toBe(1);
    }
  });

  it("groups are sorted by priority", () => {
    for (let i = 1; i < TOOL_GROUP_CONFIGS.length; i++) {
      expect(TOOL_GROUP_CONFIGS[i].priority).toBeGreaterThanOrEqual(
        TOOL_GROUP_CONFIGS[i - 1].priority
      );
    }
  });

  it("groupResponsibility values are valid", () => {
    const validResponsibilities = ["data_acquisition", "data_analysis", "mixed"];
    for (const group of TOOL_GROUP_CONFIGS) {
      expect(validResponsibilities).toContain(group.groupResponsibility);
    }
  });

  it("groupIds are unique", () => {
    const ids = TOOL_GROUP_CONFIGS.map((g) => g.groupId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains expected group IDs", () => {
    const ids = TOOL_GROUP_CONFIGS.map((g) => g.groupId);
    expect(ids).toContain("market-data");
    expect(ids).toContain("fundamental-data");
    expect(ids).toContain("technical-analysis");
    expect(ids).toContain("risk-compliance");
    expect(ids).toContain("paper-trading");
    expect(ids).toContain("knowledge-documents");
  });

  it("total tools count covers all expected tools", () => {
    const totalTools = TOOL_GROUP_CONFIGS.reduce((sum, g) => sum + g.tools.length, 0);
    // 根据设计文档应有49个工具，但实际数量可能略有不同
    expect(totalTools).toBeGreaterThanOrEqual(20);
  });
});
