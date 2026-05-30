import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { wrongAnswers } from "@/server/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id || "default-user";

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20");
    const errorType = url.searchParams.get("errorType");
    const resolved = url.searchParams.get("resolved");

    const conditions = [eq(wrongAnswers.userId, userId)];
    if (errorType) conditions.push(eq(wrongAnswers.errorType, errorType));
    if (resolved !== null && resolved !== "") conditions.push(eq(wrongAnswers.resolved, parseInt(resolved)));

    const whereClause = and(...conditions);

    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(wrongAnswers)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

    const rows = await db
      .select()
      .from(wrongAnswers)
      .where(whereClause)
      .orderBy(desc(wrongAnswers.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return NextResponse.json({
      success: true,
      wrongAnswers: rows,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[wrong-answers] 获取失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, agentLogId, query, wrongAnswer, correctAnswer, errorType, toolsUsed, model, iterations, note } = body;

    if (!query || !wrongAnswer) {
      return NextResponse.json({ success: false, error: "缺少 query 或 wrongAnswer" }, { status: 400 });
    }

    const [inserted] = await db.insert(wrongAnswers).values({
      userId: session.user.id,
      conversationId: conversationId || null,
      agentLogId: agentLogId || null,
      query,
      wrongAnswer,
      correctAnswer: correctAnswer || null,
      errorType: errorType || "other",
      toolsUsed: toolsUsed || null,
      model: model || null,
      iterations: iterations || 0,
      note: note || null,
    }).returning();

    console.log(`[wrong-answers] 错题已记录: query="${query.substring(0, 50)}..."`);
    return NextResponse.json({ success: true, wrongAnswer: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[wrong-answers] 创建失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { id, correctAnswer, errorType, note, resolved } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (correctAnswer !== undefined) updateData.correctAnswer = correctAnswer;
    if (errorType !== undefined) updateData.errorType = errorType;
    if (note !== undefined) updateData.note = note;
    if (resolved !== undefined) updateData.resolved = resolved;

    await db
      .update(wrongAnswers)
      .set(updateData)
      .where(eq(wrongAnswers.id, id));

    console.log(`[wrong-answers] 错题已更新: id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[wrong-answers] 更新失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少 id" }, { status: 400 });
    }

    await db.delete(wrongAnswers).where(eq(wrongAnswers.id, id));
    console.log(`[wrong-answers] 错题已删除: id=${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[wrong-answers] 删除失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
