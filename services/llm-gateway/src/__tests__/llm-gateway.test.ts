import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger, generateTraceId, extractTraceId } from '@ai-agent/shared-utils';
import type { LLMChatResponse, LLMUsageResponse, HealthResponse } from '@ai-agent/shared-types';

function buildApp() {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  app.addHook('onRequest', async (request) => {
    const traceId = extractTraceId(request.headers as Record<string, string | string[] | undefined>) || generateTraceId();
    (request as any).traceId = traceId;
  });

  app.post('/api/llm/chat', async (request, reply) => {
    const traceId = (request as any).traceId;
    const body = request.body as { messages?: Array<{ role: string; content: string }>; options?: Record<string, unknown> };
    if (!body.messages || body.messages.length === 0) {
      return reply.status(400).send({ content: null, model: '', error: 'messages 参数必填' });
    }
    return {
      content: '这是测试回复',
      model: 'qwen-plus',
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      traceId,
    };
  });

  app.post('/api/llm/stream', async (request, reply) => {
    const body = request.body as { messages?: Array<{ role: string; content: string }> };
    if (!body.messages || body.messages.length === 0) {
      return reply.status(400).send({ error: 'messages 参数必填' });
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    reply.raw.write(`data: ${JSON.stringify({ content: '流式回复', model: 'qwen-plus' })}\n\n`);
    reply.raw.end();
  });

  app.get('/api/llm/usage', async () => {
    return { totalTokens: 1000, byModel: { 'qwen-plus': 800, 'qwen-turbo': 200 }, byDate: {} };
  });

  app.get('/api/health', async () => {
    return { status: 'ok', uptime: 5000, service: 'llm-gateway', details: { circuitBreaker: 'closed', redis: true } };
  });

  return app;
}

describe('LLM Gateway API', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/llm/chat 缺少 messages 返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/chat',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
    expect(body.error).toBe('messages 参数必填');
  });

  it('POST /api/llm/chat 空消息数组返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/chat',
      payload: { messages: [] },
    });
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('messages 参数必填');
  });

  it('POST /api/llm/chat 正常请求返回成功', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/chat',
      payload: { messages: [{ role: 'user', content: '你好' }] },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.content).toBeDefined();
    expect(body.model).toBe('qwen-plus');
    expect(body.usage).toBeDefined();
    expect(body.usage.total_tokens).toBe(30);
  });

  it('POST /api/llm/chat 带选项参数返回成功', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/chat',
      payload: {
        messages: [{ role: 'user', content: '分析股票' }],
        options: { temperature: 0.7, requireFunctionCalling: true },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.content).toBeDefined();
    expect(body.model).toBeDefined();
  });

  it('POST /api/llm/stream 缺少 messages 返回 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/stream',
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/llm/stream 返回 SSE 流', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/stream',
      payload: { messages: [{ role: 'user', content: '你好' }] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('data:');
    expect(response.body).toContain('流式回复');
  });

  it('GET /api/llm/usage 返回用量统计', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/llm/usage',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.totalTokens).toBe(1000);
    expect(body.byModel).toBeDefined();
    expect(body.byModel['qwen-plus']).toBe(800);
    expect(body.byModel['qwen-turbo']).toBe(200);
  });

  it('GET /api/health 返回健康状态', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('llm-gateway');
    expect(body.details.circuitBreaker).toBeDefined();
    expect(body.uptime).toBeDefined();
  });

  it('traceId 透传验证', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/chat',
      payload: { messages: [{ role: 'user', content: '测试' }] },
      headers: { 'x-trace-id': 'llm-trace-456' },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.traceId).toBe('llm-trace-456');
  });

  it('无 traceId 时自动生成', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/llm/chat',
      payload: { messages: [{ role: 'user', content: '测试' }] },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.traceId).toBeDefined();
    expect(typeof body.traceId).toBe('string');
    expect(body.traceId.length).toBeGreaterThan(0);
  });
});
