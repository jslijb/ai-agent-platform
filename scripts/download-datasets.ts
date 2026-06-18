/**
 * 金融评估数据集下载脚本
 *
 * 从魔塔社区（ModelScope）和其他来源下载三个金融评估数据集：
 * - CFLUE: 中文金融语言理解评估数据集
 * - FinEval: 金融多选题评估数据集
 * - FinQA: 金融数值推理评估数据集
 *
 * 存储路径：D:\data\modelscope
 *
 * 使用方式：
 *   npx tsx scripts/download-datasets.ts           # 下载所有数据集
 *   npx tsx scripts/download-datasets.ts CFLUE      # 只下载 CFLUE
 *   npx tsx scripts/download-datasets.ts FinEval    # 只下载 FinEval
 *   npx tsx scripts/download-datasets.ts FinQA      # 只下载 FinQA
 *
 * 注意：
 * - CFLUE 在魔塔社区可用，但需要 modelscope SDK 下载（Python 包）
 * - FinEval 和 FinQA 在魔塔社区不可用，需从 GitHub/HuggingFace 下载
 * - 本脚本仅使用 Node.js 内置 API，不安装额外 npm 包
 */

import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

// ==================== 配置 ====================

/** 数据集根目录 */
const DATA_BASE_DIR = "D:\\data\\modelscope";

/** 数据集配置 */
interface DatasetConfig {
  name: string;
  description: string;
  targetDir: string;
  source: "modelscope" | "github" | "huggingface";
  /** 魔塔社区数据集 ID（如 tongyi_dianjin/CFLUE） */
  modelscopeId?: string;
  /** GitHub 仓库地址 */
  githubRepo?: string;
  /** HuggingFace 数据集 ID */
  huggingfaceId?: string;
  /** 数据集大小（估算） */
  estimatedSize: string;
  /** 数据格式 */
  format: string;
}

const DATASETS: DatasetConfig[] = [
  {
    name: "CFLUE",
    description: "中文金融语言理解评估数据集 - 阿里云通义点金与苏州大学联合推出",
    targetDir: path.join(DATA_BASE_DIR, "CFLUE"),
    source: "modelscope",
    modelscopeId: "tongyi_dianjin/CFLUE",
    estimatedSize: "~66MB",
    format: "JSON/JSONL（含知识评估多选题 + 应用评估NLP任务）",
  },
  {
    name: "FinEval",
    description: "金融多选题评估数据集 - 上海财经大学 SUFE-AIFLM-Lab 出品",
    targetDir: path.join(DATA_BASE_DIR, "FinEval"),
    source: "github",
    githubRepo: "https://github.com/SUFE-AIFLM-Lab/FinEval.git",
    estimatedSize: "~50MB",
    format: "CSV/RAR（含4,661道金融多选题，覆盖34个学科）",
  },
  {
    name: "FinQA",
    description: "金融数值推理评估数据集 - 需结合表格数据进行数值推理",
    targetDir: path.join(DATA_BASE_DIR, "FinQA"),
    source: "huggingface",
    huggingfaceId: "dreamerde/finqa",
    estimatedSize: "~30MB",
    format: "JSON（含问题、表格、答案、推理步骤）",
  },
];

// ==================== 日志工具 ====================

function logInfo(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [INFO] ${message}`);
}

function logWarn(message: string): void {
  const timestamp = new Date().toISOString();
  console.warn(`[${timestamp}] [WARN] ${message}`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [ERROR] ${message}`);
}

function logSeparator(): void {
  console.log("=".repeat(70));
}

// ==================== 目录操作 ====================

/** 确保目录存在，不存在则创建 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logInfo(`创建目录: ${dirPath}`);
  } else {
    logInfo(`目录已存在: ${dirPath}`);
  }
}

/** 检查目录是否非空（判断数据集是否已下载） */
function isDirNonEmpty(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;
  const entries = fs.readdirSync(dirPath);
  return entries.length > 0;
}

