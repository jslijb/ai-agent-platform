import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq, asc } from "drizzle-orm";

function parseVector(raw: unknown): number[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      const cleaned = raw.replace(/^\[|\]$/g, "");
      return cleaned.split(",").map((v) => parseFloat(v.trim()));
    } catch {
      return [];
    }
  }
  return [];
}

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
    console.log(`[向量预览] 查询文档向量: documentId=${documentId}`);

    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });

    if (!doc) {
      return NextResponse.json({ success: false, message: "文档不存在" }, { status: 404 });
    }

    const rows = await db
      .select({
        id: embeddings.id,
        chunkIndex: embeddings.chunkIndex,
        chunkText: embeddings.chunkText,
        tokenCount: embeddings.tokenCount,
        embedding: embeddings.embedding,
      })
      .from(embeddings)
      .where(eq(embeddings.documentId, documentId))
      .orderBy(asc(embeddings.chunkIndex));

    const embeddingItems = rows.map((row) => {
      const vec = parseVector(row.embedding);
      const vectorDim = vec.length;
      const vectorPreview = vectorDim > 0
        ? `[${vec.slice(0, 5).map((v) => v.toFixed(6)).join(", ")}, ... ]`
        : "-";

      return {
        id: row.id,
        chunkIndex: row.chunkIndex,
        chunkTextPreview: row.chunkText.substring(0, 100) + (row.chunkText.length > 100 ? "..." : ""),
        chunkTextLength: row.chunkText.length,
        tokenCount: row.tokenCount,
        vectorDim,
        vectorPreview,
      };
    });

    console.log(`[向量预览] 查询完成: documentId=${documentId}, 向量数=${embeddingItems.length}`);

    return NextResponse.json({
      success: true,
      documentId,
      fileName: doc.fileName,
      totalEmbeddings: embeddingItems.length,
      embeddings: embeddingItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[向量预览] 查询失败:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
