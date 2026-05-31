import { callWithFallback } from "@/server/llm/router";

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
  const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));
  const union = new Set(Array.from(setA).concat(Array.from(setB)));
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
    const response = await callWithFallback([
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

    const score = parseFloat((response.content ?? "").trim());
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
    const response = await callWithFallback([
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

    const score = parseFloat((response.content ?? "").trim());
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

export interface EvaluationWeights {
  hitsAtK?: number;
  contextRelevance?: number;
  contextRecall?: number;
  faithfulness?: number;
  answerRelevance?: number;
  numericalAccuracy?: number;
  complianceScore?: number;
  hallucinationRate?: number;
  riskDisclosure?: number;
  timeliness?: number;
}

export const DEFAULT_RAG_WEIGHTS: Required<EvaluationWeights> = {
  hitsAtK: 0.10,
  contextRelevance: 0.08,
  contextRecall: 0.07,
  faithfulness: 0.12,
  answerRelevance: 0.13,
  numericalAccuracy: 0.15,
  complianceScore: 0.15,
  hallucinationRate: 0.10,
  riskDisclosure: 0.05,
  timeliness: 0.05,
};

export interface FinancialEvaluationResult {
  numericalAccuracy: number;
  complianceScore: number;
  hallucinationRate: number;
  riskDisclosureScore: number;
  timelinessScore: number;
}

export interface FinancialEvaluationReport extends EvaluationReport {
  version: number;
  avgNumericalAccuracy: number;
  avgComplianceScore: number;
  avgHallucinationRate: number;
  avgRiskDisclosureScore: number;
  avgTimelinessScore: number;
  financialOverallScore: number;
  dataSource: "golden" | "historical" | "opendataset" | "mixed";
  dataSourceDetail?: string;
  evaluationLevel: "daily" | "standard" | "full";
  triggerMode: "manual" | "auto";
  milestone?: string;
}

export function evaluateNumericalAccuracy(
  actualAnswer: string,
  expectedAnswer: string
): number {
  console.log("[rag-evaluator] [金融评估] 开始数值精度评估");
  console.log(`[rag-evaluator] [金融评估] 实际答案长度: ${actualAnswer.length}, 期望答案长度: ${expectedAnswer.length}`);

  const numberRegex = /[-+]?\d[\d,]*\.?\d*%?/g;

  const extractNumbers = (text: string): number[] => {
    const matches = text.match(numberRegex);
    if (!matches) return [];
    return matches.map((m) => {
      const cleaned = m.replace(/,/g, "").replace(/%$/, "");
      const num = parseFloat(cleaned);
      if (m.endsWith("%")) return num / 100;
      return num;
    }).filter((n) => !isNaN(n));
  };

  const actualNumbers = extractNumbers(actualAnswer);
  const expectedNumbers = extractNumbers(expectedAnswer);

  console.log(`[rag-evaluator] [金融评估] 实际答案提取数值: ${actualNumbers.length} 个, 期望答案提取数值: ${expectedNumbers.length} 个`);

  if (expectedNumbers.length === 0) {
    console.log("[rag-evaluator] [金融评估] 期望答案无数值，数值精度默认为1");
    return 1;
  }

  if (actualNumbers.length === 0) {
    console.log("[rag-evaluator] [金融评估] 实际答案无数值，数值精度为0");
    return 0;
  }

  let totalScore = 0;

  for (const expected of expectedNumbers) {
    let bestScore = 0;

    for (const actual of actualNumbers) {
      if (expected === 0 && actual === 0) {
        bestScore = Math.max(bestScore, 1);
        continue;
      }

      const denominator = Math.abs(expected) > Math.abs(actual) ? Math.abs(expected) : Math.abs(actual);
      const errorRate = denominator === 0 ? 1 : Math.abs(expected - actual) / denominator;

      if (errorRate < 0.001) {
        bestScore = Math.max(bestScore, 1);
      } else if (errorRate <= 0.05) {
        bestScore = Math.max(bestScore, 0.5);
      }
    }

    totalScore += bestScore;
  }

  const avgScore = totalScore / expectedNumbers.length;
  const result = Number(avgScore.toFixed(4));

  console.log(`[rag-evaluator] [金融评估] 数值精度评估完成, 得分: ${result}, 期望数值: [${expectedNumbers.join(",")}], 实际数值: [${actualNumbers.join(",")}]`);
  return result;
}

export async function evaluateCompliance(
  answer: string,
  category: string
): Promise<number> {
  console.log(`[rag-evaluator] [金融评估] 开始合规性评估, category: ${category}`);

  const promisePatterns = [
    /保证收益/,
    /稳赚/,
    /一定赚钱/,
    /包赚/,
    /保本保息/,
    /零风险/,
    /无风险/,
    /绝对盈利/,
    /稳赚不赔/,
  ];

  const timingPatterns = [
    /现在买入/,
    /立即卖出/,
    /马上买入/,
    /赶紧买入/,
    /立刻买入/,
    /立即买入/,
    /现在卖出/,
    /赶紧卖出/,
  ];

  const investmentKeywords = [
    /投资/,
    /买入/,
    /卖出/,
    /持仓/,
    /建仓/,
    /加仓/,
    /减仓/,
    /基金/,
    /股票/,
    /债券/,
    /理财/,
  ];

  const riskKeywords = [
    /风险/,
    /提示/,
    /免责/,
    /不构成.*建议/,
    /仅供参考/,
    /投资有风险/,
    /过往业绩/,
  ];

  const isInvestmentAdvice = investmentKeywords.some((p) => p.test(answer) || p.test(category));
  const hasPromiseViolation = promisePatterns.some((p) => p.test(answer));
  const hasTimingViolation = timingPatterns.some((p) => p.test(answer));
  const hasRiskDisclosure = riskKeywords.some((p) => p.test(answer));

  console.log(`[rag-evaluator] [金融评估] 规则检查 - 涉及投资建议: ${isInvestmentAdvice}, 承诺收益违规: ${hasPromiseViolation}, 推荐时点违规: ${hasTimingViolation}, 包含风险提示: ${hasRiskDisclosure}`);

  try {
    console.log("[rag-evaluator] [金融评估] 尝试使用 LLM 评估合规性");

    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个金融合规评估专家。请评估回答是否存在以下违规：1.承诺收益（如保证收益、稳赚等）2.推荐具体买卖时点（如现在买入、立即卖出等）3.涉及投资建议但未声明风险。请返回JSON格式：{\"violations\": [\"违规项1\", \"违规项2\"], \"score\": 0.8}，score范围0-1，1表示完全合规。只返回JSON，不要其他内容。",
      },
      {
        role: "user",
        content: `分类：${category}\n回答：${answer}\n\n请评估合规性：`,
      },
    ]);

    const content = (response.content ?? "").trim();
    console.log(`[rag-evaluator] [金融评估] LLM 合规性评估原始返回: ${content}`);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const violations: string[] = parsed.violations || [];
      const score = parsed.score;

      if (typeof score === "number" && score >= 0 && score <= 1) {
        console.log(`[rag-evaluator] [金融评估] LLM 合规性评估完成, 违规项: [${violations.join(",")}], 得分: ${score}`);
        return Number(score.toFixed(4));
      }
    }

    console.error("[rag-evaluator] [金融评估] LLM 合规性评估返回格式异常，降级使用规则匹配");
  } catch (error) {
    console.error("[rag-evaluator] [金融评估] LLM 合规性评估失败，降级使用规则匹配:", error);
  }

  let violationCount = 0;
  const totalChecks = 3;

  if (hasPromiseViolation) violationCount++;
  if (hasTimingViolation) violationCount++;
  if (isInvestmentAdvice && !hasRiskDisclosure) violationCount++;

  const score = 1 - violationCount / totalChecks;
  const result = Number(score.toFixed(4));

  console.log(`[rag-evaluator] [金融评估] 规则降级合规性评估完成, 违规项数: ${violationCount}/${totalChecks}, 得分: ${result}`);
  return result;
}

export async function evaluateHallucination(
  answer: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<number> {
  console.log("[rag-evaluator] [金融评估] 开始幻觉率评估");
  console.log(`[rag-evaluator] [金融评估] 答案长度: ${answer.length}, 检索结果数: ${searchResults.length}`);

  const numberRegex = /[-+]?\d[\d,]*\.?\d*%?/g;

  const extractDataPoints = (text: string): string[] => {
    const matches = text.match(numberRegex);
    if (!matches) return [];
    return matches.map((m) => m.replace(/,/g, ""));
  };

  const answerDataPoints = extractDataPoints(answer);

  if (answerDataPoints.length === 0) {
    console.log("[rag-evaluator] [金融评估] 答案中无数值数据点，幻觉率默认为0");
    return 0;
  }

  console.log(`[rag-evaluator] [金融评估] 答案中提取数值数据点: ${answerDataPoints.length} 个`);

  try {
    console.log("[rag-evaluator] [金融评估] 尝试使用 LLM 评估幻觉率");

    const contextBlock = searchResults
      .map((r, i) => `[片段${i + 1}] ${r.text}`)
      .join("\n\n");

    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个RAG系统幻觉检测专家。请检查回答中的数值数据点是否都能在检索内容中找到来源。返回JSON格式：{\"ungrounded_points\": [\"无法溯源的数据点1\"], \"total_points\": 5, \"hallucination_rate\": 0.2}，hallucination_rate范围0-1，0表示无幻觉。只返回JSON。",
      },
      {
        role: "user",
        content: `检索内容：\n${contextBlock}\n\n回答：${answer}\n\n请检查幻觉率：`,
      },
    ]);

    const content = (response.content ?? "").trim();
    console.log(`[rag-evaluator] [金融评估] LLM 幻觉率评估原始返回: ${content}`);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const rate = parsed.hallucination_rate;

      if (typeof rate === "number" && rate >= 0 && rate <= 1) {
        console.log(`[rag-evaluator] [金融评估] LLM 幻觉率评估完成, 无法溯源: ${parsed.ungrounded_points?.length ?? "N/A"}, 总数据点: ${parsed.total_points ?? "N/A"}, 幻觉率: ${rate}`);
        return Number(rate.toFixed(4));
      }
    }

    console.error("[rag-evaluator] [金融评估] LLM 幻觉率评估返回格式异常，降级使用字符串包含检查");
  } catch (error) {
    console.error("[rag-evaluator] [金融评估] LLM 幻觉率评估失败，降级使用字符串包含检查:", error);
  }

  const contextText = searchResults.map((r) => r.text).join(" ");
  let ungroundedCount = 0;

  for (const dp of answerDataPoints) {
    if (!contextText.includes(dp)) {
      ungroundedCount++;
      console.log(`[rag-evaluator] [金融评估] 无法溯源数据点: ${dp}`);
    }
  }

  const hallucinationRate = ungroundedCount / answerDataPoints.length;
  const result = Number(hallucinationRate.toFixed(4));

  console.log(`[rag-evaluator] [金融评估] 规则降级幻觉率评估完成, 无法溯源: ${ungroundedCount}/${answerDataPoints.length}, 幻觉率: ${result}`);
  return result;
}

