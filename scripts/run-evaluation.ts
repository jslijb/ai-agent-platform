import * as fs from "fs";
import * as path from "path";

// 增加Node.js fetch连接超时（默认10秒太短，AGNES AI经常超时）
// @ts-ignore - undici连接超时设置
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = "--max-old-space-size=4096";
}

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
import { callWithFallback } from "../src/server/llm/router";
import { closeDb } from "../src/server/db/client";
import {
  runFinancialEvaluation,
  computeNumericalDifference,
  type EvaluationReport,
  type EvaluationWeights,
  type SingleTestResult,
  DEFAULT_RAG_WEIGHTS,
} from "../src/server/evaluation/rag-evaluator";
import {
  runOpenDatasetEvaluation,
  DATASET_ADAPTERS,
  type OpenDatasetEvaluationOptions,
} from "../src/server/evaluation/open-dataset-evaluator";
import { resolveDatasetPath } from "../src/server/evaluation/dataset-adapter";

const QA_GOLDEN_PATH = path.resolve(__dirname, "qa-golden.json");
const REPORT_DIR = path.resolve(__dirname, "..", "tests/reports/evaluation");
const CONFIG_PATH = path.resolve(__dirname, "..", "config/evaluation-config.yaml");
// 断点续传进度文件路径
const PROGRESS_FILE_PATH = path.join(REPORT_DIR, "eval-progress.json");

const OPEN_DATASET_BASE_PATH = "D:\\data\\modelscope";
const OPEN_DATASET_MAX_SAMPLES = 200;
const OPEN_DATASET_NAMES = ["fineval", "cflue", "finqa"];

// V10优化：减少限流等待时间
// AllInOne合并评估后每条query仅2次LLM调用（1次检索后+1次生成），RPM压力大幅降低
// 每次查询间隔3秒（原来8秒）
const QUERY_DELAY_MS = 3000;
// 同一查询内 LLM 调用间隔1秒（原来5秒，AllInOne后评估阶段仅1次LLM调用）
const LLM_CALL_DELAY_MS = 1000;

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

/** 断点续传进度文件格式 */
interface EvalProgress {
  /** 评估唯一标识 */
  evaluationId: string;
  /** 评估开始时间 */
  startTime: string;
  /** 总查询数 */
  totalQueries: number;
  /** 已完成的查询ID列表 */
  completedQueries: string[];
  /** 已完成的结果列表 */
  results: SingleTestResult[];
  /** 最后更新时间 */
  lastUpdateTime: string;
}

