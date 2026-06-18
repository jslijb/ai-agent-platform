import * as fs from "fs";
import * as path from "path";

export interface UnifiedTestItem {
  id: string;
  query: string;
  expectedAnswer: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  metadata?: Record<string, unknown>;
}

export interface DatasetAdapter {
  name: string;
  description: string;
  basePath: string;
  load(options?: {
    maxSamples?: number;
    categories?: string[];
  }): Promise<UnifiedTestItem[]>;
  transform(rawData: unknown[]): UnifiedTestItem[];
  validate(items: UnifiedTestItem[]): { valid: boolean; errors: string[] };
}

export interface LoadDatasetOptions {
  maxSamples?: number;
  categories?: string[];
}

/**
 * 解析数据集的基础路径
 *
 * 优先级：
 * 1. 环境变量 DATASET_BASE_PATH/{datasetName}/converted/
 * 2. 配置项 evaluation.dataset_base_path/{datasetName}/converted/
 * 3. 默认值 D:\data\modelscope/{datasetName}/converted/
 * 4. 回退路径 tests/datasets/{datasetName}/test.json
 *
 * @param datasetName 数据集名称（如 CFLUE、FinEval、FinQA）
 * @returns 第一个存在的数据路径，如果都不存在则返回回退路径
 */
export function resolveDatasetPath(datasetName: string): string {
  console.log(`[dataset-adapter] 开始解析数据集路径, 数据集: ${datasetName}`);

  // 从环境变量获取基础路径
  const envBasePath = process.env.DATASET_BASE_PATH;
  // 从配置文件获取基础路径（延迟加载，避免配置文件不存在时报错）
  let configBasePath = "";
  try {
    const { getConfigValue } = require("@/server/lib/config");
    configBasePath = getConfigValue("evaluation", "dataset_base_path", "");
  } catch {
    console.warn(`[dataset-adapter] 无法加载配置文件，跳过配置路径`);
  }

  // 默认基础路径
  const defaultBasePath = "D:\\data\\modelscope";

  // 确定使用的基础路径
  const basePath = envBasePath || configBasePath || defaultBasePath;
  console.log(`[dataset-adapter] 数据集基础路径: ${basePath} (来源: ${envBasePath ? "环境变量" : configBasePath ? "配置文件" : "默认值"})`);

  // 候选路径列表：优先完整数据集的 converted 目录，回退到测试小样本
  const candidates = [
    path.join(basePath, datasetName, "converted"),
    path.join(process.cwd(), "tests", "datasets", datasetName, "test.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[dataset-adapter] 找到数据集路径: ${candidate}`);
      return candidate;
    }
    console.log(`[dataset-adapter] 路径不存在，跳过: ${candidate}`);
  }

  // 所有路径都不存在，返回回退路径（后续加载时会处理）
  const fallbackPath = candidates[candidates.length - 1];
  console.warn(`[dataset-adapter] 所有候选路径均不存在，使用回退路径: ${fallbackPath}`);
  return fallbackPath;
}

