import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../index';

describe('LLMClient', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient({ baseUrl: 'http://localhost:3002', timeout: 1000 });
    vi.restoreAllMocks();
  });

  it('chat 服务不可用时返回降级结果', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('连接失败'));
    const result = await client.chat([{ role: 'user', content: '你好' }]);
    expect(result.content).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('usage 服务不可用时返回空数据', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('连接失败'));
    const result = await client.usage();
    expect(result.totalTokens).toBe(0);
  });

  it('health 服务不可用时返回 error 状态', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('连接失败'));
    const result = await client.health();
    expect(result.status).toBe('error');
  });
});
