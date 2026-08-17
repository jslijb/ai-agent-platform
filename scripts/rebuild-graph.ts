import { config } from "dotenv";
config({ path: ".env.local" });
config();
import "dotenv/config";
import { db } from "../src/server/db/client";
import { documents, embeddings } from "../src/server/db/schema";
import { desc, eq } from "drizzle-orm";
import { extractEnhancedTriples } from "../src/server/rag/graph/entity-extractor-v2";
import { loadCompanyAliases } from "../src/server/rag/graph/entity-classifier";
import {
  isNeo4jAvailable,
  createEnhancedGraph,
  deleteEnhancedGraph,
  getGraphStats,
  saveProgress,
  loadProgress,
  clearProgress,
  type GraphProgress,
} from "../src/server/rag/graph/graph-builder-v2";
import { stockMapping } from "../src/server/db/schema";
import { getRedis, isRedisConnected as checkRedisConnected } from "../src/server/lib/redis";

interface CliArgs {
  docId?: string;
  dryRun: boolean;
  resume: boolean;
  all: boolean;
  clean: boolean;
  stats: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    dryRun: false,
    resume: false,
    all: false,
    clean: false,
    stats: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--doc-id":
        result.docId = args[++i];
        break;
      case "--dry-run":
        result.dryRun = true;
        break;
      case "--resume":
        result.resume = true;
        break;
      case "--all":
        result.all = true;
        break;
      case "--clean":
        result.clean = true;
        break;
      case "--stats":
        result.stats = true;
        break;
      case "--help":
        console.log(`
知识图谱重建脚本 (V2 - 增强版)

用法: npx tsx scripts/rebuild-graph.ts [选项]

选项:
  --doc-id <id>   只处理指定文档ID
  --dry-run       只提取三元组，不写入Neo4j
  --resume        断点续传，跳过已完成的文档
  --all           处理所有文档（默认只处理五粮液）
  --clean         清除指定文档的图谱数据后重建
  --stats         显示当前图谱统计信息
  --help          显示帮助信息

示例:
  npx tsx scripts/rebuild-graph.ts --stats
  npx tsx scripts/rebuild-graph.ts --doc-id abc123 --dry-run
  npx tsx scripts/rebuild-graph.ts --all --resume
  npx tsx scripts/rebuild-graph.ts --doc-id abc123 --clean
`);
        process.exit(0);
    }
  }

  return result;
}

const GRAPH_MAX_CHUNKS = 50;
const GRAPH_MAX_TEXT_LENGTH = 50000;

async function getDocumentText(docId: string): Promise<{
  fileName: string;
  text: string;
  chunkCount: number;
}> {
  const docRows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      rawContent: documents.rawContent,
    })
    .from(documents)
    .where(eq(documents.id, docId));

  if (docRows.length === 0) {
    throw new Error(`文档 ${docId} 不存在`);
  }

  const doc = docRows[0];
  let textToExtract = "";
  let chunkCount = 0;

  if (doc.rawContent) {
    textToExtract = doc.rawContent.slice(0, GRAPH_MAX_TEXT_LENGTH);
    console.log(`  使用原文内容, 长度: ${textToExtract.length}`);
  } else {
    const chunkRows = await db
      .select({ chunkIndex: embeddings.chunkIndex, chunkText: embeddings.chunkText })
      .from(embeddings)
      .where(eq(embeddings.documentId, docId))
      .orderBy(embeddings.chunkIndex);

    const selectedChunks = chunkRows.slice(0, GRAPH_MAX_CHUNKS);
    textToExtract = selectedChunks.map((c) => c.chunkText).join("\n");
    textToExtract = textToExtract.slice(0, GRAPH_MAX_TEXT_LENGTH);
    chunkCount = chunkRows.length;
    console.log(`  使用切片内容, 切片数: ${selectedChunks.length}/${chunkRows.length}, 长度: ${textToExtract.length}`);
  }

  return { fileName: doc.fileName, text: textToExtract, chunkCount };
}

