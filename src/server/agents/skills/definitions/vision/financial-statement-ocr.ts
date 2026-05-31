import type { EnhancedSkillDefinition } from "../../enhanced-types";
export const financialStatementOcrSkill: EnhancedSkillDefinition = {
  name: "financial-statement-ocr",
  description: "财报OCR指标计算：上传财报截图，OCR提取字段后自动计算财务比率",
  triggerKeywords: ["财报截图", "财报OCR", "财务指标", "拍照", "报表截图"],
  applicableScenarios: "用户拍照/截图财务报表，需要OCR提取并自动计算比率（资产负债率、ROE等）",
  orchestrationSummary: "双引擎OCR→提取财务字段→计算比率，3步执行",
  typicalQueries: ["帮我算一下这张财报的资产负债率", "财报截图提取"],
  relatedTools: ["analyzeImage", "extractFinancialData"],
  relatedGroups: ["knowledge-documents"],
  errorRecovery: { type: "fallback", fallbackTool: "hybridSearch" },
  skillCategory: "vision_analysis",
  timeoutMs: 90000,
  steps: [
    { tool: "analyzeImage", params: {} },
    { tool: "extractFinancialData", params: {}, paramRefs: { text: "{{steps[0].output.text}}" } },
  ],
  outputTemplate: `=== 财报OCR分析结果 ===\n\n【OCR提取内容】\n{{steps[0].output}}\n\n【财务字段与指标】\n{{steps[1].output}}`,
};
