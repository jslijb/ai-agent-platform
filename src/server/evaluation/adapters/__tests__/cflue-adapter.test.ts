import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { cflueAdapter } from "../cflue-adapter";
import { resolveDatasetPath, readJsonFilesFromDir } from "../../dataset-adapter";

// CFLUE 测试数据
const mockCFLUEData = [
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

describe("cflueAdapter", () => {
  // 保存原始环境变量
  const originalEnv = process.env.DATASET_BASE_PATH;

  beforeEach(() => {
    delete process.env.DATASET_BASE_PATH;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DATASET_BASE_PATH = originalEnv;
    } else {
      delete process.env.DATASET_BASE_PATH;
    }
  });

  describe("load - 从默认路径加载", () => {
    it("应能从 tests/datasets/CFLUE/test.json 加载数据", async () => {
      const items = await cflueAdapter.load();

      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("query");
        expect(item).toHaveProperty("expectedAnswer");
        expect(item).toHaveProperty("category");
        expect(item).toHaveProperty("difficulty");
        expect(["easy", "medium", "hard"]).toContain(item.difficulty);
      }
    }, 30000);

    it("加载的数据应包含正确的分类映射", async () => {
      const items = await cflueAdapter.load();

      const categories = Array.from(new Set(items.map((item) => item.category)));
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain("金融文本分类");
    }, 30000);
  });

  describe("load - 路径不存在时", () => {
    it("readJsonFilesFromDir 对不存在的路径应返回空数组", () => {
      const result = readJsonFilesFromDir("Z:\\nonexistent\\path\\that\\does\\not\\exist");
      expect(result).toEqual([]);
    });

    it("适配器对空数据应返回空数组", () => {
      // 直接测试 transform 对空数据的处理
      const items = cflueAdapter.transform([]);
      expect(items).toEqual([]);
    });
  });

  describe("transform - 数据转换", () => {
    it("应正确转换 CFLUE 原始数据", () => {
      const items = cflueAdapter.transform(mockCFLUEData);

      expect(items).toHaveLength(3);

      const firstItem = items[0];
      expect(firstItem.id).toBe("1");
      expect(firstItem.query).toContain("请判断以下金融文本的类别");
      expect(firstItem.query).toContain("央行宣布下调MLF利率10个基点");
      expect(firstItem.expectedAnswer).toBe("货币政策");
      expect(firstItem.category).toBe("金融文本分类");
      expect(firstItem.difficulty).toBe("medium");
      expect(firstItem.metadata?.rawLabel).toBe("monetary_policy");
      expect(firstItem.metadata?.taskType).toBe("classification");
    });

    it("应正确映射情感标签", () => {
      const items = cflueAdapter.transform(mockCFLUEData);
      const sentimentItem = items[1];

      expect(sentimentItem.expectedAnswer).toBe("正面");
      expect(sentimentItem.category).toBe("金融情感分析");
    });

    it("应跳过缺少必填字段的数据", () => {
      const incompleteData = [
        { id: 1, text: "缺少标签", task_type: "classification" },
        { id: 2, label: "positive", task_type: "sentiment" },
        { id: 3, text: "缺少任务类型", label: "positive" },
      ];

      const items = cflueAdapter.transform(incompleteData);
      expect(items).toHaveLength(0);
    });

    it("未映射的标签应保留原始值", () => {
      const data = [
        {
          id: 1,
          text: "测试文本",
          label: "unknown_label",
          task_type: "unknown_type",
        },
      ];

      const items = cflueAdapter.transform(data);
      expect(items[0].expectedAnswer).toBe("unknown_label");
      expect(items[0].category).toBe("unknown_type");
    });
  });

  describe("validate - 数据验证", () => {
    it("有效数据应通过验证", () => {
      const items = cflueAdapter.transform(mockCFLUEData);
      const result = cflueAdapter.validate(items);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("缺少必填字段的数据应验证失败", () => {
      const invalidItems = [
        {
          id: "",
          query: "测试",
          expectedAnswer: "答案",
          category: "分类",
          difficulty: "medium" as const,
        },
      ];

      const result = cflueAdapter.validate(invalidItems);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("无效的 difficulty 应验证失败", () => {
      const invalidItems = [
        {
          id: "1",
          query: "测试",
          expectedAnswer: "答案",
          category: "分类",
          difficulty: "invalid" as any,
        },
      ];

      const result = cflueAdapter.validate(invalidItems);
      expect(result.valid).toBe(false);
    });
  });

  describe("resolveDatasetPath - 环境变量配置", () => {
    it("应通过 DATASET_BASE_PATH 环境变量配置路径", () => {
      // 创建临时目录模拟完整数据集路径
      const tmpBaseDir = path.join(os.tmpdir(), "test-cflue-dataset");
      const tmpDir = path.join(tmpBaseDir, "CFLUE", "converted");
      fs.mkdirSync(tmpDir, { recursive: true });

      const testFile = path.join(tmpDir, "test.json");
      fs.writeFileSync(testFile, JSON.stringify(mockCFLUEData), "utf-8");

      process.env.DATASET_BASE_PATH = tmpBaseDir;

      const resolvedPath = resolveDatasetPath("CFLUE");
      expect(resolvedPath).toContain("test-cflue-dataset");
      expect(resolvedPath).toContain("CFLUE");
      expect(resolvedPath).toContain("converted");

      // 清理临时目录
      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    });

    it("环境变量路径不存在时应回退到 tests/datasets", () => {
      process.env.DATASET_BASE_PATH = "Z:\\nonexistent\\path";

      const resolvedPath = resolveDatasetPath("CFLUE");
      // 应回退到 tests/datasets/CFLUE/test.json
      expect(resolvedPath).toContain("tests");
      expect(resolvedPath).toContain("CFLUE");
    });
  });

  describe("load - 分类过滤和样本限制", () => {
    it("应支持按分类过滤", async () => {
      const items = await cflueAdapter.load({
        categories: ["金融文本分类"],
      });

      for (const item of items) {
        expect(item.category).toBe("金融文本分类");
      }
    }, 30000);

    it("应支持限制最大样本数", async () => {
      const items = await cflueAdapter.load({
        maxSamples: 1,
      });

      expect(items.length).toBeLessThanOrEqual(1);
    }, 30000);
  });
});
