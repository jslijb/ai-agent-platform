import * as fs from "fs";
import * as path from "path";

const TEST_DATA_DIR = path.resolve(__dirname, "datasets");

function setupTestData() {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  const finEvalData = [
    {
      id: 1,
      question: "以下哪个指标用于衡量企业的偿债能力？",
      A: "市盈率",
      B: "资产负债率",
      C: "毛利率",
      D: "净资产收益率",
      answer: "B",
      explanation: "资产负债率是衡量企业偿债能力的核心指标",
      category: "financial_knowledge",
    },
    {
      id: 2,
      question: "某公司2023年净利润为500万元，营业收入为5000万元，净利润率是多少？",
      A: "5%",
      B: "10%",
      C: "15%",
      D: "20%",
      answer: "B",
      explanation: "净利润率 = 净利润 / 营业收入 = 500 / 5000 = 10%",
      category: "financial_calculation",
    },
    {
      id: 3,
      question: "根据《证券法》，以下哪种行为属于内幕交易？",
      A: "基于公开信息进行交易",
      B: "利用未公开的重大信息进行交易",
      C: "通过技术分析进行交易",
      D: "基于行业研究报告进行交易",
      answer: "B",
      explanation: "利用未公开的重大信息进行交易属于内幕交易",
      category: "financial_compliance",
    },
  ];

  const finEvalDir = path.join(TEST_DATA_DIR, "FinEval");
  if (!fs.existsSync(finEvalDir)) {
    fs.mkdirSync(finEvalDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(finEvalDir, "test.json"),
    JSON.stringify(finEvalData, null, 2),
    "utf-8"
  );

  const cflueData = [
    {
      id: 1,
      text: "央行宣布下调MLF利率10个基点",
      label: "monetary_policy",
      task_type: "classification",
    },
    {
      id: 2,
      text: "今日A股市场大涨，投资者情绪高涨",
      label: "positive",
      task_type: "sentiment",
    },
    {
      id: 3,
      text: "张三是某公司的董事长，该公司与李四控制的企业存在关联交易",
      label: "company_news",
      task_type: "relation_extraction",
    },
  ];

  const cflueDir = path.join(TEST_DATA_DIR, "CFLUE");
  if (!fs.existsSync(cflueDir)) {
    fs.mkdirSync(cflueDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(cflueDir, "test.json"),
    JSON.stringify(cflueData, null, 2),
    "utf-8"
  );

  const finQAData = [
    {
      id: 1,
      question: "What is the gross margin for 2023?",
      table: [
        ["Year", "Revenue", "COGS"],
        ["2023", "1505.6", "1265.9"],
      ],
      answer: "15.92%",
      steps: [
        "Gross margin = (Revenue - COGS) / Revenue",
        "(1505.6 - 1265.9) / 1505.6 = 15.92%",
      ],
    },
    {
      id: 2,
      question: "What is the net profit for 2023?",
      table: [
        ["Year", "Revenue", "Expenses"],
        ["2023", "1505.6", "758.3"],
      ],
      answer: "747.3",
      steps: ["Net profit = Revenue - Expenses", "1505.6 - 758.3 = 747.3"],
    },
  ];

  const finQADir = path.join(TEST_DATA_DIR, "FinQA");
  if (!fs.existsSync(finQADir)) {
    fs.mkdirSync(finQADir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(finQADir, "test.json"),
    JSON.stringify(finQAData, null, 2),
    "utf-8"
  );

  const convFinQAData = [
    {
      id: 1,
      conversation: [
        { question: "What is the revenue for 2023?", answer: "1505.6 billion" },
        { question: "What about the net profit?", answer: "747.3 billion" },
      ],
      category: "multi_turn_reasoning",
    },
    {
      id: 2,
      conversation: [
        {
          question: "What was the total assets in 2022?",
          answer: "2000 billion",
        },
        {
          question: "How much did it increase in 2023?",
          answer: "150 billion",
        },
        {
          question: "What is the growth rate?",
          answer: "7.5%",
        },
      ],
    },
  ];

  const convFinQADir = path.join(TEST_DATA_DIR, "ConvFinQA");
  if (!fs.existsSync(convFinQADir)) {
    fs.mkdirSync(convFinQADir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(convFinQADir, "test.json"),
    JSON.stringify(convFinQAData, null, 2),
    "utf-8"
  );

  console.log("[test] 测试数据创建完成");
}

function cleanupTestData() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    console.log("[test] 测试数据已清理");
  }
}

async function runTests() {
  console.log("=".repeat(60));
  console.log("  开源金融数据集适配器测试");
  console.log("=".repeat(60));

  setupTestData();

  let allPassed = true;

  try {
    const { finEvalAdapter } = await import(
      "../src/server/evaluation/adapters/fineval-adapter"
    );
    const { cflueAdapter } = await import(
      "../src/server/evaluation/adapters/cflue-adapter"
    );
    const { finQAAdapter } = await import(
      "../src/server/evaluation/adapters/finqa-adapter"
    );
    const { convFinQAAdapter } = await import(
      "../src/server/evaluation/adapters/convfinqa-adapter"
    );

    finEvalAdapter.basePath = path.join(TEST_DATA_DIR, "FinEval");
    cflueAdapter.basePath = path.join(TEST_DATA_DIR, "CFLUE");
    finQAAdapter.basePath = path.join(TEST_DATA_DIR, "FinQA");
    convFinQAAdapter.basePath = path.join(TEST_DATA_DIR, "ConvFinQA");

    console.log("\n--- 测试1: FinEvalAdapter 转换 ---");
    const finEvalItems = await finEvalAdapter.load();
    console.log(`FinEval 加载条目数: ${finEvalItems.length}`);
    if (finEvalItems.length !== 3) {
      console.error(`❌ FinEval 条目数期望3, 实际: ${finEvalItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ FinEval 条目数正确");
    }

    const item1 = finEvalItems[0];
    console.log(`\nFinEval 第1条转换结果:`);
    console.log(`  id: ${item1.id}`);
    console.log(`  query: ${item1.query}`);
    console.log(`  expectedAnswer: ${item1.expectedAnswer}`);
    console.log(`  category: ${item1.category}`);
    console.log(`  difficulty: ${item1.difficulty}`);

    if (item1.category !== "金融专业知识") {
      console.error(`❌ FinEval category 映射错误, 期望: 金融专业知识, 实际: ${item1.category}`);
      allPassed = false;
    } else {
      console.log("✅ FinEval category 映射正确");
    }

    if (!item1.query.includes("A: ") || !item1.query.includes("B: ")) {
      console.error("❌ FinEval query 格式错误，应包含选项");
      allPassed = false;
    } else {
      console.log("✅ FinEval query 格式正确");
    }

    if (!item1.expectedAnswer.startsWith("B: ")) {
      console.error(`❌ FinEval expectedAnswer 格式错误, 期望以 'B: ' 开头, 实际: ${item1.expectedAnswer.slice(0, 20)}`);
      allPassed = false;
    } else {
      console.log("✅ FinEval expectedAnswer 格式正确");
    }

    const finEvalValidation = finEvalAdapter.validate(finEvalItems);
    if (!finEvalValidation.valid) {
      console.error(`❌ FinEval 验证失败: ${finEvalValidation.errors.join(", ")}`);
      allPassed = false;
    } else {
      console.log("✅ FinEval 验证通过");
    }

    console.log("\n--- 测试2: CFLUEAdapter 转换 ---");
    const cflueItems = await cflueAdapter.load();
    console.log(`CFLUE 加载条目数: ${cflueItems.length}`);
    if (cflueItems.length !== 3) {
      console.error(`❌ CFLUE 条目数期望3, 实际: ${cflueItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ CFLUE 条目数正确");
    }

    const cflueItem1 = cflueItems[0];
    console.log(`\nCFLUE 第1条转换结果:`);
    console.log(`  id: ${cflueItem1.id}`);
    console.log(`  query: ${cflueItem1.query}`);
    console.log(`  expectedAnswer: ${cflueItem1.expectedAnswer}`);
    console.log(`  category: ${cflueItem1.category}`);

    if (cflueItem1.category !== "金融文本分类") {
      console.error(`❌ CFLUE category 映射错误, 期望: 金融文本分类, 实际: ${cflueItem1.category}`);
      allPassed = false;
    } else {
      console.log("✅ CFLUE category 映射正确");
    }

    if (cflueItem1.expectedAnswer !== "货币政策") {
      console.error(`❌ CFLUE expectedAnswer 映射错误, 期望: 货币政策, 实际: ${cflueItem1.expectedAnswer}`);
      allPassed = false;
    } else {
      console.log("✅ CFLUE expectedAnswer 映射正确");
    }

    if (!cflueItem1.query.startsWith("请判断以下金融文本的类别：")) {
      console.error("❌ CFLUE query 格式错误");
      allPassed = false;
    } else {
      console.log("✅ CFLUE query 格式正确");
    }

    const cflueItem2 = cflueItems[1];
    if (cflueItem2.category !== "金融情感分析") {
      console.error(`❌ CFLUE sentiment category 映射错误, 期望: 金融情感分析, 实际: ${cflueItem2.category}`);
      allPassed = false;
    } else {
      console.log("✅ CFLUE sentiment category 映射正确");
    }

    const cflueValidation = cflueAdapter.validate(cflueItems);
    if (!cflueValidation.valid) {
      console.error(`❌ CFLUE 验证失败: ${cflueValidation.errors.join(", ")}`);
      allPassed = false;
    } else {
      console.log("✅ CFLUE 验证通过");
    }

    console.log("\n--- 测试3: FinQAAdapter 转换 ---");
    const finQAItems = await finQAAdapter.load();
    console.log(`FinQA 加载条目数: ${finQAItems.length}`);
    if (finQAItems.length !== 2) {
      console.error(`❌ FinQA 条目数期望2, 实际: ${finQAItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ FinQA 条目数正确");
    }

    const finQAItem1 = finQAItems[0];
    console.log(`\nFinQA 第1条转换结果:`);
    console.log(`  id: ${finQAItem1.id}`);
    console.log(`  query: ${finQAItem1.query}`);
    console.log(`  expectedAnswer: ${finQAItem1.expectedAnswer}`);
    console.log(`  category: ${finQAItem1.category}`);

    if (finQAItem1.category !== "数值推理") {
      console.error(`❌ FinQA category 映射错误, 期望: 数值推理, 实际: ${finQAItem1.category}`);
      allPassed = false;
    } else {
      console.log("✅ FinQA category 映射正确");
    }

    if (!finQAItem1.query.includes("参考表格：")) {
      console.error("❌ FinQA query 格式错误，应包含参考表格");
      allPassed = false;
    } else {
      console.log("✅ FinQA query 格式正确");
    }

    if (!finQAItem1.expectedAnswer.includes("推理步骤：")) {
      console.error("❌ FinQA expectedAnswer 格式错误，应包含推理步骤");
      allPassed = false;
    } else {
      console.log("✅ FinQA expectedAnswer 格式正确");
    }

    const finQAValidation = finQAAdapter.validate(finQAItems);
    if (!finQAValidation.valid) {
      console.error(`❌ FinQA 验证失败: ${finQAValidation.errors.join(", ")}`);
      allPassed = false;
    } else {
      console.log("✅ FinQA 验证通过");
    }

    console.log("\n--- 测试4: ConvFinQAAdapter 转换 ---");
    const convFinQAItems = await convFinQAAdapter.load();
    console.log(`ConvFinQA 加载条目数: ${convFinQAItems.length}`);
    if (convFinQAItems.length !== 2) {
      console.error(`❌ ConvFinQA 条目数期望2, 实际: ${convFinQAItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ ConvFinQA 条目数正确");
    }

    const convFinQAItem1 = convFinQAItems[0];
    console.log(`\nConvFinQA 第1条转换结果:`);
    console.log(`  id: ${convFinQAItem1.id}`);
    console.log(`  query: ${convFinQAItem1.query}`);
    console.log(`  expectedAnswer: ${convFinQAItem1.expectedAnswer}`);
    console.log(`  category: ${convFinQAItem1.category}`);

    if (convFinQAItem1.category !== "多轮对话推理") {
      console.error(`❌ ConvFinQA category 映射错误, 期望: 多轮对话推理, 实际: ${convFinQAItem1.category}`);
      allPassed = false;
    } else {
      console.log("✅ ConvFinQA category 映射正确");
    }

    if (convFinQAItem1.expectedAnswer !== "747.3 billion") {
      console.error(`❌ ConvFinQA expectedAnswer 错误, 期望: 747.3 billion, 实际: ${convFinQAItem1.expectedAnswer}`);
      allPassed = false;
    } else {
      console.log("✅ ConvFinQA expectedAnswer 正确");
    }

    if (!convFinQAItem1.query.includes("对话上下文：")) {
      console.error("❌ ConvFinQA query 格式错误，应包含对话上下文");
      allPassed = false;
    } else {
      console.log("✅ ConvFinQA query 格式正确（包含对话上下文）");
    }

    const convFinQAItem2 = convFinQAItems[1];
    if (convFinQAItem2.expectedAnswer !== "7.5%") {
      console.error(`❌ ConvFinQA 第2条 expectedAnswer 错误, 期望: 7.5%, 实际: ${convFinQAItem2.expectedAnswer}`);
      allPassed = false;
    } else {
      console.log("✅ ConvFinQA 第2条 expectedAnswer 正确");
    }

    const convFinQAValidation = convFinQAAdapter.validate(convFinQAItems);
    if (!convFinQAValidation.valid) {
      console.error(`❌ ConvFinQA 验证失败: ${convFinQAValidation.errors.join(", ")}`);
      allPassed = false;
    } else {
      console.log("✅ ConvFinQA 验证通过");
    }

    console.log("\n--- 测试5: maxSamples 限制 ---");
    const limitedItems = await finEvalAdapter.load({ maxSamples: 2 });
    if (limitedItems.length !== 2) {
      console.error(`❌ maxSamples 限制失败, 期望2, 实际: ${limitedItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ maxSamples 限制正确");
    }

    console.log("\n--- 测试6: categories 过滤 ---");
    const filteredItems = await finEvalAdapter.load({
      categories: ["金融专业知识"],
    });
    if (filteredItems.length !== 1) {
      console.error(`❌ categories 过滤失败, 期望1, 实际: ${filteredItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ categories 过滤正确");
    }

    console.log("\n--- 测试7: loadDataset 通用加载函数 ---");
    const { loadDataset } = await import(
      "../src/server/evaluation/dataset-adapter"
    );
    const loadedItems = await loadDataset(finEvalAdapter, { maxSamples: 2 });
    if (loadedItems.length !== 2) {
      console.error(`❌ loadDataset 加载失败, 期望2, 实际: ${loadedItems.length}`);
      allPassed = false;
    } else {
      console.log("✅ loadDataset 加载正确");
    }

    console.log("\n--- 测试8: DATASET_ADAPTERS 注册表 ---");
    const { DATASET_ADAPTERS } = await import(
      "../src/server/evaluation/open-dataset-evaluator"
    );
    const adapterNames = Object.keys(DATASET_ADAPTERS);
    console.log(`注册的适配器: [${adapterNames.join(", ")}]`);
    if (adapterNames.length !== 4) {
      console.error(`❌ DATASET_ADAPTERS 注册数错误, 期望4, 实际: ${adapterNames.length}`);
      allPassed = false;
    } else {
      console.log("✅ DATASET_ADAPTERS 注册数正确");
    }

    if (!adapterNames.includes("fineval") || !adapterNames.includes("cflue") || !adapterNames.includes("finqa") || !adapterNames.includes("convfinqa")) {
      console.error("❌ DATASET_ADAPTERS 缺少必要的适配器");
      allPassed = false;
    } else {
      console.log("✅ DATASET_ADAPTERS 包含所有必要适配器");
    }

    console.log("\n--- 测试9: 验证空数据 ---");
    const emptyValidation = finEvalAdapter.validate([]);
    if (!emptyValidation.valid) {
      console.error("❌ 空数据验证应该通过");
      allPassed = false;
    } else {
      console.log("✅ 空数据验证通过");
    }

    console.log("\n--- 测试10: 验证无效数据 ---");
    const invalidItems: Array<import("../src/server/evaluation/dataset-adapter").UnifiedTestItem> = [
      { id: "", query: "", expectedAnswer: "", category: "", difficulty: "invalid" as any },
    ];
    const invalidValidation = finEvalAdapter.validate(invalidItems);
    if (invalidValidation.valid) {
      console.error("❌ 无效数据验证应该失败");
      allPassed = false;
    } else {
      console.log(`✅ 无效数据验证正确失败, 错误数: ${invalidValidation.errors.length}`);
    }
  } catch (error) {
    console.error("[test] 测试执行失败:", error);
    allPassed = false;
  } finally {
    cleanupTestData();
  }

  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("  ✅ 所有测试通过！");
  } else {
    console.log("  ❌ 存在测试失败！");
  }
  console.log("=".repeat(60));

  process.exit(allPassed ? 0 : 1);
}

runTests();
