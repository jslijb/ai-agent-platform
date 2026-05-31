import type { ToolGroupConfig } from "./types";

export const TOOL_GROUP_CONFIGS: ToolGroupConfig[] = [
  {
    groupId: "market-data",
    groupName: "行情数据组",
    groupResponsibility: "data_acquisition",
    tools: [
      "getStockHistory", "getStockRealtime", "getStockFinancial",
      "getFinancialReport", "getStockList", "getTradeCalendar",
      "getIndustry", "getConcept", "getTickData", "getMinuteData",
    ],
    description: "获取A股市场原始数据，包括K线、实时行情、财务数据、行业分类等",
    priority: 1,
  },
  {
    groupId: "fundamental-data",
    groupName: "基本面数据组",
    groupResponsibility: "data_acquisition",
    tools: [
      "getValuationMetrics", "getCompanyProfile", "getDividendHistory",
      "getEarningsCalendar", "getInsiderTrading", "getShareholderStructure",
    ],
    description: "获取估值指标、公司概况、分红历史、财报日历、内幕交易、股东结构等基本面数据",
    priority: 2,
  },
  {
    groupId: "technical-analysis",
    groupName: "技术分析组",
    groupResponsibility: "data_analysis",
    tools: [
      "calculateMA", "calculateMACD", "calculateRSI",
      "calculateBollinger", "calculateKDJ", "calculateVWAP",
      "calculateSharpeRatio", "calculateMaxDrawdown", "calculateVolatility",
      "calculateCorrelation",
    ],
    description: "计算技术指标和量化信号，包括均线、MACD、RSI、布林带、KDJ等",
    priority: 3,
  },
  {
    groupId: "risk-compliance",
    groupName: "风控合规组",
    groupResponsibility: "data_analysis",
    tools: [
      "checkTradeCompliance", "checkPositionLimit", "checkRestrictedStock",
      "getComplianceReport", "calculateVaR", "calculateStressTest",
      "checkRiskLimits", "generateRiskReport",
    ],
    description: "风险评估与合规检查，包括VaR、压力测试、风险限额、交易合规等",
    priority: 4,
  },
  {
    groupId: "paper-trading",
    groupName: "模拟交易组",
    groupResponsibility: "mixed",
    tools: [
      "createPaperAccount", "getAccount", "placeOrder",
      "getPositions", "getOrderHistory", "getTradeHistory",
    ],
    description: "模拟账户管理和交易操作，包括创建账户、下单、查询持仓和委托等",
    priority: 5,
  },
  {
    groupId: "knowledge-documents",
    groupName: "知识与文档组",
    groupResponsibility: "mixed",
    tools: [
      "hybridSearch", "parsePDF", "extractFinancialData",
      "generateResearchReport", "summarizeDocument",
      "analyzeImage", "extractFromScreenshot",
    ],
    description: "RAG知识检索、文档分析、视觉分析，包括混合检索、PDF解析、图片分析等",
    priority: 6,
  },
];
