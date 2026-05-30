import fs from "fs";
import path from "path";
import postgres from "postgres";

const DB_URL = "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb";
const sql = postgres(DB_URL);
const USER_ID = "69ea0f70-00a0-426b-aa5f-0e198d0f69d3";

const PDF_FILE = "data/financial_reports/2025_annual/000066_中国长城_2025年年度报告.pdf";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

async function uploadViaApi(filePath: string): Promise<string | null> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  console.log(`[上传] 上传文件: ${fileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  formData.append("file", blob, fileName);

  try {
    const res = await fetch(`${BASE_URL}/api/document/upload`, {
      method: "POST",
      headers: { "x-test-user-id": USER_ID },
      body: formData,
      signal: AbortSignal.timeout(900000),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`[上传] 上传成功: documentId=${data.documentId}, 分块数=${data.chunkCount}`);
      return data.documentId;
    } else {
      console.error(`[上传] 上传失败: ${data.message || JSON.stringify(data)}`);
      return null;
    }
  } catch (err) {
    console.error(`[上传] 上传异常: ${err}`);
    return null;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("RAG 知识库文档上传脚本 (单文件测试)");
  console.log("=".repeat(60));

  const fullPath = path.resolve(PDF_FILE);
  if (!fs.existsSync(fullPath)) {
    console.error(`[上传] 文件不存在: ${fullPath}`);
    await sql.end();
    return;
  }

  const docId = await uploadViaApi(fullPath);
  if (docId) {
    console.log(`[上传] 文档上传成功: ${docId}`);
    const docs = await sql`SELECT id, "fileName", status FROM "Document" WHERE id = ${docId}`;
    console.log(`[上传] 文档状态: ${docs[0]?.status}`);
    const chunks = await sql`SELECT COUNT(*) as cnt FROM "Embedding" WHERE "documentId" = ${docId}`;
    console.log(`[上传] Embedding 数量: ${chunks[0]?.cnt}`);
  } else {
    console.error(`[上传] 文档上传失败`);
    const docs = await sql`SELECT id, "fileName", status FROM "Document" ORDER BY "createdAt" DESC LIMIT 5`;
    for (const doc of docs) {
      console.log(`  - ${doc.fileName}: ${doc.status}`);
    }
  }

  await sql.end();
  console.log("\n" + "=".repeat(60));
}

main().catch(console.error);
