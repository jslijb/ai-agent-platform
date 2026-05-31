import {
  type DatasetAdapter,
  type UnifiedTestItem,
  loadDataset,
} from "@/server/evaluation/dataset-adapter";
import {
  runFinancialEvaluation,
  type FinancialEvaluationReport,
} from "@/server/evaluation/rag-evaluator";
import { finEvalAdapter } from "@/server/evaluation/adapters/fineval-adapter";
import { cflueAdapter } from "@/server/evaluation/adapters/cflue-adapter";
import { finQAAdapter } from "@/server/evaluation/adapters/finqa-adapter";
import { convFinQAAdapter } from "@/server/evaluation/adapters/convfinqa-adapter";

export const DATASET_ADAPTERS: Record<string, DatasetAdapter> = {
  fineval: finEvalAdapter,
  cflue: cflueAdapter,
  finqa: finQAAdapter,
  convfinqa: convFinQAAdapter,
};

export interface OpenDatasetEvaluationOptions {
  maxSamples?: number;
  categories?: string[];
  evaluationLevel?: "daily" | "standard" | "full";
  triggerMode?: "manual" | "auto";
  milestone?: string;
}

export async function runOpenDatasetEvaluation(
  datasetNames: string[],
  searchFn: (
    query: string
  ) => Promise<Array<{ text: string; score: number }>>,
  answerFn: (
    query: string,
    searchResults: Array<{ text: string; score: number }>
  ) => Promise<string>,
  options?: OpenDatasetEvaluationOptions
): Promise<FinancialEvaluationReport> {
  const evaluationLevel = options?.evaluationLevel ?? "standard";
  const triggerMode = options?.triggerMode ?? "manual";
  const milestone = options?.milestone;

  console.log(
    `[open-dataset-evaluator] 开始开源数据集评估, 数据集: [${datasetNames.join(",")}], 评估级别: ${evaluationLevel}, 触发模式: ${triggerMode}`
  );
  console.log(
    `[open-dataset-evaluator] 评估选项 - 最大样本数: ${options?.maxSamples ?? "无限制"}, 分类过滤: [${options?.categories?.join(",") ?? "无"}]`
  );

  const startTime = Date.now();

  const allItems: UnifiedTestItem[] = [];
  const datasetDetails: string[] = [];

  for (const datasetName of datasetNames) {
    const adapter = DATASET_ADAPTERS[datasetName.toLowerCase()];

    if (!adapter) {
      console.warn(
        `[open-dataset-evaluator] 未知数据集: ${datasetName}, 可用数据集: [${Object.keys(DATASET_ADAPTERS).join(",")}]`
      );
      continue;
    }

    console.log(
      `[open-dataset-evaluator] 加载数据集: ${adapter.name} (${datasetName})`
    );

    try {
      const items = await loadDataset(adapter, {
        maxSamples: options?.maxSamples,
        categories: options?.categories,
      });

      console.log(
        `[open-dataset-evaluator] 数据集 ${adapter.name} 加载成功, 条目数: ${items.length}`
      );

      allItems.push(...items);
      datasetDetails.push(`${adapter.name}: ${items.length}条`);
    } catch (error) {
      console.error(
        `[open-dataset-evaluator] 数据集 ${adapter.name} 加载失败:`,
        error
      );
    }
  }

  if (allItems.length === 0) {
    const errorMsg = "所有数据集加载失败或为空，无法执行评估";
    console.error(`[open-dataset-evaluator] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  console.log(
    `[open-dataset-evaluator] 所有数据集加载完成, 总条目数: ${allItems.length}, 详情: [${datasetDetails.join(", ")}]`
  );

  const testSet = allItems.map((item) => ({
    id: Number(item.id) || 0,
    query: item.query,
    expectedAnswer: item.expectedAnswer,
    category: item.category,
    difficulty: item.difficulty,
  }));

  const dataSourceDetail = `开源数据集评估, 数据集: [${datasetDetails.join(", ")}], 总数: ${allItems.length}`;

  console.log(
    `[open-dataset-evaluator] 开始执行金融评估, 数据来源详情: ${dataSourceDetail}`
  );

  const report = await runFinancialEvaluation(testSet, searchFn, answerFn, {
    evaluationLevel,
    triggerMode,
    milestone,
    dataSource: "opendataset",
    dataSourceDetail,
  });

  const totalDuration = Date.now() - startTime;

  console.log(
    `[open-dataset-evaluator] 开源数据集评估完成, 总耗时: ${totalDuration}ms`
  );
  console.log(
    `[open-dataset-evaluator] 综合得分: ${report.financialOverallScore}, 数据来源: ${report.dataSource}`
  );
  console.log(
    `[open-dataset-evaluator] 通用指标(Hits@K=${report.avgHitsAtK}, Faithfulness=${report.avgFaithfulness}, AnswerRelevance=${report.avgAnswerRelevance})`
  );
  console.log(
    `[open-dataset-evaluator] 金融指标(数值精度=${report.avgNumericalAccuracy}, 合规性=${report.avgComplianceScore}, 幻觉率=${report.avgHallucinationRate}, 风险提示=${report.avgRiskDisclosureScore}, 时效性=${report.avgTimelinessScore})`
  );

  return report;
}
