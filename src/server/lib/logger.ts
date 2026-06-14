/**
 * 统一日志模块
 * 自动给 console.log/warn/error 添加时间戳和日志级别
 * 通过 Next.js instrumentation 自动启用
 */

const LOG_COLORS = {
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
  reset: "\x1b[0m",
};

/** 格式化时间戳 */
function timestamp(): string {
  return new Date().toISOString();
}

/** 判断是否在 Docker/生产环境 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.DOCKER_ENV;
}

/**
 * 安装日志拦截器
 * 替换 console.log/warn/error，自动添加时间戳
 * 保留原始参数，不影响日志内容
 */
export function installLogInterceptor(): void {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const prefix = `${timestamp()} [INFO] `;
    if (isProduction()) {
      originalLog(prefix, ...args);
    } else {
      originalLog(`${LOG_COLORS.info}${prefix}${LOG_COLORS.reset}`, ...args);
    }
  };

  console.warn = (...args: unknown[]) => {
    const prefix = `${timestamp()} [WARN] `;
    if (isProduction()) {
      originalWarn(prefix, ...args);
    } else {
      originalWarn(`${LOG_COLORS.warn}${prefix}${LOG_COLORS.reset}`, ...args);
    }
  };

  console.error = (...args: unknown[]) => {
    const prefix = `${timestamp()} [ERROR] `;
    if (isProduction()) {
      originalError(prefix, ...args);
    } else {
      originalError(`${LOG_COLORS.error}${prefix}${LOG_COLORS.reset}`, ...args);
    }
  };
}

/**
 * 结构化日志输出
 * 用于需要 JSON 格式日志的场景
 */
export function structuredLog(
  level: "info" | "warn" | "error",
  module: string,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry = {
    timestamp: timestamp(),
    level,
    module,
    message,
    ...(data || {}),
  };

  const output = JSON.stringify(entry);
  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}
