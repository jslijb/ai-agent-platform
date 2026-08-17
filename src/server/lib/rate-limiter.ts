import { redisIncr, redisExpire, redisTtl, redisGet, isRedisConnected } from './redis';

const WINDOW_MS = 60 * 1000;
const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 20;

const fallbackCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimitFallback(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = fallbackCounts.get(identifier);

  if (!entry || now > entry.resetTime) {
    fallbackCounts.set(identifier, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetIn: WINDOW_MS };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const resetIn = entry.resetTime - now;
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.count++;
  const remaining = MAX_REQUESTS_PER_WINDOW - entry.count;
  return { allowed: true, remaining, resetIn: entry.resetTime - now };
}

export async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  if (!isRedisConnected()) {
    return checkRateLimitFallback(identifier);
  }

  const key = `ratelimit:${identifier}`;

  try {
    const count = await redisIncr(key);

    if (count === 1) {
      await redisExpire(key, WINDOW_SECONDS);
    }

    const ttl = await redisTtl(key);
    const resetIn = ttl > 0 ? ttl * 1000 : WINDOW_MS;

    if (count > MAX_REQUESTS_PER_WINDOW) {
      console.warn(`[rate-limiter] 请求被限流: ${identifier}, 剩余等待: ${resetIn}ms`);
      return { allowed: false, remaining: 0, resetIn };
    }

    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - count, resetIn };
  } catch (error) {
    console.error('[rate-limiter] Redis 操作失败，降级到内存限流:', error);
    return checkRateLimitFallback(identifier);
  }
}

export function cleanupRateLimiter(): void {
  const now = Date.now();
  Array.from(fallbackCounts.entries()).forEach(([key, entry]) => {
    if (now > entry.resetTime) {
      fallbackCounts.delete(key);
    }
  });
}

setInterval(cleanupRateLimiter, 5 * 60 * 1000);
