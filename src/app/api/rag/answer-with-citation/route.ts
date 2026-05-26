import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { callBailian } from "@/server/llm/providers/bailian";
import { buildCitationFromDocumentId } from "@/server/rag/citation/source-tracker";
import { injectCitations, formatCitationList } from "@/server/rag/citation/citation-injector";
import { db, sql } from "@/server/db/client";

interface AnswerWithCitationRequest {
  query: string;
}

export async function POST(request: Request) {
  console.log("[带引用答案] 开始处理请求");

  try {
    const session = await auth();
    if (!session?.user?.id) {
      console.error("[带引用答案] 未登录用户尝试访问");
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      );
    }

    const body: AnswerWithCitationRequest = await request.json();
    const { query } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      console.error("[带引用答案] 查询内容为空");
      return NextResponse.json(
        { success: false, message: "查询内容不能为空" },
        { status: 400 }
      );
    }

    console.log(
      `[带引用答案] 用户 ${session.user.id} 查询: "${query}"`
    );

    console.log("[带引用答案] 开始混合检索, top-3");
    const searchResults = await hybridSearch(query, 3);
    console.log(
      `[带引用答案] 检索完成, 返回 ${searchResults.length} 条结果`
    );

    if (searchResults.length === 0) {
      console.log("[带引用答案] 未检索到相关结果");
      return NextResponse.json({
        success: true,
        answer: "抱歉，未找到与您问题相关的文档内容。",
        citations: [],
      });
    }

    const contextParts: string[] = [];
    const citations: string[] = [];

    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      console.log(
        `[带引用答案] 处理第 ${i + 1} 条结果, documentId: ${result.documentId}, score: ${result.score}`
      );

      let citation = "";
      try {
        const embeddingResult = await db.execute(sql`
          SELECT metadata FROM "Embedding"
          WHERE "documentId" = ${result.documentId}
          LIMIT 1
        `);
        const embeddingRows = embeddingResult as unknown as Array<{ metadata: any }>;

        const metadata = (embeddingRows[0]?.metadata as Record<string, any>) || {};
        citation = await buildCitationFromDocumentId(
          result.documentId,
          metadata
        );
      } catch (err) {
        console.error(
          `[带引用答案] 构建引用失败, documentId: ${result.documentId}:`,
          err
        );
        citation = `[来源: 文档ID ${result.documentId}]`;
      }

      citations.push(citation);
      contextParts.push(
        `[文档片段${i + 1}] ${citation}\n${result.text}`
      );
    }

    const contextText = contextParts.join("\n\n");

    console.log("[带引用答案] 构造 prompt 并调用百炼模型");

    const promptMessages = [
      {
        role: "system" as const,
        content: `你是一个专业的文档问答助手。请根据提供的文档片段回答用户的问题。

要求：
1. 回答必须基于提供的文档片段内容，不要编造信息
2. 在每个关键事实或数据后标注来源，格式为 [来源: 《文档名》第X页]
3. 如果文档中没有相关信息，请明确说明
4. 回答要准确、完整、有条理`,
      },
      {
        role: "user" as const,
        content: `以下是相关文档片段：

${contextText}

用户问题：${query}

请基于以上文档片段回答问题，并在关键事实后标注来源。`,
      },
    ];

    const llmResponse = await callBailian(promptMessages);
    console.log(
      `[带引用答案] 百炼模型返回, 答案长度: ${llmResponse.content.length}`
    );

    const injectedAnswer = injectCitations(llmResponse.content, citations);
    const citationList = formatCitationList(citations);

    console.log(
      `[带引用答案] 处理完成, 答案长度: ${injectedAnswer.length}, 引用数: ${citations.length}`
    );

    return NextResponse.json({
      success: true,
      answer: injectedAnswer,
      citations,
      citationList,
      searchResults: searchResults.map((r, i) => ({
        text: r.text.substring(0, 200) + (r.text.length > 200 ? "..." : ""),
        score: r.score,
        documentId: r.documentId,
        citation: citations[i],
      })),
    });
  } catch (error) {
    console.error("[带引用答案] 请求处理失败:", error);
    return NextResponse.json(
      { success: false, message: "服务器内部错误" },
      { status: 500 }
    );
  }
}
