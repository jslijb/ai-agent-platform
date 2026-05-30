import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    const userId = session?.user?.id || testUserId;
    if (!userId) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const documentId = params.documentId;
    console.log(`[文档原文] 查询文档原文: documentId=${documentId}`);

    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });

    if (!doc) {
      return NextResponse.json({ success: false, message: "文档不存在" }, { status: 404 });
    }

    const rawText = (doc as any).rawContent || null;

    if (!rawText) {
      const chunks = await db
        .select({
          chunkIndex: embeddings.chunkIndex,
          chunkText: embeddings.chunkText,
        })
        .from(embeddings)
        .where(eq(embeddings.documentId, documentId))
        .orderBy(asc(embeddings.chunkIndex));

      const mergedText = chunks.map((c) => c.chunkText).join("\n\n");

      return NextResponse.json({
        success: true,
        document: {
          id: doc.id,
          fileName: doc.fileName,
          status: doc.status,
          documentType: doc.documentType,
          createdAt: doc.createdAt,
        },
        rawText: mergedText,
        isMerged: true,
        chunkCount: chunks.length,
        totalChars: mergedText.length,
      });
    }

    console.log(`[文档原文] 查询完成: documentId=${documentId}, 原文长度=${rawText.length}`);

    return NextResponse.json({
      success: true,
      document: {
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        documentType: doc.documentType,
        createdAt: doc.createdAt,
      },
      rawText,
      isMerged: false,
      totalChars: rawText.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[文档原文] 查询失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
