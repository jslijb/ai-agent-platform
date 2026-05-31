import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const investmentThesisSkill: EnhancedSkillDefinition = {
  name: "investment-thesis",
  description: "投资论点生成：综合财务数据、估值、公司概况和研报知识，生成看多/看空论点及催化剂",
  triggerKeywords: ["投资论点", "看多", "看空", "买入理由", "催化剂", "投资建议"],
  applicableScenarios: "用户需要生成完整的投资论点，包含看多/看空理由和入场/离场策略",
  orchestrationSummary: "获取财务数据→估值指标→公司概况→知识检索，4步执行",
  typicalQueries: ["五粮液投资论点", "看多理由", "买入逻辑"],
  relatedTools: ["getStockFinancial", "getValuationMetrics", "getCompanyProfile", "hybridSearch"],
  relatedGroups: ["fundamental-data", "knowledge-documents"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 60000,
  steps: [
    { tool: "getStockFinancial", params: {} },
    { tool: "getValuationMetrics", params: {}, parallel: true },
    { tool: "getCompanyProfile", params: {}, parallel: true },
    { tool: "hybridSearch", params: {} },
  ],
  outputTemplate: `=== 投资论点 ===\n\n【财务基础】\n{{steps[0].output}}\n\n【估值水平】\n{{steps[1].output}}\n\n【公司概况】\n{{steps[2].output}}\n\n【研报观点】\n{{steps[3].output}}`,
};
