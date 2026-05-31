import {
  saveEvaluationVersion,
  getEvaluationVersions,
  type FinancialEvaluationReport as HistoryFinancialReport,
} from "@/server/evaluation/evaluation-history";
import type { FinancialEvaluationReport } from "@/server/evaluation/rag-evaluator";

type SavableReport = HistoryFinancialReport;

export interface MetricDelta {
  name: string;
  baselineValue: number;
  currentValue: number;
  delta: number;
  deltaPercent: number;
  trend: "improved" | "degraded" | "stable";
}

export interface RegressionComparisonResult {
  baselineVersion: number;
  currentVersion: number;
  metrics: MetricDelta[];
  alerts: string[];
  summary: { improved: number; degraded: number; stable: number };
}

const REGRESSION_METRICS: Array<{
  key: keyof FinancialEvaluationReport;
  label: string;
  invertTrend?: boolean;
}> = [
  { key: "avgHitsAtK", label: "Hits@K" },
  { key: "avgContextRelevance", label: "ContextRelevance" },
  { key: "avgContextRecall", label: "ContextRecall" },
  { key: "avgFaithfulness", label: "Faithfulness" },
  { key: "avgAnswerRelevance", label: "AnswerRelevance" },
  { key: "overallScore", label: "OverallScore" },
  { key: "avgNumericalAccuracy", label: "NumericalAccuracy" },
  { key: "avgComplianceScore", label: "ComplianceScore" },
  { key: "avgHallucinationRate", label: "HallucinationRate", invertTrend: true },
  { key: "avgRiskDisclosureScore", label: "RiskDisclosureScore" },
  { key: "avgTimelinessScore", label: "TimelinessScore" },
  { key: "financialOverallScore", label: "FinancialOverallScore" },
];

export async function saveBaseline(
  report: FinancialEvaluationReport
): Promise<number> {
  console.log("[regression-tester] 开始保存评估基线");
  console.log(
    `[regression-tester] 报告信息 - 评估级别: ${report.evaluationLevel}, 数据来源: ${report.dataSource}, 综合评分: ${report.overallScore.toFixed(4)}, 金融综合评分: ${report.financialOverallScore.toFixed(4)}`
  );

  try {
    const savableReport: SavableReport = {
      ...report,
      evaluationType: "rag",
    };
    const id = await saveEvaluationVersion(savableReport);
    console.log(`[regression-tester] 评估基线保存成功, id: ${id}`);
    return id;
  } catch (error) {
    console.error("[regression-tester] 保存评估基线失败:", error);
    throw error;
  }
}

export async function loadBaseline(
  evaluationType?: string
): Promise<FinancialEvaluationReport | null> {
  console.log(
    `[regression-tester] 开始加载评估基线, evaluationType: ${evaluationType ?? "全部"}`
  );

  try {
    const versions = await getEvaluationVersions(
      evaluationType ? { evaluationType } : undefined,
      1
    );

    if (versions.length === 0) {
      console.log("[regression-tester] 未找到任何评估基线记录");
      return null;
    }

    const latest = versions[0];
    console.log(
      `[regression-tester] 找到最近基线, version: ${latest.version}, id: ${latest.id}, timestamp: ${latest.timestamp}, evaluationType: ${latest.evaluationType}`
    );

    if (!latest.reportJson) {
      console.error("[regression-tester] 基线记录缺少 reportJson 字段, 无法还原完整报告");
      return null;
    }

    const report: FinancialEvaluationReport = JSON.parse(latest.reportJson);
    console.log(
      `[regression-tester] 基线报告解析成功, 综合评分: ${report.overallScore.toFixed(4)}, 金融综合评分: ${report.financialOverallScore.toFixed(4)}, 测试数: ${report.totalTests}`
    );

    return report;
  } catch (error) {
    console.error("[regression-tester] 加载评估基线失败:", error);
    throw error;
  }
}

