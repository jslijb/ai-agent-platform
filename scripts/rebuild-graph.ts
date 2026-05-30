import { config } from "dotenv";
config({ path: ".env.local" });
config();
import "dotenv/config";
import { db } from "../src/server/db/client";
import { documents } from "../src/server/db/schema";
import { desc } from "drizzle-orm";
import { extractTriples } from "../src/server/rag/graph/entity-extractor";
import { createGraph, isNeo4jAvailable } from "../src/server/rag/graph/graph-builder";
import { embeddings } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("=".repeat(60));
  console.log("为五粮液文档建立知识图谱");
  console.log("=".repeat(60));

  const docRows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      status: documents.status,
      rawContent: documents.rawContent,
    })
    .from(documents)
    .orderBy(desc(documents.createdAt));

  console.log(`\n数据库中共有 ${docRows.length} 个文档:`);
  docRows.forEach((d, i) => {
    console.log(`  [${i + 1}] ${d.fileName} | id: ${d.id} | status: ${d.status} | rawContent: ${d.rawContent ? d.rawContent.length + "字" : "无"}`);
  });

  const wlyDoc = docRows.find(d => d.fileName.includes("五粮液") || d.fileName.includes("000858"));
  if (!wlyDoc) {
    console.error("❌ 未找到五粮液文档（匹配关键词: 五粮液 或 000858）");
    process.exit(1);
  }

  console.log(`\n文档: ${wlyDoc.fileName} (${wlyDoc.id})`);
  console.log(`状态: ${wlyDoc.status}`);

  const neo4jAvailable = await isNeo4jAvailable();
  console.log(`Neo4j: ${neo4jAvailable ? "可用" : "不可用"}`);

  if (!neo4jAvailable) {
    console.error("❌ Neo4j 不可用，无法建立知识图谱");
    process.exit(1);
  }

  let textToExtract = "";
  const GRAPH_MAX_CHUNKS = 50;
  const GRAPH_MAX_TEXT_LENGTH = 50000;

  if (wlyDoc.rawContent) {
    textToExtract = wlyDoc.rawContent.slice(0, GRAPH_MAX_TEXT_LENGTH);
    console.log(`使用原文内容, 长度: ${textToExtract.length}`);
  } else {
    const chunkRows = await db
      .select({ chunkIndex: embeddings.chunkIndex, chunkText: embeddings.chunkText })
      .from(embeddings)
      .where(eq(embeddings.documentId, wlyDoc.id))
      .orderBy(embeddings.chunkIndex);

    const selectedChunks = chunkRows.slice(0, GRAPH_MAX_CHUNKS);
    textToExtract = selectedChunks.map(c => c.chunkText).join("\n");
    textToExtract = textToExtract.slice(0, GRAPH_MAX_TEXT_LENGTH);
    console.log(`使用切片内容, 切片数: ${selectedChunks.length}/${chunkRows.length}, 长度: ${textToExtract.length}`);
  }

  console.log("\n开始提取三元组...");
  try {
    const triples = await extractTriples(textToExtract);
    console.log(`\n提取到 ${triples.length} 个三元组`);

    if (triples.length > 0) {
      console.log("前5个三元组:");
      triples.slice(0, 5).forEach(t => console.log(`  ${t.head} -[${t.relation}]-> ${t.tail}`));

      await createGraph(wlyDoc.id, triples);
      console.log("✅ 知识图谱构建完成!");
    } else {
      console.log("⚠️ 未提取到三元组");
    }

    const existingMeta: Record<string, unknown> = {};
    const graphStatus = triples.length > 0 ? "completed" : "no_triples";
    const graphMessage = triples.length > 0 ? `成功提取 ${triples.length} 个三元组` : "未提取到三元组";

    await db
      .update(documents)
      .set({
        metadata: { ...existingMeta, graphStatus, graphMessage },
      })
      .where(eq(documents.id, wlyDoc.id));

    console.log(`文档状态已更新: graphStatus=${graphStatus}`);
  } catch (error) {
    console.error("❌ 提取三元组失败:", error);
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
