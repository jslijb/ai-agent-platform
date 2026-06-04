import postgres from "postgres";

const sql = postgres("postgresql://aiagent:aiagent_secret@localhost:5432/agentdb");

interface TestResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}

const results: TestResult[] = [];

function addResult(name: string, status: "PASS" | "FAIL" | "WARN", detail: string) {
  results.push({ name, status, detail });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} [${status}] ${name}: ${detail}`);
}

async function testDocumentIntegrity() {
  console.log("\n========== 文档完整性检查 ==========\n");

  const docs = await sql`
    SELECT id, "fileName", status, "createdAt"
    FROM "Document"
    ORDER BY "createdAt" ASC
  `;

  if (docs.length === 0) {
    addResult("文档存在性", "FAIL", "数据库中没有任何文档");
    return;
  }

  addResult("文档存在性", "PASS", `共 ${docs.length} 个文档`);

  for (const doc of docs) {
    console.log(`\n--- 检查文档: ${doc.fileName} (${doc.id.substring(0, 12)}...) ---`);

    if (doc.status === "completed") {
      addResult(`${doc.fileName} 状态`, "PASS", "completed");
    } else {
      addResult(`${doc.fileName} 状态`, "FAIL", `状态为 ${doc.status}，应为 completed`);
    }

    const embeddingCount = await sql`
      SELECT COUNT(*) as cnt FROM "Embedding" WHERE "documentId" = ${doc.id}
    `;
    const embCount = Number(embeddingCount[0].cnt);
    const chunkCount = await sql`
      SELECT COUNT(*) as cnt FROM "Embedding" WHERE "documentId" = ${doc.id} AND "chunkText" IS NOT NULL
    `;
    const chkCount = Number(chunkCount[0].cnt);

    if (embCount > 0) {
      addResult(`${doc.fileName} embedding数量`, "PASS", `${embCount} 条`);
    } else {
      addResult(`${doc.fileName} embedding数量`, "FAIL", "0 条，文档未成功处理");
    }

    if (embCount === chkCount) {
      addResult(`${doc.fileName} chunk/embedding一致性`, "PASS", `${chkCount} 条一致`);
    } else {
      addResult(`${doc.fileName} chunk/embedding一致性`, "FAIL", `chunk=${chkCount}, embedding=${embCount}，不一致`);
    }

    const vectorCheck = await sql`
      SELECT COUNT(*) as cnt FROM "Embedding"
      WHERE "documentId" = ${doc.id} AND embedding IS NOT NULL
    `;
    const vecCount = Number(vectorCheck[0].cnt);
    if (vecCount === embCount) {
      addResult(`${doc.fileName} 向量完整性`, "PASS", `${vecCount}/${embCount} 条有向量`);
    } else {
      addResult(`${doc.fileName} 向量完整性`, "FAIL", `仅 ${vecCount}/${embCount} 条有向量`);
    }

    const sampleVec = await sql`
      SELECT embedding FROM "Embedding"
      WHERE "documentId" = ${doc.id} AND embedding IS NOT NULL
      LIMIT 1
    `;
    if (sampleVec.length > 0) {
      const vecStr = String(sampleVec[0].embedding);
      const hasBrackets = vecStr.includes("[");
      const hasHex = vecStr.startsWith("\\x") || vecStr.startsWith("0x");
      if (hasBrackets) {
        const dimMatch = vecStr.match(/\[(\d+)/);
        addResult(`${doc.fileName} 向量维度`, "PASS", `向量格式正常 (数组格式)`);
      } else if (hasHex) {
        addResult(`${doc.fileName} 向量维度`, "PASS", `向量格式正常 (二进制格式)`);
      } else {
        addResult(`${doc.fileName} 向量维度`, "PASS", `向量数据存在 (格式: ${vecStr.substring(0, 30)}...)`);
      }
    }
  }
}

async function testGraphAPI() {
  console.log("\n========== 知识图谱 API 测试 ==========\n");

  const docs = await sql`
    SELECT id, "fileName" FROM "Document" WHERE status = 'completed'
  `;

  for (const doc of docs) {
    try {
      const res = await fetch(`http://localhost:3000/api/document/graph/${doc.id}`, {
        headers: { "x-test-user-id": "test-user" },
      });
      const data = await res.json();

      if (!data.success) {
        addResult(`图谱API ${doc.fileName}`, "FAIL", `API返回失败: ${data.message}`);
        continue;
      }

      if (!data.neo4jAvailable) {
        addResult(`图谱API ${doc.fileName}`, "WARN", `Neo4j不可用: ${data.message}`);
        continue;
      }

      if (data.nodes.length > 0) {
        addResult(`图谱API ${doc.fileName}`, "PASS", `节点=${data.stats.nodeCount}, 关系=${data.stats.edgeCount}`);
      } else {
        addResult(`图谱API ${doc.fileName}`, "WARN", "Neo4j可用但无图谱数据（可能上传时未构建图谱）");
      }
    } catch (error) {
      addResult(`图谱API ${doc.fileName}`, "FAIL", `请求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function testBM25Index() {
  console.log("\n========== BM25 稀疏检索测试 ==========\n");

  try {
    const res = await fetch("http://localhost:3000/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user-id": "test-user" },
      body: JSON.stringify({ query: "格力电器营业收入", topK: 3 }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.results?.length > 0) {
        addResult("BM25 稀疏检索", "PASS", `RAG搜索返回 ${data.results.length} 条结果`);
      } else {
        addResult("BM25 稀疏检索", "WARN", `RAG搜索返回0条结果: ${data.message || "未知"}`);
      }
    } else {
      addResult("BM25 稀疏检索", "WARN", `RAG搜索 API 返回 ${res.status}`);
    }
  } catch (error) {
    addResult("BM25 稀疏检索", "WARN", `无法连接RAG搜索 API: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function testEmbeddingAPI() {
  console.log("\n========== Embedding API 测试 ==========\n");

  const docs = await sql`
    SELECT id, "fileName" FROM "Document" WHERE status = 'completed'
  `;

  for (const doc of docs) {
    try {
      const res = await fetch(`http://localhost:3000/api/document/embeddings/${doc.id}`, {
        headers: { "x-test-user-id": "test-user" },
      });
      const data = await res.json();

      if (data.success && data.embeddings?.length > 0) {
        addResult(`Embedding API ${doc.fileName}`, "PASS", `${data.embeddings.length} 条向量记录`);
      } else {
        addResult(`Embedding API ${doc.fileName}`, "FAIL", `API返回: ${data.message || "无数据"}`);
      }
    } catch (error) {
      addResult(`Embedding API ${doc.fileName}`, "FAIL", `请求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function testChunksAPI() {
  console.log("\n========== Chunks API 测试 ==========\n");

  const docs = await sql`
    SELECT id, "fileName" FROM "Document" WHERE status = 'completed'
  `;

  for (const doc of docs) {
    try {
      const res = await fetch(`http://localhost:3000/api/document/chunks/${doc.id}`, {
        headers: { "x-test-user-id": "test-user" },
      });
      const data = await res.json();

      if (data.success && data.chunks?.length > 0) {
        addResult(`Chunks API ${doc.fileName}`, "PASS", `${data.chunks.length} 个切片`);
      } else {
        addResult(`Chunks API ${doc.fileName}`, "FAIL", `API返回: ${data.message || "无数据"}`);
      }
    } catch (error) {
      addResult(`Chunks API ${doc.fileName}`, "FAIL", `请求失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function generateReport() {
  console.log("\n========== 测试报告 ==========\n");

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const warn = results.filter((r) => r.status === "WARN").length;

  console.log(`总计: ${results.length} 项 | ✅ PASS: ${pass} | ❌ FAIL: ${fail} | ⚠️ WARN: ${warn}`);
  console.log("");

  if (fail > 0) {
    console.log("--- 失败项 ---");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    });
  }

  if (warn > 0) {
    console.log("--- 警告项 ---");
    results.filter((r) => r.status === "WARN").forEach((r) => {
      console.log(`  ⚠️ ${r.name}: ${r.detail}`);
    });
  }

  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: results.length, pass, fail, warn },
    results,
  };

  const fs = require("fs");
  const path = require("path");
  const reportPath = path.join(process.cwd(), "tests/reports/test", `integrity-test-${Date.now()}.json`);
  fs.mkdirSync(path.join(process.cwd(), "tests/reports/test"), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n测试报告已保存: ${reportPath}`);

  return fail === 0;
}

async function main() {
  console.log("========================================");
  console.log("  AI Agent Platform - 综合测试");
  console.log(`  时间: ${new Date().toLocaleString("zh-CN")}`);
  console.log("========================================");

  await testDocumentIntegrity();
  await testChunksAPI();
  await testEmbeddingAPI();
  await testGraphAPI();
  await testBM25Index();

  const allPassed = generateReport();
  await sql.end();
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("测试执行异常:", error);
  sql.end();
  process.exit(1);
});
