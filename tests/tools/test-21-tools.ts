import * as fs from "fs";
import * as path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const TEST_USER_ID = "test-user-auto";
const TIMEOUT_MS = 180000;
const DELAY_BETWEEN_TESTS = 3000;

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  context: string;
  thinking: boolean;
  functionCalling: boolean;
}

interface TestCase {
  id: number;
  query: string;
  targetTool: string;
  expectedKeywords: string[];
  description: string;
}

interface RoundDetail {
  round: number;
  llmMs: number | null;
  toolName: string | null;
  toolMs: number | null;
  roundMs: number | null;
}

interface AttemptResult {
  attemptNumber: number;
  model: string;
  passed: boolean;
  answer: string;
  iterations: number;
  totalMs: number;
  toolCalled: boolean;
  keywordMatches: { keyword: string; found: boolean }[];
  roundDetails: RoundDetail[];
  error: string | null;
  fixLog: string | null;
  isModelExhausted: boolean;
}

interface TestResult {
  id: number;
  query: string;
  targetTool: string;
  description: string;
  totalAttempts: number;
  finalPassed: boolean;
  attempts: AttemptResult[];
}

const testCases: TestCase[] = [
  {
    id: 1,
    query: "获取招商银行最近1年的日K线数据",
    targetTool: "getStockHistory",
    expectedKeywords: ["招商银行", "收盘价", "条"],
    description: "测试getStockHistory工具 - 获取股票历史K线数据",
  },
  {
    id: 2,
    query: "查询贵州茅台实时行情",
    targetTool: "getStockRealtime",
    expectedKeywords: ["茅台", "最新价"],
    description: "测试getStockRealtime工具 - 获取股票实时行情",
  },
  {
    id: 3,
    query: "查询贵州茅台的财务数据，包括营收和净利润",
    targetTool: "getStockFinancial",
    expectedKeywords: ["茅台"],
    description: "测试getStockFinancial工具 - 获取股票财务数据",
  },
  {
    id: 4,
    query: "查询贵州茅台的利润表",
    targetTool: "getFinancialReport",
    expectedKeywords: ["茅台", "利润表"],
    description: "测试getFinancialReport工具 - 获取财务报表",
  },
  {
    id: 5,
    query: "搜索A股交易规则相关文档",
    targetTool: "hybridSearch",
    expectedKeywords: ["A股"],
    description: "测试hybridSearch工具 - RAG混合检索",
  },
  {
    id: 6,
    query: "计算招商银行的20日移动平均线MA20",
    targetTool: "calculateMA",
    expectedKeywords: ["MA20", "招商银行"],
    description: "测试calculateMA工具 - 计算移动平均线",
  },
  {
    id: 7,
    query: "计算招商银行的MACD指标",
    targetTool: "calculateMACD",
    expectedKeywords: ["MACD", "DIF"],
    description: "测试calculateMACD工具 - 计算MACD指标",
  },
  {
    id: 8,
    query: "计算招商银行的RSI指标",
    targetTool: "calculateRSI",
    expectedKeywords: ["RSI"],
    description: "测试calculateRSI工具 - 计算RSI指标",
  },
  {
    id: 9,
    query: "计算招商银行的布林带指标",
    targetTool: "calculateBollinger",
    expectedKeywords: ["布林", "上轨"],
    description: "测试calculateBollinger工具 - 计算布林带",
  },
  {
    id: 10,
    query: "计算招商银行的KDJ指标",
    targetTool: "calculateKDJ",
    expectedKeywords: ["KDJ"],
    description: "测试calculateKDJ工具 - 计算KDJ指标",
  },
  {
    id: 11,
    query: "计算招商银行的VWAP成交量加权平均价",
    targetTool: "calculateVWAP",
    expectedKeywords: ["VWAP", "招商银行"],
    description: "测试calculateVWAP工具 - 计算VWAP",
  },
  {
    id: 12,
    query: "计算招商银行的夏普比率",
    targetTool: "calculateSharpeRatio",
    expectedKeywords: ["夏普"],
    description: "测试calculateSharpeRatio工具 - 计算夏普比率",
  },
  {
    id: 13,
    query: "计算招商银行的最大回撤",
    targetTool: "calculateMaxDrawdown",
    expectedKeywords: ["回撤", "最大"],
    description: "测试calculateMaxDrawdown工具 - 计算最大回撤",
  },
  {
    id: 14,
    query: "计算招商银行的波动率",
    targetTool: "calculateVolatility",
    expectedKeywords: ["波动率"],
    description: "测试calculateVolatility工具 - 计算波动率",
  },
  {
    id: 15,
    query: "计算招商银行和五粮液的相关系数",
    targetTool: "calculateCorrelation",
    expectedKeywords: ["相关系数"],
    description: "测试calculateCorrelation工具 - 计算相关系数",
  },
  {
    id: 16,
    query: "检查以22元买入招商银行(sh.600036)100股，昨收20元，是否合规",
    targetTool: "checkTradeCompliance",
    expectedKeywords: ["合规", "涨停"],
    description: "测试checkTradeCompliance工具 - 交易合规检查",
  },
  {
    id: 17,
    query: "检查账户A持有招商银行30万元，总资产100万元，持仓比例是否合规",
    targetTool: "checkPositionLimit",
    expectedKeywords: ["持仓", "合规"],
    description: "测试checkPositionLimit工具 - 持仓限制检查",
  },
  {
    id: 18,
    query: "检查股票sh.600036是否为受限股票",
    targetTool: "checkRestrictedStock",
    expectedKeywords: ["受限"],
    description: "测试checkRestrictedStock工具 - 受限股票检查",
  },
  {
    id: 19,
    query: "计算招商银行在95%置信水平下1天的VaR",
    targetTool: "calculateVaR",
    expectedKeywords: ["VaR"],
    description: "测试calculateVaR工具 - 计算VaR",
  },
  {
    id: 20,
    query: "对持有招商银行100股当前价40元的组合进行压力测试，假设市场下跌10%和20%",
    targetTool: "calculateStressTest",
    expectedKeywords: ["压力测试", "情景"],
    description: "测试calculateStressTest工具 - 压力测试",
  },
  {
    id: 21,
    query: "检查账户test-account的风险限额",
    targetTool: "checkRiskLimits",
    expectedKeywords: ["风险", "限额"],
    description: "测试checkRiskLimits工具 - 风险限额检查",
  },
];

