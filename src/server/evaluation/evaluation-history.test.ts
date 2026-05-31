import {
  saveEvaluationVersion,
  getEvaluationVersions,
  getEvaluationVersionById,
  compareVersions,
  getTrendData,
  getRadarData,
  getMilestones,
  type FinancialEvaluationReport,
} from "@/server/evaluation/evaluation-history";
import type { AgentEvaluationReport } from "@/server/evaluation/agent-evaluator";
import { db } from "@/server/db/client";
import { evaluationVersions } from "@/server/db/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";

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

const createdIds: number[] = [];

async function cleanup() {
  console.log("\n=== 清理测试数据 ===");
  if (createdIds.length > 0) {
    for (const id of createdIds) {
      try {
        await db.delete(evaluationVersions).where(eq(evaluationVersions.id, id));
        console.log(`[清理] 删除 id=${id}`);
      } catch (e) {
        console.error(`[清理] 删除 id=${id} 失败:`, e);
      }
    }
  }
  console.log(`[清理] 完成, 共删除 ${createdIds.length} 条记录`);
}

async function testSaveRagEvaluationVersion() {
  console.log("\n=== 测试 saveEvaluationVersion (RAG 金融评估) ===");

  const ragReport: FinancialEvaluationReport = {
    timestamp: new Date("2026-05-30T10:00:00.000Z").toISOString(),
    totalTests: 50,
    avgHitsAtK: 0.85,
    avgContextRelevance: 0.78,
    avgContextRecall: 0.72,
    avgFaithfulness: 0.88,
    avgAnswerRelevance: 0.82,
    overallScore: 0.81,
    evaluationType: "rag",
    evaluationLevel: "standard",
    dataSource: "golden",
    dataSourceDetail: "金融黄金数据集v2",
    triggerMode: "manual",
    milestone: "v2.0上线前评估",
    financialOverallScore: 0.79,
    avgNumericalAccuracy: 0.91,
    avgComplianceScore: 0.85,
    avgHallucinationRate: 0.12,
    avgRiskDisclosureScore: 0.76,
    avgTimelinessScore: 0.68,
    resultsByCategory: {},
    resultsByDifficulty: {},
    results: [],
  };

  const id = await saveEvaluationVersion(ragReport);
  createdIds.push(id);
  assert(id > 0, `RAG评估版本保存成功, id=${id}`);

  const saved = await getEvaluationVersionById(id);
  assert(saved !== null, "能通过id查询到保存的版本");
  assert(saved!.evaluationType === "rag", `评估类型应为rag, 实际=${saved!.evaluationType}`);
  assert(saved!.evaluationLevel === "standard", `评估级别应为standard, 实际=${saved!.evaluationLevel}`);
  assert(saved!.dataSource === "golden", `数据来源应为golden, 实际=${saved!.dataSource}`);
  assert(saved!.milestone === "v2.0上线前评估", `里程碑应匹配, 实际=${saved!.milestone}`);
  assert(parseFloat(saved!.overallScore) === 0.81, `综合评分应为0.81, 实际=${saved!.overallScore}`);
  assert(parseFloat(saved!.financialOverallScore!) === 0.79, `金融综合评分应为0.79, 实际=${saved!.financialOverallScore}`);
  assert(parseFloat(saved!.avgNumericalAccuracy!) === 0.91, `数值精确度应为0.91, 实际=${saved!.avgNumericalAccuracy}`);
}

