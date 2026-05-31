import {
  type DatasetAdapter,
  type UnifiedTestItem,
  readJsonFilesFromDir,
} from "../dataset-adapter";

interface FinQARawItem {
  id: number | string;
  question: string;
  table: string[][];
  answer: string;
  steps?: string[];
  category?: string;
  difficulty?: string;
}

function formatTable(table: string[][]): string {
  if (!table || table.length === 0) {
    return "(空表格)";
  }

  const colWidths: number[] = [];
  for (let col = 0; col < table[0].length; col++) {
    let maxWidth = 0;
    for (const row of table) {
      const cell = row[col] ?? "";
      maxWidth = Math.max(maxWidth, cell.length);
    }
    colWidths.push(maxWidth);
  }

  const lines: string[] = [];

  const header = table[0]
    .map((cell, i) => cell.padEnd(colWidths[i]))
    .join(" | ");
  lines.push(header);
  lines.push(colWidths.map((w) => "-".repeat(w)).join("-+-"));

  for (let rowIdx = 1; rowIdx < table.length; rowIdx++) {
    const row = table[rowIdx];
    const line = row
      .map((cell, i) => (cell ?? "").padEnd(colWidths[i]))
      .join(" | ");
    lines.push(line);
  }

  return lines.join("\n");
}

export const finQAAdapter: DatasetAdapter = {
  name: "FinQA",
  description: "FinQA 金融数值推理评估数据集，需要结合表格数据进行数值计算和推理",
  basePath: "D:\\data\\modelscope\\FinQA",

  async load(options) {
    console.log(`[finqa-adapter] 开始加载 FinQA 数据集, 路径: ${this.basePath}`);
    console.log(
      `[finqa-adapter] 加载选项 - 最大样本数: ${options?.maxSamples ?? "无限制"}, 分类过滤: [${options?.categories?.join(",") ?? "无"}]`
    );

    const rawData = readJsonFilesFromDir(this.basePath);
    console.log(`[finqa-adapter] 原始数据读取完成, 总条目数: ${rawData.length}`);

    let items = this.transform(rawData);
    console.log(`[finqa-adapter] 数据转换完成, 转换后条目数: ${items.length}`);

    if (options?.categories && options.categories.length > 0) {
      const beforeFilter = items.length;
      items = items.filter((item) =>
        options.categories!.includes(item.category)
      );
      console.log(
        `[finqa-adapter] 按分类过滤, 过滤前: ${beforeFilter}, 过滤后: ${items.length}`
      );
    }

    if (options?.maxSamples && items.length > options.maxSamples) {
      console.log(
        `[finqa-adapter] 按最大样本数截取, 截取前: ${items.length}, 截取后: ${options.maxSamples}`
      );
      items = items.slice(0, options.maxSamples);
    }

    console.log(`[finqa-adapter] FinQA 数据集加载完成, 最终条目数: ${items.length}`);
    return items;
  },

  transform(rawData) {
    console.log(`[finqa-adapter] 开始转换 FinQA 数据, 原始条目数: ${rawData.length}`);

    const items: UnifiedTestItem[] = [];
    let skippedCount = 0;

    for (const raw of rawData) {
      const item = raw as FinQARawItem;

      if (!item.id || !item.question || !item.answer) {
        skippedCount++;
        continue;
      }

      const tableStr = formatTable(item.table);
      const query = item.question + "\n参考表格：\n" + tableStr;

      const stepsStr =
        item.steps && item.steps.length > 0
          ? item.steps.join(" → ")
          : "";
      const expectedAnswer =
        item.answer +
        (stepsStr ? "\n推理步骤：" + stepsStr : "");

      const difficulty: "easy" | "medium" | "hard" =
        item.difficulty === "easy" || item.difficulty === "hard"
          ? item.difficulty
          : "medium";

      items.push({
        id: String(item.id),
        query,
        expectedAnswer,
        category: "数值推理",
        difficulty,
        metadata: {
          steps: item.steps,
          tableRows: item.table?.length ?? 0,
        },
      });
    }

    console.log(
      `[finqa-adapter] 转换完成, 成功: ${items.length}, 跳过(字段缺失): ${skippedCount}`
    );

    return items;
  },

  validate(items) {
    console.log(`[finqa-adapter] 开始验证 FinQA 数据, 条目数: ${items.length}`);

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
      `[finqa-adapter] 验证完成, 结果: ${valid ? "通过" : "失败"}, 错误数: ${errors.length}`
    );

    return { valid, errors };
  },
};
