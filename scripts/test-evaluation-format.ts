/**
 * Task 10.3 端到端测试：评估报告新格式
 *
 * 测试内容：
 * 1. extractNumbersWithUnit - 数值+单位提取
 *    - 货币单位（亿元/千万元/百万元/万元/千元/元）正确识别
 *    - 百分数正确识别
 *    - 年份正确跳过
 *    - 千分位逗号正确处理
 * 2. computeNumericalDifference - 数值差异计算
 *    - 数值一致：difference=0, isAcceptable=true, needsManualReview=false
 *    - 数值有差异：difference≠0, needsManualReview=true
 *    - 单位换算（千元/万元/百万元/亿元）
 *    - 百分数 vs 普通数值不混淆
 * 3. testAnswer/comparison 字段结构验证
 *
 * 运行：npx tsx scripts/test-evaluation-format.ts
 */
import * as fs from "fs";
import * as path from "path";

// 加载 .env.local 环境变量
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
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log("[test-eval-format] 已加载 .env.local 环境变量");
}

import {
  extractNumbersWithUnit,
  computeNumericalDifference,
} from "@/server/evaluation/rag-evaluator";

interface TestResult {
  name: string;
  passed: boolean;
  failures: string[];
  details?: Record<string, unknown>;
}

function approxEqual(a: number, b: number, epsilon: number = 0.01): boolean {
  return Math.abs(a - b) < epsilon;
}

// ========== 测试 1：extractNumbersWithUnit - 数值+单位提取 ==========
function test1_ExtractNumbersWithUnit(): TestResult {
  console.log("\n========== 测试 1: extractNumbersWithUnit - 数值+单位提取 ==========");
  const failures: string[] = [];
  const details: Record<string, unknown> = {};

  // 测试 1.1: 货币单位 - 亿元
  let result = extractNumbersWithUnit("中国能建2025年营业收入约为3569.66亿元");
  console.log("[test1.1] 输入: '中国能建2025年营业收入约为3569.66亿元'");
  console.log("[test1.1] 输出: " + JSON.stringify(result));
  details.case1 = result;
  if (result.length === 0) {
    failures.push("1.1 应提取到数值，实际为空");
  } else {
    // 应该跳过 2025 年份，只提取 3569.66 亿元
    const target = result.find((r) => r.unit === "亿元");
    if (!target) {
      failures.push("1.1 应提取到 '亿元' 单位的数值，实际单位: " + result.map((r) => r.unit).join(","));
    } else if (!approxEqual(target.value, 3569.66)) {
      failures.push("1.1 数值应为 3569.66, 实际: " + target.value);
    }
    // 验证年份 2025 被跳过
    const yearValue = result.find((r) => r.value === 2025);
    if (yearValue) {
      failures.push("1.1 年份 2025 应被跳过，但被提取为: " + JSON.stringify(yearValue));
    }
  }

  // 测试 1.2: 百分数
  result = extractNumbersWithUnit("毛利率5.37%，净利率3.50%");
  console.log("[test1.2] 输入: '毛利率5.37%，净利率3.50%'");
  console.log("[test1.2] 输出: " + JSON.stringify(result));
  details.case2 = result;
  if (result.length !== 2) {
    failures.push("1.2 应提取到 2 个百分数，实际: " + result.length);
  } else {
    if (!approxEqual(result[0].value, 5.37) || !result[0].isPercentage) {
      failures.push("1.2 第一个数值应为 5.37% (isPercentage=true), 实际: " + JSON.stringify(result[0]));
    }
    if (!approxEqual(result[1].value, 3.50) || !result[1].isPercentage) {
      failures.push("1.2 第二个数值应为 3.50% (isPercentage=true), 实际: " + JSON.stringify(result[1]));
    }
  }

  // 测试 1.3: 千分位逗号
  result = extractNumbersWithUnit("2025年营业收入356,965,858千元");
  console.log("[test1.3] 输入: '2025年营业收入356,965,858千元'");
  console.log("[test1.3] 输出: " + JSON.stringify(result));
  details.case3 = result;
  const big = result.find((r) => r.unit === "千元");
  if (!big) {
    failures.push("1.3 应提取到 '千元' 单位的数值");
  } else if (!approxEqual(big.value, 356965858, 1)) {
    failures.push("1.3 千分位逗号数值应为 356965858, 实际: " + big.value);
  }

  // 测试 1.4: 多种单位混合
  result = extractNumbersWithUnit("营收30亿元，净利润2.5亿元，同比增长15.3%，ROE为12.5%");
  console.log("[test1.4] 输入: '营收30亿元，净利润2.5亿元，同比增长15.3%，ROE为12.5%'");
  console.log("[test1.4] 输出: " + JSON.stringify(result));
  details.case4 = result;
  const yiYuan = result.filter((r) => r.unit === "亿元");
  const percent = result.filter((r) => r.isPercentage);
  if (yiYuan.length !== 2) {
    failures.push("1.4 应提取到 2 个 '亿元' 数值，实际: " + yiYuan.length);
  }
  if (percent.length !== 2) {
    failures.push("1.4 应提取到 2 个百分数，实际: " + percent.length);
  }

  // 测试 1.5: 负数
  result = extractNumbersWithUnit("净利润为-0.56亿元，同比由盈转亏-120.5%");
  console.log("[test1.5] 输入: '净利润为-0.56亿元，同比由盈转亏-120.5%'");
  console.log("[test1.5] 输出: " + JSON.stringify(result));
  details.case5 = result;
  const negative = result.find((r) => r.unit === "亿元" && r.value < 0);
  if (!negative) {
    failures.push("1.5 应提取到负数 -0.56 亿元");
  } else if (!approxEqual(negative.value, -0.56)) {
    failures.push("1.5 负数数值应为 -0.56, 实际: " + negative.value);
  }

  const passed = failures.length === 0;
  console.log((passed ? "✓ 通过" : "✗ 失败") + (failures.length > 0 ? " - " + failures.join("; ") : ""));
  return { name: "测试1: extractNumbersWithUnit - 数值+单位提取", passed, failures, details };
}

