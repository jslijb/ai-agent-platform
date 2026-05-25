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
    if (!session?.user?.id) {
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
      `[RAG搜索] 用户 ${session.user.id} 查询: "${query}", 模式: ${mode}, HyDE: ${useHyde}, Rerank: ${useRerank}, 父子文档: ${useParentDoc}`
    );

    let searchQuery = query;

    if (useHyde) {
      console.log("[RAG搜索] 使用 HyDE 查询改写");
      searchQuery = await hydeRewrite(query);
      console.log(`[RAG搜索] HyDE 改写后查询: "${searchQuery.substring(0, 80)}..."`);
    }

    const initialTopK = useRerank ? 20 : (topK || 5);

    let vectorResults: Array<{ text: string; documentId: string; score: number; denseScore?: number; sparseScore?: number }> = [];

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

    console.log(`[RAG搜索] 向量检索完成, 返回 ${vectorResults.length} 条结果`);

    let graphResults: Array<{ text: string; score: number; entities: string[]; paths: string[] }> = [];

    if (useGraph) {
      try {
        console.log("[RAG搜索] 开始图谱检索");
        graphResults = await graphSearch(query, 2);
        console.log(`[RAG搜索] 图谱检索完成, 返回 ${graphResults.length} 条结果`);
      } catch (graphError) {
        console.error("[RAG搜索] 图谱检索失败，跳过:", graphError);
      }
    }

    let combinedTexts = [
      ...vectorResults.map((r) => r.text),
      ...graphResults.map((r) => r.text),
    ];

    let combinedItems = [
      ...vectorResults.map((r, i) => ({
        id: `vec_${i}`,
        text: r.text,
        documentId: r.documentId,
        score: r.score,
        source: mode === "hybrid" ? "vector+bm25" : mode,
        denseScore: r.denseScore,
        sparseScore: r.sparseScore,
      })),
      ...graphResults.map((r, i) => ({
        id: `graph_${i}`,
        text: r.text,
        documentId: "",
        score: r.score,
        source: "graph",
        entities: r.entities,
        paths: r.paths,
      })),
    ];

    if (useRerank && combinedTexts.length > 0) {
      try {
        console.log("[RAG搜索] 开始重排序");
        const rerankTopK = topK || 5;
        const reranked = await rerank(query, combinedTexts, rerankTopK);

        const rerankedItems = reranked.map((r) => {
          const originalItem = combinedItems[r.index ?? 0];
          return {
            ...originalItem,
            text: r.text,
            score: r.score,
            reranked: true,
          };
        });

        combinedItems = rerankedItems;
        console.log(`[RAG搜索] 重排序完成, 返回 ${combinedItems.length} 条结果`);
      } catch (rerankError) {
        console.error("[RAG搜索] 重排序失败，使用原始排序:", rerankError);
        combinedItems = combinedItems.slice(0, topK || 5);
      }
    } else {
      combinedItems = combinedItems.slice(0, topK || 5);
    }

    if (useParentDoc && combinedItems.length > 0) {
      try {
        console.log("[RAG搜索] 开始父子文档合并");
        const childChunks = combinedItems.map((item, i) => ({
          id: item.id || `chunk_${i}`,
          text: item.text,
        }));

        const parentTexts = await retrieveParentChunks(childChunks);

        combinedItems = combinedItems.map((item, i) => ({
          ...item,
          text: parentTexts[i] || item.text,
          parentDocUsed: parentTexts[i] !== item.text,
        }));

        console.log("[RAG搜索] 父子文档合并完成");
      } catch (parentError) {
        console.error("[RAG搜索] 父子文档合并失败:", parentError);
      }
    }

    console.log(`[RAG搜索] 最终返回 ${combinedItems.length} 条结果`);

    return NextResponse.json({
      success: true,
      results: combinedItems,
      mode,
      query,
      searchQuery: searchQuery !== query ? searchQuery : undefined,
      graphEnabled: useGraph,
      hydeEnabled: useHyde,
      rerankEnabled: useRerank,
      parentDocEnabled: useParentDoc,
    });
  } catch (error) {
    console.error("[RAG搜索] 检索失败:", error);
    return NextResponse.json(
      { success: false, message: "检索失败" },
      { status: 500 }
    );
  }
}
