import fs from "fs";
import path from "path";
import postgres from "postgres";

const DB_URL = "postgresql://aiagent:aiagent_secret@localhost:5432/agentdb";
const sql = postgres(DB_URL);
const USER_ID = "69ea0f70-00a0-426b-aa5f-0e198d0f69d3";

const PDF_FILES = [
  "data/financial_reports/2025_annual/000858_五_粮_液_2025年年度报告.pdf",
  "data/financial_reports/2025_annual/000651_格力电器_2025年年度报告.pdf",
  "data/financial_reports/2025_annual/000066_中国长城_2025年年度报告.pdf",
];

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
      signal: AbortSignal.timeout(600000),
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

async function checkDocumentStatus(documentId: string): Promise<string> {
  const maxWait = 600;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait * 1000) {
    const rows = await sql`SELECT status FROM "Document" WHERE id = ${documentId}`;
    if (rows.length > 0 && rows[0].status === "completed") {
      return "completed";
    }
    if (rows.length > 0 && rows[0].status === "failed") {
      return "failed";
    }
    console.log(`[上传] 文档 ${documentId} 处理中... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  return "timeout";
}

async function main() {
  console.log("=".repeat(60));
  console.log("RAG 知识库文档上传脚本");
  console.log("=".repeat(60));

  const existingDocs = await sql`SELECT id, "fileName", status FROM "Document" WHERE "userId" = ${USER_ID}`;
  console.log(`[上传] 当前已有 ${existingDocs.length} 个文档`);
  for (const doc of existingDocs) {
    console.log(`  - ${doc.fileName} (${doc.status})`);
  }

  for (const pdfPath of PDF_FILES) {
    const fullPath = path.resolve(pdfPath);
    if (!fs.existsSync(fullPath)) {
      console.error(`[上传] 文件不存在: ${fullPath}`);
      continue;
    }

    const fileName = path.basename(fullPath);
    const existing = existingDocs.find((d) => d.fileName === fileName && d.status === "completed");
    if (existing) {
      console.log(`\n[上传] 文档已存在且已完成，跳过: ${existing.id}`);
      continue;
    }

    console.log(`\n[上传] 处理文件: ${fileName}`);
    const docId = await uploadViaApi(fullPath);
    if (!docId) continue;

    console.log(`[上传] 等待文档处理完成...`);
    const status = await checkDocumentStatus(docId);
    if (status === "completed") {
      console.log(`[上传] 文档 ${docId} 处理完成 ✓`);
    } else {
      console.error(`[上传] 文档 ${docId} 处理${status} ✗`);
    }
  }

  const finalDocs = await sql`SELECT id, "fileName", status FROM "Document" WHERE "userId" = ${USER_ID} AND status = 'completed'`;
  console.log(`\n[上传] 已完成的文档数: ${finalDocs.length}`);
  for (const doc of finalDocs) {
    const chunks = await sql`SELECT COUNT(*) as cnt FROM "Embedding" WHERE "documentId" = ${doc.id}`;
    console.log(`  - ${doc.fileName}: ${chunks[0].cnt} 个分块`);
  }

  await sql.end();
  console.log("\n" + "=".repeat(60));
  console.log("所有文档上传完成！");
  console.log("=".repeat(60));
}

main().catch(console.error);
