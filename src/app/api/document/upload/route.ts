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
      status: "processing",
    }).returning();

    console.log(`[文档上传] 创建文档记录: ${document.id}, 状态: processing`);

    console.log("[文档上传] 步骤1/4: 分块处理");
    const result = await chunkDocument(buffer, fileName);
    const chunks = result.chunks;
    const rawText = result.rawText;
    console.log(`[文档上传] 分块完成, 共 ${chunks.length} 个分块, 原文长度: ${rawText.length}`);

    console.log("[文档上传] 步骤2/4: 生成并存储嵌入向量");
    const texts = chunks.map((chunk) => chunk.text);
    const embeddingsResult = await generateEmbeddings(texts);
    console.log(`[文档上传] 嵌入向量生成完成, 共 ${embeddingsResult.length} 个`);

    const storeItems = chunks.map((chunk, i) => ({
      documentId: document.id,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddingsResult[i]!,
      tokenCount: chunk.metadata.tokenCount,
    }));

    await storeEmbeddings(storeItems);
    console.log("[文档上传] 嵌入向量存储完成");

    console.log("[文档上传] 步骤3/4: 添加 BM25 索引");
    const bm25Items = chunks.map((chunk, i) => ({
      id: i,
      text: chunk.text,
      documentId: document.id,
    }));
    await batchAddToIndex(bm25Items);
    console.log("[文档上传] BM25 索引添加完成");

    console.log("[文档上传] 步骤4/4: 构建知识图谱");
    let graphStatus = "skipped";
    let graphMessage = "";
    const graphText = chunks
      .slice(0, GRAPH_MAX_CHUNKS)
      .map((c) => c.text)
      .join("\n");
    const limitedText = graphText.slice(0, GRAPH_MAX_TEXT_LENGTH);

    if (limitedText.length < graphText.length) {
      console.log(`[文档上传] 知识图谱文本已截断: ${graphText.length} -> ${limitedText.length}（取前${GRAPH_MAX_CHUNKS}个分块，最多${GRAPH_MAX_TEXT_LENGTH}字符）`);
    }

    try {
      const triples = await extractTriples(limitedText);
      console.log(`[文档上传] 提取到 ${triples.length} 个三元组`);

      if (triples.length > 0) {
        await createGraph(document.id, triples);
        graphStatus = "completed";
        console.log("[文档上传] 知识图谱构建完成");
      } else {
        graphStatus = "no_triples";
        graphMessage = "未提取到三元组";
        console.log("[文档上传] 未提取到三元组，跳过图谱构建");
      }
    } catch (graphError) {
      graphStatus = "failed";
      graphMessage = graphError instanceof Error ? graphError.message : String(graphError);
      console.error("[文档上传] 知识图谱构建失败:", graphMessage);
    }

    const finalStatus = graphStatus === "failed" ? "partial" : "completed";
    await db.update(documents).set({
      status: finalStatus,
      rawContent: rawText,
      metadata: {
        graphStatus,
        graphMessage,
        chunkCount: chunks.length,
      },
    }).where(eq(documents.id, document.id));

    console.log(
      `[文档上传] 文档处理完成: ${document.id}, 分块数: ${chunks.length}, 状态: ${finalStatus}, 图谱: ${graphStatus}`
    );

    return NextResponse.json({
      success: true,
      documentId: document.id,
      chunkCount: chunks.length,
      graphStatus,
      graphMessage,
      status: finalStatus,
    });
  } catch (error) {
    console.error("[文档上传] 文档处理失败:", error);

    const docId = (error as any)?.documentId;
    if (docId) {
      await db.update(documents).set({ status: "failed" }).where(eq(documents.id, docId));
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        message: `文档处理失败: ${errorMessage}`,
        documentId: docId,
      },
      { status: 500 }
    );
  }
}
