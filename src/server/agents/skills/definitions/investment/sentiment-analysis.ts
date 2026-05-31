import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const sentimentAnalysisSkill: EnhancedSkillDefinition = {
  name: "sentiment-analysis",
  description: "市场情绪分析：从知识库检索新闻情绪，结合资金流向数据分析市场情绪",
  triggerKeywords: ["情绪", "市场情绪", "舆情", "新闻", "情绪分析"],
  applicableScenarios: "用户需要分析市场情绪和舆情走势",
  orchestrationSummary: "知识检索→行业数据，跨知识和行情两组",
  typicalQueries: ["五粮液市场情绪", "舆情分析", "最近新闻"],
  relatedTools: ["hybridSearch", "getIndustry"],
  relatedGroups: ["knowledge-documents", "market-data"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 30000,
  steps: [
    { tool: "hybridSearch", params: {} },
    { tool: "getIndustry", params: {} },
  ],
  outputTemplate: `=== 市场情绪分析 ===\n\n【新闻舆情】\n{{steps[0].output}}\n\n【行业数据】\n{{steps[1].output}}`,
};
