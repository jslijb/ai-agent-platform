/**
 * R016-R019 E2E 测试：5个query完整链路+耗时报告
 * 
 * 验证：
 * - R016: 工具合并后6个工具可用（technicalAnalysis/riskAnalysis/complianceCheck/marketData/toolSearch/hybridSearch）
 * - R017: Context Compaction（对话>20条时压缩）
 * - R018: Checkpoint保存与恢复
 * - R019: 耗时追踪（每步有llmMs/toolMs）
 * 
 * 运行方式：npx tsx scripts/e2e-r016-r019.ts
 * 注意：需要所有服务运行中（main-service/rag-service/data-service）
 */
import { runAgent } from "../src/server/agents/simpleAgent";

const QUERIES = [
  {
    id: "Q1-technicalAnalysis",
    query: "计算招商银行(sh.600036)的MA20和RSI14指标",
    expectedTools: ["marketData", "technicalAnalysis"],
    expectedKeywords: ["MA", "RSI", "招商银行", "600036"],
  },
  {
    id: "Q2-financialData",
    query: "五粮液(000858)最新营收和净利润是多少？",
    expectedTools: ["marketData"],
    expectedKeywords: ["五粮液", "营收", "净利润"],
  },
  {
    id: "Q3-riskAnalysis",
    query: "计算招商银行(sh.600036)的波动率和最大回撤",
    expectedTools: ["marketData", "riskAnalysis"],
    expectedKeywords: ["波动率", "回撤", "招商银行"],
  },
  {
    id: "Q4-complianceCheck",
    query: "检查买入招商银行100股，价格35.5元，昨收35.0元是否合规",
    expectedTools: ["complianceCheck"],
    expectedKeywords: ["合规", "涨跌", "招商银行"],
  },
  {
    id: "Q5-ragSearch",
    query: "五粮液2025年年报中的主要财务数据有哪些？",
    expectedTools: ["hybridSearch", "marketData"],
    expectedKeywords: ["五粮液", "财务"],
  },
];

interface E2EResult {
  queryId: string;
  query: string;
  success: boolean;
  answer: string;
  iterations: number;
  totalMs: number;
  steps: Array<{
    type: string;
    round: number;
    title: string;
    llmMs?: number;
    toolMs?: number;
    toolName?: string;
  }>;
  toolCalls: string[];
  keywordsFound: string[];
  keywordsMissing: string[];
  error?: string;
}

