import { denseSearch } from "./dense-retriever";
import { sparseSearch } from "./sparse-retriever";

const RRF_K = 60;

interface HybridSearchResult {
  text: string;
  documentId: string;
  score: number;
  denseScore?: number;
  sparseScore?: number;
}

interface DenseOnlyResult {
  text: string;
  documentId: string;
  score: number;
}

interface SparseOnlyResult {
  text: string;
  documentId: string;
  score: number;
}

export async function hybridSearch(
  query: string,
  topK: number = 10
): Promise<HybridSearchResult[]> {
  console.log(`[hybrid-retriever] RRF 融合检索, query: "${query.slice(0, 50)}...", topK: ${topK}`);

  try {
    const [denseResults, sparseResults] = await Promise.all([
      denseSearch(query, topK * 2).catch((err) => {
        console.error("[hybrid-retriever] 稠密检索失败:", err);
        return [] as Array<{ id: string; text: string; documentId: string; score: number }>;
      }),
      sparseSearch(query, topK * 2).catch((err) => {
        console.error("[hybrid-retriever] 稀疏检索失败:", err);
        return [] as Array<{ id: number; text: string; documentId: string; score: number }>;
      }),
    ]);

    console.log(
      `[hybrid-retriever] 稠密检索返回 ${denseResults.length} 条, 稀疏检索返回 ${sparseResults.length} 条`
    );

    const denseRanked = [...denseResults].sort((a, b) => b.score - a.score);
    const sparseRanked = [...sparseResults].sort((a, b) => b.score - a.score);

    const keyToInfo = new Map<
      string,
      {
        text: string;
        documentId: string;
        denseRank?: number;
        sparseRank?: number;
        denseScore?: number;
        sparseScore?: number;
      }
    >();

    for (let i = 0; i < denseRanked.length; i++) {
      const key = `${denseRanked[i].documentId}::${denseRanked[i].text}`;
      keyToInfo.set(key, {
        text: denseRanked[i].text,
        documentId: denseRanked[i].documentId,
        denseRank: i + 1,
        denseScore: denseRanked[i].score,
      });
    }

    for (let i = 0; i < sparseRanked.length; i++) {
      const key = `${sparseRanked[i].documentId}::${sparseRanked[i].text}`;
      const existing = keyToInfo.get(key);
      if (existing) {
        existing.sparseRank = i + 1;
        existing.sparseScore = sparseRanked[i].score;
      } else {
        keyToInfo.set(key, {
          text: sparseRanked[i].text,
          documentId: sparseRanked[i].documentId,
          sparseRank: i + 1,
          sparseScore: sparseRanked[i].score,
        });
      }
    }

    const fusedResults: HybridSearchResult[] = [];

    for (const info of Array.from(keyToInfo.values())) {
      let rrfScore = 0;

      if (info.denseRank !== undefined) {
        rrfScore += 1 / (RRF_K + info.denseRank);
      }

      if (info.sparseRank !== undefined) {
        rrfScore += 1 / (RRF_K + info.sparseRank);
      }

      fusedResults.push({
        text: info.text,
        documentId: info.documentId,
        score: rrfScore,
        denseScore: info.denseScore,
        sparseScore: info.sparseScore,
      });
    }

    fusedResults.sort((a, b) => b.score - a.score);

    const results = fusedResults.slice(0, topK);
    console.log(`[hybrid-retriever] RRF 融合完成, 返回 ${results.length} 条结果`);

    return results;
  } catch (error) {
    console.error("[hybrid-retriever] RRF 融合检索失败:", error);
    throw error;
  }
}

export async function denseOnlySearch(
  query: string,
  topK: number = 10
): Promise<DenseOnlyResult[]> {
  console.log(`[hybrid-retriever] 仅稠密检索, query: "${query.slice(0, 50)}...", topK: ${topK}`);

  try {
    const results = await denseSearch(query, topK);
    return results.map((r) => ({
      text: r.text,
      documentId: r.documentId,
      score: r.score,
    }));
  } catch (error) {
    console.error("[hybrid-retriever] 稠密检索失败:", error);
    throw error;
  }
}

export async function sparseOnlySearch(
  query: string,
  topK: number = 10
): Promise<SparseOnlyResult[]> {
  console.log(`[hybrid-retriever] 仅稀疏检索, query: "${query.slice(0, 50)}...", topK: ${topK}`);

  try {
    const results = await sparseSearch(query, topK);
    return results.map((r) => ({
      text: r.text,
      documentId: r.documentId,
      score: r.score,
    }));
  } catch (error) {
    console.error("[hybrid-retriever] 稀疏检索失败:", error);
    throw error;
  }
}
