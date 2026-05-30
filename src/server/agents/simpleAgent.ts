import { callBailian, type BailianMessage } from "@/server/llm/providers/bailian";
import { callWithFallback } from "@/server/llm/router";
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
import { createConversation, addMessage, getRecentMessages, updateConversationTitle } from "@/server/agents/memory";

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

const AGENT_TIMEOUT_MS = 240000;

interface CachedStockData {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  dates: string[];
  code: string;
  dateRange: string;
  latestTradeDate: string;
  rowCount: number;
}

let lastStockData: CachedStockData | null = null;

let currentUserId: string = "default-user";

const stockDataCache = new Map<string, { data: CachedStockData; expiresAt: number }>();
const STOCK_CACHE_TTL_MS = 30 * 60 * 1000;

function getStockCache(userId: string): CachedStockData | null {
  const cached = stockDataCache.get(userId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    stockDataCache.delete(userId);
    return null;
  }
  return cached.data;
}

function setStockCache(userId: string, data: CachedStockData): void {
  stockDataCache.set(userId, { data, expiresAt: Date.now() + STOCK_CACHE_TTL_MS });
  if (stockDataCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of Array.from(stockDataCache.entries())) {
      if (now > value.expiresAt) stockDataCache.delete(key);
    }
  }
}

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
    description: "计算移动平均线（MA）。如已调用getStockHistory获取过数据，可不传data参数，自动使用缓存的收盘价序列。返回结果包含最近30个有效值和最新MA值。",
    parameters: {
      data: { type: "number[]", description: "价格序列，如收盘价数组。如已调用getStockHistory可不传，自动使用缓存数据" },
      period: { type: "number", description: "移动平均周期，如5、10、20", required: true },
    },
    execute: (params) => {
      let data = params.data as number[] | undefined;
      if (!data || !Array.isArray(data) || data.length === 0) {
        if (lastStockData && lastStockData.closes.length > 0) {
          data = lastStockData.closes;
          console.log("[calculateMA] Using cached data: " + lastStockData.code + ", " + data.length + " closes");
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const period = params.period as number;
      const result = calculateMA(data, period);
      const validValues = result.values.filter((v) => v !== null) as number[];
      const latestMA = validValues.length > 0 ? validValues[validValues.length - 1] : null;
      const recentValues = validValues.slice(-30);

      const formula = "MA" + period + " = (Sum of last " + period + " closing prices) / " + period;

      const lastNPrices = data.slice(-period);
      const lastNSum = lastNPrices.reduce((a, b) => a + b, 0);
      const lastNCalc = Number((lastNSum / period).toFixed(4));

      const recentDates = lastStockData?.dates?.slice(-period) || [];
      const priceDetail = lastNPrices.map((p, i) => {
        const dateStr = recentDates[i] || ("Day " + (data.length - period + i + 1));
        return `${dateStr}: ${p}`;
      }).join(" + ");

      const calcDetail = "Calc: (" + priceDetail + ") / " + period + " = " + lastNSum.toFixed(4) + " / " + period + " = " + lastNCalc;

      return JSON.stringify({
        period: result.period,
        latestMA,
        totalPoints: result.values.length,
        validPoints: validValues.length,
        recentValues,
        formula,
        calcDetail,
        latestTradeDate: lastStockData?.latestTradeDate || null,
      });
    },
  },
  {
    name: "calculateMACD",
    description: "计算MACD指标。如已调用getStockHistory获取过数据，可不传data参数，自动使用缓存的收盘价序列。返回DIF、DEA、MACD柱状图的最近30个有效值。",
    parameters: {
      data: { type: "number[]", description: "价格序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      fast: { type: "number", description: "快线周期，默认12" },
      slow: { type: "number", description: "慢线周期，默认26" },
      signal: { type: "number", description: "信号线周期，默认9" },
    },
    execute: (params) => {
      let data = params.data as number[] | undefined;
      if (!data || !Array.isArray(data) || data.length === 0) {
        if (lastStockData && lastStockData.closes.length > 0) {
          data = lastStockData.closes;
          console.log("[calculateMACD] Using cached data: " + lastStockData.code + ", " + data.length + " closes");
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const result = calculateMACD(
        data,
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
        latestTradeDate: lastStockData?.latestTradeDate || null,
      });
    },
  },
  {
    name: "calculateRSI",
    description: "计算RSI指标（相对强弱指数）。如已调用getStockHistory获取过数据，可不传data参数，自动使用缓存的收盘价序列。返回最近30个有效值和最新RSI值。",
    parameters: {
      data: { type: "number[]", description: "价格序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      period: { type: "number", description: "RSI周期，默认14" },
    },
    execute: (params) => {
      let data = params.data as number[] | undefined;
      if (!data || !Array.isArray(data) || data.length === 0) {
        if (lastStockData && lastStockData.closes.length > 0) {
          data = lastStockData.closes;
          console.log("[calculateRSI] Using cached data: " + lastStockData.code + ", " + data.length + " closes");
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const period = (params.period as number) || 14;
      const result = calculateRSI(data, period);
      const validValues = result.values.filter((v) => v !== null) as number[];
      const latestRSI = validValues.length > 0 ? validValues[validValues.length - 1] : null;
      const recentValues = validValues.slice(-30);

      const formula = "RSI(" + period + ") = 100 - 100 / (1 + RS), RS = Avg Gain / Avg Loss (Wilder smoothing)";

      const recentDates = lastStockData?.dates || [];
      const last15Closes = data.slice(-(period + 1));
      const last15Dates = recentDates.slice(-(period + 1));
      const changes: Array<{ date: string; close: number; change: number; gain: number; loss: number }> = [];
      for (let i = 1; i < last15Closes.length; i++) {
        const change = last15Closes[i] - last15Closes[i - 1];
        changes.push({
          date: last15Dates[i] || ("Day " + (data.length - period - 1 + i)),
          close: last15Closes[i],
          change: Number(change.toFixed(4)),
          gain: change > 0 ? Number(change.toFixed(4)) : 0,
          loss: change < 0 ? Number(Math.abs(change).toFixed(4)) : 0,
        });
      }

      let avgGain = 0;
      let avgLoss = 0;
      for (let i = 0; i < period && i < changes.length; i++) {
        avgGain += changes[i].gain;
        avgLoss += changes[i].loss;
      }
      avgGain /= period;
      avgLoss /= period;

      for (let i = period; i < changes.length; i++) {
        avgGain = (avgGain * (period - 1) + changes[i].gain) / period;
        avgLoss = (avgLoss * (period - 1) + changes[i].loss) / period;
      }

      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      const calcRSI = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + rs)).toFixed(4));

      const calcDetail = "Last " + (period + 1) + " days close changes:\n" + changes.map((c) => c.date + ": close=" + c.close + ", change=" + (c.change > 0 ? "+" : "") + c.change + ", gain=" + c.gain + ", loss=" + c.loss).join("\n") + "\n\nFinal avgGain=" + avgGain.toFixed(4) + ", avgLoss=" + avgLoss.toFixed(4) + ", RS=" + (rs === Infinity ? "inf" : rs.toFixed(4)) + ", RSI=" + calcRSI;

      return JSON.stringify({
        period: result.period,
        latestRSI,
        totalPoints: result.values.length,
        validPoints: validValues.length,
        recentValues,
        formula,
        calcDetail,
        latestTradeDate: lastStockData?.latestTradeDate || null,
      });
    },
  },
  {
    name: "calculateBollinger",
    description: "计算布林带指标。如已调用getStockHistory获取过数据，可不传data参数，自动使用缓存的收盘价序列。返回最近30个有效值和最新上轨/中轨/下轨。",
    parameters: {
      data: { type: "number[]", description: "价格序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      period: { type: "number", description: "周期，默认20" },
      stdDev: { type: "number", description: "标准差倍数，默认2" },
    },
    execute: (params) => {
      let data = params.data as number[] | undefined;
      if (!data || !Array.isArray(data) || data.length === 0) {
        if (lastStockData && lastStockData.closes.length > 0) {
          data = lastStockData.closes;
          console.log("[calculateBollinger] Using cached data: " + lastStockData.code + ", " + data.length + " closes");
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const result = calculateBollinger(
        data,
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
        latestTradeDate: lastStockData?.latestTradeDate || null,
      });
    },
  },
  {
    name: "calculateKDJ",
    description: "计算KDJ指标。如已调用getStockHistory获取过数据，可不传highs/lows/closes参数，自动使用缓存数据。返回最近30个有效值和最新K/D/J值。",
    parameters: {
      highs: { type: "number[]", description: "最高价序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      lows: { type: "number[]", description: "最低价序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      closes: { type: "number[]", description: "收盘价序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      period: { type: "number", description: "KDJ周期，默认9" },
    },
    execute: (params) => {
      let highs = params.highs as number[] | undefined;
      let lows = params.lows as number[] | undefined;
      let closes = params.closes as number[] | undefined;
      if ((!highs || !Array.isArray(highs) || highs.length === 0) && lastStockData) {
        highs = lastStockData.highs;
        lows = lastStockData.lows;
        closes = lastStockData.closes;
        console.log("[calculateKDJ] Using cached data: " + lastStockData.code + ", " + closes.length + " rows");
      }
      if (!highs || !lows || !closes) {
        return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
      }
      const result = calculateKDJ(
        highs,
        lows,
        closes,
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
        latestTradeDate: lastStockData?.latestTradeDate || null,
      });
    },
  },
  {
    name: "calculateVWAP",
    description: "计算VWAP（成交量加权平均价）。如已调用getStockHistory获取过数据，可不传参数，自动使用缓存的收盘价和成交量序列。",
    parameters: {
      closes: { type: "number[]", description: "收盘价序列。如已调用getStockHistory可不传，自动使用缓存数据" },
      volumes: { type: "number[]", description: "成交量序列。如已调用getStockHistory可不传，自动使用缓存数据" },
    },
    execute: (params) => {
      let closes = params.closes as number[] | undefined;
      let volumes = params.volumes as number[] | undefined;
      if ((!closes || !Array.isArray(closes) || closes.length === 0) && lastStockData) {
        closes = lastStockData.closes;
        volumes = lastStockData.volumes;
        console.log("[calculateVWAP] Using cached data: " + lastStockData.code);
      }
      if (!closes || !volumes) {
        return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
      }
      const result = calculateVWAP(closes, volumes);
      return JSON.stringify({ vwap: result, latestTradeDate: lastStockData?.latestTradeDate || null });
    },
  },
  {
    name: "calculateSharpeRatio",
    description: "计算夏普比率。如已调用getStockHistory获取过数据，可不传returns参数，自动使用缓存的收盘价计算日收益率。",
    parameters: {
      returns: { type: "number[]", description: "收益率序列。如已调用getStockHistory可不传，自动使用缓存数据计算" },
      riskFreeRate: { type: "number", description: "无风险利率，默认0.03" },
    },
    execute: (params) => {
      let returns = params.returns as number[] | undefined;
      if (!returns || !Array.isArray(returns) || returns.length === 0) {
        if (lastStockData && lastStockData.closes.length > 1) {
          returns = lastStockData.closes.slice(1).map((c, i) => (c - lastStockData!.closes[i]) / lastStockData!.closes[i]);
          console.log("[calculateSharpeRatio] Using cached data for returns: " + lastStockData.code + ", " + returns.length + " rows");
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const result = calculateSharpeRatio(
        returns,
        params.riskFreeRate as number | undefined
      );
      return JSON.stringify({ sharpeRatio: result, latestTradeDate: lastStockData?.latestTradeDate || null });
    },
  },
  {
    name: "calculateMaxDrawdown",
    description: "计算最大回撤。如已调用getStockHistory获取过数据，可不传values参数，自动使用缓存的收盘价序列。",
    parameters: {
      values: { type: "number[]", description: "资产净值序列。如已调用getStockHistory可不传，自动使用缓存数据" },
    },
    execute: (params) => {
      let values = params.values as number[] | undefined;
      if (!values || !Array.isArray(values) || values.length === 0) {
        if (lastStockData && lastStockData.closes.length > 0) {
          values = lastStockData.closes;
          console.log("[calculateMaxDrawdown] Using cached data: " + lastStockData.code);
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const result = calculateMaxDrawdown(values);
      return JSON.stringify({ ...result, latestTradeDate: lastStockData?.latestTradeDate || null });
    },
  },
  {
    name: "calculateVolatility",
    description: "计算波动率。如已调用getStockHistory获取过数据，可不传returns参数，自动使用缓存的收盘价计算日收益率。",
    parameters: {
      returns: { type: "number[]", description: "收益率序列。如已调用getStockHistory可不传，自动使用缓存数据计算" },
      annualize: { type: "boolean", description: "是否年化，默认true" },
    },
    execute: (params) => {
      let returns = params.returns as number[] | undefined;
      if (!returns || !Array.isArray(returns) || returns.length === 0) {
        if (lastStockData && lastStockData.closes.length > 1) {
          returns = lastStockData.closes.slice(1).map((c, i) => (c - lastStockData!.closes[i]) / lastStockData!.closes[i]);
          console.log("[calculateVolatility] Using cached data for returns: " + lastStockData.code);
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const result = calculateVolatility(
        returns,
        params.annualize as boolean | undefined
      );
      return JSON.stringify({ volatility: result, latestTradeDate: lastStockData?.latestTradeDate || null });
    },
  },
  {
    name: "calculateCorrelation",
    description: "计算两个股票的相关系数。支持两种方式：1) 传入code1和code2，自动获取数据计算；2) 传入series1和series2数组。推荐使用方式1，只需提供股票代码即可。",
    parameters: {
      code1: { type: "string", description: "第一只股票代码，如sh.600036。如已调用getStockHistory获取过数据，可不传code1，自动使用缓存数据" },
      code2: { type: "string", description: "第二只股票代码，如sz.000858" },
      series1: { type: "number[]", description: "第一组数据数组（可选，优先使用code1）" },
      series2: { type: "number[]", description: "第二组数据数组（可选，优先使用code2）" },
    },
    execute: async (params) => {
      let series1 = params.series1 as number[] | undefined;
      let series2 = params.series2 as number[] | undefined;

      if (!series1 || !Array.isArray(series1) || series1.length === 0) {
        if (lastStockData && lastStockData.closes.length > 0) {
          series1 = lastStockData.closes;
          console.log("[calculateCorrelation] Using cached data as series1: " + lastStockData.code);
        }
      }

      if ((!series2 || !Array.isArray(series2) || series2.length === 0) && params.code2) {
        try {
          const endDate = new Date().toISOString().split("T")[0];
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const startDate = oneYearAgo.toISOString().split("T")[0];
          const fetchStart = Date.now();
          const res = await fetch(`${DATA_SERVICE_URL}/api/market/history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "baostock", code: params.code2, start_date: startDate, end_date: endDate, frequency: "d" }),
            signal: AbortSignal.timeout(30000),
          });
          const data = await res.json();
          console.log("[calculateCorrelation] Fetch code2=" + params.code2 + " data time: " + ((Date.now() - fetchStart) / 1000).toFixed(2) + "s");
          if (data.success && Array.isArray(data.data) && data.data.length > 0) {
            series2 = data.data.map((r: Record<string, unknown>) => Number(r.close));
          }
        } catch (err) {
          console.error("[calculateCorrelation] Fetch code2 data failed: " + (err instanceof Error ? err.message : String(err)));
        }
      }

      if (!series1 || !series2) {
        return JSON.stringify({ error: "缺少数据：请提供code1+code2或series1+series2" });
      }

      const minLen = Math.min(series1.length, series2.length);
      const s1 = series1.slice(-minLen);
      const s2 = series2.slice(-minLen);
      const result = calculateCorrelation(s1, s2);
      return JSON.stringify({ correlation: result, dataPoints: minLen, code1: params.code1 || lastStockData?.code, code2: params.code2 });
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
    description: "计算VaR（在险价值）。如已调用getStockHistory获取过数据，可不传returns参数，自动使用缓存的收盘价计算日收益率。",
    parameters: {
      returns: { type: "number[]", description: "收益率序列。如已调用getStockHistory可不传，自动使用缓存数据计算" },
      confidence: { type: "number", description: "置信水平，如0.95", required: true },
      horizon: { type: "number", description: "持有期天数", required: true },
    },
    execute: (params) => {
      let returns = params.returns as number[] | undefined;
      if (!returns || !Array.isArray(returns) || returns.length === 0) {
        if (lastStockData && lastStockData.closes.length > 1) {
          returns = lastStockData.closes.slice(1).map((c, i) => (c - lastStockData!.closes[i]) / lastStockData!.closes[i]);
          console.log("[calculateVaR] Using cached data for returns: " + lastStockData.code);
        } else {
          return JSON.stringify({ error: "未提供数据且无缓存数据，请先调用getStockHistory获取股票数据" });
        }
      }
      const result = calculateVaR({
        returns,
        confidence: params.confidence as number,
        horizon: params.horizon as number,
      });
      return JSON.stringify({ ...result, latestTradeDate: lastStockData?.latestTradeDate || null });
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
      return JSON.stringify({ ...result, latestTradeDate: lastStockData?.latestTradeDate || null });
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
    description: "获取A股股票历史K线数据，并自动计算常用技术指标（MA5/10/20/60、RSI14、MACD、布林带、KDJ）。返回数据中已包含计算好的指标值，无需再单独调用calculateMA/calculateRSI等工具。如果需要非标准周期（如MA30、RSI6等），则仍需单独调用计算工具。支持日K、周K、月K。返回结果中包含最新交易日日期，回答用户时必须使用该日期作为数据截止日期，不要使用end_date或其他日期。",
    parameters: {
      code: { type: "string", description: "股票代码，如 sh.600036（招商银行）、sz.000858（五粮液），baostock格式需带sh./sz.前缀", required: true },
      frequency: { type: "string", description: "K线频率: d=日K, w=周K, m=月K，默认d" },
      source: { type: "string", description: "数据源: baostock(默认), efinance, mootdx, tushare" },
      start_date: { type: "string", description: "开始日期，格式YYYY-MM-DD。当用户指定某个日期查询指标时，start_date应设为该日期前约3个月（确保有足够数据计算MA60等指标）。不指定时默认最近1年" },
      end_date: { type: "string", description: "结束日期，格式YYYY-MM-DD。当用户指定某个日期查询指标时，end_date设为该日期。不指定时默认到今天" },
    },
    execute: async (params) => {
      try {
        const source = (params.source as string) || "baostock";
        const endDate = (params.end_date as string) || new Date().toISOString().split("T")[0];
        let startDate: string;
        if (params.start_date) {
          startDate = params.start_date as string;
        } else {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          startDate = oneYearAgo.toISOString().split("T")[0];
        }

        console.log("[getStockHistory] Request: code=" + params.code + ", start=" + startDate + ", end=" + endDate + ", source=" + source);
        const fetchStartTime = Date.now();

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
        console.log("[getStockHistory] Data service response time: " + ((Date.now() - fetchStartTime) / 1000).toFixed(2) + "s, success=" + data.success);
        if (!data.success) return "Failed to get history: " + (data.error || "Unknown error");
        const rows = data.data || [];
        if (rows.length === 0) return "未查询到数据，请检查股票代码和日期范围";
        const fromCache = data.from_cache ? "（来自本地缓存）" : "（来自网络接口）";

        const closes = rows.map((r: Record<string, unknown>) => Number(r.close));
        const highs = rows.map((r: Record<string, unknown>) => Number(r.high));
        const lows = rows.map((r: Record<string, unknown>) => Number(r.low));
        const volumes = rows.map((r: Record<string, unknown>) => Number(r.volume));
        const dates = rows.map((r: Record<string, unknown>) => String(r.date || r.tradeDate || ""));

        const latestTradeDate = dates[dates.length - 1] || endDate;

        lastStockData = {
          closes,
          highs,
          lows,
          volumes,
          dates,
          code: params.code as string,
          dateRange: `${startDate} ~ ${endDate}`,
          latestTradeDate,
          rowCount: rows.length,
        };
        setStockCache(currentUserId, lastStockData);
        console.log("[getStockHistory] Data cached: code=" + params.code + ", " + rows.length + " rows, date range=" + startDate + "~" + endDate + ", latestTradeDate=" + latestTradeDate);

        const latestRow = rows[rows.length - 1];
        const summary = rows.slice(-10).map((r: Record<string, unknown>) =>
          (r.date || r.tradeDate) + ": O=" + r.open + " H=" + r.high + " L=" + r.low + " C=" + r.close + " V=" + r.volume
        ).join("\n");

        const latestClose = closes[closes.length - 1];
        const maxClose = Math.max(...closes);
        const minClose = Math.min(...closes);
        const avgVolume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;

        return "Total " + rows.length + " records" + fromCache + ", date range: " + startDate + "~" + endDate + ", latestTradeDate: " + latestTradeDate + "\n\nLast 10 K-lines:\n" + summary + "\n\nKey stats: latestClose=" + latestClose + ", rangeHigh=" + maxClose + ", rangeLow=" + minClose + ", avgVolume=" + avgVolume.toFixed(0) + "\n\n[Important] Full price data cached. Subsequent calculateMA/calculateRSI/calculateMACD/calculateBollinger/calculateKDJ/calculateVWAP/calculateSharpeRatio/calculateMaxDrawdown/calculateVolatility/calculateVaR calls do not need data param, system will use cache automatically. Just specify period etc. When answering, must use latestTradeDate " + latestTradeDate + " as data cutoff date, do not use end_date or other dates.";
      } catch (error) {
        return "History fetch error: " + (error instanceof Error ? error.message : String(error));
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
        const fetchStartTime = Date.now();
        const res = await fetch(`${DATA_SERVICE_URL}/api/market/realtime`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source, code: params.code }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        console.log("[getStockRealtime] Data service response time: " + ((Date.now() - fetchStartTime) / 1000).toFixed(2) + "s, success=" + data.success);
        if (!data.success) return "Failed to get realtime data: " + (data.error || "Unknown error");
        const records = data.data;
        if (!records || !Array.isArray(records) || records.length === 0) return "未查询到实时数据";
        const r = records[0];
        return "Realtime: " + r.股票名称 + " price=" + r.最新价 + " change=" + r.涨跌幅 + "% open=" + r.开盘价 + " high=" + r.最高价 + " low=" + r.最低价 + " vol=" + r.成交量 + " amount=" + r.成交额 + " turnover=" + r.换手率;
      } catch (error) {
        return "Realtime fetch error: " + (error instanceof Error ? error.message : String(error));
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
        const fetchStartTime = Date.now();
        const res = await fetch(`${DATA_SERVICE_URL}/api/market/financial`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        console.log("[getStockFinancial] Data service response time: " + ((Date.now() - fetchStartTime) / 1000).toFixed(2) + "s, success=" + data.success);
        if (!data.success) return "Failed to get financial data: " + (data.error || "Unknown error");
        const rows = data.data || [];
        if (rows.length === 0) return "未查询到财务数据";
        const fromCache = data.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
        return "Financial data" + fromCache + ":\n" + JSON.stringify(rows, null, 2);
      } catch (error) {
        return "Financial data fetch error: " + (error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: "getFinancialReport",
    description: "获取A股股票详细财务报表，同时自动补充关键盈利能力指标（ROE、毛利率、净利率等）。返回利润表/资产负债表/现金流量表的详细数据，以及盈利能力指标摘要。无需再单独调用getStockFinancial。",
    parameters: {
      code: { type: "string", description: "股票代码，如 600519（不需要sh./sz.前缀）", required: true },
      report_type: { type: "string", description: "报表类型: income=利润表(默认), balance=资产负债表, cashflow=现金流量表" },
    },
    execute: async (params) => {
      try {
        const fetchStartTime = Date.now();
        const reportRes = await fetch(`${DATA_SERVICE_URL}/api/market/financial_report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: params.code,
            report_type: (params.report_type as string) || "income",
          }),
          signal: AbortSignal.timeout(30000),
        });
        const reportData = await reportRes.json();
        console.log("[getFinancialReport] Report data service response time: " + ((Date.now() - fetchStartTime) / 1000).toFixed(2) + "s, success=" + reportData.success);

        const rows = reportData.data || [];
        const fromCache = reportData.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
        const reportNames: Record<string, string> = { income: "利润表", balance: "资产负债表", cashflow: "现金流量表" };
        const reportName = reportNames[(params.report_type as string) || "income"] || "利润表";

        let reportResult = "";
        if (!reportData.success || rows.length === 0) {
          reportResult = reportName + " fetch failed: " + (reportData.error || "No data found");
        } else {
          reportResult = reportName + fromCache + " (last " + rows.length + " periods):\n" + JSON.stringify(rows, null, 2);
        }

        let financialSummary = "";
        try {
          const financialRes = await fetch(`${DATA_SERVICE_URL}/api/market/financial`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "efinance", code: params.code }),
            signal: AbortSignal.timeout(15000),
          });
          const financialData = await financialRes.json();
          console.log("[getFinancialReport] Profitability metrics supplement time: " + ((Date.now() - fetchStartTime) / 1000).toFixed(2) + "s, success=" + financialData.success);
          if (financialData.success && Array.isArray(financialData.data) && financialData.data.length > 0) {
            const finCache = financialData.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
            financialSummary = "\n\n[Auto-supplement] Profitability metrics" + finCache + ":\n" + JSON.stringify(financialData.data, null, 2);
          }
        } catch (finErr) {
          console.error("[getFinancialReport] Profitability metrics supplement failed: " + (finErr instanceof Error ? finErr.message : String(finErr)));
        }

        return `${reportResult}${financialSummary}`;
      } catch (error) {
        return "Financial report fetch error: " + (error instanceof Error ? error.message : String(error));
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
        const searchStartTime = Date.now();
        const results = await hybridSearch(
          params.query as string,
          (params.topK as number) || 10
        );
        console.log("[hybridSearch] RAG search time: " + ((Date.now() - searchStartTime) / 1000).toFixed(2) + "s, results: " + results.length);
        const formatted = results
          .map((r, i) => "[" + (i + 1) + "] (score: " + r.score.toFixed(4) + ") " + r.text)
          .join("\n\n");
        return formatted || "未找到相关结果";
      } catch (error) {
        console.error("[simpleAgent] hybridSearch 执行失败:", error);
        return "Search failed: " + (error instanceof Error ? error.message : String(error));
      }
    },
  },
];

function getToolDescriptions(): string {
  return tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  params: ${JSON.stringify(t.parameters)}`
    )
    .join("\n\n");
}

function parseSingleToolCall(text: string): { name: string; params: Record<string, unknown> } | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tool && parsed.parameters) {
        console.log("[simpleAgent] Parse tool call success (format 1): tool=" + parsed.tool);
        return { name: parsed.tool, params: parsed.parameters };
      }
      if (parsed.name || parsed.function?.name) {
        const toolName = parsed.name || parsed.function?.name;
        const toolArgs = parsed.arguments || parsed.function?.arguments || parsed.parameters || {};
        if (typeof toolArgs === "string") {
          try { return { name: toolName, params: JSON.parse(toolArgs) }; } catch { /* ignore */ }
        }
        console.log("[simpleAgent] Parse tool call success (format 1-alt): tool=" + toolName);
        return { name: toolName, params: toolArgs };
      }
    }

    const actionMatch = text.match(/Action:\s*(\w+)\s*\n\s*Action Input:\s*([\s\S]*?)(?=\n\n|Observation|$)/i);
    if (actionMatch) {
      const name = actionMatch[1].trim();
      const params = JSON.parse(actionMatch[2].trim());
      console.log("[simpleAgent] Parse tool call success (format 2): tool=" + name);
      return { name, params };
    }

    const funcCallMatch = text.match(/(?:调用|使用|执行)\s*(?:工具|函数)?\s*[:：]?\s*(\w+)\s*[\(（]([\s\S]*?)[\)）]/);
    if (funcCallMatch) {
      try {
        const name = funcCallMatch[1].trim();
        const argsStr = funcCallMatch[2].trim();
        if (tools.some(t => t.name === name)) {
          const params = JSON.parse(argsStr);
          console.log("[simpleAgent] Parse tool call success (format 3): tool=" + name);
          return { name, params };
        }
      } catch { /* ignore */ }
    }

    const inlineJsonMatch = text.match(/\{\s*"tool"\s*:\s*"(\w+)"\s*,\s*"parameters"\s*:\s*(\{[\s\S]*?\})\s*\}/);
    if (inlineJsonMatch) {
      const name = inlineJsonMatch[1];
      const params = JSON.parse(inlineJsonMatch[2]);
      if (tools.some(t => t.name === name)) {
        console.log("[simpleAgent] Parse tool call success (format 4-inline): tool=" + name);
        return { name, params };
      }
    }
  } catch (e) {
    console.error("[simpleAgent] 解析工具调用异常:", e);
  }
  return null;
}

function parseToolCalls(text: string): { name: string; params: Record<string, unknown> }[] {
  const results: { name: string; params: Record<string, unknown> }[] = [];

  const jsonBlocks = text.match(/```json\s*([\s\S]*?)```/g);
  if (jsonBlocks && jsonBlocks.length > 1) {
    for (const block of jsonBlocks) {
      const inner = block.replace(/```json\s*/, "").replace(/```$/, "");
      try {
        const parsed = JSON.parse(inner);
        if (parsed.tool && parsed.parameters) {
          results.push({ name: parsed.tool, params: parsed.parameters });
        } else if (parsed.name || parsed.function?.name) {
          const toolName = parsed.name || parsed.function?.name;
          const toolArgs = parsed.arguments || parsed.function?.arguments || parsed.parameters || {};
          const finalArgs = typeof toolArgs === "string" ? JSON.parse(toolArgs) : toolArgs;
          results.push({ name: toolName, params: finalArgs });
        }
      } catch { /* ignore */ }
    }
    if (results.length > 0) {
      console.log("[simpleAgent] Parsed " + results.length + " tool calls: " + results.map(r => r.name).join(", "));
      return results;
    }
  }

  const single = parseSingleToolCall(text);
  if (single) {
    results.push(single);
  }
  return results;
}

export interface AgentResult {
  answer: string;
  iterations: number;
  conversationId: string;
  steps: AgentStep[];
}

async function generateConversationTitle(query: string, answer: string, conversationId: string, model?: string): Promise<void> {
  try {
    const titlePrompt: BailianMessage[] = [
      {
        role: "system",
        content: "你是一个会话标题生成器。根据用户的问题和AI的回答，生成一个简短的中文会话标题（不超过15个字）。只输出标题文本，不要输出任何其他内容。标题要概括对话的核心主题。",
      },
      {
        role: "user",
        content: "User query: " + query + "\nAI answer: " + answer.substring(0, 500),
      },
    ];
    const response = await callWithFallback(titlePrompt, 0.7);
    const title = response.content.trim().replace(/["""'']/g, "").substring(0, 20);
    if (title && title.length > 0) {
      await updateConversationTitle(conversationId, title);
      console.log("[simpleAgent] Conversation title generated: " + title);
    }
  } catch (err) {
    console.error("[simpleAgent] Generate conversation title failed: " + (err instanceof Error ? err.message : String(err)));
  }
}

export async function runAgent(query: string, maxIterations: number = 5, conversationId?: string, userId: string = "default-user", model?: string, _userName?: string, _userEmail?: string, onStep?: (step: AgentStep) => void): Promise<AgentResult> {
  console.log("[simpleAgent] Received query: " + query + ", maxIterations: " + maxIterations + ", userId: " + userId + ", model: " + (model || "default"));
  const startTime = Date.now();
  const steps: AgentStep[] = [];
  lastStockData = getStockCache(userId);
  currentUserId = userId;

  const pushStep = (step: AgentStep) => {
    steps.push(step);
    onStep?.(step);
  };

  let convId = conversationId;
  let needGenerateTitle = false;
  if (!convId) {
    convId = await createConversation(userId);
    needGenerateTitle = true;
  }

  const historyMessages = await getRecentMessages(convId);
  if (!needGenerateTitle && historyMessages.length <= 1) {
    needGenerateTitle = true;
  }
  await addMessage(convId, "user", query);

  pushStep({
    type: "thinking",
    round: 0,
    title: "Received User Query",
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
为了减少迭代轮次，你可以在同一轮中同时调用多个工具（最多3个）。

【核心规则 - 必须严格遵守】：

1. 【严禁编造数据】所有具体的股价、财务数字（营收、利润、ROE等）、技术指标数值必须来自工具调用结果，绝不能凭空编造！如果工具未返回数据，必须明确告知用户"未获取到数据"，不能猜测或编造数字。

2. 【必须调用工具的场景】以下场景必须先调用对应工具获取数据，不能直接回答：
   - 用户询问营收、利润、ROE、毛利率等财务指标 → 必须调用 getStockFinancial（优先efinance数据源，code格式如600519）
   - 用户询问具体股价、涨跌幅 → 必须调用 getStockRealtime
   - 用户要求计算技术指标（MA、RSI、MACD等）→ 必须先调用 getStockHistory 获取股价数据
   - 用户询问详细财务报表项目 → 调用 getFinancialReport（已自动包含盈利能力指标，无需再调用getStockFinancial）
   - 用户询问公司财报、行业分析等文档内容 → 使用 hybridSearch
   - 用户要求计算两只股票相关系数 → 同时调用 getStockHistory + calculateCorrelation（见规则9）

3. 【工具选择优先级】当用户询问财务数据时：
   - 首选 getStockFinancial（efinance数据源，无需指定year/quarter，自动获取最新）
   - 如果需要更详细的报表数据，使用 getFinancialReport
   - 不要使用 hybridSearch 来查找财务数字（hybridSearch是检索文档的，不是获取实时财务数据的）

4. 【股票代码格式】：
   - efinance/getStockFinancial/getFinancialReport/getStockRealtime: 不需要前缀，如 600519、000858
   - baostock/getStockHistory: 需要 sh./sz. 前缀，如 sh.600519、sz.000858

5. 【数据来源说明】所有数据工具调用的是真实的金融数据接口（baostock/efinance），返回的是实时或历史真实数据，数据会自动缓存到本地。

6. 如果工具调用失败或返回空数据，应如实告知用户，不要用编造的数据来回答。可以尝试换一个数据源重新获取。

7. 【技术指标计算流程】当用户要求计算技术指标时，你必须在同一次响应中同时输出两个工具调用，以减少迭代轮次：
   步骤1（同一轮中）: 同时输出 getStockHistory 和 calculateMA/calculateRSI 等计算工具的调用，格式如下：

   我需要先获取股价数据，然后计算MA20指标。

   \`\`\`json
   {"tool": "getStockHistory", "parameters": {"code": "sh.600036"}}
   \`\`\`

   \`\`\`json
   {"tool": "calculateMA", "parameters": {"period": 20}}
   \`\`\`

   系统会按顺序执行：先执行getStockHistory缓存数据，再执行calculateMA使用缓存数据计算。
   注意：不要在工具调用中传入大量价格数据数组，系统会自动从缓存中读取
   - 如果用户指定了某个日期（如"2026-05-06的MA20"），getStockHistory需传入 start_date 和 end_date 参数

8. 【重要】计算技术指标时，必须在同一次响应中同时输出 getStockHistory 和计算工具的调用（见规则7）。对于多公司查询，也应在同一轮中同时调用多家公司的工具，以减少迭代轮次。

9. 【相关系数计算流程】当用户要求计算两只股票的相关系数时，你必须在同一次响应中同时输出 getStockHistory 和 calculateCorrelation 的调用，格式如下：

   我需要获取招商银行的股价数据，然后计算招商银行和五粮液的相关系数。

   \`\`\`json
   {"tool": "getStockHistory", "parameters": {"code": "sh.600036"}}
   \`\`\`

   \`\`\`json
   {"tool": "calculateCorrelation", "parameters": {"code2": "sz.000858"}}
   \`\`\`

   注意：calculateCorrelation 只需传 code2 参数（第二只股票代码），code1 会自动使用 getStockHistory 缓存的数据。不要传 series1/series2 数组，系统会自动获取。

10. 【回答格式要求 - 时间相关数据必须标注日期】当你回答涉及股价、技术指标、财务数据等与时间相关的数据时，必须在回答中明确标注数据的查询日期或截止日期。例如：
   - "截至2026-05-29（最新交易日），招商银行MA20为37.92"
   - 如果用户指定了日期，回答中使用用户指定的日期
   - 如果用户未指定日期，回答中必须使用工具返回的latestTradeDate（最新交易日）作为数据截止日期，不要使用当前日期或end_date参数
   - 例如：getStockHistory返回latestTradeDate=2026-05-29，则回答中写"截至2026-05-29（最新交易日）"，而不是"截至2026-05-30（今天）"

11. 【计算公式和验证数据】当计算MA、RSI等技术指标时，工具返回结果中包含formula（计算公式）和calcDetail（计算过程和中间数据）。你必须在回答中输出这些信息，让用户可以手动验证计算结果是否正确。格式示例：
   - MA20计算公式：MA20 = (最近20个交易日收盘价之和) / 20
   - 计算过程：(2026-05-06: 38.50 + ... + 2026-05-29: 37.50) / 20 = 758.35 / 20 = 37.9175
   - RSI(14)计算公式：RSI(14) = 100 - 100 / (1 + RS)，RS = 平均涨幅 / 平均跌幅
   - 计算过程：列出最近15日收盘价变动、每日涨跌、avgGain、avgLoss、RS、最终RSI

12. 【及时输出原则】当你已经通过工具获取到足够的数据来回答用户问题时，必须立即输出最终答案，不要再调用额外的工具。例如：如果用户问'毛利率是多少'且你已经从getStockFinancial获取到了毛利率数据，就直接回答，不要再调用hybridSearch去查找年报确认。

13. 【禁止重复调用】绝对不要重复调用已经调用过的工具！如果getStockFinancial已经返回了数据，不要再次调用它。如果getStockHistory已经返回了K线数据，不要再次调用它。重复调用相同的工具是严重错误，会浪费时间和资源。一旦获取到数据，立即基于已有数据回答问题。

14. 【迭代效率】每个工具最多调用1次。如果某个工具返回了数据但你觉得不够完整，应该使用hybridSearch补充文档信息，而不是再次调用同一个工具。如果所有工具都已调用过，必须立即输出最终答案。`;

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
  let currentModel = model || "unknown";
  let toolCallHistory: string[] = [];
  let duplicateCallCount = 0;

  for (let i = 0; i < maxIterations; i++) {
    if (Date.now() - startTime > AGENT_TIMEOUT_MS) {
      const elapsedMs = Date.now() - startTime;
      const elapsedSec = (elapsedMs / 1000).toFixed(1);
      console.error("[simpleAgent] Agent timeout after " + AGENT_TIMEOUT_MS + "ms, elapsed: " + elapsedSec + "s");
      pushStep({
        type: "answer",
        round: i + 1,
        title: "Agent Timeout",
        content: "Agent timeout, please try again later or simplify your question.",
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
      if (needGenerateTitle) await generateConversationTitle(query, "Agent 执行超时", convId, model);
      return { answer: "Agent 执行超时，请稍后重试或简化您的问题。", iterations, conversationId: convId, steps };
    }
    iterations++;
    const roundStartTime = Date.now();
    const elapsedMs = roundStartTime - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    console.log("[simpleAgent] Round " + (i + 1) + "/" + maxIterations + " elapsed: " + elapsedSec + "s");

    pushStep({
      type: "thinking",
      round: i + 1,
      title: "Round " + (i + 1) + " - LLM Reasoning",
      content: "Calling LLM for reasoning...",
      detail: { roundIndex: i + 1, elapsedMs },
      timestamp: Date.now(),
    });

    try {
      const llmStartTime = Date.now();
      const response = await callWithFallback(messages, undefined, true);
      const llmMs = Date.now() - llmStartTime;
      const assistantContent = response.content;

      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
      }

      console.log("[simpleAgent] Round " + (i + 1) + " LLM: " + (llmMs / 1000).toFixed(2) + "s, total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
      console.log("[simpleAgent] LLM response: " + assistantContent.substring(0, 200) + "...");

      messages.push({ role: "assistant", content: assistantContent });

      const toolCalls = parseToolCalls(assistantContent);
      const reasoningText = assistantContent.replace(/```json[\s\S]*?```/g, "").trim();
      const reasoning = reasoningText.substring(0, 500);

      if (toolCalls.length === 0) {
        if (toolObservations.length > 0) {
          const roundMs = Date.now() - roundStartTime;
          console.log("[simpleAgent] Has tool results and LLM final answer, done. Round: " + (roundMs / 1000).toFixed(2) + "s");

          pushStep({
            type: "answer",
            round: i + 1,
            title: "Final Answer",
            content: assistantContent,
            detail: { roundMs, llmMs, totalMs: Date.now() - startTime },
            timestamp: Date.now(),
          });

          await addMessage(convId, "assistant", assistantContent);

          const latencyMs = Date.now() - startTime;
          saveAgentLog({
            userId,
            conversationId: convId,
            query,
            answer: assistantContent,
            model: model || "unknown",
            iterations: i + 1,
            steps,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            latencyMs,
            status: "success",
          }).catch((e) => console.error("[simpleAgent] 保存日志失败:", e));

          if (needGenerateTitle) await generateConversationTitle(query, assistantContent, convId, model);
          return { answer: assistantContent, iterations, conversationId: convId, steps };
        }

        console.log("[simpleAgent] 无工具调用且无工具结果，进入反思评估阶段");

        pushStep({
          type: "reflection",
          round: i + 1,
          title: "Round " + (i + 1) + " - Reflection",
          content: "LLM did not call tools, evaluating if answer is sufficient...",
          detail: { answerPreview: assistantContent.substring(0, 300), llmMs },
          timestamp: Date.now(),
        });

        const reflectionStartTime = Date.now();
        const reflection = await shouldRetrieveAgain(query, assistantContent, lastSearchResults, toolObservations);
        const reflectionMs = Date.now() - reflectionStartTime;
        console.log("[simpleAgent] Round " + (i + 1) + " reflection: " + (reflectionMs / 1000).toFixed(2) + "s, needMore=" + reflection.needMore);

        if (reflection.needMore && reflection.refinedQuery && i < maxIterations - 1) {
          console.log(
            "[simpleAgent] Reflection result: need more info, suggestion: \"" + reflection.refinedQuery + "\""
          );

          const isToolSuggestion = reflection.refinedQuery.includes("getStockFinancial") ||
            reflection.refinedQuery.includes("getStockHistory") ||
            reflection.refinedQuery.includes("getFinancialReport") ||
            reflection.refinedQuery.includes("getStockRealtime");

          pushStep({
            type: "reflection",
            round: i + 1,
            title: "Round " + (i + 1) + " - Reflection: " + (isToolSuggestion ? "Need Data Tools" : "Continue Search"),
            content: "Current answer insufficient, " + (isToolSuggestion ? "data may be fabricated, need real data tools" : "need more information"),
            detail: {
              needMore: true,
              refinedQuery: reflection.refinedQuery,
              reason: isToolSuggestion ? "检测到答案中的数字没有工具调用支撑，需要调用数据获取工具" : "答案中缺少关键信息，需要改写查询再次检索",
            },
            timestamp: Date.now(),
          });

          if (isToolSuggestion) {
            pushStep({
              type: "tool_call",
              round: i + 1,
              title: "Round " + (i + 1) + " - Reflection Triggered Data Tool Call",
              content: "Suggestion: " + reflection.refinedQuery,
              timestamp: Date.now(),
            });

            messages.push({
              role: "user",
              content: "[Important] Your previous answer contains specific numbers without tool call support, which may be fabricated. Reflection suggestion: " + reflection.refinedQuery + "\n\nPlease call the corresponding tools as suggested to get real data, then re-answer the user's question with the real data. Never use numbers without tool support!",
            });
          } else {
            pushStep({
              type: "retrieval",
              round: i + 1,
              title: "Round " + (i + 1) + " - Reflection Triggered Additional Search",
              content: "Rewritten query: \"" + reflection.refinedQuery + "\"",
              timestamp: Date.now(),
            });

            const ragStartTime = Date.now();
            const ragResult = await hybridSearch(reflection.refinedQuery, 10);
            const ragMs = Date.now() - ragStartTime;
            console.log("[simpleAgent] Round " + (i + 1) + " reflection RAG: " + (ragMs / 1000).toFixed(2) + "s, results: " + ragResult.length);
            const formattedResult = ragResult
              .map((r, idx) => "[" + (idx + 1) + "] (score: " + r.score.toFixed(4) + ") " + r.text)
              .join("\n\n");

            lastSearchResults.push(formattedResult);

            pushStep({
              type: "retrieval",
              round: i + 1,
              title: "Round " + (i + 1) + " - Additional Search Results",
              content: "Found " + ragResult.length + " results",
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
              content: "Reflection search results (query: \"" + reflection.refinedQuery + "\"):\n" + formattedResult + "\n\nPlease re-answer the user's question based on all the above information. If information is still insufficient, give your best answer directly.",
            });
          }

          const roundMs = Date.now() - roundStartTime;
          console.log("[simpleAgent] Round " + (i + 1) + " total: " + (roundMs / 1000).toFixed(2) + "s (LLM=" + (llmMs / 1000).toFixed(2) + "s, reflection=" + (reflectionMs / 1000).toFixed(2) + "s), total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
          continue;
        }

        pushStep({
          type: "reflection",
          round: i + 1,
          title: "Round " + (i + 1) + " - Reflection: Answer Sufficient",
          content: "Answer sufficiently addresses the question, ending iteration",
          detail: { needMore: false, llmMs, reflectionMs },
          timestamp: Date.now(),
        });

        const roundMs = Date.now() - roundStartTime;
        console.log("[simpleAgent] Reflection passed, return final answer. Round: " + (roundMs / 1000).toFixed(2) + "s (LLM=" + (llmMs / 1000).toFixed(2) + "s, reflection=" + (reflectionMs / 1000).toFixed(2) + "s)");

        pushStep({
          type: "answer",
          round: i + 1,
          title: "Final Answer",
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

        if (needGenerateTitle) await generateConversationTitle(query, assistantContent, convId, model);
        return { answer: assistantContent, iterations, conversationId: convId, steps };
      }

      const toolCallsList = toolCalls;
      const invalidTools = toolCallsList.filter((tc) => !tools.find((t) => t.name === tc.name));
      if (invalidTools.length > 0) {
        const errorMsg = "Tool not found: " + invalidTools.map((t) => t.name).join(", ");
        console.error("[simpleAgent] " + errorMsg);

        pushStep({
          type: "tool_call",
          round: i + 1,
          title: "Round " + (i + 1) + " - Tool Call Failed",
          content: errorMsg,
          detail: { toolName: invalidTools[0].name, error: true },
          timestamp: Date.now(),
        });

        messages.push({ role: "user", content: "Observation: Error - " + errorMsg });
        continue;
      }

      const observationParts: string[] = [];
      let totalToolMs = 0;

      for (const toolCall of toolCallsList) {
        const tool = tools.find((t) => t.name === toolCall.name)!;

        console.log("[simpleAgent] Calling tool: " + toolCall.name + ", params: " + JSON.stringify(toolCall.params).substring(0, 100));

        pushStep({
          type: "tool_call",
          round: i + 1,
          title: "Round " + (i + 1) + " - Calling Tool: " + toolCall.name,
          content: reasoning ? "Reasoning: " + reasoning + "\n\nParams: " + JSON.stringify(toolCall.params, null, 2) : "Params: " + JSON.stringify(toolCall.params, null, 2),
          detail: { toolName: toolCall.name, params: toolCall.params, reasoning, llmMs },
          timestamp: Date.now(),
        });

        const toolStartTime = Date.now();
        const toolResult = await tool.execute(toolCall.params);
        const toolMs = Date.now() - toolStartTime;
        totalToolMs += toolMs;
        console.log("[simpleAgent] Round " + (i + 1) + " tool " + toolCall.name + ": " + (toolMs / 1000).toFixed(2) + "s, total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
        console.log("[simpleAgent] Tool result: " + toolResult.substring(0, 200) + "...");

        toolObservations.push(`[${toolCall.name}] ${toolResult.substring(0, 500)}`);

        if (toolCall.name === "hybridSearch") {
          lastSearchResults.push(toolResult);

          pushStep({
            type: "retrieval",
            round: i + 1,
            title: "Round " + (i + 1) + " - RAG Search Results",
            content: toolResult.substring(0, 500),
            detail: {
              query: toolCall.params.query as string,
              topK: toolCall.params.topK as number | undefined,
              resultPreview: toolResult.substring(0, 1000),
              toolMs,
            },
            timestamp: Date.now(),
          });
        } else {
          pushStep({
            type: "tool_result",
            round: i + 1,
            title: "Round " + (i + 1) + " - Tool Result: " + toolCall.name,
            content: toolResult.substring(0, 500),
            detail: { toolName: toolCall.name, resultPreview: toolResult.substring(0, 1000), toolMs },
            timestamp: Date.now(),
          });
        }

        observationParts.push(`[${toolCall.name}] ${toolResult}`);
      }

      const MAX_OBSERVATION_LENGTH = 8000;
      let observationContent = `Observation:\n${observationParts.join("\n\n")}`;
      if (observationContent.length > MAX_OBSERVATION_LENGTH) {
        const truncated = observationContent.substring(0, MAX_OBSERVATION_LENGTH);
        observationContent = truncated + "\n\n[Result truncated, original length: " + observationContent.length + " chars]";
        console.log("[simpleAgent] Multi-tool result truncated: original " + observationContent.length + " chars -> " + MAX_OBSERVATION_LENGTH + " chars");
      }

      const currentToolNames = toolCallsList.map((tc) => tc.name);
      const prevSet = new Set(toolCallHistory);
      const duplicates = currentToolNames.filter((name) => prevSet.has(name));
      toolCallHistory.push(...currentToolNames);

      if (duplicates.length > 0) {
        duplicateCallCount++;
        console.log("[simpleAgent] Duplicate tool calls detected: " + duplicates.join(", ") + " (count: " + duplicateCallCount + ")");
      } else {
        duplicateCallCount = 0;
      }

      if (duplicateCallCount >= 2) {
        observationContent += "\n\n[IMPORTANT] You have already called these tools before and received results. You MUST NOT call the same tools again. Instead, you MUST immediately output your final answer based on the data you have already collected. Do not call any more tools!";
        console.log("[simpleAgent] Force output: duplicate call count >= 2, appending force-output instruction");
      }

      messages.push({ role: "user", content: observationContent });

      const roundMs = Date.now() - roundStartTime;
      const toolNames = toolCallsList.map((tc) => tc.name).join("+");
      console.log("[simpleAgent] Round " + (i + 1) + " total: " + (roundMs / 1000).toFixed(2) + "s (LLM=" + (llmMs / 1000).toFixed(2) + "s, tools=" + toolNames + "=" + (totalToolMs / 1000).toFixed(2) + "s), total: " + ((Date.now() - startTime) / 1000).toFixed(1) + "s");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[simpleAgent] Iteration error: " + errorMsg);

      pushStep({
        type: "answer",
        round: i + 1,
        title: "Agent Error",
        content: "Agent execution error: " + errorMsg,
        timestamp: Date.now(),
      });

      await addMessage(convId, "assistant", "Agent execution error: " + errorMsg);

      const latencyMs = Date.now() - startTime;
      saveAgentLog({
        userId,
        conversationId: convId,
        query,
        answer: "Agent execution error: " + errorMsg,
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
      if (needGenerateTitle) await generateConversationTitle(query, "Execution error: " + errorMsg, convId, model);
      return { answer: "Agent execution error: " + errorMsg, iterations, conversationId: convId, steps };
    }
  }

  pushStep({
    type: "answer",
    round: iterations,
    title: "Max Iterations Reached",
    content: "Agent reached max iterations without conclusion.",
    timestamp: Date.now(),
  });

  await addMessage(convId, "assistant", "Agent 超过最大迭代次数，未能得出结论。");
  if (needGenerateTitle) await generateConversationTitle(query, "超过最大迭代次数", convId, model);
  return { answer: "Agent 超过最大迭代次数，未能得出结论。", iterations, conversationId: convId, steps };
}
