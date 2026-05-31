import { NextRequest, NextResponse } from "next/server";
import { compareVersions } from "@/server/evaluation/evaluation-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[evaluation-compare] 开始版本对比");

  try {
    const { searchParams } = new URL(request.url);
    const versionIdsParam = searchParams.get("versionIds");

    if (!versionIdsParam) {
      console.error("[evaluation-compare] 缺少 versionIds 参数");
      return NextResponse.json(
        { success: false, message: "versionIds 参数为必填项" },
        { status: 400 }
      );
    }

    const versionIds = versionIdsParam
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id) && id > 0);

    if (versionIds.length < 2) {
      console.error("[evaluation-compare] versionIds 参数无效，至少需要 2 个有效版本 ID:", versionIdsParam);
      return NextResponse.json(
        { success: false, message: "至少需要 2 个有效的版本 ID 进行对比" },
        { status: 400 }
      );
    }

    console.log(`[evaluation-compare] 对比版本 ID: [${versionIds.join(", ")}]`);

    const comparisons = await compareVersions(versionIds);

    console.log(`[evaluation-compare] 版本对比完成, 共 ${comparisons.length} 个指标`);

    return NextResponse.json({
      success: true,
      comparisons,
    });
  } catch (error) {
    console.error("[evaluation-compare] 版本对比失败:", error);
    return NextResponse.json(
      { success: false, message: "版本对比失败" },
      { status: 500 }
    );
  }
}
