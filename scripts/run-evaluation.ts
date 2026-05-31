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
import { closeDb } from "../src/server/db/client";
import {
  runFinancialEvaluation,
  type EvaluationReport,
  type EvaluationWeights,
  DEFAULT_RAG_WEIGHTS,
} from "../src/server/evaluation/rag-evaluator";

const QA_GOLDEN_PATH = path.resolve(__dirname, "qa-golden.json");
const REPORT_DIR = path.resolve(__dirname, "..", "evaluation-reports");
const CONFIG_PATH = path.resolve(__dirname, "..", "evaluation-config.yaml");

interface ParsedYamlConfig {
  rag_weights?: Record<string, number>;
  agent_weights?: Record<string, number>;
  thresholds?: Record<string, number>;
  evaluation_levels?: Record<string, {
    description?: string;
    data_sources?: string[];
    timeout_minutes?: number;
  }>;
  presets?: Record<string, {
    description?: string;
    rag_weights?: Record<string, number>;
    agent_weights?: Record<string, number>;
  }>;
}

function parseSimpleYaml(content: string): ParsedYamlConfig {
  const result: ParsedYamlConfig = {};
  const lines = content.split("\n");
  let currentSection = "";
  let currentSubSection = "";
  let currentPreset = "";

  const weightKeyMap: Record<string, string> = {
    hits_at_k: "hitsAtK",
    context_relevance: "contextRelevance",
    context_recall: "contextRecall",
    faithfulness: "faithfulness",
    answer_relevance: "answerRelevance",
    numerical_accuracy: "numericalAccuracy",
    compliance_score: "complianceScore",
    hallucination_rate: "hallucinationRate",
    risk_disclosure: "riskDisclosure",
    timeliness: "timeliness",
    tool_selection: "toolSelection",
    planning: "planning",
    compliance: "compliance",
    consistency: "consistency",
    efficiency: "efficiency",
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;

    const indent = line.search(/\S/);

    if (indent === 0 && line.endsWith(":")) {
      const key = line.slice(0, -1).trim();
      currentSection = key;
      currentSubSection = "";
      currentPreset = "";
      if (key === "rag_weights") {
        result.rag_weights = {};
      } else if (key === "agent_weights") {
        result.agent_weights = {};
      } else if (key === "thresholds") {
        result.thresholds = {};
      } else if (key === "evaluation_levels") {
        result.evaluation_levels = {};
      } else if (key === "presets") {
        result.presets = {};
      }
      continue;
    }

    if (indent === 0 && line.includes(":")) {
      const colonIdx = line.indexOf(":");
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      if (key === "regression_alert" || key === "numerical_tolerance" || key === "compliance_minimum" || key === "hallucination_maximum") {
        if (!result.thresholds) result.thresholds = {};
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) result.thresholds[key] = numVal;
      }
      continue;
    }

    if (currentSection === "rag_weights" && indent >= 2 && !currentSubSection) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match && result.rag_weights) {
        const mappedKey = weightKeyMap[match[1]] || match[1];
        const numVal = parseFloat(match[2].trim());
        if (!isNaN(numVal)) result.rag_weights[mappedKey] = numVal;
      }
      continue;
    }

    if (currentSection === "agent_weights" && indent >= 2 && !currentSubSection) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match && result.agent_weights) {
        const mappedKey = weightKeyMap[match[1]] || match[1];
        const numVal = parseFloat(match[2].trim());
        if (!isNaN(numVal)) result.agent_weights[mappedKey] = numVal;
      }
      continue;
    }

    if (currentSection === "thresholds" && indent >= 2) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match && result.thresholds) {
        const numVal = parseFloat(match[2].trim());
        if (!isNaN(numVal)) result.thresholds[match[1]] = numVal;
      }
      continue;
    }

    if (currentSection === "evaluation_levels" && indent === 2 && line.trim().endsWith(":")) {
      const levelKey = line.trim().slice(0, -1);
      currentSubSection = levelKey;
      if (result.evaluation_levels) {
        result.evaluation_levels[levelKey] = {};
      }
      continue;
    }

    if (currentSection === "evaluation_levels" && currentSubSection && indent >= 4) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match && result.evaluation_levels && result.evaluation_levels[currentSubSection]) {
        const levelObj = result.evaluation_levels[currentSubSection];
        const key = match[1];
        const value = match[2].trim();
        if (key === "description") {
          levelObj.description = value.replace(/^["']|["']$/g, "");
        } else if (key === "data_sources") {
          const items = value.replace(/^\[|\]$/g, "").split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
          levelObj.data_sources = items.filter(Boolean);
        } else if (key === "timeout_minutes") {
          const numVal = parseFloat(value);
          if (!isNaN(numVal)) levelObj.timeout_minutes = numVal;
        }
      }
      continue;
    }

    if (currentSection === "presets" && indent === 2 && line.trim().endsWith(":")) {
      currentPreset = line.trim().slice(0, -1);
      currentSubSection = "";
      if (result.presets) {
        result.presets[currentPreset] = {};
      }
      continue;
    }

    if (currentSection === "presets" && currentPreset && indent === 4 && line.trim().endsWith(":")) {
      currentSubSection = line.trim().slice(0, -1);
      if (currentSubSection === "rag_weights" && result.presets && result.presets[currentPreset]) {
        result.presets[currentPreset].rag_weights = {};
      } else if (currentSubSection === "agent_weights" && result.presets && result.presets[currentPreset]) {
        result.presets[currentPreset].agent_weights = {};
      }
      continue;
    }

    if (currentSection === "presets" && currentPreset && indent === 4) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match && result.presets && result.presets[currentPreset]) {
        const key = match[1];
        const value = match[2].trim();
        if (key === "description") {
          result.presets[currentPreset].description = value.replace(/^["']|["']$/g, "");
        }
      }
      continue;
    }

    if (currentSection === "presets" && currentPreset && currentSubSection && indent >= 6) {
      const match = line.trim().match(/^(\w+):\s*(.+)$/);
      if (match && result.presets && result.presets[currentPreset]) {
        const presetObj = result.presets[currentPreset];
        const mappedKey = weightKeyMap[match[1]] || match[1];
        const numVal = parseFloat(match[2].trim());
        if (currentSubSection === "rag_weights" && presetObj.rag_weights && !isNaN(numVal)) {
          presetObj.rag_weights[mappedKey] = numVal;
        } else if (currentSubSection === "agent_weights" && presetObj.agent_weights && !isNaN(numVal)) {
          presetObj.agent_weights[mappedKey] = numVal;
        }
      }
      continue;
    }
  }

  return result;
}

