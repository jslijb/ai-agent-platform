/**
 * 重建索引 - 从 PDF 文件重新解析，补全 metadata（source/startPage/endPage）
 *
 * 背景：
 * - 历史bug：upload/route.ts 构造 storeItems 时丢弃了 chunk.metadata
 * - 已修复代码（upload/route.ts、incremental-embedder.ts、rebuild-index/route.ts 三处）
 * - 但已入库的 5160+ 条 embedding 的 metadata 仍为空 {}
 * - rebuild-index API 基于 rawContent（纯文本），无法恢复 PDF 页码
 * - 本脚本从 data/financial_reports/ 重新读取 PDF，走 chunkDocument 流程获取页码
 *
 * 运行：npx tsx scripts/rebuild-index-with-metadata.ts
 */
import * as fs from "fs";
import * as path from "path";

// 加载 .env.local 环境变量
const ENV_LOCAL_PATH = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(ENV_LOCAL_PATH)) {
  const envContent = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log("[rebuild] 已加载 .env.local 环境变量");
} else {
  console.warn("[rebuild] .env.local 不存在，使用系统环境变量");
}

import { db, sql } from "@/server/db/client";
import { documents, embeddings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { chunkDocument } from "@/server/rag/chunking/semantic-chunker";
import { generateEmbeddings, storeEmbeddings } from "@/server/rag/retrieval/dense-retriever";
import { batchAddToIndex } from "@/server/rag/retrieval/sparse-retriever";

const REPORTS_DIR = path.resolve(__dirname, "..", "data", "financial_reports");

interface RebuildResult {
  documentId: string;
  fileName: string;
  status: "success" | "skipped" | "failed";
  oldChunkCount: number;
  newChunkCount: number;
  hasMetadata: boolean;
  error?: string;
}

/**
 * 根据文档名查找对应的本地 PDF 文件
 */
function findLocalPdf(fileName: string): string | null {
  if (!fs.existsSync(REPORTS_DIR)) {
    console.warn("[rebuild] 报告目录不存在: " + REPORTS_DIR);
    return null;
  }

  // 精确匹配
  const exactPath = path.join(REPORTS_DIR, fileName);
  if (fs.existsSync(exactPath)) {
    return exactPath;
  }

  // 模糊匹配：提取股票代码或公司名
  const files = fs.readdirSync(REPORTS_DIR);
  const stockCodeMatch = fileName.match(/^(\d{6})/);
  if (stockCodeMatch) {
    const code = stockCodeMatch[1];
    const match = files.find((f) => f.startsWith(code) && f.endsWith(".pdf"));
    if (match) {
      return path.join(REPORTS_DIR, match);
    }
  }

  return null;
}

async function rebuildDocument(doc: any): Promise<RebuildResult> {
  const result: RebuildResult = {
    documentId: doc.id,
    fileName: doc.fileName,
    status: "skipped",
    oldChunkCount: 0,
    newChunkCount: 0,
    hasMetadata: false,
  };

  // 只处理 PDF 文档
  if (!doc.fileName.toLowerCase().endsWith(".pdf")) {
    result.status = "skipped";
    result.error = "非 PDF 文档，跳过（txt 文档无页码信息）";
    return result;
  }

  // 查找本地 PDF 文件
  const pdfPath = findLocalPdf(doc.fileName);
  if (!pdfPath) {
    result.status = "skipped";
    result.error = "本地未找到 PDF 文件，跳过";
    return result;
  }

  console.log("[rebuild] 处理文档: " + doc.fileName + " (PDF: " + path.basename(pdfPath) + ")");

  try {
    // 查旧 chunk 数
    const oldCount = await db.select({ cnt: sql<number>`count(*)::int` }).from(embeddings).where(eq(embeddings.documentId, doc.id));
    result.oldChunkCount = oldCount[0]?.cnt ?? 0;

    // 读取 PDF 文件
    const buffer = fs.readFileSync(pdfPath);
    console.log("[rebuild]   PDF 大小: " + (buffer.length / 1024 / 1024).toFixed(2) + " MB");

    // 重新分块（走 chunkDocument，获取页码 metadata）
    console.log("[rebuild]   开始分块...");
    const chunkResult = await chunkDocument(buffer, doc.fileName);
    const chunks = chunkResult.chunks;
    console.log("[rebuild]   分块完成: " + chunks.length + " 个 chunk");

    // 验证 chunk 是否有页码 metadata
    const withPage = chunks.filter((c) => c.metadata && c.metadata.startPage !== undefined).length;
    console.log("[rebuild]   含页码 metadata: " + withPage + "/" + chunks.length);
    result.hasMetadata = withPage > 0;

    // 生成 embedding
    console.log("[rebuild]   生成 embedding...");
    const texts = chunks.map((c) => c.text);
    const embeddingResults = await generateEmbeddings(texts);
    console.log("[rebuild]   embedding 生成完成: " + embeddingResults.length + " 个");

    // 删除旧 embedding
    console.log("[rebuild]   删除旧 embedding...");
    await db.delete(embeddings).where(eq(embeddings.documentId, doc.id));

    // 构造 storeItems（包含完整 metadata）
    const storeItems = chunks.map((chunk, i) => ({
      documentId: doc.id,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddingResults[i]!,
      tokenCount: chunk.metadata.tokenCount,
      metadata: chunk.metadata,  // 关键：保留完整 metadata（source/startPage/endPage/pageNum）
    }));

    // 存储
    console.log("[rebuild]   存储新 embedding...");
    await storeEmbeddings(storeItems);

    // 重建 BM25 索引
    console.log("[rebuild]   重建 BM25 索引...");
    const bm25Items = chunks.map((chunk, i) => ({
      id: i,
      text: chunk.text,
      documentId: doc.id,
    }));
    await batchAddToIndex(bm25Items);

    result.newChunkCount = chunks.length;
    result.status = "success";
    console.log("[rebuild]   ✓ 完成: " + doc.fileName + " (" + result.oldChunkCount + " → " + result.newChunkCount + " chunks, metadata=" + result.hasMetadata + ")");
  } catch (e) {
    result.status = "failed";
    result.error = e instanceof Error ? e.message : String(e);
    console.error("[rebuild]   ✗ 失败: " + doc.fileName + " - " + result.error);
  }

  return result;
}

async function main() {
  console.log("====================================================");
  console.log("重建索引 - 补全 metadata（source/startPage/endPage）");
  console.log("====================================================");

  // 查询所有 PDF 文档
  const allDocs = await db.select().from(documents);
  const pdfDocs = allDocs.filter((d) => d.fileName.toLowerCase().endsWith(".pdf"));
  console.log("总文档数: " + allDocs.length + ", PDF 文档数: " + pdfDocs.length);

  const results: RebuildResult[] = [];
  for (const doc of pdfDocs) {
    const result = await rebuildDocument(doc);
    results.push(result);
  }

  // 汇总
  console.log("\n====================================================");
  console.log("重建汇总");
  console.log("====================================================");
  const success = results.filter((r) => r.status === "success");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "failed");
  console.log("成功: " + success.length + ", 跳过: " + skipped.length + ", 失败: " + failed.length);

  console.log("\n| 文档名 | 状态 | 旧chunks | 新chunks | 有metadata |");
  console.log("|:---|:---|:---|:---|:---|");
  for (const r of results) {
    console.log("| " + r.fileName + " | " + r.status + " | " + r.oldChunkCount + " | " + r.newChunkCount + " | " + r.hasMetadata + " |");
  }

  if (failed.length > 0) {
    console.log("\n失败详情:");
    for (const r of failed) {
      console.log("  " + r.fileName + ": " + r.error);
    }
  }

  // 验证 metadata 是否补全
  console.log("\n====================================================");
  console.log("验证 metadata 补全情况");
  console.log("====================================================");
  const verifyResult = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN metadata ? 'source' THEN 1 END) as has_source,
      COUNT(CASE WHEN metadata ? 'startPage' THEN 1 END) as has_startpage
    FROM "Embedding"
  `);
  console.log("验证结果: " + JSON.stringify(verifyResult.rows[0]));

  process.exit(0);
}

main().catch((e) => {
  console.error("重建索引异常:", e);
  process.exit(1);
});
