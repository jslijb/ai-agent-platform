import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { embeddings } from "@/server/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
    }

    const documentId = params.documentId;
    console.log(`[文档切片] 查询文档切片: documentId=${documentId}`);

    const chunks = await db
      .select({
        id: embeddings.id,
        chunkIndex: embeddings.chunkIndex,
        chunkText: embeddings.chunkText,
        tokenCount: embeddings.tokenCount,
        metadata: embeddings.metadata,
        createdAt: embeddings.createdAt,
      })
      .from(embeddings)
      .where(eq(embeddings.documentId, documentId))
      .orderBy(asc(embeddings.chunkIndex));

    console.log(`[文档切片] 查询完成: documentId=${documentId}, 切片数=${chunks.length}`);

    return NextResponse.json({
      success: true,
      chunks,
      chunkingStrategy: {
        method: "semantic-chunking",
        maxChunkSize: 512,
        overlapSize: 64,
        minChunkSize: 50,
        description: "PDF文档通过MinerU解析为Markdown，按标题和段落语义切分；纯文本按句子边界切分，支持重叠",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[文档切片] 查询失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
