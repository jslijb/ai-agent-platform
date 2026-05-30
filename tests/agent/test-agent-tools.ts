import fs from "fs";
import path from "path";
import "dotenv/config";
import { db } from "../../src/server/db/client";
import { users } from "../../src/server/db/schema";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const QUERY_TIMEOUT_MS = 300000;
const DELAY_BETWEEN_QUERIES = 5000;

interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "reflection" | "retrieval" | "answer";
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

interface TestCase {
  id: string;
  category: string;
  company: string;
  query: string;
  expectedTools: string[];
  expectedKeywords: string[];
}

interface ToolCallInfo {
  round: number;
  toolName: string;
  parameters: Record<string, unknown>;
  result: string;
}

interface AgentResponse {
  success: boolean;
  answer: string;
  iterations: number;
  conversationId: string;
  steps: AgentStep[];
  error?: string;
}

interface TestAttempt {
  attemptNumber: number;
  passed: boolean;
  answer: string;
  iterations: number;
  totalMs: number;
  toolCalls: ToolCallInfo[];
  uniqueToolCount: number;
  keywordHits: string[];
  keywordMisses: string[];
  hasNumber: boolean;
  failureReasons: string[];
  error: string | null;
}

interface QueryTestResult {
  testCase: TestCase;
  finalPassed: boolean;
  attempts: TestAttempt[];
}

const TEST_QUERIES: TestCase[] = [
  { id: "A1", category: "A", company: "五粮液", query: "五粮液2025年毛利率与近60日MA20趋势对比，结合年报分析毛利率变动原因", expectedTools: ["getStockHistory", "hybridSearch", "getStockFinancial"], expectedKeywords: ["毛利率", "MA20"] },
  { id: "A2", category: "A", company: "五粮液", query: "五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力", expectedTools: ["getStockHistory", "hybridSearch", "getFinancialReport"], expectedKeywords: ["资产负债率", "成交量"] },
  { id: "A3", category: "A", company: "中国长城", query: "中国长城2025年研发费用占营收比例是多少？结合RSI指标分析近期股价是否超买", expectedTools: ["getStockHistory", "calculateRSI", "hybridSearch"], expectedKeywords: ["研发", "RSI"] },
  { id: "A4", category: "A", company: "中国长城", query: "中国长城2025年经营现金流净额是多少？结合MACD指标判断当前趋势", expectedTools: ["getStockHistory", "calculateMACD", "hybridSearch"], expectedKeywords: ["现金流", "MACD"] },
  { id: "A5", category: "A", company: "格力电器", query: "格力电器2025年应收账款周转天数是多少？结合布林带分析股价波动区间", expectedTools: ["getStockHistory", "calculateBollinger", "hybridSearch"], expectedKeywords: ["应收账款", "布林"] },
  { id: "A6", category: "A", company: "格力电器", query: "格力电器2025年分红方案是什么？结合夏普比率评估投资回报质量", expectedTools: ["getStockHistory", "calculateSharpeRatio", "hybridSearch"], expectedKeywords: ["分红", "夏普"] },
  { id: "B1", category: "B", company: "五粮液+格力电器", query: "五粮液和格力电器2025年净利率谁更高？结合近20日换手率对比市场活跃度", expectedTools: ["getStockHistory", "hybridSearch", "getStockFinancial"], expectedKeywords: ["净利率", "换手率"] },
  { id: "B2", category: "B", company: "五粮液+中国长城", query: "五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标分析短期超买超卖", expectedTools: ["getStockHistory", "calculateKDJ", "hybridSearch"], expectedKeywords: ["存货", "KDJ"] },
  { id: "B3", category: "B", company: "格力电器+中国长城", query: "格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风险水平", expectedTools: ["getStockHistory", "calculateMaxDrawdown", "hybridSearch"], expectedKeywords: ["ROE", "回撤"] },
  { id: "B4", category: "B", company: "五粮液+格力电器", query: "五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比股价稳定性", expectedTools: ["getStockHistory", "calculateVolatility", "hybridSearch"], expectedKeywords: ["商誉", "波动率"] },
  { id: "B5", category: "B", company: "中国长城+格力电器", query: "中国长城和格力电器2025年合同负债分别是多少？结合VWAP对比机构持仓成本", expectedTools: ["getStockHistory", "calculateVWAP", "hybridSearch"], expectedKeywords: ["合同负债", "VWAP"] },
  { id: "B6", category: "B", company: "五粮液+中国长城", query: "五粮液和中国长城2025年无形资产分别是多少？结合VaR对比尾部风险", expectedTools: ["getStockHistory", "calculateVaR", "hybridSearch"], expectedKeywords: ["无形资产", "VaR"] },
  { id: "C1", category: "C", company: "五粮液+格力电器+中国长城", query: "五粮液、格力电器、中国长城2025年营业收入增速排名如何？结合相关性分析三只股票走势的联动性", expectedTools: ["getStockHistory", "calculateCorrelation", "hybridSearch"], expectedKeywords: ["营业收入", "相关性"] },
  { id: "C2", category: "C", company: "五粮液+格力电器+中国长城", query: "五粮液、格力电器、中国长城2025年经营活动现金流净额分别是多少？结合压力测试对比三家公司极端行情下的风险承受能力", expectedTools: ["getStockHistory", "calculateStressTest", "hybridSearch"], expectedKeywords: ["现金流", "压力测试"] },
];

