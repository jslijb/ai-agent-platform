import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '../logger';

describe('createLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info 级别日志输出 JSON 格式', () => {
    const logger = createLogger('test-service');
    logger.info('测试消息');
    expect(console.log).toHaveBeenCalled();
    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.service).toBe('test-service');
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('测试消息');
    expect(parsed.timestamp).toBeDefined();
  });

  it('error 级别日志包含 traceId', () => {
    const logger = createLogger('test-service');
    logger.error('错误消息', undefined, 'trace-123');
    expect(console.error).toHaveBeenCalled();
    const output = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.traceId).toBe('trace-123');
  });

  it('日志包含额外数据', () => {
    const logger = createLogger('test-service');
    logger.info('带数据的消息', { key: 'value' });
    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.data).toEqual({ key: 'value' });
  });
});
