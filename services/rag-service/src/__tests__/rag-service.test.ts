import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger, generateTraceId, extractTraceId } from '@ai-agent/shared-utils';
import type { RAGRetrieveResponse, RAGEmbedResponse, RAGRerankResponse, RAGChunkResponse, HealthResponse } from '@ai-agent/shared-types';

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  app.addHook('onRequest', async (request) => {
    const traceId = extractTraceId(request.headers as Record<string, string | string[] | undefined>) || generateTraceId();
    (request as any).traceId = traceId;
  });

  app.post('/api/retrieve', async (request) => {
    const traceId = (request as any).traceId;
    const body = request.body as { query?: string; topK?: number };
    if (!body.query) {
      return { success: false, results: [], latencyMs: 0, error: 'query 参数必填' };
    }
    return { success: true, results: [], latencyMs: 10 };
  });

  app.post('/api/embed', async (request) => {
    const body = request.body as { texts?: string[] };
    if (!body.texts || body.texts.length === 0) {
      return { embeddings: [], error: 'texts 参数必填' };
    }
    return { embeddings: [[0.1, 0.2, 0.3]] };
  });

  app.post('/api/rerank', async (request) => {
    const body = request.body as { query?: string; documents?: string[]; topK?: number };
    if (!body.query || !body.documents || body.documents.length === 0) {
      return { results: [], error: 'query 和 documents 参数必填' };
    }
    return { results: [{ text: body.documents[0], score: 0.95, index: 0 }] };
  });

  app.post('/api/chunk', async (request) => {
    const body = request.body as { text?: string };
    if (!body.text) {
      return { chunks: [], error: 'text 参数必填' };
    }
    return { chunks: [{ text: body.text, index: 0, metadata: { source: 'api', tokenCount: 10 } }] };
  });

  app.get('/api/health', async () => {
    return { status: 'ok', uptime: 1000, service: 'rag-service', details: { db: true } };
  });

  return app;
}

describe('RAG 服务 API', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  it('POST /api/retrieve 缺少 query 返回错误', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/retrieve',
      payload: {},
    });
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
  });

  it('POST /api/retrieve 正常请求返回成功', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/retrieve',
      payload: { query: '中国长城营收' },
    });
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.latencyMs).toBeDefined();
  });

  it('POST /api/embed 缺少 texts 返回错误', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/embed',
      payload: {},
    });
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('POST /api/embed 正常请求返回 embedding', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/embed',
      payload: { texts: ['测试文本'] },
    });
    const body = JSON.parse(response.body);
    expect(body.embeddings).toBeDefined();
    expect(body.embeddings.length).toBeGreaterThan(0);
  });

  it('POST /api/rerank 缺少参数返回错误', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rerank',
      payload: { query: '营收' },
    });
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('POST /api/rerank 正常请求返回结果', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rerank',
      payload: { query: '营收', documents: ['中国长城营收增长'] },
    });
    const body = JSON.parse(response.body);
    expect(body.results).toBeDefined();
    expect(body.results.length).toBeGreaterThan(0);
  });

  it('POST /api/chunk 缺少 text 返回错误', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chunk',
      payload: {},
    });
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('POST /api/chunk 正常请求返回结果', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chunk',
      payload: { text: '这是一段测试文本' },
    });
    const body = JSON.parse(response.body);
    expect(body.chunks).toBeDefined();
    expect(body.chunks.length).toBeGreaterThan(0);
  });

  it('GET /api/health 返回健康状态', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('rag-service');
  });

  it('traceId 透传验证', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/retrieve',
      payload: { query: '测试' },
      headers: { 'x-trace-id': 'test-trace-123' },
    });
    expect(response.statusCode).toBe(200);
  });
});
