import { registerMCPTool } from "./mcp-handler";
import type { MCPToolCallResult } from "./protocol";

function textResult(text: string, isError?: boolean): MCPToolCallResult {
  return { content: [{ type: "text", text }], isError };
}

export async function registerAllMCPTools(): Promise<void> {
  console.log("[mcp-server] 开始注册标准MCP工具");

  registerMCPTool(
    {
      name: "hybrid_search",
      description: "RAG混合检索工具，从知识库中检索与查询相关的文档片段",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询文本" },
          topK: { type: "number", description: "返回结果数量，默认10" },
        },
        required: ["query"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const { hybridSearch } = await import("@/server/rag/retrieval/hybrid-retriever");
        const results = await hybridSearch(params.query as string, (params.topK as number) || 10);
        const text = results.map((r, i) => `[${i + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`).join("\n\n") || "未找到相关结果";
        return textResult(text);
      } catch (err) {
        return textResult(`检索错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "technical_analysis",
      description: "技术分析工具，计算MA/RSI/MACD/KDJ/BB等技术指标",
      inputSchema: {
        type: "object",
        properties: {
          indicator: { type: "string", description: "指标类型: ma/rsi/macd/kdj/bb", enum: ["ma", "rsi", "macd", "kdj", "bb"] },
          data: { type: "array", items: { type: "number" }, description: "价格序列" },
          period: { type: "number", description: "计算周期" },
        },
        required: ["indicator", "data"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const indicator = params.indicator as string;
        const data = params.data as number[];
        if (indicator === "ma") {
          const { calculateMA } = await import("@/server/mcp/tools/quant_analysis");
          return textResult(JSON.stringify(calculateMA(data, (params.period as number) || 20)));
        }
        if (indicator === "rsi") {
          const { calculateRSI } = await import("@/server/mcp/tools/quant_analysis");
          return textResult(JSON.stringify(calculateRSI(data, params.period as number | undefined)));
        }
        return textResult(`不支持的指标: ${indicator}`, true);
      } catch (err) {
        return textResult(`技术分析错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "risk_analysis",
      description: "风险分析工具，计算VaR/波动率/最大回撤等风险指标",
      inputSchema: {
        type: "object",
        properties: {
          metric: { type: "string", description: "风险指标: var/volatility/max_drawdown/sharpe", enum: ["var", "volatility", "max_drawdown", "sharpe"] },
          returns: { type: "array", items: { type: "number" }, description: "收益率序列" },
          confidence: { type: "number", description: "置信水平(VaR用)" },
        },
        required: ["metric", "returns"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        if (params.metric === "var") {
          const { calculateVaR } = await import("@/server/mcp/tools/risk_control");
          return textResult(JSON.stringify(calculateVaR(params as unknown as Parameters<typeof calculateVaR>[0])));
        }
        return textResult(`不支持的风险指标: ${params.metric}`, true);
      } catch (err) {
        return textResult(`风险分析错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "compliance_check",
      description: "A股交易合规检查",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "股票代码" },
          direction: { type: "string", description: "交易方向 buy/sell", enum: ["buy", "sell"] },
          quantity: { type: "number", description: "数量" },
          price: { type: "number", description: "价格" },
          prevClose: { type: "number", description: "昨收价" },
        },
        required: ["code", "direction", "quantity", "price", "prevClose"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const { checkTradeCompliance } = await import("@/server/mcp/tools/compliance");
        return textResult(JSON.stringify(checkTradeCompliance(params as unknown as Parameters<typeof checkTradeCompliance>[0])));
      } catch (err) {
        return textResult(`合规检查错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "market_data",
      description: "获取A股行情数据（股票历史/实时行情/财务数据）",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "API端点" },
          body: { type: "object", description: "请求参数" },
        },
        required: ["endpoint"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const { fetchMarketData } = await import("@/server/mcp/tools/market_data");
        return textResult(JSON.stringify(await fetchMarketData(params.endpoint as string, params.body as Record<string, unknown>)));
      } catch (err) {
        return textResult(`行情数据错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  registerMCPTool(
    {
      name: "graph_query",
      description: "知识图谱查询工具，查询公司关系、财务指标等图谱数据",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "图谱查询描述" },
          entityName: { type: "string", description: "实体名称（公司/指标）" },
        },
        required: ["query"],
      },
    },
    async (params): Promise<MCPToolCallResult> => {
      try {
        const { queryGraph } = await import("@/server/mcp/tools/graph_query");
        const result = await queryGraph(params.query as string, params.entityName as string | undefined);
        return textResult(typeof result === "string" ? result : JSON.stringify(result));
      } catch (err) {
        return textResult(`图谱查询错误: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    }
  );

  console.log(`[mcp-server] 标准MCP工具注册完成，共 ${getMCPToolCount()} 个工具`);

  try {
    const { registerOdooTools } = await import("../crm-oa/odoo-tools");
    registerOdooTools();
  } catch {
    console.warn("[mcp-server] Odoo OA 工具注册跳过（Odoo 未配置）");
  }

  try {
    const { registerTwentyTools } = await import("../crm-oa/twenty-tools");
    registerTwentyTools();
  } catch {
    console.warn("[mcp-server] Twenty CRM 工具注册跳过（Twenty 未配置）");
  }

  try {
    const { registerSaaSTools } = await import("../crm-oa/saas-tools");
    registerSaaSTools();
  } catch {
    console.warn("[mcp-server] SaaS 备选通道工具注册跳过（未配置）");
  }

  console.log(`[mcp-server] 全部工具注册完成，共 ${getMCPToolCount()} 个工具`);
}

import { getMCPToolCount } from "./mcp-handler";