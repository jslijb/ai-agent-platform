import { config } from "dotenv";
config({ path: ".env.local" });
config();
import "dotenv/config";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const REPORTS_DIR = path.join(process.cwd(), "data", "financial_reports", "2025_annual");

async function uploadFile(filePath: string, userId: string): Promise<{ success: boolean; message: string; chunkCount?: number; graphStatus?: string }> {
  const fileName = path.basename(filePath);
  console.log(`\n上传: ${fileName}`);

  const fileBuffer = fs.readFileSync(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), fileName);

  try {
    const res = await fetch(`${BASE_URL}/api/document/upload`, {
      method: "POST",
      headers: { "x-test-user-id": userId },
      body: formData,
      signal: AbortSignal.timeout(300000),
    });

    const data = await res.json();

    if (data.success) {
      console.log(`  ✅ 成功! 分块数: ${data.chunkCount}, 图谱: ${data.graphStatus || "无"}`);
      return { success: true, message: `分块数: ${data.chunkCount}`, chunkCount: data.chunkCount, graphStatus: data.graphStatus };
    } else {
      console.log(`  ❌ 失败: ${data.message}`);
      return { success: false, message: data.message };
    }
  } catch (err: any) {
    console.log(`  ❌ 异常: ${err.message}`);
    return { success: false, message: err.message };
  }
}

async function main() {
  const files = [
    "000066_中国长城_2025年年度报告.pdf",
    "000651_格力电器_2025年年度报告.pdf",
  ];

  for (const file of files) {
    const filePath = path.join(REPORTS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`❌ 文件不存在: ${filePath}`);
      continue;
    }

    const result = await uploadFile(filePath, "69ea0f70-00a0-426b-aa5f-0e198d0f69d3");
    if (result.success) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log("\n上传完成!");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
