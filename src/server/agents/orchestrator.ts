import { callBailianWithCache } from "@/server/llm/cache";
import type { BailianMessage } from "@/server/llm/providers/bailian";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { shouldRetrieveAgain } from "@/server/agents/reflection-node";
import { RouterFacade } from "@/server/agents/routing/router-facade";
import { ExecutionFacade } from "@/server/agents/execution-facade";
import {
  calculateMA, calculateMACD, calculateRSI, calculateBollinger,
  calculateKDJ, calculateVWAP, calculateSharpeRatio,
  calculateMaxDrawdown, calculateVolatility, calculateCorrelation,
} from "@/server/mcp/tools/quant_analysis";
import {
  checkTradeCompliance, checkPositionLimit, checkRestrictedStock,
} from "@/server/mcp/tools/compliance";
import { calculateVaR, calculateStressTest, checkRiskLimits } from "@/server/mcp/tools/risk_control";

interface OrchestratorState {
  query: string;
  messages: BailianMessage[];
  currentAnswer: string;
  iterations: number;
  searchResults: string[];
  route: "research" | "quant" | "compliance" | "general" | "skill";
  done: boolean;
}

const AGENT_TIMEOUT_MS = 120000;

const QUANT_TOOLS: Record<string, Function> = {
  calculateMA, calculateMACD, calculateRSI, calculateBollinger,
  calculateKDJ, calculateVWAP, calculateSharpeRatio,
  calculateMaxDrawdown, calculateVolatility, calculateCorrelation,
};

const COMPLIANCE_TOOLS: Record<string, Function> = {
  checkTradeCompliance, checkPositionLimit, checkRestrictedStock,
  calculateVaR, calculateStressTest, checkRiskLimits,
};

function routeQuery(query: string): OrchestratorState["route"] {
  const lower = query.toLowerCase();
  const quantKeywords = ["ma", "macd", "rsi", "布林", "kdj", "vwap", "夏普", "回撤", "波动率", "移动平均", "技术指标", "量化"];
  const complianceKeywords = ["合规", "风控", "var", "压力测试", "涨跌停", "持仓限制", "受限", "风险限额"];
  const researchKeywords = ["研报", "财报", "行业分析", "政策", "公司分析", "新闻", "公告"];

  if (quantKeywords.some((k) => lower.includes(k))) return "quant";
  if (complianceKeywords.some((k) => lower.includes(k))) return "compliance";
  if (researchKeywords.some((k) => lower.includes(k))) return "research";
  return "general";
}

function getSystemPrompt(route: OrchestratorState["route"]): string {
  const basePrompt = "你是一个金融分析AI助手。";
  const toolNames = route === "quant"
    ? Object.keys(QUANT_TOOLS).join(", ")
    : route === "compliance"
    ? Object.keys(COMPLIANCE_TOOLS).join(", ")
    : "hybridSearch";

  return `${basePrompt}

当前模式: ${route}
可用工具: ${toolNames}

当你需要使用工具时，请按以下格式输出：
\`\`\`json
{
  "tool": "工具名称",
  "parameters": { 参数 }
}
\`\`\`

当你已经获得足够信息可以回答时，直接输出最终答案。`;
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
    console.error("[orchestrator] 解析工具调用失败");
  }
  return null;
}

async function executeTool(name: string, params: Record<string, unknown>): Promise<string> {
  try {
    if (name === "hybridSearch") {
      const results = await hybridSearch(params.query as string, (params.topK as number) || 10);
      return results.map((r, i) => `[${i + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`).join("\n\n") || "未找到相关结果";
    }

    const quantFn = QUANT_TOOLS[name];
    if (quantFn) {
      return JSON.stringify(quantFn(params));
    }

    const complianceFn = COMPLIANCE_TOOLS[name];
    if (complianceFn) {
      return JSON.stringify(complianceFn(params));
    }

    return `未找到工具: ${name}`;
  } catch (error) {
    return `工具执行失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const routerFacade = new RouterFacade();
const executionFacade = new ExecutionFacade();

let routerInitialized = false;
async function ensureRouterInitialized(): Promise<void> {
  if (routerInitialized) return;
  try {
    await routerFacade.initialize();
  } catch {
    console.warn("[orchestrator] RouterFacade初始化失败，使用降级路由");
  }
  routerInitialized = true;
}

export async function runOrchestrator(
  query: string,
  maxIterations: number = 5
): Promise<{ answer: string; iterations: number; route: string }> {
  const startTime = Date.now();

  await ensureRouterInitialized();

  try {
    const decision = routerFacade.route(query);

    if (decision.routeType === "skill" && decision.matchedSkill) {
      console.log(`[orchestrator] RouterFacade路由到Skill: ${decision.matchedSkill.name}, 查询: ${query}`);

      const result = await executionFacade.execute(
        decision,
        query,
        {
          routeType: decision.routeType,
          availableTools: decision.availableTools,
          systemPrompt: decision.enhancedPrompt,
        }
      );

      return {
        answer: result.output,
        iterations: 1,
        route: "skill",
      };
    }
  } catch (err) {
    console.warn(`[orchestrator] RouterFacade路由失败，降级到传统路由: ${err instanceof Error ? err.message : String(err)}`);
  }

  const route = routeQuery(query);
  console.log(`[orchestrator] 查询路由: ${route}, 查询: ${query}`);

  const systemPrompt = getSystemPrompt(route);
  const messages: BailianMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  let iterations = 0;
  let lastSearchResults: string[] = [];

  for (let i = 0; i < maxIterations; i++) {
    iterations++;

    if (Date.now() - startTime > AGENT_TIMEOUT_MS) {
      console.error(`[orchestrator] 执行超过 ${AGENT_TIMEOUT_MS}ms，强制终止`);
      return { answer: "Agent 执行超时，请稍后重试。", iterations, route };
    }

    try {
      const response = await callBailianWithCache(messages, undefined, 0);
      const assistantContent = response.content ?? "";

      messages.push({ role: "assistant", content: assistantContent });

      const toolCall = parseToolCall(assistantContent);
      if (!toolCall) {
        const reflection = await shouldRetrieveAgain(query, assistantContent, lastSearchResults);

        if (reflection.needMore && reflection.refinedQuery && i < maxIterations - 1) {
          const ragResult = await hybridSearch(reflection.refinedQuery, 10);
          const formattedResult = ragResult.map((r, idx) => `[${idx + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`).join("\n\n");
          lastSearchResults.push(formattedResult);
          messages.push({
            role: "user",
            content: `反思检索结果（查询: "${reflection.refinedQuery}"）:\n${formattedResult}\n\n请基于以上所有信息，重新回答用户的问题。`,
          });
          continue;
        }

        return { answer: assistantContent, iterations, route };
      }

      const toolResult = await executeTool(toolCall.name, toolCall.params);
      if (toolCall.name === "hybridSearch") {
        lastSearchResults.push(toolResult);
      }
      messages.push({ role: "user", content: `Observation: ${toolResult}` });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[orchestrator] 迭代异常: ${errorMsg}`);
      return { answer: `Agent 执行出错: ${errorMsg}`, iterations, route };
    }
  }

  return { answer: "Agent 超过最大迭代次数，未能得出结论。", iterations, route };
}
