import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Queue, Worker } from 'bullmq';
import { hybridSearch } from '@/server/rag/retrieval/hybrid-retriever';
import { generateEmbedding } from '@/server/rag/retrieval/dense-retriever';
import { rerank } from '@/server/rag/reranking/reranker';
import { cleanText, fixChunkBoundaries } from '@/server/rag/chunking/text-cleaner';
import { chunkText } from '@/server/rag/chunking/semantic-chunker';
import { createLogger, generateTraceId, extractTraceId, setupGracefulShutdown } from '@ai-agent/shared-utils';
import type {
  RAGRetrieveRequest,
  RAGRetrieveResponse,
  RAGEmbedRequest,
  RAGEmbedResponse,
  RAGRerankRequest,
  RAGRerankResponse,
  RAGChunkRequest,
  RAGChunkResponse,
  EvaluationRunRequest,
  EvaluationRunResponse,
  EvaluationStatusResponse,
  EvaluationResultsResponse,
  HealthResponse,
} from '@ai-agent/shared-types';

const logger = createLogger('rag-service');
const app = Fastify({ logger: false });
const startTime = Date.now();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

app.register(cors, { origin: true });

app.addHook('onRequest', async (request) => {
  const traceId = extractTraceId(request.headers as Record<string, string | string[] | undefined>) || generateTraceId();
  (request as any).traceId = traceId;
});

app.addHook('onSend', async (request, reply) => {
  const traceId = (request as any).traceId;
  if (traceId) reply.header('X-Trace-Id', traceId);
});

app.post('/api/retrieve', async (request, reply) => {
  const traceId = (request as any).traceId;
  const body = request.body as RAGRetrieveRequest;
  logger.info('检索请求', { query: body.query?.slice(0, 50), topK: body.topK }, traceId);

  if (!body.query) {
    logger.warn('检索请求缺少 query 参数', undefined, traceId);
    return reply.status(400).send({ success: false, results: [], latencyMs: 0, error: 'query 参数必填' });
  }

  const start = Date.now();
  try {
    const results = await hybridSearch(body.query, body.topK || 10);
    const latencyMs = Date.now() - start;
    logger.info('检索完成', { count: results.length, latencyMs }, traceId);
    return { success: true, results, latencyMs } as RAGRetrieveResponse;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('检索失败', { error: errorMsg, latencyMs }, traceId);
    return { success: false, results: [], latencyMs, error: errorMsg } as RAGRetrieveResponse;
  }
});

app.post('/api/embed', async (request, reply) => {
  const traceId = (request as any).traceId;
  const body = request.body as RAGEmbedRequest;
  logger.info('Embedding 请求', { textCount: body.texts?.length }, traceId);

  if (!body.texts || body.texts.length === 0) {
    logger.warn('Embedding 请求缺少 texts 参数', undefined, traceId);
    return reply.status(400).send({ embeddings: [], error: 'texts 参数必填' } as RAGEmbedResponse);
  }

  const start = Date.now();
  try {
    const embeddings = await Promise.all(body.texts.map(t => generateEmbedding(t)));
    const latencyMs = Date.now() - start;
    logger.info('Embedding 完成', { count: embeddings.length, latencyMs }, traceId);
    return { embeddings } as RAGEmbedResponse;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Embedding 失败', { error: errorMsg }, traceId);
    return { embeddings: [], error: errorMsg } as RAGEmbedResponse;
  }
});

app.post('/api/rerank', async (request, reply) => {
  const traceId = (request as any).traceId;
  const body = request.body as RAGRerankRequest;
  logger.info('重排序请求', { query: body.query?.slice(0, 50), docCount: body.documents?.length }, traceId);

  if (!body.query || !body.documents || body.documents.length === 0) {
    logger.warn('重排序请求缺少 query 或 documents 参数', undefined, traceId);
    return reply.status(400).send({ results: [], error: 'query 和 documents 参数必填' } as RAGRerankResponse);
  }

  const start = Date.now();
  try {
    const results = await rerank(body.query, body.documents, body.topK || 3);
    const latencyMs = Date.now() - start;
    logger.info('重排序完成', { count: results.length, latencyMs }, traceId);
    return { results } as RAGRerankResponse;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('重排序失败', { error: errorMsg }, traceId);
    return { results: [], error: errorMsg } as RAGRerankResponse;
  }
});

