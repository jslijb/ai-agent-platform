import { NextRequest, NextResponse } from "next/server";
import { getEvaluationVersions } from "@/server/evaluation/evaluation-history";

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
      `[evaluation-versions] 查询参数 - evaluationType: ${evaluationType ?? "全部"}, evaluationLevel: ${evaluationLevel ?? "全部"}, dateFrom: ${dateFrom ?? "无"}, dateTo: ${dateTo ?? "无"}, limit: ${limit}`
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

    console.log(`[evaluation-versions] 返回 ${versionList.length} 个版本`);

    return NextResponse.json({
      success: true,
      versions: versionList,
    });
  } catch (error) {
    console.error("[evaluation-versions] 获取评估版本列表失败:", error);
    return NextResponse.json(
      { success: false, message: "获取评估版本列表失败" },
      { status: 500 }
    );
  }
}
