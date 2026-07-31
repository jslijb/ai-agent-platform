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
import { describe, it, expect, vi, beforeEach } from "vitest";

// ===== Mock DB 层（避免连接真实数据库）=====
// 必须在 import query-router 之前 mock，因为 query-router 顶层 import db
vi.mock("@/server/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
  },
  sql: vi.fn(),
}));

// Mock schema（避免 drizzle 类型问题）
vi.mock("@/server/db/schema", () => ({
  stockMapping: {},
  indicatorAliases: {},
  financialIncome: {},
  financialBalancesheet: {},
  financialCashflow: {},
  financialIndicators: {},
  financialRawTables: {},
}));

import { classifyIntent, identifyCompany, identifyIndicators, routeQuery } from "../query-router";
import { db } from "@/server/db/client";

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

// ===== 3.2 公司名识别 + 指标识别（mock DB）=====

// 测试数据：10 家样本公司
const MOCK_COMPANIES = [
  { stockCode: "600436", stockNameShort: "片仔癀", stockNameFull: "漳州片仔癀药业股份有限公司", stockNameAlias: ["片仔癀药业"] },
  { stockCode: "600521", stockNameShort: "华海药业", stockNameFull: "浙江华海药业股份有限公司", stockNameAlias: ["华海"] },
  { stockCode: "000858", stockNameShort: "五粮液", stockNameFull: "宜宾五粮液股份有限公司", stockNameAlias: ["五粮液集团"] },
  { stockCode: "000651", stockNameShort: "格力电器", stockNameFull: "珠海格力电器股份有限公司", stockNameAlias: ["格力"] },
  { stockCode: "600919", stockNameShort: "江苏银行", stockNameFull: "江苏银行股份有限公司", stockNameAlias: ["JSBank"] },
];

// 测试数据：指标别名
const MOCK_ALIASES = [
  { standardName: "revenue", standardTable: "financial_income", aliasList: ["营业收入", "营收", "营业总收入", "主营业务收入"] },
  { standardName: "net_profit", standardTable: "financial_income", aliasList: ["净利润", "归母净利润", "归属母公司净利润"] },
  { standardName: "total_assets", standardTable: "financial_balancesheet", aliasList: ["总资产", "资产总计", "资产总额"] },
  { standardName: "net_margin", standardTable: "financial_income", aliasList: ["净利率", "销售净利率"] },
];

// Mock db.select().from() 返回的数据
function mockSelectFrom(mockData: any[]) {
  return (db.select as any).mockImplementation(() => ({
    from: vi.fn(() => mockData),
  }));
}

describe("identifyCompany - 公司名识别", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("精确匹配 stock_name_short", async () => {
    mockSelectFrom(MOCK_COMPANIES);
    const r = await identifyCompany("片仔癀2025年营业收入是多少");
    expect(r).not.toBeNull();
    expect(r!.stockCode).toBe("600436");
    expect(r!.stockNameShort).toBe("片仔癀");
    expect(r!.matchedBy).toBe("exact");
  });

  it("别名匹配 stock_name_alias", async () => {
    mockSelectFrom(MOCK_COMPANIES);
    const r = await identifyCompany("格力最新财报");
    expect(r).not.toBeNull();
    expect(r!.stockCode).toBe("000651");
    expect(r!.matchedBy).toBe("alias");
  });

  it("未命中返回 null", async () => {
    mockSelectFrom(MOCK_COMPANIES);
    const r = await identifyCompany("某未知公司");
    expect(r).toBeNull();
  });
});

describe("identifyIndicators - 指标识别", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("匹配单指标：营业收入", async () => {
    mockSelectFrom(MOCK_ALIASES);
    const r = await identifyIndicators("片仔癀2025年营业收入是多少");
    expect(r).toHaveLength(1);
    expect(r[0].standardName).toBe("revenue");
    expect(r[0].standardTable).toBe("financial_income");
  });

  it("匹配多指标：营收+净利润", async () => {
    mockSelectFrom(MOCK_ALIASES);
    const r = await identifyIndicators("片仔癀2025年营业收入和净利润");
    expect(r.length).toBeGreaterThanOrEqual(2);
    const names = r.map((i) => i.standardName);
    expect(names).toContain("revenue");
    expect(names).toContain("net_profit");
  });

  it("长 alias 优先（避免'净利润'误匹配'归母净利润'）", async () => {
    mockSelectFrom(MOCK_ALIASES);
    const r = await identifyIndicators("归母净利润");
    expect(r).toHaveLength(1);
    expect(r[0].standardName).toBe("net_profit");
    expect(r[0].matchedAlias).toBe("归母净利润");
  });

  it("未命中返回空数组", async () => {
    mockSelectFrom(MOCK_ALIASES);
    const r = await identifyIndicators("这家公司怎么样");
    expect(r).toHaveLength(0);
  });
});

// ===== 3.4 路由整合（mock DB）=====

describe("routeQuery - 路由整合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("非数值类 → vector 路由", async () => {
    const r = await routeQuery("片仔癀的K线形态分析");
    expect(r.intent).toBe("non_numeric");
    expect(r.route).toBe("vector");
  });

  it("技术指标 → vector 路由", async () => {
    const r = await routeQuery("格力电器MACD金叉");
    expect(r.intent).toBe("non_numeric");
    expect(r.route).toBe("vector");
  });

  it("数值类未命中公司 → vector fallback", async () => {
    mockSelectFrom([]); // 空公司表
    const r = await routeQuery("某公司2025年营收");
    expect(r.intent).toBe("numeric");
    expect(r.route).toBe("vector");
  });

  it("数值类命中公司+指标+SQL有数据 → sql_standard", async () => {
    // identifyCompany: db.select().from() → 直接返回公司数组
    // identifyIndicators: db.select().from() → 直接返回指标数组
    // executeSqlQuery → queryFinancialTable: db.select().from().where() → 返回数据
    let callCount = 0;
    (db.select as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // identifyCompany: 返回 { from: () => array }
        return { from: vi.fn(() => MOCK_COMPANIES) };
      } else if (callCount === 2) {
        // identifyIndicators: 返回 { from: () => array }
        return { from: vi.fn(() => MOCK_ALIASES) };
      } else {
        // executeSqlQuery → queryFinancialTable: 返回 { from: () => { where: () => array } }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => [{ revenue: "9001000000", netProfit: "2143000000" }]),
          })),
        };
      }
    });
    const r = await routeQuery("片仔癀2025年营业收入");
    expect(r.intent).toBe("numeric");
    expect(r.company?.stockCode).toBe("600436");
    expect(r.indicators.length).toBeGreaterThan(0);
    expect(r.route).toBe("sql_standard");
    expect(r.sqlResult).toBeDefined();
    expect(r.sqlResult!.length).toBeGreaterThan(0);
  });

  it("数值类命中公司但SQL无数据 → vector fallback", async () => {
    let callCount = 0;
    (db.select as any).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: vi.fn(() => MOCK_COMPANIES) };
      } else if (callCount === 2) {
        return { from: vi.fn(() => MOCK_ALIASES) };
      } else {
        // SQL 返回空
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => []),
          })),
        };
      }
    });
    const r = await routeQuery("片仔癀2025年营业收入");
    expect(r.intent).toBe("numeric");
    expect(r.company).toBeDefined();
    expect(r.route).toBe("vector");
  });
});
