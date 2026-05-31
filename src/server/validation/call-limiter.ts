export interface CallLimiterConfig {
  maxToolCalls: number;
  validationRetryLimit: number;
  toolExecutionTimeoutMs: number;
}

const DEFAULT_CONFIG: CallLimiterConfig = {
  maxToolCalls: 15,
  validationRetryLimit: 3,
  toolExecutionTimeoutMs: 30000,
};

export class CallLimiter {
  private callCount: number = 0;
  private config: CallLimiterConfig;
  private cache: Map<string, { result: unknown; timestamp: number }> =
    new Map();

  constructor(config?: Partial<CallLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  canCall(): boolean {
    return this.callCount < this.config.maxToolCalls;
  }

  increment(): void {
    this.callCount++;
  }

  getCount(): number {
    return this.callCount;
  }

  getConfig(): CallLimiterConfig {
    return this.config;
  }

  private hashKey(
    toolName: string,
    params: Record<string, unknown>
  ): string {
    return `${toolName}:${JSON.stringify(params)}`;
  }

  getCached(
    toolName: string,
    params: Record<string, unknown>
  ): unknown | undefined {
    const key = this.hashKey(toolName, params);
    return this.cache.get(key)?.result;
  }

  setCached(
    toolName: string,
    params: Record<string, unknown>,
    result: unknown
  ): void {
    const key = this.hashKey(toolName, params);
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  async executeWithLimit(
    toolName: string,
    params: Record<string, unknown>,
    executor: () => Promise<unknown>
  ): Promise<{ result: unknown; fromCache: boolean; limitReached: boolean }> {
    if (!this.canCall()) {
      return { result: null, fromCache: false, limitReached: true };
    }

    const cached = this.getCached(toolName, params);
    if (cached !== undefined) {
      return { result: cached, fromCache: true, limitReached: false };
    }

    try {
      const result = await Promise.race([
        executor(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout")),
            this.config.toolExecutionTimeoutMs
          )
        ),
      ]);
      this.setCached(toolName, params, result);
      this.increment();
      return { result, fromCache: false, limitReached: false };
    } catch (err) {
      this.increment();
      throw err;
    }
  }

  reset(): void {
    this.callCount = 0;
    this.cache.clear();
  }
}
