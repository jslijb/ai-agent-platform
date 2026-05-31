import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/server/db/client";
import { documents } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { chunkDocument } from "@/server/rag/chunking/semantic-chunker";
import {
  generateEmbeddings,
  storeEmbeddings,
} from "@/server/rag/retrieval/dense-retriever";
import { batchAddToIndex } from "@/server/rag/retrieval/sparse-retriever";
import { extractTriples } from "@/server/rag/graph/entity-extractor";
import { createGraph } from "@/server/rag/graph/graph-builder";

const GRAPH_MAX_CHUNKS = 50;
const GRAPH_MAX_TEXT_LENGTH = 50000;

async function processDocument(documentId: string, buffer: Buffer, fileName: string) {
  try {
    await db.update(documents).set({
      status: "chunking",
      metadata: { step: "1/4", stepName: "分块处理" },
    }).where(eq(documents.id, documentId));

    console.log(`[文档处理] ${documentId} 步骤1/4: 分块处理`);
    const result = await chunkDocument(buffer, fileName);
    const chunks = result.chunks;
    const rawText = result.rawText;
    console.log(`[文档处理] ${documentId} 分块完成, 共 ${chunks.length} 个分块`);

    await db.update(documents).set({
      status: "embedding",
      metadata: { step: "2/4", stepName: "生成嵌入向量", chunkCount: chunks.length },
    }).where(eq(documents.id, documentId));

    console.log(`[文档处理] ${documentId} 步骤2/4: 生成嵌入向量`);
    const texts = chunks.map((chunk) => chunk.text);
    const embeddingsResult = await generateEmbeddings(texts);
    console.log(`[文档处理] ${documentId} 嵌入向量生成完成, 共 ${embeddingsResult.length} 个`);

    const storeItems = chunks.map((chunk, i) => ({
      documentId,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddingsResult[i]!,
      tokenCount: chunk.metadata.tokenCount,
    }));

    await storeEmbeddings(storeItems);
    console.log(`[文档处理] ${documentId} 嵌入向量存储完成`);

    await db.update(documents).set({
      status: "indexing",
      metadata: { step: "3/4", stepName: "添加BM25索引", chunkCount: chunks.length },
    }).where(eq(documents.id, documentId));

    console.log(`[文档处理] ${documentId} 步骤3/4: 添加BM25索引`);
    const bm25Items = chunks.map((chunk, i) => ({
      id: i,
      text: chunk.text,
      documentId,
    }));
    await batchAddToIndex(bm25Items);
    console.log(`[文档处理] ${documentId} BM25索引添加完成`);

    await db.update(documents).set({
      status: "graphing",
      metadata: { step: "4/4", stepName: "构建知识图谱", chunkCount: chunks.length },
    }).where(eq(documents.id, documentId));

    console.log(`[文档处理] ${documentId} 步骤4/4: 构建知识图谱`);
    let graphStatus = "skipped";
    let graphMessage = "";
    const graphText = chunks
      .slice(0, GRAPH_MAX_CHUNKS)
      .map((c) => c.text)
      .join("\n");
    const limitedText = graphText.slice(0, GRAPH_MAX_TEXT_LENGTH);

    if (limitedText.length < graphText.length) {
      console.log(`[文档处理] ${documentId} 知识图谱文本已截断: ${graphText.length} -> ${limitedText.length}`);
    }

    try {
      const triples = await extractTriples(limitedText);
      console.log(`[文档处理] ${documentId} 提取到 ${triples.length} 个三元组`);

      if (triples.length > 0) {
        await createGraph(documentId, triples);
        graphStatus = "completed";
      } else {
        graphStatus = "no_triples";
        graphMessage = "未提取到三元组";
      }
    } catch (graphError) {
      graphStatus = "failed";
      graphMessage = graphError instanceof Error ? graphError.message : String(graphError);
      console.error(`[文档处理] ${documentId} 知识图谱构建失败:`, graphMessage);
    }

    const finalStatus = graphStatus === "failed" ? "partial" : "completed";
    await db.update(documents).set({
      status: finalStatus,
      rawContent: rawText,
      metadata: {
        graphStatus,
        graphMessage,
        chunkCount: chunks.length,
        step: "4/4",
        stepName: "处理完成",
      },
    }).where(eq(documents.id, documentId));

    console.log(`[文档处理] ${documentId} 完成, 状态: ${finalStatus}, 图谱: ${graphStatus}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[文档处理] ${documentId} 处理失败:`, errorMessage);

    await db.update(documents).set({
      status: "failed",
      metadata: {
        error: errorMessage,
        step: "failed",
        stepName: "处理失败",
      },
    }).where(eq(documents.id, documentId));
  }
}

export async function POST(request: Request) {
  console.log("[文档上传] 开始处理上传请求");

  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    let userId = session?.user?.id || testUserId;
    if (!userId) {
      console.error("[文档上传] 未登录用户尝试上传");
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    console.log(`[文档上传] 用户 ${userId} 发起上传`);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      console.error("[文档上传] 未提供文件或文件字段无效");
      return NextResponse.json(
        { success: false, message: "请上传文件" },
        { status: 400 }
      );
    }

    const fileName = file.name;
    console.log(`[文档上传] 接收到文件: ${fileName}, 大小: ${file.size} 字节`);

    const buffer = Buffer.from(await file.arrayBuffer());

    const [document] = await db.insert(documents).values({
      userId,
      fileName,
      fileKey: fileName,
      status: "uploaded",
      metadata: { step: "0/4", stepName: "已上传，等待处理" },
    }).returning();

    console.log(`[文档上传] 创建文档记录: ${document.id}, 状态: uploaded`);

    processDocument(document.id, buffer, fileName).catch((err) => {
      console.error(`[文档上传] 后台处理异常:`, err);
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      status: "uploaded",
      message: "文件已上传，正在后台处理",
    });
  } catch (error) {
    console.error("[文档上传] 上传请求失败:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        message: `上传失败: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
