import { callBailian, type BailianMessage } from "@/server/llm/providers/bailian";
import { semanticCacheGet, semanticCacheSet } from "@/server/llm/semantic-cache";

const MAX_REFLECTION_ROUNDS = 3;

interface ReflectionResult {
  needMore: boolean;
  refinedQuery?: string;
}

export async function shouldRetrieveAgain(
  query: string,
  currentAnswer: string,
  previousSearchResults: string[],
  toolObservations: string[] = []
): Promise<ReflectionResult> {
  console.log(
    `[reflection-node] 开始反思评估, query 长度: ${query.length}, 答案长度: ${currentAnswer.length}, 已有检索结果数: ${previousSearchResults.length}, 工具调用数: ${toolObservations.length}`
  );

  const systemPrompt = `你是一个信息充分性评估专家。你的任务是评估当前答案是否充分回答了用户的问题，并检测是否存在数据编造（幻觉）。

评估标准：
1. 答案是否直接回应了用户的问题
2. 答案中是否包含具体的事实和数据，而非模糊的概述
3. 答案是否存在"无法确定"、"信息不足"等表述
4. 检索结果是否提供了足够的上下文
5. 【关键 - 幻觉检测】如果用户询问的是具体数字（如营收、利润、股价等），但答案中的数字并非来自工具调用结果（Observation），而是LLM自行生成的，则必须标记为 needMore=true
6. 【关键 - 空答案检测】如果当前答案为空或极短（少于20字），且用户的问题需要具体数据或计算，必须标记 needMore=true

【幻觉检测规则 - 必须严格执行】：
- 如果用户询问财务数据（营收、利润、ROE等），但答案中的数字没有"Observation"或"工具结果"支撑，必须标记 needMore=true
- 如果用户询问股价/技术指标，但答案中没有来自 marketData 或 technicalAnalysis 的数据支撑，必须标记 needMore=true
- LLM 训练知识中的财务数据通常已过时，不能作为可靠来源
- 任何具体的数字（如"460.67亿元"、"同比增长20%"）如果没有在工具调用结果中出现过，就是编造的
- 如果答案中包含"根据公开信息"、"根据财报"、"数据显示"等措辞但没有工具调用支撑，也是编造的

【重要 - 已调用工具的情况】：
- 如果"已调用的工具"列表中包含了获取数据的工具（如 marketData、technicalAnalysis 等），且答案中使用了这些工具返回的数据，则应标记 needMore=false
- 如果用户要求计算技术指标（MA、RSI等），且已调用了 technicalAnalysis 工具，答案中包含了计算结果，则应标记 needMore=false
- 不要因为答案中没有 RAG 检索结果就标记 needMore=true——技术指标计算不需要 RAG 检索

【工具推荐规则 - 使用合并后的工具名】：
- 用户询问营收/利润/ROE等 → refinedQuery 应包含 "调用 marketData 工具，dataType=financial, code=股票代码"
- 用户询问股价/技术指标 → refinedQuery 应包含 "调用 marketData 工具，dataType=history, code=sh.600036" 或 "调用 technicalAnalysis 工具"
- 用户询问详细财报 → refinedQuery 应包含 "调用 marketData 工具，dataType=financialReport, code=股票代码"
- 用户询问风险指标 → refinedQuery 应包含 "调用 riskAnalysis 工具"
- 用户询问合规检查 → refinedQuery 应包含 "调用 complianceCheck 工具"

请严格按照以下 JSON 格式输出评估结果，不要输出其他内容：
{
  "needMore": true/false,
  "refinedQuery": "改写后的查询或工具调用建议（仅当 needMore 为 true 时提供）"
}

如果 needMore 为 true，refinedQuery 应该是具体的工具调用建议，帮助获取缺失的数据。
如果 needMore 为 false，refinedQuery 可以省略。`;

  const resultsSummary = previousSearchResults
    .map((result, index) => `检索结果 ${index + 1}: ${result.substring(0, 200)}`)
    .join("\n\n");

  const toolsSummary = toolObservations.length > 0
    ? toolObservations.map((obs, index) => `工具调用 ${index + 1}: ${obs.substring(0, 300)}`).join("\n\n")
    : "（无工具调用）";

  const userPrompt = `用户问题: ${query}

当前答案: ${currentAnswer}

已调用的工具:
${toolsSummary}

已有的RAG检索结果:
${resultsSummary || "（无检索结果）"}

请评估当前答案是否充分回答了用户的问题。特别注意：如果已调用了数据获取工具且答案使用了工具返回的数据，应标记 needMore=false。如果不充分，请提供一个改写后的查询。`;

  const messages: BailianMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const cacheInput = `query:${query}|answer:${currentAnswer.substring(0, 200)}|tools:${toolObservations.length}`;
    const cached = await semanticCacheGet("reflection-eval", cacheInput);
    if (cached.content) {
      console.log(`[reflection-node] 语义缓存命中 (${cached.hitType})`);
      const jsonMatch = cached.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          needMore?: boolean;
          refinedQuery?: string;
        };
        return {
          needMore: parsed.needMore === true,
          refinedQuery: parsed.needMore && parsed.refinedQuery ? parsed.refinedQuery : undefined,
        };
      }
    }

    const response = await callBailian(messages, undefined, 0);
    const content = (response.content ?? "").trim();

    console.log(`[reflection-node] LLM 反思评估响应: ${content.substring(0, 300)}`);

    if (content.length > 0) {
      await semanticCacheSet(
        "reflection-eval",
        cacheInput,
        content,
        undefined,
        "bailian"
      );
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[reflection-node] 无法从响应中提取 JSON，默认不需要再检索");
      return { needMore: false };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      needMore?: boolean;
      refinedQuery?: string;
    };

    const needMore = parsed.needMore === true;
    const refinedQuery = parsed.refinedQuery;

    console.log(
      `[reflection-node] 反思评估结果: needMore=${needMore}${refinedQuery ? `, refinedQuery="${refinedQuery}"` : ""}`
    );

    return {
      needMore,
      refinedQuery: needMore && refinedQuery ? refinedQuery : undefined,
    };
  } catch (error) {
    console.error("[reflection-node] 反思评估失败:", error);
    // 反思失败时的安全策略：如果答案为空/极短且无工具调用结果，返回needMore=true
    if (currentAnswer.trim().length < 50 && toolObservations.length === 0) {
      console.log("[reflection-node] 反思失败但答案不充分，强制needMore=true");
      return { needMore: true, refinedQuery: "调用相关工具获取数据后回答用户问题" };
    }
    return { needMore: false };
  }
}

