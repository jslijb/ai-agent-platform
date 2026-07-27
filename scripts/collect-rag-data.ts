/**
 * RAGAS 评估数据收集脚本
 *
 * 功能：
 *   1. 读取 qa-golden.json 测试集
 *   2. 对每个测试项调用 hybridSearch（检索）和 callWithFallback（生成）
 *   3. 保存数据到 JSON 文件，供 Python RAGAS 评估脚本使用
 *
 * 输出格式（RAGAS 兼容）：
 *   {
 *     "question": "query",
 *     "answer": "actualAnswer",
 *     "contexts": ["context1", "context2", ...],
 *     "ground_truth": "expectedAnswer",
 *     "id": "L1-001",
 *     "category": "L1-事实提取",
 *     "canAnswer": true
 *   }
 *
 * 用法：
 *   npx tsx scripts/collect-rag-data.ts [--limit N] [--output PATH]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { hybridSearch } from "../src/server/rag/retrieval/hybrid-retriever";
import { callWithFallback } from "../src/server/llm/router";
import { closeDb } from "../src/server/db/client";

// 日志工具
const log = {
  info: (msg: string) => console.log(`[collect-rag-data] ${msg}`),
  error: (msg: string) => console.error(`[collect-rag-data] ERROR: ${msg}`),
  warn: (msg: string) => console.warn(`[collect-rag-data] WARN: ${msg}`),
};

// 配置常量
const CONFIG = {
  // 测试集路径
  testSetPath: join(process.cwd(), "scripts", "qa-golden.json"),
  // 默认输出目录
  defaultOutputDir: join(process.cwd(), "tests", "reports", "evaluation"),
  // 默认输出文件名
  defaultOutputFile: "ragas-eval-data.json",
  // 检索 topK
  retrievalTopK: 10,
  // LLM 调用间隔（毫秒），避免 RPM 限流
  llmCallDelayMs: 1000,
  // 单个检索片段最大长度（避免 token 过多）
  maxContextLength: 1000,
};

// 测试项接口
interface QATestItem {
  id?: string | number;
  query: string;
  expectedAnswer: string;
  category?: string;
  difficulty?: string;
  canAnswer?: boolean;
}

// RAGAS 评估数据项接口
interface RagasEvalItem {
  id: string;
  question: string;
  answer: string;
  contexts: string[];
  ground_truth: string;
  category: string;
  canAnswer: boolean;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
}

// 解析命令行参数
function parseArgs(): { limit?: number; output?: string } {
  const args = process.argv.slice(2);
  const result: { limit?: number; output?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      result.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--output" && args[i + 1]) {
      result.output = args[i + 1];
      i++;
    }
  }

  return result;
}

// 睡眠函数
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 加载测试集
function loadTestSet(): QATestItem[] {
  log.info(`加载测试集: ${CONFIG.testSetPath}`);
  const content = readFileSync(CONFIG.testSetPath, "utf-8");
  const testSet = JSON.parse(content) as QATestItem[];
  log.info(`测试集加载完成，共 ${testSet.length} 条`);
  return testSet;
}

// 检索函数
async function retrieveContexts(
  query: string
): Promise<{ contexts: string[]; latencyMs: number }> {
  const startTime = Date.now();
  try {
    const results = await hybridSearch(query, CONFIG.retrievalTopK);
    const latencyMs = Date.now() - startTime;
    const contexts = results
      .map((r) => r.text.slice(0, CONFIG.maxContextLength))
      .filter((t) => t.length > 0);
    log.info(
      `检索完成: query="${query.slice(0, 30)}...", 结果数=${contexts.length}, 耗时=${latencyMs}ms`
    );
    return { contexts, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    log.error(`检索失败: query="${query.slice(0, 30)}...", error=${error}`);
    return { contexts: [], latencyMs };
  }
}

// 生成答案函数
async function generateAnswer(
  query: string,
  contexts: string[]
): Promise<{ answer: string; latencyMs: number }> {
  const startTime = Date.now();

  if (contexts.length === 0) {
    log.warn(`无检索结果，返回默认拒绝答案`);
    return {
      answer: "抱歉，未找到与您问题相关的信息。",
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    const contextBlock = contexts
      .map((c, i) => `[文档片段${i + 1}]\n${c}`)
      .join("\n\n");

    // LLM 调用前等待，避免 RPM 限流
    await sleep(CONFIG.llmCallDelayMs);

    const response = await callWithFallback([
      {
        role: "system",
        content:
          "你是一个专业的金融领域问答助手。请根据提供的文档片段回答用户的问题。\n\n重要规则：\n1. 优先从文档中提取关键数据（如营业收入、净利润、增长率等）直接回答\n2. 数值优先采用文档原文汇总数字，不要自行加总各细分项计算\n3. 如果文档包含部分相关信息，请基于已有信息给出答案，并说明信息来源\n4. 如果文档中有相关数值，直接引用该数值作为答案\n5. 回答要简洁直接：先给出核心数据（1-2句话），再补充简要说明\n6. 如需展示计算过程，使用 <details><summary>计算过程</summary>计算步骤</details> 折叠展示，主体答案只保留结论\n7. 不要过度谨慎：只要文档中有任何相关数据就应该回答，不要轻易说无法回答\n8. 如果文档中包含公司名称和对应财务数据，直接给出该数据\n9. 对于交易规则、技术指标、合规等问题，基于文档内容直接回答",
      },
      {
        role: "user",
        content: `以下是相关文档片段：\n\n${contextBlock}\n\n用户问题：${query}\n\n请基于以上文档片段回答问题。优先提取关键数据，直接给出答案。如果文档中有相关内容，不要说无法回答。`,
      },
    ]);

    const answer = response.content ?? "";
    const latencyMs = Date.now() - startTime;
    log.info(
      `答案生成完成: query="${query.slice(0, 30)}...", 长度=${answer.length}, 耗时=${latencyMs}ms`
    );
    return { answer, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    log.error(`答案生成失败: query="${query.slice(0, 30)}...", error=${error}`);
    return {
      answer: "抱歉，生成答案时发生错误。",
      latencyMs,
    };
  }
}

// 收集单个测试项的数据
async function collectSingleItem(
  testItem: QATestItem,
  index: number,
  total: number
): Promise<RagasEvalItem> {
  const itemId = String(testItem.id ?? `item-${index + 1}`);
  log.info(
    `=== 收集第 ${index + 1}/${total} 条数据, id=${itemId}, query="${testItem.query.slice(
      0,
      50
    )}..." ===`
  );

  // 检索
  const { contexts, latencyMs: retrievalLatencyMs } = await retrieveContexts(
    testItem.query
  );

  // 生成答案
  const { answer, latencyMs: generationLatencyMs } = await generateAnswer(
    testItem.query,
    contexts
  );

  // 构建 RAGAS 评估数据项
  const evalItem: RagasEvalItem = {
    id: itemId,
    question: testItem.query,
    answer,
    contexts,
    ground_truth: testItem.expectedAnswer,
    category: testItem.category ?? "未分类",
    canAnswer: testItem.canAnswer ?? true,
    retrievalLatencyMs,
    generationLatencyMs,
  };

  log.info(
    `第 ${index + 1} 条数据收集完成: 检索=${retrievalLatencyMs}ms, 生成=${generationLatencyMs}ms`
  );

  return evalItem;
}

// 主函数
async function main(): Promise<void> {
  log.info("=== RAGAS 评估数据收集脚本启动 ===");

  const args = parseArgs();
  log.info(`参数: limit=${args.limit ?? "无限制"}, output=${args.output ?? "默认"}`);

  // 加载测试集
  const testSet = loadTestSet();

  // 应用 limit
  const itemsToEvaluate = args.limit
    ? testSet.slice(0, args.limit)
    : testSet;
  log.info(`将收集 ${itemsToEvaluate.length} 条数据`);

  // 收集数据
  const evalData: RagasEvalItem[] = [];
  const startTime = Date.now();

  for (let i = 0; i < itemsToEvaluate.length; i++) {
    try {
      const evalItem = await collectSingleItem(
        itemsToEvaluate[i],
        i,
        itemsToEvaluate.length
      );
      evalData.push(evalItem);
    } catch (error) {
      log.error(`第 ${i + 1} 条数据收集失败: ${error}`);
      // 即使失败也继续下一条
      evalData.push({
        id: String(itemsToEvaluate[i].id ?? `item-${i + 1}`),
        question: itemsToEvaluate[i].query,
        answer: "",
        contexts: [],
        ground_truth: itemsToEvaluate[i].expectedAnswer,
        category: itemsToEvaluate[i].category ?? "未分类",
        canAnswer: itemsToEvaluate[i].canAnswer ?? true,
        retrievalLatencyMs: 0,
        generationLatencyMs: 0,
      });
    }
  }

  const totalDuration = Date.now() - startTime;

  // 保存数据
  const outputPath =
    args.output ?? join(CONFIG.defaultOutputDir, CONFIG.defaultOutputFile);
  const outputDir = dirname(outputPath);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputData = {
    timestamp: new Date().toISOString(),
    totalItems: evalData.length,
    totalDurationMs: totalDuration,
    retrievalTopK: CONFIG.retrievalTopK,
    items: evalData,
  };

  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

  log.info(`=== 数据收集完成 ===`);
  log.info(`总条数: ${evalData.length}`);
  log.info(`总耗时: ${(totalDuration / 1000).toFixed(2)} 秒`);
  log.info(`平均每条: ${(totalDuration / evalData.length / 1000).toFixed(2)} 秒`);
  log.info(`输出文件: ${outputPath}`);
  log.info(`下一步: 运行 python scripts/ragas_evaluation.py --input "${outputPath}"`);

  // 关闭数据库连接，避免进程挂起
  await closeDb();
  process.exit(0);
}

// 启动
main().catch(async (error) => {
  log.error(`脚本执行失败: ${error}`);
  console.error(error);
  try { await closeDb(); } catch {}
  process.exit(1);
});
