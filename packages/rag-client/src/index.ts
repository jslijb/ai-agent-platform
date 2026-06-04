import type {
  RAGRetrieveRequest,
  RAGRetrieveResponse,
  RAGEmbedRequest,
  RAGEmbedResponse,
  RAGRerankRequest,
  RAGRerankResponse,
  RAGChunkRequest,
  RAGChunkResponse,
} from '@ai-agent/shared-types';
import { ServiceError } from '@ai-agent/shared-utils';

export interface RAGClientConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
}

export class RAGClient {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(config: RAGClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30000;
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
            message: `RAG服务请求失败: ${response.status} ${errorText}`,
            statusCode: response.status,
            code: 'RAG_SERVICE_ERROR',
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

    throw ServiceError.serviceUnavailable('RAG', traceId);
  }

  async search(query: string, topK?: number, traceId?: string): Promise<RAGRetrieveResponse> {
    try {
      return await this.request<RAGRetrieveResponse>('/api/retrieve', { query, topK }, traceId);
    } catch (err) {
      if (err instanceof ServiceError && err.retryable) {
        return { success: false, results: [], latencyMs: 0, error: err.message };
      }
      throw err;
    }
  }

  async embed(texts: string[], traceId?: string): Promise<RAGEmbedResponse> {
    return await this.request<RAGEmbedResponse>('/api/embed', { texts }, traceId);
  }

  async rerank(query: string, documents: string[], topK?: number, traceId?: string): Promise<RAGRerankResponse> {
    return await this.request<RAGRerankResponse>('/api/rerank', { query, documents, topK }, traceId);
  }

  async chunk(text: string, options?: RAGChunkRequest['options'], traceId?: string): Promise<RAGChunkResponse> {
    return await this.request<RAGChunkResponse>('/api/chunk', { text, options }, traceId);
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
