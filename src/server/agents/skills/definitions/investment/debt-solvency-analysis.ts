import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const debtSolvencyAnalysisSkill: EnhancedSkillDefinition = {
  name: "debt-solvency-analysis",
  description: "偿债能力分析：获取财务数据和估值指标，计算资产负债率、流动比率、速动比率等偿债指标",
  triggerKeywords: ["偿债能力", "资产负债率", "流动比率", "速动比率", "偿债", "债务"],
  applicableScenarios: "用户需要分析公司偿债能力，计算资产负债率等指标",
  orchestrationSummary: "获取财务数据→估值指标→计算偿债比率，3步执行",
  typicalQueries: ["五粮液2025年资产负债率是多少", "分析偿债能力", "流动比率"],
  relatedTools: ["getStockFinancial", "getValuationMetrics"],
  relatedGroups: ["fundamental-data"],
  errorRecovery: { type: "retry", maxRetries: 2, fallbackTool: "hybridSearch" },
  skillCategory: "investment_analysis",
  timeoutMs: 45000,
  steps: [
    { tool: "getStockFinancial", params: {} },
    { tool: "getValuationMetrics", params: {} },
  ],
  outputTemplate: `=== 偿债能力分析报告 ===\n\n【财务数据】\n{{steps[0].output}}\n\n【估值指标】\n{{steps[1].output}}`,
};
