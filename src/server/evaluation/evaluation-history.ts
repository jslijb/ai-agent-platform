import { db, sql } from "@/server/db/client";
import { evaluationVersions } from "@/server/db/schema";
import { eq, desc, and, gte, lte, sql as drizzleSql } from "drizzle-orm";
import type { AgentEvaluationReport } from "@/server/evaluation/agent-evaluator";
import type { EvaluationReport } from "@/server/evaluation/rag-evaluator";

export interface FinancialEvaluationReport extends EvaluationReport {
  evaluationType: "rag";
  evaluationLevel: "daily" | "standard" | "full";
  dataSource: "golden" | "historical" | "opendataset" | "mixed";
  dataSourceDetail?: string;
  triggerMode: "manual" | "auto";
  milestone?: string;
  financialOverallScore: number;
  avgNumericalAccuracy: number;
  avgComplianceScore: number;
  avgHallucinationRate: number;
  avgRiskDisclosureScore: number;
  avgTimelinessScore: number;
}

type EvaluationReportInput = FinancialEvaluationReport | AgentEvaluationReport;

const METRIC_COLUMNS = [
  "avgHitsAtK",
  "avgContextRelevance",
  "avgContextRecall",
  "avgFaithfulness",
  "avgAnswerRelevance",
  "avgNumericalAccuracy",
  "avgComplianceScore",
  "avgHallucinationRate",
  "avgRiskDisclosureScore",
  "avgTimelinessScore",
  "avgToolSelectionScore",
  "avgPlanningScore",
  "avgAgentComplianceScore",
  "avgConsistencyScore",
  "avgEfficiencyScore",
] as const;

type MetricName = (typeof METRIC_COLUMNS)[number];

const METRIC_LABELS: Record<MetricName, string> = {
  avgHitsAtK: "检索命中率",
  avgContextRelevance: "上下文相关性",
  avgContextRecall: "上下文召回率",
  avgFaithfulness: "忠实度",
  avgAnswerRelevance: "答案相关性",
  avgNumericalAccuracy: "数值精确度",
  avgComplianceScore: "合规性评分",
  avgHallucinationRate: "幻觉率",
  avgRiskDisclosureScore: "风险披露评分",
  avgTimelinessScore: "时效性评分",
  avgToolSelectionScore: "工具选择评分",
  avgPlanningScore: "规划评分",
  avgAgentComplianceScore: "Agent合规评分",
  avgConsistencyScore: "一致性评分",
  avgEfficiencyScore: "效率评分",
};

const RAG_RADAR_METRICS: MetricName[] = [
  "avgHitsAtK",
  "avgContextRelevance",
  "avgContextRecall",
  "avgFaithfulness",
  "avgAnswerRelevance",
  "avgNumericalAccuracy",
  "avgComplianceScore",
  "avgHallucinationRate",
  "avgRiskDisclosureScore",
  "avgTimelinessScore",
];

const AGENT_RADAR_METRICS: MetricName[] = [
  "avgToolSelectionScore",
  "avgPlanningScore",
  "avgAgentComplianceScore",
  "avgConsistencyScore",
  "avgEfficiencyScore",
];

function isAgentReport(report: EvaluationReportInput): report is AgentEvaluationReport {
  return "agentOverallScore" in report && "avgToolSelectionScore" in report;
}

function isFinancialReport(report: EvaluationReportInput): report is FinancialEvaluationReport {
  return "financialOverallScore" in report && "avgNumericalAccuracy" in report;
}

function toNumericStr(value: number | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return value.toFixed(4);
}