async function testSaveAgentEvaluationVersion() {
  console.log("\n=== 测试 saveEvaluationVersion (Agent 评估) ===");

  const agentReport: AgentEvaluationReport = {
    version: 1,
    timestamp: new Date("2026-05-31T08:00:00.000Z").toISOString(),
    totalTests: 30,
    avgToolSelectionScore: 0.82,
    avgPlanningScore: 0.75,
    avgComplianceScore: 0.90,
    avgConsistencyScore: 0.70,
    avgEfficiencyScore: 0.65,
    agentOverallScore: 0.77,
    dataSource: "historical",
    evaluationLevel: "daily",
    triggerMode: "auto",
    results: [],
  };

  const id = await saveEvaluationVersion(agentReport);
  createdIds.push(id);
  assert(id > 0, `Agent评估版本保存成功, id=${id}`);

  const saved = await getEvaluationVersionById(id);
  assert(saved !== null, "能通过id查询到保存的版本");
  assert(saved!.evaluationType === "agent", `评估类型应为agent, 实际=${saved!.evaluationType}`);
  assert(saved!.evaluationLevel === "daily", `评估级别应为daily, 实际=${saved!.evaluationLevel}`);
  assert(parseFloat(saved!.avgToolSelectionScore!) === 0.82, `工具选择评分应为0.82, 实际=${saved!.avgToolSelectionScore}`);
  assert(parseFloat(saved!.avgPlanningScore!) === 0.75, `规划评分应为0.75, 实际=${saved!.avgPlanningScore}`);
}

async function testGetEvaluationVersions() {
  console.log("\n=== 测试 getEvaluationVersions ===");

  const allVersions = await getEvaluationVersions({}, 50);
  assert(allVersions.length >= 2, `至少应有2条版本记录, 实际=${allVersions.length}`);

  const ragVersions = await getEvaluationVersions({ evaluationType: "rag" });
  assert(ragVersions.every((v) => v.evaluationType === "rag"), "过滤RAG类型应全部为rag");

  const agentVersions = await getEvaluationVersions({ evaluationType: "agent" });
  assert(agentVersions.every((v) => v.evaluationType === "agent"), "过滤Agent类型应全部为agent");

  const filteredByLevel = await getEvaluationVersions({ evaluationLevel: "standard" });
  assert(filteredByLevel.every((v) => v.evaluationLevel === "standard"), "过滤评估级别应全部为standard");

  const filteredByDate = await getEvaluationVersions({
    dateFrom: "2026-05-30",
    dateTo: "2026-05-31T23:59:59.999Z",
  });
  assert(filteredByDate.length >= 2, `日期过滤后至少应有2条记录, 实际=${filteredByDate.length}`);
}

async function testCompareVersions() {
  console.log("\n=== 测试 compareVersions ===");

  if (createdIds.length < 2) {
    console.log("[跳过] 需要至少2个版本才能对比");
    return;
  }

  const comparisons = await compareVersions(createdIds);
  assert(comparisons.length > 0, "对比结果不应为空");
  assert(comparisons[0].metricName === "overallScore", `第一个对比指标应为overallScore, 实际=${comparisons[0].metricName}`);

  const overallComp = comparisons[0];
  assert(overallComp.values.length === createdIds.length, `综合评分对比应有${createdIds.length}个值, 实际=${overallComp.values.length}`);

  for (const comp of comparisons) {
    console.log(`  指标: ${comp.metricLabel} (${comp.metricName})`);
    for (const v of comp.values) {
      const trendStr = v.trend ?? "N/A";
      const deltaStr = v.delta !== null ? v.delta.toFixed(4) : "N/A";
      console.log(`    v${v.version}: value=${v.value}, delta=${deltaStr}, trend=${trendStr}`);
    }
  }
}

async function testGetTrendData() {
  console.log("\n=== 测试 getTrendData ===");

  const trendData = await getTrendData(
    "overallScore",
    "2026-05-01",
    "2026-06-01"
  );
  assert(trendData.length >= 2, `趋势数据至少应有2个点, 实际=${trendData.length}`);

  for (const point of trendData) {
    console.log(`  版本${point.version} (${point.timestamp}): ${point.value}`);
  }

  const hitsTrend = await getTrendData(
    "avgHitsAtK",
    "2026-05-01",
    "2026-06-01"
  );
  assert(hitsTrend.length >= 1, "avgHitsAtK趋势数据至少应有1个点");
}

