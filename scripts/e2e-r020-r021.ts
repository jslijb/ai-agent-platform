/**
 * R020+R021 E2E 回归测试
 *
 * 验收标准（docs/3-standards/spec.md）：
 *   - 5 个 query 全通过
 *   - LLM 调用减少 15%+
 *
 * 覆盖：
 *   - R020 知识图谱：5 条核心 query 通过 graphSearch 检索，均能返回图谱结果
 *   - R021 语义缓存：同一批 query 重复执行（精确重复 + 语义改写），
 *     第 2/3 轮命中缓存，LLM 调用数显著减少
 *
 * 运行前提：Docker 容器（Neo4j/embedding/postgres(pgvector)/redis）已启动
 * 用法：npx tsx scripts/e2e-r020-r021.ts
 */
import * as fs from "fs";
import * as path from "path";

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
  console.log("[e2e-r020-r021] 已加载 .env.local");
}

import { graphSearch } from "../src/server/rag/graph/graph-retriever";
import {
  semanticCacheGet,
  semanticCacheSet,
} from "../src/server/llm/semantic-cache";
import { callWithFallback } from "../src/server/llm/router";
import { closeDb } from "../src/server/db/client";

/** 5 条核心 query（对应知识库中覆盖的公司） */
const QUERIES = [
  "五粮液2025年营业收入是多少？",
  "格力电器2025年净利润是多少？",
  "片仔癀2025年毛利率是多少？",
  "中国铁建2025年营业收入是多少？",
  "中国人保2025年营业收入是多少？",
];

/** 语义改写版（测试语义向量命中，而非仅精确匹配） */
const PARAPHRASES = [
  "五粮液2025年全年营收数据",
  "格力电器2025年的净利润情况",
  "片仔癀2025年毛利率水平",
  "中国铁建2025年度营业收入",
  "中国人保2025年营业收入情况",
];

const CACHE_TEMPLATE = "entity-extract";

const EXTRACT_PROMPT = `你是金融知识图谱实体关系抽取器。请从以下文本中提取实体和关系三元组，只输出 JSON 数组，每个元素形如 {"head":"实体","relation":"关系","tail":"实体","description":"一句话描述"}。不要输出任何其他内容。`;

let llmCalls = 0;

async function answered(
  query: string
): Promise<{ content: string; hitType: string | null }> {
  const cached = await semanticCacheGet(CACHE_TEMPLATE, query);
  if (cached.content) {
    return { content: cached.content, hitType: cached.hitType };
  }
  llmCalls++;
  const resp = await callWithFallback([
    { role: "system", content: EXTRACT_PROMPT },
    { role: "user", content: query },
  ]);
  const content = resp.content ?? "";
  await semanticCacheSet(CACHE_TEMPLATE, query, content, resp.model, resp.provider);
  return { content, hitType: null };
}

async function main(): Promise<number> {
  console.log("\n========== R020: 知识图谱检索验证 ==========");
  let graphPass = 0;
  const graphResults: Array<{ query: string; count: number }> = [];
  for (const q of QUERIES) {
    const results = await graphSearch(q, 2);
    const ok = results.length > 0;
    if (ok) graphPass++;
    graphResults.push({ query: q, count: results.length });
    console.log(`  [${ok ? "PASS" : "FAIL"}] ${q} -> 图谱结果 ${results.length} 条`);
  }

  console.log("\n========== R021: 语义缓存 LLM 调用减少验证 ==========");
  // 第 1 轮：冷启动，5 次 LLM 调用（全部 miss）
  const c1 = llmCalls;
  const round1: string[] = [];
  for (const q of QUERIES) {
    const r = await answered(q);
    if (!r.content) {
      console.error(`  [FAIL] ${q} 冷启动未获得答案`);
    }
    round1.push(r.content);
  }
  const round1Calls = llmCalls - c1;

  // 第 2 轮：精确重复，应全部命中缓存（0 次 LLM 调用）
  const c2 = llmCalls;
  let exactHits = 0;
  for (const q of QUERIES) {
    const r = await answered(q);
    if (r.hitType) exactHits++;
  }
  const round2Calls = llmCalls - c2;

  // 第 3 轮：语义改写，应命中语义向量缓存（0 次 LLM 调用）
  const c3 = llmCalls;
  let semanticHits = 0;
  for (const q of PARAPHRASES) {
    const r = await answered(q);
    if (r.hitType === "semantic") semanticHits++;
  }
  const round3Calls = llmCalls - c3;

  // 汇总
  const coldCalls = round1Calls;
  const warmCalls = round2Calls + round3Calls;
  const reduction =
    coldCalls > 0 ? ((coldCalls - warmCalls) / coldCalls) * 100 : 0;

  console.log("\n========== 结果汇总 ==========");
  console.log(`R020 图谱检索: ${graphPass}/${QUERIES.length} 通过`);
  for (const r of graphResults) {
    console.log(`  - ${r.query}: ${r.count} 条`);
  }
  console.log(`R021 语义缓存: 精确命中 ${exactHits}/${QUERIES.length}, 语义命中 ${semanticHits}/${QUERIES.length}`);
  console.log(`LLM 调用数: 冷启动 ${coldCalls} 次, 缓存轮 ${warmCalls} 次`);
  console.log(`LLM 调用减少: ${reduction.toFixed(1)}% (验收要求 ≥15%)`);
  console.log(`答案完整性: 冷启动 ${round1.filter((s) => s.length > 0).length}/${QUERIES.length} 条非空`);

  const allAnswersOk = round1.every((s) => s && s.length > 0);
  const pass = graphPass === QUERIES.length && reduction >= 15 && allAnswersOk;
  console.log(`\n判定: ${pass ? "✅ PASS" : "❌ FAIL"}`);
  return pass ? 0 : 1;
}

main()
  .then(async (code) => {
    await closeDb();
    console.log(`[e2e-r020-r021] 退出码 ${code}`);
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("[e2e-r020-r021] 执行异常:", err);
    try {
      await closeDb();
    } catch {}
    process.exit(1);
  });
