const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

interface PrefetchItem {
  name: string;
  endpoint: string;
  body: Record<string, unknown>;
  description: string;
}

const prefetchItems: PrefetchItem[] = [
  {
    name: "getStockHistory-招商银行",
    endpoint: "/api/market/history",
    body: { source: "baostock", code: "sh.600036", start_date: "2024-06-01", end_date: "2026-05-28", frequency: "d" },
    description: "招商银行1年日K线",
  },
  {
    name: "getStockHistory-五粮液",
    endpoint: "/api/market/history",
    body: { source: "baostock", code: "sz.000858", start_date: "2024-06-01", end_date: "2026-05-28", frequency: "d" },
    description: "五粮液1年日K线（用于相关系数计算）",
  },
  {
    name: "getStockRealtime-贵州茅台",
    endpoint: "/api/market/realtime",
    body: { source: "efinance", code: "600519" },
    description: "贵州茅台实时行情",
  },
  {
    name: "getStockFinancial-贵州茅台",
    endpoint: "/api/market/financial",
    body: { source: "efinance", code: "600519" },
    description: "贵州茅台财务数据",
  },
  {
    name: "getFinancialReport-贵州茅台",
    endpoint: "/api/market/financial_report",
    body: { code: "600519", report_type: "income" },
    description: "贵州茅台利润表",
  },
];

async function prefetchOne(item: PrefetchItem): Promise<{ name: string; success: boolean; fromCache: boolean; recordCount: number; error: string | null; elapsedMs: number }> {
  const startTime = Date.now();
  console.log(`[预获取] ${item.name}: ${item.description}...`);

  try {
    const res = await fetch(`${DATA_SERVICE_URL}${item.endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.body),
      signal: AbortSignal.timeout(60000),
    });

    const data = await res.json();
    const elapsedMs = Date.now() - startTime;

    if (!data.success) {
      console.log(`[预获取] ${item.name}: ❌ 失败 - ${data.error || "未知错误"} (${(elapsedMs / 1000).toFixed(1)}s)`);
      return { name: item.name, success: false, fromCache: false, recordCount: 0, error: data.error || "未知错误", elapsedMs };
    }

    const recordCount = Array.isArray(data.data) ? data.data.length : (data.data ? 1 : 0);
    const fromCache = data.from_cache === true;
    const cacheLabel = fromCache ? "缓存" : "网络";

    console.log(`[预获取] ${item.name}: ✅ 成功 - ${recordCount}条记录 (${cacheLabel}), 耗时: ${(elapsedMs / 1000).toFixed(1)}s`);
    return { name: item.name, success: true, fromCache, recordCount, error: null, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(`[预获取] ${item.name}: ❌ 异常 - ${errMsg} (${(elapsedMs / 1000).toFixed(1)}s)`);
    return { name: item.name, success: false, fromCache: false, recordCount: 0, error: errMsg, elapsedMs };
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║          数据预获取脚本 - 缓存测试所需数据                       ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`数据服务: ${DATA_SERVICE_URL}`);
  console.log(`待获取项: ${prefetchItems.length}`);
  console.log("");

  const healthCheck = await fetch(`${DATA_SERVICE_URL}/docs`).catch(() => null);
  if (!healthCheck) {
    console.error(`❌ 无法连接到数据服务 ${DATA_SERVICE_URL}`);
    console.error(`请先启动数据服务: conda run -n agent python -m data_service.main`);
    process.exit(1);
  }
  console.log(`✅ 数据服务连接正常\n`);

  const results = [];
  for (const item of prefetchItems) {
    const result = await prefetchOne(item);
    results.push(result);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("预获取结果汇总:");
  console.log(`${"=".repeat(60)}`);

  const success = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalMs = results.reduce((sum, r) => sum + r.elapsedMs, 0);

  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const cache = r.fromCache ? "[缓存]" : "[网络]";
    console.log(`  ${status} ${r.name}: ${r.recordCount}条 ${cache} (${(r.elapsedMs / 1000).toFixed(1)}s)`);
    if (r.error) {
      console.log(`     错误: ${r.error}`);
    }
  }

  console.log(`\n成功: ${success}/${results.length}, 失败: ${failed}/${results.length}, 总耗时: ${(totalMs / 1000).toFixed(1)}s`);

  if (failed > 0) {
    console.log(`\n⚠️  有 ${failed} 项预获取失败，请检查数据服务和网络连接后重试`);
    console.log(`重试命令: npx tsx scripts/prefetch-data.ts`);
  } else {
    console.log(`\n✅ 所有数据预获取成功！可以运行测试脚本了`);
    console.log(`测试命令: npx tsx scripts/test-21-tools.ts`);
  }
}

main().catch((err) => {
  console.error("预获取脚本执行失败:", err);
  process.exit(1);
});
