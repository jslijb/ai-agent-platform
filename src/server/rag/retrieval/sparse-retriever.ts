import { db } from "@/server/db/client";
import { embeddings } from "@/server/db/schema";
import { asc } from "drizzle-orm";
import { expandQuery } from "@/server/rag/query/query-expander";

const STOP_WORDS = new Set([
  "的", "了", "是", "在", "和", "有", "不", "这", "个", "为",
  "与", "对", "中", "一", "上", "也", "而", "到", "说", "要",
  "就", "都", "会", "着", "没有", "好", "自己", "她",
]);

const BM25_K1 = 1.5;
const BM25_B = 0.75;

function preprocessForBM25(text: string): string {
  let result = text.replace(/(\d),(\d)/g, "$1$2");
  result = result.replace(/[，。、；：！？""''【】《》（）…—·\-.!,;:!?()[\]{}<>]/g, " ");
  result = result.toLowerCase();
  result = result.replace(/\s+/g, " ").trim();
  return result;
}

export interface BM25Index {
  docs: Map<number, { tokens: string[]; text: string; documentId: string }>;
  df: Map<string, number>;
  avgDL: number;
  docCount: number;
}

interface SparseSearchResult {
  id: number;
  text: string;
  documentId: string;
  score: number;
}

let bm25Index: BM25Index = {
  docs: new Map(),
  df: new Map(),
  avgDL: 0,
  docCount: 0,
};

let jiebaAvailable = false;

function simpleTokenize(text: string): string[] {
  const tokens: string[] = [];
  const segs = text.split(/[\s,，。！？；：、""''（）【】《》\n\r\t]+/);
  for (const seg of segs) {
    if (seg.trim().length === 0) continue;
    if (/^[\u4e00-\u9fa5]+$/.test(seg)) {
      for (let i = 0; i < seg.length; i++) {
        const bigram = seg.substring(i, i + 2);
        if (bigram.length === 2) tokens.push(bigram);
      }
      for (const ch of seg) tokens.push(ch);
    } else {
      tokens.push(seg);
    }
  }
  return tokens.filter((t) => t.trim().length > 0 && !STOP_WORDS.has(t));
}

