import type { EnhancedSkillDefinition } from "../enhanced-types";

export const comprehensiveDiagnosisSkill: EnhancedSkillDefinition = {
  name: "comprehensive-diagnosis",
  description: "综合诊断：对股票进行技术分析+合规检查+风控评估的综合诊断",
  triggerKeywords: ["综合诊断", "全面分析", "综合分析", "诊断报告", "全面评估"],
  applicableScenarios: "用户需要对股票进行全面综合诊断，包括技术面、合规和风控评估",
  orchestrationSummary: "先计算技术指标(MA/MACD/RSI)，再检查合规，最后并行计算风控指标(VaR/最大回撤/波动率)",
  typicalQueries: ["五粮液综合诊断", "全面分析", "综合评估"],
  relatedTools: ["calculateMA", "calculateMACD", "calculateRSI", "checkTradeCompliance", "calculateVaR", "calculateMaxDrawdown", "calculateVolatility"],
  relatedGroups: ["technical-analysis", "risk-compliance"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "comprehensive_diagnosis",
  timeoutMs: 90000,
  steps: [
    {
      tool: "technical-analysis",
      params: {},
      subSkillId: "technical-analysis",
    },
    {
      tool: "fundamental-analysis",
      params: {},
      subSkillId: "fundamental-analysis",
    },
    {
      tool: "calculateMA",
      params: {},
    },
    {
      tool: "calculateMACD",
      params: {},
      parallel: true,
    },
    {
      tool: "calculateRSI",
      params: {},
      parallel: true,
    },
    {
      tool: "checkTradeCompliance",
      params: {},
    },
    {
      tool: "calculateVaR",
      params: {},
      parallel: true,
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
  ],
  outputTemplate: `=== 综合诊断报告 ===

【技术面分析 - 子Skill】
{{steps[0].output}}

【基本面分析 - 子Skill】
{{steps[1].output}}

【技术面 - 均线】
{{steps[2].output}}

【技术面 - MACD】
{{steps[3].output}}

【技术面 - RSI】
{{steps[4].output}}

【合规状态】
{{steps[5].output}}

【风控 - VaR】
{{steps[6].output}}

【风控 - 最大回撤】
{{steps[7].output}}

【风控 - 波动率】
{{steps[8].output}}`,
};
