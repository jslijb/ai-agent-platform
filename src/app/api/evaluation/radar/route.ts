import { NextRequest, NextResponse } from "next/server";
import { getRadarData } from "@/server/evaluation/evaluation-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[evaluation-radar] 获取雷达图数据");

  try {
    const { searchParams } = new URL(request.url);
    const versionIdParam = searchParams.get("versionId");

    if (!versionIdParam) {
      console.error("[evaluation-radar] 缺少 versionId 参数");
      return NextResponse.json(
        { success: false, message: "versionId 参数为必填项" },
        { status: 400 }
      );
    }

    const versionId = parseInt(versionIdParam, 10);

    if (isNaN(versionId) || versionId <= 0) {
      console.error("[evaluation-radar] 无效的 versionId 参数:", versionIdParam);
      return NextResponse.json(
        { success: false, message: "versionId 必须为正整数" },
        { status: 400 }
      );
    }

    console.log(`[evaluation-radar] 查询参数 - versionId: ${versionId}`);

    const radarData = await getRadarData(versionId);

    console.log(`[evaluation-radar] 雷达图数据返回成功, 共 ${radarData.length} 个维度`);

    return NextResponse.json({
      success: true,
      versionId,
      data: radarData,
    });
  } catch (error) {
    console.error("[evaluation-radar] 获取雷达图数据失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "获取雷达图数据失败" },
      { status: 500 }
    );
  }
}
