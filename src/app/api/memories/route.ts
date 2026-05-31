import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserProfile, updateUserProfile } from "@/server/agents/memory";
import { db } from "@/server/db/client";
import { memoryFragments, memorySummaries } from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id || "default-user";

    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") || "profile";

    if (tab === "profile") {
      const profile = await getUserProfile(userId);
      return NextResponse.json({ success: true, profile });
    }

    if (tab === "fragments") {
      const fragments = await db
        .select({
          id: memoryFragments.id,
          content: memoryFragments.content,
          sourceType: memoryFragments.sourceType,
          scope: memoryFragments.scope,
          createdAt: memoryFragments.createdAt,
        })
        .from(memoryFragments)
        .where(eq(memoryFragments.userId, userId))
        .orderBy(desc(memoryFragments.createdAt));
      return NextResponse.json({ success: true, fragments });
    }

    if (tab === "summaries") {
      const summaries = await db
        .select({
          id: memorySummaries.id,
          conversationId: memorySummaries.conversationId,
          summary: memorySummaries.summary,
          messageRangeStart: memorySummaries.messageRangeStart,
          messageRangeEnd: memorySummaries.messageRangeEnd,
          createdAt: memorySummaries.createdAt,
        })
        .from(memorySummaries)
        .where(eq(memorySummaries.userId, userId))
        .orderBy(desc(memorySummaries.createdAt));
      return NextResponse.json({ success: true, summaries });
    }

    return NextResponse.json({ success: false, error: "未知tab参数" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[memories] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { field, value } = body;

    if (!field || value === undefined) {
      return NextResponse.json({ success: false, error: "缺少field或value" }, { status: 400 });
    }

    const allowedFields = ["preferences", "riskProfile", "investmentStyle", "customNotes"];
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ success: false, error: `不允许修改字段: ${field}` }, { status: 400 });
    }

    await updateUserProfile(userId, { [field]: value });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[memories] 更新失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    const userId = session.user.id;

    const url = new URL(request.url);
    const target = url.searchParams.get("target");
    const targetId = url.searchParams.get("id");

    if (target === "fragment" && targetId) {
      await db
        .delete(memoryFragments)
        .where(and(eq(memoryFragments.id, targetId), eq(memoryFragments.userId, userId)));
      return NextResponse.json({ success: true });
    }

    if (target === "summary" && targetId) {
      await db
        .delete(memorySummaries)
        .where(and(eq(memorySummaries.id, targetId), eq(memorySummaries.userId, userId)));
      return NextResponse.json({ success: true });
    }

    if (target === "all-fragments") {
      await db.delete(memoryFragments).where(eq(memoryFragments.userId, userId));
      return NextResponse.json({ success: true });
    }

    if (target === "all-summaries") {
      await db.delete(memorySummaries).where(eq(memorySummaries.userId, userId));
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "无效的删除目标" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[memories] 删除失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
