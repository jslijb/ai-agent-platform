import type { EnhancedSkillDefinition } from "../enhanced-types";

export const complianceCheckSkill: EnhancedSkillDefinition = {
  name: "compliance-check",
  description: "合规检查：对股票持仓进行合规性、受限股票、持仓限制等合规检查",
  triggerKeywords: ["合规", "合规检查", "受限股票", "持仓限制", "合规性"],
  applicableScenarios: "用户需要对股票持仓进行合规性检查，包括交易合规、受限股票、持仓限制",
  orchestrationSummary: "先执行交易合规检查，再并行检查受限股票和持仓限制，最后汇总为合规报告",
  typicalQueries: ["五粮液合规检查", "持仓合规吗", "受限股票"],
  relatedTools: ["checkTradeCompliance", "checkRestrictedStock", "checkPositionLimit"],
  relatedGroups: ["risk-compliance"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "risk_compliance",
  timeoutMs: 30000,
  steps: [
    {
      tool: "checkTradeCompliance",
      params: {},
    },
    {
      tool: "checkRestrictedStock",
      params: {},
      parallel: true,
    },
    {
      tool: "checkPositionLimit",
      params: {},
      parallel: true,
    },
  ],
  outputTemplate: `=== 合规检查报告 ===

【合规状态】
{{steps[0].output}}

【受限股票】
{{steps[1].output}}

【持仓限制】
{{steps[2].output}}`,
};