export function evaluateRiskDisclosure(
  answer: string,
  category: string
): number {
  console.log(`[rag-evaluator] [金融评估] 开始风险提示评估, category: ${category}`);

  const investmentCategories = [
    /投资建议/,
    /交易策略/,
    /投资/,
    /交易/,
    /股票/,
    /基金/,
    /理财/,
    /期货/,
    /期权/,
    /外汇/,
  ];

  const isInvestmentRelated = investmentCategories.some((p) => p.test(category));

  if (!isInvestmentRelated) {
    console.log(`[rag-evaluator] [金融评估] category "${category}" 不涉及投资建议，风险提示得分默认为1`);
    return 1;
  }

  const riskDisclosureKeywords = [
    /投资有风险/,
    /风险提示/,
    /过往业绩不代表/,
    /仅供参考/,
    /不构成.*建议/,
    /风险自担/,
    /谨慎投资/,
    /市场风险/,
    /可能.*亏损/,
    /不保证.*收益/,
  ];

  let disclosedCount = 0;
  const matchedKeywords: string[] = [];

  for (const pattern of riskDisclosureKeywords) {
    if (pattern.test(answer)) {
      disclosedCount++;
      matchedKeywords.push(pattern.source);
    }
  }

  const score = disclosedCount / riskDisclosureKeywords.length;
  const result = Number(score.toFixed(4));

  console.log(`[rag-evaluator] [金融评估] 风险提示评估完成, 已包含: ${disclosedCount}/${riskDisclosureKeywords.length}, 匹配关键词: [${matchedKeywords.join(",")}], 得分: ${result}`);
  return result;
}

