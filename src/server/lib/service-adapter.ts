const USE_MICROSERVICE = process.env.USE_MICROSERVICE !== 'false';
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:3001';
const LLM_GATEWAY_URL = process.env.LLM_GATEWAY_URL || 'http://localhost:3002';
const EVALUATION_SERVICE_URL = process.env.EVALUATION_SERVICE_URL || 'http://localhost:3001';

type LogLevel = 'error' | 'warn' | 'info';
const LOG_LEVEL_VALUES: Record<LogLevel, number> = { error: 0, warn: 1, info: 2 };

function createSimpleLogger(service: string) {
  const minLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  const minLevelValue = LOG_LEVEL_VALUES[minLevel] ?? 2;

  function log(level: LogLevel, message: string, data?: Record<string, unknown>, traceId?: string) {
    if (LOG_LEVEL_VALUES[level] > minLevelValue) return;
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
    };
    if (data) entry.data = data;
    if (traceId) entry.traceId = traceId;
    const output = JSON.stringify(entry);
    if (level === 'error') console.error(output);
    else if (level === 'warn') console.warn(output);
    else console.log(output);
  }

  return {
    info: (message: string, data?: Record<string, unknown>, traceId?: string) => log('info', message, data, traceId),
    warn: (message: string, data?: Record<string, unknown>, traceId?: string) => log('warn', message, data, traceId),
    error: (message: string, data?: Record<string, unknown>, traceId?: string) => log('error', message, data, traceId),
  };
}

const logger = createSimpleLogger('service-adapter');

/**
 * RAG 检索
 * 微服务模式：HTTP 调用 RAG Service
 * 单体模式：进程内调用 hybridSearch()
 * 不做"微服务失败→进程内"降级（同一依赖链：DB/embedding不可用，进程内也一样失败）
 */
export async function searchRAG(query: string, topK?: number, traceId?: string) {
  if (USE_MICROSERVICE) {
    logger.info('通过 RAG 微服务检索', { query: query.slice(0, 50), topK }, traceId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (traceId) headers['X-Trace-Id'] = traceId;
    try {
      const res = await fetch(`${RAG_SERVICE_URL}/api/retrieve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, topK }),
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        logger.error('RAG 微服务检索失败', { status: res.status }, traceId);
        throw new Error('RAG_SERVICE_UNAVAILABLE');
      }
      const data = await res.json();
      if (!data.success) {
        logger.error('RAG 微服务返回业务失败', { error: data.error }, traceId);
        throw new Error('RAG_SEARCH_FAILED');
      }
      return data;
    } catch (err) {
      if (err instanceof Error && err.message === 'RAG_SERVICE_UNAVAILABLE') throw err;
      if (err instanceof Error && err.message === 'RAG_SEARCH_FAILED') throw err;
      // 网络超时/连接拒绝等
      logger.error('RAG 微服务连接异常', { error: err instanceof Error ? err.message : String(err) }, traceId);
      throw new Error('RAG_SERVICE_UNAVAILABLE');
    }
  }

  logger.info('通过进程内调用检索（单体模式）', { query: query.slice(0, 50), topK }, traceId);
  const { hybridSearch } = await import('@/server/rag/retrieval/hybrid-retriever');
  const results = await hybridSearch(query, topK || 10);
  return { success: true, results, latencyMs: 0 };
}

/**
 * LLM 调用
 * 微服务模式：HTTP 调用 LLM Gateway
 * 单体模式：进程内调用 callWithFallback()
 * 不做"服务失败→进程内调用"降级（同一 API Key，挂了一样挂）
 * LLM 模型降级链由 llm/router.ts 内部处理（qwen-max→qwen-plus→qwen-turbo）
 */
export async function callLLM(
  messages: Array<{ role: string; content: string }>,
  options?: { requireFunctionCalling?: boolean; tools?: unknown[]; temperature?: number; maxTokens?: number },
  traceId?: string
) {
  if (USE_MICROSERVICE) {
    logger.info('通过 LLM Gateway 调用', { messageCount: messages.length }, traceId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (traceId) headers['X-Trace-Id'] = traceId;
    try {
      const res = await fetch(`${LLM_GATEWAY_URL}/api/llm/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, options }),
        cache: 'no-store',
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        logger.error('LLM Gateway 调用失败', { status: res.status }, traceId);
        if (res.status === 429) throw new Error('LLM_RATE_LIMITED');
        throw new Error('LLM_SERVICE_UNAVAILABLE');
      }
      const data = await res.json();
      if (data.content === null && data.error) {
        logger.error('LLM Gateway 返回业务失败', { error: data.error }, traceId);
        throw new Error('LLM_CALL_FAILED');
      }
      return data;
    } catch (err) {
      if (err instanceof Error && [
        'LLM_SERVICE_UNAVAILABLE', 'LLM_CALL_FAILED', 'LLM_RATE_LIMITED'
      ].includes(err.message)) throw err;
      logger.error('LLM Gateway 连接异常', { error: err instanceof Error ? err.message : String(err) }, traceId);
      throw new Error('LLM_SERVICE_UNAVAILABLE');
    }
  }

  logger.info('通过进程内调用 LLM（单体模式）', { messageCount: messages.length }, traceId);
  const { callWithFallback } = await import('@/server/llm/router');
  const result = await callWithFallback(
    messages as any,
    options?.temperature,
    options?.requireFunctionCalling,
    options?.tools as any[]
  );
  return {
    content: result.content,
    model: result.model,
    usage: result.usage,
    toolCalls: result.toolCalls,
  };
}

/**
 * 评估任务推送
 * 微服务模式：HTTP 调用 RAG Service 的评估端点
 * 单体模式：进程内调用 triggerEvaluation()
 * 不做"服务失败→进程内调用"降级（同一依赖链）
 */
export async function pushEvaluationTask(
  level: 'standard' | 'full',
  milestone?: string,
  datasets?: string[],
  maxSamples?: number,
  traceId?: string
): Promise<{ taskId: string; status: string }> {
  if (USE_MICROSERVICE) {
    logger.info('通过 RAG 微服务推送评估任务', { level, milestone }, traceId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (traceId) headers['X-Trace-Id'] = traceId;
    try {
      const res = await fetch(`${EVALUATION_SERVICE_URL}/api/evaluation/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ level, milestone, datasets, maxSamples }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        logger.error('评估任务推送失败', { status: res.status }, traceId);
        throw new Error('EVALUATION_SERVICE_UNAVAILABLE');
      }
      const data = await res.json();
      logger.info('评估任务推送成功', { taskId: data.taskId, level }, traceId);
      return { taskId: data.taskId, status: data.status };
    } catch (err) {
      if (err instanceof Error && err.message === 'EVALUATION_SERVICE_UNAVAILABLE') throw err;
      logger.error('评估服务连接异常', { error: err instanceof Error ? err.message : String(err) }, traceId);
      throw new Error('EVALUATION_SERVICE_UNAVAILABLE');
    }
  }

  logger.info('通过进程内调用评估（单体模式）', { level, milestone }, traceId);
  const { triggerEvaluation } = await import('@/server/evaluation/evaluation-trigger');
  await triggerEvaluation(level, 'rag', milestone);
  return { taskId: 'local', status: 'completed' };
}

export function isMicroserviceMode(): boolean {
  return USE_MICROSERVICE;
}
