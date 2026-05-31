import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const stockComparisonSkill: EnhancedSkillDefinition = {
  name: "stock-comparison",
  description: "股票对比分析：获取多只股票的财务数据和估值指标，多维度打分对比",
  triggerKeywords: ["对比", "比较", "VS", "哪个好", "选股"],
  applicableScenarios: "用户需要对比多只股票的财务和估值表现",
  orchestrationSummary: "获取财务数据→估值指标，跨基本面和技术分析两组",
  typicalQueries: ["五粮液vs格力电器", "对比分析", "哪个更值得买"],
  relatedTools: ["getStockFinancial", "getValuationMetrics"],
  relatedGroups: ["fundamental-data", "technical-analysis"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 45000,
  steps: [
    { tool: "getStockFinancial", params: {} },
    { tool: "getValuationMetrics", params: {} },
  ],
  outputTemplate: `=== 股票对比报告 ===\n\n【财务对比】\n{{steps[0].output}}\n\n【估值对比】\n{{steps[1].output}}`,
};