app.post('/api/chunk', async (request, reply) => {
  const traceId = (request as any).traceId;
  const body = request.body as RAGChunkRequest;
  logger.info('分块请求', { textLength: body.text?.length }, traceId);

  if (!body.text) {
    logger.warn('分块请求缺少 text 参数', undefined, traceId);
    return reply.status(400).send({ chunks: [], error: 'text 参数必填' } as RAGChunkResponse);
  }

  const start = Date.now();
  try {
    const cleaned = cleanText(body.text);
    const chunks = await chunkText(cleaned, body.options);
    const fixed = fixChunkBoundaries(chunks);
    const latencyMs = Date.now() - start;
    logger.info('分块完成', { count: fixed.length, latencyMs }, traceId);
    return { chunks: fixed } as RAGChunkResponse;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('分块失败', { error: errorMsg }, traceId);
    return { chunks: [], error: errorMsg } as RAGChunkResponse;
  }
});

const evaluationQueue = new Queue('evaluation', {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
});

const taskStatus = new Map<string, EvaluationStatusResponse>();

async function loadGoldenTestSet(): Promise<Array<{
  id: number;
  query: string;
  expectedAnswer: string;
  category: string;
  difficulty: string;
}>> {
  logger.info('加载黄金测试集');
  const fs = await import('fs');
  const path = await import('path');
  const qaGoldenPath = path.resolve(process.cwd(), 'scripts', 'qa-golden.json');

  if (!fs.existsSync(qaGoldenPath)) {
    logger.error('黄金测试集文件不存在', { path: qaGoldenPath });
    throw new Error('黄金测试集文件不存在: ' + qaGoldenPath);
  }

  const raw = fs.readFileSync(qaGoldenPath, 'utf-8');
  const data = JSON.parse(raw);
  logger.info('黄金测试集加载成功', { count: data.length });
  return data;
}

async function getSearchFn() {
  return async (query: string): Promise<Array<{ text: string; score: number }>> => {
    logger.info('评估-检索查询', { query: query.slice(0, 50) });
    try {
      const results = await hybridSearch(query, 5);
      logger.info('评估-检索完成', { count: results.length });
      return results.map((r) => ({ text: r.text, score: r.score }));
    } catch (error) {
      logger.error('评估-检索失败', { error: String(error) });
      return [];
    }
  };
}

async function getAnswerFn() {
  const { callWithFallback } = await import('@/server/llm/router');
  return async (query: string, searchResults: Array<{ text: string; score: number }>): Promise<string> => {
    logger.info('评估-生成答案', { query: query.slice(0, 50), contextCount: searchResults.length });

    if (searchResults.length === 0) {
      logger.info('评估-无检索结果，返回默认答案');
      return '抱歉，未找到与您问题相关的信息。';
    }

    try {
      const contextBlock = searchResults
        .map((r, i) => `[文档片段${i + 1}]\n${r.text}`)
        .join('\n\n');

      const response = await callWithFallback([
        {
          role: 'system',
          content: '你是一个专业的金融领域问答助手。请根据提供的文档片段回答用户的问题。回答必须基于提供的文档内容，不要编造信息。如果文档中没有相关信息，请明确说明。',
        },
        {
          role: 'user',
          content: `以下是相关文档片段：\n\n${contextBlock}\n\n用户问题：${query}\n\n请基于以上文档片段回答问题。`,
        },
      ]);

      logger.info('评估-答案生成完成', { length: (response.content ?? '').length });
      return response.content ?? '';
    } catch (error) {
      logger.error('评估-答案生成失败', { error: String(error) });
      return '答案生成失败，请稍后重试。';
    }
  };
}

