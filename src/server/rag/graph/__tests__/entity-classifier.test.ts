import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        execute: vi.fn(async () => [
          { stockNameShort: "五粮液", stockNameFull: "宜宾五粮液股份有限公司", stockCode: "000858" },
          { stockNameShort: "格力电器", stockNameFull: "珠海格力电器股份有限公司", stockCode: "000651" },
          { stockNameShort: "招商银行", stockNameFull: "招商银行股份有限公司", stockCode: "600036" },
        ]),
      })),
    })),
  },
}));

import {
  classifyEntity,
  isAmount,
  isIndicator,
  loadCompanyAliases,
  normalizeEntity,
  type EntityType,
} from "../entity-classifier";

describe("entity-classifier", () => {
  beforeEach(() => {
    loadCompanyAliases([
      { shortName: "五粮液", fullName: "宜宾五粮液股份有限公司", aliases: ["五粮液", "宜宾五粮液股份有限公司", "五粮液集团公司"] },
      { shortName: "格力电器", fullName: "珠海格力电器股份有限公司", aliases: ["格力", "格力电器", "珠海格力电器股份有限公司", "格力集团"] },
      { shortName: "招商银行", fullName: "招商银行股份有限公司", aliases: ["招商银行", "招商银行股份有限公司"] },
    ]);
  });

  describe("isAmount", () => {
    it("识别百分比数值", () => {
      expect(isAmount("12.67%")).toBe(true);
      expect(isAmount("-83,617,001.27")).toBe(true);
      expect(isAmount("1,711.18亿元")).toBe(true);
    });

    it("识别纯数字", () => {
      expect(isAmount("-12,937,000.29")).toBe(true);
      expect(isAmount("0.04%")).toBe(true);
      expect(isAmount("100.00%")).toBe(true);
    });

    it("不误判公司名", () => {
      expect(isAmount("五粮液")).toBe(false);
      expect(isAmount("格力电器")).toBe(false);
      expect(isAmount("营业收入")).toBe(false);
    });

    it("不误判指标名", () => {
      expect(isAmount("营业收入")).toBe(false);
      expect(isAmount("净利润")).toBe(false);
    });
  });

  describe("isIndicator", () => {
    it("识别常见指标", () => {
      expect(isIndicator("营业收入")).toBe(true);
      expect(isIndicator("净利润")).toBe(true);
      expect(isIndicator("毛利率")).toBe(true);
      expect(isIndicator("ROE")).toBe(true);
      expect(isIndicator("资产负债率")).toBe(true);
    });

    it("识别指标别名", () => {
      expect(isIndicator("营收")).toBe(true);
      expect(isIndicator("净利")).toBe(true);
      expect(isIndicator("归母净利润")).toBe(true);
    });

    it("不误判公司名", () => {
      expect(isIndicator("五粮液")).toBe(false);
      expect(isIndicator("格力电器")).toBe(false);
    });
  });

  describe("classifyEntity", () => {
    it("分类公司实体", () => {
      expect(classifyEntity("五粮液")).toBe("Company");
      expect(classifyEntity("格力电器")).toBe("Company");
      expect(classifyEntity("招商银行")).toBe("Company");
    });

    it("分类公司全称", () => {
      expect(classifyEntity("宜宾五粮液股份有限公司")).toBe("Company");
      expect(classifyEntity("珠海格力电器股份有限公司")).toBe("Company");
    });

    it("分类指标实体", () => {
      expect(classifyEntity("营业收入")).toBe("Indicator");
      expect(classifyEntity("净利润")).toBe("Indicator");
      expect(classifyEntity("ROE")).toBe("Indicator");
    });

    it("分类数值为Amount", () => {
      expect(classifyEntity("12.67%")).toBe("Amount");
      expect(classifyEntity("1,711.18亿元")).toBe("Amount");
      expect(classifyEntity("-83,617,001.27元")).toBe("Amount");
    });

    it("分类产品为Product", () => {
      expect(classifyEntity("第八代五粮液")).toBe("Product");
      expect(classifyEntity("TOSOT")).toBe("Product");
    });

    it("分类地点为Location", () => {
      expect(classifyEntity("宜宾")).toBe("Location");
      expect(classifyEntity("珠海")).toBe("Location");
      expect(classifyEntity("四川省")).toBe("Location");
    });

    it("默认分类为Entity", () => {
      expect(classifyEntity("某个未知实体")).toBe("Entity");
    });

    it("通过后缀识别公司名", () => {
      expect(classifyEntity("某某股份有限公司")).toBe("Company");
      expect(classifyEntity("某某有限责任公司")).toBe("Company");
      expect(classifyEntity("某某集团有限公司")).toBe("Company");
    });

    it("短后缀不误判", () => {
      expect(classifyEntity("公司")).toBe("Entity");
    });
  });

  describe("normalizeEntity", () => {
    it("归一化公司简称", () => {
      expect(normalizeEntity("五粮液")).toBe("五粮液");
      expect(normalizeEntity("格力")).toBe("格力电器");
    });

    it("归一化公司全称", () => {
      expect(normalizeEntity("宜宾五粮液股份有限公司")).toBe("五粮液");
      expect(normalizeEntity("珠海格力电器股份有限公司")).toBe("格力电器");
    });

    it("归一化公司集团名", () => {
      expect(normalizeEntity("五粮液集团公司")).toBe("五粮液");
      expect(normalizeEntity("格力集团")).toBe("格力电器");
    });

    it("非公司名不归一化", () => {
      expect(normalizeEntity("营业收入")).toBe("营业收入");
      expect(normalizeEntity("12.67%")).toBe("12.67%");
    });
  });
});