// ==================== 下载功能 ====================

/**
 * 下载 CFLUE 数据集（魔塔社区）
 *
 * CFLUE 在魔塔社区的数据集 ID 为 tongyi_dianjin/CFLUE
 * 由于需要 modelscope Python SDK 下载，本脚本输出下载命令供手动执行
 * 同时尝试使用 git clone 方式下载
 */
async function downloadCFLUE(config: DatasetConfig): Promise<boolean> {
  logSeparator();
  logInfo(`开始下载 ${config.name}: ${config.description}`);
  logInfo(`目标路径: ${config.targetDir}`);
  logInfo(`数据集大小: ${config.estimatedSize}`);
  logInfo(`数据格式: ${config.format}`);

  ensureDir(config.targetDir);

  // 检查是否已下载
  if (isDirNonEmpty(config.targetDir)) {
    logWarn(`${config.name} 目录已存在数据，跳过下载。如需重新下载，请先清空目录。`);
    return true;
  }

  // 方式1：尝试使用 git clone 从魔塔社区下载
  const gitUrl = `https://www.modelscope.cn/datasets/${config.modelscopeId}.git`;
  logInfo(`尝试 git clone 方式下载: ${gitUrl}`);

  try {
    child_process.execSync(`git clone --depth 1 "${gitUrl}" "${config.targetDir}"`, {
      stdio: "inherit",
      timeout: 300000, // 5分钟超时
    });
    logInfo(`${config.name} 通过 git clone 下载成功`);

    // 下载后转换数据格式
    await convertCFLUEFormat(config.targetDir);
    return true;
  } catch (gitError) {
    logWarn(`git clone 方式下载失败，尝试其他方式`);
  }

  // 方式2：使用 modelscope SDK 下载（需要 Python 环境）
  logInfo("git clone 失败，请使用以下 Python 命令手动下载：");
  console.log("");
  console.log("  # 激活 conda 环境");
  console.log("  conda activate agent");
  console.log("");
  console.log("  # 安装 modelscope（如未安装）");
  console.log("  pip install modelscope");
  console.log("");
  console.log("  # 下载 CFLUE 数据集");
  console.log(`  python -c "from modelscope.msdatasets import MsDataset; ds = MsDataset.load('${config.modelscopeId}'); print(f'下载完成，样本数: {len(ds)}')"`);
  console.log(`  # 或使用 snapshot_download：`);
  console.log(`  python -c "from modelscope.hub.snapshot_download import snapshot_download; snapshot_download('${config.modelscopeId}', cache_dir='${config.targetDir}')"`);
  console.log("");

  return false;
}

/**
 * 转换 CFLUE 数据格式为适配器期望的格式
 *
 * CFLUE 原始数据包含知识评估（多选题）和应用评估（NLP任务）
 * 适配器期望的格式：{ id, text, label, task_type, category?, difficulty? }
 */