async function processDocument(
  docId: string,
  dryRun: boolean,
  resume: boolean
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`处理文档: ${docId}`);
  console.log(`${"=".repeat(60)}`);

  if (resume) {
    const progress = await loadProgress(docId);
    if (progress && progress.status === "completed") {
      console.log(`  ⏭️ 文档已完成，跳过 (进度: ${progress.processedChunks}/${progress.totalChunks})`);
      return;
    }
    if (progress && progress.status === "processing") {
      console.log(`  🔄 发现断点记录，将从上次进度继续 (已处理: ${progress.processedChunks}/${progress.totalChunks})`);
    }
  }

  const { fileName, text } = await getDocumentText(docId);
  console.log(`  文件名: ${fileName}`);
  console.log(`  文本长度: ${text.length}`);

  if (text.length === 0) {
    console.log(`  ⚠️ 文档无内容，跳过`);
    return;
  }

  const progress: GraphProgress = {
    docId,
    processedChunks: 0,
    totalChunks: 1,
    status: "processing",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveProgress(progress);

  console.log("\n  开始提取增强三元组 (V2)...");
  const startTime = Date.now();

  const triples = await extractEnhancedTriples(text);
  const extractTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n  提取完成, 耗时: ${extractTime}s, 三元组数: ${triples.length}`);

  if (triples.length > 0) {
    const stats = {
      byRelationType: {} as Record<string, number>,
      byHeadType: {} as Record<string, number>,
      withValue: triples.filter((t) => t.value).length,
    };
    for (const t of triples) {
      stats.byRelationType[t.relationType] = (stats.byRelationType[t.relationType] || 0) + 1;
      stats.byHeadType[t.headType] = (stats.byHeadType[t.headType] || 0) + 1;
    }

    console.log("\n  三元组统计:");
    console.log(`    关系类型分布: ${JSON.stringify(stats.byRelationType)}`);
    console.log(`    头实体类型分布: ${JSON.stringify(stats.byHeadType)}`);
    console.log(`    含数值的关系: ${stats.withValue}`);

    console.log("\n  前10个三元组:");
    triples.slice(0, 10).forEach((t) => {
      const valueStr = t.value ? ` [value=${t.value}]` : "";
      console.log(`    (${t.head}:${t.headType}) -[${t.relationType}]-> (${t.tail}:${t.tailType})${valueStr}`);
    });

    if (dryRun) {
      console.log("\n  🔍 DRY RUN 模式，跳过写入Neo4j");
    } else {
      console.log("\n  写入Neo4j...");
      const { nodeCount, relCount } = await createEnhancedGraph(docId, triples);
      console.log(`  ✅ 写入完成: ${nodeCount} 个节点, ${relCount} 条关系`);
    }
  } else {
    console.log("  ⚠️ 未提取到三元组");
  }

  const existingDoc = await db
    .select({ metadata: documents.metadata })
    .from(documents)
    .where(eq(documents.id, docId));

  const existingMeta = (existingDoc[0]?.metadata as Record<string, unknown>) || {};
  const graphStatus = triples.length > 0 ? "completed" : "no_triples";
  const graphMessage = triples.length > 0
    ? `V2: 成功提取 ${triples.length} 个增强三元组`
    : "V2: 未提取到三元组";

  await db
    .update(documents)
    .set({
      metadata: {
        ...existingMeta,
        graphStatus,
        graphMessage,
        graphVersion: "v2",
        graphExtractTime: extractTime,
        graphTripleCount: triples.length,
      },
    })
    .where(eq(documents.id, docId));

  progress.processedChunks = progress.totalChunks;
  progress.status = "completed";
  progress.updatedAt = new Date().toISOString();
  await saveProgress(progress);

  console.log(`  文档状态已更新: graphStatus=${graphStatus}`);
}

async function showStats(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("当前知识图谱统计");
  console.log("=".repeat(60));

  const stats = await getGraphStats();
  console.log(`\n  节点总数: ${stats.nodeCount}`);
  console.log(`  关系总数: ${stats.relCount}`);

  if (Object.keys(stats.labelCounts).length > 0) {
    console.log("\n  节点标签分布:");
    for (const [label, count] of Object.entries(stats.labelCounts)) {
      console.log(`    ${label}: ${count}`);
    }
  }

  if (Object.keys(stats.relTypeCounts).length > 0) {
    console.log("\n  关系类型分布:");
    for (const [relType, count] of Object.entries(stats.relTypeCounts)) {
      console.log(`    ${relType}: ${count}`);
    }
  }
}

async function main() {
  const cliArgs = parseArgs();

  console.log("=".repeat(60));
  console.log("知识图谱重建脚本 (V2 - 增强版)");
  console.log("=".repeat(60));
  console.log(`模式: ${cliArgs.dryRun ? "DRY-RUN" : "写入"} | ${cliArgs.resume ? "断点续传" : "全新处理"}`);

  const companies = await db
    .select({
      stockNameShort: stockMapping.stockNameShort,
      stockNameFull: stockMapping.stockNameFull,
      stockNameAlias: stockMapping.stockNameAlias,
    })
    .from(stockMapping);

  loadCompanyAliases(
    companies.map((c) => ({
      shortName: c.stockNameShort,
      fullName: c.stockNameFull,
      aliases: (c.stockNameAlias as string[]) || [],
    }))
  );
  console.log(`公司别名已加载: ${companies.length} 家公司`);

  try {
    await getRedis();
    console.log(`Redis: ${checkRedisConnected() ? "✅ 已连接" : "❌ 未连接"}`);
  } catch (error) {
    console.warn(`Redis: ❌ 连接失败 (${error instanceof Error ? error.message : String(error)})`);
  }

  if (cliArgs.stats) {
    await showStats();
    process.exit(0);
  }

  const neo4jAvailable = await isNeo4jAvailable();
  console.log(`Neo4j: ${neo4jAvailable ? "✅ 可用" : "❌ 不可用"}`);

  if (!neo4jAvailable && !cliArgs.dryRun) {
    console.error("❌ Neo4j 不可用且非 dry-run 模式，无法继续");
    process.exit(1);
  }

  let docIds: string[] = [];

  if (cliArgs.clean && cliArgs.docId) {
    console.log(`\n🧹 清除文档 ${cliArgs.docId} 的图谱数据...`);
    await deleteEnhancedGraph(cliArgs.docId);
    await clearProgress(cliArgs.docId);
    console.log("  清除完成");
  }

  if (cliArgs.docId) {
    docIds = [cliArgs.docId];
  } else {
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
      const contentLen = d.rawContent ? d.rawContent.length : 0;
      console.log(`  [${i + 1}] ${d.fileName} | id: ${d.id} | status: ${d.status} | content: ${contentLen > 0 ? contentLen + "字" : "无"}`);
    });

    if (cliArgs.all) {
      docIds = docRows.map((d) => d.id);
      console.log(`\n📋 --all 模式: 将处理全部 ${docIds.length} 个文档`);
    } else {
      const wlyDoc = docRows.find(
        (d) => d.fileName.includes("五粮液") || d.fileName.includes("000858")
      );
      if (!wlyDoc) {
        console.error("❌ 未找到五粮液文档。使用 --doc-id <id> 指定文档，或 --all 处理全部");
        process.exit(1);
      }
      docIds = [wlyDoc.id];
      console.log(`\n📋 默认模式: 只处理五粮液文档 (${wlyDoc.fileName})`);
    }
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const docId of docIds) {
    try {
      if (cliArgs.resume) {
        const progress = await loadProgress(docId);
        if (progress && progress.status === "completed") {
          console.log(`\n⏭️ 文档 ${docId} 已完成，跳过`);
          skipCount++;
          continue;
        }
      }

      await processDocument(docId, cliArgs.dryRun, cliArgs.resume);
      successCount++;
    } catch (error) {
      console.error(`\n❌ 文档 ${docId} 处理失败:`, error instanceof Error ? error.message : error);
      failCount++;

      const progress: GraphProgress = {
        docId,
        processedChunks: 0,
        totalChunks: 1,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveProgress(progress);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("处理完成");
  console.log("=".repeat(60));
  console.log(`  成功: ${successCount} | 失败: ${failCount} | 跳过: ${skipCount} | 总计: ${docIds.length}`);

  if (!cliArgs.dryRun && successCount > 0) {
    await showStats();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
