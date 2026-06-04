export class ServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly traceId?: string;

  constructor(options: {
    message: string;
    statusCode?: number;
    code?: string;
    retryable?: boolean;
    traceId?: string;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ServiceError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.retryable = options.retryable ?? false;
    this.traceId = options.traceId;
  }

  static serviceUnavailable(serviceName: string, traceId?: string): ServiceError {
    return new ServiceError({
      message: `${serviceName}服务暂时不可用`,
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      traceId,
    });
  }

  static timeout(serviceName: string, traceId?: string): ServiceError {
    return new ServiceError({
      message: `${serviceName}服务请求超时`,
      statusCode: 504,
      code: 'TIMEOUT',
      retryable: true,
      traceId,
    });
  }

  static badRequest(message: string, traceId?: string): ServiceError {
    return new ServiceError({
      message,
      statusCode: 400,
      code: 'BAD_REQUEST',
      retryable: false,
      traceId,
    });
  }
}
