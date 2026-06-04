export function setupGracefulShutdown(callback: () => Promise<void>, serviceName: string): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[graceful-shutdown] ${serviceName} 收到 ${signal} 信号，开始优雅关闭`);
    try {
      await callback();
      console.log(`[graceful-shutdown] ${serviceName} 优雅关闭完成`);
      process.exit(0);
    } catch (err) {
      console.error(`[graceful-shutdown] ${serviceName} 优雅关闭失败:`, err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
