import { db } from "@/server/db/client";
import { agentLogs, llmUsageLogs } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { AgentStep } from "@/server/agents/simpleAgent";

export async function saveAgentLog(params: {
  userId: string;
  conversationId?: string;
  query: string;
  answer: string;
  model: string;
  iterations: number;
  steps: AgentStep[];
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  status: "success" | "error" | "timeout";
  errorMessage?: string;
}) {
  try {
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      conversationId: params.conversationId || null,
      userId: params.userId,
      query: params.query,
      answer: params.answer,
      model: params.model,
      iterations: params.iterations,
      totalSteps: params.steps.length,
      steps: params.steps as unknown as Record<string, unknown>[],
      promptTokens: params.promptTokens || 0,
      completionTokens: params.completionTokens || 0,
      totalTokens: params.totalTokens || 0,
      latencyMs: params.latencyMs,
      status: params.status,
      errorMessage: params.errorMessage || null,
    });
    console.log(`[agent-logger] 日志已保存: query="${params.query.substring(0, 50)}...", 轮次=${params.iterations}, 步骤数=${params.steps.length}`);
  } catch (error) {
    console.error("[agent-logger] 保存日志失败:", error);
  }
}

export async function saveLLMUsage(params: {
  model: string;
  provider?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callType: string;
  success: boolean;
  latencyMs?: number;
}) {
  try {
    await db.insert(llmUsageLogs).values({
      id: crypto.randomUUID(),
      model: params.model,
      provider: params.provider || "bailian",
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
      callType: params.callType,
      success: params.success ? 1 : 0,
      latencyMs: params.latencyMs || null,
    });
  } catch (error) {
    console.error("[llm-logger] 保存LLM使用记录失败:", error);
  }
}

export interface AgentLogSummary {
  totalCalls: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  avgLatencyMs: number;
  avgIterations: number;
  byModel: Record<string, { count: number; tokens: number; avgLatency: number }>;
  byStatus: Record<string, number>;
}

export async function getAgentLogsSummary(userId: string): Promise<AgentLogSummary> {
  const rows = await db
    .select({
      model: agentLogs.model,
      totalTokens: agentLogs.totalTokens,
      latencyMs: agentLogs.latencyMs,
      iterations: agentLogs.iterations,
      status: agentLogs.status,
    })
    .from(agentLogs)
    .where(eq(agentLogs.userId, userId));

  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalLatency = 0;
  let totalIterations = 0;
  const byModel: Record<string, { count: number; tokens: number; avgLatency: number }> = {};
  const byStatus: Record<string, number> = {};

  for (const row of rows) {
    totalTokens += row.totalTokens || 0;
    totalLatency += row.latencyMs || 0;
    totalIterations += row.iterations || 0;

    const modelKey = row.model || "unknown";
    if (!byModel[modelKey]) {
      byModel[modelKey] = { count: 0, tokens: 0, avgLatency: 0 };
    }
    byModel[modelKey].count += 1;
    byModel[modelKey].tokens += row.totalTokens || 0;

    const s = row.status || "unknown";
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  for (const m of Object.values(byModel)) {
    m.avgLatency = m.count > 0 ? Math.round(m.avgLatency / m.count) : 0;
  }

  return {
    totalCalls: rows.length,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    avgLatencyMs: rows.length > 0 ? Math.round(totalLatency / rows.length) : 0,
    avgIterations: rows.length > 0 ? Math.round(totalIterations / rows.length * 10) / 10 : 0,
    byModel,
    byStatus,
  };
}
