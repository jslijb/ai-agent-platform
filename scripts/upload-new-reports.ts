/**
 * 新增3家公司财务报表上传脚本
 * 上传中国能建、中国人保、中国铁建的2025年年报和2026年Q1季报
 * API: POST /api/document/upload (multipart/form-data, 字段名 file)
 */

import fs from "fs";
import path from "path";

// 主服务地址
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// 测试用户ID（与现有上传脚本保持一致）
const USER_ID = "69ea0f70-00a0-426b-aa5f-0e198d0f69d3";

// 每个文件上传后等待时间（毫秒）
const UPLOAD_DELAY_MS = 5000;

// 请求超时时间（5分钟，年报文件较大）
const REQUEST_TIMEOUT_MS = 300000;

// 需要上传的6个文件
const files = [
  {
    name: "中国能建2025年报",
    path: "D:\\Python\\ai-agent-platform\\data\\financial_reports\\2025_annual\\中国能建：中国能源建设股份有限公司2025年年度报告.pdf",
  },
  {
    name: "中国人保2025年报",
    path: "D:\\Python\\ai-agent-platform\\data\\financial_reports\\2025_annual\\中国人保：中国人保2025年年度报告.pdf",
  },
  {
    name: "中国铁建2025年报",
    path: "D:\\Python\\ai-agent-platform\\data\\financial_reports\\2025_annual\\中国铁建：中国铁建2025年年度报告.pdf",
  },
  {
    name: "中国能建2026Q1季报",
    path: "D:\\Python\\ai-agent-platform\\data\\financial_reports\\2026_q1\\中国能建：中国能源建设股份有限公司2026年第一季度报告.pdf",
  },
  {
    name: "中国人保2026Q1季报",
    path: "D:\\Python\\ai-agent-platform\\data\\financial_reports\\2026_q1\\中国人保：中国人保2026年第一季度报告.pdf",
  },
  {
    name: "中国铁建2026Q1季报",
    path: "D:\\Python\\ai-agent-platform\\data\\financial_reports\\2026_q1\\中国铁建：中国铁建2026年第一季度报告.pdf",
  },
];

// 上传结果类型
interface UploadResult {
  name: string;
  fileName: string;
  success: boolean;
  documentId?: string;
  chunkCount?: number;
  message: string;
}

/**
 * 检查主服务是否可用
 */
async function checkServiceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[健康检查] 主服务可用: ${JSON.stringify(data)}`);
      return true;
    }
    console.error(`[健康检查] 主服务响应异常: HTTP ${res.status}`);
    return false;
  } catch (err: any) {
    console.error(`[健康检查] 主服务不可用: ${err.message}`);
    return false;
  }
}

/**
 * 上传单个文件
 */
async function uploadFile(
  filePath: string,
  displayName: string
): Promise<UploadResult> {
  const fileName = path.basename(filePath);
  console.log(`\n[上传] 开始上传: ${displayName} (${fileName})`);

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    console.error(`[上传] 文件不存在: ${filePath}`);
    return {
      name: displayName,
      fileName,
      success: false,
      message: "文件不存在",
    };
  }

  // 读取文件内容
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
    const sizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`[上传] 文件大小: ${sizeMB} MB`);
  } catch (err: any) {
    console.error(`[上传] 读取文件失败: ${err.message}`);
    return {
      name: displayName,
      fileName,
      success: false,
      message: `读取文件失败: ${err.message}`,
    };
  }

  // 构建 FormData
  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: "application/pdf" });
  formData.append("file", blob, fileName);

  // 发送上传请求
  try {
    const res = await fetch(`${BASE_URL}/api/document/upload`, {
      method: "POST",
      headers: { "x-test-user-id": USER_ID },
      body: formData,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await res.json();

    if (data.success) {
      console.log(
        `[上传] 上传成功! 文档ID: ${data.documentId}, 分块数: ${data.chunkCount}, 图谱状态: ${data.graphStatus || "无"}`
      );
      return {
        name: displayName,
        fileName,
        success: true,
        documentId: data.documentId,
        chunkCount: data.chunkCount,
        message: `文档ID: ${data.documentId}, 分块数: ${data.chunkCount}`,
      };
    } else {
      console.error(`[上传] 上传失败: ${data.message || JSON.stringify(data)}`);
      return {
        name: displayName,
        fileName,
        success: false,
        message: data.message || JSON.stringify(data),
      };
    }
  } catch (err: any) {
    console.error(`[上传] 上传异常: ${err.message}`);
    return {
      name: displayName,
      fileName,
      success: false,
      message: `上传异常: ${err.message}`,
    };
  }
}

/**
 * 延迟指定毫秒数
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 主函数
 */
async function main() {
  console.log("=".repeat(60));
  console.log("新增3家公司财务报表上传脚本");
  console.log("公司: 中国能建、中国人保、中国铁建");
  console.log("报表: 2025年年报 + 2026年Q1季报");
  console.log(`服务地址: ${BASE_URL}`);
  console.log("=".repeat(60));

  // 1. 检查主服务是否可用
  console.log("\n[步骤1] 检查主服务是否可用...");
  const isHealthy = await checkServiceHealth();
  if (!isHealthy) {
    console.error("\n❌ 主服务不可用，请先启动主服务后再运行此脚本！");
    process.exit(1);
  }
  console.log("✅ 主服务可用，开始上传文件");

  // 2. 逐个上传文件
  console.log(`\n[步骤2] 开始上传 ${files.length} 个文件...`);
  const results: UploadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`\n--- [${i + 1}/${files.length}] ${file.name} ---`);

    const result = await uploadFile(file.path, file.name);
    results.push(result);

    // 最后一个文件上传后不需要等待
    if (i < files.length - 1) {
      console.log(`[等待] 等待 ${UPLOAD_DELAY_MS / 1000} 秒后继续上传下一个文件...`);
      await delay(UPLOAD_DELAY_MS);
    }
  }

  // 3. 汇总统计
  console.log("\n" + "=".repeat(60));
  console.log("上传结果汇总");
  console.log("=".repeat(60));

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  for (const result of results) {
    const icon = result.success ? "✅" : "❌";
    console.log(`${icon} ${result.name}: ${result.message}`);
  }

  console.log("-".repeat(60));
  console.log(`总计: ${results.length} 个文件`);
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${failCount} 个`);

  if (failCount === 0) {
    console.log("\n🎉 所有文件上传成功！");
  } else {
    console.log(`\n⚠️ 有 ${failCount} 个文件上传失败，请检查日志后重试。`);
  }

  console.log("=".repeat(60));
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[错误] 脚本执行异常:", e);
  process.exit(1);
});
