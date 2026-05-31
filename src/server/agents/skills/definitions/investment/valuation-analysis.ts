import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const valuationAnalysisSkill: EnhancedSkillDefinition = {
  name: "valuation-analysis",
  description: "估值分析：获取财务数据、估值指标、行业分类，进行PE/PB/PS等行业对比估值",
  triggerKeywords: ["估值", "PE", "PB", "PS", "估值分析", "市盈率", "市净率"],
  applicableScenarios: "用户需要分析股票估值水平，与行业对比",
  orchestrationSummary: "获取财务数据→估值指标→行业分类，跨基本面和行情两组",
  typicalQueries: ["中国长城估值分析", "PE多少", "估值合理吗"],
  relatedTools: ["getStockFinancial", "getValuationMetrics", "getIndustry"],
  relatedGroups: ["fundamental-data", "market-data"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 45000,
  steps: [
    { tool: "getStockFinancial", params: {} },
    { tool: "getValuationMetrics", params: {}, parallel: true },
    { tool: "getIndustry", params: {} },
  ],
  outputTemplate: `=== 估值分析报告 ===\n\n【财务数据】\n{{steps[0].output}}\n\n【估值指标】\n{{steps[1].output}}\n\n【行业对比】\n{{steps[2].output}}`,
};
