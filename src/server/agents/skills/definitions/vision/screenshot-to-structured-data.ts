import type { EnhancedSkillDefinition } from "../../enhanced-types";
export const screenshotToStructuredDataSkill: EnhancedSkillDefinition = {
  name: "screenshot-to-structured-data",
  description: "研报截图结构化提取：上传研报截图，通过PaddleOCR/Vision提取结构化数据",
  triggerKeywords: ["截图", "研报截图", "结构化", "提取数据", "图片提取"],
  applicableScenarios: "用户上传研报截图，需要提取其中的文字、表格、图表等结构化数据",
  orchestrationSummary: "PaddleOCR解析截图→提取财务数据，2步执行",
  typicalQueries: ["帮我提取这张研报截图的数据", "截图结构化"],
  relatedTools: ["analyzeImage", "extractFinancialData"],
  relatedGroups: ["knowledge-documents"],
  errorRecovery: { type: "fallback", fallbackTool: "analyzeImage" },
  skillCategory: "vision_analysis",
  timeoutMs: 90000,
  steps: [
    { tool: "analyzeImage", params: {} },
    { tool: "extractFinancialData", params: {}, paramRefs: { text: "{{steps[0].output.text}}" } },
  ],
  outputTemplate: `=== 研报截图提取结果 ===\n\n【OCR文本】\n{{steps[0].output}}\n\n【提取的财务数据】\n{{steps[1].output}}`,
};
