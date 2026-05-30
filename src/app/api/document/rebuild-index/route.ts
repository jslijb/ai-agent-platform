import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, sql } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { chunkDocument, chunkText, chunkMarkdown } from "@/server/rag/chunking/semantic-chunker";
import { cleanText } from "@/server/rag/chunking/text-cleaner";
import { generateEmbeddings, storeEmbeddings } from "@/server/rag/retrieval/dense-retriever";
import { rebuildBM25Index } from "@/server/rag/retrieval/sparse-retriever";
import { buildParentChildMapping } from "@/server/rag/chunking/parent-document";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    const userId = session?.user?.id || testUserId;
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const documentId = body.documentId as string | undefined;

    let docsToProcess;
    if (documentId) {
      const doc = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
      if (!doc.length) {
        return NextResponse.json({ success: false, message: "文档不存在" }, { status: 404 });
      }
      docsToProcess = doc;
      console.log(`[rebuild-index] 用户 ${userId} 请求重建文档 ${documentId} 的索引`);
    } else {
      docsToProcess = await db.select().from(documents);
      console.log(`[rebuild-index] 用户 ${userId} 请求重建全部文档索引, 文档数: ${docsToProcess.length}`);
    }

    const results: Array<{ fileName: string; oldChunks: number; newChunks: number }> = [];

    for (const doc of docsToProcess) {
      if (!doc.rawContent) continue;

      const oldCount = await db.select({ cnt: sql<number>`count(*)::int` }).from(embeddings).where(eq(embeddings.documentId, doc.id));
      const oldChunks = oldCount[0]?.cnt ?? 0;

      console.log(`[rebuild-index] 处理文档: ${doc.fileName}, 旧切片数: ${oldChunks}`);

      await db.delete(embeddings).where(eq(embeddings.documentId, doc.id));

      const ext = doc.fileName.toLowerCase().split(".").pop();
      const cleanedContent = cleanText(doc.rawContent);
      const isMarkdown = cleanedContent.includes("# ") && (cleanedContent.includes("## ") || cleanedContent.match(/^#{1,3}\s/m));
      const chunks = (ext === "md" || ext === "markdown" || isMarkdown)
        ? await chunkMarkdown(cleanedContent)
        : await chunkText(cleanedContent);

      const texts = chunks.map(c => c.text);
      const embeddingResults = await generateEmbeddings(texts);

      const storeItems = chunks.map((chunk, i) => ({
        documentId: doc.id,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        embedding: embeddingResults[i]!,
        tokenCount: chunk.metadata.tokenCount,
      }));

      await storeEmbeddings(storeItems);

      const chunkItems = chunks.map((c, i) => ({ id: `chunk_${i}`, text: c.text }));
      buildParentChildMapping(chunkItems);

      results.push({ fileName: doc.fileName, oldChunks, newChunks: chunks.length });
      console.log(`[rebuild-index] 文档 ${doc.fileName} 重建完成: ${oldChunks} -> ${chunks.length} chunks`);
    }

    await rebuildBM25Index();
    console.log(`[rebuild-index] BM25 索引重建完成`);

    return NextResponse.json({
      success: true,
      message: `索引重建完成，处理了 ${results.length} 个文档`,
      results,
    });
  } catch (error) {
    console.error("[rebuild-index] 重建索引失败:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
