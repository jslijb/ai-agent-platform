import {
  type DatasetAdapter,
  type UnifiedTestItem,
  readJsonFilesFromDir,
} from "../dataset-adapter";

const TASK_TYPE_MAP: Record<string, string> = {
  classification: "金融文本分类",
  sentiment: "金融情感分析",
  relation_extraction: "金融关系抽取",
};

const LABEL_MAP: Record<string, string> = {
  monetary_policy: "货币政策",
  fiscal_policy: "财政政策",
  industry_news: "行业动态",
  company_news: "公司新闻",
  market_sentiment: "市场情绪",
  positive: "正面",
  negative: "负面",
  neutral: "中性",
};

interface CFLUERawItem {
  id: number | string;
  text: string;
  label: string;
  task_type: string;
  category?: string;
  difficulty?: string;
}

export const cflueAdapter: DatasetAdapter = {
  name: "CFLUE",
  description: "CFLUE 中文金融语言理解评估数据集，涵盖金融文本分类、金融情感分析、金融关系抽取等任务",
  basePath: "D:\\data\\modelscope\\CFLUE",

  async load(options) {
    console.log(`[cflue-adapter] 开始加载 CFLUE 数据集, 路径: ${this.basePath}`);
    console.log(
      `[cflue-adapter] 加载选项 - 最大样本数: ${options?.maxSamples ?? "无限制"}, 分类过滤: [${options?.categories?.join(",") ?? "无"}]`
    );

    const rawData = readJsonFilesFromDir(this.basePath);
    console.log(`[cflue-adapter] 原始数据读取完成, 总条目数: ${rawData.length}`);

    let items = this.transform(rawData);
    console.log(`[cflue-adapter] 数据转换完成, 转换后条目数: ${items.length}`);

    if (options?.categories && options.categories.length > 0) {
      const beforeFilter = items.length;
      items = items.filter((item) =>
        options.categories!.includes(item.category)
      );
      console.log(
        `[cflue-adapter] 按分类过滤, 过滤前: ${beforeFilter}, 过滤后: ${items.length}`
      );
    }

    if (options?.maxSamples && items.length > options.maxSamples) {
      console.log(
        `[cflue-adapter] 按最大样本数截取, 截取前: ${items.length}, 截取后: ${options.maxSamples}`
      );
      items = items.slice(0, options.maxSamples);
    }

    console.log(`[cflue-adapter] CFLUE 数据集加载完成, 最终条目数: ${items.length}`);
    return items;
  },

  transform(rawData) {
    console.log(`[cflue-adapter] 开始转换 CFLUE 数据, 原始条目数: ${rawData.length}`);

    const items: UnifiedTestItem[] = [];
    let skippedCount = 0;

    for (const raw of rawData) {
      const item = raw as CFLUERawItem;

      if (!item.id || !item.text || !item.label || !item.task_type) {
        skippedCount++;
        continue;
      }

      const query = "请判断以下金融文本的类别：" + item.text;

      const expectedAnswer =
        LABEL_MAP[item.label] ?? item.label;

      const category = TASK_TYPE_MAP[item.task_type] ?? item.task_type;

      const difficulty: "easy" | "medium" | "hard" =
        item.difficulty === "easy" || item.difficulty === "hard"
          ? item.difficulty
          : "medium";

      items.push({
        id: String(item.id),
        query,
        expectedAnswer,
        category,
        difficulty,
        metadata: {
          rawLabel: item.label,
          taskType: item.task_type,
        },
      });
    }

    console.log(
      `[cflue-adapter] 转换完成, 成功: ${items.length}, 跳过(字段缺失): ${skippedCount}`
    );

    return items;
  },

  validate(items) {
    console.log(`[cflue-adapter] 开始验证 CFLUE 数据, 条目数: ${items.length}`);

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
      `[cflue-adapter] 验证完成, 结果: ${valid ? "通过" : "失败"}, 错误数: ${errors.length}`
    );

    return { valid, errors };
  },
};
