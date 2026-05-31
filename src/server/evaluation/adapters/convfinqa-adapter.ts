import {
  type DatasetAdapter,
  type UnifiedTestItem,
  readJsonFilesFromDir,
} from "../dataset-adapter";

interface ConvFinQARawItem {
  id: number | string;
  conversation: Array<{
    question: string;
    answer: string;
  }>;
  category?: string;
  difficulty?: string;
}

export const convFinQAAdapter: DatasetAdapter = {
  name: "ConvFinQA",
  description: "ConvFinQA 多轮对话金融数值推理评估数据集，需要结合上下文进行多轮推理",
  basePath: "D:\\data\\modelscope\\ConvFinQA",

  async load(options) {
    console.log(`[convfinqa-adapter] 开始加载 ConvFinQA 数据集, 路径: ${this.basePath}`);
    console.log(
      `[convfinqa-adapter] 加载选项 - 最大样本数: ${options?.maxSamples ?? "无限制"}, 分类过滤: [${options?.categories?.join(",") ?? "无"}]`
    );

    const rawData = readJsonFilesFromDir(this.basePath);
    console.log(`[convfinqa-adapter] 原始数据读取完成, 总条目数: ${rawData.length}`);

    let items = this.transform(rawData);
    console.log(`[convfinqa-adapter] 数据转换完成, 转换后条目数: ${items.length}`);

    if (options?.categories && options.categories.length > 0) {
      const beforeFilter = items.length;
      items = items.filter((item) =>
        options.categories!.includes(item.category)
      );
      console.log(
        `[convfinqa-adapter] 按分类过滤, 过滤前: ${beforeFilter}, 过滤后: ${items.length}`
      );
    }

    if (options?.maxSamples && items.length > options.maxSamples) {
      console.log(
        `[convfinqa-adapter] 按最大样本数截取, 截取前: ${items.length}, 截取后: ${options.maxSamples}`
      );
      items = items.slice(0, options.maxSamples);
    }

    console.log(`[convfinqa-adapter] ConvFinQA 数据集加载完成, 最终条目数: ${items.length}`);
    return items;
  },

  transform(rawData) {
    console.log(`[convfinqa-adapter] 开始转换 ConvFinQA 数据, 原始条目数: ${rawData.length}`);

    const items: UnifiedTestItem[] = [];
    let skippedCount = 0;

    for (const raw of rawData) {
      const item = raw as ConvFinQARawItem;

      if (!item.id || !item.conversation || item.conversation.length === 0) {
        skippedCount++;
        continue;
      }

      const lastTurn = item.conversation[item.conversation.length - 1];

      if (!lastTurn.question || !lastTurn.answer) {
        skippedCount++;
        continue;
      }

      const contextParts: string[] = [];
      for (let turnIdx = 0; turnIdx < item.conversation.length - 1; turnIdx++) {
        const turn = item.conversation[turnIdx];
        contextParts.push(
          `Q${turnIdx + 1}: ${turn.question}\nA${turnIdx + 1}: ${turn.answer}`
        );
      }

      const contextStr =
        contextParts.length > 0
          ? "对话上下文：\n" + contextParts.join("\n") + "\n\n当前问题："
          : "";

      const query = contextStr + lastTurn.question;

      const expectedAnswer = lastTurn.answer;

      const difficulty: "easy" | "medium" | "hard" =
        item.difficulty === "easy" || item.difficulty === "hard"
          ? item.difficulty
          : "medium";

      items.push({
        id: String(item.id),
        query,
        expectedAnswer,
        category: "多轮对话推理",
        difficulty,
        metadata: {
          turnCount: item.conversation.length,
          rawCategory: item.category,
        },
      });
    }

    console.log(
      `[convfinqa-adapter] 转换完成, 成功: ${items.length}, 跳过(字段缺失): ${skippedCount}`
    );

    return items;
  },

  validate(items) {
    console.log(`[convfinqa-adapter] 开始验证 ConvFinQA 数据, 条目数: ${items.length}`);

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
      `[convfinqa-adapter] 验证完成, 结果: ${valid ? "通过" : "失败"}, 错误数: ${errors.length}`
    );

    return { valid, errors };
  },
};
