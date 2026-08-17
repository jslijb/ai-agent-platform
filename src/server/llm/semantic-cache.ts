import { db } from "@/server/db/client";
import { semanticCache } from "@/server/db/schema";
import { eq, desc, sql, and, lt } from "drizzle-orm";
import { embeddingService } from "@/server/retrieval/embedding-service";
import { redisGet, redisSet, redisDel, isRedisConnected } from "@/server/lib/redis";

const CACHE_TTL_SECONDS = 30 * 60;
const SIMILARITY_THRESHOLD = 0.95;
const MAX_RESULTS = 5;

export interface SemanticCacheResult {
  content: string | null;
  model?: string;
  provider?: string;
  hitType: "exact" | "semantic" | "miss";
}

function hashInput(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function exactMatchGet(
  promptTemplate: string,
  inputHash: string
): Promise<SemanticCacheResult | null> {
  if (isRedisConnected()) {
    try {
      const redisKey = `sc:${promptTemplate}:${inputHash}`;
      const cached = await redisGet(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        await incrementHitCount(promptTemplate, inputHash);
        console.log(`[semantic-cache] Redis精确命中, template: ${promptTemplate}`);
        return { ...parsed, hitType: "exact" as const };
      }
    } catch (error) {
      console.warn("[semantic-cache] Redis读取失败:", error);
    }
  }

  const rows = await db
    .select({
      response: semanticCache.response,
      model: semanticCache.model,
      provider: semanticCache.provider,
      expiresAt: semanticCache.expiresAt,
    })
    .from(semanticCache)
    .where(
      and(
        eq(semanticCache.promptTemplate, promptTemplate),
        eq(semanticCache.inputHash, inputHash)
      )
    )
    .limit(1);

  if (rows.length > 0) {
    const row = rows[0];
    if (row.expiresAt && row.expiresAt < new Date()) {
      await deleteEntry(promptTemplate, inputHash);
      return null;
    }

    const result: SemanticCacheResult = {
      content: row.response,
      model: row.model || undefined,
      provider: row.provider || undefined,
      hitType: "exact",
    };

    if (isRedisConnected()) {
      try {
        const redisKey = `sc:${promptTemplate}:${inputHash}`;
        await redisSet(redisKey, JSON.stringify(result), CACHE_TTL_SECONDS);
      } catch {}
    }

    await incrementHitCount(promptTemplate, inputHash);
    console.log(`[semantic-cache] DB精确命中, template: ${promptTemplate}`);
    return result;
  }

  return null;
}

async function semanticMatchGet(
  promptTemplate: string,
  inputEmbedding: number[]
): Promise<SemanticCacheResult | null> {
  const embeddingStr = `[${inputEmbedding.join(",")}]`;

  const rows = await db.execute(sql`
    SELECT response, model, provider,
           1 - (embedding <=> ${embeddingStr}::vector) AS similarity
    FROM semantic_cache
    WHERE prompt_template = ${promptTemplate}
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${MAX_RESULTS}
  `);

  for (const row of rows as any[]) {
    const similarity = Number(row.similarity);
    if (similarity >= SIMILARITY_THRESHOLD) {
      console.log(
        `[semantic-cache] 语义命中, template: ${promptTemplate}, similarity: ${similarity.toFixed(4)}`
      );
      return {
        content: row.response,
        model: row.model || undefined,
        provider: row.provider || undefined,
        hitType: "semantic",
      };
    }
  }

  return null;
}

async function incrementHitCount(
  promptTemplate: string,
  inputHash: string
): Promise<void> {
  try {
    await db
      .update(semanticCache)
      .set({ hitCount: sql`${semanticCache.hitCount} + 1` })
      .where(
        and(
          eq(semanticCache.promptTemplate, promptTemplate),
          eq(semanticCache.inputHash, inputHash)
        )
      );
  } catch {}
}

async function deleteEntry(
  promptTemplate: string,
  inputHash: string
): Promise<void> {
  await db
    .delete(semanticCache)
    .where(
      and(
        eq(semanticCache.promptTemplate, promptTemplate),
        eq(semanticCache.inputHash, inputHash)
      )
    );
}

export async function semanticCacheGet(
  promptTemplate: string,
  inputText: string
): Promise<SemanticCacheResult> {
  const inputHash = hashInput(inputText);

  try {
    const exactResult = await exactMatchGet(promptTemplate, inputHash);
    if (exactResult) return exactResult;

    const embedding = await embeddingService.embed(inputText);
    if (!embedding) {
      console.log("[semantic-cache] Embedding不可用, 跳过语义匹配");
      return { content: null, hitType: "miss" };
    }

    const semanticResult = await semanticMatchGet(promptTemplate, embedding);
    if (semanticResult) return semanticResult;

    return { content: null, hitType: "miss" };
  } catch (error) {
    console.error("[semantic-cache] 查询失败:", error);
    return { content: null, hitType: "miss" };
  }
}

export async function semanticCacheSet(
  promptTemplate: string,
  inputText: string,
  response: string,
  model?: string,
  provider?: string
): Promise<void> {
  const inputHash = hashInput(inputText);

  try {
    const embedding = await embeddingService.embed(inputText);

    const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000);

    await db
      .insert(semanticCache)
      .values({
        promptTemplate,
        inputHash,
        inputText,
        embedding: embedding || null,
        response,
        model: model || null,
        provider: provider || null,
        expiresAt,
      })
      .onConflictDoNothing();

    if (isRedisConnected()) {
      try {
        const redisKey = `sc:${promptTemplate}:${inputHash}`;
        const cacheResult: SemanticCacheResult = {
          content: response,
          model,
          provider,
          hitType: "exact",
        };
        await redisSet(redisKey, JSON.stringify(cacheResult), CACHE_TTL_SECONDS);
      } catch {}
    }

    console.log(
      `[semantic-cache] 写入缓存, template: ${promptTemplate}, hash: ${inputHash}`
    );
  } catch (error) {
    console.error("[semantic-cache] 写入失败:", error);
  }
}

export async function semanticCacheCleanup(): Promise<number> {
  const result = await db
    .delete(semanticCache)
    .where(lt(semanticCache.expiresAt, new Date()));
  return (result as any).rowCount ?? 0;
}

export async function semanticCacheStats(): Promise<{
  totalEntries: number;
  byTemplate: Record<string, { count: number; totalHits: number }>;
}> {
  const totalRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(semanticCache);

  const templateRows = await db
    .select({
      template: semanticCache.promptTemplate,
      count: sql<number>`count(*)`,
      totalHits: sql<number>`sum(${semanticCache.hitCount})`,
    })
    .from(semanticCache)
    .groupBy(semanticCache.promptTemplate);

  const byTemplate: Record<string, { count: number; totalHits: number }> = {};
  for (const row of templateRows) {
    byTemplate[row.template] = {
      count: Number(row.count),
      totalHits: Number(row.totalHits),
    };
  }

  return {
    totalEntries: Number(totalRows[0]?.count ?? 0),
    byTemplate,
  };
}