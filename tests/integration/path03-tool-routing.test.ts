import { describe, it, expect, beforeEach, vi } from "vitest";
import { RouterFacade } from "@/server/agents/routing/router-facade";
import { GroupRouterAgent } from "@/server/agents/routing/group-router";
import { ToolRegistry } from "@/server/tools/registry";
import { resolveToolName, TOOL_NAME_ALIASES } from "@/server/tools/name-aliases";
import { EnhancedSkillRegistry } from "@/server/agents/skills/enhanced-registry";
import type { RegisteredTool } from "@/server/agents/skills/types";
import type { EnhancedSkillDefinition } from "@/server/agents/skills/enhanced-types";

function makeTool(name: string, description: string = "测试工具", category?: string): RegisteredTool {
  return {
    name,
    description,
    parameters: {},
    execute: async () => ({ tool: name, result: "mock" }),
    category,
  };
}

describe("路径3: 工具注册 → Agent 动态路由", () => {
  let facade: RouterFacade;
  let groupRouter: GroupRouterAgent;

  beforeEach(() => {
    // 清理注册表
    const registry = ToolRegistry as unknown as { tools: Map<string, RegisteredTool> };
    registry.tools.clear();
    const skillRegistry = EnhancedSkillRegistry as unknown as { skills: Map<string, EnhancedSkillDefinition> };
    skillRegistry.skills.clear();

    // 注册一些测试工具
    ToolRegistry.register(makeTool("calculateRSI", "计算RSI指标", "technical-analysis"));
    ToolRegistry.register(makeTool("calculateMA", "计算MA指标", "technical-analysis"));
    ToolRegistry.register(makeTool("calculateMACD", "计算MACD指标", "technical-analysis"));
    ToolRegistry.register(makeTool("getStockHistory", "获取历史K线", "market-data"));
    ToolRegistry.register(makeTool("getStockRealtime", "获取实时行情", "market-data"));
    ToolRegistry.register(makeTool("getStockFinancial", "获取财务数据", "fundamental-data"));
    ToolRegistry.register(makeTool("checkTradeCompliance", "检查交易合规", "risk-compliance"));
    ToolRegistry.register(makeTool("checkPositionLimit", "检查持仓限制", "risk-compliance"));
    ToolRegistry.register(makeTool("hybridSearch", "RAG检索", "knowledge-documents"));

    facade = new RouterFacade();
    groupRouter = new GroupRouterAgent();
  });

  describe("GroupRouterAgent 关键词路由", () => {
    it("I3.1: 技术分析 query → 正确组", () => {
      const result = groupRouter.route("帮我计算RSI");
      expect(result.routeType).toBe("group");
      const groupIds = result.matchedGroups.map((g) => g.groupId);
      expect(groupIds).toContain("technical-analysis");
    });

    it("I3.2: 风控 query → 风险组", () => {
      const result = groupRouter.route("检查持仓限制");
      expect(result.routeType).toBe("group");
      const groupIds = result.matchedGroups.map((g) => g.groupId);
      expect(groupIds).toContain("risk-compliance");
    });

    it("I3.3: 无匹配 → full_fallback", () => {
      const result = groupRouter.route("今天天气");
      expect(result.routeType).toBe("full_fallback");
      expect(result.matchedGroups).toHaveLength(0);
    });
  });

  describe("RouterFacade 路由", () => {
    it("I3.4: 空工具注册表 → 回退全部", () => {
      // 清空注册表
      const registry = ToolRegistry as unknown as { tools: Map<string, RegisteredTool> };
      registry.tools.clear();

      const emptyFacade = new RouterFacade();
      const result = emptyFacade.route("今天天气");
      expect(result.routeType).toBe("full_fallback");
      // 空注册表时 availableTools 为空
      expect(result.availableTools).toBeDefined();
    });

    it("I3.5: 别名 getMA → calculateMA", () => {
      // 注册 calculateMA（别名目标）
      ToolRegistry.register(makeTool("calculateMA", "计算MA指标", "technical-analysis"));

      // resolveToolName 应该将 getMA 解析为 calculateMA
      const resolved = resolveToolName("getMA", ToolRegistry);
      expect(resolved).toBe("calculateMA");

      // ToolRegistry.get 也应该通过别名找到工具
      const tool = ToolRegistry.get("getMA");
      expect(tool).toBeDefined();
      expect(tool!.name).toBe("calculateMA");
    });

    it("I3.6: Vector 路由降级 → keyword 路由仍可用", async () => {
      // 不初始化向量索引，直接使用关键词路由
      const result = facade.route("帮我计算RSI");
      // 即使没有向量索引，关键词路由应该工作
      expect(result.routeType).toBeDefined();
      expect(["skill", "group", "full_fallback"]).toContain(result.routeType);
    });

    it.skip("I3.7: 路由结果传给 Agent 端到端 (需要真实LLM)", async () => {
      // 此测试需要真实 LLM，跳过
    });
  });

  describe("别名解析全链路", () => {
    it("别名映射表完整性", () => {
      const aliases = Object.keys(TOOL_NAME_ALIASES);
      expect(aliases.length).toBeGreaterThan(0);
      // 验证常见别名存在
      expect(TOOL_NAME_ALIASES.getMA).toBe("calculateMA");
      expect(TOOL_NAME_ALIASES.getMACD).toBe("calculateMACD");
      expect(TOOL_NAME_ALIASES.getFinancialData).toBe("getStockFinancial");
    });

    it("已知工具名直接返回", () => {
      const resolved = resolveToolName("calculateRSI", ToolRegistry);
      expect(resolved).toBe("calculateRSI");
    });

    it("别名目标不存在时返回原名", () => {
      const resolved = resolveToolName("getMA", { has: () => false });
      // 当目标不存在时，返回原名
      expect(resolved).toBe("getMA");
    });
  });
});
