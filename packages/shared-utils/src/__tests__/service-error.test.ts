import { describe, it, expect } from 'vitest';
import { ServiceError } from '../service-error';

describe('ServiceError', () => {
  it('默认属性正确', () => {
    const err = new ServiceError({ message: '测试错误' });
    expect(err.name).toBe('ServiceError');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.retryable).toBe(false);
  });

  it('serviceUnavailable 工厂方法', () => {
    const err = ServiceError.serviceUnavailable('RAG', 'trace-1');
    expect(err.statusCode).toBe(503);
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('RAG');
    expect(err.traceId).toBe('trace-1');
  });

  it('timeout 工厂方法', () => {
    const err = ServiceError.timeout('LLM');
    expect(err.statusCode).toBe(504);
    expect(err.retryable).toBe(true);
  });

  it('badRequest 工厂方法', () => {
    const err = ServiceError.badRequest('参数缺失');
    expect(err.statusCode).toBe(400);
    expect(err.retryable).toBe(false);
  });
});