function loadYamlConfig(): ParsedYamlConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      console.warn(`[run-evaluation] 配置文件不存在: ${CONFIG_PATH}，使用默认配置`);
      return {};
    }
    const content = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = parseSimpleYaml(content);
    console.log("[run-evaluation] 已加载 evaluation-config.yaml 配置");
    return config;
  } catch (error) {
    console.error("[run-evaluation] 加载配置文件失败，使用默认配置:", error);
    return {};
  }
}

interface CliArgs {
  level: "daily" | "standard" | "full";
  type: "rag" | "agent";
  milestone?: string;
  preset?: string;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    level: "standard",
    type: "rag",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--level" && args[i + 1]) {
      const level = args[i + 1];
      if (level === "daily" || level === "standard" || level === "full") {
        result.level = level;
      } else {
        console.warn(`[run-evaluation] 无效的评估级别: ${level}，使用默认值 standard`);
      }
      i++;
    } else if (args[i] === "--type" && args[i + 1]) {
      const type = args[i + 1];
      if (type === "rag" || type === "agent") {
        result.type = type;
      } else {
        console.warn(`[run-evaluation] 无效的评估类型: ${type}，使用默认值 rag`);
      }
      i++;
    } else if (args[i] === "--milestone" && args[i + 1]) {
      result.milestone = args[i + 1];
      i++;
    } else if (args[i] === "--preset" && args[i + 1]) {
      result.preset = args[i + 1];
      i++;
    }
  }

  return result;
}

function buildWeightsFromConfig(config: ParsedYamlConfig, preset?: string): EvaluationWeights {
  let sourceWeights = config.rag_weights;

  if (preset && config.presets && config.presets[preset]) {
    const presetConfig = config.presets[preset];
    if (presetConfig.rag_weights) {
      sourceWeights = presetConfig.rag_weights;
      console.log(`[run-evaluation] 使用预设 "${preset}" 的权重配置`);
    }
  }

  if (!sourceWeights) {
    console.log("[run-evaluation] 配置中无 rag_weights，使用默认权重");
    return {};
  }

  const weights: EvaluationWeights = {};
  const validKeys: (keyof EvaluationWeights)[] = [
    "hitsAtK", "contextRelevance", "contextRecall",
    "faithfulness", "answerRelevance", "numericalAccuracy",
    "complianceScore", "hallucinationRate", "riskDisclosure", "timeliness",
  ];

  for (const key of validKeys) {
    if (sourceWeights[key] !== undefined) {
      weights[key] = sourceWeights[key];
    }
  }

  return weights;
}

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

