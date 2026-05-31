import type { EnhancedSkillDefinition } from "../../enhanced-types";
export const chartPatternRecognitionSkill: EnhancedSkillDefinition = {
  name: "chart-pattern-recognition",
  description: "K线图表形态识别：上传K线截图，识别技术形态（头肩顶、双底等），关联量化工具输出信号",
  triggerKeywords: ["K线图", "图表", "形态", "头肩顶", "双底", "图表识别", "K线截图"],
  applicableScenarios: "用户上传K线图截图，需要识别技术形态并结合量化指标给出交易信号",
  orchestrationSummary: "Vision识别图表→计算MA→计算MACD→计算RSI，跨知识和技术分析两组",
  typicalQueries: ["帮我看看这张K线图的形态", "K线形态识别"],
  relatedTools: ["analyzeImage", "calculateMA", "calculateMACD", "calculateRSI"],
  relatedGroups: ["knowledge-documents", "technical-analysis"],
  errorRecovery: { type: "fallback", fallbackTool: "hybridSearch" },
  skillCategory: "vision_analysis",
  timeoutMs: 90000,
  steps: [
    { tool: "analyzeImage", params: {} },
    { tool: "calculateMA", params: {} },
    { tool: "calculateMACD", params: {}, parallel: true },
    { tool: "calculateRSI", params: {}, parallel: true },
  ],
  outputTemplate: `=== K线形态分析报告 ===\n\n【图表识别结果】\n{{steps[0].output}}\n\n【MA均线】\n{{steps[1].output}}\n\n【MACD】\n{{steps[2].output}}\n\n【RSI】\n{{steps[3].output}}`,
};
