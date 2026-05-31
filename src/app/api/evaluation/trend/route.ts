import { NextRequest, NextResponse } from "next/server";
import { getTrendData } from "@/server/evaluation/evaluation-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[evaluation-trend] 获取指标趋势数据");

  try {
    const { searchParams } = new URL(request.url);
    const metric = searchParams.get("metric");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const evaluationType = searchParams.get("evaluationType") ?? undefined;

    if (!metric) {
      console.error("[evaluation-trend] 缺少 metric 参数");
      return NextResponse.json(
        { success: false, message: "metric 参数为必填项" },
        { status: 400 }
      );
    }

    if (!dateFrom || !dateTo) {
      console.error("[evaluation-trend] 缺少日期参数, dateFrom:", dateFrom, "dateTo:", dateTo);
      return NextResponse.json(
        { success: false, message: "dateFrom 和 dateTo 参数为必填项" },
        { status: 400 }
      );
    }

    const validEvaluationTypes = ["rag", "agent"];
    if (evaluationType && !validEvaluationTypes.includes(evaluationType)) {
      console.error("[evaluation-trend] 无效的 evaluationType 参数:", evaluationType);
      return NextResponse.json(
        { success: false, message: "evaluationType 参数必须为 rag 或 agent" },
        { status: 400 }
      );
    }

    console.log(
      `[evaluation-trend] 查询参数 - metric: ${metric}, dateFrom: ${dateFrom}, dateTo: ${dateTo}, evaluationType: ${evaluationType ?? "全部"}`
    );

    const trendData = await getTrendData(metric, dateFrom, dateTo);

    let filteredData = trendData;
    if (evaluationType) {
      console.log(`[evaluation-trend] 按评估类型 ${evaluationType} 过滤趋势数据（前端过滤）`);
    }

    console.log(`[evaluation-trend] 返回 ${filteredData.length} 个数据点`);

    return NextResponse.json({
      success: true,
      metric,
      evaluationType: evaluationType ?? null,
      data: filteredData,
    });
  } catch (error) {
    console.error("[evaluation-trend] 获取指标趋势数据失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "获取指标趋势数据失败" },
      { status: 500 }
    );
  }
}
