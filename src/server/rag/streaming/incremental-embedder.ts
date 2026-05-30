import { db } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq, sql } from "drizzle-orm";
import { chunkDocument } from "@/server/rag/chunking/semantic-chunker";
import { generateEmbeddings, storeEmbeddings } from "@/server/rag/retrieval/dense-retriever";

async function deleteEmbeddingsForDocument(docId: string): Promise<void> {
  console.log(`[incremental-embedder] 删除文档 ${docId} 的所有 embedding 记录`);

  try {
    const result = await db.delete(embeddings).where(eq(embeddings.documentId, docId)).returning();

    console.log(`[incremental-embedder] 已删除 ${result.length} 条 embedding 记录, docId: ${docId}`);
  } catch (error) {
    console.error(`[incremental-embedder] 删除 embedding 记录失败, docId: ${docId}:`, error);
    throw error;
  }
}

async function embedDocument(docId: string): Promise<void> {
  console.log(`[incremental-embedder] 开始为文档 ${docId} 生成 embedding`);

  let document;
  try {
    document = await db.query.documents.findFirst({
      where: eq(documents.id, docId),
    });
  } catch (error) {
    console.error(`[incremental-embedder] 查询文档失败, docId: ${docId}:`, error);
    throw error;
  }

  if (!document) {
    console.error(`[incremental-embedder] 文档不存在, docId: ${docId}`);
    throw new Error(`文档不存在: ${docId}`);
  }

  const countResult = await db.select({ value: sql<number>`count(*)` }).from(embeddings).where(eq(embeddings.documentId, docId));
  const existingEmbeddings = Number(countResult[0]?.value ?? 0);

  if (existingEmbeddings > 0 && document.contentHash) {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const uploadDir = process.env.UPLOAD_DIR || "uploads";
      const filePath = path.join(uploadDir, document.fileKey);
      const fileBuffer = await fs.readFile(filePath);
      const crypto = await import("crypto");
      const currentHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      if (currentHash === document.contentHash) {
        console.log(`[incremental-embedder] 内容未变化，跳过重建, docId: ${docId}`);
        return;
      }
      await db.update(documents).set({ contentHash: currentHash }).where(eq(documents.id, docId));
    } catch {
      console.warn(`[incremental-embedder] 内容哈希检查失败，继续重建, docId: ${docId}`);
    }
  }

  console.log(
    `[incremental-embedder] 文档信息: id=${document.id}, fileName=${document.fileName}, status=${document.status}`
  );

  await deleteEmbeddingsForDocument(docId);
  console.log(`[incremental-embedder] 已清除旧 embedding，开始重新切片和嵌入`);

  let content: string | null = null;
  let pdfBuffer: Buffer | null = null;

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadDir = process.env.UPLOAD_DIR || "uploads";
    const filePath = path.join(uploadDir, document.fileKey);

    const fileBuffer = await fs.readFile(filePath);

    if (document.fileName.toLowerCase().endsWith(".pdf")) {
      pdfBuffer = fileBuffer;
      console.log(`[incremental-embedder] PDF文件使用Buffer直接传入, 大小: ${fileBuffer.length}, 路径: ${filePath}`);
    } else {
      content = fileBuffer.toString("utf-8");
      console.log(`[incremental-embedder] 从本地文件系统获取文档内容成功, 长度: ${content.length}, 路径: ${filePath}`);
    }
  } catch (fsError) {
    console.warn(`[incremental-embedder] 从本地文件系统获取文档内容失败:`, fsError);
  }

  if (!pdfBuffer && !content) {
    try {
      const { db } = await import("@/server/db");
      const { documents } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      const docRecord = await db.select({ rawContent: documents.rawContent }).from(documents).where(eq(documents.id, docId)).limit(1);
      if (docRecord.length > 0 && docRecord[0].rawContent) {
        content = docRecord[0].rawContent;
        console.log(`[incremental-embedder] 从数据库rawContent获取内容成功, 长度: ${content.length}`);
      }
    } catch (dbError) {
      console.warn(`[incremental-embedder] 从数据库获取rawContent失败:`, dbError);
    }
  }

  if (!pdfBuffer && !content) {
    console.error(`[incremental-embedder] 无法获取文档内容, docId: ${docId}, fileName: ${document.fileName}`);
    try {
      const { db } = await import("@/server/db");
      const { documents } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(documents).set({ status: "failed" }).where(eq(documents.id, docId));
    } catch (updateError) {
      console.error(`[incremental-embedder] 更新文档状态为failed也失败:`, updateError);
    }
    return;
  }

  let chunkResult;
  try {
    if (pdfBuffer) {
      chunkResult = await chunkDocument(pdfBuffer, document.fileName);
    } else if (content) {
      chunkResult = await chunkDocument(content, document.fileName);
    }
    console.log(`[incremental-embedder] 文档切片完成, 共 ${chunkResult.chunks.length} 个 chunk`);
  } catch (error) {
    console.error(`[incremental-embedder] 文档切片失败, docId: ${docId}:`, error);
    throw error;
  }

  const chunks = chunkResult.chunks;

  if (chunks.length === 0) {
    console.warn(`[incremental-embedder] 文档切片结果为空, docId: ${docId}`);
    return;
  }

  const chunkTexts = chunks.map((chunk) => chunk.text);
  let embResults: number[][];
  try {
    embResults = await generateEmbeddings(chunkTexts);
    console.log(`[incremental-embedder] Embedding 生成完成, 数量: ${embResults.length}`);
  } catch (error) {
    console.error(`[incremental-embedder] Embedding 生成失败, docId: ${docId}:`, error);
    throw error;
  }

  const storeItems = chunks.map((chunk, index) => ({
    documentId: docId,
    chunkIndex: chunk.index,
    chunkText: chunk.text,
    embedding: embResults[index],
    tokenCount: chunk.metadata.tokenCount,
  }));

  try {
    await storeEmbeddings(storeItems);
    console.log(`[incremental-embedder] Embedding 存储完成, docId: ${docId}, 共 ${storeItems.length} 条`);
  } catch (error) {
    console.error(`[incremental-embedder] Embedding 存储失败, docId: ${docId}:`, error);
    throw error;
  }

  try {
    await db.update(documents).set({ status: "indexed" }).where(eq(documents.id, docId));
    console.log(`[incremental-embedder] 文档状态已更新为 indexed, docId: ${docId}`);
  } catch (error) {
    console.error(`[incremental-embedder] 更新文档状态失败, docId: ${docId}:`, error);
  }
}

