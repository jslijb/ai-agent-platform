import { describe, it, expect } from "vitest";
import {
  calculateTokenBudget,
  formatUserProfileForPrompt,
  type UserProfile,
  type TokenBudget,
} from "@/server/agents/memory";

describe("路径1: 记忆上下文组装 → Agent 系统提示注入", () => {
  describe("calculateTokenBudget — 各窗口大小", () => {
    it("I1.4: 4K模型 Token 预算 L3 裁剪", () => {
      const budget = calculateTokenBudget(4096);
      expect(budget.inputBudget).toBe(3072);
      expect(budget.l3Budget).toBeLessThan(500);
      expect(budget.l1Budget).toBeGreaterThan(0);
      expect(budget.l2Budget).toBeGreaterThan(0);
    });

    it("32K模型 Token 预算", () => {
      const budget = calculateTokenBudget(32768);
      expect(budget.inputBudget).toBe(24576);
      expect(budget.l1Budget).toBeGreaterThan(5000);
      expect(budget.l4DynamicBudget).toBeGreaterThan(1000);
    });

    it("128K模型 Token 预算", () => {
      const budget = calculateTokenBudget(131072);
      expect(budget.inputBudget).toBe(98304);
      expect(budget.l1Budget).toBeGreaterThan(20000);
    });

    it("1M模型 Token 预算", () => {
      const budget = calculateTokenBudget(1048576);
      expect(budget.inputBudget).toBeGreaterThan(700000);
      expect(budget.l1Budget).toBeGreaterThan(200000);
    });

    it("预算比例验证：L1=30%, L2=25%, L3=25%, L4=10%, Buffer=10%", () => {
      const budget = calculateTokenBudget(32768);
      const fixedOverhead = 1500;
      const remaining = budget.inputBudget - fixedOverhead;

      const l1Pct = budget.l1Budget / remaining;
      const l2Pct = budget.l2Budget / remaining;
      const l3Pct = budget.l3Budget / remaining;
      const l4Pct = budget.l4DynamicBudget / remaining;
      const bufPct = budget.bufferBudget / remaining;

      expect(l1Pct).toBeCloseTo(0.30, 1);
      expect(l2Pct).toBeCloseTo(0.25, 1);
      expect(l3Pct).toBeCloseTo(0.25, 1);
      expect(l4Pct).toBeCloseTo(0.10, 1);
      expect(bufPct).toBeCloseTo(0.10, 1);
    });

    it("总预算不超过 inputBudget", () => {
      for (const size of [4096, 8192, 32768, 131072, 1048576]) {
        const budget = calculateTokenBudget(size);
        const total = budget.l1Budget + budget.l2Budget + budget.l3Budget +
          budget.l4DynamicBudget + budget.bufferBudget + 1500;
        expect(total).toBeLessThanOrEqual(budget.inputBudget + 100);
      }
    });
  });

  describe("formatUserProfileForPrompt — L4画像格式化", () => {
    it("I1.3: 完整画像格式化", () => {
      const profile: UserProfile = {
        id: "test",
        userId: "user-001",
        scope: "personal",
        preferences: { sectorFocus: "白酒", infoStyle: "详细" },
        frequentStocks: [
          { code: "000858", name: "五粮液", queryCount: 15, lastQueriedAt: "2026-05-29" },
        ],
        riskProfile: "moderate",
        investmentStyle: "value",
        customNotes: [{ key: "stop_loss", value: "止损线5%", updatedAt: "2026-05-01" }],
      };
      const result = formatUserProfileForPrompt(profile);
      expect(result).toContain("[用户画像]");
      expect(result).toContain("白酒");
      expect(result).toContain("稳健型");
      expect(result).toContain("价值投资");
      expect(result).toContain("五粮液");
      expect(result).toContain("止损线5%");
    });

    it("I1.2: 空画像返回空字符串", () => {
      const profile: UserProfile = {
        id: "test",
        userId: "user-new",
        scope: "personal",
        preferences: {},
        frequentStocks: [],
        riskProfile: null,
        investmentStyle: null,
        customNotes: [],
      };
      const result = formatUserProfileForPrompt(profile);
      expect(result).toBe("");
    });

    it("I1.3b: 仅偏好的画像", () => {
      const profile: UserProfile = {
        id: "test",
        userId: "user-002",
        scope: "personal",
        preferences: { sectorFocus: "新能源" },
        frequentStocks: [],
        riskProfile: null,
        investmentStyle: null,
        customNotes: [],
      };
      const result = formatUserProfileForPrompt(profile);
      expect(result).toContain("[用户画像]");
      expect(result).toContain("新能源");
      expect(result).not.toContain("风险偏好");
      expect(result).not.toContain("投资风格");
    });

    it("常用股票最多5只", () => {
      const profile: UserProfile = {
        id: "test",
        userId: "user-003",
        scope: "personal",
        preferences: {},
        frequentStocks: [
          { code: "000858", name: "五粮液", queryCount: 15, lastQueriedAt: "2026-05-29" },
          { code: "000066", name: "中国长城", queryCount: 10, lastQueriedAt: "2026-05-28" },
          { code: "000651", name: "格力电器", queryCount: 8, lastQueriedAt: "2026-05-27" },
          { code: "600036", name: "招商银行", queryCount: 5, lastQueriedAt: "2026-05-26" },
          { code: "600519", name: "贵州茅台", queryCount: 4, lastQueriedAt: "2026-05-25" },
          { code: "000001", name: "平安银行", queryCount: 3, lastQueriedAt: "2026-05-24" },
        ],
        riskProfile: null,
        investmentStyle: null,
        customNotes: [],
      };
      const result = formatUserProfileForPrompt(profile);
      const stockNames = ["五粮液", "中国长城", "格力电器", "招商银行", "贵州茅台"];
      for (const name of stockNames) {
        expect(result).toContain(name);
      }
      expect(result).not.toContain("平安银行");
    });

    it("风险偏好中文映射", () => {
      const profiles = [
        { risk: "conservative", expected: "保守型" },
        { risk: "moderate", expected: "稳健型" },
        { risk: "aggressive", expected: "激进型" },
      ];
      for (const { risk, expected } of profiles) {
        const profile: UserProfile = {
          id: "test", userId: "user-001", scope: "personal",
          preferences: {}, frequentStocks: [],
          riskProfile: risk, investmentStyle: null, customNotes: [],
        };
        const result = formatUserProfileForPrompt(profile);
        expect(result).toContain(expected);
      }
    });
  });
});