async function convertCFLUEFormat(targetDir: string): Promise<void> {
  logInfo("开始转换 CFLUE 数据格式...");

  const convertedDir = path.join(targetDir, "converted");
  ensureDir(convertedDir);

  // 查找原始数据文件
  const jsonFiles = findFilesRecursive(targetDir, [".json", ".jsonl"])
    .filter(f => !f.includes("converted") && !f.includes(".git"));

  if (jsonFiles.length === 0) {
    logWarn("未找到可转换的 JSON/JSONL 文件");
    return;
  }

  logInfo(`找到 ${jsonFiles.length} 个原始数据文件`);

  let totalConverted = 0;

  for (const filePath of jsonFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let rawData: unknown[];

      if (filePath.endsWith(".jsonl")) {
        // JSONL 格式：每行一个 JSON 对象
        rawData = content
          .split("\n")
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      } else {
        // JSON 格式
        const parsed = JSON.parse(content);
        rawData = Array.isArray(parsed) ? parsed : [parsed];
      }

      // 转换为适配器期望的格式
      const converted = rawData
        .map((item: any, index: number) => {
          // CFLUE 原始数据格式多样，根据不同任务类型进行转换
          const convertedItem: Record<string, unknown> = {
            id: item.id ?? index + 1,
            text: item.text ?? item.question ?? item.content ?? "",
            label: item.label ?? item.answer ?? "",
            task_type: item.task_type ?? item.task_type_ ?? "classification",
          };

          if (item.category) convertedItem.category = item.category;
          if (item.difficulty) convertedItem.difficulty = item.difficulty;

          return convertedItem;
        })
        .filter(item => item.text && item.label);

      if (converted.length > 0) {
        const outputPath = path.join(convertedDir, path.basename(filePath, path.extname(filePath)) + ".json");
        fs.writeFileSync(outputPath, JSON.stringify(converted, null, 2), "utf-8");
        totalConverted += converted.length;
        logInfo(`转换文件 ${path.basename(filePath)}: ${converted.length} 条`);
      }
    } catch (parseError) {
      logWarn(`解析文件失败 ${path.basename(filePath)}: ${parseError}`);
    }
  }

  logInfo(`CFLUE 格式转换完成，共转换 ${totalConverted} 条数据，保存至 ${convertedDir}`);
}

/**
 * 下载 FinEval 数据集（GitHub）
 *
 * FinEval 在魔塔社区未找到可用版本
 * GitHub 仓库：https://github.com/SUFE-AIFLM-Lab/FinEval
 * 数据格式：CSV/RAR
 */
async function downloadFinEval(config: DatasetConfig): Promise<boolean> {
  logSeparator();
  logInfo(`开始下载 ${config.name}: ${config.description}`);
  logInfo(`目标路径: ${config.targetDir}`);
  logInfo(`数据集大小: ${config.estimatedSize}`);
  logInfo(`数据格式: ${config.format}`);
  logWarn(`⚠ ${config.name} 在魔塔社区未找到可用版本，将从 GitHub 下载`);

  ensureDir(config.targetDir);

  // 检查是否已下载
  if (isDirNonEmpty(config.targetDir)) {
    logWarn(`${config.name} 目录已存在数据，跳过下载。如需重新下载，请先清空目录。`);
    return true;
  }

  // 尝试 git clone
  logInfo(`尝试 git clone: ${config.githubRepo}`);

  try {
    child_process.execSync(`git clone --depth 1 "${config.githubRepo}" "${config.targetDir}"`, {
      stdio: "inherit",
      timeout: 300000,
    });
    logInfo(`${config.name} 通过 git clone 下载成功`);

    // 转换数据格式
    await convertFinEvalFormat(config.targetDir);
    return true;
  } catch (gitError) {
    logError(`git clone 下载失败: ${gitError}`);
  }

  // 备用方案：手动下载提示
  logInfo("自动下载失败，请手动下载：");
  console.log("");
  console.log(`  # 方式1：git clone`);
  console.log(`  git clone https://github.com/SUFE-AIFLM-Lab/FinEval.git "${config.targetDir}"`);
  console.log("");
  console.log(`  # 方式2：从 HuggingFace 下载`);
  console.log(`  # 访问 https://huggingface.co/datasets/SUFE-AIFLM-Lab/FinEval`);
  console.log(`  # 或使用 Python：`);
  console.log(`  conda activate agent`);
  console.log(`  pip install datasets`);
  console.log(`  python -c "from datasets import load_dataset; ds = load_dataset('SUFE-AIFLM-Lab/FinEval'); print(ds)"`);
  console.log("");

  return false;
}

/**
 * 转换 FinEval 数据格式为适配器期望的格式
 *
 * FinEval 原始数据为 CSV 格式，包含多选题
 * 适配器期望格式：{ id, question, A, B, C, D, answer, explanation?, category?, difficulty? }
 */
