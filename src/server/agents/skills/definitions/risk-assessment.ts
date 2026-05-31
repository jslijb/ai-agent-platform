import type { EnhancedSkillDefinition } from "../enhanced-types";

export const riskAssessmentSkill: EnhancedSkillDefinition = {
  name: "risk-assessment",
  description: "风控评估：对股票进行VaR、最大回撤、波动率、压力测试等风险评估",
  triggerKeywords: ["风险评估", "风控", "VaR", "最大回撤", "波动率", "压力测试", "风险限额"],
  applicableScenarios: "用户需要对投资组合进行风险评估，包括VaR、最大回撤、波动率、压力测试",
  orchestrationSummary: "先计算VaR，再并行计算最大回撤和波动率，然后执行压力测试，最后检查风险限额",
  typicalQueries: ["五粮液风险评估", "计算VaR", "压力测试"],
  relatedTools: ["calculateVaR", "calculateMaxDrawdown", "calculateVolatility", "calculateStressTest", "checkRiskLimits"],
  relatedGroups: ["risk-compliance"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "risk_compliance",
  timeoutMs: 60000,
  steps: [
    {
      tool: "calculateVaR",
      params: {},
    },
    {
      tool: "calculateMaxDrawdown",
      params: {},
      parallel: true,
    },
    {
      tool: "calculateVolatility",
      params: {},
      parallel: true,
    },
    {
      tool: "calculateStressTest",
      params: {},
    },
    {
      tool: "checkRiskLimits",
      params: {},
    },
  ],
  outputTemplate: `=== 风控评估报告 ===

【VaR分析】
{{steps[0].output}}

【最大回撤】
{{steps[1].output}}

【波动率】
{{steps[2].output}}

【压力测试】
{{steps[3].output}}

【风险限额】
{{steps[4].output}}`,
};
