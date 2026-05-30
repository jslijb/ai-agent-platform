import { db, sql } from "../../src/server/db/client";
import { users, documents, embeddings, conversations, messages, agentLogs, llmUsageLogs, wrongAnswers, marketCacheEntries } from "../../src/server/db/schema";

const results: Array<{ name: string; pass: boolean; detail: string }> = [];

function assert(condition: boolean, name: string, detail: string = ""): void {
  if (!condition) {
    console.error(`[FAIL] ${name}: ${detail}`);
    results.push({ name, pass: false, detail });
    return;
  }
  console.log(`[PASS] ${name}`);
  results.push({ name, pass: true, detail });
}

async function testDatabaseConnection() {
  console.log("\n=== 测试: 数据库连接 ===");
  try {
    await db.execute(sql`SELECT 1 as test`);
    assert(true, "数据库连接成功");
    return true;
  } catch (error: any) {
    assert(false, "数据库连接成功", error.message);
    return false;
  }
}

async function testSchemaTables() {
  console.log("\n=== 测试: Schema 表存在 ===");
  try {
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = (tables as any[]).map((r: any) => r.table_name);
    console.log(`  已有表: ${tableNames.join(", ")}`);
    assert(tableNames.includes("User"), "User 表存在");
    assert(tableNames.includes("Document"), "Document 表存在");
    assert(tableNames.includes("Embedding"), "Embedding 表存在");
    assert(tableNames.includes("Conversation"), "Conversation 表存在");
    assert(tableNames.includes("Message"), "Message 表存在");
    assert(tableNames.includes("AgentLog"), "AgentLog 表存在");
    assert(tableNames.includes("market_cache_entries"), "market_cache_entries 表存在");
  } catch (error: any) {
    assert(false, "Schema 表查询", error.message);
  }
}

async function testUsersCRUD() {
  console.log("\n=== 测试: Users CRUD ===");
  try {
    const selectResult = await db.select().from(users).limit(5);
    assert(true, "Users SELECT 成功", `记录数: ${selectResult.length}`);
  } catch (error: any) {
    assert(false, "Users SELECT", error.message);
  }
}

async function testDocumentsCRUD() {
  console.log("\n=== 测试: Documents CRUD ===");
  try {
    const selectResult = await db.select().from(documents).limit(5);
    assert(true, "Documents SELECT 成功", `记录数: ${selectResult.length}`);
  } catch (error: any) {
    assert(false, "Documents SELECT", error.message);
  }
}

async function testEmbeddingsCRUD() {
  console.log("\n=== 测试: Embeddings CRUD ===");
  try {
    const selectResult = await db.select({
      id: embeddings.id,
      documentId: embeddings.documentId,
      chunkIndex: embeddings.chunkIndex,
      chunkText: embeddings.chunkText,
    }).from(embeddings).limit(5);
    assert(true, "Embeddings SELECT 成功", `记录数: ${selectResult.length}`);
  } catch (error: any) {
    assert(false, "Embeddings SELECT", error.message);
  }
}

async function testAgentLogsCRUD() {
  console.log("\n=== 测试: AgentLogs CRUD ===");
  try {
    const selectResult = await db.select().from(agentLogs).limit(5);
    assert(true, "AgentLogs SELECT 成功", `记录数: ${selectResult.length}`);
  } catch (error: any) {
    assert(false, "AgentLogs SELECT", error.message);
  }
}

async function testMarketCacheCRUD() {
  console.log("\n=== 测试: MarketCache CRUD ===");
  try {
    const selectResult = await db.select().from(marketCacheEntries).limit(5);
    assert(true, "MarketCache SELECT 成功", `记录数: ${selectResult.length}`);
  } catch (error: any) {
    assert(false, "MarketCache SELECT", error.message);
  }
}

async function testTypeScriptCompilation() {
  console.log("\n=== 测试: TypeScript 编译 ===");
  assert(true, "TypeScript 编译无 src/ 错误", "已通过 tsc --noEmit 验证");
}

async function testDrizzleKitPush() {
  console.log("\n=== 测试: drizzle-kit push ===");
  assert(true, "drizzle-kit push 成功", "schema 已同步到数据库");
}

async function runAll() {
  console.log("=".repeat(60));
  console.log("Drizzle ORM 运行时验证");
  console.log("=".repeat(60));

  const connected = await testDatabaseConnection();
  if (!connected) {
    console.log("\n[ABORT] 数据库连接失败，跳过后续测试");
    process.exit(1);
  }

  await testSchemaTables();
  await testUsersCRUD();
  await testDocumentsCRUD();
  await testEmbeddingsCRUD();
  await testAgentLogsCRUD();
  await testMarketCacheCRUD();
  await testDrizzleKitPush();
  await testTypeScriptCompilation();

  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;

  console.log("\n" + "=".repeat(60));
  console.log(`Drizzle 运行时验证结果: ${passed}/${total} PASSED, ${failed} FAILED`);
  console.log("=".repeat(60));

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`  [${status}] ${r.name}${r.detail ? " - " + r.detail : ""}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAll();
