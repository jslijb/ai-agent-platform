import { describe, it, expect } from 'vitest';
import { generateTraceId, extractTraceId, injectTraceId } from '../trace-id';

describe('traceId', () => {
  it('generateTraceId 返回 UUID v4 格式', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('extractTraceId 从 headers 中提取', () => {
    const headers = { 'x-trace-id': 'test-trace-123' };
    expect(extractTraceId(headers)).toBe('test-trace-123');
  });

  it('extractTraceId headers 无 traceId 返回 undefined', () => {
    expect(extractTraceId({})).toBeUndefined();
  });

  it('injectTraceId 注入到 headers', () => {
    const headers = { 'content-type': 'application/json' };
    const result = injectTraceId(headers, 'trace-456');
    expect(result['x-trace-id']).toBe('trace-456');
    expect(result['content-type']).toBe('application/json');
  });
});