export async function reflectiveRetrieval(
  query: string,
  searchFn: (query: string) => Promise<string>,
  generateAnswerFn: (query: string, context: string) => Promise<string>
): Promise<{ answer: string; iterations: number; allSearchResults: string[] }> {
  console.log(`[reflection-node] 开始反思式检索循环, query: "${query.substring(0, 50)}..."`);

  let allSearchResults: string[] = [];
  let currentAnswer = "";
  let currentQuery = query;
  let iterations = 0;

  for (let round = 0; round < MAX_REFLECTION_ROUNDS; round++) {
    iterations++;
    console.log(`[reflection-node] 第 ${round + 1}/${MAX_REFLECTION_ROUNDS} 轮反思`);

    console.log(`[reflection-node] 执行检索, query: "${currentQuery.substring(0, 50)}..."`);
    const searchResult = await searchFn(currentQuery);
    allSearchResults.push(searchResult);

    console.log(`[reflection-node] 检索完成, 结果长度: ${searchResult.length}`);

    const combinedContext = allSearchResults.join("\n\n");
    currentAnswer = await generateAnswerFn(query, combinedContext);

    console.log(`[reflection-node] 生成答案完成, 长度: ${currentAnswer.length}`);

    if (round < MAX_REFLECTION_ROUNDS - 1) {
      const reflection = await shouldRetrieveAgain(query, currentAnswer, allSearchResults);

      if (!reflection.needMore) {
        console.log("[reflection-node] 答案已充分，结束反思循环");
        break;
      }

      if (reflection.refinedQuery) {
        console.log(`[reflection-node] 需要更多信息，改写查询: "${reflection.refinedQuery}"`);
        currentQuery = reflection.refinedQuery;
      } else {
        console.log("[reflection-node] 需要更多信息但未提供改写查询，使用原始查询");
        currentQuery = query;
      }
    }
  }

  console.log(
    `[reflection-node] 反思式检索循环结束, 共 ${iterations} 轮迭代, 累计检索结果: ${allSearchResults.length} 条`
  );

  return {
    answer: currentAnswer,
    iterations,
    allSearchResults,
  };
}
