/**
 * R001 路由层端到端测试（spec 阶段 4.3 前置验证）
 *
 * 目的：验证 L1/L3/L4 全部 55 条查询能正确路由到 SQL 路径并返回数据
 *       不依赖 LLM，仅测 routeQuery 函数 + PostgreSQL 数据
 *
 * 运行：npx tsx scripts/test-r001-routing.ts
 *
 * 产出：tests/reports/evaluation/r001-routing-test.json
 */
import * as fs from "fs";
import * as path from "path";

// 加载 .env.local
const ENV_LOCAL_PATH = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(ENV_LOCAL_PATH)) {
  const envContent = fs.readFileSync(ENV_LOCAL_PATH, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

import { routeQuery } from "../src/server/rag/query/query-router";
import { closeDb } from "../src/server/db/client";

const EVAL_DATA_PATH = path.resolve(__dirname, "..", "tests/reports/evaluation/ragas-eval-data.json");
const REPORT_PATH = path.resolve(__dirname, "..", "tests/reports/evaluation/r001-routing-test.json");
const TARGET_CATEGORIES = ["L1-事实提取", "L3-计算推理", "L4-趋势分析"];

interface EvalItem {
  id: string;
  question: string;
  answer?: string;
  category: string;
  canAnswer?: boolean;
}

interface RouteTestResult {
  id: string;
  category: string;
  question: string;
  expectedAnswer?: string;
  route: string;
  intent: string;
  companyMatched: string | null;
  indicatorsMatched: string[];
  sqlRowCount: number;
  sqlSample: unknown;
  routeError: string | null;
}

async function main() {
  console.log("[R001-routing-test] 开始路由层端到端测试");
  console.log("[R001-routing-test] 加载评估数据:", EVAL_DATA_PATH);

  const rawData = JSON.parse(fs.readFileSync(EVAL_DATA_PATH, "utf-8"));
  const items: EvalItem[] = (rawData.items || []).filter((x: EvalItem) =>
    TARGET_CATEGORIES.includes(x.category)
  );
  console.log("[R001-routing-test] 目标样本数:", items.length);

  const results: RouteTestResult[] = [];
  const stats = {
    total: 0,
    sql_standard: 0,
    sql_raw_tables: 0,
    vector: 0,
    routeError: 0,
    byCategory: {} as Record<string, { total: number; sql_standard: number; sql_raw_tables: number; vector: number; error: number }>,
  };

  for (const item of items) {
    const result: RouteTestResult = {
      id: item.id,
      category: item.category,
      question: item.question,
      expectedAnswer: item.answer,
      route: "",
      intent: "",
      companyMatched: null,
      indicatorsMatched: [],
      sqlRowCount: 0,
      sqlSample: null,
      routeError: null,
    };

    try {
      const routeResult = await routeQuery(item.question);
      result.route = routeResult.route;
      result.intent = routeResult.intent;
      result.companyMatched = routeResult.company
        ? `${routeResult.company.stockNameShort}(${routeResult.company.stockCode})`
        : null;
      result.indicatorsMatched = routeResult.indicators.map((i) => `${i.standardName}@${i.standardTable}`);
      if (routeResult.sqlResult) {
        result.sqlRowCount = routeResult.sqlResult.length;
        result.sqlSample = routeResult.sqlResult[0] ?? null;
      }
    } catch (e) {
      result.routeError = e instanceof Error ? e.message : String(e);
    }

    results.push(result);
    stats.total++;
    if (!stats.byCategory[item.category]) {
      stats.byCategory[item.category] = { total: 0, sql_standard: 0, sql_raw_tables: 0, vector: 0, error: 0 };
    }
    const catStat = stats.byCategory[item.category];
    catStat.total++;
    if (result.routeError) {
      stats.routeError++;
      catStat.error++;
    } else if (result.route === "sql_standard") {
      stats.sql_standard++;
      catStat.sql_standard++;
    } else if (result.route === "sql_raw_tables") {
      stats.sql_raw_tables++;
      catStat.sql_raw_tables++;
    } else if (result.route === "vector") {
      stats.vector++;
      catStat.vector++;
    }

    console.log(
      `[${item.id}] ${item.category} | route=${result.route} | company=${result.companyMatched} | indicators=${result.indicatorsMatched.join(",")} | rows=${result.sqlRowCount}${result.routeError ? " | ERROR=" + result.routeError : ""}`
    );
  }

  // 命中率统计
  const sqlHitRate = (stats.sql_standard + stats.sql_raw_tables) / stats.total;
  console.log("\n========== R001 路由层端到端测试统计 ==========");
  console.log(`总样本: ${stats.total}`);
  console.log(`sql_standard 命中: ${stats.sql_standard} (${((stats.sql_standard / stats.total) * 100).toFixed(1)}%)`);
  console.log(`sql_raw_tables 命中: ${stats.sql_raw_tables} (${((stats.sql_raw_tables / stats.total) * 100).toFixed(1)}%)`);
  console.log(`vector fallback: ${stats.vector} (${((stats.vector / stats.total) * 100).toFixed(1)}%)`);
  console.log(`路由错误: ${stats.routeError}`);
  console.log(`SQL 总命中率: ${(sqlHitRate * 100).toFixed(1)}% (目标 ≥ 85%)`);
  console.log("\n按分类统计:");
  for (const [cat, s] of Object.entries(stats.byCategory)) {
    const hit = s.sql_standard + s.sql_raw_tables;
    console.log(`  ${cat}: total=${s.total} sql_standard=${s.sql_standard} sql_raw=${s.sql_raw_tables} vector=${s.vector} error=${s.error} 命中率=${((hit / s.total) * 100).toFixed(1)}%`);
  }

  // 保存报告
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        targetCategories: TARGET_CATEGORIES,
        stats,
        sqlHitRate,
        results,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log("\n[R001-routing-test] 报告已保存:", REPORT_PATH);

  // 验收：SQL 命中率 ≥ 85%
  const acceptance = sqlHitRate >= 0.85;
  console.log(`\n验收: SQL 命中率 ≥ 85% → ${acceptance ? "✅ PASS" : "❌ FAIL"}`);

  await closeDb();
  process.exit(acceptance ? 0 : 1);
}

main().catch((e) => {
  console.error("[R001-routing-test] 致命错误:", e);
  process.exit(1);
});