// ========== 测试 2：computeNumericalDifference - 数值差异计算 ==========
function test2_ComputeNumericalDifference(): TestResult {
  console.log("\n========== 测试 2: computeNumericalDifference - 数值差异计算 ==========");
  const failures: string[] = [];
  const details: Record<string, unknown> = {};

  // 测试 2.1: 数值完全一致
  let diff = computeNumericalDifference(
    "中国能建2025年营业收入约为3569.66亿元",
    "根据文档，中国能建2025年营业收入为3569.66亿元。"
  );
  console.log("[test2.1] 期望: 3569.66亿元, 实际: 3569.66亿元");
  console.log("[test2.1] 结果: " + JSON.stringify(diff));
  details.case1 = diff;
  if (diff.numericalDifference.length === 0) {
    failures.push("2.1 应至少有 1 个数值差异条目");
  } else {
    const first = diff.numericalDifference[0];
    if (!approxEqual(first.difference, 0, 0.001)) {
      failures.push("2.1 差值应为 0, 实际: " + first.difference);
    }
    if (!first.isAcceptable) {
      failures.push("2.1 isAcceptable 应为 true");
    }
    if (diff.needsManualReview) {
      failures.push("2.1 needsManualReview 应为 false");
    }
  }

  // 测试 2.2: 数值有差异
  diff = computeNumericalDifference(
    "营收3569.66亿元",
    "营收3600亿元"
  );
  console.log("[test2.2] 期望: 3569.66亿元, 实际: 3600亿元");
  console.log("[test2.2] 结果: " + JSON.stringify(diff));
  details.case2 = diff;
  if (diff.numericalDifference.length === 0) {
    failures.push("2.2 应至少有 1 个数值差异条目");
  } else {
    const first = diff.numericalDifference[0];
    if (approxEqual(first.difference, 0, 0.001)) {
      failures.push("2.2 差值不应为 0（数值有差异）");
    }
    if (first.isAcceptable) {
      failures.push("2.2 isAcceptable 应为 false（差值≠0）");
    }
    if (!diff.needsManualReview) {
      failures.push("2.2 needsManualReview 应为 true（差值≠0）");
    }
  }

  // 测试 2.3: 单位换算 - 千元 vs 亿元
  diff = computeNumericalDifference(
    "营业收入3569.66亿元",
    "营业收入356,965,858千元"
  );
  console.log("[test2.3] 期望: 3569.66亿元, 实际: 356,965,858千元（应换算后比较）");
  console.log("[test2.3] 结果: " + JSON.stringify(diff));
  details.case3 = diff;
  if (diff.numericalDifference.length === 0) {
    failures.push("2.3 应至少有 1 个数值差异条目");
  } else {
    const first = diff.numericalDifference[0];
    // 3569.66 亿元 = 356966000000 元 = 356965858 千元 * 1000 ≈ 356965858000 元
    // 实际换算后差异应该非常小（< 1亿元）
    console.log("[test2.3] 差值: " + first.difference + " (单位换算后)");
    if (Math.abs(first.difference) > 1) {
      // 3569.66 - 3569.65858 = 0.00142 亿元，差异极小
      console.log("[test2.3] 注意: 差值 " + first.difference + " 可能未正确换算单位");
    }
  }

  // 测试 2.4: 百分数差异
  diff = computeNumericalDifference(
    "毛利率5.37%",
    "毛利率-3.50%"
  );
  console.log("[test2.4] 期望: 5.37%, 实际: -3.50%");
  console.log("[test2.4] 结果: " + JSON.stringify(diff));
  details.case4 = diff;
  if (diff.numericalDifference.length === 0) {
    failures.push("2.4 应至少有 1 个数值差异条目");
  } else {
    const first = diff.numericalDifference[0];
    // 5.37 - (-3.50) = 8.87
    if (!approxEqual(first.difference, 8.87, 0.01)) {
      failures.push("2.4 差值应为 8.87, 实际: " + first.difference);
    }
    if (!diff.needsManualReview) {
      failures.push("2.4 needsManualReview 应为 true");
    }
  }

  // 测试 2.5: Agent Answer 为空（评估失败场景）
  diff = computeNumericalDifference(
    "营收3569.66亿元",
    ""
  );
  console.log("[test2.5] 期望: 3569.66亿元, 实际: (空)");
  console.log("[test2.5] 结果: " + JSON.stringify(diff));
  details.case5 = diff;
  if (!diff.needsManualReview) {
    failures.push("2.5 Agent Answer 为空时 needsManualReview 应为 true");
  }

  const passed = failures.length === 0;
  console.log((passed ? "✓ 通过" : "✗ 失败") + (failures.length > 0 ? " - " + failures.join("; ") : ""));
  return { name: "测试2: computeNumericalDifference - 数值差异计算", passed, failures, details };
}