export function compareWithBaseline(
  current: FinancialEvaluationReport,
  baseline: FinancialEvaluationReport,
  threshold: number = 5
): RegressionComparisonResult {
  console.log(
    `[regression-tester] 开始对比当前结果与基线, 阈值: ${threshold}%`
  );
  console.log(
    `[regression-tester] 基线 - 综合评分: ${baseline.overallScore.toFixed(4)}, 金融综合评分: ${baseline.financialOverallScore.toFixed(4)}`
  );
  console.log(
    `[regression-tester] 当前 - 综合评分: ${current.overallScore.toFixed(4)}, 金融综合评分: ${current.financialOverallScore.toFixed(4)}`
  );

  const metrics: MetricDelta[] = [];
  const alerts: string[] = [];
  let improved = 0;
  let degraded = 0;
  let stable = 0;

  for (const metricDef of REGRESSION_METRICS) {
    const baselineValue = baseline[metricDef.key] as number;
    const currentValue = current[metricDef.key] as number;

    if (
      typeof baselineValue !== "number" ||
      typeof currentValue !== "number" ||
      isNaN(baselineValue) ||
      isNaN(currentValue)
    ) {
      console.log(
        `[regression-tester] 跳过指标 ${metricDef.label}, 基线值或当前值无效 (baseline=${baselineValue}, current=${currentValue})`
      );
      continue;
    }

    const delta = currentValue - baselineValue;
    const deltaPercent =
      baselineValue !== 0 ? (delta / Math.abs(baselineValue)) * 100 : 0;

    let trend: MetricDelta["trend"];
    if (metricDef.invertTrend) {
      if (delta > 0) {
        trend = "degraded";
        degraded++;
      } else if (delta < 0) {
        trend = "improved";
        improved++;
      } else {
        trend = "stable";
        stable++;
      }
    } else {
      if (delta > 0) {
        trend = "improved";
        improved++;
      } else if (delta < 0) {
        trend = "degraded";
        degraded++;
      } else {
        trend = "stable";
        stable++;
      }
    }

    const metricDelta: MetricDelta = {
      name: metricDef.label,
      baselineValue,
      currentValue,
      delta,
      deltaPercent,
      trend,
    };
    metrics.push(metricDelta);

    console.log(
      `[regression-tester] 指标对比: ${metricDef.label} - 基线=${baselineValue.toFixed(4)}, 当前=${currentValue.toFixed(4)}, Δ=${delta.toFixed(4)}, Δ%=${deltaPercent.toFixed(1)}%, 趋势=${trend}`
    );

    if (trend === "degraded" && Math.abs(deltaPercent) > threshold) {
      const alertMsg = `${metricDef.label} 下降超过阈值 (${Math.abs(deltaPercent).toFixed(1)}% > ${threshold}%)`;
      alerts.push(alertMsg);
      console.warn(`[regression-tester] ⚠️ 告警: ${alertMsg}`);
    }
  }

  const baselineVersion = (baseline as FinancialEvaluationReport & { version?: number }).version ?? 0;
  const currentVersion = baselineVersion + 1;

  const result: RegressionComparisonResult = {
    baselineVersion,
    currentVersion,
    metrics,
    alerts,
    summary: { improved, degraded, stable },
  };

  console.log(
    `[regression-tester] 对比完成 - 改善: ${improved}, 退化: ${degraded}, 持平: ${stable}, 告警数: ${alerts.length}`
  );

  return result;
}

export function formatRegressionReport(
  comparison: RegressionComparisonResult,
  currentReport: FinancialEvaluationReport,
  baselineReport: FinancialEvaluationReport
): string {
  console.log("[regression-tester] 开始格式化回归测试报告");

  const lines: string[] = [];

  lines.push("=== 回归测试报告 ===");
  lines.push(`评估时间: ${currentReport.timestamp.split("T")[0]}`);

  const baselineDate = baselineReport.timestamp.split("T")[0];
  lines.push(`基线版本: v${comparison.baselineVersion} (${baselineDate})`);
  lines.push(`当前版本: v${comparison.currentVersion}`);
  lines.push("");
  lines.push("指标对比:");

  for (const metric of comparison.metrics) {
    const arrow = metric.trend === "improved" ? "↑" : metric.trend === "degraded" ? "↓" : "→";
    const sign = metric.deltaPercent >= 0 ? "+" : "";
    const paddedName = metric.name.padEnd(18);
    const baselineStr = metric.baselineValue.toFixed(2);
    const currentStr = metric.currentValue.toFixed(2);
    const deltaStr = `${sign}${metric.deltaPercent.toFixed(1)}%`;

    lines.push(
      `  ${paddedName}${baselineStr} → ${currentStr} ${arrow} (${deltaStr})`
    );
  }

  lines.push("");

  if (comparison.alerts.length > 0) {
    for (const alert of comparison.alerts) {
      lines.push(`⚠️ 告警: ${alert}`);
    }
  } else {
    lines.push("✅ 无告警: 所有指标均在阈值范围内");
  }

  const { improved, degraded, stable } = comparison.summary;
  lines.push(
    `✅ 整体评估: ${improved}项改善, ${degraded}项退化, ${stable}项持平`
  );

  const report = lines.join("\n");
  console.log("[regression-tester] 回归测试报告格式化完成");
  return report;
}

