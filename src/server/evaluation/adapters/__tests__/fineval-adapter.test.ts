import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { finEvalAdapter } from "../fineval-adapter";
import { resolveDatasetPath, readJsonFilesFromDir } from "../../dataset-adapter";

// FinEval 测试数据
const mockFinEvalData = [
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

describe("finEvalAdapter", () => {
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
    it("应能从 tests/datasets/FinEval/test.json 加载数据", async () => {
      const items = await finEvalAdapter.load();

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
      const items = await finEvalAdapter.load();

      const categories = Array.from(new Set(items.map((item) => item.category)));
      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain("会计");
    }, 30000);
  });

  describe("load - 路径不存在时", () => {
    it("readJsonFilesFromDir 对不存在的路径应返回空数组", () => {
      const result = readJsonFilesFromDir("Z:\\nonexistent\\path\\that\\does\\not\\exist");
      expect(result).toEqual([]);
    });

    it("适配器对空数据应返回空数组", () => {
      const items = finEvalAdapter.transform([]);
      expect(items).toEqual([]);
    });
  });

  describe("transform - 数据转换", () => {
    it("应正确转换 FinEval 原始数据", () => {
      const items = finEvalAdapter.transform(mockFinEvalData);

      expect(items).toHaveLength(3);

      const firstItem = items[0];
      expect(firstItem.id).toBe("1");
      expect(firstItem.query).toContain("以下哪个指标用于衡量企业的偿债能力");
      expect(firstItem.query).toContain("A: 市盈率");
      expect(firstItem.query).toContain("B: 资产负债率");
      expect(firstItem.expectedAnswer).toContain("B:");
      expect(firstItem.expectedAnswer).toContain("资产负债率");
      expect(firstItem.category).toBe("金融专业知识");
      expect(firstItem.metadata?.answerLetter).toBe("B");
    });

    it("应正确映射分类", () => {
      const items = finEvalAdapter.transform(mockFinEvalData);

      expect(items[0].category).toBe("金融专业知识");
      expect(items[1].category).toBe("金融计算");
      expect(items[2].category).toBe("金融合规");
    });

    it("应包含解析说明", () => {
      const items = finEvalAdapter.transform(mockFinEvalData);

      expect(items[0].expectedAnswer).toContain("资产负债率是衡量企业偿债能力的核心指标");
      expect(items[0].metadata?.explanation).toBe("资产负债率是衡量企业偿债能力的核心指标");
    });

    it("应跳过缺少必填字段的数据", () => {
      const incompleteData = [
        { id: 1, question: "问题", A: "A", B: "B", C: "C" },
        { id: 2, A: "A", B: "B", C: "C", D: "D", answer: "A" },
      ];

      const items = finEvalAdapter.transform(incompleteData);
      expect(items).toHaveLength(0);
    });

    it("未映射的分类应保留原始值", () => {
      const data = [
        {
          id: 1,
          question: "测试问题",
          A: "选项A",
          B: "选项B",
          C: "选项C",
          D: "选项D",
          answer: "A",
          category: "custom_category",
        },
      ];

      const items = finEvalAdapter.transform(data);
      expect(items[0].category).toBe("custom_category");
    });
  });

  describe("validate - 数据验证", () => {
    it("有效数据应通过验证", () => {
      const items = finEvalAdapter.transform(mockFinEvalData);
      const result = finEvalAdapter.validate(items);

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

      const result = finEvalAdapter.validate(invalidItems);
      expect(result.valid).toBe(false);
    });
  });

  describe("resolveDatasetPath - 环境变量配置", () => {
    it("应通过 DATASET_BASE_PATH 环境变量配置路径", () => {
      const tmpBaseDir = path.join(os.tmpdir(), "test-fineval-dataset");
      const tmpDir = path.join(tmpBaseDir, "FinEval", "converted");
      fs.mkdirSync(tmpDir, { recursive: true });

      const testFile = path.join(tmpDir, "test.json");
      fs.writeFileSync(testFile, JSON.stringify(mockFinEvalData), "utf-8");

      process.env.DATASET_BASE_PATH = tmpBaseDir;

      const resolvedPath = resolveDatasetPath("FinEval");
      expect(resolvedPath).toContain("test-fineval-dataset");
      expect(resolvedPath).toContain("FinEval");
      expect(resolvedPath).toContain("converted");

      fs.rmSync(tmpBaseDir, { recursive: true, force: true });
    });

    it("环境变量路径不存在时应回退到 tests/datasets", () => {
      process.env.DATASET_BASE_PATH = "Z:\\nonexistent\\path";

      const resolvedPath = resolveDatasetPath("FinEval");
      expect(resolvedPath).toContain("tests");
      expect(resolvedPath).toContain("FinEval");
    });
  });

  describe("load - 分类过滤和样本限制", () => {
    it("应支持按分类过滤", async () => {
      const items = await finEvalAdapter.load({
        categories: ["金融专业知识"],
      });

      for (const item of items) {
        expect(item.category).toBe("金融专业知识");
      }
    }, 30000);

    it("应支持限制最大样本数", async () => {
      const items = await finEvalAdapter.load({
        maxSamples: 1,
      });

      expect(items.length).toBeLessThanOrEqual(1);
    }, 30000);
  });
});
