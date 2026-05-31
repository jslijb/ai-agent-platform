import type { EnhancedSkillDefinition } from "../enhanced-types";

export const technicalAnalysisSkill: EnhancedSkillDefinition = {
  name: "technical-analysis",
  description: "技术分析：对股票进行MA、MACD、RSI、布林带、KDJ等技术指标综合分析",
  triggerKeywords: ["技术分析", "技术指标", "MA", "MACD", "RSI", "布林带", "KDJ", "均线", "指标分析"],
  applicableScenarios: "用户需要对股票进行技术面综合分析，计算多个技术指标并生成报告",
  orchestrationSummary: "先计算MA均线，再并行计算MACD、RSI、布林带、KDJ，最后汇总为技术分析报告",
  typicalQueries: ["五粮液技术面分析", "帮我分析MA和MACD", "格力电器技术指标"],
  relatedTools: ["calculateMA", "calculateMACD", "calculateRSI", "calculateBollinger", "calculateKDJ"],
  relatedGroups: ["technical-analysis"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 60000,
  steps: [
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
      tool: "calculateBollinger",
      params: {},
      parallel: true,
    },
    {
      tool: "calculateKDJ",
      params: {},
      parallel: true,
    },
  ],
  outputTemplate: `=== 技术分析报告 ===

【均线分析】
{{steps[0].output}}

【MACD分析】
{{steps[1].output}}

【RSI分析】
{{steps[2].output}}

【布林带分析】
{{steps[3].output}}

【KDJ分析】
{{steps[4].output}}`,
};