interface StepData {
  type: string;
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

class ModelManager {
  private models: string[];
  private currentIndex: number;
  private exhaustedModels: Set<string> = new Set();
  private modelUsageCount: Map<string, number> = new Map();
  private modelTokenEstimate: Map<string, number> = new Map();

  constructor(models: string[]) {
    this.models = models;
    this.currentIndex = 0;
  }

  getCurrentModel(): string {
    return this.models[this.currentIndex];
  }

  markExhausted(model: string, reason: string) {
    this.exhaustedModels.add(model);
    console.log(`\n⚠️  模型 [${model}] Token耗尽 (${reason})，已标记为不可用`);
    console.log(`    已耗尽模型: ${Array.from(this.exhaustedModels).join(", ")}`);
    this.switchToNext();
  }

  private switchToNext(): boolean {
    const startIndex = this.currentIndex;
    for (let i = 1; i <= this.models.length; i++) {
      const nextIndex = (startIndex + i) % this.models.length;
      if (!this.exhaustedModels.has(this.models[nextIndex])) {
        this.currentIndex = nextIndex;
        console.log(`    切换到模型: [${this.models[this.currentIndex]}]`);
        return true;
      }
    }
    console.error(`❌ 所有模型Token均已耗尽！无法继续测试`);
    return false;
  }

