import { db, sql } from "@/server/db/client";
import { evaluationPool } from "@/server/db/schema";
import { eq, count, isNotNull, desc } from "drizzle-orm";
import { callWithFallback } from "@/server/llm/router";

export interface RecordQueryData {
  query: string;
  answer?: string;
  context?: string;
  toolsUsed?: string;
  source: "chat" | "agent";
  conversationId?: string;
  model?: string;
  iterations?: number;
  latencyMs?: number;
  tokenUsage?: number;
}

export interface PoolStats {
  total: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  withFeedback: number;
  withoutFeedback: number;
}

export interface EvaluationSetItem {
  id: number;
  query: string;
  expectedAnswer: string;
  category: string;
  difficulty: string;
  source: string;
  userFeedback: string | null;
  autoLabeled: boolean;
}

function tokenize(text: string): string[] {
  return text
    .replace(/[，。、；：！？（）""''【】《》\s,.:;!?(){}[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 0;

  const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));
  const union = new Set(Array.from(setA).concat(Array.from(setB)));

  return union.size === 0 ? 0 : intersection.size / union.size;
}

export async function recordQueryToPool(data: RecordQueryData): Promise<number> {
  console.log(`[历史查询采集] 开始记录查询到评估数据池, query: "${data.query.slice(0, 50)}...", source: ${data.source}`);

  try {
    const insertData: typeof evaluationPool.$inferInsert = {
      query: data.query,
      answer: data.answer ?? null,
      context: data.context ?? null,
      toolsUsed: data.toolsUsed ?? null,
      source: data.source,
      conversationId: data.conversationId ?? null,
      model: data.model ?? null,
      iterations: data.iterations ?? null,
      latencyMs: data.latencyMs ?? null,
      tokenUsage: data.tokenUsage ?? null,
    };

    const [result] = await db.insert(evaluationPool).values(insertData).returning({ id: evaluationPool.id });

    console.log(`[历史查询采集] 查询记录成功, id: ${result.id}, source: ${data.source}`);
    return result.id;
  } catch (error) {
    console.error("[历史查询采集] 记录查询到评估数据池失败:", error);
    throw error;
  }
}

export async function updateQueryFeedback(
  id: number,
  feedback: "correct" | "partial" | "wrong"
): Promise<void> {
  console.log(`[历史查询采集] 开始更新用户反馈, id: ${id}, feedback: ${feedback}`);

  try {
    const result = await db
      .update(evaluationPool)
      .set({ userFeedback: feedback })
      .where(eq(evaluationPool.id, id))
      .returning({ id: evaluationPool.id });

    if (result.length === 0) {
      console.error(`[历史查询采集] 更新用户反馈失败, 未找到 id: ${id}`);
      throw new Error(`未找到 id 为 ${id} 的评估池记录`);
    }

    console.log(`[历史查询采集] 用户反馈更新成功, id: ${id}, feedback: ${feedback}`);
  } catch (error) {
    console.error(`[历史查询采集] 更新用户反馈失败, id: ${id}:`, error);
    throw error;
  }
}

export async function getPoolStats(): Promise<PoolStats> {
  console.log("[历史查询采集] 开始获取数据池统计信息");

  try {
    const [totalResult] = await db
      .select({ count: count() })
      .from(evaluationPool);

    const total = totalResult.count;
    console.log(`[历史查询采集] 数据池总数: ${total}`);

    const sourceRows = await db
      .select({
        source: evaluationPool.source,
        count: count(),
      })
      .from(evaluationPool)
      .groupBy(evaluationPool.source);

    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[row.source] = row.count;
    }
    console.log(`[历史查询采集] 按来源统计: ${JSON.stringify(bySource)}`);

    const categoryRows = await db
      .select({
        category: evaluationPool.category,
        count: count(),
      })
      .from(evaluationPool)
      .groupBy(evaluationPool.category);

    const byCategory: Record<string, number> = {};
    for (const row of categoryRows) {
      const cat = row.category ?? "未分类";
      byCategory[cat] = row.count;
    }
    console.log(`[历史查询采集] 按分类统计: ${JSON.stringify(byCategory)}`);

    const [withFeedbackResult] = await db
      .select({ count: count() })
      .from(evaluationPool)
      .where(isNotNull(evaluationPool.userFeedback));

    const withFeedback = withFeedbackResult.count;
    const withoutFeedback = total - withFeedback;

    console.log(`[历史查询采集] 有反馈: ${withFeedback}, 无反馈: ${withoutFeedback}`);

    const stats: PoolStats = {
      total,
      bySource,
      byCategory,
      withFeedback,
      withoutFeedback,
    };

    console.log("[历史查询采集] 数据池统计信息获取完成");
    return stats;
  } catch (error) {
    console.error("[历史查询采集] 获取数据池统计信息失败:", error);
    throw error;
  }
}

async function autoLabelWithLLM(query: string, context?: string): Promise<string> {
  console.log(`[历史查询采集] 开始自动标注, query: "${query.slice(0, 50)}..."`);

  try {
    const contextBlock = context
      ? `\n\n参考上下文：\n${context}`
      : "";

    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个金融领域RAG系统评估专家。请为以下用户查询生成一个高质量的参考答案。答案应当准确、专业、包含必要的风险提示。只返回参考答案内容，不要返回其他内容。",
      },
      {
        role: "user",
        content: `用户查询：${query}${contextBlock}\n\n请生成参考答案：`,
      },
    ]);

    const expectedAnswer = (response.content ?? "").trim();
    console.log(`[历史查询采集] 自动标注完成, 生成答案长度: ${expectedAnswer.length}, 使用模型: ${response.model}`);

    return expectedAnswer;
  } catch (error) {
    console.error(`[历史查询采集] 自动标注失败, query: "${query.slice(0, 50)}...":`, error);
    throw error;
  }
}

