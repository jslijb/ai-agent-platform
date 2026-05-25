import { callBailian, type BailianMessage } from "@/server/llm/providers/bailian";
import {
  calculateMA,
  calculateMACD,
  calculateRSI,
  calculateBollinger,
  calculateKDJ,
  calculateVWAP,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateVolatility,
  calculateCorrelation,
} from "@/server/mcp/tools/quant_analysis";
import {
  checkTradeCompliance,
  checkPositionLimit,
  checkRestrictedStock,
  getComplianceReport,
} from "@/server/mcp/tools/compliance";
import { calculateVaR, calculateStressTest, checkRiskLimits, generateRiskReport } from "@/server/mcp/tools/risk_control";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { shouldRetrieveAgain } from "@/server/agents/reflection-node";
import { createConversation, addMessage, getRecentMessages } from "@/server/agents/memory";

const AGENT_TIMEOUT_MS = 120000;

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, unknown>) => Promise<string> | string;
}

const tools: ToolDefinition[] = [
  {
    name: "calculateMA",
    description: "计算移动平均线（MA）。输入价格序列和周期，返回MA值。",
    parameters: {
      data: { type: "number[]", description: "价格序列，如收盘价数组", required: true },
      period: { type: "number", description: "移动平均周期，如5、10、20", required: true },
    },
    execute: (params) => {
      const result = calculateMA(params.data as number[], params.period as number);
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateMACD",
    description: "计算MACD指标。输入价格序列，返回DIF、DEA、MACD柱状图。",
    parameters: {
      data: { type: "number[]", description: "价格序列", required: true },
      fast: { type: "number", description: "快线周期，默认12" },
      slow: { type: "number", description: "慢线周期，默认26" },
      signal: { type: "number", description: "信号线周期，默认9" },
    },
    execute: (params) => {
      const result = calculateMACD(
        params.data as number[],
        params.fast as number | undefined,
        params.slow as number | undefined,
        params.signal as number | undefined
      );
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateRSI",
    description: "计算RSI指标（相对强弱指数）。",
    parameters: {
      data: { type: "number[]", description: "价格序列", required: true },
      period: { type: "number", description: "RSI周期，默认14" },
    },
    execute: (params) => {
      const result = calculateRSI(params.data as number[], params.period as number | undefined);
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateBollinger",
    description: "计算布林带指标。",
    parameters: {
      data: { type: "number[]", description: "价格序列", required: true },
      period: { type: "number", description: "周期，默认20" },
      stdDev: { type: "number", description: "标准差倍数，默认2" },
    },
    execute: (params) => {
      const result = calculateBollinger(
        params.data as number[],
        params.period as number | undefined,
        params.stdDev as number | undefined
      );
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateKDJ",
    description: "计算KDJ指标。",
    parameters: {
      highs: { type: "number[]", description: "最高价序列", required: true },
      lows: { type: "number[]", description: "最低价序列", required: true },
      closes: { type: "number[]", description: "收盘价序列", required: true },
      period: { type: "number", description: "KDJ周期，默认9" },
    },
    execute: (params) => {
      const result = calculateKDJ(
        params.highs as number[],
        params.lows as number[],
        params.closes as number[],
        params.period as number | undefined
      );
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateVWAP",
    description: "计算VWAP（成交量加权平均价）。",
    parameters: {
      closes: { type: "number[]", description: "收盘价序列", required: true },
      volumes: { type: "number[]", description: "成交量序列", required: true },
    },
    execute: (params) => {
      const result = calculateVWAP(params.closes as number[], params.volumes as number[]);
      return JSON.stringify({ vwap: result });
    },
  },
  {
    name: "calculateSharpeRatio",
    description: "计算夏普比率。",
    parameters: {
      returns: { type: "number[]", description: "收益率序列", required: true },
      riskFreeRate: { type: "number", description: "无风险利率，默认0.03" },
    },
    execute: (params) => {
      const result = calculateSharpeRatio(
        params.returns as number[],
        params.riskFreeRate as number | undefined
      );
      return JSON.stringify({ sharpeRatio: result });
    },
  },
  {
    name: "calculateMaxDrawdown",
    description: "计算最大回撤。",
    parameters: {
      values: { type: "number[]", description: "资产净值序列", required: true },
    },
    execute: (params) => {
      const result = calculateMaxDrawdown(params.values as number[]);
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateVolatility",
    description: "计算波动率。",
    parameters: {
      returns: { type: "number[]", description: "收益率序列", required: true },
      annualize: { type: "boolean", description: "是否年化，默认true" },
    },
    execute: (params) => {
      const result = calculateVolatility(
        params.returns as number[],
        params.annualize as boolean | undefined
      );
      return JSON.stringify({ volatility: result });
    },
  },
  {
    name: "calculateCorrelation",
    description: "计算两个序列的相关系数。",
    parameters: {
      series1: { type: "number[]", description: "第一组数据", required: true },
      series2: { type: "number[]", description: "第二组数据", required: true },
    },
    execute: (params) => {
      const result = calculateCorrelation(params.series1 as number[], params.series2 as number[]);
      return JSON.stringify({ correlation: result });
    },
  },
  {
    name: "checkTradeCompliance",
    description: "A股交易合规检查，包括涨跌停、交易单位、T+1等规则。",
    parameters: {
      code: { type: "string", description: "股票代码", required: true },
      direction: { type: "string", description: "交易方向 buy/sell", required: true },
      quantity: { type: "number", description: "数量", required: true },
      price: { type: "number", description: "价格", required: true },
      prevClose: { type: "number", description: "昨收价", required: true },
      isST: { type: "boolean", description: "是否ST股" },
      boardType: { type: "string", description: "板块类型 main/gem/star" },
    },
    execute: (params) => {
      const result = checkTradeCompliance({
        code: params.code as string,
        direction: params.direction as string,
        quantity: params.quantity as number,
        price: params.price as number,
        prevClose: params.prevClose as number,
        isST: (params.isST as boolean) || false,
        boardType: (params.boardType as "main" | "gem" | "star") || "main",
      });
      return JSON.stringify(result);
    },
  },
  {
    name: "checkPositionLimit",
    description: "持仓限制检查，单只股票不超过总资产30%。",
    parameters: {
      accountId: { type: "string", description: "账户ID", required: true },
      code: { type: "string", description: "股票代码", required: true },
      quantity: { type: "number", description: "持仓市值", required: true },
      totalAssets: { type: "number", description: "总资产", required: true },
    },
    execute: (params) => {
      const result = checkPositionLimit({
        accountId: params.accountId as string,
        code: params.code as string,
        quantity: params.quantity as number,
        totalAssets: params.totalAssets as number,
      });
      return JSON.stringify(result);
    },
  },
  {
    name: "checkRestrictedStock",
    description: "检查是否为受限股票（新股、退市整理期等）。",
    parameters: {
      code: { type: "string", description: "股票代码", required: true },
    },
    execute: (params) => {
      const result = checkRestrictedStock(params.code as string);
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateVaR",
    description: "计算VaR（在险价值）。",
    parameters: {
      returns: { type: "number[]", description: "收益率序列", required: true },
      confidence: { type: "number", description: "置信水平，如0.95", required: true },
      horizon: { type: "number", description: "持有期天数", required: true },
    },
    execute: (params) => {
      const result = calculateVaR({
        returns: params.returns as number[],
        confidence: params.confidence as number,
        horizon: params.horizon as number,
      });
      return JSON.stringify(result);
    },
  },
  {
    name: "calculateStressTest",
    description: "压力测试，评估不同市场情景下的潜在损失。",
    parameters: {
      portfolio: { type: "object", description: "投资组合", required: true },
      scenarios: { type: "array", description: "压力情景列表", required: true },
    },
    execute: (params) => {
      const result = calculateStressTest({
        portfolio: params.portfolio as Record<string, { quantity: number; currentPrice: number }>,
        scenarios: params.scenarios as { name: string; priceChange: number }[],
      });
      return JSON.stringify(result);
    },
  },
  {
    name: "checkRiskLimits",
    description: "风险限额检查（单日2%、单周5%、单月10%）。",
    parameters: {
      accountId: { type: "string", description: "账户ID", required: true },
    },
    execute: (params) => {
      const result = checkRiskLimits({ accountId: params.accountId as string });
      return JSON.stringify(result);
    },
  },
  {
    name: "hybridSearch",
    description: "RAG 混合检索工具。使用稠密检索和稀疏检索的 RRF 融合方式，从知识库中检索与查询相关的文档片段。适用于查找公司财报、行业分析、政策法规等文档内容。",
    parameters: {
      query: { type: "string", description: "搜索查询文本", required: true },
      topK: { type: "number", description: "返回结果数量，默认10" },
    },
    execute: async (params) => {
      try {
        const results = await hybridSearch(
          params.query as string,
          (params.topK as number) || 10
        );
        const formatted = results
          .map((r, i) => `[${i + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`)
          .join("\n\n");
        return formatted || "未找到相关结果";
      } catch (error) {
        console.error("[simpleAgent] hybridSearch 执行失败:", error);
        return `检索失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
];

function getToolDescriptions(): string {
  return tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  参数: ${JSON.stringify(t.parameters)}`
    )
    .join("\n\n");
}

function parseToolCall(text: string): { name: string; params: Record<string, unknown> } | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tool && parsed.parameters) {
        return { name: parsed.tool, params: parsed.parameters };
      }
    }

    const actionMatch = text.match(/Action:\s*(\w+)\s*\n\s*Action Input:\s*([\s\S]*?)(?=\n\n|Observation|$)/i);
    if (actionMatch) {
      const name = actionMatch[1].trim();
      const params = JSON.parse(actionMatch[2].trim());
      return { name, params };
    }
  } catch {
    console.error("[simpleAgent] 解析工具调用失败");
  }
  return null;
}

export interface AgentResult {
  answer: string;
  iterations: number;
  conversationId: string;
}

export async function runAgent(query: string, maxIterations: number = 5, conversationId?: string): Promise<AgentResult> {
  console.log(`[simpleAgent] 收到查询: ${query}, 最大迭代次数: ${maxIterations}`);
  const startTime = Date.now();

  let convId = conversationId;
  if (!convId) {
    convId = await createConversation("default-user");
  }

  const historyMessages = await getRecentMessages(convId);
  await addMessage(convId, "user", query);

  const systemPrompt = `你是一个金融分析AI助手，可以使用以下工具来回答用户的问题：

${getToolDescriptions()}

当你需要使用工具时，请按以下格式输出：
\`\`\`json
{
  "tool": "工具名称",
  "parameters": { 参数 }
}
\`\`\`

当你已经获得足够信息可以回答时，直接输出最终答案，不要使用工具格式。
每次只调用一个工具。

重要提示：
- 当用户提问涉及公司财报、行业分析、政策法规等文档内容时，优先使用 hybridSearch 工具从知识库中检索相关信息。
- 如果第一次检索结果不够充分，可以尝试改写查询关键词再次检索。`;

  const messages: BailianMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages.filter((m) => m.role !== "system").map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: query },
  ];

  let iterations = 0;
  let lastSearchResults: string[] = [];

  for (let i = 0; i < maxIterations; i++) {
    if (Date.now() - startTime > AGENT_TIMEOUT_MS) {
      console.error(`[simpleAgent] Agent 执行超过 ${AGENT_TIMEOUT_MS}ms，强制终止`);
      await addMessage(convId, "assistant", "Agent 执行超时，请稍后重试或简化您的问题。");
      return { answer: "Agent 执行超时，请稍后重试或简化您的问题。", iterations, conversationId: convId };
    }
    iterations++;
    console.log(`[simpleAgent] 第 ${i + 1}/${maxIterations} 轮迭代`);

    try {
      const response = await callBailian(messages);
      const assistantContent = response.content;

      console.log(`[simpleAgent] LLM 响应: ${assistantContent.substring(0, 200)}...`);

      messages.push({ role: "assistant", content: assistantContent });

      const toolCall = parseToolCall(assistantContent);
      if (!toolCall) {
        console.log("[simpleAgent] 无工具调用，进入反思评估阶段");

        const reflection = await shouldRetrieveAgain(query, assistantContent, lastSearchResults);

        if (reflection.needMore && reflection.refinedQuery && i < maxIterations - 1) {
          console.log(
            `[simpleAgent] 反思结果: 需要更多信息, 改写查询: "${reflection.refinedQuery}"`
          );

          const ragResult = await hybridSearch(reflection.refinedQuery, 10);
          const formattedResult = ragResult
            .map((r, idx) => `[${idx + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`)
            .join("\n\n");

          lastSearchResults.push(formattedResult);

          messages.push({
            role: "user",
            content: `反思检索结果（查询: "${reflection.refinedQuery}"）:\n${formattedResult}\n\n请基于以上所有信息，重新回答用户的问题。如果信息仍然不足，请直接给出你目前最好的回答。`,
          });

          continue;
        }

        console.log("[simpleAgent] 反思通过，返回最终答案");
        await addMessage(convId, "assistant", assistantContent);
        return { answer: assistantContent, iterations, conversationId: convId };
      }

      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool) {
        const errorMsg = `未找到工具: ${toolCall.name}`;
        console.error(`[simpleAgent] ${errorMsg}`);
        messages.push({ role: "user", content: `Observation: 错误 - ${errorMsg}` });
        continue;
      }

      console.log(`[simpleAgent] 调用工具: ${toolCall.name}, 参数: ${JSON.stringify(toolCall.params).substring(0, 100)}`);

      const toolResult = await tool.execute(toolCall.params);
      console.log(`[simpleAgent] 工具结果: ${toolResult.substring(0, 200)}...`);

      if (toolCall.name === "hybridSearch") {
        lastSearchResults.push(toolResult);
      }

      messages.push({ role: "user", content: `Observation: ${toolResult}` });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[simpleAgent] 迭代异常: ${errorMsg}`);
      await addMessage(convId, "assistant", `Agent 执行出错: ${errorMsg}`);
      return { answer: `Agent 执行出错: ${errorMsg}`, iterations, conversationId: convId };
    }
  }

  await addMessage(convId, "assistant", "Agent 超过最大迭代次数，未能得出结论。");
  return { answer: "Agent 超过最大迭代次数，未能得出结论。", iterations, conversationId: convId };
}
