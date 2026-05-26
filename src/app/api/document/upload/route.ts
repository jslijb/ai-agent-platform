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
import { addToIndex } from "@/server/rag/retrieval/sparse-retriever";
import { extractTriples } from "@/server/rag/graph/entity-extractor";
import { createGraph } from "@/server/rag/graph/graph-builder";

export async function POST(request: Request) {
  console.log("[文档上传] 开始处理上传请求");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.error("[文档上传] 未登录用户尝试上传");
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
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

    try {
      console.log("[文档上传] 开始分块处理");
      const chunks = await chunkDocument(buffer, fileName);
      console.log(`[文档上传] 分块完成, 共 ${chunks.length} 个分块`);

      console.log("[文档上传] 开始批量生成嵌入向量");
      const texts = chunks.map((chunk) => chunk.text);
      const embeddings = await generateEmbeddings(texts);
      console.log(`[文档上传] 嵌入向量生成完成, 共 ${embeddings.length} 个`);

      const storeItems = chunks.map((chunk, i) => ({
        documentId: document.id,
        chunkIndex: chunk.index,
        chunkText: chunk.text,
        embedding: embeddings[i]!,
        tokenCount: chunk.metadata.tokenCount,
      }));

      console.log("[文档上传] 开始存储嵌入向量");
      await storeEmbeddings(storeItems);
      console.log("[文档上传] 嵌入向量存储完成");

      console.log("[文档上传] 开始添加 BM25 索引");
      for (let i = 0; i < chunks.length; i++) {
        await addToIndex(
          i,
          chunks[i].text,
          document.id
        );
      }
      console.log("[文档上传] BM25 索引添加完成");

      console.log("[文档上传] 开始构建知识图谱");
      try {
        const fullText = chunks.map((c) => c.text).join("\n");
        const triples = await extractTriples(fullText);
        console.log(`[文档上传] 提取到 ${triples.length} 个三元组`);

        if (triples.length > 0) {
          await createGraph(document.id, triples);
          console.log("[文档上传] 知识图谱构建完成");
        } else {
          console.log("[文档上传] 未提取到三元组，跳过图谱构建");
        }
      } catch (graphError) {
        console.error("[文档上传] 图谱构建失败，不影响文档处理:", graphError);
      }

      await db.update(documents).set({ status: "completed" }).where(eq(documents.id, document.id));

      console.log(
        `[文档上传] 文档处理完成: ${document.id}, 分块数: ${chunks.length}`
      );

      return NextResponse.json({
        success: true,
        documentId: document.id,
        chunkCount: chunks.length,
      });
    } catch (processingError) {
      console.error("[文档上传] 文档处理失败:", processingError);

      await db.update(documents).set({ status: "failed" }).where(eq(documents.id, document.id));

      console.error(`[文档上传] 文档状态已更新为 failed: ${document.id}`);

      return NextResponse.json(
        {
          success: false,
          message: "文档处理失败",
          documentId: document.id,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[文档上传] 请求处理异常:", error);
    return NextResponse.json(
      { success: false, message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
