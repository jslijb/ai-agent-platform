import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { finQAAdapter } from "../finqa-adapter";
import { resolveDatasetPath, readJsonFilesFromDir } from "../../dataset-adapter";

// FinQA 测试数据
const mockFinQAData = [
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
    steps: [
      "Net profit = Revenue - Expenses",
      "1505.6 - 758.3 = 747.3",
    ],
  },
];

describe("finQAAdapter", () => {
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
    it("应能从 tests/datasets/FinQA/test.json 加载数据", async () => {
      const items = await finQAAdapter.load();

      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("query");
        expect(item).toHaveProperty("expectedAnswer");
        expect(item).toHaveProperty("category");
        expect(item).toHaveProperty("difficulty");
        expect(["easy", "medium", "hard"]).toContain(item.difficulty);
      }
    });

    it("加载的数据分类应为数值推理", async () => {
      const items = await finQAAdapter.load();

      for (const item of items) {
        expect(item.category).toBe("数值推理");
      }
    });
  });

  describe("load - 路径不存在时", () => {
    it("readJsonFilesFromDir 对不存在的路径应返回空数组", () => {
      const result = readJsonFilesFromDir("Z:\\nonexistent\\path\\that\\does\\not\\exist");
      expect(result).toEqual([]);
    });

    it("适配器对空数据应返回空数组", () => {
      const items = finQAAdapter.transform([]);
      expect(items).toEqual([]);
    });
  });

  describe("transform - 数据转换", () => {
    it("应正确转换 FinQA 原始数据", () => {
      const items = finQAAdapter.transform(mockFinQAData);

      expect(items).toHaveLength(2);

      const firstItem = items[0];
      expect(firstItem.id).toBe("1");
      expect(firstItem.query).toContain("What is the gross margin for 2023?");
      expect(firstItem.query).toContain("参考表格");
      expect(firstItem.expectedAnswer).toContain("15.92%");
      expect(firstItem.expectedAnswer).toContain("推理步骤");
      expect(firstItem.category).toBe("数值推理");
      expect(firstItem.difficulty).toBe("medium");
    });

    it("应正确格式化表格数据", () => {
      const items = finQAAdapter.transform(mockFinQAData);

      expect(items[0].query).toContain("Year");
      expect(items[0].query).toContain("Revenue");
      expect(items[0].query).toContain("COGS");
      expect(items[0].query).toContain("1505.6");
    });

    it("应正确处理推理步骤", () => {
      const items = finQAAdapter.transform(mockFinQAData);

      expect(items[0].expectedAnswer).toContain("→");
      expect(items[0].metadata?.steps).toEqual(mockFinQAData[0].steps);
    });

    it("没有推理步骤时应不包含步骤信息", () => {
      const dataWithoutSteps = [
        {
          id: 1,
          question: "简单问题",
          table: [["A", "B"], ["1", "2"]],
          answer: "3",
        },
      ];

      const items = finQAAdapter.transform(dataWithoutSteps);
      expect(items[0].expectedAnswer).toBe("3");
      expect(items[0].expectedAnswer).not.toContain("推理步骤");
    });

    it("应跳过缺少必填字段的数据", () => {
      const incompleteData = [
        { id: 1, question: "缺少答案" },
        { id: 2, answer: "缺少问题" },
      ];

      const items = finQAAdapter.transform(incompleteData);
      expect(items).toHaveLength(0);
    });

    it("空表格应显示(空表格)", () => {
      const dataWithEmptyTable = [
        {
          id: 1,
          question: "测试问题",
          table: [],
          answer: "测试答案",
        },
      ];

      const items = finQAAdapter.transform(dataWithEmptyTable);
      expect(items[0].query).toContain("(空表格)");
    });
  });

  describe("validate - 数据验证", () => {
    it("有效数据应通过验证", () => {
      const items = finQAAdapter.transform(mockFinQAData);
      const result = finQAAdapter.validate(items);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("缺少必填字段的数据应验证失败", () => {
      const invalidItems = [
        {
          id: "",
          query: "测试",
          expectedAnswer: "答案",
          category: "数值推理",
          difficulty: "medium" as const,
        },
      ];

      const result = finQAAdapter.validate(invalidItems);
      expect(result.valid).toBe(false);
    });
  });

  describe("resolveDatasetPath - 环境变量配置", () => {
    it("应通过 DATASET_BASE_PATH 环境变量配置路径", () => {
      const tmpBaseDir = path.join(os.tmpdir(), "test-finqa-dataset");
      const tmpDir = path.join(tmpBaseDir, "FinQA", "converted");
      fs.mkdirSync(tmpDir, { recursive: true });

      const testFile = path.join(tmpDir, "test.json");
      fs.writeFileSync(testFile, JSON.stringify(mockFinQAData), "utf-8");

      process.env.DATASET_BASE_PATH = tmpBaseDir;

      const resolvedPath = resolveDatasetPath("FinQA");
      expect(resolvedPath).toContain("test-finqa-dataset");
      expect(resolvedPath).toContain("FinQA");
      expect(resolvedPath).toContain("converted");

      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    });

    it("环境变量路径不存在时应回退到 tests/datasets", () => {
      process.env.DATASET_BASE_PATH = "Z:\\nonexistent\\path";

      const resolvedPath = resolveDatasetPath("FinQA");
      expect(resolvedPath).toContain("tests");
      expect(resolvedPath).toContain("FinQA");
    });
  });

  describe("load - 分类过滤和样本限制", () => {
    it("应支持按分类过滤", async () => {
      const items = await finQAAdapter.load({
        categories: ["数值推理"],
      });

      for (const item of items) {
        expect(item.category).toBe("数值推理");
      }
    });

    it("应支持限制最大样本数", async () => {
      const items = await finQAAdapter.load({
        maxSamples: 1,
      });

      expect(items.length).toBeLessThanOrEqual(1);
    });
  });
});
