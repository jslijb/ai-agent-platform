import { describe, it, expect } from "vitest";
import { ToolGroupManager } from "../routing/tool-group-manager";
import { GroupRouterAgent } from "../agents/routing/group-router";
import { SkillRouterAgent } from "../agents/routing/skill-router";
import type { ToolGroupConfig } from "../routing/types";
import { TOOL_GROUP_CONFIGS } from "../routing/group-configs";

describe("ToolGroupManager", () => {
  it("loadGroups with default configs", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    expect(mgr.getAllGroups().length).toBe(TOOL_GROUP_CONFIGS.length);
  });

  it("getToolsInGroup returns tools for valid groupId", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    const tools = mgr.getToolsInGroup("market-data");
    expect(tools.length).toBeGreaterThan(0);
    expect(tools).toContain("getStockHistory");
  });

  it("getToolsInGroup returns empty for unknown group", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    expect(mgr.getToolsInGroup("nonexistent")).toEqual([]);
  });

  it("getAllGroups sorted by priority", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    const groups = mgr.getAllGroups();
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i].priority).toBeGreaterThanOrEqual(groups[i - 1].priority);
    }
  });

  it("getGroupForTool returns correct group", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    const group = mgr.getGroupForTool("getStockHistory");
    expect(group?.groupId).toBe("market-data");
  });

  it("getGroupForTool returns undefined for unknown tool", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    expect(mgr.getGroupForTool("unknownTool")).toBeUndefined();
  });

  it("getGroupsForTools returns unique groups", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    const groups = mgr.getGroupsForTools(["getStockHistory", "calculateMA"]);
    expect(groups.length).toBe(2);
    const ids = groups.map((g) => g.groupId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validateConfig returns valid for default configs", () => {
    const mgr = new ToolGroupManager();
    mgr.loadGroups();
    const result = mgr.validateConfig();
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("loadGroups with custom configs", () => {
    const mgr = new ToolGroupManager();
    const custom: ToolGroupConfig[] = [
      {
        groupId: "test-group",
        groupName: "Test",
        groupResponsibility: "data_acquisition",
        tools: ["toolA", "toolB", "toolC", "toolD", "toolE"],
        description: "test",
        priority: 1,
      },
    ];
    mgr.loadGroups(custom);
    expect(mgr.getAllGroups().length).toBe(1);
    expect(mgr.getToolsInGroup("test-group")).toEqual(["toolA", "toolB", "toolC", "toolD", "toolE"]);
  });
});

describe("GroupRouterAgent", () => {
  it("routes query with market keywords to market-data group", () => {
    const agent = new GroupRouterAgent();
    const result = agent.route("获取股价K线数据");
    expect(result.matchedGroups.length).toBeGreaterThan(0);
    expect(result.routeType).toBe("group");
    const groupIds = result.matchedGroups.map((g) => g.groupId);
    expect(groupIds).toContain("market-data");
  });

  it("routes query with risk keywords to risk-compliance group", () => {
    const agent = new GroupRouterAgent();
    const result = agent.route("合规检查和风控");
    expect(result.matchedGroups.length).toBeGreaterThan(0);
    const groupIds = result.matchedGroups.map((g) => g.groupId);
    expect(groupIds).toContain("risk-compliance");
  });

  it("returns full_fallback for unmatched query", () => {
    const agent = new GroupRouterAgent();
    const result = agent.route("今天天气怎么样");
    expect(result.routeType).toBe("full_fallback");
    expect(result.matchedGroups).toEqual([]);
  });

  it("mergedToolNames contains tools from matched groups", () => {
    const agent = new GroupRouterAgent();
    const result = agent.route("获取股价K线数据");
    if (result.routeType === "group") {
      expect(result.mergedToolNames.length).toBeGreaterThan(0);
    }
  });
});

describe("SkillRouterAgent", () => {
  it("returns unmatched for unknown query when no skills registered", () => {
    const agent = new SkillRouterAgent();
    const result = agent.route("一些随机查询xyz");
    expect(result.matched).toBe(false);
    expect(result.routeType).toBe("group_fallback");
    expect(result.confidence).toBe(0);
  });
});
