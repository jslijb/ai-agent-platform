type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  service: string;
  level: LogLevel;
  timestamp: string;
  traceId?: string;
  message: string;
  data?: Record<string, unknown>;
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function createLogger(serviceName: string) {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, traceId?: string) => {
    const entry: LogEntry = {
      service: serviceName,
      level,
      timestamp: new Date().toISOString(),
      traceId,
      message,
      ...(data && { data }),
    };
    const output = formatLog(entry);
    switch (level) {
      case 'error': console.error(output); break;
      case 'warn': console.warn(output); break;
      default: console.log(output);
    }
  };

  return {
    debug: (msg: string, data?: Record<string, unknown>, traceId?: string) => log('debug', msg, data, traceId),
    info: (msg: string, data?: Record<string, unknown>, traceId?: string) => log('info', msg, data, traceId),
    warn: (msg: string, data?: Record<string, unknown>, traceId?: string) => log('warn', msg, data, traceId),
    error: (msg: string, data?: Record<string, unknown>, traceId?: string) => log('error', msg, data, traceId),
  };
}
