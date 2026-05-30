import { config } from "dotenv";
config({ path: ".env.local" });
config();
import "dotenv/config";
import { db, sql } from "../src/server/db/client";
import { documents, embeddings } from "../src/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { chunkDocument, chunkText, chunkMarkdown } from "../src/server/rag/chunking/semantic-chunker";
import { cleanText } from "../src/server/rag/chunking/text-cleaner";
import { generateEmbeddings, storeEmbeddings } from "../src/server/rag/retrieval/dense-retriever";
import { rebuildBM25Index } from "../src/server/rag/retrieval/sparse-retriever";
import { buildParentChildMapping } from "../src/server/rag/chunking/parent-document";

async function rechunkFromRawContent(rawContent: string, fileName: string) {
  const cleanedContent = cleanText(rawContent);
  const ext = fileName.toLowerCase().split(".").pop();
  const isMarkdown = cleanedContent.includes("# ") && (cleanedContent.includes("## ") || cleanedContent.match(/^#{1,3}\s/m));
  if (ext === "md" || ext === "markdown" || isMarkdown) {
    return await chunkMarkdown(cleanedContent);
  }
  return await chunkText(cleanedContent);
}

async function main() {
  console.log("=".repeat(80));
  console.log("重建索引脚本（使用新切片策略）");
  console.log("=".repeat(80));

  const allDocs = await db.select().from(documents).orderBy(desc(documents.createdAt));
  console.log(`\n找到 ${allDocs.length} 个文档`);

  for (const doc of allDocs) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`处理文档: ${doc.fileName} (id: ${doc.id})`);

    if (!doc.rawContent) {
      console.error(`  ❌ 文档无 rawContent，跳过`);
      continue;
    }

    console.log(`  rawContent 长度: ${doc.rawContent.length}`);

    console.log(`  删除旧 Embedding 记录...`);
    const oldEmbeddings = await db.select({ id: embeddings.id }).from(embeddings).where(eq(embeddings.documentId, doc.id));
    console.log(`  旧 Embedding 数量: ${oldEmbeddings.length}`);

    await db.delete(embeddings).where(eq(embeddings.documentId, doc.id));
    console.log(`  旧 Embedding 已删除`);

    console.log(`  重新切片 (使用 rawContent 文本直接切片)...`);
    const chunks = await rechunkFromRawContent(doc.rawContent, doc.fileName);
    console.log(`  新切片数量: ${chunks.length}`);

    console.log(`  生成 Embedding 向量...`);
    const texts = chunks.map(c => c.text);
    const embeddingResults = await generateEmbeddings(texts);
    console.log(`  Embedding 生成完成: ${embeddingResults.length} 个`);

    const storeItems = chunks.map((chunk, i) => ({
      documentId: doc.id,
      chunkIndex: chunk.index,
      chunkText: chunk.text,
      embedding: embeddingResults[i]!,
      tokenCount: chunk.metadata.tokenCount,
    }));

    await storeEmbeddings(storeItems);
    console.log(`  Embedding 存储完成`);

    const chunkItems = chunks.map((c, i) => ({ id: `chunk_${i}`, text: c.text }));
    buildParentChildMapping(chunkItems);
    console.log(`  父子文档映射构建完成`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("重建 BM25 索引...");
  await rebuildBM25Index();
  console.log("BM25 索引重建完成");

  console.log(`\n${"=".repeat(80)}`);
  console.log("重建完成! 统计:");
  for (const doc of allDocs) {
    const countResult = await db.select({ cnt: sql`count(*)::int` }).from(embeddings).where(eq(embeddings.documentId, doc.id));
    console.log(`  ${doc.fileName}: ${countResult[0]?.cnt ?? 0} 个 chunk`);
  }
  console.log("=".repeat(80));

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
