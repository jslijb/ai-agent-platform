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
  console.log("[run-evaluation] 已加载 .env.local 环境变量");
} else {
  console.warn("[run-evaluation] .env.local 不存在，使用系统环境变量");
}

import { hybridSearch } from "../src/server/rag/retrieval/hybrid-retriever";
import { callBailian } from "../src/server/llm/providers/bailian";
import {
  runFullEvaluation,
  type EvaluationReport,
} from "../src/server/evaluation/rag-evaluator";

const QA_GOLDEN_PATH = path.resolve(__dirname, "qa-golden.json");
const REPORT_DIR = path.resolve(__dirname, "..", "evaluation-reports");

async function searchFn(
  query: string
): Promise<Array<{ text: string; score: number }>> {
  console.log(`[run-evaluation] 检索查询: "${query.slice(0, 50)}..."`);

  try {
    const results = await hybridSearch(query, 5);
    console.log(`[run-evaluation] 检索返回 ${results.length} 条结果`);
    return results.map((r) => ({
      text: r.text,
      score: r.score,
    }));
  } catch (error) {
    console.error("[run-evaluation] 检索失败:", error);
    return [];
  }
}

async function answerFn(
  query: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<string> {
  console.log(
    `[run-evaluation] 生成答案, query: "${query.slice(0, 50)}...", 上下文数: ${searchResults.length}`
  );

  if (searchResults.length === 0) {
    console.log("[run-evaluation] 无检索结果，返回默认答案");
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
      `[run-evaluation] 答案生成完成, 长度: ${response.content.length}`
    );
    return response.content;
  } catch (error) {
    console.error("[run-evaluation] 答案生成失败:", error);
    return "答案生成失败，请稍后重试。";
  }
}

function printReport(report: EvaluationReport): void {
  console.log("\n" + "=".repeat(80));
  console.log("                    RAG 评估报告");
  console.log("=".repeat(80));
  console.log(`评估时间: ${report.timestamp}`);
  console.log(`测试用例数: ${report.totalTests}`);
  console.log("-".repeat(80));
  console.log("  综合指标:");
  console.log(`    Overall Score:      ${report.overallScore.toFixed(4)}`);
  console.log(`    Hits@K:             ${report.avgHitsAtK.toFixed(4)}`);
  console.log(`    Context Relevance:  ${report.avgContextRelevance.toFixed(4)}`);
  console.log(`    Context Recall:     ${report.avgContextRecall.toFixed(4)}`);
  console.log(`    Faithfulness:       ${report.avgFaithfulness.toFixed(4)}`);
  console.log(`    Answer Relevance:   ${report.avgAnswerRelevance.toFixed(4)}`);
  console.log("-".repeat(80));

  console.log("  按分类统计:");
  for (const [category, stats] of Object.entries(report.resultsByCategory)) {
    console.log(
      `    ${category}: 数量=${stats.count}, Hits@K=${stats.avgHitsAtK.toFixed(4)}, Faithfulness=${stats.avgFaithfulness.toFixed(4)}, Relevance=${stats.avgAnswerRelevance.toFixed(4)}`
    );
  }
  console.log("-".repeat(80));

  console.log("  按难度统计:");
  for (const [difficulty, stats] of Object.entries(
    report.resultsByDifficulty
  )) {
    console.log(
      `    ${difficulty}: 数量=${stats.count}, Hits@K=${stats.avgHitsAtK.toFixed(4)}, Faithfulness=${stats.avgFaithfulness.toFixed(4)}, Relevance=${stats.avgAnswerRelevance.toFixed(4)}`
    );
  }
  console.log("-".repeat(80));

  console.log("  逐条结果:");
  console.log(
    "  ID | 分类           | 难度   | Hits@K | ContextRel | ContextRecall | Faithfulness | AnswerRel | 耗时(ms)"
  );
  console.log(
    "  ---|----------------|--------|--------|------------|---------------|--------------|-----------|----------"
  );
  for (const r of report.results) {
    console.log(
      `  ${String(r.id).padStart(2)} | ${r.category.padEnd(14)} | ${r.difficulty.padEnd(6)} | ${r.retrieval.hitsAtK.toFixed(2).padStart(6)} | ${(r.retrieval.contextRelevance).toFixed(4).padStart(10)} | ${(r.retrieval.contextRecall).toFixed(4).padStart(13)} | ${r.answer.faithfulness.toFixed(4).padStart(12)} | ${r.answer.answerRelevance.toFixed(4).padStart(9)} | ${String(r.durationMs).padStart(8)}`
    );
  }
  console.log("=".repeat(80) + "\n");
}

async function main(): Promise<void> {
  console.log("[run-evaluation] 开始运行 RAG 评估");
  console.log(`[run-evaluation] 黄金测试集路径: ${QA_GOLDEN_PATH}`);

  if (!fs.existsSync(QA_GOLDEN_PATH)) {
    console.error(`[run-evaluation] 黄金测试集文件不存在: ${QA_GOLDEN_PATH}`);
    process.exit(1);
  }

  const qaData = JSON.parse(fs.readFileSync(QA_GOLDEN_PATH, "utf-8"));
  console.log(`[run-evaluation] 加载测试集, 共 ${qaData.length} 条`);

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

  const report = await runFullEvaluation(testSet, searchFn, answerFn);

  printReport(report);

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    console.log(`[run-evaluation] 创建报告目录: ${REPORT_DIR}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(REPORT_DIR, `eval-report-${timestamp}.json`);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[run-evaluation] 评估报告已保存: ${reportPath}`);

  const latestReportPath = path.join(REPORT_DIR, "latest.json");
  fs.writeFileSync(
    latestReportPath,
    JSON.stringify(report, null, 2),
    "utf-8"
  );
  console.log(`[run-evaluation] 最新报告已更新: ${latestReportPath}`);

  console.log("[run-evaluation] 评估运行完成");
}

main().catch((error) => {
  console.error("[run-evaluation] 评估运行失败:", error);
  process.exit(1);
});
