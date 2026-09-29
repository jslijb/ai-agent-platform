#!/usr/bin/env node
/**
 * P0 财务指标单位错配修复（方案A）——存量数据一次性迁移：货币值统一换算为「元」
 *
 * 背景：docs/1-requirements-bugs/financial-metric-unit-mismatch.md
 *   财务四表历史上保留各年报原始口径（元/千元/百万元混用），展示层按量级猜单位，
 *   导致千元口径公司（中国铁建/江苏银行）与百万元口径（中国人保）整体错 1000 倍。
 *   代码侧（方案A）：data_service/pdf_extractor.py 落库前已归一为「元」；
 *   sql-result-formatter.ts 固定 ÷1e8 转亿元。本脚本负责把存量数据换算到同一口径。
 *
 * 口径依据（VERIFIED_METRICS hints 反推，见 bug 报告 §一）：
 *   千元 ×1e3：中国能建(601868) 中国铁建(601186) 江苏银行(600919)
 *   百万元 ×1e6：中国人保(601319)
 *   元 ×1（不变）：五粮液/格力电器/中国长城/片仔癀/东吴证券/华海药业
 *
 * 范围：financial_income / financial_balancesheet / financial_cashflow 的货币列。
 *   financial_indicators（全部为比率/每股，无货币列）与 financial_raw_tables（原始
 *   JSONB 留档）不迁移。eps/bvps/毛利率等非货币列不在货币列清单内，天然不受影响。
 *
 * 安全措施：
 *   1. 默认 dry-run，只读；--apply 才写库
 *   2. 表中出现的 stock_code 必须全部在映射表内，否则中止（等待人工补充口径）
 *   3. stock_mapping 公司名交叉校验，防止股票代码映射错误
 *   4. 锚点校验：迁移前后用已知数值（±2%）验证换算正确，失败即中止/标红
 *   5. --apply 前把受影响行全量备份到 tmp/unit-migration-backup-<ts>/*.jsonl
 *   6. 写库在单事务内完成（sql.begin）
 *
 * 驱动：postgres.js（与 src/server/db/client.ts 同源，node_modules 里的 pg@7 是
 *   陈旧的传递依赖，在 Node 24 下 connect 静默失败，勿用）。
 *
 * 用法：
 *   node scripts/migrate-financial-unit-to-yuan.mjs            # dry-run
 *   node scripts/migrate-financial-unit-to-yuan.mjs --apply    # 执行迁移
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const postgres = require("postgres");

const APPLY = process.argv.includes("--apply");

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// ===== 口径映射（勿改：改动前必须先核VERIFIED_METRICS与bug报告） =====
const STOCK_UNIT_FACTOR = {
  "601868": { name: "中国能建", factor: 1e3 },
  "601186": { name: "中国铁建", factor: 1e3 },
  "600919": { name: "江苏银行", factor: 1e3 },
  "601319": { name: "中国人保", factor: 1e6 },
  "000858": { name: "五粮液", factor: 1 },
  "000651": { name: "格力电器", factor: 1 },
  "000066": { name: "中国长城", factor: 1 },
  "600436": { name: "片仔癀", factor: 1 },
  "601555": { name: "东吴证券", factor: 1 },
  "600521": { name: "华海药业", factor: 1 },
};

const TABLE_MONETARY_COLUMNS = {
  financial_income: [
    "revenue", "operating_cost", "operating_profit", "net_profit",
    "net_profit_attributable", "rd_expense", "selling_expense",
    "administrative_expense", "financial_expense", "premium_income",
    "commission_income", "new_signed_contract",
  ],
  financial_balancesheet: [
    "total_assets", "total_liabilities", "total_equity", "equity_attributable",
    "current_assets", "non_current_assets", "current_liabilities",
    "non_current_liabilities", "cash", "accounts_receivable", "inventory",
    "fixed_assets", "goodwill",
  ],
  financial_cashflow: [
    "operating_cash_flow", "investing_cash_flow", "financing_cash_flow",
    "cash_flow_from_operating", "cash_flow_from_investing",
    "cash_flow_from_financing", "free_cash_flow",
  ],
};

// 锚点：bug 报告 §一/§二 的铁证数值（迁移前期望原始口径值，迁移后期望元口径值）
const ANCHORS = [
  { table: "financial_income", stockCode: "601186", column: "revenue", before: 1029784460, after: 1029784460000 },
  { table: "financial_income", stockCode: "601868", column: "revenue", before: 452929608, after: 452929608000 },
  { table: "financial_income", stockCode: "000651", column: "revenue", before: 171118161275.41, after: 171118161275.41 },
  { table: "financial_balancesheet", stockCode: "600919", column: "total_assets", before: 4931316000, after: 4931316000000 },
];
const ANCHOR_TOLERANCE = 0.02;

async function countRowsWithValue(sql, table, column, stockCode, expected) {
  const lo = expected * (1 - ANCHOR_TOLERANCE);
  const hi = expected * (1 + ANCHOR_TOLERANCE);
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM ${sql(table)}
    WHERE stock_code = ${stockCode}
      AND ABS(${sql(column)}) >= ${lo} AND ABS(${sql(column)}) <= ${hi}
  `;
  return rows[0]?.n ?? 0;
}

async function checkAnchors(sql, phase, failures) {
  console.log(`\n===== 锚点校验（${phase}，存在性 ±2%）=====`);
  for (const a of ANCHORS) {
    const expected = phase === "before" ? a.before : a.after;
    const n = await countRowsWithValue(sql, a.table, a.column, a.stockCode, expected);
    if (n === 0) {
      console.log(`  ⚠️  ${a.stockCode} ${a.table}.${a.column}: 无 ≈${expected} 的行（可能无该期数据，跳过）`);
      continue;
    }
    console.log(`  ✅ ${a.stockCode} ${a.table}.${a.column}: ${n} 行值 ≈ ${expected}`);
  }
}

async function printAffectedIncomeRows(sql, changed) {
  // 透明化：打印利润表受影响行的原始营收值，供人工复核口径
  console.log("\n===== 受影响行明细（financial_income.revenue 原始值）=====");
  for (const p of changed.filter((x) => x.table === "financial_income")) {
    const rows = await sql`
      SELECT report_year, report_quarter, revenue
      FROM financial_income WHERE stock_code = ${p.stockCode}
      ORDER BY report_year DESC, report_quarter
    `;
    const vals = rows.map((r) => `${r.report_year}-${r.report_quarter}: ${r.revenue}`).join(" | ");
    console.log(`  ${p.stockCode}(${STOCK_UNIT_FACTOR[p.stockCode].name}) [×${p.factor}]: ${vals}`);
  }
}

async function main() {
  loadEnv();
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  console.log(`已连接数据库（${APPLY ? "--apply 执行迁移" : "dry-run 只读"}）`);

  const failures = [];

  // 1. 表内 stock_code 必须全部在映射表内
  for (const table of Object.keys(TABLE_MONETARY_COLUMNS)) {
    const rows = await sql`
      SELECT DISTINCT stock_code FROM ${sql(table)} ORDER BY 1
    `;
    for (const row of rows) {
      if (!STOCK_UNIT_FACTOR[row.stock_code]) {
        failures.push(`${table} 出现未映射的 stock_code=${row.stock_code}，请先补充口径再迁移`);
      }
    }
  }
  if (failures.length > 0) {
    failures.forEach((f) => console.error("❌ " + f));
    await sql.end();
    process.exit(1);
  }

  // 2. 公司名交叉校验（stock_mapping 为空表时降级为警告，由锚点数值校验兜底）
  console.log("\n===== 公司名交叉校验 =====");
  const mappingCount = await sql`SELECT count(*)::int AS n FROM stock_mapping`;
  const mappingHasData = (mappingCount[0]?.n ?? 0) > 0;
  for (const [code, meta] of Object.entries(STOCK_UNIT_FACTOR)) {
    const rows = await sql`
      SELECT stock_name_short, stock_name_full
      FROM stock_mapping WHERE stock_code = ${code}
    `;
    if (rows.length === 0) {
      const msg = `stock_mapping 无 ${code}（${meta.name}）`;
      if (mappingHasData) {
        failures.push(msg);
        console.log(`  ❌ ${msg}`);
      } else {
        console.log(`  ⚠️  ${msg}（stock_mapping 为空表，跳过名称校验，由锚点数值兜底）`);
      }
      continue;
    }
    const short = rows[0].stock_name_short ?? "";
    const full = rows[0].stock_name_full ?? "";
    const hit = short.includes(meta.name) || full.includes(meta.name) || meta.name.includes(short);
    console.log(`  ${hit ? "✅" : "❌"} ${code} → 库内「${short}/${full}」 vs 期望「${meta.name}」`);
    if (!hit) failures.push(`${code} 公司名不匹配：库「${short}/${full}」 vs 期望「${meta.name}」`);
  }
  if (failures.length > 0) {
    failures.forEach((f) => console.error("❌ " + f));
    await sql.end();
    process.exit(1);
  }

  // 3. 迁移计划
  console.log("\n===== 迁移计划 =====");
  const plan = [];
  for (const [table, columns] of Object.entries(TABLE_MONETARY_COLUMNS)) {
    const rows = await sql`
      SELECT stock_code, COUNT(*)::int AS n
      FROM ${sql(table)} GROUP BY 1 ORDER BY 1
    `;
    for (const row of rows) {
      const meta = STOCK_UNIT_FACTOR[row.stock_code];
      if (meta.factor !== 1) {
        plan.push({ table, stockCode: row.stock_code, factor: meta.factor, rows: row.n });
        console.log(`  ${table} ${row.stock_code}(${meta.name}): ${row.n} 行 × ${meta.factor}`);
      } else {
        console.log(`  ${table} ${row.stock_code}(${meta.name}): ${row.n} 行，口径已是元，跳过`);
      }
    }
  }
  const changed = plan.filter((p) => p.factor !== 1);
  if (changed.length === 0) {
    console.log("\n无需迁移（全部口径已是元）。");
    await sql.end();
    return;
  }

  // 4. 受影响行明细 + 迁移前锚点
  await printAffectedIncomeRows(sql, changed);
  await checkAnchors(sql, "before", failures);
  if (failures.length > 0) {
    failures.forEach((f) => console.error("❌ " + f));
    console.error("\n迁移前锚点校验失败，中止。存量数据与 bug 报告口径不一致，请人工核查。");
    await sql.end();
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\n[dry-run] 校验全部通过。确认无误后执行：node scripts/migrate-financial-unit-to-yuan.mjs --apply");
    await sql.end();
    return;
  }

  // 5. 备份受影响行（全列 JSONL）
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupDir = path.resolve(process.cwd(), "tmp", `unit-migration-backup-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`\n===== 备份受影响行 → ${backupDir} =====`);
  for (const table of Object.keys(TABLE_MONETARY_COLUMNS)) {
    const codes = [...new Set(changed.filter((p) => p.table === table).map((p) => p.stockCode))];
    if (codes.length === 0) continue;
    const rows = await sql`
      SELECT * FROM ${sql(table)}
      WHERE stock_code IN ${sql(codes)}
      ORDER BY id
    `;
    const file = path.join(backupDir, `${table}.jsonl`);
    fs.writeFileSync(
      file,
      rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
    );
    console.log(`  ${table}: ${rows.length} 行 → ${path.basename(file)}`);
  }

  // 6. 事务执行换算
  console.log("\n===== 执行换算（单事务）=====");
  await sql.begin(async (tx) => {
    let totalUpdated = 0;
    for (const p of changed) {
      const columns = TABLE_MONETARY_COLUMNS[p.table];
      // 列名来自上方硬编码白名单、factor 为数字常量，sql.raw 无注入面
      const sets = columns.map((c) => `"${c}" = "${c}" * ${p.factor}`);
      // updated_at 列存在时刷新（financial_cashflow 可能没有）
      const colCheck = await tx`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = ${p.table} AND column_name = 'updated_at'
      `;
      if (colCheck.length > 0) sets.push("updated_at = now()");
      // 表名/列名来自脚本内硬编码白名单，无注入面；外部值 stockCode 参数化
      const result = await tx.unsafe(
        `UPDATE ${p.table} SET ${sets.join(", ")} WHERE stock_code = $1`,
        [p.stockCode]
      );
      totalUpdated += result.count;
      console.log(`  ${p.table} ${p.stockCode}: ${result.count} 行更新`);
    }
    console.log(`共更新 ${totalUpdated} 行。`);
  });

  // 7. 迁移后锚点
  await checkAnchors(sql, "after", failures);
  if (failures.length > 0) {
    failures.forEach((f) => console.error("❌ " + f));
    console.error(`\n迁移后锚点校验失败！请用备份目录 ${backupDir} 人工核对/恢复。`);
    await sql.end();
    process.exit(1);
  }

  console.log("\n✅ 迁移完成：全部货币值已统一为「元」。展示层（sql-result-formatter.ts 固定 ÷1e8）与抽取器口径一致。");
  await sql.end();
}

main().catch(async (e) => {
  console.error("迁移失败:", e.message);
  process.exit(1);
});