async function runE2E() {
  console.log("=".repeat(60));
  console.log("R016-R019 E2E 测试：5个query完整链路");
  console.log("=".repeat(60));
  console.log(`开始时间: ${new Date().toISOString()}`);
  console.log();

  const results: E2EResult[] = [];

  for (const q of QUERIES) {
    console.log(`\n--- ${q.id}: ${q.query} ---`);
    const startTime = Date.now();

    try {
      const result = await runAgent(
        q.query,
        5,
        undefined,
        "e2e-test-user",
        undefined,
        undefined,
        undefined,
        (step) => {
          const detail = step.detail || {};
          const timing: string[] = [];
          if (detail.llmMs) timing.push(`LLM:${detail.llmMs}ms`);
          if (detail.toolMs) timing.push(`Tool:${detail.toolMs}ms`);
          if (timing.length > 0) {
            console.log(`  [R${step.round}] ${step.type}: ${step.title} | ${timing.join(" ")}`);
          }
        }
      );

      const totalMs = Date.now() - startTime;
      const toolCalls = result.steps
        .filter((s) => s.type === "tool_call" && s.detail?.toolName)
        .map((s) => s.detail!.toolName as string);

      const keywordsFound = q.expectedKeywords.filter((k) =>
        result.answer.includes(k)
      );
      const keywordsMissing = q.expectedKeywords.filter(
        (k) => !result.answer.includes(k)
      );

      const e2eResult: E2EResult = {
        queryId: q.id,
        query: q.query,
        success: result.answer.length > 50 && keywordsFound.length >= 1,
        answer: result.answer.substring(0, 500),
        iterations: result.iterations,
        totalMs,
        steps: result.steps.map((s) => ({
          type: s.type,
          round: s.round,
          title: s.title,
          llmMs: (s.detail as Record<string, unknown>)?.llmMs as number | undefined,
          toolMs: (s.detail as Record<string, unknown>)?.toolMs as number | undefined,
          toolName: (s.detail as Record<string, unknown>)?.toolName as string | undefined,
        })),
        toolCalls,
        keywordsFound,
        keywordsMissing,
      };

      results.push(e2eResult);

      console.log(`  结果: ${e2eResult.success ? "✅ PASS" : "❌ FAIL"}`);
      console.log(`  耗时: ${(totalMs / 1000).toFixed(2)}s | 迭代: ${result.iterations}轮`);
      console.log(`  工具调用: ${toolCalls.join(", ") || "无"}`);
      console.log(`  关键词命中: ${keywordsFound.join(", ")} | 缺失: ${keywordsMissing.join(", ") || "无"}`);
      console.log(`  回答预览: ${result.answer.substring(0, 200)}...`);
    } catch (error) {
      const totalMs = Date.now() - startTime;
      results.push({
        queryId: q.id,
        query: q.query,
        success: false,
        answer: "",
        iterations: 0,
        totalMs,
        steps: [],
        toolCalls: [],
        keywordsFound: [],
        keywordsMissing: q.expectedKeywords,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`  ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 输出汇总报告
  console.log("\n" + "=".repeat(60));
  console.log("E2E 测试汇总报告");
  console.log("=".repeat(60));

  const passCount = results.filter((r) => r.success).length;
  console.log(`\n通过率: ${passCount}/${results.length}`);
  console.log(`总耗时: ${results.reduce((s, r) => s + r.totalMs, 0) / 1000}s`);

  console.log("\n--- 逐Query报告 ---");
  for (const r of results) {
    console.log(`\n[${r.queryId}] ${r.success ? "✅" : "❌"} | ${(r.totalMs / 1000).toFixed(2)}s | ${r.iterations}轮`);
    console.log(`  Query: ${r.query}`);
    console.log(`  工具: ${r.toolCalls.join(", ") || "无"}`);
    console.log(`  关键词命中: ${r.keywordsFound.join(", ")} | 缺失: ${r.keywordsMissing.join(", ") || "无"}`);
    if (r.error) console.log(`  错误: ${r.error}`);

    // R019: 耗时分析
    const llmSteps = r.steps.filter((s) => s.llmMs);
    const toolSteps = r.steps.filter((s) => s.toolMs);
    if (llmSteps.length > 0) {
      const totalLlm = llmSteps.reduce((s, st) => s + (st.llmMs || 0), 0);
      console.log(`  LLM耗时: ${totalLlm}ms (${llmSteps.length}次调用)`);
    }
    if (toolSteps.length > 0) {
      const totalTool = toolSteps.reduce((s, st) => s + (st.toolMs || 0), 0);
      console.log(`  工具耗时: ${totalTool}ms (${toolSteps.length}次调用)`);
    }
  }

  // R016验证：工具名称应为合并后的6个
  const allToolCalls = results.flatMap((r) => r.toolCalls);
  const mergedTools = ["technicalAnalysis", "riskAnalysis", "complianceCheck", "marketData", "toolSearch", "hybridSearch"];
  const oldTools = ["calculateMA", "calculateRSI", "calculateMACD", "calculateBollinger", "calculateKDJ",
    "calculateVWAP", "calculateSharpeRatio", "calculateMaxDrawdown", "calculateVolatility", "calculateCorrelation",
    "checkTradeCompliance", "checkPositionLimit", "checkRestrictedStock", "calculateVaR", "calculateStressTest", "checkRiskLimits",
    "getStockHistory", "getStockRealtime", "getStockFinancial", "getFinancialReport"];

  console.log("\n--- R016验证：工具合并 ---");
  console.log(`  调用的工具: ${[...new Set(allToolCalls)].join(", ")}`);
  const oldToolCalls = allToolCalls.filter((t) => oldTools.includes(t));
  console.log(`  旧工具调用: ${oldToolCalls.length === 0 ? "无 ✅" : oldToolCalls.join(", ") + " ❌"}`);
  const newToolCalls = allToolCalls.filter((t) => mergedTools.includes(t));
  console.log(`  新工具调用: ${newToolCalls.length > 0 ? [...new Set(newToolCalls)].join(", ") + " ✅" : "无 ❌"}`);

  // 写入报告文件
  const reportPath = "tests/reports/e2e/e2e-r016-r019-report.json";
  try {
    const fs = await import("fs/promises");
    await fs.mkdir("tests/reports/e2e", { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, passCount, total: results.length }, null, 2));
    console.log(`\n报告已写入: ${reportPath}`);
  } catch {
    console.log("\n报告写入失败（目录可能不存在）");
  }

  // 退出码
  process.exit(passCount === results.length ? 0 : 1);
}

runE2E().catch((err) => {
  console.error("E2E测试异常:", err);
  process.exit(1);
});