function extractToolName(detail: Record<string, unknown> | undefined): string | null {
  if (!detail) return null;
  if (typeof detail.toolName === "string") return detail.toolName;
  if (typeof detail.tool === "string") return detail.tool;
  return null;
}

function extractToolParams(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!detail) return {};
  if (detail.params && typeof detail.params === "object") return detail.params as Record<string, unknown>;
  if (detail.parameters && typeof detail.parameters === "object") return detail.parameters as Record<string, unknown>;
  return {};
}

function extractToolResult(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "";
  if (typeof detail.resultPreview === "string") return detail.resultPreview;
  if (typeof detail.result === "string") return detail.result;
  return "";
}

function extractToolCalls(steps: AgentStep[]): ToolCallInfo[] {
  const calls: ToolCallInfo[] = [];
  const toolResults = new Map<number, string>();

  for (const step of steps) {
    if (step.type === "tool_result") {
      const toolName = extractToolName(step.detail);
      if (toolName) {
        const existing = toolResults.get(step.round) || "";
        const resultStr = extractToolResult(step.detail);
        toolResults.set(step.round, existing ? `${existing}\n${resultStr}` : resultStr);
      }
    }
  }

  for (const step of steps) {
    if (step.type === "tool_call") {
      const toolName = extractToolName(step.detail);
      if (toolName) {
        calls.push({
          round: step.round,
          toolName,
          parameters: extractToolParams(step.detail),
          result: toolResults.get(step.round) || "",
        });
      }
    }
  }

  return calls;
}

function groupByRound(calls: ToolCallInfo[]): Map<number, ToolCallInfo[]> {
  const groups = new Map<number, ToolCallInfo[]>();
  for (const call of calls) {
    const round = call.round;
    if (!groups.has(round)) groups.set(round, []);
    groups.get(round)!.push(call);
  }
  return groups;
}

function validateResult(answer: string, calls: ToolCallInfo[], tc: TestCase): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const uniqueTools = new Set(calls.map(c => c.toolName));
  if (uniqueTools.size < 3) {
    reasons.push(`工具调用种类不足: ${uniqueTools.size} < 3 (调用了: ${[...uniqueTools].join(", ")})`);
  }

  const hasNumber = /\d+/.test(answer);
  if (!hasNumber) {
    reasons.push("回答中未包含具体数值");
  }

  const keywordHits = tc.expectedKeywords.filter(kw => answer.includes(kw));
  if (keywordHits.length === 0) {
    reasons.push(`回答中未包含预期关键词: ${tc.expectedKeywords.join(", ")}`);
  }

  return { passed: reasons.length === 0, reasons };
}

