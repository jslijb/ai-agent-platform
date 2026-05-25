const requestCounts = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = requestCounts.get(identifier);

  if (!entry || now > entry.resetTime) {
    requestCounts.set(identifier, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetIn: WINDOW_MS };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    const resetIn = entry.resetTime - now;
    console.warn(`[rate-limiter] 请求被限流: ${identifier}, 剩余等待: ${resetIn}ms`);
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.count++;
  const remaining = MAX_REQUESTS_PER_WINDOW - entry.count;
  return { allowed: true, remaining, resetIn: entry.resetTime - now };
}

export function cleanupRateLimiter(): void {
  const now = Date.now();
  Array.from(requestCounts.entries()).forEach(([key, entry]) => {
    if (now > entry.resetTime) {
      requestCounts.delete(key);
    }
  });
}

setInterval(cleanupRateLimiter, 5 * 60 * 1000);
