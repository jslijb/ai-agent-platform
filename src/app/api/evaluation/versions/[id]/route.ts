import { NextRequest, NextResponse } from "next/server";
import { getEvaluationVersionById } from "@/server/evaluation/evaluation-history";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);

    if (isNaN(id) || id <= 0) {
      console.error("[evaluation-version-detail] 无效的版本 ID:", idStr);
      return NextResponse.json(
        { success: false, message: "版本 ID 必须为正整数" },
        { status: 400 }
      );
    }

    console.log(`[evaluation-version-detail] 获取评估版本详情, id: ${id}`);

    const version = await getEvaluationVersionById(id);

    if (!version) {
      console.log(`[evaluation-version-detail] 未找到版本, id: ${id}`);
      return NextResponse.json(
        { success: false, message: `未找到 id=${id} 的评估版本` },
        { status: 404 }
      );
    }

    let report = null;
    if (version.reportJson) {
      try {
        report = JSON.parse(version.reportJson);
        console.log(`[evaluation-version-detail] 报告 JSON 解析成功, id: ${id}`);
      } catch (parseError) {
        console.error(`[evaluation-version-detail] 报告 JSON 解析失败, id: ${id}:`, parseError);
        report = null;
      }
    }

    console.log(`[evaluation-version-detail] 返回版本详情, id: ${id}, version: ${version.version}`);

    return NextResponse.json({
      success: true,
      version: {
        id: version.id,
        version: version.version,
        timestamp: version.timestamp,
        evaluationType: version.evaluationType,
        evaluationLevel: version.evaluationLevel,
        dataSource: version.dataSource,
        dataSourceDetail: version.dataSourceDetail,
        triggerMode: version.triggerMode,
        milestone: version.milestone,
        totalTests: version.totalTests,
        overallScore: version.overallScore,
        financialOverallScore: version.financialOverallScore,
      },
      report,
    });
  } catch (error) {
    console.error("[evaluation-version-detail] 获取评估版本详情失败:", error);
    return NextResponse.json(
      { success: false, message: "获取评估版本详情失败" },
      { status: 500 }
    );
  }
}
