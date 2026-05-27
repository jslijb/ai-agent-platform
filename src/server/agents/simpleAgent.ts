import { callBailian, type BailianMessage } from "@/server/llm/providers/bailian";
import { saveAgentLog, saveLLMUsage } from "./agent-logger";
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

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

const AGENT_TIMEOUT_MS = 120000;

export interface AgentStep {
  type: "thinking" | "tool_call" | "tool_result" | "reflection" | "retrieval" | "answer";
  round: number;
  title: string;
  content: string;
  detail?: Record<string, unknown>;
  timestamp: number;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  execute: (params: Record<string, unknown>) => Promise<string> | string;
}

const tools: ToolDefinition[] = [
  {
    name: "calculateMA",
    description: "计算移动平均线（MA）。输入价格序列和周期，返回MA值。返回结果包含最近30个有效值和最新MA值。",
    parameters: {
      data: { type: "number[]", description: "价格序列，如收盘价数组", required: true },
      period: { type: "number", description: "移动平均周期，如5、10、20", required: true },
    },
    execute: (params) => {
      const result = calculateMA(params.data as number[], params.period as number);
      const validValues = result.values.filter((v) => v !== null) as number[];
      const latestMA = validValues.length > 0 ? validValues[validValues.length - 1] : null;
      const recentValues = validValues.slice(-30);
      return JSON.stringify({
        period: result.period,
        latestMA,
        totalPoints: result.values.length,
        validPoints: validValues.length,
        recentValues,
      });
    },
  },
  {
    name: "calculateMACD",
    description: "计算MACD指标。输入价格序列，返回DIF、DEA、MACD柱状图的最近30个有效值。",
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
      const validDif = result.dif.filter((v) => v !== null) as number[];
      const validDea = result.dea.filter((v) => v !== null) as number[];
      const validMacd = result.macd.filter((v) => v !== null) as number[];
      return JSON.stringify({
        fast: result.fast,
        slow: result.slow,
        signal: result.signal,
        latestDif: validDif.length > 0 ? validDif[validDif.length - 1] : null,
        latestDea: validDea.length > 0 ? validDea[validDea.length - 1] : null,
        latestMacd: validMacd.length > 0 ? validMacd[validMacd.length - 1] : null,
        recentDif: validDif.slice(-30),
        recentDea: validDea.slice(-30),
        recentMacd: validMacd.slice(-30),
      });
    },
  },
  {
    name: "calculateRSI",
    description: "计算RSI指标（相对强弱指数）。返回最近30个有效值和最新RSI值。",
    parameters: {
      data: { type: "number[]", description: "价格序列", required: true },
      period: { type: "number", description: "RSI周期，默认14" },
    },
    execute: (params) => {
      const result = calculateRSI(params.data as number[], params.period as number | undefined);
      const validValues = result.values.filter((v) => v !== null) as number[];
      const latestRSI = validValues.length > 0 ? validValues[validValues.length - 1] : null;
      const recentValues = validValues.slice(-30);
      return JSON.stringify({
        period: result.period,
        latestRSI,
        totalPoints: result.values.length,
        validPoints: validValues.length,
        recentValues,
      });
    },
  },
  {
    name: "calculateBollinger",
    description: "计算布林带指标。返回最近30个有效值和最新上轨/中轨/下轨。",
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
      const validUpper = result.upper.filter((v) => v !== null) as number[];
      const validMiddle = result.middle.filter((v) => v !== null) as number[];
      const validLower = result.lower.filter((v) => v !== null) as number[];
      return JSON.stringify({
        period: result.period,
        stdDev: result.stdDev,
        latestUpper: validUpper.length > 0 ? validUpper[validUpper.length - 1] : null,
        latestMiddle: validMiddle.length > 0 ? validMiddle[validMiddle.length - 1] : null,
        latestLower: validLower.length > 0 ? validLower[validLower.length - 1] : null,
        recentUpper: validUpper.slice(-30),
        recentMiddle: validMiddle.slice(-30),
        recentLower: validLower.slice(-30),
      });
    },
  },
  {
    name: "calculateKDJ",
    description: "计算KDJ指标。返回最近30个有效值和最新K/D/J值。",
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
      const validK = result.k.filter((v) => v !== null) as number[];
      const validD = result.d.filter((v) => v !== null) as number[];
      const validJ = result.j.filter((v) => v !== null) as number[];
      return JSON.stringify({
        period: result.period,
        latestK: validK.length > 0 ? validK[validK.length - 1] : null,
        latestD: validD.length > 0 ? validD[validD.length - 1] : null,
        latestJ: validJ.length > 0 ? validJ[validJ.length - 1] : null,
        recentK: validK.slice(-30),
        recentD: validD.slice(-30),
        recentJ: validJ.slice(-30),
      });
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
    name: "getStockHistory",
    description: "获取A股股票历史K线数据。返回指定时间段内的开高低收、成交量等数据。支持日K、周K、月K。这是获取股价数据的首选工具，计算技术指标前必须先调用此工具获取数据。不指定日期时默认获取最近1年数据。",
    parameters: {
      code: { type: "string", description: "股票代码，如 sh.600036（招商银行）、sz.000858（五粮液），baostock格式需带sh./sz.前缀", required: true },
      start_date: { type: "string", description: "开始日期，格式 YYYY-MM-DD。不指定则默认为1年前" },
      end_date: { type: "string", description: "结束日期，格式 YYYY-MM-DD。不指定则默认为今天" },
      frequency: { type: "string", description: "K线频率: d=日K, w=周K, m=月K，默认d" },
      source: { type: "string", description: "数据源: baostock(默认), efinance, mootdx, tushare" },
    },
    execute: async (params) => {
      try {
        const source = (params.source as string) || "baostock";
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const defaultStart = oneYearAgo.toISOString().split("T")[0];
        const defaultEnd = now.toISOString().split("T")[0];
        const startDate = (params.start_date as string) || defaultStart;
        const endDate = (params.end_date as string) || defaultEnd;

        console.log(`[getStockHistory] 请求: code=${params.code}, start=${startDate}, end=${endDate}`);

        const res = await fetch(`${DATA_SERVICE_URL}/api/market/history`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            code: params.code,
            start_date: startDate,
            end_date: endDate,
            frequency: (params.frequency as string) || "d",
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!data.success) return `获取历史行情失败: ${data.error || "未知错误"}`;
        const rows = data.data || [];
        if (rows.length === 0) return "未查询到数据，请检查股票代码和日期范围";
        const fromCache = data.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
        const summary = rows.slice(-5).map((r: Record<string, unknown>) =>
          `${r.date || r.tradeDate}: 开${r.open} 高${r.high} 低${r.low} 收${r.close} 量${r.volume}`
        ).join("\n");
        const closes = rows.map((r: Record<string, unknown>) => Number(r.close));
        const highs = rows.map((r: Record<string, unknown>) => Number(r.high));
        const lows = rows.map((r: Record<string, unknown>) => Number(r.low));
        const volumes = rows.map((r: Record<string, unknown>) => Number(r.volume));
        return `共${rows.length}条记录${fromCache}，最近5条:\n${summary}\n\n收盘价序列(用于MA/RSI/MACD/布林带等计算): [${closes.join(", ")}]\n最高价序列(用于KDJ等计算): [${highs.join(", ")}]\n最低价序列(用于KDJ等计算): [${lows.join(", ")}]\n成交量序列(用于VWAP等计算): [${volumes.join(", ")}]`;
      } catch (error) {
        return `获取历史行情异常: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
  {
    name: "getStockRealtime",
    description: "获取A股股票实时行情快照。返回当前最新价、涨跌幅、成交量等实时数据。",
    parameters: {
      code: { type: "string", description: "股票代码，如 600036（不需要sh./sz.前缀）", required: true },
      source: { type: "string", description: "数据源: efinance(默认), mootdx" },
    },
    execute: async (params) => {
      try {
        const source = (params.source as string) || "efinance";
        const res = await fetch(`${DATA_SERVICE_URL}/api/market/realtime`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, code: params.code }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        if (!data.success) return `获取实时行情失败: ${data.error || "未知错误"}`;
        const records = data.data;
        if (!records || !Array.isArray(records) || records.length === 0) return "未查询到实时数据";
        const r = records[0];
        return `实时行情: ${r.股票名称} 最新价${r.最新价} 涨跌幅${r.涨跌幅}% 开盘价${r.开盘价} 最高价${r.最高价} 最低价${r.最低价} 成交量${r.成交量} 成交额${r.成交额} 换手率${r.换手率}`;
      } catch (error) {
        return `获取实时行情异常: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
  {
    name: "getStockFinancial",
    description: "获取A股股票财务数据（盈利能力指标）。返回营收、净利润、ROE、毛利率、净利率等关键财务指标。当用户询问营收、利润、ROE等财务指标时，必须调用此工具。不指定year/quarter时自动获取最新可用财报数据。优先使用efinance数据源（数据更全面），baostock需要指定year和quarter。",
    parameters: {
      code: { type: "string", description: "股票代码。efinance格式: 600519（无前缀）；baostock格式: sh.600519（带sh./sz.前缀）", required: true },
      source: { type: "string", description: "数据源: efinance(推荐，默认), baostock。efinance返回更全面的财务指标且无需指定year/quarter" },
      year: { type: "number", description: "年份，如 2024（仅baostock需要，efinance无需指定）" },
      quarter: { type: "number", description: "季度 1-4（仅baostock需要，efinance无需指定）" },
    },
    execute: async (params) => {
      try {
        const source = (params.source as string) || "efinance";
        const body: Record<string, unknown> = { source, code: params.code };
        if (source === "baostock" && params.year) body.year = params.year;
        if (source === "baostock" && params.quarter) body.quarter = params.quarter;
        const res = await fetch(`${DATA_SERVICE_URL}/api/market/financial`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!data.success) return `获取财务数据失败: ${data.error || "未知错误"}`;
        const rows = data.data || [];
        if (rows.length === 0) return "未查询到财务数据";
        const fromCache = data.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
        return `财务数据${fromCache}:\n${JSON.stringify(rows, null, 2)}`;
      } catch (error) {
        return `获取财务数据异常: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  },
  {
    name: "getFinancialReport",
    description: "获取A股股票详细财务报表。返回利润表、资产负债表或现金流量表的详细数据。当需要查看具体的财务报表项目（如营业收入明细、资产构成、现金流详情等）时使用此工具。",
    parameters: {
      code: { type: "string", description: "股票代码，如 600519（不需要sh./sz.前缀）", required: true },
      report_type: { type: "string", description: "报表类型: income=利润表(默认), balance=资产负债表, cashflow=现金流量表" },
    },
    execute: async (params) => {
      try {
        const res = await fetch(`${DATA_SERVICE_URL}/api/market/financial_report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: params.code,
            report_type: (params.report_type as string) || "income",
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!data.success) return `获取财务报表失败: ${data.error || "未知错误"}`;
        const rows = data.data || [];
        if (rows.length === 0) return "未查询到财务报表数据";
        const fromCache = data.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
        const reportNames: Record<string, string> = { income: "利润表", balance: "资产负债表", cashflow: "现金流量表" };
        const reportName = reportNames[(params.report_type as string) || "income"] || "利润表";
        return `${reportName}${fromCache}（最近${rows.length}期）:\n${JSON.stringify(rows, null, 2)}`;
      } catch (error) {
        return `获取财务报表异常: ${error instanceof Error ? error.message : String(error)}`;
      }
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
        console.log(`[simpleAgent] 解析工具调用成功(格式1): tool=${parsed.tool}`);
        return { name: parsed.tool, params: parsed.parameters };
      }
      if (parsed.name || parsed.function?.name) {
        const toolName = parsed.name || parsed.function?.name;
        const toolArgs = parsed.arguments || parsed.function?.arguments || parsed.parameters || {};
        if (typeof toolArgs === "string") {
          try { return { name: toolName, params: JSON.parse(toolArgs) }; } catch { /* ignore */ }
        }
        console.log(`[simpleAgent] 解析工具调用成功(格式1-alt): tool=${toolName}`);
        return { name: toolName, params: toolArgs };
      }
    }

    const actionMatch = text.match(/Action:\s*(\w+)\s*\n\s*Action Input:\s*([\s\S]*?)(?=\n\n|Observation|$)/i);
    if (actionMatch) {
      const name = actionMatch[1].trim();
      const params = JSON.parse(actionMatch[2].trim());
      console.log(`[simpleAgent] 解析工具调用成功(格式2): tool=${name}`);
      return { name, params };
    }

    const funcCallMatch = text.match(/(?:调用|使用|执行)\s*(?:工具|函数)?\s*[:：]?\s*(\w+)\s*[\(（]([\s\S]*?)[\)）]/);
    if (funcCallMatch) {
      try {
        const name = funcCallMatch[1].trim();
        const argsStr = funcCallMatch[2].trim();
        if (tools.some(t => t.name === name)) {
          const params = JSON.parse(argsStr);
          console.log(`[simpleAgent] 解析工具调用成功(格式3): tool=${name}`);
          return { name, params };
        }
      } catch { /* ignore */ }
    }

    const inlineJsonMatch = text.match(/\{\s*"tool"\s*:\s*"(\w+)"\s*,\s*"parameters"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (inlineJsonMatch) {
      const name = inlineJsonMatch[1];
      const params = JSON.parse(inlineJsonMatch[2]);
      if (tools.some(t => t.name === name)) {
        console.log(`[simpleAgent] 解析工具调用成功(格式4-inline): tool=${name}`);
        return { name, params };
      }
    }

    console.log("[simpleAgent] 未检测到工具调用格式");
  } catch (e) {
    console.error("[simpleAgent] 解析工具调用异常:", e);
  }
  return null;
}

export interface AgentResult {
  answer: string;
  iterations: number;
  conversationId: string;
  steps: AgentStep[];
}

export async function runAgent(query: string, maxIterations: number = 5, conversationId?: string, userId: string = "default-user", model?: string): Promise<AgentResult> {
  console.log(`[simpleAgent] 收到查询: ${query}, 最大迭代次数: ${maxIterations}, userId: ${userId}, model: ${model || "默认"}`);
  const startTime = Date.now();
  const steps: AgentStep[] = [];

  let convId = conversationId;
  if (!convId) {
    convId = await createConversation(userId);
  }

  const historyMessages = await getRecentMessages(convId);
  await addMessage(convId, "user", query);

  steps.push({
    type: "thinking",
    round: 0,
    title: "接收用户查询",
    content: query,
    timestamp: Date.now(),
  });

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const systemPrompt = `你是一个金融分析AI助手，可以使用以下工具来回答用户的问题：

当前日期: ${todayStr}

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

【核心规则 - 必须严格遵守】：

1. 【严禁编造数据】所有具体的股价、财务数字（营收、利润、ROE等）、技术指标数值必须来自工具调用结果，绝不能凭空编造！如果工具未返回数据，必须明确告知用户"未获取到数据"，不能猜测或编造数字。

2. 【必须调用工具的场景】以下场景必须先调用对应工具获取数据，不能直接回答：
   - 用户询问营收、利润、ROE、毛利率等财务指标 → 必须调用 getStockFinancial（优先efinance数据源，code格式如600519）
   - 用户询问具体股价、涨跌幅 → 必须调用 getStockRealtime
   - 用户要求计算技术指标（MA、RSI、MACD等）→ 必须先调用 getStockHistory 获取股价数据
   - 用户询问详细财务报表项目 → 调用 getFinancialReport
   - 用户询问公司财报、行业分析等文档内容 → 使用 hybridSearch

3. 【工具选择优先级】当用户询问财务数据时：
   - 首选 getStockFinancial（efinance数据源，无需指定year/quarter，自动获取最新）
   - 如果需要更详细的报表数据，使用 getFinancialReport
   - 不要使用 hybridSearch 来查找财务数字（hybridSearch是检索文档的，不是获取实时财务数据的）

4. 【股票代码格式】：
   - efinance/getStockFinancial/getFinancialReport/getStockRealtime: 不需要前缀，如 600519、000858
   - baostock/getStockHistory: 需要 sh./sz. 前缀，如 sh.600519、sz.000858

5. 【数据来源说明】所有数据工具调用的是真实的金融数据接口（baostock/efinance），返回的是实时或历史真实数据，数据会自动缓存到本地。

6. 如果工具调用失败或返回空数据，应如实告知用户，不要用编造的数据来回答。可以尝试换一个数据源重新获取。

7. 【技术指标计算流程】当用户要求计算技术指标时，严格按以下步骤操作：
   步骤1: 调用 getStockHistory 获取股价数据（只需提供code，日期会自动填充为最近1年）
   步骤2: 从 getStockHistory 返回的"收盘价序列"中提取数组，调用 calculateMA/calculateRSI 等计算工具
   步骤3: 用计算结果回答用户问题
   注意：计算工具的 data 参数需要传入数字数组，如 [46.2, 46.5, 47.1]，不要传入字符串或对象
   注意：getStockHistory 不指定日期时会自动获取最近1年数据，足够计算任何技术指标，无需手动指定日期

8. 【重要】每次只调用一个工具。获得工具结果后，如果还需要调用其他工具，在下一轮再调用。不要在一次回复中尝试调用多个工具。`;

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
  let toolObservations: string[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let currentModel = model || process.env.BAILIAN_MODEL || "unknown";

  for (let i = 0; i < maxIterations; i++) {
    if (Date.now() - startTime > AGENT_TIMEOUT_MS) {
      console.error(`[simpleAgent] Agent 执行超过 ${AGENT_TIMEOUT_MS}ms，强制终止`);
      steps.push({
        type: "answer",
        round: i + 1,
        title: "执行超时",
        content: "Agent 执行超时，请稍后重试或简化您的问题。",
        timestamp: Date.now(),
      });
      await addMessage(convId, "assistant", "Agent 执行超时，请稍后重试或简化您的问题。");
      saveAgentLog({
        userId,
        conversationId: convId,
        query,
        answer: "Agent 执行超时，请稍后重试或简化您的问题。",
        model: currentModel,
        iterations,
        steps,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        latencyMs: Date.now() - startTime,
        status: "timeout",
      }).catch((e) => console.error("[simpleAgent] 保存超时日志失败:", e));
      return { answer: "Agent 执行超时，请稍后重试或简化您的问题。", iterations, conversationId: convId, steps };
    }
    iterations++;
    console.log(`[simpleAgent] 第 ${i + 1}/${maxIterations} 轮迭代`);

    steps.push({
      type: "thinking",
      round: i + 1,
      title: `第 ${i + 1} 轮 — LLM 推理`,
      content: `正在调用大模型进行推理...`,
      timestamp: Date.now(),
    });

    try {
      const response = await callBailian(messages, model);
      const assistantContent = response.content;

      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
      }

      console.log(`[simpleAgent] LLM 响应: ${assistantContent.substring(0, 200)}...`);

      messages.push({ role: "assistant", content: assistantContent });

      const toolCall = parseToolCall(assistantContent);
      const reasoningText = assistantContent.replace(/```json[\s\S]*?```/g, "").trim();
      const reasoning = reasoningText.substring(0, 500);

      if (!toolCall) {
        console.log("[simpleAgent] 无工具调用，进入反思评估阶段");

        steps.push({
          type: "reflection",
          round: i + 1,
          title: `第 ${i + 1} 轮 — 反思评估`,
          content: "LLM 未调用工具，评估答案是否充分...",
          detail: { answerPreview: assistantContent.substring(0, 300) },
          timestamp: Date.now(),
        });

        const reflection = await shouldRetrieveAgain(query, assistantContent, lastSearchResults, toolObservations);

        if (reflection.needMore && reflection.refinedQuery && i < maxIterations - 1) {
          console.log(
            `[simpleAgent] 反思结果: 需要更多信息, 建议: "${reflection.refinedQuery}"`
          );

          const isToolSuggestion = reflection.refinedQuery.includes("getStockFinancial") ||
            reflection.refinedQuery.includes("getStockHistory") ||
            reflection.refinedQuery.includes("getFinancialReport") ||
            reflection.refinedQuery.includes("getStockRealtime");

          steps.push({
            type: "reflection",
            round: i + 1,
            title: `第 ${i + 1} 轮 — 反思决定：${isToolSuggestion ? "需要调用数据工具" : "继续检索"}`,
            content: `当前答案不够充分，${isToolSuggestion ? "答案中的数据可能来自LLM编造，需要调用数据工具获取真实数据" : "需要更多信息"}`,
            detail: {
              needMore: true,
              refinedQuery: reflection.refinedQuery,
              reason: isToolSuggestion ? "检测到答案中的数字没有工具调用支撑，需要调用数据获取工具" : "答案中缺少关键信息，需要改写查询再次检索",
            },
            timestamp: Date.now(),
          });

          if (isToolSuggestion) {
            steps.push({
              type: "tool_call",
              round: i + 1,
              title: `第 ${i + 1} 轮 — 反思触发数据工具调用`,
              content: `建议: ${reflection.refinedQuery}`,
              timestamp: Date.now(),
            });

            messages.push({
              role: "user",
              content: `【重要提示】你之前的回答中包含了没有工具调用支撑的具体数字，这些数据可能是编造的。反思评估建议：${reflection.refinedQuery}\n\n请严格按照建议调用对应的工具获取真实数据，然后用工具返回的真实数据重新回答用户的问题。绝不能再使用没有工具支撑的数字！`,
            });
          } else {
            steps.push({
              type: "retrieval",
              round: i + 1,
              title: `第 ${i + 1} 轮 — 反思触发补充检索`,
              content: `改写查询: "${reflection.refinedQuery}"`,
              timestamp: Date.now(),
            });

            const ragResult = await hybridSearch(reflection.refinedQuery, 10);
            const formattedResult = ragResult
              .map((r, idx) => `[${idx + 1}] (分数: ${r.score.toFixed(4)}) ${r.text}`)
              .join("\n\n");

            lastSearchResults.push(formattedResult);

            steps.push({
              type: "retrieval",
              round: i + 1,
              title: `第 ${i + 1} 轮 — 补充检索结果`,
              content: `检索到 ${ragResult.length} 条结果`,
              detail: {
                query: reflection.refinedQuery,
                resultCount: ragResult.length,
                results: ragResult.map((r, idx) => ({
                  index: idx + 1,
                  score: r.score,
                  text: r.text.substring(0, 200),
                  documentId: r.documentId,
                })),
              },
              timestamp: Date.now(),
            });

            messages.push({
              role: "user",
              content: `反思检索结果（查询: "${reflection.refinedQuery}"）:\n${formattedResult}\n\n请基于以上所有信息，重新回答用户的问题。如果信息仍然不足，请直接给出你目前最好的回答。`,
            });
          }

          continue;
        }

        steps.push({
          type: "reflection",
          round: i + 1,
          title: `第 ${i + 1} 轮 — 反思决定：答案充分`,
          content: "答案已充分回答用户问题，结束迭代",
          detail: { needMore: false },
          timestamp: Date.now(),
        });

        console.log("[simpleAgent] 反思通过，返回最终答案");

        steps.push({
          type: "answer",
          round: i + 1,
          title: "最终答案",
          content: assistantContent,
          timestamp: Date.now(),
        });

        await addMessage(convId, "assistant", assistantContent);

        const latencyMs = Date.now() - startTime;
        saveAgentLog({
          userId,
          conversationId: convId,
          query,
          answer: assistantContent,
          model: currentModel,
          iterations: i + 1,
          steps,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          totalTokens: totalPromptTokens + totalCompletionTokens,
          latencyMs,
          status: "success",
        }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

        return { answer: assistantContent, iterations, conversationId: convId, steps };
      }

      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool) {
        const errorMsg = `未找到工具: ${toolCall.name}`;
        console.error(`[simpleAgent] ${errorMsg}`);

        steps.push({
          type: "tool_call",
          round: i + 1,
          title: `第 ${i + 1} 轮 — 工具调用失败`,
          content: errorMsg,
          detail: { toolName: toolCall.name, error: true },
          timestamp: Date.now(),
        });

        messages.push({ role: "user", content: `Observation: 错误 - ${errorMsg}` });
        continue;
      }

      console.log(`[simpleAgent] 调用工具: ${toolCall.name}, 参数: ${JSON.stringify(toolCall.params).substring(0, 100)}`);

      steps.push({
        type: "tool_call",
        round: i + 1,
        title: `第 ${i + 1} 轮 — 调用工具: ${toolCall.name}`,
        content: reasoning ? `推理: ${reasoning}\n\n参数: ${JSON.stringify(toolCall.params, null, 2)}` : `参数: ${JSON.stringify(toolCall.params, null, 2)}`,
        detail: { toolName: toolCall.name, params: toolCall.params, reasoning },
        timestamp: Date.now(),
      });

      const toolResult = await tool.execute(toolCall.params);
      console.log(`[simpleAgent] 工具结果: ${toolResult.substring(0, 200)}...`);

      toolObservations.push(`[${toolCall.name}] ${toolResult.substring(0, 500)}`);

      if (toolCall.name === "hybridSearch") {
        lastSearchResults.push(toolResult);

        steps.push({
          type: "retrieval",
          round: i + 1,
          title: `第 ${i + 1} 轮 — RAG 检索结果`,
          content: toolResult.substring(0, 500),
          detail: {
            query: toolCall.params.query as string,
            topK: toolCall.params.topK as number | undefined,
            resultPreview: toolResult.substring(0, 1000),
          },
          timestamp: Date.now(),
        });
      } else {
        steps.push({
          type: "tool_result",
          round: i + 1,
          title: `第 ${i + 1} 轮 — 工具结果: ${toolCall.name}`,
          content: toolResult.substring(0, 500),
          detail: { toolName: toolCall.name, resultPreview: toolResult.substring(0, 1000) },
          timestamp: Date.now(),
        });
      }

      const MAX_OBSERVATION_LENGTH = 8000;
      let observationContent = `Observation: ${toolResult}`;
      if (observationContent.length > MAX_OBSERVATION_LENGTH) {
        const priceArrayMatch = toolResult.match(/收盘价序列[\s\S]*?:\s*\[([\s\S]*?)\]/);
        const rsiArrayMatch = toolResult.match(/RSI[\s\S]*?:\s*\[([\s\S]*?)\]/);
        const maArrayMatch = toolResult.match(/MA[\s\S]*?:\s*\[([\s\S]*?)\]/);
        let truncated = toolResult.substring(0, 2000);
        if (priceArrayMatch) {
          truncated += `\n\n[完整收盘价序列]: [${priceArrayMatch[1]}]`;
        }
        if (maArrayMatch) {
          truncated += `\n[完整MA结果]: [${maArrayMatch[1]}]`;
        }
        if (rsiArrayMatch) {
          truncated += `\n[完整RSI结果]: [${rsiArrayMatch[1]}]`;
        }
        observationContent = `Observation: ${truncated}`;
        console.log(`[simpleAgent] 工具结果已截断: 原始${toolResult.length}字符 → ${truncated.length}字符`);
      }
      messages.push({ role: "user", content: observationContent });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[simpleAgent] 迭代异常: ${errorMsg}`);

      steps.push({
        type: "answer",
        round: i + 1,
        title: "执行异常",
        content: `Agent 执行出错: ${errorMsg}`,
        timestamp: Date.now(),
      });

      await addMessage(convId, "assistant", `Agent 执行出错: ${errorMsg}`);

      const latencyMs = Date.now() - startTime;
      saveAgentLog({
        userId,
        conversationId: convId,
        query,
        answer: `Agent 执行出错: ${errorMsg}`,
        model: currentModel,
        iterations: i + 1,
        steps,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        latencyMs,
        status: "error",
        errorMessage: errorMsg,
      }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

      return { answer: `Agent 执行出错: ${errorMsg}`, iterations, conversationId: convId, steps };
    }
  }

  steps.push({
    type: "answer",
    round: iterations,
    title: "超过最大迭代次数",
    content: "Agent 超过最大迭代次数，未能得出结论。",
    timestamp: Date.now(),
  });

  await addMessage(convId, "assistant", "Agent 超过最大迭代次数，未能得出结论。");
  return { answer: "Agent 超过最大迭代次数，未能得出结论。", iterations, conversationId: convId, steps };
}
