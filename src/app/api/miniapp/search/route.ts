import { NextRequest, NextResponse } from "next/server";
import { authenticateMiniapp } from "@/server/auth/miniapp-middleware";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { rerank } from "@/server/rag/reranking/reranker";

export async function POST(request: NextRequest) {
  console.log("[miniapp/search] 收到小程序搜索请求");

  const authResult = authenticateMiniapp(request);
  if ("status" in authResult) return authResult;

  const { query, topK = 5 } = await request.json();

  if (!query || typeof query !== "string") {
    return NextResponse.json({ success: false, error: "缺少 query 参数" }, { status: 400 });
  }

  try {
    const results = await hybridSearch(query, topK * 2);

    let finalResults = results;
    try {
      const texts = results.map((r) => r.text);
      const reranked = await rerank(query, texts, topK);
      finalResults = reranked.map((r) => {
        const original = results[r.index ?? 0];
        return { ...original, score: r.score, reranked: true };
      });
    } catch (rerankError) {
      console.warn("[miniapp/search] 精排失败，使用原始排序:", rerankError);
      finalResults = results.slice(0, topK);
    }

    return NextResponse.json({
      success: true,
      results: finalResults.map((r) => ({
        text: r.text,
        documentId: r.documentId,
        score: r.score,
      })),
      total: finalResults.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[miniapp/search] 搜索失败:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
