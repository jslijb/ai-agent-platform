import { callBailian, type BailianMessage, type BailianResponse } from "@/server/llm/providers/bailian";
import { redisGet, redisSet, isRedisConnected } from "@/server/lib/redis";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_TTL_SECONDS = 30 * 60;
const MAX_CACHE_SIZE = 500;

const memoryCache = new Map<string, { response: BailianResponse; createdAt: number }>();

function generateCacheKey(messages: BailianMessage[], model?: string, provider?: string): string {
  const providerPart = provider || "default";
  const key = messages.map((m) => `${m.role}:${m.content}`).join("|") + `|provider:${providerPart}|model:${model || "default"}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `llm:${providerPart}:${model || "default"}:${hash.toString(36)}`;
}

function cleanupMemoryCache(): void {
  const now = Date.now();
  for (const [key, entry] of Array.from(memoryCache.entries())) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      memoryCache.delete(key);
    }
  }
  if (memoryCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(memoryCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      memoryCache.delete(key);
    }
  }
}

export async function callBailianWithCache(
  messages: BailianMessage[],
  model?: string,
  temperature?: number,
  provider?: string
): Promise<BailianResponse> {
  const useTemperature = temperature ?? 0;
  if (useTemperature > 0) {
    return callBailian(messages, model, temperature);
  }

  const cacheKey = generateCacheKey(messages, model, provider);

  if (isRedisConnected()) {
    try {
      const cached = await redisGet(cacheKey);
      if (cached) {
        console.log(`[llm-cache] Redis缓存命中, key: ${cacheKey}`);
        return JSON.parse(cached) as BailianResponse;
      }
    } catch (error) {
      console.error('[llm-cache] Redis读取失败，降级到内存缓存:', error);
    }
  }

  const memCached = memoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.createdAt < CACHE_TTL_MS) {
    console.log(`[llm-cache] 内存缓存命中, key: ${cacheKey}`);
    return memCached.response;
  }

  const response = await callBailian(messages, model, temperature);

  if (isRedisConnected()) {
    try {
      await redisSet(cacheKey, JSON.stringify(response), CACHE_TTL_SECONDS);
      console.log(`[llm-cache] Redis缓存写入, key: ${cacheKey}`);
    } catch (error) {
      console.error('[llm-cache] Redis写入失败，降级到内存缓存:', error);
    }
  }

  memoryCache.set(cacheKey, { response, createdAt: Date.now() });
  cleanupMemoryCache();

  return response;
}

export function clearCache(): void {
  memoryCache.clear();
  console.log("[llm-cache] 内存缓存已清空");
}

export function getCacheStats(): { size: number; maxSize: number; backend: string } {
  return {
    size: memoryCache.size,
    maxSize: MAX_CACHE_SIZE,
    backend: isRedisConnected() ? "redis+memory" : "memory",
  };
}
