/**
 * 交易数据缓存脚本
 *
 * 功能：预缓存6家公司的日K线历史数据
 * 使用方式：npx tsx scripts/cache-stock-data.ts
 *
 * 注意：data-service 必须在运行状态（http://localhost:8001）
 */

const DATA_SERVICE_URL = process.env.DATA_SERVICE_URL || "http://localhost:8001";

// 需要缓存的公司列表
const companies = [
  { name: "格力电器", code: "sz.000651" },
  { name: "五粮液", code: "sz.000858" },
  { name: "中国长城", code: "sz.000066" },
  { name: "中国能建", code: "sh.601868" },
  { name: "中国人保", code: "sh.601319" },
  { name: "中国铁建", code: "sh.601186" },
];

// 缓存参数
const START_DATE = "2025-06-14";
const END_DATE = "2026-06-14";
const SOURCE = "baostock";
const FREQUENCY = "d";

// 请求间隔（毫秒）
const REQUEST_INTERVAL = 1000;

// 缓存结果统计
interface CacheResult {
  name: string;
  code: string;
  success: boolean;
  fromCache: boolean;
  recordCount: number;
  error: string | null;
  elapsedMs: number;
}

/**
 * 检查 data-service 健康状态
 */
async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${DATA_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.success && data.data?.status === "ok") {
      console.log(`✅ 数据服务连接正常 (状态: ${data.data.status})`);
      return true;
    }
    console.error(`❌ 数据服务状态异常: ${JSON.stringify(data)}`);
    return false;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`❌ 无法连接到数据服务 ${DATA_SERVICE_URL}: ${errMsg}`);
    console.error("请先启动数据服务: conda run -n agent python -m data_service.main");
    return false;
  }
}

/**
 * 缓存单只股票的日K线历史数据
 *
 * data-service 实际接口为 POST /api/market/history
 * 请求体: { source, code, start_date, end_date, frequency }
 */
async function cacheOneStock(company: { name: string; code: string }): Promise<CacheResult> {
  const startTime = Date.now();
  console.log(`[缓存] ${company.name} (${company.code}): 正在获取日K线数据...`);

  try {
    const res = await fetch(`${DATA_SERVICE_URL}/api/market/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: SOURCE,
        code: company.code,
        start_date: START_DATE,
        end_date: END_DATE,
        frequency: FREQUENCY,
      }),
      signal: AbortSignal.timeout(120000),
    });

    const data = await res.json();
    const elapsedMs = Date.now() - startTime;

    if (!data.success) {
      const error = data.error || "未知错误";
      console.log(`[缓存] ${company.name} (${company.code}): ❌ 失败 - ${error} (${(elapsedMs / 1000).toFixed(1)}s)`);
      return { name: company.name, code: company.code, success: false, fromCache: false, recordCount: 0, error, elapsedMs };
    }

    const recordCount = Array.isArray(data.data) ? data.data.length : (data.data ? 1 : 0);
    const fromCache = data.from_cache === true;
    const cacheLabel = fromCache ? "缓存命中" : "新获取";

    console.log(`[缓存] ${company.name} (${company.code}): ✅ 成功 - ${recordCount}条记录 (${cacheLabel}), 耗时: ${(elapsedMs / 1000).toFixed(1)}s`);
    return { name: company.name, code: company.code, success: true, fromCache, recordCount, error: null, elapsedMs };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(`[缓存] ${company.name} (${company.code}): ❌ 异常 - ${errMsg} (${(elapsedMs / 1000).toFixed(1)}s)`);
    return { name: company.name, code: company.code, success: false, fromCache: false, recordCount: 0, error: errMsg, elapsedMs };
  }
}

/**
 * 延时函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 主函数
 */
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║          交易数据缓存脚本 - 6家公司日K线历史数据                  ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log(`数据服务: ${DATA_SERVICE_URL}`);
  console.log(`数据源: ${SOURCE}`);
  console.log(`时间范围: ${START_DATE} ~ ${END_DATE}`);
  console.log(`数据类型: 日K线历史行情`);
  console.log(`公司数量: ${companies.length}`);
  console.log("");

  // 1. 检查 data-service 健康状态
  console.log("===== 1. 检查数据服务状态 =====");
  const healthy = await checkHealth();
  if (!healthy) {
    process.exit(1);
  }
  console.log("");

  // 2. 逐个调用 data-service API 缓存数据
  console.log("===== 2. 开始缓存日K线数据 =====");
  const results: CacheResult[] = [];

  for (let i = 0; i < companies.length; i++) {
    const result = await cacheOneStock(companies[i]);
    results.push(result);

    // 请求间隔1秒，避免过快（最后一个不需要等待）
    if (i < companies.length - 1) {
      await sleep(REQUEST_INTERVAL);
    }
  }

  // 3. 汇总统计
  console.log("");
  console.log(`${"=".repeat(60)}`);
  console.log("缓存结果汇总:");
  console.log(`${"=".repeat(60)}`);

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const cacheHitCount = results.filter((r) => r.fromCache).length;
  const totalRecords = results.reduce((sum, r) => sum + r.recordCount, 0);
  const totalMs = results.reduce((sum, r) => sum + r.elapsedMs, 0);

  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const cache = r.fromCache ? "[缓存命中]" : "[新获取]";
    console.log(`  ${status} ${r.name} (${r.code}): ${r.recordCount}条 ${cache} (${(r.elapsedMs / 1000).toFixed(1)}s)`);
    if (r.error) {
      console.log(`     错误: ${r.error}`);
    }
  }

  console.log("");
  console.log(`成功: ${successCount}/${results.length}, 失败: ${failCount}/${results.length}`);
  console.log(`缓存命中: ${cacheHitCount}/${results.length}, 总数据量: ${totalRecords}条, 总耗时: ${(totalMs / 1000).toFixed(1)}s`);

  // 4. 失败项详情
  if (failCount > 0) {
    console.log("");
    console.log("--- 失败项详情 ---");
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  ❌ ${r.name} (${r.code}): ${r.error}`);
    }
    console.log("");
    console.log(`⚠️  有 ${failCount} 项缓存失败，请检查数据服务和网络连接后重试`);
    console.log(`重试命令: npx tsx scripts/cache-stock-data.ts`);
  } else {
    console.log("");
    console.log("✅ 所有公司日K线数据缓存成功！");
  }
}

main().catch((err) => {
  console.error("缓存脚本执行失败:", err);
  process.exit(1);
});
