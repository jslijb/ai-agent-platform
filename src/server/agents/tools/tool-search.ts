import type { ToolDefinition } from "../simpleAgent";

interface ToolDetail {
  name: string;
  category: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean; items?: { type: string } }>;
  usageTips: string;
  examples: string[];
}

const TOOL_CATALOG: Record<string, ToolDetail> = {
  technicalAnalysis: {
    name: "technicalAnalysis",
    category: "technical-analysis",
    description: "技术指标计算。支持MA(移动平均)、MACD、RSI(相对强弱)、BB(布林带)、KDJ(随机指标)。",
    parameters: {
      indicator: { type: "string", description: "指标类型：MA/MACD/RSI/BB/KDJ", required: true },
      code: { type: "string", description: "股票代码（如sh.600036），未获取过数据时自动获取" },
      period: { type: "number", description: "计算周期（MA/RSI/BB/KDJ需要），如5/10/14/20" },
      data: { type: "array", items: { type: "number" }, description: "价格序列（可选，优先使用缓存或自动获取）" },
    },
    usageTips: "如已调用marketData(history)可不传data参数，自动使用缓存；如未获取数据，传入code参数自动获取。MA/RSI/BB需period参数，MACD可选fast/slow/signal。",
    examples: [
      '{"indicator":"MA","code":"sh.600036","period":5}',
      '{"indicator":"MACD","code":"sh.600036"}',
      '{"indicator":"RSI","code":"sh.600036","period":14}',
    ],
  },
  riskAnalysis: {
    name: "riskAnalysis",
    category: "risk-analysis",
    description: "风险分析指标计算。支持VWAP/Sharpe/MaxDrawdown/Volatility/Correlation/VaR。",
    parameters: {
      metric: { type: "string", description: "指标类型：VWAP/Sharpe/MaxDrawdown/Volatility/Correlation/VaR", required: true },
      code: { type: "string", description: "股票代码（如sh.600036），未获取过数据时自动获取" },
      code2: { type: "string", description: "第二只股票代码（仅Correlation需要）" },
      riskFreeRate: { type: "number", description: "无风险利率（Sharpe需要，默认0.03）" },
      confidence: { type: "number", description: "置信水平（VaR需要，如0.95/0.99）" },
      horizon: { type: "number", description: "时间跨度天数（VaR需要，默认1）" },
    },
    usageTips: "VWAP需closes+volumes，Sharpe/Volatility/VaR需returns或closes，Correlation需code+code2。传入code可自动获取数据。",
    examples: [
      '{"metric":"VWAP","code":"sh.600036"}',
      '{"metric":"Sharpe","code":"sh.600036","riskFreeRate":0.03}',
      '{"metric":"Correlation","code":"sh.600036","code2":"sz.000858"}',
    ],
  },
  complianceCheck: {
    name: "complianceCheck",
    category: "risk-compliance",
    description: "合规与风控检查。支持trade/position/restricted/riskLimits/stressTest/complianceReport/riskReport。",
    parameters: {
      checkType: { type: "string", description: "检查类型：trade/position/restricted/riskLimits/stressTest/complianceReport/riskReport", required: true },
      code: { type: "string", description: "股票代码（trade/restricted需要）" },
      direction: { type: "string", description: "交易方向 buy/sell（trade需要）" },
      quantity: { type: "number", description: "数量（trade/position需要）" },
      price: { type: "number", description: "价格（trade需要）" },
      prevClose: { type: "number", description: "前收盘价（trade需要）" },
      accountId: { type: "string", description: "账户ID（position/riskLimits需要）" },
    },
    usageTips: "trade需code+direction+quantity+price+prevClose；position需accountId+code+quantity+totalAssets；restricted只需code。",
    examples: [
      '{"checkType":"trade","code":"sh.600036","direction":"buy","quantity":100,"price":35.5,"prevClose":35.0}',
      '{"checkType":"restricted","code":"sh.600036"}',
    ],
  },
  marketData: {
    name: "marketData",
    category: "market-data",
    description: "市场数据获取。支持history(历史K线)、realtime(实时行情)、financial(财务指标)、financialReport(财务报表)。",
    parameters: {
      dataType: { type: "string", description: "数据类型：history/realtime/financial/financialReport", required: true },
      code: { type: "string", description: "股票代码", required: true },
      frequency: { type: "string", description: "K线频率（history）: d/w/m" },
      source: { type: "string", description: "数据源: baostock/efinance/mootdx/tushare" },
      start_date: { type: "string", description: "开始日期YYYY-MM-DD（history）" },
      end_date: { type: "string", description: "结束日期YYYY-MM-DD（history）" },
      report_type: { type: "string", description: "报表类型（financialReport）: income/balance/cashflow" },
    },
    usageTips: "history会缓存数据供技术分析工具使用；realtime用efinance格式(无前缀)；financial默认efinance；financialReport自动补充盈利指标。",
    examples: [
      '{"dataType":"history","code":"sh.600036","frequency":"d"}',
      '{"dataType":"realtime","code":"600036"}',
      '{"dataType":"financial","code":"600519"}',
      '{"dataType":"financialReport","code":"600519","report_type":"income"}',
    ],
  },
  hybridSearch: {
    name: "hybridSearch",
    category: "knowledge-documents",
    description: "RAG混合检索工具。使用稠密+稀疏检索RRF融合粗排，再bge-reranker精排，从知识库检索文档片段。",
    parameters: {
      query: { type: "string", description: "搜索查询文本", required: true },
      topK: { type: "number", description: "返回结果数量，默认10" },
    },
    usageTips: "适用于查找公司财报、行业分析、政策法规等文档内容。查询应具体明确。",
    examples: [
      '{"query":"招商银行2024年营收"}',
    ],
  },
};

export const toolSearchTool: ToolDefinition = {
  name: "toolSearch",
  category: "meta",
  description:
    "工具搜索。当不确定某个工具的详细参数或用法时，传入工具名获取完整说明、参数定义和使用示例。" +
    "可用工具：technicalAnalysis/riskAnalysis/complianceCheck/marketData/hybridSearch。",
  parameters: {
    toolName: {
      type: "string",
      description: "工具名称：technicalAnalysis/riskAnalysis/complianceCheck/marketData/hybridSearch",
      required: true,
    },
  },
  execute: (params) => {
    const toolName = String(params.toolName || "").trim();
    const detail = TOOL_CATALOG[toolName];
    if (!detail) {
      const available = Object.keys(TOOL_CATALOG).join(", ");
      return JSON.stringify({ error: `未找到工具: ${toolName}。可用工具: ${available}` });
    }
    return JSON.stringify({
      name: detail.name,
      category: detail.category,
      description: detail.description,
      parameters: detail.parameters,
      usageTips: detail.usageTips,
      examples: detail.examples,
    }, null, 2);
  },
};

export { TOOL_CATALOG };