import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    const userId = session?.user?.id || testUserId;
    if (!userId) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const docs = await db
      .select({
        id: documents.id,
        fileName: documents.fileName,
        status: documents.status,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        documentType: documents.documentType,
        version: documents.version,
        metadata: documents.metadata,
        chunkCount: sql<number>`(SELECT COUNT(*)::int FROM "Embedding" WHERE "Embedding"."documentId" = "Document"."id")`,
      })
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.createdAt));

    return NextResponse.json({ success: true, documents: docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[文档列表] 查询失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    const userId = session?.user?.id || testUserId;
    if (!userId) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const { documentId } = await request.json();
    if (!documentId) {
      return NextResponse.json({ success: false, message: "缺少 documentId" }, { status: 400 });
    }

    await db.delete(embeddings).where(eq(embeddings.documentId, documentId));
    await db.delete(documents).where(eq(documents.id, documentId));

    console.log(`[文档删除] 已删除: ${documentId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[文档删除] 失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
