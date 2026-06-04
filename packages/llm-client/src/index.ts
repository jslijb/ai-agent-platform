import type {
  LLMChatRequest,
  LLMChatResponse,
  LLMUsageResponse,
} from '@ai-agent/shared-types';
import { ServiceError } from '@ai-agent/shared-utils';

export interface LLMClientConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
}

export class LLMClient {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: LLMClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 60000;
    this.maxRetries = config.maxRetries ?? 1;
  }

  private async request<T>(path: string, body: unknown, traceId?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errorText = await response.text();
          if (response.status >= 500 && attempt < this.maxRetries) {
            lastError = new Error(`服务端错误 ${response.status}: ${errorText}`);
            continue;
          }
          throw new ServiceError({
            message: `LLM Gateway请求失败: ${response.status} ${errorText}`,
            statusCode: response.status,
            code: 'LLM_GATEWAY_ERROR',
            retryable: response.status >= 500,
            traceId,
            cause: lastError,
          });
        }

        return await response.json() as T;
      } catch (err) {
        if (err instanceof ServiceError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          continue;
        }
      }
    }

    throw ServiceError.serviceUnavailable('LLM Gateway', traceId);
  }

  async chat(messages: LLMChatRequest['messages'], options?: LLMChatRequest['options'], traceId?: string): Promise<LLMChatResponse> {
    try {
      return await this.request<LLMChatResponse>('/api/llm/chat', { messages, options }, traceId);
    } catch (err) {
      if (err instanceof ServiceError && err.retryable) {
        return { content: null, model: '', error: err.message };
      }
      throw err;
    }
  }

  async usage(traceId?: string): Promise<LLMUsageResponse> {
    const headers: Record<string, string> = {};
    if (traceId) headers['x-trace-id'] = traceId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${this.baseUrl}/api/llm/usage`, { headers, signal: controller.signal });
      clearTimeout(timer);
      return await response.json() as LLMUsageResponse;
    } catch {
      clearTimeout(timer);
      return { totalTokens: 0, byModel: {}, byDate: {} };
    }
  }

  async stream(messages: LLMChatRequest['messages'], options?: LLMChatRequest['options'], traceId?: string): Promise<ReadableStream<Uint8Array> | null> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (traceId) {
      headers['x-trace-id'] = traceId;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/llm/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, options }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        return null;
      }

      return response.body;
    } catch {
      return null;
    }
  }

  async health(): Promise<{ status: string; uptime: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      return await response.json() as { status: string; uptime: number };
    } catch {
      clearTimeout(timer);
      return { status: 'error', uptime: 0 };
    }
  }
}
