import Fastify from 'fastify';
import cors from '@fastify/cors';
import { callWithFallback } from '@/server/llm/router';
import { getCircuitState } from '@/server/lib/circuit-breaker';
import { checkRateLimit } from '@/server/lib/rate-limiter';
import { createLogger, generateTraceId, extractTraceId, setupGracefulShutdown } from '@ai-agent/shared-utils';
import type {
  LLMChatRequest,
  LLMChatResponse,
  LLMUsageResponse,
  HealthResponse,
} from '@ai-agent/shared-types';

const logger = createLogger('llm-gateway');
const app = Fastify({ logger: false });
const startTime = Date.now();

app.register(cors, { origin: true });

app.addHook('onRequest', async (request) => {
  const traceId = extractTraceId(request.headers as Record<string, string | string[] | undefined>) || generateTraceId();
  (request as any).traceId = traceId;
});

app.addHook('onSend', async (request, reply) => {
  const traceId = (request as any).traceId;
  if (traceId) reply.header('X-Trace-Id', traceId);
});

app.post('/api/llm/chat', async (request, reply) => {
  const traceId = (request as any).traceId;
  const body = request.body as LLMChatRequest;
  logger.info('LLM chat 请求', { messageCount: body.messages?.length }, traceId);

  if (!body.messages || body.messages.length === 0) {
    logger.warn('LLM chat 请求缺少 messages', undefined, traceId);
    return reply.status(400).send({
      content: null,
      model: '',
      error: 'messages 参数必填',
    } as LLMChatResponse);
  }

  const rateLimitResult = checkRateLimit(`llm-chat:${(request.ip || 'unknown')}`);
  if (!rateLimitResult.allowed) {
    logger.warn('LLM chat 请求被限流', { remaining: rateLimitResult.remaining, resetIn: rateLimitResult.resetIn }, traceId);
    return reply.status(429).send({
      content: null,
      model: '',
      error: '请求过于频繁，请稍后再试',
    } as LLMChatResponse);
  }

  try {
    const result = await callWithFallback(
      body.messages.map(m => ({ role: m.role as any, content: m.content })),
      body.options?.temperature,
      body.options?.requireFunctionCalling,
      body.options?.tools as any[]
    );
    logger.info('LLM chat 完成', { model: result.model, usage: result.usage }, traceId);
    return {
      content: result.content,
      model: result.model,
      usage: result.usage,
      toolCalls: result.toolCalls,
    } as LLMChatResponse;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('LLM chat 失败', { error: errorMsg }, traceId);
    return reply.status(503).send({
      content: null,
      model: '',
      error: errorMsg,
    } as LLMChatResponse);
  }
});

app.post('/api/llm/stream', async (request, reply) => {
  const traceId = (request as any).traceId;
  const body = request.body as LLMChatRequest;
  logger.info('LLM stream 请求', { messageCount: body.messages?.length }, traceId);

  if (!body.messages || body.messages.length === 0) {
    logger.warn('LLM stream 请求缺少 messages', undefined, traceId);
    return reply.status(400).send({ error: 'messages 参数必填' });
  }

  const rateLimitResult = checkRateLimit(`llm-stream:${(request.ip || 'unknown')}`);
  if (!rateLimitResult.allowed) {
    logger.warn('LLM stream 请求被限流', { remaining: rateLimitResult.remaining, resetIn: rateLimitResult.resetIn }, traceId);
    return reply.status(429).send({ error: '请求过于频繁，请稍后再试' });
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const result = await callWithFallback(
      body.messages.map(m => ({ role: m.role as any, content: m.content })),
      body.options?.temperature,
      body.options?.requireFunctionCalling,
      body.options?.tools as any[]
    );
    const data = JSON.stringify({
      content: result.content,
      model: result.model,
      usage: result.usage,
    });
    reply.raw.write(`data: ${data}\n\n`);
    logger.info('LLM stream 完成', { model: result.model }, traceId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('LLM stream 失败', { error: errorMsg }, traceId);
    reply.raw.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
  }
  reply.raw.end();
});

app.get('/api/llm/usage', async () => {
  try {
    const { db, sql } = await import('@/server/db/client');
    const result = await db.execute(sql`SELECT model, SUM(prompt_tokens + completion_tokens) as total FROM llm_usage_logs GROUP BY model`);
    const byModel: Record<string, number> = {};
    let totalTokens = 0;
    for (const row of (result as any).rows as any[]) {
      byModel[row.model] = Number(row.total);
      totalTokens += Number(row.total);
    }
    logger.info('查询用量成功', { totalTokens, modelCount: Object.keys(byModel).length });
    return { totalTokens, byModel, byDate: {} } as LLMUsageResponse;
  } catch (err) {
    logger.error('查询用量失败', { error: String(err) });
    return { totalTokens: 0, byModel: {}, byDate: {} } as LLMUsageResponse;
  }
});

app.get('/api/health', async () => {
  const uptime = Date.now() - startTime;
  const circuitState = getCircuitState('bailian');
  let redisOk = false;
  try {
    const { getRedis } = await import('@/server/lib/redis');
    const redis = await getRedis();
    if (redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch {
    redisOk = false;
  }
  logger.info('健康检查', { circuitState, redisOk, uptime });
  return {
    status: circuitState === 'open' ? 'degraded' : 'ok',
    uptime,
    service: 'llm-gateway',
    details: { circuitBreaker: circuitState, redis: redisOk },
  } as HealthResponse;
});

async function main() {
  const port = parseInt(process.env.LLM_GATEWAY_PORT || '3002', 10);
  const host = process.env.LLM_GATEWAY_HOST || '0.0.0.0';
  try {
    await app.listen({ port, host });
    logger.info('LLM Gateway 已启动', { port, host });
  } catch (err) {
    logger.error('LLM Gateway 启动失败', { error: String(err) });
    process.exit(1);
  }
}

setupGracefulShutdown(async () => {
  await app.close();
  logger.info('LLM Gateway 已关闭');
}, 'llm-gateway');

main();
