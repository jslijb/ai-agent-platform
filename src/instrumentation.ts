/**
 * Next.js Instrumentation
 * 在服务启动时自动安装日志拦截器
 * Next.js 14+ 原生支持，next.config.js 需配置 instrumentationHook: true
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installLogInterceptor } = await import("@/server/lib/logger");
    installLogInterceptor();
    console.log("[instrumentation] 日志拦截器已安装，所有日志将自动添加时间戳");
  }
}