const worker = new Worker('evaluation', async (job) => {
  const { taskId, level, milestone, datasets, maxSamples } = job.data;
  const traceId = job.data.traceId || generateTraceId();
  logger.info('开始评估任务', { taskId, level }, traceId);

  try {
    taskStatus.set(taskId, {
      taskId,
      status: 'running',
      progress: { current: 0, total: 1, phase: '初始化' },
    });

    const { runFinancialEvaluation } = await import('@/server/evaluation/rag-evaluator');
    const { saveEvaluationVersion } = await import('@/server/evaluation/evaluation-history');

    const testSet = await loadGoldenTestSet();
    const searchFn = await getSearchFn();
    const answerFn = await getAnswerFn();

    let result;

    if (level === 'standard') {
      logger.info('执行标准评估', { taskId }, traceId);
      result = await runFinancialEvaluation(testSet, searchFn, answerFn, {
        evaluationLevel: 'standard',
        triggerMode: 'manual',
        milestone,
        dataSource: 'golden',
      });
    } else {
      logger.info('执行全面评估', { taskId }, traceId);
      result = await runFinancialEvaluation(testSet, searchFn, answerFn, {
        evaluationLevel: 'full',
        triggerMode: 'manual',
        milestone,
        dataSource: datasets && datasets.length > 0 ? 'mixed' : 'golden',
      });

      if (datasets && datasets.length > 0) {
        logger.info('执行开源数据集评估', { taskId, datasets }, traceId);
        const { runOpenDatasetEvaluation } = await import('@/server/evaluation/open-dataset-evaluator');
        const openResult = await runOpenDatasetEvaluation(datasets, searchFn, answerFn, {
          maxSamples: maxSamples || 200,
          evaluationLevel: 'full',
          triggerMode: 'manual',
          milestone,
        });
        result = { ...result, openDatasets: openResult };
      }
    }

    await saveEvaluationVersion({
      ...result,
      evaluationType: 'rag',
    });

    taskStatus.set(taskId, {
      taskId,
      status: 'completed',
      progress: { current: 1, total: 1, phase: '完成' },
      result,
    });

    logger.info('评估任务完成', { taskId }, traceId);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('评估任务失败', { taskId, error: errorMsg }, traceId);
    taskStatus.set(taskId, {
      taskId,
      status: 'failed',
      progress: { current: 0, total: 1, phase: '失败' },
      error: errorMsg,
    });
  }
}, {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
  concurrency: 1,
});

worker.on('failed', (job, err) => {
  logger.error('Worker 任务失败', { jobId: job?.id, error: err.message });
});

app.post('/api/evaluation/run', async (request) => {
  const traceId = (request as any).traceId;
  const body = request.body as EvaluationRunRequest;
  const taskId = generateTraceId();

  logger.info('收到评估请求', { taskId, level: body.level, milestone: body.milestone }, traceId);

  await evaluationQueue.add('evaluate', {
    taskId,
    level: body.level || 'standard',
    milestone: body.milestone,
    datasets: body.datasets,
    maxSamples: body.maxSamples,
    traceId,
  });

  taskStatus.set(taskId, {
    taskId,
    status: 'queued',
  });

  return { taskId, status: 'queued' } as EvaluationRunResponse;
});

app.get('/api/evaluation/status/:taskId', async (request) => {
  const { taskId } = request.params as { taskId: string };
  const status = taskStatus.get(taskId);
  if (!status) {
    return { taskId, status: 'queued' as const, error: '任务不存在' };
  }
  return status;
});

app.get('/api/evaluation/results', async () => {
  try {
    const { getEvaluationVersions } = await import('@/server/evaluation/evaluation-history');
    const versions = await getEvaluationVersions();
    return { versions: versions as unknown as EvaluationResultsResponse['versions'] } as EvaluationResultsResponse;
  } catch (err) {
    logger.error('查询评估结果失败', { error: String(err) });
    return { versions: [] } as EvaluationResultsResponse;
  }
});

app.get('/api/health', async () => {
  const uptime = Date.now() - startTime;
  let dbOk = false;
  let redisOk = false;
  try {
    const { sql, getDb } = await import('@/server/db/client');
    const database = getDb();
    await database.execute(sql`SELECT 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }
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
  logger.info('健康检查', { dbOk, redisOk, uptime });
  return {
    status: dbOk ? 'ok' : 'degraded',
    uptime,
    service: 'rag-service',
    details: { db: dbOk, redis: redisOk },
  } as HealthResponse;
});

async function main() {
  const port = parseInt(process.env.RAG_SERVICE_PORT || '3001', 10);
  const host = process.env.RAG_SERVICE_HOST || '0.0.0.0';
  try {
    await app.listen({ port, host });
    logger.info('RAG+评估服务已启动', { port, host });
  } catch (err) {
    logger.error('RAG+评估服务启动失败', { error: String(err) });
    process.exit(1);
  }
}

setupGracefulShutdown(async () => {
  await worker.close();
  await evaluationQueue.close();
  await app.close();
  logger.info('RAG+评估服务已关闭');
}, 'rag-service');

main();
