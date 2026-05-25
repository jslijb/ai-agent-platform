import { prisma } from "@/server/db/client";
import { chunkDocument } from "@/server/rag/chunking/semantic-chunker";
import { generateEmbeddings, storeEmbeddings } from "@/server/rag/retrieval/dense-retriever";

async function deleteEmbeddingsForDocument(docId: string): Promise<void> {
  console.log(`[incremental-embedder] 删除文档 ${docId} 的所有 embedding 记录`);

  try {
    const result = await prisma.embedding.deleteMany({
      where: { documentId: docId },
    });

    console.log(`[incremental-embedder] 已删除 ${result.count} 条 embedding 记录, docId: ${docId}`);
  } catch (error) {
    console.error(`[incremental-embedder] 删除 embedding 记录失败, docId: ${docId}:`, error);
    throw error;
  }
}

async function embedDocument(docId: string): Promise<void> {
  console.log(`[incremental-embedder] 开始为文档 ${docId} 生成 embedding`);

  let document;
  try {
    document = await prisma.document.findUnique({
      where: { id: docId },
    });
  } catch (error) {
    console.error(`[incremental-embedder] 查询文档失败, docId: ${docId}:`, error);
    throw error;
  }

  if (!document) {
    console.error(`[incremental-embedder] 文档不存在, docId: ${docId}`);
    throw new Error(`文档不存在: ${docId}`);
  }

  const existingEmbeddings = await prisma.embedding.count({
    where: { documentId: docId },
  });

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
      await prisma.document.update({
        where: { id: docId },
        data: { contentHash: currentHash },
      });
    } catch {
      console.warn(`[incremental-embedder] 内容哈希检查失败，继续重建, docId: ${docId}`);
    }
  }

  console.log(
    `[incremental-embedder] 文档信息: id=${document.id}, fileName=${document.fileName}, status=${document.status}`
  );

  await deleteEmbeddingsForDocument(docId);
  console.log(`[incremental-embedder] 已清除旧 embedding，开始重新切片和嵌入`);

  let content: string;
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadDir = process.env.UPLOAD_DIR || "uploads";
    const filePath = path.join(uploadDir, document.fileKey);

    const fileBuffer = await fs.readFile(filePath);
    content = fileBuffer.toString("utf-8");
    console.log(`[incremental-embedder] 从本地文件系统获取文档内容成功, 长度: ${content.length}, 路径: ${filePath}`);
  } catch (fsError) {
    console.warn(`[incremental-embedder] 从本地文件系统获取文档内容失败:`, fsError);

    try {
      const { Client } = await import("pg");
      const dbUrl = process.env.DATABASE_URL;
      if (!dbUrl) {
        throw new Error("DATABASE_URL 未设置");
      }

      const parsed = new URL(dbUrl);
      const pgClient = new Client({
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || 5432,
        database: parsed.pathname.slice(1),
        user: parsed.username,
        password: parsed.password,
      });

      await pgClient.connect();
      const res = await pgClient.query(
        `SELECT "chunkText" FROM "Embedding" WHERE "documentId" = $1 ORDER BY "chunkIndex"`,
        [docId]
      );
      await pgClient.end();

      if (res.rows.length > 0) {
        content = res.rows.map((row: { chunkText: string }) => row.chunkText).join("\n\n");
        console.log(`[incremental-embedder] 从数据库获取已有切片内容成功, 切片数: ${res.rows.length}`);
      } else {
        console.warn(`[incremental-embedder] 数据库中无已有切片, 使用文件名作为内容`);
        content = document.fileName;
      }
    } catch (dbError) {
      console.warn(`[incremental-embedder] 从数据库获取内容也失败:`, dbError);
      content = document.fileName;
    }
  }

  let chunks;
  try {
    chunks = await chunkDocument(content, document.fileName);
    console.log(`[incremental-embedder] 文档切片完成, 共 ${chunks.length} 个 chunk`);
  } catch (error) {
    console.error(`[incremental-embedder] 文档切片失败, docId: ${docId}:`, error);
    throw error;
  }

  if (chunks.length === 0) {
    console.warn(`[incremental-embedder] 文档切片结果为空, docId: ${docId}`);
    return;
  }

  const chunkTexts = chunks.map((chunk) => chunk.text);
  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(chunkTexts);
    console.log(`[incremental-embedder] Embedding 生成完成, 数量: ${embeddings.length}`);
  } catch (error) {
    console.error(`[incremental-embedder] Embedding 生成失败, docId: ${docId}:`, error);
    throw error;
  }

  const storeItems = chunks.map((chunk, index) => ({
    documentId: docId,
    chunkIndex: chunk.index,
    chunkText: chunk.text,
    embedding: embeddings[index],
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
    await prisma.document.update({
      where: { id: docId },
      data: { status: "indexed" },
    });
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
          const document = await prisma.document.findUnique({ where: { id: docId } });
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