/** 生成评估唯一ID */
function generateEvaluationId(): string {
  const now = new Date();
  return `eval-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
}

/** 辅助函数：延迟指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 加载断点续传进度文件 */
function loadProgress(): EvalProgress | null {
  try {
    if (!fs.existsSync(PROGRESS_FILE_PATH)) {
      console.log("[run-evaluation] 未发现断点续传进度文件，将从头开始评估");
      return null;
    }
    const content = fs.readFileSync(PROGRESS_FILE_PATH, "utf-8");
    const progress: EvalProgress = JSON.parse(content);
    console.log(`[run-evaluation] 发现断点续传进度文件: evaluationId=${progress.evaluationId}, 已完成 ${progress.completedQueries.length}/${progress.totalQueries} 条`);
    return progress;
  } catch (error) {
    console.error("[run-evaluation] 加载断点续传进度文件失败，将从头开始评估:", error);
    return null;
  }
}

/** 保存断点续传进度文件 */
function saveProgress(progress: EvalProgress): void {
  try {
    // 确保目录存在
    if (!fs.existsSync(REPORT_DIR)) {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
    }
    progress.lastUpdateTime = new Date().toISOString();
    fs.writeFileSync(PROGRESS_FILE_PATH, JSON.stringify(progress, null, 2), "utf-8");
  } catch (error) {
    console.error("[run-evaluation] 保存断点续传进度文件失败:", error);
  }
}

/** 创建新的断点续传进度文件 */
function createProgress(evaluationId: string, totalQueries: number): EvalProgress {
  const progress: EvalProgress = {
    evaluationId,
    startTime: new Date().toISOString(),
    totalQueries,
    completedQueries: [],
    results: [],
    lastUpdateTime: new Date().toISOString(),
  };
  saveProgress(progress);
  console.log(`[run-evaluation] 已创建断点续传进度文件: ${PROGRESS_FILE_PATH}`);
  return progress;
}

/** 计算预估剩余时间（分钟） */
function estimateRemainingTime(
  completedCount: number,
  totalCount: number,
  elapsedMs: number
): number {
  if (completedCount === 0) return 0;
  const avgTimePerQuery = elapsedMs / completedCount;
  const remainingQueries = totalCount - completedCount;
  return (avgTimePerQuery * remainingQueries) / (1000 * 60);
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
  datasets?: string;
  maxSamples?: number;
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
    } else if (args[i] === "--datasets" && args[i + 1]) {
      result.datasets = args[i + 1];
      i++;
    } else if (args[i] === "--max-samples" && args[i + 1]) {
      const n = parseInt(args[i + 1], 10);
      if (n > 0) {
        result.maxSamples = n;
      } else {
        console.warn(`[run-evaluation] 无效的 --max-samples: ${args[i + 1]}`);
      }
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
    const results = await hybridSearch(query, 10);
    console.log(`[run-evaluation] 检索返回 ${results.length} 条结果`);
    // AGNES 20 RPM 限流：同一查询内 LLM 调用间隔1秒
    await sleep(LLM_CALL_DELAY_MS);
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

    // AGNES 20 RPM 限流：LLM 调用前等待1秒
    await sleep(LLM_CALL_DELAY_MS);

    // 使用 LLM Router 进行多 provider 降级调用
    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个专业的金融领域问答助手。请根据提供的文档片段回答用户的问题。\n\n重要规则：\n1. 优先从文档中提取关键数据（如营业收入、净利润、增长率等）直接回答\n2. 【数值优先用文档原文汇总数字】如果文档中有汇总数字（如\"营业收入合计4529.30亿元\"），直接引用该汇总数字，不要自行加总各细分项计算\n3. 如果文档包含部分相关信息，请基于已有信息给出答案，并说明信息来源\n4. 如果文档中有相关数值，直接引用该数值作为答案，即使数值与问题中的公司/指标不完全匹配，也先给出找到的数据\n5. 回答要简洁直接：先给出核心数据（1-2句话），再补充简要说明\n6. 【减少冗长度】如需展示计算过程，使用 <details><summary>计算过程</summary>计算步骤</details> 折叠展示，主体答案只保留结论\n7. 不要过度谨慎：只要文档中有任何相关数据就应该回答，不要轻易说无法回答\n8. 如果文档中包含公司名称和对应财务数据，直接给出该数据\n9. 对于交易规则、技术指标、合规等问题，基于文档内容直接回答",
      },
      {
        role: "user",
        content: `以下是相关文档片段：\n\n${contextBlock}\n\n用户问题：${query}\n\n请基于以上文档片段回答问题。优先提取关键数据，直接给出答案。如果文档中有相关内容，不要说无法回答。`,
      },
    ]);

    console.log(
      `[run-evaluation] 答案生成完成, 模型: ${response.model}, provider: ${response.provider}, 长度: ${(response.content || "").length}`
    );
    return response.content || "";
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
  dataSource?: string;
  dataSourceDetail?: string;
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
  if (report.dataSource) {
    console.log(`数据来源: ${report.dataSource}`);
  }
  if (report.dataSourceDetail) {
    console.log(`数据来源详情: ${report.dataSourceDetail}`);
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

/**
 * 输出"需人工核查"汇总表
 * 收集所有 needsManualReview=true 的测试用例，按差值绝对值降序排列
 * 格式参照 spec：
 *   需人工核查的测试用例（共 X 条）：
 *   | ID | Query | 期望数值 | Agent数值 | 差值 | 数据来源 |
 * @param results - 评估结果列表
 */
function printManualReviewSummary(results: SingleTestResult[]): void {
  // 收集所有需人工核查的测试用例
  const reviewItems: Array<{
    id: number | string;
    query: string;
    expectedNumber: number;
    actualNumber: number;
    difference: number;
    absDifference: number;
    dataSource: string;
  }> = [];

  for (const r of results) {
    if (!r.comparison || !r.comparison.needsManualReview) continue;
    if (!r.comparison.numericalDifference || r.comparison.numericalDifference.length === 0) continue;

    // 取差值绝对值最大的不可接受项作为代表
    const unacceptableItems = r.comparison.numericalDifference.filter((d) => !d.isAcceptable);
    if (unacceptableItems.length === 0) continue;
    const maxDiffItem = unacceptableItems.reduce((max, cur) =>
      Math.abs(cur.difference) > Math.abs(max.difference) ? cur : max
    );

    // 数据来源：文档页码（如 "文档P8"），page 为 null 时显示 "文档P?"
    const ds = r.testAnswer?.dataSource;
    let dataSourceStr = "无";
    if (ds && ds.documentName) {
      const pageStr = ds.page != null ? `P${ds.page}` : "P?";
      dataSourceStr = pageStr;
    }

    reviewItems.push({
      id: r.id,
      query: r.query,
      expectedNumber: maxDiffItem.expectedNumber,
      actualNumber: maxDiffItem.actualNumber,
      difference: maxDiffItem.difference,
      absDifference: Math.abs(maxDiffItem.difference),
      dataSource: dataSourceStr,
    });
  }

  console.log("\n" + "=".repeat(80));
  if (reviewItems.length === 0) {
    console.log("  需人工核查的测试用例（共 0 条）：无");
    console.log("=".repeat(80) + "\n");
    return;
  }

  // 按差值绝对值降序排列
  reviewItems.sort((a, b) => b.absDifference - a.absDifference);

  console.log(`  需人工核查的测试用例（共 ${reviewItems.length} 条）：`);
  console.log("-".repeat(80));
  console.log(
    "  ID         | Query（截断显示）                       | 期望数值        | Agent数值       | 差值            | 数据来源"
  );
  console.log(
    "  -----------|-----------------------------------------|-----------------|-----------------|-----------------|----------"
  );
  for (const item of reviewItems) {
    const queryStr = item.query.length > 38 ? item.query.slice(0, 38) + "..." : item.query;
    console.log(
      `  ${String(item.id).padEnd(10)} | ${queryStr.padEnd(39)} | ${String(item.expectedNumber).padStart(15)} | ${String(item.actualNumber).padStart(15)} | ${String(item.difference).padStart(15)} | ${item.dataSource}`
    );
  }
  console.log("=".repeat(80) + "\n");
}

function checkOpenDatasetPath(): boolean {
  console.log(`[run-evaluation] 检查开源数据集路径: ${OPEN_DATASET_BASE_PATH}`);
  if (!fs.existsSync(OPEN_DATASET_BASE_PATH)) {
    console.warn(`[run-evaluation] 开源数据集路径不存在: ${OPEN_DATASET_BASE_PATH}`);
    console.warn("[run-evaluation] full 模式将跳过开源数据集评估，仅运行黄金测试集");
    return false;
  }

  const availableDatasets: string[] = [];
  for (const name of OPEN_DATASET_NAMES) {
    const adapter = DATASET_ADAPTERS[name];
    if (adapter) {
      // 使用 resolveDatasetPath 获取实际路径，而不是 adapter.basePath（load前为空）
      const resolvedPath = resolveDatasetPath(name);
      if (fs.existsSync(resolvedPath)) {
        availableDatasets.push(name);
        console.log(`[run-evaluation] 数据集 ${name} 路径可用: ${resolvedPath}`);
      } else {
        console.warn(`[run-evaluation] 数据集 ${name} 路径不存在: ${resolvedPath}`);
      }
    }
  }

  if (availableDatasets.length === 0) {
    console.warn("[run-evaluation] 没有可用的开源数据集，将跳过开源数据集评估");
    return false;
  }

  console.log(`[run-evaluation] 可用数据集: [${availableDatasets.join(", ")}]`);
  return true;
}

/** 从合并后的结果构建评估报告（避免重新运行查询） */
function buildReportFromResults(
  allResults: SingleTestResult[],
  cliArgs: CliArgs,
  weights: EvaluationWeights
): EvaluationReport & Record<string, unknown> {
  // 计算通用指标平均值
  const avgHitsAtK = allResults.reduce((sum, r) => sum + r.retrieval.hitsAtK, 0) / allResults.length;
  const avgContextRelevance = allResults.reduce((sum, r) => sum + r.retrieval.contextRelevance, 0) / allResults.length;
  const avgContextRecall = allResults.reduce((sum, r) => sum + r.retrieval.contextRecall, 0) / allResults.length;
  const avgFaithfulness = allResults.reduce((sum, r) => sum + r.answer.faithfulness, 0) / allResults.length;
  const avgAnswerRelevance = allResults.reduce((sum, r) => sum + r.answer.answerRelevance, 0) / allResults.length;

  const overallScore =
    avgHitsAtK * 0.2 +
    avgContextRelevance * 0.15 +
    avgContextRecall * 0.15 +
    avgFaithfulness * 0.25 +
    avgAnswerRelevance * 0.25;

  // 按分类统计
  const resultsByCategory: EvaluationReport["resultsByCategory"] = {};
  for (const r of allResults) {
    if (!resultsByCategory[r.category]) {
      resultsByCategory[r.category] = { count: 0, avgHitsAtK: 0, avgFaithfulness: 0, avgAnswerRelevance: 0 };
    }
    const cat = resultsByCategory[r.category];
    cat.count++;
    cat.avgHitsAtK += r.retrieval.hitsAtK;
    cat.avgFaithfulness += r.answer.faithfulness;
    cat.avgAnswerRelevance += r.answer.answerRelevance;
  }
  for (const cat of Object.values(resultsByCategory)) {
    cat.avgHitsAtK = Number((cat.avgHitsAtK / cat.count).toFixed(4));
    cat.avgFaithfulness = Number((cat.avgFaithfulness / cat.count).toFixed(4));
    cat.avgAnswerRelevance = Number((cat.avgAnswerRelevance / cat.count).toFixed(4));
  }

  // 按难度统计
  const resultsByDifficulty: EvaluationReport["resultsByDifficulty"] = {};
  for (const r of allResults) {
    if (!resultsByDifficulty[r.difficulty]) {
      resultsByDifficulty[r.difficulty] = { count: 0, avgHitsAtK: 0, avgFaithfulness: 0, avgAnswerRelevance: 0 };
    }
    const diff = resultsByDifficulty[r.difficulty];
    diff.count++;
    diff.avgHitsAtK += r.retrieval.hitsAtK;
    diff.avgFaithfulness += r.answer.faithfulness;
    diff.avgAnswerRelevance += r.answer.answerRelevance;
  }
  for (const diff of Object.values(resultsByDifficulty)) {
    diff.avgHitsAtK = Number((diff.avgHitsAtK / diff.count).toFixed(4));
    diff.avgFaithfulness = Number((diff.avgFaithfulness / diff.count).toFixed(4));
    diff.avgAnswerRelevance = Number((diff.avgAnswerRelevance / diff.count).toFixed(4));
  }

  const report: EvaluationReport & Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    totalTests: allResults.length,
    avgHitsAtK: Number(avgHitsAtK.toFixed(4)),
    avgContextRelevance: Number(avgContextRelevance.toFixed(4)),
    avgContextRecall: Number(avgContextRecall.toFixed(4)),
    avgFaithfulness: Number(avgFaithfulness.toFixed(4)),
    avgAnswerRelevance: Number(avgAnswerRelevance.toFixed(4)),
    overallScore: Number(overallScore.toFixed(4)),
    resultsByCategory,
    resultsByDifficulty,
    results: allResults,
    // 附加信息
    evaluationLevel: cliArgs.level,
    milestone: cliArgs.milestone,
    dataSource: "golden",
  };

  return report;
}

async function runGoldenEvaluation(
  cliArgs: CliArgs,
  config: ParsedYamlConfig,
  weights: EvaluationWeights
): Promise<EvaluationReport & Record<string, unknown>> {
  console.log("[run-evaluation] ========== 黄金测试集评估 ==========");

  if (!fs.existsSync(QA_GOLDEN_PATH)) {
    throw new Error(`黄金测试集文件不存在: ${QA_GOLDEN_PATH}`);
  }

  const qaData = JSON.parse(fs.readFileSync(QA_GOLDEN_PATH, "utf-8"));
  console.log(`[run-evaluation] 加载黄金测试集, 共 ${qaData.length} 条`);

  let testSet = qaData.map(
    (item: {
      id: number;
      query: string;
      expectedAnswer: string;
      category: string;
      difficulty: string;
      // 支持 canAnswer 字段，默认 true（向后兼容）
      canAnswer?: boolean;
      // 数据来源（文档名、页码、原文）
      dataSource?: {
        documentName: string;
        documentId?: string;
        page?: number | null;
        originalText: string;
      } | null;
      // 数值计算方式说明
      calculationMethod?: string | null;
    }) => ({
      id: item.id,
      query: item.query,
      expectedAnswer: item.expectedAnswer,
      category: item.category,
      difficulty: item.difficulty,
      // 读取 canAnswer 字段，不存在则默认为 true
      canAnswer: item.canAnswer ?? true,
      // 传递数据来源和计算方式，用于评估报告 testAnswer 字段
      dataSource: item.dataSource ?? null,
      calculationMethod: item.calculationMethod ?? null,
    })
  );

  if (cliArgs.level === "daily") {
    testSet = testSet.slice(0, Math.min(testSet.length, 10));
    console.log(`[run-evaluation] daily 模式，截取前 ${testSet.length} 条测试用例`);
  }

  // ===== 断点续传逻辑 =====
  const evaluationId = generateEvaluationId();
  const existingProgress = loadProgress();
  let progress: EvalProgress;
  let previousResults: SingleTestResult[] = [];
  let remainingTestSet = testSet;

  if (existingProgress && existingProgress.totalQueries === testSet.length) {
    // 进度文件存在且总数匹配，尝试恢复
    progress = existingProgress;
    // 重新运行最后1-2条可能被中断的查询
    const reRunCount = Math.min(2, progress.completedQueries.length);
    const skipCount = Math.max(0, progress.completedQueries.length - reRunCount);
    // 保留已确认完成的结果
    previousResults = progress.results.slice(0, skipCount);
    // 剩余需要运行的测试项（包括可能被中断的）
    remainingTestSet = testSet.slice(skipCount);
    console.log(`[run-evaluation] 断点续传: 已完成 ${skipCount} 条，剩余 ${remainingTestSet.length} 条（含重新运行 ${reRunCount} 条可能被中断的查询）`);
  } else {
    // 无进度文件或总数不匹配，从头开始
    progress = createProgress(evaluationId, testSet.length);
    previousResults = [];
    console.log(`[run-evaluation] 从头开始评估，共 ${testSet.length} 条查询`);
  }

  // ===== 逐条评估（支持断点续传和限流） =====
  const totalToRun = remainingTestSet.length;
  const evalStartTime = Date.now();
  let completedInThisRun = 0;
  const newResults: SingleTestResult[] = [];

  for (let i = 0; i < remainingTestSet.length; i++) {
    const testItem = remainingTestSet[i];
    const queryId = `L${cliArgs.level === "daily" ? "D" : cliArgs.level === "standard" ? "S" : "F"}-${String(testItem.id).padStart(3, "0")}`;
    const itemStart = Date.now();

    console.log(`[run-evaluation] 评估第 ${previousResults.length + i + 1}/${testSet.length} 条 [${queryId}], query: "${testItem.query.slice(0, 50)}...", canAnswer: ${testItem.canAnswer}`);

    // AGNES 20 RPM 限流：每次查询间隔3秒（第一条不等待）
    if (i > 0) {
      console.log(`[run-evaluation] ⏳ 等待 ${QUERY_DELAY_MS / 1000} 秒（AGNES 20 RPM 限流）...`);
      await sleep(QUERY_DELAY_MS);
    }

    try {
      // 对单条测试项运行完整评估（包含所有指标计算）
      const singleReport = await runFinancialEvaluation(
        [testItem],
        searchFn,
        answerFn,
        {
          evaluationLevel: cliArgs.level,
          triggerMode: "manual",
          milestone: cliArgs.milestone,
          dataSource: "golden",
          weights,
        }
      );

      const resultItem = singleReport.results[0];
      const durationMs = Date.now() - itemStart;

      // 更新耗时为实际测量值
      if (resultItem) {
        resultItem.durationMs = durationMs;
        newResults.push(resultItem);
      }

      // 追加到进度文件
      progress.completedQueries.push(queryId);
      progress.results = [...previousResults, ...newResults];
      saveProgress(progress);

      completedInThisRun++;
      // 进度日志：[X/total] 查询完成，耗时Yms，预估Z分钟剩余
      const totalCompleted = previousResults.length + completedInThisRun;
      const elapsedMs = Date.now() - evalStartTime;
      const remainingMin = estimateRemainingTime(completedInThisRun, totalToRun, elapsedMs);
      console.log(`[run-evaluation] [${totalCompleted}/${testSet.length}] 查询 ${queryId} 完成，耗时 ${durationMs}ms，预估剩余 ${remainingMin.toFixed(1)} 分钟`);
    } catch (error) {
      console.error(`[run-evaluation] 第 ${previousResults.length + i + 1} 条 [${queryId}] 评估失败:`, error);

      const durationMs = Date.now() - itemStart;
      const resultItem: SingleTestResult = {
        id: testItem.id,
        query: testItem.query,
        expectedAnswer: testItem.expectedAnswer,
        actualAnswer: "",
        retrieval: { hitsAtK: 0, contextRelevance: 0, contextRecall: 0 },
        answer: { faithfulness: 0, answerRelevance: 0 },
        category: testItem.category ?? "未分类",
        difficulty: testItem.difficulty ?? "medium",
        canAnswer: testItem.canAnswer,
        durationMs,
        isError: true,
        testAnswer: {
          expectedAnswer: testItem.expectedAnswer,
          dataSource: testItem.dataSource ?? null,
          calculationMethod: testItem.calculationMethod ?? null,
        },
        comparison: computeNumericalDifference(testItem.expectedAnswer, ""),
      };

      newResults.push(resultItem);
      progress.completedQueries.push(queryId);
      progress.results = [...previousResults, ...newResults];
      saveProgress(progress);

      completedInThisRun++;
      const totalCompleted = previousResults.length + completedInThisRun;
      const elapsedMs = Date.now() - evalStartTime;
      const remainingMin = estimateRemainingTime(completedInThisRun, totalToRun, elapsedMs);
      console.log(`[run-evaluation] [${totalCompleted}/${testSet.length}] 查询 ${queryId} 失败，耗时 ${durationMs}ms，预估剩余 ${remainingMin.toFixed(1)} 分钟`);
    }
  }

  // ===== 合并结果并生成最终报告 =====
  const allResults = [...previousResults, ...newResults];
  console.log(`[run-evaluation] 所有查询评估完成，共 ${allResults.length} 条结果（其中断点续传恢复 ${previousResults.length} 条，本次运行 ${newResults.length} 条）`);

  // 用合并后的结果构建最终报告
  const report = buildReportFromResults(allResults, cliArgs, weights);

  // 保留进度文件（不删除）
  console.log(`[run-evaluation] 评估完成，保留断点续传进度文件: ${PROGRESS_FILE_PATH}`);

  return report as EvaluationReport & Record<string, unknown>;
}

async function runOpenDatasetPhase(
  cliArgs: CliArgs,
  maxSamples: number
): Promise<EvaluationReport & Record<string, unknown> | null> {
  console.log("[run-evaluation] ========== 开源数据集评估 ==========");

  const datasetNames = cliArgs.datasets
    ? cliArgs.datasets.split(",").map(s => s.trim().toLowerCase())
    : OPEN_DATASET_NAMES;

  const validDatasets = datasetNames.filter(name => {
    if (!DATASET_ADAPTERS[name]) {
      console.warn(`[run-evaluation] 未知数据集: ${name}, 可用: [${Object.keys(DATASET_ADAPTERS).join(",")}]`);
      return false;
    }
    return true;
  });

  if (validDatasets.length === 0) {
    console.error("[run-evaluation] 没有有效的数据集名称");
    return null;
  }

  console.log(`[run-evaluation] 将评估数据集: [${validDatasets.join(", ")}], 最大样本数: ${maxSamples}`);

  const perDatasetSamples = Math.ceil(maxSamples / validDatasets.length);
  console.log(`[run-evaluation] 每个数据集最大样本数: ${perDatasetSamples}`);

  try {
    const report = await runOpenDatasetEvaluation(
      validDatasets,
      searchFn,
      answerFn,
      {
        maxSamples: perDatasetSamples,
        evaluationLevel: cliArgs.level,
        triggerMode: "manual",
        milestone: cliArgs.milestone,
      }
    );

    return report;
  } catch (error) {
    console.error("[run-evaluation] 开源数据集评估失败:", error);
    return null;
  }
}

function saveReport(report: Record<string, unknown>, level: string, suffix?: string): string {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    console.log(`[run-evaluation] 创建报告目录: ${REPORT_DIR}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = suffix
    ? `eval-report-${level}-${suffix}-${timestamp}.json`
    : `eval-report-${level}-${timestamp}.json`;
  const reportPath = path.join(REPORT_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[run-evaluation] 评估报告已保存: ${reportPath}`);

  const latestReportPath = path.join(REPORT_DIR, "latest.json");
  fs.writeFileSync(latestReportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[run-evaluation] 最新报告已更新: ${latestReportPath}`);

  return reportPath;
}

