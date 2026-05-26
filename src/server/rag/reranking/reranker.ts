const RERANKER_URL = process.env.RERANKER_URL || "http://localhost:8010";

interface RerankResult {
  text: string;
  score: number;
  index?: number;
}

export async function rerank(
  query: string,
  documents: string[],
  topK: number = 3
): Promise<RerankResult[]> {
  console.log(`[Reranker] 开始重排序, 查询: "${query}", 文档数: ${documents.length}, topK: ${topK}`);

  if (documents.length === 0) {
    console.log("[Reranker] 无文档需要重排序");
    return [];
  }

  try {
    const response = await fetch(`${RERANKER_URL}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        documents,
        top_k: Math.min(topK, documents.length),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Reranker] 请求失败, 状态码: ${response.status}, 响应: ${errorText}`);
      throw new Error(`Reranker 请求失败: ${response.status}`);
    }

    const data = await response.json();

    const results: RerankResult[] = (data.results || []).map(
      (item: any, i: number) => ({
        text: documents[item.index] || "",
        score: item.relevance_score ?? 0,
        index: item.index ?? i,
      })
    );

    results.sort((a, b) => b.score - a.score);

    console.log(`[Reranker] 重排序完成, 返回 ${results.length} 条结果`);
    results.forEach((r, i) => {
      console.log(`[Reranker] #${i + 1} score=${r.score.toFixed(4)} text=${r.text.substring(0, 60)}...`);
    });

    return results;
  } catch (error) {
    console.error("[Reranker] 重排序失败:", error);
    const fallback: RerankResult[] = documents.slice(0, topK).map((text, index) => ({
      text,
      score: 1 - index * 0.1,
      index,
    }));
    console.log("[Reranker] 降级返回原始顺序");
    return fallback;
  }
}
