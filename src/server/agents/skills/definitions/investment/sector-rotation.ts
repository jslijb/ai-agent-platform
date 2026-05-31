import type { EnhancedSkillDefinition } from "../../enhanced-types";

export const sectorRotationSkill: EnhancedSkillDefinition = {
  name: "sector-rotation",
  description: "板块轮动分析：获取资金流向和行业数据，分析板块热度和轮动趋势",
  triggerKeywords: ["板块轮动", "资金流向", "板块热度", "轮动", "热点板块"],
  applicableScenarios: "用户需要分析板块轮动趋势和资金流向",
  orchestrationSummary: "获取资金流向→行业分类，2步执行",
  typicalQueries: ["白酒板块轮动分析", "资金流向", "热点板块"],
  relatedTools: ["getIndustry"],
  relatedGroups: ["market-data"],
  errorRecovery: { type: "retry", maxRetries: 2 },
  skillCategory: "investment_analysis",
  timeoutMs: 30000,
  steps: [
    { tool: "getIndustry", params: {} },
  ],
  outputTemplate: `=== 板块轮动分析 ===\n\n{{steps[0].output}}`,
};