function printReport(report: EvaluationReport & {
  avgNumericalAccuracy?: number;
  avgComplianceScore?: number;
  avgHallucinationRate?: number;
  avgRiskDisclosureScore?: number;
  avgTimelinessScore?: number;
  financialOverallScore?: number;
  evaluationLevel?: string;
  milestone?: string;
}): void {
  console.log("\n" + "=".repeat(80));
  console.log("                    RAG 评估报告");
  console.log("=".repeat(80));
  console.log(`评估时间: ${report.timestamp}`);
  console.log(`测试用例数: ${report.totalTests}`);
  if (report.evaluationLevel) {
    console.log(`评估级别: ${report.evaluationLevel}`);
  }
  if (report.milestone) {
    console.log(`里程碑: ${report.milestone}`);
  }
  console.log("-".repeat(80));
  console.log("  综合指标:");
  console.log(`    Overall Score:      ${report.overallScore.toFixed(4)}`);
  console.log(`    Hits@K:             ${report.avgHitsAtK.toFixed(4)}`);
  console.log(`    Context Relevance:  ${report.avgContextRelevance.toFixed(4)}`);
  console.log(`    Context Recall:     ${report.avgContextRecall.toFixed(4)}`);
  console.log(`    Faithfulness:       ${report.avgFaithfulness.toFixed(4)}`);
  console.log(`    Answer Relevance:   ${report.avgAnswerRelevance.toFixed(4)}`);
  console.log("-".repeat(80));

  if (report.avgNumericalAccuracy !== undefined) {
    console.log("  金融专用指标:");
    console.log(`    Numerical Accuracy:  ${report.avgNumericalAccuracy.toFixed(4)}`);
    console.log(`    Compliance Score:    ${report.avgComplianceScore!.toFixed(4)}`);
    console.log(`    Hallucination Rate:  ${report.avgHallucinationRate!.toFixed(4)}`);
    console.log(`    Risk Disclosure:     ${report.avgRiskDisclosureScore!.toFixed(4)}`);
    console.log(`    Timeliness:          ${report.avgTimelinessScore!.toFixed(4)}`);
    console.log(`    Financial Overall:   ${report.financialOverallScore!.toFixed(4)}`);
    console.log("-".repeat(80));
  }

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
  const cliArgs = parseCliArgs();
  const config = loadYamlConfig();

  console.log(`[run-evaluation] 开始运行 RAG 评估`);
  console.log(`[run-evaluation] 评估级别: ${cliArgs.level}, 评估类型: ${cliArgs.type}${cliArgs.milestone ? `, 里程碑: ${cliArgs.milestone}` : ""}${cliArgs.preset ? `, 预设: ${cliArgs.preset}` : ""}`);
  console.log(`[run-evaluation] 黄金测试集路径: ${QA_GOLDEN_PATH}`);

  if (!fs.existsSync(QA_GOLDEN_PATH)) {
    console.error(`[run-evaluation] 黄金测试集文件不存在: ${QA_GOLDEN_PATH}`);
    process.exit(1);
  }

  const qaData = JSON.parse(fs.readFileSync(QA_GOLDEN_PATH, "utf-8"));
  console.log(`[run-evaluation] 加载测试集, 共 ${qaData.length} 条`);

  let testSet = qaData.map(
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

  if (cliArgs.level === "daily") {
    testSet = testSet.slice(0, Math.min(testSet.length, 10));
    console.log(`[run-evaluation] daily 模式，截取前 ${testSet.length} 条测试用例`);
  }

  const weights = buildWeightsFromConfig(config, cliArgs.preset);
  console.log(`[run-evaluation] 权重配置: ${JSON.stringify(weights)}`);

  if (config.thresholds) {
    console.log(`[run-evaluation] 阈值配置: ${JSON.stringify(config.thresholds)}`);
  }

  const report = await runFinancialEvaluation(testSet, searchFn, answerFn, {
    evaluationLevel: cliArgs.level,
    triggerMode: "manual",
    milestone: cliArgs.milestone,
    dataSource: cliArgs.level === "full" ? "mixed" : "golden",
    weights,
  });

  printReport(report);

  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    console.log(`[run-evaluation] 创建报告目录: ${REPORT_DIR}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(REPORT_DIR, `eval-report-${cliArgs.level}-${timestamp}.json`);

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

  await closeDb();
  process.exit(0);
}

main().catch((error) => {
  console.error("[run-evaluation] 评估运行失败:", error);
  process.exit(1);
});