  recordUsage(model: string, estimatedTokens: number) {
    const count = (this.modelUsageCount.get(model) || 0) + 1;
    this.modelUsageCount.set(model, count);
    const tokens = (this.modelTokenEstimate.get(model) || 0) + estimatedTokens;
    this.modelTokenEstimate.set(model, tokens);
  }

  hasAvailableModel(): boolean {
    return this.models.some((m) => !this.exhaustedModels.has(m));
  }

  getExhaustedModels(): string[] {
    return Array.from(this.exhaustedModels);
  }

  getUsageReport(): string {
    let report = "模型使用统计:\n";
    for (const model of this.models) {
      const count = this.modelUsageCount.get(model) || 0;
      const tokens = this.modelTokenEstimate.get(model) || 0;
      const exhausted = this.exhaustedModels.has(model) ? " ❌已耗尽" : " ✅可用";
      report += `  ${model}: ${count}次调用, ~${(tokens / 10000).toFixed(1)}万token${exhausted}\n`;
    }
    return report;
  }
}

async function fetchModels(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/agent/models`);
    const data = await res.json();
    if (data.success && Array.isArray(data.models)) {
      const modelIds = data.models
        .filter((m: ModelInfo) => m.functionCalling === true)
        .map((m: ModelInfo) => m.id);
      console.log(`从配置加载了 ${modelIds.length} 个支持函数调用的模型`);
      return modelIds;
    }
  } catch (err) {
    console.warn(`无法从API获取模型列表: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("使用默认模型列表");
  return [
    "qwen3.7-max",
    "qwen3.6-max-preview",
    "qwen3.6-flash",
    "qwen3.5-plus 2026-04-20",
    "qwen3.6-35b-a3b",
    "deepseek-v4-pro",
    "deepseek-v4-flash",
    "deepseek-r1",
  ];
}

function isTokenExhausted(error: string | null, answer: string): boolean {
  if (!error && !answer) return false;
  const errorText = (error || "").toLowerCase();
  if (errorText.includes("token_exhausted")) return true;
  if (errorText.includes("403") && (errorText.includes("quota") || errorText.includes("exhaust") || errorText.includes("forbidden") || errorText.includes("limit"))) return true;
  if (errorText.includes("free tier") && errorText.includes("exhaust")) return true;
  if (errorText.includes("余额不足")) return true;
  if (errorText.includes("insufficient") && errorText.includes("quota")) return true;
  return false;
}

function isModelNotExist(error: string | null): boolean {
  if (!error) return false;
  return error.includes("404") || error.includes("does not exist") || error.includes("do not have access");
}

async function callAgentStream(query: string, model?: string): Promise<{
  answer: string;
  iterations: number;
  steps: StepData[];
  conversationId: string;
  error: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      query,
      maxIterations: 5,
      userId: TEST_USER_ID,
    };
    if (model) body.model = model;