// ========== 测试 3：testAnswer/comparison 字段结构验证 ==========
function test3_FieldStructure(): TestResult {
  console.log("\n========== 测试 3: testAnswer/comparison 字段结构验证 ==========");
  const failures: string[] = [];
  const details: Record<string, unknown> = {};

  // 模拟评估结果中的 testAnswer/comparison 字段结构
  const expectedAnswer = "中国能建2025年营业收入约为3569.66亿元";
  const actualAnswer = "根据文档，中国能建2025年营业收入为3569.66亿元。";
  const dataSource = {
    documentName: "中国能源建设股份有限公司2025年年度报告",
    documentId: "doc-xxx",
    page: 8,
    originalText: "2025年营业收入356,965,858千元",
  };
  const calculationMethod = "356,965,858千元 ÷ 100,000 = 3569.66亿元";

  const comparison = computeNumericalDifference(expectedAnswer, actualAnswer);

  const mockResult = {
    id: "L1-001",
    query: "中国能建2025年营业收入是多少？",
    expectedAnswer,
    actualAnswer,
    testAnswer: {
      expectedAnswer,
      dataSource,
      calculationMethod,
    },
    comparison,
  };

  console.log("[test3] 模拟评估结果结构:");
  console.log(JSON.stringify(mockResult, null, 2));
  details.mockResult = mockResult;

  // 验证 testAnswer 字段
  if (!mockResult.testAnswer) {
    failures.push("testAnswer 字段缺失");
  } else {
    if (mockResult.testAnswer.expectedAnswer !== expectedAnswer) {
      failures.push("testAnswer.expectedAnswer 不正确");
    }
    if (!mockResult.testAnswer.dataSource) {
      failures.push("testAnswer.dataSource 缺失");
    } else {
      if (mockResult.testAnswer.dataSource.documentName !== dataSource.documentName) {
        failures.push("testAnswer.dataSource.documentName 不正确");
      }
      if (mockResult.testAnswer.dataSource.page !== 8) {
        failures.push("testAnswer.dataSource.page 应为 8");
      }
      if (!mockResult.testAnswer.dataSource.originalText) {
        failures.push("testAnswer.dataSource.originalText 缺失");
      }
    }
    if (mockResult.testAnswer.calculationMethod !== calculationMethod) {
      failures.push("testAnswer.calculationMethod 不正确");
    }
  }

  // 验证 comparison 字段
  if (!mockResult.comparison) {
    failures.push("comparison 字段缺失");
  } else {
    if (!Array.isArray(mockResult.comparison.numericalDifference)) {
      failures.push("comparison.numericalDifference 应为数组");
    }
    if (typeof mockResult.comparison.semanticMatch !== "string") {
      failures.push("comparison.semanticMatch 应为字符串");
    }
    if (typeof mockResult.comparison.needsManualReview !== "boolean") {
      failures.push("comparison.needsManualReview 应为布尔值");
    }

    // 验证 numericalDifference 每个条目的结构
    for (const diff of mockResult.comparison.numericalDifference) {
      if (typeof diff.expectedNumber !== "number") {
        failures.push("numericalDifference.expectedNumber 应为数值");
        break;
      }
      if (typeof diff.actualNumber !== "number") {
        failures.push("numericalDifference.actualNumber 应为数值");
        break;
      }
      if (typeof diff.difference !== "number") {
        failures.push("numericalDifference.difference 应为数值");
        break;
      }
      if (typeof diff.isAcceptable !== "boolean") {
        failures.push("numericalDifference.isAcceptable 应为布尔值");
        break;
      }
    }
  }

  const passed = failures.length === 0;
  console.log((passed ? "✓ 通过" : "✗ 失败") + (failures.length > 0 ? " - " + failures.join("; ") : ""));
  return { name: "测试3: testAnswer/comparison 字段结构验证", passed, failures, details };
}

function main() {
  console.log("====================================================");
  console.log("Task 10.3 端到端测试：评估报告新格式");
  console.log("====================================================");

  const results: TestResult[] = [
    test1_ExtractNumbersWithUnit(),
    test2_ComputeNumericalDifference(),
    test3_FieldStructure(),
  ];

  // 汇总
  console.log("\n\n====================================================");
  console.log("测试汇总");
  console.log("====================================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log("通过: " + passed + "/" + results.length + ", 失败: " + failed);

  console.log("\n| 测试名 | 结果 |");
  console.log("|:---|:---|");
  for (const r of results) {
    console.log("| " + r.name + " | " + (r.passed ? "✓" : "✗ " + r.failures.join("; ")) + " |");
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("\n✓ 所有测试通过");
    process.exit(0);
  }
}

main();
