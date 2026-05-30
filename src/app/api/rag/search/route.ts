import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { denseSearch } from "@/server/rag/retrieval/dense-retriever";
import { sparseSearch } from "@/server/rag/retrieval/sparse-retriever";
import { graphSearch } from "@/server/rag/graph/graph-retriever";
import { rerank } from "@/server/rag/reranking/reranker";
import { hydeRewrite } from "@/server/rag/query/hyde-transformer";
import { retrieveParentChunks } from "@/server/rag/chunking/parent-document";

type SearchMode = "hybrid" | "dense" | "sparse";

interface SearchRequest {
  query: string;
  topK?: number;
  mode?: SearchMode;
  useGraph?: boolean;
  useHyde?: boolean;
  useRerank?: boolean;
  useParentDoc?: boolean;
}

export async function POST(request: Request) {
  console.log("[RAG搜索] 开始处理搜索请求");

  try {
    const session = await auth();
    const testUserId = request.headers.get("x-test-user-id");
    const userId = session?.user?.id || testUserId;
    if (!userId) {
      console.error("[RAG搜索] 未登录用户尝试搜索");
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    const body: SearchRequest = await request.json();
    const {
      query,
      topK,
      mode = "hybrid",
      useGraph = true,
      useHyde = false,
      useRerank = true,
      useParentDoc = true,
    } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      console.error("[RAG搜索] 查询内容为空");
      return NextResponse.json(
        { success: false, message: "查询内容不能为空" },
        { status: 400 }
      );
    }

    const validModes: SearchMode[] = ["hybrid", "dense", "sparse"];
    if (!validModes.includes(mode)) {
      console.error(`[RAG搜索] 无效的检索模式: ${mode}`);
      return NextResponse.json(
        { success: false, message: `无效的检索模式，可选值: ${validModes.join(", ")}` },
        { status: 400 }
      );
    }

    console.log(
      `[RAG搜索] 用户 ${userId} 查询: "${query}", 模式: ${mode}, HyDE: ${useHyde}, Rerank: ${useRerank}, 父子文档: ${useParentDoc}`
    );

    let searchQuery = query;

    const steps: Array<{ name: string; durationMs: number }> = [];

    if (useHyde) {
      const t0 = Date.now();
      console.log("[RAG搜索] 使用 HyDE 查询改写");
      searchQuery = await hydeRewrite(query);
      console.log(`[RAG搜索] HyDE 改写后查询: "${searchQuery.substring(0, 80)}..."`);
      steps.push({ name: "HyDE查询改写", durationMs: Date.now() - t0 });
    }

    const initialTopK = useRerank ? 20 : (topK || 5);

    let vectorResults: Array<{ text: string; documentId: string; score: number; denseScore?: number; sparseScore?: number }> = [];

    const retrievalDebug = {
      denseRecallCount: 0,
      sparseRecallCount: 0,
      vectorRecallCount: 0,
      graphRecallCount: 0,
      graphLimitedCount: 0,
      beforeRerankCount: 0,
      docRerankCount: 0,
      graphRerankCount: 0,
      afterRerankCount: 0,
      finalCount: 0,
      parentDocExpanded: false,
      steps,
    };

    {
      const t0 = Date.now();
      switch (mode) {
        case "hybrid":
          console.log("[RAG搜索] 使用混合检索");
          vectorResults = await hybridSearch(searchQuery, initialTopK);
          break;
        case "dense":
          console.log("[RAG搜索] 使用稠密检索");
          vectorResults = await denseSearch(searchQuery, initialTopK);
          break;
        case "sparse":
          console.log("[RAG搜索] 使用稀疏检索");
          vectorResults = await sparseSearch(searchQuery, initialTopK);
          break;
      }
      const stepName = mode === "hybrid" ? "混合检索(RRF融合)" : mode === "dense" ? "稠密检索" : "稀疏检索";
      steps.push({ name: stepName, durationMs: Date.now() - t0 });
    }

    retrievalDebug.vectorRecallCount = vectorResults.length;
    console.log(`[RAG搜索] 向量检索完成, 返回 ${vectorResults.length} 条结果`);

    let graphResults: Array<{ text: string; score: number; entities: string[]; paths: string[] }> = [];

    if (useGraph) {
      const t0 = Date.now();
      try {
        console.log("[RAG搜索] 开始图谱检索");
        graphResults = await graphSearch(query, 2);
        retrievalDebug.graphRecallCount = graphResults.length;
        console.log(`[RAG搜索] 图谱检索完成, 返回 ${graphResults.length} 条结果`);
        steps.push({ name: "图谱检索", durationMs: Date.now() - t0 });
      } catch (graphError) {
        console.error("[RAG搜索] 图谱检索失败，跳过:", graphError);
        steps.push({ name: "图谱检索(失败)", durationMs: Date.now() - t0 });
      }
    }

    const GRAPH_LIMIT = 5;
    const DOC_RERANK_TOP_K = 5;
    const GRAPH_RERANK_TOP_K = 3;

    const limitedGraphItems = graphResults
      .sort((a, b) => b.score - a.score)
      .slice(0, GRAPH_LIMIT)
      .map((r, i) => ({
        id: `graph_${i}`,
        text: r.text,
        documentId: "",
        score: r.score,
        source: "graph",
        entities: r.entities,
        paths: r.paths,
      }));

    const docItems = vectorResults.map((r, i) => ({
      id: `vec_${i}`,
      text: r.text,
      documentId: r.documentId,
      score: r.score,
      source: mode === "hybrid" ? "vector+bm25" : mode,
      denseScore: r.denseScore,
      sparseScore: r.sparseScore,
    }));

    retrievalDebug.graphLimitedCount = limitedGraphItems.length;

    let combinedBeforeRerank = [...docItems, ...limitedGraphItems];
    retrievalDebug.beforeRerankCount = combinedBeforeRerank.length;

    const beforeRerankResults = combinedBeforeRerank.map((item) => ({
      id: item.id,
      text: item.text,
      documentId: item.documentId,
      score: item.score,
      source: item.source,
      denseScore: item.denseScore,
      sparseScore: item.sparseScore,
      entities: item.entities,
      paths: item.paths,
    }));

    let docRerankedItems = [...docItems];
    let graphRerankedItems = [...limitedGraphItems];

    if (useRerank) {
      const t0 = Date.now();
      try {
        console.log("[RAG搜索] 开始分离精排");

        if (docItems.length > 0) {
          const docTexts = docItems.map((r) => r.text);
          const docReranked = await rerank(query, docTexts, DOC_RERANK_TOP_K);
          docRerankedItems = docReranked.map((r) => {
            const originalItem = docItems[r.index ?? 0];
            return { ...originalItem, text: r.text, score: r.score, reranked: true };
          });
          console.log(`[RAG搜索] 文档精排完成, 返回 ${docRerankedItems.length} 条结果`);
        }

        if (limitedGraphItems.length > 0) {
          const graphTexts = limitedGraphItems.map((r) => r.text);
          const graphReranked = await rerank(query, graphTexts, GRAPH_RERANK_TOP_K);
          graphRerankedItems = graphReranked.map((r) => {
            const originalItem = limitedGraphItems[r.index ?? 0];
            return { ...originalItem, text: r.text, score: r.score, reranked: true };
          });
          console.log(`[RAG搜索] 图谱精排完成, 返回 ${graphRerankedItems.length} 条结果`);
        }

        retrievalDebug.docRerankCount = docRerankedItems.length;
        retrievalDebug.graphRerankCount = graphRerankedItems.length;
        steps.push({ name: "分离精排重排序", durationMs: Date.now() - t0 });
      } catch (rerankError) {
        console.error("[RAG搜索] 分离精排失败，使用原始排序降级:", rerankError);
        docRerankedItems = docItems.sort((a, b) => b.score - a.score).slice(0, DOC_RERANK_TOP_K);
        graphRerankedItems = limitedGraphItems.sort((a, b) => b.score - a.score).slice(0, GRAPH_RERANK_TOP_K);
        retrievalDebug.docRerankCount = docRerankedItems.length;
        retrievalDebug.graphRerankCount = graphRerankedItems.length;
        steps.push({ name: "分离精排重排序(失败)", durationMs: Date.now() - t0 });
      }
    } else {
      docRerankedItems = docItems.sort((a, b) => b.score - a.score).slice(0, DOC_RERANK_TOP_K);
      graphRerankedItems = limitedGraphItems.sort((a, b) => b.score - a.score).slice(0, GRAPH_RERANK_TOP_K);
      retrievalDebug.docRerankCount = docRerankedItems.length;
      retrievalDebug.graphRerankCount = graphRerankedItems.length;
    }

    let combinedItems = [...docRerankedItems, ...graphRerankedItems];
    retrievalDebug.afterRerankCount = combinedItems.length;

    if (useParentDoc && docRerankedItems.length > 0) {
      const t0 = Date.now();
      try {
        console.log("[RAG搜索] 开始父子文档合并(仅文档chunk)");
        const childChunks = docRerankedItems.map((item, i) => ({
          id: item.id || `chunk_${i}`,
          text: item.text,
        }));

        const parentTexts = await retrieveParentChunks(childChunks);

        const expandedDocItems = docRerankedItems.map((item, i) => ({
          ...item,
          text: parentTexts[i] || item.text,
          parentDocUsed: parentTexts[i] !== item.text,
        }));

        combinedItems = [...expandedDocItems, ...graphRerankedItems];
        retrievalDebug.parentDocExpanded = expandedDocItems.some((item: any) => item.parentDocUsed);
        console.log("[RAG搜索] 父子文档合并完成");
        steps.push({ name: "父子文档扩展", durationMs: Date.now() - t0 });
      } catch (parentError) {
        console.error("[RAG搜索] 父子文档合并失败:", parentError);
        steps.push({ name: "父子文档扩展(失败)", durationMs: Date.now() - t0 });
      }
    }

    retrievalDebug.finalCount = combinedItems.length;

    console.log(`[RAG搜索] 最终返回 ${combinedItems.length} 条结果 (文档: ${docRerankedItems.length}, 图谱: ${graphRerankedItems.length})`);

    return NextResponse.json({
      success: true,
      results: combinedItems,
      beforeRerankResults,
      docRerankResults: docRerankedItems,
      graphRerankResults: graphRerankedItems,
      mode,
      query,
      searchQuery: searchQuery !== query ? searchQuery : undefined,
      graphEnabled: useGraph,
      hydeEnabled: useHyde,
      rerankEnabled: useRerank,
      parentDocEnabled: useParentDoc,
      retrievalDebug,
    });
  } catch (error) {
    console.error("[RAG搜索] 检索失败:", error);
    return NextResponse.json(
      { success: false, message: "检索失败" },
      { status: 500 }
    );
  }
}