export function evaluateTimeliness(
  answer: string,
  searchResults: Array<{ text: string; score: number }>
): number {
  console.log("[rag-evaluator] [金融评估] 开始时效性评估");

  const dateRegex = /(\d{4})[-/年](\d{1,2})[-/月]?(\d{0,2})[日号]?/g;

  const extractDates = (text: string): Date[] => {
    const dates: Date[] = [];
    let match: RegExpExecArray | null;

    while ((match = dateRegex.exec(text)) !== null) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = match[3] ? parseInt(match[3], 10) : 1;

      if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
        dates.push(new Date(year, month - 1, day));
      }
    }

    return dates;
  };

  const answerDates = extractDates(answer);
  const contextDates = searchResults.flatMap((r) => extractDates(r.text));
  const allDates = [...answerDates, ...contextDates];

  console.log(`[rag-evaluator] [金融评估] 答案日期: ${answerDates.length} 个, 检索结果日期: ${contextDates.length} 个, 合计: ${allDates.length} 个`);

  if (allDates.length === 0) {
    console.log("[rag-evaluator] [金融评估] 未提取到日期信息，时效性得分默认为0.5");
    return 0.5;
  }

  const now = new Date();
  const latestDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const diffMs = now.getTime() - latestDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  let score: number;

  if (diffDays <= 30) {
    score = 1;
  } else if (diffDays <= 90) {
    score = 0.7;
  } else if (diffDays <= 365) {
    score = 0.4;
  } else {
    score = 0.1;
  }

  const result = Number(score.toFixed(4));

  console.log(`[rag-evaluator] [金融评估] 时效性评估完成, 最新数据日期: ${latestDate.toISOString().split("T")[0]}, 距今天数: ${Math.round(diffDays)}, 得分: ${result}`);
  return result;
}

