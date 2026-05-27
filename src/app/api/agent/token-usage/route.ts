import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAgentLogsSummary } from "@/server/agents/agent-logger";

export const dynamic = "force-dynamic";

export async function GET() {
  console.log("[agent/token-usage] 收到 Token 用量查询请求");

  try {
    const session = await auth();

    if (!session?.user?.id) {
      console.warn("[agent/token-usage] 未认证用户尝试访问 Token 用量");
      return NextResponse.json(
        { success: false, error: "未认证，请先登录" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    console.log(`[agent/token-usage] 查询用户 Token 用量: userId=${userId}`);

    const summary = await getAgentLogsSummary(userId);

    console.log(
      `[agent/token-usage] 查询完成: totalCalls=${summary.totalCalls}, totalTokens=${summary.totalTokens}`
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalCalls: summary.totalCalls,
        totalTokens: summary.totalTokens,
        totalPromptTokens: summary.totalPromptTokens,
        totalCompletionTokens: summary.totalCompletionTokens,
        avgLatencyMs: summary.avgLatencyMs,
        avgIterations: summary.avgIterations,
        byModel: summary.byModel,
        byStatus: summary.byStatus,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent/token-usage] 查询 Token 用量异常: ${message}`);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
