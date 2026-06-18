import { NextRequest, NextResponse } from "next/server";
import { getEvaluationVersions } from "@/server/evaluation/evaluation-history";
import type { VersionComparison } from "@/server/evaluation/rag-evaluator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[evaluation-versions] 获取评估版本列表");

  try {
    const { searchParams } = new URL(request.url);
    const evaluationType = searchParams.get("evaluationType") ?? undefined;
    const evaluationLevel = searchParams.get("evaluationLevel") ?? undefined;
    const dateFrom = searchParams.get("dateFrom") ?? undefined;
    const dateTo = searchParams.get("dateTo") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const includeComparison = searchParams.get("includeComparison") === "true";

    if (isNaN(limit) || limit <= 0) {
      console.error("[evaluation-versions] 无效的 limit 参数:", limitParam);
      return NextResponse.json(
        { success: false, message: "limit 参数必须为正整数" },
        { status: 400 }
      );
    }

    const validEvaluationTypes = ["rag", "agent"];
    if (evaluationType && !validEvaluationTypes.includes(evaluationType)) {
      console.error("[evaluation-versions] 无效的 evaluationType 参数:", evaluationType);
      return NextResponse.json(
        { success: false, message: "evaluationType 参数必须为 rag 或 agent" },
        { status: 400 }
      );
    }

    const validEvaluationLevels = ["daily", "standard", "full"];
    if (evaluationLevel && !validEvaluationLevels.includes(evaluationLevel)) {
      console.error("[evaluation-versions] 无效的 evaluationLevel 参数:", evaluationLevel);
      return NextResponse.json(
        { success: false, message: "evaluationLevel 参数必须为 daily、standard 或 full" },
        { status: 400 }
      );
    }

    console.log(
      `[evaluation-versions] 查询参数 - evaluationType: ${evaluationType ?? "全部"}, evaluationLevel: ${evaluationLevel ?? "全部"}, dateFrom: ${dateFrom ?? "无"}, dateTo: ${dateTo ?? "无"}, limit: ${limit}, includeComparison: ${includeComparison}`
    );

    const versions = await getEvaluationVersions(
      { evaluationType, evaluationLevel, dateFrom, dateTo },
      limit
    );

    const versionList = versions.map((v) => ({
      id: v.id,
      version: v.version,
      timestamp: v.timestamp,
      evaluationType: v.evaluationType,
      evaluationLevel: v.evaluationLevel,
      dataSource: v.dataSource,
      overallScore: v.overallScore,
      financialOverallScore: v.financialOverallScore,
      milestone: v.milestone,
    }));

    // 构建版本对比数据（当 includeComparison=true 时）
    let versionComparison: VersionComparison | undefined;
    if (includeComparison && versions.length > 0) {
      console.log("[evaluation-versions] 构建版本对比数据");

      const metricKeys = [
        "avgHitsAtK", "avgContextRelevance", "avgContextRecall",
        "avgFaithfulness", "avgAnswerRelevance",
        "avgNumericalAccuracy", "avgComplianceScore",
        "avgHallucinationRate", "avgRiskDisclosureScore", "avgTimelinessScore",
      ] as const;

      const invertMetrics = new Set(["avgHallucinationRate"]);

      // 构建版本列表
      const versionEntries: VersionComparison["versions"] = versions.map((v) => {
        const metrics: Record<string, number> = {};
        for (const key of metricKeys) {
          const rawVal = v[key as keyof typeof v] as string | null;
          if (rawVal !== null) {
            metrics[key] = parseFloat(rawVal);
          }
        }
        if (v.overallScore) metrics.overallScore = parseFloat(v.overallScore);
        if (v.financialOverallScore) metrics.financialOverallScore = parseFloat(v.financialOverallScore);

        return {
          version: `V${v.version}`,
          timestamp: v.timestamp,
          optimizationSummary: v.milestone ?? `V${v.version} 评估`,
          metrics,
        };
      });

      // 按版本号排序（从小到大）
      versionEntries.sort((a, b) => {
        const numA = parseInt(a.version.replace("V", ""), 10);
        const numB = parseInt(b.version.replace("V", ""), 10);
        return numA - numB;
      });

      // 计算从 V1 到最新版本的改进
      const v1 = versionEntries[0];
      const latest = versionEntries[versionEntries.length - 1];
      const improvementMetrics = [
        ...metricKeys,
        "overallScore",
        "financialOverallScore",
      ];

      const improvements: VersionComparison["improvements"] = [];
      for (const metric of improvementMetrics) {
        const v1Val = v1.metrics[metric];
        const latestVal = latest.metrics[metric];

        if (v1Val !== undefined && latestVal !== undefined) {
          const isInverse = invertMetrics.has(metric);
          const delta = latestVal - v1Val;
          const pctChange = v1Val !== 0 ? (delta / Math.abs(v1Val)) * 100 : 0;
          const improvementStr = pctChange >= 0
            ? `+${pctChange.toFixed(0)}%`
            : `${pctChange.toFixed(0)}%`;

          let trend: "improving" | "stable" | "declining";
          if (isInverse) {
            if (delta < -0.05) trend = "improving";
            else if (delta > 0.05) trend = "declining";
            else trend = "stable";
          } else {
            if (delta > 0.05) trend = "improving";
            else if (delta < -0.05) trend = "declining";
            else trend = "stable";
          }

          improvements.push({
            metric,
            v1Value: Number(v1Val.toFixed(4)),
            latestValue: Number(latestVal.toFixed(4)),
            improvement: improvementStr,
            trend,
          });
        }
      }

      versionComparison = {
        versions: versionEntries,
        improvements,
      };

      console.log(`[evaluation-versions] 版本对比数据构建完成, 共 ${versionEntries.length} 个版本, ${improvements.length} 个指标改进`);
    }

    console.log(`[evaluation-versions] 返回 ${versionList.length} 个版本`);

    const response: Record<string, unknown> = {
      success: true,
      versions: versionList,
    };

    if (versionComparison) {
      response.versionComparison = versionComparison;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[evaluation-versions] 获取评估版本列表失败:", error);
    return NextResponse.json(
      { success: false, message: "获取评估版本列表失败" },
      { status: 500 }
    );
  }
}
