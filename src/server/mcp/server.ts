import { ToolRegistry } from "@/server/tools/registry";
import { SkillRegistry, executeSkill } from "@/server/agents/skills";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<string> | string;
}

const registeredTools = new Map<string, MCPTool>();

export function registerTool(tool: MCPTool): void {
  registeredTools.set(tool.name, tool);
  console.log(`[mcp-server] 注册工具: ${tool.name}`);
}

export function getRegisteredTools(): MCPTool[] {
  return Array.from(registeredTools.values());
}

export function listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return Array.from(registeredTools.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export function listSkills(): Array<{ name: string; description: string; triggerKeywords?: string[]; stepCount: number }> {
  return SkillRegistry.list().map((s) => ({
    name: s.name,
    description: s.description,
    triggerKeywords: s.triggerKeywords,
    stepCount: s.steps.length,
  }));
}

export async function callTool(name: string, params: Record<string, unknown>): Promise<string> {
  const tool = registeredTools.get(name);
  if (tool) {
    return tool.handler(params);
  }

  const registryTool = ToolRegistry.get(name);
  if (registryTool) {
    const result = await registryTool.execute(params);
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  throw new Error(`工具不存在: ${name}`);
}

export async function callSkill(name: string, params: Record<string, unknown>): Promise<string> {
  const skill = SkillRegistry.get(name);
  if (!skill) {
    throw new Error(`Skill不存在: ${name}`);
  }
  const result = await executeSkill(skill, params);
  return result.finalOutput;
}

export function registerAllTools(): void {
  console.log("[mcp-server] 开始注册所有 MCP 工具");

  registerTool({
    name: "hybrid_search",
    description: "RAG 混合检索工具，从知识库中检索与查询相关的文档片段",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索查询文本" },
        topK: { type: "number", description: "返回结果数量，默认10" },
      },
      required: ["query"],
    },
    handler: async (params) => {
      const { hybridSearch } = await import("@/server/rag/retrieval/hybrid-retriever");
      const results = await hybridSearch(params.query as string, (params.topK as number) || 10);
      return results.map((r, i) => `[${i + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`).join("\n\n") || "未找到相关结果";
    },
  });

  registerTool({
    name: "calculate_ma",
    description: "计算移动平均线",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "array", items: { type: "number" }, description: "价格序列" },
        period: { type: "number", description: "移动平均周期" },
      },
      required: ["data", "period"],
    },
    handler: async (params) => {
      const { calculateMA } = await import("@/server/mcp/tools/quant_analysis");
      return JSON.stringify(calculateMA(params.data as number[], params.period as number));
    },
  });

  registerTool({
    name: "calculate_rsi",
    description: "计算RSI指标",
    inputSchema: {
      type: "object",
      properties: {
        data: { type: "array", items: { type: "number" }, description: "价格序列" },
        period: { type: "number", description: "RSI周期" },
      },
      required: ["data"],
    },
    handler: async (params) => {
      const { calculateRSI } = await import("@/server/mcp/tools/quant_analysis");
      return JSON.stringify(calculateRSI(params.data as number[], params.period as number | undefined));
    },
  });

  registerTool({
    name: "check_trade_compliance",
    description: "A股交易合规检查",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "股票代码" },
        direction: { type: "string", description: "交易方向 buy/sell" },
        quantity: { type: "number", description: "数量" },
        price: { type: "number", description: "价格" },
        prevClose: { type: "number", description: "昨收价" },
      },
      required: ["code", "direction", "quantity", "price", "prevClose"],
    },
    handler: async (params) => {
      const { checkTradeCompliance } = await import("@/server/mcp/tools/compliance");
      return JSON.stringify(checkTradeCompliance(params as unknown as Parameters<typeof checkTradeCompliance>[0]));
    },
  });

  registerTool({
    name: "calculate_var",
    description: "计算VaR（在险价值）",
    inputSchema: {
      type: "object",
      properties: {
        returns: { type: "array", items: { type: "number" }, description: "收益率序列" },
        confidence: { type: "number", description: "置信水平" },
        horizon: { type: "number", description: "持有期天数" },
      },
      required: ["returns", "confidence", "horizon"],
    },
    handler: async (params) => {
      const { calculateVaR } = await import("@/server/mcp/tools/risk_control");
      return JSON.stringify(calculateVaR(params as unknown as Parameters<typeof calculateVaR>[0]));
    },
  });

  registerTool({
    name: "get_market_data",
    description: "获取A股行情数据",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: { type: "string", description: "API端点" },
        body: { type: "object", description: "请求参数" },
      },
      required: ["endpoint"],
    },
    handler: async (params) => {
      const { fetchMarketData } = await import("@/server/mcp/tools/market_data");
      return JSON.stringify(await fetchMarketData(params.endpoint as string, params.body as Record<string, unknown>));
    },
  });

  console.log(`[mcp-server] 工具注册完成，共 ${registeredTools.size} 个工具`);
  console.log(`[mcp-server] ToolRegistry 中还有 ${ToolRegistry.size()} 个工具可通过 callTool 访问`);
  console.log(`[mcp-server] SkillRegistry 中有 ${SkillRegistry.list().length} 个Skill可通过 callSkill 访问`);
}
