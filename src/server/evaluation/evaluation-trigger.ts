import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import { runFinancialEvaluation } from "@/server/evaluation/rag-evaluator";
import { runAgentEvaluation } from "@/server/evaluation/agent-evaluator";
import { saveEvaluationVersion } from "@/server/evaluation/evaluation-history";
import { hybridSearch } from "@/server/rag/retrieval/hybrid-retriever";
import { callWithFallback } from "@/server/llm/router";

const CONFIG_PATH = path.resolve(process.cwd(), "config/evaluation-config.yaml");

type TriggerMode = "manual" | "auto";
type EvaluationLevel = "daily" | "standard" | "full";
type EvaluationType = "rag" | "agent";
type AutoTriggerEvent = "schedule" | "post_deploy" | "post_document_update" | "error_rate_spike";

interface TriggerConfig {
  default_mode: TriggerMode;
  auto: {
    schedule: { enabled: boolean; cron: string; level: EvaluationLevel };
    post_deploy: { enabled: boolean; level: EvaluationLevel };
    post_document_update: { enabled: boolean; level: EvaluationLevel };
    error_rate_spike: { enabled: boolean; threshold: number; level: EvaluationLevel };
  };
}

interface EvaluationConfig {
  trigger: TriggerConfig;
  [key: string]: unknown;
}

function loadConfig(): EvaluationConfig {
  console.log("[evaluation-trigger] 加载评估配置文件");

  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("[evaluation-trigger] 配置文件不存在: " + CONFIG_PATH);
    throw new Error("评估配置文件不存在: " + CONFIG_PATH);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = yaml.load(raw) as EvaluationConfig;
    console.log("[evaluation-trigger] 配置文件加载成功");
    return config;
  } catch (error) {
    console.error("[evaluation-trigger] 配置文件加载失败:", error);
    throw error;
  }
}

function saveConfig(config: EvaluationConfig): void {
  console.log("[evaluation-trigger] 保存评估配置文件");

  try {
    const content = yaml.dump(config, { indent: 2, lineWidth: 120 });
    fs.writeFileSync(CONFIG_PATH, content, "utf-8");
    console.log("[evaluation-trigger] 配置文件保存成功");
  } catch (error) {
    console.error("[evaluation-trigger] 配置文件保存失败:", error);
    throw error;
  }
}

export function getTriggerMode(): TriggerMode {
  console.log("[evaluation-trigger] 获取当前触发模式");

  try {
    const config = loadConfig();
    const mode = config.trigger?.default_mode ?? "manual";
    console.log(`[evaluation-trigger] 当前触发模式: ${mode}`);
    return mode;
  } catch (error) {
    console.error("[evaluation-trigger] 获取触发模式失败，降级为手动模式:", error);
    return "manual";
  }
}

export function setTriggerMode(mode: TriggerMode): void {
  console.log(`[evaluation-trigger] 设置触发模式为: ${mode}`);

  if (mode !== "manual" && mode !== "auto") {
    console.error(`[evaluation-trigger] 无效的触发模式: ${mode}`);
    throw new Error(`无效的触发模式: ${mode}，有效值为 manual 或 auto`);
  }

  try {
    const config = loadConfig();
    config.trigger.default_mode = mode;
    saveConfig(config);
    console.log(`[evaluation-trigger] 触发模式已设置为: ${mode}`);
  } catch (error) {
    console.error("[evaluation-trigger] 设置触发模式失败:", error);
    throw error;
  }
}

