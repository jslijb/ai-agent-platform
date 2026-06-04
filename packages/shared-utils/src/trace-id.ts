import { randomUUID } from 'crypto';

export function generateTraceId(): string {
  return randomUUID();
}

export function extractTraceId(headers: Record<string, string | string[] | undefined>): string | undefined {
  return typeof headers['x-trace-id'] === 'string' ? headers['x-trace-id'] : undefined;
}

export function injectTraceId(headers: Record<string, string>, traceId: string): Record<string, string> {
  return { ...headers, 'x-trace-id': traceId };
}