    const response = await fetch(`${BASE_URL}/api/agent/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const is403 = response.status === 403 && (text.includes("quota") || text.includes("exhaust") || text.includes("limit"));
      if (is403) {
        return { answer: "", iterations: 0, steps: [], conversationId: "", error: `TOKEN_EXHAUSTED: HTTP ${response.status}: ${text.substring(0, 200)}` };
      }
      const is404Model = response.status === 404 || text.includes("does not exist") || text.includes("do not have access");
      if (is404Model) {
        return { answer: "", iterations: 0, steps: [], conversationId: "", error: `MODEL_NOT_EXIST: HTTP ${response.status}: ${text.substring(0, 200)}` };
      }
      return { answer: "", iterations: 0, steps: [], conversationId: "", error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
    }

    if (!response.body) {
      return { answer: "", iterations: 0, steps: [], conversationId: "", error: "No response body" };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const steps: StepData[] = [];
    let answer = "";
    let iterations = 0;
    let conversationId = "";
    let errorMsg: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.substring(7).trim();
        } else if (line.startsWith("data: ")) {
          const dataStr = line.substring(6);
          try {
            const data = JSON.parse(dataStr);
            if (currentEvent === "step") {
              steps.push(data as StepData);
            } else if (currentEvent === "done") {
              answer = data.answer || "";
              iterations = data.iterations || 0;
              conversationId = data.conversationId || "";
            } else if (currentEvent === "error") {
              errorMsg = data.message || "Unknown error";
            }
          } catch {
            // ignore
          }
          currentEvent = "";
        }
      }
    }

    return { answer, iterations, steps, conversationId, error: errorMsg };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { answer: "", iterations: 0, steps: [], conversationId: "", error: `请求超时 (${TIMEOUT_MS / 1000}s)` };
    }
    return { answer: "", iterations: 0, steps: [], conversationId: "", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

function extractRoundDetails(steps: StepData[]): RoundDetail[] {
  const rounds: Map<number, RoundDetail> = new Map();
  for (const step of steps) {
    if (step.round === 0) continue;
    if (!rounds.has(step.round)) {
      rounds.set(step.round, { round: step.round, llmMs: null, toolName: null, toolMs: null, roundMs: null });
    }
    const rd = rounds.get(step.round)!;
    if (step.detail) {
      if (step.detail.llmMs != null) rd.llmMs = step.detail.llmMs as number;
      if (step.detail.toolMs != null) rd.toolMs = step.detail.toolMs as number;
      if (step.detail.roundMs != null) rd.roundMs = step.detail.roundMs as number;
      if (step.detail.toolName != null) rd.toolName = step.detail.toolName as string;
    }
  }
  return Array.from(rounds.values());
}

function estimateTokens(steps: StepData[]): number {
  let total = 0;
  for (const step of steps) {
    total += (step.content?.length || 0) * 1.5;
  }
  return Math.round(total);
}

async function runSingleTest(tc: TestCase, attemptNumber: number, modelManager: ModelManager): Promise<AttemptResult> {
  const model = modelManager.getCurrentModel();
  console.log(`\n  [尝试 #${attemptNumber}] 模型: [${model}] 执行中...`);

  const testStartTime = Date.now();
  const result = await callAgentStream(tc.query, model);
  const totalMs = Date.now() - testStartTime;

  const isExhausted = isTokenExhausted(result.error, result.answer);
  const isNotExist = isModelNotExist(result.error);
  if (isExhausted || isNotExist) {
    if (isExhausted) {
      modelManager.markExhausted(model, result.error || "Token耗尽");
    } else {
      modelManager.markExhausted(model, result.error || "模型不存在");
    }
    return {
      attemptNumber,
      model,
      passed: false,
      answer: result.answer,
      iterations: result.iterations,
      totalMs,
      toolCalled: false,
      keywordMatches: tc.expectedKeywords.map((kw) => ({ keyword: kw, found: false })),
      roundDetails: extractRoundDetails(result.steps),
      error: isExhausted ? `TOKEN耗尽: ${result.error}` : `模型不存在: ${result.error}`,
      fixLog: isExhausted ? `模型[${model}]Token耗尽，切换到下一个模型` : `模型[${model}]不存在(404)，切换到下一个模型`,
      isModelExhausted: true,
    };
  }

  modelManager.recordUsage(model, estimateTokens(result.steps));

  if (result.error) {
    console.log(`  [尝试 #${attemptNumber}] ❌ 请求异常: ${result.error}`);
    return {
      attemptNumber,
      model,
      passed: false,
      answer: "",
      iterations: result.iterations,
      totalMs,
      toolCalled: false,
      keywordMatches: tc.expectedKeywords.map((kw) => ({ keyword: kw, found: false })),
      roundDetails: extractRoundDetails(result.steps),
      error: result.error,
      fixLog: null,
      isModelExhausted: false,
    };
  }

  const toolCalled = result.steps.some(
    (s) => s.type === "tool_call" && s.detail?.toolName === tc.targetTool
  ) || result.steps.some(
    (s) => s.type === "tool_result" && s.detail?.toolName === tc.targetTool
  ) || result.steps.some(
    (s) => s.type === "retrieval" && tc.targetTool === "hybridSearch"
  );

  const keywordMatches = tc.expectedKeywords.map((kw) => ({
    keyword: kw,
    found: result.answer.includes(kw),
  }));

  const allKeywordsFound = keywordMatches.every((km) => km.found);
  const passed = toolCalled && allKeywordsFound;
  const roundDetails = extractRoundDetails(result.steps);

  console.log(`  [尝试 #${attemptNumber}] ${passed ? "✅ 通过" : "❌ 失败"} | 模型: [${model}] | 耗时: ${(totalMs / 1000).toFixed(1)}s | 迭代: ${result.iterations}轮 | 工具: ${toolCalled ? "✓" : "✗"} | 关键词: ${keywordMatches.map((km) => km.found ? "✓" : "✗").join("")}`);

  if (!passed) {
    console.log(`  [尝试 #${attemptNumber}] 答案前150字: ${result.answer.substring(0, 150)}`);
  }

  return {
    attemptNumber,
    model,
    passed,
    answer: result.answer,
    iterations: result.iterations,
    totalMs,
    toolCalled,
    keywordMatches,
    roundDetails,
    error: null,
    fixLog: null,
    isModelExhausted: false,
  };
}

function buildFailReason(attempt: AttemptResult, tc: TestCase): string {
  const reasons: string[] = [];
  if (attempt.isModelExhausted) {
    reasons.push(`模型[${attempt.model}]Token耗尽`);
  }
  if (attempt.error && !attempt.isModelExhausted) {
    reasons.push(`请求异常: ${attempt.error}`);
  }
  if (!attempt.toolCalled) {
    reasons.push(`目标工具${tc.targetTool}未被调用`);
  }
  const missingKw = attempt.keywordMatches.filter((km) => !km.found).map((km) => km.keyword);
  if (missingKw.length > 0) {
    reasons.push(`答案缺少关键词: ${missingKw.join(", ")}`);
  }
  if (attempt.answer.includes("超时")) reasons.push("Agent执行超时");
  if (attempt.answer.includes("出错")) reasons.push("Agent执行出错");
  if (attempt.answer.includes("超过最大迭代")) reasons.push("超过最大迭代次数");
  return reasons.length > 0 ? reasons.join("; ") : "未知原因";
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║          AI Agent Platform - 21 工具测试套件 v3                  ║");
  console.log("║          支持模型自动切换 (Token耗尽时切换)                       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`开始时间: ${new Date().toISOString()}`);
  console.log(`目标服务: ${BASE_URL}`);
  console.log(`测试用例数: ${testCases.length}`);
  console.log("");

  const healthCheck = await fetch(`${BASE_URL}`).catch(() => null);
  if (!healthCheck || !healthCheck.ok) {
    console.error(`❌ 无法连接到 ${BASE_URL}，请确保 dev server 正在运行`);
    process.exit(1);
  }
  console.log(`✅ 服务连接正常\n`);

  const modelIds = await fetchModels();
  const modelManager = new ModelManager(modelIds);
  console.log(`可用模型 (${modelIds.length}个): ${modelIds.join(", ")}`);
  console.log(`当前模型: [${modelManager.getCurrentModel()}]\n`);

  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];

    if (!modelManager.hasAvailableModel()) {
      console.error(`\n❌ 所有模型Token均已耗尽，测试终止！`);
      console.log(modelManager.getUsageReport());
      break;
    }

    console.log(`\n${"=".repeat(80)}`);
    console.log(`[测试 #${tc.id}] ${tc.description}`);
    console.log(`[测试 #${tc.id}] Query: ${tc.query}`);
    console.log(`[测试 #${tc.id}] 目标工具: ${tc.targetTool}`);
    console.log(`[测试 #${tc.id}] 当前模型: [${modelManager.getCurrentModel()}]`);
    console.log(`${"=".repeat(80)}`);

    const attempts: AttemptResult[] = [];
    let attemptNumber = 0;
    let finalPassed = false;

    while (attemptNumber < 5 && !finalPassed && modelManager.hasAvailableModel()) {
      attemptNumber++;
      const attemptResult = await runSingleTest(tc, attemptNumber, modelManager);
      attempts.push(attemptResult);

      if (attemptResult.passed) {
        finalPassed = true;
      } else {
        const failReason = buildFailReason(attemptResult, tc);
        console.log(`  [尝试 #${attemptNumber}] 失败原因: ${failReason}`);

        if (attemptResult.isModelExhausted) {
          attemptResult.fixLog = failReason;
          if (!modelManager.hasAvailableModel()) {
            console.log(`  ❌ 无可用模型，停止重试`);
            break;
          }
          console.log(`  切换模型后重试...`);
          continue;
        }

        if (attemptNumber < 5) {
          attemptResult.fixLog = failReason;
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }

    results.push({
      id: tc.id,
      query: tc.query,
      targetTool: tc.targetTool,
      description: tc.description,
      totalAttempts: attemptNumber,
      finalPassed,
      attempts,
    });

    if (i < testCases.length - 1) {
      console.log(`\n等待 ${DELAY_BETWEEN_TESTS / 1000}s 后继续下一个测试...`);
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_TESTS));
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(modelManager.getUsageReport());
  console.log(`${"=".repeat(60)}`);

  const outputDir = path.join(__dirname, "test-results");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const resultFile = path.join(outputDir, `tool-test-${timestamp}.json`);
  fs.writeFileSync(resultFile, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n测试结果已保存: ${resultFile}`);

  const summaryFile = path.join(outputDir, `tool-test-summary-${timestamp}.md`);
  const passed = results.filter((r) => r.finalPassed).length;
  const failed = results.filter((r) => !r.finalPassed).length;
  const totalTestTime = results.reduce((sum, r) => sum + r.attempts.reduce((s, a) => s + a.totalMs, 0), 0);

  let summary = `# AI Agent Platform - 21 工具测试报告\n\n`;
  summary += `- 测试时间: ${new Date().toISOString()}\n`;
  summary += `- 目标服务: ${BASE_URL}\n`;
  summary += `- 总用例数: ${results.length}\n`;
  summary += `- 通过: ${passed}\n`;
  summary += `- 失败: ${failed}\n`;
  summary += `- 通过率: ${((passed / results.length) * 100).toFixed(1)}%\n`;
  summary += `- 总测试耗时: ${(totalTestTime / 1000).toFixed(1)}s\n`;
  summary += `- Token耗尽模型: ${modelManager.getExhaustedModels().join(", ") || "无"}\n\n`;

  summary += `## 模型使用统计\n\n`;
  summary += modelManager.getUsageReport() + "\n";

  summary += `## 测试结果总览\n\n`;
  summary += `| # | 目标工具 | 状态 | 尝试次数 | 成功模型 | 成功耗时 | 迭代轮数 |\n`;
  summary += `|---|---------|------|---------|---------|---------|---------|\n`;
  for (const r of results) {
    const status = r.finalPassed ? "✅" : "❌";
    const successAttempt = r.attempts.find((a) => a.passed);
    const successModel = successAttempt ? successAttempt.model : "-";
    const successTime = successAttempt ? (successAttempt.totalMs / 1000).toFixed(1) + "s" : "-";
    const successIter = successAttempt ? successAttempt.iterations : "-";
    summary += `| ${r.id} | ${r.targetTool} | ${status} | ${r.totalAttempts} | ${successModel} | ${successTime} | ${successIter} |\n`;
  }

  summary += `\n## 每轮耗时详情\n\n`;
  for (const r of results) {
    const successAttempt = r.attempts.find((a) => a.passed) || r.attempts[r.attempts.length - 1];
    summary += `### #${r.id} ${r.targetTool} ${r.finalPassed ? "✅" : "❌"}\n\n`;
    summary += `- Query: ${r.query}\n`;
    summary += `- 尝试次数: ${r.totalAttempts}\n`;
    summary += `- 使用模型: ${successAttempt.model}\n`;
    summary += `- 总耗时: ${(successAttempt.totalMs / 1000).toFixed(2)}s\n\n`;

    if (successAttempt.roundDetails.length > 0) {
      summary += `| 轮次 | LLM耗时 | 工具 | 工具耗时 | 本轮耗时 |\n`;
      summary += `|------|---------|------|---------|---------|\n`;
      for (const rd of successAttempt.roundDetails) {
        const llm = rd.llmMs ? (rd.llmMs / 1000).toFixed(2) + "s" : "-";
        const tool = rd.toolName || "-";
        const toolTime = rd.toolMs ? (rd.toolMs / 1000).toFixed(2) + "s" : "-";
        const roundTime = rd.roundMs ? (rd.roundMs / 1000).toFixed(2) + "s" : "-";
        summary += `| ${rd.round} | ${llm} | ${tool} | ${toolTime} | ${roundTime} |\n`;
      }
      summary += `\n`;
    }
  }

  summary += `\n## 失败用例详情及修复日志\n\n`;
  const retryOrFailed = results.filter((r) => r.totalAttempts > 1 || !r.finalPassed);
  if (retryOrFailed.length === 0) {
    summary += `所有用例一次通过 🎉\n`;
  } else {
    for (const r of retryOrFailed) {
      summary += `### #${r.id} - ${r.targetTool} ${r.finalPassed ? "✅(重试后通过)" : "❌"}\n\n`;
      summary += `- Query: ${r.query}\n`;
      summary += `- 总尝试次数: ${r.totalAttempts}\n\n`;

      for (const attempt of r.attempts) {
        summary += `#### 尝试 #${attempt.attemptNumber} ${attempt.passed ? "✅ 成功" : "❌ 失败"}\n\n`;
        summary += `- 模型: ${attempt.model}\n`;
        summary += `- 耗时: ${(attempt.totalMs / 1000).toFixed(2)}s\n`;
        summary += `- 迭代轮数: ${attempt.iterations}\n`;
        summary += `- 工具调用: ${attempt.toolCalled ? "✓" : "✗"}\n`;
        summary += `- 关键词匹配: ${attempt.keywordMatches.map((km) => `${km.keyword}=${km.found ? "✓" : "✗"}`).join(", ")}\n`;
        if (attempt.isModelExhausted) {
          summary += `- **⚠️ 模型Token耗尽**\n`;
        }
        if (attempt.error) {
          summary += `- 错误: ${attempt.error}\n`;
        }
        if (!attempt.passed && attempt.fixLog) {
          summary += `- **修复日志**: ${attempt.fixLog}\n`;
        }
        if (attempt.answer) {
          summary += `- 答案: ${attempt.answer.substring(0, 300)}\n`;
        }
        summary += `\n`;
      }
    }
  }

  fs.writeFileSync(summaryFile, summary, "utf-8");
  console.log(`测试报告已保存: ${summaryFile}`);

  console.log(`\n${"=".repeat(80)}`);
  console.log(`测试完成! 通过: ${passed}/${results.length}, 失败: ${failed}/${results.length}`);
  console.log(`总耗时: ${(totalTestTime / 1000).toFixed(1)}s`);
  console.log(`Token耗尽模型: ${modelManager.getExhaustedModels().join(", ") || "无"}`);
  console.log(`${"=".repeat(80)}`);
}

main().catch((err) => {
  console.error("测试脚本执行失败:", err);
  process.exit(1);
});
