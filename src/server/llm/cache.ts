import { callBailian, type BailianMessage, type BailianResponse } from "@/server/llm/providers/bailian";

interface CacheEntry {
  response: BailianResponse;
  createdAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

function generateCacheKey(messages: BailianMessage[], model?: string): string {
  const key = messages.map((m) => `${m.role}:${m.content}`).join("|") + `|model:${model || "default"}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function cleanupCache(): void {
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
  temperature?: number
): Promise<BailianResponse> {
  const useTemperature = temperature ?? 0;
  if (useTemperature > 0) {
    return callBailian(messages, model, temperature);
  }

  const cacheKey = generateCacheKey(messages, model);
  const cached = memoryCache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    console.log(`[llm-cache] 缓存命中, key: ${cacheKey}`);
    return cached.response;
  }

  const response = await callBailian(messages, model, temperature);

  memoryCache.set(cacheKey, { response, createdAt: Date.now() });
  console.log(`[llm-cache] 缓存写入, key: ${cacheKey}, 当前缓存大小: ${memoryCache.size}`);

  cleanupCache();

  return response;
}

export function clearCache(): void {
  memoryCache.clear();
  console.log("[llm-cache] 缓存已清空");
}

export function getCacheStats(): { size: number; maxSize: number } {
  return { size: memoryCache.size, maxSize: MAX_CACHE_SIZE };
}