async function callAgent(query: string, userId: string): Promise<{ response: AgentResponse | null; totalMs: number; error?: string }> {
  const startTime = Date.now();

  try {
    const res = await fetch(`${BASE_URL}/api/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-user-id": userId,
      },
      body: JSON.stringify({ query, maxIterations: 5, userId }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });

    const data = await res.json();
    const totalMs = Date.now() - startTime;

    if (!data.success) {
      return { response: null, totalMs, error: data.error || data.message || JSON.stringify(data) };
    }

    return { response: data as AgentResponse, totalMs };
  } catch (err: any) {
    const totalMs = Date.now() - startTime;
    return { response: null, totalMs, error: err.message || String(err) };
  }
}

function truncateText(text: string, maxLen: number = 300): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "...";
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\r/g, "");
}

function generateReport(results: QueryTestResult[]): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const lines: string[] = [];

  const total = results.length;
  const passed = results.filter(r => r.finalPassed).length;
  const failed = total - passed;

  lines.push("# Agent 多工具联合测试报告");
  lines.push("");
  lines.push(`- **生成时间**: ${new Date().toLocaleString("zh-CN")}`);
  lines.push(`- **测试目标**: ${BASE_URL}`);
  lines.push(`- **测试用例数**: ${total}`);
  lines.push(`- **通过**: ${passed}`);
  lines.push(`- **失败**: ${failed}`);
  lines.push(`- **通过率**: ${((passed / total) * 100).toFixed(1)}%`);
  lines.push("");

  const byCategory: Record<string, { total: number; passed: number }> = { A: { total: 0, passed: 0 }, B: { total: 0, passed: 0 }, C: { total: 0, passed: 0 } };
  for (const r of results) {
    const cat = r.testCase.category;
    byCategory[cat].total++;
    if (r.finalPassed) byCategory[cat].passed++;
  }

  lines.push("## 按类别统计");
  lines.push("");
  lines.push("| 类别 | 说明 | 总数 | 通过 | 失败 | 通过率 |");
  lines.push("|------|------|------|------|------|--------|");
  const catNames: Record<string, string> = { A: "单公司多工具联合查询", B: "双公司对比查询", C: "三公司综合查询" };
  for (const [cat, s] of Object.entries(byCategory)) {
    if (s.total === 0) continue;
    const rate = ((s.passed / s.total) * 100).toFixed(1);
    lines.push(`| ${cat} | ${catNames[cat] || ""} | ${s.total} | ${s.passed} | ${s.total - s.passed} | ${rate}% |`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");

  lines.push("## 总体结果汇总");
  lines.push("");
  lines.push("| 编号 | 类别 | 公司 | 查询摘要 | 工具种类 | 关键词命中 | 结果 | 耗时 |");
  lines.push("|------|------|------|----------|----------|-----------|------|------|");

  for (const r of results) {
    const tc = r.testCase;
    const lastAttempt = r.attempts[r.attempts.length - 1];
    const queryShort = escapeMd(truncateText(tc.query, 30));
    const toolCount = lastAttempt?.uniqueToolCount ?? 0;
    const kwHits = lastAttempt?.keywordHits.join(",") ?? "-";
    const kwMisses = lastAttempt?.keywordMisses.join(",") ?? "";
    const kwStr = kwHits + (kwMisses ? ` (缺:${kwMisses})` : "");
    const status = r.finalPassed ? "✅通过" : "❌失败";
    const totalMs = lastAttempt?.totalMs ?? 0;
    lines.push(`| ${tc.id} | ${tc.category} | ${escapeMd(tc.company)} | ${queryShort} | ${toolCount} | ${kwStr} | ${status} | ${totalMs}ms |`);
  }
  lines.push("");

  lines.push("---");
  lines.push("");

  for (const r of results) {
    const tc = r.testCase;

    lines.push(`# [${tc.id}] ${tc.query}`);
    lines.push("");
    lines.push(`- **类别**: ${tc.category}类 (${tc.category === "A" ? "单公司多工具联合查询" : tc.category === "B" ? "双公司对比查询" : "三公司综合查询"})`);
    lines.push(`- **公司**: ${tc.company}`);
    lines.push(`- **预期工具**: ${tc.expectedTools.join(", ")}`);
    lines.push(`- **预期关键词**: ${tc.expectedKeywords.join(", ")}`);
    lines.push("");

    for (let ai = 0; ai < r.attempts.length; ai++) {
      const attempt = r.attempts[ai];

      lines.push(`## 第${attempt.attemptNumber}次测试`);
      lines.push("");

      lines.push("### 测试过程");

      const calls = attempt.toolCalls;
      const roundGroups = groupByRound(calls);
      const sortedRounds = [...roundGroups.keys()].sort((a, b) => a - b);

      if (sortedRounds.length === 0 && attempt.error) {
        lines.push(`- ❌ API调用失败: ${attempt.error}`);
      } else {
        for (const round of sortedRounds) {
          const roundCalls = roundGroups.get(round) || [];
          lines.push(`- 第${round}轮`);

          for (let ci = 0; ci < roundCalls.length; ci++) {
            const call = roundCalls[ci];
            const paramsStr = JSON.stringify(call.parameters);
            const resultPreview = truncateText(call.result, 200);
            lines.push(`  - 步骤${ci + 1}: 调用 ${call.toolName}，输入参数: ${escapeMd(paramsStr)}，返回结果: ${escapeMd(resultPreview)}`);
          }

          const isLastRound = round === sortedRounds[sortedRounds.length - 1];
          if (isLastRound) {
            lines.push(`  - 信息完整 → 结束循环，输出结果`);
          } else {
            lines.push(`  - 信息不完整 → 进入下一轮`);
          }
        }
      }

      lines.push("");
      lines.push("### 测试结果");

      if (attempt.passed) {
        lines.push(`- ✅ 成功: ${escapeMd(truncateText(attempt.answer, 300))}`);
      } else {
        if (attempt.error) {
          lines.push(`- ❌ 失败: ${attempt.error}`);
        } else {
          lines.push(`- ❌ 失败: ${attempt.failureReasons.join("; ")}`);
        }
        lines.push(`- 回答摘要: ${escapeMd(truncateText(attempt.answer, 300))}`);
        lines.push(`- 工具调用种类: ${attempt.uniqueToolCount} (预期≥3)`);
        lines.push(`- 关键词命中: ${attempt.keywordHits.join(", ") || "无"}`);
        lines.push(`- 关键词缺失: ${attempt.keywordMisses.join(", ") || "无"}`);
        lines.push(`- 包含数值: ${attempt.hasNumber ? "是" : "否"}`);
      }

      lines.push("");

      if (!attempt.passed && ai < r.attempts.length - 1) {
        lines.push("## 修复方案");
        lines.push("");
        lines.push(`- 问题: ${attempt.failureReasons.join("; ")}`);
        lines.push(`- 修复: 需要根据失败原因调整Agent工具调用策略或参数，重新测试`);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  const report = lines.join("\n");
  const reportDir = path.resolve("tests/agent/reports");
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `agent-tool-test-report-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`\n📄 测试报告已保存: ${reportPath}`);
  return report;
}

async function main() {
  console.log("=".repeat(80));
  console.log("Agent 多工具联合测试");
  console.log(`测试用例: ${TEST_QUERIES.length} 个 (A类:6, B类:6, C类:2)`);
  console.log(`测试目标: ${BASE_URL}`);
  console.log(`每个query超时: ${QUERY_TIMEOUT_MS / 1000}s`);
  console.log("=".repeat(80));

  console.log("\n[步骤0] 从数据库获取用户ID...");
  let userId: string;
  try {
    const userList = await db.select().from(users).limit(1);
    userId = userList[0]?.id || "test-user";
    console.log(`[步骤0] 获取到用户ID: ${userId.substring(0, 12)}...`);
  } catch (err: any) {
    console.error(`[步骤0] ❌ 数据库查询失败: ${err.message}`);
    userId = "test-user";
    console.log(`[步骤0] 使用默认用户ID: ${userId}`);
  }

  console.log("\n[步骤1] 开始 Agent 多工具联合测试...");
  const results: QueryTestResult[] = [];

  for (const tc of TEST_QUERIES) {
    const roundStart = Date.now();
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[${tc.id}] [${tc.category}类] 公司: ${tc.company}`);
    console.log(`[${tc.id}] Query: ${tc.query}`);
    console.log(`[${tc.id}] 预期工具: ${tc.expectedTools.join(", ")}`);
    console.log(`[${tc.id}] 预期关键词: ${tc.expectedKeywords.join(", ")}`);

    const { response, totalMs, error } = await callAgent(tc.query, userId);

    if (error || !response) {
      const totalElapsed = Date.now() - roundStart;
      console.log(`[${tc.id}] ❌ API调用失败: ${error || "响应为空"}`);
      console.log(`[${tc.id}] 耗时: ${totalElapsed}ms`);

      results.push({
        testCase: tc,
        finalPassed: false,
        attempts: [{
          attemptNumber: 1,
          passed: false,
          answer: "",
          iterations: 0,
          totalMs: totalElapsed,
          toolCalls: [],
          uniqueToolCount: 0,
          keywordHits: [],
          keywordMisses: tc.expectedKeywords,
          hasNumber: false,
          failureReasons: [`API调用失败: ${error || "响应为空"}`],
          error: error || "响应为空",
        }],
      });

      await new Promise(r => setTimeout(r, DELAY_BETWEEN_QUERIES));
      continue;
    }

    const calls = extractToolCalls(response.steps);
    const uniqueTools = new Set(calls.map(c => c.toolName));
    const { passed, reasons } = validateResult(response.answer, calls, tc);
    const keywordHits = tc.expectedKeywords.filter(kw => response.answer.includes(kw));
    const keywordMisses = tc.expectedKeywords.filter(kw => !response.answer.includes(kw));
    const hasNumber = /\d+/.test(response.answer);
    const totalElapsed = Date.now() - roundStart;

    console.log(`[${tc.id}] 迭代次数: ${response.iterations}`);
    console.log(`[${tc.id}] 工具调用详情 (共${calls.length}次调用, ${uniqueTools.size}种工具):`);
    for (const call of calls) {
      console.log(`  - 第${call.round}轮: ${call.toolName}, 参数: ${JSON.stringify(call.parameters).substring(0, 100)}`);
    }
    console.log(`[${tc.id}] 工具种类: ${[...uniqueTools].join(", ")} (预期≥3)`);
    console.log(`[${tc.id}] 关键词命中: ${keywordHits.join(", ") || "无"}, 缺失: ${keywordMisses.join(", ") || "无"}`);
    console.log(`[${tc.id}] 包含数值: ${hasNumber ? "是" : "否"}`);
    console.log(`[${tc.id}] 回答摘要: ${response.answer.substring(0, 200).replace(/\n/g, " ")}...`);
    console.log(`[${tc.id}] 耗时: ${totalElapsed}ms`);
    console.log(`[${tc.id}] ${passed ? "✅ 通过" : "❌ 失败"}${!passed ? " — " + reasons.join("; ") : ""}`);

    results.push({
      testCase: tc,
      finalPassed: passed,
      attempts: [{
        attemptNumber: 1,
        passed,
        answer: response.answer,
        iterations: response.iterations,
        totalMs: totalElapsed,
        toolCalls: calls,
        uniqueToolCount: uniqueTools.size,
        keywordHits,
        keywordMisses,
        hasNumber,
        failureReasons: reasons,
        error: null,
      }],
    });

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_QUERIES));
  }

  generateReport(results);

  const passed = results.filter(r => r.finalPassed).length;
  const failed = results.length - passed;
  console.log(`\n${"=".repeat(80)}`);
  console.log(`Agent 多工具联合测试完成! 通过: ${passed}/${results.length}, 失败: ${failed}/${results.length}`);
  console.log(`A类(单公司): ${results.filter(r => r.testCase.category === "A" && r.finalPassed).length}/6`);
  console.log(`B类(双公司): ${results.filter(r => r.testCase.category === "B" && r.finalPassed).length}/6`);
  console.log(`C类(三公司): ${results.filter(r => r.testCase.category === "C" && r.finalPassed).length}/2`);
  console.log(`${"=".repeat(80)}`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
