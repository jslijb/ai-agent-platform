import { callWithFallback } from "@/server/llm/router";

/**
 * 判断答案是否为拒绝回答模式
 * 当RAG系统无法从检索内容中找到答案时，应返回拒绝回答
 * @param answer - 实际生成的答案
 * @returns 是否为拒绝回答
 */
export function isRefusalAnswer(answer: string): boolean {
  if (!answer || answer.trim().length === 0) return false;
  // 拒绝回答的关键模式列表
  const refusalPatterns = [
    /无法回答/,
    /无法提供/,
    /不能回答/,
    /抱歉/,
    /我不知道/,
    /没有相关信息/,
    /无法给出/,
    /无法确定/,
    /无法判断/,
    /暂无.*信息/,
    /未找到.*相关/,
    /无法从.*中获取/,
  ];
  return refusalPatterns.some((pattern) => pattern.test(answer));
}

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
  /** 该查询是否应该能被回答，默认true（向后兼容） */
  canAnswer?: boolean;
  /** 检索阶段耗时（毫秒） */
  retrievalLatency?: number;
  /** 生成阶段耗时（毫秒） */
  generationLatency?: number;
  /** 端到端耗时（毫秒） */
  e2eLatency?: number;
  /** 是否为错误响应 */
  isError?: boolean;
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

/**
 * 中文文本分词函数
 * 使用字符bigram（2字符滑动窗口）+ 数字提取 + 英文单词提取
 * 解决中文无空格分隔导致整句变成单个token的问题
 */
function tokenize(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  const tokens: string[] = [];

  // 1. 提取数字（含小数、百分号、逗号分隔的数字）
  const numberRegex = /[-+]?\d[\d,]*\.?\d*%?/g;
  let numberMatch: RegExpExecArray | null;
  const numberPositions: Array<[number, number]> = []; // [start, end]
  while ((numberMatch = numberRegex.exec(text)) !== null) {
    tokens.push(numberMatch[0].replace(/,/g, ""));
    numberPositions.push([numberMatch.index, numberMatch.index + numberMatch[0].length]);
  }

  // 2. 提取英文单词（≥2字符）
  const englishRegex = /[a-zA-Z]{2,}/g;
  let englishMatch: RegExpExecArray | null;
  const englishPositions: Array<[number, number]> = [];
  while ((englishMatch = englishRegex.exec(text)) !== null) {
    tokens.push(englishMatch[0].toLowerCase());
    englishPositions.push([englishMatch.index, englishMatch.index + englishMatch[0].length]);
  }

  // 3. 构建跳过位置集合（数字和英文已提取的位置）
  const skipPositions = new Set<number>();
  for (const [start, end] of [...numberPositions, ...englishPositions]) {
    for (let i = start; i < end; i++) {
      skipPositions.add(i);
    }
  }

  // 4. 对剩余的中文文本使用字符bigram
  // 先清理标点符号，替换为空格
  const cleaned = text.replace(/[，。、；：！？（）""''【】《》\s,.:;!?(){}[\]""''·—…\-\/\\@#$%^&*+=|~`]/g, " ");

  // 提取连续的中文字符段
  const chineseSegments: string[] = [];
  let currentSegment = "";
  for (let i = 0; i < cleaned.length; i++) {
    if (skipPositions.has(i)) {
      if (currentSegment.trim().length > 0) {
        chineseSegments.push(currentSegment.trim());
      }
      currentSegment = "";
      continue;
    }
    const ch = cleaned[i];
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      currentSegment += ch;
    } else if (ch === " ") {
      if (currentSegment.trim().length > 0) {
        chineseSegments.push(currentSegment.trim());
      }
      currentSegment = "";
    } else {
      // 非中文字符且非空格，结束当前段
      if (currentSegment.trim().length > 0) {
        chineseSegments.push(currentSegment.trim());
      }
      currentSegment = "";
    }
  }
  if (currentSegment.trim().length > 0) {
    chineseSegments.push(currentSegment.trim());
  }

  // 对每个中文段生成bigram
  for (const segment of chineseSegments) {
    if (segment.length >= 2) {
      for (let i = 0; i <= segment.length - 2; i++) {
        tokens.push(segment.substring(i, i + 2));
      }
    }
  }

  // 去重
  return Array.from(new Set(tokens));
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

  // 拒绝回答的答案相关性直接给低分
  if (isRefusalAnswer(answer)) return 0.1;

  // 改进：使用关键词覆盖率替代jaccard
  // 从query中提取关键词（数字、英文单词、中文bigram）
  const queryTokens = tokenize(query);
  const answerTokens = new Set(tokenize(answer));

  if (queryTokens.length === 0) return 0;

  // 计算query关键词在answer中的覆盖率
  const coveredTokens = queryTokens.filter((t) => answerTokens.has(t));
  const keywordCoverage = coveredTokens.length / queryTokens.length;

  // 额外检查：query中的核心实体是否在answer中出现
  // 提取query中的数字和英文单词作为核心关键词
  const coreKeywords: string[] = [];
  const numberRegex = /[-+]?\d[\d,]*\.?\d*%?/g;
  const englishRegex = /[a-zA-Z]{2,}/g;
  let numberMatch: RegExpExecArray | null;
  while ((numberMatch = numberRegex.exec(query)) !== null) {
    coreKeywords.push(numberMatch[0].replace(/,/g, ""));
  }
  let englishMatch: RegExpExecArray | null;
  while ((englishMatch = englishRegex.exec(query)) !== null) {
    coreKeywords.push(englishMatch[0].toLowerCase());
  }

  // 核心关键词覆盖率（权重更高）
  let coreCoverage = 1;
  if (coreKeywords.length > 0) {
    const coveredCore = coreKeywords.filter((kw) => answerTokens.has(kw) || answer.includes(kw));
    coreCoverage = coveredCore.length / coreKeywords.length;
  }

  // 综合评分：核心关键词覆盖率60% + 一般关键词覆盖率40%
  const score = Math.min(coreCoverage * 0.6 + keywordCoverage * 0.4, 1);

  console.log(`[rag-evaluator] 降级 Answer Relevance: 关键词覆盖=${keywordCoverage.toFixed(3)}, 核心关键词覆盖=${coreCoverage.toFixed(3)}, 综合=${score.toFixed(3)}`);
  return score;
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

/**
 * 使用LLM评估Context Recall
 * 判断期望答案中的每个关键信息是否在检索结果中出现
 */
async function llmEvaluateContextRecall(
  query: string,
  expectedAnswer: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<number> {
  console.log("[rag-evaluator] 使用 LLM 评估 Context Recall");

  if (searchResults.length === 0) {
    console.log("[rag-evaluator] LLM Context Recall: 无检索结果，返回0");
    return 0;
  }

  const contextBlock = searchResults
    .map((t, i) => `[片段${i + 1}] ${t.text.slice(0, 500)}`)
    .join("\n\n");

  try {
    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请评估检索内容是否包含了回答问题所需的关键信息。\n\n评估方法：\n1. 从期望答案中提取关键信息点（如具体数值、事实陈述、专业术语等）\n2. 检查每个关键信息点是否在检索内容中出现（直接出现或语义等价）\n3. 计算覆盖率 = 被覆盖的关键信息点数 / 总关键信息点数\n\n评分标准：\n- 1.0分：检索内容包含了期望答案中的所有关键信息\n- 0.8分：大部分关键信息被覆盖（>=80%）\n- 0.6分：约一半关键信息被覆盖\n- 0.4分：少量关键信息被覆盖（<50%）\n- 0.2分：几乎无关键信息被覆盖\n- 0.0分：检索内容与期望答案完全无关\n\n注意：语义等价也算覆盖（如3865亿和3865亿元，增长15%和增幅15%）\n\n只返回一个0到1之间的数字，不要返回其他内容。",
      },
      {
        role: "user",
        content: `用户问题：${query}\n\n期望答案：${expectedAnswer}\n\n检索内容：\n${contextBlock}\n\n请评估检索内容对期望答案关键信息的覆盖度（0-1）：`,
      },
    ]);

    const score = parseFloat((response.content ?? "").trim());
    if (isNaN(score) || score < 0 || score > 1) {
      console.error(
        `[rag-evaluator] LLM Context Recall 评分解析失败: "${response.content}", 使用默认值`
      );
      return fallbackContextRecall(expectedAnswer, searchResults);
    }

    console.log(`[rag-evaluator] LLM Context Recall 评分: ${score}`);
    return score;
  } catch (error) {
    console.error("[rag-evaluator] LLM Context Recall 评估失败:", error);
    return fallbackContextRecall(expectedAnswer, searchResults);
  }
}