export async function saveEvaluationVersion(
  report: EvaluationReportInput
): Promise<number> {
  console.log("[evaluation-history] 开始保存评估版本");

  try {
    const maxVersionResult = await db
      .select({ maxVersion: drizzleSql<number>`COALESCE(MAX(${evaluationVersions.version}), 0)` })
      .from(evaluationVersions);

    const nextVersion = (maxVersionResult[0]?.maxVersion ?? 0) + 1;
    console.log(`[evaluation-history] 计算下一版本号: ${nextVersion}`);

    let evaluationType: string;
    let overallScore: string;
    let financialOverallScore: string | null = null;
    let insertData: typeof evaluationVersions.$inferInsert;

    if (isAgentReport(report)) {
      evaluationType = "agent";
      overallScore = toNumericStr(report.agentOverallScore) ?? "0.0000";
      console.log(`[evaluation-history] 识别为Agent评估报告, 综合评分: ${overallScore}`);

      insertData = {
        version: nextVersion,
        timestamp: report.timestamp,
        evaluationType,
        evaluationLevel: report.evaluationLevel,
        dataSource: report.dataSource,
        triggerMode: report.triggerMode,
        milestone: report.milestone ?? null,
        totalTests: report.totalTests,
        overallScore,
        financialOverallScore,
        avgToolSelectionScore: toNumericStr(report.avgToolSelectionScore),
        avgPlanningScore: toNumericStr(report.avgPlanningScore),
        avgAgentComplianceScore: toNumericStr(report.avgComplianceScore),
        avgConsistencyScore: toNumericStr(report.avgConsistencyScore),
        avgEfficiencyScore: toNumericStr(report.avgEfficiencyScore),
        reportJson: JSON.stringify(report),
      };
    } else if (isFinancialReport(report)) {
      evaluationType = "rag";
      overallScore = toNumericStr(report.overallScore) ?? "0.0000";
      financialOverallScore = toNumericStr(report.financialOverallScore);
      console.log(`[evaluation-history] 识别为RAG金融评估报告, 综合评分: ${overallScore}, 金融综合评分: ${financialOverallScore}`);

      insertData = {
        version: nextVersion,
        timestamp: report.timestamp,
        evaluationType,
        evaluationLevel: report.evaluationLevel,
        dataSource: report.dataSource,
        dataSourceDetail: report.dataSourceDetail ?? null,
        triggerMode: report.triggerMode,
        milestone: report.milestone ?? null,
        totalTests: report.totalTests,
        overallScore,
        financialOverallScore,
        avgHitsAtK: toNumericStr(report.avgHitsAtK),
        avgContextRelevance: toNumericStr(report.avgContextRelevance),
        avgContextRecall: toNumericStr(report.avgContextRecall),
        avgFaithfulness: toNumericStr(report.avgFaithfulness),
        avgAnswerRelevance: toNumericStr(report.avgAnswerRelevance),
        avgNumericalAccuracy: toNumericStr(report.avgNumericalAccuracy),
        avgComplianceScore: toNumericStr(report.avgComplianceScore),
        avgHallucinationRate: toNumericStr(report.avgHallucinationRate),
        avgRiskDisclosureScore: toNumericStr(report.avgRiskDisclosureScore),
        avgTimelinessScore: toNumericStr(report.avgTimelinessScore),
        reportJson: JSON.stringify(report),
      };
    } else {
      evaluationType = "rag";
      const ragReport = report as EvaluationReport;
      overallScore = toNumericStr(ragReport.overallScore) ?? "0.0000";
      console.log(`[evaluation-history] 识别为基础RAG评估报告, 综合评分: ${overallScore}`);

      insertData = {
        version: nextVersion,
        timestamp: ragReport.timestamp,
        evaluationType,
        evaluationLevel: "standard",
        dataSource: "golden",
        triggerMode: "manual",
        totalTests: ragReport.totalTests,
        overallScore,
        avgHitsAtK: toNumericStr(ragReport.avgHitsAtK),
        avgContextRelevance: toNumericStr(ragReport.avgContextRelevance),
        avgContextRecall: toNumericStr(ragReport.avgContextRecall),
        avgFaithfulness: toNumericStr(ragReport.avgFaithfulness),
        avgAnswerRelevance: toNumericStr(ragReport.avgAnswerRelevance),
        reportJson: JSON.stringify(ragReport),
      };
    }

    const result = await db.insert(evaluationVersions).values(insertData).returning({ id: evaluationVersions.id });

    console.log(`[evaluation-history] 评估版本保存成功, id: ${result[0].id}, version: ${nextVersion}, type: ${evaluationType}`);
    return result[0].id;
  } catch (error) {
    console.error("[evaluation-history] 保存评估版本失败:", error);
    throw error;
  }
}

