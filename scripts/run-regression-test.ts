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
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
  console.log("[run-regression-test] 已加载 .env.local 环境变量");
} else {
  console.warn("[run-regression-test] .env.local 不存在，使用系统环境变量");
}

import { hybridSearch } from "../src/server/rag/retrieval/hybrid-retriever";
import { callBailian } from "../src/server/llm/providers/bailian";
import { closeDb } from "../src/server/db/client";
import {
  runFinancialEvaluation,
} from "../src/server/evaluation/rag-evaluator";
import {
  loadBaseline,
  compareWithBaseline,
  saveBaseline,
  formatRegressionReport,
} from "../src/server/evaluation/regression-tester";

const QA_GOLDEN_PATH = path.resolve(__dirname, "qa-golden.json");
const REPORT_DIR = path.resolve(__dirname, "..", "evaluation-reports");

const THRESHOLD = parseFloat(process.env.REGRESSION_THRESHOLD ?? "5") || 5;
const EVALUATION_LEVEL = (process.env.EVALUATION_LEVEL ?? "standard") as "daily" | "standard" | "full";

async function searchFn(
  query: string
): Promise<Array<{ text: string; score: number }>> {
  console.log(`[run-regression-test] 检索查询: "${query.slice(0, 50)}..."`);

  try {
    const results = await hybridSearch(query, 5);
    console.log(`[run-regression-test] 检索返回 ${results.length} 条结果`);
    return results.map((r) => ({
      text: r.text,
      score: r.score,
    }));
  } catch (error) {
    console.error("[run-regression-test] 检索失败:", error);
    return [];
  }
}

