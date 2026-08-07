import {
  calculateVWAP,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateVolatility,
  calculateCorrelation,
} from "@/server/mcp/tools/quant_analysis";
import { calculateVaR } from "@/server/mcp/tools/risk_control";
import type { ToolDefinition } from "../simpleAgent";
import { getStockDataCache, setStockDataCache } from "./technical-analysis";

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

async function fetchStockDataForRisk(code: string): Promise<{
  closes: number[];
  volumes: number[];
  dates: string[];
} | null> {
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
    const volumes: number[] = [];
    const dates: string[] = [];
    for (const item of result.data) {
      if (item.close != null) closes.push(Number(item.close));
      if (item.volume != null) volumes.push(Number(item.volume));
      if (item.date) dates.push(String(item.date));
    }

    setStockDataCache({
      code,
      closes,
      highs: [],
      lows: [],
      volumes,
      dates,
      latestTradeDate: dates.length > 0 ? dates[dates.length - 1] : null,
    });

    return { closes, volumes, dates };
  } catch (error) {
    console.error("[riskAnalysis] Auto-fetch failed:", error);
    return null;
  }
}

function computeReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

export const riskAnalysisTool: ToolDefinition = {
  name: "riskAnalysis",
  category: "risk-analysis",
  description:
    "风险分析指标计算。支持VWAP(成交量加权价)、Sharpe(夏普比率)、MaxDrawdown(最大回撤)、Volatility(波动率)、Correlation(相关性)、VaR(在险价值)。" +
    "如已调用getStockHistory可不传数据参数；如未获取数据，传入code参数自动获取。",
  parameters: {
    metric: {
      type: "string",
      description: "指标类型：VWAP/Sharpe/MaxDrawdown/Volatility/Correlation/VaR",
      required: true,
    },
    code: {
      type: "string",
      description: "股票代码（如sh.600036），未获取过数据时自动获取",
    },
    code2: {
      type: "string",
      description: "第二只股票代码（仅Correlation需要）",
    },
    riskFreeRate: {
      type: "number",
      description: "无风险利率（Sharpe需要，默认0.03）",
    },
    confidence: {
      type: "number",
      description: "置信水平（VaR需要，如0.95/0.99）",
    },
    horizon: {
      type: "number",
      description: "时间跨度天数（VaR需要，默认1）",
    },
    annualize: {
      type: "boolean",
      description: "是否年化（Volatility需要，默认true）",
    },
  },
  execute: async (params) => {
    const metric = String(params.metric || "").toUpperCase();
    const cache = getStockDataCache();

    switch (metric) {
      case "VWAP": {
        let closes: number[] | null = null;
        let volumes: number[] | null = null;

        if (cache && cache.closes.length > 0 && cache.volumes.length > 0) {
          closes = cache.closes;
          volumes = cache.volumes;
        } else if (params.code) {
          const data = await fetchStockDataForRisk(String(params.code));
          if (data) { closes = data.closes; volumes = data.volumes; }
        }

        if (!closes || !volumes) return JSON.stringify({ error: "VWAP需要closes和volumes数据，请传入code或先调用getStockHistory" });

        const vwap = calculateVWAP(closes, volumes);
        return JSON.stringify({ metric: "VWAP", value: vwap, dataPoints: closes.length, latestTradeDate: cache?.latestTradeDate || null });
      }
      case "SHARPE": {
        let returns: number[] | undefined = params.returns as number[] | undefined;
        if (!returns || !Array.isArray(returns) || returns.length === 0) {
          let closes = cache?.closes;
          if (!closes && params.code) {
            const data = await fetchStockDataForRisk(String(params.code));
            if (data) closes = data.closes;
          }
          if (closes && closes.length > 1) returns = computeReturns(closes);
        }
        if (!returns) return JSON.stringify({ error: "Sharpe需要returns数据或先获取股票历史数据" });

        const riskFreeRate = typeof params.riskFreeRate === "number" ? params.riskFreeRate : 0.03;
        const sharpe = calculateSharpeRatio(returns, riskFreeRate);
        return JSON.stringify({ metric: "Sharpe", value: sharpe, riskFreeRate, dataPoints: returns.length, latestTradeDate: cache?.latestTradeDate || null });
      }
      case "MAXDRAWDOWN": {
        let values: number[] | undefined = params.values as number[] | undefined;
        if (!values || !Array.isArray(values) || values.length === 0) {
          values = cache?.closes;
          if (!values && params.code) {
            const data = await fetchStockDataForRisk(String(params.code));
            if (data) values = data.closes;
          }
        }
        if (!values) return JSON.stringify({ error: "MaxDrawdown需要values数据或先获取股票历史数据" });

        const result = calculateMaxDrawdown(values);
        return JSON.stringify({ metric: "MaxDrawdown", ...result, dataPoints: values.length, latestTradeDate: cache?.latestTradeDate || null });
      }
      case "VOLATILITY": {
        let returns: number[] | undefined = params.returns as number[] | undefined;
        if (!returns || !Array.isArray(returns) || returns.length === 0) {
          let closes = cache?.closes;
          if (!closes && params.code) {
            const data = await fetchStockDataForRisk(String(params.code));
            if (data) closes = data.closes;
          }
          if (closes && closes.length > 1) returns = computeReturns(closes);
        }
        if (!returns) return JSON.stringify({ error: "Volatility需要returns数据或先获取股票历史数据" });

        const annualize = params.annualize !== false;
        const vol = calculateVolatility(returns, annualize);
        return JSON.stringify({ metric: "Volatility", value: vol, annualized: annualize, dataPoints: returns.length, latestTradeDate: cache?.latestTradeDate || null });
      }
      case "CORRELATION": {
        const code1 = String(params.code || "");
        const code2 = String(params.code2 || "");
        if (!code1 || !code2) return JSON.stringify({ error: "Correlation需要code和code2参数" });

        let series1: number[] | undefined = params.series1 as number[] | undefined;
        let series2: number[] | undefined = params.series2 as number[] | undefined;

        if (!series1 || !Array.isArray(series1)) {
          let c1 = cache?.closes;
          if (!c1) { const d = await fetchStockDataForRisk(code1); if (d) c1 = d.closes; }
          if (c1 && c1.length > 1) series1 = computeReturns(c1);
        }
        if (!series2 || !Array.isArray(series2)) {
          const d2 = await fetchStockDataForRisk(code2);
          if (d2 && d2.closes.length > 1) series2 = computeReturns(d2.closes);
        }

        if (!series1 || !series2) return JSON.stringify({ error: "Correlation无法获取两只股票的数据" });

        const corr = calculateCorrelation(series1, series2);
        return JSON.stringify({ metric: "Correlation", value: corr, code1, code2, dataPoints: Math.min(series1.length, series2.length) });
      }
      case "VAR": {
        let returns: number[] | undefined = params.returns as number[] | undefined;
        if (!returns || !Array.isArray(returns) || returns.length === 0) {
          let closes = cache?.closes;
          if (!closes && params.code) {
            const data = await fetchStockDataForRisk(String(params.code));
            if (data) closes = data.closes;
          }
          if (closes && closes.length > 1) returns = computeReturns(closes);
        }
        if (!returns) return JSON.stringify({ error: "VaR需要returns数据或先获取股票历史数据" });

        const confidence = typeof params.confidence === "number" ? params.confidence : 0.95;
        const horizon = typeof params.horizon === "number" ? params.horizon : 1;
        const varResult = calculateVaR({ returns, confidence, horizon });
        return JSON.stringify({ metric: "VaR", value: varResult, confidence, horizon, dataPoints: returns.length, latestTradeDate: cache?.latestTradeDate || null });
      }
      default:
        return JSON.stringify({ error: `不支持的指标: ${metric}。支持: VWAP/Sharpe/MaxDrawdown/Volatility/Correlation/VaR` });
    }
  },
};