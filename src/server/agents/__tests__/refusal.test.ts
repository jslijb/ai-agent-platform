import { describe, it, expect } from "vitest";
import {
  COMPLIANCE_REFUSAL,
  OUT_OF_KNOWLEDGE_REFUSAL,
  classifyRefusal,
  isRefusalAnswer,
  normalizeRefusal,
} from "../refusal";

describe("R002 统一拒绝话语", () => {
  describe("常量", () => {
    it("合规拒绝话术与需求一致", () => {
      expect(COMPLIANCE_REFUSAL).toBe(
        "非常抱歉，您问的问题受国家政策、法规影响，我回答不了，换一个问题。"
      );
    });

    it("库外拒绝话术与需求一致", () => {
      expect(OUT_OF_KNOWLEDGE_REFUSAL).toBe(
        "不好意思，您问的问题由于我的大脑知识储备不足，回答不了您的问题，不能影响您的投资决策。后续我会不断充实我的大脑知识储备。"
      );
    });

    it("两条话术可被 isRefusalAnswer 识别（评估器依赖）", () => {
      expect(isRefusalAnswer(COMPLIANCE_REFUSAL)).toBe(true);
      expect(isRefusalAnswer(OUT_OF_KNOWLEDGE_REFUSAL)).toBe(true);
    });
  });

  describe("classifyRefusal - 类型判定", () => {
    it("识别合规拒绝", () => {
      expect(classifyRefusal(COMPLIANCE_REFUSAL)).toBe("compliance");
      expect(classifyRefusal("根据合规要求，我无法提供具体的投资建议")).toBe("compliance");
      expect(classifyRefusal("该问题违反《证券法》相关规定，我无法回答")).toBe("compliance");
    });

    it("识别库外拒绝", () => {
      expect(classifyRefusal(OUT_OF_KNOWLEDGE_REFUSAL)).toBe("out_of_knowledge");
      expect(classifyRefusal("无法回答该问题")).toBe("out_of_knowledge");
      expect(classifyRefusal("知识库未包含该数据")).toBe("out_of_knowledge");
      expect(classifyRefusal("未找到相关数据")).toBe("out_of_knowledge");
    });

    it("非拒绝内容返回 null", () => {
      expect(classifyRefusal("贵州茅台2025年营业收入为405.29亿元")).toBeNull();
      expect(classifyRefusal("")).toBeNull();
    });
  });

  describe("isRefusalAnswer - 新旧表述识别", () => {
    it("识别历史表述", () => {
      expect(isRefusalAnswer("无法回答该问题")).toBe(true);
      expect(isRefusalAnswer("抱歉，我无法提供")).toBe(true);
      expect(isRefusalAnswer("未包含该数据")).toBe(true);
      expect(isRefusalAnswer("基于文档内容无法获取")).toBe(true);
    });

    it("不误伤正常答案", () => {
      expect(isRefusalAnswer("贵州茅台2025年营业收入为405.29亿元，同比增长10%")).toBe(false);
      expect(isRefusalAnswer("")).toBe(false);
    });
  });

  describe("normalizeRefusal - 归一化", () => {
    it("短合规拒绝 → 合规规范话术", () => {
      expect(normalizeRefusal("根据政策法规要求，我无法回答")).toBe(COMPLIANCE_REFUSAL);
    });

    it("短库外/泛化拒绝 → 库外规范话术", () => {
      expect(normalizeRefusal("无法回答该问题")).toBe(OUT_OF_KNOWLEDGE_REFUSAL);
      expect(normalizeRefusal("知识库未包含该数据")).toBe(OUT_OF_KNOWLEDGE_REFUSAL);
    });

    it("非拒绝回答原样返回", () => {
      const answer = "贵州茅台2025年营业收入为405.29亿元，同比增长10%。";
      expect(normalizeRefusal(answer)).toBe(answer);
    });

    it("超过 maxLength 的拒绝回答不覆盖（可能夹带数据）", () => {
      const long =
        "非常抱歉，我无法提供具体的投资建议。以下为该公司的客观财务数据参考：营业收入405.29亿元，净利润201.24亿元，净资产收益率12.3%，资产负债率45.6%，市盈率18.5倍，市净率2.3倍，股息率1.2%。以上数据仅供参考，不构成任何投资建议，请以公司最新公告为准。";
      expect(normalizeRefusal(long)).toBe(long);
      expect(normalizeRefusal(long, 200)).toBe(COMPLIANCE_REFUSAL);
    });
  });
});
