import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isRefusalAnswer,
  evaluateNumericalAccuracy,
  evaluateRiskDisclosure,
  evaluateTimeliness,
  evaluateRefusalAccuracy,
} from "../rag-evaluator";

describe("isRefusalAnswer", () => {
  it("detects refusal patterns", () => {
    expect(isRefusalAnswer("无法回答该问题")).toBe(true);
    expect(isRefusalAnswer("抱歉，我无法提供")).toBe(true);
    expect(isRefusalAnswer("我不知道")).toBe(true);
    expect(isRefusalAnswer("没有相关信息")).toBe(true);
  });

  it("does not flag normal answers", () => {
    expect(isRefusalAnswer("中国能建2025年营业收入约为3865亿元")).toBe(false);
    expect(isRefusalAnswer("RSI指标用于判断超买超卖")).toBe(false);
  });

  it("handles empty input", () => {
    expect(isRefusalAnswer("")).toBe(false);
    expect(isRefusalAnswer("   ")).toBe(false);
  });
});

describe("evaluateNumericalAccuracy", () => {
  it("returns 1 for exact match", () => {
    const score = evaluateNumericalAccuracy(
      "营业收入3865亿元",
      "营业收入3865亿元",
      true
    );
    expect(score).toBe(1);
  });

  it("returns 0 for refusal when canAnswer=true", () => {
    const score = evaluateNumericalAccuracy(
      "无法回答该问题",
      "营业收入3865亿元",
      true
    );
    expect(score).toBe(0);
  });

  it("returns null for correct refusal when canAnswer=false", () => {
    const score = evaluateNumericalAccuracy(
      "无法回答该问题",
      "营业收入3865亿元",
      false
    );
    expect(score).toBeNull();
  });

  it("returns 1 when expected has no numbers", () => {
    const score = evaluateNumericalAccuracy(
      "这是一种技术指标",
      "这是一种技术指标",
      true
    );
    expect(score).toBe(1);
  });
});

describe("evaluateRiskDisclosure", () => {
  it("returns null for refusal when canAnswer=true", () => {
    const score = evaluateRiskDisclosure(
      "无法回答",
      "L1-事实提取",
      true
    );
    expect(score).toBeNull();
  });

  it("returns 1 for non-investment category", () => {
    const score = evaluateRiskDisclosure(
      "营业收入为3865亿元",
      "L1-事实提取",
      true
    );
    expect(score).toBe(1);
  });

  it("returns null for correct refusal when canAnswer=false", () => {
    const score = evaluateRiskDisclosure(
      "无法回答",
      "L8-对抗性",
      false
    );
    expect(score).toBeNull();
  });
});

describe("evaluateTimeliness", () => {
  it("returns null for refusal when canAnswer=true", () => {
    const score = evaluateTimeliness(
      "无法回答",
      [],
      true
    );
    expect(score).toBeNull();
  });

  it("returns 0.5 when no dates found", () => {
    const score = evaluateTimeliness(
      "这是一种技术指标",
      [{ text: "技术指标说明", score: 0.8 }],
      true
    );
    expect(score).toBe(0.5);
  });
});

describe("evaluateRefusalAccuracy", () => {
  it("calculates correct refusal accuracy", () => {
    const results = [
      { canAnswer: true, actualAnswer: "营业收入3865亿元" },
      { canAnswer: false, actualAnswer: "无法回答" },
      { canAnswer: true, actualAnswer: "抱歉无法提供" },
      { canAnswer: false, actualAnswer: "这是投资建议" },
    ];
    const accuracy = evaluateRefusalAccuracy(results);
    expect(accuracy).toBe(0.5);
  });

  it("returns 1 for all correct", () => {
    const results = [
      { canAnswer: true, actualAnswer: "营业收入3865亿元" },
      { canAnswer: false, actualAnswer: "无法回答" },
    ];
    const accuracy = evaluateRefusalAccuracy(results);
    expect(accuracy).toBe(1);
  });
});