import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createLogger, generateTraceId, extractTraceId } from '@ai-agent/shared-utils';
import type { EvaluationRunResponse, EvaluationStatusResponse, HealthResponse } from '@ai-agent/shared-types';

const taskStore = new Map<string, EvaluationStatusResponse>();

function buildApp() {
  taskStore.clear();
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  app.addHook('onRequest', async (request) => {
    const traceId = extractTraceId(request.headers as Record<string, string | string[] | undefined>) || generateTraceId();
    (request as any).traceId = traceId;
  });

  app.post('/api/evaluation/run', async (request) => {
    const body = request.body as { level?: string; milestone?: string };
    const taskId = generateTraceId();
    taskStore.set(taskId, { taskId, status: 'queued' });
    return { taskId, status: 'queued' } as EvaluationRunResponse;
  });

  app.get('/api/evaluation/status/:taskId', async (request) => {
    const { taskId } = request.params as { taskId: string };
    const status = taskStore.get(taskId);
    if (!status) return { taskId, status: 'queued', error: '任务不存在' };
    return status;
  });

  app.get('/api/evaluation/results', async () => {
    return { versions: [] };
  });

  app.get('/api/health', async () => {
    return { status: 'ok', uptime: 1000, service: 'evaluation-service', details: { redis: true, db: true } };
  });

  return app;
}

describe('评估服务 API', () => {
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  it('POST /api/evaluation/run 返回 taskId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/evaluation/run',
      payload: { level: 'standard' },
    });
    const body = JSON.parse(response.body);
    expect(body.taskId).toBeDefined();
    expect(body.status).toBe('queued');
  });

  it('GET /api/evaluation/status/:taskId 返回任务状态', async () => {
    const runResponse = await app.inject({
      method: 'POST',
      url: '/api/evaluation/run',
      payload: { level: 'standard' },
    });
    const { taskId } = JSON.parse(runResponse.body);

    const statusResponse = await app.inject({
      method: 'GET',
      url: `/api/evaluation/status/${taskId}`,
    });
    const status = JSON.parse(statusResponse.body);
    expect(status.taskId).toBe(taskId);
    expect(['queued', 'running', 'completed', 'failed']).toContain(status.status);
  });

  it('GET /api/evaluation/status/:taskId 不存在的任务', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/evaluation/status/nonexistent',
    });
    const body = JSON.parse(response.body);
    expect(body.error).toBeDefined();
  });

  it('GET /api/evaluation/results 返回结果列表', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/evaluation/results',
    });
    const body = JSON.parse(response.body);
    expect(body.versions).toBeDefined();
    expect(Array.isArray(body.versions)).toBe(true);
  });

  it('GET /api/health 返回健康状态', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('evaluation-service');
  });

  it('POST /api/evaluation/run 带 milestone 参数', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/evaluation/run',
      payload: { level: 'full', milestone: 'v2.0-release' },
    });
    const body = JSON.parse(response.body);
    expect(body.taskId).toBeDefined();
    expect(body.status).toBe('queued');
  });
});
