import { NextRequest, NextResponse } from "next/server";
import { getMilestones } from "@/server/evaluation/evaluation-history";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  console.log("[evaluation-milestones] 获取里程碑列表");

  try {
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom") ?? undefined;
    const dateTo = searchParams.get("dateTo") ?? undefined;

    console.log(
      `[evaluation-milestones] 查询参数 - dateFrom: ${dateFrom ?? "无"}, dateTo: ${dateTo ?? "无"}`
    );

    const milestones = await getMilestones(dateFrom, dateTo);

    console.log(`[evaluation-milestones] 返回 ${milestones.length} 个里程碑`);

    return NextResponse.json({
      success: true,
      milestones,
    });
  } catch (error) {
    console.error("[evaluation-milestones] 获取里程碑列表失败:", error);
    return NextResponse.json(
      { success: false, message: "获取里程碑列表失败" },
      { status: 500 }
    );
  }
}