async function testGetRadarData() {
  console.log("\n=== 测试 getRadarData ===");

  if (createdIds.length === 0) {
    console.log("[跳过] 无可用版本");
    return;
  }

  const ragId = createdIds[0];
  const ragRadar = await getRadarData(ragId);
  assert(ragRadar.length > 0, "RAG雷达图数据不应为空");
  assert(ragRadar[0].metricName === "overallScore", `第一个维度应为overallScore, 实际=${ragRadar[0].metricName}`);

  console.log("  RAG雷达图维度:");
  for (const point of ragRadar) {
    console.log(`    ${point.metricLabel} (${point.metricName}): ${point.value}`);
  }

  if (createdIds.length >= 2) {
    const agentId = createdIds[1];
    const agentRadar = await getRadarData(agentId);
    assert(agentRadar.length > 0, "Agent雷达图数据不应为空");

    const hasAgentMetrics = agentRadar.some(
      (p) => p.metricName === "avgToolSelectionScore"
    );
    assert(hasAgentMetrics, "Agent雷达图应包含工具选择评分维度");

    console.log("  Agent雷达图维度:");
    for (const point of agentRadar) {
      console.log(`    ${point.metricLabel} (${point.metricName}): ${point.value}`);
    }
  }
}

async function testGetMilestones() {
  console.log("\n=== 测试 getMilestones ===");

  const milestones = await getMilestones();
  assert(milestones.length >= 1, `至少应有1个里程碑, 实际=${milestones.length}`);

  const milestoneWithDate = await getMilestones("2026-05-01", "2026-06-01");
  assert(milestoneWithDate.length >= 1, "日期过滤后至少应有1个里程碑");

  for (const m of milestones) {
    console.log(`  v${m.version} (${m.evaluationType}): ${m.milestone}, score=${m.overallScore}`);
  }
}

async function testVersionAutoIncrement() {
  console.log("\n=== 测试版本号自增 ===");

  const report1: FinancialEvaluationReport = {
    timestamp: new Date("2026-05-31T12:00:00.000Z").toISOString(),
    totalTests: 10,
    avgHitsAtK: 0.80,
    avgContextRelevance: 0.75,
    avgContextRecall: 0.70,
    avgFaithfulness: 0.85,
    avgAnswerRelevance: 0.80,
    overallScore: 0.78,
    evaluationType: "rag",
    evaluationLevel: "daily",
    dataSource: "historical",
    triggerMode: "auto",
    financialOverallScore: 0.76,
    avgNumericalAccuracy: 0.88,
    avgComplianceScore: 0.82,
    avgHallucinationRate: 0.15,
    avgRiskDisclosureScore: 0.70,
    avgTimelinessScore: 0.65,
    resultsByCategory: {},
    resultsByDifficulty: {},
    results: [],
  };

  const id1 = await saveEvaluationVersion(report1);
  createdIds.push(id1);

  report1.timestamp = new Date("2026-05-31T13:00:00.000Z").toISOString();
  report1.overallScore = 0.80;
  const id2 = await saveEvaluationVersion(report1);
  createdIds.push(id2);

  const v1 = await getEvaluationVersionById(id1);
  const v2 = await getEvaluationVersionById(id2);
  assert(v2!.version > v1!.version, `版本号应自增, v1=${v1!.version}, v2=${v2!.version}`);
}

async function main() {
  console.log("========================================");
  console.log("  评估历史服务测试");
  console.log("========================================");

  try {
    await testSaveRagEvaluationVersion();
    await testSaveAgentEvaluationVersion();
    await testGetEvaluationVersions();
    await testCompareVersions();
    await testGetTrendData();
    await testGetRadarData();
    await testGetMilestones();
    await testVersionAutoIncrement();
  } catch (error) {
    console.error("\n[测试异常]:", error);
  } finally {
    await cleanup();
  }

  console.log("\n========================================");
  console.log(`  测试结果: 通过=${passed}, 失败=${failed}`);
  console.log("========================================");

  process.exit(failed > 0 ? 1 : 0);
}

main();