async function answerFn(
  query: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<string> {
  console.log(
    `[run-regression-test] 生成答案, query: "${query.slice(0, 50)}...", 上下文数: ${searchResults.length}`
  );

  if (searchResults.length === 0) {
    console.log("[run-regression-test] 无检索结果，返回默认答案");
    return "抱歉，未找到与您问题相关的信息。";
  }

  try {
    const contextBlock = searchResults
      .map((r, i) => `[文档片段${i + 1}]\n${r.text}`)
      .join("\n\n");

    const response = await callBailian([
      {
        role: "system",
        content:
          "你是一个专业的金融领域问答助手。请根据提供的文档片段回答用户的问题。回答必须基于提供的文档内容，不要编造信息。如果文档中没有相关信息，请明确说明。",
      },
      {
        role: "user",
        content: `以下是相关文档片段：\n\n${contextBlock}\n\n用户问题：${query}\n\n请基于以上文档片段回答问题。`,
      },
    ]);

    console.log(
      `[run-regression-test] 答案生成完成, 长度: ${response.content.length}`
    );
    return response.content;
  } catch (error) {
    console.error("[run-regression-test] 答案生成失败:", error);
    return "答案生成失败，请稍后重试。";
  }
}

async function main(): Promise<void> {
  console.log("[run-regression-test] ========== 开始自动化回归测试 ==========");
  console.log(`[run-regression-test] 配置 - 退化阈值: ${THRESHOLD}%, 评估级别: ${EVALUATION_LEVEL}`);
  console.log(`[run-regression-test] 黄金测试集路径: ${QA_GOLDEN_PATH}`);

  if (!fs.existsSync(QA_GOLDEN_PATH)) {
    console.error(`[run-regression-test] 黄金测试集文件不存在: ${QA_GOLDEN_PATH}`);
    process.exit(1);
  }

  const qaData = JSON.parse(fs.readFileSync(QA_GOLDEN_PATH, "utf-8"));
  console.log(`[run-regression-test] 加载测试集, 共 ${qaData.length} 条`);

  const testSet = qaData.map(
    (item: {
      id: number;
      query: string;
      expectedAnswer: string;
      category: string;
      difficulty: string;
    }) => ({
      id: item.id,
      query: item.query,
      expectedAnswer: item.expectedAnswer,
      category: item.category,
      difficulty: item.difficulty,
    })
  );

  console.log("[run-regression-test] 第一步: 加载上一次评估基线");
  const baseline = await loadBaseline("rag");

  if (baseline) {
    console.log(
      `[run-regression-test] 找到基线 - 版本: v${(baseline as Record<string, unknown>).version ?? "未知"}, 综合评分: ${baseline.overallScore.toFixed(4)}, 金融综合评分: ${baseline.financialOverallScore.toFixed(4)}`
    );
  } else {
    console.log("[run-regression-test] 未找到历史基线, 本次评估将作为初始基线");
  }

  console.log("[run-regression-test] 第二步: 运行当前评估");
  const currentResult = await runFinancialEvaluation(
    testSet,
    searchFn,
    answerFn,
    {
      evaluationLevel: EVALUATION_LEVEL,
      triggerMode: "auto",
      dataSource: "golden",
    }
  );
  console.log(
    `[run-regression-test] 当前评估完成, 综合评分: ${currentResult.overallScore.toFixed(4)}, 金融综合评分: ${currentResult.financialOverallScore.toFixed(4)}`
  );

  let report: string;

  if (baseline) {
    console.log("[run-regression-test] 第三步: 对比当前结果与基线");
    const comparison = compareWithBaseline(currentResult, baseline, THRESHOLD);
    report = formatRegressionReport(comparison, currentResult, baseline);

    console.log("\n" + report);

    if (comparison.alerts.length > 0) {
      console.warn(
        `\n[run-regression-test] ⚠️ 发现 ${comparison.alerts.length} 个退化告警!`
      );
      for (const alert of comparison.alerts) {
        console.warn(`[run-regression-test]   - ${alert}`);
      }
    }
  } else {
    console.log("[run-regression-test] 第三步: 无基线可对比, 生成初始报告");
    const lines: string[] = [];
    lines.push("=== 回归测试报告 (初始基线) ===");
    lines.push(`评估时间: ${currentResult.timestamp.split("T")[0]}`);
    lines.push(`当前版本: v1 (首次评估)`);
    lines.push("");
    lines.push("当前指标:");
    lines.push(`  Hits@K:             ${currentResult.avgHitsAtK.toFixed(4)}`);
    lines.push(`  ContextRelevance:   ${currentResult.avgContextRelevance.toFixed(4)}`);
    lines.push(`  ContextRecall:      ${currentResult.avgContextRecall.toFixed(4)}`);
    lines.push(`  Faithfulness:       ${currentResult.avgFaithfulness.toFixed(4)}`);
    lines.push(`  AnswerRelevance:    ${currentResult.avgAnswerRelevance.toFixed(4)}`);
    lines.push(`  OverallScore:       ${currentResult.overallScore.toFixed(4)}`);
    lines.push(`  NumericalAccuracy:  ${currentResult.avgNumericalAccuracy.toFixed(4)}`);
    lines.push(`  ComplianceScore:    ${currentResult.avgComplianceScore.toFixed(4)}`);
    lines.push(`  HallucinationRate:  ${currentResult.avgHallucinationRate.toFixed(4)}`);
    lines.push(`  RiskDisclosureScore:${currentResult.avgRiskDisclosureScore.toFixed(4)}`);
    lines.push(`  TimelinessScore:    ${currentResult.avgTimelinessScore.toFixed(4)}`);
    lines.push(`  FinancialOverall:   ${currentResult.financialOverallScore.toFixed(4)}`);
    lines.push("");
    lines.push("ℹ️ 这是首次评估, 结果已保存为初始基线, 后续评估将与此基线对比");
    report = lines.join("\n");

    console.log("\n" + report);
  }

  console.log("[run-regression-test] 第四步: 保存当前评估结果为新基线");
  const baselineId = await saveBaseline(currentResult);
  console.log(`[run-regression-test] 当前评估结果已保存为新基线, id: ${baselineId}`);

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    console.log(`[run-regression-test] 创建报告目录: ${REPORT_DIR}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(REPORT_DIR, `regression-report-${timestamp}.txt`);
  fs.writeFileSync(reportPath, report, "utf-8");
  console.log(`[run-regression-test] 回归测试报告已保存: ${reportPath}`);

  const latestReportPath = path.join(REPORT_DIR, "regression-latest.txt");
  fs.writeFileSync(latestReportPath, report, "utf-8");
  console.log(`[run-regression-test] 最新报告已更新: ${latestReportPath}`);

  const jsonReportPath = path.join(REPORT_DIR, `regression-report-${timestamp}.json`);
  const jsonPayload = {
    timestamp: currentResult.timestamp,
    baseline: baseline
      ? {
          version: (baseline as Record<string, unknown>).version ?? 0,
          overallScore: baseline.overallScore,
          financialOverallScore: baseline.financialOverallScore,
          timestamp: baseline.timestamp,
        }
      : null,
    current: {
      version: currentResult.version,
      overallScore: currentResult.overallScore,
      financialOverallScore: currentResult.financialOverallScore,
      timestamp: currentResult.timestamp,
    },
    threshold: THRESHOLD,
    evaluationLevel: EVALUATION_LEVEL,
  };
  fs.writeFileSync(jsonReportPath, JSON.stringify(jsonPayload, null, 2), "utf-8");
  console.log(`[run-regression-test] JSON报告已保存: ${jsonReportPath}`);

  console.log("[run-regression-test] ========== 自动化回归测试完成 ==========");

  await closeDb();
  process.exit(0);
}

main().catch((error) => {
  console.error("[run-regression-test] 回归测试运行失败:", error);
  process.exit(1);
});
