import { buildEvaluationSetFromPool } from "@/server/evaluation/historical-query-collector";
import {
  runFinancialEvaluation,
  type FinancialEvaluationReport,
} from "@/server/evaluation/rag-evaluator";

export interface HistoricalEvaluationOptions {
  minPoolSize?: number;
  sampleSize?: number;
  autoLabel?: boolean;
  evaluationLevel?: "daily" | "standard" | "full";
  triggerMode?: "manual" | "auto";
  milestone?: string;
}

export async function runHistoricalEvaluation(
  searchFn: (
    query: string
  ) => Promise<Array<{ text: string; score: number }>>,
  answerFn: (
    query: string,
    searchResults: Array<{ text: string; score: number }>
  ) => Promise<string>,
  options?: HistoricalEvaluationOptions
): Promise<FinancialEvaluationReport> {
  const evaluationLevel = options?.evaluationLevel ?? "standard";
  const triggerMode = options?.triggerMode ?? "manual";
  const milestone = options?.milestone;

  console.log(
    `[历史查询评估] 开始历史查询评估, 评估级别: ${evaluationLevel}, 触发模式: ${triggerMode}`
  );

  const startTime = Date.now();

  try {
    console.log("[历史查询评估] 第一步：从数据池构建评估集");

    const evaluationSet = await buildEvaluationSetFromPool({
      minPoolSize: options?.minPoolSize,
      sampleSize: options?.sampleSize,
      autoLabel: options?.autoLabel,
    });

    if (evaluationSet.length === 0) {
      console.warn("[历史查询评估] 评估集为空，无法执行评估");
      throw new Error("评估集为空，数据池记录不足或无法构建有效评估集");
    }

    console.log(`[历史查询评估] 评估集构建完成, 大小: ${evaluationSet.length}`);

    const autoLabeledCount = evaluationSet.filter((e) => e.autoLabeled).length;
    const manualLabeledCount = evaluationSet.length - autoLabeledCount;

    console.log(
      `[历史查询评估] 评估集详情 - 自动标注: ${autoLabeledCount}, 人工标注: ${manualLabeledCount}`
    );

    const categoryDistribution: Record<string, number> = {};
    for (const item of evaluationSet) {
      categoryDistribution[item.category] = (categoryDistribution[item.category] ?? 0) + 1;
    }
    console.log(
      `[历史查询评估] 分类分布: ${JSON.stringify(categoryDistribution)}`
    );

    console.log("[历史查询评估] 第二步：使用 runFinancialEvaluation 执行评估");

    const testSet = evaluationSet.map((item) => ({
      id: item.id,
      query: item.query,
      expectedAnswer: item.expectedAnswer,
      category: item.category,
      difficulty: item.difficulty,
    }));

    const report = await runFinancialEvaluation(testSet, searchFn, answerFn, {
      evaluationLevel,
      triggerMode,
      milestone,
      dataSource: "historical",
      dataSourceDetail: `历史查询评估集, 总数: ${evaluationSet.length}, 自动标注: ${autoLabeledCount}, 人工标注: ${manualLabeledCount}`,
    });

    const totalDuration = Date.now() - startTime;

    console.log(`[历史查询评估] 历史查询评估完成, 总耗时: ${totalDuration}ms`);
    console.log(
      `[历史查询评估] 综合得分: ${report.financialOverallScore}, 通用得分(Hits@K=${report.avgHitsAtK}, Faithfulness=${report.avgFaithfulness}, AnswerRelevance=${report.avgAnswerRelevance})`
    );
    console.log(
      `[历史查询评估] 金融指标(数值精度=${report.avgNumericalAccuracy}, 合规性=${report.avgComplianceScore}, 幻觉率=${report.avgHallucinationRate}, 风险提示=${report.avgRiskDisclosureScore}, 时效性=${report.avgTimelinessScore})`
    );

    return report;
  } catch (error) {
    console.error("[历史查询评估] 历史查询评估执行失败:", error);
    throw error;
  }
}