export async function runFinancialEvaluation(
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
  ) => Promise<string>,
  options?: {
    evaluationLevel?: "daily" | "standard" | "full";
    triggerMode?: "manual" | "auto";
    milestone?: string;
    dataSource?: "golden" | "historical" | "opendataset" | "mixed";
    dataSourceDetail?: string;
    weights?: EvaluationWeights;
  }
): Promise<FinancialEvaluationReport> {
  const evaluationLevel = options?.evaluationLevel ?? "standard";
  const triggerMode = options?.triggerMode ?? "manual";
  const milestone = options?.milestone;
  const dataSource = options?.dataSource ?? "mixed";
  const dataSourceDetail = options?.dataSourceDetail;
  const weights: Required<EvaluationWeights> = {
    ...DEFAULT_RAG_WEIGHTS,
    ...options?.weights,
  };

  console.log(`[rag-evaluator] [金融评估] 开始金融行业RAG评估, 测试集大小: ${testSet.length}, 评估级别: ${evaluationLevel}, 触发模式: ${triggerMode}, 数据来源: ${dataSource}`);

  const startTime = Date.now();

  const searchCache = new Map<string, Array<{ text: string; score: number }>>();
  async function cachedSearchFn(query: string): Promise<Array<{ text: string; score: number }>> {
    const cached = searchCache.get(query);
    if (cached) return cached;
    const results = await searchFn(query);
    searchCache.set(query, results);
    return results;
  }

  console.log("[rag-evaluator] [金融评估] 合并评估：通用指标 + 金融专用指标（单次检索 + 单次LLM）");

  const results: SingleTestResult[] = [];
  const financialResults: Array<FinancialEvaluationResult & { testId: number }> = [];

  for (let i = 0; i < testSet.length; i++) {
    const testItem = testSet[i];
    const category = testItem?.category ?? "未分类";
    const itemStart = Date.now();

    console.log(`[rag-evaluator] [金融评估] 评估第 ${i + 1}/${testSet.length} 条, query: "${testItem.query.slice(0, 50)}...", category: ${category}`);

    try {
      const searchResults = await cachedSearchFn(testItem.query);
      console.log(`[rag-evaluator] 检索完成, 结果数: ${searchResults.length}`);

      const actualAnswer = await answerFn(testItem.query, searchResults);
      console.log(`[rag-evaluator] 答案生成完成, 长度: ${actualAnswer.length}`);

      const [retrievalResult, answerResult, contextRecall, numericalAccuracy, complianceScore, hallucinationRate, riskDisclosureScore, timelinessScore] = await Promise.all([
        evaluateRetrieval(testItem.query, testItem.expectedAnswer, searchResults),
        evaluateAnswer(testItem.query, testItem.expectedAnswer, actualAnswer),
        evaluateContextRecall(testItem.query, testItem.expectedAnswer, searchResults),
        Promise.resolve(evaluateNumericalAccuracy(actualAnswer, testItem.expectedAnswer)),
        evaluateCompliance(actualAnswer, category),
        evaluateHallucination(actualAnswer, searchResults),
        Promise.resolve(evaluateRiskDisclosure(actualAnswer, category)),
        Promise.resolve(evaluateTimeliness(actualAnswer, searchResults)),
      ]);

      const durationMs = Date.now() - itemStart;

      results.push({
        id: testItem.id ?? i + 1,
        query: testItem.query,
        expectedAnswer: testItem.expectedAnswer,
        actualAnswer,
        retrieval: { ...retrievalResult, contextRecall },
        answer: answerResult,
        category,
        difficulty: testItem.difficulty ?? "medium",
        durationMs,
      });

      financialResults.push({
        testId: testItem.id ?? i + 1,
        numericalAccuracy,
        complianceScore,
        hallucinationRate,
        riskDisclosureScore,
        timelinessScore,
      });

      console.log(`[rag-evaluator] 第 ${i + 1} 条评估完成, Hits@K=${retrievalResult.hitsAtK}, Faithfulness=${answerResult.faithfulness}, 数值精度=${numericalAccuracy}, 合规性=${complianceScore}, 幻觉率=${hallucinationRate}, 耗时=${durationMs}ms`);
    } catch (error) {
      console.error(`[rag-evaluator] 第 ${i + 1} 条评估失败:`, error);
      results.push({
        id: testItem.id ?? i + 1,
        query: testItem.query,
        expectedAnswer: testItem.expectedAnswer,
        actualAnswer: "",
        retrieval: { hitsAtK: 0, contextRelevance: 0, contextRecall: 0 },
        answer: { faithfulness: 0, answerRelevance: 0 },
        category,
        difficulty: testItem.difficulty ?? "medium",
        durationMs: Date.now() - itemStart,
      });
      financialResults.push({
        testId: testItem.id ?? i + 1,
        numericalAccuracy: 0,
        complianceScore: 0,
        hallucinationRate: 1,
        riskDisclosureScore: 0,
        timelinessScore: 0,
      });
    }
  }

  const avgHitsAtK = results.reduce((sum, r) => sum + r.retrieval.hitsAtK, 0) / results.length;
  const avgContextRelevance = results.reduce((sum, r) => sum + r.retrieval.contextRelevance, 0) / results.length;
  const avgContextRecall = results.reduce((sum, r) => sum + r.retrieval.contextRecall, 0) / results.length;
  const avgFaithfulness = results.reduce((sum, r) => sum + r.answer.faithfulness, 0) / results.length;
  const avgAnswerRelevance = results.reduce((sum, r) => sum + r.answer.answerRelevance, 0) / results.length;

  const overallScore =
    avgHitsAtK * 0.2 +
    avgContextRelevance * 0.15 +
    avgContextRecall * 0.15 +
    avgFaithfulness * 0.25 +
    avgAnswerRelevance * 0.25;

  const resultsByCategory: EvaluationReport["resultsByCategory"] = {};
  for (const r of results) {
    if (!resultsByCategory[r.category]) {
      resultsByCategory[r.category] = { count: 0, avgHitsAtK: 0, avgFaithfulness: 0, avgAnswerRelevance: 0 };
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
    cat.avgAnswerRelevance = Number((cat.avgAnswerRelevance / cat.count).toFixed(4));
  }

  const resultsByDifficulty: EvaluationReport["resultsByDifficulty"] = {};
  for (const r of results) {
    if (!resultsByDifficulty[r.difficulty]) {
      resultsByDifficulty[r.difficulty] = { count: 0, avgHitsAtK: 0, avgFaithfulness: 0, avgAnswerRelevance: 0 };
    }
    const diff = resultsByDifficulty[r.difficulty];
    diff.count++;
    diff.avgHitsAtK += r.retrieval.hitsAtK;
    diff.avgFaithfulness += r.answer.faithfulness;
    diff.avgAnswerRelevance += r.answer.answerRelevance;
  }
  for (const diff of Object.values(resultsByDifficulty)) {
    diff.avgHitsAtK = Number((diff.avgHitsAtK / diff.count).toFixed(4));
    diff.avgFaithfulness = Number((diff.avgFaithfulness / diff.count).toFixed(4));
    diff.avgAnswerRelevance = Number((diff.avgAnswerRelevance / diff.count).toFixed(4));
  }

  const baseReport: EvaluationReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    avgHitsAtK: Number(avgHitsAtK.toFixed(4)),
    avgContextRelevance: Number(avgContextRelevance.toFixed(4)),
    avgContextRecall: Number(avgContextRecall.toFixed(4)),
    avgFaithfulness: Number(avgFaithfulness.toFixed(4)),
    avgAnswerRelevance: Number(avgAnswerRelevance.toFixed(4)),
    overallScore: Number(overallScore.toFixed(4)),
    results,
    resultsByCategory,
    resultsByDifficulty,
  };

  const avgNumericalAccuracy =
    financialResults.reduce((sum, r) => sum + r.numericalAccuracy, 0) / financialResults.length;
  const avgComplianceScore =
    financialResults.reduce((sum, r) => sum + r.complianceScore, 0) / financialResults.length;
  const avgHallucinationRate =
    financialResults.reduce((sum, r) => sum + r.hallucinationRate, 0) / financialResults.length;
  const avgRiskDisclosureScore =
    financialResults.reduce((sum, r) => sum + r.riskDisclosureScore, 0) / financialResults.length;
  const avgTimelinessScore =
    financialResults.reduce((sum, r) => sum + r.timelinessScore, 0) / financialResults.length;

  console.log(`[rag-evaluator] [金融评估] 使用权重配置: hitsAtK=${weights.hitsAtK}, contextRelevance=${weights.contextRelevance}, contextRecall=${weights.contextRecall}, faithfulness=${weights.faithfulness}, answerRelevance=${weights.answerRelevance}, numericalAccuracy=${weights.numericalAccuracy}, complianceScore=${weights.complianceScore}, hallucinationRate=${weights.hallucinationRate}, riskDisclosure=${weights.riskDisclosure}, timeliness=${weights.timeliness}`);

  const generalScore =
    baseReport.avgHitsAtK * weights.hitsAtK +
    baseReport.avgContextRelevance * weights.contextRelevance +
    baseReport.avgContextRecall * weights.contextRecall +
    baseReport.avgFaithfulness * weights.faithfulness +
    baseReport.avgAnswerRelevance * weights.answerRelevance;

  const financialScore =
    avgNumericalAccuracy * weights.numericalAccuracy +
    avgComplianceScore * weights.complianceScore +
    (1 - avgHallucinationRate) * weights.hallucinationRate +
    avgRiskDisclosureScore * weights.riskDisclosure +
    avgTimelinessScore * weights.timeliness;

  const financialOverallScore = Number((generalScore + financialScore).toFixed(4));

  const totalDuration = Date.now() - startTime;

  const report: FinancialEvaluationReport = {
    ...baseReport,
    version: 1,
    avgNumericalAccuracy: Number(avgNumericalAccuracy.toFixed(4)),
    avgComplianceScore: Number(avgComplianceScore.toFixed(4)),
    avgHallucinationRate: Number(avgHallucinationRate.toFixed(4)),
    avgRiskDisclosureScore: Number(avgRiskDisclosureScore.toFixed(4)),
    avgTimelinessScore: Number(avgTimelinessScore.toFixed(4)),
    financialOverallScore,
    dataSource,
    dataSourceDetail,
    evaluationLevel,
    triggerMode,
    milestone,
  };

  console.log(`[rag-evaluator] [金融评估] 金融行业RAG评估完成, 总耗时: ${totalDuration}ms`);
  console.log(
    `[rag-evaluator] [金融评估] 通用指标得分: ${generalScore.toFixed(4)}, 金融指标得分: ${financialScore.toFixed(4)}, 综合得分: ${financialOverallScore}`
  );
  console.log(
    `[rag-evaluator] [金融评估] 数值精度=${avgNumericalAccuracy.toFixed(4)}, 合规性=${avgComplianceScore.toFixed(4)}, 幻觉率=${avgHallucinationRate.toFixed(4)}, 风险提示=${avgRiskDisclosureScore.toFixed(4)}, 时效性=${avgTimelinessScore.toFixed(4)}`
  );

  return report;
}