async function main(): Promise<void> {
  const cliArgs = parseCliArgs();
  const config = loadYamlConfig();

  console.log(`[run-evaluation] 开始运行 RAG 评估`);
  console.log(`[run-evaluation] 评估级别: ${cliArgs.level}, 评估类型: ${cliArgs.type}${cliArgs.milestone ? `, 里程碑: ${cliArgs.milestone}` : ""}${cliArgs.preset ? `, 预设: ${cliArgs.preset}` : ""}`);

  const weights = buildWeightsFromConfig(config, cliArgs.preset);
  console.log(`[run-evaluation] 权重配置: ${JSON.stringify(weights)}`);

  if (config.thresholds) {
    console.log(`[run-evaluation] 阈值配置: ${JSON.stringify(config.thresholds)}`);
  }

  const maxSamples = cliArgs.maxSamples ?? OPEN_DATASET_MAX_SAMPLES;

  if (cliArgs.level === "daily") {
    console.log("\n[run-evaluation] >>> daily 模式: 仅黄金测试集（10条），快速验证");
    const report = await runGoldenEvaluation(cliArgs, config, weights);
    printReport(report);
    printManualReviewSummary(report.results);
    saveReport(report, cliArgs.level);

  } else if (cliArgs.level === "standard") {
    console.log("\n[run-evaluation] >>> standard 模式: 黄金测试集（103条），标准评估");
    const report = await runGoldenEvaluation(cliArgs, config, weights);
    printReport(report);
    printManualReviewSummary(report.results);
    saveReport(report, cliArgs.level);

  } else if (cliArgs.level === "full") {
    console.log("\n[run-evaluation] >>> full 模式: 黄金测试集 + 开源数据集，全面评估");

    console.log("\n[run-evaluation] 阶段 1/2: 黄金测试集评估（103条）");
    const goldenReport = await runGoldenEvaluation(cliArgs, config, weights);
    printReport(goldenReport);
    printManualReviewSummary(goldenReport.results);
    saveReport(goldenReport, cliArgs.level, "golden");

    const datasetPathExists = checkOpenDatasetPath();

    if (datasetPathExists) {
      console.log(`\n[run-evaluation] 阶段 2/2: 开源数据集评估（最大 ${maxSamples} 条）`);
      const openReport = await runOpenDatasetPhase(cliArgs, maxSamples);

      if (openReport) {
        printReport(openReport);
        printManualReviewSummary(openReport.results);
        saveReport(openReport, cliArgs.level, "opendataset");

        console.log("\n" + "=".repeat(80));
        console.log("                    全面评估汇总");
        console.log("=".repeat(80));
        console.log(`黄金测试集 (${goldenReport.totalTests} 条):`);
        console.log(`  Overall Score:       ${goldenReport.overallScore.toFixed(4)}`);
        console.log(`  Financial Overall:   ${(goldenReport as Record<string, unknown>).financialOverallScore ?? "N/A"}`);
        console.log(`开源数据集 (${openReport.totalTests} 条):`);
        console.log(`  Overall Score:       ${openReport.overallScore.toFixed(4)}`);
        console.log(`  Financial Overall:   ${(openReport as Record<string, unknown>).financialOverallScore ?? "N/A"}`);
        console.log("=".repeat(80) + "\n");
      } else {
        console.warn("[run-evaluation] 开源数据集评估失败，仅保存黄金测试集报告");
      }
    } else {
      console.warn("\n[run-evaluation] 开源数据集路径不可用，跳过阶段 2");
      console.warn("[run-evaluation] 如需开源数据集评估，请确保数据已下载到: " + OPEN_DATASET_BASE_PATH);
    }
  }

  console.log("[run-evaluation] 评估运行完成");

  await closeDb();
  process.exit(0);
}

main().catch((error) => {
  console.error("[run-evaluation] 评估运行失败:", error);
  process.exit(1);
});
