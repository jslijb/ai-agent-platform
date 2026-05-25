import { callBailian } from "@/server/llm/providers/bailian";

export interface RetrievalEvaluationResult {
  hitsAtK: number;
  contextRelevance: number;
  contextRecall: number;
}

export interface AnswerEvaluationResult {
  faithfulness: number;
  answerRelevance: number;
}

export interface SingleTestResult {
  id: number;
  query: string;
  expectedAnswer: string;
  actualAnswer: string;
  retrieval: RetrievalEvaluationResult;
  answer: AnswerEvaluationResult;
  category: string;
  difficulty: string;
  durationMs: number;
}

export interface EvaluationReport {
  timestamp: string;
  totalTests: number;
  avgHitsAtK: number;
  avgContextRelevance: number;
  avgContextRecall: number;
  avgFaithfulness: number;
  avgAnswerRelevance: number;
  overallScore: number;
  resultsByCategory: Record<string, {
    count: number;
    avgHitsAtK: number;
    avgFaithfulness: number;
    avgAnswerRelevance: number;
  }>;
  resultsByDifficulty: Record<string, {
    count: number;
    avgHitsAtK: number;
    avgFaithfulness: number;
    avgAnswerRelevance: number;
  }>;
  results: SingleTestResult[];
}

type ScorerInstances = {
  faithfulnessScorer: InstanceType<typeof import("@reaatech/rag-eval-metrics").FaithfulnessScorer>;
  relevanceScorer: InstanceType<typeof import("@reaatech/rag-eval-metrics").RelevanceScorer>;
  contextPrecisionScorer: InstanceType<typeof import("@reaatech/rag-eval-metrics").ContextPrecisionScorer>;
  contextRecallScorer: InstanceType<typeof import("@reaatech/rag-eval-metrics").ContextRecallScorer>;
};

let scorersCache: ScorerInstances | null = null;
let scorersAvailable = true;

async function getScorers(): Promise<ScorerInstances | null> {
  if (scorersCache) return scorersCache;
  if (!scorersAvailable) return null;

  try {
    const {
      FaithfulnessScorer,
      RelevanceScorer,
      ContextPrecisionScorer,
      ContextRecallScorer,
    } = await import("@reaatech/rag-eval-metrics");

    scorersCache = {
      faithfulnessScorer: new FaithfulnessScorer(),
      relevanceScorer: new RelevanceScorer(),
      contextPrecisionScorer: new ContextPrecisionScorer(),
      contextRecallScorer: new ContextRecallScorer(),
    };

    console.log("[rag-evaluator] @reaatech/rag-eval-metrics 加载成功");
    return scorersCache;
  } catch (error) {
    console.error("[rag-evaluator] @reaatech/rag-eval-metrics 加载失败，使用降级评估:", error);
    scorersAvailable = false;
    return null;
  }
}

