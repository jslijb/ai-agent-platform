import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Queue, Worker } from 'bullmq';
import { createLogger, generateTraceId, extractTraceId, setupGracefulShutdown } from '@ai-agent/shared-utils';
import type {
  EvaluationRunRequest,
  EvaluationRunResponse,
  EvaluationStatusResponse,
  EvaluationResultsResponse,
  HealthResponse,
} from '@ai-agent/shared-types';

const logger = createLogger('evaluation-service');
const app = Fastify({ logger: false });
const startTime = Date.now();

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const evaluationQueue = new Queue('evaluation', {
  connection: { host: REDIS_HOST, port: REDIS_PORT },
});

const taskStatus = new Map<string, EvaluationStatusResponse>();

app.register(cors, { origin: true });

app.addHook('onRequest', async (request) => {
  const traceId = extractTraceId(request.headers as Record<string, string | string[] | undefined>) || generateTraceId();
  (request as any).traceId = traceId;
});

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
  const { hybridSearch } = await import('@/server/rag/retrieval/hybrid-retriever');
  return async (query: string): Promise<Array<{ text: string; score: number }>> => {
    logger.info('检索查询', { query: query.slice(0, 50) });
    try {
      const results = await hybridSearch(query, 5);
      logger.info('检索完成', { count: results.length });
      return results.map((r) => ({ text: r.text, score: r.score }));
    } catch (error) {
      logger.error('检索失败', { error: String(error) });
      return [];
    }
  };
}

async function getAnswerFn() {
  const { callWithFallback } = await import('@/server/llm/router');
  return async (query: string, searchResults: Array<{ text: string; score: number }>): Promise<string> => {
    logger.info('生成答案', { query: query.slice(0, 50), contextCount: searchResults.length });

    if (searchResults.length === 0) {
      logger.info('无检索结果，返回默认答案');
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

      logger.info('答案生成完成', { length: (response.content ?? '').length });
      return response.content ?? '';
    } catch (error) {
      logger.error('答案生成失败', { error: String(error) });
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
  let redisOk = false;
  let dbOk = false;

  try {
    const { getRedis } = await import('@/server/lib/redis');
    const redis = await getRedis();
    if (redis) {
      await redis.ping();
      redisOk = true;
    }
  } catch { redisOk = false; }

  try {
    const { sql, getDb } = await import('@/server/db/client');
    const database = getDb();
    await database.execute(sql`SELECT 1`);
    dbOk = true;
  } catch { dbOk = false; }

  return {
    status: redisOk && dbOk ? 'ok' : 'degraded',
    uptime,
    service: 'evaluation-service',
    details: { redis: redisOk, db: dbOk },
  } as HealthResponse;
});

async function main() {
  const port = parseInt(process.env.EVALUATION_SERVICE_PORT || '3003', 10);
  const host = process.env.EVALUATION_SERVICE_HOST || '0.0.0.0';
  try {
    await app.listen({ port, host });
    logger.info('评估服务已启动', { port, host });
  } catch (err) {
    logger.error('评估服务启动失败', { error: String(err) });
    process.exit(1);
  }
}

setupGracefulShutdown(async () => {
  await worker.close();
  await evaluationQueue.close();
  await app.close();
  logger.info('评估服务已关闭');
}, 'evaluation-service');

main();
