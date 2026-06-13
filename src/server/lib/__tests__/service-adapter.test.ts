import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('service-adapter', () => {
  const originalEnv = process.env.USE_MICROSERVICE;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.USE_MICROSERVICE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.USE_MICROSERVICE = originalEnv;
    } else {
      delete process.env.USE_MICROSERVICE;
    }
    globalThis.fetch = originalFetch;
  });

  it('USE_MICROSERVICE 默认为 true', async () => {
    const { isMicroserviceMode } = await import('../service-adapter');
    expect(isMicroserviceMode()).toBe(true);
  });

  it('USE_MICROSERVICE=false 时回退到进程内调用', async () => {
    process.env.USE_MICROSERVICE = 'false';
    const { isMicroserviceMode } = await import('../service-adapter');
    expect(isMicroserviceMode()).toBe(false);
  });

  it('searchRAG 微服务模式通过 fetch 调用 RAG 服务', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, results: [{ text: '测试结果', documentId: 'doc1', score: 0.9 }], latencyMs: 10 }),
    });
    globalThis.fetch = mockFetch;

    const { searchRAG } = await import('../service-adapter');
    const result = await searchRAG('测试查询', 5, 'trace-1');
    expect(result.success).toBe(true);
    expect(result.results.length).toBe(1);
    expect(mockFetch).toHaveBeenCalled();
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('localhost:3001');
    expect(callUrl).toContain('/api/retrieve');
  });

  it('callLLM 微服务模式通过 fetch 调用 LLM Gateway', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: '测试回复',
        model: 'qwen-plus',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      }),
    });
    globalThis.fetch = mockFetch;

    const { callLLM } = await import('../service-adapter');
    const result = await callLLM([{ role: 'user', content: '你好' }], undefined, 'trace-2');
    expect(result.content).toBe('测试回复');
    expect(result.model).toBe('qwen-plus');
    expect(mockFetch).toHaveBeenCalled();
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('localhost:3002');
    expect(callUrl).toContain('/api/llm/chat');
  });

  it('pushEvaluationTask 微服务模式推送 BullMQ 队列', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ taskId: 'test-task-123', status: 'queued' }),
    });
    globalThis.fetch = mockFetch;

    const { pushEvaluationTask } = await import('../service-adapter');
    const result = await pushEvaluationTask('standard', 'v1.0', undefined, undefined, 'trace-3');
    expect(result.status).toBe('queued');
    expect(result.taskId).toBe('test-task-123');
    expect(mockFetch).toHaveBeenCalled();
    const callUrl = mockFetch.mock.calls[0][0];
    expect(callUrl).toContain('/api/evaluation/run');
  });

  it('pushEvaluationTask 进程内模式调用 triggerEvaluation', async () => {
    process.env.USE_MICROSERVICE = 'false';
    const mockTriggerEvaluation = vi.fn().mockResolvedValue({ success: true, version: 1 });
    vi.doMock('@/server/evaluation/evaluation-trigger', () => ({
      triggerEvaluation: mockTriggerEvaluation,
    }));

    const { pushEvaluationTask } = await import('../service-adapter');
    const result = await pushEvaluationTask('standard', 'v1.0', undefined, undefined, 'trace-4');
    expect(result.taskId).toBe('local');
    expect(result.status).toBe('completed');
    expect(mockTriggerEvaluation).toHaveBeenCalledWith('standard', 'rag', 'v1.0');
  });

  it('searchRAG 微服务模式 RAG 返回失败时抛出错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, results: [], latencyMs: 0, error: '服务不可用' }),
    });
    globalThis.fetch = mockFetch;

    const { searchRAG } = await import('../service-adapter');
    await expect(searchRAG('降级测试', 5, 'trace-5')).rejects.toThrow('RAG_SEARCH_FAILED');
  });
});
