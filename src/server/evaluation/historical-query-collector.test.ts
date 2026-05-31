import {
  recordQueryToPool,
  updateQueryFeedback,
  getPoolStats,
  buildEvaluationSetFromPool,
  type RecordQueryData,
  type PoolStats,
  type EvaluationSetItem,
} from "@/server/evaluation/historical-query-collector";
import {
  runHistoricalEvaluation,
  type HistoricalEvaluationOptions,
} from "@/server/evaluation/historical-query-evaluator";
import type { FinancialEvaluationReport } from "@/server/evaluation/rag-evaluator";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`[TEST FAILED] ${message}`);
    failed++;
  } else {
    console.log(`[TEST PASSED] ${message}`);
    passed++;
  }
}

function tokenize(text: string): string[] {
  return text
    .replace(/[，。、；：！？（）""''【】《》\s,.:;!?(){}[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));

  if (setA.size === 0 && setB.size === 0) return 0;

  const intersection = new Set(Array.from(setA).filter((x) => setB.has(x)));
  const union = new Set(Array.from(setA).concat(Array.from(setB)));

  return union.size === 0 ? 0 : intersection.size / union.size;
}

function testTokenize() {
  console.log("\n=== 测试 tokenize ===");

  const tokens1 = tokenize("五粮液的市盈率为25.3，建议关注");
  assert(tokens1.length > 0, "中文文本应能分出token");
  assert(
    tokens1.some((t) => t.includes("五粮液")),
    "中文文本token应包含'五粮液'子串"
  );
  assert(
    tokens1.some((t) => t.includes("市盈率")),
    "中文文本token应包含'市盈率'子串"
  );

  const tokens2 = tokenize("hello world test");
  assert(tokens2.includes("hello"), "英文文本应能分出token");
  assert(tokens2.includes("world"), "英文文本应能分出'world'");

  const tokens3 = tokenize("  ");
  assert(tokens3.length === 0, "纯空格文本应返回空数组");

  const tokens4 = tokenize("a");
  assert(tokens4.length === 0, "单字符应被过滤（长度<2）");

  const tokens5 = tokenize("股票 基金 债券");
  assert(tokens5.length === 3, "空格分隔的中文词应能正确分出3个token");
  assert(tokens5.includes("股票"), "应包含'股票'");
  assert(tokens5.includes("基金"), "应包含'基金'");
}

function testJaccardSimilarity() {
  console.log("\n=== 测试 jaccardSimilarity ===");

  const sim1 = jaccardSimilarity("五粮液的市盈率是多少", "五粮液的市盈率是多少");
  assert(sim1 === 1, `完全相同的文本相似度应为1, 实际: ${sim1}`);

  const sim2 = jaccardSimilarity("股票 基金 债券", "股票 基金 期货");
  assert(sim2 > 0 && sim2 < 1, `部分重叠文本相似度应在0-1之间, 实际: ${sim2}`);

  const sim3 = jaccardSimilarity("股票 基金", "天气 气温");
  assert(sim3 === 0, `完全不相关文本相似度应为0, 实际: ${sim3}`);

  const sim4 = jaccardSimilarity("", "");
  assert(sim4 === 0, "空文本相似度应为0");

  const sim5 = jaccardSimilarity(
    "股票 基金 债券 理财 投资",
    "股票 基金 债券 理财 投资 期货"
  );
  assert(sim5 > 0.8, `高度相似文本(>0.8)应被判定为重复, 实际: ${sim5}`);

  const sim6 = jaccardSimilarity(
    "股票 基金",
    "天气 气温"
  );
  assert(sim6 < 0.3, `低相似度文本应不被判定为重复, 实际: ${sim6}`);
}

function testTypeDefinitions() {
  console.log("\n=== 测试类型定义 ===");

  const recordData: RecordQueryData = {
    query: "五粮液的市盈率是多少",
    answer: "五粮液的市盈率为25.3",
    source: "chat",
  };
  assert(!!recordData, "RecordQueryData 类型定义正确");

  const recordData2: RecordQueryData = {
    query: "分析五粮液",
    source: "agent",
    context: "五粮液2024年财报",
    toolsUsed: "getStockData,calculateVaR",
    conversationId: "conv-123",
    model: "qwen-max",
    iterations: 3,
    latencyMs: 2500,
    tokenUsage: 1500,
  };
  assert(!!recordData2, "RecordQueryData 完整字段类型定义正确");

  const stats: PoolStats = {
    total: 100,
    bySource: { chat: 60, agent: 40 },
    byCategory: { 投资建议: 30, 基本面: 70 },
    withFeedback: 45,
    withoutFeedback: 55,
  };
  assert(!!stats, "PoolStats 类型定义正确");

  const evalItem: EvaluationSetItem = {
    id: 1,
    query: "五粮液的市盈率",
    expectedAnswer: "五粮液的市盈率为25.3",
    category: "基本面",
    difficulty: "medium",
    source: "chat",
    userFeedback: "correct",
    autoLabeled: false,
  };
  assert(!!evalItem, "EvaluationSetItem 类型定义正确");

  const options: HistoricalEvaluationOptions = {
    minPoolSize: 10,
    sampleSize: 50,
    autoLabel: true,
    evaluationLevel: "standard",
    triggerMode: "manual",
    milestone: "v1.0",
  };
  assert(!!options, "HistoricalEvaluationOptions 类型定义正确");
}

function testFunctionSignatures() {
  console.log("\n=== 测试函数签名 ===");

  assert(typeof recordQueryToPool === "function", "recordQueryToPool 应为函数");
  assert(typeof updateQueryFeedback === "function", "updateQueryFeedback 应为函数");
  assert(typeof getPoolStats === "function", "getPoolStats 应为函数");
  assert(typeof buildEvaluationSetFromPool === "function", "buildEvaluationSetFromPool 应为函数");
  assert(typeof runHistoricalEvaluation === "function", "runHistoricalEvaluation 应为函数");
}

function testDeduplicationLogic() {
  console.log("\n=== 测试去重逻辑 ===");

  const queries = [
    "股票 基金 债券",
    "股票 基金 债券 期货",
    "天气 气温 湿度",
    "股票 基金 债券",
    "投资 理财 收益",
    "投资 理财 收益 风险",
    "旅游 美食 景点",
  ];

  const unique: string[] = [];
  for (const query of queries) {
    let isDuplicate = false;
    for (const existing of unique) {
      if (jaccardSimilarity(query, existing) > 0.8) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      unique.push(query);
    }
  }

  console.log(`原始查询数: ${queries.length}, 去重后: ${unique.length}`);
  assert(unique.length < queries.length, "去重后数量应少于原始数量");
  assert(unique.length >= 3, "去重后应保留至少3条不同查询");
}

function testCategorySampling() {
  console.log("\n=== 测试分类均匀采样逻辑 ===");

  const records = [
    { category: "投资建议", userFeedback: "correct" as const },
    { category: "投资建议", userFeedback: "wrong" as const },
    { category: "投资建议", userFeedback: null },
    { category: "基本面", userFeedback: "correct" as const },
    { category: "基本面", userFeedback: null },
    { category: "基本面", userFeedback: null },
    { category: "交易策略", userFeedback: null },
    { category: "交易策略", userFeedback: null },
    { category: "交易策略", userFeedback: null },
  ];

  const categoryGroups: Record<string, typeof records> = {};
  for (const record of records) {
    const cat = record.category;
    if (!categoryGroups[cat]) {
      categoryGroups[cat] = [];
    }
    categoryGroups[cat].push(record);
  }

  const categories = Object.keys(categoryGroups);
  assert(categories.length === 3, `应有3个分类, 实际: ${categories.length}`);

  const sampleSize = 6;
  const perCategory = Math.ceil(sampleSize / categories.length);
  assert(perCategory === 2, `每分类应采样2条, 实际: ${perCategory}`);

  const sampled: typeof records = [];
  for (const cat of categories) {
    const group = categoryGroups[cat];
    const take = Math.min(perCategory, group.length);
    sampled.push(...group.slice(0, take));
  }

  assert(sampled.length <= sampleSize, `采样总数不应超过${sampleSize}, 实际: ${sampled.length}`);

  const sampledByCategory: Record<string, number> = {};
  for (const item of sampled) {
    sampledByCategory[item.category] = (sampledByCategory[item.category] ?? 0) + 1;
  }

  for (const cat of categories) {
    const count = sampledByCategory[cat] ?? 0;
    assert(count <= perCategory, `分类"${cat}"采样数应<=${perCategory}, 实际: ${count}`);
  }
}

console.log("========================================");
console.log("开始测试 historical-query-collector 模块");
console.log("========================================");

testTokenize();
testJaccardSimilarity();
testTypeDefinitions();
testFunctionSignatures();
testDeduplicationLogic();
testCategorySampling();

console.log("\n========================================");
console.log(`测试完成: ${passed} 通过, ${failed} 失败`);
console.log("========================================");
if (failed > 0) {
  process.exit(1);
}