export async function processDocumentChange(
  docId: string,
  action: "insert" | "update" | "delete"
): Promise<void> {
  console.log(`[incremental-embedder] 处理文档变更: docId=${docId}, action=${action}`);
  const startTime = Date.now();

  try {
    switch (action) {
      case "insert":
        console.log(`[incremental-embedder] insert 操作: 切片并生成 embedding, docId=${docId}`);
        await embedDocument(docId);
        break;

      case "update":
        console.log(`[incremental-embedder] update 操作: 重新切片并生成 embedding, docId=${docId}`);
        await embedDocument(docId);
        try {
          const { deleteGraph, createGraph } = await import("@/server/rag/graph/graph-builder");
          const { extractTriples } = await import("@/server/rag/graph/entity-extractor");
          await deleteGraph(docId);
          const document = await db.query.documents.findFirst({ where: eq(documents.id, docId) });
          if (document) {
            const fs = await import("fs/promises");
            const path = await import("path");
            const uploadDir = process.env.UPLOAD_DIR || "uploads";
            const filePath = path.join(uploadDir, document.fileKey);
            const fileBuffer = await fs.readFile(filePath);
            const content = fileBuffer.toString("utf-8");
            const triples = await extractTriples(content);
            await createGraph(docId, triples);
            console.log(`[incremental-embedder] 图谱同步更新完成, docId=${docId}`);
          }
        } catch (graphError) {
          console.warn(`[incremental-embedder] 图谱同步更新失败（非致命）, docId=${docId}:`, graphError);
        }
        try {
          const { rebuildBM25Index } = await import("@/server/rag/retrieval/sparse-retriever");
          await rebuildBM25Index();
          console.log(`[incremental-embedder] BM25 索引重建完成, docId=${docId}`);
        } catch (bm25Error) {
          console.warn(`[incremental-embedder] BM25 索引重建失败（非致命）, docId=${docId}:`, bm25Error);
        }
        break;

      case "delete":
        console.log(`[incremental-embedder] delete 操作: 删除 embedding 记录, docId=${docId}`);
        await deleteEmbeddingsForDocument(docId);
        break;

      default:
        console.error(`[incremental-embedder] 未知的 action 类型: ${action}`);
        throw new Error(`未知的 action 类型: ${action}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[incremental-embedder] 文档变更处理完成: docId=${docId}, action=${action}, 耗时: ${elapsed}ms`
    );
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(
      `[incremental-embedder] 文档变更处理失败: docId=${docId}, action=${action}, 耗时: ${elapsed}ms:`,
      error
    );
    throw error;
  }
}
