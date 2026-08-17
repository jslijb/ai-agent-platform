import { describe, it, expect } from "vitest";
import { tokenize, extractHeaderText, computeBM25Score } from "../bm25-utils";

describe("raw-table-search", () => {
  describe("tokenize", () => {
    it("should split Chinese text into tokens", () => {
      const tokens = tokenize("应收账款账龄分布");
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should filter stop words", () => {
      const tokens = tokenize("请问 一下 是什么");
      expect(tokens.length).toBe(0);
    });

    it("should filter short tokens", () => {
      const tokens = tokenize("a b cd");
      expect(tokens).toEqual(["cd"]);
    });

    it("should handle punctuation", () => {
      const tokens = tokenize("应收账款，账龄分布");
      expect(tokens.length).toBeGreaterThan(0);
    });

    it("should return empty for empty string", () => {
      expect(tokenize("")).toEqual([]);
      expect(tokenize("  ")).toEqual([]);
    });
  });

  describe("extractHeaderText", () => {
    it("should extract from headers array", () => {
      const result = extractHeaderText({ headers: ["账龄", "金额", "比例"] });
      expect(result).toBe("账龄 金额 比例");
    });

    it("should extract from first row", () => {
      const result = extractHeaderText({
        rows: [["1年以内", "100万", "30%"], ["1-2年", "50万", "15%"]],
      });
      expect(result).toContain("1年以内");
    });

    it("should extract from header field", () => {
      const result = extractHeaderText({ header: "应收账款账龄分析" });
      expect(result).toBe("应收账款账龄分析");
    });

    it("should return empty for null/undefined", () => {
      expect(extractHeaderText(null)).toBe("");
      expect(extractHeaderText(undefined)).toBe("");
      expect(extractHeaderText({})).toBe("");
    });

    it("should return empty for non-object", () => {
      expect(extractHeaderText("string")).toBe("");
      expect(extractHeaderText(123)).toBe("");
    });
  });

  describe("computeBM25Score", () => {
    it("should return higher score for better matches", () => {
      const queryTokens = ["应收账款", "账龄"];
      const dfMap = new Map<string, number>();
      dfMap.set("应收账款", 5);
      dfMap.set("账龄", 3);

      const score1 = computeBM25Score(queryTokens, "应收账款账龄分布", "账龄 金额", 10, 100, dfMap);
      const score2 = computeBM25Score(queryTokens, "无形资产摊销", "资产 年限", 10, 100, dfMap);

      expect(score1).toBeGreaterThan(score2);
    });

    it("should return 0 for no matches", () => {
      const queryTokens = ["应收账款"];
      const dfMap = new Map<string, number>();
      dfMap.set("应收账款", 1);

      const score = computeBM25Score(queryTokens, "固定资产", "折旧 年限", 10, 100, dfMap);
      expect(score).toBe(0);
    });

    it("should handle empty query tokens", () => {
      const score = computeBM25Score([], "test", "test", 10, 100, new Map());
      expect(score).toBe(0);
    });

    it("should handle partial matches", () => {
      const queryTokens = ["应收"];
      const dfMap = new Map<string, number>();
      dfMap.set("应收", 2);

      const score = computeBM25Score(queryTokens, "应收账款", "金额", 10, 100, dfMap);
      expect(score).toBeGreaterThan(0);
    });
  });
});