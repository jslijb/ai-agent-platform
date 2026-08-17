/**
 * 直接上传知识库文档到 RAG 系统（绕过 HTTP API）
 *
 * 用途：当 main-service 未运行时，直接调用 chunkDocument + storeEmbeddings + batchAddToIndex
 * 将 data/knowledge_docs/ 下的 txt 文档导入知识库。
 *
 * 运行：npx tsx scripts/upload-knowledge-docs-direct.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// 加载 .env.local 环境变量（tsx 直接运行脚本时不会自动加载）
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });

import { db } from "../src/server/db/client";
import { documents } from "../src/server/db/schema";
import { chunkDocument } from "../src/server/rag/chunking/semantic-chunker";
import {
  generateEmbeddings,
  storeEmbeddings,
} from "../src/server/rag/retrieval/dense-retriever";
import { batchAddToIndex } from "../src/server/rag/retrieval/sparse-retriever";
import { eq } from "drizzle-orm";

const KNOWLEDGE_DOCS_DIR = path.resolve(__dirname, "..", "data", "knowledge_docs");
const USER_ID = "69ea0f70-00a0-426b-aa5f-0e198d0f69d3";
const DELAY_MS = 2000; // 文档间间隔，避免 embedding 服务过载

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadSingleDoc(
  filePath: string,
  fileName: string
): Promise<{ success: boolean; chunks: number; documentId?: string; error?: string }> {
  let documentId: string | undefined;
  try {
    const buffer = fs.readFileSync(filePath);

    // 1. 创建文档记录
    const [doc] = await db
      .insert(documents)
      .values({
        fileName,
        fileKey: `knowledge_docs/${fileName}`, // fileKey 非空，记录存储路径
        fileSize: buffer.length,
        mimeType: "text/plain",
        status: "chunking",
        metadata: { step: "1/4", stepName: "分块处理", uploadedBy: "direct-script" },
        userId: USER_ID,
      })
      .returning({ id: documents.id });
    documentId = doc.id;
    console.log(`[upload] 文档记录已创建: ${fileName}, id=${documentId}`);

    // 2. 分块
    const result = await chunkDocument(buffer, fileName);
    const chunks = result.chunks;
    console.log(`[upload] 分块完成: ${chunks.length} 个分块`);

    await db
      .update(documents)
      .set({
        status: "embedding",
        metadata: { step: "2/4", stepName: "生成嵌入向量", chunkCount: chunks.length },
      })
      .where(eq(documents.id, documentId));

    // 3. 生成嵌入
    const texts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(texts);
    console.log(`[upload] 嵌入向量生成完成: ${embeddings.length} 个`);

    // 4. 存储嵌入（保留完整 metadata）
    const storeItems = chunks.map((chunk, i) => ({
      documentId: documentId!,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddings[i]!,
      tokenCount: chunk.metadata.tokenCount,
      metadata: chunk.metadata,
    }));
    await storeEmbeddings(storeItems);
    console.log(`[upload] 嵌入存储完成`);

    // 5. BM25 索引
    await db
      .update(documents)
      .set({
        status: "indexing",
        metadata: { step: "3/4", stepName: "添加BM25索引", chunkCount: chunks.length },
      })
      .where(eq(documents.id, documentId));

    await batchAddToIndex(
      chunks.map((c) => ({ id: `${documentId}-${c.index}`, text: c.text }))
    );
    console.log(`[upload] BM25 索引完成`);

    // 6. 完成
    await db
      .update(documents)
      .set({
        status: "completed",
        metadata: { step: "4/4", stepName: "完成", chunkCount: chunks.length },
      })
      .where(eq(documents.id, documentId));

    console.log(`[upload] ✓ ${fileName} 上传完成 (${chunks.length} 块)`);
    return { success: true, chunks: chunks.length, documentId };
  } catch (error) {
    console.error(`[upload] ✗ ${fileName} 上传失败:`, error);
    // 标记文档为失败
    if (documentId) {
      try {
        await db
          .update(documents)
          .set({ status: "failed", metadata: { error: String(error).slice(0, 500) } })
          .where(eq(documents.id, documentId));
      } catch {}
    }
    return { success: false, chunks: 0, documentId, error: String(error) };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("  直接上传知识库文档到 RAG 系统");
  console.log(`  文档目录: ${KNOWLEDGE_DOCS_DIR}`);
  console.log("=".repeat(60));

  if (!fs.existsSync(KNOWLEDGE_DOCS_DIR)) {
    console.error(`目录不存在: ${KNOWLEDGE_DOCS_DIR}`);
    process.exit(1);
  }

  // 检查已上传的文档（避免重复）
  const existingDocs = await db
    .select({ id: documents.id, fileName: documents.fileName })
    .from(documents);
  const existingNames = new Set(existingDocs.map((d) => d.fileName));
  console.log(`知识库已有文档: ${existingNames.size} 个`);

  const files = fs
    .readdirSync(KNOWLEDGE_DOCS_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  console.log(`待上传文件: ${files.length} 个\n`);

  let success = 0;
  let skip = 0;
  let fail = 0;
  const results: Array<{ file: string; status: string; chunks: number }> = [];

  for (const fileName of files) {
    const filePath = path.join(KNOWLEDGE_DOCS_DIR, fileName);
    if (existingNames.has(fileName)) {
      console.log(`[skip] ${fileName} (已存在)`);
      skip++;
      results.push({ file: fileName, status: "skip", chunks: 0 });
      continue;
    }

    const result = await uploadSingleDoc(filePath, fileName);
    if (result.success) {
      success++;
      results.push({ file: fileName, status: "success", chunks: result.chunks });
    } else {
      fail++;
      results.push({ file: fileName, status: "fail", chunks: 0 });
    }
    await sleep(DELAY_MS);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`上传完成: 成功=${success}, 跳过=${skip}, 失败=${fail}`);
  console.log("=".repeat(60));
  console.log("\n详细结果:");
  for (const r of results) {
    const mark = r.status === "success" ? "✓" : r.status === "skip" ? "→" : "✗";
    console.log(`  ${mark} ${r.file} (${r.chunks} 块)`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("脚本执行失败:", error);
  process.exit(1);
});
