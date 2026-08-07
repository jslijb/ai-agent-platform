import {
  calculateMA,
  calculateMACD,
  calculateRSI,
  calculateBollinger,
  calculateKDJ,
} from "@/server/mcp/tools/quant_analysis";
import type { ToolDefinition } from "../simpleAgent";

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

interface StockDataCache {
  code: string;
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  dates: string[];
  latestTradeDate: string | null;
}

let lastStockData: StockDataCache | null = null;

export function setStockDataCache(data: StockDataCache): void {
  lastStockData = data;
}

export function getStockDataCache(): StockDataCache | null {
  return lastStockData;
}

async function fetchStockData(code: string): Promise<StockDataCache | null> {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/api/market/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, frequency: "d" }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (!result.data || result.data.length === 0) return null;

    const closes: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    const dates: string[] = [];

    for (const item of result.data) {
      if (item.close != null) closes.push(Number(item.close));
      if (item.high != null) highs.push(Number(item.high));
      if (item.low != null) lows.push(Number(item.low));
      if (item.volume != null) volumes.push(Number(item.volume));
      if (item.date) dates.push(String(item.date));
    }

    const cache: StockDataCache = {
      code,
      closes,
      highs,
      lows,
      volumes,
      dates,
      latestTradeDate: dates.length > 0 ? dates[dates.length - 1] : null,
    };
    lastStockData = cache;
    console.log(`[technicalAnalysis] Auto-fetched stock data: ${code}, ${closes.length} bars`);
    return cache;
  } catch (error) {
    console.error("[technicalAnalysis] Auto-fetch failed:", error);
    return null;
  }
}

function ensureData(params: Record<string, unknown>, field: string = "data"): number[] | null {
  const data = params[field] as number[] | undefined;
  if (data && Array.isArray(data) && data.length > 0) return data;
  if (lastStockData) {
    switch (field) {
      case "data":
      case "closes":
        return lastStockData.closes;
      case "highs":
        return lastStockData.highs;
      case "lows":
        return lastStockData.lows;
      case "volumes":
        return lastStockData.volumes;
    }
  }
  return null;
}