async function convertFinEvalFormat(targetDir: string): Promise<void> {
  logInfo("开始转换 FinEval 数据格式...");

  const convertedDir = path.join(targetDir, "converted");
  ensureDir(convertedDir);

  // 查找 CSV 文件
  const csvFiles = findFilesRecursive(targetDir, [".csv"])
    .filter(f => !f.includes("converted") && !f.includes(".git"));

  // 查找 RAR 文件（FinEval v2 数据为 RAR 压缩包）
  const rarFiles = findFilesRecursive(targetDir, [".rar"])
    .filter(f => !f.includes("converted") && !f.includes(".git"));

  if (rarFiles.length > 0) {
    logWarn(`发现 ${rarFiles.length} 个 RAR 压缩包，需要手动解压：`);
    for (const rarFile of rarFiles) {
      logWarn(`  ${rarFile}`);
    }
    console.log("");
    console.log("  # 请安装 7-Zip 或 WinRAR 后解压上述文件");
    console.log(`  # 解压到: ${targetDir}`);
    console.log("");
  }

  if (csvFiles.length === 0) {
    logWarn("未找到可转换的 CSV 文件（可能需要先解压 RAR 文件）");
    return;
  }

  logInfo(`找到 ${csvFiles.length} 个 CSV 文件`);

  let totalConverted = 0;

  for (const filePath of csvFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter(line => line.trim());

      if (lines.length < 2) continue;

      // 解析 CSV 表头
      const headers = parseCSVLine(lines[0]);
      const questionIdx = headers.findIndex(h => /question|题目|问题/i.test(h));
      const aIdx = headers.findIndex(h => /^A$|^option_a|选项A/i.test(h));
      const bIdx = headers.findIndex(h => /^B$|^option_b|选项B/i.test(h));
      const cIdx = headers.findIndex(h => /^C$|^option_c|选项C/i.test(h));
      const dIdx = headers.findIndex(h => /^D$|^option_d|选项D/i.test(h));
      const answerIdx = headers.findIndex(h => /answer|答案/i.test(h));
      const explanationIdx = headers.findIndex(h => /explanation|解释|解析/i.test(h));

      const converted = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 3) continue;

        const item: Record<string, unknown> = {
          id: i,
          question: questionIdx >= 0 ? values[questionIdx] : values[0],
          A: aIdx >= 0 ? values[aIdx] : (values[1] ?? ""),
          B: bIdx >= 0 ? values[bIdx] : (values[2] ?? ""),
          C: cIdx >= 0 ? values[cIdx] : (values[3] ?? ""),
          D: dIdx >= 0 ? values[dIdx] : (values[4] ?? ""),
          answer: answerIdx >= 0 ? values[answerIdx] : "",
        };

        if (explanationIdx >= 0 && values[explanationIdx]) {
          item.explanation = values[explanationIdx];
        }

        // 从文件路径推断 category
        const parentDirName = path.basename(path.dirname(filePath));
        if (parentDirName && parentDirName !== "data-v2" && parentDirName !== "data") {
          item.category = parentDirName;
        }

        item.difficulty = "medium";

        if (item.question && item.answer) {
          converted.push(item);
        }
      }

      if (converted.length > 0) {
        const outputPath = path.join(convertedDir, path.basename(filePath, ".csv") + ".json");
        fs.writeFileSync(outputPath, JSON.stringify(converted, null, 2), "utf-8");
        totalConverted += converted.length;
        logInfo(`转换文件 ${path.basename(filePath)}: ${converted.length} 条`);
      }
    } catch (parseError) {
      logWarn(`解析文件失败 ${path.basename(filePath)}: ${parseError}`);
    }
  }

  logInfo(`FinEval 格式转换完成，共转换 ${totalConverted} 条数据，保存至 ${convertedDir}`);
}

