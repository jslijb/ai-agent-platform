import { execSync } from "child_process";

const BASE_URL = process.env.AGENT_TEST_URL || "http://localhost:3001";

interface AgentStep {
  type: string;
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

interface AgentResult {
  answer: string;
  iterations: number;
  conversationId: string;
  steps: AgentStep[];
}

interface TestCase {
  id: string;
  company: string;
  query: string;
  expectedToolTypes: string[];
  requireNumericAnswer: boolean;
  companies: string[];
  requiredAspects: string[];
}

interface TestResult {
  testCase: TestCase;
  success: boolean;
  toolCalls: Array<{ tool: string; round: number; params: Record<string, unknown>; resultPreview: string }>;
  toolKinds: string[];
  answer: string;
  iterations: number;
  error?: string;
  durationMs: number;
}

const testCases: TestCase[] = [
  {
    id: "A1",
    company: "五粮液",
    query: "五粮液2025年毛利率与近60日MA20趋势对比，结合年报分析毛利率变动原因",
    expectedToolTypes: ["getStockHistory", "hybridSearch", "getStockFinancial"],
    requireNumericAnswer: true,
    companies: ["五粮液"],
    requiredAspects: ["毛利率", "MA20", "毛利率变动原因"],
  },
  {
    id: "A2",
    company: "五粮液",
    query: "五粮液2025年资产负债率是多少？结合近30日成交量变化分析其偿债能力",
    expectedToolTypes: ["getStockHistory", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["五粮液"],
    requiredAspects: ["资产负债率", "成交量", "偿债能力"],
  },
  {
    id: "A3",
    company: "中国长城",
    query: "中国长城2025年研发费用占营收比例是多少？结合RSI指标分析近期股价是否超买",
    expectedToolTypes: ["getStockHistory", "calculateRSI", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["中国长城"],
    requiredAspects: ["研发费用", "营收比例", "RSI", "超买"],
  },
  {
    id: "A4",
    company: "中国长城",
    query: "中国长城2025年经营现金流净额是多少？结合MACD指标判断当前趋势",
    expectedToolTypes: ["getStockHistory", "calculateMACD", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["中国长城"],
    requiredAspects: ["经营现金流净额", "MACD", "趋势"],
  },
  {
    id: "A5",
    company: "格力电器",
    query: "格力电器2025年应收账款周转天数是多少？结合布林带分析股价波动区间",
    expectedToolTypes: ["getStockHistory", "calculateBollinger", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["格力电器"],
    requiredAspects: ["应收账款周转天数", "布林带", "波动区间"],
  },
  {
    id: "A6",
    company: "格力电器",
    query: "格力电器2025年分红方案是什么？结合夏普比率评估投资回报质量",
    expectedToolTypes: ["getStockHistory", "calculateSharpeRatio", "hybridSearch"],
    requireNumericAnswer: true,
    companies: ["格力电器"],
    requiredAspects: ["分红方案", "夏普比率", "投资回报"],
  },
  {
    id: "B1",
    company: "五粮液+格力电器",
    query: "五粮液和格力电器2025年净利率谁更高？结合近20日换手率对比市场活跃度",
    expectedToolTypes: ["getStockHistory", "hybridSearch", "getStockFinancial"],
    requireNumericAnswer: true,
    companies: ["五粮液", "格力电器"],
    requiredAspects: ["净利率", "换手率", "市场活跃度"],
  },
  {
    id: "B2",
    company: "五粮液+中国长城",
    query: "五粮液和中国长城2025年存货周转率对比如何？结合KDJ指标分析短期超买超卖",
    expectedToolTypes: ["getStockHistory", "calculateKDJ", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["五粮液", "中国长城"],
    requiredAspects: ["存货周转率", "KDJ", "超买超卖"],
  },
  {
    id: "B3",
    company: "格力电器+中国长城",
    query: "格力电器和中国长城2025年ROE谁更高？结合最大回撤对比风险水平",
    expectedToolTypes: ["getStockHistory", "calculateMaxDrawdown", "hybridSearch", "getStockFinancial"],
    requireNumericAnswer: true,
    companies: ["格力电器", "中国长城"],
    requiredAspects: ["ROE", "最大回撤", "风险水平"],
  },
  {
    id: "B4",
    company: "五粮液+格力电器",
    query: "五粮液和格力电器2025年商誉金额分别是多少？结合波动率对比股价稳定性",
    expectedToolTypes: ["getStockHistory", "calculateVolatility", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["五粮液", "格力电器"],
    requiredAspects: ["商誉", "波动率", "股价稳定性"],
  },
  {
    id: "B5",
    company: "中国长城+格力电器",
    query: "中国长城和格力电器2025年合同负债分别是多少？结合VWAP对比机构持仓成本",
    expectedToolTypes: ["getStockHistory", "calculateVWAP", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["中国长城", "格力电器"],
    requiredAspects: ["合同负债", "VWAP", "机构持仓成本"],
  },
  {
    id: "B6",
    company: "五粮液+中国长城",
    query: "五粮液和中国长城2025年无形资产分别是多少？结合VaR对比尾部风险",
    expectedToolTypes: ["getStockHistory", "calculateVaR", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["五粮液", "中国长城"],
    requiredAspects: ["无形资产", "VaR", "尾部风险"],
  },
  {
    id: "C1",
    company: "五粮液+格力电器+中国长城",
    query: "五粮液、格力电器、中国长城2025年营业收入增速排名如何？结合相关性分析三只股票走势的联动性",
    expectedToolTypes: ["getStockHistory", "calculateCorrelation", "hybridSearch", "getStockFinancial"],
    requireNumericAnswer: true,
    companies: ["五粮液", "格力电器", "中国长城"],
    requiredAspects: ["营业收入增速", "排名", "相关性", "联动性"],
  },
  {
    id: "C2",
    company: "五粮液+格力电器+中国长城",
    query: "五粮液、格力电器、中国长城2025年经营活动现金流净额分别是多少？结合压力测试对比三家公司极端行情下的风险承受能力",
    expectedToolTypes: ["getStockHistory", "calculateStressTest", "hybridSearch", "getFinancialReport"],
    requireNumericAnswer: true,
    companies: ["五粮液", "格力电器", "中国长城"],
    requiredAspects: ["经营活动现金流净额", "压力测试", "风险承受能力"],
  },
];

async function callAgentStream(query: string): Promise<AgentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  const response = await fetch(`${BASE_URL}/api/agent/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, maxIterations: 5 }),
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Agent API returned ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullAnswer = "";
  const steps: AgentStep[] = [];
  let conversationId = "";
  let iterations = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      let eventType = "";
      let jsonData = "";

      for (const line of part.split("\n")) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          jsonData = line.slice(6);
        }
      }

      if (!jsonData) continue;

      try {
        const event = JSON.parse(jsonData);

        if (eventType === "step") {
          steps.push(event);
        } else if (eventType === "done") {
          fullAnswer = event.answer || "";
          conversationId = event.conversationId || "";
          iterations = event.iterations || 0;
        } else if (eventType === "error") {
          throw new Error(event.message || "Agent error");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("Agent")) throw e;
      }
    }
  }

  return { answer: fullAnswer, iterations, conversationId, steps };
}

async function callAgentSync(query: string): Promise<AgentResult> {
  try {
    return await callAgentStream(query);
  } catch {
    console.log("[test] Stream API failed, trying sync API...");
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 120000);
    const response = await fetch(`${BASE_URL}/api/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxIterations: 5 }),
      signal: controller2.signal,
    });
    clearTimeout(timeout2);

    if (!response.ok) {
      throw new Error(`Agent API returned ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return {
      answer: data.answer || "",
      iterations: data.iterations || 0,
      conversationId: data.conversationId || "",
      steps: data.steps || [],
    };
  }
}

function extractToolCalls(steps: AgentStep[]): Array<{ tool: string; round: number; params: Record<string, unknown>; resultPreview: string }> {
  const calls: Array<{ tool: string; round: number; params: Record<string, unknown>; resultPreview: string }> = [];

  for (const step of steps) {
    if (step.type === "tool_call" && step.detail) {
      const detail = step.detail as Record<string, unknown>;
      const toolName = (detail.toolName as string) || (detail.skillName as string) || "";
      if (toolName) {
        calls.push({
          tool: toolName,
          round: step.round,
          params: (detail.params as Record<string, unknown>) || {},
          resultPreview: "",
        });
      }
    }
    if (step.type === "tool_result" && step.detail) {
      const detail = step.detail as Record<string, unknown>;
      const toolName = (detail.toolName as string) || "";
      const lastCall = calls.filter((c) => c.tool === toolName).pop();
      if (lastCall && !lastCall.resultPreview) {
        lastCall.resultPreview = String(detail.resultPreview || step.content).substring(0, 200);
      }
    }
  }

  return calls;
}

const ERROR_PATTERNS = [
  "fetch failed",
  "Error:",
  "未提供数据且无缓存数据",
  "连接异常",
  "接口异常",
];

function isToolResultSuccessful(result: string): boolean {
  if (!result || result.trim().length === 0) return false;
  const lower = result.toLowerCase();
  for (const pattern of ERROR_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  return result.length > 20;
}

function validateResult(testCase: TestCase, result: AgentResult): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const toolCalls = extractToolCalls(result.steps);
  const toolKinds = [...new Set(toolCalls.map((c) => c.tool))];

  const missingAspects = testCase.requiredAspects.filter(
    (aspect) => !result.answer.includes(aspect)
  );
  if (missingAspects.length > 0) {
    errors.push(`回答缺少以下关键方面: ${missingAspects.join(", ")}`);
  }

  if (testCase.requireNumericAnswer) {
    const hasNumber = /\d+\.?\d*/.test(result.answer);
    if (!hasNumber) {
      errors.push("回答未包含具体数值");
    }
  }

  for (const company of testCase.companies) {
    if (!result.answer.includes(company)) {
      errors.push(`回答未包含公司 "${company}" 的数据`);
    }
  }

  if (!result.answer || result.answer.length < 50) {
    errors.push("回答过短或为空");
  }

  const expectedButNotCalled = testCase.expectedToolTypes.filter(
    (t) => !toolKinds.includes(t)
  );
  if (expectedButNotCalled.length > 0) {
    console.log(`[INFO] ${testCase.id}: 预期但未调用的工具: ${expectedButNotCalled.join(", ")}（实际调用: ${toolKinds.join(", ")}）`);
  }

  return { pass: errors.length === 0, errors };
}

function generateMarkdownReport(results: TestResult[]): string {
  const lines: string[] = [];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  lines.push(`# Agent 回答完整性测试报告`);
  lines.push(``);
  lines.push(`**测试时间**: ${new Date().toLocaleString("zh-CN")}`);
  lines.push(`**测试环境**: ${BASE_URL}`);
  lines.push(`**验证策略**: 回答完整性（覆盖查询所有方面 + 具体数值 + 公司覆盖），不再强制工具种类数`);
  lines.push(``);

  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;
  lines.push(`## 总体结果: ${passed}/${results.length} 通过, ${failed} 失败`);
  lines.push(``);

  lines.push(`| 编号 | 公司 | 查询 | 实际工具 | 完整性 | 迭代轮次 | 耗时 | 结果 |`);
  lines.push(`|------|------|------|---------|--------|---------|------|------|`);
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const toolKinds = r.toolKinds.join(", ") || "无";
    const queryShort = r.testCase.query.substring(0, 25) + "...";
    const aspectsCovered = r.testCase.requiredAspects.filter((a) => r.answer.includes(a)).length;
    const completeness = `${aspectsCovered}/${r.testCase.requiredAspects.length}`;
    lines.push(`| ${r.testCase.id} | ${r.testCase.company} | ${queryShort} | ${toolKinds} | ${completeness} | ${r.iterations} | ${(r.durationMs / 1000).toFixed(1)}s | ${status} |`);
  }
  lines.push(``);

  for (const r of results) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## [${r.testCase.id}] ${r.testCase.query}`);
    lines.push(``);
    lines.push(`**公司**: ${r.testCase.company}`);
    lines.push(`**结果**: ${r.success ? "✅ 成功" : "❌ 失败"}`);
    lines.push(`**迭代轮次**: ${r.iterations}`);
    lines.push(`**耗时**: ${(r.durationMs / 1000).toFixed(1)}s`);
    lines.push(``);

    if (r.toolCalls.length > 0) {
      lines.push(`### 工具调用记录`);
      lines.push(``);
      for (const tc of r.toolCalls) {
        const paramsStr = JSON.stringify(tc.params).substring(0, 100);
        lines.push(`- **R${tc.round} ${tc.tool}**: 参数 ${paramsStr}`);
        if (tc.resultPreview) {
          lines.push(`  - 结果: ${tc.resultPreview.substring(0, 150)}`);
        }
      }
      lines.push(``);
    }

    lines.push(`### 回答摘要`);
    lines.push(``);
    lines.push(r.answer.substring(0, 500) + (r.answer.length > 500 ? "..." : ""));
    lines.push(``);

    if (!r.success && r.error) {
      lines.push(`### 失败原因`);
      lines.push(``);
      lines.push(r.error);
      lines.push(``);
    }
  }

  return lines.join("\n");
}

async function runTest(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${testCase.id}] ${testCase.company}: ${testCase.query.substring(0, 50)}...`);
  console.log(`${"=".repeat(60)}`);

  try {
    const result = await callAgentSync(testCase.query);
    const durationMs = Date.now() - startTime;

    const toolCalls = extractToolCalls(result.steps);
    const toolKinds = [...new Set(toolCalls.map((c) => c.tool))];

    console.log(`  迭代轮次: ${result.iterations}`);
    console.log(`  工具调用: ${toolCalls.length} 次, 种类: [${toolKinds.join(", ")}]`);
    console.log(`  回答长度: ${result.answer.length} 字符`);
    console.log(`  耗时: ${(durationMs / 1000).toFixed(1)}s`);

    const validation = validateResult(testCase, result);
    const errorStr = validation.errors.join("; ");

    if (validation.pass) {
      console.log(`  ✅ 通过`);
    } else {
      console.log(`  ❌ 失败: ${errorStr}`);
    }

    return {
      testCase,
      success: validation.pass,
      toolCalls,
      toolKinds,
      answer: result.answer,
      iterations: result.iterations,
      error: errorStr || undefined,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ 异常: ${msg}`);
    return {
      testCase,
      success: false,
      toolCalls: [],
      toolKinds: [],
      answer: "",
      iterations: 0,
      error: msg,
      durationMs,
    };
  }
}

async function main() {
  const filterId = process.argv[2]?.toUpperCase();
  const cases = filterId ? testCases.filter((tc) => tc.id === filterId) : testCases;

  if (cases.length === 0) {
    console.error(`未找到测试用例: ${filterId}`);
    console.log(`可用: ${testCases.map((tc) => tc.id).join(", ")}`);
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        Agent 多工具联合测试 (14 queries)                ║");
  console.log(`║        环境: ${BASE_URL.padEnd(44)}║`);
  console.log(`║        用例: ${String(cases.length).padEnd(44)}║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  const results: TestResult[] = [];

  for (const tc of cases) {
    const result = await runTest(tc);
    results.push(result);

    if (result.success) {
      // no delay
    } else {
      console.log(`  等待 3 秒后继续...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`测试结果: ${passed}/${results.length} 通过, ${failed} 失败`);
  console.log(`${"=".repeat(60)}`);

  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    console.log(`  ${status} [${r.testCase.id}] ${r.testCase.company} — 工具: [${r.toolKinds.join(", ")}] — ${(r.durationMs / 1000).toFixed(1)}s`);
  }

  const fs = await import("fs");
  const path = await import("path");
  const reportDir = path.resolve(process.cwd(), "tests/agent/reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const mdReport = generateMarkdownReport(results);
  const mdPath = path.join(reportDir, `agent_tool_test_${ts}.md`);
  fs.writeFileSync(mdPath, mdReport, "utf-8");
  console.log(`\nMD报告: ${mdPath}`);

  const jsonReport = {
    test_time: new Date().toISOString(),
    environment: BASE_URL,
    total: results.length,
    passed,
    failed,
    results: results.map((r) => ({
      id: r.testCase.id,
      company: r.testCase.company,
      query: r.testCase.query,
      success: r.success,
      toolKinds: r.toolKinds,
      toolCallCount: r.toolCalls.length,
      iterations: r.iterations,
      durationMs: r.durationMs,
      error: r.error,
      answerPreview: r.answer.substring(0, 200),
    })),
  };
  const jsonPath = path.join(reportDir, `agent_tool_test_${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), "utf-8");
  console.log(`JSON报告: ${jsonPath}`);

  if (failed > 0) process.exit(1);
}

main();