export const technicalAnalysisTool: ToolDefinition = {
  name: "technicalAnalysis",
  category: "technical-analysis",
  description:
    "技术指标计算。支持MA(移动平均)、MACD、RSI(相对强弱)、BB(布林带)、KDJ(随机指标)。" +
    "如已调用getStockHistory可不传data参数，自动使用缓存；如未获取数据，传入code参数自动获取。",
  parameters: {
    indicator: {
      type: "string",
      description: "指标类型：MA/MACD/RSI/BB/KDJ",
      required: true,
    },
    code: {
      type: "string",
      description: "股票代码（如sh.600036），未获取过数据时自动获取",
    },
    period: {
      type: "number",
      description: "计算周期（MA/RSI/BB/KDJ需要），如5/10/14/20",
    },
    data: {
      type: "array",
      items: { type: "number" },
      description: "价格序列（可选，优先使用缓存或自动获取）",
    },
  },
  execute: async (params: Record<string, unknown>) => {
    const indicator = String(params.indicator || "").toUpperCase();
    let data = ensureData(params, "data");

    if (!data && params.code) {
      const cache = await fetchStockData(String(params.code));
      if (cache) data = cache.closes;
    }

    if (!data) {
      if (lastStockData && lastStockData.closes.length > 0) {
        data = lastStockData.closes;
      } else {
        return JSON.stringify({ error: "未提供数据且无缓存数据。请传入code参数或先调用getStockHistory。" });
      }
    }

    const period = typeof params.period === "number" ? params.period : undefined;

    switch (indicator) {
      case "MA": {
        if (!period) return JSON.stringify({ error: "MA需要period参数" });
        const result = calculateMA(data, period);
        const validValues = result.values.filter((v) => v !== null) as number[];
        const latestMA = validValues.length > 0 ? validValues[validValues.length - 1] : null;
        const recentValues = validValues.slice(-30);
        const lastNPrices = data.slice(-period);
        const lastNSum = lastNPrices.reduce((a, b) => a + b, 0);
        const lastNCalc = Number((lastNSum / period).toFixed(4));
        const recentDates = lastStockData?.dates?.slice(-period) || [];
        const priceDetail = lastNPrices.map((p, i) => `${recentDates[i] || "Day" + (data.length - period + i + 1)}: ${p}`).join(" + ");
        return JSON.stringify({
          indicator: "MA",
          period: result.period,
          latestMA,
          recentValues,
          calcDetail: `(${priceDetail}) / ${period} = ${lastNSum.toFixed(4)} / ${period} = ${lastNCalc}`,
          latestTradeDate: lastStockData?.latestTradeDate || null,
        });
      }
      case "MACD": {
        const fast = typeof params.fast === "number" ? params.fast : 12;
        const slow = typeof params.slow === "number" ? params.slow : 26;
        const signal = typeof params.signal === "number" ? params.signal : 9;
        const result = calculateMACD(data, fast, slow, signal);
        const validDif = result.dif.filter((v) => v !== null) as number[];
        const validDea = result.dea.filter((v) => v !== null) as number[];
        const validMacd = result.macd.filter((v) => v !== null) as number[];
        return JSON.stringify({
          indicator: "MACD",
          params: { fast, slow, signal },
          latestDIF: validDif.length > 0 ? validDif[validDif.length - 1] : null,
          latestDEA: validDea.length > 0 ? validDea[validDea.length - 1] : null,
          latestMACD: validMacd.length > 0 ? validMacd[validMacd.length - 1] : null,
          recentDIF: validDif.slice(-30),
          recentDEA: validDea.slice(-30),
          recentMACD: validMacd.slice(-30),
          latestTradeDate: lastStockData?.latestTradeDate || null,
        });
      }
      case "RSI": {
        const rsiPeriod = period || 14;
        const result = calculateRSI(data, rsiPeriod);
        const validValues = result.values.filter((v) => v !== null) as number[];
        const latestRSI = validValues.length > 0 ? validValues[validValues.length - 1] : null;
        return JSON.stringify({
          indicator: "RSI",
          period: rsiPeriod,
          latestRSI,
          recentValues: validValues.slice(-30),
          interpretation: latestRSI !== null ? (latestRSI > 70 ? "超买" : latestRSI < 30 ? "超卖" : "中性") : null,
          latestTradeDate: lastStockData?.latestTradeDate || null,
        });
      }
      case "BB": {
        const bbPeriod = period || 20;
        const stdDev = typeof params.stdDev === "number" ? params.stdDev : 2;
        const result = calculateBollinger(data, bbPeriod, stdDev);
        const validUpper = result.upper.filter((v) => v !== null) as number[];
        const validMiddle = result.middle.filter((v) => v !== null) as number[];
        const validLower = result.lower.filter((v) => v !== null) as number[];
        return JSON.stringify({
          indicator: "BB",
          params: { period: bbPeriod, stdDev },
          latestUpper: validUpper.length > 0 ? validUpper[validUpper.length - 1] : null,
          latestMiddle: validMiddle.length > 0 ? validMiddle[validMiddle.length - 1] : null,
          latestLower: validLower.length > 0 ? validLower[validLower.length - 1] : null,
          recentUpper: validUpper.slice(-30),
          recentMiddle: validMiddle.slice(-30),
          recentLower: validLower.slice(-30),
          latestTradeDate: lastStockData?.latestTradeDate || null,
        });
      }
      case "KDJ": {
        const kdjPeriod = period || 9;
        let highs = ensureData(params, "highs");
        let lows = ensureData(params, "lows");
        let closes = data;

        if ((!highs || !lows) && lastStockData) {
          highs = highs || lastStockData.highs;
          lows = lows || lastStockData.lows;
        }

        if (!highs || !lows) {
          return JSON.stringify({ error: "KDJ需要highs和lows数据，请先获取股票历史数据" });
        }

        const result = calculateKDJ(highs, lows, closes, kdjPeriod);
        const validK = result.k.filter((v) => v !== null) as number[];
        const validD = result.d.filter((v) => v !== null) as number[];
        const validJ = result.j.filter((v) => v !== null) as number[];
        return JSON.stringify({
          indicator: "KDJ",
          period: kdjPeriod,
          latestK: validK.length > 0 ? validK[validK.length - 1] : null,
          latestD: validD.length > 0 ? validD[validD.length - 1] : null,
          latestJ: validJ.length > 0 ? validJ[validJ.length - 1] : null,
          recentK: validK.slice(-30),
          recentD: validD.slice(-30),
          recentJ: validJ.slice(-30),
          latestTradeDate: lastStockData?.latestTradeDate || null,
        });
      }
      default:
        return JSON.stringify({ error: `不支持的指标: ${indicator}。支持: MA/MACD/RSI/BB/KDJ` });
    }
  },
};