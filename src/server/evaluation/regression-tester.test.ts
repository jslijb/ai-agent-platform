import {
  compareWithBaseline,
  formatRegressionReport,
  type MetricDelta,
  type RegressionComparisonResult,
} from "@/server/evaluation/regression-tester";
import type { FinancialEvaluationReport } from "@/server/evaluation/rag-evaluator";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[TEST FAILED] ${message}`);
    failed++;
  } else {
    console.log(`[TEST PASSED] ${message}`);
    passed++;
  }
}

function createMockReport(overrides: Partial<FinancialEvaluationReport> = {}): FinancialEvaluationReport {
  return {
    timestamp: new Date("2026-05-31T10:00:00.000Z").toISOString(),
    totalTests: 50,
    version: 1,
    avgHitsAtK: 0.85,
    avgContextRelevance: 0.71,
    avgContextRecall: 0.72,
    avgFaithfulness: 0.68,
    avgAnswerRelevance: 0.80,
    overallScore: 0.75,
    avgNumericalAccuracy: 0.55,
    avgComplianceScore: 0.90,
    avgHallucinationRate: 0.12,
    avgRiskDisclosureScore: 0.70,
    avgTimelinessScore: 0.65,
    financialOverallScore: 0.72,
    dataSource: "golden",
    evaluationLevel: "standard",
    triggerMode: "manual",
    resultsByCategory: {},
    resultsByDifficulty: {},
    results: [],
    ...overrides,
  };
}

async function testCompareWithBaselineAllStable() {
  console.log("\n=== 测试 compareWithBaseline - 全部持平 ===");

  const baseline = createMockReport();
  const current = createMockReport();

  const result = compareWithBaseline(current, baseline, 5);

  assert(result.metrics.length > 0, "应有指标对比结果");
  assert(result.summary.stable === result.metrics.length, `所有指标应持平, 实际: stable=${result.summary.stable}, total=${result.metrics.length}`);
  assert(result.summary.improved === 0, `改善数应为0, 实际: ${result.summary.improved}`);
  assert(result.summary.degraded === 0, `退化数应为0, 实际: ${result.summary.degraded}`);
  assert(result.alerts.length === 0, `告警数应为0, 实际: ${result.alerts.length}`);
}

async function testCompareWithBaselineImproved() {
  console.log("\n=== 测试 compareWithBaseline - 指标改善 ===");

  const baseline = createMockReport({ avgHitsAtK: 0.80 });
  const current = createMockReport({ avgHitsAtK: 0.90 });

  const result = compareWithBaseline(current, baseline, 5);

  const hitsMetric = result.metrics.find((m) => m.name === "Hits@K");
  assert(hitsMetric !== undefined, "应找到 Hits@K 指标");
  assert(hitsMetric!.trend === "improved", `Hits@K 应为改善, 实际: ${hitsMetric!.trend}`);
  assert(hitsMetric!.delta > 0, `Hits@K delta 应大于0, 实际: ${hitsMetric!.delta}`);
  assert(result.summary.improved >= 1, `改善数应>=1, 实际: ${result.summary.improved}`);
  assert(result.alerts.length === 0, `改善指标不应产生告警, 实际: ${result.alerts.length}`);
}

async function testCompareWithBaselineDegraded() {
  console.log("\n=== 测试 compareWithBaseline - 指标退化 ===");

  const baseline = createMockReport({ avgFaithfulness: 0.80 });
  const current = createMockReport({ avgFaithfulness: 0.70 });

  const result = compareWithBaseline(current, baseline, 5);

  const faithMetric = result.metrics.find((m) => m.name === "Faithfulness");
  assert(faithMetric !== undefined, "应找到 Faithfulness 指标");
  assert(faithMetric!.trend === "degraded", `Faithfulness 应为退化, 实际: ${faithMetric!.trend}`);
  assert(faithMetric!.delta < 0, `Faithfulness delta 应小于0, 实际: ${faithMetric!.delta}`);
  assert(result.summary.degraded >= 1, `退化数应>=1, 实际: ${result.summary.degraded}`);
  assert(result.alerts.length >= 1, `下降12.5%超过5%阈值应产生告警, 实际: ${result.alerts.length}`);
}

async function testCompareWithBaselineHallucinationInverted() {
  console.log("\n=== 测试 compareWithBaseline - 幻觉率反向指标 ===");

  const baseline = createMockReport({ avgHallucinationRate: 0.10 });
  const current = createMockReport({ avgHallucinationRate: 0.20 });

  const result = compareWithBaseline(current, baseline, 5);

  const hallMetric = result.metrics.find((m) => m.name === "HallucinationRate");
  assert(hallMetric !== undefined, "应找到 HallucinationRate 指标");
  assert(hallMetric!.trend === "degraded", `幻觉率上升应为退化, 实际: ${hallMetric!.trend}`);

  const baseline2 = createMockReport({ avgHallucinationRate: 0.20 });
  const current2 = createMockReport({ avgHallucinationRate: 0.10 });
  const result2 = compareWithBaseline(current2, baseline2, 5);

  const hallMetric2 = result2.metrics.find((m) => m.name === "HallucinationRate");
  assert(hallMetric2!.trend === "improved", `幻觉率下降应为改善, 实际: ${hallMetric2!.trend}`);
}

async function testCompareWithBaselineThreshold() {
  console.log("\n=== 测试 compareWithBaseline - 阈值边界 ===");

  const baseline = createMockReport({ avgComplianceScore: 0.90 });
  const current = createMockReport({ avgComplianceScore: 0.92 });

  const result5 = compareWithBaseline(current, baseline, 5);
  const compMetric5 = result5.metrics.find((m) => m.name === "ComplianceScore");
  assert(compMetric5!.trend === "improved", `0.90→0.92 值上升应为改善, 实际: ${compMetric5!.trend}`);
  assert(result5.alerts.length === 0, `2.2%改善在5%阈值内不应产生告警, 实际: ${result5.alerts.length}`);

  const result1 = compareWithBaseline(current, baseline, 1);
  const compMetric1 = result1.metrics.find((m) => m.name === "ComplianceScore");
  assert(compMetric1!.trend === "improved", `0.90→0.92 值上升应为改善, 实际: ${compMetric1!.trend}`);
  assert(result1.alerts.length === 0, `改善指标不应产生告警, 实际: ${result1.alerts.length}`);

  const baselineDown = createMockReport({ avgComplianceScore: 0.90 });
  const currentDown = createMockReport({ avgComplianceScore: 0.88 });
  const resultDown5 = compareWithBaseline(currentDown, baselineDown, 5);
  const compMetricDown5 = resultDown5.metrics.find((m) => m.name === "ComplianceScore");
  assert(compMetricDown5!.trend === "degraded", `0.90→0.88 值下降应为退化, 实际: ${compMetricDown5!.trend}`);
  assert(resultDown5.alerts.length === 0, `2.2%退化在5%阈值内不应产生告警, 实际: ${resultDown5.alerts.length}`);

  const resultDown1 = compareWithBaseline(currentDown, baselineDown, 1);
  const compMetricDown1 = resultDown1.metrics.find((m) => m.name === "ComplianceScore");
  assert(compMetricDown1!.trend === "degraded", `0.90→0.88 值下降应为退化, 实际: ${compMetricDown1!.trend}`);
  assert(resultDown1.alerts.length >= 1, `2.2%退化超过1%阈值应产生告警, 实际: ${resultDown1.alerts.length}`);
}

async function testCompareWithBaselineMixed() {
  console.log("\n=== 测试 compareWithBaseline - 混合变化 ===");

  const baseline = createMockReport({
    avgHitsAtK: 0.85,
    avgContextRelevance: 0.71,
    avgFaithfulness: 0.68,
    avgNumericalAccuracy: 0.55,
    avgComplianceScore: 0.90,
  });

  const current = createMockReport({
    avgHitsAtK: 0.78,
    avgContextRelevance: 0.74,
    avgFaithfulness: 0.72,
    avgNumericalAccuracy: 0.61,
    avgComplianceScore: 0.88,
  });

  const result = compareWithBaseline(current, baseline, 5);

  assert(result.summary.improved >= 2, `改善数应>=2, 实际: ${result.summary.improved}`);
  assert(result.summary.degraded >= 2, `退化数应>=2, 实际: ${result.summary.degraded}`);
  assert(result.alerts.length >= 1, `告警数应>=1 (Hits@K下降8.2%超过5%阈值), 实际: ${result.alerts.length}`);

  console.log("\n--- 对比详情 ---");
  for (const m of result.metrics) {
    console.log(`  ${m.name}: ${m.baselineValue.toFixed(2)} → ${m.currentValue.toFixed(2)} ${m.trend} (${m.deltaPercent >= 0 ? "+" : ""}${m.deltaPercent.toFixed(1)}%)`);
  }
  console.log("--- 告警 ---");
  for (const a of result.alerts) {
    console.log(`  ⚠️ ${a}`);
  }
}

async function testFormatRegressionReport() {
  console.log("\n=== 测试 formatRegressionReport - 报告格式 ===");

  const baseline = createMockReport({
    timestamp: new Date("2026-05-30T10:00:00.000Z").toISOString(),
    avgHitsAtK: 0.85,
    avgContextRelevance: 0.71,
    avgFaithfulness: 0.68,
    avgNumericalAccuracy: 0.55,
    avgComplianceScore: 0.90,
  });

  const current = createMockReport({
    timestamp: new Date("2026-05-31T10:00:00.000Z").toISOString(),
    avgHitsAtK: 0.82,
    avgContextRelevance: 0.74,
    avgFaithfulness: 0.72,
    avgNumericalAccuracy: 0.61,
    avgComplianceScore: 0.88,
  });

  const comparison = compareWithBaseline(current, baseline, 5);
  const report = formatRegressionReport(comparison, current, baseline);

  assert(report.includes("回归测试报告"), "报告应包含标题");
  assert(report.includes("评估时间: 2026-05-31"), "报告应包含评估时间");
  assert(report.includes("基线版本:"), "报告应包含基线版本");
  assert(report.includes("当前版本:"), "报告应包含当前版本");
  assert(report.includes("指标对比:"), "报告应包含指标对比");
  assert(report.includes("整体评估:"), "报告应包含整体评估");

  console.log("\n--- 生成的报告 ---");
  console.log(report);
}

async function testCompareWithBaselineDeltaPercent() {
  console.log("\n=== 测试 compareWithBaseline - 百分比计算 ===");

  const baseline = createMockReport({ avgHitsAtK: 0.50 });
  const current = createMockReport({ avgHitsAtK: 0.55 });

  const result = compareWithBaseline(current, baseline, 5);

  const hitsMetric = result.metrics.find((m) => m.name === "Hits@K");
  assert(hitsMetric !== undefined, "应找到 Hits@K 指标");
  assert(
    Math.abs(hitsMetric!.deltaPercent - 10) < 0.1,
    `0.50→0.55 应为+10%, 实际: ${hitsMetric!.deltaPercent.toFixed(1)}%`
  );
}

async function main(): Promise<void> {
  console.log("========== 开始回归测试核心逻辑测试 ==========");

  await testCompareWithBaselineAllStable();
  await testCompareWithBaselineImproved();
  await testCompareWithBaselineDegraded();
  await testCompareWithBaselineHallucinationInverted();
  await testCompareWithBaselineThreshold();
  await testCompareWithBaselineMixed();
  await testFormatRegressionReport();
  await testCompareWithBaselineDeltaPercent();

  console.log("\n========== 测试结果 ==========");
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("测试执行失败:", error);
  process.exit(1);
});
