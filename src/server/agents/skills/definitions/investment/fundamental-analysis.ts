import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const fundamentalAnalysisSkill: EnhancedSkillDefinition = {
  name: "fundamental-analysis",
  description: "基本面综合分析：获取财务数据、估值指标、公司概况、分红历史，全面评估公司基本面",
  triggerKeywords: ["基本面", "基本面分析", "财务分析", "公司分析", "盈利能力"],
  applicableScenarios: "用户需要全面了解公司基本面状况，包括财务健康、估值、分红等",
  orchestrationSummary: "获取财务数据→估值指标→公司概况→分红历史，4步串行执行",
  typicalQueries: ["五粮液基本面分析", "格力电器财务分析"],
  relatedTools: ["getStockFinancial", "getValuationMetrics", "getCompanyProfile", "getDividendHistory"],
  relatedGroups: ["fundamental-data"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 60000,
  steps: [
    { tool: "getStockFinancial", params: {} },
    { tool: "getValuationMetrics", params: {}, parallel: true },
    { tool: "getCompanyProfile", params: {}, parallel: true },
    { tool: "getDividendHistory", params: {} },
  ],
  outputTemplate: `=== 基本面分析报告 ===\n\n【财务数据】\n{{steps[0].output}}\n\n【估值指标】\n{{steps[1].output}}\n\n【公司概况】\n{{steps[2].output}}\n\n【分红历史】\n{{steps[3].output}}`,
};
