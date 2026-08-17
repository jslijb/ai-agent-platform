/**
 * HTTP E2E 测试：通过 nginx(80) 端口调用 /api/agent/run 接口
 * 
 * 验证完整链路：nginx → main-service → rag-service/data-service → LLM → 工具 → 回答
 * 覆盖 R016(工具合并) + R019(耗时追踪)
 * 
 * 运行方式：npx tsx scripts/e2e-http-test.ts
 * 前置条件：docker compose up -d，所有容器运行中
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:80";
const AUTH_EMAIL = process.env.E2E_AUTH_EMAIL || "jslijb@163.com";
const AUTH_PASSWORD = process.env.E2E_AUTH_PASSWORD || "jslij123";

interface Step {
  type: string;
  round: number;
  title: string;
  content?: string;
  detail?: Record<string, unknown>;
  timestamp?: number;
}

interface AgentResult {
  success: boolean;
  answer: string;
  iterations: number;
  conversationId: string;
  steps: Step[];
  error?: string;
}

interface QueryCase {
  id: string;
  query: string;
  category: string;
  expectedKeywords: string[];
  maxTimeMs: number;
}

const QUERIES: QueryCase[] = [
  {
    id: "Q1-事实查询",
    query: "招商银行的营业收入是多少？",
    category: "L1-事实提取",
    expectedKeywords: ["招商银行", "亿"],
    maxTimeMs: 120000,
  },
  {
    id: "Q2-技术分析",
    query: "计算招商银行(sh.600036)的MA20和RSI14指标",
    category: "L6-技术指标",
    expectedKeywords: ["MA", "RSI", "招商银行"],
    maxTimeMs: 120000,
  },
  {
    id: "Q3-风险分析",
    query: "招商银行(sh.600036)的波动率和最大回撤是多少？",
    category: "L7-合规风控",
    expectedKeywords: ["波动率", "回撤", "招商银行"],
    maxTimeMs: 120000,
  },
  {
    id: "Q4-合规检查",
    query: "检查买入招商银行100股，价格35.5元，昨收35.0元是否合规",
    category: "L5-交易规则",
    expectedKeywords: ["合规", "招商银行"],
    maxTimeMs: 120000,
  },
  {
    id: "Q5-RAG检索",
    query: "五粮液2025年年报中的主要财务数据有哪些？",
    category: "L1-事实提取",
    expectedKeywords: ["五粮液", "财务"],
    maxTimeMs: 120000,
  },
];

interface E2EResult {
  queryId: string;
  query: string;
  category: string;
  success: boolean;
  answer: string;
  answerLength: number;
  iterations: number;
  totalMs: number;
  withinTimeBudget: boolean;
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

class CookieJar {
  private cookies: Map<string, string> = new Map();

  addFromResponse(response: Response): void {
    const setCookies = response.headers.getSetCookie();
    for (const sc of setCookies) {
      const [nameValue] = sc.split(";");
      const eqIdx = nameValue.indexOf("=");
      if (eqIdx > 0) {
        const name = nameValue.substring(0, eqIdx).trim();
        const value = nameValue.substring(eqIdx + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  getCookieString(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

async function login(): Promise<CookieJar> {
  console.log(`\n[登录] ${AUTH_EMAIL} → ${BASE_URL}`);
  const jar = new CookieJar();

  // Step 1: Get CSRF token
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
    headers: { Accept: "application/json" },
  });
  jar.addFromResponse(csrfRes);
  const csrfData = await csrfRes.json() as { csrfToken: string };
  const csrfToken = csrfData.csrfToken;
  console.log(`[登录] CSRF token: ${csrfToken.substring(0, 16)}...`);

  // Step 2: Sign in with credentials
  const body = new URLSearchParams();
  body.append("email", AUTH_EMAIL);
  body.append("password", AUTH_PASSWORD);
  body.append("csrfToken", csrfToken);
  body.append("callbackUrl", `${BASE_URL}`);
  body.append("json", "true");

  const signInRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.getCookieString(),
    },
    body: body.toString(),
    redirect: "manual",
  });

  jar.addFromResponse(signInRes);

  if (signInRes.status === 302 || signInRes.status === 200) {
    // Follow redirect to get session cookies
    const location = signInRes.headers.get("location");
    if (location && signInRes.status === 302) {
      const followRes = await fetch(location, {
        headers: { Cookie: jar.getCookieString() },
        redirect: "manual",
      });
      jar.addFromResponse(followRes);
    }
  } else {
    const errText = await signInRes.text();
    throw new Error(`登录失败: status=${signInRes.status}, body=${errText.substring(0, 200)}`);
  }

  // Step 3: Verify session
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: jar.getCookieString() },
  });
  const session = await sessionRes.json() as { user?: { id?: string; email?: string } };

  if (!session.user?.id) {
    throw new Error(`登录后session无效: ${JSON.stringify(session).substring(0, 200)}`);
  }

  console.log(`[登录] 成功! userId=${session.user.id}, email=${session.user.email}`);
  return jar;
}

async function callAgentRun(query: string, cookies: string): Promise<AgentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const res = await fetch(`${BASE_URL}/api/agent/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      body: JSON.stringify({ query, maxIterations: 5 }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      throw new Error("401 未授权 - 登录cookie可能过期");
    }

    const data = await res.json() as AgentResult;
    if (!data.success) {
      throw new Error(data.error || "Agent返回失败");
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function runE2E() {
  console.log("=".repeat(70));
  console.log("HTTP E2E 测试：5个query完整链路 + 耗时报告");
  console.log("=".repeat(70));
  console.log(`目标: ${BASE_URL}`);
  console.log(`时间: ${new Date().toISOString()}`);
  console.log();

  let jar: CookieJar;
  try {
    jar = await login();
  } catch (err) {
    console.error(`\n❌ 登录失败: ${err instanceof Error ? err.message : String(err)}`);
    console.error("请确保 docker compose up -d 已运行");
    process.exit(1);
  }

  const cookies = jar.getCookieString();
  const results: E2EResult[] = [];

  for (const q of QUERIES) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`[${q.id}] ${q.category}`);
    console.log(`  Query: ${q.query}`);
    const startTime = Date.now();

    try {
      const result = await callAgentRun(q.query, cookies);
      const totalMs = Date.now() - startTime;

      const toolCalls = result.steps
        .filter((s: Step) => s.type === "tool_call" && s.detail?.toolName)
        .map((s: Step) => (s.detail as Record<string, unknown>).toolName as string);

      const keywordsFound = q.expectedKeywords.filter((k) => result.answer.includes(k));
      const keywordsMissing = q.expectedKeywords.filter((k) => !result.answer.includes(k));

      const e2eResult: E2EResult = {
        queryId: q.id,
        query: q.query,
        category: q.category,
        success: result.answer.length > 50 && keywordsFound.length >= 1,
        answer: result.answer.substring(0, 500),
        answerLength: result.answer.length,
        iterations: result.iterations,
        totalMs,
        withinTimeBudget: totalMs <= q.maxTimeMs,
        steps: result.steps.map((s: Step) => ({
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

      console.log(`  ✅ PASS | ${(totalMs / 1000).toFixed(2)}s | ${result.iterations}轮 | 回答${result.answer.length}字`);
      console.log(`  工具: ${toolCalls.join(", ") || "无"}`);
      console.log(`  关键词: ${keywordsFound.join(", ")}${keywordsMissing.length > 0 ? " | 缺失: " + keywordsMissing.join(", ") : ""}`);

      const llmSteps = e2eResult.steps.filter((s) => s.llmMs);
      const toolSteps = e2eResult.steps.filter((s) => s.toolMs);
      if (llmSteps.length > 0) {
        const totalLlm = llmSteps.reduce((s, st) => s + (st.llmMs || 0), 0);
        console.log(`  LLM: ${totalLlm}ms (${llmSteps.length}次)`);
      }
      if (toolSteps.length > 0) {
        const totalTool = toolSteps.reduce((s, st) => s + (st.toolMs || 0), 0);
        console.log(`  工具耗时: ${totalTool}ms (${toolSteps.length}次)`);
      }
    } catch (error) {
      const totalMs = Date.now() - startTime;
      results.push({
        queryId: q.id,
        query: q.query,
        category: q.category,
        success: false,
        answer: "",
        answerLength: 0,
        iterations: 0,
        totalMs,
        withinTimeBudget: false,
        steps: [],
        toolCalls: [],
        keywordsFound: [],
        keywordsMissing: q.expectedKeywords,
        error: error instanceof Error ? error.message : String(error),
      });
      console.log(`  ❌ FAIL | ${error instanceof Error ? error.message : String(error)}`);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  // ========== 汇总报告 ==========
  console.log("\n" + "=".repeat(70));
  console.log("E2E 测试汇总报告");
  console.log("=".repeat(70));

  const passCount = results.filter((r) => r.success).length;
  const totalTime = results.reduce((s, r) => s + r.totalMs, 0);
  const avgTime = totalTime / results.length;
  const withinBudget = results.filter((r) => r.withinTimeBudget).length;

  console.log(`\n通过率: ${passCount}/${results.length} (${((passCount / results.length) * 100).toFixed(0)}%)`);
  console.log(`总耗时: ${(totalTime / 1000).toFixed(1)}s | 平均: ${(avgTime / 1000).toFixed(1)}s/query`);
  console.log(`时间预算: ${withinBudget}/${results.length} 在预算内`);

  console.log("\n--- 逐Query详情 ---");
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const timeStatus = r.withinTimeBudget ? "⏱️" : "⚠️超时";
    console.log(`\n[${r.queryId}] ${status} ${timeStatus} | ${(r.totalMs / 1000).toFixed(2)}s | ${r.iterations}轮 | ${r.answerLength}字`);
    console.log(`  分类: ${r.category}`);
    console.log(`  工具: ${r.toolCalls.join(", ") || "无"}`);
    console.log(`  关键词命中: ${r.keywordsFound.join(", ")}${r.keywordsMissing.length > 0 ? " | 缺失: " + r.keywordsMissing.join(", ") : ""}`);
    if (r.error) console.log(`  错误: ${r.error}`);
  }

  // R016验证
  const allToolCalls = results.flatMap((r) => r.toolCalls);
  const oldTools = ["calculateMA", "calculateRSI", "calculateMACD", "calculateBollinger", "calculateKDJ",
    "calculateVWAP", "calculateSharpeRatio", "calculateMaxDrawdown", "calculateVolatility", "calculateCorrelation",
    "checkTradeCompliance", "checkPositionLimit", "checkRestrictedStock", "calculateVaR", "calculateStressTest", "checkRiskLimits",
    "getStockHistory", "getStockRealtime", "getStockFinancial", "getFinancialReport"];

  console.log("\n--- R016验证：工具合并 ---");
  console.log(`  实际调用工具: ${[...new Set(allToolCalls)].join(", ") || "无"}`);
  const oldCalls = allToolCalls.filter((t) => oldTools.includes(t));
  console.log(`  旧工具调用: ${oldCalls.length === 0 ? "无 ✅" : oldCalls.join(", ") + " ❌"}`);

  // R019耗时分析
  console.log("\n--- R019验证：耗时追踪 ---");
  for (const r of results) {
    if (r.steps.length === 0) continue;
    const llmSteps = r.steps.filter((s) => s.llmMs);
    const toolSteps = r.steps.filter((s) => s.toolMs);
    const totalLlm = llmSteps.reduce((s, st) => s + (st.llmMs || 0), 0);
    const totalTool = toolSteps.reduce((s, st) => s + (st.toolMs || 0), 0);
    console.log(`  [${r.queryId}] LLM=${totalLlm}ms(${llmSteps.length}次) Tool=${totalTool}ms(${toolSteps.length}次) 总=${r.totalMs}ms`);
  }

  // 写入报告
  const reportPath = "tests/reports/e2e/e2e-http-report.json";
  try {
    const fs = await import("fs/promises");
    await fs.mkdir("tests/reports/e2e", { recursive: true });
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      passCount,
      total: results.length,
      passRate: (passCount / results.length).toFixed(2),
      totalTimeMs: totalTime,
      avgTimeMs: Math.round(avgTime),
      withinBudgetCount: withinBudget,
      results,
    };
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n报告已写入: ${reportPath}`);
  } catch {
    console.log("\n报告写入失败");
  }

  process.exit(passCount === results.length ? 0 : 1);
}

runE2E().catch((err) => {
  console.error("E2E测试异常:", err);
  process.exit(1);
});