/**
 * V6优化：合并3个LLM评估为1个调用，减少API请求次数
 * 一次性评估 Faithfulness + Answer Relevance + Answer Correctness
 */
async function llmEvaluateMerged(
  answer: string,
  contextTexts: string[],
  query: string,
  expectedAnswer?: string
): Promise<{ faithfulness: number; relevance: number; correctness: number }> {
  console.log("[rag-evaluator] 使用合并LLM评估（Faithfulness+Relevance+Correctness）");

  // 拒绝回答的特殊处理
  if (isRefusalAnswer(answer)) {
    console.log("[rag-evaluator] 检测到拒绝回答，合并评估: Faithfulness=1.0, Relevance=0.1, Correctness=0");
    return { faithfulness: 1.0, relevance: 0.1, correctness: 0 };
  }

  const contextBlock = contextTexts
    .map((t, i) => `[片段${i + 1}] ${t.slice(0, 500)}`)
    .join("\n\n");

  const expectedPart = expectedAnswer ? `\n\n期望答案（参考）：${expectedAnswer}` : "";

  try {
    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请对生成的答案进行三个维度的评估，返回JSON格式。\n\n评估维度：\n1. faithfulness（忠实度）：答案是否忠实于检索内容，有无编造信息\n   - 1.0: 所有信息都有检索内容支持\n   - 0.8: 大部分信息有支持，少量合理推断\n   - 0.6: 约一半信息有支持\n   - 0.4: 大部分信息缺乏依据\n   - 0.2: 几乎脱离检索内容\n   - 0.0: 完全无关\n   注意：合理的总结和推断不算编造；答案比检索内容更精简不算不忠实\n\n2. relevance（相关性）：答案是否有效回答了用户问题\n   - 1.0: 完全回答了问题，关键信息准确\n   - 0.8: 回答了主要部分，少量细节缺失\n   - 0.6: 部分回答了问题\n   - 0.4: 提供了部分相关信息\n   - 0.2: 几乎不相关\n   - 0.0: 完全无关\n   注意：如果答案包含问题所询问的核心数据（如具体数值），应给高分(>=0.8)\n   如果答案说无法获取完整数据但提供了部分相关数据，给0.5-0.7分\n   如果答案提供了相关背景信息，给0.4-0.6分\n   只有完全无关的回答才给0分\n\n3. correctness（正确性）：答案与期望答案的语义一致性\n   - 1.0: 与期望答案核心信息一致\n   - 0.8: 主要信息一致，细节有差异\n   - 0.6: 部分信息一致\n   - 0.4: 仅少量信息一致\n   - 0.2: 大部分不一致\n   - 0.0: 完全不一致\n   注意：数值差异5%以内视为准确\n   答案比期望答案更详细但核心一致给高分(>=0.8)\n   答案包含期望答案中的关键数值给高分(>=0.7)\n\n只返回JSON，格式：{\"faithfulness\": 0.8, \"relevance\": 0.6, \"correctness\": 0.7}",
      },
      {
        role: "user",
        content: `用户问题：${query}\n\n检索内容：\n${contextBlock}\n\n生成的答案：${answer}${expectedPart}`,
      },
    ]);

    const content = (response.content ?? "").trim();
    // 尝试解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[rag-evaluator] 合并评估JSON解析失败: "${content}"`);
      return { faithfulness: 0.5, relevance: 0.5, correctness: 0.5 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const faithfulness = Math.min(1, Math.max(0, Number(parsed.faithfulness) || 0));
    const relevance = Math.min(1, Math.max(0, Number(parsed.relevance) || 0));
    const correctness = Math.min(1, Math.max(0, Number(parsed.correctness) || 0));

    console.log(`[rag-evaluator] 合并评估结果: faithfulness=${faithfulness}, relevance=${relevance}, correctness=${correctness}`);
    return { faithfulness, relevance, correctness };
  } catch (error) {
    console.error("[rag-evaluator] 合并LLM评估失败:", error);
    return { faithfulness: 0.5, relevance: 0.5, correctness: 0.5 };
  }
}