export async function runRegressionTest(options?: {
  evaluationLevel?: string;
  threshold?: number;
  searchFn?: (query: string) => Promise<Array<{ text: string; score: number }>>;
  answerFn?: (
    query: string,
    searchResults: Array<{ text: string; score: number }>
  ) => Promise<string>;
  testSet?: Array<{
    id?: number;
    query: string;
    expectedAnswer: string;
    category?: string;
    difficulty?: string;
  }>;
}): Promise<{
  comparison: RegressionComparisonResult;
  report: string;
  currentResult: FinancialEvaluationReport;
  baselineResult: FinancialEvaluationReport | null;
}> {
  const threshold = options?.threshold ?? 5;
  const evaluationLevel = (options?.evaluationLevel ?? "standard") as "daily" | "standard" | "full";

  console.log("[regression-tester] ========== 开始回归测试 ==========");
  console.log(`[regression-tester] 配置 - 评估级别: ${evaluationLevel}, 退化阈值: ${threshold}%`);

  try {
    console.log("[regression-tester] 第一步: 加载上一次评估基线");
    const baseline = await loadBaseline("rag");

    if (!baseline) {
      console.log("[regression-tester] 未找到历史基线, 本次评估将作为初始基线保存, 跳过对比");
    }

    console.log("[regression-tester] 第二步: 运行当前评估");
    if (!options?.searchFn || !options?.answerFn || !options?.testSet) {
      throw new Error("首次运行回归测试需要提供 searchFn, answerFn 和 testSet 参数");
    }

    const { runFinancialEvaluation } = await import(
      "@/server/evaluation/rag-evaluator"
    );

    const currentResult = await runFinancialEvaluation(
      options.testSet,
      options.searchFn,
      options.answerFn,
      {
        evaluationLevel,
        triggerMode: "auto",
        dataSource: "golden",
      }
    );
    console.log(
      `[regression-tester] 当前评估完成, 综合评分: ${currentResult.overallScore.toFixed(4)}, 金融综合评分: ${currentResult.financialOverallScore.toFixed(4)}`
    );

    let comparison: RegressionComparisonResult;
    let report: string;

    if (baseline) {
      console.log("[regression-tester] 第三步: 对比当前结果与基线");
      comparison = compareWithBaseline(currentResult, baseline, threshold);
      report = formatRegressionReport(comparison, currentResult, baseline);
    } else {
      console.log("[regression-tester] 第三步: 无基线可对比, 生成初始报告");
      const emptyMetrics: MetricDelta[] = REGRESSION_METRICS.map((m) => ({
        name: m.label,
        baselineValue: 0,
        currentValue: currentResult[m.key] as number,
        delta: currentResult[m.key] as number,
        deltaPercent: 100,
        trend: "stable" as const,
      }));

      comparison = {
        baselineVersion: 0,
        currentVersion: 1,
        metrics: emptyMetrics,
        alerts: [],
        summary: { improved: 0, degraded: 0, stable: emptyMetrics.length },
      };

      const lines: string[] = [];
      lines.push("=== 回归测试报告 (初始基线) ===");
      lines.push(`评估时间: ${currentResult.timestamp.split("T")[0]}`);
      lines.push(`当前版本: v1 (首次评估)`);
      lines.push("");
      lines.push("当前指标:");
      for (const m of emptyMetrics) {
        lines.push(`  ${m.name.padEnd(18)}${m.currentValue.toFixed(4)}`);
      }
      lines.push("");
      lines.push("ℹ️ 这是首次评估, 结果已保存为初始基线, 后续评估将与此基线对比");
      report = lines.join("\n");
    }

    console.log("[regression-tester] 第四步: 保存当前评估结果为新基线");
    await saveBaseline(currentResult);
    console.log("[regression-tester] 当前评估结果已保存为新基线");

    console.log("[regression-tester] ========== 回归测试完成 ==========");

    return {
      comparison,
      report,
      currentResult,
      baselineResult: baseline,
    };
  } catch (error) {
    console.error("[regression-tester] 回归测试执行失败:", error);
    throw error;
  }
}
