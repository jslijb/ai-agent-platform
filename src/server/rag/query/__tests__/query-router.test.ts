/**
 * TDD 单测：query-router 意图识别（classifyIntent）
 *
 * 覆盖场景（基于 L1/L3/L4 评估场景）：
 *   1. 数值类 - 利润表/资产负债表/现金流量表/衍生指标
 *   2. 非数值类 - 技术指标/交易规则/合规/政策
 *   3. 混合 case - 数值+非数值关键词同时出现（数值优先）
 *   4. 边界 case - 空字符串、纯公司名
 *
 * 运行：npx vitest run src/server/rag/query/__tests__/query-router.test.ts
 */
import { describe, it, expect } from "vitest";
import { classifyIntent } from "../query-router";

describe("classifyIntent - 数值类（应路由到 SQL）", () => {
  it("利润表：营业收入", () => {
    const r = classifyIntent("片仔癀2025年营业收入是多少");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("营业收入");
    expect(r.matchedNonNumericKeywords).toHaveLength(0);
  });

  it("利润表：净利润+同比+增速", () => {
    const r = classifyIntent("五粮液净利润同比增速");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("净利润");
    expect(r.matchedNumericKeywords).toContain("同比");
    expect(r.matchedNumericKeywords).toContain("增速");
  });

  it("资产负债表：总资产+亿元", () => {
    const r = classifyIntent("格力电器总资产多少亿");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("总资产");
    expect(r.matchedNumericKeywords).toContain("亿");
  });

  it("资产负债表：资产负债率", () => {
    const r = classifyIntent("江苏银行资产负债率");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("资产负债率");
  });

  it("现金流量表：经营现金流", () => {
    const r = classifyIntent("华海药业经营现金流");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("经营现金流");
  });

  it("衍生指标：ROE", () => {
    const r = classifyIntent("片仔癀ROE是多少");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("ROE");
  });

  it("衍生指标：毛利率", () => {
    const r = classifyIntent("格力电器毛利率");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("毛利率");
  });

  it("每股收益：EPS", () => {
    const r = classifyIntent("中国长城EPS");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("EPS");
  });

  it("估值：市盈率", () => {
    const r = classifyIntent("五粮液市盈率多少");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("市盈率");
  });
});

describe("classifyIntent - 非数值类（应路由到向量检索）", () => {
  it("技术指标：K线形态", () => {
    const r = classifyIntent("贵州茅台K线形态分析");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNumericKeywords).toHaveLength(0);
    expect(r.matchedNonNumericKeywords).toContain("K线");
    expect(r.matchedNonNumericKeywords).toContain("形态");
  });

  it("技术指标：MACD金叉", () => {
    const r = classifyIntent("MACD金叉信号");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNonNumericKeywords).toContain("MACD");
    expect(r.matchedNonNumericKeywords).toContain("金叉");
  });

  it("交易规则：涨停跌停", () => {
    const r = classifyIntent("涨停跌停规则");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNonNumericKeywords).toContain("涨停");
    expect(r.matchedNonNumericKeywords).toContain("跌停");
  });

  it("合规：ST退市", () => {
    const r = classifyIntent("ST股票退市规则");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNonNumericKeywords).toContain("ST");
    expect(r.matchedNonNumericKeywords).toContain("退市");
  });

  it("政策：证监会监管", () => {
    const r = classifyIntent("证监会最新监管政策");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNonNumericKeywords).toContain("证监会");
    expect(r.matchedNonNumericKeywords).toContain("监管");
    expect(r.matchedNonNumericKeywords).toContain("政策");
  });

  it("资金流向：北向资金", () => {
    const r = classifyIntent("今日北向资金流入");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNonNumericKeywords).toContain("北向资金");
    expect(r.matchedNonNumericKeywords).toContain("资金流入");
  });
});

describe("classifyIntent - 混合 case（数值优先）", () => {
  it("营收+同比+压力位 → numeric（数值优先）", () => {
    const r = classifyIntent("片仔癀营收同比增长，是否突破压力位");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("营收");
    expect(r.matchedNumericKeywords).toContain("同比");
    expect(r.matchedNumericKeywords).toContain("增长");
    expect(r.matchedNonNumericKeywords).toContain("压力位");
  });

  it("ST+营收 → numeric（用户问营收数值，非问ST规则）", () => {
    const r = classifyIntent("ST国华2025年营收");
    expect(r.intent).toBe("numeric");
    expect(r.matchedNumericKeywords).toContain("营收");
    expect(r.matchedNonNumericKeywords).toContain("ST");
  });
});

describe("classifyIntent - 边界 case", () => {
  it("空字符串 → non_numeric", () => {
    const r = classifyIntent("");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNumericKeywords).toHaveLength(0);
    expect(r.matchedNonNumericKeywords).toHaveLength(0);
  });

  it("纯公司名（无数值/非数值关键词）→ non_numeric", () => {
    const r = classifyIntent("片仔癀");
    expect(r.intent).toBe("non_numeric");
    expect(r.matchedNumericKeywords).toHaveLength(0);
  });

  it("公司介绍类问题 → non_numeric", () => {
    const r = classifyIntent("介绍一下这家公司");
    expect(r.intent).toBe("non_numeric");
  });
});