export async function loadDataset(
  adapter: DatasetAdapter,
  options?: LoadDatasetOptions
): Promise<UnifiedTestItem[]> {
  console.log(
    `[dataset-adapter] 开始加载数据集, 适配器: ${adapter.name}, 基础路径: ${adapter.basePath}`
  );
  console.log(
    `[dataset-adapter] 加载选项 - 最大样本数: ${options?.maxSamples ?? "无限制"}, 分类过滤: [${options?.categories?.join(",") ?? "无"}]`
  );

  const startTime = Date.now();

  // 注意：路径存在性检查已移至各适配器的 load 方法中，
  // 因为适配器现在支持多路径回退，不再依赖固定的 basePath
  console.log(`[dataset-adapter] 数据集基础路径: ${adapter.basePath}`);

  const items = await adapter.load(options);
  console.log(`[dataset-adapter] 原始数据加载完成, 条目数: ${items.length}`);

  const validation = adapter.validate(items);
  if (!validation.valid) {
    console.error(
      `[dataset-adapter] 数据集验证失败, 错误数: ${validation.errors.length}`
    );
    for (const err of validation.errors.slice(0, 10)) {
      console.error(`[dataset-adapter] 验证错误: ${err}`);
    }
    if (validation.errors.length > 10) {
      console.error(
        `[dataset-adapter] ... 还有 ${validation.errors.length - 10} 条错误未显示`
      );
    }
    throw new Error(
      `数据集 "${adapter.name}" 验证失败，共 ${validation.errors.length} 条错误`
    );
  }
  console.log(`[dataset-adapter] 数据集验证通过`);

  if (options?.categories && options.categories.length > 0) {
    const beforeFilter = items.length;
    const filtered = items.filter((item) =>
      options.categories!.includes(item.category)
    );
    console.log(
      `[dataset-adapter] 按分类过滤, 过滤前: ${beforeFilter}, 过滤后: ${filtered.length}, 保留分类: [${options.categories.join(",")}]`
    );
    const result = options.maxSamples
      ? filtered.slice(0, options.maxSamples)
      : filtered;
    if (options.maxSamples && filtered.length > options.maxSamples) {
      console.log(
        `[dataset-adapter] 按最大样本数截取, 截取前: ${filtered.length}, 截取后: ${options.maxSamples}`
      );
    }
    const duration = Date.now() - startTime;
    console.log(
      `[dataset-adapter] 数据集加载完成, 最终条目数: ${result.length}, 耗时: ${duration}ms`
    );
    return result;
  }

  const result = options?.maxSamples
    ? items.slice(0, options.maxSamples)
    : items;

  if (options?.maxSamples && items.length > options.maxSamples) {
    console.log(
      `[dataset-adapter] 按最大样本数截取, 截取前: ${items.length}, 截取后: ${options.maxSamples}`
    );
  }

  const duration = Date.now() - startTime;
  console.log(
    `[dataset-adapter] 数据集加载完成, 最终条目数: ${result.length}, 耗时: ${duration}ms`
  );

  const categoryDistribution: Record<string, number> = {};
  for (const item of result) {
    categoryDistribution[item.category] =
      (categoryDistribution[item.category] ?? 0) + 1;
  }
  console.log(
    `[dataset-adapter] 分类分布: ${JSON.stringify(categoryDistribution)}`
  );

  const difficultyDistribution: Record<string, number> = {};
  for (const item of result) {
    difficultyDistribution[item.difficulty] =
      (difficultyDistribution[item.difficulty] ?? 0) + 1;
  }
  console.log(
    `[dataset-adapter] 难度分布: ${JSON.stringify(difficultyDistribution)}`
  );

  return result;
}

export function readJsonFilesFromDir(dirPath: string): unknown[] {
  console.log(`[dataset-adapter] 读取目录中的JSON文件: ${dirPath}`);

  if (!fs.existsSync(dirPath)) {
    console.warn(`[dataset-adapter] 目录不存在: ${dirPath}`);
    return [];
  }

  const stat = fs.statSync(dirPath);
  if (stat.isFile()) {
    if (dirPath.endsWith(".json") || dirPath.endsWith(".jsonl")) {
      console.log(`[dataset-adapter] 读取单个文件: ${dirPath}`);
      const content = fs.readFileSync(dirPath, "utf-8");
      try {
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        console.log(`[dataset-adapter] 文件解析完成, 条目数: ${items.length}`);
        return items;
      } catch (parseError) {
        console.error(`[dataset-adapter] JSON解析失败: ${dirPath}`, parseError);
        return [];
      }
    }
    console.warn(`[dataset-adapter] 文件不是JSON格式: ${dirPath}`);
    return [];
  }

  const allData: unknown[] = [];
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".json"));

  console.log(`[dataset-adapter] 发现 ${files.length} 个JSON文件`);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    console.log(`[dataset-adapter] 读取文件: ${file}`);

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      allData.push(...items);
      console.log(`[dataset-adapter] 文件 ${file} 解析完成, 条目数: ${items.length}`);
    } catch (parseError) {
      console.error(`[dataset-adapter] 文件解析失败: ${file}`, parseError);
    }
  }

  console.log(
    `[dataset-adapter] 目录读取完成, 总条目数: ${allData.length}`
  );
  return allData;
}
