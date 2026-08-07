import type { ToolDefinition } from "../simpleAgent";

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

export const marketDataTool: ToolDefinition = {
  name: "marketData",
  category: "market-data",
  description:
    "市场数据获取。支持history(历史K线+自动计算MA/RSI/MACD/BB/KDJ)、realtime(实时行情)、financial(财务指标)、financialReport(财务报表)。" +
    "history会缓存数据供技术分析工具使用；financialReport自动补充盈利能力指标。",
  parameters: {
    dataType: {
      type: "string",
      description: "数据类型：history/realtime/financial/financialReport",
      required: true,
    },
    code: {
      type: "string",
      description: "股票代码。history/baostock格式: sh.600036；realtime/efinance格式: 600036",
      required: true,
    },
    frequency: {
      type: "string",
      description: "K线频率（history需要）: d=日K, w=周K, m=月K，默认d",
    },
    source: {
      type: "string",
      description: "数据源: baostock/efinance/mootdx/tushare，默认baostock(history)/efinance(其他)",
    },
    start_date: {
      type: "string",
      description: "开始日期YYYY-MM-DD（history需要，默认最近1年）",
    },
    end_date: {
      type: "string",
      description: "结束日期YYYY-MM-DD（history需要，默认今天）",
    },
    year: {
      type: "number",
      description: "年份（financial+baostock需要）",
    },
    quarter: {
      type: "number",
      description: "季度1-4（financial+baostock需要）",
    },
    report_type: {
      type: "string",
      description: "报表类型（financialReport需要）: income=利润表(默认), balance=资产负债表, cashflow=现金流量表",
    },
  },
  execute: async (params) => {
    const dataType = String(params.dataType || "").toLowerCase();
    const code = String(params.code || "");

    switch (dataType) {
      case "history": {
        const source = String(params.source || "baostock");
        const endDate = String(params.end_date || new Date().toISOString().split("T")[0]);
        let startDate: string;
        if (params.start_date) {
          startDate = String(params.start_date);
        } else {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          startDate = oneYearAgo.toISOString().split("T")[0];
        }
        const frequency = String(params.frequency || "d");

        try {
          const fetchStartTime = Date.now();
          const res = await fetch(`${DATA_SERVICE_URL}/api/market/history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, code, start_date: startDate, end_date: endDate, frequency }),
            signal: AbortSignal.timeout(30000),
          });
          const data = await res.json();
          console.log(`[marketData.history] Data service response: ${((Date.now() - fetchStartTime) / 1000).toFixed(2)}s, success=${data.success}`);
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

          const { setStockDataCache } = await import("./technical-analysis");
          setStockDataCache({ code, closes, highs, lows, volumes, dates, latestTradeDate });

          const latestClose = closes[closes.length - 1];
          const maxClose = Math.max(...closes);
          const minClose = Math.min(...closes);
          const avgVolume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
          const summary = rows.slice(-10).map((r: Record<string, unknown>) =>
            `${r.date || r.tradeDate}: O=${r.open} H=${r.high} L=${r.low} C=${r.close} V=${r.volume}`
          ).join("\n");

          return `Total ${rows.length} records${fromCache}, date range: ${startDate}~${endDate}, latestTradeDate: ${latestTradeDate}\n\nLast 10 K-lines:\n${summary}\n\nKey stats: latestClose=${latestClose}, rangeHigh=${maxClose}, rangeLow=${minClose}, avgVolume=${avgVolume.toFixed(0)}\n\n[Important] Full price data cached. Subsequent technicalAnalysis/riskAnalysis calls do not need data param. When answering, must use latestTradeDate ${latestTradeDate} as data cutoff date.`;
        } catch (error) {
          return "History fetch error: " + (error instanceof Error ? error.message : String(error));
        }
      }
      case "realtime": {
        const source = String(params.source || "efinance");
        try {
          const fetchStartTime = Date.now();
          const res = await fetch(`${DATA_SERVICE_URL}/api/market/realtime`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source, code }),
            signal: AbortSignal.timeout(15000),
          });
          const data = await res.json();
          console.log(`[marketData.realtime] Response: ${((Date.now() - fetchStartTime) / 1000).toFixed(2)}s, success=${data.success}`);
          if (!data.success) return "Failed to get realtime data: " + (data.error || "Unknown error");
          const records = data.data;
          if (!records || !Array.isArray(records) || records.length === 0) return "未查询到实时数据";
          const r = records[0];
          return `Realtime: ${r.股票名称} price=${r.最新价} change=${r.涨跌幅}% open=${r.开盘价} high=${r.最高价} low=${r.最低价} vol=${r.成交量} amount=${r.成交额} turnover=${r.换手率}`;
        } catch (error) {
          return "Realtime fetch error: " + (error instanceof Error ? error.message : String(error));
        }
      }
      case "financial": {
        const source = String(params.source || "efinance");
        const body: Record<string, unknown> = { source, code };
        if (source === "baostock" && params.year) body.year = params.year;
        if (source === "baostock" && params.quarter) body.quarter = params.quarter;
        try {
          const fetchStartTime = Date.now();
          const res = await fetch(`${DATA_SERVICE_URL}/api/market/financial`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          });
          const data = await res.json();
          console.log(`[marketData.financial] Response: ${((Date.now() - fetchStartTime) / 1000).toFixed(2)}s, success=${data.success}`);
          if (!data.success) return "Failed to get financial data: " + (data.error || "Unknown error");
          const rows = data.data || [];
          if (rows.length === 0) return "未查询到财务数据";
          const fromCache = data.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
          return `Financial data${fromCache}:\n${JSON.stringify(rows, null, 2)}`;
        } catch (error) {
          return "Financial data fetch error: " + (error instanceof Error ? error.message : String(error));
        }
      }
      case "financialreport": {
        const reportType = String(params.report_type || "income");
        try {
          const fetchStartTime = Date.now();
          const reportRes = await fetch(`${DATA_SERVICE_URL}/api/market/financial_report`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, report_type: reportType }),
            signal: AbortSignal.timeout(30000),
          });
          const reportData = await reportRes.json();
          console.log(`[marketData.financialReport] Report response: ${((Date.now() - fetchStartTime) / 1000).toFixed(2)}s, success=${reportData.success}`);

          const rows = reportData.data || [];
          const fromCache = reportData.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
          const reportNames: Record<string, string> = { income: "利润表", balance: "资产负债表", cashflow: "现金流量表" };
          const reportName = reportNames[reportType] || "利润表";

          let reportResult = "";
          if (!reportData.success || rows.length === 0) {
            reportResult = `${reportName} fetch failed: ${reportData.error || "No data found"}`;
          } else {
            reportResult = `${reportName}${fromCache} (last ${rows.length} periods):\n${JSON.stringify(rows, null, 2)}`;
          }

          let financialSummary = "";
          try {
            const financialRes = await fetch(`${DATA_SERVICE_URL}/api/market/financial`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source: "efinance", code }),
              signal: AbortSignal.timeout(15000),
            });
            const financialData = await financialRes.json();
            if (financialData.success && Array.isArray(financialData.data) && financialData.data.length > 0) {
              const finCache = financialData.from_cache ? "（来自本地缓存）" : "（来自网络接口）";
              financialSummary = `\n\n[Auto-supplement] Profitability metrics${finCache}:\n${JSON.stringify(financialData.data, null, 2)}`;
            }
          } catch { /* ignore supplement failure */ }

          return `${reportResult}${financialSummary}`;
        } catch (error) {
          return "Financial report fetch error: " + (error instanceof Error ? error.message : String(error));
        }
      }
      default:
        return JSON.stringify({ error: `不支持的数据类型: ${dataType}。支持: history/realtime/financial/financialReport` });
    }
  },
};