export function shouldAutoTrigger(event: AutoTriggerEvent): boolean {
  console.log(`[evaluation-trigger] 判断是否应该自动触发评估, 事件: ${event}`);

  try {
    const config = loadConfig();
    const currentMode = config.trigger?.default_mode ?? "manual";

    if (currentMode !== "auto") {
      console.log(`[evaluation-trigger] 当前模式为 ${currentMode}，不自动触发`);
      return false;
    }

    const autoConfig = config.trigger?.auto;
    if (!autoConfig) {
      console.log("[evaluation-trigger] 自动触发配置不存在，不自动触发");
      return false;
    }

    let result = false;

    switch (event) {
      case "schedule":
        result = autoConfig.schedule?.enabled ?? false;
        console.log(`[evaluation-trigger] 定时触发配置: enabled=${result}`);
        break;
      case "post_deploy":
        result = autoConfig.post_deploy?.enabled ?? false;
        console.log(`[evaluation-trigger] 部署后触发配置: enabled=${result}`);
        break;
      case "post_document_update":
        result = autoConfig.post_document_update?.enabled ?? false;
        console.log(`[evaluation-trigger] 文档更新后触发配置: enabled=${result}`);
        break;
      case "error_rate_spike":
        result = autoConfig.error_rate_spike?.enabled ?? false;
        console.log(`[evaluation-trigger] 错误率上升触发配置: enabled=${result}`);
        break;
      default:
        console.error(`[evaluation-trigger] 未知的事件类型: ${event}`);
        result = false;
    }

    console.log(`[evaluation-trigger] 自动触发判断结果: ${result}, 事件: ${event}`);
    return result;
  } catch (error) {
    console.error("[evaluation-trigger] 判断自动触发失败:", error);
    return false;
  }
}