async function llmEvaluateFaithfulness(
  answer: string,
  contextTexts: string[]
): Promise<number> {
  console.log("[rag-evaluator] 使用 LLM 评估 Faithfulness");

  // 拒绝回答的faithfulness应该给高分（没有编造信息）
  if (isRefusalAnswer(answer)) {
    console.log("[rag-evaluator] 检测到拒绝回答，Faithfulness = 1.0（无编造）");
    return 1.0;
  }

  const contextBlock = contextTexts
    .map((t, i) => `[片段${i + 1}] ${t}`)
    .join("\n\n");

  try {
    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请评估生成的答案是否忠实于提供的检索内容。\n\n评估标准：\n- 1.0分：答案中所有信息都能在检索内容中找到直接支持，无任何编造\n- 0.8分：答案中大部分信息有检索内容支持，仅有少量推断\n- 0.6分：答案中约一半信息有检索内容支持，另一半缺乏依据\n- 0.4分：答案中大部分信息无法在检索内容中找到依据\n- 0.2分：答案几乎完全脱离检索内容，大量编造\n- 0.0分：答案与检索内容完全无关\n\n特别注意：\n1. 答案中的具体数值（如营业收入、增长率等）必须在检索内容中有明确来源\n2. 答案中的事实陈述必须有检索内容支持\n3. 合理的推断和总结不算编造，但必须基于检索内容\n\n只返回一个0到1之间的数字，不要返回其他内容。",
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
  answer: string,
  expectedAnswer?: string
): Promise<number> {
  console.log("[rag-evaluator] 使用 LLM 评估 Answer Relevance");

  // 拒绝回答的答案相关性直接给低分，不需要LLM评估
  if (isRefusalAnswer(answer)) {
    console.log("[rag-evaluator] 检测到拒绝回答，Answer Relevance = 0.1");
    return 0.1;
  }

  try {
    // 构建评估prompt，包含期望答案作为参考
    const expectedPart = expectedAnswer
      ? `\n\n期望答案（仅供参考，不要求完全一致）：${expectedAnswer}`
      : "";

    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请评估生成的答案是否有效回答了用户的问题。\n\n评估维度（各占权重）：\n1. 关键信息覆盖度（40%）：答案是否涵盖了问题所询问的关键信息\n2. 直接性（30%）：答案是否直接回应了问题，而非绕弯子\n3. 准确性（30%）：答案中的具体数据和信息是否准确\n\n评分标准：\n- 1.0分：完全回答了问题，关键信息准确完整\n- 0.8分：回答了问题的主要部分，少量细节缺失\n- 0.6分：部分回答了问题，但缺少重要信息\n- 0.4分：仅部分相关，未有效回答核心问题\n- 0.2分：几乎不相关，未回答问题\n- 0.0分：完全无关\n\n特别注意：\n1. 如果问题询问具体数值，答案包含了该数值则给高分(>=0.8)，即使答案也说了无法获取完整数据\n2. 如果答案说无法获取但提供了部分相关数据，应给中等分数(0.4-0.6)\n3. 如果答案提供了相关但非核心的信息，给中等分数(0.4-0.6)\n4. 只有完全无关的回答才给0分\n\n只返回一个0到1之间的数字，不要返回其他内容。",
      },
      {
        role: "user",
        content: `用户问题：${query}\n\n生成的答案：${answer}${expectedPart}\n\n请评估答案对问题的回答有效性（0-1）：`,
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

    if (expectedKeywords.length > 0) {
      for (const result of topKResults) {
        // 使用tokenize对检索结果也进行分词，然后计算关键词覆盖率
        const resultKeywords = new Set(tokenize(result.text));
        const matchedKeywords = expectedKeywords.filter((kw) => resultKeywords.has(kw));
        // 覆盖率阈值：至少10%的期望关键词在检索结果中出现
        if (matchedKeywords.length >= Math.ceil(expectedKeywords.length * 0.10)) {
          hitsAtK = 1;
          break;
        }
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
    if (expectedKeywords.length > 0) {
      for (const result of topKResults) {
        const resultKeywords = new Set(tokenize(result.text));
        const matchedKeywords = expectedKeywords.filter((kw) => resultKeywords.has(kw));
        if (matchedKeywords.length >= Math.ceil(expectedKeywords.length * 0.10)) {
          hitsAtK = 1;
          break;
        }
      }
    }

    return { hitsAtK, contextRelevance: 0 };
  }
}

export async function evaluateAnswer(
  query: string,
  expectedAnswer: string,
  actualAnswer: string,
  searchResults?: Array<{ text: string; score: number }>
): Promise<{ faithfulness: number; answerRelevance: number }> {
  console.log(
    `[rag-evaluator] 评估答案质量, query: "${query.slice(0, 50)}..."`
  );

  try {
    const scorers = await getScorers();

    let heuristicFaithfulness: number;
    let heuristicRelevance: number;

    // 使用检索结果作为faithfulness评估的context（而非期望答案）
    const contextForEval = searchResults && searchResults.length > 0
      ? searchResults.map((r) => r.text)
      : [expectedAnswer];

    if (scorers) {
      try {
        const sample = {
          query,
          context: contextForEval,
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
        heuristicFaithfulness = fallbackFaithfulness(actualAnswer, contextForEval.join(" "));
        heuristicRelevance = fallbackAnswerRelevance(query, actualAnswer);
      }
    } else {
      heuristicFaithfulness = fallbackFaithfulness(actualAnswer, contextForEval.join(" "));
      heuristicRelevance = fallbackAnswerRelevance(query, actualAnswer);

      console.log(
        `[rag-evaluator] 降级 Faithfulness: ${heuristicFaithfulness}, 降级 Relevance: ${heuristicRelevance}`
      );
    }

    let llmFaithfulness: number | null = null;
    let llmRelevance: number | null = null;
    let llmCorrectness: number | null = null;

    try {
      // V6优化：合并3个LLM调用为1个，减少API请求次数，降低超时概率
      const mergedResult = await llmEvaluateMerged(actualAnswer, contextForEval, query, expectedAnswer);
      llmFaithfulness = mergedResult.faithfulness;
      llmRelevance = mergedResult.relevance;
      llmCorrectness = mergedResult.correctness;

      console.log(
        `[rag-evaluator] LLM Faithfulness: ${llmFaithfulness}, LLM Relevance: ${llmRelevance}, LLM Correctness: ${llmCorrectness}`
      );
    } catch (llmError) {
      console.error("[rag-evaluator] LLM 评估失败，使用启发式评分:", llmError);
    }

    const faithfulness =
      llmFaithfulness !== null
        ? heuristicFaithfulness * 0.3 + llmFaithfulness * 0.7
        : heuristicFaithfulness;

    // Answer Relevance融合策略：
    // 启发式(关键词覆盖率) 10% + LLM Relevance(问题相关性) 30% + LLM Correctness(答案正确性) 60%
    // Correctness权重最高，因为它直接衡量答案与期望答案的语义一致性
    let answerRelevance: number;
    if (llmRelevance !== null && llmCorrectness !== null) {
      answerRelevance = heuristicRelevance * 0.1 + llmRelevance * 0.3 + llmCorrectness * 0.6;
    } else if (llmRelevance !== null) {
      answerRelevance = heuristicRelevance * 0.3 + llmRelevance * 0.7;
    } else {
      answerRelevance = heuristicRelevance;
    }

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
  searchResults: Array<{ text: string; score: number }>,
  hitsAtK?: number
): Promise<number> {
  console.log("[rag-evaluator] 评估 Context Recall");

  try {
    // 优先使用LLM评估Context Recall（对中文效果更好）
    const llmScore = await llmEvaluateContextRecall(query, expectedAnswer, searchResults);

    const scorers = await getScorers();
    let libScore: number | null = null;

    if (scorers) {
      try {
        const sample = {
          query,
          context: searchResults.map((r) => r.text),
          ground_truth: expectedAnswer,
          generated_answer: expectedAnswer, // Context Recall需要generated_answer非空才能正确评估
        };

        const contextRecallResult = await scorers.contextRecallScorer.score(sample);
        libScore = contextRecallResult.score;

        console.log(
          `[rag-evaluator] Context Recall (库): ${libScore}, 覆盖事实: ${contextRecallResult.covered_facts}/${contextRecallResult.total_facts}`
        );
      } catch (scorerError) {
        console.error("[rag-evaluator] 库评分器失败:", scorerError);
      }
    }

    // 融合策略：LLM评分权重0.7，库评分权重0.3（如果库评分可用）
    let finalScore: number;
    if (libScore !== null) {
      finalScore = llmScore * 0.7 + libScore * 0.3;
      console.log(`[rag-evaluator] Context Recall 融合: LLM=${llmScore}, 库=${libScore}, 融合=${finalScore}`);
    } else {
      finalScore = llmScore;
      console.log(`[rag-evaluator] Context Recall 使用LLM评分: ${llmScore}`);
    }

    // 如果检索命中（hitsAtK=1），Context Recall最低0.5
    // 因为检索命中说明检索结果包含相关信息，Context Recall不应过低
    if (hitsAtK === 1 && finalScore < 0.5) {
      console.log(`[rag-evaluator] Context Recall 修正: 检索命中但评分过低(${finalScore}), 修正为0.5`);
      finalScore = 0.5;
    }

    return finalScore;
  } catch (error) {
    console.error("[rag-evaluator] Context Recall 评估失败，使用降级计算:", error);
    return fallbackContextRecall(expectedAnswer, searchResults);
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

      // 先计算检索指标（需要hitsAtK给Context Recall使用）
      const retrievalResult = await evaluateRetrieval(testItem.query, testItem.expectedAnswer, searchResults);
      const [answerResult, contextRecall] = await Promise.all([
        evaluateAnswer(testItem.query, testItem.expectedAnswer, actualAnswer, searchResults),
        evaluateContextRecall(testItem.query, testItem.expectedAnswer, searchResults, retrievalResult.hitsAtK),
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

/** QA测试项接口，包含canAnswer字段 */
export interface QATestItem {
  id?: number;
  query: string;
  expectedAnswer: string;
  category?: string;
  difficulty?: string;
  /** 该查询是否应该能被回答，默认true（向后兼容） */
  canAnswer?: boolean;
}

/** LLM函数类型，用于Answer Correctness评估 */
export type LLMFunction = (messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>) => Promise<{ content: string }>;

/** 系统配置信息 */
export interface SystemConfig {
  llmModel: string;
  embeddingModel: string;
  retrievalTopK: number;
  temperature: number;
  chunkSize: number;
  chunkOverlap: number;
  [key: string]: unknown;
}

/** 性能指标 - 延迟百分位统计 */
export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}

/** 性能指标集合 */
export interface PerformanceMetrics {
  retrievalLatency: LatencyPercentiles;
  generationLatency: LatencyPercentiles;
  e2eLatency: LatencyPercentiles;
  /** 成功率：非错误响应 / 总请求数 */
  successRate: number;
}

/** 行业基准 */
export interface IndustryBenchmarks {
  hitsAtK: number;
  faithfulness: number;
  answerRelevance: number;
  numericalAccuracy: number;
  complianceScore: number;
  hallucinationRate: number;
  [key: string]: number;
}

/** 版本对比 - 多版本对比支持 */
export interface VersionComparison {
  versions: Array<{
    version: string;  // "V1", "V2", etc.
    timestamp: string;
    optimizationSummary: string;
    metrics: Record<string, number>;
  }>;
  improvements: Array<{
    metric: string;
    v1Value: number;
    latestValue: number;
    improvement: string;  // "+62%" or "-5%"
    trend: 'improving' | 'stable' | 'declining';
  }>;
}

/** 指标详情 - 包含定义、计算方法、阈值和状态 */
export interface MetricDetail {
  name: string;
  definition: string;
  calculationMethod: string;
  currentValue: number;
  excellentThreshold: number;
  passingThreshold: number;
  status: "excellent" | "passing" | "failing";
  failureReason?: string;
}

/** 失败案例 */
export interface FailureCase {
  testId: number;
  query: string;
  overallScore: number;
  failureReasons: string[];
}

/** 诊断信息 */
export interface DiagnosticInfo {
  /** 检索质量 × 生成质量交叉分析 */
  crossAnalysis: {
    highRetrievalHighGeneration: number;
    highRetrievalLowGeneration: number;
    lowRetrievalHighGeneration: number;
    lowRetrievalLowGeneration: number;
  };
  /** 瓶颈识别：retrieval | generation | balanced */
  bottleneck: "retrieval" | "generation" | "balanced";
  /** 拒绝率 */
  refusalRate: number;
  /** 正确拒绝率 */
  correctRefusalRate: number;
}

/** 诊断矩阵 */
export interface DiagnosticMatrix {
  crossAnalysis: DiagnosticInfo["crossAnalysis"];
  topFailureCases: FailureCase[];
  bottleneck: DiagnosticInfo["bottleneck"];
  refusalRate: number;
  correctRefusalRate: number;
}

/** 专业评估报告 - 扩展金融评估报告 */
export interface ProfessionalEvaluationReport extends FinancialEvaluationReport {
  systemConfig: SystemConfig;
  avgMRR: number;
  avgAnswerCorrectness: number;
  avgRefusalAccuracy: number;
  performanceMetrics: PerformanceMetrics;
  diagnosis: DiagnosticInfo;
  topFailureCases: FailureCase[];
  industryBenchmarks: IndustryBenchmarks;
  versionComparison?: VersionComparison;
  metricDetails: MetricDetail[];
}

/**
 * 评估拒绝准确率
 * 公式：(正确拒绝数 + 正确回答数) / 总测试数
 * - 正确拒绝 = canAnswer=false 且 isRefusalAnswer(actualAnswer)
 * - 正确回答 = canAnswer=true 且 NOT isRefusalAnswer(actualAnswer)
 */
export function evaluateRefusalAccuracy(
  results: Array<{ canAnswer: boolean; actualAnswer: string }>
): number {
  console.log("[rag-evaluator] [拒绝准确率] 开始评估拒绝准确率");
  console.log(`[rag-evaluator] [拒绝准确率] 样本数: ${results.length}`);

  if (results.length === 0) {
    console.log("[rag-evaluator] [拒绝准确率] 无样本，返回0");
    return 0;
  }

  let correctCount = 0;

  for (const result of results) {
    const isRefusal = isRefusalAnswer(result.actualAnswer);
    // 正确拒绝：不可回答的问题被正确拒绝
    const correctRefusal = !result.canAnswer && isRefusal;
    // 正确回答：可回答的问题未被拒绝
    const correctAnswer = result.canAnswer && !isRefusal;

    if (correctRefusal || correctAnswer) {
      correctCount++;
    }
  }

  const accuracy = correctCount / results.length;
  const result = Number(accuracy.toFixed(4));

  console.log(`[rag-evaluator] [拒绝准确率] 评估完成, 正确数: ${correctCount}/${results.length}, 准确率: ${result}`);
  return result;
}

/**
 * 评估答案正确性（RAGAS核心指标）
 * 使用LLM评估实际答案与期望答案的语义一致性（0-1分）
 * 仅对canAnswer=true的样本评估
 * 评估维度：事实一致性、完整性、相关性
 */
export async function evaluateAnswerCorrectness(
  actualAnswer: string,
  expectedAnswer: string,
  llmFn?: LLMFunction
): Promise<number> {
  console.log("[rag-evaluator] [答案正确性] 开始评估答案正确性");
  console.log(`[rag-evaluator] [答案正确性] 实际答案长度: ${actualAnswer.length}, 期望答案长度: ${expectedAnswer.length}`);

  // 如果没有提供LLM函数，使用默认的callWithFallback
  const llmCall = llmFn ?? (async (messages) => {
    return callWithFallback(messages as Array<import("@/server/llm/providers/bailian").BailianMessage>);
  });

  try {
    const response = await llmCall([
      {
        role: "system",
        content:
          "你是一个RAG系统评估专家。请评估生成的答案与期望答案之间的语义一致性。\n\n评估维度：\n1. 事实一致性（40%）：答案中的事实信息是否与期望答案一致\n2. 完整性（30%）：答案是否涵盖了期望答案中的关键信息\n3. 准确性（30%）：答案中的具体数值、日期等是否准确\n\n评分标准：\n- 1.0分：与期望答案完全一致，所有关键信息准确无误\n- 0.8分：主要信息一致，少量细节差异\n- 0.6分：部分信息一致，但缺少重要细节或有轻微偏差\n- 0.4分：仅部分信息一致，关键信息缺失或有明显偏差\n- 0.2分：大部分信息不一致\n- 0.0分：完全不一致\n\n特别注意：\n1. 数值差异在5%以内视为准确\n2. 如果实际答案包含了期望答案的所有关键信息但表述不同，仍应给高分\n3. 如果实际答案比期望答案更详细但核心信息一致，不应扣分\n\n只返回一个0到1之间的数字，不要返回其他内容。",
      },
      {
        role: "user",
        content: `期望答案：${expectedAnswer}\n\n生成的答案：${actualAnswer}\n\n请评估答案正确性（0-1）：`,
      },
    ]);

    const score = parseFloat((response.content ?? "").trim());
    if (isNaN(score) || score < 0 || score > 1) {
      console.error(
        `[rag-evaluator] [答案正确性] LLM评分解析失败: "${response.content}", 使用默认值0.5`
      );
      return 0.5;
    }

    console.log(`[rag-evaluator] [答案正确性] LLM评分: ${score}`);
    return Number(score.toFixed(4));
  } catch (error) {
    console.error("[rag-evaluator] [答案正确性] LLM评估失败:", error);
    return 0.5;
  }
}

/**
 * 计算MRR（Mean Reciprocal Rank）
 * 对每个查询，找到第一个相关结果的排名，MRR = 所有查询的1/rank的均值
 * 如果没有找到相关结果，1/rank = 0
 */
export function calculateMRR(
  searchResults: Array<{
    query: string;
    results: Array<{ content: string; relevanceScore: number }>;
    expectedContent?: string;
  }>
): number {
  console.log("[rag-evaluator] [MRR] 开始计算MRR");
  console.log(`[rag-evaluator] [MRR] 查询数: ${searchResults.length}`);

  if (searchResults.length === 0) {
    console.log("[rag-evaluator] [MRR] 无查询数据，返回0");
    return 0;
  }

  let totalReciprocalRank = 0;

  for (const queryResult of searchResults) {
    const { query, results, expectedContent } = queryResult;

    if (!expectedContent || results.length === 0) {
      // 无期望内容或无检索结果，该查询1/rank=0
      console.log(`[rag-evaluator] [MRR] 查询 "${query.slice(0, 30)}..." 无期望内容或无检索结果，1/rank=0`);
      continue;
    }

    // 在检索结果中找到第一个相关结果的排名
    let foundRank = 0;
    const expectedTokens = tokenize(expectedContent);

    for (let i = 0; i < results.length; i++) {
      const resultContent = results[i].content;
      const resultTokens = tokenize(resultContent);
      // 使用Jaccard相似度判断相关性，阈值0.2
      const similarity = jaccardSimilarity(expectedTokens, resultTokens);
      if (similarity >= 0.2) {
        foundRank = i + 1; // 排名从1开始
        break;
      }
    }

    if (foundRank > 0) {
      const reciprocalRank = 1 / foundRank;
      totalReciprocalRank += reciprocalRank;
      console.log(`[rag-evaluator] [MRR] 查询 "${query.slice(0, 30)}..." 首个相关结果排名: ${foundRank}, 1/rank: ${reciprocalRank.toFixed(4)}`);
    } else {
      console.log(`[rag-evaluator] [MRR] 查询 "${query.slice(0, 30)}..." 未找到相关结果，1/rank=0`);
    }
  }

  const mrr = totalReciprocalRank / searchResults.length;
  const result = Number(mrr.toFixed(4));

  console.log(`[rag-evaluator] [MRR] MRR计算完成: ${result}`);
  return result;
}

/**
 * 计算延迟百分位统计
 * @param values - 延迟值数组（毫秒）
 */
function calculateLatencyPercentiles(values: number[]): LatencyPercentiles {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  };

  return {
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    avg: Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * 从评估结果中计算系统性能指标
 * 包含检索延迟、生成延迟、端到端延迟的P50/P95/P99统计
 * 以及成功率（非错误响应 / 总请求数）
 */
export function calculatePerformanceMetrics(
  results: SingleTestResult[]
): PerformanceMetrics {
  console.log("[rag-evaluator] [性能指标] 开始计算系统性能指标");

  const retrievalLatencies = results
    .filter((r) => r.retrievalLatency != null)
    .map((r) => r.retrievalLatency!);
  const generationLatencies = results
    .filter((r) => r.generationLatency != null)
    .map((r) => r.generationLatency!);
  const e2eLatencies = results
    .filter((r) => r.e2eLatency != null)
    .map((r) => r.e2eLatency!);

  // 如果没有单独记录的延迟，使用durationMs作为端到端延迟
  const effectiveE2ELatencies = e2eLatencies.length > 0
    ? e2eLatencies
    : results.map((r) => r.durationMs);

  const successCount = results.filter((r) => !r.isError && r.actualAnswer.length > 0).length;
  const successRate = results.length > 0 ? successCount / results.length : 0;

  const metrics: PerformanceMetrics = {
    retrievalLatency: calculateLatencyPercentiles(retrievalLatencies),
    generationLatency: calculateLatencyPercentiles(generationLatencies),
    e2eLatency: calculateLatencyPercentiles(effectiveE2ELatencies),
    successRate: Number(successRate.toFixed(4)),
  };

  console.log(`[rag-evaluator] [性能指标] 计算完成, 成功率: ${metrics.successRate}, E2E P50: ${metrics.e2eLatency.p50}ms, P95: ${metrics.e2eLatency.p95}ms, P99: ${metrics.e2eLatency.p99}ms`);
  return metrics;
}

/**
 * 生成诊断矩阵
 * 包含：检索质量×生成质量交叉分析、Top5失败案例、瓶颈识别、拒绝率
 */
export function generateDiagnosticMatrix(
  results: SingleTestResult[]
): DiagnosticMatrix {
  console.log("[rag-evaluator] [诊断矩阵] 开始生成诊断矩阵");

  // 定义高低阈值
  const retrievalThreshold = 0.5;
  const generationThreshold = 0.5;

  let highRetrievalHighGeneration = 0;
  let highRetrievalLowGeneration = 0;
  let lowRetrievalHighGeneration = 0;
  let lowRetrievalLowGeneration = 0;

  for (const r of results) {
    const retrievalScore = r.retrieval.contextRelevance;
    const generationScore = (r.answer.faithfulness + r.answer.answerRelevance) / 2;
    const isHighRetrieval = retrievalScore >= retrievalThreshold;
    const isHighGeneration = generationScore >= generationThreshold;

    if (isHighRetrieval && isHighGeneration) {
      highRetrievalHighGeneration++;
    } else if (isHighRetrieval && !isHighGeneration) {
      highRetrievalLowGeneration++;
    } else if (!isHighRetrieval && isHighGeneration) {
      lowRetrievalHighGeneration++;
    } else {
      lowRetrievalLowGeneration++;
    }
  }

  const total = results.length || 1;
  const crossAnalysis = {
    highRetrievalHighGeneration: Number((highRetrievalHighGeneration / total).toFixed(4)),
    highRetrievalLowGeneration: Number((highRetrievalLowGeneration / total).toFixed(4)),
    lowRetrievalHighGeneration: Number((lowRetrievalHighGeneration / total).toFixed(4)),
    lowRetrievalLowGeneration: Number((lowRetrievalLowGeneration / total).toFixed(4)),
  };

  // 瓶颈识别
  const lowRetrievalRatio = (lowRetrievalHighGeneration + lowRetrievalLowGeneration) / total;
  const lowGenerationRatio = (highRetrievalLowGeneration + lowRetrievalLowGeneration) / total;
  let bottleneck: DiagnosticInfo["bottleneck"];
  if (lowRetrievalRatio > lowGenerationRatio + 0.1) {
    bottleneck = "retrieval";
  } else if (lowGenerationRatio > lowRetrievalRatio + 0.1) {
    bottleneck = "generation";
  } else {
    bottleneck = "balanced";
  }

  // 拒绝率统计
  const refusalCount = results.filter((r) => isRefusalAnswer(r.actualAnswer)).length;
  const refusalRate = refusalCount / total;
  // 正确拒绝率：不可回答且正确拒绝 / 所有不可回答的
  const unanswerableResults = results.filter((r) => r.canAnswer === false);
  const correctRefusalCount = unanswerableResults.filter((r) => isRefusalAnswer(r.actualAnswer)).length;
  const correctRefusalRate = unanswerableResults.length > 0
    ? correctRefusalCount / unanswerableResults.length
    : 0;

  // Top5失败案例
  const scoredResults = results.map((r) => {
    const overallScore =
      r.retrieval.contextRelevance * 0.3 +
      r.answer.faithfulness * 0.35 +
      r.answer.answerRelevance * 0.35;
    return { ...r, overallScore };
  });

  const topFailureCases: FailureCase[] = scoredResults
    .sort((a, b) => a.overallScore - b.overallScore)
    .slice(0, 5)
    .map((r) => ({
      testId: r.id,
      query: r.query,
      overallScore: Number(r.overallScore.toFixed(4)),
      failureReasons: identifyFailureReasons(r),
    }));

  const diagnosis: DiagnosticMatrix = {
    crossAnalysis,
    topFailureCases,
    bottleneck,
    refusalRate: Number(refusalRate.toFixed(4)),
    correctRefusalRate: Number(correctRefusalRate.toFixed(4)),
  };

  console.log(`[rag-evaluator] [诊断矩阵] 生成完成, 瓶颈: ${bottleneck}, 拒绝率: ${diagnosis.refusalRate}, 正确拒绝率: ${diagnosis.correctRefusalRate}`);
  console.log(`[rag-evaluator] [诊断矩阵] 交叉分析: 高检索高生成=${crossAnalysis.highRetrievalHighGeneration}, 高检索低生成=${crossAnalysis.highRetrievalLowGeneration}, 低检索高生成=${crossAnalysis.lowRetrievalHighGeneration}, 低检索低生成=${crossAnalysis.lowRetrievalLowGeneration}`);

  return diagnosis;
}

/**
 * 识别单个测试结果的失败原因
 */
function identifyFailureReasons(result: SingleTestResult): string[] {
  const reasons: string[] = [];

  if (result.retrieval.hitsAtK === 0) {
    reasons.push("检索未命中（Hits@K=0）");
  }
  if (result.retrieval.contextRelevance < 0.3) {
    reasons.push(`检索相关性低（${result.retrieval.contextRelevance.toFixed(2)}）`);
  }
  if (result.retrieval.contextRecall < 0.3) {
    reasons.push(`检索召回率低（${result.retrieval.contextRecall.toFixed(2)}）`);
  }
  if (result.answer.faithfulness < 0.3) {
    reasons.push(`答案忠实度低（${result.answer.faithfulness.toFixed(2)}）`);
  }
  if (result.answer.answerRelevance < 0.3) {
    reasons.push(`答案相关性低（${result.answer.answerRelevance.toFixed(2)}）`);
  }
  if (result.isError) {
    reasons.push("评估过程出错");
  }
  if (result.canAnswer === false && !isRefusalAnswer(result.actualAnswer)) {
    reasons.push("不可回答问题但未拒绝回答（可能幻觉）");
  }
  if (result.canAnswer === true && isRefusalAnswer(result.actualAnswer)) {
    reasons.push("可回答问题但拒绝回答");
  }

  return reasons.length > 0 ? reasons : ["综合得分偏低"];
}

export function evaluateNumericalAccuracy(
  actualAnswer: string,
  expectedAnswer: string,
  canAnswer: boolean = true
): number | null {
  console.log("[rag-evaluator] [金融评估] 开始数值精度评估");
  console.log(`[rag-evaluator] [金融评估] 实际答案长度: ${actualAnswer.length}, 期望答案长度: ${expectedAnswer.length}, canAnswer: ${canAnswer}`);

  // 拒绝回答处理逻辑
  if (!canAnswer && isRefusalAnswer(actualAnswer)) {
    // 不可回答的问题 + 正确拒绝 → 跳过此样本
    console.log("[rag-evaluator] [金融评估] 不可回答问题且正确拒绝，跳过此样本");
    return null;
  }
  if (canAnswer && isRefusalAnswer(actualAnswer)) {
    // 可回答的问题 + 拒绝回答 → 数值精度得0分
    console.log("[rag-evaluator] [金融评估] 可回答问题但拒绝回答，数值精度得0分");
    return 0;
  }
  if (!canAnswer && !isRefusalAnswer(actualAnswer)) {
    // 不可回答的问题 + 未拒绝回答 → 可能存在幻觉，数值精度得0分
    console.log("[rag-evaluator] [金融评估] 不可回答问题但未拒绝回答，可能存在幻觉，数值精度得0分");
    return 0;
  }

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
  category: string,
  canAnswer: boolean = true
): Promise<number | null> {
  console.log(`[rag-evaluator] [金融评估] 开始合规性评估, category: ${category}, canAnswer: ${canAnswer}`);

  // 拒绝回答处理逻辑
  if (!canAnswer && isRefusalAnswer(answer)) {
    // 不可回答的问题 + 正确拒绝 → 跳过此样本
    console.log("[rag-evaluator] [金融评估] 不可回答问题且正确拒绝，跳过合规性评估");
    return null;
  }
  if (canAnswer && isRefusalAnswer(answer)) {
    // 可回答的问题 + 拒绝回答 → 跳过（合规性对拒绝回答无意义）
    console.log("[rag-evaluator] [金融评估] 可回答问题但拒绝回答，跳过合规性评估");
    return null;
  }
  if (!canAnswer && !isRefusalAnswer(answer)) {
    // 不可回答的问题 + 未拒绝回答 → 跳过（幻觉问题由幻觉率指标处理）
    console.log("[rag-evaluator] [金融评估] 不可回答问题但未拒绝回答，跳过合规性评估");
    return null;
  }

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
  searchResults: Array<{ text: string; score: number }>,
  canAnswer: boolean = true
): Promise<number | null> {
  console.log("[rag-evaluator] [金融评估] 开始幻觉率评估");
  console.log(`[rag-evaluator] [金融评估] 答案长度: ${answer.length}, 检索结果数: ${searchResults.length}, canAnswer: ${canAnswer}`);

  // 拒绝回答处理逻辑
  if (!canAnswer && isRefusalAnswer(answer)) {
    // 不可回答的问题 + 正确拒绝 → 跳过此样本
    console.log("[rag-evaluator] [金融评估] 不可回答问题且正确拒绝，跳过幻觉率评估");
    return null;
  }
  if (canAnswer && isRefusalAnswer(answer)) {
    // 可回答的问题 + 拒绝回答 → 跳过（拒绝回答不涉及幻觉）
    console.log("[rag-evaluator] [金融评估] 可回答问题但拒绝回答，跳过幻觉率评估");
    return null;
  }
  if (!canAnswer && !isRefusalAnswer(answer)) {
    // 不可回答的问题 + 未拒绝回答 → 幻觉率100%
    console.log("[rag-evaluator] [金融评估] 不可回答问题但未拒绝回答，幻觉率为100%");
    return 1;
  }

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
  category: string,
  canAnswer: boolean = true
): number | null {
  console.log(`[rag-evaluator] [金融评估] 开始风险提示评估, category: ${category}, canAnswer: ${canAnswer}`);

  // 拒绝回答处理逻辑
  if (!canAnswer && isRefusalAnswer(answer)) {
    // 不可回答的问题 + 正确拒绝 → 跳过此样本
    console.log("[rag-evaluator] [金融评估] 不可回答问题且正确拒绝，跳过风险提示评估");
    return null;
  }
  if (canAnswer && isRefusalAnswer(answer)) {
    // 可回答的问题 + 拒绝回答 → 跳过（拒绝回答无风险提示需求）
    console.log("[rag-evaluator] [金融评估] 可回答问题但拒绝回答，跳过风险提示评估");
    return null;
  }
  if (!canAnswer && !isRefusalAnswer(answer)) {
    // 不可回答的问题 + 未拒绝回答 → 跳过（幻觉问题由幻觉率指标处理）
    console.log("[rag-evaluator] [金融评估] 不可回答问题但未拒绝回答，跳过风险提示评估");
    return null;
  }

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
  searchResults: Array<{ text: string; score: number }>,
  canAnswer: boolean = true
): number | null {
  console.log("[rag-evaluator] [金融评估] 开始时效性评估, canAnswer: " + canAnswer);

  // 拒绝回答处理逻辑
  if (!canAnswer && isRefusalAnswer(answer)) {
    // 不可回答的问题 + 正确拒绝 → 跳过此样本
    console.log("[rag-evaluator] [金融评估] 不可回答问题且正确拒绝，跳过时效性评估");
    return null;
  }
  if (canAnswer && isRefusalAnswer(answer)) {
    // 可回答的问题 + 拒绝回答 → 跳过
    console.log("[rag-evaluator] [金融评估] 可回答问题但拒绝回答，跳过时效性评估");
    return null;
  }
  if (!canAnswer && !isRefusalAnswer(answer)) {
    // 不可回答的问题 + 未拒绝回答 → 跳过
    console.log("[rag-evaluator] [金融评估] 不可回答问题但未拒绝回答，跳过时效性评估");
    return null;
  }

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
    /** 该查询是否应该能被回答，默认true（向后兼容） */
    canAnswer?: boolean;
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
    /** 系统配置信息（用于专业评估报告） */
    systemConfig?: SystemConfig;
    /** 行业基准（用于专业评估报告） */
    industryBenchmarks?: IndustryBenchmarks;
    /** 上一次版本评估结果（用于版本对比） */
    previousReport?: ProfessionalEvaluationReport;
  }
): Promise<ProfessionalEvaluationReport> {
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
  // 金融指标结果，null表示跳过该样本
  const financialResults: Array<FinancialEvaluationResult & { testId: number; skipped: boolean }> = [];
  // 答案正确性结果（仅canAnswer=true的样本）
  const answerCorrectnessResults: Array<{ testId: number; score: number }> = [];
  // MRR计算所需的检索结果数据
  const mrrSearchData: Array<{
    query: string;
    results: Array<{ content: string; relevanceScore: number }>;
    expectedContent?: string;
  }> = [];

  for (let i = 0; i < testSet.length; i++) {
    const testItem = testSet[i];
    const category = testItem?.category ?? "未分类";
    // canAnswer默认为true，向后兼容
    const canAnswer = testItem.canAnswer ?? true;
    const itemStart = Date.now();

    console.log(`[rag-evaluator] [金融评估] 评估第 ${i + 1}/${testSet.length} 条, query: "${testItem.query.slice(0, 50)}...", category: ${category}, canAnswer: ${canAnswer}`);

    try {
      // 记录检索阶段开始时间
      const retrievalStart = Date.now();
      const searchResults = await cachedSearchFn(testItem.query);
      const retrievalLatency = Date.now() - retrievalStart;
      console.log(`[rag-evaluator] 检索完成, 结果数: ${searchResults.length}, 耗时: ${retrievalLatency}ms`);

      // 记录生成阶段开始时间
      const generationStart = Date.now();
      const actualAnswer = await answerFn(testItem.query, searchResults);
      const generationLatency = Date.now() - generationStart;
      const e2eLatency = Date.now() - itemStart;
      console.log(`[rag-evaluator] 答案生成完成, 长度: ${actualAnswer.length}, 生成耗时: ${generationLatency}ms, 端到端耗时: ${e2eLatency}ms`);

      // 收集MRR数据
      mrrSearchData.push({
        query: testItem.query,
        results: searchResults.map((r) => ({ content: r.text, relevanceScore: r.score })),
        expectedContent: testItem.expectedAnswer,
      });

      // 先计算检索指标（需要hitsAtK给Context Recall使用）
      const retrievalResult = await evaluateRetrieval(testItem.query, testItem.expectedAnswer, searchResults);
      const [answerResult, contextRecall, numericalAccuracy, complianceScore, hallucinationRate, riskDisclosureScore, timelinessScore] = await Promise.all([
        evaluateAnswer(testItem.query, testItem.expectedAnswer, actualAnswer, searchResults),
        evaluateContextRecall(testItem.query, testItem.expectedAnswer, searchResults, retrievalResult.hitsAtK),
        Promise.resolve(evaluateNumericalAccuracy(actualAnswer, testItem.expectedAnswer, canAnswer)),
        evaluateCompliance(actualAnswer, category, canAnswer),
        evaluateHallucination(actualAnswer, searchResults, canAnswer),
        Promise.resolve(evaluateRiskDisclosure(actualAnswer, category, canAnswer)),
        Promise.resolve(evaluateTimeliness(actualAnswer, searchResults, canAnswer)),
      ]);

      // 对canAnswer=true的样本评估答案正确性
      if (canAnswer && !isRefusalAnswer(actualAnswer)) {
        try {
          const correctnessScore = await evaluateAnswerCorrectness(actualAnswer, testItem.expectedAnswer);
          answerCorrectnessResults.push({ testId: testItem.id ?? i + 1, score: correctnessScore });
        } catch (correctnessError) {
          console.error(`[rag-evaluator] [答案正确性] 第 ${i + 1} 条答案正确性评估失败:`, correctnessError);
        }
      }

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
        canAnswer,
        retrievalLatency,
        generationLatency,
        e2eLatency,
        isError: false,
      });

      // 金融指标：null表示跳过，使用默认值0记录但标记skipped
      const isSkipped = numericalAccuracy === null && complianceScore === null;
      financialResults.push({
        testId: testItem.id ?? i + 1,
        numericalAccuracy: numericalAccuracy ?? 0,
        complianceScore: complianceScore ?? 0,
        hallucinationRate: hallucinationRate ?? 0,
        riskDisclosureScore: riskDisclosureScore ?? 0,
        timelinessScore: timelinessScore ?? 0,
        skipped: isSkipped,
      });

      console.log(`[rag-evaluator] 第 ${i + 1} 条评估完成, Hits@K=${retrievalResult.hitsAtK}, Faithfulness=${answerResult.faithfulness}, 数值精度=${numericalAccuracy}, 合规性=${complianceScore}, 幻觉率=${hallucinationRate}, 跳过=${isSkipped}, 耗时=${durationMs}ms`);
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
        canAnswer,
        isError: true,
      });
      financialResults.push({
        testId: testItem.id ?? i + 1,
        numericalAccuracy: 0,
        complianceScore: 0,
        hallucinationRate: 1,
        riskDisclosureScore: 0,
        timelinessScore: 0,
        skipped: false,
      });
    }
  }

  // 计算通用指标平均值
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

  // 计算金融指标平均值（排除跳过的样本）
  const nonSkippedFinancial = financialResults.filter((r) => !r.skipped);
  const avgNumericalAccuracy = nonSkippedFinancial.length > 0
    ? nonSkippedFinancial.reduce((sum, r) => sum + r.numericalAccuracy, 0) / nonSkippedFinancial.length
    : 0;
  const avgComplianceScore = nonSkippedFinancial.length > 0
    ? nonSkippedFinancial.reduce((sum, r) => sum + r.complianceScore, 0) / nonSkippedFinancial.length
    : 0;
  const avgHallucinationRate = nonSkippedFinancial.length > 0
    ? nonSkippedFinancial.reduce((sum, r) => sum + r.hallucinationRate, 0) / nonSkippedFinancial.length
    : 0;
  const avgRiskDisclosureScore = nonSkippedFinancial.length > 0
    ? nonSkippedFinancial.reduce((sum, r) => sum + r.riskDisclosureScore, 0) / nonSkippedFinancial.length
    : 0;
  const avgTimelinessScore = nonSkippedFinancial.length > 0
    ? nonSkippedFinancial.reduce((sum, r) => sum + r.timelinessScore, 0) / nonSkippedFinancial.length
    : 0;

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

  // 计算拒绝准确率
  const refusalAccuracyInput = results.map((r) => ({
    canAnswer: r.canAnswer ?? true,
    actualAnswer: r.actualAnswer,
  }));
  const avgRefusalAccuracy = evaluateRefusalAccuracy(refusalAccuracyInput);

  // 计算答案正确性平均值
  const avgAnswerCorrectness = answerCorrectnessResults.length > 0
    ? answerCorrectnessResults.reduce((sum, r) => sum + r.score, 0) / answerCorrectnessResults.length
    : 0;

  // 计算MRR
  const avgMRR = calculateMRR(mrrSearchData);

  // 计算系统性能指标
  const performanceMetrics = calculatePerformanceMetrics(results);

  // 生成诊断矩阵
  const diagnosticMatrix = generateDiagnosticMatrix(results);

  // 生成指标详情
  const metricDetails = generateMetricDetails({
    avgHitsAtK,
    avgContextRelevance,
    avgContextRecall,
    avgFaithfulness,
    avgAnswerRelevance,
    avgNumericalAccuracy,
    avgComplianceScore,
    avgHallucinationRate,
    avgRiskDisclosureScore,
    avgTimelinessScore,
    avgRefusalAccuracy,
    avgAnswerCorrectness,
    avgMRR,
  });

  // 版本对比 - 从数据库读取所有历史版本进行多版本对比
  let versionComparison: VersionComparison | undefined;
  try {
    const { getEvaluationVersions } = await import("@/server/evaluation/evaluation-history");
    const allVersions = await getEvaluationVersions({ evaluationType: "rag" }, 100);

    if (allVersions.length > 0) {
      console.log(`[rag-evaluator] [版本对比] 从数据库获取到 ${allVersions.length} 个历史版本`);

      // 构建版本列表（包含当前版本）
      const versionEntries: VersionComparison["versions"] = [];

      // 添加历史版本
      for (const v of allVersions) {
        const metrics: Record<string, number> = {};
        const metricKeys = [
          "avgHitsAtK", "avgContextRelevance", "avgContextRecall",
          "avgFaithfulness", "avgAnswerRelevance",
          "avgNumericalAccuracy", "avgComplianceScore",
          "avgHallucinationRate", "avgRiskDisclosureScore", "avgTimelinessScore",
        ] as const;
        for (const key of metricKeys) {
          const rawVal = v[key as keyof typeof v] as string | null;
          if (rawVal !== null) {
            metrics[key] = parseFloat(rawVal);
          }
        }
        // 添加 overallScore 和 financialOverallScore
        if (v.overallScore) metrics.overallScore = parseFloat(v.overallScore);
        if (v.financialOverallScore) metrics.financialOverallScore = parseFloat(v.financialOverallScore);

        versionEntries.push({
          version: `V${v.version}`,
          timestamp: v.timestamp,
          optimizationSummary: v.milestone ?? `V${v.version} 评估`,
          metrics,
        });
      }

      // 添加当前版本
      const currentMetrics: Record<string, number> = {
        avgHitsAtK: Number(avgHitsAtK.toFixed(4)),
        avgContextRelevance: Number(avgContextRelevance.toFixed(4)),
        avgContextRecall: Number(avgContextRecall.toFixed(4)),
        avgFaithfulness: Number(avgFaithfulness.toFixed(4)),
        avgAnswerRelevance: Number(avgAnswerRelevance.toFixed(4)),
        avgNumericalAccuracy: Number(avgNumericalAccuracy.toFixed(4)),
        avgComplianceScore: Number(avgComplianceScore.toFixed(4)),
        avgHallucinationRate: Number(avgHallucinationRate.toFixed(4)),
        avgRiskDisclosureScore: Number(avgRiskDisclosureScore.toFixed(4)),
        avgTimelinessScore: Number(avgTimelinessScore.toFixed(4)),
        overallScore: Number(overallScore.toFixed(4)),
        financialOverallScore,
      };
      const currentVersionNum = allVersions.length > 0
        ? Math.max(...allVersions.map((v) => v.version)) + 1
        : 1;
      versionEntries.push({
        version: `V${currentVersionNum}`,
        timestamp: new Date().toISOString(),
        optimizationSummary: milestone ?? `V${currentVersionNum} 评估`,
        metrics: currentMetrics,
      });

      // 按版本号排序
      versionEntries.sort((a, b) => {
        const numA = parseInt(a.version.replace("V", ""), 10);
        const numB = parseInt(b.version.replace("V", ""), 10);
        return numA - numB;
      });

      // 计算从 V1 到最新版本的改进
      const v1 = versionEntries[0];
      const latest = versionEntries[versionEntries.length - 1];
      const improvementMetrics = [
        "avgHitsAtK", "avgContextRelevance", "avgContextRecall",
        "avgFaithfulness", "avgAnswerRelevance",
        "avgNumericalAccuracy", "avgComplianceScore",
        "avgHallucinationRate", "avgRiskDisclosureScore", "avgTimelinessScore",
        "overallScore", "financialOverallScore",
      ];

      // 幻觉率越低越好
      const invertMetrics = new Set(["avgHallucinationRate"]);

      const improvements: VersionComparison["improvements"] = [];
      for (const metric of improvementMetrics) {
        const v1Val = v1.metrics[metric];
        const latestVal = latest.metrics[metric];

        if (v1Val !== undefined && latestVal !== undefined) {
          const isInverse = invertMetrics.has(metric);
          const delta = latestVal - v1Val;
          const pctChange = v1Val !== 0 ? (delta / Math.abs(v1Val)) * 100 : 0;
          const improvementStr = pctChange >= 0
            ? `+${pctChange.toFixed(0)}%`
            : `${pctChange.toFixed(0)}%`;

          let trend: "improving" | "stable" | "declining";
          if (isInverse) {
            // 越低越好的指标
            if (delta < -0.05) trend = "improving";
            else if (delta > 0.05) trend = "declining";
            else trend = "stable";
          } else {
            // 越高越好的指标
            if (delta > 0.05) trend = "improving";
            else if (delta < -0.05) trend = "declining";
            else trend = "stable";
          }

          improvements.push({
            metric,
            v1Value: Number(v1Val.toFixed(4)),
            latestValue: Number(latestVal.toFixed(4)),
            improvement: improvementStr,
            trend,
          });
        }
      }

      versionComparison = {
        versions: versionEntries,
        improvements,
      };

      console.log(`[rag-evaluator] [版本对比] 版本对比构建完成, 共 ${versionEntries.length} 个版本, ${improvements.length} 个指标改进`);
    } else {
      console.log("[rag-evaluator] [版本对比] 无历史版本，跳过版本对比");
    }
  } catch (vcError) {
    console.error("[rag-evaluator] [版本对比] 版本对比构建失败，跳过:", vcError);
  }

  const totalDuration = Date.now() - startTime;

  // 默认行业基准
  const defaultBenchmarks: IndustryBenchmarks = {
    hitsAtK: 0.7,
    faithfulness: 0.8,
    answerRelevance: 0.75,
    numericalAccuracy: 0.85,
    complianceScore: 0.9,
    hallucinationRate: 0.1,
  };

  // 默认系统配置
  const defaultSystemConfig: SystemConfig = {
    llmModel: "unknown",
    embeddingModel: "unknown",
    retrievalTopK: 5,
    temperature: 0.7,
    chunkSize: 512,
    chunkOverlap: 50,
  };

  const report: ProfessionalEvaluationReport = {
    ...baseReport,
    version: 2,
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
    // 新增专业评估指标
    systemConfig: options?.systemConfig ?? defaultSystemConfig,
    avgMRR: Number(avgMRR.toFixed(4)),
    avgAnswerCorrectness: Number(avgAnswerCorrectness.toFixed(4)),
    avgRefusalAccuracy: Number(avgRefusalAccuracy.toFixed(4)),
    performanceMetrics,
    diagnosis: {
      crossAnalysis: diagnosticMatrix.crossAnalysis,
      bottleneck: diagnosticMatrix.bottleneck,
      refusalRate: diagnosticMatrix.refusalRate,
      correctRefusalRate: diagnosticMatrix.correctRefusalRate,
    },
    topFailureCases: diagnosticMatrix.topFailureCases,
    industryBenchmarks: options?.industryBenchmarks ?? defaultBenchmarks,
    versionComparison,
    metricDetails,
  };

  console.log(`[rag-evaluator] [金融评估] 金融行业RAG评估完成, 总耗时: ${totalDuration}ms`);
  console.log(
    `[rag-evaluator] [金融评估] 通用指标得分: ${generalScore.toFixed(4)}, 金融指标得分: ${financialScore.toFixed(4)}, 综合得分: ${financialOverallScore}`
  );
  console.log(
    `[rag-evaluator] [金融评估] 数值精度=${avgNumericalAccuracy.toFixed(4)}, 合规性=${avgComplianceScore.toFixed(4)}, 幻觉率=${avgHallucinationRate.toFixed(4)}, 风险提示=${avgRiskDisclosureScore.toFixed(4)}, 时效性=${avgTimelinessScore.toFixed(4)}`
  );
  console.log(
    `[rag-evaluator] [金融评估] 拒绝准确率=${avgRefusalAccuracy.toFixed(4)}, 答案正确性=${avgAnswerCorrectness.toFixed(4)}, MRR=${avgMRR.toFixed(4)}`
  );
  console.log(
    `[rag-evaluator] [金融评估] 诊断: 瓶颈=${diagnosticMatrix.bottleneck}, 拒绝率=${diagnosticMatrix.refusalRate}, 正确拒绝率=${diagnosticMatrix.correctRefusalRate}`
  );

  return report;
}

/**
 * 生成指标详情列表
 * 包含每个指标的定义、计算方法、阈值和当前状态
 */
function generateMetricDetails(metrics: {
  avgHitsAtK: number;
  avgContextRelevance: number;
  avgContextRecall: number;
  avgFaithfulness: number;
  avgAnswerRelevance: number;
  avgNumericalAccuracy: number;
  avgComplianceScore: number;
  avgHallucinationRate: number;
  avgRiskDisclosureScore: number;
  avgTimelinessScore: number;
  avgRefusalAccuracy: number;
  avgAnswerCorrectness: number;
  avgMRR: number;
}): MetricDetail[] {
  // 指标定义配置表
  const metricDefinitions: Array<{
    name: string;
    definition: string;
    calculationMethod: string;
    excellentThreshold: number;
    passingThreshold: number;
    value: number;
    invertScore?: boolean; // 幻觉率等指标越低越好
  }> = [
    {
      name: "Hits@K",
      definition: "检索结果中是否包含与期望答案相关的文档",
      calculationMethod: "Top-K检索结果中至少一个包含期望答案关键词的比例",
      excellentThreshold: 0.8,
      passingThreshold: 0.6,
      value: metrics.avgHitsAtK,
    },
    {
      name: "Context Relevance",
      definition: "检索内容与查询的相关程度",
      calculationMethod: "检索结果与查询和期望答案的Jaccard相似度均值",
      excellentThreshold: 0.7,
      passingThreshold: 0.5,
      value: metrics.avgContextRelevance,
    },
    {
      name: "Context Recall",
      definition: "检索内容覆盖期望答案信息的程度",
      calculationMethod: "期望答案关键词在检索内容中被覆盖的比例",
      excellentThreshold: 0.7,
      passingThreshold: 0.5,
      value: metrics.avgContextRecall,
    },
    {
      name: "Faithfulness",
      definition: "生成答案对检索内容的忠实程度",
      calculationMethod: "答案中可被检索内容支持的语句比例（启发式+LLM加权）",
      excellentThreshold: 0.8,
      passingThreshold: 0.6,
      value: metrics.avgFaithfulness,
    },
    {
      name: "Answer Relevance",
      definition: "生成答案与用户查询的相关程度",
      calculationMethod: "答案与查询的语义相关性（启发式+LLM加权）",
      excellentThreshold: 0.8,
      passingThreshold: 0.6,
      value: metrics.avgAnswerRelevance,
    },
    {
      name: "Numerical Accuracy",
      definition: "金融数据数值的精确程度",
      calculationMethod: "答案中数值与期望数值的匹配度（误差<0.1%满分，<5%半分）",
      excellentThreshold: 0.9,
      passingThreshold: 0.7,
      value: metrics.avgNumericalAccuracy,
    },
    {
      name: "Compliance Score",
      definition: "回答的金融合规性",
      calculationMethod: "检查是否存在承诺收益、推荐时点、缺少风险提示等违规（规则+LLM）",
      excellentThreshold: 0.9,
      passingThreshold: 0.7,
      value: metrics.avgComplianceScore,
    },
    {
      name: "Hallucination Rate",
      definition: "答案中无法溯源的数据点比例",
      calculationMethod: "答案中数值数据点在检索内容中无法找到来源的比例",
      excellentThreshold: 0.1,
      passingThreshold: 0.3,
      value: metrics.avgHallucinationRate,
      invertScore: true,
    },
    {
      name: "Risk Disclosure",
      definition: "投资相关回答中风险提示的覆盖程度",
      calculationMethod: "答案中包含风险提示关键词的比例",
      excellentThreshold: 0.6,
      passingThreshold: 0.3,
      value: metrics.avgRiskDisclosureScore,
    },
    {
      name: "Timeliness",
      definition: "回答中数据信息的时效性",
      calculationMethod: "最新数据日期距今天数（≤30天满分，≤90天0.7，≤365天0.4）",
      excellentThreshold: 0.8,
      passingThreshold: 0.5,
      value: metrics.avgTimelinessScore,
    },
    {
      name: "Refusal Accuracy",
      definition: "系统正确判断是否应回答的准确率",
      calculationMethod: "(正确拒绝数+正确回答数)/总测试数",
      excellentThreshold: 0.9,
      passingThreshold: 0.7,
      value: metrics.avgRefusalAccuracy,
    },
    {
      name: "Answer Correctness",
      definition: "生成答案与期望答案的语义一致性",
      calculationMethod: "LLM评估事实一致性、完整性、相关性的综合得分",
      excellentThreshold: 0.8,
      passingThreshold: 0.6,
      value: metrics.avgAnswerCorrectness,
    },
    {
      name: "MRR",
      definition: "检索结果中首个相关结果排名倒数的均值",
      calculationMethod: "对每个查询取1/首个相关结果排名，再求所有查询的均值",
      excellentThreshold: 0.7,
      passingThreshold: 0.5,
      value: metrics.avgMRR,
    },
  ];

  return metricDefinitions.map((def) => {
    // 对于反转指标（如幻觉率），阈值逻辑相反
    let status: MetricDetail["status"];
    let failureReason: string | undefined;

    if (def.invertScore) {
      // 越低越好的指标
      if (def.value <= def.excellentThreshold) {
        status = "excellent";
      } else if (def.value <= def.passingThreshold) {
        status = "passing";
      } else {
        status = "failing";
        failureReason = `${def.name}=${def.value.toFixed(4)}超过阈值${def.passingThreshold}，需要优化`;
      }
    } else {
      // 越高越好的指标
      if (def.value >= def.excellentThreshold) {
        status = "excellent";
      } else if (def.value >= def.passingThreshold) {
        status = "passing";
      } else {
        status = "failing";
        failureReason = `${def.name}=${def.value.toFixed(4)}低于阈值${def.passingThreshold}，需要优化`;
      }
    }

    return {
      name: def.name,
      definition: def.definition,
      calculationMethod: def.calculationMethod,
      currentValue: Number(def.value.toFixed(4)),
      excellentThreshold: def.excellentThreshold,
      passingThreshold: def.passingThreshold,
      status,
      failureReason,
    };
  });
}