export interface EvaluationVersionFilters {
  evaluationType?: string;
  evaluationLevel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getEvaluationVersions(
  filters?: EvaluationVersionFilters,
  limit: number = 20
) {
  console.log(`[evaluation-history] 查询评估版本列表, filters: ${JSON.stringify(filters)}, limit: ${limit}`);

  try {
    const conditions = [];

    if (filters?.evaluationType) {
      conditions.push(eq(evaluationVersions.evaluationType, filters.evaluationType));
      console.log(`[evaluation-history] 添加过滤条件 - 评估类型: ${filters.evaluationType}`);
    }
    if (filters?.evaluationLevel) {
      conditions.push(eq(evaluationVersions.evaluationLevel, filters.evaluationLevel));
      console.log(`[evaluation-history] 添加过滤条件 - 评估级别: ${filters.evaluationLevel}`);
    }
    if (filters?.dateFrom) {
      conditions.push(gte(evaluationVersions.timestamp, filters.dateFrom));
      console.log(`[evaluation-history] 添加过滤条件 - 起始时间: ${filters.dateFrom}`);
    }
    if (filters?.dateTo) {
      conditions.push(lte(evaluationVersions.timestamp, filters.dateTo));
      console.log(`[evaluation-history] 添加过滤条件 - 截止时间: ${filters.dateTo}`);
    }

    const query = conditions.length > 0
      ? db.select().from(evaluationVersions).where(and(...conditions)).orderBy(desc(evaluationVersions.version)).limit(limit)
      : db.select().from(evaluationVersions).orderBy(desc(evaluationVersions.version)).limit(limit);

    const results = await query;
    console.log(`[evaluation-history] 查询完成, 返回 ${results.length} 条记录`);
    return results;
  } catch (error) {
    console.error("[evaluation-history] 查询评估版本列表失败:", error);
    throw error;
  }
}

export async function getEvaluationVersionById(id: number) {
  console.log(`[evaluation-history] 查询评估版本详情, id: ${id}`);

  try {
    const result = await db
      .select()
      .from(evaluationVersions)
      .where(eq(evaluationVersions.id, id))
      .limit(1);

    if (result.length === 0) {
      console.log(`[evaluation-history] 未找到 id=${id} 的评估版本`);
      return null;
    }

    console.log(`[evaluation-history] 查询成功, id: ${id}, version: ${result[0].version}, type: ${result[0].evaluationType}`);
    return result[0];
  } catch (error) {
    console.error(`[evaluation-history] 查询评估版本详情失败, id: ${id}:`, error);
    throw error;
  }
}

export interface MetricComparison {
  metricName: string;
  metricLabel: string;
  values: Array<{
    versionId: number;
    version: number;
    value: number | null;
    delta: number | null;
    trend: "↑" | "↓" | "→" | null;
  }>;
}

export async function compareVersions(versionIds: number[]) {
  console.log(`[evaluation-history] 开始版本对比, versionIds: [${versionIds.join(", ")}]`);

  try {
    const versions = await db
      .select()
      .from(evaluationVersions)
      .where(
        drizzleSql`${evaluationVersions.id} IN (${drizzleSql.join(versionIds.map(id => drizzleSql`${id}`), drizzleSql`, `)})`
      )
      .orderBy(evaluationVersions.version);

    console.log(`[evaluation-history] 查询到 ${versions.length} 个版本用于对比`);

    if (versions.length === 0) {
      console.log("[evaluation-history] 无可用版本进行对比");
      return [];
    }

    const comparisons: MetricComparison[] = METRIC_COLUMNS.map((metricName) => {
      const metricLabel = METRIC_LABELS[metricName];
      console.log(`[evaluation-history] 对比指标: ${metricLabel} (${metricName})`);

      const values = versions.map((v, idx) => {
        const rawValue = v[metricName as keyof typeof v] as string | null;
        const value = rawValue !== null ? parseFloat(rawValue) : null;

        let delta: number | null = null;
        let trend: "↑" | "↓" | "→" | null = null;

        if (idx > 0 && value !== null) {
          const prevRaw = versions[idx - 1][metricName as keyof (typeof versions)[number]] as string | null;
          const prevValue = prevRaw !== null ? parseFloat(prevRaw) : null;

          if (prevValue !== null) {
            delta = parseFloat((value - prevValue).toFixed(4));
            if (delta > 0.05) {
              trend = "↑";
            } else if (delta < -0.05) {
              trend = "↓";
            } else {
              trend = "→";
            }
            console.log(`[evaluation-history] ${metricLabel} v${versions[idx - 1].version}->v${v.version}: ${prevValue}->${value}, Δ=${delta}, 趋势=${trend}`);
          }
        }

        return {
          versionId: v.id,
          version: v.version,
          value,
          delta,
          trend,
        };
      });

      return {
        metricName,
        metricLabel,
        values,
      };
    });

    const overallComparison: MetricComparison = {
      metricName: "overallScore",
      metricLabel: "综合评分",
      values: versions.map((v, idx) => {
        const value = parseFloat(v.overallScore);
        let delta: number | null = null;
        let trend: "↑" | "↓" | "→" | null = null;

        if (idx > 0) {
          const prevValue = parseFloat(versions[idx - 1].overallScore);
          delta = parseFloat((value - prevValue).toFixed(4));
          if (delta > 0.05) {
            trend = "↑";
          } else if (delta < -0.05) {
            trend = "↓";
          } else {
            trend = "→";
          }
          console.log(`[evaluation-history] 综合评分 v${versions[idx - 1].version}->v${v.version}: ${prevValue}->${value}, Δ=${delta}, 趋势=${trend}`);
        }

        return {
          versionId: v.id,
          version: v.version,
          value,
          delta,
          trend,
        };
      }),
    };

    const result = [overallComparison, ...comparisons];
    console.log(`[evaluation-history] 版本对比完成, 共 ${result.length} 个指标`);
    return result;
  } catch (error) {
    console.error("[evaluation-history] 版本对比失败:", error);
    throw error;
  }
}

export interface TrendDataPoint {
  timestamp: string;
  version: number;
  value: number | null;
}

export async function getTrendData(
  metricName: string,
  dateFrom: string,
  dateTo: string
): Promise<TrendDataPoint[]> {
  console.log(`[evaluation-history] 获取趋势数据, 指标: ${metricName}, 时间范围: ${dateFrom} ~ ${dateTo}`);

  try {
    if (!METRIC_COLUMNS.includes(metricName as MetricName) && metricName !== "overallScore" && metricName !== "financialOverallScore") {
      console.error(`[evaluation-history] 无效的指标名称: ${metricName}`);
      throw new Error(`无效的指标名称: ${metricName}, 有效值为: overallScore, financialOverallScore, ${METRIC_COLUMNS.join(", ")}`);
    }

    const columnName = metricName as keyof typeof evaluationVersions;

    const results = await db
      .select({
        timestamp: evaluationVersions.timestamp,
        version: evaluationVersions.version,
        value: evaluationVersions[columnName] as typeof evaluationVersions.overallScore,
      })
      .from(evaluationVersions)
      .where(
        and(
          gte(evaluationVersions.timestamp, dateFrom),
          lte(evaluationVersions.timestamp, dateTo)
        )
      )
      .orderBy(evaluationVersions.version);

    const trendData: TrendDataPoint[] = results.map((r) => ({
      timestamp: r.timestamp,
      version: r.version,
      value: r.value !== null ? parseFloat(r.value as string) : null,
    }));

    console.log(`[evaluation-history] 趋势数据查询完成, 返回 ${trendData.length} 个数据点`);
    return trendData;
  } catch (error) {
    console.error(`[evaluation-history] 获取趋势数据失败, 指标: ${metricName}:`, error);
    throw error;
  }
}

export interface RadarDataPoint {
  metricName: string;
  metricLabel: string;
  value: number | null;
}

export async function getRadarData(versionId: number): Promise<RadarDataPoint[]> {
  console.log(`[evaluation-history] 获取雷达图数据, versionId: ${versionId}`);

  try {
    const version = await getEvaluationVersionById(versionId);

    if (!version) {
      console.error(`[evaluation-history] 未找到版本, versionId: ${versionId}`);
      throw new Error(`未找到 id=${versionId} 的评估版本`);
    }

    const metrics = version.evaluationType === "agent"
      ? AGENT_RADAR_METRICS
      : RAG_RADAR_METRICS;

    console.log(`[evaluation-history] 评估类型: ${version.evaluationType}, 使用 ${metrics.length} 个雷达维度`);

    const radarData: RadarDataPoint[] = metrics.map((metricName) => {
      const rawValue = version[metricName as keyof typeof version] as string | null;
      const value = rawValue !== null ? parseFloat(rawValue) : null;

      return {
        metricName,
        metricLabel: METRIC_LABELS[metricName],
        value,
      };
    });

    const overallData: RadarDataPoint = {
      metricName: "overallScore",
      metricLabel: "综合评分",
      value: parseFloat(version.overallScore),
    };

    const result = [overallData, ...radarData];
    console.log(`[evaluation-history] 雷达图数据生成完成, 共 ${result.length} 个维度`);
    return result;
  } catch (error) {
    console.error(`[evaluation-history] 获取雷达图数据失败, versionId: ${versionId}:`, error);
    throw error;
  }
}

export interface Milestone {
  id: number;
  version: number;
  timestamp: string;
  evaluationType: string;
  milestone: string | null;
  overallScore: string;
}

export async function getMilestones(dateFrom?: string, dateTo?: string): Promise<Milestone[]> {
  console.log(`[evaluation-history] 获取里程碑列表, dateFrom: ${dateFrom ?? "无"}, dateTo: ${dateTo ?? "无"}`);

  try {
    const conditions = [];

    if (dateFrom) {
      conditions.push(gte(evaluationVersions.timestamp, dateFrom));
      console.log(`[evaluation-history] 添加过滤条件 - 起始时间: ${dateFrom}`);
    }
    if (dateTo) {
      conditions.push(lte(evaluationVersions.timestamp, dateTo));
      console.log(`[evaluation-history] 添加过滤条件 - 截止时间: ${dateTo}`);
    }

    const query = conditions.length > 0
      ? db
          .select({
            id: evaluationVersions.id,
            version: evaluationVersions.version,
            timestamp: evaluationVersions.timestamp,
            evaluationType: evaluationVersions.evaluationType,
            milestone: evaluationVersions.milestone,
            overallScore: evaluationVersions.overallScore,
          })
          .from(evaluationVersions)
          .where(and(...conditions))
          .orderBy(desc(evaluationVersions.version))
      : db
          .select({
            id: evaluationVersions.id,
            version: evaluationVersions.version,
            timestamp: evaluationVersions.timestamp,
            evaluationType: evaluationVersions.evaluationType,
            milestone: evaluationVersions.milestone,
            overallScore: evaluationVersions.overallScore,
          })
          .from(evaluationVersions)
          .orderBy(desc(evaluationVersions.version));

    const results = await query;
    const milestones = results.filter((r) => r.milestone !== null);

    console.log(`[evaluation-history] 里程碑查询完成, 共 ${milestones.length} 个里程碑`);
    return milestones;
  } catch (error) {
    console.error("[evaluation-history] 获取里程碑列表失败:", error);
    throw error;
  }
}
