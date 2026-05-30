import "dotenv/config";
import fs from "fs";
import path from "path";
import { db } from "../src/server/db/client";
import { documents } from "../src/server/db/schema";
import { desc } from "drizzle-orm";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const REPORTS_DIR = path.resolve("data/financial_reports/2025_annual");

const FILES_TO_UPLOAD = [
  "000066_中国长城_2025年年度报告.pdf",
  "000651_格力电器_2025年年度报告.pdf",
];

async function getRealUserId(): Promise<string> {
  const docRows = await db
    .select({ userId: documents.userId })
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(1);

  if (docRows.length > 0 && docRows[0]!.userId) {
    return docRows[0]!.userId;
  }

  throw new Error("数据库中没有已上传的文档，无法获取 userId。请先通过浏览器上传一个文档。");
}

async function uploadFile(filePath: string, userId: string): Promise<{ success: boolean; message: string; chunkCount?: number; graphStatus?: string }> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);

  try {
    const res = await fetch(`${BASE_URL}/api/document/upload`, {
      method: "POST",
      headers: { "x-test-user-id": userId },
      body: formData,
      signal: AbortSignal.timeout(600000),
    });

    const data = await res.json();
    return {
      success: data.success,
      message: data.message || (data.success ? `分块: ${data.chunkCount}, 图谱: ${data.graphStatus}` : "未知错误"),
      chunkCount: data.chunkCount,
      graphStatus: data.graphStatus,
    };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

async function rebuildGraph(documentId: string, userId: string): Promise<{ success: boolean; message?: string; tripleCount?: number }> {
  try {
    const res = await fetch(`${BASE_URL}/api/document/rebuild-graph/${documentId}`, {
      method: "POST",
      headers: { "x-test-user-id": userId },
      signal: AbortSignal.timeout(300000),
    });
    const data = await res.json();
    return { success: data.success, message: data.message, tripleCount: data.tripleCount };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("上传 PDF 文档 + 建立知识图谱");
  console.log("=".repeat(60));

  const userId = await getRealUserId();
  console.log(`\n使用 userId: ${userId.substring(0, 12)}...`);

  for (const fileName of FILES_TO_UPLOAD) {
    const filePath = path.join(REPORTS_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ 文件不存在: ${filePath}`);
      continue;
    }

    const fileSize = fs.statSync(filePath).size;
    console.log(`\n上传: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)...`);

    const result = await uploadFile(filePath, userId);
    if (result.success) {
      console.log(`✅ 上传成功! ${result.message}`);
    } else {
      console.error(`❌ 上传失败: ${result.message}`);
    }
  }

  console.log("\n\n" + "=".repeat(60));
  console.log("为所有缺失图谱的文档重建知识图谱");
  console.log("=".repeat(60));

  const docRows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      status: documents.status,
      metadata: documents.metadata,
    })
    .from(documents)
    .orderBy(desc(documents.createdAt));

  for (const doc of docRows) {
    const meta = doc.metadata as Record<string, unknown> | null;
    const graphSt = meta?.graphStatus as string | undefined;
    const needsRebuild = !graphSt || graphSt === "failed" || graphSt === "skipped" || graphSt === "no_triples";

    if (needsRebuild && doc.status !== "failed") {
      console.log(`\n重建图谱: ${doc.fileName} (${doc.id})...`);
      const result = await rebuildGraph(doc.id, userId);
      if (result.success) {
        console.log(`✅ 重建成功! 三元组数: ${result.tripleCount}`);
      } else {
        console.error(`❌ 重建失败: ${result.message}`);
      }
    } else {
      console.log(`跳过: ${doc.fileName} (图谱状态: ${graphSt})`);
    }
  }

  console.log("\n完成!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