function tokenize(text: string): string[] {
  return text
    .replace(/[，。、；：！？（）""''【】《》\s,.:;!?(){}[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function fallbackContextRelevance(
  query: string,
  expectedAnswer: string,
  searchResults: Array<{ text: string; score: number }>
): number {
  console.log("[rag-evaluator] 使用降级 Context Relevance 计算");

  if (searchResults.length === 0) return 0;

  const queryTokens = tokenize(query);
  const expectedTokens = tokenize(expectedAnswer);

  let totalRelevance = 0;
  for (const result of searchResults) {
    const resultTokens = tokenize(result.text);
    const queryOverlap = jaccardSimilarity(queryTokens, resultTokens);
    const expectedOverlap = jaccardSimilarity(expectedTokens, resultTokens);
    totalRelevance += (queryOverlap + expectedOverlap) / 2;
  }

  return Math.min(totalRelevance / searchResults.length, 1);
}

function fallbackFaithfulness(
  answer: string,
  context: string
): number {
  console.log("[rag-evaluator] 使用降级 Faithfulness 计算");

  if (!answer || !context) return 0;

  const answerTokens = tokenize(answer);
  const contextTokens = tokenize(context);

  if (answerTokens.length === 0) return 0;

  const contextSet = new Set(contextTokens);
  const supportedTokens = answerTokens.filter((t) => contextSet.has(t));

  return supportedTokens.length / answerTokens.length;
}

function fallbackAnswerRelevance(
  query: string,
  answer: string
): number {
  console.log("[rag-evaluator] 使用降级 Answer Relevance 计算");

  if (!answer || !query) return 0;

  const queryTokens = tokenize(query);
  const answerTokens = tokenize(answer);

  return jaccardSimilarity(queryTokens, answerTokens);
}

function fallbackContextRecall(
  expectedAnswer: string,
  searchResults: Array<{ text: string; score: number }>
): number {
  console.log("[rag-evaluator] 使用降级 Context Recall 计算");

  if (searchResults.length === 0) return 0;

  const expectedTokens = tokenize(expectedAnswer);
  if (expectedTokens.length === 0) return 0;

  const allContextTokens = new Set(
    searchResults.flatMap((r) => tokenize(r.text))
  );

  const coveredTokens = expectedTokens.filter((t) => allContextTokens.has(t));
  return coveredTokens.length / expectedTokens.length;
}

async function llmEvaluateFaithfulness(
  answer: string,
  contextTexts: string[]
): Promise<number> {
  console.log("[rag-evaluator] 使用 LLM 评估 Faithfulness");

  const contextBlock = contextTexts
    .map((t, i) => `[片段${i + 1}] ${t}`)
    .join("\n\n");

  try {
    const response = await callBailian([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请评估生成的答案是否忠实于提供的检索内容。评分范围0-1，1表示完全忠实，0表示完全不一致。只返回一个0到1之间的数字，不要返回其他内容。",
      },
      {
        role: "user",
        content: `检索内容：\n${contextBlock}\n\n生成的答案：${answer}\n\n请评估答案对检索内容的忠实度（0-1）：`,
      },
    ]);

    const score = parseFloat(response.content.trim());
    if (isNaN(score) || score < 0 || score > 1) {
      console.error(
        `[rag-evaluator] LLM Faithfulness 评分解析失败: "${response.content}", 使用默认值0.5`
      );
      return 0.5;
    }

    console.log(`[rag-evaluator] LLM Faithfulness 评分: ${score}`);
    return score;
  } catch (error) {
    console.error("[rag-evaluator] LLM Faithfulness 评估失败:", error);
    return 0.5;
  }
}

async function llmEvaluateAnswerRelevance(
  query: string,
  answer: string
): Promise<number> {
  console.log("[rag-evaluator] 使用 LLM 评估 Answer Relevance");

  try {
    const response = await callBailian([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请评估生成的答案是否与用户问题相关。评分范围0-1，1表示完全相关，0表示完全不相关。只返回一个0到1之间的数字，不要返回其他内容。",
      },
      {
        role: "user",
        content: `用户问题：${query}\n\n生成的答案：${answer}\n\n请评估答案与问题的相关性（0-1）：`,
      },
    ]);

    const score = parseFloat(response.content.trim());
    if (isNaN(score) || score < 0 || score > 1) {
      console.error(
        `[rag-evaluator] LLM Answer Relevance 评分解析失败: "${response.content}", 使用默认值0.5`
      );
      return 0.5;
    }

    console.log(`[rag-evaluator] LLM Answer Relevance 评分: ${score}`);
    return score;
  } catch (error) {
    console.error("[rag-evaluator] LLM Answer Relevance 评估失败:", error);
    return 0.5;
  }
}

export async function evaluateRetrieval(
  query: string,
  expectedAnswer: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<{ hitsAtK: number; contextRelevance: number }> {
  console.log(
    `[rag-evaluator] 评估检索质量, query: "${query.slice(0, 50)}...", 检索结果数: ${searchResults.length}`
  );

  const startTime = Date.now();

  try {
    let hitsAtK = 0;
    const K = 5;
    const topKResults = searchResults.slice(0, K);

    const expectedKeywords = tokenize(expectedAnswer);

    for (const result of topKResults) {
      const matchedKeywords = expectedKeywords.filter((kw) =>
        result.text.includes(kw)
      );
      if (matchedKeywords.length >= Math.ceil(expectedKeywords.length * 0.15)) {
        hitsAtK = 1;
        break;
      }
    }

    console.log(
      `[rag-evaluator] Hits@${K} 计算: ${hitsAtK}, 耗时: ${Date.now() - startTime}ms`
    );

    const scorers = await getScorers();

    let contextRelevance: number;

    if (scorers) {
      try {
        const sample = {
          query,
          context: searchResults.map((r) => r.text),
          ground_truth: expectedAnswer,
          generated_answer: "",
        };

        const contextPrecisionResult = await scorers.contextPrecisionScorer.score(sample);
        contextRelevance = contextPrecisionResult.score;

        console.log(
          `[rag-evaluator] Context Relevance (库): ${contextRelevance}, MAP: ${contextPrecisionResult.map}, NDCG: ${contextPrecisionResult.ndcg}`
        );
      } catch (scorerError) {
        console.error("[rag-evaluator] 库评分器失败，使用降级计算:", scorerError);
        contextRelevance = fallbackContextRelevance(query, expectedAnswer, searchResults);
      }
    } else {
      contextRelevance = fallbackContextRelevance(query, expectedAnswer, searchResults);
    }

    return { hitsAtK, contextRelevance };
  } catch (error) {
    console.error("[rag-evaluator] 检索质量评估失败:", error);

    const expectedKeywords = tokenize(expectedAnswer);
    let hitsAtK = 0;
    const topKResults = searchResults.slice(0, 5);
    for (const result of topKResults) {
      const matchedKeywords = expectedKeywords.filter((kw) =>
        result.text.includes(kw)
      );
      if (matchedKeywords.length >= Math.ceil(expectedKeywords.length * 0.15)) {
        hitsAtK = 1;
        break;
      }
    }

    return { hitsAtK, contextRelevance: 0 };
  }
}

export async function evaluateAnswer(
  query: string,
  expectedAnswer: string,
  actualAnswer: string
): Promise<{ faithfulness: number; answerRelevance: number }> {
  console.log(
    `[rag-evaluator] 评估答案质量, query: "${query.slice(0, 50)}..."`
  );

  try {
    const scorers = await getScorers();

    let heuristicFaithfulness: number;
    let heuristicRelevance: number;

    if (scorers) {
      try {
        const sample = {
          query,
          context: [expectedAnswer],
          ground_truth: expectedAnswer,
          generated_answer: actualAnswer,
        };

        const faithfulnessResult = await scorers.faithfulnessScorer.score(sample);
        heuristicFaithfulness = faithfulnessResult.score;

        console.log(
          `[rag-evaluator] 启发式 Faithfulness (库): ${heuristicFaithfulness}, 支持语句: ${faithfulnessResult.supported_count}/${faithfulnessResult.total_statements}`
        );

        const relevanceResult = await scorers.relevanceScorer.score(sample);
        heuristicRelevance = relevanceResult.score;

        console.log(
          `[rag-evaluator] 启发式 Relevance (库): ${heuristicRelevance}, 词法相似度: ${relevanceResult.lexical_similarity ?? "N/A"}`
        );
      } catch (scorerError) {
        console.error("[rag-evaluator] 库评分器失败，使用降级计算:", scorerError);
        heuristicFaithfulness = fallbackFaithfulness(actualAnswer, expectedAnswer);
        heuristicRelevance = fallbackAnswerRelevance(query, actualAnswer);
      }
    } else {
      heuristicFaithfulness = fallbackFaithfulness(actualAnswer, expectedAnswer);
      heuristicRelevance = fallbackAnswerRelevance(query, actualAnswer);

      console.log(
        `[rag-evaluator] 降级 Faithfulness: ${heuristicFaithfulness}, 降级 Relevance: ${heuristicRelevance}`
      );
    }

    let llmFaithfulness: number | null = null;
    let llmRelevance: number | null = null;

    try {
      llmFaithfulness = await llmEvaluateFaithfulness(actualAnswer, [
        expectedAnswer,
      ]);
      llmRelevance = await llmEvaluateAnswerRelevance(query, actualAnswer);

      console.log(
        `[rag-evaluator] LLM Faithfulness: ${llmFaithfulness}, LLM Relevance: ${llmRelevance}`
      );
    } catch (llmError) {
      console.error("[rag-evaluator] LLM 评估失败，使用启发式评分:", llmError);
    }

    const faithfulness =
      llmFaithfulness !== null
        ? heuristicFaithfulness * 0.4 + llmFaithfulness * 0.6
        : heuristicFaithfulness;

    const answerRelevance =
      llmRelevance !== null
        ? heuristicRelevance * 0.4 + llmRelevance * 0.6
        : heuristicRelevance;

    console.log(
      `[rag-evaluator] 最终 Faithfulness: ${faithfulness}, Answer Relevance: ${answerRelevance}`
    );

    return {
      faithfulness: Number(faithfulness.toFixed(4)),
      answerRelevance: Number(answerRelevance.toFixed(4)),
    };
  } catch (error) {
    console.error("[rag-evaluator] 答案质量评估失败:", error);
    return { faithfulness: 0, answerRelevance: 0 };
  }
}

export async function evaluateContextRecall(
  query: string,
  expectedAnswer: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<number> {
  console.log("[rag-evaluator] 评估 Context Recall");

  try {
    const scorers = await getScorers();

    if (scorers) {
      try {
        const sample = {
          query,
          context: searchResults.map((r) => r.text),
          ground_truth: expectedAnswer,
          generated_answer: "",
        };

        const contextRecallResult = await scorers.contextRecallScorer.score(sample);
        const contextRecall = contextRecallResult.score;

        console.log(
          `[rag-evaluator] Context Recall (库): ${contextRecall}, 覆盖事实: ${contextRecallResult.covered_facts}/${contextRecallResult.total_facts}`
        );

        return contextRecall;
      } catch (scorerError) {
        console.error("[rag-evaluator] 库评分器失败，使用降级计算:", scorerError);
        return fallbackContextRecall(expectedAnswer, searchResults);
      }
    }

    return fallbackContextRecall(expectedAnswer, searchResults);
  } catch (error) {
    console.error("[rag-evaluator] Context Recall 评估失败:", error);
    return 0;
  }
}

export async function runFullEvaluation(
  testSet: Array<{
    id?: number;
    query: string;
    expectedAnswer: string;
    category?: string;
    difficulty?: string;
  }>,
  searchFn: (
    query: string
  ) => Promise<Array<{ text: string; score: number }>>,
  answerFn: (
    query: string,
    searchResults: Array<{ text: string; score: number }>
  ) => Promise<string>
): Promise<EvaluationReport> {
  console.log(`[rag-evaluator] 开始全量评估, 测试集大小: ${testSet.length}`);

  const startTime = Date.now();
  const results: SingleTestResult[] = [];

  for (let i = 0; i < testSet.length; i++) {
    const testItem = testSet[i];
    const itemStart = Date.now();

    console.log(
      `[rag-evaluator] 评估第 ${i + 1}/${testSet.length} 条, query: "${testItem.query.slice(0, 50)}..."`
    );

    try {
      const searchResults = await searchFn(testItem.query);
      console.log(
        `[rag-evaluator] 检索完成, 结果数: ${searchResults.length}`
      );

      const actualAnswer = await answerFn(testItem.query, searchResults);
      console.log(
        `[rag-evaluator] 答案生成完成, 长度: ${actualAnswer.length}`
      );

      const [retrievalResult, answerResult, contextRecall] = await Promise.all([
        evaluateRetrieval(testItem.query, testItem.expectedAnswer, searchResults),
        evaluateAnswer(testItem.query, testItem.expectedAnswer, actualAnswer),
        evaluateContextRecall(testItem.query, testItem.expectedAnswer, searchResults),
      ]);

      const durationMs = Date.now() - itemStart;

      results.push({
        id: testItem.id ?? i + 1,
        query: testItem.query,
        expectedAnswer: testItem.expectedAnswer,
        actualAnswer,
        retrieval: {
          ...retrievalResult,
          contextRecall,
        },
        answer: answerResult,
        category: testItem.category ?? "未分类",
        difficulty: testItem.difficulty ?? "medium",
        durationMs,
      });

      console.log(
        `[rag-evaluator] 第 ${i + 1} 条评估完成, Hits@K=${retrievalResult.hitsAtK}, Faithfulness=${answerResult.faithfulness}, Relevance=${answerResult.answerRelevance}, 耗时=${durationMs}ms`
      );
    } catch (error) {
      console.error(
        `[rag-evaluator] 第 ${i + 1} 条评估失败:`,
        error
      );

      results.push({
        id: testItem.id ?? i + 1,
        query: testItem.query,
        expectedAnswer: testItem.expectedAnswer,
        actualAnswer: "",
        retrieval: { hitsAtK: 0, contextRelevance: 0, contextRecall: 0 },
        answer: { faithfulness: 0, answerRelevance: 0 },
        category: testItem.category ?? "未分类",
        difficulty: testItem.difficulty ?? "medium",
        durationMs: Date.now() - itemStart,
      });
    }
  }

  const avgHitsAtK =
    results.reduce((sum, r) => sum + r.retrieval.hitsAtK, 0) / results.length;
  const avgContextRelevance =
    results.reduce((sum, r) => sum + r.retrieval.contextRelevance, 0) /
    results.length;
  const avgContextRecall =
    results.reduce((sum, r) => sum + r.retrieval.contextRecall, 0) /
    results.length;
  const avgFaithfulness =
    results.reduce((sum, r) => sum + r.answer.faithfulness, 0) / results.length;
  const avgAnswerRelevance =
    results.reduce((sum, r) => sum + r.answer.answerRelevance, 0) /
    results.length;

  const overallScore =
    avgHitsAtK * 0.2 +
    avgContextRelevance * 0.15 +
    avgContextRecall * 0.15 +
    avgFaithfulness * 0.25 +
    avgAnswerRelevance * 0.25;

  const resultsByCategory: EvaluationReport["resultsByCategory"] = {};
  for (const r of results) {
    if (!resultsByCategory[r.category]) {
      resultsByCategory[r.category] = {
        count: 0,
        avgHitsAtK: 0,
        avgFaithfulness: 0,
        avgAnswerRelevance: 0,
      };
    }
    const cat = resultsByCategory[r.category];
    cat.count++;
    cat.avgHitsAtK += r.retrieval.hitsAtK;
    cat.avgFaithfulness += r.answer.faithfulness;
    cat.avgAnswerRelevance += r.answer.answerRelevance;
  }
  for (const cat of Object.values(resultsByCategory)) {
    cat.avgHitsAtK = Number((cat.avgHitsAtK / cat.count).toFixed(4));
    cat.avgFaithfulness = Number((cat.avgFaithfulness / cat.count).toFixed(4));
    cat.avgAnswerRelevance = Number(
      (cat.avgAnswerRelevance / cat.count).toFixed(4)
    );
  }

  const resultsByDifficulty: EvaluationReport["resultsByDifficulty"] = {};
  for (const r of results) {
    if (!resultsByDifficulty[r.difficulty]) {
      resultsByDifficulty[r.difficulty] = {
        count: 0,
        avgHitsAtK: 0,
        avgFaithfulness: 0,
        avgAnswerRelevance: 0,
      };
    }
    const diff = resultsByDifficulty[r.difficulty];
    diff.count++;
    diff.avgHitsAtK += r.retrieval.hitsAtK;
    diff.avgFaithfulness += r.answer.faithfulness;
    diff.avgAnswerRelevance += r.answer.answerRelevance;
  }
  for (const diff of Object.values(resultsByDifficulty)) {
    diff.avgHitsAtK = Number((diff.avgHitsAtK / diff.count).toFixed(4));
    diff.avgFaithfulness = Number(
      (diff.avgFaithfulness / diff.count).toFixed(4)
    );
    diff.avgAnswerRelevance = Number(
      (diff.avgAnswerRelevance / diff.count).toFixed(4)
    );
  }

  const totalDuration = Date.now() - startTime;

  const report: EvaluationReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    avgHitsAtK: Number(avgHitsAtK.toFixed(4)),
    avgContextRelevance: Number(avgContextRelevance.toFixed(4)),
    avgContextRecall: Number(avgContextRecall.toFixed(4)),
    avgFaithfulness: Number(avgFaithfulness.toFixed(4)),
    avgAnswerRelevance: Number(avgAnswerRelevance.toFixed(4)),
    overallScore: Number(overallScore.toFixed(4)),
    resultsByCategory,
    resultsByDifficulty,
    results,
  };

  console.log(
    `[rag-evaluator] 全量评估完成, 总耗时: ${totalDuration}ms, Overall Score: ${overallScore.toFixed(4)}`
  );
  console.log(
    `[rag-evaluator] Hits@K=${avgHitsAtK.toFixed(4)}, ContextRelevance=${avgContextRelevance.toFixed(4)}, ContextRecall=${avgContextRecall.toFixed(4)}, Faithfulness=${avgFaithfulness.toFixed(4)}, AnswerRelevance=${avgAnswerRelevance.toFixed(4)}`
  );

  return report;
}
