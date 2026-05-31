import {
  type DatasetAdapter,
  type UnifiedTestItem,
  readJsonFilesFromDir,
} from "../dataset-adapter";

const CATEGORY_MAP: Record<string, string> = {
  financial_knowledge: "金融专业知识",
  financial_calculation: "金融计算",
  financial_compliance: "金融合规",
};

const DIFFICULTY_MAP: Record<string, "easy" | "medium" | "hard"> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
};

interface FinEvalRawItem {
  id: number | string;
  question: string;
  A: string;
  B: string;
  C: string;
  D: string;
  answer: string;
  explanation?: string;
  category?: string;
  difficulty?: string;
}

export const finEvalAdapter: DatasetAdapter = {
  name: "FinEval",
  description: "FinEval 金融多选题评估数据集，涵盖金融专业知识、金融计算、金融合规等类别",
  basePath: "D:\\data\\modelscope\\FinEval",

  async load(options) {
    console.log(`[fineval-adapter] 开始加载 FinEval 数据集, 路径: ${this.basePath}`);
    console.log(
      `[fineval-adapter] 加载选项 - 最大样本数: ${options?.maxSamples ?? "无限制"}, 分类过滤: [${options?.categories?.join(",") ?? "无"}]`
    );

    const rawData = readJsonFilesFromDir(this.basePath);
    console.log(`[fineval-adapter] 原始数据读取完成, 总条目数: ${rawData.length}`);

    let items = this.transform(rawData);
    console.log(`[fineval-adapter] 数据转换完成, 转换后条目数: ${items.length}`);

    if (options?.categories && options.categories.length > 0) {
      const beforeFilter = items.length;
      items = items.filter((item) =>
        options.categories!.includes(item.category)
      );
      console.log(
        `[fineval-adapter] 按分类过滤, 过滤前: ${beforeFilter}, 过滤后: ${items.length}`
      );
    }

    if (options?.maxSamples && items.length > options.maxSamples) {
      console.log(
        `[fineval-adapter] 按最大样本数截取, 截取前: ${items.length}, 截取后: ${options.maxSamples}`
      );
      items = items.slice(0, options.maxSamples);
    }

    console.log(`[fineval-adapter] FinEval 数据集加载完成, 最终条目数: ${items.length}`);
    return items;
  },

  transform(rawData) {
    console.log(`[fineval-adapter] 开始转换 FinEval 数据, 原始条目数: ${rawData.length}`);

    const items: UnifiedTestItem[] = [];
    let skippedCount = 0;

    for (const raw of rawData) {
      const item = raw as FinEvalRawItem;

      if (!item.id || !item.question || !item.A || !item.B || !item.C || !item.D || !item.answer) {
        skippedCount++;
        continue;
      }

      const optionMap: Record<string, string> = {
        A: item.A,
        B: item.B,
        C: item.C,
        D: item.D,
      };

      const answerLetter = item.answer.trim().toUpperCase();
      const answerContent = optionMap[answerLetter] ?? "";

      const query =
        item.question +
        "\nA: " + item.A +
        "\nB: " + item.B +
        "\nC: " + item.C +
        "\nD: " + item.D;

      const expectedAnswer =
        answerLetter + ": " + answerContent +
        (item.explanation ? "\n" + item.explanation : "");

      const rawCategory = item.category ?? "financial_knowledge";
      const category = CATEGORY_MAP[rawCategory] ?? rawCategory;

      const rawDifficulty = item.difficulty ?? "medium";
      const difficulty = DIFFICULTY_MAP[rawDifficulty] ?? "medium";

      items.push({
        id: String(item.id),
        query,
        expectedAnswer,
        category,
        difficulty,
        metadata: {
          answerLetter,
          explanation: item.explanation,
          rawCategory,
        },
      });
    }

    console.log(
      `[fineval-adapter] 转换完成, 成功: ${items.length}, 跳过(字段缺失): ${skippedCount}`
    );

    return items;
  },

  validate(items) {
    console.log(`[fineval-adapter] 开始验证 FinEval 数据, 条目数: ${items.length}`);

    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item.id) {
        errors.push(`第 ${i + 1} 条: 缺少 id`);
      }
      if (!item.query) {
        errors.push(`第 ${i + 1} 条 (id=${item.id}): 缺少 query`);
      }
      if (!item.expectedAnswer) {
        errors.push(`第 ${i + 1} 条 (id=${item.id}): 缺少 expectedAnswer`);
      }
      if (!item.category) {
        errors.push(`第 ${i + 1} 条 (id=${item.id}): 缺少 category`);
      }
      if (!["easy", "medium", "hard"].includes(item.difficulty)) {
        errors.push(`第 ${i + 1} 条 (id=${item.id}): 无效的 difficulty "${item.difficulty}"`);
      }
    }

    const valid = errors.length === 0;
    console.log(
      `[fineval-adapter] 验证完成, 结果: ${valid ? "通过" : "失败"}, 错误数: ${errors.length}`
    );

    return { valid, errors };
  },
};