async function jiebaTokenizeBatch(texts: string[]): Promise<string[][]> {
  try {
    const { execFileSync } = await import("child_process");
    const nodePath = await import("path");
    const nodeFs = await import("fs");
    const os = await import("os");

    const tmpDir = os.tmpdir();
    const uniqueId = `jieba_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inputPath = nodePath.join(tmpDir, `${uniqueId}_input.json`);
    const outputPath = nodePath.join(tmpDir, `${uniqueId}_output.json`);

    nodeFs.writeFileSync(inputPath, JSON.stringify({ texts }), "utf-8");

    const workerPath = nodePath.join(process.cwd(), "scripts", "jieba-worker.cjs");

    execFileSync("node", [workerPath, inputPath, outputPath], {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 50 * 1024 * 1024,
    });

    if (!nodeFs.existsSync(outputPath)) {
      throw new Error("jieba worker 未输出结果文件");
    }

    const resultStr = nodeFs.readFileSync(outputPath, "utf-8");
    try { nodeFs.unlinkSync(inputPath); } catch {}
    try { nodeFs.unlinkSync(outputPath); } catch {}

    const parsed = JSON.parse(resultStr);
    if (!parsed.success) {
      throw new Error(parsed.error || "jieba 分词失败");
    }

    jiebaAvailable = true;
    return parsed.results.map((tokens: string[]) =>
      tokens.filter((t: string) => t.trim().length > 0 && !STOP_WORDS.has(t))
    );
  } catch (error) {
    console.warn(`[sparse-retriever] nodejieba 子进程调用失败，使用纯JS分词: ${error instanceof Error ? error.message : String(error)}`);
    jiebaAvailable = false;
    return texts.map((text) => simpleTokenize(text));
  }
}

function tokenize(text: string): string[] {
  if (jiebaAvailable) {
    console.warn("[sparse-retriever] 单条 tokenize 不支持子进程模式，使用纯JS分词");
  }
  return simpleTokenize(preprocessForBM25(text));
}

function computeAvgDL(docs: Map<number, { tokens: string[] }>): number {
  if (docs.size === 0) return 0;
  let totalLength = 0;
  for (const doc of Array.from(docs.values())) {
    totalLength += doc.tokens.length;
  }
  return totalLength / docs.size;
}

function computeDF(docs: Map<number, { tokens: string[] }>): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of Array.from(docs.values())) {
    const seen = new Set<string>();
    for (const token of doc.tokens) {
      if (!seen.has(token)) {
        seen.add(token);
        df.set(token, (df.get(token) || 0) + 1);
      }
    }
  }
  return df;
}

export async function buildIndex(
  docs: Array<{ id: number; text: string; documentId: string }>
): Promise<BM25Index> {
  console.log(`[sparse-retriever] 构建 BM25 索引, 文档数: ${docs.length}`);

  const texts = docs.map((d) => preprocessForBM25(d.text));
  const allTokens = await jiebaTokenizeBatch(texts);

  const docsMap = new Map<number, { tokens: string[]; text: string; documentId: string }>();

  for (let i = 0; i < docs.length; i++) {
    docsMap.set(docs[i].id, { tokens: allTokens[i], text: docs[i].text, documentId: docs[i].documentId });
  }

  const df = computeDF(docsMap);
  const avgDL = computeAvgDL(docsMap);

  bm25Index = {
    docs: docsMap,
    df,
    avgDL,
    docCount: docsMap.size,
  };

  console.log(
    `[sparse-retriever] BM25 索引构建完成, 文档数: ${bm25Index.docCount}, 平均文档长度: ${bm25Index.avgDL.toFixed(2)}`
  );

  return bm25Index;
}

function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  df: Map<string, number>,
  docCount: number,
  avgDL: number,
  k1: number = BM25_K1,
  b: number = BM25_B
): number {
  const docLen = docTokens.length;
  const tfMap = new Map<string, number>();
  for (const token of docTokens) {
    tfMap.set(token, (tfMap.get(token) || 0) + 1);
  }

  let score = 0;

  for (const queryToken of queryTokens) {
    const tf = tfMap.get(queryToken) || 0;
    if (tf === 0) continue;

    const dfValue = df.get(queryToken) || 0;
    const idf = Math.log((docCount - dfValue + 0.5) / (dfValue + 0.5) + 1);

    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDL)));

    score += idf * tfNorm;
  }

  return score;
}

export async function sparseSearch(
  query: string,
  topK: number = 10
): Promise<SparseSearchResult[]> {
  console.log(`[sparse-retriever] BM25 检索, query: "${query.slice(0, 50)}...", topK: ${topK}`);

  if (bm25Index.docCount === 0) {
    console.warn("[sparse-retriever] BM25 索引为空, 尝试从数据库重建...");
    await rebuildIndexFromDB();
  }

  if (bm25Index.docCount === 0) {
    console.warn("[sparse-retriever] 数据库中无数据, 返回空结果");
    return [];
  }

  const expandedQuery = expandQuery(query);
  const queryTokens = tokenize(expandedQuery);
  console.log(`[sparse-retriever] 查询分词结果: [${queryTokens.join(", ")}]`);

  const scoredDocs: SparseSearchResult[] = [];

  for (const [docId, doc] of Array.from(bm25Index.docs)) {
    const score = bm25Score(
      queryTokens,
      doc.tokens,
      bm25Index.df,
      bm25Index.docCount,
      bm25Index.avgDL
    );

    if (score > 0) {
      scoredDocs.push({
        id: docId,
        text: doc.text,
        documentId: doc.documentId,
        score,
      });
    }
  }

  scoredDocs.sort((a, b) => b.score - a.score);

  const results = scoredDocs.slice(0, topK);
  console.log(`[sparse-retriever] BM25 检索完成, 返回 ${results.length} 条结果`);

  return results;
}

export async function addToIndex(
  id: number,
  text: string,
  documentId: string
): Promise<void> {
  console.log(`[sparse-retriever] 添加文档到索引, id: ${id}, documentId: ${documentId}`);

  const [tokens] = await jiebaTokenizeBatch([preprocessForBM25(text)]);
  bm25Index.docs.set(id, { tokens, text, documentId });
  bm25Index.docCount = bm25Index.docs.size;
  bm25Index.avgDL = computeAvgDL(bm25Index.docs);
  bm25Index.df = computeDF(bm25Index.docs);

  console.log(`[sparse-retriever] 文档添加完成, 当前索引文档数: ${bm25Index.docCount}`);
}

export async function batchAddToIndex(
  items: Array<{ id: number; text: string; documentId: string }>
): Promise<void> {
  console.log(`[sparse-retriever] 批量添加文档到索引, 数量: ${items.length}`);

  const texts = items.map((item) => preprocessForBM25(item.text));
  const allTokens = await jiebaTokenizeBatch(texts);

  for (let i = 0; i < items.length; i++) {
    bm25Index.docs.set(items[i].id, {
      tokens: allTokens[i],
      text: items[i].text,
      documentId: items[i].documentId,
    });
  }

  bm25Index.docCount = bm25Index.docs.size;
  bm25Index.avgDL = computeAvgDL(bm25Index.docs);
  bm25Index.df = computeDF(bm25Index.docs);

  console.log(`[sparse-retriever] 批量添加完成, 当前索引文档数: ${bm25Index.docCount}`);
}

export async function rebuildIndexFromDB(): Promise<void> {
  console.log("[sparse-retriever] 从数据库重建 BM25 索引...");

  try {
    const embResults = await db.query.embeddings.findMany({
      columns: {
        id: true,
        chunkText: true,
        documentId: true,
      },
      orderBy: asc(embeddings.chunkIndex),
    });

    if (embResults.length === 0) {
      console.warn("[sparse-retriever] 数据库中无 embedding 数据, 索引为空");
      bm25Index = {
        docs: new Map(),
        df: new Map(),
        avgDL: 0,
        docCount: 0,
      };
      return;
    }

    const docs = embResults.map((emb, index) => ({
      id: index,
      text: emb.chunkText,
      documentId: emb.documentId,
    }));

    await buildIndex(docs);
    console.log(`[sparse-retriever] BM25 索引重建完成, 文档数: ${embResults.length}`);
  } catch (error) {
    console.error("[sparse-retriever] 从数据库重建索引失败:", error);
    throw error;
  }
}

export async function rebuildBM25Index(): Promise<void> {
  console.log("[sparse-retriever] 清除内存 BM25 索引并从数据库重建...");

  bm25Index = {
    docs: new Map(),
    df: new Map(),
    avgDL: 0,
    docCount: 0,
  };

  console.log("[sparse-retriever] 内存索引已清除, 开始从数据库重建");
  await rebuildIndexFromDB();
  console.log(`[sparse-retriever] BM25 索引重建完成, 当前文档数: ${bm25Index.docCount}`);
}
