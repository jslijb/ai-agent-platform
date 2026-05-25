import nodejieba from "nodejieba";
import { prisma } from "@/server/db/client";

const STOP_WORDS = new Set([
  "的", "了", "是", "在", "和", "有", "不", "这", "个", "为",
  "与", "对", "中", "一", "上", "也", "而", "到", "说", "要",
  "就", "都", "会", "着", "没有", "好", "自己", "她",
]);

const BM25_K1 = 1.5;
const BM25_B = 0.75;

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

function tokenize(text: string): string[] {
  const tokens = nodejieba.cut(text);
  return tokens.filter(
    (token) => token.trim().length > 0 && !STOP_WORDS.has(token)
  );
}

function computeAvgDL(docs: Map<number, { tokens: string[] }>): number {
  if (docs.size === 0) return 0;
  let totalLength = 0;
  for (const doc of docs.values()) {
    totalLength += doc.tokens.length;
  }
  return totalLength / docs.size;
}

function computeDF(docs: Map<number, { tokens: string[] }>): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs.values()) {
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

export function buildIndex(
  docs: Array<{ id: number; text: string; documentId: string }>
): BM25Index {
  console.log(`[sparse-retriever] 构建 BM25 索引, 文档数: ${docs.length}`);

  const docsMap = new Map<number, { tokens: string[]; text: string; documentId: string }>();

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    docsMap.set(doc.id, { tokens, text: doc.text, documentId: doc.documentId });
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

  const queryTokens = tokenize(query);
  console.log(`[sparse-retriever] 查询分词结果: [${queryTokens.join(", ")}]`);

  const scoredDocs: SparseSearchResult[] = [];

  for (const [docId, doc] of bm25Index.docs) {
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

export function addToIndex(
  id: number,
  text: string,
  documentId: string
): void {
  console.log(`[sparse-retriever] 添加文档到索引, id: ${id}, documentId: ${documentId}`);

  const tokens = tokenize(text);
  bm25Index.docs.set(id, { tokens, text, documentId });
  bm25Index.docCount = bm25Index.docs.size;
  bm25Index.avgDL = computeAvgDL(bm25Index.docs);
  bm25Index.df = computeDF(bm25Index.docs);

  console.log(`[sparse-retriever] 文档添加完成, 当前索引文档数: ${bm25Index.docCount}`);
}

export async function rebuildIndexFromDB(): Promise<void> {
  console.log("[sparse-retriever] 从数据库重建 BM25 索引...");

  try {
    const embeddings = await prisma.embedding.findMany({
      select: {
        id: true,
        chunkText: true,
        documentId: true,
      },
      orderBy: {
        chunkIndex: "asc",
      },
    });

    if (embeddings.length === 0) {
      console.warn("[sparse-retriever] 数据库中无 embedding 数据, 索引为空");
      bm25Index = {
        docs: new Map(),
        df: new Map(),
        avgDL: 0,
        docCount: 0,
      };
      return;
    }

    const docs = embeddings.map((emb, index) => ({
      id: index,
      text: emb.chunkText,
      documentId: emb.documentId,
    }));

    buildIndex(docs);
    console.log(`[sparse-retriever] BM25 索引重建完成, 文档数: ${embeddings.length}`);
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