async function loadGoldenTestSet(): Promise<Array<{
  id: number;
  query: string;
  expectedAnswer: string;
  category: string;
  difficulty: string;
}>> {
  console.log("[evaluation-trigger] 加载黄金测试集");

  const qaGoldenPath = path.resolve(process.cwd(), "scripts", "qa-golden.json");

  if (!fs.existsSync(qaGoldenPath)) {
    console.error(`[evaluation-trigger] 黄金测试集文件不存在: ${qaGoldenPath}`);
    throw new Error(`黄金测试集文件不存在: ${qaGoldenPath}`);
  }

  try {
    const raw = fs.readFileSync(qaGoldenPath, "utf-8");
    const data = JSON.parse(raw);
    console.log(`[evaluation-trigger] 黄金测试集加载成功, 共 ${data.length} 条`);

    return data.map(
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
  } catch (error) {
    console.error("[evaluation-trigger] 黄金测试集加载失败:", error);
    throw error;
  }
}

async function searchFn(
  query: string
): Promise<Array<{ text: string; score: number }>> {
  console.log(`[evaluation-trigger] 检索查询: "${query.slice(0, 50)}..."`);

  try {
    const results = await hybridSearch(query, 5);
    console.log(`[evaluation-trigger] 检索返回 ${results.length} 条结果`);
    return results.map((r) => ({
      text: r.text,
      score: r.score,
    }));
  } catch (error) {
    console.error("[evaluation-trigger] 检索失败:", error);
    return [];
  }
}

async function answerFn(
  query: string,
  searchResults: Array<{ text: string; score: number }>
): Promise<string> {
  console.log(
    `[evaluation-trigger] 生成答案, query: "${query.slice(0, 50)}...", 上下文数: ${searchResults.length}`
  );

  if (searchResults.length === 0) {
    console.log("[evaluation-trigger] 无检索结果，返回默认答案");
    return "抱歉，未找到与您问题相关的信息。";
  }

  try {
    const contextBlock = searchResults
      .map((r, i) => `[文档片段${i + 1}]\n${r.text}`)
      .join("\n\n");

    const response = await callWithFallback([
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
      `[evaluation-trigger] 答案生成完成, 长度: ${(response.content ?? "").length}`
    );
    return response.content ?? "";
  } catch (error) {
    console.error("[evaluation-trigger] 答案生成失败:", error);
    return "答案生成失败，请稍后重试。";
  }
}

export async function triggerEvaluation(
  level: EvaluationLevel,
  type: EvaluationType,
  milestone?: string
): Promise<{ success: boolean; version?: number; message?: string }> {
  console.log(
    `[evaluation-trigger] 触发评估, 级别: ${level}, 类型: ${type}, 里程碑: ${milestone ?? "无"}`
  );

  const triggerMode = getTriggerMode();
  console.log(`[evaluation-trigger] 当前触发模式: ${triggerMode}`);

  try {
    const testSet = await loadGoldenTestSet();

    if (testSet.length === 0) {
      console.error("[evaluation-trigger] 黄金测试集为空，无法执行评估");
      return { success: false, message: "黄金测试集为空，无法执行评估" };
    }

    if (type === "rag") {
      console.log(`[evaluation-trigger] 开始执行 RAG 金融评估, 级别: ${level}`);

      const report = await runFinancialEvaluation(testSet, searchFn, answerFn, {
        evaluationLevel: level,
        triggerMode,
        milestone,
        dataSource: "golden",
      });

      console.log(
        `[evaluation-trigger] RAG 金融评估完成, 综合评分: ${report.financialOverallScore}, 测试数: ${report.totalTests}`
      );

      const versionId = await saveEvaluationVersion({
        ...report,
        evaluationType: "rag",
      });

      console.log(`[evaluation-trigger] 评估结果已保存, versionId: ${versionId}`);
      return { success: true, version: versionId, message: "RAG评估执行成功" };
    }

    if (type === "agent") {
      console.log(`[evaluation-trigger] 开始执行 Agent 评估, 级别: ${level}`);

      const agentTestCases = testSet.map((item) => ({
        id: String(item.id),
        query: item.query,
        expectedToolTypes: [] as string[],
        requiredAspects: [item.category],
      }));

      const agentRunFn = async (
        testCase: (typeof agentTestCases)[number]
      ) => {
        console.log(`[evaluation-trigger] Agent 运行测试用例, id: ${testCase.id}`);

        const startTime = Date.now();
        const searchResults = await searchFn(testCase.query);
        const answer = await answerFn(testCase.query, searchResults);
        const durationMs = Date.now() - startTime;

        return {
          answer,
          toolCalls: [] as Array<{ tool: string; round: number }>,
          iterations: 1,
          durationMs,
          totalTokens: null as number | null,
        };
      };

      const report = await runAgentEvaluation(agentTestCases, agentRunFn, {
        evaluationLevel: level,
        triggerMode,
        milestone,
        dataSource: "golden",
      });

      console.log(
        `[evaluation-trigger] Agent 评估完成, 综合评分: ${report.agentOverallScore}, 测试数: ${report.totalTests}`
      );

      const versionId = await saveEvaluationVersion(report);

      console.log(`[evaluation-trigger] 评估结果已保存, versionId: ${versionId}`);
      return { success: true, version: versionId, message: "Agent评估执行成功" };
    }

    console.error(`[evaluation-trigger] 不支持的评估类型: ${type}`);
    return { success: false, message: `不支持的评估类型: ${type}` };
  } catch (error) {
    console.error("[evaluation-trigger] 触发评估失败:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "评估执行失败",
    };
  }
}

export function getAutoTriggerLevel(event: AutoTriggerEvent): EvaluationLevel {
  console.log(`[evaluation-trigger] 获取自动触发的评估级别, 事件: ${event}`);

  try {
    const config = loadConfig();
    const autoConfig = config.trigger?.auto;

    if (!autoConfig) {
      console.log("[evaluation-trigger] 自动触发配置不存在，返回默认级别 standard");
      return "standard";
    }

    let level: EvaluationLevel = "standard";

    switch (event) {
      case "schedule":
        level = autoConfig.schedule?.level ?? "daily";
        break;
      case "post_deploy":
        level = autoConfig.post_deploy?.level ?? "standard";
        break;
      case "post_document_update":
        level = autoConfig.post_document_update?.level ?? "daily";
        break;
      case "error_rate_spike":
        level = autoConfig.error_rate_spike?.level ?? "standard";
        break;
    }

    console.log(`[evaluation-trigger] 自动触发评估级别: ${level}, 事件: ${event}`);
    return level;
  } catch (error) {
    console.error("[evaluation-trigger] 获取自动触发级别失败:", error);
    return "standard";
  }
}

export type { TriggerMode, EvaluationLevel, EvaluationType, AutoTriggerEvent, EvaluationConfig, TriggerConfig };
