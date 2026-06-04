import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGClient } from '../index';

describe('RAGClient', () => {
  let client: RAGClient;

  beforeEach(() => {
    client = new RAGClient({ baseUrl: 'http://localhost:3001', timeout: 1000 });
    vi.restoreAllMocks();
  });

  it('search 服务不可用时返回降级结果', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('连接失败'));
    const result = await client.search('测试查询');
    expect(result.success).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('health 服务不可用时返回 error 状态', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('连接失败'));
    const result = await client.health();
    expect(result.status).toBe('error');
  });
});