export async function buildEvaluationSetFromPool(options?: {
  minPoolSize?: number;
  sampleSize?: number;
  autoLabel?: boolean;
}): Promise<EvaluationSetItem[]> {
  const minPoolSize = options?.minPoolSize ?? 10;
  const sampleSize = options?.sampleSize ?? 50;
  const autoLabel = options?.autoLabel ?? true;

  console.log(
    `[历史查询采集] 开始从数据池构建评估集, minPoolSize: ${minPoolSize}, sampleSize: ${sampleSize}, autoLabel: ${autoLabel}`
  );

  try {
    const stats = await getPoolStats();

    if (stats.total < minPoolSize) {
      console.warn(
        `[历史查询采集] 数据池记录数(${stats.total})不足最小要求(${minPoolSize})，无法构建评估集`
      );
      return [];
    }

    console.log("[历史查询采集] 第一步：加载数据池记录");

    const allRecords = await db
      .select()
      .from(evaluationPool)
      .orderBy(desc(evaluationPool.createdAt));

    console.log(`[历史查询采集] 加载记录数: ${allRecords.length}`);

    console.log("[历史查询采集] 第二步：Jaccard 相似度去重(阈值>0.8)");

    const uniqueRecords: typeof allRecords = [];

    for (const record of allRecords) {
      let isDuplicate = false;

      for (const existing of uniqueRecords) {
        const similarity = jaccardSimilarity(record.query, existing.query);
        if (similarity > 0.8) {
          isDuplicate = true;
          console.log(
            `[历史查询采集] 发现重复查询, 相似度: ${similarity.toFixed(4)}, 保留 id: ${existing.id}, 跳过 id: ${record.id}`
          );
          break;
        }
      }

      if (!isDuplicate) {
        uniqueRecords.push(record);
      }
    }

    console.log(
      `[历史查询采集] 去重完成, 原始: ${allRecords.length}, 去重后: ${uniqueRecords.length}, 移除: ${allRecords.length - uniqueRecords.length}`
    );

    console.log("[历史查询采集] 第三步：按 category 均匀采样，优先纳入有用户反馈的查询");

    const withFeedback = uniqueRecords.filter((r) => r.userFeedback !== null);
    const withoutFeedback = uniqueRecords.filter((r) => r.userFeedback === null);

    console.log(
      `[历史查询采集] 有反馈记录: ${withFeedback.length}, 无反馈记录: ${withoutFeedback.length}`
    );

    const categoryGroups: Record<string, typeof uniqueRecords> = {};

    for (const record of withFeedback) {
      const cat = record.category ?? "未分类";
      if (!categoryGroups[cat]) {
        categoryGroups[cat] = [];
      }
      categoryGroups[cat].push(record);
    }

    for (const record of withoutFeedback) {
      const cat = record.category ?? "未分类";
      if (!categoryGroups[cat]) {
        categoryGroups[cat] = [];
      }
      categoryGroups[cat].push(record);
    }

    const categories = Object.keys(categoryGroups);
    console.log(`[历史查询采集] 分类数: ${categories.length}, 分类列表: [${categories.join(", ")}]`);

    const perCategory = Math.ceil(sampleSize / categories.length);
    const sampledRecords: typeof uniqueRecords = [];

    for (const cat of categories) {
      const group = categoryGroups[cat];
      const take = Math.min(perCategory, group.length);
      sampledRecords.push(...group.slice(0, take));

      console.log(`[历史查询采集] 分类 "${cat}": 总数 ${group.length}, 采样 ${take}`);
    }

    const finalSampled = sampledRecords.slice(0, sampleSize);
    console.log(`[历史查询采集] 采样完成, 最终采样数: ${finalSampled.length}`);

    console.log("[历史查询采集] 第四步：自动标注(对无 expectedAnswer 的查询生成参考答案)");

    const evaluationSet: EvaluationSetItem[] = [];

    for (let i = 0; i < finalSampled.length; i++) {
      const record = finalSampled[i];
      console.log(
        `[历史查询采集] 处理第 ${i + 1}/${finalSampled.length} 条, id: ${record.id}, query: "${record.query.slice(0, 50)}..."`
      );

      let expectedAnswer = record.answer ?? "";
      let autoLabeled = false;

      if (!expectedAnswer && autoLabel) {
        try {
          console.log(`[历史查询采集] id: ${record.id} 无参考答案，开始自动标注`);
          expectedAnswer = await autoLabelWithLLM(record.query, record.context ?? undefined);
          autoLabeled = true;
          console.log(`[历史查询采集] id: ${record.id} 自动标注成功`);
        } catch (labelError) {
          console.error(`[历史查询采集] id: ${record.id} 自动标注失败，跳过该记录:`, labelError);
          continue;
        }
      } else if (!expectedAnswer && !autoLabel) {
        console.log(`[历史查询采集] id: ${record.id} 无参考答案且未启用自动标注，跳过该记录`);
        continue;
      }

      evaluationSet.push({
        id: record.id,
        query: record.query,
        expectedAnswer: autoLabeled ? `[自动标注] ${expectedAnswer}` : expectedAnswer,
        category: record.category ?? "未分类",
        difficulty: "medium",
        source: record.source,
        userFeedback: record.userFeedback,
        autoLabeled,
      });
    }

    console.log(
      `[历史查询采集] 评估集构建完成, 总数: ${evaluationSet.length}, 自动标注: ${evaluationSet.filter((e) => e.autoLabeled).length}, 人工标注: ${evaluationSet.filter((e) => !e.autoLabeled).length}`
    );

    return evaluationSet;
  } catch (error) {
    console.error("[历史查询采集] 从数据池构建评估集失败:", error);
    throw error;
  }
}
