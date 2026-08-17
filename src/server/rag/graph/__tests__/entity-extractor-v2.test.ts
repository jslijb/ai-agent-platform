import { describe, it, expect } from "vitest";
import {
  parseEnhancedTriplesFromResponse,
  mapRelationType,
  splitTextIntoSegments,
} from "../entity-extractor-v2";

describe("entity-extractor-v2", () => {
  describe("parseEnhancedTriplesFromResponse", () => {
    it("should parse valid JSON array", () => {
      const content = JSON.stringify([
        { head: "五粮液", relation: "营业收入", tail: "832亿元", value: "增长5.2%" },
        { head: "格力电器", relation: "净利润", tail: "285亿元" },
      ]);

      const triples = parseEnhancedTriplesFromResponse(content);
      expect(triples.length).toBe(2);
      expect(triples[0].head).toBe("五粮液");
      expect(triples[0].value).toBe("增长5.2%");
      expect(triples[1].head).toBe("格力电器");
    });

    it("should parse JSON in code block", () => {
      const content = "```json\n[{\"head\": \"五粮液\", \"relation\": \"生产\", \"tail\": \"白酒\"}]\n```";
      const triples = parseEnhancedTriplesFromResponse(content);
      expect(triples.length).toBe(1);
      expect(triples[0].head).toBe("五粮液");
    });

    it("should skip triples with amount as head entity", () => {
      const content = JSON.stringify([
        { head: "12.67%", relation: "增长", tail: "营业收入" },
        { head: "五粮液", relation: "生产", tail: "白酒" },
      ]);

      const triples = parseEnhancedTriplesFromResponse(content);
      expect(triples.length).toBe(1);
      expect(triples[0].head).toBe("五粮液");
    });

    it("should inline amount tail as value", () => {
      const content = JSON.stringify([
        { head: "五粮液", relation: "HAS_REVENUE", tail: "832亿元" },
      ]);

      const triples = parseEnhancedTriplesFromResponse(content);
      expect(triples.length).toBe(1);
      expect(triples[0].tailType).toBe("Amount");
      expect(triples[0].value).toBe("832亿元");
    });

    it("should return empty array for invalid JSON", () => {
      const triples = parseEnhancedTriplesFromResponse("not json at all");
      expect(triples.length).toBe(0);
    });

    it("should return empty array for non-array JSON", () => {
      const triples = parseEnhancedTriplesFromResponse('{"key": "value"}');
      expect(triples.length).toBe(0);
    });

    it("should skip items with missing required fields", () => {
      const content = JSON.stringify([
        { head: "五粮液" },
        { head: "格力电器", relation: "生产", tail: "空调" },
      ]);

      const triples = parseEnhancedTriplesFromResponse(content);
      expect(triples.length).toBe(1);
    });

    it("should produce duplicate triples for identical inputs (dedup is in extractEnhancedTriples)", () => {
      const content = JSON.stringify([
        { head: "五粮液", relation: "HAS_REVENUE", tail: "营业收入", value: "832亿元" },
        { head: "五粮液", relation: "HAS_REVENUE", tail: "营业收入", value: "832亿元" },
      ]);

      const triples = parseEnhancedTriplesFromResponse(content);
      expect(triples.length).toBe(2);
      expect(triples[0].relationType).toBe("HAS_REVENUE");
    });
  });

  describe("mapRelationType", () => {
    it("should map known Chinese relations", () => {
      expect(mapRelationType("营业收入")).toBe("HAS_REVENUE");
      expect(mapRelationType("净利润")).toBe("HAS_PROFIT");
      expect(mapRelationType("持股")).toBe("OWNS_SHARE");
      expect(mapRelationType("位于")).toBe("LOCATED_IN");
      expect(mapRelationType("生产")).toBe("PRODUCES");
      expect(mapRelationType("合作")).toBe("COOPERATES_WITH");
      expect(mapRelationType("竞争")).toBe("COMPETES_WITH");
      expect(mapRelationType("投资")).toBe("INVESTS_IN");
      expect(mapRelationType("供应")).toBe("SUPPLIES");
      expect(mapRelationType("研发")).toBe("DEVELOPS");
      expect(mapRelationType("发布")).toBe("RELEASES");
    });

    it("should pass through V2 relation types", () => {
      expect(mapRelationType("HAS_REVENUE")).toBe("HAS_REVENUE");
      expect(mapRelationType("HAS_PROFIT")).toBe("HAS_PROFIT");
      expect(mapRelationType("HAS_INDICATOR")).toBe("HAS_INDICATOR");
    });

    it("should fallback to RELATED_TO for unknown relations", () => {
      expect(mapRelationType("未知关系")).toBe("RELATED_TO");
    });

    it("should do partial matching", () => {
      expect(mapRelationType("营收增长")).toBe("HAS_REVENUE");
      expect(mapRelationType("净利润增长")).toBe("HAS_PROFIT");
    });
  });

  describe("splitTextIntoSegments", () => {
    it("should return single segment for short text", () => {
      const segments = splitTextIntoSegments("短文本", 1500);
      expect(segments.length).toBe(1);
      expect(segments[0]).toBe("短文本");
    });

    it("should split at sentence boundaries", () => {
      const text = "第一句话。第二句话。第三句话。第四句话。";
      const segments = splitTextIntoSegments(text, 10);
      expect(segments.length).toBeGreaterThan(1);
    });

    it("should not produce empty segments", () => {
      const text = "a".repeat(3000);
      const segments = splitTextIntoSegments(text, 1500);
      for (const seg of segments) {
        expect(seg.length).toBeGreaterThan(0);
      }
    });
  });
});