/**
 * 下载 FinQA 数据集（HuggingFace）
 *
 * FinQA 在魔塔社区（iic/finqa）存在但内容为空
 * HuggingFace 数据集 ID：dreamerde/finqa
 */
async function downloadFinQA(config: DatasetConfig): Promise<boolean> {
  logSeparator();
  logInfo(`开始下载 ${config.name}: ${config.description}`);
  logInfo(`目标路径: ${config.targetDir}`);
  logInfo(`数据集大小: ${config.estimatedSize}`);
  logInfo(`数据格式: ${config.format}`);
  logWarn(`⚠ ${config.name} 在魔塔社区（iic/finqa）内容为空，将从 HuggingFace 下载`);

  ensureDir(config.targetDir);

  // 检查是否已下载
  if (isDirNonEmpty(config.targetDir)) {
    logWarn(`${config.name} 目录已存在数据，跳过下载。如需重新下载，请先清空目录。`);
    return true;
  }

  // 方式1：从 HuggingFace 通过 API 下载原始数据文件
  const hfDatasetId = config.huggingfaceId!;
  logInfo(`尝试从 HuggingFace API 下载数据集: ${hfDatasetId}`);

  try {
    // 获取数据集文件列表
    const apiUrl = `https://huggingface.co/api/datasets/${hfDatasetId}`;
    const response = await fetch(apiUrl);

    if (response.ok) {
      const datasetInfo = await response.json() as any;
      logInfo(`HuggingFace 数据集信息获取成功: ${datasetInfo.id ?? hfDatasetId}`);

      // 尝试下载数据文件
      const siblings = datasetInfo?.siblings ?? [];
      const dataFiles = siblings.filter((f: any) =>
        f.rfilename?.endsWith(".json") ||
        f.rfilename?.endsWith(".jsonl") ||
        f.rfilename?.endsWith(".parquet")
      );

      if (dataFiles.length > 0) {
        logInfo(`找到 ${dataFiles.length} 个数据文件，开始下载...`);

        for (const file of dataFiles) {
          const fileName = file.rfilename;
          const downloadUrl = `https://huggingface.co/datasets/${hfDatasetId}/resolve/main/${fileName}`;
          const localPath = path.join(config.targetDir, fileName);

          // 确保子目录存在
          ensureDir(path.dirname(localPath));

          logInfo(`下载: ${fileName}`);
          try {
            const fileResponse = await fetch(downloadUrl);
            if (fileResponse.ok) {
              const buffer = Buffer.from(await fileResponse.arrayBuffer());
              fs.writeFileSync(localPath, buffer);
              logInfo(`下载完成: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
            } else {
              logWarn(`下载失败: ${fileName} (HTTP ${fileResponse.status})`);
            }
          } catch (downloadError) {
            logWarn(`下载文件失败 ${fileName}: ${downloadError}`);
          }
        }

        // 转换数据格式
        await convertFinQAFormat(config.targetDir);
        return true;
      } else {
        logWarn("HuggingFace API 未返回数据文件列表");
      }
    } else {
      logWarn(`HuggingFace API 请求失败: HTTP ${response.status}`);
    }
  } catch (apiError) {
    logWarn(`HuggingFace API 访问失败: ${apiError}`);
  }

  // 方式2：尝试直接下载已知的数据文件
  logInfo("尝试直接下载 FinQA 数据文件...");
  const knownFiles = [
    "train.json",
    "test.json",
    "dev.json",
    "data/train.json",
    "data/test.json",
    "data/dev.json",
  ];

  let downloadedAny = false;
  for (const fileName of knownFiles) {
    const downloadUrl = `https://huggingface.co/datasets/${hfDatasetId}/resolve/main/${fileName}`;
    const localPath = path.join(config.targetDir, path.basename(fileName));

    try {
      logInfo(`尝试下载: ${fileName}`);
      const fileResponse = await fetch(downloadUrl);
      if (fileResponse.ok) {
        const buffer = Buffer.from(await fileResponse.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        logInfo(`下载完成: ${fileName} (${(buffer.length / 1024).toFixed(1)} KB)`);
        downloadedAny = true;
      }
    } catch {
      // 忽略，继续尝试下一个文件
    }
  }

  if (downloadedAny) {
    await convertFinQAFormat(config.targetDir);
    return true;
  }

  // 备用方案：手动下载提示
  logInfo("自动下载失败，请手动下载：");
  console.log("");
  console.log("  # 方式1：使用 Python datasets 库（推荐）");
  console.log("  conda activate agent");
  console.log("  pip install datasets");
  console.log(`  python -c "from datasets import load_dataset; ds = load_dataset('${hfDatasetId}'); ds.save_to_disk('${config.targetDir}')"`);
  console.log("");
  console.log("  # 方式2：从 HuggingFace 网页下载");
  console.log(`  # 访问 https://huggingface.co/datasets/${hfDatasetId}`);
  console.log("");
  console.log("  # 方式3：使用 HuggingFace 镜像（国内加速）");
  console.log(`  # 设置环境变量: set HF_ENDPOINT=https://hf-mirror.com`);
  console.log(`  python -c "from datasets import load_dataset; ds = load_dataset('${hfDatasetId}'); ds.save_to_disk('${config.targetDir}')"`);
  console.log("");

  return false;
}

/**
 * 转换 FinQA 数据格式为适配器期望的格式
 *
 * FinQA 原始数据格式：{ id, question, table, answer, steps?, ... }
 * 适配器期望格式：{ id, question, table, answer, steps?, category?, difficulty? }
 */
async function convertFinQAFormat(targetDir: string): Promise<void> {
  logInfo("开始转换 FinQA 数据格式...");

  const convertedDir = path.join(targetDir, "converted");
  ensureDir(convertedDir);

  // 查找 JSON/JSONL 文件
  const jsonFiles = findFilesRecursive(targetDir, [".json", ".jsonl"])
    .filter(f => !f.includes("converted"));

  if (jsonFiles.length === 0) {
    logWarn("未找到可转换的 JSON/JSONL 文件");
    return;
  }

  logInfo(`找到 ${jsonFiles.length} 个数据文件`);

  let totalConverted = 0;

  for (const filePath of jsonFiles) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let rawData: unknown[];

      if (filePath.endsWith(".jsonl")) {
        rawData = content
          .split("\n")
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      } else {
        const parsed = JSON.parse(content);
        rawData = Array.isArray(parsed) ? parsed : [parsed];
      }

      // 转换为适配器期望的格式
      const converted = rawData
        .map((item: any, index: number) => {
          const convertedItem: Record<string, unknown> = {
            id: item.id ?? index + 1,
            question: item.question ?? item.q ?? "",
            answer: String(item.answer ?? item.ans ?? ""),
          };

          // 处理表格数据
          if (item.table) {
            convertedItem.table = item.table;
          } else if (item.pre_text || item.post_text) {
            // FinQA 原始格式可能包含 pre_text/post_text 而非 table
            convertedItem.table = item.table ?? [];
          }

          // 处理推理步骤
          if (item.steps || item.program) {
            convertedItem.steps = item.steps ?? [item.program];
          }

          convertedItem.category = "数值推理";
          convertedItem.difficulty = "medium";

          return convertedItem;
        })
        .filter(item => item.question);

      if (converted.length > 0) {
        const outputFileName = path.basename(filePath, path.extname(filePath)) + ".json";
        const outputPath = path.join(convertedDir, outputFileName);
        fs.writeFileSync(outputPath, JSON.stringify(converted, null, 2), "utf-8");
        totalConverted += converted.length;
        logInfo(`转换文件 ${path.basename(filePath)}: ${converted.length} 条`);
      }
    } catch (parseError) {
      logWarn(`解析文件失败 ${path.basename(filePath)}: ${parseError}`);
    }
  }

  logInfo(`FinQA 格式转换完成，共转换 ${totalConverted} 条数据，保存至 ${convertedDir}`);
}

// ==================== 工具函数 ====================

/** 递归查找指定扩展名的文件 */
function findFilesRecursive(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 跳过 .git 目录
      if (entry.name === ".git") continue;
      results.push(...findFilesRecursive(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }

  return results;
}

/** 简易 CSV 行解析器（处理引号内的逗号） */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// ==================== 主流程 ====================

async function main(): Promise<void> {
  logSeparator();
  logInfo("金融评估数据集下载工具");
  logInfo(`数据存储根目录: ${DATA_BASE_DIR}`);
  logSeparator();

  // 确保根目录存在
  ensureDir(DATA_BASE_DIR);

  // 解析命令行参数，确定要下载的数据集
  const args = process.argv.slice(2);
  const targetNames = args.length > 0 ? args.map(a => a.toUpperCase()) : null;

  const datasetsToDownload = targetNames
    ? DATASETS.filter(d => targetNames.includes(d.name.toUpperCase()))
    : DATASETS;

  if (datasetsToDownload.length === 0) {
    logError(`未找到指定的数据集。可用数据集: ${DATASETS.map(d => d.name).join(", ")}`);
    process.exit(1);
  }

  // 打印下载计划
  logInfo("下载计划：");
  for (const ds of datasetsToDownload) {
    logInfo(`  - ${ds.name}: ${ds.description}`);
    logInfo(`    来源: ${ds.source} | 大小: ${ds.estimatedSize} | 格式: ${ds.format}`);
    logInfo(`    目标: ${ds.targetDir}`);
  }
  logSeparator();

  // 逐个下载数据集
  const results: Record<string, boolean> = {};

  for (const ds of datasetsToDownload) {
    let success = false;
    try {
      switch (ds.source) {
        case "modelscope":
          success = await downloadCFLUE(ds);
          break;
        case "github":
          success = await downloadFinEval(ds);
          break;
        case "huggingface":
          success = await downloadFinQA(ds);
          break;
      }
    } catch (error) {
      logError(`下载 ${ds.name} 时发生错误: ${error}`);
      success = false;
    }
    results[ds.name] = success;
  }

  // 打印汇总报告
  logSeparator();
  logInfo("下载结果汇总：");
  for (const ds of datasetsToDownload) {
    const status = results[ds.name] ? "✅ 成功" : "❌ 失败（请查看上方手动下载命令）";
    logInfo(`  ${ds.name}: ${status}`);
  }
  logSeparator();

  // 输出需要安装的 Python 包
  const failedDatasets = datasetsToDownload.filter(ds => !results[ds.name]);
  if (failedDatasets.length > 0) {
    logInfo("部分数据集自动下载失败，需要以下 Python 包进行手动下载：");
    console.log("");
    console.log("  # 激活 conda 环境");
    console.log("  conda activate agent");
    console.log("");
    console.log("  # 安装必要的 Python 包");
    console.log("  pip install modelscope      # 用于从魔塔社区下载 CFLUE");
    console.log("  pip install datasets         # 用于从 HuggingFace 下载 FinQA");
    console.log("");
  }

  logInfo("数据集下载流程结束");

  // 输出适配器期望的数据格式说明
  logSeparator();
  logInfo("适配器期望的数据格式（转换后的 JSON 格式）：");
  console.log("");
  console.log("  CFLUE:  { id, text, label, task_type, category?, difficulty? }");
  console.log("  FinEval: { id, question, A, B, C, D, answer, explanation?, category?, difficulty? }");
  console.log("  FinQA:  { id, question, table, answer, steps?, category?, difficulty? }");
  console.log("");
  logInfo("转换后的数据保存在各数据集目录的 converted/ 子目录中");
}

// 执行主流程
main().catch(error => {
  logError(`脚本执行失败: ${error}`);
  process.exit(1);
});
