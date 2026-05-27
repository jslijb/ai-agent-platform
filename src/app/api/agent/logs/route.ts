import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, sql } from "@/server/db/client";
import { agentLogs } from "@/server/db/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { getAgentLogsSummary } from "@/server/agents/agent-logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.warn("[agent/logs] 未认证访问");
      return NextResponse.json(
        { success: false, error: "未认证" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || session.user.id;
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
    const status = url.searchParams.get("status");
    const summary = url.searchParams.get("summary");

    if (summary === "true") {
      console.log(`[agent/logs] 获取用户 ${userId} 的 Token 使用摘要`);
      const summaryData = await getAgentLogsSummary(userId);
      return NextResponse.json({
        success: true,
        summary: summaryData,
      });
    }

    console.log(`[agent/logs] 获取日志列表, userId: ${userId}, page: ${page}, pageSize: ${pageSize}, status: ${status || "全部"}`);

    const conditions = [eq(agentLogs.userId, userId)];
    if (status) {
      conditions.push(eq(agentLogs.status, status));
    }

    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

    const [totalResult] = await db
      .select({ total: count() })
      .from(agentLogs)
      .where(whereClause);

    const total = totalResult.total;

    const logs = await db
      .select()
      .from(agentLogs)
      .where(whereClause)
      .orderBy(desc(agentLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    console.log(`[agent/logs] 查询完成, 共 ${total} 条, 当前页 ${logs.length} 条`);

    return NextResponse.json({
      success: true,
      logs,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agent/logs] 获取日志失败: ${message}`);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
